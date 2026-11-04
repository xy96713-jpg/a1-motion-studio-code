#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {shot01SelectionRewritePlanV1} from "../apps/studio-next/src/lib/a1-shot-01-selection-rewrite-v1.ts";

const root = process.cwd();
const phaseId = shot01SelectionRewritePlanV1.phaseId;
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const propsPath = path.join(root, "remotion-renderer/src/generated/shot01SelectionRewriteV1Props.json");
const sourceAssetPath = path.join(root, "remotion-renderer/public", shot01SelectionRewritePlanV1.sourceMaterial.assetUri);
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const authorityBefore = shaFile(authorityPath);
const authority = JSON.parse(fs.readFileSync(authorityPath, "utf8"));
const sourceScene = authority.scenes?.[0];
if (sourceScene?.beatId !== "H01-B01" || sourceScene?.screenText !== shot01SelectionRewritePlanV1.sourceText || sourceScene?.durationInFrames !== shot01SelectionRewritePlanV1.durationInFrames) throw new Error("shot-01-source-authority-mismatch");
if (!fs.existsSync(sourceAssetPath) || shaFile(sourceAssetPath) !== shot01SelectionRewritePlanV1.sourceMaterial.sha256) throw new Error("shot-01-source-asset-mismatch");
if (shot01SelectionRewritePlanV1.beats.some((beat, index, beats) => beat.startFrame < 0 || beat.endFrame > shot01SelectionRewritePlanV1.durationInFrames || beat.endFrame <= beat.startFrame || (index > 0 && beat.startFrame > beats[index - 1].endFrame + 2))) throw new Error("shot-01-beat-timing-invalid");

const props = {plan: shot01SelectionRewritePlanV1};
writeJson(propsPath, props);
writeJson(path.join(publicDir, "render-plan.json"), shot01SelectionRewritePlanV1);
writeJson(path.join(artifactDir, "render-plan.json"), shot01SelectionRewritePlanV1);
const authorityAfter = shaFile(authorityPath);
const report = {
  contract: "A1Shot01SelectionRewriteBuildReport/v1",
  phaseId,
  status: "PASS",
  source: {beatId: sourceScene.beatId, screenText: sourceScene.screenText, durationInFrames: sourceScene.durationInFrames, sourceStartMs: sourceScene.sourceStartMs, sourceEndMs: sourceScene.sourceEndMs, assetSha256: shaFile(sourceAssetPath)},
  design: {topology: shot01SelectionRewritePlanV1.topology, primaryActor: shot01SelectionRewritePlanV1.primaryActor, beatCount: shot01SelectionRewritePlanV1.beats.length, forbiddenPrimitives: shot01SelectionRewritePlanV1.forbiddenPrimitives},
  currentAuthority: {sha256Before: authorityBefore, sha256After: authorityAfter, unchanged: authorityBefore === authorityAfter},
  gates: shot01SelectionRewritePlanV1.gates,
};
writeJson(path.join(publicDir, "build-report.json"), report);
writeJson(path.join(artifactDir, "build-report.json"), report);
console.log(JSON.stringify(report, null, 2));
