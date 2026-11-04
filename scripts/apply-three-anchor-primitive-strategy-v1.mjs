#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench, sha256Json} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, createSceneGraphCandidates} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const now = new Date().toISOString();
const TARGETS = ["ED-01", "ED-14", "ED-10"];
const primitiveByShot = {
  "ED-01": "presenter-object-bound-pixel-relay",
  "ED-14": "evidence-bound-pixel-choice-funnel",
  "ED-10": "proof-sheet-corruption-reveal",
};

const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

function updateShotDemand(asset, shotId) {
  const demand = asset.shotDemand;
  demand.visualPrimitiveId = primitiveByShot[shotId];
  if (shotId === "ED-01") {
    demand.topology = "presenter-object-bound-pixel-relay";
    demand.visualJob = "用真人身份和真实语气建立工具来源可信度，并让两个身份词沿真实工作台物件完成一次像素接力。";
    demand.primaryActor = "作者本人及其真实工作台物件";
    demand.layoutConstraints = [
      "真人始终是最大视觉演员；眼睛、嘴、鼻部和主要表情不得被遮挡。",
      "只保留两组可编辑身份字：vibe coding 绑定右侧显示器边缘，智能写作工作台绑定麦克风臂到桌面边缘。",
      "像素字必须从真实物件表面发生，不得漂浮、不得成为 Logo/HUD/标题卡；最后由工作台一词交给下一镜。",
    ];
    demand.motionPhrase = "vibe coding 从右侧显示器边缘锁定；智能写作工作台沿麦克风臂与桌面进入，两个字面完成一次对象接力后硬切真实界面。";
    demand.handoffActor = "智能写作工作台";
    demand.structureDirections = [
      "真人偏右，vibe coding 锁在右侧显示器上缘，中文工作台从左下麦克风臂/桌面进入。",
      "真人偏左，英文短语保持微型，中文工作台沿麦克风臂到桌面边缘形成单一交接轨道。",
      "先只见真人与真实房间，再按口播顺序让显示器字和桌面字依次落定，最后硬切真实工作台界面。",
    ];
    demand.typographyAssignment = {
      ...demand.typographyAssignment,
      headlineText: "vibe coding\n智能写作工作台",
      treatmentMode: "object-bound-pixel-relay",
      pixelDuty: "identity-dominant",
      objectBindingRequired: true,
      generatedGlyphAssetIds: [],
    };
  } else if (shotId === "ED-14") {
    demand.topology = "evidence-bound-pixel-choice-funnel";
    demand.visualJob = "把研究结论转译为候选表达沿同一轨道逐步收窄为默认答案的机制。";
    demand.primaryActor = "一个可核对的研究证据窗、三个文本候选和最终可复用表达";
    demand.layoutConstraints = [
      "只保留一个可核对的研究证据窗或引用锚，不展示整屏论文页，不伪造论文内容。",
      "常见、稳妥、可复用依次进入同一条收束轨道，不能一开始并列成三栏。",
      "酸橙色只表示筛选路径；黑/奶油底与 cobalt 承载文字，最终输出仍必须来自可读候选。",
    ];
    demand.motionPhrase = "边缘研究证据窗先成立；常见、稳妥、可复用沿同一条像素漏斗连续收窄，最后压成可复用表达。";
    demand.handoffActor = "可复用表达";
    demand.structureDirections = [
      "研究证据作为左上边缘单窗，三个词沿一条向右下收束轨道进入输出块。",
      "同一研究摘录保持在画面边缘，候选词从页边槽位进入并被同一轨道连续收窄。",
      "证据窗、三个词和最终输出形成一条斜向漏斗，不使用卡片阵列或 HUD。",
    ];
    demand.typographyAssignment = {
      ...demand.typographyAssignment,
      headlineText: "可复用表达",
      treatmentMode: "evidence-bound-choice-funnel",
      pixelDuty: "mechanism-choice",
      generatedGlyphAssetIds: [],
      objectBindingRequired: false,
    };
  } else if (shotId === "ED-10") {
    demand.topology = "proof-sheet-corruption-reveal";
    demand.visualJob = "让规整校样基线先成立，再用一个红色擦除动作穿过同一字面，揭出完成度很高的废稿。";
    demand.primaryActor = "完成度很高的废稿这一张校样字面";
    demand.layoutConstraints = [
      "完成度很高的先保持统一基线、字距和校样秩序；废稿必须仍在同一字面中。",
      "只允许一个红色擦除/校改动作，像素碎屑必须从受力处揭出废稿，不叠加第二个标题。",
      "完整中文保持可编辑；禁止普通居中标题卡、重复大字背景、无受力圈线和无对象箭头。",
    ];
    demand.motionPhrase = "引导语先落纸面，完成度很高的按校样基线锁定；一个红色擦除动作穿过同一字面，像素碎屑揭出废稿并触发硬切。";
    demand.handoffActor = "proof-sheet-eraser-correction";
    demand.structureDirections = [
      "引导语在上方，完成度很高的保持规整基线，擦除动作从右侧穿过废稿位置。",
      "主判断保持同一文本块，红色擦除从留白批注区进入并在末词处形成受力。",
      "印刷校样式纵向阅读，像素碎屑沿废稿下缘聚集，闭合后保持一拍再硬切。",
    ];
    demand.typographyAssignment = {
      ...demand.typographyAssignment,
      headlineText: "完成度很高的废稿",
      treatmentMode: "proof-sheet-corruption-reveal",
      pixelDuty: "verdict-dominant",
      generatedGlyphAssetIds: [],
      generatedGlyphAllowed: false,
      objectBindingRequired: false,
    };
  }
  return demand;
}

function archiveAndReset(asset, shotId) {
  const candidates = Array.isArray(asset.candidates) ? asset.candidates : [];
  const hadReviewMaterial = candidates.length || asset.selectedCandidateId || asset.candidateRender || asset.visualCritic;
  if (hadReviewMaterial) {
    asset.revisionHistory ||= [];
    asset.revisionHistory.push({
      contract: "A1RejectedShotCandidateRound/v1",
      round: Number(asset.visualRevision?.round || 1),
      strategyCycle: Number(asset.visualStrategyCycle || 0),
      reason: "three-anchor-primitive-strategy-switch-v1",
      candidates: structuredClone(candidates),
      selectedCandidateId: asset.selectedCandidateId || null,
      candidateRender: asset.candidateRender || null,
      visualCritic: asset.visualCritic || null,
      archivedAt: now,
    });
  }
  asset.candidates = [];
  asset.selectedCandidateId = null;
  asset.candidateRender = null;
  asset.visualCritic = null;
  asset.candidateSetAudit = {
    contract: "A1ShotCandidateSetAudit/v1",
    status: "INVALIDATED_STRATEGY_SWITCH",
    validForCurrentProduction: false,
    shotId,
    reason: "旧候选属于旧视觉原语；保留在 revisionHistory 供回看，不得作为当前生产采用结果。",
    invalidatedAt: now,
  };
  asset.status = "brief-ready";
  asset.review = {status: "pending", note: "视觉原语已切换；静态 scene graph 预检已编译，等待受控审片，不自动采用。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  asset.visualStrategyCycle = 0;
  asset.visualRevision = {
    contract: "A1VisualRevisionBrief/v1",
    round: Math.max(1, Number(asset.visualRevision?.round || 1)),
    sourceReportSha256: asset.visualRevision?.sourceReportSha256 || null,
    prompt: {
      "ED-01": "切换为 presenter-object-bound-pixel-relay：真人保持主角，vibe coding 绑定右侧显示器边缘，智能写作工作台绑定麦克风臂到桌面边缘；禁止浮字、遮脸和超过两个焦点。",
      "ED-14": "切换为 evidence-bound-pixel-choice-funnel：只保留一个边缘研究证据窗，常见、稳妥、可复用沿同一轨道收束为可复用表达；禁止荧光标注墙、整页论文和 HUD 卡片阵列。",
      "ED-10": "切换为 proof-sheet-corruption-reveal：规整校样基线先成立，一个红色擦除动作穿过同一字面，像素碎屑揭出废稿；禁止普通居中标题卡和重复大字。",
    }[shotId],
    strategySwitchId: "three-anchor-primitive-strategy-switch-v1",
    createdAt: now,
  };
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const before = current.workspaceSha256;
  let next = structuredClone(current);
  const beforeSummary = {};
  for (const shotId of TARGETS) {
    const asset = next.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === shotId);
    if (!asset) throw new Error(`three-anchor-shot-not-found:${shotId}`);
    beforeSummary[shotId] = {
      candidateCount: asset.candidates?.length || 0,
      selectedCandidateId: asset.selectedCandidateId || null,
      visualStrategyCycle: Number(asset.visualStrategyCycle || 0),
    };
    updateShotDemand(asset, shotId);
    archiveAndReset(asset, shotId);
    const requirement = next.assetRequirementGraph.shotDemands.find((item) => item.shotId === shotId);
    if (requirement) Object.assign(requirement, {
      visualPrimitiveId: asset.shotDemand.visualPrimitiveId,
      topology: asset.shotDemand.topology,
      visualJob: asset.shotDemand.visualJob,
      primaryActor: asset.shotDemand.primaryActor,
      layoutConstraints: asset.shotDemand.layoutConstraints,
      motionPhrase: asset.shotDemand.motionPhrase,
      handoffActor: asset.shotDemand.handoffActor,
      structureDirections: asset.shotDemand.structureDirections,
      typographyAssignment: asset.shotDemand.typographyAssignment,
    });
  }

  // Deterministic compiler only: this creates editable scene-graph candidates,
  // never image-generation jobs or raster composites.
  for (const shotId of TARGETS) {
    const asset = next.library.assets.find((item) => item.shotDemand?.shotId === shotId);
    next = createSceneGraphCandidates(next, asset.id, now);
    const compiled = next.library.assets.find((item) => item.id === asset.id);
    compiled.status = "brief-ready";
    compiled.review = {status: "pending", note: "三锚新原语静态 scene graph 预检完成；禁止自动采用，需受控审片。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
    compiled.candidateSetAudit = {
      ...(compiled.candidateSetAudit || {}),
      contract: "A1ShotCandidateSetAudit/v1",
      status: "STATIC_SCENE_GRAPH_PREFLIGHT",
      validForCurrentProduction: true,
      visualPrimitiveId: primitiveByShot[shotId],
      imageGenerationDispatched: false,
      renderDispatched: false,
      preflightAt: now,
    };
  }

  next.production.visualDirector.anchorStrategySwitchRequired = true;
  next.production.visualDirector.anchorSuiteShotIds = ["ED-01", "ED-02", "ED-03", "ED-14", "ED-10", "ED-32"];
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = next.production.generation.summary.queued === 0 && next.production.generation.summary.running === 0 ? "frozen" : next.production.generation.workerStatus;
  next.production.maturityLoop.status = "three-anchor-static-scene-graph-preflight";
  next.production.maturityLoop.currentStage = "anchor-suite";
  next.production.maturityLoop.nextAction = "visual-anchor-strategy-switch-required";
  next.production.maturityLoop.updatedAt = now;

  const eventPayload = {
    contract: "A1ThreeAnchorPrimitiveStrategySwitch/v1",
    status: "STATIC_SCENE_GRAPH_PREFLIGHT_READY",
    shotIds: TARGETS,
    primitiveByShot,
    beforeSummary,
    imageGenerationDispatched: false,
    renderDispatched: false,
    autoAdoption: false,
    archivedOldCandidates: TARGETS.map((shotId) => ({shotId, candidateCount: beforeSummary[shotId].candidateCount})),
  };
  const event = createProductionEvent({workspace: next, action: "three-anchor-primitive-strategy-preflight", targetId: "anchor-suite", payload: eventPayload, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = recalculateEditorialAssetWorkbench(next, now);
  // The semantic ED-20 correction and the strategy-switch fuse are both
  // authoritative; keep their checkpoint visible after this local migration.
  next.production.incrementalReviewCheckpoint = {
    ...next.production.incrementalReviewCheckpoint,
    scope: "shot-local",
    invalidatedShotIds: [...new Set([...(next.production.incrementalReviewCheckpoint?.invalidatedShotIds || []), "ED-20"])],
    factCorrectionId: next.production.incrementalReviewCheckpoint?.factCorrectionId || "ED-20-source-fact-correction-v1",
    note: "ED-20 事实源纠偏只失效本镜候选、审片和下游绑定；本次只编译 ED-01/ED-14/ED-10 新视觉原语的 brief 与静态 scene graph，不生图、不渲染、不自动采用。",
  };
  next.production.authority = {...next.production.authority, nextAction: {id: "visual-anchor-strategy-switch-required", label: "代表镜头 ED-01、ED-14、ED-10 连续两轮未达标：停止生图，重设视觉原语", requiresUser: false, targetShotIds: TARGETS}};
  next.production.authority.sha256 = sha256Json({...next.production.authority, sha256: undefined});
  next.production.designCalibrationBatch = next.production.authority.designCalibrationBatch;
  next.production.nextAction = next.production.authority.nextAction.label;
  next.production.project.currentStage = "anchor-suite";
  next.production.maturityLoop.currentStage = "anchor-suite";
  next.production.maturityLoop.nextAction = "visual-anchor-strategy-switch-required";
  next.production.maturityLoop.authorityMirrorSha256 = next.production.authority.sha256;
  next.production.visualDirector.anchorStrategySwitchRequired = true;
  next.production.visualDirector.generationFreeze = {
    frozen: true,
    status: "frozen",
    reason: "visual-anchor-strategy-switch-required",
    scope: "anchor-strategy-switch",
    imageGenerationAllowed: false,
    automaticDispatchAllowed: false,
    requiresUser: false,
    targetShotIds: TARGETS,
  };
  const hashInput = structuredClone(next);
  delete hashInput.workspaceSha256;
  if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  next.workspaceSha256 = sha256Json(hashInput);
  next.reviewLedger.workspaceSha256 = next.workspaceSha256;
  assertEditorialAssetWorkbench(next);
  const report = {
    ...eventPayload,
    workspaceSha256Before: before,
    workspaceSha256After: next.workspaceSha256,
    currentNextAction: next.production.authority.nextAction,
    generationSummary: next.production.generation.summary,
    freeze: next.production.visualDirector.generationFreeze,
    shotResults: Object.fromEntries(TARGETS.map((shotId) => {
      const asset = next.library.assets.find((item) => item.shotDemand?.shotId === shotId);
      const graph = asset.candidates?.[0]?.sceneGraph || null;
      return [shotId, {
        assetId: asset.id,
        primitiveId: primitiveByShot[shotId],
        candidateCount: asset.candidates?.length || 0,
        status: asset.status,
        reviewStatus: asset.review?.status,
        compositionPrimitive: graph?.compositionPrimitive || null,
        topology: graph?.topology || null,
        typographyText: graph?.typography?.assignment?.headlineText || null,
        nodeIds: graph?.nodes?.map((node) => node.id) || [],
        hardFailures: graph?.hardFailures || [],
        preflight: asset.candidateSetAudit?.status || null,
      }];
    })),
    eventId: event.eventId,
  };
  persistProjectState(appRoot, next, {event, files: {"three-anchor-primitive-strategy-v1/preflight.json": report}});
  return report;
});

console.log(JSON.stringify(result, null, 2));
