#!/usr/bin/env python3
"""Read one local video path from stdin and emit deterministic scene ranges."""

from __future__ import annotations

import json
import sys

import scenedetect
from scenedetect import AdaptiveDetector, SceneManager, open_video


def main() -> int:
    request = json.loads(sys.stdin.read())
    video_path = str(request.get("videoPath") or "")
    if not video_path:
        raise ValueError("videoPath-required")
    video = open_video(video_path)
    manager = SceneManager()
    manager.add_detector(AdaptiveDetector(adaptive_threshold=float(request.get("adaptiveThreshold") or 3.0)))
    manager.detect_scenes(video, show_progress=False)
    scenes = manager.get_scene_list(start_in_scene=True)
    rows = [
        {
            "id": f"scene-{index + 1:03d}",
            "startMs": round(start.get_seconds() * 1000),
            "endMs": round(end.get_seconds() * 1000),
            "startFrame": start.get_frames(),
            "endFrame": end.get_frames(),
        }
        for index, (start, end) in enumerate(scenes)
        if end.get_frames() > start.get_frames()
    ]
    print(json.dumps({"contract": "A1SceneDetectWorker/v1", "status": "PASS", "provider": {"id": "PySceneDetect", "version": scenedetect.__version__, "detector": "AdaptiveDetector"}, "scenes": rows, "failures": []}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

