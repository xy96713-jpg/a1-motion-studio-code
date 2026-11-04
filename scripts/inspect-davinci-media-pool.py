#!/usr/bin/env python3
"""Read-only DaVinci Resolve project and media-pool inventory.

This script never changes the current project, timeline, media pool, or clips.
It emits a compact JSON inventory that can be consumed by the A1 media binder.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any


RESOLVE_MODULE_DIR = Path(
    "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules"
)
VIDEO_EXTENSIONS = {
    ".3gp",
    ".avi",
    ".m2ts",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mts",
    ".mxf",
    ".webm",
}
PRESENTER_HINTS = (
    "presenter",
    "talking",
    "camera",
    "cam",
    "face",
    "host",
    "speaker",
    "a-roll",
    "aroll",
    "口播",
    "人物",
    "本人",
    "露脸",
    "相机",
    "主机位",
    "视频",
    "vibe",
    "coding",
)
EXCLUDED_HINTS = (
    "/generated/",
    "/public/",
    "/proof/",
    "contact-sheet",
    "contact_sheet",
    "remotion",
    "rendered",
    "proxy",
)


def safe_call(target: Any, method: str, default: Any = None) -> Any:
    fn = getattr(target, method, None)
    if not callable(fn):
        return default
    try:
        value = fn()
        return default if value is None else value
    except Exception:
        return default


def serializable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serializable(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def first_property(properties: dict[str, Any], *names: str) -> str:
    for name in names:
        value = properties.get(name)
        if value not in (None, ""):
            return str(value)
    return ""


def parse_duration_seconds(properties: dict[str, Any]) -> float | None:
    duration = first_property(properties, "Duration", "Frames")
    fps = first_property(properties, "FPS", "Frame Rate")
    if not duration:
        return None
    match = re.search(r"[-+]?\d+(?:\.\d+)?", duration.replace(",", ""))
    if not match:
        return None
    value = float(match.group(0))
    if ":" in duration:
        parts = duration.split(":")
        try:
            numbers = [float(part) for part in parts]
            if len(numbers) == 4:
                frame_rate = float(re.search(r"\d+(?:\.\d+)?", fps).group(0)) if fps else 30.0
                return numbers[0] * 3600 + numbers[1] * 60 + numbers[2] + numbers[3] / frame_rate
            if len(numbers) == 3:
                return numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
        except (AttributeError, TypeError, ValueError):
            return None
    try:
        frame_rate = float(re.search(r"\d+(?:\.\d+)?", fps).group(0)) if fps else 30.0
        return value / frame_rate if value > frame_rate * 3 else value
    except (AttributeError, TypeError, ValueError):
        return None


def candidate_score(name: str, file_path: str, properties: dict[str, Any]) -> int:
    combined = f"{name} {file_path}".lower()
    extension = Path(file_path).suffix.lower()
    media_type = first_property(properties, "Type", "Media Type").lower()
    score = 0
    if extension in VIDEO_EXTENSIONS or "video" in media_type:
        score += 30
    else:
        score -= 40
    if os.path.isfile(file_path):
        score += 15
    if any(hint in combined for hint in PRESENTER_HINTS):
        score += 18
    if any(hint in combined for hint in EXCLUDED_HINTS):
        score -= 35
    duration_seconds = parse_duration_seconds(properties)
    if duration_seconds is not None:
        if duration_seconds >= 180:
            score += 20
        elif duration_seconds >= 30:
            score += 12
        elif duration_seconds >= 5:
            score += 4
        else:
            score -= 6
    resolution = first_property(properties, "Resolution").lower()
    if any(token in resolution for token in ("3840", "2160", "1920", "1080")):
        score += 5
    return score


def walk_folder(folder: Any, path_parts: list[str], output: list[dict[str, Any]]) -> None:
    folder_name = str(safe_call(folder, "GetName", "untitled"))
    current_parts = [*path_parts, folder_name]
    clips = safe_call(folder, "GetClipList", []) or []
    for clip in clips:
        raw_properties = safe_call(clip, "GetClipProperty", {}) or {}
        properties = serializable(raw_properties)
        name = str(safe_call(clip, "GetName", "untitled"))
        file_path = first_property(properties, "File Path", "FilePath", "Path")
        output.append(
            {
                "name": name,
                "uniqueId": str(safe_call(clip, "GetUniqueId", "")),
                "folder": "/".join(current_parts),
                "filePath": file_path,
                "exists": bool(file_path and os.path.isfile(file_path)),
                "mediaType": first_property(properties, "Type", "Media Type"),
                "duration": first_property(properties, "Duration", "Frames"),
                "durationSecondsEstimate": parse_duration_seconds(properties),
                "resolution": first_property(properties, "Resolution"),
                "fps": first_property(properties, "FPS", "Frame Rate"),
                "codec": first_property(properties, "Video Codec", "Codec"),
                "score": candidate_score(name, file_path, properties),
            }
        )
    for child in safe_call(folder, "GetSubFolderList", []) or []:
        walk_folder(child, current_parts, output)


def main() -> int:
    sys.path.insert(0, str(RESOLVE_MODULE_DIR))
    try:
        import DaVinciResolveScript as dvr_script  # type: ignore[import-not-found]
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Resolve module import failed: {exc}"}, ensure_ascii=False))
        return 1

    resolve = dvr_script.scriptapp("Resolve")
    if not resolve:
        print(json.dumps({"ok": False, "error": "DaVinci Resolve is not running or scripting is unavailable"}, ensure_ascii=False))
        return 2
    manager = safe_call(resolve, "GetProjectManager")
    project = safe_call(manager, "GetCurrentProject") if manager else None
    if not project:
        print(json.dumps({"ok": False, "error": "No current Resolve project"}, ensure_ascii=False))
        return 3

    timeline_count = int(safe_call(project, "GetTimelineCount", 0) or 0)
    timelines = []
    for index in range(1, timeline_count + 1):
        timeline = project.GetTimelineByIndex(index)
        if timeline:
            timelines.append(
                {
                    "index": index,
                    "name": str(safe_call(timeline, "GetName", f"Timeline {index}")),
                    "startFrame": safe_call(timeline, "GetStartFrame"),
                    "endFrame": safe_call(timeline, "GetEndFrame"),
                }
            )

    media_pool = safe_call(project, "GetMediaPool")
    root_folder = safe_call(media_pool, "GetRootFolder") if media_pool else None
    clips: list[dict[str, Any]] = []
    if root_folder:
        walk_folder(root_folder, [], clips)
    ranked = sorted(clips, key=lambda item: (-int(item["score"]), item["name"].lower()))
    video_count = sum(
        1
        for item in clips
        if Path(item["filePath"]).suffix.lower() in VIDEO_EXTENSIONS
        or "video" in item["mediaType"].lower()
    )
    result = {
        "ok": True,
        "readOnly": True,
        "project": str(safe_call(project, "GetName", "untitled")),
        "currentTimeline": str(safe_call(safe_call(project, "GetCurrentTimeline"), "GetName", "")),
        "timelines": timelines,
        "clipCount": len(clips),
        "videoClipCount": video_count,
        "presenterCandidates": ranked[:50],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
