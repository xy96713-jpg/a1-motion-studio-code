#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";

import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {writeJsonAtomic} from "../apps/studio-next/src/lib/a1-system-validation-runner-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const manifest = workspace.production.shotIntelligence.videoPackagingContexts;
const packageShotIds = workspace.production.canonicalCreatorPackagingSequence.decisions
  .filter((decision) => decision.packageDecision === "PACKAGE")
  .map((decision) => decision.shotId);
const contextShotIds = manifest.items.map((item) => item.shotId);

assert.equal(manifest.contract, "A1VideoPackagingContextSet/v1");
assert.deepEqual([...contextShotIds].sort(), [...packageShotIds].sort());
assert.equal(manifest.summary.holdFrameBoundCount, packageShotIds.length);
assert.equal(manifest.summary.unverifiedCompatibilityCount, 0);

const {artifactDir, publicDir} = projectDirs(appRoot);
for (const base of [artifactDir, publicDir]) {
  writeJsonAtomic(path.join(base, "video-packaging-context-v1/manifest.json"), manifest);
}

console.log(JSON.stringify({
  status: "PASS",
  workspaceSha256: workspace.workspaceSha256,
  contextCount: manifest.items.length,
  packageCount: packageShotIds.length,
  shotIds: contextShotIds,
  workspaceMutationPerformed: false,
}, null, 2));
