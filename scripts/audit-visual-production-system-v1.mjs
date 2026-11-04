#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "visual-production-system-v1";
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const planPath = path.join(publicRoot, "system-plan.json");
const reportPath = path.join(publicRoot, "report.json");
const specimenReportPath = path.join(publicRoot, "typography-specimen-report.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const failures = [];
if (!fs.existsSync(planPath)) failures.push("system-plan-missing");
if (!fs.existsSync(reportPath)) failures.push("system-report-missing");
if (!fs.existsSync(specimenReportPath)) failures.push("font-specimen-report-missing");
const plan = fs.existsSync(planPath) ? read(planPath) : null;
const report = fs.existsSync(reportPath) ? read(reportPath) : null;
const specimen = fs.existsSync(specimenReportPath) ? read(specimenReportPath) : null;
if (plan?.contract !== "A1VisualProductionSystem/v1") failures.push(`contract:${plan?.contract || "missing"}`);
if (plan?.sourceOfTruth !== "shared-motion-ir") failures.push("source-of-truth-not-shared-ir");
if (plan?.summary?.sceneCount !== 47) failures.push(`scene-count:${plan?.summary?.sceneCount}`);
if ((plan?.summary?.familyCount || 0) < 6) failures.push(`family-count-too-low:${plan?.summary?.familyCount}`);
if ((plan?.summary?.fontCount || 0) < 3) failures.push(`font-count-too-low:${plan?.summary?.fontCount}`);
if (!plan?.fontRegistry?.some((font) => font.id === "source-han-serif-sc-variable" && font.formalRenderAllowed)) failures.push("formal-serif-font-missing");
if (!plan?.fontRegistry?.some((font) => font.id === "noto-sans-hans-black" && font.formalRenderAllowed)) failures.push("formal-impact-font-missing");
if (!plan?.materialRegistry?.every((asset) => asset.textFree === true && asset.editableCopyRequired === true)) failures.push("ai-material-copy-policy-failed");
if (plan?.gates?.rendererAdoptionAllowed !== false || plan?.gates?.fullBoardGenerationAllowed !== false) failures.push("adoption-gate-open");
const admissions = plan?.scenes || [];
if (admissions.length !== plan?.summary?.sceneCount) failures.push("visual-admission-scene-count-mismatch");
for (const scene of admissions) {
  const admission = scene.visualAdmission;
  if (!admission || admission.contract !== "A1VisualShotAdmission/v1") failures.push(`visual-admission-missing:${scene.sceneId}`);
  if (admission?.gates?.genericFallbackAllowed !== false) failures.push(`generic-fallback-open:${scene.sceneId}`);
  if (admission?.gates?.adoptionAllowed !== false) failures.push(`adoption-open:${scene.sceneId}`);
  if (admission?.rendererAdapter?.status !== "implemented") failures.push(`renderer-adapter-blocked:${scene.sceneId}`);
  if (admission?.visualSubject === "real-evidence" && admission.materialBound !== true) failures.push(`unbound-real-evidence:${scene.sceneId}`);
  if (!admission?.motionPhrase?.entry || !admission?.motionPhrase?.transformation || !admission?.motionPhrase?.resolve) failures.push(`motion-phrase-incomplete:${scene.sceneId}`);
}
if (report?.source?.currentAuthorityUnchanged !== true) failures.push("current-authority-mutated");
if (specimen?.status !== "PASS" || specimen?.currentAuthority?.unchanged !== true) failures.push("specimen-proof-failed");
const result = {
  contract: "A1VisualProductionSystemAudit/v1",
  phaseId,
  status: failures.length ? "FAIL" : "PASS",
  failures,
  metrics: plan ? {sceneCount: plan.summary.sceneCount, familyCount: plan.summary.familyCount, fontCount: plan.summary.fontCount, aiMaterialCount: plan.summary.aiMaterialCount, compositionRegistryCount: plan.compositionRegistry.length, formalFontCount: plan.fontRegistry.filter((font) => font.formalRenderAllowed).length, reviewOnlyFontCount: plan.fontRegistry.filter((font) => !font.formalRenderAllowed).length, visualAdmissionCount: admissions.filter((scene) => scene.visualAdmission?.contract === "A1VisualShotAdmission/v1").length} : null,
  gates: {systemCompiler: plan?.gates?.systemCompiler || "MISSING", specimen: specimen?.status || "MISSING", humanVisualApproval: plan?.gates?.humanVisualApproval || "MISSING", rendererAdoptionAllowed: plan?.gates?.rendererAdoptionAllowed ?? null, fullBoardGenerationAllowed: plan?.gates?.fullBoardGenerationAllowed ?? null},
};
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId, "audit.json");
fs.mkdirSync(path.dirname(artifactPath), {recursive: true});
fs.writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(path.join(publicRoot, "audit.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
