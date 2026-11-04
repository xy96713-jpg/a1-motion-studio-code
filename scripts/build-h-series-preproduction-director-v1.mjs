#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";
import {H_SERIES_PREPRODUCTION_DECISIONS_V1, validateHSeriesPreproductionDecisions} from "../lib/h-series-preproduction-decisions-v1.js";

const root = process.cwd();
const rendererRoot = path.join(root, "remotion-renderer");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");

const phaseId = "h-series-preproduction-director-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const entryPoint = path.join(rendererRoot, "src/preproduction-candidate/index.tsx");
const anchorRendererPath = path.join(rendererRoot, "src/preproduction-candidate/HSeriesPreproductionAnchor.tsx");
const h01RendererPath = path.join(rendererRoot, "src/preproduction-candidate/HSeriesH01StaticBoard.tsx");
const h02RendererPath = path.join(rendererRoot, "src/preproduction-candidate/HSeriesH02StaticBoard.tsx");
const h03RendererPath = path.join(rendererRoot, "src/preproduction-candidate/HSeriesH03StaticBoard.tsx");
const h08RendererPath = path.join(rendererRoot, "src/preproduction-candidate/HSeriesH08StaticBoard.tsx");
const remainingRendererPath = path.join(rendererRoot, "src/preproduction-candidate/HSeriesRemainingStaticBoard.tsx");
const currentPropsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const materialManifestPath = path.join(rendererRoot, "src/generated/hSeriesMaterialManifest.json");
const semanticPlanPath = path.join(rendererRoot, "src/hSeriesSemanticDirectorPlan.json");
const typographyPlanPath = path.join(rendererRoot, "src/typography-candidate/hSeriesTypographyDirectorPlan.json");
const decisionSourcePath = path.join(root, "lib/h-series-preproduction-decisions-v1.js");
const currentVideoPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/review-960x540-with-source-audio.mp4");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const anchorBeatIds = ["H01-B01", "H03-B03", "H11-B03"];
const h01BeatIds = ["H01-B01", "H01-B02", "H01-B03", "H01-B04"];
const h02BeatIds = ["H02-B01", "H02-B02", "H02-B03"];
const h03BeatIds = ["H03-B01", "H03-B02", "H03-B03"];
const h08BeatIds = ["H08-B01", "H08-B02", "H08-B03", "H08-B04", "H08-B05", "H08-B06"];
const remainingMacroBeatIds = {
  H04: ["H04-B01", "H04-B02", "H04-B03", "H04-B04"],
  H05: ["H05-B01", "H05-B02", "H05-B03", "H05-B04"],
  H06: ["H06-B01", "H06-B02"],
  H07: ["H07-B01", "H07-B02", "H07-B03", "H07-B04", "H07-B05", "H07-B06"],
  H09: ["H09-B01", "H09-B02", "H09-B03", "H09-B04", "H09-B05", "H09-B06", "H09-B07"],
  H10: ["H10-B01", "H10-B02", "H10-B03", "H10-B04", "H10-B05"],
  H11: ["H11-B01", "H11-B02"],
};
const remainingBeatIds = Object.values(remainingMacroBeatIds).flat();
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

for (const file of [entryPoint, anchorRendererPath, h01RendererPath, h02RendererPath, h03RendererPath, h08RendererPath, remainingRendererPath, currentPropsPath, materialManifestPath, semanticPlanPath, typographyPlanPath, decisionSourcePath, currentVideoPath]) {
  if (!fs.existsSync(file)) throw new Error(`missing:${path.relative(root, file)}`);
}

const currentProps = read(currentPropsPath);
const materialManifest = read(materialManifestPath);
const semanticPlan = read(semanticPlanPath);
const typographyPlan = read(typographyPlanPath);
const decisionsValidation = validateHSeriesPreproductionDecisions();
const sourceScenes = currentProps.scenes || [];
const sourceIds = sourceScenes.map((item) => item.beatId);
const semanticRows = Object.values(semanticPlan.macroDesigns || {}).flat();
const semanticById = new Map(semanticRows.map((item) => [item.beatId, item]));
const typographyRows = Object.entries(typographyPlan.beats || {});
const typographyById = new Map(typographyRows);
const decisionById = new Map(H_SERIES_PREPRODUCTION_DECISIONS_V1.map((item) => [item.beatId, item]));
const materialById = new Map((materialManifest.items || []).map((item) => [item.beatId, item]));
const failures = [...decisionsValidation.failures];

if (sourceScenes.length !== 47) failures.push(`current-scene-count:${sourceScenes.length}`);
if (semanticRows.length !== 47) failures.push(`semantic-scene-count:${semanticRows.length}`);
if (typographyRows.length !== 47) failures.push(`typography-scene-count:${typographyRows.length}`);
if (H_SERIES_PREPRODUCTION_DECISIONS_V1.length !== 47) failures.push(`manual-decision-count:${H_SERIES_PREPRODUCTION_DECISIONS_V1.length}`);
for (const beatId of sourceIds) {
  if (!semanticById.has(beatId)) failures.push(`missing-semantic:${beatId}`);
  if (!typographyById.has(beatId)) failures.push(`missing-typography:${beatId}`);
  if (!decisionById.has(beatId)) failures.push(`missing-manual-decision:${beatId}`);
}
for (const beatId of decisionById.keys()) if (!sourceIds.includes(beatId)) failures.push(`stale-manual-decision:${beatId}`);
if (failures.length) throw new Error(`preproduction-director-invalid:${failures.join(",")}`);

const familyNames = {
  "progress-sans": "行动型无衬线",
  "editorial-serif": "编辑型宋体",
  "compressed-editorial": "窄体判断字",
  "neutral-grotesk": "中性正文黑体",
  "human-note": "人工笔迹",
};
const layoutNames = {
  "staggered-stack": "错位字阶",
  "editorial-column": "编辑栏式",
  "centered-question": "居中提问",
  "split-verdict": "分栏判断",
  "brand-lockup": "中西文锁定",
  "quiet-resolution": "安静收束",
};

function assetStatus(semantic, source) {
  if (semantic.asset) return "bound-current";
  if ((source.entityEvidence || []).length) return "source-bound";
  if (semantic.beatId === "H07-B01") return "reuse-source-evidence";
  if (semantic.route === "real-evidence" && semantic.beatId.startsWith("H04-B0") && !["H04-B01", "H04-B02"].includes(semantic.beatId)) return "reuse-source-evidence";
  if (semantic.route === "real-evidence") return "source-required";
  if (semantic.route === "editorial-artwork") return "artwork-required";
  return "not-required";
}

function backgroundFamily(mode) {
  if (/archive|folder|version|preference/u.test(mode)) return "archive-memory";
  if (/ink|hollow|crushed|tangled|knot|boundary|friction|residue/u.test(mode)) return "tension-ink";
  if (/evidence|roster|comparison/u.test(mode)) return "evidence-paper";
  if (/blueprint|method|procedure|relay|funnel|candidate|writeback|hierarchy|insertion|gap|request/u.test(mode)) return "process-paper";
  if (/direction|open|reading|question|manuscript|field|sentence|inspection|proofreading|context/u.test(mode)) return "open-paper";
  return "editorial-paper";
}

function compositionFamily(mode) {
  if (/question/u.test(mode)) return "question";
  if (/artwork/u.test(mode)) return "artwork";
  if (/archive|stack|sort/u.test(mode)) return "archive";
  if (/evidence|roster/u.test(mode)) return "evidence";
  if (/selection|sentence|before-after|choice/u.test(mode)) return "selection";
  if (/process|sequence|convergence|many-to-one|one-to-few|source-action-result|writeback|insertion|gap/u.test(mode)) return "process";
  if (/verdict|inspection|contrast|void|residue|machine-vs-human/u.test(mode)) return "verdict";
  return "editorial";
}

const scenes = sourceScenes.map((source, index) => {
  const semantic = semanticById.get(source.beatId);
  const typography = typographyById.get(source.beatId);
  const manual = decisionById.get(source.beatId);
  const previous = index > 0 ? decisionById.get(sourceIds[index - 1]) : null;
  const next = index < sourceIds.length - 1 ? decisionById.get(sourceIds[index + 1]) : null;
  const typographyRationale = `本镜先读出“${typography.emphasis}”，因此用${familyNames[typography.family]}与${layoutNames[typography.layout]}建立层级；${semantic.support ? `辅助句只负责补充“${semantic.support}”` : "不增加重复正文"}。`;
  const inheritedEvidence = (materialById.get(source.beatId)?.sources || []).map((item) => ({
    id: item.id,
    name: item.name,
    sourceUrl: item.sourceUrl,
    officialHost: item.officialHost,
    asset: item.asset || item.path,
    assetSha256: item.assetSha256 || item.sha256,
    reviewOnly: true,
  }));
  const evidenceSource = (source.entityEvidence || []).length
    ? source.entityEvidence
    : semantic.route === "real-evidence" ? inheritedEvidence : [];
  const evidence = evidenceSource.map((item) => ({name: item.name, officialHost: item.officialHost, asset: item.asset, assetSha256: item.assetSha256}));
  return {
    contract: "A1HSeriesPreproductionShotDecision/v1",
    beatId: source.beatId,
    macroId: source.macroId,
    source: {
      screenText: source.screenText,
      sourceStartMs: source.sourceStartMs,
      sourceEndMs: source.sourceEndMs,
      lockedHeadlineLines: semantic.lines,
      support: semantic.support || null,
    },
    semantic: {
      viewerTakeaway: manual.viewerTakeaway,
      visualJob: semantic.visualJob,
      whyThisShotExists: `${manual.viewerTakeaway}；画面必须完成“${semantic.visualJob}”。`,
    },
    typography: {
      ...typography,
      familyLabel: familyNames[typography.family],
      layoutLabel: layoutNames[typography.layout],
      rationale: typographyRationale,
    },
    background: {...manual.background, family: backgroundFamily(manual.background.mode)},
    composition: {...manual.composition, family: compositionFamily(manual.composition.mode)},
    elements: manual.elements,
    material: {
      route: semantic.route,
      status: assetStatus(semantic, source),
      selectedAsset: semantic.asset || evidence[0]?.asset || null,
      officialEvidence: evidence,
      rationale: manual.assetTreatment,
      fakeEvidenceAllowed: false,
    },
    continuity: {
      carryIn: previous ? `接住上一镜的${previous.continuityActor}` : "从空白纸面建立第一个可操作句子",
      currentActor: manual.continuityActor,
      carryOut: next ? `把${manual.continuityActor}交给下一镜的${next.continuityActor}` : "让唯一方向安静停留",
      reason: manual.handoffReason,
    },
    review: {
      status: "not-reviewed",
      blockerIfMissing: ["locked-headline-lines", "background-rationale", "semantic-elements", "material-route", "continuity"],
    },
  };
});

const routeCounts = Object.fromEntries([...new Set(scenes.map((item) => item.material.route))].map((route) => [route, scenes.filter((item) => item.material.route === route).length]));
const materialGapBeatIds = scenes.filter((item) => ["source-required", "artwork-required"].includes(item.material.status)).map((item) => item.beatId);
const directorPlan = {
  contract: "A1HSeriesPreproductionDirectorPlan/v1",
  status: "PREPRODUCTION_REVIEW_REQUIRED",
  authority: "current-47-shot-intersection",
  reviewOnly: true,
  animationDesignAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  sourceRule: "current 47-shot props + semantic plan + typography plan + renderer-bound material manifest; stale 50-shot Stage3 plan excluded",
  visualMasterId: "july1-retro-print-archive-wireframe-v1",
  anchorBeatIds,
  summary: {
    sceneCount: scenes.length,
    individuallyDirectedCount: scenes.filter((item) => item.semantic.viewerTakeaway && item.background.rationale && item.composition.rationale && item.material.rationale && item.continuity.reason).length,
    backgroundFamilyCount: new Set(scenes.map((item) => item.background.family)).size,
    backgroundModeCount: new Set(scenes.map((item) => item.background.mode)).size,
    compositionFamilyCount: new Set(scenes.map((item) => item.composition.family)).size,
    compositionModeCount: new Set(scenes.map((item) => item.composition.mode)).size,
    typographyFamilyCount: new Set(scenes.map((item) => item.typography.family)).size,
    h01StaticShotCount: h01BeatIds.length,
    h02StaticShotCount: h02BeatIds.length,
    h03StaticShotCount: h03BeatIds.length,
    h08StaticShotCount: h08BeatIds.length,
    remainingStaticShotCount: remainingBeatIds.length,
    remainingStaticMacroCounts: Object.fromEntries(Object.entries(remainingMacroBeatIds).map(([macro, ids]) => [macro, ids.length])),
    materialRouteCounts: routeCounts,
    materialGapCount: materialGapBeatIds.length,
    materialGapBeatIds,
  },
  h01StaticBoard: {
    status: "STATIC_REVIEW_REQUIRED",
    beatIds: h01BeatIds,
    continuityMotif: "钴蓝选区从原句改写推进为偏好印记、上下文锚点和终稿风格校验",
    cobaltRole: "只标记被选原句、被保存偏好、上下文中的当前改写与最终保留判断",
    redPencilRole: "只标记作者的喜欢、否定与风格冲突批注",
    animationDesignAllowed: false,
  },
  h02StaticBoard: {
    status: "STATIC_REVIEW_REQUIRED",
    beatIds: h02BeatIds,
    continuityMotif: "同一篇稿件从红笔病句定位转为蓝色阅读节拍，随后整张稿纸退场，只留下直接写完全文的反问",
    cobaltRole: "只标记可调阅读状态与被质疑的核心短语",
    redPencilRole: "只标记具体病句与校对结论",
    animationDesignAllowed: false,
  },
  h03StaticBoard: {
    status: "STATIC_REVIEW_REQUIRED",
    beatIds: h03BeatIds,
    continuityMotif: "纠缠纸带先暴露语言打结，再收缩为未被解决的空心缺口，最后压成一团完成度很高的废稿",
    cobaltRole: "只标记纠缠的输出端、问题缺口轮廓与废稿中仍残留的表面完成度",
    redPencilRole: "只标记不说人话、问题未消失与废稿结论",
    animationDesignAllowed: false,
  },
  h08StaticBoard: {
    status: "STATIC_REVIEW_REQUIRED",
    beatIds: h08BeatIds,
    continuityMotif: "同一份稿件从独立存档、五次版本、划选原句、贴附批注、改句决定推进到段落补写",
    cobaltRole: "只标记当前稿件、当前版本、划选范围与插入位置",
    redPencilRole: "只标记作者批注与人工取舍",
    animationDesignAllowed: false,
  },
  remainingStaticBoard: {
    status: "STATIC_REVIEW_REQUIRED",
    beatIds: remainingBeatIds,
    macroBeatIds: remainingMacroBeatIds,
    continuityMotif: "从模型试验、默认表达和流程交接，连续落到上下文补段、阅读边界与作者最终保留的版本",
    cobaltRole: "只标记被确认的来源、流程交接、当前版本、候选选择与写回结果",
    redPencilRole: "只标记未解决问题、硬伤、语言残余与作者人工边界",
    animationDesignAllowed: false,
  },
  scenes,
};

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
const artifactStills = path.join(artifactRoot, "anchors");
const publicStills = path.join(publicRoot, "anchors");
const artifactH01Stills = path.join(artifactRoot, "h01-static-board");
const publicH01Stills = path.join(publicRoot, "h01-static-board");
const artifactH02Stills = path.join(artifactRoot, "h02-static-board");
const publicH02Stills = path.join(publicRoot, "h02-static-board");
const artifactH03Stills = path.join(artifactRoot, "h03-static-board");
const publicH03Stills = path.join(publicRoot, "h03-static-board");
const artifactH08Stills = path.join(artifactRoot, "h08-static-board");
const publicH08Stills = path.join(publicRoot, "h08-static-board");
const artifactRemainingRoot = path.join(artifactRoot, "remaining-static-board");
const publicRemainingRoot = path.join(publicRoot, "remaining-static-board");
fs.mkdirSync(artifactStills, {recursive: true});
fs.mkdirSync(publicStills, {recursive: true});
fs.mkdirSync(artifactH01Stills, {recursive: true});
fs.mkdirSync(publicH01Stills, {recursive: true});
fs.mkdirSync(artifactH02Stills, {recursive: true});
fs.mkdirSync(publicH02Stills, {recursive: true});
fs.mkdirSync(artifactH03Stills, {recursive: true});
fs.mkdirSync(publicH03Stills, {recursive: true});
fs.mkdirSync(artifactH08Stills, {recursive: true});
fs.mkdirSync(publicH08Stills, {recursive: true});
fs.mkdirSync(artifactRemainingRoot, {recursive: true});
fs.mkdirSync(publicRemainingRoot, {recursive: true});
for (const macro of Object.keys(remainingMacroBeatIds)) {
  fs.mkdirSync(path.join(artifactRemainingRoot, macro), {recursive: true});
  fs.mkdirSync(path.join(publicRemainingRoot, macro), {recursive: true});
}
const artifactPlanPath = path.join(artifactRoot, "director-plan.json");
const publicPlanPath = path.join(publicRoot, "director-plan.json");
for (const output of [artifactPlanPath, publicPlanPath]) fs.writeFileSync(output, `${JSON.stringify(directorPlan, null, 2)}\n`);

const currentVideoShaBefore = sha256(currentVideoPath);
const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const anchors = [];
const h01Stills = [];
const h02Stills = [];
const h03Stills = [];
const h08Stills = [];
const remainingStills = Object.fromEntries(Object.keys(remainingMacroBeatIds).map((macro) => [macro, []]));
try {
  for (const beatId of anchorBeatIds) {
    const inputProps = {beatId};
    const composition = await selectComposition({serveUrl, id: "A1HSeriesPreproductionAnchor", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const output = path.join(artifactStills, `${beatId}.png`);
    await renderStill({serveUrl, composition, inputProps, frame: 0, scale: .5, imageFormat: "png", output, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    fs.copyFileSync(output, path.join(publicStills, `${beatId}.png`));
    anchors.push({beatId, publicUrl: `/generated/system-line/${phaseId}/anchors/${beatId}.png`, sha256: sha256(output)});
  }
  for (const beatId of h01BeatIds) {
    const inputProps = {beatId};
    const composition = await selectComposition({serveUrl, id: "A1HSeriesH01StaticBoard", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const output = path.join(artifactH01Stills, `${beatId}.png`);
    await renderStill({serveUrl, composition, inputProps, frame: 0, scale: .5, imageFormat: "png", output, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    fs.copyFileSync(output, path.join(publicH01Stills, `${beatId}.png`));
    h01Stills.push({beatId, publicUrl: `/generated/system-line/${phaseId}/h01-static-board/${beatId}.png`, sha256: sha256(output)});
  }
  for (const beatId of h02BeatIds) {
    const inputProps = {beatId};
    const composition = await selectComposition({serveUrl, id: "A1HSeriesH02StaticBoard", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const output = path.join(artifactH02Stills, `${beatId}.png`);
    await renderStill({serveUrl, composition, inputProps, frame: 0, scale: .5, imageFormat: "png", output, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    fs.copyFileSync(output, path.join(publicH02Stills, `${beatId}.png`));
    h02Stills.push({beatId, publicUrl: `/generated/system-line/${phaseId}/h02-static-board/${beatId}.png`, sha256: sha256(output)});
  }
  for (const beatId of h03BeatIds) {
    const inputProps = {beatId};
    const composition = await selectComposition({serveUrl, id: "A1HSeriesH03StaticBoard", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const output = path.join(artifactH03Stills, `${beatId}.png`);
    await renderStill({serveUrl, composition, inputProps, frame: 0, scale: .5, imageFormat: "png", output, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    fs.copyFileSync(output, path.join(publicH03Stills, `${beatId}.png`));
    h03Stills.push({beatId, publicUrl: `/generated/system-line/${phaseId}/h03-static-board/${beatId}.png`, sha256: sha256(output)});
  }
  for (const beatId of h08BeatIds) {
    const inputProps = {beatId};
    const composition = await selectComposition({serveUrl, id: "A1HSeriesH08StaticBoard", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const output = path.join(artifactH08Stills, `${beatId}.png`);
    await renderStill({serveUrl, composition, inputProps, frame: 0, scale: .5, imageFormat: "png", output, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    fs.copyFileSync(output, path.join(publicH08Stills, `${beatId}.png`));
    h08Stills.push({beatId, publicUrl: `/generated/system-line/${phaseId}/h08-static-board/${beatId}.png`, sha256: sha256(output)});
  }
  for (const beatId of remainingBeatIds) {
    const macro = beatId.slice(0, 3);
    const inputProps = {beatId};
    const composition = await selectComposition({serveUrl, id: "A1HSeriesRemainingStaticBoard", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const output = path.join(artifactRemainingRoot, macro, `${beatId}.png`);
    await renderStill({serveUrl, composition, inputProps, frame: 0, scale: .5, imageFormat: "png", output, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    fs.copyFileSync(output, path.join(publicRemainingRoot, macro, `${beatId}.png`));
    remainingStills[macro].push({beatId, publicUrl: `/generated/system-line/${phaseId}/remaining-static-board/${macro}/${beatId}.png`, sha256: sha256(output)});
  }
} finally {
  await browser.close({silent: true});
}

const tileWidth = 960;
const tileHeight = 540;
const labelHeight = 60;
const composites = [];
const escapeXml = (value) => String(value).replace(/[<>&'"]/gu, (char) => ({"<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;"})[char]);
for (const [index, anchor] of anchors.entries()) {
  const still = await sharp(path.join(artifactStills, `${anchor.beatId}.png`)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const scenePlan = scenes.find((item) => item.beatId === anchor.beatId);
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151719"/><text x="18" y="38" fill="#f2efe7" font-family="Arial,sans-serif" font-weight="700" font-size="21">${escapeXml(anchor.beatId)} · ${escapeXml(scenePlan.semantic.viewerTakeaway)}</text></svg>`);
  const top = index * (tileHeight + labelHeight);
  composites.push({input: still, left: 0, top}, {input: label, left: 0, top: top + tileHeight});
}
const contactSheetPath = path.join(artifactRoot, "anchor-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "anchor-contact-sheet.png");
await sharp({create: {width: tileWidth, height: (tileHeight + labelHeight) * anchors.length, channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(contactSheetPath);
fs.copyFileSync(contactSheetPath, publicContactSheetPath);
const h01Composites = [];
for (const [index, stillMeta] of h01Stills.entries()) {
  const still = await sharp(path.join(artifactH01Stills, `${stillMeta.beatId}.png`)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const scenePlan = scenes.find((item) => item.beatId === stillMeta.beatId);
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151719"/><text x="18" y="38" fill="#f2efe7" font-family="Arial,sans-serif" font-weight="700" font-size="21">${escapeXml(stillMeta.beatId)} · ${escapeXml(scenePlan.source.lockedHeadlineLines.join(" / "))}</text></svg>`);
  const left = (index % 2) * tileWidth;
  const top = Math.floor(index / 2) * (tileHeight + labelHeight);
  h01Composites.push({input: still, left, top}, {input: label, left, top: top + tileHeight});
}
const h01ContactSheetHeight = (tileHeight + labelHeight) * 2;
const h01ContactSheetPath = path.join(artifactRoot, "h01-static-board-contact-sheet.png");
const publicH01ContactSheetPath = path.join(publicRoot, "h01-static-board-contact-sheet.png");
await sharp({create: {width: tileWidth * 2, height: h01ContactSheetHeight, channels: 4, background: "#f2efe7"}}).composite(h01Composites).png().toFile(h01ContactSheetPath);
fs.copyFileSync(h01ContactSheetPath, publicH01ContactSheetPath);
const h02Composites = [];
for (const [index, stillMeta] of h02Stills.entries()) {
  const scenePlan = scenes.find((item) => item.beatId === stillMeta.beatId);
  const fullWidth = index === 2;
  const width = fullWidth ? tileWidth * 2 : tileWidth;
  const still = await sharp(path.join(artifactH02Stills, `${stillMeta.beatId}.png`)).resize(width, tileHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151719"/><text x="18" y="38" fill="#f2efe7" font-family="Arial,sans-serif" font-weight="700" font-size="21">${escapeXml(stillMeta.beatId)} · ${escapeXml(scenePlan.source.lockedHeadlineLines.join(" / "))}</text></svg>`);
  const left = fullWidth ? 0 : index * tileWidth;
  const top = fullWidth ? tileHeight + labelHeight : 0;
  h02Composites.push({input: still, left, top}, {input: label, left, top: top + tileHeight});
}
const h02ContactSheetHeight = (tileHeight + labelHeight) * 2;
const h02ContactSheetPath = path.join(artifactRoot, "h02-static-board-contact-sheet.png");
const publicH02ContactSheetPath = path.join(publicRoot, "h02-static-board-contact-sheet.png");
await sharp({create: {width: tileWidth * 2, height: h02ContactSheetHeight, channels: 4, background: "#f2efe7"}}).composite(h02Composites).png().toFile(h02ContactSheetPath);
fs.copyFileSync(h02ContactSheetPath, publicH02ContactSheetPath);
const h03Composites = [];
for (const [index, stillMeta] of h03Stills.entries()) {
  const scenePlan = scenes.find((item) => item.beatId === stillMeta.beatId);
  const fullWidth = index === 2;
  const width = fullWidth ? tileWidth * 2 : tileWidth;
  const still = await sharp(path.join(artifactH03Stills, `${stillMeta.beatId}.png`)).resize(width, tileHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151719"/><text x="18" y="38" fill="#f2efe7" font-family="Arial,sans-serif" font-weight="700" font-size="21">${escapeXml(stillMeta.beatId)} · ${escapeXml(scenePlan.source.lockedHeadlineLines.join(" / "))}</text></svg>`);
  const left = fullWidth ? 0 : index * tileWidth;
  const top = fullWidth ? tileHeight + labelHeight : 0;
  h03Composites.push({input: still, left, top}, {input: label, left, top: top + tileHeight});
}
const h03ContactSheetHeight = (tileHeight + labelHeight) * 2;
const h03ContactSheetPath = path.join(artifactRoot, "h03-static-board-contact-sheet.png");
const publicH03ContactSheetPath = path.join(publicRoot, "h03-static-board-contact-sheet.png");
await sharp({create: {width: tileWidth * 2, height: h03ContactSheetHeight, channels: 4, background: "#f2efe7"}}).composite(h03Composites).png().toFile(h03ContactSheetPath);
fs.copyFileSync(h03ContactSheetPath, publicH03ContactSheetPath);
const h08Composites = [];
for (const [index, stillMeta] of h08Stills.entries()) {
  const still = await sharp(path.join(artifactH08Stills, `${stillMeta.beatId}.png`)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const scenePlan = scenes.find((item) => item.beatId === stillMeta.beatId);
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151719"/><text x="18" y="38" fill="#f2efe7" font-family="Arial,sans-serif" font-weight="700" font-size="21">${escapeXml(stillMeta.beatId)} · ${escapeXml(scenePlan.source.lockedHeadlineLines.join(" / "))}</text></svg>`);
  const left = (index % 2) * tileWidth;
  const top = Math.floor(index / 2) * (tileHeight + labelHeight);
  h08Composites.push({input: still, left, top}, {input: label, left, top: top + tileHeight});
}
const h08ContactSheetHeight = (tileHeight + labelHeight) * 3;
const h08ContactSheetPath = path.join(artifactRoot, "h08-static-board-contact-sheet.png");
const publicH08ContactSheetPath = path.join(publicRoot, "h08-static-board-contact-sheet.png");
await sharp({create: {width: tileWidth * 2, height: h08ContactSheetHeight, channels: 4, background: "#f2efe7"}}).composite(h08Composites).png().toFile(h08ContactSheetPath);
fs.copyFileSync(h08ContactSheetPath, publicH08ContactSheetPath);
const remainingContactSheets = {};
for (const [macro, stills] of Object.entries(remainingStills)) {
  const composites = [];
  for (const [index, stillMeta] of stills.entries()) {
    const still = await sharp(path.join(artifactRemainingRoot, macro, `${stillMeta.beatId}.png`)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const scenePlan = scenes.find((item) => item.beatId === stillMeta.beatId);
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151719"/><text x="18" y="38" fill="#f2efe7" font-family="Arial,sans-serif" font-weight="700" font-size="21">${escapeXml(stillMeta.beatId)} · ${escapeXml(scenePlan.source.lockedHeadlineLines.join(" / "))}</text></svg>`);
    const left = (index % 2) * tileWidth;
    const top = Math.floor(index / 2) * (tileHeight + labelHeight);
    composites.push({input: still, left, top}, {input: label, left, top: top + tileHeight});
  }
  const height = Math.ceil(stills.length / 2) * (tileHeight + labelHeight);
  const contactSheetPath = path.join(artifactRoot, `${macro.toLowerCase()}-static-board-contact-sheet.png`);
  const publicContactSheetPath = path.join(publicRoot, `${macro.toLowerCase()}-static-board-contact-sheet.png`);
  await sharp({create: {width: tileWidth * 2, height, channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(contactSheetPath);
  fs.copyFileSync(contactSheetPath, publicContactSheetPath);
  remainingContactSheets[macro] = {
    publicUrl: `/generated/system-line/${phaseId}/${macro.toLowerCase()}-static-board-contact-sheet.png`,
    sha256: sha256(contactSheetPath),
    width: tileWidth * 2,
    height,
  };
}
const currentVideoShaAfter = sha256(currentVideoPath);
const report = {
  contract: "A1HSeriesPreproductionDirectorReport/v1",
  status: currentVideoShaBefore === currentVideoShaAfter && anchors.length === 3 && h01Stills.length === 4 && h02Stills.length === 3 && h03Stills.length === 3 && h08Stills.length === 6 && remainingBeatIds.every((beatId) => remainingStills[beatId.slice(0, 3)]?.some((item) => item.beatId === beatId)) ? "READY_FOR_PREPRODUCTION_REVIEW" : "BLOCKED",
  reviewOnly: true,
  currentAuthorityUntouched: currentVideoShaBefore === currentVideoShaAfter,
  animationDesignAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  sourceBinding: {
    currentPropsPath: path.relative(root, currentPropsPath),
    currentPropsSha256: sha256(currentPropsPath),
    materialManifestPath: path.relative(root, materialManifestPath),
    materialManifestSha256: sha256(materialManifestPath),
    semanticPlanPath: path.relative(root, semanticPlanPath),
    semanticPlanSha256: sha256(semanticPlanPath),
    typographyPlanPath: path.relative(root, typographyPlanPath),
    typographyPlanSha256: sha256(typographyPlanPath),
    decisionSourcePath: path.relative(root, decisionSourcePath),
    decisionSourceSha256: sha256(decisionSourcePath),
    h01RendererPath: path.relative(root, h01RendererPath),
    h01RendererSha256: sha256(h01RendererPath),
    h02RendererPath: path.relative(root, h02RendererPath),
    h02RendererSha256: sha256(h02RendererPath),
    h03RendererPath: path.relative(root, h03RendererPath),
    h03RendererSha256: sha256(h03RendererPath),
    h08RendererPath: path.relative(root, h08RendererPath),
    h08RendererSha256: sha256(h08RendererPath),
    remainingRendererPath: path.relative(root, remainingRendererPath),
    remainingRendererSha256: sha256(remainingRendererPath),
    excludedStalePlan: "lib/h-series-full-director-plan-v1.js",
    currentVideoSha256: currentVideoShaAfter,
  },
  summary: directorPlan.summary,
  anchorBeatIds,
  anchors,
  h01StaticBoard: {
    shotCount: h01Stills.length,
    beatIds: h01BeatIds,
    stills: h01Stills,
    continuityMotif: directorPlan.h01StaticBoard.continuityMotif,
    animationDesignAllowed: false,
  },
  h02StaticBoard: {
    shotCount: h02Stills.length,
    beatIds: h02BeatIds,
    stills: h02Stills,
    continuityMotif: directorPlan.h02StaticBoard.continuityMotif,
    animationDesignAllowed: false,
  },
  h03StaticBoard: {
    shotCount: h03Stills.length,
    beatIds: h03BeatIds,
    stills: h03Stills,
    continuityMotif: directorPlan.h03StaticBoard.continuityMotif,
    animationDesignAllowed: false,
  },
  h08StaticBoard: {
    shotCount: h08Stills.length,
    beatIds: h08BeatIds,
    stills: h08Stills,
    continuityMotif: directorPlan.h08StaticBoard.continuityMotif,
    animationDesignAllowed: false,
  },
  remainingStaticBoard: {
    shotCount: remainingBeatIds.length,
    beatIds: remainingBeatIds,
    macros: Object.fromEntries(Object.entries(remainingMacroBeatIds).map(([macro, beatIds]) => [macro, {
      shotCount: beatIds.length,
      beatIds,
      stills: remainingStills[macro],
      contactSheet: remainingContactSheets[macro],
      animationDesignAllowed: false,
    }])),
    continuityMotif: directorPlan.remainingStaticBoard.continuityMotif,
    animationDesignAllowed: false,
  },
  media: {
    contactSheet: {publicUrl: `/generated/system-line/${phaseId}/anchor-contact-sheet.png`, sha256: sha256(contactSheetPath), width: tileWidth, height: (tileHeight + labelHeight) * anchors.length},
    h01ContactSheet: {publicUrl: `/generated/system-line/${phaseId}/h01-static-board-contact-sheet.png`, sha256: sha256(h01ContactSheetPath), width: tileWidth * 2, height: h01ContactSheetHeight},
    h02ContactSheet: {publicUrl: `/generated/system-line/${phaseId}/h02-static-board-contact-sheet.png`, sha256: sha256(h02ContactSheetPath), width: tileWidth * 2, height: h02ContactSheetHeight},
    h03ContactSheet: {publicUrl: `/generated/system-line/${phaseId}/h03-static-board-contact-sheet.png`, sha256: sha256(h03ContactSheetPath), width: tileWidth * 2, height: h03ContactSheetHeight},
    h08ContactSheet: {publicUrl: `/generated/system-line/${phaseId}/h08-static-board-contact-sheet.png`, sha256: sha256(h08ContactSheetPath), width: tileWidth * 2, height: h08ContactSheetHeight},
    remainingContactSheets: remainingContactSheets,
  },
  directorPlan: {publicUrl: `/generated/system-line/${phaseId}/director-plan.json`, sha256: sha256(artifactPlanPath)},
  failures: currentVideoShaBefore === currentVideoShaAfter ? [] : ["current-authority-video-mutated"],
  nextAction: "review-static-boards-and-motion-candidate-before-source-adoption",
};
for (const output of [path.join(artifactRoot, "report.json"), path.join(publicRoot, "report.json")]) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

const currentPhase = read(currentPhasePath);
if (currentPhase.contract !== "A1SystemLineCurrentPhase/v1" || currentPhase.phaseId !== "h-series-semantic-directed-v1") {
  throw new Error(`unexpected-current-phase:${currentPhase.contract || "missing"}:${currentPhase.phaseId || "missing"}`);
}
currentPhase.generatedAt = new Date().toISOString();
currentPhase.preproduction = {
  status: report.status,
  reportPath: `apps/studio-next/public/generated/system-line/${phaseId}/report.json`,
  reportSha256: sha256(path.join(publicRoot, "report.json")),
  directorPlanPath: `apps/studio-next/public/generated/system-line/${phaseId}/director-plan.json`,
  directorPlanSha256: sha256(publicPlanPath),
  anchorContactSheetPath: `apps/studio-next/public/generated/system-line/${phaseId}/anchor-contact-sheet.png`,
  anchorContactSheetSha256: sha256(publicContactSheetPath),
  h01StaticBoardContactSheetPath: `apps/studio-next/public/generated/system-line/${phaseId}/h01-static-board-contact-sheet.png`,
  h01StaticBoardContactSheetSha256: sha256(publicH01ContactSheetPath),
  h02StaticBoardContactSheetPath: `apps/studio-next/public/generated/system-line/${phaseId}/h02-static-board-contact-sheet.png`,
  h02StaticBoardContactSheetSha256: sha256(publicH02ContactSheetPath),
  h03StaticBoardContactSheetPath: `apps/studio-next/public/generated/system-line/${phaseId}/h03-static-board-contact-sheet.png`,
  h03StaticBoardContactSheetSha256: sha256(publicH03ContactSheetPath),
  h08StaticBoardContactSheetPath: `apps/studio-next/public/generated/system-line/${phaseId}/h08-static-board-contact-sheet.png`,
  h08StaticBoardContactSheetSha256: sha256(publicH08ContactSheetPath),
  remainingStaticBoardContactSheets: Object.fromEntries(Object.entries(remainingContactSheets).map(([macro, media]) => [macro, {
    path: `apps/studio-next/public/generated/system-line/${phaseId}/${macro.toLowerCase()}-static-board-contact-sheet.png`,
    sha256: sha256(path.join(publicRoot, `${macro.toLowerCase()}-static-board-contact-sheet.png`)),
  }])),
  sceneCount: directorPlan.summary.sceneCount,
  anchorCount: anchors.length,
  h01StaticShotCount: h01Stills.length,
  h02StaticShotCount: h02Stills.length,
  h03StaticShotCount: h03Stills.length,
  h08StaticShotCount: h08Stills.length,
  remainingStaticShotCount: remainingBeatIds.length,
  animationDesignAllowed: false,
  fullMp4RenderAllowed: false,
};
currentPhase.next = {
  recommended: {
    id: "review-static-boards-and-motion-candidate-before-source-adoption",
    reason: "Review all 47 static boards together with the 12-shot moving proof before any source adoption or full-film render is allowed.",
    requiresExplicitApproval: false,
    riskTags: ["preproduction-only", "47-shot-current-intersection", "all-47-static-shots", "current-bound-editorial-artwork", "no-animation", "no-full-mp4", "stale-50-shot-plan-excluded"],
  },
};
fs.writeFileSync(currentPhasePath, `${JSON.stringify(currentPhase, null, 2)}\n`);

console.log(JSON.stringify({status: report.status, summary: report.summary, anchorBeatIds, h01BeatIds, h02BeatIds, h03BeatIds, h08BeatIds, currentAuthorityUntouched: report.currentAuthorityUntouched, reviewUrl: "http://127.0.0.1:4311/system-line-review#preproduction-director"}, null, 2));
