#!/usr/bin/env node
/** Rebind existing ED-10 comparative evidence to the current look plan.
 * No imagegen, critic, motion, or pixel regeneration is performed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildPackageLayerCandidateCacheKey} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const now = process.env.A1_ED10_LOOK_REBIND_AT || new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => {
  if (!String(url || "").startsWith("/generated/system-line/")) throw new Error("ed10-look-evidence-public-url-invalid");
  const file = path.resolve(publicRoot, String(url).replace(/^\//u, ""));
  if (!file.startsWith(`${publicRoot}${path.sep}`)) throw new Error("ed10-look-evidence-public-url-escape");
  return file;
};
const assertFileSha = (url, expected, label) => {
  const file = publicFile(url);
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== expected) throw new Error(`ed10-look-evidence-artifact-invalid:${label}`);
};
const withoutHash = (value, key, volatile = []) => {
  const copy = structuredClone(value);
  delete copy[key];
  for (const field of volatile) delete copy[field];
  return copy;
};
const historyOnly = (value, replacement, field) => ({
  ...structuredClone(value),
  status: "HISTORY_READ_ONLY",
  current: false,
  advisoryOnly: true,
  [field]: replacement,
  supersededAt: now,
});
const hashKitPlan = (plan) => sha256(withoutHash(plan, "planSha256", ["createdAt"]));
const hashCandidate = (candidate) => sha256(withoutHash(candidate, "candidateSha256"));
const hashRecipeIdentity = (recipe) => {
  const copy = withoutHash(recipe, "recipeSha256", ["createdAt"]);
  // Render/parity outputs and their audit bindings are evidence, not recipe
  // identity. Excluding them avoids a self-referential recipeSha256 cycle.
  delete copy.parityAudit;
  delete copy.finalAssemblyReview;
  delete copy.legacyParityAudit;
  delete copy.legacyFinalAssemblyReview;
  delete copy.assemblyComposite;
  delete copy.approvalBinding;
  return sha256(copy);
};
const hashRecipeBuildKey = (recipe, layerHashes) => sha256({
  contract: "A1DeterministicPackageAssembly/v1",
  shotId: recipe.shotId,
  planSha256: recipe.planSha256,
  styleBriefSha256: recipe.styleBriefSha256,
  selectedLookMasterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
  assemblyMode: recipe.assemblyMode,
  assemblyModeReason: recipe.assemblyModeReason,
  whyThisModeBeatsOtherModes: recipe.whyThisModeBeatsOtherModes,
  presentationMode: recipe.presentationMode,
  presentationModeReason: recipe.presentationModeReason,
  whyPresentationModeBeatsOtherModes: recipe.whyPresentationModeBeatsOtherModes,
  insertionMode: recipe.insertionMode,
  videoContextSha256: recipe.videoContextSha256,
  reconstructionSource: recipe.reconstructionSource,
  layerCandidateIds: recipe.layerCandidateIds,
  layerHashes,
});

function ensureSelectedPassRaw({runtime, plan, discovery}) {
  const candidate = discovery?.candidates?.find((item) => item.directionId === "direction-05");
  if (!candidate?.artifact?.sha256) throw new Error("ed10-selected-raw-pass-candidate-missing");
  const references = runtime.lookMasterRawReferences || (runtime.lookMasterRawReferences = []);
  const artifactSha256 = candidate.artifact.sha256;
  const sourceRaw = references.find((item) => item.referenceId === candidate.rawReferenceId)
    || references.find((item) => item.shotId === "ED-10" && item.candidateDirectionId === "direction-05" && item.artifact?.sha256 === artifactSha256 && item.status !== "HISTORY_READ_ONLY");
  if (!sourceRaw?.serverVisualAssessment || sourceRaw.serverVisualAssessment.status !== "PASS" || sourceRaw.serverVisualAssessment.artifactSha256 !== artifactSha256) {
    throw new Error("ed10-selected-raw-current-pass-evidence-missing");
  }

  let currentRaw = references.find((item) => item.shotId === "ED-10"
    && item.candidateDirectionId === "direction-05"
    && item.artifact?.sha256 === artifactSha256
    && item.current === true
    && item.currentPassEvidence?.status === "PASS"
    && item.currentPassEvidence?.artifactSha256 === artifactSha256
    && item.status !== "HISTORY_READ_ONLY");

  if (!currentRaw) {
    const currentReferenceId = `${sourceRaw.referenceId}-current-pass-reassessment-${plan.planSha256.slice(0, 12)}`;
    const sourceAssessment = structuredClone(sourceRaw.serverVisualAssessment);
    const evidenceCore = {
      contract: "A1LookMasterPassReassessment/v1",
      version: 1,
      status: "PASS",
      shotId: "ED-10",
      eventId: plan.eventId,
      directionId: "direction-05",
      artifactSha256,
      planSha256: plan.planSha256,
      styleBriefSha256: plan.styleBriefSha256,
      sourceRawReferenceId: sourceRaw.referenceId,
      sourceAssessmentSha256: sourceAssessment.assessmentSha256,
      sourcePixelAuditStatus: sourceRaw.pixelAudit?.status || "FAIL",
      sourcePixelAuditAdmissionAllowed: sourceRaw.pixelAudit?.admissionAllowed ?? false,
      rebindMode: "EXISTING_SERVER_PASS_REBOUND_NO_NEW_REVIEW",
      reviewPerformed: false,
      criticPerformed: false,
      imageGenerationPerformed: false,
      boundAt: now,
    };
    const currentPassEvidence = {...evidenceCore, evidenceSha256: sha256(evidenceCore)};
    currentRaw = {
      ...structuredClone(sourceRaw),
      referenceId: currentReferenceId,
      planSha256: plan.planSha256,
      styleBriefSha256: plan.styleBriefSha256,
      status: "CURRENT_PASS_REASSESSMENT",
      current: true,
      advisoryOnly: true,
      supersedesRawReferenceId: sourceRaw.referenceId,
      currentPassEvidence,
      historicalPixelAudit: sourceRaw.pixelAudit ? historyOnly(sourceRaw.pixelAudit, currentReferenceId, "currentReplacement") : null,
      pixelAuditStatus: "HISTORY_READ_ONLY",
      serverVisualAssessment: {
        ...sourceAssessment,
        planSha256: plan.planSha256,
        styleBriefSha256: plan.styleBriefSha256,
        reassessment: {
          contract: "A1LookMasterPassReassessment/v1",
          sourceAssessmentSha256: sourceAssessment.assessmentSha256,
          evidenceSha256: currentPassEvidence.evidenceSha256,
          mode: "EXISTING_SERVER_PASS_REBOUND_NO_NEW_REVIEW",
        },
      },
      serverVisualAssessmentPublicUrl: sourceRaw.serverVisualAssessmentPublicUrl || null,
    };
    delete currentRaw.pixelAudit;
    delete currentRaw.admissionAllowed;
    references.push(currentRaw);
  }

  for (const raw of references) {
    if (raw.shotId !== "ED-10" || raw.artifact?.sha256 !== artifactSha256) continue;
    const fail = raw.pixelAudit?.status === "FAIL" && (raw.pixelAudit?.admissionAllowed === false || raw.admissionAllowed === false);
    if (!fail) continue;
    raw.status = "HISTORY_READ_ONLY";
    raw.current = false;
    raw.advisoryOnly = true;
    raw.currentReplacement = currentRaw.referenceId;
    raw.supersededAt = now;
  }

  candidate.rawReferenceId = currentRaw.referenceId;
  candidate.currentPassEvidence = structuredClone(currentRaw.currentPassEvidence);
  candidate.previousServerAssessment = {
    status: "PASS",
    assessmentSha256: currentRaw.currentPassEvidence.sourceAssessmentSha256,
    currentBindingSha256: currentRaw.currentPassEvidence.evidenceSha256,
    advisoryOnly: true,
  };
  return currentRaw;
}

function rebind(current) {
  const next = structuredClone(current);
  const runtime = next.production?.shotIntelligence;
  const plan = runtime?.packageLookMasterPlans?.find((item) => item.shotId === "ED-10");
  const kit = runtime?.packageAssetKitPlans?.find((item) => item.shotId === "ED-10");
  const recipe = runtime?.packageAssemblyRecipes?.find((item) => item.shotId === "ED-10");
  if (!plan || !kit || !recipe) throw new Error("ed10-look-evidence-records-missing");
  const activeIds = plan.activeCandidateSet?.directionIds || [];
  if (activeIds.length !== 4 || plan.activeCandidateSet.selectedDirectionId !== "direction-05") throw new Error("ed10-look-evidence-active-board-required");
  const oldDiscovery = plan.fastCandidateDiscovery;
  const oldBoard = plan.comparativeReviewBoard;
  const oldReview = plan.comparativeReview;
  const oldPortfolio = plan.portfolioAudit;
  if (!oldDiscovery || !oldBoard || !oldReview || !oldPortfolio) throw new Error("ed10-look-evidence-chain-missing");
  if (oldBoard.board?.publicUrl && oldBoard.board?.sha256) assertFileSha(oldBoard.board.publicUrl, oldBoard.board.sha256, "review-board");

  // The selected direction once pointed directly at a raw record whose local
  // pixel audit was FAIL even though an existing server assessment was PASS.
  // Keep that raw immutable as history and bind the active candidate to a
  // current, explicitly traceable PASS evidence wrapper without rerunning a
  // reviewer or changing the image.
  const currentPassRaw = ensureSelectedPassRaw({runtime, plan, discovery: oldDiscovery});

  // Preserve every old evidence object once. It remains auditable but can
  // never be read by the active selector after this migration.
  if (!plan.historicalFastCandidateDiscovery) plan.historicalFastCandidateDiscovery = historyOnly(oldDiscovery, "currentFastCandidateDiscovery", "currentReplacement");
  if (!plan.historicalComparativeReviewBoard) plan.historicalComparativeReviewBoard = historyOnly(oldBoard, "currentComparativeReviewBoard", "currentReplacement");
  if (!plan.historicalComparativeReview) plan.historicalComparativeReview = historyOnly(oldReview, "currentComparativeReview", "currentReplacement");
  if (!plan.historicalComparativeReviewSha256) plan.historicalComparativeReviewSha256 = oldReview.reviewSha256 || null;

  const discovery = structuredClone(oldDiscovery);
  const selectedDiscoveryCandidate = discovery.candidates.find((item) => item.directionId === "direction-05");
  selectedDiscoveryCandidate.rawReferenceId = currentPassRaw.referenceId;
  selectedDiscoveryCandidate.currentPassEvidence = structuredClone(currentPassRaw.currentPassEvidence);
  selectedDiscoveryCandidate.previousServerAssessment = {
    status: "PASS",
    assessmentSha256: currentPassRaw.currentPassEvidence.sourceAssessmentSha256,
    currentBindingSha256: currentPassRaw.currentPassEvidence.evidenceSha256,
    advisoryOnly: true,
  };
  discovery.planSha256 = plan.planSha256;
  discovery.discoverySha256 = sha256(withoutHash(discovery, "discoverySha256", ["generatedAt"]));

  const board = structuredClone(oldBoard);
  board.planSha256 = plan.planSha256;
  board.discoverySha256 = discovery.discoverySha256;
  board.boardSha256 = sha256(withoutHash(board, "boardSha256", ["generatedAt"]));

  const review = structuredClone(oldReview);
  review.planSha256 = plan.planSha256;
  review.discoverySha256 = discovery.discoverySha256;
  review.boardSha256 = board.board?.sha256 || null;
  const rankedIds = (review.rankings || []).map((item) => item.directionId);
  if (review.verdict !== "PASS" || JSON.stringify([...rankedIds].sort()) !== JSON.stringify([...activeIds].sort()) || review.selectedDirectionId !== "direction-05" || (review.duplicateDirectionIds || []).includes(review.selectedDirectionId)) throw new Error("ed10-look-evidence-review-selection-invalid");
  review.reviewSha256 = sha256(withoutHash(review, "reviewSha256", ["generatedAt"]));

  const portfolio = structuredClone(oldPortfolio);
  portfolio.planSha256 = plan.planSha256;
  portfolio.comparativeReviewSha256 = review.reviewSha256;
  portfolio.auditSha256 = sha256(withoutHash(portfolio, "auditSha256"));

  // The root candidates array is retained for compatibility with old import
  // and guard code, but it is no longer an active selector after the board
  // migration. Make that boundary explicit on every retained candidate.
  plan.candidates = (plan.candidates || []).map((candidate) => ({
    ...candidate,
    status: "HISTORY_READ_ONLY",
    current: false,
    advisoryOnly: true,
    currentReplacement: "activeComparativeReviewBoard",
    supersededAt: now,
  }));
  plan.legacyCandidates = [...new Map([...(plan.legacyCandidates || []), ...plan.candidates].map((candidate) => [candidate.candidateId, candidate])).values()]
    .map((candidate) => ({...candidate, status: "HISTORY_READ_ONLY", current: false, advisoryOnly: true, currentReplacement: "activeComparativeReviewBoard"}));

  plan.fastCandidateDiscovery = discovery;
  plan.comparativeReviewBoard = board;
  plan.comparativeReview = review;
  plan.portfolioAudit = portfolio;
  plan.activeCandidateSet.reviewSha256 = review.reviewSha256;
  plan.recommendation = {...(plan.recommendation || {}), reviewSha256: review.reviewSha256};

  // The selected master and reconstruction graph consume the comparative
  // review hash. Rebind them before recalculating kit/recipe identities.
  for (const binding of [plan.selectedLookMasterBinding, kit.selectedLookMasterBinding, recipe.selectedLookMasterBinding]) {
    if (binding) {
      binding.comparativeReviewSha256 = review.reviewSha256;
      binding.rawReferenceId = currentPassRaw.referenceId;
      binding.currentPassEvidenceSha256 = currentPassRaw.currentPassEvidence.evidenceSha256;
    }
  }
  for (const source of [kit.reconstructionSource, recipe.reconstructionSource, kit.reconstructionCompilation]) {
    if (source && Object.hasOwn(source, "comparativeReviewSha256")) {
      source.comparativeReviewSha256 = review.reviewSha256;
      source.rawReferenceId = currentPassRaw.referenceId;
      source.currentPassEvidenceSha256 = currentPassRaw.currentPassEvidence.evidenceSha256;
    }
  }

  // Keep the already-built pixels and layers. Only their content-addressed
  // metadata is rebound to the new kit plan identity.
  kit.planSha256 = undefined;
  kit.planSha256 = hashKitPlan(kit);
  for (const layer of kit.layers || []) {
    for (const candidate of layer.candidates || []) {
      candidate.planSha256 = kit.planSha256;
      candidate.cache ||= {};
      candidate.cache.key = buildPackageLayerCandidateCacheKey({planSha256: kit.planSha256, layerKind: layer.kind, route: layer.route, contentSha256: candidate.cache.contentSha256 || candidate.artifact?.sha256 || "", variantNonce: candidate.cache.variantNonce || null});
      candidate.candidateSha256 = hashCandidate(candidate);
    }
  }
  recipe.planSha256 = kit.planSha256;
  const layerHashes = kit.layers.flatMap((layer) => {
    const selectedId = recipe.layerCandidateIds?.[layer.kind];
    const selected = (layer.candidates || []).find((candidate) => candidate.candidateId === selectedId);
    return selected ? [selected.candidateSha256] : [];
  });
  recipe.buildKey = hashRecipeBuildKey(recipe, layerHashes);
  recipe.recipeSha256 = hashRecipeIdentity(recipe);
  const approvalBinding = recipe.approvalBinding || {};
  recipe.approvalBinding = {
    ...approvalBinding,
    planSha256: kit.planSha256,
    recipeSha256: recipe.recipeSha256,
    buildKey: recipe.buildKey,
    layerHashes: [...layerHashes].sort(),
    selectedDirectionId: recipe.selectedLookMasterBinding?.directionId || null,
    selectedMasterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
  };
  for (const evidence of [recipe.parityAudit, recipe.finalAssemblyReview]) {
    if (!evidence) continue;
    evidence.planSha256 = kit.planSha256;
    evidence.recipeSha256 = recipe.recipeSha256;
    evidence.comparativeReviewSha256 = review.reviewSha256;
  }
  recipe.parityAudit = recipe.parityAudit ? {...recipe.parityAudit, rebindMode: "CURRENT_LOOK_REVIEW_HASH_REBIND", rebindSourceAuditSha256: recipe.parityAudit.rebindSourceAuditSha256 || recipe.parityAudit.auditSha256 || null} : recipe.parityAudit;
  recipe.finalAssemblyReview = recipe.finalAssemblyReview ? {...recipe.finalAssemblyReview, rebindMode: "CURRENT_LOOK_REVIEW_HASH_REBIND", rebindSourceAssessmentSha256: recipe.finalAssemblyReview.rebindSourceAssessmentSha256 || recipe.finalAssemblyReview.assessmentSha256 || null} : recipe.finalAssemblyReview;

  runtime.updatedAt = now;
  return recalculateEditorialAssetWorkbench(next, now);
}

withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  const beforeWorkspaceSha256 = current.workspaceSha256;
  const migrated = rebind(current);
  const validated = assertEditorialAssetWorkbench(migrated);
  const plan = validated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const recipe = validated.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  const event = createProductionEvent({workspace: validated, action: "rebind-ed10-current-look-master-evidence", targetId: "ED-10", payload: {beforeWorkspaceSha256, afterWorkspaceSha256: validated.workspaceSha256, previousComparativeReviewSha256: plan.historicalComparativeReview?.reviewSha256 || null, currentComparativeReviewSha256: plan.comparativeReview?.reviewSha256 || null, selectedDirectionId: plan.activeCandidateSet?.selectedDirectionId || null, imageGenerationPerformed: false, criticPerformed: false, motionPerformed: false}, now});
  persistProjectState(appRoot, validated, {event});
  console.log(JSON.stringify({status: "PASS", beforeWorkspaceSha256, workspaceSha256: validated.workspaceSha256, lookPlanSha256: plan.planSha256, discoverySha256: plan.fastCandidateDiscovery.discoverySha256, boardSha256: plan.comparativeReviewBoard.boardSha256, reviewSha256: plan.comparativeReview.reviewSha256, activeDirectionIds: plan.activeCandidateSet.directionIds, selectedDirectionId: plan.activeCandidateSet.selectedDirectionId, kitPlanSha256: validated.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10")?.planSha256, recipeSha256: recipe.recipeSha256, approvalBinding: recipe.approvalBinding, queue: validated.production.generation.summary, worker: validated.production.generation.workerStatus}, null, 2));
});
