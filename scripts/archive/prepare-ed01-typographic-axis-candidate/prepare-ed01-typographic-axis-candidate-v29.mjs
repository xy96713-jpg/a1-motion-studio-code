#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench, sha256Json} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {sceneGraphSourceDependencySha256} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
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
  candidate.candidateId = "ED-01-D30-V1";
  candidate.direction = "编辑字轴收口版：真人保持真实主角，英文锁进右侧黑屏边缘；“智能”与“写作”沿银色麦克风臂的两个关节分段接力，较小的“工作台”以透视压印落在真实桌面，形成从器物到桌面的单一编辑轴。";
  candidate.sceneGraph.presenterCompositionVariant = "presenter-typographic-stage-v5";
  candidate.sceneGraph.visualFamily = "presenter-typographic-stage-v5";
  candidate.sceneGraph.compositionPrimitive = "presenter-cutout-typographic-axis";
  candidate.sceneGraph.effectiveEditMode = "presenter-overlay";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "真人源帧保持全幅可信度；中文只拆成沿同一真实器物轴线推进的两个连续字组，不再形成同值贴纸。",
    "vibe coding 只作为右侧真实显示器边缘的微型荧光锁点；‘智能’贴近麦克风臂下段，‘写作’在关节上方接棒；‘工作台’是唯一主字形，在真实桌面平面上做透视压印。",
    "使用已批准的暖纸纹理作为极低透明度的编辑材料层，保留真实人物、屏幕、麦克风和桌面，不使用卡片、HUD、箭头或生成式人物替身。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {...(candidate.sceneGraph.layoutSolution || {}), layoutRecipe: "presenter-diagonal-cut", compositionPrimitive: "presenter-cutout-typographic-axis", score: 100.29};
  const surface = {
    id: "editorial-anchor-surface",
    type: "editorial-anchor-surface",
    assetId: "bg-warm-paper-dot",
    sceneFamily: "presenter-typographic-stage-v5",
    role: "low-opacity-editorial-material-wash",
    geometry: {x: 0, y: 0, width: 1, height: 1},
    opacity: 0.075,
    blendMode: "screen",
    focalPoint: "50% 50%",
    objectBinding: "editorial-anchor:real-presenter-and-desk-plane",
    semanticBeat: "approved-paper-material-wash-unifies-real-footage-with-editorial-type",
    z: 2,
    visualMode: "visible",
    deliveryUsage: "delivery",
  };
  const textNodes = [
    {
      id: "presenter-word-1",
      text: "vibe coding",
      type: "editable-text",
      role: "presenter-object-bound-screen-lock",
      geometry: {x: 0.83, y: 0.22, width: 0.16, height: 0.065},
      fontSize: 54,
      lineHeight: 0.88,
      fontAssetId: "type-pixel-correction",
      typeTreatment: "covacut-monitor-handoff",
      surfaceTreatment: "none",
      paletteRole: "acid",
      tone: "light",
      objectBinding: "real-footage-object:monitor-bezel",
      objectAnchor: "right-monitor-screen",
      semanticBeat: "vibe-coding-burns-into-the-real-monitor-edge",
      groupId: "presenter-typographic-axis",
      visualMode: "visible",
      deliveryUsage: "delivery",
      z: 25,
    },
    {
      id: "presenter-word-2a",
      text: "智能",
      type: "editable-text",
      role: "presenter-object-bound-mic-rail-segment",
      geometry: {x: 0.035, y: 0.615, width: 0.145, height: 0.095},
      fontSize: 64,
      lineHeight: 0.88,
      fontAssetId: "type-pixel-correction",
      typeTreatment: "covacut-mic-rail-segment-a",
      surfaceTreatment: "none",
      paletteRole: "paper",
      tone: "light",
      objectBinding: "real-footage-object:microphone-arm",
      objectAnchor: "silver-microphone-arm-lower-segment",
      semanticBeat: "intelligent-rides-the-lower-real-microphone-rail",
      groupId: "presenter-typographic-axis",
      visualMode: "visible",
      deliveryUsage: "delivery",
      z: 25,
    },
    {
      id: "presenter-word-2b",
      text: "写作",
      type: "editable-text",
      role: "presenter-object-bound-mic-rail-segment",
      geometry: {x: 0.155, y: 0.535, width: 0.145, height: 0.095},
      fontSize: 64,
      lineHeight: 0.88,
      fontAssetId: "type-pixel-correction",
      typeTreatment: "covacut-mic-rail-segment-b",
      surfaceTreatment: "none",
      paletteRole: "paper",
      tone: "light",
      objectBinding: "real-footage-object:microphone-arm",
      objectAnchor: "silver-microphone-arm-joint",
      semanticBeat: "writing-hands-off-at-the-real-microphone-arm-joint",
      groupId: "presenter-typographic-axis",
      visualMode: "visible",
      deliveryUsage: "delivery",
      z: 25,
    },
    {
      id: "headline",
      text: "工作台",
      type: "editable-text",
      role: "presenter-dominant-desk-lockup",
      geometry: {x: 0.705, y: 0.795, width: 0.25, height: 0.15},
      fontSize: 92,
      lineHeight: 0.82,
      fontAssetId: "type-pixel-correction",
      typeTreatment: "covacut-desk-object",
      surfaceTreatment: "none",
      paletteRole: "sunlit-pixel",
      tone: "light",
      objectBinding: "real-footage-object:desk-plane",
      objectAnchor: "right-desk-plane",
      semanticBeat: "workbench-is-pressed-into-the-real-desk-plane-as-the-handoff-actor",
      groupId: "presenter-typographic-axis",
      visualMode: "visible",
      deliveryUsage: "delivery",
      z: 26,
    },
  ];
  const nodes = candidate.sceneGraph.nodes
    .filter((node) => !["headline", "secondary-phrase", "editorial-anchor-surface", "presenter-word-1", "presenter-word-2", "presenter-word-2a", "presenter-word-2b"].includes(node.id))
    .map((node) => node.id === "primary"
      ? {...node, geometry: {x: 0, y: 0, width: 1, height: 1}, mediaScale: 1.06, focalPoint: "54% 38%", objectBinding: "real-presenter-face-and-gesture", semanticBeat: "real-presenter-remains-primary-while-type-crosses-physical-workbench"}
      : node);
  candidate.sceneGraph.nodes = [surface, ...nodes, ...textNodes];
  candidate.sceneGraph.motionPhrase = {...(candidate.sceneGraph.motionPhrase || {}), intent: "真人先建立身份；vibe coding 在右侧显示器边缘点亮，智能与写作沿麦克风臂两段接力，工作台以桌面透视压印完成唯一终点后硬切真实正文选区。", visualVerb: "physical-typographic-axis-handoff", entry: "monitor-edge-screen-lock", transformation: "monitor-to-mic-rail-segments-to-desk-plane", resolve: "desk-imprint-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.handoff = {...(candidate.sceneGraph.handoff || {}), actor: "工作台", carryOut: "桌面上的工作台字形是硬切前唯一终点，下一镜从真实正文选区接续。", semanticBeat: "desk-imprint-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-typographic-stage-v5", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.sourceDependencySha256 = sceneGraphSourceDependencySha256(current, asset.shotDemand, candidate.sceneGraph);
  candidate.candidateSha256 = sha256(candidate.sceneGraph);
  candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: [], visualEvidence: "待同渲染审片", repairBrief: "若低于 22/24，恢复 D16；不再把同一轴线拆成更多微调候选。"};
  candidate.createdAt = now;
  candidate.sourceAssetPackSha256 = current.library.assetPackSha256;

  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === asset.id);
  target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-typographic-axis-v29", candidates: [prior], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate];
  target.selectedCandidateId = null;
  target.visualCritic = null;
  target.candidateRender = null;
  target.bestEffectHeroFrame = null;
  target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 D30 编辑字轴收口候选已编译；D16 保留为稳定最佳回滚点。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-typographic-stage-v5", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-typographic-axis-v30", prompt: "从 imagegen keyframe 的物理字轴提炼可编辑版本：vibe coding 锁显示器，智能与写作沿麦克风臂两段接力，工作台缩小后透视压印到真实桌面；保留真人源帧，禁止标题卡/HUD。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-typographic-axis-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
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

console.log(JSON.stringify({status: "ED01_TYPOGRAPHIC_AXIS_PREFLIGHT_READY", ...result}, null, 2));
