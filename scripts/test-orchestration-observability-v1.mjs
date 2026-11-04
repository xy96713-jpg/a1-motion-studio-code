#!/usr/bin/env node
import assert from "node:assert/strict";
import {actionFingerprint, classifyOrchestrationAttempt, createStageCheckpoint, ORCHESTRATION_STALLED} from "../apps/studio-next/src/lib/a1-orchestration-observability-v1.mjs";

const fingerprint = actionFingerprint({actionId: "GENERATE_NEW_CURRENT_CANDIDATE", targetIds: ["ED-13"], payloadSha256: "a".repeat(64), workspaceSha256: "b".repeat(64)});
const same = classifyOrchestrationAttempt({previousFingerprint: fingerprint, currentFingerprint: fingerprint, priorNoopCount: 1, previousEvidenceSha256: "c".repeat(64), evidenceSha256: "c".repeat(64)});
assert.equal(same.status, ORCHESTRATION_STALLED);
assert.equal(same.noopCount, 2);
const changed = classifyOrchestrationAttempt({previousFingerprint: fingerprint, currentFingerprint: fingerprint, priorNoopCount: 1, previousEvidenceSha256: "c".repeat(64), evidenceSha256: "d".repeat(64)});
assert.equal(changed.status, "CONTINUE");
assert.equal(changed.noopCount, 0);
const checkpoint = createStageCheckpoint({stageId: "hot-path-status", startedAt: "2026-08-21T00:00:00.000Z", finishedAt: "2026-08-21T00:00:00.250Z", budgetMs: 1000, filesRead: 5, bytesRead: 1200});
assert.equal(checkpoint.elapsedMs, 250);
assert.equal(checkpoint.overBudget, false);
assert.equal(checkpoint.recursiveScan, false);
const overBudget = createStageCheckpoint({stageId: "bounded-audit", startedAt: "2026-08-21T00:00:00.000Z", finishedAt: "2026-08-21T00:00:02.000Z", budgetMs: 1000});
assert.equal(overBudget.status, "CHECKPOINT_REQUIRED");
assert.equal(overBudget.overBudget, true);
console.log(JSON.stringify({status: "PASS", stalledAfterTwoIdenticalNoops: true, newEvidenceResetsNoop: true, budgetCheckpoint: true}, null, 2));

