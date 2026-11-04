#!/usr/bin/env python3
"""
ED-02 v28 = v24 cap 真录 + v27 后期
底片: cap ScreenCaptureKit 1920x1080 60fps (真 OS cursor)
后期: 5 拍分镜 + ease-out-expo + 跟焦 + 视差 + 暗角
"""
import sys, os, math, subprocess
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw, ImageChops, ImageEnhance
import numpy as np

CAP_VIDEO = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v24-real-cap/ed-02-real.mp4"
OUT_DIR = Path("/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v28-cap-cine")
OUT_FRAMES = OUT_DIR / "frames"
OUT_VIDEO = OUT_DIR / "ed-02-cap-cine.mp4"
CAP_FPS = 60
OUT_FPS = 60

OUT_FRAMES.mkdir(parents=True, exist_ok=True)

# 抽帧
print("== extract frames from cap mp4 ==")
RAW_FRAMES = OUT_DIR / "raw"
RAW_FRAMES.mkdir(exist_ok=True)
subprocess.run([
    "ffmpeg", "-y", "-i", CAP_VIDEO, "-vf", f"fps={OUT_FPS}", "-q:v", "2",
    f"{RAW_FRAMES}/frame_%05d.png"
], check=True, capture_output=True)

frames_files = sorted(RAW_FRAMES.glob("frame_*.png"))
N = len(frames_files)
print(f"== loaded {N} frames ==")

# === 限制到 5 拍分镜 2.0s = 120 帧 ===
# v24 raw 是 3.45s = 207 帧, 取前 120 帧 (2.0s) 作为 beat 1-5
# 但 cap raw 内容 3.45s 已经包含完整流程: drag 选区 + 改写按钮 + 等候选
# 我们要: 5 拍 (0-2.0s) 套在 207 帧里, 取 frame 0-120 (drag 选区+改写阶段)
# 然后 beat 4-5 在 frame 120-150 (panel 出现阶段)
# 实际 cap 录制: 0-1.5s drag+选区, 1.5-3.0s 按钮 hover, 3.0+ 等候选
# v28 不重切 cap 阶段, 直接套 5 拍缓动即可

N = min(120, N)
frames_files = frames_files[:N]
frames = [np.array(Image.open(f).convert("RGB")) for f in frames_files]
H, W = frames[0].shape[:2]
print(f"== size: {W}x{H} ==")

# === cursor detection ===
# cap raw 已经有真 OS cursor, 但我们要识别它 (用 frame diff 也行)
cursor_positions = []
for i in range(len(frames)):
    if i == 0:
        cursor_positions.append((W//2, H//2))
        continue
    diff = np.abs(frames[i].astype(np.int16) - frames[i-1].astype(np.int16)).sum(axis=2)
    mask = diff > 20
    if mask.sum() < 5:
        cursor_positions.append(cursor_positions[-1])
        continue
    ys, xs = np.where(mask)
    cursor_positions.append((xs.mean(), ys.mean()))

# 平滑
smoothed = []
for i in range(len(cursor_positions)):
    w = cursor_positions[max(0, i-2):min(len(cursor_positions), i+3)]
    smoothed.append((sum(p[0] for p in w)/len(w), sum(p[1] for p in w)/len(w)))
cursor_positions = smoothed
cursor_velocity = [(0, 0)] + [(cursor_positions[i][0]-cursor_positions[i-1][0],
                              cursor_positions[i][1]-cursor_positions[i-1][1]) for i in range(1, len(cursor_positions))]

# === cubic-bezier ease ===
def cubic_bezier(t, p1x, p1y, p2x, p2y):
    def bez(u, a, b): return 3*u*(1-u)**2*a + 3*u**2*(1-u)*b + u**3
    lo, hi = 0.0, 1.0
    for _ in range(20):
        mid = (lo+hi)/2
        if bez(mid, p1x, p2x) < t: lo = mid
        else: hi = mid
    return bez((lo+hi)/2, p1y, p2y)

def ease(t):
    return cubic_bezier(min(max(t,0),1), 0.16, 1.0, 0.3, 1.0)

def lerp(a, b, t): return a + (b-a) * t

# 5 拍关键帧 (v27 同样, 但 zoom 调到 1.04 避免切边)
KEYFRAMES = [
    (0.00, 1.00, 0.50, 0.50, 0,    [0,0,0],   0.0),
    (0.30, 1.00, 0.50, 0.50, 0,    [0,0,0],   0.0),
    (0.60, 1.04, 0.32, 0.45, 0,    [0,0,0],   0.4),
    (0.90, 1.04, 0.32, 0.45, 0,    [0,0,0],   0.3),
    (1.20, 1.00, 0.50, 0.50, 1,    [0,0,0],   0.0),
    (1.40, 1.00, 0.50, 0.50, 1,    [1,0,0],   0.0),
    (1.55, 1.00, 0.50, 0.50, 1,    [1,1,0],   0.0),
    (1.70, 1.04, 0.32, 0.45, 0,    [0,0,0],   0.0),
    (1.90, 1.00, 0.50, 0.50, 0,    [0,0,0],   0.0),
    (2.00, 1.00, 0.50, 0.50, 0,    [0,0,0],   0.0),
]
def get_state(t):
    if t <= KEYFRAMES[0][0]: return _to_dict(KEYFRAMES[0])
    if t >= KEYFRAMES[-1][0]: return _to_dict(KEYFRAMES[-1])
    for i in range(len(KEYFRAMES) - 1):
        t0, *s0 = KEYFRAMES[i]
        t1, *s1 = KEYFRAMES[i+1]
        if t0 <= t <= t1:
            raw = (t - t0) / (t1 - t0) if t1 > t0 else 0
            e = ease(raw)
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

# === 渲染 ===
def shake_offset(t, seed):
    sx = math.sin(t*13.7+seed)*0.8 + math.sin(t*31.3+seed*2)*0.4
    sy = math.cos(t*17.1+seed)*0.6 + math.sin(t*23.7+seed*3)*0.3
    return (sx, sy)

print("== render v28 (cap底片 + cine 5 拍后期) ==")
out_frames = []
for i in range(N):
    t = i / OUT_FPS
    state = get_state(t)
    cx, cy = cursor_positions[i]
    vx, vy = cursor_velocity[i]
    speed = math.sqrt(vx*vx + vy*vy)
    shake = shake_offset(t, seed=i)

    img = Image.fromarray(frames[i]).convert("RGBA")

    # parallax + shake
    parallax_x = -vx * 0.25
    parallax_y = -vy * 0.25
    sx = int(shake[0] + parallax_x)
    sy = int(shake[1] + parallax_y)
    if sx or sy:
        img = img.transform((W, H), Image.AFFINE, (1, 0, sx, 0, 1, sy), resample=Image.BICUBIC)

    # zoom + crop
    if state["zoom"] > 1.001:
        z = state["zoom"]
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

    # vignette
    vignette = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vignette)
    for r in range(int(W*0.5), 0, -10):
        a = int(60 * (1 - r / (W*0.5)))
        vd.ellipse([W//2 - r, H//2 - r, W//2 + r, H//2 + r], fill=a)
    black = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    black.putalpha(vignette)
    img = Image.alpha_composite(img, black)

    # panel glow + cand emphasis
    if state["panel_alpha"] > 0.05:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        alpha = int(40 * state["panel_alpha"])
        d.rectangle([W-640, 60, W-30, 850], outline=(255, 255, 255, alpha), width=2)
        img = Image.alpha_composite(img, overlay)

    y_starts = [200, 380, 560]
    y_ends = [360, 540, 720]
    for k, (y0, y1) in enumerate(zip(y_starts, y_ends)):
        a = state["cand_alpha"][k]
        if a < 0.05 or (W-620) >= W: continue
        crop = img.crop((W-620, y0, W-50, y1))
        bright = ImageEnhance.Brightness(crop).enhance(1.0 + 0.20 * a)
        img.paste(bright, (W-620, y0))

    if state["sel_pulse"] > 0.05:
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        alpha = int(70 * state["sel_pulse"])
        d.rectangle([130, 420, 1130, 445], fill=(100, 160, 255, alpha))
        img = Image.alpha_composite(img, overlay)

    img = img.convert("RGB")
    out_path = OUT_FRAMES / f"frame_{i:05d}.png"
    img.save(out_path, optimize=True)
    out_frames.append(out_path)

    if i % 10 == 0:
        print(f"  [{i:3d}/{N}] t={t:.2f}s z={state['zoom']:.2f} cursor=({cx:.0f},{cy:.0f}) speed={speed:.1f}")

print(f"== rendered {len(out_frames)} frames ==")

print("== ffmpeg encode ==")
subprocess.run([
    "ffmpeg", "-y",
    "-framerate", str(OUT_FPS),
    "-i", f"{OUT_FRAMES}/frame_%05d.png",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "slow",
    "-crf", "17",
    "-movflags", "+faststart",
    OUT_VIDEO,
], check=True, capture_output=True)

print(f"== DONE: {OUT_VIDEO} ==")
print(f"   duration: {len(out_frames)/OUT_FPS:.2f}s @ {OUT_FPS}fps")
