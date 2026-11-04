#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {advancePackageRuntimeWithLookMasterCandidate, reviewPackageLookMaster} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {applyLookMasterPortfolioAudit, reopenPackageLookMasterForDiversity} from "../apps/studio-next/src/lib/a1-look-master-portfolio-v1.mjs";
import {applyFastLookMasterDiscovery} from "../apps/studio-next/src/lib/a1-fast-look-master-discovery-v1.mjs";
import fs from "node:fs";

const workspace = readProjectWorkspace(path.resolve("apps/studio-next"));
const runtime = workspace.production.shotIntelligence;
const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
assert.equal(workspace.production.packagingPolicy.lookMasterIntermediateApprovalRequired, false);
assert.equal(runtime.activePackagingPolicy.lookMasterFlow, "BATCH_RANKED_AUTO_SELECTED");
assert.equal(plan.selectedLookMasterBinding.status, "BATCH_RANKED_AUTO_SELECTED");
assert.equal(plan.selectedLookMasterBinding.userApprovalRequired, false);
assert.equal(runtime.status, "ASSEMBLY_REVIEW_REQUIRED");

const candidate = plan.candidates[0];
const immutableSnapshot = (value) => JSON.stringify({
  status: value.status,
  plan: value.packageLookMasterPlans.find((item) => item.shotId === "ED-10"),
  kit: value.packageAssetKitPlans.find((item) => item.shotId === "ED-10"),
  recipe: value.packageAssemblyRecipes.find((item) => item.shotId === "ED-10"),
  activeCandidateSet: value.packageLookMasterPlans.find((item) => item.shotId === "ED-10")?.activeCandidateSet,
});
const before = immutableSnapshot(runtime);
assert.throws(() => advancePackageRuntimeWithLookMasterCandidate(runtime, candidate, {now: "2026-08-05T00:00:00.000Z"}), /active-assembly-immutable:advance-package-look-master-candidate:ED-10/);
assert.equal(immutableSnapshot(runtime), before);
assert.throws(() => reviewPackageLookMaster(runtime, {shotId: "ED-10", candidateId: candidate.candidateId, decision: "approved"}), /legacy-look-master-review-disabled-use-batch-ranked-controller/);

const syntheticAudit = structuredClone(plan.portfolioAudit);
syntheticAudit.status = "PASS";
syntheticAudit.recommendedCandidateId = candidate.candidateId;
syntheticAudit.rankedCandidateIds = [candidate.candidateId];
syntheticAudit.effectiveDirectionCount = Math.max(syntheticAudit.requiredEffectiveDirectionCount || 1, 1);
syntheticAudit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify({...syntheticAudit, auditSha256: undefined, generatedAt: undefined})).digest("hex");
assert.throws(() => applyLookMasterPortfolioAudit(runtime, syntheticAudit, {now: "2026-08-05T00:00:00.000Z"}), /active-assembly-immutable:apply-look-master-portfolio-audit:ED-10/);
assert.equal(immutableSnapshot(runtime), before);
assert.throws(() => reopenPackageLookMasterForDiversity(runtime, {shotId: "ED-10", feedback: "legacy replay", now: "2026-08-05T00:00:00.000Z"}), /active-assembly-immutable:reopen-package-look-master-diversity:ED-10/);
assert.equal(immutableSnapshot(runtime), before);
assert.throws(() => applyFastLookMasterDiscovery(runtime, plan.fastCandidateDiscovery, {now: "2026-08-05T00:00:00.000Z"}), /active-assembly-immutable:apply-fast-look-master-discovery:ED-10/);
assert.equal(immutableSnapshot(runtime), before);
const routeSource = fs.readFileSync("apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts", "utf8");
assert.match(routeSource, /assertCurrentAssemblyMutable\(current\.production\.shotIntelligence, body\.shotId, "route-reopen-package-look-master-diversity"\)/);
assert.match(routeSource, /assertCurrentAssemblyMutable\(current\.production\.shotIntelligence, body\.shotId, "route-admit-package-look-master-candidate"\)/);
console.log(JSON.stringify({status: "PASS", activeFlow: runtime.activePackagingPolicy.lookMasterFlow, runtimeStatus: runtime.status, legacyAdvanceGuard: true, legacyReviewGuard: true, legacyPortfolioGuard: true}, null, 2));
