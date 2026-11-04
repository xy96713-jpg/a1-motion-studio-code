#!/usr/bin/env python3
"""Overlay packaging pass for wave15 cap-native shots.

Adds mature demo-style motion packaging that the installed Cap 0.5.9 renderer
does not support (click ripples + annotations ship only in unreleased main):

1. click ripple   — expanding ring at each real down-click (from cursor.json)
2. focus pulse    — soft rectangle highlight around the frame's focal region
                    during its authority cue window (semantic binding)

Overlays are additive compositing on the pure Cap exports; the purity gate
still runs on the final packaged mp4. Coordinates: cursor.json stores
normalized 0-1 display coords; the mp4 canvas is 1920x1050 (content area).
"""

import json
import os
import subprocess
import sys

WORK = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work"
FFMPEG = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/.tools/bin/ffmpeg"
SHOTS = ["ED-02","ED-03","ED-04","ED-05","ED-06","ED-21","ED-22","ED-23","ED-24","ED-25","ED-26","ED-27","ED-28","ED-29","ED-30"]

W, H = 1920, 1050

# Focus regions per shot (normalized x,y,w,h + window) — bound to authority cues.
# Only shots where a UI focal element benefits; coordinates verified against
# writing-workbench-page-identity.png layouts.
FOCUS = {
    "ED-02": {"rect": (0.055, 0.40, 0.62, 0.42), "t0": 0.9, "t1": 2.6},
    "ED-04": {"rect": (0.48, 0.52, 0.40, 0.34), "t0": 1.7, "t1": 6.2},
    "ED-25": {"rect": (0.62, 0.12, 0.34, 0.30), "t0": 1.6, "t1": 5.9},
    "ED-26": {"rect": (0.03, 0.55, 0.40, 0.42), "t0": 3.2, "t1": 7.8},
    "ED-28": {"rect": (0.03, 0.28, 0.44, 0.50), "t0": 13.6, "t1": 16.9},
    "ED-21": {"rect": (0.03, 0.40, 0.66, 0.36), "t0": 5.2, "t1": 8.5},
    "ED-23": {"rect": (0.03, 0.30, 0.60, 0.48), "t0": 0.4, "t1": 3.4},
}


def ripple_filter(events, out_w=W):
    """Chain overlays: each ring input overlays the previous chain output."""
    filters = []
    prev = "0:v"
    idx = 1
    for i, ev in enumerate(events):
        cx = ev["x"] * out_w
        cy = ev["y"] * H
        t0 = ev["t"]
        # three stepped rings (0.2s each) with alpha ramp baked into the PNGs
        for k, (scale, alpha) in enumerate([(0.45, 200), (0.75, 130), (1.1, 60)]):
            s0 = t0 + k * 0.2
            s1 = s0 + 0.2
            d = int(64 * scale)
            outl = f"v{idx}"
            filters.append(
                f"[{prev}][{idx}:v]overlay=x={cx:.0f}-{d//2}:y={cy:.0f}-{d//2}:"
                f"enable='between(t,{s0:.3f},{s1:.3f})'[{outl}];"
            )
            prev = outl
            idx += 1
    return filters, prev


def build_ring_pngs(directory):
    """Three alpha-stepped orange ring PNGs via PIL."""
    os.makedirs(directory, exist_ok=True)
    from PIL import Image, ImageDraw

    paths = []
    specs = [(0.45, 200), (0.75, 130), (1.1, 60)]
    for idx, (scale, alpha) in enumerate(specs):
        d = int(64 * scale)
        img = Image.new("RGBA", (d * 2, d * 2), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        # two rings for depth
        draw.ellipse(
            [d - 34, d - 34, d + 34, d + 34],
            outline=(155, 81, 224, alpha),
            width=5,
        )
        p = os.path.join(directory, f"ring{idx}.png")
        img.save(p)
        paths.append(p)
    return paths


def process_shot(sid, events, focus, out_path):
    slug = sid.lower().replace("-", "")
    src = f"{WORK}/cap-native-{slug}-engine-v1/{sid.lower()}-current-storyboard-960x540.mp4"
    ring_dir = "/tmp/a1-rings"
    rings = build_ring_pngs(ring_dir)

    # Give each ring PNG a short -t window (start of its enable range) so the
    # overlay filter never processes infinite looped streams — this is what
    # made the first attempt encode for 6 minutes on a 6s video.
    cmd = [FFMPEG, "-y", "-v", "error"]
    cmd += ["-i", src]
    idx = 0
    for ev in events:
        for k in range(3):
            s0 = ev["t"] + k * 0.2
            cmd += ["-loop", "1", "-framerate", "30", "-t", f"{max(s0 + 0.35, 1.0):.3f}", "-i", rings[k]]
            idx += 1

    graph = ""
    if events:
        chain, last = ripple_filter(events)
        graph += "".join(chain)
    else:
        graph = "[0:v]null[vlast];"
        last = "vlast"

    if focus:
        rx, ry, rw, rh = focus["rect"]
        t0, t1 = focus["t0"], focus["t1"]
        # focus pulse: double rectangle border via drawbox, alpha via color hex + enable
        x = int(rx * W); y = int(ry * H)
        w = int(rw * W); h = int(rh * H)
        pulse = f"[{last}]drawbox=x={x}:y={y}:w={w}:h={h}:color=#9b51e0@0.9:thickness=3:enable='between(t,{t0},{t1})',"
        pulse += f"drawbox=x={x-6}:y={y-6}:w={w+12}:h={h+12}:color=#9b51e0@0.4:thickness=2:enable='between(t,{t0},{t1})'[vout]"
    else:
        pulse = f"[{last}]null[vout]"

    graph += pulse
    cmd += ["-filter_complex", graph, "-map", "[vout]", "-c:v", "h264_videotoolbox", "-q:v", "55", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
    except subprocess.TimeoutExpired:
        return 124, "encode-timeout"
    return p.returncode, (p.stderr or "")[-300:]


def main():
    only = sys.argv[1].split(",") if len(sys.argv) > 1 else SHOTS
    clicks = json.load(open("/tmp/click-events.json"))
    out_root = f"{WORK}/cap-native-production-v2/packaged-overlays-v1"
    os.makedirs(out_root, exist_ok=True)
    for sid in only:
        events = clicks.get(sid, [])
        # dedupe double-fired down events <80ms apart at same position
        dedup = []
        for e in events:
            if dedup and abs(e["t"] - dedup[-1]["t"]) < 0.08 and abs(e["x"] - dedup[-1]["x"]) < 0.01:
                continue
            dedup.append(e)
        out = f"{out_root}/{sid.lower()}-packaged.mp4"
        rc, err = process_shot(sid, dedup, FOCUS.get(sid), out)
        size = os.path.getsize(out) if os.path.exists(out) else 0
        print(f"{sid}: rc={rc} size={round(size/1e6,1)}MB {err if rc else ''}")


if __name__ == "__main__":
    main()
