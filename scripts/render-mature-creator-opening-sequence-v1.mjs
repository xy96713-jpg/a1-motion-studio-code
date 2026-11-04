#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const outputRoot = path.join(root, "work/mature-creator-opening-sequence-v1");
fs.mkdirSync(outputRoot, {recursive: true});

const presenter = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-video-093bc1315163.mov");
const title = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/current-storyboard-authority-v1/ED-01-fullscreen-title.png");
const waveReport = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/report.json"), "utf8"));
const screen = Object.fromEntries(["ED-02", "ED-03", "ED-04", "ED-05", "ED-06"].map((shotId) => {
  const shot = waveReport.shots.find((item) => item.shotId === shotId);
  if (!shot?.video?.publicUrl) throw new Error(`opening-sequence-wave-video-missing:${shotId}`);
  return [shotId, path.join(publicRoot, shot.video.publicUrl.replace(/^\//u, ""))];
}));
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const file of [presenter, title, ...Object.values(screen)]) if (!fs.existsSync(file)) throw new Error(`opening-sequence-input-missing:${file}`);
if (sha(presenter) !== "093bc13151633d34f0bdc1176de77f1b71eeda7c7ccbb4d3ff2507cbc45babc5") throw new Error("presenter-source-sha-drift");
if (sha(title) !== "af544b2f2feba71ddd5268e6026c5d58430d2d13bd589c4bab8b5bd191a541d5") throw new Error("ed01-title-sha-drift");

const output = path.join(outputRoot, "mature-creator-opening-review-960x540.mp4");
const inputs = ["-loop", "1", "-framerate", "60", "-i", title, "-i", presenter, ...Object.values(screen).flatMap((file) => ["-i", file])];
const presenterTreatment = "scale=960:540,eq=brightness=0.035:contrast=1.03:saturation=1.02,colorbalance=rs=.015:gs=.005:bs=-.01,fps=60";
const filters = [
  "[0:v]trim=duration=3.353,setpts=PTS-STARTPTS,scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=black,fps=60[v0]",
  "[2:v]trim=duration=1.987,setpts=PTS-STARTPTS,fps=60[v1]",
  `[1:v]trim=start=5.340:end=5.520,setpts=PTS-STARTPTS,${presenterTreatment}[v2]`,
  "[3:v]trim=duration=5.840,setpts=PTS-STARTPTS,fps=60[v3]",
  `[1:v]trim=start=11.360:end=12.360,setpts=PTS-STARTPTS,${presenterTreatment}[v4]`,
  "[4:v]trim=start=0.800:end=6.580,setpts=PTS-STARTPTS,fps=60[v5]",
  `[1:v]trim=start=18.140:end=18.340,setpts=PTS-STARTPTS,${presenterTreatment}[v6]`,
  "[5:v]trim=duration=6.980,setpts=PTS-STARTPTS,fps=60[v7]",
  `[1:v]trim=start=25.320:end=26.120,setpts=PTS-STARTPTS,${presenterTreatment}[v8]`,
  "[6:v]trim=start=0.800:end=4.820,setpts=PTS-STARTPTS,fps=60[v9]",
  `[1:v]trim=start=30.140:end=35.180,setpts=PTS-STARTPTS,${presenterTreatment}[v10]`,
  "[v0][v1][v2][v3][v4][v5][v6][v7][v8][v9][v10]concat=n=11:v=1:a=0[v]",
  "[1:a]atrim=start=0:end=35.180,asetpts=PTS-STARTPTS,aresample=48000[a]",
];
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", "-t", "35.180", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output], {stdio: "inherit"});
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,sample_rate:format=duration,size", "-of", "json", output], {encoding: "utf8"}));
const video = probe.streams.find((item) => item.codec_type === "video"), audio = probe.streams.find((item) => item.codec_type === "audio");
const report = {
  contract: "A1MatureCreatorOpeningSequence/v1",
  status: video?.width === 960 && video?.height === 540 && video?.r_frame_rate === "60/1" && audio ? "READY_FOR_ACTUAL_PIXEL_REVIEW" : "FAIL",
  source: {presenter: {sha256: sha(presenter), startMs: 0, endMs: 35180}, title: {sha256: sha(title)}, screens: Object.fromEntries(Object.entries(screen).map(([id, file]) => [id, {sha256: sha(file)}]))},
  carrierSchedule: [
    {startMs: 0, endMs: 3353, carrier: "TITLE_TAKEOVER", shotIds: ["ED-01"]},
    {startMs: 3353, endMs: 11360, carrier: "CLEAN_SCREEN_EVIDENCE", shotIds: ["ED-02", "ED-03"]},
    {startMs: 11360, endMs: 12360, carrier: "VERIFIED_REAL_PRESENTER_RESET", shotIds: ["ED-04"]},
    {startMs: 12360, endMs: 25320, carrier: "CLEAN_SCREEN_EVIDENCE", shotIds: ["ED-04", "ED-05"]},
    {startMs: 25320, endMs: 26120, carrier: "VERIFIED_REAL_PRESENTER_RESET", shotIds: ["ED-06"]},
    {startMs: 26120, endMs: 30140, carrier: "CLEAN_SCREEN_EVIDENCE", shotIds: ["ED-06"]},
    {startMs: 30140, endMs: 35180, carrier: "VERIFIED_REAL_PRESENTER", shotIds: ["ED-07"]}
  ],
  policy: {maximumConsecutiveScreenBeats: 2, presenterResetDurationMs: [800, 1000], decorativeFrames: 0, clickRings: 0, cursorInFinal: false, hardCutsDefault: true, presenterTreatment: {lane: "Natural Portrait correction", presetSeed: "skin-soft", intensity: 0.58, implementation: {brightness: 0.035, contrast: 1.03, saturation: 1.02, redBalance: 0.015, greenBalance: 0.005, blueBalance: -0.01}, scope: "presenter segments only"}},
  output: {path: path.relative(root, output), sha256: sha(output), durationMs: Math.round(Number(probe.format.duration) * 1000), width: video?.width, height: video?.height, fps: video?.r_frame_rate, audioSampleRate: audio?.sample_rate},
  boundaries: {reviewOnly: true, userVisualApproval: "NOT_APPROVED", productionAdmission: false, currentWaveStatus: waveReport.status, motionSpecAllowed: false, resolveAllowed: false},
  generatedAt: new Date().toISOString(),
};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "READY_FOR_ACTUAL_PIXEL_REVIEW") process.exitCode = 1;
