#!/usr/bin/env python3
"""Move work/cap-native-ed*-v1-<attempt> directories into work/archive/ with
per-shot attempts.ndjson so future agents can answer
"why was ED-24 retried 5 times" without the original work/ tree.

Strict rules:
  - never move a directory referenced in any tracked file
  - never move a non-cap-native-ed directory
  - preserve file content and relative paths
  - write a SHA-256 of every preserved file for provenance
"""
from __future__ import annotations
import re
import json
import shutil
import hashlib
import datetime
from pathlib import Path

ROOT = Path("/Users/a1/Documents/ChatGPT/a1-motion-studio-system-line")
WORK = ROOT / "work"
ARCHIVE = WORK / "archive"
INDEX = ARCHIVE / "_attempts.ndjson"

# 1. 找无引用 attempt 目录
skip_dirs = {"node_modules", ".git", "build", ".next", ".cache", "archive", "work"}
attempt_re = re.compile(r"^cap-native-ed\d+-v\d+(-[a-z0-9\-]+)?$")

# 找所有 candidate
candidates = []
for d in sorted(WORK.iterdir()):
    if not d.is_dir() or not d.name.startswith("cap-native-ed"):
        continue
    m = attempt_re.match(d.name)
    if not m:
        continue
    suffix = m.group(1) or ""
    if not suffix:
        # 这是 v1 reference (无 attempt suffix) — 保留
        continue
    # 检查引用
    refs = []
    for f in ROOT.rglob("*"):
        if not f.is_file():
            continue
        rel_parts = f.relative_to(ROOT).parts
        if any(p in skip_dirs for p in rel_parts):
            continue
        if f.suffix not in {".md", ".json", ".sh", ".yml", ".yaml", ".toml", ".ts", ".mjs", ".txt", ".ndjson", ".env", ".mdx", ".log"}:
            continue
        try:
            content = f.read_text(errors="ignore")
        except (IsADirectoryError, PermissionError):
            continue
        if d.name in content:
            refs.append(str(f.relative_to(ROOT)))
    candidates.append((d, suffix, refs))

# 拆：可归档 vs 保留
to_archive = [(d, s, r) for d, s, r in candidates if len(r) == 0]
to_keep = [(d, s, r) for d, s, r in candidates if len(r) > 0]
print(f"attempt dirs found: {len(candidates)}")
print(f"  archivable: {len(to_archive)}")
print(f"  keep (referenced): {len(to_keep)}")

# 2. 移动 + 写 attempts.ndjson
ARCHIVE.mkdir(parents=True, exist_ok=True)
now = datetime.datetime.utcnow().isoformat() + "Z"
index_lines: list[str] = []
total_size = 0
for d, suffix, refs in to_archive:
    # 解析 shot id (ED-02/03/24/26)
    m = re.match(r"cap-native-ed(\d+)-v(\d+)-(.+)$", d.name)
    if not m:
        continue
    shot = m.group(1)
    ver = m.group(2)
    attempt_tag = m.group(3)
    dest_dir = ARCHIVE / d.name
    dest_dir.mkdir(parents=True, exist_ok=True)
    src = WORK / d.name

    # 移动
    if dest_dir.exists() and any(dest_dir.iterdir()):
        # 已存在 - skip
        continue
    shutil.move(str(src), str(dest_dir))

    # sha 全部文件
    file_hashes = []
    for f in dest_dir.rglob("*"):
        if f.is_file():
            h = hashlib.sha256()
            h.update(f.read_bytes())
            rel = f.relative_to(dest_dir)
            file_hashes.append({"path": str(rel), "sha256": h.hexdigest(), "size": f.stat().st_size})
            total_size += f.stat().st_size

    index_lines.append(json.dumps({
        "id": f"cap-attempt-ED-{shot}-v{ver}-{attempt_tag}",
        "kind": "cap_attempt_archive",
        "shotId": f"ED-{shot}",
        "version": ver,
        "attemptTag": attempt_tag,
        "originalPath": f"work/{d.name}",
        "archivedTo": f"work/archive/{d.name}",
        "fileCount": len(file_hashes),
        "fileHashes": file_hashes,
        "reason": "no_references_in_repo_no_v1_or_v2_canonical",
        "archivedAt": now,
    }) + "\n")

INDEX.write_text("".join(index_lines))
print(f"index written to {INDEX.relative_to(ROOT)}")
print(f"total bytes archived: {total_size // 1024 // 1024} MB")
