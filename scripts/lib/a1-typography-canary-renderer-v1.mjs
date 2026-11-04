import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {buildGlyphPathRun, loadBilingualTitleFont} from "./a1-bilingual-title-svg-v1.mjs";
import {buildTypographyDesignBrief, compilePresenterHeroStructureCandidates, loadIntelligentTypographyConfig} from "./a1-intelligent-typography-director-v1.mjs";
import {auditTypographyStructurePixels} from "./a1-typography-structure-audit-v1.mjs";
import {rasterizeTypographySvg} from "./a1-typography-svg-rasterizer-v1.mjs";
import {auditCjkRoleLayout} from "./a1-cjk-role-layout-audit-v1.mjs";
import {measureTypographyPixelBalance} from "./a1-typography-pixel-balance-audit-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
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
  const corners = [
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.right, bounds.bottom],
    [bounds.left, bounds.bottom],
  ].map(([x, y]) => [cx + (x - cx) * cosine - (y - cy) * sine, cy + (x - cx) * sine + (y - cy) * cosine]);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return {left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)};
};

const loadMask = async (file, width, height) => {
  const result = await sharp(file).resize(width, height, {fit: "fill", kernel: "nearest"}).greyscale().threshold(1).raw().toBuffer({resolveWithObject: true});
  if (result.info.width !== width || result.info.height !== height || result.info.channels !== 1) throw new Error(`typography-mask-dimensions-invalid:${file}`);
  return result.data;
};

const buildZoneMask = (base, width, height, box) => {
  const output = Buffer.alloc(width * height);
  const left = Math.max(0, Math.floor(box.left));
  const top = Math.max(0, Math.floor(box.top));
  const right = Math.min(width, Math.ceil(box.right));
  const bottom = Math.min(height, Math.ceil(box.bottom));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = y * width + x;
      output[index] = base[index];
    }
  }
  return output;
};

const unionAlpha = (masks, pixelCount) => {
  const output = Buffer.alloc(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) output[index] = Math.max(...masks.map((mask) => mask[index]));
  return output;
};

const displayPlaybackRenders = (glyphRuns, width, height) => [1, 0.5, 0.25].map((scale) => ({
  width: width * scale,
  height: height * scale,
  lines: glyphRuns.map((run) => ({
    text: run.text,
    bounds: Object.fromEntries(Object.entries(run.bounds).filter(([key]) => ["left", "top", "right", "bottom"].includes(key)).map(([key, value]) => [key, value * scale])),
    fontSizePx: run.bounds.height * scale,
  })),
}));

const foregroundBuffer = async ({sourceRgb, mask, width, height}) => {
  const expanded = await sharp(mask, {raw: {width, height, channels: 1}}).dilate(5).blur(2.2).raw().toBuffer();
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const source = index * 3;
    const target = index * 4;
    rgba[target] = sourceRgb[source];
    rgba[target + 1] = sourceRgb[source + 1];
    rgba[target + 2] = sourceRgb[source + 2];
    rgba[target + 3] = Math.max(mask[index], expanded[index]);
  }
  return sharp(rgba, {raw: {width, height, channels: 4}}).png().toBuffer();
};

const buildRunLayers = ({plan, fontBinding, width, height}) => {
  const glyphRuns = [];
  const glyphLayers = [];
  const core = [];
  const visual = [];
  for (const run of plan.runs) {
    const shadow = buildGlyphPathRun({
      id: `${run.id}-shadow`,
      fontBinding,
      text: run.text,
      left: run.left + plan.structureStyle.offset.x,
      top: run.top + plan.structureStyle.offset.y,
      size: run.size,
      scaleX: run.scaleX,
      scaleY: run.scaleY,
      fill: plan.structureStyle.offset.fill,
      opacity: plan.structureStyle.offset.opacity,
    });
    const main = buildGlyphPathRun({
      id: run.id,
      fontBinding,
      text: run.text,
      left: run.left,
      top: run.top,
      size: run.size,
      scaleX: run.scaleX,
      scaleY: run.scaleY,
      fill: run.fill,
    });
    core.push(rotateMarkup(main.markup, main.bounds, run.rotation));
    visual.push(rotateMarkup(shadow.markup, shadow.bounds, run.rotation), rotateMarkup(main.markup, main.bounds, run.rotation));
    glyphRuns.push({id: run.id, text: run.text, family: main.family, role: main.role, glyphIds: main.glyphIds, glyphBounds: main.glyphBounds, bounds: main.bounds, rotation: run.rotation, tracking: main.tracking});
    const characters = Array.from(run.text);
    for (let index = 0; index < main.glyphMarkups.length; index += 1) {
      glyphLayers.push({
        id: `${run.id}-glyph-${index}`,
        character: characters[index] || null,
        bounds: rotatedBounds(main.glyphBounds[index].bounds, run.rotation, main.bounds),
        markup: `<g fill="#ffffff">${rotateMarkup(main.glyphMarkups[index], main.bounds, run.rotation)}</g>`,
      });
    }
  }
  const wrap = (markup) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${markup.join("")}</svg>`);
  return {coreSvg: wrap(core), visualSvg: wrap(visual), glyphRuns, glyphLayers: glyphLayers.map((glyph) => ({...glyph, svg: wrap([glyph.markup])}))};
};

const buildBoard = async ({candidates, outputFile}) => {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 50;
  const columns = 4;
  const rows = 3;
  const canvas = sharp({create: {width: tileWidth * columns, height: (tileHeight + labelHeight) * rows, channels: 4, background: "#101217"}});
  const composites = [];
  for (const [index, candidate] of candidates.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * tileWidth;
    const top = row * (tileHeight + labelHeight);
    const image = await sharp(candidate.output.file).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101217"/><text x="12" y="21" fill="#f4ead7" font-family="monospace" font-size="14">${escapeXml(candidate.topology)} · V${candidate.variant}</text><text x="12" y="40" fill="${candidate.pixelAudit.status === "PASS" ? "#88d498" : "#f07178"}" font-family="monospace" font-size="13">${escapeXml(candidate.pixelAudit.status)} · contact ${candidate.pixelAudit.contactGraph.actualZones.length} · occ ${(candidate.pixelAudit.titleRelationship.occlusionRatio * 100).toFixed(1)}%</text></svg>`);
    composites.push({input: label, left, top}, {input: image, left, top: top + labelHeight});
  }
  await canvas.composite(composites).png().toFile(outputFile);
};

export async function buildEd01IntelligentTypographyCanary({outputDir, sourceFile, fontFile, maskFiles, exactCopy, semanticRuns, geometry}) {
  const config = loadIntelligentTypographyConfig();
  const width = 1920;
  const height = 1080;
  fs.mkdirSync(outputDir, {recursive: true});
  const sourceMetadata = await sharp(sourceFile).metadata();
  if (sourceMetadata.width !== width || sourceMetadata.height !== height) throw new Error(`ed01-typography-source-size-invalid:${sourceMetadata.width}x${sourceMetadata.height}`);
  const requiredMasks = ["unified", "face", "hair", "eyes", "mouth", "microphone", "body"];
  for (const role of requiredMasks) if (!maskFiles[role] || !fs.existsSync(maskFiles[role])) throw new Error(`ed01-typography-mask-missing:${role}`);
  const brief = buildTypographyDesignBrief({
    shotId: "ED-01",
    exactCopy,
    semanticRuns,
    semanticEvent: "IDENTITY",
    carrier: "PRESENTER_BASE",
    source: {file: sourceFile, sha256: shaFile(sourceFile), width, height},
    masks: Object.fromEntries(Object.entries(maskFiles).map(([role, file]) => [role, {file, sha256: shaFile(file)}])),
    geometry,
  }, {config});
  const plans = compilePresenterHeroStructureCandidates(brief, {config});
  const fontBinding = loadBilingualTitleFont(fontFile, "zh-hero");
  const source = await sharp(sourceFile).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const maskBuffers = {};
  for (const [role, file] of Object.entries(maskFiles)) maskBuffers[role] = await loadMask(file, width, height);
  const subjectAlpha = unionAlpha([maskBuffers.face, maskBuffers.hair, maskBuffers.body], width * height);
  const shoulderTop = Math.max(geometry.faceBounds.bottom - 24, geometry.subjectBounds.top);
  const shoulderBottom = Math.min(height, shoulderTop + (geometry.subjectBounds.bottom - shoulderTop) * 0.52);
  const shoulderMid = (geometry.faceBounds.left + geometry.faceBounds.right) / 2;
  const auditMasks = {
    unified: maskBuffers.unified,
    protectedPresenter: subjectAlpha,
    face: maskBuffers.face,
    eyes: maskBuffers.eyes,
    mouth: maskBuffers.mouth,
    hair: maskBuffers.hair,
    leftShoulder: buildZoneMask(maskBuffers.body, width, height, {left: geometry.subjectBounds.left, top: shoulderTop, right: shoulderMid, bottom: shoulderBottom}),
    rightShoulder: buildZoneMask(maskBuffers.body, width, height, {left: shoulderMid, top: shoulderTop, right: geometry.subjectBounds.right, bottom: shoulderBottom}),
    microphone: maskBuffers.microphone,
  };
  const foreground = await foregroundBuffer({sourceRgb: source.data, mask: subjectAlpha, width, height});
  const candidates = [];
  for (const plan of plans) {
    const {coreSvg, visualSvg, glyphRuns, glyphLayers} = buildRunLayers({plan, fontBinding, width, height});
    const corePng = rasterizeTypographySvg({svg: coreSvg, width, height}).png;
    const visualPng = rasterizeTypographySvg({svg: visualSvg, width, height}).png;
    const titleAlpha = await sharp(corePng).ensureAlpha().extractChannel(3).raw().toBuffer();
    const glyphs = [];
    for (const glyph of glyphLayers) {
      const glyphPng = rasterizeTypographySvg({svg: glyph.svg, width, height}).png;
      const glyphAlpha = await sharp(glyphPng).ensureAlpha().extractChannel(3).raw().toBuffer();
      glyphs.push({id: glyph.id, character: glyph.character, bounds: glyph.bounds, alpha: glyphAlpha});
    }
    const outputFile = path.join(outputDir, `${plan.candidateId}.png`);
    await sharp(source.data, {raw: {width, height, channels: 3}})
      .composite([{input: visualPng}, {input: foreground}])
      .removeAlpha()
      .png()
      .toFile(outputFile);
    const candidateRgb = await sharp(outputFile).removeAlpha().raw().toBuffer();
    const pixelAudit = auditTypographyStructurePixels({
      width,
      height,
      sourceRgb: source.data,
      candidateRgb,
      titleAlpha,
      glyphs,
      masks: auditMasks,
      subjectBounds: geometry.subjectBounds,
      gates: config.hardGates,
    });
    const cjkRoleAudit = auditCjkRoleLayout({role: "HERO_GENERATED_TYPE", locale: "zh-CN", sourceText: plan.exactCopy, playbackRenders: displayPlaybackRenders(glyphRuns, width, height)});
    const pixelBalanceAudit = measureTypographyPixelBalance({
      width,
      height,
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
      variant: plan.variant,
      exactCopy: plan.exactCopy,
      planSha256: plan.planSha256,
      runs: plan.runs,
      contactTargets: plan.contactTargets,
      glyphRuns,
      pixelAudit,
      cjkRoleAudit,
      pixelBalanceAudit,
      output: {file: outputFile, sha256: shaFile(outputFile), width, height},
      productionAdmission: false,
      userVisualApproval: "NOT_APPROVED",
    });
  }
  const topologySurvivors = Object.fromEntries(brief.allowedTopologies.map((topology) => [topology, candidates.filter((item) => item.topology === topology && item.pixelAudit.status === "PASS").length]));
  const complete = Object.values(topologySurvivors).every((count) => count > 0);
  const boardFile = path.join(outputDir, "ED-01-intelligent-typography-structure-board.png");
  await buildBoard({candidates, outputFile: boardFile});
  const report = {
    contract: "A1Ed01IntelligentTypographyCanary/v1",
    status: complete ? "READY_FOR_USER_STRUCTURE_REVIEW" : "STRUCTURE_SEARCH_INCOMPLETE",
    reviewOnly: true,
    renderStage: "STRUCTURE_ONLY",
    rasterEngine: "resvg-js",
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    workspaceMutationPerformed: false,
    motionStarted: false,
    brief,
    font: {file: fontFile, sha256: shaFile(fontFile), family: fontBinding.family, postscriptName: fontBinding.postscriptName},
    topologySurvivors,
    candidates,
    board: {file: boardFile, sha256: shaFile(boardFile), width: 1920, height: 960},
  };
  const reportFile = path.join(outputDir, "report.json");
  writeJson(reportFile, report);
  return {report, reportFile};
}
