#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rendererRoot = path.join(root, "remotion-renderer");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");

const phaseId = "h-series-typography-direction-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const entryPoint = path.join(rendererRoot, "src/typography-candidate/index.tsx");
const candidatePath = path.join(rendererRoot, "src/typography-candidate/HSeriesTypographyCandidate.tsx");
const planPath = path.join(rendererRoot, "src/typography-candidate/hSeriesTypographyDirectorPlan.json");
const directedPlanPath = path.join(rendererRoot, "src/hSeriesSemanticDirectorPlan.json");
const currentVideoPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/review-960x540-with-source-audio.mp4");
const contactSheetPath = path.join(artifactRoot, "contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "contact-sheet.png");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

for (const file of [entryPoint, candidatePath, planPath, directedPlanPath, currentVideoPath]) {
  if (!fs.existsSync(file)) throw new Error(`missing:${path.relative(root, file)}`);
}
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
const stillRoot = path.join(artifactRoot, "stills");
const publicStillRoot = path.join(publicRoot, "stills");
fs.mkdirSync(stillRoot, {recursive: true});
fs.mkdirSync(publicStillRoot, {recursive: true});

const typographyPlan = read(planPath);
const directedPlan = read(directedPlanPath);
const directedById = new Map(Object.values(directedPlan.macroDesigns || {}).flat().map((item) => [item.beatId, item]));
const treatments = Object.entries(typographyPlan.beats || {});
const proofBeatIds = typographyPlan.proofBeatIds || [];
const failures = [];
if (typographyPlan.contract !== "A1HSeriesTypographyDirectorPlan/v1") failures.push("contract");
if (treatments.length !== 47) failures.push(`scene-count:${treatments.length}`);
if (new Set(treatments.map(([, item]) => item.family)).size < 5) failures.push("family-diversity");
if (new Set(treatments.map(([, item]) => item.layout)).size < 6) failures.push("layout-diversity");
if (new Set(treatments.map(([, item]) => item.motion)).size < 4) failures.push("motion-diversity");
if (new Set(treatments.map(([, item]) => item.emphasisStyle)).size < 5) failures.push("emphasis-style-diversity");
if (proofBeatIds.length !== 12 || new Set(proofBeatIds).size !== 12) failures.push("proof-beat-count");
for (const [beatId, treatment] of treatments) {
  const design = directedById.get(beatId);
  if (!design) failures.push(`missing-directed-beat:${beatId}`);
  const completeText = `${design?.lines?.join("")} ${design?.support || ""}`;
  if (!treatment.emphasis || !completeText.includes(treatment.emphasis)) failures.push(`invalid-emphasis:${beatId}`);
  if (!Array.isArray(treatment.lineScale) || treatment.lineScale.length !== design?.lines?.length) failures.push(`line-scale:${beatId}`);
  if (!Array.isArray(treatment.lineIndent) || treatment.lineIndent.length !== design?.lines?.length) failures.push(`line-indent:${beatId}`);
}
if (failures.length) throw new Error(`typography-plan-invalid:${failures.join(",")}`);

const currentVideoShaBefore = sha256(currentVideoPath);
const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const stills = [];
try {
  for (const beatId of proofBeatIds) {
    const inputProps = {beatId};
    const composition = await selectComposition({serveUrl, id: "A1HSeriesTypographyCandidate", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const output = path.join(stillRoot, `${beatId}.png`);
    await renderStill({serveUrl, composition, inputProps, frame: 48, scale: .5, imageFormat: "png", output, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const publicOutput = path.join(publicStillRoot, `${beatId}.png`);
    fs.copyFileSync(output, publicOutput);
    stills.push({beatId, path: output, publicUrl: `/generated/system-line/${phaseId}/stills/${beatId}.png`, sha256: sha256(output)});
  }
} finally {
  await browser.close({silent: true});
}

const tileWidth = 960;
const tileHeight = 540;
const labelHeight = 52;
const composites = [];
for (const [index, still] of stills.entries()) {
  const tile = await sharp(still.path).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151719"/><text x="18" y="34" fill="#f2efe7" font-family="Arial,sans-serif" font-weight="700" font-size="22">${still.beatId} · ${typographyPlan.beats[still.beatId].family} / ${typographyPlan.beats[still.beatId].layout}</text></svg>`);
  const left = (index % 2) * tileWidth;
  const top = Math.floor(index / 2) * (tileHeight + labelHeight);
  composites.push({input: tile, left, top}, {input: label, left, top: top + tileHeight});
}
await sharp({create: {width: tileWidth * 2, height: (tileHeight + labelHeight) * 6, channels: 4, background: PAPER_COLOR()}}).composite(composites).png().toFile(contactSheetPath);
fs.copyFileSync(contactSheetPath, publicContactSheetPath);
const currentVideoShaAfter = sha256(currentVideoPath);

function PAPER_COLOR() { return "#f2efe7"; }

const report = {
  contract: "A1HSeriesTypographyDirectionProof/v1",
  status: currentVideoShaBefore === currentVideoShaAfter && stills.length === 12 ? "READY_FOR_DIRECT_REVIEW" : "BLOCKED",
  proofOnly: true,
  currentAuthorityUntouched: currentVideoShaBefore === currentVideoShaAfter,
  rendererPatchAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  sourceBinding: {
    typographyPlanPath: path.relative(root, planPath),
    typographyPlanSha256: sha256(planPath),
    candidateRendererPath: path.relative(root, candidatePath),
    candidateRendererSha256: sha256(candidatePath),
    directedPlanPath: path.relative(root, directedPlanPath),
    directedPlanSha256: sha256(directedPlanPath),
    currentVideoPath: path.relative(root, currentVideoPath),
    currentVideoSha256: currentVideoShaAfter
  },
  coverage: {
    sceneCount: treatments.length,
    familyCount: new Set(treatments.map(([, item]) => item.family)).size,
    layoutCount: new Set(treatments.map(([, item]) => item.layout)).size,
    motionCount: new Set(treatments.map(([, item]) => item.motion)).size,
    emphasisStyleCount: new Set(treatments.map(([, item]) => item.emphasisStyle)).size,
    proofStillCount: stills.length
  },
  visualThesis: typographyPlan.visualThesis,
  proofBeatIds,
  stills,
  media: {contactSheet: {publicUrl: `/generated/system-line/${phaseId}/contact-sheet.png`, sha256: sha256(contactSheetPath), width: tileWidth * 2, height: (tileHeight + labelHeight) * 6}},
  failures: currentVideoShaBefore === currentVideoShaAfter ? [] : ["current-authority-video-mutated"],
  nextAction: "direct-review-typography-proof-before-renderer-adoption"
};
for (const output of [reportPath, publicReportPath]) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, coverage: report.coverage, currentAuthorityUntouched: report.currentAuthorityUntouched, contactSheet: path.relative(root, contactSheetPath), publicUrl: report.media.contactSheet.publicUrl}, null, 2));
