#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "work/mature-native-screen-post-v2");
const resultPath = path.join(workDir, "result.json");
const auditPath = path.join(workDir, "audit-report.json");
const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const json = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const failures = [];
const check = (id, pass) => { if (!pass) failures.push(id); };
const result = json(resultPath);

check("RESULT_CONTRACT", result.contract === "A1MatureNativeScreenPostResult/v2" && result.status === "PASS");
check("THREE_GENRES", result.fixtures?.length === 3 && new Set(result.fixtures.map((fixture) => fixture.genre)).size === 3 && result.fixtures.every((fixture) => fixture.status === "PASS"));
check("TWO_REAL_PRODUCTS", result.products?.length === 2 && result.products.every((product) => product.status === "PASS"));
check("NO_DECORATIVE_TRANSITION", result.products.every((product) => product.renderPolicy.decorativeTransition === false));
check("NO_FOCUS_RECTANGLE", result.products.every((product) => product.renderPolicy.focusRectangle === false));
check("NO_CLICK_RING", result.products.every((product) => product.renderPolicy.clickRing === false));
check("NO_BROWSER_WITHIN_BROWSER", result.products.every((product) => product.renderPolicy.browserWithinBrowserFrame === false));
check("CURSOR_TRANSIENT", result.products.every((product) => product.renderPolicy.cursorMode === "TELEMETRY_BOUND_HIDE_WHEN_IDLE"));
check("NO_IDLE_CURSOR_AT_START", result.products.every((product) => product.renderPolicy.cursorFirstMoveMs >= 500));
check("INVISIBLE_CURSOR_PLACEHOLDER", result.products.every((product) => product.renderPolicy.invisibleCursorBeforeAction === true));
check("CLEAN_SOURCE_BEFORE_CURSOR", result.products.every((product) => product.renderPolicy.idleCursorSuppression === "CLEAN_SOURCE_OVERLAY_UNTIL_FIRST_REAL_MOVE"));
check("ZOOM_BUDGET", result.products.every((product) => product.renderPolicy.semanticZoomCount <= 1 && product.renderPolicy.maximumZoom <= 1.08));
check("AUTHORITY_UNCHANGED", result.authority?.unchanged === true);
check("TARGETS_UNCHANGED", result.targetProjects?.every((project) => project.unchanged === true));
check("REVIEW_BOUNDARY", result.boundary?.reviewOnly === true && result.boundary?.productionAdmission === false && result.boundary?.userVisualApproval === "PENDING");

for (const product of result.products || []) {
  const videoPath = path.join(root, product.video.path);
  const sourcePath = path.join(root, product.source.path);
  const capConfigPath = path.join(root, product.capProject.path, "project-config.json");
  check(`${product.id}:VIDEO_SHA`, fs.existsSync(videoPath) && sha256(videoPath) === product.video.sha256);
  check(`${product.id}:SOURCE_SHA`, fs.existsSync(sourcePath) && sha256(sourcePath) === product.source.sha256);
  check(`${product.id}:CAP_CONFIG_SHA`, fs.existsSync(capConfigPath) && sha256(capConfigPath) === product.capProject.configSha256);
  if (fs.existsSync(videoPath)) {
    try { execFileSync("ffmpeg", ["-v", "error", "-i", videoPath, "-f", "null", "-"], {stdio: "pipe"}); } catch { failures.push(`${product.id}:FULL_DECODE`); }
  }
  if (fs.existsSync(capConfigPath)) {
    const cap = json(capConfigPath);
    check(`${product.id}:FULL_BLEED`, Number(cap.background?.padding || 0) === 0 && Number(cap.background?.rounding || 0) === 0 && Number(cap.background?.shadow || 0) === 0);
    check(`${product.id}:NO_CURSOR_CLICK_SPRING`, cap.cursor?.clickSpring == null);
    check(`${product.id}:CURSOR_IDLE_HIDE`, cap.cursor?.hide === false && cap.cursor?.hideWhenIdle === true);
  }
}

const contactPath = path.join(root, result.contactSheet.path);
check("CONTACT_SHEET_SHA", fs.existsSync(contactPath) && sha256(contactPath) === result.contactSheet.sha256);
const policySource = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-mature-screen-post-policy-v1.mjs"), "utf8");
check("POLICY_DEFAULT_SKIP", policySource.includes('effectsDefault: "SKIP"'));
check("POLICY_NO_DECORATION", policySource.includes("decorativeTransitionsForbidden: true") && policySource.includes("defaultFocusRectanglesForbidden: true") && policySource.includes("clickRingsForbidden: true"));

const report = {contract: "A1MatureNativeScreenPostAudit/v2", status: failures.length ? "FAIL" : "PASS", resultSha256: sha256(resultPath), checks: result.checks, failures, boundary: result.boundary};
report.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
fs.writeFileSync(auditPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
