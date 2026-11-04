#!/usr/bin/env python3
"""Run a review-only SAM 2 mask propagation canary."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from sam2.build_sam import build_sam2_video_predictor

SAM2_COMMIT = "2b90b9f5ceec907a1c18123530e92e794ad901a4"
MODEL_CONFIG = "configs/sam2.1/sam2.1_hiera_t.yaml"


def sha256_file(file_path: Path) -> str:
    return hashlib.sha256(file_path.read_bytes()).hexdigest()


def mask_bounds(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask > 0)
    if not len(xs):
        raise RuntimeError("sam2-canary-initial-mask-empty")
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def consecutive_iou(left: np.ndarray, right: np.ndarray) -> float:
    intersection = int(np.count_nonzero(left & right))
    union = int(np.count_nonzero(left | right))
    return 1.0 if union == 0 else intersection / union


def build_contact_sheet(frame_files: list[Path], masks: list[np.ndarray], output_file: Path) -> None:
    tile_width, tile_height = 480, 270
    columns = 3
    rows = (len(frame_files) + columns - 1) // columns
    board = Image.new("RGB", (tile_width * columns, tile_height * rows), "#101217")
    for index, (frame_file, mask) in enumerate(zip(frame_files, masks)):
        frame = Image.open(frame_file).convert("RGB")
        overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        alpha = Image.fromarray((mask.astype(np.uint8) * 112), mode="L")
        color = Image.new("RGBA", frame.size, (70, 220, 126, 0))
        color.putalpha(alpha)
        overlay.alpha_composite(color)
        composite = Image.alpha_composite(frame.convert("RGBA"), overlay).convert("RGB").resize((tile_width, tile_height), Image.Resampling.LANCZOS)
        draw = ImageDraw.Draw(composite)
        draw.rectangle((0, 0, 116, 26), fill=(16, 18, 23))
        draw.text((8, 7), f"FRAME {index:02d}", fill=(244, 234, 215))
        board.paste(composite, ((index % columns) * tile_width, (index // columns) * tile_height))
    board.save(output_file)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--initial-mask", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--shot-id", required=True)
    parser.add_argument("--source-disposition", choices=("CURRENT_IMPORTED_SOURCE_RESEARCH_ONLY", "HISTORY_RESEARCH_ONLY"), required=True)
    parser.add_argument("--device", choices=("cpu", "mps"), default="cpu")
    args = parser.parse_args()

    frames_dir = Path(args.frames_dir).resolve()
    initial_mask_file = Path(args.initial_mask).resolve()
    checkpoint = Path(args.checkpoint).resolve()
    output_dir = Path(args.output_dir).resolve()
    mask_dir = output_dir / "masks"
    mask_dir.mkdir(parents=True, exist_ok=True)
    frame_files = sorted([*frames_dir.glob("*.jpg"), *frames_dir.glob("*.jpeg")])
    if not frame_files:
        raise RuntimeError("sam2-canary-frames-missing")
    first = Image.open(frame_files[0]).convert("RGB")
    width, height = first.size
    initial = Image.open(initial_mask_file).convert("L").resize((width, height), Image.Resampling.NEAREST)
    initial_array = np.asarray(initial) > 127
    x0, y0, x1, y1 = mask_bounds(initial_array)
    pad_x = max(2, round((x1 - x0 + 1) * 0.015))
    pad_y = max(2, round((y1 - y0 + 1) * 0.015))
    box = np.asarray([max(0, x0 - pad_x), max(0, y0 - pad_y), min(width - 1, x1 + pad_x), min(height - 1, y1 + pad_y)], dtype=np.float32)

    device = torch.device(args.device)
    torch.set_float32_matmul_precision("high")
    predictor = build_sam2_video_predictor(MODEL_CONFIG, str(checkpoint), device=device)
    masks_by_frame: dict[int, np.ndarray] = {}
    with torch.inference_mode():
        state = predictor.init_state(video_path=str(frames_dir), offload_video_to_cpu=True, offload_state_to_cpu=True)
        predictor.add_new_points_or_box(inference_state=state, frame_idx=0, obj_id=1, box=box)
        for frame_index, object_ids, mask_logits in predictor.propagate_in_video(state):
            if 1 not in [int(value) for value in object_ids]:
                continue
            object_index = [int(value) for value in object_ids].index(1)
            mask = (mask_logits[object_index, 0].detach().cpu().numpy() > 0)
            masks_by_frame[int(frame_index)] = mask
    if sorted(masks_by_frame) != list(range(len(frame_files))):
        raise RuntimeError(f"sam2-canary-frame-coverage-invalid:{sorted(masks_by_frame)}")

    outputs = []
    masks = []
    for frame_index, frame_file in enumerate(frame_files):
        mask = masks_by_frame[frame_index]
        masks.append(mask)
        output_file = mask_dir / f"{frame_index:05d}.png"
        Image.fromarray((mask.astype(np.uint8) * 255), mode="L").save(output_file)
        outputs.append({
            "frameIndex": frame_index,
            "sourceFrame": str(frame_file),
            "sourceSha256": sha256_file(frame_file),
            "file": str(output_file),
            "sha256": sha256_file(output_file),
            "nonzeroPixels": int(np.count_nonzero(mask)),
        })
    ious = [consecutive_iou(masks[index - 1], masks[index]) for index in range(1, len(masks))]
    contact_sheet = output_dir / "sam2-mask-contact-sheet.jpg"
    build_contact_sheet(frame_files, masks, contact_sheet)
    report = {
        "contract": "A1TypographySam2VideoCanary/v1",
        "status": "PASS" if min(ious, default=1.0) >= 0.75 else "TEMPORAL_IOU_FAIL",
        "shotId": args.shot_id,
        "sourceDisposition": args.source_disposition,
        "frameCount": len(frame_files),
        "frameSize": {"width": width, "height": height},
        "initialPrompt": {"kind": "BOX_FROM_EXISTING_PRESENTER_MASK", "box": box.tolist(), "maskFile": str(initial_mask_file), "maskSha256": sha256_file(initial_mask_file)},
        "engine": {"family": "SAM 2", "commit": SAM2_COMMIT, "modelConfig": MODEL_CONFIG, "checkpoint": str(checkpoint), "checkpointSha256": sha256_file(checkpoint), "device": str(device), "torchVersion": torch.__version__},
        "outputs": outputs,
        "temporal": {"consecutiveIou": [round(value, 7) for value in ious], "minimumConsecutiveIou": round(min(ious, default=1.0), 7), "meanConsecutiveIou": round(float(np.mean(ious)) if ious else 1.0, 7)},
        "contactSheet": {"file": str(contact_sheet), "sha256": sha256_file(contact_sheet)},
        "reviewOnly": True,
        "productionAdmission": False,
        "motionStarted": False,
    }
    report_file = output_dir / "report.json"
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "frameCount": report["frameCount"], "minimumConsecutiveIou": report["temporal"]["minimumConsecutiveIou"], "reportFile": str(report_file)}, ensure_ascii=False))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
