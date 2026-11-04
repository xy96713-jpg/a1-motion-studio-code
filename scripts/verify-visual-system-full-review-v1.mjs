#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "visual-system-full-review-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const fail = (message) => { throw new Error(`visual-system-full-review:${message}`); };
const planPath = path.join(publicDir, "render-plan.json");
const plan = readJson(planPath);
const buildReport = readJson(path.join(publicDir, "report.json"));
const renderReport = readJson(path.join(publicDir, "render-report.json"));
const html = fs.readFileSync(path.join(publicDir, "hyperframes-proof.html"), "utf8");
if (plan.contract !== "A1VisualSystemRenderProof/v1") fail("contract");
if (plan.scenes.length !== 47 || buildReport.sceneCount !== 47) fail("scene-count");
const familyIds = [...new Set(plan.scenes.map((scene) => scene.familyId))];
if (familyIds.length !== 10) fail(`family-count:${familyIds.length}`);
if (renderReport.remotion.compositionId !== "A1VisualProductionSystemFullReview") fail("composition");
if (renderReport.frames.length !== 47) fail("hold-frame-count");
if (!renderReport.currentAuthority.unchanged) fail("authority");
for (const scene of plan.scenes) {
  const required = [`data-a1-scene-id="${scene.sceneId}"`, `data-a1-family-id="${scene.familyId}"`, `data-a1-font-id="${scene.fontId}"`, `data-a1-event-hold="${scene.eventFrames.hold}"`];
  if (!required.every((item) => html.includes(item))) fail(`html-attrs:${scene.sceneId}`);
}
if (!html.includes('src="/vendor/gsap/gsap.min.js"') || !html.includes("window.__timelines['a1-visual-system-full-review']")) fail("hyperframes");
const browserStatus = process.env.A1_VISUAL_SYSTEM_FULL_REVIEW_BROWSER_RUNTIME_STATUS || "PENDING";
const browserEvidence = process.env.A1_VISUAL_SYSTEM_FULL_REVIEW_BROWSER_RUNTIME_EVIDENCE || null;
const report = {contract: "A1VisualSystemFullReviewParityReport/v1", phaseId, status: "PASS", sourceOfTruth: plan.sourceOfTruth, sceneCount: 47, familyIds, sourcePlanSha256: plan.sourcePlanSha256, proofPlanSha256: shaFile(planPath), checks: {sameSceneIds: true, allTenFamiliesRouted: true, fortySevenHoldFrames: true, remotionRendered: true, hyperframesAttrs: true, localGsap: true, currentAuthorityUntouched: renderReport.currentAuthority.unchanged}, browserRuntime: {status: browserStatus, evidence: browserEvidence, expected: {sceneCount: 47, reviewOnly: true}}, gates: {rendererParity: "PASS", browserRuntime: browserStatus, reviewOnly: true, humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, fullBoardGenerationAllowed: false}};
writeJson(path.join(artifactDir, "parity-report.json"), report);
writeJson(path.join(publicDir, "parity-report.json"), report);
console.log(JSON.stringify(report, null, 2));
