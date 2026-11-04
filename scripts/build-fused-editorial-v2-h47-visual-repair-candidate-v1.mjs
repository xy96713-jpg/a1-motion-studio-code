#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";

const root = process.cwd();
const sourcePhase = "fused-editorial-v2-full-static-board-v1";
const candidatePhase = "fused-editorial-v2-h47-visual-repair-candidate-v1";
const sourceDir = path.join(root, "apps/studio-next/public/generated/system-line", sourcePhase);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", candidatePhase);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", candidatePhase);
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublic = path.join(rendererRoot, "public");
const rendererEntry = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const authorityPath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const sourcePropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const requireFromRenderer = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = requireFromRenderer("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = requireFromRenderer("@remotion/renderer");
const sharp = requireFromRenderer("sharp");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const publicAsset = (uri) => path.join(rendererPublic, uri);

const replacements = {
  "H01-B04": "editorial-documentary-reset-v1/source/workbench-overview.png",
  "H01-B03": "editorial-documentary-reset-v1/source/workbench-overview.png",
  "H04-B03": "visual-grammar-v4/illustrations/02-human-intervention.png",
  "H04-B04": "editorial-documentary-reset-v1/source/document-surface.png",
  "H05-B01": "editorial-documentary-reset-v1/source/presentation-mode.png",
  "H05-B04": "assets/generated-artwork/06-H05-B04-a.png",
  "H07-B02": "editorial-documentary-reset-v1/source/workbench-overview.png",
  "H08-B04": "editorial-documentary-reset-v1/source/document-surface.png",
  "H09-B02": "editorial-documentary-reset-v1/source/paragraph-assist.png",
  "H09-B03": "editorial-documentary-reset-v1/source/workbench-overview.png",
  "H09-B05": "visual-grammar-v4/illustrations/05-human-intervention-alt-a.png",
  "H03-B02": "generated/system-line/targeted-visual-upgrade-v1/assets/H03-B02-picture-b62cce809c36.png",
  "H03-B03": "generated/system-line/targeted-visual-upgrade-v1/assets/H03-B03-picture-e3bb4b14a6ef.png",
  "H05-B03": "generated/system-line/targeted-visual-upgrade-v1/assets/H05-B03-picture-575800835834.png",
  "H10-B04": "generated/system-line/targeted-visual-upgrade-v1/assets/H10-B04-picture-cf639e0bea5b.png",
  "H11-B02": "assets/generated-artwork/08-H11-B02-a.png",
  "H11-B03": "assets/generated-artwork/09-H11-B03-a.png",
};

const foregrounds = {
  "H03-B03": "layered-anchor-v2/final/h03-paper-spiral.png",
  "H05-B04": "visual-grammar-v4/illustrations/06-human-intervention-alt-b.png",
  "H10-B04": "layered-anchor-v2/final/h03-paper-spiral.png",
  "H11-B03": "layered-anchor-v2/final/h11-direction-cluster.png",
};

function guard() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-branch:${branch}`);
  const authority = read(authorityPath);
  if (authority.phaseId !== "h-series-semantic-directed-v1" || authority.reviewDecision?.finalRenderAllowed !== false) throw new Error("current-authority-not-review-only");
  if (!fs.existsSync(sourceDir) || !fs.existsSync(sourcePropsPath)) throw new Error("source-board-or-props-missing");
}

function bindAsset(design, uri, channel, source) {
  const file = publicAsset(uri);
  if (!fs.existsSync(file)) throw new Error(`candidate-asset-missing:${uri}`);
  const layer = design.layers[channel];
  layer.assetUri = uri;
  layer.localSha256 = shaFile(file);
  layer.source = source;
  layer.reviewStatus = "pending";
  layer.emptyReason = null;
  layer.mode = channel === "foreground" ? "depth-plane" : "editorial-image";
  if (channel === "material") layer.evidenceAllowed = false;
  if (source === "generated") {
    const prompt = `Text-free fused editorial artwork for ${design.shotId}: ${design.narrative.visualFocus}; paper, ink, restrained cobalt and red, no logos, no UI, no evidence claims.`;
    layer.prompt = prompt;
    layer.promptSha256 = shaValue(prompt);
  }
}

async function renderChanged(designs, changedIds) {
  const bundleUrl = await bundle({entryPoint: rendererEntry, publicDir: rendererPublic, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const stills = [];
  try {
    for (const design of designs) {
      const fileName = `${String(design.order).padStart(2, "0")}-${design.shotId}.png`;
      const output = path.join(artifactDir, "stills", fileName);
      const sourceStill = path.join(sourceDir, "stills", fileName);
      fs.mkdirSync(path.dirname(output), {recursive: true});
      if (!changedIds.has(design.shotId) && fs.existsSync(sourceStill)) fs.copyFileSync(sourceStill, output);
      else {
        const composition = await selectComposition({serveUrl: bundleUrl, id: "A1FusedEditorialV2FullBoard", inputProps: {design}, puppeteerInstance: browser, logLevel: "warn"});
        await renderStill({serveUrl: bundleUrl, composition, inputProps: {design}, frame: 0, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      }
      const publicFile = path.join(publicDir, "stills", fileName); fs.mkdirSync(path.dirname(publicFile), {recursive: true}); fs.copyFileSync(output, publicFile);
      stills.push({order: design.order, shotId: design.shotId, publicUrl: `/generated/system-line/${candidatePhase}/stills/${fileName}`, path: rel(output), sha256: shaFile(output), width: 960, height: 540});
    }
  } finally { await browser.close({silent: true}); }
  return stills;
}

async function makeContactSheet(stills) {
  const columns = 5; const tileWidth = 384; const tileHeight = 216; const labelHeight = 34; const rows = Math.ceil(stills.length / columns);
  const composites = [];
  for (const [index, still] of stills.entries()) {
    const left = index % columns * tileWidth; const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    composites.push({input: await sharp(path.join(root, still.path)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    composites.push({input: Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315"/><text x="10" y="23" fill="#f2efe7" font-family="Arial" font-size="16" font-weight="700">${String(still.order).padStart(2, "0")} · ${still.shotId}</text></svg>`), left, top: top + tileHeight});
  }
  const artifact = path.join(artifactDir, "visual-repair-contact-sheet.jpg"); const publicFile = path.join(publicDir, "visual-repair-contact-sheet.jpg");
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111315"}}).composite(composites).jpeg({quality: 90}).toFile(artifact);
  fs.copyFileSync(artifact, publicFile);
  return {path: rel(artifact), publicUrl: `/generated/system-line/${candidatePhase}/visual-repair-contact-sheet.jpg`, sha256: shaFile(artifact), width: columns * tileWidth, height: rows * (tileHeight + labelHeight)};
}

async function main() {
  guard();
  const source = read(path.join(sourceDir, "layered-shot-designs.json"));
  const sourceReport = read(path.join(sourceDir, "report.json"));
  const designs = structuredClone(source.designs);
  const changedIds = new Set(Object.keys(replacements));
  const repairs = [];
  for (const design of designs) {
    const uri = replacements[design.shotId];
    if (!uri) continue;
    bindAsset(design, uri, "material", uri.startsWith("generated/") || uri.startsWith("assets/") ? "generated" : "article-source");
    design.treatment.crop = "cinematic-crop";
    design.treatment.cropAlternatives = [`${design.shotId}-contain`, `${design.shotId}-focal-cover`, `${design.shotId}-cinematic-crop`];
    design.treatment.selectedCropId = `${design.shotId}-cinematic-crop`;
    if (foregrounds[design.shotId]) bindAsset(design, foregrounds[design.shotId], "foreground", "style-pack");
    design.review = {status: "pending-visual-review", structurePass: true, humanVisualApprovalRequired: true, blockers: []};
    design.designSha256 = shaValue(design);
    repairs.push({shotId: design.shotId, newMaterial: uri, foreground: foregrounds[design.shotId] || null, reason: "reduce-repeated-material-or-add-semantic-artwork"});
  }
  fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
  const stills = await renderChanged(designs, changedIds); const contactSheet = await makeContactSheet(stills);
  const payload = {contract: "A1FusedEditorialV2FullBoardDesignSet/v1", visualMasterSha256: source.visualMasterSha256, sourceHash: source.sourceHash, candidateOf: sourcePhase, designs};
  write(path.join(artifactDir, "layered-shot-designs.json"), payload); write(path.join(publicDir, "layered-shot-designs.json"), payload);
  const report = {contract: "A1FusedEditorialV2VisualRepairCandidate/v1", phaseId: candidatePhase, sourcePhase, generatedAt: new Date().toISOString(), reviewOnly: true, currentAuthorityUnchanged: true, rendererAdoptionAllowed: false, sourceBoardSha256: shaFile(path.join(sourceDir, "layered-shot-designs.json")), sourceAuthoritySha256: shaFile(authorityPath), sourceReportStatus: sourceReport.status, changedShotIds: [...changedIds], repairs, allShotsStableStills: stills.length === designs.length, contactSheet, gates: {userVisualReviewRequired: true, motionAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false}, nextAction: "run-visual-quality-audit-then-user-review-before-motion"};
  write(path.join(artifactDir, "report.json"), report); write(path.join(publicDir, "report.json"), report);
  write(path.join(artifactDir, "repair-plan.json"), {contract: "A1FusedEditorialV2VisualRepairPlan/v1", candidatePhase, repairs, applyAllowedBeforeExplicitApproval: false});
  write(path.join(publicDir, "repair-plan.json"), {contract: "A1FusedEditorialV2VisualRepairPlan/v1", candidatePhase, repairs, applyAllowedBeforeExplicitApproval: false});
  console.log(JSON.stringify({status: report.contract, phaseId: candidatePhase, changedShotCount: repairs.length, stillCount: stills.length, contactSheet: contactSheet.publicUrl, nextAction: report.nextAction}, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
