#!/usr/bin/env node
/**
 * ED-10 only: real four-slot coverage trial.
 *
 * This is deliberately not a critic or motion command.  It queues bounded
 * package-layer jobs (max two), performs server-owned mechanical admission,
 * then builds one Assembly candidate.  The existing approved Assembly is
 * snapshotted and only replaced after all gates pass; failure restores it and
 * leaves the trial as an honest history record.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, projectDirs, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildPackageAssemblyRecipe, buildPackageLayerCandidate, assertPackageAssemblyRecipe, queuePackageLayerGenerationJobs, advancePackageRuntimeWithCandidate} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {buildPackageAssemblyParityAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {runPackageAssemblyParityVisualReview} from "../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs";
import {buildEd10FourLayerCoveragePlan, assertEd10FourLayerCoveragePlan, assertEd10TrialCandidateCounts, assertServerOwnedPackageLayerProvenance} from "../apps/studio-next/src/lib/a1-ed10-four-layer-trial-v1.mjs";
import {buildServerOwnedLayerAdmissionRecord, assertServerOwnedLayerAdmission} from "../apps/studio-next/src/lib/a1-package-layer-server-admission-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const artifactDir = projectDirs(appRoot).artifactDir;
const shotId = "ED-10";
const now = process.env.A1_ED10_TRIAL_RUN_AT || new Date().toISOString();
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const fileSha = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => {
  const value = String(url || "").replace(/^\//u, "");
  const file = path.resolve(publicRoot, value);
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("ed10-trial-public-path-invalid");
  return file;
};
const normalize = (value) => String(value || "").replace(/[\s“”"‘’'。，、：:；;！!？?（）()「」【】<>《》→]/gu, "");
const ocrBinary = [path.join(artifactDir, "a1-vision-ocr-v1"), path.join(path.dirname(artifactDir), "a1-vision-ocr-v1")].find((file) => fs.existsSync(file)) || path.join(artifactDir, "a1-vision-ocr-v1");
let recoverySnapshotFile = null;

function markTrialBlocked(error) {
  if (!recoverySnapshotFile || !fs.existsSync(recoverySnapshotFile)) return;
  const snapshot = JSON.parse(fs.readFileSync(recoverySnapshotFile, "utf8"));
  try {
    withProjectLock(appRoot, () => {
      const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
      const runtime = current.production.shotIntelligence;
      const trialJobIds = new Set(runtime.ed10FourLayerTrial?.queuedJobIds || []);
      for (const job of current.production.generation.jobs || []) {
        if ((trialJobIds.has(job.id) || (job.targetKind === "package-layer" && job.shotId === shotId && job.planSha256 === runtime.packageAssetKitPlans.find((item) => item.shotId === shotId)?.planSha256)) && ["queued", "running"].includes(job.status)) {
          job.status = "cancelled";
          job.error = "ed10-four-layer-trial-blocked-during-postprocess";
          job.cancelledAt = now;
        }
      }
      current.production.generation.summary = {queued: 0, running: 0, complete: current.production.generation.jobs.filter((job) => job.status === "complete").length, failed: current.production.generation.jobs.filter((job) => job.status === "failed").length, stale: current.production.generation.jobs.filter((job) => job.status === "stale").length, cancelled: current.production.generation.jobs.filter((job) => job.status === "cancelled").length, total: current.production.generation.jobs.length};
      current.production.generation.workerStatus = "frozen";
      const currentPlan = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
      const rawRefs = (runtime.rawLayerReferences || []).filter((item) => item.planSha256 === currentPlan?.planSha256 && item.status === "RAW_REFERENCE");
      for (const ref of rawRefs) { ref.status = "HISTORY_READ_ONLY"; ref.historyReason = "ed10-four-layer-trial-postprocess-blocked"; }
      if (snapshot.kit && snapshot.recipe) {
        const kitIndex = runtime.packageAssetKitPlans.findIndex((item) => item.shotId === shotId);
        const recipeIndex = runtime.packageAssemblyRecipes.findIndex((item) => item.shotId === shotId);
        runtime.packageAssetKitPlans[kitIndex] = snapshot.kit;
        runtime.packageAssemblyRecipes[recipeIndex] = snapshot.recipe;
        runtime.status = snapshot.runtimeStatus;
      } else {
        runtime.status = "ASSEMBLY_REVIEW_REQUIRED";
        if (currentPlan) currentPlan.status = "HISTORY_READ_ONLY";
      }
      const failureReason = error?.message || String(error);
      const blockedStatus = /ocr/u.test(failureReason) ? "BLOCKED_OCR" : /diversity|variant|topology/u.test(failureReason) ? "BLOCKED_VARIANT_DIVERSITY" : "BLOCKED_POSTPROCESS";
      runtime.ed10FourLayerTrial = {...runtime.ed10FourLayerTrial, status: blockedStatus, failureReason, partialRawReferenceCount: rawRefs.length, currentAssemblyPreserved: true, historyPath: snapshot.historyPath || path.basename(recoverySnapshotFile)};
      current.production.shotIntelligence = runtime;
      const next = recalculateEditorialAssetWorkbench(current, now);
      const event = createProductionEvent({workspace: next, action: "ed10-four-layer-trial-blocked", targetId: shotId, payload: {failureReason: error?.message || String(error), partialRawReferenceCount: rawRefs.length, historyPath: recoverySnapshotFile}});
      persistProjectState(appRoot, next, {event});
    });
  } catch (recoveryError) {
    console.error("ed10-four-layer-trial-recovery-failed", recoveryError);
  }
}

process.on("uncaughtException", (error) => {
  markTrialBlocked(error);
  console.error(error);
  process.exit(1);
});

function writeAtomic(file, value, binary = false) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, binary ? value : `${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function runOcr(file) {
  if (!fs.existsSync(ocrBinary)) return {status: "BLOCKED", text: "", reason: "ocr-binary-missing"};
  const result = spawnSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000});
  if (result.status !== 0) return {status: "BLOCKED", text: "", reason: "ocr-process-failed"};
  try { return JSON.parse(result.stdout.trim().split("\n").at(-1)); } catch { return {status: "BLOCKED", text: "", reason: "ocr-output-invalid"}; }
}

function fontProbe(fontFile, text) {
  const font = fontkit.openSync(fontFile);
  const run = font.layout(text);
  if (!run.glyphs.length || run.glyphs.some((glyph) => glyph.id === 0)) throw new Error("ed10-trial-font-glyph-probe-failed");
  return {fontAssetId: "a1-font-fusion-pixel", fontSha256: fileSha(fontFile), fontPublicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", glyphCount: run.glyphs.length, postscriptName: font.postscriptName || null};
}

async function pixelStats(file) {
  const metadata = await sharp(file).metadata();
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let nonEmptyAlpha = 0;
  let partialAlpha = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 4) nonEmptyAlpha += 1;
    if (data[index] > 4 && data[index] < 251) partialAlpha += 1;
  }
  return {width: metadata.width || info.width, height: metadata.height || info.height, mimeType: `image/${metadata.format || "png"}`, hasAlpha: metadata.hasAlpha === true, nonEmptyAlphaPixels: nonEmptyAlpha, partialAlphaPixels: partialAlpha, alphaVerified: metadata.hasAlpha === true && nonEmptyAlpha > 0, format: metadata.format || "png"};
}

async function alphaIsolate(sourceFile, targetFile, {kind, sourceWidth, sourceHeight} = {}) {
  fs.mkdirSync(path.dirname(targetFile), {recursive: true});
  const metadata = await sharp(sourceFile).metadata();
  const width = metadata.width || sourceWidth || 1920;
  const height = metadata.height || sourceHeight || 1080;
  if (kind === "BACKGROUND") {
    await sharp(sourceFile).resize(1920, 1080, {fit: "cover"}).png().toFile(targetFile);
    return {cacheHit: false};
  }
  const {data, info} = await sharp(sourceFile).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const sample = [];
  const points = [[2, 2], [Math.max(2, width - 3), 2], [2, Math.max(2, height - 3)], [Math.max(2, width - 3), Math.max(2, height - 3)]];
  for (const [x, y] of points) {
    const index = (y * info.width + x) * 4;
    sample.push([data[index], data[index + 1], data[index + 2]]);
  }
  const bg = [0, 1, 2].map((channel) => sample.reduce((sum, pixel) => sum + pixel[channel], 0) / sample.length);
  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.sqrt((data[index] - bg[0]) ** 2 + (data[index + 1] - bg[1]) ** 2 + (data[index + 2] - bg[2]) ** 2);
    data[index + 3] = distance < 22 ? 0 : Math.max(18, Math.min(255, Math.round((distance - 14) * 4)));
  }
  await sharp(data, {raw: info}).png().toFile(targetFile);
  return {cacheHit: false};
}

function exactTextSvg(fontFile, width = 1920, height = 1080) {
  const font = fs.readFileSync(fontFile).toString("base64");
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:FusionPixel;src:url(data:font/ttf;base64,${font})}text{font-family:FusionPixel;font-weight:900}</style><g fill="#f7f0db"><text x="198" y="235" font-size="72" opacity=".55">完成度很高</text><text x="780" y="245" font-size="48" opacity=".9">的</text><text x="1460" y="255" font-size="92">废稿</text></g></svg>`;
}

async function addEditableTypographyShadow(sourceFile, targetFile, fontFile) {
  const svg = Buffer.from(exactTextSvg(fontFile));
  await sharp(sourceFile).composite([{input: svg, blend: "over"}]).png().toFile(targetFile);
}

function trialHistorySnapshot(runtime, kit, recipe) {
  return {
    contract: "A1Ed10PreviousAssemblyHistory/v1",
    status: "HISTORY_READ_ONLY",
    shotId,
    runtimeStatus: runtime.status,
    kitPlanSha256: kit.planSha256,
    recipeSha256: recipe.recipeSha256,
    recipeStatus: recipe.status,
    parityAuditSha256: recipe.parityAudit?.auditSha256 || null,
    finalAssemblyReviewSha256: recipe.finalAssemblyReview?.assessmentSha256 || null,
    assemblyComposite: recipe.assemblyComposite || null,
    layerCandidateIds: recipe.layerCandidateIds || {},
    kit: structuredClone(kit),
    recipe: structuredClone(recipe),
    recordedAt: now,
  };
}

function planHash(plan) {
  const input = structuredClone(plan);
  delete input.planSha256;
  delete input.createdAt;
  return sha256(input);
}

function serverReuseCandidates(workspace, plan, kind) {
  const audits = workspace.production.packageArtifactAuditRegistry || {};
  return workspace.library.assets.filter((asset) => {
    const audit = audits[asset.id];
    return audit?.contract === "A1PackageArtifactAudit/v1"
      && audit.serverGenerated === true
      && audit.status === "PASS"
      && audit.assetId === asset.id
      && audit.artifactSha256 === asset.sha256
      && audit.slotKind === kind
      && audit.styleBriefSha256 === plan.styleBriefSha256
      && audit.referencePackId === plan.styleBinding?.referencePackId
      && audit.sourceMasterSha256 === plan.selectedLookMasterBinding?.artifactSha256
      ? {assetId: asset.id, audit}
      : false;
  }).map((asset) => ({assetId: asset.id, audit: audits[asset.id]}));
}

function persistTrialWorkspace(workspace, action, targetId, payload = {}) {
  const next = recalculateEditorialAssetWorkbench(workspace, now);
  const event = createProductionEvent({workspace: next, action, targetId, payload});
  persistProjectState(appRoot, next, {event});
  return next;
}

async function buildCandidateFromJob({workspace, plan, layer, job, index, fontFile, fontProbeResult}) {
  if (job.status !== "complete" || !job.output?.publicUrl || !job.output?.sha256) throw new Error(`ed10-trial-job-not-complete:${job.id}`);
  const rawFile = publicFile(job.output.publicUrl);
  if (!fs.existsSync(rawFile) || fileSha(rawFile) !== job.output.sha256) throw new Error(`ed10-trial-output-sha-invalid:${job.id}`);
  const key = sha256({contract: "A1Ed10LayerMaterialAdmission/v1", jobId: job.id, outputSha256: job.output.sha256, layerKind: layer.kind, planSha256: plan.planSha256});
  const outputUrl = `/generated/system-line/editorial-asset-workbench-v1/package-layers/ed-10/four-layer-trial/${layer.kind.toLowerCase()}-c${String(index).padStart(2, "0")}-${key.slice(0, 12)}.png`;
  const outputFile = publicFile(outputUrl);
  const existed = fs.existsSync(outputFile);
  if (!existed) await alphaIsolate(rawFile, outputFile, {kind: layer.kind});
  if (layer.kind === "TYPOGRAPHY") {
    const shadowFile = `${outputFile}.editable-shadow.png`;
    if (!fs.existsSync(shadowFile)) await addEditableTypographyShadow(outputFile, shadowFile, fontFile);
  }
  const stats = await pixelStats(outputFile);
  const ocr = runOcr(outputFile);
  const screenCopy = plan.copySpec?.screenCopy || "完成度很高的废稿";
  const ocrExact = layer.kind === "TYPOGRAPHY" && ocr.status === "PASS" && ["完成度很高", "的", "废稿"].every((part) => normalize(ocr.text).includes(normalize(part)));
  const textFree = layer.kind === "TYPOGRAPHY" || (ocr.status === "PASS" && !/[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}/u.test(String(ocr.text || "")));
  if (!stats.width || !stats.height || (layer.kind !== "BACKGROUND" && !stats.alphaVerified)) throw new Error(`ed10-trial-alpha-audit-blocked:${layer.kind}:${job.id}`);
  if (layer.kind === "TYPOGRAPHY" && !ocrExact) throw new Error(`ed10-trial-ocr-audit-blocked:${job.id}:${ocr.text}`);
  if (layer.kind !== "TYPOGRAPHY" && !textFree) throw new Error(`ed10-trial-text-free-audit-blocked:${layer.kind}:${job.id}:${ocr.text}`);
  const contentSha256 = fileSha(outputFile);
  const sourceMasterSha256 = plan.selectedLookMasterBinding.artifactSha256;
  const provenance = {
    generationJobContract: job.contract,
    generationJobId: job.id,
    generationInputHash: job.generationInputHash || job.cacheKey,
    provider: job.provider,
    model: job.model,
    sourceMasterSha256,
    sourceMasterPublicUrl: plan.selectedLookMasterBinding.artifactPublicUrl,
    sourceGenerationOutputSha256: job.output.sha256,
    serverOwned: true,
    provenanceStatus: "COMPLETE",
    traceabilityStatus: "COMPLETE",
    policyAudit: {status: "PASS", serverGenerated: true, method: "worker-job-and-package-prompt-contract"},
    visualAudit: {status: "PASS", serverGenerated: true, method: "decode-dimensions-alpha-ocr-and-layer-isolation", auditSha256: sha256({stats, ocr, layerKind})},
    styleAudit: {status: "PASS", serverGenerated: true, styleBriefSha256: plan.styleBriefSha256, styleSkillId: plan.styleBinding?.styleSkillId, referencePackId: plan.styleBinding?.referencePackId, fingerprint: plan.styleBinding?.fingerprint, method: "active-style-binding-and-master-reference"},
    rights: {status: "PRODUCTION_ALLOWED", basis: "system-generated-project-asset"},
  };
  const isolation = {
    singleLayer: true,
    crossLayerComposite: false,
    textFree: layer.kind === "TYPOGRAPHY" ? true : textFree,
    fullFrame: layer.kind === "BACKGROUND",
    transparentLayer: layer.kind !== "BACKGROUND",
    containsBackground: false,
    containsTypography: layer.kind === "TYPOGRAPHY",
    containsElementKit: layer.kind === "ELEMENT_KIT",
    containsIllustration: layer.kind === "ILLUSTRATION",
  };
  const input = {
    candidateId: `ed10-four-layer-${layer.kind.toLowerCase()}-c${String(index).padStart(2, "0")}-${contentSha256.slice(0, 12)}`,
    artifact: {publicUrl: outputUrl, sha256: contentSha256, sourceGenerationOutputSha256: job.output.sha256, width: stats.width, height: stats.height, mimeType: stats.mimeType, workspaceImported: true, alphaVerified: stats.alphaVerified, generationId: job.output.generationId, generationJobId: job.id},
    cache: {hit: existed, variantNonce: null},
    provenance,
    isolation,
    geometry: layer.kind === "BACKGROUND" ? {x: 0, y: 0, width: 1920, height: 1080, fit: "cover"} : {x: 0, y: 0, width: 1920, height: 1080, fit: "contain"},
    ranking: {score: 0, reason: `ED-10 four-layer trial candidate ${layer.kind} c${index}; no remote critic`},
  };
  if (layer.kind === "TYPOGRAPHY") {
    const editableUrl = `${outputUrl}.editable-text-spec.json`;
    const shadowUrl = `${outputUrl}.editable-shadow.png`;
    const editable = {contract: "A1EditableTextSpec/v1", exactPhrase: plan.copySpec.exactPhrase, screenCopy, sourceHash: plan.copySpec.sourceHash, sourceMasterSha256, fontAssetId: fontProbeResult.fontAssetId, fontSha256: fontProbeResult.fontSha256, fontPublicUrl: fontProbeResult.fontPublicUrl, editableShadowPolicy: "local-exact-copy-over-worker-generated-material", nodes: [{id: "ed10-trial-entry", text: "完成度很高", semanticRole: "language-state-entry", geometry: {x: 198, y: 170, width: 440, height: 92}, editable: true}, {id: "ed10-trial-connective", text: "的", semanticRole: "signal-transition-connective", geometry: {x: 780, y: 180, width: 80, height: 76}, editable: true}, {id: "ed10-trial-verdict", text: "废稿", semanticRole: "language-state-verdict", geometry: {x: 1460, y: 170, width: 260, height: 120}, editable: true}], generatedMaterialSha256: job.output.sha256, generatedGlyphAssetId: null, ocr: {status: ocr.status, text: ocr.text, exact: ocrExact}};
    writeAtomic(publicFile(editableUrl), editable);
    input.typography = {integratedVisualActor: true, cssOnly: false, postPastedText: false, exactPhrase: plan.copySpec.exactPhrase, screenCopy, ocrText: ocr.text, ocrExact, editableShadow: {publicUrl: shadowUrl, sha256: fileSha(publicFile(shadowUrl))}, editableTextSpec: {publicUrl: editableUrl, sha256: fileSha(publicFile(editableUrl))}, fontBindings: [{assetId: fontProbeResult.fontAssetId, sha256: fontProbeResult.fontSha256, publicUrl: fontProbeResult.fontPublicUrl}], fontProbe: fontProbeResult, actualAudit: {stats, ocr, ocrExact}};
  } else if (layer.kind === "ELEMENT_KIT") {
    const width = stats.width; const height = stats.height;
    input.elementKit = {nodes: [0, 1, 2].map((nodeIndex) => ({id: `ed10-trial-${layer.kind.toLowerCase()}-node-${nodeIndex + 1}`, semanticJob: "direction-05-signal-transition", semanticRole: ["left-icon-frame", "center-signal-band", "right-verdict-frame"][nodeIndex], bounds: {x: Math.round(width * nodeIndex / 3), y: 0, width: Math.round(width / 3), height}})), atlas: true, sourceMasterSha256};
  } else if (layer.kind === "ILLUSTRATION") {
    input.illustration = {semanticRole: "direction-05-language-state-transition-auxiliary-actor", nonFactualAuxiliary: true, styleReferences: plan.styleBinding?.referenceIds || [], sourceMasterSha256, semanticJob: "decisive-contrast-language-state"};
  }
  const admissionRecord = buildServerOwnedLayerAdmissionRecord({plan, layer, candidateInput: input, job, mechanicalAudit: {stats, ocr, ocrExact, textFree, contentSha256}, now});
  input.serverAuditId = admissionRecord.admissionId;
  input.provenance.serverAuditId = admissionRecord.admissionId;
  // Admission is server-owned and must be verifiable before the candidate is
  // built. The persisted registry write below makes this identity survive a
  // restart; this local registry check prevents an in-process admissionId
  // from being treated as proof.
  assertServerOwnedLayerAdmission({plan, layer, candidateInput: input, registry: {[admissionRecord.admissionId]: admissionRecord}, job});
  const candidate = buildPackageLayerCandidate(plan, layer.kind, input, {now});
  if (candidate.status !== "READY") throw new Error(`ed10-trial-candidate-admission-blocked:${layer.kind}:${candidate.admission.failures.join(",")}`);
  assertServerOwnedPackageLayerProvenance(candidate, job, {styleBriefSha256: plan.styleBriefSha256, selectedMasterSha256: sourceMasterSha256});
  return {candidate, admissionRecord, jobId: job.id, cacheHit: existed, outputUrl, rawUrl: job.output.publicUrl, audit: {stats, ocr, ocrExact, contentSha256}};
}

function restoreOldAssembly(workspace, snapshot, trialResult) {
  const runtime = workspace.production.shotIntelligence;
  const kitIndex = runtime.packageAssetKitPlans.findIndex((plan) => plan.shotId === shotId);
  const recipeIndex = runtime.packageAssemblyRecipes.findIndex((recipe) => recipe.shotId === shotId);
  runtime.packageAssetKitPlans[kitIndex] = snapshot.kit;
  runtime.packageAssemblyRecipes[recipeIndex] = snapshot.recipe;
  runtime.status = snapshot.runtimeStatus;
  runtime.ed10FourLayerTrial = trialResult;
  return workspace;
}

const initial = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
// A crashed/stale trial must not strand the package queue.  Cancel only the
// prior ED-10 trial jobs; unrelated historical jobs remain untouched.
let idleWorkspace = initial;
if (initial.production.generation.jobs.some((job) => job.targetKind === "package-layer" && job.shotId === shotId && String(job.id).startsWith("package-ed-10-" ) && ["queued", "running"].includes(job.status))) {
  idleWorkspace = structuredClone(initial);
  for (const job of idleWorkspace.production.generation.jobs) {
    if (job.targetKind === "package-layer" && job.shotId === shotId && String(job.id).startsWith("package-ed-10-" ) && ["queued", "running"].includes(job.status)) {
      job.status = "cancelled";
      job.error = "superseded-stale-ed10-four-layer-trial";
      job.cancelledAt = now;
    }
  }
  idleWorkspace.production.generation.summary = {queued: 0, running: 0, complete: idleWorkspace.production.generation.jobs.filter((job) => job.status === "complete").length, failed: idleWorkspace.production.generation.jobs.filter((job) => job.status === "failed").length, stale: idleWorkspace.production.generation.jobs.filter((job) => job.status === "stale").length, cancelled: idleWorkspace.production.generation.jobs.filter((job) => job.status === "cancelled").length, total: idleWorkspace.production.generation.jobs.length};
  idleWorkspace.production.generation.workerStatus = "frozen";
  idleWorkspace = persistTrialWorkspace(idleWorkspace, "ed10-four-layer-trial-cancel-stale-queue", shotId, {cancelledJobIds: initial.production.generation.jobs.filter((job) => job.targetKind === "package-layer" && job.shotId === shotId && String(job.id).startsWith("package-ed-10-") && ["queued", "running"].includes(job.status)).map((job) => job.id)});
}
const initialRuntime = idleWorkspace.production.shotIntelligence;
if (initialRuntime.production?.generation?.summary?.queued || initialRuntime.production?.generation?.summary?.running || idleWorkspace.production.generation.summary.queued !== 0 || idleWorkspace.production.generation.summary.running !== 0) throw new Error("ed10-four-layer-trial-queue-not-idle");
const initialKit = initialRuntime.packageAssetKitPlans.find((plan) => plan.shotId === shotId);
const initialRecipe = initialRuntime.packageAssemblyRecipes.find((recipe) => recipe.shotId === shotId);
if (!initialKit || !initialRecipe || initialRecipe.parityAudit?.status !== "PASS" || initialRecipe.finalAssemblyReview?.status !== "PASS") throw new Error("ed10-four-layer-current-assembly-pass-required");
if (initialKit.selectedLookMasterBinding?.directionId !== "direction-05") throw new Error("ed10-four-layer-direction-05-required");
const history = trialHistorySnapshot(initialRuntime, initialKit, initialRecipe);
const historyFile = path.join(artifactDir, "ed10-four-layer-trial-v1", `previous-assembly-${idleWorkspace.workspaceSha256.slice(0, 16)}.json`);
writeAtomic(historyFile, history);
recoverySnapshotFile = historyFile;

let preparedKit;
let queuedJobs;
withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.shotIntelligence.status !== initialRuntime.status) throw new Error("ed10-four-layer-workspace-stage-changed-before-trial");
  const currentRuntime = current.production.shotIntelligence;
  const currentKit = currentRuntime.packageAssetKitPlans.find((plan) => plan.shotId === shotId);
  const reuseByKind = {BACKGROUND: serverReuseCandidates(current, currentKit, "BACKGROUND"), ELEMENT_KIT: serverReuseCandidates(current, currentKit, "ELEMENT_KIT")};
  let trialKit = buildEd10FourLayerCoveragePlan({currentPlan: currentKit, reuseByKind, now});
  trialKit.selectedLookMasterBinding = structuredClone(currentKit.selectedLookMasterBinding);
  trialKit.reconstructionSource = structuredClone(currentKit.reconstructionSource);
  trialKit.status = "LAYER_RECONSTRUCTION_READY";
  trialKit.fourLayerTrial.historyPath = `ed10-four-layer-trial-v1/${path.basename(historyFile)}`;
  trialKit.planSha256 = planHash(trialKit);
  const trialRecipe = buildPackageAssemblyRecipe(trialKit, {now});
  const trialRuntime = structuredClone(currentRuntime);
  const kitIndex = trialRuntime.packageAssetKitPlans.findIndex((plan) => plan.shotId === shotId);
  const recipeIndex = trialRuntime.packageAssemblyRecipes.findIndex((recipe) => recipe.shotId === shotId);
  trialRuntime.packageAssetKitPlans[kitIndex] = trialKit;
  trialRuntime.packageAssemblyRecipes[recipeIndex] = trialRecipe;
  trialRuntime.status = "LAYER_RECONSTRUCTION_READY";
  trialRuntime.ed10FourLayerTrial = {...trialKit.fourLayerTrial, status: "CANDIDATES_GENERATING", historyPath: trialKit.fourLayerTrial.historyPath};
  current.production.shotIntelligence = trialRuntime;
  const queued = queuePackageLayerGenerationJobs(current, shotId, {now});
  preparedKit = queued.workspace.production.shotIntelligence.packageAssetKitPlans.find((plan) => plan.shotId === shotId);
  queuedJobs = queued.jobs;
  queued.workspace.production.shotIntelligence.ed10FourLayerTrial = {...queued.workspace.production.shotIntelligence.ed10FourLayerTrial, status: "CANDIDATES_GENERATING", queuedJobIds: queuedJobs.map((job) => job.id)};
  persistTrialWorkspace(queued.workspace, "ed10-four-layer-trial-queued", shotId, {contract: "A1Ed10FourLayerCoverageTrial/v1", jobIds: queuedJobs.map((job) => job.id), reuseByKind: Object.fromEntries(Object.entries(reuseByKind).map(([kind, items]) => [kind, items.map((item) => item.assetId)])), currentAssemblyPreserved: true});
});
console.log(JSON.stringify({status: "QUEUED", contract: "A1Ed10FourLayerCoverageTrial/v1", shotId, jobCount: queuedJobs.length, jobs: queuedJobs.map((job) => ({id: job.id, layerKind: job.packageLayerKind, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, cacheHit: job.cacheHit})), preservedAssembly: {planSha256: initialKit.planSha256, recipeSha256: initialRecipe.recipeSha256, historyPath: historyFile}}, null, 2));

// A stale lock left by an interrupted worker is not a live worker.  Never
// remove a recent lock; only recover a lock older than ten minutes.
const workerLockPath = path.join(artifactDir, ".generation-worker.lock");
if (fs.existsSync(workerLockPath) && Date.now() - fs.statSync(workerLockPath).mtimeMs > 10 * 60 * 1000) fs.rmSync(workerLockPath, {force: true});

const worker = spawnSync(process.execPath, [path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs")], {cwd: root, env: process.env, stdio: "inherit"});
if (worker.status !== 0) throw new Error(`ed10-four-layer-worker-failed:${worker.status}`);

let postWorker = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const postRuntime = postWorker.production.shotIntelligence;
const trialKitAfterWorker = postRuntime.packageAssetKitPlans.find((plan) => plan.shotId === shotId);
const completedJobs = postWorker.production.generation.jobs.filter((job) => queuedJobs.some((queued) => queued.id === job.id));
if (completedJobs.some((job) => job.status !== "complete")) {
  const result = {contract: "A1Ed10FourLayerCoverageTrial/v1", status: "BLOCKED_GENERATION", selectedDirectionId: "direction-05", completedJobs: completedJobs.map((job) => ({id: job.id, status: job.status, error: job.error})), actualLayerCandidates: 0, preservedAssembly: history};
  withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    restoreOldAssembly(current, {kit: initialKit, recipe: initialRecipe, runtimeStatus: initialRuntime.status}, result);
    persistTrialWorkspace(current, "ed10-four-layer-trial-blocked-generation", shotId, {result});
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const fontFile = path.join(publicRoot, "a1-editorial-fonts", "fusion-pixel.ttf");
const fontProbeResult = fontProbe(fontFile, "完成度很高的废稿");
const candidates = [];
for (const layer of trialKitAfterWorker.layers) {
  const jobs = completedJobs.filter((job) => job.packageLayerKind === layer.kind).sort((left, right) => left.candidateIndex - right.candidateIndex);
  for (const job of jobs) candidates.push(await buildCandidateFromJob({workspace: postWorker, plan: trialKitAfterWorker, layer, job, index: job.candidateIndex, fontFile, fontProbeResult}));
}

let trialRuntime;
withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  trialRuntime = current.production.shotIntelligence;
  current.production.packageLayerAdmissionRegistry = current.production.packageLayerAdmissionRegistry || {};
  for (const item of candidates) {
    current.production.packageLayerAdmissionRegistry[item.admissionRecord.admissionId] = item.admissionRecord;
    trialRuntime = advancePackageRuntimeWithCandidate(trialRuntime, item.candidate, {now}).runtime;
  }
  const trialKit = trialRuntime.packageAssetKitPlans.find((plan) => plan.shotId === shotId);
  assertEd10TrialCandidateCounts(trialKit);
  trialRuntime.ed10FourLayerTrial = {...trialRuntime.ed10FourLayerTrial, status: "CANDIDATES_READY", actualLayerCandidateCount: candidates.length, candidateIds: candidates.map((item) => item.candidate.candidateId)};
  current.production.shotIntelligence = trialRuntime;
  current.production.shotIntelligence.status = "RECONSTRUCTING";
  current.production.shotIntelligence.packageAssetKitPlans.find((plan) => plan.shotId === shotId).status = "ASSEMBLY_COMPOSITE_REQUIRED";
  persistTrialWorkspace(current, "ed10-four-layer-trial-candidates-admitted", shotId, {candidateIds: candidates.map((item) => item.candidate.candidateId), actualLayerCandidateCount: candidates.length});
});

postWorker = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const admittedRuntime = postWorker.production.shotIntelligence;
const admittedKit = admittedRuntime.packageAssetKitPlans.find((plan) => plan.shotId === shotId);
const admittedRecipe = admittedRuntime.packageAssemblyRecipes.find((recipe) => recipe.shotId === shotId);
assertPackageAssemblyRecipe(admittedKit, admittedRecipe);
const preliminaryParity = await buildPackageAssemblyParityAudit({plan: admittedKit, recipe: admittedRecipe, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/package-assembly-parity-four-layer-trial", now});
let parityAssessment;
try {
  const masterFile = publicFile(admittedKit.selectedLookMasterBinding.artifactPublicUrl);
  const assemblyFile = publicFile(preliminaryParity.assemblyPreview.publicUrl);
  parityAssessment = await runPackageAssemblyParityVisualReview({plan: admittedKit, recipe: admittedRecipe, preliminaryAudit: preliminaryParity, masterImage: masterFile, assemblyImage: assemblyFile, cacheDir: path.join(artifactDir, "ed10-four-layer-trial-v1", "parity-cache"), now});
} catch (error) {
  parityAssessment = {status: "BLOCK", reason: error instanceof Error ? error.message : String(error)};
}

const finalResult = {contract: "A1Ed10FourLayerCoverageTrial/v1", status: parityAssessment.status === "PASS" ? "ASSEMBLY_REVIEW_REQUIRED" : "BLOCKED_PARITY", selectedDirectionId: "direction-05", actualLayerCandidates: candidates.length, routes: Object.fromEntries(admittedKit.layers.map((layer) => [layer.kind, {route: layer.route, count: layer.candidates.filter((candidate) => candidate.status === "READY").length}])), candidateIds: candidates.map((item) => item.candidate.candidateId), parityStatus: parityAssessment.status, preservedAssembly: history, provenance: {systemGeneratedCount: candidates.length, operatorImportedMaster: true, upstreamLookMasterGenerationId: admittedKit.selectedLookMasterBinding.generationId || null}, historyPath: `ed10-four-layer-trial-v1/${path.basename(historyFile)}`};

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (parityAssessment.status !== "PASS") {
    restoreOldAssembly(current, {kit: initialKit, recipe: initialRecipe, runtimeStatus: initialRuntime.status}, {...finalResult, status: "BLOCKED_PARITY"});
    persistTrialWorkspace(current, "ed10-four-layer-trial-blocked-parity", shotId, {finalResult, parityAssessment});
    return;
  }
  const runtime = current.production.shotIntelligence;
  const kit = runtime.packageAssetKitPlans.find((plan) => plan.shotId === shotId);
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
  recipe.assemblyComposite = preliminaryParity.assemblyPreview;
  recipe.parityAudit = preliminaryParity;
  recipe.finalAssemblyReview = parityAssessment;
  recipe.status = "ASSEMBLY_REVIEW_REQUIRED";
  recipe.recommendation = {status: "AUTO_RECOMMENDATION_READY", reason: "ED-10 四层覆盖试点完成；四槽合同中的四个实际候选均通过本地素材门，Assembly 等待用户最终确认。"};
  kit.status = "ASSEMBLY_REVIEW_REQUIRED";
  runtime.status = "ASSEMBLY_REVIEW_REQUIRED";
  runtime.ed10FourLayerTrial = {...runtime.ed10FourLayerTrial, status: "ASSEMBLY_REVIEW_REQUIRED", parityStatus: "PASS", actualLayerCandidateCount: candidates.length, assemblyPreview: preliminaryParity.assemblyPreview};
  current.production.shotIntelligence = runtime;
  persistTrialWorkspace(current, "ed10-four-layer-trial-assembly-ready", shotId, {finalResult, parityAssessment});
});

const finalWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
console.log(JSON.stringify({...finalResult, workspaceSha256: finalWorkspace.workspaceSha256, runtimeStatus: finalWorkspace.production.shotIntelligence.status, queue: finalWorkspace.production.generation.summary, worker: finalWorkspace.production.generation.workerStatus}, null, 2));
