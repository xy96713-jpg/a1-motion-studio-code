#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  A1_CODEX_IMAGEGEN_PROVIDER,
  A1_GENERATION_GATE_VERSION,
  A1_GENERATOR_LANES,
  assertGenerationResultV2,
  assertResultImportable,
  auditOcrEvidence,
  auditCacheIsFresh,
  buildAuditCacheKey,
  buildRequiredViewport,
  compileGenerationJobV2,
  createGenerationResultV2,
  deriveNonDestructiveViewport,
  fileSha256,
  finalizeCanaryResult,
  measuredGenerationMetrics,
  planGenerationWave,
  preflightGenerationJobV2,
  recoverStaleRunningJobs,
  selectCanaryRepairEntry,
} from "../apps/studio-next/src/lib/a1-isolated-imagegen-generation-v2.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-isolated-imagegen-v2-"));
const referenceA = path.join(tempRoot, "reference-a.png");
const referenceB = path.join(tempRoot, "reference-b.png");
const holdFrame = path.join(tempRoot, "hold-frame.jpg");
const outputPath = path.join(tempRoot, "isolated", "lane-b", "candidate.png");
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(referenceA, "reference-a");
fs.writeFileSync(referenceB, "reference-b");
fs.writeFileSync(holdFrame, "hold-frame");
fs.writeFileSync(outputPath, "candidate-pixels");

const sourceRevisionHash = "a".repeat(64);
const planSha256 = "b".repeat(64);
const baseInput = {
  shotId: "ED-20",
  sourceRevisionHash,
  brief: {planSha256, styleBriefSha256: "c".repeat(64), primaryFamily: "pixel-type-actor", surfaceLogic: "one-material-handoff"},
  semanticPayload: {semanticAction: "show one continuous handoff", semanticActor: "MATERIAL_HANDOFF", topology: "ONE_CONTINUOUS_FIELD"},
  primitiveId: "material-handoff-v1",
  presentationMode: "FULLSCREEN",
  exactText: "整理材料 / 明确约束 / 继续编辑 / 收稿",
  referencePaths: [referenceA, referenceB],
  referenceSha256s: [fileSha256(referenceA), fileSha256(referenceB)],
  holdFramePath: holdFrame,
  holdFrameSha256: fileSha256(holdFrame),
  styleVersion: "pinterest-retro-pixel-v1:test",
  requiredViewport: buildRequiredViewport(),
  generatorLane: A1_GENERATOR_LANES.TYPOGRAPHY_EXPLAINER,
  provider: A1_CODEX_IMAGEGEN_PROVIDER,
  attempt: 1,
};

const compiled = compileGenerationJobV2(baseInput);
const ready = preflightGenerationJobV2(compiled);
assert.equal(ready.status, "READY");
assert.equal(ready.preflight.status, "PASS");
assert.throws(() => compileGenerationJobV2({...baseInput, exactText: ""}), /EXACT_TEXT_MISSING/u);
assert.throws(() => compileGenerationJobV2({...baseInput, attempt: 2}), /RETRY_BINDING_MISSING/u);
const retryJob = compileGenerationJobV2({...baseInput, attempt: 2, retryOfJobId: compiled.jobId, retryReasonCodes: ["OCR_EXACT_TEXT_MISMATCH"], retryInputArtifactSha: fileSha256(referenceA)});
assert.notEqual(retryJob.promptHash, compiled.promptHash);
assert.match(retryJob.prompt, /收稿/u);
assert.equal(preflightGenerationJobV2(compileGenerationJobV2({...baseInput, referencePaths: [referenceA, path.join(tempRoot, "missing.png")], referenceSha256s: [fileSha256(referenceA), "d".repeat(64)]})).status, "PREFLIGHT_BLOCKED");

const ocrWithAmbiguousCursor = auditOcrEvidence({expectedText: baseInput.exactText, ocrSegments: [
  {text: "整理材料", confidence: 1}, {text: "明确约束", confidence: 1}, {text: "三1", confidence: 0.3}, {text: "继续编辑", confidence: 1}, {text: "收稿", confidence: 1},
]});
assert.equal(ocrWithAmbiguousCursor.status, "PASS");
assert.equal(ocrWithAmbiguousCursor.unexpectedText.length, 0);
assert.equal(ocrWithAmbiguousCursor.ambiguousGlyphs[0].text, "三1");
const ocrWithRealExtraText = auditOcrEvidence({expectedText: baseInput.exactText, ocrSegments: [
  {text: "整理材料", confidence: 1}, {text: "明确约束", confidence: 1}, {text: "继续编辑", confidence: 1}, {text: "收稿", confidence: 1}, {text: "备注", confidence: 0.9},
]});
assert.equal(ocrWithRealExtraText.status, "FAIL");
assert.equal(ocrWithRealExtraText.failures.includes("OCR_UNEXPECTED_TEXT"), true);
const ocrWithLowConfidenceRequired = auditOcrEvidence({expectedText: baseInput.exactText, ocrSegments: [
  {text: "整理材料", confidence: 1}, {text: "明确约束", confidence: 1}, {text: "继续编辑", confidence: 1}, {text: "收稿", confidence: 0.3},
]});
assert.equal(ocrWithLowConfidenceRequired.status, "FAIL");
assert.equal(ocrWithLowConfidenceRequired.failures.includes("OCR_EXACT_TEXT_MISMATCH"), true);
assert.equal(ocrWithLowConfidenceRequired.failures.includes("OCR_REQUIRED_PHRASE_LOW_CONFIDENCE"), true);

const humanAnchors = [
  {phrase: "整理材料", x: 0.14, y: 0.45, width: 0.15, height: 0.1},
  {phrase: "明确约束", x: 0.34, y: 0.45, width: 0.15, height: 0.1},
  {phrase: "继续编辑", x: 0.54, y: 0.45, width: 0.15, height: 0.1},
  {phrase: "收稿", x: 0.72, y: 0.45, width: 0.14, height: 0.1},
];
const humanPrimitive = compileGenerationJobV2({...baseInput, primitiveId: "human-editorial-manuscript-table:one-continuous-paper-story", brief: {...baseInput.brief, primitiveCompatibility: {forbiddenVisualLanguages: ["conveyor", "factory", "machine pipeline", "lock station", "terminal receipt", "computer cursor", "ui workflow", "four cards", "four icons"]}}, requiredViewport: buildRequiredViewport({typographySafeInset: 0.12, expectedTextAnchors: humanAnchors})});
assert.equal(preflightGenerationJobV2(humanPrimitive).status, "READY");
const unsafeAnchors = [...humanAnchors.slice(0, -1), {...humanAnchors.at(-1), x: 0.82, width: 0.1}];
assert.equal(preflightGenerationJobV2(compileGenerationJobV2({...humanPrimitive, prompt: undefined, promptHash: undefined, requiredViewport: buildRequiredViewport({typographySafeInset: 0.12, expectedTextAnchors: unsafeAnchors})})).status, "PREFLIGHT_BLOCKED");

const providerCanvas = deriveNonDestructiveViewport({pixelWidth: 1536, pixelHeight: 1024, requiredViewport: ready.requiredViewport});
assert.equal(providerCanvas.status, "PASS");
assert.deepEqual(providerCanvas.sourceRect, {x: 0, y: 80, width: 1536, height: 864});
assert.equal(providerCanvas.sourcePixelTransform, "NONE");
assert.equal(deriveNonDestructiveViewport({pixelWidth: 900, pixelHeight: 900, requiredViewport: ready.requiredViewport}).status, "BLOCKED");

const rawResult = createGenerationResultV2({
  jobId: ready.jobId,
  generatorLane: ready.generatorLane,
  outputPath,
  pixelWidth: 1536,
  pixelHeight: 1024,
  artifactSha: fileSha256(outputPath),
  promptHash: ready.promptHash,
  referencesHash: ready.referencesHash,
  generationKey: ready.generationKey,
  attempt: 1,
});
const visualAudit = {semanticThreeSecondPass: true, styleAuthorityPass: true, genericTemplateAbsent: true, oneContinuousScene: true, quietFieldRatio: 0.42};
const audited = finalizeCanaryResult(rawResult, {
  job: ready,
  ocrText: ready.exactText,
  textBoxes: [{x: 220, y: 330, width: 980, height: 120}],
  visualAudit,
});
assert.equal(audited.status, "AUDIT_PASS");

const duplicateJob = compileGenerationJobV2({...baseInput, shotId: "ED-21", sourceRevisionHash: "e".repeat(64), primitiveId: "other-v1"});
const duplicateResult = createGenerationResultV2({...rawResult, jobId: duplicateJob.jobId, promptHash: duplicateJob.promptHash, referencesHash: duplicateJob.referencesHash, generationKey: duplicateJob.generationKey});
const waveWithDuplicate = planGenerationWave([ready, duplicateJob], [audited, duplicateResult]);
assert.equal(waveWithDuplicate.artifactDuplicates.length, 1);

const pendingA = compileGenerationJobV2({...baseInput, shotId: "ED-22", sourceRevisionHash: "f".repeat(64), primitiveId: "a-v1", status: "READY"});
const pendingB = compileGenerationJobV2({...baseInput, shotId: "ED-23", sourceRevisionHash: "1".repeat(64), primitiveId: "b-v1", status: "READY"});
const pendingC = compileGenerationJobV2({...baseInput, shotId: "ED-24", sourceRevisionHash: "2".repeat(64), primitiveId: "c-v1", status: "READY"});
const bounded = planGenerationWave([pendingA, pendingB, pendingC], [], {maxConcurrency: 2});
assert.equal(bounded.dispatch.length, 2);
assert.equal(bounded.pending.length, 1);
assert.throws(() => planGenerationWave([pendingA], [], {maxConcurrency: 3}), /concurrency/u);
const idempotent = planGenerationWave([ready, ready], [audited]);
assert.equal(idempotent.dispatch.length, 0);
assert.equal(idempotent.cached.length, 1);
assert.equal(idempotent.generationCalls, 0);

const stale = recoverStaleRunningJobs([{...ready, status: "RUNNING", startedAt: "2026-01-01T00:00:00.000Z"}], {now: Date.parse("2026-01-01T00:20:00.000Z"), staleAfterMs: 10 * 60 * 1000});
assert.equal(stale[0].status, "STALE");
assert.notEqual(stale[0].status, "COMPLETED");

const auditBinding = {artifactSha: audited.artifactSha, auditVersion: "A1CodexImageGenCapabilityCanaryAudit/v3", gateVersion: A1_GENERATION_GATE_VERSION, planSha256, sourceRevisionHash};
assert.equal(auditCacheIsFresh({status: "PASS", auditCacheKey: audited.auditCacheKey}, auditBinding), true);
assert.equal(auditCacheIsFresh({status: "PASS", auditCacheKey: audited.auditCacheKey}, {...auditBinding, sourceRevisionHash: "9".repeat(64)}), false);
assert.equal(buildAuditCacheKey(auditBinding).length, 64);
assert.equal(assertResultImportable({job: ready, result: audited, isolatedRoot: path.dirname(path.dirname(outputPath)), auditBinding}), true);
assert.throws(() => assertResultImportable({job: ready, result: {...audited, status: "AUDIT_FAIL", rejectionCodes: ["TEST"]}, isolatedRoot: tempRoot, auditBinding}), /AUDIT_PASS_REQUIRED/u);
assert.throws(() => assertResultImportable({job: ready, result: audited, isolatedRoot: tempRoot, auditBinding: {...auditBinding, gateVersion: "changed"}}), /STALE_AUDIT_CACHE/u);
assert.throws(() => assertResultImportable({job: ready, result: audited, isolatedRoot: tempRoot, auditBinding, knownResults: [duplicateResult]}), /DUPLICATE_ARTIFACT_SHA/u);

assert.throws(() => assertGenerationResultV2({...audited, workspace: {mutated: true}}), /RESULT_FORBIDDEN_KEY:workspace/u);
const metrics = measuredGenerationMetrics([audited], {startedAt: null, completedAt: null, boardRebuildCount: 0, deltaAuditCount: 1});
assert.equal(metrics.generationCalls, 1);
assert.equal(metrics.firstPassRate, 1);
assert.equal(metrics.totalWallTime, null);
assert.equal(metrics.boardRebuildCount, 0);

assert.equal(selectCanaryRepairEntry([{shotId: "ED-13", status: "AUDIT_PASS"}, {shotId: "ED-20", status: "AUDIT_DELTA_REQUIRED"}]).shotId, "ED-20");
assert.equal(selectCanaryRepairEntry([{shotId: "ED-13", status: "AUDIT_PASS"}, {shotId: "ED-20", status: "CANARY_REQUIRED"}]).shotId, "ED-20");

console.log(JSON.stringify({status: "PASS", contract: "A1IsolatedImagegenGenerationV2FixtureTest/v1", checks: {jobResultSchema: true, concurrencyHardMax: 2, idempotentGenerationKey: true, providerSourceCanvasSeparatedFromViewport: true, missingReferenceBlocked: true, missingExactTextBlocked: true, duplicateArtifactBlocked: true, staleAuditCacheBlocked: true, staleRunningRecovered: true, generatorWorkspaceWriteRejected: true, auditedResultOnlyImport: true, unmeasuredMetricsRemainNull: true, lowConfidenceAmbiguousGlyphNotExtraText: true, highConfidenceUnexpectedTextRejected: true, lowConfidenceRequiredTextRejected: true, expectedTextAnchorsPreflightedAtTwelvePercent: true}}, null, 2));
