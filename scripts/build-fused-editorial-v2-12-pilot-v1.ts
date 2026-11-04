#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {A1DesignBoardManifestV1Schema} from "../apps/studio-next/src/lib/a1-design-board-manifest-v1.ts";
import {selectRepresentativeShotIds} from "../apps/studio-next/src/lib/a1-motion-plan-v2.ts";
import {fusedEditorialV2VisualMaster} from "../apps/studio-next/src/lib/a1-visual-master-profile-v2.ts";
import {createFusedEditorialV2H47Compiler} from "./fused-editorial-v2-h47-compiler-v1.ts";

const root = process.cwd();
const phaseId = "fused-editorial-v2-12-pilot-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const currentPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const rendererEntryPoint = path.join(root, "remotion-renderer/src/system-line-h-frame-index.tsx");
const rendererPublicDir = path.join(root, "remotion-renderer/public");
const rendererRequire = createRequire(path.join(root, "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler") as typeof import("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer") as typeof import("@remotion/renderer");
const sharp = rendererRequire("sharp") as typeof import("sharp");

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const shaFile = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaJson = (value: unknown) => crypto.createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
const shaValue = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");

function guard() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-branch:${branch}`);
  const current = readJson(currentPhasePath);
  if (current?.contract !== "A1SystemLineCurrentPhase/v1" || current.phaseId !== "h-series-semantic-directed-v1") throw new Error(`unexpected-current-authority:${current?.phaseId || "missing"}`);
  for (const file of [currentPhasePath, currentPropsPath, rendererEntryPoint]) if (!fs.existsSync(file)) throw new Error(`required-file-missing:${file}`);
}

async function contactSheet(stills: Array<{shotId: string; order: number; path: string}>) {
  const columns = 4; const tileWidth = 480; const tileHeight = 270; const labelHeight = 34; const rows = Math.ceil(stills.length / columns);
  const composites: any[] = [];
  for (const [index, still] of stills.entries()) {
    const left = (index % columns) * tileWidth; const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    composites.push({input: await sharp(still.path).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    composites.push({input: Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315"/><text x="10" y="23" fill="#f2efe7" font-family="Arial" font-size="15">${String(still.order).padStart(2, "0")} · ${still.shotId}</text></svg>`), left, top: top + tileHeight});
  }
  const artifactPath = path.join(artifactDir, "12-pilot-contact-sheet.jpg"); const publicPath = path.join(publicDir, "12-pilot-contact-sheet.jpg");
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111315"}}).composite(composites).jpeg({quality: 90}).toFile(artifactPath);
  fs.copyFileSync(artifactPath, publicPath);
  return {path: rel(artifactPath), publicUrl: `/generated/system-line/${phaseId}/12-pilot-contact-sheet.jpg`, sha256: shaFile(artifactPath), width: columns * tileWidth, height: rows * (tileHeight + labelHeight)};
}

async function main() {
  guard();
  const props = readJson(currentPropsPath);
  if (!Array.isArray(props.scenes) || props.scenes.length !== 47) throw new Error("current-h47-must-have-47-scenes");
  const authorityShaBefore = shaFile(currentPhasePath); const sourceHash = shaFile(currentPropsPath); const visualMasterSha256 = shaJson(fusedEditorialV2VisualMaster); const compile = createFusedEditorialV2H47Compiler({rendererPublicDir});
  const allDesigns: any[] = []; let previous: string | null = null; let previousPrevious: string | null = null;
  for (const [index, scene] of props.scenes.entries()) { const design = compile(scene, index, previous, previousPrevious); allDesigns.push(design); previousPrevious = previous; previous = design.sceneFamily; }
  const selectedIds = selectRepresentativeShotIds(allDesigns.map((design) => ({shotId: design.shotId, sceneFamily: design.sceneFamily, complexity: design.narrative.importance})));
  const selectedDesigns = selectedIds.map((id) => allDesigns.find((design) => design.shotId === id)).filter(Boolean);
  if (selectedDesigns.length !== 12) throw new Error(`twelve-shot-pilot-selection-invalid:${selectedDesigns.length}`);
  fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
  const serveUrl = await bundle({entryPoint: rendererEntryPoint, publicDir: rendererPublicDir, rootDir: path.join(root, "remotion-renderer"), enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const stills: Array<{shotId: string; order: number; path: string; publicUrl: string; sha256: string; width: number; height: number}> = [];
  try {
    for (const design of selectedDesigns) {
      const composition = await selectComposition({serveUrl, id: "A1FusedEditorialV2FullBoard", inputProps: {design}, puppeteerInstance: browser, logLevel: "warn"});
      const fileName = `${String(design.order).padStart(2, "0")}-${design.shotId}.png`; const artifactPath = path.join(artifactDir, "stills", fileName); const publicPath = path.join(publicDir, "stills", fileName);
      fs.mkdirSync(path.dirname(artifactPath), {recursive: true}); fs.mkdirSync(path.dirname(publicPath), {recursive: true});
      await renderStill({serveUrl, composition, inputProps: {design}, frame: 0, output: artifactPath, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      fs.copyFileSync(artifactPath, publicPath); stills.push({shotId: design.shotId, order: design.order, path: artifactPath, publicUrl: `/generated/system-line/${phaseId}/stills/${fileName}`, sha256: shaFile(artifactPath), width: 960, height: 540});
    }
  } finally { await browser.close({silent: true}); }
  const sheet = await contactSheet(stills);
  const decisions = selectedDesigns.map((design) => ({shotId: design.shotId, status: "pending", note: null, reviewedDesignSha256: null, reviewedAt: null}));
  const pilotLedger = {contract: "A1FusedEditorialV2TwelveShotPilotReviewLedger/v1", phaseId, sourceHash, visualMasterSha256, compilerContract: "A1FusedEditorialV2H47Compiler/v1", decisions, summary: {shotCount: decisions.length, approvedCount: 0, pendingCount: decisions.length, reviseCount: 0}, status: "PENDING_USER_VISUAL_REVIEW", fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, updatedAt: new Date().toISOString()};
  const shots = selectedDesigns.map((design, index) => ({order: design.order, shotId: design.shotId, designSha256: shaValue(design), still: {publicUrl: stills[index].publicUrl, sha256: stills[index].sha256, width: stills[index].width, height: stills[index].height}, review: {status: "pending", reviewedDesignSha256: null}, neighborShotIds: [selectedDesigns[index - 1]?.shotId, selectedDesigns[index + 1]?.shotId].filter(Boolean)}));
  const board = A1DesignBoardManifestV1Schema.parse({contract: "A1DesignBoardManifest/v1", projectId: phaseId, visualMasterId: "fused-editorial-v2", visualMasterSha256, sourceHash, phase: "pilot-review", currentAuthorityMutated: false, reviewOnly: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, shots, summary: {shotCount: shots.length, approvedCount: 0, pendingCount: shots.length, reviseCount: 0}, nextAction: "review-12-shot-pilot-before-47-board"});
  const report = {contract: "A1FusedEditorialV2TwelveShotPilotReport/v1", phaseId, status: pilotLedger.status, reviewOnly: true, source: {propsPath: rel(currentPropsPath), sourceHash, totalShotCount: allDesigns.length, selectedShotIds: selectedIds}, visualMasterSha256, compiler: {contract: "A1FusedEditorialV2H47Compiler/v1", sourceOfTruth: "A1LayeredShotDesign/v2"}, shots, contactSheet: sheet, reviewLedger: {publicUrl: `/generated/system-line/${phaseId}/review-decisions.json`, summary: pilotLedger.summary}, gates: {referenceSuiteReviewRecommended: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false}, currentAuthority: {phaseId: "h-series-semantic-directed-v1", sha256Before: authorityShaBefore, sha256After: shaFile(currentPhasePath), unchanged: authorityShaBefore === shaFile(currentPhasePath)}, nextAction: "review-12-shot-pilot-before-47-board"};
  writeJson(path.join(artifactDir, "layered-shot-designs.json"), {contract: "A1FusedEditorialV2TwelveShotPilotDesignSet/v1", compilerContract: "A1FusedEditorialV2H47Compiler/v1", sourceHash, totalShotCount: allDesigns.length, selectedShotIds: selectedIds, designs: selectedDesigns.map((design) => ({...design, designSha256: shaValue(design)}))});
  for (const [name, value] of [["layered-shot-designs.json", readJson(path.join(artifactDir, "layered-shot-designs.json"))], ["review-decisions.json", pilotLedger], ["design-board-manifest.json", board], ["report.json", report]] as const) writeJson(path.join(publicDir, name), value);
  writeJson(path.join(artifactDir, "review-decisions.json"), pilotLedger); writeJson(path.join(artifactDir, "design-board-manifest.json"), board); writeJson(path.join(artifactDir, "report.json"), report);
  if (report.currentAuthority.unchanged !== true) throw new Error("current-authority-mutated-during-12-shot-pilot");
  console.log(JSON.stringify({status: report.status, selectedCount: selectedDesigns.length, selectedShotIds: selectedIds, contactSheet: sheet.publicUrl, nextAction: report.nextAction}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
