#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(appRoot, "public");
const outputRelative = "generated/system-line/editorial-asset-workbench-v1/ed01-ed02-causal-motion-proof-v1";
const outputDir = path.join(publicRoot, outputRelative);
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const ease = [.16, 1, .3, 1];
const track = (property, from, to, startFrame, endFrame, easing = ease) => ({property, from, to, startFrame, endFrame, easing});

function materialBinding(workspace, assetId) {
  const asset = workspace.library.assets.find((item) => item.id === assetId);
  if (!asset || asset.review?.status !== "approved") throw new Error(`motion-proof-material-not-approved:${assetId}`);
  return {
    assetId,
    assetUri: asset.assetUri,
    publicUrl: asset.assetUri,
    sha256: asset.sha256,
    contentSha256: asset.contentSha256,
    provenance: asset.provenance,
    videoEvidence: asset.videoEvidence || null,
  };
}

function sourceShot(workspace, shotId, candidateId) {
  const shot = workspace.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === shotId);
  const candidate = shot?.candidates?.find((item) => item.candidateId === candidateId);
  if (!shot || !candidate) throw new Error(`motion-proof-candidate-missing:${shotId}:${candidateId}`);
  if (candidate.screening?.hardFailures?.length) throw new Error(`motion-proof-candidate-hard-failure:${shotId}:${candidate.screening.hardFailures.join(",")}`);
  const value = {
    contract: "A1SceneGraphMotionPreview/v1",
    reviewOnly: true,
    sourceWorkspaceSha256: workspace.workspaceSha256,
    shotId,
    order: shot.shotDemand.order,
    chapterId: shot.shotDemand.chapterId,
    source: {cueIds: shot.shotDemand.cueIds, text: shot.shotDemand.sourceText, editWindow: shot.shotDemand.editWindow},
    candidateId,
    materialBindings: candidate.sceneGraph.approvedMaterialIds.map((assetId) => materialBinding(workspace, assetId)),
    sceneGraph: structuredClone(candidate.sceneGraph),
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
    },
    motionPhrase: candidate.sceneGraph.motionPhrase,
    handoff: candidate.sceneGraph.handoff,
    approval: {
      status: "provisional-motion-preview",
      reviewedAt: null,
      note: "review-only causal motion proof; no candidate adoption or user approval inferred",
    },
  };
  return {...value, sha256: sha256(value)};
}

function motionActor(node, propertyTracks = []) {
  return {id: node.id, role: node.role, propertyTracks};
}

function ed01Motion(scene) {
  const tracksByActor = new Map([
    ["primary", [track("cropScale", 1, 1.012, 0, 92, [.42, 0, .58, 1])]],
    ["presenter-word-1", [track("maskReveal", 0, 1, 8, 15), track("translateX", 14, 0, 8, 15), track("tracking", .16, .015, 8, 18)]],
    ["presenter-word-2", [track("maskReveal", 0, 1, 16, 24), track("translateX", 18, 0, 16, 24), track("tracking", .14, .015, 16, 27)]],
    ["presenter-word-3", [track("maskReveal", 0, 1, 34, 51), track("translateX", -96, 0, 34, 51), track("rotation", -2.5, 0, 34, 56)]],
    ["presenter-word-4", [track("maskReveal", 0, 1, 57, 76), track("translateY", 48, 0, 57, 76), track("scaleX", .88, 1, 57, 80)]],
  ]);
  const actors = scene.sceneGraph.nodes.map((node) => motionActor(node, tracksByActor.get(node.id) || []));
  const wordActors = scene.sceneGraph.nodes
    .filter((node) => /^presenter-word-/u.test(node.id))
    .map((node) => ({id: node.id, text: node.text, startFrame: tracksByActor.get(node.id)?.[0]?.startFrame || 0, endFrame: tracksByActor.get(node.id)?.[0]?.endFrame || 0, propertyTracks: tracksByActor.get(node.id) || []}));
  return {
    contract: "A1MotionIRScene/v2",
    sceneId: scene.shotId,
    sourceAuthority: "A1SceneGraphMotionPreview/v1",
    timing: {frameDuration: 101, fps: 30},
    motionProfile: {name: "object-bound-presenter-causal-lock", genericIndexStaggerUsed: false},
    actors,
    wordActors,
    motionPhrase: {
      setup: "vibe 与 coding 在真实显示器平面逐词扫描锁定",
      action: "智能写作沿麦克风方向压入并被真实器材遮挡",
      confirm: "工作台沿右侧桌缘落座并把像素落点交给真实界面",
    },
  };
}

function ed02Motion(scene) {
  const tracksByActor = new Map([
    ["primary", [
      track("selectionProgress", 0, 1, 2, 16),
      track("rewriteProgress", 0, 1, 19, 38),
      track("confirmationPulse", 0, 1, 42, 58),
      track("cropScale", 1, 1.025, 0, 60, [.42, 0, .58, 1]),
    ]],
  ]);
  return {
    contract: "A1MotionIRScene/v2",
    sceneId: scene.shotId,
    sourceAuthority: "A1SceneGraphMotionPreview/v1",
    timing: {frameDuration: 65, fps: 30},
    motionProfile: {name: "source-selection-rewrite-confirmation", genericIndexStaggerUsed: false},
    actors: scene.sceneGraph.nodes.map((node) => motionActor(node, tracksByActor.get(node.id) || [])),
    wordActors: [],
    motionPhrase: {
      setup: "同一真实正文中的完整句子被选中",
      action: "真实候选在同一操作链中出现",
      confirm: "被采用结果回到正文原位置",
    },
  };
}

async function main() {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const scenes = [
    sourceShot(workspace, "ED-01", "ED-01-D03-V1"),
    sourceShot(workspace, "ED-02", "ED-02-D01-V2"),
  ];
  const previewValue = {
    contract: "A1SceneGraphMotionPreviewSet/v1",
    projectId: workspace.production.project.projectId,
    reviewOnly: true,
    proofId: "ed01-ed02-causal-motion-proof-v1",
    sourceWorkspaceSha256: workspace.workspaceSha256,
    shotCount: scenes.length,
    scenes,
  };
  const previewSet = {...previewValue, sha256: sha256(previewValue)};
  const motionScenes = [ed01Motion(scenes[0]), ed02Motion(scenes[1])];
  const motionValue = {
    contract: "A1MotionIRPreviewSet/v1",
    projectId: workspace.production.project.projectId,
    reviewOnly: true,
    sourceSceneGraphSetSha256: previewSet.sha256,
    fps: 30,
    sceneCount: motionScenes.length,
    scenes: motionScenes,
  };
  const motionSet = {...motionValue, sha256: sha256(motionValue)};
  const destinationRegion = scenes[1].sceneGraph.nodes.find((node) => node.id === "primary")?.evidenceFocusRegion;
  if (!destinationRegion) throw new Error("ed02-selected-sentence-region-missing");
  const handoff = {
    from: "ED-01",
    to: "ED-02",
    fromActorId: "presenter-word-4",
    toActorId: "primary",
    handoffType: "word-to-source-confirmation",
    semanticActor: "工作台-to-real-selected-sentence",
    destinationRegion,
  };
  const plan = {
    contract: "A1SceneGraphMotionPreviewPlan/v1",
    reviewOnly: true,
    proofId: "ed01-ed02-causal-motion-proof-v1",
    shotIds: scenes.map((scene) => scene.shotId),
    durationMs: scenes.reduce((sum, scene) => sum + scene.source.editWindow.durationMs, 0),
    sourceSceneGraphSetSha256: previewSet.sha256,
    handoffs: [handoff],
    hardCuts: [],
  };
  const inputProps = {previewSet, motionSet, plan};
  fs.mkdirSync(outputDir, {recursive: true});
  writeJson(path.join(outputDir, "input-props.json"), inputProps);

  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const videoPath = path.join(outputDir, "ed01-ed02-causal-motion-proof-960x540.mp4");
  const contactSheetPath = path.join(outputDir, "ed01-ed02-causal-motion-proof-contact-sheet.png");
  try {
    const composition = await selectComposition({serveUrl, id: "A1SceneGraphMotionPreviewV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    await renderMedia({serveUrl, composition, inputProps, outputLocation: videoPath, scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 90, crf: 20, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const sampleFrames = [0, 10, 18, 38, 50, 62, 76, 91, 99, 108, 122, 142, 158, composition.durationInFrames - 1];
    const tileWidth = 480;
    const tileHeight = 270;
    const labelHeight = 30;
    const tiles = [];
    for (const frame of sampleFrames) {
      const stillPath = path.join(outputDir, "review-frames", `f${String(frame).padStart(4, "0")}.png`);
      fs.mkdirSync(path.dirname(stillPath), {recursive: true});
      await renderStill({serveUrl, composition, inputProps, frame, output: stillPath, imageFormat: "png", scale: .25, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0d0f10"/><text x="10" y="20" fill="#d7ff45" font-family="monospace" font-size="11">F${frame} · ${(frame / 30).toFixed(2)}s</text></svg>`);
      tiles.push(await sharp(stillPath).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#0d0f10"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const columns = 4;
    const rows = Math.ceil(tiles.length / columns);
    await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#0d0f10"}})
      .composite(tiles.map((input, index) => ({input, left: index % columns * tileWidth, top: Math.floor(index / columns) * (tileHeight + labelHeight)})))
      .png()
      .toFile(contactSheetPath);

    const report = {
      contract: "A1Ed01Ed02CausalMotionProof/v1",
      status: "STRUCTURAL_PASS_VISUAL_PENDING",
      reviewOnly: true,
      renderedAt: new Date().toISOString(),
      sourceWorkspaceSha256: workspace.workspaceSha256,
      sourceSceneGraphSetSha256: previewSet.sha256,
      motionIrPreviewSetSha256: motionSet.sha256,
      composition: {id: composition.id, fps: composition.fps, durationInFrames: composition.durationInFrames, width: 960, height: 540},
      shots: scenes.map((scene) => ({shotId: scene.shotId, candidateId: scene.candidateId, materialIds: scene.materialBindings.map((binding) => binding.assetId)})),
      causalMotionPhrases: motionScenes.map((scene) => ({shotId: scene.sceneId, profile: scene.motionProfile.name, phrase: scene.motionPhrase})),
      handoff,
      artifact: {
        contract: "A1CausalMotionProofArtifact/v1",
        publicUrl: `/${outputRelative}/${path.basename(videoPath)}`,
        sha256: shaFile(videoPath),
        contactSheetPublicUrl: `/${outputRelative}/${path.basename(contactSheetPath)}`,
        contactSheetSha256: shaFile(contactSheetPath),
        durationMs: plan.durationMs,
        width: 960,
        height: 540,
        planSha256: sha256(plan),
        renderedAt: new Date().toISOString(),
        renderer: "remotion",
        reviewOnly: true,
      },
      visualReview: {status: "PENDING", score: null, maxScore: 24, hardFailures: []},
      gates: {acceptedShotIrAdoptionAllowed: false, representativeMotionPromotionAllowed: false, fullFilmAllowed: false, h47ExpansionAllowed: false},
    };
    const reportPath = path.join(outputDir, "render-report.json");
    writeJson(reportPath, report);

    withProjectLock(appRoot, () => {
      const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
      const now = new Date().toISOString();
      const next = structuredClone(current);
      next.production.motion.status = "review-only-causal-proof-ready";
      next.production.motion.previewArtifact = {...report.artifact, reportPublicUrl: `/${outputRelative}/render-report.json`, reportSha256: shaFile(reportPath), reviewOnly: true};
      next.production.motion.review = {status: "pending", score: null, maxScore: 24, hardFailures: [], reviewedAt: null};
      next.production.motion.fullMotionAllowed = false;
      next.production.maturityLoop.shotReports = Object.fromEntries(
        Object.entries(next.production.maturityLoop.shotReports || {}).filter(([shotId]) => !["ED-01", "ED-02"].includes(shotId)),
      );
      next.production.maturityLoop.rounds = (next.production.maturityLoop.rounds || []).filter((round) => {
        const isShotReview = String(round.targetType || "").startsWith("shot-frame");
        return !(isShotReview && ["ED-01", "ED-02"].includes(round.targetId));
      });
      next.production.maturityLoop.provisionalVisualAdmissions = (next.production.maturityLoop.provisionalVisualAdmissions || [])
        .filter((shotId) => !["ED-01", "ED-02"].includes(shotId));
      next.production.maturityLoop.representativeMotionReport = null;
      next.production.maturityLoop.mediumRhythmRevision = null;
      next.production.maturityLoop.allShotSelectedReview = null;
      next.production.maturityLoop.status = "visual-review-required";
      next.production.maturityLoop.currentStage = "ed01-ed02-causal-motion-proof";
      next.production.maturityLoop.nextAction = "review-ed01-ed02-causal-motion-proof";
      next.production.maturityLoop.lastTickAt = now;
      next.production.maturityLoop.updatedAt = now;
      const event = createProductionEvent({workspace: current, action: "ed01-ed02-causal-motion-proof-rendered", targetId: "ED-01:ED-02", payload: {reportPublicUrl: `/${outputRelative}/render-report.json`, videoSha256: report.artifact.sha256, reviewOnly: true}, now});
      next.production.eventLedger.eventCount += 1;
      next.production.eventLedger.lastEventId = event.eventId;
      next.production.eventLedger.lastEventAt = event.createdAt;
      persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, now), {event});
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({silent: true});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
