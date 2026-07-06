"""
Preprocessing Benchmark: CLAHE vs. Histogram Equalization vs. Raw
Compares detection confidence distribution across 3 preprocessing modes on UATD Test_2.
Measures: avg confidence, # detections, detection rate — to quantify Stage 2 impact.
Run from the srm-minor-project directory.
"""
import os, cv2, json
import numpy as np
from ultralytics import YOLO

MODEL_PATH = r"runs\detect\optimized\sonar_optimized\weights\best.pt"
TEST_DIR   = r"dataset\UATD_Test_2\UATD_Test_2\images"
RESULTS_DIR = r"sonar_project_output\preprocess_benchmark"
MAX_IMAGES  = 80   # cap for speed

# ── Preprocessing functions ──
def preprocess_raw(img):
    """No preprocessing — raw BMP image direct to model."""
    return img

def preprocess_histeq(img):
    """Standard histogram equalization on the L channel (LAB color space)."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l_eq = cv2.equalizeHist(l)
    return cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)

def preprocess_clahe(img, clip_limit=2.0, tile_size=(8, 8)):
    """CLAHE (Contrast Limited Adaptive HE) — better for sonar speckle."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_size)
    l_clahe = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l_clahe, a, b]), cv2.COLOR_LAB2BGR)

PIPELINES = {
    "Raw (None)": preprocess_raw,
    "Hist-EQ":    preprocess_histeq,
    "CLAHE":      preprocess_clahe,
}

def run_benchmark():
    if not os.path.exists(MODEL_PATH):
        print(f"[ERROR] Model not found: {MODEL_PATH}"); return
    if not os.path.exists(TEST_DIR):
        print(f"[ERROR] Test dir not found: {TEST_DIR}"); return

    os.makedirs(RESULTS_DIR, exist_ok=True)
    print("[INFO] Loading model..."); model = YOLO(MODEL_PATH)
    image_paths = [
        os.path.join(TEST_DIR, f)
        for f in os.listdir(TEST_DIR) if f.endswith(".bmp")
    ][:MAX_IMAGES]
    print(f"[INFO] Benchmarking {len(image_paths)} images across {len(PIPELINES)} pipelines.\n")

    results = {}
    for name, fn in PIPELINES.items():
        confs, det_counts, frames_with_det = [], [], 0
        for img_path in image_paths:
            img = cv2.imread(img_path)
            if img is None: continue
            processed = fn(img)
            res = model(processed, verbose=False)
            boxes = res[0].boxes if res else None
            if boxes and len(boxes) > 0:
                frame_confs = [float(c) for c in boxes.conf]
                confs.extend(frame_confs)
                det_counts.append(len(frame_confs))
                frames_with_det += 1
            else:
                det_counts.append(0)

        results[name] = {
            "avg_confidence":  float(np.mean(confs)) if confs else 0.0,
            "avg_detections":  float(np.mean(det_counts)),
            "detection_rate":  frames_with_det / len(image_paths) * 100,
            "total_detections": len(confs),
        }

    # Print results
    header = f"{'Pipeline':<18} {'Avg Conf':>10} {'Avg Det/Frame':>15} {'Det Rate%':>11} {'Total Det':>11}"
    print(header); print("=" * len(header))
    for name, r in results.items():
        print(f"{name:<18} {r['avg_confidence']:>10.4f} {r['avg_detections']:>15.2f} "
              f"{r['detection_rate']:>10.1f}% {r['total_detections']:>11}")

    # Save
    out_path = os.path.join(RESULTS_DIR, "benchmark_results.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n[INFO] Results saved to {out_path}")

    # Simple winner
    best = max(results, key=lambda k: results[k]["avg_confidence"])
    print(f"[RESULT] Best preprocessing by avg confidence: {best} ({results[best]['avg_confidence']:.4f})")

if __name__ == "__main__":
    run_benchmark()
