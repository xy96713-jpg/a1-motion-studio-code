#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {updateRepairManifestSidecar} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {A1_CODEX_IMAGEGEN_PROVIDER, A1_GENERATOR_LANES, buildGenerationProviderRoutingV2} from "../apps/studio-next/src/lib/a1-isolated-imagegen-generation-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const manifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("codex-imagegen-activation-requires-frozen-empty-queue");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("codex-imagegen-activation-requires-empty-assembly");
  const boardSha256 = current.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null;
  const candidateShas = (current.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean).sort();
  const routing = buildGenerationProviderRoutingV2({status: "CANARY_REQUIRED", now});
  const next = structuredClone(current);
  next.production.generation.providerRouting = routing;
  next.production.generation.providerState = {provider: A1_CODEX_IMAGEGEN_PROVIDER, status: "CANARY_REQUIRED", fallback: "BLOCKED_NO_WEB_FALLBACK", observedAt: now};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  const event = createProductionEvent({workspace: current, action: "codex-imagegen-generation-v2-activated", targetId: "isolated-dual-lane", payload: {routingSha256: routing.routingSha256, webConversationStatus: routing.webConversation.status, globalMaxConcurrentJobs: routing.globalMaxConcurrentJobs}, now});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1CodexImageGenGenerationActivation/v2", status: "PASS", routing, workspaceSha256Before: current.workspaceSha256, boardSha256, candidateShaCount: candidateShas.length, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length, boardRebuilt: false, createdAt: now};
  const saved = persistProjectState(appRoot, recalculated, {event, files: {"isolated-imagegen-v2/activation-report.json": report}, expectedWorkspaceSha256: current.workspaceSha256});
  const persisted = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const afterCandidateShas = (persisted.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean).sort();
  if (persisted.production.shotIntelligence.wholeFilmStaticBoard?.sha256 !== boardSha256) throw new Error("codex-imagegen-activation-board-sha-changed");
  if (JSON.stringify(afterCandidateShas) !== JSON.stringify(candidateShas)) throw new Error("codex-imagegen-activation-candidate-shas-changed");
  return {saved, report};
});

await updateRepairManifestSidecar({manifestPath, update: (manifest) => {
  const next = structuredClone(manifest);
  const entry = next.entries.find((item) => item.shotId === "ED-20");
  if (!entry) throw new Error("codex-imagegen-activation-ed20-manifest-entry-missing");
  entry.webGenerationHistory = [...(entry.webGenerationHistory || []), {status: "RETIRED_HISTORY_READ_ONLY", candidateSha: entry.candidateSha || null, previousNextAction: entry.nextAction || null, retiredAt: now}];
  entry.status = "CANARY_REQUIRED";
  entry.generationState = "READY";
  entry.nextAction = {action: "CODEX_IMAGEGEN_CAPABILITY_CANARY", generatorLane: A1_GENERATOR_LANES.TYPOGRAPHY_EXPLAINER, provider: A1_CODEX_IMAGEGEN_PROVIDER, webFallbackAllowed: false, importAllowedBeforeAuditPass: false};
  return next;
}});

console.log(JSON.stringify({status: "PASS", ...result.report, workspaceSha256After: result.saved.workspaceSha256, repairManifestWebPathRetired: true}, null, 2));
