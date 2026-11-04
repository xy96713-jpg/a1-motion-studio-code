#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";
import {createPackagingParagraphCanaryAuthorization} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-authorization-v1.mjs";
import {A1_PACKAGING_PARAGRAPH_CANARY_IMPLEMENTATION_FILES, buildPackagingParagraphCanaryImplementationBinding} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-implementation-binding-v1.mjs";
import {assertPackagingParagraphCanaryLifecycle, packagingParagraphCanaryLifecyclePaths, readPackagingParagraphCanaryLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs";
import {createPackagingParagraphImagegenResultReceipt} from "../apps/studio-next/src/lib/a1-packaging-paragraph-imagegen-result-v1.mjs";
import {createPackagingParagraphReviewPresentation} from "../apps/studio-next/src/lib/a1-packaging-paragraph-review-evidence-v1.mjs";
import {createPackagingParagraphVisualDirectorAssessment} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-director-assessment-v1.mjs";

const sourceRoot = path.resolve(import.meta.dirname, "..");
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-lifecycle-test-"));
const appRoot = path.join(testRoot, "apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const canonicalHash = (value) => sha256(JSON.stringify(canonicalize(value)));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

try {
  for (const relativePath of A1_PACKAGING_PARAGRAPH_CANARY_IMPLEMENTATION_FILES) {
    const target = path.join(testRoot, relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(sourceRoot, relativePath), target);
  }
  const sourcePackPath = path.join(sourceRoot, "test-fixtures/packaging-paragraph-canary-v1/request-pack.json");
  const pack = JSON.parse(fs.readFileSync(sourcePackPath, "utf8"));
  const paths = packagingParagraphCanaryLifecyclePaths(appRoot, pack.source.canaryPlanSha256, pack.packSha256);
  fs.mkdirSync(path.dirname(paths.pack), {recursive: true});
  fs.copyFileSync(sourcePackPath, paths.pack);
  const workspaceFileSha256 = "b".repeat(64);
  const transitionSha256 = "c".repeat(64);
  writeJson(paths.phase, {contract: "A1SystemLineCurrentPhase/v2", status: "VISUAL_REPAIR_REQUIRED", transitionSha256, authority: {workspaceSha256: pack.source.workspaceSha256, workspaceFileSha256}, reviewDecision: {userVisualApproval: "NOT_APPROVED", motionAllowed: false, finalRenderAllowed: false}});
  const implementation = buildPackagingParagraphCanaryImplementationBinding(testRoot);
  const expectedSource = {workspaceSha256: pack.source.workspaceSha256, workspaceFileSha256, transitionSha256, storyboardRevisionSha256: pack.source.storyboardRevisionSha256, planSha256: pack.source.canaryPlanSha256, requestPackSha256: pack.packSha256, implementationSha256: implementation.implementationSha256};

  const statuses = [];
  const read = () => {
    const lifecycle = assertPackagingParagraphCanaryLifecycle(readPackagingParagraphCanaryLifecycle(appRoot, {refresh: true}));
    statuses.push(lifecycle.status);
    assert.equal(lifecycle.boundary.userVisualApproval, "NOT_APPROVED");
    assert.equal(lifecycle.boundary.motionAllowed, false);
    return lifecycle;
  };
  assert.equal(read().status, "AWAITING_EXPLICIT_USER_AUTHORIZATION");

  const authorization = createPackagingParagraphCanaryAuthorization({authorizationId: "fixture-authorization", authorized: true, issuedBy: "lifecycle-test", intent: "one bounded paragraph canary", userAuthorizationText: `授权执行 Pack SHA ${pack.packSha256}`, operatorAttestedUserMessage: true, ...expectedSource, canaryPlanSha256: expectedSource.planSha256, issuedAt: "2026-08-12T22:00:00.000Z"});
  writeJson(path.join(paths.authorizationRoot, "fixture-authorization.json"), authorization);
  assert.equal(read().status, "AUTHORIZED_AWAITING_ED13_IMAGEGEN");

  const ed13 = pack.requests.find((request) => request.shotId === "ED-13");
  const imagegenBytes = await sharp({create: {width: 1536, height: 864, channels: 4, background: "#dce5e2"}}).png().toBuffer();
  const imagegenSha256 = sha256(imagegenBytes);
  const imagegenArtifactPath = path.join(paths.imagegenRoot, `${imagegenSha256}.png`);
  fs.mkdirSync(paths.imagegenRoot, {recursive: true});
  fs.writeFileSync(imagegenArtifactPath, imagegenBytes);
  const imagegenReceipt = createPackagingParagraphImagegenResultReceipt({shotId: "ED-13", tool: "image_gen.imagegen", operatorAttested: true, requestPackSha256: pack.packSha256, requestSha256: ed13.requestSha256, requestId: ed13.requestId, promptSha256: ed13.toolCall.promptSha256, attachmentManifestSha256: ed13.attachmentManifest.manifestSha256, attachmentSourceSha256s: ed13.attachmentManifest.entries.map((entry) => entry.sha256), authorizationReceiptSha256: authorization.receiptSha256, model: "fixture-model", executionId: "fixture-execution", startedAt: "2026-08-12T22:01:00.000Z", completedAt: "2026-08-12T22:01:01.000Z", durationMs: 1000, artifactPath: imagegenArtifactPath, outputSha256: imagegenSha256, outputBytes: imagegenBytes.length, width: 1536, height: 864, format: "png", ocrAudit: {contract: "A1LocalVisionOCRAudit/v1", status: "PASS_NO_READABLE_TEXT_DETECTED", method: "MACOS_VISION_ACCURATE_ZH_EN", sourceSha256: imagegenSha256, readableTextDetected: false, recognizedText: ""}, recordedAt: "2026-08-12T22:01:02.000Z"});
  writeJson(path.join(paths.imagegenRoot, `${imagegenSha256}.receipt.json`), imagegenReceipt);
  assert.equal(read().status, "IMAGEGEN_RECORDED_AWAITING_STATIC_COMPOSITE");

  fs.mkdirSync(paths.reviewRoot, {recursive: true});
  const outputs = [];
  for (const [index, request] of pack.requests.entries()) {
    const bytes = await sharp({create: {width: 1920, height: 1080, channels: 4, background: index === 0 ? "#eef1ef" : index === 1 ? "#dce5e2" : "#e9edef"}}).png().toBuffer();
    const fileName = `${request.shotId}.png`;
    fs.writeFileSync(path.join(paths.reviewRoot, fileName), bytes);
    outputs.push({shotId: request.shotId, fileName, sha256: sha256(bytes), bytes: bytes.length, width: 1920, height: 1080, format: "png", styleBriefSha256: request.authority.styleBriefSha256, requestSha256: request.requestSha256, machineStatus: "READY_FOR_ACTUAL_PIXEL_REVIEW", productionAdmitted: false, userVisualApproval: "NOT_APPROVED"});
  }
  const manifestBody = {contract: "A1PackagingParagraphCanaryReviewBatch/v1", status: "READY_FOR_ACTUAL_PIXEL_REVIEW", reviewOnly: true, productionAdmitted: false, userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false, workspaceSha256: expectedSource.workspaceSha256, workspaceFileSha256, transitionSha256, storyboardRevisionSha256: expectedSource.storyboardRevisionSha256, planSha256: expectedSource.planSha256, requestPackSha256: pack.packSha256, implementationSha256: implementation.implementationSha256, authorizationReceiptSha256: authorization.receiptSha256, imagegenInput: {resultReceiptSha256: imagegenReceipt.receiptSha256, requestSha256: imagegenReceipt.requestSha256, promptSha256: imagegenReceipt.promptSha256, attachmentManifestSha256: imagegenReceipt.attachmentManifestSha256, executionId: imagegenReceipt.generation.executionId, operatorAttested: true, cryptographicProviderAttestationAvailable: false, sha256: imagegenSha256, bytes: imagegenBytes.length, ocrStatus: imagegenReceipt.ocrAudit.status, productionEvidenceAllowed: false}, outputs, paragraphReview: {roleSequence: ["EVIDENCE", "MECHANISM", "VERDICT"], allThreeActualPixelPassRequired: true, objectivePixelAuditRequired: true, objectivePixelAuditContract: "A1PackagingParagraphObjectivePixelAudit/v1", objectivePixelAuditEntrypoint: "scripts/audit-packaging-paragraph-objective-pixels-v1.mjs", visualDirectorReviewRequired: true, allThreeFramesTogetherRequired: true, machinePassCannotApprove: true, targetPlaybackDurationMs: pack.playbackReview.targetDurationMs}, publishedAt: "2026-08-12T22:02:00.000Z"};
  const manifest = {...manifestBody, manifestSha256: sha256(JSON.stringify(manifestBody))};
  writeJson(paths.manifest, manifest);
  assert.equal(read().status, "STATIC_REVIEW_BATCH_READY_AWAITING_OBJECTIVE_AUDIT");

  const objectiveSource = {workspaceSha256: expectedSource.workspaceSha256, transitionSha256, storyboardRevisionSha256: expectedSource.storyboardRevisionSha256, planSha256: expectedSource.planSha256, requestPackSha256: pack.packSha256, implementationSha256: implementation.implementationSha256, reviewBatchManifestSha256: manifest.manifestSha256, imagegenResultReceiptSha256: imagegenReceipt.receiptSha256};
  const objectiveBody = {contract: "A1PackagingParagraphObjectivePixelAudit/v1", version: 1, status: "READY_FOR_VISUAL_DIRECTOR_AGENT_ASSESSMENT", reviewOnly: true, source: objectiveSource, items: pack.requests.map((request, index) => ({shotId: request.shotId, paragraphRole: request.paragraphRole, status: "OBJECTIVE_PIXEL_PASS_REVIEW_ONLY", artifact: {path: path.join(paths.reviewRoot, outputs[index].fileName), sha256: outputs[index].sha256, bytes: outputs[index].bytes, width: 1920, height: 1080, format: "png", status: "PASS"}, typography: {status: "PASS"}, sourceFidelity: {status: "PASS"}, expectedVisibleAction: request.actualPixelReviewTemplate.expectedVisibleAction, tasteScorecard: {}, machineFailures: [], visualDirectorDecision: "PENDING", userVisualApproval: "NOT_APPROVED", productionAdmitted: false})), sequenceDifference: {status: "PASS"}, failures: [], machineScope: {machinePassCannotApprove: true}, nextReview: {requiredReviewerKind: "visual-director-agent-assessment", reviewerMayClaimHumanStatus: false, subsequentHumanUserActualPixelReviewRequired: true, userVisualApprovalStillRequired: true}, boundary: {productionAdmissionAllowed: false, workspaceMutationAllowed: false, visualApprovedWriteAllowed: false, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false, userVisualApproval: "NOT_APPROVED"}};
  const objectiveAudit = {...objectiveBody, auditSha256: canonicalHash(objectiveBody)};
  writeJson(paths.objectiveAudit, objectiveAudit);
  const stripBuffer = await sharp({create: {width: 1920, height: 360, channels: 4, background: "#181b1c"}}).png().toBuffer();
  const template = {contract: "A1PackagingParagraphVisualDirectorAssessmentInput/v1", status: "UNREVIEWED_ACTUAL_PIXELS_REQUIRED", objectivePixelAuditSha256: objectiveAudit.auditSha256};
  const templateBuffer = Buffer.from(`${JSON.stringify(template, null, 2)}\n`);
  const presentation = createPackagingParagraphReviewPresentation({audit: objectiveAudit, stripBuffer, assessmentTemplateBuffer: templateBuffer});
  const objectiveRoot = path.dirname(paths.objectiveAudit);
  fs.writeFileSync(path.join(objectiveRoot, "paragraph-review-strip.png"), stripBuffer);
  fs.writeFileSync(path.join(objectiveRoot, "visual-director-assessment-input-template.json"), templateBuffer);
  writeJson(paths.reviewPresentation, presentation);
  const objectiveLifecycle = read();
  assert.equal(objectiveLifecycle.status, "OBJECTIVE_PIXEL_PASS_AWAITING_VISUAL_DIRECTOR");
  assert.equal(objectiveLifecycle.review.stripPublicUrl, `/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-review-v1/${pack.source.canaryPlanSha256}/objective-pixel-audit-v1/paragraph-review-strip.png`);

  const passItems = pack.requests.map((request, index) => ({shotId: request.shotId, paragraphRole: request.paragraphRole, artifactSha256: outputs[index].sha256, expectedVisibleAction: request.actualPixelReviewTemplate.expectedVisibleAction, threeSecondRead: "PASS", visibleAction: "PASS", focalActor: `decisive actor ${request.shotId}`, visualThesisObserved: `specific observed visual thesis for ${request.shotId}`, compositionEvidence: `asymmetric crop and scale hierarchy observed in ${request.shotId}`, typographyEvidence: `formal local glyphs remain readable in ${request.shotId}`, weaknesses: [], coreCheckResults: request.actualPixelReviewTemplate.tasteScorecard.coreChecks.map((check) => ({id: check.id, result: "PASS", evidence: `actual pixel evidence for ${check.id} in ${request.shotId}`})), hardFailureResults: request.actualPixelReviewTemplate.tasteScorecard.hardFailures.map((id) => ({id, present: false, evidence: `not observed in actual pixels for ${request.shotId}`}))}));
  const paragraph = {evidenceToMechanism: {result: "PASS", evidence: "evidence actor hands off to the causal mechanism"}, mechanismToVerdict: {result: "PASS", evidence: "mechanism hands off to the bounded research verdict"}, roleDifferentiation: {result: "PASS", evidence: "evidence mechanism and verdict remain visibly distinct"}, densityProgression: {result: "PASS", evidence: "quiet collision and dense profiles progress deliberately"}, singleParagraphRead: {result: "PASS", evidence: "three frames read as one causal editorial paragraph"}, strongestHandoff: "mechanism to bounded verdict", weakestHandoff: "evidence to mechanism remains readable", repairInstruction: null};
  const assessment = createPackagingParagraphVisualDirectorAssessment({contract: "A1PackagingParagraphVisualDirectorAssessmentInput/v1", status: "COMPLETED_ACTUAL_PIXEL_ASSESSMENT", objectivePixelAuditSha256: objectiveAudit.auditSha256, reviewer: {kind: "visual-director-agent", id: "fixture-visual-director", model: "fixture-model", human: false, mayClaimHumanStatus: false, assessedAt: "2026-08-12T22:03:00.000Z"}, items: passItems, paragraph, pack, objectiveAudit});
  writeJson(paths.visualDirectorAssessment, assessment);
  const finalLifecycle = read();
  assert.equal(finalLifecycle.status, "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW");
  assert.equal(finalLifecycle.nextAction.requiresUser, true);

  fs.appendFileSync(path.join(paths.reviewRoot, "ED-12.png"), "tamper");
  const tampered = read();
  assert.equal(tampered.status, "INTEGRITY_BLOCKED");
  assert.ok(tampered.failures.some((failure) => failure.includes("review-batch")));

  console.log(JSON.stringify({status: "PASS", contract: finalLifecycle.contract, statuses, finalStatusBeforeTamper: finalLifecycle.status, tamperStatus: tampered.status, noWorkspaceReadRequired: true, noRecursiveMediaTreeScan: true, lifecycleBoundaryPreserved: true}, null, 2));
} finally {
  fs.rmSync(testRoot, {recursive: true, force: true});
}
