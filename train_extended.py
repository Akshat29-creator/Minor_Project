"""
Extended Training: UATD Sonar Object Detection with YOLOv8
Resumes from prior best checkpoint and trains for 50 more epochs.
Optimized for GTX 1650 (4 GB VRAM).
"""

import os
import torch
from ultralytics import YOLO

# ==================== CONFIGURATION ====================

# Paths
MODEL_WEIGHTS = "yolov8n.pt"  # Train from scratch using pretrained base model
DATA_YAML = r"sonar_project_output\yolo_dataset\data.yaml"
PROJECT_DIR = r"runs\detect\extended_training"

# Training config (safe for GTX 1650 4GB)
EPOCHS = 50
BATCH_SIZE = 8
IMG_SIZE = 640
PATIENCE = 15  # Early stopping: stop if no improvement for 15 epochs
WORKERS = 0    # Set to 0 to fundamentally fix the Windows multiprocessing crash

# ==================== MAIN ====================

def main():
    # GPU check
    print("=" * 60)
    print("EXTENDED TRAINING - UATD Sonar Detection")
    print("=" * 60)

    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
        device = 0
    else:
        print("WARNING: CUDA not available, using CPU")
        device = "cpu"

    print(f"\nTraining from scratch using: {MODEL_WEIGHTS}")
    print(f"Dataset: {DATA_YAML}")
    print(f"Epochs: {EPOCHS} | Batch: {BATCH_SIZE} | Patience: {PATIENCE}")
    print("=" * 60 + "\n")

    # Initialize base YOLOv8 nano model
    model = YOLO(MODEL_WEIGHTS)

    # Train with extended epochs
    results = model.train(
        data=DATA_YAML,
        epochs=EPOCHS,
        imgsz=IMG_SIZE,
        batch=BATCH_SIZE,
        device=device,
        project=PROJECT_DIR,
        name="sonar_final",
        patience=PATIENCE,
        save=True,
        plots=True,
        val=True,
        workers=WORKERS,
        amp=True,          # Mixed precision for VRAM efficiency
        cos_lr=True,       # Cosine LR schedule for smoother convergence
        close_mosaic=10,   # Disable mosaic for last 10 epochs (better fine-tuning)
        seed=42,
        deterministic=True,
        verbose=True,
    )

    # Print final results
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE!")
    print("=" * 60)

    # Run final validation
    best_model_path = os.path.join(PROJECT_DIR, "sonar_final", "weights", "best.pt")
    print(f"\nBest model: {best_model_path}")

    best_model = YOLO(best_model_path)
    metrics = best_model.val(data=DATA_YAML, split="val")

    print(f"\n{'='*60}")
    print("FINAL VALIDATION RESULTS")
    print(f"{'='*60}")
    print(f"  mAP@0.5:      {metrics.box.map50:.4f}")
    print(f"  mAP@0.5:0.95: {metrics.box.map:.4f}")
    print(f"  Precision:     {metrics.box.mp:.4f}")
    print(f"  Recall:        {metrics.box.mr:.4f}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
