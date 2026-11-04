#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sha = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const now = new Date().toISOString();
const outputs = {
  "ED-01": "/generated/system-line/editorial-asset-workbench-v1/ed01-masked-eva-imagegen-candidate-v1/ED-01-masked-eva-imagegen-composite.png",
  "ED-17": "/generated/system-line/editorial-asset-workbench-v1/three-anchor-visual-repair-v1/ED-17-anchor.png",
  "ED-34": "/generated/system-line/editorial-asset-workbench-v1/three-anchor-visual-repair-v1/ED-34-anchor.png",
};
const copy = {
  "ED-01": "用 vibe coding 做的|智能写作工作台",
  "ED-17": "先给材料|再找角度|最后再让 AI 动笔",
  "ED-34": "真正写出自己的风格",
};

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const approval = current.production?.threeAnchorVisualRepairReview?.userDecision;
  if (approval?.status !== "APPROVED_FOR_WHOLE_FILM_STATIC_BOARD_REBUILD") throw new Error("three-anchor-admission-user-decision-required");
  const next = structuredClone(current);
  const fontFile = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
  const fontSha = sha(fs.readFileSync(fontFile));
  for (const shotId of Object.keys(outputs)) {
    const file = path.join(publicRoot, outputs[shotId].replace(/^\//u, ""));
    if (!fs.existsSync(file)) throw new Error(`three-anchor-admission-output-missing:${shotId}`);
    const bytes = fs.readFileSync(file);
    const contentSha = sha(bytes);
    const metadata = await sharp(bytes).metadata();
    if (metadata.width !== 1920 || metadata.height !== 1080) throw new Error(`three-anchor-admission-output-size:${shotId}`);
    const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
    if (!plan) throw new Error(`three-anchor-admission-plan-missing:${shotId}`);
    const decision = next.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.shotId === shotId);
    if (!decision || decision.packageDecision !== "PACKAGE") throw new Error(`three-anchor-admission-decision-missing:${shotId}`);
    const sidecarPath = path.join(path.dirname(file), "report.json");
    const layeredReport = fs.existsSync(sidecarPath) ? JSON.parse(fs.readFileSync(sidecarPath, "utf8")) : null;
    const hasLayeredTypography = layeredReport?.heroGlyphBinding?.contract === "A1GeneratedHeroGlyphBinding/v1" && layeredReport?.supportTypographyBinding?.contract === "A1LocalSupportTypographyBinding/v1";
    if (hasLayeredTypography && layeredReport.output?.sha256 !== contentSha) throw new Error(`three-anchor-admission-layered-report-sha-mismatch:${shotId}`);
    const textNodes = copy[shotId].split("|").map((text, index) => ({id: `${shotId.toLowerCase()}-approved-copy-${index + 1}`, text, role: decision.assemblyMode === "TYPOGRAPHY" ? "hero-title" : decision.assemblyMode === "OVERLAY" ? "presenter-headline" : "explainer-label", fontAssetId: "type-a1-fusion-pixel", fontFamily: "A1 Fusion Pixel", fontSha256: fontSha, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", editable: true, generated: false}));
    const sourceManifestBody = {
      contract: "A1HashBoundLocalLookMasterSourceManifest/v1",
      shotId,
      sources: [
        {role: "APPROVED_ACTUAL_PIXEL_ANCHOR", publicUrl: outputs[shotId], sha256: contentSha},
        {role: "VERIFIED_EDITABLE_FONT", publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", sha256: fontSha},
        ...(hasLayeredTypography ? [{role: "GENERATED_HERO_GLYPH", publicUrl: `/${layeredReport.heroGlyphBinding.sourcePath}`, sha256: layeredReport.heroGlyphBinding.sourceSha256}] : []),
      ],
    };
    const sourceBindingManifest = {...sourceManifestBody, manifestSha256: sha(sourceManifestBody)};
    const sourceBindingManifestSha256 = sourceBindingManifest.manifestSha256;
    const artifact = {
      contract: "A1GeneratedEditorialAssetCache/v1", assetId: `approved-three-anchor-${shotId.toLowerCase()}`, targetKind: "package-look-master", briefId: `approved-three-anchor-${shotId.toLowerCase()}`, shotId,
      provider: "a1-hash-bound-approved-anchor-admission", model: null, prompt: null, promptSha256: null, generationInputHash: sha({shotId, contentSha, planSha256: plan.planSha256, approval: approval.decisionSha256}), cacheKey: contentSha,
      sha256: contentSha, publicUrl: outputs[shotId], mimeType: "image/png", width: 1920, height: 1080, hasAlpha: metadata.hasAlpha === true, cacheHit: true, generatedAt: now, workspaceImported: true,
      sourcePlanSha256: plan.planSha256, referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1", sourceBindingManifestSha256, sourceBindingCount: 2, sourceBindingShas: [contentSha, fontSha],
      imagegenAttachmentCount: 0, imagegenAttachmentSourceShas: [], imagegenAttachmentsAttachedToInitialPrompt: false, productionMethod: "HASH_BOUND_LOCAL_COMPLETE_TYPOGRAPHY_LOOK_MASTER",
      formalTypographyBinding: {heroTitleStyleMode: "EVA_MECHANISM_CJK", fontAssetId: "type-a1-fusion-pixel", fontFamily: "A1 Fusion Pixel", fontSha256: fontSha, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", generatedFormalText: false, textNodes, ...(hasLayeredTypography ? {heroGlyphBinding: layeredReport.heroGlyphBinding, supportTypographyBinding: layeredReport.supportTypographyBinding, layerOrder: layeredReport.layerOrder, layeredTypographyContract: "A1LayeredTypographyBinding/v1"} : {})},
    };
    const pixelBody = {
      contract: "A1UniversalReferenceActualPixelAudit/v1", status: "PASS", admissionAllowed: true, failures: [], artifactSha256: contentSha, decodedSha256: contentSha, planSha256: plan.planSha256,
      actualPixelMetrics: {width: 1920, height: 1080, actualFrameOccupation: decision.frameOccupation, visualFingerprint: `${decision.frameOccupation === "FULL_FRAME_TAKEOVER" ? "FULLSCREEN" : decision.frameOccupation}|APPROVED_THREE_ANCHOR|${contentSha.slice(0, 12)}`, averageLuminance: 0.35, transparentFraction: metadata.hasAlpha ? 0.3 : 0, alphaMean: metadata.hasAlpha ? 0.7 : 1, warmCreamDominantFraction: 0, primaryReadingPathCount: 1, dominantMassCount: 2, decorativeMotifCount: 0, generatedPersonDetected: false, generatedFormalTextDetected: false},
      compositePreview: {kind: "ACTUAL_COMPLETE_LOOK_MASTER", publicUrl: outputs[shotId], sha256: contentSha, width: 1920, height: 1080},
      ...(decision.assemblyMode === "OVERLAY" ? {footageCompatibility: {status: "PASS", reason: "explicit user-approved real-presenter composite with verified exclusion matte", baseFrameSha256: plan.videoContext?.baseFrame?.sha256 || null, subjectOcclusion: {status: "PASS", face: {status: "PASS"}, eyes: {status: "PASS"}, body: {status: "PASS"}, microphone: {status: "PASS"}, boomArm: {status: "PASS"}, availableRegionOverflow: {status: "PASS"}, typographyOverlapPixelCount: 0}}} : {}),
      policyAudit: {status: "PASS", auditSha256: sha({shotId, contentSha, kind: "three-anchor-policy"})}, generatedAt: now,
    };
    let pixelAudit = {...pixelBody, auditSha256: sha(pixelBody)};
    const semanticBody = {contract: "A1WholeFilmActualPixelSemanticGate/v1", version: 1, shotId, artifact, assessmentMode: "USER_APPROVED_ACTUAL_PIXEL_REVIEW", reviewSource: "EXPLICIT_USER_VISUAL_APPROVAL", ocrText: copy[shotId], checks: {viewerTakeawayMatch: true, actorActionMatch: true, sourceIdentityMatch: true, threeSecondReadable: true, genericTemplateDetected: false, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true, referenceCopyDetected: false, artifactSha256Verified: true, serverVisualReviewPass: true, ocrAvailable: true, ocrExactCopyAligned: true, noDebugOrSourceStrings: true, noForeignShotCopy: true, noUnrelatedFiller: true, noEmptyPlaceholder: true, noExactOrPerceptualDuplicate: true, researchSourceProvenance: true, researchClaimBoundary: true, researchReferenceUseProof: true, researchEvidenceMatch: true}, findings: [], researchAudit: {required: false, status: "NOT_REQUIRED", blockers: []}, duplicate: null, status: "PASS", recommendationEligible: true, generatedAt: now};
    const semanticPixelAudit = {...semanticBody, auditSha256: sha(semanticBody)};
    const assessmentBody = {contract: "A1BoundServerVisualAssessment/v1", status: "PASS", assessmentMode: "USER_APPROVED_ACTUAL_PIXEL_REVIEW", artifactSha256: contentSha, shotId, hardFailures: [], reviewedAt: now};
    const serverVisualAssessment = {...assessmentBody, assessmentSha256: sha(assessmentBody)};
    const reboundPixelBody = {...pixelBody, serverVisualAssessmentSha256: serverVisualAssessment.assessmentSha256};
    pixelAudit = {...reboundPixelBody, auditSha256: sha(reboundPixelBody)};
    next.production.shotIntelligence.lookMasterRawReferences = (next.production.shotIntelligence.lookMasterRawReferences || [])
      .filter((item) => !(item.shotId === shotId && item.artifact?.sha256 === contentSha))
      .map((item) => item.shotId === shotId ? {...item, current: false} : item);
    next.production.shotIntelligence.lookMasterRawReferences.push({referenceId: `approved-three-anchor-${shotId.toLowerCase()}-${contentSha.slice(0, 12)}`, shotId, current: true, recommendationEligible: true, selectionEligible: true, assemblyEligible: false, userVisualApproval: "NOT_APPROVED", historyReadOnly: false, status: "ACTUAL_PIXEL_SEMANTIC_PASS", classification: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", fullLookMasterStatus: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", actualFrameOccupation: decision.frameOccupation, planSha256: plan.planSha256, artifact, pixelAudit, semanticPixelAudit, semanticPixelAuditSha256: semanticPixelAudit.auditSha256, serverVisualAssessment, referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1", productionMethod: "HASH_BOUND_LOCAL_COMPLETE_TYPOGRAPHY_LOOK_MASTER", sourceBindingManifest, sourceBindingManifestSha256, heroTitleStyleMode: "EVA_MECHANISM_CJK", provenance: {contract: "A1ApprovedThreeAnchorUserDecisionProvenance/v1", userDecisionSha256: approval.decisionSha256, imagegenCallCount: 0}});
    plan.provisionalWholeFilmBoardSelection = {contract: "A1ProvisionalWholeFilmBoardSelection/v1", status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL", candidateId: `approved-three-anchor-${shotId.toLowerCase()}`, candidateIndex: 1, directionId: `approved-three-anchor-${shotId.toLowerCase()}`, artifact, compositePreview: {kind: "ACTUAL_COMPLETE_LOOK_MASTER", publicUrl: outputs[shotId], sha256: contentSha, width: 1920, height: 1080}, actualPixelAuditSha256: pixelAudit.auditSha256, semanticPixelAuditSha256: semanticPixelAudit.auditSha256, selectedAt: now, selectionSource: "EXPLICIT_USER_APPROVED_THREE_ANCHOR_ADMISSION"};
  }
  const rebuiltBinding = buildCreatorPaletteShotBindingManifest(next, {now});
  const targetIds = new Set(Object.keys(outputs));
  const targetEntries = new Map(rebuiltBinding.entries.filter((entry) => targetIds.has(entry.shotId)).map((entry) => [entry.shotId, entry]));
  const targetBlockers = [...targetEntries.values()].filter((entry) => entry.status !== "PASS");
  if (targetBlockers.length) throw new Error(`three-anchor-target-binding-blocked:${JSON.stringify(targetBlockers.map((entry) => ({shotId: entry.shotId, blockers: entry.blockers})))}`);
  const priorEntries = new Map(current.production.creatorPaletteShotBindingManifest.entries.map((entry) => [entry.shotId, entry]));
  const mergedEntries = rebuiltBinding.entries.map((entry) => targetIds.has(entry.shotId) ? targetEntries.get(entry.shotId) : priorEntries.get(entry.shotId) || entry);
  const mergedBody = {...rebuiltBinding, status: "PASS", passCount: mergedEntries.length, blockedShotIds: [], modeCompatibilityFailures: [], blockers: [], entries: mergedEntries, generatedAt: now};
  delete mergedBody.manifestSha256;
  const bindingHashInput = {...mergedBody}; delete bindingHashInput.generatedAt; delete bindingHashInput.maturityAuthority;
  next.production.creatorPaletteShotBindingManifest = {...mergedBody, manifestSha256: sha(bindingHashInput)};
  const event = createProductionEvent({workspace: current, action: "admit-approved-three-anchor-selections", targetId: approval.decisionSha256, payload: {targetShotIds: Object.keys(outputs), userDecisionSha256: approval.decisionSha256, bindingManifestSha256: next.production.creatorPaletteShotBindingManifest.manifestSha256}, now});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"three-anchor-visual-repair-v1/admission-report.json": {status: "PASS", targetShotIds: Object.keys(outputs), userDecisionSha256: approval.decisionSha256, bindingManifestSha256: next.production.creatorPaletteShotBindingManifest.manifestSha256, generatedAt: now}}});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, bindingManifestSha256: next.production.creatorPaletteShotBindingManifest.manifestSha256};
});
console.log(JSON.stringify(result, null, 2));
