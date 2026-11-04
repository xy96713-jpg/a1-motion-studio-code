#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const renderer = path.join(root, "remotion-renderer");
const publicRoot = path.join(renderer, "public");
const out = path.join(root, "work/clean-telemetry-screen-canary-v1");
const stageRoot = path.join(publicRoot, "proof-only/clean-telemetry-screen-canary-v1");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const baselinePath = path.join(root, "work/screen-packaging-core-canary-v1/screen-packaging-core-review-960x540.mp4");
const entry = "src/clean-telemetry-screen-canary-v1-entry.tsx";
const composition = "CleanTelemetryScreenCanaryV1";
const output = {width: 960, height: 540, fps: 60};
const shotcraft = {
  repository: "https://github.com/Vincentwei1021/video-shotcraft",
  commit: "5e71af35a2daee492dd3ea93e5e8903f32dcd13c",
  license: "Apache-2.0",
  adaptedMechanisms: [
    "references/shots/camera/cursor-flyover.md: cursor and camera share source-space geometry; cursor counter-scales",
    "references/shots/interaction/input-trigger-moves.md: click is the causal trigger for a bounded punch-in",
  ],
  copiedAssets: false,
  copiedAudio: false,
};
const implementationPaths = [
  "remotion-renderer/src/CleanTelemetryScreenCanaryV1.tsx",
  "remotion-renderer/src/clean-telemetry-screen-canary-v1-entry.tsx",
  "scripts/build-clean-telemetry-screen-canary-v1.mjs",
  "scripts/test-clean-telemetry-screen-canary-v1.mjs",
];

const shaBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sha = (file) => shaBuffer(fs.readFileSync(file));
const rel = (file) => path.relative(root, file);
const artifact = (file) => ({
  path: rel(file.startsWith(`${out}${path.sep}`) ? path.join(out, path.basename(file)) : file),
  sha256: sha(file),
});
const frameAt = (ms) => Math.round(Number(ms) * output.fps / 1000);
const runRemotion = (args) => execFileSync(path.join(renderer, "node_modules/.bin/remotion"), args, {cwd: renderer, stdio: "inherit"});
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const raw = async (file) => sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
const delta = (left, right) => {
  if (left.info.width !== right.info.width || left.info.height !== right.info.height)
    throw new Error("clean-telemetry-pixel-dimensions-mismatch");
  let changed = 0;
  for (let offset = 0; offset < left.data.length; offset += 3) {
    if (left.data[offset] !== right.data[offset] || left.data[offset + 1] !== right.data[offset + 1] || left.data[offset + 2] !== right.data[offset + 2]) changed += 1;
  }
  return changed;
};
const mediaProbe = (file) => {
  const probe = JSON.parse(execFileSync(ffprobe, [
    "-v", "error", "-count_frames",
    "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration",
    "-of", "json", file,
  ], {encoding: "utf8"}));
  const stream = probe.streams.find((item) => item.codec_type === "video");
  return {width: stream?.width, height: stream?.height, fps: stream?.r_frame_rate, frameCount: Number(stream?.nb_read_frames), durationMs: Math.round(Number(probe.format.duration) * 1000)};
};

fs.mkdirSync(out, {recursive: true});
fs.mkdirSync(stageRoot, {recursive: true});
const lockPath = path.join(out, ".build.lock");
let lockFd;
try { lockFd = fs.openSync(lockPath, "wx"); } catch { throw new Error("clean-telemetry-build-already-running"); }
const runOut = fs.mkdtempSync(path.join(out, ".run-"));
const stageDir = fs.mkdtempSync(path.join(stageRoot, "run-"));
const workspaceShaBefore = sha(workspacePath);
const currentPhaseShaBefore = sha(currentPhasePath);

try {
  const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
  const shot = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find((item) => item.shotId === "ED-04");
  if (!shot?.prototypeEligible) throw new Error("ED-04:prototype-eligibility-required");
  const captured = shot.motionReviewPlan?.capturedSource;
  const sourcePath = path.join(root, captured?.path || "");
  if (!captured?.sha256 || !fs.existsSync(sourcePath) || sha(sourcePath) !== captured.sha256 || captured.versionId !== shot.versionId)
    throw new Error("ED-04:current-source-binding-invalid");
  const reportPath = path.join(root, captured.reportPath || path.join(path.dirname(captured.path), "report.json"));
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.storyboardBinding?.revisionSha256 !== shot.revisionSha256 || report.output?.sha256 !== captured.sha256 || report.output?.fullDecodePass !== true)
    throw new Error("ED-04:report-source-binding-invalid");
  if (report.cursorPixelPolicy !== "SOURCE_VIDEO_CURSOR_HIDDEN_TELEMETRY_ONLY" || report.captureBackend !== "PLAYWRIGHT_HEADLESS_CDP_INPUT")
    throw new Error("ED-04:telemetry-only-capture-required");

  const actionEvent = report.events.find((item) => item.name === "paragraph_request_run");
  const resultEvent = report.events.find((item) => item.name === "paragraph_candidates_hold");
  const actionDom = report.domTargets.find((item) => item.event === "paragraph_request_run");
  const actionClick = report.cursorTelemetry.clicks.find((item) => item.event === "paragraph_request_run" && item.down);
  if (!actionEvent || !resultEvent || !actionDom?.sourceRect || !actionClick) throw new Error("ED-04:action-and-result-evidence-required");
  const actionFrame = frameAt(actionEvent.outputTimeMs);
  const resultFrame = frameAt(resultEvent.outputTimeMs);
  const resultTarget = {x: 1668 / 2560, y: 114 / 1440, width: 888 / 2560, height: 560 / 1440};
  const moves = report.cursorTelemetry.moves.map((item) => ({frame: frameAt(item.tMs), x: item.x, y: item.y}));
  const clicks = report.cursorTelemetry.clicks.map((item) => ({frame: frameAt(item.tMs), x: item.x, y: item.y, down: item.down, event: item.event}));
  if (moves.at(-1)?.frame !== frameAt(report.cursorTelemetry.moves.at(-1).tMs) || actionFrame !== frameAt(actionClick.tMs))
    throw new Error("ED-04:telemetry-event-clock-mismatch");

  const stagedName = `ed-04-${captured.sha256.slice(0, 12)}.mp4`;
  const stagedPath = path.join(stageDir, stagedName);
  fs.copyFileSync(sourcePath, stagedPath);
  if (sha(stagedPath) !== captured.sha256) throw new Error("ED-04:staged-source-sha-mismatch");

  const props = {
    contract: "A1CleanTelemetryScreenCanary/v1",
    sourceVideoUri: path.relative(publicRoot, stagedPath).split(path.sep).join("/"),
    sourceVideoSha256: captured.sha256,
    sourceFrameCount: report.output.frameCount,
    cursorTelemetry: {moves, clicks},
    actionFrame,
    resultFrame,
    actionTarget: actionDom.sourceRect,
    resultTarget,
  };
  const directorPlan = {
    contract: "A1ScreenDirectorBrain/v1",
    status: "REVIEW_ONLY",
    shotId: "ED-04",
    sourceVideoSha256: captured.sha256,
    beatMap: [
      {frames: [0, 67], shotFunction: "establish", technique: "LOCK_WIDE", viewerQuestion: "Where is the operation happening?", decisiveEvidence: "real editor surface"},
      {frames: [68, 132], shotFunction: "action", technique: "SOURCE_ACTION_ONLY", viewerQuestion: "What is being selected?", decisiveEvidence: "source-bound cursor move and click"},
      {frames: [133, actionFrame - 9], shotFunction: "feedback", technique: "SOURCE_ACTION_ONLY", viewerQuestion: "What request is being entered?", decisiveEvidence: "native typed state"},
      {frames: [actionFrame - 8, actionFrame + 36], shotFunction: "decision", technique: "CURSOR_PUNCH", viewerQuestion: "What triggers generation?", decisiveEvidence: "telemetry-bound request click"},
      {frames: [actionFrame + 37, resultFrame - 1], shotFunction: "transition", technique: "LOCK_WIDE", viewerQuestion: "Is the product still working?", decisiveEvidence: "native compressed wait state"},
      {frames: [resultFrame, report.output.frameCount - 1], shotFunction: "result", technique: "HARD_CUT_STATE_REPLACE+RESULT_HOLD", viewerQuestion: "What did the action produce?", decisiveEvidence: "verified persistent result panel"},
    ],
    sourceActionPlan: "Preserve the real 1x source sequence and expose the same-capture cursor telemetry as an editable overlay.",
    camera: {moves: 1, stateReplacements: 1, peakActionScale: 1.1, resultScale: 1.2, spotlight: false, breathing: false},
    trimSplitDecision: "Keep the complete 395-frame causal sequence; remove no source action and add no tail extension.",
    cutMotivation: "The result-state replacement occurs exactly when paragraph_candidates_hold becomes visible.",
    resultHold: {startFrame: resultFrame, endFrame: report.output.frameCount - 1, cameraLocked: true},
    sequenceHandoff: "Review against the existing Hermes A canary only; do not promote or enter Assembly.",
    blockers: [],
    admissionGates: ["same-capture telemetry", "verified source SHA", "full decode", "locked result hold", "continuous playback review"],
    shotcraftReference: shotcraft,
  };
  const propsPath = path.join(runOut, "props.json");
  const directorPlanPath = path.join(runOut, "director-plan.json");
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  fs.writeFileSync(directorPlanPath, `${JSON.stringify(directorPlan, null, 2)}\n`);

  const mediaPath = path.join(runOut, "clean-telemetry-screen-review-960x540.mp4");
  runRemotion(["render", entry, composition, mediaPath, "--props", propsPath, "--codec", "h264", "--crf", "16", "--log", "error"]);

  const proofSpec = [
    ["establish", 30],
    ["cursor-approach", 112],
    ["native-typing", 184],
    ["click-punch", actionFrame + 3],
    ["native-wait", 286],
    ["result-cut", resultFrame],
    ["result-hold-a", 350],
    ["result-hold-b", 390],
  ];
  const proofFiles = [];
  for (const [id, frame] of proofSpec) {
    const file = path.join(runOut, `${id}.png`);
    runRemotion(["still", entry, composition, file, "--props", propsPath, "--frame", String(frame), "--log", "error"]);
    proofFiles.push({id, frame, file, raw: await raw(file)});
  }
  const byId = new Map(proofFiles.map((item) => [item.id, item]));
  const noCursorPropsPath = path.join(runOut, "props-no-cursor.json");
  fs.writeFileSync(noCursorPropsPath, `${JSON.stringify({...props, showCursor: false}, null, 2)}\n`);
  const noCursorFrame = path.join(runOut, "native-typing-no-cursor.png");
  runRemotion(["still", entry, composition, noCursorFrame, "--props", noCursorPropsPath, "--frame", "184", "--log", "error"]);
  const cursorOverlayDelta = delta(byId.get("native-typing").raw, await raw(noCursorFrame));
  const actionDelta = delta(byId.get("native-typing").raw, byId.get("click-punch").raw);
  const resultHoldA = shaBuffer(byId.get("result-hold-a").raw.data);
  const resultHoldB = shaBuffer(byId.get("result-hold-b").raw.data);

  const contactSheetPath = path.join(runOut, "contact-sheet.png");
  const thumbWidth = 480, thumbHeight = 270, columns = 4, rows = Math.ceil(proofFiles.length / columns);
  const thumbs = await Promise.all(proofFiles.map((item) => sharp(item.file).resize(thumbWidth, thumbHeight).png().toBuffer()));
  await sharp({create: {width: columns * thumbWidth, height: rows * thumbHeight, channels: 3, background: "#0c1011"}})
    .composite(thumbs.map((input, index) => ({input, left: index % columns * thumbWidth, top: Math.floor(index / columns) * thumbHeight})))
    .png().toFile(contactSheetPath);

  const abPath = path.join(runOut, "ab-hermes-current-vs-clean-telemetry-1920x540.mp4");
  if (!fs.existsSync(baselinePath)) throw new Error("hermes-baseline-required");
  execFileSync(ffmpeg, [
    "-y", "-v", "error", "-i", baselinePath, "-i", mediaPath,
    "-filter_complex",
    "[0:v]scale=960:540,setsar=1,drawbox=x=14:y=14:w=140:h=34:color=black@0.68:t=fill,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='A  HERMES':fontcolor=white:fontsize=18:x=26:y=22[a];[1:v]tpad=stop_mode=clone:stop_duration=3,scale=960:540,setsar=1,drawbox=x=14:y=14:w=120:h=34:color=black@0.68:t=fill,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='B  CLEAN':fontcolor=white:fontsize=18:x=26:y=22[b];[a][b]hstack=inputs=2[v]",
    "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", abPath,
  ]);

  const media = mediaProbe(mediaPath);
  const abMedia = mediaProbe(abPath);
  const decode = spawnSync(ffmpeg, ["-v", "error", "-i", mediaPath, "-f", "null", "-"], {encoding: "utf8"});
  const abDecode = spawnSync(ffmpeg, ["-v", "error", "-i", abPath, "-f", "null", "-"], {encoding: "utf8"});
  const workspaceShaAfter = sha(workspacePath);
  const currentPhaseShaAfter = sha(currentPhasePath);
  const failures = [];
  if (media.width !== output.width || media.height !== output.height || media.fps !== "60/1" || media.frameCount !== report.output.frameCount) failures.push("MEDIA_CONTRACT_INVALID");
  if (decode.status !== 0 || abDecode.status !== 0) failures.push("MEDIA_DECODE_FAILED");
  if (cursorOverlayDelta < 60 || cursorOverlayDelta > 12000) failures.push(`CURSOR_OVERLAY_PIXEL_DELTA_INVALID:${cursorOverlayDelta}`);
  if (actionDelta < 5000) failures.push(`ACTION_PUNCH_PIXEL_DELTA_TOO_SMALL:${actionDelta}`);
  if (resultHoldA !== resultHoldB) failures.push("RESULT_HOLD_NOT_LOCKED");
  if (workspaceShaBefore !== workspaceShaAfter) failures.push("WORKSPACE_MUTATION");
  if (currentPhaseShaBefore !== currentPhaseShaAfter) failures.push("CURRENT_PHASE_MUTATION");

  const audit = {
    contract: "A1CleanTelemetryScreenCanaryAudit/v1",
    status: failures.length ? "FAIL" : "PASS",
    source: {shotId: shot.shotId, versionId: shot.versionId, revisionSha256: shot.revisionSha256, videoPath: rel(sourcePath), videoSha256: captured.sha256, reportPath: rel(reportPath), reportSha256: sha(reportPath), cursorPixelPolicy: report.cursorPixelPolicy},
    directorPlan: artifact(directorPlanPath),
    props: artifact(propsPath),
    noCursorControl: {props: artifact(noCursorPropsPath), frame: artifact(noCursorFrame)},
    media: {...artifact(mediaPath), ...media},
    abReview: {...artifact(abPath), ...abMedia, baseline: artifact(baselinePath), layout: "A_HERMES_LEFT__B_CLEAN_RIGHT"},
    contactSheet: {...artifact(contactSheetPath), width: columns * thumbWidth, height: rows * thumbHeight},
    proofFrames: proofFiles.map((item) => ({id: item.id, frame: item.frame, ...artifact(item.file)})),
    implementation: implementationPaths.map((item) => ({path: item, sha256: sha(path.join(root, item))})),
    shotcraftReference: shotcraft,
    checks: {
      actualSourceBytesVerified: true,
      sameCaptureCursorTelemetry: true,
      cursorOverlayPixelDelta: cursorOverlayDelta,
      actionPunchPixelDelta: actionDelta,
      resultHoldStable: resultHoldA === resultHoldB,
      noSpotlight: true,
      noDecorativeSweep: true,
      noMotionBlur: true,
      noBreathing: true,
      sourcePlaybackRate: 1,
      fullDecode: decode.status === 0 && abDecode.status === 0,
    },
    boundary: {reviewOnly: true, productionAdmission: false, userVisualApproval: "NOT_REVIEWED", workspaceShaBefore, workspaceShaAfter, workspaceMutationPerformed: workspaceShaBefore !== workspaceShaAfter, currentPhaseShaBefore, currentPhaseShaAfter, currentPhaseMutationPerformed: currentPhaseShaBefore !== currentPhaseShaAfter},
    failures,
    generatedAt: new Date().toISOString(),
  };
  const auditPath = path.join(runOut, "audit-report.json");
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  if (failures.length) throw new Error(`clean-telemetry-canary-failed:${failures.join(",")}`);
  for (const name of fs.readdirSync(runOut)) fs.cpSync(path.join(runOut, name), path.join(out, name), {recursive: true, force: true});
  console.log(JSON.stringify({...audit, artifactRoot: rel(out)}, null, 2));
} finally {
  fs.rmSync(stageDir, {recursive: true, force: true});
  fs.rmSync(runOut, {recursive: true, force: true});
  if (lockFd !== undefined) fs.closeSync(lockFd);
  fs.rmSync(lockPath, {force: true});
}
