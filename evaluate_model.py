"""
Comprehensive Evaluation Script for UATD Sonar Object Detection
Evaluates trained YOLOv8 model with detailed per-class metrics and TTA.
Run:  python evaluate_model.py [--model path/to/best.pt] [--tta]
"""

import argparse
import os
import sys
from pathlib import Path
from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = SCRIPT_DIR / "runs" / "detect" / "optimized" / "sonar_optimized" / "weights" / "best.pt"
DEFAULT_DATA = SCRIPT_DIR / "sonar_project_output" / "yolo_dataset" / "data.yaml"
BASELINE_MODEL = SCRIPT_DIR / "runs" / "detect" / "runs" / "detect" / "extended_training" / "sonar_final" / "weights" / "best.pt"

CLASS_NAMES = [
    "cube", "ball", "cylinder", "human body", "plane",
    "circle cage", "square cage", "metal bucket", "tyre", "rov",
]


def evaluate(model_path, data_yaml, device, use_tta=False, label="Model"):
    """Run evaluation and return metrics dict."""
    print(f"\n{'='*70}")
    print(f"  EVALUATING: {label}")
    print(f"  Model  : {model_path}")
    print(f"  TTA    : {'Enabled' if use_tta else 'Disabled'}")
    print(f"{'='*70}\n")

    model = YOLO(str(model_path))

    # Standard evaluation
    metrics = model.val(
        data=str(data_yaml),
        split="val",
        device=device,
        plots=True,
        verbose=True,
    )

    results = {
        "model": str(model_path),
        "mAP50": metrics.box.map50,
        "mAP50_95": metrics.box.map,
        "precision": metrics.box.mp,
        "recall": metrics.box.mr,
    }

    # Per-class metrics
    if hasattr(metrics.box, "ap50") and metrics.box.ap50 is not None:
        results["per_class_ap50"] = {}
        results["per_class_ap"] = {}
        for i, name in enumerate(CLASS_NAMES):
            if i < len(metrics.box.ap50):
                results["per_class_ap50"][name] = float(metrics.box.ap50[i])
                results["per_class_ap"][name] = float(metrics.box.ap[i])

    # Print results
    print(f"\n  {'─'*60}")
    print(f"  {label} — Validation Results")
    print(f"  {'─'*60}")
    print(f"  mAP@0.5       : {results['mAP50']:.4f}")
    print(f"  mAP@0.5:0.95  : {results['mAP50_95']:.4f}")
    print(f"  Precision     : {results['precision']:.4f}")
    print(f"  Recall        : {results['recall']:.4f}")
    print(f"  {'─'*60}")

    if "per_class_ap50" in results:
        print(f"\n  {'Class':<18} {'AP@0.5':>10} {'AP@0.5:0.95':>12}")
        print(f"  {'-'*18} {'-'*10} {'-'*12}")
        for name in CLASS_NAMES:
            if name in results["per_class_ap50"]:
                print(f"  {name:<18} {results['per_class_ap50'][name]:>10.4f} {results['per_class_ap'][name]:>12.4f}")
        print()

    # TTA evaluation
    if use_tta:
        print(f"\n  Running TTA evaluation...")
        tta_metrics = model.val(
            data=str(data_yaml),
            split="val",
            device=device,
            augment=True,  # Enable TTA
            verbose=False,
        )
        results["tta_mAP50"] = tta_metrics.box.map50
        results["tta_mAP50_95"] = tta_metrics.box.map
        results["tta_precision"] = tta_metrics.box.mp
        results["tta_recall"] = tta_metrics.box.mr

        print(f"\n  {'─'*60}")
        print(f"  {label} — TTA Results")
        print(f"  {'─'*60}")
        print(f"  mAP@0.5 (TTA) : {results['tta_mAP50']:.4f}")
        print(f"  mAP@0.5:0.95  : {results['tta_mAP50_95']:.4f}")
        print(f"  Precision     : {results['tta_precision']:.4f}")
        print(f"  Recall        : {results['tta_recall']:.4f}")
        print(f"  {'─'*60}\n")

    return results


def compare_models(baseline_results, optimized_results):
    """Print side-by-side comparison."""
    print(f"\n{'='*70}")
    print(f"  BASELINE vs OPTIMIZED COMPARISON")
    print(f"{'='*70}")

    metrics = ["mAP50", "mAP50_95", "precision", "recall"]
    labels = ["mAP@0.5", "mAP@0.5:0.95", "Precision", "Recall"]

    print(f"\n  {'Metric':<18} {'Baseline':>10} {'Optimized':>10} {'Delta':>10} {'Improvement':>12}")
    print(f"  {'-'*18} {'-'*10} {'-'*10} {'-'*10} {'-'*12}")

    for metric, label in zip(metrics, labels):
        base_val = baseline_results.get(metric, 0)
        opt_val = optimized_results.get(metric, 0)
        delta = opt_val - base_val
        pct = (delta / max(base_val, 1e-6)) * 100
        arrow = "↑" if delta > 0 else "↓" if delta < 0 else "─"
        print(f"  {label:<18} {base_val:>10.4f} {opt_val:>10.4f} {delta:>+10.4f} {arrow} {abs(pct):>8.1f}%")

    print(f"\n{'='*70}\n")


def main():
    parser = argparse.ArgumentParser(description="Evaluate UATD Sonar Detection Model")
    parser.add_argument("--model", type=str, default=str(DEFAULT_MODEL), help="Path to model weights")
    parser.add_argument("--data", type=str, default=str(DEFAULT_DATA), help="Path to data.yaml")
    parser.add_argument("--tta", action="store_true", help="Enable Test-Time Augmentation")
    parser.add_argument("--compare", action="store_true", help="Compare with baseline model")
    parser.add_argument("--device", type=int, default=0, help="GPU device (0) or -1 for CPU")
    args = parser.parse_args()

    device = args.device if args.device >= 0 else "cpu"

    print("\n" + "=" * 70)
    print("  UATD SONAR OBJECT DETECTION — MODEL EVALUATION")
    print("=" * 70)

    # Evaluate optimized model
    if not Path(args.model).exists():
        print(f"\n  ❌ Model not found: {args.model}")
        print("  Train first: python train_optimized.py")
        sys.exit(1)

    opt_results = evaluate(args.model, args.data, device, use_tta=args.tta, label="Optimized Model")

    # Compare with baseline if requested
    if args.compare and BASELINE_MODEL.exists():
        base_results = evaluate(str(BASELINE_MODEL), args.data, device, use_tta=False, label="Baseline Model")
        compare_models(base_results, opt_results)
    elif args.compare:
        print(f"\n  ⚠️  Baseline model not found at: {BASELINE_MODEL}")
        print("  Skipping comparison.\n")

    # Save results to JSON
    import json
    output_dir = Path(args.model).parent.parent
    results_path = output_dir / "evaluation_results.json"
    with open(results_path, "w") as f:
        json.dump(opt_results, f, indent=2, default=str)
    print(f"  ✓ Results saved to: {results_path}\n")


if __name__ == "__main__":
    main()
