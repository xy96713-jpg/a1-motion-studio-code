#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertPackageLookMasterPlan,
  buildPackageLookMasterPlan,
  planIdentity,
} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  A1_HERO_TITLE_CARRIERS,
  A1_HERO_TITLE_STYLE_MODES,
  A1_TYPOGRAPHY_ROLES,
  deriveHeroTitlePresentation,
} from "../apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs";
import {
  auditRecordFromRawReference,
  buildRepairManifest,
  markRepairManifestHistoryReadOnly,
  writeRepairManifestSidecarAtomic,
} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const repairManifestSidecarPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json");
const publicRepairManifestPath = path.join(phaseRoot, "incremental-repair-executor-v1/repair-manifest.json");
const historicalRepairManifestPath = path.join(root, ".codex-artifacts/system-progress-system-line/incremental-repair-executor-v1/repair-manifest.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const authorityAuditPath = path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json");
const auditRoot = path.join(phaseRoot, "look-master-audits");
const referenceManifest = JSON.parse(fs.readFileSync(path.join(phaseRoot, "../reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const canonicalScope = ["ED-07", "ED-08", "ED-13", "ED-19"];
const requestedTargetIds = (process.argv.find((value) => value.startsWith("--shotIds="))?.slice("--shotIds=".length) || "").split(",").map((value) => value.trim()).filter(Boolean);
let targetIds = requestedTargetIds;
const primitiveByShot = {
  "ED-07": "presenter-headline-negative-space-question",
  "ED-08": "presenter-headline-verdict-monument",
  "ED-13": "presenter-headline-two-part-contrast",
  "ED-19": "hero-takeover-verb-sequence",
};
const protectedPhrasesByShot = {
  "ED-07": ["为什么不让它直接写完全文"],
  "ED-08": ["AI 常常不说人话"],
  "ED-13": ["国产模型写中文确实会顺一些", "问题也并没有彻底解决"],
  "ED-19": ["Codex 在后台", "整理", "编排", "读取", "检查"],
};
const headlineCopyByShot = {
  "ED-07": "为什么不让它直接写完全文",
  "ED-08": "AI 常常不说人话",
  "ED-13": "中文顺了 / 问题还在",
  "ED-19": "Codex 在后台 / 整理 / 编排 / 读取 / 检查",
};
const semanticEventByShot = {
  "ED-07": "QUESTION",
  "ED-08": "VERDICT",
  "ED-13": "STRONG_CONTRAST",
  "ED-19": "METHOD_SEQUENCE",
};
const displayPhrasesByShot = Object.fromEntries(Object.entries(headlineCopyByShot).map(([shotId, copy]) => [
  shotId,
  String(copy || "").split(/\s*\/\s*/u).map((value) => value.trim()).filter(Boolean),
]));
const roleByShot = {
  "ED-07": "PRESENTER_HEADLINE",
  "ED-08": "PRESENTER_HEADLINE",
  "ED-13": "PRESENTER_HEADLINE",
  "ED-19": "HERO_TAKEOVER",
};
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const jsonFileSha256 = (value) => crypto.createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`, "utf8").digest("hex");

function readOptionalJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function currentRepairSidecar() {
  return readOptionalJson(repairManifestSidecarPath);
}

function collectRepairAuditRecords(workspace) {
  const records = [];
  if (fs.existsSync(auditRoot)) {
    for (const shotId of fs.readdirSync(auditRoot).filter((name) => /^ED-\d+$/u.test(name))) {
      const directory = path.join(auditRoot, shotId);
      for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".json"))) {
        try { records.push(JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"))); } catch { /* ignore malformed history */ }
      }
    }
  }
  for (const rawReference of workspace.production.shotIntelligence.lookMasterRawReferences || []) {
    const audit = auditRecordFromRawReference(rawReference);
    if (audit) records.push(audit);
  }
  return records;
}

function collectRepairCandidateRecords(workspace) {
  return [
    ...(workspace.production.generation.jobs || []).map((job) => job.output?.sha256 ? {...job.output, attempts: job.attempts || 0} : null).filter(Boolean),
    ...(workspace.production.shotIntelligence.lookMasterRawReferences || []).map((reference) => reference.artifact?.sha256
      ? {
          artifact: reference.artifact,
          shotId: reference.shotId || reference.artifact.shotId || null,
          planSha256: reference.planSha256 || null,
          lookMasterPlanSha256: reference.planSha256 || null,
          styleBriefSha256: reference.styleBriefSha256 || null,
          canonicalPrimitiveId: reference.canonicalPrimitiveId || null,
          directionFingerprint: reference.directionFingerprint,
          isRawReference: true,
          current: reference.current === true,
          recommendationEligible: reference.recommendationEligible === true,
          selectionEligible: reference.selectionEligible === true,
          importedAt: reference.importedAt || null,
          attempts: 1,
        }
      : null).filter(Boolean),
  ];
}

function sidecarMatchesCurrentCanonicalPlans(sidecar, workspace) {
  const authority = workspace.production.shotIntelligence.canonicalDirectorAuthority;
  const canonicalManifest = workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
  if (!sidecar || sidecar.canonicalRepairBinding?.authoritySha256 !== authority?.authoritySha256
    || sidecar.canonicalRepairBinding?.manifestSha256 !== canonicalManifest?.manifestSha256
    || sidecar.canonicalRepairBinding?.sourceRevisionHash !== authority?.sourceRevisionHash) return false;
  const plans = new Map(workspace.production.shotIntelligence.packageLookMasterPlans.map((plan) => [plan.shotId, plan.planSha256]));
  return targetIds.every((shotId) => {
    const entry = sidecar.entries?.find((item) => item.shotId === shotId);
    const currentRaw = (workspace.production.shotIntelligence.lookMasterRawReferences || [])
      .filter((item) => item.shotId === shotId
        && item.planSha256 === plans.get(shotId)
        && item.current === true
        && item.recommendationEligible === true
        && item.artifact?.sha256)
      .sort((left, right) => String(right.importedAt || right.createdAt || "").localeCompare(String(left.importedAt || left.createdAt || "")))
      .at(0) || null;
    return (entry?.currentPlanSha256 || entry?.planSha256) === plans.get(shotId)
      && (!currentRaw || entry?.candidateSha === currentRaw.artifact.sha256);
  });
}

function refreshRepairManifestSidecar(workspace) {
  const previous = currentRepairSidecar();
  const manifest = buildRepairManifest({
    workspace,
    currentPhase: readOptionalJson(currentPhasePath),
    authorityAudit: readOptionalJson(authorityAuditPath),
    candidateRecords: collectRepairCandidateRecords(workspace),
    auditRecords: collectRepairAuditRecords(workspace),
    previousManifest: previous,
    mode: "execution",
  });
  manifest.authorityState = "CURRENT";
  manifest.current = true;
  manifest.historyReadOnly = false;
  if (previous?.authorityState === "CURRENT" && previous.manifestSha256 !== manifest.manifestSha256) {
    manifest.supersedesCurrentManifest = {
      supersededManifestSha256: previous.manifestSha256,
      reason: "canonical-title-repair-current-projection-refresh",
      supersededAt: new Date().toISOString(),
    };
    manifest.manifestSha256 = sha256({...manifest, manifestSha256: undefined});
    const historical = markRepairManifestHistoryReadOnly(previous, {currentManifestSha256: manifest.manifestSha256});
    for (const archivePath of [
      path.join(path.dirname(repairManifestSidecarPath), "history", `repair-manifest-${previous.manifestSha256}.json`),
      path.join(path.dirname(publicRepairManifestPath), "history", `repair-manifest-${previous.manifestSha256}.json`),
    ]) {
      fs.mkdirSync(path.dirname(archivePath), {recursive: true});
      fs.writeFileSync(archivePath, `${JSON.stringify(historical, null, 2)}\n`, "utf8");
    }
    fs.mkdirSync(path.dirname(historicalRepairManifestPath), {recursive: true});
    fs.writeFileSync(historicalRepairManifestPath, `${JSON.stringify(historical, null, 2)}\n`, "utf8");
  }
  return writeRepairManifestSidecarAtomic({
    manifestPath: repairManifestSidecarPath,
    manifest,
    expectedManifestSha256: previous?.manifestSha256,
    // This script owns the current canonical title-repair transaction. The
    // project workspace is persisted under the same project lock before this
    // sidecar mirror is advanced, so the explicit current-authority mutation
    // is intentional and CAS-bound.
    allowCurrentAuthorityMutation: true,
  });
}

function canonicalDecisionProjection(sourceDecision, canonicalDecision) {
  const takeover = canonicalDecision.canonicalTypographyVisualRole === "HERO_TAKEOVER" || canonicalDecision.canonicalMedium === "full-package";
  const visualRole = canonicalDecision.canonicalTypographyVisualRole || sourceDecision.typographyVisualRole || "NONE";
  return {
    ...structuredClone(sourceDecision),
    packageDecision: canonicalDecision.canonicalPackageDecision,
    packageReason: canonicalDecision.rationale,
    decisionHash: canonicalDecision.decisionSha256,
    canonicalDirectorDecisionSha256: canonicalDecision.decisionSha256,
    assemblyMode: takeover ? "TYPOGRAPHY" : "OVERLAY",
    presentationMode: takeover ? "FULLSCREEN" : "PRESENTER_INTEGRATED_LOOK_MASTER",
    presentationModeReason: takeover ? "HERO_TAKEOVER 用完整画面承载主导式标题序列。" : "PRESENTER_HEADLINE 保留人物为可信基底，标题进入真实负空间。",
    assemblyModeReason: takeover ? "完整包装比局部卡片更能承载 canonical 语义动作。" : "人物为主画面，包装只在声明的真实负空间中叠加。",
    whyThisModeBeatsOtherModes: takeover ? "完整画面能让主导式标题成为一个可记忆的视觉动作；局部叠加会压缩语义。" : "人物连续可信度必须保留；局部负空间包装足以完成单一语义动作。",
    whyPresentationModeBeatsOtherModes: takeover ? "完整画面提供足够层级和安静场，不把流程词挤成角落卡片。" : "真实人物仍是信息主位，标题只占据已测量的开放区域。",
    baseVisualCarrier: takeover ? "NONE_OR_TAKEOVER" : "PRESENTER_BASE",
    enhancementPackaging: takeover ? "GENERATED_EDITORIAL_PACKAGE" : "TYPE_OVERLAY",
    strongLanguageEvent: true,
    typographyActor: true,
    typographyVisualRole: visualRole,
    typographyTreatment: takeover ? "TYPOGRAPHY" : sourceDecision.typographyTreatment || "VERDICT_OVERLAY",
    typographyPolicy: {
      ...(sourceDecision.typographyPolicy || {}),
      typographyVisualRole: visualRole,
      preferredPresentationMode: takeover ? "FULLSCREEN" : "OVERLAY",
      protectedPhrases: protectedPhrasesByShot[canonicalDecision.shotId] || sourceDecision.protectedPhrases || [],
    },
    protectedPhrases: protectedPhrasesByShot[canonicalDecision.shotId] || sourceDecision.protectedPhrases || [],
  };
}

function titlePresentationForShot({shotId, sourceDecision, creatorDecision}) {
  const presenterAvailable = creatorDecision?.presentationDecision?.presenterVisibility === "REQUIRED"
    || creatorDecision?.presentationMode === "PRESENTER_INTEGRATED_LOOK_MASTER"
    || sourceDecision?.baseVisualCarrier === "PRESENTER_BASE";
  return deriveHeroTitlePresentation({
    shotId,
    title: headlineCopyByShot[shotId],
    sourceText: sourceDecision?.sourceText,
    semanticEvent: semanticEventByShot[shotId],
    typographyRole: A1_TYPOGRAPHY_ROLES.HERO_GENERATED_TYPE,
    baseVisualCarrier: presenterAvailable ? "PRESENTER_BASE" : sourceDecision?.baseVisualCarrier,
    presenterAvailable,
    presenterSemanticValue: presenterAvailable,
  });
}

function compileMissingEd08StyleBrief({decision, semanticBrief, context, now}) {
  const event = {
    eventId: "canonical-title-repair-ed-08-style-v1",
    sourceBeatIds: ["ED-08"],
    packagingType: "OVERLAY_PACKAGE",
    semanticRole: "key-claim",
    sourceText: decision.sourceText,
    semanticJob: semanticBrief?.narrativeJob || decision.packageReason,
    semanticAction: semanticBrief?.semanticActor?.action || decision.packageReason,
    contentSha256: sha256({shotId: "ED-08", sourceText: decision.sourceText, canonicalDecisionSha256: decision.decisionHash}),
  };
  return compileRetroPixelEditorialStyleBrief({
    event,
    appRoot,
    videoContext: context,
    semanticBrief,
    referenceExclusions: ["pinterest-retro-pixel-10"],
    variationOverrides: {
      primaryFamily: "scanline-crt-signal",
      supportingFamilies: ["pixel-type-actor"],
      surfaceLogic: "ed-08-cool-bound-editorial-surface",
      dominantActor: "rigid-language-output-machine",
      composition: "machine-output-ribbon-breaks-before-conversation",
      palette: "coolwhite-charcoal-cobalt",
      material: "textless-imagegen-substrate-plus-local-hash-bound-typography",
      motionEnergy: "single-semantic-action-then-hold",
      crtFusion: true,
    },
    now,
  });
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const authority = runtime.canonicalDirectorAuthority;
  const targetManifest = runtime.canonicalDirectorTargetRepairManifest;
  targetIds = requestedTargetIds.length ? requestedTargetIds : [...(targetManifest?.generationEligibleShotIds || [])];
  if (authority?.status !== "PASS") throw new Error("canonical-title-repair-authority-not-pass");
  if (targetManifest?.authoritySha256 !== authority.authoritySha256 || targetManifest?.sourceRevisionHash !== authority.sourceRevisionHash) throw new Error("canonical-title-repair-authority-binding-drift");
  const allowedTargetIds = targetManifest.targetRepairShotIds?.length ? targetManifest.targetRepairShotIds : canonicalScope;
  const defaultTargetIds = targetManifest.generationEligibleShotIds || [];
  if (JSON.stringify(targetManifest.targetRepairShotIds) !== JSON.stringify(canonicalScope)
    || !targetIds.length
    || targetIds.some((shotId) => !allowedTargetIds.includes(shotId))
    || (!requestedTargetIds.length && JSON.stringify(defaultTargetIds) !== JSON.stringify(targetIds))) throw new Error("canonical-title-repair-scope-drift");
  if (current.production.generation.summary.queued || current.production.generation.summary.running) throw new Error("canonical-title-repair-requires-idle-queue");
  if ((current.production.visualProductionRun?.currentAssembly || []).length || current.production.shotIntelligence.currentAssembly?.length) throw new Error("canonical-title-repair-assembly-not-empty");

  const oldPlans = runtime.packageLookMasterPlans || [];
  const styleBriefs = current.production.packagingStyleBriefs || [];
  const contexts = runtime.videoPackagingContexts?.items || [];
  const decisions = runtime.decisionSet?.items || [];
  const canonicalByShot = new Map((authority.decisions || []).map((item) => [item.shotId, item]));
  const creatorByShot = new Map((current.production.canonicalCreatorPackagingSequence?.decisions || []).map((item) => [item.shotId, item]));
  const preparedStyleBriefs = new Map();
  const existingSidecar = currentRepairSidecar();
  const sidecarAlreadyMatches = sidecarMatchesCurrentCanonicalPlans(existingSidecar, current);
  const alreadyPrepared = targetIds.every((shotId) => {
    const oldPlan = oldPlans.find((item) => item.shotId === shotId);
    const entry = targetManifest.entries?.find((item) => item.shotId === shotId);
    const canonical = canonicalByShot.get(shotId);
    const titlePresentation = titlePresentationForShot({shotId, sourceDecision: decisions.find((item) => item.shotId === shotId), creatorDecision: creatorByShot.get(shotId)});
    const canonicalTakeover = primitiveByShot[shotId] === "hero-takeover-verb-sequence"
      || canonical?.canonicalTypographyVisualRole === "HERO_TAKEOVER"
      || canonical?.canonicalMedium === "full-package";
    const staleCurrentRaw = canonicalTakeover && (runtime.lookMasterRawReferences || []).some((raw) => raw.shotId === shotId && raw.current === true && raw.planSha256 !== oldPlan?.planSha256);
    const expectedPresentationMode = !canonicalTakeover && titlePresentation.carrier === A1_HERO_TITLE_CARRIERS.PRESENTER_HERO_TYPE ? "OVERLAY" : "FULLSCREEN";
    const expectedFrameOccupation = expectedPresentationMode === "FULLSCREEN" ? "FULL_FRAME_TAKEOVER" : "OVERLAY";
    return oldPlan?.canonicalRepair?.authoritySha256 === authority.authoritySha256
      && oldPlan?.canonicalRepair?.sourceRevisionHash === authority.sourceRevisionHash
      && oldPlan?.canonicalRepair?.canonicalDecisionSha256 === canonical?.decisionSha256
      && oldPlan?.canonicalRepair?.primitiveId === primitiveByShot[shotId]
      && oldPlan?.canonicalRepair?.presentationMode === expectedPresentationMode
      && oldPlan?.frameOccupation === expectedFrameOccupation
      && (oldPlan?.videoContext?.frameOccupation || null) === expectedFrameOccupation
      && JSON.stringify(oldPlan?.displayProtectedPhrases || []) === JSON.stringify(displayPhrasesByShot[shotId] || [])
      && !staleCurrentRaw
      && entry?.currentPlanSha256 === oldPlan.planSha256;
  });
  const semanticProjectionMatches = current.production.semanticAuthorityConvergence?.authoritySha256 === authority.authoritySha256
    && current.production.semanticAuthorityConvergence?.sourceRevisionHash === authority.sourceRevisionHash
    && current.production.semanticAuthorityConvergence?.manifestSha256 === targetManifest.manifestSha256;
  if (alreadyPrepared && sidecarAlreadyMatches && semanticProjectionMatches) {
    const persistedTargetManifest = readOptionalJson(path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/semantic-authority-convergence-v1/target-repair-manifest.json"));
    if (persistedTargetManifest?.manifestSha256 !== targetManifest.manifestSha256) {
      persistProjectState(appRoot, current, {
        expectedWorkspaceSha256: current.workspaceSha256,
        files: {
          "semantic-authority-convergence-v1/target-repair-manifest.json": targetManifest,
        },
      });
    }
    return {workspace: current, manifest: targetManifest, replacements: [], alreadyCurrent: true, sidecarRefreshed: false, sidecarAlreadyMatches: true};
  }
  if (alreadyPrepared) {
    const next = structuredClone(current);
    next.production.generation.automaticDispatchAllowed = true;
    next.production.generation.workerStatus = "frozen";
    if (!semanticProjectionMatches) {
      next.production.semanticAuthorityConvergence = {
        ...(next.production.semanticAuthorityConvergence || {}),
        checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
        authoritySha256: authority.authoritySha256,
        sourceRevisionHash: authority.sourceRevisionHash,
        manifestSha256: targetManifest.manifestSha256,
        targetRepairShotIds: targetManifest.targetRepairShotIds,
        generationEligibleShotIds: targetManifest.generationEligibleShotIds,
        generationAllowedByCanonicalAuthority: targetManifest.generationEligibleShotIds.length > 0,
        generationDispatched: false,
        imageGenCalls: 0,
        boardRebuilt: false,
      };
    }
    const refreshedBinding = buildCreatorPaletteShotBindingManifest(next);
    // A blocked binding is a valid fail-closed result while the current plan
    // waits for its style-correct candidate; do not turn that state into a
    // failed plan-preparation transaction.
    next.production.creatorPaletteShotBindingManifest = refreshedBinding;
    const refreshedWorkspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
    // The repair sidecar is a current authority mirror, not an artifact-only
    // cache. Build it before the project transaction so the public mirror is
    // advanced atomically with the workspace pointers.
    const refreshed = refreshRepairManifestSidecar(refreshedWorkspace);
    refreshedWorkspace.production.incrementalRepairManifestAuthority = {
      ...(refreshedWorkspace.production.incrementalRepairManifestAuthority || {}),
      contract: "A1IncrementalRepairManifestAuthority/v1",
      status: "CURRENT",
      manifestSha256: refreshed.manifest.manifestSha256,
      manifestFileSha256: jsonFileSha256(refreshed.manifest),
      manifestFileShaAlgorithm: "SHA-256(UTF-8-JSON-BYTES)",
      currentRepairStatus: refreshed.manifest.status,
      packageCount: refreshed.manifest.summary.packageCount,
      noPackageCount: refreshed.manifest.summary.noPackageCount,
      readyForGenerationCount: refreshed.manifest.summary.readyForGenerationCount,
      artifactPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
      publicPath: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
      mirrorStatus: "IN_SYNC",
    };
    const persistedWorkspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(refreshedWorkspace));
    if (persistedWorkspace.workspaceSha256 !== current.workspaceSha256) {
      persistProjectState(appRoot, persistedWorkspace, {
        expectedWorkspaceSha256: current.workspaceSha256,
        files: {
          "semantic-authority-convergence-v1/target-repair-manifest.json": targetManifest,
          "creator-packaging-palette-binding-v1/manifest.json": refreshedBinding,
          "incremental-repair-executor-v1/repair-manifest.json": refreshed.manifest,
        },
      });
    }
    return {workspace: persistedWorkspace, manifest: targetManifest, replacements: [], alreadyCurrent: true, sidecarRefreshed: !sidecarAlreadyMatches, sidecarAlreadyMatches, sidecar: refreshed.manifest};
  }
  const replacements = [];
  const preparedAt = new Date().toISOString();
  for (const shotId of targetIds) {
    const oldPlan = oldPlans.find((item) => item.shotId === shotId);
    const sourceDecision = decisions.find((item) => item.shotId === shotId);
    const canonical = canonicalByShot.get(shotId);
    const creatorDecision = creatorByShot.get(shotId) || null;
    const projectedDecision = sourceDecision && canonical ? canonicalDecisionProjection(sourceDecision, canonical) : sourceDecision;
    // Bind the rebuilt look-master plan to the current creator packaging
    // decision, not the legacy decision snapshot that may still be embedded
    // in the old plan. This keeps frame occupation and full-frame rhythm
    // policy hash-consistent with the current authority sequence.
    if (projectedDecision && creatorDecision?.packageDecision === "PACKAGE") {
      projectedDecision.canonicalCreatorDecision = structuredClone(creatorDecision);
      projectedDecision.contentTreatment = creatorDecision.contentTreatment;
      projectedDecision.frameOccupation = creatorDecision.frameOccupation;
      projectedDecision.assemblyMode = creatorDecision.assemblyMode;
      projectedDecision.presentationMode = creatorDecision.presentationMode;
      projectedDecision.presenterPackagingMode = creatorDecision.presenterPackagingMode;
      projectedDecision.presenterPackagingRoute = structuredClone(creatorDecision.presenterPackagingRoute || null);
      projectedDecision.fullFramePolicy = structuredClone(creatorDecision.fullFramePolicy || null);
      // EVA is a formal typography treatment inside the selected visual
      // master. It is never allowed to replace a PIXEL_WINDOW composition.
      if (creatorDecision.contentTreatment === "PIXEL_WINDOW") projectedDecision.typographyTreatment = "EVA_TYPOGRAPHY_ONLY";
    }
    let styleBrief = styleBriefs.find((item) => item.sourceBeatIds?.includes(shotId));
    const context = contexts.find((item) => item.shotId === shotId);
    if (!oldPlan || !context || !sourceDecision || !canonical) throw new Error(`canonical-title-repair-input-missing:${shotId}`);
    if (!styleBrief && shotId === "ED-08") {
      styleBrief = compileMissingEd08StyleBrief({decision: projectedDecision, semanticBrief: oldPlan.semanticDesignBrief || null, context, now: preparedAt});
      preparedStyleBriefs.set(shotId, styleBrief);
    }
    if (!styleBrief) throw new Error(`canonical-title-repair-input-missing:${shotId}:style-brief`);
    const existingCanonical = oldPlan.canonicalRepair || null;
    const sameCanonicalRevision = existingCanonical?.authoritySha256 === authority.authoritySha256
      && existingCanonical?.sourceRevisionHash === authority.sourceRevisionHash
      && existingCanonical?.canonicalDecisionSha256 === canonical.decisionSha256
      && existingCanonical?.primitiveId === primitiveByShot[shotId];
    const stablePlanTimestamp = sameCanonicalRevision ? (oldPlan.createdAt || preparedAt) : preparedAt;
    const stablePrimitiveAppliedAt = sameCanonicalRevision ? (oldPlan.visualPrimitiveSwitch?.appliedAt || preparedAt) : preparedAt;
    const supersededPlanSha256 = existingCanonical?.oldPlanSha256 || oldPlan.planSha256;
    const role = roleByShot[shotId];
    const titlePresentation = titlePresentationForShot({shotId, sourceDecision: projectedDecision, creatorDecision});
    // Canonical visual role is the higher-order authority.  A stale creator
    // presenter flag must not downgrade a declared HERO_TAKEOVER back to an
    // overlay plan; that mismatch was the source of ED-19's impossible
    // fullscreen-vs-overlay audit contract.
    const canonicalTakeover = role === "HERO_TAKEOVER" || canonical.canonicalMedium === "full-package";
    const pixelWindowMaster = creatorDecision?.contentTreatment === "PIXEL_WINDOW";
    const creatorRouteTakeover = creatorDecision?.frameOccupation === "FULL_FRAME_TAKEOVER";
    const presenterHero = !canonicalTakeover && titlePresentation.carrier === A1_HERO_TITLE_CARRIERS.PRESENTER_HERO_TYPE;
    const takeover = canonicalTakeover || creatorRouteTakeover || !presenterHero;
    const routeAssemblyMode = takeover ? (pixelWindowMaster ? "EXPLAINER" : "TYPOGRAPHY") : "OVERLAY";
    const routePresentationMode = takeover ? (pixelWindowMaster ? "FULLSCREEN_EXPLAINER_TAKEOVER" : "FULLSCREEN") : "PRESENTER_INTEGRATED_LOOK_MASTER";
    const routeContentTreatment = pixelWindowMaster ? "PIXEL_WINDOW" : takeover ? "HERO_TYPOGRAPHY" : (creatorDecision?.contentTreatment || "HERO_TYPOGRAPHY");
    const shortTakeover = false;
    const expectedPresentationMode = routePresentationMode;
    const currentManifestEntry = targetManifest.entries?.find((entry) => entry.shotId === shotId);
    const staleCurrentRaw = canonicalTakeover && (runtime.lookMasterRawReferences || []).some((raw) => raw.shotId === shotId && raw.current === true && raw.planSha256 !== oldPlan.planSha256);
    if (sameCanonicalRevision
      && existingCanonical?.presentationMode === expectedPresentationMode
      && (oldPlan.videoContext?.frameOccupation || null) === (expectedPresentationMode === "FULLSCREEN" ? "FULL_FRAME_TAKEOVER" : "OVERLAY")
      && oldPlan.frameOccupation === (expectedPresentationMode === "FULLSCREEN" ? "FULL_FRAME_TAKEOVER" : "OVERLAY")
      && oldPlan.videoContext?.presentationMode === (expectedPresentationMode === "FULLSCREEN" ? "FULLSCREEN" : "PRESENTER_INTEGRATED_LOOK_MASTER")
      && oldPlan.videoContext?.assemblyMode === (expectedPresentationMode === "FULLSCREEN" ? "TYPOGRAPHY" : "OVERLAY")
      && (expectedPresentationMode !== "FULLSCREEN" || oldPlan.videoContext?.presenterPackagingComplexityGate?.status === "NON_PRESENTER_ROUTE_PASS")
      && !staleCurrentRaw
      && JSON.stringify(oldPlan.displayProtectedPhrases || []) === JSON.stringify(displayPhrasesByShot[shotId] || [])
      && currentManifestEntry?.currentPlanSha256 === oldPlan.planSha256) {
      continue;
    }
    const nextContext = takeover
      ? {
          ...structuredClone(context),
          assemblyMode: routeAssemblyMode,
          presentationMode: routePresentationMode,
          baseVisualCarrier: "NONE_OR_TAKEOVER",
          enhancementPackaging: "GENERATED_EDITORIAL_PACKAGE",
          strongLanguageEvent: true,
          typographyTreatment: pixelWindowMaster ? "EVA_TYPOGRAPHY_ONLY" : "TYPOGRAPHY",
          typographyActor: true,
          baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER",
          baseSubjectMustRemainVisible: false,
          frameTakeoverAllowed: true,
          frameOccupation: "FULL_FRAME_TAKEOVER",
          contentTreatment: routeContentTreatment,
          presenterPackagingMode: pixelWindowMaster ? "PRESENTER_CUTOUT_COMPOSITE" : "TYPOGRAPHY_TAKEOVER",
          presenterPackagingComplexityGate: {
            contract: "A1PresenterPackagingComplexityGate/v1",
            status: "NON_PRESENTER_ROUTE_PASS",
            confirmed: true,
            rerouteRequired: false,
            presenterMustRemainDominant: false,
            effectiveRoute: {
              presentationMode: routePresentationMode,
              frameOccupation: "FULL_FRAME_TAKEOVER",
              baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER",
              baseSubjectMustRemainVisible: false,
            },
            reason: pixelWindowMaster
              ? "PIXEL_WINDOW 作为完整画面母版；EVA 只负责正式字体包装，不替换画面美学。"
              : "canonical HERO_TAKEOVER 由 EVA 全屏正式字体承载，不保留人物叠加路线。",
          },
          safeZonePolicy: "FULL_FRAME_WITH_TITLE_SAFE",
        }
      : {
          ...structuredClone(context),
          presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER",
          baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
          baseSubjectMustRemainVisible: true,
          frameTakeoverAllowed: false,
          safeZonePolicy: "ACTUAL_FRAME_OPEN_REGION_REQUIRED",
        };
    const decision = {
      ...structuredClone(projectedDecision),
      semanticEvent: semanticEventByShot[shotId],
      typographyRole: A1_TYPOGRAPHY_ROLES.HERO_GENERATED_TYPE,
      presenterAvailable: presenterHero,
      presenterSemanticValue: presenterHero,
      presenterPackagingMode: presenterHero ? creatorDecision?.presenterPackagingMode || "PRESENTER_CUTOUT_COMPOSITE" : null,
      presenterPackagingRoute: presenterHero ? structuredClone(creatorDecision?.presenterPackagingRoute || null) : null,
      assemblyMode: routeAssemblyMode,
      presentationMode: routePresentationMode,
      frameOccupation: takeover ? "FULL_FRAME_TAKEOVER" : "OVERLAY",
      contentTreatment: routeContentTreatment,
      typographyTreatment: pixelWindowMaster ? "EVA_TYPOGRAPHY_ONLY" : (takeover ? "TYPOGRAPHY" : projectedDecision.typographyTreatment),
      presentationModeReason: takeover ? (pixelWindowMaster ? "像素窗口完整承载四步方法；EVA 只作为正式字体包装。" : "该标题语义由完整画面承载。") : "人物保留可信度；像素窗口进入真实负空间。",
      assemblyModeReason: takeover ? (pixelWindowMaster ? "像素窗口作为方法流程解释器，字体不替换画面母版。" : "标题作为完整画面的主导视觉 actor。") : "人物是信息主位，像素窗口在真实负空间中完成单一语义动作。",
      decisionHash: canonical.decisionSha256,
      canonicalDirectorAuthoritySha256: authority.authoritySha256,
      canonicalDirectorDecisionSha256: canonical.decisionSha256,
      canonicalVisualRoleRationale: canonical.rationale,
      displayProtectedPhrases: displayPhrasesByShot[shotId] || [],
    };
    const plan = buildPackageLookMasterPlan(decision, styleBrief, {
      now: stablePlanTimestamp,
      previousPlan: null,
      semanticBrief: oldPlan.semanticDesignBrief || null,
      referenceManifest,
      researchPacket: runtime.researchPackets?.find((item) => item.shotId === shotId) || null,
      sourceEvidenceInputs: oldPlan.sourceEvidenceInputs || [],
      videoContext: nextContext,
    });
    // The look-master builder historically normalized FULLSCREEN to its
    // renderer label.  The creator packaging control plane uses TYPOGRAPHY
    // as the assembly mode for a canonical hero takeover; keep both plans
    // hash-bound to that one route.
    plan.assemblyMode = decision.assemblyMode;
    plan.presentationMode = decision.presentationMode;
    plan.frameOccupation = decision.frameOccupation;
    plan.videoContext = {
      ...plan.videoContext,
      assemblyMode: decision.assemblyMode,
      presentationMode: decision.presentationMode,
      frameOccupation: nextContext.frameOccupation,
      contentTreatment: nextContext.contentTreatment,
    };
    plan.planSha256 = sha256(planIdentity(plan));
    plan.status = "CANONICAL_TITLE_REPAIR_READY";
    plan.canonicalRepair = {
      contract: "A1CanonicalTitleRepairPlanBinding/v1",
      authoritySha256: authority.authoritySha256,
      sourceRevisionHash: authority.sourceRevisionHash,
      canonicalDecisionSha256: canonical.decisionSha256,
      visualRole: role,
      formalTypographyStyleMode: titlePresentation.styleMode || A1_HERO_TITLE_STYLE_MODES.EVA_MECHANISM_CJK,
      formalTypographyGenerator: titlePresentation.imagegenHeroTitleRequired ? "IMAGEGEN" : null,
      primitiveId: primitiveByShot[shotId],
      presentationMode: expectedPresentationMode,
      takeoverDurationMs: shortTakeover ? 1600 : null,
      rationale: canonical.rationale,
      oldPlanSha256: supersededPlanSha256,
      oldCandidateSasRemainImmutable: true,
    };
    plan.visualPrimitiveSwitch = {
      contract: "A1VisualPrimitiveSwitch/v1",
      status: "CANONICAL_TITLE_REPAIR_PRIMITIVE",
      id: primitiveByShot[shotId],
      appliedAt: stablePrimitiveAppliedAt,
      reason: canonical.rationale,
    };
    plan.candidates = [];
    plan.recommendation = null;
    plan.selectedLookMasterId = null;
    plan.selectedLookMasterBinding = null;
    plan.reviewDecision = null;
    try {
      assertPackageLookMasterPlan(plan);
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}:${shotId}:context=${plan.videoContext?.presentationMode}:plan=${plan.presentationMode}`);
    }
    replacements.push({shotId, oldPlanSha256: supersededPlanSha256, plan});
  }

  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  if (preparedStyleBriefs.size) {
    next.production.packagingStyleBriefs = [
      ...(next.production.packagingStyleBriefs || []).filter((item) => !preparedStyleBriefs.has(item.sourceBeatIds?.[0])),
      ...preparedStyleBriefs.values(),
    ];
  }
  next.production.generation.automaticDispatchAllowed = true;
  next.production.generation.workerStatus = "frozen";
  nextRuntime.packageLookMasterPlanHistory = [
    ...(nextRuntime.packageLookMasterPlanHistory || []),
    ...oldPlans.filter((plan) => targetIds.includes(plan.shotId)).map((plan) => ({...plan, current: false, status: "HISTORY_READ_ONLY_SUPERSEDED_BY_CANONICAL_TITLE_REPAIR", authorityScope: "HISTORY_READ_ONLY"})),
  ];
  const replacementByShot = new Map(replacements.map((item) => [item.shotId, item.plan]));
  nextRuntime.packageLookMasterPlans = oldPlans.map((plan) => replacementByShot.get(plan.shotId) || plan);
  // Quarantine any current raw candidate that belongs to the superseded plan
  // for a canonical hero takeover.  Keep the bytes and audit history, but
  // make the old visual impossible to rediscover as a current EVA candidate.
  for (const replacement of replacements) {
    if (replacement.plan.canonicalRepair?.visualRole !== "HERO_TAKEOVER") continue;
    for (const raw of nextRuntime.lookMasterRawReferences || []) {
      if (raw.shotId !== replacement.shotId || raw.planSha256 === replacement.plan.planSha256 || raw.current !== true) continue;
      raw.current = false;
      raw.historyReadOnly = true;
      raw.selectionEligible = false;
      raw.recommendationEligible = false;
      raw.assemblyEligible = false;
      raw.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_CANONICAL_EVA_FULLSCREEN_STYLE";
      raw.supersededAt = preparedAt;
      raw.supersededByPlanSha256 = replacement.plan.planSha256;
    }
  }
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
  const updatedManifestBase = {
    ...structuredClone(targetManifest),
    checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
    sourceWorkspaceSha256: recalculated.workspaceSha256,
    generationDispatched: false,
    imageGenCalls: 0,
    boardRebuilt: false,
    assemblyStarted: false,
    generatedAt: new Date().toISOString(),
    entries: (targetManifest.entries || []).map((entry) => {
      const replacement = replacementByShot.get(entry.shotId);
      return replacement
        ? {
            ...entry,
            currentPlanSha256: replacement.planSha256,
            primitiveId: primitiveByShot[entry.shotId],
            canonicalRepairBinding: replacement.canonicalRepair,
            status: entry.generationAllowed === false ? "TARGET_REPAIR_BLOCKED_BY_AUTHORITY" : "TARGET_REPAIR_GENERATION_ELIGIBLE",
          }
        : entry;
    }),
  };
  const updatedManifest = {...updatedManifestBase, manifestSha256: sha256({...updatedManifestBase, manifestSha256: undefined})};
  nextRuntime.canonicalDirectorTargetRepairManifest = updatedManifest;
  // Keep the semantic-authority projection aligned with the canonical target
  // manifest in the same project transaction.  The plan-preparation step is
  // allowed to advance downstream plan bindings, but it must never leave the
  // workspace pointing at the previous manifest revision.
  next.production.semanticAuthorityConvergence = {
    ...(next.production.semanticAuthorityConvergence || {}),
    checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
    authoritySha256: authority.authoritySha256,
    sourceRevisionHash: authority.sourceRevisionHash,
    manifestSha256: updatedManifest.manifestSha256,
    targetRepairShotIds: updatedManifest.targetRepairShotIds,
    generationEligibleShotIds: updatedManifest.generationEligibleShotIds,
    generationAllowedByCanonicalAuthority: updatedManifest.generationEligibleShotIds.length > 0,
    generationDispatched: false,
    imageGenCalls: 0,
    boardRebuilt: false,
  };
  const refreshedBinding = buildCreatorPaletteShotBindingManifest(next, {now: preparedAt});
  // Plan preparation may intentionally expose a binding block while an old
  // incumbent candidate is being replaced (for example, ED-19's previous
  // overlay candidate must not be promoted into the EVA fullscreen route).
  // Persist the new plan and the blocked binding together; the fail-closed
  // lifecycle projection will keep generation and assembly frozen until a
  // current candidate satisfies the new style contract.
  next.production.creatorPaletteShotBindingManifest = refreshedBinding;
  const finalWorkspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
  const event = createProductionEvent({
    workspace: current,
    action: "canonical-title-repair-plans-prepared",
    targetId: targetIds.join(","),
    payload: {authoritySha256: authority.authoritySha256, sourceRevisionHash: authority.sourceRevisionHash, oldPlanSha256: replacements.map((item) => item.oldPlanSha256), newPlanSha256: replacements.map((item) => item.plan.planSha256), primitiveIds: targetIds.map((shotId) => primitiveByShot[shotId])},
  });
  finalWorkspace.production.eventLedger.eventCount += 1;
  finalWorkspace.production.eventLedger.lastEventId = event.eventId;
  finalWorkspace.production.eventLedger.lastEventAt = event.createdAt;
  const refreshed = refreshRepairManifestSidecar(finalWorkspace);
  finalWorkspace.production.incrementalRepairManifestAuthority = {
    ...(finalWorkspace.production.incrementalRepairManifestAuthority || {}),
    contract: "A1IncrementalRepairManifestAuthority/v1",
    status: "CURRENT",
    manifestSha256: refreshed.manifest.manifestSha256,
    manifestFileSha256: jsonFileSha256(refreshed.manifest),
    manifestFileShaAlgorithm: "SHA-256(UTF-8-JSON-BYTES)",
    currentRepairStatus: refreshed.manifest.status,
    packageCount: refreshed.manifest.summary.packageCount,
    noPackageCount: refreshed.manifest.summary.noPackageCount,
    readyForGenerationCount: refreshed.manifest.summary.readyForGenerationCount,
    artifactPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    publicPath: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    mirrorStatus: "IN_SYNC",
  };
  const persistedWorkspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(finalWorkspace));
  persistProjectState(appRoot, persistedWorkspace, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "semantic-authority-convergence-v1/target-repair-manifest.json": updatedManifest,
      "creator-packaging-palette-binding-v1/manifest.json": refreshedBinding,
      "incremental-repair-executor-v1/repair-manifest.json": refreshed.manifest,
      "semantic-authority-convergence-v1/canonical-title-repair-plan-preflight.json": {
        contract: "A1CanonicalTitleRepairPlanPreflight/v1",
        status: "PASS",
        authoritySha256: authority.authoritySha256,
        sourceRevisionHash: authority.sourceRevisionHash,
        manifestSha256: updatedManifest.manifestSha256,
        targetShotIds: targetIds,
        plans: replacements.map((item) => ({shotId: item.shotId, oldPlanSha256: item.oldPlanSha256, planSha256: item.plan.planSha256, visualRole: item.plan.canonicalRepair.visualRole, primitiveId: item.plan.canonicalRepair.primitiveId})),
      },
    },
  });
  return {workspace: persistedWorkspace, manifest: updatedManifest, replacements, alreadyCurrent: false, sidecarRefreshed: true, sidecarAlreadyMatches: false, sidecar: refreshed.manifest};
});

console.log(JSON.stringify({
  status: "PASS",
  checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
  workspaceSha256: result.workspace.workspaceSha256,
  authoritySha256: result.manifest.authoritySha256,
  manifestSha256: result.manifest.manifestSha256,
  targetShotIds: targetIds,
  plans: result.replacements.map((item) => ({shotId: item.shotId, oldPlanSha256: item.oldPlanSha256, planSha256: item.plan.planSha256, visualRole: item.plan.canonicalRepair.visualRole, primitiveId: item.plan.canonicalRepair.primitiveId})),
  queue: result.workspace.production.generation.summary,
  workerStatus: result.workspace.production.generation.workerStatus,
  assemblyCount: result.workspace.production.shotIntelligence.currentAssembly?.length || 0,
  assemblyCreationAllowed: false,
  alreadyCurrent: result.alreadyCurrent === true,
  sidecarRefreshed: result.sidecarRefreshed === true,
  sidecarAlreadyMatches: result.sidecarAlreadyMatches === true,
  sidecarManifestSha256: result.sidecar?.manifestSha256 || null,
}, null, 2));
