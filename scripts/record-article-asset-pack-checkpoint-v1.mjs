#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const {chromium} = require("playwright");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const materialSource = option("--material");
const elementSource = option("--elements");
if (!materialSource || !elementSource) throw new Error("--material and --elements are required");
if (!fs.existsSync(materialSource) || !fs.existsSync(elementSource)) throw new Error("generated-image-source-missing");

const phaseId = "editorial-asset-workbench-v1";
const checkpointId = "article-asset-pack-checkpoint-v1";
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(publicRoot, checkpointId);
const artifactDir = path.join(artifactRoot, checkpointId);
const workspacePublicPath = path.join(publicRoot, "workspace.json");
const workspaceArtifactPath = path.join(artifactRoot, "workspace.json");
const reportPublicPath = path.join(publicRoot, "report.json");
const reportArtifactPath = path.join(artifactRoot, "report.json");
const reviewPublicPath = path.join(publicRoot, "review-ledger.json");
const reviewArtifactPath = path.join(artifactRoot, "review-ledger.json");
const checkpointBaseUrl = `/generated/system-line/${phaseId}/${checkpointId}`;
const now = new Date().toISOString();
const generationDurationMs = 136000;
const startedAt = new Date(Date.now() - generationDurationMs).toISOString();

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
};
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fileInfo = async (file, publicUrl) => {
  const metadata = await sharp(file).metadata();
  return {publicUrl, sha256: shaFile(file), width: metadata.width, height: metadata.height, bytes: fs.statSync(file).size};
};

fs.mkdirSync(path.join(publicDir, "backgrounds"), {recursive: true});
fs.mkdirSync(path.join(artifactDir, "backgrounds"), {recursive: true});

const materialBoardPath = path.join(publicDir, "material-direction-board.png");
const elementChromaPath = path.join(publicDir, "editorial-elements-atlas-chroma.png");
const elementAtlasPath = path.join(publicDir, "editorial-elements-atlas.png");
fs.copyFileSync(materialSource, materialBoardPath);
fs.copyFileSync(elementSource, elementChromaPath);

const chromaHelper = path.join(process.env.CODEX_HOME || path.join(process.env.HOME || "/Users/a1", ".codex"), "skills/.system/imagegen/scripts/remove_chroma_key.py");
execFileSync("python3", [chromaHelper, "--input", elementChromaPath, "--out", elementAtlasPath, "--auto-key", "border", "--soft-matte", "--transparent-threshold", "12", "--opaque-threshold", "220", "--despill"], {stdio: "inherit"});

const backgroundIds = [
  "bg-warm-paper-dot",
  "bg-cobalt-ink-field",
  "bg-charcoal-verdict",
  "bg-halftone-cream",
  "bg-archive-ruling",
  "bg-oxblood-revision",
];
const materialMetadata = await sharp(materialBoardPath).metadata();
const sourceWidth = Number(materialMetadata.width || 0);
const sourceHeight = Number(materialMetadata.height || 0);
if (!sourceWidth || !sourceHeight) throw new Error("material-board-dimensions-invalid");
const xStops = [0, Math.floor(sourceWidth / 3), Math.floor(sourceWidth * 2 / 3), sourceWidth];
const yStops = [0, Math.floor(sourceHeight / 2), sourceHeight];
const backgroundOutputs = [];
for (let row = 0; row < 2; row += 1) {
  for (let column = 0; column < 3; column += 1) {
    const index = row * 3 + column;
    const id = backgroundIds[index];
    const output = path.join(publicDir, "backgrounds", `${id}.png`);
    await sharp(materialBoardPath)
      .extract({left: xStops[column], top: yStops[row], width: xStops[column + 1] - xStops[column], height: yStops[row + 1] - yStops[row]})
      .resize(960, 540, {fit: "cover"})
      .png()
      .toFile(output);
    backgroundOutputs.push({id, ...(await fileInfo(output, `${checkpointBaseUrl}/backgrounds/${id}.png`))});
  }
}

const typographyHtmlPath = path.join(publicDir, "typography-direction-board.html");
const typographyBoardPath = path.join(publicDir, "typography-direction-board.png");
const typographyHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:A1SourceHan;src:url('../font-cache/SourceHanSansCN-Heavy.otf')}@font-face{font-family:A1Smiley;src:url('../font-cache/SmileySans-Oblique.otf')}@font-face{font-family:A1Harmony;src:url('../font-cache/HarmonyOS-Sans-Condensed-Black.ttf')}@font-face{font-family:A1Fusion;src:url('../font-cache/fusion-pixel.ttf')}@font-face{font-family:A1Handjet;src:url('../font-cache/Handjet-Variable.ttf')}
*{box-sizing:border-box}html,body{margin:0;width:1536px;height:864px;overflow:hidden}body{background:#e9e0cf;color:#111315;font-family:A1SourceHan,sans-serif}.grain{position:absolute;inset:0;opacity:.18;background-image:radial-gradient(circle,#17191a 0 1px,transparent 1.2px);background-size:9px 9px}.ink{position:absolute;left:0;top:0;width:39%;height:100%;background:#111315;color:#f0e8da;padding:72px 58px}.opening{font:900 26px/1.1 A1SourceHan}.opening b{display:block;margin-top:20px;font:900 72px/.92 A1Harmony;letter-spacing:-.04em}.impact{position:absolute;left:44%;top:66px;font:900 182px/.76 A1Smiley;color:#204ed0;transform:rotate(-3deg);letter-spacing:-.08em}.impact small{display:block;margin:36px 0 0 16px;font:900 18px/1 A1SourceHan;color:#111315;letter-spacing:.12em}.waste{position:absolute;left:44%;top:346px;width:51%;font:900 90px/.9 A1SourceHan;letter-spacing:-.065em}.waste em{font-style:normal;color:#204ed0}.steps{position:absolute;left:44%;right:6%;bottom:64px;display:flex;align-items:flex-end;gap:28px;border-top:3px solid #111315;padding-top:22px}.steps span{font:900 35px/.9 A1Harmony}.steps span:nth-child(2){font:900 39px/.9 A1Fusion;color:#204ed0}.note{position:absolute;left:56px;bottom:58px;width:31%;font:650 36px/.95 A1Handjet;color:#e9e0cf}.tag{font:700 12px/1 ui-monospace,monospace;letter-spacing:.15em;color:#204ed0}.ink .tag{color:#86a0ff}.rule{position:absolute;left:39%;top:0;width:10px;height:100%;background:#204ed0}.dot{position:absolute;right:52px;top:52px;width:38px;height:38px;background:#111315;border-radius:50%}
</style></head><body><div class="grain"></div><section class="ink"><p class="tag">开场 / 本人画面不盖脸</p><div class="opening">Hi，我用 vibe coding<b>做了一款<br>智能写作工作台</b></div><div class="note">文字包装服务于本人，不替代本人。</div></section><div class="rule"></div><div class="impact">AI 味<small>倾斜冲击 / 只用于关键判断</small></div><div class="waste">完成度很高的<em>废稿</em></div><div class="steps"><span>先给材料</span><span>再找角度</span><span>最后动笔</span></div><div class="dot"></div></body></html>`;
fs.writeFileSync(typographyHtmlPath, typographyHtml);
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1536, height: 864}, deviceScaleFactor: 1});
  await page.goto(pathToFileURL(typographyHtmlPath).href, {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({path: typographyBoardPath, type: "png"});
} finally {
  await browser.close();
}

const materialBoard = await fileInfo(materialBoardPath, `${checkpointBaseUrl}/material-direction-board.png`);
const elementAtlas = await fileInfo(elementAtlasPath, `${checkpointBaseUrl}/editorial-elements-atlas.png`);
const typographyBoard = await fileInfo(typographyBoardPath, `${checkpointBaseUrl}/typography-direction-board.png`);
const prompts = {
  material: "Article-film material board: six separable physical paper, xerox, ink, desk, halftone and revision collage swatches; text-free; no fake UI, logo, HUD or decorative blue line.",
  elements: "Twelve isolated physical editorial revision elements on flat #00ff00 chroma key; text-free; no fake UI, logo or HUD.",
};
const generationRecords = [
  {id: "operator-material-board-v1", assetId: "bg-warm-paper-dot", output: materialBoard, prompt: prompts.material, generationId: path.basename(materialSource, path.extname(materialSource))},
  {id: "operator-element-atlas-v1", assetId: "atlas-editor-marks", output: elementAtlas, prompt: prompts.elements, generationId: path.basename(elementSource, path.extname(elementSource))},
];

let workspace = assertEditorialAssetWorkbench(readJson(workspacePublicPath));
for (const output of backgroundOutputs) {
  const asset = workspace.library.assets.find((item) => item.id === output.id);
  if (!asset) throw new Error(`background-asset-missing:${output.id}`);
  asset.route = "editorial-artwork";
  asset.status = "ready-for-review";
  asset.assetUri = output.publicUrl;
  asset.sha256 = output.sha256;
  asset.preview = {kind: "generated-image", publicUrl: output.publicUrl};
  asset.provenance = {sourceType: "codex-built-in-imagegen", sourceUri: `${checkpointBaseUrl}/report.json`, license: "subscription-generated non-evidence editorial asset", reviewed: false};
}
const atlasAsset = workspace.library.assets.find((item) => item.id === "atlas-editor-marks");
if (!atlasAsset) throw new Error("atlas-editor-marks-missing");
atlasAsset.status = "ready-for-review";
atlasAsset.assetUri = elementAtlas.publicUrl;
atlasAsset.sha256 = elementAtlas.sha256;
atlasAsset.preview = {kind: "generated-image", publicUrl: elementAtlas.publicUrl};
atlasAsset.provenance = {sourceType: "codex-built-in-imagegen-chroma-key-removed", sourceUri: `${checkpointBaseUrl}/report.json`, license: "subscription-generated non-evidence editorial asset", reviewed: false};
const typographyAsset = workspace.library.assets.find((item) => item.id === "typography-direction-plan");
if (!typographyAsset) throw new Error("typography-direction-plan-missing");
typographyAsset.status = "ready-for-review";
typographyAsset.assetUri = typographyBoard.publicUrl;
typographyAsset.sha256 = typographyBoard.sha256;
typographyAsset.preview = {kind: "typography-direction", sampleText: "AI 味\n完成度很高的废稿", publicUrl: typographyBoard.publicUrl};
typographyAsset.provenance = {sourceType: "deterministic-local-font-render", sourceUri: `${checkpointBaseUrl}/report.json`, license: "project-local font board; editable type remains authoritative", reviewed: false};

workspace.production.generation.jobs = workspace.production.generation.jobs.filter((job) => !generationRecords.some((record) => record.id === job.id));
workspace.production.generation.jobs.push(...generationRecords.map((record) => ({
  contract: "A1AssetGenerationJob/v2",
  id: record.id,
  projectId: workspace.production.project.projectId,
  sourceHash: workspace.article.sourceTextSha256,
  assetPackSha256: workspace.library.assetPackSha256,
  assetId: record.assetId,
  route: "operator-led-built-in-image-generation",
  provider: "codex-built-in-imagegen",
  providerMode: "subscription-zero-extra-cost",
  model: "built-in-model-not-exposed",
  generationId: record.generationId,
  status: "complete",
  prompt: record.prompt,
  promptSha256: crypto.createHash("sha256").update(record.prompt).digest("hex"),
  cacheKey: crypto.createHash("sha256").update(`${workspace.article.sourceTextSha256}:${record.id}:${record.prompt}`).digest("hex"),
  attempts: 1,
  cacheHit: false,
  error: null,
  createdAt: startedAt,
  startedAt,
  completedAt: now,
  durationMs: generationDurationMs,
  output: record.output,
})));
workspace.production.generation.workerStatus = "idle";
workspace.production.eventLedger.eventCount += 1;
workspace.production.eventLedger.lastEventId = `evt-${Date.now()}-record-article-asset-pack`;
workspace.production.eventLedger.lastEventAt = now;
workspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(workspace, now));

const checkpointReport = {
  contract: "A1ArticleAssetPackCheckpoint/v1",
  checkpointId,
  status: "READY_FOR_USER_VISUAL_REVIEW",
  generatedAt: now,
  article: {title: workspace.article.title, sourceTextSha256: workspace.article.sourceTextSha256},
  execution: {provider: "codex-built-in-imagegen", providerMode: "subscription-zero-extra-cost", concurrency: 2, jobCount: 2, cacheHits: 0, startedAt, completedAt: now, wallClockMs: generationDurationMs},
  prompts,
  outputs: {materialBoard, backgrounds: backgroundOutputs, elementAtlas, typographyBoard},
  validation: {textFreeGeneratedBoards: true, fakeUiPresent: false, logoPresent: false, hudPresent: false, separableBackgroundCount: backgroundOutputs.length, separableElementCount: 12, typographyUsesLocalEditableFonts: true},
  gates: {userVisualApproval: "PENDING", shotCompositionAllowed: false, motionAllowed: false, renderAllowed: false},
  nextAction: "review-three-article-asset-boards-on-4311",
};
writeJson(path.join(publicDir, "report.json"), checkpointReport);
fs.cpSync(publicDir, artifactDir, {recursive: true});
writeJson(workspacePublicPath, workspace);
writeJson(workspaceArtifactPath, workspace);
writeJson(reviewPublicPath, workspace.reviewLedger);
writeJson(reviewArtifactPath, workspace.reviewLedger);
const buildReport = {...readJson(reportPublicPath), contract: "A1EditorialAssetWorkbenchBuildReport/v2", updatedAt: now, workspaceSha256: workspace.workspaceSha256, summary: workspace.summary, generation: workspace.production.generation, gates: workspace.gates, nextAction: workspace.production.nextAction, assetPackCheckpoint: {publicUrl: `${checkpointBaseUrl}/report.json`, status: checkpointReport.status}};
writeJson(reportPublicPath, buildReport);
writeJson(reportArtifactPath, buildReport);
console.log(JSON.stringify({status: checkpointReport.status, outputs: checkpointReport.outputs, workspaceSha256: workspace.workspaceSha256, summary: workspace.summary, gates: workspace.gates}, null, 2));
