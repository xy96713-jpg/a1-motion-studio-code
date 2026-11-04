#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertInteractionTrace, assertScreenPerformanceIr} from "../apps/studio-next/src/lib/a1-operation-trace-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/operation-traces/ED-02");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sameFile = (left, right) => fs.existsSync(left) && fs.existsSync(right) && sha256(fs.readFileSync(left)) === sha256(fs.readFileSync(right));
const required = ["interaction-trace.json", "screen-performance-ir.json", "operation-orchestration.json", "manifest.json", "audit-report.json"];
const failures = [];
for (const name of required) {
  if (!sameFile(path.join(publicRoot, name), path.join(artifactRoot, name))) failures.push(`public-artifact-parity:${name}`);
}
const trace = fs.existsSync(path.join(publicRoot, "interaction-trace.json")) ? readJson(path.join(publicRoot, "interaction-trace.json")) : null;
const performance = fs.existsSync(path.join(publicRoot, "screen-performance-ir.json")) ? readJson(path.join(publicRoot, "screen-performance-ir.json")) : null;
const orchestration = fs.existsSync(path.join(publicRoot, "operation-orchestration.json")) ? readJson(path.join(publicRoot, "operation-orchestration.json")) : null;
const manifest = fs.existsSync(path.join(publicRoot, "manifest.json")) ? readJson(path.join(publicRoot, "manifest.json")) : null;
if (!trace) failures.push("trace-missing");
if (!performance) failures.push("performance-missing");
if (!orchestration) failures.push("orchestration-missing");
if (!manifest) failures.push("manifest-missing");
if (trace) {
  try { assertInteractionTrace(trace); } catch (error) { failures.push(`trace-invalid:${error.message}`); }
}
if (performance) {
  try { assertScreenPerformanceIr(performance); } catch (error) { failures.push(`performance-invalid:${error.message}`); }
}
const workspace = fs.existsSync(workspacePath) ? readJson(workspacePath) : null;
const operation = workspace?.production?.operationOrchestration;
if (operation?.trace?.sha256 !== trace?.sha256) failures.push("workspace-trace-reference-stale");
if (operation?.performance?.sha256 !== performance?.sha256) failures.push("workspace-performance-reference-stale");
if (operation?.gates?.acceptedShotIrAllowed !== false || operation?.gates?.renderAllowed !== false) failures.push("downstream-gates-open");
if (trace?.source?.adapterId === "browser-replay") {
  if (trace.source.replayable !== true || trace.replayPlan?.status !== "replay-executed" || trace.replayPlan?.selectorDataPresent !== true) failures.push("browser-replay-execution-metadata-missing");
  if (!trace.events.some((event) => event.eventType === "drag" && event.replay?.performance?.pointerVisible === true)) failures.push("visible-pointer-drag-event-missing");
  if (!trace.events.some((event) => event.eventType === "type" && Number(event.replay?.performance?.characterCount) > 0)) failures.push("real-typing-event-missing");
  if (!performance?.pointer?.length || !performance?.textInput?.length) failures.push("interaction-performance-tracks-missing");
} else if (trace?.source?.adapterId !== "video-observation") {
  failures.push("fixture-adapter-unsupported");
}
if (trace && trace.events.some((event) => !event.target?.region || !event.evidence?.framePublicUrl)) failures.push("event-source-binding-missing");
const report = {
  contract: "A1OperationTracePackageAudit/v1",
  status: failures.length ? "BLOCK" : "PASS",
  generatedAt: new Date().toISOString(),
  shotId: trace?.shotId || "ED-02",
  eventCount: trace?.events?.length || 0,
  replayable: trace?.source?.replayable ?? false,
  failures,
  nextAction: failures.length ? "repair-operation-trace-package" : "review-operation-packaging-in-4311",
};
fs.writeFileSync(path.join(publicRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.mkdirSync(artifactRoot, {recursive: true});
fs.writeFileSync(path.join(artifactRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
