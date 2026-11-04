#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {fusedEditorialV2VisualMaster} from "../apps/studio-next/src/lib/a1-visual-master-profile-v2.ts";
import {A1DesignBoardManifestV1Schema} from "../apps/studio-next/src/lib/a1-design-board-manifest-v1.ts";
import {buildPendingFusedEditorialV2MaturityManifest} from "../apps/studio-next/src/lib/a1-system-maturity-v1.ts";
import {fusedEditorialV2Anchors} from "../apps/studio-next/src/lib/fused-editorial-v2-anchor-data.ts";
import {buildFourTreatmentImageCandidates} from "../lib/a1-four-treatment-image-factory.js";

const root = process.cwd();
const phaseId = "fused-editorial-v2-anchor-candidate-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const currentPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const rendererEntryPoint = path.join(root, "remotion-renderer/src/system-line-h-frame-index.tsx");
const rendererSourcePath = path.join(root, "remotion-renderer/src/FusedEditorialV2FullBoard.tsx");
const rendererPublicDir = path.join(root, "remotion-renderer/public");
const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(root, "remotion-renderer/package.json"));
const sharp = require("sharp") as typeof import("sharp");
const {bundle} = rendererRequire("@remotion/bundler") as typeof import("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer") as typeof import("@remotion/renderer");

const shaBuffer = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file: string) => shaBuffer(fs.readFileSync(file));
const jsonBuffer = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
const readJson = (file: string) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, jsonBuffer(value));
};

function assertWorkspace() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-system-line-branch:${branch}`);
  if (!root.endsWith("/work/a1-motion-studio-system-line")) throw new Error(`wrong-system-line-root:${root}`);
  for (const file of [currentPhasePath, currentPropsPath, rendererEntryPoint, rendererSourcePath]) {
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`required-file-missing:${file}`);
  }
  const current = readJson(currentPhasePath);
  if (current?.contract !== "A1SystemLineCurrentPhase/v1" || current?.phaseId !== "h-series-semantic-directed-v1") {
    throw new Error(`unexpected-current-authority:${current?.phaseId || "missing"}`);
  }
}

function buildSvgHeader(width: number, height: number) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315"/><text x="34" y="42" fill="#f2efe7" font-family="Arial,sans-serif" font-size="24" font-weight="800">FUSED EDITORIAL V2 · 三张静态锚点</text><text x="34" y="74" fill="#9ca0a3" font-family="Arial,sans-serif" font-size="15">01 开场真实动作 · 02 复杂证据拼贴 · 03 黑场方向收束 / 待人工视觉审片</text></svg>`);
}

async function renderAnchors() {
  const artifactStillDir = path.join(artifactDir, "stills");
  const publicStillDir = path.join(publicDir, "stills");
  fs.mkdirSync(artifactStillDir, {recursive: true});
  fs.mkdirSync(publicStillDir, {recursive: true});
  const serveUrl = await bundle({entryPoint: rendererEntryPoint, publicDir: rendererPublicDir, rootDir: path.join(root, "remotion-renderer"), enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const records: Array<{anchorId: string; label: string; compositionId: string; path: string; publicUrl: string; sha256: string; width: number; height: number}> = [];
  try {
    for (const anchor of fusedEditorialV2Anchors) {
      const composition = await selectComposition({serveUrl, id: anchor.compositionId, inputProps: {design: anchor.design, motionFrame: 60, motionDuration: anchor.design.order === 3 ? 150 : 120}, puppeteerInstance: browser, logLevel: "warn"});
      const fileName = `${anchor.anchorId.toLowerCase()}.png`;
      const artifactPath = path.join(artifactStillDir, fileName);
      const publicPath = path.join(publicStillDir, fileName);
      await renderStill({serveUrl, composition, inputProps: {design: anchor.design, motionFrame: 60, motionDuration: anchor.design.order === 3 ? 150 : 120}, frame: 0, output: artifactPath, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      fs.copyFileSync(artifactPath, publicPath);
      const meta = await sharp(artifactPath).metadata();
      records.push({anchorId: anchor.anchorId, label: anchor.label, compositionId: anchor.compositionId, path: rel(artifactPath), publicUrl: `/generated/system-line/${phaseId}/stills/${fileName}`, sha256: shaFile(artifactPath), width: Number(meta.width || 0), height: Number(meta.height || 0)});
    }
  } finally {
    await browser.close({silent: true});
  }
  return records;
}

async function buildContactSheet(stills: Awaited<ReturnType<typeof renderAnchors>>) {
  const tileWidth = 640;
  const tileHeight = 360;
  const headerHeight = 94;
  const width = tileWidth * stills.length;
  const height = headerHeight + tileHeight;
  const composite: Array<{input: Buffer | string; left: number; top: number}> = [{input: buildSvgHeader(width, headerHeight), left: 0, top: 0}];
  for (const [index, still] of stills.entries()) composite.push({input: await sharp(path.join(root, still.path)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left: index * tileWidth, top: headerHeight});
  const artifactPath = path.join(artifactDir, "anchor-contact-sheet.png");
  const publicPath = path.join(publicDir, "anchor-contact-sheet.png");
  await sharp({create: {width, height, channels: 4, background: "#111315"}}).composite(composite).png().toFile(artifactPath);
  fs.copyFileSync(artifactPath, publicPath);
  return {path: rel(artifactPath), publicUrl: `/generated/system-line/${phaseId}/anchor-contact-sheet.png`, sha256: shaFile(artifactPath), width, height};
}

const treatmentInputs = [
  {anchorId: "FE2-A01", sourceId: "editor-selection", sourcePath: path.join(rendererPublicDir, "editorial-documentary-reset-v1/source/selection-action.png")},
  {anchorId: "FE2-A02", sourceId: "archive-paper", sourcePath: path.join(rendererPublicDir, "assets/generated-artwork/04-H03-B03-a.png")},
  {anchorId: "FE2-A02", sourceId: "paper-spiral-alpha", sourcePath: path.join(rendererPublicDir, "layered-anchor-v2/final/h03-paper-spiral.png")},
  {anchorId: "FE2-A03", sourceId: "direction-cluster-alpha", sourcePath: path.join(rendererPublicDir, "layered-anchor-v2/final/h11-direction-cluster.png")},
] as const;

async function buildTreatments() {
  const records = [];
  for (const input of treatmentInputs) {
    const artifactOutputDir = path.join(artifactDir, "treatments", input.anchorId, input.sourceId);
    const publicOutputDir = path.join(publicDir, "treatments", input.anchorId, input.sourceId);
    const candidate = await buildFourTreatmentImageCandidates({sourcePath: input.sourcePath, outputDir: artifactOutputDir, id: input.sourceId, width: 960, height: 540});
    fs.mkdirSync(publicOutputDir, {recursive: true});
    const outputs = candidate.outputs.map((output: {path: string | null; [key: string]: unknown}) => {
      if (!output.path) return {...output, publicUrl: null};
      const publicPath = path.join(publicOutputDir, path.basename(output.path));
      fs.copyFileSync(output.path, publicPath);
      return {...output, path: rel(output.path), publicUrl: `/generated/system-line/${phaseId}/treatments/${input.anchorId}/${input.sourceId}/${path.basename(output.path)}`};
    });
    const normalized = {...candidate, anchorId: input.anchorId, source: {...candidate.source, path: rel(input.sourcePath)}, outputs};
    writeJson(path.join(artifactOutputDir, "report.json"), normalized);
    writeJson(path.join(publicOutputDir, "report.json"), normalized);
    records.push(normalized);
  }
  return records;
}

function buildReviewLedger(visualMasterSha256: string, designHashes: Record<string, string>) {
  const artifactPath = path.join(artifactDir, "review-decisions.json");
  const publicPath = path.join(publicDir, "review-decisions.json");
  const prior = readJson(publicPath);
  const masterChanged = prior?.visualMasterSha256 !== visualMasterSha256;
  const changedIds = new Set<string>();
  for (const anchor of fusedEditorialV2Anchors) if (prior?.anchorDesignHashes?.[anchor.anchorId] !== designHashes[anchor.anchorId]) changedIds.add(anchor.anchorId);
  const affected = new Set<string>();
  if (masterChanged) fusedEditorialV2Anchors.forEach((anchor) => affected.add(anchor.anchorId));
  else for (const id of changedIds) {
    const index = fusedEditorialV2Anchors.findIndex((anchor) => anchor.anchorId === id);
    if (index > 0) affected.add(fusedEditorialV2Anchors[index - 1].anchorId);
    affected.add(id);
    if (index >= 0 && index < fusedEditorialV2Anchors.length - 1) affected.add(fusedEditorialV2Anchors[index + 1].anchorId);
  }
  const priorById = new Map((prior?.decisions || []).map((decision: {anchorId: string}) => [decision.anchorId, decision]));
  const decisions = fusedEditorialV2Anchors.map((anchor) => {
    const old = priorById.get(anchor.anchorId) as {status?: string; note?: string | null; reviewedAt?: string | null; reviewedDesignSha256?: string | null} | undefined;
    const keep = old && !affected.has(anchor.anchorId) && old.reviewedDesignSha256 === designHashes[anchor.anchorId];
    return keep ? {...old, anchorId: anchor.anchorId} : {anchorId: anchor.anchorId, status: "pending", note: null, reviewedAt: null, reviewedDesignSha256: null};
  });
  const approvedCount = decisions.filter((decision) => decision.status === "approved").length;
  const reviseCount = decisions.filter((decision) => decision.status === "revise").length;
  const pendingCount = decisions.length - approvedCount - reviseCount;
  const ledger = {
    contract: "A1FusedEditorialV2AnchorReviewLedger/v1",
    phaseId,
    visualMasterSha256,
    anchorDesignHashes: designHashes,
    invalidation: {masterChanged, changedAnchorIds: [...changedIds], clearedAnchorIds: [...affected]},
    decisions,
    summary: {anchorCount: decisions.length, approvedCount, reviseCount, pendingCount},
    status: approvedCount === decisions.length ? "REFERENCE_SUITE_APPROVED" : reviseCount > 0 ? "REFERENCE_SUITE_NEEDS_REVISION" : "PENDING_USER_REFERENCE_REVIEW",
    referenceSuiteApproved: approvedCount === decisions.length,
    fullBoardGenerationAllowed: false,
    motionDesignAllowed: false,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    updatedAt: new Date().toISOString(),
  };
  writeJson(artifactPath, ledger);
  writeJson(publicPath, ledger);
  return ledger;
}

async function main() {
  assertWorkspace();
  const currentPhaseShaBefore = shaFile(currentPhasePath);
  const sourceHash = shaFile(currentPropsPath);
  fs.mkdirSync(artifactDir, {recursive: true});
  fs.mkdirSync(publicDir, {recursive: true});

  const visualMasterSha256 = shaBuffer(jsonBuffer(fusedEditorialV2VisualMaster));
  const rendererSourceSha256 = shaFile(rendererSourcePath);
  const designHashes = Object.fromEntries(fusedEditorialV2Anchors.map((anchor) => [anchor.anchorId, shaBuffer(jsonBuffer({design: anchor.design, rendererSourceSha256}))]));
  writeJson(path.join(artifactDir, "visual-master.json"), fusedEditorialV2VisualMaster);
  writeJson(path.join(publicDir, "visual-master.json"), fusedEditorialV2VisualMaster);
  writeJson(path.join(artifactDir, "anchor-designs.json"), {contract: "A1FusedEditorialV2AnchorDesignSet/v1", visualMasterSha256, anchors: fusedEditorialV2Anchors.map((anchor) => ({...anchor, designSha256: designHashes[anchor.anchorId]}))});
  writeJson(path.join(publicDir, "anchor-designs.json"), {contract: "A1FusedEditorialV2AnchorDesignSet/v1", visualMasterSha256, anchors: fusedEditorialV2Anchors.map((anchor) => ({...anchor, designSha256: designHashes[anchor.anchorId]}))});

  const [stills, treatments] = await Promise.all([renderAnchors(), buildTreatments()]);
  const contactSheet = await buildContactSheet(stills);
  const ledger = buildReviewLedger(visualMasterSha256, designHashes);
  const shots = fusedEditorialV2Anchors.map((anchor, index) => ({
    order: index + 1,
    shotId: anchor.anchorId,
    designSha256: designHashes[anchor.anchorId],
    still: (() => { const still = stills.find((item) => item.anchorId === anchor.anchorId)!; return {publicUrl: still.publicUrl, sha256: still.sha256, width: still.width, height: still.height}; })(),
    review: (() => { const decision = ledger.decisions.find((item) => item.anchorId === anchor.anchorId)!; return {status: decision.status, reviewedDesignSha256: decision.reviewedDesignSha256}; })(),
    neighborShotIds: [fusedEditorialV2Anchors[index - 1]?.anchorId, fusedEditorialV2Anchors[index + 1]?.anchorId].filter(Boolean),
  }));
  const board = A1DesignBoardManifestV1Schema.parse({
    contract: "A1DesignBoardManifest/v1",
    projectId: "h47-fused-editorial-v2-anchor-candidate",
    visualMasterId: "fused-editorial-v2",
    visualMasterSha256,
    sourceHash,
    phase: "anchor-review",
    currentAuthorityMutated: false,
    reviewOnly: true,
    fullBoardGenerationAllowed: false,
    motionDesignAllowed: false,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    shots,
    summary: {shotCount: shots.length, approvedCount: ledger.summary.approvedCount, pendingCount: ledger.summary.pendingCount, reviseCount: ledger.summary.reviseCount},
    nextAction: "build-12-shot-pilot-before-full-board",
  });
  writeJson(path.join(artifactDir, "design-board-manifest.json"), board);
  writeJson(path.join(publicDir, "design-board-manifest.json"), board);
  const maturity = buildPendingFusedEditorialV2MaturityManifest({approvedAnchorCount: ledger.summary.approvedCount});
  writeJson(path.join(artifactDir, "maturity-manifest.json"), maturity);
  writeJson(path.join(publicDir, "maturity-manifest.json"), maturity);
  const designBoardSha256 = shaFile(path.join(artifactDir, "design-board-manifest.json"));

  const currentPhaseShaAfter = shaFile(currentPhasePath);
  if (currentPhaseShaAfter !== currentPhaseShaBefore) throw new Error("current-authority-mutated-during-candidate-build");
  const report = {
    contract: "A1FusedEditorialV2AnchorCandidateReport/v1",
    phaseId,
    status: ledger.status,
    structuralStatus: "PASS",
    visualReviewStatus: ledger.status,
    generatedAt: new Date().toISOString(),
    reviewOnly: true,
    currentAuthorityMutated: false,
    currentAuthority: {phaseId: "h-series-semantic-directed-v1", currentPhasePath: rel(currentPhasePath), sha256Before: currentPhaseShaBefore, sha256After: currentPhaseShaAfter, unchanged: true},
    visualMaster: {id: fusedEditorialV2VisualMaster.id, contract: fusedEditorialV2VisualMaster.contract, sha256: visualMasterSha256, publicUrl: `/generated/system-line/${phaseId}/visual-master.json`},
    designBoard: {contract: board.contract, sha256: designBoardSha256, publicUrl: `/generated/system-line/${phaseId}/design-board-manifest.json`, phase: board.phase},
    sourceBinding: {projectId: "h47", currentPropsPath: rel(currentPropsPath), currentPropsSha256: sourceHash, rendererSourcePath: rel(rendererSourcePath), rendererSourceSha256, referenceMode: "grammar-only-not-clone"},
    anchors: fusedEditorialV2Anchors.map((anchor) => ({...anchor, designSha256: designHashes[anchor.anchorId], still: stills.find((item) => item.anchorId === anchor.anchorId), treatments: treatments.filter((item) => item.anchorId === anchor.anchorId)})),
    contactSheet,
    role: "system-reference-suite-calibration",
    gates: {referencePrototypeCount: 3, allReferenceStillsStable: stills.length === 3, referenceSuiteReviewRecommended: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, humanVisualApprovalRequired: true},
    assetFactory: {contract: "A1FourTreatmentImageFactory/v1", sourceCount: treatments.length, readyTreatmentCount: treatments.flatMap((item) => item.outputs).filter((output) => output.status === "ready").length, honestFallbackCount: treatments.flatMap((item) => item.outputs).filter((output) => output.status === "fallback-to-crop").length, allSourcesHaveAtLeastThreeReadyTreatments: treatments.every((item) => item.outputs.filter((output) => output.status === "ready").length >= 3)},
    reviewLedger: {contract: ledger.contract, publicUrl: `/generated/system-line/${phaseId}/review-decisions.json`, status: ledger.status, summary: ledger.summary},
    failures: [],
    nextAction: board.nextAction,
  };
  writeJson(path.join(artifactDir, "report.json"), report);
  writeJson(path.join(publicDir, "report.json"), report);
  console.log(JSON.stringify({status: report.status, structuralStatus: report.structuralStatus, currentAuthorityUnchanged: report.currentAuthority.unchanged, anchors: report.anchors.map((anchor) => ({anchorId: anchor.anchorId, still: anchor.still?.publicUrl})), assetFactory: report.assetFactory, contactSheet: report.contactSheet.publicUrl, nextAction: report.nextAction}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
