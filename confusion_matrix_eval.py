"""
Per-Class Confusion Matrix & Precision/Recall Analysis
Runs YOLOv8 inference on UATD validation set, computes:
  - Per-class Precision, Recall, F1-Score
  - Confusion matrix (predicted vs. actual class)
  - Overall mAP@0.5 breakdown
Run from the srm-minor-project directory.
"""
import os, json
import numpy as np
from ultralytics import YOLO

MODEL_PATH = r"runs\detect\optimized\sonar_optimized\weights\best.pt"
DATASET_YAML = r"dataset\data.yaml"  # adjust if different
RESULTS_DIR  = r"sonar_project_output\confusion_results"

def run_confusion_eval():
    if not os.path.exists(MODEL_PATH):
        print(f"[ERROR] Model not found: {MODEL_PATH}"); return
    if not os.path.exists(DATASET_YAML):
        print(f"[ERROR] data.yaml not found: {DATASET_YAML}")
        print("       Please check your dataset YAML path."); return

    os.makedirs(RESULTS_DIR, exist_ok=True)
    print("[INFO] Loading model..."); model = YOLO(MODEL_PATH)

    print("[INFO] Running validation pass (this generates confusion matrix automatically)...")
    metrics = model.val(
        data=DATASET_YAML,
        imgsz=640,
        conf=0.25,
        iou=0.5,
        save_json=True,
        plots=True,            # saves confusion matrix PNG
        project=RESULTS_DIR,
        name="eval",
        verbose=True,
    )

    print("\n" + "=" * 60)
    print("PER-CLASS METRICS SUMMARY")
    print("=" * 60)

    class_names = model.names
    # metrics.box contains per-class results
    try:
        p  = metrics.box.p    # precision per class
        r  = metrics.box.r    # recall per class
        f1 = metrics.box.f1   # F1 per class
        ap = metrics.box.ap   # AP@0.5 per class

        header = f"{'Class':<20} {'Precision':>10} {'Recall':>8} {'F1':>8} {'AP@0.5':>10}"
        print(header); print("-" * len(header))
        for i, name in class_names.items():
            if i < len(p):
                print(f"{name:<20} {p[i]:>10.3f} {r[i]:>8.3f} {f1[i]:>8.3f} {ap[i]:>10.3f}")

        print("-" * len(header))
        print(f"{'OVERALL':<20} {np.mean(p):>10.3f} {np.mean(r):>8.3f} {np.mean(f1):>8.3f} {metrics.box.map50:>10.3f}")
        print(f"\nmAP@0.5:0.95 = {metrics.box.map:.3f}")
        print(f"\n[INFO] Confusion matrix PNG saved to: {RESULTS_DIR}\\eval\\")

    except AttributeError as e:
        print(f"[WARN] Could not extract per-class arrays directly: {e}")
        print(f"       mAP@0.5 = {metrics.box.map50:.4f}")
        print(f"       mAP@0.5:0.95 = {metrics.box.map:.4f}")

    # Save summary JSON
    summary = {
        "map50": float(metrics.box.map50),
        "map5095": float(metrics.box.map),
        "results_dir": RESULTS_DIR,
    }
    with open(os.path.join(RESULTS_DIR, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n[INFO] Summary saved to {RESULTS_DIR}\\summary.json")

if __name__ == "__main__":
    run_confusion_eval()
