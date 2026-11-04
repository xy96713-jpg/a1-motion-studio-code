#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
const requested = (process.env.A1_TELEMETRY_SCREEN_SHOTS || "").split(",").map((item) => item.trim()).filter(Boolean);
const requiredCaptureScale = Math.max(1, Math.min(3, Number(process.env.A1_CAPTURE_SCALE || 1)));
const shotIds = requested.length ? requested : plan.shots.map((shot) => shot.shotId);
if (!shotIds.length || shotIds.some((shotId) => !plan.shots.some((shot) => shot.shotId === shotId))) throw new Error("telemetry-screen-wave-shot-set-invalid");
const runId = new Date().toISOString().replace(/[:.]/gu, "-");
const workRoot = path.join(root, "work/telemetry-screen-wave-v1/runs", runId);
const publicFamily = `generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/telemetry-driven-screen-wave-v1/${runId}`;
const publicRoot = path.join(root, "apps/studio-next/public", publicFamily);
const artifactRoot = path.join(root, ".codex-artifacts/system-progress/telemetry-driven-screen-render-adapter-v1/runs", runId);
const cap = "/Applications/Cap.app/Contents/MacOS/cap-cli";
const ffmpeg = path.join(root, ".tools/bin/ffmpeg"), ffprobe = path.join(root, ".tools/bin/ffprobe");
fs.mkdirSync(workRoot, {recursive: true}); fs.mkdirSync(publicRoot, {recursive: true}); fs.mkdirSync(artifactRoot, {recursive: true});
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args, options = {}) => new Promise((resolve, reject) => { const child = spawn(command, args, {cwd: root, env: {...process.env, ...(options.env || {})}, stdio: ["ignore", "pipe", "pipe"]}); let stdout = "", stderr = ""; child.stdout.on("data", (chunk) => stdout += chunk); child.stderr.on("data", (chunk) => stderr += chunk); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve({stdout, stderr}) : reject(new Error(`${path.basename(command)} exit=${code}:${stderr || stdout}`))); });

async function capture(shotId) {
  const planShot = plan.shots.find((shot) => shot.shotId === shotId), captureRoot = path.join(root, `work/headless-${shotId.toLowerCase()}-v1`);
  if (fs.existsSync(captureRoot)) for (const directory of fs.readdirSync(captureRoot).sort().reverse()) {
    const reportPath = path.join(captureRoot, directory, "report.json"); if (!fs.existsSync(reportPath)) continue;
    const cached = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const cachedScale = Number(cached.captureDensity?.deviceScaleFactor || 1);
    if (cached.cursorPixelPolicy === "SOURCE_VIDEO_CURSOR_HIDDEN_TELEMETRY_ONLY" && cachedScale >= requiredCaptureScale && cached.storyboardBinding?.versionId === planShot.authority.versionId && cached.storyboardBinding?.revisionSha256 === planShot.authority.revisionSha256 && fs.existsSync(path.join(root, cached.output.path))) return {...cached, reportPath: path.relative(root, reportPath), cacheReuse: true, cacheBinding: {storyboardRevisionCurrent: true,requiredCaptureScale,cachedScale,sourceCameraRecipeSha256: cached.storyboardBinding?.cameraRecipeSha256 || null, reviewCameraRecipeSha256: planShot.execution.cameraRecipe.recipeSha256, cameraRecompiledFromCurrentPlan: true, sourceWorkspaceSha256: cached.storyboardBinding?.workspaceSha256 || cached.sourceWorkspaceSha256, reviewWorkspaceSha256: plan.source.workspaceSha256, workspaceMismatchAcceptedForReviewOnly: (cached.storyboardBinding?.workspaceSha256 || cached.sourceWorkspaceSha256) !== plan.source.workspaceSha256}};
  }
  const result = await run(process.execPath, ["scripts/capture-headless-writing-workbench-shot-v1.mjs"], {env: {A1_HEADLESS_SHOT_ID: shotId}});
  const report = JSON.parse(result.stdout);
  if (report.cursorPixelPolicy !== "SOURCE_VIDEO_CURSOR_HIDDEN_TELEMETRY_ONLY" || report.headedWindowCreated !== false || report.frontmostApplicationMutation !== false) throw new Error(`telemetry-capture-isolation:${shotId}`);
  return report;
}
const captureReports = [];
for (let index = 0; index < shotIds.length; index += 2) captureReports.push(...await Promise.all(shotIds.slice(index, index + 2).map(capture)));

const fixtures = [];
for (const report of captureReports) {
  const slug = report.shotId.toLowerCase(), project = path.join(workRoot, `${slug}.cap`), raw = path.join(workRoot, `${slug}-raw.mp4`), review = path.join(workRoot, `${slug}-review-960x540.mp4`);
  await run(process.execPath, ["scripts/build-cap-project-from-background-capture-v1.mjs", report.reportPath, project], {env: {A1_REVIEW_ONLY_RECOMPILE_CAMERA: "1"}});
  await run(cap, ["export", project, "--output", raw, "--fps", "60", "--resolution", "960x540", "--quality", "maximum", "--json"]);
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-map", "0:v:0", "-an", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", review]);
  const receipt = JSON.parse(fs.readFileSync(path.join(project, "a1-background-receipt.json"), "utf8")), timeline = JSON.parse(fs.readFileSync(path.join(project, "a1-interaction-timeline.json"), "utf8"));
  const probe = JSON.parse((await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size", "-of", "json", review])).stdout), video = probe.streams.find((stream) => stream.codec_type === "video");
  const durationMs=Math.round(Number(probe.format.duration)*1000),primaryActor=timeline.generatedActors[0]||null,peakMs=primaryActor?Math.min(durationMs-450,Math.max(Number(primaryActor.phases?.peakMs||0),Number(primaryActor.phases?.enterMs||0)+220)):timeline.interactions[0]?.phases?.peakMs??Math.round(durationMs*.5),resultMs=Math.max(0,durationMs-450),peak=path.join(workRoot,`${slug}-peak.png`),result=path.join(workRoot,`${slug}-result.png`);
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (peakMs / 1000).toFixed(3), "-i", review, "-frames:v", "1", peak]);
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (resultMs / 1000).toFixed(3), "-i", review, "-frames:v", "1", result]);
  const failures = [];
  if (timeline.status !== "PASS" || timeline.cursor.bakedIntoSource !== false || timeline.camera.length > 1 || timeline.generatedActors.length > 1) failures.push("INTERACTION_TIMELINE");
  if (receipt.sourceVideo.cursorHidden !== true || receipt.interactionTimeline.timelineSha256 !== timeline.timelineSha256) failures.push("CURSOR_OR_TIMELINE_BINDING");
  if (video?.width !== 960 || video?.height !== 540 || video?.r_frame_rate !== "60/1") failures.push("VIDEO_CONTRACT");
  fixtures.push({id: report.shotId, status: failures.length ? "FAIL" : "PASS", sourceReport: report.reportPath, sourceVideo: {path: report.output.path, sha256: report.output.sha256, cursorHidden: true}, interactionTimeline: {sha256: timeline.timelineSha256, maximumSyncOffsetMs: timeline.audit.maximumSyncOffsetMs, generatedActorCount: timeline.generatedActors.length, generatedActors: timeline.generatedActors.map((actor) => ({kind: actor.kind, semanticRole: actor.semanticRole, reason: actor.reason, evidence: actor.evidence, phases: actor.phases})), suppressionReasons:timeline.emphasisPlan?.suppressionReasons||[], semanticZoomCount: timeline.camera.length}, annotationQualification: report.textRangeEvidence?.map((item) => ({event: item.event, status: item.qualification?.status, actor: item.qualification?.actor, reasons: item.qualification?.reasons || []})) || [], capProject: path.relative(root, project), reviewVideo: {path: path.relative(root, review), sha256: sha(review), durationMs, width: video?.width, height: video?.height, fps: video?.r_frame_rate}, peakFrame: {path: path.relative(root, peak), sha256: sha(peak), timeMs: peakMs, timingBasis:primaryActor?"ACTOR_PEAK_OR_ENTER_PLUS_220MS":"PRIMARY_INTERACTION_PEAK"}, resultFrame: {path: path.relative(root, result), sha256: sha(result), timeMs: resultMs, timingBasis:"FINAL_READABLE_HOLD"}, failures});
}
const list = path.join(workRoot, "concat.txt");
fs.writeFileSync(list, `${fixtures.map((fixture) => `file '${path.join(root, fixture.reviewVideo.path).replaceAll("'", "'\\''")}'`).join("\n")}\n`);
const reel = path.join(workRoot, `telemetry-driven-${fixtures.length}-shot-review-960x540.mp4`);
await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", reel]);
const tiles=[];for(const fixture of fixtures){const actor=fixture.interactionTimeline.generatedActors[0]?.kind||"NONE";for(const [state,frame] of [["PEAK",fixture.peakFrame],["RESULT",fixture.resultFrame]]){const label=Buffer.from(`<svg width="480" height="34"><rect width="480" height="34" fill="#0b1011"/><text x="12" y="22" font-family="Arial" font-size="15" font-weight="700" fill="#f4f0e8">${fixture.id} · ${state}</text><text x="468" y="22" text-anchor="end" font-family="monospace" font-size="11" fill="#79aab0">${actor}</text></svg>`),image=await sharp(path.join(root,frame.path)).resize(480,270).png().toBuffer();tiles.push(await sharp({create:{width:480,height:304,channels:4,background:"#0b1011"}}).composite([{input:label,left:0,top:0},{input:image,left:0,top:34}]).png().toBuffer());}}
const columns = 4, rows = Math.ceil(tiles.length / columns), contact = path.join(workRoot, "telemetry-driven-contact-sheet.png");
await sharp({create: {width: columns * 480, height: rows * 304, channels: 4, background: "#070a0b"}}).composite(tiles.map((input, index) => ({input, left: index % columns * 480, top: Math.floor(index / columns) * 304}))).png().toFile(contact);
const reelProbe = JSON.parse((await run(ffprobe, ["-v", "error", "-show_entries", "stream=width,height,r_frame_rate:format=duration,size", "-of", "json", reel])).stdout);
const batch = {contract: "A1TelemetryDrivenScreenWave/v1", status: fixtures.every((fixture) => fixture.status === "PASS") ? "PASS" : "FAIL", sourceWorkspaceSha256: plan.source.workspaceSha256, mode: "CURSOR_FREE_HEADLESS_PLUS_TIMELINE_ACTORS_PLUS_CAP", concurrency: 2, shotIds, fixtureCount: fixtures.length, fixtures, continuousReview: {path: path.relative(root, reel), sha256: sha(reel), durationMs: Math.round(Number(reelProbe.format.duration) * 1000), width: reelProbe.streams[0].width, height: reelProbe.streams[0].height, fps: reelProbe.streams[0].r_frame_rate, bytes: fs.statSync(reel).size}, contactSheet: {path: path.relative(root, contact), sha256: sha(contact), width: columns * 480, height: rows * 304, labels:{shotId:true,state:true,actorKind:true}}, boundaries: {userVisualApproval: "NOT_APPROVED", productionAdmission: false, assemblyCreated: false, resolveWritePerformed: false}, generatedAt: new Date().toISOString()};
const reportPath = path.join(workRoot, "batch-report.json"); fs.writeFileSync(reportPath, `${JSON.stringify(batch, null, 2)}\n`);
for (const file of [reel, contact, reportPath]) { fs.copyFileSync(file, path.join(publicRoot, path.basename(file))); fs.copyFileSync(file, path.join(artifactRoot, path.basename(file))); }
const publicReport = {...batch, continuousReview: {...batch.continuousReview, publicUrl: `/${publicFamily}/${path.basename(reel)}`}, contactSheet: {...batch.contactSheet, publicUrl: `/${publicFamily}/${path.basename(contact)}`}, reportPublicUrl: `/${publicFamily}/batch-report.json`};
fs.writeFileSync(path.join(publicRoot, "batch-report.json"), `${JSON.stringify(publicReport, null, 2)}\n`); fs.writeFileSync(path.join(artifactRoot, "batch-report.json"), `${JSON.stringify(publicReport, null, 2)}\n`);
console.log(JSON.stringify({...publicReport, workReportPath: path.relative(root, reportPath)}, null, 2));
if (batch.status !== "PASS") process.exitCode = 1;
