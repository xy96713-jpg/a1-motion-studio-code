#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {A1_REVIEW_PREVIEW_POLICY} from "../apps/studio-next/src/lib/a1-editorial-visual-generation-policy-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(appRoot, "public");
const outputRelative = "generated/system-line/editorial-asset-workbench-v1/ed01-typography-calibration-v1";
const outputDir = path.join(publicRoot, outputRelative);
const sourceRelative = "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg";
const sourcePath = path.join(publicRoot, sourceRelative);
const artDirectionManifestPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/ed01-art-direction-reference-v1.json");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = require("@remotion/renderer");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

function createMinimalRenderPublicDir() {
  const dir = fs.mkdtempSync(path.join(outputDir, ".render-public-"));
  const requiredFiles = [
    sourceRelative,
    "creator-material-pixel-type-v1/fonts/fusion-pixel.ttf",
    "creator-material-pixel-type-v1/fonts/DepartureMono-Regular.otf",
    "creator-material-pixel-type-v1/fonts/ChillPixels-Mono.otf",
  ];
  for (const relative of requiredFiles) {
    const source = path.join(publicRoot, relative);
    const destination = path.join(dir, relative);
    if (!fs.existsSync(source)) throw new Error(`ed01-render-public-file-missing:${relative}`);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(source, destination);
  }
  return dir;
}

function removeRemotionBundle(serveUrl) {
  const resolved = path.resolve(String(serveUrl || ""));
  if (!path.basename(resolved).startsWith("remotion-webpack-bundle-")) throw new Error(`refuse-to-remove-unrecognized-remotion-bundle:${resolved}`);
  fs.rmSync(resolved, {recursive: true, force: true});
}

const variants = [
  {id: "mic-depth-imprint", direction: "中英左右对位"},
  {id: "monitor-overflow", direction: "右侧双语海报"},
  {id: "desk-type-object", direction: "底部双语基座"},
];

async function main() {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const artDirection = JSON.parse(fs.readFileSync(artDirectionManifestPath, "utf8"));
  if (artDirection.contract !== "A1ShotArtDirectionReferenceSet/v1" || artDirection.shotId !== "ED-01") throw new Error("ed01-art-direction-reference-set-invalid");
  if (artDirection.sourceFrameSha256 !== shaFile(sourcePath)) throw new Error("ed01-source-frame-hash-mismatch");
  fs.mkdirSync(outputDir, {recursive: true});

  const renderPublicDir = createMinimalRenderPublicDir();
  let serveUrl = null;
  let browser = null;
  const candidates = [];
  try {
    serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/ed01-typography-calibration-index.tsx"), publicDir: renderPublicDir, rootDir: rendererRoot, enableCaching: true});
    browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
    for (const variant of variants) {
      const inputProps = {variant: variant.id};
      const composition = await selectComposition({serveUrl, id: "A1Ed01TypographyCalibrationV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
      const output = path.join(outputDir, `${variant.id}.png`);
      await renderStill({serveUrl, composition, inputProps, frame: 0, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const reference = artDirection.outputs.find((item) => item.candidateId.endsWith(variant.id));
      if (!reference) throw new Error(`ed01-art-direction-reference-missing:${variant.id}`);
      candidates.push({
        candidateId: `ED-01-CAL-${variant.id}`,
        direction: variant.direction,
        publicUrl: `/${outputRelative}/${path.basename(output)}`,
        sha256: shaFile(output),
        width: 960,
        height: 540,
        sourceArtDirectionPublicUrl: reference.publicUrl,
        sourceArtDirectionSha256: reference.sha256,
        referenceOnly: true,
      });
    }
  } finally {
    if (browser) await browser.close({silent: true});
    if (serveUrl) removeRemotionBundle(serveUrl);
    fs.rmSync(renderPublicDir, {recursive: true, force: true});
  }

  const tileWidth = 640;
  const tileHeight = 360;
  const labelHeight = 42;
  const composites = [];
  for (const [index, candidate] of candidates.entries()) {
    const image = await sharp(path.join(publicRoot, candidate.publicUrl.slice(1))).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#0d0f10"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0d0f10"/><text x="14" y="27" fill="#d8ff35" font-family="monospace" font-size="14">0${index + 1} · ${candidate.direction}</text></svg>`);
    composites.push({input: await sharp(image).composite([{input: label, top: 0, left: 0}]).png().toBuffer(), left: index * tileWidth, top: 0});
  }
  const contactSheetPath = path.join(outputDir, "ed01-typography-calibration-contact-sheet.png");
  await sharp({create: {width: tileWidth * candidates.length, height: tileHeight + labelHeight, channels: 4, background: "#0d0f10"}}).composite(composites).png().toFile(contactSheetPath);

  const renderedAt = new Date().toISOString();
  const value = {
    contract: "A1ShotStyleCalibrationSet/v1",
    shotId: "ED-01",
    status: "ready-for-user-review",
    sourceFrame: {publicUrl: `/${sourceRelative}`, sha256: shaFile(sourcePath)},
    exactSpokenLine: "Hi，我用 vibe coding 做了一款智能写作工作台。",
    exactEditablePhrases: ["Hi, 我用", "vibe coding", "智能写作", "工作台"],
    bilingualPairs: [{english: "VIBE CODING", chinese: "智能写作"}, {english: "WORKBENCH", chinese: "工作台"}],
    previewPolicy: A1_REVIEW_PREVIEW_POLICY,
    typography: {cjk: "A1 Fusion Pixel", latin: ["A1 Chill Pixels Mono", "A1 Departure Mono"], editableText: true, generatedTextUsedInFinal: false},
    candidates,
    contactSheet: {publicUrl: `/${outputRelative}/${path.basename(contactSheetPath)}`, sha256: shaFile(contactSheetPath)},
    selectedCandidateId: null,
    userApproval: "pending",
    reviewOnly: true,
    candidateAdoptionAllowed: false,
    finalRenderAllowed: false,
    renderedAt,
  };
  const manifestPath = path.join(outputDir, "manifest.json");
  writeJson(manifestPath, value);
  const calibration = {...value, manifest: {publicUrl: `/${outputRelative}/${path.basename(manifestPath)}`, sha256: shaFile(manifestPath)}};

  withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (shaFile(sourcePath) !== calibration.sourceFrame.sha256) throw new Error("ed01-calibration-source-stale-before-persist");
    const next = structuredClone(current);
    next.production.shotStyleCalibrations ||= {};
    next.production.shotStyleCalibrations["ED-01"] = calibration;
    next.production.maturityLoop.status = "visual-review-required";
    next.production.maturityLoop.currentStage = "ed01-typography-calibration";
    next.production.maturityLoop.nextAction = "review-ed01-typography-calibration";
    next.production.maturityLoop.userDirectiveAt = renderedAt;
    next.production.maturityLoop.lastTickAt = renderedAt;
    next.production.maturityLoop.updatedAt = renderedAt;
    next.production.nextAction = "review-ed01-typography-calibration";
    const event = createProductionEvent({workspace: current, action: "ed01-typography-calibration-rendered", targetId: "ED-01", payload: {manifestSha256: calibration.manifest.sha256, candidateCount: candidates.length, reviewOnly: true}, now: renderedAt});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, renderedAt), {event});
  });

  console.log(JSON.stringify({status: calibration.status, shotId: calibration.shotId, candidates: calibration.candidates, contactSheet: calibration.contactSheet, manifest: calibration.manifest, nextAction: "review-ed01-typography-calibration"}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
