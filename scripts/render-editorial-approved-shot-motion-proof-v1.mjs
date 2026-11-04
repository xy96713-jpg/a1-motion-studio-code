#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildMotionIrSceneFromAcceptedShot} from "../apps/studio-next/src/lib/a1-project-accepted-shot-ir-v2.mjs";
import {bindHandoffActors, buildAcceptedOperationSequence} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const profile = process.argv.find((item) => item.startsWith("--profile="))?.split("=")[1] || "reference-mix";
const reviewOnlyCandidates = process.argv.includes("--review-only-candidates");
const profiles = {
  "ed04-operation": ["ED-04"],
  "causal-screen": ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06"],
  "reference-mix": ["ED-02", "ED-03", "ED-09", "ED-10"],
  "aesthetic-proof": ["ED-01", "ED-02", "ED-09", "ED-10"],
  "research-proof": ["ED-12", "ED-13", "ED-14"],
  "all-selected-atlas": null,
};
const requestedShotIds = profiles[profile];
if (!Object.hasOwn(profiles, profile)) throw new Error(`unknown-proof-profile:${profile}`);

const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };

function handoffFrameSamples(scenes, handoffs, compositionDurationInFrames) {
  let offset = 0;
  const offsets = scenes.map((scene) => {
    const durationInFrames = Math.max(1, Math.round(scene.source.editWindow.durationMs / 1000 * 30));
    const result = {scene, from: offset, durationInFrames};
    offset += durationInFrames;
    return result;
  });
  return offsets.slice(0, -1).flatMap(({scene, from, durationInFrames}, index) => {
    const toScene = offsets[index + 1].scene;
    const handoff = handoffs.find((item) => item.from === scene.shotId && item.to === toScene.shotId);
    if (!handoff) return [];
    const bridgeDuration = Math.min(16, Math.max(10, Math.round(durationInFrames * .18)));
    const bridgeFrom = from + durationInFrames - Math.round(bridgeDuration / 2);
    const frames = [
      bridgeFrom,
      bridgeFrom + Math.round((bridgeDuration - 1) / 2),
      bridgeFrom + bridgeDuration - 1,
    ].map((frame) => Math.max(0, Math.min(compositionDurationInFrames - 1, frame)));
    return frames.map((frame, phaseIndex) => ({
      frame,
      phase: ["start", "travel", "land"][phaseIndex],
      from: handoff.from,
      to: handoff.to,
      fromActorId: handoff.fromActorId,
      toActorId: handoff.toActorId,
      semanticActor: handoff.semanticActor,
    }));
  });
}

async function normalizedFramePixels(file) {
  return sharp(file).resize(160, 90, {fit: "fill"}).grayscale().raw().toBuffer();
}

function meanAbsolutePixelDelta(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return Math.round(total / Math.max(1, left.length) / 255 * 100_000) / 100_000;
}

function materialBinding(workspace, assetId) {
  const asset = workspace.library.assets.find((item) => item.id === assetId);
  if (!asset || asset.review?.status !== "approved") throw new Error(`proof-material-not-approved:${assetId}`);
  const glyph = asset.route === "generated-glyph"
    ? asset.typographySpec?.generatedCandidates?.find((item) => item.id === asset.selectedCandidateId)
    : null;
  return {
    assetId,
    assetUri: glyph?.publicUrl || asset.assetUri,
    sha256: glyph?.sha256 || asset.sha256,
    contentSha256: asset.contentSha256,
    provenance: asset.provenance,
    videoEvidence: asset.videoEvidence || null,
  };
}

function previewScene(workspace, shotId) {
  const shot = workspace.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === shotId);
  const candidateId = reviewOnlyCandidates
    ? shot?.visualCritic?.selectedCandidateId || shot?.candidates?.[0]?.candidateId
    : shot?.selectedCandidateId;
  const candidate = shot?.candidates?.find((item) => item.candidateId === candidateId);
  // A review-only proof is intentionally allowed to render the current
  // critic candidate (or first candidate) even when static screening blocks
  // adoption. This gives the visual reviewer a continuous sequence to judge;
  // production/Accepted Shot IR paths still enforce every screening failure.
  const screeningBlocked = !reviewOnlyCandidates && candidate?.screening?.hardFailures?.length;
  if (!shot || !candidate || (!reviewOnlyCandidates && !shot.selectedCandidateId) || screeningBlocked) throw new Error(`proof-shot-candidate-not-admitted:${shotId}`);
  const value = {
    contract: "A1SceneGraphMotionPreview/v1",
    reviewOnly: true,
    sourceWorkspaceSha256: workspace.workspaceSha256,
    shotId,
    order: shot.shotDemand.order,
    chapterId: shot.shotDemand.chapterId,
    source: {cueIds: shot.shotDemand.cueIds, text: shot.shotDemand.sourceText, editWindow: shot.shotDemand.editWindow},
    candidateId: candidate.candidateId,
    materialBindings: candidate.sceneGraph.approvedMaterialIds.map((assetId) => materialBinding(workspace, assetId)),
    sceneGraph: candidate.sceneGraph,
    operationSequence: buildAcceptedOperationSequence(workspace, shot, candidate),
    visualContract: {
      visualJob: shot.shotDemand.visualJob,
      primaryActor: shot.shotDemand.primaryActor,
      materialRoute: shot.shotDemand.materialRoute,
      topology: shot.shotDemand.topology,
      typographyRole: shot.shotDemand.typographyRole,
      keyPhrases: shot.shotDemand.keyPhrases,
      layoutConstraints: shot.shotDemand.layoutConstraints,
      motionPhrase: shot.shotDemand.motionPhrase,
      handoffActor: shot.shotDemand.handoffActor,
      structureDirections: shot.shotDemand.structureDirections,
    },
    motionPhrase: candidate.sceneGraph.motionPhrase,
    handoff: candidate.sceneGraph.handoff,
    approval: {status: "provisional-motion-preview", reviewedAt: shot.review?.reviewedAt || null, note: reviewOnlyCandidates ? "review-only critic/first-candidate motion preview; not Accepted Shot IR" : "review-only candidate motion preview; not Accepted Shot IR"},
  };
  return {...value, sha256: sha256(value)};
}

async function main() {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const shotIds = requestedShotIds || workspace.library.assets
    .filter((item) => item.route === "shot-composition" && item.selectedCandidateId)
    .sort((left, right) => left.shotDemand.order - right.shotDemand.order)
    .map((item) => item.shotDemand.shotId);
  if (!shotIds.length) throw new Error(`proof-profile-has-no-shots:${profile}`);
  const scenes = shotIds.map((shotId) => previewScene(workspace, shotId));
  const previewValue = {
    contract: "A1SceneGraphMotionPreviewSet/v1",
    projectId: workspace.production.project.projectId,
    reviewOnly: true,
    candidateSelectionMode: reviewOnlyCandidates ? "critic-recommendation-or-first-candidate" : "selected-shot-only",
    profile,
    sourceWorkspaceSha256: workspace.workspaceSha256,
    shotCount: scenes.length,
    scenes,
  };
  const previewSet = {...previewValue, sha256: sha256(previewValue)};
  const shotById = new Map(workspace.library.assets.filter((item) => item.route === "shot-composition").map((item) => [item.shotDemand.shotId, item]));
  const motionScenes = scenes.map((scene) => buildMotionIrSceneFromAcceptedShot(scene, {...shotById.get(scene.shotId).shotDemand, visualContract: scene.visualContract}, {sourceAuthority: "A1SceneGraphMotionPreview/v1"}));
  const motionValue = {contract: "A1MotionIRPreviewSet/v1", projectId: workspace.production.project.projectId, reviewOnly: true, sourceSceneGraphSetSha256: previewSet.sha256, fps: 30, sceneCount: motionScenes.length, scenes: motionScenes};
  const motionSet = {...motionValue, sha256: sha256(motionValue)};
  const transitionPairs = scenes.slice(0, -1).map((scene, index) => ({fromScene: scene, toScene: scenes[index + 1]}));
  const handoffs = transitionPairs.map(({fromScene, toScene}) => bindHandoffActors(fromScene, toScene)).filter(Boolean);
  const plan = {
    contract: "A1SceneGraphMotionPreviewPlan/v1",
    reviewOnly: true,
    profile,
    shotIds,
    durationMs: scenes.reduce((sum, scene) => sum + scene.source.editWindow.durationMs, 0),
    sourceSceneGraphSetSha256: previewSet.sha256,
    handoffs,
    hardCuts: transitionPairs.filter(({fromScene, toScene}) => !handoffs.some((item) => item.from === fromScene.shotId && item.to === toScene.shotId)).map(({fromScene, toScene}) => ({from: fromScene.shotId, to: toScene.shotId, reason: Number(toScene.order) === Number(fromScene.order) + 1 ? "no-grounded-shared-actor" : "non-contiguous-representative-edit"})),
  };
  const inputProps = {previewSet, motionSet, plan};
  const outputDir = path.join(phaseRoot, `scene-graph-motion-preview-v1-${profile}`);
  fs.mkdirSync(outputDir, {recursive: true});
  writeJson(path.join(outputDir, "input-props.json"), inputProps);
  // The deterministic renderer owns its public asset boundary. The review
  // runner mirrors approved shot assets into remotion-renderer/public before
  // bundling, so browser URLs cannot silently depend on the Next app's
  // separate public root.
  // Do not reuse a bundle whose static public manifest predates the latest
  // generated/reference assets; stale caching was the source of silent 404s
  // in the typography-material preview.
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: false});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: "A1SceneGraphMotionPreviewV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    if (profile === "all-selected-atlas") {
      const atlasFrameDir = path.join(outputDir, "motion-atlas-frames");
      fs.mkdirSync(atlasFrameDir, {recursive: true});
      let offset = 0;
      const phaseSamples = scenes.flatMap((scene, index) => {
        const motionScene = motionScenes[index];
        const phases = [
          {id: "setup", localFrame: 0},
          {id: "action", localFrame: motionScene.phases.action.endFrame},
          {id: "confirm", localFrame: motionScene.phases.confirm.endFrame},
          {id: "hold", localFrame: motionScene.phases.stableReadingHold.startFrame},
        ];
        const samples = phases.map((phase) => ({...phase, shotId: scene.shotId, editMode: scene.sceneGraph.editMode, motionProfile: motionScene.motionProfile.name, frame: Math.min(composition.durationInFrames - 1, offset + phase.localFrame)}));
        offset += Math.max(1, Math.round(scene.source.editWindow.durationMs / 1000 * 30));
        return samples;
      });
      const atlasTileWidth = 400;
      const atlasTileHeight = 225;
      const atlasLabelHeight = 32;
      const renderedSamples = [];
      for (const sample of phaseSamples) {
        const stillPath = path.join(atlasFrameDir, `${sample.shotId}-${sample.id}-f${String(sample.frame).padStart(4, "0")}.png`);
        await renderStill({serveUrl, composition, inputProps, frame: sample.frame, output: stillPath, imageFormat: "png", scale: .25, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
        const label = Buffer.from(`<svg width="${atlasTileWidth}" height="${atlasLabelHeight}"><rect width="100%" height="100%" fill="#0d0f10"/><text x="10" y="20" fill="#dfff68" font-family="monospace" font-size="10">${sample.shotId} · ${sample.editMode} · ${sample.motionProfile} · ${sample.id}</text></svg>`);
        const tile = await sharp(stillPath).resize(atlasTileWidth, atlasTileHeight).extend({top: atlasLabelHeight, bottom: 0, left: 0, right: 0, background: "#0d0f10"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer();
        renderedSamples.push({...sample, stillPath, tile, pixels: await normalizedFramePixels(stillPath)});
      }
      const pageRows = 6;
      const pageShotCount = pageRows;
      const pageCount = Math.ceil(scenes.length / pageShotCount);
      const pages = [];
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const pageSamples = renderedSamples.slice(pageIndex * pageShotCount * 4, (pageIndex + 1) * pageShotCount * 4);
        const pagePath = path.join(outputDir, `all-selected-motion-atlas-page-${String(pageIndex + 1).padStart(2, "0")}.png`);
        await sharp({create: {width: atlasTileWidth * 4, height: (atlasTileHeight + atlasLabelHeight) * Math.ceil(pageSamples.length / 4), channels: 4, background: "#0d0f10"}}).composite(pageSamples.map((sample, index) => ({input: sample.tile, left: index % 4 * atlasTileWidth, top: Math.floor(index / 4) * (atlasTileHeight + atlasLabelHeight)}))).png().toFile(pagePath);
        pages.push({publicUrl: `/generated/system-line/editorial-asset-workbench-v1/scene-graph-motion-preview-v1-${profile}/${path.basename(pagePath)}`, sha256: shaFile(pagePath), shotIds: [...new Set(pageSamples.map((sample) => sample.shotId))]});
      }
      const shotMotion = scenes.map((scene, index) => {
        const samples = renderedSamples.slice(index * 4, index * 4 + 4);
        const deltas = samples.slice(1).map((sample, deltaIndex) => meanAbsolutePixelDelta(samples[deltaIndex].pixels, sample.pixels));
        const actorProperties = [...new Set(motionScenes[index].actors.flatMap((actor) => actor.propertyTracks.map((track) => track.property)))].sort();
        return {shotId: scene.shotId, editMode: scene.sceneGraph.editMode, motionProfile: motionScenes[index].motionProfile.name, actorProperties, phaseFrames: Object.fromEntries(samples.map((sample) => [sample.id, sample.frame])), consecutivePixelDeltas: deltas, meanPixelDelta: Math.round(deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length) * 100_000) / 100_000};
      });
      const grammarGroups = new Map();
      for (const shot of shotMotion) {
        const signature = `${shot.editMode}|${shot.motionProfile}|${shot.actorProperties.join(",")}`;
        grammarGroups.set(signature, [...(grammarGroups.get(signature) || []), shot.shotId]);
      }
      const repeatedMotionGrammars = [...grammarGroups.entries()].filter(([signature, ids]) => ids.length >= 4 && !signature.startsWith("presenter-clean|presenter-address|")).map(([signature, ids]) => ({signature, shotIds: ids}));
      const motionProfileCounts = Object.fromEntries([...new Set(shotMotion.map((shot) => shot.motionProfile))].sort().map((name) => [name, shotMotion.filter((shot) => shot.motionProfile === name).length]));
      const lowMotionShots = shotMotion.filter((shot) => shot.meanPixelDelta < .004).map((shot) => shot.shotId);
      const report = {
        contract: "A1AllSelectedMotionAtlasReport/v1",
        profile,
        status: lowMotionShots.length || repeatedMotionGrammars.length ? "STRUCTURAL_PASS_VISUAL_REVISE" : "STRUCTURAL_PASS_VISUAL_PENDING",
        reviewOnly: true,
        renderedAt: new Date().toISOString(),
        sourceWorkspaceSha256: workspace.workspaceSha256,
        sourceSceneGraphSetSha256: previewSet.sha256,
        motionIrPreviewSetSha256: motionSet.sha256,
        composition: {id: composition.id, durationInFrames: composition.durationInFrames, fps: composition.fps, width: 960, height: 540},
        shotCount: scenes.length,
        phaseCountPerShot: 4,
        pages,
        shotMotion,
        findings: {lowMotionShots, repeatedMotionGrammars, motionProfileCounts, intentionalQuietPresenterShots: shotMotion.filter((shot) => shot.editMode === "presenter-clean").map((shot) => shot.shotId)},
        hardFailures: [...(lowMotionShots.length ? ["selected-shot-motion-dead-zone"] : []), ...(repeatedMotionGrammars.length ? ["four-or-more-shots-share-motion-grammar"] : [])],
        gates: {acceptedShotIrAdoptionAllowed: false, representativeMotionPromotionAllowed: false, fullFilmAllowed: false, h47ExpansionAllowed: false},
      };
      writeJson(path.join(outputDir, "all-selected-motion-atlas-report.json"), report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    const videoPath = path.join(outputDir, `${profile}-960x540.mp4`);
    await renderMedia({serveUrl, composition, inputProps, outputLocation: videoPath, scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 88, crf: 22, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const frameDir = path.join(outputDir, "review-frames");
    fs.mkdirSync(frameDir, {recursive: true});
    const sampleFrames = Array.from({length: 12}, (_, index) => Math.min(composition.durationInFrames - 1, Math.round(index * (composition.durationInFrames - 1) / 11)));
    const tileWidth = 480;
    const tileHeight = 270;
    const labelHeight = 32;
    const tiles = [];
    for (const frame of sampleFrames) {
      const stillPath = path.join(frameDir, `f${String(frame).padStart(4, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps, frame, output: stillPath, imageFormat: "png", scale: .25, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0d0f10"/><text x="12" y="22" fill="#dfff68" font-family="monospace" font-size="12">F${frame} · ${(frame / 30).toFixed(2)}s</text></svg>`);
      tiles.push(await sharp(stillPath).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#0d0f10"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const sheetPath = path.join(outputDir, `${profile}-contact-sheet.png`);
    await sharp({create: {width: tileWidth * 4, height: (tileHeight + labelHeight) * 3, channels: 4, background: "#0d0f10"}}).composite(tiles.map((input, index) => ({input, left: index % 4 * tileWidth, top: Math.floor(index / 4) * (tileHeight + labelHeight)}))).png().toFile(sheetPath);
    const handoffSamples = handoffFrameSamples(scenes, handoffs, composition.durationInFrames);
    let handoffSheetPath = null;
    const handoffRenderedSamples = [];
    if (handoffSamples.length) {
      const handoffFrameDir = path.join(outputDir, "handoff-review-frames");
      fs.mkdirSync(handoffFrameDir, {recursive: true});
      const handoffTiles = [];
      for (const sample of handoffSamples) {
        const stillPath = path.join(handoffFrameDir, `${sample.from}-${sample.to}-${sample.phase}-f${String(sample.frame).padStart(4, "0")}.png`);
        await renderStill({serveUrl, composition, inputProps, frame: sample.frame, output: stillPath, imageFormat: "png", scale: .25, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
        handoffRenderedSamples.push({...sample, pixels: await normalizedFramePixels(stillPath)});
        const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0d0f10"/><text x="12" y="21" fill="#dfff68" font-family="monospace" font-size="11">${sample.from} to ${sample.to} · ${sample.phase} · F${sample.frame}</text></svg>`);
        handoffTiles.push(await sharp(stillPath).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#0d0f10"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
      }
      handoffSheetPath = path.join(outputDir, `${profile}-handoff-contact-sheet.png`);
      await sharp({create: {width: tileWidth * 3, height: (tileHeight + labelHeight) * (handoffSamples.length / 3), channels: 4, background: "#0d0f10"}}).composite(handoffTiles.map((input, index) => ({input, left: index % 3 * tileWidth, top: Math.floor(index / 3) * (tileHeight + labelHeight)}))).png().toFile(handoffSheetPath);
    }
    const minimumMeaningfulHandoffDelta = .004;
    const handoffPixelMeasurements = Array.from({length: Math.floor(handoffRenderedSamples.length / 3)}, (_, index) => {
      const [start, travel, land] = handoffRenderedSamples.slice(index * 3, index * 3 + 3);
      const startToTravel = meanAbsolutePixelDelta(start.pixels, travel.pixels);
      const travelToLand = meanAbsolutePixelDelta(travel.pixels, land.pixels);
      return {
        from: start.from,
        to: start.to,
        semanticActor: start.semanticActor,
        startToTravel,
        travelToLand,
        minimumMeaningfulDelta: minimumMeaningfulHandoffDelta,
        pass: startToTravel >= minimumMeaningfulHandoffDelta && travelToLand >= minimumMeaningfulHandoffDelta,
      };
    });
    const failedHandoffPixelMeasurements = handoffPixelMeasurements.filter((item) => !item.pass);
    const handoffHardFailures = failedHandoffPixelMeasurements.map((item) => `handoff-visual-change-too-low:${item.from}:${item.to}`);
    const report = {
      contract: "A1SceneGraphMotionPreviewReport/v1",
      profile,
      status: handoffHardFailures.length ? "STRUCTURAL_PASS_VISUAL_REVISE" : "STRUCTURAL_PASS_VISUAL_PENDING",
      reviewOnly: true,
      renderedAt: new Date().toISOString(),
      sourceWorkspaceSha256: workspace.workspaceSha256,
      sourceSceneGraphSetSha256: previewSet.sha256,
      motionIrPreviewSetSha256: motionSet.sha256,
      composition: {id: composition.id, durationInFrames: composition.durationInFrames, fps: composition.fps, width: 960, height: 540},
      shots: scenes.map((scene) => ({shotId: scene.shotId, candidateId: scene.candidateId, editMode: scene.sceneGraph.editMode, materialIds: scene.materialBindings.map((binding) => binding.assetId)})),
      artifact: {
        publicUrl: `/generated/system-line/editorial-asset-workbench-v1/scene-graph-motion-preview-v1-${profile}/${profile}-960x540.mp4`,
        sha256: shaFile(videoPath),
        contactSheetPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/scene-graph-motion-preview-v1-${profile}/${profile}-contact-sheet.png`,
        contactSheetSha256: shaFile(sheetPath),
      },
      handoffProof: {
        count: handoffs.length,
        bindings: handoffs,
        samples: handoffSamples,
        visualAudit: {
          contract: "A1HandoffPixelAudit/v1",
          minimumMeaningfulDelta: minimumMeaningfulHandoffDelta,
          measurementCount: handoffPixelMeasurements.length,
          failedCount: failedHandoffPixelMeasurements.length,
          measurements: handoffPixelMeasurements,
        },
        publicUrl: handoffSheetPath ? `/generated/system-line/editorial-asset-workbench-v1/scene-graph-motion-preview-v1-${profile}/${profile}-handoff-contact-sheet.png` : null,
        sha256: handoffSheetPath ? shaFile(handoffSheetPath) : null,
      },
      visualReview: {score: null, maxScore: 24, hardFailures: handoffHardFailures, status: handoffHardFailures.length ? "REVISE" : "PENDING"},
      gates: {acceptedShotIrAdoptionAllowed: false, representativeMotionPromotionAllowed: false, fullFilmAllowed: false, h47ExpansionAllowed: false},
    };
    writeJson(path.join(outputDir, "render-report.json"), report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({silent: true});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
