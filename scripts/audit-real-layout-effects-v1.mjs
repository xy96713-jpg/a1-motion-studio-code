#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(root, "work/screen-recording-maturity-test-v1/layout-maturity-batch-v1/audit-report.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = (relative) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", path.join(root, relative)], {encoding: "utf8"}));
const stats = async (relative) => { const result = await sharp(path.join(root, relative)).stats(); return {mean: result.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3, variance: result.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev ** 2, 0) / 3}; };
const outputRows = Object.entries(report.outputs).filter(([id]) => ["wideClean", "wideReview", "verticalClean", "verticalReview"].includes(id)).map(([id, output]) => { const p = probe(output.path); const stream = p.streams.find((row) => row.codec_type === "video"); return {id, ...output, sha256: sha(path.join(root, output.path)), probe: {width: stream.width, height: stream.height, fps: stream.r_frame_rate, frameCount: Number(stream.nb_read_frames), fullDecode: output.fullDecode}}; });
const frameIds = ["relay", "device", "margin", "vertical-start", "vertical-handoff", "vertical-final"];
const frameStats = Object.fromEntries(await Promise.all(frameIds.map(async (id) => [id, await stats(`work/screen-recording-maturity-test-v1/layout-maturity-batch-v1/${id}.png`)])));
const checks = {realSourcesOnly: report.checks?.realSourcesOnly === true, dualWindowRelayVisible: report.checks?.dualWindowRelayVisible === true && frameStats.relay.variance > 100, deviceFrameBounded: report.checks?.deviceFrameBounded === true && frameStats.device.variance > 100, backgroundMarginBounded: report.checks?.backgroundMarginBounded === true && frameStats.margin.variance > 100, verticalTargetsReadable: report.checks?.vertical1080x1920 === true && frameStats["vertical-start"].variance > 100 && frameStats["vertical-final"].variance > 100, wideDecode: outputRows.filter((row) => row.id.startsWith("wide")).every((row) => row.probe.width === 1280 && row.probe.height === 720 && row.probe.fps === "60/1" && row.probe.fullDecode), verticalDecode: outputRows.filter((row) => row.id.startsWith("vertical")).every((row) => row.probe.width === 1080 && row.probe.height === 1920 && row.probe.fps === "60/1" && row.probe.fullDecode)};
const failures = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
const effects = ["DUAL_WINDOW_RELAY", "DEVICE_FRAME", "BACKGROUND_MARGIN_STAGE", "VERTICAL_FORMAT_REFLOW"].map((id) => ({id, status: failures.length ? "BLOCKED" : "PASS_REAL", evidence: "real source pixels, bounded geometry, full decode and nonuniform encoded frame proof"}));
const audit = {contract: "A1RealLayoutEffectsAudit/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", effects, source: {report: "work/screen-recording-maturity-test-v1/layout-maturity-batch-v1/audit-report.json", reportSha256: sha(reportPath)}, outputs: outputRows, frameStats, checks, failures, boundary: {reviewOnly: true, productionAdmission: false, formal34ShotMutation: false}};
audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
const out = path.join(root, "work/screen-recording-maturity-test-v1/real-layout-effects-audit.json"); fs.writeFileSync(out, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({status: audit.status, effects, failures, output: path.relative(root, out)}, null, 2));
if (failures.length) process.exitCode = 1;
