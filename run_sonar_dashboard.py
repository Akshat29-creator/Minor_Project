"""
Deep-Sea Rescue Operator Dashboard (Standalone GUI)
This script creates a fully interactive UI wrapper around our Stage 4 and 5 logic.
Because this is a completely separate file, it is 100% safe and does not break or alter the original 'run_sonar_pipeline.py'.
"""

import os
import cv2
import math
import glob
import random
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
from ultralytics import YOLO

# ==================== CONFIGURATION ====================
MODEL_PATH = r"runs\detect\optimized\sonar_optimized\weights\best.pt"
IMG_DIRECTORY = r"dataset\UATD_Test_2\UATD_Test_2\images"

BLIND_ZONE_M = 1.0
SONAR_RANGE_M = 10.0
MAX_FOV_DEG = 130.0

W_CLASS, W_DIST, W_ANGLE = 0.50, 0.30, 0.20
CLASS_PRIORITIES = {"human body": 1.0, "rov": 0.8, "tyre": 0.3}
DEFAULT_CLASS_PRIORITY = 0.1

# ==================== PIPELINE MATH ====================
def calculate_localization(x_px, y_px, img_w, img_h):
    X_o = img_w / 2.0
    Y_o = img_h
    d_px = math.sqrt((x_px - X_o)**2 + (y_px - Y_o)**2)
    distance_m = BLIND_ZONE_M + (SONAR_RANGE_M * (d_px / Y_o))
    angle_deg = math.degrees(math.atan2(x_px - X_o, Y_o - y_px))
    return distance_m, angle_deg

def calculate_priority(class_name, distance_m, angle_deg):
    c_score = CLASS_PRIORITIES.get(class_name.lower(), DEFAULT_CLASS_PRIORITY)
    max_d = BLIND_ZONE_M + SONAR_RANGE_M
    d_score = max(0.0, (max_d - distance_m) / max_d)
    half_fov = MAX_FOV_DEG / 2.0
    a_score = max(0.0, (half_fov - abs(angle_deg)) / half_fov)
    return (W_CLASS * c_score) + (W_DIST * d_score) + (W_ANGLE * a_score)

# ==================== GUI APPLICATION ====================
class RescueDashboard(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Deep-Sea Rescue Operator Dashboard")
        self.geometry("1100x700")
        self.configure(bg="#0a1628") # Dark Navy theme for sonar operators
        
        # Ensure dependencies exist
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError("YOLO weights not found. Check MODEL_PATH.")
        self.images_list = glob.glob(os.path.join(IMG_DIRECTORY, "*.bmp"))
        if not self.images_list:
            raise FileNotFoundError(f"No sonar images found in {IMG_DIRECTORY}")
            
        print("Loading YOLOv8 Model... (Please wait)")
        self.model = YOLO(MODEL_PATH)
        print("Model Loaded Successfully!")

        self.setup_ui()
        self.scan_random_area() # Load an initial image

    def setup_ui(self):
        # Left Panel: Sonar Feed Stream
        self.feed_frame = tk.Frame(self, bg="#0d2137", bd=2, relief="groove")
        self.feed_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        lbl_feed_title = tk.Label(self.feed_frame, text="LIVE SONAR FEED", fg="#00d4aa", bg="#0d2137", font=("Courier", 16, "bold"))
        lbl_feed_title.pack(pady=5)
        
        self.video_canvas = tk.Label(self.feed_frame, bg="black")
        self.video_canvas.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Right Panel: Action Centre
        self.hud_frame = tk.Frame(self, bg="#0a1628", width=350)
        self.hud_frame.pack(side=tk.RIGHT, fill=tk.Y, padx=10, pady=10)
        
        lbl_hud_title = tk.Label(self.hud_frame, text="TARGET TRIAGE", fg="#ffc947", bg="#0a1628", font=("Arial", 18, "bold"))
        lbl_hud_title.pack(pady=10)
        
        # Scan Button
        self.btn_scan = tk.Button(self.hud_frame, text="SCAN NEW SECTOR", font=("Arial", 14, "bold"), 
                                  bg="#0f7b6c", fg="white", activebackground="#14a893", bd=0, 
                                  command=self.scan_random_area, pady=10)
        self.btn_scan.pack(fill=tk.X, pady=15)
        
        # Results Text Box
        self.txt_results = tk.Text(self.hud_frame, height=20, width=40, font=("Courier", 11), bg="#1e293b", fg="white", bd=0, padx=10, pady=10)
        self.txt_results.pack(fill=tk.BOTH, expand=True)

    def scan_random_area(self):
        # 1. Grab random image
        img_path = random.choice(self.images_list)
        image = cv2.imread(img_path)
        img_h, img_w, _ = image.shape
        
        # 2. Run Inference
        results = self.model(image, verbose=False)
        
        targets = []
        # 3. Process Logic
        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                
                x_center, y_center = (x1 + x2) / 2.0, (y1 + y2) / 2.0
                class_name = self.model.names[cls_id]
                
                dist_m, angle_deg = calculate_localization(x_center, y_center, img_w, img_h)
                priority = calculate_priority(class_name, dist_m, angle_deg)
                
                targets.append({
                    "cls": class_name.upper(), "conf": conf, "dist": dist_m, 
                    "angle": angle_deg, "priority": priority, "box": (x1, y1, x2, y2)
                })

        # 4. Sort by Priority (Stage 5 Requirement)
        targets = sorted(targets, key=lambda x: x["priority"], reverse=True)
        
        # 5. Draw UI and Update Text
        self.txt_results.delete(1.0, tk.END)
        self.txt_results.insert(tk.END, f"SECTOR SCAN:\n{os.path.basename(img_path)}\n")
        self.txt_results.insert(tk.END, "="*30 + "\n\n")
        
        if not targets:
            self.txt_results.insert(tk.END, "NO TARGETS DETECTED.\nSector is clear.")
            
        for idx, t in enumerate(targets):
            # Draw Data
            color_cv = (0, 0, 255) # Default Red
            if t["priority"] < 0.4: color_cv = (255, 0, 0) # Blue
            elif t["priority"] < 0.7: color_cv = (0, 255, 255) # Yellow
            
            x1, y1, x2, y2 = t["box"]
            cv2.rectangle(image, (x1, y1), (x2, y2), color_cv, 2)
            cv2.putText(image, f"P:{t['priority']:.2f}", (x1, max(20, y1-10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color_cv, 2)
            
            # Text Panel Data
            emoji = "🔴" if t["priority"] > 0.7 else "🟡" if t["priority"] > 0.4 else "🔵"
            self.txt_results.insert(tk.END, f"{idx+1}. {emoji} {t['cls']} (P:{t['priority']:.2f})\n")
            self.txt_results.insert(tk.END, f"   Dist: {t['dist']:.1f}m | Brg: {t['angle']:+.1f}°\n\n")

        # 6. Render Image to Tkinter
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        # Scale to fit nicely
        img_pil = Image.fromarray(image_rgb)
        img_pil = img_pil.resize((640, 640), Image.Resampling.LANCZOS)
        img_tk = ImageTk.PhotoImage(img_pil)
        
        self.video_canvas.configure(image=img_tk)
        self.video_canvas.image = img_tk # keep reference!

if __name__ == "__main__":
    app = RescueDashboard()
    app.mainloop()
