#!/usr/bin/env node
/**
 * Automatic project release-preview worker.
 *
 * This is deliberately separate from the built-in article release worker:
 * project imports live under their own immutable project directory, while
 * 1080p/DaVinci are dispatched automatically only after the independent
 * 540p visual critic passes and the required audio source is bound.
 */
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";
import {assertProjectAcceptedShotIrSet, assertProjectMotionIrSet} from "../apps/studio-next/src/lib/a1-project-accepted-shot-ir-v2.mjs";
import {projectDirs, persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const projectId = process.argv.find((value) => value.startsWith("--projectId="))?.slice("--projectId=".length) || "";
if (!/^[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]{0,119}$/iu.test(projectId)) throw new Error("project-540p-project-id-invalid");
const resolution = Number(process.argv.find((value) => value.startsWith("--resolution="))?.split("=")[1] || "540");
const finalRelease = resolution === 1080 && process.argv.includes("--final");
if (![540, 1080].includes(resolution) || (resolution === 1080 && !finalRelease)) throw new Error("project-render-resolution-or-final-flag-invalid");

const {publicDir, artifactDir} = projectDirs(appRoot);
const publicProjectDir = path.join(publicDir, "projects", projectId);
const artifactProjectDir = path.join(artifactDir, "projects", projectId);
const acceptedPath = path.join(artifactProjectDir, "accepted-shot-ir-v2.json");
const motionPath = path.join(artifactProjectDir, "motion-ir-v2.json");
const require = createRequire(path.join(root, "remotion-renderer/package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");

const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fs.renameSync(tmp, file); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dispatchAutomaticVisualRepair() {
  const script = path.join(root, "scripts/run-editorial-project-autopilot-v1.mjs");
  const child = spawn(process.execPath, [script, `--projectId=${projectId}`], {cwd: root, detached: true, stdio: "ignore", env: process.env});
  child.unref();
  return child.pid || null;
}

async function updateProject(action, payload, mutate, files = {}) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return withProjectLock(appRoot, () => {
        const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
        const next = structuredClone(current);
        const entry = next.production.projectIntakes?.find((item) => item.projectId === projectId);
        if (!entry) throw new Error("project-540p-intake-not-found");
        mutate(entry, next);
        const event = createProductionEvent({workspace: current, action, targetId: projectId, payload: {...payload, automatic: true}});
        next.production.eventLedger.eventCount += 1;
        next.production.eventLedger.lastEventId = event.eventId;
        next.production.eventLedger.lastEventAt = event.createdAt;
        const intakeFile = path.join(artifactProjectDir, "intake.json");
        const persistedFiles = {...files};
        if (fs.existsSync(intakeFile)) {
          const intakeDocument = JSON.parse(fs.readFileSync(intakeFile, "utf8"));
          intakeDocument.status = entry.status;
          intakeDocument.updatedAt = entry.updatedAt;
          intakeDocument.pipeline = {automationMode: entry.automationMode, intermediateApprovalRequired: false, finalDecisionRequired: false, motionStatus: entry.motionStatus || null, review540pStatus: entry.review540pStatus || null, review540pPublicUrl: entry.review540pPublicUrl || null, visualQualityStatus: entry.visualQualityStatus || null, visualQualityVerdict: entry.visualQualityVerdict || null, visualQualityScore: entry.visualQualityScore ?? null, visualQualityReportPublicUrl: entry.visualQualityReportPublicUrl || null, visualRepairBriefPublicUrl: entry.visualRepairBriefPublicUrl || null, final1080pStatus: entry.final1080pStatus || null, final1080pPublicUrl: entry.final1080pPublicUrl || null, davinciPackageStatus: entry.davinciPackageStatus || null, davinciPackagePublicUrl: entry.davinciPackagePublicUrl || null, finalReleaseBlockedReason: entry.finalReleaseBlockedReason || null};
          const unsignedIntake = structuredClone(intakeDocument); delete unsignedIntake.sha256; intakeDocument.sha256 = crypto.createHash("sha256").update(JSON.stringify(unsignedIntake)).digest("hex");
          entry.sha256 = intakeDocument.sha256;
          persistedFiles[`projects/${projectId}/intake.json`] = intakeDocument;
        }
        const recalculated = recalculateEditorialAssetWorkbench(next);
        persistProjectState(appRoot, recalculated, {event, files: persistedFiles});
        return recalculated;
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "production-state-write-in-progress" || attempt === 39) throw error;
      await sleep(180);
    }
  }
  throw new Error("project-540p-state-lock-timeout");
}

function findAudioUri() {
  const workspacePath = path.join(artifactProjectDir, "project-asset-workspace.json");
  if (!fs.existsSync(workspacePath)) return null;
  const assetWorkspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
  const audio = assetWorkspace.assets?.find((asset) => asset.binding?.slotKind === "audio" && asset.output?.publicUrl);
  return audio?.output?.publicUrl || null;
}

async function contactSheet(frames, output) {
  const sharp = (await import("sharp")).default;
  const tileWidth = 480;
  const tileHeight = 270;
  const width = tileWidth * 3;
  const height = tileHeight * 2;
  const composites = frames.map((file, index) => ({input: file, left: (index % 3) * tileWidth, top: Math.floor(index / 3) * tileHeight}));
  await sharp({create: {width, height, channels: 4, background: "#08090a"}}).composite(composites).png().toFile(output);
}

async function runFilmVisualQualityReview({stills, artifact, plan, contactPath}) {
  const candidates = stills.map((item, index) => ({
    candidateId: `film-frame-${String(index + 1).padStart(2, "0")}`,
    direction: `全片第 ${index + 1} 个代表帧，来自真实 540p 渲染结果`,
    expectedText: null,
    sourceFrame: item.frame,
  }));
  const reportBase = path.join(artifactProjectDir, "visual-quality-review");
  const reportName = "visual-quality-review.json";
  const briefName = "visual-repair-brief.json";
  let report;
  try {
    report = await runVisualMaturityCritic({
      scope: "sequence-contact-sheet",
      images: stills.map((item) => item.path),
      candidates,
      context: {
        projectId,
        intent: "评估自动连接后的 540p 全片代表帧，不要求用户逐镜审批；只有整片达到参考成熟度才允许最终 1080p/DaVinci 决定。",
        sourceArtifactSha256: artifact.sha256,
        contactSheetSha256: shaFile(contactPath),
        shotIds: plan.shotIds,
        realSourceBoundary: "真实人物、真实录屏和事实素材必须来自用户绑定文件；生成资产不得替代事实证据。",
      },
      cacheDir: path.join(reportBase, "cache"),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    report = {
      contract: "A1VisualMaturityCritic/v1",
      scope: "sequence-contact-sheet",
      status: "BLOCK",
      verdict: "UNAVAILABLE",
      totalScore: null,
      benchmarkThreshold: 22,
      hardFailures: ["visual-critic-unavailable"],
      selectedCandidateId: null,
      candidates,
      repairPlan: {highestImpact: "视觉审计进程不可用，禁止把工程 PASS 当成审美 PASS。", nextPrompt: "恢复视觉审计后重新运行 540p 全片审计。", retain: [], remove: []},
      trace: {contract: "A1VisualMaturityCriticTrace/v1", taskId: `visual-critic-unavailable-${Date.now()}`, model: "unavailable", durationMs: 0, promptHash: null, contextHash: null, outputHash: null, error: reason},
    };
  }
  fs.mkdirSync(reportBase, {recursive: true});
  writeJson(path.join(reportBase, reportName), report);
  const repairBrief = {
    contract: "A1FilmVisualRepairBrief/v1",
    projectId,
    sourceArtifactSha256: artifact.sha256,
    sourceReportSha256: shaFile(path.join(reportBase, reportName)),
    verdict: report.verdict,
    totalScore: report.totalScore,
    hardFailures: report.hardFailures || [],
    repairPlan: report.repairPlan || null,
    automaticNextStep: report.verdict === "PASS" && Number(report.totalScore) >= 22 && !(report.hardFailures || []).length
      ? "allow-final-render-decision"
      : "regenerate-visual-sequence-from-repair-plan-and-rerun-540p",
    createdAt: new Date().toISOString(),
  };
  writeJson(path.join(reportBase, briefName), repairBrief);
  return {
    contract: "A1FilmVisualQualityReview/v1",
    status: report.verdict === "PASS" && Number(report.totalScore) >= 22 && !(report.hardFailures || []).length ? "passed" : "blocked",
    scope: "sequence-contact-sheet",
    verdict: report.verdict,
    totalScore: Number.isFinite(Number(report.totalScore)) ? Number(report.totalScore) : null,
    maxScore: 24,
    hardFailures: report.hardFailures || [],
    sourceArtifactSha256: artifact.sha256,
    reportPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/visual-quality-review/${reportName}`,
    reportSha256: shaFile(path.join(reportBase, reportName)),
    repairBriefPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/visual-quality-review/${briefName}`,
    repairBriefSha256: shaFile(path.join(reportBase, briefName)),
    reviewedAt: report.reviewedAt || new Date().toISOString(),
    nextAction: report.verdict === "PASS" && Number(report.totalScore) >= 22 && !(report.hardFailures || []).length ? "decide-final-render-and-davinci" : "auto-revise-film-visual-sequence-from-critic",
    report,
    repairBrief,
  };
}

function buildProjectDeliveryPackage({acceptedSet, motionSet, plan, videoPath, title, assetWorkspace, tag}) {
  const packageName = `a1-${projectId}-davinci-delivery-${tag}`;
  const packageRoot = path.join(publicProjectDir, "davinci-delivery", packageName);
  const mediaDir = path.join(packageRoot, "media");
  const fontsDir = path.join(packageRoot, "fonts");
  const assetsDir = path.join(packageRoot, "replaceable-assets");
  fs.mkdirSync(mediaDir, {recursive: true}); fs.mkdirSync(fontsDir, {recursive: true}); fs.mkdirSync(assetsDir, {recursive: true});
  const master = path.join(mediaDir, path.basename(videoPath)); fs.copyFileSync(videoPath, master);
  const copied = [];
  for (const asset of assetWorkspace?.assets || []) {
    if (!asset.output?.publicUrl || !asset.output?.sha256) continue;
    const source = path.join(appRoot, "public", asset.output.publicUrl.replace(/^\//u, ""));
    if (!fs.existsSync(source)) continue;
    const targetRoot = asset.route === "project-font" ? fontsDir : assetsDir;
    const target = path.join(targetRoot, `${asset.id}${path.extname(source)}`);
    fs.copyFileSync(source, target); copied.push({assetId: asset.id, route: asset.route, relativePath: path.relative(packageRoot, target), sha256: shaFile(target)});
  }
  const srtTime = (ms) => { const v = Math.max(0, Math.round(ms)); return `${String(Math.floor(v / 3600000)).padStart(2, "0")}:${String(Math.floor(v % 3600000 / 60000)).padStart(2, "0")}:${String(Math.floor(v % 60000 / 1000)).padStart(2, "0")},${String(v % 1000).padStart(3, "0")}`; };
  const xml = (value) => String(value).replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
  const seconds = (ms) => `${(Number(ms || 0) / 1000).toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "")}s`;
  fs.writeFileSync(path.join(packageRoot, "subtitles.srt"), `${acceptedSet.scenes.map((scene, index) => `${index + 1}\n${srtTime(scene.source.editWindow.startMs)} --> ${srtTime(scene.source.editWindow.endMs)}\n${scene.source.text}\n`).join("\n")}\n`, "utf8");
  fs.writeFileSync(path.join(packageRoot, "shot-timeline.csv"), ["shotId,order,startMs,endMs,durationMs,candidateId,topology", ...acceptedSet.scenes.map((scene) => [scene.shotId, scene.order, scene.source.editWindow.startMs, scene.source.editWindow.endMs, scene.source.editWindow.durationMs, scene.candidateId, scene.sceneGraph.topology].join(","))].join("\n") + "\n", "utf8");
  const totalDuration = acceptedSet.scenes.reduce((sum, scene) => sum + Number(scene.source.editWindow.durationMs || 0), 0);
  let offsetMs = 0;
  const markers = acceptedSet.scenes.map((scene) => { const marker = `<marker start="${seconds(offsetMs)}" duration="${seconds(scene.source.editWindow.durationMs)}" value="${xml(scene.shotId)}" note="${xml(scene.source.text)}"/>`; offsetMs += Number(scene.source.editWindow.durationMs || 0); return marker; }).join("");
  const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10"><resources><format id="r1" name="FFVideoFormat1080p30" frameDuration="1/30s" width="1920" height="1080"/><asset id="r2" name="${xml(path.basename(master))}" src="${xml(pathToFileURL(master).href)}" start="0s" duration="${seconds(totalDuration)}" hasVideo="1" hasAudio="1" format="r1"/></resources><library><event name="${xml(title)}"><project name="${xml(title)}"><sequence format="r1" duration="${seconds(totalDuration)}" tcStart="0s" tcFormat="NDF" audioRate="48k"><spine><asset-clip ref="r2" offset="0s" start="0s" duration="${seconds(totalDuration)}">${markers}</asset-clip></spine></sequence></project></event></library></fcpxml>\n`;
  fs.writeFileSync(path.join(packageRoot, "davinci-timeline.fcpxml"), fcpxml, "utf8");
  writeJson(path.join(packageRoot, "accepted-shot-ir-v2.json"), acceptedSet); writeJson(path.join(packageRoot, "motion-ir-v2.json"), motionSet); writeJson(path.join(packageRoot, "render-plan.json"), plan); writeJson(path.join(packageRoot, "asset-and-font-manifest.json"), {contract: "A1ProjectDavinciAssetManifest/v1", projectId, title, master: {relativePath: path.relative(packageRoot, master), sha256: shaFile(master)}, timeline: {relativePath: "davinci-timeline.fcpxml", sha256: shaFile(path.join(packageRoot, "davinci-timeline.fcpxml")), markerCount: acceptedSet.scenes.length}, assets: copied});
  fs.writeFileSync(path.join(packageRoot, "README.txt"), `A1 Visual Director Studio project delivery\n\nMaster: media/${path.basename(master)}\nDaVinci/FCPXML timeline: davinci-timeline.fcpxml\nSubtitle timeline: subtitles.srt\nShot timeline: shot-timeline.csv\nReplaceable packaging: replaceable-assets/\nEditable fonts: fonts/\n\nImport davinci-timeline.fcpxml into DaVinci Resolve. If Resolve asks to relink the master, select media/${path.basename(master)}. Shot IDs are embedded as timeline markers.\n`, "utf8");
  const zipPath = path.join(publicProjectDir, "davinci-delivery", `${packageName}.zip`);
  const {execFileSync} = require("node:child_process");
  execFileSync("/usr/bin/zip", ["-qr", zipPath, packageName], {cwd: path.dirname(packageRoot)});
  return {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/davinci-delivery/${path.basename(zipPath)}`, sha256: shaFile(zipPath)};
}

async function main() {
  if (!fs.existsSync(acceptedPath) || !fs.existsSync(motionPath)) throw new Error("project-accepted-and-motion-ir-required");
  const acceptedSet = assertProjectAcceptedShotIrSet(JSON.parse(fs.readFileSync(acceptedPath, "utf8")));
  const motionSet = assertProjectMotionIrSet(JSON.parse(fs.readFileSync(motionPath, "utf8")));
  if (acceptedSet.projectId !== projectId || motionSet.projectId !== projectId) throw new Error("project-540p-ir-project-mismatch");
  if (motionSet.acceptedShotIrSha256 !== acceptedSet.sha256 || motionSet.sceneCount !== acceptedSet.shotCount) throw new Error("project-540p-ir-hash-or-count-mismatch");
  const hardFailures = acceptedSet.scenes.flatMap((scene) => scene.sceneGraph?.hardFailures || []);
  if (hardFailures.length) throw new Error(`project-540p-scene-hard-failure:${[...new Set(hardFailures)].join(",")}`);
  const missingMotionActors = acceptedSet.scenes.flatMap((scene) => {
    const motion = motionSet.scenes.find((item) => item.sceneId === scene.shotId);
    const actorIds = new Set((motion?.actors || []).map((actor) => actor.id));
    return scene.sceneGraph.nodes.filter((node) => !actorIds.has(node.id)).map((node) => `${scene.shotId}:${node.id}`);
  });
  if (missingMotionActors.length) throw new Error(`project-540p-motion-actor-missing:${missingMotionActors.join(",")}`);

  const audioUri = findAudioUri();
  if (finalRelease && !audioUri) throw new Error("project-final-audio-source-required");
  const plan = {
    contract: "A1ProjectFilmAssemblyRenderPlan/v1",
    projectId,
    shotIds: acceptedSet.scenes.map((scene) => scene.shotId),
    durationMs: acceptedSet.scenes.reduce((sum, scene) => sum + Number(scene.source.editWindow.durationMs || 0), 0),
    handoffs: acceptedSet.scenes.slice(0, -1).map((scene, index) => {
      const next = acceptedSet.scenes[index + 1];
      const fromNode = scene.sceneGraph.nodes.find((node) => node.id === "primary") || scene.sceneGraph.nodes.find((node) => node.type === "editable-text");
      const toNode = next.sceneGraph.nodes.find((node) => node.id === "primary") || next.sceneGraph.nodes.find((node) => node.type === "editable-text");
      return fromNode && toNode ? {from: scene.shotId, to: next.shotId, fromActorId: fromNode.id, toActorId: toNode.id, handoffType: scene.handoff?.actor ? "source-object-continuity" : "claim-to-verdict-transformation", semanticActor: scene.handoff?.actor || "scene-continuity"} : null;
    }).filter(Boolean),
  };
  const startedAt = new Date().toISOString();
  await updateProject(finalRelease ? "project-final-1080-and-davinci-started" : "project-motion-and-540p-started", {shotCount: acceptedSet.shotCount, motionSha256: motionSet.sha256}, (entry) => {
    if (finalRelease && entry.status !== "PROJECT_540P_READY_FOR_FINAL_DECISION") throw new Error("project-final-review-540p-required");
    entry.status = finalRelease ? "PROJECT_FINAL_1080_AND_DAVINCI_RENDERING" : "PROJECT_MOTION_AND_540P_RENDERING";
    entry.motionStatus = finalRelease ? "automatic-motion-complete" : "rendering";
    entry.motionPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/motion-ir-v2.json`;
    entry.motionSha256 = motionSet.sha256;
    entry.review540pStatus = finalRelease ? "ready-for-review" : "rendering";
    entry.finalReleaseBlockedReason = audioUri ? null : "audio-source-not-bound-visual-review-only";
    entry.updatedAt = startedAt;
  }, {[`projects/${projectId}/render-plan.json`]: plan});

  let renderStarted = false;
  let browser;
  try {
    fs.mkdirSync(publicProjectDir, {recursive: true});
    const outputDir = path.join(publicProjectDir, "renders");
    const artifactOutputDir = path.join(artifactProjectDir, "renders");
    fs.mkdirSync(outputDir, {recursive: true}); fs.mkdirSync(artifactOutputDir, {recursive: true});
    const serveUrl = await bundle({entryPoint: path.join(root, "remotion-renderer/src/index.ts"), publicDir: path.join(appRoot, "public"), rootDir: path.join(root, "remotion-renderer"), enableCaching: true});
    browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
    const inputProps = {acceptedSet, motionSet, plan, audioUri};
    const composition = await selectComposition({serveUrl, id: "A1AcceptedEditorialSequenceV2", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const tag = new Date().toISOString().replace(/[:.]/gu, "-");
    const videoName = finalRelease ? `master-1080p-${tag}.mp4` : `review-540p-${tag}.mp4`;
    const videoPath = path.join(outputDir, videoName);
    renderStarted = true;
    await renderMedia({serveUrl, composition, inputProps, outputLocation: videoPath, scale: finalRelease ? 1 : .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: finalRelease ? 92 : 88, crf: finalRelease ? 19 : 23, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: false, puppeteerInstance: browser, logLevel: "warn"});
    const stillDir = path.join(outputDir, `stills-${tag}`);
    const stillArtifactDir = path.join(artifactOutputDir, `stills-${tag}`);
    fs.mkdirSync(stillDir, {recursive: true}); fs.mkdirSync(stillArtifactDir, {recursive: true});
    const sampleFrames = [0, .17, .34, .5, .67, .84].map((ratio) => Math.min(composition.durationInFrames - 1, Math.max(0, Math.round((composition.durationInFrames - 1) * ratio))));
    const stills = [];
    for (const [index, frame] of sampleFrames.entries()) {
      const stillPath = path.join(stillDir, `frame-${String(index + 1).padStart(2, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps, frame, output: stillPath, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      stills.push({frame, path: stillPath, sha256: shaFile(stillPath)});
    }
    const contactPath = path.join(outputDir, `contact-sheet-${tag}.png`);
    await contactSheet(stills.map((item) => item.path), contactPath);
    const artifactContactPath = path.join(artifactOutputDir, path.basename(contactPath));
    fs.copyFileSync(contactPath, artifactContactPath);
    const assetWorkspace = fs.existsSync(path.join(artifactProjectDir, "project-asset-workspace.json")) ? JSON.parse(fs.readFileSync(path.join(artifactProjectDir, "project-asset-workspace.json"), "utf8")) : null;
    const davinciPackage = finalRelease ? buildProjectDeliveryPackage({acceptedSet, motionSet, plan, videoPath, title: projectId, assetWorkspace, tag}) : null;
    const artifact = {contract: finalRelease ? "A1Project1080pReleaseArtifact/v1" : "A1Project540pReviewArtifact/v1", status: finalRelease ? "complete" : "ready-for-final-decision", projectId, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/renders/${videoName}`, sha256: shaFile(videoPath), width: finalRelease ? 1920 : 960, height: finalRelease ? 1080 : 540, fps: 30, durationMs: Math.round(composition.durationInFrames / composition.fps * 1000), bytes: fs.statSync(videoPath).size, audioBound: Boolean(audioUri), renderedAt: new Date().toISOString(), renderer: "remotion", acceptedShotIrSha256: acceptedSet.sha256, motionIrSha256: motionSet.sha256, contactSheetPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/renders/${path.basename(contactPath)}`, contactSheetSha256: shaFile(contactPath), davinciPackage, stills: stills.map((item) => ({frame: item.frame, sha256: shaFile(item.path)}))};
    const visualQualityReview = finalRelease ? null : await runFilmVisualQualityReview({stills, artifact, plan, contactPath});
    const audit = {contract: "A1ProjectVisualProofAudit/v1", status: finalRelease ? "FINAL_1080P_AND_DAVINCI_COMPLETE" : visualQualityReview?.status === "passed" ? "PASS_FOR_FINAL_DECISION_REVIEW" : "BLOCKED_VISUAL_QUALITY_REVIEW", projectId, reviewedAt: artifact.renderedAt, source: {acceptedShotIrSha256: acceptedSet.sha256, motionIrSha256: motionSet.sha256}, checks: {allShotsConnected: acceptedSet.shotCount === motionSet.sceneCount && acceptedSet.scenes.length === plan.shotIds.length, motionActorCoverage: missingMotionActors.length === 0, hardFailureCount: hardFailures.length, sourceBindings: acceptedSet.scenes.reduce((sum, scene) => sum + scene.materialBindings.length, 0), audioBound: Boolean(audioUri), frameContactSheetRendered: true, visualQualityGate: finalRelease ? "previous-540p-pass-required" : visualQualityReview?.status || "blocked", maturityClaim: false}, artifact: {publicUrl: artifact.publicUrl, sha256: artifact.sha256, contactSheetPublicUrl: artifact.contactSheetPublicUrl, contactSheetSha256: artifact.contactSheetSha256}, visualQualityReview: visualQualityReview ? {status: visualQualityReview.status, verdict: visualQualityReview.verdict, totalScore: visualQualityReview.totalScore, hardFailures: visualQualityReview.hardFailures, reportPublicUrl: visualQualityReview.reportPublicUrl, reportSha256: visualQualityReview.reportSha256, repairBriefPublicUrl: visualQualityReview.repairBriefPublicUrl, repairBriefSha256: visualQualityReview.repairBriefSha256} : null, finalDecision: {required: !finalRelease, action: "render-1080p-and-generate-davinci-package"}, note: finalRelease ? "用户已明确最终发布；1080p 与 DaVinci 交付包已生成。" : visualQualityReview?.status === "passed" ? "全镜头已自动连成动态并通过整片视觉审计；现在才等待唯一最终交付决定。" : "全镜头已自动连成动态，但整片视觉审计未达到 22/24；系统必须先自动返修并重审。"};
    const artifactName = finalRelease ? "final-1080p-artifact.json" : "review-540p-artifact.json";
    const auditName = finalRelease ? "final-release-audit.json" : "visual-proof-audit.json";
    writeJson(path.join(publicProjectDir, artifactName), artifact); writeJson(path.join(artifactProjectDir, artifactName), artifact); writeJson(path.join(publicProjectDir, auditName), audit); writeJson(path.join(artifactProjectDir, auditName), audit);
    if (finalRelease) { writeJson(path.join(publicProjectDir, "review-540p-artifact.json"), artifact); writeJson(path.join(artifactProjectDir, "review-540p-artifact.json"), artifact); writeJson(path.join(publicProjectDir, "visual-proof-audit.json"), audit); writeJson(path.join(artifactProjectDir, "visual-proof-audit.json"), audit); }
    const projectStatus = finalRelease ? "PROJECT_FINAL_1080_AND_DAVINCI_COMPLETE" : visualQualityReview?.status === "passed" ? "PROJECT_540P_READY_FOR_FINAL_DECISION" : "PROJECT_540P_VISUAL_REVISE_REQUIRED";
    const updatedWorkspace = await updateProject(finalRelease ? "project-final-1080-and-davinci-ready" : visualQualityReview?.status === "passed" ? "project-motion-and-540p-ready" : "project-motion-and-540p-visual-revise-required", {artifactSha256: artifact.sha256, auditSha256: shaFile(path.join(artifactProjectDir, "visual-proof-audit.json")), audioBound: Boolean(audioUri), visualQualityStatus: visualQualityReview?.status || null, visualQualityScore: visualQualityReview?.totalScore ?? null}, (entry) => {
      entry.status = projectStatus;
      entry.motionStatus = "automatic-motion-complete";
      if (finalRelease) { entry.final1080pStatus = "complete"; entry.final1080pPublicUrl = artifact.publicUrl; entry.final1080pSha256 = artifact.sha256; entry.davinciPackageStatus = "complete"; entry.davinciPackagePublicUrl = artifact.davinciPackage?.publicUrl || null; entry.davinciPackageSha256 = artifact.davinciPackage?.sha256 || null; }
      else { entry.review540pStatus = "ready-for-review"; entry.review540pPublicUrl = artifact.publicUrl; entry.review540pSha256 = artifact.sha256; entry.review540pRenderedAt = artifact.renderedAt; entry.review540pWidth = artifact.width; entry.review540pHeight = artifact.height; entry.review540pAudioBound = Boolean(audioUri); entry.visualQualityStatus = visualQualityReview?.status || null; entry.visualQualityVerdict = visualQualityReview?.verdict || null; entry.visualQualityScore = visualQualityReview?.totalScore ?? null; entry.visualQualityReportPublicUrl = visualQualityReview?.reportPublicUrl || null; entry.visualQualityReportSha256 = visualQualityReview?.reportSha256 || null; entry.visualRepairBriefPublicUrl = visualQualityReview?.repairBriefPublicUrl || null; entry.visualRepairBriefSha256 = visualQualityReview?.repairBriefSha256 || null; entry.visualQualityHardFailures = visualQualityReview?.hardFailures || []; entry.visualQualityReviewedAt = visualQualityReview?.reviewedAt || null; if (visualQualityReview?.status !== "passed") entry.visualRepairAttemptCount = Number(entry.visualRepairAttemptCount || 0) + 1; entry.visualRepairMaxAttempts = Number(entry.visualRepairMaxAttempts || 3); }
      entry.finalReleaseBlockedReason = finalRelease ? null : visualQualityReview?.status !== "passed" ? "film-visual-quality-gate-blocked" : audioUri ? null : "audio-source-not-bound-visual-review-only";
      entry.updatedAt = artifact.renderedAt;
      entry.completedAt = artifact.renderedAt;
    }, {[`projects/${projectId}/${artifactName}`]: artifact, [`projects/${projectId}/${auditName}`]: audit, ...(visualQualityReview ? {[`projects/${projectId}/visual-quality-review/visual-quality-review.json`]: visualQualityReview.report, [`projects/${projectId}/visual-quality-review/visual-repair-brief.json`]: visualQualityReview.repairBrief} : {}), ...(finalRelease ? {[`projects/${projectId}/review-540p-artifact.json`]: artifact, [`projects/${projectId}/visual-proof-audit.json`]: audit} : {})});
    const repairAttemptCount = Number(updatedWorkspace.production.projectIntakes?.find((entry) => entry.projectId === projectId)?.visualRepairAttemptCount || 0);
    const repairAllowed = !finalRelease && visualQualityReview?.status !== "passed" && repairAttemptCount <= 3;
    const automaticRepairPid = repairAllowed ? dispatchAutomaticVisualRepair() : null;
    console.log(JSON.stringify({status: "PASS", projectId, artifact, audit, automaticRepair: repairAllowed ? {status: "dispatched", pid: automaticRepairPid, attempt: repairAttemptCount, maxAttempts: 3} : {status: visualQualityReview?.status === "passed" ? "not-needed" : "stopped-after-max-attempts", attempt: repairAttemptCount, maxAttempts: 3}}, null, 2));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await updateProject(finalRelease ? "project-final-1080-and-davinci-failed" : "project-motion-and-540p-failed", {reason, renderStarted}, (entry) => { entry.status = "BLOCKED_RENDER"; entry.motionStatus = "failed"; entry.review540pStatus = finalRelease ? (entry.review540pStatus || "ready-for-review") : "render-failed"; if (finalRelease) { entry.final1080pStatus = "failed"; entry.davinciPackageStatus = "failed"; } entry.finalReleaseBlockedReason = reason; entry.updatedAt = new Date().toISOString(); });
    throw error;
  } finally {
    if (browser) await browser.close({silent: true});
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
