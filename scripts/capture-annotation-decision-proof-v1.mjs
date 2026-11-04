#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const runId = `annotation-decision-${Date.now()}`;
const outputRoot = path.join(root, "work/screen-recording-maturity-test-v1/annotation-decision-proof-v1");
const out = path.join(outputRoot, runId);
const documentId = `screen_decision_${runId}`;
const api = async (route, options) => {
  const response = await fetch(`http://127.0.0.1:8766${route}`, options);
  if (!response.ok) throw new Error(`WORKBENCH_HTTP_${response.status}`);
  return response.json();
};
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const paragraphs = [
  "保留这条证据，因为它来自真实来源。",
  "删除这句错误结论，它与实际结果不一致。",
  "最终只保留可验证的结果。",
  "测试账号：demo@example.test",
];
fs.mkdirSync(out, {recursive: true});
let created = false;
try {
  await api("/api/document", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({documentId, documentType: "experiment", title: "录屏判断流程临时文档", contentHtml: paragraphs.map((text) => `<p>${text}</p>`).join(""), contentText: paragraphs.join("\n\n"), metadata: {purpose: "screen-annotation-decision-proof", temporary: true}})});
  created = true;
  const scenario = {
    contract: "A1GenericBrowserScreenScenario/v1",
    id: runId,
    productId: "writing-workbench",
    productCategory: "source-bound-decision",
    projectRoot: "/Users/a1/Documents/Codex/写作项目/workbench_runtime",
    sourceFiles: ["inline_editor_v2/app.js", "inline_editor_v2/index.html"],
    url: `http://127.0.0.1:8766/v2/?documentId=${documentId}`,
    width: 1920,
    height: 1080,
    durationMs: 12000,
    readySelector: "#editor",
    operations: [
      {atMs: 900, type: "observe", name: "source-evidence", selector: "#editor p", index: 0, targetKind: "TEXT", textRange: "真实来源"},
      {atMs: 3000, type: "replaceText", name: "remove-wrong-conclusion", selector: "#editor p", index: 1, targetKind: "TEXT", textRange: "删除这句错误结论，它与实际结果不一致。", replacement: "这句错误结论已删除。", expectedText: "这句错误结论已删除。", delayMs: 38},
      {atMs: 5200, type: "click", name: "save-after-edit", selector: "#saveWorkspace", targetKind: "UI"},
      {atMs: 6500, type: "observe", name: "edited-state", selector: "#editor p", index: 1, targetKind: "TEXT", textRange: "这句错误结论已删除"},
      {atMs: 7800, type: "observe", name: "verified-result", selector: "#editor p", index: 2, targetKind: "TEXT", textRange: "可验证的结果"},
      {atMs: 8600, type: "observe", name: "privacy-evidence", selector: "#editor p", index: 3, targetKind: "TEXT", textRange: "demo@example.test"},
    ],
    primaryEvent: "source-evidence",
    directorPlan: {
      contract: "A1ScreenDirectorBrain/v1",
      sequence: "SOURCE_DECISION_RESULT",
      beats: [
        {id: "source", function: "establish", technique: "HIGHLIGHT_WASH", event: "source-evidence"},
        {id: "decision", function: "action", technique: "SOURCE_ACTION_ONLY", event: "remove-wrong-conclusion"},
        {id: "save", function: "feedback", technique: "HARD_CUT_STATE_REPLACE", event: "save-after-edit"},
        {id: "result", function: "result", technique: "RESULT_HOLD", event: "verified-result"},
      ],
      cameraBeats: [],
    },
  };
  const scenarioPath = path.join(out, "scenario.json");
  fs.writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
  const result = spawnSync(process.execPath, [path.join(root, "scripts/capture-generic-browser-screen-proof-v1.mjs"), scenarioPath], {cwd: root, env: {...process.env, A1_GENERIC_CAPTURE_OUTPUT_ROOT: outputRoot}, encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
  fs.writeFileSync(path.join(out, "capture.log"), result.stdout + result.stderr);
  if (result.status !== 0) throw new Error(`DECISION_CAPTURE_FAILED:${result.stderr.slice(-2400)}`);
  const reportPath = path.join(out, "capture-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const persisted = await api(`/api/document?documentId=${encodeURIComponent(documentId)}`);
  const persistedReadback = JSON.stringify(persisted).includes("这句错误结论已删除。");
  if (!persistedReadback) throw new Error("DECISION_PERSISTED_READBACK_FAILED");
  const audit = {contract: "A1AnnotationDecisionProof/v1", status: report.output.fullDecodePass && persistedReadback && report.editTelemetry?.length === 1 ? "PASS_REVIEW_ONLY" : "FAIL", source: {captureReport: path.relative(root, reportPath), captureReportSha256: sha(reportPath), videoSha256: report.output.sha256}, editTelemetry: report.editTelemetry, events: report.events.filter((event) => event.type?.includes("text-") || event.type === "click"), persistedReadback, output: report.output, boundary: {reviewOnly: true, temporaryDocumentDeleted: true, productionAdmission: false}};
  audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
  fs.writeFileSync(path.join(out, "decision-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify({status: audit.status, out: path.relative(root, out), report: path.relative(root, reportPath), audit: path.relative(root, path.join(out, "decision-audit.json")), persistedReadback, editTelemetry: report.editTelemetry}, null, 2));
  if (audit.status === "FAIL") process.exitCode = 1;
} finally {
  if (created) await fetch(`http://127.0.0.1:8766/api/document?documentId=${encodeURIComponent(documentId)}`, {method: "DELETE"}).catch(() => {});
}
