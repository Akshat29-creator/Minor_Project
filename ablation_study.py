"""
Ablation Study: Multi-Factor Priority Scoring (Equation 3)
Tests 5 weight configurations (α, β, γ) and measures their effect on
Human Body recall-at-top-1 — the most critical rescue metric.
Run from the srm-minor-project directory.
"""
import os, cv2, math
from itertools import product
from ultralytics import YOLO

MODEL_PATH = r"runs\detect\optimized\sonar_optimized\weights\best.pt"
TEST_DIR   = r"dataset\UATD_Test_2\UATD_Test_2\images"

BLIND_ZONE_M = 1.0
SONAR_RANGE_M = 10.0
MAX_FOV_DEG   = 130.0

CLASS_PRIORITY_SCORES = {
    'human body': 100, 'rov': 90, 'plane': 80, 'cube': 30, 'ball': 20,
    'square cage': 15, 'circle cage': 15, 'cylinder': 10, 'metal bucket': 5, 'tyre': 5
}

# ── Weight configurations to test ──
CONFIGS = [
    {"name": "Balanced",        "w_class": 0.50, "w_dist": 0.30, "w_angle": 0.20},
    {"name": "Class-Heavy",     "w_class": 0.80, "w_dist": 0.10, "w_angle": 0.10},
    {"name": "Proximity-Heavy", "w_class": 0.30, "w_dist": 0.60, "w_angle": 0.10},
    {"name": "Equal-Weight",    "w_class": 0.33, "w_dist": 0.34, "w_angle": 0.33},
    {"name": "Bearing-Heavy",   "w_class": 0.40, "w_dist": 0.20, "w_angle": 0.40},
]

def calculate_priority(cls_name, dist_m, angle_deg, w_class, w_dist, w_angle):
    nd = max(0, min(1, (SONAR_RANGE_M - dist_m) / SONAR_RANGE_M))
    na = max(0, min(1, 1.0 - abs(angle_deg) / (MAX_FOV_DEG / 2)))
    cs = CLASS_PRIORITY_SCORES.get(cls_name.lower(), 10) / 100.0
    return (cs * w_class + nd * w_dist + na * w_angle) * 10

def localize(cx, cy, img_w, img_h):
    ppm = img_h / (SONAR_RANGE_M - BLIND_ZONE_M)
    dist_m = BLIND_ZONE_M + (cy / ppm) if ppm > 0 else 0
    xm = (cx - img_w / 2) / ppm if ppm > 0 else 0
    return dist_m, math.degrees(math.atan2(xm, dist_m))

def run_ablation():
    if not os.path.exists(MODEL_PATH):
        print(f"[ERROR] Model not found: {MODEL_PATH}"); return
    if not os.path.exists(TEST_DIR):
        print(f"[ERROR] Test images not found: {TEST_DIR}"); return

    print("[INFO] Loading model..."); model = YOLO(MODEL_PATH)
    image_paths = [os.path.join(TEST_DIR, f) for f in os.listdir(TEST_DIR) if f.endswith(".bmp")][:50]
    print(f"[INFO] Running ablation on {len(image_paths)} images.\n")

    header = f"{'Config':<20} {'α':>6} {'β':>6} {'γ':>6} {'Human@#1%':>12} {'Avg_Priority':>14} {'Total_Det':>10}"
    print(header); print("-" * len(header))

    for cfg in CONFIGS:
        wc, wd, wa = cfg["w_class"], cfg["w_dist"], cfg["w_angle"]
        human_top1 = 0; total_det = 0; priority_sum = 0.0; frames_with_human = 0

        for img_path in image_paths:
            img = cv2.imread(img_path)
            if img is None: continue
            h, w = img.shape[:2]
            results = model(img, verbose=False)
            detections = []
            for r in results:
                for box in r.boxes:
                    cls_name = model.names[int(box.cls[0])]
                    x1, y1, x2, y2 = map(float, box.xyxy[0])
                    dist_m, ang = localize((x1+x2)/2, (y1+y2)/2, w, h)
                    p = calculate_priority(cls_name, dist_m, ang, wc, wd, wa)
                    detections.append({"class": cls_name, "priority": p})

            if not detections: continue
            detections.sort(key=lambda x: x["priority"], reverse=True)
            total_det += len(detections)
            priority_sum += detections[0]["priority"]
            has_human = any(d["class"].lower() == "human body" for d in detections)
            if has_human:
                frames_with_human += 1
                if detections[0]["class"].lower() == "human body":
                    human_top1 += 1

        top1_pct = (human_top1 / max(frames_with_human, 1)) * 100
        avg_p = priority_sum / max(len(image_paths), 1)
        print(f"{cfg['name']:<20} {wc:>6.2f} {wd:>6.2f} {wa:>6.2f} {top1_pct:>11.1f}% {avg_p:>14.3f} {total_det:>10}")

    print("\n[INFO] Ablation complete. Higher Human@#1% = better rescue prioritization.")

if __name__ == "__main__":
    run_ablation()
