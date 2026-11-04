#!/usr/bin/env node
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench, selectedShotCandidateSetSha256} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditWholeFilmMediumRhythm} from "../apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts";
import {createProductionEvent, sceneGraphSourceDependencySha256, selectScreenEvidenceBeats} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const outputRelative = `${phaseRelative}/all-shot-selected-review-v1`;
const outputDir = path.join(publicRoot, outputRelative);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl || "").replace(/^\/+/, ""));
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

let workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
let shots = workspace.library.assets
  .filter((asset) => asset.route === "shot-composition" && asset.shotDemand)
  .sort((left, right) => left.shotDemand.order - right.shotDemand.order);
if (shots.length !== workspace.article.shotCount) throw new Error(`selected-contact-shot-count-invalid:${shots.length}`);

// Candidate state is durable, while preview PNGs are generated artifacts and
// may be removed by a cleanup or a fresh checkout. Rebuild only the missing
// selected-shot previews before assembling the global contact sheet so a
// recoverable artifact loss cannot block the whole unattended pipeline.
const missingSelectedShots = shots.filter((asset) => {
  const candidate = asset.candidates?.find((item) => item.candidateId === asset.selectedCandidateId);
  return Boolean(candidate?.preview?.publicUrl) && !fs.existsSync(publicFile(candidate.preview.publicUrl));
});
for (const asset of missingSelectedShots) {
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts/render-shot-scene-graph-candidates-v1.mjs"),
    `--shot=${asset.shotDemand.shotId}`,
  ], {cwd: root, env: process.env, stdio: "inherit"});
  if (result.status !== 0) throw new Error(`selected-candidate-rebuild-failed:${asset.shotDemand.shotId}`);
}
if (missingSelectedShots.length) {
  workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  shots = workspace.library.assets
    .filter((asset) => asset.route === "shot-composition" && asset.shotDemand)
    .sort((left, right) => left.shotDemand.order - right.shotDemand.order);
}

function geometryBucket(geometry = {}) {
  const centerX = Number(geometry.x || 0) + Number(geometry.width || 0) / 2;
  const centerY = Number(geometry.y || 0) + Number(geometry.height || 0) / 2;
  const horizontal = centerX < .34 ? "L" : centerX > .66 ? "R" : "C";
  const vertical = centerY < .34 ? "T" : centerY > .66 ? "B" : "M";
  const area = Number(geometry.width || 0) * Number(geometry.height || 0);
  const scale = area >= .55 ? "XL" : area >= .22 ? "L" : area >= .08 ? "M" : "S";
  return `${horizontal}${vertical}${scale}`;
}

function intersectionArea(a = {}, b = {}) {
  const x = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y = Math.max(Number(a.y || 0), Number(b.y || 0));
  const right = Math.min(Number(a.x || 0) + Number(a.width || 0), Number(b.x || 0) + Number(b.width || 0));
  const bottom = Math.min(Number(a.y || 0) + Number(a.height || 0), Number(b.y || 0) + Number(b.height || 0));
  return Math.max(0, right - x) * Math.max(0, bottom - y);
}

const selected = shots.map((asset) => {
  const reviewFallbackPool = asset.candidates?.filter((item) => !item.screening?.hardFailures?.length) || asset.candidates || [];
  const deterministicReviewFallback = reviewFallbackPool.length
    ? reviewFallbackPool[Number(asset.shotDemand.order || 1) % reviewFallbackPool.length]?.candidateId
    : null;
  const reviewCandidateId = asset.selectedCandidateId
    || asset.visualCritic?.provisionalCandidateId
    || asset.visualCritic?.selectedCandidateId
    || deterministicReviewFallback
    // The contact sheet is a review surface, not an adoption claim. If every
    // current candidate is blocked, keep the first rendered candidate visible
    // so the red-team failure remains inspectable instead of making the
    // authority report impossible to regenerate.
    || asset.candidates?.[0]?.candidateId;
  const candidate = asset.candidates?.find((item) => item.candidateId === reviewCandidateId);
  if (!candidate?.preview?.publicUrl) throw new Error(`selected-candidate-preview-missing:${asset.shotDemand.shotId}`);
  const filePath = publicFile(candidate.preview.publicUrl);
  if (!fs.existsSync(filePath)) throw new Error(`selected-candidate-file-missing:${asset.shotDemand.shotId}`);
  const grammarActors = candidate.sceneGraph.nodes
    .filter((node) => node.id !== "background" && node.visualMode !== "editable-shadow")
    .map((node) => `${String(node.id || "").replace(/-\d+$/u, "-N")}:${node.type}:${geometryBucket(node.geometry)}:${node.fontAssetId || "none"}:${node.typeTreatment || "none"}`)
    .sort();
  const screenPrimary = asset.shotDemand.editMode === "screen-demo"
    ? candidate.sceneGraph.nodes.find((node) => node.id === "primary" && node.type === "source-bound-operation-stage")
    : null;
  const screenCropAudit = screenPrimary?.evidenceFocusRegion && screenPrimary.screenReviewFit !== "full-context"
    ? (() => {
        const stageNormalizedRatio = Number(screenPrimary.geometry?.width || 1) / Math.max(.001, Number(screenPrimary.geometry?.height || 1));
        const cropNormalizedRatio = Number(screenPrimary.evidenceFocusRegion.width || 1) / Math.max(.001, Number(screenPrimary.evidenceFocusRegion.height || 1));
        return {
          contract: "A1ScreenAspectPreservationAudit/v1",
          stageNormalizedRatio: Number(stageNormalizedRatio.toFixed(4)),
          cropNormalizedRatio: Number(cropNormalizedRatio.toFixed(4)),
          pass: Math.abs(stageNormalizedRatio - cropNormalizedRatio) <= .015,
        };
      })()
    : screenPrimary
      ? {contract: "A1ScreenAspectPreservationAudit/v1", stageNormalizedRatio: 1, cropNormalizedRatio: 1, pass: true, mode: "full-context"}
      : null;
  return {
    shotId: asset.shotDemand.shotId,
    order: asset.shotDemand.order,
    sourceText: asset.shotDemand.sourceText,
    editMode: asset.shotDemand.editMode,
    topology: candidate.sceneGraph.topology || asset.shotDemand.topology,
    compositionPrimitive: candidate.sceneGraph.compositionPrimitive || candidate.sceneGraph.layoutSolution?.compositionPrimitive || null,
    fullPackageArchetype: candidate.sceneGraph.fullPackageArchetype || null,
    silhouette: candidate.sceneGraph.silhouette || null,
    primaryMaterialId: candidate.sceneGraph.primaryMaterialId,
    candidateId: candidate.candidateId,
    selectionState: asset.selectedCandidateId === candidate.candidateId ? "reference-mature-admitted" : asset.visualCritic?.selectedCandidateId === candidate.candidateId ? "critic-recommendation" : asset.visualCritic?.provisionalCandidateId === candidate.candidateId ? "provisional-continuity-suggestion" : "deterministic-review-fallback",
    authoritativeSelection: asset.selectedCandidateId === candidate.candidateId,
    sourceAssetPackSha256: candidate.sourceAssetPackSha256,
    sourceDependencySha256: candidate.sourceDependencySha256 || null,
    currentSourceDependencySha256: sceneGraphSourceDependencySha256(workspace, asset.shotDemand, candidate.sceneGraph),
    score: asset.visualCritic?.totalScore ?? candidate.screening.score,
    provisionalAdmission: asset.visualCritic?.provisionalAdmission === true,
    staticCompositionMaturity: asset.visualCritic?.staticCompositionMaturity === true || asset.visualCritic?.referenceMaturity === true,
    previewPublicUrl: candidate.preview.publicUrl,
    previewFile: filePath,
    previewSha256: sha256(fs.readFileSync(filePath)),
    sceneGraphGrammar: grammarActors.join("|"),
    sceneGraphActorCount: grammarActors.length,
    sourceEvidenceCoveredByGeneratedGlyph: (() => {
      if (asset.shotDemand.editMode !== "full-package" || !/^source-(?:documentary|network)-/u.test(String(candidate.sceneGraph.primaryMaterialId || ""))) return false;
      const glyphNodes = candidate.sceneGraph.nodes.filter((node) => node.type === "generated-glyph-reference");
      if (!glyphNodes.length) return false;
      const primaryNode = candidate.sceneGraph.nodes.find((node) => node.id === "primary");
      const primaryArea = Number(primaryNode?.geometry?.width || 0) * Number(primaryNode?.geometry?.height || 0);
      const transparent = glyphNodes.every((node) => {
        const glyphAsset = workspace.library.assets.find((item) => item.id === node.assetId && item.route === "generated-glyph");
        const selectedGlyph = glyphAsset?.typographySpec?.generatedCandidates?.find((item) => item.id === glyphAsset.selectedCandidateId);
        return selectedGlyph?.cutoutContract === "A1GeneratedGlyphTransparentActor/v1"
          && selectedGlyph.cutoutSourceSha256 === selectedGlyph.sha256
          && Boolean(selectedGlyph.cutoutPublicUrl && selectedGlyph.cutoutSha256);
      });
      const overlap = glyphNodes.reduce((sum, node) => sum + intersectionArea(node.geometry, primaryNode?.geometry), 0);
      return !transparent || primaryArea < .07 || overlap > Math.max(.018, primaryArea * .18);
    })(),
    screenCropAudit,
  };
});

fs.mkdirSync(outputDir, {recursive: true});
const tileWidth = 384;
const imageHeight = 216;
const labelHeight = 58;
const tileHeight = imageHeight + labelHeight;
const columns = 5;
const rows = Math.ceil(selected.length / columns);
const modeColors = {
  "presenter-clean": "#f0eadc",
  "presenter-overlay": "#e8bc54",
  "screen-demo": "#5d7cff",
  "full-package": "#c9ef39",
  "type-only": "#c57cff",
};

const tiles = await Promise.all(selected.map(async (item) => {
  const image = await sharp(item.previewFile).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b0e0f"/><rect x="0" y="0" width="8" height="100%" fill="${modeColors[item.editMode] || "#8b938e"}"/><text x="20" y="22" fill="#f3f1e9" font-family="Arial, PingFang SC, sans-serif" font-size="15" font-weight="700">${escapeXml(item.shotId)} · ${escapeXml(item.editMode)}</text><text x="20" y="43" fill="#7e8781" font-family="Arial, PingFang SC, sans-serif" font-size="11">${escapeXml(item.candidateId)} · ${escapeXml(item.topology)}</text><text x="350" y="23" text-anchor="end" fill="${item.staticCompositionMaturity ? "#c9ef39" : "#ffb3aa"}" font-family="Arial, sans-serif" font-size="12" font-weight="700">${item.score ?? "—"}/24</text></svg>`);
  return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0e0f"}})
    .composite([{input: image, top: 0, left: 0}, {input: label, top: imageHeight, left: 0}])
    .png()
    .toBuffer();
}));

const contactPath = path.join(outputDir, "selected-34-contact-sheet.png");
await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}})
  .composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight})))
  .png()
  .toFile(contactPath);

const fingerprints = await Promise.all(selected.map((item) => sharp(item.previewFile).resize(48, 27, {fit: "fill"}).removeAlpha().raw().toBuffer()));
const pixelDistance = (left, right) => {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return Number((total / left.length).toFixed(3));
};
const rasterMetrics = (buffer, width = 48, height = 27) => {
  let white = 0;
  let dark = 0;
  let edgeCount = 0;
  let edgeComparisons = 0;
  const luminance = (offset) => .2126 * buffer[offset] + .7152 * buffer[offset + 1] + .0722 * buffer[offset + 2];
  const pixelDelta = (leftOffset, rightOffset) => (
    Math.abs(buffer[leftOffset] - buffer[rightOffset])
    + Math.abs(buffer[leftOffset + 1] - buffer[rightOffset + 1])
    + Math.abs(buffer[leftOffset + 2] - buffer[rightOffset + 2])
  ) / 3;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const channels = [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
      const light = luminance(offset);
      const chroma = Math.max(...channels) - Math.min(...channels);
      if (light >= 220 && chroma <= 30) white += 1;
      if (light <= 48) dark += 1;
      if (x + 1 < width) {
        edgeComparisons += 1;
        if (pixelDelta(offset, offset + 3) >= 45) edgeCount += 1;
      }
      if (y + 1 < height) {
        edgeComparisons += 1;
        if (pixelDelta(offset, offset + width * 3) >= 45) edgeCount += 1;
      }
    }
  }
  const pixels = width * height;
  return {
    whiteSurfaceRatio: Number((white / pixels).toFixed(4)),
    darkSurfaceRatio: Number((dark / pixels).toFixed(4)),
    edgeDensity: Number((edgeCount / Math.max(1, edgeComparisons)).toFixed(4)),
  };
};
const visualWorldFor = (item, metrics) => {
  if (item.editMode.startsWith("presenter-")) return "presenter-footage";
  if (item.editMode === "type-only") return "typographic-field";
  if (item.editMode === "screen-demo") {
    if (metrics.whiteSurfaceRatio >= .62) return "screen-white-surface";
    if (metrics.darkSurfaceRatio >= .55) return "screen-dark-surface";
    return "screen-source-surface";
  }
  if (metrics.whiteSurfaceRatio >= .62) return "document-white-surface";
  if (/^source-(?:documentary|network)-/u.test(String(item.primaryMaterialId || ""))) return "document-material";
  return "editorial-material";
};
for (const [index, item] of selected.entries()) {
  item.rasterMetrics = rasterMetrics(fingerprints[index]);
  item.visualWorld = visualWorldFor(item, item.rasterMetrics);
}
const exactDuplicateGroups = [...selected.reduce((map, item) => {
  const group = map.get(item.previewSha256) || [];
  group.push(item.shotId);
  map.set(item.previewSha256, group);
  return map;
}, new Map()).values()].filter((group) => group.length > 1);
const adjacentNearDuplicates = [];
for (let index = 1; index < selected.length; index += 1) {
  const distance = pixelDistance(fingerprints[index - 1], fingerprints[index]);
  const sameVisualWorld = selected[index - 1].visualWorld === selected[index].visualWorld;
  if (sameVisualWorld && distance < 22) adjacentNearDuplicates.push({left: selected[index - 1].shotId, right: selected[index].shotId, visualWorld: selected[index].visualWorld, distance});
}

function repeatedRuns(key, minimum = 3) {
  const runs = [];
  let start = 0;
  for (let index = 1; index <= selected.length; index += 1) {
    if (index < selected.length && selected[index][key] === selected[start][key]) continue;
    if (index - start >= minimum) runs.push({value: selected[start][key], shotIds: selected.slice(start, index).map((item) => item.shotId)});
    start = index;
  }
  return runs;
}

function predicateRuns(predicate, minimum = 3) {
  const runs = [];
  let start = null;
  for (let index = 0; index <= selected.length; index += 1) {
    const matches = index < selected.length && predicate(selected[index]);
    if (matches && start === null) start = index;
    if ((!matches || index === selected.length) && start !== null) {
      if (index - start >= minimum) runs.push({shotIds: selected.slice(start, index).map((item) => item.shotId)});
      start = null;
    }
  }
  return runs;
}

const allRepeatedMaterialRuns = repeatedRuns("primaryMaterialId");
const temporalPresenterAssetIds = new Set(workspace.library.assets.filter((asset) => asset.presenterEvidence?.contract === "A1RealPresenterVideoEvidence/v1").map((asset) => asset.id));
const temporalPresenterRuns = allRepeatedMaterialRuns.filter((run) => temporalPresenterAssetIds.has(run.value));
const repeatedMaterialRuns = allRepeatedMaterialRuns.filter((run) => !temporalPresenterAssetIds.has(run.value));
const repeatedTopologyRuns = repeatedRuns("topology");
const repeatedCompositionPrimitiveRuns = repeatedRuns("compositionPrimitive");
const repeatedVisualWorldRuns = repeatedRuns("visualWorld", 4).filter((run) => run.value !== "presenter-footage");
const lowDetailWhiteSurfaceRuns = predicateRuns((item) => ["screen-demo", "full-package"].includes(item.editMode)
  && item.rasterMetrics.whiteSurfaceRatio >= .68
  && item.rasterMetrics.edgeDensity < .08, 3);
const sharedSceneGraphGrammars = [...selected.reduce((map, item) => {
  if (item.sceneGraphActorCount < 2) return map;
  const entry = map.get(item.sceneGraphGrammar) || {grammar: item.sceneGraphGrammar, topologies: new Set(), shotIds: []};
  entry.topologies.add(item.topology);
  entry.shotIds.push(item.shotId);
  map.set(item.sceneGraphGrammar, entry);
  return map;
}, new Map()).values()]
  .map((entry) => ({grammar: entry.grammar, topologies: [...entry.topologies].sort(), shotIds: entry.shotIds}))
  .filter((entry) => entry.topologies.length > 1);
const repeatedSceneGraphGrammars = [...selected.reduce((map, item) => {
  if (item.sceneGraphActorCount < 2) return map;
  const entry = map.get(item.sceneGraphGrammar) || {grammar: item.sceneGraphGrammar, shotIds: []};
  entry.shotIds.push(item.shotId);
  map.set(item.sceneGraphGrammar, entry);
  return map;
}, new Map()).values()].filter((entry) => entry.shotIds.length >= 3);
const modeCounts = selected.reduce((counts, item) => ({...counts, [item.editMode]: (counts[item.editMode] || 0) + 1}), {});
const presenterSourceIsStill = selected.filter((item) => item.editMode.startsWith("presenter-")).some((item) => /opening-frame|closing-frame/u.test(String(item.primaryMaterialId)));
const mediumRhythmAudit = auditWholeFilmMediumRhythm(shots.map((asset) => asset.shotDemand));
const assetById = new Map(workspace.library.assets.map((asset) => [asset.id, asset]));
const screenEvidenceGaps = selected.flatMap((item) => {
  if (item.editMode !== "screen-demo") return [];
  const shotAsset = shots.find((asset) => asset.shotDemand.shotId === item.shotId);
  const material = assetById.get(item.primaryMaterialId);
  if (!shotAsset || !material?.videoEvidence) return [{shotId: item.shotId, materialId: item.primaryMaterialId, gap: "native causal evidence is missing"}];
  const selection = selectScreenEvidenceBeats(shotAsset.shotDemand, material.videoEvidence);
  return selection.coverageStatus === "partial" ? [{shotId: item.shotId, materialId: item.primaryMaterialId, selectedBeatIds: selection.selectedBeatIds, gap: selection.coverageGap}] : [];
});
const screenAspectViolations = selected.filter((item) => item.screenCropAudit?.pass === false).map((item) => ({
  shotId: item.shotId,
  candidateId: item.candidateId,
  ...item.screenCropAudit,
}));
const screenPackagingViolations = selected.flatMap((item) => {
  if (item.editMode !== "screen-demo") return [];
  const asset = shots.find((shot) => shot.shotDemand.shotId === item.shotId);
  const candidate = asset?.candidates?.find((entry) => entry.candidateId === item.candidateId);
  const packagingNodes = candidate?.sceneGraph?.nodes?.filter((node) => ["screen-causal-word", "screen-causal-caption"].includes(node.typeTreatment)) || [];
  return packagingNodes.flatMap((node) => {
    const area = Number(node.geometry?.width || 0) * Number(node.geometry?.height || 0);
    const reasons = [];
    if (!/^real-screen-region:/u.test(String(node.objectBinding || ""))) reasons.push("not-bound-to-real-screen-region");
    if (!node.sourceRegion || !node.sourceAnchor) reasons.push("source-anchor-missing");
    if (node.typeTreatment === "screen-causal-word" && Number(node.fontSize || 0) > 64) reasons.push("screen-word-too-large");
    if (node.typeTreatment === "screen-causal-word" && area > .035) reasons.push("screen-word-becomes-floating-logo");
    return reasons.length ? [{shotId: item.shotId, candidateId: item.candidateId, nodeId: node.id, reasons}] : [];
  });
});
// Modern candidates bind only the materials and shot-direction fields they
// actually consume. A global asset-pack hash changes when an unrelated shot
// is rebuilt, so comparing it here made every previously selected shot look
// stale. Keep the legacy fallback only for candidates created before the
// dependency contract existed.
const staleCandidateBindings = selected.filter((item) => item.sourceDependencySha256
  ? item.sourceDependencySha256 !== item.currentSourceDependencySha256
  : item.sourceAssetPackSha256 !== workspace.library.assetPackSha256).map((item) => ({
  shotId: item.shotId,
  candidateId: item.candidateId,
  sourceDependencySha256: item.sourceDependencySha256,
  currentSourceDependencySha256: item.currentSourceDependencySha256,
  sourceAssetPackSha256: item.sourceAssetPackSha256,
  currentAssetPackSha256: workspace.library.assetPackSha256,
}));
const hardFailures = [];
const qualityWarnings = [];
if (presenterSourceIsStill) hardFailures.push("presenter-human-led-motion-source-missing");
if (staleCandidateBindings.length) hardFailures.push("selected-candidate-asset-pack-stale");
if (selected.some((item) => item.primaryMaterialId === "key-bg-model-material-table")) hardFailures.push("legacy-generic-model-table-background-forbidden");
if (selected.some((item) => item.sourceEvidenceCoveredByGeneratedGlyph)) hardFailures.push("source-evidence-covered-by-generated-glyph");
if (exactDuplicateGroups.length) hardFailures.push("exact-selected-shot-duplicate");
if (repeatedMaterialRuns.length) hardFailures.push("three-consecutive-shots-repeat-primary-material");
if (repeatedTopologyRuns.length) hardFailures.push("three-consecutive-shots-repeat-topology");
if (repeatedCompositionPrimitiveRuns.length) hardFailures.push("three-consecutive-shots-repeat-composition-primitive");
if (sharedSceneGraphGrammars.length) hardFailures.push("distinct-topology-labels-share-scene-graph-grammar");
if (repeatedSceneGraphGrammars.length) hardFailures.push("three-selected-shots-share-scene-graph-grammar");
if (selected.some((item) => Number(item.score || 0) < 22 || !item.staticCompositionMaturity)) hardFailures.push("selected-shots-below-reference-maturity-22");
if (screenEvidenceGaps.length) hardFailures.push("screen-evidence-does-not-prove-shot-claim");
if (screenAspectViolations.length) hardFailures.push("screen-source-aspect-ratio-mismatch");
if (screenPackagingViolations.length) hardFailures.push("screen-packaging-detached-hud-or-floating-logo");
if (lowDetailWhiteSurfaceRuns.length) hardFailures.push("three-consecutive-low-detail-white-surfaces");
if (repeatedVisualWorldRuns.length) qualityWarnings.push("four-consecutive-shots-share-visual-world");
hardFailures.push(...mediumRhythmAudit.hardFailures.map((failure) => `medium-rhythm:${failure}`));

const report = {
  contract: "A1AllShotSelectedVisualAudit/v1",
  projectId: workspace.production.project.projectId,
  generatedAt: new Date().toISOString(),
  status: hardFailures.length ? "BLOCK" : qualityWarnings.length ? "PASS_WITH_REVIEW_WARNINGS" : "PASS",
  benchmark: {staticCompositionTarget: 22, representativeMotionTarget: 22, maxScore: 24, source: "hubo-reference-sequence-red-team-v1"},
  selectedCandidateSetSha256: selectedShotCandidateSetSha256(workspace),
  summary: {
    shotCount: selected.length,
    selectedCount: selected.filter((item) => item.authoritativeSelection).length,
    reviewCandidateCount: selected.filter((item) => item.candidateId).length,
    staticCompositionMatureCount: selected.filter((item) => item.staticCompositionMaturity && item.score >= 22).length,
    provisionalCount: selected.filter((item) => item.provisionalAdmission).length,
    exactDuplicateGroupCount: exactDuplicateGroups.length,
    adjacentNearDuplicateCount: adjacentNearDuplicates.length,
    repeatedMaterialRunCount: repeatedMaterialRuns.length,
    temporalPresenterRunCount: temporalPresenterRuns.length,
    repeatedTopologyRunCount: repeatedTopologyRuns.length,
    repeatedCompositionPrimitiveRunCount: repeatedCompositionPrimitiveRuns.length,
    repeatedVisualWorldRunCount: repeatedVisualWorldRuns.length,
    lowDetailWhiteSurfaceRunCount: lowDetailWhiteSurfaceRuns.length,
    sharedSceneGraphGrammarCount: sharedSceneGraphGrammars.length,
    repeatedSceneGraphGrammarCount: repeatedSceneGraphGrammars.length,
    screenEvidenceGapCount: screenEvidenceGaps.length,
    screenAspectViolationCount: screenAspectViolations.length,
    screenPackagingViolationCount: screenPackagingViolations.length,
    staleCandidateBindingCount: staleCandidateBindings.length,
    modeCounts,
  },
  hardFailures,
  qualityWarnings,
  exactDuplicateGroups,
  adjacentNearDuplicates,
  repeatedMaterialRuns,
  temporalPresenterRuns,
  repeatedTopologyRuns,
  repeatedCompositionPrimitiveRuns,
  repeatedVisualWorldRuns,
  lowDetailWhiteSurfaceRuns,
  sharedSceneGraphGrammars,
  repeatedSceneGraphGrammars,
  mediumRhythmAudit,
  screenEvidenceGaps,
  screenAspectViolations,
  screenPackagingViolations,
  staleCandidateBindings,
  shots: selected.map(({previewFile, ...item}) => item),
  contactSheet: {publicUrl: `/${outputRelative}/selected-34-contact-sheet.png`, sha256: sha256(fs.readFileSync(contactPath)), width: columns * tileWidth, height: rows * tileHeight},
  decision: "This is an all-shot design review artifact. Only PASS with all 34 shots at 22/24 and no hard failure may continue to representative motion; it never authorizes 1080p or DaVinci release.",
};
const reportPath = path.join(outputDir, "report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--persist")) withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const nextSteps = [];
  if (hardFailures.includes("presenter-human-led-motion-source-missing")) nextSteps.push("绑定本人完整视频");
  if (hardFailures.includes("screen-evidence-does-not-prove-shot-claim")) nextSteps.push("补齐真实录屏证据");
  if (hardFailures.some((failure) => /duplicate|repeat-primary-material|repeat-topology|repeat-composition-primitive|scene-graph-grammar|low-detail-white|medium-rhythm/iu.test(failure))) nextSteps.push("拆分共享构图语法并修复全片重复");
  if (hardFailures.includes("screen-packaging-detached-hud-or-floating-logo")) nextSteps.push("把录屏包装重新绑定到真实操作对象");
  if (hardFailures.includes("selected-shots-below-reference-maturity-22")) nextSteps.push("继续逐镜审美复核与返修，34 镜全部达到 22/24 后再进入动效");
  next.production.maturityLoop.status = ["PASS", "PASS_WITH_REVIEW_WARNINGS"].includes(report.status) ? "global-visual-audit-pass" : "blocked-global-visual-audit";
  next.production.maturityLoop.nextAction = nextSteps.length ? nextSteps.join("；") : "建立 18–28 秒代表动效";
  next.production.maturityLoop.allShotSelectedReview = {contract: report.contract, status: report.status, reportPublicUrl: `/${outputRelative}/report.json`, reportSha256: sha256(fs.readFileSync(reportPath)), selectedCandidateSetSha256: report.selectedCandidateSetSha256, contactSheetPublicUrl: report.contactSheet.publicUrl, contactSheetSha256: report.contactSheet.sha256, hardFailures: report.hardFailures, qualityWarnings: report.qualityWarnings, reviewedAt: report.generatedAt};
  const staticBoardPassed = report.status === "PASS";
  next.production.maturityLoop.bestEffectBoard = {
    ...(next.production.maturityLoop.bestEffectBoard || {}),
    contract: "A1BestEffectStaticBoardGate/v1",
    status: staticBoardPassed ? "STATIC_BOARD_REFERENCE_MATURE" : "ALL_STATIC_HERO_FRAMES_READY_FOR_BOARD_REVIEW",
    shotCount: selected.length,
    targetShotIds: selected.map((item) => item.shotId),
    hardFailures: report.hardFailures,
    resolvedChecks: {
      allHeroFramesPresent: report.summary.reviewCandidateCount === selected.length,
      nativeScreenAspectPreserved: report.summary.screenAspectViolationCount === 0,
      exactDuplicateFree: report.summary.exactDuplicateGroupCount === 0,
      adjacentNearDuplicateFree: report.summary.adjacentNearDuplicateCount === 0,
      sharedSceneGraphGrammarFree: report.summary.sharedSceneGraphGrammarCount === 0,
      lowDetailWhiteSurfaceRunFree: report.summary.lowDetailWhiteSurfaceRunCount === 0,
      screenPackagingObjectBound: report.summary.screenPackagingViolationCount === 0,
    },
    contactSheetPublicUrl: report.contactSheet.publicUrl,
    contactSheetSha256: report.contactSheet.sha256,
    reportPublicUrl: `/${outputRelative}/report.json`,
    reportSha256: sha256(fs.readFileSync(reportPath)),
    updatedAt: report.generatedAt,
  };
  next.production.filmVisualRepair = {
    ...(next.production.filmVisualRepair || {}),
    status: staticBoardPassed ? "static-board-reference-mature" : "full-board-best-effect-refinement",
    hardFailures: report.hardFailures,
    nextAction: staticBoardPassed ? "build-representative-motion" : "refine-and-audit-all-34-static-best-effect-frames",
    appliedAt: report.generatedAt,
  };
  const event = createProductionEvent({workspace: current, action: report.status === "PASS" ? "all-shot-selected-global-visual-audit-passed" : "all-shot-selected-global-visual-audit-blocked", targetId: current.production.project.projectId, payload: {reportSha256: next.production.maturityLoop.allShotSelectedReview.reportSha256, hardFailures: report.hardFailures}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next), {event, files: {"best-effect-static-board-gate-v1.json": next.production.maturityLoop.bestEffectBoard}});
});
console.log(JSON.stringify({status: report.status, summary: report.summary, hardFailures, contactSheet: report.contactSheet, reportPublicUrl: `/${outputRelative}/report.json`}, null, 2));
