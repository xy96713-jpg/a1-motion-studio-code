#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {assertPackagingParagraphCanaryAuthorization} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-authorization-v1.mjs";
import {createPackagingParagraphImagegenAttempt} from "../apps/studio-next/src/lib/a1-packaging-paragraph-imagegen-attempt-v1.mjs";
import {assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const required = ["A1_ATTEMPT_AUTH_RECEIPT", "A1_ATTEMPT_ACTUAL_PROMPT_FILE", "A1_ATTEMPT_OUTPUT", "A1_ATTEMPT_EXECUTION_ID", "A1_ATTEMPT_STARTED_AT", "A1_ATTEMPT_COMPLETED_AT"];
for (const key of required) if (!process.env[key]?.trim()) throw new Error(`paragraph-imagegen-attempt-env-required:${key}`);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(path.join(artifactRoot, "packaging-paragraph-canary-request-pack.json"), "utf8")));
const request = pack.requests.find((item) => item.shotId === "ED-13");
const authorization = JSON.parse(fs.readFileSync(path.resolve(process.env.A1_ATTEMPT_AUTH_RECEIPT), "utf8"));
assertPackagingParagraphCanaryAuthorization(authorization, {workspaceSha256: authorization.workspaceSha256, workspaceFileSha256: authorization.workspaceFileSha256, transitionSha256: authorization.transitionSha256, storyboardRevisionSha256: authorization.storyboardRevisionSha256, canaryPlanSha256: authorization.canaryPlanSha256, requestPackSha256: pack.packSha256, implementationSha256: authorization.implementationSha256});
const actualPrompt = fs.readFileSync(path.resolve(process.env.A1_ATTEMPT_ACTUAL_PROMPT_FILE), "utf8").replace(/\n$/u, "");
const outputPath = path.resolve(process.env.A1_ATTEMPT_OUTPUT);
const outputBytes = fs.readFileSync(outputPath);
const metadata = await sharp(outputBytes).metadata();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-rejected-attempt-"));
const probe = (script) => {
  const result = spawnSync("xcrun", ["swift", path.join(projectRoot, script), outputPath], {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`paragraph-imagegen-attempt-probe-failed:${script}:${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim());
};
try {
  const ocr = probe("scripts/run-local-vision-ocr-v1.swift");
  const humans = probe("scripts/run-local-vision-human-bounds-v1.swift");
  const attempt = createPackagingParagraphImagegenAttempt({requestPackSha256: pack.packSha256, requestSha256: request.requestSha256, requestId: request.requestId, expectedPromptSha256: request.toolCall.promptSha256, authorizationReceiptSha256: authorization.receiptSha256, actualPrompt, model: process.env.A1_ATTEMPT_MODEL || "UNKNOWN_NOT_PROVIDER_ATTESTED", executionId: process.env.A1_ATTEMPT_EXECUTION_ID, startedAt: process.env.A1_ATTEMPT_STARTED_AT, completedAt: process.env.A1_ATTEMPT_COMPLETED_AT, outputPath, outputSha256: hash(outputBytes), outputBytes: outputBytes.length, width: metadata.width, height: metadata.height, format: metadata.format, machineProbes: {ocr: {status: ocr.observationCount === 0 ? "PASS_NO_READABLE_TEXT_DETECTED" : "READABLE_TEXT_REVIEW_REQUIRED", observationCount: ocr.observationCount, recognizedText: ocr.text}, humanBounds: {status: humans.status, humanCount: humans.humans?.length || 0, faceCount: humans.faces?.length || 0}}, operatorAttestedActualPixelsViewed: true, referenceIdentityRiskObserved: true, actualPixelEvidence: "The left actor reproduces the reference's seated-person-plus-television identity motif instead of only transferring abstract two-object grammar.", failureCodes: ["PROMPT_SHA_MISMATCH", "REFERENCE_IDENTITY_COMPOSITION_COPY_RISK"], recordedAt: new Date().toISOString()});
  const outputRoot = path.join(artifactRoot, "packaging-paragraph-imagegen-attempts", pack.packSha256);
  const outputFile = path.join(outputRoot, `${process.env.A1_ATTEMPT_EXECUTION_ID.replace(/[^a-zA-Z0-9._-]/gu, "-")}.json`);
  fs.mkdirSync(outputRoot, {recursive: true});
  fs.writeFileSync(outputFile, `${JSON.stringify(attempt, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
  console.log(JSON.stringify({status: attempt.status, outputFile, attemptSha256: attempt.attemptSha256, actualPromptSha256: attempt.actual.promptSha256, expectedPromptSha256: attempt.expected.promptSha256, failureCodes: attempt.failureCodes, formalCandidateBudgetConsumed: false, sameAuthorizationMayBeReused: false, productionAdmitted: false}, null, 2));
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
