#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const started = process.hrtime.bigint();
const git = (...args) => execFileSync("git", args, {cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024}).trim();
const tracked = git("status", "--porcelain=v1", "--untracked-files=no").split("\n").filter(Boolean);
const untracked = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
const activePrefix = "work/hupo-69-shot-reconstruction-v1/";
const counts = {activeResearch: 0, otherWorkEvidence: 0, sourceAndDocs: 0, other: 0};
const sourceRoots = ["apps/", "scripts/", "remotion-renderer/", "lib/", "docs/", ".codex/", "configs/"];
for (const file of untracked) {
  if (file.startsWith(activePrefix)) counts.activeResearch++;
  else if (file.startsWith("work/")) counts.otherWorkEvidence++;
  else if (sourceRoots.some((prefix) => file.startsWith(prefix))) counts.sourceAndDocs++;
  else counts.other++;
}
const commonDir = path.resolve(root, git("rev-parse", "--git-common-dir"));
const packDir = path.join(commonDir, "objects", "pack");
const temporaryPacks = fs.readdirSync(packDir).filter((name) => /^tmp_pack_[A-Za-z0-9]+$/u.test(name));
const temporaryPackBytes = temporaryPacks.reduce((sum, name) => sum + fs.statSync(path.join(packDir, name)).size, 0);
const [behind, ahead] = git("rev-list", "--left-right", "--count", "@{upstream}...HEAD").split(/\s+/u).map(Number);
const result = {
  contract: "A1SystemLineRepositoryInspection/v1",
  status: "PASS",
  readOnly: true,
  branch: git("branch", "--show-current"),
  head: git("rev-parse", "HEAD"),
  upstream: git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"),
  upstreamSnapshot: {ahead, behind, liveRemoteChecked: false},
  tracked: {
    modified: tracked.filter((line) => line.slice(0, 2).includes("M")).length,
    deleted: tracked.filter((line) => line.slice(0, 2).includes("D")).length,
    total: tracked.length,
  },
  untracked: {total: untracked.length, ...counts},
  sharedGitObjectStore: {temporaryPackCount: temporaryPacks.length, temporaryPackBytes},
  elapsedMs: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(2)),
};
console.log(JSON.stringify(result, null, 2));
