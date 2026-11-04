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
  candidate.candidateId = "ED-01-D08-V1";
  candidate.direction = "阶差接力版：智能写作从麦克风臂下缘抬起，工作台同组下落至桌面方向；完整短语相邻可读，不带独立光标。";
  candidate.sceneGraph.presenterCompositionVariant = "desk-type-object-5";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = "保留真实人物、麦克风、显示器和完整可编辑中文；两个词级演员保持相邻同组，智能写作沿麦克风臂下缘抬起，工作台沿同一方向下落；删除独立方框、底条和连接线。";
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes.map((node) => {
    if (node.id === "presenter-word-1") return {...node, geometry: {x: 0.86, y: 0.17, width: 0.13, height: 0.075}, fontSize: 68, objectBinding: "real-footage-object:right-monitor-screen", objectAnchor: "right-monitor-screen", role: "presenter-object-bound-screen-native-lock"};
    if (node.id === "presenter-word-2") return {...node, geometry: {x: 0.15, y: 0.64, width: 0.8, height: 0.22}, fontSize: 150, objectBinding: "real-footage-object:microphone-arm-to-desk-plane", objectAnchor: "microphone-arm-to-desk-junction", role: "presenter-object-bound-stepped-word-path", splitVisualActors: [{text: "智能写作", className: "split-actor-1", objectBinding: "real-footage-object:microphone-arm-lower-edge"}, {text: "工作台", className: "split-actor-2", objectBinding: "real-footage-object:desk-plane-edge"}]};
    return node;
  });
  candidate.sceneGraph.motionPhrase = {...(candidate.sceneGraph.motionPhrase || {}), intent: "vibe coding 锁显示器；智能写作贴麦克风臂下缘抬起，工作台同组下落至桌面方向，硬切真实选区。", visualVerb: "stepped-word-path-to-desk", entry: "monitor-screen-native-lock", transformation: "smart-writing-rises-at-mic-arm-workbench-drops-to-desk", resolve: "hard-cut-to-real-screen-selection"};
  candidate.sceneGraph.handoff = {...(candidate.sceneGraph.handoff || {}), actor: "工作台", carryOut: "工作台末字的桌面方向作为硬切前唯一落点，不增加独立光标或方框。", semanticBeat: "stepped-word-terminal-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-object-bound-pixel-relay", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.candidateSha256 = sha256(candidate.sceneGraph); candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null}; candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: []}; candidate.createdAt = now; candidate.sourceAssetPackSha256 = current.library.assetPackSha256;
  const next = structuredClone(current); const target = next.library.assets.find((item) => item.id === asset.id); target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-stepped-word-actor-refinement-v5", candidates: [priorCandidate], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate]; target.selectedCandidateId = null; target.visualCritic = null; target.candidateRender = null; target.bestEffectHeroFrame = null; target.status = "ready-for-review"; target.review = {status: "pending", note: "ED-01 最后一轮词级阶差候选；D07 20/24 已归档，禁止继续小步抖动扩展。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-object-bound-pixel-relay", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-stepped-word-actor-v5", prompt: "相邻词级演员：智能写作沿麦克风臂下缘抬起，工作台同组下落向桌面；去掉独立光标与方框。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-stepped-path-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
  next.production.maturityLoop.shotReports["ED-01"] = null; next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now); recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives"; recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]}; recalculated.production.nextAction = recalculated.production.authority.nextAction.label; recalculated.production.visualDirector.generationFreeze = {...(recalculated.production.visualDirector.generationFreeze || {}), frozen: true, status: "frozen", reason: "visual-anchor-static-refinement-required", scope: "explicit-anchor-static-refinement", imageGenerationAllowed: false, automaticDispatchAllowed: false, compositorReviewAllowed: true};
  const hashInput = structuredClone(recalculated); delete hashInput.workspaceSha256; if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null; recalculated.workspaceSha256 = sha256Json(hashInput); recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256; assertEditorialAssetWorkbench(recalculated); persistProjectState(appRoot, recalculated); return {workspaceSha256: recalculated.workspaceSha256, candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256};
});

console.log(JSON.stringify({status: "ED01_STEPPED_WORD_ACTOR_PREFLIGHT_READY", ...result}, null, 2));
