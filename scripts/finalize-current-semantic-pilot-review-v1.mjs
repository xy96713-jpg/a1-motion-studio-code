#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackageSemanticPixelAudit} from "../apps/studio-next/src/lib/a1-package-semantic-pixel-audit-v1.mjs";
import {auditUniqueArtifactCandidates} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const assessmentPath = path.join(root, ".codex-artifacts/system-progress-system-line/semantic-pilot-v1/actual-pixel-assessments.json");
const outputRelativePath = "generated/system-line/editorial-asset-workbench-v1/semantic-pilot-v1/contact-sheet.png";
const outputPath = path.join(publicRoot, outputRelativePath);
const outputPublicUrl = `/${outputRelativePath}`;
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const now = new Date().toISOString();
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (!fs.existsSync(assessmentPath)) throw new Error("semantic-pilot-actual-pixel-assessments-missing");
const assessments = JSON.parse(fs.readFileSync(assessmentPath, "utf8"));
if (assessments.contract !== "A1SemanticPilotActualPixelAssessments/v1") throw new Error("semantic-pilot-assessment-contract-invalid");

async function buildContactSheet(candidates) {
  const width = 1920;
  const height = 1080;
  const cardWidth = 600;
  const cardHeight = 338;
  const top = 330;
  const lefts = [30, 660, 1290];
  const base = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" fill="#0e1011"/><text x="50" y="105" font-family="Arial, sans-serif" font-size="50" font-weight="700" fill="#f0f1ec">三张语义试验 · 不是全片推荐</text><text x="50" y="165" font-family="Arial, sans-serif" font-size="25" fill="#c9ef39">只看画面是否真的表达文章，不在这里选 Assembly</text></svg>`);
  const composite = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const image = await sharp(path.join(publicRoot, candidate.publicUrl.replace(/^\/+/, ""))).resize({width: cardWidth, height: cardHeight, fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${cardWidth}" height="90" xmlns="http://www.w3.org/2000/svg"><rect width="${cardWidth}" height="90" fill="#171a1b"/><text x="18" y="34" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#c9ef39">${candidate.shotId}</text><text x="18" y="68" font-family="Arial, sans-serif" font-size="19" fill="#f0f1ec">${candidate.shortLabel}</text></svg>`);
    composite.push({input: image, left: lefts[index], top}, {input: label, left: lefts[index], top: top + cardHeight});
  }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  await sharp(base).composite(composite).png().toFile(outputPath);
  return {publicUrl: outputPublicUrl, sha256: fileSha256(outputPath), width, height};
}

const snapshot = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const pilot = snapshot.production.shotIntelligence.semanticPilot;
const jobs = (pilot.jobIds || []).map((id) => snapshot.production.generation.jobs.find((job) => job.id === id));
if (jobs.length !== 3 || jobs.some((job) => job?.status !== "complete" || !job.output?.publicUrl || !job.output?.sha256)) throw new Error("semantic-pilot-three-complete-jobs-required");
const briefByShot = new Map(snapshot.production.shotIntelligence.semanticDesignBriefSet.briefs.map((brief) => [brief.shotId, brief]));
const candidates = jobs.map((job) => {
  const brief = briefByShot.get(job.shotId);
  const assessment = assessments.items.find((item) => item.shotId === job.shotId && item.artifactSha256 === job.output.sha256);
  if (!brief || !assessment) throw new Error(`semantic-pilot-assessment-binding-missing:${job.shotId}`);
  const audit = buildPackageSemanticPixelAudit({brief, artifact: {publicUrl: job.output.publicUrl, sha256: job.output.sha256, width: job.output.width, height: job.output.height}, assessment, now});
  return {candidateId: `semantic-pilot-${job.shotId.toLowerCase()}-${job.output.sha256.slice(0, 12)}`, shotId: job.shotId, publicUrl: job.output.publicUrl, artifact: {publicUrl: job.output.publicUrl, sha256: job.output.sha256, width: job.output.width, height: job.output.height}, generationJobId: job.id, briefSha256: brief.briefSha256, shortLabel: assessment.shortLabel, semanticAudit: audit, status: audit.status, recommendationEligible: false, assemblyEligible: false};
});
const duplicateAudit = auditUniqueArtifactCandidates(candidates);
if (duplicateAudit.status !== "PASS") for (const candidate of candidates) candidate.status = "VISUAL_REJECTED";
const contactSheet = await buildContactSheet(candidates);

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== snapshot.workspaceSha256) throw new Error("semantic-pilot-workspace-changed-before-finalize");
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  runtime.status = "SEMANTIC_PILOT_REVIEW_REQUIRED";
  runtime.semanticPilot = {...runtime.semanticPilot, status: "SEMANTIC_PILOT_REVIEW_REQUIRED", candidateIds: candidates.map((candidate) => candidate.candidateId), candidates, duplicateAudit, contactSheet, recommendation: null, selected: null, currentAssembly: [], imageGenerationPerformed: true, criticPerformed: false, layerReconstructionPerformed: false, motionPerformed: false, requiresUserAction: true, updatedAt: now};
  runtime.wholeFilmBatchRecommendation = {...runtime.wholeFilmBatchRecommendation, status: "SEMANTIC_REVIEW_REQUIRED", explorationOnly: true, recommendation: null, selected: null, currentAssembly: [], autoRecommendationAllowed: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, updatedAt: now};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.authority.currentStage = "semantic-pilot-review";
  next.production.authority.nextAction = "semantic-pilot-review-required";
  next.production.authority.nextActionLabel = "请一次查看 3 张语义试验画面";
  next.production.authority.requiresUserAction = true;
  const event = createProductionEvent({workspace: current, action: "semantic-pilot-review-required", targetId: contactSheet.sha256, payload: {candidateCount: candidates.length, uniqueArtifactCount: duplicateAudit.uniqueArtifactCount, statuses: candidates.map((item) => ({shotId: item.shotId, status: item.status, artifactSha256: item.artifact.sha256})), recommendation: null, selected: null, assemblyCreated: false, criticPerformed: false, layerReconstructionPerformed: false, motionPerformed: false, singleWriterTaskId}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const report = {contract: "A1SemanticPilotReviewReport/v1", status: "SEMANTIC_PILOT_REVIEW_REQUIRED", candidates, duplicateAudit, contactSheet, recommendation: null, selected: null, currentAssembly: [], queue: recalculated.production.generation.summary, singleWriterTaskId, generatedAt: now};
  persistProjectState(appRoot, recalculated, {event, files: {"semantic-pilot-v1/report.json": report, "semantic-pilot-v1/actual-pixel-assessments.json": assessments}});
  return {workspace: recalculated, report};
});

console.log(JSON.stringify({status: result.report.status, candidates: result.report.candidates.map((item) => ({shotId: item.shotId, status: item.status, artifactSha256: item.artifact.sha256, publicUrl: item.publicUrl})), contactSheet: result.report.contactSheet, queue: result.report.queue, workspaceSha256: result.workspace.workspaceSha256, singleWriterTaskId}, null, 2));
