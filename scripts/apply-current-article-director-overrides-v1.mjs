#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const now = new Date().toISOString();

const overrides = {
  contract: "A1ArticleDirectorOverrideSet/v1",
  projectId: "july1-article-visual-director",
  sourceAuthority: "explicit-user-editorial-direction",
  precedence: "after-ai-director-before-scene-layout",
  overrides: [
    {
      shotId: "ED-01",
      reason: "用户明确要求第一句以本人露脸为主，同时对“vibe coding / 智能写作工作台”做成熟文字包装；不能误判为纯净人物镜头。",
      patch: {
        editMode: "presenter-overlay",
        mediumDecisionReason: "开场同时承担作者身份和产品定位：人物建立可信度，两个关键词在真人负空间完成一次身份锁定；包装服务本人，不替代本人。",
        presenterPackage: {
          intensity: "hero",
          keyPhrases: ["vibe coding", "智能写作工作台"],
          spatialAnchor: "mixed-depth",
          faceSafeZone: "LOCK_EYES_AND_MOUTH",
          occlusionRule: "眼睛、嘴、鼻部和主要表情始终无遮挡；英文像素短语进入右上屏幕负空间，中文产品身份在左下桌面负空间锁定，不做底条。",
        },
        overlayBrief: "本人保持全幅主视觉；“vibe coding”用像素编辑短语快速锁定，“智能写作工作台”用厚重中文分两拍出现，均绑定真实空间，不做 Logo、卡片或 HUD。",
        materialRoute: "presenter-real-footage-plus-approved-assets",
        topology: "presenter-negative-space",
        typographyRole: "presenter-hero-identity",
        keyPhrases: ["vibe coding", "智能写作工作台"],
        layoutConstraints: [
          "人物始终是最大视觉演员，包装不得遮挡眼睛、嘴、鼻部和主要表情。",
          "英文像素短语只占右上真实屏幕负空间；中文产品身份只占左下桌面负空间，不使用底条或居中标题卡。",
          "两组文字必须与口播语义同步分拍，并在下一镜真实操作开始前由“工作台”一词完成交接。",
        ],
        motionPhrase: "本人说出 Hi 建立视线；vibe coding 在右上按词级像素扫描锁定；智能写作工作台从左下真实桌面边缘分两拍压入，句尾由“工作台”收束并交给下一镜真实界面。",
        handoffActor: "智能写作工作台",
        structureDirections: [
          "人物居中偏右，vibe coding 占右上屏幕负空间，中文产品身份沿左下桌面边缘形成高低错落的双层锁定。",
          "人物居中偏左，英文短语以小尺度像素节奏出现，中文产品身份在右下形成不等宽双层锁定并保留脸部安全区。",
          "先只见人物与真实房间，英文短语在说到关键词时短促出现，中文产品身份随后从桌面对象方向进入并成为切换真实操作的交接词。",
        ],
        requiredMaterialIds: ["source-presenter-continuous-video"],
        missingMaterialIds: [],
        materialGate: "READY_FOR_DESIGN_AFTER_PLAN_APPROVAL",
        typographyAssignment: {
          contract: "A1ShotTypographyAssignment/v1",
          headlineText: "vibe coding\n智能写作\n工作台",
          treatmentMode: "presenter-hero-editorial-overlay",
          primaryFontAssetIds: ["type-pixel-correction", "type-editorial-heavy"],
          generatedGlyphAssetIds: [],
          bodyTextPolicy: "editable-text-only",
          maxFontRoles: 2,
          candidateDirectionMinimum: 0,
          fontFallbackPolicy: "BLOCK",
          generatedGlyphAllowed: false,
          generatedGlyphMayReplaceEvidenceText: false,
          hardFailures: [
            "default-system-font-fallback",
            "subtitle-stack-as-title",
            "three-equal-type-roles",
            "unverified-ai-lettering",
            "rasterized-body-copy",
            "generic-title-card",
            "presenter-face-occlusion",
          ],
        },
      },
    },
  ],
  appliedAt: now,
};
overrides.sha256 = sha256(overrides);

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const archived = [];
  for (const override of overrides.overrides) {
    const shot = next.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === override.shotId);
    if (!shot) throw new Error(`director-override-shot-missing:${override.shotId}`);
    archived.push({shotId: override.shotId, previousShotDemandSha256: sha256(shot.shotDemand), previousShotDemand: shot.shotDemand});
    shot.shotDemand = {...shot.shotDemand, ...structuredClone(override.patch)};
    shot.candidates = [];
    shot.candidateRender = null;
    shot.selectedCandidateId = null;
    shot.visualCritic = null;
    shot.status = "brief-ready";
    shot.review = {status: "pending", note: "文章级导演纠偏已应用，必须按新媒介和字体合同重新构图。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
    const demand = next.assetRequirementGraph.shotDemands.find((item) => item.shotId === override.shotId);
    if (demand) Object.assign(demand, {
      editMode: override.patch.editMode,
      requiredMaterialIds: override.patch.requiredMaterialIds,
      candidateAssetIds: [...new Set([...(demand.candidateAssetIds || []), "source-presenter-continuous-video", "type-pixel-correction", "type-editorial-heavy"])],
      materialGate: override.patch.materialGate,
    });
  }
  next.production.directorOverrides ||= {contract: "A1ArticleDirectorOverrideLedger/v1", activeSha256: null, history: []};
  next.production.directorOverrides.activeSha256 = overrides.sha256;
  next.production.directorOverrides.history.push({overrideSetSha256: overrides.sha256, appliedAt: now, sourceAuthority: overrides.sourceAuthority, archived});
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.currentStage = "shot-candidates";
  next.production.maturityLoop.nextAction = "rebuild-all-34-shots-after-director-and-presenter-source-change";
  const event = createProductionEvent({workspace: current, action: "article-director-override-applied", targetId: overrides.sha256, payload: {shotIds: overrides.overrides.map((item) => item.shotId), sourceAuthority: overrides.sourceAuthority}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {"director-overrides-v1-latest.json": overrides}});
  return recalculated;
});

console.log(JSON.stringify({
  status: "DIRECTOR_OVERRIDES_APPLIED",
  workspaceSha256: updated.workspaceSha256,
  overrideSetSha256: overrides.sha256,
  nextAction: updated.production.maturityLoop.nextAction,
  shots: overrides.overrides.map((item) => item.shotId),
}, null, 2));
