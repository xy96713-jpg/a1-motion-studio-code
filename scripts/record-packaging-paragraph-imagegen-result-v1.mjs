#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {readPackagingParagraphCanaryAuthorization} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-authorization-v1.mjs";
import {buildPackagingParagraphCanaryImplementationBinding} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-implementation-binding-v1.mjs";
import {assertPackagingParagraphCanaryLiveInputs, assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {createPackagingParagraphImagegenResultReceipt} from "../apps/studio-next/src/lib/a1-packaging-paragraph-imagegen-result-v1.mjs";
import {readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const packPath = path.join(artifactRoot, "packaging-paragraph-canary-request-pack.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const requiredEnv = ["A1_PACKAGING_PARAGRAPH_CANARY_AUTH_RECEIPT", "A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_OUTPUT", "A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_EXECUTION_ID", "A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_MODEL", "A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_STARTED_AT", "A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_COMPLETED_AT"];
for (const key of requiredEnv) if (!process.env[key]?.trim()) throw new Error(`paragraph-imagegen-result-env-required:${key}`);

const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(packPath, "utf8")));
assertPackagingParagraphCanaryLiveInputs(pack, {projectRoot});
const request = pack.requests.find((item) => item.shotId === "ED-13");
if (!request?.toolCall || request.attachmentManifest?.contract !== "A1PackagingParagraphImagegenAttachmentManifest/v1") throw new Error("paragraph-imagegen-result-current-request-required");
const current = readCurrentProductionAuthorizationBinding(appRoot);
const implementation = buildPackagingParagraphCanaryImplementationBinding(projectRoot);
const authorization = readPackagingParagraphCanaryAuthorization(process.env.A1_PACKAGING_PARAGRAPH_CANARY_AUTH_RECEIPT, {workspaceSha256: current.workspaceSha256, workspaceFileSha256: current.workspaceFileSha256, transitionSha256: current.transitionSha256, storyboardRevisionSha256: pack.source.storyboardRevisionSha256, canaryPlanSha256: pack.source.canaryPlanSha256, requestPackSha256: pack.packSha256, implementationSha256: implementation.implementationSha256});
const sourcePath = path.resolve(process.env.A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_OUTPUT);
if (!fs.existsSync(sourcePath)) throw new Error("paragraph-imagegen-result-output-missing");
const sourceBytes = fs.readFileSync(sourcePath);
const sourceSha256 = sha256(sourceBytes);
const metadata = await sharp(sourceBytes).metadata();
if (!Number.isInteger(metadata.width) || metadata.width < 1024 || !Number.isInteger(metadata.height) || metadata.height < 576 || metadata.width <= metadata.height || !["png", "jpeg", "webp"].includes(metadata.format)) throw new Error("paragraph-imagegen-result-output-format-invalid");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-imagegen-ocr-"));
let ocr;
try {
  const binary = path.join(tempRoot, "a1-local-vision-ocr");
  const compile = spawnSync("swiftc", [path.join(projectRoot, "scripts/run-local-vision-ocr-v1.swift"), "-o", binary], {encoding: "utf8"});
  if (compile.status !== 0) throw new Error(`paragraph-imagegen-result-ocr-compile-failed:${compile.stderr.trim()}`);
  const probe = spawnSync(binary, [sourcePath], {encoding: "utf8"});
  if (probe.status !== 0) throw new Error(`paragraph-imagegen-result-ocr-probe-failed:${probe.stderr.trim()}`);
  const raw = JSON.parse(probe.stdout.trim());
  if (raw.status !== "PASS") throw new Error("paragraph-imagegen-result-ocr-blocked");
  const accepted = (raw.segmentDetails || []).filter((segment) => Number(segment.confidence) >= 0.5 && /[\p{L}\p{N}]/u.test(String(segment.text || ""))).map((segment) => ({text: String(segment.text).trim(), confidence: Number(segment.confidence), boundingBox: segment.boundingBox})).filter((segment) => segment.text);
  const recognizedText = accepted.map((segment) => segment.text).join(" ");
  ocr = {contract: "A1LocalVisionOCRAudit/v1", status: recognizedText ? "FAIL_READABLE_TEXT_DETECTED" : "PASS_NO_READABLE_TEXT_DETECTED", method: "MACOS_VISION_ACCURATE_ZH_EN", sourceSha256, readableTextDetected: Boolean(recognizedText), recognizedText, acceptedSegments: accepted, rawObservationCount: raw.observationCount || 0, confidenceThreshold: 0.5, languages: raw.languages || ["zh-Hans", "en-US"]};
  if (ocr.readableTextDetected) throw new Error(`paragraph-imagegen-result-readable-text-detected:${recognizedText}`);
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}

const resultParent = path.join(artifactRoot, "packaging-paragraph-imagegen-results");
const resultRoot = path.join(resultParent, pack.source.canaryPlanSha256);
const resultStagingRoot = path.join(resultParent, ".staging", pack.source.canaryPlanSha256);
const extension = metadata.format === "jpeg" ? "jpg" : metadata.format;
const artifactPath = path.join(resultRoot, `${sourceSha256}.${extension}`);
const receiptPath = path.join(resultRoot, `${sourceSha256}.receipt.json`);
const stagingArtifactPath = path.join(resultStagingRoot, `${sourceSha256}.${extension}`);
const stagingReceiptPath = path.join(resultStagingRoot, `${sourceSha256}.receipt.json`);
if (fs.existsSync(resultRoot) || fs.existsSync(resultStagingRoot)) throw new Error("paragraph-imagegen-result-target-must-be-new");
const startedAt = process.env.A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_STARTED_AT;
const completedAt = process.env.A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_COMPLETED_AT;
const receipt = createPackagingParagraphImagegenResultReceipt({shotId: "ED-13", tool: "image_gen.imagegen", operatorAttested: true, requestPackSha256: pack.packSha256, requestSha256: request.requestSha256, requestId: request.requestId, promptSha256: request.toolCall.promptSha256, attachmentManifestSha256: request.attachmentManifest.manifestSha256, attachmentSourceSha256s: request.attachmentManifest.entries.map((entry) => entry.sha256), authorizationReceiptSha256: authorization.receiptSha256, model: process.env.A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_MODEL, executionId: process.env.A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_EXECUTION_ID, startedAt, completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt), artifactPath, outputSha256: sourceSha256, outputBytes: sourceBytes.length, width: metadata.width, height: metadata.height, format: metadata.format, ocrAudit: ocr, recordedAt: new Date().toISOString()});
let published = false;
try {
  fs.mkdirSync(resultStagingRoot, {recursive: true});
  fs.writeFileSync(stagingArtifactPath, sourceBytes, {flag: "wx"});
  fs.writeFileSync(stagingReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
  fs.mkdirSync(resultParent, {recursive: true});
  fs.renameSync(resultStagingRoot, resultRoot);
  published = true;
} finally {
  if (!published && fs.existsSync(resultStagingRoot)) fs.rmSync(resultStagingRoot, {recursive: true, force: true});
}
console.log(JSON.stringify({status: receipt.status, receiptPath, receiptSha256: receipt.receiptSha256, artifactPath, outputSha256: receipt.output.sha256, dimensions: {width: receipt.output.width, height: receipt.output.height}, promptSha256: receipt.promptSha256, attachmentManifestSha256: receipt.attachmentManifestSha256, authorizationReceiptSha256: receipt.authorizationReceiptSha256, ocrStatus: receipt.ocrAudit.status, operatorAttested: true, cryptographicProviderAttestationAvailable: false, reviewOnly: true, productionEvidenceAllowed: false, productionAdmissionAllowed: false, imageGenerationCountRecorded: 1, workspaceMutationPerformed: false}, null, 2));
