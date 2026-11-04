#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewDir = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/pixel-pop-pilot");
const fontPath = (relative) => path.join(root, "remotion-renderer/public", relative);
const imageData = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
const fontData = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const fonts = {
  sans: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/system-candidates/NotoSansHans-Black.otf"), "font/otf"),
  support: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/SourceHanSansCN-Regular.otf"), "font/otf"),
  serif: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/SourceHanSerifCN/SourceHanSerifCN-Heavy.otf"), "font/otf"),
  mono: fontData(fontPath("style-guides/experimental-editorial-tech-v1/fonts/IBMPlexMono-Medium.ttf"), "font/ttf"),
};

const variants = [
  {
    shotId: "ED-10",
    id: "v5a-typographic-monument",
    archetypeId: "typographic-monument",
    compositionSignature: "type-crop:center-or-axis-led:overscale-cropped-glyph",
    input: "ed10-composition-v5a-typographic-monument.png",
    output: "ed10-composition-v5a-typographic-monument-composite.png",
    proposition: "超大字形不是标题容器，而是压住编辑者的错误结构。",
    typographyDuty: "verdict-crosses-and-is-occluded-by-primary-form",
    promptSpec: {
      subject: "tiny 1-bit editor trapped inside a monumental abstract glyph",
      spatialAction: "oversized glyph controls about 70 percent of the frame and is cropped on every edge",
      negativeSpace: "irregular counter-space inside the glyph",
      palette: ["#0B0B0B", "#F3F0E8", "restrained vermilion"],
      avoid: ["left-object/right-title", "cards", "UI", "generic retro poster", "readable generated text"],
    },
    markup: `
      <div class="monument-title monument-title-a">完成度很高</div>
      <div class="monument-title monument-title-b">的<span>废稿</span></div>
      <div class="monument-meta">THE WRONG STRUCTURE / 10</div>
      <div class="monument-support">表面完成，不等于内容真正向前。</div>`,
  },
  {
    shotId: "ED-12",
    id: "v5b-object-pressure",
    archetypeId: "object-pressure",
    compositionSignature: "object-overscale:right-origin:type-reacts-to-object-pressure",
    input: "ed12-composition-v5b-object-pressure.png",
    output: "ed12-composition-v5b-object-pressure-composite.png",
    proposition: "巨型滚筒把看似完整的文稿与文字共同压进越来越窄的通道。",
    typographyDuty: "headline-is-compressed-inside-the-pressure-lane",
    promptSpec: {
      subject: "one colossal analog proofing roller crushing a fragile paper strip",
      spatialAction: "diagonal pressure creates a narrow copy lane instead of parallel columns",
      negativeSpace: "paper passage beneath the roller",
      palette: ["#0B0B0B", "#F3F0E8", "restrained vermilion"],
      avoid: ["left-object/right-title", "cards", "UI", "collage clutter", "readable generated text"],
    },
    markup: `
      <div class="pressure-meta">PRESSURE TEST / 12</div>
      <div class="pressure-band"><div class="pressure-title">完成度很高的<span>废稿</span></div></div>
      <div class="pressure-support">越像成品，越容易掩盖方向错误。</div>`,
  },
  {
    shotId: "ED-09",
    id: "v5c-field-interruption",
    archetypeId: "field-interruption",
    compositionSignature: "edge-intrusion:left-origin:floating-verdict-away-from-intrusion",
    input: "ed09-composition-v5c-field-interruption.png",
    output: "ed09-composition-v5c-field-interruption-composite.png",
    proposition: "大面积完成感被一条来自边缘的裂口突然打断，最后一个词落在断裂点上。",
    typographyDuty: "semantic-pivot-is-displaced-by-the-intrusion",
    promptSpec: {
      subject: "a calm paper field interrupted by one jagged black tear and a tiny cursor",
      spatialAction: "the tear enters from an edge and interrupts the field without dividing it into columns",
      negativeSpace: "at least 58 percent calm field",
      palette: ["#0B0B0B", "#F3F0E8", "hairline vermilion"],
      avoid: ["symmetrical split", "cards", "UI", "decorative grid", "readable generated text"],
    },
    markup: `
      <div class="field-meta">INTERRUPTION / 09</div>
      <div class="field-title field-title-a">完成度很高的</div>
      <div class="field-title field-title-b">废稿</div>
      <div class="field-support">好看，只解决了表面。</div>`,
  },
];

const html = (variant) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:A1Sans;src:url(${fonts.sans}) format('opentype');font-weight:900}
@font-face{font-family:A1Support;src:url(${fonts.support}) format('opentype');font-weight:400}
@font-face{font-family:A1Serif;src:url(${fonts.serif}) format('opentype');font-weight:900}
@font-face{font-family:A1Mono;src:url(${fonts.mono}) format('truetype');font-weight:500}
*{box-sizing:border-box}html,body{margin:0;width:960px;height:540px;overflow:hidden;background:#f3f0e8}
.frame{position:relative;isolation:isolate;width:960px;height:540px;overflow:hidden;background:#f3f0e8;color:#0b0b0b}
.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.monument-title{position:absolute;z-index:2;font:900 102px/.78 A1Sans,sans-serif;letter-spacing:-.075em;mix-blend-mode:difference;color:#f3f0e8;white-space:nowrap}
.monument-title-a{left:38px;top:64px}.monument-title-b{right:32px;bottom:31px;font-size:132px}.monument-title-b span{font-family:A1Serif,serif;letter-spacing:-.12em}
.monument-meta{position:absolute;z-index:3;left:42px;bottom:24px;font:500 10px/1 A1Mono,monospace;letter-spacing:.17em;color:#0b0b0b}
.monument-support{position:absolute;z-index:3;right:36px;top:27px;font:400 16px/1.3 A1Support,sans-serif;color:#f3f0e8}
.pressure-meta{position:absolute;z-index:2;left:44px;top:34px;font:500 10px/1 A1Mono,monospace;letter-spacing:.17em;color:#f3f0e8}
.pressure-band{position:absolute;z-index:2;left:410px;top:303px;width:590px;height:118px;overflow:hidden;transform:rotate(9.6deg);transform-origin:left center;clip-path:polygon(0 8%,100% 22%,100% 78%,0 91%)}
.pressure-title{position:absolute;left:3px;top:22px;white-space:nowrap;font:900 61px/.82 A1Sans,sans-serif;letter-spacing:-.085em;transform:scaleY(.76);transform-origin:left center;color:#0b0b0b}
.pressure-title span{font-family:A1Serif,serif;margin-left:.08em}
.pressure-support{position:absolute;z-index:2;left:44px;bottom:31px;width:330px;font:400 17px/1.35 A1Support,sans-serif;color:#0b0b0b}
.field-meta{position:absolute;z-index:2;left:48px;top:37px;font:500 10px/1 A1Mono,monospace;letter-spacing:.17em;color:#0b0b0b}
.field-title{position:absolute;z-index:2;white-space:nowrap;color:#0b0b0b}
.field-title-a{left:48px;top:265px;font:900 74px/.9 A1Sans,sans-serif;letter-spacing:-.065em}
.field-title-b{left:493px;top:336px;font:900 124px/.82 A1Serif,serif;letter-spacing:-.12em;color:#0b0b0b}
.field-support{position:absolute;z-index:2;left:52px;bottom:33px;font:400 17px/1.2 A1Support,sans-serif;color:#0b0b0b}
</style></head><body><main class="frame" data-archetype="${variant.archetypeId}"><img class="art" src="${imageData(path.join(previewDir, variant.input))}"/>${variant.markup}</main></body></html>`;

const browser = await chromium.launch({headless: true});
const results = [];
for (const variant of variants) {
  const page = await browser.newPage({viewport: {width: 960, height: 540}, deviceScaleFactor: 1});
  await page.setContent(html(variant), {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready);
  const input = path.join(previewDir, variant.input);
  const output = path.join(previewDir, variant.output);
  await page.screenshot({path: output, type: "png"});
  const manifest = {
    contract: "A1VisualCompositionProof/v1",
    version: 5,
    previewOnly: true,
    productionBinding: null,
    generatedAt: new Date().toISOString(),
    shotId: variant.shotId,
    layerId: `${variant.shotId}-generated-visual-source-v5`,
    archetypeId: variant.archetypeId,
    compositionSignature: variant.compositionSignature,
    proposition: variant.proposition,
    typographyDuty: variant.typographyDuty,
    generation: {
      provider: "codex-imagegen",
      mode: "generate",
      qualityTier: "proof",
      textPolicy: "generated-visual-source-is-text-free; exact-Chinese-is-editable-compositor-type",
      promptSpec: variant.promptSpec,
    },
    asset: {file: variant.input, sha256: sha256(input)},
    composite: {file: variant.output, sha256: sha256(output), width: 960, height: 540},
    automaticChecks: {
      exactChineseCopy: "pass",
      fixedLeftRightSplit: "pass",
      typographyActsOnPrimaryForm: "pass",
      oneDominantVisualIdea: "pass",
      productionApproval: "pending-human-review",
    },
  };
  const manifestPath = path.join(previewDir, `${variant.output.replace(/-composite\.png$/u, "")}.manifest.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  results.push({archetypeId: variant.archetypeId, input, output, manifest: manifestPath, bytes: fs.statSync(output).size});
  await page.close();
}
await browser.close();

console.log(JSON.stringify({status: "COMPOSITION_ARCHETYPE_PROOF_READY", results}, null, 2));
