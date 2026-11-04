#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "visual-system-proof-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const fail = (message) => { throw new Error(`visual-system-proof-parity:${message}`); };

const planPath = path.join(publicDir, "render-plan.json");
const buildReportPath = path.join(publicDir, "report.json");
const renderReportPath = path.join(publicDir, "render-report.json");
const htmlPath = path.join(publicDir, "hyperframes-proof.html");
const plan = readJson(planPath);
const buildReport = readJson(buildReportPath);
const renderReport = readJson(renderReportPath);
const html = fs.readFileSync(htmlPath, "utf8");

if (plan.contract !== "A1VisualSystemRenderProof/v1") fail(`contract:${plan.contract}`);
if (plan.sourceOfTruth !== "shared-motion-ir") fail(`source-of-truth:${plan.sourceOfTruth}`);
if (plan.scenes.length !== 3) fail(`scene-count:${plan.scenes.length}`);
if (buildReport.sourcePlanSha256 !== plan.sourcePlanSha256) fail("build-source-plan-sha");
if (renderReport.sourcePlanSha256 !== shaFile(planPath)) fail("render-plan-sha");
if (renderReport.remotion.compositionId !== plan.renderers.remotion.compositionId) fail("remotion-composition");
if (renderReport.remotion.durationInFrames !== plan.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0)) fail("duration");
if (!renderReport.currentAuthority?.unchanged) fail("current-authority-mutated");

let offset = 0;
const expectedEvents = [];
for (const scene of plan.scenes) {
  expectedEvents.push(...["enter", "emphasize", "hold"].map((state) => ({sceneId: scene.sceneId, familyId: scene.familyId, state, frame: offset + scene.eventFrames[state]})));
  offset += scene.durationInFrames;
}
const actualEvents = renderReport.eventFrames.map(({sceneId, familyId, state, frame}) => ({sceneId, familyId, state, frame}));
if (JSON.stringify(actualEvents) !== JSON.stringify(expectedEvents)) fail("remotion-event-frames");

const sceneChecks = plan.scenes.map((scene) => {
  const attrs = [
    `data-a1-scene-id="${scene.sceneId}"`,
    `data-a1-family-id="${scene.familyId}"`,
    `data-a1-font-id="${scene.fontId}"`,
    `data-a1-event-enter="${scene.eventFrames.enter}"`,
    `data-a1-event-emphasize="${scene.eventFrames.emphasize}"`,
    `data-a1-event-hold="${scene.eventFrames.hold}"`,
    `data-a1-event-handoff="${scene.eventFrames.handoff}"`,
  ];
  return {sceneId: scene.sceneId, familyId: scene.familyId, attrsPresent: attrs.every((attr) => html.includes(attr))};
});
if (sceneChecks.some((check) => !check.attrsPresent)) fail("hyperframes-scene-attrs");
if (!html.includes('data-a1-source-of-truth="shared-motion-ir"')) fail("hyperframes-source-of-truth");
if (!html.includes("window.__timelines['a1-visual-system-proof']")) fail("hyperframes-timeline-registration");
if (!html.includes("gsap.timeline")) fail("hyperframes-gsap-timeline");
if (!html.includes('src="/vendor/gsap/gsap.min.js"')) fail("hyperframes-local-gsap");
const labelCount = plan.scenes.length * 4;
if (!html.includes("data.sceneId+':enter'") || !html.includes("data.sceneId+':emphasize'") || !html.includes("data.sceneId+':hold'") || !html.includes("data.sceneId+':handoff'")) fail("hyperframes-label-definitions");

const browserRuntimeStatus = process.env.A1_VISUAL_SYSTEM_BROWSER_RUNTIME_STATUS || "PENDING";
const browserRuntimeEvidence = process.env.A1_VISUAL_SYSTEM_BROWSER_RUNTIME_EVIDENCE || null;
const report = {
  contract: "A1VisualSystemParityReport/v1",
  phaseId,
  status: "PASS",
  proofContract: plan.contract,
  sourceOfTruth: plan.sourceOfTruth,
  sourcePlanSha256: plan.sourcePlanSha256,
  proofPlanSha256: shaFile(planPath),
  checks: {
    sameSceneIds: true,
    sameFamilyIds: true,
    sameEventFrames: true,
    remotionRendered: renderReport.gates.remotionRendered === "PASS",
    hyperframesDataAttrs: sceneChecks.every((check) => check.attrsPresent),
    hyperframesTimelineRegistration: true,
    localGsapEmbedded: true,
    currentAuthorityUntouched: renderReport.currentAuthority.unchanged,
  },
  sceneChecks,
  browserRuntime: {
    status: browserRuntimeStatus,
    evidence: browserRuntimeEvidence,
    expected: {contract: "A1HyperFramesProof/v1", sceneCount: 3, labelCount, durationSec: Number((offset / plan.fps).toFixed(3))},
  },
  gates: {
    rendererParity: "PASS",
    browserRuntime: browserRuntimeStatus,
    humanVisualApproval: "PENDING",
    rendererAdoptionAllowed: false,
    fullBoardGenerationAllowed: false,
  },
};
writeJson(path.join(artifactDir, "parity-report.json"), report);
writeJson(path.join(publicDir, "parity-report.json"), report);
console.log(JSON.stringify(report, null, 2));
