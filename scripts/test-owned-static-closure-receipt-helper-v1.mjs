import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import {snapshotOwnedStaticProcessesV1, evaluateOwnedStaticClosureV1, publishOwnedStaticReceiptV1}
  from "../work/module-development-launch-v1/integration/system-consumer-batch-20261002-v1/owned-static-closure-receipt-helper-v1.mjs";
import {observeCaptureOwnedProcessesV1, remainingCaptureOwnedProcessesV1}
  from "../work/module-development-launch-v1/integration/system-consumer-batch-20261002-v1/run-normal-capture-once-v1.mjs";

const originalNow = Date.now, checks = [], check = (name, run) => {run(); checks.push(name);};
let clock = 0; Date.now = () => clock;
const liveText = "123 101 123 Sat Oct  3 11:00:00 2026 /node\n500 1 500 Sat Oct  3 10:00:00 2026 /other\n";
const closedText = "500 1 500 Sat Oct  3 10:00:00 2026 /other\n";
const snapshot = (text, completion = clock) => snapshotOwnedStaticProcessesV1(29000, () => {clock = completion; return text;});
try {
  const live = snapshot(liveText), known = [live.find((row) => row.pid === 123)];
  check("nonempty-incumbent-numeric-snapshot", () => assert.equal(live.length, 2));
  for (const text of ["", " \n\t"]) check("empty-or-whitespace-ps-rejected", () => assert.throws(() => snapshot(text), /EMPTY/));
  check("snapshot-completion-deadline-rejected", () => assert.throws(() => snapshot(closedText, 29000), /DEADLINE/));
  clock = 29000;
  check("snapshot-at-deadline-does-not-invoke-ps", () => {
    let called = false; assert.throws(() => snapshotOwnedStaticProcessesV1(29000, () => {called = true; return closedText;}), /DEADLINE/); assert.equal(called, false);
  });
  clock = 0; const closed = snapshot(closedText);
  check("normal-seed-empty-normal-sticky-error", () => {
    let error = null; try {snapshot("");} catch (e) {error ||= e.message;}
    assert.equal(evaluateOwnedStaticClosureV1(known, snapshot(closedText), error).closed, false);
  });
  check("empty-final-closure-is-unknown", () => assert.equal(evaluateOwnedStaticClosureV1(known, [], null).closed, false));
  check("numeric-owned-process-still-live", () => assert.equal(evaluateOwnedStaticClosureV1(known, live, null).closed, false));
  check("numeric-closed-positive", () => assert.equal(evaluateOwnedStaticClosureV1(known, closed, null).closed, true));
  function publish(initial, afterWrites = [], error = null, closure = {closed: true}, nativeClosed = true, readyPixels = true) {
    clock = initial; const writes = [];
    const result = publishOwnedStaticReceiptV1({base: {ownedProcessClosed: closure.closed}, started: 0, hard: 30000,
      maximumExecutionMs: 30000, error, closure, nativeClosed, readyPixels, successStatus: "PASS_UI_CLOSED_PENDING_SCREENSHOT_REVIEW",
      write: (receipt) => {writes.push(structuredClone(receipt)); clock = afterWrites[writes.length - 1] ?? clock;}});
    return {...result, writes};
  }
  for (const ms of [29999, 30000, 30001]) check("publication-boundary-" + ms, () => {
    const result = publish(ms); assert.equal(result.exitCode, ms < 30000 ? 0 : 2); assert.equal(result.writes[0].status, "FAILED");
    assert.equal(result.receipt.status === "FAILED", ms >= 30000); assert.equal(result.elapsedMs, ms);
  });
  check("pending-write-crosses-hard-deadline", () => {const result = publish(29400, [30001]); assert.equal(result.exitCode, 2); assert.equal(result.receipt.status, "FAILED");});
  check("final-success-write-crosses-hard-deadline", () => {
    const result = publish(29998, [29999, 30001]); assert.equal(result.writes[1].status, "PASS_UI_CLOSED_PENDING_SCREENSHOT_REVIEW");
    assert.equal(result.writes[2].status, "FAILED"); assert.equal(result.receipt.elapsedMs, 30001); assert.equal(result.exitCode, 2);
  });
  check("earlier-error-survives-write-overrun", () => {
    const result = publish(29400, [30001], "ORIGINAL_WORKER_ERROR"); assert.equal(result.error, "ORIGINAL_WORKER_ERROR");
    assert.equal(result.deadlineError, "TOTAL_DEADLINE_EXPIRED"); assert.equal(result.exitCode, 2);
  });
  check("unknown-closure-cannot-publish-pass", () => assert.equal(publish(100, [], null, {closed: false}).exitCode, 2));
  check("open-browser-cannot-publish-pass", () => assert.equal(publish(100, [], null, {closed: true}, false).exitCode, 2));
  check("missing-decode-proof-cannot-publish-pass", () => assert.equal(publish(100, [], null, {closed: true}, true, false).exitCode, 2));

  // Exercise the UI's ordinary main, not a copied implementation, with fake ps/fs.
  const wrapper = path.resolve("work/hupo-69-shot-reconstruction-v1/current-static-candidate-index-integration-v1/run-owned-workbench-static-ui-once-v1.mjs");
  const source = fs.readFileSync(wrapper, "utf8"), main = source.slice(source.indexOf("async function main()"), source.lastIndexOf("if (process.argv[1]"));
  async function ordinary({emptyAt = -1, pending = 100, final = pending, workerError = null} = {}) {
    clock = 0; const store = new Map(), writes = []; let live = false, monitor, psCalls = 0;
    const here = "/fixture", out = "/fixture/actual-ui-sha";
    const ctx = {here, repo: here, path, json: (value) => JSON.stringify(value), must: (v, m) => {if (!v) throw Error(m);},
      read: (p) => JSON.parse(store.get(p)), validateWorkbenchStaticUIPhaseV1: () => ({phase: {readyPath: "/ready", readySHA: "ready", reservationEndUTC: new Date(30000).toISOString()}, ready: {nodePath: "/node", harnessPath: "/worker", ownerThreadId: "writer"}}),
      fs: {mkdirSync() {}, existsSync: (p) => store.has(p), writeFileSync: (p, bytes) => {store.set(p, bytes);
        if (p.endsWith("wrapper-receipt.json")) {writes.push(JSON.parse(bytes)); clock = writes.length === 1 ? pending : final;}}},
      process: {argv: ["node", wrapper, "execute", "phase", "sha"], pid: 101, uptime: () => 0, env: {}, exitCode: 0,
        kill() {throw Error("UNEXPECTED_SIGNAL");}},
      Date: class extends Date {static now() {return clock;}}, setInterval: (fn) => {monitor = fn; return 1;}, clearInterval() {},
      setTimeout() {throw Error("UNEXPECTED_WAIT");}, console: {log() {}},
      execFileSync: () => {psCalls++; return psCalls === emptyAt ? "" : live ? liveText : closedText;},
      snapshotOwnedStaticProcessesV1, evaluateOwnedStaticClosureV1, publishOwnedStaticReceiptV1, observeCaptureOwnedProcessesV1, remainingCaptureOwnedProcessesV1,
      runBoundedProcessGroup: async () => {
        store.set(out + "/worker-start.json", JSON.stringify({pid: 123, parentPid: 101, phaseSHA: "sha"})); live = true; monitor(); live = false;
        store.set(out + "/workbench-visible-receipt.json", JSON.stringify({status: "PASS_FIVE_SHOTS_NINE_CANDIDATES_FOUR_REFERENCES_DECODED", browserClosed: true}));
        if (workerError) throw Error(workerError); return {stdout: "", stderr: ""};
      }};
    await vm.runInNewContext(main + "\nmain()", ctx);
    return {receipt: JSON.parse(store.get(out + "/wrapper-receipt.json")), exitCode: ctx.process.exitCode, writes};
  }
  for (const ms of [29999, 30000]) {const result = await ordinary({pending: ms, final: ms});
    assert.equal(result.exitCode, ms < 30000 ? 0 : 2); assert.equal(result.writes[0].status, "FAILED"); checks.push("ordinary-UI-main-publication-" + ms);}
  for (const emptyAt of [2, 3]) {const result = await ordinary({emptyAt}); assert.equal(result.exitCode, 2);
    assert.equal(result.receipt.ownedProcessClosed, false); checks.push("ordinary-UI-main-empty-snapshot-" + emptyAt);}
  const crossed = await ordinary({pending: 29999, final: 30001}); assert.equal(crossed.exitCode, 2);
  assert.equal(crossed.receipt.status, "FAILED"); checks.push("ordinary-UI-main-final-write-crossing");
  const original = await ordinary({pending: 30001, workerError: "ORIGINAL_WORKER_ERROR"}); assert.equal(original.receipt.error, "ORIGINAL_WORKER_ERROR");
  assert.equal(original.receipt.deadlineError, "TOTAL_DEADLINE_EXPIRED"); checks.push("ordinary-UI-main-earlier-error-preserved");
  console.log(JSON.stringify({status: "PASS_SHARED_CLOSURE_DEADLINE_AND_ORDINARY_UI_MAIN", checks, count: checks.length,
    actualPS: 0, actualSignals: 0, browsers: 0, claims: 0, actualRaster: 0}, null, 2));
} finally {Date.now = originalNow;}
