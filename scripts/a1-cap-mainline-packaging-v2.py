#!/usr/bin/env python3
"""v2 packaging per the established A1 mainline grammar (A1ScreenBeatProgram style):

- NO rings, NO boxes, NO labels (noEngineeringLabels)
- Focus = rounded gradient mask: target region sharp, rest softly blurred
  (ROUNDED_GRADIENT_MASK_CLEAR_TARGET_OVER_BLURRED_REAL_SURROUNDINGS)
- One primary move per scene; zoom already burned in by Cap
- Keep narration mix from packaged-narrated-v1
"""
import json, subprocess, os, sys

ROOT = '/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line'
WORK = f'{ROOT}/work'
FFMPEG = f'{ROOT}/.tools/bin/ffmpeg'
FFPROBE = f'{ROOT}/.tools/bin/ffprobe'

FOCUS = {
    "ED-02": {"rect": (0.055, 0.40, 0.62, 0.42), "t0": 0.9, "t1": 2.0},
    "ED-04": {"rect": (0.48, 0.52, 0.40, 0.34), "t0": 1.7, "t1": 6.2},
    "ED-25": {"rect": (0.62, 0.12, 0.34, 0.30), "t0": 1.6, "t1": 5.9},
    "ED-26": {"rect": (0.03, 0.55, 0.40, 0.42), "t0": 3.2, "t1": 7.4},
    "ED-28": {"rect": (0.03, 0.28, 0.44, 0.50), "t0": 13.6, "t1": 15.3},
    "ED-21": {"rect": (0.03, 0.40, 0.66, 0.36), "t0": 5.2, "t1": 7.7},
    "ED-23": {"rect": (0.03, 0.30, 0.60, 0.48), "t0": 0.4, "t1": 3.4},
}

def dur(p):
    o = subprocess.run([FFPROBE,'-v','error','-show_entries','format=duration','-of','json',p],capture_output=True,text=True)
    return float(json.loads(o.stdout)['format']['duration'])

def mask_png(path, rect, W=1920, H=1050, radius=36, feather=24):
    """White rounded rect with feathered edge on black = alpha map for sharp target."""
    from PIL import Image, ImageDraw, ImageFilter
    x, y, w, h = rect
    x0, y0 = int(x*W), int(y*H)
    x1, y1 = int((x+w)*W), int((y+h)*H)
    m = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=0)
    m = m.filter(ImageFilter.GaussianBlur(feather))
    m.save(path)

def process(sid):
    slug = sid.lower()
    src = f'{WORK}/cap-native-production-v2/packaged-narrated-v1/{slug}-final.mp4'
    out_dir = f'{WORK}/cap-native-production-v2/packaged-mainline-v2'
    os.makedirs(out_dir, exist_ok=True)
    out = f'{out_dir}/{slug}-mainline.mp4'
    total = dur(src)
    if sid not in FOCUS:
        # no focus beat: straight re-encode pass-through for uniform reel
        p = subprocess.run([FFMPEG,'-y','-v','error','-i',src,'-c:v','h264_videotoolbox','-q:v','55',
                            '-c:a','copy','-movflags','+faststart',out],capture_output=True,text=True,timeout=120)
        return p.returncode, total
    fx = FOCUS[sid]
    t0, t1 = fx['t0'], min(fx['t1'], total-0.1)
    d = t1 - t0
    mask = f'/tmp/a1-mainline-mask-{slug}.png'
    mask_png(mask, fx['rect'])
    # sharp target over blurred surroundings, with quick fade in/out of the blur (0.25s)
    fc = (
        f"[0:v]split=2[base][b];"
        f"[b]gblur=sigma=7[bl];"
        f"[bl][1:v]alphamerge[focusshape];"
        # outside-mask = blurred, inside = base sharp: use maskedmerge(blurred, sharp, mask)
        f"[bl][base][1:v]maskedmerge[comp];"
        f"[comp]format=yuv420p[v]"
    )
    # simpler: maskedmerge expects same format; do it directly
    fc = (
        f"[0:v]split=2[base][b];"
        f"[b]gblur=sigma=7,format=gbrp[bl];"
        f"[base]format=gbrp[bs];"
        f"[1:v]format=gray[mask];"
        f"[bl][bs][mask]maskedmerge[comp];"
        f"[comp]format=yuv420p,volume=0[v]"
    )
    # blur-with-feathered-hole, faded in/out: mask video has alpha fade baked
    mv = f'/tmp/a1-mainline-maskvid-{slug}.mp4'
    subprocess.run([FFMPEG,'-y','-v','error','-loop','1','-t',f'{total:.3f}','-i',mask,'-vf',
        f"format=gray,geq=lum='if(lt(X\\,0)||gt(X\\,W)||lt(Y\\,0)||gt(Y\\,H),0,255)'",
        '-f','null','-'], capture_output=True)
    subprocess.run([FFMPEG,'-y','-v','error','-loop','1','-t',f'{total:.3f}','-i',mask,
        '-vf', f"format=yuva420p,colorchannelmixer=aa=1.0,fade=t=in:st={t0-0.25:.2f}:d=0.25:alpha=1,fade=t=out:st={t1:.2f}:d=0.25:alpha=1,fps=60",
        '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuva420p',mv], capture_output=True, timeout=120)
    fc = (
        f"[0:v]split=2[base][b];"
        f"[b]gblur=sigma=7[bl];"
        f"[bl][1:v]alphamerge[comp];"
        f"[base][comp]overlay=shortest=0,format=yuv420p[v]"
    )
    cmd = [FFMPEG,'-y','-v','error','-i',src,'-i',mv,'-filter_complex',fc,'-map','[v]','-map','0:a?',
           '-c:v','h264_videotoolbox','-q:v','55','-c:a','copy','-movflags','+faststart',out]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    return p.returncode, total, (p.stderr or '')[-300:]

if __name__ == '__main__':
    ids = sys.argv[1].split(',') if len(sys.argv) > 1 else list(json.load(open('/tmp/a1-narr/speech-durs.json')))
    for sid in ids:
        r = process(sid)
        print(sid, '→', r[0] == 0 and 'ok' or f'FAIL {r}')
