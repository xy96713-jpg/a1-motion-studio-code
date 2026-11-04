#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {validateScreenPackagingCoreAdapterV1} from "../apps/studio-next/src/lib/a1-screen-packaging-core-schema-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(root, "work/screen-packaging-core-canary-v1/audit-report.json");
assert.ok(fs.existsSync(reportPath), "screen-packaging-core-canary-audit-required");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const implementationPaths = [
  "apps/studio-next/src/lib/a1-screen-packaging-assist-policy-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-assist-schema-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-core-schema-v1.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-core-schema-v1.d.mts",
  "apps/studio-next/src/lib/a1-screen-packaging-core-director-v1.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-core-director-v1.d.mts",
  "apps/studio-next/src/lib/a1-screen-packaging-core-adapter-v1.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-core-adapter-v1.d.mts",
  "remotion-renderer/src/ScreenPackagingCoreV1.tsx",
  "remotion-renderer/src/ScreenPackagingCoreCanaryV1.tsx",
  "remotion-renderer/src/screen-packaging-core-v1-entry.tsx",
  "remotion-renderer/public/proof-only/screen-packaging-core-v1/default-core.mp4",
  "remotion-renderer/package.json",
  "remotion-renderer/package-lock.json",
  "scripts/build-screen-packaging-core-canary-v1.mjs",
  "scripts/test-screen-packaging-core-contract-v1.mjs",
  "scripts/test-screen-packaging-core-canary-v1.mjs",
  "scripts/test-screen-packaging-core-renderer-guard-v1.mjs",
];
assert.equal(report.contract, "A1ScreenPackagingCoreCanaryAudit/v1");
assert.equal(report.status, "PASS");
assert.deepEqual(report.effects, [
  "FOCUS_HANDOFF",
  "WIPE_COMPARE_DIFFERENCE_FLASH",
  "WAIT_COMPRESSION",
  "RESULT_HOLD",
]);
assert.deepEqual(report.failures, []);
assert.equal(report.boundary.reviewOnly, true);
assert.equal(report.boundary.productionAdmission, false);
assert.equal(report.boundary.workspaceMutationPerformed, false);
assert.equal(report.boundary.currentPhaseMutationPerformed, false);
assert.deepEqual(report.implementation.map((item) => item.path).sort(), [...implementationPaths].sort());
for (const item of report.implementation)
  assert.equal(sha(path.join(root, item.path)), item.sha256, `${item.path}:implementation-sha-mismatch`);
for (const artifact of [report.props, report.media, report.contactSheet, ...report.proofFrames.flatMap((proof) => proof.files)]) {
  const file = path.join(root, artifact.path);
  assert.ok(fs.existsSync(file), `${artifact.path}:missing`);
  assert.equal(sha(file), artifact.sha256, `${artifact.path}:sha-mismatch`);
}
const props = JSON.parse(fs.readFileSync(path.join(root, report.props.path), "utf8"));
assert.equal(props.variants.length, 4);
for (const variant of props.variants) {
  assert.equal(validateScreenPackagingCoreAdapterV1(variant.adapter).status, "PASS");
  assert.equal(variant.sourceVideoSha256, variant.adapter.plan.source.videoSha256);
}
for (const source of report.sources) {
  assert.equal(sha(path.join(root, source.videoPath)), source.videoSha256);
  assert.equal(sha(path.join(root, source.reportPath)), source.reportSha256);
}
const raw = async (artifact) => sharp(path.join(root, artifact.path)).removeAlpha().raw().toBuffer({resolveWithObject: true});
const flashProof = report.proofFrames.find((proof) => proof.id === "difference-flash");
const flash = await raw(flashProof.files[0]);
const final = await raw(flashProof.files[1]);
let flashInside = 0, flashOutside = 0;
for (let offset = 0, pixel = 0; offset < flash.data.length; offset += 3, pixel += 1) {
  const changed = flash.data[offset] !== final.data[offset] || flash.data[offset + 1] !== final.data[offset + 1] || flash.data[offset + 2] !== final.data[offset + 2];
  if (!changed) continue;
  const x = pixel % flash.info.width, y = Math.floor(pixel / flash.info.width);
  if (flashProof.metrics.envelope.some((box) => x >= box.left && x < box.right && y >= box.top && y < box.bottom)) flashInside += 1;
  else flashOutside += 1;
}
assert.equal(flashInside, flashProof.metrics.inside);
assert.equal(flashOutside, 0);
const holdProof = report.proofFrames.find((proof) => proof.id === "result-hold");
const holdA = await raw(holdProof.files[1]);
const holdB = await raw(holdProof.files[2]);
assert.equal(
  crypto.createHash("sha256").update(holdA.data).digest("hex"),
  crypto.createHash("sha256").update(holdB.data).digest("hex"),
);
assert.ok(report.checks.actualSourceBytesVerified);
assert.ok(report.checks.focusHandoffPixelsMove);
assert.ok(report.checks.focusCameraCoversCanvas);
const focusProof = report.proofFrames.find((proof) => proof.id === "focus-handoff");
assert.deepEqual(focusProof.metrics.edgeBackgroundPixels, {primary: 0, result: 0});
assert.ok(report.checks.compareWipeAndDiffVisible);
assert.ok(report.checks.waitCompressionMappingBound);
assert.ok(report.checks.resultHoldStable);
assert.ok(report.checks.fullDecode);
assert.equal(sha(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json")), report.boundary.workspaceShaAfter);
assert.equal(sha(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json")), report.boundary.currentPhaseShaAfter);
const decode = spawnSync(path.join(root, ".tools/bin/ffmpeg"), ["-v", "error", "-i", path.join(root, report.media.path), "-f", "null", "-"], {encoding: "utf8"});
assert.equal(decode.status, 0, decode.stderr);
console.log(JSON.stringify({
  contract: "A1ScreenPackagingCoreCanaryTest/v1",
  status: "PASS",
  effects: report.effects,
  actualSourceBytesVerified: true,
  fullDecode: true,
  workspaceAndAuthorityUnchanged: true,
}, null, 2));
