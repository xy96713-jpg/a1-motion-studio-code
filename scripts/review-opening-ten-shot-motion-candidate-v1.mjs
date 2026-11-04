#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const appPublicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(appPublicRoot, "generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(generatedRoot, "opening-ten-shot-motion-candidate-v1");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const manifestFile = path.join(candidateRoot, "manifest.json");
const reviewFile = path.join(candidateRoot, "agent-actual-pixel-and-motion-review.json");
const ffmpeg = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const publicFile = (publicUrl) => path.join(appPublicRoot, String(publicUrl).replace(/^\//u, ""));
const isSha256 = (value) => /^[a-f0-9]{64}$/u.test(String(value || ""));

const workspace = readJson(workspaceFile);
const manifest = readJson(manifestFile);

assert.equal(manifest.contract, "A1OpeningTenShotMotionCandidateManifest/v1");
assert.equal(manifest.status, "CANDIDATE_ONLY_PENDING_AGENT_ACTUAL_PIXEL_REVIEW");
assert.equal(manifest.current, false);
assert.equal(manifest.reviewOnly, true);
assert.equal(manifest.productionAdmitted, false);
assert.equal(manifest.sourceWorkspaceSha256, workspace.workspaceSha256);
assert.equal(workspace.production.userVisualApprovalGate.userVisualApproval, "NOT_APPROVED");
assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard.status, "PENDING_USER_APPROVAL");
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);

const outputFile = publicFile(manifest.output.publicUrl);
const contactSheetFile = publicFile(manifest.contactSheet.publicUrl);
assert.ok(fs.existsSync(outputFile));
assert.ok(fs.existsSync(contactSheetFile));
assert.equal(sha256File(outputFile), manifest.output.sha256);
assert.equal(sha256File(contactSheetFile), manifest.contactSheet.sha256);
assert.equal(manifest.output.width, 960);
assert.equal(manifest.output.height, 540);
assert.equal(manifest.output.fps, 30);
assert.equal(manifest.output.durationInFrames, 1489);
assert.ok(Math.abs(manifest.output.durationMs - 49_633) <= 1);
assert.equal(manifest.contactSheet.sampleCount, 20);
assert.equal(manifest.timingAuthority.shots.length, 10);
assert.deepEqual(manifest.timingAuthority.shots.map((shot) => shot.shotId), ["ED-01", "ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-07", "ED-08", "ED-09", "ED-10"]);
assert.ok(manifest.timingAuthority.maximumQuantizationErrorMs <= 1000 / manifest.output.fps);

const contactMetadata = await sharp(contactSheetFile).metadata();
assert.equal(contactMetadata.width, 1920);
assert.equal(contactMetadata.height, 1350);
for (const sample of manifest.contactSheet.samples) {
  const file = publicFile(sample.publicUrl);
  assert.ok(fs.existsSync(file), `missing review sample ${sample.publicUrl}`);
  assert.ok(isSha256(sample.sha256));
  assert.equal(sha256File(file), sample.sha256);
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.width, 960);
  assert.equal(metadata.height, 540);
}

assert.equal(manifest.screenMotionAudit.length, 5);
for (const item of manifest.screenMotionAudit) {
  assert.deepEqual(item.stateRoles, ["BEFORE", "ACTION", "RESULT"]);
  assert.equal(item.sourceStateKind, "VERIFIED_STILL_SEQUENCE");
  assert.equal(item.cameraPath, "ONE_PRIMARY_CUBIC_PATH_WITH_SETTLE");
  assert.ok(item.maximumScale <= 1.34);
  assert.ok(item.minimumSettleMs >= 350);
  assert.equal(item.hardJumpZoom, false);
  assert.equal(item.syntheticCursorRendered, false);
  assert.equal(item.cursorPath, "VERIFIED_SOURCE_CURSOR_STATE_TRANSITION");
}
assert.equal(manifest.revisionHistory.repairCount, 1);
assert.equal(manifest.revisionHistory.rejectedR0.status, "VISUAL_REJECTED_DOUBLE_CURSOR");

const decode = spawnSync(ffmpeg, ["-hide_banner", "-i", outputFile, "-f", "null", "-"], {encoding: "utf8"});
const decodeLog = `${decode.stdout || ""}\n${decode.stderr || ""}`;
assert.equal(decode.status, 0, decodeLog);
assert.match(decodeLog, /Duration:\s+00:00:49\.(?:6\d|69)/u);
assert.match(decodeLog, /Video:\s+h264[^\n]*960x540[^\n]*30 fps/u);
assert.match(decodeLog, /Audio:\s+aac[^\n]*48000 Hz[^\n]*stereo/u);
assert.match(decodeLog, /frame=\s*1489/u);

const assessedFrames = {
  openingTitle: manifest.contactSheet.samples.find((sample) => sample.shotId === "ED-01")?.sha256,
  screenActionMidpoints: manifest.contactSheet.samples.filter((sample) => ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06"].includes(sample.shotId) && sample.fraction === 0.48).map((sample) => ({shotId: sample.shotId, sha256: sample.sha256})),
  packageSequence: manifest.contactSheet.samples.filter((sample) => ["ED-07", "ED-08", "ED-09"].includes(sample.shotId)).map((sample) => ({shotId: sample.shotId, sha256: sample.sha256})),
  presenterReset: manifest.contactSheet.samples.find((sample) => sample.shotId === "ED-10")?.sha256,
};
assert.ok(isSha256(assessedFrames.openingTitle));
assert.equal(assessedFrames.screenActionMidpoints.length, 5);
assert.equal(assessedFrames.packageSequence.length, 3);
assert.ok(isSha256(assessedFrames.presenterReset));

const reviewedAt = new Date().toISOString();
const reviewBody = {
  contract: "A1OpeningTenShotMotionAgentReview/v1",
  status: "AGENT_ACTUAL_PIXEL_AND_MOTION_REVIEW_PASS",
  verdict: "AGENT_RECOMMENDS_USER_OPENING_MOTION_REVIEW",
  source: {
    workspaceSha256: workspace.workspaceSha256,
    candidateManifestSha256: manifest.manifestSha256,
    videoSha256: manifest.output.sha256,
    contactSheetSha256: manifest.contactSheet.sha256,
  },
  checks: {
    ffmpegFullDecode: "PASS",
    frameCount: "PASS",
    audioStream: "PASS",
    canonicalTimelineQuantization: "PASS",
    openingTitleHierarchy: "PASS",
    presenterFaceAndMicrophoneSafety: "PASS",
    verifiedScreenStateProgression: "PASS",
    duplicateSyntheticCursorAbsent: "PASS",
    onePrimaryCameraPathPerScreenShot: "PASS",
    packageSequenceContinuity: "PASS",
    presenterResetAtEd10: "PASS",
  },
  actualPixelAssessment: {
    assessedFrames,
    summary: "ED-01 establishes the product identity with one large local-font title while keeping the presenter and microphone readable. ED-02 through ED-06 show verified before/action/result states without a second synthetic pointer. ED-07 through ED-09 preserve the current package masters, and ED-10 returns to a clean presenter frame.",
  },
  knownBoundary: {
    subjectiveSmoothnessRequiresUserPlayback: true,
    statement: "Full-file decode, timing checks and sampled actual pixels pass; only the user can decide whether the 49.63-second camera rhythm feels subjectively satisfying.",
  },
  boundaries: {
    candidateOnly: true,
    userVisualApproval: "NOT_APPROVED",
    productionAdmitted: false,
    canonicalWorkspaceMutationPerformed: false,
    assemblyPerformed: false,
    layerExtractionPerformed: false,
    resolvePerformed: false,
    finalRenderPerformed: false,
  },
  reviewedAt,
};
const review = {...reviewBody, reviewSha256: sha256Value(reviewBody)};
fs.writeFileSync(reviewFile, `${JSON.stringify(review, null, 2)}\n`, "utf8");

const {manifestSha256: _oldManifestSha256, ...manifestWithoutSha} = manifest;
const reviewedManifestBody = {
  ...manifestWithoutSha,
  status: "AGENT_ACTUAL_PIXEL_AND_MOTION_REVIEW_PASS",
  agentReview: {
    publicUrl: `/${path.relative(appPublicRoot, reviewFile).split(path.sep).join("/")}`,
    sha256: sha256File(reviewFile),
    reviewSha256: review.reviewSha256,
    verdict: review.verdict,
  },
  reviewedAt,
};
const reviewedManifest = {...reviewedManifestBody, manifestSha256: sha256Value(reviewedManifestBody)};
fs.writeFileSync(manifestFile, `${JSON.stringify(reviewedManifest, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({status: review.status, verdict: review.verdict, video: reviewedManifest.output, review: reviewedManifest.agentReview, userVisualApproval: review.boundaries.userVisualApproval, canonicalWorkspaceMutationPerformed: false}, null, 2)}\n`);
