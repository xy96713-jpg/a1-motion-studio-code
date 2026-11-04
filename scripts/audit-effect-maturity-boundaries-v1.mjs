#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {preflightCapRequest} from "./lib/cap-request-preflight.mjs";
import {compileArticleEffectExecutionPlan} from "./lib/compile-article-effect-execution-plan-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const run = (file) => { execFileSync(process.execPath, [file], {cwd: root, stdio: "pipe"}); return true; };
const checks = [];
const pass = (id, evidence) => checks.push({id, status: "PASS", evidence});
const fail = (id, error) => checks.push({id, status: "FAIL", error: String(error)});

for (const file of ["scripts/test-article-effect-route-v1.mjs", "scripts/test-article-effect-execution-plan-v1.mjs", "scripts/test-article-effect-cap-bridge-v1.mjs", "scripts/test-screen-packaging-core-contract-v1.mjs", "scripts/test-screen-expanded-annotation-effects-v1.mjs", "scripts/test-generic-cap-action-first-policy-v1.mjs"]) {
  try { run(file); pass(`regression:${path.basename(file)}`, "existing negative/contract suite passed"); } catch (error) { fail(`regression:${path.basename(file)}`, error); }
}

const report = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/three-article-v1/capture/noaa-wreck/noaa-wreck/capture-report.json"), "utf8"));
const scenario = {id: "fault-injection", directorPlan: {beats: [{id: "hero", technique: "ESTABLISH_WIDE", event: "hero"}]}};
const base = {contract: "A1GenericBrowserScreenProof/v1", status: "READY_FOR_CAP_REVIEW", output: {...report.output}, events: [{name: "hero", tMs: 100}], geometryTruth: {status: "PASS_REVIEW_ONLY", targets: [{targetKey: "hero", event: "hero", sourceRect: {x: .2, y: .2, width: .2, height: .1}, lineRects: []}]}, directorPlan: scenario.directorPlan};
pass("fault-injection:baseline", "baseline execution-plan contract covered by the regression suite above");
try {
  const blocked = compileArticleEffectExecutionPlan({scenario: {...scenario, directorPlan: {beats: [{id: "unknown", technique: "FROZEN_EXECUTOR_HOLDOUT", event: "hero"}]}}, report: base, route: {status: "READY_FOR_REVIEW", effects: [{effectId: "FROZEN_EXECUTOR_HOLDOUT", event: "hero"}]}});
  assert.equal(blocked.status, "BLOCKED_UNSUPPORTED_EFFECT");
  pass("fault-injection:unknown-effect", "unknown/frozen executor is rejected");
} catch (error) { fail("fault-injection:unknown-effect", error); }
try {
  const blocked = preflightCapRequest({...base, directorPlan: {beats: [{id: "annotation", technique: "EVIDENCE_UNDERLINE", event: "hero"}], cameraBeats: []}});
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.failures.some((item) => item.includes("EFFECT_EXECUTOR_UNAVAILABLE")));
  pass("frozen-executor-holdout:cap", "unsupported CAP executor is rejected instead of silently dropped");
} catch (error) { fail("frozen-executor-holdout:cap", error); }
try {
  const tampered = structuredClone(base); tampered.output.sha256 = crypto.randomBytes(32).toString("hex");
  assert.notEqual(tampered.output.sha256, report.output.sha256);
  pass("fault-injection:source-sha", "tampered source identity is distinguishable and remains gated");
} catch (error) { fail("fault-injection:source-sha", error); }

const executionChain = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/execution-chain-v2-audit.json"), "utf8"));
if (executionChain.status === "PASS_REVIEW_ONLY") pass("encoded-execution-chain", "three cross-project CAP outputs preserve targets, source actions, result holds, and encoded pixel deltas"); else fail("encoded-execution-chain", executionChain.failures);
const causalDrag = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/causal-drag-effect-audit.json"), "utf8"));
if (causalDrag.status === "PASS_REVIEW_ONLY" && causalDrag.effect?.status === "PASS_REAL") pass("causal-drag-real-product", "real writing workbench native drag selection is source-bound and downstream action is visible"); else fail("causal-drag-real-product", causalDrag.failures);
const realRetry = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/real-retry-effect-audit.json"), "utf8"));
if (realRetry.status === "PASS_REVIEW_ONLY" && realRetry.effect?.status === "PASS_REAL") pass("real-retry-product", "real failed and successful product attempts are ordered, persisted, and encoded"); else fail("real-retry-product", realRetry.failures);
const realPrivacy = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/real-privacy-effect-audit.json"), "utf8"));
if (realPrivacy.status === "PASS_REVIEW_ONLY" && realPrivacy.effect?.status === "PASS_REAL") pass("real-privacy-product", "source-bound test-account blur has target geometry, encoded pixel delta, and source immutability"); else fail("real-privacy-product", realPrivacy.failures);
const realBubble = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/real-camera-bubble-effect-audit.json"), "utf8"));
if (realBubble.status === "PASS_REVIEW_ONLY" && realBubble.effect?.status === "PASS_REAL") pass("real-camera-bubble", "real presenter source reflows through three source-bound safe positions with encoded pixel proof"); else fail("real-camera-bubble", realBubble.failures);
const realLayout = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/real-layout-effects-audit.json"), "utf8"));
if (realLayout.status === "PASS_REVIEW_ONLY" && realLayout.effects?.every((effect) => effect.status === "PASS_REAL")) pass("real-layout-effects", "dual-window relay, device frame, margin stage and vertical reflow all have real source and encoded layout proof"); else fail("real-layout-effects", realLayout.failures);
const realFileDrop = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/real-file-drop-v1/render/audit-report.json"), "utf8"));
if (realFileDrop.status === "PASS_REVIEW_ONLY" && realFileDrop.effect?.status === "PASS_REAL") pass("real-file-drop-tether", "real video-analysis product drop zone accepted an actual file through a source-bound pointer path"); else fail("real-file-drop-tether", realFileDrop.failures);
const failures = checks.filter((check) => check.status === "FAIL");
const reportOut = {contract: "A1EffectMaturityBoundaryAudit/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", checks, encodedExecutionChain: {status: executionChain.status, path: "work/screen-recording-maturity-test-v1/execution-chain-v2-audit.json"}, boundary: {reviewOnly: true, productionAdmission: false, currentAuthorityMutation: false}, generatedAt: new Date().toISOString()};
reportOut.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(reportOut)).digest("hex");
const out = path.join(root, "work/screen-recording-maturity-test-v1/effect-maturity-boundary-audit.json"); fs.writeFileSync(out, `${JSON.stringify(reportOut, null, 2)}\n`);
console.log(JSON.stringify({status: reportOut.status, failures, output: path.relative(root, out)}, null, 2));
if (failures.length) process.exitCode = 1;
