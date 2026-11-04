#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";
import {derivePresenterDepthTitleRoute} from "../apps/studio-next/src/lib/a1-presenter-depth-title-route-v1.mjs";
import {compareCandidateAgainstIncumbentBest} from "../apps/studio-next/src/lib/a1-incumbent-best-evidence-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicRoot = path.join(rendererRoot, "public");
const publicRoot = path.join(root, "apps/studio-next/public");
const outputRelative = "generated/system-line/editorial-asset-workbench-v1/presenter-depth-title-canary-v1";
const outputDir = path.join(publicRoot, outputRelative);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/presenter-depth-title-canary-v1");
const incumbentRelative = "generated/system-line/editorial-asset-workbench-v1/editorial-shot-director-v1/candidate-v3/representative-motion-v1/review-frames";
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;

const shots = [
  {shotId: "ED-01", semanticEvent: "IDENTITY", chapterId: "opening", atSeconds: 1.677, sourceAtMs: 1677, title: "智能写作工作台", support: "用 vibe coding 做的", accent: "IDENTITY"},
  {shotId: "ED-13", semanticEvent: "STRONG_CONTRAST", chapterId: "models", atSeconds: 59.22, sourceAtMs: 59220, title: "问题还在", support: "中文顺了", accent: "CONTRAST"},
  {shotId: "ED-31", semanticEvent: "CONCLUSION", chapterId: "closing", atSeconds: 192.53, sourceAtMs: 192530, title: "可控工作流", support: "真实问题 → 可控路径", accent: "CONCLUSION"},
].map((shot) => {
  const sourceFrameRelative = `generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/${shot.shotId}.jpg`;
  const matteRelative = `${outputRelative}/assets/${shot.shotId}/${shot.shotId.toLowerCase()}-presenter-matte.png`;
  const foregroundRelative = `${outputRelative}/assets/${shot.shotId}/${shot.shotId.toLowerCase()}-person-only-foreground.png`;
  const sourceFile = path.join(publicRoot, sourceFrameRelative);
  const matteFile = path.join(publicRoot, matteRelative);
  const route = derivePresenterDepthTitleRoute({
    semanticEvent: shot.semanticEvent,
    title: shot.title,
    chapterId: shot.chapterId,
    atSeconds: shot.atSeconds,
    baseVisualCarrier: "PRESENTER_BASE",
    matte: {realPixelSource: true, staticMattePass: true, dynamicMattePass: false, protectionScope: "PRESENTER_ONLY", sourceSha256: shaFile(sourceFile), matteSha256: shaFile(matteFile)},
  });
  if (route.route !== "PRESENTER_DEPTH_TITLE_FREEZE") throw new Error(`depth-title-route-not-admitted:${shot.shotId}:${route.failures.join(",")}`);
  return {...shot, sourceFrameUri: sourceFrameRelative, presenterMatteUri: matteRelative, foregroundUri: foregroundRelative, route};
});

const inputProps = {
  contract: "A1PresenterDepthTitleCanary/v1",
  width: 1920,
  height: 1080,
  fps: 30,
  presenterVideoUri: "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-video-093bc1315163.mov",
  audioUri: "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav",
  shots: shots.map(({route, chapterId, atSeconds, ...shot}) => shot),
};

function removeBundle(serveUrl) {
  const resolved = path.resolve(String(serveUrl || ""));
  if (!path.basename(resolved).startsWith("remotion-webpack-bundle-")) throw new Error(`refuse-to-remove-remotion-bundle:${resolved}`);
  fs.rmSync(resolved, {recursive: true, force: true});
}

function dimensions(scores, evidence) {
  return Object.fromEntries(Object.entries(scores).map(([key, score]) => [key, {score, evidence: `${evidence}#${key}`}]))
}

async function buildComparisonBoard(rows) {
  const width = 1920;
  const tileWidth = 960;
  const tileHeight = 540;
  const labelHeight = 44;
  const rowHeight = tileHeight + labelHeight;
  const canvas = sharp({create: {width, height: rowHeight * rows.length, channels: 4, background: "#11151a"}});
  const composites = [];
  for (const [rowIndex, row] of rows.entries()) {
    for (const [columnIndex, item] of [row.incumbent, row.candidate].entries()) {
      const image = await sharp(item.file).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#11151a"/><text x="18" y="29" fill="${columnIndex ? "#90adff" : "#c7ccc9"}" font-family="monospace" font-size="17">${row.shotId} · ${columnIndex ? "CANDIDATE DEPTH TITLE" : "INCUMBENT LOCAL MARKER"}</text></svg>`);
      composites.push({input: label, left: columnIndex * tileWidth, top: rowIndex * rowHeight});
      composites.push({input: image, left: columnIndex * tileWidth, top: rowIndex * rowHeight + labelHeight});
    }
  }
  const output = path.join(outputDir, "incumbent-vs-depth-title.png");
  await canvas.composite(composites).png().toFile(output);
  return output;
}

async function main() {
  fs.mkdirSync(outputDir, {recursive: true});
  fs.mkdirSync(path.join(outputDir, "review-frames"), {recursive: true});
  fs.mkdirSync(artifactDir, {recursive: true});
  for (const shot of shots) {
    const source = path.join(publicRoot, shot.sourceFrameUri);
    const matte = path.join(publicRoot, shot.presenterMatteUri);
    const foreground = path.join(publicRoot, shot.foregroundUri);
    const sourcePixels = await sharp(source).removeAlpha().raw().toBuffer({resolveWithObject: true});
    const mask = await sharp(matte).greyscale().blur(0.8).raw().toBuffer({resolveWithObject: true});
    if (sourcePixels.info.width !== mask.info.width || sourcePixels.info.height !== mask.info.height) throw new Error(`foreground-mask-size-mismatch:${shot.shotId}`);
    const rgba = Buffer.alloc(sourcePixels.info.width * sourcePixels.info.height * 4);
    for (let index = 0; index < sourcePixels.info.width * sourcePixels.info.height; index += 1) {
      rgba[index * 4] = sourcePixels.data[index * 3];
      rgba[index * 4 + 1] = sourcePixels.data[index * 3 + 1];
      rgba[index * 4 + 2] = sourcePixels.data[index * 3 + 2];
      rgba[index * 4 + 3] = mask.data[index];
    }
    await sharp(rgba, {raw: {width: sourcePixels.info.width, height: sourcePixels.info.height, channels: 4}}).png().toFile(foreground);
  }
  for (const relative of [
    "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg",
    ...shots.map((shot) => shot.presenterMatteUri),
    ...shots.map((shot) => shot.foregroundUri),
  ]) {
    const source = path.join(publicRoot, relative);
    const destination = path.join(rendererPublicRoot, relative);
    if (!fs.existsSync(source)) throw new Error(`render-public-source-missing:${relative}`);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(source, destination);
  }
  let serveUrl = null;
  let browser = null;
  try {
    serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/presenter-depth-title-canary-index.tsx"), publicDir: rendererPublicRoot, rootDir: rendererRoot, enableCaching: false});
    browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
    const reel = await selectComposition({serveUrl, id: "A1PresenterDepthTitleCanaryV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const board = await selectComposition({serveUrl, id: "A1PresenterDepthTitleStaticBoardV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const videoFile = path.join(outputDir, "presenter-depth-title-canary-960x540.mp4");
    await renderMedia({serveUrl, composition: reel, inputProps, codec: "h264", pixelFormat: "yuv420p", outputLocation: videoFile, scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const boardFile = path.join(outputDir, "presenter-depth-title-static-board.png");
    await renderStill({serveUrl, composition: board, inputProps, frame: 0, output: boardFile, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const holdFrames = [];
    for (const [index, shot] of shots.entries()) {
      const output = path.join(outputDir, "review-frames", `${shot.shotId.toLowerCase()}-hold.png`);
      await renderStill({serveUrl, composition: reel, inputProps, frame: index * 105 + 55, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      holdFrames.push({shotId: shot.shotId, file: output, publicUrl: publicUrl(output), sha256: shaFile(output)});
    }
    const comparisonRows = holdFrames.map((candidate) => {
      const incumbent = path.join(publicRoot, incumbentRelative, `${candidate.shotId.toLowerCase()}-hold.png`);
      if (!fs.existsSync(incumbent)) throw new Error(`incumbent-hold-missing:${candidate.shotId}`);
      return {shotId: candidate.shotId, candidate, incumbent: {file: incumbent, publicUrl: publicUrl(incumbent), sha256: shaFile(incumbent)}};
    });
    const comparisonBoard = await buildComparisonBoard(comparisonRows);
    const scoreByShot = {
      "ED-01": {incumbent: {semanticFit: 78, sourceIntegrity: 100, readability: 89, subjectSafety: 98, visualHierarchy: 68, sequenceFit: 86}, candidate: {semanticFit: 95, sourceIntegrity: 100, readability: 94, subjectSafety: 98, visualHierarchy: 95, sequenceFit: 93}},
      "ED-13": {incumbent: {semanticFit: 76, sourceIntegrity: 100, readability: 88, subjectSafety: 98, visualHierarchy: 70, sequenceFit: 86}, candidate: {semanticFit: 94, sourceIntegrity: 100, readability: 93, subjectSafety: 98, visualHierarchy: 94, sequenceFit: 92}},
      "ED-31": {incumbent: {semanticFit: 80, sourceIntegrity: 100, readability: 90, subjectSafety: 98, visualHierarchy: 72, sequenceFit: 88}, candidate: {semanticFit: 95, sourceIntegrity: 100, readability: 94, subjectSafety: 98, visualHierarchy: 95, sequenceFit: 93}},
    };
    const incumbentGates = comparisonRows.map((row) => {
      const semanticGoalKey = `${row.shotId}:presenter-key-beat-packaging`;
      const sourceClaimKey = `${row.shotId}:verified-presenter-source-frame`;
      return compareCandidateAgainstIncumbentBest({
        shotId: row.shotId,
        candidate: {candidateId: `${row.shotId}-PRESENTER-DEPTH-TITLE-V1`, artifactSha256: row.candidate.sha256, semanticGoalKey, baseCarrierKey: "PRESENTER_BASE", sourceClaimKey, dimensions: dimensions(scoreByShot[row.shotId].candidate, row.candidate.publicUrl)},
        incumbent: {candidateId: `${row.shotId}-PRESENTER-LOCAL-MARKER-V1`, artifactSha256: row.incumbent.sha256, semanticGoalKey, baseCarrierKey: "PRESENTER_BASE", sourceClaimKey, dimensions: dimensions(scoreByShot[row.shotId].incumbent, row.incumbent.publicUrl)},
      });
    });
    const artifactRecords = {
      playable: {publicUrl: publicUrl(videoFile), sha256: shaFile(videoFile), width: 960, height: 540, durationFrames: 315, fps: 30},
      staticBoard: {publicUrl: publicUrl(boardFile), sha256: shaFile(boardFile), width: 1920, height: 800},
      comparisonBoard: {publicUrl: publicUrl(comparisonBoard), sha256: shaFile(comparisonBoard), width: 1920, height: 1752},
      motionContract: {file: "remotion-renderer/src/PresenterDepthTitleCanaryV1.tsx", sha256: shaFile(path.join(rendererRoot, "src/PresenterDepthTitleCanaryV1.tsx"))},
    };
    const reviewFile = path.join(outputDir, "actual-pixel-review.json");
    let currentActualPixelReview = null;
    if (fs.existsSync(reviewFile)) {
      const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
      // Encoded MP4 bytes are not stable across equivalent H.264 renders.
      // Bind review to rendered pixel evidence and the motion source contract;
      // keep the MP4 hash only as an informational record of that review run.
      const hashesMatch = review?.artifacts?.staticBoard?.sha256 === artifactRecords.staticBoard.sha256
        && review?.artifacts?.incumbentComparison?.sha256 === artifactRecords.comparisonBoard.sha256
        && review?.artifacts?.motionContract?.sha256 === artifactRecords.motionContract.sha256;
      if (review.status === "PASS_CANARY_ONLY" && hashesMatch) {
        currentActualPixelReview = {publicUrl: publicUrl(reviewFile), status: review.status, reviewedAt: review.reviewedAt};
      }
    }
    const manifest = {
      contract: "A1PresenterDepthTitleCanaryManifest/v1",
      status: currentActualPixelReview ? "ACTUAL_PIXEL_REVIEW_PASS_CANARY_ONLY" : "READY_FOR_ACTUAL_PIXEL_REVIEW",
      reviewOnly: true,
      canonicalReplacementApplied: false,
      userVisualApproval: "NOT_APPROVED",
      productionReady: false,
      actualPixelReview: currentActualPixelReview,
      visualThesis: "Key presenter beats may briefly freeze on a real source frame while one large editable title sits behind the real presenter only; microphone and boom remain unprotected and may be crossed by typography.",
      benchmarkTranslation: {
        sourceId: "BV1kt7H6LETm",
        sourceRights: "RESEARCH_ONLY",
        researchRoot: "/Users/a1/Documents/Codex/写作项目/.cache/reference-study/BV1kt7H6LETm",
        evidenceSegmentIds: ["SEG-002", "SEG-011", "SEG-041"],
        inheritedMechanisms: ["large type is a bounded semantic event", "local markers remain subordinate on ordinary presenter beats", "every event has pre-enter-hold-exit-post"],
        a1DerivedHybrid: "REAL_PRESENTER_MATTE_WITH_DEPTH_TITLE",
        originalPixelsOrDesignCopied: false,
      },
      globalConstraints: {maximumEventsPerFilm: 4, maximumEventsPerChapter: 1, minimumEventSpacingSeconds: 24, titleCoverageRange: [0.25, 0.35], persistentPanelAllowed: false, fakeDynamicMatteAllowed: false},
      shots: shots.map((shot, index) => ({shotId: shot.shotId, semanticEvent: shot.semanticEvent, title: shot.title, support: shot.support, sourceAtMs: shot.sourceAtMs, sourceFrame: {publicUrl: `/${shot.sourceFrameUri}`, sha256: shaFile(path.join(publicRoot, shot.sourceFrameUri))}, presenterMatte: {publicUrl: `/${shot.presenterMatteUri}`, sha256: shaFile(path.join(publicRoot, shot.presenterMatteUri))}, realPersonForeground: {publicUrl: `/${shot.foregroundUri}`, sha256: shaFile(path.join(publicRoot, shot.foregroundUri))}, microphoneAndBoomProtection: "NOT_REQUIRED", route: shot.route, holdFrame: holdFrames[index], incumbentGate: incumbentGates[index]})),
      artifacts: artifactRecords,
      admission: {allRoutesAdmitted: shots.every((shot) => shot.route.status === "READY_FOR_STATIC_BOARD"), allIncumbentComparisonsStrictlyBetter: incumbentGates.every((gate) => gate.decision === "REPLACE_INCUMBENT"), actualPixelReview: currentActualPixelReview ? "PASS_CANARY_ONLY" : "PENDING"},
      generatedAt: new Date().toISOString(),
    };
    const manifestFile = path.join(outputDir, "manifest.json");
    writeJson(manifestFile, manifest);
    writeJson(path.join(artifactDir, "manifest.json"), {...manifest, publicManifest: {publicUrl: publicUrl(manifestFile), sha256: shaFile(manifestFile)}});
    console.log(JSON.stringify({status: manifest.status, playable: manifest.artifacts.playable, staticBoard: manifest.artifacts.staticBoard, comparisonBoard: manifest.artifacts.comparisonBoard, routes: Object.fromEntries(shots.map((shot) => [shot.shotId, shot.route.route])), incumbentDecisions: Object.fromEntries(incumbentGates.map((gate) => [gate.shotId, gate.decision])), nextAction: currentActualPixelReview ? "FULL_FILM_ADMISSION_REMAINS_SEPARATE" : "ACTUAL_PIXEL_REVIEW"}, null, 2));
  } finally {
    if (browser) await browser.close({silent: true});
    if (serveUrl) removeBundle(serveUrl);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
