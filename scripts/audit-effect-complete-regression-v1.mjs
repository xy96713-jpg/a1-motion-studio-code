#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {inspectEvidenceBindings, isEvidencePass, summarizeFindings, writeAudit} from "./lib/screen-validation-evidence-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const sha = (relative) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const matrixPath = "work/screen-recording-maturity-test-v1/effect-capability-matrix.json";
const reelPath = "work/screen-recording-maturity-test-v1/effect-coverage-reel-v1/screen-effect-coverage-review-1280x720-60fps.mp4";
const manifestPath = "work/screen-recording-maturity-test-v1/effect-coverage-reel-v1/coverage-manifest.json";
const chainPath = "work/screen-recording-maturity-test-v1/three-article-v1/three-article-cap-chain-audit.json";
const eightScenarioPath = "work/screen-recording-maturity-test-v1/eight-scenario-regression-v1/audit-report.json";
const decisionReviewPath = "work/screen-recording-maturity-test-v1/annotation-decision-proof-v1/render/audit-report.json";
const executionChainPath = "work/screen-recording-maturity-test-v1/execution-chain-v2-audit.json";
const boundaryAuditPath = "work/screen-recording-maturity-test-v1/effect-maturity-boundary-audit.json";
const maturityRegressionPath = "work/screen-recording-maturity-test-v1/effect-maturity-regression-v2/audit-report.json";
const richnessAuditPath = "work/screen-recording-maturity-test-v1/effect-maturity-richness-audit.json";
const adapterOutput = JSON.parse(execFileSync(process.execPath, ["scripts/test-screen-packaging-remaining-adapters-v1.mjs"], {cwd: root, encoding: "utf8"}));
const matrix = read(matrixPath);
const manifest = read(manifestPath);
const chain = read(chainPath);
const eightScenario = read(eightScenarioPath);
const decisionReview = read(decisionReviewPath);
const executionChain = read(executionChainPath);
const boundaryAudit = read(boundaryAuditPath);
const maturityRegression = read(maturityRegressionPath);
const richnessAudit = read(richnessAuditPath);
const probe = JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", path.join(root, reelPath)], {encoding: "utf8"}));
const stream = probe.streams.find((row) => row.width);
const decode = execFileSync(path.join(root, ".tools/bin/ffmpeg"), ["-v", "error", "-i", path.join(root, reelPath), "-f", "null", "-"], {encoding: "utf8"});
const requiredReports = {executionChain: [executionChainPath, executionChain], boundaryAudit: [boundaryAuditPath, boundaryAudit], maturityRegression: [maturityRegressionPath, maturityRegression], richnessAudit: [richnessAuditPath, richnessAudit], chain: [chainPath, chain], eightScenario: [eightScenarioPath, eightScenario], decisionReview: [decisionReviewPath, decisionReview], matrix: [matrixPath, matrix]};
const sources = Object.fromEntries(Object.entries(requiredReports).map(([key, [file]]) => [key, {path: file, sha256: sha(file)}]));
const bindingAudit = inspectEvidenceBindings(root, sources);
const findings = [
  ...summarizeFindings(matrix.items || [{id: "MATRIX_MISSING", status: "INCOMPLETE"}]).unresolved,
  ...Object.entries(requiredReports).filter(([, [, value]]) => !isEvidencePass(value.status)).map(([id, [, value]]) => ({id, status: value.status || "INCOMPLETE"})),
  ...(richnessAudit.findings || []).filter((row) => summarizeFindings([row]).unresolved.length),
  ...(eightScenario.shortNoImageBoundary ? [{...eightScenario.shortNoImageBoundary}] : []),
  ...bindingAudit.failures.map((row) => ({...row, status: "FAIL"})),
];

const reviewStatus = adapterOutput.status === "PASS" && decisionReview.source?.persistedReadback === true && stream.width === 1280 && stream.height === 720 && stream.r_frame_rate === "60/1" && decode === "";
if (!reviewStatus) findings.push({id: "EXECUTOR_MEDIA_OR_PERSISTENCE_CHECK", status: "FAIL"});

const gaps = summarizeFindings(findings).unresolved;
const report = {contract: "A1EffectCompleteRegressionAudit/v1", status: !reviewStatus ? "FAIL" : summarizeFindings(findings).status, maturityProven: false, sources, bindingAudit, findings, adapterContract: {status: adapterOutput.status, adapterCount: adapterOutput.adapterCount, effects: adapterOutput.effects.map((item) => item.effectId)}, coverageReel: {path: reelPath, sha256: sha(reelPath), manifestSha256: sha(manifestPath), status: manifest.status, width: stream.width, height: stream.height, fps: stream.r_frame_rate, frameCount: Number(stream.nb_read_frames), durationMs: Math.round(Number(probe.format.duration) * 1000), fullDecodePass: decode === "", segmentCount: manifest.clips?.length || 0, effectCount: new Set((manifest.clips || []).flatMap((clip) => clip.effects || [])).size}, executionChain: {path: executionChainPath, sha256: sha(executionChainPath), status: executionChain.status, issueCount: executionChain.rows?.reduce((sum, row) => sum + (row.issues?.length || 0), 0) || 0, conclusion: executionChain.conclusion}, maturityBoundaryAudit: {path: boundaryAuditPath, sha256: sha(boundaryAuditPath), status: boundaryAudit.status, checks: boundaryAudit.checks?.length || 0}, maturityRegression: {path: maturityRegressionPath, sha256: sha(maturityRegressionPath), status: maturityRegression.status, clipCount: maturityRegression.clips?.length || 0, durationMs: maturityRegression.media?.durationMs, fullDecode: maturityRegression.media?.fullDecode}, richnessAudit: {path: richnessAuditPath, sha256: sha(richnessAuditPath), status: richnessAudit.status, openFindings: summarizeFindings(richnessAudit.findings || []).unresolved.map((finding) => finding.id)}, threeArticleCapChain: {path: chainPath, sha256: sha(chainPath), status: chain.status, fixtureCount: chain.fixtureCount, checks: chain.checks}, eightScenarioRegression: {path: eightScenarioPath, sha256: sha(eightScenarioPath), status: eightScenario.status, scenarioCount: eightScenario.checks?.scenarioCount, allMediaDecode: eightScenario.checks?.allMediaDecode, allMediaWide60: eightScenario.checks?.allMediaWide60, requiredBoundaryPreserved: eightScenario.checks?.requiredBoundaryPreserved, shortOrNoImageBoundary: eightScenario.shortNoImageBoundary}, decisionReview: {path: decisionReviewPath, sha256: sha(decisionReviewPath), status: decisionReview.status, persistedReadback: decisionReview.source?.persistedReadback, beats: decisionReview.beats, output: decisionReview.output}, effectMatrix: {path: matrixPath, sha256: sha(matrixPath), contract: matrix.contract, status: matrix.status, counts: (matrix.items || []).reduce((counts, item) => {counts[item.status] = (counts[item.status] || 0) + 1; return counts;}, {})}, remainingGaps: gaps, policyExceptions: matrix.items.filter((item) => item.status === "POLICY_DISABLED").map((item) => ({id: item.id, reason: item.reason})), boundary: {reviewOnly: true, productionAdmission: false, formal34ShotMutation: false}};
report.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
const out = path.join(root, "work/screen-recording-maturity-test-v1/effect-complete-regression-v1/audit-report.json");
writeAudit(root, path.relative(root, out), report, Object.values(sources));
console.log(JSON.stringify({status: report.status, adapterCount: report.adapterContract.adapterCount, coverageEffectCount: report.coverageReel.effectCount, threeArticleStatus: report.threeArticleCapChain.status, remainingGaps: gaps, output: path.relative(root, out)}, null, 2));
if (!isEvidencePass(report.status)) process.exitCode = 1;
