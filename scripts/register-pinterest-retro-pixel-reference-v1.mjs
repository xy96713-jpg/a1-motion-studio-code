#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {A1_PINTEREST_RETRO_PIXEL_REFERENCE_PACK} from "../apps/studio-next/src/lib/a1-pinterest-retro-pixel-reference-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const manifestRelativePath = "generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json";
const manifestPath = path.join(publicRoot, manifestRelativePath);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (file) => sha256(fs.readFileSync(file));
const now = new Date().toISOString();

if (!fs.existsSync(manifestPath)) throw new Error(`pinterest-reference-manifest-missing:${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.contract !== "A1PinterestRetroPixelReferenceManifest/v1" || manifest.packId !== A1_PINTEREST_RETRO_PIXEL_REFERENCE_PACK.id) throw new Error("pinterest-reference-manifest-contract-invalid");
for (const source of manifest.sources || []) {
  const file = path.join(publicRoot, source.publicUrl.replace(/^\//u, ""));
  if (!fs.existsSync(file)) throw new Error(`pinterest-reference-source-missing:${file}`);
  const actual = sha256File(file);
  if (actual !== source.sha256) throw new Error(`pinterest-reference-source-hash-mismatch:${source.id}:${actual}`);
}

const manifestSha256 = sha256File(manifestPath);
const binding = {
  contract: A1_PINTEREST_RETRO_PIXEL_REFERENCE_PACK.contract,
  id: A1_PINTEREST_RETRO_PIXEL_REFERENCE_PACK.id,
  status: A1_PINTEREST_RETRO_PIXEL_REFERENCE_PACK.status,
  sourceType: A1_PINTEREST_RETRO_PIXEL_REFERENCE_PACK.sourceType,
  manifestPublicUrl: `/${manifestRelativePath}`,
  manifestSha256,
  sourceCount: manifest.sources.length,
  referenceOnly: true,
  productionAssetAllowed: false,
  visualThesis: manifest.visualThesis,
  palette: manifest.palette,
  grammar: manifest.grammar,
  sources: manifest.sources.map(({id, publicUrl, sha256: sourceSha256, width, height, role, sourceUrl}) => ({id, publicUrl, sha256: sourceSha256, width, height, role, sourceUrl})),
  simplicityPolicy: {
    contract: "A1EditorialSimplicityPolicy/v1",
    profileId: "minimal-retro-pixel-editorial-v2",
    oneGlanceReadingPathRequired: true,
    maxVisibleActors: 2,
    maxDominantMasses: 2,
    maxCompositionClusters: 2,
    maxSemanticTextBlocks: 1,
    maxAccentColors: 1,
    maxDecorativeMotifs: 0,
    minimumQuietFieldRatio: 0.35,
    removalPassRequired: true,
    textureMustBuildForm: true,
  },
};

const styleRules = [
  "默认美学生成风格锁定为用户 Pinterest 复古像素参考：早期电脑图形、点阵、像素角色、旧系统物件和复古海报排版。",
  "像素网格是表面逻辑，不是全画面滤镜；每个像素字、角色、图标或电脑物件必须承担明确叙事职责。",
  "默认使用黑/白/奶油色底，再选择一到两个高纯度强调色；禁止无目的彩虹装饰。",
  "优先使用非对称海报裁切、模块化网格、旧电脑窗口、CRT/扫描线、抖动和半色调材质。",
  "像素角色、动物和工具必须与论点、动作或转场绑定，不能作为贴纸墙。",
  "中文、英文、数字、Logo 和事实文字必须由 Remotion 可编辑层精确渲染，参考截图只提供视觉语法。",
  "禁止复制 Pinterest 页面 UI、原图 Logo、原句、作者身份或完整 Pin 构图。",
  "默认使用蓝白或奶油/炭黑加钴蓝的单色关系；一眼只允许一条阅读路径、一个主视觉和最多一个辅助关系。",
  "正式画面最多两个主要视觉质量块、两个构图簇和一个语义文字块，至少保留约 35% 安静区域。",
  "任何窗口、箭头、图标、角色、标签和纹理若不改变观众结论，必须在生成前删掉；网点只能塑造体积、压力或分隔。",
];
const hardFailures = [
  "generic-cyberpunk-neon",
  "generic-retro-poster",
  "random-pixel-noise",
  "decorative-pixel-sticker-wall",
  "rainbow-pixel-palette",
  "copied-pinterest-ui-or-source-identity",
  "multiple-equal-weight-reading-paths",
  "more-than-two-dominant-masses",
  "decorative-motif-without-semantic-job",
  "halftone-used-as-empty-space-filler",
];

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  next.visualBible.visualReferencePack = binding;
  next.visualBible.visualGenerationPolicy = {
    ...(next.visualBible.visualGenerationPolicy || {}),
    visualReferencePack: binding,
  };
  next.visualBible.compositionTasteProfile = binding.simplicityPolicy;
  next.visualBible.globalRules = [...new Set([...(next.visualBible.globalRules || []), ...styleRules])];
  next.visualBible.hardFailures = [...new Set([...(next.visualBible.hardFailures || []), ...hardFailures])];
  next.visualBible.materialWorld = {
    ...(next.visualBible.materialWorld || {}),
    generatedAllowed: [...new Set([...(next.visualBible.materialWorld?.generatedAllowed || []), "pixel-grid", "one-bit-dither", "halftone-print", "retro-os-window", "crt-scanline", "pixel-character", "paper-print-texture"])],
    generatedForbidden: [...new Set([...(next.visualBible.materialWorld?.generatedForbidden || []), "generic-cyberpunk-neon", "glossy-3d", "photorealistic-retro-scene", "random-pixel-noise"])],
  };
  next.typographySystem.visualGenerationPolicy = {
    ...(next.typographySystem.visualGenerationPolicy || {}),
    visualReferencePack: binding,
  };
  next.typographySystem.referenceProfile = {
    ...(next.typographySystem.referenceProfile || {}),
    visualReferencePack: binding,
  };
  next.candidateAdmission.visualReferencePack = binding;
  next.production.visualDirector.visualReferencePack = binding;
  next.production.visualDirector.compositionTasteProfile = binding.simplicityPolicy;
  if (!String(next.production.shotIntelligence?.status || "").startsWith("SEMANTIC_PILOT")) next.production.maturityLoop.nextAction = "rebuild-designs-around-user-pinterest-retro-pixel-reference";

  const event = createProductionEvent({
    workspace: current,
    action: "user-pinterest-retro-pixel-reference-registered",
    targetId: binding.id,
    payload: {manifestSha256, sourceCount: binding.sourceCount, styleRules: styleRules.length, activeProfile: binding.simplicityPolicy.profileId},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const report = {
    contract: "A1PinterestRetroPixelReferenceRegistration/v1",
    status: "REGISTERED",
    packId: binding.id,
    manifestPublicUrl: binding.manifestPublicUrl,
    manifestSha256,
    sourceCount: binding.sourceCount,
    sourceHashesVerified: true,
    styleRulesApplied: styleRules,
    hardFailuresApplied: hardFailures,
    simplicityPolicy: binding.simplicityPolicy,
    registeredAt: now,
  };
  report.sha256 = sha256(JSON.stringify(report));
  persistProjectState(appRoot, recalculated, {event, files: {
    "pinterest-retro-pixel-reference-v1-latest.json": report,
    "pinterest-retro-pixel-reference-v1.json": binding,
    "visual-bible.json": recalculated.visualBible,
    "typography-direction.json": recalculated.typographySystem,
  }});
  return {workspace: recalculated, report};
});

console.log(JSON.stringify({
  status: result.report.status,
  packId: result.report.packId,
  sourceCount: result.report.sourceCount,
  manifestSha256: result.report.manifestSha256,
  workspaceSha256: result.workspace.workspaceSha256,
  nextAction: result.workspace.production.maturityLoop.nextAction,
}, null, 2));
