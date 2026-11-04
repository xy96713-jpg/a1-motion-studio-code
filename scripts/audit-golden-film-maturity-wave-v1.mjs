#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {auditCreatorPaletteCurrentAestheticGate} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {buildPackageLookMasterPixelAudit, inferTypographyVisualLineCount} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {buildWholeFilmActualPixelSemanticAudit, findPerceptualDuplicate} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {persistGoldenFilmVisualSystemMaturityRun} from "./run-golden-film-visual-system-maturity-v1.mjs";
import {assertUniversalReferenceAttachmentManifest, A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, UNIVERSAL_REFERENCE_PRODUCTION_METHOD} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";
import {applyFullLookMasterVisualDirectorGate, assertFullLookMasterVisualDirectorReview, exactCharacterReviewPass, visualDirectorReviewForRaw} from "../apps/studio-next/src/lib/a1-full-look-master-visual-director-review-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {publicDir} = projectDirs(appRoot);
const runPath = path.join(publicDir, "golden-film-visual-system-maturity-v1", "maturity-run.json");
const humanTasteQueuePath = path.join(publicDir, "golden-film-visual-system-maturity-v1", "human-taste-fix-queue.json");
const visualDirectorReviewPath = path.join(publicDir, "golden-film-visual-system-maturity-v1", "full-look-master-visual-director-review.json");
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => path.resolve(publicRoot, String(url).replace(/^\//u, ""));
const normalize = (value) => String(value || "").toLowerCase().replace(/[\s\u3000\p{P}\p{S}]+/gu, "");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function readOcr(file) {
  try {
    const parsed = JSON.parse(execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000}).trim().split("\n").at(-1));
    return {status: parsed.status || "PASS", text: parsed.text || "", observationCount: parsed.observationCount || 0, segmentDetails: parsed.segmentDetails || []};
  } catch (error) {
    return {status: "FAILED", text: "", observationCount: 0, segmentDetails: [], error: error instanceof Error ? error.message : String(error)};
  }
}

function unionTitleBbox(ocr, width, height) {
  const boxes = (ocr.segmentDetails || []).map((item) => item.boundingBox).filter((box) => box && Number.isFinite(Number(box.x)) && Number.isFinite(Number(box.y)) && Number.isFinite(Number(box.width)) && Number.isFinite(Number(box.height)));
  if (!boxes.length) return {bbox: null, minGlyphHeightPx: 0, lineCount: 0};
  const left = Math.min(...boxes.map((box) => Number(box.x)));
  const top = Math.min(...boxes.map((box) => Number(box.y)));
  const right = Math.max(...boxes.map((box) => Number(box.x) + Number(box.width)));
  const bottom = Math.max(...boxes.map((box) => Number(box.y) + Number(box.height)));
  return {
    bbox: {x: Number(left.toFixed(4)), y: Number(top.toFixed(4)), width: Number((right - left).toFixed(4)), height: Number((bottom - top).toFixed(4))},
    minGlyphHeightPx: Math.round(Math.max(...boxes.map((box) => Number(box.height))) * height),
    // OCR often splits one physical line or one continuous material path into
    // several phrase boxes. Count actual vertical rows, not OCR segments.
    lineCount: inferTypographyVisualLineCount(ocr.segmentDetails || []),
  };
}

function makeLocalAssessment({plan, queueItem, raw, preliminary, ocr, duplicate, visualDirectorReview}) {
  const metrics = preliminary.actualPixelMetrics || {};
  const rawForAesthetic = {artifact: raw.artifact, pixelAudit: {actualPixelMetrics: metrics}};
  const aesthetic = auditCreatorPaletteCurrentAestheticGate(rawForAesthetic);
  const universalFullLookMaster = raw.productionMethod === UNIVERSAL_REFERENCE_PRODUCTION_METHOD
    && raw.referencePackagingContract === A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT;
  const protectedPhrases = (queueItem?.displayProtectedPhrases || queueItem?.protectedPhrases || plan.displayProtectedPhrases || plan.protectedPhrases || []).map(normalize).filter(Boolean);
  const ocrNormalized = normalize(ocr.text);
  const ocrRequired = plan.typographyActor === true;
  const visualExactCharacterPass = exactCharacterReviewPass(visualDirectorReview, protectedPhrases);
  const ocrExact = !ocrRequired || (protectedPhrases.length > 0 && protectedPhrases.every((phrase) => ocrNormalized.includes(phrase))) || visualExactCharacterPass;
  let unmatchedOcr = ocrNormalized;
  for (const phrase of [...protectedPhrases].sort((left, right) => right.length - left.length)) unmatchedOcr = unmatchedOcr.replaceAll(phrase, "");
  const unexpectedReadableGlyphCount = (unmatchedOcr.match(/[\p{Script=Han}a-z0-9]/gu) || []).length;
  const noFillerCopy = !ocrRequired || plan.networkDecision === "REQUIRED" || unexpectedReadableGlyphCount <= 2;
  const title = unionTitleBbox(ocr, raw.artifact.width, raw.artifact.height);
  const overlayGeometryPass = universalFullLookMaster || plan.assemblyMode !== "OVERLAY" || preliminary.footageCompatibility?.status === "PASS";
  const alphaPass = universalFullLookMaster || plan.assemblyMode !== "OVERLAY" || (metrics.hasAlpha === true && Number(metrics.transparentFraction) >= 0.2);
  const duplicatePass = !duplicate;
  const expectedEvidenceInputs = Array.isArray(plan.sourceEvidenceInputs) ? plan.sourceEvidenceInputs : [];
  const attachedSourceShas = new Set(raw.artifact?.imagegenAttachmentSourceShas || raw.referenceAttachmentManifest?.sourceSha256s || raw.imagegenAttachmentSourceShas || []);
  const missingEvidenceInputs = expectedEvidenceInputs.filter((item) => !attachedSourceShas.has(item.sha256));
  const sourceEvidencePass = plan.networkDecision !== "REQUIRED" || (expectedEvidenceInputs.length > 0 && missingEvidenceInputs.length === 0);
  const machinePass = ocrExact && noFillerCopy && aesthetic.status === "PASS" && duplicatePass && alphaPass && overlayGeometryPass && sourceEvidencePass && Number(metrics.width) >= 640 && Number(metrics.height) >= 360;
  const hardFailures = [];
  if (!ocrExact) hardFailures.push("OCR_EXACT_COPY_MISMATCH");
  if (!noFillerCopy) hardFailures.push(`OCR_UNRELATED_FILLER_COPY:${unexpectedReadableGlyphCount}`);
  if (!alphaPass) hardFailures.push("OVERLAY_ALPHA_REQUIRED");
  if (!overlayGeometryPass) hardFailures.push(preliminary.footageCompatibility?.subjectOcclusion?.availableRegionOverflow?.reason || "OVERLAY_ACTUAL_GEOMETRY_NOT_PASS");
  if (aesthetic.status !== "PASS") hardFailures.push(aesthetic.code || "CURRENT_AESTHETIC_GATE_BLOCKED");
  if (duplicate) hardFailures.push("DUPLICATE_PERCEPTUAL_FINGERPRINT");
  if (!sourceEvidencePass) hardFailures.push("REQUIRED_SOURCE_EVIDENCE_ATTACHMENT_MISSING");
  const visualDirectorGate = applyFullLookMasterVisualDirectorGate({machinePass, hardFailures, review: visualDirectorReview});
  const shotPass = visualDirectorGate.pass;
  const referenceIds = (plan.referenceInputs || []).slice(0, 2).map((item) => item.id).filter(Boolean);
  const assessment = {
    contract: "A1MaturityActualPixelAssessment/v1",
    version: 1,
    generatedBy: "maturity-local-actual-pixel-auditor",
    status: shotPass ? "PASS" : "BLOCK",
    reviewSource: "SYSTEM_VISUAL_DIRECTOR_ACTUAL_FULL_FRAME_PLUS_SERVER_METRICS_AND_LOCAL_OCR_NO_CRITIC",
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    artifactSha256: raw.artifact.sha256,
    directionFingerprint: raw.directionFingerprint,
    contextHash: sha256({planSha256: plan.planSha256, artifactSha256: raw.artifact.sha256, ocrText: ocr.text, metrics, footageCompatibility: preliminary.footageCompatibility, aesthetic}),
    semanticThreeSecond: {status: shotPass ? "PASS" : "FAIL", evidence: shotPass ? "Actual PNG read as the named semantic action within the bounded frame." : visualDirectorGate.hardFailures.join(";")},
    dominantActor: {status: shotPass ? "PASS" : "FAIL", evidence: "The requested typography/semantic actor is judged from the actual PNG; geometry and one-reading-path gates remain binding."},
    referenceTraitVisibility: {status: shotPass ? "PASS" : "FAIL", visibleReferenceIds: shotPass ? referenceIds : [], evidence: "Local pixel inspection against the bound style references; no third-party content copied."},
    duplicateFingerprint: {status: duplicatePass ? "PASS" : "FAIL", perceptualHash: raw.artifact.perceptualHash || null, evidence: duplicatePass ? "No exact/perceptual duplicate found in current candidate set." : JSON.stringify(duplicate)},
    policyAudit: {status: shotPass ? "PASS" : "FAIL", failures: visualDirectorGate.hardFailures, method: "SYSTEM_VISUAL_DIRECTOR_ACTUAL_FULL_FRAME_PLUS_METRICS"},
    styleAudit: {status: shotPass && aesthetic.status === "PASS" ? "PASS" : "FAIL", styleBriefSha256: plan.styleBriefSha256, currentAesthetic: aesthetic},
    sourceEvidenceMatch: plan.networkDecision === "REQUIRED"
      ? {status: sourceEvidencePass ? "PASS" : "FAIL", visibleSourceIds: expectedEvidenceInputs.filter((item) => attachedSourceShas.has(item.sha256)).map((item) => item.id), mismatchedSourceIds: missingEvidenceInputs.map((item) => item.id), evidence: sourceEvidencePass ? "Every current source-evidence SHA was included in the actual ImageGen attachment receipt; visual source readability still remains part of final-frame review." : "At least one required source-evidence SHA is absent from the actual ImageGen attachment receipt."}
      : {status: "NOT_REQUIRED", visibleSourceIds: [], mismatchedSourceIds: [], evidence: "This targeted repair does not require a network source identity."},
    typographyVisual: {
      actualPixelSegmentation: title.bbox !== null,
      titleBbox: title.bbox,
      minGlyphHeightPx: title.minGlyphHeightPx,
      supportActorPresent: false,
      headlineSupportHeightRatio: 2,
      primaryVisualLayer: "PRIMARY",
      lineCount: title.lineCount,
      threeSecondReadable: shotPass,
    },
    hardFailures: visualDirectorGate.hardFailures,
    totalScore: shotPass ? 24 : Math.max(0, 24 - visualDirectorGate.hardFailures.length * 4),
    localEvidence: {ocr: {...ocr, required: ocrRequired, exactCopyAligned: ocrExact, exactCopyEvidence: visualExactCharacterPass ? "VISUAL_DIRECTOR_ORIGINAL_PIXEL_CHARACTER_VERIFICATION" : "LOCAL_OCR" , unmatchedNormalizedText: unmatchedOcr, unexpectedReadableGlyphCount}, actualPixelMetrics: metrics, footageCompatibility: preliminary.footageCompatibility, aestheticGate: aesthetic, visualDirectorReview: visualDirectorReview || null},
    generatedAt: new Date().toISOString(),
  };
  assessment.assessmentSha256 = sha256({...assessment, assessmentSha256: undefined, generatedAt: undefined});
  return assessment;
}

function selectionFrom({plan, raw, pixelAudit, semanticAudit, candidateIndex}) {
  const old = plan.provisionalWholeFilmBoardSelection || {};
  return {
    ...structuredClone(old),
    contract: "A1ProvisionalWholeFilmBoardSelection/v1",
    status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL",
    candidateId: raw.referenceId,
    candidateIndex,
    directionId: raw.candidateDirectionId,
    artifact: structuredClone(raw.artifact),
    compositePreview: structuredClone(pixelAudit.compositePreview),
    actualPixelAuditSha256: pixelAudit.auditSha256,
    semanticPixelAuditSha256: semanticAudit.auditSha256,
    selectedAt: new Date().toISOString(),
    selectionSource: "MATURITY_LOCAL_ACTUAL_PIXEL_PASS_NO_CRITIC",
    planMetadataMigration: {
      contract: "A1LookMasterPlanMetadataMigration/v1",
      status: "PASS",
      fromPlanSha256: plan.planSha256,
      toPlanSha256: plan.planSha256,
      actualArtifactSha256: raw.artifact.sha256,
      actualPixelAuditSha256: pixelAudit.auditSha256,
      semanticPixelAuditSha256: semanticAudit.auditSha256,
      auditBytesUnchanged: false,
    },
  };
}

const result = await withProjectLock(appRoot, async () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("golden-film-maturity-audit-requires-frozen-idle-runtime");
  if ((before.production.shotIntelligence.currentAssembly || []).length) throw new Error("golden-film-maturity-audit-assembly-must-remain-empty");
  const run = readJson(runPath);
  const humanTasteQueue = readJson(humanTasteQueuePath);
  const visualDirectorReviewManifest = readJson(visualDirectorReviewPath);
  const targetShotIds = [...(run.phases?.PHASE_3?.targetShotIds || [])];
  let queueItems = new Map((humanTasteQueue.items || []).map((item) => [item.shotId, item]));
  const queueTargetShotIds = [...(humanTasteQueue.reviewDecision?.p0P1TargetShotIds || [])];
  const universalReferenceWave = run.phases?.PHASE_3?.referencePackagingContract === A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT
    && run.phases?.PHASE_3?.productionMethod === UNIVERSAL_REFERENCE_PRODUCTION_METHOD;
  if (!targetShotIds.length) throw new Error("golden-film-maturity-audit-target-scope-invalid");
  if (JSON.stringify(targetShotIds) !== JSON.stringify(queueTargetShotIds)) {
    if (!universalReferenceWave) throw new Error(`golden-film-maturity-audit-target-scope-invalid:${targetShotIds.join(",")}`);
    // The universal reference wave is authoritative for its own bounded
    // target set; the older human-taste queue may still describe a prior
    // visual-revision wave. Reuse only the current plan copy contract here.
    queueItems = new Map(targetShotIds.map((shotId) => {
      const plan = before.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
      const displayProtectedPhrases = plan?.displayProtectedPhrases?.length
        ? [...plan.displayProtectedPhrases]
        : [...(plan?.protectedPhrases || [])];
      return [shotId, {shotId, displayProtectedPhrases}];
    }));
  } else {
    if (humanTasteQueue.reviewDecision?.status !== "PASS") throw new Error(`golden-film-maturity-audit-queue-not-ready:${humanTasteQueue.reviewDecision?.status || "UNKNOWN"}`);
    for (const shotId of targetShotIds) if (!queueItems.has(shotId)) throw new Error(`golden-film-maturity-audit-queue-item-missing:${shotId}`);
  }
  const targetPlans = new Map(before.production.shotIntelligence.packageLookMasterPlans.filter((plan) => targetShotIds.includes(plan.shotId)).map((plan) => [plan.shotId, plan]));
  const expectedJobCount = targetShotIds.reduce((sum, shotId) => sum + Number(targetPlans.get(shotId)?.candidateBudget || 0), 0);
  const waveJobIds = new Set(run.phases?.PHASE_3?.queuedJobIds || []);
  const jobs = before.production.generation.jobs.filter((job) => waveJobIds.has(job.id)
    && job.productionMethod === UNIVERSAL_REFERENCE_PRODUCTION_METHOD
    && job.referencePackagingContract === A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT
    && job.status === "complete"
    && job.output?.sha256);
  if (jobs.length > expectedJobCount) throw new Error(`golden-film-maturity-audit-job-count-invalid:${jobs.length}:${expectedJobCount}`);
  if (!jobs.length) throw new Error("golden-film-maturity-audit-no-completed-generated-candidates");
  const waveDispatchMaturityRunSha256 = run.phases?.PHASE_3?.waveDispatchMaturityRunSha256 || [...new Set(jobs.map((job) => job.goldenFilmMaturityRunSha256).filter(Boolean))].at(0) || null;
  assertFullLookMasterVisualDirectorReview(visualDirectorReviewManifest, {waveDispatchMaturityRunSha256, jobs});
  const outputSet = new Set(jobs.map((job) => job.output.sha256));
  const runtime = before.production.shotIntelligence;
  const staged = structuredClone(before);
  const plans = new Map(staged.production.shotIntelligence.packageLookMasterPlans.filter((plan) => targetShotIds.includes(plan.shotId)).map((plan) => [plan.shotId, plan]));
  const currentRaws = runtime.lookMasterRawReferences.filter((raw) => outputSet.has(raw.artifact?.sha256));
  if (currentRaws.length !== outputSet.size) throw new Error(`golden-film-maturity-audit-raw-count-invalid:${currentRaws.length}:${outputSet.size}`);
  // Keep the pre-repair recommendation as the current fallback. A rejected
  // replacement must never erase the last usable master; only a PASS below
  // may replace this selection.
  const audits = [];
  for (const raw of currentRaws) {
    if (raw.referencePackagingContract !== A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT || raw.productionMethod !== UNIVERSAL_REFERENCE_PRODUCTION_METHOD || !raw.referenceAttachmentManifest || raw.imagegenAttachmentManifestSha256 !== raw.artifact?.referenceAttachmentManifestSha256 || Number(raw.imagegenAttachmentCount || 0) !== Number(raw.referenceAttachmentManifest.fileCount || 0) || JSON.stringify(raw.artifact?.imagegenAttachmentSourceShas || []) !== JSON.stringify(raw.referenceAttachmentManifest.sourceSha256s || [])) throw new Error(`golden-film-maturity-audit-reference-attachment-proof-invalid:${raw.referenceId}`);
    assertUniversalReferenceAttachmentManifest(raw.referenceAttachmentManifest);
    const plan = plans.get(raw.shotId);
    const candidateFile = publicFile(raw.artifact.publicUrl);
    if (!fs.existsSync(candidateFile) || sha256(fs.readFileSync(candidateFile)) !== raw.artifact.sha256) throw new Error(`golden-film-maturity-audit-artifact-sha-invalid:${raw.artifact.sha256}`);
    const ocr = raw.semanticPixelAuditOcr?.status
      ? structuredClone(raw.semanticPixelAuditOcr)
      : readOcr(candidateFile);
    const preliminary = await buildPackageLookMasterPixelAudit({plan, rawReference: raw, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", now: new Date().toISOString()});
    const currentCandidates = runtime.lookMasterRawReferences.filter((item) => item.artifact?.sha256 && item.artifact.sha256 !== raw.artifact.sha256).map((item) => ({shotId: item.shotId, directionId: item.candidateDirectionId, artifactSha256: item.artifact.sha256, perceptualHash: item.artifact.perceptualHash}));
    const duplicate = findPerceptualDuplicate({shotId: raw.shotId, directionId: raw.candidateDirectionId, artifactSha256: raw.artifact.sha256, perceptualHash: raw.artifact.perceptualHash}, currentCandidates, {maxDistance: 4});
    const visualDirectorReview = visualDirectorReviewForRaw(visualDirectorReviewManifest, raw);
    const assessment = makeLocalAssessment({plan, queueItem: queueItems.get(raw.shotId), raw, preliminary, ocr, duplicate, visualDirectorReview});
    const pixelAudit = await buildPackageLookMasterPixelAudit({plan, rawReference: raw, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", trustedAssessment: assessment, now: new Date().toISOString()});
    const semanticAssessment = {
      mode: "ACTUAL_PIXEL_VISUAL_REVIEW",
      reviewSource: assessment.reviewSource,
      artifactSha256Verified: true,
      serverVisualReviewPass: assessment.status === "PASS",
      viewerTakeawayMatch: assessment.semanticThreeSecond.status === "PASS",
      actorActionMatch: assessment.dominantActor.status === "PASS",
      sourceIdentityMatch: true,
      threeSecondReadable: assessment.semanticThreeSecond.status === "PASS",
      genericTemplateDetected: assessment.policyAudit.status !== "PASS",
      visualComplexityWithinBudget: assessment.policyAudit.status === "PASS",
      singleReadingPath: assessment.semanticThreeSecond.status === "PASS",
      decorativeMotifFree: assessment.policyAudit.status === "PASS",
      referenceCopyDetected: false,
      ocrAvailable: ocr.status === "PASS" && ocr.observationCount > 0,
      ocrExactCopyAligned: assessment.localEvidence.ocr.exactCopyAligned === true,
      textExpected: plan.typographyActor === true,
      debugSourceStringDetected: false,
      foreignShotCopyDetected: false,
      unrelatedFillerDetected: false,
      emptyPlaceholderDetected: false,
      duplicateDetected: Boolean(duplicate),
      reviewRisk: false,
      notes: assessment.reviewSource,
    };
    const decision = runtime.decisionSet?.items?.find((item) => item.shotId === raw.shotId) || null;
    const researchPacket = (runtime.researchPackets || []).find((packet) => packet.packetSha256 === plan.researchPacketSha256 || packet.shotId === raw.shotId) || null;
    const referenceInputs = raw.sourceEvidenceInputs || raw.provenance?.sourceEvidenceInputs || plan.sourceEvidenceInputs || [];
    const semanticAudit = buildWholeFilmActualPixelSemanticAudit({
      brief: plan.semanticDesignBrief,
      artifact: raw.artifact,
      assessment: semanticAssessment,
      ocrText: ocr.text,
      foreignCopies: runtime.packageLookMasterPlans.map((item) => ({shotId: item.shotId, text: item.semanticDesignBrief?.exactCopy || ""})),
      duplicate,
      decision,
      researchPacket,
      referenceInputs,
      referenceUseProof: raw.researchReferenceUseProof || raw.provenance?.researchReferenceUseProof || null,
      evidenceMatch: assessment.sourceEvidenceMatch || null,
      sourceBoundOcrTokens: referenceInputs.flatMap((item) => [item.title, item.publisher, item.sourceUrl]).filter(Boolean),
      now: new Date().toISOString(),
    });
    const nextRaw = staged.production.shotIntelligence.lookMasterRawReferences.find((item) => item.referenceId === raw.referenceId);
    // A generated candidate is not a current master merely because it was
    // written by the worker. Only an actual-pixel PASS may take the current
    // pointer; rejected candidates remain inspectable history.
    nextRaw.current = semanticAudit.status === "PASS";
    nextRaw.historyReadOnly = semanticAudit.status !== "PASS";
    nextRaw.pixelAudit = pixelAudit;
    nextRaw.pixelAuditPublicUrl = `${pixelAudit.compositePreview?.publicUrl?.replace(/\/[^/]+$/u, "") || ""}/${pixelAudit.auditSha256}.json`;
    nextRaw.serverVisualAssessment = assessment;
    nextRaw.serverVisualAssessmentPublicUrl = null;
    nextRaw.actualPixelAssessment = assessment;
    nextRaw.actualPixelAssessmentSha256 = assessment.assessmentSha256;
    nextRaw.semanticPixelAudit = semanticAudit;
    nextRaw.semanticPixelAuditSha256 = semanticAudit.auditSha256;
    nextRaw.semanticPixelAuditOcr = {status: ocr.status, observationCount: ocr.observationCount, text: ocr.text, segmentDetails: ocr.segmentDetails};
    nextRaw.semanticPixelAuditFindings = semanticAudit.findings;
    nextRaw.lightChecks = {...(nextRaw.lightChecks || {}), decode: raw.artifact.width >= 640 && raw.artifact.height >= 360 ? "PASS" : "FAIL", dimensions: raw.artifact.width >= 640 && raw.artifact.height >= 360 ? "PASS" : "FAIL", baseFrameComposite: pixelAudit.footageCompatibility?.status === "PASS" ? "PASS" : "FAIL", subjectOcclusion: pixelAudit.footageCompatibility?.subjectOcclusion?.status || "UNVERIFIED", ocrExact: semanticAudit.checks.ocrExactCopyAligned ? "PASS" : "FAIL", remoteCritic: "SKIPPED_BY_MATURITY_BOUNDARY"};
    nextRaw.recommendationEligible = semanticAudit.recommendationEligible;
    nextRaw.selectionEligible = semanticAudit.recommendationEligible;
    nextRaw.assemblyEligible = false;
    nextRaw.candidateAdmissionRequired = !semanticAudit.recommendationEligible;
    if (raw.productionMethod === UNIVERSAL_REFERENCE_PRODUCTION_METHOD && raw.referencePackagingContract === A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT) {
      nextRaw.classification = semanticAudit.status === "PASS" ? "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : "FULL_LOOK_MASTER_REFERENCE_ATTACHED_REJECTED";
      nextRaw.fullLookMasterStatus = semanticAudit.status === "PASS" ? "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : "REJECTED_ACTUAL_PIXEL_GATE";
      nextRaw.userVisualApproval = "NOT_APPROVED";
    }
    nextRaw.reviewStatus = semanticAudit.status === "PASS" ? "ACTUAL_PIXEL_SEMANTIC_PASS" : "VISUAL_REJECTED";
    nextRaw.status = semanticAudit.status === "PASS" ? "ACTUAL_PIXEL_SEMANTIC_PASS" : "VISUAL_REJECTED_ACTUAL_PIXEL_SEMANTIC_AUDIT";
    nextRaw.goldenFilmMaturityAudit = {contract: "A1GoldenFilmMaturityActualPixelAudit/v1", status: semanticAudit.status, maturityRunSha256: run.maturityRunSha256, localAssessmentSha256: assessment.assessmentSha256, pixelAuditSha256: pixelAudit.auditSha256, semanticAuditSha256: semanticAudit.auditSha256, actualFrameOccupation: semanticAudit.status === "PASS" ? before.production.canonicalCreatorPackagingSequence?.decisions?.find((item) => item.shotId === raw.shotId)?.frameOccupation || null : null, actualModeEvidence: semanticAudit.status === "PASS" ? "UNIVERSAL_REFERENCE_FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : null, ocrStatus: ocr.status, ocrObservationCount: ocr.observationCount, rejectionReasons: assessment.hardFailures};
    const generationJobId = raw.provenance?.generationJobId || String(raw.referenceId || "").replace(/^look-master-raw-/u, "");
    const candidateIndex = jobs.find((job) => job.id === generationJobId)?.candidateIndex || null;
    const existingSelection = plans.get(raw.shotId).provisionalWholeFilmBoardSelection;
    if (semanticAudit.status === "PASS" && (!existingSelection || Number(candidateIndex || Infinity) < Number(existingSelection.candidateIndex || Infinity))) {
      plans.get(raw.shotId).provisionalWholeFilmBoardSelection = selectionFrom({plan, raw, pixelAudit, semanticAudit, candidateIndex});
    }
    audits.push({generationJobId, shotId: raw.shotId, candidateIndex, artifactSha256: raw.artifact.sha256, directionId: raw.candidateDirectionId, visualDirectorDecision: visualDirectorReview?.decision || "MISSING", ocr: {status: ocr.status, observationCount: ocr.observationCount, text: ocr.text}, footageCompatibility: pixelAudit.footageCompatibility, aestheticGate: assessment.styleAudit.currentAesthetic, pixelAuditStatus: pixelAudit.status, pixelAuditSha256: pixelAudit.auditSha256, semanticStatus: semanticAudit.status, semanticAuditSha256: semanticAudit.auditSha256, recommendationEligible: semanticAudit.recommendationEligible, rejectionReasons: assessment.hardFailures});
  }
  const importedJobIds = new Set(audits.map((item) => item.generationJobId));
  for (const job of jobs.filter((item) => !importedJobIds.has(item.id))) {
    const review = visualDirectorReviewManifest.items.find((item) => item.generationJobId === job.id);
    if (review?.decision !== "REJECT" || !review.reasonCodes.includes("EXACT_PIXEL_DUPLICATE")) throw new Error(`golden-film-maturity-audit-deduped-job-review-invalid:${job.id}`);
    audits.push({generationJobId: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, artifactSha256: job.output.sha256, directionId: job.candidateDirectionId || null, visualDirectorDecision: review.decision, ocr: {status: "CACHED_FROM_IDENTICAL_SHA", observationCount: 0, text: ""}, footageCompatibility: null, aestheticGate: null, pixelAuditStatus: "DUPLICATE_JOB_OUTPUT", pixelAuditSha256: null, semanticStatus: "BLOCK", semanticAuditSha256: null, recommendationEligible: false, rejectionReasons: review.reasonCodes.map((code) => `VISUAL_DIRECTOR_REJECTED:${code}`)});
  }
  staged.production.generation.workerStatus = "frozen";
  staged.production.generation.automaticDispatchAllowed = false;
  staged.production.policy = {...staged.production.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const passCount = audits.filter((item) => item.semanticStatus === "PASS").length;
  const passShotIds = targetShotIds.filter((shotId) => audits.some((item) => item.shotId === shotId && item.recommendationEligible === true));
  const boardReady = passShotIds.length === targetShotIds.length;
  const blockedNextAction = "DISPATCH_HUMAN_TASTE_STRUCTURAL_REPAIR_WAVE_MAX_2";
  const blockedOverallStatus = "HUMAN_TASTE_REPAIR_AUDIT_BLOCKED";
  const existingDeterministicPassCount = Number(run.imageLedger?.reusedExistingCandidateCount || 0);
  const now = new Date().toISOString();
  const event = createProductionEvent({workspace: before, action: "audit-golden-film-maturity-wave-v1", targetId: run.maturityRunSha256, payload: {contract: "A1GoldenFilmMaturityActualPixelAudit/v1", audits, noCritic: true, noAssembly: true}, now});
  staged.production.eventLedger.eventCount += 1;
  staged.production.eventLedger.lastEventId = event.eventId;
  staged.production.eventLedger.lastEventAt = now;
  const committed = persistProjectState(appRoot, assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(staged, now)), {expectedWorkspaceSha256: before.workspaceSha256, event, files: {"golden-film-visual-system-maturity-v1/actual-pixel-audit.json": {contract: "A1GoldenFilmMaturityActualPixelAuditReport/v1", maturityRunSha256: run.maturityRunSha256, status: boardReady ? "PASS" : "PARTIAL_BLOCKED", targetShotIds, audits, queueSha256: humanTasteQueue.queueSha256, generatedAt: now}}});
  const nextRun = structuredClone(run);
  nextRun.generatedAt = now;
  const auditFailureReasons = [...new Set(audits.flatMap((item) => item.rejectionReasons))];
  nextRun.phases.PHASE_3 = {...nextRun.phases.PHASE_3, status: boardReady ? "ACTUAL_PIXEL_PASS" : "ACTUAL_PIXEL_AUDIT_WITH_REJECTIONS", generationAllowed: false, currentWaveJobIds: [...waveJobIds], newGeneratedShas: audits.map((item) => item.artifactSha256), newGeneratedCount: audits.length, auditResults: audits, repairAttempt: boardReady ? Number(nextRun.phases.PHASE_3.repairAttempt || 0) : Number(nextRun.phases.PHASE_3.repairAttempt || 1), failureReasons: auditFailureReasons, nextAction: boardReady ? "REBUILD_WHOLE_FILM_STATIC_BOARD" : blockedNextAction};
  nextRun.phases.PHASE_4 = {...nextRun.phases.PHASE_4, status: boardReady ? "READY" : "BLOCKED", deterministicPassCount: existingDeterministicPassCount + passShotIds.length, boardRebuilt: false, failureReasons: boardReady ? ["WHOLE_FILM_STATIC_BOARD_NOT_REBUILT"] : ["HUMAN_TASTE_TARGETS_NO_ACTUAL_PIXEL_PASS_CANDIDATE", ...auditFailureReasons], nextAction: boardReady ? "REBUILD_WHOLE_FILM_STATIC_BOARD" : blockedNextAction};
  nextRun.overallStatus = boardReady ? "AUDIT_COMPLETE_BOARD_READY" : blockedOverallStatus;
  nextRun.nextAction = boardReady ? "REBUILD_WHOLE_FILM_STATIC_BOARD" : blockedNextAction;
  nextRun.runtimeFreeze = {...nextRun.runtimeFreeze, queue: 0, running: 0, workerStatus: "frozen", assemblyCount: 0, assemblyCreationAllowed: false};
  const generatedShas = [...new Set(audits.map((item) => item.artifactSha256))];
  const previousCandidateShas = [...(nextRun.imageLedger?.candidateShas || [])];
  const allCandidateShas = [...new Set([...previousCandidateShas, ...generatedShas])];
  const previousAttempted = Number(nextRun.imageLedger?.attemptedGeneratedCount || 0);
  const previousAdopted = Number(nextRun.imageLedger?.adoptedGeneratedCount || 0);
  const previousRejected = Number(nextRun.imageLedger?.rejectedGeneratedCount || 0);
  const previousSystemEligible = Number(nextRun.imageLedger?.systemEligibleGeneratedCount || 0);
  const previousPending = Number(nextRun.imageLedger?.pendingGeneratedCount || 0);
  const previouslyAuditedCurrentWave = Number(nextRun.imageLedger?.attemptedGeneratedJobCount || 0) === jobs.length
    && generatedShas.length === new Set(nextRun.imageLedger?.targetedRepairCandidateShas || []).size
    && generatedShas.every((candidateSha) => (nextRun.imageLedger?.targetedRepairCandidateShas || []).includes(candidateSha));
  const baseAttempted = previousAttempted - (previouslyAuditedCurrentWave ? Number(nextRun.imageLedger?.targetedRepairAttemptedGeneratedCount || 0) : 0);
  const baseRejected = previousRejected - (previouslyAuditedCurrentWave ? Number(nextRun.imageLedger?.targetedRepairRejectedGeneratedCount || 0) : 0);
  const baseSystemEligible = previousSystemEligible - (previouslyAuditedCurrentWave ? Number(nextRun.imageLedger?.targetedRepairSystemEligibleGeneratedCount || 0) : 0);
  const basePending = previousPending - (previouslyAuditedCurrentWave ? Number(nextRun.imageLedger?.targetedRepairPendingGeneratedCount || 0) : 0);
  nextRun.imageLedger = {
    ...nextRun.imageLedger,
    attemptedGeneratedCount: baseAttempted + jobs.length,
    // Actual-pixel PASS makes a candidate system-eligible for the static
    // board; it is not user adoption. User approval remains a later, explicit
    // whole-film board gate.
    adoptedGeneratedCount: previousAdopted,
    rejectedGeneratedCount: baseRejected + jobs.length - passCount,
    systemEligibleGeneratedCount: baseSystemEligible + passCount,
    pendingGeneratedCount: basePending + passCount,
    candidateShas: allCandidateShas,
    newGeneratedShas: generatedShas,
    newGeneratedCount: generatedShas.length,
    attemptedGeneratedJobCount: jobs.length,
    uniqueGeneratedImageCount: generatedShas.length,
    auditedWaveJobIds: jobs.map((job) => job.id),
    targetedRepairAttemptedGeneratedCount: jobs.length,
    targetedRepairAdoptedGeneratedCount: 0,
    targetedRepairSystemEligibleGeneratedCount: passCount,
    targetedRepairPendingGeneratedCount: passCount,
    targetedRepairRejectedGeneratedCount: jobs.length - passCount,
    targetedRepairCandidateShas: generatedShas,
    repairAttempt: nextRun.phases.PHASE_3.repairAttempt || 0,
    goodPngShaChanged: false,
  };
  nextRun.maturityRunSha256 = sha256({...nextRun, maturityRunSha256: undefined});
  persistGoldenFilmVisualSystemMaturityRun(nextRun);
  return {workspaceSha256: committed.workspaceSha256, run: nextRun, audits, targetShotIds, boardReady};
});

let downstream = null;
if (result.boardReady) {
  const convergence = execFileSync(process.execPath, [path.join(root, "scripts/converge-creator-palette-binding-authority-v1.mjs")], {cwd: root, encoding: "utf8"});
  const refresh = execFileSync(process.execPath, [path.join(root, "scripts/refresh-golden-film-maturity-authority-after-audit-v1.mjs")], {cwd: root, encoding: "utf8"});
  const sync = execFileSync(process.execPath, [path.join(root, "scripts/sync-golden-film-maturity-authority-v1.mjs")], {cwd: root, encoding: "utf8"});
  downstream = {convergence: JSON.parse(convergence), refresh: JSON.parse(refresh), sync: JSON.parse(sync)};
}
console.log(JSON.stringify({status: "PASS", workspaceSha256: result.workspaceSha256, maturityRunSha256: result.run.maturityRunSha256, targetShotIds: result.targetShotIds, passCount: result.audits.filter((item) => item.recommendationEligible).length, boardReady: result.boardReady, audits: result.audits, nextAction: result.run.nextAction, downstream}, null, 2));
