#!/usr/bin/env python3
"""Purity gate for A1 Capture display recordings.

Detects known overlay pollution on the A1 Capture virtual display (display 2):
  1. macOS TCC dialog  (universalAccessAuthWarn yellow-lock)
  2. ChatGPT companion mascot/bubble (bottom-right)

Usage:
  purity_gate.py shot            # capture the live display now, check, exit 0/7
  purity_gate.py frames <dir>    # check every frame image in a directory
  purity_gate.py video <mp4> [n] # sample n frames (default 5) from mp4 and check

Exit codes: 0 = pure, 7 = polluted (prints JSON verdict), other = tool error.
"""
import json
import os
import subprocess
import sys
import tempfile
import time

# --- fingerprint thresholds (calibrated 2026-09-03 on /tmp/a1cap-now.png:
#     dialog-yellow-max-row 285 -> 0 when gone; mascot-blue 209 -> 0 when gone) ---

DIALOG_YELLOW_MAX_ROW = 15      # >= -> dialog present (calibrated: 29 on polluted, 0 clean)
MASCOT_BLUE_MIN = 40            # >= -> mascot/bubble present

DIALOG_ZONE = (620, 260, 1340, 470)   # x0,y0,x1,y1 yellow-lock strip
MASCOT_ZONE = (1650, 760, 1920, 1010) # x0,y0,x1,y1 bottom-right mascot+bubble


def _is_dialog_yellow(px):
    r, g, b = px
    return r > 170 and 110 < g < 200 and b < 90


def _is_mascot_blue(px):
    # Real mascot gradient blue: b>=224, b-g>=96 (calibrated 2026-09-03:
    # mascot (64-128, 96-160, 224-240) vs product UI cyan accept-buttons
    # (0,128,192) which must NOT match).
    r, g, b = px
    return b > 200 and b > r + 100 and b > g + 60


def check_image(path):
    from PIL import Image
    im = Image.open(path).convert("RGB")
    if im is None:
        raise ValueError(f"cannot open image: {path}")
    w, h = im.size
    sx, sy = w / 1920.0, h / 1080.0
    px = im.load()
    if px is None:
        raise ValueError(f"cannot load pixels: {path}")

    x0, y0, x1, y1 = DIALOG_ZONE
    dmax = 0
    for yy in range(int(y0 * sy), int(y1 * sy)):
        row = sum(
            1
            for xx in range(int(x0 * sx), int(x1 * sx))
            if _is_dialog_yellow(px[xx, yy])
        )
        dmax = max(dmax, row)

    x0, y0, x1, y1 = MASCOT_ZONE
    m = 0
    for yy in range(int(y0 * sy), int(y1 * sy), 2):
        for xx in range(int(x0 * sx), int(x1 * sx), 2):
            if _is_mascot_blue(px[xx, yy]):
                m += 1

    return {
        "dialog_yellow_max_row": dmax,
        "mascot_blue": m,
        "dialog": dmax >= DIALOG_YELLOW_MAX_ROW,
        "mascot": m >= MASCOT_BLUE_MIN,
    }


def verdict(result):
    return not (result["dialog"] or result["mascot"])


def check_live_display(display_id=2):
    fd, tmp = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        subprocess.run(
            ["screencapture", "-x", "-D", str(display_id), tmp],
            check=True,
            timeout=30,
        )
        result = check_image(tmp)
        result["source"] = f"display-{display_id}"
    finally:
        os.unlink(tmp)
    return result


def heal_dialog(max_attempts=3):
    """Kill the TCC auth dialog process (non-destructive; re-prompts later).
    SIGKILL: plain pkill(SIGTERM) hangs on SIGSTOPped dialog processes."""
    healed = False
    for _ in range(max_attempts):
        r = check_live_display()
        if not r["dialog"]:
            return True, healed
        subprocess.run(["pkill", "-9", "-f", "universalAccessAuthWarn"], capture_output=True)
        subprocess.run(["pkill", "-9", "-f", "UserNotificationCenter"], capture_output=True)
        time.sleep(2)
        healed = True
    r = check_live_display()
    return not r["dialog"], healed


def sample_video(mp4, n=5):
    out_dir = tempfile.mkdtemp(prefix="purity-frames-")
    subprocess.run(
        [
            "ffmpeg",
            "-i",
            mp4,
            "-vf",
            f"fps={max(1, n // 3)}/1,scale=1920:1080",
            "-frames:v",
            str(n),
            os.path.join(out_dir, "f%02d.png"),
        ],
        check=True,
        timeout=120,
        capture_output=True,
    )
    frames = sorted(os.listdir(out_dir))
    results = []
    for f in frames:
        r = check_image(os.path.join(out_dir, f))
        r["frame"] = f
        results.append(r)
    return results


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "shot"
    if mode == "heal":
        ok, healed = heal_dialog()
        r = check_live_display()
        print(
            json.dumps(
                {
                    "pure": verdict(r),
                    "healed": healed,
                    "dialog": r["dialog"],
                    "mascot": r["mascot"],
                },
                ensure_ascii=False,
            )
        )
        return 0 if verdict(r) else 7
    if mode == "shot":
        r = check_live_display()
        results = [r]
    elif mode == "frames":
        d = sys.argv[2]
        results = []
        for f in sorted(os.listdir(d)):
            if f.lower().endswith((".png", ".jpg")):
                r = check_image(os.path.join(d, f))
                r["frame"] = f
                results.append(r)
    elif mode == "video":
        mp4 = sys.argv[2]
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 5
        results = sample_video(mp4, n)
    else:
        print(f"unknown mode: {mode}", file=sys.stderr)
        return 2

    polluted = [r for r in results if not verdict(r)]
    print(
        json.dumps(
            {
                "pure": not polluted,
                "checked": len(results),
                "polluted": polluted,
                "worst": {
                    "dialog_yellow_max_row": max(r["dialog_yellow_max_row"] for r in results),
                    "mascot_blue": max(r["mascot_blue"] for r in results),
                },
            },
            ensure_ascii=False,
        )
    )
    return 7 if polluted else 0


if __name__ == "__main__":
    sys.exit(main())
