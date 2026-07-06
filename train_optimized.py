"""
Deep-Sea Rescue Support: UATD Sonar Object Detection — Optimized Training
Authors: Akshat Danve, Akshat Awasthi
Guide: Dr. Suganiya M
SRM Institute of Science and Technology

Optimized for RTX 5060 (8 GB VRAM) with YOLOv8l (large).
Run:  python train_optimized.py
"""

import os
import sys
import argparse
import torch
import yaml
from pathlib import Path
from ultralytics import YOLO

# ==================== CONFIGURATION ====================

# Dataset paths
SCRIPT_DIR = Path(__file__).resolve().parent
DATASET_ROOT = SCRIPT_DIR / "dataset"
TRAIN_IMG_DIR = DATASET_ROOT / "UATD_Training" / "UATD_Training" / "images"
TRAIN_ANN_DIR = DATASET_ROOT / "UATD_Training" / "UATD_Training" / "annotations"
TEST1_IMG_DIR = DATASET_ROOT / "UATD_Test_1" / "UATD_Test_1" / "images"
TEST1_ANN_DIR = DATASET_ROOT / "UATD_Test_1" / "UATD_Test_1" / "annotations"

# Output
YOLO_DATASET_DIR = SCRIPT_DIR / "sonar_project_output" / "yolo_dataset"
RUNS_DIR = SCRIPT_DIR / "runs" / "detect" / "optimized"

# Class names (UATD dataset)
CLASS_NAMES = [
    "cube", "ball", "cylinder", "human body", "plane",
    "circle cage", "square cage", "metal bucket", "tyre", "rov",
]

# ==================== OPTIMIZED HYPERPARAMETERS ====================

DEFAULTS = {
    "model": "runs/detect/optimized/sonar_optimized/weights/best.pt" if os.path.exists("runs/detect/optimized/sonar_optimized/weights/best.pt") else "yolov8l.pt",
    "epochs": 50,                   
    "batch": -1,                    # AutoBatch (~32) automatically scales VRAM usage
    "imgsz": 512,                   
    "patience": 40,                 
    "workers": 4,                   # Increased thread workers for DataLoader speed
    "cache": True,                  
    "device": 0,

    # Optimizer
    "optimizer": "AdamW",
    "lr0": 0.001,                    
    "lrf": 0.01,                     
    "weight_decay": 0.001,           
    "warmup_epochs": 5,
    "warmup_momentum": 0.5,
    "cos_lr": True,                  

    # Augmentation (Enhanced Configuration)
    "hsv_h": 0.015,                  
    "hsv_s": 0.5,                    
    "hsv_v": 0.5,                    
    "degrees": 15.0,                 # Rotation=15°
    "translate": 0.1,                
    "scale": 0.4,                    
    "shear": 2.0,                    
    "flipud": 0.3,                   # 30% upside-down flip 
    "fliplr": 0.5,                   
    "mosaic": 0.0,                   
    "mixup": 0.1,                    # Mixup enabled
    "copy_paste": 0.1,               # Copy-paste enabled
    "close_mosaic": 0,               

    # === REALISTIC CONFIDENCE TRADEOFF LOGIC ===
    # 1. Gentle Smoothing: Prevents the model from going to unrealistic 100%, softly caps it closer to 85-90%.
    "label_smoothing": 0.03,       
    
    # 2. Moderate Classification Boost: Default is 0.5. Raising it strictly to 1.0 (rather than 1.5) ensures realistic confidence clustering.
    "cls": 1.0,
    
    # 3. Controlled Sharpness: Default is 1.5. A small bump securely captures tight boundaries without sacrificing context.
    "dfl": 1.8,
    "box": 7.5,
    
    # 4. Stabilize Aggressive Multipliers
    "warmup_epochs": 10,             # Longer warmup so gradients don't explode early
    "dropout": 0.15,                 # Maintain dropout to ensure accuracy doesn't crash from the aggressive confidence
    "patience": 20,                  # Give it more time to plateau before early stopping
    
    # Misc
    "seed": 42,
    "deterministic": True,
    "amp": True,                     
    "save": True,
    "plots": True,                   # Generates performance graphs
    "val": True,
    "verbose": True,
}


# ==================== GPU VERIFICATION ====================

def check_gpu():
    """Verify CUDA availability and print GPU info."""
    print("=" * 70)
    print("  GPU VERIFICATION")
    print("=" * 70)
    print(f"  PyTorch Version     : {torch.__version__}")
    print(f"  CUDA Available      : {torch.cuda.is_available()}")

    if torch.cuda.is_available():
        print(f"  CUDA Version        : {torch.version.cuda}")
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"  GPU Device          : {gpu_name}")
        print(f"  GPU Memory          : {gpu_mem:.2f} GB")
        print(f"  cuDNN Enabled       : {torch.backends.cudnn.enabled}")
        print(f"  Training Device     : GPU (CUDA)")
    else:
        print("  ⚠️  CUDA NOT AVAILABLE — will use CPU (very slow)")
        print("  Install: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124")
    print("=" * 70 + "\n")
    return torch.cuda.is_available()


# ==================== DATASET CONVERSION ====================

def parse_uatd_xml(xml_path):
    """Parse UATD XML annotation to YOLO format."""
    import xml.etree.ElementTree as ET

    tree = ET.parse(xml_path)
    root = tree.getroot()

    size = root.find("size")
    width = int(size.find("width").text)
    height = int(size.find("height").text)

    boxes = []
    for obj in root.findall("object"):
        class_name = obj.find("name").text
        if class_name not in CLASS_NAMES:
            continue

        class_id = CLASS_NAMES.index(class_name)
        bndbox = obj.find("bndbox")
        xmin = float(bndbox.find("xmin").text)
        ymin = float(bndbox.find("ymin").text)
        xmax = float(bndbox.find("xmax").text)
        ymax = float(bndbox.find("ymax").text)

        # Clamp to image boundaries
        xmin = max(0, min(xmin, width))
        xmax = max(0, min(xmax, width))
        ymin = max(0, min(ymin, height))
        ymax = max(0, min(ymax, height))

        # Skip degenerate boxes
        if xmax <= xmin or ymax <= ymin:
            continue

        x_center = ((xmin + xmax) / 2) / width
        y_center = ((ymin + ymax) / 2) / height
        bbox_width = (xmax - xmin) / width
        bbox_height = (ymax - ymin) / height

        boxes.append(f"{class_id} {x_center:.6f} {y_center:.6f} {bbox_width:.6f} {bbox_height:.6f}")

    return boxes


def convert_uatd_to_yolo(img_dir, ann_dir, output_img_dir, output_label_dir):
    """Convert UATD BMP+XML to YOLO JPG+TXT format."""
    import cv2

    Path(output_img_dir).mkdir(parents=True, exist_ok=True)
    Path(output_label_dir).mkdir(parents=True, exist_ok=True)

    img_files = sorted(Path(img_dir).glob("*.bmp"))
    print(f"  Converting {len(img_files)} images from {img_dir}...")

    converted = 0
    skipped = 0
    for img_path in img_files:
        xml_path = Path(ann_dir) / (img_path.stem + ".xml")
        if not xml_path.exists():
            skipped += 1
            continue

        boxes = parse_uatd_xml(xml_path)
        if not boxes:
            skipped += 1
            continue

        # Convert BMP → JPG (higher quality)
        img = cv2.imread(str(img_path))
        if img is None:
            skipped += 1
            continue

        output_img_path = Path(output_img_dir) / (img_path.stem + ".jpg")
        cv2.imwrite(str(output_img_path), img, [cv2.IMWRITE_JPEG_QUALITY, 95])

        output_label_path = Path(output_label_dir) / (img_path.stem + ".txt")
        with open(output_label_path, "w") as f:
            f.write("\n".join(boxes))

        converted += 1

    print(f"  ✓ Converted {converted} pairs ({skipped} skipped)\n")
    return converted


def prepare_dataset():
    """Prepare YOLO-format dataset with correct paths."""
    print("=" * 70)
    print("  PREPARING YOLO DATASET")
    print("=" * 70)

    train_img_dir = YOLO_DATASET_DIR / "images" / "train"
    train_lbl_dir = YOLO_DATASET_DIR / "labels" / "train"
    val_img_dir = YOLO_DATASET_DIR / "images" / "val"
    val_lbl_dir = YOLO_DATASET_DIR / "labels" / "val"

    # Check if dataset already converted
    yaml_path = YOLO_DATASET_DIR / "data.yaml"
    existing_train = len(list(train_img_dir.glob("*.jpg"))) if train_img_dir.exists() else 0
    existing_val = len(list(val_img_dir.glob("*.jpg"))) if val_img_dir.exists() else 0

    if existing_train > 0 and existing_val > 0:
        print(f"  Dataset already exists: {existing_train} train, {existing_val} val images")
        print(f"  Updating data.yaml path...\n")
    else:
        # Convert training set
        convert_uatd_to_yolo(TRAIN_IMG_DIR, TRAIN_ANN_DIR, train_img_dir, train_lbl_dir)
        # Convert test set as validation
        convert_uatd_to_yolo(TEST1_IMG_DIR, TEST1_ANN_DIR, val_img_dir, val_lbl_dir)

    # Always write data.yaml with correct absolute path for this machine
    data_yaml = {
        "path": str(YOLO_DATASET_DIR.resolve()),
        "train": "images/train",
        "val": "images/val",
        "nc": len(CLASS_NAMES),
        "names": CLASS_NAMES,
    }
    with open(yaml_path, "w") as f:
        yaml.dump(data_yaml, f, sort_keys=False)

    print(f"  ✓ data.yaml saved: {yaml_path}")
    print("=" * 70 + "\n")
    return str(yaml_path)


# ==================== DATASET STATISTICS ====================

def print_dataset_stats(data_yaml_path):
    """Print class distribution statistics."""
    from collections import Counter

    print("=" * 70)
    print("  DATASET STATISTICS")
    print("=" * 70)

    label_dir = YOLO_DATASET_DIR / "labels" / "train"
    class_counts = Counter()

    for label_file in label_dir.glob("*.txt"):
        with open(label_file) as f:
            for line in f:
                parts = line.strip().split()
                if parts:
                    class_counts[int(parts[0])] += 1

    total = sum(class_counts.values())
    print(f"\n  {'Class':<18} {'Count':>8} {'Pct':>8}")
    print(f"  {'-'*18} {'-'*8} {'-'*8}")
    for cls_id in range(len(CLASS_NAMES)):
        count = class_counts.get(cls_id, 0)
        pct = (count / total * 100) if total > 0 else 0
        print(f"  {CLASS_NAMES[cls_id]:<18} {count:>8} {pct:>7.1f}%")
    print(f"  {'─'*18} {'─'*8} {'─'*8}")
    print(f"  {'TOTAL':<18} {total:>8}")
    print(f"\n  Imbalance ratio: {max(class_counts.values()) / max(1, min(class_counts.values())):.1f}x")
    print("=" * 70 + "\n")


# ==================== TRAINING ====================

def train(args):
    """Run optimized training."""
    print("=" * 70)
    print("  STARTING OPTIMIZED TRAINING")
    print("=" * 70)

    # Merge defaults with CLI overrides
    cfg = {**DEFAULTS}
    if args.epochs:
        cfg["epochs"] = args.epochs
    if args.batch:
        cfg["batch"] = args.batch
    if args.model:
        cfg["model"] = args.model

    device = cfg.pop("device")
    model_weights = cfg.pop("model")

    if not torch.cuda.is_available():
        device = "cpu"
        cfg["amp"] = False
        cfg["batch"] = 4
        cfg["workers"] = 0
        print("  ⚠️  Falling back to CPU mode with reduced settings\n")

    print(f"  Model         : {model_weights}")
    print(f"  Epochs        : {cfg['epochs']}")
    print(f"  Batch Size    : {cfg['batch']} ({'auto' if cfg['batch'] == -1 else 'fixed'})")
    print(f"  Image Size    : {cfg['imgsz']}")
    print(f"  Optimizer     : {cfg['optimizer']} (lr={cfg['lr0']})")
    print(f"  Patience      : {cfg['patience']}")
    print(f"  AMP (FP16)    : {cfg['amp']}")
    print(f"  Dropout       : {cfg['dropout']}")
    print(f"  Device        : {'GPU (CUDA)' if device == 0 else 'CPU'}")
    print("=" * 70 + "\n")

    # Load model
    model = YOLO(model_weights)

    # Train
    results = model.train(
        data=args.data_yaml,
        project=str(RUNS_DIR),
        name="sonar_optimized",
        device=device,
        exist_ok=True,
        **cfg,
    )

    print("\n" + "=" * 70)
    print("  ✓ TRAINING COMPLETED!")
    print("=" * 70)

    # Validate with best weights
    best_path = RUNS_DIR / "sonar_optimized" / "weights" / "best.pt"
    if best_path.exists():
        print(f"\n  Best model: {best_path}")
        best_model = YOLO(str(best_path))
        metrics = best_model.val(data=args.data_yaml, split="val", device=device)

        print(f"\n  {'─'*50}")
        print(f"  FINAL VALIDATION RESULTS")
        print(f"  {'─'*50}")
        print(f"  mAP@0.5       : {metrics.box.map50:.4f}")
        print(f"  mAP@0.5:0.95  : {metrics.box.map:.4f}")
        print(f"  Precision     : {metrics.box.mp:.4f}")
        print(f"  Recall        : {metrics.box.mr:.4f}")
        print(f"  {'─'*50}\n")

        # Print per-class results
        if hasattr(metrics.box, "ap50") and metrics.box.ap50 is not None:
            print(f"  {'Class':<18} {'AP@0.5':>10} {'AP@0.5:0.95':>12}")
            print(f"  {'-'*18} {'-'*10} {'-'*12}")
            for i, name in enumerate(CLASS_NAMES):
                if i < len(metrics.box.ap50):
                    print(f"  {name:<18} {metrics.box.ap50[i]:>10.4f} {metrics.box.ap[i]:>12.4f}")
            print()
    else:
        print(f"\n  ⚠️  Best weights not found at: {best_path}")

    print("=" * 70 + "\n")
    return results


# ==================== MAIN ====================

def parse_args():
    parser = argparse.ArgumentParser(
        description="Optimized UATD Sonar Object Detection Training"
    )
    parser.add_argument("--epochs", type=int, default=None, help="Override number of epochs")
    parser.add_argument("--batch", type=int, default=None, help="Override batch size (-1 for auto)")
    parser.add_argument("--model", type=str, default=None, help="Override model weights file")
    parser.add_argument("--check-gpu", action="store_true", help="Only check GPU and exit")
    return parser.parse_args()


def main():
    args = parse_args()

    print("\n" + "=" * 70)
    print("  DEEP-SEA RESCUE SONAR OBJECT DETECTION")
    print("  Optimized Training Pipeline — YOLOv8l")
    print("  SRM Institute of Science and Technology")
    print("=" * 70 + "\n")

    # Step 1: GPU check
    gpu_ok = check_gpu()
    if args.check_gpu:
        sys.exit(0)

    # Step 2: Prepare dataset
    data_yaml_path = prepare_dataset()
    args.data_yaml = data_yaml_path

    # Step 3: Print dataset stats
    print_dataset_stats(data_yaml_path)

    # Step 4: Train
    train(args)

    print("  ✓ ALL DONE! Next steps:")
    print("    1. Run: python evaluate_model.py")
    print("    2. Run: python generate_graphs.py")
    print("    3. Run: python run_sonar_dashboard.py")
    print()


if __name__ == "__main__":
    main()
