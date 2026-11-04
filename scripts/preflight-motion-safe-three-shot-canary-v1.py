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
ACTOR_KINDS = KINDS[1:]
CANARY_BASE = Path("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/three-shot-layer-canary-v1")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)


def write_rgba(path: Path, pixels: np.ndarray) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.fromarray(pixels, "RGBA")
    image.save(path, format="PNG", compress_level=9)
    return sha256(path.read_bytes())


def checker(width: int, height: int, block: int = 18) -> np.ndarray:
    yy, xx = np.indices((height, width))
    tone = np.where(((xx // block) + (yy // block)) % 2 == 0, 232, 205).astype(np.uint8)
    return np.dstack((tone, tone, tone, np.full_like(tone, 255)))


def composite_rgba(base: np.ndarray, overlay: np.ndarray) -> np.ndarray:
    alpha = overlay[:, :, 3:4].astype(np.float32) / 255.0
    result = base.astype(np.float32)
    result[:, :, :3] = overlay[:, :, :3] * alpha + result[:, :, :3] * (1.0 - alpha)
    result[:, :, 3:4] = 255
    return np.rint(result).clip(0, 255).astype(np.uint8)


def preview_actor(actor: np.ndarray) -> np.ndarray:
    return composite_rgba(checker(actor.shape[1], actor.shape[0]), actor)


def contact_sheet(tiles, width: int, height: int) -> Image.Image:
    label_height = 48
    canvas = Image.new("RGB", (width * 3, (height + label_height) * 2), (17, 20, 25))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=24)
    for index, (label, pixels) in enumerate(tiles):
        col = index % 3
        row = index // 3
        x = col * width
        y = row * (height + label_height)
        draw.text((x + 14, y + 12), label, fill=(245, 247, 250), font=font)
        canvas.paste(Image.fromarray(pixels[:, :, :3], "RGB"), (x, y + label_height))
    return canvas


def propagate_owner_labels(owner: np.ndarray, cover_mask: np.ndarray) -> np.ndarray:
    labels = owner.copy()
    kernel = np.ones((3, 3), np.uint8)
    unresolved = (cover_mask > 0) & (labels == 0)
    for _ in range(8):
        if not np.any(unresolved):
            break
        previous = labels.copy()
        for label in (1, 2, 3):
            expanded = cv2.dilate((previous == label).astype(np.uint8), kernel, iterations=1) > 0
            labels[unresolved & expanded] = label
        unresolved = (cover_mask > 0) & (labels == 0)
    labels[unresolved] = 2
    return labels


def residual_metrics(master: np.ndarray, clean_background: np.ndarray, mask: np.ndarray) -> dict:
    selected = mask > 0
    master_gray = cv2.cvtColor(master[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
    clean_gray = cv2.cvtColor(clean_background[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
    master_values = master_gray[selected]
    clean_values = clean_gray[selected]
    if master_values.size < 2 or np.std(master_values) < 1e-6 or np.std(clean_values) < 1e-6:
        correlation = 0.0
    else:
        correlation = float(np.corrcoef(master_values, clean_values)[0, 1])
    master_edges = cv2.magnitude(cv2.Sobel(master_gray, cv2.CV_32F, 1, 0), cv2.Sobel(master_gray, cv2.CV_32F, 0, 1))
    clean_edges = cv2.magnitude(cv2.Sobel(clean_gray, cv2.CV_32F, 1, 0), cv2.Sobel(clean_gray, cv2.CV_32F, 0, 1))
    master_energy = float(np.mean(master_edges[selected]))
    clean_energy = float(np.mean(clean_edges[selected]))
    return {
        "templateCorrelation": correlation,
        "absoluteTemplateCorrelation": abs(correlation),
        "masterEdgeEnergy": master_energy,
        "cleanPlateEdgeEnergy": clean_energy,
        "edgeEnergyRatio": clean_energy / max(master_energy, 1e-6),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("expected_workspace_sha256")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    workspace_path = root / "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"
    workspace = json.loads(workspace_path.read_text())
    if workspace.get("workspaceSha256") != args.expected_workspace_sha256:
        raise RuntimeError(f"motion-safe-preflight-cas-failed:{workspace.get('workspaceSha256')}")
    canary = workspace["production"]["shotIntelligence"]["threeShotLayerCanary"]
    if canary.get("status") != "THREE_SHOT_LAYER_CANARY_BLOCKED":
        raise RuntimeError("motion-safe-preflight-blocked-canary-required")
    if canary.get("failureCodes") != ["MOTION_EXPOSURE_GHOST_CONTAMINATION"]:
        raise RuntimeError("motion-safe-preflight-ghost-failure-required")

    output_root = Path(args.output).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    items = []
    for shot_id in SHOT_IDS:
        item = next(entry for entry in canary["items"] if entry["shotId"] == shot_id)
        layer_dir = root / CANARY_BASE / "layers" / shot_id
        current_layers = {kind: read_rgba(layer_dir / f"{kind.lower()}.png") for kind in KINDS}
        final = read_rgba(root / "apps/studio-next/public" / item["recomposed"]["publicUrl"].lstrip("/"))
        height, width = final.shape[:2]
        alpha_stack = np.stack([current_layers[kind][:, :, 3] for kind in ACTOR_KINDS], axis=2)
        union = (np.max(alpha_stack, axis=2) > 0).astype(np.uint8) * 255
        close_kernel = np.ones((5, 5), np.uint8)
        cover = cv2.morphologyEx(union, cv2.MORPH_CLOSE, close_kernel)
        cover = cv2.dilate(cover, np.ones((3, 3), np.uint8), iterations=1)
        owner = np.argmax(alpha_stack, axis=2).astype(np.uint8) + 1
        owner[np.max(alpha_stack, axis=2) == 0] = 0
        owner = propagate_owner_labels(owner, cover)

        bgr = cv2.cvtColor(final[:, :, :3], cv2.COLOR_RGB2BGR)
        inpainted_bgr = cv2.inpaint(bgr, cover, 9.0, cv2.INPAINT_TELEA)
        clean_rgb = cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2RGB)
        clean_background = np.dstack((clean_rgb, np.full((height, width), 255, dtype=np.uint8)))

        next_layers = {"BACKGROUND": clean_background}
        for label, kind in enumerate(ACTOR_KINDS, start=1):
            pixels = np.zeros_like(final)
            selected = owner == label
            pixels[selected, :3] = final[selected, :3]
            pixels[selected, 3] = 255
            next_layers[kind] = pixels

        recomposed = next_layers["BACKGROUND"].copy()
        for kind in ACTOR_KINDS:
            recomposed = composite_rgba(recomposed, next_layers[kind])
        exact = np.all(recomposed[:, :, :3] == final[:, :, :3], axis=2)
        absolute = np.abs(recomposed[:, :, :3].astype(np.int16) - final[:, :, :3].astype(np.int16))
        parity = {
            "exactPixelRatio": float(np.mean(exact)),
            "meanAbsoluteRgbDifference": float(np.mean(absolute)),
            "maximumChannelDifference": int(np.max(absolute)),
        }
        if parity != {"exactPixelRatio": 1.0, "meanAbsoluteRgbDifference": 0.0, "maximumChannelDifference": 0}:
            raise RuntimeError(f"motion-safe-preflight-parity-failed:{shot_id}:{parity}")

        shot_output = output_root / shot_id
        layer_records = []
        for kind in KINDS:
            path = shot_output / f"{kind.lower()}.png"
            digest = write_rgba(path, next_layers[kind])
            layer_records.append({"kind": kind, "path": str(path), "sha256": digest})
        recomposed_path = shot_output / "recomposed.png"
        recomposed_sha = write_rgba(recomposed_path, recomposed)
        envelope = cv2.dilate(cover, np.ones((161, 161), np.uint8), iterations=1)
        metrics = residual_metrics(final, clean_background, cover)
        motion_metrics = residual_metrics(final, clean_background, envelope)
        tiles = [
            (f"{shot_id} CURRENT VISIBLE TRUTH", final),
            ("CLEAN BACKGROUND CANDIDATE", clean_background),
            ("TYPOGRAPHY HARD-MATTE", preview_actor(next_layers["TYPOGRAPHY"])),
            ("ELEMENT_KIT HARD-MATTE", preview_actor(next_layers["ELEMENT_KIT"])),
            ("ILLUSTRATION / PRESENTER HARD-MATTE", preview_actor(next_layers["ILLUSTRATION"])),
            ("RECOMPOSED EXACT", recomposed),
        ]
        contact = contact_sheet(tiles, width, height)
        contact_path = shot_output / "contact-sheet.png"
        contact_path.parent.mkdir(parents=True, exist_ok=True)
        contact.save(contact_path, format="PNG", compress_level=9)
        items.append({
            "shotId": shot_id,
            "status": "DETERMINISTIC_INPAINT_ATTEMPT_1_PENDING_ACTUAL_VISUAL_REVIEW",
            "sourceCanaryManifestSha256": canary["manifestSha256"],
            "sourceSelectedMasterSha256": item["selectedLookMaster"]["sha256"],
            "sourceVisibleTruthSha256": item["recomposed"]["sha256"],
            "deterministicInpaintAttempt": 1,
            "inpaintPrimitive": "OPENCV_TELEA_ACTOR_UNION_CLEAN_PLATE_WITH_HARD_MATTE_VISIBLE_PIXEL_REPARTITION",
            "actorUnionPixelCount": int(np.count_nonzero(union)),
            "cleanPlateMaskPixelCount": int(np.count_nonzero(cover)),
            "motionExposureEnvelopePixelCount": int(np.count_nonzero(envelope)),
            "layers": layer_records,
            "recomposed": {"path": str(recomposed_path), "sha256": recomposed_sha, "parity": parity},
            "cleanPlateResidualMetrics": metrics,
            "motionExposureResidualMetrics": motion_metrics,
            "contactSheet": {"path": str(contact_path), "sha256": sha256(contact_path.read_bytes())},
            "sourceEvidenceIdentityMustRemainExact": shot_id == "ED-14",
            "presenterIdentityMustRemainExact": shot_id == "ED-31",
            "imageGenerationPerformed": False,
            "productionStateWritten": False,
        })

    body = {
        "contract": "A1MotionSafeThreeShotCanaryPreflight/v1",
        "status": "DETERMINISTIC_INPAINT_ATTEMPT_1_PENDING_ACTUAL_VISUAL_REVIEW",
        "sourceWorkspaceSha256": workspace["workspaceSha256"],
        "sourceCanaryManifestSha256": canary["manifestSha256"],
        "targetShotIds": list(SHOT_IDS),
        "itemCount": len(items),
        "layerCount": len(items) * 4,
        "items": items,
        "automaticPassMappingForbidden": True,
        "visualReviewManifestRequiredForCommit": True,
        "imageGenerationPerformed": False,
        "productionStateWritten": False,
    }
    manifest_path = output_root / "preflight.json"
    manifest_path.write_text(json.dumps(body, ensure_ascii=False, indent=2))
    print(json.dumps({"status": body["status"], "output": str(output_root), "manifest": str(manifest_path), "items": [{"shotId": item["shotId"], "contactSheet": item["contactSheet"], "parity": item["recomposed"]["parity"], "cleanPlateResidualMetrics": item["cleanPlateResidualMetrics"], "motionExposureResidualMetrics": item["motionExposureResidualMetrics"]} for item in items]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
