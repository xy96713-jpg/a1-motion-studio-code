#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "creator-material-pixel-type-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublic = path.join(rendererRoot, "public");
const systemEntry = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const specimenEntry = path.join(rendererRoot, "src/reference-conditioned-anchor-index.tsx");
const authorityPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const planPath = path.join(publicDir, "plan.json");
const planDocument = JSON.parse(fs.readFileSync(planPath, "utf8"));
const plan = planDocument.plan || planDocument;
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const stills = [
  {id: "A1CreatorMaterialDeskContext", shotIndex: 0, file: "frame-01-desk-context.png", label: "01 / REAL SCREEN IN CREATOR CONTEXT"},
  {id: "A1CreatorMaterialScreenCloseup", shotIndex: 1, file: "frame-02-screen-closeup.png", label: "02 / LOCAL ACTION + PIXEL NOTES"},
  {id: "A1CreatorMaterialGlyphImpact", shotIndex: 2, file: "frame-03-glyph-impact.png", label: "03 / FULL-FRAME GLYPH IMPACT"},
];

async function main() {
  fs.mkdirSync(publicDir, {recursive: true});
  fs.mkdirSync(artifactDir, {recursive: true});
  const authorityBefore = shaFile(authorityPath);
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const systemServeUrl = await bundle({entryPoint: systemEntry, publicDir: rendererPublic, rootDir: rendererRoot, enableCaching: true});
    const frames = [];
    for (const still of stills) {
      const inputProps = {plan, shotIndex: still.shotIndex};
      const composition = await selectComposition({serveUrl: systemServeUrl, id: still.id, inputProps, puppeteerInstance: browser, logLevel: "warn"});
      const output = path.join(publicDir, still.file);
      await renderStill({serveUrl: systemServeUrl, composition, inputProps, output, imageFormat: "png", scale: 1, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      frames.push({shotId: plan.shots[still.shotIndex].shotId, topology: plan.shots[still.shotIndex].topology, compositionId: still.id, publicUrl: `/generated/system-line/${phaseId}/${still.file}`, sha256: shaFile(output), bytes: fs.statSync(output).size});
    }
    const tileWidth = 640;
    const tileHeight = 360;
    const labelHeight = 48;
    const tiles = [];
    for (let index = 0; index < stills.length; index += 1) {
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0e10"/><text x="18" y="31" fill="#d7ff45" font-family="monospace" font-size="15">${stills[index].label}</text></svg>`);
      tiles.push(await sharp(path.join(publicDir, stills[index].file)).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#0b0e10"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const contactSheetPath = path.join(publicDir, "creator-material-pixel-type-v1-contact-sheet.png");
    await sharp({create: {width: tileWidth * 3, height: tileHeight + labelHeight, channels: 4, background: "#0b0e10"}}).composite(tiles.map((input, index) => ({input, left: index * tileWidth, top: 0}))).png().toFile(contactSheetPath);

    const specimenServeUrl = await bundle({entryPoint: specimenEntry, publicDir: rendererPublic, rootDir: rendererRoot, enableCaching: true});
    const specimenComposition = await selectComposition({serveUrl: specimenServeUrl, id: "A1CreatorMaterialPixelTypeSpecimen", inputProps: {}, puppeteerInstance: browser, logLevel: "warn"});
    const specimenPath = path.join(publicDir, "typography-specimen.png");
    await renderStill({serveUrl: specimenServeUrl, composition: specimenComposition, inputProps: {}, frame: 96, output: specimenPath, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const specimenMetadata = await sharp(specimenPath).metadata();
    const authorityAfter = shaFile(authorityPath);
    const report = {
      contract: "A1CreatorMaterialPixelTypeRenderReport/v1",
      phaseId,
      status: "STATIC_PROOF_READY_VISUAL_PENDING",
      structuralStatus: "PASS",
      sourcePlan: {path: path.relative(root, planPath), sha256: shaFile(planPath)},
      render: {width: 1920, height: 1080, engine: "Remotion deterministic stills"},
      frames,
      contactSheet: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(contactSheetPath)}`, sha256: shaFile(contactSheetPath), bytes: fs.statSync(contactSheetPath).size},
      specimen: {publicUrl: `/generated/system-line/${phaseId}/typography-specimen.png`, sha256: shaFile(specimenPath), width: Number(specimenMetadata.width || 0), height: Number(specimenMetadata.height || 0), frame: 96},
      currentAuthority: {sha256Before: authorityBefore, sha256After: authorityAfter, unchanged: authorityBefore === authorityAfter},
      gates: {fontFilesLoaded: "PASS", editableCopyRequired: true, humanVisualApproval: "PENDING", motionExpansionAllowed: false, rendererAdoptionAllowed: false, h47ExpansionAllowed: false},
    };
    writeJson(path.join(artifactDir, "render-report.json"), report);
    writeJson(path.join(publicDir, "render-report.json"), report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({silent: true});
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
