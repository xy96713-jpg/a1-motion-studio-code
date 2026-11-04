#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const cachePath = path.join(artifactRoot, "system-line-current-authority-v2", "audit-cache.json");
const phasePath = path.join(artifactRoot, "current-phase.json");
const exactInputs = [
  phasePath,
  path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"),
  path.join(artifactRoot, "editorial-asset-workbench-v1/workspace.json"),
  path.join(root, "AGENTS.md"),
  path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx"),
  path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PresentationSystemPanel.tsx"),
  path.join(root, "apps/studio-next/src/app/system-line-review/VisualDirectorStudioRedirect.tsx"),
  path.join(root, "apps/studio-next/src/lib/a1-package-look-master-v1.mjs"),
  path.join(root, "apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs"),
  path.join(root, "apps/studio-next/src/lib/a1-presenter-packaging-output-gate-v1.mjs"),
  path.join(root, "package.json"),
  path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/report.json"),
  path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json"),
];
const statKey = (file) => {
  try {
    const stat = fs.statSync(file);
    return `${file}:${stat.size}:${Math.trunc(stat.mtimeMs)}:${stat.ino}`;
  } catch {
    return `${file}:missing`;
  }
};
const key = createHash("sha256").update(exactInputs.map(statKey).join("|")).digest("hex");
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
};
const cached = readJson(cachePath);
const reportPath = path.join(artifactRoot, "system-line-current-authority-v2/audit-report.json");
if (cached?.contract === "A1SystemLineAuthorityAuditCache/v1" && cached.status === "PASS" && cached.key === key && fs.existsSync(reportPath)) {
  console.log(JSON.stringify({status: "CACHED_PASS", contract: "A1SystemLineAuthorityAudit/v1", source: "stat-bound-authority-cache", cacheKey: key, reportPath: ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json", nextAction: cached.nextAction}, null, 2));
  process.exit(0);
}

const output = execFileSync(process.execPath, ["scripts/audit-system-line-workbench-current-authority-v2.mjs"], {cwd: root, encoding: "utf8", maxBuffer: 200000});
process.stdout.write(output);
