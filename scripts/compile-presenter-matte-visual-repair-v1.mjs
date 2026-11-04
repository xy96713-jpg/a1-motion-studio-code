#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {auditCreatorPaletteCurrentAestheticGate, actualFrameOccupationFromRaw} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {auditPresenterCompositeActualPixels} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {deriveHeroTitlePresentation} from "../apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const CONTRACT = "A1PresenterMatteVisualRepairManifest/v1";
const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir, publicDir} = projectDirs(appRoot);
const relativeDir = "golden-film-visual-system-maturity-v1/matte-composite-repair";
const manifestRelativePath = `${relativeDir}/repair-manifest.json`;
const dryRunRelativePath = "golden-film-visual-system-maturity-v1/overlay-geometry-dry-run/geometry-capacity-dry-run.json";
const targetShotIds = ["ED-07", "ED-08", "ED-13", "ED-19", "ED-31", "ED-34"];
const historyReuse = {
  "ED-07": "8820fc63a3a8641301d3f35fdbdc2fb32670183c6dc52fa65448acc84b71090a",
  "ED-08": "3c3d9accb76598600a6bf4c23d4d703b754d7a00459b18de4873e3332c0e3489",
  "ED-13": "88a1366e3fe754ff166bde9bd94d69c4b93fb2e40a8346ce7d270005fa875fb3",
  "ED-31": "064c5cff461163f1f99d44e20f3d8dcbaf2d8a2b0c492ec14098d3441d7d47b9",
};
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => path.resolve(publicRoot, String(url).replace(/^\//u, ""));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };

function copyArtifact(file) {
  const artifactFile = path.join(artifactDir, path.relative(publicRoot, file));
  fs.mkdirSync(path.dirname(artifactFile), {recursive: true});
  fs.copyFileSync(file, artifactFile);
}

function selectedRaw(runtime, shotId) {
  const refs = runtime.lookMasterRawReferences || [];
  const historySha = historyReuse[shotId];
  if (historySha) return refs.find((raw) => raw.shotId === shotId && raw.artifact?.sha256 === historySha) || null;
  return refs.find((raw) => raw.shotId === shotId && raw.current === true) || null;
}

function modeCompatible(raw, decision) {
  const actual = actualFrameOccupationFromRaw(raw);
  if (!actual.frameOccupation && raw?.pixelAudit?.actualPixelMetrics?.hasAlpha === true) {
    const metrics = raw.pixelAudit?.actualPixelMetrics || {};
    const transparentFraction = Number(metrics.transparentFraction);
    const alphaMean = Number(metrics.alphaMean);
    const averageLuminance = Number(metrics.averageLuminance);
    if ((Number.isFinite(transparentFraction) && transparentFraction >= 0.75) || (Number.isFinite(alphaMean) && alphaMean <= 0.2 && Number.isFinite(averageLuminance) && averageLuminance <= 0.2)) {
      actual.frameOccupation = "OVERLAY";
      actual.evidence = "LEGACY_ACTUAL_ALPHA_METRICS_MODE_MIGRATION";
    }
  }
  return {status: actual.frameOccupation === decision.frameOccupation ? "PASS" : "FAIL", actual, expected: decision.frameOccupation};
}

async function compositeCandidate({baseFile, candidateFile, mode, width, height, outputFile}) {
  const takeover = ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(mode);
  const packageBuffer = await sharp(candidateFile).resize(width, height, {fit: "fill"}).ensureAlpha().png().toBuffer();
  const baseBuffer = await sharp(baseFile).resize(width, height, {fit: "fill"}).removeAlpha().png().toBuffer();
  const buffer = takeover ? await sharp(packageBuffer).png().toBuffer() : await sharp(baseBuffer).composite([{input: packageBuffer, blend: "over"}]).ensureAlpha().png().toBuffer();
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, buffer);
  return {file: outputFile, sha256: sha256(buffer), width, height};
}

async function compositeCandidateWithPresenterMatte({baseFile, candidateFile, presenterMatteFile, microphoneMatteFile, boomMatteFile, protectionScope = "PRESENTER_AND_EQUIPMENT", mode, width, height, outputFile}) {
  const takeover = ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(mode);
  if (takeover || !presenterMatteFile) return compositeCandidate({baseFile, candidateFile, mode, width, height, outputFile});
  const [base, presenterMask, microphoneMask, boomMask] = await Promise.all([
    sharp(baseFile).resize(width, height, {fit: "fill"}).removeAlpha().raw().toBuffer(),
    sharp(presenterMatteFile).resize(width, height, {fit: "fill"}).greyscale().removeAlpha().raw().toBuffer(),
    microphoneMatteFile ? sharp(microphoneMatteFile).resize(width, height, {fit: "fill"}).greyscale().removeAlpha().raw().toBuffer() : null,
    boomMatteFile ? sharp(boomMatteFile).resize(width, height, {fit: "fill"}).greyscale().removeAlpha().raw().toBuffer() : null,
  ]);
  const sourceLayer = (mask) => {
    if (!mask) return null;
    const rgba = Buffer.alloc(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      rgba[pixel * 4] = base[pixel * 3];
      rgba[pixel * 4 + 1] = base[pixel * 3 + 1];
      rgba[pixel * 4 + 2] = base[pixel * 3 + 2];
      rgba[pixel * 4 + 3] = mask[pixel];
    }
    return sharp(rgba, {raw: {width, height, channels: 4}}).png().toBuffer();
  };
  const packageBuffer = await sharp(candidateFile).resize(width, height, {fit: "fill"}).ensureAlpha().png().toBuffer();
  const restoredMasks = protectionScope === "PRESENTER_FACE_AND_BODY_ONLY"
    ? [presenterMask]
    : [presenterMask, microphoneMask, boomMask];
  const sourceLayers = await Promise.all(restoredMasks.map(sourceLayer));
  const overlays = [{input: packageBuffer, blend: "over"}, ...sourceLayers.filter(Boolean).map((input) => ({input, blend: "over"}))];
  const buffer = await sharp(base, {raw: {width, height, channels: 3}}).composite(overlays).ensureAlpha().png().toBuffer();
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, buffer);
  return {file: outputFile, sha256: sha256(buffer), width, height};
}

async function buildManifest({humanReviewConfirmed = false, humanReviewApprovedShotIds = [], commit = false} = {}) {
  return withProjectLock(appRoot, async () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("presenter-matte-repair-requires-frozen-idle-runtime");
    const runtime = before.production.shotIntelligence;
    const sequence = before.production.canonicalCreatorPackagingSequence;
    const plans = new Map(runtime.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
    const dryRun = JSON.parse(fs.readFileSync(path.join(publicDir, dryRunRelativePath), "utf8"));
    const records = [];
    for (const shotId of targetShotIds) {
      const decision = sequence.decisions.find((item) => item.shotId === shotId);
      const plan = plans.get(shotId);
      const raw = selectedRaw(runtime, shotId);
      const dryShot = dryRun.shots.find((item) => item.shotId === shotId);
      const mode = dryShot?.mode || plan?.presenterPackagingRoute?.mode || null;
      const candidateFile = raw?.artifact?.publicUrl ? publicFile(raw.artifact.publicUrl) : null;
      const baseFile = dryShot?.holdFrame?.publicUrl ? publicFile(dryShot.holdFrame.publicUrl) : null;
      const modeAudit = modeCompatible(raw, decision);
      const aesthetic = auditCreatorPaletteCurrentAestheticGate(raw);
      const semanticPass = raw?.semanticPixelAudit?.status === "PASS";
      const sourceKind = historyReuse[shotId] ? "HISTORY_READ_ONLY_IMMUTABLE_ALIAS" : "CURRENT_CANDIDATE";
      const humanReviewPass = humanReviewConfirmed && humanReviewApprovedShotIds.includes(shotId);
      const next = {shotId, route: mode, sourceKind, candidateSha256: raw?.artifact?.sha256 || null, candidatePublicUrl: raw?.artifact?.publicUrl || null, modeCompatibility: modeAudit, aestheticGate: aesthetic, semanticStatus: raw?.semanticPixelAudit?.status || "MISSING", reuseDecision: "UNKNOWN", finalComposite: null, actualPixelAudit: null, humanPixelReviewStatus: humanReviewPass ? "PASS" : humanReviewConfirmed ? "REJECTED" : "PENDING_HUMAN_REVIEW", status: "BLOCKED", reason: null, nextAction: null};
      if (!raw || !candidateFile || !baseFile || !fs.existsSync(candidateFile) || !fs.existsSync(baseFile)) {
        next.reuseDecision = "GENERATION_REQUIRED";
        next.reason = "CURRENT_OR_REUSE_CANDIDATE_MISSING";
        next.nextAction = "GENERATE_ROUTE_COMPATIBLE_LOOK_MASTER";
        records.push(next);
        continue;
      }
      if (modeAudit.status !== "PASS") {
        next.reuseDecision = "GENERATION_REQUIRED";
        next.reason = `ACTUAL_MODE_INCOMPATIBLE:${modeAudit.actual.frameOccupation || "UNVERIFIED"}->${modeAudit.expected}`;
        next.nextAction = "GENERATE_ROUTE_COMPATIBLE_LOOK_MASTER";
        records.push(next);
        continue;
      }
      const width = dryShot.holdFrame.width;
      const height = dryShot.holdFrame.height;
      const compositeFile = path.join(publicDir, relativeDir, shotId.toLowerCase(), `${shotId.toLowerCase()}-${raw.artifact.sha256.slice(0, 12)}-actual-composite.png`);
      const matte = dryShot.matte;
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
      const composite = await compositeCandidateWithPresenterMatte({baseFile, candidateFile, presenterMatteFile: matte?.presenterMatte?.file || null, microphoneMatteFile: matte?.microphoneMatte?.file || null, boomMatteFile: matte?.boomMatte?.file || null, protectionScope, mode, width, height, outputFile: compositeFile});
      const pixelAudit = await auditPresenterCompositeActualPixels({
        baseFrameFile: baseFile,
        packageFile: candidateFile,
        finalCompositeFile: compositeFile,
        presenterMatteFile: matte?.presenterMatte?.file || null,
        microphoneMatteFile: matte?.microphoneMatte?.file || null,
        boomMatteFile: matte?.boomMatte?.file || null,
        faceMaskFile: matte?.componentMasks?.face?.file || null,
        eyesMaskFile: matte?.componentMasks?.eyes?.file || null,
        mouthMaskFile: matte?.componentMasks?.mouth?.file || null,
        targetWidth: width,
        targetHeight: height,
        packagingMode: mode,
        protectionScope,
        titleBounds: raw.pixelAudit?.typographyVisual?.titleBbox || null,
      });
      next.finalComposite = {publicUrl: `/${path.relative(publicRoot, compositeFile)}`, sha256: composite.sha256, width, height, baseFrameSha256: dryShot.holdFrame.sha256, packageSha256: raw.artifact.sha256};
      next.actualPixelAudit = pixelAudit;
      next.reuseDecision = pixelAudit.status === "PASS" && semanticPass && aesthetic.status === "PASS" ? "REBINDABLE" : "GENERATION_REQUIRED";
      if (next.reuseDecision === "REBINDABLE" && humanReviewPass) {
        next.status = "VISUAL_PASS_ACTUAL_COMPOSITE";
        next.reason = historyReuse[shotId] ? "EXISTING_HISTORY_CANDIDATE_PASSES_CURRENT_MODE_PIXEL_AND_SEMANTIC_GATES" : "CURRENT_CANDIDATE_PASSES_CORRECTED_COMPOSITE_PIXEL_GATE";
        next.nextAction = "REBIND_CURRENT_PLAN_TO_VERIFIED_COMPOSITE";
      } else if (next.reuseDecision === "REBINDABLE") {
        next.reuseDecision = humanReviewConfirmed ? "GENERATION_REQUIRED" : "REBINDABLE";
        next.reason = humanReviewConfirmed ? "HUMAN_PIXEL_REVIEW_REJECTED_FINAL_COMPOSITE" : "WAITING_FOR_HUMAN_PIXEL_REVIEW_OF_FINAL_COMPOSITE";
        next.nextAction = humanReviewConfirmed ? "GENERATE_ROUTE_COMPATIBLE_LOOK_MASTER" : "REVIEW_MATTE_REPAIR_CONTACT_SHEET";
      } else {
        next.reason = pixelAudit.status !== "PASS" ? `ACTUAL_PIXEL_GATE_FAILED:${pixelAudit.failedChecks.join(",")}` : !semanticPass ? "SEMANTIC_AUDIT_NOT_PASS" : `CURRENT_AESTHETIC_GATE_${aesthetic.status}`;
        next.nextAction = "GENERATE_ROUTE_COMPATIBLE_LOOK_MASTER";
      }
      copyArtifact(compositeFile);
      records.push(next);
    }
    const reusable = records.filter((record) => record.status === "VISUAL_PASS_ACTUAL_COMPOSITE");
    const generationRequired = records.filter((record) => record.reuseDecision === "GENERATION_REQUIRED");
    const body = {
      contract: CONTRACT,
      version: 1,
      current: true,
      status: generationRequired.length ? "BLOCKED_GENERATION_REQUIRED" : "PASS_ACTUAL_COMPOSITE_REVIEW",
      sourceWorkspaceSha256: before.workspaceSha256,
      sourceSequenceSha256: sequence.sequenceSha256,
      packageCount: sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length,
      noPackageCount: sequence.decisions.filter((item) => item.packageDecision !== "PACKAGE").length,
      targetShotIds,
      entries: records,
      reusableShotIds: reusable.map((record) => record.shotId),
      generationRequiredShotIds: generationRequired.map((record) => record.shotId),
      generationLedger: {attemptedGeneratedCount: 0, adoptedGeneratedCount: 0, rejectedGeneratedCount: 0, candidateShas: [], generationDispatchedThisWave: false},
      workerStartAllowed: false,
      assemblyCreationAllowed: false,
      generatedAt: new Date().toISOString(),
    };
    body.manifestSha256 = sha256({...body, manifestSha256: undefined});
    writeJson(path.join(publicDir, manifestRelativePath), body);
    copyArtifact(path.join(publicDir, manifestRelativePath));
    if (commit) {
      const next = structuredClone(before);
      const nextRuntime = next.production.shotIntelligence;
      const currentPlans = nextRuntime.packageLookMasterPlans;
      for (const record of records) {
        if (record.status !== "VISUAL_PASS_ACTUAL_COMPOSITE") continue;
        const plan = currentPlans.find((item) => item.shotId === record.shotId);
        const selectedRawRef = nextRuntime.lookMasterRawReferences.find((raw) => raw.artifact?.sha256 === record.candidateSha256 && raw.shotId === record.shotId);
        if (!plan || !selectedRawRef) continue;
        if (historyReuse[record.shotId]) {
          for (const raw of nextRuntime.lookMasterRawReferences.filter((item) => item.shotId === record.shotId && item.current === true)) { raw.current = false; raw.historyReadOnly = true; raw.selectionEligible = false; raw.recommendationEligible = false; raw.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_VERIFIED_MODE_COMPATIBLE_ALIAS"; }
          selectedRawRef.current = true;
          selectedRawRef.historyReadOnly = false;
          selectedRawRef.selectionEligible = true;
          selectedRawRef.recommendationEligible = true;
          const priorPlanSha256 = selectedRawRef.planSha256 || null;
          selectedRawRef.planSha256 = plan.planSha256;
          selectedRawRef.candidateAuditMigration = {contract: "A1CandidateAuditPlanProvenanceMigration/v1", status: "PASS", fromPlanSha256: priorPlanSha256, targetPlanSha256: plan.planSha256, artifactSha256: selectedRawRef.artifact.sha256, auditBytesUnchanged: true, migratedAt: body.generatedAt};
        }
        const presenterCompositeVisualAudit = {contract: "A1PresenterCompositeVisualAudit/v1", ...record.actualPixelAudit, finalComposite: record.finalComposite, humanPixelReviewStatus: "PASS", auditedAt: body.generatedAt};
        presenterCompositeVisualAudit.auditSha256 = sha256({...presenterCompositeVisualAudit, auditSha256: undefined, auditedAt: undefined});
        selectedRawRef.presenterCompositeVisualAudit = presenterCompositeVisualAudit;
        plan.provisionalWholeFilmBoardSelection = {...(plan.provisionalWholeFilmBoardSelection || {}), candidateId: selectedRawRef.referenceId, artifact: structuredClone(selectedRawRef.artifact), compositePreview: {publicUrl: record.finalComposite.publicUrl, sha256: record.finalComposite.sha256, width: record.finalComposite.width, height: record.finalComposite.height}, actualPixelAuditSha256: selectedRawRef.pixelAudit?.auditSha256 || null, semanticPixelAuditSha256: selectedRawRef.semanticPixelAudit?.auditSha256 || null, selectionSource: "PRESENTER_MATTE_VISUAL_REPAIR_REBIND"};
      }
      next.production.goldenFilmVisualSystemMaturity = {...(next.production.goldenFilmVisualSystemMaturity || {}), presenterMatteVisualRepairManifestSha256: body.manifestSha256, presenterMatteVisualRepairStatus: body.status, presenterMatteVisualRepairTargetShotIds: targetShotIds, presenterMatteVisualRepairReusableShotIds: body.reusableShotIds, presenterMatteVisualRepairGenerationRequiredShotIds: body.generationRequiredShotIds, nextAction: generationRequired.length ? "GENERATE_ROUTE_COMPATIBLE_LOOK_MASTER" : "SYNC_VISUAL_REPAIR_BINDING"};
      next.production.authority = {...next.production.authority, nextAction: generationRequired.length ? "GENERATE_ROUTE_COMPATIBLE_LOOK_MASTER" : "SYNC_VISUAL_REPAIR_BINDING"};
      next.production.generation.automaticDispatchAllowed = false;
      next.production.generation.workerStatus = "frozen";
      next.production.generation.summary.queued = 0;
      next.production.generation.summary.running = 0;
      next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "PRESENTER_MATTE_VISUAL_REPAIR"};
      const event = createProductionEvent({workspace: next, action: "compile-presenter-matte-visual-repair-v1", targetId: body.manifestSha256, payload: {contract: CONTRACT, targetShotIds, reusableShotIds: body.reusableShotIds, generationRequiredShotIds: body.generationRequiredShotIds, noImagegen: true}, now: body.generatedAt});
      next.production.eventLedger.eventCount += 1;
      next.production.eventLedger.lastEventId = event.eventId;
      next.production.eventLedger.lastEventAt = event.createdAt;
      const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, body.generatedAt));
      persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: before.workspaceSha256, event, files: {[manifestRelativePath]: body}});
    }
    return {manifest: body, workspaceSha256: commit ? readProjectWorkspace(appRoot).workspaceSha256 : before.workspaceSha256};
  });
}

const args = new Set(process.argv.slice(2));
const approvedArg = process.argv.find((value) => value.startsWith("--approved-shot-ids=")) || "";
const humanReviewApprovedShotIds = approvedArg.slice("--approved-shot-ids=".length).split(",").map((shotId) => shotId.trim()).filter(Boolean);
const result = await buildManifest({humanReviewConfirmed: args.has("--human-review-confirmed"), humanReviewApprovedShotIds, commit: args.has("--commit")});
console.log(JSON.stringify({status: result.manifest.status, manifestSha256: result.manifest.manifestSha256, reusableShotIds: result.manifest.reusableShotIds, generationRequiredShotIds: result.manifest.generationRequiredShotIds, entries: result.manifest.entries.map((entry) => ({shotId: entry.shotId, reuseDecision: entry.reuseDecision, status: entry.status, candidateSha256: entry.candidateSha256, compositeSha256: entry.finalComposite?.sha256 || null, diff: entry.actualPixelAudit?.decodedPixelDiff?.ratio || null, visibleArea: entry.actualPixelAudit?.packageVisibleArea?.ratio || null, reason: entry.reason})), workspaceSha256: result.workspaceSha256}, null, 2));
