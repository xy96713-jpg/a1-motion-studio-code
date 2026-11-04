#!/usr/bin/env python3
"""Partition a real BiRefNet alpha matte into production z-order components."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np


def sha256_file(file_path: Path) -> str:
    return hashlib.sha256(file_path.read_bytes()).hexdigest()


def write_mask(file_path: Path, alpha: np.ndarray) -> dict:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(file_path), alpha):
        raise RuntimeError(f"component-mask-write-failed:{file_path}")
    visible = alpha > 8
    ys, xs = np.where(visible)
    return {
        "path": str(file_path),
        "sha256": sha256_file(file_path),
        "visiblePixelCount": int(np.count_nonzero(visible)),
        "visibleBounds": None if not len(xs) else {
            "x": round(float(xs.min() / alpha.shape[1]), 6),
            "y": round(float(ys.min() / alpha.shape[0]), 6),
            "width": round(float((xs.max() - xs.min() + 1) / alpha.shape[1]), 6),
            "height": round(float((ys.max() - ys.min() + 1) / alpha.shape[0]), 6),
        },
    }


def rgba_cutout(source: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    rgba = cv2.cvtColor(source, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    return rgba


def tile_on_checker(rgba: np.ndarray, width: int = 420, height: int = 236) -> np.ndarray:
    resized = cv2.resize(rgba, (width, height), interpolation=cv2.INTER_AREA)
    cell = 16
    checker = np.zeros((height, width, 3), np.uint8)
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            checker[y:y + cell, x:x + cell] = 226 if (x // cell + y // cell) % 2 == 0 else 194
    alpha = resized[:, :, 3:4].astype(np.float32) / 255.0
    return np.clip(resized[:, :, :3] * alpha + checker * (1.0 - alpha), 0, 255).astype(np.uint8)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--mask", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--shot-id", required=True)
    args = parser.parse_args()

    source_path = Path(args.input).resolve()
    mask_path = Path(args.mask).resolve()
    output_dir = Path(args.output_dir).resolve()
    source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    alpha = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if source is None or alpha is None or source.shape[:2] != alpha.shape[:2]:
        raise RuntimeError("birefnet-component-source-mask-invalid")
    height, width = alpha.shape

    binary = (alpha > 16).astype(np.uint8)
    component_count, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, 8)
    candidates = sorted(range(1, component_count), key=lambda index: int(stats[index, cv2.CC_STAT_AREA]), reverse=True)
    presenter_index = next((index for index in candidates if centroids[index][0] > width * 0.42 and stats[index, cv2.CC_STAT_AREA] > width * height * 0.04), None)
    foreground_index = next((index for index in candidates if index != presenter_index and centroids[index][0] < width * 0.55 and stats[index, cv2.CC_STAT_AREA] > width * height * 0.01), None)
    if presenter_index is None or foreground_index is None:
        raise RuntimeError("birefnet-component-primary-regions-not-found")
    presenter = np.where(labels == presenter_index, alpha, 0).astype(np.uint8)
    foreground = np.where(labels == foreground_index, alpha, 0).astype(np.uint8)

    gray = cv2.cvtColor(source, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(80, 80), maxSize=(420, 420))
    faces = [face for face in faces if face[0] > width * 0.35]
    if len(faces) != 1:
        raise RuntimeError(f"birefnet-component-face-detection-ambiguous:{len(faces)}")
    face_x, face_y, face_w, face_h = [int(value) for value in faces[0]]

    head_x0 = max(0, round(face_x - face_w * 0.18))
    head_x1 = min(width, round(face_x + face_w * 1.18))
    head_y0 = max(0, round(face_y - face_h * 0.38))
    hair_split = min(height, round(face_y + face_h * 0.27))
    head_y1 = min(height, round(face_y + face_h * 1.08))
    hair_region = np.zeros_like(alpha)
    hair_region[head_y0:hair_split, head_x0:head_x1] = 255
    face_region = np.zeros_like(alpha)
    face_region[hair_split:head_y1, head_x0:head_x1] = 255
    hair = cv2.bitwise_and(presenter, hair_region)
    face = cv2.bitwise_and(presenter, face_region)
    body = presenter.copy()
    body[hair > 0] = 0
    body[face > 0] = 0

    eyes_region = np.zeros_like(alpha)
    eyes_region[round(face_y + face_h * 0.36):round(face_y + face_h * 0.57), round(face_x + face_w * 0.12):round(face_x + face_w * 0.88)] = 255
    mouth_region = np.zeros_like(alpha)
    mouth_region[round(face_y + face_h * 0.67):round(face_y + face_h * 0.86), round(face_x + face_w * 0.24):round(face_x + face_w * 0.76)] = 255
    eyes = cv2.bitwise_and(face, eyes_region)
    mouth = cv2.bitwise_and(face, mouth_region)

    microphone_region = np.zeros_like(alpha)
    microphone_region[round(height * 0.38):round(height * 0.61), round(width * 0.34):round(width * 0.53)] = 255
    microphone = cv2.bitwise_and(foreground, microphone_region)
    boom = foreground.copy()
    boom[microphone > 0] = 0

    components = {"hair": hair, "face": face, "eyes": eyes, "mouth": mouth, "body": body, "presenter": presenter, "microphone": microphone, "boom": boom, "foreground": foreground}
    metadata = {}
    prefix = args.shot_id.lower()
    tiles = []
    labels_for_sheet = []
    for name, component_alpha in components.items():
        if name in {"eyes", "mouth", "foreground"}:
            metadata[name] = write_mask(output_dir / f"{prefix}-{name}-mask.png", component_alpha)
            continue
        mask_meta = write_mask(output_dir / f"{prefix}-{name}-mask.png", component_alpha)
        cutout_path = output_dir / f"{prefix}-{name}-cutout.png"
        cv2.imwrite(str(cutout_path), rgba_cutout(source, component_alpha))
        metadata[name] = {**mask_meta, "cutoutPath": str(cutout_path), "cutoutSha256": sha256_file(cutout_path)}
        tiles.append(tile_on_checker(rgba_cutout(source, component_alpha)))
        labels_for_sheet.append(name.upper())

    header = 44
    sheet = np.full((236 + header, 420 * len(tiles), 3), 20, np.uint8)
    for index, tile in enumerate(tiles):
        sheet[header:, index * 420:(index + 1) * 420] = tile
        cv2.putText(sheet, labels_for_sheet[index], (index * 420 + 12, 29), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (242, 242, 242), 1, cv2.LINE_AA)
    contact_sheet_path = output_dir / f"{prefix}-component-contact-sheet.jpg"
    cv2.imwrite(str(contact_sheet_path), sheet, [cv2.IMWRITE_JPEG_QUALITY, 92])

    ignored = [int(stats[index, cv2.CC_STAT_AREA]) for index in candidates if index not in {presenter_index, foreground_index}]
    report = {
        "contract": "A1OriginalPresenterPixelComponentMatte/v1",
        "status": "GENERATED_PENDING_ACTUAL_PIXEL_REVIEW",
        "shotId": args.shot_id,
        "sourceFrame": {"path": str(source_path), "sha256": sha256_file(source_path), "width": width, "height": height},
        "sourceMatte": {"path": str(mask_path), "sha256": sha256_file(mask_path), "engine": "BiRefNet-lite", "modelRevision": "7838f1c3472f827cd8ce13ab5ccc2ce48077360f"},
        "partitionMethod": "CONNECTED_COMPONENT_PLUS_DETECTED_FACE_PIXEL_PARTITION",
        "faceDetection": {"x": face_x, "y": face_y, "width": face_w, "height": face_h},
        "components": metadata,
        "ignoredComponentPixelCounts": ignored,
        "zOrder": ["BASE_VIDEO", "PACKAGE_BACKGROUND", "PRESENTER_ORIGINAL_PIXELS", "MICROPHONE_ORIGINAL_PIXELS", "BOOM_ORIGINAL_PIXELS", "OPTIONAL_FOREGROUND_ACCENT"],
        "contactSheet": {"path": str(contact_sheet_path), "sha256": sha256_file(contact_sheet_path)},
    }
    report_path = output_dir / "component-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
