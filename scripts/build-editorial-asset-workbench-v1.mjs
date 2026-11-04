import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  A1_EDITORIAL_ASSET_LIBRARY_CONTRACT,
  A1_EDITORIAL_ASSET_WORKBENCH_CONTRACT,
  A1_EDITORIAL_ASSET_WORKBENCH_PHASE_ID,
  assertEditorialAssetWorkbench,
  editorialAssetContentSha256,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY,
  buildPixelEditorialTypographyAssignment,
} from "../apps/studio-next/src/lib/a1-pixel-editorial-typography-policy-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPublic = path.join(root, "apps/studio-next/public");
const phasePublic = path.join(appPublic, "generated/system-line", A1_EDITORIAL_ASSET_WORKBENCH_PHASE_ID);
const phaseArtifact = path.join(root, ".codex-artifacts/system-progress-system-line", A1_EDITORIAL_ASSET_WORKBENCH_PHASE_ID);
const directorReportPath = path.join(appPublic, "generated/system-line/visual-ai-director-v2-proof/report.json");
const authorityPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const legacyBoardPath = path.join(appPublic, "generated/system-line/accepted-shot-six-slice-v1/candidate-board.json");
const cliArgs = process.argv.slice(2);
const optionValue = (name) => { const index = cliArgs.indexOf(name); return index >= 0 ? cliArgs[index + 1] : null; };
const defaultAestheticMasterPath = "/Users/a1/Documents/Codex/声音/outputs/video_packaging_july1/aesthetic-master-v1/aesthetic-system-contract-v1.json";
const aestheticMasterPath = path.resolve(optionValue("--aesthetic-master") || process.env.A1_AESTHETIC_MASTER_CONTRACT || defaultAestheticMasterPath);
const defaultWholeFilmRunPath = path.join(appPublic, "generated/system-line/current-project-visual-contract-upgrade-v1/current-article-run.json");
const wholeFilmRunPath = path.resolve(optionValue("--whole-film-run") || process.env.A1_WHOLE_FILM_DIRECTOR_RUN || defaultWholeFilmRunPath);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (dir, name, value) => {
  fs.mkdirSync(dir, {recursive: true});
  const target = path.join(dir, name);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
};
const writePair = (name, value) => {
  writeJson(phasePublic, name, value);
  writeJson(phaseArtifact, name, value);
};
const rel = (file) => path.relative(root, file);

if (!fs.existsSync(directorReportPath)) throw new Error(`visual-director-report-missing:${rel(directorReportPath)}`);
if (!fs.existsSync(authorityPropsPath)) throw new Error(`current-authority-props-missing:${rel(authorityPropsPath)}`);
if (!fs.existsSync(wholeFilmRunPath)) throw new Error(`whole-film-director-run-missing:${wholeFilmRunPath}`);

const authorityPropsShaBefore = fileSha(authorityPropsPath);
const directorReport = readJson(directorReportPath);
if (directorReport.contract !== "A1VisualAiDirectorProofReport/v2" || directorReport.status !== "PASS") throw new Error("visual-director-report-not-ready");
const article = directorReport.articleUnderstanding;
const visualDirector = directorReport.visualDirector;
if (!article?.coverage?.exact || !Array.isArray(visualDirector?.shots) || visualDirector.shots.length < 6) throw new Error("visual-director-source-incomplete");
const wholeFilmRun = readJson(wholeFilmRunPath);
const wholeFilmPlan = wholeFilmRun.plan;
if (wholeFilmRun.contract !== "A1WholeFilmAiDirectorRun/v1" || wholeFilmRun.status !== "completed" || wholeFilmPlan?.contract !== "A1WholeFilmAiDirectorPlan/v1") throw new Error("whole-film-director-run-invalid");
if (wholeFilmPlan.coverage?.exact !== true || wholeFilmPlan.coverage?.editTimelineContinuous !== true || wholeFilmPlan.source?.cueCount !== 117 || !Array.isArray(wholeFilmPlan.shots) || wholeFilmPlan.shots.length !== 34 || !Array.isArray(wholeFilmPlan.chapters) || wholeFilmPlan.chapters.length !== 9) throw new Error("whole-film-director-coverage-invalid");
const visualContractFields = ["visualJob", "primaryActor", "materialRoute", "topology", "typographyRole", "keyPhrases", "layoutConstraints", "motionPhrase", "handoffActor", "structureDirections"];
if (wholeFilmPlan.shots.some((shot) => visualContractFields.some((field) => !(field in shot)) || !Array.isArray(shot.structureDirections) || shot.structureDirections.length < 2 || shot.structureDirections.length > 4)) throw new Error("whole-film-director-per-shot-visual-contract-required");
const wholeFilmRunSha256 = fileSha(wholeFilmRunPath);
if (!fs.existsSync(aestheticMasterPath)) throw new Error(`aesthetic-master-contract-missing:${aestheticMasterPath}`);
const aestheticMaster = readJson(aestheticMasterPath);
if (aestheticMaster.contract !== "A1WholeFilmAestheticSystem/v1" || !Array.isArray(aestheticMaster.anchorShots) || !Array.isArray(aestheticMaster.qualityBar?.hardFailures)) throw new Error("aesthetic-master-contract-invalid");
const aestheticMasterSha256 = fileSha(aestheticMasterPath);

fs.mkdirSync(path.join(phasePublic, "source-cache"), {recursive: true});
fs.mkdirSync(path.join(phasePublic, "font-cache"), {recursive: true});

const wholeFilmShots = wholeFilmPlan.shots;
const shotIdsByMode = (mode) => wholeFilmShots.filter((shot) => shot.editMode === mode).map((shot) => shot.shotId);
const screenShotIds = shotIdsByMode("screen-demo");
const presenterShotIds = wholeFilmShots.filter((shot) => shot.editMode.startsWith("presenter-")).map((shot) => shot.shotId);
const packageShotIds = shotIdsByMode("full-package");
const typeOnlyShotIds = shotIdsByMode("type-only");
const chapterById = new Map(wholeFilmPlan.chapters.map((chapter) => [chapter.chapterId, chapter]));
const shotIdsInChapter = (chapterId) => wholeFilmShots.filter((shot) => shot.chapterId === chapterId).map((shot) => shot.shotId);

writePair("whole-film-director-input.json", wholeFilmRun);

const cacheExistingFile = ({source, folder, name}) => {
  if (!fs.existsSync(source)) throw new Error(`source-asset-missing:${rel(source)}`);
  const destination = path.join(phasePublic, folder, name || path.basename(source));
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(source, destination);
  return {assetUri: `/generated/system-line/${A1_EDITORIAL_ASSET_WORKBENCH_PHASE_ID}/${folder}/${path.basename(destination)}`, sha256: fileSha(destination), sourceUri: rel(source)};
};

const fontSources = [
  {id: "type-pixel-correction", name: "像素主视觉字", family: "A1 Fusion Pixel", role: "全文识别性主角 / 修改动作 / 结论重音", sample: "改一句\n留下重点", source: path.join(appPublic, "a1-editorial-fonts/fusion-pixel.ttf")},
];

const fontAssets = fontSources.map((font) => {
  const cached = cacheExistingFile({source: font.source, folder: "font-cache"});
  return asset({
    id: font.id,
    stageId: "typography-board",
    name: font.name,
    purpose: `${font.role}。中文保持可编辑，不把整句烘焙进 AI 图片。`,
    semanticRole: font.role,
    route: "project-font",
    promptBrief: `用“${font.sample}”检查 ${font.role} 的字面、行距、黑度与裁切。`,
    sourceRequirement: "项目内字体资产；需要记录许可并通过中文缺字检查。",
    outputPolicy: "editable-local-type",
    status: "ready-for-review",
    requiredForShotComposition: true,
    ...cached,
    typographyRole: font.role,
    preview: {kind: "font-specimen", sampleText: font.sample, fontFamily: font.family, publicUrl: cached.assetUri},
    provenance: {sourceType: "project-local-font", sourceUri: cached.sourceUri, license: "project-local documented font asset", reviewed: true},
    usedByShotIds: wholeFilmShots.filter((shot) => shot.editMode !== "presenter-clean").map((shot) => shot.shotId),
  });
});

const titleGlyphBriefs = [];

const titleGlyphAssets = titleGlyphBriefs.map((brief) => asset({
  id: brief.id,
  stageId: "typography-board",
  name: brief.name,
  purpose: brief.purpose,
  semanticRole: "generated-display-glyph-candidate-board",
  route: "generated-glyph",
  promptBrief: `只设计标题字形“${brief.exactText}”，同一张透明图集提供 4 个明显不同的轮廓方向：${brief.candidateDirections.join("、")}。字必须逐字准确、完整可读、互不粘连并可独立裁切；禁止生成海报背景、卡片、英文说明或无关装饰。`,
  sourceRequirement: "允许 AI 或人工生成特殊标题字形；必须保留准确的可编辑文字影子层，并逐字人工核验。",
  outputPolicy: "four-direction-transparent-glyph-board; exact-text-review; extractable-title-actors",
  status: "brief-ready",
  requiredForShotComposition: true,
  extractionPolicy: "2x2 candidate board; transparent gutter >= 10%; one reviewed crop per direction; preserve per-word crop where possible",
  typographyRole: "标题特殊字形 / 构图主角",
  typographySpec: {
    kind: "generated-title-glyph-board",
    exactText: brief.exactText,
    editableTextShadowRequired: true,
    evidenceUseAllowed: false,
    candidateMinimum: 4,
    candidateDirections: brief.candidateDirections,
    textVerification: {status: "pending", expectedText: brief.exactText, observedText: null, reviewedBy: null},
  },
  usedByShotIds: brief.usedByShotIds,
}));

const explicitHeadlineByShotId = {
  "ED-07": "为什么不让 AI 直接写完？",
  "ED-08": "AI 常常不说人话",
  "ED-09": "通篇没有重点",
  "ED-10": "完成度很高的废稿",
  "ED-12": "换了五个模型",
  "ED-14": "模型优先走稳妥表达",
  "ED-15": "它不知道你讨厌什么",
  "ED-16": "很顺的泛泛而谈",
  "ED-17": "先给材料 再找角度 最后动笔",
  "ED-18": "把动作固定进流程",
  "ED-19": "Codex 负责后台编排",
  "ED-20": "整理材料 继续编辑",
  "ED-31": "真实问题变成可控工作流",
  "ED-32": "不是一键好稿工具",
  "ED-33": "更加可控 不推翻重来",
  "ED-34": "写出自己的风格",
};
const glyphAssetIdsByShotId = new Map(titleGlyphBriefs.flatMap((brief) => brief.usedByShotIds.map((shotId) => [shotId, brief.id])));

const typographyAssignmentForShot = (shot) => {
  const generatedGlyphAssetId = glyphAssetIdsByShotId.get(shot.shotId) || null;
  return buildPixelEditorialTypographyAssignment({
    shot,
    headlineText: explicitHeadlineByShotId[shot.shotId] || shot.presenterPackage?.keyPhrases?.join("\n") || null,
    generatedGlyphAssetId,
  });
};

const typographySystem = {
  contract: "A1TypographyDirection/v1",
  status: "DEFAULT_SINGLE_FONT_READY_FOR_USER_REVIEW",
  thesis: "Fusion Pixel 是全文唯一当前可编辑正式字体；构图、字号、留白、材质和绑定关系负责变化，不再用换字体制造层级。",
  referenceProfile: A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY,
  policy: {
    editableTextRequired: true,
    minimumApprovedEditableFontRoles: 1,
    requiredGeneratedGlyphBoardIds: titleGlyphBriefs.map((brief) => brief.id),
    singleFontAssetId: "type-pixel-correction",
    singleFontFamily: "A1 Fusion Pixel",
    minimumDirectionsPerDisplayTitle: 0,
    maximumFontRolesPerShot: 1,
    fontFallbackPolicy: "BLOCK",
    generatedGlyphsMayReplaceEvidenceText: false,
    generatedGlyphsRequireEditableTextShadow: true,
    generatedGlyphsRequireExactCharacterReview: true,
    minimumPixelAssignedShotRatio: A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY.minimumPixelAssignedShotRatio,
    minimumDominantPixelShotRatioAmongPackagedShots: A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY.minimumDominantPixelShotRatioAmongPackagedShots,
  },
  selectionAxes: ["字面宽窄", "黑度", "倾斜与方向", "行块轮廓", "材料质感", "与主对象的压叠关系"],
  editableFontRoles: fontSources.map((font) => ({id: font.id, family: font.family, role: font.role, sample: font.sample})),
  displayTreatments: titleGlyphBriefs.map((brief) => ({id: brief.id, exactText: brief.exactText, candidateDirections: brief.candidateDirections, usedByShotIds: brief.usedByShotIds})),
  shotAssignments: wholeFilmShots.map(typographyAssignmentForShot),
  hardFailures: ["default-system-font-fallback", "multiple-current-fonts", "subtitle-stack-as-title", "unverified-ai-lettering", "generated-evidence-text", "generic-title-card"],
};

const typographyDirectionAsset = asset({
  id: "typography-direction-plan",
  stageId: "typography-board",
  name: "全文字体导演 · 34 镜",
  purpose: "先批准字体角色、标题字形路线、逐镜分配和禁止回退规则；不是批准某一个通用标题组件。",
  semanticRole: "whole-film-typography-direction",
  route: "typography-plan",
  promptBrief: "审核 1 个全文统一的可编辑 Fusion Pixel 字体、34 镜逐镜字体分配和禁止回退规则。构图、字号、材质和绑定关系负责变化，不用换字体制造层级。",
  sourceRequirement: "来自整片导演计划、文章原文和审美母版；不调用生图。",
  outputPolicy: "approved-typography-direction-before-shot-composition",
  status: "ready-for-review",
  requiredForShotComposition: true,
  typographyRole: "全文字体导演",
  preview: {kind: "typography-direction", sampleText: "字先成为画面\n再成为标题"},
  provenance: {sourceType: "article-typography-direction", sourceUri: "typography-direction.json", license: "project editorial plan", reviewed: true},
  usedByShotIds: wholeFilmShots.map((shot) => shot.shotId),
});

const backgrounds = [
  ["bg-warm-paper-dot", "暖纸波点", "暖白纸面与稀疏深灰波点，承接文章与编辑部语境。", "radial-gradient(circle at 2px 2px, rgba(32,30,27,.20) 1.2px, transparent 1.3px)", "#e9e1d1", "20px 20px"],
  ["bg-cobalt-ink-field", "钴蓝墨场", "只在判断能量抬升时使用的大面积钴蓝底，不作为常驻品牌条。", "linear-gradient(105deg, rgba(255,255,255,.10), transparent 38%), radial-gradient(circle at 80% 10%, rgba(255,255,255,.16), transparent 30%)", "#234fcd", "auto"],
  ["bg-charcoal-verdict", "炭黑结论场", "纯字体判断与结尾停顿使用，保留大面积黑场和纸白字。", "radial-gradient(circle at 15% 80%, rgba(50,81,210,.24), transparent 34%)", "#111315", "auto"],
  ["bg-halftone-cream", "米白网点印刷", "证据、材料并置时形成印刷感，不模拟网页或文档卡。", "radial-gradient(circle, rgba(33,35,37,.18) 0 1px, transparent 1.2px)", "#f1eadc", "8px 8px"],
  ["bg-archive-ruling", "档案竖纹", "版本轨迹与材料过桥，纵向纹理必须服务时间和层级。", "repeating-linear-gradient(90deg, rgba(25,28,31,.15) 0 1px, transparent 1px 34px)", "#c9c7bd", "auto"],
  ["bg-oxblood-revision", "朱红返修场", "仅用于删改和病句残留的小面积警示背景。", "linear-gradient(145deg, rgba(0,0,0,.18), transparent 50%)", "#7a2f2a", "auto"],
].map(([id, name, purpose, backgroundImage, backgroundColor, backgroundSize], index) => asset({
  id,
  stageId: "background-foundry",
  name,
  purpose,
  semanticRole: ["article-base", "judgment-energy", "verdict-pause", "evidence-material", "version-continuity", "revision-warning"][index],
  route: "deterministic-css",
  promptBrief: `用当前文章视觉策略生成 ${name} 的 16:9 底材样式；不含文字、卡片、HUD 或装饰蓝线。`,
  sourceRequirement: "不需要联网；由可复现色值与纹理参数生成。",
  outputPolicy: "code-native-background",
  status: "ready-for-review",
  requiredForShotComposition: true,
  preview: {kind: "background-swatch", css: {backgroundImage, backgroundColor, backgroundSize}},
  provenance: {sourceType: "deterministic-style-token", sourceUri: directorReport.source?.sourceTextSha256 || null, license: "A1 generated style token", reviewed: true},
  usedByShotIds: wholeFilmShots.filter((shot, shotIndex) => shotIndex % 6 === index || (index === 2 && ["type-only", "presenter-clean"].includes(shot.editMode))).map((shot) => shot.shotId),
}));

const elementAtlases = [
  ["atlas-editor-marks", "编辑痕迹图集", "圈选、删改、替换、边注、压痕、胶带边缘；每个元素必须能单独裁切。", ["ED-15", "ED-18", "ED-24", "ED-25", "ED-26", "ED-31", "ED-33", "ED-34"]],
  ["atlas-print-fragments", "印刷碎片图集", "网点、套色偏移、纸屑、墨迹块和撕边；只做材料层，不承载事实文字。", ["ED-09", "ED-10", "ED-14", "ED-16", "ED-17", "ED-33"]],
  ["atlas-evidence-connectors", "证据连接图集", "选择框、扫描窗、焦点环与对象指针；必须绑定实体，不允许漂浮 HUD。", ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-19", "ED-20", "ED-21", "ED-22", "ED-23", "ED-27", "ED-28", "ED-29", "ED-30"]],
].map(([id, name, promptBrief, usedByShotIds]) => asset({
  id,
  stageId: "element-atlas",
  name,
  purpose: "一次生成多枚可复用小元素，作为不同分镜的排版材料。",
  semanticRole: "reusable-editorial-elements",
  route: "editorial-artwork",
  promptBrief,
  sourceRequirement: "允许生成编辑素材，但不得包含品牌、事实证据、乱码或不可审核文字。",
  outputPolicy: "transparent-atlas-extractable-cells",
  status: "brief-ready",
  requiredForShotComposition: true,
  extractionPolicy: "4x3 atlas; transparent gutter >= 8%; connected-components or reviewed crop boxes; no text",
  usedByShotIds,
}));

const keyBackgrounds = [
  ["key-bg-desk-question", "开场桌面判断场", "真实材质桌面、纸张边缘与局部手部空间；主标题必须仍由可编辑文字承担。", ["ED-07", "ED-08"]],
  ["key-bg-model-material-table", "多模型材料桌", "五种官方实体材料像同一编辑现场里的物件，不做悬浮卡片矩阵。", ["ED-12", "ED-13"]],
  ["key-bg-revision-layers", "版本层叠环境", "五次修改以纸层、覆盖和翻动关系存在，不伪造真实日志。", ["ED-16", "ED-23", "ED-33"]],
  ["key-bg-human-final-pass", "人工终稿背景", "档案、红笔、纸张与最后一次修订的安静结尾；无可读伪手稿。", ["ED-31", "ED-32", "ED-34"]],
].map(([id, name, promptBrief, usedByShotIds]) => asset({
  id,
  stageId: "key-backgrounds",
  name,
  purpose: "为关键镜头提供不可由通用底材替代的环境关系。",
  semanticRole: "shot-specific-environment",
  route: "editorial-artwork",
  promptBrief,
  sourceRequirement: "可使用生成的无字环境底板；不能承担品牌、证据页面或真实屏幕。",
  outputPolicy: "reviewed-text-free-16x9-background",
  status: "brief-ready",
  requiredForShotComposition: true,
  usedByShotIds,
}));

const entityNames = [
  ["openai", "GPT / OpenAI", ["ED-12"]],
  ["claude", "Claude", ["ED-12"]],
  ["kimi", "Kimi", ["ED-12"]],
  ["deepseek", "DeepSeek", ["ED-12"]],
  ["codex", "Codex", ["ED-19", "ED-20"]],
];
const entityAssets = entityNames.map(([filename, name, usedByShotIds]) => {
  const source = path.join(root, `remotion-renderer/public/entity-icons/${filename}.svg`);
  const cached = cacheExistingFile({source, folder: "source-cache"});
  return asset({
    id: `source-entity-${filename}`,
    stageId: "source-materials",
    name: `${name} 官方实体素材`,
    purpose: "只作为文章里明确提到的模型实体，不暗示排名或优劣。",
    semanticRole: "official-entity",
    route: "verified-real-source",
    promptBrief: "保持官方形态；包装只允许裁切、材质承载与中性单色处理。",
    sourceRequirement: "必须来自项目内已核验实体清单。",
    outputPolicy: "source-bound-no-regeneration",
    status: "ready-for-review",
    requiredForShotComposition: true,
    ...cached,
    preview: {kind: "source-image", publicUrl: cached.assetUri},
    provenance: {sourceType: "verified-local-entity", sourceUri: cached.sourceUri, license: "existing verified entity manifest", reviewed: true},
    usedByShotIds,
  });
});

const documentarySources = [
  ["workbench-overview.png", "写作工作台真实屏幕", "/Users/a1/Documents/Codex/声音/outputs/video_packaging_july1/evidence/H08/h08-workbench-current-july1.png", ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-21", "ED-22", "ED-23", "ED-27", "ED-28", "ED-29", "ED-30"]],
  ["selection-action.png", "真实句子选择动作", "/Users/a1/Documents/Codex/声音/outputs/video_packaging_july1/evidence/H09/h09-workbench-selected-sentence-controls.jpg", ["ED-24", "ED-25", "ED-26"]],
  ["document-surface.png", "真实文章证据表面", "/Users/a1/Documents/Codex/声音/outputs/video_packaging_july1/evidence/H07/h07-workbench-current-july1.png", ["ED-09", "ED-14", "ED-16", "ED-19", "ED-20", "ED-33"]],
];
const documentaryAssets = documentarySources.map(([filename, name, source, usedByShotIds]) => {
  const cached = cacheExistingFile({source, folder: "source-cache"});
  return asset({
    id: `source-documentary-${filename.replace(/\.png$/u, "")}`,
    stageId: "source-materials",
    name,
    purpose: "保留真实屏幕和对象关系；只做裁切、调色、遮罩和排版包装。",
    semanticRole: "real-screen-evidence",
    route: "verified-real-source",
    promptBrief: "不得重绘界面或伪造内容；包装后仍能识别来源对象和操作关系。",
    sourceRequirement: "必须绑定本地缓存、来源报告和文件哈希。",
    outputPolicy: "source-bound-crop-and-grade-only",
    status: "ready-for-review",
    requiredForShotComposition: true,
    ...cached,
    preview: {kind: "source-image", publicUrl: cached.assetUri},
    provenance: {sourceType: "verified-local-capture", sourceUri: cached.sourceUri, license: "user-owned local product capture", reviewed: true},
    usedByShotIds,
  });
});

const resolveSources = [
  ["resolve-timeline-full.png", "DaVinci Resolve 真实剪辑时间线", "/Users/a1/Documents/Codex/声音/outputs/packaging_july1/clip_previews/resolve_step_full.png"],
  ["resolve-timeline-sequence.png", "DaVinci Resolve 真实镜头序列", "/Users/a1/Documents/Codex/声音/outputs/packaging_july1/clip_previews/resolve_step_sequence_final_v2.png"],
].map(([filename, name, source]) => {
  const cached = cacheExistingFile({source, folder: "source-cache", name: filename});
  return asset({
    id: `source-resolve-${filename.replace(/\.png$/u, "")}`,
    stageId: "source-materials",
    name,
    purpose: "证明这篇片子在真实 DaVinci 时间线中的镜头、字幕和人物关系；可裁切为创作过程材料，不能重绘为假界面。",
    semanticRole: "real-davinci-editing-evidence",
    route: "verified-real-source",
    promptBrief: "只允许裁切、透视校正、调色和印刷化处理；必须保留 DaVinci 的真实时间线与用户本人画面语境。",
    sourceRequirement: "用户本机真实 DaVinci Resolve 截图。",
    outputPolicy: "source-bound-crop-grade-print-treatment-only",
    status: "ready-for-review",
    requiredForShotComposition: true,
    ...cached,
    preview: {kind: "source-image", publicUrl: cached.assetUri},
    provenance: {sourceType: "user-owned-davinci-screenshot", sourceUri: cached.sourceUri, license: "user-owned local editing screenshot", reviewed: true},
    usedByShotIds: ["ED-01", "ED-18", "ED-31", "ED-34"],
  });
});

const presenterFrameSources = [
  ["presenter-opening-frame.jpg", "本人开场真实帧", "/Users/a1/Documents/Codex/声音/outputs/packaging_july1/source_review/frame_0.jpg", ["ED-01", "ED-07", "ED-08", "ED-11"]],
  ["presenter-closing-frame.jpg", "本人结尾真实帧", "/Users/a1/Documents/Codex/声音/outputs/packaging_july1/source_review/frame_78.jpg", ["ED-13", "ED-18", "ED-31", "ED-32", "ED-34"]],
].map(([filename, name, source, usedByShotIds]) => {
  const cached = cacheExistingFile({source, folder: "source-cache", name: filename});
  return asset({
    id: `source-${filename.replace(/\.(?:jpg|png)$/u, "")}`,
    stageId: "source-materials",
    name,
    purpose: "只作为人物构图、眼线和安全区的真实参考；正式镜头仍必须绑定对应原视频片段。",
    semanticRole: "real-presenter-frame-reference",
    route: "verified-real-source",
    promptBrief: "保留本人真实画面，不得换脸、生成假人物或把人物缩成装饰画中画。",
    sourceRequirement: "用户本人的真实视频抽帧；静帧不能替代最终 presenter take。",
    outputPolicy: "real-presenter-reference-final-video-still-required",
    status: "ready-for-review",
    requiredForShotComposition: true,
    ...cached,
    preview: {kind: "source-image", publicUrl: cached.assetUri},
    provenance: {sourceType: "user-owned-presenter-frame", sourceUri: cached.sourceUri, license: "user-owned presenter footage frame", reviewed: true},
    usedByShotIds,
  });
});

const networkSlots = [
  asset({
    id: "source-network-article-context",
    stageId: "source-materials",
    name: "文章外部来源候选",
    purpose: "只有文章出现外部网页、论文或新闻证据时才联网搜索并缓存。",
    semanticRole: "network-source-slot",
    route: "network-source",
    promptBrief: "搜索与源句事实直接相关的原始来源；记录标题、URL、日期、授权与裁切语境。",
    sourceRequirement: "需要显式联网动作和来源审核；搜索结果不能直接进入画面。",
    outputPolicy: "discovery-cache-then-explicit-promotion",
    status: "source-needed",
    requiredForShotComposition: false,
    usedByShotIds: ["ED-14"],
  }),
  asset({
    id: "source-network-zhipu-official-mark",
    stageId: "source-materials",
    name: "智谱官方标识来源",
    purpose: "ED-12 明确提到智谱；必须找到官方来源并缓存后才能进入模型材料桌。",
    semanticRole: "official-entity-source-slot",
    route: "network-source",
    promptBrief: "只接受智谱官方站点或官方媒体包中的标识，记录 URL、抓取日期和使用边界；不得让 AI 仿画 Logo。",
    sourceRequirement: "需要显式联网发现、来源审核和本地哈希缓存。",
    outputPolicy: "official-source-cache-then-explicit-promotion",
    status: "source-needed",
    requiredForShotComposition: true,
    usedByShotIds: ["ED-12"],
  }),
];

const shotSlots = wholeFilmShots.map((shot, index) => asset({
  id: `composition-${shot.shotId}`,
  stageId: "shot-composition",
  name: `镜头 ${String(index + 1).padStart(2, "0")} · ${shot.sourceText.slice(0, 24)}`,
  purpose: shot.narrativeJob,
  semanticRole: shot.editMode,
  route: "shot-composition",
  promptBrief: `在已批准的同一篇文章资产包内，为 ${shot.shotId} 组合 4–8 个可编辑 scene graph 候选。媒介=${shot.editMode}；观众必须得到“${shot.viewerTakeaway}”。字体合同=${typographyAssignmentForShot(shot).treatmentMode}；标题=${typographyAssignmentForShot(shot).headlineText || "不叠加标题"}。不得回落成白卡、HUD、底条、漂浮 Logo、默认系统字体或字幕堆叠。`,
  sourceRequirement: `chapter=${shot.chapterId}; requiredMaterialIds=${shot.requiredMaterialIds.join(",") || "none"}; materialGate=${shot.materialGate}.`,
  outputPolicy: "4-to-8-editable-scene-graph-compositions-after-asset-pack-approval",
  status: "blocked",
  requiredForShotComposition: false,
  usedByShotIds: [shot.shotId],
  candidates: [],
  shotDemand: {
    contract: "A1ShotDesignDemand/v1",
    shotId: shot.shotId,
    order: shot.order,
    chapterId: shot.chapterId,
    chapterTitle: chapterById.get(shot.chapterId)?.title || shot.chapterId,
    editMode: shot.editMode,
    editWindow: shot.editWindow,
    cueIds: shot.cueIds,
    sourceText: shot.sourceText,
    narrativeJob: shot.narrativeJob,
    viewerTakeaway: shot.viewerTakeaway,
    mediumDecisionReason: shot.mediumDecisionReason,
    presenterDirection: shot.presenterDirection,
    presenterPackage: shot.presenterPackage,
    overlayBrief: shot.overlayBrief,
    screenActions: shot.screenActions,
    packageBrief: shot.packageBrief,
    transitionOut: shot.transitionOut,
    requiredMaterialIds: shot.requiredMaterialIds,
    materialGate: shot.materialGate,
    missingMaterialIds: shot.missingMaterialIds,
    fallbackPolicy: shot.fallbackPolicy,
    visualJob: shot.visualJob,
    primaryActor: shot.primaryActor,
    materialRoute: shot.materialRoute,
    topology: shot.topology,
    typographyRole: shot.typographyRole,
    keyPhrases: shot.keyPhrases,
    layoutConstraints: shot.layoutConstraints,
    motionPhrase: shot.motionPhrase,
    handoffActor: shot.handoffActor,
    structureDirections: shot.structureDirections,
    candidateCount: 0,
    candidateMinimum: 4,
    candidateMaximum: 8,
    candidateGenerationAllowed: false,
    typographyAssignment: typographyAssignmentForShot(shot),
  },
}));

function asset(overrides) {
  return {
    id: "",
    stageId: "article-understanding",
    name: "",
    purpose: "",
    semanticRole: "",
    route: "deterministic-css",
    promptBrief: "",
    sourceRequirement: "",
    outputPolicy: "",
    status: "planned",
    contentSha256: null,
    requiredForShotComposition: false,
    assetUri: null,
    sha256: null,
    usedByShotIds: [],
    extractionPolicy: null,
    typographyRole: null,
    typographySpec: null,
    preview: null,
    candidates: null,
    shotDemand: null,
    provenance: {sourceType: "planned", sourceUri: null, license: null, reviewed: false},
    review: {status: "pending", note: null, reviewedAt: null, reviewedBy: null, approvedContentSha256: null},
    ...overrides,
  };
}

const visualBible = {
  contract: "A1ArticleVisualBible/v1",
  status: "PENDING_USER_APPROVAL",
  sha256: null,
  articleTitle: wholeFilmPlan.source.title,
  articleSha256: wholeFilmPlan.source.articleSha256,
  timeline: {
    authority: wholeFilmPlan.source.timelineAuthority,
    sha256: wholeFilmPlan.source.timelineSha256,
    subtitleSha256: wholeFilmPlan.source.srtSha256,
    cueCount: wholeFilmPlan.source.cueCount,
    durationMs: wholeFilmPlan.source.durationMs,
  },
  editorialThesis: wholeFilmPlan.articleUnderstanding.thesis,
  visualThesis: wholeFilmPlan.strategy.visualThesis,
  recurringMotif: "选择留下痕迹：划选、喜欢、讨厌、拦截、补充和收稿在不同媒介里持续积累，最终汇成作者自己的写作方向。",
  mediumRules: {
    presenter: wholeFilmPlan.strategy.presenterRole,
    screen: wholeFilmPlan.strategy.screenRole,
    package: wholeFilmPlan.strategy.packageRole,
    typeOnly: wholeFilmPlan.strategy.typeOnlyRule,
  },
  rhythmArc: wholeFilmPlan.strategy.rhythmArc,
  chapterDirectives: wholeFilmPlan.chapters.map((chapter) => ({
    chapterId: chapter.chapterId,
    title: chapter.title,
    narrativeArc: chapter.narrativeArc,
    shotIds: shotIdsInChapter(chapter.chapterId),
    mediumCounts: Object.fromEntries(["presenter-clean", "presenter-overlay", "screen-demo", "full-package", "type-only"].map((mode) => [mode, wholeFilmShots.filter((shot) => shot.chapterId === chapter.chapterId && shot.editMode === mode).length])),
  })),
  materialWorld: {
    base: ["真实人物", "真实工作台", "真实 DaVinci 时间线", "纸张与印刷纹理", "可编辑中文字体"],
    generatedAllowed: ["无字环境底板", "可裁切编辑元素", "非证据纸张与墨迹"],
    generatedForbidden: ["假人物", "假界面", "假按钮", "假响应", "事实性证据文字", "仿画品牌标识"],
  },
  typographyRoles: fontSources.map((font) => ({id: font.id, family: font.family, role: font.role, sample: font.sample})),
  paletteRoles: backgrounds.map((background) => ({id: background.id, name: background.name, semanticRole: background.semanticRole})),
  globalRules: wholeFilmPlan.strategy.globalRules,
  hardFailures: [...new Set([...(aestheticMaster.qualityBar?.hardFailures || []), "generic-card-fallback", "floating-hud", "fake-presenter", "fake-interface", "unbound-arrow", "bottom-strip", "raster-only-shot-candidate"])]
};

const visualBibleAsset = asset({
  id: "article-visual-bible",
  stageId: "article-understanding",
  name: "整片导演规划 · 34 镜",
  purpose: "确认整篇文章的视觉论点、人物/录屏/包装/纯字体职责、九章节奏和真实素材边界。",
  semanticRole: "whole-article-visual-direction",
  route: "article-plan",
  promptBrief: "审核整片的媒介分工、节奏弧、材料世界与贯穿母题；任何修改都会让下游资产审批失效。",
  sourceRequirement: `A1WholeFilmAiDirectorRun/v1 ${wholeFilmRunSha256}`,
  outputPolicy: "user-starts-shared-asset-production-after-director-plan",
  status: "ready-for-review",
  requiredForShotComposition: true,
  preview: {kind: "visual-bible"},
  provenance: {sourceType: "whole-film-ai-director-plan", sourceUri: "whole-film-director-input.json", license: "project editorial plan", reviewed: true},
  usedByShotIds: wholeFilmShots.map((shot) => shot.shotId),
});

function requirementRoute(materialId) {
  if (/presenter/iu.test(materialId)) return "presenter-footage";
  if (/(?:screen|workspace|interaction|article-state|response-state|review-result|output-proof|fixture)/iu.test(materialId)) return "real-screen-capture";
  if (/(?:official|identity-mark)/iu.test(materialId)) return "official-entity-source";
  if (/(?:research|source-provenance)/iu.test(materialId)) return "network-research-source";
  if (/(?:type-treatment|type-package|phrase-treatment)/iu.test(materialId)) return "editable-typography-treatment";
  return "article-derived-editorial-material";
}

function candidateAssetsForRequirement(materialId) {
  const route = requirementRoute(materialId);
  if (route === "presenter-footage") return presenterFrameSources.map((item) => item.id);
  if (route === "real-screen-capture") return documentaryAssets.map((item) => item.id);
  if (route === "official-entity-source") {
    if (/zhipu/iu.test(materialId)) return ["source-network-zhipu-official-mark"];
    if (/deepseek/iu.test(materialId)) return ["source-entity-deepseek"];
    if (/codex/iu.test(materialId)) return ["source-entity-codex"];
    if (/claude|anthropic/iu.test(materialId)) return ["source-entity-claude"];
    if (/kimi|moonshot/iu.test(materialId)) return ["source-entity-kimi"];
    return ["source-entity-openai"];
  }
  if (route === "network-research-source") return ["source-network-article-context"];
  if (route === "editable-typography-treatment") return [typographyDirectionAsset.id, ...fontAssets.map((item) => item.id), ...titleGlyphAssets.map((item) => item.id)];
  return [...elementAtlases.map((item) => item.id), ...keyBackgrounds.map((item) => item.id)];
}

const requirementUse = new Map();
for (const shot of wholeFilmShots) {
  for (const materialId of shot.requiredMaterialIds) {
    const current = requirementUse.get(materialId) || [];
    current.push(shot.shotId);
    requirementUse.set(materialId, current);
  }
}
const requirementNodes = [...requirementUse.entries()].map(([materialId, usedByShotIds]) => ({
  materialId,
  route: requirementRoute(materialId),
  usedByShotIds,
  status: "REQUIREMENT_BOUND_OUTPUT_PENDING",
  candidateAssetIds: candidateAssetsForRequirement(materialId),
  exactOutputBound: false,
  fallbackPolicy: "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD",
}));
const assetRequirementGraph = {
  contract: "A1ArticleAssetRequirementGraph/v1",
  status: "REQUIREMENTS_MAPPED_OUTPUTS_PENDING",
  sha256: null,
  articleSha256: wholeFilmPlan.source.articleSha256,
  shotCount: wholeFilmShots.length,
  chapterCount: wholeFilmPlan.chapters.length,
  requirementCount: requirementNodes.length,
  exactOutputBoundCount: requirementNodes.filter((item) => item.exactOutputBound).length,
  requirements: requirementNodes,
  shotDemands: wholeFilmShots.map((shot) => ({
    shotId: shot.shotId,
    chapterId: shot.chapterId,
    editMode: shot.editMode,
    editWindow: shot.editWindow,
    sourceText: shot.sourceText,
    requiredMaterialIds: shot.requiredMaterialIds,
    candidateAssetIds: [...new Set(shot.requiredMaterialIds.flatMap(candidateAssetsForRequirement))],
    materialGate: shot.materialGate,
    fallbackPolicy: shot.fallbackPolicy,
  })),
};

const legacyBoard = fs.existsSync(legacyBoardPath) ? readJson(legacyBoardPath) : null;
const timestamp = new Date().toISOString();
const initialWorkspace = {
  contract: A1_EDITORIAL_ASSET_WORKBENCH_CONTRACT,
  phaseId: A1_EDITORIAL_ASSET_WORKBENCH_PHASE_ID,
  status: "ASSET_LIBRARY_BRIEFING",
  createdAt: timestamp,
  updatedAt: timestamp,
  workspaceSha256: "",
  article: {
    title: wholeFilmPlan.source.title,
    sourceTextSha256: wholeFilmPlan.source.articleSha256,
    thesis: wholeFilmPlan.articleUnderstanding.thesis,
    visualThesis: wholeFilmPlan.strategy.visualThesis,
    sectionCount: wholeFilmPlan.articleUnderstanding.sectionCount,
    chapterCount: wholeFilmPlan.chapters.length,
    shotCount: wholeFilmShots.length,
    cueCount: wholeFilmPlan.source.cueCount,
    durationMs: wholeFilmPlan.source.durationMs,
    sourceReport: `apps/studio-next/public/generated/system-line/${A1_EDITORIAL_ASSET_WORKBENCH_PHASE_ID}/whole-film-director-input.json`,
    sourceReportSha256: wholeFilmRunSha256,
  },
  directorInput: {
    contract: wholeFilmRun.contract,
    planContract: wholeFilmPlan.contract,
    projectId: wholeFilmPlan.projectId,
    localPublicPath: `generated/system-line/${A1_EDITORIAL_ASSET_WORKBENCH_PHASE_ID}/whole-film-director-input.json`,
    localArtifactPath: `.codex-artifacts/system-progress-system-line/${A1_EDITORIAL_ASSET_WORKBENCH_PHASE_ID}/whole-film-director-input.json`,
    sha256: wholeFilmRunSha256,
    exactCueCoverage: wholeFilmPlan.coverage.exact,
    editTimelineContinuous: wholeFilmPlan.coverage.editTimelineContinuous,
    traceCount: wholeFilmPlan.traces.length,
  },
  typographySystem,
  visualBible,
  assetRequirementGraph,
  policy: {
    generationAllowed: false,
    automaticDispatchAllowed: false,
    maximumGenerationConcurrency: 2,
    queuedJobCount: 0,
    networkDiscoveryRequiresExplicitAction: true,
    generatedTextMayBeEvidence: false,
  },
  candidateAdmission: {
    contract: "A1CandidateAdmissionPolicy/v1",
    status: "BOUND_TO_AESTHETIC_MASTER_MATERIAL_GATES_ACTIVE",
    scope: "whole-film-shot-id-and-global-candidate-quality",
    aestheticMaster: {
      contract: aestheticMaster.contract,
      status: aestheticMaster.status,
      sourcePath: aestheticMasterPath,
      sha256: aestheticMasterSha256,
      referenceOnly: true,
      directTemplateCopyAllowed: false,
      compositionStandinPromotionAllowed: false,
      rendererAdoptionAllowed: false,
    },
    visualThesis: aestheticMaster.visualThesis,
    qualityBar: aestheticMaster.qualityBar,
    globalRules: aestheticMaster.globalRules,
    anchorConstraints: aestheticMaster.anchorShots.map((shot) => ({
      shotId: shot.shotId,
      sourceText: shot.sourceText,
      family: shot.family,
      materialStatus: shot.materialStatus,
      finalStatus: shot.finalStatus,
      candidateRule: shot.shotId === "ED-01"
        ? "presenter-clean; no title, logo, interface or decorative overlay; real presenter required for final"
        : shot.shotId === "ED-10"
          ? "full phrase 完成度很高的废稿 readable together; two type roles max; no title card or panel"
          : "presenter plus at most two real choice traces; eyeline and shoulder depth; no English explanation, HUD or bottom strip",
    })),
  },
  library: {
    contract: A1_EDITORIAL_ASSET_LIBRARY_CONTRACT,
    assetPackVersion: "article-asset-pack-v1",
    assetPackSha256: null,
    assets: [visualBibleAsset, ...backgrounds, ...elementAtlases, typographyDirectionAsset, ...fontAssets, ...titleGlyphAssets, ...keyBackgrounds, ...resolveSources, ...presenterFrameSources, ...documentaryAssets, ...entityAssets, ...networkSlots, ...shotSlots],
  },
  stages: [],
  gates: {},
  summary: {},
  legacyBaseline: {
    phaseId: "accepted-shot-six-slice-v1",
    status: "REJECTED_VISUAL_BASELINE",
    candidateCount: legacyBoard?.shots?.reduce((sum, shot) => sum + (shot.candidates?.length || 0), 0) || 24,
    reason: "旧候选仍然以统一卡片、白色文档页和装饰线为主；只保留为失败样本，不再进入 Accepted Shot IR。",
    rendererAdoptionAllowed: false,
  },
  legacyClassification: {
    rejectedCandidateBaseline: {phaseId: "accepted-shot-six-slice-v1", status: "REJECTED_VISUAL_BASELINE", candidateCount: legacyBoard?.shots?.reduce((sum, shot) => sum + (shot.candidates?.length || 0), 0) || 24},
    hSeries: {
      status: "REFERENCE_AND_MASTER_FRAGMENTS_ONLY",
      retained: ["aesthetic master contract", "verified source provenance", "approved font files", "technical renderer checks"],
      rejectedForDirectReuse: ["old shot compositions", "generic card families", "old renderer adoption state"],
      rendererAdoptionAllowed: false,
    },
  },
  reviewLedger: null,
};

const previousWorkspacePath = path.join(phasePublic, "workspace.json");
const previousWorkspace = fs.existsSync(previousWorkspacePath) ? readJson(previousWorkspacePath) : null;
let workspaceDraft = recalculateEditorialAssetWorkbench(initialWorkspace, timestamp);
if (["A1EditorialAssetWorkbench/v1", A1_EDITORIAL_ASSET_WORKBENCH_CONTRACT].includes(previousWorkspace?.contract)) {
  const previousById = new Map(previousWorkspace.library.assets.map((item) => [item.id, item]));
  workspaceDraft.createdAt = previousWorkspace.createdAt || workspaceDraft.createdAt;
  workspaceDraft.library.assets = workspaceDraft.library.assets.map((item) => {
    const previous = previousById.get(item.id);
    const currentContentSha256 = editorialAssetContentSha256(item);
    if (previous?.review?.status === "approved" && previous.review.approvedContentSha256 === currentContentSha256) {
      return {...item, status: "approved", review: previous.review};
    }
    if (previous?.review?.status === "revise" && previous.contentSha256 === currentContentSha256) return {...item, status: "revise", review: previous.review};
    return item;
  });
  workspaceDraft = recalculateEditorialAssetWorkbench(workspaceDraft, timestamp);
}
const workspace = assertEditorialAssetWorkbench(workspaceDraft);
const report = {
  contract: "A1EditorialAssetWorkbenchBuildReport/v1",
  phaseId: A1_EDITORIAL_ASSET_WORKBENCH_PHASE_ID,
  status: "PASS_ASSET_WORKBENCH_READY_REVIEW_REQUIRED",
  generatedAt: timestamp,
  workspaceSha256: workspace.workspaceSha256,
  source: workspace.article,
  directorInput: workspace.directorInput,
  typographySystem: {contract: workspace.typographySystem.contract, status: workspace.typographySystem.status, shotAssignmentCount: workspace.typographySystem.shotAssignments.length, requiredGeneratedGlyphBoardIds: workspace.typographySystem.policy.requiredGeneratedGlyphBoardIds},
  visualBible: {status: workspace.visualBible.status, sha256: workspace.visualBible.sha256},
  assetRequirementGraph: {status: workspace.assetRequirementGraph.status, sha256: workspace.assetRequirementGraph.sha256, requirementCount: workspace.assetRequirementGraph.requirementCount},
  assetPack: {version: workspace.library.assetPackVersion, sha256: workspace.library.assetPackSha256},
  policy: workspace.policy,
  candidateAdmission: workspace.candidateAdmission,
  summary: workspace.summary,
  gates: workspace.gates,
  currentAuthority: {path: rel(authorityPropsPath), sha256Before: authorityPropsShaBefore, sha256After: fileSha(authorityPropsPath), unchanged: authorityPropsShaBefore === fileSha(authorityPropsPath)},
  legacyBaseline: workspace.legacyBaseline,
  nextAction: "start-shared-article-assets-then-review-real-design-results",
};

writePair("workspace.json", workspace);
writePair("review-ledger.json", workspace.reviewLedger);
writePair("report.json", report);
writePair("rejected-baseline.json", workspace.legacyBaseline);
writePair("legacy-classification.json", workspace.legacyClassification);
writePair("visual-bible.json", workspace.visualBible);
writePair("typography-direction.json", workspace.typographySystem);
writePair("asset-requirement-graph.json", workspace.assetRequirementGraph);

console.log(JSON.stringify({status: report.status, phaseId: report.phaseId, workspaceSha256: workspace.workspaceSha256, summary: workspace.summary, gates: workspace.gates, currentAuthorityUnchanged: report.currentAuthority.unchanged}, null, 2));
