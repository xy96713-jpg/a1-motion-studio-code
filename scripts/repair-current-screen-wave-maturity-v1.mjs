#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const expected = process.argv[2];
assert.match(String(expected || ""), /^[a-f0-9]{64}$/u, "screen-wave-maturity-repair-cas-required");

const family = "generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/maturity-repair-v1";
const outDir = path.join(publicRoot, family);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/maturity-repair-v1");
const waveReportPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/report.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
assert.equal(workspace.workspaceSha256, expected, "screen-wave-maturity-repair-cas-mismatch");
const authority = workspace.production.shotIntelligence.currentStoryboardAuthority;
const shotIds = authority.screenStoryboardWave?.shotIds || [];
assert.equal(shotIds.length, 15, "screen-wave-15-required");
assert.equal(authority.screenStoryboardWave.approval?.status ?? "NOT_APPROVED", "NOT_APPROVED", "approved-wave-repair-forbidden");
const waveReport = JSON.parse(fs.readFileSync(waveReportPath, "utf8"));
const originalById = new Map(waveReport.shots.map((item) => [item.shotId, item]));
fs.mkdirSync(outDir, {recursive: true});
fs.mkdirSync(artifactDir, {recursive: true});

const repairSpecs = {
  "ED-21": {kind: "EARLY_ACTION_RETIME_AND_FOCUS", sourceActionMs: 7740, targetActionMs: 3600, focusStartMs: 3150, focusX: .52, focusY: .48, zoom: 1.18, frameTimes: {setup: 180, action: 3600, result: 7650}},
  "ED-25": {kind: "RESULT_PROOF_FOCUS", focusStartMs: 2200, focusX: .79, focusY: .22, zoom: 1.42, frameTimes: {setup: 180, action: 2820, result: 5200}},
  "ED-27": {kind: "REQUEST_STATE_FOCUS", focusStartMs: 7900, focusX: .55, focusY: .56, zoom: 1.28, frameTimes: {setup: 180, action: 9150, result: 12100}},
};

function runFfmpeg(args, label) {
  const run = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], {encoding: "utf8", maxBuffer: 1_000_000});
  if (run.status !== 0) throw new Error(`${label}:${String(run.stderr || "").slice(-4000)}`);
}

function probe(file) {
  return JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_name,width,height,avg_frame_rate:format=duration,size", "-of", "json", file], {encoding: "utf8"}));
}

async function makeBoard(shot, video, spec, frames) {
  const tileWidth = 480, tileHeight = 270, labelHeight = 82, headerHeight = 78;
  const labels = ["SETUP", "ACTION", "RESULT"];
  const descriptions = [shot.screenStoryboard.actionContract.before, shot.screenStoryboard.actionContract.hold, shot.screenStoryboard.actionContract.after];
  const frameEntries = Object.values(frames);
  const tiles = [];
  for (let index = 0; index < frameEntries.length; index += 1) {
    const entry = frameEntries[index];
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111516"/><text x="14" y="25" fill="#dfff68" font-family="Arial" font-size="14" font-weight="700">${labels[index]}</text><text x="14" y="50" fill="#d9dedb" font-family="Arial" font-size="12">${esc(descriptions[index].slice(0, 56))}</text><text x="14" y="70" fill="#7f8a84" font-family="monospace" font-size="10">${entry.timeMs}ms · ${spec.kind}</text></svg>`);
    tiles.push(await sharp(publicFile(entry.publicUrl)).resize(tileWidth, tileHeight, {fit: "cover"}).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#111516"}).composite([{input: label, left: 0, top: 0}]).png().toBuffer());
  }
  const header = Buffer.from(`<svg width="${tileWidth * 3}" height="${headerHeight}"><rect width="100%" height="100%" fill="#090c0d"/><text x="20" y="30" fill="#f2f4ef" font-family="Arial" font-size="18" font-weight="700">${esc(`${shot.shotId} · ${shot.screenStoryboard.sourceText}`.slice(0, 76))}</text><text x="20" y="57" fill="#8faeff" font-family="Arial" font-size="12">CURRENT SOURCE PIXELS · MATURITY REPAIR · USER REVIEW REQUIRED</text></svg>`);
  const board = path.join(outDir, `${shot.shotId}-screen-storyboard.png`);
  await sharp({create: {width: tileWidth * 3, height: headerHeight + tileHeight + labelHeight, channels: 4, background: "#090c0d"}}).composite([{input: header, left: 0, top: 0}, ...tiles.map((input, index) => ({input, left: index * tileWidth, top: headerHeight}))]).png().toFile(board);
  return {publicUrl: `/${family}/${path.basename(board)}`, sha256: shaFile(board), width: 1440, height: 430};
}

const repaired = [];
for (const [shotId, spec] of Object.entries(repairSpecs)) {
  const shot = authority.shots.find((item) => item.shotId === shotId);
  const screen = shot.screenStoryboard;
  const source = publicFile(screen.video.publicUrl);
  assert.ok(fs.existsSync(source), `repair-source-missing:${shotId}`);
  assert.equal(shaFile(source), screen.video.sha256, `repair-source-sha-drift:${shotId}`);
  const durationMs = shot.timeRange.durationMs;
  const base = path.join(outDir, `${shotId}-base.mp4`);
  if (spec.sourceActionMs) {
    const factorA = spec.targetActionMs / spec.sourceActionMs;
    const factorB = (durationMs - spec.targetActionMs) / (durationMs - spec.sourceActionMs);
    runFfmpeg(["-i", source, "-filter_complex", `[0:v]trim=start=0:end=${(spec.sourceActionMs / 1000).toFixed(6)},setpts=(PTS-STARTPTS)*${factorA.toFixed(9)}[a];[0:v]trim=start=${(spec.sourceActionMs / 1000).toFixed(6)},setpts=(PTS-STARTPTS)*${factorB.toFixed(9)}[b];[a][b]concat=n=2:v=1:a=0,fps=60,format=yuv420p[v]`, "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", base], `retime-${shotId}`);
  } else fs.copyFileSync(source, base);
  const output = path.join(outDir, `${shotId}-maturity-repaired.mp4`);
  const startFrame = Math.round(spec.focusStartMs * 60 / 1000);
  const maxFrames = Math.round(durationMs * 60 / 1000);
  const focusX = `(iw-iw/zoom)*${spec.focusX}`;
  const focusY = `(ih-ih/zoom)*${spec.focusY}`;
  const zoomExpression = `if(lt(on,${startFrame}),1,min(${spec.zoom},1+(on-${startFrame})*0.012))`;
  runFfmpeg(["-i", base, "-vf", `zoompan=z='${zoomExpression}':x='${focusX}':y='${focusY}':d=1:s=960x540:fps=60,trim=end_frame=${maxFrames},setpts=PTS-STARTPTS,format=yuv420p`, "-an", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", output], `focus-${shotId}`);
  fs.unlinkSync(base);
  const normalized = path.join(outDir, `${shotId}-normalized.mp4`);
  runFfmpeg(["-i", output, "-vf", `setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1,trim=duration=${(durationMs / 1000).toFixed(3)},fps=60,format=yuv420p`, "-an", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", normalized], `normalize-${shotId}`);
  fs.renameSync(normalized, output);
  const outputProbe = probe(output);
  const actualDurationMs = Math.round(Number(outputProbe.format.duration) * 1000);
  assert.ok(Math.abs(actualDurationMs - durationMs) <= 80, `repair-duration-drift:${shotId}:${actualDurationMs}:${durationMs}`);
  const frames = {};
  for (const [state, timeMs] of Object.entries(spec.frameTimes)) {
    const frame = path.join(outDir, `${shotId}-${state}.png`);
    runFfmpeg(["-ss", (timeMs / 1000).toFixed(3), "-i", output, "-frames:v", "1", frame], `frame-${shotId}-${state}`);
    frames[state] = {publicUrl: `/${family}/${path.basename(frame)}`, sha256: shaFile(frame), timeMs};
  }
  const board = await makeBoard(shot, output, spec, frames);
  const lineage = {contract: "A1ScreenPixelSourceLineage/v1", status: "PASS", policy: "TIMING_REFERENCE_NEVER_REPLACES_PIXELS", sourcePublicUrl: screen.video.publicUrl, sourceSha256: screen.video.sha256, sourceKind: "CURRENT_CLEAN_BACKGROUND_SCREEN", transformKind: spec.kind, forbiddenCandidatePixelSource: false, identityFrames: Object.fromEntries(Object.entries(frames).map(([key, value]) => [key, value.sha256])), requiresActualPixelReview: true};
  const video = {publicUrl: `/${family}/${path.basename(output)}`, sha256: shaFile(output), width: 960, height: 540, durationMs: actualDurationMs};
  repaired.push({shotId, spec, video, frames, board, lineage});
}

const repairedById = new Map(repaired.map((item) => [item.shotId, item]));
const lineageBackfills = [];
for (const shotId of shotIds) {
  if (repairedById.has(shotId)) continue;
  const shot = authority.shots.find((item) => item.shotId === shotId);
  const screen = shot.screenStoryboard;
  if (screen.pixelSourceLineage?.status === "PASS") continue;
  const original = originalById.get(shotId);
  assert.ok(original?.video?.publicUrl && original?.video?.sha256, `lineage-source-required:${shotId}`);
  const originalFile = publicFile(original.video.publicUrl);
  assert.ok(fs.existsSync(originalFile), `lineage-source-file-missing:${shotId}`);
  assert.equal(shaFile(originalFile), original.video.sha256, `lineage-source-sha-drift:${shotId}`);
  lineageBackfills.push({shotId, lineage: {contract: "A1ScreenPixelSourceLineage/v1", status: "PASS", policy: "TIMING_REFERENCE_NEVER_REPLACES_PIXELS", sourcePublicUrl: original.video.publicUrl, sourceSha256: original.video.sha256, sourceKind: "CURRENT_CLEAN_BACKGROUND_SCREEN", transformKind: "CURRENT_NARRATION_RETIME", forbiddenCandidatePixelSource: false, identityFrames: Object.fromEntries(Object.entries(screen.frames).map(([key, value]) => [key, value.sha256])), requiresActualPixelReview: true}});
}

const finalScreens = shotIds.map((shotId) => {
  const shot = authority.shots.find((item) => item.shotId === shotId);
  const repair = repairedById.get(shotId);
  return {shotId, video: repair?.video || shot.screenStoryboard.video};
});
const anomalyResults = [];
for (const item of finalScreens) {
  const file = publicFile(item.video.publicUrl);
  const decode = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", file, "-vf", "blackdetect=d=0.05:pix_th=0.02,select='gt(scene,0.70)',metadata=print:file=-", "-an", "-f", "null", "-"], {encoding: "utf8", maxBuffer: 1_000_000});
  const text = `${decode.stdout || ""}\n${decode.stderr || ""}`;
  const blackFrames = [...text.matchAll(/black_start:([0-9.]+).*?black_end:([0-9.]+)/gu)].map((match) => ({startSec: Number(match[1]), endSec: Number(match[2])}));
  const sceneScores = [...text.matchAll(/pts_time:([0-9.]+)[\s\S]{0,220}?lavfi\.scene_score=([0-9.]+)/gu)].map((match) => ({timeSec: Number(match[1]), score: Number(match[2])}));
  const rapidPairs = sceneScores.slice(1).filter((event, index) => event.timeSec - sceneScores[index].timeSec <= .25).map((event, index) => ({from: sceneScores[index], to: event}));
  anomalyResults.push({shotId: item.shotId, decodePass: decode.status === 0, blackFrames, extremeSceneEvents: sceneScores, rapidExtremePairs: rapidPairs, status: decode.status === 0 && blackFrames.length === 0 && rapidPairs.length === 0 ? "PASS" : "REVIEW_REQUIRED"});
}

const segmentDir = path.join(outDir, "segments");
fs.mkdirSync(segmentDir, {recursive: true});
const segmentFiles = [];
for (const [index, item] of finalScreens.entries()) {
  const segment = path.join(segmentDir, `${String(index + 1).padStart(2, "0")}-${item.shotId}.mp4`);
  runFfmpeg(["-i", publicFile(item.video.publicUrl), "-vf", "scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=black,fps=60,format=yuv420p", "-an", "-c:v", "libx264", "-crf", "19", "-preset", "veryfast", segment], `review-segment-${item.shotId}`);
  segmentFiles.push(segment);
}
const concatList = path.join(outDir, "concat.txt");
fs.writeFileSync(concatList, `${segmentFiles.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n")}\n`);
const reel = path.join(outDir, "screen-wave-15-continuous-review-960x540.mp4");
runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", "-movflags", "+faststart", reel], "continuous-review-reel");
const reelProbe = probe(reel);
const reelRef = {publicUrl: `/${family}/${path.basename(reel)}`, sha256: shaFile(reel), width: 960, height: 540, durationMs: Math.round(Number(reelProbe.format.duration) * 1000), bytes: fs.statSync(reel).size};

const generatedAt = new Date().toISOString();
const failures = anomalyResults.flatMap((item) => item.status === "PASS" ? [] : [`${item.shotId}:transient-window-review-required`]);
const report = {contract: "A1ScreenWaveMaturityRepair/v1", status: failures.length ? "READY_FOR_USER_REVIEW_WITH_FLAGGED_TRANSIENTS" : "READY_FOR_USER_CONTINUOUS_REVIEW", sourceWorkspaceSha256: workspace.workspaceSha256, repairedShotIds: repaired.map((item) => item.shotId), lineageBackfilledShotIds: lineageBackfills.map((item) => item.shotId), allLineageShotIds: shotIds, anomalyAudit: {contract: "A1ScreenTransientWindowAudit/v1", status: failures.length ? "REVIEW_REQUIRED" : "PASS", checks: ["full-decode", "black-frame-runs-over-50ms", "paired-extreme-scene-events-under-250ms"], results: anomalyResults, failures}, continuousReview: reelRef, boundaries: {userVisualApproval: "NOT_APPROVED", productionAdmission: false, assemblyCreated: false, motionSpecRecompiled: false, resolveWritePerformed: false}, generatedAt};
report.repairSha256 = shaValue(report);
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
for (const name of fs.readdirSync(outDir).filter((name) => /\.(json|png|mp4)$/u.test(name))) fs.copyFileSync(path.join(outDir, name), path.join(artifactDir, name));

const committed = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(current.workspaceSha256, workspace.workspaceSha256, "screen-wave-maturity-persist-cas");
  let next = structuredClone(current);
  const nextAuthority = next.production.shotIntelligence.currentStoryboardAuthority;
  for (const repair of repaired) {
    const screen = nextAuthority.shots.find((item) => item.shotId === repair.shotId).screenStoryboard;
    screen.video = repair.video;
    screen.frames = repair.frames;
    screen.board = repair.board;
    screen.pixelSourceLineage = repair.lineage;
    screen.versionId = `${repair.shotId.toLowerCase()}-maturity-${repair.video.sha256.slice(0, 12)}`;
    screen.revisionSha256 = shaValue({shotId: repair.shotId, video: repair.video, frames: repair.frames, board: repair.board, narrationBinding: screen.narrationBinding, pixelSourceLineage: repair.lineage});
    screen.reviewStatus = "READY_FOR_USER_SHOT_BY_SHOT_REVIEW";
  }
  for (const backfill of lineageBackfills) nextAuthority.shots.find((item) => item.shotId === backfill.shotId).screenStoryboard.pixelSourceLineage = backfill.lineage;
  nextAuthority.screenWaveMaturityRepair = {contract: report.contract, status: report.status, reportPublicUrl: `/${family}/report.json`, repairSha256: report.repairSha256, repairedShotIds: report.repairedShotIds, lineageBackfilledShotIds: report.lineageBackfilledShotIds, transientAuditStatus: report.anomalyAudit.status, continuousReview: reelRef, userVisualApproval: "NOT_APPROVED", productionAdmission: false, generatedAt};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, generatedAt));
  const event = createProductionEvent({workspace: current, action: "repair-current-screen-wave-maturity-v1", targetId: report.repairSha256, payload: {repairedShotIds: report.repairedShotIds, lineageBackfilledShotIds: report.lineageBackfilledShotIds, transientAuditStatus: report.anomalyAudit.status, continuousReviewSha256: reelRef.sha256, userVisualApproval: "NOT_APPROVED", productionAdmission: false}, now: generatedAt});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"screen-storyboard-wave-15-v1/maturity-repair-v1/report.json": report}});
});

console.log(JSON.stringify({status: report.status, repairedShotIds: report.repairedShotIds, lineageBackfilledShotIds: report.lineageBackfilledShotIds, transientAuditStatus: report.anomalyAudit.status, failures, continuousReview: reelRef, repairSha256: report.repairSha256, workspaceSha256After: committed.workspaceSha256, boundaries: report.boundaries}, null, 2));
