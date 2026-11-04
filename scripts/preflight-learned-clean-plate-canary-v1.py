#!/usr/bin/env python3

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


KINDS = ("BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION")
ACTOR_KINDS = KINDS[1:]
TARGETS = ("ED-08", "ED-14", "ED-31")
CANARY_BASE = Path("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/three-shot-layer-canary-v1")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)


def write_rgba(path: Path, pixels: np.ndarray) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, "RGBA").save(path, format="PNG", compress_level=9)
    return sha256(path)


def write_mask(path: Path, mask: np.ndarray) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(mask.astype(np.uint8), "L").save(path, format="PNG", compress_level=9)
    return sha256(path)


def composite(base: np.ndarray, overlay: np.ndarray) -> np.ndarray:
    alpha = overlay[:, :, 3:4].astype(np.float32) / 255.0
    result = base.astype(np.float32)
    result[:, :, :3] = overlay[:, :, :3] * alpha + result[:, :, :3] * (1.0 - alpha)
    result[:, :, 3] = 255
    return np.rint(result).clip(0, 255).astype(np.uint8)


def checker(width: int, height: int, block: int = 18) -> np.ndarray:
    yy, xx = np.indices((height, width))
    tone = np.where(((xx // block) + (yy // block)) % 2 == 0, 232, 205).astype(np.uint8)
    return np.dstack((tone, tone, tone, np.full_like(tone, 255)))


def preview_actor(actor: np.ndarray) -> np.ndarray:
    return composite(checker(actor.shape[1], actor.shape[0]), actor)


def contact_sheet(tiles, width: int, height: int) -> Image.Image:
    label_height = 48
    canvas = Image.new("RGB", (width * 3, (height + label_height) * 2), (17, 20, 25))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.load_default(size=24)
    except TypeError:
        font = ImageFont.load_default()
    for index, (label, pixels) in enumerate(tiles):
        col, row = index % 3, index // 3
        x, y = col * width, row * (height + label_height)
        draw.text((x + 14, y + 12), label, fill=(245, 247, 250), font=font)
        canvas.paste(Image.fromarray(pixels[:, :, :3], "RGB"), (x, y + label_height))
    return canvas


def residual_metrics(master: np.ndarray, clean_background: np.ndarray, mask: np.ndarray) -> dict:
    selected = mask > 0
    master_gray = cv2.cvtColor(master[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
    clean_gray = cv2.cvtColor(clean_background[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32)
    a, b = master_gray[selected], clean_gray[selected]
    correlation = 0.0 if a.size < 2 or np.std(a) < 1e-6 or np.std(b) < 1e-6 else float(np.corrcoef(a, b)[0, 1])
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


def load_authority(root: Path, expected_workspace_sha256: str, shot_id: str):
    workspace_path = root / "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"
    workspace = json.loads(workspace_path.read_text())
    if workspace.get("workspaceSha256") != expected_workspace_sha256:
        raise RuntimeError(f"learned-clean-plate-cas-failed:{workspace.get('workspaceSha256')}")
    canary = workspace["production"]["shotIntelligence"]["threeShotLayerCanary"]
    if canary.get("status") != "THREE_SHOT_LAYER_CANARY_BLOCKED":
        raise RuntimeError("learned-clean-plate-blocked-canary-required")
    if shot_id not in TARGETS:
        raise RuntimeError(f"learned-clean-plate-unsupported-shot:{shot_id}")
    item = next(entry for entry in canary["items"] if entry["shotId"] == shot_id)
    return workspace, canary, item


def actor_state(root: Path, shot_id: str, item: dict):
    layer_dir = root / CANARY_BASE / "layers" / shot_id
    layers = {kind: read_rgba(layer_dir / f"{kind.lower()}.png") for kind in KINDS}
    visible_truth = read_rgba(root / "apps/studio-next/public" / item["recomposed"]["publicUrl"].lstrip("/"))
    alpha_stack = np.stack([layers[kind][:, :, 3] for kind in ACTOR_KINDS], axis=2)
    seed = (np.max(alpha_stack, axis=2) > 0).astype(np.uint8) * 255
    owner = np.argmax(alpha_stack, axis=2).astype(np.uint8) + 1
    owner[np.max(alpha_stack, axis=2) == 0] = 0
    return layers, visible_truth, seed, owner


def rebuilt_semantic_owner(shot_id: str, seed: np.ndarray) -> np.ndarray:
    """Assign ownership without inheriting contaminated legacy layer alpha."""
    height, width = seed.shape
    yy, xx = np.indices((height, width))
    owner = np.zeros_like(seed, dtype=np.uint8)
    active = seed > 0
    if shot_id != "ED-31":
        owner[active] = 2
        return owner

    # ED-31: title and evidence-card copy are typography actors.
    typography = (
        ((xx < int(width * 0.31)) & (yy < int(height * 0.27)))
        | ((xx > int(width * 0.76)) & (yy > int(height * 0.20)) & (yy < int(height * 0.66)))
    )
    # The presenter, chair, microphone and boom constitute the identity actor.
    illustration = (
        ((xx > int(width * 0.25)) & (xx < int(width * 0.72)) & (yy > int(height * 0.22)))
        | ((xx < int(width * 0.55)) & (yy > int(height * 0.38)) & (yy < int(height * 0.86)))
    )
    owner[active] = 2
    owner[active & typography] = 1
    owner[active & illustration] = 3
    return owner


def prepare(args) -> None:
    root = Path(__file__).resolve().parent.parent
    workspace, canary, item = load_authority(root, args.expected_workspace_sha256, args.shot)
    _, visible_truth, seed, _ = actor_state(root, args.shot, item)
    replaced_seed = False
    if args.reference_clean_source:
        reference_clean = read_rgba(Path(args.reference_clean_source).resolve())
        if reference_clean.shape != visible_truth.shape:
            reference_clean = np.asarray(Image.fromarray(reference_clean, "RGBA").resize((visible_truth.shape[1], visible_truth.shape[0]), Image.Resampling.LANCZOS), dtype=np.uint8)
        difference = np.max(np.abs(visible_truth[:, :, :3].astype(np.int16) - reference_clean[:, :, :3].astype(np.int16)), axis=2)
        candidate = (difference >= args.augmentation_threshold).astype(np.uint8)
        if args.replace_seed_with_reference_difference:
            seed = candidate * 255
            replaced_seed = True
        else:
            count, labels = cv2.connectedComponents(candidate, connectivity=8)
            touch = cv2.dilate((seed > 0).astype(np.uint8), np.ones((args.augmentation_touch_radius * 2 + 1, args.augmentation_touch_radius * 2 + 1), np.uint8), iterations=1) > 0
            augmentation = np.zeros_like(candidate, dtype=bool)
            for label in range(1, count):
                component = labels == label
                if np.any(component & touch):
                    augmentation |= component
            seed = ((seed > 0) | augmentation).astype(np.uint8) * 255
    if args.additional_seed_mask:
        additional = np.asarray(Image.open(Path(args.additional_seed_mask).resolve()).convert("L"), dtype=np.uint8)
        if additional.shape != seed.shape:
            additional = np.asarray(Image.fromarray(additional).resize((seed.shape[1], seed.shape[0]), Image.Resampling.LANCZOS), dtype=np.uint8)
        seed = ((seed > 0) | (additional >= args.additional_seed_threshold)).astype(np.uint8) * 255
    close_size = args.probe_close_radius * 2 + 1
    dilate_size = args.probe_dilate_radius * 2 + 1
    probe = cv2.morphologyEx(seed, cv2.MORPH_CLOSE, np.ones((close_size, close_size), np.uint8))
    probe = cv2.dilate(probe, np.ones((dilate_size, dilate_size), np.uint8), iterations=1)
    output = Path(args.output).resolve()
    input_path = output / "input.png"
    seed_path = output / "seed-mask.png"
    probe_path = output / "probe-mask.png"
    records = {
        "input": {"path": str(input_path), "sha256": write_rgba(input_path, visible_truth)},
        "seedMask": {"path": str(seed_path), "sha256": write_mask(seed_path, seed)},
        "probeMask": {"path": str(probe_path), "sha256": write_mask(probe_path, probe)},
    }
    body = {
        "contract": "A1LearnedCleanPlateCanaryPreflight/v1",
        "mode": "PREPARE",
        "status": "READY_FOR_SINGLE_LEARNED_INPAINT_ATTEMPT",
        "sourceWorkspaceSha256": workspace["workspaceSha256"],
        "sourceCanaryManifestSha256": canary["manifestSha256"],
        "shotId": args.shot,
        "sourceSelectedMasterSha256": item["selectedLookMaster"]["sha256"],
        "sourceVisibleTruthSha256": item["recomposed"]["sha256"],
        "primitive": args.primitive,
        "referenceCleanSource": str(Path(args.reference_clean_source).resolve()) if args.reference_clean_source else None,
        "augmentationThreshold": args.augmentation_threshold if args.reference_clean_source else None,
        "augmentationTouchRadius": args.augmentation_touch_radius if args.reference_clean_source else None,
        "replaceSeedWithReferenceDifference": replaced_seed,
        "additionalSeedMask": str(Path(args.additional_seed_mask).resolve()) if args.additional_seed_mask else None,
        "additionalSeedThreshold": args.additional_seed_threshold if args.additional_seed_mask else None,
        "probeCloseRadius": args.probe_close_radius,
        "probeDilateRadius": args.probe_dilate_radius,
        "seedPixelCount": int(np.count_nonzero(seed)),
        "probePixelCount": int(np.count_nonzero(probe)),
        "artifacts": records,
        "productionStateWritten": False,
    }
    manifest_path = output / "prepare.json"
    manifest_path.write_text(json.dumps(body, ensure_ascii=False, indent=2))
    print(json.dumps({"status": body["status"], "manifest": str(manifest_path), **records}, ensure_ascii=False, indent=2))


def connected_residual_footprint(seed: np.ndarray, probe: np.ndarray, residual: np.ndarray) -> np.ndarray:
    candidate = ((probe > 0) & (residual > 0)).astype(np.uint8)
    count, labels = cv2.connectedComponents(candidate, connectivity=8)
    seed_touch = cv2.dilate((seed > 0).astype(np.uint8), np.ones((17, 17), np.uint8), iterations=1) > 0
    keep = np.zeros_like(candidate, dtype=bool)
    for label in range(1, count):
        component = labels == label
        if np.any(component & seed_touch):
            keep |= component
    footprint = ((seed > 0) | keep).astype(np.uint8) * 255
    return cv2.morphologyEx(footprint, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))


def propagate_owner(owner: np.ndarray, footprint: np.ndarray) -> np.ndarray:
    labels = owner.copy()
    unresolved = (footprint > 0) & (labels == 0)
    kernel = np.ones((3, 3), np.uint8)
    for _ in range(32):
        if not np.any(unresolved):
            break
        previous = labels.copy()
        for label in (1, 2, 3):
            expanded = cv2.dilate((previous == label).astype(np.uint8), kernel, iterations=1) > 0
            labels[unresolved & expanded] = label
        unresolved = (footprint > 0) & (labels == 0)
    labels[unresolved] = 2
    return labels


def spatial_polynomial_color_transfer(reference: np.ndarray, source: np.ndarray, known_mask: np.ndarray) -> np.ndarray:
    height, width = known_mask.shape
    yy, xx = np.indices((height, width), dtype=np.float32)
    x = xx / max(width - 1, 1) * 2.0 - 1.0
    y = yy / max(height - 1, 1) * 2.0 - 1.0
    sample = known_mask & ((xx.astype(np.int32) % 8) == 0) & ((yy.astype(np.int32) % 8) == 0)
    features = np.stack((np.ones_like(x), x, y, x * x, x * y, y * y), axis=2)
    design = features[sample]
    if design.shape[0] < 100:
        raise RuntimeError("spatial-color-transfer-insufficient-known-background")
    corrected = source[:, :, :3].astype(np.float32)
    reference_rgb = reference[:, :, :3].astype(np.float32)
    source_rgb = source[:, :, :3].astype(np.float32)
    for channel in range(3):
        delta = np.clip(reference_rgb[:, :, channel] - source_rgb[:, :, channel], -24.0, 24.0)
        coefficients, *_ = np.linalg.lstsq(design, delta[sample], rcond=None)
        correction = np.tensordot(features, coefficients, axes=([2], [0]))
        corrected[:, :, channel] += correction
    result = source.copy()
    result[:, :, :3] = np.rint(corrected).clip(0, 255).astype(np.uint8)
    return result


def nearest_known_color_transfer(reference: np.ndarray, source: np.ndarray, known_mask: np.ndarray) -> np.ndarray:
    unknown = ~known_mask
    _, nearest = ndimage.distance_transform_edt(unknown, return_indices=True)
    reference_rgb = reference[:, :, :3].astype(np.int16)
    source_rgb = source[:, :, :3].astype(np.int16)
    known_delta = np.clip(reference_rgb - source_rgb, -32, 32)
    correction = known_delta[nearest[0], nearest[1]]
    result = source.copy()
    result[:, :, :3] = np.clip(source_rgb + correction, 0, 255).astype(np.uint8)
    return result


def solve_exact_foreground(target_rgb: np.ndarray, background_rgb: np.ndarray, initial_alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    alpha = initial_alpha.astype(np.int16).copy()
    active = alpha > 0
    foreground = np.zeros_like(target_rgb, dtype=np.int16)
    unresolved = active.copy()
    target = target_rgb.astype(np.int32)
    background = background_rgb.astype(np.int32)
    for _ in range(255):
        if not np.any(unresolved):
            break
        a = alpha[unresolved].astype(np.int32)[:, None]
        numerator = 255 * target[unresolved] - (255 - a) * background[unresolved]
        candidate = np.rint(numerator / np.maximum(a, 1)).astype(np.int32)
        in_range = np.all((candidate >= 0) & (candidate <= 255), axis=1)
        composed = np.rint((candidate * a + background[unresolved] * (255 - a)) / 255.0).astype(np.int32)
        exact = in_range & np.all(composed == target[unresolved], axis=1)
        unresolved_indices = np.flatnonzero(unresolved)
        accepted_indices = unresolved_indices[exact]
        foreground.reshape(-1, 3)[accepted_indices] = candidate[exact]
        unresolved.reshape(-1)[accepted_indices] = False
        still = unresolved & (alpha < 255)
        alpha[still] += 1
        forced = unresolved & (alpha >= 255)
        foreground[forced] = target_rgb[forced]
        unresolved[forced] = False
    if np.any(unresolved):
        raise RuntimeError("soft-matte-exact-foreground-solve-failed")
    return foreground.clip(0, 255).astype(np.uint8), alpha.astype(np.uint8)


def compose(args) -> None:
    root = Path(__file__).resolve().parent.parent
    workspace, canary, item = load_authority(root, args.expected_workspace_sha256, args.shot)
    _, visible_truth, _, owner = actor_state(root, args.shot, item)
    prepare_root = Path(args.prepare).resolve()
    prepare_manifest = json.loads((prepare_root / "prepare.json").read_text())
    if prepare_manifest["sourceWorkspaceSha256"] != workspace["workspaceSha256"] or prepare_manifest["shotId"] != args.shot:
        raise RuntimeError("learned-clean-plate-prepare-authority-mismatch")
    probe = np.asarray(Image.open(prepare_root / "probe-mask.png").convert("L"), dtype=np.uint8)
    seed = np.asarray(Image.open(prepare_root / "seed-mask.png").convert("L"), dtype=np.uint8)
    if prepare_manifest.get("replaceSeedWithReferenceDifference"):
        owner = rebuilt_semantic_owner(args.shot, seed)
    if args.use_probe_as_seed:
        owner = propagate_owner(owner, probe)
        seed = probe.copy()
    learned_raw = read_rgba(Path(args.learned_output).resolve())
    if learned_raw.shape != visible_truth.shape:
        learned_raw = np.asarray(Image.fromarray(learned_raw, "RGBA").resize((visible_truth.shape[1], visible_truth.shape[0]), Image.Resampling.LANCZOS), dtype=np.uint8)
    if args.nearest_known_color_transfer:
        learned = nearest_known_color_transfer(visible_truth, learned_raw, probe == 0)
    elif args.spatial_color_transfer:
        learned = spatial_polynomial_color_transfer(visible_truth, learned_raw, probe == 0)
    else:
        learned = learned_raw
    truth_rgb = visible_truth[:, :, :3].astype(np.int16)
    learned_rgb = learned[:, :, :3].astype(np.int16)
    if args.soft_matte_radius > 0:
        outside = (seed == 0).astype(np.uint8)
        distance = cv2.distanceTransform(outside, cv2.DIST_L2, 5)
        matte = np.clip(1.0 - distance / float(args.soft_matte_radius), 0.0, 1.0)
        matte[seed > 0] = 1.0
        initial_alpha = np.ceil(matte * 255.0).astype(np.uint8)
        footprint = (initial_alpha > 0).astype(np.uint8) * 255
        owner = propagate_owner(owner, footprint)
        blended_rgb = np.rint(
            visible_truth[:, :, :3].astype(np.float32) * (1.0 - matte[:, :, None])
            + learned[:, :, :3].astype(np.float32) * matte[:, :, None]
        ).clip(0, 255).astype(np.uint8)
        foreground_rgb, solved_alpha = solve_exact_foreground(visible_truth[:, :, :3], blended_rgb, initial_alpha)
        clean_background = np.dstack((blended_rgb, np.full(seed.shape, 255, dtype=np.uint8)))
        layers = {"BACKGROUND": clean_background}
        for label, kind in enumerate(ACTOR_KINDS, start=1):
            actor = np.zeros_like(visible_truth)
            actor_selected = (owner == label) & (solved_alpha > 0)
            actor[actor_selected, :3] = foreground_rgb[actor_selected]
            actor[actor_selected, 3] = solved_alpha[actor_selected]
            layers[kind] = actor
    else:
        absolute = np.max(np.abs(truth_rgb - learned_rgb), axis=2)
        truth_luma = cv2.cvtColor(visible_truth[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.int16)
        learned_luma = cv2.cvtColor(learned[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.int16)
        dark_actor_shadow = learned_luma - truth_luma >= args.shadow_threshold
        residual = ((absolute >= args.residual_threshold) | dark_actor_shadow).astype(np.uint8) * 255
        footprint = connected_residual_footprint(seed, probe, residual)
        owner = propagate_owner(owner, footprint)
        clean_background = visible_truth.copy()
        selected = footprint > 0
        clean_background[selected, :3] = learned[selected, :3]
        clean_background[:, :, 3] = 255
        layers = {"BACKGROUND": clean_background}
        for label, kind in enumerate(ACTOR_KINDS, start=1):
            actor = np.zeros_like(visible_truth)
            actor_selected = owner == label
            actor[actor_selected, :3] = visible_truth[actor_selected, :3]
            actor[actor_selected, 3] = 255
            layers[kind] = actor

    recomposed = clean_background.copy()
    for kind in ACTOR_KINDS:
        recomposed = composite(recomposed, layers[kind])
    exact = np.all(recomposed[:, :, :3] == visible_truth[:, :, :3], axis=2)
    delta = np.abs(recomposed[:, :, :3].astype(np.int16) - visible_truth[:, :, :3].astype(np.int16))
    parity = {
        "exactPixelRatio": float(np.mean(exact)),
        "meanAbsoluteRgbDifference": float(np.mean(delta)),
        "maximumChannelDifference": int(np.max(delta)),
    }
    expected_parity = {"exactPixelRatio": 1.0, "meanAbsoluteRgbDifference": 0.0, "maximumChannelDifference": 0}
    if parity != expected_parity:
        raise RuntimeError(f"learned-clean-plate-exact-parity-failed:{args.shot}:{parity}")

    output = Path(args.output).resolve()
    layer_records = []
    for kind in KINDS:
        path = output / f"{kind.lower()}.png"
        layer_records.append({"kind": kind, "path": str(path), "sha256": write_rgba(path, layers[kind])})
    recomposed_path = output / "recomposed.png"
    recomposed_sha = write_rgba(recomposed_path, recomposed)
    learned_copy = output / "learned-full-probe.png"
    learned_sha = write_rgba(learned_copy, learned)
    footprint_path = output / "actor-footprint.png"
    footprint_sha = write_mask(footprint_path, footprint)
    envelope = cv2.dilate(footprint, np.ones((161, 161), np.uint8), iterations=1)
    metrics = residual_metrics(visible_truth, clean_background, footprint)
    motion_metrics = residual_metrics(visible_truth, clean_background, envelope)
    tiles = [
        (f"{args.shot} APPROVED VISIBLE TRUTH", visible_truth),
        ("LEARNED FULL PROBE", learned),
        ("MOTION-SAFE CLEAN BACKGROUND", clean_background),
        ("TYPOGRAPHY ORIGINAL PIXELS", preview_actor(layers["TYPOGRAPHY"])),
        ("ELEMENT / ILLUSTRATION ORIGINAL PIXELS", preview_actor(composite(checker(visible_truth.shape[1], visible_truth.shape[0]), layers["ELEMENT_KIT"]))),
        ("RECOMPOSED EXACT", recomposed),
    ]
    contact = contact_sheet(tiles, visible_truth.shape[1], visible_truth.shape[0])
    contact_path = output / "contact-sheet.png"
    contact_path.parent.mkdir(parents=True, exist_ok=True)
    contact.save(contact_path, format="PNG", compress_level=9)
    body = {
        "contract": "A1LearnedCleanPlateCanaryPreflight/v1",
        "mode": "COMPOSE",
        "status": "PENDING_MACHINE_AND_ACTUAL_PIXEL_REVIEW",
        "sourceWorkspaceSha256": workspace["workspaceSha256"],
        "sourceCanaryManifestSha256": canary["manifestSha256"],
        "shotId": args.shot,
        "primitive": prepare_manifest["primitive"],
        "residualThreshold": args.residual_threshold,
        "shadowThreshold": args.shadow_threshold,
        "spatialColorTransfer": args.spatial_color_transfer,
        "nearestKnownColorTransfer": args.nearest_known_color_transfer,
        "softMatteRadius": args.soft_matte_radius,
        "useProbeAsSeed": args.use_probe_as_seed,
        "seedPixelCount": int(np.count_nonzero(seed)),
        "actorFootprintPixelCount": int(np.count_nonzero(footprint)),
        "motionExposureEnvelopePixelCount": int(np.count_nonzero(envelope)),
        "layers": layer_records,
        "learnedFullProbe": {"path": str(learned_copy), "sha256": learned_sha},
        "actorFootprint": {"path": str(footprint_path), "sha256": footprint_sha},
        "recomposed": {"path": str(recomposed_path), "sha256": recomposed_sha, "parity": parity},
        "cleanPlateResidualMetrics": metrics,
        "motionExposureResidualMetrics": motion_metrics,
        "contactSheet": {"path": str(contact_path), "sha256": sha256(contact_path)},
        "automaticPassMappingForbidden": True,
        "productionStateWritten": False,
    }
    manifest_path = output / "preflight.json"
    manifest_path.write_text(json.dumps(body, ensure_ascii=False, indent=2))
    print(json.dumps(body, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="mode", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("expected_workspace_sha256")
    prepare_parser.add_argument("--shot", required=True)
    prepare_parser.add_argument("--primitive", required=True)
    prepare_parser.add_argument("--reference-clean-source")
    prepare_parser.add_argument("--augmentation-threshold", type=int, default=20)
    prepare_parser.add_argument("--augmentation-touch-radius", type=int, default=64)
    prepare_parser.add_argument("--replace-seed-with-reference-difference", action="store_true")
    prepare_parser.add_argument("--additional-seed-mask")
    prepare_parser.add_argument("--additional-seed-threshold", type=int, default=64)
    prepare_parser.add_argument("--probe-close-radius", type=int, default=3)
    prepare_parser.add_argument("--probe-dilate-radius", type=int, default=17)
    prepare_parser.add_argument("--output", required=True)
    prepare_parser.set_defaults(func=prepare)
    compose_parser = subparsers.add_parser("compose")
    compose_parser.add_argument("expected_workspace_sha256")
    compose_parser.add_argument("--shot", required=True)
    compose_parser.add_argument("--prepare", required=True)
    compose_parser.add_argument("--learned-output", required=True)
    compose_parser.add_argument("--residual-threshold", type=int, default=8)
    compose_parser.add_argument("--shadow-threshold", type=int, default=2)
    compose_parser.add_argument("--spatial-color-transfer", action="store_true")
    compose_parser.add_argument("--nearest-known-color-transfer", action="store_true")
    compose_parser.add_argument("--soft-matte-radius", type=int, default=0)
    compose_parser.add_argument("--use-probe-as-seed", action="store_true")
    compose_parser.add_argument("--output", required=True)
    compose_parser.set_defaults(func=compose)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
