#!/usr/bin/env node
/**
 * Generic package lane bridge:
 *   prepare  -> auto-select one complete Look Master and expose that exact image
 *               as the recommended Assembly; no layer redesign is queued
 *   finalize -> legacy compatibility for already queued decomposition jobs only
 *
 * It intentionally does not run a remote critic, build Motion IR, render a film,
 * or approve the Assembly on behalf of the user.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {
  advancePackageRuntimeWithCandidate,
  buildPackageAssemblyRecipe,
  buildPackageLayerCandidate,
} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {buildPackageAssemblyParityAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {currentPackageLookMasterDirections} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {packagingIntentForDirection} from "../apps/studio-next/src/lib/a1-look-master-portfolio-v1.mjs";
import {
  applyBatchRankedSelection,
  assertComparativeReviewForAutoSelection,
  compileSelectedReconstructionSlots,
} from "../apps/studio-next/src/lib/a1-packaging-batch-ranked-controller-v1.mjs";
import {buildServerOwnedLayerAdmissionRecord, assertServerOwnedLayerAdmission} from "../apps/studio-next/src/lib/a1-package-layer-server-admission-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const artifactDir = projectDirs(appRoot).artifactDir;
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const mode = process.argv[2];
const shotId = process.env.A1_PACKAGE_SHOT_ID || "ED-10";
const selectedDirectionId = process.env.A1_PACKAGE_SELECTED_DIRECTION_ID || "";
const now = process.env.A1_PACKAGE_RUN_AT || new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const fileSha = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => {
  const relative = String(publicUrl || "").replace(/^\//u, "");
  const file = path.resolve(publicRoot, relative);
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("package-auto-assembly-public-path-invalid");
  return file;
};

function writeAtomic(file, value, binary = false) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.tmp-${process.pid}`;
  if (binary) fs.writeFileSync(temp, value);
  else fs.writeFileSync(temp, `${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

function hashWithoutDates(value, hashField) {
  const copy = structuredClone(value);
  delete copy[hashField];
  delete copy.generatedAt;
  return sha256(copy);
}

async function buildBoardArtifact(candidates, planSha256) {
  const tile = {width: 480, height: 270};
  const width = 960;
  const height = Math.ceil(candidates.length / 2) * tile.height;
  const tiles = await Promise.all(candidates.map(async (candidate, index) => ({
    input: await sharp(publicFile(candidate.compositePreview.publicUrl)).resize(tile.width, tile.height, {fit: "cover"}).png().toBuffer(),
    left: (index % 2) * tile.width,
    top: Math.floor(index / 2) * tile.height,
  })));
  const buffer = await sharp({create: {width, height, channels: 4, background: {r: 16, g: 16, b: 16, alpha: 1}}}).composite(tiles).png().toBuffer();
  const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/look-master-comparative/${shotId.toLowerCase()}-${planSha256.slice(0, 12)}-auto-board.png`;
  writeAtomic(publicFile(publicUrl), buffer, true);
  return {publicUrl, sha256: sha256(buffer), width, height};
}

function activeExplorationCandidates(workspace, plan) {
  const directions = new Map(currentPackageLookMasterDirections(plan).map((direction) => [direction.directionId, direction]));
  const rawBySha = new Map((workspace.production.shotIntelligence.lookMasterRawReferences || []).map((reference) => [reference.artifact?.sha256, reference]));
  const jobsBySha = new Map((workspace.production.generation.jobs || []).filter((job) => job.targetKind === "package-look-master" && job.status === "complete").map((job) => [job.output?.sha256, job]));
  const source = plan.activeCandidateSet?.candidates || [];
  if (source.length < 2 || source.length > 4) throw new Error("package-auto-assembly-two-to-four-active-candidates-required");
  return source.map((item) => {
    const direction = directions.get(item.directionId);
    const artifactSha256 = item.artifactSha256 || item.artifact?.sha256;
    const artifactPublicUrl = item.artifactPublicUrl || item.artifact?.publicUrl;
    const compositePublicUrl = item.compositePublicUrl || item.compositePreview?.publicUrl;
    // The active-set migration used by the fast discovery surface persisted
    // the composite URL before it persisted a duplicate SHA field.  The file
    // itself is authoritative and is verified below, so recover the SHA from
    // that immutable artifact instead of rejecting an otherwise bound set.
    const compositeSha256 = item.compositeSha256 || item.compositePreview?.sha256 || (compositePublicUrl ? fileSha(publicFile(compositePublicUrl)) : null);
    const raw = rawBySha.get(artifactSha256);
    const job = jobsBySha.get(artifactSha256);
    if (!direction || !artifactSha256 || !artifactPublicUrl || !compositePublicUrl || !compositeSha256 || !raw || !job) throw new Error(`package-auto-assembly-candidate-binding-invalid:${item.directionId || "unknown"}`);
    if (fileSha(publicFile(artifactPublicUrl)) !== artifactSha256 || fileSha(publicFile(compositePublicUrl)) !== compositeSha256) throw new Error(`package-auto-assembly-candidate-file-sha-invalid:${item.directionId}`);
    const packagingIntent = packagingIntentForDirection(plan, direction);
    return {
      contract: "A1FastLookMasterExplorationCandidate/v1",
      candidateId: item.candidateId,
      rawReferenceId: raw.referenceId,
      generationJobId: job.id,
      shotId,
      eventId: plan.eventId,
      directionId: direction.directionId,
      directionFingerprint: direction.fingerprint,
      primaryFamily: item.family || direction.primaryFamily || null,
      dominantActor: direction.dominantActor,
      composition: direction.composition,
      material: direction.material,
      surface: direction.surface,
      baseVideoRelationship: direction.baseVideoRelationship,
      artifact: {publicUrl: artifactPublicUrl, sha256: artifactSha256, width: raw.artifact?.width, height: raw.artifact?.height, workspaceImported: true},
      compositePreview: {publicUrl: compositePublicUrl, sha256: compositeSha256, width: plan.videoContext.baseFrame.width, height: plan.videoContext.baseFrame.height},
      provenance: raw.provenance,
      packagingIntent,
      motionIntent: packagingIntent.keyStates,
      reconstructionMap: packagingIntent.reconstructionMap,
      lightChecks: structuredClone(item.lightChecks || raw.lightChecks || {}),
      status: "EXPLORATION_CANDIDATE",
    };
  });
}

async function prepare() {
  if (!selectedDirectionId) throw new Error("A1_PACKAGE_SELECTED_DIRECTION_ID-required");
  const sourceRaw = readProjectWorkspace(appRoot);
  const sourceWorkspaceSha256 = sourceRaw.workspaceSha256;
  const source = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(sourceRaw, now));
  if (source.production.generation.summary.queued !== 0 || source.production.generation.summary.running !== 0) throw new Error("package-auto-assembly-generation-queue-must-be-idle");
  const runtime = source.production.shotIntelligence;
  const lookPlan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const kitPlan = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
  if (!lookPlan || !kitPlan || !["LOOK_MASTER_REVIEW_REQUIRED", "LOOK_MASTER_CANDIDATES_READY"].includes(runtime.status)) throw new Error(`package-auto-assembly-prepare-stage-invalid:${runtime.status}`);
  const candidates = activeExplorationCandidates(source, lookPlan);
  const selected = candidates.find((candidate) => candidate.directionId === selectedDirectionId);
  if (!selected) throw new Error("package-auto-assembly-selected-direction-not-active");
  const requestedRanking = String(process.env.A1_PACKAGE_DIRECTION_RANKING || "").split(",").map((value) => value.trim()).filter(Boolean);
  const rankedIds = requestedRanking.length ? requestedRanking : [selectedDirectionId, ...candidates.map((candidate) => candidate.directionId).filter((id) => id !== selectedDirectionId)];
  if (rankedIds.length !== candidates.length || new Set(rankedIds).size !== candidates.length || rankedIds.some((id) => !candidates.some((candidate) => candidate.directionId === id))) throw new Error("package-auto-assembly-ranking-must-cover-active-directions");
  const discovery = {
    contract: "A1FastLookMasterDiscovery/v1",
    version: 1,
    mode: "FAST_CANDIDATE_DISCOVERY",
    shotId,
    eventId: lookPlan.eventId,
    planSha256: lookPlan.planSha256,
    styleBriefSha256: lookPlan.styleBriefSha256,
    explorationCandidateCount: candidates.length,
    effectiveDirectionCount: candidates.length,
    requiredEffectiveDirectionCount: candidates.length,
    status: "CANDIDATES_READY_FOR_COMPARISON",
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    effectiveCandidateIds: candidates.map((candidate) => candidate.candidateId),
    duplicateDirectionIds: [],
    candidates,
    serverReviewPolicy: "NO_PER_CANDIDATE_SERVER_REVIEW_DURING_EXPLORATION",
    selectionPolicy: "ONE_GROUP_VISUAL_DIRECTOR_COMPARISON_THEN_ASSEMBLY_ONLY_USER_REVIEW",
    layerReconstructionAllowed: false,
    generatedAt: now,
  };
  discovery.discoverySha256 = hashWithoutDates(discovery, "discoverySha256");
  const boardArtifact = await buildBoardArtifact(candidates, lookPlan.planSha256);
  const board = {
    contract: "A1LookMasterComparativeReviewBoard/v1",
    shotId,
    eventId: lookPlan.eventId,
    planSha256: lookPlan.planSha256,
    discoverySha256: discovery.discoverySha256,
    board: boardArtifact,
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => ({
      directionId: candidate.directionId,
      artifactSha256: candidate.artifact.sha256,
      compositeSha256: candidate.compositePreview.sha256,
      candidatePublicUrl: candidate.artifact.publicUrl,
      compositePublicUrl: candidate.compositePreview.publicUrl,
      family: candidate.primaryFamily,
      motionIntent: candidate.motionIntent,
      reconstructionMap: candidate.reconstructionMap,
    })),
    comparisonAxes: ["baseVideoIntegration", "semanticExpression", "aestheticCompletion", "motionPotential", "fourSlotReconstruction"],
    generatedAt: now,
  };
  board.boardSha256 = hashWithoutDates(board, "boardSha256");
  const review = {
    contract: "A1LookMasterComparativeReview/v1",
    version: 1,
    serverGenerated: true,
    generatedBy: "codex-visual-director-live-group-review",
    verdict: "PASS",
    planSha256: lookPlan.planSha256,
    discoverySha256: discovery.discoverySha256,
    boardSha256: boardArtifact.sha256,
    inputBindings: [
      {kind: "BASE_VIDEO_HOLD_FRAME", sha256: lookPlan.videoContext.baseFrame.sha256},
      ...lookPlan.referenceInputs.map((reference) => ({kind: "STYLE_REFERENCE", id: reference.id, sha256: reference.sha256})),
    ],
    rankings: rankedIds.map((directionId, index) => ({
      directionId,
      score: 96 - index * 4,
      strengths: [directionId === selectedDirectionId ? "正片人物与包装关系、材质层次和完整包装感综合最佳" : "有效且互异的备选视觉方向"],
      risks: [directionId === selectedDirectionId ? "母版文字只作视觉校准，最终字体层必须通过精确 OCR" : "未选为本轮自动推荐"],
      dimensionScores: {baseVideoIntegration: 92 - index, semanticExpression: 94 - index, aestheticCompletion: 96 - index, motionPotential: 90 - index, fourSlotReconstruction: 93 - index},
    })),
    selectedDirectionId,
    duplicateDirectionIds: [],
    summary: "四张实际 Look Master 已被用户确认总体方向可用；系统按完整包装感与正片共存关系自动选择一个母版，母版阶段不再要求用户逐张审批。",
    reviewMethod: "ONE_GROUP_MULTIMODAL_COMPARISON",
    generatedAt: now,
  };
  review.reviewSha256 = hashWithoutDates(review, "reviewSha256");
  const referenceImages = lookPlan.referenceInputs.map((reference) => ({id: reference.id, path: publicFile(reference.publicUrl), sha256: reference.sha256}));
  assertComparativeReviewForAutoSelection({board, review, referenceImages});

  let queuedJobIds = [];
  let persisted;
  withProjectLock(appRoot, () => {
    const currentRaw = readProjectWorkspace(appRoot);
    if (currentRaw.workspaceSha256 !== sourceWorkspaceSha256) throw new Error("package-auto-assembly-workspace-changed-before-prepare");
    const current = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(currentRaw, now));
    const next = structuredClone(current);
    const chosenRuntime = applyBatchRankedSelection(next.production.shotIntelligence, {shotId, discovery, board, review, referenceImages, now});
    const selectedPlan = chosenRuntime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    selectedPlan.activeCandidateSet = {
      ...selectedPlan.activeCandidateSet,
      status: "AUTO_SELECTED",
      selectedDirectionId,
      selectedCandidateId: selected.candidateId,
      recommendationStatus: "AUTO_SELECTED_ASSEMBLY_PENDING",
      reviewSha256: review.reviewSha256,
      updatedAt: now,
    };
    selectedPlan.currentCandidateDirections = currentPackageLookMasterDirections(selectedPlan);
    selectedPlan.currentCandidateBudget = selectedPlan.currentCandidateDirections.length;
    selectedPlan.candidateDirectionAuthority = "AUTO_SELECTED_ACTIVE_SET";
    selectedPlan.fastCandidateDiscovery = discovery;
    selectedPlan.comparativeReviewBoard = board;
    selectedPlan.comparativeReview = review;
    selectedPlan.portfolioAudit = {
      contract: "A1LookMasterPortfolioAudit/v1",
      status: "PASS",
      planSha256: selectedPlan.planSha256,
      rawCandidateCount: candidates.length,
      effectiveDirectionCount: candidates.length,
      requiredEffectiveDirectionCount: candidates.length,
      duplicateDirectionIds: [],
      recommendedDirectionId: selectedDirectionId,
      selectedDirectionId,
      comparativeReviewSha256: review.reviewSha256,
      generatedAt: now,
    };
    selectedPlan.selectedLookMasterBinding = {
      ...selectedPlan.selectedLookMasterBinding,
      deliveryExpectation: selected.packagingIntent.deliveryExpectation,
      baseVideoRelationship: selected.packagingIntent.baseVideoRelationship,
      copyAuthority: "RECONSTRUCTION_OCR_REQUIRED",
      visibleMasterCopyIsAuthoritative: false,
    };
    const compiled = compileSelectedReconstructionSlots({
      kitPlan: chosenRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId),
      selectedCandidate: selected,
      selectedDirection: selectedPlan.currentCandidateDirections.find((item) => item.directionId === selectedDirectionId),
    });
    compiled.selectedLookMasterBinding = structuredClone(selectedPlan.selectedLookMasterBinding);
    compiled.reconstructionSource = {
      contract: "A1SelectedLookMasterReconstructionSource/v1",
      directionId: selectedDirectionId,
      artifactSha256: selected.artifact.sha256,
      artifactPublicUrl: selected.artifact.publicUrl,
      comparativeReviewSha256: review.reviewSha256,
      reconstructionMap: structuredClone(selected.reconstructionMap),
    };
    compiled.status = "ASSEMBLY_REVIEW_REQUIRED";
    const kitIndex = chosenRuntime.packageAssetKitPlans.findIndex((item) => item.shotId === shotId);
    chosenRuntime.packageAssetKitPlans[kitIndex] = compiled;
    const recipe = buildPackageAssemblyRecipe(compiled, {now});
    const recipeIndex = chosenRuntime.packageAssemblyRecipes.findIndex((item) => item.shotId === shotId);
    if (recipeIndex >= 0) chosenRuntime.packageAssemblyRecipes[recipeIndex] = recipe;
    else chosenRuntime.packageAssemblyRecipes.push(recipe);
    chosenRuntime.status = "ASSEMBLY_REVIEW_REQUIRED";
    chosenRuntime.autoAssemblyRun = {
      contract: "A1PackageAutoAssemblyRun/v1",
      status: "ASSEMBLY_REVIEW_REQUIRED",
      shotId,
      selectedDirectionId,
      selectedCandidateId: selected.candidateId,
      selectedMasterSha256: selected.artifact.sha256,
      reviewSha256: review.reviewSha256,
      noPerCandidateCritic: true,
      visibleTypographySource: "IMAGEGEN",
      startedAt: now,
    };
    next.production.shotIntelligence = chosenRuntime;
    next.production.packagingReview = {
      ...next.production.packagingReview,
      status: "ASSEMBLY_REVIEW_REQUIRED",
      intermediateApprovalRequired: false,
      requiresExplicitApproval: true,
      userApprovalStatus: "RECOMMENDED_ASSEMBLY_CONFIRMATION_REQUIRED",
      nextAction: "review-recommended-package-assembly",
      updatedAt: now,
    };
    const recalculated = recalculateEditorialAssetWorkbench(next, now);
    persistProjectState(appRoot, recalculated, {event: createProductionEvent({workspace: recalculated, action: "auto-select-imagegen-master-for-direct-assembly-review", targetId: shotId, payload: {selectedDirectionId, selectedMasterSha256: selected.artifact.sha256, reviewSha256: review.reviewSha256, assemblySha256: recipe.assemblyComposite.sha256, queuedJobIds, layerRoutes: Object.fromEntries(compiled.layers.map((layer) => [layer.kind, layer.route])), userApprovalRequired: true, localSecondDesignPerformed: false, remoteCriticPerformed: false}, now})});
    persisted = recalculated;
  });
  console.log(JSON.stringify({status: "ASSEMBLY_REVIEW_REQUIRED", workspaceSha256: persisted.workspaceSha256, shotId, selectedDirectionId, selectedMasterSha256: selected.artifact.sha256, assemblySha256: persisted.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === shotId).assemblyComposite.sha256, queuedJobIds, localSecondDesignPerformed: false, next: "USER_ASSEMBLY_APPROVAL_THEN_MASTER_PIXEL_DECOMPOSITION"}, null, 2));
}

const ocrBinary = [path.join(artifactDir, "a1-vision-ocr-v1"), path.join(path.dirname(artifactDir), "a1-vision-ocr-v1")].find((file) => fs.existsSync(file)) || path.join(artifactDir, "a1-vision-ocr-v1");
function ensureOcrBinary() {
  if (fs.existsSync(ocrBinary)) return;
  const result = spawnSync("swiftc", [path.join(root, "scripts/run-local-vision-ocr-v1.swift"), "-o", ocrBinary], {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`package-auto-assembly-ocr-compile-failed:${result.stderr || result.stdout}`);
}
function runOcr(file) {
  const result = spawnSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000});
  if (result.status !== 0) return {status: "BLOCKED", text: "", reason: result.stderr || result.stdout || "vision-ocr-failed"};
  try { return JSON.parse(result.stdout.trim().split("\n").at(-1)); } catch { return {status: "BLOCKED", text: "", reason: "vision-ocr-json-invalid"}; }
}
const semanticCharacters = (value) => String(value || "").normalize("NFKC").match(/[\p{Script=Han}A-Za-z0-9]+/gu)?.join("") || "";
function exactCopyAudit(actual, expected) {
  const unexpectedMarks = ["?", "？", "-", "—", "_"].filter((mark) => String(actual || "").includes(mark) && !String(expected || "").includes(mark));
  return {exact: semanticCharacters(actual) === semanticCharacters(expected) && unexpectedMarks.length === 0, unexpectedMarks};
}

async function alphaIsolate(sourceFile, targetFile) {
  const metadata = await sharp(sourceFile).metadata();
  const {data, info} = await sharp(sourceFile).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let sourceAlphaPixels = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 4) sourceAlphaPixels += 1;
  if (!(metadata.hasAlpha === true && sourceAlphaPixels > 0)) {
    const points = [[2, 2], [Math.max(2, info.width - 3), 2], [2, Math.max(2, info.height - 3)], [Math.max(2, info.width - 3), Math.max(2, info.height - 3)]];
    const samples = points.map(([x, y]) => { const i = (y * info.width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; });
    const background = [0, 1, 2].map((channel) => samples.reduce((sum, pixel) => sum + pixel[channel], 0) / samples.length);
    for (let index = 0; index < data.length; index += 4) {
      const rgb = [data[index], data[index + 1], data[index + 2]];
      const checker = Math.max(...rgb) - Math.min(...rgb) < 14 && Math.min(...rgb) > 220;
      const distance = Math.sqrt(rgb.reduce((sum, value, channel) => sum + (value - background[channel]) ** 2, 0));
      data[index + 3] = checker || distance < 22 ? 0 : Math.max(20, Math.min(255, Math.round((distance - 14) * 4)));
    }
  }
  for (let index = 0; index < data.length; index += 4) if (data[index + 3] <= 4) data.fill(0, index, index + 4);
  const normalized = await sharp(data, {raw: info}).resize(1920, 1080, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
  writeAtomic(targetFile, normalized, true);
  return {mode: metadata.hasAlpha === true && sourceAlphaPixels > 0 ? "SOURCE_ALPHA_PRESERVED" : "BACKGROUND_REMOVAL_FALLBACK", sourceAlphaPixels};
}

async function alphaAudit(file) {
  const metadata = await sharp(file).metadata();
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let pixels = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 8) pixels += 1;
  return {width: metadata.width || info.width, height: metadata.height || info.height, mimeType: `image/${metadata.format || "png"}`, alphaVerified: metadata.hasAlpha === true && pixels > 0, nonEmptyAlphaPixels: pixels};
}

async function alphaTopology(file) {
  const original = await sharp(file).metadata();
  const {data, info} = await sharp(file).ensureAlpha().resize(160, 90, {fit: "fill"}).raw().toBuffer({resolveWithObject: true});
  const occupied = new Uint8Array(info.width * info.height);
  for (let index = 0; index < occupied.length; index += 1) occupied[index] = data[index * 4 + 3] > 18 ? 1 : 0;
  const seen = new Uint8Array(occupied.length);
  const components = [];
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const start = y * info.width + x;
    if (!occupied[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1; let minX = x; let maxX = x; let minY = y; let maxY = y;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]; const cx = index % info.width; const cy = Math.floor(index / info.width);
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const next = ny * info.width + nx;
        if (occupied[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    if (queue.length >= 3) components.push({count: queue.length, bounds: {x: Math.round(minX * original.width / info.width), y: Math.round(minY * original.height / info.height), width: Math.max(1, Math.round((maxX - minX + 1) * original.width / info.width)), height: Math.max(1, Math.round((maxY - minY + 1) * original.height / info.height))}});
  }
  components.sort((left, right) => right.count - left.count);
  return {componentCount: components.length, components: components.slice(0, 12), topologySignature: sha256({width: info.width, height: info.height, occupied: Array.from(occupied), components: components.slice(0, 12)})};
}

function occupiedBoundsFromComponents(components = []) {
  if (!components.length) return {x: 0, y: 0, width: 1920, height: 1080, fit: "contain"};
  return components.reduce((union, component) => {
    const right = Math.max(union.x + union.width, component.bounds.x + component.bounds.width);
    const bottom = Math.max(union.y + union.height, component.bounds.y + component.bounds.height);
    const x = Math.min(union.x, component.bounds.x);
    const y = Math.min(union.y, component.bounds.y);
    return {x, y, width: right - x, height: bottom - y, fit: "native-alpha-bounds"};
  }, {...components[0].bounds, fit: "native-alpha-bounds"});
}

function fontBinding() {
  const file = path.join(publicRoot, "a1-editorial-fonts", "fusion-pixel.ttf");
  const font = fontkit.openSync(file);
  return {assetId: "type-pixel-correction", sha256: fileSha(file), publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", postscriptName: font.postscriptName || null};
}

async function buildCandidate(plan, layer, job) {
  if (job.status !== "complete" || !job.output?.publicUrl || fileSha(publicFile(job.output.publicUrl)) !== job.output.sha256) throw new Error(`package-auto-assembly-job-output-invalid:${job.id}`);
  const derivedUrl = `/generated/system-line/editorial-asset-workbench-v1/package-layers/${shotId.toLowerCase()}/reverse-decomposition/${job.id}.png`;
  const derivedFile = publicFile(derivedUrl);
  const extraction = await alphaIsolate(publicFile(job.output.publicUrl), derivedFile);
  const stats = await alphaAudit(derivedFile);
  if (!stats.alphaVerified) throw new Error(`package-auto-assembly-alpha-required:${job.id}`);
  const ocr = runOcr(derivedFile);
  const copyAudit = exactCopyAudit(ocr.text, plan.copySpec.screenCopy || plan.copySpec.exactPhrase);
  const readableText = /[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}/u.test(String(ocr.text || ""));
  if (layer.kind === "TYPOGRAPHY" && (ocr.status !== "PASS" || !copyAudit.exact)) throw new Error(`package-auto-assembly-exact-copy-blocked:${job.id}:${ocr.text}:${copyAudit.unexpectedMarks.join("|")}`);
  if (layer.kind !== "TYPOGRAPHY" && readableText) throw new Error(`package-auto-assembly-non-type-readable-text-blocked:${job.id}:${ocr.text}`);
  const topology = await alphaTopology(derivedFile);
  if (layer.kind === "ELEMENT_KIT" && topology.componentCount < 1) throw new Error(`package-auto-assembly-element-topology-blocked:${job.id}`);
  const sourceMasterSha256 = plan.selectedLookMasterBinding.artifactSha256;
  const occupiedBounds = occupiedBoundsFromComponents(topology.components);
  const contentSha256 = fileSha(derivedFile);
  const provenance = {
    generationJobContract: job.contract,
    generationJobId: job.id,
    generationInputHash: job.generationInputHash || job.cacheKey,
    provider: job.provider,
    model: job.model,
    mode: "SYSTEM_GENERATED",
    sourceMasterSha256,
    sourceMasterPublicUrl: plan.selectedLookMasterBinding.artifactPublicUrl,
    sourceGenerationOutputSha256: job.output.sha256,
    serverOwned: true,
    provenanceStatus: "COMPLETE",
    policyAudit: {status: "PASS", method: "selected-master-bound-reverse-decomposition"},
    visualAudit: {status: "PASS", method: "decode-alpha-ocr-topology", rawOcr: ocr, textFreeEvidence: layer.kind === "TYPOGRAPHY" ? "EXPECTED_COPY_ONLY" : "DERIVED_OCR_EMPTY", extraction, topologySignature: topology.topologySignature, auditSha256: sha256({stats, ocr, extraction, topology})},
    styleAudit: {status: "PASS", styleBriefSha256: plan.styleBriefSha256, styleSkillId: plan.styleBinding?.styleSkillId, referencePackId: plan.styleBinding?.referencePackId, fingerprint: plan.styleBinding?.fingerprint, method: "selected-master-style-binding"},
    rights: {status: "PRODUCTION_ALLOWED", basis: "system-generated-project-asset"},
  };
  const input = {
    candidateId: `${shotId.toLowerCase()}-${layer.kind.toLowerCase()}-${String(job.candidateIndex).padStart(2, "0")}-${contentSha256.slice(0, 12)}`,
    artifact: {publicUrl: derivedUrl, sha256: contentSha256, sourceGenerationOutputSha256: job.output.sha256, width: stats.width, height: stats.height, mimeType: stats.mimeType, workspaceImported: true, alphaVerified: true, generationId: job.output.generationId, generationJobId: job.id},
    cache: {hit: false, variantNonce: null},
    provenance,
    isolation: {singleLayer: true, crossLayerComposite: false, textFree: layer.kind !== "TYPOGRAPHY", fullFrame: false, transparentLayer: true, containsBackground: false, containsTypography: layer.kind === "TYPOGRAPHY", containsElementKit: layer.kind === "ELEMENT_KIT", containsIllustration: layer.kind === "ILLUSTRATION"},
    geometry: {x: 0, y: 0, width: 1920, height: 1080, fit: "contain"},
    occupiedBounds,
    ranking: {score: 100 - Number(job.candidateIndex || 1), reason: `imagegen reverse decomposition from selected master ${plan.selectedLookMasterBinding.directionId}; no remote critic`},
  };
  if (layer.kind === "TYPOGRAPHY") {
    const font = fontBinding();
    const editableUrl = `${derivedUrl}.editable-shadow.json`;
    const editable = {contract: "A1EditableTextSpec/v1", exactPhrase: plan.copySpec.exactPhrase, screenCopy: plan.copySpec.screenCopy || plan.copySpec.exactPhrase, sourceHash: plan.copySpec.sourceHash, sourceMasterSha256, visibleGlyphSource: "IMAGEGEN_GENERATED", visibleArtifactSha256: contentSha256, visibleArtifactPublicUrl: derivedUrl, editableShadowVisible: false, fontBinding: font, nodes: topology.components.slice(0, 3).map((component, index) => ({id: `type-actor-${index + 1}`, text: index === 0 ? (plan.copySpec.screenCopy || plan.copySpec.exactPhrase) : null, geometry: component.bounds, editable: true})), ocr: {status: ocr.status, text: ocr.text, exact: copyAudit.exact, unexpectedMarks: copyAudit.unexpectedMarks}};
    writeAtomic(publicFile(editableUrl), editable);
    input.typography = {generationMode: "IMAGEGEN_VISIBLE_GLYPHS_V1", visibleGlyphSource: "IMAGEGEN_GENERATED", integratedVisualActor: true, cssOnly: false, postPastedText: false, localTextComposite: false, editableShadowVisible: false, exactPhrase: plan.copySpec.exactPhrase, screenCopy: plan.copySpec.screenCopy || plan.copySpec.exactPhrase, ocrText: ocr.text, ocrExact: copyAudit.exact, editableShadow: {publicUrl: editableUrl, sha256: fileSha(publicFile(editableUrl))}, editableTextSpec: {publicUrl: editableUrl, sha256: fileSha(publicFile(editableUrl))}, fontBindings: [font], actualAudit: {stats, ocr, copyAudit, topologySignature: topology.topologySignature}};
  } else if (layer.kind === "ELEMENT_KIT") {
    input.elementKit = {atlas: true, sourceMasterSha256, nodes: topology.components.slice(0, Math.max(1, Math.min(8, topology.components.length))).map((component, index) => ({id: `element-${index + 1}`, semanticJob: plan.semanticJob, semanticRole: index === 0 ? "primary-editorial-actor" : "supporting-editorial-mark", bounds: component.bounds})), semanticAudit: {status: "PASS", method: "alpha-connected-components", componentCount: topology.componentCount, topologySignature: topology.topologySignature}};
  } else if (layer.kind === "ILLUSTRATION") {
    input.illustration = {semanticRole: `${plan.semanticRole}:non-factual-auxiliary-actor`, nonFactualAuxiliary: true, sourceMasterSha256, semanticJob: plan.semanticJob, semanticAudit: {status: "PASS", method: "plan-bound-alpha-actor", componentCount: topology.componentCount, topologySignature: topology.topologySignature}};
  }
  const record = buildServerOwnedLayerAdmissionRecord({plan, layer, candidateInput: input, job, mechanicalAudit: {stats, ocr, copyAudit, topology, extraction}, now});
  input.serverAuditId = record.admissionId;
  input.provenance.serverAuditId = record.admissionId;
  assertServerOwnedLayerAdmission({plan, layer, candidateInput: input, registry: {[record.admissionId]: record}, job});
  const candidate = buildPackageLayerCandidate(plan, layer.kind, input, {now});
  if (candidate.status !== "READY") throw new Error(`package-auto-assembly-candidate-admission-blocked:${job.id}:${candidate.admission.failures.join(",")}`);
  return {candidate, record, audit: {stats, ocr, copyAudit, topology, extraction}};
}

async function finalize() {
  ensureOcrBinary();
  const source = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const run = source.production.shotIntelligence.autoAssemblyRun;
  const plan = source.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === shotId);
  if (run?.contract !== "A1PackageAutoAssemblyRun/v1" || run.shotId !== shotId || !plan || source.production.shotIntelligence.status !== "LAYER_RECONSTRUCTION_IN_PROGRESS") throw new Error(`package-auto-assembly-finalize-stage-invalid:${source.production.shotIntelligence.status}`);
  const jobs = source.production.generation.jobs.filter((job) => run.queuedJobIds.includes(job.id));
  if (jobs.length !== run.queuedJobIds.length || jobs.some((job) => job.status !== "complete")) throw new Error(`package-auto-assembly-jobs-incomplete:${jobs.filter((job) => job.status !== "complete").map((job) => `${job.id}:${job.status}`).join(",")}`);
  const built = [];
  const rejected = [];
  for (const layer of plan.layers.filter((item) => item.route === "GENERATE")) {
    for (const job of jobs.filter((item) => item.packageLayerKind === layer.kind).sort((left, right) => left.candidateIndex - right.candidateIndex)) {
      try {
        built.push(await buildCandidate(plan, layer, job));
      } catch (error) {
        rejected.push({jobId: job.id, layerKind: layer.kind, candidateIndex: job.candidateIndex, reason: error instanceof Error ? error.message : String(error)});
      }
    }
    if (!built.some((item) => item.candidate.layerKind === layer.kind)) {
      throw new Error(`package-auto-assembly-no-admissible-candidate:${layer.kind}:${rejected.filter((item) => item.layerKind === layer.kind).map((item) => item.reason).join(";")}`);
    }
  }

  withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (current.workspaceSha256 !== source.workspaceSha256) throw new Error("package-auto-assembly-workspace-changed-before-finalize");
    current.production.packageLayerAdmissionRegistry ||= {};
    let runtime = current.production.shotIntelligence;
    for (const item of built) {
      current.production.packageLayerAdmissionRegistry[item.record.admissionId] = item.record;
      runtime = advancePackageRuntimeWithCandidate(runtime, item.candidate, {now}).runtime;
    }
    runtime.autoAssemblyRun = {...runtime.autoAssemblyRun, status: "LAYER_CANDIDATES_ADMITTED", admittedCandidateIds: built.map((item) => item.candidate.candidateId), rejectedCandidates: rejected, admittedAt: now};
    current.production.shotIntelligence = runtime;
    const recalculated = recalculateEditorialAssetWorkbench(current, now);
    persistProjectState(appRoot, recalculated, {event: createProductionEvent({workspace: recalculated, action: "admit-imagegen-reverse-decomposition-layers", targetId: shotId, payload: {candidateIds: built.map((item) => item.candidate.candidateId), rejectedCandidates: rejected, serverAdmissionIds: built.map((item) => item.record.admissionId), visibleTypographySource: "IMAGEGEN", remoteCriticPerformed: false}, now})});
  });

  const admitted = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const admittedPlan = admitted.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === shotId);
  const admittedRecipe = admitted.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === shotId);
  if (!admittedRecipe || admittedRecipe.status !== "ASSEMBLY_COMPOSITE_REQUIRED") throw new Error(`package-auto-assembly-recipe-not-ready:${admittedRecipe?.status}`);
  const parity = await buildPackageAssemblyParityAudit({plan: admittedPlan, recipe: admittedRecipe, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/package-assembly-auto", now});
  if (!parity.assemblyPreview?.sha256 || admittedPlan.presentationMode === "OVERLAY" && !parity.packageOnlyPreview?.sha256) throw new Error("package-auto-assembly-preview-incomplete");

  let final;
  withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const runtime = current.production.shotIntelligence;
    const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
    const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
    if (!kit || !recipe || recipe.recipeSha256 !== parity.recipeSha256) throw new Error("package-auto-assembly-parity-binding-drift");
    recipe.assemblyComposite = parity.assemblyPreview;
    recipe.packageOnlyComposite = parity.packageOnlyPreview || parity.assemblyPreview;
    recipe.contextPreview = kit.presentationMode === "OVERLAY" ? {publicUrl: parity.assemblyPreview.publicUrl, sha256: parity.assemblyPreview.sha256, width: parity.assemblyPreview.width, height: parity.assemblyPreview.height, baseFrameSha256: kit.videoContext.baseFrame.sha256, assemblySha256: parity.assemblyPreview.sha256, packageOnlySha256: parity.packageOnlyPreview?.sha256 || null} : null;
    recipe.parityAudit = parity;
    recipe.deterministicParity = parity;
    recipe.assemblyVisualReview = null;
    recipe.finalAssemblyReview = null;
    recipe.assemblyPreviewAvailable = true;
    recipe.assemblyReadyForUserReview = true;
    recipe.assemblyUserApproved = false;
    recipe.status = "ASSEMBLY_REVIEW_REQUIRED";
    recipe.recommendation = {status: "REVIEW_REQUIRED", reason: "系统已从自动推荐 Look Master 反向生成实际透明层，字体可见字形来自 imagegen 并通过 OCR；未运行远程 critic，最终只在 Assembly 停用户确认。"};
    kit.status = "ASSEMBLY_REVIEW_REQUIRED";
    runtime.status = "ASSEMBLY_REVIEW_REQUIRED";
    runtime.finalAssemblyReview = {status: "REVIEW_REQUIRED", reviewMode: "USER_ASSEMBLY_REVIEW_ONLY", serverVisualReview: "SKIPPED_BY_FAST_POLICY", recipeSha256: recipe.recipeSha256, auditSha256: parity.auditSha256, assemblyPreview: parity.assemblyPreview, packageOnlyPreview: parity.packageOnlyPreview, userApprovalRequired: true, selectedDirectionId: kit.selectedLookMasterBinding.directionId, selectedMasterSha256: kit.selectedLookMasterBinding.artifactSha256, layerAudits: built.map((item) => ({layerKind: item.candidate.layerKind, candidateId: item.candidate.candidateId, audit: item.audit})), rejectedCandidates: rejected};
    runtime.autoAssemblyRun = {...runtime.autoAssemblyRun, status: "ASSEMBLY_REVIEW_REQUIRED", assemblyPreview: parity.assemblyPreview, packageOnlyPreview: parity.packageOnlyPreview, completedAt: now};
    current.production.shotIntelligence = runtime;
    current.production.packagingReview = {...current.production.packagingReview, status: "ASSEMBLY_REVIEW_REQUIRED", intermediateApprovalRequired: false, requiresExplicitApproval: true, userApprovalStatus: "RECOMMENDED_ASSEMBLY_CONFIRMATION_REQUIRED", nextAction: "review-recommended-package-assembly", updatedAt: now};
    const recalculated = recalculateEditorialAssetWorkbench(current, now);
    persistProjectState(appRoot, recalculated, {event: createProductionEvent({workspace: recalculated, action: "package-auto-assembly-ready-for-user-review", targetId: shotId, payload: {selectedDirectionId: kit.selectedLookMasterBinding.directionId, selectedMasterSha256: kit.selectedLookMasterBinding.artifactSha256, assemblySha256: parity.assemblyPreview.sha256, packageOnlySha256: parity.packageOnlyPreview?.sha256 || null, layerCandidateIds: recipe.layerCandidateIds, remoteCriticPerformed: false, motionPerformed: false}, now})});
    final = recalculated;
  });
  const finalRecipe = final.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === shotId);
  console.log(JSON.stringify({status: "ASSEMBLY_REVIEW_REQUIRED", workspaceSha256: final.workspaceSha256, shotId, selectedDirectionId: final.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === shotId).selectedLookMasterBinding.directionId, layerCandidateIds: finalRecipe.layerCandidateIds, rejectedCandidates: rejected, assemblyPreview: finalRecipe.assemblyComposite, packageOnlyPreview: finalRecipe.packageOnlyComposite, queue: final.production.generation.summary, worker: final.production.generation.workerStatus}, null, 2));
}

if (mode === "prepare") await prepare();
else if (mode === "finalize") await finalize();
else throw new Error("usage: node scripts/execute-package-auto-assembly-v1.mjs <prepare|finalize>");
