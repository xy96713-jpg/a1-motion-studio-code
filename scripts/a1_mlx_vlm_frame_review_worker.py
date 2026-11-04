#!/usr/bin/env python3
"""Offline MLX-VLM review of a bounded keyframe set."""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from mlx_vlm import apply_chat_template, generate, load


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = "A1MlxVlmFrameReviewResult/v1"
DEFAULT_MODEL = "/Users/a1/.cache/huggingface/hub/models--HuggingFaceTB--SmolVLM-256M-Instruct/snapshots/7e3e67edbbed1bf9888184d9df282b700a323964"


def inside_root(value: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    path = path.resolve()
    if ROOT != path and ROOT not in path.parents:
        raise ValueError(f"path-outside-project:{path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def main() -> int:
    started = time.perf_counter()
    try:
        request = json.loads(sys.stdin.read())
        if request.get("contract") != "A1MlxVlmFrameReviewRequest/v1":
            raise ValueError("request-contract-invalid")
        frames = request.get("frames") if isinstance(request.get("frames"), list) else []
        if not 1 <= len(frames) <= 12:
            raise ValueError("frame-count-out-of-range")
        model_path = str(request.get("modelPath") or DEFAULT_MODEL)
        if not Path(model_path).is_dir():
            raise FileNotFoundError("vlm-model-missing")
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        model, processor = load(model_path)
        rows = []
        prompt = str(request.get("prompt") or "Describe only what is visibly present: people, actions, place, readable interface or text, and cinematic mood. Do not identify unknown people or invent events. Use one concise sentence.")
        for frame in frames:
            path = inside_root(str(frame.get("path") or ""))
            effective_prompt = apply_chat_template(processor, model.config, prompt, num_images=1)
            description = generate(model, processor, effective_prompt, image=str(path), verbose=False, max_tokens=96, temperature=0.0)
            rows.append({"id": str(frame.get("id") or ""), "path": str(path), "description": str(description).strip()[:2000]})
        result = {"contract": CONTRACT, "status": "PASS", "provider": {"id": "MLX-VLM", "version": "0.1.15", "modelPath": model_path, "offline": True}, "reviews": rows, "failures": [], "durationMs": round((time.perf_counter() - started) * 1000, 2), "reviewOnly": True, "productionAdmission": False}
    except Exception as error:
        result = {"contract": CONTRACT, "status": "BLOCKED", "provider": None, "reviews": [], "failures": [f"{type(error).__name__}:{str(error)[:400]}"], "durationMs": round((time.perf_counter() - started) * 1000, 2), "reviewOnly": True, "productionAdmission": False}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
