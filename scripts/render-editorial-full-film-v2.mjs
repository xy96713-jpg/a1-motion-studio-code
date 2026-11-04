#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {bindHandoffActors, createProductionEvent, register1080pAndDavinciRelease, register540pRenderArtifact} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const resolution = Number(process.argv.find((item) => item.startsWith("--resolution="))?.split("=")[1]);
if (![540, 1080].includes(resolution)) throw new Error("resolution-must-be-540-or-1080");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const phaseDir = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const outputDir = path.join(phaseDir, "full-film");
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/full-film");
const acceptedPath = path.join(phaseDir, "accepted-shot-ir-v2.json");
const motionPath = path.join(phaseDir, "motion-ir-v2.json");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = require("@remotion/renderer");
let statefulRenderStarted = false;
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const safeTag = () => new Date().toISOString().replace(/[:.]/gu, "-");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };
const xml = (value) => String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const srtTime = (ms) => { const value = Math.max(0, Math.round(ms)); const hours = Math.floor(value / 3_600_000); const minutes = Math.floor(value % 3_600_000 / 60_000); const seconds = Math.floor(value % 60_000 / 1000); const milli = value % 1000; return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")},${String(milli).padStart(3,"0")}`; };

function buildDavinciPackage(workspace, acceptedSet, motionSet, masterPath, tag) {
  const packageName = `a1-davinci-delivery-${tag}`;
  const packageRoot = path.join(phaseDir, "davinci-delivery", packageName);
  fs.mkdirSync(packageRoot, {recursive: true});
  const mediaDir = path.join(packageRoot, "media");
  const fontDir = path.join(packageRoot, "fonts");
  const overlayDir = path.join(packageRoot, "replaceable-assets");
  fs.mkdirSync(mediaDir, {recursive: true}); fs.mkdirSync(fontDir, {recursive: true}); fs.mkdirSync(overlayDir, {recursive: true});
  const packagedMaster = path.join(mediaDir, path.basename(masterPath));
  fs.copyFileSync(masterPath, packagedMaster);
  const copiedAssets = [];
  for (const asset of workspace.library.assets.filter((item) => item.review.status === "approved" && item.assetUri)) {
    const source = path.join(appRoot, "public", asset.assetUri.replace(/^\//u, ""));
    if (!fs.existsSync(source)) continue;
    const targetDir = asset.route === "project-font" ? fontDir : ["editorial-artwork", "generated-glyph"].includes(asset.route) ? overlayDir : null;
    if (!targetDir) continue;
    const target = path.join(targetDir, `${asset.id}${path.extname(source)}`);
    fs.copyFileSync(source, target);
    copiedAssets.push({assetId: asset.id, relativePath: path.relative(packageRoot, target), sha256: shaFile(target), route: asset.route});
  }
  const shotCsv = ["shotId,order,startMs,endMs,durationMs,candidateId,topology,sourceText", ...acceptedSet.scenes.map((scene) => [scene.shotId, scene.order, scene.source.editWindow.startMs, scene.source.editWindow.endMs, scene.source.editWindow.durationMs, scene.candidateId, scene.sceneGraph.topology, `"${String(scene.source.text).replace(/"/gu, '""')}"`].join(","))].join("\n");
  fs.writeFileSync(path.join(packageRoot, "shot-timeline.csv"), `${shotCsv}\n`, "utf8");
  const subtitles = acceptedSet.scenes.map((scene, index) => `${index + 1}\n${srtTime(scene.source.editWindow.startMs)} --> ${srtTime(scene.source.editWindow.endMs)}\n${scene.source.text}\n`).join("\n");
  fs.writeFileSync(path.join(packageRoot, "subtitles.srt"), subtitles, "utf8");
  writeJson(path.join(packageRoot, "accepted-shot-ir-v2.json"), acceptedSet);
  writeJson(path.join(packageRoot, "motion-ir-v2.json"), motionSet);
  writeJson(path.join(packageRoot, "asset-and-font-manifest.json"), {contract: "A1DavinciAssetManifest/v1", projectId: workspace.production.project.projectId, master: {relativePath: path.relative(packageRoot, packagedMaster), sha256: shaFile(packagedMaster)}, assets: copiedAssets, sourceWorkspaceSha256: workspace.workspaceSha256});
  const durationSeconds = acceptedSet.scenes.reduce((sum, scene) => sum + scene.source.editWindow.durationMs, 0) / 1000;
  const frameDuration = Math.round(durationSeconds * 30);
  const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10"><resources><format id="r1" name="FFVideoFormat1080p30" frameDuration="1/30s" width="1920" height="1080"/><asset id="r2" name="${xml(path.basename(packagedMaster))}" src="${xml(pathToFileURL(packagedMaster).href)}" start="0s" duration="${frameDuration}/30s" hasVideo="1" hasAudio="1" format="r1"/></resources><library><event name="A1 Visual Director"><project name="${xml(workspace.article.title)}"><sequence format="r1" duration="${frameDuration}/30s" tcStart="0s" tcFormat="NDF"><spine><asset-clip ref="r2" name="A1 1080p Master" start="0s" duration="${frameDuration}/30s"/></spine></sequence></project></event></library></fcpxml>\n`;
  fs.writeFileSync(path.join(packageRoot, "timeline.fcpxml"), fcpxml, "utf8");
  fs.writeFileSync(path.join(packageRoot, "README.txt"), `A1 Visual Director Studio / DaVinci delivery\n\n1. Import media/${path.basename(packagedMaster)} for the approved master.\n2. Import timeline.fcpxml when a timeline exchange is useful.\n3. subtitles.srt contains the approved shot-level subtitle windows.\n4. replaceable-assets/ and fonts/ contain approved reusable packaging sources.\n5. Verify hashes in asset-and-font-manifest.json before relinking.\n`, "utf8");
  const zipPath = path.join(phaseDir, "davinci-delivery", `${packageName}.zip`);
  execFileSync("/usr/bin/zip", ["-qr", zipPath, packageName], {cwd: path.dirname(packageRoot)});
  return {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/davinci-delivery/${path.basename(zipPath)}`, sha256: shaFile(zipPath), packageRoot, zipPath};
}

async function main() {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (!fs.existsSync(acceptedPath) || !fs.existsSync(motionPath)) throw new Error("accepted-shot-ir-v2-and-motion-ir-v2-required-for-full-film");
  const acceptedSet = JSON.parse(fs.readFileSync(acceptedPath, "utf8"));
  const motionSet = JSON.parse(fs.readFileSync(motionPath, "utf8"));
  if (acceptedSet.contract !== "A1AcceptedShotIRSet/v2" || acceptedSet.shotCount !== workspace.article.shotCount) throw new Error("full-film-accepted-shot-count-mismatch");
  if (motionSet.contract !== "A1MotionIRSet/v2" || motionSet.acceptedShotIrSha256 !== acceptedSet.sha256 || motionSet.sceneCount !== acceptedSet.shotCount) throw new Error("full-film-motion-ir-missing-or-stale");
  if (workspace.production.acceptedShotIr?.sha256 !== acceptedSet.sha256 || workspace.production.acceptedShotIr?.sourceWorkspaceSha256 !== acceptedSet.sourceWorkspaceSha256 || workspace.production.acceptedShotIr?.status === "locked-upstream-revision") throw new Error("full-film-accepted-ir-stale-against-current-workspace");
  if (resolution === 540 && workspace.production.release.review540p.status !== "rendering") throw new Error("review-540p-state-not-rendering");
  if (resolution === 1080 && workspace.production.release.final1080p.status !== "rendering") throw new Error("final-1080p-state-not-rendering");
  const audioBinding = workspace.production.assembly.mediaBindings.audio;
  if (!audioBinding?.publicUrl) throw new Error("approved-audio-binding-required");
  const handoffs = acceptedSet.scenes.slice(0, -1)
    .map((scene, index) => bindHandoffActors(scene, acceptedSet.scenes[index + 1]))
    .filter(Boolean);
  const plan = {contract: "A1FilmAssemblyRenderPlan/v1", shotIds: acceptedSet.scenes.map((scene) => scene.shotId), durationMs: workspace.article.durationMs, handoffs};
  const inputProps = {acceptedSet, motionSet, plan, audioUri: audioBinding.publicUrl};
  statefulRenderStarted = true;
  fs.mkdirSync(outputDir, {recursive: true}); fs.mkdirSync(artifactDir, {recursive: true});
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: path.join(appRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: "A1AcceptedEditorialSequenceV2", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const tag = safeTag();
    const videoName = resolution === 540 ? `review-540p-${tag}.mp4` : `master-1080p-${tag}.mp4`;
    const videoPath = path.join(outputDir, videoName);
    await renderMedia({serveUrl, composition, inputProps, outputLocation: videoPath, scale: resolution === 540 ? .5 : 1, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 88, crf: resolution === 540 ? 23 : 19, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: false, puppeteerInstance: browser, logLevel: "warn"});
    const artifact = {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/full-film/${videoName}`, sha256: shaFile(videoPath), durationMs: Math.round(composition.durationInFrames / composition.fps * 1000), width: resolution === 540 ? 960 : 1920, height: resolution};
    const davinciPackage = resolution === 1080 ? buildDavinciPackage(workspace, acceptedSet, motionSet, videoPath, tag) : null;
    const report = {contract: "A1FullFilmRenderReport/v1", status: resolution === 540 ? "540P_READY_FOR_FINAL_RELEASE_DECISION" : "1080P_AND_DAVINCI_COMPLETE", resolution, renderedAt: new Date().toISOString(), acceptedShotIrSha256: acceptedSet.sha256, motionIrSha256: motionSet.sha256, artifact, davinciPackage: davinciPackage ? {publicUrl: davinciPackage.publicUrl, sha256: davinciPackage.sha256} : null, gates: {intermediateApprovalRequired: false, finalReleaseDecisionRequired: resolution === 540, explicit1080pRequestObserved: resolution === 1080}};
    writeJson(path.join(outputDir, `render-report-${resolution}-${tag}.json`), report); writeJson(path.join(artifactDir, `render-report-${resolution}-${tag}.json`), report);
    withProjectLock(appRoot, () => {
      const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
      const event = createProductionEvent({workspace: current, action: resolution === 540 ? "review-540p-rendered" : "final-1080p-and-davinci-rendered", targetId: acceptedSet.sha256, payload: report});
      let next = resolution === 540 ? register540pRenderArtifact(current, artifact) : register1080pAndDavinciRelease(current, artifact, davinciPackage);
      next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
      next = recalculateEditorialAssetWorkbench(next);
      persistProjectState(appRoot, next, {event});
    });
    if (resolution === 540) {
      try {
        execFileSync(process.execPath, [path.join(root, "scripts/run-current-film-visual-quality-review-v1.mjs")], {cwd: root, stdio: "inherit"});
      } catch (qualityError) {
        // The 540p artifact remains reviewable, but the visual gate stays
        // blocked when the independent critic is unavailable or fails.
        console.error(`film-visual-quality-review-failed:${qualityError instanceof Error ? qualityError.message : String(qualityError)}`);
      }
    }
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close({silent: true}); }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (!statefulRenderStarted) {
    console.error(error);
    process.exitCode = 1;
    return;
  }
  try { withProjectLock(appRoot, () => { const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)); const event = createProductionEvent({workspace: current, action: `render-${resolution}-failed`, payload: {error: message}}); const next = structuredClone(current); if (resolution === 540) next.production.release.review540p.status = "render-failed"; else next.production.release.final1080p.status = "render-failed"; next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt; persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next), {event}); }); } catch (persistError) { console.error(persistError); }
  console.error(error); process.exitCode = 1;
});
