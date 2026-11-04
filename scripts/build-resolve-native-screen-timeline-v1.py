#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps/studio-next/public"
PLANS = PUBLIC / "generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/shot-performance-plans.json"
FFPROBE = ROOT / ".tools/bin/ffprobe"
FFMPEG = ROOT / ".tools/bin/ffmpeg"
MODULE_PATH = Path("/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules")
REPORT_DIR = ROOT / "work/resolve-native-screen-v1"
TIMELINE_FPS = 60


def sha256(file: Path) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()


def source_fps(file: Path) -> float:
    result = subprocess.run(
        [str(FFPROBE), "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate", "-of", "json", str(file)],
        text=True,
        capture_output=True,
        check=True,
    )
    rate = json.loads(result.stdout)["streams"][0]["avg_frame_rate"]
    numerator, denominator = (float(part) for part in rate.split("/"))
    return numerator / denominator


def safe(callable_obj, default: Any = None) -> Any:
    try:
        value = callable_obj()
        return default if value is None else value
    except Exception:
        return default


def main() -> None:
    if str(MODULE_PATH) not in sys.path:
        sys.path.insert(0, str(MODULE_PATH))
    import DaVinciResolveScript as dvr  # type: ignore

    resolve = dvr.scriptapp("Resolve")
    if not resolve:
        raise RuntimeError("Resolve unavailable")
    manager = resolve.GetProjectManager()
    current = manager.GetCurrentProject()
    before = {
        "project": current.GetName() if current else None,
        "timelineCount": current.GetTimelineCount() if current else 0,
        "timeline": current.GetCurrentTimeline().GetName() if current and current.GetCurrentTimeline() else None,
    }

    project_name = f"A1_Gaotai_Native_Edit_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    project = manager.CreateProject(project_name)
    if not project:
        raise RuntimeError(f"CreateProject failed:{project_name}")
    if not project.SetSetting("timelineFrameRate", str(TIMELINE_FPS)):
        raise RuntimeError("timelineFrameRate 60 rejected")
    project.SetSetting("timelinePlaybackFrameRate", str(TIMELINE_FPS))
    project.SetSetting("timelineResolutionWidth", "1920")
    project.SetSetting("timelineResolutionHeight", "1080")
    media_pool = project.GetMediaPool()
    timeline = media_pool.CreateEmptyTimeline("01_Screen_Native_16")
    if not timeline:
        raise RuntimeError("CreateEmptyTimeline failed")
    project.SetCurrentTimeline(timeline)
    timeline_start = int(timeline.GetStartFrame())

    plans = json.loads(PLANS.read_text(encoding="utf-8"))
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    mezzanine_dir = REPORT_DIR / "mezzanine"
    mezzanine_dir.mkdir(parents=True, exist_ok=True)
    original_paths: set[Path] = set()
    for shot in plans["shots"]:
        original_paths.add(PUBLIC / shot["sourceVideoUri"].lstrip("/"))
        for segment in shot["sourceSegments"]:
            if segment.get("kind") == "still":
                original_paths.add(PUBLIC / segment["sourceStillUri"].lstrip("/"))
    missing = [str(file) for file in original_paths if not file.exists()]
    if missing:
        raise RuntimeError(f"source files missing:{missing}")

    conformed_video: dict[str, Path] = {}
    for file in sorted(original_paths):
        if file.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        measured_fps = source_fps(file)
        if abs(measured_fps - TIMELINE_FPS) < 0.01:
            conformed_video[str(file.resolve())] = file.resolve()
            continue
        output = mezzanine_dir / f"{sha256(file)[:16]}-60fps.mp4"
        if not output.exists():
            result = subprocess.run(
                [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-i", str(file), "-vf", "fps=60", "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)],
                text=True,
                capture_output=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f"mezzanine failed:{file}:{result.stderr}")
        conformed_video[str(file.resolve())] = output.resolve()

    segment_media: dict[tuple[str, int], Path] = {}
    import_paths: set[Path] = set(conformed_video.values())
    for shot in plans["shots"]:
        source_video = (PUBLIC / shot["sourceVideoUri"].lstrip("/")).resolve()
        for segment_index, segment in enumerate(shot["sourceSegments"]):
            duration_frames = round((segment["outputEndMs"] - segment["outputStartMs"]) / 1000 * TIMELINE_FPS)
            if segment["kind"] == "video":
                media_file = conformed_video[str(source_video)]
            else:
                still = (PUBLIC / segment["sourceStillUri"].lstrip("/")).resolve()
                media_file = (mezzanine_dir / f"{shot['shotId'].lower()}-{segment_index}-hold-{duration_frames}f.mp4").resolve()
                if not media_file.exists():
                    result = subprocess.run(
                        [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", str(still), "-frames:v", str(duration_frames), "-r", "60", "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(media_file)],
                        text=True,
                        capture_output=True,
                    )
                    if result.returncode != 0:
                        raise RuntimeError(f"hold mezzanine failed:{still}:{result.stderr}")
            segment_media[(shot["shotId"], segment_index)] = media_file
            import_paths.add(media_file)

    imported = media_pool.ImportMedia([str(file) for file in sorted(import_paths)]) or []
    item_by_path: dict[str, Any] = {}
    for item in imported:
        file_path = str(safe(lambda i=item: i.GetClipProperty("File Path"), "") or "")
        if file_path:
            item_by_path[str(Path(file_path).resolve())] = item
    unresolved = [str(file) for file in import_paths if str(file.resolve()) not in item_by_path]
    if unresolved:
        raise RuntimeError(f"import readback missing:{unresolved}")

    append_rows = []
    expected_items = []
    screen_cursor = 0
    for shot in plans["shots"]:
        shot_start = screen_cursor
        shot_frames = round(shot["durationMs"] / 1000 * TIMELINE_FPS)
        for segment_index, segment in enumerate(shot["sourceSegments"]):
            output_start = round(segment["outputStartMs"] / 1000 * TIMELINE_FPS)
            output_end = round(segment["outputEndMs"] / 1000 * TIMELINE_FPS)
            record_frame = timeline_start + shot_start + output_start
            duration_frames = output_end - output_start
            media_file = segment_media[(shot["shotId"], segment_index)]
            if segment["kind"] == "video":
                source_start = round(segment.get("sourceStartMs", 0) / 1000 * TIMELINE_FPS)
                source_end = source_start + duration_frames
            else:
                source_start = 0
                source_end = duration_frames
            row = {
                "mediaPoolItem": item_by_path[str(media_file)],
                "startFrame": source_start,
                "endFrame": source_end,
                "recordFrame": record_frame,
                "trackIndex": 1,
                "mediaType": 1,
            }
            appended = media_pool.AppendToTimeline([row]) or []
            if len(appended) != 1:
                raise RuntimeError(f"append failed:{shot['shotId']}:{segment_index}")
            item = appended[0]
            observed = {
                "shotId": shot["shotId"],
                "segmentIndex": segment_index,
                "kind": segment["kind"],
                "source": str(media_file),
                "sourceSha256": sha256(media_file),
                "expectedStart": record_frame,
                "expectedDuration": duration_frames,
                "observedStart": int(item.GetStart()),
                "observedEnd": int(item.GetEnd()),
                "observedDuration": int(item.GetDuration()),
            }
            append_rows.append(observed)
            expected_items.append((record_frame, duration_frames, observed))
        screen_cursor += shot_frames
        timeline.AddMarker(timeline_start + shot_start, "Blue", shot["shotId"], shot["sourceText"], 1, shot["shotId"])

    track_items = list(timeline.GetItemListInTrack("video", 1) or [])
    readback = sorted(
        [{"name": item.GetName(), "start": int(item.GetStart()), "end": int(item.GetEnd()), "duration": int(item.GetDuration())} for item in track_items],
        key=lambda item: (item["start"], item["end"]),
    )
    mismatches = [
        row for _, _, row in expected_items
        if row["observedStart"] != row["expectedStart"] or row["observedDuration"] != row["expectedDuration"]
    ]
    if mismatches:
        raise RuntimeError(f"timeline readback mismatch:{json.dumps(mismatches[:5], ensure_ascii=False)}")
    if len(readback) != len(expected_items):
        raise RuntimeError(f"timeline item count mismatch:{len(readback)}:{len(expected_items)}")
    if not manager.SaveProject():
        raise RuntimeError("SaveProject failed")

    report = {
        "contract": "A1ResolveNativeScreenTimeline/v1",
        "status": "READY_FOR_RESOLVE_NATIVE_TRANSITION_REVIEW",
        "resolveVersion": resolve.GetVersionString(),
        "before": before,
        "project": project_name,
        "timeline": timeline.GetName(),
        "timelineFps": TIMELINE_FPS,
        "timelineStartFrame": timeline_start,
        "timelineEndFrame": int(timeline.GetEndFrame()),
        "shotCount": len(plans["shots"]),
        "timelineItemCount": len(readback),
        "sourceFileCount": len(import_paths),
        "sourcePlanSha256": sha256(PLANS),
        "items": append_rows,
        "readback": readback,
        "mismatches": mismatches,
        "boundaries": {
            "customCameraUsed": False,
            "customCrossfadeUsed": False,
            "resolveNativeTimeline": True,
            "transitionsApplied": False,
            "oldRejectedFullFilmImported": False,
        },
        "savedAt": datetime.now().isoformat(),
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
