#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {A1MotionPlanV2Schema, fusedEditorialMotionCurvesV2, selectRepresentativeShotIds} from "../apps/studio-next/src/lib/a1-motion-plan-v2.ts";

const root = process.cwd();
const staticPhase = "fused-editorial-v2-full-static-board-v1";
const phaseId = "fused-editorial-v2-representative-motion-v1";
const staticPublic = path.join(root, "apps/studio-next/public/generated/system-line", staticPhase);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const entryPoint = path.join(root, "remotion-renderer/src/system-line-h-frame-index.tsx");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererRequire = createRequire(path.join(root, "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler") as typeof import("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = rendererRequire("@remotion/renderer") as typeof import("@remotion/renderer");
const sharp = rendererRequire("sharp") as typeof import("sharp");
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const shaFile = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");

function actionForFamily(family: string) {
  if (family === "full-bleed-hero") return {action: "title-mask-lock", primaryActor: "typography", curveId: "soft-editorial"};
  if (family === "paper-evidence") return {action: "source-crop-push", primaryActor: "material", curveId: "soft-editorial"};
  if (family === "cutout-collage") return {action: "cutout-stagger", primaryActor: "foreground", curveId: "physical-stagger"};
  if (family === "metric-verdict") return {action: "metric-lock", primaryActor: "typography", curveId: "fast-lock"};
  if (family === "relationship-map") return {action: "relationship-draw", primaryActor: "semanticElements", curveId: "fast-lock"};
  if (family === "vertical-shutters") return {action: "shutter-expand", primaryActor: "semanticElements", curveId: "symmetric-expand"};
  if (family === "dark-verdict") return {action: "verdict-cut-echo", primaryActor: "typography", curveId: "hard-cut-echo"};
  return {action: "quiet-hold", primaryActor: "camera", curveId: "soft-editorial"};
}

async function makeContactSheet(files: Array<{shotId: string; frame: string; path: string}>) {
  const tileWidth = 480; const tileHeight = 270; const columns = 4; const labelHeight = 34; const rows = Math.ceil(files.length / columns);
  const composites: any[] = [];
  for (const [index, file] of files.entries()) {
    const left = index % columns * tileWidth; const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    composites.push({input: await sharp(file.path).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    composites.push({input: Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315"/><text x="10" y="23" fill="#f2efe7" font-family="Arial" font-size="15">${file.shotId} · ${file.frame}</text></svg>`), left, top: top + tileHeight});
  }
  const artifactPath = path.join(artifactDir, "representative-motion-contact-sheet.jpg"); const publicPath = path.join(publicDir, "representative-motion-contact-sheet.jpg");
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111315"}}).composite(composites).jpeg({quality: 90}).toFile(artifactPath);
  fs.copyFileSync(artifactPath, publicPath);
  return {path: rel(artifactPath), publicUrl: `/generated/system-line/${phaseId}/representative-motion-contact-sheet.jpg`, sha256: shaFile(artifactPath)};
}

async function main() {
  const report = read(path.join(staticPublic, "report.json")); const ledger = read(path.join(staticPublic, "full-static-board-review-decisions.json")); const designsPayload = read(path.join(staticPublic, "layered-shot-designs.json"));
  if (report.contract !== "A1FusedEditorialV2FullStaticBoardReport/v1" || ledger.status !== "FULL_STATIC_BOARD_APPROVED_BY_DELEGATE" || ledger.summary?.approvedCount !== 47) throw new Error("representative-motion-blocked-until-full-static-board-approval");
  const designs = designsPayload.designs;
  const input = designs.map((design: any) => ({shotId: design.shotId, sceneFamily: design.sceneFamily, complexity: design.narrative.importance}));
  const selectedIds = selectRepresentativeShotIds(input);
  const selectedDesigns = selectedIds.map((id: string) => designs.find((design: any) => design.shotId === id)).filter(Boolean);
  const shots = selectedDesigns.map((design: any) => { const route = actionForFamily(design.sceneFamily); return {shotId: design.shotId, sceneFamily: design.sceneFamily, primaryActor: route.primaryActor, action: route.action, curveId: route.curveId, enterFrames: 14, holdFrames: 54, transitionOut: design.narrative.carryOut}; });
  const boardSha = shaFile(path.join(staticPublic, "design-board-manifest.json"));
  const motionPlan = A1MotionPlanV2Schema.parse({contract: "A1MotionPlan/v2", projectId: "h47-fused-editorial-v2", designBoardSha256: boardSha, designBoardApproved: true, representativeOnly: true, fullMp4RenderAllowed: false, finalRenderAllowed: false, curves: fusedEditorialMotionCurvesV2, shots});
  fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
  write(path.join(artifactDir, "motion-plan.json"), motionPlan); write(path.join(publicDir, "motion-plan.json"), motionPlan);
  const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const inputProps = {designs: selectedDesigns, shotDurationInFrames: 90};
  const frameFiles: Array<{shotId: string; frame: string; path: string}> = [];
  const videoArtifact = path.join(artifactDir, "representative-motion-proof.mp4"); const videoPublic = path.join(publicDir, "representative-motion-proof.mp4");
  try {
    const composition = await selectComposition({serveUrl, id: "A1FusedEditorialV2MotionProof", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    for (const [index, design] of selectedDesigns.entries()) {
      for (const moment of [{name: "enter", frame: index * 90 + 14}, {name: "hold", frame: index * 90 + 54}, {name: "exit", frame: index * 90 + 78}]) {
        const file = path.join(artifactDir, "stills", `${String(index + 1).padStart(2, "0")}-${design.shotId}-${moment.name}.png`); fs.mkdirSync(path.dirname(file), {recursive: true});
        await renderStill({serveUrl, composition, inputProps, frame: moment.frame, output: file, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
        const publicFile = path.join(publicDir, "stills", path.basename(file)); fs.mkdirSync(path.dirname(publicFile), {recursive: true}); fs.copyFileSync(file, publicFile); frameFiles.push({shotId: design.shotId, frame: moment.name, path: file});
      }
    }
    await renderMedia({serveUrl, composition, inputProps, frameRange: [0, selectedDesigns.length * 90 - 1], outputLocation: videoArtifact, scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 88, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  } finally { await browser.close({silent: true}); }
  fs.copyFileSync(videoArtifact, videoPublic);
  const sheet = await makeContactSheet(frameFiles.filter((file) => file.frame === "hold"));
  const motionReport = {contract: "A1FusedEditorialV2RepresentativeMotionReport/v1", phaseId, status: "READY_FOR_REPRESENTATIVE_MOTION_REVIEW", reviewOnly: true, designBoardSha256: boardSha, motionPlanSha256: shaFile(path.join(artifactDir, "motion-plan.json")), selectedShotIds: selectedIds, selectedCount: selectedIds.length, motionPlan, video: {path: rel(videoArtifact), publicUrl: `/generated/system-line/${phaseId}/representative-motion-proof.mp4`, sha256: shaFile(videoArtifact), width: 960, height: 540, fps: 30}, holdContactSheet: sheet, gates: {representativeMotionReviewRequired: true, fullMp4RenderAllowed: false, finalRenderAllowed: false}, nextAction: "review-representative-motion-before-full-540p"};
  write(path.join(artifactDir, "report.json"), motionReport); write(path.join(publicDir, "report.json"), motionReport);
  console.log(JSON.stringify({status: motionReport.status, selectedCount: selectedIds.length, selectedShotIds: selectedIds, video: motionReport.video.publicUrl, contactSheet: sheet.publicUrl, nextAction: motionReport.nextAction}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
