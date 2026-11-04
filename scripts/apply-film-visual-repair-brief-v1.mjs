#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const qualityRelative = `${phaseRelative}/current-film-visual-quality-v1`;
const reportPath = path.join(publicDir, "current-film-visual-quality-v1/visual-quality-review.json");
const briefPath = path.join(publicDir, "current-film-visual-quality-v1/visual-repair-brief.json");
const now = new Date().toISOString();
const archiveStamp = now.replace(/[:.]/gu, "-");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

if (!fs.existsSync(reportPath) || !fs.existsSync(briefPath)) throw new Error("film-visual-repair-report-missing");
const report = readJson(reportPath);
const brief = readJson(briefPath);
if (report.verdict !== "BLOCK" || brief.verdict !== "BLOCK") throw new Error("film-visual-repair-brief-not-blocked");
if (report.reportSha256 && brief.sourceReportSha256 !== report.reportSha256) throw new Error("film-visual-repair-report-sha-mismatch");

const candidateRepairText = (report.candidates || []).map((item) => item.repairBrief || "").join("\n");
const retainShotIds = [...new Set([...(report.repairPlan?.retain || []).join("\n").matchAll(/ED-\d{2}/gu)].map((match) => match[0]))];
const allTargetShotIds = [...new Set([...candidateRepairText.matchAll(/ED-\d{2}/gu)].map((match) => match[0]))].filter((shotId) => !retainShotIds.includes(shotId)).sort();
const requestedShotIds = process.argv.find((item) => item.startsWith("--shots="))?.slice("--shots=".length).split(",").map((item) => item.trim()).filter(Boolean) || [];
if (requestedShotIds.some((shotId) => !allTargetShotIds.includes(shotId))) throw new Error(`film-visual-repair-target-outside-report:${requestedShotIds.filter((shotId) => !allTargetShotIds.includes(shotId)).join(",")}`);
const targetShotIds = requestedShotIds.length ? allTargetShotIds.filter((shotId) => requestedShotIds.includes(shotId)) : allTargetShotIds;
if (!targetShotIds.length) throw new Error("film-visual-repair-targets-missing");

const perShotPrompt = (shotId) => {
  const prompt = String(brief.repairPlan?.nextPrompt || "");
  const start = prompt.indexOf(shotId);
  if (start < 0) return `${brief.repairPlan?.highestImpact || "重做对象级视觉因果链。"}\n${prompt}`.trim();
  const rest = prompt.slice(start);
  const next = rest.slice(shotId.length).search(/ED-\d{2}/u);
  return (next < 0 ? rest : rest.slice(0, shotId.length + next)).trim();
};

const archiveRoot = path.join(publicDir, `shot-candidates-rejected-film-visual-quality-v1/${archiveStamp}`);
const archivedShotIds = [];
for (const shotId of targetShotIds) {
  const source = path.join(publicDir, "shot-candidates", shotId);
  if (!fs.existsSync(source)) continue;
  const destination = path.join(archiveRoot, shotId);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.cpSync(source, destination, {recursive: true, errorOnExist: true});
  archivedShotIds.push(shotId);
}

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const rejected540p = structuredClone(current.production.release.review540p);

  // A retain item may mention a shot id in the same prose as a repair item.
  // Restore any such shot from the reversible history created by an older
  // parser instead of silently regenerating a critic-approved composition.
  for (const asset of next.library.assets.filter((item) => item.route === "shot-composition" && retainShotIds.includes(item.shotDemand?.shotId))) {
    const rejectedRound = [...(asset.revisionHistory || [])].reverse().find((item) => item.reason === "blocked-by-full-film-visual-quality-review" && item.candidates?.length);
    if (!rejectedRound || asset.candidates?.length) continue;
    asset.candidates = structuredClone(rejectedRound.candidates || []);
    asset.selectedCandidateId = rejectedRound.selectedCandidateId || null;
    asset.candidateRender = structuredClone(rejectedRound.candidateRender || null);
    asset.visualCritic = structuredClone(rejectedRound.visualCritic || null);
    asset.status = "approved";
    asset.review = {status: "approved", note: "全片审美报告明确列为保留镜头；已从可逆历史恢复，未重新生成。", reviewedAt: now, reviewedBy: "system-film-visual-critic-retain-guard", approvedContentSha256: asset.candidates.find((candidate) => candidate.candidateId === asset.selectedCandidateId)?.candidateSha256 || null};
    delete asset.filmVisualRepair;
    rejectedRound.restoredAsExplicitRetain = true;
    rejectedRound.restoredAt = now;
  }

  for (const asset of next.library.assets.filter((item) => item.route === "shot-composition" && targetShotIds.includes(item.shotDemand?.shotId))) {
    const shotId = asset.shotDemand.shotId;
    asset.revisionHistory ||= [];
    if (asset.candidates?.length || asset.selectedCandidateId || asset.candidateRender || asset.visualCritic) asset.revisionHistory.push({
      contract: "A1RejectedShotCandidateRound/v1",
      round: Number(asset.visualRevision?.round || 1),
      reason: "blocked-by-full-film-visual-quality-review",
      candidates: asset.candidates || [],
      selectedCandidateId: asset.selectedCandidateId || null,
      candidateRender: asset.candidateRender || null,
      visualCritic: asset.visualCritic || null,
      sourceFilmVisualQualityReportSha256: brief.sourceReportSha256,
      archivedPublicUrl: archivedShotIds.includes(shotId) ? `/${qualityRelative.replace("current-film-visual-quality-v1", `shot-candidates-rejected-film-visual-quality-v1/${archiveStamp}`)}/${shotId}/contact-sheet.png` : null,
      archivedAt: now,
    });
    asset.candidates = [];
    asset.selectedCandidateId = null;
    delete asset.candidateRender;
    delete asset.visualCritic;
    delete asset.automationBlock;
    asset.status = "brief-ready";
    asset.review = {status: "pending", note: `全片视觉审计已定点退回 ${shotId}；保留真实来源，重做对象拓扑与动作因果。`, reviewedAt: now, reviewedBy: "system-film-visual-critic", approvedContentSha256: null};
    asset.visualRevision = {
      contract: "A1VisualRevisionBrief/v1",
      round: Number(asset.visualRevision?.round || 1) + 1,
      sourceReportSha256: brief.sourceReportSha256,
      prompt: perShotPrompt(shotId),
      createdAt: now,
    };
    asset.filmVisualRepair = {
      contract: "A1FilmVisualRepairBinding/v1",
      sourceArtifactSha256: brief.sourceArtifactSha256,
      sourceReportSha256: brief.sourceReportSha256,
      hardFailures: brief.hardFailures,
      prompt: perShotPrompt(shotId),
      preserveRealSource: asset.shotDemand.editMode === "screen-demo",
      appliedAt: now,
    };
  }

  next.production.maturityLoop.shotReports ||= {};
  for (const shotId of retainShotIds) {
    const asset = next.library.assets.find((item) => item.shotDemand?.shotId === shotId);
    if (asset?.visualCritic) next.production.maturityLoop.shotReports[shotId] = asset.visualCritic;
  }
  for (const shotId of targetShotIds) delete next.production.maturityLoop.shotReports[shotId];
  next.production.maturityLoop.provisionalVisualAdmissions = [...new Set([...(next.production.maturityLoop.provisionalVisualAdmissions || []).filter((shotId) => !targetShotIds.includes(shotId)), ...retainShotIds.filter((shotId) => next.library.assets.find((item) => item.shotDemand?.shotId === shotId)?.review?.status === "approved")])];
  next.production.maturityLoop.rounds = (next.production.maturityLoop.rounds || []).map((round) => targetShotIds.includes(round.targetId)
    ? {...round, supersededByFilmVisualRepair: true, supersededAt: now}
    : round);
  delete next.production.maturityLoop.representativeMotionReport;
  delete next.production.maturityLoop.allShotSelectedReview;
  next.production.maturityLoop.currentStage = "shot-candidates";
  next.production.maturityLoop.status = "automatic-film-visual-repair";
  next.production.maturityLoop.nextAction = `rebuild-film-visual-repair-shots:${targetShotIds.join(",")}`;
  next.production.acceptedShotIr = {contract: "A1AcceptedShotIRSet/v2", status: "locked-upstream-visual-repair", sourceWorkspaceSha256: null, shotCount: 0, sha256: null, publicUrl: null, compiledAt: null};
  next.production.motion = {contract: "A1RepresentativeMotionGate/v1", status: "locked-upstream-visual-repair", representativePlan: null, previewArtifact: null, review: {status: "pending", score: null, maxScore: 24, hardFailures: [], reviewedAt: null}, fullMotionAllowed: false};
  next.production.assembly.status = "film-visual-repair-shot-rebuild-pending";
  next.production.release.review540p = {status: "locked-upstream-visual-repair", publicUrl: null, sha256: null, renderedAt: null, durationMs: null, width: 960, height: 540, approvedAt: null};
  next.production.release.final1080p = {status: "locked", publicUrl: null, sha256: null, requestedAt: null};
  next.production.release.davinciPackage = {status: "locked", publicUrl: null, sha256: null};
  next.production.release.visualQualityReview = {...next.production.release.visualQualityReview, status: "blocked", scope: "targeted-shot-repair", verdict: "BLOCK", sourceArtifactSha256: brief.sourceArtifactSha256, reportPublicUrl: `/${qualityRelative}/visual-quality-review.json`, reportSha256: brief.sourceReportSha256, repairBriefPublicUrl: `/${qualityRelative}/visual-repair-brief.json`, repairBriefSha256: sha256(fs.readFileSync(briefPath)), nextAction: `rebuild-targeted-shots:${targetShotIds.join(",")}`, updatedAt: now};
  next.production.filmVisualRepair = {contract: "A1FilmVisualRepairRun/v1", status: "targeted-shot-rebuild", targetShotIds, retainShotIds, archivedShotIds, rejected540p, sourceArtifactSha256: brief.sourceArtifactSha256, sourceReportSha256: brief.sourceReportSha256, hardFailures: brief.hardFailures, repairPlan: brief.repairPlan, appliedAt: now};

  const event = createProductionEvent({workspace: current, action: "film-visual-repair-brief-applied", targetId: brief.sourceReportSha256, payload: {targetShotIds, retainShotIds, archivedShotIds, preservedRealScreenShotIds: targetShotIds.filter((id) => ["ED-24", "ED-27"].includes(id)), sourceArtifactSha256: brief.sourceArtifactSha256, sourceReportSha256: brief.sourceReportSha256}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {"current-film-visual-quality-v1/applied-repair-run.json": next.production.filmVisualRepair}});
  return recalculated;
});

console.log(JSON.stringify({status: "FILM_VISUAL_REPAIR_BRIEF_APPLIED", targetShotIds, retainShotIds, archivedShotIds, preservedRealScreenShotIds: targetShotIds.filter((id) => ["ED-24", "ED-27"].includes(id)), nextAction: updated.production.maturityLoop.nextAction, workspaceSha256: updated.workspaceSha256}, null, 2));
