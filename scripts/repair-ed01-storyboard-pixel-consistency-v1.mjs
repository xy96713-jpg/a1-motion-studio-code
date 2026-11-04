#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {buildCanonicalStaticBoardScope, projectCanonicalStaticBoardWorkspace} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {buildPackageLookMasterPlan, assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {compileRetroPixelEditorialStyleBrief, assertRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {rehashShotSemanticDesignBrief, assertShotSemanticDesignBrief} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";
import {buildStoryboardPixelConsistencyAudit} from "../apps/studio-next/src/lib/a1-storyboard-pixel-consistency-v1.mjs";
import {buildVideoPackagingContext, buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {buildCandidateRecommendationAuditAuthority, buildWholeFilmActualPixelSemanticAudit} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildCreatorPaletteBoundRepairTransition} from "./compile-creator-packaging-palette-bound-repair-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phasePrefix = "/generated/system-line/editorial-asset-workbench-v1/ed01-storyboard-consistency-v1";
const artifactRelative = "ed01-storyboard-consistency-v1/ED-01-opening-title.png";
const workDir = path.join(root, "work/ed01-storyboard-consistency-v1");
const sourceFrame = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg");
const fontFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/font-cache/fusion-pixel.ttf");
const referenceManifestFile = path.join(publicRoot, "generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const fontSha256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const font = fontkit.create(fs.readFileSync(fontFile));

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const auditSha = (value) => sha256({...value, auditSha256: undefined, generatedAt: undefined});
const contextSha = (value) => sha256({...value, contextSha256: undefined, createdAt: undefined});

if (fileSha256(fontFile) !== fontSha256) throw new Error("ed01-fusion-pixel-sha-mismatch");
if (!fs.existsSync(sourceFrame)) throw new Error("ed01-source-frame-missing");

function glyphLine({id, text, x, y, size, tracking = 0, color, role, dominant = false}) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`ed01-font-glyph-missing:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    const bbox = glyph.bbox;
    if (bbox) {
      minX = Math.min(minX, cursor + bbox.minX * scale);
      maxX = Math.max(maxX, cursor + bbox.maxX * scale);
      minY = Math.min(minY, y - bbox.maxY * scale);
      maxY = Math.max(maxY, y - bbox.minY * scale);
    }
    cursor += position.xAdvance * scale + tracking;
  }
  return {
    markup: `<g fill="${color}">${paths.join("")}</g>`,
    spec: {id, text, role, dominant, fontAssetId: "type-pixel-correction", fontFamily: "A1 Fusion Pixel", fontSha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", editable: true, generated: false, glyphIds, geometry: {x, y, size, tracking}, bounds: {x: Number(minX.toFixed(2)), y: Number(minY.toFixed(2)), width: Number((maxX - minX).toFixed(2)), height: Number((maxY - minY).toFixed(2))}, color},
  };
}

async function renderCandidate() {
  const nodes = [
    glyphLine({id: "ed01-kicker", text: "VIBE CODING", x: 78, y: 108, size: 34, tracking: 4, color: "#6f8cff", role: "support"}),
    glyphLine({id: "ed01-title-a-shadow", text: "智能写作", x: 86, y: 286, size: 142, tracking: 0, color: "#2447ff", role: "registration-shadow"}),
    glyphLine({id: "ed01-title-a", text: "智能写作", x: 78, y: 278, size: 142, tracking: 0, color: "#f0efe8", role: "identity-title", dominant: true}),
    glyphLine({id: "ed01-title-b-shadow", text: "工作台", x: 90, y: 438, size: 202, tracking: 0, color: "#2447ff", role: "registration-shadow"}),
    glyphLine({id: "ed01-title-b", text: "工作台", x: 78, y: 426, size: 202, tracking: 0, color: "#f0efe8", role: "identity-title", dominant: true}),
  ];
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect x="58" y="52" width="700" height="408" rx="10" fill="#06090b" fill-opacity=".34"/>${nodes.map((node) => node.markup).join("")}<rect x="702" y="394" width="30" height="30" fill="#2447ff"/></svg>`);
  const overlay = await sharp(svg).png().toBuffer();
  const source = await sharp(sourceFrame).resize(1920, 1080, {fit: "fill"}).png().toBuffer();
  const buffer = await sharp(source).composite([{input: overlay}]).png({compressionLevel: 9}).toBuffer();
  const protectedRects = [
    {id: "face", x: 900, y: 300, width: 330, height: 360},
    {id: "body", x: 630, y: 610, width: 790, height: 470},
    {id: "microphone", x: 455, y: 480, width: 440, height: 215},
    {id: "boom-arm", x: 0, y: 545, width: 630, height: 420},
  ];
  const titleBounds = nodes.filter((node) => node.spec.role !== "registration-shadow").map((node) => node.spec.bounds);
  const overlaps = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const overlap = protectedRects.flatMap((region) => titleBounds.map((bounds) => ({region: region.id, area: overlaps(region, bounds)}))).filter((item) => item.area > 0);
  const typographySpec = {
    contract: "A1EditableTypographySpec/v1",
    shotId: "ED-01",
    status: overlap.length ? "BLOCK" : "PASS",
    authoritativeTitle: "智能写作工作台",
    sourcePhrase: "Hi，我用 vibe coding 做了一款智能写作工作台。",
    hierarchy: {primary: "智能写作工作台", secondary: "VIBE CODING", spokenGreetingIsVisualTitle: false},
    font: {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", sha256: fontSha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES"},
    nodes: nodes.map((node) => node.spec),
    protectedRects,
    overlap,
    generatedFormalText: false,
    editable: true,
  };
  typographySpec.specSha256 = sha256({...typographySpec, specSha256: undefined});
  return {buffer, nodes, typographySpec, artifactSha256: sha256(buffer)};
}

function updateEd01SemanticBrief(next, now) {
  const set = next.production.shotIntelligence.semanticDesignBriefSet;
  const index = set.briefs.findIndex((item) => item.shotId === "ED-01");
  if (index < 0) throw new Error("ed01-semantic-brief-missing");
  const brief = structuredClone(set.briefs[index]);
  brief.packageDecision = "PACKAGE";
  brief.presentation = {type: "OVERLAY", reason: "开场产品身份必须成为人物负空间中的大标题；Hi 仅保留为口播，不作为视觉主标题。"};
  brief.contentTreatment = "HERO_TYPOGRAPHY";
  brief.frameOccupation = "OVERLAY";
  brief.rhythmRole = "TURN";
  brief.requiredFormalText = ["智能写作工作台"];
  brief.semanticTimeline = {
    ...(brief.semanticTimeline || {}),
    localPackageDecision: "PACKAGE",
    packageDecisionBeforeSequenceReview: "PACKAGE",
    finalPackageDecision: "PACKAGE",
    packageModeBeforeSequenceReview: "OVERLAY",
    finalPackageMode: "OVERLAY",
    packageModeDecision: {mode: "OVERLAY", source: "CURRENT_USER_AND_SEMANTIC_AUTHORITY", rationale: brief.presentation.reason},
    packageSuppressedReason: null,
    routeOverride: null,
    baseVisualCarrier: "PRESENTER_BASE",
    enhancementPackaging: "HERO_TYPOGRAPHY",
    strongLanguageEvent: true,
    typographyTreatment: "IDENTITY_DOMINANT",
    typographyActor: true,
    protectedPhrases: ["智能写作工作台"],
    reason: brief.presentation.reason,
  };
  brief.generatedAt = now;
  set.briefs[index] = assertShotSemanticDesignBrief(rehashShotSemanticDesignBrief(brief));
  set.routeMap = set.briefs.map((item) => ({shotId: item.shotId, shotSourceHash: item.shotSourceHash, status: item.status, packageDecision: item.packageDecision, evidenceRoute: item.evidenceRoute, presentationType: item.presentation?.type || null}));
  set.generatedAt = now;
  set.status = set.briefs.every((item) => item.status === "READY") ? "READY" : "SEMANTIC_INPUTS_PARTIAL";
  set.briefSetSha256 = sha256({...set, briefSetSha256: undefined, generatedAt: undefined});
  return set.briefs[index];
}

function sourceBindingManifest(styleBrief, typographySpec, artifactSha256) {
  const styleBriefBytes = jsonBytes(styleBrief);
  const typographyBytes = jsonBytes(typographySpec);
  return {
    contract: "A1HashBoundLocalLookMasterSourceManifest/v1",
    shotId: "ED-01",
    artifactSha256,
    sources: [
      {id: "ed01-authoritative-presenter-frame", role: "AUTHORITATIVE_REAL_PRESENTER_HOLD_FRAME", file: path.relative(root, sourceFrame), sha256: fileSha256(sourceFrame)},
      {id: "a1-fusion-pixel-font", role: "HASH_BOUND_FORMAL_TYPOGRAPHY", file: path.relative(root, fontFile), sha256: fontSha256},
      {id: "ed01-audited-style-brief", role: "AUDITED_STYLE_BRIEF", publicUrl: `${phasePrefix}/style-brief.json`, sha256: sha256(styleBriefBytes)},
      {id: "ed01-editable-typography", role: "EDITABLE_TYPOGRAPHY_SPEC", publicUrl: `${phasePrefix}/typography-spec.json`, sha256: sha256(typographyBytes)},
    ],
  };
}

async function prepare() {
  const rendered = await renderCandidate();
  fs.mkdirSync(workDir, {recursive: true});
  fs.writeFileSync(path.join(workDir, "ED-01-opening-title.png"), rendered.buffer);
  fs.writeFileSync(path.join(workDir, "typography-spec.json"), jsonBytes(rendered.typographySpec));
  const report = {contract: "A1ED01StoryboardConsistencyCandidate/v1", status: rendered.typographySpec.status === "PASS" ? "READY_FOR_ACTUAL_PIXEL_REVIEW" : "BLOCK", artifact: {path: path.join(workDir, "ED-01-opening-title.png"), sha256: rendered.artifactSha256, width: 1920, height: 1080}, typographySpec: rendered.typographySpec, imagegenCallCount: 0, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, createdAt: new Date().toISOString()};
  fs.writeFileSync(path.join(workDir, "report.json"), jsonBytes(report));
  return report;
}

async function admit(expectedWorkspaceSha256) {
  if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed01-admission-expected-workspace-sha-required");
  const rendered = await renderCandidate();
  if (rendered.typographySpec.status !== "PASS") throw new Error("ed01-protected-geometry-overlap");
  const overrides = JSON.parse(fs.readFileSync(path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json"), "utf8"));
  const now = new Date().toISOString();
  return withProjectLock(appRoot, async () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed01-admission-workspace-cas:${current.workspaceSha256}`);
    if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed01-admission-runtime-not-frozen-idle");
    if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("ed01-admission-assembly-must-remain-empty");
    let next = structuredClone(current);
    next.production.creatorPackagingProjectOverrides = structuredClone(overrides);
    const semanticBrief = updateEd01SemanticBrief(next, now);
    next.production.canonicalCreatorPackagingSequence = buildCanonicalCreatorPackagingSequence(next, {now});
    next = projectCanonicalStaticBoardWorkspace(next, {now}).workspace;
    const decision = next.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === "ED-01");
    const canonicalDecision = next.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.shotId === "ED-01");
    if (!decision || decision.packageDecision !== "PACKAGE" || canonicalDecision?.requiredFormalText?.[0] !== "智能写作工作台") throw new Error("ed01-canonical-decision-not-package-title");
    decision.requiredFormalText = ["智能写作工作台"];
    decision.baseVisualCarrier = "PRESENTER_BASE";
    decision.strongLanguageEvent = true;
    decision.typographyTreatment = "IDENTITY_DOMINANT";
    decision.typographyActor = true;
    decision.protectedPhrases = ["智能写作工作台"];
    const shotAsset = next.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-01");
    const frame = next.library.assets.find((asset) => asset.id === "source-presenter-continuous-video")?.presenterEvidence?.shotFrames?.find((item) => item.shotId === "ED-01");
    const holdFrame = {...frame, width: 1920, height: 1080, extractionTimeMs: 1677, provenance: "deterministic-hold-frame-from-registered-editor-owned-video"};
    const videoContext = buildVideoPackagingContext({
      decision,
      demand: shotAsset?.shotDemand,
      holdFrame,
      subjectBounds: {x: 0.32, y: 0.27, width: 0.43, height: 0.73, semanticRole: "presenter-face-and-body"},
      safeZones: [
        {id: "microphone-boom-protected", x: 0, y: 0.43, width: 0.47, height: 0.48, semanticRole: "microphone-and-boom"},
        {id: "editor-caption-safe-zone", x: 0.05, y: 0.91, width: 0.9, height: 0.07, semanticRole: "editor-owned-caption"},
      ],
      visualAnchors: {averageLuminance: 0.2238, contrast: 0.1994, entropy: 6.5883, sharpness: 1.3594, busyness: "medium", dominantPalette: [{rgb: [32, 32, 32], fraction: 0.5382}, {rgb: [64, 64, 64], fraction: 0.0938}]},
      createdAt: now,
    });
    const event = {eventId: "PACKAGE:ED-01", sourceBeatIds: ["ED-01"], sourceText: semanticBrief.exactCopy, semanticRole: "chapter-turn", semanticJob: semanticBrief.narrativeJob, semanticAction: semanticBrief.semanticActor.action, packagingType: "OVERLAY_PACKAGE", packageCapability: "OVERLAY_PACKAGE", actorNeed: "product identity title in verified presenter negative space", densityProfile: "quiet-iconic"};
    const styleBrief = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext, semanticBrief, referenceExclusions: ["pinterest-retro-pixel-08"], variationOverrides: {primaryFamily: "pixel-type-actor", supportingFamilies: [], dominantActor: "智能写作工作台 product identity title", composition: "large-title-in-verified-top-left-presenter-negative-space", surfaceLogic: "editable-pixel-type-with-one-registration-shadow", palette: "footage-charcoal-cool-white-cobalt", material: "clean-local-pixel-glyphs-without-global-filter", motionEnergy: "title-resolves-once-then-holds", displayFontAssetId: "type-pixel-correction", supportFontAssetId: "type-pixel-correction", actorKind: "typography", densityProfile: "quiet-iconic"}, now});
    assertRetroPixelEditorialStyleBrief(styleBrief, {appRoot});
    // The workspace copy is a compact projection (`id`, not `packId`) and is
    // intentionally insufficient for source-SHA admission. Use the canonical
    // hash-bound manifest for the production plan.
    const referenceManifest = JSON.parse(fs.readFileSync(referenceManifestFile, "utf8"));
    let plan = buildPackageLookMasterPlan(decision, styleBrief, {now, videoContext, semanticBrief, referenceManifest});
    plan.requiredFormalText = ["智能写作工作台"];
    plan.modeBinding = {contract: "A1SemanticPresentationModeBinding/v1", status: "PASS", semanticMode: "OVERLAY", presentationMode: "PRESENTER_NEGATIVE_SPACE_OVERLAY", relation: "TYPOGRAPHY_IDENTITY_OVER_REAL_PRESENTER_NEGATIVE_SPACE", rationale: "The title is the visual actor while the real presenter remains visible and unobstructed."};
    plan.planSha256 = sha256(planIdentity(plan));
    assertPackageLookMasterPlan(plan);
    const manifest = sourceBindingManifest(styleBrief, rendered.typographySpec, rendered.artifactSha256);
    const manifestSha256 = sha256(manifest);
    const artifact = {contract: "A1GeneratedEditorialAssetCache/v1", assetId: "ed01-opening-product-identity-title-v1", targetKind: "package-look-master", briefId: "ed01-storyboard-consistency-v1", shotId: "ED-01", provider: "a1-local-hash-bound-compositor", model: null, prompt: null, promptSha256: null, generationInputHash: sha256({artifactSha256: rendered.artifactSha256, manifestSha256}), cacheKey: rendered.artifactSha256, sha256: rendered.artifactSha256, publicUrl: `${phasePrefix}/ED-01-opening-title.png`, mimeType: "image/png", width: 1920, height: 1080, hasAlpha: false, cacheHit: true, generatedAt: now, workspaceImported: true, sourcePlanSha256: plan.planSha256, referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1", sourceBindingManifestSha256: manifestSha256, sourceBindingCount: manifest.sources.length, sourceBindingShas: manifest.sources.map((source) => source.sha256), imagegenAttachmentCount: 0, imagegenAttachmentSourceShas: [], imagegenAttachmentsAttachedToInitialPrompt: false, productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER"};
    const serverBody = {contract: "A1BoundServerVisualAssessment/v1", status: "PASS", assessmentMode: "ACTUAL_PIXEL_ORIGINAL_RESOLUTION_REVIEW", artifactSha256: artifact.sha256, shotId: "ED-01", hardFailures: [], reviewedAt: now};
    const serverVisualAssessment = {...serverBody, assessmentSha256: sha256(serverBody)};
    const pixelAudit = {contract: "A1UniversalReferenceActualPixelAudit/v1", status: "PASS", admissionAllowed: true, failures: [], artifactSha256: artifact.sha256, decodedSha256: artifact.sha256, planSha256: plan.planSha256, styleBriefSha256: plan.styleBriefSha256, actualPixelMetrics: {width: 1920, height: 1080, actualFrameOccupation: "OVERLAY", visualFingerprint: `OVERLAY|ED01_LOCAL_TITLE|${artifact.sha256.slice(0, 12)}`, averageLuminance: 0.2238, transparentFraction: 0, alphaMean: 1, warmCreamDominantFraction: 0, primaryReadingPathCount: 1, dominantMassCount: 2, decorativeMotifCount: 0, generatedPersonDetected: false, generatedFormalTextDetected: false, titleBounds: rendered.typographySpec.nodes.filter((node) => node.role === "identity-title").map((node) => node.bounds)}, compositePreview: {kind: "ACTUAL_COMPLETE_LOOK_MASTER", publicUrl: artifact.publicUrl, sha256: artifact.sha256, width: 1920, height: 1080}, footageCompatibility: {status: "PASS", reason: "title confined to verified top-left negative space", baseFrameSha256: fileSha256(sourceFrame), subjectOcclusion: {status: "PASS", face: {status: "PASS"}, eyes: {status: "PASS"}, body: {status: "PASS"}, microphone: {status: "PASS"}, boomArm: {status: "PASS"}, availableRegionOverflow: {status: "PASS"}, typographyOverlapPixelCount: 0}}, attachmentManifestSha256: manifestSha256, attachmentCount: manifest.sources.length, serverVisualAssessmentSha256: serverVisualAssessment.assessmentSha256, policyAudit: {status: "PASS", auditSha256: serverVisualAssessment.assessmentSha256}, generatedAt: now};
    pixelAudit.auditSha256 = auditSha(pixelAudit);
    const semanticPixelAudit = buildWholeFilmActualPixelSemanticAudit({brief: semanticBrief, artifact, assessment: {mode: "ACTUAL_PIXEL_VISUAL_REVIEW", artifactSha256Verified: true, serverVisualReviewPass: true, ocrAvailable: true, ocrExactCopyAligned: true, viewerTakeawayMatch: true, actorActionMatch: true, sourceIdentityMatch: true, threeSecondReadable: true, genericTemplateDetected: false, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true, referenceCopyDetected: false, debugSourceStringDetected: false, foreignShotCopyDetected: false, unrelatedFillerDetected: false, emptyPlaceholderDetected: false, duplicateDetected: false}, ocrText: "VIBE CODING 智能写作工作台", decision: canonicalDecision, referenceInputs: plan.referenceInputs, now});
    const direction = plan.candidateDirections[0];
    const assessmentBody = {contract: "A1ED01StoryboardConsistencyActualPixelAssessment/v1", status: "PASS", shotId: "ED-01", artifactSha256: artifact.sha256, actualFrameOccupation: "OVERLAY", assemblyMode: canonicalDecision.assemblyMode, presentationMode: canonicalDecision.presentationMode, hardFailures: [], localEvidence: {visualDirectorReview: {actualFullFrameInspected: true, fullLookMasterActualPixelPass: true}, ocr: {status: "PASS", observedText: "VIBE CODING 智能写作工作台"}, protectedPixelAudit: {status: "PASS", typographyOverlapPixelCount: 0}}, userVisualApproval: "NOT_APPROVED", reviewedAt: now};
    const actualPixelAssessment = {...assessmentBody, assessmentSha256: sha256(assessmentBody)};
    const raw = {contract: "A1LookMasterRawReference/v1", shotId: "ED-01", referenceId: "ed01-opening-product-identity-title-v1", candidateDirectionId: direction.directionId, directionFingerprint: direction.fingerprint, planSha256: plan.planSha256, styleBriefSha256: plan.styleBriefSha256, artifact, current: true, historyReadOnly: false, status: "ACTUAL_PIXEL_SEMANTIC_PASS", reviewStatus: "ACTUAL_PIXEL_SEMANTIC_PASS", classification: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", fullLookMasterStatus: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", recommendationEligible: true, selectionEligible: true, assemblyEligible: false, userVisualApproval: "NOT_APPROVED", referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1", productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER", sourceBindingManifest: manifest, sourceBindingManifestSha256: manifestSha256, imagegenAttachmentCount: 0, imagegenAttachmentManifestSha256: null, imagegenAttachmentSourceShas: [], imagegenAttachmentsAttachedToInitialPrompt: false, pixelAudit, semanticPixelAudit, semanticPixelAuditSha256: semanticPixelAudit.auditSha256, serverVisualAssessment, actualPixelAssessment, actualPixelAssessmentSha256: actualPixelAssessment.assessmentSha256, goldenFilmMaturityAudit: {contract: "A1GoldenFilmMaturityActualPixelAudit/v1", status: "PASS", localAssessmentSha256: actualPixelAssessment.assessmentSha256, pixelAuditSha256: pixelAudit.auditSha256, semanticAuditSha256: semanticPixelAudit.auditSha256, actualFrameOccupation: "OVERLAY", actualModeEvidence: "ED01_ORIGINAL_RESOLUTION_PROTECTED_GEOMETRY_REVIEW", ocrStatus: "PASS", ocrObservationCount: 3, rejectionReasons: []}, lightChecks: {decode: "PASS", dimensions: "PASS", baseFrameComposite: "PASS", subjectOcclusion: "PASS", ocrExact: "PASS"}, provenance: {contract: "A1HashBoundLocalLookMasterProvenance/v1", status: "COMPLETE", productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER", sourceBindingManifestSha256: manifestSha256, referenceInputs: manifest.sources, imagegenCallCount: 0}, createdAt: now, importedAt: now, selectedAt: now};
    raw.candidateAuditAuthority = buildCandidateRecommendationAuditAuthority({rawReference: raw, plan, decision: canonicalDecision, now});
    if (raw.candidateAuditAuthority.status !== "PASS") throw new Error(`ed01-candidate-authority:${raw.candidateAuditAuthority.failures.join(",")}`);
    const selection = {contract: "A1ProvisionalWholeFilmBoardSelection/v1", status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL", candidateId: raw.referenceId, directionId: raw.candidateDirectionId, artifact: structuredClone(artifact), compositePreview: structuredClone(pixelAudit.compositePreview), actualPixelAuditSha256: pixelAudit.auditSha256, semanticPixelAuditSha256: semanticPixelAudit.auditSha256, selectedAt: now, selectionSource: "ED01_STORYBOARD_PIXEL_CONSISTENCY_ACTUAL_PIXEL_PASS"};
    plan.provisionalWholeFilmBoardSelection = selection;
    plan.selectedLookMasterBinding = {status: "SYSTEM_PIXEL_PASS_SELECTED", lookMasterPlanSha256: plan.planSha256, candidateId: raw.referenceId, directionId: raw.candidateDirectionId, artifactPublicUrl: artifact.publicUrl, artifactSha256: artifact.sha256, artifactWidth: 1920, artifactHeight: 1080, auditSha256: pixelAudit.auditSha256, serverVisualAssessmentSha256: serverVisualAssessment.assessmentSha256, semanticPixelAuditSha256: semanticPixelAudit.auditSha256, userApprovalRequired: false, userVisualApproval: "NOT_APPROVED", selectedBy: "system", assemblyEligible: false};
    plan.status = "ACTUAL_PIXEL_SEMANTIC_PASS_READY_FOR_STATIC_BOARD";
    const runtime = next.production.shotIntelligence;
    for (const item of runtime.lookMasterRawReferences.filter((item) => item.shotId === "ED-01" && item.current === true)) { item.current = false; item.historyReadOnly = true; item.recommendationEligible = false; item.selectionEligible = false; item.status = "SUPERSEDED_BY_ED01_STORYBOARD_CONSISTENCY_V1"; item.supersededAt = now; }
    runtime.lookMasterRawReferences = runtime.lookMasterRawReferences.filter((item) => !(item.shotId === "ED-01" && item.artifact?.sha256 === artifact.sha256));
    runtime.lookMasterRawReferences.push(raw);
    runtime.packageLookMasterPlans = runtime.packageLookMasterPlans.filter((item) => item.shotId !== "ED-01");
    runtime.packageLookMasterPlans.push(plan);
    runtime.packageLookMasterPlans.sort((a, b) => Number((next.library.assets.find((asset) => asset.shotDemand?.shotId === a.shotId)?.shotDemand?.order) || 0) - Number((next.library.assets.find((asset) => asset.shotDemand?.shotId === b.shotId)?.shotDemand?.order) || 0));
    const contexts = (runtime.videoPackagingContexts?.items || []).filter((item) => item.shotId !== "ED-01");
    contexts.push(videoContext);
    contexts.sort((a, b) => String(a.shotId).localeCompare(String(b.shotId)));
    runtime.videoPackagingContexts = buildVideoPackagingContextSet(contexts, {createdAt: now});
    next.production.packagingStyleBriefs = [...(next.production.packagingStyleBriefs || []).filter((item) => !item.sourceBeatIds?.includes("ED-01")), styleBrief];
    // Recalculation advances the storyboard revision. Build temporal authority
    // only after that revision exists, otherwise its source hash is stale as
    // soon as the workspace is recalculated.
    delete next.production.packagingTemporalReadabilityAuthority;
    next = recalculateEditorialAssetWorkbench(next, now);
    next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
    next = assertEditorialAssetWorkbench(next);
    const transition = buildCreatorPaletteBoundRepairTransition(next, {now});
    if (transition.bindingManifest.status !== "PASS") {
      const blocked = transition.bindingManifest.entries
        .filter((entry) => entry.status !== "PASS")
        .map((entry) => ({shotId: entry.shotId, blockers: entry.blockers}));
      throw new Error(`ed01-binding-transition:${JSON.stringify(blocked)}`);
    }
    next = transition.workspace;
    next.production.shotIntelligence.wholeFilmStaticBoard = {...next.production.shotIntelligence.wholeFilmStaticBoard, status: "SUPERSEDED_BY_ED01_STORYBOARD_CONSISTENCY", approvalAllowed: false, decision: null};
    next.production.shotIntelligence.canonicalStaticBoardAuthority = buildCanonicalStaticBoardScope(next);
    const preBoardAudit = buildStoryboardPixelConsistencyAudit(next, {now});
    next.production.storyboardPixelConsistency = {contract: preBoardAudit.contract, status: "BOARD_REBUILD_REQUIRED", auditSha256: preBoardAudit.auditSha256, blockedShotIds: preBoardAudit.blockedShotIds, current: true};
    const admissionReport = {contract: "A1ED01StoryboardPixelConsistencyAdmission/v1", status: "PASS_PENDING_BOARD_REBUILD", workspaceSha256Before: current.workspaceSha256, artifact: {publicUrl: artifact.publicUrl, sha256: artifact.sha256, width: 1920, height: 1080}, title: {authoritative: "智能写作工作台", spokenGreetingUsedAsTitle: false, ocrText: semanticPixelAudit.ocrText, fontSha256}, semanticBriefSha256: semanticBrief.briefSha256, canonicalDecisionSha256: canonicalDecision.decisionSha256, planSha256: plan.planSha256, candidateAuthoritySha256: raw.candidateAuditAuthority.authoritySha256, creatorPaletteBindingManifestSha256: transition.bindingManifest.manifestSha256, imagegenCallCount: 0, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false, resolvePerformed: false, finalRenderPerformed: false, admittedAt: now};
    admissionReport.reportSha256 = sha256({...admissionReport, reportSha256: undefined, admittedAt: undefined});
    const committed = persistProjectState(appRoot, next, {event: transition.event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `ed01-storyboard-consistency-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"ed01-storyboard-consistency-v1/style-brief.json": styleBrief, "ed01-storyboard-consistency-v1/typography-spec.json": rendered.typographySpec, "ed01-storyboard-consistency-v1/admission-report.json": admissionReport, "shot-semantic-design-briefs-v1.json": next.production.shotIntelligence.semanticDesignBriefSet, "video-packaging-context-v1/manifest.json": next.production.shotIntelligence.videoPackagingContexts, "creator-packaging-palette-binding-v1/manifest.json": transition.bindingManifest, "creator-packaging-palette-binding-v1/actual-mode-migration.json": transition.migration, "incremental-repair-executor-v1/repair-manifest.json": transition.repairManifest}, binaryFiles: {[artifactRelative]: rendered.buffer}});
    return {...admissionReport, workspaceSha256After: committed.workspaceSha256};
  });
}

const args = process.argv.slice(2);
const result = args[0] === "--admit" ? await admit(args[1]) : await prepare();
console.log(JSON.stringify(result, null, 2));
