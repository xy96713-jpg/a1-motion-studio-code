#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "editorial-montage-v2-anchors";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const failures = [];
const reportPath = path.join(publicDir, "report.json");
if (!fs.existsSync(reportPath)) failures.push("report-missing");
const report = fs.existsSync(reportPath) ? read(reportPath) : {anchors: [], metrics: {}, gates: {}, sourceBinding: {}};
const anchors = Array.isArray(report.anchors) ? report.anchors : [];
if (report.status !== "STRUCTURAL_PASS") failures.push(`status:${report.status}`);
if (report.visualReviewStatus !== "VISUAL_REVIEW_REQUIRED") failures.push(`visual-review-status:${report.visualReviewStatus}`);
if (anchors.length !== 3) failures.push(`anchor-count:${anchors.length}`);
for (const anchor of anchors) {
  if (!anchor.still?.publicUrl) failures.push(`${anchor.shotId}:still-missing`);
  if (!fs.existsSync(path.join(root, "apps/studio-next/public", String(anchor.still?.publicUrl || "").replace(/^\//u, "")))) failures.push(`${anchor.shotId}:still-file-missing`);
  if (Number(anchor.material?.coverage || 0) < .55) failures.push(`${anchor.shotId}:material-coverage-below-55`);
  if (anchor.material?.sourceKind !== "generated-editorial-artwork") failures.push(`${anchor.shotId}:source-kind-not-editorial-artwork`);
  if (anchor.material?.promptBound !== true) failures.push(`${anchor.shotId}:prompt-not-bound`);
  if (anchor.typography?.editable !== true || anchor.typography?.baked !== false) failures.push(`${anchor.shotId}:typography-not-editable`);
  if (anchor.semanticElements?.decorative !== false) failures.push(`${anchor.shotId}:decorative-semantic-element`);
}
const expectedGates = ["fullBoardGenerationAllowed", "motionDesignAllowed", "fullMp4RenderAllowed", "finalRenderAllowed"];
for (const key of expectedGates) if (report.gates?.[key] !== false) failures.push(`gate-open:${key}`);
if (report.currentAuthorityMutated !== false || report.currentAuthority?.unchanged !== true || report.sourceBinding?.currentAuthorityUnchanged !== true) failures.push("current-authority-binding-failed");
const metrics = {
  anchorCount: anchors.length,
  materialLedCount: anchors.filter((anchor) => Number(anchor.material?.coverage || 0) >= .55).length,
  averageMaterialCoverage: anchors.length ? anchors.reduce((sum, anchor) => sum + Number(anchor.material?.coverage || 0), 0) / anchors.length : 0,
  uniqueRoleCount: new Set(anchors.map((anchor) => anchor.role)).size,
  screenshotOnlyCount: anchors.filter((anchor) => String(anchor.material?.sourceKind || "").includes("screenshot")).length,
  abstractPlaceholderCount: anchors.filter((anchor) => String(anchor.material?.sourceKind || "").includes("abstract")).length,
  decorativeLineCount: anchors.filter((anchor) => anchor.semanticElements?.decorative === true).length,
  repeatedTemplateCount: report.metrics?.repeatedTemplateCount || 0,
};
if (metrics.materialLedCount !== 3) failures.push("not-all-material-led");
if (metrics.uniqueRoleCount !== 3) failures.push("roles-not-distinct");
if (metrics.screenshotOnlyCount !== 0) failures.push("screenshot-only-material-present");
if (metrics.abstractPlaceholderCount !== 0) failures.push("abstract-placeholder-present");
if (metrics.decorativeLineCount !== 0) failures.push("decorative-line-present");
const result = {contract: "A1EditorialMontageV2AnchorVisualQualityReport/v1", status: failures.length ? "STRUCTURAL_FAIL" : "STRUCTURAL_PASS", visualReviewStatus: "VISUAL_REVIEW_REQUIRED", reviewOnly: true, currentAuthorityMutated: false, metrics, failures, nextAction: failures.length ? "修复三张锚点的结构问题后重新生成" : "用户先审三张主素材锚点；机器通过不等于视觉批准。"};
fs.mkdirSync(artifactDir, {recursive: true});
fs.writeFileSync(path.join(artifactDir, "visual-quality-report.json"), `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(path.join(publicDir, "visual-quality-report.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
