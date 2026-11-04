#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {assertShotIntelligenceDecisionSet} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {assertShotSemanticDesignBrief} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const EXPECTED_WORKSPACE_SHA = "13f1015a3cace80e1a33a3c364f51d8d608fe2c5c8a4c8019cc7d8b363bbb8dc";
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const briefIdentity = (brief) => { const copy = structuredClone(brief); delete copy.briefSha256; delete copy.generatedAt; return copy; };

const result = withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  if (current.workspaceSha256 !== EXPECTED_WORKSPACE_SHA) throw new Error(`workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("proof-route-hash-repair-requires-frozen-idle-runtime");
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const decision = runtime.decisionSet.items.find((item) => item.shotId === "ED-12");
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-12");
  if (!decision || !plan || decision.proofRoute !== "AUTHOR_PROOF" || decision.networkDecision !== "SKIP") throw new Error("ed12-proof-route-repair-precondition-failed");
  const previousDecisionHash = decision.decisionHash;
  const previousPlanSha256 = plan.planSha256;
  const nextDecision = {...decision, referenceProofRoute: "PRODUCT_PROOF", decisionHash: undefined};
  nextDecision.decisionHash = sha256(nextDecision);
  runtime.decisionSet.items = runtime.decisionSet.items.map((item) => item.shotId === "ED-12" ? nextDecision : item);
  runtime.decisionSet.sha256 = sha256({...runtime.decisionSet, sha256: undefined});
  assertShotIntelligenceDecisionSet(runtime.decisionSet);

  const brief = structuredClone(plan.semanticDesignBrief);
  brief.decisionHash = nextDecision.decisionHash;
  brief.briefSha256 = sha256(briefIdentity(brief));
  assertShotSemanticDesignBrief(brief);
  const context = runtime.videoPackagingContexts.items.find((item) => item.shotId === "ED-12");
  if (!context) throw new Error("ed12-video-context-missing");
  context.decisionHash = nextDecision.decisionHash;
  context.contextSha256 = sha256({...context, contextSha256: undefined, createdAt: undefined});
  plan.semanticDesignBrief = brief;
  plan.semanticDesignBriefSha256 = brief.briefSha256;
  plan.decisionHash = nextDecision.decisionHash;
  plan.videoContext = structuredClone(context);
  plan.planSha256 = sha256(planIdentity(plan));
  assertPackageLookMasterPlan(plan);

  const raw = (runtime.lookMasterRawReferences || []).find((item) => item.shotId === "ED-12" && item.semanticPixelAudit?.status === "PASS");
  if (!raw) throw new Error("ed12-semantic-pass-raw-missing");
  const artifactSha256 = raw.artifact.sha256;
  raw.planSha256 = plan.planSha256;
  raw.current = true;
  raw.selectionEligible = true;
  raw.recommendationEligible = true;
  raw.status = "CURRENT_SEMANTIC_PASS_REBOUND";
  raw.rebindMode = "EXISTING_SEMANTIC_PASS_REBOUND_NO_NEW_REVIEW_PROOF_ROUTE_HASH_SYNC";
  raw.rebindSourcePlanSha256 = previousPlanSha256;
  raw.rebindSourceDecisionHash = previousDecisionHash;
  for (const job of next.production.generation.jobs || []) {
    if (job.targetKind === "package-look-master" && job.status === "complete" && job.output?.sha256 === artifactSha256) job.lookMasterPlanSha256 = plan.planSha256;
  }
  const proofAudit = runtime.proofRouteAudits.find((item) => item.shotId === "ED-12");
  if (proofAudit) {
    proofAudit.referenceProofRoute = "PRODUCT_PROOF";
    proofAudit.referenceArtifacts = (plan.sourceEvidenceInputs || []).map((item) => ({id: item.id, publicUrl: item.publicUrl, sha256: item.sha256}));
    proofAudit.referenceSentToImageGen = false;
    proofAudit.referenceUseProofStatus = "NOT_CAPTURED_ON_REBIND";
    proofAudit.referenceUseNote = "当前只证明 plan 绑定了真实 named-model source plate；未把旧生成记录重新宣称为新的 ImageGen reference-use proof。";
  }
  runtime.decisionSet.summary.researchPacketCount = runtime.researchPackets.length;
  runtime.sha256 = sha256({...runtime, sha256: undefined});
  const batch = runtime.wholeFilmBatchRecommendation;
  const existingRecord = (batch.rebindRecords || []).find((item) => item.shotId === "ED-12" && item.artifactSha256 === artifactSha256);
  if (existingRecord) {
    existingRecord.currentPlanSha256 = plan.planSha256;
    existingRecord.proofRouteHashSync = true;
  }
  batch.proofRouteAudits = runtime.proofRouteAudits;

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "repair-current-reconciliation-proof-route-hash-binding",
    targetId: "ED-12",
    payload: {contract: "A1CurrentWholeFilmSemanticReconciliationProofRouteHashSync/v1", artifactSha256, previousDecisionHash, currentDecisionHash: nextDecision.decisionHash, previousPlanSha256, currentPlanSha256: plan.planSha256, generatedAssetsChanged: false, downstreamStarted: false},
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1CurrentWholeFilmSemanticReconciliationProofRouteHashSyncReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    shotId: "ED-12",
    proofRoute: "AUTHOR_PROOF",
    referenceProofRoute: "PRODUCT_PROOF",
    currentPlanSha256: plan.planSha256,
    artifactSha256,
    generatedAssetsChanged: false,
    actualPixelAuditRerun: false,
    staticBoardPublished: false,
    assemblyCreationAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed,
    authority: {currentStage: recalculated.production.authority.currentStage, nextAction: recalculated.production.authority.nextAction},
    generatedAt: now,
  };
  persistProjectState(appRoot, recalculated, {event, files: {"current-look-master-semantic-reconciliation-v1/proof-route-hash-sync-report.json": report}});
  return report;
});

console.log(JSON.stringify(result, null, 2));
