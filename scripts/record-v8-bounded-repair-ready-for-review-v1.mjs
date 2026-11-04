#!/usr/bin/env node
// Records evidence only after bounded package outputs and independent gates exist.
// This is not visual approval and never unlocks motion, Resolve, or final render.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicBase = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const artifactBase = path.join(root, ".codex-artifacts/system-progress-system-line/independent-package-visual-proof-v1");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const canaryId = "static-package-review-v8-canary-v5-authority-repair";
const expansionId = "static-package-review-v8-expansion-batch-01-repair-v2";
const canaryManifestPath = path.join(publicBase, canaryId, "manifest.json");
const expansionManifestPath = path.join(publicBase, expansionId, "manifest.json");
const canaryReportPath = path.join(artifactBase, canaryId, "report.json");
const expansionReportPath = path.join(artifactBase, expansionId, "report.json");
const canaryManifest = read(canaryManifestPath);
const expansionManifest = read(expansionManifestPath);
const canaryReport = read(canaryReportPath);
const expansionReport = read(expansionReportPath);
for (const [id, manifest, report] of [[canaryId, canaryManifest, canaryReport], [expansionId, expansionManifest, expansionReport]]) {
  if (manifest.status !== "READY_FOR_ACTUAL_PIXEL_REVIEW" || report.verdict !== "READY_FOR_ACTUAL_PIXEL_REVIEW" || report.automatedHardGateStatus !== "PASS" || report.failedGateIds?.length || report.unverifiedGateIds?.length) throw new Error(`bounded-review-evidence-not-ready:${id}`);
}
const ed13 = canaryManifest.outputs.find((item) => item.shotId === "ED-13");
const ed16 = expansionManifest.outputs.find((item) => item.shotId === "ED-16");
if (ed13.sha256 !== "c43c71358ac8168ad3e144148d46fc6b3243ec0776b963ab1a7a075f0bcc1f6d") throw new Error("ed13-pixel-parity-regressed");
if (ed16.sha256 !== "15cb9bb23fabc498268d47249bff473f56eb5f94ac98810e1bf9007094483cdd") throw new Error("ed16-pixel-parity-regressed");
const now = new Date().toISOString();
const body = {
  contract: "A1V8BoundedRepairReadyForActualPixelReview/v1",
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW",
  current: true,
  canary: {id: canaryId, manifestSha256: hash(fs.readFileSync(canaryManifestPath)), contactSheetSha256: canaryManifest.contactSheet.sha256, independentReportSha256: hash(fs.readFileSync(canaryReportPath))},
  expansion: {id: expansionId, manifestSha256: hash(fs.readFileSync(expansionManifestPath)), contactSheetSha256: expansionManifest.contactSheet.sha256, independentReportSha256: hash(fs.readFileSync(expansionReportPath))},
  repairedShotIds: ["ED-12", "ED-17", "ED-31"],
  pixelPreservedShotIds: ["ED-13", "ED-16"],
  automaticGateIsVisualApproval: false,
  userVisualApproval: "NOT_APPROVED",
  productionWired: false,
  motionAllowed: false,
  resolveInsertAllowed: false,
  finalFilmRenderAllowed: false,
  reviewedAt: now,
};
const record = {...body, auditSha256: hash(Buffer.from(JSON.stringify(body)))};
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (!["VISUAL_REPAIR_REQUIRED", "READY_FOR_ACTUAL_PIXEL_REVIEW"].includes(current.production.staticPackageReview?.status)) throw new Error(`visual-repair-authority-required:${current.production.staticPackageReview?.status}`);
  const next = structuredClone(current);
  next.production.staticPackageReview = {...current.production.staticPackageReview, ...record, productionArtifact: false, packagingDeliverable: false};
  next.production.objectiveVisualGate = {...(current.production.objectiveVisualGate || {}), current: false, status: "READY_FOR_ACTUAL_PIXEL_REVIEW", nextAction: "INDEPENDENT_ACTUAL_PIXEL_REVIEW_V8_BOUNDED_REPAIR", userVisualApproval: "NOT_APPROVED", productionWired: false, resolveInsertAuthorized: false, finalFilm: false};
  next.production.productionWired = false;
  next.production.aeLevelProven = false;
  next.production.resolveExportReady = false;
  next.production.resolveInsertReady = false;
  next.production.resolveProjectMutationPerformed = false;
  if (next.production.assembly?.status !== "NOT_CREATED") throw new Error("assembly-status-must-remain-not-created");
  const event = createProductionEvent({workspace: current, action: "record-v8-bounded-repair-ready-for-actual-pixel-review", targetId: "V8_BOUNDED_REPAIR", payload: {auditSha256: record.auditSha256, status: record.status, userVisualApproval: "NOT_APPROVED"}});
  return persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, now), {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `v8-bounded-ready-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"static-package-review-v8/bounded-repair-ready-for-actual-pixel-review.json": record}});
});
console.log(JSON.stringify({status: record.status, auditSha256: record.auditSha256, workspaceSha256: result.workspaceSha256, transitionSha256: result.transitionSha256, userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveInsertAllowed: false, finalFilmRenderAllowed: false}, null, 2));
