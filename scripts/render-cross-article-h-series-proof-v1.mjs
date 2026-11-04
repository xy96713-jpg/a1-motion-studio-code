#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {compileRealArticleStressV1} from "../apps/studio-next/src/lib/a1-real-article-stress-v1.ts";
import {buildCanonicalVisualDirectionPlanV1} from "../apps/studio-next/src/lib/a1-canonical-visual-direction.ts";
import {buildLayeredFullPlan} from "../apps/studio-next/src/lib/a1-microbeat-layered-full-plan.ts";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = require("sharp");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

const root = process.cwd();
const phaseId = "cross-article-render-proof-v1";
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const fixturePath = path.join(root, "docs/test-fixtures/canonical-real-article-stress-v1.json");
const currentPropsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const phaseRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const reportPath = path.join(phaseRoot, "report.json");
const summaryContactSheetPath = path.join(phaseRoot, "five-lane-contact-sheet.png");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const publicReportPath = path.join(publicRoot, "report.json");
const publicSummaryContactSheetPath = path.join(publicRoot, "five-lane-contact-sheet.png");
const compositionId = "A1SystemLineHFullTimelineReview";
const concurrency = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * .25)));
const expectedKinds = ["观点评论", "方法教程", "数据解释", "产品分析", "个人叙事"];
const protectedTitleTerms = [
  "真正", "一两句", "工作流", "每个", "分配", "处理方式", "修改顺序", "处理表达",
  "一个国家", "总用电量", "单位人口", "第三个指标", "能源结构", "应该", "展示", "十个", "候选素材",
  "失败处理", "产品价值", "责任边界", "一开始", "笔记软件", "收藏夹", "每天",
  "只选一个问题",
];

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function run(command, args) {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.error?.message || result.stderr || result.stdout || `exit-${result.status}`}`);
  return result.stdout;
}

function probe(file) {
  return JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
}

function routeFor(selected) {
  if (selected === "editorial-artwork") return "gpt-editorial-artwork";
  return selected;
}

function lanePrefix(kind, index) {
  if (/观点/u.test(kind)) return "O";
  if (/教程|方法/u.test(kind)) return "T";
  if (/数据/u.test(kind)) return "D";
  if (/产品/u.test(kind)) return "P";
  if (/叙事|个人/u.test(kind)) return "N";
  return `X${index + 1}`;
}

function motionArchetypeFor(action) {
  if (/compare|对比|reject|否决/iu.test(action)) return "compare-and-reject";
  if (/focus|聚焦|select|选择/iu.test(action)) return "focus-lock";
  if (/write|写回|annotate|批注/iu.test(action)) return "annotate-write";
  if (/accumulate|累积|archive|归档/iu.test(action)) return "stack-accumulate";
  if (/branch|分支|interrupt|中断/iu.test(action)) return "interrupt-branch";
  if (/converge|收束|resolve|结论/iu.test(action)) return "converge";
  return "scale-settle";
}

async function imageStats(file) {
  const {data, info} = await sharp(file).resize(320, null, {fit: "inside"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const pixels = info.width * info.height;
  const luma = new Float32Array(pixels);
  let warmPaper = 0;
  let nearBlack = 0;
  let cobalt = 0;
  let nonPaper = 0;
  let lumaSum = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * info.channels;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    const y = .2126 * r + .7152 * g + .0722 * b;
    luma[pixel] = y;
    lumaSum += y;
    if (r > 210 && g > 202 && b > 180 && Math.abs(r - g) < 35 && r - b < 76) warmPaper += 1;
    if (y < 24) nearBlack += 1;
    if (b >= 135 && b - r >= 30 && b - g >= 15 && r < 150) cobalt += 1;
    if (Math.abs(r - 243) + Math.abs(g - 238) + Math.abs(b - 226) > 40) nonPaper += 1;
  }
  let edge = 0;
  for (let y = 0; y < info.height - 1; y += 1) {
    for (let x = 0; x < info.width - 1; x += 1) {
      const index = y * info.width + x;
      if (Math.abs(luma[index] - luma[index + 1]) + Math.abs(luma[index] - luma[index + info.width]) > 34) edge += 1;
    }
  }
  return {
    width: info.width,
    height: info.height,
    warmPaperFraction: Number((warmPaper / pixels).toFixed(4)),
    nearBlackFraction: Number((nearBlack / pixels).toFixed(4)),
    cobaltFraction: Number((cobalt / pixels).toFixed(4)),
    nonPaperFraction: Number((nonPaper / pixels).toFixed(4)),
    lumaMean: Number((lumaSum / pixels).toFixed(2)),
    edgeDensity: Number((edge / Math.max(1, (info.width - 1) * (info.height - 1))).toFixed(4)),
  };
}

async function meanAbsoluteDifference(fileA, fileB) {
  const a = await sharp(fileA).resize(192, 108, {fit: "fill"}).removeAlpha().raw().toBuffer();
  const b = await sharp(fileB).resize(192, 108, {fit: "fill"}).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return Number((sum / a.length).toFixed(4));
}

function extractFrame(input, timeSec, output) {
  run(ffmpegPath, ["-loglevel", "error", "-y", "-ss", String(timeSec.toFixed(3)), "-i", input, "-frames:v", "1", output]);
}

async function buildContactSheet(samples, outputPath) {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 52;
  const columns = 3;
  const rows = Math.ceil(samples.length / columns);
  const composites = [];
  for (const [index, sample] of samples.entries()) {
    const left = index % columns * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(sample.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d9d5ca"/><text x="16" y="23" fill="#111315" font-family="Arial,sans-serif" font-size="16">${sample.label}</text><text x="16" y="42" fill="#2848a8" font-family="Arial,sans-serif" font-size="12">np ${sample.stats.nonPaperFraction} edge ${sample.stats.edgeDensity} blue ${sample.stats.cobaltFraction}</text></svg>`);
    composites.push({input: image, left, top}, {input: label, left, top: top + tileHeight});
  }
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(outputPath);
  return {width: columns * tileWidth, height: rows * (tileHeight + labelHeight)};
}

async function buildFiveLaneContactSheet(lanes, outputPath) {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 70;
  const columns = 2;
  const rows = Math.ceil(lanes.length / columns);
  const composites = [];
  for (const [index, lane] of lanes.entries()) {
    const left = index % columns * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const sample = lane.samples[Math.min(1, lane.samples.length - 1)];
    const image = await sharp(path.join(root, sample.file)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d9d5ca"/><text x="16" y="23" fill="#111315" font-family="Arial,sans-serif" font-size="16">${lane.fixture.kind} · ${lane.canonical.chapterCount}/${lane.canonical.semanticSceneCount}/${lane.canonical.microEventCount}</text><text x="16" y="44" fill="#2848a8" font-family="Arial,sans-serif" font-size="12">np ${lane.aggregate.averageNonPaperFraction} edge ${lane.aggregate.averageEdgeDensity} blue ${lane.aggregate.cobaltCoverageRatio}</text><text x="16" y="61" fill="#111315" font-family="Arial,sans-serif" font-size="11">${lane.fixture.id}</text></svg>`);
    composites.push({input: image, left, top}, {input: label, left, top: top + tileHeight});
  }
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(outputPath);
  return {width: columns * tileWidth, height: rows * (tileHeight + labelHeight)};
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function min(values) {
  return values.length ? Math.min(...values) : 0;
}

function max(values) {
  return values.length ? Math.max(...values) : 0;
}

function titleLineBreakIssues(scene) {
  const lines = Array.isArray(scene.titleLines) ? scene.titleLines : [];
  const joined = lines.join("");
  const boundaries = [];
  let cursor = 0;
  for (const line of lines.slice(0, -1)) {
    cursor += Array.from(line).length;
    boundaries.push(cursor);
  }
  const issues = [];
  for (const term of protectedTitleTerms) {
    let start = joined.indexOf(term);
    while (start >= 0) {
      const termBoundaries = new Set(Array.from({length: Math.max(0, Array.from(term).length - 1)}, (_, index) => start + index + 1));
      const brokenAt = boundaries.find((boundary) => termBoundaries.has(boundary));
      if (brokenAt) issues.push({beatId: scene.beatId, term, lines, brokenAt});
      start = joined.indexOf(term, start + term.length);
    }
  }
  return issues;
}

function buildPropsForFixture({fixture, fixtureIndex, currentProps, backgroundLayer}) {
  const visualMaster = {id: "july1-retro-print-archive-wireframe-v1", sha256: currentProps.visualPreference.sha256};
  const compiled = compileRealArticleStressV1({...fixture, visualMaster});
  const direction = buildCanonicalVisualDirectionPlanV1({canonical: compiled.canonical, masterHash: visualMaster.sha256});
  if (compiled.canonical.audit.status !== "PASS") throw new Error(`canonical-failed:${fixture.id}:${compiled.canonical.audit.blockers.join(",")}`);
  if (direction.audit.status !== "PASS") throw new Error(`direction-failed:${fixture.id}:${direction.audit.blockers.join(",")}`);

  const eventByScene = new Map(compiled.canonical.microEvents.map((event) => [event.semanticSceneId, event]));
  const directionByScene = Object.fromEntries(direction.sceneDirections.map((scene) => [scene.sceneId, {layout: scene.layout, motion: scene.motion}]));
  const prefix = lanePrefix(fixture.kind, fixtureIndex);
  const beats = compiled.canonical.semanticScenes.map((scene, index) => {
    const event = eventByScene.get(scene.id);
    const directionForScene = directionByScene[scene.id];
    return {
      id: `${prefix}${String(fixtureIndex + 1).padStart(2, "0")}-B${String(index + 1).padStart(2, "0")}`,
      macroId: scene.id,
      startMs: scene.startMs,
      endMs: scene.endMs,
      screenText: event?.screenText || scene.title,
      route: routeFor(scene.route.selected),
      animationTier: index === 0 || index === compiled.canonical.semanticScenes.length - 1 ? "formal-highlight" : "standard-typography",
      recordingPolicy: {replaceable: scene.recordingReplaceable},
      layoutFamily: directionForScene.layout.selected.family,
      motionArchetype: motionArchetypeFor(scene.primaryAction),
      assetPath: null,
      semanticRole: scene.argumentRole,
      visualJob: scene.visualJob,
      entityContext: fixture.title,
      semanticAction: scene.primaryAction,
    };
  });

  const props = buildLayeredFullPlan({
    projectId: `cross-article-render-proof-${fixture.id}`,
    productionHash: compiled.canonical.planHash,
    variationHash: direction.contentHash,
    visualMasterHash: currentProps.visualMasterHash,
    visualPreference: currentProps.visualPreference,
    beats,
    background: {path: backgroundLayer.asset, sha256: backgroundLayer.assetSha256},
    artworkByPath: {},
    specialByBeat: {},
    visualDirectionByMacro: directionByScene,
  });
  return {compiled, direction, props};
}

async function renderLane({fixture, fixtureIndex, serveUrl, browser, currentProps, backgroundLayer}) {
  const laneRoot = path.join(phaseRoot, fixture.id);
  const publicLaneRoot = path.join(publicRoot, fixture.id);
  const frameRoot = path.join(laneRoot, "sampled-frames");
  const propsPath = path.join(laneRoot, "h-series-props.json");
  const mp4Path = path.join(laneRoot, "h-series-540p-silent.mp4");
  const contactSheetPath = path.join(laneRoot, "contact-sheet.png");
  const publicMp4Path = path.join(publicLaneRoot, "h-series-540p-silent.mp4");
  const publicContactSheetPath = path.join(publicLaneRoot, "contact-sheet.png");
  fs.mkdirSync(frameRoot, {recursive: true});
  fs.mkdirSync(publicLaneRoot, {recursive: true});

  const {compiled, props} = buildPropsForFixture({fixture, fixtureIndex, currentProps, backgroundLayer});
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  const titleIssues = props.scenes.flatMap(titleLineBreakIssues);

  const composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  const startedAt = Date.now();
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    outputLocation: mp4Path,
    frameRange: [0, composition.durationInFrames - 1],
    scale: .5,
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
    jpegQuality: 82,
    concurrency,
    hardwareAcceleration: "if-possible",
    overwrite: true,
    puppeteerInstance: browser,
    logLevel: "warn",
  });
  const renderElapsedMs = Date.now() - startedAt;

  const mediaProbe = probe(mp4Path);
  const videoStream = mediaProbe.streams.find((stream) => stream.codec_type === "video") || {};
  const durationSec = Number(mediaProbe.format.duration);
  const selectedScenes = props.scenes.length <= 6
    ? props.scenes
    : Array.from({length: 6}, (_, index) => props.scenes[Math.min(props.scenes.length - 1, Math.round(index * (props.scenes.length - 1) / 5))]);
  const sampleTimes = selectedScenes.map((scene) => {
    const holdFrame = scene.startFrame + Math.min(scene.durationInFrames - 2, Math.max(12, Math.round(scene.durationInFrames * .58)));
    return {
      beatId: scene.beatId,
      screenText: scene.screenText,
      timeSec: Math.max(.25, Math.min(durationSec - .2, Number((holdFrame / 30).toFixed(3)))),
    };
  });
  const samples = [];
  for (const [index, sampleTime] of sampleTimes.entries()) {
    const file = path.join(frameRoot, `${String(index + 1).padStart(2, "0")}-${sampleTime.beatId}-${String(Math.round(sampleTime.timeSec * 1000)).padStart(6, "0")}ms.png`);
    extractFrame(mp4Path, sampleTime.timeSec, file);
    samples.push({label: `${sampleTime.beatId} · ${sampleTime.timeSec.toFixed(1)}s`, beatId: sampleTime.beatId, screenText: sampleTime.screenText, timeSec: sampleTime.timeSec, file, sha256: sha256(file), stats: await imageStats(file)});
  }
  const contactSize = await buildContactSheet(samples, contactSheetPath);
  const sampleDiffs = [];
  for (let index = 1; index < samples.length; index += 1) sampleDiffs.push(await meanAbsoluteDifference(samples[index - 1].file, samples[index].file));

  const aggregate = {
    sampleCount: samples.length,
    averageNonPaperFraction: Number(average(samples.map((sample) => sample.stats.nonPaperFraction)).toFixed(4)),
    averageEdgeDensity: Number(average(samples.map((sample) => sample.stats.edgeDensity)).toFixed(4)),
    averageCobaltFraction: Number(average(samples.map((sample) => sample.stats.cobaltFraction)).toFixed(4)),
    cobaltCoverageRatio: Number((samples.filter((sample) => sample.stats.cobaltFraction >= .006).length / samples.length).toFixed(4)),
    lowInformationFrameCount: samples.filter((sample) => sample.stats.nonPaperFraction < .12 || sample.stats.edgeDensity < .012).length,
    maxNearBlackFraction: Number(max(samples.map((sample) => sample.stats.nearBlackFraction)).toFixed(4)),
    maxSampleDiff: Number(max(sampleDiffs).toFixed(4)),
  };
  const thresholds = {
    minAverageNonPaperFraction: .16,
    minAverageEdgeDensity: .035,
    maxLowInformationFrameCount: 0,
    minAverageCobaltFraction: .006,
    minCobaltCoverageRatio: .5,
    maxNearBlackFraction: .18,
    minMaxSampleDiff: .55,
  };
  const checks = {
    renderedWithHSeriesRenderer: props.contract === "A1MicrobeatLayeredFullPlan/v1" && props.visualPreference.id === "retro-print-archive-wireframe" && props.visualMasterHash === currentProps.visualMasterHash,
    fixtureIsExpectedLane: expectedKinds.includes(fixture.kind),
    dynamicSceneCountNotCurrentGoldenCount: props.scenes.length !== 47 && props.scenes.length === compiled.canonical.semanticScenes.length,
    videoShape: videoStream.width === 960 && videoStream.height === 540 && videoStream.codec_name === "h264" && /^yuvj?420p$/u.test(String(videoStream.pix_fmt || "")),
    visualDensity: aggregate.averageNonPaperFraction >= thresholds.minAverageNonPaperFraction && aggregate.averageEdgeDensity >= thresholds.minAverageEdgeDensity && aggregate.lowInformationFrameCount <= thresholds.maxLowInformationFrameCount,
    semanticCobaltPresent: aggregate.averageCobaltFraction >= thresholds.minAverageCobaltFraction && aggregate.cobaltCoverageRatio >= thresholds.minCobaltCoverageRatio,
    noBlackWorkbenchScreens: aggregate.maxNearBlackFraction <= thresholds.maxNearBlackFraction,
    temporalVisualVariation: aggregate.maxSampleDiff >= thresholds.minMaxSampleDiff,
    titleLineQuality: titleIssues.length === 0,
  };
  const failures = Object.entries(checks).filter(([, passed]) => passed !== true).map(([key]) => key);

  fs.copyFileSync(mp4Path, publicMp4Path);
  fs.copyFileSync(contactSheetPath, publicContactSheetPath);

  return {
    status: failures.length ? "FAIL" : "PASS",
    fixture: {id: fixture.id, kind: fixture.kind, title: fixture.title, sourceUrl: fixture.sourceUrl, sourceTextSha256: compiled.source.textSha256},
    canonical: {projectId: compiled.canonical.projectId, planHash: compiled.canonical.planHash, chapterCount: compiled.canonical.counts.chapterCount, semanticSceneCount: compiled.canonical.counts.semanticSceneCount, microEventCount: compiled.canonical.counts.microEventCount},
    props: {path: path.relative(root, propsPath), sha256: sha256(propsPath), sceneCount: props.scenes.length, reviewBeatIds: props.reviewBeatIds, familyCounts: props.familyCounts, contentHash: props.contentHash},
    render: {compositionId, path: path.relative(root, mp4Path), publicUrl: `/generated/system-line/${phaseId}/${fixture.id}/h-series-540p-silent.mp4`, sha256: sha256(mp4Path), bytes: fs.statSync(mp4Path).size, durationSec, width: videoStream.width, height: videoStream.height, codec: videoStream.codec_name, pixFmt: videoStream.pix_fmt, renderElapsedMs},
    samples: samples.map((sample) => ({label: sample.label, timeSec: sample.timeSec, file: path.relative(root, sample.file), sha256: sample.sha256, stats: sample.stats})),
    sampleDiffs,
    aggregate,
    thresholds,
    checks,
    failures,
    titleIssues,
    contactSheet: {path: path.relative(root, contactSheetPath), publicUrl: `/generated/system-line/${phaseId}/${fixture.id}/contact-sheet.png`, sha256: sha256(contactSheetPath), ...contactSize},
  };
}

for (const required of [entryPoint, fixturePath, currentPropsPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}
fs.mkdirSync(phaseRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const fixtureBundle = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const fixtures = expectedKinds.map((kind) => fixtureBundle.cases.find((item) => item.kind === kind));
const missingKinds = expectedKinds.filter((kind, index) => !fixtures[index]);
if (missingKinds.length) throw new Error(`fixture-kinds-missing:${missingKinds.join(",")}`);

const currentProps = JSON.parse(fs.readFileSync(currentPropsPath, "utf8"));
const backgroundLayer = currentProps.scenes?.[0]?.layers?.find((layer) => layer.kind === "background-plate");
if (!backgroundLayer?.asset || !backgroundLayer?.assetSha256) throw new Error("current-h-series-background-asset-missing");

const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const lanes = [];
try {
  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    lanes.push(await renderLane({fixture, fixtureIndex, serveUrl, browser, currentProps, backgroundLayer}));
  }
} finally {
  await browser.close({silent: true});
}

const summaryContactSize = await buildFiveLaneContactSheet(lanes, summaryContactSheetPath);
fs.copyFileSync(summaryContactSheetPath, publicSummaryContactSheetPath);

const allFailures = lanes.flatMap((lane) => lane.failures.map((failure) => `${lane.fixture.id}:${failure}`));
const structureSignatures = new Set(lanes.map((lane) => `${lane.canonical.chapterCount}/${lane.canonical.semanticSceneCount}/${lane.canonical.microEventCount}`));
const laneKinds = new Set(lanes.map((lane) => lane.fixture.kind));
const summary = {
  laneCount: lanes.length,
  lanePassCount: lanes.filter((lane) => lane.status === "PASS").length,
  expectedKinds,
  observedKinds: [...laneKinds],
  distinctStructureSignatures: structureSignatures.size,
  structureSignatures: [...structureSignatures],
  totalSceneCount: lanes.reduce((sum, lane) => sum + lane.canonical.semanticSceneCount, 0),
  totalMicroEventCount: lanes.reduce((sum, lane) => sum + lane.canonical.microEventCount, 0),
  minAverageNonPaperFraction: Number(min(lanes.map((lane) => lane.aggregate.averageNonPaperFraction)).toFixed(4)),
  minAverageEdgeDensity: Number(min(lanes.map((lane) => lane.aggregate.averageEdgeDensity)).toFixed(4)),
  minCobaltCoverageRatio: Number(min(lanes.map((lane) => lane.aggregate.cobaltCoverageRatio)).toFixed(4)),
  maxLowInformationFrameCount: max(lanes.map((lane) => lane.aggregate.lowInformationFrameCount)),
  maxNearBlackFraction: Number(max(lanes.map((lane) => lane.aggregate.maxNearBlackFraction)).toFixed(4)),
};
const summaryChecks = {
  fiveExpectedLanesRendered: summary.laneCount === 5 && summary.lanePassCount === 5 && expectedKinds.every((kind) => laneKinds.has(kind)),
  dynamicStructuresDoNotCollapse: summary.distinctStructureSignatures >= 3 && lanes.every((lane) => lane.canonical.semanticSceneCount !== 47),
  allLaneVisualGatesPass: allFailures.length === 0,
  noFalseFinalClaim: true,
};
const summaryFailures = Object.entries(summaryChecks).filter(([, passed]) => passed !== true).map(([key]) => key);
const status = allFailures.length || summaryFailures.length ? "FAIL" : "PASS";

const report = {
  contract: "A1CrossArticleHSeriesRenderProof/v1",
  phaseId,
  proofMode: "five-lane-render",
  status,
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  finalRenderAllowed: false,
  visualMasterId: "july1-retro-print-archive-wireframe-v1",
  fixture: lanes[0]?.fixture || null,
  canonical: lanes[0]?.canonical || null,
  render: lanes[0]?.render || null,
  aggregate: summary,
  lanes,
  checks: summaryChecks,
  failures: [...summaryFailures, ...allFailures],
  contactSheet: {path: path.relative(root, summaryContactSheetPath), publicUrl: `/generated/system-line/${phaseId}/five-lane-contact-sheet.png`, sha256: sha256(summaryContactSheetPath), ...summaryContactSize},
  nextAction: status === "PASS" ? "cross-article-h-baseline-quality-v1" : "repair-five-lane-cross-article-render-proof",
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  status: report.status,
  proofMode: report.proofMode,
  summary,
  failures: report.failures,
  lanes: lanes.map((lane) => ({id: lane.fixture.id, kind: lane.fixture.kind, status: lane.status, structure: `${lane.canonical.chapterCount}/${lane.canonical.semanticSceneCount}/${lane.canonical.microEventCount}`, mp4: lane.render.publicUrl})),
  reportPath: path.relative(root, reportPath),
  publicReportPath: path.relative(root, publicReportPath),
  nextAction: report.nextAction,
}, null, 2));
if (status !== "PASS") process.exitCode = 2;
