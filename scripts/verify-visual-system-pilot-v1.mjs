#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "visual-system-pilot-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const fail = (message) => { throw new Error(`visual-system-pilot-parity:${message}`); };
const planPath = path.join(publicDir, "render-plan.json");
const plan = readJson(planPath);
const buildReport = readJson(path.join(publicDir, "report.json"));
const renderReport = readJson(path.join(publicDir, "render-report.json"));
const html = fs.readFileSync(path.join(publicDir, "hyperframes-proof.html"), "utf8");
if (plan.contract !== "A1VisualSystemRenderProof/v1") fail(`contract:${plan.contract}`);
if (plan.sourceOfTruth !== "shared-motion-ir") fail("source-of-truth");
if (plan.scenes.length !== 12) fail(`scene-count:${plan.scenes.length}`);
if (buildReport.sceneCount !== 12) fail("build-scene-count");
if (renderReport.sourcePlanSha256 !== shaFile(planPath)) fail("render-plan-sha");
if (renderReport.remotion.compositionId !== "A1VisualProductionSystemPilot") fail("remotion-entry");
if (renderReport.remotion.durationInFrames !== plan.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0)) fail("duration");
if (!renderReport.currentAuthority.unchanged) fail("current-authority-mutated");
const familyIds = [...new Set(plan.scenes.map((scene) => scene.familyId))];
if (familyIds.length < 8) fail(`family-coverage:${familyIds.length}`);
let offset = 0;
const expectedEvents = [];
for (const scene of plan.scenes) {
  for (const state of ["enter", "emphasize", "hold"]) expectedEvents.push({sceneId: scene.sceneId, familyId: scene.familyId, state, frame: offset + scene.eventFrames[state]});
  const required = [`data-a1-scene-id="${scene.sceneId}"`, `data-a1-family-id="${scene.familyId}"`, `data-a1-event-enter="${scene.eventFrames.enter}"`, `data-a1-event-emphasize="${scene.eventFrames.emphasize}"`, `data-a1-event-hold="${scene.eventFrames.hold}"`, `data-a1-event-handoff="${scene.eventFrames.handoff}"`];
  if (!required.every((item) => html.includes(item))) fail(`html-attrs:${scene.sceneId}`);
  offset += scene.durationInFrames;
}
const actualEvents = renderReport.eventFrames.map(({sceneId, familyId, state, frame}) => ({sceneId, familyId, state, frame}));
if (JSON.stringify(expectedEvents) !== JSON.stringify(actualEvents)) fail("event-frame-parity");
if (!html.includes('src="/vendor/gsap/gsap.min.js"')) fail("local-gsap");
if (!html.includes("window.__timelines['a1-visual-system-pilot']")) fail("timeline-registration");
if (!html.includes("data-a1-source-of-truth=\"shared-motion-ir\"")) fail("source-attr");
const browserStatus = process.env.A1_VISUAL_SYSTEM_PILOT_BROWSER_RUNTIME_STATUS || "PENDING";
const browserEvidence = process.env.A1_VISUAL_SYSTEM_PILOT_BROWSER_RUNTIME_EVIDENCE || null;
const report = {
  contract: "A1VisualSystemPilotParityReport/v1",
  phaseId,
  status: "PASS",
  sourceOfTruth: plan.sourceOfTruth,
  sceneCount: plan.scenes.length,
  familyIds,
  sourcePlanSha256: plan.sourcePlanSha256,
  proofPlanSha256: shaFile(planPath),
  checks: {sameSceneIds: true, sameFamilyIds: true, familyCoverageAtLeastEight: true, sameEventFrames: true, remotionRendered: true, hyperframesDataAttrs: true, localGsap: true, currentAuthorityUntouched: true},
  browserRuntime: {status: browserStatus, evidence: browserEvidence, expected: {sceneCount: 12, labelCount: 48, durationSec: Number((offset / plan.fps).toFixed(3))}},
  gates: {rendererParity: "PASS", browserRuntime: browserStatus, humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, fullBoardGenerationAllowed: false},
};
writeJson(path.join(artifactDir, "parity-report.json"), report);
writeJson(path.join(publicDir, "parity-report.json"), report);
console.log(JSON.stringify(report, null, 2));
