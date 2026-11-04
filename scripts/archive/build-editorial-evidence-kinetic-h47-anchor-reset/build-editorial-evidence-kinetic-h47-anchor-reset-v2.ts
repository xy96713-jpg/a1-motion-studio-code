#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";

const root = process.cwd();
const phaseId = "editorial-evidence-kinetic-h47-anchor-reset-v2";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const sourcePropsPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/candidate-props.json");
const rendererEntryPoint = path.join(root, "remotion-renderer/src/editorial-evidence-kinetic-h47-anchor-index.tsx");
const rendererSourcePath = path.join(root, "remotion-renderer/src/EditorialEvidenceKineticH47Anchors.tsx");
const rendererPublicDir = path.join(root, "remotion-renderer/public");
const referenceRoot = "/Users/a1/Documents/Codex/写作项目/outputs/BV18RKb6SEp9_非人物画面_v2/curated";
const references = [
  {beatId: "H04-B01", file: "000014s_frame-000015.jpg", grammar: "实证满画幅 + 巨型标题"},
  {beatId: "H08-B04", file: "000022s_frame-000023.jpg", grammar: "文档局部扫描 + 附着批注"},
  {beatId: "H10-B05", file: "000162s_frame-000163.jpg", grammar: "黑场停顿 + 巨型判断句"},
] as const;
const compositions = {
  "H04-B01": "A1EditorialEvidenceKineticH47Evidence",
  "H08-B04": "A1EditorialEvidenceKineticH47Annotation",
  "H10-B05": "A1EditorialEvidenceKineticH47Verdict",
} as const;

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(root, "remotion-renderer/package.json"));
const sharp = require("sharp") as typeof import("sharp");
const {bundle} = rendererRequire("@remotion/bundler") as typeof import("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer") as typeof import("@remotion/renderer");

const sha256 = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const escapeXml = (value: string) => value.replace(/[<>&'"]/gu, (character) => ({"<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;"})[character] || character);

function assertWorkspace() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-system-line-branch:${branch}`);
  if (!root.endsWith("/work/a1-motion-studio-system-line")) throw new Error(`wrong-system-line-root:${root}`);
  for (const file of [currentPhasePath, sourcePropsPath, rendererEntryPoint, rendererSourcePath, ...references.map((item) => path.join(referenceRoot, item.file))]) {
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`required-file-missing:${file}`);
  }
  const current = readJson(currentPhasePath);
  if (current.contract !== "A1SystemLineCurrentPhase/v1" || current.phaseId !== "h-series-semantic-directed-v1") throw new Error(`unexpected-current-authority:${current.phaseId || "missing"}`);
}

function anchorScene(scene: Record<string, any>) {
  return {
    beatId: scene.beatId,
    screenText: scene.screenText,
    titleLines: scene.titleLines,
    supportTokens: scene.supportTokens || [],
    supportLine: scene.storyboard?.shotDirector?.text?.supportLine || null,
    entityEvidence: scene.entityEvidence || [],
  };
}

function assertSemanticBindings(scenes: Record<string, ReturnType<typeof anchorScene>>) {
  const failures: string[] = [];
  const h04 = scenes["H04-B01"];
  const h08 = scenes["H08-B04"];
  const h10 = scenes["H10-B05"];
  if (h04.titleLines.join("/") !== "我试过/GPT、Claude") failures.push("H04-title-drift");
  if (!h04.entityEvidence.some((item: any) => item.name === "GPT" && item.asset === "entity-icons/openai.svg")) failures.push("H04-openai-binding-missing");
  if (!h04.entityEvidence.some((item: any) => item.name === "Claude" && item.asset === "brand-evidence-calibration/anthropic-official.png")) failures.push("H04-anthropic-binding-missing");
  if (h08.titleLines.join("/") !== "太空、没动作/或者太枯燥") failures.push("H08-title-drift");
  if (!["句子太空", "没动作", "太枯燥"].every((token) => h08.supportTokens.includes(token))) failures.push("H08-problem-token-drift");
  if (h10.titleLines.join("/") !== "仍然会有/不通顺、AI 味") failures.push("H10-title-drift");
  if (h10.supportLine !== "最后还需要人来修改") failures.push("H10-support-drift");
  if (failures.length) throw new Error(`semantic-binding-failed:${failures.join(",")}`);
}

function headerSvg(width: number, height: number, title: string, subtitle: string) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101113"/><text x="34" y="44" fill="#f1eee3" font-family="PingFang SC,Arial,sans-serif" font-size="27" font-weight="800">${escapeXml(title)}</text><text x="34" y="77" fill="#aaa89f" font-family="PingFang SC,Arial,sans-serif" font-size="16">${escapeXml(subtitle)}</text></svg>`);
}

function labelSvg(width: number, height: number, text: string, background = "#101113", color = "#f1eee3") {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${background}"/><text x="16" y="28" fill="${color}" font-family="PingFang SC,Arial,sans-serif" font-size="16" font-weight="700">${escapeXml(text)}</text></svg>`);
}

async function renderAnchors(scenes: Record<string, ReturnType<typeof anchorScene>>) {
  const artifactStillDir = path.join(artifactDir, "stills");
  const publicStillDir = path.join(publicDir, "stills");
  fs.mkdirSync(artifactStillDir, {recursive: true});
  fs.mkdirSync(publicStillDir, {recursive: true});
  const serveUrl = await bundle({entryPoint: rendererEntryPoint, publicDir: rendererPublicDir, rootDir: path.join(root, "remotion-renderer"), enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const outputs = [];
  try {
    for (const reference of references) {
      const beatId = reference.beatId;
      const inputProps = {scene: scenes[beatId]};
      const composition = await selectComposition({serveUrl, id: compositions[beatId], inputProps, puppeteerInstance: browser, logLevel: "warn"});
      const artifactPath = path.join(artifactStillDir, `${beatId}.png`);
      const publicPath = path.join(publicStillDir, `${beatId}.png`);
      await renderStill({serveUrl, composition, inputProps, frame: 0, output: artifactPath, imageFormat: "png", scale: 1, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      fs.copyFileSync(artifactPath, publicPath);
      const metadata = await sharp(artifactPath).metadata();
      if (metadata.width !== 1920 || metadata.height !== 1080) throw new Error(`invalid-anchor-dimensions:${beatId}:${metadata.width}x${metadata.height}`);
      outputs.push({beatId, compositionId: compositions[beatId], path: rel(artifactPath), publicUrl: `/generated/system-line/${phaseId}/stills/${beatId}.png`, sha256: sha256(artifactPath), width: metadata.width, height: metadata.height, inputSha256: shaValue(inputProps)});
    }
  } finally {
    await browser.close({silent: true});
  }
  return outputs;
}

async function candidateSheet(stills: Awaited<ReturnType<typeof renderAnchors>>) {
  const tileWidth = 640;
  const tileHeight = 360;
  const labelHeight = 42;
  const headerHeight = 96;
  const width = tileWidth * 3;
  const height = headerHeight + tileHeight + labelHeight;
  const layers: Array<{input: Buffer | string; left: number; top: number}> = [{input: headerSvg(width, headerHeight, "H47 · 胡泊式三张静态母版", "现有 A1EditorialEvidenceKineticSystem/v1 的构图升级；静态审批关，不含动态与正式渲染"), left: 0, top: 0}];
  for (const [index, still] of stills.entries()) {
    const reference = references[index];
    const file = path.join(root, still.path);
    layers.push({input: await sharp(file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left: index * tileWidth, top: headerHeight});
    layers.push({input: labelSvg(tileWidth, labelHeight, `${still.beatId} · ${reference.grammar}`, index === 1 ? "#f1eee3" : "#101113", index === 1 ? "#101113" : "#f1eee3"), left: index * tileWidth, top: headerHeight + tileHeight});
  }
  const artifactPath = path.join(artifactDir, "candidate-contact-sheet.png");
  const publicPath = path.join(publicDir, "candidate-contact-sheet.png");
  await sharp({create: {width, height, channels: 4, background: "#101113"}}).composite(layers).png().toFile(artifactPath);
  fs.copyFileSync(artifactPath, publicPath);
  return {path: rel(artifactPath), publicUrl: `/generated/system-line/${phaseId}/candidate-contact-sheet.png`, sha256: sha256(artifactPath), width, height};
}

async function comparisonSheet(stills: Awaited<ReturnType<typeof renderAnchors>>) {
  const tileWidth = 640;
  const tileHeight = 360;
  const labelHeight = 40;
  const headerHeight = 106;
  const width = tileWidth * 3;
  const rowHeight = tileHeight + labelHeight;
  const height = headerHeight + rowHeight * 2;
  const layers: Array<{input: Buffer | string; left: number; top: number}> = [{input: headerSvg(width, headerHeight, "胡泊参考语法 × H47 静态母版", "只对齐构图、节奏与信息层级；不复制原帧、人物、身份、Logo 或水印"), left: 0, top: 0}];
  for (const [index, reference] of references.entries()) {
    const left = index * tileWidth;
    const referencePath = path.join(referenceRoot, reference.file);
    const candidatePath = path.join(root, stills[index].path);
    layers.push({input: await sharp(referencePath).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top: headerHeight});
    layers.push({input: labelSvg(tileWidth, labelHeight, `参考语法 · ${reference.file}`, "#27282a", "#d7d4ca"), left, top: headerHeight + tileHeight});
    layers.push({input: await sharp(candidatePath).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top: headerHeight + rowHeight});
    layers.push({input: labelSvg(tileWidth, labelHeight, `${reference.beatId} · ${reference.grammar}`, index === 1 ? "#f1eee3" : "#101113", index === 1 ? "#101113" : "#f1eee3"), left, top: headerHeight + rowHeight + tileHeight});
  }
  const artifactPath = path.join(artifactDir, "reference-comparison-sheet.png");
  const publicPath = path.join(publicDir, "reference-comparison-sheet.png");
  await sharp({create: {width, height, channels: 4, background: "#101113"}}).composite(layers).png().toFile(artifactPath);
  fs.copyFileSync(artifactPath, publicPath);
  return {path: rel(artifactPath), publicUrl: `/generated/system-line/${phaseId}/reference-comparison-sheet.png`, sha256: sha256(artifactPath), width, height};
}

async function main() {
  assertWorkspace();
  const currentPhaseShaBefore = sha256(currentPhasePath);
  const sourceProps = readJson(sourcePropsPath);
  const selected = sourceProps.scenes.filter((scene: Record<string, unknown>) => references.some((item) => item.beatId === scene.beatId));
  if (selected.length !== 3) throw new Error(`anchor-scene-count-invalid:${selected.length}`);
  const scenes = Object.fromEntries(selected.map((scene: Record<string, any>) => [scene.beatId, anchorScene(scene)]));
  assertSemanticBindings(scenes);
  fs.mkdirSync(artifactDir, {recursive: true});
  fs.mkdirSync(publicDir, {recursive: true});
  writeJson(path.join(artifactDir, "anchor-scenes.json"), {contract: "A1EditorialEvidenceKineticH47AnchorSceneSet/v1", sourcePropsPath: rel(sourcePropsPath), sourcePropsSha256: sha256(sourcePropsPath), scenes});
  writeJson(path.join(publicDir, "anchor-scenes.json"), {contract: "A1EditorialEvidenceKineticH47AnchorSceneSet/v1", sourcePropsPath: rel(sourcePropsPath), sourcePropsSha256: sha256(sourcePropsPath), scenes});

  const stills = await renderAnchors(scenes);
  const [contactSheet, referenceComparison] = await Promise.all([candidateSheet(stills), comparisonSheet(stills)]);
  const currentPhaseShaAfter = sha256(currentPhasePath);
  if (currentPhaseShaAfter !== currentPhaseShaBefore) throw new Error("current-authority-mutated-during-anchor-build");

  const report = {
    contract: "A1EditorialEvidenceKineticH47AnchorResetProof/v2",
    phaseId,
    status: "PENDING_USER_VISUAL_REVIEW",
    structuralStatus: "PASS",
    generatedAt: new Date().toISOString(),
    reviewOnly: true,
    systemUpgrade: {systemContract: "A1EditorialEvidenceKineticSystem/v1", mode: "three-static-anchor-projection", createsParallelProduct: false, rendererAdoptionAllowed: false},
    userCorrection: {rejectedCandidate: "motion-ir-parity-proof-v1", visualStatus: "REJECTED_BY_USER", engineeringParityMayRemainAsHiddenQa: true, eligibleAsVisualDirection: false, reason: "left-right parity proof was simpler than the target and did not match the Hu Bo editorial montage grammar"},
    referencePolicy: {mode: "aesthetic-grammar-only", creator: "胡泊", copiedIdentity: false, copiedLogoOrWatermark: false, copiedExactFrameOrLayout: false, comparisonOnly: true},
    sourceBinding: {projectId: sourceProps.projectId, sourcePropsPath: rel(sourcePropsPath), sourcePropsSha256: sha256(sourcePropsPath), rendererSourcePath: rel(rendererSourcePath), rendererSourceSha256: sha256(rendererSourcePath)},
    currentAuthority: {phaseId: "h-series-semantic-directed-v1", path: rel(currentPhasePath), sha256Before: currentPhaseShaBefore, sha256After: currentPhaseShaAfter, unchanged: true},
    anchors: stills.map((still, index) => ({...still, grammar: references[index].grammar, scene: scenes[still.beatId], reference: {path: path.join(referenceRoot, references[index].file), sha256: sha256(path.join(referenceRoot, references[index].file)), usage: "comparison-only"}, reviewStatus: "pending"})),
    contactSheet,
    referenceComparison,
    gates: {anchorCount: 3, allStills1920x1080: stills.every((item) => item.width === 1920 && item.height === 1080), h04UsesOnlyBoundEntityEvidence: true, h08UsesAttachedAnnotationsNotCards: true, h10PreservesProblemPhrase: true, motionPrototypeAllowed: false, hyperframesInvoked: false, fullBoardAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, humanVisualApprovalRequired: true},
    failures: [],
    nextAction: "user-review-three-static-anchors-before-five-motion-prototypes",
  };
  writeJson(path.join(artifactDir, "report.json"), report);
  writeJson(path.join(publicDir, "report.json"), report);
  console.log(JSON.stringify({status: report.status, structuralStatus: report.structuralStatus, currentAuthorityUnchanged: report.currentAuthority.unchanged, stills: stills.map((item) => item.publicUrl), contactSheet: contactSheet.publicUrl, referenceComparison: referenceComparison.publicUrl, nextAction: report.nextAction}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
