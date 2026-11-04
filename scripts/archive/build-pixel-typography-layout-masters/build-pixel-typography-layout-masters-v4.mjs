#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const dualFontV5 = process.argv.includes("--dual-font-v5");
const dualFontV6 = process.argv.includes("--dual-font-v6");
const dualFont = dualFontV5 || dualFontV6;
const outputRoot = path.join(root, dualFontV6 ? ".codex-artifacts/system-progress-system-line/dual-font-typography-layout-masters-v6" : dualFontV5 ? ".codex-artifacts/system-progress-system-line/dual-font-typography-layout-masters-v5" : ".codex-artifacts/system-progress-system-line/pixel-typography-layout-masters-v4");
const frameRoot = path.join(outputRoot, "frames");
const overlayRoot = path.join(outputRoot, "overlays");
const briefRoot = path.join(root, dualFont ? "work/style-research/dual-font-typography-layout-masters-v5/briefs" : "work/style-research/pixel-typography-layout-masters-v4/briefs");
const publicRoot = path.join(root, "apps/studio-next/public");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\//u, ""));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const palette = {
  ink: "#0b0f13",
  coolWhite: "#f3f5f2",
  blue: "#8faeff",
  cobalt: "#2452ff",
  acid: "#dfff68",
};

const fontSpecs = {
  frexBold: {
    assetId: "type-frex-sans-gb-bold-review",
    family: "Frex Sans GB Bold",
    file: path.join(root, ".codex-artifacts/system-progress-system-line/display-font-scout-v2/fonts/frex-sans-gb-bold.ttf"),
    expectedSha256: "1f9ec1e4ad5f8ca731491a5eec7f4b1bb08ab4c43a3138e90776d3b0bc384055",
  },
  boutiqueBold: {
    assetId: "type-boutique-9x9-bold-review",
    family: "BoutiqueBitmap9x9 Bold",
    file: path.join(root, ".codex-artifacts/system-progress-system-line/pixel-font-scout-v3/fonts/boutique-9x9-bold.ttf"),
    expectedSha256: "ba67f9138d43d5bc8ce6f59a74088d44973c99edeeadbebaf9541fc983bcb7ba",
  },
  boutique3d: {
    assetId: "type-boutique-9x9-3d-review",
    family: "BoutiqueBitmap9x9 3D",
    file: path.join(root, ".codex-artifacts/system-progress-system-line/pixel-font-scout-v3/fonts/boutique-9x9-3d.ttf"),
    expectedSha256: "54e3b75e92d7a541a71262c8b2ffe6b356257bd46f3628d37db72ad0ab1d3c4b",
  },
  changban: {
    assetId: "type-changban-diansong-16-review",
    family: "ChangBan DianSong 16 SC",
    file: path.join(root, ".codex-artifacts/system-progress-system-line/pixel-font-scout-v3/fonts/changban-diansong-16-sc.ttf"),
    expectedSha256: "b36947389aff05fbfed574fe7a7e58dc354c00f107fa616a2fd2b20ca12df4a6",
  },
};

const sourceSpecs = {
  presenter: {
    file: publicFile("/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-31.jpg"),
    role: "verified-real-presenter-hold-frame",
  },
  presenterMatte: {
    file: publicFile("/generated/system-line/editorial-asset-workbench-v1/whole-film-motion-plan-v1/mattes/ED-31-dynamic-original-video-alpha.png"),
    role: "real-presenter-microphone-boom-foreground-matte",
  },
  faceMask: {
    file: publicFile("/generated/system-line/editorial-asset-workbench-v1/original-presenter-pixel-restore-v1/ED-31/components/ed-31-face-mask.png"),
    role: "real-face-protection-mask",
  },
  fullscreenBackground: {
    file: publicFile("/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-cool-halftone-quiet-field-v1.png"),
    role: "approved-current-review-lane-cool-halftone-background",
  },
};

for (const spec of Object.values(sourceSpecs)) {
  if (!fs.existsSync(spec.file)) throw new Error(`missing-source:${spec.file}`);
  spec.sha256 = fileSha256(spec.file);
}

const fonts = Object.fromEntries(Object.entries(fontSpecs).map(([key, spec]) => {
  if (!fs.existsSync(spec.file)) throw new Error(`missing-font:${spec.file}`);
  const actualSha256 = fileSha256(spec.file);
  if (actualSha256 !== spec.expectedSha256) throw new Error(`font-sha-mismatch:${key}:${actualSha256}`);
  const bytes = fs.readFileSync(spec.file);
  return [key, {...spec, actualSha256, font: fontkit.create(bytes)}];
}));

const briefSpecs = [
  {id: "01-presenter-headline", file: path.join(briefRoot, "01-presenter-headline.json")},
  {id: "02-fullscreen-verdict", file: path.join(briefRoot, "02-fullscreen-verdict.json")},
  {id: "03-presenter-depth-mask", file: path.join(briefRoot, "03-presenter-depth-mask.json")},
].map((item) => ({...item, value: readJson(item.file), sha256: fileSha256(item.file)}));

function glyphLine({id, fontKey, text, x, y, size, tracking = 0, scaleX = 1, fill, role, layer, shadow = null}) {
  const fontSpec = fonts[fontKey];
  const font = fontSpec.font;
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`missing-glyph:${fontSpec.family}:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    const bbox = glyph.bbox;
    if (bbox && bbox.maxX > bbox.minX && bbox.maxY > bbox.minY) {
      minX = Math.min(minX, cursor + bbox.minX * scale * scaleX);
      maxX = Math.max(maxX, cursor + bbox.maxX * scale * scaleX);
      minY = Math.min(minY, y - bbox.maxY * scale);
      maxY = Math.max(maxY, y - bbox.minY * scale);
    }
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  const body = paths.join("");
  const shadowMarkup = shadow ? `<g fill="${shadow.fill}" opacity="${shadow.opacity}" transform="translate(${shadow.x} ${shadow.y})">${body}</g>` : "";
  return {
    markup: `${shadowMarkup}<g fill="${fill}">${body}</g>`,
    spec: {
      id,
      text,
      role,
      layer,
      fontAssetId: fontSpec.assetId,
      fontFamily: fontSpec.family,
      fontSha256: fontSpec.actualSha256,
      geometry: {x, y, size, tracking, scaleX},
      bounds: {x: Number(minX.toFixed(2)), y: Number(minY.toFixed(2)), width: Number((maxX - minX).toFixed(2)), height: Number((maxY - minY).toFixed(2))},
      fill,
      shadow,
      glyphIds,
      editable: true,
      generated: false,
    },
  };
}

async function maskBuffer(file, width = 1920, height = 1080) {
  const image = sharp(file).resize(width, height, {fit: "fill"});
  const meta = await image.metadata();
  const channel = meta.hasAlpha ? 3 : 0;
  return image.extractChannel(channel).raw().toBuffer();
}

async function foregroundFromBase(basePixels, matteFile) {
  const {data, info} = await sharp(basePixels).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const alpha = await maskBuffer(matteFile, info.width, info.height);
  for (let index = 0; index < info.width * info.height; index += 1) data[index * 4 + 3] = alpha[index];
  return sharp(data, {raw: info}).png({compressionLevel: 9}).toBuffer();
}

async function overlapMetrics(overlayPixels, matteFile) {
  const overlayAlpha = await sharp(overlayPixels).extractChannel(3).raw().toBuffer();
  const matte = await maskBuffer(matteFile);
  let overlayCount = 0;
  let matteCount = 0;
  let overlapCount = 0;
  for (let index = 0; index < overlayAlpha.length; index += 1) {
    const overlayOn = overlayAlpha[index] >= 16;
    const matteOn = matte[index] >= 64;
    if (overlayOn) overlayCount += 1;
    if (matteOn) matteCount += 1;
    if (overlayOn && matteOn) overlapCount += 1;
  }
  return {
    overlayPixels: overlayCount,
    mattePixels: matteCount,
    overlapPixels: overlapCount,
    overlayOverlapRatio: Number((overlapCount / Math.max(1, overlayCount)).toFixed(6)),
    matteOverlapRatio: Number((overlapCount / Math.max(1, matteCount)).toFixed(6)),
  };
}

function svgFor(nodes) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${nodes.map((node) => node.markup).join("")}</svg>`);
}

async function writeFrame({id, label, layoutType, exactCopy, brief, basePixels, nodes, foregroundPixels = null, presenterMode, zOrder, qualityIntent}) {
  const overlayPixels = await sharp(svgFor(nodes)).png().toBuffer();
  const layers = [{input: overlayPixels}];
  if (foregroundPixels) layers.push({input: foregroundPixels});
  const framePixels = await sharp(basePixels).composite(layers).png({compressionLevel: 9}).toBuffer();
  const frameFile = path.join(frameRoot, `${id}.png`);
  const overlayFile = path.join(overlayRoot, `${id}.png`);
  fs.writeFileSync(frameFile, framePixels);
  fs.writeFileSync(overlayFile, overlayPixels);
  const presenterOverlap = presenterMode === "NONE" ? null : await overlapMetrics(overlayPixels, sourceSpecs.presenterMatte.file);
  const faceOverlap = presenterMode === "NONE" ? null : await overlapMetrics(overlayPixels, sourceSpecs.faceMask.file);
  return {
    id,
    label,
    layoutType,
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    exactCopy,
    brief: {file: path.relative(root, brief.file), sha256: brief.sha256, fingerprint: brief.value.fingerprint},
    frame: {file: path.relative(root, frameFile), sha256: sha256(framePixels), width: 1920, height: 1080},
    overlay: {file: path.relative(root, overlayFile), sha256: sha256(overlayPixels), transparent: true},
    textNodes: nodes.map((node) => node.spec),
    presenterMode,
    zOrder,
    presenterOverlap,
    faceOverlap,
    qualityIntent,
    formalOverlay: {renderer: "fontkit-svg-paths-over-sharp", cssUsed: false, htmlUsed: false, generatedFormalText: false, verticalBars: 0, decorativeGeometryCount: 0, allowedSvgElements: ["svg", "g", "path"]},
    editableText: true,
    productionAdmitted: false,
  };
}

async function buildPresenterHeadline(basePixels, brief) {
  const graded = await sharp(basePixels).modulate({brightness: 0.78, saturation: 0.78}).png().toBuffer();
  const nodes = dualFontV6 ? [
    glyphLine({id: "presenter-context", fontKey: "frexBold", text: "觉得不方便的地方", x: 68, y: 148, size: 68, tracking: 4, scaleX: .96, fill: palette.blue, role: "editorial-context", layer: "negative-space"}),
    glyphLine({id: "presenter-pixel-keyword", fontKey: "boutiqueBold", text: "可控", x: 66, y: 470, size: 270, tracking: 18, scaleX: .94, fill: palette.coolWhite, role: "pixel-keyword", layer: "negative-space"}),
    glyphLine({id: "presenter-editorial-tail", fontKey: "frexBold", text: "的工作流", x: 78, y: 780, size: 108, tracking: 3, scaleX: .94, fill: palette.blue, role: "editorial-tail", layer: "negative-space"}),
  ] : dualFontV5 ? [
    glyphLine({id: "presenter-context", fontKey: "frexBold", text: "觉得不方便的地方", x: 72, y: 160, size: 78, tracking: 3, scaleX: .96, fill: palette.blue, role: "editorial-context", layer: "negative-space", shadow: {fill: palette.ink, opacity: .86, x: 4, y: 6}}),
    glyphLine({id: "presenter-pixel-keyword", fontKey: "boutiqueBold", text: "可控", x: 72, y: 430, size: 220, tracking: 8, scaleX: .94, fill: palette.coolWhite, role: "pixel-keyword", layer: "negative-space", shadow: {fill: palette.ink, opacity: .92, x: 7, y: 10}}),
    glyphLine({id: "presenter-editorial-tail", fontKey: "frexBold", text: "的工作流", x: 1300, y: 705, size: 120, tracking: 3, scaleX: .94, fill: palette.coolWhite, role: "editorial-tail", layer: "negative-space", shadow: {fill: palette.ink, opacity: .92, x: 6, y: 8}}),
  ] : [
    glyphLine({id: "presenter-context", fontKey: "changban", text: "觉得不方便的地方", x: 72, y: 150, size: 76, tracking: -2, scaleX: .96, fill: palette.blue, role: "context", layer: "negative-space", shadow: {fill: palette.ink, opacity: .86, x: 4, y: 6}}),
    glyphLine({id: "presenter-title-a", fontKey: "boutiqueBold", text: "可控的", x: 72, y: 380, size: 196, tracking: -7, scaleX: .94, fill: palette.coolWhite, role: "headline", layer: "negative-space", shadow: {fill: palette.ink, opacity: .92, x: 7, y: 10}}),
    glyphLine({id: "presenter-title-b", fontKey: "boutiqueBold", text: "工作流", x: 1305, y: 705, size: 188, tracking: -7, scaleX: .92, fill: palette.coolWhite, role: "headline", layer: "negative-space", shadow: {fill: palette.ink, opacity: .92, x: 7, y: 10}}),
  ];
  return writeFrame({id: "01-presenter-headline", label: "口播＋大标题", layoutType: "PRESENTER_HEADLINE", exactCopy: ["觉得不方便的地方", "可控的工作流"], brief, basePixels: graded, nodes, presenterMode: "REAL_PRESENTER_NEGATIVE_SPACE", zOrder: ["graded-presenter-frame", "renderer-bound-typography"], qualityIntent: "Large title coexists with the real presenter through negative space; no card, panel, line, or vertical bar."});
}

async function buildFullscreenVerdict(brief) {
  const basePixels = await sharp(sourceSpecs.fullscreenBackground.file).resize(1920, 1080, {fit: "cover"}).modulate({brightness: .93, saturation: .72}).png().toBuffer();
  const nodes = dualFontV6 ? [
    glyphLine({id: "fullscreen-premise", fontKey: "frexBold", text: "完成度很高的", x: 112, y: 235, size: 112, tracking: 6, scaleX: .96, fill: palette.ink, role: "editorial-premise", layer: "fullscreen"}),
    glyphLine({id: "fullscreen-verdict", fontKey: "boutiqueBold", text: "废稿", x: 365, y: 825, size: 500, tracking: 28, scaleX: .96, fill: palette.cobalt, role: "pixel-verdict", layer: "fullscreen"}),
  ] : dualFontV5 ? [
    glyphLine({id: "fullscreen-premise", fontKey: "frexBold", text: "完成度很高的", x: 112, y: 250, size: 132, tracking: 4, scaleX: .96, fill: palette.ink, role: "editorial-premise", layer: "fullscreen"}),
    glyphLine({id: "fullscreen-verdict", fontKey: "boutiqueBold", text: "废稿", x: 555, y: 865, size: 560, tracking: 12, scaleX: .96, fill: palette.cobalt, role: "pixel-verdict", layer: "fullscreen", shadow: {fill: palette.ink, opacity: .9, x: 12, y: 16}}),
  ] : [
    glyphLine({id: "fullscreen-premise", fontKey: "changban", text: "完成度很高的", x: 112, y: 230, size: 126, tracking: -3, scaleX: .96, fill: palette.ink, role: "premise", layer: "fullscreen"}),
    glyphLine({id: "fullscreen-verdict", fontKey: "boutique3d", text: "废稿", x: 555, y: 880, size: 610, tracking: -24, scaleX: .96, fill: palette.cobalt, role: "verdict", layer: "fullscreen", shadow: {fill: palette.ink, opacity: .9, x: 12, y: 16}}),
  ];
  return writeFrame({id: "02-fullscreen-verdict", label: "全屏像素结论", layoutType: "FULLSCREEN_TYPOGRAPHY", exactCopy: ["完成度很高的废稿"], brief, basePixels, nodes, presenterMode: "NONE", zOrder: ["cool-halftone-background", "renderer-bound-typography"], qualityIntent: "Short fullscreen takeover with one verdict actor; no subtitle card, fake UI, line, or vertical bar."});
}

async function buildPresenterDepthMask(basePixels, foregroundPixels, brief) {
  const background = await sharp(basePixels).modulate({brightness: .5, saturation: .55}).tint("#1b2531").png().toBuffer();
  const nodes = dualFontV6 ? [
    glyphLine({id: "depth-context", fontKey: "frexBold", text: "把不方便变成", x: 82, y: 150, size: 72, tracking: 4, scaleX: .96, fill: palette.blue, role: "editorial-context", layer: "behind-presenter"}),
    glyphLine({id: "depth-pixel-keyword", fontKey: "boutiqueBold", text: "可控", x: 58, y: 700, size: 390, tracking: 14, scaleX: .95, fill: palette.coolWhite, role: "pixel-keyword", layer: "behind-presenter"}),
    glyphLine({id: "depth-editorial-tail", fontKey: "frexBold", text: "工作流", x: 1260, y: 865, size: 170, tracking: 4, scaleX: .94, fill: palette.blue, role: "editorial-tail", layer: "behind-presenter"}),
  ] : dualFontV5 ? [
    glyphLine({id: "depth-context", fontKey: "frexBold", text: "把不方便变成", x: 88, y: 155, size: 82, tracking: 3, scaleX: .96, fill: palette.blue, role: "editorial-context", layer: "behind-presenter", shadow: {fill: palette.ink, opacity: .88, x: 4, y: 6}}),
    glyphLine({id: "depth-pixel-keyword", fontKey: "boutiqueBold", text: "可控", x: 72, y: 650, size: 350, tracking: 10, scaleX: .95, fill: palette.coolWhite, role: "pixel-keyword", layer: "behind-presenter", shadow: {fill: palette.ink, opacity: .92, x: 10, y: 14}}),
    glyphLine({id: "depth-editorial-tail", fontKey: "frexBold", text: "工作流", x: 1240, y: 875, size: 195, tracking: 4, scaleX: .94, fill: palette.acid, role: "editorial-tail", layer: "behind-presenter", shadow: {fill: palette.ink, opacity: .92, x: 8, y: 11}}),
  ] : [
    glyphLine({id: "depth-context", fontKey: "changban", text: "把不方便变成", x: 88, y: 145, size: 78, tracking: -2, scaleX: .96, fill: palette.blue, role: "context", layer: "behind-presenter", shadow: {fill: palette.ink, opacity: .88, x: 4, y: 6}}),
    glyphLine({id: "depth-title-a", fontKey: "boutiqueBold", text: "可控", x: 72, y: 650, size: 350, tracking: -15, scaleX: .95, fill: palette.coolWhite, role: "depth-headline", layer: "behind-presenter", shadow: {fill: palette.ink, opacity: .92, x: 10, y: 14}}),
    glyphLine({id: "depth-title-b", fontKey: "boutiqueBold", text: "工作流", x: 1215, y: 875, size: 205, tracking: -8, scaleX: .94, fill: palette.acid, role: "depth-headline", layer: "behind-presenter", shadow: {fill: palette.ink, opacity: .92, x: 8, y: 11}}),
  ];
  return writeFrame({id: "03-presenter-depth-mask", label: "人物遮罩大字", layoutType: "PRESENTER_DEPTH_MASK", exactCopy: ["把不方便变成可控工作流"], brief, basePixels: background, nodes, foregroundPixels, presenterMode: "REAL_PRESENTER_FOREGROUND_MASK", zOrder: ["darkened-presenter-background", "renderer-bound-typography", "original-presenter-microphone-boom-foreground"], qualityIntent: "Oversized headline occupies scene depth and is naturally occluded by the real foreground; face pixels remain original and no title card or vertical bar is used."});
}

async function main() {
  fs.mkdirSync(frameRoot, {recursive: true});
  fs.mkdirSync(overlayRoot, {recursive: true});
  const presenterBase = await sharp(sourceSpecs.presenter.file).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const presenterForeground = await foregroundFromBase(presenterBase, sourceSpecs.presenterMatte.file);
  const frames = [];
  frames.push(await buildPresenterHeadline(presenterBase, briefSpecs[0]));
  frames.push(await buildFullscreenVerdict(briefSpecs[1]));
  frames.push(await buildPresenterDepthMask(presenterBase, presenterForeground, briefSpecs[2]));

  const labelHeight = 58;
  const headerHeight = 70;
  const rowHeight = 1080 + labelHeight;
  const sheetHeight = headerHeight + frames.length * rowHeight;
  const sheetFile = path.join(outputRoot, dualFontV6 ? "dual-font-typography-layout-masters-v6.png" : dualFontV5 ? "dual-font-typography-layout-masters-v5.png" : "pixel-typography-layout-masters-v4.png");
  const labelMarkup = frames.map((frame, index) => `<text x="24" y="${headerHeight + index * rowHeight + 1080 + 38}" fill="#f3f5f2" font-family="monospace" font-size="21">${frame.label} · ${frame.layoutType}</text>`).join("");
  const sheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${sheetHeight}"><rect width="100%" height="100%" fill="#090c0e"/><text x="24" y="42" fill="#dfff68" font-family="monospace" font-size="22">${dualFontV6 ? "A1 DUAL-FONT TYPOGRAPHY LAYOUT MASTERS V6" : dualFontV5 ? "A1 DUAL-FONT TYPOGRAPHY LAYOUT MASTERS V5" : "A1 PIXEL TYPOGRAPHY LAYOUT MASTERS V4"} · ACTUAL PIXELS · REVIEW ONLY</text>${labelMarkup}</svg>`);
  await sharp(sheetSvg).composite(frames.map((frame, index) => ({input: path.join(root, frame.frame.file), left: 0, top: headerHeight + index * rowHeight}))).png({compressionLevel: 9}).toFile(sheetFile);

  const manifestBody = {
    contract: dualFontV6 ? "A1DualFontTypographyLayoutMasters/v6" : dualFontV5 ? "A1DualFontTypographyLayoutMasters/v5" : "A1PixelTypographyLayoutMasters/v4",
    status: "READY_FOR_OBJECTIVE_AND_USER_ACTUAL_PIXEL_REVIEW",
    semanticJobs: ["presenter-plus-large-title", "fullscreen-title-takeover", "presenter-depth-mask-title"],
    directionCorrection: dualFontV6 ? "DUAL_FONT_LOCKUP_WITH_WORD_SPECIFIC_TRACKING_NO_HEAVY_SHADOW_AND_RESTRAINED_PALETTE" : dualFontV5 ? "DUAL_FONT_EDITORIAL_HIERARCHY_WITH_OPEN_TRACKED_PIXEL_KEYWORDS" : "GENUINE_CHINESE_PIXEL_GLYPH_VARIETY_EMBEDDED_IN_VIDEO_COMPOSITION",
    typographyHierarchy: dualFont ? {editorialPrimary: "type-frex-sans-gb-bold-review", pixelSignature: "type-boutique-9x9-bold-review", targetUsageRatio: {editorial: 0.75, pixel: 0.25}, pixelKeywordMaximumCharacters: 4, pixelTrackingPolicy: dualFontV6 ? "WORD_SPECIFIC_NONNEGATIVE" : "NONNEGATIVE"} : {primary: "type-boutique-9x9-bold-review", semanticSpecial: "type-boutique-9x9-3d-review", editorialContrast: "type-changban-diansong-16-review"},
    treatmentRefinement: dualFontV6 ? {sharedLockupEdges: true, heavyDropShadowRemoved: true, palette: [palette.ink, palette.coolWhite, palette.blue, palette.cobalt], acidExcluded: true, wordSpecificPixelTracking: {"可控-presenter": 18, "废稿-fullscreen": 28, "可控-depth": 14}} : null,
    exactFormalTextRendererBound: true,
    formalTextGeneratedByImageModel: false,
    imageGenUsed: false,
    motionUsed: false,
    resolveUsed: false,
    finalRenderUsed: false,
    verticalBars: 0,
    currentAuthorityUntouched: true,
    defaultFontChanged: false,
    productionAdmitted: false,
    userVisualApproval: "NOT_APPROVED",
    fonts: Object.values(fonts).filter((font) => new Set(frames.flatMap((frame) => frame.textNodes.map((node) => node.fontAssetId))).has(font.assetId)).map((font) => ({assetId: font.assetId, family: font.family, file: path.relative(root, font.file), sha256: font.actualSha256, license: "OFL-1.1", reviewOnly: true})),
    sources: Object.fromEntries(Object.entries(sourceSpecs).map(([id, source]) => [id, {file: path.relative(root, source.file), sha256: source.sha256, role: source.role}])),
    frames,
    reviewSheet: {file: path.relative(root, sheetFile), sha256: fileSha256(sheetFile), width: 1920, height: sheetHeight},
    generatedAt: new Date().toISOString(),
  };
  const manifest = {...manifestBody, manifestSha256: sha256(Buffer.from(JSON.stringify(manifestBody)))};
  const manifestFile = path.join(outputRoot, "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: manifest.status, frameCount: frames.length, frames: frames.map(({id, layoutType, frame, presenterOverlap, faceOverlap}) => ({id, layoutType, sha256: frame.sha256, presenterOverlap, faceOverlap})), reviewSheet: manifest.reviewSheet, currentAuthorityUntouched: true}, null, 2));
}

await main();
