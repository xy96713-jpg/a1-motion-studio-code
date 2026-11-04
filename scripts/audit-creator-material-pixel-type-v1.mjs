#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "creator-material-pixel-type-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const planPath = path.join(publicDir, "plan.json");
const renderPath = path.join(publicDir, "render-report.json");
const reviewPath = path.join(publicDir, "independent-visual-review.json");
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const planDocument = fs.existsSync(planPath) ? JSON.parse(fs.readFileSync(planPath, "utf8")) : null;
const plan = planDocument?.plan || planDocument;
const render = fs.existsSync(renderPath) ? JSON.parse(fs.readFileSync(renderPath, "utf8")) : null;
const review = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, "utf8")) : null;
const failures = [];
const check = (id, pass) => { if (!pass) failures.push(id); };

check("plan-present", Boolean(plan));
check("render-present", Boolean(render));
if (plan && render) {
  const topologies = plan.shots.map((shot) => shot.topology);
  const evidence = plan.assets.filter((asset) => asset.route === "real-evidence");
  const environments = plan.assets.filter((asset) => asset.route === "generated-environment");
  const forbidden = new Set(plan.shots.flatMap((shot) => shot.forbiddenPrimitives));
  check("contract", plan.contract === "A1CreatorMaterialPixelTypePlan/v1");
  check("family", plan.familyId === "creator-material/desk-documentary/pixel-type");
  check("three-frames", plan.shots.length === 3 && render.frames?.length === 3);
  check("three-topologies", new Set(topologies).size === 3);
  check("real-evidence-per-shot", plan.shots.every((shot) => evidence.some((asset) => asset.id === shot.evidenceAssetId)));
  check("environment-plates-non-evidence", environments.length === 2 && plan.shots.every((shot) => !shot.environmentAssetId || environments.some((asset) => asset.id === shot.environmentAssetId)));
  check("four-font-roles", plan.fonts.length === 4 && new Set(plan.fonts.map((font) => font.role)).size === 4);
  check("forbidden-primitives", ["floating-logo-card", "white-document-card", "generic-bottom-strip", "unattached-arrow"].every((item) => forbidden.has(item)));
  check("frame-hashes", render.frames?.every((frame) => { const file = path.join(publicDir, path.basename(frame.publicUrl)); return fs.existsSync(file) && shaFile(file) === frame.sha256; }));
  check("contact-sheet-hash", Boolean(render.contactSheet && fs.existsSync(path.join(publicDir, path.basename(render.contactSheet.publicUrl))) && shaFile(path.join(publicDir, path.basename(render.contactSheet.publicUrl))) === render.contactSheet.sha256));
  check("specimen-hash", Boolean(render.specimen && fs.existsSync(path.join(publicDir, path.basename(render.specimen.publicUrl))) && shaFile(path.join(publicDir, path.basename(render.specimen.publicUrl))) === render.specimen.sha256));
  check("asset-hashes", plan.assets.every((asset) => { const file = path.join(root, "remotion-renderer/public", asset.assetUri); return fs.existsSync(file) && shaFile(file) === asset.sha256; }));
  check("font-hashes", plan.fonts.every((font) => { const file = path.join(root, "remotion-renderer/public", font.assetUri); return fs.existsSync(file) && shaFile(file) === font.sha256; }));
  check("authority-unchanged", render.currentAuthority?.unchanged === true && shaFile(authorityPath) === render.currentAuthority.sha256After);
  check("old-ai-rejected", plan.gates.legacyAiCandidate === "REJECTED");
  check("expansion-locked", !plan.gates.motionExpansionAllowed && !plan.gates.rendererAdoptionAllowed && !plan.gates.h47ExpansionAllowed);
}
const topologies = plan?.shots?.map((shot) => shot.topology) || [];
const evidence = plan?.assets?.filter((asset) => asset.route === "real-evidence") || [];
const environments = plan?.assets?.filter((asset) => asset.route === "generated-environment") || [];
const forbidden = new Set(plan?.shots?.flatMap((shot) => shot.forbiddenPrimitives) || []);
const reviewedArtifactsCurrent = Boolean(review && render && review.reviewedArtifacts?.contactSheetSha256 === render.contactSheet?.sha256 && render.frames?.every((frame) => review.reviewedArtifacts?.frameSha256?.[frame.shotId] === frame.sha256));
const dynamicPrototypeAllowed = reviewedArtifactsCurrent && review?.verdict === "PASS_FOR_DYNAMIC_PROTOTYPE";
const report = {
  contract: "A1CreatorMaterialPixelTypeAuditReport/v1",
  phaseId,
  status: failures.length ? "FAIL" : dynamicPrototypeAllowed ? "PASS_FOR_DYNAMIC_PROTOTYPE" : "STRUCTURAL_PASS_VISUAL_RECHECK_REQUIRED",
  failures,
  evidence: {planPath: path.relative(root, planPath), renderPath: path.relative(root, renderPath), specimenPath: path.relative(root, path.join(publicDir, "typography-specimen.png")), contactSheetPath: path.relative(root, path.join(publicDir, "creator-material-pixel-type-v1-contact-sheet.png"))},
  summary: {familyId: plan?.familyId, frameCount: plan?.shots?.length || 0, topologyCount: new Set(topologies).size, realEvidenceCount: evidence.length, generatedEnvironmentCount: environments.length, fontRoleCount: plan?.fonts?.length || 0, forbiddenPrimitiveCount: forbidden.size},
  independentReview: review ? {verdict: review.verdict, familyAdoptionVerdict: review.familyAdoptionVerdict, reviewedArtifactsCurrent, sourceThreadId: review.reviewer?.sourceThreadId} : null,
  truthBoundary: {generatedEnvironmentsAreEvidence: false, realScreensAreEvidence: true, aiDirected: false, note: "This hand-directed family proof validates material and typography primitives only; it does not prove unseen-article AI direction or motion maturity."},
  gates: {humanVisualApproval: dynamicPrototypeAllowed ? "PASS_FOR_DYNAMIC_PROTOTYPE" : "RECHECK_REQUIRED", dynamicPrototypeAllowed, motionExpansionAllowed: dynamicPrototypeAllowed, fullSequenceRenderAllowed: false, familyAdoptionAllowed: false, rendererAdoptionAllowed: false, h47ExpansionAllowed: false, nextRequiredProof: dynamicPrototypeAllowed ? "2-4 second creator-material motion prototype" : "direct visual recheck of all three 1920x1080 frames"},
};
writeJson(path.join(artifactDir, "audit-report.json"), report);
writeJson(path.join(publicDir, "audit-report.json"), report);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
