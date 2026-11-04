#!/usr/bin/env node
// This review-only writer cannot load Sharp, create an output directory, or write
// a byte until both the hash-bound authorization receipt and execution intent pass.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {enforceMediaEntrypointAuthorization} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";
import {preflightCanonicalPackageWriter} from "../apps/studio-next/src/lib/a1-canonical-package-writer-preflight-v1.mjs";
import {compileStaticReviewPackageComposition} from "../apps/studio-next/src/lib/a1-static-review-package-composition-v1.mjs";
import {buildStaticReviewImplementationBinding} from "../apps/studio-next/src/lib/a1-static-review-implementation-binding-v2.mjs";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {assertNodePixelProofBounds, canvasBoundsFromExpanded, summarizeAlphaComponents} from "../apps/studio-next/src/lib/a1-static-review-pixel-proof-v1.mjs";

const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const implementation = buildStaticReviewImplementationBinding(root);
const binding = enforceMediaEntrypointAuthorization({appRoot, stage: "STATIC_REVIEW", entrypointId: "system-line-package-static-review-v1", targetId: "CURRENT_SYSTEM_LINE_STATIC_PACKAGE_REVIEW", outputRoute: "ROUTE_DECISION_REQUIRED", implementationSha256: implementation.implementationSha256});
if (process.env.A1_EXECUTE_MEDIA_WRITER !== "1") throw new Error("static-review-writer-execution-intent-required");
const preflight = preflightCanonicalPackageWriter({workspace: binding.workspace, stage: "STATIC_REVIEW", registry: binding.workspace.production.mediaEntrypointRegistry, projectRoot: root});
if (preflight.status !== "READY_WHEN_STATIC_REVIEW_AUTHORIZED") throw new Error(`static-review-preflight-blocked:${preflight.blockers.join("|")}`);
const composition = compileStaticReviewPackageComposition({workspace: binding.workspace, projectRoot: root});
const {default: sharp} = await import("sharp");

const outputVersion = "static-package-review-v7";
const outputRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1", outputVersion);
const outputWidth = 1920;
const outputHeight = 1080;
const maskPadding = 128;
fs.mkdirSync(outputRoot, {recursive: true});
fs.mkdirSync(path.join(outputRoot, "node-masks"), {recursive: true});

const bounds = (raw, width, height) => {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1; let count = 0; let minAlpha = 255; let maxAlpha = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const alpha = raw[(y * width + x) * 4 + 3];
    minAlpha = Math.min(minAlpha, alpha); maxAlpha = Math.max(maxAlpha, alpha);
    if (alpha > 0) { count += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  return {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, nonzeroPixelCount: count, alphaMin: minAlpha, alphaMax: maxAlpha};
};
const contains = (outer, inner, padding = 0) => inner.x >= outer.x + padding && inner.y >= outer.y + padding && inner.x + inner.width <= outer.x + outer.width - padding && inner.y + inner.height <= outer.y + outer.height - padding;
const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const overlayPixelGeometry = (raw, width, height, destination) => { let nonzeroPixelCount = 0; let outsideDestinationPixelCount = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1; for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { if (raw[(y * width + x) * 4 + 3] <= 0) continue; nonzeroPixelCount += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); if (x < destination.x || y < destination.y || x >= destination.x + destination.width || y >= destination.y + destination.height) outsideDestinationPixelCount += 1; } return {nonzeroPixelCount, outsideDestinationPixelCount, destinationContainsAllNonzeroPixels: nonzeroPixelCount > 0 && outsideDestinationPixelCount === 0, componentEnvelope: {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1}, internalDisconnectedTextureAllowed: true}; };

function assertEvidenceGeometry(item) {
  if (item.shotId !== "ED-14") return;
  if (item.evidencePlacements.length !== 3 || item.evidencePlacements.some((placement) => placement.aperture.width <= 0 || placement.aperture.height <= 0 || placement.aperture.x < 0 || placement.aperture.y < 0 || placement.aperture.x + placement.aperture.width > outputWidth || placement.aperture.y + placement.aperture.height > outputHeight)) throw new Error("static-review-ed14-evidence-placement-invalid");
}
function assertNodeLayout(item, node, nodeIndex, canvasBounds) {
  assertNodePixelProofBounds({nodeId: node.nodeId, bounds: canvasBounds, outputWidth, outputHeight});
  const component = item.layoutQa?.overlayComponent;
  if (component && !contains(component.destination, canvasBounds, 36)) throw new Error(`static-review-overlay-component-disconnected:${node.nodeId}`);
  const slots = item.layoutQa?.slotBounds || [];
  if (slots.length && !contains(slots[nodeIndex] || {}, canvasBounds, 0)) throw new Error(`static-review-node-slot-misaligned:${node.nodeId}`);
  if ((item.layoutQa?.actorExclusionZones || []).some((zone) => intersects(zone, canvasBounds))) throw new Error(`static-review-workflow-text-actor-overlap:${node.nodeId}`);
}

const outputs = [];
for (const item of composition.compositions) {
  assertEvidenceGeometry(item);
  const output = path.join(outputRoot, `${item.shotId}.png`);
  await sharp(Buffer.from(item.svg)).png().toFile(output);
  const bytes = fs.readFileSync(output);
  const outputPixels = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const outputAlpha = bounds(outputPixels.data, outputPixels.info.width, outputPixels.info.height);
  const alphaComponents = summarizeAlphaComponents(outputPixels.data, outputPixels.info.width, outputPixels.info.height);
  if (item.route === "OVERLAY_ALPHA" && (alphaComponents.secondLargestComponentRatio >= 0.005 || alphaComponents.significantComponentCount > 1)) throw new Error(`static-review-overlay-alpha-components-invalid:${item.shotId}`);
  const overlayComponentPixelQa = item.route === "OVERLAY_ALPHA" ? overlayPixelGeometry(outputPixels.data, outputPixels.info.width, outputPixels.info.height, item.layoutQa.overlayComponent.destination) : null;
  if (overlayComponentPixelQa && !overlayComponentPixelQa.destinationContainsAllNonzeroPixels) throw new Error(`static-review-overlay-component-external-pixels:${item.shotId}`);
  const nodePixelProofs = [];
  for (const [nodeIndex, node] of item.visibleTextNodes.entries()) {
    const run = buildFontGlyphOutlineRun({fontPath: composition.font.path, text: node.text});
    const spec = node.maskSpec;
    const glyph = glyphOutlineRunToSvgPaths(run, {x: spec.x + maskPadding, baseline: spec.y + maskPadding, fontSize: spec.size, fill: "#fff", anchor: spec.anchor});
    const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth + maskPadding * 2}" height="${outputHeight + maskPadding * 2}">${glyph}</svg>`;
    const maskPath = path.join(outputRoot, "node-masks", `${node.nodeId}.png`);
    await sharp(Buffer.from(maskSvg)).png().toFile(maskPath);
    const mask = fs.readFileSync(maskPath);
    const pixels = await sharp(mask).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const expandedCanvasBounds = bounds(pixels.data, pixels.info.width, pixels.info.height);
    const canvasBounds = canvasBoundsFromExpanded(expandedCanvasBounds, maskPadding);
    assertNodeLayout(item, node, nodeIndex, canvasBounds);
    nodePixelProofs.push({nodeId: node.nodeId, maskPath: `/generated/system-line/editorial-asset-workbench-v1/${outputVersion}/node-masks/${node.nodeId}.png`, sha256: sha(mask), bytes: mask.length, maskPadding, expandedCanvasBounds, canvasBounds, nonzeroPixelCount: canvasBounds.nonzeroPixelCount, alphaMin: canvasBounds.alphaMin, alphaMax: canvasBounds.alphaMax, insideCanvas: true});
  }
  outputs.push({...item, svg: undefined, outputPath: `/generated/system-line/editorial-asset-workbench-v1/${outputVersion}/${item.shotId}.png`, sha256: sha(bytes), bytes: bytes.length, actualOutputAlphaRange: {min: outputAlpha.alphaMin, max: outputAlpha.alphaMax}, alphaComponents, largestComponentRatio: alphaComponents.largestComponentRatio, secondLargestComponentPixelCount: alphaComponents.secondLargestPixelCount, secondLargestComponentRatio: alphaComponents.secondLargestComponentRatio, significantComponentCount: alphaComponents.significantComponentCount, overlayComponentPixelQa, nodePixelProofs});
}

const overlayRanges = outputs.filter((item) => item.route === "OVERLAY_ALPHA").map((item) => item.actualOutputAlphaRange);
const fullscreenRanges = outputs.filter((item) => item.route === "FULLSCREEN_PACKAGE").map((item) => item.actualOutputAlphaRange);
if (overlayRanges.some((range) => range.min !== 0 || range.max !== 255)) throw new Error("static-review-overlay-alpha-contract-invalid");
if (fullscreenRanges.some((range) => range.min !== 255 || range.max !== 255)) throw new Error("static-review-fullscreen-alpha-contract-invalid");
const textNodeCount = outputs.reduce((sum, item) => sum + item.nodePixelProofs.length, 0);
if (textNodeCount !== 28) throw new Error(`static-review-visible-node-count-invalid:${textNodeCount}`);

const tileW = 480; const tileH = 270;
const checker = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}"><defs><pattern id="c" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#d9dde0"/><rect width="10" height="10" fill="#b8bec4"/><rect x="10" y="10" width="10" height="10" fill="#b8bec4"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
const tiles = await Promise.all(outputs.map(async (item, index) => ({input: await sharp(Buffer.from(checker)).composite([{input: await sharp(path.join(outputRoot, `${item.shotId}.png`)).resize(tileW, tileH - 30, {fit: "contain"}).png().toBuffer(), left: 0, top: 30}, {input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="30"><rect width="100%" height="100%" fill="#111315"/><text x="12" y="20" fill="#ffffff" font-size="15">${item.shotId} · ${item.route}</text></svg>`), left: 0, top: 0}]).png().toBuffer(), left: (index % 4) * tileW, top: Math.floor(index / 4) * tileH})));
const contactSheet = path.join(outputRoot, "contact-sheet.png");
await sharp({create: {width: tileW * 4, height: tileH * 4, channels: 4, background: {r: 238, g: 240, b: 242, alpha: 1}}}).composite(tiles).png().toFile(contactSheet);
const contactBytes = fs.readFileSync(contactSheet);
const allNodeMasksNonzero = outputs.every((item) => item.nodePixelProofs.every((proof) => Number.isInteger(proof.nonzeroPixelCount) && proof.nonzeroPixelCount > 0 && proof.insideCanvas));
if (!allNodeMasksNonzero) throw new Error("static-review-node-masks-nonzero-required");
const report = {contract: "A1StaticReviewPackageRender/v7", status: "READY_FOR_STATIC_REVIEW", workspaceSha256: binding.workspaceSha256, workspaceFileSha256: binding.workspaceFileSha256, transitionSha256: binding.transitionSha256, implementation, preflight, outputs, actualPixelQa: {visibleTextNodeCount: textNodeCount, requiredVisibleTextNodeCount: 28, allNodeMasksNonzero, overlayAlphaRanges: overlayRanges, fullscreenAlphaRanges: fullscreenRanges, overlayComponentPixelQa: outputs.filter((item) => item.route === "OVERLAY_ALPHA").map((item) => ({shotId: item.shotId, ...item.overlayComponentPixelQa})), overlayComponentAlphaStats: outputs.filter((item) => item.route === "OVERLAY_ALPHA").map((item) => ({shotId: item.shotId, largestComponentRatio: item.largestComponentRatio, secondLargestComponentPixelCount: item.secondLargestComponentPixelCount, secondLargestComponentRatio: item.secondLargestComponentRatio, significantComponentCount: item.significantComponentCount})), alphaStatsSource: "ACTUAL_OUTPUT_RGBA_PIXELS", textBoundsProof: "EXPANDED_CANVAS_UNCLIPPED_GLYPH_MASK", overlayTextBoundsProof: "ACTUAL_GLYPH_MASK_BOUNDS_MINUS_PADDING_INSIDE_PAPER_DESTINATION", overlayComponentProof: "ACTUAL_OUTPUT_NONZERO_PIXELS_INSIDE_SINGLE_DESTINATION_COMPONENT", layoutProof: "ACTUAL_GLYPH_MASK_TO_COMPONENT_SLOT_AND_EXCLUSION_GEOMETRY"}, contactSheet: {outputPath: `/generated/system-line/editorial-asset-workbench-v1/${outputVersion}/contact-sheet.png`, sha256: sha(contactBytes), bytes: contactBytes.length, labelsReviewOnly: true, checkerBacking: true}, productionArtifact: false, resolveInsertEligible: false, packageExportAuthorized: false, containsBaseFootage: false, containsPresenterPixels: false, containsMicrophonePixels: false, containsBoomPixels: false, containsAudio: false, containsCaptions: false};
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, shotCount: outputs.length, contactSheet: report.contactSheet, mediaGenerationPerformed: true}, null, 2));
