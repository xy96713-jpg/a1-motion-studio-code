#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import os from "node:os";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {enforceMediaEntrypointAuthorization, PACKAGING_AUTHORIZATION_STAGES} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(appRoot, "public");
const proofRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/ed01-ed02-causal-motion-proof-v1");
const outputRelative = "generated/system-line/editorial-asset-workbench-v1/resolve-layout-handoffs/ED-01/v1";
const outputRoot = path.join(publicRoot, outputRelative);
enforceMediaEntrypointAuthorization({
  appRoot,
  receiptPath: process.env.A1_PACKAGE_EXPORT_AUTH_RECEIPT,
  stage: PACKAGING_AUTHORIZATION_STAGES.PACKAGE_EXPORT,
  entrypointId: "ed01-legacy-resolve-layout-export",
  targetId: "ED-01_LEGACY_RESOLVE_LAYOUT_ALPHA",
  outputRoute: "OVERLAY_ALPHA",
});
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

function inspectAlphaStream(file) {
  const ffprobeRoot = path.join(rendererRoot, "node_modules/@remotion/compositor-darwin-arm64");
  const output = execFileSync(path.join(ffprobeRoot, "ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,duration", "-of", "json", file], {encoding: "utf8", env: {...process.env, DYLD_LIBRARY_PATH: ffprobeRoot}});
  const stream = JSON.parse(output).streams?.[0];
  if (!stream || stream.codec_name !== "prores" || !String(stream.pix_fmt || "").startsWith("yuva444p") || stream.width !== 1920 || stream.height !== 1080 || stream.r_frame_rate !== "30/1") throw new Error(`resolve-alpha-stream-invalid:${path.basename(file)}`);
  return stream;
}

async function inspectAlphaVariation(file) {
  const binaryRoot = path.join(rendererRoot, "node_modules/@remotion/compositor-darwin-arm64");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-resolve-alpha-"));
  const pngPath = path.join(temporaryRoot, "probe.png");
  try {
    execFileSync(path.join(binaryRoot, "ffmpeg"), ["-v", "error", "-ss", "2.53", "-i", file, "-frames:v", "1", pngPath], {env: {...process.env, DYLD_LIBRARY_PATH: binaryRoot}});
    const {channels} = await sharp(pngPath).stats();
    const alpha = channels[3];
    if (!alpha || alpha.min !== 0 || alpha.max <= 0 || alpha.mean <= 0) throw new Error(`resolve-alpha-variation-invalid:${path.basename(file)}`);
    return {min: alpha.min, max: alpha.max, mean: Number(alpha.mean.toFixed(3)), transparentAndVisiblePixelsPresent: true, probeTimeSeconds: 2.53};
  } finally {
    fs.rmSync(temporaryRoot, {recursive: true, force: true});
  }
}

async function renderAlphaPass({serveUrl, browser, previewSet, motionSet, pass, outputLocation}) {
  const inputProps = {previewSet, motionSet, shotId: "ED-01", pass};
  const composition = await selectComposition({serveUrl, id: "A1ResolveTypographyPassV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    outputLocation,
    codec: "prores",
    proResProfile: "4444",
    pixelFormat: "yuva444p10le",
    imageFormat: "png",
    concurrency: 2,
    muted: true,
    hardwareAcceleration: "disable",
    overwrite: true,
    puppeteerInstance: browser,
    logLevel: "warn",
  });
  return composition;
}

async function main() {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const proofPropsPath = path.join(proofRoot, "input-props.json");
  if (!fs.existsSync(proofPropsPath)) throw new Error("ed01-causal-proof-input-required-before-resolve-layout-export");
  const proofProps = JSON.parse(fs.readFileSync(proofPropsPath, "utf8"));
  const scene = proofProps.previewSet?.scenes?.find((item) => item.shotId === "ED-01");
  const motionScene = proofProps.motionSet?.scenes?.find((item) => item.sceneId === "ED-01");
  const shot = workspace.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === "ED-01");
  const candidate = shot?.candidates?.find((item) => item.candidateId === scene?.candidateId);
  if (!scene || !motionScene || !candidate) throw new Error("ed01-resolve-layout-source-candidate-missing");
  const sourceSceneGraphSha256 = sha256(candidate.sceneGraph);
  if (sourceSceneGraphSha256 !== sha256(scene.sceneGraph)) throw new Error("ed01-resolve-layout-source-stale-against-current-scene-graph");
  if (scene.sceneGraph.resolveFinishing?.contract !== "A1ResolveManualMaskPlan/v1" || scene.sceneGraph.resolveFinishing.executionAuthority !== "davinci-resolve") throw new Error("ed01-resolve-manual-mask-plan-required");
  if (scene.sceneGraph.resolveFinishing.simulatedOcclusionAllowedForDelivery !== false) throw new Error("ed01-simulated-occlusion-must-be-preview-only");
  const visibleText = scene.sceneGraph.nodes.filter((node) => node.type === "editable-text" && node.visualMode !== "editable-shadow");
  const behindIds = visibleText.filter((node) => node.resolveDepthRole === "behind-foreground").map((node) => node.id);
  const frontIds = visibleText.filter((node) => node.resolveDepthRole === "front-overlay").map((node) => node.id);
  if (!behindIds.length || !frontIds.length) throw new Error("ed01-front-and-behind-typography-passes-required");

  fs.mkdirSync(outputRoot, {recursive: true});
  const behindPath = path.join(outputRoot, "ED-01-typography-behind-foreground-prores4444.mov");
  const frontPath = path.join(outputRoot, "ED-01-typography-front-overlay-prores4444.mov");
  const maskGuidePath = path.join(outputRoot, "ED-01-resolve-mask-guide.png");
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  let behindComposition;
  let frontComposition;
  try {
    behindComposition = await renderAlphaPass({serveUrl, browser, previewSet: proofProps.previewSet, motionSet: proofProps.motionSet, pass: "behind-foreground", outputLocation: behindPath});
    frontComposition = await renderAlphaPass({serveUrl, browser, previewSet: proofProps.previewSet, motionSet: proofProps.motionSet, pass: "front-overlay", outputLocation: frontPath});
    const maskGuideProps = {previewSet: proofProps.previewSet, motionSet: proofProps.motionSet, shotId: "ED-01", pass: "mask-guide"};
    const maskGuideComposition = await selectComposition({serveUrl, id: "A1ResolveTypographyPassV1", inputProps: maskGuideProps, puppeteerInstance: browser, logLevel: "warn"});
    await renderStill({serveUrl, composition: maskGuideComposition, inputProps: maskGuideProps, frame: Math.min(76, maskGuideComposition.durationInFrames - 1), output: maskGuidePath, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  } finally {
    await browser.close({silent: true});
  }

  const exportedAt = new Date().toISOString();
  const behindStream = inspectAlphaStream(behindPath);
  const frontStream = inspectAlphaStream(frontPath);
  const behindAlpha = await inspectAlphaVariation(behindPath);
  const frontAlpha = await inspectAlphaVariation(frontPath);
  const manifest = {
    contract: "A1ResolveLayoutHandoff/v1",
    status: "layout-ready-mask-pending",
    reviewOnly: true,
    shotId: "ED-01",
    candidateId: scene.candidateId,
    sourceSceneGraphSha256,
    sourceMotionIrSceneSha256: sha256(motionScene),
    sourceWindow: scene.source.editWindow,
    canvas: {width: 1920, height: 1080, fps: 30, durationInFrames: motionScene.timing.frameDuration},
    typographyPasses: {
      behindForeground: {publicUrl: `/${outputRelative}/${path.basename(behindPath)}`, sha256: shaFile(behindPath), codec: "prores-4444", requestedPixelFormat: "yuva444p10le", verifiedStream: behindStream, verifiedAlpha: behindAlpha, actorIds: behindIds, resolveTrackHint: "V2"},
      frontOverlay: {publicUrl: `/${outputRelative}/${path.basename(frontPath)}`, sha256: shaFile(frontPath), codec: "prores-4444", requestedPixelFormat: "yuva444p10le", verifiedStream: frontStream, verifiedAlpha: frontAlpha, actorIds: frontIds, resolveTrackHint: "V4"},
    },
    sourceTrackHint: "V1",
    foregroundMatteTrackHint: "V3",
    maskGuide: {publicUrl: `/${outputRelative}/${path.basename(maskGuidePath)}`, sha256: shaFile(maskGuidePath), occlusionTargets: scene.sceneGraph.resolveFinishing.occlusionTargets, faceProtection: scene.sceneGraph.resolveFinishing.faceProtection},
    finishingPolicy: scene.sceneGraph.resolveFinishing,
    candidateAdoptionAllowed: false,
    finalRenderAllowed: false,
    resolveProjectMutationPerformed: false,
    exportedAt,
  };
  const manifestPath = path.join(outputRoot, "resolve-layout-handoff.json");
  writeJson(manifestPath, manifest);
  fs.writeFileSync(path.join(outputRoot, "README.txt"), `A1 Visual Director Studio / ED-01 Resolve layout handoff\n\nV1: original presenter footage\nV2: ${path.basename(behindPath)}\nV3: duplicate original footage with your manual presenter / microphone / monitor masks\nV4: ${path.basename(frontPath)}\n\nThe mask guide is placement guidance only. No mask was written into DaVinci Resolve.\nThe simulated Remotion occluder is preview-only and is forbidden in final delivery.\n`, "utf8");

  const handoff = {
    contract: "A1ResolveLayoutHandoff/v1",
    status: "layout-ready-mask-pending",
    shotId: "ED-01",
    candidateId: scene.candidateId,
    sourceSceneGraphSha256,
    durationInFrames: behindComposition.durationInFrames,
    fps: behindComposition.fps,
    behindTypography: {publicUrl: manifest.typographyPasses.behindForeground.publicUrl, sha256: manifest.typographyPasses.behindForeground.sha256, codec: "prores-4444"},
    frontTypography: {publicUrl: manifest.typographyPasses.frontOverlay.publicUrl, sha256: manifest.typographyPasses.frontOverlay.sha256, codec: "prores-4444"},
    maskGuide: {publicUrl: manifest.maskGuide.publicUrl, sha256: manifest.maskGuide.sha256},
    manifest: {publicUrl: `/${outputRelative}/${path.basename(manifestPath)}`, sha256: shaFile(manifestPath)},
    exportedAt,
    reviewOnly: true,
    candidateAdoptionAllowed: false,
    finalRenderAllowed: false,
  };

  withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const currentShot = current.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === "ED-01");
    const currentCandidate = currentShot?.candidates?.find((item) => item.candidateId === handoff.candidateId);
    if (!currentCandidate || sha256(currentCandidate.sceneGraph) !== sourceSceneGraphSha256) throw new Error("ed01-resolve-layout-persist-source-stale");
    const next = structuredClone(current);
    next.production.resolveLayoutHandoffs ||= {};
    next.production.resolveLayoutHandoffs["ED-01"] = handoff;
    next.production.maturityLoop.status = "resolve-layout-review-required";
    next.production.maturityLoop.currentStage = "ed01-resolve-layout-handoff";
    next.production.maturityLoop.nextAction = "review-ed01-resolve-layout-handoff";
    next.production.maturityLoop.lastTickAt = exportedAt;
    next.production.maturityLoop.updatedAt = exportedAt;
    const event = createProductionEvent({workspace: current, action: "resolve-layout-handoff-exported", targetId: "ED-01", payload: {candidateId: handoff.candidateId, sourceSceneGraphSha256, manifestSha256: handoff.manifest.sha256, reviewOnly: true, resolveProjectMutationPerformed: false}, now: exportedAt});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, exportedAt), {event});
  });

  console.log(JSON.stringify({status: handoff.status, shotId: handoff.shotId, candidateId: handoff.candidateId, behindTypography: handoff.behindTypography, frontTypography: handoff.frontTypography, maskGuide: handoff.maskGuide, manifest: handoff.manifest, resolveProjectMutationPerformed: false}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
