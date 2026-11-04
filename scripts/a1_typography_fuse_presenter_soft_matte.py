#!/usr/bin/env python3
"""Fuse semantic, matting, temporal, and pose masks into person-only soft alpha."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def sha256_file(file_path: Path) -> str:
    return hashlib.sha256(file_path.read_bytes()).hexdigest()


def load_gray(file_path: Path, size: tuple[int, int], *, soft: bool) -> np.ndarray:
    image = Image.open(file_path).convert("L")
    resampling = Image.Resampling.BILINEAR if soft else Image.Resampling.NEAREST
    return np.asarray(image.resize(size, resampling), dtype=np.float32) / 255.0


def iou(left: np.ndarray, right: np.ndarray) -> float:
    intersection = int(np.count_nonzero(left & right))
    union = int(np.count_nonzero(left | right))
    return 1.0 if union == 0 else intersection / union


def coverage(target: np.ndarray, gate: np.ndarray) -> float:
    return int(np.count_nonzero(target & gate)) / max(1, int(np.count_nonzero(target)))


def ellipse(radius: int) -> np.ndarray:
    size = radius * 2 + 1
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))


def retain_components_touching_semantic(model_mask: np.ndarray, semantic: np.ndarray) -> tuple[np.ndarray, int, int]:
    count, labels = cv2.connectedComponents(model_mask.astype(np.uint8), connectivity=8)
    retained = np.zeros_like(model_mask, dtype=bool)
    retained_components = 0
    removed_pixels = 0
    semantic_touch = cv2.dilate(semantic.astype(np.uint8), ellipse(3)) > 0
    for component in range(1, count):
        region = labels == component
        if np.any(region & semantic_touch):
            retained |= region
            retained_components += 1
        else:
            removed_pixels += int(np.count_nonzero(region))
    return retained, removed_pixels, retained_components


def equipment_overlap(alpha: np.ndarray, equipment: np.ndarray) -> tuple[int, int, float]:
    equipment_pixels = int(np.count_nonzero(equipment))
    overlap_pixels = int(np.count_nonzero((alpha >= 0.5) & equipment))
    return equipment_pixels, overlap_pixels, overlap_pixels / max(1, equipment_pixels)


def alpha_stats(alpha: np.ndarray) -> dict[str, int | float]:
    values = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    intermediate = int(np.count_nonzero((values > 0) & (values < 255)))
    nonzero = int(np.count_nonzero(values))
    return {
        "nonzeroPixels": nonzero,
        "opaquePixels": int(np.count_nonzero(values == 255)),
        "intermediateAlphaPixels": intermediate,
        "intermediateRatioOfNonzero": intermediate / max(1, nonzero),
        "uniqueAlphaValues": int(np.unique(values).size),
    }


def overlay_tile(source: Image.Image, alpha: np.ndarray, color: tuple[int, int, int], label: str) -> Image.Image:
    rgba = source.convert("RGBA")
    overlay = Image.new("RGBA", source.size, (*color, 0))
    overlay.putalpha(Image.fromarray(np.clip(alpha * 150.0, 0, 150).astype(np.uint8), mode="L"))
    rgba.alpha_composite(overlay)
    tile = rgba.convert("RGB").resize((480, 270), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(tile)
    draw.rectangle((0, 0, 226, 28), fill=(16, 18, 23))
    draw.text((8, 8), label, fill=(244, 234, 215))
    return tile


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--face-mask", required=True)
    parser.add_argument("--hair-mask", required=True)
    parser.add_argument("--body-mask", required=True)
    parser.add_argument("--microphone-mask", required=True)
    parser.add_argument("--boom-mask", required=True)
    parser.add_argument("--birefnet-mask", required=True)
    parser.add_argument("--sam2-mask", required=True)
    parser.add_argument("--mediapipe-mask", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--shot-id", required=True)
    args = parser.parse_args()

    paths = {name: Path(value).resolve() for name, value in vars(args).items() if name not in {"output_dir", "shot_id"}}
    for file_path in paths.values():
        if not file_path.is_file():
            raise FileNotFoundError(f"fused-matte-input-missing:{file_path}")
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    source_image = Image.open(paths["source"]).convert("RGB")
    width, height = source_image.size
    size = (width, height)
    source_bgr = cv2.cvtColor(np.asarray(source_image), cv2.COLOR_RGB2BGR)
    face = load_gray(paths["face_mask"], size, soft=False) >= 0.5
    hair = load_gray(paths["hair_mask"], size, soft=False) >= 0.5
    body = load_gray(paths["body_mask"], size, soft=False) >= 0.5
    microphone = load_gray(paths["microphone_mask"], size, soft=False) >= 0.5
    boom = load_gray(paths["boom_mask"], size, soft=False) >= 0.5
    equipment = microphone | boom
    identity_critical = face | hair
    equipment_exclusion = cv2.dilate(equipment.astype(np.uint8), ellipse(2)) > 0
    equipment_exclusion &= ~identity_critical
    semantic_raw = face | hair | body
    semantic_equipment_pixels_removed = int(np.count_nonzero(semantic_raw & equipment_exclusion))
    semantic = semantic_raw & ~equipment_exclusion
    birefnet = load_gray(paths["birefnet_mask"], size, soft=True)
    sam2 = load_gray(paths["sam2_mask"], size, soft=False) >= 0.5
    mediapipe_soft = load_gray(paths["mediapipe_mask"], size, soft=True)
    mediapipe = mediapipe_soft >= 0.35

    sam2_iou = iou(semantic, sam2)
    sam2_coverage = coverage(semantic, sam2)
    mediapipe_iou = iou(semantic, mediapipe)
    mediapipe_coverage = coverage(semantic, mediapipe)
    if sam2_iou < 0.75 or sam2_coverage < 0.85:
        raise RuntimeError(f"fused-matte-sam2-alignment-failed:{sam2_iou:.6f}:{sam2_coverage:.6f}")
    if mediapipe_iou < 0.70 or mediapipe_coverage < 0.85:
        raise RuntimeError(f"fused-matte-mediapipe-alignment-failed:{mediapipe_iou:.6f}:{mediapipe_coverage:.6f}")

    semantic_u8 = semantic.astype(np.uint8)
    core = cv2.erode(semantic_u8, ellipse(3)) > 0
    semantic_outer = cv2.dilate(semantic_u8, ellipse(20)) > 0
    semantic_inner = cv2.erode(semantic_u8, ellipse(6)) > 0
    boundary_band = semantic_outer & ~semantic_inner
    sam2_gate = cv2.dilate(sam2.astype(np.uint8), ellipse(12)) > 0
    mediapipe_gate = cv2.dilate(mediapipe.astype(np.uint8), ellipse(12)) > 0
    identity_gate = semantic_outer & sam2_gate & mediapipe_gate

    component_mask, removed_disconnected_pixels, retained_components = retain_components_touching_semantic(birefnet >= 0.02, semantic)
    inside_distance = cv2.distanceTransform(semantic_u8, cv2.DIST_L2, 5)
    outside_distance = cv2.distanceTransform((~semantic).astype(np.uint8), cv2.DIST_L2, 5)
    feather_width = 2.5
    semantic_alpha = np.clip((inside_distance - outside_distance + feather_width) / (feather_width * 2.0), 0.0, 1.0).astype(np.float32)

    model_boundary = birefnet.astype(np.float32) * boundary_band.astype(np.float32) * identity_gate.astype(np.float32) * component_mask.astype(np.float32)
    model_boundary[equipment_exclusion] = 0.0
    model_contribution = model_boundary > (semantic_alpha + 1.0 / 255.0)
    fused = np.maximum(semantic_alpha, model_boundary)

    guide = cv2.cvtColor(source_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    refined = cv2.ximgproc.guidedFilter(guide=guide, src=fused.astype(np.float32), radius=6, eps=1e-4)
    refined = np.clip(refined, 0.0, 1.0)
    refined[~(semantic_outer | semantic)] = 0.0
    refined[equipment_exclusion] = 0.0
    refined[core] = 1.0

    final_binary = refined >= 0.02
    count, labels = cv2.connectedComponents(final_binary.astype(np.uint8), connectivity=8)
    retained_final = np.zeros_like(final_binary)
    removed_after_guided = 0
    for component in range(1, count):
        region = labels == component
        if np.any(region & core):
            retained_final |= region
        else:
            removed_after_guided += int(np.count_nonzero(region))
    refined[~retained_final] = 0.0
    refined[core] = 1.0

    semantic_core_retention = float(np.mean(refined[core] >= 0.999)) if np.any(core) else 0.0
    microphone_pixels, microphone_overlap, microphone_ratio = equipment_overlap(refined, microphone)
    boom_pixels, boom_overlap, boom_ratio = equipment_overlap(refined, boom)
    stats = alpha_stats(refined)
    model_contribution_pixels = int(np.count_nonzero(model_contribution & (refined > semantic_alpha + 1.0 / 255.0)))
    removed_disconnected_total = removed_disconnected_pixels + removed_after_guided

    mask_file = output_dir / "ed-01-fused-presenter-soft-alpha.png"
    alpha_u8 = np.clip(np.round(refined * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(alpha_u8, mode="L").save(mask_file)
    cutout_file = output_dir / "ed-01-fused-presenter-cutout.png"
    cutout = source_image.convert("RGBA")
    cutout.putalpha(Image.fromarray(alpha_u8, mode="L"))
    cutout.save(cutout_file)

    board = Image.new("RGB", (960, 540), "#101217")
    board.paste(overlay_tile(source_image, semantic.astype(np.float32), (74, 210, 126), "SEMANTIC BINARY CORE"), (0, 0))
    board.paste(overlay_tile(source_image, birefnet, (235, 80, 176), "BIREFNET RAW"), (480, 0))
    board.paste(overlay_tile(source_image, refined, (70, 190, 235), "FUSED PERSON-ONLY ALPHA"), (0, 270))
    cutout_preview = Image.new("RGB", size, "#232831")
    cutout_preview.paste(source_image, mask=Image.fromarray(alpha_u8, mode="L"))
    cutout_preview = cutout_preview.resize((480, 270), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(cutout_preview)
    draw.rectangle((0, 0, 226, 28), fill=(16, 18, 23))
    draw.text((8, 8), "FUSED CUTOUT", fill=(244, 234, 215))
    board.paste(cutout_preview, (480, 270))
    contact_sheet_file = output_dir / "ed-01-fused-presenter-matte-contact-sheet.jpg"
    board.save(contact_sheet_file, quality=94)

    checks = {
        "modelContribution": model_contribution_pixels > 1000,
        "continuousAlpha": stats["intermediateAlphaPixels"] > 10000,
        "semanticCoreRetained": semantic_core_retention >= 0.9999,
        "microphoneRemoved": microphone_ratio < 0.01,
        "boomRemoved": boom_ratio < 0.01,
        "disconnectedPixelsRemoved": removed_disconnected_total > 0,
    }
    status = "PASS" if all(checks.values()) else "FAIL"
    report = {
        "contract": "A1TypographyFusedPresenterSoftMatte/v1",
        "status": status,
        "shotId": args.shot_id,
        "inputs": {
            "source": {"file": str(paths["source"]), "sha256": sha256_file(paths["source"])},
            "semantic": {"files": [str(paths["face_mask"]), str(paths["hair_mask"]), str(paths["body_mask"])], "disposition": "CONSUMED_HIGH_CONFIDENCE_CORE"},
            "birefnet": {"file": str(paths["birefnet_mask"]), "sha256": sha256_file(paths["birefnet_mask"]), "disposition": "CONSUMED_SOFT_BOUNDARY_ONLY"},
            "sam2": {"file": str(paths["sam2_mask"]), "sha256": sha256_file(paths["sam2_mask"]), "disposition": "CONSUMED_IDENTITY_GATE", "iouWithSemantic": round(sam2_iou, 7), "semanticCoverage": round(sam2_coverage, 7)},
            "mediapipe": {"file": str(paths["mediapipe_mask"]), "sha256": sha256_file(paths["mediapipe_mask"]), "disposition": "CONSUMED_POSE_GATE", "iouWithSemantic": round(mediapipe_iou, 7), "semanticCoverage": round(mediapipe_coverage, 7)},
            "equipment": {"microphone": str(paths["microphone_mask"]), "boom": str(paths["boom_mask"]), "disposition": "SUBTRACTED_FROM_SOFT_BOUNDARY"},
        },
        "refinement": {"sourceGuided": True, "guidedFilterRadius": 6, "guidedFilterEpsilon": 1e-4, "semanticFeatherWidthPx": feather_width, "modelBoundaryBandOuterPx": 20, "modelBoundaryBandInnerPx": 6, "equipmentSubtractionRadiusPx": 2},
        "metrics": {
            **stats,
            "modelContributionPixels": model_contribution_pixels,
            "semanticCorePixels": int(np.count_nonzero(core)),
            "semanticCoreRetentionRatio": semantic_core_retention,
            "microphonePixels": microphone_pixels,
            "microphoneHighAlphaOverlapPixels": microphone_overlap,
            "microphoneHighAlphaOverlapRatio": microphone_ratio,
            "boomPixels": boom_pixels,
            "boomHighAlphaOverlapPixels": boom_overlap,
            "boomHighAlphaOverlapRatio": boom_ratio,
            "removedDisconnectedPixels": removed_disconnected_total,
            "retainedModelComponents": retained_components,
            "semanticEquipmentPixelsRemoved": semantic_equipment_pixels_removed,
        },
        "checks": checks,
        "outputs": {
            "mask": {"file": str(mask_file), "sha256": sha256_file(mask_file), "width": width, "height": height},
            "cutout": {"file": str(cutout_file), "sha256": sha256_file(cutout_file), "width": width, "height": height},
            "contactSheet": {"file": str(contact_sheet_file), "sha256": sha256_file(contact_sheet_file), "width": 960, "height": 540},
        },
        "reviewOnly": True,
        "productionAdmission": False,
    }
    report_file = output_dir / "report.json"
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "reportFile": str(report_file), "metrics": report["metrics"]}, ensure_ascii=False))
    return 0 if status == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
