#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const outputRelative = `${phaseRelative}/article-typography-direction-v3`;
const outputDir = path.join(publicRoot, outputRelative);
const require = createRequire(path.join(root, "package.json"));
const {chromium} = require("playwright");
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const asFileUrl = (file) => pathToFileURL(file).href;
const publicFile = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\/+/, ""));

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const typographyAsset = workspace.library.assets.find((asset) => asset.id === "typography-direction-plan");
if (!typographyAsset) throw new Error("typography-direction-plan-missing");

const fontById = (id) => {
  const asset = workspace.library.assets.find((item) => item.id === id && item.route === "project-font" && item.review.status === "approved");
  if (!asset?.assetUri || !fs.existsSync(publicFile(asset.assetUri))) throw new Error(`typography-direction-font-missing:${id}`);
  return asset;
};
const selectedGlyph = (id) => {
  const asset = workspace.library.assets.find((item) => item.id === id && item.route === "generated-glyph" && item.review.status === "approved" && item.visualCritic?.totalScore >= 22);
  const candidate = asset?.typographySpec?.generatedCandidates?.find((item) => item.id === asset.selectedCandidateId);
  if (!asset || !candidate?.publicUrl || !fs.existsSync(publicFile(candidate.publicUrl))) throw new Error(`typography-direction-approved-glyph-missing:${id}`);
  return {asset, candidate};
};
const sourceAsset = (predicate, label) => {
  const asset = workspace.library.assets.find((item) => item.review.status === "approved" && item.assetUri && predicate(item));
  if (!asset || !fs.existsSync(publicFile(asset.assetUri))) throw new Error(`typography-direction-source-missing:${label}`);
  return asset;
};

const fonts = {
  heavy: fontById("type-editorial-heavy"),
  slanted: fontById("type-slanted-display"),
  serif: fontById("type-condensed-impact"),
  pixel: fontById("type-pixel-correction"),
  human: fontById("type-human-accent"),
};
const glyphs = {
  ai: selectedGlyph("glyph-board-ai-taste"),
  waste: selectedGlyph("glyph-board-polished-waste"),
  method: selectedGlyph("glyph-board-material-angle-write"),
  control: selectedGlyph("glyph-board-control-not-restart"),
};
const presenter = sourceAsset((item) => /presenter/iu.test(`${item.id} ${item.provenance?.sourceType || ""}`), "presenter");
const screen = sourceAsset((item) => item.id === "source-documentary-selection-action" && item.route === "verified-real-source", "screen-selection-action");
const article = sourceAsset((item) => item.id === "source-documentary-document-surface" && item.route === "verified-real-source", "article-document-surface");

fs.mkdirSync(path.join(outputDir, "frames"), {recursive: true});
const round = Math.max(1, Number(typographyAsset.visualRevision?.round || 1));
const revisionBrief = String(typographyAsset.visualRevision?.prompt || "").slice(0, 1200);
const sourceSha256 = sha256({
  glyphs: Object.fromEntries(Object.entries(glyphs).map(([id, value]) => [id, value.candidate.sha256])),
  fonts: Object.fromEntries(Object.entries(fonts).map(([id, value]) => [id, value.sha256])),
  presenter: presenter.sha256,
  screen: screen.sha256,
  article: article.sha256,
  round,
  revisionBrief,
});

const urls = {
  fontHeavy: asFileUrl(publicFile(fonts.heavy.assetUri)),
  fontSlanted: asFileUrl(publicFile(fonts.slanted.assetUri)),
  fontSerif: asFileUrl(publicFile(fonts.serif.assetUri)),
  fontPixel: asFileUrl(publicFile(fonts.pixel.assetUri)),
  fontHuman: asFileUrl(publicFile(fonts.human.assetUri)),
  presenter: asFileUrl(publicFile(presenter.assetUri)),
  screen: asFileUrl(publicFile(screen.assetUri)),
  article: asFileUrl(publicFile(article.assetUri)),
  ai: asFileUrl(publicFile(glyphs.ai.candidate.publicUrl)),
  waste: asFileUrl(publicFile(glyphs.waste.candidate.publicUrl)),
  method: asFileUrl(publicFile(glyphs.method.candidate.publicUrl)),
  control: asFileUrl(publicFile(glyphs.control.candidate.publicUrl)),
};

const htmlPath = path.join(outputDir, `board-round-${String(round).padStart(2, "0")}.html`);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
@font-face{font-family:A1Heavy;src:url('${urls.fontHeavy}')}@font-face{font-family:A1Slanted;src:url('${urls.fontSlanted}')}@font-face{font-family:A1Serif;src:url('${urls.fontSerif}')}@font-face{font-family:A1Pixel;src:url('${urls.fontPixel}')}@font-face{font-family:A1Human;src:url('${urls.fontHuman}')}
*{box-sizing:border-box}html,body{margin:0;background:#070909;color:#f2ecdf}body{width:1920px}.frame{position:relative;width:1920px;height:1080px;overflow:hidden;background:#111315}.fill{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.safe{position:absolute}.grain{position:absolute;inset:0;opacity:.14;mix-blend-mode:multiply;background-image:radial-gradient(circle at 1px 1px,#111 1px,transparent 1.25px);background-size:9px 9px;pointer-events:none}.blue{color:#214fd1}.red{color:#b5211e}.cream{color:#f3eddf}.ink{color:#101313}
.presenter .fill{object-position:center 38%;filter:saturate(.78) contrast(1.08) brightness(.73)}.presenter:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,9,10,.92) 0%,rgba(7,9,10,.45) 36%,rgba(7,9,10,.05) 57%,rgba(7,9,10,.45) 100%)}.presenter .premise{z-index:2;left:6%;top:10%;font:92px/1 A1Slanted;letter-spacing:-.05em;transform:rotate(-4deg);max-width:720px}.presenter .question{z-index:2;left:5%;bottom:8%;font:150px/.87 A1Heavy;letter-spacing:-.08em;width:1020px}.presenter .question b{font-family:A1Pixel;font-weight:500;color:#e9ff56;text-shadow:10px 10px 0 #183ba2}.presenter .stroke{z-index:2;left:4.6%;bottom:5.5%;width:830px;height:20px;background:#f0e9dc;transform:rotate(-2deg);clip-path:polygon(0 38%,100% 0,98% 72%,3% 100%)}
.screen{background:#ece5d7}.screen .fill{inset:7% 4% 8% 35%;width:61%;height:85%;object-position:center;filter:saturate(.72) contrast(1.03);box-shadow:0 30px 90px rgba(9,12,14,.22)}.screen .rail{left:4%;top:0;width:27%;height:100%;background:#101314}.screen .action{left:6%;top:9%;width:460px;font:118px/.88 A1Serif;letter-spacing:-.07em}.screen .action strong{display:block;font-family:A1Pixel;color:#e9ff56;font-weight:500;margin-top:18px}.screen .cause{left:6%;bottom:12%;font:50px/.95 A1Heavy;width:420px}.screen .focus{right:16%;top:42%;width:420px;height:130px;border:16px solid #214fd1;border-left-width:30px;transform:rotate(-2deg);mix-blend-mode:multiply}.screen .focus:after{content:"";position:absolute;left:-36px;right:-12px;bottom:-24px;height:15px;background:#b5211e;transform:rotate(1deg)}
.glyph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.glyph .editable{position:absolute;z-index:2;font-family:A1Pixel;letter-spacing:.02em}.glyph .evidence{position:absolute;z-index:2;overflow:hidden;background:#eee7d8;box-shadow:0 18px 50px rgba(0,0,0,.3)}.glyph .evidence img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.1)}
.ai .editable{left:6%;bottom:8%;font-size:48px;color:#101313;background:#e9ff56;padding:16px 26px;transform:rotate(-2deg)}
.waste .editable{right:5%;top:8%;font:54px A1Human;color:#b5211e;transform:rotate(5deg)}.waste .evidence{right:4%;bottom:6%;width:360px;height:250px;transform:rotate(3deg)}
.method .editable{left:5%;top:7%;font:46px A1Pixel;color:#e9ff56;background:#101313;padding:18px 26px;transform:rotate(-2deg)}
.control .editable{right:5%;bottom:7%;font:52px A1Pixel;color:#e9ff56;background:#101313;padding:18px 24px;transform:rotate(2deg)}
</style></head><body>
<section id="frame-presenter" class="frame presenter"><img class="fill" src="${urls.presenter}"><div class="safe premise">既然都用 AI 了</div><div class="safe question">为什么不<br><b>直接写完？</b></div><div class="safe stroke"></div></section>
<section id="frame-screen" class="frame screen"><div class="safe rail"></div><img class="fill" src="${urls.screen}"><div class="safe action">划一下<strong>就能让它改</strong></div><div class="safe cause">选中 → 改写 → 回填原处</div><div class="safe focus"></div><div class="grain"></div></section>
<section id="frame-ai" class="frame glyph ai"><img src="${urls.ai}"><div class="editable">判断词独立成演员</div></section>
<section id="frame-waste" class="frame glyph waste"><img src="${urls.waste}"><div class="editable">删掉顺滑的空话</div><div class="evidence"><img src="${urls.article}"></div></section>
<section id="frame-method" class="frame glyph method"><img src="${urls.method}"><div class="editable">三拍物理递进</div></section>
<section id="frame-control" class="frame glyph control"><img src="${urls.control}"><div class="editable">保留已确认部分</div></section>
</body></html>`;
fs.writeFileSync(htmlPath, html);

const frameSpecs = [
  {id: "presenter-overlay", domId: "presenter", exactText: "为什么不直接写完？", direction: "真人负空间＋斜体前提＋像素判断"},
  {id: "screen-causal", domId: "screen", exactText: "划一下就能让它改", direction: "真实录屏中的选择—改写—回填因果"},
  {id: "glyph-ai-taste", domId: "ai", exactText: "AI 味", direction: "印刷套色字形冲击"},
  {id: "glyph-polished-waste", domId: "waste", exactText: "完成度很高的废稿", direction: "证据窗口＋废稿结论"},
  {id: "glyph-method", domId: "method", exactText: "先给材料 再找角度 最后动笔", direction: "三步材料递进"},
  {id: "glyph-control", domId: "control", exactText: "更加可控 不推翻重来", direction: "可控修改的保留—替换关系"},
];

const browser = await chromium.launch({headless: true});
const frames = [];
try {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
  await page.goto(asFileUrl(htmlPath), {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready);
  for (const spec of frameSpecs) {
    const output = path.join(outputDir, "frames", `${spec.id}-round-${String(round).padStart(2, "0")}.png`);
    await page.locator(`#frame-${spec.domId}`).screenshot({path: output, type: "png"});
    const metadata = await sharp(output).metadata();
    const {domId, ...publicSpec} = spec;
    frames.push({...publicSpec, publicUrl: `/${outputRelative}/frames/${path.basename(output)}`, sha256: sha256(fs.readFileSync(output)), width: metadata.width, height: metadata.height});
  }
} finally {
  await browser.close();
}

const tileWidth = 640;
const tileHeight = 360;
const tiles = await Promise.all(frames.map((item) => sharp(publicFile(item.publicUrl)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer()));
const contactName = `contact-sheet-round-${String(round).padStart(2, "0")}.png`;
const contactPath = path.join(outputDir, contactName);
await sharp({create: {width: tileWidth * 3, height: tileHeight * 2, channels: 4, background: "#090b0c"}})
  .composite(tiles.map((input, index) => ({input, left: (index % 3) * tileWidth, top: Math.floor(index / 3) * tileHeight})))
  .png()
  .toFile(contactPath);
const contact = {publicUrl: `/${outputRelative}/${contactName}`, sha256: sha256(fs.readFileSync(contactPath)), width: 1920, height: 720};
const report = {
  contract: "A1ArticleTypographyDirectionBoard/v3",
  status: "READY_FOR_AUTONOMOUS_VISUAL_CRITIC",
  articleTitle: workspace.article.title,
  round,
  sourceSha256,
  visualThesis: "真实人物与真实屏幕保留可信度；像素字承担操作重音；生成字形只承担少量高能判断；纸张、套色和证据窗口建立整篇编辑世界。",
  frames,
  contact,
  fontBindings: Object.fromEntries(Object.entries(fonts).map(([id, value]) => [id, {assetId: value.id, sha256: value.sha256}])),
  glyphBindings: Object.fromEntries(Object.entries(glyphs).map(([id, value]) => [id, {assetId: value.asset.id, candidateId: value.candidate.id, sha256: value.candidate.sha256}])),
  sourceBindings: {
    presenter: {assetId: presenter.id, sha256: presenter.sha256},
    screen: {assetId: screen.id, sha256: screen.sha256},
    article: {assetId: article.id, sha256: article.sha256},
  },
  prohibited: ["fake-ui", "floating-logo-card", "generic-hud", "bottom-strip", "presenter-face-occlusion", "raster-only-body-copy"],
  repairBriefApplied: revisionBrief || null,
  generatedAt: new Date().toISOString(),
};

const reportName = "typography-direction-v3-latest.json";
fs.writeFileSync(path.join(outputDir, reportName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const target = next.library.assets.find((asset) => asset.id === "typography-direction-plan");
  target.status = "ready-for-review";
  target.assetUri = contact.publicUrl;
  target.sha256 = contact.sha256;
  target.contentSha256 = null;
  target.preview = {kind: "typography-direction", sampleText: "真人叠字 / 真实录屏 / 生成字形 / 像素重音", publicUrl: contact.publicUrl};
  target.visualCritic = null;
  target.review = {status: "pending", note: `第 ${round} 轮文章专属字体包装已生成，进入像素级自动红队。`, reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
  target.provenance = {sourceType: "approved-glyph-plus-editable-font-plus-real-source-compositor", sourceUri: `/${outputRelative}/${reportName}`, license: "project local and user-owned sources", reviewed: false};
  target.typographyDirectionV3 = {contract: report.contract, sourceSha256, reportPublicUrl: `/${outputRelative}/${reportName}`, frames, round};
  next.production.maturityLoop.status = "critic-running";
  next.production.maturityLoop.nextAction = "criticize-article-typography-direction-v3";
  const event = createProductionEvent({workspace: current, action: "article-typography-direction-v3-built", targetId: target.id, payload: {round, sourceSha256, contactSha256: contact.sha256}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next);
  persistProjectState(appRoot, recalculated, {event, files: {[reportName]: report}});
  return recalculated;
});

console.log(JSON.stringify({status: "READY_FOR_AUTONOMOUS_VISUAL_CRITIC", round, frames: frames.length, contact, workspaceSha256: updated.workspaceSha256}, null, 2));
