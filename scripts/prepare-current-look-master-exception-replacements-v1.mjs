#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, buildPackageLookMasterPlan} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {assertRetroPixelEditorialStyleBrief, compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {buildVideoPackagingContext, buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("replacement-prepare-expected-workspace-sha-required");

const ED34_SUBJECT_BOUNDS = {
  x: 0.40,
  y: 0.25,
  width: 0.36,
  height: 0.75,
  semanticRole: "presenter-face-and-central-body-silhouette",
  status: "DECLARED_FROM_ACTUAL_HOLD_FRAME_REVIEW",
};
const ED34_SAFE_ZONES = [
  {id: "upper-left-overlay-safe-zone", x: 0.02, y: 0.04, width: 0.36, height: 0.34},
];
const ED34_VARIATION = {
  primaryFamily: "icon-atlas-interface-language",
  supportingFamilies: ["isometric-machine-collage"],
  surfaceLogic: "transparent-author-preference-loom",
  dominantActor: "three-preference-materials-woven-into-one-authored-direction-ribbon",
  composition: "compact-upper-left-two-mass-causal-path-with-central-subject-void",
  palette: "cream-charcoal-cobalt-vermilion",
  material: "one-bit-pixel-loom-and-woven-paper-registration",
  motionEnergy: "three-preference-threads-enter-then-one-authored-direction-ribbon-exits",
};

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`replacement-prepare-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("replacement-prepare-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("replacement-prepare-assembly-already-created");
  assert.deepEqual(current.production.authority.nextAction?.targetShotIds, ["ED-14", "ED-34"]);

  const now = new Date().toISOString();
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const decision = runtime.decisionSet.items.find((item) => item.shotId === "ED-34");
  const semanticBrief = runtime.semanticDesignBriefSet.briefs.find((item) => item.shotId === "ED-34");
  const oldContext = runtime.videoPackagingContexts.items.find((item) => item.shotId === "ED-34");
  const event = next.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds?.includes("ED-34"));
  const oldPlan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-34");
  if (!decision || !semanticBrief || !oldContext || !event || !oldPlan) throw new Error("replacement-prepare-ed34-bindings-incomplete");

  const newContext = buildVideoPackagingContext({
    decision,
    demand: {editWindow: oldContext.timelineRange},
    holdFrame: oldContext.baseFrame,
    subjectBounds: ED34_SUBJECT_BOUNDS,
    safeZones: ED34_SAFE_ZONES,
    visualAnchors: oldContext.visualAnchors,
    createdAt: now,
  });
  const contextHistory = [...(runtime.videoPackagingContextHistory || [])];
  if (!contextHistory.some((item) => item.contextSha256 === oldContext.contextSha256)) contextHistory.push({...oldContext, status: "HISTORY_READ_ONLY", current: false});
  runtime.videoPackagingContextHistory = contextHistory;
  runtime.videoPackagingContexts = buildVideoPackagingContextSet(runtime.videoPackagingContexts.items.map((item) => item.shotId === "ED-34" ? newContext : item), {createdAt: now});

  const oldStyle = next.production.packagingStyleBriefs.find((item) => item.sourceBeatIds?.includes("ED-34"));
  if (!oldStyle) throw new Error("replacement-prepare-ed34-style-missing");
  const newStyle = compileRetroPixelEditorialStyleBrief({
    event,
    appRoot,
    videoContext: newContext,
    semanticBrief,
    variationOverrides: ED34_VARIATION,
    now,
  });
  assertRetroPixelEditorialStyleBrief(newStyle, {appRoot});
  next.production.packagingStyleBriefHistory = [...(next.production.packagingStyleBriefHistory || []), {...oldStyle, status: "HISTORY_READ_ONLY", current: false, supersededAt: now}];
  next.production.packagingStyleBriefs = next.production.packagingStyleBriefs.map((item) => item.sourceBeatIds?.includes("ED-34") ? newStyle : item);

  const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
  const newPlan = assertPackageLookMasterPlan(buildPackageLookMasterPlan(decision, newStyle, {
    now,
    previousPlan: oldPlan,
    videoContext: newContext,
    semanticBrief,
    referenceManifest,
  }));
  newPlan.status = "LOOK_MASTER_FOOTAGE_COMPATIBILITY_REPAIR_REQUIRED";
  runtime.packageLookMasterPlanHistory = [...(runtime.packageLookMasterPlanHistory || []), {...oldPlan, status: "HISTORY_READ_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY", supersededAt: now}];
  runtime.packageLookMasterPlans = runtime.packageLookMasterPlans.map((item) => item.shotId === "ED-34" ? newPlan : item);

  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const currentEd34 = recalculated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-34");
  assert.equal(currentEd34.videoContext.subjectBounds.status, "DECLARED_FROM_ACTUAL_HOLD_FRAME_REVIEW");
  assert.equal(currentEd34.styleBriefSha256, newStyle.styleBriefSha256);
  assert.equal(currentEd34.semanticDesignBriefSha256, semanticBrief.briefSha256);
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);

  const commitId = `look-master-exception-prepare-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const productionEvent = createProductionEvent({
    workspace: current,
    action: "prepare-current-look-master-exception-replacements",
    targetId: "ED-14,ED-34",
    payload: {
      contract: "A1CurrentLookMasterExceptionPreparation/v1",
      ed34SubjectBounds: ED34_SUBJECT_BOUNDS,
      ed34SafeZones: ED34_SAFE_ZONES,
      oldEd34PlanSha256: oldPlan.planSha256,
      newEd34PlanSha256: currentEd34.planSha256,
      ed34SemanticBriefSha256: semanticBrief.briefSha256,
      generatedImageCount: 0,
      assemblyCreated: false,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = productionEvent.eventId;
  recalculated.production.eventLedger.lastEventAt = productionEvent.createdAt;
  const report = {
    contract: "A1CurrentLookMasterExceptionPreparationReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    ed14PlanSha256: recalculated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-14")?.planSha256,
    ed34PlanSha256Before: oldPlan.planSha256,
    ed34PlanSha256After: currentEd34.planSha256,
    ed34StyleBriefSha256: newStyle.styleBriefSha256,
    ed34SemanticBriefSha256: semanticBrief.briefSha256,
    subjectBounds: currentEd34.videoContext.subjectBounds,
    safeZones: currentEd34.videoContext.safeZones,
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length,
    generatedAt: now,
  };
  const committed = persistProjectState(appRoot, recalculated, {
    event: productionEvent,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId,
    files: {"look-master-exception-repair-v2/preparation.json": report},
  });
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, checkpointJournal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
