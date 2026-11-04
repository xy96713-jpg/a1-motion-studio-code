#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "editorial-montage-v1-anchor-pilot";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const report = read(path.join(publicDir, "report.json"));
const pilot = report.pilot || [];
const silhouettes = new Set(pilot.map((shot) => shot.layoutSilhouette));
let maxRun = 0; let run = 0; let previous = null;
for (const shot of pilot) { if (shot.layoutSilhouette === previous) run += 1; else run = 1; previous = shot.layoutSilhouette; maxRun = Math.max(maxRun, run); }
const metrics = {
  materialLedCount: pilot.filter((shot) => Number(shot.materialCoverage) >= .55).length,
  giantTitleCount: pilot.filter((shot) => ["overlay-giant", "black-field", "evidence-margin", "split-vertical"].includes(shot.titleMode)).length,
  screenshotOnlyCount: pilot.filter((shot) => shot.visualRole === "evidence-page").length,
  abstractPlaceholderCount: pilot.filter((shot) => String(shot.sourceKind || "").includes("abstract")).length,
  silhouetteCount: silhouettes.size,
  maxConsecutiveSameSilhouette: maxRun,
  decorativeBlueLineCount: pilot.filter((shot) => shot.decorativeBlueLine === true).length,
};
const failures = [];
if (pilot.length !== 12) failures.push(`pilot-count:${pilot.length}`);
if (metrics.materialLedCount < 8) failures.push(`material-led-count:${metrics.materialLedCount}`);
if (metrics.giantTitleCount < 8) failures.push(`giant-title-count:${metrics.giantTitleCount}`);
if (metrics.screenshotOnlyCount > 3) failures.push(`screenshot-only-count:${metrics.screenshotOnlyCount}`);
if (metrics.abstractPlaceholderCount > 1) failures.push(`abstract-placeholder-count:${metrics.abstractPlaceholderCount}`);
if (metrics.silhouetteCount < 6) failures.push(`silhouette-count:${metrics.silhouetteCount}`);
if (metrics.maxConsecutiveSameSilhouette > 2) failures.push(`silhouette-run:${metrics.maxConsecutiveSameSilhouette}`);
if (metrics.decorativeBlueLineCount !== 0) failures.push(`decorative-blue-lines:${metrics.decorativeBlueLineCount}`);
if (!report.sourceBinding?.currentAuthorityUnchanged || report.sourceBinding?.currentAuthorityPhase !== "h-series-semantic-directed-v1") failures.push("current-authority-binding-missing");
if (!report.profile?.sha256 || !report.sourceBinding?.designSetSha256) failures.push("hash-binding-incomplete");
const result = {
  contract: "A1EditorialMontageV1VisualQualityAudit/v1",
  phaseId,
  status: failures.length ? "STRUCTURAL_FAIL" : "STRUCTURAL_PASS",
  visualReviewStatus: "VISUAL_REVIEW_REQUIRED",
  reviewOnly: true,
  currentAuthorityMutated: false,
  metrics,
  checks: {allStillsPresent: pilot.every((shot) => shot.still?.publicUrl), anchorsPresent: (report.anchors || []).length === 3, gatesRemainClosed: report.gates?.fullBoardGenerationAllowed === false && report.gates?.motionDesignAllowed === false, sourceBindingComplete: Boolean(report.sourceBinding?.currentAuthorityUnchanged && report.sourceBinding?.designSetSha256), materialLedAtLeastEight: metrics.materialLedCount >= 8, giantTitleAtLeastEight: metrics.giantTitleCount >= 8, screenshotOnlyAtMostThree: metrics.screenshotOnlyCount <= 3, abstractPlaceholderAtMostOne: metrics.abstractPlaceholderCount <= 1, sixSilhouettes: metrics.silhouetteCount >= 6, noDecorativeBlueLines: metrics.decorativeBlueLineCount === 0},
  failures,
  nextAction: failures.length ? "修复结构闸门后重新生成试验板" : "先做人审三张锚点，再决定是否扩展12镜；机器通过不等于视觉批准。",
};
fs.mkdirSync(artifactDir, {recursive: true});
fs.writeFileSync(path.join(artifactDir, "visual-quality-report.json"), `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(path.join(publicDir, "visual-quality-report.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
