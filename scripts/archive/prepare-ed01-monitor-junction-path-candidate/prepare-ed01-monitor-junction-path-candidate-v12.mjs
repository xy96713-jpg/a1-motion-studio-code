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
  candidate.candidateId = "ED-01-D15-V1";
  candidate.direction = "屏桌交界终点版：vibe coding 锁定显示器；中文逐字沿麦克风臂收窄，末三个字在真实显示器底缘与桌面交界处完成统一终点。";
  candidate.sceneGraph.presenterCompositionVariant = "surface-path-object-12";
  candidate.sceneGraph.structureDirection = candidate.direction;
  candidate.sceneGraph.solverDirection = [
    "完整短语保持一个可编辑逐字演员；前四字绑定银色麦克风臂，后三字绑定显示器底缘与桌面交界，避免两个独立标题。",
    "最后三个字在同一真实交界面上收束，使用轻微屏幕边缘反光和桌面接触暗边建立终点；不加连接线、光标、HUD 或额外层。",
    "vibe coding 仍只作显示器上缘的安静启动信号，人物和真实环境保持第一焦点。",
  ].join("\n");
  candidate.sceneGraph.layoutSolution = {...(candidate.sceneGraph.layoutSolution || {}), layoutRecipe: "presenter-diagonal-cut", compositionPrimitive: "presenter-object-bound-pixel-relay", score: 100.092};
  candidate.sceneGraph.nodes = candidate.sceneGraph.nodes.map((node) => {
    if (node.id === "presenter-word-1") return {...node, geometry: {x: 0.85, y: 0.16, width: 0.15, height: 0.08}, fontSize: 68, objectBinding: "real-footage-object:right-monitor-screen", objectAnchor: "right-monitor-screen", role: "presenter-object-bound-screen-native-lock"};
    if (node.id === "presenter-word-2") return {...node, geometry: {x: 0.06, y: 0.53, width: 0.9, height: 0.36}, fontSize: 122, objectBinding: "real-footage-object:microphone-arm-to-monitor-desk-junction", objectAnchor: "monitor-desk-junction", role: "presenter-object-bound-monitor-junction-path", splitVisualActors: [{
      text: "智能写作工作台", className: "path-actor", objectBinding: "real-footage-object:microphone-arm-to-monitor-desk-junction",
      glyphBindings: [
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:silver-microphone-arm-plane",
        "real-footage-object:monitor-bottom-edge",
        "real-footage-object:monitor-bottom-edge",
        "real-footage-object:monitor-desk-junction",
      ],
      characterPath: [
        {x: .02, y: .45, scale: .66, rotate: -24},
        {x: .08, y: .35, scale: .61, rotate: -23},
        {x: .14, y: .25, scale: .56, rotate: -22},
        {x: .20, y: .15, scale: .51, rotate: -21},
        {x: .70, y: .34, scale: .62, rotate: -3},
        {x: .77, y: .36, scale: .68, rotate: -3},
        {x: .84, y: .38, scale: .74, rotate: -3},
      ],
    }]};
    return node;
  });
  candidate.sceneGraph.motionPhrase = {...(candidate.sceneGraph.motionPhrase || {}), intent: "vibe coding 锁入显示器上缘；中文沿银色麦克风臂逐字收窄，末三个字在显示器底缘与桌面交界统一停驻并硬切下一镜真实选区。", visualVerb: "continuous-glyph-monitor-junction-handoff", entry: "monitor-screen-native-lock", transformation: "per-glyph-mic-arm-to-monitor-desk-junction", resolve: "hard-cut-to-real-screen-selection"};
  candidate.sceneGraph.handoff = {...(candidate.sceneGraph.handoff || {}), actor: "工作台", carryOut: "工作台末三个字在显示器底缘与桌面交界的统一终点作为硬切前交接，不添加额外图形。", semanticBeat: "monitor-desk-junction-terminal-hands-off-to-real-screen-selection"};
  candidate.sceneGraph.visualPrimitiveOverride = {...(candidate.sceneGraph.visualPrimitiveOverride || {}), id: "presenter-object-bound-pixel-relay", applied: true, masterAnchorPolicy: "overridden-by-explicit-strategy-switch"};
  candidate.sceneGraph.approvedMaterialIds = [...new Set(candidate.sceneGraph.nodes.flatMap((node) => [node.assetId, node.fontAssetId, node.typographyMaterialAssetId]).filter(Boolean))];
  candidate.candidateSha256 = sha256(candidate.sceneGraph); candidate.preview = {kind: "scene-graph", width: 960, height: 540, publicUrl: null};
  candidate.screening = {status: "keep-for-user-review", score: null, maxScore: 24, hardFailures: [], visualEvidence: "待同渲染审片", repairBrief: "若仍未达到 22，停止本镜静态微调，保留阻塞证据。"};
  candidate.createdAt = now; candidate.sourceAssetPackSha256 = current.library.assetPackSha256;
  const next = structuredClone(current); const target = next.library.assets.find((item) => item.id === asset.id); target.revisionHistory ||= [];
  target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-monitor-junction-path-refinement-v12", candidates: [prior], selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  target.candidates = [candidate]; target.selectedCandidateId = null; target.visualCritic = null; target.candidateRender = null; target.bestEffectHeroFrame = null; target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 D15 屏桌交界终点候选已编译；D12 稳定中位数 21/24 已归档。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STATIC_SCENE_GRAPH_PREFLIGHT", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-object-bound-pixel-relay", candidateId: candidate.candidateId, imageGenerationDispatched: false, renderDispatched: false, preflightAt: now};
  target.visualRevision = {...(target.visualRevision || {}), round: Number(target.visualRevision?.round || 1) + 1, strategySwitchId: "ed01-monitor-junction-path-v12", prompt: "完整中文逐字路径从麦克风臂收窄，末三个字统一落在显示器底缘与桌面交界；不加装饰线。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-monitor-junction-${sha256(candidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: [candidate.candidateId], candidateCount: 1, sourceDependencySha256: candidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
  delete next.production.maturityLoop.shotReports["ED-01"]; next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now); recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives"; recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]}; recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  recalculated.production.visualDirector.generationFreeze = {...(recalculated.production.visualDirector.generationFreeze || {}), frozen: true, status: "frozen", reason: "visual-anchor-static-refinement-required", scope: "explicit-anchor-static-refinement", imageGenerationAllowed: false, automaticDispatchAllowed: false, compositorReviewAllowed: true};
  const hashInput = structuredClone(recalculated); delete hashInput.workspaceSha256; if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null; recalculated.workspaceSha256 = sha256Json(hashInput); recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256; assertEditorialAssetWorkbench(recalculated); persistProjectState(appRoot, recalculated);
  return {workspaceSha256: recalculated.workspaceSha256, candidateId: candidate.candidateId, candidateSha256: candidate.candidateSha256};
});
console.log(JSON.stringify({status: "ED01_MONITOR_JUNCTION_PREFLIGHT_READY", ...result}, null, 2));
