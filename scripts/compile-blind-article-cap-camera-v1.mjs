#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {preflightCapRequest} from "./lib/cap-request-preflight.mjs";

const root = path.resolve(import.meta.dirname, "..");
const scenarioId = process.argv[2] || "blind-nasa-ocean-v2";
if (!/^[a-z0-9][a-z0-9._-]*$/u.test(scenarioId)) throw new Error("blind-scenario-id-must-be-path-safe");
const work = path.join(root, "work/screen-recording-maturity-test-v1/blind-test-v1");
const scenarioPath = path.join(work, `${scenarioId}-scenario.json`);
const capturePath = path.join(work, `capture/${scenarioId}/capture-report.json`);
const outputPath = path.join(work, `render/${scenarioId}/cap-camera-input-report.json`);
const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
const source = JSON.parse(fs.readFileSync(capturePath, "utf8"));
if (source.scenarioSha256 !== crypto.createHash("sha256").update(JSON.stringify(scenario)).digest("hex") || source.status !== "READY_FOR_CAP_REVIEW") throw new Error("blind-cap-source-scenario-mismatch");
const targets = new Map(source.geometryTruth.targets.map((target) => [target.targetKey, target]));
const scrollOperations = scenario.operations.filter((operation) => operation.type === "scroll").sort((a, b) => a.atMs - b.atMs);
const cameraBeats = scrollOperations.map((operation, index) => {
  const target = targets.get(operation.name);
  const settled = source.events.find((event) => event.name === `${operation.name}-scroll-settled`);
  const nextStart = scrollOperations[index + 1]?.atMs ?? source.output.durationMs;
  if (!target || !settled || target.observedAtMs < settled.tMs) throw new Error(`blind-cap-target-or-event-missing:${operation.name}`);
  const startMs = Math.round(target.observedAtMs + 250);
  const endMs = Math.round(Math.min(nextStart - 900, source.output.durationMs - 350));
  if (endMs - startMs < 900) throw new Error(`blind-cap-hold-too-short:${operation.name}`);
  return {id: operation.name, targetEvent: operation.name, startMs, endMs, amount: operation.targetKind === "REGION" ? 1.18 : 1.16, glideDirection: "none", glideSpeed: 0.4};
});
const report = structuredClone(source);
report.directorPlan = {
  contract: "A1ScreenDirectorBrain/v1",
  sequence: "AUTO_DISCOVERED_ARTICLE_CAP_CAMERA",
  autoDiscovered: true,
  beats: [scenario.directorPlan.beats.find((beat) => beat.id === "hero"), ...scrollOperations.map((operation) => ({id: operation.name, technique: "SEMANTIC_PUSH", event: operation.name}))],
  cameraBeats,
  diagnosticEffectsNotExecutedInCap: scenario.directorPlan.beats.filter((beat) => !["ESTABLISH_WIDE", "SEMANTIC_PUSH"].includes(beat.technique)).map((beat) => beat.technique),
  sourceDirectorPlanSha256: crypto.createHash("sha256").update(JSON.stringify(scenario.directorPlan)).digest("hex"),
};
report.derivedFromCapture = {path: path.relative(root, capturePath), sha256: crypto.createHash("sha256").update(fs.readFileSync(capturePath)).digest("hex"), scope: "CAP_CAMERA_ONLY_REVIEW"};
delete report.reportSha256;
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
const preflight = preflightCapRequest(report);
if (preflight.status !== "READY_FOR_PARAMETER_COMPILATION") throw new Error(`blind-cap-preflight:${preflight.failures.join(",")}`);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: "READY_FOR_CAP_CAMERA_REVIEW", output: path.relative(root, outputPath), cameraBeats, notExecuted: report.directorPlan.diagnosticEffectsNotExecutedInCap}));
