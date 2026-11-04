#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench, sha256Json} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const asset = current.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === "ED-01");
  if (!asset?.candidates?.[0]) throw new Error("ed01-candidate-required");
  const priorCandidate = structuredClone(asset.candidates[0]);
  const candidate = structuredClone(priorCandidate);
  candidate.candidateId = "ED-01-D05-V1";
  candidate.direction = "连续桌面实体字形：vibe coding 从显示器上沿起拍，完整的智能写作工作台沿麦克风臂方向压到桌面交点。";
  candidate.sceneGraph.presenterCompositionVariant = "desk-type-object-2";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "保留同一真实真人帧和真实工作台；不新增人物、背景或假界面。",
    "英文 vibe coding 仅作为显示器上缘的小型起点，不能悬在洞洞板或变成标题卡。",
    "中文必须保持一个连续、逐字准确的可编辑文本组“智能写作工作台”，从麦克风臂靠近桌面的交点起步，沿桌面透视线向右落下；不得拆成左右两个标题块。",
    "用单一实体字形的透视、像素挤压和印刷阴影建立物理重量；只在末字右侧保留一个贴合文本的短矩形落点，作为下一镜真实选区的形状交接。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {
    ...(candidate.sceneGraph.layoutSolution || {}),
    layoutRecipe: "presenter-diagonal-cut",
    compositionPrimitive: "presenter-object-bound-pixel-relay",
    score: 100.021,
  };
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes.map((node) => {
    if (node.id === "presenter-word-1") {
      return {
        ...node,
        geometry: {x: 0.79, y: 0.13, width: 0.2, height: 0.09},
        fontSize: 84,
        objectBinding: "real-footage-object:right-monitor-upper-edge",
        objectAnchor: "right-monitor-upper-edge",
        role: "presenter-object-bound-monitor-lock",
      };
    }
    if (node.id === "presenter-word-2") {
      const next = {...node};
      delete next.splitVisualActors;
      return {
        ...next,
        geometry: {x: 0.16, y: 0.67, width: 0.74, height: 0.22},
        fontSize: 144,
        objectBinding: "real-footage-object:microphone-arm-to-desk-plane",
        objectAnchor: "microphone-arm-to-desk-junction",
        role: "presenter-object-bound-continuous-desk-type",
      };
    }
    return node;
  });
  candidate.sceneGraph.motionPhrase = {
    ...(candidate.sceneGraph.motionPhrase || {}),
    intent: "vibe coding 先在显示器边缘锁定；完整的智能写作工作台随后沿麦克风臂方向压到真实桌面交点，末字矩形落点硬切下一镜真实选区。",
    visualVerb: "continuous-type-press-to-desk",
    entry: "monitor-edge-word-lock",
    transformation: "continuous-chinese-group-follows-mic-arm-to-desk-junction",
    resolve: "terminal-notch-hard-cuts-to-real-screen-selection",
  };
  candidate.sceneGraph.handoff = {
    ...(candidate.sceneGraph.handoff || {}),
    actor: "智能写作工作台",
    carryOut: "完整中文实体字组末字右缘的矩形落点硬切到下一镜真实正文选区边缘。",
    semanticBeat: "continuous-desk-type-hands-off-to-real-screen-selection",
  };
  candidate.sceneGraph.visualPrimitiveOverride = {
    ...(candidate.sceneGraph.visualPrimitiveOverride || {}),
    id: "presenter-object-bound-pixel-relay",
    applied: true,
    masterAnchorPolicy: "overridden-by-explicit-strategy-switch",
  };
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.candidateSha256 = sha256(candidate.sceneGraph);
  candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: []};
  candidate.createdAt = now;
  candidate.sourceAssetPackSha256 = current.library.assetPackSha256;

  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === asset.id);
  target.revisionHistory ||= [];
  target.revisionHistory.push({
    contract: "A1RejectedShotCandidateRound/v1",
    round: Number(target.visualRevision?.round || 1),
    strategyCycle: Number(target.visualStrategyCycle || 0),
    reason: "ed01-continuous-desk-type-refinement-v2",
    candidates: [priorCandidate],
    selectedCandidateId: target.selectedCandidateId || null,
    candidateRender: target.candidateRender || null,
    visualCritic: target.visualCritic || null,
    archivedAt: now,
  });
  target.candidates = [candidate];
  target.selectedCandidateId = null;
  target.visualCritic = null;
  target.candidateRender = null;
  target.bestEffectHeroFrame = null;
  target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 连续桌面实体字形候选已编译；上一轮 12/24 已归档，当前候选未自动采用。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {
    contract: "A1ShotCandidateSetAudit/v1",
    status: "STATIC_SCENE_GRAPH_PREFLIGHT",
    candidateCount: 1,
    structureDirectionCount: 3,
    distinctSilhouetteCount: 1,
    requiredDistinctSilhouetteCount: 1,
    visualPrimitiveId: "presenter-object-bound-pixel-relay",
    candidateId: candidate.candidateId,
    imageGenerationDispatched: false,
    renderDispatched: false,
    preflightAt: now,
  };
  target.visualRevision = {
    ...(target.visualRevision || {}),
    round: Number(target.visualRevision?.round || 1) + 1,
    strategySwitchId: "ed01-continuous-desk-type-v2",
    prompt: "连续可编辑实体字组：vibe coding 锁显示器上缘；智能写作工作台保持完整、不拆成两端，从麦克风臂交点沿桌面透视落下；末字右缘只留贴合文本的矩形交接点。",
    createdAt: now,
  };
  target.candidateBatch = {
    contract: "A1ShotCandidateBatch/v1",
    batchId: `ED-01-batch-continuous-desk-${sha256(candidate.candidateSha256).slice(0, 12)}`,
    scope: "single-shot",
    shotId: "ED-01",
    candidateIds: [candidate.candidateId],
    candidateCount: 1,
    sourceDependencySha256: candidate.sourceDependencySha256,
    batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}),
    previousBatchId: target.candidateBatch?.batchId || null,
    generatedAt: now,
    status: "ready-for-shot-review",
  };
  next.production.maturityLoop.shotReports["ED-01"] = null;
  next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives";
  recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]};
  recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  recalculated.production.visualDirector.generationFreeze = {
    ...(recalculated.production.visualDirector.generationFreeze || {}),
    frozen: true,
    status: "frozen",
    reason: "visual-anchor-static-refinement-required",
    scope: "explicit-anchor-static-refinement",
    imageGenerationAllowed: false,
    automaticDispatchAllowed: false,
    compositorReviewAllowed: true,
  };
  const hashInput = structuredClone(recalculated);
  delete hashInput.workspaceSha256;
  if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  recalculated.workspaceSha256 = sha256Json(hashInput);
  recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256;
  assertEditorialAssetWorkbench(recalculated);
  persistProjectState(appRoot, recalculated);
  return {workspaceSha256: recalculated.workspaceSha256, candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256};
});

console.log(JSON.stringify({status: "ED01_CONTINUOUS_DESK_TYPE_PREFLIGHT_READY", ...result}, null, 2));
