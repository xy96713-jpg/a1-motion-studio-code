#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const arg = process.argv.slice(2).find((value) => value.startsWith("--phase-id="));
const phaseId = arg ? arg.slice("--phase-id=".length) : "fused-editorial-v2-full-static-board-v1";
const generatedRoot = path.join(root, "apps/studio-next/public/generated/system-line");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicDir = path.join(generatedRoot, phaseId);
const artifactDir = path.join(artifactRoot, phaseId);
const inputPath = path.join(publicDir, "layered-shot-designs.json");
const reportPath = path.join(publicDir, "visual-quality-report.json");
const artifactReportPath = path.join(artifactDir, "visual-quality-report.json");
const indexReportPath = path.join(generatedRoot, "fused-editorial-v2-visual-quality-v1", `${phaseId}.json`);
const indexArtifactReportPath = path.join(artifactRoot, "fused-editorial-v2-visual-quality-v1", `${phaseId}.json`);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const exists = (file) => fs.existsSync(file) && fs.statSync(file).size > 0;
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

if (!exists(inputPath)) throw new Error(`layered-shot-designs-missing:${phaseId}`);
const payload = read(inputPath);
const designs = Array.isArray(payload.designs) ? payload.designs : [];
if (!designs.length) throw new Error(`layered-shot-designs-empty:${phaseId}`);

const materialCounts = new Map();
const familyCounts = new Map();
const materialless = [];
const missingReasons = [];
const missingCropCandidates = [];
const missingSemanticElements = [];
const missingTypography = [];
const foregroundlessImportant = [];
for (const design of designs) {
  const layers = design.layers || {};
  const material = layers.material || {};
  const materialKey = material.assetUri || material.prompt || "(none)";
  materialCounts.set(materialKey, (materialCounts.get(materialKey) || 0) + 1);
  familyCounts.set(design.sceneFamily || "(unknown)", (familyCounts.get(design.sceneFamily || "(unknown)") || 0) + 1);
  if (!material.assetUri && !material.prompt) {
    materialless.push(design.shotId);
    if (!material.emptyReason) missingReasons.push(design.shotId);
  } else if (!Array.isArray(design.treatment?.cropAlternatives) || design.treatment.cropAlternatives.length < 3) {
    missingCropCandidates.push(design.shotId);
  }
  if (!layers.semanticElements?.elementKinds?.length) missingSemanticElements.push(design.shotId);
  if (!layers.typography?.editableCopy?.headlineLines?.length) missingTypography.push(design.shotId);
  if (Number(design.narrative?.importance || 0) >= 4 && !layers.foreground?.assetUri && !layers.material?.assetUri && !layers.semanticElements?.elementKinds?.length) foregroundlessImportant.push(design.shotId);
}

let maxFamilyRun = 0; let currentFamily = null; let currentRun = 0;
for (const design of designs) {
  if (design.sceneFamily === currentFamily) currentRun += 1; else { currentFamily = design.sceneFamily; currentRun = 1; }
  maxFamilyRun = Math.max(maxFamilyRun, currentRun);
}
const repeatedMaterials = [...materialCounts.entries()].filter(([assetUri, count]) => assetUri !== "(none)" && count > 4).sort((a, b) => b[1] - a[1]).map(([assetUri, count]) => ({assetUri, count}));
const materialAssetCount = [...materialCounts.keys()].filter((key) => key !== "(none)").length;
const materiallessRatio = materialless.length / designs.length;
const hardBlockers = [];
if (missingReasons.length) hardBlockers.push({id: "materialless-without-reason", shotIds: missingReasons});
if (missingCropCandidates.length) hardBlockers.push({id: "material-without-three-crops", shotIds: missingCropCandidates});
if (missingSemanticElements.length) hardBlockers.push({id: "semantic-elements-empty", shotIds: missingSemanticElements});
if (missingTypography.length) hardBlockers.push({id: "typography-empty", shotIds: missingTypography});
if (maxFamilyRun > 2) hardBlockers.push({id: "scene-family-run-over-two", maxFamilyRun});
if (repeatedMaterials.length) hardBlockers.push({id: "material-reuse-over-four", repeatedMaterials});

const reviewRisks = [];
if (materiallessRatio > .2) reviewRisks.push({id: "materialless-ratio-over-20-percent", ratio: materiallessRatio, shotIds: materialless});
if (foregroundlessImportant.length) reviewRisks.push({id: "important-shot-has-no-material-or-foreground", shotIds: foregroundlessImportant});
if (materialAssetCount < Math.max(4, Math.ceil(designs.length * .15))) reviewRisks.push({id: "low-material-diversity", materialAssetCount, expectedMinimum: Math.max(4, Math.ceil(designs.length * .15))});

const report = {
  contract: "A1FusedEditorialV2VisualQualityAudit/v1",
  phaseId,
  generatedAt: new Date().toISOString(),
  status: hardBlockers.length ? "REVIEW_REQUIRED" : "PASS",
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  source: {path: path.relative(root, inputPath).split(path.sep).join("/"), sha256: sha256(inputPath), shotCount: designs.length},
  summary: {shotCount: designs.length, materialAssetCount, materiallessCount: materialless.length, materiallessRatio, foregroundlessImportantCount: foregroundlessImportant.length, familyCount: familyCounts.size, maxFamilyRun, repeatedMaterialCount: repeatedMaterials.length, hardBlockerCount: hardBlockers.length, reviewRiskCount: reviewRisks.length},
  familyCounts: Object.fromEntries(familyCounts),
  materialCounts: Object.fromEntries(materialCounts),
  materiallessShotIds: materialless,
  repeatedMaterials,
  hardBlockers,
  reviewRisks,
  currentAuthorityUnchanged: true,
  nextAction: hardBlockers.length ? "build-visual-repair-candidate-before-motion-adoption" : reviewRisks.length ? "direct-user-visual-review-before-maturity" : "direct-user-visual-review",
};
write(reportPath, report); write(artifactReportPath, report); write(indexReportPath, report); write(indexArtifactReportPath, report);
console.log(JSON.stringify({status: report.status, phaseId, summary: report.summary, nextAction: report.nextAction}, null, 2));
if (hardBlockers.length) process.exitCode = 1;
