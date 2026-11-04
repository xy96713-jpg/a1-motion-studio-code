#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const shotId = process.argv.find((arg) => arg.startsWith("--shot-id="))?.split("=")[1];
if (!shotId) throw new Error("layered-typography-lineage-shot-id-required");
const now = new Date().toISOString();
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const board = current.production?.shotIntelligence?.wholeFilmStaticBoard;
  const item = board?.items?.find((candidate) => candidate.shotId === shotId);
  if (!item?.artifactPublicUrl) throw new Error(`layered-typography-lineage-board-item-missing:${shotId}`);
  const artifactPath = path.join(appRoot, "public", item.artifactPublicUrl.replace(/^\//u, ""));
  const reportPath = path.join(path.dirname(artifactPath), "report.json");
  if (!fs.existsSync(reportPath)) throw new Error(`layered-typography-lineage-report-missing:${shotId}`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.heroGlyphBinding?.contract !== "A1GeneratedHeroGlyphBinding/v1" || report.supportTypographyBinding?.contract !== "A1LocalSupportTypographyBinding/v1") throw new Error(`layered-typography-lineage-report-invalid:${shotId}`);
  if (report.output?.sha256 !== item.artifactSha256) throw new Error(`layered-typography-lineage-artifact-sha-mismatch:${shotId}`);
  const next = structuredClone(current);
  const nextItem = next.production.shotIntelligence.wholeFilmStaticBoard.items.find((candidate) => candidate.shotId === shotId);
  nextItem.styleLineage = {...nextItem.styleLineage, heroGlyphBinding: report.heroGlyphBinding, supportTypographyBinding: report.supportTypographyBinding, layerOrder: report.layerOrder, layeredTypographyContract: "A1LayeredTypographyBinding/v1"};
  nextItem.styleLineage.compositeVisualAudit = {...nextItem.styleLineage.compositeVisualAudit, generatedHeroGlyph: true, generatedFormalText: false};
  nextItem.textNodeOwnership = {contract: "A1LayeredTypographyNodeOwnership/v1", visibleHeroOwner: "IMAGEGEN_EVA_MECHANISM_CJK", localEditableOwner: "LOCAL_FONTKIT", localNodesAre: ["SUPPORT_COPY", "HERO_EDITABLE_SHADOW"], exactHeroText: report.heroGlyphBinding.exactText, exactSupportText: report.supportTypographyBinding.exactText};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "reconcile-layered-typography-lineage", targetId: shotId, payload: {shotId, artifactSha256: item.artifactSha256, heroGlyphSourceSha256: report.heroGlyphBinding.sourceSha256, supportTypographyRenderer: report.supportTypographyBinding.renderer, pixelsChanged: false}, now});
  const eventBound = structuredClone(recalculated);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const finalWorkspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, finalWorkspace, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `reconcile-layered-typography-lineage-${shotId.toLowerCase()}-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`layered-typography-lineage-v1/${shotId}.json`]: {contract: "A1LayeredTypographyLineageReconciliation/v1", status: "PASS", shotId, artifactSha256: item.artifactSha256, heroGlyphSourceSha256: report.heroGlyphBinding.sourceSha256, supportTypographyBinding: report.supportTypographyBinding, pixelsChanged: false, generatedAt: now}}});
  return {status: "PASS", shotId, artifactSha256: item.artifactSha256, heroGlyphSourceSha256: report.heroGlyphBinding.sourceSha256, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: persisted.workspaceSha256, transitionSha256: persisted.transitionSha256, pixelsChanged: false};
});
console.log(JSON.stringify(result, null, 2));
