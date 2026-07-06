"""
Deep-Sea Rescue Support: UATD Sonar Object Detection with YOLOv8
Authors: Akshat Danve, Akshat Awasthi
Guide: Dr. Suganiya M
SRM Institute of Science and Technology
"""

import os
import torch
from ultralytics import YOLO
import cv2
import xml.etree.ElementTree as ET
from pathlib import Path
import shutil
import yaml

# ==================== CONFIGURATION ====================

# Dataset paths (MODIFY THESE TO YOUR DATASET LOCATION)
DATASET_ROOT = r"C:\proprojects\srm-minor-project\dataset"  # Change to your actual path
TRAIN_IMG_DIR = os.path.join(DATASET_ROOT, "UATD_Training", "UATD_Training", "images")
TRAIN_ANN_DIR = os.path.join(DATASET_ROOT, "UATD_Training", "UATD_Training", "annotations")
TEST1_IMG_DIR = os.path.join(DATASET_ROOT, "UATD_Test_1", "UATD_Test_1", "images")
TEST1_ANN_DIR = os.path.join(DATASET_ROOT, "UATD_Test_1", "UATD_Test_1", "annotations")

# Output directories
OUTPUT_DIR = "sonar_project_output"
YOLO_DATASET_DIR = os.path.join(OUTPUT_DIR, "yolo_dataset")
RUNS_DIR = os.path.join(OUTPUT_DIR, "runs")






























# Training hyperparameters
MODEL_SIZE = "yolov8n"  # Options: yolov8n (nano), yolov8s (small), yolov8m (medium)
IMG_SIZE = 640
BATCH_SIZE = 16  # Adjust based on your GPU memory (GTX 1650 has 4GB)
EPOCHS = 5
DEVICE = 0 if torch.cuda.is_available() else "cpu"

# Real dataset class names (from actual XML annotations)
CLASS_NAMES = [
    "cube",         # 0
    "ball",         # 1
    "cylinder",     # 2
    "human body",   # 3
    "plane",        # 4
    "circle cage",  # 5
    "square cage",  # 6
    "metal bucket", # 7
    "tyre",         # 8
    "rov",          # 9
]

# ==================== GPU VERIFICATION ====================

def check_gpu():
    """Verify CUDA availability and display GPU info"""
    print("="*60)
    print("GPU VERIFICATION")
    print("="*60)
    print(f"PyTorch Version: {torch.__version__}")
    print(f"CUDA Available: {torch.cuda.is_available()}")
    
    if torch.cuda.is_available():
        print(f"CUDA Version: {torch.version.cuda}")
        print(f"GPU Device: {torch.cuda.get_device_name(0)}")
        print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
        print(f"Training will use: GPU (CUDA)")
    else:
        print("⚠️ CUDA not available. Training will use CPU (much slower)")
        print("Please check your PyTorch installation and NVIDIA drivers.")
    print("="*60 + "\n")

# ==================== DATASET CONVERSION ====================

def parse_uatd_xml(xml_path):
    """Parse UATD XML annotation to YOLO format"""
    tree = ET.parse(xml_path)
    root = tree.getroot()
    
    size = root.find('size')
    width = int(size.find('width').text)
    height = int(size.find('height').text)
    
    boxes = []
    for obj in root.findall('object'):
        class_name = obj.find('name').text
        if class_name not in CLASS_NAMES:
            continue
        
        class_id = CLASS_NAMES.index(class_name)
        
        bndbox = obj.find('bndbox')
        xmin = float(bndbox.find('xmin').text)
        ymin = float(bndbox.find('ymin').text)
        xmax = float(bndbox.find('xmax').text)
        ymax = float(bndbox.find('ymax').text)
        
        # Convert to YOLO format: <class> <x_center> <y_center> <width> <height> (normalized)
        x_center = ((xmin + xmax) / 2) / width
        y_center = ((ymin + ymax) / 2) / height
        bbox_width = (xmax - xmin) / width
        bbox_height = (ymax - ymin) / height
        
        boxes.append(f"{class_id} {x_center:.6f} {y_center:.6f} {bbox_width:.6f} {bbox_height:.6f}")
    
    return boxes

def convert_uatd_to_yolo(img_dir, ann_dir, output_img_dir, output_label_dir):
    """Convert UATD BMP+XML to YOLO JPG+TXT format"""
    Path(output_img_dir).mkdir(parents=True, exist_ok=True)
    Path(output_label_dir).mkdir(parents=True, exist_ok=True)
    
    img_files = list(Path(img_dir).glob("*.bmp"))
    print(f"Converting {len(img_files)} images from {img_dir}...")
    
    converted = 0
    for img_path in img_files:
        xml_path = Path(ann_dir) / (img_path.stem + ".xml")
        
        if not xml_path.exists():
            continue
        
        # Parse annotation
        boxes = parse_uatd_xml(xml_path)
        if not boxes:  # Skip images with no valid annotations
            continue
        
        # Copy and convert image to JPG
        img = cv2.imread(str(img_path))
        output_img_path = Path(output_img_dir) / (img_path.stem + ".jpg")
        cv2.imwrite(str(output_img_path), img)
        
        # Write YOLO label
        output_label_path = Path(output_label_dir) / (img_path.stem + ".txt")
        with open(output_label_path, 'w') as f:
            f.write('\n'.join(boxes))
        
        converted += 1
    
    print(f"✓ Converted {converted} valid image-annotation pairs\n")
    return converted

def prepare_yolo_dataset():
    """Prepare dataset in YOLO format"""
    print("="*60)
    print("PREPARING YOLO DATASET")
    print("="*60)
    
    # Create directory structure
    train_img_dir = os.path.join(YOLO_DATASET_DIR, "images", "train")
    train_label_dir = os.path.join(YOLO_DATASET_DIR, "labels", "train")
    val_img_dir = os.path.join(YOLO_DATASET_DIR, "images", "val")
    val_label_dir = os.path.join(YOLO_DATASET_DIR, "labels", "val")
    
    # Convert training set
    convert_uatd_to_yolo(TRAIN_IMG_DIR, TRAIN_ANN_DIR, train_img_dir, train_label_dir)
    
    # Convert test set as validation
    convert_uatd_to_yolo(TEST1_IMG_DIR, TEST1_ANN_DIR, val_img_dir, val_label_dir)
    
    # Create data.yaml
    data_yaml = {
        'path': os.path.abspath(YOLO_DATASET_DIR),
        'train': 'images/train',
        'val': 'images/val',
        'nc': len(CLASS_NAMES),
        'names': CLASS_NAMES
    }
    
    yaml_path = os.path.join(YOLO_DATASET_DIR, "data.yaml")
    with open(yaml_path, 'w') as f:
        yaml.dump(data_yaml, f, sort_keys=False)
    
    print(f"✓ Dataset configuration saved to {yaml_path}")
    print("="*60 + "\n")
    
    return yaml_path

# ==================== MODEL TRAINING ====================

def train_model(data_yaml_path):
    """Train YOLOv8 model on UATD dataset"""
    print("="*60)
    print("STARTING MODEL TRAINING")
    print("="*60)
    print(f"Model: {MODEL_SIZE}")
    print(f"Image Size: {IMG_SIZE}")
    print(f"Batch Size: {BATCH_SIZE}")
    print(f"Epochs: {EPOCHS}")
    print(f"Device: {'GPU (CUDA)' if DEVICE == 0 else 'CPU'}")
    print("="*60 + "\n")
    
    # Load pretrained model
    model = YOLO(f"{MODEL_SIZE}.pt")
    
    # Train
    results = model.train(
        data=data_yaml_path,
        epochs=EPOCHS,
        imgsz=IMG_SIZE,
        batch=BATCH_SIZE,
        device=DEVICE,
        project=RUNS_DIR,
        name="sonar_detection",
        patience=20,  # Early stopping
        save=True,
        plots=True,
        val=True,
    )
    
    print("\n" + "="*60)
    print("TRAINING COMPLETED!")
    print("="*60)
    print(f"Best model saved at: {os.path.join(RUNS_DIR, 'sonar_detection', 'weights', 'best.pt')}")
    print(f"Results saved in: {os.path.join(RUNS_DIR, 'sonar_detection')}")
    print("="*60 + "\n")
    
    return model

# ==================== MODEL VALIDATION ====================

def validate_model(model, data_yaml_path):
    """Run validation on test set"""
    print("="*60)
    print("VALIDATING MODEL")
    print("="*60)
    
    metrics = model.val(data=data_yaml_path, split='val')
    
    print(f"\nValidation Results:")
    print(f"  mAP@0.5: {metrics.box.map50:.4f}")
    print(f"  mAP@0.5:0.95: {metrics.box.map:.4f}")
    print(f"  Precision: {metrics.box.mp:.4f}")
    print(f"  Recall: {metrics.box.mr:.4f}")
    print("="*60 + "\n")

# ==================== INFERENCE DEMO ====================

def run_inference_demo(model):
    """Run inference on sample test images"""
    print("="*60)
    print("RUNNING INFERENCE DEMO")
    print("="*60)
    
    test_img_dir = os.path.join(YOLO_DATASET_DIR, "images", "val")
    test_images = list(Path(test_img_dir).glob("*.jpg"))[:5]  # First 5 images
    
    results = model.predict(
        source=test_images,
        save=True,
        project=RUNS_DIR,
        name="inference_demo",
        conf=0.25,
        device=DEVICE
    )
    
    print(f"✓ Inference results saved in: {os.path.join(RUNS_DIR, 'inference_demo')}")
    print("="*60 + "\n")

# ==================== MAIN EXECUTION ====================

def main():
    """Main execution pipeline"""
    print("\n" + "="*60)
    print("DEEP-SEA RESCUE SONAR OBJECT DETECTION")
    print("Minor Project - SRM Institute of Science and Technology")
    print("="*60 + "\n")
    
    # Step 1: Check GPU
    check_gpu()
    
    # Step 2: Prepare dataset
    if not os.path.exists(os.path.join(YOLO_DATASET_DIR, "data.yaml")):
        data_yaml_path = prepare_yolo_dataset()
    else:
        data_yaml_path = os.path.join(YOLO_DATASET_DIR, "data.yaml")
        print(f"Dataset already prepared. Using: {data_yaml_path}\n")
    
    # Step 3, 4, 5 removed from this script -> Use train_extended.py for training
    
    print("\n" + "="*60)
    print("DATASET PREPARATION COMPLETED SUCCESSFULLY!")
    print("="*60)
    print("\nNext steps:")
    print("1. Verify the classes in sonar_project_output/yolo_dataset/labels")
    print("2. Run train_extended.py to begin training")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
