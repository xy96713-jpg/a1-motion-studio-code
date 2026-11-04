#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const proof = current.production.packagingAnchorProof;
  if (!proof) throw new Error("packaging-anchor-static-proof-missing");
  const next = structuredClone(current);
  next.production.packagingAnchorProof = {
    ...next.production.packagingAnchorProof,
    status: "SUPERSEDED_BY_REFERENCE_CONDITIONED_IMAGEGEN",
    visualStatus: "VISUAL_REJECTED",
    visualApproval: "SUPERSEDED_BY_REFERENCE_CONDITIONED_IMAGEGEN",
    supersededAt: now,
    supersededReason: "user-rejected-deterministic-svg-as-final-aesthetic; reference-conditioned-imagegen-required",
    replacementRoute: "reference-conditioned-imagegen-plus-editable-compositor",
  };
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const event = createProductionEvent({
    workspace: current,
    action: "supersede-deterministic-packaging-anchor-proof",
    targetId: proof.contract,
    payload: {eventIds: proof.eventIds, visualStatus: "VISUAL_REJECTED", replacementRoute: "reference-conditioned-imagegen-plus-editable-compositor", generatedImages: false, criticPerformed: false, renderedVideo: false},
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {event, files: {"packaging-anchor-proof-v1/superseded.json": recalculated.production.packagingAnchorProof}});
  console.log(JSON.stringify({status: "PASS", workspaceSha256: recalculated.workspaceSha256, proof: recalculated.production.packagingAnchorProof, queue: recalculated.production.generation.summary, worker: recalculated.production.generation.workerStatus}, null, 2));
});
