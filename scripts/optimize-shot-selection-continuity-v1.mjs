#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {approveSceneGraphCandidate, createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl || "").replace(/^\/+/, ""));
// Editorial white-page and presenter shots can feel repeated well before they
// become pixel-identical. Match the global review threshold so the provisional
// review board is sequence-aware even when the subscription critic is limited.
const threshold = 22;

async function fingerprint(publicUrl) {
  return sharp(publicFile(publicUrl)).resize(48, 27, {fit: "fill"}).removeAlpha().raw().toBuffer();
}

function pixelDistance(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return Number((total / left.length).toFixed(3));
}

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const shots = workspace.library.assets
  .filter((asset) => asset.route === "shot-composition" && asset.shotDemand && asset.candidates?.length)
  .sort((left, right) => Number(left.shotDemand.order) - Number(right.shotDemand.order));
const reviewCandidateId = (shot) => [
  shot.selectedCandidateId,
  shot.visualCritic?.provisionalCandidateId,
  shot.visualCritic?.selectedCandidateId,
].find((candidateId) => candidateId && shot.candidates.some((candidate) => candidate.candidateId === candidateId))
  || shot.candidates.filter((candidate) => !candidate.screening?.hardFailures?.length)
    .sort((left, right) => Number(right.screening?.score || 0) - Number(left.screening?.score || 0) || left.candidateId.localeCompare(right.candidateId))[0]?.candidateId
  || shot.candidates[0]?.candidateId;
const selectedCandidate = (shot) => shot.candidates.find((candidate) => candidate.candidateId === reviewCandidateId(shot));
const selectedFingerprints = await Promise.all(shots.map((shot) => fingerprint(selectedCandidate(shot).preview.publicUrl)));
const repairs = [];

for (let index = 1; index < shots.length; index += 1) {
  const currentDistance = pixelDistance(selectedFingerprints[index - 1], selectedFingerprints[index]);
  if (currentDistance >= threshold) continue;
  const shot = shots[index];
  const current = selectedCandidate(shot);
  const nextFingerprint = selectedFingerprints[index + 1] || null;
  const currentNextDistance = nextFingerprint ? pixelDistance(selectedFingerprints[index], nextFingerprint) : currentDistance;
  const currentContinuityFloor = Math.min(currentDistance, currentNextDistance);
  const options = [];
  for (const candidate of shot.candidates) {
    if (!candidate.preview?.publicUrl || candidate.screening?.hardFailures?.length) continue;
    if (Number(candidate.screening?.score || 0) < Number(current.screening?.score || 0)) continue;
    const candidateFingerprint = await fingerprint(candidate.preview.publicUrl);
    const previousDistance = pixelDistance(selectedFingerprints[index - 1], candidateFingerprint);
    const nextDistance = nextFingerprint ? pixelDistance(candidateFingerprint, nextFingerprint) : previousDistance;
    options.push({candidate, candidateFingerprint, previousDistance, nextDistance, continuityFloor: Math.min(previousDistance, nextDistance), continuityTotal: previousDistance + nextDistance});
  }
  options.sort((left, right) => right.continuityFloor - left.continuityFloor || right.previousDistance - left.previousDistance || right.continuityTotal - left.continuityTotal || left.candidate.candidateId.localeCompare(right.candidate.candidateId));
  const best = options.find((option) => option.previousDistance >= threshold && option.candidate.candidateId !== current.candidateId)
    || options.find((option) => option.candidate.candidateId !== current.candidateId
      && option.previousDistance >= currentDistance + 2
      && option.continuityFloor >= currentContinuityFloor + 1);
  if (!best) continue;
  repairs.push({
    shotId: shot.shotDemand.shotId,
    previousShotId: shots[index - 1].shotDemand.shotId,
    nextShotId: shots[index + 1]?.shotDemand.shotId || null,
    fromCandidateId: current.candidateId,
    toCandidateId: best.candidate.candidateId,
    authorityMode: shot.selectedCandidateId ? "authoritative-selection" : "provisional-review-only",
    beforeDistance: currentDistance,
    afterPreviousDistance: best.previousDistance,
    afterNextDistance: best.nextDistance,
  });
  shot.selectedCandidateId = best.candidate.candidateId;
  selectedFingerprints[index] = best.candidateFingerprint;
}

const now = new Date().toISOString();
const report = {
  contract: "A1ShotSelectionContinuityOptimization/v1",
  threshold,
  status: repairs.length ? "REPAIRED" : "NO_CHANGE_REQUIRED",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  repairs,
  optimizedAt: now,
};
report.sha256 = sha256(report);

if (repairs.length) withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let next = structuredClone(current);
  for (const repair of repairs) {
    const target = next.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === repair.shotId);
    if (target.selectedCandidateId) {
      next = approveSceneGraphCandidate(next, target.id, repair.toCandidateId, `全片连续性求解器将相邻像素距离从 ${repair.beforeDistance} 提升到 ${repair.afterPreviousDistance}，保持单镜分数不下降。`, now, "system-continuity-optimizer");
    }
    const refreshed = next.library.assets.find((asset) => asset.id === target.id);
    if (refreshed.visualCritic) {
      if (refreshed.selectedCandidateId) refreshed.visualCritic.selectedCandidateId = repair.toCandidateId;
      else refreshed.visualCritic.provisionalCandidateId = repair.toCandidateId;
      refreshed.visualCritic.continuityOptimization = repair;
    }
    const shotReport = next.production.maturityLoop.shotReports?.[repair.shotId];
    if (shotReport) {
      if (refreshed.selectedCandidateId) shotReport.selectedCandidateId = repair.toCandidateId;
      else shotReport.provisionalCandidateId = repair.toCandidateId;
      shotReport.continuityOptimization = repair;
    }
  }
  next.production.maturityLoop.nextAction = "rerun-global-review-board-after-continuity-optimization";
  const event = createProductionEvent({workspace: current, action: "shot-review-continuity-optimized", targetId: report.sha256, payload: {repairCount: repairs.length, shotIds: repairs.map((repair) => repair.shotId), authoritativeRepairCount: repairs.filter((repair) => repair.authorityMode === "authoritative-selection").length}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, now), {event, files: {"shot-selection-continuity-optimization-v1-latest.json": report}});
});

console.log(JSON.stringify(report, null, 2));
