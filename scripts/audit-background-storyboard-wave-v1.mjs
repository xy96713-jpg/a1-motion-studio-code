#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
const shotIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"];
const eventContracts = {
  "ED-02": {required: ["sentence_selected", "result_hold"], forbidden: []},
  "ED-03": {required: ["like_click", "ban_click", "style_library_hold"], forbidden: []},
  "ED-04": {required: ["paragraph_anchor_hold", "paragraph_slot_created", "paragraph_request_entered", "paragraph_request_run", "paragraph_candidates_hold"], forbidden: ["paragraph_candidate_applied"]},
  "ED-05": {required: ["review_click", "review_running", "review_findings_hold", "review_suggestion_hold"], forbidden: []},
  "ED-06": {required: ["presentation_open", "presentation_adjusted", "presentation_playing"], forbidden: []},
  "ED-21": {required: ["document_opened", "edit_applied"], forbidden: []},
  "ED-22": {required: ["unsaved_edit_visible", "save_shortcut", "save_confirmed", "reopened_latest_verified"], forbidden: []},
  "ED-23": {required: ["current_topic_five_versions", "reference_topic_isolated"], forbidden: []},
  "ED-24": {required: ["sentence_selected", "selected_phrase_hold", "ban_reason_entered", "ban_click", "style_library_hold"], forbidden: ["like_click"]},
  "ED-25": {required: ["similar_phrase_selected", "preference_intercept_matched", "rewrite_expand_choices_visible"], forbidden: ["paragraph_candidate_applied"]},
  "ED-26": {required: ["approved_line_selected", "like_click", "rewrite_click", "candidates_with_memory_hold"], forbidden: ["ban_click"]},
  "ED-27": {required: ["paragraph_anchor_hold", "paragraph_gap_context_hold", "paragraph_slot_created", "paragraph_request_started", "paragraph_request_mid", "paragraph_request_ready"], forbidden: ["paragraph_request_run", "paragraph_candidate_applied"]},
  "ED-28": {required: ["paragraph_request_run", "paragraph_candidates_hold", "paragraph_candidate_applied"], forbidden: ["paragraph_request_ready"]},
  "ED-29": {required: ["review_click", "review_running", "review_findings_hold", "review_suggestion_hold"], forbidden: []},
  "ED-30": {required: ["draft_ready_hold", "presentation_open", "presentation_adjusted", "presentation_playing"], forbidden: []}
};
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const latest = (directory, suffix) => fs.existsSync(directory) ? fs.readdirSync(directory).sort().reverse().map((name) => path.join(directory, name, suffix)).find(fs.existsSync) : null;
const receiptFiles = [];
const runsRoot = path.join(root, "work/background-cap-production-v1/runs");
for (const run of fs.readdirSync(runsRoot)) for (const shotId of shotIds) {
  const file = path.join(runsRoot, run, `${shotId.toLowerCase()}.cap/a1-background-receipt.json`);
  if (fs.existsSync(file)) receiptFiles.push(file);
}
const failures = [];
const fixtures = [];
for (const shotId of shotIds) {
  const shot = plan.shots.find((item) => item.shotId === shotId);
  const reportPath = latest(path.join(root, `work/headless-${shotId.toLowerCase()}-v1`), "report.json");
  const report = reportPath ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : null;
  const reportRelative = reportPath ? path.relative(root, reportPath) : null;
  const receiptPath = receiptFiles.find((file) => JSON.parse(fs.readFileSync(file, "utf8")).sourceReport === reportRelative);
  const receipt = receiptPath ? JSON.parse(fs.readFileSync(receiptPath, "utf8")) : null;
  const runRoot = receiptPath ? path.dirname(path.dirname(receiptPath)) : null;
  const reviewVideo = runRoot ? path.join(runRoot, `${shotId.toLowerCase()}-background-cap-review-960x540.mp4`) : null;
  const configPath = runRoot ? path.join(runRoot, `${shotId.toLowerCase()}.cap/project-config.json`) : null;
  const shotFailures = [];
  if (!shot || !report || !receipt || !reviewVideo || !fs.existsSync(reviewVideo) || !configPath || !fs.existsSync(configPath)) shotFailures.push("ARTIFACT_CHAIN_MISSING");
  if (!shotFailures.length) {
    const binding = report.storyboardBinding;
    if (binding?.workspaceSha256 !== plan.source.workspaceSha256 || binding?.versionId !== shot.authority.versionId || binding?.revisionSha256 !== shot.authority.revisionSha256 || binding?.cameraRecipeSha256 !== shot.execution.cameraRecipe.recipeSha256) shotFailures.push("STORYBOARD_BINDING_DRIFT");
    if (receipt.storyboardBinding?.actionContractSha256 !== binding.actionContractSha256 || receipt.storyboardBinding?.sourceTextSha256 !== binding.sourceTextSha256) shotFailures.push("CAP_RECEIPT_BINDING_DRIFT");
    if (report.headedWindowCreated !== false || report.frontmostApplicationMutation !== false || report.captureBackend !== "PLAYWRIGHT_HEADLESS_CDP_INPUT") shotFailures.push("BACKGROUND_ISOLATION_FAILED");
    if (Math.abs(report.output.durationMs - shot.authority.timeRange.durationMs) > 40 || report.output.fullDecodePass !== true) shotFailures.push("AUTHORITY_DURATION_OR_DECODE");
    const eventNames = report.events.map((event) => event.name);
    const contract = eventContracts[shotId];
    let priorIndex = -1;
    for (const name of contract.required) { const index = eventNames.indexOf(name); if (index < 0) shotFailures.push(`EVENT_MISSING:${name}`); else if (index <= priorIndex) shotFailures.push(`EVENT_ORDER:${name}`); priorIndex = index; }
    for (const name of contract.forbidden) if (eventNames.includes(name)) shotFailures.push(`FORBIDDEN_EVENT:${name}`);
    if (report.events.some((event) => event.outputTimeMs < 0 || event.outputTimeMs > shot.authority.timeRange.durationMs + 40)) shotFailures.push("EVENT_OUTSIDE_TIME_RANGE");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const zooms = config.timeline?.zoomSegments || [];
    if (zooms.length > 1 || zooms.some((zoom) => zoom.amount > 1.18 || zoom.instantAnimation !== false)) shotFailures.push("CALM_CAMERA_CONTRACT");
    if (Number(receipt.cameraPolicy?.resultHoldSeconds || 0) < .8) shotFailures.push("RESULT_HOLD_TOO_SHORT");
    if (config.cursor?.size > 105 || config.cursor?.motionBlur > .25 || config.screenMovementSpring?.stiffness > 170) shotFailures.push("CALM_CURSOR_OR_SPRING_CONTRACT");
  }
  failures.push(...shotFailures.map((failure) => `${shotId}:${failure}`));
  fixtures.push({id: shotId, status: shotFailures.length ? "FAIL" : "PASS", storyboardBinding: report?.storyboardBinding || null, requiredEvents: eventContracts[shotId].required, events: report?.events || [], reportPath: reportRelative, capReceiptPath: receiptPath ? path.relative(root, receiptPath) : null, reviewVideo: reviewVideo && fs.existsSync(reviewVideo) ? {path: path.relative(root, reviewVideo), sha256: sha256(reviewVideo)} : null, contactSheet: report?.evidence?.contactSheet || null, failures: shotFailures});
}
const outputRoot = path.join(root, `work/background-cap-production-v1/storyboard-wave-${shotIds.length}-v1`);
fs.mkdirSync(outputRoot, {recursive: true});
const report = {contract: "A1BackgroundStoryboardWaveAudit/v1", status: failures.length ? "FAIL" : "PASS", sourceWorkspaceSha256: plan.source.workspaceSha256, shotIds, fixtureCount: fixtures.length, fixtures, productionAdmission: false, userVisualApproval: "NOT_APPROVED", failures, auditedAt: new Date().toISOString()};
const outputPath = path.join(outputRoot, "audit-report.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({...report, outputPath: path.relative(root, outputPath)}, null, 2));
if (failures.length) process.exitCode = 1;
