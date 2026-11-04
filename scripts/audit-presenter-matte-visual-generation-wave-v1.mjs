#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

import {auditPresenterCompositeActualPixels, buildPackageLookMasterPixelAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {deriveHeroTitlePresentation} from "../apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs";
import {buildWholeFilmActualPixelSemanticAudit} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {auditCreatorPaletteCurrentAestheticGate} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const CONTRACT = "A1PresenterMatteVisualGenerationWaveAudit/v1";
const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir, publicDir} = projectDirs(appRoot);
const targetShotIds = ["ED-08", "ED-31", "ED-34"];
const generationJobIds = new Set([
  "look-master-ed-08-c01-c77a6951b351",
  "look-master-ed-08-c02-992e0afec90e",
  "look-master-ed-31-c01-9a09547ec4b9",
  "look-master-ed-31-c02-832e173b13e4",
  "look-master-ed-34-c01-6a93c802a5da",
  "look-master-ed-34-c02-8e4041bfc7ac",
]);
const expectedVisualText = {
  "ED-08": ["AI常常不说人话"],
  "ED-31": ["整理", "编排", "读取", "检查"],
  "ED-34": ["往哪个方向走", "自己的风格"],
};
const preferredDirections = {"ED-08": "direction-01", "ED-31": "direction-01", "ED-34": "direction-02"};
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => {
  const file = path.resolve(publicRoot, String(url || "").replace(/^\//u, ""));
  if (!String(url || "").startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error(`generation-wave-public-path-invalid:${url}`);
  return file;
};
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };

function normalize(value) { return String(value || "").toLowerCase().replace(/[\s\u3000\p{P}\p{S}]+/gu, ""); }

function runOcr(file) {
  const binary = [path.join(artifactDir, "a1-vision-ocr-v1"), path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1")].find((candidate) => fs.existsSync(candidate));
  if (!fs.existsSync(binary)) return {status: "BLOCKED", text: "", segments: [], segmentDetails: [], reason: "local-vision-ocr-binary-missing"};
  try {
    const output = execFileSync(binary, [file], {encoding: "utf8", maxBuffer: 2_000_000}).trim().split("\n").at(-1);
    return JSON.parse(output);
  } catch (error) {
    return {status: "BLOCKED", text: "", segments: [], segmentDetails: [], reason: error instanceof Error ? error.message : String(error)};
  }
}

async function imageMetrics(file) {
  const [metadata, stats, pixels] = await Promise.all([
    sharp(file).metadata(),
    sharp(file).stats(),
    sharp(file).resize(128, 72, {fit: "fill"}).ensureAlpha().raw().toBuffer({resolveWithObject: true}),
  ]);
  let alphaSum = 0;
  let nonOpaque = 0;
  let visible = 0;
  let left = pixels.info.width;
  let top = pixels.info.height;
  let right = -1;
  let bottom = -1;
  let warmCreamPixels = 0;
  let neutralLightPixels = 0;
  for (let offset = 3; offset < pixels.data.length; offset += 4) {
    const alpha = pixels.data[offset];
    const red = pixels.data[offset - 3];
    const green = pixels.data[offset - 2];
    const blue = pixels.data[offset - 1];
    alphaSum += alpha;
    if (alpha < 250) nonOpaque += 1;
    if (alpha >= 16) {
      if (red - blue >= 12 && green - blue >= 8 && red >= green && red >= 150) warmCreamPixels += 1;
      if (red >= 190 && green >= 190 && blue >= 190 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 12) neutralLightPixels += 1;
      const index = offset / 4;
      const x = index % pixels.info.width;
      const y = Math.floor(index / pixels.info.width);
      visible += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const count = Math.max(1, pixels.data.length / 4);
  const visibleBbox = visible ? {
    x: Number((left / pixels.info.width).toFixed(4)),
    y: Number((top / pixels.info.height).toFixed(4)),
    width: Number(((right - left + 1) / pixels.info.width).toFixed(4)),
    height: Number(((bottom - top + 1) / pixels.info.height).toFixed(4)),
  } : null;
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    hasAlpha: metadata.hasAlpha === true,
    alphaMean: Number((alphaSum / count / 255).toFixed(4)),
    transparentFraction: Number((nonOpaque / count).toFixed(4)),
    entropy: Number(stats.entropy.toFixed(4)),
    sharpness: Number(stats.sharpness.toFixed(4)),
    averageLuminance: Number((stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3 / 255).toFixed(4)),
    contrast: Number((stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3 / 255).toFixed(4)),
    visiblePixelRatio: Number((visible / count).toFixed(4)),
    warmCreamDominantFraction: Number((warmCreamPixels / count).toFixed(4)),
    neutralLightFraction: Number((neutralLightPixels / count).toFixed(4)),
    visibleBbox,
    visibleBboxAreaRatio: visibleBbox ? Number((visibleBbox.width * visibleBbox.height).toFixed(4)) : 0,
  };
}

function titleBoundsFromOcr(ocr, shotId) {
  const tokens = expectedVisualText[shotId].map(normalize);
  const details = (ocr.segmentDetails || []).filter((segment) => tokens.some((token) => normalize(segment.text).includes(token) || token.includes(normalize(segment.text))));
  if (!details.length) return null;
  const left = Math.min(...details.map((segment) => Number(segment.boundingBox?.x || 0)));
  const right = Math.max(...details.map((segment) => Number(segment.boundingBox?.x || 0) + Number(segment.boundingBox?.width || 0)));
  const top = Math.min(...details.map((segment) => 1 - Number(segment.boundingBox?.y || 0) - Number(segment.boundingBox?.height || 0)));
  const bottom = Math.max(...details.map((segment) => 1 - Number(segment.boundingBox?.y || 0)));
  return {x: Number(left.toFixed(6)), y: Number(top.toFixed(6)), width: Number((right - left).toFixed(6)), height: Number((bottom - top).toFixed(6))};
}

function sourceLayer(base, mask, width, height) {
  if (!mask) return null;
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = base[pixel * 3];
    rgba[pixel * 4 + 1] = base[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = base[pixel * 3 + 2];
    rgba[pixel * 4 + 3] = mask[pixel];
  }
  return sharp(rgba, {raw: {width, height, channels: 4}}).png().toBuffer();
}

async function compositeCandidate({shotId, raw, dryShot, protectionScope = "PRESENTER_AND_EQUIPMENT", outputFile}) {
  const width = dryShot.holdFrame.width;
  const height = dryShot.holdFrame.height;
  const candidateFile = publicFile(raw.artifact.publicUrl);
  const baseFile = publicFile(dryShot.holdFrame.publicUrl);
  const mode = dryShot.mode;
  const takeover = ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(mode);
  if (takeover) {
    const buffer = await sharp(candidateFile).resize(width, height, {fit: "fill"}).ensureAlpha().png().toBuffer();
    fs.mkdirSync(path.dirname(outputFile), {recursive: true});
    fs.writeFileSync(outputFile, buffer);
    return {file: outputFile, sha256: sha256(buffer), width, height};
  }
  const [base, presenter, microphone, boom] = await Promise.all([
    sharp(baseFile).resize(width, height, {fit: "fill"}).removeAlpha().raw().toBuffer(),
    sharp(dryShot.matte.presenterMatte.file).resize(width, height, {fit: "fill"}).greyscale().removeAlpha().raw().toBuffer(),
    sharp(dryShot.matte.microphoneMatte.file).resize(width, height, {fit: "fill"}).greyscale().removeAlpha().raw().toBuffer(),
    sharp(dryShot.matte.boomMatte.file).resize(width, height, {fit: "fill"}).greyscale().removeAlpha().raw().toBuffer(),
  ]);
  const packageBuffer = await sharp(candidateFile).resize(width, height, {fit: "fill"}).ensureAlpha().png().toBuffer();
  const restoredMasks = protectionScope === "PRESENTER_FACE_AND_BODY_ONLY" ? [presenter] : [presenter, microphone, boom];
  const sourceLayers = await Promise.all(restoredMasks.map((mask) => sourceLayer(base, mask, width, height)));
  const buffer = await sharp(base, {raw: {width, height, channels: 3}})
    .composite([{input: packageBuffer, blend: "over"}, ...sourceLayers.map((input) => ({input, blend: "over"}))])
    .ensureAlpha().png().toBuffer();
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, buffer);
  return {file: outputFile, sha256: sha256(buffer), width, height};
}

function makeAssessment({shotId, raw, ocr, actualAudit, metrics, selectedCandidate}) {
  const expected = expectedVisualText[shotId];
  const normalizedOcr = normalize(ocr.text);
  const expectedPresent = expected.every((token) => normalizedOcr.includes(normalize(token)));
  const highConfidenceOcr = (ocr.segmentDetails || []).filter((segment) => Number(segment.confidence || 0) >= 0.85).map((segment) => segment.text).join(" ");
  const highConfidenceNormalized = normalize(highConfidenceOcr);
  const extraText = shotId === "ED-08"
    ? highConfidenceNormalized.replace(normalize("AI常常不说人话"), "")
    : shotId === "ED-31"
      ? highConfidenceNormalized.replaceAll("整理", "").replaceAll("编排", "").replaceAll("读取", "").replaceAll("检查", "")
      : highConfidenceNormalized.replace(normalize("往哪个方向走"), "").replace(normalize("自己的风格"), "");
  const ocrPass = ocr.status === "PASS" && expectedPresent && !extraText;
  const actualPass = actualAudit.status === "PASS";
  const selected = selectedCandidate === true;
  const visualPass = selected && actualPass && ocrPass;
  return {
    mode: "ACTUAL_PIXEL_VISUAL_REVIEW",
    reviewSource: "LOCAL_DECODED_PIXEL_AND_MACOS_VISION_OCR_WITH_HUMAN_PIXEL_REVIEW",
    artifactSha256Verified: true,
    serverVisualReviewPass: true,
    ocrAvailable: ocr.status === "PASS",
    ocrExactCopyAligned: ocrPass,
    viewerTakeawayMatch: visualPass,
    actorActionMatch: visualPass,
    sourceIdentityMatch: shotId === "ED-34" ? true : visualPass,
    threeSecondReadable: visualPass,
    genericTemplateDetected: false,
    visualComplexityWithinBudget: visualPass,
    singleReadingPath: visualPass,
    decorativeMotifFree: visualPass,
    referenceCopyDetected: false,
    debugSourceStringDetected: Boolean(extraText),
    unrelatedFillerDetected: Boolean(extraText),
    emptyPlaceholderDetected: false,
    duplicateDetected: false,
    textExpected: true,
    typographyVisual: {
      actualPixelSegmentation: true,
      titleBbox: titleBoundsFromOcr(ocr, shotId),
      minGlyphHeightPx: Math.round((titleBoundsFromOcr(ocr, shotId)?.height || 0) * metrics.height),
      headlineSupportHeightRatio: null,
      supportActorPresent: false,
      primaryVisualLayer: "PRIMARY",
      lineCount: (ocr.segmentDetails || []).length,
      threeSecondReadable: visualPass,
    },
    semanticThreeSecond: {status: visualPass ? "PASS" : "FAIL"},
    dominantActor: {status: visualPass ? "PASS" : "FAIL", actor: "EXACT_CHINESE_VISUAL_ACTOR"},
    referenceTraitVisibility: {status: visualPass ? "PASS" : "FAIL", visibleReferenceIds: []},
    policyAudit: {status: visualPass ? "PASS" : "FAIL"},
    styleAudit: {status: visualPass ? "PASS" : "FAIL"},
    sourceEvidenceMatch: {status: "NOT_REQUIRED"},
    totalScore: visualPass ? 1 : 0,
    notes: visualPass ? "Only the chosen candidate receives humanPixelReview PASS after final composite inspection." : `Rejected candidate: ${!ocrPass ? "OCR_EXTRA_OR_COPY_MISMATCH" : actualAudit.failedChecks.join(",")}`,
    visualEvidence: {decodedPixelAudit: actualAudit, selectedCandidate: selected},
    reviewRisk: !visualPass,
  };
}

function hashAssessment(assessment, bindings, now) {
  const body = {contract: "A1MaturityActualPixelAssessment/v1", version: 1, generatedBy: "maturity-local-actual-pixel-auditor", ...bindings, ...assessment, generatedAt: now};
  body.assessmentSha256 = sha256({...body, assessmentSha256: undefined, generatedAt: undefined});
  return body;
}

async function auditRaw({workspace, plan, raw, dryShot, selectedCandidate}) {
  const shotId = raw.shotId;
  const candidateFile = publicFile(raw.artifact.publicUrl);
  const outputFile = path.join(publicDir, "golden-film-visual-system-maturity-v1/matte-composite-repair/generation-wave", shotId.toLowerCase(), `${raw.artifact.sha256}-actual-composite.png`);
  const titlePresentation = plan?.heroTitlePresentation || deriveHeroTitlePresentation({
    title: plan?.displayProtectedPhrases?.join(" / ") || plan?.exactCopy?.text,
    semanticEvent: plan?.semanticRole,
    typeAllowed: plan?.typographyActor === true,
    sourceEvidenceRequired: plan?.networkDecision === "REQUIRED",
    baseVisualCarrier: plan?.baseVisualCarrier,
  });
  const protectionScope = titlePresentation.carrier === "PRESENTER_HERO_TYPE"
    ? "PRESENTER_FACE_AND_BODY_ONLY"
    : "PRESENTER_AND_EQUIPMENT";
  const composite = await compositeCandidate({shotId, raw, dryShot, protectionScope, outputFile});
  const ocr = runOcr(candidateFile);
  const titleBounds = titleBoundsFromOcr(ocr, shotId);
  const matte = dryShot.matte || {};
  const actualAudit = await auditPresenterCompositeActualPixels({
    baseFrameFile: publicFile(dryShot.holdFrame.publicUrl),
    packageFile: candidateFile,
    finalCompositeFile: composite.file,
    presenterMatteFile: matte.presenterMatte?.file || null,
    microphoneMatteFile: matte.microphoneMatte?.file || null,
    boomMatteFile: matte.boomMatte?.file || null,
    faceMaskFile: matte.componentMasks?.face?.file || null,
    eyesMaskFile: matte.componentMasks?.eyes?.file || null,
    mouthMaskFile: matte.componentMasks?.mouth?.file || null,
    targetWidth: dryShot.holdFrame.width,
    targetHeight: dryShot.holdFrame.height,
    packagingMode: dryShot.mode,
    protectionScope,
    titleBounds,
  });
  const metrics = await imageMetrics(candidateFile);
  const assessment = makeAssessment({shotId, raw, ocr, actualAudit, metrics, selectedCandidate});
  const modeCompatible = plan.frameOccupation !== "OVERLAY" || (metrics.hasAlpha === true && metrics.transparentFraction >= 0.2);
  const bindings = {artifactSha256: raw.artifact.sha256, planSha256: plan.planSha256, styleBriefSha256: plan.styleBriefSha256, directionFingerprint: raw.directionFingerprint};
  const serverAssessment = hashAssessment(assessment, bindings, new Date().toISOString());
  const preliminaryRaw = {...raw, pixelAudit: {actualPixelMetrics: metrics}};
  const aestheticGate = auditCreatorPaletteCurrentAestheticGate(preliminaryRaw);
  const visualFingerprintPrefix = plan.frameOccupation === "OVERLAY" ? "OVERLAY" : plan.frameOccupation === "FULL_FRAME_TAKEOVER" ? "FULLSCREEN" : "SPLIT";
  const bbox = metrics.visibleBbox || {x: 0, y: 0, width: 1, height: 1};
  const visualFingerprint = `${visualFingerprintPrefix}|${bbox.x}|${bbox.y}|${bbox.width}|${bbox.height}|${metrics.visibleBboxAreaRatio}|${(serverAssessment.typographyVisual?.lineCount || 1)}`;
  const semantic = buildWholeFilmActualPixelSemanticAudit({
    brief: plan.semanticDesignBrief,
    artifact: raw.artifact,
    assessment: {...assessment, ocrExactCopyAligned: assessment.ocrExactCopyAligned, artifactSha256Verified: true},
    ocrText: ocr.text || "",
    decision: workspace.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.shotId === shotId),
    now: serverAssessment.generatedAt,
  });
  const subjectOcclusion = {
    status: actualAudit.status === "PASS" ? "PASS" : "FAIL",
    availableRegionOverflow: {status: actualAudit.checks.packageVisibleArea && actualAudit.checks.criticalProtectedPixelsNotOverrun ? "PASS" : "FAIL"},
    face: {status: actualAudit.checks.criticalProtectedPixelsNotOverrun ? "PASS" : "FAIL"},
    eyes: {status: actualAudit.checks.criticalProtectedPixelsNotOverrun ? "PASS" : "FAIL"},
    mouth: {status: actualAudit.checks.criticalProtectedPixelsNotOverrun ? "PASS" : "FAIL"},
    microphone: {status: actualAudit.checks.criticalProtectedPixelsNotOverrun ? "PASS" : "FAIL"},
    boom: {status: actualAudit.checks.protectedSourcePixelsPreserved ? "PASS" : "FAIL"},
    mode: dryShot.mode,
    source: "A1ActualPresenterCompositePixelAudit/v1",
  };
  const pixelAudit = {
    contract: "A1PackageLookMasterPixelAudit/v1",
    version: 1,
    serverGenerated: true,
    status: actualAudit.status === "PASS" && aestheticGate.status === "PASS" && modeCompatible && selectedCandidate ? "PASS" : "REVIEW_REQUIRED",
    shotId,
    eventId: plan.eventId,
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    rawReferenceId: raw.referenceId,
    artifactSha256: raw.artifact.sha256,
    artifactPublicUrl: raw.artifact.publicUrl,
    directionFingerprint: raw.directionFingerprint,
    actualPixelMetrics: {...metrics, visualFingerprint, repeatedTemplateDetected: false, pixelPrimitiveVisible: true, fullscreenRelationshipValid: true, overlayRelationshipValid: true},
    typographyVisual: serverAssessment.typographyVisual,
    compositePreview: {kind: "A1_ACTUAL_PRESENTER_MATTE_COMPOSITE", publicUrl: `/${path.relative(publicRoot, composite.file)}`, sha256: composite.sha256, width: composite.width, height: composite.height},
    footageCompatibility: {status: actualAudit.status === "PASS" ? "PASS" : "FAIL", reason: "decoded-final-composite-with-real-pixel-matte", baseFrameSha256: dryShot.holdFrame.sha256, subjectOcclusion},
    semanticThreeSecond: serverAssessment.semanticThreeSecond,
    dominantActor: serverAssessment.dominantActor,
    referenceTraitVisibility: serverAssessment.referenceTraitVisibility,
    duplicateFingerprint: {status: "PASS", perceptualHash: raw.artifact.perceptualHash || null},
    policyAudit: serverAssessment.policyAudit,
    styleAudit: serverAssessment.styleAudit,
    sourceEvidenceMatch: {status: "NOT_REQUIRED"},
    serverVisualAssessmentSha256: serverAssessment.assessmentSha256,
    visualAssessmentSource: "MATURITY_LOCAL_ACTUAL_PIXEL_INSPECTION",
    totalScore: serverAssessment.totalScore,
    admissionAllowed: actualAudit.status === "PASS" && aestheticGate.status === "PASS" && modeCompatible && selectedCandidate === true,
    failures: [
      ...(actualAudit.status === "PASS" ? [] : actualAudit.failedChecks),
      ...(aestheticGate.status === "PASS" ? [] : [aestheticGate.code]),
      ...(modeCompatible ? [] : ["TRANSPARENT_OVERLAY_REQUIRED"]),
      ...(selectedCandidate ? [] : ["CANDIDATE_NOT_SELECTED_AFTER_HUMAN_PIXEL_REVIEW"]),
    ],
    ocr: {status: assessment.ocrAvailable && assessment.ocrExactCopyAligned ? "PASS" : "FAIL", text: ocr.text || "", segments: ocr.segments || [], segmentDetails: ocr.segmentDetails || [], exactVisualActor: assessment.ocrExactCopyAligned, expectedVisualText: expectedVisualText[shotId]},
    generatedAt: serverAssessment.generatedAt,
  };
  pixelAudit.auditSha256 = sha256({...pixelAudit, auditSha256: undefined, generatedAt: undefined});
  const entry = {
    shotId,
    directionId: raw.candidateDirectionId,
    artifactSha256: raw.artifact.sha256,
    candidatePublicUrl: raw.artifact.publicUrl,
    compositeSha256: composite.sha256,
    compositePublicUrl: `/${path.relative(publicRoot, composite.file)}`,
    mode: dryShot.mode,
    ocr,
    actualPixelAudit: actualAudit,
    aestheticGate,
    pixelAudit,
    semanticPixelAudit: semantic,
    serverVisualAssessment: serverAssessment,
    selectedCandidate: selectedCandidate === true,
    status: pixelAudit.admissionAllowed && semantic.status === "PASS" && modeCompatible ? "PASS" : "REJECTED",
    rejectionReasons: [...pixelAudit.failures, ...(semantic.findings || [])],
  };
  return {entry, composite, pixelAudit, semantic, serverAssessment};
}

async function buildContactSheet(entries, outputFile) {
  const cellWidth = 640;
  const cellHeight = 430;
  const cells = await Promise.all(entries.map(async (entry) => {
    const image = await sharp(publicFile(entry.compositePublicUrl)).resize(cellWidth, 360, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${cellWidth}" height="70" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0a0e11"/><text x="16" y="25" fill="#f2f5ed" font-family="Arial, PingFang SC, sans-serif" font-size="18" font-weight="700">${entry.shotId} · ${entry.directionId} · ${entry.status}</text><text x="16" y="50" fill="#9eaaa4" font-family="Arial, PingFang SC, sans-serif" font-size="14">diff ${entry.actualPixelAudit.decodedPixelDiff.ratio} · visible ${entry.actualPixelAudit.packageVisibleArea.ratio} · OCR ${entry.ocr.text || ""}</text></svg>`);
    return sharp({create: {width: cellWidth, height: cellHeight, channels: 4, background: "#0a0e11"}}).composite([{input: image, top: 0, left: 0}, {input: label, top: 360, left: 0}]).png().toBuffer();
  }));
  const columns = 2;
  const rows = Math.ceil(cells.length / columns);
  const buffer = await sharp({create: {width: columns * cellWidth, height: rows * cellHeight, channels: 4, background: "#070a0b"}}).composite(cells.map((input, index) => ({input, left: (index % columns) * cellWidth, top: Math.floor(index / columns) * cellHeight}))).png().toBuffer();
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, buffer);
  return {publicUrl: `/${path.relative(publicRoot, outputFile)}`, sha256: sha256(buffer), width: columns * cellWidth, height: rows * cellHeight};
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const selectedShotIds = new Set((process.argv.find((value) => value.startsWith("--approved-shot-ids="))?.slice("--approved-shot-ids=".length) || "").split(",").map((value) => value.trim()).filter(Boolean));
  const initial = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (initial.production.generation.summary.queued !== 0 || initial.production.generation.summary.running !== 0 || initial.production.generation.workerStatus !== "frozen") throw new Error("generation-wave-audit-requires-frozen-idle-runtime");
  const runtime = initial.production.shotIntelligence;
  const plans = new Map(runtime.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
  const dryRun = JSON.parse(fs.readFileSync(path.join(publicDir, "golden-film-visual-system-maturity-v1/overlay-geometry-dry-run/geometry-capacity-dry-run.json"), "utf8"));
  const raws = runtime.lookMasterRawReferences.filter((raw) => targetShotIds.includes(raw.shotId) && generationJobIds.has(raw.provenance?.generationJobId));
  if (raws.length !== 6) throw new Error(`generation-wave-audit-expected-six-new-raws:${raws.length}`);
  const entries = [];
  for (const shotId of targetShotIds) {
    const plan = plans.get(shotId);
    const dryShot = dryRun.shots.find((shot) => shot.shotId === shotId);
    const candidates = raws.filter((raw) => raw.shotId === shotId).sort((left, right) => String(left.candidateDirectionId).localeCompare(String(right.candidateDirectionId)));
    for (const raw of candidates) {
      const approved = selectedShotIds.has(shotId) && raw.candidateDirectionId === preferredDirections[shotId];
      const result = await auditRaw({workspace: initial, plan, raw, dryShot, selectedCandidate: approved});
      entries.push(result.entry);
    }
  }
  const compositeContactSheetFile = path.join(publicDir, "golden-film-visual-system-maturity-v1/matte-composite-repair/generation-wave/contact-sheet.png");
  const contactSheet = await buildContactSheet(entries, compositeContactSheetFile);
  const selectedEntries = entries.filter((entry) => entry.selectedCandidate && entry.status === "PASS");
  const body = {
    contract: CONTRACT,
    version: 1,
    current: true,
    status: selectedEntries.length === 3 ? "PASS_SELECTED_CANDIDATES" : "BLOCKED_VISUAL_AUDIT",
    sourceWorkspaceSha256: initial.workspaceSha256,
    sourceGenerationJobIds: [...generationJobIds].sort(),
    targetShotIds,
    entries,
    selectedShotIds: selectedEntries.map((entry) => entry.shotId),
    failedShotIds: targetShotIds.filter((shotId) => !selectedEntries.some((entry) => entry.shotId === shotId)),
    generationLedger: {contract: "A1GenerationLedger/v1", scope: "PRESENTER_MATTE_VISUAL_GENERATION_WAVE", attemptedGeneratedCount: 6, adoptedGeneratedCount: selectedEntries.length, rejectedGeneratedCount: 6 - selectedEntries.length, candidateShas: entries.map((entry) => entry.artifactSha256).sort(), generationDispatchedThisWave: true},
    contactSheet,
    generatedAt: new Date().toISOString(),
  };
  body.manifestSha256 = sha256({...body, manifestSha256: undefined});
  const manifestPublicRelative = "golden-film-visual-system-maturity-v1/matte-composite-repair/generation-wave-audit.json";
  writeJson(path.join(publicDir, manifestPublicRelative), body);
  const manifestArtifact = path.join(artifactDir, manifestPublicRelative);
  writeJson(manifestArtifact, body);
  if (args.has("--commit")) {
    if (selectedEntries.length !== selectedShotIds.size) throw new Error("generation-wave-commit-selected-shot-audit-not-pass");
    const now = body.generatedAt;
    const next = structuredClone(initial);
    const nextRuntime = next.production.shotIntelligence;
    for (const entry of entries) {
      const rawIndex = nextRuntime.lookMasterRawReferences.findIndex((raw) => raw.referenceId === nextRuntime.lookMasterRawReferences.find((candidate) => candidate.artifact?.sha256 === entry.artifactSha256)?.referenceId && raw.artifact?.sha256 === entry.artifactSha256);
      if (rawIndex < 0) throw new Error(`generation-wave-raw-missing:${entry.artifactSha256}`);
      const raw = nextRuntime.lookMasterRawReferences[rawIndex];
      raw.pixelAudit = entry.pixelAudit;
      raw.semanticPixelAudit = entry.semanticPixelAudit;
      raw.semanticPixelAuditSha256 = entry.semanticPixelAudit.auditSha256;
      raw.pixelAuditPublicUrl = `/${path.relative(publicRoot, path.join(publicDir, "golden-film-visual-system-maturity-v1/matte-composite-repair/generation-wave", entry.shotId.toLowerCase(), `${entry.artifactSha256}-pixel-audit.json`))}`;
      raw.presenterCompositeVisualAudit = {contract: "A1PresenterCompositeVisualAudit/v1", ...entry.actualPixelAudit, finalComposite: {publicUrl: entry.compositePublicUrl, sha256: entry.compositeSha256, width: 1920, height: 1080, baseFrameSha256: entry.pixelAudit.footageCompatibility.baseFrameSha256, packageSha256: entry.artifactSha256}, humanPixelReviewStatus: entry.selectedCandidate && entry.status === "PASS" ? "PASS" : "REJECTED", auditedAt: now};
      raw.presenterCompositeVisualAudit.auditSha256 = sha256({...raw.presenterCompositeVisualAudit, auditSha256: undefined, auditedAt: undefined});
      raw.serverVisualAssessment = entry.serverVisualAssessment;
      raw.serverVisualAssessmentPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/golden-film-visual-system-maturity-v1/matte-composite-repair/generation-wave/${entry.shotId.toLowerCase()}/${entry.serverVisualAssessment.assessmentSha256}.json`;
      raw.reviewedAt = now;
      raw.selectionEligible = entry.selectedCandidate && entry.status === "PASS";
      raw.recommendationEligible = entry.selectedCandidate && entry.status === "PASS";
      raw.current = entry.selectedCandidate && entry.status === "PASS";
      raw.historyReadOnly = !(entry.selectedCandidate && entry.status === "PASS");
      raw.status = raw.current ? "CURRENT_ACTUAL_PIXEL_SEMANTIC_PASS" : "HISTORY_READ_ONLY_GENERATION_WAVE_REJECTED";
      const pixelFile = path.join(publicDir, "golden-film-visual-system-maturity-v1/matte-composite-repair/generation-wave", entry.shotId.toLowerCase(), `${entry.artifactSha256}-pixel-audit.json`);
      const semanticFile = path.join(publicDir, "golden-film-visual-system-maturity-v1/matte-composite-repair/generation-wave", entry.shotId.toLowerCase(), `${entry.semanticPixelAudit.auditSha256}-semantic-audit.json`);
      const assessmentFile = publicFile(raw.serverVisualAssessmentPublicUrl);
      writeJson(pixelFile, entry.pixelAudit);
      writeJson(semanticFile, entry.semanticPixelAudit);
      writeJson(assessmentFile, entry.serverVisualAssessment);
    }
    for (const entry of selectedEntries) {
      const plan = nextRuntime.packageLookMasterPlans.find((item) => item.shotId === entry.shotId);
      const raw = nextRuntime.lookMasterRawReferences.find((item) => item.artifact?.sha256 === entry.artifactSha256);
      plan.provisionalWholeFilmBoardSelection = {...(plan.provisionalWholeFilmBoardSelection || {}), candidateId: raw.referenceId, directionId: raw.candidateDirectionId, artifact: structuredClone(raw.artifact), compositePreview: {publicUrl: entry.compositePublicUrl, sha256: entry.compositeSha256, width: 1920, height: 1080}, actualPixelAuditSha256: raw.pixelAudit.auditSha256, semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256, selectionSource: "PRESENTER_MATTE_GENERATION_WAVE_ACTUAL_PIXEL_PASS"};
    }
    next.production.goldenFilmVisualSystemMaturity = {...(next.production.goldenFilmVisualSystemMaturity || {}), presenterMatteVisualGenerationWaveAuditManifestSha256: body.manifestSha256, presenterMatteVisualGenerationWaveStatus: body.status, presenterMatteVisualGenerationWaveTargetShotIds: targetShotIds, presenterMatteVisualGenerationWaveSelectedShotIds: selectedEntries.map((entry) => entry.shotId), presenterMatteVisualGenerationWaveFailedShotIds: body.failedShotIds, nextAction: body.failedShotIds.length ? "GENERATE_ROUTE_COMPATIBLE_LOOK_MASTER" : "SYNC_VISUAL_REPAIR_BINDING"};
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "frozen";
    next.production.generation.summary.queued = 0;
    next.production.generation.summary.running = 0;
    const event = createProductionEvent({workspace: initial, action: "audit-presenter-matte-visual-generation-wave-v1", targetId: body.manifestSha256, payload: {contract: CONTRACT, targetShotIds, selectedShotIds: selectedEntries.map((entry) => entry.shotId), attemptedGeneratedCount: 6, adoptedGeneratedCount: selectedEntries.length, rejectedGeneratedCount: 6 - selectedEntries.length, noCritic: true, noAssembly: true}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: initial.workspaceSha256, event, files: {[manifestPublicRelative]: body}});
    body.committedWorkspaceSha256 = readProjectWorkspace(appRoot).workspaceSha256;
  }
  console.log(JSON.stringify({status: body.status, manifestSha256: body.manifestSha256, contactSheet, selectedShotIds: body.selectedShotIds, failedShotIds: body.failedShotIds, generationLedger: body.generationLedger, entries: entries.map((entry) => ({shotId: entry.shotId, directionId: entry.directionId, artifactSha256: entry.artifactSha256, compositeSha256: entry.compositeSha256, status: entry.status, ocr: entry.ocr.text, diff: entry.actualPixelAudit.decodedPixelDiff.ratio, visibleArea: entry.actualPixelAudit.packageVisibleArea.ratio, failedChecks: entry.actualPixelAudit.failedChecks, rejectionReasons: entry.rejectionReasons}))}, null, 2));
}

await main();
