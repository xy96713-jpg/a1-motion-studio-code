#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {runTreatmentBatchCritic} from "../apps/studio-next/src/lib/a1-treatment-batch-critic-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputSchema = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-treatment-batch-critic-output.schema.json"), "utf8"));
const unsupportedStrictSchemaKeywords = new Set(["uniqueItems"]);
const findUnsupportedKeywords = (value, pointer = "$") => {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => findUnsupportedKeywords(item, `${pointer}[${index}]`));
  return Object.entries(value).flatMap(([key, child]) => [
    ...(unsupportedStrictSchemaKeywords.has(key) ? [`${pointer}.${key}`] : []),
    ...findUnsupportedKeywords(child, `${pointer}.${key}`),
  ]);
};
assert.deepEqual(findUnsupportedKeywords(outputSchema), [], "Codex strict output schema must not contain unsupported keywords");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-treatment-batch-critic-"));
const cacheDir = path.join(tempRoot, "cache");
const images = Array.from({length: 6}, (_, index) => {
  const file = path.join(tempRoot, `board-${index + 1}.png`);
  fs.writeFileSync(file, Buffer.from(`fixture-${index + 1}`));
  return file;
});
const treatmentIds = ["direction-a", "direction-a", "direction-b", "direction-b", "direction-c", "direction-c"];
const candidates = treatmentIds.map((treatmentId, index) => ({
  candidateId: `candidate-${index + 1}`,
  treatmentId,
  shotId: index % 2 ? "ED-10" : "ED-09",
  exactEditableText: index % 2 ? ["完成度很高", "废稿"] : ["每个镜头", "语义作用"],
  localPreflight: {
    editableTextActorCount: 2,
    editableTextVerifiedLocally: true,
    compositorGraphValid: true,
    renderCacheHit: false,
    boardCacheHit: false,
  },
}));
let requestCount = 0;
const runner = async () => {
  requestCount += 1;
  return {
    contract: "A1VisualTreatmentBatchCritic/v1",
    scope: "visual-treatment-3x2",
    overallSummary: "A 方向的两张代表镜均形成清楚、可读且可动的同一视觉语法。",
    items: candidates.map((candidate, index) => {
      const score = index < 2 ? 3 : index < 4 ? 2 : 2;
      const scores = {
        semanticAccuracy: score,
        compositionSilhouette: score,
        materialQuality: score,
        typographyRole: score,
        depth: score,
        motionPotential: score,
        transitionContinuity: score,
        sequenceContrast: index >= 4 ? 3 : score,
      };
      return {
        candidateId: candidate.candidateId,
        scores,
        hardFailures: [],
        visualEvidence: `${candidate.candidateId} 的主体轮廓、两级中文和材料绑定均可直接观察。`,
        exactTextStatus: "verified",
        confidence: "high",
        structuredRevision: {preserve: ["主体轮廓"], remove: [], compositionChanges: ["保持当前主轮廓并扩大字物咬合"], nextPromptReferenceOnly: "仅在合成结构变化后复审。"},
      };
    }),
  };
};

try {
  const progress = [];
  const first = await runTreatmentBatchCritic({images, candidates, cacheDir, runner, onProgress: (item) => progress.push(item.phase)});
  assert.equal(requestCount, 1);
  assert.equal(first.trace.modelRequestCount, 1);
  assert.equal(first.trace.cacheHit, false);
  assert.equal(first.directions.find((direction) => direction.treatmentId === "direction-a")?.status, "PASS");
  assert.equal(first.championTreatmentId, "direction-a");
  assert.ok(progress.includes("critic-request-started"));
  assert.ok(progress.includes("critic-request-complete"));

  const operationallyDifferent = candidates.map((candidate) => ({
    ...candidate,
    localPreflight: {...candidate.localPreflight, renderCacheHit: true, boardCacheHit: true},
  }));
  const second = await runTreatmentBatchCritic({images, candidates: operationallyDifferent, cacheDir, runner});
  assert.equal(requestCount, 1, "same semantic/image batch must not call the model twice");
  assert.equal(second.trace.batchHash, first.trace.batchHash);
  assert.equal(second.trace.cacheHit, true);
  assert.equal(second.trace.modelRequestCount, 0);
  assert.equal(second.trace.durationMs, 0);

  const unavailableProgress = [];
  const unavailableCandidates = candidates.map((candidate) => ({...candidate, exactEditableText: [...candidate.exactEditableText, "故障态不得写视觉分"]}));
  const longFailureMessage = `fixture-visual-critic-unavailable:${"x".repeat(9000)}:tail`;
  await assert.rejects(
    runTreatmentBatchCritic({
      images,
      candidates: unavailableCandidates,
      cacheDir,
      runner: async () => { throw new Error(longFailureMessage); },
      onProgress: (item) => unavailableProgress.push(item.phase),
    }),
    /fixture-visual-critic-unavailable/u,
  );
  assert.ok(unavailableProgress.includes("critic-request-failed"));
  const failureArtifacts = fs.readdirSync(cacheDir).filter((file) => file.endsWith(".failed.json"));
  assert.equal(failureArtifacts.length, 1, "unavailable critic must persist diagnostics");
  const failure = JSON.parse(fs.readFileSync(path.join(cacheDir, failureArtifacts[0]), "utf8"));
  assert.match(failure.error, /^fixture-visual-critic-unavailable:/u, "failure diagnostics must preserve the actual leading reason");
  assert.match(failure.error, /\[truncated/u, "long diagnostics should retain bounded head and tail excerpts");
  assert.match(failure.error, /:tail$/u, "failure diagnostics must preserve the useful tail");
  assert.equal(fs.readdirSync(cacheDir).filter((file) => file.endsWith(".json") && !file.endsWith(".failed.json")).length, 1, "unavailable critic must not cache a fabricated score report");
  console.log("A1 treatment batch critic cache and one-request triage PASS");
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
