#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "work/cap-native-production-v1/shot-manifest.json");
const plansPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/shot-performance-plans.json");
const overridesPath = path.join(root, "apps/studio-next/src/data/system-line-screen-demo-overrides-v1.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
const expected = plans.shots.map((shot) => shot.shotId).sort();
const declared = manifest.shots.map((shot) => shot.shotId).sort();
const current = overrides.entries
  .filter((entry) => entry.capNativeCandidate)
  .map((entry) => entry.shotId)
  .sort();
const declaredCurrent = manifest.shots
  .filter((shot) => shot.status === "CAPTURED_CURRENT")
  .map((shot) => shot.shotId)
  .sort();
const failures = [];
if (manifest.contract !== "A1CapNativeShotManifest/v1") failures.push("CONTRACT_INVALID");
if (JSON.stringify(expected) !== JSON.stringify(declared)) failures.push("SHOT_COVERAGE_DRIFT");
if (JSON.stringify(current) !== JSON.stringify(declaredCurrent)) failures.push("CURRENT_CAPTURE_DRIFT");
if (manifest.shots.some((shot) => !shot.actionId)) failures.push("ACTION_ID_MISSING");
const queue = manifest.shots.filter((shot) => shot.status !== "CAPTURED_CURRENT");
const report = {
  contract: "A1CapNativeProductionManifestCheck/v1",
  status: failures.length ? "BLOCKED" : "READY_TO_CAPTURE",
  expectedShotCount: expected.length,
  currentCaptureCount: current.length,
  remainingCaptureCount: queue.length,
  currentShotIds: current,
  queue: queue.map(({shotId, actionId, status}) => ({shotId, actionId, status})),
  failures,
  authorityMutationPerformed: false
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
