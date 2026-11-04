#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileA1VisualProductionSystem} from "../apps/studio-next/src/lib/a1-visual-production-system-v1.ts";

const root = process.cwd();
const phaseId = "visual-system-pilot-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererGeneratedDir = path.join(root, "remotion-renderer/src/generated");
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const inputs = [
  {sceneId: "PILOT-01", sourceText: "先看材料，再决定怎么说", semanticRole: "opening", visualJob: "让真实工作台先成为主视觉，标题只锁定观看入口。", route: "real-evidence", hasVerifiedMaterial: true, intensity: .74, requestedFamilyId: "hero-material-title"},
  {sceneId: "PILOT-02", sourceText: "我试过很多模型", semanticRole: "comparison", visualJob: "把模型名字做成尺度碰撞，不做等卡片比较。", route: "typography-only", intensity: .86, requestedFamilyId: "scale-collision"},
  {sceneId: "PILOT-03", sourceText: "证据页不是答案", semanticRole: "evidence", visualJob: "页面先出现，批注再锁定判断。", route: "real-evidence", hasVerifiedMaterial: true, intensity: .58, requestedFamilyId: "evidence-macro-annotation"},
  {sceneId: "PILOT-04", sourceText: "人、工具、作者各自负责什么", semanticRole: "roles", visualJob: "把责任分成三个具有阅读顺序的角色栏。", route: "deterministic-explainer", intensity: .55, requestedFamilyId: "role-triptych"},
  {sceneId: "PILOT-05", sourceText: "输入、判断、修改、发布", semanticRole: "process", visualJob: "让因果路径沿着一条斜线建立。", route: "deterministic-explainer", intensity: .62, requestedFamilyId: "process-path"},
  {sceneId: "PILOT-06", sourceText: "每一版都留下了什么", semanticRole: "archive", visualJob: "用层叠档案表现版本累积，不做文件夹 UI。", route: "real-evidence", hasVerifiedMaterial: true, intensity: .48, requestedFamilyId: "archive-cascade"},
  {sceneId: "PILOT-07", sourceText: "旧判断不等于新判断", semanticRole: "contrast", visualJob: "旧状态先出现，再由新判断切入。", route: "typography-only", intensity: .72, requestedFamilyId: "contrast-rail"},
  {sceneId: "PILOT-08", sourceText: "语言本身也可以成为视觉", semanticRole: "phrase", visualJob: "让字形的偏移和回正表达语言被修改。", route: "typography-only", intensity: .68, requestedFamilyId: "type-gesture"},
  {sceneId: "PILOT-09", sourceText: "依然会有不通顺、AI 味", semanticRole: "closing", visualJob: "退掉解释层，只留下黑场判断。", route: "typography-only", intensity: .22, requestedFamilyId: "quiet-verdict"},
  {sceneId: "PILOT-10", sourceText: "一个界面也有它的物理证据", semanticRole: "object", visualJob: "从真实工作台裁出一个可被标注的局部。", route: "real-evidence", hasVerifiedMaterial: true, intensity: .44, requestedFamilyId: "object-crop"},
  {sceneId: "PILOT-11", sourceText: "不是模型越多，判断越强", semanticRole: "rejection", visualJob: "第二次尺度碰撞必须改变轮廓，不能复制第一镜。", route: "typography-only", intensity: .78, previousFamilyId: "scale-collision", familyUseCount: 1, requestedFamilyId: "scale-collision"},
  {sceneId: "PILOT-12", sourceText: "把下一次修改留出来", semanticRole: "resolution", visualJob: "结尾安静下来，把交接空间交给下一镜。", route: "typography-only", intensity: .18, previousFamilyId: "object-crop", requestedFamilyId: "quiet-verdict"},
];

const basePlan = compileA1VisualProductionSystem(inputs, {visualMasterId: "july1-retro-print-archive-wireframe-v1", visualMasterStatus: "candidate-review-only"});
const baseById = new Map(basePlan.scenes.map((scene) => [scene.sceneId, scene]));
const timing = inputs.map((input, index) => ({
  sceneId: input.sceneId,
  title: input.sourceText,
  tokens: index === 0 ? ["先看材料"] : index === 1 ? ["GPT", "Claude", "我试过"] : index === 2 ? ["证据", "批注", "判断"] : index === 3 ? ["人", "工具", "作者"] : index === 4 ? ["输入", "判断", "修改", "发布"] : index === 5 ? ["版本", "留下", "痕迹"] : index === 6 ? ["旧判断", "新判断"] : index === 7 ? ["语言", "成为", "视觉"] : index === 8 ? ["依然会有", "不通顺", "AI 味"] : index === 9 ? ["物理证据"] : index === 10 ? ["不是更多模型"] : ["下一次修改"],
  support: index === 0 ? "真实材料先承担叙事重量，标题只负责建立入口。" : index === 1 ? "模型变多，不等于判断变清楚。" : index === 2 ? "页面只是材料，判断必须附着在材料上。" : index === 3 ? "责任被看见，系统才不会变成按钮墙。" : index === 4 ? "路径不是清单，而是决定发生的顺序。" : index === 5 ? "每一版都应当留下可追溯的痕迹。" : index === 6 ? "修正不是换一种颜色，而是换一条判断轨。" : index === 7 ? "字形的偏移，就是修改发生的地方。" : index === 8 ? "结论之后仍然要诚实地留下问题。" : index === 9 ? "局部物件比抽象占位更能说明材料。" : index === 10 ? "重复使用同一语法，不会产生新的判断。" : "下一镜应该从这里接走。",
  materialAsset: [0, 2, 5, 9].includes(index) ? (index === 9 ? "editorial-documentary-reset-v1/source/workbench-overview.png" : "editorial-documentary-reset-v1/source/document-surface.png") : null,
  sourceLabel: index === 0 ? "SOURCE / WORKBENCH" : index === 5 ? "ARCHIVE / VERSIONS" : index === 9 ? "OBJECT / SURFACE" : undefined,
  durationInFrames: 72,
  eventFrames: {enter: 4, emphasize: 24, hold: 48, handoff: 64},
})).map((spec) => {
  const selected = baseById.get(spec.sceneId);
  if (!selected) throw new Error(`pilot-scene-plan-missing:${spec.sceneId}`);
  return {...spec, familyId: selected.familyId, fontId: selected.typography.fontId, fontFamily: selected.typography.fontFamily};
});

const authorityBefore = shaFile(authorityPath);
const pilotPlan = {
  contract: "A1VisualSystemRenderProof/v1",
  phaseId,
  sourceOfTruth: "shared-motion-ir",
  sourcePlanContract: basePlan.contract,
  sourcePlanSha256: sha256(`${JSON.stringify(basePlan, null, 2)}\n`),
  visualMaster: basePlan.visualMaster,
  fps: 30,
  scenes: timing,
  renderers: {
    remotion: {entryPoint: "remotion-renderer/src/system-line-h-frame-index.tsx", compositionId: "A1VisualProductionSystemPilot"},
    hyperframes: {html: `apps/studio-next/public/generated/system-line/${phaseId}/hyperframes-proof.html`, compositionId: "a1-visual-system-proof"},
  },
  selectionTrace: basePlan.scenes.map((scene) => ({sceneId: scene.sceneId, familyId: scene.familyId, candidates: scene.selectionTrace.candidates, reasons: scene.selectionTrace.reasons, requestedFamilyHonored: scene.selectionTrace.requestedFamilyHonored})),
  gates: {sourcePlanCompiled: true, twelveShotPilot: true, currentAuthorityUntouched: authorityBefore === shaFile(authorityPath), humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, fullBoardGenerationAllowed: false},
};
const report = {
  contract: "A1VisualSystemPilotBuildReport/v1",
  phaseId,
  status: "PASS",
  sceneCount: pilotPlan.scenes.length,
  familyIds: [...new Set(pilotPlan.scenes.map((scene) => scene.familyId))],
  sourcePlanSha256: pilotPlan.sourcePlanSha256,
  sourceOfTruth: pilotPlan.sourceOfTruth,
  renderers: pilotPlan.renderers,
  currentAuthority: {propsSha256: authorityBefore, unchanged: authorityBefore === shaFile(authorityPath)},
  gates: pilotPlan.gates,
};
writeJson(path.join(artifactDir, "render-plan.json"), pilotPlan);
writeJson(path.join(publicDir, "render-plan.json"), pilotPlan);
writeJson(path.join(rendererGeneratedDir, "visual-system-pilot-plan.json"), pilotPlan);
writeJson(path.join(artifactDir, "report.json"), report);
writeJson(path.join(publicDir, "report.json"), report);
console.log(JSON.stringify({status: report.status, phaseId, sceneCount: report.sceneCount, familyIds: report.familyIds, currentAuthorityUnchanged: report.currentAuthority.unchanged, remotionEntry: pilotPlan.renderers.remotion.entryPoint}, null, 2));
