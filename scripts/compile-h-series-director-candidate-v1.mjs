#!/usr/bin/env node
/**
 * Canonical director scene -> existing H-series Remotion contract.
 *
 * The director candidate remains the source of truth. This compiler only
 * materializes the H renderer's strict frame/layer envelope so candidate
 * scenes can be reviewed without replacing the approved H-series props.
 */
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const candidatePath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-director-candidate-v1/candidate-render-props.json");
const scaffoldPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-director-candidate-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/h-series-director-candidate-v1");
const outputPath = path.join(artifactRoot, "h-series-render-props.json");
const publicOutputPath = path.join(publicRoot, "h-series-render-props.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const clean = (value = "", max = 80) => Array.from(String(value || "").replace(/\s+/gu, " ").trim()).slice(0, max).join("");
const tokenize = (value = "") => clean(value, 120).split(/[\s，。；：、,.;:!?！？]+/u).map((item) => clean(item, 14)).filter(Boolean);

for (const file of [candidatePath, scaffoldPath]) {
  if (!fs.existsSync(file)) throw new Error(`required-file-missing:${path.relative(root, file)}`);
}
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const candidate = readJson(candidatePath);
const scaffold = readJson(scaffoldPath);
const sourceScenes = Array.isArray(candidate.scenes) ? candidate.scenes : [];
const scaffoldScenes = Array.isArray(scaffold.scenes) ? scaffold.scenes : [];
if (!sourceScenes.length || !scaffoldScenes.length) throw new Error("candidate-or-scaffold-scenes-missing");

const samplesByFamily = new Map();
for (const scene of scaffoldScenes) {
  if (!samplesByFamily.has(scene.family)) samplesByFamily.set(scene.family, scene);
}
const FALLBACK_FAMILY = "type-statement";
const familyFor = (scene = {}) => {
  const text = `${scene.headline || ""} ${scene.body || ""} ${scene.article?.claim || ""}`;
  const form = scene.visualTreatment?.primaryVisualForm || "";
  if (scene.type === "closing" || /(?:好处|不是一键|自己风格|文章方向)/u.test(text)) return "direction-convergence";
  if (/(Codex|DeepSeek|Kimi|OpenAI|ChatGPT|Claude)/iu.test(text)) return "model-comparison";
  if (/(历史|保存|版本|回看)/u.test(text)) return "archive-stack";
  if (form === "vector-diagram" && scene.visualTreatment?.recordingReplaceable) return "insertion-flow";
  if (form === "vector-diagram") return "process-chain";
  if (form.includes("data") || scene.type === "data") return "process-chain";
  if (/(问题|废稿|AI 味|不说人话|泛泛而谈)/u.test(text)) return "annotation-judgement";
  if (scene.type === "quote") return "type-statement";
  return "editorial-metaphor";
};
const titleLinesFor = (scene = {}) => {
  const existing = (scene.titleLines || []).map((line) => clean(line, 18)).filter(Boolean).slice(0, 3);
  if (existing.length) return existing;
  const title = clean(scene.headline || scene.article?.screenText || "未命名镜头", 30);
  return title.length > 10 ? [title.slice(0, 10), title.slice(10, 20)].filter(Boolean) : [title];
};
const semanticVisualFor = (scene = {}) => {
  const text = `${scene.headline || ""} ${scene.body || ""} ${scene.article?.claim || ""}`;
  if (/(历史|版本|保留近五次|按文章分开)/u.test(text)) return {contract: "A1SemanticVisualStage/v1", kind: "archive", titleMode: "stage-owned", archive: {groupingLabel: "按文章分组", groups: [{label: "当前文章", items: ["当前稿", "近五次修改"]}, {label: "其他主题", items: ["独立历史", "按文章保存"]}]}};
  if (/(Codex|DeepSeek|Kimi|ChatGPT|Claude)/iu.test(text) && /(编排|整理|检查|写|调用|负责)/u.test(text)) return {contract: "A1SemanticVisualStage/v1", kind: "operation", titleMode: "stage-owned", operation: {object: "材料", action: clean(scene.headline || "工具编排", 16), result: "文章主线", badges: []}};
  if (/(为何|为什么|不让 AI 直接写|不说人话)/u.test(text)) return {contract: "A1SemanticVisualStage/v1", kind: "argument", titleMode: "stage-owned", argument: {mode: "question", counterpoints: ["直接写全文", "AI 不说人话", "需要人修改"]}};
  if (/(喜好|文章方向|自己风格)/u.test(text)) return {contract: "A1SemanticVisualStage/v1", kind: "argument", titleMode: "stage-owned", argument: {mode: "causal", counterpoints: [], cause: "喜好", effect: "文章方向", conclusion: "自己风格"}};
  if (/(划选|选择|点击|输入|双击|保存|收稿|补段|演示模式)/u.test(text)) {
    const flow = /划选|选择/u.test(text) ? ["原句", "划选", "修改"] : /输入|双击|补段/u.test(text) ? ["空白段落", "输入需求", "候选补写"] : /保存|历史/u.test(text) ? ["当前稿", "保存", "版本记录"] : /收稿/u.test(text) ? ["待收稿", "检查", "修改提示"] : ["正文", "调节", "口播节奏"];
    return {contract: "A1SemanticVisualStage/v1", kind: "operation", titleMode: "stage-owned", operation: {object: flow[0], action: flow[1], result: flow[2], badges: []}};
  }
  return null;
};
const scaleFrame = (frame, sourceDuration, targetDuration) => Math.max(0, Math.min(targetDuration - 1, Math.round((Number(frame) / Math.max(1, sourceDuration)) * targetDuration)));
const scaleRange = (range, sourceDuration, targetDuration) => {
  const start = scaleFrame(range[0], sourceDuration, targetDuration);
  const end = Math.min(targetDuration, Math.max(start + 1, scaleFrame(range[1], sourceDuration, targetDuration)));
  return [start, end];
};
const rescaleMotion = (scene, sourceDuration, targetDuration) => {
  sourceDuration = Math.max(1, Number(sourceDuration || targetDuration));
  scene.motionPlan.tracks = scene.motionPlan.tracks.map((track) => {
    const [startFrame, endFrame] = scaleRange([track.startFrame, track.endFrame], sourceDuration, targetDuration);
    return {...track, startFrame, endFrame};
  });
  for (const phase of Object.values(scene.motionPlan.phases)) {
    [phase.startFrame, phase.endFrame] = scaleRange([phase.startFrame, phase.endFrame], sourceDuration, targetDuration);
  }
  [scene.motionPlan.layoutMorph.startFrame, scene.motionPlan.layoutMorph.endFrame] = scaleRange([scene.motionPlan.layoutMorph.startFrame, scene.motionPlan.layoutMorph.endFrame], sourceDuration, targetDuration);
  scene.layers = scene.layers.map((layer) => ({
    ...layer,
    motion: {
      ...layer.motion,
      enter: scaleRange(layer.motion.enter, sourceDuration, targetDuration),
      hold: scaleRange(layer.motion.hold, sourceDuration, targetDuration),
      exit: scaleRange(layer.motion.exit, sourceDuration, targetDuration),
    },
  }));
};

let frameCursor = 0;
const manifestScenes = [];
const scenes = sourceScenes.map((sourceScene, index) => {
  const family = familyFor(sourceScene);
  const sample = clone(samplesByFamily.get(family) || samplesByFamily.get(FALLBACK_FAMILY) || scaffoldScenes[0]);
  const sampleDuration = sample.durationInFrames;
  const duration = Math.max(90, Math.min(180, Math.round(Number(sourceScene.frameDuration || sourceScene.duration * 30 || 120))));
  const titleLines = titleLinesFor(sourceScene);
  const semanticVisual = semanticVisualFor(sourceScene);
  const screenText = clean(sourceScene.article?.screenText || sourceScene.headline || titleLines.join(" "), 28);
  const supportTokens = [...new Set([...tokenize(sourceScene.headline), ...tokenize(sourceScene.body)])].slice(0, 4);
  while (supportTokens.length < 2) supportTokens.push(supportTokens[0] || "文章");
  const sourceStartMs = Math.round(frameCursor * (1000 / 30));
  const sourceEndMs = Math.round((frameCursor + duration) * (1000 / 30));
  const beatId = `DC-${String(index + 1).padStart(2, "0")}`;

  sample.beatId = beatId;
  sample.macroId = `DC${String(Math.floor(index / 4) + 1).padStart(2, "0")}`;
  sample.sourceStartMs = sourceStartMs;
  sample.sourceEndMs = sourceEndMs;
  sample.startFrame = frameCursor;
  sample.durationInFrames = duration;
  sample.screenText = screenText;
  sample.titleLines = titleLines;
  sample.supportTokens = supportTokens;
  sample.entityEvidence = [];
  sample.family = family;
  sample.route = clean(sourceScene.shotModule || sourceScene.visualTreatment?.rendererRoute || "semantic-director", 80);
  sample.recordingReplaceable = sourceScene.visualTreatment?.recordingReplaceable === true;
  if (semanticVisual) sample.semanticVisual = semanticVisual;
  sample.compositionVariant = index % 3;
  sample.presentation = {
    ...sample.presentation,
    label: clean(sourceScene.narrative?.storyRole || sourceScene.beat?.storyRole || "文章推进", 24),
    primary: clean(sourceScene.headline || screenText, 28),
    secondary: clean(sourceScene.body || sourceScene.article?.claim || "", 36),
    tokens: supportTokens.slice(0, 3),
    semanticDelta: clean(sourceScene.director?.coverageText || sourceScene.body || screenText, 80),
  };
  sample.layout.titleBox.maxLines = titleLines.length;
  sample.layout.typography.lines = titleLines;
  sample.layout.typography.lineWidths = titleLines.map((line) => Math.max(1, Array.from(line).length * sample.layout.typography.fontSize * 0.9));
  sample.layout.typography.blockWidth = Math.max(...sample.layout.typography.lineWidths);
  sample.layout.typography.blockHeight = titleLines.length * sample.layout.typography.fontSize * sample.layout.typography.lineHeight;
  sample.layout.typography.audit = {...sample.layout.typography.audit, semanticLines: true, blockers: []};
  rescaleMotion(sample, sampleDuration, duration);
  frameCursor += duration;
  manifestScenes.push({
    candidateSceneId: sourceScene.id,
    beatId,
    family,
    sourceText: clean(sourceScene.director?.coverageText || sourceScene.body || sourceScene.article?.claim || "", 220),
    visualForm: sourceScene.visualTreatment?.primaryVisualForm || "kinetic-typography",
    rendererRoute: sample.route,
    layoutPrimitive: sourceScene.layoutPrimitive?.id || null,
    recordingReplaceable: sample.recordingReplaceable,
    semanticStageKind: semanticVisual?.kind || null,
  });
  return sample;
});

const familyCounts = Object.fromEntries([...samplesByFamily.keys()].map((family) => [family, 0]));
for (const scene of scenes) familyCounts[scene.family] = (familyCounts[scene.family] || 0) + 1;
const renderProps = {
  ...scaffold,
  projectId: "h-series-director-candidate-v1",
  sourceProductionHash: hash(candidate.sourceText || ""),
  sourceVariationHash: hash(manifestScenes),
  reviewOnly: true,
  finalRenderAllowed: false,
  scenes,
  reviewBeatIds: scenes.slice(0, 12).map((scene) => scene.beatId),
  familyCounts,
};
renderProps.contentHash = hash({candidate: hash(candidate), scenes: manifestScenes});
const manifest = {
  contract: "A1DirectorToHSeriesAdapter/v1",
  status: "READY_FOR_STILL_REVIEW",
  reviewOnly: true,
  finalRenderAllowed: false,
  candidatePath: path.relative(root, candidatePath),
  candidateSha256: hash(candidate),
  scaffoldPath: path.relative(root, scaffoldPath),
  outputPath: path.relative(root, outputPath),
  outputSha256: hash(renderProps),
  sceneCount: scenes.length,
  scenes: manifestScenes,
};

writeJson(outputPath, renderProps);
writeJson(publicOutputPath, renderProps);
writeJson(path.join(artifactRoot, "h-series-render-adapter-manifest.json"), manifest);
writeJson(path.join(publicRoot, "h-series-render-adapter-manifest.json"), manifest);
console.log(JSON.stringify({status: manifest.status, sceneCount: manifest.sceneCount, output: manifest.outputPath, manifest: path.relative(root, path.join(artifactRoot, "h-series-render-adapter-manifest.json"))}, null, 2));
