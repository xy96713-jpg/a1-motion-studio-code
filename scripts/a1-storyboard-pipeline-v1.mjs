#!/usr/bin/env node
/**
 * A1 storyboard preview pipeline.
 *
 * One command turns an article draft into the isolated /storyboard review
 * surface without mutating the system-line 540p review authority props.
 */
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const optionValueIndexes = new Set();
for (let index = 0; index < args.length; index += 1) {
  if (args[index]?.startsWith("--") && args[index + 1] && !args[index + 1].startsWith("--")) {
    optionValueIndexes.add(index + 1);
  }
}
const articleArg = args.find((arg, index) => !arg.startsWith("--") && !optionValueIndexes.has(index));

function usage() {
  console.error([
    "Usage:",
    "  node scripts/a1-storyboard-pipeline-v1.mjs <article.txt> --stage preview [--srt file.srt]",
    "  node scripts/a1-storyboard-pipeline-v1.mjs <article.txt> --stage preview --source-props remotion-renderer/src/generated/microbeatLayeredFullProps.json",
    "  node scripts/a1-storyboard-pipeline-v1.mjs <article.txt> --stage revise [--only H03-B02]",
    "",
    "Stages: semantic | stills | publish | quality | gates | preview | revise | all",
    "Options:",
    "  --srt <path>           Optional SRT for semantic generation",
    "  --source-props <path>  Use existing props instead of running semantic generation",
    "  --out-props <path>     Semantic output props path",
    "  --review-notes <path>  Review notes file for revise stage",
    "  --only <ids>           Comma-separated beat ids for still rendering",
    "  --force               Re-run cacheable stages",
    "  --model <name>         Semantic generator model",
  ].join("\n"));
}

function argValue(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeTail(text, max = 6000) {
  if (!text) return "";
  return text.length <= max ? text : text.slice(text.length - max);
}

function commandText(cmd, commandArgs) {
  return [cmd, ...commandArgs].join(" ");
}

function runCommand(step, cmd, commandArgs) {
  const startedAt = new Date().toISOString();
  console.log(`\n[${step}] ${commandText(cmd, commandArgs)}`);
  const startedMs = Date.now();
  const result = spawnSync(cmd, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const completedAt = new Date().toISOString();
  const wallClockMs = Date.now() - startedMs;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    step,
    command: commandText(cmd, commandArgs),
    status: result.status === 0 ? "PASS" : "BLOCKED",
    exitCode: result.status,
    startedAt,
    completedAt,
    wallClockMs,
    stdoutTail: safeTail(result.stdout),
    stderrTail: safeTail(result.stderr),
  };
}

if (!articleArg) {
  usage();
  process.exit(1);
}

const articlePath = path.resolve(root, articleArg);
if (!fs.existsSync(articlePath)) {
  throw new Error(`article-not-found:${articlePath}`);
}

const stageArg = argValue("--stage", "preview");
const force = hasFlag("--force");
const srtArg = argValue("--srt");
const modelArg = argValue("--model");
const sourcePropsArg = argValue("--source-props");
const rawOnlyArg = argValue("--only", "");
const reviewNotesArg = argValue("--review-notes");

const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-pipeline-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-pipeline-v1");
const manifestPath = path.join(artifactRoot, "manifest.json");
const publicManifestPath = path.join(publicRoot, "manifest.json");
const defaultOutProps = path.join(artifactRoot, "candidate-storyboard-props.json");
const currentStoryboardProps = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const outProps = path.resolve(root, argValue("--out-props", defaultOutProps));
const sourceProps = sourcePropsArg
  ? path.resolve(root, sourcePropsArg)
  : ["revise", "quality", "gates"].includes(stageArg) && fs.existsSync(currentStoryboardProps) ? currentStoryboardProps : null;
const activeProps = sourceProps || outProps;
const storyboardManifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const reviewNotesPath = path.resolve(root, reviewNotesArg || "apps/studio-next/public/generated/storyboard/current/review-notes.json");

function readOpenReviewNotes(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const value = readJson(filePath);
  if (value?.contract !== "A1StoryboardReviewNotes/v1" || !Array.isArray(value.notes)) {
    throw new Error(`invalid-review-notes:${rel(filePath)}`);
  }
  const currentSha = fs.existsSync(storyboardManifestPath) ? readJson(storyboardManifestPath)?.current?.propsSha256 : null;
  if (value.storyboardPropsSha256 && currentSha && value.storyboardPropsSha256 !== currentSha) {
    throw new Error(`stale-review-notes:${rel(filePath)}:${value.storyboardPropsSha256}:current:${currentSha}`);
  }
  return value.notes.filter((note) => note?.status === "open" && typeof note.beatId === "string");
}

const reviewNotes = stageArg === "revise" ? readOpenReviewNotes(reviewNotesPath) : [];
const reviewNoteBeatIds = Array.from(new Set(reviewNotes.map((note) => note.beatId))).sort((a, b) => a.localeCompare(b, "en"));
const onlyBeatIds = rawOnlyArg
  ? rawOnlyArg.split(",").map((item) => item.trim()).filter(Boolean)
  : stageArg === "revise" ? reviewNoteBeatIds : [];
const onlyArg = onlyBeatIds.join(",");

const stageMap = {
  semantic: ["semantic"],
  stills: ["stills"],
  publish: ["publish"],
  quality: ["quality"],
  gates: ["gates"],
  preview: ["semantic", "stills", "publish", "quality", "gates"],
  revise: ["revise", "stills", "publish", "quality", "gates"],
  all: ["semantic", "stills", "publish", "quality", "gates"],
};
const requestedStages = stageMap[stageArg];
if (!requestedStages) {
  usage();
  throw new Error(`unknown-stage:${stageArg}`);
}
const runnableStages = sourceProps
  ? requestedStages.filter((stage) => stage !== "semantic")
  : requestedStages;

const articleSha256 = sha256File(articlePath);
const srtPath = srtArg ? path.resolve(root, srtArg) : null;
const srtSha256 = srtPath && fs.existsSync(srtPath) ? sha256File(srtPath) : null;
const previous = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;

const manifest = {
  contract: "A1StoryboardPipelineManifest/v1",
  status: "RUNNING",
  generatedAt: new Date().toISOString(),
  root: rel(root),
  stage: stageArg,
  requestedStages,
  runnableStages,
  policy: {
    systemLine: true,
    port: 4311,
    fullMp4Rendered: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    mutatesSystemLineReviewProps: false,
  },
  input: {
    articlePath: rel(articlePath),
    articleSha256,
    srtPath: srtPath ? rel(srtPath) : null,
    srtSha256,
    sourcePropsPath: sourceProps ? rel(sourceProps) : null,
    sourcePropsSha256: sourceProps && fs.existsSync(sourceProps) ? sha256File(sourceProps) : null,
    onlyBeatIds,
    reviewNotesPath: stageArg === "revise" ? rel(reviewNotesPath) : null,
    reviewNotesSha256: stageArg === "revise" && fs.existsSync(reviewNotesPath) ? sha256File(reviewNotesPath) : null,
    reviewNoteBeatIds: stageArg === "revise" ? reviewNoteBeatIds : [],
  },
  outputs: {
    activePropsPath: rel(activeProps),
    storyboardManifestPath: rel(storyboardManifestPath),
    privateManifestPath: rel(manifestPath),
    publicManifestPath: rel(publicManifestPath),
  },
  stages: previous?.stages && typeof previous.stages === "object" ? previous.stages : {},
  cache: {semanticReused: false, stillsReused: false},
  nextAction: "run-pipeline",
};

function persist() {
  writeJson(manifestPath, manifest);
  writeJson(publicManifestPath, manifest);
}

function stageInputKey(extra = {}) {
  return sha256Text(JSON.stringify({
    articleSha256,
    srtSha256,
    sourcePropsSha256: manifest.input.sourcePropsSha256,
    onlyBeatIds: manifest.input.onlyBeatIds,
    ...extra,
  }));
}

function cached(stageName, key, outputFile) {
  const prior = previous?.stages?.[stageName];
  return Boolean(!force && prior?.status === "PASS" && prior?.inputKey === key && outputFile && fs.existsSync(outputFile));
}

function recordStage(stageName, record, inputKey, outputs = {}) {
  manifest.stages[stageName] = {
    ...record,
    inputKey,
    outputs,
  };
  persist();
  if (record.status !== "PASS") {
    manifest.status = "BLOCKED";
    manifest.nextAction = `repair-${stageName}`;
    persist();
    process.exit(record.exitCode || 2);
  }
}

persist();

if (runnableStages.includes("revise")) {
  const inputKey = stageInputKey({
    reviewNotesSha256: manifest.input.reviewNotesSha256,
    selectedBeatIds: onlyBeatIds,
    activeProps: sourceProps ? manifest.input.sourcePropsSha256 : null,
  });
  const record = {
    step: "revise",
    command: "read-review-notes-and-select-affected-storyboard-beats",
    status: onlyBeatIds.length ? "PASS" : "BLOCKED",
    exitCode: onlyBeatIds.length ? 0 : 2,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    wallClockMs: 0,
    stdoutTail: "",
    stderrTail: onlyBeatIds.length ? "" : "no open review notes or --only beat ids",
  };
  recordStage("revise", record, inputKey, {
    reviewNotesPath: rel(reviewNotesPath),
    openNoteCount: reviewNotes.length,
    selectedBeatIds: onlyBeatIds,
    propsMutationStatus: "not-mutated-v1",
    semanticRewriteStatus: "pending-next-layer",
  });
}

if (runnableStages.includes("semantic")) {
  const inputKey = stageInputKey({model: modelArg || "default", outProps: rel(outProps)});
  if (cached("semantic", inputKey, outProps)) {
    manifest.cache.semanticReused = true;
    manifest.stages.semantic = {...previous.stages.semantic, cacheHit: true};
    persist();
    console.log(`[semantic] cache hit: ${rel(outProps)}`);
  } else {
    const commandArgs = ["scripts/semantic-props-generator.mjs", rel(articlePath), "--out", rel(outProps)];
    if (srtPath) commandArgs.push("--srt", rel(srtPath));
    if (modelArg) commandArgs.push("--model", modelArg);
    const record = runCommand("semantic", process.execPath, commandArgs);
    recordStage("semantic", record, inputKey, {
      propsPath: rel(outProps),
      propsSha256: fs.existsSync(outProps) ? sha256File(outProps) : null,
    });
  }
}

const requiresActiveProps = runnableStages.some((stage) => ["semantic", "stills", "publish"].includes(stage));
if (requiresActiveProps && !fs.existsSync(activeProps)) {
  manifest.status = "BLOCKED";
  manifest.nextAction = "provide-or-generate-storyboard-props";
  manifest.blocker = `active-props-not-found:${rel(activeProps)}`;
  persist();
  throw new Error(manifest.blocker);
}

const activePropsSha256 = fs.existsSync(activeProps) ? sha256File(activeProps) : null;
manifest.outputs.activePropsSha256 = activePropsSha256;
persist();

if (runnableStages.includes("stills")) {
  const inputKey = stageInputKey({props: activePropsSha256, only: onlyArg || "all"});
  const commandArgs = ["scripts/render-storyboard-current-stills-v1.mjs", "--props", rel(activeProps)];
  if (onlyArg) commandArgs.push("--only", onlyArg);
  const record = runCommand("stills", process.execPath, commandArgs);
  const reportPath = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-current-stills-v1/report.json");
  const report = fs.existsSync(reportPath) ? readJson(reportPath) : null;
  manifest.cache.stillsReused = report?.output?.renderedCount === 0 && report?.output?.reusedCount > 0;
  recordStage("stills", record, inputKey, {
    reportPath: rel(reportPath),
    status: report?.status || null,
    selectedCount: report?.selection?.selectedCount ?? null,
    renderedCount: report?.output?.renderedCount ?? null,
    reusedCount: report?.output?.reusedCount ?? null,
    missingCount: report?.output?.missingCount ?? null,
  });
}

if (runnableStages.includes("publish")) {
  const inputKey = stageInputKey({props: activePropsSha256});
  const record = runCommand("publish", process.execPath, ["scripts/publish-storyboard-current-v1.mjs", "--source", rel(activeProps)]);
  const storyboardManifest = fs.existsSync(storyboardManifestPath) ? readJson(storyboardManifestPath) : null;
  recordStage("publish", record, inputKey, {
    storyboardManifestPath: rel(storyboardManifestPath),
    storyboardPropsSha256: storyboardManifest?.current?.propsSha256 || null,
    sceneCount: storyboardManifest?.current?.sceneCount || null,
    macroCount: storyboardManifest?.current?.macroCount || null,
    approvalInvalidated: true,
  });
}

if (runnableStages.includes("quality")) {
  const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
  const storyboardPropsSha256 = fs.existsSync(storyboardPropsPath) ? sha256File(storyboardPropsPath) : null;
  const inputKey = stageInputKey({
    storyboardProps: storyboardPropsSha256,
    storyboardManifest: fs.existsSync(storyboardManifestPath) ? sha256File(storyboardManifestPath) : null,
  });
  const record = runCommand("quality", process.execPath, ["scripts/audit-storyboard-quality-gate-v1.mjs", "--write-review-notes"]);
  const qualityReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-quality-gate-v1/report.json");
  const qualityReport = fs.existsSync(qualityReportPath) ? readJson(qualityReportPath) : null;
  recordStage("quality", record, inputKey, {
    reportPath: rel(qualityReportPath),
    publicReportPath: "apps/studio-next/public/generated/system-line/storyboard-quality-gate-v1/report.json",
    status: qualityReport?.status || null,
    blockerSceneCount: qualityReport?.summary?.blockerSceneCount ?? null,
    reviewRiskSceneCount: qualityReport?.summary?.reviewRiskSceneCount ?? null,
    issueCount: qualityReport?.summary?.issueCount ?? null,
    pendingArtworkCount: qualityReport?.summary?.pendingArtworkCount ?? null,
    reviewNotesOpenCount: qualityReport?.reviewNotesWrite?.totalOpenCount ?? null,
  });
}

if (runnableStages.includes("gates")) {
  const inputKey = stageInputKey({props: activePropsSha256, storyboardManifest: fs.existsSync(storyboardManifestPath) ? sha256File(storyboardManifestPath) : null});
  const gateRecords = [
    runCommand("gate:storyboard-system-line-isolation", "npm", ["run", "audit:storyboard-system-line-isolation"]),
    runCommand("gate:storyboard-first-render", "npm", ["run", "audit:storyboard-first-render-gate"]),
    runCommand("gate:system-line-closed-loop", "npm", ["run", "audit:system-line-closed-loop"]),
  ];
  const blocked = gateRecords.find((record) => record.status !== "PASS");
  recordStage("gates", {
    step: "gates",
    command: gateRecords.map((record) => record.command).join(" && "),
    status: blocked ? "BLOCKED" : "PASS",
    exitCode: blocked?.exitCode ?? 0,
    startedAt: gateRecords[0]?.startedAt || new Date().toISOString(),
    completedAt: gateRecords.at(-1)?.completedAt || new Date().toISOString(),
    wallClockMs: gateRecords.reduce((sum, record) => sum + record.wallClockMs, 0),
    records: gateRecords,
  }, inputKey, {
    storyboardGateReport: "apps/studio-next/public/generated/system-line/storyboard-first-render-gate-v1/report.json",
    closedLoopReport: "apps/studio-next/public/generated/system-line/system-line-closed-loop-v1/report.json",
  });
}

manifest.status = "PASS";
manifest.completedAt = new Date().toISOString();
manifest.nextAction = "open-4311-storyboard-for-human-review";
persist();

console.log(JSON.stringify({
  status: manifest.status,
  contract: manifest.contract,
  stage: manifest.stage,
  activePropsPath: manifest.outputs.activePropsPath,
  activePropsSha256: manifest.outputs.activePropsSha256,
  manifestPath: manifest.outputs.privateManifestPath,
  publicManifestPath: manifest.outputs.publicManifestPath,
  nextAction: manifest.nextAction,
}, null, 2));
