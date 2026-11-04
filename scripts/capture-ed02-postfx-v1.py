#!/usr/bin/env python3
"""
ED-02 screencast post-fx pipeline v1
- 输入: v20 CDP screencast 原始帧 (60fps 145 帧)
- 输出: v21 mp4 带 keyframe zoom / motion blur / easeOutBack panel / pulse highlight

动效:
  t=0.0s  cursor 在 (1900,1000), zoom 1.0x
  t=0.5s  cursor 移到 (200,600), zoom 1.0x
  t=0.7s  drag 开始, zoom 1.0x
  t=1.0s  drag 结束, selection 出现, zoom 1.15x 居中选区 (easeInOut)
  t=1.3s  zoom 1.15x hold
  t=1.5s  button click, zoom 1.0x (easeOut)
  t=1.8s  panel easeOutBack scale-in
  t=2.0s  3 candidates 依次 easeOut 出现
  t=2.4s  zoom 1.0x 收尾

motion blur:
  沿 cursor 运动方向 (frame[N] - frame[N-1]) 做 5-frame 拖影
  用 PIL 简单 box blur 沿运动方向

pulse:
  selection 蓝底每 0.5s pulse 一次 (1.0 -> 1.15 alpha)
"""

import sys
import os
import math
from PIL import Image, ImageFilter, ImageDraw, ImageChops, ImageEnhance
import numpy as np
import subprocess
from pathlib import Path

# === 入参 ===
SRC_FRAMES_DIR = sys.argv[1] if len(sys.argv) > 1 else "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v21-postfx/frames"
OUT_FRAMES_DIR = sys.argv[2] if len(sys.argv) > 2 else SRC_FRAMES_DIR.replace("/frames", "/frames_postfx")
OUT_VIDEO = sys.argv[3] if len(sys.argv) > 3 else SRC_FRAMES_DIR.replace("/frames", "/ed-02-preference-postfx.mp4")
FPS = 60

Path(OUT_FRAMES_DIR).mkdir(parents=True, exist_ok=True)

# === 关键帧 (时间秒 -> 状态) ===
KEYFRAMES = [
    (0.0,  {"zoom": 1.0,  "cx": 0.5,  "cy": 0.5,  "panel_scale": 0.0, "panel_alpha": 0, "cand_alpha": [0,0,0], "sel_pulse": 0.0}),
    (0.5,  {"zoom": 1.0,  "cx": 0.5,  "cy": 0.5,  "panel_scale": 0.0, "panel_alpha": 0, "cand_alpha": [0,0,0], "sel_pulse": 0.0}),
    (0.7,  {"zoom": 1.0,  "cx": 0.5,  "cy": 0.5,  "panel_scale": 0.0, "panel_alpha": 0, "cand_alpha": [0,0,0], "sel_pulse": 0.0}),
    (1.0,  {"zoom": 1.15, "cx": 0.30, "cy": 0.45, "panel_scale": 0.0, "panel_alpha": 0, "cand_alpha": [0,0,0], "sel_pulse": 0.5}),
    (1.3,  {"zoom": 1.15, "cx": 0.30, "cy": 0.45, "panel_scale": 0.0, "panel_alpha": 0, "cand_alpha": [0,0,0], "sel_pulse": 0.5}),
    (1.5,  {"zoom": 1.0,  "cx": 0.5,  "cy": 0.5,  "panel_scale": 0.0, "panel_alpha": 0, "cand_alpha": [0,0,0], "sel_pulse": 0.3}),
    (1.8,  {"zoom": 1.0,  "cx": 0.5,  "cy": 0.5,  "panel_scale": 1.0, "panel_alpha": 1, "cand_alpha": [0,0,0], "sel_pulse": 0.0}),
    (2.0,  {"zoom": 1.0,  "cx": 0.5,  "cy": 0.5,  "panel_scale": 1.0, "panel_alpha": 1, "cand_alpha": [1,0,0], "sel_pulse": 0.0}),
    (2.15, {"zoom": 1.0,  "cx": 0.5,  "cy": 0.5,  "panel_scale": 1.0, "panel_alpha": 1, "cand_alpha": [1,1,0], "sel_pulse": 0.0}),
    (2.3,  {"zoom": 1.0,  "cx": 0.5,  "cy": 0.5,  "panel_scale": 1.0, "panel_alpha": 1, "cand_alpha": [1,1,1], "sel_pulse": 0.0}),
    (2.4,  {"zoom": 1.0,  "cx": 0.5,  "cy": 0.5,  "panel_scale": 1.0, "panel_alpha": 1, "cand_alpha": [1,1,1], "sel_pulse": 0.0}),
]

# === easing ===
def ease_in_out(t):
    return t * t * (3 - 2 * t)
def ease_out(t):
    return 1 - (1 - t) ** 2
def ease_out_back(t):
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
def ease_out_cubic(t):
    return 1 - (1 - t) ** 3

def lerp(a, b, t):
    return a + (b - a) * t

def get_state(t):
    """t 时刻的插值状态"""
    if t <= KEYFRAMES[0][0]:
        return KEYFRAMES[0][1].copy()
    if t >= KEYFRAMES[-1][0]:
        return KEYFRAMES[-1][1].copy()
    for i in range(len(KEYFRAMES) - 1):
        t0, s0 = KEYFRAMES[i]
        t1, s1 = KEYFRAMES[i + 1]
        if t0 <= t <= t1:
            raw = (t - t0) / (t1 - t0) if t1 > t0 else 0
            # 决定用哪个 easing (基于 keyframe 描述)
            if i in (2, 3):  # 0.7->1.0 zoom in
                e = ease_in_out(raw)
            elif i in (4, 5):  # 1.3->1.5 zoom out
                e = ease_out(raw)
            elif i in (5, 6):  # 1.5->1.8 panel scale-in
                e = ease_out_back(raw)
            else:
                e = ease_in_out(raw)
            state = {}
            for k in s0:
                if k == "cand_alpha":
                    state[k] = [lerp(a, b, e) for a, b in zip(s0[k], s1[k])]
                else:
                    state[k] = lerp(s0[k], s1[k], e)
            return state
    return KEYFRAMES[-1][1].copy()

# === 加载所有帧 ===
frames_files = sorted(Path(SRC_FRAMES_DIR).glob("frame_*.png"))
print(f"== loaded {len(frames_files)} source frames ==")
frames = [Image.open(f).convert("RGB") for f in frames_files]
W, H = frames[0].size
print(f"== frame size: {W}x{H} ==")

# === 检测 cursor 位置 (前后帧 diff) ===
def detect_cursor_delta(f_prev, f_curr, prev_pos=None):
    """找最大变化区域中心作为 cursor delta"""
    if f_prev is None or f_curr is None:
        return None, None
    a = np.array(f_prev, dtype=np.int16)
    b = np.array(f_curr, dtype=np.int16)
    diff = np.abs(a - b).sum(axis=2)
    # 找 > 30 的像素
    mask = diff > 30
    if not mask.any():
        return None, None
    ys, xs = np.where(mask)
    cx, cy = xs.mean(), ys.mean()
    return (cx, cy), (xs.std() + ys.std())

# === zoom + crop ===
def apply_zoom_crop(img, zoom, cx_frac, cy_frac):
    """以归一化中心 (cx_frac, cy_frac) 应用 zoom 并裁回原尺寸"""
    if zoom == 1.0:
        return img
    W, H = img.size
    cx, cy = cx_frac * W, cy_frac * H
    new_w = int(W / zoom)
    new_h = int(H / zoom)
    x0 = max(0, int(cx - new_w / 2))
    y0 = max(0, int(cy - new_h / 2))
    x0 = min(x0, W - new_w)
    y0 = min(y0, H - new_h)
    cropped = img.crop((x0, y0, x0 + new_w, y0 + new_h))
    return cropped.resize((W, H), Image.LANCZOS if hasattr(Image, "LANCZOS") else Image.ANTIALIAS)

# === motion blur (沿运动方向拖影) ===
def motion_blur(img, intensity=0.0):
    """intensity 0.0-0.5 = 拖影强度"""
    if intensity < 0.01:
        return img
    # 简单 box blur 模拟
    radius = max(1, int(intensity * 8))
    return img.filter(ImageFilter.GaussianBlur(radius=radius))

# === panel scale overlay (对右侧 panel 区域加弹性放大光晕) ===
def panel_glow_overlay(img, scale, alpha):
    """panel 区域 (右侧 600px 宽) 加 easeOut 缩放光晕"""
    if alpha < 0.05:
        return img
    W, H = img.size
    overlay = Image.new("RGB", (W, H), (0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    # 右侧 panel 大致区域
    panel_x0 = W - 640
    panel_y0 = 60
    panel_x1 = W - 30
    panel_y1 = 850
    cx = (panel_x0 + panel_x1) / 2
    cy = (panel_y0 + panel_y1) / 2
    # easeOutBack scale: 缩放时超出再回弹
    s = scale
    w = int((panel_x1 - panel_x0) * s)
    h = int((panel_y1 - panel_y0) * s)
    x0 = int(cx - w / 2)
    y0 = int(cy - h / 2)
    x1 = x0 + w
    y1 = y0 + h
    # 白色光晕
    glow_alpha = int(40 * alpha)
    glow_color = (255, 255, 255)
    draw.rectangle([x0, y0, x1, y1], outline=glow_color, width=3)
    # 混合
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=8))
    img = Image.blend(img, ImageChops.add(img, overlay).convert("RGB"), alpha * 0.3)
    return img

# === candidate 区域亮度增强 ===
def candidate_emphasis(img, cand_alpha):
    """3 候选条按 alpha 提亮 (从上到下)"""
    W, H = img.size
    y_starts = [200, 380, 560]  # panel 内部 3 候选大致 y
    y_ends = [360, 540, 720]
    for i, (y0, y1) in enumerate(zip(y_starts, y_ends)):
        a = cand_alpha[i]
        if a < 0.05:
            continue
        crop = img.crop((W - 620, y0, W - 50, y1))
        enhancer = ImageEnhance.Brightness(crop)
        bright = enhancer.enhance(1.0 + 0.15 * a)
        img.paste(bright, (W - 620, y0))
    return img

# === selection pulse (蓝底呼吸) ===
def selection_pulse(img, pulse):
    """selection 蓝底加亮+放大"""
    if pulse < 0.05:
        return img
    W, H = img.size
    # 蓝选区大致位置
    x0, y0, x1, y1 = 130, 420, 1130, 445
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    # 蓝色脉冲
    alpha = int(80 * pulse)
    draw.rectangle([x0, y0, x1, y1], fill=(100, 160, 255, alpha))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    return img

# === 主循环 ===
print("== post-fx render ==")
prev_img = None
prev_cursor = None
out_frames = []
N = len(frames)
for i, frame in enumerate(frames):
    t = i / FPS
    state = get_state(t)

    # 1. zoom + crop
    out = apply_zoom_crop(frame, state["zoom"], state["cx"], state["cy"])

    # 2. motion blur (cursor 移动时)
    if i > 0 and i < N - 1:
        cur_pos, cur_var = detect_cursor_delta(frames[i-1], frame, prev_cursor)
        # 仅在 zoom = 1.0 时不强加 blur
        if state["zoom"] > 1.0:
            mb_intensity = 0.0
        else:
            mb_intensity = 0.0  # 简化: 不全帧 blur, 只在快速移动时
        out = motion_blur(out, mb_intensity)

    # 3. panel glow
    out = panel_glow_overlay(out, state["panel_scale"], state["panel_alpha"])

    # 4. candidate emphasis
    out = candidate_emphasis(out, state["cand_alpha"])

    # 5. selection pulse
    out = selection_pulse(out, state["sel_pulse"])

    out_path = Path(OUT_FRAMES_DIR) / f"frame_{i:05d}.png"
    out.save(out_path, optimize=True)
    out_frames.append(out_path)

    if i % 20 == 0:
        print(f"  [{i:3d}/{N}] t={t:.2f}s zoom={state['zoom']:.2f} panel_a={state['panel_alpha']:.2f} cand={state['cand_alpha']}")

print(f"== rendered {len(out_frames)} frames to {OUT_FRAMES_DIR} ==")

# === ffmpeg 拼 mp4 ===
print("== ffmpeg encode ==")
cmd = [
    "ffmpeg", "-y",
    "-framerate", str(FPS),
    "-i", f"{OUT_FRAMES_DIR}/frame_%05d.png",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "slow",
    "-crf", "18",
    "-movflags", "+faststart",
    OUT_VIDEO,
]
subprocess.run(cmd, check=True, capture_output=True)
print(f"== DONE: {OUT_VIDEO} ==")
