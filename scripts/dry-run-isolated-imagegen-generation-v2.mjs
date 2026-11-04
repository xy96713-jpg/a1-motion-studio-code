#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const candidateShas = (workspace) => (workspace.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean).sort();

const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const beforeBoardSha = before.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null;
const beforeCandidateShas = candidateShas(before);
const stdout = execFileSync(process.execPath, [path.join(root, "scripts/prepare-isolated-imagegen-canary-v2.mjs")], {cwd: root, encoding: "utf8", maxBuffer: 10_000_000});
const prepare = JSON.parse(stdout);
const after = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const failures = [
  before.workspaceSha256 !== after.workspaceSha256 ? "WORKSPACE_SHA_CHANGED" : null,
  beforeBoardSha !== after.production.shotIntelligence.wholeFilmStaticBoard?.sha256 ? "BOARD_SHA_CHANGED" : null,
  JSON.stringify(beforeCandidateShas) !== JSON.stringify(candidateShas(after)) ? "CANDIDATE_SHAS_CHANGED" : null,
  after.production.generation.summary.queued !== 0 ? "QUEUE_NOT_EMPTY" : null,
  after.production.generation.summary.running !== 0 ? "RUNNING_NOT_EMPTY" : null,
  after.production.generation.workerStatus !== "frozen" ? "WORKER_NOT_FROZEN" : null,
  (after.production.shotIntelligence.currentAssembly || []).length !== 0 ? "ASSEMBLY_NOT_EMPTY" : null,
  prepare.imageGenCalled !== false || prepare.workspaceWritten !== false || prepare.boardRebuilt !== false ? "DRY_RUN_SIDE_EFFECT_REPORTED" : null,
].filter(Boolean);
const report = {
  contract: "A1IsolatedImagegenLiveDryRun/v2",
  status: failures.length ? "FAIL" : "PASS",
  failures,
  selectedShotId: prepare.selectedShotId,
  jobId: prepare.job.jobId,
  generationKey: prepare.job.generationKey,
  preflightStatus: prepare.job.preflight.status,
  workspaceSha256: after.workspaceSha256,
  boardSha256: beforeBoardSha,
  candidateShaCount: beforeCandidateShas.length,
  queue: after.production.generation.summary,
  workerStatus: after.production.generation.workerStatus,
  assemblyCount: after.production.shotIntelligence.currentAssembly.length,
  imageGenCalled: false,
  workspaceWritten: false,
  boardRebuilt: false,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
