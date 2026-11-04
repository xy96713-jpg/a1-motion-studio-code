#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {applyFastLookMasterDiscovery, buildFastLookMasterDiscovery, selectFastLookMaster} from "../apps/studio-next/src/lib/a1-fast-look-master-discovery-v1.mjs";

const root = process.cwd();
const publicRoot = path.join(root, "apps/studio-next/public");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const runtime = workspace.production.shotIntelligence;
const persistedPlan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
const plan = structuredClone(persistedPlan);
// The active batch-ranked set has already replaced the retired duplicate-pair
// hints. Exercise fast discovery against the plan's current direction set;
// never revive history-only directions to satisfy an old fixed count.
plan.portfolioPolicy = {...plan.portfolioPolicy, explicitDuplicateDirectionPairs: []};
const discovery = await buildFastLookMasterDiscovery({plan, rawReferences: runtime.lookMasterRawReferences, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/test-fast-look-master-composites", now: "2026-08-05T00:00:00.000Z"});
assert.equal(discovery.status, "MORE_DIRECTIONS_REQUIRED");
assert.equal(discovery.selectionPolicy, "ONE_GROUP_COMPARATIVE_REVIEW_AUTO_SELECTS_TOP_THEN_ONE_FINAL_ASSEMBLY_AUDIT");
const currentDirectionIds = persistedPlan.candidateDirections.map((item) => item.directionId);
assert.equal(discovery.effectiveDirectionCount, currentDirectionIds.length);
assert.deepEqual(discovery.candidates.filter((item) => item.status === "EXPLORATION_CANDIDATE").map((item) => item.directionId), currentDirectionIds);
assert.equal(discovery.candidates.some((item) => !currentDirectionIds.includes(item.directionId)), false, "history-only directions must not enter the current discovery selector");
assert.ok(discovery.candidates.every((item) => item.localChecks.decode === "PASS" && item.localChecks.sha256 === "PASS" && item.localChecks.baseFrameComposite === "PASS"));
// The current persisted ED-10 Assembly is intentionally immutable. Exercise
// this legacy discovery fixture on an explicitly unlocked test clone instead
// of weakening the production guard.
const mutableRuntime = structuredClone(runtime);
mutableRuntime.status = "LOOK_MASTER_CANDIDATES_READY";
const fastRuntime = applyFastLookMasterDiscovery(mutableRuntime, discovery, {now: "2026-08-05T00:00:01.000Z"});
assert.equal(fastRuntime.status, "LOOK_MASTER_CANDIDATES_READY");
assert.equal(fastRuntime.packageLookMasterPlans.find((item) => item.shotId === "ED-10").status, "CANDIDATES_PARTIAL");
assert.equal(fastRuntime.packageAssetKitPlans.find((item) => item.shotId === "ED-10").status, "LOOK_MASTER_CANDIDATES_READY");
assert.throws(() => selectFastLookMaster(fastRuntime, {shotId: "ED-10", candidateId: discovery.candidates[1].candidateId}), /user-selection-removed/);
console.log(JSON.stringify({status: "PASS", explorationCandidateCount: discovery.explorationCandidateCount, effectiveDirectionCount: discovery.effectiveDirectionCount, duplicateDirectionIds: discovery.duplicateDirectionIds, selectionGate: "ONE_GROUP_COMPARATIVE_REVIEW"}, null, 2));
