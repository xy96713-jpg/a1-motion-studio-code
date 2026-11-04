import assert from "node:assert/strict";
import {assertResolvePackagingInsertPlan, buildResolvePackagingInsertPlan} from "../apps/studio-next/src/lib/a1-resolve-insert-contract-v1.mjs";

const readback = {status: "LIVE_READBACK", projectId: "p1", projectName: "Article", timelineId: "t1", timelineName: "Main", timelineSha256: "a".repeat(64), fps: 30};
const outputs = Array.from({length: 13}, (_, index) => ({shotId: `ED-${String(index + 1).padStart(2, "0")}`, route: index < 6 ? "OVERLAY_ALPHA" : "FULLSCREEN_PACKAGE", outputPath: `/package/ED-${String(index + 1).padStart(2, "0")}.png`, sha256: `${String(index + 1).padStart(2, "0")}${"b".repeat(62)}`}));
const events = outputs.map((output, index) => ({shotId: output.shotId, route: output.route, status: "ELIGIBILITY_PLAN", asset: {sha256: output.sha256}, assetPixelSources: [{sourceKind: "CANONICAL_INDEPENDENT_PACKAGE_PNG", sha256: output.sha256}], referenceContextBindings: [], forbiddenPixelSources: ["BASE_VIDEO_HOLD_FRAME", "PRESENTER", "MICROPHONE", "BOOM", "AUDIO", "SUBTITLE"], baseContextRole: "REFERENCE_ONLY_CONTEXT", timelineBinding: {projectId: "p1", timelineId: "t1", timelineSha256: readback.timelineSha256, evidence: {source: "RESOLVE_READBACK"}}, startFrame: index * 100, endFrame: index * 100 + 90, duration: 90, fps: 30}));
const handoff = {contract: "A1ResolvePackagingHandoff/v4", version: 4, status: "BOUND_LIVE_TIMELINE", timelineBinding: {projectId: "p1", timelineId: "t1", timelineSha256: readback.timelineSha256}, events, planSha256: "c".repeat(64)};
const exportManifest = {contract: "A1CanonicalPackageExport/v1", status: "EXPORTED_MANIFEST", outputCount: 13, manifestSha256: "d".repeat(64), outputs};
const plan = buildResolvePackagingInsertPlan({handoff, exportManifest, liveReadback: readback, snapshotName: "Main__a1-packaging-before-insert"});
assertResolvePackagingInsertPlan(plan);
assert.equal(plan.appendItems.length, 13);
assert.equal(plan.appendItems.filter((item) => item.route === "OVERLAY_ALPHA").every((item) => item.trackIndex === 2 && item.alphaRequired), true);
assert.equal(plan.appendItems.filter((item) => item.route === "FULLSCREEN_PACKAGE").every((item) => item.trackIndex === 3 && !item.alphaRequired), true);
assert.throws(() => buildResolvePackagingInsertPlan({handoff, exportManifest, liveReadback: {...readback, timelineId: "wrong"}, snapshotName: "x"}), /identity-mismatch/u);
assert.throws(() => buildResolvePackagingInsertPlan({handoff, exportManifest, liveReadback: readback}), /rollback-snapshot-required/u);
assert.throws(() => buildResolvePackagingInsertPlan({handoff, exportManifest: {...exportManifest, outputs: outputs.map((output, index) => index === 0 ? {...output, sha256: "e".repeat(64)} : output)}, liveReadback: readback, snapshotName: "x"}), /export-parity-failed/u);
assert.throws(() => buildResolvePackagingInsertPlan({handoff: {...handoff, events: events.map((event, index) => index === 0 ? {...event, assetPixelSources: [{sourceKind: "PRESENTER", sha256: event.asset.sha256}]} : event)}, exportManifest, liveReadback: readback, snapshotName: "x"}), /forbidden-lineage/u);
console.log(JSON.stringify({status: "PASS", contract: "A1ResolvePackagingInsertPlan/v1", shotCount: plan.appendItems.length, overlayTrack: 2, fullscreenTrack: 3, rollbackRequired: true, identityBound: true, parityBound: true, writerExecution: false}));
