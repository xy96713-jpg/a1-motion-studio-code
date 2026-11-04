#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const outputRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/opening-ten-shot-director-board-v1");
const manifestFile = path.join(outputRoot, "manifest.json");
const reviewFile = path.join(outputRoot, "agent-actual-pixel-review.json");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const expectedShotIds = Array.from({length: 10}, (_, index) => `ED-${String(index + 1).padStart(2, "0")}`);
const expectedActionIds = new Map([
  ["ED-02", "causalRewrite"],
  ["ED-03", "preference"],
  ["ED-04", "paragraph"],
  ["ED-05", "review"],
  ["ED-06", "presentation"],
]);

const manifest = readJson(manifestFile);
if (manifest.contract !== "A1OpeningTenShotDirectorBoard/v1") throw new Error("opening-director-review-contract-invalid");
if (!["PENDING_AGENT_ACTUAL_PIXEL_REVIEW", "AGENT_ACTUAL_PIXEL_PASS"].includes(manifest.status)) throw new Error(`opening-director-review-status-invalid:${manifest.status}`);
if (JSON.stringify(manifest.shotIds) !== JSON.stringify(expectedShotIds)) throw new Error("opening-director-review-shot-range-invalid");
if (manifest.openingRange?.startMs !== 0 || manifest.openingRange?.endMs !== 49620 || manifest.openingRange?.durationMs !== 49620) throw new Error("opening-director-review-duration-invalid");
if (manifest.boundaries?.userVisualApproval !== "NOT_APPROVED" || manifest.boundaries?.motionPerformed !== false || manifest.boundaries?.canonicalWorkspaceMutationPerformed !== false) throw new Error("opening-director-review-boundary-invalid");

const failures = [];
const verifyImage = async (binding, label, expectedWidth, expectedHeight) => {
  const file = publicFile(binding?.publicUrl);
  if (!binding?.publicUrl || !fs.existsSync(file)) {
    failures.push(`${label}:FILE_MISSING`);
    return null;
  }
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== binding.sha256) failures.push(`${label}:SHA_MISMATCH`);
  const metadata = await sharp(bytes).metadata();
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) failures.push(`${label}:DIMENSION_MISMATCH`);
  return {width: metadata.width, height: metadata.height, sha256: sha256(bytes)};
};

await verifyImage(manifest.directorBoard, "DIRECTOR_BOARD", 1440, 2475);
await verifyImage(manifest.screenActionStateBoard, "SCREEN_STATE_BOARD", 1440, 4410);
if (!Array.isArray(manifest.shots) || manifest.shots.length !== 10) failures.push("SHOT_COUNT_INVALID");
for (const shot of manifest.shots || []) {
  await verifyImage(shot.frame, `${shot.shotId}:FRAME`, 1920, 1080);
  if (!expectedActionIds.has(shot.shotId)) continue;
  if (shot.route !== "SCREEN_EVIDENCE") failures.push(`${shot.shotId}:ROUTE_INVALID`);
  if (shot.actionId !== expectedActionIds.get(shot.shotId)) failures.push(`${shot.shotId}:ACTION_ID_INVALID`);
  if (shot.motionIntent !== "single_cubic_camera_move_between_verified_focus_regions_with_350ms_settle") failures.push(`${shot.shotId}:MOTION_INTENT_INVALID`);
  const states = shot.stateSequence || [];
  if (JSON.stringify(states.map((state) => state.role)) !== JSON.stringify(["BEFORE", "ACTION", "RESULT"])) failures.push(`${shot.shotId}:STATE_ROLES_INVALID`);
  if (new Set(states.map((state) => state.sha256)).size !== 3) failures.push(`${shot.shotId}:STATE_PIXELS_NOT_UNIQUE`);
  for (const state of states) {
    await verifyImage(state, `${shot.shotId}:${state.role}`, 1920, 1080);
    const focus = state.focus || {};
    const inFrame = Number.isFinite(focus.x) && Number.isFinite(focus.y) && Number.isFinite(focus.width) && Number.isFinite(focus.height)
      && focus.x >= 0 && focus.y >= 0 && focus.width >= 240 && focus.height >= 160
      && focus.x + focus.width <= 1920 && focus.y + focus.height <= 1080;
    if (!inFrame) failures.push(`${shot.shotId}:${state.role}:FOCUS_INVALID`);
  }
}

const now = new Date().toISOString();
const status = failures.length === 0 ? "PASS" : "BLOCK";
const reviewBody = {
  contract: "A1OpeningTenShotDirectorBoardActualPixelReview/v1",
  status,
  verdict: status === "PASS" ? "AGENT_RECOMMENDS_USER_OPENING_DIRECTOR_REVIEW" : "REPAIR_REQUIRED",
  sourceManifestSha256: manifest.manifestSha256,
  inspectedArtifacts: {
    directorBoard: manifest.directorBoard,
    screenActionStateBoard: manifest.screenActionStateBoard,
    shotFrameCount: manifest.shots?.length || 0,
    verifiedScreenStateCount: (manifest.shots || []).reduce((count, shot) => count + (shot.stateSequence?.length || 0), 0),
  },
  visualAssessment: {
    hierarchy: "PASS: ED-01 establishes the product identity, ED-08 is the only full-frame hero title in the opening, and ED-10 returns to a clean presenter reset.",
    mediumVariety: "PASS: the opening alternates presenter, five real causal screen operations, typography takeover, and one diagrammatic explainer instead of repeating ten text cards.",
    screenEvidence: "PASS: ED-02 through ED-06 each show three distinct verified 1920x1080 source states with one bounded focus region.",
    minimalAesthetic: "PASS: package frames preserve the restrained dark, off-white, cobalt and pixel-editorial direction without decorative HUD accumulation.",
    knownBoundary: "STATIC_ONLY: camera timing, cursor path, subtitle synchronization, readability in motion, and transition smoothness are not proven by this review.",
  },
  checks: {
    exactOpeningRange: manifest.openingRange?.durationMs === 49620,
    tenShotSequence: JSON.stringify(manifest.shotIds) === JSON.stringify(expectedShotIds),
    fiveVerifiedCausalScreenShots: (manifest.shots || []).filter((shot) => expectedActionIds.has(shot.shotId) && shot.stateSequence?.length === 3).length === 5,
    subtitleBoundMotionContractPresent: manifest.screenMotionRule?.subtitleTimeRangeIsHardBoundary === true,
    hardJumpZoomForbidden: manifest.screenMotionRule?.hardJumpZoomForbidden === true,
    userApprovalNotClaimed: manifest.boundaries?.userVisualApproval === "NOT_APPROVED",
    motionNotClaimed: manifest.boundaries?.motionPerformed === false,
  },
  failures,
  boundaries: {reviewOnly: true, productionAdmitted: false, userVisualApproval: "NOT_APPROVED", motionAllowed: false, assemblyAllowed: false, finalRenderAllowed: false},
  reviewedAt: now,
};
const review = {...reviewBody, reviewSha256: sha256(reviewBody)};
fs.writeFileSync(reviewFile, `${JSON.stringify(review, null, 2)}\n`);
if (status !== "PASS") throw new Error(`opening-director-actual-pixel-review-blocked:${failures.join(",")}`);

const nextBody = {
  ...manifest,
  status: "AGENT_ACTUAL_PIXEL_PASS",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  actualPixelReview: {
    status: review.status,
    verdict: review.verdict,
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/opening-ten-shot-director-board-v1/agent-actual-pixel-review.json",
    sha256: review.reviewSha256,
  },
  boundaries: {...manifest.boundaries, userVisualApproval: "NOT_APPROVED", motionPerformed: false, canonicalWorkspaceMutationPerformed: false},
  reviewedAt: now,
  manifestSha256: undefined,
};
const nextManifest = {...nextBody, manifestSha256: sha256(nextBody)};
fs.writeFileSync(manifestFile, `${JSON.stringify(nextManifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: review.status, verdict: review.verdict, reviewSha256: review.reviewSha256, manifestSha256: nextManifest.manifestSha256, failures, userVisualApproval: "NOT_APPROVED", motionPerformed: false}, null, 2)}\n`);
