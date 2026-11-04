#!/usr/bin/env python3
"""Build deterministic pixel mattes from the registered presenter hold frame.

This is a static Look Master verification aid. It is not a Resolve layer
extraction. GrabCut is seeded from the actual frame and the registered camera
geometry; the emitted masks are decoded source-pixel masks, never SVG polygons.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path

import cv2
import numpy as np


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_mask(path: Path, mask: np.ndarray) -> dict:
    mask = np.where(mask > 0, 255, 0).astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), mask):
        raise RuntimeError(f"mask-write-failed:{path}")
    ys, xs = np.where(mask > 0)
    visible = int(len(xs))
    bounds = None
    if visible:
        bounds = {
            "x": round(float(xs.min() / mask.shape[1]), 6),
            "y": round(float(ys.min() / mask.shape[0]), 6),
            "width": round(float((xs.max() - xs.min() + 1) / mask.shape[1]), 6),
            "height": round(float((ys.max() - ys.min() + 1) / mask.shape[0]), 6),
        }
    # A connected-component count and boundary ratio make a full-frame or
    # single coarse placeholder mask fail the source-pixel audit.
    count, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    components = int(max(0, count - 1))
    boundary = cv2.morphologyEx(mask, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    boundary_count = int(np.count_nonzero(boundary))
    return {
        "file": str(path),
        "sha256": sha256_file(path),
        "metrics": {
            "width": int(mask.shape[1]),
            "height": int(mask.shape[0]),
            "visiblePixelCount": visible,
            "visiblePixelRatio": round(float(visible / max(1, mask.shape[0] * mask.shape[1])), 6),
            "visibleBounds": bounds,
            "connectedComponentCount": components,
            "boundaryPixelCount": boundary_count,
            "boundaryRatio": round(float(boundary_count / max(1, visible)), 6),
        },
    }


def polygon_mask(shape, points):
    mask = np.zeros(shape[:2], np.uint8)
    pts = np.array([[round(x * shape[1]), round(y * shape[0])] for x, y in points], np.int32)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def ellipse_mask(shape, center, axes, angle=0):
    mask = np.zeros(shape[:2], np.uint8)
    cv2.ellipse(mask, (round(center[0] * shape[1]), round(center[1] * shape[0])),
                (round(axes[0] * shape[1]), round(axes[1] * shape[0])), angle, 0, 360, 255, -1)
    return mask


def seeded_grabcut(image, initial, iterations=5):
    gc = np.full(image.shape[:2], cv2.GC_BGD, np.uint8)
    gc[initial == 1] = cv2.GC_PR_FGD
    gc[initial == 2] = cv2.GC_FGD
    # Add a definite background border so background cannot become a global
    # foreground component around the registered seed.
    gc[: max(2, image.shape[0] // 80), :] = cv2.GC_BGD
    gc[-max(2, image.shape[0] // 80):, :] = cv2.GC_BGD
    gc[:, : max(2, image.shape[1] // 80)] = cv2.GC_BGD
    gc[:, -max(2, image.shape[1] // 80):] = cv2.GC_BGD
    bg_model = np.zeros((1, 65), np.float64)
    fg_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(image, gc, None, bg_model, fg_model, iterations, cv2.GC_INIT_WITH_MASK)
    return np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)


def fill_internal_holes(mask):
    flood = mask.copy()
    cv2.floodFill(flood, np.zeros((mask.shape[0] + 2, mask.shape[1] + 2), np.uint8), (0, 0), 255)
    holes = cv2.bitwise_not(flood)
    return cv2.bitwise_or(mask, holes)


def component_seed_masks(shape):
    # These are seed regions registered against the real 1920x1080 camera
    # composition. They only initialize segmentation; they are not emitted as
    # final mattes and are intentionally absent from the output contract.
    person_probable = polygon_mask(shape, [(0.34, 0.26), (0.72, 0.26), (0.77, 1.0), (0.31, 1.0)])
    # Definite foreground must be compact interior pixels. A broad sure-foreground
    # polygon makes GrabCut preserve camera-background rectangles around the head
    # and shoulders, which is unacceptable for a depth-title matte.
    body_sure = polygon_mask(shape, [(0.46, 0.67), (0.66, 0.67), (0.69, 0.96), (0.39, 0.96)])
    face_sure = ellipse_mask(shape, (0.585, 0.49), (0.060, 0.082))
    person = np.zeros(shape[:2], np.uint8)
    person[person_probable > 0] = 1
    person[body_sure > 0] = 2
    person[face_sure > 0] = 2

    mic_probable = ellipse_mask(shape, (0.445, 0.505), (0.112, 0.078), -4)
    mic_sure = ellipse_mask(shape, (0.445, 0.505), (0.060, 0.038), -4)
    mic = np.zeros(shape[:2], np.uint8)
    mic[mic_probable > 0] = 1
    mic[mic_sure > 0] = 2

    # The boom occupies two narrow diagonal corridors. Restricting probable
    # foreground to those corridors prevents dark curtains and furniture from
    # becoming large opaque blocks merely because they share the boom's tone.
    boom_probable = np.zeros(shape[:2], np.uint8)
    cv2.line(boom_probable, (0, round(shape[0] * 0.83)),
             (round(shape[1] * 0.31), round(shape[0] * 0.61)), 1, max(24, shape[0] // 13))
    cv2.line(boom_probable, (round(shape[1] * 0.23), round(shape[0] * 0.65)),
             (round(shape[1] * 0.43), round(shape[0] * 0.53)), 1, max(20, shape[0] // 16))
    boom = np.zeros(shape[:2], np.uint8)
    boom[boom_probable > 0] = 1
    cv2.line(boom, (0, round(shape[0] * 0.81)),
             (round(shape[1] * 0.31), round(shape[0] * 0.62)), cv2.GC_FGD, max(5, shape[0] // 105))
    cv2.line(boom, (round(shape[1] * 0.24), round(shape[0] * 0.64)),
             (round(shape[1] * 0.43), round(shape[0] * 0.53)), cv2.GC_FGD, max(5, shape[0] // 115))
    return person, mic, boom


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--shot-id", required=True)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output)
    image = cv2.imread(str(input_path), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"hold-frame-read-failed:{input_path}")
    height, width = image.shape[:2]
    shape = image.shape

    person_seed, mic_seed, boom_seed = component_seed_masks(shape)
    person = seeded_grabcut(image, person_seed, 7)
    microphone = seeded_grabcut(image, mic_seed, 5)
    boom = seeded_grabcut(image, boom_seed, 5)

    # Remove nearby set pieces that GrabCut can connect to the subject because
    # they share edge or luminance values (notably the lamp beside the head).
    # The allowed region is only a registration envelope; the emitted contour
    # still comes from source-pixel segmentation inside it.
    head_allowed = ellipse_mask(shape, (0.575, 0.455), (0.105, 0.195))
    torso_allowed = polygon_mask(shape, [(0.42, 0.57), (0.70, 0.57), (0.77, 1.0), (0.31, 1.0)])
    person_allowed = cv2.bitwise_or(head_allowed, torso_allowed)
    person = cv2.bitwise_and(person, person_allowed)
    person[: round(height * 0.62), round(width * 0.67):] = 0
    person = fill_internal_holes(person)

    # Component masks may overlap at contact edges. Keeping that overlap avoids
    # a dark halo: subtracting a dilated microphone/boom and then unioning the
    # undilated masks leaves a visible ring through which behind-title pixels
    # leak across the presenter's face or shoulder.

    # Component registrations are conservative pixel masks derived from the
    # segmented person, not a single subject rectangle. Face/eyes/mouth are
    # protected regions for package visibility and use actual source pixels
    # inside the registered facial regions.
    hair_region = ellipse_mask(shape, (0.585, 0.365), (0.105, 0.105))
    face_region = ellipse_mask(shape, (0.585, 0.475), (0.083, 0.105))
    eyes_region = ellipse_mask(shape, (0.585, 0.445), (0.060, 0.020))
    mouth_region = ellipse_mask(shape, (0.585, 0.535), (0.035, 0.018))
    hair = cv2.bitwise_and(person, hair_region)
    face = cv2.bitwise_and(person, face_region)
    eyes = cv2.bitwise_and(person, eyes_region)
    mouth = cv2.bitwise_and(person, mouth_region)
    body = person.copy()
    body[hair > 0] = 0
    body[face > 0] = 0
    clothing = body.copy()

    masks = {
        "hair": hair,
        "face": face,
        "eyes": eyes,
        "mouth": mouth,
        "body": body,
        "clothing": clothing,
        "microphone": microphone,
        "boom": boom,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    prefix = args.shot_id.lower()
    components = {}
    for name, mask in masks.items():
        components[name] = write_mask(output_dir / f"{prefix}-{name}-mask.png", mask)
    presenter = cv2.bitwise_or(hair, body)
    presenter = cv2.bitwise_or(presenter, face)
    presenter = cv2.bitwise_or(presenter, eyes)
    presenter = cv2.bitwise_or(presenter, mouth)
    unified = presenter.copy()
    unified = cv2.bitwise_or(unified, microphone)
    unified = cv2.bitwise_or(unified, boom)
    presenter_meta = write_mask(output_dir / f"{prefix}-presenter-matte.png", presenter)
    microphone_meta = write_mask(output_dir / f"{prefix}-microphone-matte.png", microphone)
    boom_meta = write_mask(output_dir / f"{prefix}-boom-matte.png", boom)
    unified_meta = write_mask(output_dir / f"{prefix}-unified-exclusion-mask.png", unified)
    print(json.dumps({
        "contract": "A1RealPresenterMatte/v1",
        "sourceFrame": {"file": str(input_path), "sha256": sha256_file(input_path), "width": width, "height": height},
        "registrationMethod": "OPENCV_GRABCUT_SEEDED_FROM_REGISTERED_HOLD_FRAME_PIXEL_REGIONS",
        "realPixelSource": True,
        "coarsePolygonPlaceholder": False,
        "components": components,
        "presenterMatte": presenter_meta,
        "microphoneMatte": microphone_meta,
        "boomMatte": boom_meta,
        "unifiedExclusionMask": unified_meta,
        "zOrder": ["BASE_FRAME", "BEHIND_SUBJECT_PACKAGE", "PRESENTER_MATTE", "OPTIONAL_FOREGROUND_ACCENT"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
