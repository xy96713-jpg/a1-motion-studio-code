#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/typography-direction-board-v2");
const frameRoot = path.join(outputRoot, "frames");
const publicRoot = path.join(root, "apps/studio-next/public");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const appFile = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\//u, ""));

const fontSpecs = {
  signature: {
    assetId: "type-pixel-correction",
    family: "A1 Fusion Pixel",
    file: path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/font-cache/fusion-pixel.ttf"),
  },
  supportCandidate: {
    assetId: "type-editorial-support-candidate",
    family: "A1 Source Han Sans Regular",
    file: path.join(root, "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts/SourceHanSansCN-Regular.otf"),
  },
};

const backgrounds = {
  light: {
    id: "background-cool-halftone-quiet-field-v1",
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-cool-halftone-quiet-field-v1.png",
  },
  dark: {
    id: "background-charcoal-contour-quiet-field-v1",
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-charcoal-contour-quiet-field-v1.png",
  },
};

const palette = {
  ink: "#101315",
  paper: "#f4f1e9",
  blue: "#2452ff",
  acid: "#dfff68",
  red: "#e65c47",
};

const designs = [
  {
    id: "verdict-hero",
    label: "01 · 结论接管 / Verdict Hero",
    semanticJob: "让最终判断在一秒内成立",
    background: backgrounds.light,
    use: "signature-only",
    copy: "完成度很高的废稿",
    support: "VERDICT / HIGH POLISH · LOW VALUE",
    layout: "asymmetric-verdict-lockup",
  },
  {
    id: "evidence-rail",
    label: "02 · 证据侧栏 / Evidence Rail",
    semanticJob: "让真实材料先于观点出现",
    background: backgrounds.dark,
    use: "support-led",
    copy: "先看材料",
    support: "EVIDENCE FIRST / 01",
    detail: "网页、段落、选择区都必须保留原始关系",
    layout: "left-rail-with-readable-support",
  },
  {
    id: "primary-secondary",
    label: "03 · 主副层级 / Primary + Secondary",
    semanticJob: "区分一句判断和一段解释",
    background: backgrounds.light,
    use: "paired-hierarchy",
    copy: "工作流",
    support: "先决定载体，再决定动效",
    detail: "A1 / EDITORIAL CONTROL",
    layout: "headline-plus-readable-claim",
  },
  {
    id: "rhythm-stair",
    label: "04 · 阶梯过程 / Rhythm Stair",
    semanticJob: "让三步过程形成时间方向",
    background: backgrounds.dark,
    use: "signature-rhythm",
    copy: ["先给材料", "再找角度", "最后动笔"],
    support: "PROCESS / NOT AUTO",
    layout: "three-step-diagonal-stair",
  },
  {
    id: "object-annotation",
    label: "05 · 物件批注 / Object Annotation",
    semanticJob: "让文字依附在真实对象上，而不是漂浮成 HUD",
    background: backgrounds.light,
    use: "object-bound",
    copy: "保留已确认部分",
    support: "REVISE WITHOUT RESET",
    detail: "annotation must touch the evidence edge",
    layout: "edge-bound-callout",
  },
  {
    id: "quiet-note",
    label: "06 · 安静注释 / Quiet Note",
    semanticJob: "给连续叙事留出呼吸，不让每帧都抢主标题",
    background: backgrounds.dark,
    use: "support-quiet",
    copy: "判断不是装饰",
    support: "QUIET NOTE / ONE THOUGHT",
    detail: "让场景保留呼吸",
    layout: "low-density-corner-note",
  },
];

function openFont(spec) {
  if (!fs.existsSync(spec.file)) throw new Error(`typography-font-missing:${spec.file}`);
  const bytes = fs.readFileSync(spec.file);
  return {spec, bytes, font: fontkit.create(bytes)};
}

const fonts = Object.fromEntries(Object.entries(fontSpecs).map(([key, spec]) => [key, openFont(spec)]));

function glyphPath(font, character, placement) {
  const run = font.layout(character);
  const glyph = run.glyphs[0];
  const position = run.positions[0];
  if (!glyph || glyph.id === 0) throw new Error(`typography-font-missing-glyph:${font.fullName}:${character}`);
  const scale = placement.size / font.unitsPerEm;
  const scaleX = placement.scaleX ?? 1;
  const d = glyph.path.toSVG();
  return {
    markup: `<path d="${d}" transform="translate(${placement.x.toFixed(2)} ${placement.y.toFixed(2)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`,
    advance: position.xAdvance * scale * scaleX + (placement.tracking ?? 0),
  };
}

function textPath(font, text, placement) {
  let cursor = placement.x;
  const paths = [];
  for (const character of [...String(text)]) {
    const glyph = glyphPath(font, character, {...placement, x: cursor});
    paths.push(glyph.markup);
    cursor += glyph.advance;
  }
  return {markup: paths.join(""), width: cursor - placement.x};
}

function group(font, text, placement, color) {
  return `<g fill="${color}">${textPath(font, text, placement).markup}</g>`;
}

function frameSvg(design) {
  const pixel = fonts.signature.font;
  const support = fonts.supportCandidate.font;
  const parts = [];
  const text = (font, value, placement, color) => parts.push(group(font, value, placement, color));

  if (design.id === "verdict-hero") {
    text(pixel, "完成度很高", {x: 128, y: 260, size: 210, tracking: -8, scaleX: .78}, palette.ink);
    text(pixel, "的废稿", {x: 310, y: 565, size: 300, tracking: -12, scaleX: .82}, palette.ink);
    text(pixel, design.support, {x: 340, y: 810, size: 30, tracking: 3}, palette.blue);
  }

  if (design.id === "evidence-rail") {
    parts.push(`<rect x="0" y="0" width="520" height="1080" fill="${palette.ink}"/>`);
    text(pixel, "证据", {x: 92, y: 270, size: 230, tracking: -8, scaleX: .8}, palette.paper);
    text(support, design.copy, {x: 98, y: 410, size: 72, tracking: 0, scaleX: .96}, palette.acid);
    text(support, design.detail, {x: 98, y: 700, size: 36, tracking: 0, scaleX: .96}, palette.paper);
    text(pixel, design.support, {x: 98, y: 945, size: 28, tracking: 3}, palette.blue);
  }

  if (design.id === "primary-secondary") {
    text(pixel, design.copy, {x: 1220, y: 340, size: 310, tracking: -12, scaleX: .84}, palette.paper);
    text(support, design.support, {x: 1235, y: 515, size: 48, tracking: 0, scaleX: .96}, palette.paper);
    text(pixel, design.detail, {x: 1240, y: 625, size: 28, tracking: 3}, palette.blue);
  }

  if (design.id === "rhythm-stair") {
    text(pixel, "先给材料", {x: 160, y: 220, size: 150, tracking: -5, scaleX: .86}, palette.paper);
    text(pixel, "再找角度", {x: 590, y: 470, size: 150, tracking: -5, scaleX: .86}, palette.paper);
    text(pixel, "最后动笔", {x: 1020, y: 720, size: 150, tracking: -5, scaleX: .86}, palette.paper);
    text(pixel, design.support, {x: 160, y: 940, size: 28, tracking: 3}, palette.acid);
  }

  if (design.id === "object-annotation") {
    text(pixel, design.copy, {x: 105, y: 270, size: 160, tracking: -5, scaleX: .86}, palette.ink);
    text(support, design.detail, {x: 110, y: 420, size: 38, tracking: 0, scaleX: .96}, palette.blue);
    text(pixel, design.support, {x: 110, y: 920, size: 28, tracking: 3}, palette.blue);
  }

  if (design.id === "quiet-note") {
    text(pixel, "判断", {x: 1430, y: 400, size: 220, tracking: -8, scaleX: .82}, palette.paper);
    text(support, "不是装饰", {x: 1450, y: 510, size: 64, tracking: 0, scaleX: .96}, palette.acid);
    text(support, design.support, {x: 1450, y: 735, size: 30, tracking: 2}, palette.blue);
    text(support, design.detail, {x: 1450, y: 805, size: 34, tracking: 0, scaleX: .96}, palette.paper);
  }

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${parts.join("")}</svg>`);
}

async function renderDesign(design) {
  const backgroundPath = appFile(design.background.publicUrl);
  if (!fs.existsSync(backgroundPath)) throw new Error(`typography-background-missing:${backgroundPath}`);
  const base = await sharp(backgroundPath).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const overlay = frameSvg(design);
  const outputPath = path.join(frameRoot, `${design.id}.png`);
  await sharp(base).composite([{input: overlay, left: 0, top: 0}]).png({compressionLevel: 9}).toFile(outputPath);
  const metadata = await sharp(outputPath).metadata();
  const pixels = fs.readFileSync(outputPath);
  return {
    id: design.id,
    label: design.label,
    semanticJob: design.semanticJob,
    use: design.use,
    layout: design.layout,
    backgroundId: design.background.id,
    publicPath: path.relative(root, outputPath),
    sha256: sha256(pixels),
    width: metadata.width,
    height: metadata.height,
    fontBindings: [
      {role: "signature", assetId: fonts.signature.spec.assetId, file: path.relative(root, fonts.signature.spec.file), sha256: sha256(fonts.signature.bytes)},
      ...(design.use.includes("support") || design.use === "paired-hierarchy" || design.use === "object-bound" ? [{role: "support-candidate", assetId: fonts.supportCandidate.spec.assetId, file: path.relative(root, fonts.supportCandidate.spec.file), sha256: sha256(fonts.supportCandidate.bytes), admission: "REVIEW_ONLY_NOT_CURRENT_AUTHORITY"}] : []),
    ],
    editableText: true,
    generatedFormalText: false,
    productionAdmitted: false,
  };
}

async function main() {
  fs.mkdirSync(frameRoot, {recursive: true});
  const frames = [];
  for (const design of designs) frames.push(await renderDesign(design));

  const tileWidth = 640;
  const tileHeight = 360;
  const sheetWidth = tileWidth * 3;
  const rowHeight = tileHeight + 42;
  const sheetHeight = rowHeight * 2 + 48;
  const tileInputs = await Promise.all(frames.map((frame) => sharp(path.join(root, frame.publicPath)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer()));
  const labels = frames.map((frame, index) => {
    const x = (index % 3) * tileWidth + 16;
    const y = 48 + (Math.floor(index / 3) + 1) * tileHeight + (Math.floor(index / 3) + 1) * 42 - 14;
    return `<text x="${x}" y="${y}" fill="${palette.paper}" font-family="monospace" font-size="17">${frame.label}</text>`;
  }).join("");
  const header = `<text x="16" y="28" fill="${palette.acid}" font-family="monospace" font-size="18">A1 TYPOGRAPHY DIRECTION BOARD V2 · SIX SEMANTIC GRAMMARS · REVIEW ONLY</text>`;
  const sheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}"><rect width="100%" height="100%" fill="#080b0d"/>${header}${labels}</svg>`);
  const sheetPath = path.join(outputRoot, "typography-direction-board-v2.png");
  await sharp(sheetSvg).composite(tileInputs.map((input, index) => ({input, left: (index % 3) * tileWidth, top: 48 + Math.floor(index / 3) * rowHeight}))).png({compressionLevel: 9}).toFile(sheetPath);

  const manifestBody = {
    contract: "A1IsolatedTypographyDirectionBoard/v2",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    visualThesis: "保持 Fusion Pixel 作为身份重音，引入可读辅助字候选，并让结论、证据、层级、过程、批注、安静注释拥有不同空间语法。",
    currentAuthorityUntouched: true,
    productionAdmitted: false,
    userVisualApproval: "NOT_APPROVED",
    backgroundPolicy: "reuses-two-current-approved-textless-backgrounds-only",
    frames,
    reviewSheet: {file: path.relative(root, sheetPath), sha256: sha256(fs.readFileSync(sheetPath)), width: sheetWidth, height: sheetHeight},
    nextDecision: "user-select-which-grammars-enter-the-current-production-typography-policy",
    generatedAt: new Date().toISOString(),
  };
  const manifest = {...manifestBody, manifestSha256: sha256(Buffer.from(JSON.stringify(manifestBody)))};
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: manifest.status, currentAuthorityUntouched: true, productionAdmitted: false, frames: frames.length, reviewSheet: path.relative(root, sheetPath), manifest: path.relative(root, path.join(outputRoot, "manifest.json"))}, null, 2));
}

await main();
