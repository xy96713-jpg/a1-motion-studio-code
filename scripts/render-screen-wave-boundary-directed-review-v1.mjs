#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {compileScreenBoundaryPlan} from "../apps/studio-next/src/lib/a1-screen-boundary-director-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const expected = process.argv[2];
assert.match(String(expected || ""), /^[a-f0-9]{64}$/u, "screen-boundary-review-cas-required");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
assert.equal(workspace.workspaceSha256, expected, "screen-boundary-review-cas-mismatch");
const authority = workspace.production.shotIntelligence.currentStoryboardAuthority;
assert.equal(authority.screenStoryboardWave?.approval?.status ?? "NOT_APPROVED", "NOT_APPROVED", "approved-screen-wave-review-render-forbidden");
const shotIds = authority.screenStoryboardWave.shotIds;
const shots = shotIds.map((shotId) => authority.shots.find((item) => item.shotId === shotId));
assert.equal(shots.length, 15);
const family = "generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/boundary-directed-review-v1";
const outDir = path.join(publicRoot, family);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/boundary-directed-review-v1");
fs.mkdirSync(outDir, {recursive: true}); fs.mkdirSync(artifactDir, {recursive: true});
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function runFfmpeg(args, label) {
  const run = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], {encoding: "utf8", maxBuffer: 2_000_000});
  if (run.status !== 0) throw new Error(`${label}:${String(run.stderr || "").slice(-5000)}`);
}
function probe(file) { return JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_name,width,height,avg_frame_rate:format=duration,size", "-of", "json", file], {encoding: "utf8"})); }
async function normalizedMae(leftFile, rightFile) {
  const left = await sharp(leftFile).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer();
  const right = await sharp(rightFile).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer();
  let sum = 0; for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]);
  return sum / (left.length * 255);
}

const boundaryFrames = [];
for (const shot of shots) {
  const video = publicFile(shot.screenStoryboard.video.publicUrl);
  assert.ok(fs.existsSync(video), `screen-boundary-video-missing:${shot.shotId}`);
  assert.equal(shaFile(video), shot.screenStoryboard.video.sha256, `screen-boundary-video-sha:${shot.shotId}`);
  const first = path.join(outDir, `${shot.shotId}-first.png`), last = path.join(outDir, `${shot.shotId}-last.png`);
  runFfmpeg(["-ss", "0.050", "-i", video, "-frames:v", "1", first], `first-${shot.shotId}`);
  const lastAt = Math.max(.05, (shot.screenStoryboard.video.durationMs - 80) / 1000);
  runFfmpeg(["-ss", lastAt.toFixed(3), "-i", video, "-frames:v", "1", last], `last-${shot.shotId}`);
  boundaryFrames.push({shotId: shot.shotId, first, last});
}
const visualDeltas = [];
for (let index = 0; index < boundaryFrames.length - 1; index += 1) visualDeltas.push(await normalizedMae(boundaryFrames[index].last, boundaryFrames[index + 1].first));
const classifyViewState = (shot) => {
  const text = JSON.stringify(shot.actionContract || {});
  if (/演示模式|口播稿/u.test(text)) return "PRESENTATION_MODE";
  if (/收稿|检查全文|建议/u.test(text)) return "REVIEW_MODE";
  return "EDITOR_MODE";
};
const viewStates = shots.map(classifyViewState);
const structureChangeIndexes = viewStates.slice(0, -1).map((state, index) => state !== viewStates[index + 1] && (state === "PRESENTATION_MODE" || viewStates[index + 1] === "PRESENTATION_MODE") ? index : null).filter(Number.isInteger);
const plan = compileScreenBoundaryPlan({shots: shots.map((shot, index) => ({shotId: shot.shotId, surfaceId: "REAL_WRITING_WORKBENCH", semanticKey: shot.actionContract?.handoff, actionContract: shot.actionContract, viewState: viewStates[index]})), visualDeltas, modulePivotIndexes: [4], structureChangeIndexes});
plan.sourceWorkspaceSha256 = workspace.workspaceSha256;
plan.sourceVideoSha256s = shots.map((shot) => ({shotId: shot.shotId, sha256: shot.screenStoryboard.video.sha256}));
plan.approvalEvidence = {directive: "执行", scope: "REVIEW_ONLY_BOUNDARY_DIRECTOR_RENDER", productionApproval: false};
plan.viewStates = shotIds.map((shotId, index) => ({shotId, viewState: viewStates[index]}));
plan.structureChangeIndexes = structureChangeIndexes;
plan.boundaries = plan.boundaries.map((boundary, index) => ({...boundary, fromLastFrameSha256: shaFile(boundaryFrames[index].last), toFirstFrameSha256: shaFile(boundaryFrames[index + 1].first)}));
const renderSources = [];
const internalModeRepairs = [];
for (const [index, shot] of shots.entries()) {
  const source = publicFile(shot.screenStoryboard.video.publicUrl);
  if (viewStates[index] !== "PRESENTATION_MODE") { renderSources.push(source); continue; }
  const scan = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", source, "-vf", "select='gt(scene,0.72)',metadata=print:file=-", "-an", "-f", "null", "-"], {encoding: "utf8", maxBuffer: 500_000});
  const event = [...String(scan.stdout || "").matchAll(/pts_time:([0-9.]+)[\s\S]{0,220}?lavfi\.scene_score=([0-9.]+)/gu)].map((match) => ({timeSec: Number(match[1]), score: Number(match[2])})).find((item) => item.timeSec >= .12 && item.timeSec <= shot.screenStoryboard.video.durationMs / 1000 - .3);
  if (!event) { renderSources.push(source); continue; }
  const repaired = path.join(outDir, `${shot.shotId}-internal-mode-smoothed.mp4`), duration = Math.min(.3, event.timeSec), offset = event.timeSec - duration;
  runFfmpeg(["-i", source, "-filter_complex", `[0:v]trim=start=0:end=${event.timeSec.toFixed(6)},setpts=PTS-STARTPTS[a];[0:v]trim=start=${event.timeSec.toFixed(6)},setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=${duration.toFixed(3)}:offset=${offset.toFixed(3)},fps=60,format=yuv420p[v]`, "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", repaired], `internal-mode-smooth-${shot.shotId}`);
  renderSources.push(repaired);
  internalModeRepairs.push({shotId: shot.shotId, detectedAtMs: Math.round(event.timeSec * 1000), sourceSceneScore: event.score, overlapMs: Math.round(duration * 1000), outputSha256: shaFile(repaired)});
}
plan.internalModeRepairs = internalModeRepairs;
plan.planSha256 = shaValue(plan);
fs.writeFileSync(path.join(outDir, "boundary-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);

const inputs = [], filters = [], durations = [];
for (const [index, shot] of shots.entries()) {
  inputs.push("-i", renderSources[index]);
  const baseDuration = Number(probe(renderSources[index]).format.duration);
  durations.push(baseDuration);
  filters.push(`[${index}:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=black,fps=60,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[v${index}]`);
}
let current = "v0", currentDuration = durations[0];
for (let index = 0; index < plan.boundaries.length; index += 1) {
  const boundary = plan.boundaries[index], next = `v${index + 1}`, output = `c${index}`;
  if (boundary.overlapMs === 0) filters.push(`[${current}][${next}]concat=n=2:v=1:a=0[${output}]`);
  else {
    const overlap = boundary.overlapMs / 1000, offset = currentDuration - overlap;
    filters.push(`[${current}][${next}]xfade=transition=fade:duration=${overlap.toFixed(3)}:offset=${offset.toFixed(3)}[${output}]`);
    currentDuration -= overlap;
  }
  currentDuration += durations[index + 1]; current = output;
}
const output = path.join(outDir, "screen-wave-15-boundary-directed-review-960x540.mp4");
runFfmpeg([...inputs, "-filter_complex", filters.join(";"), "-map", `[${current}]`, "-an", "-c:v", "libx264", "-crf", "19", "-preset", "veryfast", "-movflags", "+faststart", output], "boundary-directed-render");
const outputProbe = probe(output), outputRef = {publicUrl: `/${family}/${path.basename(output)}`, sha256: shaFile(output), width: 960, height: 540, durationMs: Math.round(Number(outputProbe.format.duration) * 1000), bytes: fs.statSync(output).size};

const sceneScan = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", output, "-vf", "select='gt(scene,0.72)',metadata=print:file=-", "-an", "-f", "null", "-"], {encoding: "utf8", maxBuffer: 2_000_000});
const extremeEvents = [...String(sceneScan.stdout || "").matchAll(/pts_time:([0-9.]+)[\s\S]{0,220}?lavfi\.scene_score=([0-9.]+)/gu)].map((match) => ({timeSec: Number(match[1]), score: Number(match[2])}));
const audit = {contract: "A1ScreenBoundaryDirectedReviewAudit/v1", status: sceneScan.status === 0 && extremeEvents.length === 0 ? "PASS" : "REVIEW_REQUIRED", fullDecodePass: sceneScan.status === 0, extremeSceneThreshold: .72, extremeEvents, planSha256: plan.planSha256, output: outputRef, cursorContinuityLimitation: "CURRENT_SOURCE_CURSOR_IS_BAKED; FINAL_MATURE_CURSOR_CONTINUITY_REQUIRES_TELEMETRY_DRIVEN_REBUILD", productionAdmission: false};
fs.writeFileSync(path.join(outDir, "audit-report.json"), `${JSON.stringify(audit, null, 2)}\n`);
for (const name of ["boundary-plan.json", "audit-report.json", path.basename(output)]) fs.copyFileSync(path.join(outDir, name), path.join(artifactDir, name));

const generatedAt = new Date().toISOString();
const committed = await withProjectLock(appRoot, async () => {
  const currentWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(currentWorkspace.workspaceSha256, workspace.workspaceSha256, "screen-boundary-review-persist-cas");
  let next = structuredClone(currentWorkspace);
  const currentAuthority = next.production.shotIntelligence.currentStoryboardAuthority;
  currentAuthority.screenBoundaryDirector = {contract: plan.contract, status: audit.status === "PASS" ? "READY_FOR_USER_CONTINUOUS_REVIEW" : "REVIEW_REQUIRED", planPublicUrl: `/${family}/boundary-plan.json`, auditPublicUrl: `/${family}/audit-report.json`, planSha256: plan.planSha256, output: outputRef, summary: plan.summary, cursorContinuityLimitation: audit.cursorContinuityLimitation, userVisualApproval: "NOT_APPROVED", productionAdmission: false, generatedAt};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, generatedAt));
  const event = createProductionEvent({workspace: currentWorkspace, action: "render-screen-wave-boundary-directed-review-v1", targetId: outputRef.sha256, payload: {planSha256: plan.planSha256, outputSha256: outputRef.sha256, summary: plan.summary, auditStatus: audit.status, userVisualApproval: "NOT_APPROVED", productionAdmission: false}, now: generatedAt});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: currentWorkspace.workspaceSha256, files: {"screen-storyboard-wave-15-v1/boundary-directed-review-v1/boundary-plan.json": plan, "screen-storyboard-wave-15-v1/boundary-directed-review-v1/audit-report.json": audit}});
});
console.log(JSON.stringify({status: currentAuthorityStatus(audit), planSha256: plan.planSha256, summary: plan.summary, output: outputRef, audit, workspaceSha256After: committed.workspaceSha256, boundaries: {userVisualApproval: "NOT_APPROVED", productionAdmission: false, assemblyCreated: false, resolveWritePerformed: false}}, null, 2));

function currentAuthorityStatus(result) { return result.status === "PASS" ? "READY_FOR_USER_CONTINUOUS_REVIEW" : "REVIEW_REQUIRED"; }
