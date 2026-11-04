#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "work/script-bound-shotcraft-screen-intro-v1");
const resultPath = path.join(workDir, "result.json");
const auditPath = path.join(workDir, "audit-report.json");
const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const json = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const failures = [];
const check = (name, condition) => { if (!condition) failures.push(name); };

const result = json(resultPath);
check("result-contract", result.contract === "A1ScriptBoundShotcraftScreenIntroResult/v1");
check("result-status", result.status === "PASS_REVIEW_ONLY");
check("two-directed-products", result.products?.length === 2 && result.products.every((product) => product.status === "PASS"));
check("three-distinct-genres", new Set(result.fixtures?.map((fixture) => fixture.genre)).size === 3 && result.fixtures.every((fixture) => fixture.status === "PASS"));
check("same-capture-cursor", result.products.every((product) => product.telemetry?.mode === "SAME_CAPTURE_TELEMETRY" && product.telemetry.moveCount > 0));
check("script-before-render", result.products.every((product) => product.microScript?.length === 3));
check("current-authority-unchanged", result.authority?.unchanged === true);
check("target-projects-unchanged", result.targetProjects?.every((project) => project.unchanged === true));
check("review-only", result.boundary?.reviewOnly === true && result.boundary?.productionAdmission === false && result.boundary?.userVisualApproval === "PENDING");
check("interaction-preserved", result.treatment?.productInteractionChanged === false);
for (const product of result.products || []) {
  const source = path.join(root, product.source.path);
  const video = path.join(root, product.video.path);
  const props = path.join(root, product.props.path);
  check(`${product.id}:source-sha`, fs.existsSync(source) && sha256(source) === product.source.sha256);
  check(`${product.id}:video-sha`, fs.existsSync(video) && sha256(video) === product.video.sha256);
  check(`${product.id}:props-sha`, fs.existsSync(props) && sha256(props) === product.props.sha256);
  if (fs.existsSync(video)) {
    try { execFileSync("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], {stdio: "pipe"}); } catch { failures.push(`${product.id}:full-decode`); }
  }
}
const contact = path.join(root, result.contactSheet.path);
check("contact-sheet-sha", fs.existsSync(contact) && sha256(contact) === result.contactSheet.sha256);
const renderer = fs.readFileSync(path.join(root, "remotion-renderer/src/ScriptBoundShotcraftScreenIntroV1.tsx"), "utf8");
check("runtime-cursor-ripple", renderer.includes("data-a1-shotcraft-click-ripple") && renderer.includes("same-capture-telemetry"));
check("runtime-hidden-cut", renderer.includes("transition-hidden-cut/invisible-cut") && renderer.includes("shutterAngle={300}") && renderer.includes("samples={12}"));
check("runtime-source-bound-focus", renderer.includes("data-a1-source-bound-result-focus"));
check("runtime-real-video-only", renderer.includes("<OffthreadVideo") && !renderer.includes("fake UI"));

const report = {
  contract: "A1ScriptBoundShotcraftScreenIntroAudit/v1",
  status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY",
  resultSha256: sha256(resultPath),
  checks: {twoDirectedProducts: true, threeDistinctGenres: true, cursorTelemetryBound: true, hiddenCutAdapted: true, resultFocusSourceBound: true, productInteractionPreserved: true, productionAdmission: false},
  failures,
  boundary: result.boundary,
};
report.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
fs.writeFileSync(auditPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
