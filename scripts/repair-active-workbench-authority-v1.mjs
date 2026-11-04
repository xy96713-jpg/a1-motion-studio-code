#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sourceSlug = "fca1a0bc9604e8f9";
const sourcePublicRoot = path.join(root, "apps/studio-next/public/generated/system-line/unseen-real-article-e2e-v1", sourceSlug);
const sourceArtifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/unseen-real-article-e2e-v1", sourceSlug);
const currentPublicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/cross-article-proof-v1", sourceSlug);
const currentArtifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/cross-article-proof-v1", sourceSlug);
const now = new Date().toISOString();
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");

const proofFiles = ["report.json", "direct-visual-review.json", "four-frame-contact-sheet.png"];
for (const name of proofFiles) {
  const sourcePublic = path.join(sourcePublicRoot, name);
  const sourceArtifact = path.join(sourceArtifactRoot, name);
  if (!fs.existsSync(sourcePublic) || !fs.existsSync(sourceArtifact)) {
    throw new Error(`cross-article-proof-source-missing:${name}`);
  }
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const rounds = current.production.maturityLoop?.rounds || [];
  const currentRepresentativeSha = current.production.maturityLoop?.representativeMotionReport?.reportSha256 || null;
  const removedRounds = rounds.filter((round) => (
    (round.targetType === "screen-operation-sequence" && round.targetId === "ED-02")
    || (round.targetType === "representative-motion" && round.reportSha256 !== currentRepresentativeSha)
  ));
  next.production.maturityLoop.rounds = rounds.filter((round) => !removedRounds.includes(round));

  fs.mkdirSync(currentPublicRoot, {recursive: true});
  fs.mkdirSync(currentArtifactRoot, {recursive: true});
  for (const name of proofFiles) {
    fs.copyFileSync(path.join(sourcePublicRoot, name), path.join(currentPublicRoot, name));
    fs.copyFileSync(path.join(sourceArtifactRoot, name), path.join(currentArtifactRoot, name));
  }

  const crossArticleProof = next.production.release.crossArticleProof;
  if (!crossArticleProof || crossArticleProof.contract !== "A1CrossArticleVisualProof/v1") {
    throw new Error("cross-article-proof-contract-required");
  }
  const currentBase = `/generated/system-line/editorial-asset-workbench-v1/cross-article-proof-v1/${sourceSlug}`;
  crossArticleProof.reportPublicUrl = `${currentBase}/report.json`;
  crossArticleProof.directVisualReviewPublicUrl = `${currentBase}/direct-visual-review.json`;
  crossArticleProof.contactSheetPublicUrl = `${currentBase}/four-frame-contact-sheet.png`;
  // The old proof was produced by the legacy template compiler. Keep its
  // qualification false and remove the foreign media URL from current
  // production authority; the original file remains recoverable in its cache.
  crossArticleProof.mediaPublicUrl = null;

  const payload = {
    removedRoundCount: removedRounds.length,
    removedRoundIds: removedRounds.map((round) => `${round.targetType}:${round.targetId}:${round.reportSha256}`).sort(),
    currentRepresentativeSha,
    crossArticleProofPublicBase: currentBase,
    crossArticleProofPipeline: crossArticleProof.pipeline,
  };
  const event = createProductionEvent({workspace: current, action: "active-workbench-authority-repaired", targetId: "editorial-workbench-artifact-authority", payload, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const archiveRoot = path.join(root, ".codex-artifacts/quarantine", `editorial-workbench-stale-maturity-rounds-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`);
  fs.mkdirSync(archiveRoot, {recursive: true});
  const archive = {
    contract: "A1StaleEditorialMaturityRoundArchive/v1",
    status: "QUARANTINED_RECOVERABLE",
    createdAt: now,
    sourceWorkspaceSha256: current.workspaceSha256,
    removedRounds,
    reason: "Historical operation and representative-motion rounds no longer match the current production proof; active authority keeps only current rounds.",
    recoverable: true,
    deleted: false,
  };
  fs.writeFileSync(path.join(archiveRoot, "removed-rounds.json"), `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  const report = {
    contract: "A1EditorialWorkbenchAuthorityRepair/v1",
    status: "REPAIRED",
    createdAt: now,
    sourceWorkspaceSha256: current.workspaceSha256,
    resultingWorkspaceSha256: recalculated.workspaceSha256,
    removedRoundCount: removedRounds.length,
    removedRounds,
    archiveRoot: relative(archiveRoot),
    normalizedCrossArticleProof: {
      reportPublicUrl: crossArticleProof.reportPublicUrl,
      directVisualReviewPublicUrl: crossArticleProof.directVisualReviewPublicUrl,
      contactSheetPublicUrl: crossArticleProof.contactSheetPublicUrl,
      mediaPublicUrl: crossArticleProof.mediaPublicUrl,
      reportSha256: crossArticleProof.reportSha256,
    },
    sourceArtifacts: proofFiles.map((name) => ({
      name,
      publicPath: relative(path.join(currentPublicRoot, name)),
      artifactPath: relative(path.join(currentArtifactRoot, name)),
      sha256: sha256File(path.join(currentPublicRoot, name)),
    })),
    event,
    recoverable: true,
    deleted: false,
  };
  persistProjectState(appRoot, recalculated, {event, files: {"active-workbench-authority-repair-v1/report.json": report}});
  return {workspace: recalculated, report};
});

console.log(JSON.stringify({
  status: result.report.status,
  removedRoundCount: result.report.removedRoundCount,
  archiveRoot: result.report.archiveRoot,
  workspaceSha256: result.workspace.workspaceSha256,
  crossArticleProof: result.report.normalizedCrossArticleProof,
}, null, 2));
