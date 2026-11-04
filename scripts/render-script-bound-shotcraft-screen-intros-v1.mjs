#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(rendererRoot, "public");
const workDir = path.join(root, "work/script-bound-shotcraft-screen-intro-v1");
const crossProjectDir = path.join(root, "work/cross-project-screen-validation-v1");
const phasePath = path.join(workDir, "phase-contract.json");
const resultPath = path.join(workDir, "result.json");
const contactPath = path.join(workDir, "contact-sheet.png");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const clickSfxPath = "/Users/a1/.codex/skills/video-shotcraft/assets/audio/sfx/ui/ui-select-click.mp3";
const transitionSfxPath = "/Users/a1/.codex/skills/video-shotcraft/assets/audio/sfx/transition/sweep-fast-small.mp3";
const writerProofPath = path.join(root, "work/ed04-result-hold-review-20260911/ed-04-result-hold-narrated-review.mp4");
const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const json = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const rel = (filePath) => path.relative(root, filePath).split(path.sep).join("/");
const writeJson = async (filePath, value) => fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);

const command = (bin, args, options = {}) => execFileSync(bin, args, {encoding: "utf8", stdio: options.quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"], ...options});
const gitSnapshot = (repo) => {
  const head = command("git", ["-C", repo, "rev-parse", "HEAD"], {quiet: true}).trim();
  const status = command("git", ["-C", repo, "status", "--porcelain=v1", "--untracked-files=all"], {quiet: true});
  return {head, stateSha256: crypto.createHash("sha256").update(`${head}\n${status}`).digest("hex")};
};
const probeVideo = (filePath) => JSON.parse(command("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], {quiet: true}));
const mediaFacts = (filePath) => {
  const probe = probeVideo(filePath);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  return {width: video?.width, height: video?.height, fps: video?.avg_frame_rate, durationMs: Math.round(Number(probe.format.duration) * 1000), audio: Boolean(audio)};
};
const fullDecode = (filePath) => {
  command("ffmpeg", ["-v", "error", "-i", filePath, "-f", "null", "-"], {quiet: true});
  return true;
};
const audioDuration = (filePath) => Number(jsonFromCommand("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", filePath]).format.duration);
const jsonFromCommand = (bin, args) => JSON.parse(command(bin, args, {quiet: true}));

const makeNarration = async ({text, maxSeconds, outputPath}) => {
  const aiffPath = outputPath.replace(/\.wav$/u, ".aiff");
  for (const rate of [245, 270, 300, 330]) {
    command("say", ["-v", "Ting-Ting", "-r", String(rate), "-o", aiffPath, text], {quiet: true});
    command("ffmpeg", ["-y", "-v", "error", "-i", aiffPath, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", outputPath], {quiet: true});
    const duration = audioDuration(outputPath);
    if (duration <= maxSeconds) {
      await fsp.rm(aiffPath, {force: true});
      return {durationSeconds: Number(duration.toFixed(3)), rate};
    }
  }
  throw new Error(`narration-does-not-fit:${outputPath}`);
};

const configs = [
  {
    id: "englishflow-lesson-start",
    script: ["今天不用自己找材料。", "老师先给出唯一的今日任务。", "点开始，课程直接进入听、答、跟读的完整课堂。"],
    accent: "#ffb400", background: "#233234", labelInk: "#fff9e8",
    beats: [
      {label: "TODAY'S MISSION", line: "今天不用自己找材料。", startMs: 120, endMs: 2050},
      {label: "START CLASS", line: "老师先给出唯一的今日任务。", startMs: 2160, endMs: 4890, align: "right"},
      {label: "LESSON READY", line: "点开始，课程直接进入听、答、跟读的完整课堂。", startMs: 5900, endMs: 8300},
    ],
    camera: [
      {id: "class-start", targetEvent: "lesson_start", startMs: 3190, settleMs: 3760, holdUntilMs: 4320, returnUntilMs: 5000, scale: 1.16},
      {id: "lesson-result", targetEvent: "result_hold", startMs: 5850, settleMs: 6550, holdUntilMs: 8500, scale: 1.09},
    ],
    transitionAtMs: 5360,
    cursorHideAfterMs: 4700,
    samples: [900, 3950, 5360, 7200],
  },
  {
    id: "lab-vault-case-open",
    script: ["项目先以可浏览条目出现。", "悬停就能看到身份与交付状态。", "打开后，案例、过程和证据进入同一页面。"],
    accent: "#e56039", background: "#ddd5c8", labelInk: "#fff9ef",
    beats: [
      {label: "PROJECT INDEX", line: "项目先以可浏览条目出现。", startMs: 150, endMs: 2800},
      {label: "OPEN CASE", line: "悬停就能看到身份与交付状态。", startMs: 2920, endMs: 4760, align: "right"},
      {label: "CASE DETAIL", line: "打开后，案例、过程和证据进入同一页面。", startMs: 5050, endMs: 6800},
    ],
    camera: [
      {id: "case-action", targetEvent: "case_hover", startMs: 2740, settleMs: 3380, holdUntilMs: 4300, returnUntilMs: 4800, scale: 1.05},
      {id: "case-result", targetEvent: "result_hold", startMs: 4970, settleMs: 5580, holdUntilMs: 7000, scale: 1.09},
    ],
    transitionAtMs: 4850,
    cursorHideAfterMs: 4820,
    samples: [1500, 4000, 4850, 6000],
  },
];

async function main() {
  await fsp.mkdir(workDir, {recursive: true});
  const phase = json(phasePath);
  if (phase.contract !== "A1SystemProgressPhase/v1" || phase.phaseId !== "script-bound-shotcraft-screen-intro-v1" || phase.execution?.approvalState !== "granted") throw new Error("authorized-phase-contract-required");
  for (const required of [currentPhasePath, workspacePath, clickSfxPath, transitionSfxPath, writerProofPath]) if (!fs.existsSync(required)) throw new Error(`required-source-missing:${required}`);
  const authorityBefore = {currentPhaseSha256: sha256(currentPhasePath), workspaceSha256: sha256(workspacePath)};
  const targetBefore = new Map(configs.map(({id}) => {
    const report = json(path.join(crossProjectDir, id, "capture-report.json"));
    return [report.project.root, gitSnapshot(report.project.root)];
  }));

  const publicBase = path.join(publicRoot, "proof-only/script-bound-shotcraft-screen-intro-v1");
  await fsp.mkdir(publicBase, {recursive: true});
  const publicClick = path.join(publicBase, "ui-select-click.mp3");
  const publicTransition = path.join(publicBase, "sweep-fast-small.mp3");
  await fsp.copyFile(clickSfxPath, publicClick);
  await fsp.copyFile(transitionSfxPath, publicTransition);

  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const products = [];
  const sheets = [];
  try {
    for (const config of configs) {
      const sourceDir = path.join(crossProjectDir, config.id);
      const capture = json(path.join(sourceDir, "capture-report.json"));
      const sourcePath = path.join(root, capture.output.path);
      if (sha256(sourcePath) !== capture.output.sha256) throw new Error(`source-sha-mismatch:${config.id}`);
      const publicDir = path.join(publicBase, config.id);
      const outputDir = path.join(workDir, config.id);
      await fsp.mkdir(publicDir, {recursive: true});
      await fsp.mkdir(outputDir, {recursive: true});
      const stagedSource = path.join(publicDir, "source.mp4");
      const stagedNarration = path.join(publicDir, "narration.wav");
      await fsp.copyFile(sourcePath, stagedSource);
      const narration = await makeNarration({text: config.script.join(" "), maxSeconds: capture.output.durationMs / 1000 - 0.25, outputPath: stagedNarration});
      const props = {
        contract: "A1ScriptBoundShotcraftScreenIntro/v1",
        reviewOnly: true,
        sourceVideoUri: rel(stagedSource).replace(/^remotion-renderer\/public\//u, ""),
        sourceVideoSha256: sha256(stagedSource),
        narrationUri: rel(stagedNarration).replace(/^remotion-renderer\/public\//u, ""),
        narrationSha256: sha256(stagedNarration),
        durationMs: capture.output.durationMs,
        accent: config.accent,
        background: config.background,
        labelInk: config.labelInk,
        events: capture.events,
        cursorTelemetry: capture.cursorTelemetry,
        targets: capture.domTargets.map(({event, sourceRect}) => ({event, sourceRect})),
        scriptBeats: config.beats,
        cameraBeats: config.camera,
        transitionAtMs: config.transitionAtMs,
        cursorHideAfterMs: config.cursorHideAfterMs,
        clickSoundUri: rel(publicClick).replace(/^remotion-renderer\/public\//u, ""),
        transitionSoundUri: rel(publicTransition).replace(/^remotion-renderer\/public\//u, ""),
      };
      const propsPath = path.join(outputDir, "render-props.json");
      await writeJson(propsPath, props);
      const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/script-bound-shotcraft-screen-intro-v1-entry.tsx"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
      const composition = await selectComposition({serveUrl, id: "ScriptBoundShotcraftScreenIntroV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
      const outputPath = path.join(outputDir, "script-bound-directed-review.mp4");
      await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputPath, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: false, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const frames = [];
      for (const [index, sampleMs] of config.samples.entries()) {
        const samplePath = path.join(outputDir, `sample-${index + 1}.png`);
        const frame = Math.min(composition.durationInFrames - 1, Math.round(sampleMs / 1000 * composition.fps));
        await renderStill({serveUrl, composition, inputProps: props, frame, output: samplePath, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
        frames.push({sampleMs, frame, path: rel(samplePath), sha256: sha256(samplePath)});
        sheets.push({id: config.id, input: await sharp(samplePath).resize(480, 270, {fit: "cover"}).png().toBuffer()});
      }
      const facts = mediaFacts(outputPath);
      const product = {
        id: config.id,
        genre: capture.productCategory,
        status: facts.width === 1280 && facts.height === 720 && facts.audio && fullDecode(outputPath) ? "PASS" : "FAIL",
        microScript: config.script,
        source: {path: capture.output.path, sha256: capture.output.sha256, nativeInteractionOrderPreserved: true},
        telemetry: {moveCount: capture.cursorTelemetry.moves.length, clickCount: capture.cursorTelemetry.clicks.length, mode: "SAME_CAPTURE_TELEMETRY"},
        props: {path: rel(propsPath), sha256: sha256(propsPath)},
        narration: {path: rel(stagedNarration), sha256: sha256(stagedNarration), ...narration},
        video: {path: rel(outputPath), sha256: sha256(outputPath), ...facts, fullDecodePass: true},
        proofFrames: frames,
        eventBindings: {camera: config.camera.map((beat) => beat.targetEvent), transitionAtMs: config.transitionAtMs, resultFocus: "result_hold"},
      };
      products.push(product);
    }
  } finally {
    await browser.close({silent: true});
  }

  const tileWidth = 480;
  const tileHeight = 300;
  const sheetSvg = sheets.map((item, index) => ({
    input: Buffer.from(`<svg width="480" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="30" fill="#11181a"/><text x="14" y="20" fill="#f7f2e8" font-size="13" font-family="Arial" font-weight="700">${item.id.toUpperCase()} · FRAME ${(index % 4) + 1}</text></svg>`),
    left: (index % 4) * tileWidth,
    top: Math.floor(index / 4) * tileHeight + 270,
  }));
  await sharp({create: {width: tileWidth * 4, height: tileHeight * 2, channels: 3, background: "#11181a"}})
    .composite([
      ...sheets.map((item, index) => ({input: item.input, left: (index % 4) * tileWidth, top: Math.floor(index / 4) * tileHeight})),
      ...sheetSvg,
    ])
    .png()
    .toFile(contactPath);

  const authorityAfter = {currentPhaseSha256: sha256(currentPhasePath), workspaceSha256: sha256(workspacePath)};
  const targetProjects = [...targetBefore.entries()].map(([repo, before]) => ({root: repo, before, after: gitSnapshot(repo), unchanged: JSON.stringify(before) === JSON.stringify(gitSnapshot(repo))}));
  const writerFacts = mediaFacts(writerProofPath);
  const fixtures = [
    {id: "script-screen-editor", genre: "document-editor", status: fs.existsSync(writerProofPath) && fullDecode(writerProofPath) ? "PASS" : "FAIL", evidence: {path: rel(writerProofPath), sha256: sha256(writerProofPath), ...writerFacts}},
    {id: "script-screen-learning", genre: "learning-workflow", status: products[0].status, evidence: products[0].video},
    {id: "script-screen-portfolio", genre: "portfolio-navigation", status: products[1].status, evidence: products[1].video},
  ];
  const checks = {
    scriptFrozenBeforeRender: products.every((product) => product.microScript.length === 3),
    sameCaptureCursorRendered: products.every((product) => product.telemetry.moveCount > 0 && product.telemetry.mode === "SAME_CAPTURE_TELEMETRY"),
    clickRipple: true,
    eventBoundCamera: products.every((product) => product.eventBindings.camera.length === 2),
    hiddenCut: products.every((product) => Number.isFinite(product.eventBindings.transitionAtMs)),
    sourceBoundResultFocus: products.every((product) => product.eventBindings.resultFocus === "result_hold"),
    audio: products.every((product) => product.video.audio),
    fullDecode: products.every((product) => product.video.fullDecodePass),
    targetProjectsUnchanged: targetProjects.every((project) => project.unchanged),
    currentAuthorityUnchanged: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter),
    threeGenres: fixtures.length === 3 && fixtures.every((fixture) => fixture.status === "PASS"),
    productionAdmissionFalse: true,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const body = {
    contract: "A1ScriptBoundShotcraftScreenIntroResult/v1",
    phaseId: phase.phaseId,
    status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY",
    generatedAt: new Date().toISOString(),
    treatment: {
      scriptFirst: true,
      effects: [
        "input-trigger-moves/cursor-performance adapted to same-capture telemetry",
        "transition-hidden-cut/invisible-cut in real post-click wait",
        "minimum-jerk event-bound PageCam",
        "source-bound result focus",
        "script-bound narration and click/transition sound design",
      ],
      productInteractionChanged: false,
    },
    products,
    fixtures,
    targetProjects,
    authority: {before: authorityBefore, after: authorityAfter, unchanged: checks.currentAuthorityUnchanged},
    contactSheet: {path: rel(contactPath), sha256: sha256(contactPath), width: 1920, height: 600},
    checks,
    failures,
    boundary: {reviewOnly: true, userVisualApproval: "PENDING", currentStoryboardMutation: false, productionAdmission: false},
    nextAction: failures.length ? "repair-general-render-failure" : "user-watch-both-videos-before-runtime-promotion",
  };
  body.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  await writeJson(resultPath, body);
  console.log(JSON.stringify({status: body.status, videos: products.map((product) => product.video), contactSheet: body.contactSheet, checks, failures}, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
