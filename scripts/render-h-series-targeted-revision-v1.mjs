#!/usr/bin/env node
/**
 * Render only the shots explicitly marked for revision in the H-series review
 * queue. This is a review-only bridge: it never mutates the candidate props,
 * the authority props, the authority MP4, or the review decision ledger.
 *
 * A revised props file is intentionally required. A queue by itself is not a
 * visual change, so this command must fail closed instead of re-rendering the
 * same candidate and pretending that a repair happened.
 */
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-preproduction-motion-candidate-v1";
const defaultQueuePath = path.join(root, "apps/studio-next/public/generated/system-line", phaseId, "revision-queue.json");
const defaultCandidateReportPath = path.join(root, "apps/studio-next/public/generated/system-line", phaseId, "report.json");
const defaultCandidatePropsPath = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId, "candidate-props.json");

const args = process.argv.slice(2);
function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fail(reason, detail = null) {
  console.error(JSON.stringify({status: "BLOCKED", reason, detail}, null, 2));
  process.exitCode = 2;
}

const queuePath = path.resolve(root, argValue("--revision-queue", defaultQueuePath));
const candidateReportPath = path.resolve(root, argValue("--candidate-report", defaultCandidateReportPath));
const candidatePropsPath = path.resolve(root, argValue("--candidate-props", defaultCandidatePropsPath));
const revisedPropsArg = argValue("--revised-props");
const force = args.includes("--force");

if (!revisedPropsArg) {
  fail("revised-props-required", "需要提供 --revised-props；返修队列本身不会改变画面。");
} else if (!fs.existsSync(queuePath)) {
  fail("no-open-revision-queue", `未找到返修队列：${rel(queuePath)}。先完成逐镜视觉决定。`);
} else if (!fs.existsSync(candidateReportPath) || !fs.existsSync(candidatePropsPath)) {
  fail("candidate-binding-missing", {candidateReport: rel(candidateReportPath), candidateProps: rel(candidatePropsPath)});
} else {
  const revisedPropsPath = path.resolve(root, revisedPropsArg);
  if (!fs.existsSync(revisedPropsPath)) {
    fail("revised-props-not-found", rel(revisedPropsPath));
  } else {
    const queue = readJson(queuePath);
    const report = readJson(candidateReportPath);
    const candidateProps = readJson(candidatePropsPath);
    const revisedProps = readJson(revisedPropsPath);
    const queueSha256 = sha256File(queuePath);
    const candidatePropsSha256 = sha256File(candidatePropsPath);
    const revisedPropsSha256 = sha256File(revisedPropsPath);
    const candidateReportSha256 = sha256File(candidateReportPath);
    const items = Array.isArray(queue.items) ? queue.items : [];
    const beatIds = Array.from(new Set(items.map((item) => item?.beatId).filter(Boolean)));
    const candidateScenes = Array.isArray(candidateProps.scenes) ? candidateProps.scenes : [];
    const revisedScenes = Array.isArray(revisedProps.scenes) ? revisedProps.scenes : [];
    const candidateById = new Map(candidateScenes.map((scene) => [scene.beatId, scene]));
    const revisedById = new Map(revisedScenes.map((scene) => [scene.beatId, scene]));
    const changedTargetBeatIds = beatIds.filter((beatId) => sha256Json(candidateById.get(beatId)) !== sha256Json(revisedById.get(beatId)));
    const changedOutsideQueue = candidateScenes
      .filter((scene) => !beatIds.includes(scene.beatId))
      .filter((scene) => sha256Json(scene) !== sha256Json(revisedById.get(scene.beatId)))
      .map((scene) => scene.beatId);
    const candidateIds = candidateScenes.map((scene) => scene.beatId);
    const revisedIds = revisedScenes.map((scene) => scene.beatId);
    const queueValid = queue.contract === "A1HSeriesReviewRevisionQueue/v1"
      && queue.status === "OPEN"
      && queue.reviewOnly === true
      && queue.rendererAdoptionAllowed === false
      && queue.fullRenderAllowed === false
      && queue.finalRenderAllowed === false
      && queue.resolveExportAllowed === false
      && items.length > 0
      && items.every((item) => item?.status === "OPEN" && item?.nextAction === "targeted-shot-repair-and-rerender" && typeof item?.note === "string");
    const reportLocked = report.contract === "A1HSeriesPreproductionMotionPreview/v1"
      && report.status === "PASS"
      && report.reviewOnly === true
      && report.proofOnly === true
      && report.currentAuthorityMutated === false
      && report.rendererAdoptionAllowed === false
      && report.fullMp4RenderAllowed === false
      && report.finalRenderAllowed === false
      && report.resolveExportAllowed === false;

    if (!queueValid) {
      fail("revision-queue-not-open-and-review-only", {queue: rel(queuePath), status: queue.status, itemCount: items.length});
    } else if (queue.candidatePropsSha256 !== candidatePropsSha256 || queue.candidateReportSha256 !== candidateReportSha256) {
      fail("stale-revision-queue", {queueCandidatePropsSha256: queue.candidatePropsSha256, currentCandidatePropsSha256: candidatePropsSha256, queueCandidateReportSha256: queue.candidateReportSha256, currentCandidateReportSha256: candidateReportSha256});
    } else if (!reportLocked) {
      fail("candidate-report-not-review-only", rel(candidateReportPath));
    } else if (!beatIds.length || beatIds.some((beatId) => !candidateById.has(beatId))) {
      fail("queue-beat-not-in-candidate", {beatIds, candidateSceneCount: candidateScenes.length});
    } else if (candidateIds.length !== revisedIds.length || candidateIds.some((beatId, index) => revisedIds[index] !== beatId)) {
      fail("revised-props-scene-order-changed", {candidateSceneCount: candidateIds.length, revisedSceneCount: revisedIds.length});
    } else if (revisedPropsSha256 === candidatePropsSha256) {
      fail("revised-props-unchanged", "返修输入必须产生新的 props hash；否则只是重复渲染旧候选。");
    } else if (changedOutsideQueue.length) {
      fail("non-target-scenes-changed", changedOutsideQueue);
    } else if (!changedTargetBeatIds.length) {
      fail("no-queued-shot-changed", {queuedBeatIds: beatIds});
    } else {
      const renderKey = `${queueSha256.slice(0, 12)}-${revisedPropsSha256.slice(0, 12)}`;
      const outputDir = path.resolve(root, argValue("--out-dir", `apps/studio-next/public/generated/system-line/${phaseId}/targeted-revisions/${renderKey}/stills`));
      const reportPath = path.resolve(root, argValue("--report-path", `.codex-artifacts/system-progress-system-line/${phaseId}/targeted-revisions/${renderKey}/render-report.json`));
      const publicReportPath = path.resolve(root, argValue("--public-report-path", `apps/studio-next/public/generated/system-line/${phaseId}/targeted-revisions/${renderKey}/render-report.json`));
      const commandArgs = [
        "scripts/render-storyboard-current-stills-v1.mjs",
        "--props", rel(revisedPropsPath),
        "--out-dir", rel(outputDir),
        "--report-path", rel(reportPath),
        "--public-report-path", rel(publicReportPath),
        "--composition", "A1SystemLineHAllScenesFrameReview",
        "--frame-mode", "sequence",
        "--frame-offset", "54",
        "--only", beatIds.join(","),
      ];
      if (force) commandArgs.push("--force");
      const result = spawnSync(process.execPath, commandArgs, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]});
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      const renderReport = fs.existsSync(reportPath) ? readJson(reportPath) : null;
      const status = result.status === 0 && renderReport?.status === "PASS" && renderReport.selection?.mode === "only" && renderReport.selection?.selectedCount === beatIds.length && renderReport.output?.fullSceneCount === revisedScenes.length && renderReport.output?.missingCount === 0 ? "PASS" : "BLOCKED";
      const targetedReport = {
        contract: "A1HSeriesTargetedRevisionRender/v1",
        status,
        generatedAt: new Date().toISOString(),
        phaseId,
        reviewOnly: true,
        fullMp4Rendered: false,
        currentAuthorityMutated: false,
        rendererAdoptionAllowed: false,
        finalRenderAllowed: false,
        resolveExportAllowed: false,
        queue: {path: rel(queuePath), sha256: queueSha256, candidatePropsSha256: queue.candidatePropsSha256, candidateReportSha256: queue.candidateReportSha256, beatIds},
        input: {candidatePropsPath: rel(candidatePropsPath), candidatePropsSha256, revisedPropsPath: rel(revisedPropsPath), revisedPropsSha256, changedTargetBeatIds, changedOutsideQueue},
        output: {dir: rel(outputDir), renderReportPath: rel(reportPath), publicRenderReportPath: rel(publicReportPath), selectedCount: renderReport?.selection?.selectedCount ?? 0, renderedCount: renderReport?.output?.renderedCount ?? 0, reusedCount: renderReport?.output?.reusedCount ?? 0, missingCount: renderReport?.output?.missingCount ?? 0},
        command: [process.execPath, ...commandArgs].join(" "),
        childExitCode: result.status,
        childStdoutTail: (result.stdout || "").slice(-3000),
        childStderrTail: (result.stderr || "").slice(-3000),
        nextAction: status === "PASS" ? "review-targeted-revision-stills-before-reopening-shot-decisions" : "repair-targeted-revision-render",
      };
      writeJson(reportPath.replace(/render-report\.json$/u, "targeted-revision.json"), targetedReport);
      writeJson(publicReportPath.replace(/render-report\.json$/u, "targeted-revision.json"), targetedReport);
      console.log(JSON.stringify({status, queueBeatIds: beatIds, changedTargetBeatIds, outputDir: rel(outputDir), reportPath: rel(reportPath)}, null, 2));
      if (status !== "PASS") process.exitCode = 2;
    }
  }
}
