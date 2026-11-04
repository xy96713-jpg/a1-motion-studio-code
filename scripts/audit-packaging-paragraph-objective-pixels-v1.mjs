#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";
import {buildPackagingParagraphCanaryImplementationBinding} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-implementation-binding-v1.mjs";
import {assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {assertPackagingParagraphImagegenResultReceipt} from "../apps/studio-next/src/lib/a1-packaging-paragraph-imagegen-result-v1.mjs";
import {assertPackagingParagraphObjectivePixelAudit, assertPackagingParagraphPostGenerationAuditRepair, assertPackagingParagraphReviewBatch, assertPackagingParagraphReviewPresentation, buildPackagingParagraphObjectivePixelAudit, createPackagingParagraphReviewPresentation} from "../apps/studio-next/src/lib/a1-packaging-paragraph-objective-pixel-audit-v1.mjs";
import {readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const packPath = path.join(artifactRoot, "packaging-paragraph-canary-request-pack.json");
const preflightPath = path.join(artifactRoot, "packaging-paragraph-canary-preflight.json");
const imagegenReceiptPath = process.env.A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_RESULT_RECEIPT;
if (!imagegenReceiptPath) throw new Error("paragraph-objective-pixel-audit-imagegen-result-receipt-required");
const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(packPath, "utf8")));
const current = readCurrentProductionAuthorizationBinding(appRoot);
const implementation = buildPackagingParagraphCanaryImplementationBinding(projectRoot);
const reviewRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-review-v1", pack.source.canaryPlanSha256);
const manifestPath = path.join(reviewRoot, "manifest.json");
if (!fs.existsSync(manifestPath)) throw new Error("paragraph-objective-pixel-audit-review-batch-required");
const rawManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const manifest = assertPackagingParagraphReviewBatch(rawManifest, {pack, reviewRoot, implementationSha256: rawManifest.implementationSha256, current});
let auditRepair = null;
const existingAuditPath = path.join(reviewRoot, "objective-pixel-audit-v1/objective-pixel-audit.json");
if (manifest.implementationSha256 !== implementation.implementationSha256) {
  const repairPath = process.env.A1_PACKAGING_PARAGRAPH_POST_GENERATION_AUDIT_REPAIR;
  if (!repairPath || !fs.existsSync(repairPath) || !fs.existsSync(existingAuditPath)) throw new Error("paragraph-objective-pixel-audit-repair-evidence-required");
  auditRepair = assertPackagingParagraphPostGenerationAuditRepair(JSON.parse(fs.readFileSync(repairPath, "utf8")), {pack, manifest, currentImplementation: implementation, preflightPath, priorAuditPath: existingAuditPath, reviewRoot});
}
const ed13Request = pack.requests.find((request) => request.shotId === "ED-13");
const imagegenResultRoot = path.join(artifactRoot, "packaging-paragraph-imagegen-results");
const imagegenReceipt = await assertPackagingParagraphImagegenResultReceipt(JSON.parse(fs.readFileSync(imagegenReceiptPath, "utf8")), {requestPackSha256: pack.packSha256, requestSha256: ed13Request.requestSha256, requestId: ed13Request.requestId, promptSha256: ed13Request.toolCall.promptSha256, attachmentManifestSha256: ed13Request.attachmentManifest.manifestSha256, attachmentSourceSha256s: ed13Request.attachmentManifest.entries.map((entry) => entry.sha256), authorizationReceiptSha256: manifest.authorizationReceiptSha256, artifactRoot: imagegenResultRoot, inspectArtifact: async ({artifactPath, bytes}) => { const metadata = await sharp(bytes).metadata(); return {contract: "A1DecodedImageInspection/v1", method: "SHARP_DECODED_ACTUAL_BYTES", artifactPath, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, width: metadata.width, height: metadata.height, format: metadata.format}; }});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-objective-pixel-"));
let humanDetection;
try {
  const binary = path.join(tempRoot, "a1-local-vision-human-bounds");
  const compile = spawnSync("swiftc", [path.join(projectRoot, "scripts/run-local-vision-human-bounds-v1.swift"), "-o", binary], {encoding: "utf8"});
  if (compile.status !== 0) throw new Error(`paragraph-objective-pixel-audit-human-compile-failed:${compile.stderr.trim()}`);
  const probe = spawnSync(binary, [imagegenReceipt.output.artifactPath], {encoding: "utf8"});
  if (probe.status !== 0) throw new Error(`paragraph-objective-pixel-audit-human-probe-failed:${probe.stderr.trim()}`);
  humanDetection = JSON.parse(probe.stdout.trim());
  if (humanDetection.status !== "PASS") throw new Error("paragraph-objective-pixel-audit-human-probe-blocked");
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}

const audit = assertPackagingParagraphObjectivePixelAudit(await buildPackagingParagraphObjectivePixelAudit({pack, manifest, reviewRoot, imagegenArtifactPath: imagegenReceipt.output.artifactPath, imagegenReceiptSha256: imagegenReceipt.receiptSha256, humanDetection, ocrAudit: imagegenReceipt.ocrAudit, auditImplementationSha256: implementation.implementationSha256}), {workspaceSha256: current.workspaceSha256, transitionSha256: current.transitionSha256, storyboardRevisionSha256: pack.source.storyboardRevisionSha256, planSha256: pack.source.canaryPlanSha256, requestPackSha256: pack.packSha256, implementationSha256: implementation.implementationSha256, reviewBatchManifestSha256: manifest.manifestSha256, imagegenResultReceiptSha256: imagegenReceipt.receiptSha256});
const assessmentTemplate = {contract: "A1PackagingParagraphVisualDirectorAssessmentInput/v1", status: "UNREVIEWED_ACTUAL_PIXELS_REQUIRED", objectivePixelAuditSha256: audit.auditSha256, reviewer: {kind: "visual-director-agent", id: "codex-a1-visual-director", model: "UNSET", human: false, mayClaimHumanStatus: false, assessedAt: "UNSET_AFTER_ACTUAL_PIXEL_INSPECTION"}, items: pack.requests.map((request) => ({shotId: request.shotId, paragraphRole: request.paragraphRole, artifactSha256: audit.items.find((item) => item.shotId === request.shotId).artifact.sha256, expectedVisibleAction: request.actualPixelReviewTemplate.expectedVisibleAction, threeSecondRead: "UNREVIEWED", visibleAction: "UNREVIEWED", focalActor: "UNREVIEWED", visualThesisObserved: "UNREVIEWED", compositionEvidence: "UNREVIEWED", typographyEvidence: "UNREVIEWED", weaknesses: [], coreCheckResults: request.actualPixelReviewTemplate.tasteScorecard.coreChecks.map((check) => ({id: check.id, result: "UNREVIEWED", evidence: "UNREVIEWED"})), hardFailureResults: request.actualPixelReviewTemplate.tasteScorecard.hardFailures.map((id) => ({id, present: null, evidence: "UNREVIEWED"}))})), paragraph: {evidenceToMechanism: {result: "UNREVIEWED", evidence: "UNREVIEWED"}, mechanismToVerdict: {result: "UNREVIEWED", evidence: "UNREVIEWED"}, roleDifferentiation: {result: "UNREVIEWED", evidence: "UNREVIEWED"}, densityProgression: {result: "UNREVIEWED", evidence: "UNREVIEWED"}, singleParagraphRead: {result: "UNREVIEWED", evidence: "UNREVIEWED"}, strongestHandoff: "UNREVIEWED", weakestHandoff: "UNREVIEWED", repairInstruction: null}, boundary: {templateIsNotReview: true, agentMayNotClaimHumanStatus: true, userVisualApproval: "NOT_APPROVED", productionAdmissionAllowed: false, workspaceMutationAllowed: false}};
const reviewFiles = manifest.outputs.map((output) => path.join(reviewRoot, output.fileName));
const stripBuffer = await sharp({create: {width: 1920, height: 360, channels: 4, background: "#181b1c"}}).composite(await Promise.all(reviewFiles.map(async (file, index) => ({input: await sharp(file).resize(640, 360, {fit: "fill"}).png().toBuffer(), left: index * 640, top: 0})))).png({compressionLevel: 9}).toBuffer();
const assessmentTemplateBuffer = Buffer.from(`${JSON.stringify(assessmentTemplate, null, 2)}\n`);
const presentation = createPackagingParagraphReviewPresentation({audit, reviewRoot, stripBuffer, assessmentTemplateBuffer});
const auditRoot = path.join(reviewRoot, "objective-pixel-audit-v1");
const stagingRoot = path.join(reviewRoot, ".objective-pixel-audit-v1.staging");
const reportPath = path.join(auditRoot, "objective-pixel-audit.json");
const stripPath = path.join(auditRoot, "paragraph-review-strip.png");
const assessmentTemplatePath = path.join(auditRoot, "visual-director-assessment-input-template.json");
const presentationPath = path.join(auditRoot, "review-presentation-manifest.json");
const stagingReportPath = path.join(stagingRoot, "objective-pixel-audit.json");
const stagingStripPath = path.join(stagingRoot, "paragraph-review-strip.png");
const stagingAssessmentTemplatePath = path.join(stagingRoot, "visual-director-assessment-input-template.json");
const stagingPresentationPath = path.join(stagingRoot, "review-presentation-manifest.json");
if ((!auditRepair && fs.existsSync(auditRoot)) || fs.existsSync(stagingRoot)) throw new Error("paragraph-objective-pixel-audit-target-must-be-new");
let published = false;
let priorMoved = false;
let priorHistoryRoot = null;
try {
  fs.mkdirSync(stagingRoot, {recursive: true});
  fs.writeFileSync(stagingReportPath, `${JSON.stringify(audit, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
  fs.writeFileSync(stagingStripPath, stripBuffer, {flag: "wx"});
  fs.writeFileSync(stagingAssessmentTemplatePath, assessmentTemplateBuffer, {flag: "wx"});
  fs.writeFileSync(stagingPresentationPath, `${JSON.stringify(presentation, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
  if (auditRepair) {
    priorHistoryRoot = path.join(reviewRoot, "objective-pixel-audit-v1-history", auditRepair.source.priorObjectivePixelAuditSha256);
    if (fs.existsSync(priorHistoryRoot)) throw new Error("paragraph-objective-pixel-audit-prior-history-must-be-new");
    fs.mkdirSync(path.dirname(priorHistoryRoot), {recursive: true});
    fs.renameSync(auditRoot, priorHistoryRoot);
    priorMoved = true;
    const preflightHistoryPath = path.join(artifactRoot, "packaging-paragraph-canary-preflight-history", `${auditRepair.source.preflightFileSha256}.json`);
    fs.mkdirSync(path.dirname(preflightHistoryPath), {recursive: true});
    if (!fs.existsSync(preflightHistoryPath)) fs.copyFileSync(preflightPath, preflightHistoryPath, fs.constants.COPYFILE_EXCL);
  }
  fs.renameSync(stagingRoot, auditRoot);
  published = true;
  assertPackagingParagraphReviewPresentation(JSON.parse(fs.readFileSync(presentationPath, "utf8")), {audit, reviewRoot});
} finally {
  if (!published && fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, {recursive: true, force: true});
  if (!published && priorMoved && priorHistoryRoot && fs.existsSync(priorHistoryRoot) && !fs.existsSync(auditRoot)) fs.renameSync(priorHistoryRoot, auditRoot);
}
console.log(JSON.stringify({status: audit.status, auditSha256: audit.auditSha256, reportPath, stripPath, assessmentTemplatePath, presentationPath, presentationSha256: presentation.presentationSha256, auditRepairSha256: auditRepair?.repairSha256 || null, mediaRewritten: false, regenerationPerformed: false, recompositionPerformed: false, itemStatuses: audit.items.map((item) => ({shotId: item.shotId, status: item.status, machineFailures: item.machineFailures})), sequenceDifference: audit.sequenceDifference, visualDirectorDecision: "PENDING", machinePassCannotApprove: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, workspaceMutationPerformed: false, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}, null, 2));
