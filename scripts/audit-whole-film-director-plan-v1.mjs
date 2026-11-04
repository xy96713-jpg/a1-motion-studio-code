#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "whole-film-director-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const planPath = path.join(artifactRoot, "director-plan.json");
const reportPath = path.join(artifactRoot, "report.json");
const publicPlanPath = path.join(publicRoot, "director-plan.json");
const publicReportPath = path.join(publicRoot, "report.json");
const genericContractPath = path.join(root, "apps/studio-next/src/lib/a1-whole-film-director-v1.ts");
const outputSchemaPath = path.join(root, "apps/studio-next/src/lib/a1-whole-film-director-output.schema.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const failures = [];
const check = (id, pass, detail = null) => {
  if (!pass) failures.push({id, detail});
};

for (const file of [planPath, reportPath, publicPlanPath, publicReportPath, genericContractPath, outputSchemaPath]) {
  check(`exists:${path.relative(root, file)}`, fs.existsSync(file));
}
if (failures.length) {
  console.error(JSON.stringify({contract: "A1WholeFilmDirectorSystemAudit/v1", status: "BLOCKED", failures}, null, 2));
  process.exit(1);
}

const plan = read(planPath);
const report = read(reportPath);
const schema = read(outputSchemaPath);
const genericSource = fs.readFileSync(genericContractPath, "utf8");
const expectedCueIds = Array.from({length: 117}, (_, index) => index + 1);
const assignedCueIds = plan.shots.flatMap((shot) => shot.cueIds);
const totalDuration = plan.shots.reduce((sum, shot) => sum + shot.editWindow.durationMs, 0);
const modeDuration = Object.values(plan.mediumSummary).reduce((sum, item) => sum + item.durationMs, 0);
const presenterSummary = {
  shotCount: plan.mediumSummary["presenter-clean"].shotCount + plan.mediumSummary["presenter-overlay"].shotCount,
  durationMs: plan.mediumSummary["presenter-clean"].durationMs + plan.mediumSummary["presenter-overlay"].durationMs,
};

check("artifact-public-plan-parity", sha256(planPath) === sha256(publicPlanPath));
check("artifact-public-report-parity", sha256(reportPath) === sha256(publicReportPath));
check("contract", plan.contract === "A1WholeFilmDirectorPlan/v1");
check("status", plan.status === "READY_FOR_USER_EDITORIAL_REVIEW");
check("timeline-authority", plan.source.timelineAuthority === "corrected-srt");
check("srt-sha", plan.source.srtSha256 === "997407683bd017f2b6fc35ce4afc2d0f59512d05c0d1dd17e9455cc28eb0facd");
check("cue-count", plan.source.cueCount === 117);
check("duration", plan.source.durationMs === 218400);
check("cue-order-and-exact-coverage", assignedCueIds.length === expectedCueIds.length && assignedCueIds.every((id, index) => id === expectedCueIds[index]));
check("timeline-duration", totalDuration === 218400);
check("medium-duration", modeDuration === 218400);
check("timeline-continuity", plan.shots.every((shot, index) => index === 0 ? shot.editWindow.startMs === 0 : shot.editWindow.startMs === plan.shots[index - 1].editWindow.endMs));
check("last-shot-end", plan.shots.at(-1).editWindow.endMs === 218400);
check("fixture-edit-shot-count", plan.shots.length === 30);
check("fixture-presenter-mix", presenterSummary.shotCount === 11 && Math.abs(presenterSummary.durationMs / 218400 - 0.2834) < 0.001);
check("fixture-screen-mix", plan.mediumSummary["screen-demo"].shotCount === 12 && Math.abs(plan.mediumSummary["screen-demo"].durationRatio - 0.4775) < 0.001);
check("fixture-package-mix", plan.mediumSummary["full-package"].shotCount === 5 && Math.abs(plan.mediumSummary["full-package"].durationRatio - 0.2007) < 0.001);
check("fixture-type-only-mix", plan.mediumSummary["type-only"].shotCount === 2 && Math.abs(plan.mediumSummary["type-only"].durationRatio - 0.0384) < 0.001);
check("opening-source", plan.shots[0].sourceText === "Hi，我用 vibe coding 做了一款智能写作工作台。");
check("opening-medium", plan.shots[0].editMode === "presenter-overlay" && plan.shots[0].presenterPackage?.intensity === "hero");
check("screen-causal-actions", plan.shots.filter((shot) => shot.editMode === "screen-demo").every((shot) => shot.screenActions.length >= 2));
check("presenter-direction", plan.shots.filter((shot) => shot.editMode.startsWith("presenter")).every((shot) => Boolean(shot.presenterDirection)));
check("presenter-package-face-safe", plan.shots.filter((shot) => shot.editMode === "presenter-overlay").every((shot) => shot.presenterPackage?.keyPhrases?.length > 0 && shot.presenterPackage?.faceSafeZone === "LOCK_EYES_AND_MOUTH" && shot.presenterPackage?.spatialAnchor !== "not-applicable"));
check("package-brief", plan.shots.filter((shot) => ["full-package", "type-only"].includes(shot.editMode)).every((shot) => Boolean(shot.packageBrief)));
check("missing-media-blocks", plan.shots.every((shot) => shot.materialGate === "BLOCKED_MEDIA_MISSING"));
check("no-generic-card-fallback", plan.shots.every((shot) => shot.fallbackPolicy === "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD"));
check("wrong-shot-rejected", plan.rejectedCandidates.some((item) => item.id === "shot-01-vibe-coding-workbench-v1" && item.status === "REJECTED"));
check("latest-visual-truth-pending", plan.visualTruth.currentPrototypeStatus === "STRUCTURAL_PASS_VISUAL_PENDING" && plan.visualTruth.humanVisualApproval === "PENDING_INDEPENDENT_MOTION_REVIEW" && /rejected-before-system-fix/u.test(plan.visualTruth.previousRejectedCandidateBackup || ""));
check("all-production-gates-locked", ["firstShotDesignAllowed", "shotRenderAllowed", "rendererAdoptionAllowed", "h47ExpansionAllowed", "fullMp4RenderAllowed", "finalRenderAllowed", "resolveExportAllowed"].every((key) => plan.gates[key] === false));
check("authorship-truth", plan.authorship.aiGenerated === false && plan.authorship.newArticleGeneralizationProven === false);
check("generic-contract-no-fixture-count", !/\.length\s*===\s*30|editShotCount:\s*30|cueCount:\s*117/u.test(genericSource));
check("generic-contract-has-dynamic-intents", /intents:\s*A1WholeFilmShotIntent\[\]/u.test(genericSource));
check("ai-output-schema-contract", schema.properties?.contract?.const === "A1WholeFilmDirectorOutput/v1");
check("ai-output-schema-medium", schema.properties?.shots?.items?.properties?.editMode?.enum?.includes("presenter-clean") && schema.properties?.shots?.items?.properties?.editMode?.enum?.includes("screen-demo"));
check("report-truth-status", report.status === "DIRECTOR_CONTRACT_PASS_VISUAL_PENDING" && report.truthBoundary?.visualPrototypeStatus === "STRUCTURAL_PASS_VISUAL_PENDING");

const audit = {
  contract: "A1WholeFilmDirectorSystemAudit/v1",
  phaseId,
  status: failures.length ? "BLOCKED" : "PASS",
  checks: {
    exactCueCoverage: failures.every((item) => item.id !== "cue-order-and-exact-coverage"),
    continuousEditTimeline: failures.every((item) => !["timeline-duration", "timeline-continuity", "last-shot-end"].includes(item.id)),
    mediumRoutingComplete: failures.every((item) => !item.id.startsWith("fixture-") && item.id !== "medium-duration"),
    missingMediaFailsClosed: failures.every((item) => !["missing-media-blocks", "no-generic-card-fallback"].includes(item.id)),
    currentVisualTruthCorrect: failures.every((item) => !["latest-visual-truth-pending", "report-truth-status"].includes(item.id)),
    genericSystemContractPresent: failures.every((item) => !item.id.startsWith("generic-contract") && !item.id.startsWith("ai-output-schema")),
  },
  summary: {
    chapterCount: plan.chapters.length,
    editShotCount: plan.shots.length,
    cueCount: plan.source.cueCount,
    presenterShotCount: presenterSummary.shotCount,
    presenterDurationRatio: Number((presenterSummary.durationMs / 218400).toFixed(4)),
    screenShotCount: plan.mediumSummary["screen-demo"].shotCount,
    screenDurationRatio: plan.mediumSummary["screen-demo"].durationRatio,
    packageShotCount: plan.mediumSummary["full-package"].shotCount,
    packageDurationRatio: plan.mediumSummary["full-package"].durationRatio,
    typeOnlyShotCount: plan.mediumSummary["type-only"].shotCount,
    typeOnlyDurationRatio: plan.mediumSummary["type-only"].durationRatio,
  },
  failures,
  nextAction: failures.length ? "fix-whole-film-director-contract" : plan.nextAction,
};

for (const targetRoot of [artifactRoot, publicRoot]) {
  fs.mkdirSync(targetRoot, {recursive: true});
  fs.writeFileSync(path.join(targetRoot, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(audit, null, 2));
if (failures.length) process.exit(1);
