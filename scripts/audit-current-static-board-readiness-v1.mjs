#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const reportRoot = path.join(artifactRoot, "current-static-board-readiness-v1");
const reportPath = path.join(reportRoot, "report.json");
const publicReportRoot = path.join(appRoot, "public/generated/system-line/current-static-board-readiness-v1");
const publicReportPath = path.join(publicReportRoot, "report.json");

const workspace = readProjectWorkspace(appRoot);
const production = workspace.production || {};
const board = production.shotIntelligence?.wholeFilmStaticBoard || null;
const decisions = production.canonicalCreatorPackagingSequence?.decisions || [];
const packageShotIds = decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId);
const bindings = production.creatorPaletteShotBindingManifest?.entries || [];
const bindingByShot = new Map(bindings.map((item) => [item.shotId, item]));
const boardItems = board?.items || [];
const boardByShot = new Map(boardItems.map((item) => [item.shotId, item]));
const freshBoardShotIds = [];
const staleBoardShotIds = [];
const missingLineageShotIds = [];
for (const shotId of packageShotIds) {
  const binding = bindingByShot.get(shotId);
  const item = boardByShot.get(shotId);
  const currentSha = binding?.actualShotCandidateSha256 || null;
  const matchesCurrent = Boolean(item && currentSha && item.artifactSha256 === currentSha);
  if (matchesCurrent) {
    freshBoardShotIds.push(shotId);
    if (item.styleLineage?.contract !== "A1StaticBoardStyleLineage/v1") missingLineageShotIds.push(shotId);
  } else if (item) {
    staleBoardShotIds.push(shotId);
  } else {
    missingLineageShotIds.push(shotId);
  }
}

const automaticQa = production.articlePackagingAutomaticQa || {};
const blockers = [
  ...staleBoardShotIds.map((shotId) => `STALE_CURRENT_BOARD:${shotId}`),
  ...missingLineageShotIds.map((shotId) => `CURRENT_STYLE_LINEAGE_EVIDENCE_MISSING:${shotId}`),
];
if (automaticQa.status === "WAITING_ON_OBJECTIVE_ASSET_QA") blockers.push(`OBJECTIVE_ASSET_QA_PENDING:${automaticQa.blockerCount || 0}`);
const status = staleBoardShotIds.length || missingLineageShotIds.length
  ? "WAITING_ON_FRESH_BOARD_EVIDENCE"
  : automaticQa.status === "WAITING_ON_OBJECTIVE_ASSET_QA"
    ? "WAITING_ON_OBJECTIVE_ASSET_QA"
    : "READY_FOR_STATIC_BOARD_REBUILD";
const report = {
  contract: "A1CurrentStaticBoardReadiness/v1",
  generatedAt: new Date().toISOString(),
  status,
  mutationPerformed: false,
  dispatchPerformed: false,
  current: {
    workspaceSha256: workspace.workspaceSha256,
    boardStatus: board?.status || null,
    boardSha256: board?.sha256 || null,
    packageShotCount: packageShotIds.length,
    boardItemCount: boardItems.length,
    freshBoardShotCount: freshBoardShotIds.length,
    staleBoardShotCount: staleBoardShotIds.length,
    freshStyleLineageCount: freshBoardShotIds.filter((shotId) => boardByShot.get(shotId)?.styleLineage?.contract === "A1StaticBoardStyleLineage/v1").length,
    missingLineageCount: missingLineageShotIds.length,
    staleBoardShotIds,
    missingLineageShotIds,
    automaticQaStatus: automaticQa.status || null,
    automaticQaBlockerCount: automaticQa.blockerCount || 0,
  },
  blockers,
  nextAction: status === "WAITING_ON_FRESH_BOARD_EVIDENCE"
    ? "generate-current-style-lineage-and-composite-pixel-evidence"
    : status === "WAITING_ON_OBJECTIVE_ASSET_QA"
      ? "complete-objective-asset-qa"
      : "rebuild-current-whole-film-static-board",
};
fs.mkdirSync(reportRoot, {recursive: true});
fs.mkdirSync(publicReportRoot, {recursive: true});
const payload = `${JSON.stringify(report, null, 2)}\n`;
fs.writeFileSync(reportPath, payload);
fs.writeFileSync(publicReportPath, payload);
console.log(JSON.stringify({status: report.status, reportPath: path.relative(root, reportPath), blockers: report.blockers}, null, 2));
