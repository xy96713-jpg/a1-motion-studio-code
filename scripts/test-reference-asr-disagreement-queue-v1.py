#!/usr/bin/env python3
import json
import subprocess
import sys
import tempfile
from pathlib import Path


script = Path(__file__).with_name("build-reference-asr-disagreement-queue-v1.py")
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    plan_path, asr_path, output_path = (root / name for name in ("plan.json", "asr.json", "queue.json"))
    video_sha = "a" * 64
    plan = {
        "source": {"videoSha256": video_sha, "durationSeconds": 4},
        "spokenCues": [
            {"index": 0, "startMs": 0, "endMs": 1000, "text": "机器"},
            {"index": 1, "startMs": 1000, "endMs": 2000, "text": "正常"},
        ],
    }
    crosscheck = {
        "contract": "A1ReferenceSpeechCrosscheck/v1", "sourceVideoSha256": video_sha,
        "sourceAudioSha256": "b" * 64, "model": "local-fixture",
        "segments": [
            {"startMs": 0, "endMs": 1000, "text": "积极"},
            {"startMs": 1000, "endMs": 2000, "text": "正常"},
        ],
    }
    plan_path.write_text(json.dumps(plan), encoding="utf-8")
    asr_path.write_text(json.dumps(crosscheck), encoding="utf-8")
    command = [sys.executable, str(script), "--plan", str(plan_path), "--crosscheck", str(asr_path), "--output", str(output_path)]
    subprocess.run(command, check=True, capture_output=True, text=True)
    result = json.loads(output_path.read_text(encoding="utf-8"))
    assert result["disagreementCount"] == result["reviewWindowCount"] == 1
    assert result["items"][0]["cueIds"] == [0]
    assert result["items"][0]["reviewWindowMs"] == [0, 1500]
    assert result["approvedCopyCount"] == 0
    crosscheck["sourceVideoSha256"] = "c" * 64
    asr_path.write_text(json.dumps(crosscheck), encoding="utf-8")
    assert subprocess.run(command, capture_output=True).returncode != 0
print(json.dumps({"status": "PASS", "checks": 5}))
