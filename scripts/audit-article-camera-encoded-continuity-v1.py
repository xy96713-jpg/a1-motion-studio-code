"""Measure actual encoded inter-frame scale, independently of camera keyframes."""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("before")
parser.add_argument("after")
parser.add_argument("output")
parser.add_argument("--start-ms", type=float, default=9400)
parser.add_argument("--end-ms", type=float, default=13100)
parser.add_argument("--expect-before-jump", action="store_true")
args = parser.parse_args()


def measure(file):
    cap = cv2.VideoCapture(file)
    fps = cap.get(cv2.CAP_PROP_FPS)
    start, end = round(args.start_ms / 1000 * fps), round(args.end_ms / 1000 * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    previous = None
    rows = []
    for frame_index in range(start, end + 1):
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError(f"decode-failed:{file}:{frame_index}")
        gray = cv2.cvtColor(cv2.resize(frame, (640, 360)), cv2.COLOR_BGR2GRAY)
        if previous is not None:
            mask = np.zeros_like(gray)
            mask[40:310, 130:605] = 255  # Exclude review labels and frame edges.
            points = cv2.goodFeaturesToTrack(previous, 250, .03, 6, mask=mask)
            if points is None or len(points) < 20:
                raise RuntimeError(f"insufficient-tracking-points:{frame_index}")
            current, status, _ = cv2.calcOpticalFlowPyrLK(previous, gray, points, None, winSize=(31, 31), maxLevel=4)
            good = status.reshape(-1) == 1
            affine, inliers = cv2.estimateAffinePartial2D(points[good], current[good], method=cv2.RANSAC, ransacReprojThreshold=1.5)
            if affine is None or int(inliers.sum()) < 20:
                raise RuntimeError(f"affine-unreliable:{frame_index}")
            scale = float(np.hypot(affine[0, 0], affine[1, 0]))
            rows.append({"frame": frame_index, "atMs": frame_index / fps * 1000, "scaleRatio": scale, "inliers": int(inliers.sum())})
        previous = gray
    cap.release()
    peak = max(rows, key=lambda row: abs(row["scaleRatio"] - 1))
    return {"path": file, "sha256": hashlib.sha256(Path(file).read_bytes()).hexdigest(), "fps": fps, "sampledPairs": len(rows), "maximumOneFrameScaleChange": abs(peak["scaleRatio"] - 1), "peak": peak, "frames": rows}


before, after = measure(args.before), measure(args.after)
failures = []
if args.expect_before_jump and before["maximumOneFrameScaleChange"] < .1:
    failures.append("OLD_JUMP_NOT_REPRODUCED_IN_PIXELS")
if after["maximumOneFrameScaleChange"] > .02:
    failures.append("NEW_CAMERA_HAS_SCALE_JUMP")
if not any(row["scaleRatio"] > 1.002 for row in after["frames"]):
    failures.append("NEW_CAMERA_DID_NOT_ZOOM_IN")
if not any(row["scaleRatio"] < .998 for row in after["frames"]):
    failures.append("NEW_CAMERA_DID_NOT_RETURN")
result = {"contract": "A1EncodedCameraContinuityAudit/v1", "status": "FAIL" if failures else "PASS", "method": "DECODED_MP4_LK_TRACKING_RANSAC_SIMILARITY", "scope": {"startMs": args.start_ms, "endMs": args.end_ms, "metric": "scale continuity only", "universalVisualApproval": False}, "before": before, "after": after, "failures": failures}
Path(args.output).write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"status": result["status"], "beforeMaxScaleStep": before["maximumOneFrameScaleChange"], "afterMaxScaleStep": after["maximumOneFrameScaleChange"], "pairsPerVideo": after["sampledPairs"], "failures": failures}, indent=2))
raise SystemExit(1 if failures else 0)
