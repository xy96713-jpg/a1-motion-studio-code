#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {A1_REFERENCE_SOURCE_EXCLUSIONS, referenceSourceExclusion} from "../apps/studio-next/src/lib/a1-reference-source-exclusions-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sourceId = process.argv[2] || "covacut";
const expectedWorkspaceSha256 = process.argv[3] || null;
const exclusion = referenceSourceExclusion(sourceId);
if (!exclusion) throw new Error(`reference-source-exclusion-not-registered:${sourceId}`);
const now = new Date().toISOString();

function activeReferenceState(workspace) {
  return {
    candidateReferenceSourceIds: workspace.candidateAdmission?.referenceSequenceCorpus?.sourceIds,
    productionReferenceSourceIds: workspace.production?.referenceConditioning?.referenceSourceIds,
    effectiveReferenceSourceIds: workspace.production?.visualDirector?.effectiveReferenceSourceIds,
  };
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (expectedWorkspaceSha256 && current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`reference-source-exclusion-cas:${current.workspaceSha256}:${expectedWorkspaceSha256}`);
  const next = structuredClone(current);
  const activeOccurrencesBefore = JSON.stringify(activeReferenceState(next)).match(/covacut|DYyLlraBk7p/giu)?.length || 0;

  const corpus = next.candidateAdmission?.referenceSequenceCorpus;
  if (corpus) {
    corpus.sourceIds = (corpus.sourceIds || []).filter((id) => id !== sourceId);
    corpus.excludedSourceIds = [...new Set([...(corpus.excludedSourceIds || []), sourceId])];
    corpus.exclusionStatus = exclusion.status;
    corpus.referenceWallPublicUrl = "/generated/system-line/reference-sequence-corpus-v1/reference-wall.jpg";
  }
  if (next.production?.referenceConditioning) {
    next.production.referenceConditioning.referenceSourceIds = (next.production.referenceConditioning.referenceSourceIds || []).filter((id) => id !== sourceId);
    next.production.referenceConditioning.excludedSourceIds = [...new Set([...(next.production.referenceConditioning.excludedSourceIds || []), sourceId])];
    next.production.referenceConditioning.exclusionStatus = exclusion.status;
    next.production.referenceConditioning.referenceWallPublicUrl = "/generated/system-line/reference-sequence-corpus-v1/reference-wall.jpg";
  }
  next.production.visualDirector ||= {};
  next.production.visualDirector.effectiveReferenceSourceIds = ["hupo", "fern", "vox", "cleo-abram", "magnates-media"];
  next.production.visualDirector.referenceExclusions = {
    contract: A1_REFERENCE_SOURCE_EXCLUSIONS.contract,
    status: A1_REFERENCE_SOURCE_EXCLUSIONS.status,
    entries: A1_REFERENCE_SOURCE_EXCLUSIONS.entries.map((entry) => ({...entry, appliedAt: now})),
  };

  const activeOccurrencesAfter = JSON.stringify(activeReferenceState(next)).match(/covacut|DYyLlraBk7p/giu)?.length || 0;
  if (activeOccurrencesAfter !== 0) throw new Error(`reference-source-active-occurrences-remain:${activeOccurrencesAfter}`);

  const report = {
    contract: "A1ReferenceSourceExclusionApplication/v1",
    status: "APPLIED",
    sourceId,
    exclusionStatus: exclusion.status,
    activeOccurrencesBefore,
    activeOccurrencesAfter,
    historyPreserved: true,
    legacyAssignmentMetadataPreserved: true,
    currentPixelsChanged: false,
    storyboardMutationPerformed: false,
    productionAdmission: false,
    appliedAt: now,
  };
  const event = createProductionEvent({workspace: current, action: "reference-source-excluded", targetId: sourceId, payload: report, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now, {scope: "packaging-hot-path"});
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `reference-source-exclusion-${sourceId}-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"reference-source-exclusions-v1/covacut.json": report},
  });
  return {report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256};
});

console.log(JSON.stringify(result, null, 2));
