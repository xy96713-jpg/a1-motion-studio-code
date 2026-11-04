#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "scripts/native-input/A1NativeInputAdapter.swift");
const outputRoot = path.join(root, ".codex-artifacts/system-progress/cap-native-input-adapter-v1");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-native-input-"));
const binary = path.join(tempRoot, "a1-native-input");
const expectedFrontmostBundleId = "com.google.Chrome";

const fixtures = [
  {
    id: "rewrite-selection-flow",
    genre: "sentence-rewrite",
    steps: [
      {id: "move-to-sentence", type: "move", atMs: 0, x: 620, y: 410, durationMs: 280},
      {id: "double-click-sentence", type: "click", atMs: 320, x: 620, y: 410, button: "left", clickCount: 2},
      {id: "move-to-rewrite", type: "move", atMs: 620, x: 760, y: 520, durationMs: 220},
      {id: "run-rewrite", type: "click", atMs: 880, x: 760, y: 520, button: "left", clickCount: 1},
      {id: "result-hold", type: "wait", atMs: 1500},
    ],
  },
  {
    id: "preference-classification-flow",
    genre: "style-preference",
    steps: [
      {id: "move-to-positive-line", type: "move", atMs: 0, x: 590, y: 380, durationMs: 260},
      {id: "select-positive-line", type: "click", atMs: 300, x: 590, y: 380, button: "left", clickCount: 2},
      {id: "like-line", type: "click", atMs: 700, x: 820, y: 500, button: "left", clickCount: 1},
      {id: "move-to-negative-line", type: "move", atMs: 1100, x: 610, y: 610, durationMs: 280},
      {id: "select-negative-line", type: "click", atMs: 1420, x: 610, y: 610, button: "left", clickCount: 2},
      {id: "dislike-line", type: "click", atMs: 1820, x: 900, y: 500, button: "left", clickCount: 1},
    ],
  },
  {
    id: "paragraph-request-flow",
    genre: "contextual-expansion",
    steps: [
      {id: "move-to-paragraph-gap", type: "move", atMs: 0, x: 640, y: 560, durationMs: 320},
      {id: "open-paragraph-request", type: "click", atMs: 360, x: 640, y: 560, button: "left", clickCount: 2},
      {id: "type-request", type: "text", atMs: 820, text: "补一个具体例子，保留上下文语气。"},
      {id: "submit-request", type: "key", atMs: 1450, keyCode: 36, modifiers: []},
      {id: "candidate-hold", type: "wait", atMs: 2200},
    ],
  },
];

fs.mkdirSync(outputRoot, {recursive: true});
execFileSync("swiftc", ["-parse-as-library", source, "-o", binary, "-framework", "AppKit", "-framework", "ApplicationServices"], {stdio: "pipe"});

const results = [];
for (const fixture of fixtures) {
  const planPath = path.join(tempRoot, `${fixture.id}.json`);
  const reportPath = path.join(tempRoot, `${fixture.id}-report.json`);
  fs.writeFileSync(planPath, `${JSON.stringify({contract: "A1NativeInputPlan/v1", planId: fixture.id, expectedFrontmostBundleId, steps: fixture.steps}, null, 2)}\n`);
  execFileSync(binary, ["--plan", planPath, "--report", reportPath], {stdio: "pipe"});
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const failures = [];
  if (report.status !== "PASS") failures.push("report-not-pass");
  if (report.mode !== "DRY_RUN") failures.push("unexpected-execution-mode");
  if (report.steps.length !== fixture.steps.length) failures.push("step-count-drift");
  if (report.steps.some((step) => step.status !== "VALIDATED")) failures.push("step-not-dry-run-validated");
  results.push({id: fixture.id, genre: fixture.genre, status: failures.length ? "FAIL" : "PASS", stepCount: report.steps.length, failures, trace: report.steps});
}

const failures = results.flatMap((fixture) => fixture.failures.map((failure) => `${fixture.id}:${failure}`));
const result = {
  contract: "A1NativeInputAdapterAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  mode: "DRY_RUN_ONLY_NO_UI_SIDE_EFFECTS",
  compiler: "swiftc",
  fixtures: results,
  failures,
};
fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
const markdown = [
  "# Cap native input adapter action trace",
  "",
  "Verification mode: `DRY_RUN_ONLY_NO_UI_SIDE_EFFECTS`",
  "",
  ...results.flatMap((fixture) => [
    `## ${fixture.id}`,
    "",
    `Genre: ${fixture.genre}; status: ${fixture.status}; steps: ${fixture.stepCount}`,
    "",
    ...fixture.trace.map((step) => `- ${step.atMs}ms · ${step.id} · ${step.type} · ${step.detail}`),
    "",
  ]),
].join("\n");
fs.writeFileSync(path.join(outputRoot, "action-trace.md"), `${markdown}\n`);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
