#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describeCapExecutedEffects} from "./lib/cap-execution-readback.mjs";
import {evaluateReadingWindows, inspectEvidenceBindings, screenScopeFindings, shaFile, summarizeFindings, validateCapScreenProvenance, writeAudit} from "./lib/screen-validation-evidence-v1.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-screen-evidence-test-"));
let count = 0;
const test = (name, callback) => {callback(); count++; console.log(`PASS ${name}`);};
const save = (file, value) => fs.writeFileSync(path.join(root, file), typeof value === "string" ? value : JSON.stringify(value));
const ref = (file) => ({path: file, sha256: shaFile(path.join(root, file))});
try {
  test("failure is not masked by no OPEN findings", () => assert.equal(summarizeFindings([{status: "FAIL"}]).status, "FAIL"));
  for (const status of ["MITIGATED_PARTIAL", "MITIGATED", "UNKNOWN", "PASS_REVIEW_ONLY_WITH_BOUNDARIES", "BLOCKED_REQUIRED_EVIDENCE", "NOT_IMPLEMENTED"]) {
    test(`${status} remains unresolved`, () => assert.equal(summarizeFindings([{status}]).status, "INCOMPLETE"));
  }
  test("policy exclusions require a reason", () => {
    assert.equal(summarizeFindings([{status: "POLICY_DISABLED"}]).status, "INCOMPLETE");
    assert.equal(summarizeFindings([{status: "POLICY_DISABLED", reason: "typing must preserve original speed"}]).status, "PASS_REVIEW_ONLY");
  });
  test("production lock cannot block or grant capability acceptance", () => {
    assert.equal(summarizeFindings([{status: "LOCKED", severity: "BOUNDARY"}]).status, "PASS_REVIEW_ONLY");
    assert.equal(summarizeFindings([{status: "LOCKED"}]).status, "INCOMPLETE");
    assert.equal(summarizeFindings([{status: "PASS"}]).maturityProven, false);
  });
  test("real current dependency passes", () => {
    save("capture.json", {status: "PASS"}); save("receipt.json", {source: ref("capture.json")});
    assert.equal(inspectEvidenceBindings(root, {receipt: ref("receipt.json")}).status, "PASS");
  });
  test("new wrapper hash cannot launder stale leaf evidence", () => {
    save("capture.json", {status: "FAIL"});
    assert.ok(inspectEvidenceBindings(root, {receipt: ref("receipt.json")}).failures.some((row) => row.id === "EVIDENCE_SHA_CHANGED"));
  });
  test("missing SHA, missing file and path escape fail closed", () => {
    assert.equal(inspectEvidenceBindings(root, {video: {path: "missing.mp4"}}).status, "FAIL");
    assert.equal(inspectEvidenceBindings(root, {path: "missing.json", sha256: "0".repeat(64)}).status, "FAIL");
    assert.equal(inspectEvidenceBindings(root, {path: import.meta.filename, sha256: shaFile(import.meta.filename)}).status, "FAIL");
  });
  test("input changed during audit cannot publish", () => {
    const input = ref("capture.json"); save("capture.json", {changed: true});
    assert.throws(() => writeAudit(root, "output.json", {status: "PASS"}, [input]), /INPUT_CHANGED_DURING_AUDIT/u);
    assert.equal(fs.existsSync(path.join(root, "output.json")), false);
  });
  test("idempotent audit does not rewrite unchanged evidence", () => {
    writeAudit(root, "stable.json", {status: "INCOMPLETE"}); const before = fs.statSync(path.join(root, "stable.json")).mtimeMs;
    writeAudit(root, "stable.json", {status: "INCOMPLETE"}); assert.equal(fs.statSync(path.join(root, "stable.json")).mtimeMs, before);
  });
  test("silent animation and presenter are rejected as screen deliverables", () => {
    assert.equal(summarizeFindings(screenScopeFindings({kind: "LAYERED_ANIMATION"})).status, "FAIL");
    assert.equal(summarizeFindings(screenScopeFindings({kind: "REAL_SCREEN_CAPTURE", presenter: true})).status, "FAIL");
    assert.equal(summarizeFindings(screenScopeFindings({kind: "REAL_SCREEN_CAPTURE", formalFilmMutation: true})).status, "FAIL");
  });
  test("missing provenance is incomplete, never inferred from silence", () => assert.notEqual(validateCapScreenProvenance(root, {}, "silent.mp4").status, "PASS_REVIEW_ONLY"));
  test("focus mask is independent from camera suppression and must match its target", () => {
    const report = {directorPlan: {beats: [{id: "focus", technique: "FOCUS_DIM", event: "result", startMs: 1000, endMs: 2000}]}, geometryTruth: {targets: [{targetKey: "result", sourceRect: {x: .2, y: .3, width: .4, height: .1}}]}};
    const config = {timeline: {maskSegments: [{enabled: true, maskType: "highlight", start: 1, end: 2, center: {x: .4, y: .35}, size: {x: .4, y: .1}}]}};
    assert.equal(describeCapExecutedEffects(report, config, {actionFirstCameraSuppressed: true})[0].execution, "CAP_MASK_EXECUTED");
    config.timeline.maskSegments[0].center.x = .8;
    assert.equal(describeCapExecutedEffects(report, config, {actionFirstCameraSuppressed: true})[0].execution, "UNAVAILABLE");
  });
  const reading = {
    durationMs: 3000, windows: [{id: "result", startMs: 1000, endMs: 2000, expectedText: "Saved"}],
    samples: [1000, 1500, 2000].map((atMs) => ({windowId: "result", atMs, textHeightPx: 22, exactTextVisible: true, clipped: false, cameraSettled: true, frame: {path: "frame.png", sha256: "a".repeat(64)}, ocr: {path: "ocr.json", sha256: "b".repeat(64)}})),
  };
  test("complete reading window can pass its temporal check", () => assert.deepEqual(evaluateReadingWindows(reading), []));
  test("large text at peak zoom cannot hide small reading text", () => {
    const input = structuredClone(reading); input.samples[0].textHeightPx = 10;
    assert.equal(summarizeFindings(evaluateReadingWindows(input)).status, "FAIL");
  });
  test("missing intervals and premature camera movement fail", () => {
    assert.equal(summarizeFindings(evaluateReadingWindows({...reading, samples: reading.samples.slice(1)})).status, "INCOMPLETE");
    const input = structuredClone(reading); input.samples[1].cameraSettled = false;
    assert.equal(summarizeFindings(evaluateReadingWindows(input)).status, "FAIL");
  });
  test("NaN and absent text do not vacuously pass", () => {
    assert.notEqual(summarizeFindings(evaluateReadingWindows({...reading, durationMs: NaN})).status, "PASS_REVIEW_ONLY");
    const input = structuredClone(reading); input.samples[1].textHeightPx = null;
    assert.equal(summarizeFindings(evaluateReadingWindows(input)).status, "FAIL");
  });
  console.log(JSON.stringify({status: "PASS", tests: count, scope: "VALIDATOR_FAULT_INJECTION_ONLY", productionAdmission: false}));
} finally {fs.rmSync(root, {recursive: true, force: true});}
