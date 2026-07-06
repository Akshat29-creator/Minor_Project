"""
Generate Publication-Quality Graphs for UATD Sonar Object Detection
Creates training curves, per-class performance charts, confusion matrices,
PR curves, and baseline vs optimized comparisons.

Run:  python generate_graphs.py [--run-dir path] [--baseline-dir path]
"""

import argparse
import os
import csv
import json
from pathlib import Path
import numpy as np

try:
    import matplotlib
    matplotlib.use("Agg")  # Non-interactive backend
    import matplotlib.pyplot as plt
    import matplotlib.ticker as ticker
    from matplotlib.gridspec import GridSpec
except ImportError:
    print("ERROR: matplotlib is required. Install: pip install matplotlib")
    exit(1)

try:
    from PIL import Image
except ImportError:
    Image = None

# ==================== CONFIGURATION ====================

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_RUN_DIR = SCRIPT_DIR / "runs" / "detect" / "optimized" / "sonar_optimized"
DEFAULT_BASELINE_DIR = SCRIPT_DIR / "runs" / "detect" / "runs" / "detect" / "extended_training" / "sonar_final"
GRAPH_OUTPUT_DIR = SCRIPT_DIR / "graphs"

CLASS_NAMES = [
    "cube", "ball", "cylinder", "human body", "plane",
    "circle cage", "square cage", "metal bucket", "tyre", "rov",
]

# Professional color scheme
COLORS = {
    "primary": "#2563eb",
    "secondary": "#dc2626",
    "accent": "#16a34a",
    "warning": "#f59e0b",
    "bg": "#0f172a",
    "card_bg": "#1e293b",
    "text": "#f8fafc",
    "grid": "#334155",
    "class_palette": [
        "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
        "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#a855f7",
    ],
}

# Global style
plt.rcParams.update({
    "figure.facecolor": COLORS["bg"],
    "axes.facecolor": COLORS["card_bg"],
    "axes.edgecolor": COLORS["grid"],
    "axes.labelcolor": COLORS["text"],
    "text.color": COLORS["text"],
    "xtick.color": COLORS["text"],
    "ytick.color": COLORS["text"],
    "grid.color": COLORS["grid"],
    "grid.alpha": 0.3,
    "font.family": "sans-serif",
    "font.size": 11,
    "axes.titlesize": 14,
    "axes.labelsize": 12,
    "legend.facecolor": COLORS["card_bg"],
    "legend.edgecolor": COLORS["grid"],
    "legend.fontsize": 10,
    "savefig.dpi": 200,
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.3,
})


# ==================== DATA LOADING ====================

def load_results_csv(csv_path):
    """Load training results from Ultralytics results.csv."""
    data = {}
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            for key, val in row.items():
                key = key.strip()
                try:
                    val = float(val.strip())
                except (ValueError, AttributeError):
                    continue
                if key not in data:
                    data[key] = []
                data[key].append(val)
    return data


def load_eval_results(json_path):
    """Load evaluation results JSON."""
    if json_path.exists():
        with open(json_path) as f:
            return json.load(f)
    return None


# ==================== GRAPH GENERATORS ====================

def plot_training_losses(data, output_dir, label=""):
    """Plot training loss curves (box, cls, dfl)."""
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    fig.suptitle(f"Training Loss Curves {label}", fontsize=16, fontweight="bold", y=1.02)

    loss_keys = [
        ("train/box_loss", "Box Loss", COLORS["primary"]),
        ("train/cls_loss", "Classification Loss", COLORS["secondary"]),
        ("train/dfl_loss", "DFL Loss", COLORS["accent"]),
    ]

    epochs = data.get("epoch", list(range(1, len(list(data.values())[0]) + 1)))

    for ax, (key, title, color) in zip(axes, loss_keys):
        if key in data:
            ax.plot(epochs, data[key], color=color, linewidth=2, alpha=0.9)
            ax.fill_between(epochs, data[key], alpha=0.1, color=color)
            ax.set_title(title, fontweight="bold")
            ax.set_xlabel("Epoch")
            ax.set_ylabel("Loss")
            ax.grid(True, alpha=0.3)
            # Add min annotation
            min_val = min(data[key])
            min_epoch = epochs[data[key].index(min_val)]
            ax.annotate(f"min: {min_val:.4f}\n(epoch {int(min_epoch)})",
                       xy=(min_epoch, min_val), fontsize=9,
                       bbox=dict(boxstyle="round,pad=0.3", facecolor=color, alpha=0.3))

    plt.tight_layout()
    path = output_dir / "training_losses.png"
    plt.savefig(path)
    plt.close()
    print(f"  ✓ Saved: {path}")


def plot_validation_losses(data, output_dir, label=""):
    """Plot validation loss curves."""
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    fig.suptitle(f"Validation Loss Curves {label}", fontsize=16, fontweight="bold", y=1.02)

    loss_keys = [
        ("val/box_loss", "Val Box Loss", COLORS["primary"]),
        ("val/cls_loss", "Val Cls Loss", COLORS["secondary"]),
        ("val/dfl_loss", "Val DFL Loss", COLORS["accent"]),
    ]

    epochs = data.get("epoch", list(range(1, len(list(data.values())[0]) + 1)))

    for ax, (key, title, color) in zip(axes, loss_keys):
        if key in data:
            ax.plot(epochs, data[key], color=color, linewidth=2, alpha=0.9)
            ax.fill_between(epochs, data[key], alpha=0.1, color=color)
            ax.set_title(title, fontweight="bold")
            ax.set_xlabel("Epoch")
            ax.set_ylabel("Loss")
            ax.grid(True, alpha=0.3)

    plt.tight_layout()
    path = output_dir / "validation_losses.png"
    plt.savefig(path)
    plt.close()
    print(f"  ✓ Saved: {path}")


def plot_map_progression(data, output_dir, label=""):
    """Plot mAP@0.5 and mAP@0.5:0.95 over epochs."""
    fig, ax = plt.subplots(figsize=(12, 6))
    fig.suptitle(f"mAP Progression {label}", fontsize=16, fontweight="bold")

    epochs = data.get("epoch", list(range(1, len(list(data.values())[0]) + 1)))

    map50_key = "metrics/mAP50(B)"
    map_key = "metrics/mAP50-95(B)"

    if map50_key in data:
        ax.plot(epochs, data[map50_key], color=COLORS["primary"], linewidth=2.5,
                label="mAP@0.5", marker="o", markersize=3)
        best_map50 = max(data[map50_key])
        best_epoch = epochs[data[map50_key].index(best_map50)]
        ax.axhline(y=best_map50, color=COLORS["primary"], linestyle="--", alpha=0.3)
        ax.annotate(f"Best: {best_map50:.4f} (ep {int(best_epoch)})",
                   xy=(best_epoch, best_map50), fontsize=10, fontweight="bold",
                   xytext=(10, 10), textcoords="offset points",
                   bbox=dict(boxstyle="round,pad=0.3", facecolor=COLORS["primary"], alpha=0.3),
                   arrowprops=dict(arrowstyle="->", color=COLORS["primary"]))

    if map_key in data:
        ax.plot(epochs, data[map_key], color=COLORS["accent"], linewidth=2.5,
                label="mAP@0.5:0.95", marker="s", markersize=3)
        best_map = max(data[map_key])
        best_epoch2 = epochs[data[map_key].index(best_map)]
        ax.axhline(y=best_map, color=COLORS["accent"], linestyle="--", alpha=0.3)
        ax.annotate(f"Best: {best_map:.4f} (ep {int(best_epoch2)})",
                   xy=(best_epoch2, best_map), fontsize=10, fontweight="bold",
                   xytext=(10, -20), textcoords="offset points",
                   bbox=dict(boxstyle="round,pad=0.3", facecolor=COLORS["accent"], alpha=0.3),
                   arrowprops=dict(arrowstyle="->", color=COLORS["accent"]))

    ax.set_xlabel("Epoch")
    ax.set_ylabel("mAP")
    ax.legend(loc="lower right", fontsize=12)
    ax.grid(True, alpha=0.3)
    ax.set_ylim(0, 1.0)

    plt.tight_layout()
    path = output_dir / "map_progression.png"
    plt.savefig(path)
    plt.close()
    print(f"  ✓ Saved: {path}")


def plot_precision_recall_curves(data, output_dir, label=""):
    """Plot precision and recall over epochs."""
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    fig.suptitle(f"Precision & Recall {label}", fontsize=16, fontweight="bold", y=1.02)

    epochs = data.get("epoch", list(range(1, len(list(data.values())[0]) + 1)))

    prec_key = "metrics/precision(B)"
    rec_key = "metrics/recall(B)"

    if prec_key in data:
        axes[0].plot(epochs, data[prec_key], color=COLORS["primary"], linewidth=2)
        axes[0].fill_between(epochs, data[prec_key], alpha=0.1, color=COLORS["primary"])
        axes[0].set_title("Precision", fontweight="bold")
        axes[0].set_xlabel("Epoch")
        axes[0].set_ylabel("Precision")
        axes[0].grid(True, alpha=0.3)
        axes[0].set_ylim(0, 1.0)

    if rec_key in data:
        axes[1].plot(epochs, data[rec_key], color=COLORS["accent"], linewidth=2)
        axes[1].fill_between(epochs, data[rec_key], alpha=0.1, color=COLORS["accent"])
        axes[1].set_title("Recall", fontweight="bold")
        axes[1].set_xlabel("Epoch")
        axes[1].set_ylabel("Recall")
        axes[1].grid(True, alpha=0.3)
        axes[1].set_ylim(0, 1.0)

    plt.tight_layout()
    path = output_dir / "precision_recall_curves.png"
    plt.savefig(path)
    plt.close()
    print(f"  ✓ Saved: {path}")


def plot_per_class_ap(eval_results, output_dir, label=""):
    """Plot per-class AP@0.5 bar chart."""
    if not eval_results or "per_class_ap50" not in eval_results:
        print("  ⚠️  No per-class AP data available. Skipping per-class chart.")
        return

    ap50 = eval_results["per_class_ap50"]
    ap = eval_results.get("per_class_ap", {})

    fig, ax = plt.subplots(figsize=(14, 7))
    fig.suptitle(f"Per-Class Average Precision {label}", fontsize=16, fontweight="bold")

    classes = list(ap50.keys())
    values_50 = [ap50[c] for c in classes]
    values_95 = [ap.get(c, 0) for c in classes]

    x = np.arange(len(classes))
    width = 0.35

    bars1 = ax.bar(x - width/2, values_50, width, label="AP@0.5",
                   color=COLORS["primary"], alpha=0.85, edgecolor="white", linewidth=0.5)
    bars2 = ax.bar(x + width/2, values_95, width, label="AP@0.5:0.95",
                   color=COLORS["accent"], alpha=0.85, edgecolor="white", linewidth=0.5)

    # Add value labels on bars
    for bar in bars1:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.01,
               f"{height:.3f}", ha="center", va="bottom", fontsize=8, fontweight="bold")
    for bar in bars2:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.01,
               f"{height:.3f}", ha="center", va="bottom", fontsize=8, fontweight="bold")

    ax.set_xlabel("Object Class")
    ax.set_ylabel("Average Precision")
    ax.set_xticks(x)
    ax.set_xticklabels(classes, rotation=30, ha="right")
    ax.legend(fontsize=12)
    ax.grid(True, axis="y", alpha=0.3)
    ax.set_ylim(0, 1.15)

    # Add overall mAP line
    mean_ap50 = np.mean(values_50)
    ax.axhline(y=mean_ap50, color=COLORS["warning"], linestyle="--", alpha=0.7,
              label=f"Mean AP@0.5: {mean_ap50:.3f}")
    ax.legend(fontsize=11)

    plt.tight_layout()
    path = output_dir / "per_class_ap.png"
    plt.savefig(path)
    plt.close()
    print(f"  ✓ Saved: {path}")


def plot_baseline_comparison(baseline_results, optimized_results, output_dir):
    """Plot side-by-side baseline vs optimized comparison."""
    fig, ax = plt.subplots(figsize=(12, 7))
    fig.suptitle("Baseline vs Optimized — Performance Comparison",
                fontsize=16, fontweight="bold")

    metrics = {
        "mAP@0.5": ("mAP50", "mAP50"),
        "mAP@0.5:0.95": ("mAP50_95", "mAP50_95"),
        "Precision": ("precision", "precision"),
        "Recall": ("recall", "recall"),
    }

    labels = list(metrics.keys())
    base_vals = [baseline_results.get(metrics[l][0], 0) for l in labels]
    opt_vals = [optimized_results.get(metrics[l][1], 0) for l in labels]

    x = np.arange(len(labels))
    width = 0.35

    bars1 = ax.bar(x - width/2, base_vals, width, label="Baseline (YOLOv8n)",
                   color=COLORS["secondary"], alpha=0.85, edgecolor="white", linewidth=0.5)
    bars2 = ax.bar(x + width/2, opt_vals, width, label="Optimized (YOLOv8l)",
                   color=COLORS["primary"], alpha=0.85, edgecolor="white", linewidth=0.5)

    # Value labels
    for bar in bars1:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.01,
               f"{height:.4f}", ha="center", va="bottom", fontsize=10, fontweight="bold")
    for bar in bars2:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.01,
               f"{height:.4f}", ha="center", va="bottom", fontsize=10, fontweight="bold")

    # Improvement arrows
    for i, (b, o) in enumerate(zip(base_vals, opt_vals)):
        if o > b:
            delta = o - b
            pct = (delta / max(b, 1e-6)) * 100
            ax.annotate(f"+{pct:.1f}%", xy=(i + width/2, o + 0.04),
                       fontsize=9, fontweight="bold", color=COLORS["accent"],
                       ha="center")

    ax.set_ylabel("Score")
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=12)
    ax.legend(fontsize=12, loc="upper right")
    ax.grid(True, axis="y", alpha=0.3)
    ax.set_ylim(0, 1.15)

    plt.tight_layout()
    path = output_dir / "baseline_vs_optimized.png"
    plt.savefig(path)
    plt.close()
    print(f"  ✓ Saved: {path}")


def plot_combined_dashboard(data, eval_results, output_dir, label=""):
    """Create a combined dashboard with all key metrics."""
    fig = plt.figure(figsize=(20, 12))
    fig.suptitle(f"Training Dashboard — UATD Sonar Detection {label}",
                fontsize=20, fontweight="bold", y=0.98)

    gs = GridSpec(2, 3, figure=fig, hspace=0.35, wspace=0.3)

    epochs = data.get("epoch", list(range(1, len(list(data.values())[0]) + 1)))

    # 1. Training losses
    ax1 = fig.add_subplot(gs[0, 0])
    for key, label_name, color in [("train/box_loss", "Box", COLORS["primary"]),
                                    ("train/cls_loss", "Cls", COLORS["secondary"]),
                                    ("train/dfl_loss", "DFL", COLORS["accent"])]:
        if key in data:
            ax1.plot(epochs, data[key], color=color, linewidth=1.5, label=label_name)
    ax1.set_title("Training Losses", fontweight="bold")
    ax1.set_xlabel("Epoch")
    ax1.legend(fontsize=9)
    ax1.grid(True, alpha=0.3)

    # 2. mAP progression
    ax2 = fig.add_subplot(gs[0, 1])
    for key, label_name, color in [("metrics/mAP50(B)", "mAP@0.5", COLORS["primary"]),
                                    ("metrics/mAP50-95(B)", "mAP@0.5:0.95", COLORS["accent"])]:
        if key in data:
            ax2.plot(epochs, data[key], color=color, linewidth=2, label=label_name)
    ax2.set_title("mAP Progression", fontweight="bold")
    ax2.set_xlabel("Epoch")
    ax2.legend(fontsize=9)
    ax2.grid(True, alpha=0.3)
    ax2.set_ylim(0, 1.0)

    # 3. Precision & Recall
    ax3 = fig.add_subplot(gs[0, 2])
    for key, label_name, color in [("metrics/precision(B)", "Precision", COLORS["primary"]),
                                    ("metrics/recall(B)", "Recall", COLORS["accent"])]:
        if key in data:
            ax3.plot(epochs, data[key], color=color, linewidth=2, label=label_name)
    ax3.set_title("Precision & Recall", fontweight="bold")
    ax3.set_xlabel("Epoch")
    ax3.legend(fontsize=9)
    ax3.grid(True, alpha=0.3)
    ax3.set_ylim(0, 1.0)

    # 4. Val losses
    ax4 = fig.add_subplot(gs[1, 0])
    for key, label_name, color in [("val/box_loss", "Box", COLORS["primary"]),
                                    ("val/cls_loss", "Cls", COLORS["secondary"]),
                                    ("val/dfl_loss", "DFL", COLORS["accent"])]:
        if key in data:
            ax4.plot(epochs, data[key], color=color, linewidth=1.5, label=label_name)
    ax4.set_title("Validation Losses", fontweight="bold")
    ax4.set_xlabel("Epoch")
    ax4.legend(fontsize=9)
    ax4.grid(True, alpha=0.3)

    # 5. Per-class AP bar chart
    ax5 = fig.add_subplot(gs[1, 1:])
    if eval_results and "per_class_ap50" in eval_results:
        ap50 = eval_results["per_class_ap50"]
        classes = list(ap50.keys())
        values = [ap50[c] for c in classes]
        bars = ax5.bar(range(len(classes)), values,
                      color=COLORS["class_palette"][:len(classes)],
                      alpha=0.85, edgecolor="white", linewidth=0.5)
        for bar, val in zip(bars, values):
            ax5.text(bar.get_x() + bar.get_width()/2., bar.get_height() + 0.01,
                    f"{val:.3f}", ha="center", va="bottom", fontsize=8, fontweight="bold")
        ax5.set_xticks(range(len(classes)))
        ax5.set_xticklabels(classes, rotation=25, ha="right", fontsize=9)
        ax5.set_ylim(0, 1.15)
        mean_ap = np.mean(values)
        ax5.axhline(y=mean_ap, color=COLORS["warning"], linestyle="--", alpha=0.7)
        ax5.set_title(f"Per-Class AP@0.5 (mean: {mean_ap:.3f})", fontweight="bold")
    else:
        ax5.text(0.5, 0.5, "Run evaluate_model.py first\nfor per-class metrics",
                ha="center", va="center", fontsize=14, transform=ax5.transAxes)
        ax5.set_title("Per-Class AP@0.5", fontweight="bold")
    ax5.grid(True, axis="y", alpha=0.3)

    path = output_dir / "training_dashboard.png"
    plt.savefig(path)
    plt.close()
    print(f"  ✓ Saved: {path}")


def copy_ultralytics_plots(run_dir, output_dir):
    """Copy confusion matrix and PR curves from Ultralytics output."""
    plots_to_copy = [
        "confusion_matrix.png",
        "confusion_matrix_normalized.png",
        "BoxF1_curve.png",
        "BoxPR_curve.png",
        "BoxP_curve.png",
        "BoxR_curve.png",
        "results.png",
    ]

    import shutil
    copied = 0
    for plot_name in plots_to_copy:
        src = run_dir / plot_name
        if src.exists():
            dst = output_dir / plot_name
            shutil.copy2(src, dst)
            copied += 1
            print(f"  ✓ Copied: {dst}")

    if copied == 0:
        print("  ⚠️  No Ultralytics plots found in run directory.")


# ==================== MAIN ====================

def main():
    parser = argparse.ArgumentParser(description="Generate training graphs for UATD Sonar Detection")
    parser.add_argument("--run-dir", type=str, default=str(DEFAULT_RUN_DIR),
                       help="Path to training run directory")
    parser.add_argument("--baseline-dir", type=str, default=str(DEFAULT_BASELINE_DIR),
                       help="Path to baseline run directory")
    parser.add_argument("--output-dir", type=str, default=str(GRAPH_OUTPUT_DIR),
                       help="Output directory for graphs")
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    baseline_dir = Path(args.baseline_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 70)
    print("  GENERATING TRAINING GRAPHS")
    print("=" * 70)
    print(f"  Run directory    : {run_dir}")
    print(f"  Baseline dir     : {baseline_dir}")
    print(f"  Output directory : {output_dir}")
    print("=" * 70 + "\n")

    # Load results
    results_csv = run_dir / "results.csv"
    if not results_csv.exists():
        print(f"  ❌ Results CSV not found: {results_csv}")
        print("  Train first: python train_optimized.py")
        return

    data = load_results_csv(results_csv)
    eval_json = run_dir / "evaluation_results.json"
    eval_results = load_eval_results(eval_json)

    # Generate all graphs
    print("  Generating graphs...\n")
    plot_training_losses(data, output_dir, label="(Optimized)")
    plot_validation_losses(data, output_dir, label="(Optimized)")
    plot_map_progression(data, output_dir, label="(Optimized)")
    plot_precision_recall_curves(data, output_dir, label="(Optimized)")
    plot_per_class_ap(eval_results, output_dir, label="(Optimized)")
    plot_combined_dashboard(data, eval_results, output_dir, label="(Optimized)")

    # Copy Ultralytics-generated plots
    print("\n  Copying Ultralytics plots...")
    copy_ultralytics_plots(run_dir, output_dir)

    # Baseline comparison
    baseline_csv = baseline_dir / "results.csv"
    if baseline_csv.exists():
        print("\n  Generating baseline comparison...")
        baseline_data = load_results_csv(baseline_csv)

        # Create comparison mAP chart
        baseline_eval = load_eval_results(baseline_dir / "evaluation_results.json")

        # Build simple baseline results from CSV if no JSON
        if not baseline_eval:
            map50_key = "metrics/mAP50(B)"
            map_key = "metrics/mAP50-95(B)"
            prec_key = "metrics/precision(B)"
            rec_key = "metrics/recall(B)"
            baseline_eval = {
                "mAP50": max(baseline_data.get(map50_key, [0])),
                "mAP50_95": max(baseline_data.get(map_key, [0])),
                "precision": max(baseline_data.get(prec_key, [0])),
                "recall": max(baseline_data.get(rec_key, [0])),
            }

        if eval_results:
            opt_summary = {
                "mAP50": eval_results.get("mAP50", 0),
                "mAP50_95": eval_results.get("mAP50_95", 0),
                "precision": eval_results.get("precision", 0),
                "recall": eval_results.get("recall", 0),
            }
            plot_baseline_comparison(baseline_eval, opt_summary, output_dir)
        else:
            # Use best values from CSV
            map50_key = "metrics/mAP50(B)"
            map_key = "metrics/mAP50-95(B)"
            prec_key = "metrics/precision(B)"
            rec_key = "metrics/recall(B)"
            opt_summary = {
                "mAP50": max(data.get(map50_key, [0])),
                "mAP50_95": max(data.get(map_key, [0])),
                "precision": max(data.get(prec_key, [0])),
                "recall": max(data.get(rec_key, [0])),
            }
            plot_baseline_comparison(baseline_eval, opt_summary, output_dir)

        # Overlay mAP progression both
        fig, ax = plt.subplots(figsize=(14, 6))
        fig.suptitle("mAP@0.5 — Baseline vs Optimized", fontsize=16, fontweight="bold")

        map50_key = "metrics/mAP50(B)"
        if map50_key in baseline_data:
            epochs_b = baseline_data.get("epoch", list(range(1, len(baseline_data[map50_key]) + 1)))
            ax.plot(epochs_b, baseline_data[map50_key], color=COLORS["secondary"],
                   linewidth=2, alpha=0.7, label="Baseline (YOLOv8n)", linestyle="--")
        if map50_key in data:
            epochs_o = data.get("epoch", list(range(1, len(data[map50_key]) + 1)))
            ax.plot(epochs_o, data[map50_key], color=COLORS["primary"],
                   linewidth=2.5, label="Optimized (YOLOv8l)")

        ax.set_xlabel("Epoch")
        ax.set_ylabel("mAP@0.5")
        ax.legend(fontsize=12)
        ax.grid(True, alpha=0.3)
        ax.set_ylim(0, 1.0)

        plt.tight_layout()
        path = output_dir / "map_comparison_overlay.png"
        plt.savefig(path)
        plt.close()
        print(f"  ✓ Saved: {path}")
    else:
        print(f"\n  ⚠️  Baseline results not found at: {baseline_csv}")
        print("  Skipping comparison graphs.")

    print(f"\n{'='*70}")
    print(f"  ✓ ALL GRAPHS SAVED TO: {output_dir}")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
