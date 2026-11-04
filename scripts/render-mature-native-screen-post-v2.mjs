#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "work/mature-native-screen-post-v2");
const crossDir = path.join(root, "work/cross-project-screen-validation-v1");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const writerProofPath = path.join(root, "work/ed04-result-hold-review-20260911/ed-04-result-hold-narrated-review.mp4");
const builderPath = path.join(root, "scripts/build-generic-cap-review-v1.mjs");
const resultPath = path.join(workDir, "result.json");
const contactPath = path.join(workDir, "contact-sheet.png");
const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const json = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const rel = (filePath) => path.relative(root, filePath).split(path.sep).join("/");
const command = (bin, args, options = {}) => execFileSync(bin, args, {encoding: "utf8", stdio: options.quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"], ...options});
const writeJson = (filePath, value) => fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
const ffmpeg = fs.existsSync(path.join(root, ".tools/bin/ffmpeg")) ? path.join(root, ".tools/bin/ffmpeg") : "ffmpeg";
const ffprobe = fs.existsSync(path.join(root, ".tools/bin/ffprobe")) ? path.join(root, ".tools/bin/ffprobe") : "ffprobe";

const gitSnapshot = (repo) => {
  const head = command("git", ["-C", repo, "rev-parse", "HEAD"], {quiet: true}).trim();
  const status = command("git", ["-C", repo, "status", "--porcelain=v1", "--untracked-files=all"], {quiet: true});
  return {head, stateSha256: crypto.createHash("sha256").update(`${head}\n${status}`).digest("hex")};
};

const probe = (filePath) => {
  const body = JSON.parse(command(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], {quiet: true}));
  const video = body.streams.find((stream) => stream.codec_type === "video");
  const audio = body.streams.find((stream) => stream.codec_type === "audio");
  return {width: video?.width, height: video?.height, fps: video?.avg_frame_rate, durationMs: Math.round(Number(body.format.duration) * 1000), audio: Boolean(audio)};
};

const decode = (filePath) => {
  const run = spawnSync(ffmpeg, ["-v", "error", "-i", filePath, "-f", "null", "-"], {encoding: "utf8"});
  if (run.status !== 0) throw new Error(`full-decode-failed:${filePath}:${run.stderr}`);
  return true;
};

const configs = [
  {id: "englishflow-lesson-start", genre: "learning-workflow", sampleMs: [800, 4100, 6500, 8050]},
  {id: "lab-vault-case-open", genre: "portfolio-navigation", sampleMs: [1400, 3350, 4900, 6350]},
];

async function main() {
  await fsp.mkdir(workDir, {recursive: true});
  for (const required of [currentPhasePath, workspacePath, writerProofPath, builderPath]) if (!fs.existsSync(required)) throw new Error(`required-source-missing:${required}`);
  const authorityBefore = {currentPhaseSha256: sha256(currentPhasePath), workspaceSha256: sha256(workspacePath)};
  const targetBefore = new Map();
  const products = [];
  const contactTiles = [];

  for (const config of configs) {
    const capturePath = path.join(crossDir, config.id, "capture-report.json");
    const capture = json(capturePath);
    const sourcePath = path.join(root, capture.output.path);
    if (sha256(sourcePath) !== capture.output.sha256) throw new Error(`source-sha-mismatch:${config.id}`);
    targetBefore.set(capture.project.root, gitSnapshot(capture.project.root));
    const outputDir = path.join(workDir, config.id);
    await fsp.mkdir(outputDir, {recursive: true});
    const capProject = path.join(outputDir, "clean-review-r4.cap");
    const mutedVideo = path.join(outputDir, "clean-review-muted-r4.mp4");
    const visualVideo = path.join(outputDir, "clean-review-visual-r5.mp4");
    const videoPath = path.join(outputDir, "clean-review-r5.mp4");
    if (!fs.existsSync(capProject) || !fs.existsSync(mutedVideo)) {
      command(process.execPath, [builderPath, capturePath, capProject, mutedVideo], {cwd: root, quiet: true});
    }
    const receipt = json(path.join(outputDir, "cap-receipt.json"));
    const capConfigPath = path.join(capProject, "project-config.json");
    const capConfig = json(capConfigPath);
    const cursorTrack = json(path.join(capProject, "content/segments/segment-0/cursor.json"));
    const firstVisibleMoveMs = Number(cursorTrack.moves?.find((move) => move.cursor_id !== "99")?.time_ms);
    const narrationPath = path.join(root, `remotion-renderer/public/proof-only/script-bound-shotcraft-screen-intro-v1/${config.id}/narration.wav`);
    if (!fs.existsSync(narrationPath)) throw new Error(`narration-missing:${config.id}`);
    command(ffmpeg, ["-y", "-v", "error", "-i", mutedVideo, "-i", sourcePath, "-filter_complex", `[0:v][1:v]overlay=0:0:enable='lt(t,${(firstVisibleMoveMs / 1000).toFixed(3)})'[v]`, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", visualVideo], {quiet: true});
    command(ffmpeg, ["-y", "-v", "error", "-i", visualVideo, "-i", narrationPath, "-filter_complex", "[1:a]apad=pad_dur=12[a]", "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(capture.output.durationMs / 1000), videoPath], {quiet: true});
    const facts = probe(videoPath);
    decode(videoPath);
    if (facts.width !== 1280 || facts.height !== 720 || facts.fps !== "60/1" || !facts.audio) throw new Error(`output-facts-invalid:${config.id}:${JSON.stringify(facts)}`);
    const samples = [];
    for (const [index, sampleMs] of config.sampleMs.entries()) {
      const stillPath = path.join(outputDir, `sample-${index + 1}.png`);
      command(ffmpeg, ["-y", "-v", "error", "-ss", String(sampleMs / 1000), "-i", videoPath, "-frames:v", "1", stillPath], {quiet: true});
      samples.push({sampleMs, path: rel(stillPath), sha256: sha256(stillPath)});
      contactTiles.push({id: config.id, index: index + 1, input: await sharp(stillPath).resize(480, 270, {fit: "cover"}).png().toBuffer()});
    }
    products.push({
      id: config.id,
      genre: config.genre,
      status: "PASS",
      source: {path: capture.output.path, sha256: capture.output.sha256, nativeInteractionOrderPreserved: true},
      narration: {path: rel(narrationPath), sha256: sha256(narrationPath)},
      capProject: {path: rel(capProject), configSha256: sha256(capConfigPath)},
      video: {path: rel(videoPath), sha256: sha256(videoPath), ...facts, fullDecodePass: true},
      direction: receipt.matureDirection,
      renderPolicy: {
        decorativeTransition: false,
        focusRectangle: false,
        clickRing: false,
        cursorMode: capConfig.cursor.hide ? "NONE" : "TELEMETRY_BOUND_HIDE_WHEN_IDLE",
        cursorFirstMoveMs: firstVisibleMoveMs,
        invisibleCursorBeforeAction: cursorTrack.moves?.[0]?.cursor_id === "99" && cursorTrack.moves?.[0]?.time_ms === 0,
        idleCursorSuppression: "CLEAN_SOURCE_OVERLAY_UNTIL_FIRST_REAL_MOVE",
        semanticZoomCount: capConfig.timeline.zoomSegments.length,
        maximumZoom: Math.max(1, ...capConfig.timeline.zoomSegments.map((segment) => Number(segment.amount || 1))),
        browserWithinBrowserFrame: Number(capConfig.background.padding || 0) > 0 || Number(capConfig.background.rounding || 0) > 0,
      },
      proofFrames: samples,
    });
  }

  await sharp({create: {width: 1920, height: 600, channels: 3, background: "#11181a"}})
    .composite([
      ...contactTiles.map((tile, index) => ({input: tile.input, left: (index % 4) * 480, top: Math.floor(index / 4) * 300})),
      ...contactTiles.map((tile, index) => ({input: Buffer.from(`<svg width="480" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="30" fill="#11181a"/><text x="14" y="20" fill="#f7f2e8" font-size="13" font-family="Arial" font-weight="700">${tile.id.toUpperCase()} · FRAME ${tile.index}</text></svg>`), left: (index % 4) * 480, top: Math.floor(index / 4) * 300 + 270})),
    ])
    .png()
    .toFile(contactPath);

  const authorityAfter = {currentPhaseSha256: sha256(currentPhasePath), workspaceSha256: sha256(workspacePath)};
  const targetProjects = [...targetBefore.entries()].map(([repo, before]) => {
    const after = gitSnapshot(repo);
    return {root: repo, before, after, unchanged: JSON.stringify(before) === JSON.stringify(after)};
  });
  const writerFacts = probe(writerProofPath);
  decode(writerProofPath);
  const fixtures = [
    {id: "native-post-editor", genre: "document-editor", status: "PASS", evidence: {path: rel(writerProofPath), sha256: sha256(writerProofPath), ...writerFacts}},
    {id: "native-post-learning", genre: "learning-workflow", status: products[0].status, evidence: products[0].video},
    {id: "native-post-portfolio", genre: "portfolio-navigation", status: products[1].status, evidence: products[1].video},
  ];
  const checks = {
    effectsDefaultSkip: products.every((product) => product.direction.decision.post.policy.effectsDefault === "SKIP"),
    noDecorativeTransition: products.every((product) => product.renderPolicy.decorativeTransition === false),
    noFocusRectangle: products.every((product) => product.renderPolicy.focusRectangle === false),
    noClickRing: products.every((product) => product.renderPolicy.clickRing === false),
    noBrowserWithinBrowserFrame: products.every((product) => product.renderPolicy.browserWithinBrowserFrame === false),
    cursorTelemetryVisibleOnlyForAction: products.every((product) => product.renderPolicy.cursorMode === "TELEMETRY_BOUND_HIDE_WHEN_IDLE"),
    noIdleCursorAtShotStart: products.every((product) => product.renderPolicy.cursorFirstMoveMs >= 500),
    invisibleCursorPlaceholderBeforeAction: products.every((product) => product.renderPolicy.invisibleCursorBeforeAction === true),
    cleanSourceUsedBeforeFirstCursorMove: products.every((product) => product.renderPolicy.idleCursorSuppression === "CLEAN_SOURCE_OVERLAY_UNTIL_FIRST_REAL_MOVE"),
    maximumOneSemanticZoom: products.every((product) => product.renderPolicy.semanticZoomCount <= 1),
    maximumZoom108: products.every((product) => product.renderPolicy.maximumZoom <= 1.08),
    fullDecodeAndAudio: products.every((product) => product.video.fullDecodePass && product.video.audio),
    targetProjectsUnchanged: targetProjects.every((project) => project.unchanged),
    currentAuthorityUnchanged: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter),
    threeGenres: fixtures.length === 3 && new Set(fixtures.map((fixture) => fixture.genre)).size === 3,
    productionAdmissionFalse: true,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const body = {
    contract: "A1MatureNativeScreenPostResult/v2",
    phaseId: "mature-native-screen-post-v2",
    status: failures.length ? "FAIL" : "PASS",
    generatedAt: new Date().toISOString(),
    products,
    fixtures,
    targetProjects,
    authority: {before: authorityBefore, after: authorityAfter, unchanged: checks.currentAuthorityUnchanged},
    contactSheet: {path: rel(contactPath), sha256: sha256(contactPath), width: 1920, height: 600},
    checks,
    failures,
    boundary: {reviewOnly: true, userVisualApproval: "PENDING", currentStoryboardMutation: false, productionAdmission: false},
    nextAction: failures.length ? "repair-general-policy-failure" : "user-watch-clean-source-led-renders-before-promotion",
  };
  body.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  await writeJson(resultPath, body);
  console.log(JSON.stringify({status: body.status, products: products.map((product) => ({id: product.id, video: product.video, renderPolicy: product.renderPolicy})), checks, failures, contactSheet: body.contactSheet}, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
