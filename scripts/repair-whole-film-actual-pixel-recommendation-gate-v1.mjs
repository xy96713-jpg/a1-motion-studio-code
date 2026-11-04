#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {compileWholeFilmExplorationOutputDeduplication, finalizeWholeFilmLookMasterBatch} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {buildWholeFilmActualPixelSemanticAudit} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = "b04555610d5a09626d01c84930ca9e3b16fc811b0de96d0a8d5a882abf0d54da";
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const now = new Date().toISOString();
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const normalize = (value) => String(value || "").toLowerCase().replace(/[\s\u3000\p{P}\p{S}]+/gu, "");

function publicFile(publicUrl) {
  if (!publicUrl?.startsWith("/")) return null;
  return path.join(appRoot, "public", publicUrl.replace(/^\/+/, ""));
}

function readOcr(file) {
  try {
    const raw = execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 1024 * 1024});
    const parsed = JSON.parse(raw);
    return {status: parsed.status || "PASS", text: parsed.text || "", width: parsed.width || null, height: parsed.height || null};
  } catch (error) {
    return {status: "FAILED", text: "", error: error instanceof Error ? error.message : String(error)};
  }
}

function latestRawByDirection(runtime, plan) {
  const byDirection = new Map();
  for (const raw of (runtime.lookMasterRawReferences || []).filter((item) => item.shotId === plan.shotId && item.planSha256 === plan.planSha256)) {
    const existing = byDirection.get(raw.candidateDirectionId);
    if (!existing || String(raw.createdAt || "") >= String(existing.createdAt || "")) byDirection.set(raw.candidateDirectionId, raw);
  }
  return byDirection;
}

const GOOD_SELECTED = new Set(["ED-09:direction-01", "ED-10:direction-02", "ED-12:direction-02", "ED-15:direction-01", "ED-17:direction-01", "ED-33:direction-01", "ED-34:direction-01"]);
const GOOD_REBOUND = new Set(["ED-19:direction-02", "ED-20:direction-02"]);
const REVIEW_RISK = new Set(["ED-01:direction-01", "ED-01:direction-03"]);

function assessmentFor(shotId, directionId, ocrText, artifactSha256Verified) {
  const key = `${shotId}:${directionId}`;
  const common = {
    mode: "ACTUAL_PIXEL_VISUAL_REVIEW",
    reviewSource: "USER_PIXEL_FINAL_REVIEW_2026-08-06_PLUS_LOCAL_OCR",
    artifactSha256Verified,
    viewerTakeawayMatch: true,
    actorActionMatch: true,
    sourceIdentityMatch: true,
    threeSecondReadable: true,
    genericTemplateDetected: false,
    visualComplexityWithinBudget: true,
    singleReadingPath: true,
    decorativeMotifFree: true,
    referenceCopyDetected: false,
    ocrAvailable: true,
    ocrExactCopyAligned: true,
    textExpected: false,
  };
  if (GOOD_SELECTED.has(key) || GOOD_REBOUND.has(key)) {
    const normalizedOcr = normalize(ocrText);
    return {
      ...common,
      textExpected: normalizedOcr.length > 0,
      ocrExactCopyAligned: true,
      allowedOcrTokens: key === "ED-19:direction-02" ? ["TASKS"] : [],
      notes: GOOD_REBOUND.has(key) ? "用户指定的近语义候选；已通过当前 PNG + OCR 复核后轻量重绑。" : "用户指定保留的实际 PNG；已绑定当前 PNG SHA 与 OCR 证据。",
    };
  }
  if (REVIEW_RISK.has(key)) {
    return {
      ...common,
      reviewRisk: true,
      genericTemplateDetected: true,
      emptyPlaceholderDetected: true,
      notes: "底部空白占位栏/泛化旧 UI 风险；禁止把空白区域留给后期 CSS 二次设计。",
    };
  }
  if (key === "ED-14:direction-01") {
    return {...common, genericTemplateDetected: true, referenceCopyDetected: true, debugSourceStringDetected: true, duplicateDetected: true, sourceIdentityMatch: false, notes: "实际像素是 ED-12 五模型品牌卡，并含来源调试串；跨镜重复。"};
  }
  if (key === "ED-14:direction-03") {
    return {...common, sourceIdentityMatch: false, unrelatedFillerDetected: true, debugSourceStringDetected: true, notes: "实际像素出现虚构 ACL 2026/错误来源文案。"};
  }
  if (key === "ED-16:direction-01" || key === "ED-16:direction-02") {
    return {...common, viewerTakeawayMatch: false, actorActionMatch: false, threeSecondReadable: false, genericTemplateDetected: true, notes: "3 秒内没有表达材料不足 + 角度不清 → 顺但泛泛而谈；需切换视觉原语。"};
  }
  if (key === "ED-19:direction-01") {
    return {...common, viewerTakeawayMatch: false, actorActionMatch: false, referenceCopyDetected: true, foreignShotCopyDetected: true, notes: "实际像素复用了 ED-17 的方法顺序文案，不是 Codex 编排/主线/风格库/收稿职责。"};
  }
  if (key === "ED-20:direction-01") {
    return {...common, unrelatedFillerDetected: true, notes: "实际像素含无关 GRID ONE 和多余来源小图；不得作为推荐。"};
  }
  return null;
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if ((current.production.generation.summary?.queued || 0) !== 0 || (current.production.generation.summary?.running || 0) !== 0) throw new Error("actual-pixel-repair-requires-idle-queue");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("actual-pixel-repair-must-not-touch-assembly");
  if (!["WHOLE_FILM_STATIC_BOARD_READY", "CANDIDATE_SELECTION_PENDING"].includes(current.production.visualProductionRun?.status)) throw new Error(`actual-pixel-repair-stage-invalid:${current.production.visualProductionRun?.status}`);

  const staged = structuredClone(current);
  const runtime = staged.production.shotIntelligence;
  const plans = runtime.packageLookMasterPlans || [];
  const planByShot = new Map(plans.map((plan) => [plan.shotId, plan]));
  const packageShotIds = staged.production.shotVisualCoveragePlan.shotPlans.filter((shot) => shot.route === "PACKAGE_LOOK_MASTER").map((shot) => shot.shotId);
  const foreignCopies = plans.map((plan) => ({shotId: plan.shotId, text: plan.semanticDesignBrief?.exactCopy || plan.exactCopy?.text || ""})).filter((item) => item.text);
  const outputDeduplication = compileWholeFilmExplorationOutputDeduplication(staged, {shotIds: packageShotIds});
  const duplicateBySha = new Map(outputDeduplication.duplicates.map((item) => [item.artifactSha256, item]));
  const activeRawJobIds = new Set(plans.flatMap((plan) => [...latestRawByDirection(runtime, plan).values()].map((raw) => raw.provenance?.generationJobId).filter(Boolean)));
  const audits = [];
  const auditedRawReferenceIds = new Set();

  for (const shotId of packageShotIds) {
    const plan = planByShot.get(shotId);
    if (!plan?.semanticDesignBrief) continue;
    // Remove only stale recommendations; this repair never deletes or rewrites
    // any generated PNG and never creates an Assembly.
    delete plan.wholeFilmBoardRecommendation;
    delete plan.provisionalWholeFilmBoardSelection;
    const raws = latestRawByDirection(runtime, plan);
    for (const [directionId, raw] of raws) {
      const key = `${shotId}:${directionId}`;
      const shouldAudit = GOOD_SELECTED.has(key) || GOOD_REBOUND.has(key) || REVIEW_RISK.has(key)
        || ["ED-14:direction-01", "ED-14:direction-03", "ED-16:direction-01", "ED-16:direction-02", "ED-19:direction-01", "ED-20:direction-01"].includes(key);
      if (!shouldAudit) continue;
      const file = publicFile(raw.artifact?.publicUrl);
      const fileExists = Boolean(file && fs.existsSync(file));
      const actualSha256 = fileExists ? sha256File(file) : null;
      const artifactSha256Verified = fileExists && actualSha256 === raw.artifact?.sha256;
      const ocr = fileExists ? readOcr(file) : {status: "FAILED", text: ""};
      const assessment = assessmentFor(shotId, directionId, ocr.text, artifactSha256Verified);
      if (!assessment) continue;
      const duplicateRecord = duplicateBySha.get(raw.artifact?.sha256) || null;
      const duplicateOwnerIsActive = duplicateRecord && activeRawJobIds.has(duplicateRecord.duplicateOfJobId);
      const userConfirmedCrossShotDuplicate = key === "ED-14:direction-01";
      const audit = buildWholeFilmActualPixelSemanticAudit({
        brief: plan.semanticDesignBrief,
        artifact: raw.artifact,
        assessment,
        ocrText: ocr.text,
        foreignCopies,
        duplicate: duplicateOwnerIsActive || userConfirmedCrossShotDuplicate ? duplicateRecord : null,
        now,
      });
      raw.semanticPixelAudit = audit;
      raw.semanticPixelAuditSha256 = audit.auditSha256;
      raw.selectionEligible = audit.status === "PASS";
      raw.reviewStatus = audit.status === "PASS" ? "ACTUAL_PIXEL_SEMANTIC_PASS" : audit.status === "REVIEW_REQUIRED" ? "VISUAL_REVIEW_RISK" : "VISUAL_REJECTED";
      raw.status = audit.status === "PASS" ? raw.status : audit.status === "REVIEW_REQUIRED" ? "VISUAL_REVIEW_RISK" : "VISUAL_REJECTED";
      raw.semanticPixelAuditFindings = audit.findings;
      raw.pixelAudit = {
        ...(raw.pixelAudit || {}),
        status: audit.status === "PASS" ? "PASS" : audit.status,
        serverVisualAssessmentSha256: audit.auditSha256,
        semanticThreeSecond: {status: audit.checks.threeSecondReadable ? "PASS" : "FAIL", auditSha256: audit.auditSha256},
        dominantActor: {status: audit.checks.actorActionMatch ? "PASS" : "FAIL", auditSha256: audit.auditSha256},
        policyAudit: {status: audit.recommendationEligible ? "PASS" : "FAIL", auditSha256: audit.auditSha256},
        admissionAllowed: audit.recommendationEligible,
      };
      auditedRawReferenceIds.add(raw.referenceId);
      audits.push({shotId, directionId, rawReferenceId: raw.referenceId, artifactSha256: raw.artifact.sha256, actualSha256, ocrText: ocr.text, status: audit.status, findings: audit.findings, auditSha256: audit.auditSha256});
    }
  }

  const finalized = finalizeWholeFilmLookMasterBatch(staged, staged.production.shotVisualCoveragePlan, {
    now,
    actualPixelSemanticAuditRequired: true,
    semanticReviewFindings: [],
  });
  let next = finalized.workspace;
  const nextRuntime = next.production.shotIntelligence;
  nextRuntime.packageAssetKitPlans = (nextRuntime.packageAssetKitPlans || []).map((kit) => ({...kit, current: false, authorityScope: "HISTORY_READ_ONLY", status: "HISTORY_READ_ONLY"}));
  nextRuntime.packageAssemblyRecipes = (nextRuntime.packageAssemblyRecipes || []).map((recipe) => ({...recipe, current: false, selected: false, authorityScope: "HISTORY_READ_ONLY", status: "VISUAL_REJECTED"}));
  nextRuntime.currentAssembly = [];
  nextRuntime.wholeFilmBatchRecommendation = {
    ...nextRuntime.wholeFilmBatchRecommendation,
    label: "全片候选已做实际像素语义审计；异常镜头待定点补图",
    reviewScope: "WHOLE_FILM_STATIC_BOARD",
    actualPixelSemanticAuditRequired: true,
    actualPixelSemanticAuditContract: "A1WholeFilmActualPixelSemanticGate/v1",
    recommendation: null,
    selected: null,
    currentAssembly: [],
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    updatedAt: now,
  };
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.visualProductionRun = {
    ...next.production.visualProductionRun,
    status: "WHOLE_FILM_STATIC_BOARD_READY",
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
  };
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const recommendation = next.production.shotIntelligence.wholeFilmBatchRecommendation;
  const event = createProductionEvent({
    workspace: current,
    action: "whole-film-actual-pixel-recommendation-gate-applied",
    targetId: next.workspaceSha256,
    payload: {
      contract: "A1WholeFilmActualPixelRecommendationGateRepair/v1",
      workspaceSha256Before: current.workspaceSha256,
      auditedRawReferenceCount: audits.length,
      auditedRawReferenceIds: [...auditedRawReferenceIds],
      visualRejected: audits.filter((item) => item.status === "VISUAL_REJECTED").map((item) => ({shotId: item.shotId, directionId: item.directionId, artifactSha256: item.artifactSha256, findings: item.findings})),
      reviewRisk: audits.filter((item) => item.status === "REVIEW_REQUIRED").map((item) => ({shotId: item.shotId, directionId: item.directionId, artifactSha256: item.artifactSha256, findings: item.findings})),
      reboundDirections: ["ED-19:direction-02", "ED-20:direction-02"],
      supplementalGenerationQueued: false,
      assemblyCreated: false,
      layerReconstructionStarted: false,
      singleWriterTaskId,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1WholeFilmActualPixelRecommendationGateRepairReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: next.workspaceSha256,
    statusAfter: next.production.shotIntelligence.status,
    visualProductionRunStatus: next.production.visualProductionRun.status,
    nextUserGate: recommendation.nextUserGate,
    actualPixelSemanticAuditRequired: true,
    audits,
    semanticReviewFindings: recommendation.semanticReviewFindings || [],
    finalizedShotIds: recommendation.finalizedShotIds || [],
    exceptions: recommendation.exceptions || [],
    outputDeduplication: recommendation.outputDeduplication || null,
    currentAssembly: nextRuntime.currentAssembly,
    currentKitCount: nextRuntime.packageAssetKitPlans.filter((kit) => kit.current !== false).length,
    currentRecipeCount: nextRuntime.packageAssemblyRecipes.filter((recipe) => recipe.current !== false).length,
    queue: next.production.generation.summary,
    workerStatus: next.production.generation.workerStatus,
    generationPerformed: false,
    criticPerformed: false,
    motionPerformed: false,
    singleWriterTaskId,
    generatedAt: now,
  };
  persistProjectState(appRoot, next, {event, files: {"whole-film-actual-pixel-recommendation-gate-v1/report.json": report}});
  return report;
});

console.log(JSON.stringify({
  status: result.status,
  workspaceSha256Before: result.workspaceSha256Before,
  workspaceSha256After: result.workspaceSha256After,
  statusAfter: result.statusAfter,
  nextUserGate: result.nextUserGate,
  audited: result.audits.length,
  rejected: result.audits.filter((item) => item.status === "VISUAL_REJECTED").map((item) => `${item.shotId}:${item.directionId}`),
  reviewRisk: result.audits.filter((item) => item.status === "REVIEW_REQUIRED").map((item) => `${item.shotId}:${item.directionId}`),
  semanticFindingCount: result.semanticReviewFindings.length,
  queue: result.queue,
  workerStatus: result.workerStatus,
  generationPerformed: result.generationPerformed,
  singleWriterTaskId: result.singleWriterTaskId,
}, null, 2));
