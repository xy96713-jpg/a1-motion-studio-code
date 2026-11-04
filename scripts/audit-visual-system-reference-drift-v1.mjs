#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "visual-system-reference-drift-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reviewPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/visual-system-full-review-v1/render-plan.json");
const sourcePlanPath = path.join(root, "apps/studio-next/public/generated/system-line/visual-production-system-v1/system-plan.json");
const referenceGrammarPath = path.join(root, "apps/studio-next/src/lib/a1-reference-grammar-v1.ts");
const visualMasterV2Path = path.join(root, "apps/studio-next/src/lib/a1-visual-master-profile-v2.ts");
const visualMasterV3Path = path.join(root, "apps/studio-next/src/lib/a1-editorial-montage-profile-v1.ts");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const reviewPlan = readJson(reviewPlanPath);
const sourcePlan = readJson(sourcePlanPath);
if (reviewPlan.scenes?.length !== 47) throw new Error(`expected-47-review-scenes:${reviewPlan.scenes?.length}`);
if (sourcePlan.scenes?.length !== 47) throw new Error(`expected-47-source-scenes:${sourcePlan.scenes?.length}`);

// These are the already-approved abstract contracts in the repository, not a new visual opinion.
const referenceFamilies = ["hero-photo", "evidence-page", "image-number-collage", "role-triptych", "dark-verdict", "macro-object", "quiet-object"];
const referenceSilhouettes = ["full-bleed", "tilted-page", "repeat-collage", "triptych", "dark-field", "macro-overlay", "negative-space"];
const referenceMinimumSilhouettes = 6;
const referenceMaterialCoverageMinimum = .55;
const currentFamilyToReference = {
  "hero-material-title": "hero-photo",
  "evidence-macro-annotation": "evidence-page",
  "scale-collision": "image-number-collage",
  "role-triptych": "role-triptych",
  "contrast-rail": "dark-verdict",
  "object-crop": "macro-object",
  "quiet-verdict": "quiet-object",
};

const familyCounts = Object.fromEntries(reviewPlan.scenes.reduce((map, scene) => map.set(scene.familyId, (map.get(scene.familyId) || 0) + 1), new Map()));
const materialCounts = Object.fromEntries(reviewPlan.scenes.reduce((map, scene) => {
  const asset = scene.editorialDesign?.layers?.material?.assetUri?.replace(/^\//u, "") || "NONE";
  return map.set(asset, (map.get(asset) || 0) + 1);
}, new Map()));
const materialBackedScenes = reviewPlan.scenes.filter((scene) => scene.editorialDesign?.layers?.material?.assetUri);
const primaryMaterialScenes = reviewPlan.scenes.filter((scene) => scene.editorialDesign?.materialPriority === "primary");
const sharedMaterialCount = Object.entries(materialCounts).filter(([asset]) => asset.includes("shared-background-plate")).reduce((sum, [, count]) => sum + count, 0);
const nonSharedMaterialCount = materialBackedScenes.length - sharedMaterialCount;
const distinctMaterialCount = Object.keys(materialCounts).filter((asset) => asset !== "NONE").length;
const primaryMaterialBackedCount = primaryMaterialScenes.filter((scene) => scene.editorialDesign?.layers?.material?.assetUri && !scene.editorialDesign.layers.material.assetUri.includes("shared-background-plate")).length;
const primaryMaterialCoverage = primaryMaterialScenes.length ? primaryMaterialBackedCount / primaryMaterialScenes.length : 1;
const familySequence = reviewPlan.scenes.map((scene) => scene.familyId);
let maxConsecutiveFamily = 1;
let currentRun = 1;
for (let index = 1; index < familySequence.length; index += 1) {
  currentRun = familySequence[index] === familySequence[index - 1] ? currentRun + 1 : 1;
  maxConsecutiveFamily = Math.max(maxConsecutiveFamily, currentRun);
}

const sourceFamilyIds = new Set(sourcePlan.compositionRegistry.map((family) => family.id));
const unmatchedCurrentFamilies = [...sourceFamilyIds].filter((familyId) => !currentFamilyToReference[familyId]);
const historicalCandidate = reviewPlan.authority === "historical-candidate-not-authoritative" || sourcePlan.authority === "historical-candidate-not-authoritative";
const sceneDesignFields = ["visualJob", "layoutSilhouette", "materialPriority", "accentRole", "photoTreatment", "focalPoint", "editableCopy"];
const missingDesignFieldCounts = Object.fromEntries(sceneDesignFields.map((field) => [field, reviewPlan.scenes.filter((scene) => {
  const design = scene.editorialDesign || {};
  if (field === "visualJob") return !design.narrative?.visualFocus;
  if (field === "layoutSilhouette") return !design.layoutSilhouette;
  if (field === "materialPriority") return !design.materialPriority;
  if (field === "accentRole") return !design.accentRole;
  if (field === "photoTreatment") return !design.photoTreatment;
  if (field === "focalPoint") return design.materialPriority !== "none" && !design.layers?.material?.focalPoint;
  if (field === "editableCopy") return !design.layers?.typography?.headlineLines?.length;
  return true;
}).length]));
const issueList = [];
if (materialBackedScenes.length && sharedMaterialCount / materialBackedScenes.length > .45) issueList.push({id: "shared-material-dominance", severity: "high", observed: `${sharedMaterialCount}/${materialBackedScenes.length}`, rule: "素材优先的镜头不能把共享底图当作主材料"});
if (primaryMaterialCoverage < referenceMaterialCoverageMinimum) issueList.push({id: "material-coverage-below-contract", severity: "high", observed: `${primaryMaterialBackedCount}/${primaryMaterialScenes.length}`, rule: `主素材镜头覆盖率至少 ${referenceMaterialCoverageMinimum}`});
if (distinctMaterialCount < 4) issueList.push({id: "material-diversity-too-low", severity: "high", observed: distinctMaterialCount, rule: "系统必须能在跨镜头中表达多种具体材料关系"});
if (maxConsecutiveFamily > 2) issueList.push({id: "family-run-too-long", severity: "medium", observed: maxConsecutiveFamily, rule: "连续相同轮廓不得超过两镜"});
if (unmatchedCurrentFamilies.length && !historicalCandidate) issueList.push({id: "family-contract-drift", severity: "high", observed: unmatchedCurrentFamilies, rule: "渲染家族必须来自已有视觉母版契约，而不是另起一套同名不同义的家族"});
if (Object.values(missingDesignFieldCounts).some((count) => count > 0)) issueList.push({id: "shot-design-under-specified", severity: "high", observed: missingDesignFieldCounts, rule: "统一 IR 需要承载构图轮廓、素材优先级、色彩职责和可编辑文案，而不是只传 title/tokens"});

const report = {
  contract: "A1VisualSystemReferenceDriftAudit/v1",
  phaseId,
  generatedAt: new Date().toISOString(),
  status: issueList.length ? "DRIFT_DETECTED" : historicalCandidate ? "HISTORICAL_CANDIDATE" : "PASS",
  authority: historicalCandidate ? "historical-candidate-not-authoritative" : "active-review-candidate",
  sourceOfTruth: historicalCandidate ? "historical-visual-production-system-v1" : "shared-motion-ir",
  reviewPlanSha256: shaFile(reviewPlanPath),
  sourcePlanSha256: shaFile(sourcePlanPath),
  referenceContracts: {
    grammar: path.relative(root, referenceGrammarPath),
    visualMasterV2: path.relative(root, visualMasterV2Path),
    visualMasterV3: path.relative(root, visualMasterV3Path),
    familyIds: referenceFamilies,
    silhouettes: referenceSilhouettes,
    minimumSilhouettes: referenceMinimumSilhouettes,
    minimumMaterialCoverage: referenceMaterialCoverageMinimum,
  },
  observed: {
    sceneCount: reviewPlan.scenes.length,
    familyCounts,
    materialCounts,
    sharedMaterialCount,
    nonSharedMaterialCount,
    materialBackedSceneCount: materialBackedScenes.length,
    primaryMaterialSceneCount: primaryMaterialScenes.length,
    primaryMaterialBackedCount,
    materialCoverage: Number((primaryMaterialCoverage).toFixed(4)),
    distinctMaterialCount,
    maxConsecutiveFamily,
    missingDesignFieldCounts,
    sourceFamilyIds: [...sourceFamilyIds],
  },
  issues: issueList,
  historicalDriftSuppressed: historicalCandidate && unmatchedCurrentFamilies.length ? [{id: "family-contract-drift", observed: unmatchedCurrentFamilies, reason: "该十家族路线已降级为历史候选，不再进入当前主线审片。"}] : [],
  gates: {
    technicalPixelQa: "PASS_SEPARATE_GATE",
    humanVisualApproval: "PENDING",
    rendererAdoptionAllowed: false,
    fullBoardGenerationAllowed: false,
  },
  nextAction: historicalCandidate ? "当前主线转到 fused-editorial-v2 + A1LayeredShotDesign/v2；历史十家族仅保留审计，不得扩展全文。" : "接回已有 layered-shot-design / editorial-montage contracts，先做三锚点而不是继续给十个通用 JSX 家族加样式。",
};

writeJson(path.join(artifactDir, "report.json"), report);
writeJson(path.join(publicDir, "report.json"), report);
console.log(JSON.stringify({status: report.status, phaseId, issueCount: issueList.length, sharedMaterialCount, nonSharedMaterialCount, distinctMaterialCount, maxConsecutiveFamily, missingDesignFieldCounts, issues: issueList.map((issue) => issue.id)}, null, 2));
