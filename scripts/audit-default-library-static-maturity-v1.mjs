#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertDefaultDesignAssetLibraryPlan} from "../apps/studio-next/src/lib/a1-default-design-asset-library-v1.mjs";
import {assertImagegenElementKitContinuation} from "../apps/studio-next/src/lib/a1-imagegen-element-kit-library-v1.mjs";
import {assertDefaultTypographyTemplateContinuation} from "../apps/studio-next/src/lib/a1-default-typography-template-review-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const phaseRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const checks = [];
const add = (id, pass, detail) => checks.push({id, status: pass ? "PASS" : "FAIL", detail});
const publicFile = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\//u, ""));

const workspacePublicPath = path.join(phaseRoot, "workspace.json");
const workspaceArtifactPath = path.join(artifactRoot, "workspace.json");
const workspace = readJson(workspacePublicPath);
const authority = workspace.production.articleAssetProductionAuthority;
const planPublicPath = path.join(phaseRoot, "default-design-asset-library-v1/plan.json");
const planArtifactPath = path.join(artifactRoot, "default-design-asset-library-v1/plan.json");
const plan = assertDefaultDesignAssetLibraryPlan(readJson(planPublicPath));

add("workspace-public-artifact-parity", shaFile(workspacePublicPath) === shaFile(workspaceArtifactPath), {publicSha256: shaFile(workspacePublicPath), artifactSha256: shaFile(workspaceArtifactPath)});
add("plan-public-artifact-parity", shaFile(planPublicPath) === shaFile(planArtifactPath), {publicSha256: shaFile(planPublicPath), artifactSha256: shaFile(planArtifactPath)});

const backgroundContinuation = authority.imagegenBackgroundContinuation;
const backgrounds = backgroundContinuation?.review?.candidates || [];
const backgroundTierCounts = {universal: backgrounds.filter((item) => item.libraryTier === "UNIVERSAL").length, emphasis: backgrounds.filter((item) => item.libraryTier === "EMPHASIS").length, roleSpecific: backgrounds.filter((item) => item.libraryTier === "ROLE_SPECIFIC").length};
const backgroundAuthorityCount = Number(backgroundContinuation?.review?.candidateCount || 0);
add("imagegen-background-wave", backgroundContinuation?.status === "READY_FOR_USER_ACTUAL_PIXEL_REVIEW" && backgroundAuthorityCount === 24 && backgroundAuthorityCount === backgrounds.length && Object.values(backgroundTierCounts).reduce((sum, count) => sum + count, 0) === backgrounds.length && backgrounds.every((item) => item.machineStatus === "PASS" && item.currentDirectionApproved === false && item.productionAdmitted === false && fs.existsSync(publicFile(item.publicUrl)) && shaFile(publicFile(item.publicUrl)) === item.sha256), {candidateCount: backgrounds.length, authorityCandidateCount: backgroundAuthorityCount, targetCount: 24, ...backgroundTierCounts});

const elementContinuation = assertImagegenElementKitContinuation(authority.imagegenElementKitContinuation);
const actors = elementContinuation.review.kits.flatMap((kit) => kit.actors);
const alphaAudits = [];
for (const actor of actors) {
  const file = publicFile(actor.publicUrl);
  const metadata = await sharp(file).metadata();
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const corners = [data[3], data[(info.width - 1) * 4 + 3], data[((info.height - 1) * info.width) * 4 + 3], data[(info.width * info.height - 1) * 4 + 3]];
  alphaAudits.push({candidateId: actor.candidateId, hashPass: shaFile(file) === actor.sha256, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha === true, cornerAlpha: corners, pass: shaFile(file) === actor.sha256 && metadata.width === 640 && metadata.height === 640 && metadata.hasAlpha === true && corners.every((alpha) => alpha <= 8)});
}
add("transparent-element-kits", actors.length === 12 && alphaAudits.every((item) => item.pass), {kitCount: elementContinuation.review.kitCount, actorCount: actors.length, failed: alphaAudits.filter((item) => !item.pass)});

const connectorContinuation = authority.imagegenProcessConnectorContinuation;
const connectorActors = connectorContinuation?.review?.kits?.flatMap((kit) => kit.actors || []) || [];
const connectorAlphaAudits = [];
for (const actor of connectorActors) {
  const file = publicFile(actor.publicUrl);
  const metadata = await sharp(file).metadata();
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const corners = [data[3], data[(info.width - 1) * 4 + 3], data[((info.height - 1) * info.width) * 4 + 3], data[(info.width * info.height - 1) * 4 + 3]];
  connectorAlphaAudits.push({candidateId: actor.candidateId, pass: shaFile(file) === actor.sha256 && metadata.width === 640 && metadata.height === 640 && metadata.hasAlpha === true && corners.every((alpha) => alpha <= 8)});
}
add("transparent-process-connectors", connectorContinuation?.status === "READY_FOR_USER_ACTUAL_PIXEL_REVIEW" && connectorActors.length === 3 && connectorContinuation.review.usagePolicy?.arrowheadsForbidden === true && connectorAlphaAudits.every((item) => item.pass), {actorCount: connectorActors.length, failed: connectorAlphaAudits.filter((item) => !item.pass)});

const typographyContinuation = assertDefaultTypographyTemplateContinuation(authority.defaultTypographyTemplateContinuation);
const templates = typographyContinuation.review.templates;
add("editable-typography-templates", templates.length === 1 && templates.every((item) => item.machineStatus === "PASS" && item.editableText === true && item.generatedFormalText === false && item.fontFallbackUsed === false && item.fontId === "type-pixel-correction" && item.fontFamily === "Fusion Pixel" && fs.existsSync(publicFile(item.publicUrl)) && shaFile(publicFile(item.publicUrl)) === item.sha256 && fs.existsSync(publicFile(item.fontPublicUrl)) && shaFile(publicFile(item.fontPublicUrl)) === item.fontFileSha256 && fs.existsSync(publicFile(item.layoutSpecPublicUrl))), {templateCount: templates.length, fontFamilies: [...new Set(templates.map((item) => item.fontFamily))], fontIds: [...new Set(templates.map((item) => item.fontId))]});
add("history-only-typography-templates", Array.isArray(typographyContinuation.review.historyOnlyTemplates) && typographyContinuation.review.historyOnlyTemplates.length === 5 && typographyContinuation.review.historyOnlyTemplates.every((item) => item.status === "SUPERSEDED" && item.historyOnly === true), {historyOnlyTemplateIds: typographyContinuation.review.historyOnlyTemplates?.map((item) => item.templateId) || []});

const shotReview = authority.shotSpecificAssetReview;
add("shot-specific-imagegen-assets", shotReview?.status === "READY_FOR_USER_ACTUAL_PIXEL_REVIEW" && shotReview.candidateCount === 3 && shotReview.candidates.every((item) => item.machineStatus === "PASS" && item.evidenceUseAllowed === false && item.productionAdmitted === false && fs.existsSync(publicFile(item.publicUrl)) && shaFile(publicFile(item.publicUrl)) === item.sha256), {candidateCount: shotReview?.candidateCount, shotIds: shotReview?.candidates?.map((item) => item.shotId)});

const mapping = authority.storyboardDefaultLibraryBinding;
const assignments = mapping?.assignments || [];
const verified = assignments.filter((item) => item.structuralCarrier === "VERIFIED_SOURCE_EVIDENCE");
const verifiedPresenters = assignments.filter((item) => ["PRESENTER_CLEAN", "PRESENTER_INTEGRATED_PACKAGE"].includes(item.structuralCarrier));
const packageAssignments = assignments.filter((item) => item.packageDecision === "PACKAGE" && item.backgroundCandidateId);
const adjacentRepeat = packageAssignments.some((item, index) => index > 0 && packageAssignments[index - 1].backgroundCandidateId === item.backgroundCandidateId);
const fiveEventFailure = packageAssignments.some((_, index) => index <= packageAssignments.length - 5 && new Set(packageAssignments.slice(index, index + 5).map((item) => item.backgroundCandidateId)).size < 3);
add("smart-storyboard-library-binding", mapping?.status === "STATIC_CANARY_READY_FOR_USER_REVIEW" && assignments.length === 34 && verified.every((item) => item.backgroundCandidateId === null && item.shotSpecificAssetId === null && item.generatedAssetMayReplaceEvidence === false) && verifiedPresenters.length === 6 && verifiedPresenters.every((item) => item.verifiedPresenterSourceRequired === true && item.facelessRerouteRequired === false && item.backgroundCandidateId === null && item.shotSpecificAssetId === null && item.generatedAssetMayReplaceEvidence === false) && assignments.find((item) => item.shotId === "ED-31")?.structuralCarrier === "PRESENTER_INTEGRATED_PACKAGE" && assignments.find((item) => item.shotId === "ED-32")?.structuralCarrier === "PRESENTER_CLEAN" && !adjacentRepeat && !fiveEventFailure, {assignmentCount: assignments.length, verifiedSourceCount: verified.length, verifiedPresenterCount: verifiedPresenters.length, presenterIntegratedShotIds: verifiedPresenters.filter((item) => item.structuralCarrier === "PRESENTER_INTEGRATED_PACKAGE").map((item) => item.shotId), presenterCleanShotIds: verifiedPresenters.filter((item) => item.structuralCarrier === "PRESENTER_CLEAN").map((item) => item.shotId), packageBackgroundEventCount: packageAssignments.length, adjacentRepeat, fiveEventFailure});

const canary = authority.storyboardLibraryStaticCanaryReview;
add("static-canary-review", canary?.status === "READY_FOR_USER_ACTUAL_PIXEL_REVIEW" && canary.canaryCount === 3 && canary.motionPerformed === false && canary.resolvePerformed === false && canary.productionAdmitted === false && canary.typography?.fontId === "type-pixel-correction" && canary.typography?.fontFamily === "Fusion Pixel" && canary.typography?.allVisibleFormalTextUsesSameFont === true && canary.typography?.generatedFormalText === false && canary.canaries.every((item) => item.typographyBinding?.fontId === "type-pixel-correction" && item.typographyBinding?.fontFamily === "Fusion Pixel" && fs.existsSync(publicFile(item.publicUrl)) && shaFile(publicFile(item.publicUrl)) === item.sha256), {canaryCount: canary?.canaryCount, shotIds: canary?.canaries?.map((item) => item.shotId), typography: canary?.typography, reviewSheet: canary?.reviewSheet});

const wholeFilmBoard = authority.defaultLibraryWholeFilmStaticBoardReview;
const wholeFilmFrames = wholeFilmBoard?.frames || [];
const presenterTypeOptions = wholeFilmBoard?.presenterTypographyStyleOptions;
const maskedPresenterTypeOption = presenterTypeOptions?.options?.find((item) => item.id === "PRESENTER_MASKED_LARGE_HEADLINE");
const expectedDistinctBackgroundCount = new Set(assignments.map((item) => item.backgroundCandidateId).filter(Boolean)).size;
add("default-library-whole-film-static-board", wholeFilmBoard?.status === "READY_FOR_USER_ACTUAL_PIXEL_REVIEW" && wholeFilmBoard?.sourceMappingSha256 === mapping?.mappingSha256 && wholeFilmBoard?.frameCount === 34 && wholeFilmFrames.length === 34 && wholeFilmBoard?.audit?.allFramesUnique === true && wholeFilmBoard?.audit?.verifiedSourceFrameCount === 15 && wholeFilmBoard?.audit?.verifiedPresenterFrameCount === 6 && wholeFilmBoard?.audit?.presenterIntegratedFrameCount === 1 && wholeFilmBoard?.audit?.presenterCleanFrameCount === 5 && wholeFilmBoard?.audit?.presenterTypographyStyleOptionCount === 2 && wholeFilmBoard?.audit?.decorativeVerticalRuleCount === 0 && presenterTypeOptions?.status === "READY_FOR_USER_ACTUAL_PIXEL_REVIEW" && presenterTypeOptions?.defaultTemplate === null && presenterTypeOptions?.optionsAreGlobalDefaults === false && presenterTypeOptions?.decorativeVerticalRulesAllowed === false && maskedPresenterTypeOption?.selectedForCurrentBoard === false && maskedPresenterTypeOption?.autoDefault === false && maskedPresenterTypeOption?.typography?.editableText === true && maskedPresenterTypeOption?.typography?.generatedFormalText === false && Boolean(maskedPresenterTypeOption?.publicUrl) && fs.existsSync(publicFile(maskedPresenterTypeOption.publicUrl)) && shaFile(publicFile(maskedPresenterTypeOption.publicUrl)) === maskedPresenterTypeOption.sha256 && wholeFilmBoard?.audit?.generatedPersonFrameCount === 0 && wholeFilmBoard?.audit?.verifiedSourcesUseGeneratedReplacement === false && wholeFilmBoard?.audit?.distinctBackgroundCount === expectedDistinctBackgroundCount && wholeFilmBoard?.audit?.maximumBackgroundReuseCount <= 2 && wholeFilmFrames.every((item) => item.productionAdmitted === false && fs.existsSync(publicFile(item.publicUrl)) && shaFile(publicFile(item.publicUrl)) === item.sha256), {frameCount: wholeFilmBoard?.frameCount, verifiedSourceFrameCount: wholeFilmBoard?.audit?.verifiedSourceFrameCount, verifiedPresenterFrameCount: wholeFilmBoard?.audit?.verifiedPresenterFrameCount, presenterIntegratedFrameCount: wholeFilmBoard?.audit?.presenterIntegratedFrameCount, presenterCleanFrameCount: wholeFilmBoard?.audit?.presenterCleanFrameCount, presenterTypographyStyleOptionCount: wholeFilmBoard?.audit?.presenterTypographyStyleOptionCount, decorativeVerticalRuleCount: wholeFilmBoard?.audit?.decorativeVerticalRuleCount, maskedTypeOptionSelectedForCurrentBoard: maskedPresenterTypeOption?.selectedForCurrentBoard, generatedPersonFrameCount: wholeFilmBoard?.audit?.generatedPersonFrameCount, distinctBackgroundCount: wholeFilmBoard?.audit?.distinctBackgroundCount, maximumBackgroundReuseCount: wholeFilmBoard?.audit?.maximumBackgroundReuseCount, reviewSheet: wholeFilmBoard?.reviewSheet, presenterTypographyComparisonSheet: presenterTypeOptions?.comparisonSheet});

const rejectedEffects = authority.effectPrimitiveVisualDisposition;
add("procedural-effect-rejection-preserved", rejectedEffects?.status === "VISUAL_REJECTED_DO_NOT_ADOPT" && rejectedEffects.defaultLibraryAllowed === false && rejectedEffects.productionAdmitted === false, {status: rejectedEffects?.status, candidateCount: rejectedEffects?.candidateIds?.length});

const boundariesPass = plan.boundaries.motionAllowed === false && plan.boundaries.resolveAllowed === false && plan.boundaries.finalRenderAllowed === false && plan.boundaries.productionAdmitted === false && authority.boundaries.motionAllowed === false && authority.boundaries.resolveAllowed === false && authority.boundaries.finalRenderAllowed === false && authority.boundaries.wholeFilmExpansionAllowed === false && authority.boundaries.productionAdmitted === false;
add("downstream-boundaries-remain-frozen", boundariesPass, {plan: plan.boundaries, authority: authority.boundaries});

const failures = checks.filter((item) => item.status === "FAIL");
const reportBody = {contract: "A1DefaultLibraryStaticMaturityAudit/v1", status: failures.length ? "FAIL" : "PASS_STATIC_LIBRARY_READY_FOR_USER_REVIEW", workspaceSha256: workspace.workspaceSha256, planSha256: plan.planSha256, checks, failures: failures.map((item) => item.id), objectiveBoundary: "static default-library and storyboard canary only; user approval and downstream motion remain required", generatedAt: new Date().toISOString()};
const report = {...reportBody, reportSha256: crypto.createHash("sha256").update(JSON.stringify(canonicalize(reportBody))).digest("hex")};
for (const base of [phaseRoot, artifactRoot]) {
  const file = path.join(base, "default-design-asset-library-v1/static-maturity-audit-v1/report.json");
  fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({status: report.status, reportSha256: report.reportSha256, checkCount: checks.length, passCount: checks.length - failures.length, failures: report.failures, workspaceSha256: report.workspaceSha256, planSha256: report.planSha256, downstreamBoundaries: plan.boundaries}, null, 2));
if (failures.length) process.exitCode = 1;
