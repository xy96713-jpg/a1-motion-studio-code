#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const stageId = process.argv.find((arg) => arg.startsWith("--stage="))?.split("=")[1];
if (!["background-foundry", "element-atlas", "key-backgrounds"].includes(stageId)) throw new Error("local-foundation-preflight-stage-invalid");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const stage = workspace.stages.find((item) => item.id === stageId);
const assets = workspace.library.assets.filter((asset) => asset.stageId === stageId && ["editorial-artwork", "editorial-element"].includes(asset.route));
const measurements = [];
for (const asset of assets) {
  const file = asset.assetUri ? path.join(publicRoot, asset.assetUri.replace(/^\/+/, "")) : null;
  if (!file || !fs.existsSync(file)) {
    measurements.push({assetId: asset.id, exists: false});
    continue;
  }
  const metadata = await sharp(file).metadata();
  const stats = await sharp(file).stats();
  measurements.push({assetId: asset.id, exists: true, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha, alphaMin: stats.isOpaque ? 255 : stats.channels.at(-1)?.min, means: stats.channels.slice(0, 3).map((channel) => Math.round(channel.mean)), sha256: asset.sha256});
}
const hardFailures = [];
if (measurements.some((item) => !item.exists)) hardFailures.push("foundation-output-missing");
// The element stage contains one 16:9 source atlas plus transparent actors
// intentionally extracted from that atlas. Only the source atlas is required
// to be 1920x1080; enforcing that size on every actor incorrectly blocks valid
// 200–400px cutouts and prevents the article packaging kit from progressing.
const geometryMeasurements = stageId === "element-atlas"
  ? measurements.filter((item) => !String(item.assetId || "").startsWith("article-element-"))
  : measurements;
if (geometryMeasurements.some((item) => item.exists && (item.width !== 1920 || item.height !== 1080))) hardFailures.push("foundation-output-geometry-invalid");
if (new Set(measurements.map((item) => item.sha256).filter(Boolean)).size !== measurements.filter((item) => item.exists).length) hardFailures.push("foundation-duplicate-pixels");
if (stageId === "element-atlas" && measurements.some((item) => item.exists && (!item.hasAlpha || item.alphaMin === 255))) hardFailures.push("element-atlas-transparent-gutters-missing");
if (stageId === "key-backgrounds" && assets.some((asset) => {
  const sourceType = String(asset.provenance?.sourceType || "");
  return !sourceType.includes("approved-real-sources") && sourceType !== "deterministic-nonphotoreal-editorial-surface";
})) hardFailures.push("key-background-provenance-missing");
if (stageId === "key-backgrounds" && assets.some((asset) => asset.id === "key-bg-model-material-table" && (
  asset.mediaBoundary?.photorealistic !== false
  || asset.mediaBoundary?.containsPresenter !== false
  || asset.mediaBoundary?.containsScreen !== false
  || !asset.mediaBoundary?.allowedEditModes?.includes("full-package")
))) hardFailures.push("full-package-abstract-media-boundary-invalid");
const passed = hardFailures.length === 0 && assets.length >= stage.minimumApproved;
const report = {
  contract: "A1LocalFoundationVisualPreflight/v1",
  stageId,
  verdict: passed ? "PROVISIONAL_PASS" : "BLOCK",
  totalScore: passed ? 20 : 0,
  maxScore: 24,
  referenceMaturity: false,
  provisionalAdmission: passed,
  reason: "Codex subscription visual critic is usage-limited. This deterministic preflight may keep production moving but can never satisfy the 22/24 reference-maturity gate.",
  hardFailures,
  measurements,
  sourceAssetSha256: sha256(measurements),
  reviewedAt: new Date().toISOString(),
};
const reportName = `local-foundation-preflight-${stageId}-latest.json`;
const now = report.reviewedAt;

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  for (const asset of next.library.assets.filter((item) => item.stageId === stageId && ["editorial-artwork", "editorial-element"].includes(item.route))) {
    const item = measurements.find((measurement) => measurement.assetId === asset.id);
    asset.visualCritic = {contract: report.contract, verdict: report.verdict, totalScore: report.totalScore, maxScore: 24, hardFailures, selectedCandidateId: asset.id, reportPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reportName}`, reportSha256: sha256(report), reviewedAt: now, provisionalAdmission: passed, referenceMaturity: false, measurements: item};
    if (passed) {
      asset.status = "approved";
      asset.provenance.reviewed = true;
      asset.review = {status: "approved", note: "本地像素与来源预检通过，允许进入全镜头设计证明；尚未通过 22/24 AI 视觉总监门槛。", reviewedAt: now, reviewedBy: "system-local-preflight", approvedContentSha256: null};
      asset.review.approvedContentSha256 = editorialAssetContentSha256(asset);
    } else {
      asset.status = "blocked";
      asset.review = {status: "revise", note: hardFailures.join("；"), reviewedAt: now, reviewedBy: "system-local-preflight", approvedContentSha256: null};
    }
  }
  next.production.maturityLoop.foundationReports ||= {};
  next.production.maturityLoop.foundationReports[stageId] = report;
  next.production.maturityLoop.rounds.push({contract: "A1VisualMaturityRound/v1", targetType: "foundation-stage-local-preflight", targetId: stageId, round: 1, verdict: report.verdict, score: report.totalScore, maxScore: 24, hardFailures, reportSha256: sha256(report), completedAt: now});
  next.production.maturityLoop.status = passed ? "running-provisional" : "blocked-local-preflight";
  next.production.maturityLoop.nextAction = passed ? `continue-after-local-preflight:${stageId}` : `repair-local-foundation:${stageId}`;
  next.production.maturityLoop.provisionalVisualAdmissions ||= [];
  if (passed && !next.production.maturityLoop.provisionalVisualAdmissions.includes(stageId)) next.production.maturityLoop.provisionalVisualAdmissions.push(stageId);
  const event = createProductionEvent({workspace: current, action: passed ? "local-foundation-preflight-passed" : "local-foundation-preflight-blocked", targetId: stageId, payload: {hardFailures, sourceAssetSha256: report.sourceAssetSha256}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {[reportName]: report}});
  return recalculated;
});

console.log(JSON.stringify({status: report.verdict, stageId, hardFailures, stageGate: updated.stages.find((item) => item.id === stageId)?.gate}, null, 2));
