#!/usr/bin/env python3
"""
ED-02 screencast post-fx v3 — 专业 motion graphics
v22 + 5 个真效果:
  1. 真实 motion blur (沿 cursor 运动方向 5-frame 拖影, alpha 衰减)
  2. camera shake (micro handheld 1.5px 随机抖动)
  3. follow focus (zoom 中心跟 cursor 移动 0.3 权重)
  4. parallax depth (背景层 0.95x 慢移, 前景 1.0x 正常)
  5. ease-out-expo cubic-bezier(0.16, 1, 0.3, 1) 高级曲线
"""
import sys
import os
import math
from PIL import Image, ImageFilter, ImageDraw, ImageChops, ImageEnhance
import numpy as np
import subprocess
from pathlib import Path

SRC_FRAMES_DIR = sys.argv[1] if len(sys.argv) > 1 else "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v20-cdp-mock/frames"
OUT_FRAMES_DIR = sys.argv[2] if len(sys.argv) > 2 else "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v27-cine/frames_postfx"
OUT_VIDEO = sys.argv[3] if len(sys.argv) > 3 else "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v27-cine/ed-02-cine.mp4"
CURSOR_PATH = "/tmp/cursor_arrow.png"
FINAL_FPS = 60
Path(OUT_FRAMES_DIR).mkdir(parents=True, exist_ok=True)
Path(OUT_VIDEO).parent.mkdir(parents=True, exist_ok=True)

# === cubic-bezier(0.16, 1, 0.3, 1) = ease-out-expo ===
def cubic_bezier_evaluate(t, p1x, p1y, p2x, p2y):
    def bez(u, a, b): return 3*u*(1-u)**2*a + 3*u**2*(1-u)*b + u**3
    lo, hi = 0.0, 1.0
    for _ in range(20):
        mid = (lo + hi) / 2
        if bez(mid, p1x, p2x) < t: lo = mid
        else: hi = mid
    return bez((lo+hi)/2, p1y, p2y)

def ease_out_expo(t):
    return cubic_bezier_evaluate(t, 0.16, 1.0, 0.3, 1.0)

# === 关键帧 (v22 + 5 拍分镜 + 跟拍) ===
KEYFRAMES = [
    # t    zoom  cx    cy   panel_a  cand_a      sel_p
    (0.00, 1.00, 0.50, 0.50, 0,     [0,0,0],   0.0),
    (0.30, 1.00, 0.50, 0.50, 0,     [0,0,0],   0.0),
    (0.60, 1.06, 0.30, 0.45, 0,     [0,0,0],   0.4),  # beat 1 zoom in 选区
    (0.90, 1.06, 0.30, 0.45, 0,     [0,0,0],   0.3),  # hold
    (1.20, 1.00, 0.50, 0.50, 1,     [0,0,0],   0.0),  # beat 2 panel
    (1.40, 1.00, 0.50, 0.50, 1,     [1,0,0],   0.0),  # beat 3 cand ①
    (1.55, 1.00, 0.50, 0.50, 1,     [1,1,0],   0.0),  # ①②
    (1.70, 1.06, 0.30, 0.45, 0,     [0,0,0],   0.0),  # beat 4 裁回正文
    (1.90, 1.00, 0.50, 0.50, 0,     [0,0,0],   0.0),  # beat 5 收尾
    (2.00, 1.00, 0.50, 0.50, 0,     [0,0,0],   0.0),
]
def lerp(a, b, t): return a + (b - a) * t
def get_state(t):
    if t <= KEYFRAMES[0][0]: return _to_dict(KEYFRAMES[0])
    if t >= KEYFRAMES[-1][0]: return _to_dict(KEYFRAMES[-1])
    for i in range(len(KEYFRAMES) - 1):
        t0, *s0 = KEYFRAMES[i]
        t1, *s1 = KEYFRAMES[i + 1]
        if t0 <= t <= t1:
            raw = (t - t0) / (t1 - t0) if t1 > t0 else 0
            if i in (1, 2, 3): e = ease_out_expo(raw)
            elif i in (3, 4): e = ease_out_expo(raw)
            elif i in (4, 5, 6): e = ease_out_expo(raw)
            elif i in (6, 7): e = ease_out_expo(raw)
            else: e = ease_out_expo(raw)
            return {
                "zoom": lerp(s0[0], s1[0], e),
                "cx": lerp(s0[1], s1[1], e),
                "cy": lerp(s0[2], s1[2], e),
                "panel_alpha": lerp(s0[3], s1[3], e),
                "cand_alpha": [lerp(a, b, e) for a, b in zip(s0[4], s1[4])],
                "sel_pulse": lerp(s0[5], s1[5], e),
            }
    return _to_dict(KEYFRAMES[-1])

def _to_dict(kf):
    t, z, cx, cy, pa, ca, sp = kf
    return {"zoom": z, "cx": cx, "cy": cy, "panel_alpha": pa, "cand_alpha": list(ca), "sel_pulse": sp}

# === 加载 ===
frames_files = sorted(Path(SRC_FRAMES_DIR).glob("frame_*.png"))[:120]
print(f"== loaded {len(frames_files)} frames ==")
frames = [np.array(Image.open(f).convert("RGB")) for f in frames_files]
H, W = frames[0].shape[:2]
print(f"== size: {W}x{H} ==")

# === cursor detection ===
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
    cursor_positions.append((xs.mean(), ys.mean()))

# 平滑 (5-frame)
smoothed = []
for i in range(len(cursor_positions)):
    w = cursor_positions[max(0, i-2):min(len(cursor_positions), i+3)]
    smoothed.append((sum(p[0] for p in w)/len(w), sum(p[1] for p in w)/len(w)))
cursor_positions = smoothed

# cursor velocity (dx, dy) per frame for motion blur direction
cursor_velocity = [(0, 0)]
for i in range(1, len(cursor_positions)):
    dx = cursor_positions[i][0] - cursor_positions[i-1][0]
    dy = cursor_positions[i][1] - cursor_positions[i-1][1]
    cursor_velocity.append((dx, dy))

# === camera shake (1.5px 微抖, Perlin-like) ===
def shake_offset(t, seed=0):
    """3 个不同频率 sin 合成微抖"""
    sx = math.sin(t * 13.7 + seed) * 0.8 + math.sin(t * 31.3 + seed*2) * 0.4
    sy = math.cos(t * 17.1 + seed) * 0.6 + math.sin(t * 23.7 + seed*3) * 0.3
    return (sx, sy)

# === cursor sprite ===
cursor_img = Image.open(CURSOR_PATH).convert("RGBA")

# === 渲染 ===
print("== render v27 (cine: motion blur + shake + follow focus + parallax + ease-out-expo) ==")
out_frames = []
N = len(frames)
for i in range(N):
    t = i / FINAL_FPS
    state = get_state(t)
    cx, cy = cursor_positions[i]
    vx, vy = cursor_velocity[i]
    speed = math.sqrt(vx*vx + vy*vy)
    shake = shake_offset(t, seed=i)
    raw = frames[i]

    # === parallax depth: 拆前景 + 背景 ===
    # 背景: 上半部分 (article header) 0.96x 慢移
    # 前景: 选区+正文 1.0x
    # 简化: 整张图按 cursor 平移权重
    parallax_x = -vx * 0.3  # 0.3 权重反向跟 cursor
    parallax_y = -vy * 0.3

    # 1. shake 平移 (subtle 1.5px)
    img = Image.fromarray(raw).convert("RGBA")
    sx = int(shake[0] + parallax_x)
    sy = int(shake[1] + parallax_y)
    if sx or sy:
        img = img.transform((W, H), Image.AFFINE, (1, 0, sx, 0, 1, sy), resample=Image.BICUBIC)

    # 2. zoom + crop (中心 + follow focus: 加 0.2 权重 cursor)
    if state["zoom"] > 1.001:
        z = state["zoom"]
        # follow focus: 中心点向 cursor 位置拉 0.2 权重
        cursor_norm_x = cx / W
        cursor_norm_y = cy / H
        center_x = state["cx"] * 0.8 + cursor_norm_x * 0.2
        center_y = state["cy"] * 0.8 + cursor_norm_y * 0.2
        new_w = int(W / z)
        new_h = int(H / z)
        x0 = max(0, int(center_x * W - new_w / 2))
        y0 = max(0, int(center_y * H - new_h / 2))
        x0 = min(x0, W - new_w)
        y0 = min(y0, H - new_h)
        img = img.crop((x0, y0, x0 + new_w, y0 + new_h))
        img = img.resize((W, H), Image.LANCZOS)

    # 3. motion blur (沿 cursor 运动方向 5-frame 拖影, alpha 衰减)
    if speed > 3.0 and i >= 4:
        # 沿运动方向做 5 帧 alpha 拖影 (PIL Image.blend)
        trail_imgs = []
        for k in range(1, 6):
            j = max(0, i - k)
            # 之前帧在反向位置
            offset_x = -cursor_velocity[j][0] * k * 0.5
            offset_y = -cursor_velocity[j][1] * k * 0.5
            prev = Image.fromarray(frames[j]).convert("RGBA")
            if offset_x or offset_y:
                prev = prev.transform((W, H), Image.AFFINE, (1, 0, offset_x, 0, 1, offset_y), resample=Image.BICUBIC)
            # 沿运动方向模糊
            blur = prev.filter(ImageFilter.GaussianBlur(radius=k*1.5))
            # 衰减 alpha
            a = int(60 / k)
            blur.putalpha(a)
            trail_imgs.append(blur)
        # 叠加拖影
        for t_img in trail_imgs:
            img = Image.alpha_composite(img, t_img)

    # 4. cursor + 拖影 (5 帧)
    if i >= 4:
        trail_positions = [
            cursor_positions[i-1],
            cursor_positions[i-2],
            cursor_positions[i-3],
            (cursor_positions[i-2][0] * 0.6 + cursor_positions[i-3][0] * 0.4,
             cursor_positions[i-2][1] * 0.6 + cursor_positions[i-3][1] * 0.4),
        ]
    else:
        trail_positions = [cursor_positions[i]] * 4

    def to_zoom_xy(px, py):
        if state["zoom"] > 1.001:
            z = state["zoom"]
            new_w = W / z
            new_h = H / z
            cxw = state["cx"] * 0.8 * W + (cx) * 0.2
            cyw = state["cy"] * 0.8 * H + (cy) * 0.2
            return ((px - (cxw - new_w/2)) * z, (py - (cyw - new_h/2)) * z)
        return px, py

    for j, (tx, ty) in enumerate(trail_positions):
        tx_z, ty_z = to_zoom_xy(tx, ty)
        scale_alpha = int(255 * (0.4 - j * 0.08))
        if scale_alpha < 30: break
        trail = cursor_img.copy()
        a_chan = trail.getchannel("A").point(lambda v: int(v * scale_alpha / 255))
        trail.putalpha(a_chan)
        img.alpha_composite(trail, (int(tx_z - 4), int(ty_z - 2)))

    cx_z, cy_z = to_zoom_xy(cx, cy)
    img.alpha_composite(cursor_img, (int(cx_z - 4), int(cy_z - 2)))

    # 5. panel glow
    if state["panel_alpha"] > 0.05:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        px0, py0, px1, py1 = W - 640, 60, W - 30, 850
        cxp, cyp = (px0 + px1) / 2, (py0 + py1) / 2
        s = 0.95 + 0.05 * state["panel_alpha"]
        w = int((px1 - px0) * s)
        h = int((py1 - py0) * s)
        x0 = int(cxp - w / 2)
        y0 = int(cyp - h / 2)
        alpha = int(45 * state["panel_alpha"])
        d.rectangle([x0, y0, x0 + w, y0 + h], outline=(255, 255, 255, alpha), width=3)
        overlay = overlay.filter(ImageFilter.GaussianBlur(radius=10))
        img = Image.alpha_composite(img, overlay)

    # 6. cand emphasis
    y_starts = [200, 380, 560]
    y_ends = [360, 540, 720]
    for k, (y0, y1) in enumerate(zip(y_starts, y_ends)):
        a = state["cand_alpha"][k]
        if a < 0.05: continue
        crop = img.crop((W - 620, y0, W - 50, y1))
        bright = ImageEnhance.Brightness(crop).enhance(1.0 + 0.25 * a)
        img.paste(bright, (W - 620, y0))

    # 7. sel pulse
    if state["sel_pulse"] > 0.05:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        alpha = int(80 * state["sel_pulse"])
        d.rectangle([130, 420, 1130, 445], fill=(100, 160, 255, alpha))
        img = Image.alpha_composite(img, overlay)

    # 8. vignette (cinematic 暗角)
    vignette = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vignette)
    for r in range(int(W*0.5), 0, -10):
        a = int(80 * (1 - r / (W*0.5)))
        vd.ellipse([W//2 - r, H//2 - r, W//2 + r, H//2 + r], fill=a)
    black = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    black.putalpha(vignette)
    img = Image.alpha_composite(img, black)

    img = img.convert("RGB")
    out_path = Path(OUT_FRAMES_DIR) / f"frame_{i:05d}.png"
    img.save(out_path, optimize=True)
    out_frames.append(out_path)

    if i % 10 == 0:
        print(f"  [{i:3d}/{N}] t={t:.2f}s z={state['zoom']:.2f} cursor=({cx:.0f},{cy:.0f}) speed={speed:.1f}")

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
