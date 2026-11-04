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
  candidate.candidateId = "ED-01-D18-V1";
  candidate.direction = "终点卡榫表面版：vibe coding 锁定显示器；智能写作压在麦克风臂上，工作台向屏桌交界收紧，并由自身末端边缘形成可继承的像素选区卡榫。";
  candidate.sceneGraph.presenterCompositionVariant = "surface-path-object-15";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "保持两个词级演员为同一可编辑短语组；工作台向真实屏桌交界收紧，不再悬在右下空区。",
    "选区卡榫附着于工作台自身的纸面字块边缘，作为下一镜真实正文选中痕迹的形态提示，不独立成层。",
    "奶油纸面＋单次钴蓝错版保持复古编辑材质，禁止额外连线、HUD、箭头和第三焦点。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {...(candidate.sceneGraph.layoutSolution || {}), layoutRecipe: "presenter-diagonal-cut", compositionPrimitive: "presenter-object-bound-pixel-relay", score: 100.122};
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes.map((node) => {
    if (node.id === "primary") return {...node, mediaScale: 1.2, focalPoint: "58% 37%", objectBinding: "real-presenter-object-relay"};
    if (node.id === "presenter-word-1") return {...node, geometry: {x: 0.84, y: 0.15, width: 0.15, height: 0.08}, fontSize: 68, objectBinding: "real-footage-object:right-monitor-screen", objectAnchor: "right-monitor-screen", role: "presenter-object-bound-screen-native-lock"};
    if (node.id === "presenter-word-2") return {...node, geometry: {x: 0.1, y: 0.6, width: 0.82, height: 0.25}, fontSize: 122, objectBinding: "real-footage-object:microphone-arm-to-monitor-desk-junction", objectAnchor: "monitor-desk-junction", role: "presenter-object-bound-terminal-bracket-surface", splitVisualActors: [
      {text: "智能写作", className: "split-actor-1", objectBinding: "real-footage-object:silver-microphone-arm-plane"},
      {text: "工作台", className: "split-actor-2", objectBinding: "real-footage-object:monitor-desk-junction"},
    ]};
    return node;
  });
  candidate.sceneGraph.motionPhrase = {...(candidate.sceneGraph.motionPhrase || {}), intent: "vibe coding 锁入显示器内侧；智能写作压入银色麦克风臂，工作台向屏桌交界收紧并由末端卡榫硬切下一镜真实选区。", visualVerb: "pressed-terminal-bracket-handoff", entry: "monitor-screen-native-lock", transformation: "mic-arm-paper-imprint-to-tight-monitor-desk-junction", resolve: "hard-cut-to-real-screen-selection"};
  candidate.sceneGraph.handoff = {...(candidate.sceneGraph.handoff || {}), actor: "工作台", carryOut: "工作台自身末端的像素卡榫作为硬切前唯一终点，下一镜由同形正文选区承接。", semanticBeat: "terminal-bracket-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-object-bound-pixel-relay", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.candidateSha256 = sha256(candidate.sceneGraph); candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: [], visualEvidence: "待同渲染审片", repairBrief: "D18 为本镜最后一次定向变体；若仍低于 22，保留最佳版本并停止微调。"};
  candidate.createdAt = now; candidate.sourceAssetPackSha256 = current.library.assetPackSha256;
  const next = structuredClone(current); const target = next.library.assets.find((item) => item.id === asset.id); target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-terminal-bracket-surface-refinement-v15", candidates: [prior], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate]; target.selectedCandidateId = null; target.visualCritic = null; target.candidateRender = null; target.bestEffectHeroFrame = null; target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 D18 终点卡榫表面候选已编译；D17 稳定 20/24 已归档。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-object-bound-pixel-relay", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-terminal-bracket-surface-v15", prompt: "工作台向屏桌交界收紧，卡榫附着自身纸面边缘；禁止独立装饰和多余焦点。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-terminal-bracket-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
  delete next.production.maturityLoop.shotReports["ED-01"]; next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now); recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives"; recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]}; recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  recalculated.production.visualDirector.generationFreeze = {...(recalculated.production.visualDirector.generationFreeze || {}), frozen: true, status: "frozen", reason: "visual-anchor-static-refinement-required", scope: "explicit-anchor-static-refinement", imageGenerationAllowed: false, automaticDispatchAllowed: false, compositorReviewAllowed: true};
  const hashInput = structuredClone(recalculated); delete hashInput.workspaceSha256; if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null; recalculated.workspaceSha256 = sha256Json(hashInput); recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256; assertEditorialAssetWorkbench(recalculated); persistProjectState(appRoot, recalculated);
  return {workspaceSha256: recalculated.workspaceSha256, candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256};
});
console.log(JSON.stringify({status: "ED01_TERMINAL_BRACKET_PREFLIGHT_READY", ...result}, null, 2));
