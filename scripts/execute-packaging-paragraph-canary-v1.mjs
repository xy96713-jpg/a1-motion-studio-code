#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {readPackagingParagraphCanaryAuthorization} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-authorization-v1.mjs";
import {buildPackagingParagraphCanaryImplementationBinding} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-implementation-binding-v1.mjs";
import {assertPackagingParagraphCanaryLiveInputs, assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {readPackagingParagraphImagegenResultReceipt} from "../apps/studio-next/src/lib/a1-packaging-paragraph-imagegen-result-v1.mjs";
import {readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const requestPackPath = path.join(artifactRoot, "packaging-paragraph-canary-request-pack.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

if (process.env.A1_EXECUTE_PACKAGING_PARAGRAPH_CANARY !== "1") throw new Error("packaging-paragraph-canary-explicit-execution-intent-required");
const receiptPath = process.env.A1_PACKAGING_PARAGRAPH_CANARY_AUTH_RECEIPT;
const imagegenResultReceiptPath = process.env.A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_RESULT_RECEIPT;
const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(requestPackPath, "utf8")));
assertPackagingParagraphCanaryLiveInputs(pack, {projectRoot});
const current = readCurrentProductionAuthorizationBinding(appRoot);
const implementation = buildPackagingParagraphCanaryImplementationBinding(projectRoot);
const authorization = readPackagingParagraphCanaryAuthorization(receiptPath, {
  workspaceSha256: current.workspaceSha256,
  workspaceFileSha256: current.workspaceFileSha256,
  transitionSha256: current.transitionSha256,
  storyboardRevisionSha256: pack.source.storyboardRevisionSha256,
  canaryPlanSha256: pack.source.canaryPlanSha256,
  requestPackSha256: pack.packSha256,
  implementationSha256: implementation.implementationSha256,
});
const ed13Request = pack.requests.find((request) => request.shotId === "ED-13");
const imagegenResultRoot = path.join(artifactRoot, "packaging-paragraph-imagegen-results");
const imagegenResult = await readPackagingParagraphImagegenResultReceipt(imagegenResultReceiptPath, {requestPackSha256: pack.packSha256, requestSha256: ed13Request.requestSha256, requestId: ed13Request.requestId, promptSha256: ed13Request.toolCall.promptSha256, attachmentManifestSha256: ed13Request.attachmentManifest.manifestSha256, attachmentSourceSha256s: ed13Request.attachmentManifest.entries.map((entry) => entry.sha256), authorizationReceiptSha256: authorization.receiptSha256, artifactRoot: imagegenResultRoot, inspectArtifact: async ({artifactPath, bytes}) => { const metadata = await sharp(bytes).metadata(); return {contract: "A1DecodedImageInspection/v1", method: "SHARP_DECODED_ACTUAL_BYTES", artifactPath, sha256: sha256(bytes), bytes: bytes.length, width: metadata.width, height: metadata.height, format: metadata.format}; }});
const ed13ImagegenInput = imagegenResult.output.artifactPath;
if (pack.dispatchPolicy.currentlyAuthorized !== false || pack.isolationPolicy.productionAdmissionAllowedBeforeUserVisualApproval !== false) throw new Error("packaging-paragraph-canary-boundary-invalid");
const stagingRoot = pack.isolationPolicy.stagingRoot;
const reviewRoot = pack.isolationPolicy.reviewPublicRoot;
const expectedStagingRoot = path.join(appRoot, "public/generated/system-line/.staging/packaging-paragraph-canary-v1", pack.source.canaryPlanSha256);
const expectedReviewRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-review-v1", pack.source.canaryPlanSha256);
if (path.resolve(stagingRoot) !== path.resolve(expectedStagingRoot) || path.resolve(reviewRoot) !== path.resolve(expectedReviewRoot)) throw new Error("packaging-paragraph-canary-exact-isolation-root-invalid");
if (fs.existsSync(stagingRoot) || fs.existsSync(reviewRoot)) throw new Error("packaging-paragraph-canary-target-must-be-new");

const fontPaths = (request) => Object.fromEntries(request.typography.fonts.map((font) => [font.assetId, font.absolutePath]));
const typographySvg = (request) => {
  const fonts = fontPaths(request);
  const paths = request.typography.nodes.map((node) => {
    const run = buildFontGlyphOutlineRun({fontPath: fonts[node.fontAssetId], text: node.text});
    if (run.outlineSha256 !== node.glyphOutlineSha256) throw new Error(`packaging-paragraph-canary-glyph-binding-invalid:${request.shotId}:${node.nodeId}`);
    return glyphOutlineRunToSvgPaths(run, {x: node.x, baseline: node.baseline, fontSize: node.fontSize, fill: node.fillHex, anchor: node.anchor});
  }).join("");
  return Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`);
};
const structuralSvg = (request) => Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">${request.composition.structuralActors.map((actor) => {
  if (actor.primitive !== "rect") throw new Error(`packaging-paragraph-canary-unsupported-structural-primitive:${request.shotId}:${actor.id}`);
  return `<rect x="${actor.x}" y="${actor.y}" width="${actor.width}" height="${actor.height}" fill="${actor.fillHex}" fill-opacity="${actor.opacity}"/>`;
}).join("")}</svg>`);

async function sourceLayers(request) {
  if (request.shotId === "ED-13") {
    const placement = request.composition.imagegenPlacement;
    const input = await sharp(ed13ImagegenInput).resize(placement.width, placement.height, {fit: placement.fit, position: placement.position}).png().toBuffer();
    return [{input, left: placement.left, top: placement.top}];
  }
  return Promise.all(request.composition.sourcePlacements.map(async (placement) => {
    const binding = request.deterministicRecipe.exactSourceBindings[placement.sourceIndex];
    if (!binding || (placement.sourceId && binding.sourceId && placement.sourceId !== binding.sourceId)) throw new Error(`packaging-paragraph-canary-source-placement-binding-invalid:${request.shotId}:${placement.sourceIndex}`);
    let pipeline = sharp(binding.absolutePath).resize(placement.width, placement.height, {fit: placement.fit, position: placement.position, background: placement.backgroundHex});
    if (Number.isFinite(placement.saturation)) pipeline = pipeline.modulate({saturation: placement.saturation});
    pipeline = pipeline.flatten({background: placement.backgroundHex});
    const input = await pipeline.png().toBuffer();
    return {input, left: placement.left, top: placement.top};
  }));
}

async function renderRequest(request, outputPath) {
  const layers = await sourceLayers(request);
  const structuralLayer = {input: structuralSvg(request), left: 0, top: 0};
  const buckets = {SOURCE_ACTORS: layers, STRUCTURAL_ACTORS: [structuralLayer], TYPOGRAPHY: [{input: typographySvg(request), left: 0, top: 0}]};
  const visualLayers = request.composition.stackOrder.flatMap((layer) => buckets[layer] || []);
  const output = await sharp({create: {width: 1920, height: 1080, channels: 4, background: request.canvasPolicy.backgroundHex}})
    .composite(visualLayers)
    .png({compressionLevel: 9})
    .toBuffer();
  fs.writeFileSync(outputPath, output);
  const metadata = await sharp(output).metadata();
  if (metadata.width !== 1920 || metadata.height !== 1080 || metadata.format !== "png") throw new Error(`packaging-paragraph-canary-objective-pixel-check-failed:${request.shotId}`);
  return {shotId: request.shotId, fileName: `${request.shotId}.png`, sha256: sha256(output), bytes: output.length, width: metadata.width, height: metadata.height, format: metadata.format, styleBriefSha256: request.authority.styleBriefSha256, requestSha256: request.requestSha256, machineStatus: "READY_FOR_ACTUAL_PIXEL_REVIEW", productionAdmitted: false, userVisualApproval: "NOT_APPROVED"};
}

let published = false;
let executionSummary = null;
try {
  fs.mkdirSync(stagingRoot, {recursive: true});
  const outputs = [];
  for (const request of pack.requests) outputs.push(await renderRequest(request, path.join(stagingRoot, `${request.shotId}.png`)));
  const sourceInputBytes = fs.readFileSync(ed13ImagegenInput);
  const manifestBody = {contract: "A1PackagingParagraphCanaryReviewBatch/v1", status: "READY_FOR_ACTUAL_PIXEL_REVIEW", reviewOnly: true, productionAdmitted: false, userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false, workspaceSha256: current.workspaceSha256, workspaceFileSha256: current.workspaceFileSha256, transitionSha256: current.transitionSha256, storyboardRevisionSha256: pack.source.storyboardRevisionSha256, planSha256: pack.source.canaryPlanSha256, requestPackSha256: pack.packSha256, implementationSha256: implementation.implementationSha256, authorizationReceiptSha256: authorization.receiptSha256, imagegenInput: {resultReceiptSha256: imagegenResult.receiptSha256, requestSha256: imagegenResult.requestSha256, promptSha256: imagegenResult.promptSha256, attachmentManifestSha256: imagegenResult.attachmentManifestSha256, executionId: imagegenResult.generation.executionId, operatorAttested: true, cryptographicProviderAttestationAvailable: false, sha256: sha256(sourceInputBytes), bytes: sourceInputBytes.length, ocrStatus: imagegenResult.ocrAudit.status, productionEvidenceAllowed: false}, outputs, paragraphReview: {roleSequence: ["EVIDENCE", "MECHANISM", "VERDICT"], allThreeActualPixelPassRequired: true, objectivePixelAuditRequired: true, objectivePixelAuditContract: "A1PackagingParagraphObjectivePixelAudit/v1", objectivePixelAuditEntrypoint: "scripts/audit-packaging-paragraph-objective-pixels-v1.mjs", visualDirectorReviewRequired: true, allThreeFramesTogetherRequired: true, machinePassCannotApprove: true, targetPlaybackDurationMs: pack.playbackReview.targetDurationMs}, publishedAt: new Date().toISOString()};
  const manifest = {...manifestBody, manifestSha256: sha256(JSON.stringify(manifestBody))};
  fs.writeFileSync(path.join(stagingRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.mkdirSync(path.dirname(reviewRoot), {recursive: true});
  fs.renameSync(stagingRoot, reviewRoot);
  published = true;
  executionSummary = {status: manifest.status, reviewRoot, manifestSha256: manifest.manifestSha256, outputs};
} finally {
  if (!published && fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, {recursive: true, force: true});
}

const autoReview = spawnSync(process.execPath, [path.join(projectRoot, "scripts/run-packaging-paragraph-auto-review-v1.mjs")], {
  cwd: projectRoot,
  env: process.env,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
if (autoReview.status !== 0) throw new Error(`packaging-paragraph-canary-auto-review-failed:${String(autoReview.stderr || autoReview.stdout).trim()}`);
console.log(JSON.stringify({...executionSummary, autoReview: JSON.parse(autoReview.stdout.trim()), productionAdmitted: false, workspaceMutationPerformed: false, userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}, null, 2));
