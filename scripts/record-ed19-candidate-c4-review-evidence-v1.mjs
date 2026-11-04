#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const sourceRelativePath = ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/ed19-reference-attached-look-master-v1/candidate-c4.png";
const sourcePath = path.join(root, sourceRelativePath);
const publicRelativePath = "creator-packaging-candidate-decision-v1/ED-19-c4.png";
const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/${publicRelativePath}`;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

if (!fs.existsSync(sourcePath)) throw new Error("ed19-c4-source-missing");
const bytes = fs.readFileSync(sourcePath);
const artifactSha256 = sha256(bytes);
const metadata = await sharp(bytes).metadata();
if (metadata.format !== "png" || metadata.width !== 1672 || metadata.height !== 941) throw new Error("ed19-c4-raster-invalid");

const now = new Date().toISOString();
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.authority?.nextAction?.id !== "adopt-ed19-c3-or-reject-and-hold") throw new Error("ed19-c4-replacement-gate-not-current");
  assert.deepEqual(current.production.authority.nextAction.targetShotIds, ["ED-19"]);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed19-c4-runtime-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("ed19-c4-assembly-forbidden");

  const decision = {
    contract: "A1CreatorPackagingCandidateDecisionEvidence/v1",
    status: "READY_FOR_USER_REVIEW",
    shotId: "ED-19",
    candidateId: "ED-19-c4",
    artifact: {publicUrl, sha256: artifactSha256, width: metadata.width, height: metadata.height, format: metadata.format},
    route: "semantic-crt-explainer",
    styleProfile: "minimal-retro-pixel-editorial-v2:quiet-iconic",
    primaryFamily: "one-bit-character-object",
    informationOwner: "single-background-processing-object",
    semanticAction: "messy-input-enters-one-machine-and-clean-output-exits",
    taitMechanisms: ["shared-square-pixel-lattice", "restrained-scanline-surface", "single-cobalt-completion-pulse"],
    evaRole: "TYPOGRAPHY_ONLY_LOCAL_BINDING_PENDING",
    palette: "neutral-cool-white-charcoal-cobalt",
    actualPixelReview: {
      status: "READY_FOR_REVIEW",
      onePrimaryActor: true,
      semanticElementCount: 3,
      oneReadingPath: true,
      quietFieldAtLeastHalfFrame: true,
      windowsAndFlowchartRemoved: true,
      formalGeneratedTextPresent: false,
      visualDirectorRecommendation: "RECOMMEND_C4_OVER_C3_FOR_MINIMAL_DIRECTION",
    },
    sourceCandidateId: "ED-19-c3",
    sourceCandidateDisposition: "VISUAL_REJECTED_DIRECTION_CLOSE_BUT_COMPLEXITY_EXCESSIVE",
    userFeedback: "还行但是有些复杂了，不是极简",
    generatedAttemptCount: 1,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    assemblyCreated: false,
    motionStarted: false,
    resolveStarted: false,
    nextAction: "ADOPT_ED19_C4_OR_REJECT_AND_HOLD",
    reviewedAt: now,
  };
  decision.decisionEvidenceSha256 = sha256(JSON.stringify(decision));

  const next = structuredClone(current);
  next.production.creatorPackagingCandidateDecision = decision;
  const event = createProductionEvent({workspace: current, action: "replace-ed19-c3-with-minimal-c4-review-evidence", targetId: artifactSha256, payload: {contract: decision.contract, status: decision.status, shotId: "ED-19", candidateId: "ED-19-c4", sourceCandidateDisposition: decision.sourceCandidateDisposition, artifactSha256, productionAdmission: false, userVisualApproval: "NOT_APPROVED"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `ed19-c4-review-evidence-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"creator-packaging-candidate-decision-v1/ED-19-c4-review.json": decision}, binaryFiles: {[publicRelativePath]: bytes}});
  return {status: decision.status, candidateId: decision.candidateId, artifactSha256, workspaceSha256After: committed.workspaceSha256, nextAction: recalculated.production.authority.nextAction.id, userVisualApproval: decision.userVisualApproval, productionAdmission: decision.productionAdmission, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
