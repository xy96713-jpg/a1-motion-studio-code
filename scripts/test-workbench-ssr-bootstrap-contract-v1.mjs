#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "apps/studio-next/package.json"));
const ts = require("typescript");
// Execute the actual TS route/page, replacing only Next transport/JSX boundaries.
function load(relative, mocks, globals = {}) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  const exports = {};
  vm.runInNewContext(output, {exports, URL, ...globals, require: (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    throw new Error(`unexpected-bootstrap-dependency:${id}`);
  }}, {filename: file});
  return exports;
}
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "a1-ssr-bootstrap-"));
try {
  const publicDir = path.join(fixture, "public/generated/system-line/editorial-asset-workbench-v1");
  fs.mkdirSync(publicDir, {recursive: true});
  const bootstrapPath = path.join(publicDir, "client-bootstrap.json");
  const receiptPath = path.join(publicDir, "transition-receipt.json");
  const appRoot = path.join(fixture, "apps/studio-next");
  const taskId = "fixture-research-task";
  const taskRoot = path.join(fixture, "work", taskId);
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  fs.mkdirSync(path.join(fixture, ".codex-artifacts/system-progress"), {recursive: true});
  fs.mkdirSync(path.join(fixture, ".codex-artifacts/system-progress-system-line"), {recursive: true});
  fs.mkdirSync(path.join(taskRoot, "runtime"), {recursive: true});
  fs.mkdirSync(appRoot, {recursive: true});
  write(path.join(fixture, "work/system-maturity-consolidation-park-a-line-20260928.json"), {activeLine: {
    planPath: `work/${taskId}/shot-task-plan-v1.json`,
    runtimeStatePath: `work/${taskId}/runtime/node-workflow-v1.json`,
  }});
  write(path.join(fixture, ".codex-artifacts/system-progress/current-phase.json"), {});
  write(path.join(fixture, ".codex-artifacts/system-progress-system-line/current-phase.json"), {});
  write(path.join(taskRoot, "shot-task-plan-v1.json"), {});
  write(path.join(taskRoot, "runtime/node-workflow-v1.json"), {});
  const workspace = {contract: "A1EditorialAssetWorkbench/v2", production: {authority: {nextAction: {id: "fixture-current-review"}}}};
  const bootstrap = {contract: "A1EditorialWorkbenchClientBootstrap/v1", snapshotKind: "PACKAGING_ONLY", workspaceSha256: "a".repeat(64), workspace};
  const receipt = {contract: "A1ProductionTransitionReceipt/v1", workspaceSha256: bootstrap.workspaceSha256, transitionSha256: "b".repeat(64)};
  write(bootstrapPath, bootstrap);
  write(receiptPath, receipt);
  // Any accidental full-workspace parse would fail this test.
  fs.writeFileSync(path.join(publicDir, "workspace.json"), "not JSON");
  const route = load("apps/studio-next/src/app/api/system-line/editorial-asset-workbench/route.ts", {
    "node:fs": fs, "node:path": path,
    "next/server": {NextResponse: {
      json: (payload, init = {}) => ({ok: (init.status ?? 200) < 400, status: init.status ?? 200, headers: init.headers, json: async () => payload}),
      redirect: (url, status) => ({url: String(url), status}),
    }},
  }, {process: {cwd: () => fixture}});
  const get = (mode) => route.GET({url: `https://fixture.invalid/api/system-line/editorial-asset-workbench?mode=${mode}`});
  const Client = () => {};
  const Shell = () => {};
  let calls = 0;
  let fetchResponse = () => get("bootstrap");
  const page = load("apps/studio-next/src/app/system-line-visual-workbench/page.tsx", {
    "node:fs": fs,
    "node:path": path,
    "@/lib/a1-active-work-selection-v1.mjs": {resolveActiveWorkSelectionV1: ({planExists, runtimeExists}) => ({
      status: planExists && runtimeExists ? "PASS" : "BLOCKED",
      active: planExists && runtimeExists ? {taskId} : null,
    })},
    "./StoryboardWorkbenchShell": {StoryboardWorkbenchShell: Shell},
    "next/headers": {headers: async () => new Map([["host", "fixture.invalid"], ["x-forwarded-proto", "https"]])},
    "./VisualAssetWorkbenchClient": {VisualAssetWorkbenchClient: Client},
    "react/jsx-runtime": {
      jsx: (type, props) => ({type, props}),
      jsxs: (type, props) => ({type, props}),
    },
  }, {fetch: async (url, options) => {
    calls++;
    assert.equal(url, "https://fixture.invalid/api/system-line/editorial-asset-workbench?mode=bootstrap");
    assert.equal(options.cache, "no-store");
    return fetchResponse();
  }, process: {cwd: () => appRoot}});
  assert.equal(page.dynamic, "force-dynamic");
  const current = await page.default({searchParams: Promise.resolve({})});
  assert.equal(current.type, Shell);
  assert.equal(current.props.taskId, taskId);
  assert.equal(current.props.history, false);
  assert.equal(calls, 0, "current project shell must not fetch the parked workspace bootstrap");
  const renderHistory = () => page.default({searchParams: Promise.resolve({history: "1", view: "shots"})});
  const rendered = await renderHistory();
  assert.equal(rendered.type, Client);
  assert.deepEqual(structuredClone(rendered.props.initialWorkspace), workspace);
  assert.equal(calls, 1, "SSR must fetch initial authority, not silently render null");
  const response = await get("bootstrap");
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal((await response.json()).transitionSha256, receipt.transitionSha256);
  const oldClient = await get("client");
  assert.equal(oldClient.status, 410);
  assert.equal((await oldClient.json()).error, "client-mode-removed");
  for (const mode of ["", "full", "history"]) {
    const payload = await (await get(mode)).json();
    assert.equal(payload.modeWasDefaulted, true);
    assert.equal(payload.workspace, undefined);
  }
  for (const bad of [
    {...bootstrap, workspaceSha256: "c".repeat(64)},
    {...bootstrap, contract: "historical-contract"},
    {...bootstrap, snapshotKind: "FULL"},
    {...bootstrap, workspace: null},
  ]) {
    write(bootstrapPath, bad);
    const rejected = await get("bootstrap");
    assert.equal(rejected.status, 503);
    assert.equal((await rejected.json()).error, "workbench-bootstrap-stale");
    assert.equal((await renderHistory()).props.initialWorkspace, null);
  }
  write(bootstrapPath, bootstrap);
  fs.rmSync(receiptPath);
  assert.equal((await (await get("bootstrap")).json()).error, "workbench-bootstrap-missing");
  assert.equal((await renderHistory()).props.initialWorkspace, null);
  write(receiptPath, receipt);
  for (const payload of [{ok: false, workspace}, {ok: true}]) {
    fetchResponse = async () => ({ok: true, json: async () => payload});
    assert.equal((await renderHistory()).props.initialWorkspace, null);
  }
  fetchResponse = async () => {throw new Error("offline");};
  assert.equal((await renderHistory()).props.initialWorkspace, null);
  fetchResponse = () => get("bootstrap");
  assert.deepEqual(structuredClone((await renderHistory()).props.initialWorkspace), workspace);
} finally {
  fs.rmSync(fixture, {recursive: true, force: true});
}
console.log(JSON.stringify({status: "PASS", contract: "A1WorkbenchSSRBootstrapContractTest/v1", actualRouteAndPageExecuted: true, staleBootstrapRejected: true, historicalClientRejected: true}));
