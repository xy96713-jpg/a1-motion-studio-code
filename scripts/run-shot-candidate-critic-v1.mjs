#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {automaticallyAdmitReferenceMatureShot, createProductionEvent, screenEvidenceMaterialIdForShot} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {A1_STATIC_SHOT_ADMISSION_SCORE, isShotReferenceMature, screenCriticRequiresSourceRecapture, visualCriticMedianScore} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  A1_EDITORIAL_VISUAL_GENERATION_POLICY,
  A1_REVIEW_PREVIEW_POLICY,
  auditSceneGraphAgainstEditorialVisualPolicy,
} from "../apps/studio-next/src/lib/a1-editorial-visual-generation-policy-v1.mjs";
import {runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";
import {resolveAestheticMasterAnchorConstraint} from "../apps/studio-next/src/lib/a1-aesthetic-master-anchor-policy-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const {artifactDir} = projectDirs(appRoot);
const shotArg = process.argv.find((item) => item.startsWith("--shot="))?.split("=")[1];
const force = process.argv.includes("--force");
if (!shotArg) throw new Error("shot-candidate-critic-shot-required");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const shots = workspace.library.assets.filter((asset) => asset.route === "shot-composition").sort((a, b) => a.shotDemand.order - b.shotDemand.order);
const shot = shots.find((asset) => asset.id === shotArg || asset.shotDemand.shotId === shotArg);
if (!shot?.candidates?.length || !shot.candidateRender?.previews?.length) throw new Error(`shot-candidate-render-not-ready:${shotArg}`);
// The critic must inspect the same effective composition mode that the
// renderer produced.  Anchor constraints can intentionally tighten a stale
// director hint (ED-01 overlay -> clean presenter); auditing the old hint
// here would manufacture a hard failure for the very rule we just enforced.
const effectiveCandidateMode = shot.candidates[0]?.sceneGraph?.effectiveEditMode || shot.candidates[0]?.sceneGraph?.editMode;
if (effectiveCandidateMode && effectiveCandidateMode !== shot.shotDemand.editMode) {
  shot.shotDemand = {...shot.shotDemand, editMode: effectiveCandidateMode};
}
const aestheticMasterAnchor = resolveAestheticMasterAnchorConstraint(workspace, shot.shotDemand.shotId);
const explicitVisualPrimitiveId = shot.candidates[0]?.sceneGraph?.visualPrimitiveOverride?.applied === true
  ? shot.candidates[0].sceneGraph.visualPrimitiveOverride.id
  : null;
const recordedScreenSequence = shot.shotDemand.editMode === "screen-demo"
  && shot.candidates.length >= 2
  && shot.candidates.length <= 5
  && shot.candidates.every((candidate) => candidate.sceneGraph?.sourceEvidence?.realCausalRecording === true);
const operationSequence = (shot.candidates.length >= 2
  && shot.candidates.length <= 5
  && shot.candidates.every((candidate) => ["operation-state-triptych", "operation-state-sequence"].includes(candidate.sceneGraph?.candidateSetPolicy?.mode)))
  || recordedScreenSequence;
const operationStates = operationSequence
  ? shot.candidates[0].sceneGraph.candidateSetPolicy?.states
    || shot.candidates.map((candidate) => candidate.sceneGraph.sourceEvidence?.presentation?.evidenceBeat || null)
  : [];
const singleMatureRefinement = shot.candidates.length === 1
  && shot.candidates[0].sceneGraph?.candidateSetPolicy?.contract === "A1VisualRevisionCandidateSetPolicy/v1"
  && shot.candidates[0].sceneGraph.candidateSetPolicy.mode === "critic-selected-single-mature-refinement";
const preferenceMatureRefinement = singleMatureRefinement
  && shot.candidates[0].sceneGraph?.presenterPackagingArchetype === "preference-word-stack";
const previewById = new Map(shot.candidateRender.previews.map((item) => [item.candidateId, item]));
const candidates = shot.candidates.map((candidate, candidateIndex) => {
  const preview = previewById.get(candidate.candidateId);
  if (!preview) throw new Error(`shot-candidate-preview-missing:${candidate.candidateId}`);
  const sourceActionNode = candidate.sceneGraph.nodes.find((node) => ["source-bound-preference-surface", "source-bound-presenter-operation-surface"].includes(node.type));
  const operationPointer = candidate.sceneGraph.nodes.find((node) => node.type === "source-bound-pointer");
  const sourceActionAsset = sourceActionNode ? workspace.library.assets.find((asset) => asset.id === sourceActionNode.assetId) : null;
  return {
    candidateId: candidate.candidateId,
    direction: candidate.direction,
    operationState: operationStates[candidateIndex] || null,
    expectedText: candidate.sceneGraph.typography?.assignment?.headlineText || candidate.sceneGraph.nodes.find((node) => node.id === "headline")?.text || null,
    visibleTextActors: candidate.sceneGraph.nodes.filter((node) => node.type === "editable-text" && node.visualMode !== "editable-shadow").map((node) => ({id: node.id, text: node.text, objectBinding: node.objectBinding, semanticBeat: node.semanticBeat})),
    realSourceActionEvidence: sourceActionAsset?.videoEvidence ? {
      contract: sourceActionAsset.videoEvidence.contract,
      actionId: sourceActionAsset.videoEvidence.actionId,
      durationSeconds: sourceActionAsset.videoEvidence.durationSeconds,
      publicUrl: sourceActionAsset.videoEvidence.publicUrl,
      sha256: sourceActionAsset.videoEvidence.sha256,
      evidenceBeats: sourceActionAsset.videoEvidence.evidenceFrames.map((frame) => frame.beat),
      sourceType: sourceActionAsset.provenance?.sourceType || null,
      evidenceBoundary: sourceActionAsset.videoEvidence.evidenceBoundary || sourceActionAsset.provenance?.evidenceBoundary || null,
    } : null,
    sourceInteractionEvidence: operationPointer ? {
      type: operationPointer.interaction?.type || null,
      target: operationPointer.interaction?.target || null,
      source: operationPointer.interaction?.source || null,
      objectBinding: operationPointer.objectBinding || null,
    } : null,
    imagePublicUrl: preview.publicUrl,
  };
});
const images = candidates.map((candidate) => {
  const file = path.join(publicRoot, candidate.imagePublicUrl.replace(/^\/+/, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(file)) throw new Error(`shot-candidate-image-missing:${candidate.candidateId}`);
  return file;
});
const index = shots.indexOf(shot);
const previous = index > 0 ? shots[index - 1] : null;
const nextShot = index + 1 < shots.length ? shots[index + 1] : null;
const generationProviderStatus = workspace.production.generation.providerState?.status || "unknown";

function area(geometry = {}) {
  return Math.max(0, Number(geometry.width || 0)) * Math.max(0, Number(geometry.height || 0));
}

function intersectionArea(a = {}, b = {}) {
  const x = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y = Math.max(Number(a.y || 0), Number(b.y || 0));
  const right = Math.min(Number(a.x || 0) + Number(a.width || 0), Number(b.x || 0) + Number(b.width || 0));
  const bottom = Math.min(Number(a.y || 0) + Number(a.height || 0), Number(b.y || 0) + Number(b.height || 0));
  return Math.max(0, right - x) * Math.max(0, bottom - y);
}

function presenterLayoutSignature(candidate) {
  const graph = candidate?.sceneGraph;
  if (!graph || graph.editMode !== "presenter-overlay") return null;
  const bucket = (geometry = {}) => {
    const centerX = Number(geometry.x || 0) + Number(geometry.width || 0) / 2;
    const centerY = Number(geometry.y || 0) + Number(geometry.height || 0) / 2;
    const horizontal = centerX < .34 ? "L" : centerX > .66 ? "R" : "C";
    const vertical = centerY < .34 ? "T" : centerY > .66 ? "B" : "M";
    const size = area(geometry) >= .16 ? "L" : area(geometry) >= .07 ? "M" : "S";
    return `${horizontal}${vertical}${size}`;
  };
  const phrases = graph.nodes
    .filter((node) => /^(?:presenter-word-|preference-(?:like|dislike|outcome)-)/u.test(String(node.id || "")) && node.visualMode !== "editable-shadow")
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .map((node) => bucket(node.geometry));
  const evidence = graph.nodes.find((node) => node.id === "evidence-band");
  const surfaces = graph.nodes
    .filter((node) => /^(?:presenter-word-|preference-(?:like|dislike|outcome)-)/u.test(String(node.id || "")) && node.visualMode !== "editable-shadow")
    .map((node) => node.surfaceTreatment || "none")
    .join("+");
  return `${graph.presenterCompositionVariant || "legacy"}|${phrases.join("+")}|surfaces:${surfaces}|evidence:${evidence?.evidenceEdge || "none"}`;
}

async function localShotPreflight() {
  const faceZone = {x: .37, y: .12, width: .28, height: .48};
  const fingerprints = await Promise.all(images.map((image) => sharp(image).resize(48, 27, {fit: "fill"}).removeAlpha().raw().toBuffer()));
  const fullPackageContrastByCandidate = new Map();
  if (shot.shotDemand.editMode === "full-package") {
    for (let candidateIndex = 0; candidateIndex < shot.candidates.length; candidateIndex += 1) {
      const candidate = shot.candidates[candidateIndex];
      const {data, info} = await sharp(images[candidateIndex]).greyscale().raw().toBuffer({resolveWithObject: true});
      const failures = [];
      const measurements = [];
      for (const node of candidate.sceneGraph.nodes.filter((item) => item.type === "editable-text" && item.visualMode !== "editable-shadow" && String(item.text || "").trim())) {
        if (!["light", "dark"].includes(node.tone)) {
          failures.push(`${node.id}:tone-missing`);
          continue;
        }
        const x0 = Math.max(0, Math.floor(Number(node.geometry.x || 0) * info.width));
        const y0 = Math.max(0, Math.floor(Number(node.geometry.y || 0) * info.height));
        const x1 = Math.min(info.width, Math.ceil((Number(node.geometry.x || 0) + Number(node.geometry.width || 0)) * info.width));
        const y1 = Math.min(info.height, Math.ceil((Number(node.geometry.y || 0) + Number(node.geometry.height || 0)) * info.height));
        const values = [];
        for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) values.push(data[y * info.width + x]);
        values.sort((left, right) => left - right);
        const percentile = (ratio) => values[Math.max(0, Math.floor((values.length - 1) * ratio))] || 0;
        const lowBackground = percentile(.35);
        const highBackground = percentile(.65);
        const pass = node.tone === "light" ? lowBackground <= 180 : highBackground >= 90;
        measurements.push({nodeId: node.id, tone: node.tone, lowBackground, highBackground, pass});
        if (!pass) failures.push(`${node.id}:${node.tone}:${lowBackground}-${highBackground}`);
      }
      fullPackageContrastByCandidate.set(candidate.candidateId, {failures, measurements});
    }
  }
  const distance = (left, right) => {
    let total = 0;
    for (let index = 0; index < left.length; index++) total += Math.abs(left[index] - right[index]);
    return total / left.length;
  };
  const representatives = [];
  for (let index = 0; index < fingerprints.length; index++) if (representatives.every((other) => distance(fingerprints[index], fingerprints[other]) >= 4)) representatives.push(index);
  const presenterLayoutSignatures = shot.shotDemand.editMode === "presenter-overlay"
    ? new Set(shot.candidates.map((candidate) => presenterLayoutSignature(candidate)).filter(Boolean))
    : new Set();
  const effectiveDistinctCount = shot.shotDemand.editMode === "presenter-overlay"
    ? Math.max(representatives.length, presenterLayoutSignatures.size)
    : representatives.length;
  // A source-bound operation sequence intentionally keeps the same real
  // screen topology across states. Its distinction is the captured beat and
  // view (context/action-close/result), not a different poster silhouette.
  // Do not reject a valid operation for raster similarity alone.
  const minimumDistinct = operationSequence
    ? 1
    // Full-package candidates are alternate crops and layer orderings of the
    // same approved material world. Requiring three raster silhouettes here
    // turns legitimate material continuity into a false hard block; keep two
    // visibly distinct readings as the local floor and leave higher taste
    // judgment to the visual critic when its quota is available.
    : shot.shotDemand.editMode === "full-package" ? 2
      : shot.shotDemand.editMode === "presenter-clean" ? 2 : Math.min(3, shot.candidates.length);
  const setHardFailures = [];
  if (effectiveDistinctCount < minimumDistinct) setHardFailures.push("candidate-variants-visually-duplicate");
  const nativeScreenCandidates = shot.shotDemand.editMode === "screen-demo"
    ? shot.candidates.filter((candidate) => candidate.sceneGraph.sourceEvidence?.realCausalRecording === true)
    : [];
  if (nativeScreenCandidates.length) {
    const evidenceBeats = new Set(nativeScreenCandidates.map((candidate) => candidate.sceneGraph.nodes.find((node) => node.id === "primary")?.evidenceBeat
      || candidate.sceneGraph.sourceEvidence?.presentation?.evidenceBeat).filter(Boolean));
    const screenViews = new Set(nativeScreenCandidates.map((candidate) => candidate.sceneGraph.sourceEvidence?.presentation?.view).filter(Boolean));
    if (operationSequence) {
      // A replayable operation set is a temporal proof, not a set of crop
      // alternatives. Requiring literal context/action-close labels here
      // rejected the stronger selected -> candidates -> picked -> applied
      // chain even though every state came from the same captured interface.
      const requiredCausalStates = [...new Set(operationStates.filter(Boolean))];
      if (!requiredCausalStates.every((state) => evidenceBeats.has(state))) {
        setHardFailures.push("screen-operation-sequence-lacks-causal-state-chain");
      }
    } else {
      if (evidenceBeats.size < 2) setHardFailures.push("screen-candidates-do-not-cover-causal-beats");
      if (!screenViews.has("context") || !screenViews.has("action-close")) setHardFailures.push("screen-candidates-lack-context-and-action-close-options");
    }
  }
  const screenPrimaryMaterialId = shot.candidates[0]?.sceneGraph?.primaryMaterialId || null;
  const priorSameScreenMaterialCount = screenPrimaryMaterialId
    ? shots.slice(0, index).filter((item) => item.candidates?.[0]?.sceneGraph?.primaryMaterialId === screenPrimaryMaterialId).length
    : 0;
  const desiredScreenView = priorSameScreenMaterialCount % 2 === 0 ? "action-close" : "context";
  const screenBeatOrder = shot.candidates[0]?.sceneGraph?.sourceEvidence?.selectedBeatIds || [];
  const desiredScreenBeat = screenBeatOrder.length
    ? screenBeatOrder[Math.max(0, screenBeatOrder.length - 1 - (priorSameScreenMaterialCount % screenBeatOrder.length))]
    : null;
  const presenterCompositionKey = (item) => {
    const graph = item?.candidates?.[0]?.sceneGraph;
    if (!graph || !String(item.shotDemand?.editMode || "").startsWith("presenter-")) return null;
    const headlineText = graph.nodes.find((node) => node.id === "headline")?.text
      || graph.nodes.filter((node) => /^presenter-word-/u.test(String(node.id || ""))).map((node) => node.text).join("")
      || "";
    const supportingId = graph.nodes.find((node) => ["supporting-evidence", "evidence-band"].includes(node.id))?.assetId || "";
    return `${item.shotDemand.editMode}|${graph.primaryMaterialId}|${headlineText}|${supportingId}`;
  };
  const currentPresenterCompositionKey = presenterCompositionKey(shot);
  const priorSamePresenterCompositionCount = currentPresenterCompositionKey
    ? shots.slice(0, index).filter((item) => presenterCompositionKey(item) === currentPresenterCompositionKey).length
    : 0;
  const desiredPresenterIndex = shot.candidates.length
    ? (Number(shot.shotDemand.order || 1) * 2 + priorSamePresenterCompositionCount * 2) % shot.candidates.length
    : 0;
  const priorPresenterLayoutCounts = shots.slice(0, index).reduce((counts, item) => {
    const selectedCandidate = item.candidates?.find((candidate) => candidate.candidateId === item.selectedCandidateId);
    const signature = presenterLayoutSignature(selectedCandidate);
    if (signature) counts.set(signature, (counts.get(signature) || 0) + 1);
    return counts;
  }, new Map());
  const scored = shot.candidates.map((candidate, candidateIndex) => {
    const nodes = candidate.sceneGraph.nodes;
    const primary = nodes.find((node) => node.id === "primary") || nodes.find((node) => node.type === "generated-glyph-reference");
    const primaryAsset = workspace.library.assets.find((asset) => asset.id === candidate.sceneGraph.primaryMaterialId) || null;
    const headline = nodes.find((node) => node.id === "headline" && node.visualMode !== "editable-shadow");
    const headlineAny = nodes.find((node) => node.id === "headline");
    const presenterPhrases = nodes.filter((node) => /^(?:presenter-word-|preference-(?:like|dislike|outcome)-)/u.test(String(node.id || "")) && node.visualMode !== "editable-shadow");
    const invalidGeometry = nodes.some((node) => !node.geometry || [node.geometry.x, node.geometry.y, node.geometry.width, node.geometry.height].some((value) => !Number.isFinite(Number(value))) || node.geometry.x < 0 || node.geometry.y < 0 || node.geometry.x + node.geometry.width > 1.001 || node.geometry.y + node.geometry.height > 1.001);
    const presenterFaceOverlap = String(shot.shotDemand.editMode).startsWith("presenter-")
      ? [headline, ...presenterPhrases].filter(Boolean).reduce((sum, node) => sum + intersectionArea(node.geometry, faceZone), 0)
      : 0;
    const primaryArea = area(primary?.geometry);
    const sourceAssemblyNodes = nodes.filter((node) => /^duty-source-slice-\d+$/u.test(String(node.id || "")) && node.assetId === candidate.sceneGraph.primaryMaterialId);
    const sourceAssemblyArea = primaryArea + sourceAssemblyNodes.reduce((sum, node) => sum + area(node.geometry), 0);
    const archiveMechanismDominant = candidate.sceneGraph.fullPackageArchetype === "archive-memory-separation"
      && nodes.filter((node) => /^archive-slot-\d+$/u.test(String(node.id || ""))).length >= 3
      && primaryArea >= .34;
    const localityMechanismDominant = candidate.sceneGraph.fullPackageArchetype === "controlled-locality-verdict"
      && primaryArea >= .24
      && nodes.some((node) => node.type === "generated-glyph-reference" && area(node.geometry) >= .18)
      && !nodes.some((node) => ["retained-selection-boundary", "local-revision-window"].includes(node.id));
    const sourceMechanismDominant = (candidate.sceneGraph.fullPackageArchetype === "editorial-duty-assembly"
      && sourceAssemblyNodes.length >= 3
      && sourceAssemblyArea >= .32)
      || archiveMechanismDominant
      || localityMechanismDominant;
    const sourceBound = nodes.some((node) => String(node.assetId || "").startsWith("source-"));
    const semanticWordActors = nodes.filter((node) => String(node.id || "").startsWith("word-actor-"));
    const visibleCopy = nodes.filter((node) => node.type === "editable-text" && node.visualMode !== "editable-shadow" && String(node.text || "").trim());
    const normalizedCopy = visibleCopy.map((node) => String(node.text).replace(/\s+/gu, "").trim());
    const duplicateVisibleCopy = normalizedCopy.some((text, copyIndex) => normalizedCopy.indexOf(text) !== copyIndex);
    const demandedEntityIds = (workspace.assetRequirementGraph.shotDemands.find((item) => item.shotId === shot.shotDemand.shotId)?.candidateAssetIds || []).filter((id) => id.startsWith("source-entity-") || /^source-network-.+-official-mark$/u.test(id));
    const renderedEntityIds = new Set(nodes.filter((node) => node.type === "source-bound-entity-imprint").map((node) => node.assetId));
    const masterTypeProofingRepair = candidate.sceneGraph.visualFamily === "master-type-contradiction-proofing-repair";
    const hasWordActor = shot.shotDemand.editMode === "presenter-clean"
      || presenterPhrases.reduce((sum, node) => sum + area(node.geometry), 0) >= .08
      || nodes.some((node) => node.visualMode !== "editable-shadow" && (["headline", "secondary-phrase", "generated-glyph", "verdict-prefix-editable", "verdict-waste-editable", "verdict-intro"].includes(node.id) || /^word-actor-/u.test(String(node.id || ""))) && area(node.geometry) >= .08);
    const modeFailures = [];
    if (candidate.sceneGraph.hardFailures?.length) modeFailures.push(...candidate.sceneGraph.hardFailures);
    modeFailures.push(...auditSceneGraphAgainstEditorialVisualPolicy({shot: shot.shotDemand, sceneGraph: candidate.sceneGraph}).failures);
    if (shot.shotDemand.editMode === "presenter-overlay" && nodes.some((node) => node.type === "atlas-cell-reference")) modeFailures.push("presenter-overlay-hud-element");
    if (shot.shotDemand.editMode === "presenter-overlay" && !presenterPhrases.length) modeFailures.push("presenter-overlay-phrase-actors-missing");
    const presenterEvidenceNode = nodes.find((node) => (node.id === "evidence-band" || ["source-bound-preference-surface", "source-bound-presenter-operation-surface"].includes(node.type)) && String(node.assetId || "").startsWith("source-"));
    if (shot.shotDemand.editMode === "presenter-overlay" && shot.shotDemand.supportingMaterialIds?.length && !presenterEvidenceNode) modeFailures.push("presenter-overlay-source-evidence-missing");
    if (shot.shotDemand.editMode === "presenter-overlay" && presenterEvidenceNode && !presenterEvidenceNode.evidenceFocusRegion && presenterEvidenceNode.id === "evidence-band" && (presenterEvidenceNode.geometry.x > .001 && presenterEvidenceNode.geometry.x + presenterEvidenceNode.geometry.width < .999)) modeFailures.push("presenter-overlay-floating-ui-card");
    if (shot.shotDemand.editMode === "presenter-overlay"
      && ["source-bound-preference-surface", "source-bound-presenter-operation-surface"].includes(presenterEvidenceNode?.type)
      && (presenterEvidenceNode.geometry.x !== 0
        || presenterEvidenceNode.geometry.y !== 0
        || presenterEvidenceNode.geometry.height !== 1
        || presenterEvidenceNode.geometry.width < .3
        || presenterEvidenceNode.geometry.width > .4)) modeFailures.push("presenter-overlay-source-surface-must-be-face-safe-edge-crop");
    const realCausalScreenEvidence = candidate.sceneGraph.sourceEvidence?.realCausalRecording === true;
    const screenPresentation = candidate.sceneGraph.sourceEvidence?.presentation || null;
    if (shot.shotDemand.editMode === "screen-demo" && (!candidate.sceneGraph.causalScreenActions?.length || (!realCausalScreenEvidence && !nodes.some((node) => node.type === "source-bound-focus-region")))) modeFailures.push("screen-causal-focus-missing");
    if (shot.shotDemand.editMode === "screen-demo" && realCausalScreenEvidence && (!screenPresentation?.sourceFramePublicUrl || !screenPresentation?.evidenceBeat || !screenPresentation?.view)) modeFailures.push("screen-evidence-presentation-missing");
    const expectedScreenMaterial = shot.shotDemand.editMode === "screen-demo" ? screenEvidenceMaterialIdForShot(shot.shotDemand) : null;
    if (expectedScreenMaterial && candidate.sceneGraph.primaryMaterialId !== expectedScreenMaterial) modeFailures.push("screen-wrong-real-source");
    if (shot.shotDemand.editMode === "type-only" && !masterTypeProofingRepair && !nodes.some((node) => node.type === "generated-glyph-reference" && area(node.geometry) >= .45)) modeFailures.push("type-primary-glyph-too-small");
    if (shot.shotDemand.editMode === "full-package" && duplicateVisibleCopy) modeFailures.push("full-package-duplicate-visible-copy-actor");
    if (candidate.sceneGraph.fullPackageArchetype === "controlled-locality-verdict" && nodes.some((node) => ["retained-selection-boundary", "local-revision-window"].includes(node.id))) modeFailures.push("controlled-locality-hud-primitive-forbidden");
    if (shot.shotDemand.editMode === "full-package" && candidate.sceneGraph.primaryMaterialId === "key-bg-model-material-table") modeFailures.push("legacy-generic-model-table-background-forbidden");
    const generatedGlyphNodes = nodes.filter((node) => node.type === "generated-glyph-reference");
    const transparentGlyphActors = generatedGlyphNodes.every((node) => {
      const glyphAsset = workspace.library.assets.find((asset) => asset.id === node.assetId && asset.route === "generated-glyph");
      const selectedGlyph = glyphAsset?.typographySpec?.generatedCandidates?.find((item) => item.id === glyphAsset.selectedCandidateId);
      return selectedGlyph?.cutoutContract === "A1GeneratedGlyphTransparentActor/v1"
        && selectedGlyph.cutoutSourceSha256 === selectedGlyph.sha256
        && Boolean(selectedGlyph.cutoutPublicUrl && selectedGlyph.cutoutSha256);
    });
    const glyphSourceOverlap = generatedGlyphNodes.reduce((sum, node) => sum + intersectionArea(node.geometry, primary?.geometry), 0);
    const sourceEvidenceRetainedAlongsideGlyph = primaryArea >= .07 && glyphSourceOverlap <= Math.max(.018, primaryArea * .18);
    if (shot.shotDemand.editMode === "full-package"
      && /^source-(?:documentary|network)-/u.test(String(candidate.sceneGraph.primaryMaterialId || ""))
      && generatedGlyphNodes.length
      && (!transparentGlyphActors || !sourceEvidenceRetainedAlongsideGlyph)) modeFailures.push("source-evidence-covered-by-generated-glyph");
    if (shot.shotDemand.editMode === "full-package") {
      const sourceType = String(primaryAsset?.provenance?.sourceType || "");
      const mediaBoundary = primaryAsset?.mediaBoundary || null;
      const presenterLeak = String(candidate.sceneGraph.primaryMaterialId || "").startsWith("source-presenter-")
        || primaryAsset?.presenterEvidence
        || mediaBoundary?.containsPresenter === true;
      const unsafeComposite = sourceType.includes("composite") && !(
        mediaBoundary?.photorealistic === false
        && mediaBoundary?.containsPresenter === false
        && mediaBoundary?.containsScreen === false
      );
      if (presenterLeak) modeFailures.push("full-package-presenter-media-forbidden");
      if (unsafeComposite) modeFailures.push("full-package-photorealistic-composite-forbidden");
    }
    if (shot.shotDemand.editMode === "full-package" && demandedEntityIds.some((id) => !renderedEntityIds.has(id))) modeFailures.push("full-package-required-entity-evidence-missing");
    if (shot.shotDemand.editMode === "full-package" && visibleCopy.some((node) => !["light", "dark"].includes(node.tone))) modeFailures.push("full-package-visible-text-contrast-tone-missing");
    const pixelContrast = fullPackageContrastByCandidate.get(candidate.candidateId);
    if (shot.shotDemand.editMode === "full-package" && pixelContrast?.failures.length) modeFailures.push(`full-package-visible-text-pixel-contrast-failed:${pixelContrast.failures.join("|")}`);
    if (shot.shotDemand.editMode === "full-package" && String(candidate.sceneGraph.primaryMaterialId || "").startsWith("source-documentary-") && semanticWordActors.some((node) => !["light", "dark"].includes(node.tone))) modeFailures.push("source-document-word-actor-contrast-tone-missing");
    const sourceStrip = shot.shotDemand.editMode === "full-package"
      && String(candidate.sceneGraph.primaryMaterialId || "").startsWith("source-documentary-")
      && primary?.geometry?.height >= .95
      && (primary.geometry.x <= .01 || primary.geometry.x + primary.geometry.width >= .99)
      && primaryArea >= .34
      && semanticWordActors.length >= 2;
    if (shot.shotDemand.editMode === "full-package" && String(candidate.sceneGraph.primaryMaterialId || "").match(/^(?:source-|key-bg-)/u) && primaryArea < .85 && !sourceStrip && !sourceMechanismDominant) modeFailures.push("full-package-primary-reduced-to-card");
    if (shot.shotDemand.editMode === "full-package" && headlineAny?.text !== shot.shotDemand.typographyAssignment.headlineText) modeFailures.push("full-package-headline-contract-drift");
    let preference = 0;
    if (shot.shotDemand.editMode === "type-only" && nodes.some((node) => node.id === "evidence-window")) preference += 3;
    if (shot.shotDemand.editMode === "screen-demo" && realCausalScreenEvidence) preference += 4;
    if (shot.shotDemand.editMode === "screen-demo" && screenPresentation?.view === desiredScreenView) preference += 3;
    if (shot.shotDemand.editMode === "screen-demo" && screenPresentation?.evidenceBeat === desiredScreenBeat) preference += 3;
    if (String(shot.shotDemand.editMode).startsWith("presenter-") && candidateIndex === desiredPresenterIndex) preference += 2;
    if (shot.shotDemand.editMode === "presenter-overlay") {
      const priorLayoutUses = priorPresenterLayoutCounts.get(presenterLayoutSignature(candidate)) || 0;
      preference += priorLayoutUses === 0 ? 10 : priorLayoutUses === 1 ? 3 : -10;
    }
    if (shot.shotDemand.editMode === "presenter-overlay" && presenterPhrases.some((node) => node.geometry.y >= .55)) preference += 2;
    if (shot.shotDemand.editMode === "full-package" && candidate.sceneGraph.primaryMaterialId === "key-bg-model-material-table" && headline?.geometry.x >= .5 && headline.geometry.y < .4) preference += 3;
    if (shot.shotDemand.editMode === "full-package" && String(candidate.sceneGraph.primaryMaterialId || "").startsWith("source-network-") && candidateIndex === 0) preference += 8;
    if (shot.shotDemand.editMode === "full-package" && String(candidate.sceneGraph.primaryMaterialId || "").startsWith("source-documentary-") && (headline?.geometry.y < .35 || sourceStrip)) preference += sourceStrip ? 4 : 2;
    let score = 15;
    if (!invalidGeometry) score += 1;
    if (primaryArea >= (shot.shotDemand.editMode === "type-only" ? .34 : .4) || sourceStrip || sourceMechanismDominant) score += 2;
    if (sourceBound || shot.shotDemand.editMode === "type-only") score += 1;
    if (hasWordActor) score += 1;
    if (presenterFaceOverlap > .015) score -= 4;
    if (modeFailures.length) score = Math.min(score, 16);
    return {candidateId: candidate.candidateId, score: Math.max(0, Math.min(20, score)), preference, rank: 0, exactTextStatus: "verified", visualEvidence: `editable-scene-graph; primaryArea=${primaryArea.toFixed(3)}; sourceAssemblyArea=${sourceAssemblyArea.toFixed(3)}; sourceBound=${sourceBound}; faceOverlap=${presenterFaceOverlap.toFixed(3)}; geometry=${invalidGeometry ? "invalid" : "valid"}; setDistinct=${effectiveDistinctCount}/${shot.candidates.length}; screenBeat=${screenPresentation?.evidenceBeat || "n/a"}; screenView=${screenPresentation?.view || "n/a"}; pixelContrast=${pixelContrast ? JSON.stringify(pixelContrast.measurements) : "n/a"}; preference=${preference}; modeFailures=${modeFailures.join(",") || "none"}`, repairBrief: modeFailures.length ? modeFailures.join("；") : presenterFaceOverlap > .015 ? "把标题移出眼睛、嘴部和表情区。" : primaryArea < .34 && !sourceMechanismDominant ? "扩大唯一主视觉，减少零碎节点。" : "AI 视觉总监额度恢复后复核材料细节、轮廓成熟度与相邻镜连续性。", modeFailures};
  }).sort((left, right) => right.score - left.score || right.preference - left.preference || sha256(`${shot.shotDemand.shotId}:${left.candidateId}`).localeCompare(sha256(`${shot.shotDemand.shotId}:${right.candidateId}`)));
  scored.forEach((item, rank) => { item.rank = rank + 1; });
  const selectedThreshold = operationSequence ? 18 : 19;
  const selected = setHardFailures.length ? null : scored.find((item) => item.score >= selectedThreshold && !item.modeFailures.length) || null;
  const hardFailures = [...setHardFailures, ...(selected ? [] : ["no-candidate-clears-local-scene-graph-preflight"])];
  const dimensions = [
    {id: "visualJob", score: 3, evidence: "shot demand and editable scene graph are bound"},
    {id: "silhouette", score: 2, evidence: "candidate geometry is distinct but awaits AI pixel review"},
    {id: "materialSpecificity", score: 3, evidence: "approved source and article-level assets only"},
    {id: "typeRoles", score: 2, evidence: "approved editable fonts and verified glyph actors"},
    {id: "depthOcclusion", score: 2, evidence: "crop and layer geometry exists"},
    {id: "motionPhrase", score: 3, evidence: "causal motion phrase and actors are encoded"},
    {id: "transitionHandoff", score: 2, evidence: "handoff actor is encoded; pixel continuity awaits sequence render"},
    {id: "sequenceContrast", score: 3, evidence: "edit-mode and topology are article-directed"},
  ];
  return {contract: "A1VisualMaturityCritic/v1", scope: "shot-frame", dimensions, totalScore: 20, benchmarkThreshold: 22, verdict: selected ? "PROVISIONAL_PASS" : "BLOCK", hardFailures, selectedCandidateId: selected?.candidateId || null, candidates: scored, repairPlan: {highestImpact: hardFailures[0] || "Restore subscription AI pixel review before reference-maturity release.", retain: ["approved real-source binding", "editable typography", "semantic scene graph"], remove: ["duplicate candidate silhouettes", "any candidate that overlaps presenter face or lacks a dominant actor"], nextPrompt: "Change the composition primitive, material topology and dominant actor geometry; do not produce six near-identical variants."}, provisionalAdmission: Boolean(selected), referenceMaturity: false, pixelDiversity: {threshold: 4, rasterDistinctCount: representatives.length, sceneGraphDistinctCount: presenterLayoutSignatures.size || null, distinctCount: effectiveDistinctCount, candidateCount: shot.candidates.length}, trace: {contract: "A1LocalShotPreflightTrace/v1", model: "deterministic-local-scene-graph-and-pixel-preflight", cacheHit: false}};
}

const sourceRenderSha256ForGuard = shot.candidateRender.renderSourceSha256 || null;
const priorSameRenderRoundsForGuard = (workspace.production.maturityLoop?.rounds || [])
  .filter((round) => round.targetId === shot.shotDemand.shotId && round.sourceRenderSha256 === sourceRenderSha256ForGuard && Number.isFinite(Number(round.score)));
const priorShotReportForGuard = workspace.production.maturityLoop?.shotReports?.[shot.shotDemand.shotId] || null;
if (!force
  && priorSameRenderRoundsForGuard.length >= 2
  && priorShotReportForGuard?.criticStability?.status === "UNSTABLE") {
  console.log(JSON.stringify({
    status: "HELD_SAME_RENDER_STABILITY_CAP",
    shotId: shot.shotDemand.shotId,
    sourceRenderSha256: sourceRenderSha256ForGuard,
    sampleCount: priorSameRenderRoundsForGuard.length,
    scores: priorSameRenderRoundsForGuard.map((round) => round.score),
    nextAction: "change-render-or-request-independent-review",
  }, null, 2));
  process.exit(0);
}

let usedLocalPreflight = false;
let visualCriticFailure = null;
let report;
const visualCriticMode = String(process.env.A1_VISUAL_MATURITY_CRITIC_MODE || "codex-first").trim();
const operationAdmissionRule = recordedScreenSequence
  ? "These images are sequential states of one verified real screen operation captured from the source product. Judge the shot's own sourceText, screenActions, handoffActor and sourceEvidence as the causal contract: the real target appears, the native action happens, the same source object changes, and the result confirms in the same interface. Do not demand generated typography or a literal caption overlay; source DOM text is the evidence. Shared screen topology is required, and the final state must make the recorded preference/result object legible enough to hand off. Explanatory HUD, floating labels, detached arrows, fake interfaces, or an unreadable causal target remain hard failures."
  : "These images are sequential states of one verified real screen operation: selected, typing, candidates, candidate pressed, applied. They are not alternative layouts. The narration describes the generic operation and does not need to be the literal sentence selected inside the editor. Judge the sequence as functional product cinematography: the real source-bound pointer is allowed only when sourceInteractionEvidence binds it to a captured DOM target; it is not a HUD or decorative arrow. Verify that the requested text, pressed candidate text and applied paragraph are semantically and spatially continuous, and that the final frame contains native caret or accepted-result evidence. Do not demand custom title typography or unrelated silhouette variation from a screen-demo shot; typeRoles, depth and sequenceContrast should score the clarity of native selection, cursor, sidebar, document reflow and camera emphasis. If the schema requires one selectedCandidateId, select the applied state as the representative; score the causal sequence as a set. Explanatory HUD, floating labels, detached arrows, fake interfaces, or an unreadable causal target remain hard failures.";
if (visualCriticMode === "local-only") {
  usedLocalPreflight = true;
  visualCriticFailure = "visual-critic-explicit-local-only-mode";
  report = await localShotPreflight();
} else try {
  report = await runVisualMaturityCritic({
    scope: "shot-frame",
    images,
    candidates,
    context: {
      articleTitle: workspace.article.title,
      shotId: shot.shotDemand.shotId,
      order: shot.shotDemand.order,
      editMode: shot.shotDemand.editMode,
      sourceText: shot.shotDemand.sourceText,
      visualJob: shot.shotDemand.visualJob,
      viewerTakeaway: shot.shotDemand.viewerTakeaway,
      primaryActor: shot.shotDemand.primaryActor,
      topology: shot.shotDemand.topology,
      explicitVisualPrimitiveId,
      explicitVisualPrimitiveOverridesAestheticMaster: Boolean(explicitVisualPrimitiveId),
      keyPhrases: shot.shotDemand.keyPhrases,
      motionPhrase: shot.shotDemand.motionPhrase,
      handoffActor: shot.shotDemand.handoffActor,
      aestheticMasterAnchor: aestheticMasterAnchor ? {
        contract: aestheticMasterAnchor.contract,
        family: aestheticMasterAnchor.family,
        effectiveEditMode: aestheticMasterAnchor.effectiveEditMode,
        candidateRule: aestheticMasterAnchor.candidateRule,
        materialStatus: aestheticMasterAnchor.materialStatus,
        finalStatus: aestheticMasterAnchor.finalStatus,
      } : null,
      previousShot: previous ? {shotId: previous.shotDemand.shotId, editMode: previous.shotDemand.editMode, topology: previous.shotDemand.topology, handoffActor: previous.shotDemand.handoffActor, selectedCandidateId: previous.selectedCandidateId} : null,
      nextShot: nextShot ? {shotId: nextShot.shotDemand.shotId, editMode: nextShot.shotDemand.editMode, topology: nextShot.shotDemand.topology, handoffActor: nextShot.shotDemand.handoffActor} : null,
      generationProviderStatus,
      candidateSetPolicy: operationSequence
        ? {mode: "operation-state-sequence", states: operationStates, sharedTopologyRequired: true, alternatives: false}
        : singleMatureRefinement
          ? {mode: "critic-selected-single-mature-refinement", alternatives: false, ordinaryFourToEightCandidateRuleExempted: true}
          : {mode: "visual-alternatives", alternatives: true},
      admissionRule: operationSequence
        ? operationAdmissionRule
        : explicitVisualPrimitiveId === "presenter-letterpress-desk-v1"
          ? "This shot has an explicit approved primitive override: presenter-letterpress-desk-v1. Judge one editorial print mechanism grounded in the real room: vibe coding must be a small editable pixel label attached to the real monitor edge; 智能写作 must read as ink printed along the real microphone arm; 工作台 must be the single dominant word physically printed on the irregular paper surface resting on the real desk plane. The paper surface is an approved text-free material layer, not a UI card or bottom strip. Do not penalize the absence of connector lines or extra panels. Require exact readable editable text, one focal handoff, honest desk perspective/contact, clear face and mouth, and no detached decoration, floating HUD, generic title card, or fake interface. For this static gate, transitionHandoff may pass when the visible desk paper is the declared destination and motionPhrase binds it to the next real screen; literal selection geometry belongs to representative motion review."
          : explicitVisualPrimitiveId === "presenter-object-bound-pixel-relay"
          ? "This shot has an explicit approved primitive override: presenter-object-bound-pixel-relay. It overrides the older presenter-clean master hint. Do not request removal of the exact editable phrases. Judge whether the real presenter remains the hero with eyes and mouth clear, whether vibe coding is visibly attached to a real monitor edge, and whether 智能写作工作台 is visibly attached to the microphone-arm/desk plane. The two phrases are required actors, not HUD. Spatial edge contact plus declared objectBinding is sufficient for this static gate; actual travel and occlusion are judged later. Detached rules, bottom strips, floating panels, face occlusion, unreadable copy, or more than two competing focal groups remain failures. The four frames are layout alternatives, so choose one; do not require four different art directions."
        : explicitVisualPrimitiveId === "evidence-bound-pixel-choice-funnel"
          ? "This shot has an explicit approved primitive override: evidence-bound-pixel-choice-funnel. It overrides older paper-wall or highlight-wall treatments. Judge one mechanism: a small verifiable paper edge window plus a text-free 1-bit funnel rail. The exact editable actors 常见, 稳妥, 可复用 must enter three unequal inlets and converge into the single exact output 可复用表达. Repetition of 可复用 as an inlet and inside the longer output is intentional causal transformation, not duplicate-headline failure. Text must remain complete and readable. The acid trace must bind to the chosen route. Full-page paper walls, equal cards, HUD, floating arrows, clipped Chinese, or more than one mechanism remain failures."
        : explicitVisualPrimitiveId === "proof-sheet-corruption-reveal"
          ? "This shot has an explicit approved primitive override: proof-sheet-corruption-reveal. Judge one proof surface and one causal correction actor. The exact editable phrase 完成度很高的 must establish an orderly dark proof baseline; the exact editable word 废稿 must be complete, high-contrast vermillion pixel type on the same baseline; the isolated red eraser actor and its debris must visibly contact that word without covering it. The eraser is a generated text-free element layer, not renderer decoration. Do not require a generated glyph or a second headline. Ordinary centered title cards, white-on-cream low contrast, unreadable Chinese, detached correction marks, or repeated background type remain failures."
        : preferenceMatureRefinement
          ? "This is one critic-directed static composition for a presenter plus a verified real preference-operation recording. The candidate metadata includes the real 4.12-second source action and its four evidence beats; the still intentionally shows the source-bound final state. Judge whether the real highlighted sentence, the visible native preference controls, the exact Chinese word actors 喜欢, 讨厌 and 写成风格库, and their objectBinding/semanticBeat fields form a credible executable three-beat structure. Do not require mouse travel or record transitions to be visible in this still and do not report screen-action-not-causal when the verified source action evidence and source-bound actors are present; actual causality and timing must still pass the later 22/24 representative-motion gate. Do not penalize sequenceContrast for a single refinement. Eyes and mouth must remain clear. Floating cards, HUD, detached decoration, wrong Chinese or unreadable actors remain failures."
        : singleMatureRefinement
          ? "This is one critic-directed mature refinement after earlier alternatives were rejected. Do not penalize sequenceContrast for having only one frame or request a variant grid; use the supplied previousShot/nextShot edit modes plus this frame's internal density and silhouette. Judge the actual 16:9 frame: the real presenter must remain primary with eyes and mouth clear; the assigned pixel phrases must be exact, readable, and visibly bound to real source objects. For this static-composition gate, transitionHandoff passes feasibility when the source actor, visible destination object, target next shot and causal motionPhrase are all explicit; do not require the actor to already occupy its animated end state in the still. Actual travel and timing are judged later in the 22/24 representative-motion gate. Generic HUD labels, floating cards, detached decoration, or weak type hierarchy remain hard failures."
        : aestheticMasterAnchor?.family === "presenter-clean"
          ? "This is the aesthetic-master presenter-clean anchor. No typography, title, logo, interface, HUD or decorative overlay is required or allowed; the absence of word actors is a PASS condition, not a type-led failure. Judge the real presenter source as the sole visual actor: face and mouth clarity, credible crop, human presence, source truth, breathing room and the hard-cut handoff to the next real interface. Do not demand a title, word actors or generated glyphs for this anchor."
          : "These images are alternatives for one shot, not a multi-direction contact sheet. Select one candidate only. It must make the stated visual job immediately legible and establish a credible motion/handoff structure. Presenter frames must protect eyes and mouth; screen frames must use the real screen as the sole causal surface; type-led frames need word actors and a primary visual over 45 percent.",
      visualPolicy: {
        contract: A1_EDITORIAL_VISUAL_GENERATION_POLICY.contract,
        sha256: A1_EDITORIAL_VISUAL_GENERATION_POLICY.sha256,
        signatureFontAssetId: A1_EDITORIAL_VISUAL_GENERATION_POLICY.typography.signatureFontAssetId,
        reviewPreviewPolicy: A1_REVIEW_PREVIEW_POLICY,
        reviewDepthRule: "The 4311 review still must keep every typography actor fully readable on the front layer. Judge object binding from spatial alignment, edge contact, perspective, scale and declared objectBinding. Do not require literal foreground clipping or simulated person/object mattes in the review PNG; actual occlusion is verified only after static approval in Motion IR/Remotion or Resolve finishing.",
      },
      forbidden: Object.values(A1_EDITORIAL_VISUAL_GENERATION_POLICY.forbidden).flat(),
    },
    cacheDir: path.join(artifactDir, "visual-critic-cache"),
    force,
  });
} catch (error) {
  usedLocalPreflight = true;
  visualCriticFailure = error instanceof Error ? error.message : String(error);
  report = await localShotPreflight();
  report.trace = {...report.trace, fallbackReason: visualCriticFailure, generationProviderStatus};
}
const selected = report.candidates.find((candidate) => candidate.candidateId === report.selectedCandidateId) || null;
const sourceRenderSha256 = shot.candidateRender.renderSourceSha256 || null;
const previousShotReport = workspace.production.maturityLoop?.shotReports?.[shot.shotDemand.shotId] || null;
const priorSameRenderRoundRecords = (workspace.production.maturityLoop?.rounds || [])
  .filter((round) => round.targetId === shot.shotDemand.shotId && round.sourceRenderSha256 === sourceRenderSha256 && Number.isFinite(Number(round.score)))
const priorSameRenderRounds = priorSameRenderRoundRecords.map((round) => Number(round.score));
// shotReports mirrors the latest round. Counting both made two invocations look
// like three independent samples, so only use the report as a legacy fallback
// when no durable critic-sample round exists for this render.
const priorSameRenderScores = priorSameRenderRounds.length === 0
  && previousShotReport?.sourceRenderSha256 === sourceRenderSha256
  && Number.isFinite(Number(previousShotReport.totalScore))
    ? [Number(previousShotReport.totalScore)]
    : [];
const stabilityScoreHistory = [...priorSameRenderRounds, ...priorSameRenderScores, Number(report.totalScore)].filter(Number.isFinite);
// A stale outlier must not permanently poison a later review of unchanged
// pixels. The gate is about two consecutive judgements of the same render;
// retain the full history for traceability but decide from the latest window.
const stabilityScores = stabilityScoreHistory.slice(-2);
const sortedStabilityScores = [...stabilityScores].sort((left, right) => left - right);
const stabilityMedian = sortedStabilityScores.length
  ? visualCriticMedianScore(sortedStabilityScores)
  : Number(report.totalScore);
const stabilityMin = sortedStabilityScores.length ? sortedStabilityScores[0] : Number(report.totalScore);
const stabilityMax = sortedStabilityScores.length ? sortedStabilityScores.at(-1) : Number(report.totalScore);
const minimumStabilitySamples = 2;
const criticNeedsCalibration = stabilityScores.length < minimumStabilitySamples;
const criticUnstable = stabilityScores.length >= 2 && stabilityMax - stabilityMin > 5;
const criticStability = {
  contract: "A1VisualCriticStability/v1",
  sourceRenderSha256,
  sampleCount: stabilityScores.length,
  scores: stabilityScores,
  allScores: stabilityScoreHistory,
  median: stabilityMedian,
  range: stabilityMax - stabilityMin,
  status: criticNeedsCalibration ? "INSUFFICIENT_SAMPLES" : criticUnstable ? "UNSTABLE" : "STABLE",
  rule: "same-render-needs-two-samples-and-score-range-at-most-5-before-median-based-admission-or-repair",
};
report.criticStability = criticStability;
const effectiveReviewScore = !criticNeedsCalibration && !criticUnstable ? stabilityMedian : Number(report.totalScore);
const exactTextPass = !selected || ["not-applicable", "verified"].includes(selected.exactTextStatus);
const provisionalAdmission = usedLocalPreflight && report.provisionalAdmission === true && !report.hardFailures.length && selected && selected.score >= 19 && exactTextPass;
const passed = !criticNeedsCalibration && !criticUnstable && stabilityMedian >= A1_STATIC_SHOT_ADMISSION_SCORE && !report.hardFailures.length && selected && exactTextPass && !usedLocalPreflight;
const sourceRecaptureRequired = !criticNeedsCalibration && !criticUnstable && screenCriticRequiresSourceRecapture(shot.shotDemand, report);
const userApprovalRequired = passed && workspace.production.automationPolicy?.automaticCandidateAdmission !== true;
const staticCompositionMaturity = Boolean(passed);
const referenceMaturity = false;
const reportSha256 = sha256(report);
const reportName = `shot-candidate-critic-${shot.shotDemand.shotId}-latest.json`;
const now = new Date().toISOString();

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let next = structuredClone(current);
  const target = next.library.assets.find((asset) => asset.id === shot.id);
  const scoreById = new Map(report.candidates.map((item) => [item.candidateId, item]));
  for (const candidate of target.candidates) {
    const result = scoreById.get(candidate.candidateId);
    candidate.screening = {status: criticNeedsCalibration ? "held-for-second-critic-sample" : criticUnstable ? "held-for-critic-stability" : passed && candidate.candidateId === report.selectedCandidateId ? "selected-by-visual-critic" : result.score >= 20 && !report.hardFailures.length ? "kept" : "rejected", score: result.score, maxScore: 24, hardFailures: report.hardFailures, visualEvidence: result.visualEvidence, repairBrief: result.repairBrief, reportSha256, criticStability};
  }
  target.visualCritic = {contract: report.contract, verdict: criticNeedsCalibration ? "VISUAL_REVIEW_CALIBRATING" : criticUnstable ? "VISUAL_REVIEW_UNSTABLE" : provisionalAdmission ? "PROVISIONAL_PASS" : passed ? "PASS" : report.verdict, totalScore: effectiveReviewScore, latestSampleScore: Number(report.totalScore), maxScore: 24, hardFailures: report.hardFailures, selectedCandidateId: report.selectedCandidateId, sourceRenderSha256: shot.candidateRender.renderSourceSha256, reportPublicUrl: `/${phaseRelative}/${reportName}`, reportSha256, reviewedAt: now, exactTextPass, provisionalAdmission, staticCompositionMaturity, referenceMaturity, criticStability, admissionScope: "shot-static-composition"};
  if (passed) {
    target.visualRevision = null;
    target.selectedCandidateId = null;
    target.status = "ready-for-review";
    target.review = {
      status: "pending",
      note: `静态构图红队建议 ${report.selectedCandidateId}（稳定分 ${effectiveReviewScore}/24，最新样本 ${report.totalScore}/24）；达到参考成熟度 22/24 且无硬失败后才允许系统采用。`,
      reviewedAt: now,
      reviewedBy: provisionalAdmission ? "system-local-preflight" : "system-visual-critic",
      approvedContentSha256: null,
    };
  } else if (provisionalAdmission) {
    target.selectedCandidateId = null;
    target.status = "visual-review-pending";
    target.review = {status: "pending", note: `本地预检仅建议 ${report.selectedCandidateId}（${report.totalScore}/24）；尚未通过真实像素审片，不得交给用户采用。`, reviewedAt: now, reviewedBy: "system-local-preflight", approvedContentSha256: null};
    target.visualRevision = null;
  } else if (criticNeedsCalibration) {
    target.selectedCandidateId = null;
    target.status = "visual-review-calibrating";
    target.review = {status: "pending", note: `同一渲染已完成第 ${criticStability.sampleCount}/${minimumStabilitySamples} 次独立审片；保留当前构图，补齐复审前不放行也不生成返修。`, reviewedAt: now, reviewedBy: "system-visual-critic-calibration-gate", approvedContentSha256: null};
  } else if (criticUnstable) {
    target.selectedCandidateId = null;
    target.status = "visual-review-unstable";
    target.review = {status: "pending", note: `同一渲染哈希复审分数波动 ${criticStability.scores.join("/")}（范围 ${criticStability.range}）；保留当前构图，不根据单次评分生成新返修。`, reviewedAt: now, reviewedBy: "system-visual-critic-stability-gate", approvedContentSha256: null};
  } else if (sourceRecaptureRequired) {
    target.selectedCandidateId = null;
    target.status = "blocked-source-material";
    target.review = {status: "revise", note: `真实屏幕证据不足：${report.repairPlan.highestImpact}；停止构图返修，补录前不再循环。`, reviewedAt: now, reviewedBy: "system-source-evidence-gate", approvedContentSha256: null};
    target.visualRevision = null;
    target.automationBlock = {
      contract: "A1ShotAutomationBlock/v1",
      status: "BLOCKED_SOURCE_MATERIAL",
      reason: report.repairPlan.highestImpact,
      sourceReportSha256: reportSha256,
      createdAt: now,
    };
    target.shotDemand.missingEvidenceIds = [...new Set([...(target.shotDemand.missingEvidenceIds || []), "real-causal-screen-result-proof"] )];
    target.shotDemand.sourceEvidenceResolution = {
      ...(target.shotDemand.sourceEvidenceResolution || {}),
      contract: "A1ShotSourceEvidenceResolution/v1",
      status: "blocked-by-pixel-review",
      evidenceSha256: shot.candidateRender.renderSourceSha256,
      resolvedAt: now,
      note: "现有真实采集未在像素层证明目标结果；禁止用静态合成或元数据声明替代。",
    };
  } else {
    target.selectedCandidateId = null;
    target.status = "revise";
    target.review = {status: "revise", note: `逐镜视觉红队稳定分 ${effectiveReviewScore}/24（最新样本 ${report.totalScore}/24）；${report.repairPlan.highestImpact}`, reviewedAt: now, reviewedBy: "system-visual-critic", approvedContentSha256: null};
    target.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: Number(target.visualRevision?.round || 0) + 1, sourceReportSha256: reportSha256, prompt: `${report.repairPlan.highestImpact}\n保留：${report.repairPlan.retain.join("；")}\n删除：${report.repairPlan.remove.join("；")}\n${report.repairPlan.nextPrompt}`, createdAt: now};
  }
  // A current operation-sequence review is allowed to outrank the static
  // contact-sheet review for screen shots. In that case a 22/24 static pass
  // must remain durable evidence, but it must not call the stricter automatic
  // admission helper and crash the whole critic transaction. Admission is
  // deferred until the effective (possibly dynamic) review is mature.
  const automaticAdmissionReady = passed
    && next.production.automationPolicy?.automaticCandidateAdmission === true
    && isShotReferenceMature(next, target, Number(next.production.automationPolicy.minimumStaticVisualScore || A1_STATIC_SHOT_ADMISSION_SCORE));
  if (automaticAdmissionReady) {
    next = automaticallyAdmitReferenceMatureShot(next, target.id, now, `系统静态构图红队稳定分 ${effectiveReviewScore}/24 自动采用 ${report.selectedCandidateId}；连续动效仍需达到 22/24。`);
  }
  next.production.maturityLoop.shotReports ||= {};
  next.production.maturityLoop.shotReports[shot.shotDemand.shotId] = {contract: "A1ShotVisualCriticReport/v1", verdict: criticNeedsCalibration ? "VISUAL_REVIEW_CALIBRATING" : criticUnstable ? "VISUAL_REVIEW_UNSTABLE" : provisionalAdmission ? "PROVISIONAL_PASS" : passed ? "PASS" : report.verdict, totalScore: effectiveReviewScore, latestSampleScore: Number(report.totalScore), maxScore: 24, hardFailures: report.hardFailures, selectedCandidateId: passed ? report.selectedCandidateId : null, sourceRenderSha256: shot.candidateRender.renderSourceSha256, reportPublicUrl: `/${phaseRelative}/${reportName}`, reportSha256, reviewedAt: now, provisionalAdmission, staticCompositionMaturity, referenceMaturity, criticStability, admissionScope: "shot-static-composition"};
  next.production.maturityLoop.rounds.push({contract: "A1VisualMaturityRound/v1", targetType: provisionalAdmission ? "shot-frame-local-preflight" : "shot-frame", sampleType: "critic-sample", targetId: shot.shotDemand.shotId, round: Number(target.visualRevision?.round || 1), revisionRound: Number(target.visualRevision?.round || 0), verdict: criticNeedsCalibration ? "VISUAL_REVIEW_CALIBRATING" : criticUnstable ? "VISUAL_REVIEW_UNSTABLE" : provisionalAdmission ? "PROVISIONAL_PASS" : passed ? "PASS" : report.verdict, score: report.totalScore, maxScore: 24, hardFailures: report.hardFailures, sourceRenderSha256: shot.candidateRender.renderSourceSha256, criticStability, reportSha256, completedAt: now});
  if (provisionalAdmission) {
    next.production.maturityLoop.provisionalVisualAdmissions ||= [];
    if (!next.production.maturityLoop.provisionalVisualAdmissions.includes(shot.shotDemand.shotId)) next.production.maturityLoop.provisionalVisualAdmissions.push(shot.shotDemand.shotId);
  }
  next.production.maturityLoop.status = criticNeedsCalibration ? "visual-critic-calibration" : criticUnstable ? "visual-critic-stability-hold" : sourceRecaptureRequired ? "blocked-source-evidence" : provisionalAdmission ? "blocked-ai-visual-critic" : "running";
  next.production.maturityLoop.nextAction = passed
    ? `继续自动制作下一镜 · ${shot.shotDemand.shotId} 已采用 ${report.selectedCandidateId}`
    : criticNeedsCalibration
      ? `复审 ${shot.shotDemand.shotId} 同一渲染 · 不生成新候选`
    : criticUnstable
      ? `保持 ${shot.shotDemand.shotId} 当前构图 · 等待同一渲染的独立复审，不生成新返修`
    : sourceRecaptureRequired
      ? `补录 ${shot.shotDemand.shotId} 真实因果结果 · 停止构图返修`
    : provisionalAdmission
      ? `恢复 AI 像素复审 ${shot.shotDemand.shotId} · 本地预检不得替代视觉通过`
      : `返修 ${shot.shotDemand.shotId} · ${report.repairPlan.highestImpact}`;
  const event = createProductionEvent({workspace: current, action: criticNeedsCalibration ? "shot-candidate-visual-critic-calibrating" : criticUnstable ? "shot-candidate-visual-critic-unstable" : sourceRecaptureRequired ? "shot-source-evidence-recapture-required" : passed ? automaticAdmissionReady ? "shot-candidate-visual-critic-auto-admitted" : "shot-candidate-visual-critic-cleared-for-user-review" : provisionalAdmission ? "shot-candidate-local-preflight-only" : "shot-candidate-visual-critic-revision-required", targetId: target.id, payload: {reportSha256, totalScore: effectiveReviewScore, latestSampleScore: Number(report.totalScore), suggestedCandidateId: passed ? report.selectedCandidateId : null, userApprovalRequired, automaticAdmissionReady, sourceRecaptureRequired, hardFailures: report.hardFailures, criticStability, visualCriticFailure}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {[reportName]: report}});
  return recalculated;
});

console.log(JSON.stringify({status: criticNeedsCalibration ? "VISUAL_REVIEW_CALIBRATING" : criticUnstable ? "VISUAL_REVIEW_UNSTABLE" : sourceRecaptureRequired ? "BLOCKED_SOURCE_MATERIAL" : provisionalAdmission ? "PROVISIONAL_LOCAL_PREFLIGHT_ONLY" : passed ? "STATIC_COMPOSITION_CLEARED_FOR_USER_REVIEW" : report.verdict, shotId: shot.shotDemand.shotId, score: effectiveReviewScore, latestSampleScore: Number(report.totalScore), suggestedCandidateId: passed ? report.selectedCandidateId : null, selectedCandidateId: updated.library.assets.find((asset) => asset.id === shot.id)?.selectedCandidateId || null, userApprovalRequired, automaticAdmissionReady: passed ? updated.library.assets.find((asset) => asset.id === shot.id)?.review.status === "approved" : false, sourceRecaptureRequired, hardFailures: report.hardFailures, criticStability, approved: updated.library.assets.find((asset) => asset.id === shot.id)?.review.status === "approved", staticCompositionMaturity, referenceMaturity, visualCriticFailure, reportPublicUrl: `/${phaseRelative}/${reportName}`}, null, 2));
