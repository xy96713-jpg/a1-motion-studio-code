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
  candidate.candidateId = "ED-01-D19-V1";
  candidate.direction = "连续词带版：vibe coding 锁在显示器；智能写作工作台保持一个连续可编辑字带，从麦克风臂的起点沿真实物件透视平滑落到屏桌交界。";
  candidate.sceneGraph.presenterCompositionVariant = "surface-path-object-16";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "真人仍是最大主体；英文只作右侧显示器边缘的安静启动词。",
    "中文不再拆成两个相隔的贴纸，而是一个连续可编辑词带；七个字沿同一条轻微弧线从麦克风臂过渡到屏桌交界。",
    "前四字绑定银色麦克风臂，后三字绑定显示器底缘与桌面交界；连续字距和统一奶油字／钴蓝错版把两个真实表面读成同一件工作台。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {...(candidate.sceneGraph.layoutSolution || {}), layoutRecipe: "presenter-diagonal-cut", compositionPrimitive: "presenter-object-bound-pixel-relay", score: 100.115};
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes.map((node) => {
    if (node.id === "presenter-word-1") return {
      ...node,
      geometry: {x: 0.84, y: 0.15, width: 0.15, height: 0.08},
      fontSize: 68,
      objectBinding: "real-footage-object:right-monitor-screen",
      objectAnchor: "right-monitor-screen",
      role: "presenter-object-bound-screen-native-lock",
    };
    if (node.id === "presenter-word-2") return {
      ...node,
      geometry: {x: 0.08, y: 0.56, width: 0.84, height: 0.31},
      fontSize: 126,
      objectBinding: "real-footage-object:microphone-arm-to-monitor-desk-junction",
      objectAnchor: "monitor-desk-junction",
      role: "presenter-object-bound-continuous-word-band",
      splitVisualActors: [{
        text: "智能写作工作台",
        className: "path-actor",
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
          {x: 0.02, y: 0.55, scale: 0.78, rotate: -18},
          {x: 0.14, y: 0.47, scale: 0.78, rotate: -15},
          {x: 0.26, y: 0.39, scale: 0.78, rotate: -12},
          {x: 0.38, y: 0.32, scale: 0.78, rotate: -9},
          {x: 0.53, y: 0.34, scale: 0.78, rotate: -6},
          {x: 0.66, y: 0.32, scale: 0.80, rotate: -5},
          {x: 0.79, y: 0.30, scale: 0.82, rotate: -4},
        ],
      }],
    };
    return node;
  });
  candidate.sceneGraph.motionPhrase = {
    ...(candidate.sceneGraph.motionPhrase || {}),
    intent: "vibe coding 锁入显示器内侧；同一中文词带沿银色麦克风臂连续收窄，在屏桌交界平滑停驻并硬切下一镜真实选区。",
    visualVerb: "continuous-word-band-surface-handoff",
    entry: "monitor-screen-native-lock",
    transformation: "continuous-glyph-band-mic-arm-to-monitor-desk-junction",
    resolve: "hard-cut-to-real-screen-selection",
  };
  candidate.sceneGraph.handoff = {
    ...(candidate.sceneGraph.handoff || {}),
    actor: "工作台",
    carryOut: "连续词带的末三个字在屏桌交界统一停驻，作为硬切前唯一终点，不添加额外图形。",
    semanticBeat: "continuous-word-band-terminal-hands-off-to-real-screen-selection",
  };
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-object-bound-pixel-relay", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.candidateSha256 = sha256(candidate.sceneGraph);
  candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: [], visualEvidence: "待同渲染审片", repairBrief: "若仍低于 22，保留稳定最佳方向并停止同类字距微调。"};
  candidate.createdAt = now;
  candidate.sourceAssetPackSha256 = current.library.assetPackSha256;

  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === asset.id);
  target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-continuous-word-band-refinement-v16", candidates: [prior], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate];
  target.selectedCandidateId = null;
  target.visualCritic = null;
  target.candidateRender = null;
  target.bestEffectHeroFrame = null;
  target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 D19 连续词带候选已编译；保持 D16 可追溯归档。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-object-bound-pixel-relay", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-continuous-word-band-v16", prompt: "把中文重做为连续词带：统一字形、字距、透视，从麦克风臂平滑到屏桌交界，禁止独立贴纸和连接线。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-continuous-word-band-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
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

console.log(JSON.stringify({status: "ED01_CONTINUOUS_WORD_BAND_PREFLIGHT_READY", ...result}, null, 2));
