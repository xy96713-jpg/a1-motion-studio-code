#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {RETRO_PIXEL_REFERENCE_SHA} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {
  A1_INCREMENTAL_REPAIR_EXECUTOR_CONTRACT,
  A1_INCREMENTAL_REPAIR_MANIFEST_CONTRACT,
  GATE_MIGRATION_CATEGORIES,
  GATE_MIGRATION_RULES,
  GATE_VERSIONS,
  RETRY_POLICY,
  applyGenerationEventToManifest,
  approveStaticBoardForAssembly,
  buildAuditCacheKey,
  buildRepairManifest,
  buildRunMetrics,
  classifyGateMigration,
  compileGenerationDispatch,
  compileGenerationDispatchWithAuthoritativeBuilder,
  finalizeStaticBoardRepairManifest,
  finalizeRepairManifest,
  nextRetryAction,
  preflightRepairPlan,
  publishTempFileWithCas,
  updateRepairManifestSidecar,
  writeRepairManifestSidecarAtomic,
} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";

const passAudit = (artifactSha256, {planSha256 = "plan-ED-01", holdFrameSha256 = "hold-ED-01", styleBriefSha256 = "style-ED-01"} = {}) => ({
  source: "actual-candidate-audit-fixture",
  contract: "A1PackageLookMasterPixelAudit/v1",
  version: 1,
  auditVersion: "A1PackageLookMasterPixelAudit/v1@1",
  status: "PASS",
  artifactSha256,
  auditSha256: `audit-${artifactSha256}`,
  generatedAt: "2026-08-07T00:00:00.000Z",
  planSha256,
  styleBriefSha256,
  holdFrameSha256,
  planBinding: {status: "PASS"},
  sourceBinding: {status: "PASS"},
  semanticEvidenceStatus: "PASS",
  semanticEvidence: {status: "PASS"},
  actualPixelEvidence: {contract: "A1PackageLookMasterPixelAudit/v1", status: "PASS"},
  footageCompatibility: {subjectOcclusion: {face: {status: "PASS"}, eyes: {status: "PASS"}, body: {status: "PASS"}, availableRegionOverflow: {status: "PASS"}}},
});

const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const plan = (shotId, sourceHash, primitive = "primitive-a") => {
  const referenceInputs = [
    {id: "pinterest-retro-pixel-06", publicUrl: "/generated/system-line/reference-packs/pinterest-retro-pixel-v1/pinterest-retro-pixel-06.png", sha256: RETRO_PIXEL_REFERENCE_SHA["pinterest-retro-pixel-06"], sourceSha256: RETRO_PIXEL_REFERENCE_SHA["pinterest-retro-pixel-06"], role: "editorial image/type collision", adoptedTraits: ["giant pixel glyph"]},
    {id: "pinterest-retro-pixel-01", publicUrl: "/generated/system-line/reference-packs/pinterest-retro-pixel-v1/pinterest-retro-pixel-01.png", sha256: RETRO_PIXEL_REFERENCE_SHA["pinterest-retro-pixel-01"], sourceSha256: RETRO_PIXEL_REFERENCE_SHA["pinterest-retro-pixel-01"], role: "hard pixel silhouette", adoptedTraits: ["hard pixel silhouettes"]},
  ];
  const referenceManifestReferences = Object.entries(RETRO_PIXEL_REFERENCE_SHA).map(([id, sha]) => ({id, sha256: sha}));
  const styleBriefSha256 = `style-${shotId}`;
  const styleFingerprint = `fixture-style-${shotId}`;
  const draft = {
    contract: "A1PackageLookMasterPlan/v1",
    version: 1,
    dataChainVersion: 1,
    shotId,
    beatId: `beat-${shotId}`,
    eventId: `event-${shotId}`,
    sourceHash,
    shotSourceHash: sourceHash,
    decisionHash: `decision-${shotId}`,
    styleBriefSha256,
    styleBinding: {
      contract: "A1ActiveEditorialStyleBinding/v1",
      styleSkillId: "a1-retro-pixel-editorial-style",
      styleSkillContractVersion: "a1-retro-pixel-editorial-style@v1",
      styleBriefSha256,
      referencePackId: "pinterest-retro-pixel-v1",
      fingerprint: styleFingerprint,
      primaryFamily: "dithered-editorial-poster",
      referenceIds: referenceInputs.map((item) => item.id),
      referenceSha256: referenceInputs.map((item) => ({id: item.id, sha256: item.sha256})),
      referenceManifestSha256: `reference-manifest-${shotId}`,
      referenceManifestReferences,
    },
    semanticJob: "fixture semantic actor",
    semanticRole: "explain",
    typographyActor: true,
    typographyTreatment: "VERDICT_OVERLAY",
    typographyVisualRole: "PRESENTER_HEADLINE",
    assemblyMode: "OVERLAY",
    assemblyModeReason: "fixture presenter negative space",
    whyThisModeBeatsOtherModes: "fixture preserves hold frame",
    presentationMode: "OVERLAY",
    presentationModeReason: "fixture overlay route",
    whyPresentationModeBeatsOtherModes: "fixture subject remains visible",
    exactCopy: {text: `准确原文-${shotId}`, sourceHash},
    protectedPhrases: [`准确原文-${shotId}`],
    candidateBudget: 2,
    referenceBindingStatus: "PROJECT_MANIFEST_BOUND",
    referenceManifestSha256: `reference-manifest-${shotId}`,
    referenceInputs,
    referenceBindingAudit: {
      contract: "A1ReferenceBindingAudit/v1",
      status: "PASS",
      selectionMode: "STYLE_BRIEF_SEMANTIC_SUBSET",
      selectedSubsetCount: referenceInputs.length,
      manifestSourceCount: referenceManifestReferences.length,
      referenceManifestSha256: `reference-manifest-${shotId}`,
      activeStyleSkillId: "a1-retro-pixel-editorial-style",
      styleBriefSha256,
      fingerprint: styleFingerprint,
      selectedReferenceIds: referenceInputs.map((item) => item.id),
      selectedReferenceSha256: referenceInputs.map((item) => ({id: item.id, sha256: item.sha256})),
      manifestReferences: referenceManifestReferences,
      selectedReferences: referenceInputs.map((item) => ({id: item.id, publicUrl: item.publicUrl, sha256: item.sha256, role: item.role, adoptedTraits: item.adoptedTraits})),
    },
    candidateDirections: [
      {directionId: "direction-01", fingerprint: `direction-01-${shotId}`, composition: "negative-space-headline", surface: "hold-frame-bound", material: "pixel-type", paletteRole: "source-neutral", dominantActor: "headline", motionPotential: "hold"},
      {directionId: "direction-02", fingerprint: `direction-02-${shotId}`, composition: "object-bound-headline", surface: "quiet-field", material: "halftone", paletteRole: "source-accent", dominantActor: "headline", motionPotential: "hold"},
    ],
    generationCriteria: {finishedCompositionAllowed: true, crossLayerCompositionAllowed: true},
    videoContext: {
      contract: "A1VideoPackagingContext/v1",
      sourceHash,
      frameStatus: "HOLD_FRAME_BOUND",
      footageCompatibility: "PASS",
      baseVideoRelationship: "PRESENTER_BASE_WITH_NEGATIVE_SPACE",
      editorOwnsBaseCut: true,
      narrativeFunction: "explain",
      rhythmFunction: "impact",
      presentationMode: "OVERLAY",
      baseSubjectMustRemainVisible: true,
      frameTakeoverAllowed: false,
      baseFrame: {publicUrl: `/hold/${shotId}.jpg`, sha256: `hold-${shotId}`, sourceAssetId: "source-presenter-video", sourceAssetSha256: "source-video-sha"},
      subjectBounds: {x: 0.5, y: 0.2, width: 0.3, height: 0.7},
      safeZones: [{x: 0.02, y: 0.02, width: 0.2, height: 0.2}],
      availableRegions: [{id: "open-left", x: 0.04, y: 0.4, width: 0.3, height: 0.3}],
    },
    visualPrimitiveSwitch: {id: primitive},
  };
  draft.styleBinding.referenceManifestSha256 = draft.referenceManifestSha256;
  draft.planSha256 = sha256(planIdentity(draft));
  return draft;
};

const workspace = {
  contract: "A1EditorialAssetWorkbench/v2",
  workspaceSha256: "w".repeat(64),
  article: {sourceTextSha256: "article".repeat(10) + "abcd", sourceReportSha256: "report".repeat(10) + "abcd"},
  directorInput: {sha256: "director".repeat(8)},
  production: {
    project: {projectId: "fixture"},
    shotVisualCoveragePlan: {shotPlans: [
      {shotId: "ED-01", route: "PACKAGE_LOOK_MASTER"},
      {shotId: "ED-02", route: "PACKAGE_LOOK_MASTER"},
      {shotId: "ED-03", route: "SCREEN_EVIDENCE"},
    ]},
    shotIntelligence: {
      decisionSet: {items: [{shotId: "ED-01", decisionHash: "decision-ED-01"}, {shotId: "ED-02", decisionHash: "decision-ED-02"}]},
      packageLookMasterPlans: [plan("ED-01", "shot-source-1"), plan("ED-02", "shot-source-2", "primitive-b")],
      wholeFilmStaticBoard: {sha256: "board".repeat(16), items: [{shotId: "ED-01", artifactSha256: "candidate-1"}, {shotId: "ED-02", artifactSha256: null}]},
      wholeFilmBatchRecommendation: {assemblyCreationAllowed: false},
    },
    authority: {nextAction: {requiresUser: true}},
    generation: {workerStatus: "frozen", automaticDispatchAllowed: false},
  },
};

const ed01PlanSha = workspace.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-01").planSha256;
const candidates = [{shotId: "ED-01", lookMasterPlanSha256: ed01PlanSha, output: {sha256: "candidate-1", prompt: "EXACT SOURCE COPY: 准确原文-ED-01", promptSha256: "prompt-1"}, attempts: 1}];
const currentPhase = {status: "ACTIVE_REVIEW_GATED", reviewDecision: {requiresExplicitApproval: true}};
const authorityAudit = {status: "PASS", failures: []};
const manifest = buildRepairManifest({workspace, currentPhase, authorityAudit, candidateRecords: candidates, auditRecords: [passAudit("candidate-1", {planSha256: ed01PlanSha})], mode: "dry-run", now: "2026-08-07T00:00:00.000Z"});
const manifestSameInputs = buildRepairManifest({workspace, currentPhase, authorityAudit, candidateRecords: candidates, auditRecords: [passAudit("candidate-1", {planSha256: ed01PlanSha})], mode: "dry-run", now: "2026-08-07T00:00:01.000Z"});

assert.equal(manifest.contract, A1_INCREMENTAL_REPAIR_MANIFEST_CONTRACT);
assert.equal(manifest.manifestSha256, manifestSameInputs.manifestSha256, "manifest identity must be content-addressed, not timestamp-addressed");
assert.equal(manifest.entries.length, 3);
assert.equal(new Set(manifest.entries.map((entry) => entry.shotId)).size, 3);
assert.equal(manifest.summary.cachedPassCount, 1);
assert.equal(manifest.summary.noPackageCount, 1);
assert.equal(manifest.entries.find((entry) => entry.shotId === "ED-01").status, "CACHED_PASS");
assert.equal(manifest.entries.find((entry) => entry.shotId === "ED-01").finalSha, null);
assert.equal(manifest.entries.find((entry) => entry.shotId === "ED-01").gateMigrationCategory, GATE_MIGRATION_CATEGORIES.COMPATIBLE_BINDING);
assert.equal(manifest.entries.find((entry) => entry.shotId === "ED-03").status, "NO_REPAIR_REQUIRED");
assert.equal(manifest.authority.conflicts.length, 0);
const canonicalRouteWorkspace = structuredClone(workspace);
canonicalRouteWorkspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest = {sourceRevisionHash: "canonical-source", generationEligibleShotIds: [], targetRepairShotIds: []};
canonicalRouteWorkspace.production.shotIntelligence.canonicalDirectorAuthority = {
  status: "PASS",
  sourceRevisionHash: "canonical-source",
  authoritySha256: "canonical-authority",
  decisions: [
    {shotId: "ED-01", canonicalPackageDecision: "PACKAGE", canonicalMedium: "presenter-overlay", canonicalTypographyVisualRole: "PRESENTER_HEADLINE", decisionSha256: "canonical-ED-01", generationGate: {blockers: []}},
    {shotId: "ED-02", canonicalPackageDecision: "NO_PACKAGE", canonicalMedium: "presenter-clean", canonicalTypographyVisualRole: "NONE", decisionSha256: "canonical-ED-02", generationGate: {blockers: []}},
    {shotId: "ED-03", canonicalPackageDecision: "PACKAGE", canonicalMedium: "full-package", canonicalTypographyVisualRole: "HERO_TAKEOVER", decisionSha256: "canonical-ED-03", generationGate: {blockers: ["LOOK_MASTER_PLAN_MISSING", "REAL_HOLD_FRAME_VIDEO_CONTEXT_MISSING"]}},
  ],
};
const canonicalRouteManifest = buildRepairManifest({workspace: canonicalRouteWorkspace, currentPhase, authorityAudit, candidateRecords: candidates, auditRecords: [passAudit("candidate-1", {planSha256: ed01PlanSha})], mode: "dry-run", now: "2026-08-07T00:00:00.000Z"});
assert.equal(canonicalRouteManifest.entries.find((entry) => entry.shotId === "ED-02").status, "NO_REPAIR_REQUIRED", "canonical NO_PACKAGE must supersede stale package coverage");
assert.equal(canonicalRouteManifest.entries.find((entry) => entry.shotId === "ED-03").status, "PREFLIGHT_BLOCKED", "canonical PACKAGE without a plan must fail closed before dispatch");
assert.ok(canonicalRouteManifest.entries.find((entry) => entry.shotId === "ED-03").reasonCodes.includes("MISSING_LOOK_MASTER_PLAN"));
assert.deepEqual(canonicalRouteManifest.entries.find((entry) => entry.shotId === "ED-03").preflight.hardFailures.map((item) => item.id), ["LOOK_MASTER_PLAN_MISSING", "REAL_HOLD_FRAME_VIDEO_CONTEXT_MISSING"]);
const boardOnlyManifest = buildRepairManifest({workspace, currentPhase, authorityAudit, candidateRecords: candidates, auditRecords: [{contract: "A1WholeFilmStaticBoardFinalizationReport/v1", status: "PASS", artifactSha256: "candidate-1", auditSha256: "aggregate-only"}], mode: "dry-run", now: "2026-08-07T00:00:00.000Z"});
assert.equal(boardOnlyManifest.entries.find((entry) => entry.shotId === "ED-01").status, "AUDIT_DELTA_REQUIRED", "aggregate board report cannot substitute actual candidate audit");
const staleManifest = structuredClone(manifest);
staleManifest.entries.find((entry) => entry.shotId === "ED-01").upstreamDependencyHash = "changed-upstream";
const dependencyChanged = buildRepairManifest({workspace, currentPhase, authorityAudit, candidateRecords: candidates, auditRecords: [passAudit("candidate-1", {planSha256: ed01PlanSha})], previousManifest: staleManifest, mode: "dry-run", now: "2026-08-07T00:00:01.000Z"});
assert.equal(dependencyChanged.entries.find((entry) => entry.shotId === "ED-01").status, "AUDIT_PASS", "a newly bound actual PASS may finalize after dependency invalidation");
assert.equal(dependencyChanged.entries.find((entry) => entry.shotId === "ED-01").auditStatus, "PASS_CACHED");
const dependencyChangedWithoutAudit = buildRepairManifest({workspace, currentPhase, authorityAudit, candidateRecords: candidates, auditRecords: [], previousManifest: staleManifest, mode: "dry-run", now: "2026-08-07T00:00:01.000Z"});
assert.equal(dependencyChangedWithoutAudit.entries.find((entry) => entry.shotId === "ED-01").status, "REPAIR_REQUIRED_DEPENDENCY_CHANGE");
assert.equal(dependencyChangedWithoutAudit.entries.find((entry) => entry.shotId === "ED-01").auditStatus, "NOT_RUN");
assert.equal(dependencyChanged.entries.find((entry) => entry.shotId === "ED-02").status, "READY_FOR_GENERATION", "an unrelated valid shot remains independently dispatchable");
const gateCompatiblePrevious = structuredClone(manifest);
gateCompatiblePrevious.entries.find((entry) => entry.shotId === "ED-01").gateVersion = "A1IncrementalRepairGates/legacy";
const gateCompatible = buildRepairManifest({workspace, currentPhase, authorityAudit, candidateRecords: candidates, auditRecords: [passAudit("candidate-1", {planSha256: ed01PlanSha})], previousManifest: gateCompatiblePrevious, mode: "dry-run", now: "2026-08-07T00:00:01.000Z"});
assert.equal(gateCompatible.entries.find((entry) => entry.shotId === "ED-01").status, "CACHED_PASS", "compatible gate migration must retain the existing PASS SHA");

const dispatch = compileGenerationDispatch(manifest, {dryRun: true, automaticDispatchAllowed: false, workerStatus: "frozen"});
assert.equal(dispatch.jobs.length, 0);
assert.equal(dispatch.hardConcurrency, 2);
assert.equal(dispatch.isolationConcurrency, 6);
assert.equal(dispatch.polling, RETRY_POLICY.polling);
assert.equal(nextRetryAction({samePrimitiveStructuralRetries: 0}).action, "RETRY_SAME_PRIMITIVE_ONCE");
assert.equal(nextRetryAction({samePrimitiveStructuralRetries: 1}).action, "SWITCH_PRIMITIVE");
assert.equal(nextRetryAction({samePrimitiveStructuralRetries: 1, lastAuditStatus: "PASS"}).action, "NONE");

const preflightBlocked = preflightRepairPlan({plan: {...plan("ED-99", "source-99"), videoContext: {...plan("ED-99", "source-99").videoContext, availableRegions: [{x: 0.01, y: 0.01, width: 0.01, height: 0.01}]}}, prompt: "EXACT SOURCE COPY: 准确原文-ED-99", articleSourceSha256: workspace.article.sourceTextSha256, primitiveId: "primitive"});
assert.equal(preflightBlocked.status, "BLOCKED");
assert.ok(preflightBlocked.hardFailures.some((failure) => failure.id === "availableRegionCapacity"));
const fullscreenWithoutPresenterGeometry = preflightRepairPlan({
  plan: {
    ...plan("ED-100", "source-100"),
    videoContext: {
      ...plan("ED-100", "source-100").videoContext,
      presentationMode: "FULLSCREEN",
      baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER",
      baseSubjectMustRemainVisible: false,
      frameTakeoverAllowed: true,
      subjectBounds: null,
      faceBounds: null,
      eyesBounds: null,
      safeZones: [],
      availableRegions: [],
    },
  },
  prompt: "EXACT SOURCE COPY: 准确原文-ED-100",
  articleSourceSha256: workspace.article.sourceTextSha256,
  primitiveId: "primitive",
});
assert.equal(fullscreenWithoutPresenterGeometry.status, "PASS", "fullscreen takeover must not require presenter open-region geometry");
assert.equal(fullscreenWithoutPresenterGeometry.checks.availableRegionCapacity.status, "PASS");
assert.equal(fullscreenWithoutPresenterGeometry.checks.safeZone.status, "PASS");

assert.equal(classifyGateMigration({audit: passAudit("candidate-1"), candidateSha: "candidate-1", shotId: "ED-08"}).category, GATE_MIGRATION_CATEGORIES.COMPATIBLE_BINDING);
assert.equal(classifyGateMigration({audit: {...passAudit("candidate-1"), gateCompatibility: GATE_MIGRATION_CATEGORIES.NEW_ARTIFACT_ONLY}, candidateSha: "candidate-1", shotId: "ED-13"}).category, GATE_MIGRATION_CATEGORIES.NEW_ARTIFACT_ONLY);
assert.equal(classifyGateMigration({audit: {...passAudit("candidate-1"), footageCompatibility: {}, actualPixelEvidence: null, semanticEvidenceStatus: null}, candidateSha: "candidate-1", shotId: "ED-08"}).category, GATE_MIGRATION_CATEGORIES.MUST_REVIEW);
assert.equal(GATE_VERSIONS.subjectFaceEyesGeometry, "A1SubjectFaceEyesGeometryGate/v2");
assert.ok(GATE_MIGRATION_RULES[GATE_MIGRATION_CATEGORIES.MUST_REVIEW].includes("必须"));
const cacheKey = buildAuditCacheKey({artifactSha256: "candidate-1", auditContract: "A1PackageLookMasterPixelAudit/v1", auditVersion: "A1PackageLookMasterPixelAudit/v1@1", gateVersion: GATE_VERSIONS.bundle, planSha256: "plan-ED-01", sourceRevisionHash: "source-revision"});
assert.ok(cacheKey.includes("artifact:candidate-1"));
assert.notEqual(cacheKey, buildAuditCacheKey({artifactSha256: "candidate-1", auditContract: "A1PackageLookMasterPixelAudit/v1", auditVersion: "A1PackageLookMasterPixelAudit/v2@2", gateVersion: GATE_VERSIONS.bundle, planSha256: "plan-ED-01", sourceRevisionHash: "source-revision"}));
assert.notEqual(cacheKey, buildAuditCacheKey({artifactSha256: "candidate-1", auditContract: "A1PackageLookMasterPixelAudit/v1", auditVersion: "A1PackageLookMasterPixelAudit/v1@1", gateVersion: GATE_VERSIONS.bundle, planSha256: "plan-changed", sourceRevisionHash: "source-revision"}));
assert.notEqual(cacheKey, buildAuditCacheKey({artifactSha256: "candidate-1", auditContract: "A1PackageLookMasterPixelAudit/v1", auditVersion: "A1PackageLookMasterPixelAudit/v1@1", gateVersion: GATE_VERSIONS.bundle, planSha256: "plan-ED-01", sourceRevisionHash: "source-changed"}));

const eventManifest = structuredClone(manifest);
const eventEntry = eventManifest.entries.find((entry) => entry.shotId === "ED-02");
eventEntry.status = "READY_FOR_GENERATION";
eventEntry.preflightStatus = "PASS";
eventEntry.primitiveCandidates = [eventEntry.primitiveId, "primitive-c"];
let eventState = applyGenerationEventToManifest(eventManifest, {shotId: "ED-02", event: "FAILED", now: "2026-08-07T00:00:02.000Z"});
assert.equal(eventState.entries.find((entry) => entry.shotId === "ED-02").status, "RETRY_SAME_PRIMITIVE_PENDING");
assert.equal(eventState.entries.find((entry) => entry.shotId === "ED-02").retryHistory.length, 1);
eventState = applyGenerationEventToManifest(eventState, {shotId: "ED-02", event: "FAILED", now: "2026-08-07T00:00:03.000Z"});
assert.equal(eventState.entries.find((entry) => entry.shotId === "ED-02").status, "SWITCH_PRIMITIVE_PENDING");
assert.equal(eventState.entries.find((entry) => entry.shotId === "ED-02").primitiveId, "primitive-c");
const activeDispatchManifest = structuredClone(manifest);
for (const entry of activeDispatchManifest.entries.filter((entry) => entry.reasonCodes.includes("PACKAGE_ROUTE"))) {
  entry.status = "READY_FOR_GENERATION";
  entry.preflightStatus = "PASS";
  entry.promptHash = entry.promptHash || `prompt-${entry.shotId}`;
  entry.primitiveId = entry.primitiveId || `primitive-${entry.shotId}`;
}
const firstBatch = compileGenerationDispatch(activeDispatchManifest, {automaticDispatchAllowed: true, workerStatus: "starting", maxConcurrency: 2});
assert.equal(firstBatch.jobs.length, 2);
assert.equal(firstBatch.continuation.mode, "EVENT_DRIVEN");
assert.ok(firstBatch.jobs.every((job) => job.jobKey));
const continuationManifest = {...firstBatch.manifest, entries: [...firstBatch.manifest.entries, {...firstBatch.manifest.entries.find((entry) => entry.shotId === "ED-01"), shotId: "ED-04", status: "READY_FOR_GENERATION", generationState: "READY", jobKey: null, promptHash: "prompt-ED-04", primitiveId: "primitive-ED-04"}]};
const secondBatch = compileGenerationDispatch(continuationManifest, {automaticDispatchAllowed: true, workerStatus: "starting", maxConcurrency: 2});
assert.equal(secondBatch.jobs.length, 1, "the next batch is compiled from the completion event, not polled continuously");
const blockedDispatch = compileGenerationDispatch({...activeDispatchManifest, entries: activeDispatchManifest.entries.map((entry) => entry.shotId === "ED-02" ? {...entry, preflightStatus: "BLOCKED", status: "PREFLIGHT_BLOCKED"} : entry)}, {automaticDispatchAllowed: true, workerStatus: "starting"});
assert.equal(blockedDispatch.jobs.some((job) => job.shotId === "ED-02"), false);
const onlyPreflightBlocked = {...activeDispatchManifest, entries: activeDispatchManifest.entries.filter((entry) => entry.shotId === "ED-02").map((entry) => ({...entry, preflightStatus: "BLOCKED", status: "PREFLIGHT_BLOCKED"}))};
assert.equal(compileGenerationDispatch(onlyPreflightBlocked, {automaticDispatchAllowed: true, workerStatus: "starting"}).jobs.length, 0);

const finalized = finalizeStaticBoardRepairManifest({...manifest, entries: manifest.entries.map((entry) => entry.reasonCodes.includes("PACKAGE_ROUTE") ? {...entry, status: "CACHED_PASS", exceptions: []} : entry)});
assert.equal(finalized.status, "STATIC_BOARD_FINALIZED");
assert.equal(finalized.boardRebuildCount, 1);
assert.equal(approveStaticBoardForAssembly(finalized.manifest, {userApproval: false}).assemblyCreationAllowed, false);
assert.equal(approveStaticBoardForAssembly(finalized.manifest, {userApproval: true}).assemblyCreationAllowed, true);
const finalizeAgain = finalizeStaticBoardRepairManifest(finalized.manifest);
assert.equal(finalizeAgain.executed, false, "the same finalization revision must be FINALIZE_ONCE_ONLY");
assert.ok(finalizeAgain.blockers.includes("finalize-already-ran"));
const dependencyRevisionWorkspace = structuredClone(workspace);
dependencyRevisionWorkspace.directorInput.sha256 = "changed-director-input";
dependencyRevisionWorkspace.production.shotIntelligence.wholeFilmStaticBoard.sha256 = "changed-board-seed";
const dependencyRevision = buildRepairManifest({workspace: dependencyRevisionWorkspace, currentPhase, authorityAudit, candidateRecords: candidates, auditRecords: [passAudit("candidate-1")], previousManifest: finalized.manifest, mode: "dry-run", now: "2026-08-07T00:00:04.000Z"});
assert.notEqual(dependencyRevision.revisionKey, finalized.manifest.revisionKey, "dependency or board seed changes open a new finalization revision");
assert.equal(dependencyRevision.finalization.status, "NOT_RUN");

const staleBoardWithCurrentRawCandidate = structuredClone(workspace);
staleBoardWithCurrentRawCandidate.production.shotIntelligence.lookMasterRawReferences = [{
  shotId: "ED-01",
  isRawReference: true,
  current: true,
  recommendationEligible: true,
  planSha256: ed01PlanSha,
  artifact: {sha256: "current-raw-candidate", publicUrl: "/generated/system-line/current-raw-candidate.png", generatedAt: "2026-08-07T00:00:06.000Z"},
}];
const currentRawCandidateManifest = buildRepairManifest({
  workspace: staleBoardWithCurrentRawCandidate,
  currentPhase,
  authorityAudit,
  candidateRecords: staleBoardWithCurrentRawCandidate.production.shotIntelligence.lookMasterRawReferences,
  auditRecords: [passAudit("current-raw-candidate", {planSha256: ed01PlanSha})],
  previousManifest: manifest,
  mode: "static-board-finalize",
});
assert.equal(currentRawCandidateManifest.entries.find((entry) => entry.shotId === "ED-01").candidateSha, "current-raw-candidate", "current audited raw candidate must supersede stale board seed during FINALIZE");

const sidecarDir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-incremental-repair-sidecar-"));
const sidecarPath = path.join(sidecarDir, "repair-manifest.json");
const concurrentManifest = structuredClone(activeDispatchManifest);
for (const entry of concurrentManifest.entries) {
  if (!entry.reasonCodes.includes("PACKAGE_ROUTE")) continue;
  entry.status = "READY_FOR_GENERATION";
  entry.preflightStatus = "PASS";
  entry.exceptions = [];
}
writeRepairManifestSidecarAtomic({manifestPath: sidecarPath, manifest: concurrentManifest, expectedManifestSha256: null});
await Promise.all([
  updateRepairManifestSidecar({manifestPath: sidecarPath, update: (value) => applyGenerationEventToManifest(value, {shotId: "ED-01", event: "FAILED", now: "2026-08-07T00:00:05.000Z"})}),
  updateRepairManifestSidecar({manifestPath: sidecarPath, update: (value) => applyGenerationEventToManifest(value, {shotId: "ED-02", event: "COMPLETED", now: "2026-08-07T00:00:06.000Z"})}),
]);
const concurrentResult = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
assert.equal(concurrentResult.entries.find((entry) => entry.shotId === "ED-01").retryHistory.length, 1, "concurrent FAILED event must survive the sidecar CAS write");
assert.equal(concurrentResult.entries.find((entry) => entry.shotId === "ED-02").generationState, "COMPLETED", "concurrent COMPLETED event must survive the sidecar CAS write");
await assert.rejects(() => updateRepairManifestSidecar({manifestPath: sidecarPath, expectedManifestSha256: "stale-manifest-sha", update: (value) => value}), /repair-manifest-sidecar-cas-mismatch/);
fs.rmSync(sidecarDir, {recursive: true, force: true});

const boardCasDir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-incremental-repair-board-"));
const boardTarget = path.join(boardCasDir, "board.png");
const boardTemp = path.join(boardCasDir, "board.tmp");
fs.writeFileSync(boardTarget, "old-board");
fs.writeFileSync(boardTemp, "new-board");
const boardBeforeSha = (await import("node:crypto")).createHash("sha256").update(fs.readFileSync(boardTarget)).digest("hex");
assert.throws(() => publishTempFileWithCas({tempPath: boardTemp, targetPath: boardTarget, expectedWorkspaceSha256: "workspace-a", currentWorkspaceSha256: "workspace-b"}), /repair-board-workspace-cas-failed/);
assert.equal((await import("node:crypto")).createHash("sha256").update(fs.readFileSync(boardTarget)).digest("hex"), boardBeforeSha, "CAS failure must leave formal board bytes unchanged");
fs.rmSync(boardCasDir, {recursive: true, force: true});

const authoritativeWorkspace = structuredClone(workspace);
authoritativeWorkspace.production.generation = {...authoritativeWorkspace.production.generation, jobs: []};
let authoritativeBuilderCalls = 0;
const authoritativeBuilder = (current, dispatchJob) => {
  authoritativeBuilderCalls += 1;
  const existing = current.production.generation.jobs.find((job) => job.shotId === dispatchJob.shotId);
  if (existing) return {workspace: current, jobs: [existing]};
  const job = {id: `authoritative-${dispatchJob.shotId}`, targetKind: "package-look-master", shotId: dispatchJob.shotId, lookMasterPlanSha256: dispatchJob.entry.planSha256, promptSha256: dispatchJob.promptHash, status: "queued"};
  const next = structuredClone(current);
  next.production.generation.jobs.push(job);
  return {workspace: next, jobs: [job]};
};
const createdWave = compileGenerationDispatchWithAuthoritativeBuilder(activeDispatchManifest, {workspace: authoritativeWorkspace, automaticDispatchAllowed: true, workerStatus: "starting", maxConcurrency: 2, queueBuilder: authoritativeBuilder});
assert.equal(createdWave.createdJobs.length, 2, "missing repair jobs must be created through the authoritative builder");
assert.equal(createdWave.dispatch.jobs.length, 2);
assert.ok(createdWave.workspace.production.generation.jobs.every((job) => job.incrementalRepairBinding?.dependencyHash));
const repeatedManifest = {...createdWave.dispatch.manifest, entries: createdWave.dispatch.manifest.entries.map((entry) => entry.reasonCodes.includes("PACKAGE_ROUTE") ? {...entry, status: "READY_FOR_GENERATION", preflightStatus: "PASS"} : entry)};
const repeatedWave = compileGenerationDispatchWithAuthoritativeBuilder(repeatedManifest, {workspace: createdWave.workspace, automaticDispatchAllowed: true, workerStatus: "starting", maxConcurrency: 2, queueBuilder: authoritativeBuilder});
assert.equal(repeatedWave.createdJobs.length, 0, "repeated compile must remain idempotent");
assert.equal(repeatedWave.dispatch.jobs.length, 2, "repeated compile must bind the same two persisted jobs");
assert.equal(repeatedWave.workspace.production.generation.jobs.length, 2);
assert.equal(authoritativeBuilderCalls, 2);
const blockedAuthoritative = compileGenerationDispatchWithAuthoritativeBuilder({...activeDispatchManifest, entries: activeDispatchManifest.entries.map((entry) => entry.reasonCodes.includes("PACKAGE_ROUTE") ? {...entry, status: "PREFLIGHT_BLOCKED", preflightStatus: "BLOCKED"} : entry)}, {workspace: authoritativeWorkspace, automaticDispatchAllowed: true, workerStatus: "starting", maxConcurrency: 2, queueBuilder: authoritativeBuilder});
assert.equal(blockedAuthoritative.createdJobs.length, 0, "preflight blocked repair must create zero jobs");

const dryFinalize = finalizeRepairManifest(manifest, {dryRun: true, userApproval: true});
assert.equal(dryFinalize.executed, false);
assert.ok(dryFinalize.blockers.includes("dry-run-finalize-not-executed"));
assert.equal(dryFinalize.blockers.includes("whole-film-static-board-user-approval-required"), false, "static-board finalize must not depend on Assembly approval");
const metrics = buildRunMetrics({manifest, scanTimeMs: 4, generationCalls: 0, deltaAuditCount: 0, boardRebuildCount: 0, totalWallTimeMs: 7});
assert.equal(metrics.cacheHitRate, 0.5);
assert.equal(metrics.firstPassRate, null);
assert.equal(metrics.generationCalls, 0);
assert.equal(metrics.boardRebuildCount, 0);

console.log(JSON.stringify({status: "PASS", contract: A1_INCREMENTAL_REPAIR_EXECUTOR_CONTRACT, fixtureShotCount: manifest.entries.length, cachedPassCount: manifest.summary.cachedPassCount, preflightBlockTested: true, gateMigrationCategories: Object.values(GATE_MIGRATION_CATEGORIES), generationHardMax: RETRY_POLICY.generationConcurrencyHardMax}, null, 2));
