#!/usr/bin/env node

import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {auditImageRegionPixelMetrics, auditSubjectOcclusionGeometry, auditTypographyVisualRolePixels} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {auditCanonicalVisibleCopy, auditFullscreenPixelRelation, buildCanonicalTextPixelGeometry, normalizeCanonicalVisibleText} from "../apps/studio-next/src/lib/a1-canonical-title-repair-pixel-gate-v1.mjs";
import {visibleCopyForShot} from "../apps/studio-next/src/lib/a1-canonical-web-generation-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {applyGenerationEventToManifest, updateRepairManifestSidecar} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const manifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const ocrSource = path.join(root, "scripts/run-local-vision-ocr-v1.swift");
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const humanPresenceSource = path.join(root, "scripts/run-local-vision-human-presence-v1.swift");
const humanPresenceBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-human-presence-v1");
const requestedTargetShotIds = process.argv.find((value) => value.startsWith("--shotIds="))?.slice("--shotIds=".length)?.split(",").map((value) => value.trim()).filter(Boolean) || null;
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const LEGACY_WEB_ARTIFACTS = new Set([
  "f5954f6c107d8bd9e5e45ff8676ce74d49ab79ee16c56bf022375ff13dc91e56",
  "349b8cbe9d6271a7591312e11086430f737b0814a79d22f56fe1b2ed5844da6b",
  "0859bca4469e4a0c560318aa549ab6bf20b626ed1d87f347e6febceb7ce81137",
]);
const publicFile = (publicUrl) => {
  const file = path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
  if (!String(publicUrl || "").startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("canonical-title-repair-public-path-invalid");
  return file;
};

function readOcr(file) {
  try {
    if (!fs.existsSync(ocrBinary) || fs.statSync(ocrBinary).mtimeMs < fs.statSync(ocrSource).mtimeMs) {
      fs.mkdirSync(path.dirname(ocrBinary), {recursive: true});
      execFileSync("swiftc", [ocrSource, "-o", ocrBinary], {encoding: "utf8", maxBuffer: 2_000_000});
    }
    const parsed = JSON.parse(execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000}).trim().split("\n").at(-1));
    return {status: parsed.status || "PASS", text: parsed.text || "", segments: parsed.segments || [], segmentDetails: parsed.segmentDetails || [], observationCount: parsed.observationCount || 0};
  } catch (error) {
    return {status: "FAILED", text: "", segments: [], segmentDetails: [], observationCount: 0, error: error instanceof Error ? error.message : String(error)};
  }
}

function readHumanDetection(file) {
  try {
    if (!fs.existsSync(humanPresenceBinary)) {
      fs.mkdirSync(path.dirname(humanPresenceBinary), {recursive: true});
      execFileSync("swiftc", [humanPresenceSource, "-o", humanPresenceBinary], {encoding: "utf8", maxBuffer: 2_000_000});
    }
    const parsed = JSON.parse(execFileSync(humanPresenceBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000}).trim().split("\n").at(-1));
    return parsed;
  } catch (error) {
    return {status: "BLOCKED", reason: error instanceof Error ? error.message : String(error)};
  }
}

function visibleCopyPhrases(plan) {
  const visibleCopy = visibleCopyForShot(plan?.shotId, plan)?.visibleCopy || "";
  return String(visibleCopy)
    .split(/\s*\/\s*/u)
    .map((phrase) => phrase.trim())
    .filter(Boolean);
}

function countRuns(values, gap = 3) {
  const runs = [];
  let start = null;
  let last = null;
  for (const value of values) {
    if (start == null) start = value;
    else if (value - last > gap + 1) runs.push({start, end: last});
    last = value;
  }
  if (start != null) runs.push({start, end: last});
  return runs;
}

async function segmentPixels(file) {
  const metadata = await sharp(file).metadata();
  const original = await sharp(file).ensureAlpha().resize(640, 360, {fit: "fill"}).raw().toBuffer({resolveWithObject: true});
  const {width, height} = original.info;
  const rgba = original.data;
  const opaque = metadata.hasAlpha !== true;
  let warmYellowPixels = 0;
  let sepiaPixels = 0;
  const quantizedColors = new Set();
  const corners = [];
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) for (const [cx, cy] of [[x, y], [width - x - 1, y], [x, height - y - 1], [width - x - 1, height - y - 1]]) {
    const index = (cy * width + cx) * 4;
    corners.push([rgba[index], rgba[index + 1], rgba[index + 2]]);
  }
  const background = corners.reduce((sum, pixel) => sum.map((value, index) => value + pixel[index]), [0, 0, 0]).map((value) => value / Math.max(1, corners.length));
  const mask = new Uint8Array(width * height);
  let visible = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const alpha = rgba[index + 3];
    const red = rgba[index];
    const green = rgba[index + 1];
    const blue = rgba[index + 2];
    quantizedColors.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
    if (red > 135 && green > 105 && blue < Math.min(150, red * 0.78) && red - blue > 35) warmYellowPixels += 1;
    if (red > blue * 1.25 && green > blue * 1.08 && red - green < 70) sepiaPixels += 1;
    const distance = Math.hypot(rgba[index] - background[0], rgba[index + 1] - background[1], rgba[index + 2] - background[2]);
    const active = opaque ? distance > 60 : alpha >= 16;
    if (!active) continue;
    mask[y * width + x] = 1;
    visible += 1;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  const rowValues = [];
  const rowThreshold = Math.max(4, Math.round(width * 0.003));
  for (let y = 0; y < height; y += 1) {
    let occupied = 0;
    for (let x = 0; x < width; x += 1) occupied += mask[y * width + x];
    if (occupied >= rowThreshold) rowValues.push(y);
  }
  const rowRuns = countRuns(rowValues);
  const bbox = right >= 0 ? {x: Number((left / width).toFixed(4)), y: Number((top / height).toFixed(4)), width: Number(((right - left + 1) / width).toFixed(4)), height: Number(((bottom - top + 1) / height).toFixed(4))} : null;
  const boundary = bbox ? {
    left: Math.round(bbox.x * width),
    top: Math.round(bbox.y * height),
    right: Math.min(width, Math.round((bbox.x + bbox.width) * width)),
    bottom: Math.min(height, Math.round((bbox.y + bbox.height) * height)),
  } : null;
  let boundaryOccupied = 0;
  let boundaryTotal = 0;
  if (boundary) {
    const thickness = Math.max(2, Math.round(Math.min(boundary.right - boundary.left, boundary.bottom - boundary.top) * 0.03));
    for (let y = boundary.top; y < boundary.bottom; y += 1) for (let x = boundary.left; x < boundary.right; x += 1) {
      if (x >= boundary.left + thickness && x < boundary.right - thickness && y >= boundary.top + thickness && y < boundary.bottom - thickness) continue;
      boundaryTotal += 1;
      boundaryOccupied += mask[y * width + x];
    }
  }
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    hasAlpha: metadata.hasAlpha === true,
    transparentFraction: metadata.hasAlpha === true ? Number((1 - visible / (width * height)).toFixed(4)) : 0,
    visiblePixelRatio: Number((visible / (width * height)).toFixed(4)),
    titleBbox: bbox,
    titleBlockAreaRatio: bbox ? Number((bbox.width * bbox.height).toFixed(4)) : 0,
    foregroundSegmentation: opaque ? "corner-background-distance-v1" : "alpha-visible-pixel-v1",
    foregroundThreshold: opaque ? 60 : 16,
    rowBandCount: rowRuns.length,
    rowBands: rowRuns.map((run) => ({y: Number((run.start / height).toFixed(4)), heightPx: run.end - run.start + 1})),
    genericUiChromeScore: boundaryTotal ? Number((boundaryOccupied / boundaryTotal).toFixed(4)) : 0,
    warmYellowFraction: Number((warmYellowPixels / (width * height)).toFixed(4)),
    sepiaFraction: Number((sepiaPixels / (width * height)).toFixed(4)),
    quantizedColorCount: quantizedColors.size,
    pixelMaterialScore: Number((Math.min(1, quantizedColors.size / 96)).toFixed(4)),
  };
}

async function compositePreview(plan, raw, candidateFile) {
  const outputPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/look-master-audits/canonical-title-repair/${plan.shotId.toLowerCase()}-${raw.artifact.sha256.slice(0, 16)}-base-composite.png`;
  const outputFile = publicFile(outputPublicUrl);
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  if (plan.assemblyMode === "OVERLAY" && plan.videoContext?.baseFrame?.publicUrl) {
    const baseFile = publicFile(plan.videoContext.baseFrame.publicUrl);
    const base = sharp(baseFile).resize(plan.videoContext.baseFrame.width, plan.videoContext.baseFrame.height, {fit: "cover"});
    const overlay = await sharp(candidateFile).resize(plan.videoContext.baseFrame.width, plan.videoContext.baseFrame.height, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
    await base.composite([{input: overlay, blend: "over"}]).png().toFile(outputFile);
  } else {
    fs.copyFileSync(candidateFile, outputFile);
  }
  const bytes = fs.readFileSync(outputFile);
  return {kind: plan.assemblyMode === "OVERLAY" ? "ACTUAL_BASE_FRAME_COMPOSITE" : "ACTUAL_FULL_FRAME_TAKEOVER", publicUrl: outputPublicUrl, sha256: sha256(bytes), width: plan.videoContext?.baseFrame?.width || 1672, height: plan.videoContext?.baseFrame?.height || 941};
}

async function auditShot(plan, raw, previousAudits = []) {
  const candidateFile = publicFile(raw.artifact.publicUrl);
  const legacyWebArtifact = LEGACY_WEB_ARTIFACTS.has(raw.artifact.sha256);
  const metrics = await segmentPixels(candidateFile);
  const ocr = readOcr(candidateFile);
  const protectedPhrases = plan.protectedPhrases || [];
  const visiblePhrases = visibleCopyPhrases(plan);
  const normalizedOcr = normalizeCanonicalVisibleText(ocr.text);
  // Spoken source and visible Look Master actor are different contracts. A
  // contrast shot may use short visible phrases while protectedPhrases retain
  // the full spoken claims for semantic provenance.
  const copyAudit = auditCanonicalVisibleCopy({expectedPhrases: visiblePhrases.length ? visiblePhrases : protectedPhrases, ocrText: ocr.text});
  const exactCopy = copyAudit.exact;
  const fullSpokenCopyDetected = Boolean(plan.exactCopy?.text && normalizeCanonicalVisibleText(plan.exactCopy.text).length > normalizeCanonicalVisibleText(protectedPhrases.join(" ")).length && normalizedOcr.includes(normalizeCanonicalVisibleText(plan.exactCopy.text)));
  const role = plan.typographyVisualRole || "NONE";
  const textGeometry = buildCanonicalTextPixelGeometry({segmentDetails: ocr.segmentDetails, frameWidth: metrics.width, frameHeight: metrics.height});
  const titleRegionPixels = textGeometry.titleBbox ? await auditImageRegionPixelMetrics(candidateFile, textGeometry.titleBbox) : null;
  const textBlockAreaRatio = textGeometry.titleBbox ? Number((textGeometry.titleBbox.width * textGeometry.titleBbox.height).toFixed(4)) : 0;
  const typographyVisual = {
    ...textGeometry,
    titleRegionPixels,
    headlineSupportHeightRatio: null,
    supportActorPresent: false,
    primaryVisualLayer: textBlockAreaRatio >= (role === "HERO_TAKEOVER" ? 0.02 : 0.012) ? "PRIMARY" : "SECONDARY",
    lineBudgetScope: protectedPhrases.length > 1 && role === "PRESENTER_HEADLINE" ? "per-contrast-cluster" : "single-title-actor",
    threeSecondReadable: exactCopy && ocr.status === "PASS",
  };
  const typographyGate = auditTypographyVisualRolePixels({plan, metrics, typographyVisual});
  const geometry = plan.assemblyMode === "OVERLAY"
    ? await auditSubjectOcclusionGeometry({candidateFile, subjectBounds: plan.videoContext.subjectBounds, faceBounds: plan.videoContext.faceBounds, eyesBounds: plan.videoContext.eyesBounds, availableRegions: plan.videoContext.availableRegions || [], targetWidth: plan.videoContext.baseFrame.width, targetHeight: plan.videoContext.baseFrame.height})
    : {status: "PASS", subjectOcclusion: {status: "PASS", face: {status: "NOT_REQUIRED"}, eyes: {status: "NOT_REQUIRED"}, body: {status: "NOT_REQUIRED"}, availableRegionOverflow: {status: "PASS", reason: "full-frame-takeover"}}};
  const alphaPass = plan.assemblyMode !== "OVERLAY" || (metrics.hasAlpha && metrics.transparentFraction >= 0.2);
  const genericTemplateDetected = plan.assemblyMode === "OVERLAY" && metrics.visiblePixelRatio < 0.2 && metrics.genericUiChromeScore > 0.45;
  const visualFingerprint = [plan.assemblyMode, metrics.titleBbox?.x, metrics.titleBbox?.y, metrics.titleBbox?.width, metrics.titleBbox?.height, metrics.titleBlockAreaRatio, metrics.rowBandCount].join("|");
  const repeatedTemplateDetected = previousAudits.some((item) => item.visualFingerprint === visualFingerprint);
  const warmPaletteDrift = metrics.warmYellowFraction >= 0.3 || metrics.sepiaFraction >= 0.35;
  const pixelPrimitiveVisible = raw.actualPixelAssessment?.pixelPrimitiveVisible === true || metrics.quantizedColorCount <= 128;
  const humanDetection = plan.assemblyMode === "FULLSCREEN" ? readHumanDetection(candidateFile) : null;
  const fullscreenPixelRelation = auditFullscreenPixelRelation({assemblyMode: plan.assemblyMode, width: metrics.width, height: metrics.height, humanDetection});
  const fullscreenRelationshipValid = fullscreenPixelRelation.valid;
  const overlayRelationshipValid = plan.assemblyMode !== "OVERLAY" || (metrics.hasAlpha && geometry.status === "PASS");
  const composite = await compositePreview(plan, raw, candidateFile);
  const failures = [
    !alphaPass ? "overlay-alpha-contract-failed" : null,
    !exactCopy ? "ocr-exact-copy-mismatch" : null,
    typographyGate.status !== "PASS" ? `typography-visual-role:${typographyGate.failedChecks.join(",")}` : null,
    geometry.status !== "PASS" ? "subject-face-eyes-body-or-available-region-geometry-failed" : null,
    genericTemplateDetected ? "generic-card-window-hud-detected" : null,
    warmPaletteDrift ? "aesthetic-warm-yellow-cream-sepia-drift" : null,
    fullSpokenCopyDetected ? "full-spoken-paragraph-visible" : null,
    !pixelPrimitiveVisible ? "aesthetic-pixel-primitive-not-visible" : null,
    repeatedTemplateDetected ? "same-template-across-shots" : null,
    !fullscreenRelationshipValid ? "fullscreen-presenter-relation-unverified-or-invalid" : null,
    !overlayRelationshipValid ? "overlay-fullframe-relation-invalid" : null,
    legacyWebArtifact ? "historical-web-queue-artifact-rejected" : null,
  ].filter(Boolean);
  const status = failures.length ? "FAIL" : "PASS";
  const withoutHash = {
    contract: "A1CanonicalTitleRepairActualPixelAudit/v2",
    version: 2,
    shotId: plan.shotId,
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    artifactSha256: raw.artifact.sha256,
    artifactPublicUrl: raw.artifact.publicUrl,
    actualPixelMetrics: {...metrics, foregroundBbox: metrics.titleBbox, foregroundBboxAreaRatio: metrics.titleBlockAreaRatio, titleBbox: typographyVisual.titleBbox, titleBlockAreaRatio: textBlockAreaRatio, headlineSupportHeightRatio: null, primaryVisualLayer: typographyVisual.primaryVisualLayer, lineCount: typographyVisual.lineCount, threeSecondReadable: typographyVisual.threeSecondReadable, visibleCopyPhrases: visiblePhrases, copyAuthority: "canonical-visible-copy-actor-v2-exact-total-ocr", visualFingerprint, fullSpokenCopyDetected, repeatedTemplateDetected, pixelPrimitiveVisible, fullscreenRelationshipValid, fullscreenPixelRelation, humanDetection, overlayRelationshipValid},
    typographyVisual,
    ocr: {status: ocr.status, text: ocr.text, segments: ocr.segments, segmentDetails: ocr.segmentDetails, observationCount: ocr.observationCount, exactCopy, copyAudit, protectedPhrases},
    footageCompatibility: {status: geometry.status === "PASS" && alphaPass ? "PASS" : "FAIL", subjectOcclusion: geometry, baseFrameSha256: plan.videoContext?.baseFrame?.sha256 || null},
    compositePreview: composite,
    semanticThreeSecond: {status: typographyVisual.threeSecondReadable ? "PASS" : "FAIL"},
    dominantActor: {status: typographyVisual.primaryVisualLayer === "PRIMARY" || typographyVisual.primaryVisualLayer === "CO_PRIMARY" ? "PASS" : "FAIL", role},
    genericCardWindowHud: {status: genericTemplateDetected ? "FAIL" : "PASS", score: metrics.genericUiChromeScore, method: "visible-boundary-occupancy-v1"},
    referenceTraitVisibility: {status: pixelPrimitiveVisible ? "PASS" : "FAIL", source: "actual-pixel-contract-bound-style-brief", method: "actual-pixel-quantized-material-evidence-v1"},
    aestheticHardGate: {status: failures.some((failure) => failure.startsWith("aesthetic-") || failure.includes("same-template") || failure.includes("full-spoken") || failure.includes("fullscreen") || failure.includes("overlay-fullframe") || failure.includes("historical-web-queue")) ? "FAIL" : "PASS", warmPaletteDrift, fullSpokenCopyDetected, repeatedTemplateDetected, pixelPrimitiveVisible, fullscreenRelationshipValid, fullscreenPixelRelation, overlayRelationshipValid, legacyWebArtifact},
    policyAudit: {status: failures.length ? "FAIL" : "PASS", noLocalCssSecondDesign: true, noDebugFiller: !genericTemplateDetected},
    styleAudit: {status: "PASS", styleBriefSha256: plan.styleBriefSha256},
    admissionAllowed: status === "PASS",
    failures,
    generatedAt: now,
  };
  const assessmentWithoutHash = {contract: "A1CanonicalTitleRepairActualPixelAssessment/v1", version: 1, status, shotId: plan.shotId, artifactSha256: raw.artifact.sha256, planSha256: plan.planSha256, actualPixelAuditContract: withoutHash.contract, auditSha256: sha256(withoutHash), failures, evaluatedAt: now};
  const serverVisualAssessment = {...assessmentWithoutHash, assessmentSha256: sha256({...assessmentWithoutHash, assessmentSha256: undefined})};
  const audit = {...withoutHash, serverGenerated: true, serverVisualAssessmentSha256: serverVisualAssessment.assessmentSha256, totalScore: status === "PASS" ? 100 : 0};
  audit.auditSha256 = sha256({...audit, auditSha256: undefined});
  const semantic = {
    contract: "A1CanonicalTitleRepairActualPixelSemanticGate/v1",
    version: 1,
    status,
    recommendationEligible: status === "PASS",
    artifact: {sha256: raw.artifact.sha256, publicUrl: raw.artifact.publicUrl},
    artifactSha256: raw.artifact.sha256,
    briefSha256: plan.semanticDesignBriefSha256,
    auditSha256: sha256({contract: "A1CanonicalTitleRepairActualPixelSemanticGate/v1", shotId: plan.shotId, artifactSha256: raw.artifact.sha256, pixelAuditSha256: audit.auditSha256, exactCopy, geometryStatus: geometry.status, generatedAt: now}),
    pixelAuditSha256: audit.auditSha256,
    ocr: audit.ocr,
    actualPixelEvidence: audit.actualPixelMetrics,
    findings: failures,
    generatedAt: now,
  };
  return {shotId: plan.shotId, status, audit, semantic, serverVisualAssessment, auditSha256: audit.auditSha256, artifactSha256: raw.artifact.sha256, primitiveId: raw.canonicalPrimitiveId || null, failures, ocr, geometry, metrics, visualFingerprint};
}

const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const runtime = before.production.shotIntelligence;
const manifest = runtime.canonicalDirectorTargetRepairManifest;
// The repair manifest is the authority for the current executable scope.  A
// stale hard-coded fallback could pull blocked historical shots into a fresh
// pixel audit after reconciliation.
const targetShotIds = requestedTargetShotIds || manifest?.generationEligibleShotIds || [];
const targetSet = new Set(targetShotIds);
const sidecar = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0) throw new Error("canonical-title-repair-pixel-audit-requires-idle-queue");
if (runtime.currentAssembly?.length) throw new Error("canonical-title-repair-pixel-audit-assembly-locked");
if (runtime.canonicalDirectorAuthority?.status !== "PASS" || !targetShotIds.every((shotId) => (manifest?.generationEligibleShotIds || []).includes(shotId)) || manifest?.boardRebuilt !== false) throw new Error("canonical-title-repair-pixel-audit-authority-invalid");
const audits = [];
for (const shotId of targetShotIds) {
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const sidecarEntry = (sidecar.entries || []).find((item) => item.shotId === shotId);
  const candidateSha = sidecarEntry?.candidateSha || null;
  const raw = (runtime.lookMasterRawReferences || [])
    .filter((item) => item.shotId === shotId && item.planSha256 === plan?.planSha256 && item.artifact?.sha256)
    .filter((item) => candidateSha ? item.artifact.sha256 === candidateSha : item.current !== false)
    .sort((left, right) => String(left.createdAt || left.importedAt || "").localeCompare(String(right.createdAt || right.importedAt || ""))).at(-1);
  if (!plan || !raw) throw new Error(`canonical-title-repair-pixel-audit-input-missing:${shotId}`);
  audits.push(await auditShot(plan, raw, audits));
}

const committed = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== before.workspaceSha256) throw new Error("canonical-title-repair-pixel-audit-workspace-cas-failed");
  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  for (const result of audits) {
    // The same deterministic PNG may legitimately exist under multiple plan
    // revisions.  Bind the audit back to the exact plan hash used by the
    // audited input; matching only shot + artifact can write PASS evidence
    // onto an older raw reference and leave the current plan unbound.
    const raw = nextRuntime.lookMasterRawReferences.find((item) => item.shotId === result.shotId
      && item.planSha256 === result.audit.planSha256
      && item.artifact?.sha256 === result.artifactSha256);
    if (!raw) throw new Error(`canonical-title-repair-pixel-audit-raw-cas-failed:${result.shotId}`);
    for (const historical of nextRuntime.lookMasterRawReferences.filter((item) => item.shotId === result.shotId && item.planSha256 === raw.planSha256 && item.artifact?.sha256 !== result.artifactSha256)) {
      historical.current = false;
      historical.historyReadOnly = true;
      historical.selectionEligible = false;
      historical.recommendationEligible = false;
    }
    raw.pixelAudit = result.audit;
    raw.pixelAuditPublicUrl = result.audit.compositePreview.publicUrl.replace(/base-composite\.png$/u, `${result.audit.auditSha256}.json`);
    raw.semanticPixelAudit = result.semantic;
    raw.semanticPixelAuditSha256 = result.semantic.auditSha256;
    raw.semanticPixelAuditOcr = result.audit.ocr;
    raw.semanticPixelAuditFindings = result.failures;
    raw.serverVisualAssessment = result.serverVisualAssessment;
    raw.serverVisualAssessmentPublicUrl = raw.pixelAuditPublicUrl;
    raw.current = result.status === "PASS" && !LEGACY_WEB_ARTIFACTS.has(result.artifactSha256);
    raw.historyReadOnly = LEGACY_WEB_ARTIFACTS.has(result.artifactSha256);
    raw.recommendationEligible = result.status === "PASS";
    raw.selectionEligible = result.status === "PASS";
    raw.assemblyEligible = false;
    raw.reviewStatus = result.status === "PASS" ? "CANONICAL_TITLE_REPAIR_ACTUAL_PIXEL_PASS" : "CANONICAL_TITLE_REPAIR_ACTUAL_PIXEL_FAIL";
    raw.status = result.status === "PASS" ? "CANONICAL_TITLE_REPAIR_PIXEL_PASS" : "CANONICAL_TITLE_REPAIR_PIXEL_FAIL";
  }
  next.production.generation.workerStatus = "frozen";
  // A completed pixel-audit wave must not self-loop.  New generation requires
  // an explicit bounded dispatch after the failure evidence is reviewed.
  next.production.generation.automaticDispatchAllowed = false;
  next.production.shotIntelligence.canonicalTitleRepairActualPixelAudit = {
    contract: "A1CanonicalTitleRepairActualPixelAuditReport/v1",
    status: audits.every((item) => item.status === "PASS") ? "PASS" : "REPAIR_REQUIRED",
    authoritySha256: nextRuntime.canonicalDirectorAuthority.authoritySha256,
    manifestSha256: manifest.manifestSha256,
    sourceRevisionHash: manifest.sourceRevisionHash,
    targetShotIds,
    audits: audits.map((item) => ({shotId: item.shotId, status: item.status, artifactSha256: item.artifactSha256, auditSha256: item.auditSha256, failures: item.failures, titleBbox: item.audit.typographyVisual.titleBbox, titleBlockAreaRatio: item.audit.actualPixelMetrics.titleBlockAreaRatio, minGlyphHeightPx: item.audit.typographyVisual.minGlyphHeightPx, headlineSupportHeightRatio: item.audit.typographyVisual.headlineSupportHeightRatio, primaryVisualLayer: item.audit.typographyVisual.primaryVisualLayer, lineCount: item.audit.typographyVisual.lineCount, threeSecondReadable: item.audit.typographyVisual.threeSecondReadable, ocrText: item.audit.ocr.text, geometryStatus: item.geometry.status})),
    deltaAuditCount: audits.length,
    retryRequiredShotIds: audits.filter((item) => item.status === "FAIL").map((item) => item.shotId),
    boardRebuildCount: 0,
    generatedAt: now,
  };
  // Pixel audit is the end of a generation wave.  Do not leave the control
  // plane claiming GENERATING after the queue is idle; a failed audit returns
  // the bounded repair flow to an explicit pending gate for the next
  // deliberate dispatch, while a clean wave is marked audited but still
  // keeps the board/assembly frozen.
  const retryRequiredShotIds = audits.filter((item) => item.status === "FAIL").map((item) => item.shotId);
  const targetManifestBase = {
    ...(nextRuntime.canonicalDirectorTargetRepairManifest || {}),
    checkpoint: retryRequiredShotIds.length ? "CANONICAL_TITLE_REPAIR_PENDING" : "CANONICAL_TITLE_REPAIR_AUDITED",
    generationDispatched: false,
    dispatchedShotIds: [],
    boardRebuilt: false,
    assemblyStarted: false,
    retryRequiredShotIds,
  };
  nextRuntime.canonicalDirectorTargetRepairManifest = {
    ...targetManifestBase,
    manifestSha256: sha256({...targetManifestBase, manifestSha256: undefined}),
  };
  next.production.semanticAuthorityConvergence = {
    ...(next.production.semanticAuthorityConvergence || {}),
    checkpoint: nextRuntime.canonicalDirectorTargetRepairManifest.checkpoint,
    manifestSha256: nextRuntime.canonicalDirectorTargetRepairManifest.manifestSha256,
    generationDispatched: false,
    boardRebuilt: false,
  };
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "canonical-title-repair-actual-pixel-audit", targetId: targetShotIds.join(","), payload: {contract: "A1CanonicalTitleRepairActualPixelAudit/v1", passCount: audits.filter((item) => item.status === "PASS").length, failCount: audits.filter((item) => item.status === "FAIL").length, retryRequiredShotIds: audits.filter((item) => item.status === "FAIL").map((item) => item.shotId), boardRebuildCount: 0}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const passCount = audits.filter((item) => item.status === "PASS").length;
  const failCount = audits.filter((item) => item.status === "FAIL").length;
  const report = {contract: "A1CanonicalTitleRepairActualPixelAuditReport/v1", status: passCount > 0 && failCount === 0 ? "PASS" : "REPAIR_REQUIRED", workspaceSha256Before: current.workspaceSha256, targetShotIds, audits: audits.map((item) => ({shotId: item.shotId, status: item.status, artifactSha256: item.artifactSha256, auditSha256: item.auditSha256, failures: item.failures, titleBbox: item.audit.typographyVisual.titleBbox, titleBlockAreaRatio: item.audit.actualPixelMetrics.titleBlockAreaRatio, minGlyphHeightPx: item.audit.typographyVisual.minGlyphHeightPx, headlineSupportHeightRatio: item.audit.typographyVisual.headlineSupportHeightRatio, primaryVisualLayer: item.audit.typographyVisual.primaryVisualLayer, lineCount: item.audit.typographyVisual.lineCount, threeSecondReadable: item.audit.typographyVisual.threeSecondReadable, ocrText: item.audit.ocr.text, geometryStatus: item.geometry.status, aestheticHardGate: item.audit.aestheticHardGate, visualFingerprint: item.visualFingerprint})), passCount, failCount, retryRequiredShotIds: audits.filter((item) => item.status === "FAIL").map((item) => item.shotId), queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, boardRebuildCount: 0, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length, generatedAt: now};
  const saved = persistProjectState(appRoot, recalculated, {event, files: {"semantic-authority-convergence-v1/canonical-title-repair-actual-pixel-audit.json": report}});
  return {workspaceSha256After: saved.workspaceSha256, report};
});

for (const result of audits) {
  await updateRepairManifestSidecar({manifestPath, allowCurrentAuthorityMutation: true, update: (sidecar) => {
    const next = structuredClone(sidecar);
    const entry = next.entries.find((item) => item.shotId === result.shotId);
    if (!entry) throw new Error(`canonical-title-repair-sidecar-shot-missing:${result.shotId}`);
    entry.candidateSha = result.artifactSha256;
    entry.auditSha = result.auditSha256;
    entry.auditVersion = `${result.audit.contract}@${result.audit.version}`;
    entry.auditStatus = result.status === "PASS" ? "PASS_CACHED" : "NOT_RUN";
    entry.lastAuditFailures = result.status === "PASS" ? [] : [...result.failures];
    if (result.status === "PASS") {
      entry.status = "AUDIT_PASS";
      entry.generationState = "AUDITED";
      entry.nextAction = {action: "NONE"};
      return next;
    }
    const history = Array.isArray(entry.retryHistory) ? entry.retryHistory : [];
    const failedPrimitive = result.primitiveId || entry.primitiveId;
    entry.primitiveId = failedPrimitive;
    const switchPrimitive = history.length >= 1;
    const triedPrimitives = new Set([failedPrimitive, ...history.map((item) => item.primitiveId).filter(Boolean)]);
    const nextPrimitiveId = switchPrimitive
      ? (entry.primitiveCandidates || []).find((candidate) => candidate && !triedPrimitives.has(candidate)) || null
      : failedPrimitive;
    const action = switchPrimitive ? "SWITCH_PRIMITIVE" : "RETRY_SAME_PRIMITIVE_ONCE";
    entry.retryHistory = [...history, {kind: "STRUCTURAL_RETRY", primitiveId: failedPrimitive, attempt: entry.attempt, at: now, auditStatus: "FAIL", nextAction: action, failureReasonCodes: [...result.failures]}];
    entry.attempt = Number(entry.attempt || 0) + 1;
    entry.primitiveId = nextPrimitiveId || entry.primitiveId;
    entry.status = switchPrimitive && !nextPrimitiveId ? "REPAIR_BLOCKED" : switchPrimitive ? "SWITCH_PRIMITIVE_PENDING" : "RETRY_SAME_PRIMITIVE_PENDING";
    entry.generationState = switchPrimitive && !nextPrimitiveId ? "BLOCKED" : "READY";
    entry.nextAction = switchPrimitive && !nextPrimitiveId
      ? {action: "BLOCKED_PROVIDER_OR_PRIMITIVE_EXHAUSTED", samePrimitiveStructuralRetries: history.length, nextPrimitiveId: null, retryHistory: []}
      : {action, samePrimitiveStructuralRetries: history.length + 1, nextPrimitiveId: entry.primitiveId, retryHistory: []};
    return next;
  }});
}

console.log(JSON.stringify({status: "PASS", ...committed.report, workspaceSha256After: committed.workspaceSha256After}, null, 2));
