#!/usr/bin/env python3
"""Extract typography contact geometry with MediaPipe Tasks."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions
from PIL import Image

POSE_ROLES = [
    "NOSE", "LEFT_EYE_INNER", "LEFT_EYE", "LEFT_EYE_OUTER",
    "RIGHT_EYE_INNER", "RIGHT_EYE", "RIGHT_EYE_OUTER", "LEFT_EAR",
    "RIGHT_EAR", "MOUTH_LEFT", "MOUTH_RIGHT", "LEFT_SHOULDER",
    "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW", "LEFT_WRIST",
    "RIGHT_WRIST", "LEFT_PINKY", "RIGHT_PINKY", "LEFT_INDEX",
    "RIGHT_INDEX", "LEFT_THUMB", "RIGHT_THUMB", "LEFT_HIP", "RIGHT_HIP",
    "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_HEEL",
    "RIGHT_HEEL", "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX",
]


def sha256_file(file_path: Path) -> str:
    return hashlib.sha256(file_path.read_bytes()).hexdigest()


def clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def bounds_from_points(points: list[dict[str, float]], x_pad: float = 0.0, y_pad_top: float = 0.0, y_pad_bottom: float = 0.0) -> dict[str, float]:
    xs = [point["x"] for point in points]
    ys = [point["y"] for point in points]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    width = max(1e-6, right - left)
    height = max(1e-6, bottom - top)
    left = clamp(left - width * x_pad)
    right = clamp(right + width * x_pad)
    top = clamp(top - height * y_pad_top)
    bottom = clamp(bottom + height * y_pad_bottom)
    return {
        "x": round(left, 6),
        "y": round(top, 6),
        "width": round(right - left, 6),
        "height": round(bottom - top, 6),
    }


def landmark_record(role: str, landmark: Any, width: int, height: int) -> dict[str, Any]:
    return {
        "role": role,
        "x": round(float(landmark.x), 7),
        "y": round(float(landmark.y), 7),
        "z": round(float(landmark.z), 7),
        "pixelX": round(float(landmark.x) * width, 3),
        "pixelY": round(float(landmark.y) * height, 3),
        "visibility": round(float(getattr(landmark, "visibility", 0.0)), 7),
        "presence": round(float(getattr(landmark, "presence", 0.0)), 7),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--shot-id", required=True)
    parser.add_argument("--pose-model", default=".codex-artifacts/runtime/typography-vision-models/pose_landmarker_heavy.task")
    parser.add_argument("--hand-model", default=".codex-artifacts/runtime/typography-vision-models/hand_landmarker.task")
    args = parser.parse_args()

    source_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    pose_model = Path(args.pose_model).resolve()
    hand_model = Path(args.hand_model).resolve()
    for file_path in (source_path, pose_model, hand_model):
        if not file_path.is_file():
            raise FileNotFoundError(f"typography-geometry-input-missing:{file_path}")
    output_dir.mkdir(parents=True, exist_ok=True)
    source_image = Image.open(source_path).convert("RGB")
    width, height = source_image.size
    mp_image = mp.Image.create_from_file(str(source_path))

    pose_options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(pose_model), delegate=BaseOptions.Delegate.CPU),
        running_mode=vision.RunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_segmentation_masks=True,
    )
    hand_options = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(hand_model), delegate=BaseOptions.Delegate.CPU),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    with vision.PoseLandmarker.create_from_options(pose_options) as pose_landmarker:
        pose_result = pose_landmarker.detect(mp_image)
    with vision.HandLandmarker.create_from_options(hand_options) as hand_landmarker:
        hand_result = hand_landmarker.detect(mp_image)
    if len(pose_result.pose_landmarks) != 1:
        raise RuntimeError(f"typography-geometry-pose-count-invalid:{len(pose_result.pose_landmarks)}")
    raw_pose = pose_result.pose_landmarks[0]
    if len(raw_pose) != len(POSE_ROLES):
        raise RuntimeError(f"typography-geometry-landmark-count-invalid:{len(raw_pose)}")
    landmarks = [landmark_record(role, landmark, width, height) for role, landmark in zip(POSE_ROLES, raw_pose)]
    visible = [point for point in landmarks if point["visibility"] >= 0.35 and -0.1 <= point["x"] <= 1.1 and -0.1 <= point["y"] <= 1.1]
    face_points = [point for point in landmarks[:11] if point["presence"] >= 0.5]
    if len(face_points) < 5:
        raise RuntimeError(f"typography-geometry-face-points-insufficient:{len(face_points)}")
    face_bounds = bounds_from_points(face_points, x_pad=0.32, y_pad_top=0.9, y_pad_bottom=1.0)
    pose_bounds = bounds_from_points(visible, x_pad=0.08, y_pad_top=0.06, y_pad_bottom=0.04)

    if not pose_result.segmentation_masks:
        raise RuntimeError("typography-geometry-segmentation-mask-missing")
    segmentation = np.asarray(pose_result.segmentation_masks[0].numpy_view(), dtype=np.float32)
    segmentation = np.clip(segmentation, 0.0, 1.0)
    segmentation_alpha = Image.fromarray((segmentation * 255.0).astype(np.uint8), mode="L").resize((width, height), Image.Resampling.BILINEAR)
    segmentation_file = output_dir / "pose-segmentation-mask.png"
    segmentation_alpha.save(segmentation_file)

    hand_records = []
    for index, hand_landmarks in enumerate(hand_result.hand_landmarks):
        handedness = hand_result.handedness[index][0] if index < len(hand_result.handedness) and hand_result.handedness[index] else None
        hand_records.append({
            "index": index,
            "handedness": None if handedness is None else handedness.category_name,
            "score": None if handedness is None else round(float(handedness.score), 7),
            "landmarks": [
                {"index": landmark_index, "x": round(float(landmark.x), 7), "y": round(float(landmark.y), 7), "z": round(float(landmark.z), 7)}
                for landmark_index, landmark in enumerate(hand_landmarks)
            ],
        })
    contact_roles = ["NOSE", "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW", "LEFT_WRIST", "RIGHT_WRIST"]
    contact_anchors = [point for point in landmarks if point["role"] in contact_roles and point["visibility"] >= 0.5]
    report = {
        "contract": "A1TypographyGeometryAnalysis/v1",
        "status": "PASS",
        "shotId": args.shot_id,
        "source": {"file": str(source_path), "sha256": sha256_file(source_path), "width": width, "height": height},
        "engine": {
            "family": "MediaPipe Tasks",
            "version": mp.__version__,
            "poseModel": {"file": str(pose_model), "sha256": sha256_file(pose_model)},
            "handModel": {"file": str(hand_model), "sha256": sha256_file(hand_model)},
        },
        "pose": {"landmarks": landmarks, "contactAnchors": contact_anchors},
        "faceBounds": face_bounds,
        "poseBounds": pose_bounds,
        "handsDetected": len(hand_records),
        "hands": hand_records,
        "segmentationMask": {"file": str(segmentation_file), "sha256": sha256_file(segmentation_file), "width": width, "height": height},
        "reviewOnly": True,
        "productionAdmission": False,
    }
    report_file = output_dir / "report.json"
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "reportFile": str(report_file), "handsDetected": report["handsDetected"], "faceBounds": face_bounds, "poseBounds": pose_bounds}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
