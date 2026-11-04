#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {compileAcceptedShotDesignToMotionIr} from "../apps/studio-next/src/lib/a1-accepted-shot-design-v1.ts";

const root = process.cwd();
const board = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/accepted-shot-six-slice-v1/candidate-board.json"), "utf8"));
const failures = [];
if (board.shots.length !== 6) failures.push("six-shots-required");
if (new Set(board.shots.map((shot) => shot.adapterId)).size !== 6) failures.push("six-distinct-adapters-required");
let blocked = false;
try { compileAcceptedShotDesignToMotionIr(board.shots[0].candidates[0].acceptedShotDesign); } catch (error) { blocked = String(error).includes("review-required"); }
if (!blocked) failures.push("pending-design-was-not-blocked-from-motion-ir");
const output = {contract: "A1AcceptedShotSixSliceTest/v1", status: failures.length ? "FAIL" : "PASS", failures, pendingDesignBlocked: blocked, dynamicPrototypeAllowed: false, h47ExpansionAllowed: false};
console.log(JSON.stringify(output, null, 2));
if (failures.length) process.exitCode = 1;
