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
const manifestPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/approved-master-layer-reconstruction-v1/deterministic-pilot/manifest.json");
const expectedWorkspaceSha256 = process.argv[2];
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("deterministic-layer-pilot-review-expected-workspace-sha-required");

const findings = [
  {shotId: "ED-08", verdict: "BLOCK", finding: "The title is not isolated as typography: most title pixels remain in ELEMENT_KIT while TYPOGRAPHY contains only a fragment."},
  {shotId: "ED-14", verdict: "BLOCK", finding: "Evidence labels and text are split across TYPOGRAPHY and ELEMENT_KIT, so either layer cannot be animated or edited independently."},
  {shotId: "ED-16", verdict: "BLOCK", finding: "Formal text pixels leak into illustration and element partitions; the four outputs are pixel buckets, not semantic actors."},
  {shotId: "ED-31", verdict: "BLOCK", finding: "ELEMENT_KIT retains presenter and background pixels while TYPOGRAPHY carries background patches, invalidating independent overlay motion."},
  {shotId: "ED-34", verdict: "BLOCK", finding: "The background retains visible text residue and visual regions are divided by color heuristics rather than semantic ownership."},
];

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`deterministic-layer-pilot-review-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen" || current.production.generation.automaticDispatchAllowed !== false) throw new Error("deterministic-layer-pilot-review-frozen-empty-runtime-required");
  const runtime = current.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  const decision = runtime.wholeFilmStaticBoardDecision;
  const pilot = runtime.approvedMasterLayerPilot;
  const deterministic = runtime.deterministicLayerReconstructionPilot;
  if (board?.status !== "APPROVED" || decision?.decision !== "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY") throw new Error("deterministic-layer-pilot-review-approved-board-required");
  if (pilot?.status !== "DETERMINISTIC_LAYER_PARITY_BUILT_PENDING_ACTUAL_PIXEL_VISUAL_REVIEW" || pilot.boardSha256 !== board.sha256 || pilot.approvalDecisionSha256 !== decision.decisionSha256) throw new Error("deterministic-layer-pilot-review-current-pilot-required");
  if (deterministic?.contract !== "A1DeterministicApprovedMasterLayerPilot/v1" || deterministic.status !== "TECHNICAL_LAYER_PARITY_PASS_PENDING_VISUAL_REVIEW" || deterministic.sourceBoardSha256 !== board.sha256 || deterministic.manifestSha256 !== pilot.deterministicPilotManifestSha256) throw new Error("deterministic-layer-pilot-review-current-manifest-required");
  if (!fs.existsSync(manifestPath)) throw new Error("deterministic-layer-pilot-review-manifest-file-missing");
  const diskManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (diskManifest.manifestSha256 !== deterministic.manifestSha256 || sha256({...diskManifest, manifestSha256: undefined, generatedAt: undefined}) !== diskManifest.manifestSha256) throw new Error("deterministic-layer-pilot-review-manifest-hash-invalid");
  if (diskManifest.itemCount !== 5 || diskManifest.passCount !== 5 || diskManifest.generationCount !== 0 || diskManifest.items?.length !== 5) throw new Error("deterministic-layer-pilot-review-technical-proof-incomplete");
  for (const finding of findings) {
    const item = diskManifest.items.find((entry) => entry.shotId === finding.shotId);
    const plan = runtime.packageAssetKitPlans.find((entry) => entry.shotId === finding.shotId && entry.current === true && entry.authorityScope === "CURRENT");
    if (!item || !plan || item.selectedLookMaster?.sha256 !== plan.selectedLookMasterBinding?.artifactSha256 || item.holdFrameParity?.status !== "PASS" || item.holdFrameParity?.exactPixelRatio !== 1 || item.holdFrameParity?.meanAbsoluteRgbDifference !== 0) throw new Error(`deterministic-layer-pilot-review-item-binding-invalid:${finding.shotId}`);
    for (const artifact of [item.selectedLookMaster, item.contactSheet, item.recomposedMaster, item.finalComposite, ...(item.layers || []).flatMap((layer) => [{publicUrl: layer.publicUrl, sha256: layer.sha256}, {publicUrl: layer.maskPublicUrl, sha256: layer.maskSha256}])]) {
      const file = publicFile(artifact?.publicUrl);
      if (!String(artifact?.publicUrl || "").startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(file) || fileSha256(file) !== artifact.sha256) throw new Error(`deterministic-layer-pilot-review-artifact-invalid:${finding.shotId}`);
    }
  }

  const now = new Date().toISOString();
  const reportBody = {
    contract: "A1DeterministicApprovedMasterLayerActualVisualReview/v1",
    status: "BLOCK_SEMANTIC_LAYER_SEPARATION",
    technicalParityStatus: "PASS",
    visualSemanticStatus: "FAIL",
    sourceManifestSha256: deterministic.manifestSha256,
    sourceBoardSha256: board.sha256,
    sourceApprovalDecisionSha256: decision.decisionSha256,
    reviewedShotCount: findings.length,
    findings,
    decision: "RETIRE_FALSE_FOUR_LAYER_ROUTE_AND_USE_APPROVED_MASTER_RASTER_SLICE_MOTION",
    replacementArchitecture: "APPROVED_MASTER_RASTER_SLICE_MOTION_WITH_HASH_BOUND_EDITABLE_TYPOGRAPHY_SHADOW",
    machinePassCannotOverrideVisualFailure: true,
    currentGenerationExecuted: false,
    wholeFilmExpansionAllowed: false,
    motionExpansionAllowed: false,
    userVisualApproval: "NOT_APPROVED",
    reviewedAt: now,
  };
  const report = {...reportBody, reviewSha256: sha256({...reportBody, reviewedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.deterministicLayerReconstructionPilot = {
    ...deterministic,
    status: "BLOCK_SEMANTIC_LAYER_SEPARATION",
    visualReviewRequired: false,
    visualSemanticStatus: "FAIL",
    actualVisualReviewSha256: report.reviewSha256,
    wholeFilmExpansionAllowed: false,
    motionExpansionAllowed: false,
    replacementArchitecture: report.replacementArchitecture,
    reviewedAt: now,
  };
  next.production.shotIntelligence.approvedMasterLayerPilot = {
    ...pilot,
    status: "DETERMINISTIC_SEMANTIC_LAYERING_BLOCKED_USE_APPROVED_MASTER_RASTER_SLICE_MOTION",
    deterministicActualVisualReviewSha256: report.reviewSha256,
    visualSemanticStatus: "FAIL",
    wholeFilmExpansionAllowed: false,
    motionExpansionAllowed: false,
    replacementArchitecture: report.replacementArchitecture,
    updatedAt: now,
  };
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "review-current-deterministic-layer-pilot", targetId: deterministic.manifestSha256, payload: report, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `deterministic-layer-pilot-visual-block-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-reconstruction-v1/deterministic-pilot/actual-visual-review.json": report}});
  return {...report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId};
});

console.log(JSON.stringify(result, null, 2));
