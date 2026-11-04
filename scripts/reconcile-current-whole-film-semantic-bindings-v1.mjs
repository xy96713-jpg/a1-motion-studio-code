#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {assertPackageAssemblyRecipe, assertPackageAssetKitPlan} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {hashResearchPacket} from "../apps/studio-next/src/lib/a1-research-claim-policy-v1.mjs";
import {assertShotIntelligenceDecisionSet} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {assertShotSemanticDesignBrief} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const EXPECTED_WORKSPACE_SHA = "bd34338a597f9957ac06b6a63e09fb3973545d86ed8e2ceeba7528ea97029fd0";
const REBIND_SHOT_IDS = ["ED-09", "ED-10", "ED-12", "ED-15", "ED-17", "ED-19", "ED-20", "ED-33", "ED-34"];
const PASS_SHOT_IDS = ["ED-09", "ED-10", "ED-12", "ED-14", "ED-15", "ED-16", "ED-17", "ED-19", "ED-20", "ED-33", "ED-34"];
const now = new Date().toISOString();

const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const validSha = (value) => /^[a-f0-9]{64}$/iu.test(String(value || ""));
const publicFile = (publicUrl) => publicUrl?.startsWith("/") ? path.join(publicRoot, publicUrl.replace(/^\/+/, "")) : null;
const briefIdentity = (brief) => {
  const copy = structuredClone(brief);
  delete copy.briefSha256;
  delete copy.generatedAt;
  return copy;
};
const text = (value) => String(value || "").replace(/\s+/gu, " ").trim();

function proofRouteForDecision(decision, plan) {
  if (decision?.claimType === "research_claim" || decision?.claimType === "evidence_claim") return "EXTERNAL_RESEARCH";
  if (/^我(?:后来)?(?:试了|试过|用过|用|习惯用|让|做)/u.test(text(decision?.sourceText))) return "AUTHOR_PROOF";
  if (plan?.semanticDesignBrief?.evidenceRoute === "SCREEN_EVIDENCE" || plan?.sourceEvidenceInputs?.length) return "PRODUCT_PROOF";
  return null;
}

function proofRouteAudit(runtime, decision, plan) {
  const proofRoute = proofRouteForDecision(decision, plan);
  const packet = (runtime.researchPackets || []).find((item) => item.shotId === decision.shotId) || null;
  const referenceProofRoute = decision.referenceProofRoute || (proofRoute === "EXTERNAL_RESEARCH" ? "EXTERNAL_RESEARCH" : proofRoute === "PRODUCT_PROOF" ? "PRODUCT_PROOF" : null);
  const referenceArtifacts = referenceProofRoute === "EXTERNAL_RESEARCH"
    ? (packet?.sources || []).map((source) => source.referenceArtifact).filter((artifact) => validSha(artifact?.sha256))
    : referenceProofRoute === "PRODUCT_PROOF"
      ? (plan?.sourceEvidenceInputs || []).filter((item) => validSha(item?.sha256))
      : [];
  return {
    shotId: decision.shotId,
    claimType: decision.claimType,
    networkDecision: decision.networkDecision,
    proofRoute,
    referenceProofRoute,
    sourceText: decision.sourceText,
    packetStatus: packet?.status || "NOT_REQUIRED",
    packetSha256: packet?.packetSha256 || null,
    referenceArtifacts: referenceArtifacts.map((artifact) => ({publicUrl: artifact.publicUrl, sha256: artifact.sha256})),
    referenceSentToImageGen: proofRoute === "EXTERNAL_RESEARCH"
      ? (runtime.lookMasterRawReferences || []).some((raw) => raw.shotId === decision.shotId && raw.researchReferenceUseProof?.sentToImageGen === true)
      : referenceProofRoute === "PRODUCT_PROOF"
        ? (runtime.lookMasterRawReferences || []).some((raw) => raw.shotId === decision.shotId && raw.sourceEvidenceInputs?.length > 0)
        : false,
    evidenceAndMetaphorRelation: proofRoute === "EXTERNAL_RESEARCH"
      ? "真实来源证据是语义锚点；视觉隐喻只能辅助，不得代替论文/网页证据。"
      : proofRoute === "AUTHOR_PROOF"
        ? "作者经历由真实口播与绑定的本地产品参考承担；不推导外部研究结论。"
        : proofRoute === "PRODUCT_PROOF"
          ? "真实产品/屏幕参考承担可核验身份；生图只重新编排，不伪造来源。"
          : "无外部证据路由；普通叙述不自动建立 research packet。",
  };
}

function updateDecisionSet(runtime) {
  const decision = runtime.decisionSet.items.find((item) => item.shotId === "ED-12");
  if (!decision) throw new Error("ed12-decision-missing");
  if (decision.networkDecision !== "REQUIRED" || decision.claimType !== "named-entity-claim") throw new Error("ed12-precondition-not-misclassified");
  const nextDecision = {
    ...decision,
    proofRoute: "AUTHOR_PROOF",
    networkDecision: "SKIP",
    networkReason: "这是讲述者自己的模型试用/作者经历，走 AUTHOR_PROOF；不自动建立外部 research packet。",
    searchIntents: [],
    searchQueries: [],
    decisionHash: undefined,
  };
  nextDecision.decisionHash = sha256(nextDecision);
  runtime.decisionSet.items = runtime.decisionSet.items.map((item) => item.shotId === "ED-12" ? nextDecision : item);
  runtime.decisionSet.summary = {
    ...runtime.decisionSet.summary,
    networkRequiredCount: runtime.decisionSet.items.filter((item) => item.networkDecision === "REQUIRED").length,
    networkHelpfulCount: runtime.decisionSet.items.filter((item) => item.networkDecision === "HELPFUL").length,
    networkSkipCount: runtime.decisionSet.items.filter((item) => item.networkDecision === "SKIP").length,
  };
  runtime.decisionSet.sha256 = sha256({...runtime.decisionSet, sha256: undefined});
  assertShotIntelligenceDecisionSet(runtime.decisionSet);
  return {before: decision, after: nextDecision};
}

function updateEd12Plan(runtime, decisionMigration) {
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-12");
  if (!plan) throw new Error("ed12-plan-missing");
  if (plan.decisionHash !== decisionMigration.before.decisionHash) throw new Error("ed12-plan-decision-binding-precondition-failed");
  const brief = structuredClone(plan.semanticDesignBrief);
  brief.decisionHash = decisionMigration.after.decisionHash;
  brief.proofRoute = "AUTHOR_PROOF";
  brief.referenceProofRoute = "PRODUCT_PROOF";
  brief.briefSha256 = sha256(briefIdentity(brief));
  assertShotSemanticDesignBrief(brief);
  plan.semanticDesignBrief = brief;
  plan.semanticDesignBriefSha256 = brief.briefSha256;
  plan.decisionHash = decisionMigration.after.decisionHash;
  plan.networkDecision = "SKIP";
  plan.researchPacketSha256 = null;
  plan.groundedClaim = null;
  plan.proofRoute = "AUTHOR_PROOF";
  plan.referenceProofRoute = "PRODUCT_PROOF";
  plan.planSha256 = sha256(planIdentity(plan));
  assertPackageLookMasterPlan(plan);
  return plan;
}

function updateHistoryKitBindings(runtime, decisionMigration) {
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-12");
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-12");
  const context = runtime.videoPackagingContexts.items.find((item) => item.shotId === "ED-12");
  if (!context) throw new Error("ed12-history-binding-missing-context");
  if (!kit && !recipe) return {shotId: "ED-12", kitOrRecipePresent: false, note: "ED-12 has no current/history package kit or recipe to migrate."};
  if (!kit || !recipe) throw new Error("ed12-history-binding-partial");
  const previousKitPlanSha256 = kit.planSha256;
  kit.decisionHash = decisionMigration.after.decisionHash;
  kit.networkDecision = "SKIP";
  kit.proofRoute = "AUTHOR_PROOF";
  kit.referenceProofRoute = "PRODUCT_PROOF";
  kit.researchPacketSha256 = null;
  kit.groundedClaim = null;
  kit.videoContext = structuredClone(context);
  kit.videoContextSha256 = context.contextSha256;
  for (const layer of kit.layers || []) if (layer.cacheKeyInputs) layer.cacheKeyInputs.decisionHash = decisionMigration.after.decisionHash;
  const kitHashInput = structuredClone(kit);
  delete kitHashInput.planSha256;
  delete kitHashInput.createdAt;
  kit.planSha256 = sha256(kitHashInput);
  assertPackageAssetKitPlan(kit);
  const replacePlanSha = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "planSha256" && child === previousKitPlanSha256) value[key] = kit.planSha256;
      else if (key === "videoContextSha256") value[key] = context.contextSha256;
      else if (child && typeof child === "object") replacePlanSha(child);
    }
  };
  recipe.planSha256 = kit.planSha256;
  recipe.videoContext = structuredClone(context);
  recipe.videoContextSha256 = context.contextSha256;
  replacePlanSha(recipe);
  recipe.recipeSha256 = sha256({...recipe, recipeSha256: undefined});
  assertPackageAssemblyRecipe(kit, recipe);
  return {shotId: "ED-12", previousKitPlanSha256, currentKitPlanSha256: kit.planSha256, recipeSha256: recipe.recipeSha256};
}

function compatibilityForRebind(raw, plan, {requirePromptBindings = true} = {}) {
  const artifactFile = publicFile(raw.artifact?.publicUrl);
  const brief = plan.semanticDesignBrief;
  const prompt = String(raw.artifact?.prompt || "");
  const checks = {
    artifactFileExists: Boolean(artifactFile && fs.existsSync(artifactFile)),
    artifactSha256Verified: Boolean(artifactFile && fs.existsSync(artifactFile) && fileSha256(artifactFile) === raw.artifact.sha256),
    semanticPixelAuditPass: raw.semanticPixelAudit?.status === "PASS",
    candidateDirectionBound: plan.candidateDirections?.some((direction) => direction.directionId === raw.candidateDirectionId) === true,
    exactCopyBoundInPrompt: prompt.includes(`EXACT SOURCE COPY: ${brief.exactCopy}`),
    semanticActorBoundInPrompt: prompt.includes(`SEMANTIC ACTOR: ${brief.semanticActor.identity}`),
    semanticActionBoundInPrompt: prompt.includes(`ACTION: ${brief.semanticActor.action}`),
    holdFrameBoundInPrompt: prompt.includes(plan.videoContext?.baseFrame?.sha256 || "__missing_hold_frame_sha__"),
  };
  const requiredChecks = requirePromptBindings
    ? Object.values(checks)
    : [checks.artifactFileExists, checks.artifactSha256Verified, checks.semanticPixelAuditPass, checks.candidateDirectionBound];
  return {status: requiredChecks.every(Boolean) ? "PASS" : "BLOCKED", checks, artifactSha256: raw.artifact?.sha256 || null, semanticPixelAuditSha256: raw.semanticPixelAuditSha256 || null};
}

function rebindPassReferences(workspace, runtime, changedPlans) {
  const records = [];
  for (const shotId of PASS_SHOT_IDS) {
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    if (!plan) throw new Error(`pass-plan-missing:${shotId}`);
    const passRaws = (runtime.lookMasterRawReferences || []).filter((raw) => raw.shotId === shotId && raw.semanticPixelAudit?.status === "PASS");
    if (!passRaws.length) throw new Error(`pass-artifact-missing:${shotId}`);
    for (const raw of passRaws) {
      const oldPlanSha256 = raw.planSha256;
      if (changedPlans.has(shotId) && oldPlanSha256 === plan.planSha256) throw new Error(`expected-stale-plan-binding-missing:${shotId}`);
      if (!changedPlans.has(shotId) && oldPlanSha256 !== plan.planSha256) throw new Error(`unexpected-current-plan-drift:${shotId}`);
      const compatibility = compatibilityForRebind(raw, plan, {requirePromptBindings: changedPlans.has(shotId)});
      if (compatibility.status !== "PASS") throw new Error(`semantic-pass-rebind-compatibility-failed:${shotId}:${JSON.stringify(compatibility.checks)}`);
      raw.planSha256 = plan.planSha256;
      raw.styleBriefSha256 = plan.styleBriefSha256;
      raw.current = true;
      raw.selectionEligible = true;
      raw.recommendationEligible = true;
      raw.status = changedPlans.has(shotId) ? "CURRENT_SEMANTIC_PASS_REBOUND" : "CURRENT_SEMANTIC_PASS_RETAINED";
      raw.rebindMode = changedPlans.has(shotId) ? "EXISTING_SEMANTIC_PASS_REBOUND_NO_NEW_REVIEW" : "CURRENT_BINDING_RETAINED_NO_NEW_REVIEW";
      raw.rebindSourcePlanSha256 = oldPlanSha256;
      raw.rebindSourceAuditSha256 = raw.semanticPixelAuditSha256;
      raw.rebindCompatibility = compatibility;
      const matchingJobs = (workspace.production.generation.jobs || []).filter((job) => job.targetKind === "package-look-master" && job.status === "complete" && job.output?.sha256 === raw.artifact?.sha256);
      for (const job of matchingJobs) {
        job.lookMasterPlanSha256 = plan.planSha256;
        job.reconciliation = {status: "CURRENT_SEMANTIC_PASS_REBOUND", previousLookMasterPlanSha256: oldPlanSha256, artifactSha256: raw.artifact.sha256};
      }
      records.push({shotId, referenceId: raw.referenceId, artifactSha256: raw.artifact.sha256, semanticPixelAuditSha256: raw.semanticPixelAuditSha256, previousPlanSha256: oldPlanSha256, currentPlanSha256: plan.planSha256, matchedGenerationJobCount: matchingJobs.length, compatibility});
    }
  }
  return records;
}

function migrateResearchPacket(runtime, decisionMigration) {
  const packet = (runtime.researchPackets || []).find((item) => item.shotId === "ED-12");
  if (!packet) throw new Error("ed12-research-packet-missing");
  const historyPacket = {
    ...packet,
    originalPacketSha256: packet.packetSha256,
    decisionHash: decisionMigration.after.decisionHash,
    networkDecision: "HELPFUL",
    proofRoute: "AUTHOR_PROOF",
    referenceProofRoute: "PRODUCT_PROOF",
    historyOnly: true,
    status: "HISTORY_READ_ONLY",
    historyReason: "ED-12 是作者自己的模型试用陈述；旧 named-entity REQUIRED packet 不再阻塞当前 production route。",
  };
  historyPacket.packetSha256 = hashResearchPacket(historyPacket);
  runtime.researchPacketHistory = [...(runtime.researchPacketHistory || []), historyPacket];
  runtime.researchPackets = runtime.researchPackets.filter((item) => item.shotId !== "ED-12");
  return {shotId: "ED-12", originalPacketSha256: packet.packetSha256, historyPacketSha256: historyPacket.packetSha256, currentPacketRemoved: true};
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== EXPECTED_WORKSPACE_SHA) throw new Error(`workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("reconciliation-requires-idle-queue");
  if (current.production.generation.workerStatus !== "frozen") throw new Error("reconciliation-requires-frozen-worker");
  if (current.production.shotIntelligence.currentAssembly?.length) throw new Error("reconciliation-must-not-touch-assembly");
  if ((current.production.generation.jobs || []).some((job) => ["queued", "running"].includes(job.status))) throw new Error("reconciliation-found-active-generation-job");

  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const decisionMigration = updateDecisionSet(runtime);
  const changedPlan = updateEd12Plan(runtime, decisionMigration);
  const changedPlans = new Set(REBIND_SHOT_IDS);
  const historyKitMigration = updateHistoryKitBindings(runtime, decisionMigration);
  const packetMigration = migrateResearchPacket(runtime, decisionMigration);
  const rebindRecords = rebindPassReferences(next, runtime, changedPlans);

  for (const plan of runtime.packageLookMasterPlans) {
    delete plan.wholeFilmBoardRecommendation;
    delete plan.provisionalWholeFilmBoardSelection;
    const currentPassCount = (runtime.lookMasterRawReferences || []).filter((raw) => raw.shotId === plan.shotId && raw.planSha256 === plan.planSha256 && raw.semanticPixelAudit?.status === "PASS" && raw.selectionEligible === true).length;
    if (currentPassCount > 0) plan.status = "LOOK_MASTER_CANDIDATES_READY";
  }
  runtime.status = "LOOK_MASTER_CANDIDATES_READY";
  runtime.decisionSet.summary.researchPacketCount = runtime.researchPackets.length;
  runtime.proofRouteAudits = runtime.decisionSet.items
    .filter((decision) => decision.packageDecision === "PACKAGE")
    .map((decision) => proofRouteAudit(runtime, decision, runtime.packageLookMasterPlans.find((plan) => plan.shotId === decision.shotId)));
  runtime.decisionSet.sha256 = sha256({...runtime.decisionSet, sha256: undefined});
  runtime.sha256 = sha256({...runtime, sha256: undefined});

  const batch = runtime.wholeFilmBatchRecommendation || {};
  batch.exceptions = (batch.exceptions || []).filter((item) => item.code !== "REQUIRED_RESEARCH_SOURCE_PACKET_BLOCKED");
  batch.status = "PARTIAL_WITH_EXCEPTIONS";
  batch.reconciliationRequired = true;
  batch.reconciliationStatus = "CURRENT_SEMANTIC_PASS_REBIND_COMPLETE_BATCH_EXCEPTIONS_REMAIN";
  batch.reconciliation = {
    contract: "A1CurrentWholeFilmSemanticReconciliation/v1",
    status: "PASS",
    shotIds: [...new Set(rebindRecords.map((item) => item.shotId))],
    artifactSha256Changed: false,
    actualPixelAuditRerun: false,
    ocrRerun: false,
    duplicateAuditRerun: false,
    boardPublished: false,
    assemblyCreated: false,
    layerReconstructionStarted: false,
    criticPerformed: false,
    motionPerformed: false,
    completedAt: now,
  };
  batch.rebindRecords = rebindRecords;
  batch.proofRouteAudits = runtime.proofRouteAudits;
  batch.researchPacketAudits = runtime.researchPackets.filter((item) => item.networkDecision === "REQUIRED").map((item) => ({shotId: item.shotId, packetSha256: item.packetSha256, status: item.status, readiness: item.researchReadiness}));
  batch.recommendation = null;
  batch.selected = null;
  batch.currentAssembly = [];
  batch.explorationOnly = true;
  batch.autoRecommendationAllowed = false;
  batch.assemblyCreationAllowed = false;
  batch.layerReconstructionAllowed = false;
  batch.criticAllowed = false;
  batch.motionAllowed = false;
  batch.reviewScope = "WHOLE_FILM_STATIC_BOARD";
  batch.nextUserGate = null;
  batch.updatedAt = now;
  runtime.wholeFilmBatchRecommendation = batch;

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const recalculatedRuntime = recalculated.production.shotIntelligence;
  if (recalculatedRuntime.wholeFilmBatchRecommendation?.reconciliationRequired !== true) throw new Error("reconciliation-marker-not-persisted");
  if (recalculatedRuntime.wholeFilmBatchRecommendation?.nextUserGate !== null) throw new Error("static-board-gate-published-too-early");
  if (recalculatedRuntime.wholeFilmBatchRecommendation?.assemblyCreationAllowed !== false) throw new Error("assembly-unlocked-during-reconciliation");
  if (recalculated.production.generation.summary.queued !== 0 || recalculated.production.generation.summary.running !== 0 || recalculated.production.generation.workerStatus !== "frozen") throw new Error("reconciliation-unexpected-generation-state");
  const event = createProductionEvent({
    workspace: current,
    action: "reconcile-current-whole-film-semantic-pass-bindings",
    targetId: rebindRecords.map((item) => item.shotId).join(","),
    payload: {
      contract: "A1CurrentWholeFilmSemanticReconciliation/v1",
      decisionMigration: {shotId: "ED-12", before: {claimType: decisionMigration.before.claimType, networkDecision: decisionMigration.before.networkDecision, decisionHash: decisionMigration.before.decisionHash}, after: {claimType: decisionMigration.after.claimType, proofRoute: decisionMigration.after.proofRoute, networkDecision: decisionMigration.after.networkDecision, decisionHash: decisionMigration.after.decisionHash}},
      packetMigration,
      historyKitMigration,
      rebindCount: rebindRecords.length,
      artifactSha256Changed: false,
      actualPixelAuditRerun: false,
      downstreamStarted: false,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1CurrentWholeFilmSemanticReconciliationReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    classifier: {rootCause: "named-entity classifier lacked proof-route distinction; author experience was routed into external research", fix: "AUTHOR_PROOF / PRODUCT_PROOF / EXTERNAL_RESEARCH", ed12: {claimType: decisionMigration.after.claimType, proofRoute: decisionMigration.after.proofRoute, networkDecision: decisionMigration.after.networkDecision}},
    orchestrator: {rootCause: "required research packet was created before proof-route resolution", fixed: true, packetMigration, historyKitMigration},
    promptCompiler: {status: "NO_NEW_PROMPT_COMPILED", existingPromptsReused: true, imagegenPerformed: false},
    eligibilityGate: {status: "BATCH_STILL_BLOCKED", actualPixelAuditRerun: false, ocrRerun: false, duplicateAuditRerun: false, assemblyCreationAllowed: recalculatedRuntime.wholeFilmBatchRecommendation.assemblyCreationAllowed},
    proofRouteAudits: recalculatedRuntime.proofRouteAudits,
    rebindRecords,
    exceptions: recalculatedRuntime.wholeFilmBatchRecommendation.exceptions,
    authority: {currentStage: recalculated.production.authority.currentStage, nextAction: recalculated.production.authority.nextAction, staticBoardPublished: false},
    queue: recalculated.production.generation.summary,
    downstream: {assemblyCreated: false, layerReconstructionStarted: false, criticPerformed: false, motionPerformed: false},
    generatedAt: now,
  };
  persistProjectState(appRoot, recalculated, {event, files: {"current-look-master-semantic-reconciliation-v1/report.json": report}});
  return report;
});

console.log(JSON.stringify(result, null, 2));
