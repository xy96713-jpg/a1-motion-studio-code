#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const {artifactDir} = projectDirs(appRoot);
const force = process.argv.includes("--force");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const asset = workspace.library.assets.find((item) => item.id === "typography-direction-plan");
const source = asset?.typographyDirectionV3;
if (!asset || source?.contract !== "A1ArticleTypographyDirectionBoard/v3" || !Array.isArray(source.frames) || source.frames.length < 6) throw new Error("typography-direction-v3-not-ready");
const images = source.frames.map((frame) => {
  const file = path.join(publicRoot, frame.publicUrl.replace(/^\/+/, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(file)) throw new Error(`typography-direction-frame-missing:${frame.id}`);
  return file;
});
const candidates = source.frames.map((frame) => ({candidateId: frame.id, direction: frame.direction, expectedText: frame.exactText, imagePublicUrl: frame.publicUrl}));
const report = await runVisualMaturityCritic({
  scope: "asset-board",
  images,
  candidates,
  context: {
    articleTitle: workspace.article.title,
    articleThesis: workspace.article.thesis,
    visualThesis: workspace.article.visualThesis,
    stageId: "typography-direction-v3",
    round: source.round,
    sourceSha256: source.sourceSha256,
    benchmark: "Judge these six isolated production frames as one coherent article typography system. They must cover presenter overlay, real screen causal action, generated display glyph, editable pixel emphasis, evidence window and material process without collapsing into one shared card/HUD topology.",
    exactTextRule: "Every expected Chinese phrase must be visibly correct. Generated display glyphs may be raster texture only because an editable local-font shadow is present; real UI text must remain source-bound and must not be regenerated.",
    motionRule: "Infer whether each frame has a distinct object-bound motion phrase: presenter phrase enters from human gesture/negative space; screen selection causes rewrite and return; glyph words have independent actor or material beats; method has a three-beat progression.",
    sequenceRule: "Require strong silhouette and density contrast across the six frames and at least two credible handoff actors. Reject repeated full-frame logos, explanatory HUD, generic lower thirds, floating labels or face occlusion.",
  },
  cacheDir: path.join(artifactDir, "visual-critic-cache"),
  force,
});
const reportSha256 = sha256(report);
const exactTextPass = report.candidates.every((candidate) => candidate.exactTextStatus === "verified");
const passed = report.verdict === "PASS" && report.totalScore >= 22 && !report.hardFailures.length && exactTextPass;
const now = new Date().toISOString();
const reportName = "typography-direction-critic-v1-latest.json";

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === "typography-direction-plan");
  target.visualCritic = {contract: report.contract, verdict: passed ? "PASS" : report.verdict, totalScore: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, selectedCandidateId: report.selectedCandidateId, reportPublicUrl: `/${phaseRelative}/${reportName}`, reportSha256, reviewedAt: now, exactTextPass};
  if (passed) {
    target.status = "approved";
    target.provenance.reviewed = true;
    target.review = {status: "approved", note: `文章字体包装系统自动视觉红队 ${report.totalScore}/24，六类镜头均通过且中文字核对通过。`, reviewedAt: now, reviewedBy: "system-visual-critic", approvedContentSha256: null};
    target.review.approvedContentSha256 = editorialAssetContentSha256(target);
    target.contentSha256 = target.review.approvedContentSha256;
  } else {
    const nextRound = Math.max(Number(source.round || 1) + 1, Number(target.visualRevision?.round || 1) + 1);
    target.status = "revise";
    target.review = {status: "revise", note: `文章字体包装系统 ${report.totalScore}/24；${report.repairPlan.highestImpact}`, reviewedAt: now, reviewedBy: "system-visual-critic", approvedContentSha256: null};
    target.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: nextRound, sourceReportSha256: reportSha256, prompt: `${report.repairPlan.highestImpact}\n保留：${report.repairPlan.retain.join("；")}\n删除：${report.repairPlan.remove.join("；")}\n${report.repairPlan.nextPrompt}`, createdAt: now};
  }
  next.production.maturityLoop.foundationReports ||= {};
  next.production.maturityLoop.foundationReports["typography-direction-v3"] = {contract: "A1FoundationVisualCriticReport/v1", verdict: passed ? "PASS" : report.verdict, totalScore: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, sourceAssetSha256: source.sourceSha256, selectedAssetIds: passed ? [target.id] : [], reportPublicUrl: `/${phaseRelative}/${reportName}`, reportSha256, contactSheetPublicUrl: target.assetUri, reviewedAt: now};
  next.production.maturityLoop.rounds.push({contract: "A1VisualMaturityRound/v1", targetType: "typography-direction", targetId: target.id, round: source.round, verdict: passed ? "PASS" : report.verdict, score: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, reportSha256, completedAt: now});
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.nextAction = passed ? "continue-after-typography-direction-pass" : `rebuild-typography-direction-v3:round-${target.visualRevision.round}`;
  const event = createProductionEvent({workspace: current, action: passed ? "typography-direction-v3-passed" : "typography-direction-v3-revision-required", targetId: target.id, payload: {reportSha256, totalScore: report.totalScore, exactTextPass, hardFailures: report.hardFailures}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {[reportName]: report}});
  return recalculated;
});

console.log(JSON.stringify({status: passed ? "PASS" : report.verdict, score: report.totalScore, maxScore: 24, exactTextPass, hardFailures: report.hardFailures, reportPublicUrl: `/${phaseRelative}/${reportName}`, typographyGate: updated.stages.find((item) => item.id === "typography-board")?.gate}, null, 2));
