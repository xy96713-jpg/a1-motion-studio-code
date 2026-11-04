#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parseSrtTimeline} from "../apps/studio-next/src/lib/a1-project-intake-v1.mjs";
import {runWholeFilmAiDirector} from "../apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRunPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json");
const outputDir = path.join(root, ".codex-artifacts/system-progress-system-line/current-project-visual-contract-upgrade-v1");
const outputPath = path.join(outputDir, "current-article-run.json");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/current-project-visual-contract-upgrade-v1");
const publicPath = path.join(publicDir, "current-article-run.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};

if (!fs.existsSync(sourceRunPath)) throw new Error(`current-director-run-missing:${sourceRunPath}`);
const sourceRun = JSON.parse(fs.readFileSync(sourceRunPath, "utf8"));
const sourcePlan = sourceRun.plan;
if (sourceRun.contract !== "A1WholeFilmAiDirectorRun/v1" || sourceRun.status !== "completed" || sourcePlan?.projectId !== "july1-writing-workbench") throw new Error("current-director-run-invalid");
const analysisPath = path.resolve("/Users/a1/Documents/Codex/声音", sourcePlan.source.articleAnalysisPath);
const srtPath = path.resolve("/Users/a1/Documents/Codex/声音", sourcePlan.source.srtPath);
const articlePath = srtPath.replace(/\.srt$/u, ".txt");
for (const required of [analysisPath, srtPath, articlePath]) if (!fs.existsSync(required)) throw new Error(`current-director-source-missing:${required}`);
const articleText = fs.readFileSync(articlePath, "utf8").trim();
const srtText = fs.readFileSync(srtPath, "utf8");
const timeline = parseSrtTimeline(srtText);
const cues = timeline.cues.map((cue) => ({cueId: cue.cueId, sourceStartMs: cue.startMs, sourceEndMs: cue.endMs, sourceText: cue.text}));
const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
const shotSkeleton = sourcePlan.shots.map(({firstCueId, lastCueId, chapterId, editMode}) => ({firstCueId, lastCueId, chapterId, editMode}));

const startedAt = Date.now();
const run = await runWholeFilmAiDirector({
  projectId: sourcePlan.projectId,
  title: sourcePlan.source.title,
  articleText,
  cues,
  timeline: {authority: "corrected-srt", srtPath, srtSha256: shaFile(srtPath)},
  mediaInventory: sourcePlan.mediaInventory,
  articleAnalysis: {analysis, provenance: {path: analysisPath, sha256: shaFile(analysisPath)}},
  strategyCandidate: {strategy: sourcePlan.strategy, provenance: {taskId: `preserved-strategy-${sourcePlan.projectId}`, outputHash: crypto.createHash("sha256").update(JSON.stringify(sourcePlan.strategy)).digest("hex")}},
  shotSkeletonCandidate: {shots: shotSkeleton, provenance: {path: sourceRunPath, sha256: shaFile(sourceRunPath)}},
});
const visualFields = ["visualJob", "primaryActor", "materialRoute", "topology", "typographyRole", "keyPhrases", "layoutConstraints", "motionPhrase", "handoffActor", "structureDirections"];
const valid = run.status === "completed"
  && run.plan.shots.length === sourcePlan.shots.length
  && run.plan.shots.every((shot, index) => shot.firstCueId === sourcePlan.shots[index].firstCueId && shot.lastCueId === sourcePlan.shots[index].lastCueId && shot.editMode === sourcePlan.shots[index].editMode && visualFields.every((field) => field in shot));
const report = {contract: "A1CurrentProjectVisualContractUpgrade/v1", status: valid ? "READY_FOR_REBUILD_AND_USER_REVIEW" : "BLOCKED_AI_DIRECTOR", sourceRunSha256: shaFile(sourceRunPath), durationMs: Date.now() - startedAt, expectedShotCount: sourcePlan.shots.length, outputShotCount: run.status === "completed" ? run.plan.shots.length : 0, boundariesPreserved: valid, visualContractFields: visualFields, run};
writeAtomic(path.join(outputDir, "report.json"), report);
writeAtomic(path.join(publicDir, "report.json"), report);
if (!valid) {
  console.error(JSON.stringify({status: report.status, reason: run.status === "blocked" ? run.reason : "visual-contract-upgrade-validation-failed", reportPath: path.relative(root, path.join(outputDir, "report.json"))}, null, 2));
  process.exit(2);
}
writeAtomic(outputPath, run);
writeAtomic(publicPath, run);
console.log(JSON.stringify({status: report.status, shotCount: run.plan.shots.length, traceCount: run.traces.length, durationMs: report.durationMs, outputPath: path.relative(root, outputPath), publicPath: path.relative(root, publicPath)}, null, 2));
