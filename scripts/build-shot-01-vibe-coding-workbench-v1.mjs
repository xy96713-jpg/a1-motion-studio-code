#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {shot01VibeCodingWorkbenchPlanV1} from "../apps/studio-next/src/lib/a1-shot-01-vibe-coding-workbench-v1.ts";

const root = process.cwd();
const phaseId = shot01VibeCodingWorkbenchPlanV1.phaseId;
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const authorityPath = path.join(root, "remotion-renderer/src/generated/editorialDocumentaryPilotProps.json");
const propsPath = path.join(root, "remotion-renderer/src/generated/shot01VibeCodingWorkbenchV1Props.json");
const sourceAssetPath = path.join(root, "remotion-renderer/public", shot01VibeCodingWorkbenchPlanV1.sourceMaterial.assetUri);
const audioAssetPath = path.join(root, "remotion-renderer/public", shot01VibeCodingWorkbenchPlanV1.audio.assetUri);
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const authorityBefore = shaFile(authorityPath);
const authority = JSON.parse(fs.readFileSync(authorityPath, "utf8"));
const sourceBeat = authority.beats?.find((beat) => beat.beatId === shot01VibeCodingWorkbenchPlanV1.sourceBeatId);
if (!sourceBeat || sourceBeat.screenText !== shot01VibeCodingWorkbenchPlanV1.sourceText || sourceBeat.durationInFrames !== shot01VibeCodingWorkbenchPlanV1.durationInFrames || sourceBeat.sourceStartMs !== 0 || sourceBeat.sourceEndMs !== 3353) throw new Error("shot-01-vibe-coding-source-authority-mismatch");
if (!fs.existsSync(sourceAssetPath) || shaFile(sourceAssetPath) !== shot01VibeCodingWorkbenchPlanV1.sourceMaterial.sha256) throw new Error("shot-01-vibe-coding-source-asset-mismatch");
if (!fs.existsSync(audioAssetPath) || shaFile(audioAssetPath) !== shot01VibeCodingWorkbenchPlanV1.audio.sha256) throw new Error("shot-01-vibe-coding-audio-asset-mismatch");
if (shot01VibeCodingWorkbenchPlanV1.beats.some((beat, index, beats) => beat.startFrame < 0 || beat.endFrame > shot01VibeCodingWorkbenchPlanV1.durationInFrames || beat.endFrame <= beat.startFrame || (index > 0 && beat.startFrame > beats[index - 1].endFrame + 2))) throw new Error("shot-01-vibe-coding-beat-timing-invalid");

const props = {plan: shot01VibeCodingWorkbenchPlanV1};
writeJson(propsPath, props);
writeJson(path.join(publicDir, "render-plan.json"), shot01VibeCodingWorkbenchPlanV1);
writeJson(path.join(artifactDir, "render-plan.json"), shot01VibeCodingWorkbenchPlanV1);
const authorityAfter = shaFile(authorityPath);
const report = {
  contract: "A1Shot01VibeCodingWorkbenchBuildReport/v1",
  phaseId,
  status: "PASS",
  source: {beatId: sourceBeat.beatId, screenText: sourceBeat.screenText, durationInFrames: sourceBeat.durationInFrames, sourceStartMs: sourceBeat.sourceStartMs, sourceEndMs: sourceBeat.sourceEndMs, materialSha256: shaFile(sourceAssetPath), audioSha256: shaFile(audioAssetPath)},
  design: {topology: shot01VibeCodingWorkbenchPlanV1.topology, primaryActor: shot01VibeCodingWorkbenchPlanV1.primaryActor, handoffActor: shot01VibeCodingWorkbenchPlanV1.handoffActor, beatCount: shot01VibeCodingWorkbenchPlanV1.beats.length, forbiddenPrimitives: shot01VibeCodingWorkbenchPlanV1.forbiddenPrimitives},
  currentAuthority: {sha256Before: authorityBefore, sha256After: authorityAfter, unchanged: authorityBefore === authorityAfter},
  gates: shot01VibeCodingWorkbenchPlanV1.gates,
};
writeJson(path.join(publicDir, "build-report.json"), report);
writeJson(path.join(artifactDir, "build-report.json"), report);
console.log(JSON.stringify(report, null, 2));
