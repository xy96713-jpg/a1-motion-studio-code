#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {inspectEvidenceBindings, isEvidencePass, readJson, screenScopeFindings, shaFile, summarizeFindings, validateCapScreenProvenance, writeAudit} from "./lib/screen-validation-evidence-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const [requestArg, outputArg] = process.argv.slice(2);
if (!requestArg || !outputArg) throw new Error("usage:audit-screen-review-qualification-v1 <request.json> <audit.json>");
const request = readJson(path.resolve(root, requestArg));
const scopeFindings = screenScopeFindings(request.scope);
const freeze = readJson(path.join(root, request.executorFreeze.path));
const frozen = inspectEvidenceBindings(root, freeze);
const ffprobe = path.join(root, ".tools/bin/ffprobe"), ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const rows = [];
for (const item of request.cases || []) {
  const findings = [...scopeFindings];
  const binding = inspectEvidenceBindings(root, item);
  findings.push(...binding.failures.map((row) => ({...row, status: "FAIL"})));
  if (item.type === "HOLDOUT" && frozen.status !== "PASS") findings.push({id: "EXECUTOR_CHANGED_DURING_HOLDOUT", status: "FAIL"});
  const receipt = readJson(path.join(root, item.receipt.path));
  const provenance = validateCapScreenProvenance(root, receipt, receipt.reviewVideo.path);
  findings.push(...provenance.findings);
  const video = item.output || receipt.reviewVideo;
  const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", path.join(root, video.path)], {encoding: "utf8"}));
  const videoStream = probe.streams?.find((row) => row.codec_type === "video");
  if (!videoStream || probe.streams.some((row) => row.codec_type === "audio")) findings.push({id: "SCREEN_MEDIA_CONTRACT", status: "FAIL"});
  execFileSync(ffmpeg, ["-v", "error", "-i", path.join(root, video.path), "-f", "null", "-"], {stdio: "pipe"});
  if (item.readability) {
    const readability = readJson(path.join(root, item.readability.path));
    const match = readability.outputs?.find((output) => output.video?.sha256 === video.sha256);
    if (!match) findings.push({id: "READABILITY_FOR_DIFFERENT_OUTPUT", status: "FAIL"});
    else findings.push(...(match.findings || []));
    if (!isEvidencePass(readability.status)) findings.push({id: "ENCODED_READABILITY", status: readability.status});
  } else findings.push({id: "ENCODED_READABILITY_NOT_TESTED", status: "INCOMPLETE"});
  if (item.output && item.output.sha256 !== receipt.reviewVideo.sha256) {
    const post = item.postReceipt && readJson(path.join(root, item.postReceipt.path));
    if (!post || post.output?.sha256 !== item.output.sha256 || post.source?.capVideoSha256 !== receipt.reviewVideo.sha256) findings.push({id: "POST_OUTPUT_NOT_BOUND_TO_CAP", status: "FAIL"});
  }
  rows.push({id: item.id, family: item.family, type: item.type, ...summarizeFindings(findings), source: receipt.sourceVideo, output: video, findings, media: {fullDecode: true, ...videoStream, durationMs: Number(probe.format.duration) * 1000}, visualSuitability: "NOT_ACCEPTED", sourceProvenance: provenance.status});
}
const coverage = (request.requiredFamilies || []).map((family) => ({family, cases: rows.filter((row) => row.family === family).map((row) => row.id), status: rows.some((row) => row.family === family && isEvidencePass(row.status)) ? "TECHNICAL_SAMPLE_PRESENT" : "INCOMPLETE"}));
const findings = [
  ...scopeFindings,
  ...rows.filter((row) => !isEvidencePass(row.status)).map((row) => ({id: row.id, status: row.status})),
  ...coverage.filter((row) => row.status === "INCOMPLETE").map((row) => ({id: `COVERAGE:${row.family}`, status: "INCOMPLETE"})),
  {id: "CONTINUOUS_PLAYBACK_AND_SUITABILITY_ACCEPTANCE", status: "INCOMPLETE"},
  ...frozen.failures.map((row) => ({...row, status: "FAIL"})),
];
const inputs = inspectEvidenceBindings(root, request);
findings.push(...inputs.failures.map((row) => ({...row, status: "FAIL"})));
const report = writeAudit(root, outputArg, {
  contract: "A1ScreenReviewQualification/v1", ...summarizeFindings(findings), rows, coverage, findings,
  sources: {request: {path: requestArg, sha256: shaFile(path.resolve(root, requestArg))}},
  executorFreeze: {status: frozen.status, reference: request.executorFreeze},
  boundary: {reviewOnly: true, productionAdmission: false, userVisualApproval: "NOT_APPROVED", formalFilmMutation: false},
}, inputs.checked);
console.log(JSON.stringify({status: report.status, rows: rows.map(({id, status, findings}) => ({id, status, findings})), coverage}, null, 2));
if (!isEvidencePass(report.status)) process.exitCode = 1;
