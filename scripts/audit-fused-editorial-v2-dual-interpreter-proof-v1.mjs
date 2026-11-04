#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "fused-editorial-v2-dual-interpreter-proof-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report = read(path.join(publicDir, "report.json"));
const plan = read(path.join(publicDir, "plan.json"));
const records = read(path.join(publicDir, "render-records.json"));
const html = fs.readFileSync(path.join(publicDir, "hyperframes-proof.html"), "utf8");
const currentPhaseSha = sha(currentPhasePath);
const checks = [
  ["report-pass", report.status === "PASS"],
  ["canonical-ir", report.sourceOfTruth === "A1LayeredShotDesign/v2" && plan.sourceOfTruth === report.sourceOfTruth],
  ["reference-suite-samples", report.source.referenceSuiteSampleCount === 3 && plan.shots.length === 3],
  ["same-keyframe-count", records.remotion.length === 15 && records.hyperframes.length === 15],
  ["same-keyframe-ids", records.remotion.map((item) => `${item.shotId}:${item.momentId}`).join("|") === records.hyperframes.map((item) => `${item.shotId}:${item.momentId}`).join("|")],
  ["shared-gsap-timeline", html.includes("window.__timelines['a1-fused-editorial-v2-dual']") && html.includes("A1LayeredShotDesign/v2")],
  ["contact-sheet", fs.existsSync(path.join(publicDir, "dual-interpreter-hold-contact-sheet.jpg")) && fs.existsSync(path.join(artifactDir, "dual-interpreter-hold-contact-sheet.jpg"))],
  ["authority-unchanged", report.authority.unchanged === true && report.authority.sha256After === currentPhaseSha],
];
const failures = checks.filter(([, pass]) => !pass).map(([id]) => id);
const audit = {contract: "A1CanonicalEditorialDualInterpreterAudit/v1", phaseId, status: failures.length ? "FAIL" : "PASS", checks: Object.fromEntries(checks), failures, reportSha256: sha(path.join(publicDir, "report.json")), currentAuthoritySha256: currentPhaseSha, nextAction: failures.length ? "repair-dual-interpreter-proof" : "build-12-shot-pilot-before-47-board"};
fs.mkdirSync(path.dirname(path.join(artifactDir, "audit.json")), {recursive: true}); fs.writeFileSync(path.join(artifactDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`); fs.writeFileSync(path.join(publicDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
if (failures.length) process.exitCode = 1;
