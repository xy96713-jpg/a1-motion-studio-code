#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outRoot = path.join(root, "work/screen-recording-maturity-test-v1/effect-maturity-clean-regression-v1");
const video = path.join(outRoot, "effect-maturity-clean-review-1280x720-60fps.mp4");
const contact = path.join(outRoot, "effect-maturity-clean-contact-sheet.png");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const clips = [
  ["motion-dynamics", "work/screen-recording-maturity-test-v1/motion-dynamics-v1/motion-dynamics-clean-1280x720-60fps.mp4"],
  ["article-reading", "work/screen-recording-maturity-test-v1/article-motion-batch-v1/render/article-motion-clean-1280x720-60fps.mp4"],
  ["editor-state", "work/screen-recording-maturity-test-v1/editor-state-maturity-batch-v1/editor-state-clean-1280x720-60fps.mp4"],
  ["decision-action", "work/screen-recording-maturity-test-v1/annotation-decision-proof-v1/render/annotation-decision-clean-1280x720-60fps.mp4"],
  ["action-first-editor", "work/screen-recording-maturity-test-v1/englishflow-fresh-director-maturity-v1/review-v8/review.mp4"],
  ["action-first-menu", "work/screen-recording-maturity-test-v1/lab-vault-fresh-menu-maturity-v1/review-v8/review.mp4"],
  ["drag", "work/screen-recording-maturity-test-v1/drag-batch-v1/render/drag-clean-1280x720-60fps.mp4"],
  ["real-file-drop-tether", "work/screen-recording-maturity-test-v1/real-file-drop-v1/render/real-file-drop-tether-clean-1280x720-60fps.mp4"],
  ["layout", "work/screen-recording-maturity-test-v1/layout-maturity-batch-v1/layout-wide-clean-1280x720-60fps.mp4"],
  ["retry", "work/screen-recording-maturity-test-v1/retry-montage-evidence-v1/retry-montage-review.mp4"],
  ["presenter-bubble", "work/screen-recording-maturity-test-v1/camera-bubble-reflow-review-v1/camera-bubble-reflow-review-1280x720-60fps.mp4"],
  ["blind-article", "work/screen-recording-maturity-test-v1/blind-test-v1/render/blind-nasa-clean-1280x720-60fps.mp4"],
];
await fsp.mkdir(outRoot, {recursive: true});
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
let offset = 0;
for (const clip of clips) { const file = path.join(root, clip[1]); if (!fs.existsSync(file)) throw new Error(`CLEAN_CLIP_MISSING:${clip[0]}`); const p = probe(file); const stream = p.streams.find((row) => row.codec_type === "video"); if (stream.width !== 1280 || stream.height !== 720 || stream.r_frame_rate !== "60/1" || p.streams.some((row) => row.codec_type === "audio")) throw new Error(`CLEAN_CLIP_AUDIO_OR_CONTRACT:${clip[0]}`); clip.durationMs = Math.round(Number(p.format.duration) * 1000); clip.frameCount = Number(stream.nb_read_frames); clip.sha256 = sha(file); clip.startMs = offset; offset += clip.durationMs; clip.endMs = offset; }
const filter = clips.map((_, index) => `[${index}:v]fps=60,scale=1280:720:flags=lanczos,format=yuv420p[v${index}]`).join(";") + `;${clips.map((_, index) => `[v${index}]`).join("")}concat=n=${clips.length}:v=1:a=0[outv]`;
execFileSync(ffmpeg, ["-v", "error", "-y", ...clips.flatMap((clip) => ["-i", path.join(root, clip[1])]), "-filter_complex", filter, "-map", "[outv]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "60", "-movflags", "+faststart", video]);
const p = probe(video); execFileSync(ffmpeg, ["-v", "error", "-i", video, "-f", "null", "-"]); const stream = p.streams.find((row) => row.codec_type === "video");
const thumbs = []; for (const clip of clips) { const at = (clip.startMs + Math.min(clip.durationMs * .55, clip.durationMs - 180)) / 1000; const imagePath = path.join(outRoot, `${clip[0]}.png`); execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", at.toFixed(3), "-i", video, "-frames:v", "1", imagePath]); const image = await sharp(imagePath).resize(426, 240, {fit: "cover"}).png().toBuffer(); const label = Buffer.from(`<svg width="426" height="42"><rect width="426" height="42" fill="#091011"/><text x="14" y="27" fill="#F4F1E8" font-size="14" font-family="Arial" font-weight="700">${clip[0].toUpperCase()}</text></svg>`); thumbs.push(await sharp({create: {width: 426, height: 282, channels: 3, background: "#091011"}}).composite([{input: label, left: 0, top: 0}, {input: image, left: 0, top: 42}]).png().toBuffer()); }
await sharp({create: {width: 1278, height: Math.ceil(thumbs.length / 3) * 282, channels: 3, background: "#091011"}}).composite(thumbs.map((input, index) => ({input, left: (index % 3) * 426, top: Math.floor(index / 3) * 282}))).png().toFile(contact);
const report = {contract: "A1EffectMaturityCleanRegression/v1", status: "PASS_REVIEW_ONLY", media: {path: path.relative(root, video), sha256: sha(video), width: stream.width, height: stream.height, fps: stream.r_frame_rate, frameCount: Number(stream.nb_read_frames), durationMs: Math.round(Number(p.format.duration) * 1000), fullDecode: true}, clips: clips.map(([id, relative, durationMs, frameCount, sha256, startMs, endMs]) => ({id, path: relative, durationMs, frameCount, sha256, startMs, endMs})), cleanPolicy: {audioStreams: false, reviewLabels: false, diagnosticCards: false}, contactSheet: {path: path.relative(root, contact), sha256: sha(contact)}, boundary: {reviewOnly: true, productionAdmission: false}}; report.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex"); await fsp.writeFile(path.join(outRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({status: report.status, media: report.media, clipCount: clips.length, output: path.relative(root, video), contactSheet: path.relative(root, contact)}, null, 2));
