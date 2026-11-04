#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {A1DesignBoardManifestV1Schema} from "../apps/studio-next/src/lib/a1-design-board-manifest-v1.ts";
import {fusedEditorialV2VisualMaster} from "../apps/studio-next/src/lib/a1-visual-master-profile-v2.ts";
import {buildFourTreatmentImageCandidates} from "../lib/a1-four-treatment-image-factory.js";
import {createFusedEditorialV2H47Compiler} from "./fused-editorial-v2-h47-compiler-v1.ts";

const root = process.cwd();
const phaseId = "fused-editorial-v2-full-static-board-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const pilotPhase = "fused-editorial-v2-12-pilot-v1";
const pilotPublicDir = path.join(root, "apps/studio-next/public/generated/system-line", pilotPhase);
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const currentPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const rendererEntryPoint = path.join(root, "remotion-renderer/src/system-line-h-frame-index.tsx");
const rendererPublicDir = path.join(root, "remotion-renderer/public");
const rendererRequire = createRequire(path.join(root, "remotion-renderer/package.json"));
const sharp = rendererRequire("sharp") as typeof import("sharp");
const {bundle} = rendererRequire("@remotion/bundler") as typeof import("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer") as typeof import("@remotion/renderer");

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const shaFile = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const shaJson = (value: unknown) => crypto.createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
const compileFusedEditorialV2Shot = createFusedEditorialV2H47Compiler({rendererPublicDir});

function guard() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-branch:${branch}`);
  const current = readJson(currentPhasePath);
  if (current?.contract !== "A1SystemLineCurrentPhase/v1" || current.phaseId !== "h-series-semantic-directed-v1") throw new Error(`unexpected-current-authority:${current?.phaseId || "missing"}`);
  for (const file of [currentPhasePath, currentPropsPath, rendererEntryPoint]) if (!fs.existsSync(file)) throw new Error(`required-file-missing:${file}`);
}

async function renderDesigns(designs: any[]) {
  const artifactStillDir = path.join(artifactDir, "stills");
  const publicStillDir = path.join(publicDir, "stills");
  fs.mkdirSync(artifactStillDir, {recursive: true}); fs.mkdirSync(publicStillDir, {recursive: true});
  const serveUrl = await bundle({entryPoint: rendererEntryPoint, publicDir: rendererPublicDir, rootDir: path.join(root, "remotion-renderer"), enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const output = [];
  try {
    for (const design of designs) {
      const composition = await selectComposition({serveUrl, id: "A1FusedEditorialV2FullBoard", inputProps: {design}, puppeteerInstance: browser, logLevel: "warn"});
      const fileName = `${design.order.toString().padStart(2, "0")}-${design.shotId}.png`;
      const artifactPath = path.join(artifactStillDir, fileName);
      const publicPath = path.join(publicStillDir, fileName);
      await renderStill({serveUrl, composition, inputProps: {design}, frame: 0, output: artifactPath, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      fs.copyFileSync(artifactPath, publicPath);
      output.push({shotId: design.shotId, order: design.order, publicUrl: `/generated/system-line/${phaseId}/stills/${fileName}`, path: rel(artifactPath), sha256: shaFile(artifactPath), width: 960, height: 540});
    }
  } finally { await browser.close({silent: true}); }
  return output;
}

async function contactSheet(stills: any[]) {
  const columns = 5; const tileWidth = 384; const tileHeight = 216; const labelHeight = 34;
  const rows = Math.ceil(stills.length / columns); const width = columns * tileWidth; const height = rows * (tileHeight + labelHeight);
  const composites: any[] = [];
  for (const [index, still] of stills.entries()) {
    const left = (index % columns) * tileWidth; const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    composites.push({input: await sharp(path.join(root, still.path)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    composites.push({input: Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315"/><text x="10" y="23" fill="#f2efe7" font-family="Arial" font-size="16" font-weight="700">${still.order.toString().padStart(2, "0")} · ${still.shotId}</text></svg>`), left, top: top + tileHeight});
  }
  const artifactPath = path.join(artifactDir, "full-static-board-contact-sheet.jpg"); const publicPath = path.join(publicDir, "full-static-board-contact-sheet.jpg");
  await sharp({create: {width, height, channels: 3, background: "#111315"}}).composite(composites).jpeg({quality: 90}).toFile(artifactPath); fs.copyFileSync(artifactPath, publicPath);
  return {publicUrl: `/generated/system-line/${phaseId}/full-static-board-contact-sheet.jpg`, path: rel(artifactPath), sha256: shaFile(artifactPath), width, height};
}

async function buildMaterialTreatments(designs: any[]) {
  const unique = new Map<string, {assetUri: string; sha256: string}>();
  for (const design of designs) {
    const layer = design.layers.material;
    if (layer.assetUri && layer.localSha256) unique.set(layer.assetUri, {assetUri: layer.assetUri, sha256: layer.localSha256});
  }
  const records = [];
  for (const [assetUri, binding] of unique.entries()) {
    const sourcePath = path.join(rendererPublicDir, assetUri);
    const id = assetUri.replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(-80);
    const artifactOutputDir = path.join(artifactDir, "treatments", id);
    const publicOutputDir = path.join(publicDir, "treatments", id);
    const candidate = await buildFourTreatmentImageCandidates({sourcePath, outputDir: artifactOutputDir, id, width: 960, height: 540, textExclusionZones: [{left: .04, top: .08, right: .42, bottom: .88}]});
    fs.mkdirSync(publicOutputDir, {recursive: true});
    const outputs = candidate.outputs.map((output: {path: string | null; [key: string]: unknown}) => {
      if (!output.path) return {...output, publicUrl: null};
      const publicPath = path.join(publicOutputDir, path.basename(output.path)); fs.copyFileSync(output.path, publicPath);
      return {...output, path: rel(output.path), publicUrl: `/generated/system-line/${phaseId}/treatments/${id}/${path.basename(output.path)}`};
    });
    const normalized = {...candidate, source: {...candidate.source, path: rel(sourcePath), sha256: binding.sha256}, outputs};
    writeJson(path.join(artifactOutputDir, "report.json"), normalized); writeJson(path.join(publicOutputDir, "report.json"), normalized);
    records.push(normalized);
  }
  return records;
}

async function main() {
  guard();
  const pilotLedgerPath = path.join(pilotPublicDir, "review-decisions.json");
  const pilotLedger = fs.existsSync(pilotLedgerPath) ? readJson(pilotLedgerPath) : null;
  if (pilotLedger?.contract !== "A1FusedEditorialV2TwelveShotPilotReviewLedger/v1" || pilotLedger?.summary?.approvedCount !== 12 || pilotLedger?.fullBoardGenerationAllowed !== true) throw new Error("full-static-board-blocked-until-12-pilot-approval");
  const pilotLedgerSha256 = shaFile(pilotLedgerPath);
  const props = readJson(currentPropsPath); if (!Array.isArray(props.scenes) || props.scenes.length === 0) throw new Error("current-h47-scenes-missing");
  const authorityShaBefore = shaFile(currentPhasePath); const sourceHash = shaFile(currentPropsPath); const masterHash = shaJson(fusedEditorialV2VisualMaster);
  fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
  const designs: any[] = []; let previous: string | null = null; let previousPrevious: string | null = null;
  for (const [index, scene] of props.scenes.entries()) { const design = compileFusedEditorialV2Shot(scene, index, previous, previousPrevious); designs.push(design); previousPrevious = previous; previous = design.sceneFamily; }
  const sceneFamilyCounts = designs.reduce((counts, design) => ({...counts, [design.sceneFamily]: (counts[design.sceneFamily] || 0) + 1}), {} as Record<string, number>);
  const [stills, treatments] = await Promise.all([renderDesigns(designs), buildMaterialTreatments(designs)]); const sheet = await contactSheet(stills);
  writeJson(path.join(artifactDir, "layered-shot-designs.json"), {contract: "A1FusedEditorialV2FullBoardDesignSet/v1", compilerContract: "A1FusedEditorialV2H47Compiler/v1", visualMasterSha256: masterHash, sourceHash, pilotReviewLedgerSha256: pilotLedgerSha256, designs: designs.map((design) => ({...design, designSha256: shaValue(design)}))});
  writeJson(path.join(publicDir, "layered-shot-designs.json"), {contract: "A1FusedEditorialV2FullBoardDesignSet/v1", compilerContract: "A1FusedEditorialV2H47Compiler/v1", visualMasterSha256: masterHash, sourceHash, pilotReviewLedgerSha256: pilotLedgerSha256, designs: designs.map((design) => ({...design, designSha256: shaValue(design)}))});
  const shots = designs.map((design, index) => ({order: design.order, shotId: design.shotId, designSha256: shaValue(design), still: stills[index], review: {status: "pending", reviewedDesignSha256: null}, neighborShotIds: [designs[index - 1]?.shotId, designs[index + 1]?.shotId].filter(Boolean)}));
  const fullBoard = A1DesignBoardManifestV1Schema.parse({contract: "A1DesignBoardManifest/v1", projectId: "h47-fused-editorial-v2-full-static-board", visualMasterId: "fused-editorial-v2", visualMasterSha256: masterHash, sourceHash, phase: "full-board-review", currentAuthorityMutated: false, reviewOnly: true, fullBoardGenerationAllowed: true, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, shots, summary: {shotCount: shots.length, approvedCount: 0, pendingCount: shots.length, reviseCount: 0}, nextAction: "review-all-47-fused-static-board-shots-before-motion"});
  writeJson(path.join(artifactDir, "design-board-manifest.json"), fullBoard); writeJson(path.join(publicDir, "design-board-manifest.json"), fullBoard);
  const authorityShaAfter = shaFile(currentPhasePath); if (authorityShaAfter !== authorityShaBefore) throw new Error("current-authority-mutated-during-full-static-board");
  const report = {contract: "A1FusedEditorialV2FullStaticBoardReport/v1", phaseId, status: "READY_FOR_FULL_STATIC_BOARD_REVIEW", reviewOnly: true, currentAuthorityMutated: false, currentAuthority: {phaseId: "h-series-semantic-directed-v1", sha256Before: authorityShaBefore, sha256After: authorityShaAfter, unchanged: true}, source: {propsPath: rel(currentPropsPath), sourceHash, shotCount: designs.length}, visualMasterSha256: masterHash, compilerContract: "A1FusedEditorialV2H47Compiler/v1", pilotReview: {ledgerSha256: pilotLedgerSha256, approvedCount: pilotLedger.summary.approvedCount}, sceneFamilyCounts, allShotsStableStills: stills.length === designs.length, shots, treatments, treatmentSummary: {sourceCount: treatments.length, readyCount: treatments.flatMap((item: any) => item.outputs).filter((output: any) => output.status === "ready").length, honestFallbackCount: treatments.flatMap((item: any) => item.outputs).filter((output: any) => output.status === "fallback-to-crop").length, everySourceHasThreeReadyTreatments: treatments.every((item: any) => item.outputs.filter((output: any) => output.status === "ready").length >= 3)}, contactSheet: sheet, gates: {pilotReviewRequired: true, fullBoardVisualReviewRequired: true, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false}, nextAction: "review-all-47-fused-static-board-shots-before-motion"};
  writeJson(path.join(artifactDir, "report.json"), report); writeJson(path.join(publicDir, "report.json"), report);
  console.log(JSON.stringify({status: report.status, shotCount: designs.length, sceneFamilyCounts, contactSheet: sheet.publicUrl, nextAction: report.nextAction}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
