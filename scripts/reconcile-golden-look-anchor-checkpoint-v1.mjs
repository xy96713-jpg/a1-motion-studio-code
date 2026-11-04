#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertGoldenLookAnchorRegistry} from "../apps/studio-next/src/lib/a1-golden-look-anchor-registry-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const reportPath = path.join(artifactDir, "golden-look-anchor-review-v1", "report.json");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assertGoldenLookAnchorRegistry(current.production.goldenLookAnchorRegistry);
  const boardSha256 = current.production.shotIntelligence.wholeFilmStaticBoard.sha256;
  const candidateShas = current.production.shotIntelligence.lookMasterRawReferences.map((item) => item.artifact?.sha256).filter(Boolean);
  const next = recalculateEditorialAssetWorkbench(structuredClone(current));
  if (next.production.shotIntelligence.wholeFilmStaticBoard.sha256 !== boardSha256) throw new Error("golden-anchor-reconcile-board-drift");
  if (JSON.stringify(next.production.shotIntelligence.lookMasterRawReferences.map((item) => item.artifact?.sha256).filter(Boolean)) !== JSON.stringify(candidateShas)) throw new Error("golden-anchor-reconcile-candidate-drift");
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : {};
  const updatedReport = {...report, status: "GOLDEN_ANCHOR_REVIEW", workspaceSha256: next.workspaceSha256, boardSha256After: boardSha256, boardRebuilt: false, candidateShasUnchanged: true, reconciledAt: new Date().toISOString()};
  persistProjectState(appRoot, next, {expectedWorkspaceSha256: current.workspaceSha256, files: {"golden-look-anchor-review-v1/report.json": updatedReport}});
  return {workspaceSha256: next.workspaceSha256, boardSha256, productionStage: next.production.authority.currentStage, nextAction: next.production.authority.nextAction};
});

console.log(JSON.stringify({status: "PASS", ...result}, null, 2));
