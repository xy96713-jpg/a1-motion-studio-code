#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line/current-project-visual-contract-upgrade-v1/current-article-run.json");
const currentDirectorInputPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json");
const expectedArtifactSha256 = "c6daa64913634479f75ef15dafb0ce40bf34fc9973ab16bba877babed25daaa2";
const articleSourceHash = "108de8b4b4bc42448accd081363a347435973b5098c8a1b6ced04078ce5e14c3";
const correctedSourceText = "Codex 先整理材料、读取风格库并明确约束，整理后的全文进入工作台继续编辑与收稿。";
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJsonAtomic = (file, value) => {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
};

if (fileSha256(artifactPath) !== expectedArtifactSha256) throw new Error("ed20-director-artifact-changed-since-checkpoint");
const currentRun = readJson(artifactPath);
const currentInput = readJson(currentDirectorInputPath);
if (currentRun.contract !== "A1WholeFilmAiDirectorRun/v1" || currentRun.status !== "completed" || currentRun.plan?.shots?.length !== 34) throw new Error("ed20-director-run-invalid");
if (currentRun.plan?.source?.articleSha256 !== articleSourceHash || currentInput.plan?.source?.articleSha256 !== articleSourceHash) throw new Error("ed20-director-article-source-hash-mismatch");

const staleShot = currentRun.plan.shots.find((shot) => shot.shotId === "ED-20");
const authoritativeShot = currentInput.plan.shots.find((shot) => shot.shotId === "ED-20");
if (!staleShot || !authoritativeShot || staleShot.firstCueId !== 58 || staleShot.lastCueId !== 61 || authoritativeShot.sourceText !== correctedSourceText) throw new Error("ed20-director-cue-or-source-guard-failed");
if (!staleShot.semanticActor?.identity || !staleShot.semanticActor?.action) throw new Error("ed20-director-existing-semantic-contract-missing");

const correctedShot = {
  ...staleShot,
  sourceText: authoritativeShot.sourceText,
  sourceTextOriginal: authoritativeShot.sourceTextOriginal,
  semanticSourceMode: "corrected-derived-bridge-v1",
  sourceCueIdsRetained: [58, 59],
  sourceCueIdsContext: [53, 54, 55, 56, 57, 62, 63, 64, 65],
  sourceCueIdsExcluded: [60, 61],
  semanticSourceNote: "由 ED-19 的真实后台编排/风格库口播、ED-20 的真实整理材料口播和 ED-21 的真实工作台正文口播组成的派生桥接；不是新增录音。",
  narrativeJob: authoritativeShot.narrativeJob,
  viewerTakeaway: authoritativeShot.viewerTakeaway,
  viewerQuestion: "材料、风格库和约束如何在 Codex 工作台汇成可继续编辑与收稿的全文？",
  semanticActor: {
    identity: authoritativeShot.primaryActor,
    action: authoritativeShot.visualJob,
    beforeState: "写作任务尚未完成材料整理、风格约束和全文编辑收稿。",
    afterState: "整理后的全文进入真实工作台继续编辑与收稿。",
    target: "整理后的全文与作者后续的编辑、保存和收稿动作。",
  },
  mediumDecisionReason: authoritativeShot.mediumDecisionReason,
  packageBrief: authoritativeShot.packageBrief,
  transitionOut: authoritativeShot.transitionOut,
  requiredMaterialIds: authoritativeShot.requiredMaterialIds,
  candidateAssetIds: authoritativeShot.candidateAssetIds,
  visualJob: authoritativeShot.visualJob,
  primaryActor: authoritativeShot.primaryActor,
  keyPhrases: authoritativeShot.keyPhrases,
  layoutConstraints: authoritativeShot.layoutConstraints,
  motionPhrase: authoritativeShot.motionPhrase,
  handoffActor: authoritativeShot.handoffActor,
  structureDirections: authoritativeShot.structureDirections,
  referenceConditioning: authoritativeShot.referenceConditioning,
};

const nextRun = structuredClone(currentRun);
nextRun.plan.strategy = {...nextRun.plan.strategy, packageRole: currentInput.plan.strategy.packageRole, chapters: nextRun.plan.strategy.chapters.map((chapter) => {
  const sourceChapter = currentInput.plan.strategy.chapters.find((item) => item.chapterId === chapter.chapterId);
  return sourceChapter ? {...chapter, narrativeArc: sourceChapter.narrativeArc} : chapter;
})};
nextRun.plan.chapters = nextRun.plan.chapters.map((chapter) => {
  const sourceChapter = currentInput.plan.chapters.find((item) => item.chapterId === chapter.chapterId);
  return sourceChapter ? {...chapter, narrativeArc: sourceChapter.narrativeArc} : chapter;
});
nextRun.plan.shots = nextRun.plan.shots.map((shot) => shot.shotId === "ED-20" ? correctedShot : shot);
nextRun.recompile = {
  contract: "A1WholeFilmAiDirectorSemanticRecompile/v1",
  scope: "shot-local",
  shotId: "ED-20",
  sourceCorrection: "ED-20-source-fact-correction-v1",
  sourceHash: crypto.createHash("sha256").update(correctedSourceText).digest("hex"),
  cueRange: [58, 61],
  existingDirectorContractPreserved: true,
  genericFallbackUsed: false,
  singleWriterTaskId,
  recompiledAt: new Date().toISOString(),
};
writeJsonAtomic(artifactPath, nextRun);
console.log(JSON.stringify({status: "PASS", shotId: "ED-20", oldArtifactSha256: expectedArtifactSha256, newArtifactSha256: fileSha256(artifactPath), sourceText: correctedShot.sourceText, cueRange: [58, 61], genericFallbackUsed: false, singleWriterTaskId}, null, 2));
