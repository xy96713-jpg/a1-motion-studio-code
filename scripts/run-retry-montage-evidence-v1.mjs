#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/screen-recording-maturity-test-v1/retry-montage-evidence-v1");
const documentId = `screen_test_retry-montage-${Date.now()}`;
const baseUrl = "http://127.0.0.1:8766";
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const api = async (route, options) => { const response = await fetch(`${baseUrl}${route}`, options); if (!response.ok) throw new Error(`WORKBENCH_HTTP_${response.status}`); return response.json(); };
await fsp.mkdir(out, {recursive: true});
const title = "重试证据临时文档";
await api("/api/document", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({documentId, documentType: "experiment", title, contentHtml: "<p>第一次保存前的临时内容。</p><p>用于验证真实失败后再次成功的录屏。</p>", contentText: "第一次保存前的临时内容。", metadata: {purpose: "retry-montage-evidence", temporary: true}})});
const scenario = {contract: "A1GenericBrowserScreenScenario/v1", id: `retry-montage-${Date.now()}`, productId: "writing-workbench", productCategory: "real-retry-evidence", projectRoot: root, url: `${baseUrl}/v2/?documentId=${encodeURIComponent(documentId)}`, width: 1280, height: 720, durationMs: 14000, readySelector: "#editor", operations: [
  {atMs: 900, type: "observe", name: "retry-editor", selector: "#editor", targetKind: "TEXT"},
  {atMs: 3500, type: "retry", name: "save-retry", attempts: [
    {id: "failed-save", type: "click", selector: "#saveWorkspace[data-a1-missing]", timeoutMs: 700},
    {id: "successful-save", type: "click", selector: "#saveWorkspace", resultSelector: "#editor", timeoutMs: 5000},
  ]},
  {atMs: 10500, type: "observe", name: "retry-saved", selector: "#editor", targetKind: "TEXT"},
], primaryEvent: "retry-saved", directorPlan: {contract: "A1ScreenDirectorBrain/v1", sequence: "REAL_RETRY_EVIDENCE", autoDiscovered: false, beats: [{id: "retry", technique: "RETRY_MONTAGE", event: "save-retry"}, {id: "hold", technique: "RESULT_HOLD", event: "retry-saved"}], cameraBeats: []}};
const scenarioPath = path.join(out, "scenario.json");
await fsp.writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
const captureRoot = path.join(out, "capture");
const capture = spawnSync(process.execPath, ["scripts/capture-generic-browser-screen-proof-v1.mjs", scenarioPath], {cwd: root, env: {...process.env, A1_GENERIC_CAPTURE_OUTPUT_ROOT: captureRoot}, encoding: "utf8", maxBuffer: 32 * 1024 * 1024});
await fsp.writeFile(path.join(out, "capture.log"), `${capture.stdout || ""}\n${capture.stderr || ""}`);
if (capture.status !== 0) throw new Error(`retry-capture-failed:${String(capture.stderr || capture.stdout).slice(-1800)}`);
const captureDir = path.join(captureRoot, scenario.id);
const capturePath = path.join(captureDir, "capture-report.json");
const report = JSON.parse(fs.readFileSync(capturePath, "utf8"));
const saved = await api(`/api/document?documentId=${encodeURIComponent(documentId)}`);
const persisted = JSON.stringify(saved).includes("第一次保存前");
await api(`/api/document?documentId=${encodeURIComponent(documentId)}`, {method: "DELETE"}).catch(() => {});
if (!persisted) throw new Error("retry-document-readback-missing");
const retries = report.retryIntervals || [];
if (!retries.some((row) => row.status === "FAILED") || !retries.some((row) => row.status === "SUCCEEDED")) throw new Error("retry-interval-proof-missing");
const failed = retries.find((row) => row.status === "FAILED");
const succeeded = retries.find((row) => row.status === "SUCCEEDED");
const montage = path.join(out, "retry-montage-review.mp4");
const failedClip = path.join(out, "failed-attempt.mp4");
const successClip = path.join(out, "successful-attempt.mp4");
const source = path.resolve(root, report.output.path);
for (const [clip, interval] of [[failedClip, failed], [successClip, succeeded]]) execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.max(0, interval.startMs / 1000 - .35)), "-i", source, "-t", String(Math.max(.7, (interval.endMs - interval.startMs) / 1000 + .7)), "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", clip]);
const concat = path.join(out, "concat.txt");
await fsp.writeFile(concat, `file '${failedClip.replaceAll("'", "'\\''")}'\nfile '${successClip.replaceAll("'", "'\\''")}'\n`);
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concat, "-vf", "scale=1280:720:flags=lanczos,fps=60", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", montage]);
execFileSync(ffmpeg, ["-v", "error", "-i", montage, "-f", "null", "-"]);
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", montage], {encoding: "utf8"}));
const stream = probe.streams.find((row) => row.width);
const adapter = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `import {compileScreenPackagingAdapter} from './apps/studio-next/src/lib/a1-screen-packaging-adapter-compiler-v1.mjs'; console.log(JSON.stringify(compileScreenPackagingAdapter({effectId:'RETRY_MONTAGE',durationMs:${report.output.durationMs},evidence:{retryIntervals:${JSON.stringify(retries)},clipMs:360}})))`], {cwd: root, encoding: "utf8"}));
if (adapter.status !== "PASS") throw new Error(`retry-adapter-failed:${JSON.stringify(adapter)}`);
const result = {contract: "A1RetryMontageReview/v1", status: "PASS_REVIEW_ONLY", source: {captureReport: path.relative(root, capturePath), captureSha256: sha(capturePath), sourceVideo: report.output.sha256}, retryIntervals: retries, persistedReadback: persisted, adapter: {status: adapter.status, kind: adapter.program.kind, sha256: adapter.adapterProgramSha256}, output: {path: path.relative(root, montage), sha256: sha(montage), width: stream.width, height: stream.height, fps: stream.r_frame_rate, frameCount: Number(stream.nb_read_frames), durationMs: Math.round(Number(probe.format.duration) * 1000), fullDecodePass: true}, boundary: {reviewOnly: true, productionAdmission: false, temporaryDocumentDeleted: true}};
result.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");
await fsp.writeFile(path.join(out, "audit-report.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, retryIntervals: retries, output: result.output, adapter: result.adapter, persistedReadback: persisted}, null, 2));
