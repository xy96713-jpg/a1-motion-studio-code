#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {approveEd10DirectionCForEditableTypographyRebuild, bindEd10DirectionCForExplicitReview, buildEd10DirectionCEditableTypographyProofArtifacts, recordEd10DirectionCEditableTypographyActualPixelReview, recordEd10DirectionCEditableTypographyProof} from "../apps/studio-next/src/lib/a1-ed10-look-master-candidate-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const argument = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
const expectedWorkspaceSha256 = argument("--expected-workspace-sha");
const mode = argument("--mode") || "bind-review";
const userQuote = argument("--user-quote");
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed10-direction-c-expected-workspace-sha-required");
if (!new Set(["bind-review", "approve-editable-rebuild", "build-editable-proof", "record-proof-review"]).has(mode)) throw new Error(`ed10-direction-c-mode-invalid:${mode}`);
if (mode === "approve-editable-rebuild" && !String(userQuote || "").trim()) throw new Error("ed10-direction-c-approval-user-quote-required");
const now = new Date().toISOString();
let proofAssets = null;
if (mode === "build-editable-proof") {
  const source = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (source.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed10-editable-layer-build-workspace-sha-precondition-failed:${source.workspaceSha256}`);
  proofAssets = await buildEd10DirectionCEditableTypographyProofArtifacts(source, {now, projectRoot});
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed10-direction-c-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (mode === "record-proof-review") {
    const reviewed = recordEd10DirectionCEditableTypographyActualPixelReview(current, {now, reviewer: "CODEX_DELEGATED_ACTUAL_PIXEL_REVIEW", ocrText: "完成度很高的 废稿", proofSha256: current.production.ed10LookMasterCandidateAuthority?.typographyRoute?.actualPixelProofSha256});
    const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(reviewed.workspace, now));
    const event = createProductionEvent({workspace: current, action: "record-ed10-direction-c-editable-typography-actual-pixel-review-v1", targetId: "ED-10", payload: {status: reviewed.authority.typographyRoute.actualPixelReview.status, proofSha256: reviewed.authority.typographyRoute.actualPixelProofSha256, ocrText: reviewed.authority.typographyRoute.actualPixelReview.ocr.exactText, candidateAuthoritySha256: reviewed.authority.authoritySha256, productionAdmission: false, assemblyCreated: false}, now});
    next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
    const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `record-ed10-direction-c-editable-typography-actual-pixel-review-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
    return {status: "PASS", mode, previousWorkspaceSha256: current.workspaceSha256, workspaceSha256: committed.workspaceSha256, transitionSha256: committed.transitionSha256, actualPixelReview: reviewed.authority.typographyRoute.actualPixelReview, candidateAuthoritySha256: reviewed.authority.authoritySha256, currentStage: next.production.authority.currentStage, nextAction: next.production.authority.nextAction, productionAdmission: false, assemblyCreated: false};
  }
  if (mode === "approve-editable-rebuild") {
    const approved = approveEd10DirectionCForEditableTypographyRebuild(current, {now, userQuote, projectRoot});
    const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(approved.workspace, now));
    const event = createProductionEvent({workspace: current, action: "approve-ed10-direction-c-editable-typography-rebuild-v1", targetId: "ED-10", payload: {candidateId: approved.authority.candidate.id, candidateSha256: approved.authority.candidate.sha256, sourceAuthoritySha256: approved.authority.approval.sourceAuthoritySha256, candidateAuthoritySha256: approved.authority.authoritySha256, userQuoteSha256: approved.authority.approval.quoteSha256, userVisualApproval: approved.authority.userVisualApproval, layerReconstructionAllowed: true, productionAdmission: false, mediaRenderPerformed: false, assemblyCreated: false}, now});
    next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
    const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `approve-ed10-direction-c-editable-typography-rebuild-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
    return {status: "PASS", mode, previousWorkspaceSha256: current.workspaceSha256, workspaceSha256: committed.workspaceSha256, transitionSha256: committed.transitionSha256, candidateId: approved.authority.candidate.id, candidateSha256: approved.authority.candidate.sha256, candidateAuthoritySha256: approved.authority.authoritySha256, userQuoteSha256: approved.authority.approval.quoteSha256, userVisualApproval: approved.authority.userVisualApproval, layerReconstructionAllowed: true, productionAdmission: false, assemblyAllowed: false, currentStage: next.production.authority.currentStage, nextAction: next.production.authority.nextAction, mediaRenderPerformed: false, assemblyCreated: false};
  }
  if (mode === "build-editable-proof") {
    const recorded = recordEd10DirectionCEditableTypographyProof(current, {now, textFreeBackground: proofAssets.textFreeBackground, editableLayer: proofAssets.editableLayer, actualPixelProof: proofAssets.actualPixelProof, editableSpec: proofAssets.editableSpec});
    const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(recorded.workspace, now));
    const event = createProductionEvent({workspace: current, action: "build-ed10-direction-c-eva-editable-layer-proof-v1", targetId: "ED-10", payload: {sourceCandidateSha256: proofAssets.authority.candidate.sha256, textFreeBackgroundSha256: proofAssets.textFreeBackground.sha256, editableLayerSha256: proofAssets.editableLayer.sha256, actualPixelProofSha256: proofAssets.actualPixelProof.sha256, editableSpecSha256: proofAssets.editableSpec.specSha256, productionAdmission: false, assemblyCreated: false}, now});
    next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
    const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `build-ed10-direction-c-eva-editable-layer-proof-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${proofAssets.relativeRoot}/editable-typography-spec.json`]: proofAssets.editableSpec, [`${proofAssets.relativeRoot}/manifest.json`]: proofAssets.manifest}, binaryFiles: {[`${proofAssets.relativeRoot}/text-free-background.png`]: proofAssets.textFreeBytes, [`${proofAssets.relativeRoot}/editable-typography-layer.png`]: proofAssets.editableLayerBytes, [`${proofAssets.relativeRoot}/actual-pixel-proof.png`]: proofAssets.proofBytes}});
    return {status: "PASS", mode, previousWorkspaceSha256: current.workspaceSha256, workspaceSha256: committed.workspaceSha256, transitionSha256: committed.transitionSha256, outputs: proofAssets.manifest.outputs, editableSpecSha256: proofAssets.editableSpec.specSha256, manifestSha256: proofAssets.manifest.manifestSha256, currentStage: next.production.authority.currentStage, nextAction: next.production.authority.nextAction, productionAdmission: false, assemblyCreated: false};
  }
  const bound = bindEd10DirectionCForExplicitReview(current, {now, userQuote: userQuote || "c 还行 符合整体美学吧", projectRoot});
  const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(bound.workspace, now));
  const event = createProductionEvent({workspace: current, action: "bind-ed10-direction-c-review-authority-v1", targetId: "ED-10", payload: {candidateId: bound.authority.candidate.id, candidateSha256: bound.authority.candidate.sha256, candidateAuthoritySha256: bound.authority.authoritySha256, userSignalKind: bound.authority.userSignal.kind, userVisualApproval: "NOT_APPROVED", productionAdmission: false, generatedImages: false, mediaRenderPerformed: false, assemblyCreated: false}, now});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const relativeAssetPath = bound.authority.candidate.publicUrl.replace("/generated/system-line/editorial-asset-workbench-v1/", "");
  const relativeManifestPath = bound.authority.candidate.manifestPublicUrl.replace("/generated/system-line/editorial-asset-workbench-v1/", "");
  const assetBytes = fs.readFileSync(path.join(appRoot, "public", bound.authority.candidate.publicUrl));
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public", bound.authority.candidate.manifestPublicUrl), "utf8"));
  const committed = persistProjectState(appRoot, next, {event, files: {[relativeManifestPath]: manifest}, binaryFiles: {[relativeAssetPath]: assetBytes}, expectedWorkspaceSha256: current.workspaceSha256, commitId: `bind-ed10-direction-c-review-authority-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {status: "PASS", mode, previousWorkspaceSha256: current.workspaceSha256, workspaceSha256: committed.workspaceSha256, transitionSha256: committed.transitionSha256, candidate: bound.authority.candidate, typographyRoute: bound.authority.typographyRoute, userVisualApproval: bound.authority.userVisualApproval, productionAdmission: false, currentStage: next.production.authority.currentStage, nextAction: next.production.authority.nextAction, generation: next.production.generation.summary, mediaRenderPerformed: false, assemblyCreated: false};
});
console.log(JSON.stringify(result, null, 2));
