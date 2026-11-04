#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const familyRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2");
const registryPath = path.join(familyRoot, "source-family-registry.json");
const plansPath = path.join(familyRoot, "shot-performance-plans.json");
const manifestPath = path.join(familyRoot, "all-sixteen-shot-v2/manifest.json");
const surfacePath = path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx");
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(`continuous-screen-evidence-v2:${message}`);
};

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const surface = fs.readFileSync(surfacePath, "utf8");
const expectedShotIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-20", "ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"];

assert(registry.contract === "A1ContinuousScreenEvidenceRegistry/v2", "registry-contract");
assert(registry.status === "PASS", "registry-not-pass");
assert(registry.sourceFamilyCount === 10, "source-family-count");
assert(registry.families.flatMap((family) => family.evidenceFrames).length === 33, "evidence-frame-count");
assert(registry.families.every((family) => family.evidenceFrames.every((frame) => frame.frameMatchStatus === "PASS")), "frame-match-not-pass");
assert(registry.productionBoundary.userVisualApproval === "NOT_APPROVED", "registry-user-approval-drift");

assert(plans.contract === "A1ContinuousScreenEvidenceShotPlans/v2", "plans-contract");
assert(plans.status === "PASS", "plans-not-pass");
assert(JSON.stringify(plans.screenEvidenceShotIds) === JSON.stringify(expectedShotIds), "screen-shot-membership-drift");
assert(plans.shots.every((shot) => shot.status === "PASS"), "shot-plan-blocked");
assert(plans.shots.every((shot) => shot.checks.sourcePlaybackOneXOnly === true), "non-one-x-source-playback");
assert(plans.semanticWindowExactBoardBindingCount === 16, "semantic-window-board-binding-count");
assert(plans.shots.every((shot) => shot.checks.canonicalBoardSemanticWindowExact === true), "semantic-window-board-binding");
assert(plans.shots.every((shot) => shot.checks.editWindowStartsAtSemanticWindow === true), "edit-window-start-binding");
assert(plans.shots.every((shot) => shot.checks.editWindowEndsAtNextBeatStart === true), "edit-window-next-beat-binding");
assert(plans.shots.every((shot) => shot.timelineWindowRole === "EDIT_SLOT_THROUGH_NEXT_BEAT_START"), "timeline-window-role");
assert(plans.editWindowTailHold.minMs === 0 && plans.editWindowTailHold.maxMs === 980, "tail-hold-bounds");
assert(plans.shots.every((shot) => shot.syntheticCursorAdded === false), "synthetic-cursor-added");
assert(plans.shots.every((shot) => shot.screenDirection?.contract === "A1ScreenActionDirection/v1"), "screen-direction-contract");
assert(plans.shots.every((shot) => ["C4_BEZIER_EVENT_FOCUS_HOLD_V1", "CAP_NATIVE_RENDERED_NO_A1_CAMERA"].includes(shot.screenDirection?.cameraModel)), "event-camera-model");
assert(plans.shots.filter((shot) => shot.screenDirection.cameraModel === "CAP_NATIVE_RENDERED_NO_A1_CAMERA").map((shot) => shot.shotId).join(",") === "ED-02,ED-03,ED-24,ED-26", "cap-native-shot-membership");
assert(plans.shots.every((shot) => shot.screenDirection?.rules?.sourceTimeMonotonic === true), "source-time-monotonic");
assert(plans.shots.every((shot) => shot.sourceSegments.filter((segment) => segment.kind === "video").every((segment, index, segments) => index === 0 || segment.sourceStartMs >= segments[index - 1].sourceEndMs)), "source-time-regression");
assert(plans.shots.every((shot) => shot.screenDirection?.rules?.noEventNoMovement === true), "no-event-no-movement");
assert(plans.shots.every((shot) => shot.screenDirection?.rules?.forcedWideRestore === false), "forced-wide-restore");
assert(plans.shots.every((shot) => shot.screenDirection?.rules?.minimumFinalHoldMs >= 760), "final-hold-too-short");
assert(plans.shots.every((shot) => shot.screenDirection?.narrationActionTrack?.contract === "A1NarrationActionTrack/v1"), "narration-action-track-contract");
assert(plans.shots.every((shot) => ["EXACT_SRT_CUES", "CAP_NATIVE_EXACT_SRT_CUE_EVENT_BINDING"].includes(shot.screenDirection.narrationActionTrack.timingSource)), "narration-action-track-not-srt-bound");
assert(plans.shots.every((shot) => JSON.stringify(shot.screenDirection.narrationActionTrack.cues) === JSON.stringify(shot.cues)), "narration-cue-drift");
assert(plans.shots.every((shot) => new Set(shot.cameraTrack.map((keyframe) => `${keyframe.x}:${keyframe.y}:${keyframe.scale}`)).size <= 3), "camera-move-budget");
assert(plans.shots.filter((shot) => shot.screenDirection.attentionTrack.length === 0).every((shot) => shot.cameraTrack.every((keyframe) => keyframe.scale === 1)), "unverified-focus-moved-camera");
assert(plans.productionBoundary.userVisualApproval === "NOT_APPROVED", "plans-user-approval-drift");

const semanticSlices = new Map(plans.shots.map((shot) => [shot.shotId, shot]));
assert(semanticSlices.get("ED-02").screenDirection.narrationActionTrack.timingSource === "CAP_NATIVE_EXACT_SRT_CUE_EVENT_BINDING", "ed02-cap-native-cue-binding");
assert(semanticSlices.get("ED-02").cameraTrack.every((keyframe) => keyframe.scale === 1), "ed02-a1-camera-regressed");
assert(semanticSlices.get("ED-03").screenDirection.narrationActionTrack.timingSource === "CAP_NATIVE_EXACT_SRT_CUE_EVENT_BINDING", "ed03-cap-native-cue-binding");
assert(semanticSlices.get("ED-03").cameraTrack.every((keyframe) => keyframe.scale === 1), "ed03-a1-camera-regressed");
assert(semanticSlices.get("ED-24").screenDirection.narrationActionTrack.timingSource === "CAP_NATIVE_EXACT_SRT_CUE_EVENT_BINDING", "ed24-cap-native-cue-binding");
assert(semanticSlices.get("ED-24").cameraTrack.every((keyframe) => keyframe.scale === 1), "ed24-a1-camera-regressed");
assert(semanticSlices.get("ED-26").screenDirection.narrationActionTrack.timingSource === "CAP_NATIVE_EXACT_SRT_CUE_EVENT_BINDING", "ed26-cap-native-cue-binding");
assert(semanticSlices.get("ED-26").cameraTrack.every((keyframe) => keyframe.scale === 1), "ed26-a1-camera-regressed");
assert(semanticSlices.get("ED-02").screenDirection.narrationActionTrack.capNativeBindings.at(-1).event === "result_hold", "ed02-result-hold-not-bound-to-rewrite-cue");
assert(JSON.stringify(semanticSlices.get("ED-20").screenDirection.narrationActionTrack.cameraTargetAtMsList) === JSON.stringify([3550, 6292]), "ed20-camera-not-bound-to-api-and-deepseek-cues");
assert(semanticSlices.get("ED-25").screenDirection.narrationActionTrack.cameraTargetAtMs === 3632, "ed25-camera-not-bound-to-modify-cue");
assert(semanticSlices.get("ED-02").sourceSegments.every((segment) => segment.kind === "video"), "ed02-external-result-still-regressed");
assert(semanticSlices.get("ED-25").sourceSegments[1].outputStartMs === semanticSlices.get("ED-25").cues[1].startMs, "ed25-intercept-cue-boundary-drift");
assert(semanticSlices.get("ED-21").semanticSlice === "OPEN_EDIT_AND_CONFIRM_ONLY", "ed21-semantic-slice");
assert(semanticSlices.get("ED-22").semanticSlice === "SAVE_REOPEN_AND_VERSION_CONFIRM", "ed22-semantic-slice");
assert(semanticSlices.get("ED-27").semanticSlice === "LOCATE_GAP_AND_ENTER_REQUEST_ONLY", "ed27-semantic-slice");
assert(semanticSlices.get("ED-28").semanticSlice === "CANDIDATES_PICK_AND_APPLY_ONLY", "ed28-semantic-slice");
assert(semanticSlices.get("ED-27").sourceWindow.endMs <= 3400, "ed27-leaks-candidate-result");
assert(semanticSlices.get("ED-28").sourceWindow.startMs >= 39500, "ed28-leaks-request-entry");
assert(semanticSlices.get("ED-21").sourceWindow.endMs <= 4100, "ed21-leaks-version-history");
assert(semanticSlices.get("ED-22").sourceWindow.startMs >= 3000, "ed22-misses-save-window");

assert(manifest.contract === "A1ContinuousScreenEvidenceRender/v2", "manifest-contract");
assert(manifest.scope === "all", "manifest-scope");
assert(JSON.stringify(manifest.shotIds) === JSON.stringify(expectedShotIds), "render-shot-membership-drift");
assert(manifest.output.fullDecodePass === true, "render-full-decode");
assert(manifest.output.blackInterruptions === false, "render-black-interruption");
assert(manifest.cameraAudit.status === "PASS", "camera-audit");
assert(manifest.cache?.contract === "A1ContinuousScreenEvidenceRenderCache/v2", "render-cache-contract");
assert(manifest.cache?.atomicAdmission === true, "render-cache-atomic-admission");
assert(manifest.cache?.concurrencyLimit === 2, "render-cache-concurrency-limit");
assert(manifest.cursorAudit.syntheticCursorAdded === false, "render-synthetic-cursor");
assert(manifest.boundary.candidateOnly === true, "candidate-only-boundary");
assert(manifest.boundary.productionAdmission === false, "production-admission-drift");
assert(manifest.boundary.userVisualApproval === "NOT_APPROVED", "render-user-approval-drift");
const outputPath = path.join(root, manifest.output.path);
const contactPath = path.join(root, manifest.contactSheet.path);
assert(fs.existsSync(outputPath) && sha256File(outputPath) === manifest.output.sha256, "output-sha");
assert(fs.existsSync(contactPath) && sha256File(contactPath) === manifest.contactSheet.sha256, "contact-sha");
assert(surface.includes("CONTINUOUS_REAL_SOURCE_1X_SEMANTIC_SLICES_V2"), "review-surface-current-lane");
assert(surface.includes("all-sixteen-shot-v2/manifest.json"), "review-surface-manifest-route");
assert(surface.includes("insertion-pack-v2/insertion-manifest.json"), "review-surface-insertion-manifest-route");
assert(surface.includes("data-a1-screen-insertion-manifest-link"), "review-surface-insertion-link");

console.log(JSON.stringify({
  status: "PASS",
  sourceFamilyCount: registry.sourceFamilyCount,
  evidenceFrameCount: registry.families.flatMap((family) => family.evidenceFrames).length,
  shotCount: plans.shots.length,
  semanticWindowExactBoardBindingCount: plans.semanticWindowExactBoardBindingCount,
  editWindowTailHold: plans.editWindowTailHold,
  outputSha256: manifest.output.sha256,
  contactSha256: manifest.contactSheet.sha256,
  userVisualApproval: manifest.boundary.userVisualApproval,
}, null, 2));
