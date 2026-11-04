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
  candidate.candidateId = "ED-01-D14-V1";
  candidate.direction = "连续逐字路径版：vibe coding 锁定显示器；完整中文短语作为一个可编辑字形路径，从麦克风臂逐字收窄，在桌面前缘展开并完成交接。";
  candidate.sceneGraph.presenterCompositionVariant = "surface-path-object-11";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "完整短语“智能写作工作台”保持同一个可编辑文字演员，不再拆成两个标题块；每个字绑定到真实对象段并沿同一阅读路径排序。",
    "前四字沿银色麦克风臂逐字收窄，后三字沿黑色桌面前缘透视展开；物件之间的空间跳跃承担接力，不画独立连接线。",
    "vibe coding 只作右侧显示器边缘的安静启动信号；人物脸部、真实材料和负空间保持优先。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {...(candidate.sceneGraph.layoutSolution || {}), layoutRecipe: "presenter-diagonal-cut", compositionPrimitive: "presenter-object-bound-pixel-relay", score: 100.082};
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes.map((node) => {
    if (node.id === "presenter-word-1") return {...node, geometry: {x: 0.85, y: 0.16, width: 0.15, height: 0.08}, fontSize: 68, objectBinding: "real-footage-object:right-monitor-screen", objectAnchor: "right-monitor-screen", role: "presenter-object-bound-screen-native-lock"};
    if (node.id === "presenter-word-2") return {...node, geometry: {x: 0.06, y: 0.53, width: 0.9, height: 0.36}, fontSize: 122, objectBinding: "real-footage-object:microphone-arm-to-desk-plane", objectAnchor: "microphone-arm-to-desk-junction", role: "presenter-object-bound-continuous-glyph-path", splitVisualActors: [{
      text: "智能写作工作台",
      className: "path-actor",
      objectBinding: "real-footage-object:microphone-arm-to-desk-plane",
      glyphBindings: [
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:black-desk-plane",
        "real-footage-object:black-desk-plane",
        "real-footage-object:black-desk-plane",
      ],
      characterPath: [
        {x: .02, y: .45, scale: .66, rotate: -24},
        {x: .08, y: .35, scale: .61, rotate: -23},
        {x: .14, y: .25, scale: .56, rotate: -22},
        {x: .20, y: .15, scale: .51, rotate: -21},
        {x: .69, y: .58, scale: .72, rotate: -5},
        {x: .76, y: .53, scale: .78, rotate: -5},
        {x: .83, y: .48, scale: .84, rotate: -5},
      ],
    }]};
    return node;
  });
  candidate.sceneGraph.motionPhrase = {...(candidate.sceneGraph.motionPhrase || {}), intent: "vibe coding 锁入显示器黑面；完整中文短语沿同一可编辑字形路径逐字从银色麦克风臂收窄，在黑色桌面前缘展开并硬切下一镜真实选区。", visualVerb: "continuous-glyph-surface-handoff", entry: "monitor-screen-native-lock", transformation: "per-glyph-mic-arm-to-desk-path", resolve: "hard-cut-to-real-screen-selection"};
  candidate.sceneGraph.handoff = {...(candidate.sceneGraph.handoff || {}), actor: "工作台", carryOut: "同一中文路径的末三个字在黑色桌面前缘完成唯一终点，作为硬切前交接，不添加额外图形。", semanticBeat: "continuous-glyph-terminal-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-object-bound-pixel-relay", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.candidateSha256 = sha256(candidate.sceneGraph); candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: [], visualEvidence: "待同渲染审片", repairBrief: "若仍未达到 22，停止本镜静态微调，保留阻塞证据。"};
  candidate.createdAt = now; candidate.sourceAssetPackSha256 = current.library.assetPackSha256;

  const next = structuredClone(current); const target = next.library.assets.find((item) => item.id === asset.id); target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-continuous-glyph-path-refinement-v11", candidates: [prior], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate]; target.selectedCandidateId = null; target.visualCritic = null; target.candidateRender = null; target.bestEffectHeroFrame = null; target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 D14 连续逐字路径候选已编译；D12 稳定中位数 21/24 已归档。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-object-bound-pixel-relay", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-continuous-glyph-path-v11", prompt: "完整中文作为一个可编辑逐字路径，从麦克风臂收窄到桌面前缘展开；不加连接线、卡片或独立装饰。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-glyph-path-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
  delete next.production.maturityLoop.shotReports["ED-01"]; next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now); recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives"; recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]}; recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  recalculated.production.visualDirector.generationFreeze = {...(recalculated.production.visualDirector.generationFreeze || {}), frozen: true, status: "frozen", reason: "visual-anchor-static-refinement-required", scope: "explicit-anchor-static-refinement", imageGenerationAllowed: false, automaticDispatchAllowed: false, compositorReviewAllowed: true};
  const hashInput = structuredClone(recalculated); delete hashInput.workspaceSha256; if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null; recalculated.workspaceSha256 = sha256Json(hashInput); recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256; assertEditorialAssetWorkbench(recalculated); persistProjectState(appRoot, recalculated);
  return {workspaceSha256: recalculated.workspaceSha256, candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256};
});
console.log(JSON.stringify({status: "ED01_CONTINUOUS_GLYPH_PATH_PREFLIGHT_READY", ...result}, null, 2));
