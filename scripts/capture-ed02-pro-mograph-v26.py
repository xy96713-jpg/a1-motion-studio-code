#!/usr/bin/env python3
"""
ED-02 v26 — 专业 motion graphics 后期
纯 ffmpeg + 表达式, 5 拍分镜 + 缓动 + 锐化
"""
import subprocess
import sys
from pathlib import Path

INPUT = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v24-real-cap/ed-02-real.mp4"
OUT_DIR = Path("/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v26-pro-mograph")
OUT = OUT_DIR / "v26-ed02-5beats.mp4"

OUT_DIR.mkdir(parents=True, exist_ok=True)

# 5 拍分镜: 总 3.45s = 207 帧 @ 60fps
# beat 1: 0-0.5s (frame 0-30) zoom 1.0
# beat 2: 0.5-1.0s (30-60) zoom 1.05 ease-out
# beat 3: 1.0-1.4s (60-84) zoom 1.05 hold
# beat 4: 1.4-1.8s (84-108) zoom 1.0 ease-out
# beat 5: 1.8-2.0s+ (108+) zoom 1.0 hold
#
# zoompan 表达式: t 已经是秒 (input t)
# 实际: zoompan 的 t 表达式基于 input PTS

# 简化方案: zoompan 用 d=207 让 input 1 帧变 1 帧, 表达式按 t (秒) 算
# input 60fps, 207 帧, t 范围 0-3.45s

# zoompan zoom 表达式 (按 t 秒, 5 拍):
def get_zoom_expr():
    # 简化: 用乘法 + sin 替代 pow
    # beat 1 (0-0.5s): z=1
    # beat 2 (0.5-1.0s): z 1 -> 1.05, ease-out (1-cos)
    # beat 3 (1.0-1.4s): z=1.05 hold
    # beat 4 (1.4-1.8s): z 1.05 -> 1.0, ease-out
    # beat 5 (1.8-3.45s): z=1.0 hold
    # 用 lerp: a + (b-a) * smoothstep(t)
    # smoothstep: t*t*(3-2t) 简单
    e = (
        "if(lt(t,0.5),1,"
        "if(lt(t,1.0),1+0.05*((t-0.5)/0.5)*((t-0.5)/0.5)*(3-2*(t-0.5)/0.5),"
        "if(lt(t,1.4),1.05,"
        "if(lt(t,1.8),1.05-0.05*((t-1.4)/0.4)*((t-1.4)/0.4)*(3-2*(t-1.4)/0.4),"
        "1.0"
        "))))"
    )
    return e

zoom_expr = get_zoom_expr()
print("zoom expr:", zoom_expr)

# === ffmpeg 命令 ===
cmd = [
    "ffmpeg", "-y",
    "-i", INPUT,
    "-vf",
    f"scale=3840:2160:flags=lanczos,"
    f"zoompan=z='{zoom_expr}':"
    f"x='iw/2-iw/(2*z)':y='ih/2-ih/(2*z)':"
    f"d=1:s=1920x1080:fps=60,"
    f"unsharp=3:3:0.4",
    "-an",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "17",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    str(OUT),
]
print("cmd:", " ".join(cmd[:5]) + " ...")
result = subprocess.run(cmd, capture_output=True, text=True)
print("stdout:", result.stdout[-1000:])
print("stderr:", result.stderr[-1000:])
print("returncode:", result.returncode)

if OUT.exists():
    size = OUT.stat().st_size
    print(f"== DONE: {OUT} ({size} bytes) ==")
    # probe
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=width,height,r_frame_rate",
         "-of", "default=noprint_wrappers=1", str(OUT)],
        capture_output=True, text=True
    )
    print("probe:", probe.stdout)
else:
    print("FAILED")
    sys.exit(1)
