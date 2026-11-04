#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const appPublicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(appPublicRoot, "generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(generatedRoot, "opening-ten-shot-motion-candidate-v1");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const manifestFile = path.join(candidateRoot, "manifest.json");
const reviewFile = path.join(candidateRoot, "agent-actual-pixel-and-motion-review.json");
const surfaceFile = path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const publicFile = (publicUrl) => path.join(appPublicRoot, String(publicUrl).replace(/^\//u, ""));

const workspace = readJson(workspaceFile);
const manifest = readJson(manifestFile);
const review = readJson(reviewFile);
const surface = fs.readFileSync(surfaceFile, "utf8");

assert.equal(manifest.status, "AGENT_ACTUAL_PIXEL_AND_MOTION_REVIEW_PASS");
assert.equal(manifest.current, false);
assert.equal(manifest.reviewOnly, true);
assert.equal(manifest.productionAdmitted, false);
assert.equal(manifest.sourceWorkspaceSha256, workspace.workspaceSha256);
assert.equal(manifest.output.sha256, "03ef4d62129938b24501ffa757367dcf1e4ebf29d89de56e89da14ea7969fd9c");
assert.equal(manifest.contactSheet.sha256, "7bf16e6b9e5234eb25eb241d8533b96f9096578c7e4291fb94e8e43f1122e9ad");
assert.equal(sha256File(publicFile(manifest.output.publicUrl)), manifest.output.sha256);
assert.equal(sha256File(publicFile(manifest.contactSheet.publicUrl)), manifest.contactSheet.sha256);
assert.equal(manifest.agentReview.sha256, sha256File(reviewFile));
assert.equal(manifest.agentReview.reviewSha256, review.reviewSha256);
assert.equal(review.status, "AGENT_ACTUAL_PIXEL_AND_MOTION_REVIEW_PASS");
assert.equal(review.verdict, "AGENT_RECOMMENDS_USER_OPENING_MOTION_REVIEW");
assert.equal(review.checks.ffmpegFullDecode, "PASS");
assert.equal(review.checks.audioStream, "PASS");
assert.equal(review.checks.duplicateSyntheticCursorAbsent, "PASS");
assert.equal(review.knownBoundary.subjectiveSmoothnessRequiresUserPlayback, true);
assert.equal(review.boundaries.userVisualApproval, "NOT_APPROVED");
assert.equal(review.boundaries.canonicalWorkspaceMutationPerformed, false);
assert.equal(workspace.workspaceSha256, "9857a8d53522d9a277cf1ac669ae6d97e2ef0a85f0d4f9c85baefd9dd1d542fb");
assert.equal(workspace.production.userVisualApprovalGate.userVisualApproval, "NOT_APPROVED");
assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard.status, "PENDING_USER_APPROVAL");
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(manifest.screenMotionAudit.length, 5);
assert.ok(manifest.screenMotionAudit.every((item) => item.syntheticCursorRendered === false && item.maximumScale <= 1.34 && item.minimumSettleMs >= 350));
assert.ok(fs.existsSync(path.join(candidateRoot, "history-r0-double-cursor-rejected/rejection.json")));
assert.match(surface, /data-a1-screen-demo-video="OPENING-ED-01-10"/u);
assert.match(surface, /AGENT_ACTUAL_PIXEL_AND_MOTION_REVIEW_PASS/u);
assert.match(surface, /CANDIDATE_ONLY · 49\.63s · 960×540 · 30fps/u);
assert.match(surface, /USER NOT APPROVED/u);

process.stdout.write(`${JSON.stringify({status: "PASS", candidateStatus: manifest.status, videoSha256: manifest.output.sha256, contactSheetSha256: manifest.contactSheet.sha256, reviewSha256: review.reviewSha256, sourceWorkspaceSha256: manifest.sourceWorkspaceSha256, userVisualApproval: workspace.production.userVisualApprovalGate.userVisualApproval, assemblyCount: workspace.production.shotIntelligence.currentAssembly.length}, null, 2)}\n`);
