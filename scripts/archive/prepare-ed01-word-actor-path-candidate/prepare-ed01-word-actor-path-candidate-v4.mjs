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
  candidate.candidateId = "ED-01-D07-V1";
  candidate.direction = "词级连续路径版：vibe coding 进入显示器黑面，智能写作较小地贴麦克风臂，工作台在同一字组内放大并落向桌面。";
  candidate.sceneGraph.presenterCompositionVariant = "desk-type-object-4";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "保持同一真实真人帧和真实工作台，不增加新图像。",
    "vibe coding 只在右侧黑色显示器内作为起拍锁点。",
    "智能写作工作台仍是一个完整可编辑文本组，但以连续相邻的两个词级演员呈现：智能写作较小、沿麦克风臂下缘起步；工作台放大、沿同一斜率向桌面落点延伸；两者不可分置画面两端。",
    "末字右缘的微型矩形只贴合字面、与文字同一基线，不成为第三焦点。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {...(candidate.sceneGraph.layoutSolution || {}), layoutRecipe: "presenter-diagonal-cut", compositionPrimitive: "presenter-object-bound-pixel-relay", score: 100.028};
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes.map((node) => {
    if (node.id === "presenter-word-1") return {...node, geometry: {x: 0.86, y: 0.17, width: 0.13, height: 0.075}, fontSize: 68, objectBinding: "real-footage-object:right-monitor-screen", objectAnchor: "right-monitor-screen", role: "presenter-object-bound-screen-native-lock"};
    if (node.id === "presenter-word-2") return {...node, geometry: {x: 0.15, y: 0.64, width: 0.8, height: 0.22}, fontSize: 150, objectBinding: "real-footage-object:microphone-arm-to-desk-plane", objectAnchor: "microphone-arm-to-desk-junction", role: "presenter-object-bound-word-actor-path", splitVisualActors: [{text: "智能写作", className: "split-actor-1", objectBinding: "real-footage-object:microphone-arm-lower-edge"}, {text: "工作台", className: "split-actor-2", objectBinding: "real-footage-object:desk-plane-edge"}]};
    return node;
  });
  candidate.sceneGraph.motionPhrase = {...(candidate.sceneGraph.motionPhrase || {}), intent: "vibe coding 锁入右侧显示器黑面；智能写作沿麦克风臂下缘起步，工作台在同一字组内放大并落向桌面，末字微型矩形硬切真实选区。", visualVerb: "word-actor-path-to-desk-terminal", entry: "monitor-screen-native-lock", transformation: "smart-writing-to-workbench-along-same-object-slope", resolve: "terminal-notch-hard-cuts-to-real-screen-selection"};
  candidate.sceneGraph.handoff = {...(candidate.sceneGraph.handoff || {}), actor: "工作台", carryOut: "工作台末字右缘的贴合矩形落点硬切到下一镜真实正文选区边缘。", semanticBeat: "word-actor-terminal-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-object-bound-pixel-relay", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.candidateSha256 = sha256(candidate.sceneGraph);
  candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: []};
  candidate.createdAt = now;
  candidate.sourceAssetPackSha256 = current.library.assetPackSha256;

  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === asset.id);
  target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-word-actor-path-refinement-v4", candidates: [priorCandidate], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate]; target.selectedCandidateId = null; target.visualCritic = null; target.candidateRender = null; target.bestEffectHeroFrame = null; target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 词级连续路径候选已编译；D06 20/24 已归档，等待一次受控双审。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-object-bound-pixel-relay", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-word-actor-path-v4", prompt: "保持完整可编辑短语；智能写作沿麦克风臂起步，工作台同组放大沿同一斜率落桌，末字微型矩形贴字交接。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-word-path-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
  next.production.maturityLoop.shotReports["ED-01"] = null; next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives"; recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]}; recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  recalculated.production.visualDirector.generationFreeze = {...(recalculated.production.visualDirector.generationFreeze || {}), frozen: true, status: "frozen", reason: "visual-anchor-static-refinement-required", scope: "explicit-anchor-static-refinement", imageGenerationAllowed: false, automaticDispatchAllowed: false, compositorReviewAllowed: true};
  const hashInput = structuredClone(recalculated); delete hashInput.workspaceSha256; if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null; recalculated.workspaceSha256 = sha256Json(hashInput); recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256;
  assertEditorialAssetWorkbench(recalculated); persistProjectState(appRoot, recalculated); return {workspaceSha256: recalculated.workspaceSha256, candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256};
});

console.log(JSON.stringify({status: "ED01_WORD_ACTOR_PATH_PREFLIGHT_READY", ...result}, null, 2));
