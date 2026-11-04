#!/usr/bin/env python3
"""Offline-first provider worker for A1 external-source tooling."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = "A1ExternalSourceToolProviderResult/v1"
OPENCLIP_MODEL = "ViT-B-32"
OPENCLIP_PRETRAINED = "laion2b_s34b_b79k"
OPENCLIP_REPO_CACHE = "models--laion--CLIP-ViT-B-32-laion2B-s34B-b79K"
OPENCLIP_REVISION = "1a25a446712ba5ee05982a381eed697ef9b435cf"
OPENCLIP_CACHE = ROOT / ".codex-artifacts/runtime/openclip"


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inside_root(value: str, *, must_exist: bool = True) -> Path:
    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    candidate = candidate.resolve()
    if ROOT != candidate and ROOT not in candidate.parents:
        raise ValueError(f"path-outside-project:{candidate}")
    if must_exist and not candidate.is_file():
        raise FileNotFoundError(f"file-missing:{candidate}")
    return candidate


def blocked(operation: str, failures: list[str], started: float) -> dict[str, Any]:
    return {
        "contract": CONTRACT,
        "status": "BLOCKED",
        "operation": operation,
        "provider": None,
        "failures": failures,
        "durationMs": round((time.perf_counter() - started) * 1000, 2),
        "reviewOnly": True,
        "productionAdmission": False,
    }


def ensure_openclip_snapshot() -> tuple[bool, str | None]:
    ref = OPENCLIP_CACHE / OPENCLIP_REPO_CACHE / "refs/main"
    snapshot = OPENCLIP_CACHE / OPENCLIP_REPO_CACHE / "snapshots" / OPENCLIP_REVISION
    if not ref.is_file() or ref.read_text().strip() != OPENCLIP_REVISION:
        return False, "openclip-revision-not-pinned"
    if not snapshot.is_dir():
        return False, "openclip-snapshot-missing"
    return True, None


def semantic_rerank(request: dict[str, Any], started: float) -> dict[str, Any]:
    ready, reason = ensure_openclip_snapshot()
    if not ready:
        return blocked("semantic-rerank", [reason or "openclip-unavailable"], started)
    query = str(request.get("query") or "").strip()
    # queryImage: a picture to rank against instead of the words (the reference film's frame at the same moment: a
    # segment of footage is picked by what the reference shows, not by a description; hupo-auto2 meta-S6)
    query_image = inside_root(str(request.get("queryImage"))) if request.get("queryImage") else None
    raw_candidates = request.get("candidates") if isinstance(request.get("candidates"), list) else []
    if not query and not query_image:
        return blocked("semantic-rerank", ["query-missing"], started)
    if not 2 <= len(raw_candidates) <= 48:
        return blocked("semantic-rerank", ["candidate-count-out-of-range"], started)
    candidates = []
    for row in raw_candidates:
        file_path = inside_root(str(row.get("imagePath") or ""))
        declared_sha = str(row.get("sha256") or "")
        actual_sha = sha256_file(file_path)
        if declared_sha and declared_sha != actual_sha:
            return blocked("semantic-rerank", [f"candidate-sha-mismatch:{row.get('id')}"], started)
        candidates.append({"id": str(row.get("id") or ""), "path": file_path, "sha256": actual_sha})
    if any(not row["id"] for row in candidates):
        return blocked("semantic-rerank", ["candidate-id-missing"], started)
    try:
        import open_clip
    except Exception as error:
        return blocked("semantic-rerank", [f"openclip-import-failed:{type(error).__name__}"], started)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model, _, preprocess = open_clip.create_model_and_transforms(
        OPENCLIP_MODEL,
        pretrained=OPENCLIP_PRETRAINED,
        cache_dir=str(OPENCLIP_CACHE),
    )
    model = model.eval().to(device)
    tokenizer = open_clip.get_tokenizer(OPENCLIP_MODEL)
    images = torch.stack([preprocess(Image.open(row["path"]).convert("RGB")) for row in candidates]).to(device)
    with torch.inference_mode():
        image_features = model.encode_image(images)
        text_features = model.encode_image(torch.stack([preprocess(Image.open(query_image).convert("RGB"))]).to(device)) if query_image else model.encode_text(tokenizer([query]).to(device))
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        cosine = (text_features @ image_features.T)[0].detach().float().cpu().numpy()
    ranking = sorted([
        {"id": row["id"], "imagePath": str(row["path"]), "sha256": row["sha256"], "cosineScore": round(float(cosine[index]), 8)}
        for index, row in enumerate(candidates)
    ], key=lambda row: (-row["cosineScore"], row["id"]))
    return {
        "contract": CONTRACT,
        "status": "PASS",
        "operation": "semantic-rerank",
        "provider": {"id": "openclip", "model": OPENCLIP_MODEL, "pretrained": OPENCLIP_PRETRAINED, "revision": OPENCLIP_REVISION, "license": "MIT-code-model-card-bound-weights", "device": str(device), "offline": True},
        "query": query,
        "ranking": ranking,
        "failures": [],
        "durationMs": round((time.perf_counter() - started) * 1000, 2),
        "reviewOnly": True,
        "productionAdmission": False,
    }


def embed_batch(request: dict[str, Any], started: float) -> dict[str, Any]:
    ready, reason = ensure_openclip_snapshot()
    if not ready:
        return blocked("embed-batch", [reason or "openclip-unavailable"], started)
    raw_images = request.get("images") if isinstance(request.get("images"), list) else []
    raw_texts = request.get("texts") if isinstance(request.get("texts"), list) else []
    if not 1 <= len(raw_images) <= 96:
        return blocked("embed-batch", ["image-count-out-of-range"], started)
    if not 1 <= len(raw_texts) <= 24:
        return blocked("embed-batch", ["text-count-out-of-range"], started)
    images = []
    for row in raw_images:
        file_path = inside_root(str(row.get("imagePath") or ""))
        declared_sha = str(row.get("sha256") or "")
        actual_sha = sha256_file(file_path)
        if declared_sha and declared_sha != actual_sha:
            return blocked("embed-batch", [f"image-sha-mismatch:{row.get('id')}"], started)
        images.append({"id": str(row.get("id") or ""), "path": file_path, "sha256": actual_sha})
    texts = [{"id": str(row.get("id") or ""), "text": str(row.get("text") or "").strip()} for row in raw_texts]
    if any(not row["id"] for row in images) or any(not row["id"] or not row["text"] for row in texts):
        return blocked("embed-batch", ["embedding-item-invalid"], started)
    try:
        import open_clip
    except Exception as error:
        return blocked("embed-batch", [f"openclip-import-failed:{type(error).__name__}"], started)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model, _, preprocess = open_clip.create_model_and_transforms(OPENCLIP_MODEL, pretrained=OPENCLIP_PRETRAINED, cache_dir=str(OPENCLIP_CACHE))
    model = model.eval().to(device)
    tokenizer = open_clip.get_tokenizer(OPENCLIP_MODEL)
    image_vectors: list[dict[str, Any]] = []
    batch_size = 12
    with torch.inference_mode():
        for start in range(0, len(images), batch_size):
            batch = images[start:start + batch_size]
            tensors = torch.stack([preprocess(Image.open(row["path"]).convert("RGB")) for row in batch]).to(device)
            features = model.encode_image(tensors)
            features = features / features.norm(dim=-1, keepdim=True)
            vectors = features.detach().float().cpu().numpy()
            image_vectors.extend({"id": row["id"], "imagePath": str(row["path"]), "sha256": row["sha256"], "vector": [round(float(value), 8) for value in vectors[index]]} for index, row in enumerate(batch))
        text_tokens = tokenizer([row["text"] for row in texts]).to(device)
        text_features = model.encode_text(text_tokens)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        text_vectors_raw = text_features.detach().float().cpu().numpy()
    text_vectors = [{"id": row["id"], "text": row["text"], "vector": [round(float(value), 8) for value in text_vectors_raw[index]]} for index, row in enumerate(texts)]
    return {
        "contract": CONTRACT,
        "status": "PASS",
        "operation": "embed-batch",
        "provider": {"id": "openclip", "model": OPENCLIP_MODEL, "pretrained": OPENCLIP_PRETRAINED, "revision": OPENCLIP_REVISION, "license": "MIT-code-model-card-bound-weights", "device": str(device), "offline": True},
        "dimension": len(image_vectors[0]["vector"]),
        "imageVectors": image_vectors,
        "textVectors": text_vectors,
        "failures": [],
        "durationMs": round((time.perf_counter() - started) * 1000, 2),
        "reviewOnly": True,
        "productionAdmission": False,
    }


def perspective_bind(request: dict[str, Any], started: float) -> dict[str, Any]:
    source_path = inside_root(str(request.get("sourcePath") or ""))
    overlay_path = inside_root(str(request.get("overlayPath") or ""))
    output_path = inside_root(str(request.get("outputPath") or ""), must_exist=False)
    quad = request.get("destinationQuad")
    if not isinstance(quad, list) or len(quad) != 4 or any(not isinstance(point, list) or len(point) != 2 for point in quad):
        return blocked("perspective-bind", ["destination-quad-invalid"], started)
    source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    overlay = cv2.imread(str(overlay_path), cv2.IMREAD_UNCHANGED)
    if source is None or overlay is None or overlay.ndim != 3 or overlay.shape[2] != 4:
        return blocked("perspective-bind", ["source-or-overlay-unreadable"], started)
    height, width = source.shape[:2]
    destination = np.asarray([[float(point[0]) * width, float(point[1]) * height] for point in quad], dtype=np.float32)
    if np.any(destination[:, 0] < 0) or np.any(destination[:, 0] > width) or np.any(destination[:, 1] < 0) or np.any(destination[:, 1] > height):
        return blocked("perspective-bind", ["destination-quad-outside-source"], started)
    overlay_height, overlay_width = overlay.shape[:2]
    origin = np.float32([[0, 0], [overlay_width - 1, 0], [overlay_width - 1, overlay_height - 1], [0, overlay_height - 1]])
    matrix = cv2.getPerspectiveTransform(origin, destination)
    if np.linalg.matrix_rank(matrix) != 3:
        return blocked("perspective-bind", ["perspective-matrix-singular"], started)
    warped = cv2.warpPerspective(overlay, matrix, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    alpha = warped[:, :, 3:4].astype(np.float32) / 255.0
    composite = source.astype(np.float32) * (1.0 - alpha) + warped[:, :, :3].astype(np.float32) * alpha
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output_path), np.clip(composite, 0, 255).astype(np.uint8)):
        return blocked("perspective-bind", ["output-write-failed"], started)
    return {
        "contract": CONTRACT,
        "status": "PASS",
        "operation": "perspective-bind",
        "provider": {"id": "opencv-homography", "version": cv2.__version__, "license": "Apache-2.0", "offline": True},
        "source": {"path": str(source_path), "sha256": sha256_file(source_path), "width": width, "height": height},
        "overlay": {"path": str(overlay_path), "sha256": sha256_file(overlay_path), "width": overlay_width, "height": overlay_height},
        "destinationQuad": [[round(float(x), 6), round(float(y), 6)] for x, y in quad],
        "matrix": matrix.round(8).tolist(),
        "output": {"path": str(output_path), "sha256": sha256_file(output_path), "width": width, "height": height},
        "failures": [],
        "durationMs": round((time.perf_counter() - started) * 1000, 2),
        "reviewOnly": True,
        "productionAdmission": False,
    }


def main() -> int:
    started = time.perf_counter()
    try:
        request = json.loads(sys.stdin.read())
    except Exception as error:
        print(json.dumps(blocked("unknown", [f"request-json-invalid:{type(error).__name__}"], started)))
        return 2
    if request.get("contract") != "A1ExternalSourceToolRequest/v1":
        print(json.dumps(blocked(str(request.get("operation") or "unknown"), ["request-contract-invalid"], started)))
        return 2
    operation = request.get("operation")
    try:
        if operation == "semantic-rerank":
            result = semantic_rerank(request, started)
        elif operation == "embed-batch":
            result = embed_batch(request, started)
        elif operation == "perspective-bind":
            result = perspective_bind(request, started)
        else:
            result = blocked(str(operation or "unknown"), ["operation-unsupported"], started)
    except Exception as error:
        result = blocked(str(operation or "unknown"), [f"provider-execution-failed:{type(error).__name__}:{str(error)[:280]}"], started)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["status"] in {"PASS", "BLOCKED"} else 2


if __name__ == "__main__":
    raise SystemExit(main())
