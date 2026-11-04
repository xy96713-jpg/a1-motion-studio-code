#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {performance} from "node:perf_hooks";
import sharp from "sharp";
import {compileSemanticMotionStylePlan} from "../apps/studio-next/src/lib/a1-semantic-motion-style-router-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const isV2 = process.argv.includes("--v2");
const version = isV2 ? "v2" : "v1";
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const semanticStyleRouterFile = path.join(root, "apps/studio-next/src/lib/a1-semantic-motion-style-router-v1.mjs");
const outputRoot = path.join(generatedRoot, `representative-mature-motion-${version}`);
const reviewRoot = path.join(outputRoot, "review-frames");
const fontOutputRoot = path.join(outputRoot, "fonts");
const outputFile = path.join(outputRoot, "representative-mature-motion-960x540.mp4");
const contactSheetFile = path.join(outputRoot, "contact-sheet.png");
const propsFile = path.join(outputRoot, "render-props.json");
const planFile = path.join(outputRoot, "motion-plan.json");
const stylePlanFile = path.join(outputRoot, "semantic-style-plan.json");
const storyboardFile = path.join(outputRoot, "STORYBOARD.md");
const manifestFile = path.join(outputRoot, "manifest.json");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const currentPhaseFile = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const matureManifestFile = path.join(generatedRoot, "mature-six-chapter-static-direction-v1/manifest.json");
const componentFile = path.join(rendererRoot, `src/RepresentativeMatureMotion${isV2 ? "V2" : "V1"}.tsx`);
const entryFile = path.join(rendererRoot, `src/representative-mature-motion${isV2 ? "-v2" : ""}-index.tsx`);
const compositionId = `A1RepresentativeMatureMotion${isV2 ? "V2" : "V1"}`;
const width = 960;
const height = 540;
const fps = 30;
const totalFrames = 1730;

const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const asset = (publicUrl, sha256) => ({publicUrl, sha256});

const workspaceBeforeFileSha256 = sha256File(workspaceFile);
const currentPhaseBeforeSha256 = sha256File(currentPhaseFile);
const workspace = readJson(workspaceFile);
const currentPhase = readJson(currentPhaseFile);
assert(workspace.workspaceSha256 === "9857a8d53522d9a277cf1ac669ae6d97e2ef0a85f0d4f9c85baefd9dd1d542fb", "representative-motion-workspace-fixture-drifted");
assert(workspace.production.generation.summary.queued === 0 && workspace.production.generation.summary.running === 0 && workspace.production.generation.workerStatus === "frozen", "representative-motion-generation-not-frozen-idle");
assert(workspace.production.userVisualApprovalGate?.userVisualApproval === "NOT_APPROVED", "representative-motion-user-approval-boundary-invalid");
assert(workspace.production.shotIntelligence.wholeFilmStaticBoard.status === "PENDING_USER_APPROVAL", "representative-motion-static-board-boundary-invalid");
assert((workspace.production.shotIntelligence.currentAssembly || []).length === 0, "representative-motion-assembly-must-remain-empty");
assert(currentPhase.status === "ACTIVE_REVIEW_GATED" && currentPhase.authority?.state === "whole-film-static-board-review" && currentPhase.authority?.nextAction?.id === "review-whole-film-static-board", "representative-motion-current-phase-boundary-invalid");

const presenterVideo = asset("/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-video-093bc1315163.mov", "093bc13151633d34f0bdc1176de77f1b71eeda7c7ccbb4d3ff2507cbc45babc5");
const narrationAudio = asset("/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav", "ad156741f33dc1ae0d01f4b155a577d5cc33d1036e70f29b278a213d8a46b73b");
const subtitle = asset("/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/subtitles-997407683bd0.srt", "997407683bd017f2b6fc35ce4afc2d0f59512d05c0d1dd17e9455cc28eb0facd");
const quietBackground = asset("/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-cool-halftone-quiet-field-v1.png", "42cac181ab6f5ee545353f319222e97ee93c0450a03b804d0181456b6915a5eb");
const screenClips = {
  "ED-21": asset("/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/insertion-pack-v2/ed-21-screen-evidence-960x540.mp4", "49b413de80fdbdae5dadc04ab883c1906b4b1443ea5507ff513e8d0af9f32eda"),
  "ED-22": asset("/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/insertion-pack-v2/ed-22-screen-evidence-960x540.mp4", "2552f5838120f0e0e88c5e2d019e8b643b2ad089424dfb8384e2a491e6a7a873"),
};
for (const binding of [presenterVideo, narrationAudio, subtitle, quietBackground, ...Object.values(screenClips)]) {
  const file = publicFile(binding.publicUrl);
  assert(fs.existsSync(file), `representative-motion-source-missing:${binding.publicUrl}`);
  assert(sha256File(file) === binding.sha256, `representative-motion-source-sha-mismatch:${binding.publicUrl}`);
}

const fontSources = {
  editorial: {
    sourceFile: path.join(root, ".codex-artifacts/system-progress-system-line/display-font-scout-v2/fonts/frex-sans-gb-bold.ttf"),
    outputFile: path.join(fontOutputRoot, "frex-sans-gb-bold.ttf"),
    sha256: "1f9ec1e4ad5f8ca731491a5eec7f4b1bb08ab4c43a3138e90776d3b0bc384055",
  },
  pixel: {
    sourceFile: path.join(root, ".codex-artifacts/system-progress-system-line/pixel-font-scout-v3/fonts/boutique-9x9-bold.ttf"),
    outputFile: path.join(fontOutputRoot, "boutique-9x9-bold.ttf"),
    sha256: "ba67f9138d43d5bc8ce6f59a74088d44973c99edeeadbebaf9541fc983bcb7ba",
  },
};
fs.mkdirSync(reviewRoot, {recursive: true});
fs.mkdirSync(fontOutputRoot, {recursive: true});
for (const font of Object.values(fontSources)) {
  assert(fs.existsSync(font.sourceFile) && sha256File(font.sourceFile) === font.sha256, `representative-motion-font-source-invalid:${font.sourceFile}`);
  if (!fs.existsSync(font.outputFile) || sha256File(font.outputFile) !== font.sha256) fs.copyFileSync(font.sourceFile, font.outputFile);
  assert(sha256File(font.outputFile) === font.sha256, `representative-motion-font-copy-invalid:${font.outputFile}`);
}

const matureManifest = readJson(matureManifestFile);
const matureEntries = new Map(matureManifest.entries.map((entry) => [entry.shotId, entry]));
const expectedFrames = {
  "ED-08": "27ca0a63e0e7f733e705081521bcd373dfcdd93468cef46808d4fc80d696f30e",
  "ED-09": "9684972dd949a61e2179de7199d213de7f389af28d35c86b9720f5c4e6c2bb66",
  "ED-17": "80bd1888c2f15efa9c25512c878d2b54475b351bd1b3280df1b132a794d4aa78",
  "ED-19": "6888ba28351998df4e64dedc63488cd69503a6dc5d6f70583145292387c0e442",
  "ED-31": "8c09b648491b268be5d7bced542186b563952a0156d2332cc5b7692a339d2b26",
};
for (const [shotId, expectedSha] of Object.entries(expectedFrames)) {
  const entry = matureEntries.get(shotId);
  assert(entry?.frame?.sha256 === expectedSha, `representative-motion-mature-frame-drifted:${shotId}`);
  assert(fs.existsSync(publicFile(entry.frame.publicUrl)) && sha256File(publicFile(entry.frame.publicUrl)) === expectedSha, `representative-motion-mature-frame-invalid:${shotId}`);
  if (entry.matureRepair?.overlay) assert(fs.existsSync(publicFile(entry.matureRepair.overlay.publicUrl)) && sha256File(publicFile(entry.matureRepair.overlay.publicUrl)) === entry.matureRepair.overlay.sha256, `representative-motion-overlay-invalid:${shotId}`);
}

const segments = [
  {shotId: "ED-01", outputStartFrame: 0, durationInFrames: 101, sourceStartFrame: 0, sourceStartMs: 0, sourceEndMs: 3353, semanticJob: "用大标题建立智能写作工作台身份，同时保留真实口播人物", mode: "PRESENTER"},
  {shotId: "ED-08", outputStartFrame: 101, durationInFrames: 121, sourceStartFrame: 1055, sourceStartMs: 35180, sourceEndMs: 39200, semanticJob: "把 AI 写作的核心问题收束为不说人话", mode: "FULLSCREEN_TYPOGRAPHY", frame: matureEntries.get("ED-08").frame, overlay: matureEntries.get("ED-08").matureRepair.overlay},
  {shotId: "ED-09", outputStartFrame: 222, durationInFrames: 228, sourceStartFrame: 1176, sourceStartMs: 39200, sourceEndMs: 46800, semanticJob: "用迷宫式解释画面表现中文看得懂字却看不懂重点", mode: "EXPLAINER", frame: matureEntries.get("ED-09").frame},
  {shotId: "ED-17", outputStartFrame: 450, durationInFrames: 132, sourceStartFrame: 2393, sourceStartMs: 79780, sourceEndMs: 84180, semanticJob: "按材料、角度、动笔的先后关系建立三步方法", mode: "EXPLAINER", frame: matureEntries.get("ED-17").frame, overlay: matureEntries.get("ED-17").matureRepair.overlay},
  {shotId: "ED-18", outputStartFrame: 582, durationInFrames: 111, sourceStartFrame: 2525, sourceStartMs: 84180, sourceEndMs: 87860, semanticJob: "回到口播人物解释为什么要把动作固定进流程", mode: "PRESENTER"},
  {shotId: "ED-19", outputStartFrame: 693, durationInFrames: 289, sourceStartFrame: 2636, sourceStartMs: 87860, sourceEndMs: 97500, semanticJob: "在真实人物旁说明 Codex 负责后台编排而不是代写", mode: "PRESENTER_OVERLAY", frame: matureEntries.get("ED-19").frame, overlay: matureEntries.get("ED-19").matureRepair.overlay},
  {shotId: "ED-21", outputStartFrame: 982, durationInFrames: 261, sourceStartFrame: 3173, sourceStartMs: 105780, sourceEndMs: 114480, semanticJob: "用真实录屏展示标题、全文与文档编辑操作", mode: "SCREEN_EVIDENCE", screenClip: screenClips["ED-21"]},
  {shotId: "ED-22", outputStartFrame: 1243, durationInFrames: 162, sourceStartFrame: 3434, sourceStartMs: 114480, sourceEndMs: 119880, semanticJob: "用真实录屏展示保存动作与结果", mode: "SCREEN_EVIDENCE", screenClip: screenClips["ED-22"]},
  {shotId: "ED-31", outputStartFrame: 1405, durationInFrames: 325, sourceStartFrame: 5614, sourceStartMs: 187120, sourceEndMs: 197940, semanticJob: "回到真实人物，将写作不便收束为可控工作流", mode: "PRESENTER_OVERLAY", frame: matureEntries.get("ED-31").frame, overlay: matureEntries.get("ED-31").matureRepair.overlay},
];
assert(segments.at(-1).outputStartFrame + segments.at(-1).durationInFrames === totalFrames, "representative-motion-segment-duration-invalid");
for (let index = 1; index < segments.length; index += 1) assert(segments[index - 1].outputStartFrame + segments[index - 1].durationInFrames === segments[index].outputStartFrame, `representative-motion-segment-gap:${segments[index].shotId}`);

const audioGroups = [
  {id: "identity", outputStartFrame: 0, sourceStartFrame: 0, durationInFrames: 101},
  {id: "problem", outputStartFrame: 101, sourceStartFrame: 1055, durationInFrames: 349},
  {id: "method", outputStartFrame: 450, sourceStartFrame: 2393, durationInFrames: 532},
  {id: "operation", outputStartFrame: 982, sourceStartFrame: 3173, durationInFrames: 423},
  {id: "conclusion", outputStartFrame: 1405, sourceStartFrame: 5614, durationInFrames: 325},
];

const props = {
  contract: `A1RepresentativeMatureMotion/${version}`,
  width,
  height,
  fps,
  totalFrames,
  presenterVideo,
  narrationAudio,
  quietBackground,
  fonts: {
    editorial: asset(publicUrlFor(fontSources.editorial.outputFile), fontSources.editorial.sha256),
    pixel: asset(publicUrlFor(fontSources.pixel.outputFile), fontSources.pixel.sha256),
  },
  segments,
  audioGroups,
};

const styleBriefs = [
  ["ED-01", "dd6b8e3e88be2087efc0104d62bef0ab641855aa37f1f40827d92eb4db251607"],
  ["ED-08", "d3064fc9c601a2e6ce5ade7e7040fe72ead8bcb41a4830d30d0716a58ec4414e"],
  ["ED-17", "c7ec4b02edf8c7ac17ff0c29c9735bed7e84729a7a17a3bdb7570ec1b580ea26"],
  ["ED-19", "2a33727bca0fae7c77a5423f77ca0dfa6e55d150fa2d7869da057cac7d60424a"],
  ["ED-31", "c61d95f7aa83844100499c2b8713f4abed54cc0dab96b838802895a80c829790"],
].map(([shotId, expectedSha256]) => {
  const file = path.join(root, `.codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/style-lineage-static-board-v1/style-briefs/${shotId}.json`);
  const auditFile = file.replace(/\.json$/u, ".audit.json");
  assert(fs.existsSync(file) && sha256File(file) === expectedSha256, `representative-motion-style-brief-invalid:${shotId}`);
  const audit = readJson(auditFile);
  assert(audit.status === "PASS", `representative-motion-style-brief-audit-failed:${shotId}`);
  return {shotId, path: path.relative(root, file), sha256: expectedSha256, auditPath: path.relative(root, auditFile), auditSha256: sha256File(auditFile), auditStatus: audit.status};
});

const motionPlan = {
  contract: `A1RepresentativeMatureMotionPlan/${version}`,
  status: "CANDIDATE_ONLY",
  narrativeArc: ["工具身份", "AI 不说人话", "三步方法", "真实操作", "可控结论"],
  segments: segments.map((segment) => ({...segment, outputEndFrame: segment.outputStartFrame + segment.durationInFrames, durationMs: Math.round(segment.durationInFrames / fps * 1000)})),
  cameraCurves: {
    ED09: {id: isV2 ? "ROUTE_MARKER_SEARCH_WITH_BOUNDED_DOLLY" : "C2_DOLLY_IN_HOLD_RETURN", easing: "cubic-bezier(0.65,0,0.35,1)", maximumScale: isV2 ? 1.072 : 1.095, hardJump: false},
    ED21: {id: isV2 ? "SOURCE_BAKED_CAMERA_WITH_LOCAL_FOCUS_CORNERS" : "SOURCE_BAKED_C2_CAMERA", sourcePlaybackRate: 1, syntheticCursor: false},
    ED22: {id: isV2 ? "SOURCE_BAKED_CAMERA_WITH_SAVE_ACTION_CUE" : "SOURCE_BAKED_C2_CAMERA", sourcePlaybackRate: 1, syntheticCursor: false},
  },
  typography: {editorialFamily: "Frex Sans GB Bold", pixelFamily: "BoutiqueBitmap9x9 Bold", pixelUsage: "SHORT_SIGNATURE_KEYWORDS_ONLY", sourceHanUsed: false, formalChineseGeneratedByImageModel: false},
  density: {captionsRendered: false, decorativeLineCount: 0, onePrimaryActorPerPackage: true},
  userVisualApproval: "NOT_APPROVED",
};
const semanticStylePlan = compileSemanticMotionStylePlan(segments);
const storyboard = `# Representative Mature Motion ${version}\n\n- 00:00–00:03 工具身份：真实口播 + “智能写作工作台”编辑式大标题；像素字体只保留为小签名。\n- 00:03–00:15 问题判断：短时全屏判断后，由真实路线焦点在迷宫中搜索，不堆字幕。\n- 00:15–00:33 三步方法：同一纸张从材料聚合 → 角度聚焦 → 动笔成形，再回到人物旁的后台编排对象。\n- 00:33–00:47 真实操作：ED-21 用语义焦点角标指向编辑区，ED-22 用 Command+S 动作提示绑定保存语义；保留原速录屏与真实鼠标。\n- 00:47–00:57 可控结论：真实口播 + 单一右侧结论锁定。\n\n风格由 A1SemanticMotionStyleRouter/v1 按语义路由，禁止连续同模板与仅换色变体。边界：SYSTEM_VALIDATION_CANDIDATE_ONLY；用户视觉批准仍为 NOT_APPROVED。\n`;
const propsSha256 = sha256Value(props);
const cacheKey = sha256Value({contract: props.contract, propsSha256, componentSha256: sha256File(componentFile), entrySha256: sha256File(entryFile), semanticStyleRouterSha256: sha256File(semanticStyleRouterFile), semanticStylePlanSha256: semanticStylePlan.planSha256, sourceWorkspaceSha256: workspace.workspaceSha256, currentBoardSha256: workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256});

let cacheHit = false;
if (fs.existsSync(outputFile) && fs.existsSync(manifestFile)) {
  const prior = readJson(manifestFile);
  cacheHit = prior.renderMetrics?.cacheKey === cacheKey && prior.output?.sha256 === sha256File(outputFile) && prior.output?.durationInFrames === totalFrames;
}
fs.writeFileSync(propsFile, `${JSON.stringify(props, null, 2)}\n`);
fs.writeFileSync(planFile, `${JSON.stringify(motionPlan, null, 2)}\n`);
fs.writeFileSync(stylePlanFile, `${JSON.stringify(semanticStylePlan, null, 2)}\n`);
fs.writeFileSync(storyboardFile, storyboard);

const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const startedAt = performance.now();
let bundleMs = 0;
let renderMs = 0;
const reviewFrames = [18, 56, 110, 139, 188, 250, 335, 430, 465, 502, 548, 628, 710, 756, 854, 960, 1002, 1112, 1222, 1260, 1325, 1390, 1428, 1480, 1560, 1690];
const reviewSamples = [];

if (!cacheHit) {
  const bundleStartedAt = performance.now();
  const serveUrl = await bundle({entryPoint: entryFile, publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
  bundleMs = Math.round(performance.now() - bundleStartedAt);
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    assert(composition.durationInFrames === totalFrames && composition.width === width && composition.height === height && composition.fps === fps, "representative-motion-composition-metadata-invalid");
    const renderStartedAt = performance.now();
    await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputFile, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: false, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    renderMs = Math.round(performance.now() - renderStartedAt);
    for (const frame of reviewFrames) {
      const segment = [...segments].reverse().find((item) => frame >= item.outputStartFrame);
      const file = path.join(reviewRoot, `${String(frame).padStart(4, "0")}-${segment.shotId.toLowerCase()}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      reviewSamples.push({frame, shotId: segment.shotId, publicUrl: publicUrlFor(file), sha256: sha256File(file)});
    }
  } finally {
    await browser.close({silent: true});
  }
  const thumbs = await Promise.all(reviewSamples.map((sample) => sharp(publicFile(sample.publicUrl)).resize(384, 216, {fit: "cover"}).png().toBuffer()));
  const columns = 5;
  const rows = Math.ceil(thumbs.length / columns);
  await sharp({create: {width: columns * 384, height: rows * 216, channels: 3, background: "#080a0b"}})
    .composite(thumbs.map((input, index) => ({input, left: (index % columns) * 384, top: Math.floor(index / columns) * 216})))
    .png({compressionLevel: 9})
    .toFile(contactSheetFile);
} else {
  const prior = readJson(manifestFile);
  reviewSamples.push(...(prior.contactSheet?.samples || []));
}

assert(fs.existsSync(outputFile) && fs.statSync(outputFile).size > 1_000_000, "representative-motion-output-invalid");
assert(fs.existsSync(contactSheetFile), "representative-motion-contact-sheet-missing");
assert(sha256File(workspaceFile) === workspaceBeforeFileSha256, "representative-motion-workspace-mutated");
assert(sha256File(currentPhaseFile) === currentPhaseBeforeSha256, "representative-motion-current-phase-mutated");

const manifestBody = {
  contract: `A1RepresentativeMatureMotionManifest/${version}`,
  status: "CANDIDATE_ONLY_PENDING_USER_MOTION_REVIEW",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  authorization: {kind: "EXPLICIT_USER_REPRESENTATIVE_MOTION_EXECUTION", scope: "57.7 second representative motion candidate only", operatorWaivedIntermediateReview: true},
  sourceAuthority: {workspaceSemanticSha256: workspace.workspaceSha256, workspaceFileSha256: workspaceBeforeFileSha256, currentPhaseFileSha256: currentPhaseBeforeSha256, wholeFilmBoardSha256: workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256, wholeFilmTimelineBoardSha256: workspace.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.sha256},
  output: {publicUrl: publicUrlFor(outputFile), sha256: sha256File(outputFile), bytes: fs.statSync(outputFile).size, width, height, fps, durationInFrames: totalFrames, durationMs: Math.round(totalFrames / fps * 1000)},
  contactSheet: {publicUrl: publicUrlFor(contactSheetFile), sha256: sha256File(contactSheetFile), samples: reviewSamples},
  sourceBindings: {presenterVideo, narrationAudio, subtitle, quietBackground, screenClips, styleBriefs},
  semanticStylePlan: {contract: semanticStylePlan.contract, publicUrl: publicUrlFor(stylePlanFile), sha256: sha256File(stylePlanFile), planSha256: semanticStylePlan.planSha256, audit: semanticStylePlan.audit},
  motionPlan: {publicUrl: publicUrlFor(planFile), sha256: sha256File(planFile)},
  storyboard: {publicUrl: publicUrlFor(storyboardFile), sha256: sha256File(storyboardFile)},
  renderMetrics: {cacheHit, cacheKey, bundleMs, renderMs, totalMs: Math.round(performance.now() - startedAt), concurrency: 2, imageGenCalls: 0, sourcePlaybackRate: 1},
  boundaries: {candidateOnly: true, operatorWaivedIntermediateReview: true, userVisualApproval: "NOT_APPROVED", productionEligible: false, currentBoardMutationPerformed: false, workspaceMutationPerformed: false, currentPhaseMutationPerformed: false, assemblyPerformed: false, layerExtractionPerformed: false, resolvePerformed: false, finalRenderPerformed: false},
  propsSha256,
  renderedAt: new Date().toISOString(),
};
const manifest = {...manifestBody, manifestSha256: sha256Value(manifestBody)};
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: manifest.status, output: manifest.output, contactSheet: {publicUrl: manifest.contactSheet.publicUrl, sha256: manifest.contactSheet.sha256, sampleCount: manifest.contactSheet.samples.length}, renderMetrics: manifest.renderMetrics, boundaries: manifest.boundaries}, null, 2)}\n`);
