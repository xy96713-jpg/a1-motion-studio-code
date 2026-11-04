#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const base = "work/screen-recording-maturity-test-v1";
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const taskIds = ["englishflow-fresh-director-maturity-v1", "lab-vault-fresh-navigation-maturity-v1", "lab-vault-fresh-menu-maturity-v1"];
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const hash = (relative) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const probe = (relative) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", path.join(root, relative)], {encoding: "utf8"}));
const extract = (relative, atMs, out) => { execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", String(atMs / 1000), "-i", path.join(root, relative), "-frames:v", "1", "-vf", "scale=320:180", out]); };
const mae = async (a, b) => { const left = await sharp(a).removeAlpha().raw().toBuffer(); const right = await sharp(b).removeAlpha().raw().toBuffer(); let sum = 0; for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]); return sum / left.length; };
const failures = [];
const rows = [];

for (const id of taskIds) {
  const taskRoot = `${base}/${id}`;
  const receiptPath = `${taskRoot}/review-v8/cap-receipt.json`;
  const receipt = read(receiptPath);
  const capture = read(receipt.captureReport.path);
  const config = read(`${receipt.capProject.path}/project-config.json`);
  const taskFailures = [];
  if (receipt.status !== "PASS" || receipt.configurationReadback?.status !== "PASS") taskFailures.push("CONFIGURATION_READBACK");
  if (hash(receipt.sourceVideo.path) !== receipt.sourceVideo.sha256) taskFailures.push("SOURCE_SHA");
  if (hash(receipt.reviewVideo.path) !== receipt.reviewVideo.sha256) taskFailures.push("REVIEW_SHA");
  const media = probe(receipt.reviewVideo.path); const stream = media.streams.find((item) => item.width);
  if (stream.width !== 1280 || stream.height !== 720 || stream.r_frame_rate !== "60/1" || Number(stream.nb_read_frames) !== Math.round(receipt.reviewVideo.durationMs / 1000 * 60)) taskFailures.push("MEDIA_CONTRACT");
  const expectedSegments = receipt.camera?.segments || [];
  const actualSegments = config.timeline?.zoomSegments || [];
  const cameraChecks = [];
  for (let index = 0; index < expectedSegments.length; index += 1) {
    const expected = expectedSegments[index]; const actual = actualSegments[index]; const targetEvent = receipt.directorPlan?.cameraBeats?.[index]?.targetEvent;
    const target = capture.geometryTruth?.targets?.find((item) => item.targetKey === targetEvent);
    const errors = [];
    if (!actual?.mode?.manual) errors.push("MANUAL_TARGET_NOT_PERSISTED");
    if (!target || !Number.isFinite(target.observedAtMs)) errors.push("TARGET_OBSERVATION_MISSING");
    if (actual && Math.abs(actual.start - expected.start) > 0.001) errors.push("START_CHANGED");
    if (actual && Math.abs(actual.end - expected.end) > 0.001) errors.push("END_CHANGED");
    if (actual && Math.abs(actual.amount - expected.amount) > 0.001) errors.push("AMOUNT_CHANGED");
    if (actual && expected.mode?.manual && (!actual.mode.manual || Math.abs(actual.mode.manual.x - expected.mode.manual.x) > 0.001 || Math.abs(actual.mode.manual.y - expected.mode.manual.y) > 0.001)) errors.push("CENTER_CHANGED");
    if (target && actual && actual.start * 1000 < target.observedAtMs - 1) errors.push("CAMERA_PRECEDES_OBSERVATION");
    if (errors.length) taskFailures.push(...errors.map((error) => `${index}:${error}`));
    const sourceFrame = path.join(root, `${taskRoot}/review-v8/pixel-source-${index}.png`);
    const reviewFrame = path.join(root, `${taskRoot}/review-v8/pixel-review-${index}.png`);
    extract(receipt.sourceVideo.path, (expected.start + expected.end) * 500, sourceFrame);
    extract(receipt.reviewVideo.path, (expected.start + expected.end) * 500, reviewFrame);
    const difference = await mae(sourceFrame, reviewFrame);
    if (difference < 0.5) taskFailures.push(`${index}:NO_ENCODED_CAMERA_PIXEL_DELTA`);
    cameraChecks.push({index, targetEvent, observedAtMs: target?.observedAtMs || null, expected, actual, encodedMae: difference, failures: errors});
  }
  const resultEvent = capture.events?.find((event) => event.name === "result_hold");
  let resultHoldMae = null;
  if (resultEvent) {
    const lastCameraEndMs = Math.max(resultEvent.tMs, ...expectedSegments.map((segment) => segment.end * 1000));
    const holdAms = Math.min(receipt.reviewVideo.durationMs - 120, lastCameraEndMs + 180);
    const holdBms = Math.min(receipt.reviewVideo.durationMs - 30, lastCameraEndMs + 620);
    const resultA = path.join(root, `${taskRoot}/review-v8/result-a.png`); const resultB = path.join(root, `${taskRoot}/review-v8/result-b.png`);
    extract(receipt.reviewVideo.path, holdAms, resultA); extract(receipt.reviewVideo.path, holdBms, resultB); resultHoldMae = await mae(resultA, resultB); if (resultHoldMae > 12) taskFailures.push("RESULT_HOLD_NOT_STABLE");
  } else taskFailures.push("RESULT_EVENT_MISSING");
  const effectChecks = (receipt.executionEffects || []).map((effect) => ({id: effect.id, technique: effect.technique, execution: effect.execution, status: effect.execution === "UNAVAILABLE" ? "FAIL" : "SOURCE_OR_CAP_EXECUTED"}));
  if (effectChecks.some((effect) => effect.status === "FAIL")) taskFailures.push("EFFECT_EXECUTION_RECEIPT");
  rows.push({id, receipt: receiptPath, receiptSha256: hash(receiptPath), status: taskFailures.length ? "FAIL" : "PASS_REVIEW_ONLY", cameraChecks, effectChecks, resultHoldMae, media: {width: stream.width, height: stream.height, fps: stream.r_frame_rate, frameCount: Number(stream.nb_read_frames), fullDecodePass: true}, failures: taskFailures});
  failures.push(...taskFailures.map((failure) => `${id}:${failure}`));
}

const report = {contract: "A1CapExecutionChainPixelAudit/v2", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", rows, failures, boundary: {reviewOnly: true, productionAdmission: false, currentAuthorityMutation: false}, generatedAt: new Date().toISOString()};
report.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
const out = path.join(root, base, "execution-chain-v2-audit.json"); fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, failures, output: path.relative(root, out)}, null, 2));
if (failures.length) process.exitCode = 1;
