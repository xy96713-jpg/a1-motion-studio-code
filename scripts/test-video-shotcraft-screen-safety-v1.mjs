#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {classifyVideoShotcraftCatalog,resolveVideoShotcraftScreenPostAdaptation,VIDEO_SHOTCRAFT_SCREEN_SCOPES} from "../apps/studio-next/src/lib/a1-video-shotcraft-screen-safety-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const catalog=JSON.parse(fs.readFileSync(path.join(root,"apps/studio-next/src/data/video-shotcraft-catalog-v1.json"),"utf8"));
const safety=classifyVideoShotcraftCatalog(catalog);
assert.equal(safety.styleCount,catalog.stats.styleCount);
assert.equal(safety.styles.length,214);
assert.ok(Object.values(VIDEO_SHOTCRAFT_SCREEN_SCOPES).every((scope)=>Number.isInteger(safety.counts[scope])));
assert.equal(safety.styles.find((item)=>item.identity==="tension-camera-moves/slow-push-in")?.scope,"SCREEN_POST_SAFE");
assert.equal(safety.styles.find((item)=>item.identity==="input-trigger-moves/cursor-performance")?.scope,"SCREEN_POST_SAFE");
assert.equal(safety.styles.find((item)=>item.identity==="ai-stream-response/ai-stream-response")?.scope,"SCREEN_BEHAVIOR_FORBIDDEN");
assert.equal(safety.styles.find((item)=>item.identity==="document-typewriter-reveal/document-typewriter-reveal")?.scope,"SCREEN_BEHAVIOR_FORBIDDEN");
assert.equal(safety.styles.find((item)=>item.identity==="transition-hidden-cut/invisible-cut")?.scope,"SHOT_BOUNDARY_ONLY");
const evidence={realSurface:true,highDpi:true,targetGeometry:true,cursorTelemetry:true,clickTelemetry:true,beforeAfterStates:true,verifiedCutBoundary:true};
const click=resolveVideoShotcraftScreenPostAdaptation(catalog,"single-click-trigger",evidence);assert.equal(click.status,"READY");assert.equal(click.recipe.id,"input-trigger-moves");assert.equal(click.recipe.styleKey,"cursor-performance");
const stream=resolveVideoShotcraftScreenPostAdaptation(catalog,"ai-stream-response",evidence);assert.equal(stream.status,"READY");assert.equal(stream.recipe.id,"tension-camera-moves");assert.equal(stream.recipe.styleKey,"slow-push-in");
const compare=resolveVideoShotcraftScreenPostAdaptation(catalog,"before-after-comparison",evidence);assert.equal(compare.status,"READY");assert.equal(compare.recipe.id,"tension-camera-moves");assert.equal(compare.recipe.styleKey,"slow-push-in");assert.equal(compare.runtimeBinding.status,"RUNTIME_READY");
const blocked=resolveVideoShotcraftScreenPostAdaptation(catalog,"single-click-trigger",{realSurface:true,highDpi:true,targetGeometry:true});assert.equal(blocked.status,"BLOCKED");assert.ok(blocked.failures.includes("CURSOR_TELEMETRY_REQUIRED"));
console.log(JSON.stringify({contract:"A1VideoShotcraftScreenSafetyTest/v1",status:"PASS",styleCount:safety.styleCount,counts:safety.counts,clickProfile:click.recipe,streamProfile:stream.recipe,comparisonProfile:compare.recipe,runtimeBindingRequired:true,missingTelemetryRejected:true},null,2));
