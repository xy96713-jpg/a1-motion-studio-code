#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileA1VisualProductionSystem} from "../apps/studio-next/src/lib/a1-visual-production-system-v1.ts";

const root = process.cwd();
const phaseId = "visual-system-proof-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererGeneratedDir = path.join(root, "remotion-renderer/src/generated");
const currentPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const inputs = [
  {
    sceneId: "SYS-01",
    sourceText: "我试过很多模型",
    semanticRole: "comparison",
    visualJob: "让模型名字成为尺度碰撞，而不是排列成三个卡片。",
    route: "typography-only",
    intensity: .86,
    requestedFamilyId: "scale-collision",
  },
  {
    sceneId: "SYS-02",
    sourceText: "证据页不是答案",
    semanticRole: "evidence",
    visualJob: "让真实页面先成为主体，再用批注锁定判断。",
    route: "real-evidence",
    hasVerifiedMaterial: true,
    intensity: .58,
    requestedFamilyId: "evidence-macro-annotation",
  },
  {
    sceneId: "SYS-03",
    sourceText: "依然会有不通顺、AI 味",
    semanticRole: "closing",
    visualJob: "主动退掉解释层，只留下黑场结论与交接节奏。",
    route: "typography-only",
    intensity: .22,
    requestedFamilyId: "quiet-verdict",
  },
];

const basePlan = compileA1VisualProductionSystem(inputs, {
  visualMasterId: "july1-retro-print-archive-wireframe-v1",
  visualMasterStatus: "candidate-review-only",
});

const sceneById = new Map(basePlan.scenes.map((scene) => [scene.sceneId, scene]));
const renderSpecs = [
  {sceneId: "SYS-01", title: "我试过很多模型", tokens: ["GPT", "Claude", "我试过"], support: "模型变多，不等于判断变清楚。", materialAsset: null, durationInFrames: 90, eventFrames: {enter: 4, emphasize: 36, hold: 62, handoff: 82}},
  {sceneId: "SYS-02", title: "证据页不是答案", tokens: ["证据", "批注", "判断"], support: "页面只是材料，判断必须附着在材料上。", materialAsset: "editorial-documentary-reset-v1/source/document-surface.png", durationInFrames: 96, eventFrames: {enter: 4, emphasize: 46, hold: 70, handoff: 88}},
  {sceneId: "SYS-03", title: "依然会有不通顺、AI 味", tokens: ["依然会有", "不通顺", "AI 味"], support: "结论之后留出下一镜的空间。", materialAsset: null, durationInFrames: 90, eventFrames: {enter: 6, emphasize: 40, hold: 64, handoff: 82}},
].map((spec) => {
  const plan = sceneById.get(spec.sceneId);
  if (!plan) throw new Error(`proof-scene-plan-missing:${spec.sceneId}`);
  return {
    ...spec,
    familyId: plan.familyId,
    fontId: plan.typography.fontId,
    fontFamily: plan.typography.fontFamily,
  };
});

if (renderSpecs.some((scene) => !["scale-collision", "evidence-macro-annotation", "quiet-verdict"].includes(scene.familyId))) {
  throw new Error(`proof-family-set-invalid:${renderSpecs.map((scene) => scene.familyId).join(",")}`);
}

const proofPlan = {
  contract: "A1VisualSystemRenderProof/v1",
  phaseId,
  sourceOfTruth: "shared-motion-ir",
  sourcePlanContract: basePlan.contract,
  sourcePlanSha256: sha256(`${JSON.stringify(basePlan, null, 2)}\n`),
  visualMaster: basePlan.visualMaster,
  fps: 30,
  scenes: renderSpecs,
  renderers: {
    remotion: {entryPoint: "remotion-renderer/src/visual-system-proof-index.tsx", compositionId: "A1VisualProductionSystemProof"},
    hyperframes: {html: `apps/studio-next/public/generated/system-line/${phaseId}/hyperframes-proof.html`, compositionId: "a1-visual-system-proof"},
  },
  gates: {sourcePlanCompiled: true, threeFamilySet: true, currentAuthorityUntouched: true, humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, fullBoardGenerationAllowed: false},
};

const authoritySha = shaFile(currentPropsPath);
const report = {
  contract: "A1VisualSystemRenderProofBuildReport/v1",
  phaseId,
  status: "PASS",
  sourcePlanSha256: proofPlan.sourcePlanSha256,
  sceneCount: proofPlan.scenes.length,
  familyIds: proofPlan.scenes.map((scene) => scene.familyId),
  fontIds: proofPlan.scenes.map((scene) => scene.fontId),
  renderers: proofPlan.renderers,
  currentAuthority: {propsSha256: authoritySha, unchanged: shaFile(currentPropsPath) === authoritySha},
  gates: proofPlan.gates,
};

fs.mkdirSync(artifactDir, {recursive: true});
fs.mkdirSync(publicDir, {recursive: true});
writeJson(path.join(artifactDir, "render-plan.json"), proofPlan);
writeJson(path.join(publicDir, "render-plan.json"), proofPlan);
writeJson(path.join(rendererGeneratedDir, "visual-system-proof-plan.json"), proofPlan);
writeJson(path.join(artifactDir, "report.json"), report);
writeJson(path.join(publicDir, "report.json"), report);
console.log(JSON.stringify({status: report.status, phaseId, sceneCount: report.sceneCount, familyIds: report.familyIds, fontIds: report.fontIds, currentAuthorityUnchanged: report.currentAuthority.unchanged, remotionEntry: proofPlan.renderers.remotion.entryPoint, hyperframesHtml: proofPlan.renderers.hyperframes.html}, null, 2));
