import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {buildGlyphPathRun, loadBilingualTitleFont} from "./a1-bilingual-title-svg-v1.mjs";
import {loadIntelligentTypographyConfig} from "./a1-intelligent-typography-director-v1.mjs";
import {auditTypographyStructurePixels} from "./a1-typography-structure-audit-v1.mjs";
import {compileTypographyMaterialCandidates} from "./a1-typography-material-compiler-v1.mjs";
import {rasterizeTypographySvg} from "./a1-typography-svg-rasterizer-v1.mjs";
import {auditCjkRoleLayout} from "./a1-cjk-role-layout-audit-v1.mjs";
import {measureTypographyPixelBalance} from "./a1-typography-pixel-balance-audit-v1.mjs";

const WIDTH = 1920;
const HEIGHT = 1080;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const rotateMarkup = (markup, bounds, rotation) => {
  if (!rotation) return markup;
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  return `<g transform="rotate(${rotation.toFixed(3)} ${cx.toFixed(3)} ${cy.toFixed(3)})">${markup}</g>`;
};

const rotatedBounds = (bounds, rotation, pivotBounds) => {
  if (!rotation) return {...bounds};
  const radians = rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const cx = pivotBounds.left + pivotBounds.width / 2;
  const cy = pivotBounds.top + pivotBounds.height / 2;
  const corners = [[bounds.left, bounds.top], [bounds.right, bounds.top], [bounds.right, bounds.bottom], [bounds.left, bounds.bottom]]
    .map(([x, y]) => [cx + (x - cx) * cosine - (y - cy) * sine, cy + (x - cx) * sine + (y - cy) * cosine]);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return {left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)};
};

const loadMask = async (file) => (await sharp(file).resize(WIDTH, HEIGHT, {fit: "fill", kernel: "nearest"}).greyscale().threshold(1).raw().toBuffer({resolveWithObject: true})).data;

const buildZoneMask = (base, box) => {
  const output = Buffer.alloc(WIDTH * HEIGHT);
  const left = Math.max(0, Math.floor(box.left));
  const top = Math.max(0, Math.floor(box.top));
  const right = Math.min(WIDTH, Math.ceil(box.right));
  const bottom = Math.min(HEIGHT, Math.ceil(box.bottom));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = y * WIDTH + x;
      output[index] = base[index];
    }
  }
  return output;
};

const unionAlpha = (masks) => {
  const output = Buffer.alloc(WIDTH * HEIGHT);
  for (let index = 0; index < output.length; index += 1) output[index] = Math.max(...masks.map((mask) => mask[index]));
  return output;
};

const displayPlaybackRenders = (glyphRuns) => [1, 0.5, 0.25].map((scale) => ({
  width: WIDTH * scale,
  height: HEIGHT * scale,
  lines: glyphRuns.map((run) => ({
    text: run.text,
    bounds: Object.fromEntries(Object.entries(run.bounds).filter(([key]) => ["left", "top", "right", "bottom"].includes(key)).map(([key, value]) => [key, value * scale])),
    fontSizePx: run.bounds.height * scale,
  })),
}));

const foregroundBuffer = async ({sourceRgb, mask}) => {
  const expanded = await sharp(mask, {raw: {width: WIDTH, height: HEIGHT, channels: 1}}).dilate(5).blur(2.2).raw().toBuffer();
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let index = 0; index < WIDTH * HEIGHT; index += 1) {
    const source = index * 3;
    const target = index * 4;
    rgba[target] = sourceRgb[source];
    rgba[target + 1] = sourceRgb[source + 1];
    rgba[target + 2] = sourceRgb[source + 2];
    rgba[target + 3] = Math.max(mask[index], expanded[index]);
  }
  return sharp(rgba, {raw: {width: WIDTH, height: HEIGHT, channels: 4}}).png().toBuffer();
};

const gradientVector = (degrees) => {
  const radians = degrees * Math.PI / 180;
  const dx = Math.cos(radians) * 50;
  const dy = Math.sin(radians) * 50;
  return {x1: 50 - dx, y1: 50 - dy, x2: 50 + dx, y2: 50 + dy};
};

const buildMaterialLayers = ({plan, fontBinding}) => {
  const vector = gradientVector(plan.material.gradient.angleDegrees);
  const gradientId = `gradient-${plan.materialRecipeId.toLowerCase()}`;
  const glowId = `glow-${plan.materialRecipeId.toLowerCase()}`;
  const definitions = `<defs><linearGradient id="${gradientId}" x1="${vector.x1}%" y1="${vector.y1}%" x2="${vector.x2}%" y2="${vector.y2}%">${plan.material.gradient.stops.map((stop) => `<stop offset="${stop.offset * 100}%" stop-color="${stop.color}"/>`).join("")}</linearGradient><filter id="${glowId}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${plan.material.glow.radius}"/></filter></defs>`;
  const coreMarkup = [];
  const visualMarkup = [];
  const glyphLayers = [];
  const glyphRuns = [];
  for (const run of plan.runs) {
    const main = buildGlyphPathRun({...run, fontBinding, fill: `url(#${gradientId})`});
    const core = buildGlyphPathRun({...run, fontBinding, fill: "#ffffff"});
    for (let layer = plan.material.depth.layers; layer >= 1; layer -= 1) {
      const fraction = layer / plan.material.depth.layers;
      const depthRun = buildGlyphPathRun({
        ...run,
        id: `${run.id}-depth-${layer}`,
        left: run.left + plan.material.depth.offsetX * fraction,
        top: run.top + plan.material.depth.offsetY * fraction,
        fontBinding,
        fill: plan.material.depth.color,
        opacity: plan.material.depth.opacity,
      });
      visualMarkup.push(rotateMarkup(depthRun.markup, depthRun.bounds, run.rotation));
    }
    const glowRun = buildGlyphPathRun({...run, id: `${run.id}-glow`, fontBinding, fill: plan.material.glow.color, opacity: plan.material.glow.opacity});
    visualMarkup.push(`<g filter="url(#${glowId})">${rotateMarkup(glowRun.markup, glowRun.bounds, run.rotation)}</g>`);
    visualMarkup.push(`<g stroke="${plan.material.stroke.color}" stroke-width="${plan.material.stroke.width}" stroke-opacity="${plan.material.stroke.opacity}" paint-order="stroke fill">${rotateMarkup(main.markup, main.bounds, run.rotation)}</g>`);
    coreMarkup.push(rotateMarkup(core.markup, core.bounds, run.rotation));
    const characters = Array.from(run.text);
    for (let index = 0; index < core.glyphMarkups.length; index += 1) {
      glyphLayers.push({
        id: `${run.id}-glyph-${index}`,
        character: characters[index] || null,
        bounds: rotatedBounds(core.glyphBounds[index].bounds, run.rotation, core.bounds),
        markup: `<g fill="#ffffff">${rotateMarkup(core.glyphMarkups[index], core.bounds, run.rotation)}</g>`,
      });
    }
    glyphRuns.push({id: run.id, text: run.text, glyphIds: core.glyphIds, glyphBounds: core.glyphBounds, bounds: core.bounds, rotation: run.rotation});
  }
  const wrap = (markup) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${definitions}${markup.join("")}</svg>`);
  return {coreSvg: wrap(coreMarkup), visualSvg: wrap(visualMarkup), glyphRuns, glyphLayers: glyphLayers.map((glyph) => ({...glyph, svg: wrap([glyph.markup])}))};
};

const buildBoard = async ({candidates, outputFile}) => {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 50;
  const canvas = sharp({create: {width: 1920, height: 960, channels: 4, background: "#101217"}});
  const composites = [];
  for (const [index, candidate] of candidates.entries()) {
    const left = (index % 4) * tileWidth;
    const top = Math.floor(index / 4) * (tileHeight + labelHeight);
    const image = await sharp(candidate.output.file).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101217"/><text x="12" y="20" fill="#f4ead7" font-family="monospace" font-size="13">${escapeXml(candidate.materialRecipeId)}</text><text x="12" y="39" fill="${candidate.pixelAudit.status === "PASS" ? "#88d498" : "#f07178"}" font-family="monospace" font-size="12">${escapeXml(candidate.pixelAudit.status)} · ${escapeXml(candidate.font.role)} · ${(candidate.pixelAudit.titleRelationship.occlusionRatio * 100).toFixed(1)}%</text></svg>`);
    composites.push({input: label, left, top}, {input: image, left, top: top + labelHeight});
  }
  await canvas.composite(composites).png().toFile(outputFile);
};

export async function buildEd01TypographyMaterialReview({outputDir, sourceFile, maskFiles, geometry, structureReport, fontCatalog}) {
  if (structureReport?.contract !== "A1Ed01IntelligentTypographyCanary/v1" || structureReport.status !== "READY_FOR_USER_STRUCTURE_REVIEW") throw new Error("ed01-typography-material-structure-report-invalid");
  fs.mkdirSync(outputDir, {recursive: true});
  const sourceMetadata = await sharp(sourceFile).metadata();
  if (sourceMetadata.width !== WIDTH || sourceMetadata.height !== HEIGHT) throw new Error(`ed01-typography-material-source-size-invalid:${sourceMetadata.width}x${sourceMetadata.height}`);
  const plans = compileTypographyMaterialCandidates({structureCandidates: structureReport.candidates, fontCatalog});
  const config = loadIntelligentTypographyConfig();
  const source = await sharp(sourceFile).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const maskBuffers = {};
  for (const [role, file] of Object.entries(maskFiles)) maskBuffers[role] = await loadMask(file);
  const subjectAlpha = unionAlpha([maskBuffers.face, maskBuffers.hair, maskBuffers.body]);
  const shoulderTop = Math.max(geometry.faceBounds.bottom - 24, geometry.subjectBounds.top);
  const shoulderBottom = Math.min(HEIGHT, shoulderTop + (geometry.subjectBounds.bottom - shoulderTop) * 0.52);
  const shoulderMid = (geometry.faceBounds.left + geometry.faceBounds.right) / 2;
  const auditMasks = {
    unified: maskBuffers.unified,
    protectedPresenter: subjectAlpha,
    face: maskBuffers.face,
    eyes: maskBuffers.eyes,
    mouth: maskBuffers.mouth,
    hair: maskBuffers.hair,
    leftShoulder: buildZoneMask(maskBuffers.body, {left: geometry.subjectBounds.left, top: shoulderTop, right: shoulderMid, bottom: shoulderBottom}),
    rightShoulder: buildZoneMask(maskBuffers.body, {left: shoulderMid, top: shoulderTop, right: geometry.subjectBounds.right, bottom: shoulderBottom}),
    microphone: maskBuffers.microphone,
  };
  const foreground = await foregroundBuffer({sourceRgb: source.data, mask: subjectAlpha});
  const fontBindings = new Map();
  const candidates = [];
  for (const plan of plans) {
    if (!fontBindings.has(plan.font.role)) fontBindings.set(plan.font.role, loadBilingualTitleFont(plan.font.file, plan.font.role.toLowerCase()));
    const fontBinding = fontBindings.get(plan.font.role);
    const layers = buildMaterialLayers({plan, fontBinding});
    const corePng = rasterizeTypographySvg({svg: layers.coreSvg, width: WIDTH, height: HEIGHT}).png;
    const visualPng = rasterizeTypographySvg({svg: layers.visualSvg, width: WIDTH, height: HEIGHT}).png;
    const titleAlpha = await sharp(corePng).ensureAlpha().extractChannel(3).raw().toBuffer();
    const glyphs = [];
    for (const glyph of layers.glyphLayers) {
      const glyphPng = rasterizeTypographySvg({svg: glyph.svg, width: WIDTH, height: HEIGHT}).png;
      const alpha = await sharp(glyphPng).ensureAlpha().extractChannel(3).raw().toBuffer();
      glyphs.push({id: glyph.id, character: glyph.character, bounds: glyph.bounds, alpha});
    }
    const outputFile = path.join(outputDir, `${plan.candidateId}.png`);
    await sharp(source.data, {raw: {width: WIDTH, height: HEIGHT, channels: 3}})
      .composite([{input: visualPng}, {input: foreground}])
      .removeAlpha()
      .png()
      .toFile(outputFile);
    const candidateRgb = await sharp(outputFile).removeAlpha().raw().toBuffer();
    const pixelAudit = auditTypographyStructurePixels({width: WIDTH, height: HEIGHT, sourceRgb: source.data, candidateRgb, titleAlpha, glyphs, masks: auditMasks, subjectBounds: geometry.subjectBounds, gates: config.hardGates});
    const cjkRoleAudit = auditCjkRoleLayout({role: "HERO_GENERATED_TYPE", locale: "zh-CN", sourceText: plan.exactCopy, playbackRenders: displayPlaybackRenders(layers.glyphRuns)});
    const pixelBalanceAudit = measureTypographyPixelBalance({
      width: WIDTH,
      height: HEIGHT,
      titleAlpha,
      subjectAlpha,
      microphoneAlpha: maskBuffers.microphone,
      sourceRgb: source.data,
      candidateRgb,
      contactMasks: {hair: auditMasks.hair, leftShoulder: auditMasks.leftShoulder, rightShoulder: auditMasks.rightShoulder, microphone: auditMasks.microphone},
    });
    candidates.push({
      candidateId: plan.candidateId,
      topology: plan.topology,
      exactCopy: plan.exactCopy,
      visibleCopy: plan.visibleCopy,
      structureCandidateId: plan.structureCandidateId,
      structurePlanSha256: plan.structurePlanSha256,
      materialRecipeId: plan.materialRecipeId,
      material: plan.material,
      font: plan.font,
      runs: plan.runs,
      glyphRuns: layers.glyphRuns,
      pixelAudit,
      cjkRoleAudit,
      pixelBalanceAudit,
      output: {file: outputFile, sha256: shaFile(outputFile), width: WIDTH, height: HEIGHT},
      renderStage: "MATERIAL_CANDIDATE",
      reviewOnly: true,
      productionAdmission: false,
      userVisualApproval: "NOT_APPROVED",
    });
  }
  const topologySurvivors = Object.fromEntries(["SUBJECT_CARVED_WALL", "ORBITAL_PHRASE_FIELD", "EDGE_CROP_TAKEOVER"].map((topology) => [topology, candidates.filter((candidate) => candidate.topology === topology && candidate.pixelAudit.status === "PASS").length]));
  const ready = Object.values(topologySurvivors).every((count) => count >= 2) && candidates.every((candidate) => candidate.pixelAudit.sourceProtection.changedPixels === 0);
  const boardFile = path.join(outputDir, "ED-01-typography-material-review-board.png");
  await buildBoard({candidates, outputFile: boardFile});
  const report = {
    contract: "A1Ed01TypographyMaterialReview/v1",
    status: ready ? "READY_FOR_USER_MATERIAL_REVIEW" : "MATERIAL_SEARCH_INCOMPLETE",
    reviewOnly: true,
    rasterEngine: "resvg-js",
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    workspaceMutationPerformed: false,
    motionStarted: false,
    source: {file: sourceFile, sha256: shaFile(sourceFile), width: WIDTH, height: HEIGHT},
    structureReportSha256: sha256(JSON.stringify(structureReport)),
    topologySurvivors,
    candidates,
    board: {file: boardFile, sha256: shaFile(boardFile), width: 1920, height: 960},
  };
  const reportFile = path.join(outputDir, "report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return {report, reportFile};
}
