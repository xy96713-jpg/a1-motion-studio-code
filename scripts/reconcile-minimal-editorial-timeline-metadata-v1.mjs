#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const reportFile = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/report.json");

const routeLabel = (decision) => decision.packageDecision === "PACKAGE"
  ? `${decision.presentationMode} PACKAGE`
  : decision.route === "SCREEN_EVIDENCE" ? "真实录屏" : "人物画面";

const sourceRole = (decision) => {
  if (decision.packageDecision !== "PACKAGE") return decision.route === "SCREEN_EVIDENCE" ? "REAL_SOURCE" : "PRESENTER_BASE";
  const owner = decision.presentationDecision?.informationOwner;
  if (owner === "presenter" || decision.frameOccupation === "OVERLAY") return "PRESENTER";
  if (owner === "source") return "REAL_SOURCE";
  if (owner === "typography") return "TYPOGRAPHY";
  return "GENERATED_EDITORIAL";
};

const titleRole = (decision) => {
  if (decision.packageDecision !== "PACKAGE") return "NONE";
  if (decision.contentTreatment === "HERO_TYPOGRAPHY" && decision.frameOccupation === "FULL_FRAME_TAKEOVER") return "HERO_TAKEOVER";
  if (decision.frameOccupation === "OVERLAY" && (decision.requiredFormalText || []).length) return "PRESENTER_HEADLINE";
  if (decision.contentTreatment === "EDITORIAL_EXPLAINER") return "EXPLAINER_LABEL";
  return "NONE";
};

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.authority.currentStage !== "whole-film-static-board-review") throw new Error("timeline-metadata-reconcile-stage-invalid");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("timeline-metadata-reconcile-runtime-not-frozen");
  if (current.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("timeline-metadata-reconcile-user-boundary-invalid");
  const now = new Date().toISOString();
  const next = structuredClone(current);
  const decisions = new Map(next.production.canonicalCreatorPackagingSequence.decisions.map((decision) => [decision.shotId, decision]));
  const board = next.production.shotIntelligence.wholeFilmStaticBoard;
  const originalItems = new Map(board.timelineBoard.items.map((item) => [item.shotId, item]));
  const normalizedItems = board.timelineBoard.items.map((item) => {
    const decision = decisions.get(item.shotId);
    if (!decision) throw new Error(`timeline-metadata-reconcile-decision-missing:${item.shotId}`);
    const route = decision.packageDecision === "PACKAGE" ? "PACKAGE_LOOK_MASTER" : decision.route;
    const normalizedSourceRole = sourceRole(decision);
    const normalizedTitleRole = titleRole(decision);
    const normalizedRouteLabel = routeLabel(decision);
    const provenance = item.preview?.provenance || (decision.packageDecision === "PACKAGE" ? "CURRENT_MINIMAL_EDITORIAL_COMPOSITE" : "CURRENT_CANONICAL_SOURCE");
    return {
      ...item,
      route,
      routeLabel: normalizedRouteLabel,
      sourceRole: normalizedSourceRole,
      titleRole: normalizedTitleRole,
      sourceText: decision.sourceText,
      packageBoardItem: decision.packageDecision === "PACKAGE",
      packageCandidateSha256: decision.packageDecision === "PACKAGE" ? item.packageCandidateSha256 : null,
      placeholderLines: [item.shotId, route, normalizedRouteLabel],
      labelLines: [
        item.labelLines?.[0] || item.shotId,
        `${route} · ${normalizedSourceRole} · title:${normalizedTitleRole}`,
        decision.sourceText,
        provenance,
      ],
    };
  });
  board.timelineBoard.items = normalizedItems;
  board.timelineBoard.itemCount = normalizedItems.length;
  next.production.shotIntelligence.wholeFilmBatchRecommendation.staticBoard = structuredClone(board);
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  report.timelineBoard = structuredClone(board.timelineBoard);
  report.board = {publicUrl: board.publicUrl, sha256: board.sha256, width: board.width, height: board.height};
  report.userVisualApproval = "NOT_APPROVED";
  const correctedShotIds = normalizedItems.filter((item) => {
    const original = originalItems.get(item.shotId);
    return ["route", "routeLabel", "sourceRole", "titleRole", "packageBoardItem"].some((key) => original?.[key] !== item[key])
      || JSON.stringify(original?.placeholderLines || []) !== JSON.stringify(item.placeholderLines)
      || JSON.stringify(original?.labelLines || []) !== JSON.stringify(item.labelLines);
  }).map((item) => item.shotId);
  report.metadataReconciliation = {
    contract: "A1MinimalEditorialTimelineMetadataReconciliation/v1",
    status: "PASS",
    source: "CURRENT_CANONICAL_CREATOR_PACKAGING_SEQUENCE",
    packageCount: normalizedItems.filter((item) => item.packageBoardItem).length,
    noPackageCount: normalizedItems.filter((item) => !item.packageBoardItem).length,
    correctedShotIds,
    pixelBytesChanged: false,
    userVisualApproval: "NOT_APPROVED",
    reconciledAt: now,
  };
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: recalculated, action: "reconcile-minimal-editorial-timeline-metadata-v1", targetId: board.timelineBoard.sha256, payload: report.metadataReconciliation, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `minimal-editorial-timeline-metadata-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"whole-film-static-board-v1/report.json": report},
  });
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, timelineBoardSha256: board.timelineBoard.sha256, itemCount: normalizedItems.length, packageCount: report.metadataReconciliation.packageCount, noPackageCount: report.metadataReconciliation.noPackageCount, pixelBytesChanged: false, userVisualApproval: "NOT_APPROVED"};
});

console.log(JSON.stringify(result, null, 2));
