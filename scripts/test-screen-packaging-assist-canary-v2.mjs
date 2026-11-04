#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {
  validateScreenPackagingAssistAdapterV2,
  validateScreenPackagingAssistPlanV2,
} from "../apps/studio-next/src/lib/a1-screen-packaging-assist-schema-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const auditPath = path.join(root, "work/screen-packaging-assist-mature-canary-v2/audit-report.json");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const expectedImplementationPaths = [
  "apps/studio-next/src/lib/a1-screen-packaging-assist-policy-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-assist-schema-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-assist-director-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-assist-adapter-v2.mjs",
  "remotion-renderer/src/ScreenPackagingAssistV2.tsx",
  "remotion-renderer/src/ScreenPackagingAssistCanaryV2.tsx",
  "remotion-renderer/src/screen-packaging-assist-v2-entry.tsx",
  "remotion-renderer/public/proof-only/screen-packaging-assist-v2/default-suppressed.mp4",
  "remotion-renderer/package.json",
  "remotion-renderer/package-lock.json",
  "scripts/build-screen-packaging-assist-mature-canary-v2.mjs",
  "scripts/test-screen-packaging-assist-contract-v2.mjs",
  "scripts/test-screen-packaging-assist-canary-v2.mjs",
  "scripts/test-screen-packaging-assist-renderer-guard-v2.mjs",
];
assert.ok(fs.existsSync(auditPath), "v2 audit report is required");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
assert.equal(audit.contract, "A1ScreenPackagingAssistCanaryAudit/v2");
assert.equal(audit.status, "PASS");
assert.deepEqual(audit.failures, []);
assert.deepEqual(audit.effects, ["EVIDENCE_UNDERLINE", "HIGHLIGHT_WASH"]);
assert.deepEqual(audit.forbiddenVisibleEffects, []);
assert.ok(Object.values(audit.checks).every((value) => value === true));
assert.equal(audit.boundary.reviewOnly, true);
assert.equal(audit.boundary.productionAdmission, false);
assert.equal(audit.boundary.workspaceMutationPerformed, false);
assert.equal(audit.boundary.currentCandidateReplacementPerformed, false);

for (const implementation of audit.implementation) {
  const file = path.join(root, implementation.path);
  assert.ok(fs.existsSync(file), `implementation file missing: ${implementation.path}`);
  assert.equal(sha(file), implementation.sha256, `stale implementation hash: ${implementation.path}`);
}
assert.deepEqual(
  audit.implementation.map((item) => item.path).sort(),
  [...expectedImplementationPaths].sort(),
);

for (const artifact of [audit.props, audit.baselineProps, audit.media, audit.contactSheet]) {
  const file = path.join(root, artifact.path);
  assert.ok(fs.existsSync(file), `artifact missing: ${artifact.path}`);
  assert.equal(sha(file), artifact.sha256, `artifact hash mismatch: ${artifact.path}`);
}
for (const proof of audit.proofFrames) {
  assert.ok(proof.changedInsidePixels >= 40);
  assert.equal(proof.changedOutsidePixels, 0);
  assert.equal(proof.repeatRenderPixelMatch, true);
  assert.match(proof.deterministicPixelSha256, /^[a-f0-9]{64}$/u);
  for (const artifact of [proof.baseline, proof.decorated, proof.replay]) {
    const file = path.join(root, artifact.path);
    assert.ok(fs.existsSync(file), `proof missing: ${artifact.path}`);
    assert.equal(sha(file), artifact.sha256, `proof hash mismatch: ${artifact.path}`);
  }
  const baseline = await sharp(path.join(root, proof.baseline.path)).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const decorated = await sharp(path.join(root, proof.decorated.path)).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const replay = await sharp(path.join(root, proof.replay.path)).removeAlpha().raw().toBuffer({resolveWithObject: true});
  assert.deepEqual(decorated.info, baseline.info);
  assert.equal(
    crypto.createHash("sha256").update(decorated.data).digest("hex"),
    crypto.createHash("sha256").update(replay.data).digest("hex"),
  );
  let changedInsidePixels = 0;
  let changedOutsidePixels = 0;
  for (let offset = 0, pixelIndex = 0; offset < baseline.data.length; offset += 3, pixelIndex += 1) {
    const changed =
      baseline.data[offset] !== decorated.data[offset] ||
      baseline.data[offset + 1] !== decorated.data[offset + 1] ||
      baseline.data[offset + 2] !== decorated.data[offset + 2];
    if (!changed) continue;
    const x = pixelIndex % baseline.info.width;
    const y = Math.floor(pixelIndex / baseline.info.width);
    const inside = proof.allowedEnvelopes.some((box) =>
      x >= box.left && x < box.right && y >= box.top && y < box.bottom);
    if (inside) changedInsidePixels += 1;
    else changedOutsidePixels += 1;
  }
  assert.equal(changedInsidePixels, proof.changedInsidePixels);
  assert.equal(changedOutsidePixels, proof.changedOutsidePixels);
  assert.equal(changedOutsidePixels, 0);
}

const props = JSON.parse(fs.readFileSync(path.join(root, audit.props.path), "utf8"));
const baselineProps = JSON.parse(fs.readFileSync(path.join(root, audit.baselineProps.path), "utf8"));
assert.equal(props.variants.length, 2);
assert.equal(baselineProps.variants.length, 2);
for (let index = 0; index < props.variants.length; index += 1) {
  const variant = props.variants[index];
  const baseline = baselineProps.variants[index];
  assert.equal(variant.overlayEnabled, true);
  assert.equal(baseline.overlayEnabled, false);
  assert.deepEqual(baseline.adapter, variant.adapter);
  assert.equal(variant.sourceVideoSha256, audit.source.videoSha256);
  assert.equal(variant.adapter.plan.source.videoSha256, audit.source.videoSha256);
  assert.equal(variant.adapter.plan.source.revisionSha256, audit.source.revisionSha256);
  assert.equal(variant.sourceFrame, audit.evidence.geometryFrame);
  assert.equal(validateScreenPackagingAssistPlanV2(variant.adapter.plan).status, "PASS");
  assert.equal(validateScreenPackagingAssistAdapterV2(variant.adapter).status, "PASS");
}

const sourceVideo = path.join(root, audit.source.videoPath);
const captureReport = path.join(root, audit.source.captureReport);
assert.equal(sha(sourceVideo), audit.source.videoSha256);
assert.equal(sha(captureReport), audit.source.captureReportSha256);
assert.equal(audit.evidence.sourceTextSha256, audit.evidence.matchedTextSha256);
assert.equal(audit.evidenceBinding.sourceTextSha256, audit.evidence.sourceTextSha256);
assert.equal(audit.evidenceBinding.matchedTextSha256, audit.evidence.matchedTextSha256);
assert.equal(audit.evidenceBinding.rangeToken, audit.evidence.rangeToken);
assert.equal(audit.evidenceBinding.frameIndex, audit.evidence.geometryFrame);
assert.deepEqual(audit.evidenceBinding.viewport, audit.evidence.viewport);

const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
assert.equal(sha(workspacePath), audit.boundary.workspaceShaBefore);
assert.equal(sha(workspacePath), audit.boundary.workspaceShaAfter);
assert.equal(sha(currentPhasePath), audit.boundary.currentPhaseShaBefore);
assert.equal(sha(currentPhasePath), audit.boundary.currentPhaseShaAfter);
assert.deepEqual(new Set(Object.values(audit.dependencyVersions)), new Set(["4.0.520"]));

assert.equal(audit.media.width, 960);
assert.equal(audit.media.height, 540);
assert.equal(audit.media.fps, "60/1");
assert.equal(audit.media.frameCount, 360);
const decode = spawnSync(path.join(root, ".tools/bin/ffmpeg"), [
  "-v", "error", "-i", path.join(root, audit.media.path), "-f", "null", "-",
], {encoding: "utf8"});
assert.equal(decode.status, 0, decode.stderr);

console.log(JSON.stringify({
  contract: "A1ScreenPackagingAssistCanaryTest/v2",
  status: "PASS",
  implementationHashesCurrent: audit.implementation.length,
  planAndAdapterRuntimeValidation: true,
  sourceIdentityBound: true,
  textIdentityAndViewportBound: true,
  changedPixelsOutsideApprovedEnvelope: audit.proofFrames.reduce((sum, proof) => sum + proof.changedOutsidePixels, 0),
  repeatRenderPixelMatch: true,
  fullDecode: true,
  workspaceAndCurrentPhaseUnchanged: true,
}, null, 2));
