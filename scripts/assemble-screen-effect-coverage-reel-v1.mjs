#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outRoot = path.join(root, "work/screen-recording-maturity-test-v1/effect-coverage-reel-v1");
const videoPath = path.join(outRoot, "screen-effect-coverage-review-1280x720-60fps.mp4");
const manifestPath = path.join(outRoot, "coverage-manifest.json");
const contactPath = path.join(outRoot, "coverage-contact-sheet.png");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const source = [
  {
    id: "article-reading",
    file: "work/screen-recording-maturity-test-v1/article-motion-batch-v1/render/article-motion-review-1280x720-60fps.mp4",
    durationMs: 36000,
    effects: ["SCROLL_BRAKE", "FOCUS_DIM", "EVIDENCE_UNDERLINE", "LINE_READING_TRACK", "DETAIL_DOLLY_IN_OUT", "DETAIL_INSET", "DETAIL_LENS", "VERTICAL_READING_TRACK", "RESULT_HOLD"],
  },
  {
    id: "menu-interaction",
    file: "work/screen-recording-maturity-test-v1/menu-maturity-batch-v1/menu-review-1280x720-60fps.mp4",
    durationMs: 9800,
    effects: ["CURSOR_FOLLOW", "CLICK_BOUNCE", "MENU_OPEN_FOLLOW", "EDGE_VIGNETTE", "BACKGROUND_DESATURATE", "RESULT_HOLD"],
  },
  {
    id: "drag-interaction",
    file: "work/screen-recording-maturity-test-v1/drag-batch-v1/render/drag-review-1280x720-60fps.mp4",
    durationMs: 7000,
    effects: ["DRAG_PATH_FOLLOW", "DRAG_TETHER", "DROP_RESULT", "CAMERA_RESTORE"],
  },
  {
    id: "semantic-annotation",
    file: "work/screen-recording-maturity-test-v1/annotation-batch-v1/render/annotation-review-1280x720-60fps.mp4",
    durationMs: 10000,
    effects: ["HIGHLIGHT_WASH", "DIRECTION_ARROW", "REJECTION_STRIKE", "SHORT_PHRASE_CIRCLE", "FOCUS_HANDOFF", "PRIVACY_BLUR", "STEP_NUMBER_MARKERS"],
  },
];

await fsp.mkdir(outRoot, {recursive: true});
for (const clip of source) {
  const file = path.join(root, clip.file);
  if (!fs.existsSync(file)) throw new Error(`coverage-source-missing:${clip.id}`);
  const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", file], {encoding: "utf8"}));
  const stream = probe.streams.find((row) => row.width);
  if (stream?.width !== 1280 || stream?.height !== 720 || stream?.r_frame_rate !== "60/1") throw new Error(`coverage-source-contract:${clip.id}`);
}
const filter = source.map((_, index) => `[${index}:v]fps=60,scale=1280:720:flags=lanczos,format=yuv420p[v${index}]`).join(";") + `;${source.map((_, index) => `[v${index}]`).join("")}concat=n=${source.length}:v=1:a=0[outv]`;
execFileSync(ffmpeg, ["-v", "error", "-y", ...source.flatMap((clip) => ["-i", path.join(root, clip.file)]), "-filter_complex", filter, "-map", "[outv]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "60", "-movflags", "+faststart", videoPath]);
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", videoPath], {encoding: "utf8"}));
execFileSync(ffmpeg, ["-v", "error", "-i", videoPath, "-f", "null", "-"]);
const stream = probe.streams.find((row) => row.codec_type === "video");
const expectedFrames = Math.round(source.reduce((sum, clip) => sum + clip.durationMs, 0) / 1000 * 60);
if (stream.width !== 1280 || stream.height !== 720 || stream.r_frame_rate !== "60/1" || Number(stream.nb_read_frames) !== expectedFrames) throw new Error(`coverage-output-contract:${JSON.stringify(probe)}`);
const starts = [];
let cursorMs = 0;
for (const clip of source) {starts.push({...clip, startMs: cursorMs}); cursorMs += clip.durationMs;}
const samples = starts.flatMap((clip) => [{id: `${clip.id}-start`, atMs: clip.startMs + 1200}, {id: `${clip.id}-peak`, atMs: clip.startMs + Math.max(1200, clip.durationMs - 2200)}]);
for (const sample of samples) execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", String(sample.atMs / 1000), "-i", videoPath, "-frames:v", "1", path.join(outRoot, `${sample.id}.png`)]);
const contactTiles = await Promise.all(samples.map(async (sample) => {
  const image = await sharp(path.join(outRoot, `${sample.id}.png`)).resize(426, 240, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="426" height="38"><rect width="426" height="38" fill="#091011"/><text x="12" y="25" fill="#F4F1E8" font-size="13" font-family="Arial" font-weight="700">${sample.id} · ${(sample.atMs / 1000).toFixed(2)}s</text></svg>`);
  return sharp({create: {width: 426, height: 278, channels: 3, background: "#091011"}}).composite([{input: label, left: 0, top: 0}, {input: image, left: 0, top: 38}]).png().toBuffer();
}));
await sharp({create: {width: 1704, height: 556, channels: 3, background: "#091011"}}).composite(contactTiles.map((input, index) => ({input, left: (index % 4) * 426, top: Math.floor(index / 4) * 278}))).png().toFile(contactPath);
const manifest = {
  contract: "A1ScreenEffectCoverageReel/v1",
  status: "PASS_REVIEW_ONLY",
  output: {path: path.relative(root, videoPath), sha256: sha(videoPath), width: stream.width, height: stream.height, fps: stream.r_frame_rate, durationMs: Math.round(Number(probe.format.duration) * 1000), frameCount: Number(stream.nb_read_frames), fullDecodePass: true},
  clips: starts.map((clip) => ({id: clip.id, source: clip.file, sourceSha256: sha(path.join(root, clip.file)), startMs: clip.startMs, durationMs: clip.durationMs, effects: clip.effects})),
  contactSheet: {path: path.relative(root, contactPath), sha256: sha(contactPath)},
  boundary: {reviewOnly: true, currentAuthorityMutation: false, formal34ShotMutation: false, productionAdmission: false},
};
manifest.manifestSha256 = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, output: manifest.output, clips: manifest.clips.map(({id, startMs, durationMs, effects}) => ({id, startMs, durationMs, effects})), manifest: path.relative(root, manifestPath), contactSheet: path.relative(root, contactPath)}, null, 2));
