#!/usr/bin/env python3
"""Transcribe one local video with MLX Whisper and emit bounded timestamps."""

from __future__ import annotations

import contextlib
import json
import sys

import mlx_whisper


def main() -> int:
    request = json.loads(sys.stdin.read())
    video_path = str(request.get("videoPath") or "")
    if not video_path:
        raise ValueError("videoPath-required")
    model = str(request.get("model") or "mlx-community/whisper-tiny")
    language = str(request.get("language") or "zh")
    with contextlib.redirect_stdout(sys.stderr):
        result = mlx_whisper.transcribe(
            video_path,
            path_or_hf_repo=model,
            language=language,
            verbose=False,
            word_timestamps=True,
            condition_on_previous_text=False,
        )
    segments = []
    for segment in result.get("segments") or []:
        words = [
            {
                "word": str(word.get("word") or "").strip(),
                "startMs": round(float(word.get("start") or 0) * 1000),
                "endMs": round(float(word.get("end") or 0) * 1000),
                "probability": round(float(word.get("probability") or 0), 6),
            }
            for word in segment.get("words") or []
            if str(word.get("word") or "").strip()
        ]
        segments.append({
            "startMs": round(float(segment.get("start") or 0) * 1000),
            "endMs": round(float(segment.get("end") or 0) * 1000),
            "text": str(segment.get("text") or "").strip(),
            "words": words,
        })
    print(json.dumps({"contract": "A1MlxWhisperWorker/v1", "status": "PASS", "provider": {"id": "MLX_WHISPER", "version": getattr(mlx_whisper, "__version__", "unknown"), "model": model, "language": result.get("language") or language, "wordTimestamps": True}, "segments": segments, "failures": []}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

