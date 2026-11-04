import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertActiveRunIndex, buildActiveRunIndex, canonicalJson, canonicalJsonSha256} from "../apps/studio-next/src/lib/a1-active-run-index-v1.mjs";

const root = process.cwd();
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const bytes = fs.readFileSync(workspacePath);
const workspace = JSON.parse(bytes);
const fileSha = createHash("sha256").update(bytes).digest("hex");
const admission = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/whole-film-layer-reconstruction-v4/remaining-ten-admission.json"), "utf8"));
const index = buildActiveRunIndex(workspace, {workspaceFileSha256: fileSha, transitionSha256: "t".repeat(64), cacheEvidence: admission, updatedAt: "2026-08-11T00:00:00.000Z"});
const compatibilityReview = workspace.production.shotIntelligence.representativeApprovedMasterMotionPilot?.deliveryContract?.route === "COMPOSITE_COMPATIBILITY_PREVIEW";
assert.equal(index.status, workspace.production.packagingLifecycleProjection.status);
assert.equal(index.nextAction, workspace.production.authority.nextAction.id);
assert.equal(index.packageCount, 13);
assert.equal(index.layerCount, 52);
assert.ok(["NOT_CREATED", "locked-awaiting-whole-film-static-board-user-approval"].includes(index.assembly.status));
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);
assert.ok([
  compatibilityReview ? "history-compatibility-preview" : "preview-ready-for-review",
  "locked-awaiting-whole-film-static-board-user-approval",
].includes(index.motion.status));
assert.equal(index.cache.hit, 9);
assert.equal(index.cache.miss, 1);
const activePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/active-run.json");
const realActive = JSON.parse(fs.readFileSync(activePath, "utf8"));
assert.equal(realActive.cache.hit, 9);
assert.equal(realActive.cache.miss, 1);
assert.equal(realActive.transitionSha256.length, 64);
assert.equal(fs.statSync(activePath).size, Buffer.byteLength(`${JSON.stringify(realActive, null, 2)}\n`));
assert.equal(realActive.serializedBytes, fs.statSync(activePath).size);
assert.equal(index.serializedBytes, Buffer.byteLength(`${JSON.stringify(index, null, 2)}\n`));
assert.equal(Buffer.byteLength(`${JSON.stringify(index, null, 2)}\n`) < 100 * 1024, true);
assert.equal(JSON.stringify(index).includes("generation.jobs"), false);
assertActiveRunIndex(index, {workspaceFileSha256: fileSha});
assert.throws(() => assertActiveRunIndex(index, {workspaceFileSha256: "stale"}), /active-run-index-stale/);
assert.equal(canonicalJsonSha256({a: undefined, b: [undefined, 1]}), canonicalJsonSha256({b: [null, 1]}));
assert.equal(canonicalJson({b: 1, a: 2}), '{"a":2,"b":1}');
console.log(JSON.stringify({status: "PASS", bytes: Buffer.byteLength(`${JSON.stringify(index, null, 2)}\n`), statusValue: index.status, nextAction: index.nextAction}));
