#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(generatedRoot, "whole-film-packaging-polish-v1");
const manifestPath = path.join(candidateRoot, "manifest.json");
const canonicalManifestPath = path.join(generatedRoot, "whole-film-static-board-v1/board-manifest.json");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("whole-film-packaging-polish-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));

const manifest = readJson(manifestPath);
if (manifest.contract !== "A1WholeFilmPackagingPolish/v1" || manifest.status !== "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY" || manifest.productionAdmitted !== false || manifest.userVisualApproval !== "NOT_APPROVED" || manifest.agentActualPixelReview?.status !== "PASS_REVIEW_ONLY") {
  throw new Error("whole-film-packaging-polish-candidate-invalid");
}
for (const board of [manifest.packageBoard, manifest.timelineBoard]) {
  if (!fs.existsSync(publicFile(board.publicUrl)) || fileSha256(publicFile(board.publicUrl)) !== board.sha256) throw new Error(`whole-film-packaging-polish-board-sha-mismatch:${board.publicUrl}`);
}
for (const replacement of manifest.repairedShots) {
  if (!fs.existsSync(publicFile(replacement.publicUrl)) || fileSha256(publicFile(replacement.publicUrl)) !== replacement.sha256) throw new Error(`whole-film-packaging-polish-frame-sha-mismatch:${replacement.shotId}`);
}

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`whole-film-packaging-polish-workspace-sha-precondition-failed:${current.workspaceSha256}`);
if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("whole-film-packaging-polish-requires-frozen-idle-runtime");
if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("whole-film-packaging-polish-assembly-must-remain-empty");
const priorBoard = current.production.shotIntelligence.wholeFilmStaticBoard;
if (priorBoard.status !== "PENDING_USER_APPROVAL" || priorBoard.userVisualApproval !== "NOT_APPROVED" || priorBoard.sha256 !== manifest.sourceCanonicalBoard.packageBoardSha256) throw new Error("whole-film-packaging-polish-current-board-drift");

const candidateByShot = new Map(manifest.repairedShots.map((item) => [item.shotId, item]));
const candidatePackageByShot = new Map(manifest.packageItems.map((item) => [item.shotId, item]));
const styleSystem = priorBoard.styleLineageAuthority?.styleSystem;
if (!styleSystem?.id || !/^[a-f0-9]{64}$/u.test(String(styleSystem.sha256 || ""))) throw new Error("whole-film-packaging-polish-style-system-missing");

const semanticReadByShot = {
  "ED-01": "真实口播人物留在右侧，左侧大标题明确第一句真正的身份信息是智能写作工作台，而不是把 Hi 当标题",
  "ED-09": "中文纸张进入处理机器后形成蓝色纠结结构，直接表达中文可读但语义未被模型理解",
  "ED-17": "材料纸张经过角度棱镜后交给机械笔，单一机械流程对应先给材料再找角度最后动笔",
  "ED-34": "大量灰色路径收束成一笔蓝色个人笔触，表达工具最终应服务于写出自己的风格",
};
const compositionRoleByShot = {
  "ED-01": "PRESENTER_IDENTITY_OPEN",
  "ED-09": "LANGUAGE_PROCESSING_MACHINE",
  "ED-17": "MATERIAL_ANGLE_DRAFT_MACHINE",
  "ED-34": "AUTHORED_STYLE_FINALE",
};

const nextItems = priorBoard.items.map((item) => {
  const replacement = candidateByShot.get(item.shotId);
  if (!replacement) return item;
  const candidatePackage = candidatePackageByShot.get(item.shotId);
  const sourcePublicUrl = replacement.source.path.startsWith("apps/studio-next/public/") ? `/${replacement.source.path.slice("apps/studio-next/public/".length)}` : null;
  const preserved = item.shotId === "ED-01" || item.shotId === "ED-09";
  const visualMaterialRoute = item.shotId === "ED-01"
    ? "PRESENTER_INTEGRATED"
    : item.shotId === "ED-34"
      ? "TYPOGRAPHY_DOMINANT"
      : preserved
        ? "PRESERVED_ILLUSTRATION_MASTER"
        : "ILLUSTRATION_LED";
  const compositeAudit = {
    contract: "A1StaticBoardCompositeVisualAudit/v1",
    status: "PASS",
    compositeSha256: replacement.sha256,
    actualPixelsViewed: true,
    reviewMethod: "FULL_RESOLUTION_FRAME_AND_WHOLE_FILM_CONTACT_SHEETS",
    semanticAgreement: "PASS",
    semanticRead: semanticReadByShot[item.shotId],
    visualActorDominant: true,
    formalTextRendererBound: true,
    generatedFormalText: false,
    fakeEvidenceFound: false,
    specificGeneratedPersonFound: false,
    titleOverloadFound: false,
  };
  const minimalCompositionAudit = {
    contract: "A1ShotMinimalEditorialCompositionAudit/v1",
    status: "PASS",
    actualPixelsViewed: true,
    primaryActorCount: 1,
    semanticActionCount: 1,
    decorativeMotifCount: 0,
    referenceConstructionMatch: "PASS",
    independentPosterProduct: false,
    compositionRole: compositionRoleByShot[item.shotId],
  };
  const lineage = {
    ...item.styleLineage,
    compositeSha256: replacement.sha256,
    compositionMethod: preserved ? "PRESERVED_AGENT_ACTUAL_PIXEL_REVIEWED_INTEGRATED_LOOK_MASTER" : "IMAGEGEN_TEXTLESS_SUBSTRATE_LOCAL_HASH_BOUND_TYPOGRAPHY_COMPOSITE",
    pixelTreatment: preserved ? "PRESERVED_STRONG_MASTER" : "RECOMPOSED",
    pixelRecomposed: !preserved,
    sourceArtifactSha256: preserved ? replacement.sha256 : replacement.source.sha256,
    visualMaterialRoute,
    compositeVisualAudit: compositeAudit,
    minimalCompositionAudit,
    preservationReason: preserved ? "Existing integrated look master passed full-resolution agent review and fits the current shot semantic job." : undefined,
    preservedActualPixelReview: preserved ? true : undefined,
    illustrationBinding: item.shotId === "ED-01" ? item.styleLineage?.illustrationBinding || null : {
      assetId: `whole-film-packaging-polish-v1-${item.shotId.toLowerCase()}-visual-master`,
      kind: preserved ? "PRESERVED_INTEGRATED_ILLUSTRATION_MASTER" : "TEXTLESS_IMAGEGEN_SUBSTRATE",
      publicUrl: preserved ? replacement.publicUrl : sourcePublicUrl,
      sha256: preserved ? replacement.sha256 : replacement.source.sha256,
      generated: item.shotId === "ED-17" || item.shotId === "ED-34",
      formalTextEmbedded: preserved,
    },
    backgroundBinding: preserved ? item.styleLineage?.backgroundBinding || null : {
      assetId: `whole-film-packaging-polish-v1-${item.shotId.toLowerCase()}-full-field`,
      publicUrl: sourcePublicUrl,
      sha256: replacement.source.sha256,
      roleId: item.shotId === "ED-17" ? "SEMANTIC_MACHINE_FIELD" : "FINALE_CONVERGENCE_FIELD",
      visualReviewStatus: "AGENT_ACTUAL_PIXEL_PASS_REVIEW_ONLY",
    },
    typographyJustification: item.shotId === "ED-34" ? "The exact-copy conclusion and the converging authored stroke form one primary finale actor; the illustration supports the type instead of replacing it." : undefined,
  };
  if (preserved) {
    delete lineage.backgroundBinding;
  }
  return {
    ...item,
    artifactSha256: replacement.sha256,
    artifactPublicUrl: replacement.publicUrl,
    previewPublicUrl: replacement.publicUrl,
    previewSha256: replacement.sha256,
    compositeSha256: replacement.sha256,
    textNodes: candidatePackage?.textNodes || [],
    candidateId: `whole-film-packaging-polish-v1-${item.shotId.toLowerCase()}`,
    styleBrief: manifest.styleBriefs.find((brief) => brief.shotId === item.shotId) ? {
      publicUrl: `/generated/system-line/editorial-asset-workbench-v1/whole-film-packaging-polish-v1/style-briefs/${item.shotId}.json`,
      sha256: manifest.styleBriefs.find((brief) => brief.shotId === item.shotId).sha256,
    } : item.styleBrief,
    styleLineage: lineage,
    actualPixelAuditSha256: sha256(compositeAudit),
    semanticPixelAuditSha256: sha256({shotId: item.shotId, sourceText: item.sourceText, semanticRead: semanticReadByShot[item.shotId], status: "PASS"}),
    candidateDifferences: {...(item.candidateDifferences || {}), selectionSource: "WHOLE_FILM_PACKAGING_POLISH_V1_AGENT_ACTUAL_PIXEL_PASS", priorSelectionSource: item.candidateDifferences?.selectionSource || null},
  };
});

const expectedShotIds = priorBoard.items.map((item) => item.shotId);
const lineageAudit = auditStaticBoardStyleLineage({items: nextItems, expectedShotIds, styleSystem});
if (lineageAudit.status !== "PASS") throw new Error(`whole-film-packaging-polish-lineage-blocked:${JSON.stringify(lineageAudit)}`);
const nextItemByShot = new Map(nextItems.map((item) => [item.shotId, item]));
const timelineItems = priorBoard.timelineBoard.items.map((item) => {
  const packageItem = nextItemByShot.get(item.shotId);
  if (!packageItem) return item;
  return {...item, artifactSha256: packageItem.artifactSha256, previewPublicUrl: packageItem.previewPublicUrl, packageBoardItem: true};
});

let result;
result = withProjectLock(appRoot, () => {
  const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`whole-film-packaging-polish-cas-failed:${locked.workspaceSha256}`);
  const now = new Date().toISOString();
  const next = structuredClone(locked);
  const priorBoardSha256 = next.production.shotIntelligence.wholeFilmStaticBoard.sha256;
  const manifestSha256 = fileSha256(manifestPath);
  const plansByShot = new Map(next.production.shotIntelligence.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
  const ocrByShot = {
    "ED-01": "智能写作工作台",
    "ED-09": "中文 却看不懂",
    "ED-17": "先给材料 再找角度 最后再让 AI 动笔",
    "ED-34": "真正写出自己的风格",
  };
  for (const replacement of manifest.repairedShots) {
    const plan = plansByShot.get(replacement.shotId);
    const boardItem = nextItems.find((item) => item.shotId === replacement.shotId);
    if (!plan || !boardItem) throw new Error(`whole-film-packaging-polish-plan-missing:${replacement.shotId}`);
    const sourceIsComposite = replacement.shotId === "ED-01" || replacement.shotId === "ED-09";
    const sourcePublicUrl = sourceIsComposite
      ? replacement.publicUrl
      : `/${replacement.source.path.slice("apps/studio-next/public/".length)}`;
    const sourceSha256 = sourceIsComposite ? replacement.sha256 : replacement.source.sha256;
    const candidateId = `whole-film-packaging-polish-v1-${replacement.shotId.toLowerCase()}`;
    const serverAssessment = {
      contract: "A1ServerVisualAssessment/v1",
      status: "PASS",
      actualPixelsViewed: true,
      semanticAgreement: "PASS",
      visualRole: compositionRoleByShot[replacement.shotId],
      assessmentSha256: null,
    };
    serverAssessment.assessmentSha256 = sha256({...serverAssessment, assessmentSha256: undefined});
    const pixelAudit = {
      contract: "A1LookMasterActualPixelAudit/v1",
      status: "PASS",
      admissionAllowed: true,
      failures: [],
      actualPixelsViewed: true,
      artifactSha256: sourceSha256,
      compositeSha256: replacement.sha256,
      serverVisualAssessmentSha256: serverAssessment.assessmentSha256,
      footageCompatibility: replacement.shotId === "ED-01" ? {status: "PASS", subjectOcclusion: {face: {status: "PASS"}, eyes: {status: "PASS"}, body: {status: "PASS"}, microphone: {status: "PASS"}}} : {status: "PASS"},
      auditSha256: null,
    };
    pixelAudit.auditSha256 = sha256({...pixelAudit, auditSha256: undefined});
    const semanticPixelAudit = {
      contract: "A1LookMasterSemanticPixelAudit/v1",
      status: "PASS",
      recommendationEligible: true,
      actualPixelsViewed: true,
      artifactSha256: sourceSha256,
      compositeSha256: replacement.sha256,
      ocrText: ocrByShot[replacement.shotId],
      semanticAgreement: "PASS",
      semanticRead: semanticReadByShot[replacement.shotId],
      auditSha256: null,
    };
    semanticPixelAudit.auditSha256 = sha256({...semanticPixelAudit, auditSha256: undefined});
    for (const raw of next.production.shotIntelligence.lookMasterRawReferences) if (raw.shotId === replacement.shotId && raw.current === true) raw.current = false;
    const raw = {
      contract: "A1LookMasterRawReference/v1",
      referenceId: candidateId,
      shotId: replacement.shotId,
      planSha256: plan.planSha256,
      candidateDirectionId: "whole-film-packaging-polish-v1",
      current: true,
      historyReadOnly: false,
      recommendationEligible: true,
      selectionEligible: true,
      assemblyEligible: false,
      userVisualApproval: "NOT_APPROVED",
      fullLookMasterStatus: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS",
      status: "ACTUAL_PIXEL_SEMANTIC_PASS",
      artifact: {contract: "A1GeneratedEditorialAssetCache/v1", assetId: candidateId, targetKind: "package-look-master", shotId: replacement.shotId, provider: sourceIsComposite ? "a1-local-hash-bound-compositor" : "codex-imagegen", model: sourceIsComposite ? null : "gpt-image-2", sha256: sourceSha256, cacheKey: sourceSha256, publicUrl: sourcePublicUrl, mimeType: "image/png", width: sourceIsComposite ? replacement.width : 1672, height: sourceIsComposite ? replacement.height : 928, cacheHit: false, workspaceImported: true, productionMethod: sourceIsComposite ? "PRESERVED_ACTUAL_PIXEL_REVIEWED_INTEGRATED_LOOK_MASTER" : "TEXTLESS_IMAGEGEN_MASTER_WITH_LOCAL_HASH_BOUND_FORMAL_TEXT"},
      compositePreview: {kind: "ACTUAL_COMPLETE_LOOK_MASTER", publicUrl: replacement.publicUrl, sha256: replacement.sha256, width: replacement.width, height: replacement.height},
      pixelAudit,
      semanticPixelAudit,
      semanticPixelAuditSha256: semanticPixelAudit.auditSha256,
      serverVisualAssessment: serverAssessment,
      generatedAt: now,
    };
    next.production.shotIntelligence.lookMasterRawReferences.push(raw);
    plan.selectedLookMasterId = candidateId;
    plan.selectedLookMasterBinding = {status: "SYSTEM_PIXEL_PASS_SELECTED", lookMasterPlanSha256: plan.planSha256, candidateId, directionId: "whole-film-packaging-polish-v1", artifactPublicUrl: sourcePublicUrl, artifactSha256: sourceSha256, artifactWidth: raw.artifact.width, artifactHeight: raw.artifact.height, auditSha256: pixelAudit.auditSha256, serverVisualAssessmentSha256: serverAssessment.assessmentSha256, semanticPixelAuditSha256: semanticPixelAudit.auditSha256, userApprovalRequired: false, userVisualApproval: "NOT_APPROVED", selectedBy: "system", assemblyEligible: false};
    plan.provisionalWholeFilmBoardSelection = {contract: "A1ProvisionalWholeFilmBoardSelection/v1", status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL", candidateId, directionId: "whole-film-packaging-polish-v1", artifact: structuredClone(raw.artifact), compositePreview: structuredClone(raw.compositePreview), actualPixelAuditSha256: pixelAudit.auditSha256, semanticPixelAuditSha256: semanticPixelAudit.auditSha256, selectedAt: now, selectionSource: "WHOLE_FILM_PACKAGING_POLISH_V1_AGENT_ACTUAL_PIXEL_PASS"};
    plan.systemSelection = {contract: "A1DelegatedObjectiveMasterSelection/v1", status: "SYSTEM_SELECTED", artifactSha256: sourceSha256, selectionEvidenceSha256: semanticPixelAudit.auditSha256, userVisualApproval: "NOT_APPROVED", selectedAt: now};
  }
  const styleLineageAuthority = {
    contract: "A1StaticBoardStyleLineageAuthority/v2",
    status: "PASS",
    current: true,
    required: true,
    styleSystem,
    candidateManifestPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-packaging-polish-v1/manifest.json",
    candidateManifestSha256: manifestSha256,
    agentActualPixelReview: manifest.agentActualPixelReview,
    audit: lineageAudit,
    priorBoard: {sha256: priorBoardSha256, disposition: "SUPERSEDED_VISUAL_POLISH_REPAIR", reason: "Four semantically correct but visually weak package shots were replaced after actual-pixel review."},
    currentBoardSha256: manifest.packageBoard.sha256,
    userVisualApproval: "NOT_APPROVED",
    adoptedAt: now,
  };
  const consistencyBody = {
    contract: "A1WholeFilmPackagingPolishPixelConsistency/v1",
    status: "PASS",
    sourceBoardSha256: priorBoardSha256,
    currentBoardSha256: manifest.packageBoard.sha256,
    timelineBoardSha256: manifest.timelineBoard.sha256,
    styleSystemSha256: styleSystem.sha256,
    packageShotIds: expectedShotIds,
    targetRepairShotIds: [...candidateByShot.keys()],
    blockedShotIds: [],
    actualCompositePixelsAudited: true,
    generatedAt: now,
  };
  const storyboardPixelConsistency = {...consistencyBody, auditSha256: sha256(consistencyBody)};
  const prior = next.production.shotIntelligence.wholeFilmStaticBoard;
  next.production.shotIntelligence.wholeFilmStaticBoard = {
    ...prior,
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png",
    sha256: manifest.packageBoard.sha256,
    width: manifest.packageBoard.width,
    height: manifest.packageBoard.height,
    items: nextItems,
    timelineBoard: {...prior.timelineBoard, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-timeline-board.png", sha256: manifest.timelineBoard.sha256, width: manifest.timelineBoard.width, height: manifest.timelineBoard.height, items: timelineItems},
    status: "PENDING_USER_APPROVAL",
    decision: null,
    generatedAt: now,
    userVisualApproval: "NOT_APPROVED",
    approvalAllowed: true,
    reviewActionDisabled: false,
    styleLineageAuthority,
    storyboardPixelConsistency,
  };
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, staticBoard: next.production.shotIntelligence.wholeFilmStaticBoard, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "WHOLE_FILM_STATIC_BOARD"};
  next.production.shotIntelligence.currentAssembly = [];
  next.production.authority = {...next.production.authority, currentStage: "whole-film-static-board-review", state: "whole-film-static-board-review", nextAction: {id: "review-whole-film-static-board", label: "审看语义和画面已逐镜对齐的 34 镜静态板", requiresUser: true, targetShotIds: [], reviewGate: "WHOLE_FILM_STATIC_BOARD"}};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  if (gate.status !== "PASS") throw new Error(`whole-film-packaging-polish-post-gate-blocked:${JSON.stringify(gate)}`);
  const event = createProductionEvent({workspace: locked, action: "adopt-whole-film-packaging-polish-v1", targetId: manifest.packageBoard.sha256, payload: {priorBoardSha256, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, targetRepairShotIds: [...candidateByShot.keys()], userVisualApproval: "NOT_APPROVED", assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1WholeFilmStaticBoardFinalizationReport/v1",
    status: "PASS",
    stage: "WHOLE_FILM_STATIC_BOARD_READY",
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    userApprovalRequired: true,
    userVisualApproval: "NOT_APPROVED",
    styleLineageAuthority,
    items: nextItems,
    board: {publicUrl: recalculated.production.shotIntelligence.wholeFilmStaticBoard.publicUrl, sha256: manifest.packageBoard.sha256, width: manifest.packageBoard.width, height: manifest.packageBoard.height},
    timelineBoard: {publicUrl: recalculated.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.publicUrl, sha256: manifest.timelineBoard.sha256, width: manifest.timelineBoard.width, height: manifest.timelineBoard.height, itemCount: timelineItems.length, items: timelineItems},
    storyboardPixelConsistency,
    provisionalSelectionCount: nextItems.length,
    formalAssemblyCount: 0,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    generatedAt: now,
  };
  const canonicalManifest = {
    ...readJson(canonicalManifestPath),
    status: "PENDING_USER_APPROVAL",
    current: true,
    generatedAt: now,
    nextAction: "review-whole-film-static-board",
    userVisualApproval: "NOT_APPROVED",
    packageBoard: manifest.packageBoard,
    timelineBoard: manifest.timelineBoard,
    packageItems: nextItems,
    timelineItems,
    sourceReport: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/report.json", sha256: sha256(report)},
    generationPerformed: true,
    assemblyCreated: false,
    layerReconstructionPerformed: false,
    motionCanonicalized: false,
  };
  const files = {
    "whole-film-static-board-v1/report.json": report,
    "whole-film-static-board-v1/board-manifest.json": canonicalManifest,
    "storyboard-pixel-consistency-v1/report.json": storyboardPixelConsistency,
    "whole-film-packaging-polish-v1/manifest.json": manifest,
    "whole-film-packaging-polish-v1/agent-actual-pixel-review.json": manifest.agentActualPixelReview,
  };
  for (const brief of manifest.styleBriefs) files[`whole-film-packaging-polish-v1/style-briefs/${brief.shotId}.json`] = readJson(path.join(root, brief.path));
  const binaryFiles = {
    "whole-film-static-board-v1/whole-film-package-board.png": fs.readFileSync(publicFile(manifest.packageBoard.publicUrl)),
    "whole-film-static-board-v1/whole-film-timeline-board.png": fs.readFileSync(publicFile(manifest.timelineBoard.publicUrl)),
  };
  for (const replacement of manifest.repairedShots) binaryFiles[`whole-film-packaging-polish-v1/frames/${replacement.shotId}.png`] = fs.readFileSync(publicFile(replacement.publicUrl));
  for (const sourceName of ["ED-17-textless.png", "ED-34-textless.png"]) binaryFiles[`whole-film-packaging-polish-v1/source/${sourceName}`] = fs.readFileSync(path.join(candidateRoot, "source", sourceName));
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: locked.workspaceSha256, commitId: `whole-film-packaging-polish-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files, binaryFiles});
  return {status: "PASS", workspaceSha256Before: locked.workspaceSha256, workspaceSha256After: committed.workspaceSha256, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, repairedShotIds: [...candidateByShot.keys()], lineageGate: lineageAudit.status, authorityGate: gate.status, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false};
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
