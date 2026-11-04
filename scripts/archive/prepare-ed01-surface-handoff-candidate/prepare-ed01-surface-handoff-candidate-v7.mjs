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
  const prior = asset?.candidates?.[0];
  if (!asset || !prior) throw new Error("ed01-candidate-required");

  const candidate = structuredClone(prior);
  candidate.candidateId = "ED-01-D10-V1";
  candidate.direction = "连续表面接力版：vibe coding 锁定显示器，智能写作沿银色麦克风臂起步，经一个像素接棒点落到黑色桌面上的工作台。";
  candidate.sceneGraph.presenterCompositionVariant = "surface-path-object-7";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "只保留真实显示器、银色麦克风臂和黑色桌面三处对象锚点；中文仍是一个可编辑文本组。",
    "智能写作缩窄并沿麦克风臂斜率起步；中间只有一个绑定到麦克风臂—桌面交界的像素接棒点；工作台沿桌面透视压低并作为下一镜硬切终点。",
    "接棒点是同一可编辑表面路径的语义节点，不是 HUD、连线、卡片或独立装饰。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {...(candidate.sceneGraph.layoutSolution || {}), layoutRecipe: "presenter-diagonal-cut", compositionPrimitive: "presenter-object-bound-pixel-relay", score: 100.041};
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes.map((node) => {
    if (node.id === "presenter-word-1") return {...node, geometry: {x: 0.86, y: 0.17, width: 0.13, height: 0.075}, fontSize: 68, objectBinding: "real-footage-object:right-monitor-screen", objectAnchor: "right-monitor-screen", role: "presenter-object-bound-screen-native-lock"};
    if (node.id === "presenter-word-2") return {...node, geometry: {x: 0.12, y: 0.61, width: 0.86, height: 0.27}, fontSize: 122, objectBinding: "real-footage-object:microphone-arm-to-desk-plane", objectAnchor: "microphone-arm-to-desk-junction", role: "presenter-object-bound-continuous-surface-handoff", splitVisualActors: [
      {text: "智能写作", className: "split-actor-1", objectBinding: "real-footage-object:silver-microphone-arm-plane"},
      {text: "", className: "handoff-notch", objectBinding: "real-footage-object:microphone-arm-to-desk-junction"},
      {text: "工作台", className: "split-actor-2", objectBinding: "real-footage-object:black-desk-plane"},
    ]};
    return node;
  });
  candidate.sceneGraph.motionPhrase = {...(candidate.sceneGraph.motionPhrase || {}), intent: "vibe coding 锁入显示器黑面；智能写作沿银色麦克风臂逐字点亮，经交界像素接棒后在黑色桌面组装工作台，硬切下一镜真实选区。", visualVerb: "surface-to-surface-word-handoff", entry: "monitor-screen-native-lock", transformation: "silver-mic-arm-plane-through-junction-to-black-desk-plane", resolve: "hard-cut-to-real-screen-selection"};
  candidate.sceneGraph.handoff = {...(candidate.sceneGraph.handoff || {}), actor: "工作台", carryOut: "工作台在黑色桌面上的最终落点作为硬切前唯一终点；交界像素接棒不独立成层。", semanticBeat: "surface-path-terminal-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-object-bound-pixel-relay", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.candidateSha256 = sha256(candidate.sceneGraph);
  candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: [], visualEvidence: "待同渲染审片", repairBrief: "如仍低于 22，仅允许一次方向级修正，不做无穷 CSS 微调。"};
  candidate.createdAt = now;
  candidate.sourceAssetPackSha256 = current.library.assetPackSha256;

  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === asset.id);
  target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-surface-handoff-refinement-v7", candidates: [prior], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate];
  target.selectedCandidateId = null;
  target.visualCritic = null;
  target.candidateRender = null;
  target.bestEffectHeroFrame = null;
  target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 D10 连续表面接力候选已编译；D09 的 20/24 单样本已归档。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-object-bound-pixel-relay", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-surface-handoff-v7", prompt: "完整短语保持可编辑；智能写作绑定银色麦克风臂，经过单一交界像素接棒落到黑色桌面工作台，禁止 HUD、卡片、连线。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-surface-handoff-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
  next.production.maturityLoop.shotReports["ED-01"] = null;
  next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives";
  recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]};
  recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  recalculated.production.visualDirector.generationFreeze = {...(recalculated.production.visualDirector.generationFreeze || {}), frozen: true, status: "frozen", reason: "visual-anchor-static-refinement-required", scope: "explicit-anchor-static-refinement", imageGenerationAllowed: false, automaticDispatchAllowed: false, compositorReviewAllowed: true};
  const hashInput = structuredClone(recalculated); delete hashInput.workspaceSha256; if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  recalculated.workspaceSha256 = sha256Json(hashInput); recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256;
  assertEditorialAssetWorkbench(recalculated); persistProjectState(appRoot, recalculated);
  return {workspaceSha256: recalculated.workspaceSha256, candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256};
});

console.log(JSON.stringify({status: "ED01_SURFACE_HANDOFF_PREFLIGHT_READY", ...result}, null, 2));
