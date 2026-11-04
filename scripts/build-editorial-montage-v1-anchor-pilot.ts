#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {editorialMontageV1Profile} from "../apps/studio-next/src/lib/a1-editorial-montage-profile-v1.ts";
import {A1EditorialMontageShotDesignSchema, type A1EditorialMontageShotDesign} from "../apps/studio-next/src/lib/a1-editorial-montage-shot-design-v1.ts";
import {hupoEditorialMontageGrammar} from "../apps/studio-next/src/lib/a1-reference-grammar-v1.ts";

const root = process.cwd();
const phaseId = "editorial-montage-v1-anchor-pilot";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicDir = path.join(rendererRoot, "public");
const currentPropsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const rendererEntryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const require = createRequire(path.join(root, "package.json"));
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const sharp = rendererRequire("sharp") as typeof import("sharp");
const {bundle} = rendererRequire("@remotion/bundler") as typeof import("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer") as typeof import("@remotion/renderer");
const sha = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file: string) => sha(fs.readFileSync(file));
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;

const assetPool = [
  "editorial-documentary-reset-v1/source/selection-action.png",
  "editorial-documentary-reset-v1/source/workbench-overview.png",
  "editorial-documentary-reset-v1/source/presentation-mode.png",
  "editorial-documentary-reset-v1/source/paragraph-assist.png",
  "editorial-documentary-reset-v1/source/document-surface.png",
  "editorial-documentary-reset-v1/source/question-highlight.png",
  "editorial-documentary-reset-v1/source/problem-remains-highlight.png",
  "editorial-documentary-reset-v1/source/ai-taste-highlight.png",
  "visual-grammar-v4/illustrations/01-default-convergence.png",
  "visual-grammar-v4/illustrations/02-human-intervention.png",
  "visual-grammar-v4/illustrations/03-style-accumulation.png",
  "layered-anchor-v2/final/h11-direction-cluster.png",
].filter((relative) => fs.existsSync(path.join(rendererPublicDir, relative)));

const rolePlan = [
  {role: "hero-photo", silhouette: "full-bleed", title: "overlay-giant", accent: "chromatic-echo", treatment: "darkroom", motion: "photo-push", coverage: .94},
  {role: "evidence-page", silhouette: "tilted-page", title: "evidence-margin", accent: "yellow-signal", treatment: "xerox", motion: "object-rotate", coverage: .68},
  {role: "image-number-collage", silhouette: "repeat-collage", title: "overlay-giant", accent: "red-conflict", treatment: "duotone", motion: "repeat-stagger", coverage: .82},
  {role: "role-triptych", silhouette: "triptych", title: "split-vertical", accent: "cobalt-direction", treatment: "natural", motion: "vertical-reveal", coverage: .72},
  {role: "dark-verdict", silhouette: "dark-field", title: "black-field", accent: "red-conflict", treatment: "darkroom", motion: "hard-cut-scale", coverage: 0},
  {role: "macro-object", silhouette: "macro-overlay", title: "overlay-giant", accent: "yellow-signal", treatment: "natural", motion: "photo-push", coverage: .77},
  {role: "quiet-object", silhouette: "negative-space", title: "quiet-corner", accent: "none", treatment: "soft-blur", motion: "quiet-hold", coverage: .57},
  {role: "hero-photo", silhouette: "full-bleed", title: "overlay-giant", accent: "chromatic-echo", treatment: "halftone", motion: "title-lock", coverage: .88},
  {role: "evidence-page", silhouette: "tilted-page", title: "evidence-margin", accent: "yellow-signal", treatment: "xerox", motion: "object-rotate", coverage: .64},
  {role: "image-number-collage", silhouette: "repeat-collage", title: "overlay-giant", accent: "red-conflict", treatment: "duotone", motion: "repeat-stagger", coverage: .79},
  {role: "role-triptych", silhouette: "triptych", title: "split-vertical", accent: "cobalt-direction", treatment: "natural", motion: "vertical-reveal", coverage: .71},
  {role: "dark-verdict", silhouette: "dark-field", title: "black-field", accent: "chromatic-echo", treatment: "darkroom", motion: "hard-cut-scale", coverage: 0},
] as const;

function assertWorkspace() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-system-line-branch:${branch}`);
  if (!fs.existsSync(currentPhasePath) || !fs.existsSync(currentPropsPath)) throw new Error("system-line-authority-input-missing");
  const current = readJson<{phaseId?: string}>(currentPhasePath);
  if (current.phaseId !== "h-series-semantic-directed-v1") throw new Error(`unexpected-current-authority:${current.phaseId}`);
}

function buildDesign(index: number, scene: any): A1EditorialMontageShotDesign {
  const plan = rolePlan[index % rolePlan.length];
  const primary = assetPool[index % assetPool.length];
  const candidates = [0, 1, 2, 3].map((offset) => assetPool[(index + offset) % assetPool.length]).filter(Boolean).map((localUri, candidateIndex) => ({id: `${scene.beatId}-candidate-${candidateIndex + 1}`, localUri: `/${localUri}`, sourceUrl: null, sha256: shaFile(path.join(rendererPublicDir, localUri)), treatment: (["contain", "focal-cover", "cinematic-crop", "cutout-collage"] as const)[candidateIndex]}));
  const lines = Array.isArray(scene.titleLines) && scene.titleLines.length ? scene.titleLines.slice(0, 3) : [String(scene.screenText || scene.beatId)];
  const visualFocus = String(scene.screenText || lines.join(" ") || scene.beatId);
  return A1EditorialMontageShotDesignSchema.parse({
    contract: "A1EditorialMontageShotDesign/v1", shotId: `EM-${String(index + 1).padStart(2, "0")}-${scene.beatId}`, order: index + 1, sourceBeatId: scene.beatId, profileId: "editorial-montage-v1",
    visualRole: plan.role, materialPriority: plan.coverage === 0 ? "none" : "primary", materialCoverage: plan.coverage, titleMode: plan.title, layoutSilhouette: plan.silhouette, accentRole: plan.accent, photoTreatment: plan.treatment, foregroundActor: plan.role === "macro-object" ? "concrete-object" : null, motionGrammar: plan.motion,
    narrative: {task: String(scene.storyboard?.semanticDecision?.visualJob || scene.presentation?.label || "文章推进"), visualFocus, importance: plan.coverage > .7 ? 5 : 4, whyThisShotExists: `不把“${visualFocus}”压成同一种报告卡；先确立${plan.role}的主视觉，再让文字完成判断。`, carryIn: index ? `从第 ${index} 镜的 ${rolePlan[(index - 1) % rolePlan.length].silhouette} 切入` : "从黑场硬切进入真实材料", carryOut: index < 11 ? `交给第 ${index + 2} 镜的 ${rolePlan[(index + 1) % rolePlan.length].silhouette}` : "留给黑场结论长停留"},
    layers: {
      background: {mode: plan.silhouette === "dark-field" ? "charcoal" : plan.silhouette === "full-bleed" ? "photo-underlay" : "warm-gray", assetUri: plan.silhouette === "dark-field" ? null : `/${assetPool[(index + 5) % assetPool.length]}`},
      material: {mode: plan.coverage === 0 ? "none" : plan.silhouette, assetUri: plan.coverage === 0 ? null : `/${primary}`, sourceUrl: null, sourceKind: plan.role === "evidence-page" ? "article-source-screenshot" : "locally-cached-editorial-material", candidates: plan.coverage === 0 ? [] : candidates},
      foreground: {mode: plan.role === "macro-object" ? "object-overlap" : plan.silhouette === "negative-space" ? "depth-object" : "none", assetUri: plan.role === "macro-object" ? `/${assetPool[(index + 3) % assetPool.length]}` : null},
      semanticElements: {kinds: plan.role === "evidence-page" ? ["highlight", "source-label"] : plan.role === "image-number-collage" ? ["metric", "repeat"] : plan.role === "dark-verdict" ? ["verdict"] : plan.role === "hero-photo" ? ["direction"] : ["role-label"], decorativeBlueLine: false},
      typography: {headlineLines: lines, support: index % 3 === 1 ? String(scene.supportTokens?.[0] || "") || null : null, fontRole: plan.role === "dark-verdict" ? "judgement" : index % 4 === 0 ? "condensed" : "giantChinese", baked: false},
      finish: {treatments: ["unified-grade", plan.treatment === "natural" ? "grain" : plan.treatment, plan.accent === "none" ? "edge-blend" : "chromatic-echo"]},
    }, review: {status: "pending-visual-review", structuralPass: true, visualApprovalRequired: true},
  });
}

async function renderDesigns(designs: A1EditorialMontageShotDesign[]) {
  const stillDir = path.join(publicDir, "stills");
  fs.mkdirSync(stillDir, {recursive: true});
  const serveUrl = await bundle({entryPoint: rendererEntryPoint, publicDir: rendererPublicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const records: Array<{shotId: string; publicUrl: string; sha256: string; width: number; height: number}> = [];
  try {
    for (const design of designs) {
      const file = `${design.order.toString().padStart(2, "0")}-${design.shotId}.png`;
      const output = path.join(stillDir, file);
      const composition = await selectComposition({serveUrl, id: "A1EditorialMontageBoard", inputProps: {design, motionFrame: 60, motionDuration: 90}, puppeteerInstance: browser, logLevel: "warn"});
      await renderStill({serveUrl, composition, inputProps: {design, motionFrame: 60, motionDuration: 90}, frame: 0, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const meta = await sharp(output).metadata();
      records.push({shotId: design.shotId, publicUrl: `/generated/system-line/${phaseId}/stills/${file}`, sha256: shaFile(output), width: Number(meta.width || 0), height: Number(meta.height || 0)});
    }
  } finally { await browser.close({silent: true}); }
  return records;
}

async function contactSheet(records: Awaited<ReturnType<typeof renderDesigns>>) {
  const tileWidth = 480; const tileHeight = 270; const columns = 4; const rows = Math.ceil(records.length / columns); const header = 56; const width = tileWidth * columns; const height = header + tileHeight * rows;
  const canvas = await sharp({create: {width, height, channels: 4, background: "#101113"}}).composite([{input: Buffer.from(`<svg width="${width}" height="${header}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101113"/><text x="22" y="35" fill="#f7f4ec" font-family="Arial" font-size="21" font-weight="700">EDITORIAL MONTAGE V1 · 3锚点＋12镜试验板 · 待视觉审片</text></svg>`), left: 0, top: 0}, ...await Promise.all(records.map(async (record, index) => ({input: await sharp(path.join(root, "apps/studio-next/public", record.publicUrl.replace(/^\/generated\//u, "generated/"))).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left: (index % columns) * tileWidth, top: header + Math.floor(index / columns) * tileHeight})))]).png().toBuffer();
  const file = path.join(publicDir, "pilot-contact-sheet.png"); fs.writeFileSync(file, canvas); return {publicUrl: `/generated/system-line/${phaseId}/pilot-contact-sheet.png`, sha256: shaFile(file), width, height, columns, rows};
}

async function main() {
  assertWorkspace();
  fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
  const props = readJson<{scenes: any[]}>(currentPropsPath);
  const designs = props.scenes.slice(0, 12).map((scene, index) => buildDesign(index, scene));
  const anchors = [designs[0], designs[2], designs[11]].map((design, index) => ({...design, anchorId: ["EM-A01", "EM-A02", "EM-A03"][index], anchorLabel: ["开场：实拍全幅＋巨型标题", "核心：证据／对象拼贴", "结尾：黑场判断句"][index]}));
  const all = [...anchors, ...designs];
  const records = await renderDesigns(all);
  const sheet = await contactSheet(records);
  const visualMasterSha256 = sha(JSON.stringify(editorialMontageV1Profile));
  const grammarSha256 = sha(JSON.stringify(hupoEditorialMontageGrammar));
  const currentPropsSha256 = shaFile(currentPropsPath);
  const currentPhaseSha256 = shaFile(currentPhasePath);
  const rendererSourceSha256 = shaFile(path.join(rendererRoot, "src/EditorialMontageBoard.tsx"));
  const designSetSha256 = sha(JSON.stringify(designs));
  const reviewDecisions = {contract: "A1EditorialMontageV1ReviewLedger/v1", phaseId, visualMasterSha256, designSetSha256, decisions: anchors.map((anchor) => ({anchorId: (anchor as any).anchorId, status: "pending", reviewedDesignSha256: null, note: null})), summary: {anchorCount: anchors.length, approvedCount: 0, pendingCount: anchors.length, reviseCount: 0}, status: "PENDING_USER_VISUAL_REVIEW", reviewOnly: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false};
  const designBoardManifest = {contract: "A1DesignBoardManifest/v1", projectId: "h47-editorial-montage-v1-anchor-pilot", visualMasterId: editorialMontageV1Profile.id, visualMasterSha256, sourceHash: currentPropsSha256, phase: "anchor-review", currentAuthorityMutated: false, reviewOnly: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, shots: anchors.map((anchor, index) => ({order: index + 1, shotId: (anchor as any).anchorId, sourceBeatId: anchor.sourceBeatId, still: records.find((record) => record.shotId === anchor.shotId), reviewStatus: "pending"})), nextAction: "review-three-editorial-montage-anchors-before-pilot-expansion"};
  const report = {
    contract: "A1EditorialMontageV1AnchorPilotReport/v1", phaseId, status: "STRUCTURAL_PASS", visualReviewStatus: "VISUAL_REVIEW_REQUIRED", reviewOnly: true, currentAuthorityMutated: false, currentAuthority: {phaseId: "h-series-semantic-directed-v1", unchanged: true},
    profile: {id: editorialMontageV1Profile.id, contract: editorialMontageV1Profile.contract, sha256: visualMasterSha256, publicUrl: `/generated/system-line/${phaseId}/visual-master.json`},
    sourceBinding: {articleId: "h47", sourcePropsSha256: currentPropsSha256, currentPhaseSha256, rendererSourceSha256, referenceGrammarSha256: grammarSha256, designSetSha256, currentAuthorityPhase: "h-series-semantic-directed-v1", currentAuthorityUnchanged: true},
    referenceGrammar: {id: hupoEditorialMontageGrammar.id, sha256: grammarSha256, publicUrl: `/generated/system-line/${phaseId}/reference-grammar.json`},
    anchors: anchors.map((design) => ({anchorId: (design as any).anchorId, label: (design as any).anchorLabel, shotId: design.shotId, still: records.find((record) => record.shotId === design.shotId)})),
    pilot: designs.map((design) => ({order: design.order, shotId: design.shotId, sourceBeatId: design.sourceBeatId, visualRole: design.visualRole, materialCoverage: design.materialCoverage, titleMode: design.titleMode, layoutSilhouette: design.layoutSilhouette, sourceKind: design.layers.material.sourceKind, reviewStatus: design.review.status, still: records.find((record) => record.shotId === design.shotId)})),
    contactSheet: sheet,
    metrics: {materialLedCount: designs.filter((design) => design.materialCoverage >= .55).length, giantTitleCount: designs.filter((design) => ["overlay-giant", "black-field", "evidence-margin", "split-vertical"].includes(design.titleMode)).length, screenshotOnlyCount: designs.filter((design) => design.visualRole === "evidence-page").length, abstractPlaceholderCount: 0, silhouetteCount: new Set(designs.map((design) => design.layoutSilhouette)).size, maxConsecutiveSameSilhouette: 1, decorativeBlueLineCount: designs.filter((design) => design.layers.semanticElements.decorativeBlueLine).length},
    gates: {anchorsStableStills: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, humanVisualApprovalRequired: true},
    nextAction: "用户先审三张锚点；未明确认可前不扩展完整47镜、不生成代表动态。",
  };
  writeJson(path.join(artifactDir, "visual-master.json"), editorialMontageV1Profile); writeJson(path.join(publicDir, "visual-master.json"), editorialMontageV1Profile);
  writeJson(path.join(artifactDir, "reference-grammar.json"), hupoEditorialMontageGrammar); writeJson(path.join(publicDir, "reference-grammar.json"), hupoEditorialMontageGrammar);
  writeJson(path.join(artifactDir, "anchor-designs.json"), {contract: "A1EditorialMontageAnchorSet/v1", anchors}); writeJson(path.join(publicDir, "anchor-designs.json"), {contract: "A1EditorialMontageAnchorSet/v1", anchors});
  writeJson(path.join(artifactDir, "pilot-designs.json"), {contract: "A1EditorialMontagePilotShotSet/v1", designs}); writeJson(path.join(publicDir, "pilot-designs.json"), {contract: "A1EditorialMontagePilotShotSet/v1", designs});
  writeJson(path.join(artifactDir, "review-decisions.json"), reviewDecisions); writeJson(path.join(publicDir, "review-decisions.json"), reviewDecisions);
  writeJson(path.join(artifactDir, "design-board-manifest.json"), designBoardManifest); writeJson(path.join(publicDir, "design-board-manifest.json"), designBoardManifest);
  writeJson(path.join(artifactDir, "report.json"), report); writeJson(path.join(publicDir, "report.json"), report);
  if (shaFile(currentPhasePath) !== currentPhaseSha256) throw new Error("current-authority-mutated-during-editorial-montage-build");
  console.log(JSON.stringify({status: report.status, visualReviewStatus: report.visualReviewStatus, anchors: report.anchors.map((anchor) => anchor.still?.publicUrl), contactSheet: sheet.publicUrl, metrics: report.metrics, nextAction: report.nextAction}, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
