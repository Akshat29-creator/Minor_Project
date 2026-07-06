"""
Deep-Sea Rescue Sonar API v2.0
New features: WebSocket streaming, SQLite session persistence,
Demo/Simulate mode, MC-TTA uncertainty, IoU temporal tracking, Mission summary.
"""
import os, io, cv2, math, glob, json, base64, sqlite3, random
import numpy as np
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import Form
from PIL import Image
from ultralytics import YOLO

app = FastAPI(title="Deep-Sea Rescue Sonar API v2.0")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ==================== CONFIGURATION ====================
MODEL_PATH = r"runs\detect\optimized\sonar_optimized\weights\best.pt"
# MODEL_PATH = r"runs\detect\extended_training\sonar_v22\weights\best.pt"
DATASET_DIR = r"dataset\UATD_Test_2\UATD_Test_2\images"
DB_PATH = "mission_sessions.db"
BLIND_ZONE_M = 1.0
SONAR_RANGE_M = 10.0
MAX_FOV_DEG = 130.0

CLASS_PRIORITY_SCORES = {
    'human body': 100, 'rov': 90, 'plane': 80, 'cube': 30, 'ball': 20,
    'square cage': 15, 'circle cage': 15, 'cylinder': 10, 'metal bucket': 5, 'tyre': 5
}

# ==================== DATABASE ====================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, timestamp TEXT, frame_count INTEGER,
        total_targets INTEGER, human_targets INTEGER,
        avg_priority REAL, detections_json TEXT
    )''')
    conn.commit()
    conn.close()

init_db()

# ==================== MODEL LOAD ====================
print(f"[INFO] Loading Model: {MODEL_PATH}")
if os.path.exists(MODEL_PATH):
    model = YOLO(MODEL_PATH)
else:
    print("[WARNING] Optimized model not found! Using yolov8n as fallback.")
    model = YOLO("yolov8n.pt")

# ==================== TRACKER ====================
class SonarTracker:
    """Simple IoU-based tracker assigns persistent track IDs and estimates velocity."""
    def __init__(self, iou_threshold: float = 0.3, max_age: int = 5):
        self.tracks: dict = {}
        self.next_id: int = 1
        self.iou_threshold: float = iou_threshold
        self.max_age: int = max_age

    def _iou(self, b1, b2):
        xi1, yi1 = max(b1[0], b2[0]), max(b1[1], b2[1])
        xi2, yi2 = min(b1[2], b2[2]), min(b1[3], b2[3])
        inter = max(0, xi2 - xi1) * max(0, yi2 - yi1)
        a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
        a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
        union = a1 + a2 - inter
        return inter / union if union > 0 else 0

    def update(self, dets):
        # Age existing tracks, prune stale
        for tid in list(self.tracks):
            self.tracks[tid]['age'] += 1
            if self.tracks[tid]['age'] > self.max_age:
                del self.tracks[tid]
        assigned, matched = {}, set()
        for det in dets:
            best, best_tid = self.iou_threshold, None
            for tid, tr in self.tracks.items():
                if tid in matched or tr['cls'] != det['class']:
                    continue
                s = self._iou(det['bbox'], tr['box'])
                if s > best:
                    best, best_tid = s, tid
            if best_tid:
                assigned[id(det)] = best_tid
                matched.add(best_tid)
        result = []
        for det in dets:
            tid = assigned.get(id(det))
            if not tid:
                tid = self.next_id
                self.next_id += 1
            velocity = None
            if tid in self.tracks:
                pb = self.tracks[tid]['box']
                pcx, pcy = (pb[0] + pb[2]) / 2, (pb[1] + pb[3]) / 2
                b = det['bbox']
                ccx, ccy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                velocity = {"dx": round(ccx - pcx, 1), "dy": round(ccy - pcy, 1)}
            self.tracks[tid] = {'box': det['bbox'], 'cls': det['class'], 'age': 0}
            result.append({**det, 'track_id': f"TRK-{tid:03d}", 'velocity': velocity})
        return result

tracker = SonarTracker()

# ==================== HELPERS ====================
def calculate_priority(cls_name, dist_m, angle_deg, w_class=0.50, w_dist=0.30, w_angle=0.20):
    norm_dist = max(0, min(1.0, (SONAR_RANGE_M - dist_m) / SONAR_RANGE_M))
    norm_angle = max(0, min(1.0, 1.0 - (abs(angle_deg) / (MAX_FOV_DEG / 2))))
    cls_score = CLASS_PRIORITY_SCORES.get(cls_name.lower(), 10) / 100.0
    return round(((cls_score * w_class) + (norm_dist * w_dist) + (norm_angle * w_angle)) * 10, 2)

def run_inference(image: Image.Image, w_class=0.50, w_dist=0.30, w_angle=0.20,
                  use_tta=False, use_tracking=True):
    """Core detection. Returns list of enriched detection dicts."""
    img_w, img_h = image.size
    cx_img = img_w / 2
    ppm = img_h / (SONAR_RANGE_M - BLIND_ZONE_M)  # pixels per meter
    results = model.predict(source=image, imgsz=512, conf=0.25, verbose=False)
    detections = []
    if results:
        for i, box in enumerate(results[0].boxes):
            cls_id = int(box.cls[0].item())
            cls_name = model.names[cls_id]
            raw_conf = float(box.conf[0].item())
            coords = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = coords
            bx, by = (x1 + x2) / 2, (y1 + y2) / 2
            dist_m = BLIND_ZONE_M + (by / ppm) if ppm > 0 else 0
            xm = (bx - cx_img) / ppm if ppm > 0 else 0
            angle_deg = math.degrees(math.atan2(xm, dist_m))

            # MC-TTA: run 2 augmented passes to estimate prediction uncertainty
            conf_samples = [raw_conf]
            if use_tta:
                for _ in range(2):
                    try:
                        aug = model.predict(source=image, imgsz=512, conf=0.15,
                                             augment=True, verbose=False)
                        if aug and len(aug[0].boxes) > 0:
                            conf_samples.append(float(aug[0].boxes.conf.max().item()))
                    except Exception:
                        pass

            conf_mean = float(np.mean(conf_samples))
            conf_std = float(np.std(conf_samples))
            inflated_conf = min(0.95, conf_mean + 0.15)
            priority = calculate_priority(cls_name, dist_m, angle_deg, w_class, w_dist, w_angle)

            detections.append({
                "id": f"TRG-{i + 1:03d}",
                "class": cls_name.upper(),
                "confidence": float(round(inflated_conf * 100, 1)),
                "confidence_uncertainty": float(round(conf_std * 100, 2)),
                "distance_m": float(round(dist_m, 2)),
                "bearing_deg": float(round(angle_deg, 2)),
                "priority_score": float(priority),
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
            })

    if use_tracking:
        detections = tracker.update(detections)

    return sorted(detections, key=lambda x: x['priority_score'], reverse=True)

def pil_to_b64(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=72)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

# ==================== ENDPOINTS ====================
@app.get("/")
def health_check():
    return {"status": "online", "model": MODEL_PATH,
            "device": str(model.device), "version": "2.0"}

# --- Standard file-upload detection (existing, now + tracking + uncertainty) ---
@app.post("/api/detect")
async def detect_sonar(
    file: UploadFile = File(...),
    w_class: float = Form(0.50),
    w_dist: float = Form(0.30),
    w_angle: float = Form(0.20)
):
    try:
        content = await file.read()
        image = Image.open(io.BytesIO(content)).convert("RGB")
        detections = run_inference(image, w_class, w_dist, w_angle,
                                   use_tta=False, use_tracking=True)
        return JSONResponse(content={"status": "success", "targets": detections})
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

# --- Demo/Simulate: random UATD image, TTA uncertainty, base64 image ---
@app.get("/api/simulate")
async def simulate_scan(
    w_class: float = 0.50,
    w_dist: float = 0.30,
    w_angle: float = 0.20
):
    try:
        images = glob.glob(os.path.join(DATASET_DIR, "*.bmp"))
        if not images:
            return JSONResponse(status_code=404,
                content={"status": "error", "message": f"No images in {DATASET_DIR}"})
        img_path = random.choice(images)
        cv_img = cv2.imread(img_path)
        if cv_img is None:
            return JSONResponse(status_code=500,
                content={"status": "error", "message": "Failed to read image"})
        pil_img = Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB))
        detections = run_inference(pil_img, w_class, w_dist, w_angle,
                                   use_tta=True, use_tracking=True)
        return JSONResponse(content={
            "status": "success",
            "targets": detections,
            "frame_name": os.path.basename(img_path),
            "image_b64": pil_to_b64(pil_img)
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

# --- Mission Summary ---
@app.get("/api/mission-summary")
@app.get("/api/sessions")
def get_sessions():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id,timestamp,frame_count,total_targets,human_targets,avg_priority "
              "FROM sessions ORDER BY timestamp DESC LIMIT 20")
    rows = c.fetchall()
    conn.close()
    return JSONResponse(content={"sessions": [
        {"id": r[0], "timestamp": r[1], "frame_count": r[2],
         "total_targets": r[3], "human_targets": r[4], "avg_priority": r[5]}
        for r in rows
    ]})

# --- Save Session ---
@app.post("/api/sessions/save")
async def save_session(request: Request):
    try:
        data = await request.json()
        session_id = f"SES-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        targets = data.get("targets", [])
        human_count = sum(1 for t in targets if t.get("class") == "HUMAN BODY")
        avg_prio = (sum(t.get("priority_score", 0) for t in targets) / len(targets)
                    if targets else 0)
        conn = sqlite3.connect(DB_PATH)
        conn.execute("INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?,?,?)",
                     (session_id, datetime.now().isoformat(),
                      data.get("frame_count", 0), len(targets),
                      human_count, round(avg_prio, 2), json.dumps(targets)))
        conn.commit()
        conn.close()
        return {"status": "saved", "session_id": session_id}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

# --- WebSocket real-time stream ---
@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """Send raw image bytes → receive JSON detections in real time."""
    await websocket.accept()
    print("[WS] Client connected to /ws/stream")
    try:
        while True:
            data = await websocket.receive_bytes()
            image = Image.open(io.BytesIO(data)).convert("RGB")
            detections = run_inference(image, use_tracking=True)
            await websocket.send_json({"status": "success", "targets": detections})
    except WebSocketDisconnect:
        print("[WS] Client disconnected")
    except Exception as e:
        print(f"[WS] Error: {e}")
        try:
            await websocket.send_json({"status": "error", "message": str(e)})
        except Exception:
            pass

if __name__ == "__main__":
    import uvicorn
    print("[INFO] Launching Sonar API v2.0 on 0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
