import assert from "node:assert/strict";
import {assertResolveInsertReadback, buildResolveInsertTransaction, classifyExistingPackageItem} from "../apps/studio-next/src/lib/a1-resolve-insert-transaction-v1.mjs";

const items = Array.from({length: 13}, (_, index) => ({shotId: `ED-${String(index + 1).padStart(2, "0")}`, route: index < 6 ? "OVERLAY_ALPHA" : "FULLSCREEN_PACKAGE", sourceSha256: `${String(index + 1).padStart(2, "0")}${"b".repeat(62)}`, recordFrame: index * 100, duration: 90, trackIndex: index < 6 ? 2 : 3}));
const plan = {contract: "A1ResolvePackagingInsertPlan/v1", status: "READY_FOR_GUARDED_LIVE_INSERT", planSha256: "c".repeat(64), appendItems: items};
const before = {status: "LIVE_READBACK", projectId: "p1", projectName: "Article", timelineId: "t1", timelineName: "Main", timelineSha256: "a".repeat(64), packageItems: [items[0]]};
const tx = buildResolveInsertTransaction({plan, beforeReadback: before, snapshotName: "Main__before-a1-package"});
assert.equal(tx.status, "PREPARED_NO_MUTATION");
assert.equal(tx.rollback.snapshotCreated, false);
assert.equal(tx.dispositions.filter((item) => item.disposition === "REUSE_IDEMPOTENT").length, 1);
assert.equal(tx.dispositions.filter((item) => item.disposition === "CREATE").length, 12);
assert.deepEqual(classifyExistingPackageItem({existing: items[0], desired: items[0]}).disposition, "REUSE_IDEMPOTENT");
assert.throws(() => classifyExistingPackageItem({existing: {...items[0], sourceSha256: "d".repeat(64)}, desired: items[0]}), /different-content-would-overwrite/u);
const after = {...before, packageItems: items, audioMutationCount: 0, subtitleMutationCount: 0, baseFootageMutationCount: 0};
assert.deepEqual(assertResolveInsertReadback({transaction: tx, afterReadback: after}).status, "PASS");
assert.throws(() => assertResolveInsertReadback({transaction: tx, afterReadback: {...after, packageItems: items.slice(0, 12)}}), /shot-count-invalid/u);
assert.throws(() => assertResolveInsertReadback({transaction: tx, afterReadback: {...after, audioMutationCount: 1}}), /forbidden-track-mutation/u);
console.log(JSON.stringify({status: "PASS", contract: "A1ResolvePackagingInsertTransaction/v1", idempotentReuse: true, differentContentOverwriteRejected: true, rollbackRequired: true, readbackShotCount: 13}));
