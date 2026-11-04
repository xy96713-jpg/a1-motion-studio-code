#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import {buildPicturePackagingBoundary} from "../lib/a1-picture-packaging-contract-v1.js";

const require = createRequire(import.meta.url);
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const root = process.cwd();
const phaseId = "picture-packaging-pilot-v1";
const sourcePropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const sourceAudioPath = process.env.A1_JULY1_AUDIO_PATH || "/Users/a1/Documents/Codex/声音/outputs/voice_clone_july1/july1_full_16k_mono.wav";
const propsPath = path.join(root, "remotion-renderer/src/generated/picturePackagingPilotProps.json");
const rendererPublicDir = path.join(root, "remotion-renderer/public", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const beatIds = ["H02-B02", "H02-B03", "H02-B04", "H03-B01", "H03-B02"];

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const sha256File = async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
const writeJson = async (file, value) => {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};

const shotDesigns = {
  "H02-B02": {
    textPlan: {headline: ["都用 AI 了", "为什么不直接写完？"], emphasis: "AI", hierarchy: "question-to-challenge"},
    backgroundPlan: {mode: "paper-to-ink-field", rationale: "疑问从宽阔纸面压向被机器填满的正文场"},
    elementPlan: {primary: "expanding-typeset-column", supporting: ["cursor-block", "selection-field"], semanticJob: "automatic-completion-pressure"},
    imagePlan: {route: "not-required", rationale: "这是逻辑质疑，动态排版和可编辑关系图比配图更准确"},
    motionPlan: {primary: "question-folds-into-typeset-column", transitionOut: "column-overwrites-question"},
  },
  "H02-B03": {
    textPlan: {headline: ["AI 常常", "不说人话"], emphasis: "不说人话", hierarchy: "verdict"},
    backgroundPlan: {mode: "charcoal-editorial-field", rationale: "用暗场制造判断落下的重量，不模拟任何界面"},
    elementPlan: {primary: "broken-sentence-baseline", supporting: ["misaligned-glyph-shadow"], semanticJob: "language-dislocation"},
    imagePlan: {route: "not-required", rationale: "语言本身就是画面事件，避免概念插画稀释判断"},
    motionPlan: {primary: "sentence-aligns-then-breaks", transitionOut: "broken-baseline-carries-forward"},
  },
  "H02-B04": {
    textPlan: {headline: ["模型在进步", "问题没有消失"], emphasis: "没有消失", hierarchy: "contrast"},
    backgroundPlan: {mode: "split-paper-pressure", rationale: "左侧增长、右侧停滞形成同帧反差"},
    elementPlan: {primary: "asymmetric-progress-bars", supporting: ["model-growth-block", "expression-stagnation-block"], semanticJob: "progress-does-not-equal-resolution"},
    imagePlan: {route: "not-required", rationale: "关系比较应由可验证的确定性图形承担"},
    motionPlan: {primary: "one-axis-advances-one-axis-stalls", transitionOut: "stalled-block-expands"},
  },
  "H03-B01": {
    textPlan: {headline: ["明明都是中文", "却看不懂，也没重点"], emphasis: "看不懂", hierarchy: "symptom"},
    backgroundPlan: {mode: "dense-type-crop", rationale: "把正确字词堆成错误阅读体验，呈现形式正确但意义失焦"},
    elementPlan: {primary: "focus-window", supporting: ["drifting-type-columns", "missing-center"], semanticJob: "readability-without-meaning"},
    imagePlan: {route: "not-required", rationale: "症状来自语言密度，使用文本材料比通用 AI 配图更具体"},
    motionPlan: {primary: "focus-window-searches-and-fails", transitionOut: "columns-compress-into-page"},
  },
  "H03-B02": {
    textPlan: {headline: ["完成度很高的", "废稿"], emphasis: "废稿", hierarchy: "final-verdict"},
    backgroundPlan: {mode: "finished-page-rejection", rationale: "先让页面显得完整，再用编辑判断推翻表面完成度"},
    elementPlan: {primary: "editorial-rejection-stamp", supporting: ["finished-copy-column", "human-review-mark"], semanticJob: "completion-is-not-quality"},
    imagePlan: {route: "not-required", rationale: "完整文稿与人工否决是可编辑的直接隐喻，无需生成插画"},
    motionPlan: {primary: "finished-page-locks-then-rejected", transitionOut: "quiet-hold"},
  },
};

async function main() {
  const sourceProps = await readJson(sourcePropsPath);
  const selected = beatIds.map((beatId) => sourceProps.scenes.find((scene) => scene.beatId === beatId));
  if (selected.some((scene) => !scene)) throw new Error("picture-packaging-pilot-beat-missing");
  const sourceStartMs = selected[0].sourceStartMs;
  const sourceEndMs = selected.at(-1).sourceEndMs;
  const durationMs = sourceEndMs - sourceStartMs;
  const fps = 30;
  const durationInFrames = Math.ceil(durationMs / 1000 * fps);
  const sourcePropsSha256 = await sha256File(sourcePropsPath);
  const sourceAudioSha256 = await sha256File(sourceAudioPath);
  const boundary = buildPicturePackagingBoundary({
    projectId: sourceProps.projectId,
    sourceHash: sourcePropsSha256,
    proofRange: {sourceStartMs, sourceEndMs, beatIds},
  });

  const audioPath = path.join(rendererPublicDir, "audio/packaging-proof.wav");
  await fs.mkdir(path.dirname(audioPath), {recursive: true});
  const ffmpeg = spawnSync(ffmpegPath, [
    "-y", "-ss", (sourceStartMs / 1000).toFixed(3), "-i", sourceAudioPath,
    "-t", (durationMs / 1000).toFixed(3), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath,
  ], {encoding: "utf8"});
  if (ffmpeg.status !== 0) throw new Error(`picture-packaging-audio-extract-failed:${ffmpeg.stderr}`);

  const props = {
    contract: "A1PicturePackagingPilot/v1",
    boundaryContract: boundary.contract,
    projectId: sourceProps.projectId,
    fps,
    width: 1920,
    height: 1080,
    durationInFrames,
    reviewOnly: true,
    placement: "unassigned",
    editorialAuthority: "user",
    mainTimelineMutated: false,
    currentFilmPropsMutated: false,
    recordingDependencyCount: 0,
    screenshotDependencyCount: 0,
    generatedArtworkCount: 0,
    audioSrc: `${phaseId}/audio/packaging-proof.wav`,
    beats: selected.map((scene) => ({
      beatId: scene.beatId,
      startFrame: Math.round((scene.sourceStartMs - sourceStartMs) / 1000 * fps),
      durationInFrames: Math.max(1, Math.round((scene.sourceEndMs - scene.sourceStartMs) / 1000 * fps)),
      sourceText: scene.screenText,
      ...shotDesigns[scene.beatId],
    })),
  };
  await writeJson(propsPath, props);

  const report = {
    contract: "A1PicturePackagingPilotReport/v1",
    status: "READY_TO_RENDER",
    reviewOnly: true,
    productDefinition: boundary.productDefinition,
    editorialAuthority: boundary.editorialAuthority,
    systemResponsibility: boundary.systemResponsibility,
    userEditMap: boundary.userEditMap,
    proofPlacement: boundary.proofRange.placement,
    rendererAdoptionAllowed: false,
    mainTimelinePlacementAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    sourceBinding: {sourcePropsPath: path.relative(root, sourcePropsPath), sourcePropsSha256, sourceAudioPath, sourceAudioSha256},
    summary: {beatCount: props.beats.length, durationSec: durationMs / 1000, recordingDependencyCount: 0, screenshotDependencyCount: 0, generatedArtworkCount: 0, fullySpecifiedShotCount: props.beats.length},
    pilot: {
      propsPath: path.relative(root, propsPath),
      propsSha256: await sha256File(propsPath),
      audioPath: path.relative(root, audioPath),
      audioSha256: await sha256File(audioPath),
      video: {publicUrl: `/generated/system-line/${phaseId}/picture-packaging-pilot.mp4`, status: "pending-render"},
      poster: {publicUrl: `/generated/system-line/${phaseId}/picture-packaging-poster.png`, status: "pending-render"},
      contactSheet: {publicUrl: `/generated/system-line/${phaseId}/picture-packaging-contact-sheet.png`, status: "pending-render"},
    },
    boundary,
    beats: props.beats,
    checks: {userOwnsHostTiming: true, userOwnsScreenRecordingTiming: true, userOwnsCutTiming: true, proofIsUnplaced: true, recordingUsedAsAnimationDependency: false, everyShotHasFiveDesignPlans: props.beats.every((beat) => beat.textPlan && beat.backgroundPlan && beat.elementPlan && beat.imagePlan && beat.motionPlan), currentFilmPropsMutated: false},
    failures: [],
    nextAction: "render-picture-packaging-pilot-for-direct-review",
  };
  for (const output of [path.join(artifactDir, "report.json"), path.join(publicDir, "report.json")]) await writeJson(output, report);
  console.log(JSON.stringify({status: report.status, durationSec: report.summary.durationSec, beatCount: report.summary.beatCount, placement: report.proofPlacement, recordingDependencyCount: report.summary.recordingDependencyCount, propsPath: path.relative(root, propsPath)}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
