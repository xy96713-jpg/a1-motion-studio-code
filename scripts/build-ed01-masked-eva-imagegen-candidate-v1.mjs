import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const generatedRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const sourceRoot = path.join(generatedRoot, "presenter-depth-title-canary-v1/assets/ED-01");
const outputRoot = path.join(generatedRoot, "ed01-masked-eva-imagegen-candidate-v1");
const candidateRoot = path.join(root, ".codex-artifacts/system-progress-system-line/ed01-dual-imagegen-candidates-v1");
const titleSource = path.join(candidateRoot, "ED-01-eva-generated-glyph-v2.png");
const baseSource = path.join(generatedRoot, "video-packaging-context-v1/ed-01-hold-frame.jpg");
const presenterMaskSources = [path.join(sourceRoot, "ed-01-unified-exclusion-mask.png")];
const supportFont = path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf");
const latinFont = path.join(root, "apps/studio-next/public/a1-editorial-fonts/SmileySans-Oblique.otf");
const width = 1920;
const height = 1080;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

for (const file of [titleSource, baseSource, ...presenterMaskSources, supportFont, latinFont]) {
  if (!fs.existsSync(file)) throw new Error(`missing-input:${path.relative(root, file)}`);
}
fs.mkdirSync(outputRoot, {recursive: true});

const supportA = glyphOutlineRunToSvgPaths(buildFontGlyphOutlineRun({fontPath: supportFont, text: "用"}), {x: 78, baseline: 118, fontSize: 42, fill: "#e8ebef", anchor: "start"});
const supportB = glyphOutlineRunToSvgPaths(buildFontGlyphOutlineRun({fontPath: latinFont, text: "vibe coding"}), {x: 132, baseline: 118, fontSize: 44, fill: "#9db8ff", anchor: "start"});
const supportC = glyphOutlineRunToSvgPaths(buildFontGlyphOutlineRun({fontPath: supportFont, text: "做的"}), {x: 365, baseline: 118, fontSize: 42, fill: "#e8ebef", anchor: "start"});
const supportSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${supportA}${supportB}${supportC}<rect x="78" y="136" width="360" height="3" fill="#ff147f"/></svg>`);

const title = await sharp(titleSource).resize({width: 1120, withoutEnlargement: false}).png().toBuffer();
const presenterRgb = await sharp(baseSource).resize(width, height, {fit: "fill"}).removeAlpha().raw().toBuffer();
const presenterAlpha = await sharp(presenterMaskSources[0]).resize(width, height, {fit: "fill"}).removeAlpha().greyscale().raw().toBuffer();
const presenterRgba = Buffer.alloc(width * height * 4);
for (let pixel = 0; pixel < width * height; pixel += 1) {
  presenterRgba[pixel * 4] = presenterRgb[pixel * 3];
  presenterRgba[pixel * 4 + 1] = presenterRgb[pixel * 3 + 1];
  presenterRgba[pixel * 4 + 2] = presenterRgb[pixel * 3 + 2];
  presenterRgba[pixel * 4 + 3] = presenterAlpha[pixel];
}
const presenter = await sharp(presenterRgba, {raw: {width, height, channels: 4}}).png().toBuffer();

const composite = await sharp(baseSource)
  .resize(width, height, {fit: "fill"})
  .composite([
    {input: title, left: 55, top: 205, blend: "screen"},
    {input: supportSvg, left: 0, top: 0},
    {input: presenter, left: 0, top: 0},
  ])
  .png()
  .toBuffer();

const output = path.join(outputRoot, "ED-01-masked-eva-imagegen-composite.png");
fs.writeFileSync(output, composite);
const report = {
  contract: "A1Ed01MaskedEvaImagegenCandidate/v1",
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW",
  reviewOnly: true,
  productionAdmitted: false,
  shotId: "ED-01",
  layerOrder: ["real-hold-frame", "imagegen-eva-hero-title", "local-support-copy", "real-presenter-body-foreground"],
  formalCopy: {hero: "智能写作工作台", support: "用 vibe coding 做的"},
  heroGlyphBinding: {
    contract: "A1GeneratedHeroGlyphBinding/v1",
    owner: "IMAGEGEN_EVA_MECHANISM_CJK",
    exactText: "智能写作工作台",
    sourcePath: path.relative(root, titleSource),
    sourceSha256: sha256(fs.readFileSync(titleSource)),
    alphaRequired: true,
    generatedGlyphActor: true,
    editableShadowRequired: true,
    ocrRequired: true,
    characterByCharacterReviewRequired: true,
  },
  supportTypographyBinding: {
    contract: "A1LocalSupportTypographyBinding/v1",
    owner: "LOCAL_FONTKIT",
    exactText: "用 vibe coding 做的",
    renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES",
    editable: true,
    generated: false,
    fontBindings: [
      {role: "cjk-support", family: "A1 Source Han Heavy", path: path.relative(root, supportFont), sha256: sha256(fs.readFileSync(supportFont))},
      {role: "latin-support", family: "A1 Smiley Sans", path: path.relative(root, latinFont), sha256: sha256(fs.readFileSync(latinFont))},
    ],
  },
  titleOwner: "IMAGEGEN_EVA_MECHANISM_CJK_WITH_LOCAL_EDITABLE_SHADOW_REQUIRED",
  supportOwner: "LOCAL_RENDERER_VERIFIED_FONT_OUTLINES",
  presenterMasking: "REAL_PRESENTER_BODY_IN_FRONT_OF_HERO_TITLE",
  equipmentPolicy: "MICROPHONE_AND_BOOM_MAY_CROSS_TITLE",
  inputs: [titleSource, baseSource, ...presenterMaskSources].map((file) => ({path: path.relative(root, file), sha256: sha256(fs.readFileSync(file))})),
  output: {path: path.relative(root, output), sha256: sha256(composite), width, height},
};
fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
