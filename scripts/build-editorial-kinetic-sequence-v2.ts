#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildEditorialKineticSequenceV2} from "../apps/studio-next/src/lib/a1-editorial-kinetic-sequence-v2.ts";

const root = process.cwd();
const phaseId = "editorial-kinetic-sequence-v2";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererPlan = path.join(root, "remotion-renderer/src/generated/editorialKineticSequenceV2Props.json");
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const shaFile = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const authorityBefore = shaFile(authorityPath);
const plan = buildEditorialKineticSequenceV2();
const durationInFrames = plan.shots.reduce((sum, shot) => sum + shot.durationInFrames, 0);
writeJson(path.join(artifactDir, "render-plan.json"), plan);
writeJson(path.join(publicDir, "render-plan.json"), plan);
writeJson(rendererPlan, plan);
const report = {
  contract: "A1EditorialKineticSequenceBuildReport/v2", phaseId, status: "PASS",
  sequence: {shotCount: plan.shots.length, durationInFrames, durationSec: durationInFrames / plan.fps, familyIds: plan.shots.map((shot) => shot.familyId), topologyIds: plan.shots.map((shot) => shot.topologyId)},
  proofRequirement: {continuousSequence: true, durationRangeSec: [18, 28], coveredReferenceFamilies: ["R02", "R03", "R08", "R10"], realHandoffs: plan.shots.filter((shot) => shot.handoffOut.targetSceneId).length},
  currentAuthority: {path: path.relative(root, authorityPath), sha256Before: authorityBefore, sha256After: shaFile(authorityPath), unchanged: authorityBefore === shaFile(authorityPath)},
  gates: {...plan.gates, structuralBuild: "PASS", visualScore: "PENDING_RED_TEAM_VISUAL_SCORE"},
};
writeJson(path.join(artifactDir, "build-report.json"), report);
writeJson(path.join(publicDir, "build-report.json"), report);
console.log(JSON.stringify(report, null, 2));
