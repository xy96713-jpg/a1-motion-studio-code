#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {SCREEN_PACKAGING_EFFECTS} from "../apps/studio-next/src/lib/a1-screen-packaging-effect-ontology-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/screen-recording-maturity-test-v1");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const exists = (file) => fs.existsSync(path.join(root, file));
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const write = (file, value) => fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
const fail = [];

const taskSpecs = [
  {id: "englishflow-fresh-director-maturity-v1", kind: "document-editor", report: "work/screen-recording-maturity-test-v1/englishflow-fresh-director-maturity-v1/capture-report.json", receipt: "work/screen-recording-maturity-test-v1/englishflow-fresh-director-maturity-v1/cap-receipt.json", review: "work/screen-recording-maturity-test-v1/englishflow-fresh-director-maturity-v1/review.mp4"},
  {id: "lab-vault-fresh-navigation-maturity-v1", kind: "multi-step-project", report: "work/screen-recording-maturity-test-v1/lab-vault-fresh-navigation-maturity-v1/capture-report.json", receipt: "work/screen-recording-maturity-test-v1/lab-vault-fresh-navigation-maturity-v1/cap-receipt.json", review: "work/screen-recording-maturity-test-v1/lab-vault-fresh-navigation-maturity-v1/review.mp4"},
  {id: "lab-vault-fresh-menu-maturity-v1", kind: "menu-workflow", report: "work/screen-recording-maturity-test-v1/lab-vault-fresh-menu-maturity-v1/capture-report.json", receipt: "work/screen-recording-maturity-test-v1/lab-vault-fresh-menu-maturity-v1/cap-receipt.json", review: "work/screen-recording-maturity-test-v1/lab-vault-fresh-menu-maturity-v1/review.mp4"},
  {id: "noaa-live-article-fresh-cap-shim-v1", kind: "web-article", report: "work/screen-recording-maturity-test-v1/noaa-article/capture-report.json", receipt: "work/screen-recording-maturity-test-v1/noaa-article/cap-receipt.json", review: "work/screen-recording-maturity-test-v1/noaa-article/review.mp4", liveReport: "work/screen-recording-maturity-test-v1/noaa-article/live-capture/live-capture-report.json"},
];
const tasks = taskSpecs.map((spec) => ({...spec, reportPath: spec.report, receiptPath: spec.receipt, capture: read(spec.report), receipt: read(spec.receipt)}));
const writingPack = read("work/screen-recording-maturity-test-v1/writing-workbench/pack-report.json");
for (const task of tasks) {
  const capture = task.capture;
  const receipt = task.receipt;
  const actualConfig = read(`${receipt.capProject.path}/project-config.json`);
  if ((actualConfig.timeline?.zoomSegments || []).some((segment) => !segment.mode?.manual)) fail.push(`${task.id}:SOURCE_TARGET_NOT_PRESERVED_IN_CAP`);
  if (!capture.captureSync?.method || capture.captureSync?.syncPass !== true) fail.push(`${task.id}:VIDEO_EVENT_SYNC_UNVERIFIED`);
  if (!receipt.configurationReadback) fail.push(`${task.id}:CONFIGURATION_READBACK_MISSING`);
  if (capture.contract !== "A1GenericBrowserScreenProof/v1" || capture.status !== "READY_FOR_CAP_REVIEW") fail.push(`${task.id}:CAPTURE_NOT_READY`);
  if (capture.geometryTruth?.status !== "PASS_REVIEW_ONLY" || capture.geometryTruth?.failures?.length) fail.push(`${task.id}:GEOMETRY_TRUTH`);
  if (capture.output?.fullDecodePass !== true || capture.project?.unchanged !== true || capture.boundary?.targetProjectMutation !== false) fail.push(`${task.id}:CAPTURE_BOUNDARY_OR_DECODE`);
  if ((capture.events?.length || 0) < 5 || (capture.domTargets?.length || 0) < 2) fail.push(`${task.id}:EVENT_TARGET_COVERAGE`);
  if (receipt.contract !== "A1GenericCapReviewReceipt/v1" || receipt.status !== "PASS") fail.push(`${task.id}:CAP_RECEIPT`);
  if ((receipt.camera?.semanticZoomCount || 0) < 1 || receipt.feedback?.cameraPolicy !== "DIRECTOR_CAMERA_BEATS") fail.push(`${task.id}:DIRECTOR_BEATS_NOT_EXECUTED`);
  if (receipt.reviewVideo?.fullDecodePass !== true || receipt.boundary?.productionAdmission !== false) fail.push(`${task.id}:REVIEW_VIDEO_OR_BOUNDARY`);
  if (!exists(task.review) || sha(task.review) !== receipt.reviewVideo.sha256) fail.push(`${task.id}:REVIEW_SHA`);
}
const live = read("work/screen-recording-maturity-test-v1/noaa-article/live-capture/live-capture-report.json");
if (live.status !== "READY_FOR_CAP_REVIEW" || live.source?.mode !== "LIVE_BROWSER_PAGE" || live.geometryTruth?.status !== "PASS_REVIEW_ONLY" || live.targetFailures?.length || live.output?.fullDecodePass !== true || live.output?.durationMs !== 60000) fail.push("noaa-live-capture:LIVE_CAPTURE_CONTRACT");
const sourceShas = new Set(tasks.map((task) => task.capture.output?.sha256));
if (sourceShas.size !== tasks.length) fail.push("FRESH_SOURCE_SHAS_NOT_DISTINCT");
const currentAuthority = read(".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json");
const currentPhase = read(".codex-artifacts/system-progress-system-line/current-phase.json");
if (currentAuthority.status !== "PASS" || currentAuthority.productionAdmission === true || currentPhase.status === "PRODUCTION") fail.push("CURRENT_AUTHORITY_BOUNDARY");

const referenceAudits = {
  realWave: read("work/orchestrated-screen-wave15-v1/audit-report.json"),
  effectCanary: read("work/orchestrated-screen-effects-canary-v1/audit-report.json"),
  richDirector: read("work/rich-screen-packaging-director-v1/real-screen-wave-audit-report.json"),
};
if (referenceAudits.realWave.status !== "PASS" || referenceAudits.effectCanary.status !== "PASS" || referenceAudits.richDirector.status !== "PASS") fail.push("REFERENCE_ACTUAL_PIXEL_AUDITS");
if (writingPack.status !== "PASS" || writingPack.fixtures?.length !== 3 || writingPack.checks?.realWorkbenchUsed !== true || writingPack.checks?.fakeUiUsed !== false || writingPack.checks?.temporaryDocumentsDeleted !== true || writingPack.checks?.cleanSourcesPreserved !== true) fail.push("DOCUMENT_EDITOR_FRESH_FIXTURES");

// Admission requires effect-specific encoded-pixel review; registration is not proof.
const freshReal = new Set();
const referenceReal = new Set();
fail.push("FRESH_EFFECT_PIXEL_REVIEW_INCOMPLETE", "DRAG_EDIT_COMPARISON_TESTS_NOT_RUN", "FAULT_INJECTION_NOT_RUN", "FROZEN_EXECUTOR_HOLDOUT_NOT_RUN");
const evidenceReasons = {
  ESTABLISH_WIDE: "fresh generic captures preserve a stable source establishing state",
  SEMANTIC_PUSH: "fresh EnglishFlow and Lab Vault director beats execute source-bound camera segments",
  SCROLL_ANCHOR_FOLLOW: "fresh NOAA live browser capture records scroll targets and holds, then CAP shim executes camera beats",
  RESULT_HOLD: "fresh tasks record result_hold and exported videos decode with readable hold windows",
  STATE_REPLACE_CUT: "fresh tasks include source state replacement and result transition events",
  LINE_READING_TRACK: "existing actual-pixel canary proves source-bound line reading on real screen material",
  FOCUS_DIM: "existing actual-pixel canary proves source-bound focus window",
  DETAIL_LENS: "existing real-source effect wave proves detail treatment with context",
  EVIDENCE_UNDERLINE: "existing actual-pixel canary proves source-bound underline",
  CONTEXT_REFIT: "existing real-source screen wave proves cause/result context refit",
  CLICK_RIPPLE: "fresh generic captures preserve click telemetry and CAP click feedback",
  CURSOR_PUNCH: "fresh generic captures synchronize cursor tip and click event",
  CURSOR_PATH_EASE: "fresh generic captures retain cursor telemetry as a separate track",
  MENU_OPEN_FOLLOW: "fresh Lab Vault menu capture records open/close state and director camera beats",
};
const blockedReasons = {
  BEFORE_AFTER_SPLIT: "fresh batch has no independently verified before/after state",
  WIPE_COMPARE: "fresh batch has no shared-geometry before/after pair",
};
const matrixItems = SCREEN_PACKAGING_EFFECTS.map((effect) => {
  if (freshReal.has(effect.id)) return {id: effect.id, family: effect.family, status: "PASS_REAL", evidence: "FRESH_MATURITY_BATCH", reason: evidenceReasons[effect.id]};
  if (referenceReal.has(effect.id)) return {id: effect.id, family: effect.family, status: "PASS_REVIEW_ONLY", evidence: "REFERENCE_ACTUAL_PIXEL_CANARY", reason: evidenceReasons[effect.id]};
  return {id: effect.id, family: effect.family, status: "BLOCKED_REQUIRED_EVIDENCE", evidence: "NO_FRESH_EVIDENCE_IN_THIS_BATCH", reason: blockedReasons[effect.id] || "no fresh recording in this batch carries the required source evidence"};
});
const matrix = {contract: "A1ScreenRecordingMaturityEffectMatrix/v1", status: fail.length ? "REVIEW_WITH_FAILURES" : "REVIEW_ONLY", items: matrixItems, freshTaskIds: tasks.map((task) => task.id), referenceAudits: Object.fromEntries(Object.entries(referenceAudits).map(([key, value]) => [key, {status: value.status, auditSha256: value.auditSha256 || null}]))};
write("work/screen-recording-maturity-test-v1/fresh-batch-effect-matrix.json", matrix);

const chain = {
  contract: "A1ScreenRecordingMaturityChainReport/v1",
  status: fail.length ? "FAIL" : "PASS_REVIEW_ONLY",
  tasks: tasks.map((task) => ({id: task.id, kind: task.kind, capture: {path: task.reportPath, sha256: sha(task.reportPath), status: task.capture.status, eventCount: task.capture.events?.length || 0, targetCount: task.capture.domTargets?.length || 0, geometryTruth: task.capture.geometryTruth?.status, sourceVideo: task.capture.output}, cap: {receipt: task.receiptPath, sha256: sha(task.receiptPath), reviewVideo: task.receipt.reviewVideo, semanticCameraBeats: task.receipt.camera?.semanticZoomCount || 0, cameraPolicy: task.receipt.feedback?.cameraPolicy || null}, fresh: true, failures: []})), documentEditorFixtures: {path: "work/screen-recording-maturity-test-v1/writing-workbench/pack-report.json", sha256: sha("work/screen-recording-maturity-test-v1/writing-workbench/pack-report.json"), status: writingPack.status, fixtureCount: writingPack.fixtures?.length || 0, genres: writingPack.fixtures?.map((item) => item.genre) || [], realWorkbenchUsed: writingPack.checks?.realWorkbenchUsed === true, fakeUiUsed: writingPack.checks?.fakeUiUsed === false, temporaryDocumentsDeleted: writingPack.checks?.temporaryDocumentsDeleted === true, cleanSourcesPreserved: writingPack.checks?.cleanSourcesPreserved === true}, liveArticle: {report: taskSpecs.find((spec) => spec.id === "noaa-live-article-fresh-cap-shim-v1").liveReport, sha256: sha(taskSpecs.find((spec) => spec.id === "noaa-live-article-fresh-cap-shim-v1").liveReport), status: live.status, durationMs: live.output.durationMs, eventCount: live.events?.length || 0, targetCount: live.domTargets?.length || 0, targetFailures: live.targetFailures || [], geometryTruth: live.geometryTruth?.status, fullDecodePass: live.output?.fullDecodePass === true}, effectMatrix: {path: "work/screen-recording-maturity-test-v1/fresh-batch-effect-matrix.json", sha256: sha("work/screen-recording-maturity-test-v1/fresh-batch-effect-matrix.json"), passReal: matrixItems.filter((item) => item.status === "PASS_REAL").map((item) => item.id), passReviewOnly: matrixItems.filter((item) => item.status === "PASS_REVIEW_ONLY").map((item) => item.id), blockedRequiredEvidence: matrixItems.filter((item) => item.status === "BLOCKED_REQUIRED_EVIDENCE").map((item) => item.id)}, boundary: {reviewOnly: true, currentAuthorityUnchanged: true, productionAdmission: false}, failures: fail, generatedAt: new Date().toISOString()};
chain.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(chain)).digest("hex");
write("work/screen-recording-maturity-test-v1/recording-chain-report.json", chain);
const audit = {contract: "A1ScreenRecordingMaturityAudit/v1", status: fail.length ? "FAIL" : "PASS_REVIEW_ONLY", freshTaskCount: tasks.length + 1, freshTaskKinds: [...tasks.map((task) => task.kind), "document-editor-fixtures"], chainReport: {path: "work/screen-recording-maturity-test-v1/recording-chain-report.json", sha256: sha("work/screen-recording-maturity-test-v1/recording-chain-report.json")}, effectMatrix: {path: "work/screen-recording-maturity-test-v1/fresh-batch-effect-matrix.json", sha256: sha("work/screen-recording-maturity-test-v1/fresh-batch-effect-matrix.json"), total: matrixItems.length, passReal: matrixItems.filter((item) => item.status === "PASS_REAL").length, passReviewOnly: matrixItems.filter((item) => item.status === "PASS_REVIEW_ONLY").length, blockedRequiredEvidence: matrixItems.filter((item) => item.status === "BLOCKED_REQUIRED_EVIDENCE").length}, checks: {threeFreshRecordings: tasks.length >= 3, fourFreshGenericRecordings: tasks.length === 4, documentEditorFreshFixtures: writingPack.status === "PASS" && writingPack.fixtures?.length === 3, sameGenericCaptureContract: tasks.every((task) => task.capture.runtimeId === "GENERIC_BROWSER_CAPTURE_V1"), sameCapAdapter: tasks.every((task) => task.receipt.runtimeId === "GENERIC_CAP_ADAPTER_V1"), directorBeatsExecuted: tasks.every((task) => (task.receipt.camera?.semanticZoomCount || 0) >= 1 && task.receipt.feedback?.cameraPolicy === "DIRECTOR_CAMERA_BEATS"), realGeometryAndDecode: tasks.every((task) => task.capture.geometryTruth?.status === "PASS_REVIEW_ONLY" && task.receipt.reviewVideo?.fullDecodePass === true), liveArticleScrollEvidence: live.status === "READY_FOR_CAP_REVIEW" && live.geometryTruth?.status === "PASS_REVIEW_ONLY" && live.targetFailures?.length === 0, targetProjectsUnchanged: tasks.every((task) => task.capture.project?.unchanged === true), currentAuthorityUnchanged: true, noSilentEffectDrop: matrixItems.every((item) => item.status !== "NOT_IMPLEMENTED")}, failures: fail, boundary: {reviewOnly: true, userVisualApproval: "NOT_APPROVED", motionSpecAllowed: false, productionAdmission: false}, generatedAt: new Date().toISOString()};
audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
write("work/screen-recording-maturity-test-v1/audit-report.json", audit);
console.log(JSON.stringify(audit, null, 2));
if (fail.length) process.exitCode = 1;
