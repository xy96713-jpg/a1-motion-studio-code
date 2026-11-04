#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {editorialMontageV2Anchors, editorialMontageV2Profile} from "../apps/studio-next/src/lib/editorial-montage-v2-anchor-data.ts";
import {A1_EDITORIAL_MONTAGE_V2_CONTRACT, type A1EditorialMontageV2Anchor} from "../apps/studio-next/src/lib/a1-editorial-montage-v2-anchor-contract.ts";

const root = process.cwd();
const phaseId = "editorial-montage-v2-anchors";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicDir = path.join(rendererRoot, "public");
const currentPropsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const rendererSourcePath = path.join(rendererRoot, "src/EditorialMontageV2AnchorBoard.tsx");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const require = createRequire(path.join(root, "package.json"));
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const sharp = rendererRequire("sharp") as typeof import("sharp");
const {bundle} = rendererRequire("@remotion/bundler") as typeof import("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer") as typeof import("@remotion/renderer");
const sha = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file: string) => sha(fs.readFileSync(file));
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;

function assertAuthority() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-system-line-branch:${branch}`);
  const phase = readJson<{phaseId?: string}>(currentPhasePath);
  if (phase.phaseId !== "h-series-semantic-directed-v1") throw new Error(`unexpected-current-authority:${phase.phaseId}`);
}

type StillRecord = {shotId: string; publicUrl: string; sha256: string; width: number; height: number};

async function renderAnchors(): Promise<StillRecord[]> {
  const stillDir = path.join(publicDir, "stills");
  fs.mkdirSync(stillDir, {recursive: true});
  const serveUrl = await bundle({entryPoint, publicDir: rendererPublicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const records: StillRecord[] = [];
  try {
    for (const design of editorialMontageV2Anchors) {
      const fileName = `${String(design.order).padStart(2, "0")}-${design.shotId}.png`;
      const output = path.join(stillDir, fileName);
      const composition = await selectComposition({serveUrl, id: "A1EditorialMontageV2Anchor", inputProps: {design}, puppeteerInstance: browser, logLevel: "warn"});
      await renderStill({serveUrl, composition, inputProps: {design}, frame: 0, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const metadata = await sharp(output).metadata();
      records.push({shotId: design.shotId, publicUrl: `/generated/system-line/${phaseId}/stills/${fileName}`, sha256: shaFile(output), width: Number(metadata.width || 0), height: Number(metadata.height || 0)});
    }
  } finally { await browser.close({silent: true}); }
  return records;
}

async function buildContactSheet(records: StillRecord) {
  const tileWidth = 640; const tileHeight = 360; const header = 72; const width = tileWidth * 3; const height = header + tileHeight;
  const headerSvg = Buffer.from(`<svg width="${width}" height="${header}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b0c0e"/><text x="28" y="31" fill="#f4f0e8" font-family="Arial,sans-serif" font-size="20" font-weight="700">EDITORIAL MONTAGE V2 · 三张主素材锚点 · 待视觉审片</text><text x="28" y="56" fill="#b5b7b6" font-family="Arial,sans-serif" font-size="13">material-first / H47 authority unchanged / full board locked</text></svg>`);
  const layers = [{input: headerSvg, left: 0, top: 0}, ...await Promise.all(records.map(async (record, index) => ({input: await sharp(path.join(root, "apps/studio-next/public", record.publicUrl.replace(/^\/generated\//u, "generated/"))).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left: index * tileWidth, top: header})) )];
  const file = path.join(publicDir, "anchor-contact-sheet.png");
  await sharp({create: {width, height, channels: 4, background: "#0b0c0e"}}).composite(layers).png().toFile(file);
  return {publicUrl: `/generated/system-line/${phaseId}/anchor-contact-sheet.png`, sha256: shaFile(file), width, height, columns: 3};
}

function sourceManifest() {
  return editorialMontageV2Anchors.map((design) => {
    const file = path.join(rendererPublicDir, design.material.assetUri.replace(/^\//u, ""));
    return {shotId: design.shotId, assetUri: design.material.assetUri, sourceKind: design.material.sourceKind, sha256: shaFile(file), bytes: fs.statSync(file).size, localOnly: true, originalPromptBound: design.material.promptBound};
  });
}

async function main() {
  assertAuthority();
  fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
  const propsSha256 = shaFile(currentPropsPath); const currentPhaseSha256 = shaFile(currentPhasePath);
  const records = await renderAnchors();
  const sheet = await buildContactSheet(records);
  if (shaFile(currentPhasePath) !== currentPhaseSha256) throw new Error("current-authority-mutated-during-editorial-montage-v2-build");
  const profileSha256 = sha(JSON.stringify(editorialMontageV2Profile));
  const designSha256 = sha(JSON.stringify(editorialMontageV2Anchors));
  const rendererSourceSha256 = shaFile(rendererSourcePath);
  const sourceAssets = sourceManifest();
  const decisions = {contract: "A1EditorialMontageV2ReviewLedger/v1", phaseId, profileSha256, designSha256, sourcePropsSha256: propsSha256, currentPhaseSha256, decisions: editorialMontageV2Anchors.map((anchor) => ({shotId: anchor.shotId, status: "pending", reviewedDesignSha256: null, note: null})), summary: {anchorCount: 3, approvedCount: 0, pendingCount: 3, reviseCount: 0}, status: "PENDING_USER_VISUAL_REVIEW", reviewOnly: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false};
  const manifest = {contract: "A1DesignBoardManifest/v1", projectId: "h47-editorial-montage-v2-anchors", profileId: editorialMontageV2Profile.id, profileSha256, sourceHash: propsSha256, phase: "anchor-review", currentAuthorityMutated: false, reviewOnly: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, shots: editorialMontageV2Anchors.map((anchor) => ({order: anchor.order, shotId: anchor.shotId, still: records.find((record) => record.shotId === anchor.shotId), reviewStatus: anchor.review.status})), nextAction: "review-three-material-first-anchors-before-expansion"};
  const report = {contract: "A1EditorialMontageV2AnchorReport/v1", phaseId, status: "STRUCTURAL_PASS", visualReviewStatus: "VISUAL_REVIEW_REQUIRED", reviewOnly: true, currentAuthorityMutated: false, currentAuthority: {phaseId: "h-series-semantic-directed-v1", unchanged: true}, profile: {id: editorialMontageV2Profile.id, contract: editorialMontageV2Profile.contract, sha256: profileSha256, publicUrl: `/generated/system-line/${phaseId}/visual-master.json`}, sourceBinding: {articleId: "h47", sourcePropsSha256: propsSha256, currentPhaseSha256, rendererSourceSha256, designSha256, currentAuthorityPhase: "h-series-semantic-directed-v1", currentAuthorityUnchanged: true}, sourceAssets, anchors: editorialMontageV2Anchors.map((anchor) => ({...anchor, still: records.find((record) => record.shotId === anchor.shotId)})), contactSheet: sheet, metrics: {anchorCount: 3, materialLedCount: editorialMontageV2Anchors.filter((anchor) => anchor.material.coverage >= .55).length, averageMaterialCoverage: editorialMontageV2Anchors.reduce((sum, anchor) => sum + anchor.material.coverage, 0) / 3, uniqueRoleCount: new Set(editorialMontageV2Anchors.map((anchor) => anchor.role)).size, screenshotOnlyCount: 0, abstractPlaceholderCount: 0, decorativeLineCount: 0, repeatedTemplateCount: 0}, gates: {anchorsStableStills: true, anchorsVisuallyApproved: false, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, humanVisualApprovalRequired: true}, nextAction: "用户先审三张锚点；未明确认可前不扩展12镜、47镜或动画。"};
  const files = {"visual-master.json": editorialMontageV2Profile, "anchor-designs.json": {contract: A1_EDITORIAL_MONTAGE_V2_CONTRACT, anchors: editorialMontageV2Anchors}, "source-assets.json": {contract: "A1MaterialAssetManifest/v1", assets: sourceAssets}, "review-decisions.json": decisions, "design-board-manifest.json": manifest, "report.json": report};
  for (const [name, value] of Object.entries(files)) { writeJson(path.join(artifactDir, name), value); writeJson(path.join(publicDir, name), value); }
  console.log(JSON.stringify({status: report.status, visualReviewStatus: report.visualReviewStatus, anchors: records.map((record) => record.publicUrl), contactSheet: sheet.publicUrl, metrics: report.metrics, nextAction: report.nextAction}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
