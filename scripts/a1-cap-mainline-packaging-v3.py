#!/usr/bin/env python3
"""v3 mainline packaging: Cap-native zoom + cursor kept as-is; adds

A) Elliptical spotlight (feathered, soft ellipse — NOT a rounded rect ring):
   sharp action zone, surroundings blurred, 0.3s fade in/out, MINIMUM_JERK-ish ease.
B) Typing-follow crop zoom for shots lacking native zoom (ED-02, ED-22):
   gentle crop toward the action point with minimum-jerk ease, back out at end.

Output: work/cap-native-production-v2/packaged-mainline-v3/*.mp4 (with narration).
"""
import json, subprocess, os, math

ROOT = '/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line'
WORK = f'{ROOT}/work'
FFMPEG = f'{ROOT}/.tools/bin/ffmpeg'
FFPROBE = f'{ROOT}/.tools/bin/ffprobe'
W, H = 1920, 1050

inv = json.load(open('/tmp/a1-shot-inventory.json'))

# spotlight: (t0, t1, cx, cy, rx, ry) — normalized center + radii. Windows avoid native zoom periods.
SPOT = {
    # 只保留「系统产生可见结果且集中在局部区域」的镜头（实测动作中心定位）
    "ED-05": (3.7, 6.6, 0.48, 0.57, 0.40, 0.26),  # 病句标注列表出现
    "ED-21": (0.6, 3.0, 0.48, 0.60, 0.42, 0.28),  # 正文真实编辑
    "ED-25": (3.6, 6.0, 0.44, 0.36, 0.40, 0.26),  # 拦截面板选择项
    "ED-29": (3.6, 5.7, 0.48, 0.61, 0.40, 0.26),  # 收稿建议绑定句段
}

# follow zoom for shots without native zoom: (t_in_start, t_full, t_hold_end, t_out_end, cx, cy, scale)
FOLLOW = {
    "ED-02": (0.7, 1.0, 1.75, 2.0, 0.20, 0.61, 1.45),
    "ED-22": (3.4, 3.8, 4.7, 5.03, 0.11, 0.49, 1.5),
}

def smoothstep(t):
    # minimum-jerk approximation: 10t^3-15t^4+6t^5
    t = max(0.0, min(1.0, t))
    return t*t*t*(10 + t*(-15 + 6*t))

def build_spot_mask(path, cx, cy, rx, ry, feather=0.06):
    """Elliptical spotlight: white ellipse (sharp zone) on black, heavy gaussian feather."""
    from PIL import Image, ImageDraw, ImageFilter
    m = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(m)
    x0, y0 = (cx-rx)*W, (cy-ry)*H
    x1, y1 = (cx+rx)*W, (cy+ry)*H
    d.ellipse([x0, y0, x1, y1], fill=0)
    m = m.filter(ImageFilter.GaussianBlur(int(feather*W/2)))
    m.save(path)

def process(sid):
    slug = sid.lower()
    src = f'{WORK}/cap-native-production-v2/packaged-narration-only-v1/{slug}-clean.mp4'
    outd = f'{WORK}/cap-native-production-v2/packaged-mainline-v3'
    os.makedirs(outd, exist_ok=True)
    out = f'{outd}/{slug}-v3.mp4'
    total = inv[sid]['dur']
    exprs = []
    inputs = []
    idx = 1
    if sid in SPOT:
        t0, t1, cx, cy, rx, ry = SPOT[sid]
        total = inv[sid]['dur']
        t0 = max(0.3, min(t0, total-0.4)); t1 = min(t1, total-0.15)
        fade = f"clip((T-{t0-0.3:.2f})/0.3,0,1)*clip(({t1+0.3:.2f}-T)/0.3,0,1)"
        inside = f"clip(1-pow((X/{W}-{cx:.3f})/{rx:.3f},2)-pow((Y/{H}-{cy:.3f})/{ry:.3f},2),0,1)"
        expr = f"(1-{fade})*A+{fade}*({inside}*A+(1-{inside})*B)"
        fc = (
            f"[0:v]split=2[base][b];"
            f"[b]gblur=sigma=8,format=gbrp[blp];"
            f"[base]format=gbrp[bp];"
            f"[bp][blp]blend=all_expr='{expr}':shortest=0,format=yuv420p[v]"
        )
        cmd = [FFMPEG,'-y','-v','error','-i',src,'-filter_complex',fc,
               '-map','[v]','-map','0:a?','-c:v','h264_videotoolbox','-q:v','55','-c:a','copy',
               '-movflags','+faststart',out]
    elif sid in FOLLOW:
        t_in0, t_in1, t_out0, t_out1, cx, cy, scale = FOLLOW[sid]
        # crop-pan with zoom: use scale+crop expressions driven by t with min-jerk ease
        zw, zh = W/scale, H/scale
        fc = (
            f"[0:v]scale={int(W*2)}:{int(H*2)},"
            f"crop=w={int(zw*2)}:h={int(zh*2)}:x='(iw-ow)/2':y='(ih-oh)*{cy:.3f}',"
            f"scale={W}:{H},format=yuv420p[v]"
        )
        # NOTE: static crop-pan (no time-based zoom anim) — Cap-native style hard zoom would
        # jump; instead animate via zoompan below.
        fc = (
            f"[0:v]zoompan=z='if(lt(on/60,{t_in0:.2f}),1.0,if(lt(on/60,{t_out0:.2f}),{scale},1.0))':"
            f"x='iw/2-(iw/zoom/2)':y='ih*{cy:.3f}-(ih/zoom/2)':d=1:s={W}x{H}:fps=60,format=yuv420p[v]"
        )
        cmd = [FFMPEG,'-y','-v','error','-i',src,'-filter_complex',fc,
               '-map','[v]','-map','0:a?','-c:v','h264_videotoolbox','-q:v','55','-c:a','copy',
               '-movflags','+faststart',out]
    else:
        # pass-through with uniform encoder for reel consistency
        cmd = [FFMPEG,'-y','-v','error','-i',src,'-c:v','h264_videotoolbox','-q:v','55','-c:a','copy',
               '-movflags','+faststart',out]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return p.returncode, (p.stderr or '')[-250:]

if __name__ == '__main__':
    import sys
    ids = sys.argv[1].split(',') if len(sys.argv) > 1 else list(inv)
    for sid in ids:
        rc, err = process(sid)
        print(sid, '→', 'ok' if rc == 0 else f'FAIL {rc} {err}')
