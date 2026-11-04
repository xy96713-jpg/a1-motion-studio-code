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
  candidate.candidateId = "ED-01-D28-V1";
  candidate.direction = "真实屏幕轨道版：把真人源帧稍微拉回，让右侧黑屏和桌面终点可见；英文锁在黑屏内侧，完整中文像素字带沿银色麦克风臂上扬，在屏幕底缘转平并落到屏桌交界。";
  candidate.sceneGraph.presenterCompositionVariant = "surface-path-object-20";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "真实人物仍是最大主体，保留房间与麦克风的可核对材质，不用生成式背景替身。",
    "英文只做屏幕内侧的微型启动锁点；中文是一条可编辑、同字形同套印的连续字带，沿麦克风臂形成真实斜坡，再在屏幕底缘转平。",
    "把裁切从 D16 的过紧状态拉回一档，让屏幕黑面和桌面交界成为可见终点；不添加卡片、箭头、下划线或独立装饰。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {...(candidate.sceneGraph.layoutSolution || {}), layoutRecipe: "presenter-diagonal-cut", compositionPrimitive: "presenter-object-bound-pixel-relay", score: 100.205};
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes.map((node) => {
    if (node.id === "primary") return {...node, mediaScale: 1.08, focalPoint: "55% 39%", objectBinding: "real-presenter-object-relay"};
    if (node.id === "presenter-word-1") return {...node, geometry: {x: 0.835, y: 0.235, width: 0.145, height: 0.075}, fontSize: 60, objectBinding: "real-footage-object:right-monitor-screen", objectAnchor: "right-monitor-screen", role: "presenter-object-bound-screen-native-lock"};
    if (node.id === "presenter-word-2") return {...node, geometry: {x: 0.08, y: 0.82, width: 0.9, height: 0.18}, fontSize: 122, objectBinding: "real-footage-object:microphone-arm-to-monitor-desk-junction", objectAnchor: "monitor-desk-junction", role: "presenter-object-bound-monitor-rail-relay", splitVisualActors: [{
      text: "智能写作工作台",
      className: "path-actor",
      pathMode: "flow",
      objectBinding: "real-footage-object:microphone-arm-to-monitor-desk-junction",
      glyphBindings: [
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:monitor-bottom-edge",
        "real-footage-object:monitor-desk-junction",
        "real-footage-object:monitor-desk-junction",
      ],
      characterPath: [
        {y: 0, scale: 0.80, rotate: -19},
        {y: -0.10, scale: 0.80, rotate: -17},
        {y: -0.20, scale: 0.82, rotate: -15},
        {y: -0.30, scale: 0.83, rotate: -12},
        {y: -0.26, scale: 0.84, rotate: -7},
        {y: -0.20, scale: 0.86, rotate: -4},
        {y: -0.15, scale: 0.88, rotate: -3},
      ],
    }]};
    return node;
  });
  candidate.sceneGraph.motionPhrase = {...(candidate.sceneGraph.motionPhrase || {}), intent: "vibe coding 锁入右侧黑屏内侧；中文像素字带沿麦克风臂上扬，经屏幕底缘转平，在屏桌交界压实后硬切下一镜真实选区。", visualVerb: "monitor-rail-flow-handoff", entry: "monitor-screen-native-lock", transformation: "silver-mic-arm-to-monitor-bottom-edge-to-desk-junction", resolve: "hard-cut-to-real-screen-selection"};
  candidate.sceneGraph.handoff = {...(candidate.sceneGraph.handoff || {}), actor: "工作台", carryOut: "工作台作为同一字带的末端在屏桌交界停驻，硬切前不再新增图形。", semanticBeat: "monitor-rail-terminal-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-object-bound-pixel-relay", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.candidateSha256 = sha256(candidate.sceneGraph);
  candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: [], visualEvidence: "待同渲染审片", repairBrief: "若低于 22/24，恢复 D16；不再继续增加字带微调。"};
  candidate.createdAt = now;
  candidate.sourceAssetPackSha256 = current.library.assetPackSha256;

  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === asset.id);
  target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-monitor-rail-flow-relay-v28", candidates: [prior], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate];
  target.selectedCandidateId = null;
  target.visualCritic = null;
  target.candidateRender = null;
  target.bestEffectHeroFrame = null;
  target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 D28 真实屏幕轨道候选已编译；D16 保留为稳定最佳回滚点。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-object-bound-pixel-relay", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-monitor-rail-flow-relay-v28", prompt: "拉回真实源帧一档，英文锁在右侧黑屏内侧，中文沿麦克风臂上扬并在屏桌交界收束，禁止独立装饰。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-monitor-rail-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
  delete next.production.maturityLoop.shotReports["ED-01"];
  next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives";
  recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]};
  recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  recalculated.production.visualDirector.generationFreeze = {...(recalculated.production.visualDirector.generationFreeze || {}), frozen: true, status: "frozen", reason: "visual-anchor-static-refinement-required", scope: "explicit-anchor-static-refinement", imageGenerationAllowed: false, automaticDispatchAllowed: false, compositorReviewAllowed: true};
  const hashInput = structuredClone(recalculated);
  delete hashInput.workspaceSha256;
  if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  recalculated.workspaceSha256 = sha256Json(hashInput);
  recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256;
  assertEditorialAssetWorkbench(recalculated);
  persistProjectState(appRoot, recalculated);
  return {workspaceSha256: recalculated.workspaceSha256, candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256};
});

console.log(JSON.stringify({status: "ED01_MONITOR_RAIL_PREFLIGHT_READY", ...result}, null, 2));
