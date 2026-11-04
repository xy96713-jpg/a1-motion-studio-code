#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";
import {evaluateReadingWindows, inspectEvidenceBindings, readJson, shaFile, summarizeFindings, writeAudit} from "./lib/screen-validation-evidence-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const [requestArg, outputArg] = process.argv.slice(2);
if (!requestArg || !outputArg) throw new Error("usage:measure-screen-reading-pixels-v1 <request.json> <evidence.json>");
const request = readJson(path.resolve(root, requestArg));
const integrity = inspectEvidenceBindings(root, request);
if (integrity.status !== "PASS") throw new Error(JSON.stringify(integrity.failures));
const out = path.resolve(root, outputArg), folder = path.join(path.dirname(out), "reading-pixels");
if (!out.startsWith(root + path.sep)) throw new Error("OUTPUT_OUTSIDE_WORKSPACE");
fs.mkdirSync(folder, {recursive: true});
const ffmpeg = path.join(root, ".tools/bin/ffmpeg"), ffprobe = path.join(root, ".tools/bin/ffprobe");
const normalize = (text) => String(text || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const ref = (file) => ({path: path.relative(root, file), sha256: shaFile(file)});
async function targetStability(before, after, box, width, height) {
  if (!before || !box) return null;
  const a = await sharp(before).greyscale().raw().toBuffer();
  const b = await sharp(after).greyscale().raw().toBuffer();
  const left = Math.max(8, Math.floor(box.x * width)), right = Math.min(width - 8, Math.ceil(box.right * width));
  const top = Math.max(8, Math.floor((1 - box.top) * height)), bottom = Math.min(height - 8, Math.ceil((1 - box.y) * height));
  let best = null;
  // Compare source text pixels directly. OCR bounding-box jitter is not camera movement.
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    let sum = 0, count = 0;
    for (let y = top; y < bottom; y += 2) for (let x = left; x < right; x += 2) {
      sum += Math.abs(a[y * width + x] - b[(y + dy) * width + x + dx]); count++;
    }
    const mae = count ? sum / count : Infinity;
    if (!best || mae < best.mae || (mae === best.mae && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = {dx, dy, mae};
  }
  return best;
}
const outputs = [];
for (const item of request.outputs) {
  if (!/^[a-z0-9-]+$/u.test(item.id)) throw new Error("INVALID_READING_ID");
  const video = path.resolve(root, item.video.path);
  const capture = readJson(path.resolve(root, item.capture.path));
  const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", video], {encoding: "utf8"}));
  const stream = probe.streams.find((row) => row.codec_type === "video");
  if (!stream) throw new Error("VIDEO_STREAM_MISSING");
  execFileSync(ffmpeg, ["-v", "error", "-i", video, "-f", "null", "-"], {stdio: "pipe"});
  const windows = [], samples = [];
  for (const window of item.windows) {
    if (!/^[a-z0-9-]+$/u.test(window.id)) throw new Error("INVALID_WINDOW_ID");
    const target = capture.domTargets?.find((row) => row.event === window.targetEvent);
    if (!target?.text) throw new Error(`SOURCE_TEXT_MISSING:${window.targetEvent}`);
    if (window.startMs < target.capturedAtMs || window.endMs > Number(probe.format.duration) * 1000 || window.endMs - window.startMs > 10000) throw new Error("READING_WINDOW_OUTSIDE_SOURCE_OBSERVATION");
    windows.push({...window, expectedText: target.text});
    const count = Math.ceil((window.endMs - window.startMs) / 500);
    let previousBox = null, previousFrame = null;
    for (let i = 0; i <= count; i++) {
      const atMs = Math.round(window.startMs + (window.endMs - window.startMs) * i / count);
      const framePath = path.join(folder, `${item.id}-${window.id}-${atMs}.png`);
      execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", String(atMs / 1000), "-i", video, "-frames:v", "1", framePath]);
      const ocr = JSON.parse(execFileSync("swift", ["scripts/run-local-vision-ocr-v1.swift", framePath], {cwd: root, encoding: "utf8", timeout: 30000}));
      const ocrPath = framePath.replace(/\.png$/u, "-ocr.json");
      fs.writeFileSync(ocrPath, JSON.stringify(ocr, null, 2) + "\n");
      const expected = normalize(target.text);
      const segments = (ocr.segmentDetails || []).filter((segment) => {
        const text = normalize(segment.text); return text.length >= 12 && (expected.includes(text) || text.includes(expected));
      });
      const boxes = segments.map((segment) => segment.boundingBox);
      const box = boxes.length ? {x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)), right: Math.max(...boxes.map((b) => b.x + b.width)), top: Math.max(...boxes.map((b) => b.y + b.height))} : null;
      const driftPx = box && previousBox ? Math.max(Math.abs(box.x - previousBox.x) * stream.width, Math.abs(box.y - previousBox.y) * stream.height, Math.abs(box.right - previousBox.right) * stream.width, Math.abs(box.top - previousBox.top) * stream.height) : null;
      const stability = await targetStability(previousFrame, framePath, previousBox, stream.width, stream.height);
      const sample = {windowId: window.id, atMs, frame: ref(framePath), ocr: ref(ocrPath), exactTextVisible: ocr.status === "PASS" && normalize(ocr.text).includes(expected), textHeightPx: boxes.length ? Math.min(...boxes.map((b) => b.height * stream.height)) : null, clipped: !box || box.x <= 0 || box.y <= 0 || box.right >= 1 || box.top >= 1, cameraSettled: Boolean(stability && Math.hypot(stability.dx, stability.dy) <= 1.5 && stability.mae < 4), ocrBoxDriftPx: driftPx, stability};
      if (i === 1) samples.at(-1).cameraSettled = sample.cameraSettled;
      samples.push(sample); previousBox = box; previousFrame = framePath;
    }
  }
  const output = {id: item.id, video: item.video, capture: item.capture, durationMs: Math.round(Number(probe.format.duration) * 1000), width: stream.width, height: stream.height, minimumTextHeightPx: 18, windows, samples};
  output.findings = evaluateReadingWindows(output);
  outputs.push(output);
  console.log(JSON.stringify({id: item.id, status: summarizeFindings(output.findings).status, measuredTextHeights: samples.map((sample) => sample.textHeightPx)}));
}
const findings = outputs.flatMap((output) => output.findings.map((row) => ({...row, outputId: output.id})));
writeAudit(root, path.relative(root, out), {
  contract: "A1ScreenReadingPixelEvidence/v1", ...summarizeFindings(findings), outputs, findings,
  request: ref(path.resolve(root, requestArg)),
  producer: {path: "scripts/measure-screen-reading-pixels-v1.mjs", sha256: shaFile(import.meta.filename)},
  ocrProducer: ref(path.join(root, "scripts/run-local-vision-ocr-v1.swift")),
  limitation: "Sampled encoded-text readability and target stability only; not full playback, semantic suitability or user acceptance. OCR uncertainty fails closed.",
}, integrity.checked);
if (findings.length) process.exitCode = 1;
