#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("representative-motion-v3-reject-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`representative-motion-v3-reject-workspace-cas-failed:${current.workspaceSha256}`);
  const draft = current.production.shotIntelligence.representativeMotionV3ShotAssets;
  if (draft?.contract !== "A1RepresentativeMotionV3ShotAssetManifest/v1") throw new Error("representative-motion-v3-draft-required");
  const pilot = current.production.shotIntelligence.representativeApprovedMasterMotionPilot;
  if (!pilot?.video?.publicUrl?.includes("approved-master-layer-motion-pilot-v2/")) throw new Error("representative-motion-v2-must-remain-current");
  const now = new Date().toISOString();
  const reportBody = {
    contract: "A1RepresentativeMotionV3DeterministicDraftRejection/v1",
    status: "VISUAL_REJECTED_DETERMINISTIC_DRAFT",
    current: false,
    supersededEvidence: true,
    sourceWorkspaceSha256: current.workspaceSha256,
    rejectedManifestSha256: draft.manifestSha256,
    rejectedStyleBriefSha256: draft.styleBriefSha256,
    rejectedEd31ProofSha256: draft.ed31ProofSha256,
    rejectedEd31LookMaster: draft.outputs?.ed31Master || null,
    retainedEd13TypographyCandidate: draft.outputs?.ed13Typography || null,
    rejectionReason: "Complex full-screen ED-31 visual design must be ImageGen-led; deterministic SVG/PNG flowchart-like construction is visually insufficient and must not become motion authority.",
    nextRequiredInput: "IMAGEGEN_LED_INTEGRATED_LOOK_MASTER_CANDIDATE",
    imagegenRoute: {costPolicy: "SUBSCRIPTION_ZERO_EXTRA_COST_ONLY", paidApiAllowed: false, integratedArtDirectionRequired: true},
    gates: {motionCompileAllowed: false, motionRenderAllowed: false, authorityPromotionAllowed: false, workbenchCurrentAllowed: false, fullFilmAllowed: false, assemblyAllowed: false, finalRenderAllowed: false},
    rejectedAt: now,
  };
  const report = {...reportBody, rejectionSha256: sha256({...reportBody, rejectedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.representativeMotionV3ShotAssets = {
    ...draft,
    status: report.status,
    current: false,
    supersededEvidence: true,
    motionCompileAllowed: false,
    motionRenderAllowed: false,
    authorityPromotionAllowed: false,
    imagegenMasterRequired: true,
    rejectionSha256: report.rejectionSha256,
    rejectionPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/approved-master-layer-motion-pilot-v3/deterministic-draft-rejection.json",
    ed13CandidateStatus: "RETAINED_NOT_PROMOTED",
    updatedAt: now,
  };
  next.production.shotIntelligence.representativeApprovedMasterMotionPilot = {...pilot, current: true, updatedAt: pilot.updatedAt};
  next.production.assembly = {...next.production.assembly, productionWired: false, userVisualApproval: "NOT_APPROVED"};
  next.production.motion = {...next.production.motion, fullMotionAllowed: false, motionApproved: false, aeLevelProven: false};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "reject-representative-motion-v3-deterministic-draft", targetId: "ED-31", payload: {status: report.status, rejectionSha256: report.rejectionSha256, imagegenMasterRequired: true, motionRenderAllowed: false, currentPilotVideoSha256: pilot.video.sha256}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `representative-motion-v3-deterministic-rejection-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-motion-pilot-v3/deterministic-draft-rejection.json": report}});
  return {status: report.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, transitionSha256: committed.transitionSha256, rejectionSha256: report.rejectionSha256, currentPilotVideo: pilot.video, currentPilotPublicUrl: pilot.publicUrl, ed13CandidateStatus: "RETAINED_NOT_PROMOTED", nextRequiredInput: report.nextRequiredInput};
});

console.log(JSON.stringify(result, null, 2));
