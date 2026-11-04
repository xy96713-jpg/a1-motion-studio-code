#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertResolvePackagingHandoff, compileResolvePackagingHandoffPlan} from "../apps/studio-next/src/lib/a1-resolve-packaging-handoff-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const authorityRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const args = process.argv.slice(2);
const readbackPath = args[args.indexOf("--readback") + 1];
const outputPath = args.includes("--output") ? args[args.indexOf("--output") + 1] : null;
if (!readbackPath) throw new Error("resolve-live-binding-readback-required");
const readback = readJson(path.resolve(readbackPath));
if (readback.status !== "LIVE_READBACK" || !readback.projectId || !readback.timelineId || !readback.timelineSha256 || !Number(readback.fps)) throw new Error("resolve-live-binding-live-readback-invalid");
if (!Number.isInteger(readback.startFrame) || !Number.isInteger(readback.endFrame) || readback.endFrame <= readback.startFrame) throw new Error("resolve-live-binding-timeline-bounds-invalid");

const workspace = readJson(path.join(authorityRoot, "workspace.json"));
const exportManifest = readJson(path.join(authorityRoot, "canonical-package-export-v1/manifest.json"));
const packagePlans = new Map((workspace.production?.shotIntelligence?.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
const exportedByShot = new Map((exportManifest.outputs || []).map((output) => [output.shotId, output]));
const shotIds = [...exportedByShot.keys()];
if (shotIds.length !== 13 || packagePlans.size < 13) throw new Error("resolve-live-binding-canonical-13-shot-source-required");

const shotDecisions = [];
const sourceTimelineBindings = {};
for (const shotId of shotIds) {
  const packagePlan = packagePlans.get(shotId);
  const timing = packagePlan?.videoContext?.timelineRange;
  if (!Number.isFinite(timing?.startMs) || !Number.isFinite(timing?.endMs) || timing.endMs <= timing.startMs) throw new Error(`resolve-live-binding-shot-timing-missing:${shotId}`);
  const startFrame = Math.round((timing.startMs / 1000) * Number(readback.fps));
  const endFrame = Math.round((timing.endMs / 1000) * Number(readback.fps));
  if (startFrame < readback.startFrame || endFrame > readback.endFrame || endFrame <= startFrame) throw new Error(`resolve-live-binding-shot-outside-live-timeline:${shotId}`);
  const output = exportedByShot.get(shotId);
  const textNodes = (output.visibleTextNodes || []).map((node) => ({...node, sourcePhrase: node.text, semanticRole: node.semanticRole || "headline", verbatimFromProtectedPhrases: true, wholeTranscript: false, glyphProof: {outlineSha256: node.glyphOutlineSha256}}));
  sourceTimelineBindings[shotId] = {
    status: "LIVE_READBACK",
    startFrame,
    endFrame,
    fps: Number(readback.fps),
    evidence: {
      source: "RESOLVE_READBACK",
      readbackPath: path.relative(root, path.resolve(readbackPath)),
      projectId: readback.projectId,
      timelineId: readback.timelineId,
      timelineSha256: readback.timelineSha256,
      sourceTiming: {source: "CANONICAL_SHOT_TIMING_MS", startMs: timing.startMs, endMs: timing.endMs},
      frameConversion: "round(ms / 1000 * liveTimeline.fps)",
    },
  };
  shotDecisions.push({
    shotId,
    route: output.route,
    status: "BLOCKED_UNTIL_RESOLVE_INSERT_AUTHORIZATION",
    routeDecisionReason: ["canonical-export-route", "live-resolve-readback-bound"],
    asset: {sha256: output.sha256, path: output.outputPath},
    assetPixelSources: [{sourceKind: "CANONICAL_INDEPENDENT_PACKAGE_PNG", sha256: output.sha256}],
    referenceContextBindings: [],
    forbiddenPixelSources: ["BASE_VIDEO_HOLD_FRAME", "PRESENTER", "MICROPHONE", "BOOM", "AUDIO", "SUBTITLE", "CAPTION"],
    textNodes,
    handles: {pre: 8, post: 8},
  });
}

const plan = assertResolvePackagingHandoff(compileResolvePackagingHandoffPlan({shotDecisions, sourceTimelineBindings, liveTimelineReadback: readback, sourceWorkspaceSha256: workspace.workspaceSha256, generatedAt: new Date().toISOString()}));
if (outputPath) {
  const absoluteOutput = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absoluteOutput), {recursive: true});
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(plan, null, 2)}\n`);
}
console.log(JSON.stringify({status: "PASS", planStatus: plan.status, eventCount: plan.events.length, projectId: readback.projectId, timelineId: readback.timelineId, timelineSha256: readback.timelineSha256, outputPath: outputPath ? path.resolve(outputPath) : null, persisted: Boolean(outputPath), mutation: false}, null, 2));
