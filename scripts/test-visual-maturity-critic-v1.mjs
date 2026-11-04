import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildVisualMaturityCriticPrompt, normalizeVisualMaturityCriticResult, runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";

const dimensions = ["visualJob", "silhouette", "materialSpecificity", "typeRoles", "depthOcclusion", "motionPhrase", "transitionHandoff", "sequenceContrast"].map((id) => ({id, score: 3, evidence: `${id} evidence`, repair: ""}));
const raw = {
  contract: "A1VisualMaturityCritic/v1",
  scope: "asset-board",
  verdict: "PASS",
  overallSummary: "强字形与材料关系成立。",
  dimensions,
  hardFailures: [],
  candidates: [{candidateId: "D01", rank: 1, score: 23, exactTextStatus: "verified", observedText: "AI 味", visualEvidence: "逐字清楚。", repairBrief: "保持。"}],
  selectedCandidateId: "D01",
  totalScore: 1,
  benchmarkThreshold: 22,
  repairPlan: {highestImpact: "保持材料关系。", retain: ["字形轮廓"], remove: [], nextPrompt: "保留现有轮廓并强化真实纸张遮挡。"},
};
const normalized = normalizeVisualMaturityCriticResult(raw, {scope: "asset-board", candidates: [{candidateId: "D01"}]});
assert.equal(normalized.totalScore, 24, "score must be recalculated from the eight dimensions");
assert.equal(normalized.verdict, "PASS");

const failed = normalizeVisualMaturityCriticResult({...raw, hardFailures: ["unverified-generated-chinese"]}, {scope: "asset-board", candidates: [{candidateId: "D01"}]});
assert.equal(failed.verdict, "BLOCK", "hard failures must override a model PASS");

const prompt = buildVisualMaturityCriticPrompt({scope: "asset-board", context: {}, candidates: [{candidateId: "D01", expectedText: "AI 味"}]});
for (const marker of ["像素", "24", "hardFailures", "文件存在", "candidateId", "逐字"]) assert.ok(prompt.includes(marker), `prompt marker missing:${marker}`);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "a1-visual-critic-test-"));
const imagePath = path.join(temporary, "candidate.png");
fs.writeFileSync(imagePath, Buffer.from("test-image"));
let calls = 0;
const runner = async () => { calls += 1; return JSON.stringify(raw); };
const args = {scope: "asset-board", images: [imagePath], candidates: [{candidateId: "D01", expectedText: "AI 味"}], context: {article: "test"}, cacheDir: path.join(temporary, "cache"), runner};
const first = await runVisualMaturityCritic(args);
const second = await runVisualMaturityCritic(args);
assert.equal(first.trace.cacheHit, false);
assert.equal(second.trace.cacheHit, true);
assert.equal(calls, 1, "identical image and context must hit cache");
console.log(JSON.stringify({status: "PASS", checks: 6, score: first.totalScore, cacheHit: second.trace.cacheHit}, null, 2));
