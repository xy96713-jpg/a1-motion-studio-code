#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileScreenFilmProgram} from "../apps/studio-next/src/lib/a1-screen-film-compiler-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(root, "work/cross-project-screen-validation-v1/englishflow-geometry-truth-v2/capture-report.json");
const outDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/clean-source-screen-demo-v3");
const outputPath = path.join(outDir, "screen-film-program.json");
const captureReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const beatMap = [
  {id: "establish", function: "ESTABLISH", startMs: 0, endMs: 1200, viewerQuestion: "What surface is this?", sourceAlreadyClear: true},
  {id: "mission", function: "ACTION", startMs: 1200, endMs: 3800, targetKey: "mission_handoff", viewerQuestion: "What starts the flow?", targetSmall: false, sourceAlreadyClear: true},
  {id: "answer", function: "FEEDBACK", startMs: 3800, endMs: 4750, targetKey: "answer_select", viewerQuestion: "What changed?", targetSmall: true, sourceAlreadyClear: true},
  {id: "decision", function: "DECISION", startMs: 4750, endMs: 5580, targetKey: "answer_submit", viewerQuestion: "What commits the decision?", targetSmall: true, sourceAlreadyClear: true},
  {id: "result", function: "RESULT", startMs: 5580, endMs: 8500, targetKey: "result_hold", viewerQuestion: "What is the resulting state?", resultNeedsReading: true, sourceAlreadyClear: false},
];
const program = compileScreenFilmProgram({captureReport, beatMap, allowSyntheticCursor: false});
if (program.status !== "PASS_REVIEW_ONLY") throw new Error(`screen-film-program-blocked:${program.failures.join(",")}`);
fs.mkdirSync(outDir, {recursive: true});
program.generatedAt = new Date().toISOString();
program.programSha256 = crypto.createHash("sha256").update(JSON.stringify(program)).digest("hex");
fs.writeFileSync(outputPath, `${JSON.stringify(program, null, 2)}\n`);
console.log(JSON.stringify({...program, outputPath: path.relative(root, outputPath)}, null, 2));
