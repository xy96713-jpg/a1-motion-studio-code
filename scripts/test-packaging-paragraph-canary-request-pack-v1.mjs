#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackagingParagraphCanaryPlan} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-plan-v1.mjs";
import {assertPackagingParagraphCanaryLiveInputs, assertPackagingParagraphCanaryRequestPack, buildPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const fixture = structuredClone(workspace);
fixture.production.authority.nextAction = {id: "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY", label: "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY", requiresUser: true, targetShotIds: ["ED-12", "ED-13", "ED-14"], reviewGate: "PACKAGING_PARAGRAPH_CANARY_AUTHORIZATION"};
const plan = buildPackagingParagraphCanaryPlan(fixture, {appRoot});
const first = assertPackagingParagraphCanaryRequestPack(buildPackagingParagraphCanaryRequestPack(fixture, plan, {appRoot, now: "2026-08-12T19:00:00.000Z"}));
const second = assertPackagingParagraphCanaryRequestPack(buildPackagingParagraphCanaryRequestPack(fixture, plan, {appRoot, now: "2026-08-13T07:00:00.000Z"}));
assert.equal(first.packSha256, second.packSha256);
assert.deepEqual(first.requests.map((request) => request.executionKind), ["DETERMINISTIC_EXACT_SOURCE_COMPOSITE", "IMAGEGEN_TEXTLESS_MECHANISM_PLUS_RENDERER", "DETERMINISTIC_EXACT_SOURCE_COMPOSITE"]);
assert.equal(first.preflight.imageGenerationRequestCount, 1);
assert.equal(first.preflight.deterministicCompositeCount, 2);
assert.equal(first.preflight.directGlyphOutlineProofComplete, true);
assert.equal(first.preflight.typographyGeometryProofComplete, true);
assert.equal(first.preflight.typographyContrastProofComplete, true);
assert.equal(first.preflight.verifiedExactSourceBindingCount, 6);
assert.equal(first.requests[1].attachmentManifest.contract, "A1PackagingParagraphImagegenAttachmentManifest/v1");
assert.equal(first.requests[1].attachmentManifest.fileCount, first.requests[1].attachments.length);
assert.equal(first.requests[1].attachmentManifest.referenceMode, "NO_REFERENCE_IMAGES_TASTE_AUTHORITY_ONLY");
assert.equal(first.requests[1].attachments.length, 0);
assert.equal(Object.hasOwn(first.requests[1].toolCall.arguments, "referenced_image_paths"), false);
assert.equal(first.requests[1].toolCall.resultReceiptRequired, true);
assert.equal(first.requests[1].toolCall.resultReceiptContract, "A1PackagingParagraphImagegenResultReceipt/v1");
assert.equal(first.dispatchPolicy.imagegenResultMustBindRequestPromptAttachmentsAuthorizationAndOutput, true);
assert.equal(first.dispatchPolicy.objectivePixelAuditContract, "A1PackagingParagraphObjectivePixelAudit/v1");
assert.equal(first.dispatchPolicy.objectivePixelAuditRequiredBeforeVisualDirectorReview, true);
assert.equal(first.dispatchPolicy.visualDirectorActualPixelReviewRequired, true);
assert.equal(first.dispatchPolicy.visualDirectorAssessmentContract, "A1PackagingParagraphVisualDirectorAssessment/v1");
assert.equal(first.dispatchPolicy.visualDirectorAssessmentInputContract, "A1PackagingParagraphVisualDirectorAssessmentInput/v1");
assert.equal(first.dispatchPolicy.visualDirectorCompletedInputStatus, "COMPLETED_ACTUAL_PIXEL_ASSESSMENT");
assert.equal(first.dispatchPolicy.visualDirectorInputMustBindObjectivePixelAuditSha256, true);
assert.equal(first.dispatchPolicy.visualDirectorAgentMayClaimHumanStatus, false);
assert.equal(first.dispatchPolicy.subsequentHumanUserActualPixelReviewRequired, true);
assert.equal(first.paragraphStaticReview.allThreeFramesTogetherRequired, true);
assert.deepEqual(first.requests.map((request) => request.canvasPolicy.backgroundHex), ["#eef1ef", "#eef1ef", "#e9edef"]);
assert.deepEqual(first.requests.map((request) => request.canvasPolicy.accentHex), ["#c33c2d", "#c33c2d", "#007783"]);
assert.deepEqual(first.requests.map((request) => request.canvasPolicy.accentOnDarkHex), ["#ef6a4d", "#ef6a4d", "#18b8c7"]);
assert.equal(first.requests.every((request) => request.canvasPolicy.warmWashAllowed === false && request.canvasPolicy.yellowCastForbidden === true), true);
assert.equal(first.requests.every((request) => request.typography.nodes.every((node) => node.measuredContrastRatio >= 4.5 && node.minimumContrastRatio === 4.5 && node.contrastProofMethod === "WCAG_2_RELATIVE_LUMINANCE")), true);
assert.equal(first.requests[1].typography.nodes[1].fillHex, "#ef6a4d");
assert.equal(first.requests[2].typography.nodes[2].fillHex, "#007783");
assert.equal(first.playbackReview.minimumReadableDurationMs, 12858);
assert.equal(first.playbackReview.targetDurationMs, 18921);
assert.equal(first.playbackReview.sourceAlignedPlaybackDurationMs, 18921);
assert.deepEqual(first.playbackReview.timelineRange, {startMs: 51559, endMs: 70480});
assert.equal(first.playbackReview.sourceAudioMustRemainUncutAndUncompressed, true);
assert.equal(first.requests.every((request) => request.typography.nodes.every((node) => node.frameSafe === true && node.reservedRegionSafe === true && node.inkBounds.width > 0 && node.inkBounds.height > 0)), true);
assert.equal(first.requests[0].deterministicRecipe.exactSourceBindings.length, 5);
assert.equal(first.requests[0].deterministicRecipe.sourceAtlasReferences[0].productionAssetAllowed, false);
assert.equal(first.requests[0].deterministicRecipe.evidencePresentationPolicy.rankingOrCapabilityComparisonAllowed, false);
assert.equal(first.requests[2].deterministicRecipe.claimBoundary.status, "BOUND");
assert.equal(first.requests[2].deterministicRecipe.evidencePresentationPolicy.causalExpansionAllowed, false);
assert.equal(first.isolationPolicy.noDirectoryCreatedByPreflight, true);
assert.equal(first.isolationPolicy.reviewOnlyPublicationAllowedAfterObjectiveArtifactChecks, true);
assert.equal(first.isolationPolicy.productionAdmissionAllowedBeforeUserVisualApproval, false);
assert.equal(first.isolationPolicy.stableProductionWriteAllowed, false);
assert.equal(first.isolationPolicy.partialBatchAdmissionAllowed, false);
assert.equal(first.isolationPolicy.contentAddressedAdmissionRequiredAfterReview, true);
assert.equal(first.requests.every((request) => request.execution.stagingOutputPath.startsWith(`${first.isolationPolicy.stagingRoot}/`) && request.execution.reviewPublicCandidatePath.startsWith(`${first.isolationPolicy.reviewPublicRoot}/`)), true);
assert.equal(first.preflight.imageGenerationPerformed, false);
assert.equal(first.dispatchPolicy.currentlyAuthorized, false);
assert.equal(first.dispatchPolicy.exactUserAuthorizationCommand, "授权执行 Pack SHA <CURRENT_PACK_SHA256>");
assert.equal(first.dispatchPolicy.userAuthorizationCommandMustBeHashBoundAndOperatorAttested, true);
assert.deepEqual(first.dispatchPolicy.authorizationEvidenceModes, ["EXACT_PACK_SHA_COMMAND", "CURRENT_THREAD_SAFE_AUTOSTART_DIRECTIVE_BOUND_AT_ISSUANCE"]);
assert.equal(first.dispatchPolicy.safeAutostartDirectiveMustBeVerbatimOperatorAttestedAndNarrowedToCurrentPack, true);
assert.equal(first.dispatchPolicy.cryptographicUserMessageAttestationAvailable, false);
assert.deepEqual(first.requests.map((request) => request.composition.contract), ["A1PackagingParagraphCompositionRecipe/v1", "A1PackagingParagraphCompositionRecipe/v1", "A1PackagingParagraphCompositionRecipe/v1"]);
assert.deepEqual(first.requests.map((request) => request.composition.threeSecondReadingPath.length), [3, 3, 3]);
assert.equal(first.requests.every((request) => request.composition.decorativeElementsAllowed === false && request.composition.everyVisibleElementRequiresSemanticJob === true && request.composition.visibleActorGroups.length <= request.composition.maxVisibleActors), true);
assert.deepEqual(first.requests[0].composition.sourcePlacements.map((placement) => placement.sourceId), first.requests[0].deterministicRecipe.exactSourceBindings.map((binding) => binding.sourceId));
assert.equal(first.requests[0].composition.sourcePlacements.at(-1).backgroundRole, "charcoal");
assert.equal(first.requests[1].composition.sourcePlacements.length, 0);
assert.deepEqual(first.requests[2].composition.sourcePlacements.map((placement) => [placement.fit, placement.position, placement.saturation]), [["cover", "top", 0.72]]);
const liveInputs = assertPackagingParagraphCanaryLiveInputs(first, {projectRoot: path.resolve(appRoot, "../..")});
assert.equal(liveInputs.status, "PASS");
assert.deepEqual(liveInputs.kinds, {EXACT_SOURCE: 6, STYLE_REFERENCE: 0, FONT: 6});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-live-input-test-"));
try {
  const fake = structuredClone(first);
  const resolvedTempRoot = fs.realpathSync(tempRoot);
  const fakeAppRoot = path.join(resolvedTempRoot, "apps/studio-next");
  const copyBoundFile = (source, target) => {
    fs.mkdirSync(path.dirname(target), {recursive: true});
    if (!fs.existsSync(target)) fs.copyFileSync(source, target);
    return target;
  };
  for (const request of fake.requests) {
    for (const font of request.typography.fonts) font.absolutePath = copyBoundFile(first.requests.find((item) => item.shotId === request.shotId).typography.fonts.find((item) => item.assetId === font.assetId).absolutePath, path.join(fakeAppRoot, font.projectRelativePath));
    for (const [index, attachment] of request.attachments.entries()) {
      const original = first.requests.find((item) => item.shotId === request.shotId).attachments[index];
      attachment.absolutePath = copyBoundFile(original.absolutePath, path.join(fakeAppRoot, "public", attachment.publicUrl.replace(/^\/+/, "")));
      request.toolCall.arguments.referenced_image_paths[index] = attachment.absolutePath;
    }
    for (const [index, source] of (request.deterministicRecipe?.exactSourceBindings || []).entries()) {
      const original = first.requests.find((item) => item.shotId === request.shotId).deterministicRecipe.exactSourceBindings[index];
      const target = source.publicUrl ? path.join(fakeAppRoot, "public", source.publicUrl.replace(/^\/+/, "")) : path.join(resolvedTempRoot, source.projectRelativePath);
      source.absolutePath = copyBoundFile(original.absolutePath, target);
    }
  }
  assert.equal(assertPackagingParagraphCanaryLiveInputs(fake, {projectRoot: resolvedTempRoot}).status, "PASS");
  fs.appendFileSync(fake.requests[1].typography.fonts[0].absolutePath, "tamper");
  assert.throws(() => assertPackagingParagraphCanaryLiveInputs(fake, {projectRoot: resolvedTempRoot}), /live-inputs-invalid:sha/u);
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}

const forgedEd12 = structuredClone(first);
forgedEd12.requests[0].deterministicRecipe.sourceAtlasReferences[0].productionAssetAllowed = true;
forgedEd12.packSha256 = first.packSha256;
assert.throws(() => assertPackagingParagraphCanaryRequestPack(forgedEd12), /sha|ed12-component-rebind/u);
const forgedGeometry = structuredClone(first);
forgedGeometry.requests[1].typography.nodes[0].frameSafe = false;
forgedGeometry.packSha256 = first.packSha256;
assert.throws(() => assertPackagingParagraphCanaryRequestPack(forgedGeometry), /sha|typography/u);
const forgedContrast = structuredClone(first);
forgedContrast.requests[2].typography.nodes[2].measuredContrastRatio = 2.157;
forgedContrast.packSha256 = first.packSha256;
assert.throws(() => assertPackagingParagraphCanaryRequestPack(forgedContrast), /sha|typography/u);
const forgedIsolation = structuredClone(first);
forgedIsolation.isolationPolicy.partialBatchAdmissionAllowed = true;
forgedIsolation.packSha256 = first.packSha256;
assert.throws(() => assertPackagingParagraphCanaryRequestPack(forgedIsolation), /sha|isolation/u);
const forgedClaim = structuredClone(first);
forgedClaim.requests[2].deterministicRecipe.evidencePresentationPolicy.causalExpansionAllowed = true;
forgedClaim.packSha256 = first.packSha256;
assert.throws(() => assertPackagingParagraphCanaryRequestPack(forgedClaim), /sha|ed14-claim-boundary/u);
const forgedAttachmentManifest = structuredClone(first);
forgedAttachmentManifest.requests[1].attachmentManifest.manifestSha256 = "f".repeat(64);
forgedAttachmentManifest.packSha256 = first.packSha256;
assert.throws(() => assertPackagingParagraphCanaryRequestPack(forgedAttachmentManifest), /sha|ed13/u);
const forgedComposition = structuredClone(first);
forgedComposition.requests[0].composition.structuralActors[0].semanticJob = "";
forgedComposition.packSha256 = first.packSha256;
assert.throws(() => assertPackagingParagraphCanaryRequestPack(forgedComposition), /sha|composition/u);

console.log(JSON.stringify({status: "PASS", contract: first.contract, packSha256: first.packSha256, canaryPlanSha256: first.source.canaryPlanSha256, shotIds: first.requests.map((request) => request.shotId), executionKinds: first.requests.map((request) => request.executionKind), imageGenerationRequestCount: first.preflight.imageGenerationRequestCount, deterministicCompositeCount: first.preflight.deterministicCompositeCount, verifiedExactSourceBindingCount: first.preflight.verifiedExactSourceBindingCount, formalCopyRunCount: first.preflight.formalCopyRunCount, typographyGeometryProofComplete: first.preflight.typographyGeometryProofComplete, typographyContrastProofComplete: first.preflight.typographyContrastProofComplete, minimumReadableDurationMs: first.playbackReview.minimumReadableDurationMs, targetPlaybackDurationMs: first.playbackReview.targetDurationMs, exactUserAuthorizationCommand: first.dispatchPolicy.exactUserAuthorizationCommand, authorizationMustBeHashBoundAndOperatorAttested: first.dispatchPolicy.userAuthorizationCommandMustBeHashBoundAndOperatorAttested, stagingIsolated: true, imageGenerationPerformed: false}, null, 2));
