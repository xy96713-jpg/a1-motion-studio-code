#!/usr/bin/env node
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {A1_CURRENT_FORMAL_FONT_ASSET_ID, createProductionEvent, createSceneGraphCandidates} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildMotionIrSceneFromAcceptedShot} from "../apps/studio-next/src/lib/a1-project-accepted-shot-ir-v2.mjs";
import {
  adoptGeneratedVisualCandidate,
  buildVisualTreatmentAudit,
  queueVisualGenerationBrief,
  registerGeneratedCompositeBatchReview,
  registerGeneratedTreatmentBatchReview,
  reviseVisualGenerationBrief,
} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";
import {runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";
import {runTreatmentBatchCritic} from "../apps/studio-next/src/lib/a1-treatment-batch-critic-v1.mjs";
import {
  resolveShotFamilyCompositorSpec,
  resolveTreatmentCompositorSpec,
  resolveTreatmentMaterialRouting,
  validateShotFamilyCompositorGraph,
  validateTreatmentCompositorGraph,
} from "../apps/studio-next/src/lib/a1-treatment-compositor-contract-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {writeGenerationRuntimeSidecar} from "../apps/studio-next/src/lib/a1-generation-runtime-sidecar-v1.mjs";
import {buildDirtySet, dirtySetSnapshotEntries} from "../apps/studio-next/src/lib/a1-dirty-set-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const appPublic = path.join(appRoot, "public");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublic = path.join(rendererRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const candidateArg = process.argv.find((item) => item.startsWith("--candidateId="))?.split("=")[1] || null;
const renderOnly = process.argv.includes("--render-only");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const publicFile = (publicUrl) => path.join(appPublic, String(publicUrl || "").replace(/^\/+/, ""));
const publicUrlFor = (file) => `/${path.relative(appPublic, file).split(path.sep).join("/")}`;
const compactProgressError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to lookup address|nodename nor servname|ENOTFOUND|EAI_AGAIN/iu.test(message)) return "visual-critic-network-unavailable:dns-resolution-failed";
  const timeout = message.match(/treatment-batch-critic-timeout:\d+s/u)?.[0];
  if (timeout) return timeout;
  const cliFailure = message.match(/treatment-batch-critic-failed:([^\s:]+)/u)?.[1];
  if (cliFailure) return `visual-critic-cli-failed:exit-${cliFailure}`;
  return message.replace(/\s+/gu, " ").slice(0, 600);
};
const compositorSourceSha256 = sha256(Buffer.concat([
  fs.readFileSync(path.join(rendererRoot, "src/AcceptedEditorialSequenceV2.tsx")),
  fs.readFileSync(path.join(appRoot, "src/lib/a1-treatment-compositor-contract-v1.mjs")),
  fs.readFileSync(fileURLToPath(import.meta.url)),
]));
const workerStartedAt = Date.now();
const renderStageTimeoutMs = Math.max(30_000, Number(process.env.A1_TREATMENT_RENDER_STAGE_TIMEOUT_MS || 120_000));
let treatmentProgress = {phase: "idle", completedCount: 0, totalCount: 0, batchHash: null, timeoutMs: null};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withProjectLockRetry(run, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return withProjectLock(appRoot, run);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "production-state-write-in-progress" || attempt === attempts - 1) throw error;
      await sleep(150);
    }
  }
  throw new Error("generated-composite-production-state-write-lock-timeout");
}

function writeReviewDirtySet(candidates, briefs) {
  const previous = fs.existsSync(reviewDirtySetPath)
    ? (() => { try { return JSON.parse(fs.readFileSync(reviewDirtySetPath, "utf8")); } catch { return null; } })()
    : null;
  const currentEntries = candidates.map((candidate) => {
    const brief = briefs.find((item) => item.id === candidate.briefId);
    const staleRenderer = !candidate.compositePreview?.publicUrl?.includes(`-${compositorSourceSha256.slice(0, 12)}/`);
    const compositeFile = candidate.compositePreview?.publicUrl ? publicFile(candidate.compositePreview.publicUrl) : null;
    const compositeExists = Boolean(compositeFile && fs.existsSync(compositeFile));
    return {
      key: candidate.id,
      candidateId: candidate.id,
      shotId: candidate.shotId || null,
      fingerprint: sha256({
        briefHash: candidate.briefHash || brief?.briefHash || null,
        treatmentHash: candidate.treatmentHash || brief?.treatmentHash || null,
        rawSha256: candidate.rawArtifact?.sha256 || candidate.artifact?.sha256 || candidate.output?.sha256 || null,
        compositorSourceSha256,
      }),
      outputExists: compositeExists,
      outputValid: compositeExists && !staleRenderer,
      reviewInvalidated: staleRenderer,
    };
  });
  const dirtySet = buildDirtySet({currentEntries, previousEntries: previous?.entries || []});
  const snapshot = {
    ...dirtySet,
    generatedAt: new Date().toISOString(),
    policy: "render-only-on-input-change; critic-on-content-addressed-board",
    entries: dirtySetSnapshotEntries(currentEntries).map((entry) => ({
      ...entry,
      dirty: dirtySet.dirtyIds.includes(entry.key),
      reasons: dirtySet.entries.find((item) => item.key === entry.key)?.reasons || [],
    })),
  };
  fs.mkdirSync(path.dirname(reviewDirtySetPath), {recursive: true});
  const temporary = `${reviewDirtySetPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, reviewDirtySetPath);
  return snapshot;
}

const {artifactDir} = projectDirs(appRoot);
const reviewDirtySetPath = path.join(artifactDir, "generated-visual-review-dirty-set-v1.json");
const workerLock = path.join(artifactDir, ".generated-visual-composite-worker.lock");
let workerHandle;
try {
  workerHandle = fs.openSync(workerLock, "wx");
  fs.writeSync(workerHandle, String(process.pid));
} catch {
  let ownerPid = null;
  try { ownerPid = Number(fs.readFileSync(workerLock, "utf8").trim()) || null; } catch {}
  let ownerAlive = false;
  if (ownerPid && ownerPid !== process.pid) {
    try { process.kill(ownerPid, 0); ownerAlive = true; } catch {}
  }
  if (ownerAlive) {
    console.log(JSON.stringify({status: "SKIPPED", reason: "generated-visual-composite-worker-already-running", ownerPid}));
    process.exit(0);
  }
  // An interrupted worker can leave an empty or dead-owner lock behind. It
  // is safe to reclaim only when no live owner can be found; rendered evidence
  // remains untouched.
  fs.rmSync(workerLock, {force: true});
  workerHandle = fs.openSync(workerLock, "wx");
  fs.writeSync(workerHandle, String(process.pid));
}

function updateTreatmentProgress(phase, patch = {}) {
  treatmentProgress = {...treatmentProgress, ...patch, phase};
  const payload = {
    contract: "A1TreatmentBatchProgress/v1",
    status: ["complete", "failed"].includes(phase) ? phase : "running",
    phase,
    completedCount: Number(treatmentProgress.completedCount || 0),
    totalCount: Number(treatmentProgress.totalCount || 0),
    batchHash: treatmentProgress.batchHash || null,
    timeoutMs: treatmentProgress.timeoutMs || null,
    error: treatmentProgress.error || null,
    elapsedMs: Date.now() - workerStartedAt,
    heartbeatAt: new Date().toISOString(),
    compositorSourceSha256,
  };
  console.log(JSON.stringify({status: "TREATMENT_BATCH_PROGRESS", ...payload}));
  writeGenerationRuntimeSidecar(artifactDir, {
    phase,
    status: payload.status,
    batchId: payload.batchHash,
    queued: 0,
    running: payload.status === "running" ? 1 : 0,
    completed: payload.completedCount,
    failed: payload.status === "failed" ? 1 : 0,
    wallClockMs: payload.elapsedMs,
    durationMs: payload.elapsedMs,
    heartbeatAt: payload.heartbeatAt,
    source: "generated-visual-composite-worker",
  });
  if (!["complete", "failed"].includes(phase)) return payload;
  try {
    withProjectLock(appRoot, () => {
      const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
      const next = structuredClone(current);
      next.production.visualDirector.treatmentBatchProgress = payload;
      persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next));
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "production-state-write-in-progress") console.error(JSON.stringify({status: "TREATMENT_BATCH_PROGRESS_WRITE_FAILED", error: error instanceof Error ? error.message : String(error)}));
  }
  return payload;
}

function mirrorPublicAsset(publicUrl) {
  if (!String(publicUrl || "").startsWith("/")) return;
  const source = publicFile(publicUrl);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
  const destination = path.join(rendererPublic, String(publicUrl).replace(/^\/+/, ""));
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  if (!fs.existsSync(destination) || sha256(fs.readFileSync(destination)) !== sha256(fs.readFileSync(source))) fs.copyFileSync(source, destination);
}

function materialBinding(workspace, assetId) {
  const asset = workspace.library.assets.find((item) => item.id === assetId);
  if (!asset || asset.review?.status !== "approved") throw new Error(`generated-composite-material-not-approved:${assetId}`);
  const glyph = asset.route === "generated-glyph"
    ? asset.typographySpec?.generatedCandidates?.find((item) => item.id === asset.selectedCandidateId)
    : null;
  const glyphUri = [glyph?.cutoutPublicUrl, glyph?.publicUrl, asset.assetUri]
    .filter(Boolean)
    .find((uri) => fs.existsSync(publicFile(uri))) || null;
  const binding = {
    assetId,
    // A selected generated-glyph cutout can be stale after a repair round.
    // For a review-only composite, use the verified full-frame source when the
    // cutout is absent; never hand Remotion a URL that cannot be decoded.
    assetUri: glyphUri,
    sha256: glyphUri === glyph?.cutoutPublicUrl ? glyph?.cutoutSha256 : glyphUri === glyph?.publicUrl ? glyph?.sha256 : asset.sha256,
    contentSha256: asset.contentSha256,
    provenance: asset.provenance,
    videoEvidence: asset.videoEvidence || null,
  };
  mirrorPublicAsset(binding.assetUri);
  for (const frame of binding.videoEvidence?.evidenceFrames || []) mirrorPublicAsset(frame.publicUrl);
  if (binding.videoEvidence?.publicUrl) mirrorPublicAsset(binding.videoEvidence.publicUrl);
  return binding;
}

function provisionalAsset(candidate, brief, now) {
  const content = {
    id: `provisional-${candidate.id}`,
    stageId: candidate.layerId === "scene-surface" ? "key-backgrounds" : "element-atlas",
    title: `${candidate.shotId}/${candidate.layerId} provisional composite input`,
    purpose: "Review-only generated visual layer before automatic acceptance.",
    route: "editorial-artwork",
    status: "approved",
    assetUri: candidate.raw.publicUrl,
    sha256: candidate.raw.sha256,
    usedByShotIds: [candidate.shotId],
    requiredForShotComposition: false,
    creativeInputOnly: true,
    evidenceUseAllowed: false,
    mediaBoundary: {photorealistic: false, containsPresenter: false, containsScreen: false, allowedEditModes: ["presenter-overlay", "full-package"]},
    anchorSurface: {contract: "A1EditorialAnchorSurfaceBinding/v1", textFree: true, realSourceRemainsAuthoritative: true, editableTextRemainsAuthoritative: true, sceneFamily: "generated-editorial-surface-v2", role: brief.generationRole},
    shotLayerBinding: {contract: "A1ShotLayerBinding/v1", projectId: candidate.projectId, shotId: candidate.shotId, layerId: candidate.layerId, briefId: candidate.briefId, briefHash: candidate.briefHash, treatmentHash: candidate.treatmentHash, candidateId: candidate.id, compositePreviewSha256: candidate.raw.sha256, targetGeometry: brief.targetGeometry, focalPoint: brief.focalPoint, crop: brief.crop, rendererSlot: brief.rendererSlot},
    provenance: {sourceType: "codex-generated-editorial-layer-provisional", sourceUri: candidate.raw.publicUrl, license: "project-generated non-evidentiary editorial asset", reviewed: false},
    preview: {kind: "generated-shot-layer", publicUrl: candidate.raw.publicUrl},
    review: {status: "approved", note: "provisional Remotion composite only", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null},
    createdAt: now,
    updatedAt: now,
  };
  const hashInput = structuredClone(content);
  delete hashInput.status;
  delete hashInput.review;
  content.contentSha256 = sha256(hashInput);
  content.review.approvedContentSha256 = content.contentSha256;
  return content;
}

/**
 * Treatment anchors are not a generated plate with a title on top.  They are
 * a small, deliberately authored type/material composition used to test the
 * visual grammar before a shot is allowed into Accepted Shot IR.  Keep the
 * text editable, but split the semantic phrase into actors so the same
 * compositor can prove collision, stagger and object attachment.
 */
function treatmentTextNodes({brief, stagedShot, generatedNode}) {
  const shotId = stagedShot.shotDemand.shotId;
  const treatmentId = brief.treatmentId || "flat-editorial-evidence";
  const pixel = treatmentId === "newtro-pixel-pop";
  const documentary = treatmentId === "documentary-interface-evidence";
  const fontAssetId = stagedShot.shotDemand.typographyAssignment?.pixelFontAssetId || A1_CURRENT_FORMAL_FONT_ASSET_ID;
  const supportFontAssetId = stagedShot.shotDemand.typographyAssignment?.supportFontAssetId || A1_CURRENT_FORMAL_FONT_ASSET_ID;
  const binding = generatedNode.objectBinding;
  const common = {
    type: "editable-text",
    role: "treatment-anchor-word-actor",
    visualMode: "treatment-anchor-visible",
    objectBinding: binding,
    objectAnchor: "generated-visual-layer",
    semanticBeat: brief.semanticBeat,
    typeTreatment: "treatment-anchor-word",
    z: 24,
  };
  if (shotId === "ED-10" && pixel) {
    return [
      {
        ...common,
        id: "word-actor-1",
        text: "完成度很高",
        fontAssetId: supportFontAssetId,
        geometry: {x: .03, y: .08, width: .88, height: .27},
        fontSize: 196,
        lineHeight: .72,
        align: "left",
        tone: "dark",
        paletteRole: "ink",
        surfaceTreatment: "pixel-stair-step",
        clipPathPolygon: "polygon(0 7%,100% 0,94% 86%,8% 100%)",
      },
      {
        ...common,
        id: "word-actor-2",
        text: "废稿",
        fontAssetId,
        geometry: {x: .16, y: .52, width: .55, height: .33},
        fontSize: 232,
        lineHeight: .64,
        align: "left",
        tone: "light",
        paletteRole: "paper",
        surfaceTreatment: "verdict-knockout",
        clipPathPolygon: "polygon(4% 0,100% 8%,94% 100%,0 90%)",
      },
    ];
  }
  if (shotId === "ED-10") {
    return [
      {
        ...common,
        id: "word-actor-1",
        text: "完成度很高",
        fontAssetId: supportFontAssetId,
        geometry: documentary ? {x: -.02, y: .03, width: 1.04, height: .34} : {x: .035, y: .055, width: .93, height: .25},
        fontSize: pixel ? 246 : 176,
        lineHeight: .74,
        align: "left",
        tone: "dark",
        paletteRole: "ink",
        clipPathPolygon: documentary ? "polygon(0 10%,100% 0,95% 84%,8% 100%)" : "polygon(0 0,100% 0,100% 100%,0 100%)",
      },
      {
        ...common,
        id: "word-actor-2",
        text: "废稿",
        fontAssetId,
        geometry: documentary ? {x: .2, y: .43, width: .74, height: .4} : {x: .24, y: .48, width: .58, height: .3},
        fontSize: pixel ? 258 : 224,
        lineHeight: .66,
        align: "left",
        tone: "light",
        paletteRole: "paper",
        surfaceTreatment: documentary ? "verdict-knockout" : "verdict-red-ring",
        clipPathPolygon: "polygon(4% 0,100% 7%,94% 100%,0 91%)",
      },
    ];
  }
  const pixelFieldInterruption = pixel && shotId === "ED-09";
  const flatFieldInterruption = !pixel && !documentary && shotId === "ED-09";
  return [
    {
      ...common,
      id: "word-actor-1",
      text: "明明",
      fontAssetId: supportFontAssetId,
      // Sit on the first red confirmation instead of floating above it.
      geometry: pixelFieldInterruption ? {x: .08, y: .16, width: .25, height: .18} : documentary ? {x: .1, y: .18, width: .3, height: .2} : flatFieldInterruption ? {x: .10, y: .245, width: .28, height: .20} : {x: .08, y: .18, width: .32, height: .2},
      fontSize: pixel ? 92 : flatFieldInterruption ? 102 : 88,
      lineHeight: .9,
      align: "left",
      tone: documentary ? "light" : "dark",
    },
    {
      ...common,
      id: "word-actor-2",
      text: "都是中文",
      fontAssetId,
      // Make the second phrase the single central focus and let the red path
      // pass through its lower edge before resolving into the negative space.
      geometry: pixelFieldInterruption ? {x: .25, y: .36, width: .42, height: .18} : documentary ? {x: .18, y: .47, width: .62, height: .24} : flatFieldInterruption ? {x: .27, y: .46, width: .59, height: .28} : {x: .22, y: .48, width: .6, height: .24},
      fontSize: pixelFieldInterruption ? 98 : flatFieldInterruption ? 124 : pixel ? 116 : 110,
      lineHeight: .84,
      align: "left",
      tone: documentary ? "light" : "dark",
      ...(flatFieldInterruption ? {surfaceTreatment: "vermillion-proof-underline"} : {}),
      ...(pixelFieldInterruption ? {surfaceTreatment: "acid-underline", paletteRole: "acid"} : {}),
    },
  ];
}

function treatmentActionNodes({brief, generatedNode}) {
  const binding = `treatment-phrase:${generatedNode.objectBinding}`;
  if (brief.shotId === "ED-09" && brief.treatmentId === "flat-editorial-evidence") return [];
  if (brief.shotId === "ED-09") return [{
    id: "semantic-bridge",
    type: "asset-reference",
    assetId: generatedNode.assetId,
    role: "treatment-semantic-action",
    objectBinding: binding,
    objectAnchor: "word-actor-1+word-actor-2",
    semanticBeat: brief.semanticBeat,
    geometry: {x: .055, y: .12, width: .76, height: .63},
    crop: "cover",
    focalPoint: brief.focalPoint || "38% 48%",
    mediaScale: 1.42,
    clipPathPolygon: "polygon(0 8%,43% 0,47% 19%,100% 12%,92% 48%,100% 92%,55% 100%,49% 76%,7% 91%,13% 53%)",
    filter: "contrast(1.08) saturate(.72)",
    z: 20,
  }];
  if (brief.shotId === "ED-10" && brief.treatmentId === "flat-editorial-evidence") {
    // The revised raw asset is already one physical wedge with one red fold.
    // Do not duplicate it as clipped slabs: that creates unrelated bands and
    // makes the material look like a generic collage instead of one action.
    return [];
  }
  return [{
    id: "verdict-slab",
    type: "asset-reference",
    assetId: generatedNode.assetId,
    role: "treatment-semantic-action",
    objectBinding: binding,
    objectAnchor: "word-actor-2",
    semanticBeat: brief.semanticBeat,
    treatmentId: brief.treatmentId,
    geometry: {x: .12, y: .46, width: .66, height: .4},
    crop: "cover",
    focalPoint: brief.focalPoint || "62% 52%",
    mediaScale: brief.treatmentId === "newtro-pixel-pop" ? 1.58 : 1.36,
    clipPathPolygon: brief.treatmentId === "newtro-pixel-pop" ? "polygon(0 0,88% 0,88% 12%,100% 12%,100% 76%,92% 76%,92% 100%,8% 100%,8% 90%,0 90%)" : "polygon(2% 7%,100% 0,93% 91%,8% 100%,0 64%)",
    filter: "contrast(1.16) saturate(.84) brightness(.72)",
    z: 21,
  }];
}

function typographyStyleframeMasterForShot(workspace, shotId) {
  // ED-08 is deliberately presenter-clean and must not receive a decorative
  // typography layer. ED-09/ED-10 may use the imported masters only as
  // reference-only material beneath editable word actors.
  const assetIdByShotId = {"ED-09": "glyph-board-ai-taste", "ED-10": "glyph-board-polished-waste"};
  const assetId = assetIdByShotId[shotId];
  if (!assetId) return null;
  const asset = workspace.library.assets.find((item) => item.id === assetId && item.route === "generated-glyph");
  const candidate = asset?.typographySpec?.generatedCandidates?.find((item) => item.renderReferenceAllowed === true && item.preferredForShotIds?.includes(shotId));
  if (!candidate?.publicUrl || !fs.existsSync(publicFile(candidate.publicUrl))) return null;
  return {
    publicUrl: candidate.publicUrl,
    sha256: candidate.sha256,
    width: candidate.width,
    height: candidate.height,
    sourceType: "openai-built-in-imagegen-typography-master",
    referenceOnly: true,
    rasterReferenceFinal: false,
  };
}

function buildReviewPlan(workspace, candidate, now) {
  const briefs = [
    ...(workspace.production.visualDirector.shotBriefs || []),
    ...(workspace.production.visualDirector.treatmentDirections || []).flatMap((direction) => direction.anchorBriefs || []),
  ];
  const brief = briefs.find((item) => item.id === candidate.briefId);
  // Treatment anchors are review-only by design: they are not allowed to
  // enter production, but they must be rendered through the real scene graph
  // before the treatment gate can make a visual decision. Keep the production
  // binding guard for ordinary shot briefs while allowing this explicit review
  // phase through the same Remotion compositor.
  if (!brief || (!brief.productionBindingAllowed && brief.generationRole !== "treatment-anchor")) throw new Error(`generated-composite-production-binding-forbidden:${candidate.id}`);
  const typographyMaster = brief.generationRole === "treatment-anchor"
    ? typographyStyleframeMasterForShot(workspace, candidate.shotId)
    : null;
  // The current generated candidate is the material under review.  Imported
  // typography masters are conditioning references only; replacing `raw`
  // with a master would make every compositor revision judge the old board
  // again (including its stale background glyphs and decorations).
  const materialRouting = resolveTreatmentMaterialRouting({candidate, typographyReference: typographyMaster});
  const reviewCandidate = {
    ...candidate,
    raw: materialRouting.renderedMaterial,
    ...(materialRouting.typographyReference ? {typographyReference: materialRouting.typographyReference} : {}),
    treatmentMaterialRouting: {
      typographyReferenceRendered: materialRouting.typographyReferenceRendered,
      renderedMaterialSha256: materialRouting.renderedMaterial.sha256,
    },
  };
  const clone = structuredClone(workspace);
  const provisional = provisionalAsset(reviewCandidate, brief, now);
  clone.library.assets.push(provisional);
  mirrorPublicAsset(reviewCandidate.raw.publicUrl);
  const shotAsset = clone.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === candidate.shotId);
  if (!shotAsset) throw new Error(`generated-composite-shot-missing:${candidate.shotId}`);
  // Treatment anchors are review-only evidence.  They must remain renderable
  // while the production gate is intentionally locked by a failed treatment;
  // temporarily opening the in-memory scene-graph solver does not mutate the
  // persisted production gate or permit Accepted Shot IR.
  const sceneGraphInput = brief.generationRole === "treatment-anchor" && clone.gates?.shotCompositionAllowed !== true
    ? {...clone, gates: {...clone.gates, shotCompositionAllowed: true}}
    : clone;
  const staged = createSceneGraphCandidates(sceneGraphInput, shotAsset.id, now);
  const stagedShot = staged.library.assets.find((asset) => asset.id === shotAsset.id);
  const sceneCandidate = [...(stagedShot.candidates || [])].sort((left, right) => left.screening.hardFailures.length - right.screening.hardFailures.length)[0];
  const sceneHardFailures = sceneCandidate?.screening?.hardFailures || [];
  // The treatment anchor is a visual-direction probe, not a production shot.
  // It may intentionally lack the final pixel/glyph binding while the real
  // generated surface is being judged. Keep those failures in the review
  // context instead of preventing the only meaningful composite proof.
  if (!sceneCandidate || (brief.generationRole !== "treatment-anchor" && sceneHardFailures.length)) throw new Error(`generated-composite-scene-graph-blocked:${candidate.shotId}:${sceneHardFailures.join(",") || "missing"}`);
  // The generated layer is the subject of this review.  The legacy scene-graph
  // solver only knows the approved asset library, so without an explicit
  // binding it silently renders the old generic shot candidate and makes the
  // image-generation step impossible to judge.  Add the provisional layer to
  // both the material bindings and the graph before compiling the preview IR.
  const generatedMaterialBinding = {
    assetId: provisional.id,
    assetUri: reviewCandidate.raw.publicUrl,
    publicUrl: reviewCandidate.raw.publicUrl,
    sha256: reviewCandidate.raw.sha256,
    contentSha256: provisional.contentSha256,
    provenance: provisional.provenance,
    videoEvidence: null,
  };
  const compositorSpec = brief.generationRole === "treatment-anchor"
    ? resolveTreatmentCompositorSpec({treatmentId: brief.treatmentId, shotId: candidate.shotId})
    : null;
  const shotFamilyCompositorSpec = brief.generationRole === "treatment-anchor"
    ? null
    : resolveShotFamilyCompositorSpec({brief});
  const generatedGeometry = {
    x: Number(brief.targetGeometry?.x || 0),
    y: Number(brief.targetGeometry?.y || 0),
    width: Number(brief.targetGeometry?.width || 1),
    height: Number(brief.targetGeometry?.height || 1),
  };
  if (brief.generationRole === "treatment-anchor" && candidate.shotId === "ED-09") {
    // The field-interruption primitive must not leave a universal right-hand
    // blank column. Crop the generated material into the same physical field
    // that carries the reading path and the central void.
    generatedGeometry.x = 0;
    generatedGeometry.y = 0;
    generatedGeometry.width = 1;
    generatedGeometry.height = 1;
  }
  const generatedNode = {
    id: "generated-visual-layer",
    type: "asset-reference",
    assetId: provisional.id,
    role: "generated-visual-layer",
    geometry: generatedGeometry,
    crop: brief.crop === "contain" ? "contain" : "cover",
    focalPoint: compositorSpec?.generatedSurfaceConstraint?.focalPoint
      || (brief.generationRole === "treatment-anchor" && candidate.shotId === "ED-09" ? (brief.focalPoint || "32% 48%") : brief.focalPoint),
    mediaScale: compositorSpec?.generatedSurfaceConstraint?.minMediaScale
      || (brief.generationRole === "treatment-anchor" && candidate.shotId === "ED-09" ? 1.24 : 1),
    opacity: 1,
    objectBinding: `generated-layer:${candidate.shotId}:${candidate.layerId}`,
    // Conceptual and type surfaces replace the generic primary plate at z=12;
    // presenter support stays behind the cropped real source at z=2. Editable
    // semantic actors remain above both at z=18+.
    z: shotFamilyCompositorSpec?.generatedZ ?? (candidate.layerId === "scene-surface" ? 2 : 12),
  };
  if (shotFamilyCompositorSpec?.generatedGeometry) generatedNode.geometry = {...shotFamilyCompositorSpec.generatedGeometry};
  sceneCandidate.sceneGraph = structuredClone(sceneCandidate.sceneGraph);
  // The scene-graph compiler can select a verified glyph cutout whose file
  // was removed by a later repair round. Keep this review render alive by
  // falling back to that candidate's verified full-frame PNG; a missing URL
  // must never make Remotion retry forever.
  for (const node of sceneCandidate.sceneGraph.nodes || []) {
    if (node.type !== "generated-glyph-reference" || !node.sourceFramePublicUrl) continue;
    if (fs.existsSync(publicFile(node.sourceFramePublicUrl))) {
      mirrorPublicAsset(node.sourceFramePublicUrl);
      continue;
    }
    const glyphAsset = staged.library.assets.find((asset) => asset.id === node.assetId);
    const glyphCandidate = (glyphAsset?.typographySpec?.generatedCandidates || []).find((item) => item.id === node.generatedCandidateId)
      || (glyphAsset?.typographySpec?.generatedCandidates || []).find((item) => item.id === glyphAsset?.selectedCandidateId)
      || null;
    if (glyphCandidate?.publicUrl && fs.existsSync(publicFile(glyphCandidate.publicUrl))) {
      node.sourceFramePublicUrl = glyphCandidate.publicUrl;
      node.sourceFrameSha256 = glyphCandidate.sha256 || null;
      node.reviewFallback = "verified-glyph-full-frame-after-missing-cutout";
      mirrorPublicAsset(node.sourceFramePublicUrl);
    } else {
      sceneCandidate.sceneGraph.nodes = sceneCandidate.sceneGraph.nodes.filter((item) => item !== node);
    }
  }
  if (brief.generationRole === "treatment-anchor") {
    // A treatment anchor is a direction study, not a re-run of the old shot
    // compiler. Reusing the full ED-09/ED-10 graph reintroduced the exact
    // failure we are trying to detect: generated material underneath a stack
    // of generic titles, lines and glyph posters. Keep the generated surface
    // plus one editable phrase bound to this anchor's semantic beat.
    // Compose two editable word actors against the generated material.  The
    // binding is intentionally shared with the material layer: the phrase is
    // part of the object, not a title floating above it.
    sceneCandidate.sceneGraph.nodes = [
      generatedNode,
      ...treatmentTextNodes({brief, stagedShot, generatedNode}),
      ...treatmentActionNodes({brief, generatedNode}),
    ];
    sceneCandidate.sceneGraph.generatedVisualSurface = true;
    sceneCandidate.sceneGraph.generatedVisualSurfacePolicy = {
      contract: "A1GeneratedVisualSurfacePolicy/v1",
      rule: "generated-surface-must-be-asset-native; renderer-only-layout-and-motion-are-allowed; no-invented-lines-or-shapes",
    };
    sceneCandidate.sceneGraph.approvedMaterialIds = [provisional.id];
    sceneCandidate.sceneGraph.topology = brief.compositionPlan?.archetypeId || sceneCandidate.sceneGraph.topology;
    sceneCandidate.sceneGraph.compositionPrimitive = brief.compositionPlan?.silhouetteFamily || "generated-treatment-surface";
    const resolvedCompositorSpec = compositorSpec || resolveTreatmentCompositorSpec({treatmentId: brief.treatmentId, shotId: candidate.shotId});
    sceneCandidate.sceneGraph.motionPhrase = {
      contract: "A1TreatmentAnchorMotionPhrase/v1",
      compositorContract: resolvedCompositorSpec.contract,
      compositorPrimitive: resolvedCompositorSpec.primitive,
      beats: resolvedCompositorSpec.motionBeats,
      entry: candidate.shotId === "ED-10" ? "完成度很高先沿纸面秩序逐字落定" : "明明先贴着阅读材料进入并建立第一落点",
      focus: candidate.shotId === "ED-10" ? "观众先读成品秩序，再看到废稿成为唯一判词" : "观众先跟随同一阅读标记寻找重点，再看到重点失去中心",
      transformation: candidate.shotId === "ED-10" && brief.treatmentId === "flat-editorial-evidence" ? "红色实体纸带从成品黑纸中抽出，折返穿过两个词演员并把废稿变成唯一判词" : candidate.shotId === "ED-10" ? "材料的明暗与裁切改变阅读顺序，让废稿从副词变成唯一判词" : "材料自身的焦点与裁切把观众从第一词带到第二词，撤掉无关装饰",
      resolve: candidate.shotId === "ED-10" && brief.treatmentId === "flat-editorial-evidence" ? "红色实体纸带在废稿下方闭合并停住一拍，以闭合折角触发下一章硬切" : candidate.shotId === "ED-10" ? "两个字形和材料在同一阅读面上停住一拍，再把判词交给下一镜" : "材料焦点收缩到第二个词的边缘，硬切交给下一镜中心字形",
      intent: brief.motionIntent,
    };
    const compositorValidation = validateTreatmentCompositorGraph({spec: resolvedCompositorSpec, nodes: sceneCandidate.sceneGraph.nodes, motionPhrase: sceneCandidate.sceneGraph.motionPhrase});
    if (!compositorValidation.valid) throw new Error(`treatment-compositor-policy-blocked:${candidate.id}:${compositorValidation.issues.join(",")}`);
    sceneCandidate.sceneGraph.compositorContract = {
      ...resolvedCompositorSpec,
      validation: compositorValidation,
    };
    sceneCandidate.sceneGraph.handoff = {actor: brief.transitionHandoff || brief.subject};
  }
  sceneCandidate.sceneGraph.approvedMaterialIds = [
    ...(sceneCandidate.sceneGraph.approvedMaterialIds || []).filter((assetId) => assetId !== provisional.id),
    provisional.id,
  ];
  // The treatment branch already installed the generated layer.  Never add
  // it a second time: duplicate material nodes create false depth, duplicate
  // motion actors and make the critic read a generic stack instead of one
  // composition primitive.
  sceneCandidate.sceneGraph.nodes = [
    generatedNode,
    ...(sceneCandidate.sceneGraph.nodes || []).filter((node) => node.id !== generatedNode.id),
  ];
  // Presenter footage is opaque. Execute the brief's left/right composition
  // orientation instead of always forcing the generated field to the left.
  // The presenter remains source-authoritative in the opposite field.
  if (shotFamilyCompositorSpec?.shotFamily === "presenter-packaging") {
    const primary = sceneCandidate.sceneGraph.nodes.find((node) => node.id === "primary");
    if (primary) {
      primary.geometry = {...shotFamilyCompositorSpec.primaryGeometry};
      primary.focalPoint = primary.focalPoint || "62% 30%";
      primary.mediaScale = Math.max(1, Number(primary.mediaScale || 1));
    }
  }
  if (shotFamilyCompositorSpec) {
    sceneCandidate.sceneGraph.topology = shotFamilyCompositorSpec.archetypeId;
    sceneCandidate.sceneGraph.compositionPrimitive = shotFamilyCompositorSpec.primitive;
    const validation = validateShotFamilyCompositorGraph({spec: shotFamilyCompositorSpec, nodes: sceneCandidate.sceneGraph.nodes});
    if (!validation.valid) throw new Error(`shot-family-compositor-policy-blocked:${candidate.id}:${validation.issues.join(",")}`);
    sceneCandidate.sceneGraph.compositorContract = {...shotFamilyCompositorSpec, validation};
  }
  const generatedMaterialBindings = [
    ...sceneCandidate.sceneGraph.approvedMaterialIds
      .filter((assetId) => assetId !== provisional.id)
      .map((assetId) => materialBinding(staged, assetId)),
    generatedMaterialBinding,
  ];
  const sceneValue = {
    contract: "A1SceneGraphMotionPreview/v1",
    reviewOnly: true,
    sourceWorkspaceSha256: workspace.workspaceSha256,
    shotId: candidate.shotId,
    order: stagedShot.shotDemand.order,
    chapterId: stagedShot.shotDemand.chapterId,
    source: {cueIds: stagedShot.shotDemand.cueIds, text: stagedShot.shotDemand.sourceText, editWindow: stagedShot.shotDemand.editWindow},
    candidateId: sceneCandidate.candidateId,
    materialBindings: generatedMaterialBindings.length
      ? generatedMaterialBindings
      : sceneCandidate.sceneGraph.approvedMaterialIds.map((assetId) => materialBinding(staged, assetId)),
    sceneGraph: sceneCandidate.sceneGraph,
    reviewOnlySceneHardFailures: sceneHardFailures,
    operationSequence: null,
    visualContract: {
      visualJob: stagedShot.shotDemand.visualJob,
      primaryActor: stagedShot.shotDemand.primaryActor,
      materialRoute: stagedShot.shotDemand.materialRoute,
      topology: stagedShot.shotDemand.topology,
      typographyRole: stagedShot.shotDemand.typographyRole,
      keyPhrases: stagedShot.shotDemand.keyPhrases,
      layoutConstraints: stagedShot.shotDemand.layoutConstraints,
      motionPhrase: stagedShot.shotDemand.motionPhrase,
      handoffActor: stagedShot.shotDemand.handoffActor,
      structureDirections: stagedShot.shotDemand.structureDirections,
    },
    motionPhrase: sceneCandidate.sceneGraph.motionPhrase,
    handoff: sceneCandidate.sceneGraph.handoff,
    approval: {status: "provisional-motion-preview", reviewedAt: now, note: "generated layer Remotion composite review; not Accepted Shot IR"},
  };
  const scene = {...sceneValue, sha256: sha256(sceneValue)};
  const previewValue = {contract: "A1SceneGraphMotionPreviewSet/v1", projectId: candidate.projectId, reviewOnly: true, candidateSelectionMode: "generated-layer-composite", profile: "generated-visual-composite-v2", sourceWorkspaceSha256: workspace.workspaceSha256, shotCount: 1, scenes: [scene]};
  const previewSet = {...previewValue, sha256: sha256(previewValue)};
  const motionScene = buildMotionIrSceneFromAcceptedShot(scene, {...stagedShot.shotDemand, visualContract: scene.visualContract}, {sourceAuthority: "A1SceneGraphMotionPreview/v1"});
  const motionValue = {contract: "A1MotionIRPreviewSet/v1", projectId: candidate.projectId, reviewOnly: true, sourceSceneGraphSetSha256: previewSet.sha256, fps: 30, sceneCount: 1, scenes: [motionScene]};
  const motionSet = {...motionValue, sha256: sha256(motionValue)};
  const plan = {contract: "A1SceneGraphMotionPreviewPlan/v1", reviewOnly: true, profile: "generated-visual-composite-v2", shotIds: [candidate.shotId], durationMs: scene.source.editWindow.durationMs, sourceSceneGraphSetSha256: previewSet.sha256, handoffs: [], hardCuts: []};
  return {candidate: reviewCandidate, brief, stagedShot, sceneCandidate, motionScene, inputProps: {previewSet, motionSet, plan}};
}

function adjacentPreview(workspace, shotId, offset) {
  const shots = workspace.library.assets.filter((asset) => asset.route === "shot-composition" && asset.shotDemand).sort((left, right) => left.shotDemand.order - right.shotDemand.order);
  const index = shots.findIndex((asset) => asset.shotDemand.shotId === shotId);
  const adjacent = shots[index + offset];
  if (!adjacent) return null;
  const selected = adjacent.candidates?.find((item) => item.candidateId === adjacent.selectedCandidateId)
    || adjacent.candidates?.find((item) => item.candidateId === adjacent.visualCritic?.selectedCandidateId)
    || adjacent.candidates?.find((item) => item.preview?.publicUrl);
  const publicUrl = selected?.preview?.publicUrl || adjacent.candidateRender?.previews?.[0]?.publicUrl || null;
  const file = publicUrl ? publicFile(publicUrl) : null;
  return file && fs.existsSync(file) ? {shotId: adjacent.shotDemand.shotId, publicUrl, file, sha256: sha256(fs.readFileSync(file))} : {shotId: adjacent.shotDemand.shotId, publicUrl: null, file: null, sha256: null};
}

function labelSvg(label) {
  const escaped = String(label).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from(`<svg width="960" height="540"><rect x="0" y="0" width="960" height="42" fill="rgba(7,9,10,.9)"/><rect x="0" y="0" width="8" height="42" fill="#c9ef39"/><text x="24" y="27" fill="#f1f3ed" font-size="15" font-family="monospace" font-weight="700">${escaped}</text></svg>`);
}

async function tile(file, label) {
  if (!file || !fs.existsSync(file)) return sharp({create: {width: 960, height: 540, channels: 4, background: "#101315"}}).composite([{input: labelSvg(`${label} · unavailable`), left: 0, top: 0}]).png().toBuffer();
  return sharp(file).resize(960, 540, {fit: "cover"}).composite([{input: labelSvg(label), left: 0, top: 0}]).png().toBuffer();
}

async function inspectionBoard({candidate, compositeFile, previous, next, outputDir}) {
  const previousSuffix = previous?.source === "current-treatment-composite" ? " · CURRENT TREATMENT" : "";
  const nextSuffix = next?.source === "current-treatment-composite" ? " · CURRENT TREATMENT" : "";
  const tiles = await Promise.all([
    tile(publicFile(candidate.raw.publicUrl), `RAW · ${candidate.id}`),
    tile(compositeFile, `REMOTION COMPOSITE · ${candidate.shotId}/${candidate.layerId}`),
    tile(previous?.file, `PREVIOUS · ${previous?.shotId || "START"}${previousSuffix}`),
    tile(next?.file, `NEXT · ${next?.shotId || "END"}${nextSuffix}`),
  ]);
  const board = path.join(outputDir, `${candidate.id}-inspection-board.png`);
  await sharp({create: {width: 1920, height: 1080, channels: 4, background: "#0b0d0e"}}).composite(tiles.map((input, index) => ({input, left: index % 2 * 960, top: Math.floor(index / 2) * 540}))).png().toFile(board);
  return board;
}

async function criticProxyForInspectionBoard(boardFile) {
  const sourceBytes = fs.readFileSync(boardFile);
  const sourceSha256 = sha256(sourceBytes);
  const proxyFile = boardFile.replace(/-inspection-board\.png$/u, `-critic-proxy-${sourceSha256.slice(0, 12)}.jpg`);
  let cacheHit = fs.existsSync(proxyFile);
  if (!cacheHit) {
    await sharp(sourceBytes)
      .resize({width: 1600, height: 900, fit: "fill", withoutEnlargement: true})
      .flatten({background: "#0b0d0e"})
      .jpeg({quality: 84, chromaSubsampling: "4:4:4", mozjpeg: true})
      .toFile(proxyFile);
  }
  const proxyBytes = fs.readFileSync(proxyFile);
  // A stale or unexpectedly large proxy defeats the transport fast path.
  // Rebuild it once with the same deterministic recipe before dispatch.
  if (proxyBytes.length >= sourceBytes.length) {
    await sharp(sourceBytes)
      .resize({width: 1600, height: 900, fit: "fill", withoutEnlargement: true})
      .flatten({background: "#0b0d0e"})
      .jpeg({quality: 78, chromaSubsampling: "4:2:0", mozjpeg: true})
      .toFile(proxyFile);
    cacheHit = false;
  }
  const finalProxyBytes = fs.readFileSync(proxyFile);
  return {
    sourceFile: boardFile,
    sourceSha256,
    sourceSizeBytes: sourceBytes.length,
    proxyFile,
    proxySha256: sha256(finalProxyBytes),
    proxySizeBytes: finalProxyBytes.length,
    cacheHit,
  };
}

/**
 * Run independent review stages with a small, explicit concurrency cap.
 *
 * Rendering and the visual critic are the expensive, read-only part of this
 * worker.  Workspace mutation is intentionally kept outside this helper and
 * is performed in input order below, so parallel review cannot reorder or
 * overwrite state updates.  The cap is deliberately conservative: a single
 * headless browser is shared by the workers and the visual critic starts one
 * Codex process per group.
 */
async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Number(concurrency) || 1), items.length);
  // allSettled is intentional: if one group fails, let already-started
  // groups finish before the caller closes the shared browser.  We still
  // surface the first failure and perform no workspace writes afterwards.
  const settled = await Promise.allSettled(Array.from({length: workerCount}, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));
  const rejected = settled.find((item) => item.status === "rejected");
  if (rejected) throw rejected.reason;
  return results;
}

function reviewOutputDir(first) {
  return path.join(appPublic, phaseRelative, "generated-visual-reviews", first.candidate.shotId, first.candidate.layerId, `${first.candidate.briefHash.slice(0, 12)}-${compositorSourceSha256.slice(0, 12)}`);
}

function deterministicCompositeFile(reviewPlan) {
  return path.join(reviewOutputDir(reviewPlan), `${reviewPlan.candidate.id}-composite.png`);
}

async function renderGroup({group, workspace, serveUrl, browser}) {
  const first = group.plans[0];
  // The compositor is part of the content address.  A brief/raw cache hit
  // must not silently replay a stale frame after a renderer grammar change.
  const outputDir = reviewOutputDir(first);
  fs.mkdirSync(outputDir, {recursive: true});
  const previous = adjacentPreview(workspace, first.candidate.shotId, -1);
  const nextAdjacent = adjacentPreview(workspace, first.candidate.shotId, 1);
  const rendered = [];
  // Keep candidates inside one brief ordered.  Different briefs are the
  // independently parallel unit; ordering here makes the critic input and
  // resulting candidate ranking byte-for-byte compatible with the old loop.
  for (const reviewPlan of group.plans) {
    const compositeFile = deterministicCompositeFile(reviewPlan);
    const existingCompositeFile = reviewPlan.candidate.compositePreview?.publicUrl
      ? publicFile(reviewPlan.candidate.compositePreview.publicUrl)
      : null;
    const workspaceCompositeCacheHit = Boolean(existingCompositeFile
      && reviewPlan.candidate.compositePreview?.sha256
      && reviewPlan.candidate.compositePreview.publicUrl.includes(compositorSourceSha256.slice(0, 12))
      && fs.existsSync(existingCompositeFile)
      && sha256(fs.readFileSync(existingCompositeFile)) === reviewPlan.candidate.compositePreview.sha256);
    const deterministicCompositeCacheHit = fs.existsSync(compositeFile) && fs.statSync(compositeFile).size > 0;
    const compositeCacheHit = workspaceCompositeCacheHit || deterministicCompositeCacheHit;
    const resolvedCompositeFile = workspaceCompositeCacheHit ? existingCompositeFile : compositeFile;
    if (!compositeCacheHit) {
      if (!serveUrl || !browser) throw new Error(`treatment-composite-render-runtime-required:${reviewPlan.candidate.id}`);
      const composition = await selectComposition({serveUrl, id: "A1SceneGraphMotionPreviewV1", inputProps: reviewPlan.inputProps, puppeteerInstance: browser, logLevel: "warn", timeoutInMilliseconds: renderStageTimeoutMs});
      const stableFrame = Math.min(composition.durationInFrames - 1, Math.max(0, Number(reviewPlan.motionScene.phases?.stableReadingHold?.startFrame || Math.round(composition.durationInFrames * .72))));
      await renderStill({serveUrl, composition, inputProps: reviewPlan.inputProps, frame: stableFrame, output: compositeFile, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn", timeoutInMilliseconds: renderStageTimeoutMs});
    }
    const existingBoardFile = reviewPlan.candidate.compositeContext?.inspectionBoardPublicUrl
      ? publicFile(reviewPlan.candidate.compositeContext.inspectionBoardPublicUrl)
      : null;
    const boardCacheHit = Boolean(compositeCacheHit
      && existingBoardFile
      // The inspection board is itself a rendered artifact.  Invalidate it
      // whenever the compositor grammar changes; otherwise the critic can
      // keep looking at a proxy from the previous compositor even though the
      // composite frame was freshly rendered.
      && reviewPlan.candidate.compositeContext?.inspectionBoardPublicUrl?.includes(compositorSourceSha256.slice(0, 12))
      && fs.existsSync(existingBoardFile)
      && reviewPlan.candidate.compositeContext?.inspectionBoardSha256 === sha256(fs.readFileSync(existingBoardFile))
      && (reviewPlan.candidate.compositeContext?.previousPreviewSha256 || null) === (previous?.sha256 || null)
      && (reviewPlan.candidate.compositeContext?.nextPreviewSha256 || null) === (nextAdjacent?.sha256 || null));
    const board = boardCacheHit
      ? existingBoardFile
      : await inspectionBoard({candidate: reviewPlan.candidate, compositeFile: resolvedCompositeFile, previous, next: nextAdjacent, outputDir});
    rendered.push({
      candidateId: reviewPlan.candidate.id,
      compositePreview: {publicUrl: publicUrlFor(resolvedCompositeFile), sha256: sha256(fs.readFileSync(resolvedCompositeFile)), width: 960, height: 540},
      inspectionBoardFile: board,
      inspectionBoardPublicUrl: publicUrlFor(board),
      inspectionBoardSha256: sha256(fs.readFileSync(board)),
      previousShotId: previous?.shotId || null,
      nextShotId: nextAdjacent?.shotId || null,
      previousPreviewSha256: previous?.sha256 || null,
      nextPreviewSha256: nextAdjacent?.sha256 || null,
      compositorSourceSha256,
      renderCacheHit: compositeCacheHit,
      boardCacheHit,
    });
  }
  return {group, rendered, first};
}

async function rebuildTreatmentInspectionBoards({renderedGroups, workspace}) {
  const shotIds = workspace.library.assets
    .filter((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId)
    .map((asset) => asset.shotDemand.shotId);
  const records = renderedGroups.flatMap((renderedGroup) => renderedGroup.rendered.map((renderedItem, candidateIndex) => ({
    renderedGroup,
    renderedItem,
    plan: renderedGroup.group.plans[candidateIndex],
    candidateIndex,
  })));
  const byTreatmentAndShot = new Map();
  for (const record of records) {
    const key = `${record.plan.brief.treatmentId}:${record.plan.candidate.shotId}`;
    const current = byTreatmentAndShot.get(key) || [];
    current.push(record);
    byTreatmentAndShot.set(key, current);
  }
  const currentTreatmentNeighbor = (record, offset) => {
    const shotIndex = shotIds.indexOf(record.plan.candidate.shotId);
    const neighborShotId = shotIds[shotIndex + offset];
    if (!neighborShotId) return null;
    const matches = byTreatmentAndShot.get(`${record.plan.brief.treatmentId}:${neighborShotId}`) || [];
    const match = matches[record.candidateIndex] || matches[0] || null;
    if (!match) return adjacentPreview(workspace, record.plan.candidate.shotId, offset);
    const file = publicFile(match.renderedItem.compositePreview.publicUrl);
    return {
      shotId: neighborShotId,
      publicUrl: match.renderedItem.compositePreview.publicUrl,
      file,
      sha256: match.renderedItem.compositePreview.sha256,
      source: "current-treatment-composite",
    };
  };
  for (const record of records) {
    const previous = currentTreatmentNeighbor(record, -1);
    const next = currentTreatmentNeighbor(record, 1);
    const compositeFile = publicFile(record.renderedItem.compositePreview.publicUrl);
    const board = await inspectionBoard({
      candidate: record.plan.candidate,
      compositeFile,
      previous,
      next,
      outputDir: reviewOutputDir(record.plan),
    });
    Object.assign(record.renderedItem, {
      inspectionBoardFile: board,
      inspectionBoardPublicUrl: publicUrlFor(board),
      inspectionBoardSha256: sha256(fs.readFileSync(board)),
      previousShotId: previous?.shotId || null,
      nextShotId: next?.shotId || null,
      previousPreviewSha256: previous?.sha256 || null,
      nextPreviewSha256: next?.sha256 || null,
      boardCacheHit: false,
      neighborEvidenceMode: "same-treatment-composite-first",
    });
  }
  return renderedGroups;
}

async function renderAndCriticizeGroup({group, workspace, serveUrl, browser, artifactDir}) {
  const renderedGroup = await renderGroup({group, workspace, serveUrl, browser});
  const {first, rendered} = renderedGroup;
  const criticReport = await runVisualMaturityCritic({
    scope: "shot-frame",
    images: rendered.map((item) => item.inspectionBoardFile),
    candidates: rendered.map((item) => ({candidateId: item.candidateId, expectedText: null, inspectionLayout: "RAW | REMOTION COMPOSITE | PREVIOUS | NEXT"})),
    context: {
      contract: "A1GeneratedVisualCompositeCriticContext/v1",
      shotId: first.candidate.shotId,
      layerId: first.candidate.layerId,
      semanticBeat: first.brief.semanticBeat,
      visualTask: first.brief.visualTask,
      subject: first.brief.subject,
      treatmentId: first.brief.treatmentId,
      compositionPlan: first.brief.compositionPlan,
      visualProposition: first.brief.visualProposition,
      compositionSignature: first.brief.compositionSignature,
      neighborCompositionSignatures: [first.brief.continuity?.previous?.shotId, first.brief.continuity?.next?.shotId]
        .filter(Boolean)
        .map((shotId) => {
          const neighborBrief = workspace.production.visualDirector.shotBriefs.find((brief) => brief.shotId === shotId);
          return {shotId, compositionSignature: neighborBrief?.compositionSignature || null, archetypeId: neighborBrief?.compositionPlan?.archetypeId || null};
        }),
      targetGeometry: first.brief.targetGeometry,
      safeZones: first.brief.safeZones,
      motionIntent: first.brief.motionIntent,
      transitionHandoff: first.brief.transitionHandoff,
      ...(first.brief.generationRole === "treatment-anchor" ? {
        treatmentAnchorReview: true,
        assetEvaluationRules: "This is a text-free treatment-anchor styleframe, not a real screen-operation shot and not factual evidence. Never report screen-action-not-causal, missing real UI, or missing source evidence as a hard failure. The intended composite is one generated material layer plus two editable Chinese word actors sharing the material objectBinding; do not require a photographed hand, screen, correction marks, HUD lines, or a full production shot. Judge whether the material silhouette, word-level phrase interaction, shared object attachment, depth, readable hierarchy, and actionable motion phrase are mature. A raw generated image may contain no readable text; only the editable Remotion words and generated material are authoritative. Do not report type-led-without-word-actors when both editable word actors are present, legible, and attached to the generated material. Treat any deterministic SVG/correction line or generic geometric overlay as a packaging failure, not as required action.",
      } : {}),
      productionRule: "judge generated raw only through its real Remotion composite; editable text and real source stay authoritative",
      imagePanelOrder: ["raw generated layer", "Remotion composite at 960x540", "previous shot", "next shot"],
    },
    cacheDir: path.join(artifactDir, "generated-visual-composite-critic-cache-v2"),
  });
  return {...renderedGroup, criticReport};
}

async function renderAndCriticizeTreatmentBatch({reviewPlans, workspace, serveUrl, browser, artifactDir}) {
  let renderedCount = 0;
  const renderedGroups = await mapWithConcurrency(
    reviewPlans,
    2,
    async (group) => {
      const result = await renderGroup({group, workspace, serveUrl, browser});
      renderedCount += result.rendered.length;
      updateTreatmentProgress("rendering-six-composites", {completedCount: renderedCount, totalCount: reviewPlans.reduce((sum, item) => sum + item.plans.length, 0)});
      return result;
    },
  );
  await rebuildTreatmentInspectionBoards({renderedGroups, workspace});
  const rendered = [];
  const candidates = [];
  for (const renderedGroup of renderedGroups) {
    for (let index = 0; index < renderedGroup.rendered.length; index += 1) {
      const renderedItem = renderedGroup.rendered[index];
      const plan = renderedGroup.group.plans[index];
      const editableTextActors = (plan.sceneCandidate.sceneGraph.nodes || [])
        .filter((node) => node.type === "editable-text" && node.visualMode === "treatment-anchor-visible")
        .map((node) => String(node.text || "").trim())
        .filter(Boolean);
      rendered.push(renderedItem);
      candidates.push({
        candidateId: plan.candidate.id,
        briefId: plan.brief.id,
        treatmentId: plan.brief.treatmentId,
        shotId: plan.candidate.shotId,
        exactEditableText: editableTextActors,
        semanticBeat: plan.brief.semanticBeat,
        visualTask: plan.brief.visualTask,
        subject: plan.brief.subject,
        compositionPlan: plan.brief.compositionPlan,
        visualProposition: plan.brief.visualProposition,
        motionIntent: plan.brief.motionIntent,
        transitionHandoff: plan.brief.transitionHandoff,
        localPreflight: {
          rawDimensionsPass: plan.candidate.automaticChecks?.dimensions?.status === "pass",
          rawAspectRatioPass: plan.candidate.automaticChecks?.aspectRatio?.status === "pass",
          editableTextActorCount: editableTextActors.length,
          editableTextVerifiedLocally: editableTextActors.length === 2,
          compositorContract: plan.sceneCandidate.sceneGraph.compositorContract?.contract || null,
          compositorGraphValid: plan.sceneCandidate.sceneGraph.compositorContract?.validation?.valid === true,
          renderCacheHit: renderedItem.renderCacheHit,
          boardCacheHit: renderedItem.boardCacheHit,
        },
        inspectionLayout: "RAW | REMOTION COMPOSITE | PREVIOUS | NEXT",
      });
    }
  }
  updateTreatmentProgress("preparing-critic-proxies", {completedCount: 0, totalCount: rendered.length});
  const criticProxies = [];
  for (const renderedItem of rendered) {
    const proxy = await criticProxyForInspectionBoard(renderedItem.inspectionBoardFile);
    criticProxies.push(proxy);
    updateTreatmentProgress("preparing-critic-proxies", {completedCount: criticProxies.length, totalCount: rendered.length});
  }
  if (renderOnly) return {renderedGroups, rendered, candidates, criticProxies, criticReport: null};
  const criticReport = await runTreatmentBatchCritic({
    images: criticProxies.map((item) => item.proxyFile),
    candidates,
    cacheDir: path.join(artifactDir, "treatment-batch-critic-cache-v1"),
    onProgress: (progress) => updateTreatmentProgress(progress.phase, {completedCount: rendered.length, totalCount: rendered.length, batchHash: progress.batchHash || null, timeoutMs: progress.timeoutMs || null}),
  });
  criticReport.trace.criticInputProxies = criticProxies.map(({sourceSha256, sourceSizeBytes, proxySha256, proxySizeBytes, cacheHit}) => ({
    sourceSha256,
    sourceSizeBytes,
    proxySha256,
    proxySizeBytes,
    cacheHit,
  }));
  return {renderedGroups, rendered, candidates, criticReport};
}

async function main() {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentVisualBriefs = [
    ...(workspace.production.visualDirector.shotBriefs || []),
    ...(workspace.production.visualDirector.treatmentDirections || []).flatMap((direction) => direction.anchorBriefs || []),
  ];
  const candidatePool = workspace.production.visualDirector.generatedCandidates.filter((candidate) => {
    const brief = currentVisualBriefs.find((item) => item.id === candidate.briefId);
    const compositeUsesCurrentRenderer = candidate.compositePreview?.publicUrl?.includes(`-${compositorSourceSha256.slice(0, 12)}/`) === true;
    const staleReviewedComposite = brief?.productionBindingAllowed === true
      && ["not-selected-by-composite-critic", "composite-revision-required", "composite-approved"].includes(candidate.status)
      && !compositeUsesCurrentRenderer;
    return brief && candidate.briefHash === brief.briefHash
      && candidate.treatmentHash === brief.treatmentHash
      && (brief.productionBindingAllowed || brief.generationRole === "treatment-anchor")
      // Renderer/compositor fixes must re-review the existing raw image. They
      // must never spend another image-generation round just to refresh a
      // stale composite proof.
      && (["raw-ready-composite-pending", "composite-rendering"].includes(candidate.status) || staleReviewedComposite)
      && (!candidateArg || candidate.id === candidateArg || candidate.briefId === workspace.production.visualDirector.generatedCandidates.find((item) => item.id === candidateArg)?.briefId);
  });
  const reviewDirtySet = writeReviewDirtySet(workspace.production.visualDirector.generatedCandidates, currentVisualBriefs);
  if (!candidatePool.length) {
    console.log(JSON.stringify({status: "SKIPPED", reason: "no-generated-visual-composites-pending", dirtySet: reviewDirtySet.summary}));
    return;
  }
  const groups = [...new Set(candidatePool.map((candidate) => candidate.briefId))].map((briefId) => ({briefId, candidates: candidatePool.filter((candidate) => candidate.briefId === briefId)}));
  const now = new Date().toISOString();
  const reviewPlans = groups.map((group) => ({...group, plans: group.candidates.map((candidate) => buildReviewPlan(workspace, candidate, now))}));
  const allCompositeFilesCached = reviewPlans.every((group) => group.plans.every((reviewPlan) => fs.existsSync(deterministicCompositeFile(reviewPlan))));
  let serveUrl = null;
  let browser = null;
  if (allCompositeFilesCached) {
    updateTreatmentProgress("reusing-rendered-composites", {completedCount: 0, totalCount: candidatePool.length, timeoutMs: renderStageTimeoutMs});
  } else {
    updateTreatmentProgress("bundling-remotion-once", {totalCount: candidatePool.filter((candidate) => currentVisualBriefs.find((brief) => brief.id === candidate.briefId)?.generationRole === "treatment-anchor").length, timeoutMs: renderStageTimeoutMs});
    serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: rendererPublic, rootDir: rendererRoot, enableCaching: false});
    updateTreatmentProgress("opening-shared-browser", {});
    browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  }
  let requeuedRevisionJobs = 0;
  try {
    const reviewConcurrency = Math.min(2, Math.max(1, Number(process.env.A1_GENERATED_COMPOSITE_REVIEW_CONCURRENCY || 2)));
    const treatmentReviewPlans = reviewPlans.filter((group) => group.plans[0]?.brief.generationRole === "treatment-anchor");
    const standardReviewPlans = reviewPlans.filter((group) => group.plans[0]?.brief.generationRole !== "treatment-anchor");
    if (treatmentReviewPlans.length) {
      updateTreatmentProgress("rendering-six-composites", {completedCount: 0, totalCount: treatmentReviewPlans.reduce((sum, item) => sum + item.plans.length, 0)});
      const treatmentBatch = await renderAndCriticizeTreatmentBatch({reviewPlans: treatmentReviewPlans, workspace, serveUrl, browser, artifactDir});
      if (renderOnly) {
        console.log(JSON.stringify({
          status: "TREATMENT_BATCH_RENDER_ONLY_COMPLETE",
          candidateCount: treatmentBatch.rendered.length,
          imageGenerationDispatched: false,
          criticDispatched: false,
          renderCacheHitCount: treatmentBatch.rendered.filter((item) => item.renderCacheHit).length,
          boardCacheHitCount: treatmentBatch.rendered.filter((item) => item.boardCacheHit).length,
          criticProxyBytes: treatmentBatch.criticProxies.reduce((sum, item) => sum + item.proxySizeBytes, 0),
        }));
        updateTreatmentProgress("complete", {completedCount: treatmentBatch.rendered.length, totalCount: treatmentBatch.rendered.length});
      } else {
      await withProjectLockRetry(() => {
        const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
        let nextState = registerGeneratedTreatmentBatchReview(current, treatmentBatch.rendered, treatmentBatch.criticReport, new Date().toISOString());
        const event = createProductionEvent({
          workspace: current,
          action: "visual-treatment-batch-reviewed",
          targetId: treatmentBatch.criticReport.championTreatmentId || "visual-treatment-3x2",
          payload: {
            candidateIds: treatmentBatch.rendered.map((item) => item.candidateId),
            directionCount: treatmentBatch.criticReport.directions.length,
            championTreatmentId: treatmentBatch.criticReport.championTreatmentId,
            nextAction: treatmentBatch.criticReport.nextAction,
            modelRequestCount: treatmentBatch.criticReport.trace?.modelRequestCount || 0,
            cacheHit: treatmentBatch.criticReport.trace?.cacheHit === true,
            durationMs: treatmentBatch.criticReport.trace?.durationMs || 0,
          },
        });
        nextState.production.eventLedger.eventCount += 1;
        nextState.production.eventLedger.lastEventId = event.eventId;
        nextState.production.eventLedger.lastEventAt = event.createdAt;
        const recalculated = recalculateEditorialAssetWorkbench(nextState);
        persistProjectState(appRoot, recalculated, {event});
      });
      console.log(JSON.stringify({
        status: "TREATMENT_BATCH_REVIEW_COMPLETE",
        candidateCount: treatmentBatch.rendered.length,
        directionCount: treatmentBatch.criticReport.directions.length,
        championTreatmentId: treatmentBatch.criticReport.championTreatmentId,
        nextAction: treatmentBatch.criticReport.nextAction,
        modelRequestCount: treatmentBatch.criticReport.trace?.modelRequestCount || 0,
        criticCacheHit: treatmentBatch.criticReport.trace?.cacheHit === true,
        renderCacheHitCount: treatmentBatch.rendered.filter((item) => item.renderCacheHit).length,
        boardCacheHitCount: treatmentBatch.rendered.filter((item) => item.boardCacheHit).length,
        durationMs: treatmentBatch.criticReport.trace?.durationMs || 0,
      }));
      updateTreatmentProgress("complete", {completedCount: treatmentBatch.rendered.length, totalCount: treatmentBatch.rendered.length, batchHash: treatmentBatch.criticReport.trace?.batchHash || null});
      }
    }
    // Ordinary production briefs keep their per-brief candidate critic.  The
    // 3x2 treatment stage above is the only path allowed to compare directions.
    const reviewedGroups = await mapWithConcurrency(
      standardReviewPlans,
      reviewConcurrency,
      (group) => renderAndCriticizeGroup({group, workspace, serveUrl, browser, artifactDir}),
    );
    for (const {group, rendered, criticReport} of reviewedGroups) {
      const outcome = await withProjectLockRetry(() => {
        const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
        let nextState = registerGeneratedCompositeBatchReview(current, group.briefId, rendered, criticReport, new Date().toISOString());
        const selected = criticReport.selectedCandidateId
          ? nextState.production.visualDirector.generatedCandidates.find((candidate) => candidate.id === criticReport.selectedCandidateId)
          : null;
        const fallbackRevisionId = !selected && criticReport.verdict !== "PASS"
          ? [...(criticReport.candidates || [])].sort((left, right) => Number(right.score || 0) - Number(left.score || 0))[0]?.candidateId || null
          : null;
        const revisionTarget = selected || (fallbackRevisionId
          ? nextState.production.visualDirector.generatedCandidates.find((candidate) => candidate.id === fallbackRevisionId)
          : null);
        let adoptedAssetId = null;
        let revisionDispatch = null;
        const selectedBrief = selected
          ? [
            ...(nextState.production.visualDirector.shotBriefs || []),
            ...(nextState.production.visualDirector.treatmentDirections || []).flatMap((direction) => direction.anchorBriefs || []),
          ].find((item) => item.id === selected.briefId)
          : null;
        const treatmentAudit = selectedBrief?.generationRole === "treatment-anchor"
          ? buildVisualTreatmentAudit(nextState.production.visualDirector)
          : null;
        if (selected?.status === "composite-approved" && selectedBrief?.productionBindingAllowed) {
          const adopted = adoptGeneratedVisualCandidate(nextState, selected.id, new Date().toISOString());
          nextState = adopted.workspace;
          adoptedAssetId = adopted.asset.id;
          const shotAsset = nextState.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === selected.shotId);
          if (shotAsset) nextState = createSceneGraphCandidates(nextState, shotAsset.id, new Date().toISOString());
        } else if (revisionTarget && criticReport.verdict !== "PASS" && selectedBrief?.generationRole !== "treatment-anchor" && (!treatmentAudit || treatmentAudit.canAutoRevise)) {
          const brief = nextState.production.visualDirector.shotBriefs.find((item) => item.id === group.briefId);
          const revisionRound = Number(brief?.revision?.round || 1);
          // One structured retry is the hard fuse for a visual strategy.
          // If round 2 still misses 22/24, stop spending generation calls and
          // surface the brief for a different composition strategy.
          if (brief && revisionRound < 2) {
            const revision = revisionTarget.compositeReview?.structuredRevision || {};
            nextState = reviseVisualGenerationBrief(nextState, group.briefId, {
              mode: revisionTarget.compositeReview?.hardFailures?.some((failure) => /crop|edge|safe/iu.test(failure)) ? "inpaint" : "edit",
              parentGenerationId: revisionTarget.id,
              preserve: revision.preserve || [],
              remove: revision.remove || [],
              compositionChanges: revision.compositionChanges || [],
            }, new Date().toISOString());
            const queued = queueVisualGenerationBrief(nextState, group.briefId, {candidateCount: 2, expansionReason: revisionTarget.compositeReview?.confidence === "low-close-candidates" ? "critic-low-confidence-or-tie" : undefined}, new Date().toISOString());
            nextState = queued.workspace;
            revisionDispatch = {round: revisionRound + 1, parentCandidateId: revisionTarget.id, fallbackSelectedCandidate: !selected, queuedJobIds: queued.jobs.filter((job) => job.status === "queued").map((job) => job.id), structuredPatchOnly: true};
          }
        }
        const event = createProductionEvent({workspace: current, action: "generated-visual-composite-reviewed", targetId: group.briefId, payload: {candidateIds: rendered.map((item) => item.candidateId), selectedCandidateId: criticReport.selectedCandidateId, verdict: criticReport.verdict, totalScore: criticReport.totalScore, hardFailures: criticReport.hardFailures, adoptedAssetId, revisionDispatch}});
        nextState.production.eventLedger.eventCount += 1;
        nextState.production.eventLedger.lastEventId = event.eventId;
        nextState.production.eventLedger.lastEventAt = event.createdAt;
        const recalculated = recalculateEditorialAssetWorkbench(nextState);
        persistProjectState(appRoot, recalculated, {event});
        return {revisionJobCount: revisionDispatch?.queuedJobIds.length || 0};
      });
      requeuedRevisionJobs += outcome.revisionJobCount;
      console.log(JSON.stringify({status: criticReport.verdict, briefId: group.briefId, candidateCount: rendered.length, selectedCandidateId: criticReport.selectedCandidateId, score: criticReport.totalScore, maxScore: 24}));
    }
  } finally {
    if (browser) await browser.close({silent: true});
  }
  if (requeuedRevisionJobs > 0) {
    const generationWorker = spawn(process.execPath, [path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs")], {cwd: root, detached: true, stdio: "ignore"});
    generationWorker.unref();
    console.log(JSON.stringify({status: "STRUCTURED_REVISION_DISPATCHED", requeuedRevisionJobs, generationWorkerPid: generationWorker.pid || null}));
  }
}

try {
  const heartbeat = setInterval(() => {
    if (!["idle", "complete", "failed"].includes(treatmentProgress.phase)) updateTreatmentProgress(treatmentProgress.phase, {});
  }, 15_000);
  try {
    await main();
  } catch (error) {
    updateTreatmentProgress("failed", {error: compactProgressError(error)});
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
} finally {
  if (workerHandle != null) fs.closeSync(workerHandle);
  fs.rmSync(workerLock, {force: true});
}
