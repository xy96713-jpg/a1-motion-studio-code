#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertPackageLookMasterPlan,
  buildPackageLookMasterPlan,
  buildPackageLookMasterPrompt,
  buildResearchSourceConditioningInputs,
  queuePackageLookMasterGenerationJobs,
  presentationForLookMasterCandidate,
  sourceEvidenceForLookMasterCandidate,
} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const referenceManifest = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const decision = workspace.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === "ED-14");
const event = workspace.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds.includes("ED-14"));
const videoContext = workspace.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === "ED-14");
const researchPacket = workspace.production.shotIntelligence.researchPackets.find((item) => item.shotId === "ED-14");
const semanticBrief = workspace.production.shotIntelligence.semanticDesignBriefSet.briefs.find((item) => item.shotId === "ED-14");
assert.ok(decision && event && videoContext?.baseFrame && researchPacket?.status === "RESEARCH_READY" && semanticBrief?.status === "READY");

const sourceEvidenceInputs = buildResearchSourceConditioningInputs(researchPacket, {shotId: "ED-14"});
assert.equal(sourceEvidenceInputs.length, 1, "the research beat must use one verified paper title/abstract artifact");
assert.deepEqual(sourceEvidenceInputs.map((item) => item.sourceKind), ["OFFICIAL_RESEARCH_TITLE_ABSTRACT_CAPTURE"]);
assert.ok(sourceEvidenceInputs.every((item) => item.role === "REAL_EVIDENCE_INPUT" && item.exactPixelRebindRequired === true && item.claimExpansionForbidden === true));
assert.deepEqual(buildResearchSourceConditioningInputs(researchPacket, {shotId: "ED-10"}), [], "a source capture must never leak into another beat");
for (const source of sourceEvidenceInputs) {
  const file = path.join(publicRoot, source.publicUrl.replace(/^\//u, ""));
  assert.ok(fs.existsSync(file), `source artifact missing: ${source.id}`);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), source.sha256, `source hash mismatch: ${source.id}`);
}

const brief = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext, now: "2026-08-05T00:00:00.000Z"});
const plan = buildPackageLookMasterPlan(decision, brief, {videoContext, referenceManifest, researchPacket, semanticBrief, sourceEvidenceInputs, now: "2026-08-05T00:00:00.000Z"});
assertPackageLookMasterPlan(plan);
assert.equal(plan.sourceConditioningPolicy.route, "SOURCE_TO_IMAGEGEN_LOOK_MASTER_TO_EXACT_REBIND_TO_FOUR_LAYER_RECONSTRUCTION");
assert.equal(plan.generationCriteria.sourceMustEnterImageGenerationDirectly, true);
assert.equal(plan.generationCriteria.exactSourceRebindRequiredBeforeLayerReconstruction, true);
assert.equal(sourceEvidenceForLookMasterCandidate(plan, 1)[0].sourceKind, "OFFICIAL_RESEARCH_TITLE_ABSTRACT_CAPTURE");
assert.equal(sourceEvidenceForLookMasterCandidate(plan, 2)[0].sourceKind, "OFFICIAL_RESEARCH_TITLE_ABSTRACT_CAPTURE");
assert.equal(plan.sourceConditioningPolicy.sourcePresentationStrategy, "SEMANTIC_FIT_NOT_PRESENTER_LOCKED");
assert.equal(plan.sourceConditioningPolicy.presenterVisibilityIsOptional, true);
assert.deepEqual([1, 2].map((index) => presentationForLookMasterCandidate(plan, index).presentationMode), ["EXPLAINER", "EXPLAINER"]);
assert.ok([1, 2].every((index) => presentationForLookMasterCandidate(plan, index).presenterVisibility === "NOT_REQUIRED"));
assert.ok(plan.candidateDirections.slice(0, 2).every((direction) => direction.baseVideoRelationship === "TEMPORARY_EXPLAINER_OR_EDITOR_CHOSEN_SPLIT"));

const sourceFreeOverlayPlan = {...plan, sourceEvidenceInputs: [], presentationMode: "OVERLAY", assemblyMode: "OVERLAY"};
assert.equal(presentationForLookMasterCandidate(sourceFreeOverlayPlan, 1).presentationMode, "OVERLAY", "ordinary overlay beats must remain overlays");
assert.equal(presentationForLookMasterCandidate(sourceFreeOverlayPlan, 1).presenterVisibility, "REQUIRED");

const articlePrompt = buildPackageLookMasterPrompt(plan, 1);
const personPrompt = buildPackageLookMasterPrompt(plan, 2);
assert.match(articlePrompt, /REAL VERIFIED EVIDENCE CONDITIONING/);
assert.match(articlePrompt, /aclanthology\.org\/2026\.acl-long\.1803/);
assert.match(articlePrompt, /directly into ImageGen together with the actual hold frame/);
assert.match(articlePrompt, /exact hash-bound source pixels must be rebound/);
assert.match(articlePrompt, /PRESENTATION: EXPLAINER/);
assert.match(articlePrompt, /presenter does not need to remain visible/i);
assert.doesNotMatch(articlePrompt, /Preserve the presenter face and body/);
assert.match(personPrompt, /aclanthology\.org\/2026\.acl-long\.1803/);
assert.doesNotMatch(personPrompt, /official-vishakh-padmakumar-profile/);
assert.doesNotMatch(personPrompt, /Preserve the presenter's face, body/);

const testWorkspace = structuredClone(workspace);
testWorkspace.production.shotIntelligence = {
  ...testWorkspace.production.shotIntelligence,
  status: "LOOK_MASTER_PLANS_READY",
  packageLookMasterPlans: [plan],
  researchPackets: [researchPacket],
};
testWorkspace.production.generation.jobs = [];
testWorkspace.production.generation.summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: 0};
const queued = queuePackageLookMasterGenerationJobs(testWorkspace, "ED-14", {now: "2026-08-05T00:00:01.000Z"});
assert.equal(queued.jobs.length, plan.candidateBudget);
for (const job of queued.jobs) {
  const evidence = job.referenceInputs.filter((item) => item.role === "REAL_EVIDENCE_INPUT");
  assert.equal(evidence.length, 1, "each candidate must use one clear real source rather than mixing every source into one template");
  assert.equal(job.sourceEvidenceInputs.length, 1);
  assert.equal(job.capabilitySnapshot.sourceMustEnterImageGenerationDirectly, true);
  assert.equal(job.capabilitySnapshot.exactSourceRebindRequired, true);
  assert.equal(job.sourceConditioningPolicy.generatedSourcePixelsAuthoritative, false);
  assert.equal(job.candidatePresentation.presentationMode, "EXPLAINER");
  assert.equal(job.candidatePresentation.presenterVisibility, "NOT_REQUIRED");
  assert.equal(job.capabilitySnapshot.presenterVisibilityRequired, false);
  assert.equal(job.capabilitySnapshot.fullscreenTakeoverAllowed, true);
}
const queuedAgain = queuePackageLookMasterGenerationJobs(queued.workspace, "ED-14", {now: "2026-08-05T00:00:02.000Z"});
assert.deepEqual(queuedAgain.jobs.map((job) => job.id), queued.jobs.map((job) => job.id), "hash-bound source jobs must be idempotent");

const tampered = structuredClone(plan);
tampered.sourceEvidenceInputs[0].exactPixelRebindRequired = false;
assert.throws(() => assertPackageLookMasterPlan(tampered), /look-master-(plan-hash-invalid|source-evidence-binding-invalid)/);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1SourceConditionedPackagingPolicy/v1",
  shotId: plan.shotId,
  sourceKinds: sourceEvidenceInputs.map((item) => item.sourceKind),
  candidateBudget: plan.candidateBudget,
  jobSourceBindings: queued.jobs.map((job) => ({jobId: job.id, sourceId: job.sourceEvidenceInputs[0].id})),
  route: plan.sourceConditioningPolicy.route,
}, null, 2));
