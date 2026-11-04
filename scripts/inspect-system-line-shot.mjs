#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const projectRelative = "editorial-asset-workbench-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", projectRelative);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", projectRelative);
const authorityPath = path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json");
const publicPrefix = `/generated/system-line/${projectRelative}/`;
const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const shotId = argValue("--shot");
if (!shotId || !/^ED-\d{2}$/u.test(shotId)) {
  console.error("usage: npm run inspect:system-line-shot -- --shot ED-10 --no-write");
  process.exit(2);
}

const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const byShot = (items) => (items || []).find((item) => item.shotId === shotId) || null;

function relativeFromPublicUrl(publicUrl) {
  if (typeof publicUrl !== "string" || !publicUrl.startsWith(publicPrefix)) return null;
  const relative = publicUrl.slice(publicPrefix.length);
  return relative && !relative.includes("..") ? relative : null;
}

async function inspectImage(publicUrl, declaredSha256) {
  const relative = relativeFromPublicUrl(publicUrl);
  if (!relative) return {publicUrl, declaredSha256, status: "BLOCKED", failures: ["UNRESOLVED_PUBLIC_URL"]};
  const publicPath = path.join(publicDir, relative);
  const artifactPath = path.join(artifactDir, relative);
  const publicExists = fs.existsSync(publicPath);
  const artifactExists = fs.existsSync(artifactPath);
  const result = {publicUrl, relativePath: relative, declaredSha256, publicPath, artifactPath, publicExists, artifactExists, failures: []};
  if (!publicExists) result.failures.push("PUBLIC_FILE_MISSING");
  if (!artifactExists) result.failures.push("ARTIFACT_MIRROR_MISSING");
  if (!publicExists) return {...result, status: "BLOCKED"};
  try {
    const metadata = await sharp(publicPath).metadata();
    const stats = await sharp(publicPath).stats();
    result.decode = {status: "PASS", format: metadata.format, width: metadata.width, height: metadata.height, channels: metadata.channels, entropy: Number(stats.entropy.toFixed(4)), isOpaque: stats.isOpaque};
  } catch (error) {
    result.decode = {status: "BLOCKED", error: error.message};
    result.failures.push("PUBLIC_FILE_DECODE_FAILED");
  }
  result.actualSha256 = sha256File(publicPath);
  result.shaMatches = Boolean(declaredSha256 && result.actualSha256 === declaredSha256);
  if (!result.shaMatches) result.failures.push("PUBLIC_FILE_SHA_MISMATCH");
  if (artifactExists) {
    result.artifactActualSha256 = sha256File(artifactPath);
    result.mirrorShaMatches = result.artifactActualSha256 === result.actualSha256;
    if (!result.mirrorShaMatches) result.failures.push("PUBLIC_ARTIFACT_MIRROR_MISMATCH");
  }
  return {...result, status: result.failures.length ? "BLOCKED" : "PASS"};
}

const publicWorkspace = readJson(path.join(publicDir, "workspace.json"));
const artifactWorkspace = readJson(path.join(artifactDir, "workspace.json"));
const manifest = readJson(path.join(publicDir, "whole-film-static-board-v1/board-manifest.json"));
if (!publicWorkspace || !artifactWorkspace || !manifest) {
  console.log(JSON.stringify({contract: "A1SystemLineShotIntegrityInspection/v1", status: "AUTHORITY_UNAVAILABLE", shotId, noWrite: true}, null, 2));
  process.exit(1);
}

const runtime = publicWorkspace.production?.shotIntelligence || {};
const visualReplacement = runtime.visualReplacement?.scope === shotId
  && ["IN_PROGRESS", "AWAITING_USER_LOOK_MASTER_REVIEW", "FINAL_ASSEMBLY_REVIEW_REQUIRED"].includes(runtime.visualReplacement.status)
  ? runtime.visualReplacement
  : null;
const retiredArtifacts = (runtime.retiredLookMasterArtifacts || []).filter((item) => item.shotId === shotId && item.selectionEligible === false);
const retiredSha256s = new Set(retiredArtifacts.map((item) => item.artifactSha256).filter(Boolean));
const boardCurrent = ["PENDING_USER_APPROVAL", "APPROVED"].includes(runtime.wholeFilmStaticBoard?.status)
  && runtime.wholeFilmStaticBoard?.current !== false;
const manifestWorkspaceSha256 = manifest.workspaceSha256After || manifest.workspaceSha256Before || null;
const manifestCurrent = manifest.packageBoard?.sha256 === runtime.wholeFilmStaticBoard?.sha256
  && manifest.timelineBoard?.sha256 === runtime.wholeFilmStaticBoard?.timelineBoard?.sha256
  && manifest.status === runtime.wholeFilmStaticBoard?.status;
const currentItem = (item) => item && item.current !== false && item.historyReadOnly !== true && !String(item.status || "").startsWith("HISTORY_READ_ONLY");
const workspaceItem = boardCurrent && currentItem(byShot(runtime.wholeFilmStaticBoard?.items)) ? byShot(runtime.wholeFilmStaticBoard?.items) : null;
const packageItem = manifestCurrent && currentItem(byShot(manifest.packageItems)) ? byShot(manifest.packageItems) : null;
const timelineItem = manifestCurrent && currentItem(byShot(manifest.timelineItems)) ? byShot(manifest.timelineItems) : null;
const boardItem = packageItem || timelineItem || workspaceItem;
const plan = (runtime.packageLookMasterPlans || []).find((item) => item.shotId === shotId) || null;
const currentSelection = plan?.provisionalWholeFilmBoardSelection || null;
const reviewCandidateAuthority = publicWorkspace.production?.ed10LookMasterCandidateAuthority?.shotId === shotId
  && publicWorkspace.production.ed10LookMasterCandidateAuthority.current === true
  ? publicWorkspace.production.ed10LookMasterCandidateAuthority
  : null;
const sourceSha256 = currentSelection?.artifact?.sha256 || boardItem?.styleLineage?.sourceArtifactSha256 || null;
const sourceRaw = (runtime.lookMasterRawReferences || []).find((item) => item.shotId === shotId
  && item.artifact?.sha256 === sourceSha256
  && item.current === true
  && item.historyReadOnly !== true
  && item.selectionEligible !== false
  && !retiredSha256s.has(item.artifact?.sha256)) || null;
const boardUrl = boardItem?.artifactPublicUrl || boardItem?.previewPublicUrl || workspaceItem?.artifactPublicUrl || workspaceItem?.previewPublicUrl || null;
const sourcePublicUrl = sourceRaw?.artifact?.publicUrl
  || (boardItem?.styleLineage?.presenterBinding?.sha256 === sourceSha256 ? boardItem.styleLineage.presenterBinding.publicUrl : null)
  || (boardItem?.artifactSha256 === sourceSha256 ? boardUrl : null);
const [boardArtifact, selectedSource, currentReviewCandidate, packageBoard, timelineBoard] = await Promise.all([
  boardUrl ? inspectImage(boardUrl, boardItem?.artifactSha256 || workspaceItem?.artifactSha256 || null) : Promise.resolve({status: "BLOCKED", failures: [visualReplacement ? "CURRENT_BOARD_RETIRED_FOR_VISUAL_REPLACEMENT" : "CURRENT_BOARD_ARTIFACT_NOT_RESOLVED"]}),
  sourcePublicUrl ? inspectImage(sourcePublicUrl, sourceSha256) : Promise.resolve({status: "BLOCKED", failures: [visualReplacement ? "CURRENT_SELECTION_RETIRED_AWAITING_REPLACEMENT" : "SELECTED_SOURCE_NOT_RESOLVED"], declaredSha256: sourceSha256}),
  reviewCandidateAuthority ? inspectImage(reviewCandidateAuthority.candidate?.publicUrl, reviewCandidateAuthority.candidate?.sha256) : Promise.resolve(null),
  inspectImage(manifest.packageBoard?.publicUrl, manifest.packageBoard?.sha256),
  inspectImage(manifest.timelineBoard?.publicUrl, manifest.timelineBoard?.sha256),
]);

const authority = readJson(authorityPath);
const pixelReport = readJson(path.join(publicDir, "storyboard-pixel-consistency-v1/report.json"));
const boardReport = readJson(path.join(publicDir, "whole-film-static-board-v1/report.json"));
const reportEvidence = {
  pixelConsistency: pixelReport ? {status: pixelReport.status, workspaceSha256: pixelReport.workspaceSha256 || null, currentWorkspace: pixelReport.workspaceSha256 === publicWorkspace.workspaceSha256, shot: byShot(pixelReport.entries || pixelReport.items)} : null,
  staticBoard: boardReport ? {status: boardReport.status, workspaceSha256: boardReport.workspaceSha256 || null, currentWorkspace: boardReport.workspaceSha256 === publicWorkspace.workspaceSha256, packageBoard: boardReport.packageBoard || null} : null,
};
const shotFailures = [
  ...(!workspaceItem ? ["WORKSPACE_SHOT_ITEM_MISSING"] : []),
  ...(!packageItem && !timelineItem ? ["MANIFEST_SHOT_ITEM_MISSING"] : []),
  ...boardArtifact.failures,
  ...selectedSource.failures,
];
const shotIntegrityStatus = shotFailures.length ? "BLOCKED" : "PASS";
const authorityStatus = authority?.status || "AUTHORITY_UNAVAILABLE";

console.log(JSON.stringify({
  contract: "A1SystemLineShotIntegrityInspection/v1",
  status: shotIntegrityStatus === "PASS" && authorityStatus === "PASS" ? "PASS" : "BLOCKED",
  noWrite: true,
  shotId,
  workspaceIdentity: {publicSha256: publicWorkspace.workspaceSha256, artifactSha256: artifactWorkspace.workspaceSha256, mirrorStatus: publicWorkspace.workspaceSha256 === artifactWorkspace.workspaceSha256 ? "IN_SYNC" : "MISMATCH"},
  replacementGate: visualReplacement ? {status: visualReplacement.status, reason: visualReplacement.reason, retiredArtifactSha256: visualReplacement.retiredArtifactSha256 || null, stopAtUserLookMasterReview: visualReplacement.stopAtUserLookMasterReview === true} : null,
  currentReviewCandidate: reviewCandidateAuthority ? {status: currentReviewCandidate?.status || "BLOCKED", candidateId: reviewCandidateAuthority.candidate?.id || null, userVisualApproval: reviewCandidateAuthority.userVisualApproval, productionAdmission: reviewCandidateAuthority.productionAdmission, typographyRouteStatus: reviewCandidateAuthority.typographyRoute?.status || null, artifact: currentReviewCandidate} : null,
  retiredArtifacts: retiredArtifacts.map((item) => ({artifactSha256: item.artifactSha256, candidateId: item.candidateId, status: item.status, selectionEligible: item.selectionEligible, cacheReadmissionAllowed: item.cacheReadmissionAllowed})),
  manifestIdentity: {workspaceSha256: manifestWorkspaceSha256, currentWorkspace: manifestCurrent},
  authority: {status: authorityStatus, failures: authority?.failures || [], nextAction: authority?.nextAction || null},
  shotIntegrity: {status: shotIntegrityStatus, failures: [...new Set(shotFailures)], workspaceItemPresent: Boolean(workspaceItem), packageItemPresent: Boolean(packageItem), timelineItemPresent: Boolean(timelineItem)},
  boardArtifact,
  selectedSource,
  boards: {package: packageBoard, timeline: timelineBoard, packageItemIndex: (manifest.packageItems || []).findIndex((item) => item.shotId === shotId), timelineItemIndex: (manifest.timelineItems || []).findIndex((item) => item.shotId === shotId), actualPixelInspectionRequired: true},
  reportEvidence,
}, null, 2));

process.exitCode = shotIntegrityStatus === "PASS" && authorityStatus === "PASS" ? 0 : 1;
