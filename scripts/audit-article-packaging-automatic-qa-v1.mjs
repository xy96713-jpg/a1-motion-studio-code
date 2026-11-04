#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assessArticlePackagingAutomaticQa} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line");
const workspacePath = path.join(publicRoot, "editorial-asset-workbench-v1/workspace.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/article-packaging-automatic-qa-v1");
const publicArtifactRoot = path.join(publicRoot, "article-packaging-automatic-qa-v1");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const workspace = assertEditorialAssetWorkbench(readJson(workspacePath));
const kit = workspace.production?.articlePackagingKit;
if (kit?.contract !== "A1ArticlePackagingKit/v1") throw new Error("article-packaging-kit-required");

const qa = assessArticlePackagingAutomaticQa(workspace, 22);
const {status, blockers, blockerCount, laneAssetCount, laneAssetIds} = qa;
const projection = derivePackagingLifecycleProjection(workspace);
const report = {
  contract: "A1ArticlePackagingAutomaticQaAudit/v1",
  generatedAt: new Date().toISOString(),
  mutationPerformed: false,
  dispatchPerformed: false,
  status,
  workspaceSha256: workspace.workspaceSha256,
  workspaceFileSha256: sha256(fs.readFileSync(workspacePath)),
  kitSha256: kit.kitSha256,
  kitReview: kit.review,
  lifecycle: {status: projection.status, currentStage: projection.currentStage, nextAction: projection.nextAction, requiresUser: projection.nextAction?.requiresUser ?? null},
  automaticQa: qa,
  laneAssetCount,
  laneAssetIds,
  blockerCount,
  blockers,
  gates: {
    automaticDispatchAllowed: workspace.production?.generation?.automaticDispatchAllowed === true,
    workerStatus: workspace.production?.generation?.workerStatus || null,
    queued: workspace.summary?.queuedJobCount || 0,
    running: workspace.summary?.runningJobCount || 0,
    userVisualApproval: kit.gates?.userVisualApproval || null,
  },
};
report.auditSha256 = sha256(report);
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicArtifactRoot, {recursive: true});
for (const target of [path.join(artifactRoot, "report.json"), path.join(publicArtifactRoot, "report.json")]) fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status, blockerCount, kitSha256: kit.kitSha256, workspaceSha256: workspace.workspaceSha256, report: ".codex-artifacts/system-progress-system-line/article-packaging-automatic-qa-v1/report.json", mutationPerformed: false, dispatchPerformed: false}, null, 2));
