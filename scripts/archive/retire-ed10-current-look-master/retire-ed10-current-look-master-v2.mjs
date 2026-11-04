#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {activeEd10OldArtifactReferences, retireEd10CurrentLookMaster} from "../apps/studio-next/src/lib/a1-ed10-current-look-master-retirement-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = args.has("--dry-run");
if (apply === dryRun) throw new Error("ed10-retirement-exactly-one-mode-required:--dry-run-or--apply");
const expectedIndex = process.argv.indexOf("--expected-workspace-sha");
const expectedWorkspaceSha256 = expectedIndex >= 0 ? process.argv[expectedIndex + 1] : null;
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed10-retirement-expected-workspace-sha-required");

const appRoot = path.resolve("apps/studio-next");
const now = new Date().toISOString();
const userQuote = "其实这个一直是旧的版本啊 我不懂为什么总拿这个出来 怎么就删不掉呢 你好好规划下到底怎么办";

const run = () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const retired = retireEd10CurrentLookMaster(current, {now, userQuote, expectedWorkspaceSha256});
  const event = createProductionEvent({
    workspace: current,
    action: "retire-ed10-current-look-master-v2",
    targetId: "ED-10",
    payload: {
      artifactSha256: retired.receipt.artifactSha256,
      candidateId: retired.receipt.candidateId,
      receiptSha256: retired.receipt.receiptSha256,
      physicalFileDeleted: false,
      generatedImages: false,
      assemblyCreated: false,
      motionStarted: false,
    },
    now,
  });
  retired.workspace.production.eventLedger.eventCount += 1;
  retired.workspace.production.eventLedger.lastEventId = event.eventId;
  retired.workspace.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(retired.workspace, now));
  const activeReferences = activeEd10OldArtifactReferences(recalculated);
  if (activeReferences.length) throw new Error(`ed10-retirement-post-recalculate-active-reference-remains:${activeReferences.join(",")}`);
  const result = {
    status: dryRun ? "DRY_RUN_PASS" : "PASS",
    previousWorkspaceSha256: current.workspaceSha256,
    nextWorkspaceSha256: recalculated.workspaceSha256,
    receipt: retired.receipt,
    activeOldArtifactReferences: activeReferences,
    runtimeStatus: recalculated.production.shotIntelligence.status,
    visualReplacement: recalculated.production.shotIntelligence.visualReplacement,
    generation: recalculated.production.generation.summary,
    assemblyCreationAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed,
  };
  if (dryRun) return result;
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `retire-ed10-current-look-master-v2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"ed10-current-look-master-retirement-v2/receipt.json": retired.receipt},
  });
  return {...result, workspaceSha256: committed.workspaceSha256};
};

const result = apply ? withProjectLock(appRoot, run) : run();
console.log(JSON.stringify(result, null, 2));
