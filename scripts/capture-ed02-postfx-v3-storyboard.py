#!/usr/bin/env python3
"""
ED-02 screencast post-fx v3 — 按分镜表 (5 拍, 总 2.0s)
ED-02 spec from workspace.json:
  五拍操作序列, 3.35s–5.34s = 2.0s 总时长
  始终把目标句固定在画面中央偏左并保持完整可读
  禁止标题/HUD/箭头/伪界面
"""

import sys
import os
import math
from PIL import Image, ImageFilter, ImageDraw, ImageChops, ImageEnhance
import numpy as np
import subprocess
from pathlib import Path

SRC_FRAMES_DIR = sys.argv[1] if len(sys.argv) > 1 else "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v20-cdp-mock/frames"
OUT_FRAMES_DIR = sys.argv[2] if len(sys.argv) > 2 else "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v23-storyboard/frames_postfx"
OUT_VIDEO = sys.argv[3] if len(sys.argv) > 3 else "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v23-storyboard/ed-02-5beats.mp4"
CURSOR_PATH = "/tmp/cursor_arrow.png"
FINAL_FPS = 60
# 总时长 2.0s = 120 frames @ 60fps (用 v20 raw 145 帧, 取前 120 帧)
TOTAL_FRAMES = 120
DURATION_S = 2.0

Path(OUT_FRAMES_DIR).mkdir(parents=True, exist_ok=True)
Path(OUT_VIDEO).parent.mkdir(parents=True, exist_ok=True)

# === cubic-bezier (iOS 风格) ===
def cubic_bezier(t, p1, p2):
    """cubic-bezier(p1x, p1y, p2x, p2y) 经典 iOS easing"""
    # 4 个控制点: P0=(0,0), P1=(p1x,p1y), P2=(p2x,p2y), P3=(1,1)
    # 用 de Casteljau 数值解
    p1x, p1y, p2x, p2y = p1, p2[0], p2[1], p2[2] if len(p2) > 2 else 1.0
    # 简化: 用 Newton-Raphson 找 t 对应 x
    def bez_x(u): return 3*u*(1-u)**2*p1x + 3*u**2*(1-u)*p2x + u**3
    def bez_y(u): return 3*u*(1-u)**2*p1y + 3*u**2*(1-u)*p2y + u**3
    # 二分法
    lo, hi = 0.0, 1.0
    for _ in range(20):
        mid = (lo + hi) / 2
        x = bez_x(mid)
        if x < t: lo = mid
        else: hi = mid
    return bez_y((lo + hi) / 2)

# 5 拍 ED-02 keyframes (按分镜表)
# beat 1: 0.0-0.5s 选区+改写入口 (zoom 1.04x ease-in)
# beat 2: 0.5-1.0s panel 35% 宽 (zoom 1.0x, panel ease-out-expo)
# beat 3: 1.0-1.4s 点击候选 + 选中反馈 (zoom 1.04x, click 动画)
# beat 4: 1.4-1.8s 插入点 + 输入 (zoom 1.06x, 文字逐字 ease-out)
# beat 5: 1.8-2.0s 完整回填 + 绿勾 (zoom 1.0x, hold)
# 目标句固定在中央偏左 (cx=0.32, cy=0.42)

KEYFRAMES = [
    # t    zoom  cx    cy   panel_w panel_a cand_a         sel_p  input_chars  check_green
    (0.00, 1.00, 0.50, 0.50, 0.00, 0,    [0,0,0], 0.0, 0,  0.0),
    (0.20, 1.00, 0.50, 0.50, 0.00, 0,    [0,0,0], 0.0, 0,  0.0),
    (0.45, 1.04, 0.32, 0.42, 0.00, 0,    [0,0,0], 0.5, 0,  0.0),  # beat 1: zoom in 选区
    (0.65, 1.04, 0.32, 0.42, 0.00, 0,    [0,0,0], 0.4, 0,  0.0),  # hold
    (0.80, 1.00, 0.40, 0.45, 0.00, 0,    [0,0,0], 0.2, 0,  0.0),  # beat 2: zoom out + panel 准备
    (1.00, 1.00, 0.40, 0.45, 1.00, 1,    [0,0,0], 0.0, 0,  0.0),  # panel 35% 宽 ease-out-expo
    (1.20, 1.00, 0.40, 0.45, 1.00, 1,    [1,0,0], 0.0, 0,  0.0),  # beat 3: 候选 ①
    (1.35, 1.04, 0.32, 0.42, 1.00, 1,    [1,1,0], 0.0, 0,  0.0),  # 点击 ① 反馈 + ①②
    (1.50, 1.06, 0.32, 0.42, 0.00, 0,    [0,0,0], 0.0, 0,  0.0),  # beat 4: 裁回正文, 插入点
    (1.65, 1.06, 0.32, 0.42, 0.00, 0,    [0,0,0], 0.0, 4,  0.0),  # 输入 4 字
    (1.80, 1.00, 0.40, 0.45, 0.00, 0,    [0,0,0], 0.0, 12, 0.3),  # beat 5: 回填 12 字 + 绿勾
    (2.00, 1.00, 0.40, 0.45, 0.00, 0,    [0,0,0], 0.0, 15, 1.0),  # 完整 + 绿勾
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
            # 5 拍分别用不同 cubic-bezier
            if i in (2, 3):    # beat 1 zoom in
                e = cubic_bezier(raw, 0.16, (1.0, 0.3, 1.0))  # ease-out-expo
            elif i in (4, 5):  # beat 2 panel
                e = cubic_bezier(raw, 0.16, (1.0, 0.3, 1.0))
            elif i in (5, 6):  # cand ①
                e = cubic_bezier(raw, 0.34, (1.56, 0.64, 1.0))  # ease-out-back
            elif i in (6, 7):  # click + ①②
                e = cubic_bezier(raw, 0.65, (0.0, 0.35, 1.0))  # ease-in-out-cubic
            elif i in (7, 8):  # 裁回正文
                e = cubic_bezier(raw, 0.16, (1.0, 0.3, 1.0))
            elif i in (8, 9):  # 输入
                e = cubic_bezier(raw, 0.45, (0.05, 0.55, 0.95))  # ease-in-out-quad
            else:
                e = cubic_bezier(raw, 0.65, (0.0, 0.35, 1.0))
            return {
                "zoom": lerp(s0[0], s1[0], e),
                "cx": lerp(s0[1], s1[1], e),
                "cy": lerp(s0[2], s1[2], e),
                "panel_scale": lerp(s0[3], s1[3], e),
                "panel_alpha": lerp(s0[4], s1[4], e),
                "cand_alpha": [lerp(a, b, e) for a, b in zip(s0[5], s1[5])],
                "sel_pulse": lerp(s0[6], s1[6], e),
                "input_chars": int(lerp(s0[7], s1[7], e)),
                "check_green": lerp(s0[8], s1[8], e),
            }
    return _to_dict(KEYFRAMES[-1])

def _to_dict(kf):
    t, z, cx, cy, ps, pa, ca, sp, ic, cg = kf
    return {"zoom": z, "cx": cx, "cy": cy, "panel_scale": ps, "panel_alpha": pa,
            "cand_alpha": list(ca), "sel_pulse": sp, "input_chars": ic, "check_green": cg}

# === 加载 ===
frames_files = sorted(Path(SRC_FRAMES_DIR).glob("frame_*.png"))[:TOTAL_FRAMES]
print(f"== loaded {len(frames_files)} source frames (取前 {TOTAL_FRAMES}) ==")
frames = [np.array(Image.open(f).convert("RGB")) for f in frames_files]
H, W = frames[0].shape[:2]
print(f"== size: {W}x{H} ==")

# === 估 cursor 位置 (frame diff) ===
cursor_positions = []
for i in range(len(frames)):
    if i == 0:
        cursor_positions.append((W - 100, H - 100))
        continue
    diff = np.abs(frames[i].astype(np.int16) - frames[i-1].astype(np.int16)).sum(axis=2)
    mask = diff > 20
    if mask.sum() < 5:
        cursor_positions.append(cursor_positions[-1])
        continue
    ys, xs = np.where(mask)
    cx, cy = xs.mean(), ys.mean()
    cursor_positions.append((cx, cy))
# 平滑
smoothed = []
for i in range(len(cursor_positions)):
    window = cursor_positions[max(0, i-1):min(len(cursor_positions), i+2)]
    sx = sum(p[0] for p in window) / len(window)
    sy = sum(p[1] for p in window) / len(window)
    smoothed.append((sx, sy))
cursor_positions = smoothed

# === cursor sprite ===
cursor_img = Image.open(CURSOR_PATH).convert("RGBA")

# === 渲染 ===
print("== render v3 (5 beats 2.0s) ==")
out_frames = []
N = len(frames)
for i in range(N):
    t = i / FINAL_FPS
    state = get_state(t)
    cx, cy = cursor_positions[i] if i < len(cursor_positions) else (W//2, H//2)

    # raw frame
    raw = frames[i]
    img = Image.fromarray(raw)

    # 1. zoom + crop (中心在 cx,cy 归一化)
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

    # 2. cursor + 拖影
    img = img.convert("RGBA")
    if i >= 2:
        trail_positions = [
            cursor_positions[i-1],
            (cursor_positions[i-1][0] * 0.7 + cursor_positions[i-2][0] * 0.3,
             cursor_positions[i-1][1] * 0.7 + cursor_positions[i-2][1] * 0.3),
        ]
    else:
        trail_positions = [cursor_positions[0]] * 2

    # zoom 内坐标变换
    def to_zoom_xy(px, py):
        if state["zoom"] > 1.001:
            z = state["zoom"]
            new_w = W / z
            new_h = H / z
            cxw = state["cx"] * W
            cyw = state["cy"] * H
            return ((px - (cxw - new_w/2)) * z, (py - (cyw - new_h/2)) * z)
        return px, py

    for j, (tx, ty) in enumerate(trail_positions):
        tx_z, ty_z = to_zoom_xy(tx, ty)
        scale_alpha = int(255 * (0.35 - j * 0.15))
        trail = cursor_img.copy()
        a_chan = trail.getchannel("A").point(lambda v: int(v * scale_alpha / 255))
        trail.putalpha(a_chan)
        img.alpha_composite(trail, (int(tx_z - 4), int(ty_z - 2)))

    # 当前 cursor
    cx_z, cy_z = to_zoom_xy(cx, cy)
    img.alpha_composite(cursor_img, (int(cx_z - 4), int(cy_z - 2)))

    # 3. panel (右侧 35% 宽 ≈ 672px, ED-02 spec)
    if state["panel_alpha"] > 0.05:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        panel_w = int(W * 0.35)  # 35% 宽 = 672
        px0 = W - panel_w - 30
        py0 = 60
        px1 = W - 30
        py1 = 850
        s = 0.95 + 0.05 * state["panel_scale"]  # 1.0 final
        w = int((px1 - px0) * s)
        h = int((py1 - py0) * s)
        x0 = int((px0 + px1) / 2 - w / 2)
        y0 = int((py0 + py1) / 2 - h / 2)
        alpha = int(40 * state["panel_alpha"])
        d.rectangle([x0, y0, x0 + w, y0 + h], outline=(255, 255, 255, alpha), width=3)
        overlay = overlay.filter(ImageFilter.GaussianBlur(radius=10))
        img = Image.alpha_composite(img, overlay)

    # 4. cand emphasis (panel 内部 3 候选)
    y_starts = [200, 380, 560]
    y_ends = [360, 540, 720]
    for k, (y0, y1) in enumerate(zip(y_starts, y_ends)):
        a = state["cand_alpha"][k]
        if a < 0.05: continue
        crop = img.crop((W - 620, y0, W - 50, y1))
        enhancer = ImageEnhance.Brightness(crop)
        bright = enhancer.enhance(1.0 + 0.25 * a)
        img.paste(bright, (W - 620, y0))

    # 5. sel pulse (中央偏左 选区)
    if state["sel_pulse"] > 0.05:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        # 选区大致位置 (zoom 后 cx=0.32, cy=0.42)
        sx0, sy0 = int(W * 0.05), int(H * 0.40)
        sx1, sy1 = int(W * 0.58), int(H * 0.45)
        alpha = int(80 * state["sel_pulse"])
        d.rectangle([sx0, sy0, sx1, sy1], fill=(100, 160, 255, alpha))
        img = Image.alpha_composite(img, overlay)

    # 6. input chars (beat 4) - 文字逐字出现 (简单: 在选区位置加 typing 提示)
    if state["input_chars"] > 0:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        # 选区位置, 加新字
        text_y = int(H * 0.43)
        text_x = int(W * 0.06)
        typed = "AI 稿像面试"[:state["input_chars"]]
        d.text((text_x, text_y), typed, fill=(20, 20, 20, 220))
        # 插入点光标
        cursor_x = text_x + len(typed) * 14
        d.line([(cursor_x, text_y), (cursor_x, text_y + 18)], fill=(0, 0, 0, 255), width=2)
        img = Image.alpha_composite(img, overlay)

    # 7. green check (beat 5)
    if state["check_green"] > 0.05:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        # 绿勾在 改写 按钮位置
        cx_g, cy_g = int(W * 0.10), int(H * 0.45)
        size = 12
        alpha = int(255 * state["check_green"])
        d.ellipse([cx_g - size, cy_g - size, cx_g + size, cy_g + size],
                  fill=(34, 197, 94, alpha))
        d.line([(cx_g - 5, cy_g), (cx_g - 1, cy_g + 5), (cx_g + 6, cy_g - 4)],
               fill=(255, 255, 255, alpha), width=2)
        img = Image.alpha_composite(img, overlay)

    img = img.convert("RGB")
    out_path = Path(OUT_FRAMES_DIR) / f"frame_{i:05d}.png"
    img.save(out_path, optimize=True)
    out_frames.append(out_path)

    if i % 12 == 0:
        print(f"  [{i:3d}/{N}] t={t:.2f}s z={state['zoom']:.2f} cursor=({cx:.0f},{cy:.0f}) panel={state['panel_scale']:.2f} cand={state['cand_alpha']} input={state['input_chars']} green={state['check_green']:.2f}")

print(f"== rendered {len(out_frames)} frames ==")

# === ffmpeg 60fps 拼 mp4 ===
print("== ffmpeg encode ==")
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
print(f"   duration: {len(out_frames)/FINAL_FPS:.2f}s @ {FINAL_FPS}fps")
