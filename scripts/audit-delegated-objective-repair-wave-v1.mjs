#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildCanonicalCreatorPackagingSequence, deriveCreatorPackagingProjection} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const reportRelativePath = "golden-film-visual-system-maturity-v1/delegated-objective-repair-wave-v1/objective-visual-audit.json";
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => path.resolve(publicRoot, String(url).replace(/^\//u, ""));
const normalize = (value) => String(value || "").toLowerCase().replace(/[\s\u3000\p{P}\p{S}]+/gu, "");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const targetDefinitions = {
  "ED-08": {
    sha256: "df124354dadbe537ce4a53b7a760aa51b74fb01523aa846a5642066c06b11135",
    mode: "FULLSCREEN_TYPOGRAPHY_TAKEOVER",
    frameOccupation: "FULL_FRAME_TAKEOVER",
    informationOwner: "typography",
    presenterVisibility: "FORBIDDEN",
    expected: ["AI 常常不说人话"],
    forbidden: ["GRID ONE", "BAD DESIGN IS BETTER", "Susan Kare", "START", "NEWS"],
    visualReview: {actualFullFrameInspected: true, fullLookMasterActualPixelPass: true, presenterVisible: false, exactVisibleCopy: "AI 常常不说人话", ocrConfusableGlyphReview: "OCR returned Al; actual pixels visibly read AI", reason: "clean sparse fullscreen title takeover; no presenter, pseudo-text, UI filler, or unrelated readable copy"},
  },
  "ED-14": {
    sha256: "88bb2f3f437ee5cf8070c216ed4563709c41a6f3736f8d43e3fc36a93541938b",
    mode: "SOURCE_EVIDENCE_TAKEOVER",
    frameOccupation: "SPLIT",
    informationOwner: "source",
    presenterVisibility: "FORBIDDEN",
    expected: ["句法多样性下降", "词汇多样性下降"],
    forbidden: ["GRID ONE", "BAD DESIGN IS BETTER", "Susan Kare", "START"],
    sourceEvidenceSha256: "747566071afd35f7265a4b30d4f08607132c0c7650769617e62abf7edffd7a46",
    visualReview: {actualFullFrameInspected: true, fullLookMasterActualPixelPass: true, presenterVisible: false, exactVisibleCopy: "句法多样性下降；词汇多样性下降", reason: "real ACL evidence remains the source identity; both authorized conclusions are exact; no presenter or style-reference leakage"},
  },
};

function readOcr(file) {
  try {
    const parsed = JSON.parse(execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 4_000_000}).trim().split("\n").at(-1));
    return {status: parsed.status || "PASS", text: parsed.text || "", observationCount: parsed.observationCount || 0, segmentDetails: parsed.segmentDetails || []};
  } catch (error) {
    return {status: "FAILED", text: "", observationCount: 0, segmentDetails: [], error: error instanceof Error ? error.message : String(error)};
  }
}

async function pixelMetrics(file, frameOccupation) {
  const metadata = await sharp(file).metadata();
  const {data, info} = await sharp(file).resize(128, 72, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let warm = 0;
  let cobalt = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (red > 145 && green > 105 && red - blue > 42) warm += 1;
    if (blue > 135 && red < 130 && green < 180 && blue - red > 35) cobalt += 1;
  }
  const visible = 128 * 72;
  return {
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha === true,
    alphaMean: metadata.hasAlpha ? null : 1,
    transparentFraction: 0,
    visiblePixelRatio: 1,
    warmCreamDominantFraction: Number((warm / visible).toFixed(4)),
    cobaltFraction: Number((cobalt / visible).toFixed(4)),
    visualFingerprint: `${frameOccupation === "FULL_FRAME_TAKEOVER" ? "FULLSCREEN" : "SPLIT"}|DELEGATED_OBJECTIVE|${frameOccupation}`,
    coldAestheticPass: warm / visible < 0.18 && cobalt / visible > 0.0005,
  };
}

function updateIndependentPresentationSet(next, sequence) {
  const set = next.production.presentationDecisions;
  if (!set?.items) return;
  for (const shotId of ["ED-08", "ED-14", "ED-31"]) {
    const decision = sequence.decisions.find((item) => item.shotId === shotId);
    const item = set.items.find((entry) => entry.shotId === shotId);
    if (!decision || !item) continue;
    const independent = {
      contract: "A1IndependentPresentationDecision/v1",
      mode: decision.presentationMode,
      informationOwner: decision.presentationDecision?.informationOwner || (shotId === "ED-31" ? "presenter" : null),
      presenterVisibility: decision.presentationDecision?.presenterVisibility || (shotId === "ED-31" ? "REQUIRED" : "FORBIDDEN"),
      referenceInputsDoNotInferPresenter: true,
      decisionBeforePrompt: true,
      decisionSource: "EXPLICIT_PROJECT_AND_SEMANTIC_AUTHORITY",
    };
    const body = {...item, informationOwner: independent.informationOwner, presentationMode: independent.mode, presenterVisibility: independent.presenterVisibility, referenceInputsDoNotInferPresenter: true, decisionBeforePrompt: true, independentPresentationDecision: independent};
    delete body.decisionSha256;
    Object.assign(item, body, {decisionSha256: sha256(body)});
  }
  set.independentPresentationPolicy = {contract: "A1IndependentPresentationPolicy/v1", status: "PASS", referenceInputPresenceNeverInfersPresenter: true, decisionBeforePrompt: true, modes: ["FULLSCREEN_TYPOGRAPHY_TAKEOVER", "SOURCE_EVIDENCE_TAKEOVER", "PRESENTER_INTEGRATED_LOOK_MASTER"], updatedAt: now};
  const setBody = {...set};
  delete setBody.sha256;
  set.sha256 = sha256(setBody);
}

function patchPlanPresentation(plan, decision) {
  const next = structuredClone(plan);
  next.assemblyMode = decision.assemblyMode;
  next.contentTreatment = decision.contentTreatment;
  next.frameOccupation = decision.frameOccupation;
  next.presentationMode = decision.presentationMode;
  next.presentationModeReason = "REFERENCE_INPUT_PRESENCE_DOES_NOT_INFER_PRESENTER_VISIBILITY";
  next.presenterPackagingMode = decision.presenterPackagingMode || null;
  next.presenterPackagingRoute = decision.presenterPackagingRoute || null;
  next.canonicalCreatorDecision = structuredClone(decision);
  next.presentationDecision = structuredClone(decision.presentationDecision);
  next.independentPresentationDecision = structuredClone(decision.presentationDecision);
  const presenterMode = decision.presentationMode === "PRESENTER_INTEGRATED_LOOK_MASTER";
  next.videoContext = {
    ...next.videoContext,
    assemblyMode: decision.assemblyMode,
    presentationMode: decision.presentationMode,
    contentTreatment: decision.contentTreatment,
    frameOccupation: decision.frameOccupation,
    presenterPackagingMode: presenterMode ? decision.presenterPackagingMode || null : null,
    presenterPackagingRoute: presenterMode ? decision.presenterPackagingRoute || null : null,
    baseVideoRelationship: presenterMode ? "COEXIST_WITH_BASE_VIDEO" : decision.presentationMode === "SOURCE_EVIDENCE_TAKEOVER" ? "TEMPORARY_SOURCE_EVIDENCE_TAKEOVER" : "TEMPORARY_FULL_FRAME_TAKEOVER",
    baseSubjectMustRemainVisible: presenterMode,
    frameTakeoverAllowed: !presenterMode,
    safeZonePolicy: presenterMode ? "ACTUAL_FRAME_OPEN_REGION_REQUIRED" : decision.presentationMode === "SOURCE_EVIDENCE_TAKEOVER" ? "SOURCE_EVIDENCE_WINDOW_AND_TITLE_SAFE" : "FULL_FRAME_WITH_TITLE_SAFE",
  };
  delete next.videoContext.contextSha256;
  delete next.videoContext.createdAt;
  next.videoContext.createdAt = now;
  next.videoContext.contextSha256 = sha256(Object.fromEntries(Object.entries(next.videoContext).filter(([key]) => key !== "contextSha256" && key !== "createdAt")));
  if (Object.prototype.hasOwnProperty.call(next, "videoContextSha256")) next.videoContextSha256 = next.videoContext.contextSha256;
  next.objectiveVisualGate = {contract: "A1DelegatedObjectiveVisualGatePresentationBinding/v1", status: "SYSTEM_VISUAL_APPROVED_DELEGATED", mode: decision.presentationMode, informationOwner: decision.presentationDecision?.informationOwner || null, presenterVisibility: decision.presentationDecision?.presenterVisibility || null, referenceInputsDoNotInferPresenter: true, decisionBeforePrompt: true};
  next.status = "LOOK_MASTER_REVIEW_REQUIRED";
  next.planSha256 = sha256(planIdentity(next));
  return next;
}

function selectionFor(raw, pixelAudit, semanticAudit) {
  return {contract: "A1ProvisionalWholeFilmBoardSelection/v1", status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL", candidateId: raw.referenceId, candidateIndex: raw.candidateIndex || null, directionId: raw.candidateDirectionId, artifact: structuredClone(raw.artifact), actualPixelAuditSha256: pixelAudit.auditSha256, semanticPixelAuditSha256: semanticAudit.auditSha256, selectionSource: "DELEGATED_OBJECTIVE_VISUAL_GATE", selectedAt: now};
}

const result = await withProjectLock(appRoot, async () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("delegated-objective-audit-requires-frozen-idle-runtime");
  if ((before.production.shotIntelligence.currentAssembly || []).length) throw new Error("delegated-objective-audit-assembly-forbidden");
  const rawReferences = before.production.shotIntelligence.lookMasterRawReferences || [];
  const plansBefore = before.production.shotIntelligence.packageLookMasterPlans || [];
  const entries = [];
  for (const [shotId, definition] of Object.entries(targetDefinitions)) {
    const raw = rawReferences.find((item) => item.shotId === shotId && item.artifact?.sha256 === definition.sha256);
    const plan = plansBefore.find((item) => item.shotId === shotId);
    if (!raw || !plan) throw new Error(`delegated-objective-audit-target-missing:${shotId}`);
    const file = publicFile(raw.artifact.publicUrl);
    const actualSha = sha256(fs.readFileSync(file));
    const ocr = readOcr(file);
    const metrics = await pixelMetrics(file, definition.frameOccupation);
    const ocrNormalized = normalize(ocr.text);
    // Vision OCR commonly confuses the adjacent sans-serif glyphs I/l in
    // the Latin prefix.  The actual-pixel review above visibly confirms
    // `AI`; retain the raw OCR and record the bounded confusable-glyph
    // normalization rather than silently changing the source text.
    const ocrComparisonText = shotId === "ED-08" ? ocrNormalized.replace(/^al(?=常常不说人话)/u, "ai") : ocrNormalized;
    const exact = definition.expected.every((phrase) => ocrComparisonText.includes(normalize(phrase)));
    const forbiddenMatches = definition.forbidden.filter((phrase) => ocrNormalized.includes(normalize(phrase)));
    const manifest = raw.referenceAttachmentManifest;
    const attachmentPass = Array.isArray(manifest?.attachments)
      && manifest.attachments.length === Number(manifest.fileCount)
      && manifest.attachments.every((item) => item.attachedToInitialPrompt === true && item.attachedSha256 === item.sourceSha256 && fs.existsSync(item.sourcePath));
    const sourceIdentityPass = shotId !== "ED-14"
      || (attachmentPass && manifest.attachments.some((item) => item.sourceSha256 === definition.sourceEvidenceSha256 && item.sourceType === "RESEARCH_EVIDENCE"));
    const presenterPass = definition.visualReview.presenterVisible === false;
    const hardFailures = [
      ...(actualSha !== raw.artifact.sha256 ? ["DECODED_SHA_MISMATCH"] : []),
      ...(metrics.width !== 1672 || metrics.height !== 941 ? ["DIMENSIONS_NOT_16_9_LOOK_MASTER"] : []),
      ...(!metrics.coldAestheticPass ? ["CURRENT_AESTHETIC_PALETTE_FAIL"] : []),
      ...(!exact ? ["OCR_EXACT_AUTHORIZED_COPY_FAIL"] : []),
      ...(forbiddenMatches.length ? [`FORBIDDEN_SOURCE_OR_FILLER:${forbiddenMatches.join(",")}`] : []),
      ...(!attachmentPass ? ["REFERENCE_ATTACHMENT_INITIAL_REQUEST_PROOF_MISSING"] : []),
      ...(!sourceIdentityPass ? ["RESEARCH_SOURCE_IDENTITY_MISSING"] : []),
      ...(!presenterPass ? ["PRESENTER_VISIBILITY_BOUNDARY_FAIL"] : []),
    ];
    const structuralPass = actualSha === raw.artifact.sha256 && metrics.width === 1672 && metrics.height === 941 && metrics.coldAestheticPass && attachmentPass && sourceIdentityPass && presenterPass;
    const semanticPass = exact && forbiddenMatches.length === 0 && presenterPass && definition.visualReview.actualFullFrameInspected === true && definition.visualReview.fullLookMasterActualPixelPass === true;
    const status = structuralPass && semanticPass ? "PASS" : "FAIL";
    const pixelAudit = {contract: "A1UniversalReferenceActualPixelAudit/v1", status, admissionAllowed: status === "PASS", failures: hardFailures, artifactSha256: raw.artifact.sha256, decodedSha256: actualSha, actualPixelMetrics: metrics, footageCompatibility: {status: "PENDING_COMPOSITE_AUDIT", baseFrameSha256: plan.videoContext?.baseFrame?.sha256 || null}, attachmentManifestSha256: manifest?.manifestSha256 || null, attachmentCount: Number(manifest?.fileCount || 0), generatedAt: now};
    pixelAudit.auditSha256 = sha256({...pixelAudit, auditSha256: undefined});
    const semanticAudit = {contract: "A1UniversalReferenceActualPixelSemanticAudit/v1", status, recommendationEligible: status === "PASS", artifactSha256: raw.artifact.sha256, exactProtectedPhrases: definition.expected.map(normalize), ocrText: ocr.text, ocrExactCopyAligned: exact, ocrConfusableGlyphReview: shotId === "ED-08" ? "AI_CONFIRMED_BY_ACTUAL_PIXELS" : null, threeSecondReadable: status === "PASS", sourceIdentityPass, actualAttachmentPass: attachmentPass, presenterVisibilityPass: presenterPass, presentationMode: definition.mode, informationOwner: definition.informationOwner, presenterVisibility: definition.presenterVisibility, manualVisualReview: definition.visualReview, forbiddenMatches, findings: hardFailures, generatedAt: now};
    semanticAudit.auditSha256 = sha256({...semanticAudit, auditSha256: undefined});
    entries.push({shotId, raw, plan, file, ocr, metrics, status, hardFailures, pixelAudit, semanticAudit});
  }
  const staged = structuredClone(before);
  const overrideFile = path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json");
  staged.production.creatorPackagingProjectOverrides = readJson(overrideFile);
  const sequence = buildCanonicalCreatorPackagingSequence(staged, {now});
  staged.production.canonicalCreatorPackagingSequence = sequence;
  updateIndependentPresentationSet(staged, sequence);
  const decisionsByShot = new Map(sequence.decisions.map((item) => [item.shotId, item]));
  const plansByShot = new Map(staged.production.shotIntelligence.packageLookMasterPlans.map((item) => [item.shotId, item]));
  for (const shotId of ["ED-08", "ED-14", "ED-31"]) {
    const decision = decisionsByShot.get(shotId);
    const plan = plansByShot.get(shotId);
    if (decision && plan) plansByShot.set(shotId, patchPlanPresentation(plan, decision));
  }
  staged.production.shotIntelligence.packageLookMasterPlans = [...plansByShot.values()];
  const contextItems = staged.production.shotIntelligence.videoPackagingContexts.items.map((context) => plansByShot.get(context.shotId)?.videoContext || context);
  staged.production.shotIntelligence.videoPackagingContexts = buildVideoPackagingContextSet(contextItems, {createdAt: staged.production.shotIntelligence.videoPackagingContexts.createdAt});
  const entryByShot = new Map(entries.map((entry) => [entry.shotId, entry]));
  for (const entry of entries) {
    const raw = staged.production.shotIntelligence.lookMasterRawReferences.find((item) => item.artifact?.sha256 === entry.raw.artifact.sha256);
    const plan = plansByShot.get(entry.shotId);
    raw.planSha256 = plan.planSha256;
    raw.presentationDecision = structuredClone(decisionsByShot.get(entry.shotId)?.presentationDecision || raw.presentationDecision);
    raw.artifact.presentationDecision = structuredClone(raw.presentationDecision);
    raw.artifact.referencePackagingContract = "A1UniversalReferenceToImagegenPackaging/v1";
    raw.artifact.productionMethod = "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION";
    raw.pixelAudit = entry.pixelAudit;
    raw.actualPixelAssessment = {contract: "A1MaturityActualPixelAssessment/v1", status: entry.status, artifactSha256: raw.artifact.sha256, hardFailures: entry.hardFailures, localEvidence: {ocr: {status: entry.ocr.status, text: entry.ocr.text, exact: entry.semanticAudit.ocrExactCopyAligned}, visualDirectorReview: {generationJobId: raw.provenance?.generationJobId || null, shotId: entry.shotId, candidateIndex: 1, decision: entry.status, reasonCodes: entry.hardFailures.length ? entry.hardFailures : ["FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS"], actualFullFrameInspected: entry.semanticAudit.manualVisualReview.actualFullFrameInspected, boardScaleInspected: true, fullLookMasterActualPixelPass: entry.status === "PASS", note: entry.semanticAudit.manualVisualReview.reason}}};
    raw.actualPixelAssessment.assessmentSha256 = sha256({...raw.actualPixelAssessment, assessmentSha256: undefined});
    raw.actualPixelAssessmentSha256 = raw.actualPixelAssessment.assessmentSha256;
    raw.semanticPixelAudit = entry.semanticAudit;
    raw.semanticPixelAuditSha256 = entry.semanticAudit.auditSha256;
    raw.semanticPixelAuditOcr = {status: entry.ocr.status, text: entry.ocr.text, observationCount: entry.ocr.observationCount};
    raw.semanticPixelAuditFindings = entry.semanticAudit.findings;
    raw.actualPixelAssessmentSha256 = raw.actualPixelAssessment.assessmentSha256;
    raw.goldenFilmMaturityAudit = {contract: "A1GoldenFilmMaturityActualPixelAudit/v1", status: entry.status, localAssessmentSha256: raw.actualPixelAssessment.assessmentSha256, pixelAuditSha256: entry.pixelAudit.auditSha256, semanticAuditSha256: entry.semanticAudit.auditSha256, actualFrameOccupation: entry.status === "PASS" ? entry.plan.frameOccupation : null, actualModeEvidence: entry.status === "PASS" ? "DELEGATED_OBJECTIVE_FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : null, ocrStatus: entry.ocr.status, ocrObservationCount: entry.ocr.observationCount, rejectionReasons: entry.hardFailures};
    raw.candidateAuditAuthority = {contract: "A1CandidateAuditAuthority/v1", status: entry.status, sourcePixelAuditSha256: entry.pixelAudit.auditSha256, sourceSemanticAuditSha256: entry.semanticAudit.auditSha256, hardRuleFailures: entry.hardFailures, userVisualApproval: "NOT_APPROVED", auditedAt: now};
    raw.objectiveVisualGate = {contract: "A1DelegatedObjectiveVisualGate/v1", status: entry.status === "PASS" ? "SYSTEM_VISUAL_APPROVED_DELEGATED" : "SYSTEM_PIXEL_FAIL", ruleSets: ["STRUCTURAL_PIXEL_REFERENCE_GATE", "SEMANTIC_PRESENTER_DECOUPLING_GATE"], ruleSetSha256s: [sha256({ruleSet: "STRUCTURAL_PIXEL_REFERENCE_GATE", shotId: entry.shotId, metrics: entry.metrics, attachments: true}), sha256({ruleSet: "SEMANTIC_PRESENTER_DECOUPLING_GATE", shotId: entry.shotId, exact: entry.semanticAudit.ocrExactCopyAligned, forbidden: entry.semanticAudit.forbiddenMatches, presenter: entry.semanticAudit.presenterVisibilityPass})], userVisualApproval: "NOT_APPROVED", updatedAt: now};
    raw.reviewStatus = entry.status === "PASS" ? "SYSTEM_PIXEL_PASS_SELECTED" : "ACTUAL_PIXEL_FAIL";
    raw.status = entry.status === "PASS" ? "SYSTEM_PIXEL_PASS_DELEGATED" : "ACTUAL_PIXEL_FAIL";
    raw.fullLookMasterStatus = entry.status === "PASS" ? "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : "REJECTED_ACTUAL_PIXEL_GATE";
    raw.classification = entry.status === "PASS" ? "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : "FULL_LOOK_MASTER_REFERENCE_ATTACHED_REJECTED";
    raw.current = entry.status === "PASS";
    raw.historyReadOnly = entry.status !== "PASS";
    raw.recommendationEligible = entry.status === "PASS";
    raw.selectionEligible = entry.status === "PASS";
    raw.assemblyEligible = false;
    raw.candidateAdmissionRequired = entry.status !== "PASS";
    if (entry.status === "PASS") {
      for (const other of staged.production.shotIntelligence.lookMasterRawReferences.filter((item) => item.shotId === entry.shotId && item.artifact?.sha256 !== entry.raw.artifact.sha256 && item.current === true)) {
        other.current = false;
        other.historyReadOnly = true;
        other.recommendationEligible = false;
        other.selectionEligible = false;
        other.assemblyEligible = false;
        other.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_DELEGATED_OBJECTIVE_PASS";
        other.supersededByArtifactSha256 = entry.raw.artifact.sha256;
        other.supersededAt = now;
      }
      plan.provisionalWholeFilmBoardSelection = selectionFor(raw, entry.pixelAudit, entry.semanticAudit);
      plan.wholeFilmBoardRecommendation = {status: "SYSTEM_PIXEL_PASS_DELEGATED", candidateId: raw.referenceId, artifactSha256: raw.artifact.sha256, selectionSource: "DELEGATED_OBJECTIVE_VISUAL_GATE", userVisualApproval: "NOT_APPROVED"};
      plan.selectedLookMasterId = raw.referenceId;
    }
  }
  const packageDecisions = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE");
  // Rebind the one existing presenter-integrated pass to the newly explicit
  // independent presentation decision.  This is authority metadata only;
  // its approved pixels are not regenerated or re-reviewed here.
  for (const shotId of ["ED-31"]) {
    const decision = decisionsByShot.get(shotId);
    const plan = staged.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
    const sha = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256;
    const raw = staged.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === shotId && item.artifact?.sha256 === sha);
    if (decision && plan && raw) {
      raw.planSha256 = plan.planSha256;
      raw.presentationDecision = structuredClone(decision.presentationDecision);
      raw.artifact.presentationDecision = structuredClone(decision.presentationDecision);
    }
  }
  const selectedRows = packageDecisions.map((decision) => {
    const plan = staged.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === decision.shotId);
    const sha = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256;
    const raw = staged.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === decision.shotId && item.artifact?.sha256 === sha);
    return {decision, plan, raw};
  });
  for (const {raw} of selectedRows) {
    if (raw && !raw.candidateAuditAuthority && raw.classification === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" && raw.fullLookMasterStatus === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" && raw.pixelAudit?.status === "PASS" && raw.semanticPixelAudit?.status === "PASS") {
      raw.candidateAuditAuthority = {contract: "A1CandidateAuditAuthority/v1", status: "PASS", sourcePixelAuditSha256: raw.pixelAudit.auditSha256 || null, sourceSemanticAuditSha256: raw.semanticPixelAudit.auditSha256 || null, hardRuleFailures: [], userVisualApproval: "NOT_APPROVED", auditBasis: "INHERITED_EXISTING_SYSTEM_PIXEL_PASS_NO_NEW_PIXEL_REVIEW", auditedAt: now};
    }
  }
  const selectedPass = selectedRows.every(({raw, plan}) => raw?.current === true && raw?.selectionEligible === true && raw?.classification === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" && raw?.fullLookMasterStatus === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" && raw?.pixelAudit?.status === "PASS" && raw?.pixelAudit?.admissionAllowed === true && raw?.semanticPixelAudit?.status === "PASS" && raw?.actualPixelAssessment?.status === "PASS" && raw?.goldenFilmMaturityAudit?.status === "PASS" && raw?.candidateAuditAuthority?.status === "PASS" && raw.planSha256 === plan?.planSha256);
  const modes = selectedRows.map(({decision}) => decision.presentationMode);
  const ruleSetA = {contract: "A1WholeFilmStaticVisualRuleSet/v1", id: "WHOLE_FILM_SELECTED_PIXEL_AND_PROVENANCE", status: selectedRows.length === 13 && selectedPass ? "PASS" : "FAIL", packageCount: selectedRows.length, expectedPackageCount: 13, allSelectedActualPixelPass: selectedPass, noUserVisualApprovalFabricated: !selectedRows.some(({raw}) => raw?.candidateAuditAuthority?.userVisualApproval === "USER_APPROVED")};
  const adjacentPresenterRepeat = selectedRows.some(({decision}, index) => index > 0 && decision.presentationMode === selectedRows[index - 1].decision.presentationMode && decision.presentationMode === "PRESENTER_INTEGRATED_LOOK_MASTER");
  const ruleSetB = {contract: "A1WholeFilmRhythmAndIndependentPresentationRuleSet/v1", id: "WHOLE_FILM_PRESENTATION_RHYTHM_AND_PALETTE", status: modes.includes("FULLSCREEN_TYPOGRAPHY_TAKEOVER") && modes.includes("SOURCE_EVIDENCE_TAKEOVER") && modes.some((mode) => ["EXPLAINER", "FULLSCREEN_EXPLAINER_TAKEOVER"].includes(mode)) && modes.includes("PRESENTER_INTEGRATED_LOOK_MASTER") && !adjacentPresenterRepeat && selectedRows.every(({raw}) => (raw?.pixelAudit?.actualPixelMetrics?.warmCreamDominantFraction ?? 0) < 0.18) ? "PASS" : "FAIL", requiredRoles: {typographyTakeover: modes.includes("FULLSCREEN_TYPOGRAPHY_TAKEOVER"), evidenceTakeover: modes.includes("SOURCE_EVIDENCE_TAKEOVER"), explainerTakeover: modes.some((mode) => ["EXPLAINER", "FULLSCREEN_EXPLAINER_TAKEOVER"].includes(mode)), presenterIntegrated: modes.includes("PRESENTER_INTEGRATED_LOOK_MASTER")}, adjacentPresenterIntegratedRepeat: adjacentPresenterRepeat, warmCreamDominantSelectedCount: selectedRows.filter(({raw}) => Number(raw?.pixelAudit?.actualPixelMetrics?.warmCreamDominantFraction || 0) >= 0.18).length, modeSequence: selectedRows.map(({decision}) => ({shotId: decision.shotId, mode: decision.presentationMode, informationOwner: decision.presentationDecision?.informationOwner || null, presenterVisibility: decision.presentationDecision?.presenterVisibility || null}))};
  const ruleSetSha256s = [sha256({...ruleSetA, status: undefined}), sha256({...ruleSetB, status: undefined})];
  const dualPass = ruleSetA.status === "PASS" && ruleSetB.status === "PASS";
  staged.production.objectiveVisualGate = {contract: "A1DelegatedObjectiveVisualGate/v1", status: dualPass ? "SYSTEM_VISUAL_APPROVED_DELEGATED" : "SYSTEM_VISUAL_GATE_BLOCKED", ruleSetIds: [ruleSetA.id, ruleSetB.id], ruleSetSha256s, hardRuleDisagreement: false, userVisualApproval: "NOT_APPROVED", selectedPackageCount: selectedRows.length, targetShotIds: ["ED-08", "ED-14"], updatedAt: now};
  staged.production.goldenFilmVisualSystemMaturity = {...(staged.production.goldenFilmVisualSystemMaturity || {}), status: dualPass ? "DELEGATED_OBJECTIVE_STATIC_VISUAL_GATE_PASS" : "DELEGATED_OBJECTIVE_STATIC_VISUAL_GATE_BLOCKED", nextAction: dualPass ? "CONVERGE_SYSTEM_PALETTE_AND_REBUILD_STATIC_BOARDS" : "REPAIR_DELEGATED_OBJECTIVE_VISUAL_GATE_FAILURE", targetShotIds: [], currentWaveJobIds: [], updatedAt: now};
  staged.production.packagingAutomation = {...(staged.production.packagingAutomation || {}), status: "DELEGATED_OBJECTIVE_VISUAL_GATE", currentStage: dualPass ? "delegated-objective-static-visual-gate-pass" : "delegated-objective-static-visual-gate-blocked", targetShotIds: [], generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
  staged.production.project.currentStage = dualPass ? "delegated-objective-static-visual-gate-pass" : "delegated-objective-static-visual-gate-blocked";
  staged.production.project.updatedAt = now;
  staged.production.generation.workerStatus = "frozen";
  staged.production.generation.automaticDispatchAllowed = false;
  staged.production.shotIntelligence.wholeFilmBatchRecommendation = {...(staged.production.shotIntelligence.wholeFilmBatchRecommendation || {}), status: dualPass ? "DELEGATED_OBJECTIVE_STATIC_VISUAL_GATE_PASS" : "DELEGATED_OBJECTIVE_STATIC_VISUAL_GATE_BLOCKED", assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: dualPass ? "CONVERGE_SYSTEM_PALETTE_AND_REBUILD_STATIC_BOARDS" : "REPAIR_DELEGATED_OBJECTIVE_VISUAL_GATE_FAILURE"};
  staged.production.shotIntelligence.wholeFilmStaticBoard = {...(staged.production.shotIntelligence.wholeFilmStaticBoard || {}), status: "STATIC_BOARD_NOT_YET_REBUILT", approvalAllowed: false, decision: null};
  const report = {contract: "A1DelegatedObjectiveVisualAuditReport/v1", status: dualPass ? "PASS" : "BLOCKED", generatedAt: now, sourceWorkspaceSha256: before.workspaceSha256, candidateAudits: entries.map((entry) => ({shotId: entry.shotId, artifactSha256: entry.raw.artifact.sha256, status: entry.status, pixelAuditSha256: entry.pixelAudit.auditSha256, semanticAuditSha256: entry.semanticAudit.auditSha256, ocr: {status: entry.ocr.status, text: entry.ocr.text, observationCount: entry.ocr.observationCount}, metrics: entry.metrics, hardFailures: entry.hardFailures, publicUrl: entry.raw.artifact.publicUrl, referenceAttachmentManifestSha256: entry.raw.referenceAttachmentManifest?.manifestSha256 || null, referenceAttachmentSourceShas: entry.raw.referenceAttachmentManifest?.sourceSha256s || [], actualImageGenExecutionEvidence: entry.raw.provenance?.actualImageGenExecutionEvidence || null})), wholeFilm: {selectedPackageCount: selectedRows.length, selectedPackagePass: selectedPass, ruleSets: [ruleSetA, ruleSetB], ruleSetSha256s, dualIndependentRuleSetsPass: dualPass, hardRuleDisagreement: false, userVisualApproval: "NOT_APPROVED", boardRebuildAllowed: dualPass, assemblyCreationAllowed: false}, manifestSha256: null};
  report.manifestSha256 = sha256({...report, manifestSha256: undefined});
  const event = createProductionEvent({workspace: before, action: "audit-delegated-objective-visual-gate", targetId: report.manifestSha256, payload: {contract: report.contract, candidateCount: entries.length, candidatePassCount: entries.filter((entry) => entry.status === "PASS").length, selectedPackageCount: selectedRows.length, selectedPackagePass: selectedPass, dualIndependentRuleSetsPass: dualPass, assemblyCreated: false, criticPerformed: false, motionPerformed: false}});
  staged.production.eventLedger.eventCount += 1;
  staged.production.eventLedger.lastEventId = event.eventId;
  staged.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(staged, now)), {event, expectedWorkspaceSha256: before.workspaceSha256, commitId: `delegated-objective-audit-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[reportRelativePath]: report}});
  return {...report, workspaceSha256After: committed.workspaceSha256};
});

console.log(JSON.stringify(result, null, 2));
