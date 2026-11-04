#!/usr/bin/env python3
"""Build a fail-closed, review-only four-layer preflight for the remaining ten.

The approved Look Master is the visible-pixel truth.  ImageGen clean plates are
used only below removed actors; visible typography and pictorial actors retain
the approved master geometry and pixels.  This script never writes production
authority and never maps a technical parity result to visual PASS.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


SHOT_IDS = ("ED-07", "ED-09", "ED-10", "ED-12", "ED-13", "ED-16", "ED-17", "ED-19", "ED-33", "ED-34")
KINDS = ("BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION")
CLEAN_SOURCES = {
    "ED-07": "exec-fe0fd921-2735-49e2-8acf-3b0809ccc212.png",
    "ED-09": "exec-4072bf5a-d12e-40d3-876d-7eab5950bd89.png",
    "ED-10": "exec-57b52c89-007b-4f08-a61c-8e301d3c81cb.png",
    "ED-12": "exec-89980906-ec65-4dab-b98b-3b748b17205f.png",
    "ED-13": "exec-c1dbabf0-17f4-4079-8a6b-91193224638f.png",
    "ED-16": "exec-47a3d65b-7997-4cec-95c9-7c963f79cc95.png",
    "ED-17": "exec-c803b1eb-72b7-435a-bcd1-2a573da6ea93.png",
    "ED-19": "exec-18fb35fc-870e-4d06-82d9-20d3d4efa2a2.png",
    "ED-33": "exec-c5df62b4-9dd2-42af-ba34-90e84fbe1566.png",
    "ED-34": "exec-dd4a1c27-f53c-4077-9f2e-7c01b931c491.png",
}
BACKGROUND_EDIT_SOURCES = {
    "ED-07": "exec-a075cbfe-156b-4981-8898-4580ab14dce4.png",
    "ED-10": "exec-56f5856c-b0a7-4360-bf1f-96c56a0513fc.png",
    "ED-13": "exec-2194a189-31c4-4ce9-b6c7-b345640e114b.png",
    "ED-33": "exec-4fe925e7-d48e-4297-be7a-dd482150bd49.png",
    "ED-34": "exec-1c893cbd-9626-4d86-85df-ec38439faddf.png",
}
ACTOR_EDIT_SOURCES = {
    "ED-16": "exec-e88159c9-9ad3-4456-b8f7-65b6ce2ad4d8.png",
    "ED-17": "exec-b45cda32-7180-46d0-8057-b2ff68c36421.png",
}
ACTOR_MATTE_SOURCES = {
    "ED-16": "/private/tmp/a1-ed16-actor-biref-v1/ed16-actor-mask.png",
    "ED-17": "/private/tmp/a1-ed17-actor-biref-v1/ed17-actor-mask.png",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)


def write_rgba(path: Path, pixels: np.ndarray) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, "RGBA").save(path, format="PNG", compress_level=9)
    return {"path": str(path), "sha256": sha256(path)}


def write_mask(path: Path, mask: np.ndarray) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(mask.astype(np.uint8), "L").save(path, format="PNG", compress_level=9)
    return {"path": str(path), "sha256": sha256(path)}


def run_json(command: list[str]) -> dict:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def ocr_mask(ocr: dict, width: int, height: int, padding: int = 10) -> np.ndarray:
    mask = np.zeros((height, width), dtype=np.uint8)
    for segment in ocr.get("segmentDetails", []):
        box = segment["boundingBox"]
        x0 = max(0, round(box["x"] * width) - padding)
        x1 = min(width, round((box["x"] + box["width"]) * width) + padding)
        # Vision OCR uses bottom-left normalized coordinates.
        y0 = max(0, round((1.0 - box["y"] - box["height"]) * height) - padding)
        y1 = min(height, round((1.0 - box["y"]) * height) + padding)
        mask[y0:y1, x0:x1] = 255
    return mask


def roi_mask(shape: tuple[int, int], boxes: list[tuple[float, float, float, float]]) -> np.ndarray:
    height, width = shape
    mask = np.zeros(shape, dtype=np.uint8)
    for x0, y0, x1, y1 in boxes:
        mask[round(y0 * height):round(y1 * height), round(x0 * width):round(x1 * width)] = 255
    return mask


def keep_seed_connected(candidate: np.ndarray, seed: np.ndarray, min_area: int = 3) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats((candidate > 0).astype(np.uint8), 8)
    touch = cv2.dilate((seed > 0).astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1) > 0
    keep = np.zeros(candidate.shape, dtype=bool)
    for label in range(1, count):
        component = labels == label
        if stats[label, cv2.CC_STAT_AREA] >= min_area and np.any(component & touch):
            keep |= component
    return keep.astype(np.uint8) * 255


def smooth_background_transfer(master: np.ndarray, clean: np.ndarray, excluded: np.ndarray) -> np.ndarray:
    known = excluded == 0
    delta = master[:, :, :3].astype(np.int16) - clean[:, :, :3].astype(np.int16)
    local_magnitude = np.max(np.abs(delta), axis=2)
    known &= local_magnitude < 42
    if np.count_nonzero(known) < 1000:
        raise RuntimeError("remaining-ten-insufficient-known-background")
    height, width = known.shape
    yy, xx = np.indices((height, width), dtype=np.float32)
    x = xx / max(width - 1, 1) * 2.0 - 1.0
    y = yy / max(height - 1, 1) * 2.0 - 1.0
    features = np.stack((np.ones_like(x), x, y, x * x, x * y, y * y), axis=2)
    sample = known & ((xx.astype(np.int32) % 8) == 0) & ((yy.astype(np.int32) % 8) == 0)
    design = features[sample]
    correction = np.zeros((height, width, 3), dtype=np.float32)
    for channel in range(3):
        values = np.clip(delta[:, :, channel], -24, 24).astype(np.float32)
        coefficients, *_ = np.linalg.lstsq(design, values[sample], rcond=None)
        correction[:, :, channel] = np.tensordot(features, coefficients, axes=([2], [0]))
    result = clean.copy()
    result[:, :, :3] = np.rint(np.clip(clean[:, :, :3].astype(np.float32) + correction, 0, 255)).astype(np.uint8)
    result[:, :, 3] = 255
    return result


def minimum_exact_alpha(target: np.ndarray, background: np.ndarray, active: np.ndarray) -> np.ndarray:
    t = target[:, :, :3].astype(np.float32)
    b = background[:, :, :3].astype(np.float32)
    required = np.zeros(active.shape, dtype=np.float32)
    for channel in range(3):
        up = t[:, :, channel] > b[:, :, channel]
        down = t[:, :, channel] < b[:, :, channel]
        channel_required = np.zeros(active.shape, dtype=np.float32)
        channel_required[up] = (t[:, :, channel][up] - b[:, :, channel][up]) / np.maximum(255.0 - b[:, :, channel][up], 1.0)
        channel_required[down] = (b[:, :, channel][down] - t[:, :, channel][down]) / np.maximum(b[:, :, channel][down], 1.0)
        required = np.maximum(required, channel_required)
    alpha = np.ceil(required * 255.0).clip(1, 255).astype(np.uint8)
    alpha[~active] = 0
    return alpha


def solve_exact_foreground(target: np.ndarray, background: np.ndarray, initial_alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    alpha = initial_alpha.astype(np.int16).copy()
    active = alpha > 0
    foreground = np.zeros(target[:, :, :3].shape, dtype=np.int16)
    unresolved = active.copy()
    t = target[:, :, :3].astype(np.int32)
    b = background[:, :, :3].astype(np.int32)
    for _ in range(255):
        if not np.any(unresolved):
            break
        a = alpha[unresolved].astype(np.int32)[:, None]
        candidate = np.rint((255 * t[unresolved] - (255 - a) * b[unresolved]) / np.maximum(a, 1)).astype(np.int32)
        valid = np.all((candidate >= 0) & (candidate <= 255), axis=1)
        composed = np.rint((candidate * a + b[unresolved] * (255 - a)) / 255.0).astype(np.int32)
        exact = valid & np.all(composed == t[unresolved], axis=1)
        indices = np.flatnonzero(unresolved)
        accepted = indices[exact]
        foreground.reshape(-1, 3)[accepted] = candidate[exact]
        unresolved.reshape(-1)[accepted] = False
        alpha[unresolved & (alpha < 255)] += 1
        forced = unresolved & (alpha >= 255)
        foreground[forced] = t[forced]
        unresolved[forced] = False
    if np.any(unresolved):
        raise RuntimeError("remaining-ten-exact-foreground-solve-failed")
    return foreground.clip(0, 255).astype(np.uint8), alpha.astype(np.uint8)


def composite(base: np.ndarray, overlay: np.ndarray) -> np.ndarray:
    alpha = overlay[:, :, 3:4].astype(np.float32) / 255.0
    out = base.astype(np.float32)
    out[:, :, :3] = overlay[:, :, :3] * alpha + out[:, :, :3] * (1.0 - alpha)
    out[:, :, 3] = 255
    return np.rint(out).clip(0, 255).astype(np.uint8)


def actor_config(shot_id: str) -> dict:
    return {
        "ED-07": {"actor": [(0.01, .17, 1, .82)], "illustration": [(.57, .13, 1, .84)]},
        "ED-09": {"actor": [(.05, .18, .88, .82)], "illustration": []},
        "ED-10": {"actor": [(.12, .20, .88, .78)], "illustration": []},
        "ED-12": {"actor": [(.06, .13, .83, .85)], "illustration": []},
        "ED-13": {"actor": [(0, .02, 1, .98)], "illustration": [(.30, .18, .72, 1)]},
        "ED-16": {"actor": [(0, .05, 1, 1)], "illustration": [(0, 0, 1, .70)]},
        "ED-17": {"actor": [(0, .10, 1, .90)], "illustration": [(0, .08, 1, .92)]},
        "ED-19": {"actor": [(0, .18, 1, .82)], "illustration": [(.91, .34, 1, .70)]},
        "ED-33": {"actor": [(0, .29, 1, .96)], "illustration": [(.54, .38, 1, 1)]},
        "ED-34": {"actor": [(.04, .17, 1, .84)], "illustration": [(.61, .20, 1, .83)]},
    }[shot_id]


def presenter_component(mask: np.ndarray) -> np.ndarray:
    binary = mask >= 112
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(binary.astype(np.uint8), 8)
    keep = np.zeros(mask.shape, dtype=bool)
    height, width = mask.shape
    for label in range(1, count):
        cx, cy = centroids[label]
        area = stats[label, cv2.CC_STAT_AREA]
        if area > 5000 and (.22 * width < cx < .72 * width) and (.20 * height < cy < .92 * height):
            keep |= labels == label
    yy, xx = np.indices(mask.shape)
    identity_geometry = (
        ((xx > .34 * width) & (xx < .70 * width) & (yy > .15 * height))
        | ((xx < .56 * width) & (yy > .48 * height) & (yy < .88 * height))
    )
    keep &= identity_geometry
    keep = cv2.morphologyEx(keep.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    result = np.zeros(mask.shape, dtype=np.uint8)
    result[keep] = mask[keep]
    return result


def semantic_masks(shot_id: str, master: np.ndarray, adjusted: np.ndarray, text_region: np.ndarray, biref: np.ndarray | None) -> dict:
    config = actor_config(shot_id)
    actor_region = roi_mask(text_region.shape, config["actor"])
    illustration_region = roi_mask(text_region.shape, config["illustration"])
    diff = np.max(np.abs(master[:, :, :3].astype(np.int16) - adjusted[:, :, :3].astype(np.int16)), axis=2)
    rgb = master[:, :, :3].astype(np.int16)
    luma = cv2.cvtColor(master[:, :, :3], cv2.COLOR_RGB2GRAY)
    blue = (rgb[:, :, 2] - rgb[:, :, 0] > 22) | (rgb[:, :, 2] - rgb[:, :, 1] > 16)
    if shot_id == "ED-16":
        salient = (luma > 76) | blue
        text_core = (text_region > 0) & ((luma > 145) | blue)
    elif shot_id == "ED-10":
        salient = (luma < 205) | blue
        text_core = (text_region > 0) & blue
    else:
        salient = (luma < 205) | blue
        text_core = (text_region > 0) & ((luma < 195) | blue)

    # OCR rectangles constrain typography; connectivity keeps antialiased edges
    # while excluding unrelated paper texture inside each bounding rectangle.
    text_neighborhood = cv2.dilate(text_core.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1) > 0
    text_candidate = (text_region > 0) & text_neighborhood & ((diff >= 2) | salient)
    typography = keep_seed_connected(text_candidate.astype(np.uint8) * 255, text_core.astype(np.uint8) * 255, 2) > 0
    if shot_id == "ED-16":
        bottom = roi_mask(text_region.shape, [(0, .62, 1, 1)]) > 0
        bottom_core = bottom & (luma > 50) & (diff >= 8)
        bottom_candidate = bottom & (diff >= 4)
        typography |= keep_seed_connected(bottom_candidate.astype(np.uint8) * 255, bottom_core.astype(np.uint8) * 255, 4) > 0

    graphic_candidate = (actor_region > 0) & (diff >= 5)
    graphic_seed = (actor_region > 0) & (diff >= 24) & salient
    graphics = keep_seed_connected(graphic_candidate.astype(np.uint8) * 255, graphic_seed.astype(np.uint8) * 255, 4) > 0

    # Protect actor silhouettes whose pale interior is connected to a salient
    # outline (paper scrolls, fabric folds and source-like physical props).
    graphics = cv2.morphologyEx(graphics.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    # Any actor correction inside a verified OCR box belongs to typography,
    # including antialiasing and texture displaced by the glyph silhouette.
    typography_neighborhood = cv2.dilate(typography.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1) > 0
    typography |= graphics & typography_neighborhood
    illustration = graphics & (illustration_region > 0)
    if biref is not None:
        presenter = presenter_component(biref) > 0
        graphics |= presenter
        # ED-13 is the only presenter shot in this wave.  Pictograms and UI
        # evidence remain ELEMENT_KIT even when spatially near the person.
        illustration = presenter
    # Copy has first ownership priority.  Spatial illustration ROIs may cross
    # a headline but must never steal its glyph pixels.
    illustration &= ~typography
    element = graphics & ~typography & ~illustration
    if shot_id == "ED-09":
        # The lower pixel field is one decorative actor family.  Removing only
        # the strongest crosses lets Vision successively reinterpret the next
        # cross as a Chinese glyph, so absorb the complete blue/dark family.
        decor_region = roi_mask(text_region.shape, [(.03, .43, .88, .91)]) > 0
        decor_core = decor_region & (blue | (luma < 205))
        element |= cv2.dilate(decor_core.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1) > 0
        element &= ~typography

    if shot_id == "ED-07":
        # The terminal is the only independent pictorial actor.  Tiny paper
        # transfer differences must remain BACKGROUND, not become a fake kit.
        element[:] = False
    elif shot_id == "ED-33":
        strap_region = roi_mask(text_region.shape, [(.50, .30, .88, .72)]) > 0
        object_region = roi_mask(text_region.shape, [(.81, .38, .99, .91)]) > 0
        strap_seed = strap_region & blue & (diff >= 5)
        strap = strap_region & (cv2.dilate(strap_seed.astype(np.uint8), np.ones((7, 7), np.uint8), iterations=1) > 0)
        object_seed = object_region & (diff >= 22) & salient
        object_candidate = object_region & (diff >= 5)
        right_object = keep_seed_connected(object_candidate.astype(np.uint8) * 255, object_seed.astype(np.uint8) * 255, 8) > 0
        illustration = (strap | right_object) & ~typography
        element[:] = False
    elif shot_id == "ED-34":
        arrow_region = roi_mask(text_region.shape, [(.65, .20, .99, .78)]) > 0
        saturated_blue = arrow_region & (rgb[:, :, 2] - rgb[:, :, 0] > 42) & (rgb[:, :, 2] - rgb[:, :, 1] > 28) & (diff >= 5)
        arrow_seed_region = roi_mask(text_region.shape, [(.69, .30, .94, .67)]) > 0
        arrow = keep_seed_connected(saturated_blue.astype(np.uint8) * 255, (saturated_blue & arrow_seed_region).astype(np.uint8) * 255, 32) > 0
        illustration = (cv2.dilate(arrow.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1) > 0) & arrow_region & ~typography
        element[:] = False

    # Ensure every visible actor pixel belongs to exactly one owner.  Small
    # unowned islands default to ELEMENT_KIT, never BACKGROUND.
    union = typography | element | illustration
    if shot_id in {"ED-09", "ED-12", "ED-19", "ED-34"}:
        extra = (actor_region > 0) & (diff >= 9) & salient & ~union
        element |= keep_seed_connected(extra.astype(np.uint8) * 255, extra.astype(np.uint8) * 255, 6) > 0
    if shot_id in {"ED-10", "ED-33", "ED-34"}:
        # Fabric/paper/ground geometry is the clean plate, not an independently
        # animated semantic actor.  Only the explicit prop/arrow ROI moves.
        element[:] = False
    return {
        "TYPOGRAPHY": typography,
        "ELEMENT_KIT": element,
        "ILLUSTRATION": illustration,
    }


def checker(width: int, height: int, block: int = 18) -> np.ndarray:
    yy, xx = np.indices((height, width))
    tone = np.where(((xx // block) + (yy // block)) % 2 == 0, 232, 205).astype(np.uint8)
    return np.dstack((tone, tone, tone, np.full_like(tone, 255)))


def preview(layer: np.ndarray) -> np.ndarray:
    return composite(checker(layer.shape[1], layer.shape[0]), layer)


def clean_plate_background(master: np.ndarray, adjusted: np.ndarray, owner_union: np.ndarray, use_motion_envelope: bool) -> tuple[np.ndarray, np.ndarray]:
    """Replace the whole planned exposure region, not only glyph silhouettes.

    A flattened master has no information below actors.  For the five
    master-bound ImageGen restorations we therefore use the verified clean
    source throughout the 80 px motion envelope and feather only the outer
    transition.  The approved actor pixels are solved back exactly later.
    """
    if not use_motion_envelope:
        background = master.copy()
        background[owner_union, :3] = adjusted[owner_union, :3]
        background[:, :, 3] = 255
        return background, owner_union.copy()
    core = cv2.dilate(owner_union.astype(np.uint8), np.ones((81, 81), np.uint8), iterations=1) > 0
    feather = cv2.dilate(core.astype(np.uint8), np.ones((31, 31), np.uint8), iterations=1).astype(np.float32)
    feather = cv2.GaussianBlur(feather, (0, 0), 7.0)
    feather = np.clip(feather, 0.0, 1.0)
    feather[core] = 1.0
    weight = feather[:, :, None]
    background = master.copy()
    background[:, :, :3] = np.rint(
        master[:, :, :3].astype(np.float32) * (1.0 - weight)
        + adjusted[:, :, :3].astype(np.float32) * weight
    ).clip(0, 255).astype(np.uint8)
    background[:, :, 3] = 255
    return background, feather > 0.0001


def shifted(layer: np.ndarray, dx: int, dy: int) -> np.ndarray:
    matrix = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(layer, matrix, (layer.shape[1], layer.shape[0]), flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def make_motion_exposure_contact(path: Path, shot_id: str, layers: dict) -> dict:
    width, height = layers["BACKGROUND"].shape[1], layers["BACKGROUND"].shape[0]
    label_height = 48
    offsets = ((0, 0, "BACKGROUND ONLY"), (-80, 0, "ACTORS -80 X"), (80, 0, "ACTORS +80 X"), (0, -80, "ACTORS -80 Y"), (0, 80, "ACTORS +80 Y"))
    canvas = Image.new("RGB", (width * len(offsets), height + label_height), (17, 20, 25))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.load_default(size=24)
    except TypeError:
        font = ImageFont.load_default()
    for index, (dx, dy, label) in enumerate(offsets):
        frame = layers["BACKGROUND"].copy()
        if dx or dy:
            for kind in ("ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"):
                frame = composite(frame, shifted(layers[kind], dx, dy))
        x = index * width
        draw.text((x + 14, 12), f"{shot_id} {label}", fill=(245, 247, 250), font=font)
        canvas.paste(Image.fromarray(frame[:, :, :3], "RGB"), (x, label_height))
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, format="PNG", compress_level=9)
    return {"path": str(path), "sha256": sha256(path), "maximumDisplacementPx": 80}


def make_contact(path: Path, shot_id: str, master: np.ndarray, clean_raw: np.ndarray, layers: dict, recomposed: np.ndarray) -> dict:
    width, height = master.shape[1], master.shape[0]
    label_height = 48
    canvas = Image.new("RGB", (width * 3, (height + label_height) * 3), (17, 20, 25))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.load_default(size=24)
    except TypeError:
        font = ImageFont.load_default()
    tiles = [
        (f"{shot_id} APPROVED MASTER", master), ("IMAGEGEN CLEAN SOURCE", clean_raw), ("MOTION-SAFE BACKGROUND", layers["BACKGROUND"]),
        ("TYPOGRAPHY OWNER", preview(layers["TYPOGRAPHY"])), ("ELEMENT_KIT OWNER", preview(layers["ELEMENT_KIT"])), ("ILLUSTRATION OWNER", preview(layers["ILLUSTRATION"])),
        ("RECOMPOSED TECHNICAL PARITY", recomposed), ("BACKGROUND AGAIN", layers["BACKGROUND"]), ("VISIBLE TRUTH AGAIN", master),
    ]
    for index, (label, pixels) in enumerate(tiles):
        col, row = index % 3, index // 3
        x, y = col * width, row * (height + label_height)
        draw.text((x + 14, y + 12), label, fill=(245, 247, 250), font=font)
        canvas.paste(Image.fromarray(pixels[:, :, :3], "RGB"), (x, y + label_height))
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, format="PNG", compress_level=9)
    return {"path": str(path), "sha256": sha256(path)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("expected_workspace_sha256")
    parser.add_argument("--output", required=True)
    parser.add_argument("--clean-source-root", default="/Users/a1/.codex/generated_images/019fea90-8a8a-73d0-8b3a-9ea3eb25e4b9")
    parser.add_argument("--ed13-biref-mask", default="/private/tmp/a1-ed13-current-birefnet-v1/ed-13-current-master-mask.png")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    public = root / "apps/studio-next/public"
    workspace_path = public / "generated/system-line/editorial-asset-workbench-v1/workspace.json"
    workspace = json.loads(workspace_path.read_text())
    if workspace.get("workspaceSha256") != args.expected_workspace_sha256:
        raise RuntimeError(f"remaining-ten-cas-failed:{workspace.get('workspaceSha256')}")
    authority = workspace["production"]["authority"]["nextAction"]
    gates = workspace["gates"]["packagingDeliveryGates"]
    if authority.get("id") != "EXPAND_REMAINING_TEN_PACKAGE_LAYERS" or authority.get("requiresUser") is not False:
        raise RuntimeError("remaining-ten-authority-not-open")
    if gates.get("layerReconstructionAllowed") is not True or gates.get("assemblyCreationAllowed") is not False or gates.get("motionAllowed") is not False:
        raise RuntimeError("remaining-ten-gate-mismatch")
    selected = {item["shotId"]: item for item in workspace["production"]["objectiveVisualGate"]["selectedMasters"]}
    if tuple(shot_id for shot_id in SHOT_IDS if shot_id not in selected):
        raise RuntimeError("remaining-ten-selected-master-missing")

    ocr_binary = root / ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1"
    human_binary = root / ".codex-artifacts/system-progress-system-line/a1-vision-human-presence-v1"
    output = Path(args.output).resolve()
    clean_root = Path(args.clean_source_root).resolve()
    biref_path = Path(args.ed13_biref_mask).resolve()
    items = []
    for shot_id in SHOT_IDS:
        master_record = selected[shot_id]
        master_path = public / master_record["artifactPublicUrl"].lstrip("/")
        if sha256(master_path) != master_record["artifactSha256"]:
            raise RuntimeError(f"remaining-ten-master-sha-mismatch:{shot_id}")
        clean_path = clean_root / BACKGROUND_EDIT_SOURCES.get(shot_id, CLEAN_SOURCES[shot_id])
        master = read_rgba(master_path)
        clean_raw = read_rgba(clean_path)
        if clean_raw.shape != master.shape:
            clean_raw = np.asarray(Image.fromarray(clean_raw, "RGBA").resize((master.shape[1], master.shape[0]), Image.Resampling.LANCZOS), dtype=np.uint8)
        ocr = run_json([str(ocr_binary), str(master_path)])
        text_region = ocr_mask(ocr, master.shape[1], master.shape[0])
        # OCR is the only hard exclusion needed here.  The transfer function
        # independently rejects high master/clean deltas, so large actor ROIs
        # never starve it of known background samples.
        preliminary = text_region
        excluded = cv2.dilate(preliminary, np.ones((61, 61), np.uint8), iterations=1)
        adjusted = smooth_background_transfer(master, clean_raw, excluded)
        biref = np.asarray(Image.open(biref_path).convert("L"), dtype=np.uint8) if shot_id == "ED-13" else None
        if biref is not None and biref.shape != text_region.shape:
            biref = np.asarray(Image.fromarray(biref).resize((master.shape[1], master.shape[0]), Image.Resampling.LANCZOS), dtype=np.uint8)
        masks = semantic_masks(shot_id, master, adjusted, text_region, biref)
        owner_union = masks["TYPOGRAPHY"] | masks["ELEMENT_KIT"] | masks["ILLUSTRATION"]
        if np.count_nonzero(owner_union) < 500:
            raise RuntimeError(f"remaining-ten-actor-mask-too-small:{shot_id}")

        # One fail-closed residual-text absorption pass.  A Vision-detected
        # ghost is added to the typography matte; it can never be waived by
        # exact recomposition metrics.
        background_ocr = None
        for residual_pass in range(2):
            owner_union = masks["TYPOGRAPHY"] | masks["ELEMENT_KIT"] | masks["ILLUSTRATION"]
            background, clean_plate_core = clean_plate_background(master, adjusted, owner_union, shot_id in BACKGROUND_EDIT_SOURCES)
            probe_path = output / shot_id / f"background-ocr-probe-{residual_pass}.png"
            write_rgba(probe_path, background)
            background_ocr = run_json([str(ocr_binary), str(probe_path)])
            if background_ocr.get("observationCount", 0) == 0 or residual_pass == 1:
                break
            residual_text = ocr_mask(background_ocr, master.shape[1], master.shape[0], padding=32) > 0
            adjusted[residual_text, :3] = clean_raw[residual_text, :3]
            if np.any(residual_text & (text_region > 0)):
                masks["TYPOGRAPHY"] |= residual_text
                masks["ELEMENT_KIT"] &= ~residual_text
                masks["ILLUSTRATION"] &= ~residual_text
            else:
                masks["ELEMENT_KIT"] |= residual_text
                masks["TYPOGRAPHY"] &= ~residual_text
                masks["ILLUSTRATION"] &= ~residual_text
        owner_union = masks["TYPOGRAPHY"] | masks["ELEMENT_KIT"] | masks["ILLUSTRATION"]
        actor_edit_record = None
        if shot_id in ACTOR_EDIT_SOURCES:
            actor_edit_path = clean_root / ACTOR_EDIT_SOURCES[shot_id]
            actor_edit = read_rgba(actor_edit_path)
            if actor_edit.shape != master.shape:
                actor_edit = np.asarray(Image.fromarray(actor_edit, "RGBA").resize((master.shape[1], master.shape[0]), Image.Resampling.LANCZOS), dtype=np.uint8)
            illustration_region = roi_mask(text_region.shape, actor_config(shot_id)["illustration"]) > 0
            actor_matte = np.asarray(Image.open(ACTOR_MATTE_SOURCES[shot_id]).convert("L"), dtype=np.uint8)
            if actor_matte.shape != text_region.shape:
                actor_matte = np.asarray(Image.fromarray(actor_matte).resize((master.shape[1], master.shape[0]), Image.Resampling.LANCZOS), dtype=np.uint8)
            restored_actor = (actor_matte >= 16) & illustration_region
            illustration_full = restored_actor | (masks["TYPOGRAPHY"] & illustration_region)
            masks["ILLUSTRATION"] = illustration_full
            masks["ELEMENT_KIT"][:] = False
            owner_union = masks["TYPOGRAPHY"] | illustration_full
            background, clean_plate_core = clean_plate_background(master, adjusted, owner_union, False)

            illustration_target = master.copy()
            overlap = illustration_full & masks["TYPOGRAPHY"]
            illustration_target[overlap, :3] = actor_edit[overlap, :3]
            illustration_layer = np.zeros_like(master)
            illustration_layer[illustration_full, :3] = illustration_target[illustration_full, :3]
            illustration_layer[illustration_full, 3] = 255
            base_with_illustration = composite(background, illustration_layer)
            typography_alpha = minimum_exact_alpha(master, base_with_illustration, masks["TYPOGRAPHY"])
            typography_rgb, typography_alpha = solve_exact_foreground(master, base_with_illustration, typography_alpha)
            typography_layer = np.zeros_like(master)
            typography_layer[masks["TYPOGRAPHY"], :3] = typography_rgb[masks["TYPOGRAPHY"]]
            typography_layer[masks["TYPOGRAPHY"], 3] = typography_alpha[masks["TYPOGRAPHY"]]
            layers = {
                "BACKGROUND": background,
                "TYPOGRAPHY": typography_layer,
                "ELEMENT_KIT": np.zeros_like(master),
                "ILLUSTRATION": illustration_layer,
            }
            actor_edit_record = {"path": str(actor_edit_path), "sha256": sha256(actor_edit_path), "role": "NO_TYPOGRAPHY_ACTOR_PLATE", "imagegenMaskedEditAttemptCount": 1}
        else:
            initial_alpha = minimum_exact_alpha(master, background, owner_union)
            if shot_id == "ED-13" and biref is not None:
                presenter_alpha = presenter_component(biref)
                presenter_pixels = masks["ILLUSTRATION"]
                initial_alpha[presenter_pixels] = np.maximum(initial_alpha[presenter_pixels], presenter_alpha[presenter_pixels])
                initial_alpha[presenter_pixels & (presenter_alpha >= 238)] = 255
            foreground, solved_alpha = solve_exact_foreground(master, background, initial_alpha)
            layers = {"BACKGROUND": background}
            for kind in KINDS[1:]:
                layer = np.zeros_like(master)
                active = masks[kind]
                layer[active, :3] = foreground[active]
                layer[active, 3] = solved_alpha[active]
                layers[kind] = layer

        recomposed = background.copy()
        for kind in ("ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"):
            recomposed = composite(recomposed, layers[kind])
        delta = np.abs(recomposed[:, :, :3].astype(np.int16) - master[:, :, :3].astype(np.int16))
        outside_clean_plate = ~clean_plate_core
        outside_delta = delta[outside_clean_plate]
        parity = {
            "exactPixelRatio": float(np.mean(np.all(delta == 0, axis=2))),
            "meanAbsoluteRgbDifference": float(np.mean(delta)),
            "maximumChannelDifference": int(np.max(delta)),
            "outsideCleanPlateExactPixelRatio": float(np.mean(np.all(outside_delta == 0, axis=1))) if outside_delta.size else 1.0,
            "outsideCleanPlateMaximumChannelDifference": int(np.max(outside_delta)) if outside_delta.size else 0,
        }
        if shot_id not in BACKGROUND_EDIT_SOURCES and (parity["exactPixelRatio"] != 1.0 or parity["maximumChannelDifference"] != 0):
            raise RuntimeError(f"remaining-ten-python-parity-failed:{shot_id}:{parity}")
        if shot_id in BACKGROUND_EDIT_SOURCES and parity["outsideCleanPlateExactPixelRatio"] < .999999:
            raise RuntimeError(f"remaining-ten-outside-clean-plate-parity-failed:{shot_id}:{parity}")

        shot_output = output / shot_id
        layer_records = {kind: {**write_rgba(shot_output / f"{kind.lower()}.png", layer), "semanticOwner": kind} for kind, layer in layers.items()}
        recomposed_record = write_rgba(shot_output / "recomposed.png", recomposed)
        actor_mask_record = write_mask(shot_output / "actor-union.png", owner_union.astype(np.uint8) * 255)
        envelope = cv2.dilate(owner_union.astype(np.uint8), np.ones((161, 161), np.uint8), iterations=1) > 0
        envelope_record = write_mask(shot_output / "motion-exposure-envelope.png", envelope.astype(np.uint8) * 255)
        contact_record = make_contact(shot_output / "contact-sheet.png", shot_id, master, clean_raw, layers, recomposed)
        exposure_contact_record = make_motion_exposure_contact(shot_output / "motion-exposure-contact-sheet.png", shot_id, layers)
        background_human = run_json([str(human_binary), layer_records["BACKGROUND"]["path"]])
        items.append({
            "shotId": shot_id,
            "status": "PENDING_ACTUAL_PIXEL_VISUAL_REVIEW",
            "sourceSelectedMaster": {"path": str(master_path), "sha256": master_record["artifactSha256"], "publicUrl": master_record["artifactPublicUrl"]},
            "cleanSource": {"path": str(clean_path), "sha256": sha256(clean_path), "generationAttemptCount": 1, "actualReferenceAttachmentUsed": True},
            "actorEditSource": actor_edit_record,
            "primitive": "IMAGEGEN_CLEAN_PLATE_PLUS_SEMANTIC_ACTOR_MATTE_AND_80PX_MOTION_ENVELOPE_V1",
            "layers": layer_records,
            "recomposed": {**recomposed_record, "parity": parity},
            "actorUnion": {**actor_mask_record, "pixelCount": int(np.count_nonzero(owner_union))},
            "motionExposureEnvelope": {**envelope_record, "pixelCount": int(np.count_nonzero(envelope))},
            "motionExposureContactSheet": exposure_contact_record,
            "backgroundAudit": {"ocrObservationCount": background_ocr.get("observationCount"), "ocrText": background_ocr.get("text", ""), "faceCount": background_human.get("faceCount"), "humanRectCount": background_human.get("humanRectCount")},
            "ownerPixelCounts": {kind: int(np.count_nonzero(layers[kind][:, :, 3])) for kind in KINDS[1:]},
            "presenterIdentity": {"status": "PENDING_ACTUAL_PIXEL_REVIEW" if shot_id == "ED-13" else "NOT_APPLICABLE", "sourceMatteSha256": sha256(biref_path) if shot_id == "ED-13" else None},
            "contactSheet": contact_record,
            "automaticVisualPassMappingForbidden": True,
            "productionStateWritten": False,
        })

    body = {
        "contract": "A1RemainingTenMotionSafePreflight/v3",
        "status": "PENDING_ACTUAL_PIXEL_VISUAL_REVIEW",
        "sourceWorkspaceSha256": workspace["workspaceSha256"],
        "sourceSelectedMasterSetSha256": workspace["production"]["objectiveVisualGate"]["selectedMasterSetSha256"],
        "targetShotIds": list(SHOT_IDS),
        "itemCount": len(items),
        "layerCount": len(items) * 4,
        "items": items,
        "automaticPassMappingForbidden": True,
        "visualReviewManifestRequiredForCommit": True,
        "assemblyCreationAllowed": False,
        "motionAllowed": False,
        "productionStateWritten": False,
    }
    manifest_path = output / "preflight.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": body["status"], "manifest": str(manifest_path), "itemCount": len(items), "layerCount": len(items) * 4, "items": [{"shotId": item["shotId"], "ownerPixelCounts": item["ownerPixelCounts"], "backgroundAudit": item["backgroundAudit"], "parity": item["recomposed"]["parity"], "contactSheet": item["contactSheet"]} for item in items]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
