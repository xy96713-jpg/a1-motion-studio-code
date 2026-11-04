#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(phaseRoot, "system-validation-candidate-v1");
const typographyPath = path.join(candidateRoot, "editable-typography-specs.json");
const fontPath = path.join(phaseRoot, "font-cache/fusion-pixel.ttf");
const expectedWorkspaceSha256 = process.argv[2];
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const width = 1920;
const height = 1080;

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("editable-typography-shadow-expected-workspace-sha-required");
if (!fs.existsSync(typographyPath) || !fs.existsSync(fontPath)) throw new Error("editable-typography-shadow-input-missing");
const typography = JSON.parse(fs.readFileSync(typographyPath, "utf8"));
const fontSha256 = fileSha256(fontPath);
if (fontSha256 !== "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32" || typography.policy?.postApprovalReconstructionFont?.sha256 !== fontSha256) throw new Error("editable-typography-shadow-font-binding-invalid");
const font = fontkit.create(fs.readFileSync(fontPath));
const sourceEntries = (typography.entries || []).filter((entry) => entry.postApprovalRequirement === "REBUILD_AS_EDITABLE_TEXT_LAYER_AFTER_EXPLICIT_USER_VISUAL_APPROVAL");
if (sourceEntries.length !== 9) throw new Error(`editable-typography-shadow-source-count-invalid:${sourceEntries.length}`);

function layoutNode(node) {
  const box = node.normalizedBoundingBox;
  if (!box || [box.x, box.y, box.width, box.height].some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error(`editable-typography-shadow-geometry-invalid:${node.id}`);
  const glyphs = [];
  let advanceUnits = 0;
  let minYUnits = Number.POSITIVE_INFINITY;
  let maxYUnits = Number.NEGATIVE_INFINITY;
  for (const character of [...node.text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`editable-typography-shadow-missing-glyph:${node.id}:${character}`);
    glyphs.push({character, glyph, xUnits: advanceUnits});
    advanceUnits += position.xAdvance;
    if (glyph.bbox && glyph.bbox.maxY > glyph.bbox.minY) {
      minYUnits = Math.min(minYUnits, glyph.bbox.minY);
      maxYUnits = Math.max(maxYUnits, glyph.bbox.maxY);
    }
  }
  if (!Number.isFinite(minYUnits) || !Number.isFinite(maxYUnits) || advanceUnits <= 0) throw new Error(`editable-typography-shadow-empty-outline:${node.id}`);
  const target = {x: box.x * width, y: (1 - box.y - box.height) * height, width: box.width * width, height: box.height * height};
  const padding = Math.max(4, Math.min(target.width, target.height) * 0.06);
  const sizeByWidth = Math.max(1, (target.width - padding * 2) * font.unitsPerEm / advanceUnits);
  const sizeByHeight = Math.max(1, (target.height - padding * 2) * font.unitsPerEm / (maxYUnits - minYUnits));
  const fontSize = Math.min(sizeByWidth, sizeByHeight);
  const scale = fontSize / font.unitsPerEm;
  const renderedWidth = advanceUnits * scale;
  const renderedHeight = (maxYUnits - minYUnits) * scale;
  const x = target.x + Math.max(padding, (target.width - renderedWidth) / 2);
  const baseline = target.y + Math.max(padding, (target.height - renderedHeight) / 2) + maxYUnits * scale;
  const paths = glyphs.map(({glyph, xUnits}) => {
    const d = glyph.path.toSVG();
    return d ? `<path d="${d}" transform="translate(${(x + xUnits * scale).toFixed(3)} ${baseline.toFixed(3)}) scale(${scale.toFixed(7)} ${(-scale).toFixed(7)})"/>` : "";
  }).join("");
  return {
    markup: `<g fill="#101315">${paths}</g>`,
    editableTextMarkup: `<text id="${xml(node.id)}" x="${x.toFixed(3)}" y="${baseline.toFixed(3)}" font-family="A1 Fusion Pixel" font-size="${fontSize.toFixed(3)}" fill="#101315">${xml(node.text)}</text>`,
    spec: {
      id: node.id,
      text: node.text,
      editable: true,
      generatedFormalText: false,
      geometrySource: node.geometrySource,
      observedNormalizedBoundingBox: box,
      renderGeometry: {canvas: {width, height}, x: Number(x.toFixed(3)), baseline: Number(baseline.toFixed(3)), fontSize: Number(fontSize.toFixed(3)), targetBounds: Object.fromEntries(Object.entries(target).map(([key, value]) => [key, Number(value.toFixed(3))]))},
      fontBinding: {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", sha256: fontSha256},
      renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES",
      editableSourceFormat: "SVG_TEXT_NODE_AND_JSON_SPEC",
      glyphIds: glyphs.map(({glyph}) => glyph.id),
      glyphCount: glyphs.length,
    },
  };
}

const build = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`editable-typography-shadow-workspace-cas-failed:${current.workspaceSha256}`);
  const candidate = current.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate;
  if (candidate?.status !== "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW" || candidate.sourceBoardSha256 !== typography.sourceBoardSha256 || candidate.typography?.postApprovalRebuildCount !== 9 || candidate.userVisualApproval !== "NOT_APPROVED") throw new Error("editable-typography-shadow-current-candidate-required");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("editable-typography-shadow-frozen-empty-runtime-required");
  const binaryFiles = {};
  const items = [];
  const contactTiles = [];
  for (const entry of sourceEntries) {
    if (entry.nodes?.length !== entry.exactCopy?.length || entry.nodes.some((node, index) => node.text !== entry.exactCopy[index])) throw new Error(`editable-typography-shadow-copy-binding-invalid:${entry.shotId}`);
    const nodes = entry.nodes.map(layoutNode);
    const pathSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${nodes.map((node) => node.markup).join("")}</svg>`;
    const editableSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>@font-face{font-family:'A1 Fusion Pixel';src:url('../../../font-cache/fusion-pixel.ttf') format('truetype');}</style>${nodes.map((node) => node.editableTextMarkup).join("")}</svg>`;
    const png = await sharp(Buffer.from(pathSvg)).png({compressionLevel: 9}).toBuffer();
    const raw = await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    let visiblePixelCount = 0;
    for (let index = 3; index < raw.data.length; index += 4) if (raw.data[index] > 0) visiblePixelCount += 1;
    if (visiblePixelCount < 100) throw new Error(`editable-typography-shadow-visible-pixels-invalid:${entry.shotId}`);
    const prefix = `system-validation-candidate-v1/editable-typography-shadows/${entry.shotId}`;
    const pngName = `${prefix}/actual-pixel-proof.png`;
    const svgName = `${prefix}/editable-layer.svg`;
    const specName = `${prefix}/editable-layer.json`;
    const specBody = {contract: "A1EditableTypographyShadowLayer/v1", status: "BUILT_PENDING_ACTUAL_PIXEL_VISUAL_REVIEW", shotId: entry.shotId, selectedMasterSha256: entry.selectedMasterSha256, exactCopy: entry.exactCopy, canvas: {width, height}, nodes: nodes.map((node) => node.spec), fontBinding: {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", sha256: fontSha256}, visiblePixelCount, sourceTypographyAuditSha256: typography.auditSha256, hiddenShadowOnly: true, canonicalMasterPixelsChanged: false};
    const spec = {...specBody, layerSha256: sha256(specBody)};
    binaryFiles[pngName] = png;
    binaryFiles[svgName] = Buffer.from(editableSvg);
    binaryFiles[specName] = Buffer.from(`${JSON.stringify(spec, null, 2)}\n`);
    items.push({shotId: entry.shotId, status: "BUILT_PENDING_ACTUAL_PIXEL_VISUAL_REVIEW", selectedMasterSha256: entry.selectedMasterSha256, exactCopy: entry.exactCopy, editableSource: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${svgName}`, sha256: sha256(Buffer.from(editableSvg))}, editableSpec: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${specName}`, sha256: sha256(binaryFiles[specName]), layerSha256: spec.layerSha256}, actualPixelProof: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${pngName}`, sha256: sha256(png), visiblePixelCount}, nodeCount: nodes.length, glyphCount: nodes.reduce((sum, node) => sum + node.spec.glyphCount, 0), fontBinding: spec.fontBinding, hiddenShadowOnly: true, canonicalMasterPixelsChanged: false});
    const tile = await sharp({create: {width: 480, height: 304, channels: 4, background: "#eef2f3"}}).composite([
      {input: await sharp(png).resize(480, 270, {fit: "fill", kernel: "nearest"}).png().toBuffer(), left: 0, top: 34},
      {input: Buffer.from(`<svg width="480" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="34" fill="#101315"/><text x="14" y="23" fill="#dfff68" font-family="monospace" font-size="16" font-weight="700">${entry.shotId} EDITABLE SHADOW</text></svg>`), left: 0, top: 0},
    ]).png().toBuffer();
    contactTiles.push(tile);
  }
  const contactSheet = await sharp({create: {width: 1440, height: 912, channels: 4, background: "#15191c"}}).composite(contactTiles.map((input, index) => ({input, left: (index % 3) * 480, top: Math.floor(index / 3) * 304}))).png({compressionLevel: 9}).toBuffer();
  const contactName = "system-validation-candidate-v1/editable-typography-shadows/contact-sheet.png";
  binaryFiles[contactName] = contactSheet;
  const now = new Date().toISOString();
  const manifestBody = {contract: "A1PostApprovalEditableTypographyShadowManifest/v1", status: "BUILT_PENDING_ACTUAL_PIXEL_VISUAL_REVIEW", sourceBoardSha256: candidate.sourceBoardSha256, sourceApprovalDecisionSha256: candidate.sourceApprovalDecisionSha256, sourceCandidateSha256: candidate.candidateSha256, sourceTypographyAuditSha256: typography.auditSha256, fontBinding: {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", sha256: fontSha256}, rebuiltShotCount: items.length, existingCanonicalEditableShotCount: 4, projectedCanonicalEditableShotCountAfterReview: 13, items, contactSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${contactName}`, sha256: sha256(contactSheet)}, actualPixelReviewRequired: true, hiddenShadowOnly: true, canonicalMasterPixelsChanged: false, userVisualApproval: "NOT_APPROVED", generatedAt: now};
  const manifest = {...manifestBody, manifestSha256: sha256({...manifestBody, generatedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.postApprovalEditableTypographyShadows = manifest;
  const nextCandidateBody = {...candidate, typography: {...candidate.typography, editableShadowStatus: "9_SHOTS_BUILT_PENDING_ACTUAL_PIXEL_VISUAL_REVIEW", editableShadowManifestSha256: manifest.manifestSha256}, updatedAt: now};
  delete nextCandidateBody.candidateSha256;
  next.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate = {...nextCandidateBody, candidateSha256: sha256({...nextCandidateBody, adoptedAt: undefined, updatedAt: undefined})};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "build-post-approval-editable-typography-shadows", targetId: manifest.manifestSha256, payload: {status: manifest.status, rebuiltShotCount: 9, contactSheetSha256: manifest.contactSheet.sha256, canonicalMasterPixelsChanged: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `editable-typography-shadows-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"system-validation-candidate-v1/editable-typography-shadows/manifest.json": manifest}, binaryFiles});
  return {contract: manifest.contract, status: manifest.status, manifestSha256: manifest.manifestSha256, rebuiltShotCount: 9, contactSheet: manifest.contactSheet, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, transitionSha256: committed.transitionSha256};
});

console.log(JSON.stringify(build, null, 2));
