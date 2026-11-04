#!/usr/bin/env python3
"""
A1 Wave15 mainline cut — deterministic build entry point.

Reads work/cap-native-production-v2/MAINLINE-V4-MANIFEST.json and rebuilds:
  1. per-shot validation (existence, sha256_16, duration tolerance)
  2. purity gate per shot (scripts/a1-cap-purity-gate.py video ... 6)
  3. normalized concat reel (60fps yuv420p, AAC)
  4. full-reel decode (zero decode errors required)
  5. reel purity (12 frames)
  6. Resolve EDL json (in/out times, narration bindings)
  7. build report + append cost/quality ledger line

Production rule: shots must be Cap-native evidence. Headless captures are
calibration-only and must never appear in the manifest.

Usage:
  python3 scripts/build-wave15-mainline-cut-v1.py            # verify+build
  python3 scripts/build-wave15-mainline-cut-v1.py --verify   # gates only
"""
import argparse, hashlib, json, os, subprocess, sys, time, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(ROOT, "work/cap-native-production-v2")
MANIFEST = os.path.join(B, "MAINLINE-V4-MANIFEST.json")
GATE = os.path.join(ROOT, "scripts/a1-cap-purity-gate.py")
FFMPEG = os.path.join(ROOT, ".tools/bin/ffmpeg")
FFPROBE = os.path.join(ROOT, ".tools/bin/ffprobe")
LEDGER = os.path.join(B, "mainline-build-ledger.jsonl")
DUR_TOL = 0.2
PURITY_FRAMES = 6
REEL_PURITY_FRAMES = 12

ORDER = ["ED-02","ED-03","ED-04","ED-05","ED-06","ED-21","ED-22","ED-23",
         "ED-24","ED-25","ED-26","ED-27","ED-28","ED-29","ED-30"]

def run(cmd, timeout=600, check=True):
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and p.returncode != 0:
        raise RuntimeError(f"cmd failed rc={p.returncode}: {' '.join(cmd[:3])}...\n{p.stderr[-800:]}")
    return p

def sha16(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]

def duration(p):
    o = json.loads(run([FFPROBE,"-v","error","-show_entries","format=duration","-of","json",p]).stdout)
    return float(o["format"]["duration"])

# v4 concat contract: every shot must be CFR 60fps at time_base 1/15360 with
# yuv420p. A videotoolbox export can ship time_base 1/90000 / VFR (raw display
# capture is 240fps); mixing one such file into `concat -c copy` silently
# stretches the video track (observed: 113s source -> 340s reel while the AAC
# stayed 116s). We detect any non-conforming shot, transcode it once to a
# normalized sibling, and concat only normalized files.
CANON_TIME_BASE = "1/15360"
CANON_FPS = 60
NORM_DIR_NAME = ".build-normalized"

def stream_info(p):
    o = json.loads(run([FFPROBE,"-v","error","-select_streams","v:0",
        "-show_entries","stream=codec_name,time_base,r_frame_rate,avg_frame_rate,nb_frames,width,height,pix_fmt",
        "-of","json",p]).stdout)
    return o["streams"][0]

def conforms(st, dur):
    try:
        fps_num, fps_den = st.get("r_frame_rate","0/1").split("/")
        fps = float(fps_num)/float(fps_den)
    except Exception:
        fps = 0.0
    nbf = int(st.get("nb_frames") or 0)
    # Frame-count slack follows the duration tolerance (DUR_TOL): a CFR60 clip
    # with a slightly non-round duration (ED-06: 317 frames vs 320 nominal over
    # 5.33s) is perfectly concat-safe; only timebase/fps/pixfmt divergence
    # (videotoolbox 1/90000 VFR) actually stretches the reel.
    frame_slack = max(3, int(round(DUR_TOL*CANON_FPS))+1)
    expect_frames = round(dur*CANON_FPS)
    return (st.get("time_base") == CANON_TIME_BASE
            and abs(fps-CANON_FPS) < 0.01
            and st.get("pix_fmt") == "yuv420p"
            and abs(nbf-expect_frames) <= frame_slack)

def normalize_shot(src, sid):
    ndir = os.path.join(B, NORM_DIR_NAME)
    os.makedirs(ndir, exist_ok=True)
    out = os.path.join(ndir, f"{sid.lower()}-v4-norm.mp4")
    run([FFMPEG,"-y","-v","error","-i",src,
         "-vf",f"fps={CANON_FPS},format=yuv420p,setpts=N/({CANON_FPS}*TB)",
         "-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-an",out],
        timeout=590)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true")
    args = ap.parse_args()
    t_start = time.time()
    m = json.load(open(MANIFEST))
    assert m.get("singleSourceOfTruth") is True, "manifest is not marked single source of truth"
    shots = m["shots"]
    failures, warnings, verified = [], [], []

    for sid in ORDER:
        rec = shots[sid]
        path = os.path.join(ROOT, rec["file"])
        if not os.path.exists(path):
            failures.append(f"{sid}: missing {rec['file']}"); continue
        got_sha = sha16(path)
        if got_sha != rec["sha256_16"]:
            failures.append(f"{sid}: sha mismatch manifest={rec['sha256_16']} got={got_sha}")
        dur = duration(path)
        if abs(dur - rec["duration_s"]) > DUR_TOL:
            failures.append(f"{sid}: duration drift manifest={rec['duration_s']} got={dur:.3f}")
        g = run(["python3", GATE, "video", path, str(PURITY_FRAMES)], timeout=120, check=False)
        if g.returncode != 0:
            failures.append(f"{sid}: purity POLLUTED")
        # Event-pixel evidence: hard fail unless the manifest explicitly marks
        # the shot as a known-defective provisional (e.g. ED-24 pending recapture).
        eg = run(["python3", os.path.join(ROOT,"scripts/a1-shot-event-pixel-evidence-gate.py"), sid],
                 timeout=180, check=False)
        if eg.returncode != 0:
            if rec.get("qualityStatus") == "PROVISIONAL_DEFECTIVE":
                warnings.append(f"{sid}: known defective event evidence (provisional, recapture pending)")
            else:
                failures.append(f"{sid}: event-pixel evidence missing")
        # Timebase/CFR conformance: normalize any VFR/odd-timebase source so the
        # concat demuxer cannot stretch the video track (ED-24 videotoolbox class).
        st = stream_info(path)
        concat_path = path
        if not conforms(st, dur):
            concat_path = normalize_shot(path, sid)
            nd = duration(concat_path)
            nst = stream_info(concat_path)
            if not conforms(nst, nd) or abs(nd-dur) > DUR_TOL:
                failures.append(f"{sid}: normalization failed to conform (dur {nd:.3f}, tb {nst.get('time_base')})")
                concat_path = path
            else:
                warnings.append(f"{sid}: non-conformant source tb={st.get('time_base')} fps={st.get('r_frame_rate')} -> normalized CFR60/1-15360 for concat")
        verified.append({"shot": sid, "file": rec["file"], "concatFile": os.path.relpath(concat_path, ROOT),
                         "sha256_16": got_sha,
                         "duration_s": round(dur, 3)})
        print(f"  gate {sid}: sha+{got_sha[:8]} dur={dur:.2f} purity={'OK' if g.returncode==0 else 'FAIL'}")
    if failures:
        print("GATE FAILURES:"); [print(" -", x) for x in failures]; sys.exit(2)
    if warnings:
        print("WARNINGS (non-blocking, manifest-acknowledged):")
        [print(" ~", x) for x in warnings]
    print(f"per-shot gates: {len(verified)}/{len(ORDER)} pass")
    if args.verify:
        print("--verify: build skipped"); return

    reel = os.path.join(ROOT, m["reel"])
    concat_txt = os.path.join(B, ".build-concat.txt")
    with open(concat_txt, "w") as f:
        for rec in verified:
            f.write(f"file '{os.path.join(ROOT, rec['concatFile'])}'\n")
    expected_dur = round(sum(r["duration_s"] for r in verified), 3)
    p = run([FFMPEG,"-y","-v","error","-f","concat","-safe","0","-i",concat_txt,
             "-vf","fps=60,format=yuv420p","-r","60",
             "-c:v","h264_videotoolbox","-q:v","55","-c:a","aac","-b:a","128k",
             "-movflags","+faststart",reel], timeout=590)
    reel_dur = duration(reel)
    print(f"reel built: {reel_dur:.2f}s {os.path.getsize(reel)/1e6:.1f}MB (sum of shots {expected_dur:.2f}s)")
    # Fail closed on any timebase/concat stretch: reel must equal the shot sum.
    if abs(reel_dur-expected_dur) > 0.3:
        failures.append(f"reel duration {reel_dur:.3f}s != shot sum {expected_dur:.3f}s (concat timebase stretch?)")

    dec = run([FFMPEG,"-v","error","-i",reel,"-f","null","-"], timeout=300, check=False)
    decode_errors = dec.stderr.strip()
    if decode_errors:
        failures.append(f"decode: {decode_errors[:300]}")
    pg = run(["python3", GATE, "video", reel, str(REEL_PURITY_FRAMES)], timeout=180, check=False)
    if pg.returncode != 0:
        failures.append("reel purity POLLUTED")
    if failures:
        print("REEL FAILURES:"); [print(" -", x) for x in failures]; sys.exit(3)

    # Resolve EDL (in/out on reel timeline + narration binding)
    edl_path = os.path.join(ROOT, m.get("resolveEdl", ""))
    if os.path.exists(edl_path):
        prev = json.load(open(edl_path))
        srcs = prev.get("shots") or prev.get("clips") or []
    else:
        srcs = []
    tc, clips = 0.0, []
    for rec in verified:
        d = rec["duration_s"]
        clips.append({"shot": rec["shot"], "source": rec["file"],
                      "reelIn_s": round(tc,3), "reelOut_s": round(tc+d,3),
                      "duration_s": d, "sha256_16": rec["sha256_16"]})
        tc += d
    # preserve narration text/offset fields from prior EDL keyed by shot
    prev_by = {c.get("shot"): c for c in srcs} if isinstance(srcs, list) else {}
    for c in clips:
        old = prev_by.get(c["shot"], {})
        for k in ("narrationText","narrationStartOffset_s","narrationDuration_s","beat"):
            if k in old: c[k] = old[k]
    edl = {"contract": "A1Wave15ResolveEDL/v1",
           "generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
           "frameRate": 60, "totalDuration_s": round(tc,3), "reel": m["reel"], "shots": clips}
    json.dump(edl, open(edl_path,"w"), ensure_ascii=False, indent=2)

    elapsed = round(time.time()-t_start, 1)
    report = {"builtAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
              "manifestSha": sha16(MANIFEST), "shots": len(verified),
              "reelDuration_s": round(reel_dur,3),
              "reelSizeMB": round(os.path.getsize(reel)/1e6,1),
              "decodeErrors": 0, "purity": "PURE",
              "buildElapsed_s": elapsed,
              "result": "PASS"}
    json.dump(report, open(os.path.join(B,"mainline-build-report.json"),"w"), ensure_ascii=False, indent=2)
    with open(LEDGER,"a") as f:
        f.write(json.dumps(report, ensure_ascii=False)+"\n")
    print("BUILD PASS:", json.dumps(report, ensure_ascii=False))

if __name__ == "__main__":
    main()
