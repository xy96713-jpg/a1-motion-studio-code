#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertScreenRunBreathingPlan, compileScreenRunBreathingPlan} from "../apps/studio-next/src/lib/a1-screen-run-breathing-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
if (workspace.production?.authority?.currentStage !== "whole-film-static-board-review" || workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.status !== "PENDING_USER_APPROVAL") throw new Error("screen-run-breathing-static-review-stage-required");
const plan = assertScreenRunBreathingPlan(compileScreenRunBreathingPlan({timelineItems: workspace.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.items}));
const relative = "generated/system-line/editorial-asset-workbench-v1/screen-run-breathing-plan-v1/plan.json";
const publicFile = path.join(root, "apps/studio-next/public", relative);
const artifactFile = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/screen-run-breathing-plan-v1/plan.json");
const bytes = `${JSON.stringify(plan, null, 2)}\n`;
fs.mkdirSync(path.dirname(publicFile), {recursive: true}); fs.writeFileSync(publicFile, bytes);
fs.mkdirSync(path.dirname(artifactFile), {recursive: true}); fs.writeFileSync(artifactFile, bytes);
console.log(JSON.stringify({status: "PASS", planSha256: plan.planSha256, resetCount: plan.resets.length, resets: plan.resets, assemblyCreated: false, motionRendered: false}, null, 2));
