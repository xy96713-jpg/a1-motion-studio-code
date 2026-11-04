#!/usr/bin/env node

import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {syncCurrentAuthorityMirrors} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line");
const workbenchArtifactRoot = path.join(artifactRoot, "editorial-asset-workbench-v1");
const workbenchPublicRoot = path.join(publicRoot, "editorial-asset-workbench-v1");
const authorityArtifactRoot = path.join(artifactRoot, "system-line-current-authority-v2");
const authorityPublicRoot = path.join(publicRoot, "system-line-current-authority-v2");
const currentPhasePath = path.join(artifactRoot, "current-phase.json");
const workspacePublicPath = path.join(workbenchPublicRoot, "workspace.json");
const workspaceArtifactPath = path.join(workbenchArtifactRoot, "workspace.json");
const transitionPublicPath = path.join(workbenchPublicRoot, "transition-receipt.json");

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const writeJsonAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};

if (!fs.existsSync(workspacePublicPath) || !fs.existsSync(workspaceArtifactPath)) {
  throw new Error("editorial-workbench-workspace-public-artifact-pair-required");
}
if (sha256(workspacePublicPath) !== sha256(workspaceArtifactPath)) {
  throw new Error("editorial-workbench-workspace-public-artifact-mismatch");
}

const workspace = readJson(workspacePublicPath);
if (workspace.contract !== "A1EditorialAssetWorkbench/v2") throw new Error("editorial-workbench-v2-required");
if (workspace.production?.project?.contract !== "A1VisualDirectorProject/v1") throw new Error("visual-director-project-v1-required");
if (workspace.visualBible?.visualGenerationPolicy?.contract !== "A1EditorialVisualGenerationPolicy/v1") throw new Error("locked-visual-generation-policy-required");
if (workspace.production?.authority?.contract !== "A1ProductionAuthority/v1") throw new Error("production-authority-v1-required");

const establishedCurrentPhase = fs.existsSync(currentPhasePath) ? readJson(currentPhasePath) : null;
if (establishedCurrentPhase?.contract === "A1SystemLineCurrentPhase/v2"
  && establishedCurrentPhase.phaseId === "editorial-asset-workbench-v1"
  && establishedCurrentPhase.authority?.kind === "visual-director-workbench") {
  const transition = fs.existsSync(transitionPublicPath) ? readJson(transitionPublicPath) : null;
  syncCurrentAuthorityMirrors(path.join(root, "apps/studio-next"), workspace, transition);
  console.log(JSON.stringify({
    status: workspace.status,
    currentStage: workspace.production.authority.currentStage,
    nextAction: workspace.production.authority.nextAction?.id || null,
    workspaceSha256: workspace.workspaceSha256,
    unifiedProjection: true,
  }, null, 2));
  process.exit(0);
}

if (workspace.production?.articleAssetProductionAuthority?.contract === "A1ArticleAssetProductionAuthority/v1" && workspace.production.articleAssetProductionAuthority.current === true) {
  const transition = fs.existsSync(transitionPublicPath) ? readJson(transitionPublicPath) : null;
  syncCurrentAuthorityMirrors(path.join(root, "apps/studio-next"), workspace, transition);
  console.log(JSON.stringify({
    status: workspace.production.articleAssetProductionAuthority.status,
    currentStage: workspace.production.authority.currentStage,
    nextAction: workspace.production.authority.nextAction?.id || null,
    requestPackSha256: workspace.production.articleAssetProductionAuthority.authorization?.requestPackSha256 || null,
    imageGenerationPerformed: false,
  }, null, 2));
  process.exit(0);
}

const previousPhase = fs.existsSync(currentPhasePath) ? readJson(currentPhasePath) : null;
const previousPhaseSha256 = fs.existsSync(currentPhasePath) ? sha256(currentPhasePath) : null;
const workbenchAlreadyAuthoritative = previousPhase?.contract === "A1SystemLineCurrentPhase/v2"
  && previousPhase?.phaseId === "editorial-asset-workbench-v1"
  && previousPhase?.authority?.kind === "visual-director-workbench";
const legacyAuthority = {
  id: previousPhase?.phaseId || "unknown-legacy-authority",
  status: "HISTORY_READ_ONLY",
  previousCurrentPhaseSha256: previousPhaseSha256,
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  historicalPage: "/system-line-review?history=1",
  reason: "Replaced by the user-approved single 34-shot Visual Director Workbench production line.",
};
const legacyAuthorities = workbenchAlreadyAuthoritative
  ? previousPhase.legacyAuthorities || []
  : [legacyAuthority];
const ed01 = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-01");
const operationShot = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.candidates?.some((candidate) => candidate.sceneGraph?.operationTraceBinding));
const ed01CandidatesReady = Boolean(
  ed01
  && ed01.candidates?.length >= 4
  && ed01.candidates.length <= 8
  && ed01.candidates.every((candidate) => candidate.sceneGraph?.visualPolicy?.sha256 === workspace.visualBible.visualGenerationPolicy.sha256)
  && ed01.candidateRender?.contact?.publicUrl
  && ed01.candidateSetAudit?.status === "PASS"
);
const ed01VisualReviewReady = Boolean(
  ed01CandidatesReady
  && ed01.visualCritic?.verdict === "PASS"
  && ed01.visualCritic?.totalScore >= 22
  && ed01.visualCritic?.referenceMaturity === true
  && ed01.visualCritic?.selectedCandidateId
);
const causalMotionProofReady = workspace.production?.motion?.previewArtifact?.contract === "A1CausalMotionProofArtifact/v1"
  && workspace.production.motion.previewArtifact.reviewOnly === true
  && workspace.production.motion.status === "review-only-causal-proof-ready";
const resolveLayoutHandoff = workspace.production?.resolveLayoutHandoffs?.["ED-01"] || null;
const resolveLayoutHandoffReady = resolveLayoutHandoff?.contract === "A1ResolveLayoutHandoff/v1"
  && resolveLayoutHandoff.status === "layout-ready-mask-pending"
  && resolveLayoutHandoff.reviewOnly === true
  && resolveLayoutHandoff.candidateAdoptionAllowed === false
  && resolveLayoutHandoff.finalRenderAllowed === false;
const recommended = operationShot
  ? {
      id: "review-operation-causal-states-and-motion-proof",
      label: `审看 ${operationShot.shotDemand.shotId} 的真实选中、候选、回填三态与 causal motion proof`,
      requiresExplicitApproval: true,
      riskTags: ["operation-triptych", "real-source-only", "review-only", "no-candidate-adoption", "no-full-render"],
    }
  : resolveLayoutHandoffReady
  ? {
      id: "review-ed01-resolve-layout-handoff",
      label: "审核 ED-01 排版、前后透明字层与 DaVinci 手工遮罩指导",
      requiresExplicitApproval: true,
      riskTags: ["single-shot-layout-only", "manual-resolve-mask", "no-resolve-project-mutation", "no-candidate-adoption", "no-full-render"],
    }
  : causalMotionProofReady
  ? {
      id: "review-ed01-ed02-causal-motion-proof",
      label: "审看 ED-01 露脸包装到 ED-02 真实操作的 5.52 秒因果动效证明",
      requiresExplicitApproval: true,
      riskTags: ["two-shot-review-only", "causal-motion-proof", "no-candidate-adoption", "no-full-render"],
    }
  : ed01VisualReviewReady
  ? {
      id: "review-ed-01-policy-locked-candidates",
      label: "在 4311 逐镜审片台确认或返修 ED-01",
      requiresExplicitApproval: true,
      riskTags: ["single-shot-only", "static-review", "user-decision-required", "no-motion", "no-full-render"],
    }
  : ed01CandidatesReady
    ? {
        id: "revise-ed-01-to-reference-maturity",
        label: `继续返修 ED-01 至 ≥22/24；当前 ${ed01.visualCritic?.totalScore ?? "未审"}/24`,
        requiresExplicitApproval: false,
        riskTags: ["single-shot-only", "visual-revision", "no-user-selection", "no-motion", "no-full-render"],
      }
  : {
      id: "build-review-ed-01-policy-locked-candidates",
      label: "生成并审核 ED-01 的 4–6 个新策略候选",
      requiresExplicitApproval: false,
      riskTags: ["single-shot-only", "static-review", "no-motion", "no-full-render"],
    };
const authoritativeRecommended = {
  id: workspace.production.authority.nextAction.id,
  label: workspace.production.authority.nextAction.label,
  requiresExplicitApproval: workspace.production.authority.nextAction.requiresUser,
  targetShotIds: workspace.production.authority.nextAction.targetShotIds,
  riskTags: ["single-authoritative-route", workspace.production.authority.currentStage, "no-bypass", "no-full-render"],
};

const now = new Date().toISOString();
const authorityStatus = workspace.production?.release?.final1080p?.status === "complete"
  && workspace.production?.release?.davinciPackage?.status === "complete"
  ? "DELIVERY_COMPLETE"
  : workspace.production?.release?.review540p?.status === "ready-for-review"
    ? workspace.production?.release?.visualQualityReview?.status === "passed"
      ? "FINAL_RELEASE_DECISION_REQUIRED"
      : "AUTOMATIC_VISUAL_QC_REQUIRED"
    : workspace.gates?.acceptedShotIrAllowed === true
      ? "ACTIVE_AUTOMATIC_PRODUCTION"
      : "ACTIVE_REVIEW_GATED";
const currentPhase = {
  contract: "A1SystemLineCurrentPhase/v2",
  generatedAt: now,
  phaseId: "editorial-asset-workbench-v1",
  status: authorityStatus,
  authority: {
    kind: "visual-director-workbench",
    projectId: workspace.production.project.projectId,
    projectContract: workspace.production.project.contract,
    workspaceContract: workspace.contract,
    workspacePath: rel(workspacePublicPath),
    workspaceSha256: workspace.workspaceSha256,
    workspaceFileSha256: sha256(workspacePublicPath),
    pageUrl: "/system-line-visual-workbench",
    policyContract: workspace.visualBible.visualGenerationPolicy.contract,
    policySha256: workspace.visualBible.visualGenerationPolicy.sha256,
    productionAuthorityContract: workspace.production.authority.contract,
    productionAuthoritySha256: workspace.production.authority.sha256,
    state: workspace.production.authority.currentStage,
  },
  reviewDecision: {
    status: workspace.production.designCalibrationBatch?.status || workspace.production.authority.currentStage,
    userVisualApproval: "PENDING",
    intermediateApprovalRequired: false,
    requiresExplicitApproval: workspace.production.authority.nextAction.requiresUser === true,
    acceptedShotIrAllowed: workspace.gates.acceptedShotIrAllowed === true,
    motionPrototypeAllowed: workspace.gates.motionPrototypeAllowed === true,
    finalRenderAllowed: workspace.gates.finalRenderAllowed === true,
    resolveExportAllowed: workspace.gates.finalRenderAllowed === true,
    resolveLayoutExportAvailable: resolveLayoutHandoffReady,
  },
  legacyAuthorities,
  next: {
    recommended: authoritativeRecommended,
  },
};

const report = {
  contract: "A1SystemLineCurrentAuthority/v2",
  phaseId: "system-line-current-authority-v2",
  status: authorityStatus,
  generatedAt: now,
  singleProductionEntry: "/system-line-visual-workbench",
  authority: currentPhase.authority,
  productionState: {
    projectStatus: workspace.production.project.status,
    currentStage: workspace.production.project.currentStage,
    shotCount: workspace.article.shotCount,
    candidateCount: workspace.library.assets
      .filter((asset) => asset.route === "shot-composition")
      .reduce((sum, asset) => sum + (asset.candidates?.length || 0), 0),
    selectedCount: workspace.library.assets
      .filter((asset) => asset.route === "shot-composition" && asset.selectedCandidateId).length,
    nextAction: workspace.production.authority.nextAction.id,
  },
  gates: workspace.gates,
  legacyAuthorities: currentPhase.legacyAuthorities,
  userApprovalStatus: "PENDING",
  rendererAdoptionAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  resolveLayoutExportAvailable: resolveLayoutHandoffReady,
};

if (previousPhase && !workbenchAlreadyAuthoritative) {
  const legacySnapshot = path.join(artifactRoot, "legacy-authorities", `${legacyAuthority.id}-${previousPhaseSha256?.slice(0, 12) || "unknown"}.json`);
  if (!fs.existsSync(legacySnapshot)) writeJsonAtomic(legacySnapshot, previousPhase);
}
writeJsonAtomic(currentPhasePath, currentPhase);
writeJsonAtomic(path.join(authorityArtifactRoot, "report.json"), report);
writeJsonAtomic(path.join(authorityPublicRoot, "report.json"), report);

console.log(JSON.stringify({
  status: report.status,
  currentPhase: rel(currentPhasePath),
  authorityReport: rel(path.join(authorityPublicRoot, "report.json")),
  workspaceSha256: workspace.workspaceSha256,
  policySha256: workspace.visualBible.visualGenerationPolicy.sha256,
  legacyAuthorities: legacyAuthorities.map((item) => item.id),
  nextAction: currentPhase.next.recommended.id,
}, null, 2));
