#!/usr/bin/env node

import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {auditPresenterCompositeActualPixels, auditPresenterLayeredComposite, auditPresenterTakeoverContract} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {compileQueue} from "./compile-static-board-human-taste-fix-queue-v1.mjs";

export const PRESENTER_MATTE_ROUTE_DRY_RUN_CONTRACT = "A1PresenterMatteRouteDryRun/v1";
export const OVERLAY_GEOMETRY_CAPACITY_DRY_RUN_CONTRACT = PRESENTER_MATTE_ROUTE_DRY_RUN_CONTRACT;
export const OVERLAY_GEOMETRY_CONTRACT = "A1ModeAwarePresenterPackagingGeometryContract/v2";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir, publicDir} = projectDirs(appRoot);
const relativeDir = "golden-film-visual-system-maturity-v1/overlay-geometry-dry-run";
const dryRunRelativePath = `${relativeDir}/geometry-capacity-dry-run.json`;
const contactRelativePath = `${relativeDir}/presenter-matte-route-contact-sheet.png`;
const runRelativePath = "golden-film-visual-system-maturity-v1/maturity-run.json";
const targetOrder = ["ED-07", "ED-08", "ED-13", "ED-31", "ED-34", "ED-19"];
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => path.resolve(publicRoot, String(url).replace(/^\//u, ""));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const xml = (value) => String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

function polygon(points) {
  return points.map(([x, y]) => ({x: Number(x.toFixed(4)), y: Number(y.toFixed(4))}));
}

function componentSpecs() {
  // These are pixel-registered against the six real 1920x1080 hold frames
  // (the frames share the same locked camera composition). They are semantic
  // component paths, not a single subject rectangle and not prompt guesses.
  return [
    {id: "hair", role: "hair", zOrder: 3, fill: "#ff4f6d", points: polygon([[.46,.43],[.46,.35],[.50,.30],[.57,.27],[.64,.29],[.68,.35],[.67,.43],[.63,.47],[.50,.47]])},
    {id: "face", role: "face", zOrder: 4, fill: "#ffbd55", points: polygon([[.49,.40],[.64,.40],[.67,.47],[.65,.55],[.60,.60],[.54,.59],[.50,.54],[.48,.47]])},
    {id: "eyes", role: "eyes", zOrder: 5, fill: "#f2f2f2", points: polygon([[.505,.455],[.548,.448],[.552,.463],[.507,.471],[.587,.447],[.628,.454],[.628,.469],[.587,.463]])},
    {id: "mouth", role: "mouth", zOrder: 6, fill: "#7df0c1", points: polygon([[.548,.522],[.604,.522],[.610,.541],[.552,.542]])},
    {id: "body", role: "body", zOrder: 1, fill: "#9d7cff", points: polygon([[.39,.58],[.48,.56],[.64,.56],[.73,.62],[.78,1],[.34,1]])},
    {id: "clothing", role: "clothing", zOrder: 2, fill: "#47a8ff", points: polygon([[.40,.62],[.49,.59],[.63,.59],[.71,.65],[.75,1],[.37,1]])},
    {id: "microphone", role: "microphone", zOrder: 8, fill: "#ff8a34", points: polygon([[.355,.455],[.466,.443],[.503,.477],[.486,.548],[.375,.558],[.342,.523]])},
    {id: "boom", role: "boom-arm", zOrder: 7, fill: "#e8f0f4", points: polygon([[0,.665],[.022,.735],[.445,.585],[.474,.535],[.447,.506],[.002,.600]])},
  ];
}

function unifiedExclusionMask(specs) {
  return specs.map((item) => ({id: `${item.id}-protection`, role: item.role, polygon: item.points, buffer: item.id === "eyes" || item.id === "mouth" ? .025 : .03}));
}

function routeForShot(shotId) {
  if (shotId === "ED-07") {
    return {
      mode: "SHORT_FULLSCREEN_TAKEOVER",
      presentationMode: "FULLSCREEN",
      semanticIntensity: "HIGH_QUESTION",
      requiredTitleArea: "FULL_FRAME",
      holdFrameAvailableSpace: "NOT_REQUIRED",
      presenterInFrontSuitability: "NOT_APPLICABLE",
      takeoverWorthiness: "HIGH",
      rawPackageMayIntersectSubjectBbox: false,
      reason: "完整长问句在左上会缩小；用 1.2 秒输入动作→失控全文问题页后回真人",
      exactCopyPolicy: "完整 protected phrase 只在全屏出现，不被 matte 遮挡",
      takeover: {durationMs: 1200, narrativeValue: "输入动作把一次生成全文推向失控输出，形成强问题页", entryPlan: "从真人口播硬切入冷灰输入轨道", exitPlan: "失控全文锁定后硬切回真人继续追问"},
    };
  }
  if (shotId === "ED-13") {
    return {
      mode: "SHORT_EXPLAINER_TAKEOVER",
      presentationMode: "FULLSCREEN",
      semanticIntensity: "HIGH_TURN",
      requiredTitleArea: "FULL_FRAME_TWO_STATE_EXPLAINER",
      holdFrameAvailableSpace: "NOT_REQUIRED",
      presenterInFrontSuitability: "NOT_APPLICABLE",
      takeoverWorthiness: "HIGH",
      rawPackageMayIntersectSubjectBbox: false,
      reason: "两条长 protected phrase 无法同时在 Overlay 三秒可读；用更顺 ≠ 解决根因的单动作解释",
      exactCopyPolicy: "机制标题先承载三秒语义；若出现 protected phrase，必须在全屏完整呈现",
      takeover: {durationMs: 1300, narrativeValue: "顺滑表面与未解决根因在一个对比动作中同时成立", entryPlan: "从 presenter turn 切入冷灰双状态结构场", exitPlan: "根因断点落下后切回真人"},
    };
  }
  if (shotId === "ED-19") {
    return {
      mode: "TYPOGRAPHY_TAKEOVER",
      presentationMode: "FULLSCREEN",
      semanticIntensity: "HIGH_CONCLUSION",
      requiredTitleArea: "FULL_FRAME",
      holdFrameAvailableSpace: "NOT_REQUIRED",
      presenterInFrontSuitability: "NOT_APPLICABLE",
      takeoverWorthiness: "HIGH",
      rawPackageMayIntersectSubjectBbox: false,
      reason: "关键句需要短暂全屏接管；保留独立标题力量并补编辑材质",
      takeover: {durationMs: 1600, narrativeValue: "把整理/编排/读取/检查收束成一个可记忆的流程主角", entryPlan: "从当前讲述者画面硬切进入冷灰结构场", exitPlan: "沿同一阅读轨道切回 presenter beat"},
    };
  }
  if (shotId === "ED-31") {
    return {
      mode: "PRESENTER_CUTOUT_COMPOSITE",
      presentationMode: "OVERLAY",
      semanticIntensity: "MEDIUM_HIGH",
      requiredTitleArea: "WIDE_READABLE_PATH",
      holdFrameAvailableSpace: "LEFT_AND_SIDE_BANDS_WITH_BOOM_EXCLUSION",
      presenterInFrontSuitability: "HIGH",
      takeoverWorthiness: "LOW",
      rawPackageMayIntersectSubjectBbox: true,
      reason: "四步工具链需要横向展开；真人抠像在前，轨道在后",
      takeover: null,
    };
  }
  if (shotId === "ED-34") {
    return {
      mode: "SHORT_FULLSCREEN_TAKEOVER",
      presentationMode: "FULLSCREEN",
      semanticIntensity: "HIGH_RESOLVE",
      requiredTitleArea: "FULL_FRAME_END_TITLE",
      holdFrameAvailableSpace: "NOT_REQUIRED",
      presenterInFrontSuitability: "OPTIONAL",
      takeoverWorthiness: "HIGH",
      rawPackageMayIntersectSubjectBbox: false,
      reason: "片尾需要 1.5 秒终局标题建立方向→自己的风格，不再用机器人贴纸",
      exactCopyPolicy: "完整终局标题不被人物 matte 遮挡",
      takeover: {durationMs: 1500, narrativeValue: "方向选择收束为作者自己的风格，作为全片终局 actor", entryPlan: "从幕后路径拉满为冷灰终局场", exitPlan: "终局标题定格后进入片尾收束"},
    };
  }
  const reasons = {
    "ED-07": "输入→失控全文需要大面积因果轨道，人物在前能保留口播关系",
    "ED-08": "强标题/失真语言 actor 可跨过人物场域，但脸眼嘴由 presenter matte 保护",
    "ED-13": "重复回炉路径在人物身后形成回路，避免两个小卡片并排",
    "ED-34": "方向路径穿过背景并收束到个人风格，人物 matte 压在路径上",
  };
  return {
    mode: "BEHIND_SUBJECT_MATTE",
    presentationMode: "OVERLAY",
    semanticIntensity: shotId === "ED-07" || shotId === "ED-34" ? "HIGH" : "MEDIUM_HIGH",
    requiredTitleArea: shotId === "ED-13" ? "WIDE_TWO_STATE_PATH" : "WIDE_READABLE_PATH",
    holdFrameAvailableSpace: "FULL_FRAME_BACKGROUND_WITH_REGISTERED_PRESENTER_MATTE",
    presenterInFrontSuitability: "HIGH",
    takeoverWorthiness: "LOW",
    rawPackageMayIntersectSubjectBbox: true,
    reason: reasons[shotId],
    takeover: null,
  };
}

function routePolygon(mode) {
  if (["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(mode)) return null;
  return polygon([[.04,.10],[.96,.10],[.96,.90],[.04,.90]]);
}

function foregroundSafeRegionPolygon() {
  return polygon([[.03,.04],[.37,.04],[.37,.28],[.03,.28]]);
}

function svgPolygon(points, width, height) {
  return points.map((point) => `${(point.x * width).toFixed(2)},${(point.y * height).toFixed(2)}`).join(" ");
}

function componentSvg(spec, width, height, opacity = .82) {
  return `<polygon points="${svgPolygon(spec.points, width, height)}" fill="${spec.fill}" fill-opacity="${opacity}" stroke="#111315" stroke-opacity=".8" stroke-width="3"/>`;
}

function maskSvg(points, width, height) {
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/><polygon points="${svgPolygon(points, width, height)}" fill="white"/></svg>`;
}

function unionMaskSvg(specs, width, height, ids = null) {
  const selected = ids ? specs.filter((item) => ids.includes(item.id)) : specs;
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/>${selected.map((item) => `<polygon points="${svgPolygon(item.points, width, height)}" fill="white"/>`).join("")}</svg>`;
}

async function maskMetrics(file) {
  const {data, info} = await sharp(file).raw().toBuffer({resolveWithObject: true});
  let visible = 0;
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[y * info.width + x] < 128) continue;
      visible += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return {width: info.width, height: info.height, visiblePixelCount: visible, visiblePixelRatio: Number((visible / Math.max(1, info.width * info.height)).toFixed(6)), visibleBounds: visible ? {x: Number((left / info.width).toFixed(4)), y: Number((top / info.height).toFixed(4)), width: Number(((right - left + 1) / info.width).toFixed(4)), height: Number(((bottom - top + 1) / info.height).toFixed(4))} : null};
}

async function writeMask(file, svg) {
  const buffer = await sharp(Buffer.from(svg)).greyscale().png().toBuffer();
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, buffer);
  return {file, sha256: sha256(buffer), metrics: await maskMetrics(file)};
}

async function makePresenterMattes(item, shotDir) {
  const frameFile = publicFile(item.current.holdFrame.publicUrl);
  const generator = path.join(root, "scripts/generate-real-presenter-mattes-v1.py");
  const output = execFileSync("python3", [generator, "--input", frameFile, "--output", shotDir, "--shot-id", item.shotId], {encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
  const generated = JSON.parse(output);
  const width = generated.sourceFrame.width;
  const height = generated.sourceFrame.height;
  const componentMasks = generated.components;
  const presenterMatte = generated.presenterMatte;
  const microphoneMatte = generated.microphoneMatte;
  const boomMatte = generated.boomMatte;
  const unifiedMask = generated.unifiedExclusionMask;
  return {
    contract: "A1RealPresenterMatte/v1",
    sourceHoldFrame: {publicUrl: item.current.holdFrame.publicUrl, sha256: item.current.holdFrame.sha256, width, height, provenance: item.current.holdFrame.provenance},
    registrationMethod: generated.registrationMethod,
    registrationNote: "由真实 hold frame 的解码像素 seeded GrabCut 生成组件 alpha matte；这是静态 Look Master 验证，不是正式拆层交付。",
    realPixelSource: generated.realPixelSource,
    coarsePolygonPlaceholder: generated.coarsePolygonPlaceholder,
    componentMasks,
    presenterMatte,
    microphoneMatte,
    boomMatte,
    unifiedExclusionMask: unifiedMask,
    zOrder: generated.zOrder,
  };
}

function titleForShot(shotId) {
  return {"ED-07": "为什么不让它直接写完全文", "ED-08": "AI 常常不说人话", "ED-13": "更顺 ≠ 解决根因", "ED-31": "整理 / 编排 / 读取 / 检查", "ED-34": "方向 → 自己的风格", "ED-19": "整理 / 编排 / 读取 / 检查"}[shotId];
}

async function makePackageLayer(item, route, outputDir, width, height) {
  const title = titleForShot(item.shotId);
  const isTakeover = ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(route.mode);
  const accent = item.shotId === "ED-13" ? "#ff4f6d" : item.shotId === "ED-34" ? "#d06bff" : "#48d8a2";
  const background = isTakeover ? `<rect width="100%" height="100%" fill="#e8ebed"/><rect x="${width * .08}" y="${height * .16}" width="${width * .84}" height="${height * .68}" fill="#202529"/><path d="M ${width * .12} ${height * .73} L ${width * .86} ${height * .30}" stroke="${accent}" stroke-width="${Math.max(8, width * .012)}"/>` : `<path d="M ${width * .06} ${height * .23} L ${width * .86} ${height * .23} L ${width * .86} ${height * .55} L ${width * .06} ${height * .55} Z" fill="#e8ebed" fill-opacity=".88"/><path d="M ${width * .08} ${height * .59} C ${width * .28} ${height * .48}, ${width * .56} ${height * .37}, ${width * .90} ${height * .52}" fill="none" stroke="${accent}" stroke-width="${Math.max(6, width * .008)}"/>`;
  const textY = isTakeover ? height * .53 : height * .40;
  const fontSize = isTakeover ? width * .075 : width * .045;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${background}<text x="${width * .10}" y="${textY}" fill="${isTakeover ? "#f6f7f4" : "#111315"}" font-family="Arial,'PingFang SC',sans-serif" font-size="${fontSize}" font-weight="800">${xml(title)}</text><circle cx="${width * .84}" cy="${height * .28}" r="${width * .024}" fill="${accent}"/></svg>`;
  const file = path.join(outputDir, `${item.shotId.toLowerCase()}-package-layer-wireframe.png`);
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(file, buffer);
  return {
    file,
    sha256: sha256(buffer),
    width,
    height,
    titleActor: title,
    titleBounds: isTakeover ? {x: .09, y: .45, width: .82, height: .12} : {x: .08, y: .31, width: .80, height: .13},
    opaque: isTakeover,
  };
}

async function alphaLayerFromBase(frameFile, maskFile, width, height) {
  // Build RGBA explicitly. Sharp's joinChannel path can preserve an opaque
  // RGB result when a greyscale PNG is supplied as a raw buffer; that source
  // layer then repaints the complete hold frame over the package.
  const [{data: frame, info: frameInfo}, {data: mask, info: maskInfo}] = await Promise.all([
    sharp(frameFile).resize(width, height, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true}),
    sharp(maskFile).resize(width, height, {fit: "fill"}).greyscale().removeAlpha().raw().toBuffer({resolveWithObject: true}),
  ]);
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const frameOffset = pixel * frameInfo.channels;
    const maskOffset = pixel * maskInfo.channels;
    const rgbaOffset = pixel * 4;
    rgba[rgbaOffset] = frame[frameOffset];
    rgba[rgbaOffset + 1] = frame[frameOffset + 1];
    rgba[rgbaOffset + 2] = frame[frameOffset + 2];
    rgba[rgbaOffset + 3] = mask[maskOffset];
  }
  return sharp(rgba, {raw: {width, height, channels: 4}}).png().toBuffer();
}

async function makeFinalComposite(item, route, matte, packageLayer, outputDir) {
  const frameFile = publicFile(item.current.holdFrame.publicUrl);
  const width = matte.sourceHoldFrame.width;
  const height = matte.sourceHoldFrame.height;
  let finalBuffer;
  if (["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(route.mode)) {
    finalBuffer = fs.readFileSync(packageLayer.file);
  } else {
    const layers = [{input: fs.readFileSync(packageLayer.file), blend: "over"}];
    const personLayer = await alphaLayerFromBase(frameFile, matte.presenterMatte.file, width, height);
    const microphoneLayer = await alphaLayerFromBase(frameFile, matte.microphoneMatte.file, width, height);
    const boomLayer = await alphaLayerFromBase(frameFile, matte.boomMatte.file, width, height);
    layers.push({input: personLayer, blend: "over"}, {input: microphoneLayer, blend: "over"}, {input: boomLayer, blend: "over"});
    finalBuffer = await sharp(frameFile).resize(width, height, {fit: "fill"}).composite(layers).png().toBuffer();
  }
  const file = path.join(outputDir, `${item.shotId.toLowerCase()}-final-composite.png`);
  fs.writeFileSync(file, finalBuffer);
  return {file, sha256: sha256(finalBuffer), width, height};
}

async function packagePanel(file, label, width = 320, height = 180, checker = false) {
  const source = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  const base = checker ? sharp({create: {width, height: height - 26, channels: 3, background: "#cbd0cf"}}) : sharp(source);
  const layer = checker ? await sharp(source).resize(width, height - 26, {fit: "contain"}).png().toBuffer() : null;
  const image = checker ? await base.composite([{input: layer, blend: "over"}]).png().toBuffer() : source;
  const labelSvg = Buffer.from(`<svg width="${width}" height="26" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315" fill-opacity=".9"/><text x="10" y="18" fill="#f6f7f4" font-family="Arial,sans-serif" font-size="12" font-weight="700">${xml(label)}</text></svg>`);
  return sharp(image).resize(width, height - 26, {fit: "cover"}).extend({top: 26, bottom: 0, left: 0, right: 0, background: "#111315"}).composite([{input: labelSvg, top: 0, left: 0}]).png().toBuffer();
}

async function colorizeMask(file, width, height, color) {
  const {data, info} = await sharp(file).resize(width, height, {fit: "fill"}).greyscale().removeAlpha().raw().toBuffer({resolveWithObject: true});
  const rgb = color.match(/[a-f\d]{2}/giu).map((value) => Number.parseInt(value, 16));
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const alpha = data[pixel * info.channels];
    rgba[pixel * 4] = rgb[0];
    rgba[pixel * 4 + 1] = rgb[1];
    rgba[pixel * 4 + 2] = rgb[2];
    rgba[pixel * 4 + 3] = alpha;
  }
  return sharp(rgba, {raw: {width, height, channels: 4}}).png().toBuffer();
}

async function drawMaskPreview(frameFile, matte, width = 320, height = 180) {
  const frameMeta = await sharp(frameFile).metadata();
  const frameWidth = frameMeta.width || 1920;
  const frameHeight = frameMeta.height || 1080;
  const colors = {hair: "#ff4f6d", face: "#ffbd55", eyes: "#f6f7f4", mouth: "#7df0c1", body: "#9d7cff", clothing: "#48a8ff", microphone: "#ff8a34", boom: "#d6e4ea"};
  const layers = [];
  for (const [id, entry] of Object.entries(matte.componentMasks)) layers.push({input: await colorizeMask(entry.file, frameWidth, frameHeight, colors[id] || "#f6f7f4"), blend: "over"});
  const image = await sharp({create: {width: frameWidth, height: frameHeight, channels: 3, background: "#071011"}}).composite(layers).png().toBuffer();
  return packagePanel(image, "MATTE · decoded source-pixel components + z-order", width, height);
}

async function drawWireframeTile(item, shot, matte, packageLayer, finalComposite) {
  const frameFile = publicFile(item.current.holdFrame.publicUrl);
  const basePanel = await packagePanel(frameFile, `${item.shotId} · BASE HOLD FRAME`);
  const maskPanel = await drawMaskPreview(frameFile, matte);
  const packagePanelBuffer = await packagePanel(packageLayer.file, `${item.shotId} · PACKAGE · ${shot.route.rawPackageMayIntersectSubjectBbox ? "raw bbox overlap allowed" : "presenter not required"}`, 320, 180, true);
  const finalPanel = await packagePanel(finalComposite.file, `${item.shotId} · FINAL · ${shot.modeAudit.status} · ${shot.route.mode}`);
  return sharp({create: {width: 640, height: 360, channels: 3, background: "#101416"}}).composite([
    {input: basePanel, left: 0, top: 0},
    {input: maskPanel, left: 320, top: 0},
    {input: packagePanelBuffer, left: 0, top: 180},
    {input: finalPanel, left: 320, top: 180},
  ]).png().toBuffer();
}

function copyToArtifact(file, publicRootPath) {
  const relative = path.relative(publicRoot, file);
  const artifactFile = path.join(artifactDir, relative);
  fs.mkdirSync(path.dirname(artifactFile), {recursive: true});
  fs.copyFileSync(file, artifactFile);
}

function markSecondWaveReadOnly(next, before, run) {
  const jobIds = new Set(run.phases?.PHASE_3?.queuedJobIds || []);
  const shas = before.production.generation.jobs.filter((job) => jobIds.has(job.id) && job.status === "complete" && job.output?.sha256).map((job) => job.output.sha256);
  for (const raw of next.production.shotIntelligence.lookMasterRawReferences || []) {
    if (!shas.includes(raw.artifact?.sha256)) continue;
    raw.current = false;
    raw.historyReadOnly = true;
    raw.recommendationEligible = false;
    raw.selectionEligible = false;
    raw.assemblyEligible = false;
    raw.candidateAdmissionRequired = true;
    raw.status = "HUMAN_TASTE_REVISION_NOT_ADOPTED_MODE_AWARE_ROUTE_SUPERSEDED";
    raw.reviewStatus = "NOT_ADOPTED_NO_LAYERED_COMPOSITE_REAUDIT";
  }
  return shas;
}

const result = await withProjectLock(appRoot, async () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const queue = compileQueue(before, {now: new Date().toISOString()});
  if (queue.items.some((item) => !targetOrder.includes(item.shotId))) throw new Error("presenter-matte-route-target-scope-invalid");
  const runPath = path.join(publicDir, runRelativePath);
  const priorRun = readJson(runPath);
  const now = new Date().toISOString();
  const shotRecords = [];
  const generatedFiles = [];
  for (const shotId of targetOrder) {
    const item = queue.items.find((entry) => entry.shotId === shotId);
    const route = routeForShot(shotId);
    const shotDir = path.join(publicDir, relativeDir, "matte-assets", shotId.toLowerCase());
    const matte = await makePresenterMattes(item, shotDir);
    const packageLayer = await makePackageLayer(item, route, shotDir, matte.sourceHoldFrame.width, matte.sourceHoldFrame.height);
    const finalComposite = await makeFinalComposite(item, route, matte, packageLayer, shotDir);
    const structuralAudit = ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(route.mode)
      ? auditPresenterTakeoverContract(route.takeover && {packagingMode: route.mode, ...route.takeover})
      : await auditPresenterLayeredComposite({
          baseFrameFile: publicFile(item.current.holdFrame.publicUrl),
          packageFile: packageLayer.file,
          finalCompositeFile: finalComposite.file,
          presenterMatteFile: matte.presenterMatte.file,
          microphoneMatteFile: matte.microphoneMatte.file,
          boomMatteFile: matte.boomMatte.file,
          targetWidth: matte.sourceHoldFrame.width,
          targetHeight: matte.sourceHoldFrame.height,
          packagingMode: route.mode,
          zOrder: matte.zOrder,
        });
    const actualPixelAudit = await auditPresenterCompositeActualPixels({
      baseFrameFile: publicFile(item.current.holdFrame.publicUrl),
      packageFile: packageLayer.file,
      finalCompositeFile: finalComposite.file,
      presenterMatteFile: matte.presenterMatte.file,
      microphoneMatteFile: matte.microphoneMatte.file,
      boomMatteFile: matte.boomMatte.file,
      faceMaskFile: matte.componentMasks.face.file,
      eyesMaskFile: matte.componentMasks.eyes.file,
      mouthMaskFile: matte.componentMasks.mouth.file,
      targetWidth: matte.sourceHoldFrame.width,
      targetHeight: matte.sourceHoldFrame.height,
      packagingMode: route.mode,
      titleBounds: packageLayer.titleBounds,
    });
    const finalAudit = {
      ...structuralAudit,
      status: structuralAudit.status === "PASS" && actualPixelAudit.status === "PASS" ? "PASS" : "FAIL",
      structuralAudit,
      actualPixelAudit,
    };
    const shot = {
      shotId,
      currentCandidateSha256: item.current.candidateSha256,
      holdFrame: item.current.holdFrame,
      route,
      mode: route.mode,
      geometryContract: {
        contract: OVERLAY_GEOMETRY_CONTRACT,
        version: 2,
        application: ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(route.mode) ? "FULLSCREEN_TAKEOVER" : "LAYERED_COMPOSITE",
        foregroundSafeRegionPolygon: foregroundSafeRegionPolygon(),
        allowedRegionPolygon: routePolygon(route.mode),
        unifiedExclusionMask: matte.unifiedExclusionMask,
        rawPackageOverlap: route.rawPackageMayIntersectSubjectBbox ? "ALLOWED_ONLY_BEHIND_REGISTERED_MATTE" : "NOT_APPLICABLE",
        pixelGate: ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(route.mode)
          ? {outsidePolygonIsFail: false, exclusionIntersectionIsFail: false, finalCompositeGate: "TAKEOVER_CONTRACT"}
          : {outsidePolygonIsFail: false, exclusionIntersectionIsFail: false, finalCompositeGate: "PRESENTER_PIXELS_MUST_SURVIVE_ON_TOP"},
        forbiddenLegacyFields: ["safeZones[]+availableRegions[]", "EDITOR_SELECTS_OPEN_REGION_AT_INSERTION", "SUBJECT_BBOX_ONLY_AS_FINAL_COMPOSITE_GATE"],
      },
      matte,
      packageLayer: {publicUrl: `/${path.relative(publicRoot, packageLayer.file)}`, sha256: packageLayer.sha256, titleActor: packageLayer.titleActor, titleBounds: packageLayer.titleBounds, width: packageLayer.width, height: packageLayer.height},
      finalComposite: {publicUrl: `/${path.relative(publicRoot, finalComposite.file)}`, sha256: finalComposite.sha256, width: finalComposite.width, height: finalComposite.height},
      modeAudit: finalAudit,
      dryRunStatus: finalAudit.status === "PASS" ? "PASS_ACTUAL_PIXEL_COMPOSITE_GATE" : "BLOCKED_ACTUAL_PIXEL_COMPOSITE_GATE",
    };
    const contactBuffer = await drawWireframeTile(item, shot, matte, packageLayer, finalComposite);
    shot.contactTileSha256 = sha256(contactBuffer);
    shotRecords.push(shot);
    generatedFiles.push(...Object.values(matte.componentMasks).map((entry) => entry.file), matte.presenterMatte.file, matte.microphoneMatte.file, matte.boomMatte.file, matte.unifiedExclusionMask.file, packageLayer.file, finalComposite.file);
    shot._contactBuffer = contactBuffer;
  }
  const contactSheet = await sharp({create: {width: 1920, height: 720, channels: 3, background: "#101416"}}).composite(shotRecords.map((shot, index) => ({input: shot._contactBuffer, left: (index % 3) * 640, top: Math.floor(index / 3) * 360}))).png().toBuffer();
  const contactPublicFile = path.join(publicDir, contactRelativePath);
  fs.mkdirSync(path.dirname(contactPublicFile), {recursive: true});
  fs.writeFileSync(contactPublicFile, contactSheet);
  generatedFiles.push(contactPublicFile);
  const secondWaveJobIds = new Set(priorRun.phases?.PHASE_3?.queuedJobIds || []);
  const secondWaveShas = before.production.generation.jobs.filter((job) => secondWaveJobIds.has(job.id) && job.status === "complete" && job.output?.sha256).map((job) => job.output.sha256);
  const dryRunBody = {
    contract: PRESENTER_MATTE_ROUTE_DRY_RUN_CONTRACT,
    version: 1,
    status: shotRecords.every((shot) => shot.dryRunStatus === "PASS_ACTUAL_PIXEL_COMPOSITE_GATE") ? "PASS_ACTUAL_PIXEL_COMPOSITE_GATE" : "BLOCKED_ACTUAL_PIXEL_COMPOSITE_GATE",
    current: true,
    sourceHashes: {workspaceSha256: before.workspaceSha256, queueSha256: queue.queueSha256, maturityRunSha256: priorRun.maturityRunSha256},
    geometryContract: OVERLAY_GEOMETRY_CONTRACT,
    modePolicy: {
      SAFE_REGION_FOREGROUND_OVERLAY: "raw package must stay inside the only foreground-safe polygon x=.03..37 y=.04..28 and outside unified exclusion mask",
      BEHIND_SUBJECT_MATTE: "raw package may cross subject bbox; final presenter matte must be top layer",
      PRESENTER_CUTOUT_COMPOSITE: "raw package may cross subject bbox; cutout/mic/boom pixels must survive on top",
      SHORT_FULLSCREEN_TAKEOVER: "no presenter避让; explicit duration, narrative value, entry and exit required",
      SHORT_EXPLAINER_TAKEOVER: "no presenter避让; one semantic explanatory action with explicit duration and entry/exit required",
      TYPOGRAPHY_TAKEOVER: "no presenter避让; explicit duration, narrative value, entry and exit required",
    },
    targetShotIds: targetOrder,
    safeRegionForegroundOverlayFeasibleShotIds: [],
    layeredCompositeRoutePassShotIds: shotRecords.filter((shot) => ["BEHIND_SUBJECT_MATTE", "PRESENTER_CUTOUT_COMPOSITE"].includes(shot.mode) && shot.dryRunStatus === "PASS_ACTUAL_PIXEL_COMPOSITE_GATE").map((shot) => shot.shotId),
    takeoverRoutePassShotIds: shotRecords.filter((shot) => ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(shot.mode) && shot.dryRunStatus === "PASS_ACTUAL_PIXEL_COMPOSITE_GATE").map((shot) => shot.shotId),
    overlayModeChangeShotIds: [],
    shots: shotRecords.map(({_contactBuffer, ...shot}) => shot),
    contactSheet: {publicUrl: `/${path.relative(publicRoot, contactPublicFile)}`, sha256: sha256(contactSheet), width: 1920, height: 720},
    generationPolicy: {generationAllowed: false, restoreGenerationAfterDryRun: false, reason: "canonical-mode-recompile-required-before-any-new-imagegen"},
    secondWave: {attemptedGeneratedCount: secondWaveShas.length, adoptedGeneratedCount: 0, rejectedGeneratedCount: secondWaveShas.length, candidateShas: secondWaveShas, allHistoryReadOnly: true},
    nextAction: "RECOMPILE_CANONICAL_MODE_WITH_PRESENTER_MATTE_ROUTES",
    generatedAt: now,
  };
  dryRunBody.dryRunSha256 = sha256({...dryRunBody, dryRunSha256: undefined});
  const next = structuredClone(before);
  markSecondWaveReadOnly(next, before, priorRun);
  const nextRun = structuredClone(priorRun);
  nextRun.generatedAt = now;
  nextRun.overallStatus = "PRESENTER_MATTE_ROUTE_DRY_RUN_COMPLETE";
  nextRun.nextAction = dryRunBody.nextAction;
  nextRun.phases.PHASE_3 = {...nextRun.phases.PHASE_3, status: "GENERATION_FROZEN_AFTER_MODE_AWARE_DRY_RUN", generationAllowed: false, generationDispatched: false, targetedRepairAdoptedGeneratedCount: 0, failureReasons: ["LEGACY_SAFE_REGION_RULE_SUPERSEDED_BY_MODE_AWARE_COMPOSITE_GATE", "SECOND_WAVE_NOT_AUTO_ADOPTED", "CANONICAL_MODE_RECOMPILE_REQUIRED"], nextAction: nextRun.nextAction};
  nextRun.phases.PHASE_4 = {...nextRun.phases.PHASE_4, status: "BLOCKED", boardRebuilt: false, failureReasons: ["MODE_AWARE_CANONICAL_RECOMPILE_REQUIRED"], nextAction: nextRun.nextAction};
  nextRun.runtimeFreeze = {...nextRun.runtimeFreeze, queue: 0, running: 0, workerStatus: "frozen", assemblyCount: 0, assemblyCreationAllowed: false};
  nextRun.imageLedger = {...(nextRun.imageLedger || {}), adoptedGeneratedCount: Number(nextRun.imageLedger?.adoptedGeneratedCount || 0), rejectedGeneratedCount: Number(nextRun.imageLedger?.rejectedGeneratedCount || 0) + secondWaveShas.length, newGeneratedShas: secondWaveShas, newGeneratedCount: secondWaveShas.length, unreviewedGeneratedCount: secondWaveShas.length, unreviewedGeneratedShas: [...new Set([...(nextRun.imageLedger?.unreviewedGeneratedShas || []), ...secondWaveShas])], goodPngShaChanged: false};
  nextRun.maturityRunSha256 = sha256({...nextRun, maturityRunSha256: undefined});
  next.production.goldenFilmVisualSystemMaturity = {...(next.production.goldenFilmVisualSystemMaturity || {}), contract: "A1GoldenFilmVisualSystemMaturityAuthority/v1", current: true, status: nextRun.overallStatus, nextAction: nextRun.nextAction, maturityRunSha256: nextRun.maturityRunSha256, targetShotIds: targetOrder, presenterPackagingModeContract: OVERLAY_GEOMETRY_CONTRACT, dryRunSha256: dryRunBody.dryRunSha256, updatedAt: now};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  next.production.policy = {...next.production.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, status: nextRun.overallStatus, nextUserGate: "PRESENTER_MATTE_ROUTE_REVIEW", assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false};
  const event = createProductionEvent({workspace: before, action: "compile-presenter-matte-route-dry-run-v1", targetId: dryRunBody.dryRunSha256, payload: {contract: PRESENTER_MATTE_ROUTE_DRY_RUN_CONTRACT, geometryContract: OVERLAY_GEOMETRY_CONTRACT, targetShotIds: targetOrder, modes: Object.fromEntries(shotRecords.map((shot) => [shot.shotId, shot.mode])), noGeneration: true, noAssembly: true, noCritic: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = now;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: before.workspaceSha256, event, files: {[dryRunRelativePath]: dryRunBody, [runRelativePath]: nextRun}});
  for (const file of generatedFiles) copyToArtifact(file, publicRoot);
  return {workspaceSha256: committed.workspaceSha256, dryRunBody, nextRun, contactPublicFile, contactSheetSha256: sha256(contactSheet), shotRecords: shotRecords.map(({_contactBuffer, ...shot}) => shot)};
});

console.log(JSON.stringify({
  status: result.dryRunBody.status,
  workspaceSha256: result.workspaceSha256,
  dryRunSha256: result.dryRunBody.dryRunSha256,
  maturityRunSha256: result.nextRun.maturityRunSha256,
  modes: Object.fromEntries(result.shotRecords.map((shot) => [shot.shotId, shot.mode])),
  layeredCompositeRoutePassShotIds: result.dryRunBody.layeredCompositeRoutePassShotIds,
  takeoverRoutePassShotIds: result.dryRunBody.takeoverRoutePassShotIds,
  secondWaveGeneratedCount: result.dryRunBody.secondWave.attemptedGeneratedCount,
  secondWaveAdoptedCount: result.dryRunBody.secondWave.adoptedGeneratedCount,
  contactSheet: `/${path.relative(publicRoot, result.contactPublicFile)}`,
  contactSha256: result.contactSheetSha256,
  nextAction: result.dryRunBody.nextAction,
}, null, 2));
