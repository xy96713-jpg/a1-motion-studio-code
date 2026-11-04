#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {commitContentAddressedMedia} from "../apps/studio-next/src/lib/a1-content-addressed-media-v1.mjs";
import {assertDirectionBoundImagegenRequest} from "../apps/studio-next/src/lib/a1-direction-bound-imagegen-request-v1.mjs";
import {buildStoryboardActualPixelTasteReviewInput} from "../apps/studio-next/src/lib/a1-storyboard-candidate-lineage-v1.mjs";

const [sourceA, sourceB] = process.argv.slice(2);
if (!sourceA || !sourceB) throw new Error("ed13-candidate-admission-invalid:two-source-files-required");
const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/ed13-direction-bound-canary-v1");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const workspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const hashBytes = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const hashJson = (value) => hashBytes(JSON.stringify(value));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const phaseBefore = fs.readFileSync(phasePath);
const workspaceBefore = fs.readFileSync(workspacePath);
const phase = JSON.parse(phaseBefore);
if (phase?.reviewDecision?.userVisualApproval !== "NOT_APPROVED" || phase?.reviewDecision?.motionPrototypeAllowed !== false || phase?.reviewDecision?.resolveExportAllowed !== false || phase?.reviewDecision?.finalRenderAllowed !== false) throw new Error("ed13-candidate-admission-invalid:approval-boundary");
const queue = phase?.authority?.generationQueueProjection;
if (Number(queue?.queued || 0) !== 0 || Number(queue?.running || 0) !== 0 || queue?.workerStatus !== "frozen") throw new Error("ed13-candidate-admission-invalid:queue-boundary");
const workspace = readProjectWorkspace(appRoot);
const sources = {"ED-13-A": path.resolve(sourceA), "ED-13-B": path.resolve(sourceB)};
const requests = Object.fromEntries(Object.keys(sources).map((variant) => [variant, assertDirectionBoundImagegenRequest(readJson(path.join(artifactRoot, "requests", `${variant.toLowerCase()}.json`)))]));
const authoritySha = requests["ED-13-A"].source.directionAuthoritySha256;
if (requests["ED-13-B"].source.directionAuthoritySha256 !== authoritySha) throw new Error("ed13-candidate-admission-invalid:authority-split");
const stableRelativeRoot = `editorial-asset-workbench-v1/ed13-direction-bound-canary-v1/${authoritySha}`;
const stableRoot = path.join(publicRoot, stableRelativeRoot);
const blobRoot = path.join(publicRoot, "immutable-media-blobs-v1");
const stagingRoot = path.join(publicRoot, ".staging/ed13-direction-bound-canary-v1", authoritySha);
fs.mkdirSync(stagingRoot, {recursive: true});

function paletteCoverage(data, channels) {
  const counts = {dark: 0, warmPaper: 0, cyan: 0, proofRed: 0, other: 0};
  const pixels = data.length / channels;
  for (let index = 0; index < data.length; index += channels) {
    const red = data[index]; const green = data[index + 1]; const blue = data[index + 2];
    if (red < 55 && green < 65 && blue < 65) counts.dark += 1;
    else if (red > 205 && green > 190 && blue > 155) counts.warmPaper += 1;
    else if (blue > red * 1.08 && green > red * 1.05 && blue > 90) counts.cyan += 1;
    else if (red > 145 && red > green * 1.35 && red > blue * 1.35) counts.proofRed += 1;
    else counts.other += 1;
  }
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number((value / pixels).toFixed(4))]));
}

async function exactEightPixelGrid(file) {
  const {data, info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let matchingBlocks = 0;
  let blockCount = 0;
  for (let y = 0; y < info.height; y += 8) for (let x = 0; x < info.width; x += 8) {
    blockCount += 1;
    const offset = (y * info.width + x) * info.channels;
    let match = true;
    for (let by = 0; by < 8 && match; by += 1) for (let bx = 0; bx < 8 && match; bx += 1) {
      const sample = ((y + by) * info.width + x + bx) * info.channels;
      for (let channel = 0; channel < info.channels; channel += 1) if (data[sample + channel] !== data[offset + channel]) { match = false; break; }
    }
    if (match) matchingBlocks += 1;
  }
  return {logicalGrid: {width: 240, height: 135}, outputGrid: {width: info.width, height: info.height}, nearestNeighborScale: 8, exactUniformEightByEightBlockRatio: Number((matchingBlocks / blockCount).toFixed(6)), exactUniformBlockCount: matchingBlocks, blockCount, paletteCoverage: paletteCoverage(data, info.channels)};
}

const candidates = [];
for (const variant of Object.keys(sources)) {
  const source = sources[variant];
  if (!fs.existsSync(source)) throw new Error(`ed13-candidate-admission-invalid:source:${variant}`);
  const request = requests[variant];
  const staging = path.join(stagingRoot, `${variant.toLowerCase()}.png`);
  const logicalPixelMaster = await sharp(source).resize(240, 135, {fit: "cover", position: "centre", kernel: sharp.kernel.lanczos3}).png().toBuffer();
  await sharp(logicalPixelMaster).resize(1920, 1080, {kernel: sharp.kernel.nearest}).png({compressionLevel: 9}).toFile(staging);
  const output = path.join(stableRoot, "candidates", `${variant.toLowerCase()}.png`);
  const mediaCommit = commitContentAddressedMedia({stagingPath: staging, outputPath: output, blobRoot, publicRoot, extension: ".png"});
  const metadata = await sharp(output).metadata();
  const grid = await exactEightPixelGrid(output);
  const ocr = JSON.parse(execFileSync("swift", [path.join(root, "scripts/run-local-vision-ocr-v1.swift"), output], {encoding: "utf8"}).trim());
  const publicUrl = `/generated/system-line/${mediaCommit.outputRelativePath}`;
  const candidateId = `ed13-direction-bound-${variant.toLowerCase()}-${mediaCommit.contentSha256.slice(0, 12)}`;
  const visibleMechanisms = variant === "ED-13-A" ? ["one-decisive-chibi-proofreader", "smooth-upper-proof-tape", "unresolved-lower-red-knot", "local-one-bit-dither-field", "shared-240x135-pixel-grid"] : ["one-decisive-chibi-proofreader", "supporting-crt-character-machine", "smooth-output-versus-lower-knot", "local-scanline-field", "shared-240x135-pixel-grid"];
  const {lineage, review} = buildStoryboardActualPixelTasteReviewInput(workspace, {shotId: "ED-13", artifactSha256: mediaCommit.contentSha256, artifactPublicUrl: publicUrl, candidateId, directionAuthoritySha256: request.source.directionAuthoritySha256, shotDirectionSha256: request.source.shotDirectionSha256, selectedDirectionSha256: request.source.selectedDirectionSha256, selectedVariantId: variant, candidateRequestSha256: request.requestSha256, visibleMechanisms, createdAt: request.requestedAt});
  const hardFailures = [];
  if (metadata.width !== 1920 || metadata.height !== 1080 || metadata.format !== "png") hardFailures.push("MEDIA_FORMAT_OR_DIMENSION_MISMATCH");
  if (grid.exactUniformEightByEightBlockRatio !== 1) hardFailures.push("NEAREST_NEIGHBOR_GRID_NOT_EXACT");
  if (Number(ocr.observationCount || 0) > 0) hardFailures.push("OCR_DETECTED_POSSIBLE_TEXT");
  const objective = {contract: "A1Ed13DirectionBoundObjectivePixelAudit/v1", candidateId, selectedVariantId: variant, directionAuthoritySha256: authoritySha, requestSha256: request.requestSha256, media: {publicUrl, sha256: mediaCommit.contentSha256, bytes: mediaCommit.bytes, width: metadata.width, height: metadata.height, format: metadata.format, space: metadata.space, channels: metadata.channels}, grid, ocr, hardFailures, eligibility: hardFailures.length ? "OBJECTIVE_REPAIR_REQUIRED" : "READY_FOR_ACTUAL_PIXEL_REVIEW", machineApproval: false};
  objective.objectiveAuditSha256 = hashJson(objective);
  const receipt = {contract: "A1Ed13DirectionBoundCandidateReceipt/v1", status: objective.eligibility, candidateId, shotId: "ED-13", selectedVariantId: variant, directionAuthoritySha256: authoritySha, requestSha256: request.requestSha256, originalImagegenSource: {path: source, sha256: hashBytes(fs.readFileSync(source))}, mediaCommit, lineage, actualPixelTasteReviewInput: review, objectivePixelAudit: objective, boundary: {candidateOnly: true, productionAdmitted: false, userVisualApproval: "NOT_APPROVED", independentVisualDirectorReviewRequired: true, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}};
  receipt.receiptSha256 = hashJson(receipt);
  fs.mkdirSync(path.join(artifactRoot, "receipts"), {recursive: true});
  fs.writeFileSync(path.join(artifactRoot, "receipts", `${variant.toLowerCase()}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  candidates.push(receipt);
}

const tileWidth = 920; const tileHeight = 518; const padding = 24; const headerHeight = 88;
const tiles = await Promise.all(candidates.map((candidate) => sharp(path.join(publicRoot, candidate.mediaCommit.outputRelativePath)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer()));
const titleSvg = Buffer.from(`<svg width="1920" height="88" xmlns="http://www.w3.org/2000/svg"><rect width="1920" height="88" fill="#111516"/><text x="24" y="34" fill="#dfff68" font-size="22" font-family="sans-serif" font-weight="700">ED-13 STATIC CANDIDATES · ACTUAL PIXELS</text><text x="24" y="64" fill="#9ca49f" font-size="14" font-family="sans-serif">A NO_FUSION        B CRT_CHARACTER_MACHINE        REVIEW ONLY · NOT APPROVED</text></svg>`);
const sheetPath = path.join(stableRoot, "proof", "ed-13-a-b-proof-sheet.png");
fs.mkdirSync(path.dirname(sheetPath), {recursive: true});
await sharp({create: {width: 1920, height: headerHeight + tileHeight + padding * 2, channels: 4, background: "#111516"}}).composite([{input: titleSvg, left: 0, top: 0}, {input: tiles[0], left: padding, top: headerHeight + padding}, {input: tiles[1], left: padding * 2 + tileWidth, top: headerHeight + padding}]).png({compressionLevel: 9}).toFile(sheetPath);
const proof = {publicUrl: `/generated/system-line/${path.relative(publicRoot, sheetPath).split(path.sep).join("/")}`, sha256: hashBytes(fs.readFileSync(sheetPath)), width: 1920, height: headerHeight + tileHeight + padding * 2};
const report = {contract: "A1Ed13DirectionBoundCandidateReviewPack/v1", status: candidates.every((candidate) => candidate.status === "READY_FOR_ACTUAL_PIXEL_REVIEW") ? "READY_FOR_ACTUAL_PIXEL_REVIEW" : "OBJECTIVE_REPAIR_REQUIRED", directionAuthoritySha256: authoritySha, candidates: candidates.map((candidate) => ({candidateId: candidate.candidateId, selectedVariantId: candidate.selectedVariantId, publicUrl: candidate.objectivePixelAudit.media.publicUrl, artifactSha256: candidate.mediaCommit.contentSha256, requestSha256: candidate.requestSha256, receiptSha256: candidate.receiptSha256, lineageSha256: candidate.lineage.lineageSha256, reviewInputSha256: candidate.actualPixelTasteReviewInput.reviewInputSha256, objectiveAuditSha256: candidate.objectivePixelAudit.objectiveAuditSha256, objectiveEligibility: candidate.objectivePixelAudit.eligibility, hardFailures: candidate.objectivePixelAudit.hardFailures, optionalFusionMode: requests[candidate.selectedVariantId].optionalFusion.mode})), proof, comparison: {A: "one-bit chibi proofreader and paper rail; no CRT", B: "chibi proofreader with one semantic CRT machine", invariant: "surface smoother above; root knot unresolved below"}, boundary: {machinePassCannotApprove: true, independentVisualDirectorReviewRequired: true, userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}, generatedAt: new Date().toISOString()};
report.reportSha256 = hashJson(report);
fs.writeFileSync(path.join(artifactRoot, "candidate-review-pack.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!fs.readFileSync(phasePath).equals(phaseBefore) || !fs.readFileSync(workspacePath).equals(workspaceBefore)) throw new Error("ed13-candidate-admission-invalid:authority-mutated");
console.log(JSON.stringify(report, null, 2));
