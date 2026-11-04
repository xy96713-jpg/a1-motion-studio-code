#!/usr/bin/env python3
"""
ED-X batch production
=====================
从 workspace.json 提 13 镜 SCREEN_EVIDENCE, 批量渲染
所有镜共用同一 cap 底片 (cap-base-2s.mp4), 不同 beats
"""
import json
import subprocess
import sys
from pathlib import Path

WS = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"
INPUT = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/edx-batch/cap-base-2s.mp4"
OUT_DIR = Path("/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/edx-batch")
SCRIPT = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/scripts/edx-pipeline.py"

# 默认 5 拍模板 (BEFORE/HOLD/AFTER)
# 不同镜 cx/cy 不同 (target sentence position)
# 默认 beats: 0.0-0.3s z=1.0 center, 0.3-0.8s z=1.0->1.04 push in, 0.8-1.5s z=1.04 hold, 1.5-1.85s z=1.04->1.0 pull out, 1.85-2.0s z=1.0 hold
DEFAULT_BEATS = [
    (0.00, 0.30, 1.00, 1.00, 0.50, 0.50),  # BEFORE establish
    (0.30, 0.80, 1.00, 1.04, 0.32, 0.45),  # BEFORE→HOLD push
    (0.80, 1.50, 1.04, 1.04, 0.32, 0.45),  # HOLD hold
    (1.50, 1.85, 1.04, 1.00, 0.50, 0.50),  # HOLD→AFTER pull
    (1.85, 2.00, 1.00, 1.00, 0.50, 0.50),  # AFTER hold
]
DEFAULT_EASES = ["linear", "ease-in-out", "linear", "ease-in-out", "linear"]


def main():
    d = json.load(open(WS))
    shots = d['production']['shotIntelligence']['currentStoryboardAuthority']['shots']

    # 13 镜 SCREEN_EVIDENCE
    ed_shots = [s for s in shots if s.get('route') == 'SCREEN_EVIDENCE']
    print(f"=== {len(ed_shots)} SCREEN_EVIDENCE shots ===")

    # 写 config JSON per shot (默认 beats)
    for s in ed_shots:
        sid = s['shotId']
        out = OUT_DIR / f"{sid.lower()}-cine.mp4"
        cfg = OUT_DIR / f"{sid.lower()}-config.json"
        cfg.write_text(json.dumps({
            "beats": DEFAULT_BEATS,
            "eases": DEFAULT_EASES,
        }, ensure_ascii=False, indent=2))
        print(f"  cfg: {cfg}")

    # 批量跑
    results = []
    for s in ed_shots:
        sid = s['shotId']
        out = OUT_DIR / f"{sid.lower()}-cine.mp4"
        cfg = OUT_DIR / f"{sid.lower()}-config.json"
        tr = s.get('timeRange', {}) or {}
        duration_ms = tr.get('durationMs', 2000)

        # 先 loop cap 底片到目标时长 (如果 cap 底片不够长)
        cap_target = OUT_DIR / f"{sid.lower()}-cap-loop.mp4"
        target_sec = duration_ms / 1000
        loop_cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1",
            "-i", INPUT,
            "-t", str(target_sec),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "18",
            str(cap_target),
        ]
        loop_result = subprocess.run(loop_cmd, capture_output=True, text=True)

        if cap_target.exists():
            cmd = [
                "python3", SCRIPT,
                "--input", str(cap_target),
                "--output", str(out),
                "--shot-id", sid,
                "--duration-ms", str(duration_ms),
                "--fps", "60",
                "--config", str(cfg),
            ]
            print(f"\n=== {sid} ({duration_ms}ms) ===")
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                print(f"  OK: {out}")
                results.append((sid, "OK", str(out)))
            else:
                print(f"  FAIL: {result.stderr[-500:]}")
                results.append((sid, "FAIL", result.stderr[-500:]))
        else:
            results.append((sid, "FAIL-LOOP", loop_result.stderr[-200:]))

    print("\n=== SUMMARY ===")
    for sid, status, info in results:
        print(f"  {sid}: {status}")

    # 列文件
    print("\n=== FILES ===")
    for f in sorted(OUT_DIR.glob("ed-*-cine.mp4")):
        size = f.stat().st_size
        # 取 ffprobe duration
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(f)],
            capture_output=True, text=True
        )
        dur = probe.stdout.strip()
        print(f"  {f.name}: {size} bytes, {dur}s")


if __name__ == "__main__":
    main()
