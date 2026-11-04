#!/usr/bin/env node
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const sourceRequestPath = path.join(root, ".codex-artifacts/system-progress-system-line/unseen-real-article-e2e-v1/fca1a0bc9604e8f9/render-request.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/template-render-admission-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/template-render-admission-v1");
const requestPath = path.join(artifactRoot, "render-request.json");
const framePath = path.join(artifactRoot, "stat-counter-fallback-frame.png");
const publicFramePath = path.join(publicRoot, "stat-counter-fallback-frame.png");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const renderKey = "template-render-admission-v1";
const renderReportPath = path.join(root, "apps/studio-next/public/generated/studio-next-template-timeline", renderKey, "report.json");
const stubSourcePath = path.join(root, "external/rve-remotion-templates/templates/stat-counter/index.tsx");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args, options = {}) => new Promise((resolve) => {
  const child = spawn(command, args, {cwd: options.cwd || root, env: {...process.env, ...(options.env || {})}, stdio: ["ignore", "pipe", "pipe"]});
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({code, stdout, stderr}));
});

if (!fs.existsSync(sourceRequestPath)) throw new Error(`acceptance-render-request-missing:${sourceRequestPath}`);
const sourceRequest = readJson(sourceRequestPath);
const sourceItem = structuredClone(sourceRequest.props.items[2]);
sourceItem.id = "admission-stat-counter";
sourceItem.selectedSlug = "stat-counter";
sourceItem.routeGroup = "Data & Metrics";
sourceItem.durationSec = 3.6;
sourceItem.templatePack = sourceItem.templatePack ? {...sourceItem.templatePack, slug: "stat-counter"} : null;
sourceItem.article = {...(sourceItem.article || {}), sectionRole: "proof", screenText: "未通过视觉准入的统计模板", claim: "未通过视觉准入的统计模板"};
sourceItem.narrative = {...(sourceItem.narrative || {}), storyRole: "proof"};
sourceItem.templateProps = {
  ...(sourceItem.templateProps || {}),
  title: "未通过视觉准入的统计模板",
  supportText: "必须降级到证据原型，不能显示 stub",
  value: 76,
};
const sourceScene = structuredClone(sourceRequest.props.motionIrV2.scenes[2]);
sourceScene.sceneId = sourceItem.id;
sourceScene.timing = {...sourceScene.timing, frameStart: 0, frameDuration: 108, duration: 3.6};
const request = {
  contract: "A1TemplateTimelineRenderRequest/v1",
  projectTitle: "模板渲染准入安全降级",
  props: {...sourceRequest.props, title: "模板渲染准入安全降级", items: [sourceItem], motionIrV2: {...sourceRequest.props.motionIrV2, scenes: [sourceScene]}},
  gates: {exportReady: true, blockedShotCount: 0},
  bridge: {contract: "A1TemplateRenderAdmissionSmoke/v1", sceneCount: 1, rendererContract: "A1ArticleTemplateTimeline/v1"},
};
writeJson(requestPath, request);
const render = await run(process.execPath, ["scripts/render-template-timeline-proof.mjs"], {
  cwd: path.join(root, "apps/studio-next"),
  env: {A1_NEXT_WORKBENCH_URL: "http://localhost:4311", A1_TEMPLATE_TIMELINE_RENDER_REQUEST: requestPath, A1_TEMPLATE_TIMELINE_RENDER_KEY: renderKey, A1_TEMPLATE_TIMELINE_ISOLATED: "1"},
});
const failures = [];
if (render.code !== 0) failures.push("isolated-render-failed");
const renderReport = fs.existsSync(renderReportPath) ? readJson(renderReportPath) : null;
const admissionItem = renderReport?.renderAdmission?.items?.[0] || null;
if (renderReport?.renderAdmission?.contract !== "A1TemplateRenderAdmission/v1") failures.push("admission-contract-missing");
if (admissionItem?.policy !== "editorial-archetype-fallback" || admissionItem?.fallbackArchetype !== "evidence-source") failures.push("stub-source-not-routed-to-evidence-fallback");
if (!fs.readFileSync(stubSourcePath, "utf8").includes("data-stub=")) failures.push("smoke-input-is-not-a-known-stub-source");

let frameStats = null;
const mediaPath = renderReport?.nextPublicOutputPath || "";
if (mediaPath && fs.existsSync(mediaPath)) {
  const extracted = await run(ffmpegPath, ["-loglevel", "error", "-y", "-ss", "2.1", "-i", mediaPath, "-frames:v", "1", framePath]);
  if (extracted.code !== 0) failures.push("fallback-frame-extraction-failed");
  else {
    const metadata = await sharp(framePath).metadata();
    const stats = await sharp(framePath).removeAlpha().stats();
    frameStats = {width: metadata.width || 0, height: metadata.height || 0, channelStdDev: stats.channels.slice(0, 3).map((channel) => Number(channel.stdev.toFixed(3)))};
    if (frameStats.width !== 960 || frameStats.height !== 540 || !frameStats.channelStdDev.some((value) => value >= 20)) failures.push("fallback-frame-not-production-visual");
    fs.mkdirSync(publicRoot, {recursive: true});
    fs.copyFileSync(framePath, publicFramePath);
  }
} else failures.push("fallback-media-missing");

const report = {
  contract: "A1TemplateRenderAdmissionAudit/v1",
  status: failures.length ? "BLOCKED" : "PASS",
  generatedAt: new Date().toISOString(),
  selectedStubSlug: "stat-counter",
  sourceStubConfirmed: fs.readFileSync(stubSourcePath, "utf8").includes("data-stub="),
  admissionItem,
  media: mediaPath && fs.existsSync(mediaPath) ? {path: path.relative(root, mediaPath), sha256: sha256File(mediaPath), bytes: fs.statSync(mediaPath).size} : null,
  frame: fs.existsSync(framePath) ? {path: path.relative(root, framePath), publicUrl: "/generated/system-line/template-render-admission-v1/stat-counter-fallback-frame.png", sha256: sha256File(framePath), stats: frameStats} : null,
  failures,
};
writeJson(reportPath, report);
writeJson(publicReportPath, report);
console.log(JSON.stringify({...report, reportPath: path.relative(root, reportPath)}, null, 2));
if (failures.length) process.exitCode = 2;
