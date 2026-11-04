#!/usr/bin/env node
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const rootUrl = process.env.A1_SYSTEM_LINE_URL || "http://localhost:4311";
const sourcePath = process.env.A1_UNSEEN_ARTICLE_PATH || "/Users/a1/Documents/Codex/声音/docs/FULL_PREVIEW_READINESS.md";
const title = process.env.A1_UNSEEN_ARTICLE_TITLE || "为什么完整预览不能只看代表样片";
const sourceUrl = process.env.A1_UNSEEN_ARTICLE_SOURCE_URL || "";
const directorRoute = process.env.A1_UNSEEN_ARTICLE_ROUTE === "director" || Boolean(sourceUrl);
const registryPath = path.join(root, ".codex-artifacts/system-progress-system-line/unseen-real-article-e2e-v1/seen-source-hashes.json");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const relative = (file) => path.relative(root, file);

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {cwd: options.cwd || root, env: {...process.env, ...(options.env || {})}, stdio: ["ignore", "pipe", "pipe"]});
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({code, stdout, stderr}));
  });
}

function maxRun(items) {
  let maximum = 0, current = 0, previous = "";
  for (const item of items) {
    if (item.selectedSlug === previous) current += 1;
    else { previous = item.selectedSlug; current = 1; }
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function probe(file) {
  const result = fs.readFileSync(file);
  if (!result.length) throw new Error(`empty-media:${file}`);
  return run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
}

async function frameStats(file) {
  const stats = await sharp(file).removeAlpha().stats();
  return {
    width: stats.channels[0]?.max != null ? (await sharp(file).metadata()).width : 0,
    height: (await sharp(file).metadata()).height || 0,
    channelStdDev: stats.channels.slice(0, 3).map((channel) => Number(channel.stdev.toFixed(3))),
  };
}

if (!fs.existsSync(sourcePath)) throw new Error(`unseen-real-article-missing:${sourcePath}`);
if (sourcePath.startsWith(path.join(root, ".codex-artifacts")) || /(?:fixture|test)/iu.test(path.basename(sourcePath))) {
  throw new Error(`source-must-be-real-non-fixture-document:${sourcePath}`);
}
const sourceText = fs.readFileSync(sourcePath, "utf8");
const sourceSha256 = sha256(sourceText);
const registry = readJson(registryPath) || {contract: "A1UnseenRealArticleRegistry/v1", entries: []};
const reverifyCurrentBinding = process.env.A1_UNSEEN_ARTICLE_REVERIFY === "1";
const priorRegistryEntry = registry.entries.find((entry) => entry.sourceSha256 === sourceSha256) || null;
const observedBaselineFiles = [
  path.join(root, "article.txt"),
  "/Users/a1/Documents/Codex/声音/docs/MOTION_QUALITY_V1.md",
].filter((file) => fs.existsSync(file));
const observedBaselineHashes = observedBaselineFiles.map((file) => ({path: file, sha256: sha256File(file)}));
if (priorRegistryEntry && !reverifyCurrentBinding) throw new Error(`source-already-accepted:${sourceSha256}`);
if (observedBaselineHashes.some((entry) => entry.sha256 === sourceSha256)) throw new Error(`source-already-observed-in-repair-pass:${sourceSha256}`);

const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/unseen-real-article-e2e-v1", sourceSha256.slice(0, 16));
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/unseen-real-article-e2e-v1", sourceSha256.slice(0, 16));
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const requestPath = path.join(artifactRoot, "render-request.json");
const contactSheetPath = path.join(artifactRoot, "four-frame-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "four-frame-contact-sheet.png");
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const failures = [];
const check = (id, pass, detail = null) => { if (!pass) failures.push(id); return {id, pass, detail}; };
const response = await fetch(`${rootUrl}${directorRoute ? "/api/a1-codex-director" : "/api/a1-compile-template-timeline"}`, {
  method: "POST",
  headers: {"content-type": "application/json"},
  body: JSON.stringify(directorRoute ? {title, sourceText, sourceUrl} : {title, sourceText}),
});
const payload = await response.json().catch(() => ({}));
const items = payload.props?.items || [];
const motionScenes = payload.props?.motionIrV2?.scenes || [];
const slugs = items.map((item) => item.selectedSlug);
const machineChecks = [
  check("source-is-real-local-document", path.isAbsolute(sourcePath) && fs.existsSync(sourcePath), sourcePath),
  check("source-has-unseen-first-acceptance", !priorRegistryEntry || (reverifyCurrentBinding && Boolean(priorRegistryEntry.acceptedAt)), {mode: priorRegistryEntry ? "current-binding-reverification" : "first-unseen-run", priorRegistryEntry}),
  check("source-was-unseen-in-observed-corpus", !observedBaselineHashes.some((entry) => entry.sha256 === sourceSha256), observedBaselineHashes),
  check("compile-request-succeeded", response.ok && payload.ok === true, {status: response.status, error: payload.error || null}),
  check("compiler-contract", payload.compilerContract === "A1ArticleTemplateCompiler/v1"),
  check("article-route-contract", !directorRoute || payload.contract === "A1CodexArticleDirectorResponse/v1", {route: directorRoute ? "director" : "compiler", contract: payload.contract}),
  check("source-url-bound", !directorRoute || payload.state?.sourceUrl === sourceUrl, {expected: sourceUrl, actual: payload.state?.sourceUrl || ""}),
  check("exact-sentence-coverage", payload.articleUnderstanding?.coverage?.exact === true, payload.articleUnderstanding?.coverage || null),
  check("director-sized-shot-count", items.length >= 4 && items.length <= 9, items.length),
  check("connected-article-film", payload.articleFilmPlan?.quality?.connected === true),
  check("opening-and-closing", directorRoute
    ? payload.state?.shots?.[0]?.role === "定题"
      && payload.state?.shots?.at(-1)?.role === "收束"
      && Boolean(items[0]?.templateProps?.imageUrl || items[0]?.templateProps?.title)
      && ["terminal-closing", "closing-title"].includes(payload.beats?.at(-1)?.gateId)
    : payload.beats?.[0]?.gateId === "opening-title" && ["terminal-closing", "closing-title"].includes(payload.beats?.at(-1)?.gateId)),
  check("template-family-variety", new Set(slugs).size >= 4, slugs),
  check("no-card-wall-run", maxRun(items) <= 2, slugs),
  check("authoritative-motion-ir", payload.props?.motionIrV2?.contract === "A1MotionIR/v2" && motionScenes.length === items.length),
  check("motion-ir-scene-order", motionScenes.every((scene, index) => scene.sceneId === items[index]?.id)),
  check("material-promotion-gates", items.every((item) => item.templateProps?.templateMaterialPromotionGate?.runtimeSlug === item.selectedSlug)),
  check("no-visual-props-on-text-only", items.every((item) => item.templateProps?.templateMaterialPromotionGate?.allowedVisualMode !== "template-text-only" || (!item.templateProps?.imageUrl && !(item.templateProps?.imageUrls || []).length && !(item.templateProps?.imageRoles || []).length))),
  check("asset-discovery-bound", !directorRoute || payload.assetDiscovery?.contract === "A1AutomaticAssetCandidateDiscovery/v1", payload.assetDiscovery || null),
  check("layer-completeness-contract", payload.layerCompleteness?.contract === "A1ArticleLayerCompletenessSummary/v1" && payload.layerCompleteness?.totalShots === items.length && payload.layerCompleteness?.blockedShotCount === 0, payload.layerCompleteness || null),
  check("production-gate-layer-bound", payload.gates?.exportReady === true && payload.gates?.results?.every((result) => result.layerGate === "pass"), payload.gates || null),
];

if (failures.length) {
  const report = {contract: "A1UnseenRealArticleE2E/v1", status: "COMPILE_BLOCKED", generatedAt: new Date().toISOString(), title, sourcePath, sourceSha256, machineChecks, failures};
  writeJson(reportPath, report); writeJson(publicReportPath, report);
  console.error(JSON.stringify({...report, reportPath: relative(reportPath)}, null, 2));
  process.exit(2);
}

const renderRequest = {
  contract: "A1TemplateTimelineRenderRequest/v1",
  projectTitle: title,
  props: payload.props,
  gates: payload.gates || {exportReady: true, blockedShotCount: 0},
  bridge: {contract: "A1UnseenRealArticleRenderBridge/v1", sceneCount: items.length, rendererContract: "A1ArticleTemplateTimeline/v1", sourceSha256},
};
writeJson(requestPath, renderRequest);
const renderKey = `unseen-real-${sourceSha256.slice(0, 12)}`;
const render = await run(process.execPath, ["scripts/render-template-timeline-proof.mjs"], {
  cwd: path.join(root, "apps/studio-next"),
  env: {
    A1_NEXT_WORKBENCH_URL: rootUrl,
    A1_TEMPLATE_TIMELINE_RENDER_REQUEST: requestPath,
    A1_TEMPLATE_TIMELINE_RENDER_KEY: renderKey,
    A1_TEMPLATE_TIMELINE_ISOLATED: "1",
  },
});
machineChecks.push(check("isolated-render-succeeded", render.code === 0, (render.stderr || render.stdout).slice(-4000)));
let renderReport = null;
if (render.code === 0) {
  const renderReportPath = path.join(root, "apps/studio-next/public/generated/studio-next-template-timeline", renderKey, "report.json");
  renderReport = readJson(renderReportPath);
  machineChecks.push(check("isolated-render-contract", renderReport?.contract === "A1NextTemplateTimelineProof/v1" && renderReport?.isolatedRender === true, renderReport));
  machineChecks.push(check("render-admission-contract", renderReport?.renderAdmission?.contract === "A1TemplateRenderAdmission/v1" && renderReport.renderAdmission.items?.length === items.length && renderReport.renderAdmission.items.every((entry) => ["production-admitted-source", "editorial-archetype-fallback"].includes(entry.policy)), renderReport?.renderAdmission || null));
}

let media = null;
const sampledFrames = [];
if (renderReport?.nextPublicOutputPath && fs.existsSync(renderReport.nextPublicOutputPath)) {
  const probed = await probe(renderReport.nextPublicOutputPath);
  const probeJson = probed.code === 0 ? JSON.parse(probed.stdout) : null;
  const video = probeJson?.streams?.find((stream) => stream.codec_type === "video");
  const durationSec = Number(probeJson?.format?.duration || 0);
  media = {path: renderReport.nextPublicOutputPath, publicUrl: renderReport.publicUrl, sha256: sha256File(renderReport.nextPublicOutputPath), bytes: fs.statSync(renderReport.nextPublicOutputPath).size, durationSec, width: video?.width || 0, height: video?.height || 0, codec: video?.codec_name || ""};
  machineChecks.push(check("rendered-media-profile", media.codec === "h264" && media.width === 960 && media.height === 540 && media.durationSec + 0.25 >= Number(renderReport.totalDurationSec || 0), media));
  const starts = [];
  let cursor = 0;
  for (const item of items) { starts.push(cursor); cursor += Number(item.durationSec || 0); }
  const indexes = Array.from(new Set([0, Math.floor(items.length / 3), Math.floor(items.length * 2 / 3), items.length - 1]));
  for (const [sampleIndex, itemIndex] of indexes.entries()) {
    const timeSec = starts[itemIndex] + Number(items[itemIndex]?.durationSec || 1) * 0.58;
    const file = path.join(artifactRoot, `frame-${String(sampleIndex + 1).padStart(2, "0")}-${itemIndex + 1}.png`);
    const extracted = await run(ffmpegPath, ["-loglevel", "error", "-y", "-ss", timeSec.toFixed(3), "-i", media.path, "-frames:v", "1", file]);
    if (extracted.code === 0) sampledFrames.push({itemIndex, slug: items[itemIndex]?.selectedSlug, timeSec, path: file, sha256: sha256File(file), stats: await frameStats(file)});
  }
  machineChecks.push(check("four-stage-frame-samples", sampledFrames.length === 4, sampledFrames.length));
  machineChecks.push(check("sampled-frames-nonblank", sampledFrames.every((frame) => frame.stats.width === 960 && frame.stats.height === 540 && frame.stats.channelStdDev.some((value) => value >= 8)), sampledFrames.map((frame) => frame.stats)));
  if (sampledFrames.length === 4) {
    const tiles = await Promise.all(sampledFrames.map((frame) => sharp(frame.path).resize(480, 270).png().toBuffer()));
    await sharp({create: {width: 970, height: 550, channels: 3, background: "#dfe2dd"}})
      .composite(tiles.map((input, index) => ({input, left: (index % 2) * 490, top: Math.floor(index / 2) * 280})))
      .png().toFile(contactSheetPath);
    fs.copyFileSync(contactSheetPath, publicContactSheetPath);
  }
}

const finalFailures = Array.from(new Set(failures));
const report = {
  contract: "A1UnseenRealArticleE2E/v1",
  route: directorRoute ? "A1VisualDirectorProject/v1" : "A1ArticleTemplateCompiler/v1",
  status: finalFailures.length ? "MACHINE_BLOCKED" : "MACHINE_PASS_DIRECT_VISUAL_REVIEW_PENDING",
  generatedAt: new Date().toISOString(),
  title,
  sourcePath,
  sourceSha256,
  freshness: {registryPath: relative(registryPath), previousAcceptedCount: registry.entries.length, mode: priorRegistryEntry ? "current-binding-reverification" : "first-unseen-run", priorRegistryEntry, observedBaselineHashes},
  compilation: {route: directorRoute ? "a1-codex-director" : "a1-compile-template-timeline", sourceUrl, shotCount: items.length, slugs, maxTemplateRun: maxRun(items), templateFamilyCount: new Set(slugs).size, roleArc: payload.articleFilmPlan?.roleArc || [], acceptedSentenceCount: payload.articleUnderstanding?.sentences?.length || 0, exactCoverage: payload.articleUnderstanding?.coverage?.exact === true, motionSceneCount: motionScenes.length, imageBearingShotCount: items.filter((item) => Boolean(item.templateProps?.imageUrl) || (Array.isArray(item.templateProps?.imageUrls) && item.templateProps.imageUrls.length > 0)).length, adoptedAssetCount: (payload.assetDiscovery?.autoAdoptedAssetIds || payload.assetDiscovery?.adoptedAssetIds || []).length, reviewOnlyCandidateCount: payload.assetDiscovery ? Math.max(0, Number(payload.assetDiscovery.candidateCount || 0) - Number((payload.assetDiscovery?.autoAdoptedAssetIds || payload.assetDiscovery?.adoptedAssetIds || []).length)) : 0},
  render: {renderKey, requestPath: relative(requestPath), isolated: true, report: renderReport, media},
  sampledFrames: sampledFrames.map((frame) => ({...frame, path: relative(frame.path)})),
  contactSheet: fs.existsSync(contactSheetPath) ? {path: relative(contactSheetPath), publicUrl: `/generated/system-line/unseen-real-article-e2e-v1/${sourceSha256.slice(0, 16)}/four-frame-contact-sheet.png`, sha256: sha256File(contactSheetPath)} : null,
  machineChecks,
  failures: finalFailures,
  directVisualReview: {required: true, status: "PENDING", reportPath: relative(path.join(artifactRoot, "direct-visual-review.json"))},
  nextAction: finalFailures.length ? "repair-and-rerun-with-the-same-unregistered-source" : "inspect-the-four-frame-contact-sheet-and-record-operator-review",
};
writeJson(reportPath, report); writeJson(publicReportPath, report);
console.log(JSON.stringify({...report, reportPath: relative(reportPath)}, null, 2));
if (finalFailures.length) process.exitCode = 2;
