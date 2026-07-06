# UATD Sonar Object Detection — Training Guide

## Overview

This project implements **YOLOv8-based underwater sonar object detection** for deep-sea rescue support using the UATD dataset (10 object classes, 7600 training images).

## Quick Start

### 1. Environment Setup

```bash
# Create virtual environment
python -m venv sonar_env
sonar_env\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Install PyTorch with CUDA (for RTX 5060)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
```

### 2. Verify GPU

```bash
python train_optimized.py --check-gpu
```

Expected output:
```
GPU Device: NVIDIA GeForce RTX 5060
GPU Memory: 8.00 GB
cuDNN Enabled: True
```

### 3. Train the Model

```bash
# Full optimized training (recommended)
python train_optimized.py

# Quick smoke test (2 epochs)
python train_optimized.py --epochs 2 --batch 8

# Custom settings
python train_optimized.py --epochs 100 --batch 16
```

**Estimated training time**: 2–4 hours on RTX 5060.

### 4. Evaluate

```bash
# Evaluate optimized model
python evaluate_model.py

# Compare with baseline
python evaluate_model.py --compare

# With Test-Time Augmentation
python evaluate_model.py --tta --compare
```

### 5. Generate Graphs

```bash
python generate_graphs.py
```

Graphs are saved to `graphs/` directory:
- `training_dashboard.png` — combined overview
- `training_losses.png` — box/cls/dfl training losses
- `map_progression.png` — mAP over epochs
- `per_class_ap.png` — per-class AP bar chart
- `baseline_vs_optimized.png` — comparison chart
- `map_comparison_overlay.png` — overlay of both training curves

### 6. Run Dashboard

```bash
python run_sonar_dashboard.py
```

## Project Structure

```
├── train_optimized.py      # Optimized training (YOLOv8l)
├── train_sonar_yolo.py     # Original dataset preparation
├── train_extended.py       # Original baseline training
├── evaluate_model.py       # Model evaluation with TTA
├── generate_graphs.py      # Publication-quality graphs
├── run_sonar_pipeline.py   # Inference pipeline
├── run_sonar_dashboard.py  # GUI dashboard
├── requirements.txt        # Dependencies
├── dataset/                # UATD raw dataset
├── sonar_project_output/   # Converted YOLO dataset
├── runs/                   # Training outputs
└── graphs/                 # Generated graphs
```

## Optimization Summary

| Parameter | Baseline | Optimized |
|---|---|---|
| Model | YOLOv8n (3.2M) | YOLOv8l (43.7M) |
| Epochs | 50 | 200 |
| Batch | 8 | Auto (~32) |
| Optimizer | SGD | AdamW |
| Dropout | 0.0 | 0.15 |
| Augmentation | Default | Enhanced (mixup, copy_paste, rotation) |
| Label smoothing | 0.0 | 0.05 |
| Early stopping | patience=15 | patience=40 |
