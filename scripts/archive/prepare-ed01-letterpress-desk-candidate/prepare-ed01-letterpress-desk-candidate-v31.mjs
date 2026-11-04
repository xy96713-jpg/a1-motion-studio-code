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
  candidate.candidateId = "ED-01-D31-R5-V1";
  candidate.direction = "编辑印刷台版：真人保持真实主角；vibe coding 是右侧显示器边缘的像素铭牌；“智能写作”以小型油墨字沿银色麦克风臂逐字排布；“工作台”印在一张不规则暖纸上，真实压在桌面平面，形成一个可读的编辑物件而不是浮字。";
  candidate.sceneGraph.presenterCompositionVariant = "presenter-letterpress-desk-v1";
  candidate.sceneGraph.visualFamily = "presenter-letterpress-desk-v1";
  candidate.sceneGraph.compositionPrimitive = "presenter-letterpress-desk-surface";
  candidate.sceneGraph.effectiveEditMode = "presenter-overlay";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "真人源帧保持完整可信度；所有文字都只附着于真实显示器、银色麦克风臂或右下桌面，不添加卡片、HUD、箭头或装饰线。",
    "vibe coding 是右侧显示器边缘的低分辨率像素铭牌；智能写作是沿麦克风臂真实斜率排布的小型油墨字；工作台是唯一大字，印在有不规则边缘的暖纸表面并服从桌面透视。",
    "纸面是已批准的无字背景素材，只承担真实桌面上的编辑承载面；文字保持可编辑，纸纹不是文字证据，也不是整张生图替身。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {...(candidate.sceneGraph.layoutSolution || {}), layoutRecipe: "presenter-letterpress-desk-plane", compositionPrimitive: "presenter-letterpress-desk-surface", score: 101.31};

  const deskSheet = {
    id: "desk-letterpress-sheet",
    type: "editorial-anchor-surface",
    assetId: "bg-warm-paper-dot",
    sceneFamily: "presenter-letterpress-desk-v1",
    role: "approved-paper-sheet-physically-resting-on-real-desk",
    geometry: {x: 0.72, y: 0.80, width: 0.25, height: 0.16},
    opacity: 0.84,
    blendMode: "normal",
    clipPathPolygon: "polygon(12% 14%, 90% 0, 100% 70%, 85% 100%, 10% 92%, 0 25%)",
    focalPoint: "52% 48%",
    objectBinding: "real-footage-object:desk-plane",
    objectAnchor: "right-desk-plane",
    semanticBeat: "approved-paper-surface-sits-on-real-desk-and-receives-the-final-word",
    z: 20,
    visualMode: "visible",
    deliveryUsage: "delivery",
  };
  const textNodes = [
    {
      id: "presenter-word-1",
      text: "vibe coding",
      type: "editable-text",
      role: "presenter-object-bound-monitor-printed-label",
      geometry: {x: 0.84, y: 0.20, width: 0.14, height: 0.055},
      fontSize: 40,
      lineHeight: 0.88,
      fontAssetId: "type-pixel-correction",
      typeTreatment: "letterpress-monitor-pixel",
      surfaceTreatment: "none",
      paletteRole: "acid",
      tone: "light",
      objectBinding: "real-footage-object:monitor-bezel",
      objectAnchor: "right-monitor-screen-edge",
      semanticBeat: "vibe-coding-is-printed-on-the-real-monitor-edge",
      groupId: "presenter-letterpress-axis",
      visualMode: "visible",
      deliveryUsage: "delivery",
      z: 25,
    },
    {
      id: "presenter-word-2",
      text: "智能写作",
      type: "editable-text",
      role: "presenter-object-bound-mic-letterpress-ink",
      geometry: {x: 0.025, y: 0.58, width: 0.34, height: 0.20},
      fontSize: 75,
      lineHeight: 0.9,
      fontAssetId: "type-pixel-correction",
      typeTreatment: "letterpress-mic-ink",
      surfaceTreatment: "none",
      paletteRole: "sunlit-pixel",
      tone: "light",
      objectBinding: "real-footage-object:microphone-arm",
      objectAnchor: "silver-microphone-arm-plane",
      semanticBeat: "intelligent-writing-is-inked-along-the-real-microphone-arm",
      groupId: "presenter-letterpress-axis",
      splitVisualActors: [{
        text: "智能写作",
        className: "mic-ink-path",
        objectBinding: "real-footage-object:microphone-arm",
        glyphBindings: [
          "real-footage-object:silver-microphone-arm-plane",
          "real-footage-object:silver-microphone-arm-plane",
          "real-footage-object:silver-microphone-arm-plane",
          "real-footage-object:silver-microphone-arm-joint",
        ],
        characterPath: [
          {x: 0.02, y: 0.64, scale: 0.84, rotate: -15},
          {x: 0.16, y: 0.50, scale: 0.81, rotate: -15},
          {x: 0.30, y: 0.36, scale: 0.78, rotate: -15},
          {x: 0.44, y: 0.22, scale: 0.75, rotate: -15},
        ],
      }],
      visualMode: "visible",
      deliveryUsage: "delivery",
      z: 25,
    },
    {
      id: "headline",
      text: "工作台",
      type: "editable-text",
      role: "presenter-dominant-letterpress-desk-word",
      geometry: {x: 0.745, y: 0.832, width: 0.19, height: 0.11},
      fontSize: 70,
      lineHeight: 0.82,
      fontAssetId: "type-pixel-correction",
      typeTreatment: "letterpress-desk-ink",
      surfaceTreatment: "none",
      paletteRole: "ink",
      tone: "dark",
      objectBinding: "real-footage-object:desk-plane",
      objectAnchor: "right-desk-paper-plane",
      semanticBeat: "workbench-is-pressed-as-ink-into-the-real-desk-paper-plane",
      groupId: "presenter-letterpress-axis",
      visualMode: "visible",
      deliveryUsage: "delivery",
      z: 26,
    },
  ];
  const nodes = candidate.sceneGraph.nodes
    .filter((node) => node.id === "primary")
    .map((node) => ({...node, geometry: {x: 0, y: 0, width: 1, height: 1}, mediaScale: 1.04, focalPoint: "54% 38%", objectBinding: "real-presenter-face-and-gesture", semanticBeat: "real-presenter-remains-primary-while-editorial-objects-occupy-real-surfaces"}));
  candidate.sceneGraph.nodes = [deskSheet, ...nodes, ...textNodes];
  candidate.sceneGraph.motionPhrase = {...(candidate.sceneGraph.motionPhrase || {}), intent: "vibe coding 在显示器边缘像素锁定；智能写作沿麦克风臂逐字印入；工作台在真实桌面纸面上压印完成唯一终点后硬切真实正文选区。", visualVerb: "letterpress-surface-handoff", entry: "monitor-edge-pixel-lock", transformation: "monitor-to-mic-ink-to-desk-paper-imprint", resolve: "desk-paper-imprint-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.handoff = {...(candidate.sceneGraph.handoff || {}), actor: "工作台", carryOut: "桌面纸面上的工作台油墨字是硬切前唯一终点，下一镜从真实正文选区接续。", semanticBeat: "desk-paper-imprint-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-letterpress-desk-v1", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.sourceDependencySha256 = sceneGraphSourceDependencySha256(current, asset.shotDemand, candidate.sceneGraph);
  candidate.candidateSha256 = sha256(candidate.sceneGraph);
  candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: [], visualEvidence: "待同渲染审片", repairBrief: "若低于 22/24，恢复 D16；不再对该原语做微调。"};
  candidate.createdAt = now;
  candidate.sourceAssetPackSha256 = current.library.assetPackSha256;

  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === asset.id);
  target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-letterpress-desk-v31-r5", candidates: [prior], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate];
  target.selectedCandidateId = null;
  target.visualCritic = null;
  target.candidateRender = null;
  target.bestEffectHeroFrame = null;
  target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 D31-R5 编辑印刷台候选已编译；收紧视觉层级并提高杆上词可读性后只审这一版，不自动采用。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-letterpress-desk-v1", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-letterpress-desk-v31-r5", prompt: "参照 imagegen keyframe 的编辑印刷感：vibe coding 作为低亮度显示器铭牌，智能写作放大后压入银色麦克风臂的真实轴线，工作台压在真实桌面内部的小型不规则暖纸且不触画框，不使用贴纸描边、HUD 或底条。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-letterpress-desk-r5-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
  delete next.production.maturityLoop.shotReports["ED-01"];
  next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives";
  recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "保留当前三种视觉原语，只定向精修 ED-01 至连续两次 ≥22/24", requiresUser: false, targetShotIds: ["ED-01"]};
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

console.log(JSON.stringify({status: "ED01_LETTERPRESS_DESK_PREFLIGHT_READY", ...result}, null, 2));
