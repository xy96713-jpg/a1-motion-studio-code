#!/usr/bin/env python3
"""Local, review-only BiRefNet cutout worker.

The worker never substitutes a crop for a mask. Missing dependencies or model
weights produce an A1MaskAsset/v1 report with ENGINE_UNAVAILABLE so the caller
can explicitly fall back to the original crop.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import resource
import sys
import time
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageOps


CONTRACT = "A1MaskAsset/v1"
MODEL_IDS = {"standard": "ZhengPeng7/BiRefNet", "lite": "ZhengPeng7/BiRefNet_lite"}
# Pin the exact official snapshot resolved during the project preflight.  The
# older 7d10348 snapshot uses a config API incompatible with the current
# project-local transformers runtime.
MODEL_REVISIONS = {"standard": None, "lite": "7838f1c3472f827cd8ce13ab5ccc2ce48077360f"}


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(file_path: Path, value: dict[str, Any]) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = file_path.with_suffix(f"{file_path.suffix}.tmp-{os.getpid()}")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(file_path)


def peak_memory_mb() -> float:
    value = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    if sys.platform == "darwin":
        return round(value / 1024 / 1024, 2)
    return round(value / 1024, 2)


def checkerboard(size: tuple[int, int], cell: int = 28) -> Image.Image:
    surface = Image.new("RGB", size, "#e8e5dc")
    draw = ImageDraw.Draw(surface)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#c9c9c4")
    return surface


def composite_on_checker(subject: Image.Image) -> Image.Image:
    base = checkerboard(subject.size)
    base.paste(subject, (0, 0), subject)
    return base


def add_shadow(subject: Image.Image) -> Image.Image:
    width, height = subject.size
    canvas = Image.new("RGBA", (width, height), "#f2efe7")
    alpha = subject.getchannel("A")
    shadow_alpha = alpha.filter(ImageFilter.GaussianBlur(max(4, round(min(width, height) * 0.012))))
    shadow = Image.new("RGBA", subject.size, (17, 19, 21, 0))
    shadow.putalpha(shadow_alpha.point(lambda value: int(value * 0.42)))
    offset = (max(4, round(width * 0.018)), max(4, round(height * 0.022)))
    canvas.alpha_composite(shadow, offset)
    canvas.alpha_composite(subject, (0, 0))
    return canvas


def build_contact_sheet(source: Image.Image, mask: Image.Image, transparent: Image.Image, refined: Image.Image, shadow: Image.Image) -> Image.Image:
    tile_size = (420, 420)
    labels = ["ORIGINAL", "MASK", "TRANSPARENT", "EDGE REFINED", "SHADOW COMPOSITE"]
    images = [source.convert("RGB"), mask.convert("RGB"), composite_on_checker(transparent), composite_on_checker(refined), shadow.convert("RGB")]
    header = 52
    sheet = Image.new("RGB", (tile_size[0] * len(images), tile_size[1] + header), "#111315")
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(zip(labels, images)):
        tile = ImageOps.contain(image, tile_size, Image.Resampling.LANCZOS)
        tile_base = Image.new("RGB", tile_size, "#f2efe7")
        tile_base.paste(tile, ((tile_size[0] - tile.width) // 2, (tile_size[1] - tile.height) // 2))
        sheet.paste(tile_base, (index * tile_size[0], header))
        draw.text((index * tile_size[0] + 14, 18), label, fill="#f2efe7")
    return sheet


def dependency_status() -> tuple[bool, list[str]]:
    required = ["torch", "transformers", "numpy"]
    missing = [name for name in required if importlib.util.find_spec(name) is None]
    return not missing, missing


def unavailable_report(args: argparse.Namespace, source_path: Path, source: Image.Image, started: float, reason: str) -> dict[str, Any]:
    return {
        "contract": CONTRACT,
        "id": args.id,
        "source": {"path": str(source_path), "sha256": sha256_file(source_path), "width": source.width, "height": source.height},
        "engine": {"family": "BiRefNet", "variant": "unavailable", "license": "MIT", "device": "unavailable", "modelId": MODEL_IDS[args.variant], "modelRevision": MODEL_REVISIONS[args.variant]},
        "outputs": {"mask": None, "transparent": None, "refined": None, "shadowComposite": None, "contactSheet": None},
        "metrics": {"durationMs": round((time.perf_counter() - started) * 1000, 2), "peakMemoryMb": peak_memory_mb(), "edgeReviewStatus": "not-run"},
        "status": "ENGINE_UNAVAILABLE",
        "fallbackReason": reason,
        "reviewOnly": True,
    }


def mask_tensor_from_output(output: Any, torch_module: Any) -> Any:
    candidate = output
    if isinstance(candidate, dict):
        for key in ("logits", "pred", "out"):
            if key in candidate:
                candidate = candidate[key]
                break
    while isinstance(candidate, (list, tuple)):
        candidate = candidate[-1]
    if not torch_module.is_tensor(candidate):
        raise RuntimeError(f"unsupported-model-output:{type(candidate).__name__}")
    return candidate


def run_inference(args: argparse.Namespace, source: Image.Image) -> tuple[Image.Image, str, str]:
    import numpy as np
    import torch
    from transformers import AutoModelForImageSegmentation

    device = "mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else "cpu"
    model_id = MODEL_IDS[args.variant]
    model = AutoModelForImageSegmentation.from_pretrained(model_id, revision=MODEL_REVISIONS[args.variant], trust_remote_code=True, local_files_only=not args.allow_download)
    model.to(device)
    model.eval()
    # Match the official inference recipe: preserve the complete source while
    # resizing it to the square model tensor. Cropping here could remove the
    # very hair, product edge, or document corner the mask is meant to judge.
    square = source.convert("RGB").resize((args.input_size, args.input_size), Image.Resampling.LANCZOS)
    array = np.asarray(square, dtype=np.float32) / 255.0
    array = (array - np.asarray([0.485, 0.456, 0.406], dtype=np.float32)) / np.asarray([0.229, 0.224, 0.225], dtype=np.float32)
    tensor = torch.from_numpy(array).permute(2, 0, 1).unsqueeze(0).to(device)
    with torch.no_grad():
        output = mask_tensor_from_output(model(tensor), torch)
        prediction = output[-1] if output.ndim > 4 else output
        prediction = prediction.sigmoid().detach().float().cpu().squeeze()
    mask_array = (prediction.numpy().clip(0, 1) * 255).astype("uint8")
    mask = Image.fromarray(mask_array).resize(source.size, Image.Resampling.LANCZOS)
    return mask, device, model_id, MODEL_REVISIONS[args.variant]


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate review-only local BiRefNet mask assets")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--variant", choices=("standard", "lite"), default="standard")
    parser.add_argument("--input-size", type=int, default=2048)
    parser.add_argument("--allow-download", action="store_true", help="Allow Hugging Face model download when cache is missing")
    parser.add_argument("--require-engine", action="store_true", help="Exit non-zero when the engine or cached model is unavailable")
    args = parser.parse_args()
    started = time.perf_counter()
    source_path = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if not source_path.is_file():
        raise FileNotFoundError(f"source-image-missing:{source_path}")
    source = ImageOps.exif_transpose(Image.open(source_path)).convert("RGBA")
    ready, missing = dependency_status()
    if not ready:
        report = unavailable_report(args, source_path, source, started, f"missing-python-dependencies:{','.join(missing)}")
        write_json(output_dir / "report.json", report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2 if args.require_engine else 0

    try:
        mask, device, model_id, model_revision = run_inference(args, source)
    except Exception as error:
        report = unavailable_report(args, source_path, source, started, f"model-load-or-inference-failed:{type(error).__name__}:{str(error)[:280]}")
        write_json(output_dir / "report.json", report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2 if args.require_engine else 0

    transparent = source.copy()
    transparent.putalpha(mask)
    refined_mask = mask.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.65))
    refined_mask = ImageOps.autocontrast(refined_mask, cutoff=0.4)
    refined = source.copy()
    refined.putalpha(refined_mask)
    shadow = add_shadow(refined)
    contact_sheet = build_contact_sheet(source, mask, transparent, refined, shadow)
    paths = {
        "mask": output_dir / f"{args.id}-mask.png",
        "transparent": output_dir / f"{args.id}-transparent.png",
        "refined": output_dir / f"{args.id}-edge-refined.png",
        "shadowComposite": output_dir / f"{args.id}-shadow-composite.png",
        "contactSheet": output_dir / f"{args.id}-contact-sheet.jpg",
    }
    mask.save(paths["mask"])
    transparent.save(paths["transparent"])
    refined.save(paths["refined"])
    shadow.save(paths["shadowComposite"])
    contact_sheet.save(paths["contactSheet"], quality=91)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    report = {
        "contract": CONTRACT,
        "id": args.id,
        "source": {"path": str(source_path), "sha256": sha256_file(source_path), "width": source.width, "height": source.height},
        "engine": {"family": "BiRefNet", "variant": args.variant, "license": "MIT", "device": device, "modelId": model_id, "modelRevision": model_revision},
        "outputs": {key: str(value) for key, value in paths.items()},
        "outputSha256": {key: sha256_file(value) for key, value in paths.items()},
        "metrics": {"durationMs": elapsed_ms, "peakMemoryMb": peak_memory_mb(), "edgeReviewStatus": "pending"},
        "status": "GENERATED_PENDING_REVIEW",
        "fallbackReason": None,
        "reviewOnly": True,
    }
    write_json(output_dir / "report.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
