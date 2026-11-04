#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawn, spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = "/Users/a1/Documents/Codex/写作项目/workbench_runtime/video_analysis_app";
const id = `real-file-drop-${Date.now()}`;
const outputRoot = path.join(root, "work/screen-recording-maturity-test-v1/real-file-drop-v1");
const out = path.join(outputRoot, id);
const sourceFile = path.join(root, "work/screen-recording-maturity-test-v1/real-file-drop-v1/drop-source.mp4");
const scenarioPath = path.join(out, "scenario.json");
fs.mkdirSync(out, {recursive: true});
const scenario = {contract: "A1GenericBrowserScreenScenario/v1", id, productId: "video-analysis-app", productCategory: "real-file-drop", projectRoot: appRoot, sourceFiles: ["dist/index.html", "dist/assets/index-DMUoWlJS.js", "dist/assets/index-IDx_Lza7.js", "dist/assets/index-iDezcz78.css"], url: "http://127.0.0.1:8791/video-analysis/", width: 1280, height: 720, durationMs: 9000, readySelector: "#root", prepare: [{type: "click", selector: "button:has-text('本地文件')"}], operations: [{atMs: 900, type: "observe", name: "drop-ready", selector: "[data-testid='local-drop-zone']", targetKind: "DROP_ZONE"}, {atMs: 2200, type: "fileDrop", name: "real-file-drop", selector: "[data-testid='local-drop-zone']", file: "work/screen-recording-maturity-test-v1/real-file-drop-v1/drop-source.mp4", fileName: "drop-source.mp4", mimeType: "video/mp4", durationMs: 1500, targetKind: "DROP_ZONE", resultSelector: "[data-testid='start-video-job']:not([disabled])"}], primaryEvent: "real-file-drop-drop", directorPlan: {contract: "A1ScreenDirectorBrain/v1", sequence: "REAL_FILE_DROP_TETHER_HOLD", beats: [{id: "drag", function: "action", technique: "DRAG_PATH_FOLLOW", event: "real-file-drop"}, {id: "tether", function: "feedback", technique: "DRAG_TETHER", event: "real-file-drop"}, {id: "result", function: "result", technique: "RESULT_HOLD", event: "result_hold"}], cameraBeats: []}};
fs.writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
const serverRoot = path.join(out, "server-root"); fs.mkdirSync(serverRoot, {recursive: true}); fs.cpSync(path.join(appRoot, "dist"), path.join(serverRoot, "video-analysis"), {recursive: true});
const server = spawn("python3", ["-m", "http.server", "8791", "--directory", serverRoot], {cwd: serverRoot, stdio: ["ignore", "pipe", "pipe"]});
let created = false;
try {
  for (let i = 0; i < 60; i += 1) { const probe = spawnSync("curl", ["-fsS", "http://127.0.0.1:8791/video-analysis/"], {encoding: "utf8"}); if (probe.status === 0) { created = true; break; } await new Promise((resolve) => setTimeout(resolve, 100)); }
  if (!created) throw new Error("VIDEO_ANALYSIS_SERVER_NOT_READY");
  const result = spawnSync(process.execPath, [path.join(root, "scripts/capture-generic-browser-screen-proof-v1.mjs"), scenarioPath], {cwd: root, env: {...process.env, A1_GENERIC_CAPTURE_OUTPUT_ROOT: outputRoot}, encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
  fs.writeFileSync(path.join(out, "capture.log"), result.stdout + result.stderr);
  if (result.status !== 0) throw new Error(`REAL_FILE_DROP_CAPTURE_FAILED:${result.stderr.slice(-2400)}`);
  const reportPath = path.join(out, "capture-report.json"); const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const dropEvent = report.events?.find((event) => event.type === "file-drop"); const target = report.geometryTruth?.targets?.find((row) => row.targetKey === "real-file-drop-target");
  const checks = {capturePass: report.status === "READY_FOR_CAP_REVIEW", realRuntime: report.runtimeId === "GENERIC_BROWSER_CAPTURE_V1", fileDropEvent: Boolean(dropEvent), targetGeometry: Boolean(target?.sourceRect), projectUnchanged: report.project?.unchanged === true, fullDecode: report.output?.fullDecodePass === true, dragTelemetry: (report.dragTelemetry?.length || 0) >= 24, resultEnabledAfterDrop: report.events?.some((event) => event.name === "real-file-drop-drop")};
  const failures = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  const audit = {contract: "A1RealFileDropTetherAudit/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", effect: {id: "DRAG_TETHER", status: failures.length ? "BLOCKED" : "PASS_REAL", evidence: "real video-analysis product drop zone accepts an actual local video through a real browser file-drop event and pointer path"}, source: {captureReport: path.relative(root, reportPath), captureReportSha256: crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex"), sourceFile: path.relative(root, sourceFile), sourceFileSha256: crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex")}, checks, dropEvent, targetGeometry: target, failures, boundary: {reviewOnly: true, productionAdmission: false, formal34ShotMutation: false}};
  audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
  const auditPath = path.join(outputRoot, "real-file-drop-tether-audit.json"); fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify({status: audit.status, effect: audit.effect, failures, output: path.relative(root, auditPath)}, null, 2));
  if (failures.length) process.exitCode = 1;
} finally { server.kill("SIGTERM"); }
