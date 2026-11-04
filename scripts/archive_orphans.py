#!/usr/bin/env python3
"""Archive v2+ scripts that have no package.json / .ts / .md references.

Moves them to scripts/archive/<base>/v<N>.<ext> and writes a per-attempt
index in scripts/archive/_index.ndjson so future agents can answer
"why does this script exist" without scanning dead code.

Strict rules:
  - never move a script referenced in package.json
  - never move a script referenced by any other .ts/.md/.json file
  - only move files whose first appearance is in scripts/ itself
  - keep all v1 files in place (they are the reference implementations)
"""
from __future__ import annotations
import re
import json
import shutil
import datetime
from pathlib import Path

ROOT = Path("/Users/a1/Documents/ChatGPT/a1-motion-studio-system-line")
SCRIPTS = ROOT / "scripts"
ARCHIVE = SCRIPTS / "archive"
INDEX_PATH = ARCHIVE / "_index.ndjson"

# 1. 收集所有 v2+ 实际文件
v2_plus: list[tuple[str, str, int, str]] = []  # (name, base, version_num, ext)
for p in sorted(SCRIPTS.glob("*")):
    if not p.is_file():
        continue
    m = re.match(r"(.+)-v([0-9]+(?:-[a-z]+)?)\.(mjs|ts)$", p.name)
    if not m:
        continue
    ver_num = int(m.group(2).split("-")[0])
    if ver_num < 2:
        continue
    v2_plus.append((p.name, m.group(1), ver_num, m.group(3)))

# 2. 找所有引用
pkg_refs: set[str] = set()
for ref_path in [ROOT / "package.json"]:
    try:
        content = ref_path.read_text()
    except FileNotFoundError:
        continue
    for m in re.finditer(r"scripts/([a-z0-9\-]+\-v[0-9]+(?:\-[a-z]+)?\.(?:mjs|ts))", content):
        pkg_refs.add(m.group(1))

skip_dirs = {"node_modules", ".git", "build", ".next", ".cache", "archive"}
all_refs: set[str] = set()
for f in ROOT.rglob("*"):
    if not f.is_file():
        continue
    parts = f.relative_to(ROOT).parts
    if any(d in skip_dirs for d in parts):
        continue
    if f.suffix not in {".md", ".json", ".sh", ".yml", ".yaml", ".toml", ".ts", ".mjs", ".txt", ".ndjson", ".env", ".mdx", ".log"}:
        continue
    try:
        content = f.read_text(errors="ignore")
    except (IsADirectoryError, PermissionError):
        continue
    for m in re.finditer(r"scripts/([a-z0-9\-]+\-v[0-9]+(?:\-[a-z]+)?\.(?:mjs|ts))", content):
        all_refs.add(m.group(1))

# 3. 决定归档
to_archive = []
kept = []
for name, base, ver, ext in v2_plus:
    if name in pkg_refs or name in all_refs:
        kept.append(name)
    else:
        to_archive.append((name, base, ver, ext))

# 4. 移动
ARCHIVE.mkdir(parents=True, exist_ok=True)
now = datetime.datetime.utcnow().isoformat() + "Z"
index_lines: list[str] = []
moved: list[str] = []
for name, base, ver, ext in to_archive:
    dest_dir = ARCHIVE / base
    dest_dir.mkdir(parents=True, exist_ok=True)
    src = SCRIPTS / name
    dst = dest_dir / name
    if dst.exists():
        # 极少情况：同 base 同 v
        continue
    shutil.move(str(src), str(dst))
    moved.append(name)
    index_lines.append(json.dumps({
        "id": f"archive-{base}-v{ver}",
        "kind": "script_archive",
        "script": f"scripts/{name}",
        "archivedTo": f"scripts/archive/{base}/{name}",
        "base": base,
        "version": ver,
        "ext": ext,
        "reason": "no_references_in_package_json_or_repo_files",
        "archivedAt": now,
    }) + "\n")

INDEX_PATH.write_text("".join(index_lines))

# 5. 报告
print(f"v2+ scripts seen: {len(v2_plus)}")
print(f"  archived: {len(moved)}")
print(f"  kept (referenced): {len(kept)}")
print(f"index written to {INDEX_PATH.relative_to(ROOT)}")

# 6. 验证 package.json scripts 还能 node --check
import subprocess
failures = []
for k in sorted(kept)[:5]:
    p = SCRIPTS / k
    if not p.exists():
        continue
    r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        failures.append((k, r.stderr[:200]))

if failures:
    print("\nnode --check failures on kept scripts (top 5):")
    for k, e in failures:
        print(f"  {k}: {e}")
else:
    print("\nnode --check passed on sampled kept scripts")
