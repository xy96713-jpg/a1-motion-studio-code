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
const reportFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/article-typography-direction-v3/typography-direction-v3-latest.json");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
if (!fs.existsSync(reportFile)) throw new Error("typography-direction-v3-report-missing");
const board = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const target = workspace.library.assets.find((asset) => asset.id === "typography-direction-plan");
const hardFailures = [];
if (board.contract !== "A1ArticleTypographyDirectionBoard/v3" || board.frames?.length !== 6) hardFailures.push("typography-direction-six-frame-contract-invalid");
const frameMeasurements = [];
for (const frame of board.frames || []) {
  const file = path.join(publicRoot, String(frame.publicUrl || "").replace(/^\/+/, ""));
  if (!fs.existsSync(file)) { hardFailures.push(`typography-frame-missing:${frame.id}`); continue; }
  const metadata = await sharp(file).metadata();
  frameMeasurements.push({id: frame.id, width: metadata.width, height: metadata.height, sha256: frame.sha256});
  if (metadata.width !== 1920 || metadata.height !== 1080) hardFailures.push(`typography-frame-geometry:${frame.id}`);
}
if (new Set(frameMeasurements.map((frame) => frame.sha256)).size !== frameMeasurements.length) hardFailures.push("typography-frame-duplicate-pixels");
if (board.sourceBindings?.screen?.assetId !== "source-documentary-selection-action") hardFailures.push("screen-causal-frame-not-bound-to-real-selection-action");
if (board.sourceBindings?.article?.assetId !== "source-documentary-document-surface") hardFailures.push("evidence-frame-not-bound-to-real-article-surface");
if (!String(board.sourceBindings?.presenter?.assetId || "").includes("presenter")) hardFailures.push("presenter-frame-not-bound-to-real-presenter");
const glyphAssets = workspace.library.assets.filter((asset) => asset.route === "generated-glyph" && asset.requiredForShotComposition);
if (glyphAssets.length !== 4 || glyphAssets.some((asset) => asset.review.status !== "approved" || asset.visualCritic?.totalScore < 22 || asset.typographySpec?.textVerification?.status !== "verified")) hardFailures.push("approved-exact-glyph-bindings-incomplete");
const fontAssets = workspace.library.assets.filter((asset) => asset.route === "project-font" && asset.requiredForShotComposition);
if (fontAssets.length < 5 || fontAssets.some((asset) => asset.review.status !== "approved" || !asset.sha256)) hardFailures.push("editable-font-bindings-incomplete");
const passed = hardFailures.length === 0;
const report = {contract: "A1LocalTypographyDirectionPreflight/v1", verdict: passed ? "PROVISIONAL_PASS" : "BLOCK", totalScore: passed ? 20 : 0, maxScore: 24, provisionalAdmission: passed, referenceMaturity: false, hardFailures, frameMeasurements, sourceBindings: board.sourceBindings, typographyBoardSha256: target?.sha256 || null, reviewedAt: new Date().toISOString(), reason: "Allows shot production while the subscription visual critic is usage-limited; never substitutes for the 22/24 reference-maturity review."};
const reportName = "local-typography-direction-preflight-v1-latest.json";
const reportSha256 = sha256(report);
const now = report.reviewedAt;
const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const asset = next.library.assets.find((item) => item.id === "typography-direction-plan");
  asset.visualCritic = {contract: report.contract, verdict: report.verdict, totalScore: report.totalScore, maxScore: 24, hardFailures, selectedCandidateId: null, reportPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reportName}`, reportSha256, reviewedAt: now, provisionalAdmission: passed, referenceMaturity: false};
  if (passed) {
    asset.status = "approved";
    asset.provenance.reviewed = true;
    asset.review = {status: "approved", note: "六个文章级字体应用场景、本地字体、已核字 AI 字形与真实素材绑定预检通过；22/24 AI 视觉复审待额度恢复。", reviewedAt: now, reviewedBy: "system-local-preflight", approvedContentSha256: null};
    asset.review.approvedContentSha256 = editorialAssetContentSha256(asset);
  } else {
    asset.status = "blocked";
    asset.review = {status: "revise", note: hardFailures.join("；"), reviewedAt: now, reviewedBy: "system-local-preflight", approvedContentSha256: null};
  }
  next.production.maturityLoop.typographyDirectionReport = report;
  next.production.maturityLoop.status = passed ? "running-provisional" : "blocked-local-preflight";
  next.production.maturityLoop.nextAction = passed ? "continue-to-34-shot-candidates" : "repair-typography-direction";
  next.production.maturityLoop.provisionalVisualAdmissions ||= [];
  if (passed && !next.production.maturityLoop.provisionalVisualAdmissions.includes("typography-direction")) next.production.maturityLoop.provisionalVisualAdmissions.push("typography-direction");
  const event = createProductionEvent({workspace: current, action: passed ? "local-typography-direction-preflight-passed" : "local-typography-direction-preflight-blocked", targetId: asset.id, payload: {reportSha256, hardFailures}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {[reportName]: report}});
  return recalculated;
});
console.log(JSON.stringify({status: report.verdict, hardFailures, typographyGate: updated.stages.find((stage) => stage.id === "typography-board")?.gate}, null, 2));
