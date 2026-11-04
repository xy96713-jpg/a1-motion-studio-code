#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {assertPackagingParagraphAttachmentManifest, assertPackagingParagraphImagegenResultReceipt, buildPackagingParagraphAttachmentManifest, createPackagingParagraphImagegenResultReceipt} from "../apps/studio-next/src/lib/a1-packaging-paragraph-imagegen-result-v1.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-result-test-"));
try {
  const attachmentPath = path.join(root, "reference.png");
  const outputPath = path.join(root, "output.png");
  const attachmentBytes = await sharp({create: {width: 1200, height: 700, channels: 4, background: "#eef1ef"}}).png().toBuffer();
  const outputBytes = await sharp({create: {width: 1536, height: 864, channels: 4, background: "#181b1c"}}).png().toBuffer();
  fs.writeFileSync(attachmentPath, attachmentBytes);
  fs.writeFileSync(outputPath, outputBytes);
  const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
  const attachmentSha = sha(attachmentBytes);
  const outputSha = sha(outputBytes);
  const ocrBinary = path.join(root, "a1-local-vision-ocr");
  const ocrSource = path.resolve(import.meta.dirname, "run-local-vision-ocr-v1.swift");
  const compiled = spawnSync("swiftc", [ocrSource, "-o", ocrBinary], {encoding: "utf8"});
  assert.equal(compiled.status, 0, compiled.stderr);
  const ocrProbe = spawnSync(ocrBinary, [outputPath], {encoding: "utf8"});
  assert.equal(ocrProbe.status, 0, ocrProbe.stderr);
  const actualOcr = JSON.parse(ocrProbe.stdout.trim());
  assert.equal(actualOcr.status, "PASS");
  assert.equal(actualOcr.text, "");
  const manifest = buildPackagingParagraphAttachmentManifest([{attachmentIndex: 0, id: "reference-1", publicUrl: "/reference.png", absolutePath: attachmentPath, sha256: attachmentSha, role: "STYLE_GRAMMAR_REFERENCE_ONLY", transformPolicy: "ABSTRACT_TRAITS_ONLY_NO_IDENTITY_BRAND_OR_COMPOSITION_COPY", adoptedTraits: ["asymmetric hierarchy"], referenceOnly: true, productionAssetAllowed: false, copiedIdentityOrCompositionAllowed: false}]);
  assertPackagingParagraphAttachmentManifest(manifest, [{attachmentIndex: 0, id: "reference-1", publicUrl: "/reference.png", absolutePath: attachmentPath, sha256: attachmentSha, role: "STYLE_GRAMMAR_REFERENCE_ONLY", transformPolicy: "ABSTRACT_TRAITS_ONLY_NO_IDENTITY_BRAND_OR_COMPOSITION_COPY", adoptedTraits: ["asymmetric hierarchy"], referenceOnly: true, productionAssetAllowed: false, copiedIdentityOrCompositionAllowed: false}]);
  const expected = {requestPackSha256: "1".repeat(64), requestSha256: "2".repeat(64), requestId: "paragraph-canary-ed-13", promptSha256: "3".repeat(64), attachmentManifestSha256: manifest.manifestSha256, attachmentSourceSha256s: [attachmentSha], authorizationReceiptSha256: "4".repeat(64), artifactRoot: root, inspectArtifact: async ({artifactPath, bytes}) => { const metadata = await sharp(bytes).metadata(); return {contract: "A1DecodedImageInspection/v1", method: "SHARP_DECODED_ACTUAL_BYTES", artifactPath, sha256: sha(bytes), bytes: bytes.length, width: metadata.width, height: metadata.height, format: metadata.format}; }};
  const receipt = createPackagingParagraphImagegenResultReceipt({shotId: "ED-13", tool: "image_gen.imagegen", operatorAttested: true, ...expected, model: "gpt-image", executionId: "exec-test-only", startedAt: "2026-08-12T20:00:00.000Z", completedAt: "2026-08-12T20:00:02.500Z", durationMs: 2500, artifactPath: outputPath, outputSha256: outputSha, outputBytes: outputBytes.length, width: 1536, height: 864, format: "png", ocrAudit: {contract: "A1LocalVisionOCRAudit/v1", status: "PASS_NO_READABLE_TEXT_DETECTED", method: "MACOS_VISION_ACCURATE_ZH_EN", sourceSha256: outputSha, readableTextDetected: false, recognizedText: "", acceptedSegments: [], rawObservationCount: 0, confidenceThreshold: 0.5, languages: ["zh-Hans", "en-US"]}, recordedAt: "2026-08-12T20:00:03.000Z"});
  await assertPackagingParagraphImagegenResultReceipt(receipt, expected);
  assert.equal(receipt.boundary.productionEvidenceAllowed, false);
  assert.equal(receipt.generation.cryptographicProviderAttestationAvailable, false);
  const forgedOutput = structuredClone(receipt); forgedOutput.output.sha256 = "f".repeat(64);
  await assert.rejects(() => assertPackagingParagraphImagegenResultReceipt(forgedOutput, expected), /hash|artifact/u);
  const forgedOcr = structuredClone(receipt); forgedOcr.ocrAudit.readableTextDetected = true;
  await assert.rejects(() => assertPackagingParagraphImagegenResultReceipt(forgedOcr, expected), /hash|ocr/u);
  assert.throws(() => buildPackagingParagraphAttachmentManifest([{...manifest.entries[0], absolutePath: attachmentPath, attachmentIndex: 0, sha256: "0".repeat(64)}]), /attachment-invalid/u);
  const forgedManifest = structuredClone(manifest); forgedManifest.entries[0].id = "forged";
  assert.throws(() => assertPackagingParagraphAttachmentManifest(forgedManifest, [{attachmentIndex: 0, id: "reference-1", publicUrl: "/reference.png", absolutePath: attachmentPath, sha256: attachmentSha, role: "STYLE_GRAMMAR_REFERENCE_ONLY", transformPolicy: "ABSTRACT_TRAITS_ONLY_NO_IDENTITY_BRAND_OR_COMPOSITION_COPY", adoptedTraits: ["asymmetric hierarchy"], referenceOnly: true, productionAssetAllowed: false, copiedIdentityOrCompositionAllowed: false}]), /hash|binding/u);
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const realPack = JSON.parse(fs.readFileSync(path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-canary-request-pack.json"), "utf8"));
  const resultRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-imagegen-results", realPack.source.canaryPlanSha256);
  assert.equal(fs.existsSync(resultRoot), false);
  const unauthorizedRecord = spawnSync(process.execPath, [path.join(projectRoot, "scripts/record-packaging-paragraph-imagegen-result-v1.mjs")], {cwd: projectRoot, env: {...process.env, A1_PACKAGING_PARAGRAPH_CANARY_AUTH_RECEIPT: "", A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_OUTPUT: outputPath, A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_EXECUTION_ID: "exec-test", A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_MODEL: "gpt-image", A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_STARTED_AT: "2026-08-12T20:00:00.000Z", A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_COMPLETED_AT: "2026-08-12T20:00:02.500Z"}, encoding: "utf8"});
  assert.notEqual(unauthorizedRecord.status, 0);
  assert.match(`${unauthorizedRecord.stdout}\n${unauthorizedRecord.stderr}`, /explicit-packaging-paragraph-canary-authorization-receipt-required|paragraph-imagegen-result-env-required/u);
  assert.equal(fs.existsSync(resultRoot), false);
  console.log(JSON.stringify({status: "PASS", contract: receipt.contract, attachmentManifestSha256: manifest.manifestSha256, outputSha256: outputSha, actualMacOSVisionOcrStatus: actualOcr.status, actualMacOSVisionRecognizedText: actualOcr.text, requestPromptAttachmentAuthorizationOutputBound: true, unauthorizedRecorderRejectedWithZeroWrites: true, readableTextRejected: true, forgedOutputRejected: true, reviewOnly: true, productionEvidenceAllowed: false}, null, 2));
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
