#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildPackageLookMasterPixelAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {runPackageLookMasterVisualReview} from "../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs";
import {buildWholeFilmActualPixelSemanticAudit, findPerceptualDuplicate} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const shotId = process.argv[2];
const targetReferenceId = process.argv[3] || null;
if (!/^ED-\d{2}$/u.test(String(shotId || ""))) throw new Error("replacement-review-shot-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => {
  if (!String(publicUrl || "").startsWith("/generated/system-line/")) throw new Error("replacement-review-public-url-invalid");
  const file = path.resolve(publicRoot, String(publicUrl).replace(/^\//u, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("replacement-review-public-url-escape");
  return file;
};
const readOcr = (file) => {
  try {
    const output = execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000});
    const parsed = JSON.parse(output.trim().split("\n").at(-1));
    return {status: parsed.status || "PASS", text: parsed.text || "", observationCount: parsed.observationCount || 0};
  } catch (error) {
    return {status: "FAILED", text: "", observationCount: 0, error: error instanceof Error ? error.message : String(error)};
  }
};

function sourceBoundOcrTokens(packet) {
  return (packet?.sources || []).flatMap((source) => [source.title, source.publisher, source.date, "ACL 2026", "news"]).filter(Boolean);
}

const normalizeOcr = (value) => String(value || "").toLowerCase().replace(/[\s\u3000\p{P}\p{S}]+/gu, "");

function assessmentFromServerReview(review, ocr, plan) {
  const policyPass = review.policyAudit?.status === "PASS";
  const stylePass = review.styleAudit?.status === "PASS";
  const semanticPass = review.semanticThreeSecond?.status === "PASS";
  const actorPass = review.dominantActor?.status === "PASS";
  const sourcePass = review.sourceEvidenceMatch?.status === "PASS" || review.sourceEvidenceMatch?.status === "NOT_REQUIRED";
  const hardFailureText = [...(review.hardFailures || []), ...(review.policyAudit?.failures || [])].join(" ");
  const normalizedOcr = normalizeOcr(ocr.text);
  const protectedPhrases = Array.isArray(plan?.protectedPhrases) ? plan.protectedPhrases.map(normalizeOcr).filter(Boolean) : [];
  const ocrExactCopyAligned = protectedPhrases.length > 0 && protectedPhrases.every((phrase) => normalizedOcr.includes(phrase));
  return {
    mode: "ACTUAL_PIXEL_VISUAL_REVIEW",
    reviewSource: "ACTUAL_GENERATED_PNG_VISUAL_REVIEW_PLUS_LOCAL_OCR",
    artifactSha256Verified: true,
    // A server BLOCK/REVISE is an admission failure even when the local OCR
    // and the bounded geometry checks are otherwise clean.  Do not let an
    // omitted boolean turn a visual-review BLOCK into a candidate PASS.
    serverVisualReviewPass: review.status === "PASS" && !review.hardFailures?.length,
    viewerTakeawayMatch: semanticPass,
    actorActionMatch: actorPass,
    sourceIdentityMatch: sourcePass,
    threeSecondReadable: semanticPass,
    genericTemplateDetected: !policyPass,
    visualComplexityWithinBudget: policyPass && stylePass,
    singleReadingPath: policyPass && semanticPass,
    decorativeMotifFree: policyPass,
    referenceCopyDetected: /(?:foreign|copy|fake|citation|debug|filler)/iu.test(hardFailureText),
    // Typography-led exception masters must produce actual OCR observations;
    // a tool-level PASS with zero observations is not proof that the exact
    // protected copy is visible in the PNG.
    ocrAvailable: ocr.status === "PASS" && Number(ocr.observationCount || 0) > 0,
    ocrExactCopyAligned,
    textExpected: false,
    debugSourceStringDetected: /(?:project:\/\/|debug|internal|source[-_ ]?plate|fake citation)/iu.test(hardFailureText),
    foreignShotCopyDetected: /foreign/iu.test(hardFailureText),
    unrelatedFillerDetected: /filler/iu.test(hardFailureText),
    emptyPlaceholderDetected: /placeholder|empty/iu.test(hardFailureText),
    duplicateDetected: review.duplicateFingerprint?.status !== "PASS",
    reviewRisk: Boolean(review.assessmentSha256) && review.status !== "PASS",
    notes: JSON.stringify({semanticThreeSecond: review.semanticThreeSecond, dominantActor: review.dominantActor, sourceEvidenceMatch: review.sourceEvidenceMatch, policyAudit: review.policyAudit, styleAudit: review.styleAudit}),
  };
}

function referenceImagesFor(plan) {
  const bindings = [...(plan.referenceInputs || []).map((item) => ({...item, kind: "STYLE_REFERENCE"})), ...(plan.sourceEvidenceInputs || []).map((item) => ({...item, kind: "REAL_EVIDENCE_REFERENCE"}))];
  return bindings.map((item) => ({id: item.id, path: publicFile(item.publicUrl), sha256: item.sha256, kind: item.kind}));
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("replacement-review-generation-not-idle");
  if (current.production.generation.workerStatus !== "frozen") throw new Error("replacement-review-worker-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("replacement-review-assembly-already-created");
  const runtime = current.production.shotIntelligence;
  if (!(current.production.authority.nextAction?.targetShotIds || []).includes(shotId)) throw new Error(`replacement-review-shot-not-current-exception:${shotId}`);
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const raw = [...(runtime.lookMasterRawReferences || [])].reverse().find((item) => item.shotId === shotId && item.planSha256 === plan?.planSha256 && ["LOOK_MASTER_RAW", "ACTUAL_PIXEL_SEMANTIC_PASS", "VISUAL_REJECTED_ACTUAL_PIXEL_SEMANTIC_AUDIT"].includes(item.status) && (!targetReferenceId || item.referenceId === targetReferenceId));
  if (!plan || !raw) throw new Error(`replacement-review-current-raw-missing:${shotId}`);
  const candidateFile = publicFile(raw.artifact.publicUrl);
  if (!fs.existsSync(candidateFile) || fileSha256(candidateFile) !== raw.artifact.sha256) throw new Error(`replacement-review-artifact-sha-invalid:${raw.referenceId}`);
  const ocr = readOcr(candidateFile);
  const preliminaryAudit = await buildPackageLookMasterPixelAudit({plan, rawReference: raw, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", now: new Date().toISOString()});
  const baseFrameImage = publicFile(plan.videoContext.baseFrame.publicUrl);
  const compositeImage = publicFile(preliminaryAudit.compositePreview.publicUrl);
  const recentPerceptualHashes = runtime.lookMasterRawReferences
    .filter((item) => item.current === true && item.artifact?.sha256 !== raw.artifact.sha256)
    .map((item) => item.artifact?.perceptualHash)
    .filter(Boolean);
  const serverReview = preliminaryAudit.footageCompatibility?.status === "PASS"
    ? await runPackageLookMasterVisualReview({plan, rawReference: raw, preliminaryAudit, candidateImage: candidateFile, baseFrameImage, compositeImage, referenceImages: referenceImagesFor(plan), recentPerceptualHashes, now: new Date().toISOString()})
    : {
      status: "BLOCK",
      assessmentSha256: null,
      semanticThreeSecond: {status: "FAIL", evidence: `base composite gate blocked visual review: ${preliminaryAudit.footageCompatibility?.reason || "unknown"}`},
      dominantActor: {status: "FAIL", evidence: "visual review was not started because the actual base-frame compatibility gate failed"},
      referenceTraitVisibility: {status: "FAIL", visibleReferenceIds: [], evidence: "visual review was not started"},
      duplicateFingerprint: {status: "FAIL", evidence: "visual review was not started"},
      policyAudit: {status: "FAIL", failures: [preliminaryAudit.footageCompatibility?.reason || "base-frame-compatibility-failed"]},
      styleAudit: {status: "FAIL", evidence: "visual review was not started"},
      sourceEvidenceMatch: {status: plan.networkDecision === "REQUIRED" ? "FAIL" : "NOT_REQUIRED", visibleSourceIds: [], mismatchedSourceIds: [], evidence: "visual review was not started"},
      hardFailures: [preliminaryAudit.footageCompatibility?.reason || "base-frame-compatibility-failed"],
    };
  const pixelAudit = await buildPackageLookMasterPixelAudit({plan, rawReference: raw, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", trustedAssessment: serverReview, now: new Date().toISOString()});
  const decisions = new Map((runtime.decisionSet?.items || []).map((item) => [item.shotId, item]));
  const packets = new Map((runtime.researchPackets || []).map((item) => [item.shotId, item]));
  const decision = decisions.get(shotId) || null;
  const packet = packets.get(shotId) || null;
  const evidenceMatch = plan.networkDecision === "REQUIRED"
    ? {status: serverReview.sourceEvidenceMatch?.status === "PASS" ? "PASS" : "MISMATCH", sourceIds: serverReview.sourceEvidenceMatch?.visibleSourceIds || [], mismatchedSourceIds: serverReview.sourceEvidenceMatch?.mismatchedSourceIds || [], evidence: serverReview.sourceEvidenceMatch?.evidence || ""}
    : null;
  const foreignCopies = runtime.packageLookMasterPlans.map((item) => ({shotId: item.shotId, text: item.semanticDesignBrief?.exactCopy || item.exactCopy?.text || ""})).filter((item) => item.text);
  const duplicate = findPerceptualDuplicate({shotId, directionId: raw.candidateDirectionId, artifactSha256: raw.artifact.sha256, perceptualHash: raw.artifact.perceptualHash}, runtime.lookMasterRawReferences.filter((item) => item.current === true && item.artifact?.sha256 !== raw.artifact.sha256).map((item) => ({shotId: item.shotId, directionId: item.candidateDirectionId, artifactSha256: item.artifact?.sha256, perceptualHash: item.artifact?.perceptualHash})), {maxDistance: 4});
  const assessment = assessmentFromServerReview(serverReview, ocr, plan);
  let semanticAudit = buildWholeFilmActualPixelSemanticAudit({brief: plan.semanticDesignBrief, artifact: raw.artifact, assessment, ocrText: ocr.text, foreignCopies, duplicate, decision, researchPacket: packet, referenceInputs: plan.sourceEvidenceInputs || [], referenceUseProof: raw.researchReferenceUseProof || null, evidenceMatch, sourceBoundOcrTokens: sourceBoundOcrTokens(packet), now: new Date().toISOString()});
  if (preliminaryAudit.footageCompatibility?.status !== "PASS") {
    semanticAudit = {...semanticAudit, findings: [...semanticAudit.findings, `FOOTAGE_COMPATIBILITY:${preliminaryAudit.footageCompatibility?.reason || "FAIL"}`], auditSha256: null};
    semanticAudit.auditSha256 = sha256({...semanticAudit, auditSha256: undefined});
  }
  const next = structuredClone(current);
  const nextRaw = next.production.shotIntelligence.lookMasterRawReferences.find((item) => item.referenceId === raw.referenceId);
  nextRaw.pixelAudit = pixelAudit;
  nextRaw.pixelAuditPublicUrl = preliminaryAudit.compositePreview?.publicUrl ? `${preliminaryAudit.compositePreview.publicUrl.replace(/\/[^/]+$/u, "")}/${pixelAudit.auditSha256}.json` : null;
  nextRaw.serverVisualAssessment = serverReview.assessmentSha256 ? serverReview : null;
  nextRaw.serverVisualAssessmentPublicUrl = null;
  nextRaw.semanticPixelAudit = semanticAudit;
  nextRaw.semanticPixelAuditSha256 = semanticAudit.auditSha256;
  nextRaw.semanticPixelAuditOcr = {status: ocr.status, observationCount: ocr.observationCount, text: ocr.text};
  nextRaw.semanticPixelAuditFindings = semanticAudit.findings;
  nextRaw.lightChecks = {
    ...(nextRaw.lightChecks || {}),
    decode: raw.artifact?.width >= 640 && raw.artifact?.height >= 360 ? "PASS" : "FAIL",
    dimensions: raw.artifact?.width >= 640 && raw.artifact?.height >= 360 ? "PASS" : "FAIL",
    baseFrameComposite: pixelAudit.footageCompatibility?.status === "PASS" ? "PASS" : "FAIL",
    subjectOcclusion: pixelAudit.footageCompatibility?.subjectOcclusion?.status || "UNVERIFIED",
    ocrExact: semanticAudit.checks?.ocrExactCopyAligned === true ? "PASS" : "FAIL",
    remoteCritic: "SKIPPED_BY_BOUNDED_REPAIR",
  };
  nextRaw.recommendationEligible = semanticAudit.recommendationEligible;
  nextRaw.selectionEligible = semanticAudit.recommendationEligible;
  nextRaw.assemblyEligible = false;
  nextRaw.candidateAdmissionRequired = false;
  nextRaw.reviewStatus = semanticAudit.status === "PASS" ? "ACTUAL_PIXEL_SEMANTIC_PASS" : semanticAudit.status === "REVIEW_REQUIRED" ? "VISUAL_REVIEW_RISK" : "VISUAL_REJECTED";
  nextRaw.status = semanticAudit.status === "PASS" ? "ACTUAL_PIXEL_SEMANTIC_PASS" : "VISUAL_REJECTED_ACTUAL_PIXEL_SEMANTIC_AUDIT";
  nextRaw.reviewDeferredTo = null;
  nextRaw.reviewedAt = new Date().toISOString();
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const now = new Date().toISOString();
  const event = createProductionEvent({workspace: current, action: "look-master-exception-replacement-actual-pixel-gated", targetId: shotId, payload: {contract: "A1LookMasterExceptionReplacementPixelGate/v2", shotId, rawReferenceId: raw.referenceId, artifactSha256: raw.artifact.sha256, serverVisualAssessmentSha256: serverReview.assessmentSha256, pixelAuditSha256: pixelAudit.auditSha256, semanticPixelAuditSha256: semanticAudit.auditSha256, status: semanticAudit.status, recommendationEligible: semanticAudit.recommendationEligible, noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const reviewName = `look-master-exception-repair-v2/reviews/${shotId.toLowerCase()}-${raw.artifact.sha256.slice(0, 16)}.json`;
  const report = {contract: "A1LookMasterExceptionReplacementReviewReport/v2", status: "PASS", shotId, rawReferenceId: raw.referenceId, artifactSha256: raw.artifact.sha256, workspaceSha256Before: current.workspaceSha256, serverReviewStatus: serverReview.status, visualReviewStarted: Boolean(serverReview.assessmentSha256), serverVisualAssessmentSha256: serverReview.assessmentSha256, preliminaryFootageCompatibility: preliminaryAudit.footageCompatibility, pixelAuditStatus: pixelAudit.status, pixelAuditSha256: pixelAudit.auditSha256, semanticStatus: semanticAudit.status, recommendationEligible: semanticAudit.recommendationEligible, findings: semanticAudit.findings, ocr: {status: ocr.status, observationCount: ocr.observationCount, text: ocr.text}, research: {networkDecision: plan.networkDecision, sourcePacketSha256: packet?.packetSha256 || null, referenceSentToImageGen: raw.researchReferenceUseProof?.sentToImageGen === true, sourceEvidenceMatch: serverReview.sourceEvidenceMatch || null}, queue: persisted.production.generation.summary, worker: persisted.production.generation.workerStatus, assembly: persisted.production.shotIntelligence.currentAssembly.length, downstream: {assembly: false, layers: false, critic: false, motion: false}, generatedAt: now};
  const committed = persistProjectState(appRoot, persisted, {event, files: {[reviewName]: {report, serverReview, pixelAudit, semanticAudit}}, expectedWorkspaceSha256: current.workspaceSha256, commitId: `look-master-exception-repair-${shotId.toLowerCase()}-gate-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, checkpointJournal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
