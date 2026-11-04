#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {ensureVisualGenerationDirector} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const raw = readProjectWorkspace(appRoot);
  let current;
  try {
    current = assertEditorialAssetWorkbench(raw);
  } catch (error) {
    // The persisted director was authored before the pixel pack was added.
    // Keep the rest of the workspace untouched and rebuild only that branch.
    if (!String(error?.message || error).includes("visual-treatment-library-invalid")) throw error;
    current = raw;
  }
  const previous = current.production.visualDirector;
  const archive = {
    contract: "A1VisualDirectorBranchArchive/v1",
    archivedAt: now,
    reason: "user-reported-cartoon-pixel-retro-direction-required",
    selectedTreatmentId: previous?.selectedTreatmentId || null,
    treatmentHash: previous?.treatmentHash || null,
    candidateIds: (previous?.generatedCandidates || []).map((candidate) => candidate.id),
    compositeReviewCount: previous?.compositeReviews?.length || 0,
    status: previous?.status || null,
  };
  current.production.visualDirectorArchive = [
    ...(current.production.visualDirectorArchive || []).slice(-3),
    archive,
  ];
  delete current.production.visualDirector;
  const next = ensureProductionState(current, now);
  ensureVisualGenerationDirector(next, now);
  const director = next.production.visualDirector;
  director.status = "treatment-review-required";
  director.updatedAt = now;
  const event = createProductionEvent({
    workspace: next,
    action: "pixel-pop-treatment-installed",
    payload: {
      treatmentId: "newtro-pixel-pop",
      rankedTreatmentIds: director.rankedTreatmentIds,
      queuedAnchorJobs: 0,
      previewOnly: true,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  console.log(JSON.stringify({
    status: "PIXEL_POP_TREATMENT_INSTALLED",
    treatmentLibraryCount: director.treatmentLibrary.length,
    rankedTreatmentIds: director.rankedTreatmentIds,
    pixelPopRank: director.rankedTreatmentIds.indexOf("newtro-pixel-pop") + 1,
    queuedAnchorJobs: 0,
    archivedCandidateCount: archive.candidateIds.length,
    previewOnly: true,
  }, null, 2));
});
