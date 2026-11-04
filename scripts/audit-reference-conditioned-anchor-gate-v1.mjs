#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "reference-conditioned-anchor-gate-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const reportPath = path.join(publicDir, "report.json");
const rendererSourcePath = path.join(root, "remotion-renderer/src/ReferenceConditionedH47Anchors.tsx");
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const failures = [];
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(root, "apps/studio-next/public", String(publicUrl).replace(/^\//u, ""));

if (!fs.existsSync(reportPath)) failures.push("report-missing");
const report = fs.existsSync(reportPath) ? readJson(reportPath) : {anchors: [], metrics: {}, gates: {}, currentAuthority: {}, supersession: {superseded: []}};
const rendererSource = fs.existsSync(rendererSourcePath) ? fs.readFileSync(rendererSourcePath, "utf8") : "";
if (report.status !== "STRUCTURAL_PASS") failures.push(`status:${report.status}`);
if (report.visualReviewStatus !== "PENDING_USER_VISUAL_REVIEW") failures.push(`visual-review-status:${report.visualReviewStatus}`);
if (report.referenceCorpusStatus !== "REFERENCE_CORPUS_OBSERVED") failures.push(`reference-corpus:${report.referenceCorpusStatus}`);
if (report.currentAuthority?.unchanged !== true || report.currentAuthority?.propsSha256Before !== report.currentAuthority?.propsSha256After || report.currentAuthority?.phaseSha256Before !== report.currentAuthority?.phaseSha256After) failures.push("current-authority-mutated");
if ((report.anchors || []).length !== 3) failures.push(`anchor-count:${report.anchors?.length}`);
if (report.metrics?.independentFamilyCount !== 3) failures.push(`independent-family-count:${report.metrics?.independentFamilyCount}`);
if (report.metrics?.uniqueLayoutSilhouetteCount !== 3) failures.push(`layout-silhouette-count:${report.metrics?.uniqueLayoutSilhouetteCount}`);
if (report.metrics?.sourceTemplateLaneCount !== 3) failures.push(`source-template-lane-count:${report.metrics?.sourceTemplateLaneCount}`);
if (report.metrics?.referenceBoundAnchorCount !== 3) failures.push(`reference-bound-anchor-count:${report.metrics?.referenceBoundAnchorCount}`);
if (report.metrics?.referenceSourceCount !== 5 || report.metrics?.referenceSequenceCount !== 20 || report.metrics?.referenceFrameCount !== 80) failures.push("reference-corpus-counts-invalid");
if (/function\s+Title\b/u.test(rendererSource) || /<Title\b/u.test(rendererSource)) failures.push("shared-universal-title-component-present");
if ((report.supersession?.superseded || []).length < 4 || report.supersession.superseded.some((item) => item.adoptionAllowed !== false || item.engineeringEvidenceMayRemain !== true)) failures.push("supersession-manifest-invalid");
for (const key of ["rendererAdoptionAllowed", "fullBoardGenerationAllowed", "motionPrototypeAllowed", "fullMp4RenderAllowed", "finalRenderAllowed"]) if (report.gates?.[key] !== false) failures.push(`gate-open:${key}`);
if (report.gates?.humanVisualApprovalGate !== "PENDING") failures.push("human-visual-gate-not-pending");
for (const anchor of report.anchors || []) {
  const file = publicFile(anchor.still?.publicUrl || "");
  if (!fs.existsSync(file)) { failures.push(`${anchor.shotId}:still-missing`); continue; }
  const metadata = await sharp(file).metadata();
  if (metadata.width !== 960 || metadata.height !== 540) failures.push(`${anchor.shotId}:still-dimensions:${metadata.width}x${metadata.height}`);
  const stats = await sharp(file).stats();
  if (stats.isOpaque !== true) failures.push(`${anchor.shotId}:still-not-opaque`);
  if (!Array.isArray(anchor.referenceSequenceIds) || anchor.referenceSequenceIds.length < 2) failures.push(`${anchor.shotId}:reference-binding-missing`);
}
const comparisonFile = publicFile(report.comparisonSheet?.publicUrl || "");
if (!fs.existsSync(comparisonFile)) failures.push("comparison-sheet-missing");
const result = {
  contract: "A1ReferenceConditionedAnchorGateAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  visualReviewStatus: "PENDING_USER_VISUAL_REVIEW",
  currentAuthorityUnchanged: failures.includes("current-authority-mutated") === false,
  failures,
  metrics: report.metrics,
  gates: report.gates,
};
fs.mkdirSync(artifactDir, {recursive: true});
fs.writeFileSync(path.join(artifactDir, "audit.json"), `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(path.join(publicDir, "audit.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
