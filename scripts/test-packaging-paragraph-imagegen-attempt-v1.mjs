#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";
import {assertPackagingParagraphImagegenAttempt, createPackagingParagraphImagegenAttempt} from "../apps/studio-next/src/lib/a1-packaging-paragraph-imagegen-attempt-v1.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-imagegen-attempt-test-"));
try {
  const outputPath = path.join(root, "attempt.png");
  const bytes = await sharp({create: {width: 1536, height: 864, channels: 4, background: "#eef1ef"}}).png().toBuffer();
  fs.writeFileSync(outputPath, bytes);
  const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
  const input = {requestPackSha256: "a".repeat(64), requestSha256: "b".repeat(64), requestId: "ed13", expectedPromptSha256: sha256("expected"), authorizationReceiptSha256: "c".repeat(64), actualPrompt: "drifted", model: "fixture", executionId: "fixture", startedAt: "2026-08-12T18:13:16.705Z", completedAt: "2026-08-12T18:14:36.177Z", outputPath, outputSha256: sha256(bytes), outputBytes: bytes.length, width: 1536, height: 864, format: "png", machineProbes: {ocr: {status: "PASS_NO_READABLE_TEXT_DETECTED", observationCount: 0, recognizedText: ""}, humanBounds: {status: "PASS", humanCount: 0, faceCount: 0}}, operatorAttestedActualPixelsViewed: true, referenceIdentityRiskObserved: true, actualPixelEvidence: "literal identity motif observed", failureCodes: ["PROMPT_SHA_MISMATCH", "REFERENCE_IDENTITY_COMPOSITION_COPY_RISK"], recordedAt: "2026-08-12T18:15:00.000Z"};
  const attempt = assertPackagingParagraphImagegenAttempt(createPackagingParagraphImagegenAttempt(input));
  assert.equal(attempt.budget.sameAuthorizationMayBeReused, false);
  assert.equal(attempt.boundary.productionAdmitted, false);
  assert.throws(() => createPackagingParagraphImagegenAttempt({...input, actualPrompt: "expected"}), /prompt-drift-required/u);
  assert.throws(() => assertPackagingParagraphImagegenAttempt({...attempt, boundary: {...attempt.boundary, productionAdmitted: true}}), /sha|boundary/u);
  console.log(JSON.stringify({status: "PASS", contract: attempt.contract, promptDriftRejected: true, identityCopyRiskRecorded: true, authorizationReuseForbidden: true, productionAdmitted: false}, null, 2));
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
