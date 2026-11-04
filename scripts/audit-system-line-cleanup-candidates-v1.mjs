#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

const root = process.cwd();
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const reportPath = path.join(artifactRoot, "cleanup-candidates-v1/report.json");
const workspacePath = path.join(publicRoot, "workspace.json");
const workspaceBytes = fs.readFileSync(workspacePath);
const workspace = JSON.parse(workspaceBytes);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
if (!/^[a-f0-9]{64}$/u.test(workspace.workspaceSha256 || "")) throw new Error("cleanup-current-workspace-invalid");
const phase = JSON.parse(fs.readFileSync(path.join(artifactRoot, "current-phase.json"), "utf8"));
const authority = JSON.parse(fs.readFileSync(path.join(artifactRoot, "system-line-current-authority-v2/audit-report.json"), "utf8"));
if (phase.authority?.workspaceSha256 !== workspace.workspaceSha256
  || authority.authority?.workspaceSha256 !== workspace.workspaceSha256) throw new Error("cleanup-current-authority-mismatch");

const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const candidateSpecs = [
  {
    id: "public-static-package-review-v1-v7",
    reason: "superseded static review iterations; current v8 and its review-only canaries remain protected",
    paths: Array.from({length: 7}, (_, index) => path.join(publicRoot, `static-package-review-v${index + 1}`)),
  },
  {
    id: "public-shot-candidates-rejected-film-visual-quality-v1",
    reason: "rejected visual-quality candidates; retain only if needed for ED-10/13/31 audit evidence",
    paths: [path.join(publicRoot, "shot-candidates-rejected-film-visual-quality-v1")],
  },
  {
    id: "public-whole-film-motion-plan-v1",
    reason: "historical motion-plan package; downstream motion remains frozen",
    paths: [path.join(publicRoot, "whole-film-motion-plan-v1")],
  },
  {
    id: "public-remaining-ten-motion-safe-v4",
    reason: "historical motion-safe batch; not a current production entrypoint",
    paths: [path.join(publicRoot, "remaining-ten-motion-safe-v4")],
  },
  {
    id: "artifact-version-freeze-20260728",
    reason: "old version-freeze mirror; verify no rollback or audit dependency before quarantine",
    paths: [path.join(artifactRoot, "version-freeze-20260728T141143+0800")],
  },
  {
    id: "artifact-recovery-backups",
    reason: "recoverable backups; candidate for archive after owner confirms current workspace is authoritative",
    paths: [path.join(artifactRoot, "recovery-backups")],
  },
  {
    id: "artifact-recovery-checkpoints",
    reason: "recoverable checkpoints; candidate for archive after owner confirms no rollback is needed",
    paths: [path.join(artifactRoot, "recovery-checkpoints")],
  },
  {
    id: "artifact-current-film-v1",
    reason: "historical film manifest/evidence; may be shared by another review lane",
    paths: [path.join(artifactRoot, "current-film-v1")],
  },
  {
    id: "artifact-h-series-1080p-review-mp4-v1",
    reason: "large review export; not a current system-line production output",
    paths: [path.join(artifactRoot, "h-series-1080p-review-mp4-v1")],
  },
  {
    id: "artifact-h-series-540p-review-mp4-v2-candidate",
    reason: "candidate review export; not a current system-line production output",
    paths: [path.join(artifactRoot, "h-series-540p-review-mp4-v2-candidate")],
  },
];

const protectedSpecs = [
  {id: "workspace", path: path.join(publicRoot, "workspace.json"), reason: "current authority workspace; never clean"},
  {id: "active-run", path: path.join(publicRoot, "active-run.json"), reason: "live execution pointer"},
  {id: "transition-receipt", path: path.join(publicRoot, "transition-receipt.json"), reason: "workspace/API parity receipt"},
  {id: "imported-film-media-v1", path: path.join(publicRoot, "imported-film-media-v1"), reason: "user-owned source media used by current visual repair"},
  {id: "look-masters", path: path.join(publicRoot, "look-masters"), reason: "current look-master evidence"},
  {id: "look-master-audits", path: path.join(publicRoot, "look-master-audits"), reason: "current actual-pixel audit evidence"},
  {id: "generated-visual-reviews", path: path.join(publicRoot, "generated-visual-reviews"), reason: "current visual review evidence"},
  {id: "independent-package-visual-proof-v1", path: path.join(artifactRoot, "independent-package-visual-proof-v1"), reason: "independent visual proof and review gate evidence"},
  {id: "current-phase", path: path.join(artifactRoot, "current-phase.json"), reason: "current phase authority"},
  {id: "current-authority", path: path.join(artifactRoot, "system-line-current-authority-v2"), reason: "current authority mirror"},
  {id: "active-research-phase", path: path.join(root, ".codex-artifacts/system-progress/current-phase.json"), reason: "current HuBo research pointer"},
  {id: "active-research-plan", path: path.join(root, "work/hupo-69-shot-reconstruction-v1/shot-task-plan-v1.json"), reason: "current HuBo shot plan"},
  {id: "active-research-runtime", path: path.join(root, "work/hupo-69-shot-reconstruction-v1/runtime/.codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/node-workflow-v1/current.json"), reason: "current HuBo execution state"},
  {id: "applied-quarantine-receipt", path: path.join(artifactRoot, "superseded-media-quarantine-v1/apply-receipt.json"), reason: "recoverable prior cleanup evidence"},
];

function inventory(target) {
  if (!fs.existsSync(target)) return {path: rel(target), exists: false, bytes: 0, files: 0, directories: 0};
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory()) return {path: rel(target), exists: true, bytes: stat.size, files: 1, directories: 0};
  let bytes = 0;
  let files = 0;
  let directories = 1;
  const visit = (current) => {
    for (const name of fs.readdirSync(current)) {
      const child = path.join(current, name);
      const childStat = fs.lstatSync(child);
      if (childStat.isDirectory()) {
        directories += 1;
        visit(child);
      } else if (childStat.isFile()) {
        files += 1;
        bytes += childStat.size;
      }
    }
  };
  visit(target);
  return {path: rel(target), exists: true, bytes, files, directories};
}

const candidates = candidateSpecs.flatMap((spec) => spec.paths.map((target) => ({...inventory(target), id: spec.id, reason: spec.reason, requiresOwnerConfirmation: true})));
const protectedPaths = protectedSpecs.map((spec) => ({...inventory(spec.path), id: spec.id, reason: spec.reason, protected: true}));
const existingCandidates = candidates.filter((entry) => entry.exists);
const report = {
  contract: "A1SystemLineCleanupCandidateInventory/v1",
  status: "REVIEW_REQUIRED",
  createdAt: new Date().toISOString(),
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourcePhaseWorkspaceSha256: phase.authority.workspaceSha256,
  sourceAuthorityWorkspaceSha256: authority.authority.workspaceSha256,
  sourceWorkspaceFileSha256: sha256(workspaceBytes),
  candidateInventorySha256: sha256(JSON.stringify(candidates)),
  deletionPerformed: false,
  movePerformed: false,
  scanScope: "explicit-path-inventory-only",
  candidateCount: existingCandidates.length,
  candidateBytes: existingCandidates.reduce((sum, entry) => sum + entry.bytes, 0),
  candidates,
  protectedPaths,
  rule: "No deletion or move is performed. Each candidate requires owner confirmation and should be quarantined recoverably, not deleted, if approved.",
};

fs.mkdirSync(path.dirname(reportPath), {recursive: true});
if (fs.existsSync(reportPath)) {
  const previous = fs.readFileSync(reportPath);
  const history = path.join(path.dirname(reportPath), "history");
  fs.mkdirSync(history, {recursive: true});
  const snapshot = path.join(history, `${sha256(previous)}.json`);
  if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, previous, {flag: "wx"});
}
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: report.status,
  candidateCount: report.candidateCount,
  candidateBytes: report.candidateBytes,
  candidateGiB: Number((report.candidateBytes / 1024 ** 3).toFixed(3)),
  protectedCount: report.protectedPaths.filter((entry) => entry.exists).length,
  sourceWorkspaceSha256: report.sourceWorkspaceSha256,
  reportPath: rel(reportPath),
  deletionPerformed: report.deletionPerformed,
  movePerformed: report.movePerformed,
}, null, 2));
