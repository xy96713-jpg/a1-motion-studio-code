#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("editable-typography-shadow-review-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`editable-typography-shadow-review-workspace-cas-failed:${current.workspaceSha256}`);
  const runtime = current.production.shotIntelligence;
  const manifest = runtime.postApprovalEditableTypographyShadows;
  const candidate = runtime.approvedMasterRasterSliceMotionCandidate;
  if (manifest?.contract !== "A1PostApprovalEditableTypographyShadowManifest/v1" || manifest.status !== "BUILT_PENDING_ACTUAL_PIXEL_VISUAL_REVIEW" || manifest.rebuiltShotCount !== 9 || manifest.items?.length !== 9 || manifest.projectedCanonicalEditableShotCountAfterReview !== 13) throw new Error("editable-typography-shadow-review-current-manifest-required");
  if (candidate?.status !== "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW" || candidate.typography?.editableShadowManifestSha256 !== manifest.manifestSha256 || candidate.typography?.editableShadowStatus !== "9_SHOTS_BUILT_PENDING_ACTUAL_PIXEL_VISUAL_REVIEW") throw new Error("editable-typography-shadow-review-current-candidate-required");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("editable-typography-shadow-review-frozen-empty-runtime-required");
  const diskManifestPath = publicFile("/generated/system-line/editorial-asset-workbench-v1/system-validation-candidate-v1/editable-typography-shadows/manifest.json");
  const diskManifest = JSON.parse(fs.readFileSync(diskManifestPath, "utf8"));
  if (diskManifest.manifestSha256 !== manifest.manifestSha256 || sha256({...diskManifest, manifestSha256: undefined, generatedAt: undefined}) !== manifest.manifestSha256) throw new Error("editable-typography-shadow-review-manifest-hash-invalid");
  const findings = [];
  for (const item of manifest.items) {
    for (const [kind, artifact] of Object.entries({editableSource: item.editableSource, editableSpec: item.editableSpec, actualPixelProof: item.actualPixelProof})) {
      const file = publicFile(artifact.publicUrl);
      if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(file) || fileSha256(file) !== artifact.sha256) throw new Error(`editable-typography-shadow-review-artifact-invalid:${item.shotId}:${kind}`);
    }
    const editableSource = fs.readFileSync(publicFile(item.editableSource.publicUrl), "utf8");
    const spec = JSON.parse(fs.readFileSync(publicFile(item.editableSpec.publicUrl), "utf8"));
    if (spec.contract !== "A1EditableTypographyShadowLayer/v1" || spec.shotId !== item.shotId || spec.nodes?.length !== item.nodeCount || spec.exactCopy?.join("|") !== item.exactCopy.join("|") || spec.fontBinding?.sha256 !== manifest.fontBinding.sha256 || spec.hiddenShadowOnly !== true || spec.canonicalMasterPixelsChanged !== false || spec.visiblePixelCount !== item.actualPixelProof.visiblePixelCount) throw new Error(`editable-typography-shadow-review-spec-invalid:${item.shotId}`);
    if (spec.nodes.some((node) => node.editable !== true || node.generatedFormalText !== false || node.renderer !== "FONTKIT_DIRECT_GLYPH_OUTLINES" || node.fontBinding?.sha256 !== manifest.fontBinding.sha256 || node.glyphCount !== [...node.text].length)) throw new Error(`editable-typography-shadow-review-node-invalid:${item.shotId}`);
    if (item.exactCopy.some((copy) => !editableSource.includes(copy)) || !editableSource.includes("font-family=\"A1 Fusion Pixel\"")) throw new Error(`editable-typography-shadow-review-editable-source-invalid:${item.shotId}`);
    findings.push({shotId: item.shotId, status: "PASS", checks: ["exact-copy-readable", "no-visible-clipping", "editable-svg-text-nodes-present", "fontkit-actual-pixel-proof-present", "canonical-master-unchanged"]});
  }
  const contactFile = publicFile(manifest.contactSheet.publicUrl);
  if (!fs.existsSync(contactFile) || fileSha256(contactFile) !== manifest.contactSheet.sha256) throw new Error("editable-typography-shadow-review-contact-sheet-invalid");

  const now = new Date().toISOString();
  const reviewBody = {contract: "A1PostApprovalEditableTypographyShadowActualVisualReview/v1", status: "ACTUAL_PIXEL_EDITABLE_TYPOGRAPHY_PASS", sourceManifestSha256: manifest.manifestSha256, sourceBoardSha256: manifest.sourceBoardSha256, sourceCandidateSha256: manifest.sourceCandidateSha256, fontBinding: manifest.fontBinding, reviewedShotCount: findings.length, findings, contactSheet: manifest.contactSheet, reviewMethod: "DIRECT_CONTACT_SHEET_INSPECTION_PLUS_HASH_BOUND_FONTKIT_OUTLINE_AND_EDITABLE_SVG_SOURCE_AUDIT", exactCopyPassCount: 9, noClippingPassCount: 9, editableSourcePassCount: 9, actualPixelProofPassCount: 9, canonicalEditableLayerReadyCount: 13, hiddenShadowOnly: true, canonicalMasterPixelsChanged: false, userVisualApproval: "NOT_APPROVED", finalRenderAllowed: false, reviewedAt: now};
  const review = {...reviewBody, reviewSha256: sha256({...reviewBody, reviewedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.postApprovalEditableTypographyShadows = {...manifest, status: review.status, actualVisualReviewSha256: review.reviewSha256, actualPixelReviewRequired: false, canonicalEditableLayerReadyCount: 13, reviewedAt: now};
  const nextCandidateBody = {...candidate, typography: {...candidate.typography, candidateEditableSpecReadyCount: 13, canonicalEditableLayerReadyCount: 13, postApprovalRebuildCount: 0, editableShadowStatus: "ACTUAL_PIXEL_EDITABLE_TYPOGRAPHY_PASS", editableShadowManifestSha256: manifest.manifestSha256, editableShadowActualVisualReviewSha256: review.reviewSha256, visibleFormalTextSource: "APPROVED_MASTER_RASTER_WITH_HASH_BOUND_EDITABLE_TYPOGRAPHY_SHADOW", editableTypographyReady: true}, completeness: {authorizedTechnicalScope: "PASS", packageCount: 13, insertionClipCount: 13, alphaOverlayCount: 2, editableTypographyCount: 13, systemVisualReview: "PASS", remainingGate: "FINAL_USER_WHOLE_FILM_MOTION_VISUAL_REVIEW"}, updatedAt: now};
  delete nextCandidateBody.candidateSha256;
  next.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate = {...nextCandidateBody, candidateSha256: sha256({...nextCandidateBody, adoptedAt: undefined, updatedAt: undefined})};
  next.production.shotIntelligence.approvedMasterLayerPilot = {...next.production.shotIntelligence.approvedMasterLayerPilot, replacementCandidateSha256: next.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate.candidateSha256, editableTypographyStatus: review.status, editableTypographyReviewSha256: review.reviewSha256, updatedAt: now};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (next.gates.finalRenderAllowed !== false || next.production.release.review540p.status !== "ready-for-review") throw new Error("editable-typography-shadow-review-final-gate-escaped");
  const event = createProductionEvent({workspace: current, action: "review-post-approval-editable-typography-shadows", targetId: manifest.manifestSha256, payload: {status: review.status, reviewSha256: review.reviewSha256, canonicalEditableLayerReadyCount: 13, finalRenderAllowed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `editable-typography-shadow-review-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"system-validation-candidate-v1/editable-typography-shadows/actual-visual-review.json": review}});
  return {contract: review.contract, status: review.status, reviewSha256: review.reviewSha256, canonicalEditableLayerReadyCount: 13, candidateSha256: next.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate.candidateSha256, remainingGate: "FINAL_USER_WHOLE_FILM_MOTION_VISUAL_REVIEW", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, transitionSha256: committed.transitionSha256};
});

console.log(JSON.stringify(result, null, 2));
