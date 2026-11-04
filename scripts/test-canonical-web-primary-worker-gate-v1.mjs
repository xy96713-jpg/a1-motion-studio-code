#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const configPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/canonical-web-generation-v1/conversation.json");
const queueDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/canonical-web-generation-v1");
const workerPath = path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const workerSource = fs.readFileSync(workerPath, "utf8");
const manifest = workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
const targetShotIds = manifest.generationEligibleShotIds || [];
const activeQueues = fs.readdirSync(queueDir)
  .filter((name) => /^queue-[a-f0-9]+\.json$/u.test(name))
  .map((name) => JSON.parse(fs.readFileSync(path.join(queueDir, name), "utf8")))
  .filter((queue) => queue.styleSha256 === config.styleBundleSha256
    && queue.conversation?.id === config.id
    && queue.authoritySha256 === manifest.authoritySha256
    && queue.manifestSha256 === manifest.manifestSha256
    && queue.status !== "SUPERSEDED_DO_NOT_DISPATCH");
assert.equal(config.status, "READY");
assert.equal(config.providerPolicy.primaryProvider, "chatgpt-web-conversation");
assert.equal(config.providerPolicy.fallbackProvider, "codex-imagegen");
assert.equal(config.providerPolicy.fallbackRequiresExplicitFlag, true);
assert.equal(config.policy.maxImagesPerMessage, 1);
assert.equal(config.policy.maxConcurrentMessagesPerConversation, 1);
assert.equal(config.policy.oneShotPerMessage, true);
assert.equal(config.policy.oneBatchPerMessage, false);
assert.equal(config.policy.maxConcurrentBatches, 1);
assert.equal(config.policy.separateImagesRequired, true);
assert.equal(config.policy.collageForbidden, true);
assert.equal(config.policy.returnedImageMustBeImportedBeforeNextBatch, true);
assert.equal(activeQueues.length <= 1, true);
if (activeQueues[0]) {
  assert.equal(activeQueues[0].policy.returnedImageMustBeImportedBeforeNextJob, true);
  assert.equal(activeQueues[0].policy.maxConcurrentMessagesPerConversation, config.policy.maxConcurrentMessagesPerConversation);
  assert.deepEqual(activeQueues[0].targetShotIds, targetShotIds);
}
assert.equal(targetShotIds.length > 0 && targetShotIds.every((shotId) => ["ED-07", "ED-08", "ED-13", "ED-19"].includes(shotId)), true);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(["frozen", "idle"].includes(workspace.production.generation.workerStatus), true);
assert.equal(["active", "running"].includes(workspace.production.generation.workerStatus), false);
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);
assert.match(workerSource, /function canonicalWebPrimaryActive\(workspace\)/u);
assert.match(workerSource, /CANONICAL_WEB_PRIMARY_WAITING/u);
assert.match(workerSource, /dispatch queue\.messages\[\] one at a time/u);
assert.match(workerSource, /A1_ALLOW_LOCAL_GENERATION_FALLBACK=1/u);
console.log(JSON.stringify({status: "PASS", contract: "A1CanonicalWebPrimaryWorkerGateTest/v1", primaryProvider: config.providerPolicy.primaryProvider, targetShotIds, activeQueueSha256: activeQueues[0]?.queueSha256 || null, activeQueueCount: activeQueues.length, maxImagesPerMessage: config.policy.maxImagesPerMessage, oneShotPerMessage: config.policy.oneShotPerMessage, maxConcurrentBatches: config.policy.maxConcurrentBatches, importBeforeNext: true, localFallback: "explicit-env-only", queue: workspace.production.generation.summary, workerStatus: workspace.production.generation.workerStatus, workerSafety: "no-active-worker; canonical-web-primary-fence", assemblyCount: workspace.production.shotIntelligence.currentAssembly.length}, null, 2));
