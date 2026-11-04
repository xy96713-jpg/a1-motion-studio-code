#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const shotId = process.argv[2];
const expectedWorkspaceSha256 = process.argv[3];
if (!/^ED-[0-9]{2}$/u.test(String(shotId || ""))) throw new Error("single-shot-canary-shot-id-required");
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("single-shot-canary-workspace-sha-required");
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`single-shot-canary-cas:${current.workspaceSha256}`);
  const next = structuredClone(current);
  const authority = next.production?.shotIntelligence?.currentStoryboardAuthority;
  const shot = authority?.shots?.find((item) => item.shotId === shotId && item.current !== false);
  if (authority?.contract !== "A1CurrentStoryboardAuthority/v1" || !shot?.motionDesignContract) throw new Error("single-shot-canary-current-motion-contract-required");
  if (shot.motionDesignContract.source?.versionId !== shot.versionId || shot.motionDesignContract.source?.artifactSha256 !== shot.artifactSha256) throw new Error("single-shot-canary-motion-binding-stale");
  if (shot.motionDesignContract.review?.productionAdmission !== false || shot.motionDesignContract.review?.fullFilmMotionAllowed !== false) throw new Error("single-shot-canary-production-boundary-open");
  const now = new Date().toISOString();
  const authorizationBody = {
    contract: "A1SingleShotMotionCanaryAuthorization/v1",
    shotId,
    sourceVersionId: shot.versionId,
    sourceArtifactSha256: shot.artifactSha256,
    sourceMotionDesignSha256: shot.motionDesignContract.motionDesignSha256,
    scope: "INTERNAL_REVIEW_CANARY_ONLY",
    authorizedBy: "user",
    userVisualApproval: "APPROVED_FOR_SINGLE_SHOT_CANARY",
    productionAdmission: false,
    assemblyAllowed: false,
    fullFilmMotionAllowed: false,
    finalRenderAllowed: false,
    publicationAllowed: false,
    authorizedAt: now,
  };
  const authorization = {...authorizationBody, authorizationSha256: hash(authorizationBody)};
  shot.prototypeEligible = true;
  shot.singleShotMotionCanaryAuthorization = authorization;
  shot.motionDesignStatus = "APPROVED_FOR_SINGLE_SHOT_CANARY";
  authority.singleShotMotionCanaryAuthorizations = [
    ...(authority.singleShotMotionCanaryAuthorizations || []).filter((item) => item.shotId !== shotId),
    authorization,
  ];
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (recalculated.production.authority.nextAction?.id !== current.production.authority.nextAction?.id) throw new Error("single-shot-canary-next-action-drift");
  if (recalculated.gates?.motionPrototypeAllowed !== false || recalculated.gates?.finalRenderAllowed !== false) throw new Error("single-shot-canary-global-gate-drift");
  const event = createProductionEvent({workspace: current, action: "authorize-current-storyboard-single-shot-canary", targetId: authorization.authorizationSha256, payload: authorization, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {[`single-shot-motion-canary-v1/${shotId.toLowerCase()}-authorization.json`]: authorization}});
  return {status: "PASS", shotId, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, authorization, nextAction: recalculated.production.authority.nextAction, globalGates: {motionPrototypeAllowed: recalculated.gates.motionPrototypeAllowed, finalRenderAllowed: recalculated.gates.finalRenderAllowed}};
});

console.log(JSON.stringify(result, null, 2));
