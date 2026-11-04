#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outRoot = path.join(root, "work/screen-recording-maturity-test-v1/effect-maturity-regression-v2");
const video = path.join(outRoot, "effect-maturity-regression-review-1280x720-60fps.mp4");
const contact = path.join(outRoot, "effect-maturity-regression-contact-sheet.png");
const reportPath = path.join(outRoot, "audit-report.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const clips = [
  ["motion-dynamics", "work/screen-recording-maturity-test-v1/motion-dynamics-v1/motion-dynamics-review-1280x720-60fps.mp4", ["CURSOR_PATH_EASE", "CURSOR_PUNCH", "SEMANTIC_PUSH", "RESULT_HOLD"]],
  ["article-reading", "work/screen-recording-maturity-test-v1/article-motion-batch-v1/render/article-motion-review-1280x720-60fps.mp4", ["SCROLL_BRAKE", "LINE_READING_TRACK", "EVIDENCE_UNDERLINE", "DETAIL_DOLLY_IN_OUT", "DETAIL_INSET", "DETAIL_LENS", "VERTICAL_READING_TRACK"]],
  ["editor-state", "work/screen-recording-maturity-test-v1/editor-state-maturity-batch-v1/editor-state-review-1280x720-60fps.mp4", ["BEFORE_AFTER_SPLIT", "WIPE_COMPARE", "STATE_FLIP", "DIFFERENCE_FLASH", "WAIT_COMPRESSION", "RESULT_FREEZE"]],
  ["decision-action", "work/screen-recording-maturity-test-v1/annotation-decision-proof-v1/render/annotation-decision-review-1280x720-60fps.mp4", ["SOURCE_ACTION_ONLY", "REAL_TEXT_REPLACE", "SAVE_CLICK", "RESULT_HOLD"]],
  ["cap-action-first-editor", "work/screen-recording-maturity-test-v1/englishflow-fresh-director-maturity-v1/review-v7/review.mp4", ["ACTION_FIRST_POLICY", "SOURCE_ACTION_ONLY", "STATE_REPLACE_CUT", "RESULT_HOLD"]],
  ["menu", "work/screen-recording-maturity-test-v1/menu-maturity-batch-v1/menu-review-1280x720-60fps.mp4", ["MENU_OPEN_FOLLOW", "PRECISION_CURSOR_MODE", "CLICK_BOUNCE", "EDGE_VIGNETTE", "BACKGROUND_DESATURATE"]],
  ["cap-action-first-menu", "work/screen-recording-maturity-test-v1/lab-vault-fresh-menu-maturity-v1/review-v7/review.mp4", ["ACTION_FIRST_POLICY", "MENU_OPEN_FOLLOW_SOURCE_PRESERVED", "RESULT_HOLD"]],
  ["drag", "work/screen-recording-maturity-test-v1/drag-batch-v1/render/drag-review-1280x720-60fps.mp4", ["DRAG_PATH_FOLLOW", "DRAG_TETHER"]],
  ["real-file-drop-tether", "work/screen-recording-maturity-test-v1/real-file-drop-v1/render/real-file-drop-tether-review-1280x720-60fps.mp4", ["REAL_PRODUCT_FILE_DROP", "DRAG_TETHER", "RESULT_HOLD"]],
  ["layout", "work/screen-recording-maturity-test-v1/layout-maturity-batch-v1/layout-wide-review-1280x720-60fps.mp4", ["DUAL_WINDOW_RELAY", "DEVICE_FRAME", "BACKGROUND_MARGIN_STAGE"]],
  ["retry", "work/screen-recording-maturity-test-v1/retry-montage-evidence-v1/retry-montage-review.mp4", ["RETRY_MONTAGE"]],
  ["presenter-bubble", "work/screen-recording-maturity-test-v1/camera-bubble-reflow-review-v1/camera-bubble-reflow-review-1280x720-60fps.mp4", ["CAMERA_BUBBLE_REFLOW"]],
  ["blind-article", "work/screen-recording-maturity-test-v1/blind-test-v1/render/blind-nasa-review-1280x720-60fps.mp4", ["AUTO_DISCOVERY", "SCROLL_ANCHOR_FOLLOW", "SOURCE_BOUND_UNDERLINE"]],
];
await fsp.mkdir(outRoot, {recursive: true});
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
let offset = 0;
for (const clip of clips) {
  const file = path.join(root, clip[1]);
  if (!fs.existsSync(file)) throw new Error(`MATURITY_CLIP_MISSING:${clip[0]}`);
  const p = probe(file); const stream = p.streams.find((row) => row.codec_type === "video");
  if (stream.width !== 1280 || stream.height !== 720 || stream.r_frame_rate !== "60/1") throw new Error(`MATURITY_CLIP_CONTRACT:${clip[0]}`);
  clip.durationMs = Math.round(Number(p.format.duration) * 1000); clip.frameCount = Number(stream.nb_read_frames); clip.sha256 = sha(file); clip.startMs = offset; offset += clip.durationMs; clip.endMs = offset;
}
const filter = clips.map((_, index) => `[${index}:v]fps=60,scale=1280:720:flags=lanczos,format=yuv420p[v${index}]`).join(";") + `;${clips.map((_, index) => `[v${index}]`).join("")}concat=n=${clips.length}:v=1:a=0[outv]`;
execFileSync(ffmpeg, ["-v", "error", "-y", ...clips.flatMap((clip) => ["-i", path.join(root, clip[1])]), "-filter_complex", filter, "-map", "[outv]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "60", "-movflags", "+faststart", video]);
const outputProbe = probe(video); execFileSync(ffmpeg, ["-v", "error", "-i", video, "-f", "null", "-"]); const stream = outputProbe.streams.find((row) => row.codec_type === "video");
const failures = []; if (stream.width !== 1280 || stream.height !== 720 || stream.r_frame_rate !== "60/1") failures.push("OUTPUT_MEDIA_CONTRACT");
const thumbs = [];
for (const clip of clips) { const at = (clip.startMs + Math.min(clip.durationMs * .55, clip.durationMs - 180)) / 1000; const imagePath = path.join(outRoot, `${clip[0]}.png`); execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", at.toFixed(3), "-i", video, "-frames:v", "1", imagePath]); const image = await sharp(imagePath).resize(426, 240, {fit: "cover"}).png().toBuffer(); const label = Buffer.from(`<svg width="426" height="42"><rect width="426" height="42" fill="#091011"/><text x="14" y="27" fill="#F4F1E8" font-size="14" font-family="Arial" font-weight="700">${clip[0].toUpperCase()} · ${(clip.durationMs / 1000).toFixed(1)}s</text></svg>`); thumbs.push(await sharp({create: {width: 426, height: 282, channels: 3, background: "#091011"}}).composite([{input: label, left: 0, top: 0}, {input: image, left: 0, top: 42}]).png().toBuffer()); }
await sharp({create: {width: 1278, height: Math.ceil(thumbs.length / 3) * 282, channels: 3, background: "#091011"}}).composite(thumbs.map((input, index) => ({input, left: (index % 3) * 426, top: Math.floor(index / 3) * 282}))).png().toFile(contact);
const report = {contract: "A1EffectMaturityRegression/v2", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", media: {path: path.relative(root, video), sha256: sha(video), width: stream.width, height: stream.height, fps: stream.r_frame_rate, frameCount: Number(stream.nb_read_frames), durationMs: Math.round(Number(outputProbe.format.duration) * 1000), fullDecode: true}, clips: clips.map(([id, relative, effects, durationMs, frameCount, sha256, startMs, endMs]) => ({id, path: relative, effects, durationMs, frameCount, sha256, startMs, endMs})), contactSheet: {path: path.relative(root, contact), sha256: sha(contact)}, failures, boundary: {reviewOnly: true, productionAdmission: false, currentAuthorityMutation: false}};
report.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex"); await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({status: report.status, media: report.media, clipCount: clips.length, output: path.relative(root, video), contactSheet: path.relative(root, contact)}, null, 2)); if (failures.length) process.exitCode = 1;
