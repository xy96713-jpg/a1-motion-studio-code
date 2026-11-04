#!/usr/bin/env node

import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "workspace.json"), "utf8"));
const policySha256 = workspace.visualBible?.visualGenerationPolicy?.sha256;
if (!policySha256) throw new Error("visual-policy-sha-required-before-quarantine");

const quarantineBaseRoot = path.join(root, ".codex-artifacts/quarantine", `editorial-workbench-pre-policy-${policySha256.slice(0, 12)}`);
let quarantineRoot = quarantineBaseRoot;
let quarantineAttempt = 1;
while (fs.existsSync(quarantineRoot)) {
  quarantineAttempt += 1;
  quarantineRoot = `${quarantineBaseRoot}-r${quarantineAttempt}`;
}
const publicArchiveRoot = path.join(quarantineRoot, "public-artifacts");
const artifactArchiveRoot = path.join(quarantineRoot, "artifact-mirror");
const reportPublicPath = path.join(publicRoot, "stale-artifact-quarantine-v1-latest.json");
const reportArtifactPath = path.join(artifactRoot, "stale-artifact-quarantine-v1-latest.json");

const exactNames = new Set([
  "accepted-shot-ir-v2.json",
  "motion-ir-v2.json",
  "representative-motion-plan-v1.json",
  "representative-motion",
  "representative-motion-render-report-v1.json",
  "representative-motion-critic-v1-latest.json",
  "all-shot-selected-review-v1",
  "shot-candidates",
  "shot-candidates-rejected-visual-audit-v1",
  "shot-selection-continuity-optimization-v1-latest.json",
  "medium-rhythm-revision-v1",
]);
const stalePattern = /^(?:scene-graph-motion-preview-v1-|approved-shot-motion-proof-v1-|shot-candidate-critic-ED-)/u;
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(root, file).split(path.sep).join("/");

function inventory(target) {
  const files = [];
  const visit = (current) => {
    const stat = fs.lstatSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort()) visit(path.join(current, entry));
      return;
    }
    if (stat.isFile()) files.push({path: rel(current), bytes: stat.size, sha256: sha256File(current)});
  };
  visit(target);
  return files;
}

function moveStale(sourceRoot, destinationRoot, lane) {
  const moved = [];
  if (!fs.existsSync(sourceRoot)) return moved;
  for (const name of fs.readdirSync(sourceRoot).sort()) {
    if (!exactNames.has(name) && !stalePattern.test(name)) continue;
    const source = path.join(sourceRoot, name);
    const destination = path.join(destinationRoot, name);
    if (fs.existsSync(destination)) throw new Error(`quarantine-destination-already-exists:${rel(destination)}`);
    const files = inventory(source);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.renameSync(source, destination);
    moved.push({lane, name, source: rel(source), destination: rel(destination), fileCount: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), files});
  }
  return moved;
}

const moved = [
  ...moveStale(publicRoot, publicArchiveRoot, "public"),
  ...moveStale(artifactRoot, artifactArchiveRoot, "artifact"),
];
const report = {
  contract: "A1StaleEditorialArtifactQuarantine/v1",
  status: "QUARANTINED_RECOVERABLE",
  createdAt: new Date().toISOString(),
  projectId: workspace.production?.project?.projectId,
  sourceWorkspaceSha256: workspace.workspaceSha256,
  activeVisualPolicySha256: policySha256,
  reason: "Pre-policy candidates, Accepted Shot IR, Motion IR, visual critics, and motion previews must not remain in the active public production root after policy invalidation.",
  quarantineRoot: rel(quarantineRoot),
  movedEntryCount: moved.length,
  movedFileCount: moved.reduce((sum, entry) => sum + entry.fileCount, 0),
  movedBytes: moved.reduce((sum, entry) => sum + entry.bytes, 0),
  recoverable: true,
  deleted: false,
  moved,
};
fs.mkdirSync(publicRoot, {recursive: true});
fs.mkdirSync(artifactRoot, {recursive: true});
fs.writeFileSync(reportPublicPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(reportArtifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, movedEntryCount: report.movedEntryCount, movedFileCount: report.movedFileCount, movedBytes: report.movedBytes, quarantineRoot: report.quarantineRoot, reportPath: rel(reportPublicPath)}, null, 2));
