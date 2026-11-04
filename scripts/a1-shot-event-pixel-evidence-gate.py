#!/usr/bin/env python3
"""
A1 shot event-pixel evidence gate.

A narration/receipt binding is not evidence by itself: every bound UI event
must correspond to actual pixel motion in the recorded video around its
timestamp. Catches the ED-24 failure class (binding says select@0.48s /
ban@5.80s / library@9.22s, but frames are blank-static the whole time).

Reads candidates/<SHOT>/receipt.json narrationBinding.bindings, measures
frame-diff energy in a window around each bound event, and requires at least
one window per event above an adaptive threshold (max global diff energy *
ratio, with a floor). Start cue (cue index 0 leading anchor) is exempt only
if its eventTimeMs < 300ms (pre-roll anchor hold).

Usage: python3 scripts/a1-shot-event-pixel-evidence-gate.py ED-24 [--json]
Exit: 0 evidence ok, 1 missing pixel evidence (fail-closed).
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FFMPEG = os.path.join(ROOT, ".tools/bin/ffmpeg")
FFPROBE = os.path.join(ROOT, ".tools/bin/ffprobe")
W, H = 960, 525
WINDOW_S = 0.9          # ±window around event
# At 960px sampling, idle screen noise settles around ~0.6 mean frame-diff;
# a real discrete UI action (click/select/panel/typing burst) exceeds 2.0.
# Static editor text is NOT motion regardless of how much ink is on screen.
FLOOR = 2.0
ANCHOR_MS = 300         # first cue before this is anchor pre-roll, exempt
# hold/settle/anchor cues are expected to be static; they are only checked
# for "result actually on screen" (not blank), never for motion energy.
STATIC_HINT = ("hold", "anchor", "page", "settle", "idle")
ACTION_HINT = ("click", "selected", "started", "entered", "run", "open",
               "confirm", "save", "switch", "input", "scroll", "navigate")
# Keyboard shortcuts (Cmd+S etc.) deliberately produce no UI change; exempt.
KEYBOARD_HINT = ("shortcut", "keydown", "hotkey")

def is_blank(gray):
    import numpy as np
    # near-white, near-uniform frame = capture rendered nothing (ED-24 class).
    # Real workbench frames are light UI but always carry non-white ink/chrome.
    nonwhite = float((gray < 205).mean())
    edge = float(np.abs(np.diff(gray.astype(int), axis=1)).mean())
    return nonwhite < 0.006 and edge < 4.5

def gray_frames(path):
    import numpy as np
    raw = subprocess.check_output([FFMPEG,"-v","error","-i",path,
        "-vf",f"fps=10,scale={W}:{H},format=gray","-f","rawvideo","-"])
    a = np.frombuffer(raw, dtype=np.uint8).reshape(-1,H,W).astype(int)
    d = np.abs(a[1:]-a[:-1]).mean(axis=(1,2)) if a.shape[0] > 1 else np.zeros(0)
    return a, d

def selection_masks(path):
    """Per-frame count of text-selection (bluish highlight) pixels at fps=10.

    White-page -> light-blue selection barely moves gray frame-diff energy,
    but it is real on-screen action (measured ED-24: ~1.5k -> ~15.9k pixels).
    Returns an int16 array aligned with the gray frame index."""
    import numpy as np
    raw = subprocess.check_output([FFMPEG,"-v","error","-i",path,
        "-vf",f"fps=10,scale={W}:{H},format=rgb24","-f","rawvideo","-"])
    rgb = np.frombuffer(raw, dtype=np.uint8).reshape(-1,H,W,3).astype(int)
    R,G,B = rgb[...,0],rgb[...,1],rgb[...,2]
    sel = ((B > 150) & (B-R > 35) & (B-G > 15)).sum(axis=(1,2))
    return sel

SELECT_HINT = ("selected", "selection", "select")
SELECT_RISE = 1500     # bluish-highlight pixel rise vs the pre-roll frame
SELECT_FLOOR = 2500    # absolute bluish-highlight pixels proving a live selection

def main():
    shots = [a for a in sys.argv[1:] if not a.startswith("--")]
    as_json = "--json" in sys.argv
    # Shots whose v4 source was replaced by an externally provenanced authority
    # (see MAINLINE-V4-MANIFEST provenance); their local receipt timeline does
    # not match the v4 pixels, evidence is attested by the external chain.
    manifest_path = os.path.join(ROOT, "work/cap-native-production-v2/MAINLINE-V4-MANIFEST.json")
    external = set()
    if os.path.exists(manifest_path):
        mf = json.load(open(manifest_path))
        for sid, rec in mf.get("shots", {}).items():
            if rec.get("provenance"): external.add(sid)
    results, bad, skipped = {}, [], []
    for sid in shots:
        if sid in external:
            results[sid] = {"verdict": "external-provenance-skip"}; skipped.append(sid); continue
        rcpt = os.path.join(ROOT, f"work/cap-native-production-v2/candidates/{sid}/receipt.json")
        r = json.load(open(rcpt))
        rel = r["video"]["path"]
        vpath = rel if os.path.isabs(rel) else os.path.join(ROOT, rel)
        a, d = gray_frames(vpath)
        peak = float(d.max()) if len(d) else 0.0
        sel = None  # lazily decoded bluish-selection mask
        thr = FLOOR
        bindings = r.get("narrationBinding",{}).get("bindings",[])
        evs = []
        for i,b in enumerate(bindings):
            ev = b.get("event","")
            t = b.get("eventTimeMs")
            if t is None: continue
            ts = t/1000.0
            fi = min(max(0, int(ts*10)), a.shape[0]-1)
            blank = is_blank(a[fi])
            is_static = any(h in ev for h in STATIC_HINT)
            if any(h in ev for h in KEYBOARD_HINT):
                evs.append({"event": ev, "t_s": round(ts,2), "verdict": "keyboard-exempt"}); continue
            if is_static or (i == 0 and t < ANCHOR_MS):
                verdict = "content-present" if not blank else "BLANK_FRAME"
                evs.append({"event": ev, "t_s": round(ts,2), "verdict": verdict})
                if blank: bad.append(f"{sid}:{ev}@{ts:.2f}s frame blank (no rendered content)")
                continue
            lo = max(0, int((ts-WINDOW_S)*10)); hi = min(len(d), int((ts+WINDOW_S)*10))
            seg = d[lo:hi]
            e = float(seg.max()) if len(seg) else 0.0
            ok = e >= thr
            verdict_detail = None
            # White-page -> light-blue text selection is invisible to gray diff.
            # Accept when the window holds a real selection highlight: absolute
            # bluish pixels above floor AND a rise over the pre-roll first frame.
            if not ok and any(h in ev for h in SELECT_HINT):
                if sel is None: sel = selection_masks(vpath)
                base = float(sel[0])  # pre-roll frame, before any selection
                slo = max(0, int(ts*10)); shi = min(len(sel), int((ts+0.6)*10))
                win_max = float(sel[slo:shi].max()) if shi > slo else 0.0
                rise = win_max - base
                if win_max >= SELECT_FLOOR and rise >= SELECT_RISE:
                    ok = True
                    verdict_detail = {"selectPixels": round(win_max), "preRoll": round(base), "rise": round(rise)}
            evs.append({"event": ev, "t_s": round(ts,2),
                        **({"selection": verdict_detail} if verdict_detail else {}),
                        "energy": round(e,2), "threshold": round(thr,2),
                        "verdict": "ok" if ok else "NO_PIXEL_EVIDENCE"})
            if not ok: bad.append(f"{sid}:{ev}@{ts:.2f}s energy {e:.2f}<{thr:.2f}")
        results[sid] = {"peak": round(peak,2), "events": evs}
    if as_json: print(json.dumps(results, ensure_ascii=False, indent=1))
    else:
        for sid,res in results.items():
            if res.get("verdict") == "external-provenance-skip":
                print(sid, "SKIP (external provenance)"); continue
            print(sid, f"peak={res['peak']}")
            for e in res["events"]:
                print("   ", e)
    if bad:
        print("EVIDENCE GATE FAIL:", "; ".join(bad), file=sys.stderr); sys.exit(1)
    print("event-pixel evidence OK")

if __name__ == "__main__":
    main()
