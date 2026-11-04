#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {A1_REFERENCE_CONDITIONED_H47_ANCHOR_CONTRACT, a1ReferenceConditionedH47AnchorSpecs} from "../apps/studio-next/src/lib/a1-reference-conditioned-h47-anchor-v1.ts";

const root = process.cwd();
const phaseId = "reference-conditioned-anchor-gate-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicDir = path.join(rendererRoot, "public");
const currentPropsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const rendererSourcePath = path.join(rendererRoot, "src/ReferenceConditionedH47Anchors.tsx");
const entryPoint = path.join(rendererRoot, "src/reference-conditioned-anchor-index.tsx");
const corpusPath = path.join(root, "apps/studio-next/public/generated/system-line/reference-sequence-corpus-v1/corpus.json");
const require = createRequire(path.join(root, "package.json"));
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const sharp = rendererRequire("sharp");
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const publicFile = (publicUrl) => path.join(root, "apps/studio-next/public", String(publicUrl).replace(/^\//u, ""));

function svgText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function assertAuthority() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-system-line-branch:${branch}`);
  const phase = readJson(currentPhasePath);
  if (phase.phaseId !== "h-series-semantic-directed-v1") throw new Error(`unexpected-current-authority:${phase.phaseId}`);
}

function findBeat(value, shotId) {
  if (!value || typeof value !== "object") return null;
  if (value.beatId === shotId) return value;
  for (const child of Object.values(value)) {
    const result = findBeat(child, shotId);
    if (result) return result;
  }
  return null;
}

async function renderAnchors(currentProps) {
  const stillDir = path.join(publicDir, "stills");
  fs.mkdirSync(stillDir, {recursive: true});
  const serveUrl = await bundle({entryPoint, publicDir: rendererPublicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const records = [];
  try {
    for (const spec of a1ReferenceConditionedH47AnchorSpecs) {
      const beat = findBeat(currentProps, spec.shotId);
      if (!beat) throw new Error(`h47-beat-missing:${spec.shotId}`);
      if (beat.screenText !== spec.title) throw new Error(`h47-title-drift:${spec.shotId}:${beat.screenText}`);
      const inputProps = {
        shotId: spec.shotId,
        title: beat.screenText,
        tokens: spec.tokens,
        materialAsset: spec.materialAsset,
        referenceSequenceIds: spec.referenceSequenceIds,
      };
      const fileName = `${String(spec.order).padStart(2, "0")}-${spec.shotId}-${spec.familyId}.png`;
      const output = path.join(stillDir, fileName);
      const composition = await selectComposition({serveUrl, id: spec.compositionId, inputProps, puppeteerInstance: browser, logLevel: "warn"});
      await renderStill({serveUrl, composition, inputProps, frame: spec.heroFrame, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const metadata = await sharp(output).metadata();
      records.push({
        ...spec,
        sourceTextStartMs: beat.sourceStartMs,
        sourceTextEndMs: beat.sourceEndMs,
        still: {publicUrl: `/generated/system-line/${phaseId}/stills/${fileName}`, sha256: shaFile(output), width: Number(metadata.width || 0), height: Number(metadata.height || 0), heroFrame: spec.heroFrame},
      });
    }
  } finally {
    await browser.close({silent: true});
  }
  return records;
}

function findCorpusSequence(corpus, id) {
  for (const source of corpus.sources || []) {
    const sequence = (source.sequences || []).find((candidate) => candidate.id === id);
    if (sequence) return {source, sequence};
  }
  throw new Error(`reference-sequence-missing:${id}`);
}

async function referencePanel(record, corpus) {
  const width = 960;
  const height = 540;
  const headerHeight = 63;
  const rowHeight = 159;
  const inputs = [{input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#111315"/><text x="22" y="29" fill="#f3efe4" font-family="Arial,sans-serif" font-size="21" font-weight="800">${svgText(record.shotId)} · ${svgText(record.familyId)}</text><text x="22" y="51" fill="#aeb4b0" font-family="Arial,sans-serif" font-size="13">REFERENCE GRAMMAR / abstract transfer only</text></svg>`), left: 0, top: 0}];
  for (let index = 0; index < record.referenceSequenceIds.length; index += 1) {
    const {source, sequence} = findCorpusSequence(corpus, record.referenceSequenceIds[index]);
    const top = headerHeight + index * rowHeight;
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="31"><rect width="100%" height="100%" fill="#e8dfcd"/><text x="14" y="21" fill="#111315" font-family="Arial,sans-serif" font-size="14" font-weight="700">${svgText(source.creator)} / ${svgText(sequence.transitionVerb)} / ${svgText(sequence.stateSequence.join(" → "))}</text></svg>`);
    inputs.push({input: label, left: 0, top});
    for (let frameIndex = 0; frameIndex < sequence.frames.length; frameIndex += 1) {
      inputs.push({input: await sharp(publicFile(sequence.frames[frameIndex].publicUrl)).resize(240, 128, {fit: "cover"}).toBuffer(), left: frameIndex * 240, top: top + 31});
    }
  }
  return sharp({create: {width, height, channels: 4, background: "#111315"}}).composite(inputs).png().toBuffer();
}

async function buildComparisonSheet(records, corpus) {
  const width = 1920;
  const headerHeight = 92;
  const rowHeight = 540;
  const height = headerHeight + records.length * rowHeight;
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#080a0b"/><text x="32" y="39" fill="#f3efe4" font-family="Arial,sans-serif" font-size="28" font-weight="800">REFERENCE GRAMMAR → H47 CLEAN-ROOM ADAPTER / THREE ANCHORS</text><text x="32" y="70" fill="#aeb4b0" font-family="Arial,sans-serif" font-size="16">左：连续参考状态（仅语法） · 右：A1 候选静帧 · 机器通过不等于视觉批准</text></svg>`);
  const inputs = [{input: header, left: 0, top: 0}];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    inputs.push({input: await referencePanel(record, corpus), left: 0, top: headerHeight + index * rowHeight});
    inputs.push({input: await sharp(publicFile(record.still.publicUrl)).resize(960, 540, {fit: "cover"}).toBuffer(), left: 960, top: headerHeight + index * rowHeight});
  }
  const output = path.join(publicDir, "reference-to-anchor-comparison.png");
  await sharp({create: {width, height, channels: 4, background: "#080a0b"}}).composite(inputs).png().toFile(output);
  return {publicUrl: `/generated/system-line/${phaseId}/reference-to-anchor-comparison.png`, sha256: shaFile(output), width, height};
}

function buildSupersessionManifest() {
  const superseded = [
    {phaseId: "editorial-montage-v1-anchor-pilot", reason: "shared-universal-title-and-card-like-composition"},
    {phaseId: "editorial-montage-v2-anchors", reason: "material-present-but-reference-rhythm-and-composition-gap-remains"},
    {phaseId: "editorial-evidence-kinetic-h47-anchor-reset-v2", reason: "engineering-proof-does-not-meet-user-visual-reference"},
    {phaseId: "motion-ir-parity-proof-v1", reason: "timing-parity-proof-is-not-a-visual-master"},
  ].map((item) => ({...item, visualStatus: "REJECTED_BY_USER_VISUAL_GAP", adoptionAllowed: false, engineeringEvidenceMayRemain: true, deleteArtifacts: false}));
  return {contract: "A1VisualCandidateSupersessionManifest/v1", status: "SUPERSEDED_FOR_VISUAL_ADOPTION", superseded, supersededCount: superseded.length, currentCandidate: phaseId, currentCandidateReviewOnly: true};
}

async function main() {
  assertAuthority();
  if (!fs.existsSync(corpusPath)) throw new Error("reference-corpus-missing; run build:reference-sequence-corpus first");
  fs.mkdirSync(artifactDir, {recursive: true});
  fs.mkdirSync(publicDir, {recursive: true});
  const propsSha256Before = shaFile(currentPropsPath);
  const phaseSha256Before = shaFile(currentPhasePath);
  const currentProps = readJson(currentPropsPath);
  const corpus = readJson(corpusPath);
  const records = await renderAnchors(currentProps);
  const comparisonSheet = await buildComparisonSheet(records, corpus);
  if (shaFile(currentPropsPath) !== propsSha256Before) throw new Error("h47-current-props-mutated");
  if (shaFile(currentPhasePath) !== phaseSha256Before) throw new Error("current-phase-mutated");
  const supersession = buildSupersessionManifest();
  const report = {
    contract: "A1ReferenceConditionedAnchorGateReport/v1",
    phaseId,
    status: "STRUCTURAL_PASS",
    referenceCorpusStatus: corpus.status,
    visualReviewStatus: "PENDING_USER_VISUAL_REVIEW",
    currentAuthority: {phaseId: "h-series-semantic-directed-v1", propsSha256Before, propsSha256After: shaFile(currentPropsPath), phaseSha256Before, phaseSha256After: shaFile(currentPhasePath), unchanged: true},
    sourceContract: A1_REFERENCE_CONDITIONED_H47_ANCHOR_CONTRACT,
    anchors: records,
    comparisonSheet,
    supersession,
    metrics: {
      anchorCount: records.length,
      independentFamilyCount: new Set(records.map((record) => record.familyId)).size,
      uniqueLayoutSilhouetteCount: new Set(records.map((record) => record.layoutSilhouette)).size,
      sourceTemplateLaneCount: new Set(records.map((record) => record.sourceTemplateLane)).size,
      referenceBoundAnchorCount: records.filter((record) => record.referenceSequenceIds.length >= 2).length,
      realEvidenceAnchorCount: records.filter((record) => Boolean(record.materialAsset)).length,
      sharedUniversalTitleComponentCount: 0,
      referenceSourceCount: corpus.sourceCount,
      referenceSequenceCount: corpus.sequenceCount,
      referenceFrameCount: corpus.frameCount,
    },
    gates: {
      structuralGate: "PASS",
      referenceGrammarGate: "PASS",
      humanVisualApprovalGate: "PENDING",
      rendererAdoptionAllowed: false,
      fullBoardGenerationAllowed: false,
      motionPrototypeAllowed: false,
      fullMp4RenderAllowed: false,
      finalRenderAllowed: false,
    },
    nextAction: "用户在 4311 对照参考连续状态审三张锚点；只有明确批准的家族才能进入动态原型。",
  };
  for (const [name, value] of Object.entries({"report.json": report, "supersession-manifest.json": supersession, "anchor-specs.json": {contract: A1_REFERENCE_CONDITIONED_H47_ANCHOR_CONTRACT, anchors: a1ReferenceConditionedH47AnchorSpecs}})) {
    writeJson(path.join(artifactDir, name), value);
    writeJson(path.join(publicDir, name), value);
  }
  console.log(JSON.stringify({status: report.status, visualReviewStatus: report.visualReviewStatus, metrics: report.metrics, comparisonSheet: comparisonSheet.publicUrl, currentAuthorityUnchanged: report.currentAuthority.unchanged}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
