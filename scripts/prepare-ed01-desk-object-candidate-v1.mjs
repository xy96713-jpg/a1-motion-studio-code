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
  if (!asset?.candidates?.[0]) throw new Error("ed01-current-candidate-required");

  const base = structuredClone(asset.candidates[0]);
  const candidate = structuredClone(base);
  candidate.candidateId = "ED-01-D04-V1";
  candidate.direction = "桌面实体字形：英文锁在显示器边缘，中文同组词级演员从麦克风底座落到真实桌面，去掉所有装饰连线。";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.presenterCompositionVariant = "desk-type-object-1";
  candidate.sceneGraph.layoutSolution = {
    ...(candidate.sceneGraph.layoutSolution || {}),
    layoutRecipe: "presenter-counterweight",
    compositionPrimitive: "presenter-object-bound-pixel-relay",
    score: 100.017,
  };
  candidate.sceneGraph.solverDirection = [
    "保留同一真实人物帧、眼睛嘴部和真实工作台，不增加任何新素材。",
    "英文 vibe coding 缩小为显示器上缘的单一锁点；删除蓝绿连线、方框和独立像素装饰。",
    "中文保持一个完整可编辑文本组，但内部由“智能写作”和“工作台”两个词级演员组成：前者压在麦克风臂结束处，后者以更大的实体字形坐到桌面右侧。",
    "用透视、挤压和多层印刷阴影建立桌面实体感，文字不能变成底条、卡片或悬浮标签。",
  ].join("\n");
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes
    .filter((node) => node.id !== "object-relay-rail")
    .map((node) => {
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
        return {
          ...node,
          geometry: {x: 0.04, y: 0.67, width: 0.9, height: 0.22},
          fontSize: 106,
          objectBinding: "real-footage-object:microphone-arm-to-desk-plane",
          objectAnchor: "microphone-arm-to-desk-plane",
          role: "presenter-object-bound-desk-type-group",
          splitVisualActors: [
            {text: "智能写作", className: "split-actor-1", objectBinding: "real-footage-object:microphone-arm-to-left-desk-edge"},
            {text: "工作台", className: "split-actor-2", objectBinding: "real-footage-object:desk-plane-to-monitor-junction"},
          ],
        };
      }
      return node;
    });
  candidate.sceneGraph.motionPhrase = {
    ...(candidate.sceneGraph.motionPhrase || {}),
    intent: "vibe coding 先在显示器边缘锁定；同一可编辑中文组随后由麦克风底座压到桌面，工作台字形成为下一镜真实正文选区的视觉落点。",
    visualVerb: "materialize-on-real-desk-plane",
    entry: "monitor-edge-word-lock",
    transformation: "word-group-presses-from-mic-base-to-desk-plane",
    resolve: "hard-cut-to-real-screen-selection",
  };
  candidate.sceneGraph.handoff = {
    ...(candidate.sceneGraph.handoff || {}),
    actor: "工作台",
    carryOut: "工作台末字的桌面落点硬切到下一镜真实正文选区边缘；不带出装饰线或假界面。",
    semanticBeat: "desk-type-hands-off-to-real-screen-selection",
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
  target.candidates = [candidate];
  target.selectedCandidateId = null;
  target.visualCritic = null;
  target.candidateRender = null;
  target.bestEffectHeroFrame = null;
  target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 桌面实体字形候选已编译；未自动采用，等待一次受控静态审片。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
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
    strategySwitchId: "ed01-desk-type-object-v1",
    prompt: "保留真人与真实画面；英文锁显示器上缘；中文保持完整可编辑文本组，内部由智能写作与工作台两个词级演员压到麦克风/桌面物件，删除所有装饰连线与独立方框。",
    createdAt: now,
  };
  target.candidateBatch = {
    contract: "A1ShotCandidateBatch/v1",
    batchId: `ED-01-batch-desk-type-${sha256(candidate.candidateSha256).slice(0, 12)}`,
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
  next.production.visualDirector.generationFreeze = {
    ...(next.production.visualDirector.generationFreeze || {}),
    frozen: true,
    status: "frozen",
    reason: "visual-anchor-static-refinement-required",
    scope: "explicit-anchor-static-refinement",
    imageGenerationAllowed: false,
    automaticDispatchAllowed: false,
    compositorReviewAllowed: true,
  };
  next.production.generation.automaticDispatchAllowed = false;
  next.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives";
  next.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]};
  next.production.nextAction = next.production.authority.nextAction.label;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives";
  recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]};
  recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  const hashInput = structuredClone(recalculated);
  delete hashInput.workspaceSha256;
  if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  recalculated.workspaceSha256 = sha256Json(hashInput);
  recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256;
  assertEditorialAssetWorkbench(recalculated);
  persistProjectState(appRoot, recalculated);
  return {workspaceSha256: recalculated.workspaceSha256, candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256, sourceDependencySha256: candidate.sourceDependencySha256};
});

console.log(JSON.stringify({status: "ED01_DESK_OBJECT_PREFLIGHT_READY", ...result}, null, 2));
