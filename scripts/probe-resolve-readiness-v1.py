#!/usr/bin/env python3
"""Read-only DaVinci Resolve project/timeline readiness probe."""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path


def canonical(value):
    if isinstance(value, dict):
        return {key: canonical(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [canonical(item) for item in value]
    return value


def digest(value):
    payload = json.dumps(canonical(value), ensure_ascii=False, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def safe_call(obj, method, default=None, *args):
    try:
        fn = getattr(obj, method)
        return fn(*args)
    except Exception:
        return default


def timeline_snapshot(timeline):
    track_types = ("video", "audio", "subtitle")
    tracks = {}
    for track_type in track_types:
        count = int(safe_call(timeline, "GetTrackCount", 0, track_type) or 0)
        tracks[track_type] = {"count": count, "items": []}
        for track_index in range(1, count + 1):
            items = safe_call(timeline, "GetItemListInTrack", [], track_type, track_index) or []
            rows = []
            for item in items:
                rows.append({
                    "id": str(safe_call(item, "GetUniqueId", "") or ""),
                    "name": safe_call(item, "GetName", None),
                    "startFrame": safe_call(item, "GetStart", None),
                    "endFrame": safe_call(item, "GetEnd", None),
                    "duration": safe_call(item, "GetDuration", None),
                })
            tracks[track_type]["items"].append({"index": track_index, "items": rows})
    snapshot = {
        "timelineId": str(safe_call(timeline, "GetUniqueId", "") or ""),
        "timelineName": safe_call(timeline, "GetName", None),
        "fps": safe_call(timeline, "GetSetting", None, "timelineFrameRate"),
        "resolution": {
            "width": safe_call(timeline, "GetSetting", None, "timelineResolutionWidth"),
            "height": safe_call(timeline, "GetSetting", None, "timelineResolutionHeight"),
        },
        "startFrame": safe_call(timeline, "GetStartFrame", None),
        "endFrame": safe_call(timeline, "GetEndFrame", None),
        "tracks": tracks,
    }
    snapshot["timelineSha256"] = digest(snapshot)
    return snapshot


def main():
    api_root = Path(os.environ.get("RESOLVE_SCRIPT_API", "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting"))
    modules = api_root / "Modules"
    sys.path.insert(0, str(modules))
    try:
        import DaVinciResolveScript as dvr
        resolve = dvr.scriptapp("Resolve")
    except Exception as exc:
        print(json.dumps({"status": "BLOCKED_RESOLVE_API_IMPORT", "error": repr(exc)}, ensure_ascii=False))
        return 2
    if not resolve:
        print(json.dumps({"status": "BLOCKED_RESOLVE_NOT_CONNECTED", "reason": "scriptapp(Resolve) returned no object", "mutation": False}, ensure_ascii=False))
        return 2
    project_manager = resolve.GetProjectManager()
    project = project_manager.GetCurrentProject() if project_manager else None
    timeline = project.GetCurrentTimeline() if project else None
    if not project or not timeline:
        print(json.dumps({"status": "BLOCKED_CURRENT_PROJECT_OR_TIMELINE_MISSING", "project": bool(project), "timeline": bool(timeline), "mutation": False}, ensure_ascii=False))
        return 2
    snapshot = timeline_snapshot(timeline)
    snapshot.update({
        "status": "LIVE_READBACK",
        "product": safe_call(resolve, "GetProductName", None),
        "resolveVersion": safe_call(resolve, "GetVersionString", None),
        "projectId": str(safe_call(project, "GetUniqueId", "") or ""),
        "projectName": safe_call(project, "GetName", None),
        "mutation": False,
    })
    print(json.dumps(snapshot, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
