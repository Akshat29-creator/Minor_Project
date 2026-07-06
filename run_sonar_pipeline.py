"""
Deep-Sea Rescue Sonar Pipeline (Stage 4 & Stage 5)
Calculates real-world distance, bearing, and assigns a rescue priority score to targets.
"""

import math
import os
import cv2
import numpy as np
from ultralytics import YOLO

# ==================== CONFIGURATION ====================
MODEL_PATH = r"runs\detect\optimized\sonar_optimized\weights\best.pt"
TEST_IMG = r"dataset\UATD_Test_2\UATD_Test_2\images\00010.bmp"
OUTPUT_DIR = r"sonar_project_output\demo_results"

# Sonar Real-World Presets (Approximate for Simulation)
BLIND_ZONE_M = 1.0     # The distance from sonar head to start of image
SONAR_RANGE_M = 10.0   # The total range represented by the vertical height
MAX_FOV_DEG = 130.0    # 130-degree Forward Looking Sonar cone

# Priority Weights (Stage 5)
# W1 + W2 + W3 = 1.0
W_CLASS = 0.50
W_DIST = 0.30
W_ANGLE = 0.20

# Class Weight Mappings (Higher = More Urgent Rescue Priority)
CLASS_PRIORITIES = {
    "human body": 1.0,
    "rov": 0.8,
    "tyre": 0.3, # Could be used as a flotation device or debris
}
DEFAULT_CLASS_PRIORITY = 0.1 # All other debris (cages, buckets, cubes)

# ==================== HELPER FUNCTIONS ====================

def calculate_localization(x_px, y_px, img_w, img_h):
    """
    Stage 4: True Polar Geometry Localization
    Calculates Distance (meters) and Angle (degrees) using Euclidean geometry.
    Origins (X_o, Y_o) are at the bottom-center of the image for typical FLS.
    """
    X_o = img_w / 2.0
    Y_o = img_h

    # Pixel Euclidean hypotenuse
    d_px = math.sqrt((x_px - X_o)**2 + (y_px - Y_o)**2)
    d_max_px = Y_o
    
    # Map pixel distance to real-world meters
    distance_m = BLIND_ZONE_M + (SONAR_RANGE_M * (d_px / d_max_px))
    
    # Calculate exact angle using atan2
    # X_o is zero-angle line
    angle_deg = math.degrees(math.atan2(x_px - X_o, Y_o - y_px))
    
    return distance_m, angle_deg

def calculate_priority(class_name, distance_m, angle_deg):
    """
    Stage 5: Multi-Factor Priority Scoring
    Outputs a score from 0.0 to 1.0
    """
    # 1. Class Factor
    c_score = CLASS_PRIORITIES.get(class_name.lower(), DEFAULT_CLASS_PRIORITY)
    
    # 2. Distance Factor (Normalized 0-1, closer is better)
    max_d = BLIND_ZONE_M + SONAR_RANGE_M
    d_score = max(0.0, (max_d - distance_m) / max_d)
    
    # 3. Angle Factor (Normalized 0-1, centered is better)
    half_fov = MAX_FOV_DEG / 2.0
    a_score = max(0.0, (half_fov - abs(angle_deg)) / half_fov)
    
    # Final Weighted Average
    priority = (W_CLASS * c_score) + (W_DIST * d_score) + (W_ANGLE * a_score)
    return priority

# ==================== MAIN EXECUTION ====================

def main():
    print("Initializing Deep-Sea Rescue Pipeline...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Load Model
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Missing weights file at {MODEL_PATH}")
    model = YOLO(MODEL_PATH)
    
    # Run Inference
    print(f"\nProcessing Image: {TEST_IMG}")
    image = cv2.imread(TEST_IMG)
    if image is None:
        raise ValueError(f"Failed to load image: {TEST_IMG}")
        
    img_h, img_w, _ = image.shape
    results = model(image, verbose=False)
    
    base_file = os.path.basename(TEST_IMG)
    save_path = os.path.join(OUTPUT_DIR, f"result_{base_file.replace('.bmp', '.jpg')}")
    
    # Overlay data
    for r in results:
        boxes = r.boxes
        for box in boxes:
            # Extract YOLO data
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            
            x_center = (x1 + x2) / 2.0
            y_center = (y1 + y2) / 2.0
            
            class_name = model.names[cls_id]
            
            # Stage 4: Localization Math
            dist_m, angle_deg = calculate_localization(x_center, y_center, img_w, img_h)
            
            # Stage 5: Priority Math
            priority = calculate_priority(class_name, dist_m, angle_deg)
            
            # --- Rendering UI ---
            color = (0, 0, 255) # Red for critical
            if priority < 0.4: color = (255, 0, 0) # Blue for low priority
            elif priority < 0.7: color = (0, 255, 255) # Yellow for medium
            
            # Draw Box
            cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
            
            # Draw HUD Label Window
            # Shadow/Background box for text readability
            label = f"{class_name.upper()} ({conf:.2f})"
            stats1 = f"Range: {dist_m:.1f}m | Brg: {angle_deg:+.1f}deg"
            stats2 = f"PRIORITY: {priority:.2f}"
            
            y_text = max(20, y1 - 45)
            cv2.rectangle(image, (x1, y_text-15), (x1+270, y_text+40), color, -1)
            cv2.putText(image, label, (x1+5, y_text), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0,0,0), 1)
            cv2.putText(image, stats1, (x1+5, y_text+15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0,0,0), 1)
            cv2.putText(image, stats2, (x1+5, y_text+30), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0,0,0), 2)
            
            print(f"> Found {class_name.upper()} at {dist_m:.2f}m, {angle_deg:+.2f}deg. [Priority: {priority:.2f}]")

    cv2.imwrite(save_path, image)
    print(f"\nPipeline processing complete! Result saved to:\n{save_path}")

if __name__ == "__main__":
    main()
