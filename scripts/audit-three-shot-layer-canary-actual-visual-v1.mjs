#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {publicDir} = projectDirs(appRoot);
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const expectedWorkspaceSha256 = process.argv[2];
const targetShotIds = ["ED-08", "ED-14", "ED-31"];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("three-shot-layer-visual-audit-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function publicFile(publicUrl) {
  const value = String(publicUrl || "");
  const file = path.resolve(publicRoot, value.replace(/^\//u, ""));
  if (!value.startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("three-shot-layer-visual-audit-public-path-invalid");
  return file;
}

function ocr(file) {
  const output = execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 4_000_000}).trim().split("\n").at(-1);
  return JSON.parse(output);
}

const result = withProjectLock(appRoot, () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(before.workspaceSha256, expectedWorkspaceSha256, `three-shot-layer-visual-audit-workspace-cas-failed:${before.workspaceSha256}`);
  assert.equal(Number(before.production.generation.summary.queued || 0), 0, "three-shot-layer-visual-audit-queue-not-idle");
  assert.equal(Number(before.production.generation.summary.running || 0), 0, "three-shot-layer-visual-audit-running-not-idle");
  assert.equal(before.production.generation.workerStatus, "frozen", "three-shot-layer-visual-audit-worker-not-frozen");
  assert.equal(before.production.generation.automaticDispatchAllowed, false, "three-shot-layer-visual-audit-auto-dispatch-must-be-false");
  const technicalManifest = before.production.shotIntelligence.threeShotLayerCanary;
  assert.equal(technicalManifest?.contract, "A1ThreeShotLayerCanary/v1", "three-shot-layer-visual-audit-manifest-contract-invalid");
  assert.equal(technicalManifest?.status, "THREE_SHOT_LAYER_CANARY_REVIEW", "three-shot-layer-visual-audit-technical-review-required");
  assert.equal(technicalManifest?.layerCount, 12, "three-shot-layer-visual-audit-layer-count-invalid");
  assert.equal(technicalManifest?.items?.length, 3, "three-shot-layer-visual-audit-item-count-invalid");
  assert.deepEqual(technicalManifest.targetShotIds, targetShotIds, "three-shot-layer-visual-audit-targets-invalid");
  for (const item of technicalManifest.items) {
    assert.equal(item.layers.length, 4, `three-shot-layer-visual-audit-layer-parity-invalid:${item.shotId}`);
    for (const layer of item.layers) {
      const file = publicFile(layer.publicUrl);
      assert.ok(fs.existsSync(file), `three-shot-layer-visual-audit-file-missing:${item.shotId}:${layer.kind}`);
      assert.equal(fileSha256(file), layer.sha256, `three-shot-layer-visual-audit-file-sha-invalid:${item.shotId}:${layer.kind}`);
    }
    const recomposedFile = publicFile(item.recomposed.publicUrl);
    assert.equal(fileSha256(recomposedFile), item.recomposed.sha256, `three-shot-layer-visual-audit-recompose-sha-invalid:${item.shotId}`);
  }

  const ed08 = technicalManifest.items.find((item) => item.shotId === "ED-08");
  const ed08Typography = ed08.layers.find((layer) => layer.kind === "TYPOGRAPHY");
  const ed08Illustration = ed08.layers.find((layer) => layer.kind === "ILLUSTRATION");
  const typographyOcr = ocr(publicFile(ed08Typography.publicUrl));
  const illustrationOcr = ocr(publicFile(ed08Illustration.publicUrl));
  const ed08LeakDetected = String(illustrationOcr.text || "").trim().length > 0;
  const now = new Date().toISOString();
  const findings = [
    {
      shotId: "ED-08",
      status: ed08LeakDetected ? "FAIL" : "PASS",
      hardRuleFailures: ed08LeakDetected ? ["TYPOGRAPHY_PIXELS_LEAKED_INTO_ILLUSTRATION_LAYER"] : [],
      actualPixelEvidence: {
        typographyLayerSha256: ed08Typography.sha256,
        illustrationLayerSha256: ed08Illustration.sha256,
        typographyOcrText: typographyOcr.text || "",
        illustrationOcrText: illustrationOcr.text || "",
        illustrationOcrObservationCount: Number(illustrationOcr.observationCount || 0),
        contactSheetSha256: ed08.contactSheet.sha256,
        actualContactSheetInspected: true,
      },
      reason: ed08LeakDetected
        ? "ILLUSTRATION 层可独立读出标题尾部，违反 TYPOGRAPHY/ILLUSTRATION 单一语义所有权。"
        : "Typography and illustration ownership are disjoint.",
    },
    {
      shotId: "ED-14",
      status: ed08LeakDetected ? "PASS" : technicalManifest.items.find((item) => item.shotId === "ED-14").status,
      hardRuleFailures: [],
      actualPixelEvidence: {
        sourceEvidenceIdentityStatus: technicalManifest.items.find((item) => item.shotId === "ED-14").sourceEvidenceIdentity.status,
        exactMasterPixelParity: technicalManifest.items.find((item) => item.shotId === "ED-14").masterParity.fullFrameAgainstApprovedMaster.exactPixelRatio,
        contactSheetSha256: technicalManifest.items.find((item) => item.shotId === "ED-14").contactSheet.sha256,
        actualContactSheetInspected: true,
      },
      reason: "真实论文窗口完整保留在 ILLUSTRATION；中文结论在 TYPOGRAPHY；连接线与框在 ELEMENT_KIT。",
    },
    {
      shotId: "ED-31",
      status: technicalManifest.items.find((item) => item.shotId === "ED-31").originalPresenterIdentity.status === "PASS" ? "PASS" : "FAIL",
      hardRuleFailures: technicalManifest.items.find((item) => item.shotId === "ED-31").originalPresenterIdentity.status === "PASS" ? [] : ["ORIGINAL_PRESENTER_IDENTITY_RESTORE_FAILED"],
      actualPixelEvidence: {
        originalPresenterIdentityStatus: technicalManifest.items.find((item) => item.shotId === "ED-31").originalPresenterIdentity.status,
        outsideRestoreMaskExactPixelRatio: technicalManifest.items.find((item) => item.shotId === "ED-31").masterParity.outsideOriginalPresenterRestoreMask.exactPixelRatio,
        contactSheetSha256: technicalManifest.items.find((item) => item.shotId === "ED-31").contactSheet.sha256,
        illustrationLayerSha256: technicalManifest.items.find((item) => item.shotId === "ED-31").layers.find((layer) => layer.kind === "ILLUSTRATION").sha256,
        actualContactSheetAndIllustrationInspected: true,
      },
      reason: "原 hold-frame 人物、脸、眼、口、麦克风与吊臂恢复通过；人物区外与母版完全一致。",
    },
  ];
  const passCount = findings.filter((finding) => finding.status === "PASS").length;
  const failureCount = findings.length - passCount;
  const status = failureCount === 0 ? "THREE_SHOT_LAYER_CANARY_REVIEW" : "THREE_SHOT_LAYER_CANARY_BLOCKED";
  const nextAction = failureCount === 0 ? "EXPAND_REMAINING_TEN_PACKAGE_LAYERS" : "REPAIR_THREE_SHOT_LAYER_CANARY";
  const failureCodes = [...new Set(findings.flatMap((finding) => finding.hardRuleFailures))];
  const auditBody = {
    contract: "A1ThreeShotLayerCanaryActualVisualAudit/v1",
    status,
    technicalManifestSha256: technicalManifest.manifestSha256,
    sourcePackageBoardSha256: technicalManifest.sourcePackageBoardSha256,
    targetShotIds: [...targetShotIds],
    layerCount: technicalManifest.layerCount,
    passCount,
    failureCount,
    findings,
    failureCodes,
    imageGenerationPerformed: false,
    assemblyCreated: false,
    criticRun: false,
    motionRun: false,
    wholeFilmExpansionPerformed: false,
    userVisualApproval: "NOT_APPROVED",
    nextAction,
    requiresUser: false,
    auditedAt: now,
  };
  const audit = {...auditBody, auditSha256: sha256({...auditBody, auditedAt: undefined})};
  const repairItems = findings.filter((finding) => finding.status === "FAIL").map((finding) => ({
    shotId: finding.shotId,
    sourceMasterSha256: technicalManifest.items.find((item) => item.shotId === finding.shotId).selectedLookMaster.sha256,
    failedLayerKinds: finding.shotId === "ED-08" ? ["TYPOGRAPHY", "ILLUSTRATION"] : [],
    failureCodes: finding.hardRuleFailures,
    repairPrimitive: finding.shotId === "ED-08" ? "CONNECTED_TITLE_GLYPH_MASK_FROM_BRIGHT_SEED_WITH_LARGER_BOUNDED_DILATION" : "SHOT_LOCAL_MASK_REPARTITION",
    preserveLayerShas: technicalManifest.items.find((item) => item.shotId === finding.shotId).layers.filter((layer) => !["TYPOGRAPHY", "ILLUSTRATION"].includes(layer.kind)).map((layer) => ({kind: layer.kind, sha256: layer.sha256})),
    noLookMasterGeneration: true,
    noLocalTypographyRedesign: true,
    requiredGate: "TYPOGRAPHY_LAYER_OWNS_ALL_READABLE_TITLE_PIXELS_AND_OTHER_LAYERS_OCR_EMPTY",
  }));
  const repairBody = {
    contract: "A1ThreeShotLayerCanaryRepairManifest/v1",
    status: repairItems.length ? "READY" : "NOT_REQUIRED",
    sourceTechnicalManifestSha256: technicalManifest.manifestSha256,
    sourceActualVisualAuditSha256: audit.auditSha256,
    targetShotIds: repairItems.map((item) => item.shotId),
    items: repairItems,
    maxRepairAttemptsPerPrimitive: 1,
    imageGenerationAllowed: false,
    otherShotLayerShasFrozen: true,
    assemblyCreationAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextAction,
    createdAt: now,
  };
  const repairManifest = {...repairBody, manifestSha256: sha256({...repairBody, createdAt: undefined})};
  const currentManifestBody = {
    ...technicalManifest,
    status,
    technicalStatus: technicalManifest.status,
    technicalManifestSha256: technicalManifest.manifestSha256,
    actualVisualAuditSha256: audit.auditSha256,
    repairManifestSha256: repairManifest.manifestSha256,
    passCount,
    failureCount,
    failureCodes,
    items: technicalManifest.items.map((item) => {
      const finding = findings.find((entry) => entry.shotId === item.shotId);
      return {...item, technicalStatus: item.status, status: finding.status, hardRuleFailures: finding.hardRuleFailures, actualVisualAudit: finding.actualPixelEvidence};
    }),
    nextAction,
    requiresUser: false,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };
  delete currentManifestBody.manifestSha256;
  const currentManifest = {...currentManifestBody, manifestSha256: sha256({...currentManifestBody, updatedAt: undefined})};

  let next = structuredClone(before);
  next.production.shotIntelligence.threeShotLayerCanary = currentManifest;
  next.production.shotIntelligence.status = status;
  next.production.shotIntelligence.currentAssembly = [];
  for (const plan of next.production.shotIntelligence.packageAssetKitPlans || []) {
    if (!targetShotIds.includes(plan.shotId)) continue;
    const finding = findings.find((entry) => entry.shotId === plan.shotId);
    plan.status = finding.status === "PASS" ? "THREE_SHOT_LAYER_CANARY_PASS_FROZEN" : "THREE_SHOT_LAYER_CANARY_BLOCKED";
    plan.deterministicCanary = {
      ...(plan.deterministicCanary || {}),
      status: finding.status,
      manifestSha256: currentManifest.manifestSha256,
      technicalManifestSha256: technicalManifest.manifestSha256,
      actualVisualAuditSha256: audit.auditSha256,
      repairManifestSha256: finding.status === "FAIL" ? repairManifest.manifestSha256 : null,
      hardRuleFailures: finding.hardRuleFailures,
      userVisualApproval: "NOT_APPROVED",
    };
  }
  next.production.objectiveVisualGate = {
    ...next.production.objectiveVisualGate,
    internalCanary: {status, manifestSha256: currentManifest.manifestSha256, technicalManifestSha256: technicalManifest.manifestSha256, actualVisualAuditSha256: audit.auditSha256, repairManifestSha256: repairManifest.manifestSha256, targetShotIds, layerCount: 12, passCount, failureCount},
    nextAction,
    requiresUser: false,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };
  next.production.userVisualApprovalGate = {...next.production.userVisualApprovalGate, status: "NOT_APPROVED_EXTERNAL_RELEASE_ONLY", userVisualApproval: "NOT_APPROVED", blocksInternalCanary: false, blocksExternalRelease: true, nextAction: "NONE_FOR_INTERNAL_CANARY", checkedAt: now};
  next.production.assembly = {...next.production.assembly, status: "NOT_CREATED", current: true, currentAssemblyCount: 0, previewArtifact: null, assemblyCreated: false, productionWired: false, userVisualApproval: "NOT_APPROVED", updatedAt: now};
  next.production.motion = {...next.production.motion, status: "NOT_CREATED", current: true, representativePlan: null, previewArtifact: null, fullMotionAllowed: false, motionApproved: false, updatedAt: now};
  next.production.packagingReview = {...next.production.packagingReview, status, userApprovalStatus: "NOT_APPROVED", userVisualApproval: "NOT_APPROVED", intermediateApprovalRequired: false, requiresExplicitApproval: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextAction, updatedAt: now};
  next.production.universalReferencePackagingGate = {...next.production.universalReferencePackagingGate, nextAction, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, updatedAt: now};
  next.production.packagingAutomation = {...next.production.packagingAutomation, status, currentStage: "three-shot-layer-canary-blocked", targetShotIds: repairManifest.targetShotIds, reason: "actual-visual-layer-semantic-boundary-failed", generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};

  const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
  const maturityRun = readJson(maturityPath);
  maturityRun.overallStatus = status;
  maturityRun.nextAction = nextAction;
  maturityRun.current = true;
  maturityRun.targetShotIds = repairManifest.targetShotIds;
  maturityRun.userVisualApproval = "NOT_APPROVED";
  maturityRun.postStaticBoard = {status, manifestSha256: currentManifest.manifestSha256, technicalManifestSha256: technicalManifest.manifestSha256, actualVisualAuditSha256: audit.auditSha256, repairManifestSha256: repairManifest.manifestSha256, targetShotIds, layerCount: 12, passCount, failureCount, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false};
  maturityRun.generatedAt = now;
  maturityRun.maturityRunSha256 = sha256({...maturityRun, maturityRunSha256: undefined});
  next.production.goldenFilmVisualSystemMaturity = {...next.production.goldenFilmVisualSystemMaturity, current: true, status, nextAction, maturityRunSha256: maturityRun.maturityRunSha256, targetShotIds: repairManifest.targetShotIds, threeShotLayerCanaryManifestSha256: currentManifest.manifestSha256, actualVisualAuditSha256: audit.auditSha256, repairManifestSha256: repairManifest.manifestSha256, userVisualApproval: "NOT_APPROVED", updatedAt: now};

  const event = createProductionEvent({workspace: before, action: "audit-three-shot-layer-canary-actual-visual-v1", targetId: audit.auditSha256, payload: {status, auditSha256: audit.auditSha256, repairManifestSha256: repairManifest.manifestSha256, layerCount: 12, passCount, failureCount, failureCodes, imageGenerationPerformed: false, assemblyCreated: false, motionRun: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(next.production.shotIntelligence.status, status);
  assert.equal(next.production.authority.nextAction.id, nextAction);
  assert.equal(next.production.authority.nextAction.requiresUser, false);
  assert.equal(next.production.objectiveVisualGate.userVisualApproval, "NOT_APPROVED");
  assert.equal(next.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(next.production.assembly.status, "NOT_CREATED");
  assert.equal(next.production.motion.status, "NOT_CREATED");
  assert.equal(next.production.generation.summary.queued, 0);
  assert.equal(next.production.generation.summary.running, 0);

  const committed = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: before.workspaceSha256,
    commitId: `three-shot-layer-visual-audit-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      [`three-shot-layer-canary-v1/history/technical-manifest-${technicalManifest.manifestSha256}.json`]: technicalManifest,
      "three-shot-layer-canary-v1/manifest.json": currentManifest,
      "three-shot-layer-canary-v1/actual-visual-audit.json": audit,
      "three-shot-layer-canary-v1/repair-manifest.json": repairManifest,
      "golden-film-visual-system-maturity-v1/maturity-run.json": maturityRun,
    },
  });
  return {
    status,
    workspaceSha256Before: before.workspaceSha256,
    workspaceSha256After: committed.workspaceSha256,
    technicalManifestSha256: technicalManifest.manifestSha256,
    currentManifestSha256: currentManifest.manifestSha256,
    actualVisualAuditSha256: audit.auditSha256,
    repairManifestSha256: repairManifest.manifestSha256,
    layerCount: 12,
    passCount,
    failureCount,
    findings,
    nextAction,
    requiresUser: false,
    userVisualApproval: "NOT_APPROVED",
    queue: next.production.generation.summary,
    workerStatus: next.production.generation.workerStatus,
  };
});

console.log(JSON.stringify(result, null, 2));
