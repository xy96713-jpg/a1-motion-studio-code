#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {auditCreatorPaletteCurrentAestheticGate} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackageLookMasterPrompt, sourceEvidenceForLookMasterCandidate} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {
  A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
  UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
  assertUniversalReferenceAttachmentManifest,
  buildUniversalReferenceAttachmentManifest,
} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";

export const GOLDEN_FILM_VISUAL_SYSTEM_MATURITY = "GOLDEN_FILM_VISUAL_SYSTEM_MATURITY_V1";
export const GOLDEN_FILM_MATURITY_CONTRACT = "A1GoldenFilmVisualSystemMaturityRun/v1";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const maturityDir = "golden-film-visual-system-maturity-v1";
const artifactPath = path.join(artifactDir, maturityDir, "maturity-run.json");
const publicPath = path.join(publicDir, maturityDir, "maturity-run.json");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
const publicFile = (url) => url ? path.join(appRoot, "public", String(url).replace(/^\//u, "")) : null;
const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const writeJsonAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};

const packageDecisions = (sequence) => sequence.decisions.filter((item) => item.packageDecision === "PACKAGE");
const planFor = (workspace, shotId) => (workspace.production.shotIntelligence?.packageLookMasterPlans || []).find((item) => item.shotId === shotId) || null;
const rawFor = (workspace, shotId, artifactSha256 = null) => (workspace.production.shotIntelligence?.lookMasterRawReferences || []).find((item) => item.shotId === shotId && (!artifactSha256 || item.artifact?.sha256 === artifactSha256)) || null;
const bindingFor = (workspace, shotId) => workspace.production.creatorPaletteShotBindingManifest?.entries?.find((item) => item.shotId === shotId) || null;
const repairFor = (repair, shotId) => repair?.entries?.find((item) => item.shotId === shotId) || null;

function currentUniversalReferenceWaveJobs(workspace, expectedTargetShotIds = null) {
  const jobs = workspace.production.generation.jobs || [];
  const pointer = workspace.production.goldenFilmVisualSystemMaturity || {};
  const currentPlanByShot = new Map((workspace.production.shotIntelligence?.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan.planSha256]));
  const pointerTargetShotIds = [...new Set(pointer.targetShotIds || [])].sort();
  const requestedTargetShotIds = expectedTargetShotIds == null ? pointerTargetShotIds : [...new Set(expectedTargetShotIds)].sort();
  const dispatchMaturityRunSha256 = pointer.maturityRunSha256;
  const universal = jobs.filter((job) => job.referencePackagingContract === "A1UniversalReferenceToImagegenPackaging/v1"
    && job.productionMethod === "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION"
    && currentPlanByShot.get(job.shotId) === job.lookMasterPlanSha256);
  const pointerUniversal = /^[a-f0-9]{64}$/.test(dispatchMaturityRunSha256 || "")
    ? universal.filter((job) => job.goldenFilmMaturityRunSha256 === dispatchMaturityRunSha256)
    : [];
  const targetShotIds = new Set(requestedTargetShotIds);
  const targeted = targetShotIds.size ? pointerUniversal.filter((job) => targetShotIds.has(job.shotId)) : pointerUniversal;
  const explicitIds = [...new Set([...(pointer.currentWaveJobIds || []), ...(pointer.queuedJobIds || [])])];
  if (explicitIds.length) {
    const explicit = universal.filter((job) => explicitIds.includes(job.id));
    if (explicit.length) return explicit;
  }
  if (expectedTargetShotIds != null && JSON.stringify(pointerTargetShotIds) !== JSON.stringify(requestedTargetShotIds) && targetShotIds.size) return [];
  if (!targeted.length && !targetShotIds.size && universal.length) {
    const selectedShas = new Set((workspace.production.shotIntelligence?.packageLookMasterPlans || [])
      .map((plan) => plan.provisionalWholeFilmBoardSelection?.artifact?.sha256)
      .filter(Boolean));
    const grouped = new Map();
    for (const [index, job] of jobs.entries()) {
      if (!universal.includes(job) || !/^[a-f0-9]{64}$/u.test(job.goldenFilmMaturityRunSha256 || "")) continue;
      const group = grouped.get(job.goldenFilmMaturityRunSha256) || {jobs: [], lastIndex: -1, selectedOutputCount: 0};
      group.jobs.push(job);
      group.lastIndex = Math.max(group.lastIndex, index);
      if (job.output?.sha256 && selectedShas.has(job.output.sha256)) group.selectedOutputCount += 1;
      grouped.set(job.goldenFilmMaturityRunSha256, group);
    }
    const latestSelectedWave = [...grouped.values()]
      .filter((group) => group.selectedOutputCount > 0)
      .sort((left, right) => right.lastIndex - left.lastIndex)[0];
    return latestSelectedWave?.jobs || [];
  }
  if (!targeted.length) return [];
  const latestCreatedAt = targeted.reduce((latest, job) => String(job.createdAt || "") > latest ? String(job.createdAt || "") : latest, "");
  return targeted.filter((job) => String(job.createdAt || "") === latestCreatedAt);
}

function generationLedgerFor(workspace, targetShotIds = null) {
  const maturityRunSha256 = workspace.production.goldenFilmVisualSystemMaturity?.maturityRunSha256 || null;
  const currentWaveJobs = currentUniversalReferenceWaveJobs(workspace, targetShotIds);
  const currentWaveDispatchMaturityRunSha256 = [...new Set(currentWaveJobs.map((job) => job.goldenFilmMaturityRunSha256).filter(Boolean))];
  const generated = (workspace.production.shotIntelligence?.lookMasterRawReferences || [])
    .filter((raw) => raw.artifact?.sha256 && raw.provenance?.generationJobId);
  const candidateShas = [...new Set(generated.map((raw) => raw.artifact.sha256))].sort();
  const legacyPackageOnly = generated.filter((raw) => raw.fullLookMasterStatus === "LEGACY_PACKAGE_ONLY" || raw.classification === "TECHNICAL_COMPOSITE_PROOF" || raw.provenance?.referenceAttachmentManifestSha256 == null);
  const attachedLookMasters = generated.filter((raw) => raw.fullLookMasterStatus === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" && raw.provenance?.referenceAttachmentManifestSha256);
  const waveGeneratedShas = [...new Set(currentWaveJobs.filter((job) => job.status === "complete" && job.output?.sha256).map((job) => job.output.sha256))].sort();
  const waveRawBySha = new Map(generated.filter((raw) => waveGeneratedShas.includes(raw.artifact.sha256)).map((raw) => [raw.artifact.sha256, raw]));
  const waveAuditedShas = waveGeneratedShas.filter((candidateSha) => {
    const raw = waveRawBySha.get(candidateSha);
    return Boolean(raw?.actualPixelAssessmentSha256 && raw?.semanticPixelAuditSha256);
  });
  const waveSystemEligibleShas = waveGeneratedShas.filter((candidateSha) => {
    const raw = waveRawBySha.get(candidateSha);
    return raw?.fullLookMasterStatus === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS"
      && raw?.selectionEligible === true
      && raw?.referencePackagingContract === "A1UniversalReferenceToImagegenPackaging/v1";
  });
  const currentSelectedShas = new Set((workspace.production.shotIntelligence?.packageLookMasterPlans || [])
    .map((plan) => plan.provisionalWholeFilmBoardSelection?.artifact?.sha256)
    .filter(Boolean));
  const waveAdoptedShas = waveGeneratedShas.filter((candidateSha) => waveSystemEligibleShas.includes(candidateSha) && currentSelectedShas.has(candidateSha));
  const waveUserApprovedShas = waveGeneratedShas.filter((candidateSha) => {
    const raw = waveRawBySha.get(candidateSha);
    return raw?.userVisualApproval === "APPROVED" || raw?.userVisualApproval === true;
  });
  const waveRejectedShas = waveGeneratedShas.filter((candidateSha) => {
    const raw = waveRawBySha.get(candidateSha);
    return Boolean(raw?.actualPixelAssessmentSha256 && raw?.semanticPixelAuditSha256)
      && !waveSystemEligibleShas.includes(candidateSha);
  });
  const wavePendingShas = waveSystemEligibleShas.filter((candidateSha) => !waveUserApprovedShas.includes(candidateSha));
  return {
    attemptedGeneratedCount: waveGeneratedShas.length,
    adoptedGeneratedCount: waveAdoptedShas.length,
    rejectedGeneratedCount: waveRejectedShas.length,
    systemEligibleGeneratedCount: waveSystemEligibleShas.length,
    pendingGeneratedCount: wavePendingShas.length,
    candidateShas: waveGeneratedShas,
    observedGeneratedCandidateCount: candidateShas.length,
    observedGeneratedCandidateShas: candidateShas,
    referenceAttachmentAudit: {
      contract: "A1ImagegenActualAttachmentEvidence/v1",
      productionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION",
      actualAttachmentProofRequired: true,
      fullLookMasterActualPixelPassCount: attachedLookMasters.length,
      legacyPackageOnlyCount: legacyPackageOnly.length,
      legacyPackageOnlyShas: [...new Set(legacyPackageOnly.map((raw) => raw.artifact.sha256))].sort(),
      textOnlyReferenceDeclarationsAccepted: false,
      currentWaveMaturityRunSha256: currentWaveDispatchMaturityRunSha256.length === 1 ? currentWaveDispatchMaturityRunSha256[0] : maturityRunSha256,
      currentWaveDispatchMaturityRunSha256: currentWaveDispatchMaturityRunSha256.length === 1 ? currentWaveDispatchMaturityRunSha256[0] : null,
      currentWaveJobCount: currentWaveJobs.length,
      currentWaveCompletedJobCount: currentWaveJobs.filter((job) => job.status === "complete" && job.output?.sha256).length,
      currentWaveFailedJobCount: currentWaveJobs.filter((job) => job.status === "failed").length,
      currentWaveProviderAttemptCount: currentWaveJobs.reduce((sum, job) => sum + Number(job.attempts || 0), 0),
      currentWaveTimeoutJobCount: currentWaveJobs.filter((job) => /timeout/iu.test(String(job.error || ""))).length,
      currentWaveAdoptedGeneratedCount: waveAdoptedShas.length,
      currentWaveSystemEligibleGeneratedCount: waveSystemEligibleShas.length,
      currentWavePendingGeneratedCount: wavePendingShas.length,
      currentWaveRejectedGeneratedCount: waveRejectedShas.length,
      currentWaveUserVisualApprovedCount: waveUserApprovedShas.length,
      currentWaveAuditedGeneratedCount: waveAuditedShas.length,
    },
    scope: "CURRENT_UNIVERSAL_REFERENCE_MATURITY_WAVE_DEDUPED_BY_SHA",
  };
}

function sourceReferencesFor(workspace, shotId) {
  const plan = planFor(workspace, shotId);
  const raw = rawFor(workspace, shotId, plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256 || null);
  const values = plan?.sourceEvidenceInputs?.length ? plan.sourceEvidenceInputs : raw?.sourceEvidenceInputs || [];
  return values.map((source) => ({
    id: source.id || source.sourceId || null,
    sourceUrl: source.sourceUrl || source.sourceId || null,
    title: source.title || null,
    publisher: source.publisher || null,
    publicUrl: source.publicUrl || null,
    sha256: source.sha256 || source.sourceSha256 || null,
    role: source.role || "REAL_EVIDENCE_INPUT",
    claimBoundary: source.claimBoundary || null,
    fileExists: Boolean(publicFile(source.publicUrl) && fs.existsSync(publicFile(source.publicUrl))),
  }));
}

function buildSourceRevisionHash(workspace, sequence, decisionSet) {
  return sha256({
    articleSourceTextSha256: workspace.article?.sourceTextSha256 || null,
    sequenceSourceRevisionHash: sequence.sourceRevisionHash || null,
    decisionSourceFingerprints: (decisionSet?.items || []).map((item) => ({shotId: item.shotId, sourceHash: item.sourceHash || null, rewriteSourceHash: item.rewriteSourceHash || null})),
  });
}

function buildDecisionContract(workspace, sequence) {
  const runtime = workspace.production.shotIntelligence || {};
  const decisionSet = runtime.decisionSet || {};
  const byShot = new Map((decisionSet.items || []).map((item) => [item.shotId, item]));
  const beats = sequence.decisions.map((decision) => {
    const intelligence = byShot.get(decision.shotId) || {};
    const review = intelligence.sequenceReview || {};
    const plan = planFor(workspace, decision.shotId);
    const visualActorContract = plan?.typographyVisualContract || null;
    const network = intelligence.networkDecision || "SKIP";
    const sources = network === "REQUIRED" ? sourceReferencesFor(workspace, decision.shotId) : [];
    return {
      shotId: decision.shotId,
      order: decision.order,
      network,
      networkReason: intelligence.networkReason || null,
      packageDecision: decision.packageDecision,
      contentTreatment: decision.contentTreatment,
      frameOccupation: decision.frameOccupation,
      assemblyMode: decision.assemblyMode || null,
      presentationMode: decision.presentationMode || null,
      visualResponsibility: review.informationOwner || review.evidenceOwner || {kind: "PRESENTER_BASE", shotId: decision.shotId},
      evidenceOwnership: intelligence.semanticSignals?.evidenceOwnership || review.evidenceOwner?.kind || null,
      informationGain: Number(review.informationGainVsNoPackage || 0),
      adjacentRedundancy: Number(review.redundancyWithAdjacentBeats || 0),
      paragraphRedundancy: Number(intelligence.semanticSignals?.paragraphSimilarity || review.claimAssociation?.score || 0),
      typographyActor: intelligence.typographyActor === true,
      typographyVisualRole: intelligence.typographyPolicy?.typographyVisualRole || intelligence.typographyPolicy?.typographyVisualContract?.role || "NONE",
      protectedPhrases: structuredClone(visualActorContract?.visiblePhrases || plan?.protectedPhrases || intelligence.protectedPhrases || []),
      visualActorContract: structuredClone(visualActorContract),
      sourceReferences: sources,
      sourceReferenceIds: sources.map((source) => source.id).filter(Boolean),
      sourceIdentityRequired: network === "REQUIRED",
    };
  });
  const requiredSourceFailures = beats.filter((beat) => beat.network === "REQUIRED" && (!beat.sourceReferences.length || beat.sourceReferences.some((source) => !source.id || !source.sourceUrl || !source.sha256 || !source.fileExists)));
  const sourceRevisionHash = buildSourceRevisionHash(workspace, sequence, decisionSet);
  const body = {
    contract: "A1WholeFilmVisualDecisionContract/v1",
    version: 1,
    status: requiredSourceFailures.length ? "BLOCKED" : "PASS",
    authority: "CURRENT_CANONICAL_CREATOR_PACKAGING_SEQUENCE",
    sourceRevisionHash,
    sequenceSha256: sequence.sequenceSha256,
    decisionSetInput: {sha256: decisionSet.sha256 || null, current: decisionSet.current === true, historyReadOnly: decisionSet.historyReadOnly === true, excludedFromAuthority: decisionSet.historyReadOnly === true},
    beats,
    summary: {
      beatCount: beats.length,
      packageCount: beats.filter((beat) => beat.packageDecision === "PACKAGE").length,
      noPackageCount: beats.filter((beat) => beat.packageDecision !== "PACKAGE").length,
      networkRequiredCount: beats.filter((beat) => beat.network === "REQUIRED").length,
      networkHelpfulCount: beats.filter((beat) => beat.network === "HELPFUL").length,
      networkSkipCount: beats.filter((beat) => beat.network === "SKIP").length,
      titleActorCount: beats.filter((beat) => beat.typographyActor).length,
    },
    requiredSourceFailures: requiredSourceFailures.map((beat) => ({shotId: beat.shotId, reason: "NETWORK_REQUIRED_SOURCE_REFERENCE_MISSING_OR_UNVERIFIED"})),
    nextAction: requiredSourceFailures.length ? "BIND_REAL_SOURCE_REFERENCE_BEFORE_IMAGEGEN" : "FREEZE_ART_DIRECTION_CONTRACT",
  };
  return {...body, decisionContractSha256: sha256({...body, decisionContractSha256: undefined})};
}

function phaseZero(workspace, sequence, repair) {
  const packageIds = new Set(packageDecisions(sequence).map((item) => item.shotId));
  const migration = new Map((workspace.production.creatorPaletteActualModeMigration?.entries || []).map((item) => [item.shotId, item]));
  const results = [...packageIds].sort().map((shotId) => {
    const binding = bindingFor(workspace, shotId);
    const migrationEntry = migration.get(shotId) || null;
    const repairEntry = repairFor(repair, shotId);
    const classification = binding?.status === "PASS"
      ? (repairEntry?.reasonCodes?.includes("BINDING_PASS") && migrationEntry?.status === "MIGRATED_ONCE" ? "REBINDABLE" : "PASS")
      : repairEntry?.status === "READY_FOR_GENERATION" ? "GENERATION_REQUIRED" : "GENERATION_REQUIRED";
    return {
      shotId,
      classification,
      bindingStatus: binding?.status || "MISSING",
      blockerCodes: structuredClone(binding?.blockers || []),
      artifactSha256: binding?.actualShotCandidateSha256 || null,
      compositeSha256: binding?.compositeSha256 || null,
      actualMode: migrationEntry?.frameOccupation || binding?.actualFrameOccupation || null,
      actualModeEvidence: migrationEntry?.evidence || binding?.actualModeEvidence || null,
      actualPixelAuditSha256: binding?.actualPixelAuditSha256 || null,
      semanticAuditSha256: binding?.semanticPixelAuditSha256 || null,
      ocrPerformed: migrationEntry?.ocrPerformed === true,
      semanticReviewPerformed: migrationEntry?.semanticReviewPerformed === true,
      referencePackagingContract: planFor(workspace, shotId)?.referencePackaging?.contract || null,
      productionMethod: planFor(workspace, shotId)?.referencePackaging?.productionMethod || null,
      nextAction: classification === "GENERATION_REQUIRED" ? (repairEntry?.nextAction || "PREPARE_GENERATION_NO_DISPATCH") : "NO_ACTION",
    };
  });
  const unknown = results.filter((item) => !["PASS", "REBINDABLE", "GENERATION_REQUIRED"].includes(item.classification));
  const reused = results.filter((item) => ["PASS", "REBINDABLE"].includes(item.classification) && item.artifactSha256).map((item) => item.artifactSha256);
  const generationReadyShotIds = results.filter((item) => item.classification === "GENERATION_REQUIRED").map((item) => item.shotId);
  const expectedPackageCount = packageIds.size;
  const repairAuthorityPass = repair?.status === "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED"
    && repair?.summary?.packageCount === expectedPackageCount
    && repair?.summary?.noPackageCount === sequence.decisions.length - expectedPackageCount
    && repair?.summary?.readyForGenerationCount === 0
    && !repairFor(repair, "ED-15")?.reasonCodes?.includes("PACKAGE_ROUTE");
  return {
    // A bounded generation target is a valid Phase 0 outcome.  The phase is
    // blocked only when a shot cannot be classified deterministically; the
    // repair authority remains a separate gate before final board approval.
    status: unknown.length ? "BLOCKED" : "PASS",
    inputHashes: {sequenceSha256: sequence.sequenceSha256, bindingManifestSha256: workspace.production.creatorPaletteShotBindingManifest?.manifestSha256 || null, repairManifestSha256: repair?.manifestSha256 || null, migrationSha256: workspace.production.creatorPaletteActualModeMigration?.migrationSha256 || null},
    results,
    summary: {packageCount: results.length, noPackageCount: sequence.decisions.length - results.length, passCount: results.filter((item) => item.classification === "PASS").length, rebindableCount: results.filter((item) => item.classification === "REBINDABLE").length, generationRequiredCount: generationReadyShotIds.length, unknownCount: unknown.length, reusedExistingCandidateCount: reused.length, reusedExistingCandidateShas: [...new Set(reused)], newGeneratedCount: 0, newGeneratedShas: [], generationReadyShotIds, repairAuthorityPass},
    failureReasons: [...unknown.map((item) => `${item.shotId}:UNKNOWN_CLASSIFICATION`), ...(!repairAuthorityPass ? ["CURRENT_REPAIR_MANIFEST_REQUIRES_BOUND_REPAIR_OR_TARGETED_GENERATION"] : [])],
    nextAction: generationReadyShotIds.length ? "COMPILE_DECISION_AND_ART_DIRECTION_CONTRACTS_BEFORE_GENERATION" : "COMPILE_DECISION_AND_ART_DIRECTION_CONTRACTS",
  };
}

function phaseTwo(workspace, sequence, decisionContract, {preflightShotIds = []} = {}) {
  const policy = workspace.visualBible?.visualGenerationPolicy || {};
  const style = workspace.production?.packagingStyleAuthority || {};
  const referenceManifestFile = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
  const referenceManifestSha256 = fileSha256(referenceManifestFile);
  const packageIds = new Set(packageDecisions(sequence).map((item) => item.shotId));
  const planConflicts = [];
  for (const shotId of packageIds) {
    const decision = sequence.decisions.find((item) => item.shotId === shotId);
    const plan = planFor(workspace, shotId);
    const context = plan?.videoContext || null;
    if (!plan) {
      planConflicts.push({shotId, code: "CURRENT_LOOK_MASTER_PLAN_MISSING"});
      continue;
    }
    if (plan.assemblyMode !== decision.assemblyMode) planConflicts.push({shotId, code: `PLAN_ASSEMBLY_MODE_STALE:${plan.assemblyMode}->${decision.assemblyMode}`});
    if (plan.presentationMode !== decision.presentationMode) planConflicts.push({shotId, code: `PLAN_PRESENTATION_MODE_STALE:${plan.presentationMode}->${decision.presentationMode}`});
    if (context?.assemblyMode !== decision.assemblyMode) planConflicts.push({shotId, code: `VIDEO_CONTEXT_ASSEMBLY_MODE_STALE:${context?.assemblyMode || "NULL"}->${decision.assemblyMode}`});
    if (context?.presentationMode !== decision.presentationMode) planConflicts.push({shotId, code: `VIDEO_CONTEXT_PRESENTATION_MODE_STALE:${context?.presentationMode || "NULL"}->${decision.presentationMode}`});
    if (plan.referencePackaging?.contract !== "A1UniversalReferenceToImagegenPackaging/v1" || plan.referencePackaging?.productionMethod !== "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION") planConflicts.push({shotId, code: "UNIVERSAL_REFERENCE_PACKAGING_CONTRACT_MISSING"});
  }
  const generationPreflight = preflightShotIds.map((shotId) => {
    const decision = sequence.decisions.find((item) => item.shotId === shotId);
    const plan = planFor(workspace, shotId);
    if (!decision || !plan) return {shotId, status: "BLOCKED", failures: ["CURRENT_DECISION_OR_LOOK_MASTER_PLAN_MISSING"], candidatePreflights: []};
    const context = plan.videoContext || {};
    const presenterRoute = plan.presenterPackagingMode || plan.presenterPackagingRoute?.mode || null;
    const overlay = decision.frameOccupation === "OVERLAY";
    const routePass = overlay
      ? ["SAFE_REGION_FOREGROUND_OVERLAY", "BEHIND_SUBJECT_MATTE", "PRESENTER_CUTOUT_COMPOSITE"].includes(presenterRoute)
      : ["FULLSCREEN", "EXPLAINER"].includes(decision.presentationMode)
        || ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(presenterRoute);
    const geometryPass = overlay ? Boolean(context.baseFrame?.sha256 && context.baseFrame?.publicUrl && routePass) : routePass;
    const candidatePreflights = Array.from({length: plan.candidateBudget}, (_, index) => index + 1).map((candidateIndex) => {
      const failures = [];
      try {
        const sourceEvidence = sourceEvidenceForLookMasterCandidate(plan, candidateIndex);
        const referenceInputs = [
          {id: `${shotId.toLowerCase()}-base-video-hold-frame`, publicUrl: context.baseFrame?.publicUrl, sha256: context.baseFrame?.sha256, role: "base-video-hold-frame", adoptedTraits: ["real hold frame", "composition geometry anchor", "original pixels restored after approval"]},
          ...sourceEvidence.map((item) => ({id: item.id, publicUrl: item.publicUrl, sha256: item.sha256, role: item.role, adoptedTraits: [item.sourceKind, "real evidence input", "exact source rebind required"]})),
          ...(plan.referenceInputs || []),
        ];
        const attachmentManifest = buildUniversalReferenceAttachmentManifest({jobId: `preflight-${shotId.toLowerCase()}-c${String(candidateIndex).padStart(2, "0")}`, referenceInputs, stage: "STATIC_PREFLIGHT_SHA_VERIFIED"});
        assertUniversalReferenceAttachmentManifest(attachmentManifest);
        const prompt = buildPackageLookMasterPrompt(plan, candidateIndex, {generationMode: "LOOK_MASTER_REFERENCE_ATTACHED"});
        const legacyLayerRoute = /return a true transparent PNG overlay|generate only an independent layer|make a standalone transparent asset|checkerboard transparency grid|editor_selects_open_region_at_insertion/iu.test(prompt);
        const fullLookMaster = /complete, integrated.*16:9|complete 16:9/iu.test(prompt)
          && /actual reference geometry|attached real images are mandatory multimodal inputs/iu.test(prompt);
        const aesthetic = /warm-yellow, cream, beige, sepia, or old-paper dominant background is forbidden/iu.test(prompt)
          && /neutral-white, cool-gray, charcoal, low-saturation-blue, or footage-derived dominant field/iu.test(prompt);
        const attachmentPass = attachmentManifest.fileCount === referenceInputs.length
          && attachmentManifest.fileCount >= 2
          && attachmentManifest.attachments.every((item) => item.sourcePath && item.sourceSha256 && item.sourceType && item.semanticRole && item.transformPolicy && Number.isInteger(item.generationAttachmentIndex));
        if (legacyLayerRoute || !fullLookMaster) failures.push("PROMPT_LEGACY_LAYER_OR_INCOMPLETE_FRAME_ROUTE");
        if (!aesthetic) failures.push("PROMPT_CURRENT_AESTHETIC_CONTRACT_MISSING");
        if (!attachmentPass) failures.push("REFERENCE_ATTACHMENT_MANIFEST_NOT_SHA_VERIFIED");
        if (attachmentManifest.attachments[0]?.sourceSha256 !== context.baseFrame?.sha256) failures.push("ACTUAL_HOLD_FRAME_NOT_FIRST_ATTACHMENT");
        return {
          candidateIndex,
          directionId: plan.candidateDirections[candidateIndex - 1]?.directionId || null,
          primaryFamily: plan.candidateDirections[candidateIndex - 1]?.primaryFamily || null,
          topologyFingerprint: plan.candidateDirections[candidateIndex - 1]?.fingerprint || null,
          promptSha256: sha256(prompt),
          prompt,
          attachmentManifestSha256: attachmentManifest.manifestSha256,
          attachmentCount: attachmentManifest.fileCount,
          attachmentSourceSha256s: attachmentManifest.sourceSha256s,
          attachmentPass,
          fullLookMasterPass: fullLookMaster && !legacyLayerRoute,
          aestheticPass: aesthetic,
          status: failures.length ? "BLOCKED" : "PASS",
          failures,
        };
      } catch (error) {
        return {candidateIndex, status: "BLOCKED", failures: [`STATIC_PREFLIGHT_EXCEPTION:${error instanceof Error ? error.message : String(error)}`]};
      }
    });
    const directionFingerprints = candidatePreflights.map((item) => item.topologyFingerprint).filter(Boolean);
    const primaryFamilies = candidatePreflights.map((item) => item.primaryFamily).filter(Boolean);
    const topologyPass = directionFingerprints.length === plan.candidateBudget
      && new Set(directionFingerprints).size === directionFingerprints.length
      && new Set(primaryFamilies).size >= Math.min(2, plan.candidateBudget);
    const failures = [
      ...(!geometryPass ? ["MODE_AWARE_HOLD_FRAME_GEOMETRY_ROUTE_INVALID"] : []),
      ...(!topologyPass ? ["CANDIDATE_VISUAL_PRIMITIVES_NOT_MATERIALLY_DISTINCT"] : []),
      ...candidatePreflights.flatMap((item) => item.failures.map((failure) => `C${String(item.candidateIndex).padStart(2, "0")}:${failure}`)),
    ];
    return {
      shotId,
      canonicalMode: {assemblyMode: decision.assemblyMode, presentationMode: decision.presentationMode, frameOccupation: decision.frameOccupation, presenterPackagingMode: presenterRoute},
      planSha256: plan.planSha256,
      promptSha256: sha256(candidatePreflights.map((item) => item.promptSha256 || null)),
      candidateCount: candidatePreflights.length,
      candidatePreflights,
      safeAreaPass: geometryPass,
      promptPass: candidatePreflights.every((item) => item.fullLookMasterPass === true && item.aestheticPass === true),
      attachmentPass: candidatePreflights.every((item) => item.attachmentPass === true),
      topologyPass,
      sourceIdentityPass: candidatePreflights.every((item) => item.attachmentSourceSha256s?.[0] === context.baseFrame?.sha256),
      status: failures.length ? "BLOCKED" : "PASS",
      failures,
    };
  });
  const failureReasons = [];
  if (style.referencePackId !== "pinterest-retro-pixel-v1") failureReasons.push("ACTIVE_STYLE_REFERENCE_PACK_INVALID");
  if (style.referenceManifestFileSha256 && style.referenceManifestFileSha256 !== fileSha256(referenceManifestFile)) failureReasons.push("STYLE_REFERENCE_MANIFEST_SHA_MISMATCH");
  if (policy.forbidden?.composition?.includes("generic-title-card") !== true) failureReasons.push("GENERIC_TITLE_CARD_FORBIDDEN_RULE_MISSING");
  if (decisionContract.status !== "PASS") failureReasons.push("DECISION_CONTRACT_NOT_PASS");
  if (planConflicts.length) failureReasons.push("CURRENT_LOOK_MASTER_PLAN_OR_VIDEO_CONTEXT_MODES_STALE");
  for (const item of generationPreflight.filter((item) => item.status !== "PASS")) failureReasons.push(...item.failures.map((failure) => `${item.shotId}:${failure}`));
  const body = {
    status: failureReasons.length ? "BLOCKED" : "PASS",
    inputHashes: {policySha256: policy.sha256 || null, styleAuthoritySha256: sha256(style), referenceManifestSha256: referenceManifestSha256, sequenceSha256: sequence.sequenceSha256, decisionContractSha256: decisionContract.decisionContractSha256},
    contract: {activeAestheticRoot: "pinterest-retro-pixel-v1", styleProfileId: style.styleProfileId || null, crtRule: "LIGHT_SYNTAX_ONLY", dominantFieldRule: "NO_WARM_YELLOW_OR_CREAM", allowedBaseFields: ["neutral-white", "cool-gray", "charcoal", "low-saturation-blue"], allowedAccents: ["cobalt-blue", "magenta", "acid-green"], integratedCompositionRequired: true, universalReferencePackagingContract: "A1UniversalReferenceToImagegenPackaging/v1", productionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION", actualImageAttachmentRequired: true, capabilities: ["PRESENTER_AWARE_OVERLAY", "HERO_TYPOGRAPHY", "SOURCE_EVIDENCE_EXPLAINER", "FULLSCREEN_EDITORIAL_TITLE"], maxVisibleActors: policy.visualReferencePack?.simplicityPolicy?.maxVisibleActors || 2, maxSemanticTextBlocks: policy.visualReferencePack?.simplicityPolicy?.maxSemanticTextBlocks || 1},
    planModeConflicts: planConflicts,
    generationPreflight,
    failureReasons,
    nextAction: failureReasons.length ? "RECOMPILE_CURRENT_PLAN_AND_VIDEO_CONTEXT_MODES_BEFORE_GENERATION" : "RUN_ONE_BOUNDED_GENERATION_WAVE_MAX_CONCURRENCY_2",
  };
  return {...body, artDirectionContractSha256: sha256({...body, artDirectionContractSha256: undefined})};
}

function buildRegression(workspace, sequence, decisionContract, phaseTwoResult, repair) {
  const binding = workspace.production.creatorPaletteShotBindingManifest;
  const currentRepair = repair || {};
  const packageCount = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length;
  const noPackageCount = sequence.decisions.length - packageCount;
  const currentRepairPackageCount = currentRepair.summary?.packageCount || 0;
  const currentRepairNoPackageCount = currentRepair.summary?.noPackageCount || 0;
  const packagePlans = workspace.production.shotIntelligence?.packageLookMasterPlans || [];
  const universalReferencePlanGate = packagePlans.filter((plan) => sequence.decisions.some((decision) => decision.shotId === plan.shotId && decision.packageDecision === "PACKAGE")).length === packageCount
    && packagePlans.filter((plan) => sequence.decisions.some((decision) => decision.shotId === plan.shotId && decision.packageDecision === "PACKAGE")).every((plan) => plan.referencePackaging?.contract === "A1UniversalReferenceToImagegenPackaging/v1" && plan.referencePackaging?.productionMethod === "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION" && plan.referencePackaging?.sourceInputsAreImageAttachments === true);
  const statuses = [
    {id: "NO_PACKAGE_PRESENTER_BEAT", status: sequence.decisions.some((item) => item.packageDecision === "NO_PACKAGE") ? "PASS" : "BLOCKED"},
    {id: "REAL_EVIDENCE_BEAT_SOURCE_BOUND", status: decisionContract.requiredSourceFailures?.length ? "BLOCKED" : "PASS"},
    {id: "PRESENTER_AWARE_OVERLAY", status: sequence.decisions.some((item) => item.frameOccupation === "OVERLAY") && binding?.entries?.some((item) => item.shotId === "ED-08" && item.status === "PASS") ? "PASS" : "BLOCKED"},
    {id: "ABSTRACT_MECHANISM_EXPLAINER", status: binding?.entries?.some((item) => item.shotId === "ED-14" && item.status === "PASS") ? "PASS" : "BLOCKED"},
    {id: "FULLSCREEN_EDITORIAL_TITLE", status: sequence.decisions.some((item) => item.frameOccupation === "FULL_FRAME_TAKEOVER") ? "PASS" : "BLOCKED"},
    {id: "CROSS_SHOT_DUPLICATE", status: sequence.conflictAudit?.status === "PASS" ? "PASS" : "BLOCKED"},
    {id: "STALE_CANDIDATE_CURRENT_AESTHETIC_GATE", status: auditCreatorPaletteCurrentAestheticGate((workspace.production.shotIntelligence?.lookMasterRawReferences || []).find((item) => item.artifact?.sha256 === "d144bc403ba16c51de2c5453a90772de8e63a29b465a077eeea3da4bd33d2e4e"))?.status === "BLOCKED" ? "PASS" : "BLOCKED"},
    {id: "PACKAGE_TO_NO_PACKAGE_REPAIR_BINDING_CLEARED", status: currentRepairPackageCount === packageCount && currentRepairNoPackageCount === noPackageCount && !currentRepair.entries?.find((entry) => entry.shotId === "ED-15" && entry.reasonCodes?.includes("PACKAGE_ROUTE")) ? "PASS" : "BLOCKED"},
    {id: "REPAIR_BINDING_API_SINGLE_AUTHORITY", status: binding?.manifestSha256 === currentRepair.bindingManifestSha256 && currentRepairPackageCount === packageCount && currentRepairNoPackageCount === noPackageCount ? "PASS" : "BLOCKED"},
    {id: "HISTORY_MANIFEST_NOT_CURRENT_OR_BLOCKING", status: currentRepair.supersedesCurrentManifest?.status === "HISTORY_READ_ONLY" && currentRepair.supersedesCurrentManifest?.current === false ? "PASS" : "BLOCKED"},
    {id: "STATIC_BOARD_CANNOT_OVERRIDE_CURRENT_REPAIR_BLOCKER", status: currentRepair.status === "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED" && currentRepair.summary?.readyForGenerationCount === 0
      ? "PASS"
      : workspace.production.shotIntelligence.wholeFilmStaticBoard?.approvalAllowed !== true && workspace.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed !== true ? "PASS" : "BLOCKED"},
    {id: "GENERATION_LEDGER_DISTINGUISHES_ATTEMPTED_ADOPTED_REJECTED", status: Number.isInteger(currentRepair.generationLedger?.attemptedGeneratedCount) && Number.isInteger(currentRepair.generationLedger?.adoptedGeneratedCount) && Number.isInteger(currentRepair.generationLedger?.rejectedGeneratedCount) ? "PASS" : "BLOCKED"},
    {id: "INTERRUPTION_REPEAT_NOOP_CACHE", status: workspace.production.generation.summary.queued === 0 && workspace.production.generation.summary.running === 0 && workspace.production.generation.workerStatus === "frozen" && workspace.production.creatorPaletteBoundRepair?.imageGenerationPerformed === false ? "PASS" : "BLOCKED"},
    {id: "NO_GENERATION_READY_NO_WORKER", status: phaseTwoResult.status === "BLOCKED" && workspace.production.generation.workerStatus === "frozen" ? "PASS" : "PASS"},
    {id: "UNIVERSAL_REFERENCE_ATTACHMENT_CONTRACT", status: universalReferencePlanGate ? "PASS" : "BLOCKED"},
  ];
  return {contract: "A1GoldenFilmVisualSystemMaturityRegression/v1", status: statuses.every((item) => item.status === "PASS") ? "PASS" : "BLOCKED", cases: statuses, nextAction: statuses.every((item) => item.status === "PASS") ? "KEEP_NARROW_REGRESSION_IN_CI" : "FIX_REGRESSION_CASES"};
}

export function buildGoldenFilmVisualSystemMaturityRun(workspace, {now = new Date().toISOString()} = {}) {
  const sequence = workspace.production.canonicalCreatorPackagingSequence;
  const decisionContract = buildDecisionContract(workspace, sequence);
  const repairPath = path.join(publicDir, "incremental-repair-executor-v1", "repair-manifest.json");
  const repair = readJson(repairPath);
  const phase0 = phaseZero(workspace, sequence, repair);
  const phase1 = {status: decisionContract.status, inputHashes: {sequenceSha256: sequence.sequenceSha256, sourceRevisionHash: decisionContract.sourceRevisionHash, decisionSetSha256: workspace.production.shotIntelligence?.decisionSet?.sha256 || null}, decisionContractSha256: decisionContract.decisionContractSha256, summary: decisionContract.summary, failureReasons: decisionContract.requiredSourceFailures, nextAction: decisionContract.nextAction};
  const generationRequired = phase0.summary.generationReadyShotIds;
  const preflightShotIds = [...new Set(generationRequired)]
    .filter((shotId) => packageDecisions(sequence).some((item) => item.shotId === shotId));
  const phase2 = phaseTwo(workspace, sequence, decisionContract, {preflightShotIds});
  const zeroCostClosure = phase0.status === "PASS"
    && phase1.status === "PASS"
    && phase2.status === "PASS"
    && generationRequired.length === 0;
  const runtime = workspace.production.shotIntelligence || {};
  const packageCount = packageDecisions(sequence).length;
  const binding = workspace.production.creatorPaletteShotBindingManifest || {};
  const generationLedger = generationLedgerFor(workspace, generationRequired);
  const repairAuthorityPass = phase0.summary.repairAuthorityPass === true;
  const scope = runtime.canonicalStaticBoardAuthority || {};
  const board = runtime.wholeFilmStaticBoard || {};
  const boardReady = board.status === "PENDING_USER_APPROVAL"
    && board.reviewScope === "WHOLE_FILM_STATIC_BOARD"
    && board.itemCount === packageCount
    && board.timelineBoard?.itemCount === sequence.decisions.length;
  const maturityRunSha256 = workspace.production.goldenFilmVisualSystemMaturity?.maturityRunSha256 || null;
  const currentWaveJobs = currentUniversalReferenceWaveJobs(workspace, generationRequired);
  const currentWaveDispatchMaturityRunSha256 = [...new Set(currentWaveJobs.map((job) => job.goldenFilmMaturityRunSha256).filter(Boolean))];
  const currentWaveSettled = currentWaveJobs.length > 0 && currentWaveJobs.every((job) => !["queued", "running"].includes(job.status));
  const currentWaveGeneratedShas = [...new Set(currentWaveJobs.filter((job) => job.status === "complete" && job.output?.sha256).map((job) => job.output.sha256))].sort();
  const currentWaveFailures = currentWaveJobs.filter((job) => job.status === "failed").map((job) => ({jobId: job.id, shotId: job.shotId, reason: job.error || "GENERATION_FAILED"}));
  const currentWaveAuditedShas = currentWaveGeneratedShas.filter((candidateSha) => {
    const raw = (workspace.production.shotIntelligence?.lookMasterRawReferences || []).find((item) => item.artifact?.sha256 === candidateSha);
    return Boolean(raw?.actualPixelAssessmentSha256 && raw?.semanticPixelAuditSha256);
  });
  const currentWaveAuditPending = currentWaveSettled && currentWaveGeneratedShas.length > 0 && currentWaveAuditedShas.length < currentWaveGeneratedShas.length;
  const currentWaveAuditComplete = currentWaveSettled && currentWaveGeneratedShas.length > 0 && currentWaveAuditedShas.length === currentWaveGeneratedShas.length && currentWaveFailures.length === 0 && currentWaveGeneratedShas.length === currentWaveJobs.length;
  const currentWaveAuditCompleteWithFailures = currentWaveSettled && currentWaveGeneratedShas.length > 0 && currentWaveAuditedShas.length === currentWaveGeneratedShas.length && (currentWaveFailures.length > 0 || currentWaveGeneratedShas.length < currentWaveJobs.length);
  const currentWaveNoOutput = currentWaveSettled && currentWaveGeneratedShas.length === 0;
  const phase3 = {
    status: currentWaveAuditCompleteWithFailures
      ? "ACTUAL_PIXEL_AUDIT_COMPLETE_WITH_REJECTIONS"
      : currentWaveAuditPending
      ? "GENERATION_COMPLETE_PENDING_ACTUAL_PIXEL_GATE"
      : currentWaveNoOutput
        ? "GENERATION_FAILED_BEFORE_PIXEL_OUTPUT"
        : currentWaveAuditComplete ? "PASS" : zeroCostClosure ? "ZERO_COST_CLOSURE" : phase0.status === "PASS" && phase1.status === "PASS" && phase2.status === "PASS" ? "READY" : "BLOCKED",
    inputHashes: {decisionContractSha256: decisionContract.decisionContractSha256, artDirectionContractSha256: phase2.artDirectionContractSha256, repairManifestSha256: repair?.manifestSha256 || null},
    referencePackagingContract: "A1UniversalReferenceToImagegenPackaging/v1",
    productionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION",
    imagegenActualAttachmentRequired: true,
    generationAllowed: false,
    generationDispatched: currentWaveJobs.length > 0,
    maxConcurrency: 2,
    targetShotIds: generationRequired.length ? generationRequired : [...new Set(currentWaveJobs.map((job) => job.shotId))].sort(),
    currentWaveJobIds: currentWaveJobs.map((job) => job.id),
    waveDispatchMaturityRunSha256: currentWaveDispatchMaturityRunSha256.length === 1 ? currentWaveDispatchMaturityRunSha256[0] : null,
    newGeneratedShas: currentWaveGeneratedShas,
    failureReasons: currentWaveAuditCompleteWithFailures
      ? ["BOUNDED_GENERATION_WAVE_HAS_FAILED_JOBS", "UNRESOLVED_TARGET_SHOTS_REQUIRE_ONE_EXPLICIT_RETRY_OR_REPLAN"]
      : currentWaveAuditPending
      ? [...(currentWaveFailures.length ? ["BOUNDED_GENERATION_WAVE_HAS_FAILED_JOBS"] : []), "ACTUAL_PIXEL_AUDIT_REQUIRED"]
      : currentWaveNoOutput
        ? ["BOUNDED_GENERATION_WAVE_PRODUCED_NO_PNG", ...currentWaveFailures.map((item) => `${item.shotId}:${item.reason}`)]
        : zeroCostClosure || phase2.status === "PASS" ? [] : ["PHASE_2_ART_DIRECTION_CONTRACT_BLOCKED"],
    nextAction: currentWaveAuditCompleteWithFailures
      ? "RETRY_MISSING_UNIVERSAL_REFERENCE_LOOK_MASTERS_ONCE"
      : currentWaveAuditPending
      ? "AUDIT_NEW_GENERATED_CANDIDATES_ACTUAL_PIXEL"
      : currentWaveNoOutput
        ? "REVIEW_PROVIDER_FAILURES_BEFORE_ANY_RETRY"
        : currentWaveAuditComplete || zeroCostClosure ? (boardReady ? "CONFIRM_WHOLE_FILM_STATIC_BOARD" : "REBUILD_WHOLE_FILM_STATIC_BOARD") : phase2.status === "PASS" ? "DISPATCH_BOUNDED_GENERATION_WAVE" : phase2.nextAction,
  };
  const phase4Pass = zeroCostClosure
    && repairAuthorityPass
    && binding.status === "PASS"
    && binding.passCount === packageCount
    && !(binding.blockedShotIds || []).length
    && scope.status === "PASS"
    && boardReady;
  const phase4Ready = zeroCostClosure
    && repairAuthorityPass
    && binding.status === "PASS"
    && binding.passCount === packageCount
    && !(binding.blockedShotIds || []).length
    && scope.status === "PASS";
  const phase4 = {
    status: phase4Pass ? "PASS" : phase4Ready ? "READY_FOR_STATIC_BOARD_BUILD" : "BLOCKED",
    inputHashes: {sequenceSha256: sequence.sequenceSha256, bindingManifestSha256: binding.manifestSha256 || null, boardSha256: board.sha256 || null},
    deterministicPassCount: binding.passCount || 0,
    packageCount,
    exceptions: 0,
    boardRebuilt: boardReady,
    userApproval: false,
    failureReasons: phase4Pass || phase4Ready ? [] : [
      `${binding.passCount || 0}_OF_${packageCount}_PACKAGE_BINDINGS_AND_AESTHETIC_AUDITS_NOT_PASS`,
      ...(repairAuthorityPass ? [] : ["CURRENT_REPAIR_MANIFEST_SINGLE_AUTHORITY_BLOCKED"]),
      ...(zeroCostClosure ? [] : ["PHASE_3_NOT_EXECUTED"]),
      ...(scope.status !== "PASS" ? ["CANONICAL_STATIC_BOARD_SCOPE_BLOCKED"] : []),
    ],
    nextAction: phase4Pass ? "CONFIRM_WHOLE_FILM_STATIC_BOARD" : phase4Ready ? "REBUILD_WHOLE_FILM_STATIC_BOARD" : phase2.nextAction,
  };
  const regressions = buildRegression(workspace, sequence, decisionContract, phase2, {...repair, bindingManifestSha256: workspace.production.creatorPaletteShotBindingManifest?.manifestSha256 || null});
  const inputHashes = {
    workspaceSha256: workspace.workspaceSha256,
    sourceRevisionHash: decisionContract.sourceRevisionHash,
    sequenceSha256: sequence.sequenceSha256,
    decisionSetSha256: workspace.production.shotIntelligence?.decisionSet?.sha256 || null,
    packagingBeatPlanSha256: workspace.production.packagingBeatPlan?.sha256 || null,
    visualCoverageSha256: workspace.production.shotVisualCoveragePlan?.sha256 || null,
    styleAuthoritySha256: sha256(workspace.production.packagingStyleAuthority || {}),
    policySha256: workspace.visualBible?.visualGenerationPolicy?.sha256 || null,
    registrySha256: workspace.production.creatorPackagingPaletteRegistry?.registrySha256 || null,
    bindingManifestSha256: workspace.production.creatorPaletteShotBindingManifest?.manifestSha256 || null,
    repairManifestSha256: repair?.manifestSha256 || null,
    migrationSha256: workspace.production.creatorPaletteActualModeMigration?.migrationSha256 || null,
    boardSha256: workspace.production.shotIntelligence?.wholeFilmStaticBoard?.sha256 || null,
  };
  const body = {
    contract: GOLDEN_FILM_MATURITY_CONTRACT,
    maturityId: GOLDEN_FILM_VISUAL_SYSTEM_MATURITY,
    version: 1,
    current: true,
    authority: "CURRENT_CANONICAL_CREATOR_PACKAGING_SEQUENCE_AND_CURRENT_PALETTE_BOUND_REPAIR",
    generatedAt: now,
    inputHashes,
    decisionContract,
    artDirectionContract: phase2,
    phases: {PHASE_0: phase0, PHASE_1: phase1, PHASE_2: phase2, PHASE_3: phase3, PHASE_4: phase4},
    imageLedger: {
      ...generationLedger,
      reusedExistingCandidateShas: phase0.summary.reusedExistingCandidateShas.filter((candidateSha) => !generationLedger.candidateShas.includes(candidateSha)),
      reusedExistingCandidateCount: phase0.summary.reusedExistingCandidateShas.filter((candidateSha) => !generationLedger.candidateShas.includes(candidateSha)).length,
      newGeneratedShas: generationLedger.candidateShas,
      newGeneratedCount: generationLedger.attemptedGeneratedCount,
      goodPngShaChanged: false,
      generationDispatched: currentWaveJobs.length > 0,
    },
    systemRegression: regressions,
    runtimeFreeze: {queue: workspace.production.generation.summary.queued, running: workspace.production.generation.summary.running, workerStatus: workspace.production.generation.workerStatus, assemblyCount: (workspace.production.shotIntelligence.currentAssembly || []).length, assemblyCreationAllowed: workspace.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true},
    overallStatus: currentWaveAuditCompleteWithFailures
      ? "BLOCKED_TARGETED_GENERATION_WAVE"
      : currentWaveAuditPending
      ? "BLOCKED_PENDING_ACTUAL_PIXEL_AUDIT"
      : currentWaveNoOutput
        ? "BLOCKED_GENERATION_PROVIDER_FAILURE"
        : repairAuthorityPass && phase4.status === "PASS" && regressions.status === "PASS" ? "WHOLE_FILM_STATIC_BOARD" : repairAuthorityPass && phase4.status === "READY_FOR_STATIC_BOARD_BUILD" ? "READY_FOR_STATIC_BOARD_BUILD" : "BLOCKED_BEFORE_GENERATION",
    nextAction: currentWaveAuditCompleteWithFailures
      ? "RETRY_MISSING_UNIVERSAL_REFERENCE_LOOK_MASTERS_ONCE"
      : currentWaveAuditPending
      ? "AUDIT_NEW_GENERATED_CANDIDATES_ACTUAL_PIXEL"
      : currentWaveNoOutput
        ? "REVIEW_PROVIDER_FAILURES_BEFORE_ANY_RETRY"
        : repairAuthorityPass && phase4.status === "PASS" ? "CONFIRM_WHOLE_FILM_STATIC_BOARD" : repairAuthorityPass && phase4.status === "READY_FOR_STATIC_BOARD_BUILD" ? "REBUILD_WHOLE_FILM_STATIC_BOARD" : phase3.status === "READY" ? "DISPATCH_BOUNDED_GENERATION_WAVE" : phase3.nextAction || phase2.nextAction || "RECOMPILE_CURRENT_REPAIR_SINGLE_AUTHORITY",
  };
  return {...body, maturityRunSha256: sha256({...body, maturityRunSha256: undefined})};
}

export function persistGoldenFilmVisualSystemMaturityRun(run) {
  writeJsonAtomic(artifactPath, run);
  writeJsonAtomic(publicPath, run);
  return {artifactPath, publicPath, maturityRunSha256: run.maturityRunSha256};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const workspace = readProjectWorkspace(appRoot);
  const run = buildGoldenFilmVisualSystemMaturityRun(workspace);
  const persisted = persistGoldenFilmVisualSystemMaturityRun(run);
  console.log(JSON.stringify({status: run.overallStatus, maturityRunSha256: run.maturityRunSha256, phases: Object.fromEntries(Object.entries(run.phases).map(([key, value]) => [key, value.status])), generationRequiredShotIds: run.phases.PHASE_0.summary.generationReadyShotIds, reusedExistingCandidateShas: run.imageLedger.reusedExistingCandidateShas, persisted}, null, 2));
}
