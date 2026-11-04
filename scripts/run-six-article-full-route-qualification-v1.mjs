#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertProjectWriterLease, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const qualificationRoot = path.join(root, "qualification/six-article-full-route-v1");
const sealedManifestPath = path.join(qualificationRoot, "sealed-manifest.json");
const runtimeFreezePath = path.join(qualificationRoot, "runtime-freeze.json");
const runStatePath = path.join(qualificationRoot, "run-state.json");
const reportPath = path.join(qualificationRoot, "qualification-report.json");
const rootUrl = process.env.A1_SYSTEM_LINE_URL || "http://127.0.0.1:4311";
const command = process.argv[2] || "status";
const apply = process.argv.includes("--apply");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const atomicWrite = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};
const TERMINAL_STATUSES = new Set([
  "PROJECT_540P_READY_FOR_FINAL_DECISION",
  "PROJECT_FINAL_1080_AND_DAVINCI_COMPLETE",
]);
const isBlocked = (status) => String(status || "").startsWith("BLOCKED_") || String(status || "").includes("VISUAL_REVISE_REQUIRED");
const existsAndMatches = (file, expected) => Boolean(file && expected && fs.existsSync(file) && fileSha256(file) === expected);

function verifyFreeze(freeze, sealed) {
  const failures = [];
  if (freeze.contract !== "A1SixArticleFullRouteRuntimeFreeze/v1" || freeze.status !== "FROZEN") failures.push("RUNTIME_FREEZE_INVALID");
  if (fileSha256(sealedManifestPath) !== freeze.sealedManifestSha256) failures.push("SEALED_MANIFEST_CHANGED_AFTER_FREEZE");
  for (const item of freeze.files || []) {
    const file = path.join(root, item.path);
    if (!existsAndMatches(file, item.sha256)) failures.push(`${item.path}:RUNTIME_SHA_DRIFT`);
  }
  const runtimeSha256 = sha256(JSON.stringify((freeze.files || []).map((item) => ({path: item.path, sha256: fs.existsSync(path.join(root, item.path)) ? fileSha256(path.join(root, item.path)) : null}))));
  if (runtimeSha256 !== freeze.runtimeSha256) failures.push("RUNTIME_SET_SHA_DRIFT");
  if (sealed.contract !== "A1SixArticleFullRouteSealedManifest/v1" || sealed.status !== "SEALED" || sealed.articles?.length !== 6) failures.push("SEALED_ARTICLE_SET_INVALID");
  return {status: failures.length ? "FAIL" : "PASS", failures, runtimeSha256};
}

function currentGate(workspace) {
  const runtime = workspace.production?.shotIntelligence;
  const board = runtime?.wholeFilmStaticBoard;
  const decision = runtime?.wholeFilmStaticBoardDecision;
  const approved = board?.status === "APPROVED"
    && decision?.decision === "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY"
    && decision?.approvalAuthority?.contract === "A1WholeFilmStaticBoardApprovalAuthority/v1";
  return {
    status: approved ? "PASS" : "CURRENT_FILM_STATIC_BOARD_USER_APPROVAL_REQUIRED",
    approved,
    boardSha256: board?.sha256 || null,
    boardStatus: board?.status || null,
    decisionSha256: decision?.decisionSha256 || null,
  };
}

function initialRunState(sealed, freeze) {
  return {
    contract: "A1SixArticleFullRouteQualificationRun/v1",
    status: "READY_AFTER_CURRENT_FILM_STATIC_APPROVAL",
    sealedManifestSha256: fileSha256(sealedManifestPath),
    runtimeFreezeSha256: fileSha256(runtimeFreezePath),
    runtimeSha256: freeze.runtimeSha256,
    concurrencyCap: 2,
    articles: sealed.articles.map((article) => ({id: article.id, genre: article.genre, title: article.title, articleSha256: article.article.sha256, timelineSha256: article.timeline.sha256, projectId: null, dispatchedAt: null})),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function projectEvidence(record, workspace) {
  const intake = record.projectId ? workspace.production.projectIntakes?.find((item) => item.projectId === record.projectId) : null;
  const projectDir = record.projectId ? path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/projects", record.projectId) : null;
  const readProject = (name) => projectDir && fs.existsSync(path.join(projectDir, name)) ? readJson(path.join(projectDir, name)) : null;
  const accepted = readProject("accepted-shot-ir-v2.json");
  const motion = readProject("motion-ir-v2.json");
  const review = readProject("review-540p-artifact.json");
  const proof = readProject("visual-proof-audit.json");
  const directReview = readProject("qualification-direct-visual-review.json");
  const mediaFile = review?.publicUrl ? path.join(appRoot, "public", review.publicUrl.replace(/^\//u, "")) : null;
  const mediaBound = Boolean(review?.sha256 && existsAndMatches(mediaFile, review.sha256));
  const routeComplete = Boolean(accepted?.contract === "A1AcceptedShotIRSet/v2"
    && motion?.contract === "A1ProjectMotionIRSet/v2"
    && motion.acceptedShotIrSha256 === accepted.sha256
    && motion.sceneCount === accepted.shotCount
    && review?.contract === "A1Project540pReviewArtifact/v1"
    && review.width === 960
    && review.height === 540
    && mediaBound
    && proof?.status === "PASS_FOR_FINAL_DECISION_REVIEW");
  const directVisualPass = directReview?.contract === "A1SixArticleDirectVisualReview/v1"
    && directReview.status === "PASS"
    && directReview.actualPixelsViewed === true
    && directReview.mediaSha256 === review?.sha256;
  const dispatchedAtMs = Date.parse(record.dispatchedAt || "");
  const completedAtMs = Date.parse(review?.renderedAt || intake?.updatedAt || "");
  const elapsedMs = Number.isFinite(dispatchedAtMs) && Number.isFinite(completedAtMs) ? Math.max(0, completedAtMs - dispatchedAtMs) : null;
  return {
    id: record.id,
    genre: record.genre,
    projectId: record.projectId,
    intakeStatus: intake?.status || (record.projectId ? "PROJECT_NOT_VISIBLE" : "NOT_DISPATCHED"),
    terminal: TERMINAL_STATUSES.has(intake?.status),
    blocked: isBlocked(intake?.status),
    routeComplete,
    directVisualPass,
    elapsedMs,
    shotCount: accepted?.shotCount || null,
    media: review ? {publicUrl: review.publicUrl, sha256: review.sha256, durationMs: review.durationMs, bytes: review.bytes, hashMatches: mediaBound} : null,
    visualQuality: proof?.visualQualityReview || null,
    evidence: {
      directorPlan: Boolean(readProject("director-plan.json")),
      visualBible: Boolean(readProject("project-visual-bible-pack.json")),
      assetWorkspace: Boolean(readProject("project-asset-workspace.json")),
      sceneGraph: Boolean(readProject("project-scene-graph-workspace.json")),
      acceptedShotIr: Boolean(accepted),
      motionIr: Boolean(motion),
      review540p: Boolean(review),
      directVisualReview: Boolean(directReview),
    },
  };
}

function buildStatus({workspace, sealed, freeze, runState, startedAt}) {
  const gate = currentGate(workspace);
  const freezeVerification = verifyFreeze(freeze, sealed);
  const articles = runState.articles.map((record) => projectEvidence(record, workspace));
  const counts = {
    total: articles.length,
    notDispatched: articles.filter((item) => !item.projectId).length,
    active: articles.filter((item) => item.projectId && !item.terminal && !item.blocked).length,
    blocked: articles.filter((item) => item.blocked).length,
    routeComplete: articles.filter((item) => item.routeComplete).length,
    directVisualPass: articles.filter((item) => item.directVisualPass).length,
    qualified: articles.filter((item) => item.routeComplete && item.directVisualPass).length,
  };
  const elapsedValues = articles.map((item) => item.elapsedMs).filter(Number.isFinite).sort((a, b) => a - b);
  const p95Ms = elapsedValues.length ? elapsedValues[Math.min(elapsedValues.length - 1, Math.ceil(elapsedValues.length * .95) - 1)] : null;
  const report = {
    contract: "A1SixArticleFullRouteQualificationStatus/v1",
    status: counts.qualified === 6 && freezeVerification.status === "PASS" ? "PASS" : gate.approved ? "IN_PROGRESS" : "WAITING_FOR_CURRENT_FILM_STATIC_APPROVAL",
    route: "A1VisualDirectorProject/v1",
    gate,
    freeze: {status: freezeVerification.status, runtimeSha256: freeze.runtimeSha256, failures: freezeVerification.failures},
    counts,
    genrePairs: Object.fromEntries(["evidence-explainer", "product-tutorial", "personal-opinion"].map((genre) => [genre, articles.filter((item) => item.genre === genre && item.routeComplete && item.directVisualPass).length])),
    articles,
    performance: {
      statusReadMs: Number((performance.now() - startedAt).toFixed(2)),
      completedArticleP95Ms: p95Ms,
      thresholds: {statusReadMaxMs: 1000, concurrencyCap: 2, perArticleFirstPassMaxMs: 30 * 60 * 1000},
      statusReadPass: performance.now() - startedAt <= 1000,
      concurrencyPass: counts.active <= 2,
      firstPassLatencyPass: elapsedValues.length === 0 || elapsedValues.every((value) => value <= 30 * 60 * 1000),
    },
    nextAction: !gate.approved ? "approve-current-34-shot-static-board" : counts.active >= 2 ? "observe-current-two-projects" : counts.notDispatched ? "dispatch-next-bounded-pair" : counts.blocked ? "repair-blocked-projects-without-changing-frozen-runtime" : counts.directVisualPass < 6 ? "record-direct-visual-reviews" : "qualification-complete",
    checkedAt: new Date().toISOString(),
  };
  return report;
}

if (!fs.existsSync(sealedManifestPath) || !fs.existsSync(runtimeFreezePath)) throw new Error("six-article-sealed-inputs-and-runtime-freeze-required");
const startedAt = performance.now();
const sealed = readJson(sealedManifestPath);
const freeze = readJson(runtimeFreezePath);
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
let runState = fs.existsSync(runStatePath) ? readJson(runStatePath) : initialRunState(sealed, freeze);
if (runState.runtimeSha256 !== freeze.runtimeSha256 || runState.sealedManifestSha256 !== fileSha256(sealedManifestPath)) throw new Error("six-article-run-state-freeze-mismatch");

if (command === "status") {
  console.log(JSON.stringify(buildStatus({workspace, sealed, freeze, runState, startedAt}), null, 2));
  process.exit();
}

if (command === "dispatch") {
  if (!apply) throw new Error("six-article-dispatch-requires---apply");
  assertProjectWriterLease(appRoot);
  const freezeVerification = verifyFreeze(freeze, sealed);
  if (freezeVerification.status !== "PASS") throw new Error(`six-article-runtime-freeze-invalid:${freezeVerification.failures.join(",")}`);
  const gate = currentGate(workspace);
  if (!gate.approved) throw new Error("six-article-dispatch-current-film-static-approval-required");
  let currentWorkspaceSha256 = workspace.workspaceSha256;
  const before = buildStatus({workspace, sealed, freeze, runState, startedAt});
  const slots = Math.max(0, 2 - before.counts.active);
  const candidates = runState.articles.filter((item) => !item.projectId).slice(0, slots);
  const dispatched = [];
  for (const record of candidates) {
    const sealedArticle = sealed.articles.find((item) => item.id === record.id);
    const articleText = fs.readFileSync(path.join(root, sealedArticle.article.path), "utf8");
    const timelineBytes = fs.readFileSync(path.join(root, sealedArticle.timeline.path));
    const form = new FormData();
    form.set("workspaceSha256", currentWorkspaceSha256);
    form.set("title", sealedArticle.title);
    form.set("articleText", articleText);
    form.set("srtFile", new Blob([timelineBytes], {type: "application/x-subrip"}), `${record.id}.srt`);
    const response = await fetch(`${rootUrl}/api/system-line/editorial-asset-workbench/import-project`, {method: "POST", body: form});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true || !payload.intake?.projectId || !payload.workspace?.workspaceSha256) throw new Error(`six-article-project-dispatch-failed:${record.id}:${response.status}:${payload.error || "unknown"}`);
    record.projectId = payload.intake.projectId;
    record.dispatchedAt = new Date().toISOString();
    currentWorkspaceSha256 = payload.workspace.workspaceSha256;
    dispatched.push({id: record.id, projectId: record.projectId, autopilotPid: payload.autopilotPid || null});
    runState.updatedAt = new Date().toISOString();
    atomicWrite(runStatePath, runState);
  }
  console.log(JSON.stringify({status: "PASS", dispatched, activeBefore: before.counts.active, concurrencyCap: 2, nextAction: dispatched.length ? "observe-current-two-projects" : "no-dispatch-slot-or-all-dispatched"}, null, 2));
  process.exit();
}

if (command === "audit") {
  const report = buildStatus({workspace, sealed, freeze, runState, startedAt});
  const failures = [];
  if (report.freeze.status !== "PASS") failures.push(...report.freeze.failures);
  if (report.counts.qualified !== 6) failures.push(`QUALIFIED_ARTICLE_COUNT:${report.counts.qualified}/6`);
  for (const [genre, count] of Object.entries(report.genrePairs)) if (count !== 2) failures.push(`${genre}:QUALIFIED_PAIR:${count}/2`);
  if (!report.performance.statusReadPass) failures.push("STATUS_READ_SLO");
  if (!report.performance.concurrencyPass) failures.push("CONCURRENCY_CAP");
  if (!report.performance.firstPassLatencyPass) failures.push("FIRST_PASS_LATENCY_SLO");
  const audit = {...report, contract: "A1SixArticleFullRouteQualificationAudit/v1", status: failures.length ? "FAIL" : "PASS", failures};
  if (process.argv.includes("--write")) atomicWrite(reportPath, audit);
  console.log(JSON.stringify(audit, null, 2));
  if (failures.length) process.exitCode = 1;
  process.exit();
}

throw new Error(`six-article-qualification-command-invalid:${command}`);
