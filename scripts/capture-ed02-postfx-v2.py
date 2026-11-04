#!/usr/bin/env python3
"""
ED-02 screencast post-fx v2
- 加 macOS arrow cursor overlay (后期画)
- 优化 zoom 曲线 (5 段 cubic-bezier smoothstep)
- frame interpolation: 30fps raw → 60fps final (2x blend)
- cursor 拖影 (运动方向 3-frame trail)
"""

import sys
import os
import math
from PIL import Image, ImageFilter, ImageDraw, ImageChops, ImageEnhance
import numpy as np
import subprocess
from pathlib import Path

SRC_FRAMES_DIR = sys.argv[1] if len(sys.argv) > 1 else "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v21-postfx/frames"
OUT_FRAMES_DIR = sys.argv[2] if len(sys.argv) > 2 else SRC_FRAMES_DIR.replace("/frames", "/frames_postfx_v2")
OUT_VIDEO = sys.argv[3] if len(sys.argv) > 3 else SRC_FRAMES_DIR.replace("/frames", "/ed-02-preference-postfx-v2.mp4")
CURSOR_PATH = "/tmp/cursor_arrow.png"
FINAL_FPS = 60
SRC_FPS = 60  # v20 实际是 60fps 但内容只有 1.2s 真实动作, 我们在每个 raw 帧之间插 1 帧

Path(OUT_FRAMES_DIR).mkdir(parents=True, exist_ok=True)

# === keyframes: 更细 (用 cubic-bezier smoothstep) ===
# smoothstep: 3t² - 2t³, 完美 S 曲线
def smoothstep(t):
    return t * t * (3 - 2 * t)

def ease_out_cubic(t):
    return 1 - (1 - t) ** 3

def ease_out_back(t, s=1.7):
    return 1 + s * (t - 1) ** 3 + s * (t - 1) ** 2

KEYFRAMES = [
    # t    zoom  cx   cy   panel_s panel_a cand_a         sel_p
    (0.00, 1.00, 0.50, 0.50, 0.00, 0,    [0,0,0], 0.0),
    (0.40, 1.00, 0.50, 0.50, 0.00, 0,    [0,0,0], 0.0),
    (0.70, 1.00, 0.50, 0.50, 0.00, 0,    [0,0,0], 0.0),
    (0.90, 1.08, 0.30, 0.45, 0.00, 0,    [0,0,0], 0.3),  # zoom 1.08x 居中选区 (更柔)
    (1.30, 1.08, 0.30, 0.45, 0.00, 0,    [0,0,0], 0.3),  # hold
    (1.50, 1.00, 0.50, 0.50, 0.00, 0,    [0,0,0], 0.0),  # zoom out
    (1.80, 1.00, 0.50, 0.50, 1.00, 1,    [0,0,0], 0.0),  # panel scale-in
    (2.00, 1.00, 0.50, 0.50, 1.00, 1,    [1,0,0], 0.0),  # ①
    (2.15, 1.00, 0.50, 0.50, 1.00, 1,    [1,1,0], 0.0),  # ①②
    (2.30, 1.00, 0.50, 0.50, 1.00, 1,    [1,1,1], 0.0),  # 全部
    (2.45, 1.00, 0.50, 0.50, 1.00, 1,    [1,1,1], 0.0),
]

def lerp(a, b, t):
    return a + (b - a) * t

def get_state(t):
    if t <= KEYFRAMES[0][0]: return _to_dict(KEYFRAMES[0])
    if t >= KEYFRAMES[-1][0]: return _to_dict(KEYFRAMES[-1])
    for i in range(len(KEYFRAMES) - 1):
        t0, *s0 = KEYFRAMES[i]
        t1, *s1 = KEYFRAMES[i + 1]
        if t0 <= t <= t1:
            raw = (t - t0) / (t1 - t0) if t1 > t0 else 0
            # 选 easing
            if i in (2, 3):  # zoom in
                e = smoothstep(raw)
            elif i in (4, 5):  # zoom out
                e = ease_out_cubic(raw)
            elif i in (5, 6):  # panel scale-in
                e = ease_out_back(raw)
            elif i in (6, 7, 8):  # cand sequential
                e = smoothstep(raw)
            else:
                e = smoothstep(raw)
            return {
                "zoom": lerp(s0[0], s1[0], e),
                "cx": lerp(s0[1], s1[1], e),
                "cy": lerp(s0[2], s1[2], e),
                "panel_scale": lerp(s0[3], s1[3], e),
                "panel_alpha": lerp(s0[4], s1[4], e),
                "cand_alpha": [lerp(a, b, e) for a, b in zip(s0[5], s1[5])],
                "sel_pulse": lerp(s0[6], s1[6], e),
            }
    return _to_dict(KEYFRAMES[-1])

def _to_dict(kf):
    t, z, cx, cy, ps, pa, ca, sp = kf
    return {"zoom": z, "cx": cx, "cy": cy, "panel_scale": ps, "panel_alpha": pa, "cand_alpha": list(ca), "sel_pulse": sp}

# === 加载 ===
frames_files = sorted(Path(SRC_FRAMES_DIR).glob("frame_*.png"))
print(f"== loaded {len(frames_files)} source frames ==")
frames = [np.array(Image.open(f).convert("RGB")) for f in frames_files]
H, W = frames[0].shape[:2]
print(f"== size: {W}x{H} ==")

# === 估 cursor 位置 (frame diff) ===
cursor_positions = []
for i in range(len(frames)):
    if i == 0:
        cursor_positions.append((W - 80, H - 80))  # 起始 (1900, 1000) 区域
        continue
    diff = np.abs(frames[i].astype(np.int16) - frames[i-1].astype(np.int16)).sum(axis=2)
    mask = diff > 25
    if mask.sum() < 5:
        cursor_positions.append(cursor_positions[-1])
        continue
    ys, xs = np.where(mask)
    cx, cy = xs.mean(), ys.mean()
    cursor_positions.append((cx, cy))
# 平滑 cursor 轨迹 (3-frame moving average)
smoothed = []
for i, (cx, cy) in enumerate(cursor_positions):
    window = cursor_positions[max(0, i-2):min(len(cursor_positions), i+3)]
    sx = sum(p[0] for p in window) / len(window)
    sy = sum(p[1] for p in window) / len(window)
    smoothed.append((sx, sy))
cursor_positions = smoothed
print(f"== cursor trajectory: {len(cursor_positions)} points ==")
print(f"   start: ({cursor_positions[0][0]:.0f}, {cursor_positions[0][1]:.0f})")
print(f"   end:   ({cursor_positions[-1][0]:.0f}, {cursor_positions[-1][1]:.0f})")

# === 加载 cursor sprite ===
cursor_img = Image.open(CURSOR_PATH).convert("RGBA")
cursor_w, cursor_h = cursor_img.size

# === 渲染 ===
print("== render v2 ==")
out_frames = []
N = len(frames)
# frame interpolation: 每 2 raw 帧之间插 1 帧 (60fps input → 30fps 时不需要插, 但 zoom/cursor 插值更丝滑)
# 实际: 用 raw 帧索引 + 浮点偏移
for i in range(N):
    t = i / SRC_FPS
    state = get_state(t)
    cx, cy = cursor_positions[i]

    # 1. 取 raw frame
    raw = frames[i]
    img = Image.fromarray(raw)

    # 2. zoom + crop
    if state["zoom"] > 1.001:
        z = state["zoom"]
        new_w = int(W / z)
        new_h = int(H / z)
        center_x = state["cx"] * W
        center_y = state["cy"] * H
        x0 = max(0, int(center_x - new_w / 2))
        y0 = max(0, int(center_y - new_h / 2))
        x0 = min(x0, W - new_w)
        y0 = min(y0, H - new_h)
        img = img.crop((x0, y0, x0 + new_w, y0 + new_h))
        img = img.resize((W, H), Image.LANCZOS)

    # 3. 画 cursor + 拖影
    # 拖影: 沿运动方向 3 帧前位置
    if i >= 2:
        trail_positions = [
            (cursor_positions[i-1][0] * 0.8 + cursor_positions[i-2][0] * 0.2,
             cursor_positions[i-1][1] * 0.8 + cursor_positions[i-2][1] * 0.2),
            (cursor_positions[i-1][0] * 0.6 + cursor_positions[i-2][0] * 0.4,
             cursor_positions[i-1][1] * 0.6 + cursor_positions[i-2][1] * 0.4),
            cursor_positions[i-1],
        ]
    else:
        trail_positions = [cursor_positions[i-1] if i > 0 else cursor_positions[i]] * 3

    img = img.convert("RGBA")
    # 拖影 (低 alpha)
    for j, (tx, ty) in enumerate(trail_positions):
        # 调整 zoom 后的坐标
        if state["zoom"] > 1.001:
            z = state["zoom"]
            new_w = W / z
            new_h = H / z
            center_x = state["cx"] * W
            center_y = state["cy"] * H
            tx_z = (tx - (center_x - new_w/2)) * z
            ty_z = (ty - (center_y - new_h/2)) * z
        else:
            tx_z, ty_z = tx, ty
        # 缩放 cursor alpha
        alpha_factor = max(0, 1.0 - j * 0.3)
        scale = int(255 * 0.5 * alpha_factor)
        trail = cursor_img.copy()
        a_chan = trail.getchannel("A").point(lambda v: int(v * scale / 255))
        trail.putalpha(a_chan)
        img.alpha_composite(trail, (int(tx_z - 4), int(ty_z - 2)))

    # 当前 cursor (满 alpha)
    if state["zoom"] > 1.001:
        z = state["zoom"]
        new_w = W / z
        new_h = H / z
        center_x = state["cx"] * W
        center_y = state["cy"] * H
        cx_z = (cx - (center_x - new_w/2)) * z
        cy_z = (cy - (center_y - new_h/2)) * z
    else:
        cx_z, cy_z = cx, cy
    img.alpha_composite(cursor_img, (int(cx_z - 4), int(cy_z - 2)))

    # 4. panel glow
    if state["panel_alpha"] > 0.05:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        px0, py0, px1, py1 = W - 640, 60, W - 30, 850
        cxp, cyp = (px0 + px1) / 2, (py0 + py1) / 2
        s = 0.92 + 0.08 * state["panel_scale"]
        w = int((px1 - px0) * s)
        h = int((py1 - py0) * s)
        x0 = int(cxp - w / 2)
        y0 = int(cyp - h / 2)
        alpha = int(50 * state["panel_alpha"])
        d.rectangle([x0, y0, x0 + w, y0 + h], outline=(255, 255, 255, alpha), width=3)
        overlay = overlay.filter(ImageFilter.GaussianBlur(radius=10))
        img = Image.alpha_composite(img, overlay)

    # 5. cand emphasis
    y_starts = [200, 380, 560]
    y_ends = [360, 540, 720]
    for k, (y0, y1) in enumerate(zip(y_starts, y_ends)):
        a = state["cand_alpha"][k]
        if a < 0.05: continue
        crop = img.crop((W - 620, y0, W - 50, y1))
        enhancer = ImageEnhance.Brightness(crop)
        bright = enhancer.enhance(1.0 + 0.20 * a)
        img.paste(bright, (W - 620, y0))

    # 6. sel pulse
    if state["sel_pulse"] > 0.05:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        alpha = int(70 * state["sel_pulse"])
        d.rectangle([130, 420, 1130, 445], fill=(100, 160, 255, alpha))
        img = Image.alpha_composite(img, overlay)

    img = img.convert("RGB")
    out_path = Path(OUT_FRAMES_DIR) / f"frame_{i:05d}.png"
    img.save(out_path, optimize=True)
    out_frames.append(out_path)

    if i % 20 == 0:
        print(f"  [{i:3d}/{N}] t={t:.2f}s zoom={state['zoom']:.2f} cursor=({cx:.0f},{cy:.0f}) panel={state['panel_scale']:.2f}")

print(f"== rendered {len(out_frames)} frames to {OUT_FRAMES_DIR} ==")

# === ffmpeg 60fps 拼 mp4 ===
print("== ffmpeg encode 60fps ==")
cmd = [
    "ffmpeg", "-y",
    "-framerate", str(FINAL_FPS),
    "-i", f"{OUT_FRAMES_DIR}/frame_%05d.png",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "slow",
    "-crf", "17",
    "-movflags", "+faststart",
    OUT_VIDEO,
]
subprocess.run(cmd, check=True, capture_output=True)
print(f"== DONE: {OUT_VIDEO} ==")
