#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileCurrentScreenDemoLane} from "../apps/studio-next/src/lib/a1-current-screen-demo-lane-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const workspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const publicDir = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/current-screen-demo-lane-v1");
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/current-screen-demo-lane-v1");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const canaryPath = path.join(publicDir, "ed-02-operation-canary.json");
const reviewProofs = fs.existsSync(canaryPath) ? [JSON.parse(fs.readFileSync(canaryPath, "utf8"))] : [];
const lane = compileCurrentScreenDemoLane(workspace, {reviewProofs});
for (const binding of lane.bindings) {
  if (!binding.sourceVideo?.publicUrl) continue;
  const file = path.join(appRoot, "public", binding.sourceVideo.publicUrl.replace(/^\//u, ""));
  if (!fs.existsSync(file)) binding.failures.push("source-video-file-missing");
  else if (sha256File(file) !== binding.sourceVideo.sha256) binding.failures.push("source-video-sha-mismatch");
  if (binding.preview?.kind === "PACKAGED_OPERATION_PROOF") {
    const proofFile = path.join(appRoot, "public", binding.preview.publicUrl.replace(/^\//u, ""));
    if (!fs.existsSync(proofFile)) binding.failures.push("packaged-proof-file-missing");
    else if (sha256File(proofFile) !== binding.preview.sha256) binding.failures.push("packaged-proof-sha-mismatch");
  }
}
lane.failures = lane.bindings.flatMap((binding) => binding.failures.map((failure) => `${binding.shotId}:${failure}`));
lane.status = lane.failures.length ? "BLOCKED" : "READY_FOR_BOUNDED_PERFORMANCE_RENDER";
const laneWithoutHash = {...lane};
delete laneWithoutHash.sha256;
lane.sha256 = crypto.createHash("sha256").update(JSON.stringify(laneWithoutHash)).digest("hex");
for (const directory of [publicDir, artifactDir]) fs.mkdirSync(directory, {recursive: true});
const text = `${JSON.stringify(lane, null, 2)}\n`;
fs.writeFileSync(path.join(publicDir, "manifest.json"), text);
fs.writeFileSync(path.join(artifactDir, "manifest.json"), text);
console.log(JSON.stringify({status: lane.status, screenShotCount: lane.screenShotCount, sourceBoundCount: lane.sourceBoundCount, semanticMatchCount: lane.semanticMatchCount, actionPlanReadyCount: lane.actionPlanReadyCount, packagedProofCount: lane.packagedProofCount, remainingPerformanceIrCount: lane.remainingPerformanceIrCount, failures: lane.failures, sha256: lane.sha256, publicManifest: "/generated/system-line/editorial-asset-workbench-v1/current-screen-demo-lane-v1/manifest.json"}, null, 2));
