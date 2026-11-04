#!/usr/bin/env node
/**
 * Build the Stage 2 LLM semantic judgement contract and current project queue.
 *
 * This script does not call a model. It creates a stable prompt/input/output
 * contract so the current heuristic Stage 2 can be replaced by real structured
 * semantic judgement without changing the storyboard pipeline again.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-stage2-llm-contract-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const manualQueuePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-manual-review-rewrite-queue-v1/report.json");
const heuristicDraftsPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-semantic-rewrite-drafts-v1/report.json");

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, value, "utf8");
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function sha256Value(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function compact(value, max = 180) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
}

function surroundingContext(scenes, index) {
  return {
    previous: scenes.slice(Math.max(0, index - 2), index).map((scene) => ({
      beatId: scene.beatId,
      screenText: compact(scene.screenText, 120),
      visualFocusText: compact(scene.storyboard?.visualFocusText || "", 60),
    })),
    current: {
      beatId: scenes[index].beatId,
      macroId: scenes[index].macroId,
      timeRangeMs: [scenes[index].sourceStartMs, scenes[index].sourceEndMs],
      screenText: compact(scenes[index].screenText, 240),
      titleLines: scenes[index].titleLines || [],
      visualFocusText: compact(scenes[index].storyboard?.visualFocusText || "", 80),
    },
    next: scenes.slice(index + 1, Math.min(scenes.length, index + 3)).map((scene) => ({
      beatId: scene.beatId,
      screenText: compact(scene.screenText, 120),
      visualFocusText: compact(scene.storyboard?.visualFocusText || "", 60),
    })),
  };
}

function priorityReason(scene, manualBeatIds, heuristicBeatIds) {
  if (manualBeatIds.has(scene.beatId)) return "manual-review-row-decision";
  if (heuristicBeatIds.has(scene.beatId)) return "heuristic-stage2-priority-sample";
  const fill = scene.storyboard?.semanticFill || {};
  if (fill.assetRoute === "gpt-editorial-artwork") return "generated-artwork-route-needs-model-justification";
  if (fill.status === "needs-source-check-or-text-fallback") return "source-or-fallback-route-needs-model-judgement";
  return "baseline-stage2-sampling";
}

const props = readJsonIfExists(storyboardPropsPath);
const manualQueue = readJsonIfExists(manualQueuePath);
const heuristicDrafts = readJsonIfExists(heuristicDraftsPath);
const blockers = [];

if (!props || !Array.isArray(props.scenes)) blockers.push({id: "missing-storyboard-props", detail: `Missing storyboard props: ${rel(storyboardPropsPath)}`});

const scenes = props?.scenes || [];
const manualBeatIds = new Set((manualQueue?.tasks || []).map((task) => task.beatId));
const heuristicBeatIds = new Set((heuristicDrafts?.drafts || []).map((draft) => draft.beatId));
const gptBeatIds = new Set(scenes.filter((scene) => scene.storyboard?.semanticFill?.assetRoute === "gpt-editorial-artwork").map((scene) => scene.beatId));
const sourceBeatIds = new Set(scenes.filter((scene) => scene.storyboard?.semanticFill?.status === "needs-source-check-or-text-fallback").map((scene) => scene.beatId));
const priorityBeatIds = new Set([...manualBeatIds, ...heuristicBeatIds, ...gptBeatIds, ...sourceBeatIds]);
const selected = scenes
  .map((scene, index) => ({scene, index}))
  .filter(({scene}) => priorityBeatIds.has(scene.beatId))
  .slice(0, 24);

const outputSchema = {
  contract: "A1StoryboardStage2LLMJudgement/v1",
  beatId: "string",
  cognitiveRole: "opening-orientation | question-or-doubt | operation-or-example | cause-effect-judgement | memory-or-archive | contrast-or-correction | closing-synthesis | supporting-explanation",
  visualFocusText: "short editable Chinese screen phrase, no fake evidence",
  intent: "why this shot exists in viewer cognition",
  fillWhat: "concrete visual content to fill into storyboard table",
  fillHow: "execution method, including deterministic vs generated route",
  assetRoute: "typography-only | deterministic-semantic-stage | deterministic-with-verified-entity | gpt-editorial-artwork",
  evidenceNeed: "none | verified-source-required | fallback-to-typography",
  motionJob: "semantic action motion task",
  layoutJob: "layout-safe production instruction",
  reason: "semantic reasoning grounded in current and surrounding subtitles",
  confidence: "number between 0 and 1",
  alternatives: ["alternative asset route or motion route"],
  rejectIf: ["generic visual", "unreadable screen text", "fake evidence", "route not grounded in subtitle context"],
};

const systemInstruction = [
  "You are Stage 2 semantic director for a Chinese article-to-motion storyboard.",
  "Decide the visual job from subtitle meaning and neighboring context, not from old cloned scene templates.",
  "The output must be structured JSON only and must match A1StoryboardStage2LLMJudgement/v1.",
  "Keep Chinese typography editable; never bake readable Chinese into generated raster artwork.",
  "Use GPT editorial artwork only for concepts/metaphors; use deterministic semantic stages for operations, argument structure, archive/memory, source-safe explanation, and process relationships.",
  "Use verified evidence only when the row references real products/entities/sources; never invent fake UI, fake charts, fake documents, logos, or official marks.",
  "If a sentence is strongest as language itself, choose typography-only and specify the exact screen phrase.",
].join("\n");

const jobs = selected.map(({scene, index}) => {
  const fill = scene.storyboard?.semanticFill || {};
  const input = {
    contract: "A1StoryboardStage2LLMInput/v1",
    beatId: scene.beatId,
    priorityReason: priorityReason(scene, manualBeatIds, heuristicBeatIds),
    context: surroundingContext(scenes, index),
    currentStoryboardRow: {
      semanticDecision: scene.storyboard?.semanticDecision || null,
      presentation: scene.presentation || null,
      family: scene.family || null,
      semanticFill: fill,
      artworkPipeline: scene.storyboard?.artworkPipeline || null,
      motionPlan: scene.motionPlan || null,
    },
    requiredOutputSchema: outputSchema,
  };
  return {
    id: `stage2-llm-job-${scene.beatId}`,
    beatId: scene.beatId,
    macroId: scene.macroId,
    priorityReason: input.priorityReason,
    promptSha256: sha256Value({systemInstruction, input}),
    systemInstruction,
    input,
    expectedOutputContract: outputSchema.contract,
  };
});

const contract = {
  contract: "A1StoryboardStage2LLMContract/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : jobs.length ? "READY" : "EMPTY",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  paidApiAllowed: false,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    storyboardPropsSha256: sha256File(storyboardPropsPath),
    manualQueuePath: rel(manualQueuePath),
    heuristicDraftsPath: rel(heuristicDraftsPath),
  },
  modelPolicy: {
    preferred: "Codex-or-ChatGPT-subscription-structured-output",
    paidApiAllowed: false,
    fallback: "local-heuristic-stage2-drafts-remain-review-only",
  },
  outputSchema,
  systemInstruction,
};

const queue = {
  contract: "A1StoryboardStage2LLMQueue/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : jobs.length ? "READY_FOR_LLM_JUDGEMENT" : "EMPTY",
  generatedAt: contract.generatedAt,
  source: contract.source,
  summary: {
    sceneCount: scenes.length,
    jobCount: jobs.length,
    blockerCount: blockers.length,
    byPriorityReason: jobs.reduce((acc, job) => {
      acc[job.priorityReason] = (acc[job.priorityReason] || 0) + 1;
      return acc;
    }, {}),
  },
  blockers,
  jobs,
  inbox: {
    path: `apps/studio-next/public/generated/system-line/${phaseId}/inbox`,
    expectedFiles: jobs.map((job) => `${job.beatId}.json`),
  },
  nextAction: jobs.length
    ? "produce-structured-llm-judgement-json-files-then-import"
    : "record-manual-row-decisions-or-build-heuristic-stage2-drafts",
};

const md = [
  "# Storyboard Stage 2 LLM Contract v1",
  "",
  `Status: ${contract.status}`,
  "",
  "## Model policy",
  "",
  `- preferred: ${contract.modelPolicy.preferred}`,
  `- paid API allowed: ${contract.modelPolicy.paidApiAllowed}`,
  `- fallback: ${contract.modelPolicy.fallback}`,
  "",
  "## Queue",
  "",
  `- jobs: ${queue.summary.jobCount}`,
  `- blockers: ${queue.summary.blockerCount}`,
  "",
  "## Required output",
  "",
  "```json",
  JSON.stringify(outputSchema, null, 2),
  "```",
  "",
  "## Jobs",
  "",
  ...(jobs.length ? jobs.map((job, index) => `- ${index + 1}. ${job.beatId}: ${job.priorityReason}`) : ["- no jobs"]),
  "",
].join("\n");

for (const base of [artifactRoot, publicRoot]) fs.mkdirSync(path.join(base, "inbox"), {recursive: true});
writeJson(path.join(artifactRoot, "contract.json"), contract);
writeJson(path.join(publicRoot, "contract.json"), contract);
writeJson(path.join(artifactRoot, "queue.json"), queue);
writeJson(path.join(publicRoot, "queue.json"), queue);
writeText(path.join(artifactRoot, "contract.md"), md);
writeText(path.join(publicRoot, "contract.md"), md);

console.log(JSON.stringify({
  status: queue.status,
  summary: queue.summary,
  contractPath: rel(path.join(artifactRoot, "contract.json")),
  queuePath: rel(path.join(artifactRoot, "queue.json")),
  publicQueuePath: rel(path.join(publicRoot, "queue.json")),
  nextAction: queue.nextAction,
}, null, 2));
