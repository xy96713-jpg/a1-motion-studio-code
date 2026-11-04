#!/usr/bin/env node
/**
 * Build a stable handoff pack for ChatGPT web image generation.
 *
 * This does not control a browser. It writes a manifest plus copy/paste prompts
 * so generated images can later be imported by hash-bound beat IDs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const phaseId = "storyboard-webgpt-artwork-bridge-v1";
const defaultPlanPath = ".codex-artifacts/system-progress-system-line/h-series-generated-editorial-artwork-execution-plan-v1/report.json";
const currentStoryboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);

function argValue(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFileBoth(relativePath, content) {
  const privatePath = path.join(artifactRoot, relativePath);
  const publicPath = path.join(publicRoot, relativePath);
  fs.mkdirSync(path.dirname(privatePath), {recursive: true});
  fs.mkdirSync(path.dirname(publicPath), {recursive: true});
  fs.writeFileSync(privatePath, content, "utf8");
  fs.writeFileSync(publicPath, content, "utf8");
  return {privatePath, publicPath};
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compact(value = "", max = 120) {
  const normalized = String(value || "").replace(/\s+/gu, " ").trim();
  return Array.from(normalized).slice(0, max).join("");
}

const planPath = path.resolve(root, argValue("--source-plan", defaultPlanPath));
if (!fs.existsSync(currentStoryboardPropsPath)) throw new Error(`current storyboard props not found: ${path.relative(root, currentStoryboardPropsPath)}`);

const currentStoryboardProps = readJson(currentStoryboardPropsPath);
const currentStoryboardPropsSha256 = sha256File(currentStoryboardPropsPath);
const sourcePlan = fs.existsSync(planPath) ? readJson(planPath) : null;

function promptForScene(scene, index) {
  const fill = scene.storyboard?.semanticFill || {};
  const focus = compact(scene.storyboard?.visualFocusText || scene.presentation?.primary || scene.screenText || scene.beatId, 80);
  const concept = compact(fill.fillWhat || focus, 260);
  const method = compact(fill.fillHow || "", 260);
  const expectedFileName = `${String(index + 1).padStart(2, "0")}-${scene.beatId}.png`;
  return [
    `IMAGE ${String(index + 1).padStart(2, "0")} / ${scene.beatId}`,
    `Save/export filename: ${expectedFileName}`,
    "",
    `A1 H-series generated editorial artwork job ${index + 1}.`,
    `Beat: ${scene.beatId}. Concept: ${focus}. Role: ${compact(scene.storyboard?.artworkPipeline?.role || "text-free editorial concept asset", 80)}.`,
    "Create a single text-free 16:9 editorial raster asset only.",
    "Visual style: retro print archive wireframe like the approved blue/green references; cool off-white or light gray paper, cobalt blue or archive green single-color ink, xerox/halftone grain, sparse structural wireframe, tactile print texture. Avoid sepia, old yellow parchment, brown vintage paper, fake aged manuscript color, or generic AI gradients.",
    `Composition job: ${concept}`,
    method ? `Execution constraint: ${method}` : "",
    "Abstraction rule: use symbolic objects, diagrams, archives, paths, machines, marks, voids, wireframes, or geometric metaphors. Do not generate human heads, faces, bodies, mannequins, skulls, portraits, hands, or character-like figures.",
    "Leave strong negative space for editable Chinese typography added later by the renderer.",
    "Forbidden: readable Chinese or English, captions, UI labels, fake documents, fake screenshots, fake charts, fake logos, fake official marks, watermarks, random decorative blue lines, human head, face, body, portrait, mannequin, skull, character figure.",
    "The image is a non-evidence conceptual artwork. It must not look like a real source, real UI, real product mark, legal document, webpage, report, or data proof.",
    "",
    "Output requirements: one 16:9 PNG, text-free, no logos, no fake UI, no fake evidence.",
  ].filter(Boolean).join("\n");
}

const jobs = (currentStoryboardProps.scenes || [])
  .filter((scene) => scene.storyboard?.semanticFill?.assetRoute === "gpt-editorial-artwork")
  .filter((scene) => scene.storyboard?.semanticFill?.status === "needs-artwork-generation")
  .filter((scene) => !["pending-visual-review", "adopted"].includes(scene.storyboard?.artworkStatus || ""))
  .map((scene, index) => {
    const expectedFileName = `${String(index + 1).padStart(2, "0")}-${scene.beatId}.png`;
    const prompt = promptForScene(scene, index);
    return {
      id: `webgpt-${String(index + 1).padStart(3, "0")}-${scene.beatId}`,
      index: index + 1,
      beatId: scene.beatId,
      macroId: scene.macroId,
      screenText: scene.storyboard?.visualFocusText || scene.presentation?.primary || scene.screenText,
      sourceText: scene.screenText,
      promptRole: scene.storyboard?.artworkPipeline?.role || "text-free editorial concept asset",
      slotId: `${scene.beatId}:gpt-editorial-artwork`,
      cacheKey: sha256Text(`${currentStoryboardPropsSha256}:${scene.beatId}:${scene.storyboard?.semanticFill?.fillWhat || ""}`),
      sourcePromptSha256: null,
      prompt,
      promptSha256: sha256Text(prompt),
      expectedFileName,
      acceptedFileNamePatterns: [
        expectedFileName,
        `${scene.beatId}.png`,
        `${scene.beatId}-*.png`,
        `*-${scene.beatId}-*.png`,
      ],
    };
  });

const currentBeatIds = new Set((currentStoryboardProps.scenes || []).map((scene) => scene.beatId));
const missingCurrentJobs = jobs.filter((job) => !currentBeatIds.has(job.beatId));
if (missingCurrentJobs.length) {
  throw new Error(`webgpt jobs missing from current storyboard: ${missingCurrentJobs.map((job) => job.beatId).join(",")}`);
}

const batchPrompt = [
  "# A1 storyboard artwork batch for ChatGPT web",
  "",
  "请一次生成下面这些图片。每张图必须是独立 16:9 PNG、无文字、无 logo、无假界面、无假证据。",
  "统一风格：H-series retro print archive wireframe；暖白纸、炭黑墨、复印颗粒、稀疏线框、钴蓝只作为语义选择/方向信号。",
  "请按每个任务的 filename 导出或在回复中标注对应编号。生成后下载图片并放入项目 inbox。",
  "",
  `Job count: ${jobs.length}`,
  "",
  ...jobs.map((job) => [
    `## ${String(job.index).padStart(2, "0")} ${job.beatId}`,
    `filename: ${job.expectedFileName}`,
    `screenText: ${compact(job.screenText, 80)}`,
    "",
    job.prompt,
  ].join("\n")),
  "",
].join("\n\n");

const manifest = {
  contract: "A1StoryboardWebGPTArtworkBridge/v1",
  phaseId,
  status: jobs.length ? "READY_FOR_ARTWORK_GENERATION" : "EMPTY",
  generatedAt: new Date().toISOString(),
  provider: "chatgpt-web",
  providerMode: "browser-automation-persistent-conversation",
  sourcePlan: {
    path: path.relative(root, planPath),
    sha256: fs.existsSync(planPath) ? sha256File(planPath) : null,
    contract: sourcePlan?.contract || null,
    status: sourcePlan?.status || null,
    usedForJobs: false,
  },
  currentStoryboard: {
    propsPath: path.relative(root, currentStoryboardPropsPath),
    propsSha256: currentStoryboardPropsSha256,
    sceneCount: Array.isArray(currentStoryboardProps.scenes) ? currentStoryboardProps.scenes.length : null,
    matchedJobCount: jobs.filter((job) => currentBeatIds.has(job.beatId)).length,
  },
  projectId: "july1-writing-workbench",
  visualMasterId: "july1-retro-print-archive-wireframe-v1",
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  browserAutomationRequired: true,
  browserAutomation: {
    browser: "chrome-extension",
    conversationId: "6a6700c8-b860-83e8-ac67-150e7c406162",
    maxConcurrentJobs: 1,
    sendMode: "fill-click-send-wait-page-assets",
  },
  policy: {
    noPaidImageApi: true,
    noAppleScriptBrowserControl: true,
    browserAutomationUsesChromeExtension: true,
    generatedArtworkIsNonEvidence: true,
    importedImagesRequireHashBinding: true,
    importOnlyUpdatesStoryboardDraft: true,
  },
  paths: {
    privateRoot: path.relative(root, artifactRoot),
    publicRoot: path.relative(root, publicRoot),
    batchPromptPath: path.relative(root, path.join(artifactRoot, "batch-prompt.md")),
    inboxPath: path.relative(root, path.join(publicRoot, "inbox")),
  },
  summary: {
    jobCount: jobs.length,
    promptCount: jobs.length,
    allJobsExistInCurrentStoryboard: jobs.every((job) => currentBeatIds.has(job.beatId)),
    allPromptsTextFree: jobs.every((job) => /text-free|无文字/iu.test(job.prompt)),
    uniqueExpectedFileNames: new Set(jobs.map((job) => job.expectedFileName)).size === jobs.length,
  },
  jobs,
  nextAction: jobs.length ? "generate-with-persistent-chatgpt-conversation-then-import" : "webgpt-artwork-generation-not-needed",
};

fs.mkdirSync(path.join(publicRoot, "inbox"), {recursive: true});
fs.writeFileSync(path.join(publicRoot, "inbox", "PUT_CHATGPT_IMAGES_HERE.txt"), [
  "把 Codex 生成的 PNG 放在这个目录。",
  "推荐文件名见 ../manifest.json 的 expectedFileName，例如 01-H03-B02.png。",
  "然后运行：npm run import:storyboard-webgpt-artwork -- --input-dir apps/studio-next/public/generated/system-line/storyboard-webgpt-artwork-bridge-v1/inbox",
  "",
].join("\n"), "utf8");

writeFileBoth("batch-prompt.md", batchPrompt);
writeFileBoth("manifest.json", stableJson(manifest));
for (const job of jobs) {
  writeFileBoth(`prompts/${String(job.index).padStart(2, "0")}-${job.beatId}.txt`, `${job.prompt}\n`);
}

console.log(JSON.stringify({
  status: manifest.status,
  jobCount: jobs.length,
  batchPromptPath: manifest.paths.batchPromptPath,
  inboxPath: manifest.paths.inboxPath,
  nextAction: manifest.nextAction,
}, null, 2));
