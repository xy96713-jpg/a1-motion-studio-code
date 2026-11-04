#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const reportPath = path.join(root, ".codex-artifacts/system-progress-system-line/causal-writing-workbench-v1/report.json");
const capture = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const outputRelative = "generated/system-line/editorial-asset-workbench-v1/source-proof-lanes/ed02-real-writing-workbench/source-proof-contact-sheet.png";
const outputPath = path.join(publicRoot, outputRelative);

const result = withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("writing-workbench-source-proof-assembly-must-remain-empty");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("writing-workbench-source-proof-runtime-must-be-frozen");
  const shot = current.production.shotVisualCoveragePlan.shotPlans.find((item) => item.shotId === "ED-02");
  if (!shot || shot.route !== "SCREEN_EVIDENCE" || shot.packageDecision !== "NO_PACKAGE") throw new Error("writing-workbench-source-proof-ed02-route-invalid");
  const frames = ["BEFORE", "ACTION", "RESULT"].map((role) => shot.screenStateBindings.find((item) => item.role === role));
  if (frames.some((frame) => !frame)) throw new Error("writing-workbench-source-proof-screen-state-missing");
  for (const frame of frames) {
    const file = publicFile(frame.publicUrl);
    if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== frame.sha256) throw new Error(`writing-workbench-source-proof-frame-sha:${frame.role}`);
  }
  if (!capture.media?.videoPublicUrl || !fs.existsSync(publicFile(capture.media.videoPublicUrl)) || sha256(fs.readFileSync(publicFile(capture.media.videoPublicUrl))) !== capture.media.videoSha256) throw new Error("writing-workbench-source-proof-video-sha");
  const tileWidth = 640;
  const imageHeight = 360;
  const labelHeight = 48;
  const tileBuffers = await Promise.all(frames.map(async (frame) => {
    const image = await sharp(publicFile(frame.publicUrl)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0f10"/><text x="18" y="31" fill="#d7f246" font-family="Arial, sans-serif" font-size="20" font-weight="700">ED-02 · ${frame.role} · REAL SOURCE</text></svg>`);
    return sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 4, background: "#0b0f10"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  }));
  const contactSheet = await sharp({create: {width: tileWidth * 3, height: imageHeight + labelHeight, channels: 4, background: "#070a0b"}}).composite(tileBuffers.map((input, index) => ({input, left: index * tileWidth, top: 0}))).png().toBuffer();
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, contactSheet);
  const laneBody = {
    contract: "A1SourceProofBoardLane/v1",
    version: 1,
    laneId: "ED-02-REAL-WRITING-WORKBENCH",
    status: "READY_FOR_USER_SOURCE_PROOF_REVIEW",
    shotId: "ED-02",
    route: "SCREEN_EVIDENCE",
    packageDecision: "NO_PACKAGE",
    informationOwner: "REAL_SOURCE",
    sourceType: "VERIFIED_REAL_LOCAL_WRITING_WORKBENCH_RUNTIME",
    sourceRuntime: capture.source,
    captureChecks: capture.checks,
    video: {publicUrl: capture.media.videoPublicUrl, sha256: capture.media.videoSha256, durationSeconds: capture.media.durationSeconds, width: capture.media.width, height: capture.media.height},
    frames: frames.map((frame) => ({role: frame.role, publicUrl: frame.publicUrl, sha256: frame.sha256, focus: frame.focus})),
    contactSheet: {publicUrl: `/${outputRelative}`, sha256: sha256(contactSheet), width: tileWidth * 3, height: imageHeight + labelHeight},
    actionId: shot.screenActionId,
    screenActions: shot.screenActions,
    boardBoundary: {includedInPackageCount: false, includedInOriginalStaticBoardApproval: false, generatedVisual: false, imagegenUsed: false, productionAdmitted: false, assemblyBound: false, motionAllowed: false, resolveAllowed: false, userVisualApproval: "NOT_APPROVED"},
    generatedAt: now,
  };
  const lane = {...laneBody, laneSha256: sha256(laneBody)};
  const next = structuredClone(current);
  const nextShot = next.production.shotVisualCoveragePlan.shotPlans.find((item) => item.shotId === "ED-02");
  const resultFrame = frames.find((frame) => frame.role === "RESULT");
  nextShot.preview = {kind: "VERIFIED_SCREEN_SOURCE", publicUrl: resultFrame.publicUrl, sha256: resultFrame.sha256, provenance: "CURRENT_REAL_WRITING_WORKBENCH_SOURCE_PROOF"};
  nextShot.sourcePreview = {kind: "REAL_WRITING_WORKBENCH_SOURCE_PROOF_LANE", publicUrl: `/${outputRelative}`, sha256: lane.contactSheet.sha256, provenance: "CURRENT_REAL_WRITING_WORKBENCH_SOURCE_PROOF"};
  next.production.shotIntelligence.wholeFilmStaticBoard.sourceProofLanes = [lane];
  next.production.shotIntelligence.wholeFilmStaticBoard.sourceProofReview = {status: "READY_FOR_USER_SOURCE_PROOF_REVIEW", laneId: lane.laneId, laneSha256: lane.laneSha256, includedInOriginalApproval: false, userVisualApproval: "NOT_APPROVED", packageCountUnchanged: true, assemblyCreated: false, motionAllowed: false};
  const event = createProductionEvent({workspace: current, action: "bind-writing-workbench-source-proof-board-lane", targetId: lane.laneSha256, payload: {laneId: lane.laneId, shotId: lane.shotId, laneSha256: lane.laneSha256, contactSheetSha256: lane.contactSheet.sha256, videoSha256: lane.video.sha256, packageCountUnchanged: true, packageDecision: "NO_PACKAGE", assemblyCreated: false, motionAllowed: false}, now});
  next.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `bind-writing-workbench-source-proof-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"source-proof-lanes/ed02-real-writing-workbench/lane.json": lane}, binaryFiles: {[outputRelative]: contactSheet}});
  return {status: "PASS", laneId: lane.laneId, laneSha256: lane.laneSha256, contactSheet: lane.contactSheet, video: lane.video, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: persisted.workspaceSha256, transitionSha256: persisted.transitionSha256, packageCountUnchanged: true, packageDecision: "NO_PACKAGE", assemblyCreated: false, motionAllowed: false};
});
console.log(JSON.stringify(await result, null, 2));
