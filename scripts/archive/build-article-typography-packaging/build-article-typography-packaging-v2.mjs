#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const {chromium} = require("playwright");

const phaseId = "editorial-asset-workbench-v1";
const checkpointId = "article-typography-packaging-v2";
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(publicRoot, checkpointId);
const artifactDir = path.join(artifactRoot, checkpointId);
const checkpointBaseUrl = `/generated/system-line/${phaseId}/${checkpointId}`;
const workspacePublicPath = path.join(publicRoot, "workspace.json");
const workspaceArtifactPath = path.join(artifactRoot, "workspace.json");
const reviewPublicPath = path.join(publicRoot, "review-ledger.json");
const reviewArtifactPath = path.join(artifactRoot, "review-ledger.json");
const buildReportPublicPath = path.join(publicRoot, "report.json");
const buildReportArtifactPath = path.join(artifactRoot, "report.json");
const eventProjectionPublicPath = path.join(publicRoot, "events.json");
const eventLogArtifactPath = path.join(artifactRoot, "events.jsonl");
const now = new Date().toISOString();

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
};
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const copy = (source, destination) => {
  if (!fs.existsSync(source)) throw new Error(`typography-packaging-source-missing:${source}`);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(source, destination);
};
const fileInfo = async (file, publicUrl) => {
  const metadata = await sharp(file).metadata();
  return {publicUrl, sha256: shaFile(file), width: metadata.width, height: metadata.height, bytes: fs.statSync(file).size};
};

fs.mkdirSync(publicDir, {recursive: true});
for (const folder of ["fonts", "sources", "materials", "elements", "frames"]) fs.mkdirSync(path.join(publicDir, folder), {recursive: true});

const fontSources = {
  sans: path.join(publicRoot, "font-cache/SourceHanSansCN-Heavy.otf"),
  condensed: path.join(publicRoot, "font-cache/HarmonyOS-Sans-Condensed-Black.ttf"),
  oblique: path.join(publicRoot, "font-cache/SmileySans-Oblique.otf"),
  handjet: path.join(publicRoot, "font-cache/Handjet-Variable.ttf"),
  fusion: path.join(publicRoot, "font-cache/fusion-pixel.ttf"),
  serif: path.join(root, "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts/SourceHanSerifCN/SourceHanSerifCN-Heavy.otf"),
  jinshu: path.join(root, "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts/system-candidates/ChillJinshuSong-WideBold.otf"),
  handwritten: path.join(root, "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts/GoogleDisplayCN/MaShanZheng-Regular.ttf"),
  anton: path.join(root, "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts/GoogleLatinDisplay/Anton-Regular.ttf"),
};
for (const [id, source] of Object.entries(fontSources)) copy(source, path.join(publicDir, "fonts", `${id}${path.extname(source)}`));

const sourceCache = path.join(publicRoot, "source-cache");
const sourceFiles = {
  presenter: "presenter-opening-frame.jpg",
  selection: "selection-action.png",
  document: "workbench-overview.png",
  resolve: "resolve-timeline-full.png",
};
for (const [id, file] of Object.entries(sourceFiles)) copy(path.join(sourceCache, file), path.join(publicDir, "sources", `${id}${path.extname(file)}`));

const materialSourceDir = path.join(publicRoot, "article-asset-pack-checkpoint-v1/backgrounds");
for (const id of ["bg-warm-paper-dot", "bg-halftone-cream", "bg-charcoal-verdict", "bg-archive-ruling"]) {
  copy(path.join(materialSourceDir, `${id}.png`), path.join(publicDir, "materials", `${id}.png`));
}

const atlasPath = path.join(publicRoot, "article-asset-pack-checkpoint-v1/editorial-elements-atlas.png");
const atlasMetadata = await sharp(atlasPath).metadata();
const atlasWidth = Number(atlasMetadata.width || 0);
const atlasHeight = Number(atlasMetadata.height || 0);
if (!atlasWidth || !atlasHeight) throw new Error("typography-element-atlas-invalid");
const elementFiles = [];
for (let row = 0; row < 3; row += 1) {
  for (let column = 0; column < 4; column += 1) {
    const index = row * 4 + column + 1;
    const left = Math.floor(column * atlasWidth / 4);
    const top = Math.floor(row * atlasHeight / 3);
    const right = Math.floor((column + 1) * atlasWidth / 4);
    const bottom = Math.floor((row + 1) * atlasHeight / 3);
    const output = path.join(publicDir, "elements", `element-${String(index).padStart(2, "0")}.png`);
    const cell = await sharp(atlasPath).extract({left, top, width: right - left, height: bottom - top}).png().toBuffer();
    await sharp(cell).trim({background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toFile(output);
    elementFiles.push(output);
  }
}

const htmlPath = path.join(publicDir, "typography-packaging-board-v2.html");
const css = `
@font-face{font-family:A1Sans;src:url('fonts/sans.otf')}@font-face{font-family:A1Condensed;src:url('fonts/condensed.ttf')}@font-face{font-family:A1Oblique;src:url('fonts/oblique.otf')}@font-face{font-family:A1Serif;src:url('fonts/serif.otf')}@font-face{font-family:A1Jinshu;src:url('fonts/jinshu.otf')}@font-face{font-family:A1Hand;src:url('fonts/handwritten.ttf')}@font-face{font-family:A1Anton;src:url('fonts/anton.ttf')}@font-face{font-family:A1Fusion;src:url('fonts/fusion.ttf')}
*{box-sizing:border-box}html,body{margin:0;width:1940px;height:1100px;overflow:hidden;background:#17191a}body{font-family:A1Sans,sans-serif}.board{display:grid;grid-template-columns:960px 960px;grid-template-rows:540px 540px;gap:20px}.frame{position:relative;width:960px;height:540px;overflow:hidden}.frame:after{content:"";pointer-events:none;position:absolute;inset:0;z-index:20;background-image:url('materials/bg-halftone-cream.png');background-size:cover;mix-blend-mode:multiply;opacity:.08}.material{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.paper{position:absolute;object-fit:contain}.ink{color:#101214}.cream{color:#eee6d8}.blue{color:#2353db}.red{color:#b9272f}.safe{position:absolute;z-index:5}.stroke{text-shadow:3px 3px 0 #111315,-1px -1px 0 #111315}.offprint{text-shadow:8px 5px 0 #2353db}.micro{font:700 12px/1 A1Hand;letter-spacing:.08em}.words span{display:inline-block}

.presenter{background:#090a0c}.presenter .material{filter:saturate(.72) contrast(1.14) brightness(.7);transform:scale(1.03)}.presenter .vignette{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,6,7,.9) 0%,rgba(5,6,7,.25) 42%,rgba(5,6,7,.12) 65%,rgba(5,6,7,.78) 100%)}.presenter .latin{left:-18px;top:44px;font:150px/.78 A1Anton;color:#2353db;opacity:.42;transform:rotate(-7deg);letter-spacing:-.05em}.presenter .paper{left:28px;top:60px;width:340px;height:132px;filter:drop-shadow(9px 10px 0 rgba(0,0,0,.28));transform:rotate(-5deg)}.presenter .lead{left:66px;top:96px;width:270px;font:58px/.82 A1Jinshu;color:#101214;transform:rotate(-5deg);white-space:nowrap}.presenter .main{left:44px;bottom:34px;width:870px;font:82px/.82 A1Oblique;color:#f2eadc;letter-spacing:-.06em;transform:rotate(-2deg);white-space:nowrap}.presenter .main b{font-family:A1Jinshu;color:#dbe4ff}.presenter .note{right:34px;top:34px;width:185px;font:28px/1 A1Hand;color:#f2eadc;text-align:right;transform:rotate(4deg)}

.evidence{background:#e8e1d3}.evidence .material{width:1260px;height:auto;inset:-158px auto auto -172px;filter:grayscale(.88) contrast(1.09);transform:rotate(-2deg)}.evidence .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(232,225,211,.04) 0 52%,rgba(16,18,20,.9) 77% 100%)}.evidence .selection{left:285px;top:209px;width:448px;height:36px;background:rgba(35,83,219,.35);border-bottom:7px solid #2353db;transform:rotate(-2deg);mix-blend-mode:multiply}.evidence .paper{right:-6px;top:82px;width:396px;height:252px;transform:rotate(4deg);filter:drop-shadow(-10px 14px 0 rgba(17,19,21,.22))}.evidence .quote{right:34px;top:116px;width:310px;font:52px/.96 A1Serif;color:#111315;transform:rotate(4deg)}.evidence .quote em{font-style:normal;color:#2353db}.evidence .circle{left:205px;top:130px;width:575px;height:210px;transform:rotate(-8deg)}.evidence .verb{left:40px;bottom:30px;font:112px/.82 A1Jinshu;color:#111315;letter-spacing:-.08em}.evidence .verb b{color:#2353db}.evidence .caption{right:52px;bottom:38px;font:34px/1 A1Hand;color:#eee6d8;transform:rotate(-4deg)}

.verdict{background:#0b0d0e}.verdict .material{filter:brightness(.3) contrast(1.35);opacity:.48;transform:scale(1.16) rotate(-2deg)}.verdict .half{left:-20px;bottom:-38px;width:420px;height:260px;opacity:.65}.verdict .brush{left:62px;top:52px;width:520px;height:190px;filter:drop-shadow(12px 12px 0 rgba(35,83,219,.55));transform:rotate(-4deg)}.verdict .qualifier{left:92px;top:88px;font:68px/.9 A1Serif;color:#eee6d8;transform:rotate(-4deg)}.verdict .waste-a{left:62px;bottom:18px;font:300px/.72 A1Jinshu;color:#eee6d8;letter-spacing:-.12em;transform:rotate(-5deg)}.verdict .waste-b{right:-12px;bottom:-16px;font:320px/.72 A1Jinshu;color:#2353db;letter-spacing:-.12em;transform:rotate(4deg)}.verdict .slash{right:310px;top:245px;width:210px;font:52px/.86 A1Hand;color:#d9353d;transform:rotate(-8deg)}.verdict .evidence-window{right:34px;top:35px;width:278px;height:152px;overflow:hidden;border:8px solid #eee6d8;transform:rotate(4deg);box-shadow:12px 12px 0 #2353db}.verdict .evidence-window img{width:540px;transform:translate(-145px,-75px);filter:grayscale(1) contrast(1.1)}

.method{background:#e9e0cf}.method .material{filter:saturate(.64) contrast(1.12);opacity:.58}.method .ghost{left:-30px;top:-30px;font:250px/.78 A1Anton;color:#101214;opacity:.09;letter-spacing:-.06em}.method .strip{position:absolute;width:500px;height:116px}.method .strip img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;filter:drop-shadow(10px 12px 0 rgba(17,19,21,.18))}.method .strip span{position:absolute;inset:0;display:flex;align-items:center;padding:0 44px;color:#111315}.method .s1{left:40px;top:54px;transform:rotate(-5deg)}.method .s1 span{font:66px/.9 A1Serif}.method .s2{left:258px;top:214px;transform:rotate(3deg)}.method .s2 span{font:78px/.8 A1Jinshu;color:#2353db}.method .s3{right:22px;bottom:42px;transform:rotate(-4deg)}.method .s3 span{font:64px/.9 A1Oblique}.method .index{left:55px;bottom:34px;width:330px;font:54px/.82 A1Hand;color:#b9272f;transform:rotate(-6deg)}.method .clip{right:28px;top:28px;width:118px;height:150px;transform:rotate(7deg)}.method .hand{right:54px;top:176px;width:230px;font:42px/.95 A1Hand;color:#111315;transform:rotate(-6deg)}
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="board">
<section id="frame-presenter" class="frame presenter"><img class="material" src="sources/presenter.jpg"><div class="vignette"></div><div class="safe latin">VIBE<br>CODING</div><img class="safe paper" src="elements/element-01.png"><div class="safe lead">Hi，我用</div><div class="safe main">做了一款 <b>智能写作工作台</b></div><div class="safe note">字跟着人说话<br>不盖眼睛和嘴</div></section>
<section id="frame-evidence" class="frame evidence"><img class="material" src="sources/selection.png"><div class="shade"></div><div class="safe selection"></div><img class="safe circle" src="elements/element-04.png"><img class="safe paper" src="elements/element-07.png"><div class="safe quote">划一下<br>就能让它<em>改</em></div><div class="safe verb">选中 → <b>改写</b></div><div class="safe caption">文字从真实动作里长出来</div></section>
<section id="frame-verdict" class="frame verdict"><img class="material" src="sources/document.png"><img class="safe half" src="elements/element-09.png"><img class="safe brush" src="elements/element-03.png"><div class="safe qualifier">完成度很高的</div><div class="safe waste-a">废</div><div class="safe waste-b">稿</div><div class="safe slash">删掉<br>顺滑的空话</div><div class="safe evidence-window"><img src="sources/document.png"></div></section>
<section id="frame-method" class="frame method"><img class="material" src="materials/bg-archive-ruling.png"><div class="safe ghost">03</div><div class="strip s1"><img src="elements/element-01.png"><span>先给材料</span></div><div class="strip s2"><img src="elements/element-07.png"><span>再找角度</span></div><div class="strip s3"><img src="elements/element-01.png"><span>最后动笔</span></div><div class="safe index">不是一次写完</div><img class="safe clip" src="elements/element-08.png"><div class="safe hand">三个动作<br>三种字体身份</div></section>
</main></body></html>`;
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch({headless: true});
const frameRecords = [];
try {
  const page = await browser.newPage({viewport: {width: 1940, height: 1100}, deviceScaleFactor: 1});
  await page.goto(pathToFileURL(htmlPath).href, {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready);
  const boardPath = path.join(publicDir, "typography-packaging-board-v2.png");
  await page.screenshot({path: boardPath, type: "png"});
  for (const id of ["presenter", "evidence", "verdict", "method"]) {
    const output = path.join(publicDir, "frames", `${id}.png`);
    await page.locator(`#frame-${id}`).screenshot({path: output, type: "png"});
    frameRecords.push({id, ...(await fileInfo(output, `${checkpointBaseUrl}/frames/${id}.png`))});
  }
} finally {
  await browser.close();
}

const boardPath = path.join(publicDir, "typography-packaging-board-v2.png");
const board = await fileInfo(boardPath, `${checkpointBaseUrl}/typography-packaging-board-v2.png`);
const directions = [
  {id: "presenter-bound-oblique", shotId: "ED-01", visualJob: "真人露脸＋文字包装", topology: "footage-bound-oblique-title", typeRoles: ["斜体动作标题", "异形产品词", "手写短批注"], material: "本人真实开场帧", hardRules: ["不盖眼睛和嘴", "工作台不得拆词", "文字必须依附人物语气"]},
  {id: "causal-selection-rewrite", shotId: "ED-02", visualJob: "真实录屏因果动作", topology: "evidence-macro-scan", typeRoles: ["真实正文证据", "宋体判断", "手写动作解释"], material: "真实稿台选句截图", hardRules: ["高亮必须落在真实选区", "改写从选区发生", "不得添加假界面"]},
  {id: "serif-verdict-collision", shotId: "ED-10", visualJob: "纯字体核心判断", topology: "dark-verdict-scale-collision", typeRoles: ["宋体限定语", "金属宋巨型结论", "手写删改"], material: "真实文章证据窗口＋印刷元素", hardRules: ["废与稿为独立词级演员", "证据窗口保留可读性", "蓝色只承担结果冲击"]},
  {id: "material-angle-write-strips", shotId: "ED-17", visualJob: "三步方法论", topology: "editorial-process-strips", typeRoles: ["宋体材料", "异形角度", "斜体动作"], material: "三张可裁切纸条＋档案底材", hardRules: ["三步不是等宽菜单", "每一步独立演员", "纸条运动方向表达流程"]},
];

let workspace = assertEditorialAssetWorkbench(readJson(workspacePublicPath));
const beforeSha = workspace.workspaceSha256;
const typographyAsset = workspace.library.assets.find((asset) => asset.id === "typography-direction-plan");
if (!typographyAsset) throw new Error("typography-direction-plan-missing");
typographyAsset.status = "ready-for-review";
typographyAsset.assetUri = board.publicUrl;
typographyAsset.sha256 = board.sha256;
typographyAsset.preview = {kind: "typography-direction", sampleText: "真人叠字 / 证据扫描 / 巨型判断 / 三步方法", publicUrl: board.publicUrl};
typographyAsset.review = {status: "pending", note: null, reviewedAt: null, approvedContentSha256: null};
typographyAsset.provenance = {sourceType: "deterministic-local-editable-typography-plus-approved-materials", sourceUri: `${checkpointBaseUrl}/report.json`, license: "project-local editable typography; real source and generated editorial materials remain traceable", reviewed: false};

const report = {
  contract: "A1ArticleTypographyPackagingBoard/v2",
  checkpointId,
  status: "READY_FOR_USER_VISUAL_REVIEW",
  generatedAt: now,
  article: {title: workspace.article.title, sourceTextSha256: workspace.article.sourceTextSha256},
  visualThesis: "真实材料承担可信度，字体改变信息身份；用斜体、宋体、异形字、纸条和尺度碰撞形成四种独立包装拓扑。",
  board,
  frames: frameRecords,
  directions,
  validation: {
    exactChineseText: true,
    editableLocalFontRoles: 8,
    independentTopologies: directions.length,
    realPresenterSourceBound: true,
    realScreenSourceBound: true,
    protectedPhrases: ["智能写作工作台", "完成度很高的废稿", "先给材料", "再找角度", "最后动笔"],
    prohibitedFallbacksPresent: false,
  },
  gates: {userVisualApproval: "PENDING", shotCompositionAllowed: false, motionAllowed: false, renderAllowed: false},
  nextAction: "review-four-typography-packaging-directions-on-4311",
};
writeJson(path.join(publicDir, "report.json"), report);

const existingProjection = fs.existsSync(eventProjectionPublicPath) ? readJson(eventProjectionPublicPath) : {contract: "A1ProductionEventProjection/v1", events: []};
const eventPayload = {checkpointId, boardSha256: board.sha256, directionIds: directions.map((item) => item.id)};
const eventBase = {
  contract: "A1ProductionEvent/v1",
  eventId: crypto.randomUUID(),
  projectId: workspace.production.project.projectId,
  action: "record-typography-packaging-v2",
  targetId: "typography-direction-plan",
  actor: "codex-local-operator",
  workspaceSha256Before: beforeSha,
  payloadSha256: shaValue(eventPayload),
  createdAt: now,
};
const event = {...eventBase, eventSha256: shaValue(eventBase)};
existingProjection.events = [...existingProjection.events.filter((item) => item.action !== event.action), event];
existingProjection.eventCount = existingProjection.events.length;
writeJson(eventProjectionPublicPath, existingProjection);
fs.mkdirSync(path.dirname(eventLogArtifactPath), {recursive: true});
fs.appendFileSync(eventLogArtifactPath, `${JSON.stringify(event)}\n`);
workspace.production.eventLedger.eventCount = existingProjection.eventCount;
workspace.production.eventLedger.lastEventId = event.eventId;
workspace.production.eventLedger.lastEventAt = now;
workspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(workspace, now));

fs.rmSync(artifactDir, {recursive: true, force: true});
fs.cpSync(publicDir, artifactDir, {recursive: true});
writeJson(workspacePublicPath, workspace);
writeJson(workspaceArtifactPath, workspace);
writeJson(reviewPublicPath, workspace.reviewLedger);
writeJson(reviewArtifactPath, workspace.reviewLedger);
const buildReport = {
  ...readJson(buildReportPublicPath),
  updatedAt: now,
  workspaceSha256: workspace.workspaceSha256,
  summary: workspace.summary,
  gates: workspace.gates,
  nextAction: workspace.production.nextAction,
  typographyPackagingCheckpoint: {publicUrl: `${checkpointBaseUrl}/report.json`, status: report.status, boardSha256: board.sha256},
};
writeJson(buildReportPublicPath, buildReport);
writeJson(buildReportArtifactPath, buildReport);

console.log(JSON.stringify({status: report.status, board, frames: frameRecords, workspaceSha256: workspace.workspaceSha256, gates: workspace.gates}, null, 2));
