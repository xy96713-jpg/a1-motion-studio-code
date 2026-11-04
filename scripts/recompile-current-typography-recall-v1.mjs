#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildPackagingBeatPlan} from "../apps/studio-next/src/lib/a1-editorial-packaging-boundary-v1.mjs";
import {buildPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {buildVideoPackagingContext, buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {compileShotSemanticDesignBriefSet} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";
import {alignShotIntelligenceDecisionSetWithCoveragePlan, buildShotIntelligenceDecisionSet} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {compileWholeFilmVisualArchitecture} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";
import {finalizeWholeFilmLookMasterBatch} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {buildCandidateRecommendationAuditAuthority, hashCandidateAuditMigration} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {compileSemanticTimelineDecision} from "../apps/studio-next/src/lib/a1-semantic-timeline-decision-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const directorInputPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json");
const sourcePlateManifestPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/source-cache/semantic-source-plates-v1/manifest.json");
const now = new Date().toISOString();
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";

const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const validSha = (value) => /^[a-f0-9]{64}$/iu.test(String(value || ""));
const publicFile = (publicUrl) => publicUrl?.startsWith("/") ? path.join(publicRoot, publicUrl.replace(/^\/+/, "")) : null;
const clean = (value) => String(value || "").replace(/\s+/gu, " ").trim();

function sourceBindingsForCurrentDirector(current, directorRun) {
  const byShotHash = {};
  const add = (shot, binding) => {
    if (!shot?.sourceText || !binding?.publicUrl || !binding?.sha256) return;
    const key = sha256(shot.sourceText);
    byShotHash[key] ||= [];
    if (!byShotHash[key].some((item) => item.publicUrl === binding.publicUrl)) byShotHash[key].push(binding);
  };
  const sourcePlate = fs.existsSync(sourcePlateManifestPath) ? JSON.parse(fs.readFileSync(sourcePlateManifestPath, "utf8")) : null;
  const packetByShot = new Map((current.production.shotIntelligence.researchPackets || []).map((packet) => [packet.shotId, packet]));
  for (const shot of directorRun.plan.shots || []) {
    const packet = packetByShot.get(shot.shotId);
    for (const source of packet?.sources || []) {
      const artifact = source.referenceArtifact;
      if (artifact?.publicUrl && artifact?.sha256) add(shot, {
        ...artifact,
        role: "REAL_SOURCE",
        sourceKind: source.sourceKind || artifact.artifactKind || "OFFICIAL_RESEARCH_TITLE_ABSTRACT_CAPTURE",
        productionReady: true,
      });
    }
    if (sourcePlate?.contract === "A1NamedEntitySourcePlate/v1" && shot.shotId === "ED-12") {
      add(shot, {
        publicUrl: sourcePlate.publicUrl,
        sha256: sourcePlate.sha256,
        sourceKind: "OFFICIAL_NAMED_ENTITY_SOURCE_PLATE",
        role: "REAL_EVIDENCE_INPUT",
        usageClass: sourcePlate.usageClass,
        exactPixelRebindRequired: true,
        identities: sourcePlate.sources.map((item) => item.label),
      });
    }
  }
  return byShotHash;
}

function currentPresenterFrame(workspace, shotId) {
  const asset = (workspace.library.assets || []).find((item) => item.id === "source-presenter-continuous-video");
  return asset?.presenterEvidence?.shotFrames?.find((frame) => frame.shotId === shotId) || null;
}

function presenterHoldFrame(workspace, frame) {
  if (!frame?.publicUrl || !frame?.sha256) return null;
  const file = publicFile(frame.publicUrl);
  if (!file || !fs.existsSync(file) || fileSha256(file) !== frame.sha256) throw new Error(`presenter-hold-frame-sha-invalid:${frame.shotId || frame.publicUrl}`);
  return {
    publicUrl: frame.publicUrl,
    sha256: frame.sha256,
    width: 1920,
    height: 1080,
    sourceAssetId: "source-presenter-continuous-video",
    sourceAssetSha256: workspace.library.assets.find((item) => item.id === "source-presenter-continuous-video")?.sha256 || null,
    extractionTimeMs: frame.atMs,
    provenance: "deterministic-hold-frame-from-registered-editor-owned-video",
  };
}

function declaredPresenterBounds() {
  return {
    x: 0.38,
    y: 0.28,
    width: 0.40,
    height: 0.72,
    semanticRole: "presenter-face-and-central-body-silhouette",
    status: "DECLARED_FROM_ACTUAL_HOLD_FRAME_REVIEW",
  };
}

function presenterSafeZones() {
  return [{id: "top-left-editorial-copy", x: 0.04, y: 0.04, width: 0.28, height: 0.24, semanticRole: "typography-safe-negative-space"}];
}

function buildSourceProofMap(current, directorRun) {
  const map = sourceBindingsForCurrentDirector(current, directorRun);
  const existingBriefs = current.production.shotIntelligence.semanticDesignBriefSet?.briefs || [];
  for (const shot of directorRun.plan.shots || []) {
    const existing = existingBriefs.find((brief) => brief.shotId === shot.shotId && brief.exactCopy === shot.sourceText);
    for (const binding of existing?.productionSourceBindings || []) {
      if (binding.kind === "BASE_VIDEO_HOLD_FRAME" || binding.sourceKind === "PRESENTER") continue;
      if (binding.publicUrl && binding.sha256) {
        const file = publicFile(binding.publicUrl);
        if (file && fs.existsSync(file) && fileSha256(file) === binding.sha256) {
          map[sha256(shot.sourceText)] ||= [];
          if (!map[sha256(shot.sourceText)].some((item) => item.publicUrl === binding.publicUrl)) map[sha256(shot.sourceText)].push(binding);
        }
      }
    }
  }
  return map;
}

function briefSourceTextHash(brief) {
  return brief?.shotSourceHash || sha256(brief?.exactCopy || "");
}

function makeSyntheticEvent(shot, decision) {
  const mode = decision.assemblyMode || decision.presentationMode || "FULLSCREEN";
  return {
    contract: "A1PackagingEvent/v1",
    eventId: `semantic-package-event-${shot.shotId}`,
    order: shot.order,
    sourceBeatIds: [shot.shotId],
    sourceCueIds: shot.cueIds || [],
    sourceRange: {shotIds: [shot.shotId], cueIds: shot.cueIds || []},
    sourceText: shot.sourceText,
    semanticRole: decision.semanticRole,
    packagingType: `${mode}_PACKAGE`,
    valueAdded: decision.valueAdded,
    baseVisualCarrier: decision.baseVisualCarrier,
    enhancementPackaging: decision.enhancementPackaging,
    strongLanguageEvent: decision.strongLanguageEvent,
    typographyTreatment: decision.typographyTreatment,
    typographyActor: decision.typographyActor,
    protectedPhrases: decision.protectedPhrases,
    whyPackage: decision.packageReason,
    whyPackagingIsBetterThanNoPackage: decision.whyPackagingBeatsNoPackage,
    generationAllowed: true,
    pinterestReferenceBound: true,
    editorOwnsBaseFootage: true,
    sourceBeatCount: 1,
  };
}

function recompileBriefs({workspace, directorRun, sourceBindingsByShotHash, now: timestamp}) {
  return compileShotSemanticDesignBriefSet({
    workspace,
    directorRun,
    bindingDirectorRun: directorRun,
    appRoot,
    sourceBindingsByShotHash,
    now: timestamp,
  });
}

function buildContexts(workspace, coveragePlan, decisionSet, timestamp) {
  const oldContexts = workspace.production.shotIntelligence.videoPackagingContexts?.items || [];
  const oldByShot = new Map(oldContexts.map((item) => [item.shotId, item]));
  const directorShots = new Map((JSON.parse(fs.readFileSync(directorInputPath, "utf8")).plan.shots || []).map((shot) => [shot.shotId, shot]));
  const packageShots = coveragePlan.shotPlans.filter((shot) => shot.route === "PACKAGE_LOOK_MASTER");
  const contexts = packageShots.map((shot) => {
    const decision = decisionSet.items.find((item) => item.shotId === shot.shotId);
    if (!decision) throw new Error(`typography-recompile-decision-missing:${shot.shotId}`);
    const old = oldByShot.get(shot.shotId);
    const presenter = currentPresenterFrame(workspace, shot.shotId);
    const needsPresenterHold = decision.baseVisualCarrier === "PRESENTER_BASE" && decision.presentationMode === "OVERLAY";
    const holdFrame = needsPresenterHold ? presenterHoldFrame(workspace, presenter) : old?.baseFrame || presenterHoldFrame(workspace, presenter);
    if (!holdFrame) throw new Error(`typography-recompile-hold-frame-missing:${shot.shotId}`);
    const subjectBounds = needsPresenterHold ? declaredPresenterBounds() : old?.subjectBounds || null;
    const safeZones = needsPresenterHold ? presenterSafeZones() : old?.safeZones || [];
    const context = buildVideoPackagingContext({
      decision,
      demand: {editWindow: directorShots.get(shot.shotId)?.editWindow || old?.timelineRange || {startMs: null, endMs: null, durationMs: null}},
      holdFrame,
      subjectBounds,
      safeZones,
      visualAnchors: old?.visualAnchors || {averageLuminance: 0, contrast: 0, entropy: 0, sharpness: 0, busyness: "unknown", dominantPalette: []},
      createdAt: old?.createdAt || timestamp,
    });
    return context;
  });
  return buildVideoPackagingContextSet(contexts, {createdAt: timestamp});
}

function directionForRaw(plan, raw) {
  return plan.candidateDirections.find((direction) => direction.directionId === raw.candidateDirectionId) || null;
}

function preserveSelectedDirection(plan, previousPlan, raw) {
  const previousDirection = previousPlan?.candidateDirections?.find((direction) => direction.directionId === raw.candidateDirectionId);
  if (!previousDirection) return false;
  const existing = directionForRaw(plan, raw);
  if (existing?.fingerprint === previousDirection.fingerprint) return true;
  const index = plan.candidateDirections.findIndex((direction) => direction.directionId === raw.candidateDirectionId);
  if (index < 0) return false;
  const duplicate = plan.candidateDirections.find((direction) => direction.directionId !== raw.candidateDirectionId && direction.fingerprint === previousDirection.fingerprint);
  if (duplicate) return false;
  plan.candidateDirections[index] = structuredClone(previousDirection);
  return true;
}

function compatibilityForRebind(raw, plan, decision) {
  const artifactFile = publicFile(raw.artifact?.publicUrl);
  const sourceEvidenceSha = new Set((plan.sourceEvidenceInputs || []).map((item) => item.sha256));
  const rawEvidenceSha = new Set((raw.sourceEvidenceInputs || []).map((item) => item.sha256));
  const researchPass = plan.networkDecision !== "REQUIRED"
    || (raw.researchReferenceUseProof?.status === "PASS"
      && raw.researchReferenceUseProof?.sentToImageGen === true
      && [...sourceEvidenceSha].every((value) => rawEvidenceSha.has(value)));
  const checks = {
    artifactFileExists: Boolean(artifactFile && fs.existsSync(artifactFile)),
    artifactSha256Verified: Boolean(artifactFile && fs.existsSync(artifactFile) && fileSha256(artifactFile) === raw.artifact.sha256),
    artifactShaUnchanged: validSha(raw.artifact?.sha256),
    semanticPixelAuditPass: raw.semanticPixelAudit?.status === "PASS",
    pixelAuditPass: raw.pixelAudit?.status === "PASS",
    footageCompatibilityPass: raw.pixelAudit?.footageCompatibility?.status === "PASS",
    semanticArtifactBound: raw.semanticPixelAudit?.artifact?.sha256 === raw.artifact?.sha256,
    candidateDirectionBound: Boolean(directionForRaw(plan, raw)),
    exactCopyCompatible: raw.semanticPixelAudit?.ocrExactCopyAligned !== false,
    researchSourceCompatible: researchPass,
    decisionModePresent: decision?.assemblyMode === plan.assemblyMode && decision?.presentationMode === plan.presentationMode,
  };
  return {status: Object.values(checks).every(Boolean) ? "PASS" : "BLOCKED", checks, artifactSha256: raw.artifact?.sha256 || null, semanticPixelAuditSha256: raw.semanticPixelAuditSha256 || null};
}

function migratePassReferences(next, plansByShot, previousPlansByShot, decisionByShot, timestamp, sourceReferences = null) {
  const records = [];
  const rawReferences = sourceReferences || next.production.shotIntelligence.lookMasterRawReferences || [];
  for (const [shotId, plan] of plansByShot.entries()) {
    const raw = rawReferences
      .filter((item) => item.shotId === shotId && item.semanticPixelAudit?.status === "PASS" && item.artifact?.sha256)
      .sort((left, right) => String(right.createdAt || right.reviewedAt || "").localeCompare(String(left.createdAt || left.reviewedAt || "")))[0];
    if (!raw) continue;
    const previousPlan = previousPlansByShot.get(shotId);
    const oldPlanSha256 = raw.planSha256;
    if (!preserveSelectedDirection(plan, previousPlan, raw)) continue;
    plan.planSha256 = sha256(planIdentity(plan));
    const compatibility = compatibilityForRebind(raw, plan, decisionByShot.get(shotId));
    if (compatibility.status !== "PASS") continue;
    const migration = {
      contract: "A1CandidateAuditMigration/v1",
      version: 1,
      status: "PASS",
      bindingMode: "EXISTING_SEMANTIC_PASS_REBOUND_NO_NEW_REVIEW",
      shotId,
      artifactSha256: raw.artifact.sha256,
      sourcePlanSha256: raw.pixelAudit.planSha256,
      sourcePixelAuditSha256: raw.pixelAudit.auditSha256,
      sourceSemanticAuditSha256: raw.semanticPixelAudit.auditSha256,
      sourceBriefSha256: raw.semanticPixelAudit.briefSha256,
      targetPlanSha256: plan.planSha256,
      targetBriefSha256: plan.semanticDesignBriefSha256,
      targetDecisionHash: plan.decisionHash,
      targetAssemblyMode: plan.assemblyMode,
      targetPresentationMode: plan.presentationMode,
      compatibility,
      createdAt: timestamp,
    };
    migration.migrationSha256 = hashCandidateAuditMigration(migration);
    raw.candidateAuditMigration = migration;
    raw.rebindMode = "EXISTING_SEMANTIC_PASS_REBOUND_NO_NEW_REVIEW";
    raw.rebindSourcePlanSha256 = oldPlanSha256;
    raw.rebindSourceAuditSha256 = raw.semanticPixelAuditSha256;
    raw.rebindCompatibility = compatibility;
    raw.planSha256 = plan.planSha256;
    raw.styleBriefSha256 = plan.styleBriefSha256;
    raw.current = true;
    raw.status = "CURRENT_SEMANTIC_PASS_REBOUND";
    for (const job of next.production.generation.jobs || []) {
      if (job.targetKind === "package-look-master" && job.status === "complete" && job.output?.sha256 === raw.artifact.sha256) {
        job.lookMasterPlanSha256 = plan.planSha256;
        job.reconciliation = {contract: "A1CandidateAuditMigration/v1", status: "PASS", previousLookMasterPlanSha256: oldPlanSha256, currentLookMasterPlanSha256: plan.planSha256, artifactSha256: raw.artifact.sha256};
      }
    }
    records.push({shotId, artifactSha256: raw.artifact.sha256, previousPlanSha256: oldPlanSha256, currentPlanSha256: plan.planSha256, compatibility});
  }
  return records;
}

function syncSemanticTimelineRevision(decisionSet, beats, sourceHash, timestamp) {
  const timeline = compileSemanticTimelineDecision({beats, decisions: decisionSet.items, sourceHash});
  const withoutHash = {
    ...decisionSet,
    generatedAt: timestamp,
    sourceRevisionHash: timeline.rewriteRevisionHash,
    semanticTimelineHash: timeline.sha256,
    semanticTimeline: timeline,
    sha256: undefined,
  };
  return {...withoutHash, sha256: sha256(withoutHash)};
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued || current.production.generation.summary.running) throw new Error("typography-recompile-requires-idle-generation");
  const directorRun = JSON.parse(fs.readFileSync(directorInputPath, "utf8"));
  if (directorRun.status !== "completed" || directorRun.plan?.source?.articleSha256 !== current.article.sourceTextSha256) throw new Error("typography-recompile-director-input-not-current");
  const sourceBindingsByShotHash = buildSourceProofMap(current, directorRun);
  const referenceManifest = JSON.parse(fs.readFileSync(referenceManifestPath, "utf8"));
  const oldRuntime = current.production.shotIntelligence;
  const previousPlansByShot = new Map((oldRuntime.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
  const rawHistory = structuredClone(oldRuntime.lookMasterRawReferences || []);
  const rawPlanCandidates = new Map();
  for (const raw of rawHistory) if (raw.current === true && raw.semanticPixelAudit?.status === "PASS") rawPlanCandidates.set(raw.shotId, raw);

  const freshPackagingBeatPlan = buildPackagingBeatPlan({
    projectId: current.production.project.projectId,
    sourceHash: current.article.sourceTextSha256,
    semanticBeats: current.production.packagingBeatPlan.semanticBeats,
    selectionPolicy: current.production.packagingBeatPlan.selector,
    now,
  });
  let freshDecisionSet = buildShotIntelligenceDecisionSet({beats: freshPackagingBeatPlan.semanticBeats, sourceHash: current.article.sourceTextSha256, projectId: current.production.project.projectId, now});
  let contextSet = oldRuntime.videoPackagingContexts?.contract === "A1VideoPackagingContextSet/v1" ? oldRuntime.videoPackagingContexts : buildVideoPackagingContextSet([], {createdAt: now});
  let finalBriefSet = null;
  let finalArchitecture = null;
  let finalDecisionSet = null;
  for (let pass = 0; pass < 3; pass += 1) {
    const stage = structuredClone(current);
    stage.production.packagingBeatPlan = freshPackagingBeatPlan;
    stage.production.shotIntelligence = {...stage.production.shotIntelligence, decisionSet: freshDecisionSet, videoPackagingContexts: contextSet};
    const briefSet = recompileBriefs({workspace: stage, directorRun, sourceBindingsByShotHash, now});
    stage.production.shotIntelligence.semanticDesignBriefSet = briefSet;
    stage.production.shotIntelligence.semanticRouteMap = {contract: "A1ShotSemanticRouteMap/v1", articleSourceHash: briefSet.articleSourceHash, shotCount: briefSet.shotCount, routes: briefSet.routeMap, routeMapSha256: briefSet.briefSetSha256, generatedAt: now};
    const architecture = compileWholeFilmVisualArchitecture(stage, {now});
    const aligned = alignShotIntelligenceDecisionSetWithCoveragePlan(freshDecisionSet, architecture.coveragePlan, {now});
    const decisionModesChanged = aligned.items.some((item) => {
      const before = freshDecisionSet.items.find((candidate) => candidate.shotId === item.shotId);
      return before?.decisionHash !== item.decisionHash;
    });
    finalBriefSet = briefSet;
    finalArchitecture = architecture;
    finalDecisionSet = aligned;
    if (!decisionModesChanged) break;
    freshDecisionSet = aligned;
    contextSet = buildContexts(stage, architecture.coveragePlan, aligned, now);
  }
  if (!finalBriefSet || !finalArchitecture || !finalDecisionSet) throw new Error("typography-recompile-no-final-architecture");
  contextSet = buildContexts({...current, production: {...current.production, shotIntelligence: {...current.production.shotIntelligence, videoPackagingContexts: contextSet}}}, finalArchitecture.coveragePlan, finalDecisionSet, now);
  const finalStage = structuredClone(current);
  finalStage.production.packagingBeatPlan = freshPackagingBeatPlan;
  finalStage.production.shotIntelligence = {...finalStage.production.shotIntelligence, decisionSet: finalDecisionSet, videoPackagingContexts: contextSet};
  finalBriefSet = recompileBriefs({workspace: finalStage, directorRun, sourceBindingsByShotHash, now});
  finalStage.production.shotIntelligence.semanticDesignBriefSet = finalBriefSet;
  finalStage.production.shotIntelligence.semanticRouteMap = {contract: "A1ShotSemanticRouteMap/v1", articleSourceHash: finalBriefSet.articleSourceHash, shotCount: finalBriefSet.shotCount, routes: finalBriefSet.routeMap, routeMapSha256: finalBriefSet.briefSetSha256, generatedAt: now};
  finalArchitecture = compileWholeFilmVisualArchitecture(finalStage, {now});
  finalDecisionSet = alignShotIntelligenceDecisionSetWithCoveragePlan(finalDecisionSet, finalArchitecture.coveragePlan, {now});
  finalDecisionSet = syncSemanticTimelineRevision(finalDecisionSet, freshPackagingBeatPlan.semanticBeats, current.article.sourceTextSha256, now);
  finalStage.production.shotIntelligence.decisionSet = finalDecisionSet;
  finalArchitecture = compileWholeFilmVisualArchitecture(finalStage, {now});

  const packageShotIds = new Set(finalArchitecture.coveragePlan.shotPlans.filter((item) => item.route === "PACKAGE_LOOK_MASTER").map((item) => item.shotId));
  const decisionsByShot = new Map(finalDecisionSet.items.map((item) => [item.shotId, item]));
  const briefsByShot = new Map(finalBriefSet.briefs.map((item) => [item.shotId, item]));
  const styleBriefs = [];
  const plansByShot = new Map();
  for (const shot of finalArchitecture.coveragePlan.shotPlans.filter((item) => packageShotIds.has(item.shotId))) {
    const decision = decisionsByShot.get(shot.shotId);
    const semanticBrief = briefsByShot.get(shot.shotId);
    const event = freshPackagingBeatPlan.packagingEvents.find((candidate) => candidate.sourceBeatIds.includes(shot.shotId)) || makeSyntheticEvent(shot, decision);
    const context = contextSet.items.find((item) => item.shotId === shot.shotId);
    const styleBrief = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext: context, semanticBrief, now});
    styleBriefs.push(styleBrief);
    const previousPlan = previousPlansByShot.get(shot.shotId);
    const sourceEvidenceInputs = previousPlan?.sourceEvidenceInputs || [];
    const researchPacket = (oldRuntime.researchPackets || []).find((packet) => packet.shotId === shot.shotId) || null;
    const plan = buildPackageLookMasterPlan(decision, styleBrief, {
      now,
      previousPlan: null,
      semanticBrief,
      referenceManifest,
      researchPacket,
      sourceEvidenceInputs,
      videoContext: context,
    });
    plan.status = "PLAN_READY";
    plan.candidates = [];
    plan.recommendation = null;
    plan.selectedLookMasterId = null;
    plan.reviewDecision = null;
    plansByShot.set(shot.shotId, plan);
  }

  const next = structuredClone(finalStage);
  const runtime = next.production.shotIntelligence;
  runtime.semanticDesignBriefSet = finalBriefSet;
  runtime.semanticRouteMap = {contract: "A1ShotSemanticRouteMap/v1", articleSourceHash: finalBriefSet.articleSourceHash, shotCount: finalBriefSet.shotCount, routes: finalBriefSet.routeMap, routeMapSha256: finalBriefSet.briefSetSha256, generatedAt: now};
  runtime.decisionSet = finalDecisionSet;
  runtime.videoPackagingContextHistory = [...(runtime.videoPackagingContextHistory || []), ...(oldRuntime.videoPackagingContexts?.items || []).filter((item) => !packageShotIds.has(item.shotId))];
  runtime.videoPackagingContexts = contextSet;
  runtime.packageLookMasterPlanHistory = [...(runtime.packageLookMasterPlanHistory || []), ...(oldRuntime.packageLookMasterPlans || []).filter((plan) => !packageShotIds.has(plan.shotId)).map((plan) => ({...plan, current: false, status: "HISTORY_READ_ONLY", authorityScope: "HISTORY_READ_ONLY"}))];
  runtime.packageLookMasterPlans = [...plansByShot.values()];
  runtime.lookMasterRawReferences = rawHistory.map((raw) => ({...raw, current: false, recommendationEligible: false, selectionEligible: false, assemblyEligible: false, status: raw.current === true ? "HISTORY_READ_ONLY_SEMANTIC_RECOMPILE" : raw.status, historyReadOnly: true}));
  runtime.packageAssemblyRecipeHistory = [...(runtime.packageAssemblyRecipeHistory || []), ...(runtime.packageAssemblyRecipes || []).map((recipe) => ({...recipe, current: false, status: "HISTORY_READ_ONLY", authorityScope: "HISTORY_READ_ONLY"}))];
  runtime.packageAssetKitPlanHistory = [...(runtime.packageAssetKitPlanHistory || []), ...(runtime.packageAssetKitPlans || []).map((kit) => ({...kit, current: false, status: "HISTORY_READ_ONLY", authorityScope: "HISTORY_READ_ONLY"}))];
  runtime.packageAssemblyRecipes = [];
  runtime.packageAssetKitPlans = [];
  runtime.currentAssembly = [];
  if (runtime.wholeFilmStaticBoard) {
    runtime.wholeFilmStaticBoardHistory = [...(runtime.wholeFilmStaticBoardHistory || []), {...runtime.wholeFilmStaticBoard, current: false, status: "SUPERSEDED_SEMANTIC_RECOMPILE", supersededAt: now, supersededBy: "typography-recall-recompile-v1"}];
    runtime.wholeFilmStaticBoard = null;
  }
  next.production.packagingStyleBriefHistory = [...(next.production.packagingStyleBriefHistory || []), ...(next.production.packagingStyleBriefs || []).map((brief) => ({...brief, current: false, status: "HISTORY_READ_ONLY", authorityScope: "HISTORY_READ_ONLY"}))];
  next.production.packagingStyleBriefs = styleBriefs;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.jobs = next.production.generation.jobs.map((job) => {
    if (job.targetKind !== "package-look-master") return job;
    return {...job, semanticDisposition: "HISTORY_READ_ONLY_SEMANTIC_RECOMPILE"};
  });

  // Migrate from the pre-recompile snapshot.  The durable history projection
  // below intentionally marks those records HISTORY_READ_ONLY; reading that
  // projection as the migration source would strand every previously passing
  // PNG and make a semantic recompile look like image loss.
  const rebindRecords = migratePassReferences(next, plansByShot, previousPlansByShot, decisionsByShot, now, rawHistory);
  const reboundKeys = new Set(rebindRecords.map((item) => `${item.shotId}:${item.artifactSha256}`));
  // Keep migrated records current in the canonical candidate collection. All
  // other old records remain immutable history; spreading rawHistory before
  // this point would otherwise discard the mutations made by the migration.
  runtime.lookMasterRawReferences = rawHistory.map((raw) => reboundKeys.has(`${raw.shotId}:${raw.artifact?.sha256}`)
    ? structuredClone(raw)
    : {...raw, current: false, recommendationEligible: false, selectionEligible: false, assemblyEligible: false, historyReadOnly: true});
  for (const raw of next.production.shotIntelligence.lookMasterRawReferences) {
    if (!raw.current || !packageShotIds.has(raw.shotId)) continue;
    const plan = plansByShot.get(raw.shotId);
    const decision = decisionsByShot.get(raw.shotId);
    raw.candidateAuditAuthority = buildCandidateRecommendationAuditAuthority({rawReference: raw, plan, decision, now});
    raw.recommendationEligible = raw.candidateAuditAuthority.status === "PASS";
    raw.selectionEligible = raw.candidateAuditAuthority.status === "PASS";
    raw.assemblyEligible = raw.candidateAuditAuthority.status === "PASS";
  }

  const event = createProductionEvent({workspace: current, action: "typography-recall-semantic-recompile", targetId: finalBriefSet.briefSetSha256, payload: {
    contract: "A1TypographyRecallRecompile/v1",
    packageShotIds: [...packageShotIds],
    packageCount: packageShotIds.size,
    newPackageShotIds: [...packageShotIds].filter((shotId) => !rawPlanCandidates.has(shotId)),
    preservedArtifactSha256: rebindRecords.map((item) => item.artifactSha256),
    sourceRevisionHash: finalDecisionSet.sourceRevisionHash,
    semanticTimelineHash: finalDecisionSet.semanticTimelineHash,
    imageGenerationPerformed: false,
    assemblyCreated: false,
    layerReconstructionPerformed: false,
    criticPerformed: false,
    motionPerformed: false,
    singleWriterTaskId,
  }, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;

  const architectureBeforeFinalize = compileWholeFilmVisualArchitecture(next, {now});
  next.production.shotVisualCoveragePlan = architectureBeforeFinalize.coveragePlan;
  next.production.wholeFilmGenerationReadiness = architectureBeforeFinalize.generationReadiness;
  next.production.visualProductionRun = architectureBeforeFinalize.productionRun;
  next.production.wholeFilmPackagingDirection = next.production.wholeFilmPackagingDirection || null;
  const finalized = finalizeWholeFilmLookMasterBatch(next, architectureBeforeFinalize.coveragePlan, {now, semanticReviewRequired: false, actualPixelSemanticAuditRequired: true});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(finalized.workspace, now));
  const packagePlans = recalculated.production.shotIntelligence.packageLookMasterPlans || [];
  const report = {
    contract: "A1TypographyRecallRecompileReport/v1",
    status: "COMMITTED",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    packageShotIds: packagePlans.map((plan) => plan.shotId),
    packageCount: packagePlans.length,
    strongLanguageEventCount: finalDecisionSet.items.filter((item) => item.strongLanguageEvent).length,
    strongLanguagePackageShotIds: finalDecisionSet.items.filter((item) => item.strongLanguageEvent && item.packageDecision === "PACKAGE").map((item) => item.shotId),
    typographyTreatmentDistribution: finalDecisionSet.items.reduce((counts, item) => ({...counts, [item.typographyTreatment || "NONE"]: (counts[item.typographyTreatment || "NONE"] || 0) + 1}), {}),
    newPackageShotIds: packagePlans.filter((plan) => !rawPlanCandidates.has(plan.shotId)).map((plan) => plan.shotId),
    rebindRecords,
    preservedArtifactSha256: rebindRecords.map((item) => item.artifactSha256),
    research: {
      ed14NetworkDecision: finalDecisionSet.items.find((item) => item.shotId === "ED-14")?.networkDecision || null,
      ed14SourceEvidenceCount: packagePlans.find((plan) => plan.shotId === "ED-14")?.sourceEvidenceInputs?.length || 0,
      ed14ResearchPacketSha256: packagePlans.find((plan) => plan.shotId === "ED-14")?.researchPacketSha256 || null,
    },
    batchRecommendation: {
      status: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation?.status,
      exceptions: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation?.exceptions || [],
      nextUserGate: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation?.nextUserGate,
      assemblyCreationAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed,
    },
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    assemblyCount: recalculated.production.shotIntelligence.currentAssembly?.length || 0,
    downstream: {layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false},
    generatedAt: now,
  };
  const historicalResearchReportPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/research-mode-candidate-authority-reconciliation-v1/report.json");
  const historicalResearchReport = fs.existsSync(historicalResearchReportPath)
    ? JSON.parse(fs.readFileSync(historicalResearchReportPath, "utf8"))
    : null;
  const isolatedHistoricalResearchReport = historicalResearchReport ? {
    ...historicalResearchReport,
    status: "HISTORY_READ_ONLY",
    current: false,
    authorityScope: "HISTORY_READ_ONLY",
    supersededBy: {
      contract: "A1PackagingLifecycleProjection/v1",
      currentWorkspaceSha256: recalculated.workspaceSha256,
      currentStage: recalculated.production.authority?.currentStage || null,
      nextUserGate: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation?.nextUserGate || null,
      currentAuthorityStage: recalculated.production.authority?.currentStage || null,
    },
  } : null;
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `typography-recall-recompile-${Date.now()}`, files: {
    "typography-recall-recompile-v1/report.json": report,
    "typography-recall-recompile-v1/director-input.json": directorRun,
    "typography-recall-recompile-v1/decision-set.json": finalDecisionSet,
    "typography-recall-recompile-v1/coverage-plan.json": recalculated.production.shotVisualCoveragePlan,
    "typography-recall-recompile-v1/video-packaging-contexts.json": recalculated.production.shotIntelligence.videoPackagingContexts,
    "video-packaging-context-v1/manifest.json": recalculated.production.shotIntelligence.videoPackagingContexts,
    ...(isolatedHistoricalResearchReport ? {"research-mode-candidate-authority-reconciliation-v1/report.json": isolatedHistoricalResearchReport} : {}),
  }});
  return {report, persisted, workspace: recalculated};
});

console.log(JSON.stringify({report: result.report, commitId: result.persisted.commitId, journalStatus: result.persisted.journal?.status, workspaceSha256: result.workspace.workspaceSha256}, null, 2));
