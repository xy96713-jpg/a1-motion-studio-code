#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const workspace = readProjectWorkspace(appRoot);
const production = workspace.production || {};
const board = production.shotIntelligence?.wholeFilmStaticBoard || null;
const decisions = production.canonicalCreatorPackagingSequence?.decisions || [];
const packageShotIds = decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId);
const bindings = new Map((production.creatorPaletteShotBindingManifest?.entries || []).map((item) => [item.shotId, item]));
const boardItems = board?.items || [];
const staleItems = boardItems.filter((item) => packageShotIds.includes(item.shotId) && item.artifactSha256 !== bindings.get(item.shotId)?.actualShotCandidateSha256);
const quarantineRoot = path.join(root, ".codex-artifacts/quarantine", `current-board-stale-${workspace.workspaceSha256.slice(0, 12)}`);
const moved = [];
const skipped = [];
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const moveOne = (url, shotId) => {
  if (!url || !url.startsWith("/generated/system-line/")) return;
  const source = path.resolve(publicRoot, url.slice(1));
  if (!source.startsWith(`${publicRoot}${path.sep}`)) throw new Error(`stale-board-public-path-invalid:${url}`);
  if (!fs.existsSync(source)) { skipped.push({shotId, url, reason: "missing"}); return; }
  const destination = path.join(quarantineRoot, "public", url.slice(1));
  if (fs.existsSync(destination)) { skipped.push({shotId, url, reason: "already-quarantined"}); return; }
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  const beforeSha256 = sha256(source);
  const bytes = fs.statSync(source).size;
  fs.renameSync(source, destination);
  moved.push({shotId, source: rel(source), destination: rel(destination), bytes, sha256: beforeSha256});
};
for (const item of staleItems) {
  moveOne(item.artifactPublicUrl, item.shotId);
  if (item.previewPublicUrl && item.previewPublicUrl !== item.artifactPublicUrl) moveOne(item.previewPublicUrl, item.shotId);
}
const report = {
  contract: "A1CurrentStaleBoardArtifactQuarantine/v1",
  status: "QUARANTINED_RECOVERABLE",
  generatedAt: new Date().toISOString(),
  workspaceSha256: workspace.workspaceSha256,
  boardSha256: board?.sha256 || null,
  staleShotIds: staleItems.map((item) => item.shotId),
  moved,
  skipped,
  movedFileCount: moved.length,
  deleted: false,
  workspaceMutationPerformed: false,
  dispatchPerformed: false,
  quarantineRoot: rel(quarantineRoot),
  reason: "Current board items whose artifact SHA no longer matches the current PACKAGE binding are not eligible for active visual selection.",
};
const reportText = `${JSON.stringify(report, null, 2)}\n`;
const publicReport = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/current-stale-board-quarantine-v1.json");
const artifactReport = path.join(artifactRoot, "current-stale-board-quarantine-v1/report.json");
fs.mkdirSync(path.dirname(publicReport), {recursive: true});
fs.mkdirSync(path.dirname(artifactReport), {recursive: true});
fs.writeFileSync(publicReport, reportText);
fs.writeFileSync(artifactReport, reportText);
console.log(JSON.stringify({status: report.status, staleShotIds: report.staleShotIds, movedFileCount: report.movedFileCount, quarantineRoot: report.quarantineRoot, reportPath: rel(artifactReport)}, null, 2));
