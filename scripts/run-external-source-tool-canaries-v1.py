#!/usr/bin/env python3

import hashlib
import json
import os
import platform
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont
from torchvision import transforms

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "work/external-source-tool-canaries-v1"
OUTPUTS = OUT / "outputs"
CACHE = OUT / "cache"
OUTPUTS.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

WORKSPACE = ROOT / "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"
SYSTEM_PHASE = ROOT / ".codex-artifacts/system-progress-system-line/current-phase.json"
BASELINE = json.loads((OUT / "environment-baseline.json").read_text())
BIREFNET_REVISION = "e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4"
OPENCLIP_REVISION = "1a25a446712ba5ee05982a381eed697ef9b435cf"


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def authority_snapshot():
    phase = json.loads(SYSTEM_PHASE.read_text())
    return {
        "workspaceIdentitySha256": phase.get("authority", {}).get("workspaceSha256"),
        "workspaceFileSha256": sha256_file(WORKSPACE),
        "systemLinePhaseFileSha256": sha256_file(SYSTEM_PHASE),
    }


def font(size, bold=False):
    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for item in paths:
        if Path(item).exists():
            try:
                return ImageFont.truetype(item, size)
            except Exception:
                pass
    return ImageFont.load_default()


def contain(image, size, background=(244, 242, 235)):
    image = image.convert("RGB")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, background)
    x = (size[0] - image.width) // 2
    y = (size[1] - image.height) // 2
    canvas.paste(image, (x, y))
    return canvas


def checkerboard(size, block=24):
    arr = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    for y in range(0, size[1], block):
        for x in range(0, size[0], block):
            color = 220 if ((x // block) + (y // block)) % 2 == 0 else 175
            arr[y:y + block, x:x + block] = color
    return Image.fromarray(arr, "RGB")


def openclip_canary(device):
    import open_clip

    candidates = [
        ("newspaper-front", ROOT / "work/live-external-source-packaging-canary-v1/staging/live-source-a/02.img"),
        ("newspaper-portrait", ROOT / "work/live-external-source-packaging-canary-v1/staging/live-source-a/01.img"),
        ("nasa-room-a", ROOT / "work/live-external-source-packaging-canary-v1/staging/live-source-b/02.img"),
        ("nasa-room-b", ROOT / "work/live-external-source-packaging-canary-v1/staging/live-source-b/03.img"),
        ("public-health-poster", ROOT / "work/live-external-source-packaging-canary-v1/staging/live-source-c/01.img"),
        ("presenter", ROOT / "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/source-cache/presenter-opening-frame.jpg"),
        ("profile", ROOT / "apps/studio-next/public/generated/system-line/web-source-packaging-pilot-v1/sources/vishakh-padmakumar-official-portrait.webp"),
    ]
    for _, path in candidates:
        if not path.exists():
            raise FileNotFoundError(path)

    model_name = "ViT-B-32"
    pretrained = "laion2b_s34b_b79k"
    model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained, cache_dir=str(CACHE / "openclip"))
    model = model.eval().to(device)
    tokenizer = open_clip.get_tokenizer(model_name)
    images = torch.stack([preprocess(Image.open(path).convert("RGB")) for _, path in candidates]).to(device)
    queries = [
        {"id": "newspaper", "text": "a scanned newspaper front page", "expected": ["newspaper-front", "newspaper-portrait"]},
        {"id": "control-room", "text": "a NASA control room with many computer monitors", "expected": ["nasa-room-a", "nasa-room-b"]},
        {"id": "poster", "text": "a public health propaganda poster", "expected": ["public-health-poster"]},
    ]
    text = tokenizer([item["text"] for item in queries]).to(device)
    with torch.inference_mode():
        image_features = model.encode_image(images)
        text_features = model.encode_text(text)
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        scores = (100.0 * text_features @ image_features.T).softmax(dim=-1).cpu().numpy()

    rows = []
    for query, values in zip(queries, scores):
        ranked_indices = np.argsort(-values)
        ranking = [{"candidate": candidates[i][0], "score": float(values[i]), "path": str(candidates[i][1].relative_to(ROOT))} for i in ranked_indices]
        expected_rank = min(index + 1 for index, row in enumerate(ranking) if row["candidate"] in query["expected"])
        rows.append({"id": query["id"], "query": query["text"], "expectedRank": expected_rank, "ranking": ranking, "status": "PASS" if expected_rank <= 2 else "FAIL"})

    panel = Image.new("RGB", (1500, 960), (246, 244, 237))
    draw = ImageDraw.Draw(panel)
    draw.text((36, 24), "Semantic image reranking · OpenCLIP", fill=(20, 24, 25), font=font(30, True))
    for row_index, row in enumerate(rows):
        y = 92 + row_index * 280
        draw.text((38, y), row["query"], fill=(20, 24, 25), font=font(20, True))
        for rank, item in enumerate(row["ranking"][:4]):
            source_path = ROOT / item["path"]
            thumb = contain(Image.open(source_path), (310, 190))
            x = 38 + rank * 355
            panel.paste(thumb, (x, y + 38))
            color = (33, 90, 44) if rank + 1 == row["expectedRank"] else (70, 76, 77)
            draw.text((x, y + 234), f"{rank + 1}. {item['candidate']}  {item['score']:.3f}", fill=color, font=font(15, rank + 1 == row["expectedRank"]))
    path = OUTPUTS / "openclip-rerank-board.jpg"
    panel.save(path, quality=92)
    return {
        "id": "tool-rerank-a",
        "status": "PASS" if all(row["status"] == "PASS" for row in rows) else "FAIL",
        "device": str(device),
        "model": {"name": model_name, "pretrained": pretrained},
        "modelRevision": OPENCLIP_REVISION,
        "queries": rows,
        "artifact": {"path": str(path.relative_to(ROOT)), "sha256": sha256_file(path), "width": panel.width, "height": panel.height},
    }


def load_birefnet(device):
    from transformers import AutoModelForImageSegmentation
    model = AutoModelForImageSegmentation.from_pretrained(
        "ZhengPeng7/BiRefNet",
        trust_remote_code=True,
        revision=BIREFNET_REVISION,
        cache_dir=str(CACHE / "huggingface"),
    )
    return model.eval().to(device)


def clean_subject_mask(mask):
    raw = np.asarray(mask, dtype=np.uint8)
    binary = (raw >= 64).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if count <= 1:
        return mask, 0.0, 0
    areas = stats[1:, cv2.CC_STAT_AREA]
    largest = int(np.argmax(areas)) + 1
    largest_area = int(stats[largest, cv2.CC_STAT_AREA])
    keep = np.zeros_like(binary)
    kept_components = 0
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        # Preserve the dominant subject and any genuinely substantial attached
        # foreground island; discard small disconnected subtitle/watermark glyphs.
        if label == largest or area >= max(256, int(largest_area * 0.035)):
            keep[labels == label] = 1
            kept_components += 1
    cleaned = (raw.astype(np.float32) * keep).astype(np.uint8)
    removed_ratio = float(np.mean((raw > 32) & (cleaned <= 32)))
    return Image.fromarray(cleaned, "L"), removed_ratio, kept_components


def birefnet_canary(device):
    sources = [
        ("official-profile", ROOT / "apps/studio-next/public/generated/system-line/web-source-packaging-pilot-v1/sources/vishakh-padmakumar-official-portrait.webp", "official profile source", True),
        ("user-presenter", ROOT / "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/source-cache/presenter-opening-frame.jpg", "user-owned presenter frame", True),
        ("complex-reference", ROOT / "work/bv1xzmu6te1x-typography-study-20260915/motion-sequences/prop-and-legal-income/frame-007.jpg", "reference-review-only; burned-in caption present", False),
    ]
    model = load_birefnet(device)
    transform = transforms.Compose([
        transforms.Resize((1024, 1024)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    results = []
    panels = []
    for name, source_path, boundary, clean_source in sources:
        image = Image.open(source_path).convert("RGB")
        tensor = transform(image).unsqueeze(0).to(device)
        try:
            with torch.inference_mode():
                prediction = model(tensor)[-1].sigmoid().cpu()[0, 0]
        except Exception:
            if str(device) == "cpu":
                raise
            device = torch.device("cpu")
            model = model.to(device)
            tensor = tensor.to(device)
            with torch.inference_mode():
                prediction = model(tensor)[-1].sigmoid().cpu()[0, 0]
        raw_mask = transforms.ToPILImage()(prediction).resize(image.size, Image.Resampling.LANCZOS)
        mask, removed_ratio, kept_components = clean_subject_mask(raw_mask)
        rgba = image.convert("RGBA")
        rgba.putalpha(mask)
        raw_mask_path = OUTPUTS / f"{name}-raw-mask.png"
        mask_path = OUTPUTS / f"{name}-mask.png"
        cutout_path = OUTPUTS / f"{name}-cutout.png"
        raw_mask.save(raw_mask_path)
        mask.save(mask_path)
        rgba.save(cutout_path)
        checker = checkerboard(image.size)
        checker.paste(rgba, (0, 0), rgba)
        preview = Image.new("RGB", (1200, 470), (246, 244, 237))
        preview.paste(contain(image, (560, 390)), (20, 56))
        preview.paste(contain(checker, (560, 390)), (620, 56))
        pdraw = ImageDraw.Draw(preview)
        pdraw.text((20, 16), f"{name} · original", fill=(20, 24, 25), font=font(20, True))
        right_label = "BiRefNet alpha on checkerboard" if clean_source else "BLOCKED · burned-in caption survives matting"
        pdraw.text((620, 16), right_label, fill=(20, 24, 25) if clean_source else (170, 36, 36), font=font(20, True))
        panels.append(preview)
        array = np.asarray(mask, dtype=np.uint8)
        coverage = float(np.mean(array > 32))
        soft_ratio = float(np.mean((array > 8) & (array < 247)))
        mask_valid = 0.02 < coverage < 0.98 and array.min() == 0 and array.max() >= 250
        status = ("PASS" if mask_valid else "FAIL") if clean_source else ("EXPECTED_BLOCKED" if mask_valid else "FAIL")
        results.append({
            "id": name,
            "status": status,
            "source": str(source_path.relative_to(ROOT)),
            "sourceSha256": sha256_file(source_path),
            "rightsBoundary": boundary,
            "cleanSourceRequired": True,
            "sourceClean": clean_source,
            "admissionStatus": "REVIEWABLE_ALPHA" if status == "PASS" else "BLOCKED_SOURCE_BURNED_TEXT" if status == "EXPECTED_BLOCKED" else "BLOCKED_MASK_INVALID",
            "rawMask": {"path": str(raw_mask_path.relative_to(ROOT)), "sha256": sha256_file(raw_mask_path)},
            "mask": {"path": str(mask_path.relative_to(ROOT)), "sha256": sha256_file(mask_path), "min": int(array.min()), "max": int(array.max()), "coverage": coverage, "softEdgeRatio": soft_ratio, "removedDisconnectedRatio": removed_ratio, "keptComponents": kept_components},
            "cutout": {"path": str(cutout_path.relative_to(ROOT)), "sha256": sha256_file(cutout_path)},
        })

    board = Image.new("RGB", (1200, 470 * len(panels) + 70), (246, 244, 237))
    bdraw = ImageDraw.Draw(board)
    bdraw.text((28, 20), "BiRefNet alpha-matting canary", fill=(20, 24, 25), font=font(30, True))
    for index, panel in enumerate(panels):
        board.paste(panel, (0, 70 + index * 470))
    board_path = OUTPUTS / "birefnet-matting-board.jpg"
    board.save(board_path, quality=92)
    return {
        "id": "tool-matting-b",
        "status": "PASS" if all(item["status"] in ["PASS", "EXPECTED_BLOCKED"] for item in results) and sum(item["status"] == "PASS" for item in results) >= 2 else "FAIL",
        "device": str(device),
        "model": "ZhengPeng7/BiRefNet",
        "modelRevision": BIREFNET_REVISION,
        "results": results,
        "artifact": {"path": str(board_path.relative_to(ROOT)), "sha256": sha256_file(board_path), "width": board.width, "height": board.height},
    }


def homography_canary():
    source_path = ROOT / "work/live-external-source-packaging-canary-v1/staging/live-source-b/03.img"
    source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    if source is None:
        raise RuntimeError(f"unreadable source: {source_path}")
    h, w = source.shape[:2]
    overlay_w, overlay_h = 720, 220
    overlay = np.zeros((overlay_h, overlay_w, 4), dtype=np.uint8)
    cv2.putText(overlay, "VERIFIED RESULT", (26, 105), cv2.FONT_HERSHEY_DUPLEX, 1.65, (244, 244, 238, 255), 3, cv2.LINE_AA)
    cv2.line(overlay, (28, 142), (680, 142), (50, 255, 200, 255), 8, cv2.LINE_AA)
    cv2.putText(overlay, "SOURCE-BOUND", (28, 188), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (210, 218, 218, 255), 2, cv2.LINE_AA)
    src = np.float32([[0, 0], [overlay_w - 1, 0], [overlay_w - 1, overlay_h - 1], [0, overlay_h - 1]])
    dst = np.float32([
        [0.55 * w, 0.13 * h],
        [0.975 * w, 0.04 * h],
        [0.97 * w, 0.47 * h],
        [0.55 * w, 0.38 * h],
    ])
    matrix = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(overlay, matrix, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    alpha = warped[:, :, 3:4].astype(np.float32) / 255.0
    composed = source.astype(np.float32) * (1.0 - alpha) + warped[:, :, :3].astype(np.float32) * alpha
    composed = np.clip(composed, 0, 255).astype(np.uint8)
    output_path = OUTPUTS / "homography-perspective-output.png"
    cv2.imwrite(str(output_path), composed)
    difference = float(np.mean(np.abs(composed.astype(np.float32) - source.astype(np.float32))) / 255.0)
    status = "PASS" if difference > 0.003 and np.linalg.matrix_rank(matrix) == 3 else "FAIL"

    original = Image.open(source_path).convert("RGB")
    after = Image.open(output_path).convert("RGB")
    board = Image.new("RGB", (1600, 650), (246, 244, 237))
    draw = ImageDraw.Draw(board)
    draw.text((28, 18), "OpenCV four-point perspective binding", fill=(20, 24, 25), font=font(30, True))
    board.paste(contain(original, (760, 540)), (20, 80))
    board.paste(contain(after, (760, 540)), (820, 80))
    draw.text((28, 52), "original verified source", fill=(80, 88, 89), font=font(16))
    draw.text((828, 52), "clean output · no HUD frame", fill=(80, 88, 89), font=font(16))
    board_path = OUTPUTS / "opencv-homography-board.jpg"
    board.save(board_path, quality=92)
    return {
        "id": "tool-perspective-c",
        "status": status,
        "library": f"opencv-{cv2.__version__}",
        "source": {"path": str(source_path.relative_to(ROOT)), "sha256": sha256_file(source_path), "rightsBoundary": "Openverse CC0 canary source"},
        "quad": dst.round(2).tolist(),
        "matrix": matrix.round(8).tolist(),
        "meanAbsoluteDifference": difference,
        "output": {"path": str(output_path.relative_to(ROOT)), "sha256": sha256_file(output_path), "width": w, "height": h},
        "artifact": {"path": str(board_path.relative_to(ROOT)), "sha256": sha256_file(board_path), "width": board.width, "height": board.height},
    }


def contact_sheet(fixtures):
    boards = [Image.open(ROOT / item["artifact"]["path"]).convert("RGB") for item in fixtures]
    target_width = max(image.width for image in boards)
    resized = []
    for image in boards:
        if image.width != target_width:
            ratio = target_width / image.width
            image = image.resize((target_width, round(image.height * ratio)), Image.Resampling.LANCZOS)
        resized.append(image)
    header = 90
    sheet = Image.new("RGB", (target_width, header + sum(image.height for image in resized)), (242, 240, 233))
    draw = ImageDraw.Draw(sheet)
    draw.text((30, 20), "External-source tool canaries · review only", fill=(20, 24, 25), font=font(34, True))
    draw.text((30, 60), "semantic retrieval / alpha matting / planar typography", fill=(78, 86, 87), font=font(17))
    y = header
    for image in resized:
        sheet.paste(image, (0, y))
        y += image.height
    path = OUT / "contact-sheet.jpg"
    sheet.save(path, quality=92)
    return {"path": str(path.relative_to(ROOT)), "sha256": sha256_file(path), "width": sheet.width, "height": sheet.height}


def main():
    initial_authority = authority_snapshot()
    if initial_authority != BASELINE["authoritySnapshot"]:
        raise RuntimeError("formal authority changed before canary")
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    rerank = openclip_canary(device)
    matting = birefnet_canary(device)
    perspective = homography_canary()
    fixtures = [rerank, matting, perspective]
    visible = contact_sheet(fixtures)
    final_authority = authority_snapshot()
    if final_authority != initial_authority:
        raise RuntimeError("formal authority mutated during canary")
    report = {
        "contract": "A1ExternalSourceToolCanaries/v1",
        "status": "PASS" if all(item["status"] == "PASS" for item in fixtures) else "FAIL",
        "fixtures": fixtures,
        "visibleArtifact": visible,
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "device": str(device),
            "cacheRoot": str(CACHE.relative_to(ROOT)),
        },
        "boundary": {
            "reviewOnly": True,
            "productionAdmission": False,
            "workspaceMutationPerformed": False,
            "authorityUnchanged": True,
            "authoritySnapshot": final_authority,
        },
    }
    (OUT / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "status": report["status"],
        "fixtures": [{"id": item["id"], "status": item["status"], "artifact": item["artifact"]} for item in fixtures],
        "visibleArtifact": visible,
        "boundary": report["boundary"],
    }, ensure_ascii=False, indent=2))
    if report["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
