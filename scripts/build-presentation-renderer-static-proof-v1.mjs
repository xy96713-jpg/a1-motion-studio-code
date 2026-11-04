#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_PRESENTATION_PROOF_SHOT_IDS, A1_PRESENTATION_RENDERER_PROOF_CONTRACT} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const appPublic = path.join(appRoot, "public");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublic = path.join(rendererRoot, "public");
const rendererEntry = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const phase = "generated/system-line/editorial-asset-workbench-v1/presentation-renderer-proof-v1";
const publicDir = path.join(appPublic, phase);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/presentation-renderer-proof-v1");
const requireFromRenderer = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = requireFromRenderer("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = requireFromRenderer("@remotion/renderer");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256Json = (value) => sha256(JSON.stringify(value));
const publicFile = (url) => path.join(appPublic, String(url || "").replace(/^\/+/, ""));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };
const copyToPublic = (source, url) => { const target = publicFile(url); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.copyFileSync(source, target); };
const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const executorLayout = {
  "object-bound-presenter-type": {layoutSilhouette: "negative-space", background: "paper"},
  "source-bound-annotation": {layoutSilhouette: "macro-overlay", background: "paper"},
  "type-gesture-verdict": {layoutSilhouette: "dark-field", background: "black"},
  "evidence-package-full-bleed": {layoutSilhouette: "full-bleed", background: "black"},
  "quiet-presenter": {layoutSilhouette: "quiet-field", background: "paper"},
  "semantic-object-package": {layoutSilhouette: "repeat-collage", background: "warm"},
};

function candidateFor(asset) {
  const candidate = asset.candidates?.find((item) => item.preview?.publicUrl && !item.screening?.hardFailures?.length) || asset.candidates?.find((item) => item.preview?.publicUrl);
  if (!candidate?.preview?.publicUrl) throw new Error(`presentation-proof-candidate-missing:${asset.shotDemand.shotId}`);
  if (!fs.existsSync(publicFile(candidate.preview.publicUrl))) throw new Error(`presentation-proof-candidate-file-missing:${asset.shotDemand.shotId}`);
  return candidate;
}

function designFor(workspace, shotId) {
  const asset = workspace.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === shotId);
  const decision = workspace.production.presentationDecisions.items.find((item) => item.shotId === shotId);
  if (!asset || !decision) throw new Error(`presentation-proof-shot-missing:${shotId}`);
  const candidate = shotId === "ED-03" ? null : shotId === "ED-32" ? null : candidateFor(asset);
  const assignment = candidate?.sceneGraph?.typography?.assignment;
  const headline = String(assignment?.headlineText || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const sourceFrame = asset.shotDemand?.sourceSegmentEvidence?.framePublicUrl || null;
  const sourceBlocked = shotId === "ED-03";
  const sourceReady = shotId === "ED-32" && sourceFrame && fs.existsSync(publicFile(sourceFrame));
  if (sourceBlocked) {
    // ED-03 remains explicitly blocked; its historical candidate is never
    // promoted into this proof as a substitute for the missing real trace.
  } else if (!candidate && !sourceReady) throw new Error(`presentation-proof-source-missing:${shotId}`);
  const layout = executorLayout[decision.rendererExecutor];
  if (!layout) throw new Error(`presentation-proof-executor-unmapped:${shotId}:${decision.rendererExecutor}`);
  return {
    shotId,
    order: decision.order,
    sourceBeatId: asset.shotDemand.cueId || null,
    visualRole: asset.shotDemand.visualJob || asset.shotDemand.sourceText,
    materialPriority: decision.informationOwner === "typography" ? "none" : "primary",
    materialCoverage: decision.frameOccupation === "full-bleed" ? .86 : .7,
    titleMode: decision.typographyDuty === "verdict-actor" ? "black-field" : decision.typographyDuty === "none" ? "quiet-corner" : "editorial-proof",
    layoutSilhouette: layout.layoutSilhouette,
    accentRole: decision.rendererExecutor === "type-gesture-verdict" ? "red-conflict" : decision.rendererExecutor === "object-bound-presenter-type" ? "cobalt-direction" : "yellow-signal",
    photoTreatment: decision.informationOwner === "presenter" ? "soft-blur" : "duotone",
    foregroundActor: asset.shotDemand.primaryActor || null,
    motionGrammar: asset.shotDemand.motionPhrase || decision.rhythmFunction,
    rendererExecutor: decision.rendererExecutor,
    informationOwner: decision.informationOwner,
    frameOccupation: decision.frameOccupation,
    typographyDuty: decision.typographyDuty,
    sourceStatus: sourceBlocked ? "source-blocked" : sourceReady ? "source-ready" : "creative-assist",
    sourceLabel: sourceBlocked ? "SOURCE BLOCKED · ED-03" : sourceReady ? "REAL PRESENTER SOURCE · ED-32" : `${decision.informationOwner} · ${decision.frameOccupation}`,
    proofNote: sourceBlocked ? "同一句正文的选择→原生喜欢/讨厌→真实风格库连续链尚未注册。" : sourceReady ? "已绑定 presenter-ch09-limitations-take；不生成真人替代。" : "使用已有候选静帧作为现有组合输入；不生成新素材。",
    narrative: {visualFocus: headline[0] || asset.shotDemand.primaryActor || asset.shotDemand.sourceText, carryIn: asset.shotDemand.sourceText, carryOut: decision.rhythmFunction},
    layers: {
      background: {assetUri: null, mode: layout.background},
      material: {assetUri: sourceReady ? sourceFrame : candidate?.preview?.publicUrl || null, mode: sourceBlocked ? "source-blocked" : "existing-proof-input", candidates: candidate ? [{localUri: candidate.preview.publicUrl, treatment: "existing"}] : [], focalPoint: null},
      foreground: {assetUri: null, mode: "deterministic-geometry"},
      semanticElements: {kinds: decision.rendererExecutor === "semantic-object-package" ? ["direction"] : [], decorativeBlueLine: false},
      typography: {headlineLines: headline.length ? headline : [asset.shotDemand.primaryActor || asset.shotDemand.sourceText.slice(0, 16)], support: sourceBlocked ? "真实素材门禁" : null, fontRole: decision.typographyDuty === "verdict-actor" ? "judgement" : "condensed"},
      finish: {treatments: ["deterministic-presentation-proof", "editable-text"]},
    },
  };
}

async function renderProof(designs) {
  fs.mkdirSync(publicDir, {recursive: true});
  fs.mkdirSync(artifactDir, {recursive: true});
  // The renderer owns the font pack. Copy only the six already-registered
  // proof inputs into a namespaced static path; no new visual asset is made.
  for (const design of designs) {
    const sourceUrl = design.layers.material.assetUri;
    if (!sourceUrl) continue;
    const source = publicFile(sourceUrl);
    if (!fs.existsSync(source)) throw new Error(`presentation-proof-input-missing:${design.shotId}`);
    const inputRelative = `generated/system-line/editorial-asset-workbench-v1/presentation-renderer-proof-v1-input/${design.shotId}.png`;
    const input = path.join(rendererPublic, inputRelative);
    fs.mkdirSync(path.dirname(input), {recursive: true});
    fs.copyFileSync(source, input);
    design.layers.material.assetUri = `/${inputRelative}`;
  }
  const serveUrl = await bundle({entryPoint: rendererEntry, publicDir: rendererPublic, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const stills = [];
  try {
    for (const design of designs) {
      const fileName = `${String(design.order).padStart(2, "0")}-${design.shotId}.png`;
      const artifactPath = path.join(artifactDir, fileName);
      const composition = await selectComposition({serveUrl, id: "A1EditorialMontageBoard", inputProps: {design}, puppeteerInstance: browser, logLevel: "warn"});
      await renderStill({serveUrl, composition, inputProps: {design}, frame: 0, output: artifactPath, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/presentation-renderer-proof-v1/${fileName}`;
      copyToPublic(artifactPath, publicUrl);
      stills.push({shotId: design.shotId, order: design.order, publicUrl, artifactPath, sha256: sha256(fs.readFileSync(artifactPath)), rendererExecutor: design.rendererExecutor, sourceStatus: design.sourceStatus});
    }
  } finally {
    await browser.close({silent: true});
  }
  const tileWidth = 640;
  const imageHeight = 360;
  const labelHeight = 82;
  const columns = 3;
  const rows = Math.ceil(stills.length / columns);
  const tiles = await Promise.all(stills.map(async (item) => {
    const image = await sharp(item.artifactPath).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101113"/><text x="18" y="27" fill="#f7f4ec" font-family="Arial, PingFang SC, sans-serif" font-size="20" font-weight="700">${escapeXml(item.shotId)} · ${escapeXml(item.rendererExecutor)}</text><text x="18" y="57" fill="${item.sourceStatus === "source-blocked" ? "#ffb3aa" : "#c9ef39"}" font-family="Arial, PingFang SC, sans-serif" font-size="16">${escapeXml(item.sourceStatus)} · static proof only</text></svg>`);
    return sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 4, background: "#101113"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  }));
  const contactArtifact = path.join(artifactDir, "six-shot-contact-sheet.png");
  await sharp({create: {width: columns * tileWidth, height: rows * (imageHeight + labelHeight), channels: 4, background: "#101113"}}).composite(tiles.map((input, index) => ({input, left: index % columns * tileWidth, top: Math.floor(index / columns) * (imageHeight + labelHeight)}))).png().toFile(contactArtifact);
  const contactUrl = "/generated/system-line/editorial-asset-workbench-v1/presentation-renderer-proof-v1/six-shot-contact-sheet.png";
  copyToPublic(contactArtifact, contactUrl);
  return {stills, contactArtifact, contactUrl, contactSha256: sha256(fs.readFileSync(contactArtifact))};
}

async function main() {
  const now = new Date().toISOString();
  // Rendering writes only namespaced public/artifact files and can take minutes.
  // Keep the project lock for the short read/attach/persist phases, rather than
  // releasing it while an async render is in flight.
  const current = withProjectLock(appRoot, () => assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("presentation-proof-requires-empty-generation-queue");
  const decisions = current.production.presentationDecisions;
  const manifest = current.production.materialManifestV2;
  const allDecisionExecutors = decisions.items.map((item) => item.rendererExecutor);
  if (allDecisionExecutors.length !== current.article.shotCount || allDecisionExecutors.some((executor) => !Object.hasOwn(executorLayout, executor))) throw new Error("presentation-proof-34-shot-executor-coverage-invalid");
  const designs = A1_PRESENTATION_PROOF_SHOT_IDS.map((shotId) => designFor(current, shotId));
  const rendered = await renderProof(designs);
  const result = withProjectLock(appRoot, () => {
    const latest = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (latest.workspaceSha256 !== current.workspaceSha256) throw new Error("presentation-proof-workspace-changed-during-render");
    const proof = {
      contract: A1_PRESENTATION_RENDERER_PROOF_CONTRACT,
      status: "READY_FOR_REVIEW",
      staticOnly: true,
      generationPerformed: false,
      criticPerformed: false,
      fullFilmRenderPerformed: false,
      shotIds: A1_PRESENTATION_PROOF_SHOT_IDS,
      rendererExecutorCoverage: {mappedShotCount: allDecisionExecutors.length, totalShotCount: latest.article.shotCount, genericFallbackCount: 0, executorIds: [...new Set(allDecisionExecutors)]},
      sourceWorkspaceSha256: latest.workspaceSha256,
      decisionSha256: latest.production.presentationDecisions.sha256,
      manifestSha256: latest.production.materialManifestV2.sha256,
      publicUrl: "/generated/system-line/editorial-asset-workbench-v1/presentation-renderer-proof-v1/report.json",
      contactSheetPublicUrl: rendered.contactUrl,
      contactSheetSha256: rendered.contactSha256,
      stills: rendered.stills.map(({artifactPath, ...item}) => item),
      generatedAt: now,
    };
    let next = structuredClone(latest);
    next.production.presentationRendererProof = proof;
    next = recalculateEditorialAssetWorkbench(next, now);
    const event = createProductionEvent({workspace: latest, action: "build-presentation-renderer-static-proof", targetId: proof.contract, payload: {shotIds: proof.shotIds, rendererExecutorCoverage: proof.rendererExecutorCoverage, generatedImages: false, criticPerformed: false, fullFilmRenderPerformed: false}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const report = {...proof, workspaceSha256: next.workspaceSha256, authorityNextAction: next.production.authority.nextAction, queue: next.production.generation.summary};
    persistProjectState(appRoot, next, {event, files: {"presentation-renderer-proof-v1/report.json": report}});
    return report;
  });
  console.log(JSON.stringify({contract: result.contract, status: result.status, workspaceSha256: result.workspaceSha256, contactSheetPublicUrl: result.contactSheetPublicUrl, shotIds: result.shotIds, rendererExecutorCoverage: result.rendererExecutorCoverage, authorityNextAction: result.authorityNextAction, queue: result.queue}, null, 2));
}

await main();
