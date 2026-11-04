#!/usr/bin/env python3

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


SHOT_IDS = ("ED-08", "ED-14", "ED-31")
KINDS = ("BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_rgba(path: Path, size=None) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    if size is not None and image.size != size:
        image = image.resize(size, Image.Resampling.LANCZOS)
    return np.asarray(image, dtype=np.uint8)


def write_rgba(path: Path, pixels: np.ndarray) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels).save(path, format="PNG", compress_level=9)
    return sha256(path.read_bytes())


def checker(width: int, height: int, block: int = 18) -> np.ndarray:
    yy, xx = np.indices((height, width))
    tone = np.where(((xx // block) + (yy // block)) % 2 == 0, 232, 205).astype(np.uint8)
    return np.dstack((tone, tone, tone, np.full_like(tone, 255)))


def composite(base: np.ndarray, overlay: np.ndarray) -> np.ndarray:
    alpha = overlay[:, :, 3:4].astype(np.float32) / 255.0
    result = base.astype(np.float32)
    result[:, :, :3] = overlay[:, :, :3] * alpha + result[:, :, :3] * (1.0 - alpha)
    result[:, :, 3:4] = 255
    return np.rint(result).clip(0, 255).astype(np.uint8)


def preview_actor(actor: np.ndarray) -> np.ndarray:
    return composite(checker(actor.shape[1], actor.shape[0]), actor)


def contact_sheet(tiles, width: int, height: int) -> Image.Image:
    label_height = 48
    canvas = Image.new("RGB", (width * 3, (height + label_height) * 2), (17, 20, 25))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=24)
    for index, (label, pixels) in enumerate(tiles):
        col, row = index % 3, index // 3
        x, y = col * width, row * (height + label_height)
        draw.text((x + 14, y + 12), label, fill=(245, 247, 250), font=font)
        canvas.paste(Image.fromarray(pixels[:, :, :3]), (x, y + label_height))
    return canvas


def residual_metrics(master: np.ndarray, background: np.ndarray, mask: np.ndarray) -> dict:
    selected = mask > 0
    master_gray = cv2.cvtColor(master[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
    background_gray = cv2.cvtColor(background[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
    a, b = master_gray[selected], background_gray[selected]
    correlation = 0.0 if a.size < 2 or np.std(a) < 1e-6 or np.std(b) < 1e-6 else float(np.corrcoef(a, b)[0, 1])
    master_edges = cv2.magnitude(cv2.Sobel(master_gray, cv2.CV_32F, 1, 0), cv2.Sobel(master_gray, cv2.CV_32F, 0, 1))
    background_edges = cv2.magnitude(cv2.Sobel(background_gray, cv2.CV_32F, 1, 0), cv2.Sobel(background_gray, cv2.CV_32F, 0, 1))
    master_energy = float(np.mean(master_edges[selected]))
    background_energy = float(np.mean(background_edges[selected]))
    return {"templateCorrelation": correlation, "absoluteTemplateCorrelation": abs(correlation), "masterEdgeEnergy": master_energy, "cleanPlateEdgeEnergy": background_energy, "edgeEnergyRatio": background_energy / max(master_energy, 1e-6)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deterministic-preflight", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--ed08", required=True)
    parser.add_argument("--ed14", required=True)
    parser.add_argument("--ed31", required=True)
    args = parser.parse_args()
    source_root = Path(args.deterministic_preflight).resolve()
    output_root = Path(args.output).resolve()
    imagegen_sources = {"ED-08": Path(args.ed08).resolve(), "ED-14": Path(args.ed14).resolve(), "ED-31": Path(args.ed31).resolve()}
    preflight = json.loads((source_root / "preflight.json").read_text())
    items = []
    for shot_id in SHOT_IDS:
        source_item = next(item for item in preflight["items"] if item["shotId"] == shot_id)
        layers = {kind: read_rgba(source_root / shot_id / f"{kind.lower()}.png") for kind in KINDS}
        visible_truth = read_rgba(source_root / shot_id / "recomposed.png")
        height, width = visible_truth.shape[:2]
        imagegen = read_rgba(imagegen_sources[shot_id], (width, height))
        actor_union = np.maximum.reduce([layers[kind][:, :, 3] for kind in KINDS[1:]]) > 0
        destination_bgr = cv2.cvtColor(visible_truth[:, :, :3], cv2.COLOR_RGB2BGR)
        source_bgr = cv2.cvtColor(imagegen[:, :, :3], cv2.COLOR_RGB2BGR)
        clone_mask = actor_union.astype(np.uint8) * 255
        blended_bgr = cv2.seamlessClone(source_bgr, destination_bgr, clone_mask, (width // 2, height // 2), cv2.NORMAL_CLONE)
        blended_rgb = cv2.cvtColor(blended_bgr, cv2.COLOR_BGR2RGB)
        blended_rgb[~actor_union] = visible_truth[~actor_union, :3]
        clean_background = np.dstack((blended_rgb, np.full((height, width), 255, dtype=np.uint8)))
        layers["BACKGROUND"] = clean_background

        recomposed = layers["BACKGROUND"].copy()
        for kind in KINDS[1:]:
            recomposed = composite(recomposed, layers[kind])
        exact = np.all(recomposed[:, :, :3] == visible_truth[:, :, :3], axis=2)
        absolute = np.abs(recomposed[:, :, :3].astype(np.int16) - visible_truth[:, :, :3].astype(np.int16))
        parity = {"exactPixelRatio": float(np.mean(exact)), "meanAbsoluteRgbDifference": float(np.mean(absolute)), "maximumChannelDifference": int(np.max(absolute))}
        if parity != {"exactPixelRatio": 1.0, "meanAbsoluteRgbDifference": 0.0, "maximumChannelDifference": 0}:
            raise RuntimeError(f"imagegen-clean-plate-parity-failed:{shot_id}:{parity}")

        mask = actor_union.astype(np.uint8) * 255
        envelope = cv2.dilate(mask, np.ones((161, 161), np.uint8), iterations=1)
        shot_root = output_root / shot_id
        layer_records = []
        for kind in KINDS:
            path = shot_root / f"{kind.lower()}.png"
            digest = write_rgba(path, layers[kind])
            layer_records.append({"kind": kind, "path": str(path), "sha256": digest})
        recomposed_path = shot_root / "recomposed.png"
        recomposed_sha = write_rgba(recomposed_path, recomposed)
        imagegen_copy = shot_root / "imagegen-clean-plate-source.png"
        imagegen_sha = write_rgba(imagegen_copy, imagegen)
        tiles = [
            (f"{shot_id} CURRENT VISIBLE TRUTH", visible_truth),
            ("MOTION-SAFE CLEAN BACKGROUND", clean_background),
            ("TYPOGRAPHY ORIGINAL PIXELS", preview_actor(layers["TYPOGRAPHY"])),
            ("ELEMENT_KIT ORIGINAL PIXELS", preview_actor(layers["ELEMENT_KIT"])),
            ("ILLUSTRATION / PRESENTER ORIGINAL PIXELS", preview_actor(layers["ILLUSTRATION"])),
            ("RECOMPOSED EXACT", recomposed),
        ]
        contact = contact_sheet(tiles, width, height)
        contact_path = shot_root / "contact-sheet.png"
        contact_path.parent.mkdir(parents=True, exist_ok=True)
        contact.save(contact_path, format="PNG", compress_level=9)
        metrics = residual_metrics(visible_truth, clean_background, mask)
        items.append({
            "shotId": shot_id,
            "status": "IMAGEGEN_MASKED_EDIT_ATTEMPT_1_PENDING_MACHINE_AND_ACTUAL_VISUAL_REVIEW",
            "sourceSelectedMasterSha256": source_item["sourceSelectedMasterSha256"],
            "sourceVisibleTruthSha256": source_item["sourceVisibleTruthSha256"],
            "deterministicInpaintAttemptCount": 1,
            "deterministicInpaintResult": "FAIL_MOTION_EXPOSURE_GHOST_CONTAMINATION",
            "imagegenMaskedEditAttemptCount": 1,
            "imagegenSource": {"originalPath": str(imagegen_sources[shot_id]), "copiedPath": str(imagegen_copy), "sha256": imagegen_sha, "actualImageAttachmentUsed": True},
            "actorUnionPixelCount": int(np.count_nonzero(mask)),
            "motionExposureEnvelopePixelCount": int(np.count_nonzero(envelope)),
            "cleanPlateResidualMetrics": metrics,
            "layers": layer_records,
            "recomposed": {"path": str(recomposed_path), "sha256": recomposed_sha, "parity": parity},
            "contactSheet": {"path": str(contact_path), "sha256": sha256(contact_path.read_bytes())},
            "sourceEvidenceIdentityMustRemainExact": shot_id == "ED-14",
            "presenterIdentityMustRemainExact": shot_id == "ED-31",
            "productionStateWritten": False,
        })
    body = {
        "contract": "A1MotionSafeThreeShotImagegenCleanPlatePreflight/v1",
        "status": "PENDING_MACHINE_AND_ACTUAL_VISUAL_REVIEW",
        "sourceWorkspaceSha256": preflight["sourceWorkspaceSha256"],
        "sourceCanaryManifestSha256": preflight["sourceCanaryManifestSha256"],
        "targetShotIds": list(SHOT_IDS),
        "itemCount": 3,
        "layerCount": 12,
        "items": items,
        "automaticPassMappingForbidden": True,
        "visualReviewManifestRequiredForCommit": True,
        "productionStateWritten": False,
    }
    manifest_path = output_root / "preflight.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(body, ensure_ascii=False, indent=2))
    print(json.dumps({"status": body["status"], "output": str(output_root), "manifest": str(manifest_path), "items": [{"shotId": item["shotId"], "contactSheet": item["contactSheet"], "cleanPlateResidualMetrics": item["cleanPlateResidualMetrics"], "parity": item["recomposed"]["parity"]} for item in items]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
