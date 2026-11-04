#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildTypographyFoundry} from "../apps/studio-next/src/lib/a1-typography-foundry-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  next.production.typographyFoundry = buildTypographyFoundry(next, now);
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "paused-typography-foundry-review";
  const event = createProductionEvent({
    workspace: current,
    action: "typography-foundry-initialized",
    targetId: next.production.project.projectId,
    payload: {
      foundrySha256: next.production.typographyFoundry.foundrySha256,
      phraseCount: next.production.typographyFoundry.summary.phraseCount,
      candidateCount: next.production.typographyFoundry.summary.candidateCount,
      generatedNewImages: false,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const report = {
    contract: "A1TypographyFoundryBuildReport/v1",
    status: "READY_FOR_USER_PHRASE_SELECTION",
    generatedAt: now,
    foundrySha256: recalculated.production.typographyFoundry.foundrySha256,
    sourceCandidateSetSha256: recalculated.production.typographyFoundry.sourceCandidateSetSha256,
    summary: recalculated.production.typographyFoundry.summary,
    gates: recalculated.production.typographyFoundry.gates,
    generatedNewImages: false,
    nextAction: "review-four-typography-phrases-on-4311",
  };
  persistProjectState(appRoot, recalculated, {event, files: {"typography-foundry-v1/report.json": report}});
  return {workspace: recalculated, report};
});

console.log(JSON.stringify({status: result.report.status, foundrySha256: result.report.foundrySha256, summary: result.report.summary, gates: result.report.gates, workspaceSha256: result.workspace.workspaceSha256}, null, 2));
