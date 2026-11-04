import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {describeCapExecutedEffects} from "./cap-execution-readback.mjs";
import {auditSourcePointerBinding} from "./a1-screen-pointer-provenance-v1.mjs";

// Explicit allowlists: PASS_WITH_GAPS and unknown future states are not success.
const passes = new Set(["PASS", "PASS_REAL", "PASS_REVIEW_ONLY", "RESOLVED"]);
export const isEvidencePass = (status) => passes.has(status);
export function findingDisposition(finding) {
  if (finding.severity === "BOUNDARY" && finding.status === "LOCKED") return "BOUNDARY";
  if (finding.status === "POLICY_DISABLED" && finding.reason) return "EXCLUDED";
  if (finding.status === "OUT_OF_SCOPE" && finding.reason) return "EXCLUDED";
  if (isEvidencePass(finding.status)) return "PASS";
  if (/^(FAIL|REJECTED|STALE|INVALID)/u.test(finding.status || "")) return "FAIL";
  return "INCOMPLETE";
}
export function summarizeFindings(findings) {
  const unresolved = findings.filter((finding) => ["FAIL", "INCOMPLETE"].includes(findingDisposition(finding)));
  return {
    status: unresolved.some((finding) => findingDisposition(finding) === "FAIL") ? "FAIL" : unresolved.length ? "INCOMPLETE" : "PASS_REVIEW_ONLY",
    unresolved,
    maturityProven: false, // Engineering checks cannot confer human visual acceptance.
  };
}
export const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function localFile(root, relative) {
  if (typeof relative !== "string" || !relative) throw new Error("INVALID_EVIDENCE_PATH");
  const base = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(base, relative));
  if (!file.startsWith(base + path.sep)) throw new Error("EVIDENCE_OUTSIDE_WORKSPACE");
  if (!fs.statSync(file).isFile()) throw new Error("EVIDENCE_NOT_FILE");
  return file;
}

// Follow only declared, hash-bound evidence. No directory walks or workspace scans.
export function inspectEvidenceBindings(root, document, {recursive = true, maxFiles = 160} = {}) {
  const failures = [], checked = new Map(), active = new Set(), expanded = new Set();
  const verify = (relative, expected, location) => {
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/u.test(expected)) {
      failures.push({id: "EVIDENCE_SHA_MISSING", location, path: relative}); return;
    }
    let file;
    try { file = localFile(root, relative); } catch (error) {
      failures.push({id: "EVIDENCE_UNAVAILABLE", location, path: relative, reason: error.message}); return;
    }
    if (active.has(file)) { failures.push({id: "EVIDENCE_DEPENDENCY_CYCLE", location, path: relative}); return; }
    if (!checked.has(file)) {
      if (checked.size >= maxFiles) { failures.push({id: "EVIDENCE_BUDGET_EXCEEDED", location}); return; }
      checked.set(file, shaFile(file));
    }
    if (checked.get(file) !== expected) {
      failures.push({id: "EVIDENCE_SHA_CHANGED", location, path: relative, expected, actual: checked.get(file)}); return;
    }
    if (recursive && file.endsWith(".json") && !expanded.has(file)) {
      active.add(file);
      try { visit(readJson(file), relative); } catch (error) {
        failures.push({id: "EVIDENCE_JSON_INVALID", path: relative, reason: error.message});
      } finally { active.delete(file); expanded.add(file); }
    }
  };
  const visit = (value, location) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, `${location}[${index}]`)); return; }
    const pairs = [["path", "sha256"], ["report", "reportSha256"], ["captureReport", "captureReportSha256"], ["video", "videoSha256"], ["videoPath", "videoSha256"], ["capturePath", value.captureSha256 ? "captureSha256" : "sha256"], ["savedState", "savedStateSha256"], ["capVideoPath", "capVideoSha256"]];
    for (const [fileKey, hashKey] of pairs) {
      if (typeof value[fileKey] === "string" && (hashKey in value || /\.(mp4|webm|png|json)$/u.test(value[fileKey]))) verify(value[fileKey], value[hashKey], `${location}.${fileKey}`);
    }
    for (const [key, child] of Object.entries(value)) if (child && typeof child === "object") visit(child, `${location}.${key}`);
  };
  visit(document, "$root");
  return {status: failures.length ? "FAIL" : "PASS", failures, fileCount: checked.size, checked: [...checked].map(([file, sha256]) => ({path: path.relative(root, file), sha256}))};
}

export function writeAudit(root, relative, report, inputs = []) {
  // Refuse to publish against evidence changed during the check.
  for (const input of inputs) if (shaFile(localFile(root, input.path)) !== input.sha256) throw new Error(`INPUT_CHANGED_DURING_AUDIT:${input.path}`);
  const body = {...report};
  const modulePath = path.relative(fs.realpathSync(root), import.meta.filename);
  if (!modulePath.startsWith("..")) body.validationImplementation = [
    {path: modulePath, sha256: shaFile(import.meta.filename)},
    {path: "scripts/lib/cap-execution-readback.mjs", sha256: shaFile(path.join(root, "scripts/lib/cap-execution-readback.mjs"))},
  ];
  delete body.auditSha256;
  body.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const out = path.join(root, relative);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const bytes = `${JSON.stringify(body, null, 2)}\n`;
  if (fs.existsSync(out) && fs.readFileSync(out, "utf8") === bytes) return body;
  const temporary = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes, {flag: "wx"});
  fs.renameSync(temporary, out);
  return body;
}

export function screenScopeFindings({kind, narration = false, presenter = false, formalFilmMutation = false} = {}) {
  const findings = [];
  if (!["REAL_SCREEN_CAPTURE", "SOURCE_BOUND_SCREEN_POST"].includes(kind)) findings.push({id: "NOT_A_SCREEN_DELIVERABLE", status: "FAIL"});
  if (narration || presenter || formalFilmMutation) findings.push({id: "SCREEN_TASK_SCOPE_EXPANSION", status: "FAIL"});
  return findings;
}

export function validateCapScreenProvenance(root, receipt, outputPath) {
  const findings = [];
  for (const key of ["captureReport", "sourceVideo", "reviewVideo"]) {
    if (!receipt[key]?.path || !receipt[key]?.sha256) findings.push({id: `${key}:BINDING_MISSING`, status: "INCOMPLETE"});
  }
  const configRef = receipt.capProject?.path && receipt.capProject.configSha256 ? {path: `${receipt.capProject.path}/project-config.json`, sha256: receipt.capProject.configSha256} : null;
  if (!configRef) findings.push({id: "EDITABLE_PROJECT_BINDING_MISSING", status: "INCOMPLETE"});
  const bindings = inspectEvidenceBindings(root, {captureReport: receipt.captureReport, sourceVideo: receipt.sourceVideo, reviewVideo: receipt.reviewVideo, config: configRef}, {recursive: false});
  findings.push(...bindings.failures.map((row) => ({...row, status: "FAIL"})));
  if (receipt.contract !== "A1GenericCapReviewReceipt/v1" || receipt.status !== "PASS" || receipt.runtimeId !== "GENERIC_CAP_ADAPTER_V1") findings.push({id: "SCREEN_RENDER_RECEIPT_INVALID", status: "FAIL"});
  if (receipt.reviewVideo?.path !== outputPath) findings.push({id: "OUTPUT_NOT_BOUND_TO_RECEIPT", status: "FAIL"});
  if (!findings.length) {
    const capture = readJson(localFile(root, receipt.captureReport.path));
    if (capture.contract !== "A1GenericBrowserScreenProof/v1" || capture.status !== "READY_FOR_CAP_REVIEW" || capture.captureScope !== "BROWSER_PAGE_VIEWPORT_ONLY" || capture.captureBackend !== "PLAYWRIGHT_HEADLESS_RECORD_VIDEO") findings.push({id: "REAL_CAPTURE_PROVENANCE_MISSING", status: "FAIL"});
  if (capture.cursorPixelPolicy !== "CAP_NATIVE_CURSOR_REPLAY_FROM_SOURCE_EVENTS" || capture.sourcePointerReplay?.contract !== "A1CapSourcePointerReplay/v1") findings.push({id: "SOURCE_EVENT_CURSOR_ROUTE_MISSING", status: "INCOMPLETE"});
    const trustedPointerDowns = (capture.sourcePointerEvents || []).filter((event) => event.type === "pointerdown" && event.isTrusted === true && event.pointerType === "mouse");
    if (!trustedPointerDowns.length || !receipt.sourcePointerEvidence || receipt.sourcePointerEvidence.policy !== "CAP_NATIVE_CURSOR_REPLAY_FROM_SOURCE_EVENTS" || receipt.sourcePointerEvidence.capCursorOverlay !== "CAP_NATIVE_ASSET_REPLAY" || receipt.feedback?.cursorOverlay !== "CAP_NATIVE_ASSET_NO_SPRING_OR_BLUR") findings.push({id: "SOURCE_MOUSE_RENDER_BINDING_MISSING", status: "FAIL"});
    for (const proof of capture.clickTargetProof || []) { const event = trustedPointerDowns.find((row) => row.captureTimeMs >= proof.clickAtMs - 80 && row.captureTimeMs <= proof.clickAtMs + 80); if (!event) findings.push({id: `CLICK_HAS_NO_SOURCE_POINTER_EVENT:${proof.event}`, status: "FAIL"}); else if (!proof.insideTarget || event.cssX < proof.targetRectCss.x || event.cssX > proof.targetRectCss.x + proof.targetRectCss.width || event.cssY < proof.targetRectCss.y || event.cssY > proof.targetRectCss.y + proof.targetRectCss.height) findings.push({id: `SOURCE_POINTER_MISSES_TARGET:${proof.event}`, status: "FAIL"}); }
    if (capture.headedWindowCreated !== false || capture.frontmostApplicationMutation !== false) findings.push({id: "BACKGROUND_CAPTURE_BOUNDARY_UNPROVEN", status: "INCOMPLETE"});
    if (capture.output?.sha256 !== receipt.sourceVideo?.sha256 || capture.geometryTruth?.source?.sha256 !== receipt.sourceVideo?.sha256) findings.push({id: "CAPTURE_SOURCE_IDENTITY_MISMATCH", status: "FAIL"});
    if (!capture.events?.some((event) => event.name === "result_hold") || capture.events.length < 3) findings.push({id: "SOURCE_ACTION_RESULT_EVIDENCE_MISSING", status: "INCOMPLETE"});
    if (capture.captureSync?.syncPass !== true) findings.push({id: "SOURCE_TIME_ORIGIN_MISSING", status: "INCOMPLETE"});
    if ((capture.events || []).some((event, index, events) => !Number.isFinite(event.tMs) || event.tMs < 0 || event.tMs > capture.output.durationMs + 100 || (index > 0 && event.tMs < events[index - 1].tMs))) findings.push({id: "SOURCE_EVENT_ORDER_INVALID", status: "FAIL"});
    const config = readJson(localFile(root, configRef.path));
    const capProjectRelative = receipt.capProject.path;
    const capMeta = readJson(localFile(root, `${capProjectRelative}/recording-meta.json`));
    const cursorPath = "content/segments/segment-0/cursor.json";
    const capCursor = readJson(localFile(root, `${capProjectRelative}/${cursorPath}`));
    if (capMeta.segments?.[0]?.cursor !== cursorPath) findings.push({id: "CAP_CURSOR_TRACK_NOT_ATTACHED", status: "FAIL"});
    if (shaFile(localFile(root, `${capProjectRelative}/${cursorPath}`)) !== receipt.capProject.cursorSha256) findings.push({id: "CAP_CURSOR_TRACK_SHA_MISMATCH", status: "FAIL"});
    for (const id of ["0", "2"]) {
      const imagePath = `${capProjectRelative}/content/cursors/cursor_${id}.png`;
      const imageSha = shaFile(localFile(root, imagePath));
      if (imageSha !== receipt.sourcePointerEvidence?.assetHashes?.[id] || capMeta.cursors?.[id]?.imagePath !== `content/cursors/cursor_${id}.png`) findings.push({id: `CAP_POINTER_ASSET_BINDING_INVALID:${id}`, status: "FAIL"});
    }
    const rawMouseEvents = (capture.sourcePointerEvents || []).filter((event) => event.isTrusted === true && event.pointerType === "mouse");
    const sourceMoves = rawMouseEvents.filter((event) => event.type === "pointermove");
    const sourceButtons = rawMouseEvents.filter((event) => event.type === "pointerdown" || event.type === "pointerup");
    const viewport = capture.geometryTruth?.frame?.viewportCss || {width: capture.output.width, height: capture.output.height};
    if (capCursor.moves?.length !== sourceMoves.length) findings.push({id: "CAP_CURSOR_MOVE_COUNT_DIFFERS_FROM_CAPTURE", status: "FAIL"});
    for (let index = 0; index < Math.min(capCursor.moves?.length || 0, sourceMoves.length); index += 1) {
      const actual = capCursor.moves[index], expected = sourceMoves[index];
      if (actual.time_ms !== expected.captureTimeMs || Math.abs(actual.x - expected.cssX / viewport.width) > 1e-6 || Math.abs(actual.y - expected.cssY / viewport.height) > 1e-6) findings.push({id: `CAP_CURSOR_MOVE_DIFFERS_FROM_CAPTURE:${index}`, status: "FAIL"});
      if ((expected.cursorCss === "pointer" ? actual.cursor_id !== "2" : actual.cursor_id !== "0")) findings.push({id: `CAP_CURSOR_STYLE_DIFFERS_FROM_UI:${index}`, status: "FAIL"});
    }
    if (capCursor.clicks?.length !== sourceButtons.length) findings.push({id: "CAP_CURSOR_BUTTON_COUNT_DIFFERS_FROM_CAPTURE", status: "FAIL"});
    for (let index = 0; index < Math.min(capCursor.clicks?.length || 0, sourceButtons.length); index += 1) if (capCursor.clicks[index].time_ms !== sourceButtons[index].captureTimeMs || capCursor.clicks[index].down !== (sourceButtons[index].type === "pointerdown")) findings.push({id: `CAP_CURSOR_BUTTON_DIFFERS_FROM_CAPTURE:${index}`, status: "FAIL"});
    const pointerProof = auditSourcePointerBinding({capture, receipt, config});
    if (pointerProof.status !== "PASS_REVIEW_ONLY") findings.push(...pointerProof.failures.map((id) => ({id, status: "FAIL"})));
    const actualEffects = describeCapExecutedEffects(capture, config, receipt.feedback);
    const effects = receipt.executionEffects || [];
    if (!effects.length || effects.some((effect) => !["SOURCE_VIDEO_PRESERVED", "CAP_CAMERA_EXECUTED", "CAP_MASK_EXECUTED"].includes(effect.execution))) findings.push({id: "UNVERIFIED_SCREEN_POST_ACTOR", status: "INCOMPLETE"});
    if (JSON.stringify(actualEffects) !== JSON.stringify(effects)) findings.push({id: "EXECUTION_RECEIPT_CONFIG_MISMATCH", status: "FAIL"});
  }
  return {...summarizeFindings(findings), findings, bindings, scope: "SOURCE_PROVENANCE_ONLY", visualAcceptance: "NOT_REVIEWED"};
}

export function evaluateReadingWindows({durationMs, windows, samples, minimumTextHeightPx = 18}) {
  const findings = [];
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [{id: "ENCODED_DURATION_MISSING", status: "INCOMPLETE"}];
  if (!windows?.length) return [{id: "READING_WINDOWS_MISSING", status: "INCOMPLETE"}];
  for (const window of windows) {
    const prefix = window.id || "unnamed";
    if (!Number.isFinite(window.startMs) || !Number.isFinite(window.endMs) || window.startMs < 0 || window.endMs > durationMs || window.endMs - window.startMs < 800 || !window.expectedText?.trim()) {
      findings.push({id: `${prefix}:READING_WINDOW_INVALID`, status: "FAIL"}); continue;
    }
    const rows = (samples || []).filter((sample) => sample.windowId === window.id).sort((a, b) => a.atMs - b.atMs);
    if (rows.length < 3 || rows[0].atMs > window.startMs + 100 || rows.at(-1).atMs < window.endMs - 100 || rows.some((row, index) => index && row.atMs - rows[index - 1].atMs > 500)) findings.push({id: `${prefix}:READING_TIME_COVERAGE_MISSING`, status: "INCOMPLETE"});
    for (const row of rows) {
      if (!Number.isFinite(row.textHeightPx) || row.textHeightPx < minimumTextHeightPx || row.exactTextVisible !== true || row.clipped !== false || row.cameraSettled !== true) findings.push({id: `${prefix}:${row.atMs}:UNREADABLE_ENCODED_SAMPLE`, status: "FAIL"});
      if (!row.frame?.path || !row.frame.sha256 || !row.ocr?.path || !row.ocr.sha256) findings.push({id: `${prefix}:${row.atMs}:PIXEL_MEASUREMENT_MISSING`, status: "INCOMPLETE"});
    }
  }
  return findings;
}
