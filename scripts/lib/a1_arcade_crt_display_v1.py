#!/usr/bin/env python3
"""Deterministic A1 arcade CRT display renderer.

Input is a flat 1600x900 RGB/RGBA raster. The renderer never edits the source
file and refuses double processing. LOCAL_CRT preserves a supplied alpha plane.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

DEFAULT_CONFIG = Path(__file__).resolve().parents[2] / "configs/system-line-display/a1-arcade-crt-display-v1.json"


def _maps(width: int, height: int, preset: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    y, x = np.mgrid[:height, :width].astype(np.float32)
    nx = (x - width / 2) / (width * preset["frameScale"])
    ny = (y - height / 2) / (height * preset["frameScaleY"])
    sx = nx * (1 + preset["curvatureX"] * ny**2)
    sy = ny * (1 + preset["curvatureY"] * nx**2)
    mx = ((sx + 1) * 0.5 * (width - 1)).astype(np.float32)
    my = ((sy + 1) * 0.5 * (height - 1)).astype(np.float32)
    return mx, my, nx, ny


def _warp_clean(rgb: np.ndarray, preset: dict) -> np.ndarray:
    height, width = rgb.shape[:2]
    mx, my, _, _ = _maps(width, height, preset)
    return cv2.remap(rgb, mx, my, cv2.INTER_NEAREST)


def _full_crt(rgb: np.ndarray, preset: dict) -> np.ndarray:
    height, width = rgb.shape[:2]
    mx, my, nx, ny = _maps(width, height, preset)
    signal = cv2.remap(rgb.astype(np.float32) / 255.0, mx, my, cv2.INTER_NEAREST)
    linear = np.where(signal <= 0.04045, signal / 12.92, ((signal + 0.055) / 1.055) ** 2.4)
    level = linear.max(axis=2)
    phase = np.mod(my / preset["beamPeriod"], 1.0) - 0.5
    beam = np.exp(-0.5 * (phase / (preset["beamBaseWidth"] + preset["beamBrightWidth"] * np.sqrt(level))) ** 2)
    y, x = np.mgrid[:height, :width]
    mask = np.stack([np.where((x % 3) == channel, preset["maskBright"], preset["maskDark"]) for channel in range(3)], axis=2)
    slots = np.where(((y // 2 + x // 3) % 3) == 0, preset["slotDark"], 1.0)
    emission = linear * beam[:, :, None] * mask * slots[:, :, None]
    bright = np.maximum(emission - preset["bloomThreshold"], 0)
    light = emission * preset["coreGain"]
    light += cv2.GaussianBlur(emission, (0, 0), preset["coreSpreadSigma"]) * preset["coreSpreadGain"]
    light += cv2.GaussianBlur(bright, (0, 0), preset["nearSigma"]) * preset["nearGain"]
    light += cv2.GaussianBlur(bright, (0, 0), preset["farSigma"]) * preset["farGain"]
    light *= (1 - preset["vignette"] * np.clip(nx * nx + ny * ny, 0, 1))[:, :, None]
    radius = (np.abs(nx) ** 8 + np.abs(ny) ** 8) ** (1 / 8)
    light *= np.clip((1 - radius) * 160, 0, 1)[:, :, None]
    srgb = np.where(light <= 0.0031308, light * 12.92, 1.055 * np.maximum(light, 0) ** (1 / 2.4) - 0.055)
    return (np.clip(srgb, 0, 1) * 255).astype(np.uint8)


def render(rgb: np.ndarray, config: dict, profile_id: str, *, input_has_crt: bool) -> np.ndarray:
    if input_has_crt and profile_id != "PRESERVE_SOURCE":
        raise ValueError("Refuse double CRT processing")
    if rgb.ndim != 3 or rgb.shape[2] != 3 or rgb.dtype != np.uint8:
        raise ValueError("Expected uint8 RGB input")
    resolution = config["calibratedResolution"]
    if rgb.shape[:2] != (resolution["height"], resolution["width"]):
        raise ValueError("Input must match calibrated resolution")
    profile = config["profiles"].get(profile_id)
    if not profile:
        raise ValueError("Unknown display profile")
    strength = float(profile["strength"])
    if profile_id == "PRESERVE_SOURCE":
        return rgb.copy()
    full = _full_crt(rgb, config["basePreset"])
    if strength == 1:
        return full
    clean = _warp_clean(rgb, config["basePreset"])
    return np.round(full * strength + clean * (1 - strength)).astype(np.uint8)


def render_rgba(rgba: np.ndarray, config: dict, profile_id: str, *, input_has_crt: bool) -> np.ndarray:
    if rgba.ndim != 3 or rgba.shape[2] != 4 or rgba.dtype != np.uint8:
        raise ValueError("Expected uint8 RGBA input")
    if profile_id != "LOCAL_CRT":
        raise ValueError("RGBA output is restricted to LOCAL_CRT")
    rgb = render(rgba[:, :, :3], config, profile_id, input_has_crt=input_has_crt)
    height, width = rgba.shape[:2]
    mx, my, _, _ = _maps(width, height, config["basePreset"])
    alpha = cv2.remap(rgba[:, :, 3], mx, my, cv2.INTER_NEAREST)
    alpha_glow = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 2.0) * 0.35
    alpha = np.uint8(np.clip(np.maximum(alpha, alpha_glow), 0, 255))
    return np.dstack([rgb, alpha])


def load_config(path: Path = DEFAULT_CONFIG) -> dict:
    config = json.loads(path.read_text())
    if config.get("contract") != "A1ArcadeCrtDisplayConfig/v1" or config.get("version") != 1:
        raise ValueError("Invalid display config")
    return config


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", choices=["FULL_CRT", "BALANCED_CRT", "LOCAL_CRT", "PRESERVE_SOURCE"], required=True)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--confirm-flat-input", action="store_true", required=True)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve() or args.output.exists():
        parser.error("Refuse source overwrite or existing output")
    config = load_config(args.config)
    source = Image.open(args.input)
    if args.profile == "LOCAL_CRT":
        result = render_rgba(np.asarray(source.convert("RGBA")), config, args.profile, input_has_crt=False)
        image = Image.fromarray(result, "RGBA")
    else:
        result = render(np.asarray(source.convert("RGB")), config, args.profile, input_has_crt=False)
        image = Image.fromarray(result, "RGB")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output)


if __name__ == "__main__":
    main()
