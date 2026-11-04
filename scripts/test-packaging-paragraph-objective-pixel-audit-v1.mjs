#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {assertPackagingParagraphObjectivePixelAudit, auditPackagingParagraphSequenceDifference, auditPackagingParagraphSourcePixels, auditPackagingParagraphTypographyPixels, buildPackagingParagraphObjectivePixelAudit} from "../apps/studio-next/src/lib/a1-packaging-paragraph-objective-pixel-audit-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const boundedTreeSnapshot = (treeRoot) => {
  if (!fs.existsSync(treeRoot)) return [];
  const walk = (dir) => fs.readdirSync(dir, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name)).flatMap((entry) => {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(treeRoot, absolutePath);
    return entry.isDirectory() ? [{relativePath, kind: "directory"}, ...walk(absolutePath)] : [{relativePath, kind: "file", bytes: fs.statSync(absolutePath).size}];
  });
  return walk(treeRoot);
};
const currentPackPath=path.join(projectRoot,".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-canary-request-pack.json");
if(!fs.existsSync(currentPackPath)){console.log(JSON.stringify({status:"SKIPPED_NOT_CURRENT",contract:"A1PackagingParagraphObjectivePixelAuditTest/v1"}));process.exit(0);}
const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(currentPackPath, "utf8")));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-objective-pixel-test-"));
const typographySvg = (request) => {
  const fonts = Object.fromEntries(request.typography.fonts.map((font) => [font.assetId, font.absolutePath]));
  const paths = request.typography.nodes.map((node) => {
    const run = buildFontGlyphOutlineRun({fontPath: fonts[node.fontAssetId], text: node.text});
    return glyphOutlineRunToSvgPaths(run, {x: node.x, baseline: node.baseline, fontSize: node.fontSize, fill: node.fillHex, anchor: node.anchor});
  }).join("");
  return Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`);
};
const structuralSvg = (request) => Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">${request.composition.structuralActors.map((actor) => `<rect x="${actor.x}" y="${actor.y}" width="${actor.width}" height="${actor.height}" fill="${actor.fillHex}" fill-opacity="${actor.opacity}"/>`).join("")}</svg>`);
const imagegenPath = path.join(root, "imagegen.png");
const mechanismSvg = Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><rect width="1920" height="1080" fill="#dce5e2"/><path d="M0 1000L750 200L1100 620L1920 100" fill="none" stroke="#3c5060" stroke-width="120"/><circle cx="1460" cy="400" r="230" fill="#f0b0b5"/><rect x="1240" y="180" width="100" height="620" fill="#007783"/></svg>`);
await sharp(mechanismSvg).png().toFile(imagegenPath);
const render = async (request, output) => {
  let layers = [];
  if (request.shotId === "ED-13") {
    const placement = request.composition.imagegenPlacement;
    layers = [{input: await sharp(imagegenPath).resize(placement.width, placement.height, {fit: placement.fit, position: placement.position}).png().toBuffer(), left: placement.left, top: placement.top}];
  } else {
    layers = await Promise.all(request.composition.sourcePlacements.map(async (placement) => {
      const binding = request.deterministicRecipe.exactSourceBindings[placement.sourceIndex];
      let pipeline = sharp(binding.absolutePath).resize(placement.width, placement.height, {fit: placement.fit, position: placement.position, background: placement.backgroundHex});
      if (Number.isFinite(placement.saturation)) pipeline = pipeline.modulate({saturation: placement.saturation});
      pipeline = pipeline.flatten({background: placement.backgroundHex});
      return {input: await pipeline.png().toBuffer(), left: placement.left, top: placement.top};
    }));
  }
  const buckets = {SOURCE_ACTORS: layers, STRUCTURAL_ACTORS: [{input: structuralSvg(request), left: 0, top: 0}], TYPOGRAPHY: [{input: typographySvg(request), left: 0, top: 0}]};
  const visual = request.composition.stackOrder.flatMap((layer) => buckets[layer] || []);
  await sharp({create: {width: 1920, height: 1080, channels: 4, background: request.canvasPolicy.backgroundHex}}).composite(visual).png().toFile(output);
};
try {
  const files = [];
  for (const request of pack.requests) {
    const file = path.join(root, `${request.shotId}.png`);
    await render(request, file);
    files.push(file);
  }
  const manifest = {workspaceSha256: "1".repeat(64), transitionSha256: "2".repeat(64), storyboardRevisionSha256: pack.source.storyboardRevisionSha256, planSha256: pack.source.canaryPlanSha256, requestPackSha256: pack.packSha256, implementationSha256: "3".repeat(64), manifestSha256: "4".repeat(64), outputs: pack.requests.map((request, index) => ({shotId: request.shotId, fileName: path.basename(files[index])}))};
  const humanBinary = path.join(root, "a1-local-vision-human-bounds");
  const compiledHumanProbe = spawnSync("swiftc", [path.join(projectRoot, "scripts/run-local-vision-human-bounds-v1.swift"), "-o", humanBinary], {encoding: "utf8"});
  assert.equal(compiledHumanProbe.status, 0, compiledHumanProbe.stderr);
  const humanProbe = spawnSync(humanBinary, [imagegenPath], {encoding: "utf8"});
  assert.equal(humanProbe.status, 0, humanProbe.stderr);
  const humanDetection = JSON.parse(humanProbe.stdout.trim());
  assert.equal(humanDetection.status, "PASS");
  assert.equal(humanDetection.faces.length, 0);
  assert.equal(humanDetection.humans.length, 0);
  const ocrAudit = {contract: "A1LocalVisionOCRAudit/v1", status: "PASS_NO_READABLE_TEXT_DETECTED", sourceSha256: (await import("node:crypto")).createHash("sha256").update(fs.readFileSync(imagegenPath)).digest("hex"), readableTextDetected: false, recognizedText: ""};
  const audit = assertPackagingParagraphObjectivePixelAudit(await buildPackagingParagraphObjectivePixelAudit({pack, manifest, reviewRoot: root, imagegenArtifactPath: imagegenPath, imagegenReceiptSha256: "5".repeat(64), humanDetection, ocrAudit}), {workspaceSha256: manifest.workspaceSha256, requestPackSha256: pack.packSha256});
  if (audit.status !== "READY_FOR_VISUAL_DIRECTOR_AGENT_ASSESSMENT") console.error(JSON.stringify({status: audit.status, failures: audit.failures, items: audit.items.map((item) => ({shotId: item.shotId, machineFailures: item.machineFailures, typography: item.typography, sourceFidelity: item.sourceFidelity})), sequenceDifference: audit.sequenceDifference}, null, 2));
  assert.equal(audit.status, "READY_FOR_VISUAL_DIRECTOR_AGENT_ASSESSMENT");
  assert.equal(audit.items.every((item) => item.status === "OBJECTIVE_PIXEL_PASS_REVIEW_ONLY" && item.typography.status === "PASS" && item.sourceFidelity.status === "PASS"), true);
  assert.equal(audit.items.every((item) => Object.values(item.tasteScorecard.coreCheckResults).every((value) => value === "UNREVIEWED_BY_VISUAL_DIRECTOR")), true);
  assert.equal(audit.machineScope.machinePassCannotApprove, true);
  assert.equal(audit.nextReview.reviewerMayClaimHumanStatus, false);
  assert.equal(audit.nextReview.subsequentHumanUserActualPixelReviewRequired, true);
  assert.equal(audit.boundary.workspaceMutationAllowed, false);
  assert.equal(audit.boundary.userVisualApproval, "NOT_APPROVED");
  const forgedApproval = structuredClone(audit);
  forgedApproval.boundary.userVisualApproval = "APPROVED";
  assert.throws(() => assertPackagingParagraphObjectivePixelAudit(forgedApproval, {workspaceSha256: manifest.workspaceSha256}), /sha|boundary/u);
  const realReviewRoot = pack.isolationPolicy.reviewPublicRoot;
  const realReviewBefore = boundedTreeSnapshot(realReviewRoot);
  const unauthorizedAudit = spawnSync(process.execPath, [path.join(projectRoot, "scripts/audit-packaging-paragraph-objective-pixels-v1.mjs")], {cwd: projectRoot, env: {...process.env, A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_RESULT_RECEIPT: ""}, encoding: "utf8"});
  assert.notEqual(unauthorizedAudit.status, 0);
  assert.match(`${unauthorizedAudit.stdout}\n${unauthorizedAudit.stderr}`, /imagegen-result-receipt-required/u);
  assert.deepEqual(boundedTreeSnapshot(realReviewRoot), realReviewBefore);
  const tamperedTypography = path.join(root, "tampered-typography.png");
  await sharp(files[1]).composite([{input: Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><rect x="760" y="730" width="1070" height="130" fill="#181b1c"/></svg>`), left: 0, top: 0}]).png().toFile(tamperedTypography);
  assert.equal((await auditPackagingParagraphTypographyPixels(tamperedTypography, pack.requests[1])).status, "FAIL");
  const tamperedSource = path.join(root, "tampered-source.png");
  await sharp(files[2]).composite([{input: Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><rect x="1210" y="130" width="600" height="820" fill="#000"/></svg>`), left: 0, top: 0}]).png().toFile(tamperedSource);
  assert.equal((await auditPackagingParagraphSourcePixels({file: tamperedSource, request: pack.requests[2], imagegenArtifactPath: imagegenPath})).status, "FAIL");
  const tamperedImagegen = path.join(root, "tampered-imagegen.png");
  const probe = pack.requests[1].composition.sourceFidelityProbeRegion;
  await sharp(files[1]).composite([{input: Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><rect x="${probe.x}" y="${probe.y}" width="${probe.width}" height="${probe.height}" fill="#00ff00"/></svg>`), left: 0, top: 0}]).png().toFile(tamperedImagegen);
  assert.equal((await auditPackagingParagraphSourcePixels({file: tamperedImagegen, request: pack.requests[1], imagegenArtifactPath: imagegenPath})).status, "FAIL");
  assert.equal((await auditPackagingParagraphSequenceDifference([files[0], files[0], files[2]])).status, "FAIL");
  const humanRejected = await buildPackagingParagraphObjectivePixelAudit({pack, manifest, reviewRoot: root, imagegenArtifactPath: imagegenPath, imagegenReceiptSha256: "5".repeat(64), humanDetection: {...humanDetection, faces: [{x: 0.1, y: 0.1, width: 0.2, height: 0.2}]}, ocrAudit});
  assert.equal(humanRejected.status, "OBJECTIVE_PIXEL_REPAIR_REQUIRED");
  assert.ok(humanRejected.items[1].machineFailures.includes("generated-human-face-or-body-detected"));
  console.log(JSON.stringify({status: "PASS", contract: audit.contract, auditSha256: audit.auditSha256, itemStatuses: audit.items.map((item) => item.status), typographyTamperRejected: true, sourceTamperRejected: true, nearDuplicateSequenceRejected: true, actualMacOSVisionHumanDetectionStatus: humanDetection.status, actualMacOSVisionFaceCount: humanDetection.faces.length, actualMacOSVisionHumanCount: humanDetection.humans.length, generatedHumanDetectionIsHardFailure: true, forgedApprovalRejected: true, unauthorizedAuditRejectedWithZeroWrites: true, machinePassCannotApprove: true, visualDirectorDecision: "PENDING", userVisualApproval: "NOT_APPROVED", workspaceMutationPerformed: false}, null, 2));
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
