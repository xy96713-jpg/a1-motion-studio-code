#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  classifyPackageProvenance,
  isPackageProvenanceProductionReady,
  packageProvenanceSummary,
} from "../apps/studio-next/src/lib/a1-package-provenance-v1.mjs";
import {completeOperatorImportProvenance} from "../apps/studio-next/src/lib/a1-package-provenance-server-v1.mjs";

const repoRoot = process.cwd();
const workspacePath = path.join(repoRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const kit = workspace.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const binding = kit.selectedLookMasterBinding;
assert.equal(kit.current, false, "the historical ED-10 kit must not be promoted into current Assembly provenance");
const workerBinding = {
  ...binding,
  provenanceMode: "SYSTEM_GENERATED",
  provenanceStatus: "COMPLETE",
  traceabilityStatus: "COMPLETE",
  generationId: "worker-exec",
  generationJobId: "worker-job",
  generationInputHash: binding.generationInputHash || "worker-input",
  provenance: {...(binding.provenance || {}), operatorImported: false},
};

assert.equal(classifyPackageProvenance(workerBinding), "SYSTEM_GENERATED");
assert.equal(isPackageProvenanceProductionReady(workerBinding), true);
assert.ok(workerBinding.generationId, "system imagegen binding must retain its upstream generation id");
assert.ok(workerBinding.generationJobId, "system imagegen binding must retain its completed worker job id");
assert.equal(packageProvenanceSummary(workerBinding).generationPath, "worker-imagegen-job");
assert.equal(packageProvenanceSummary(workerBinding).imagegenPerformedByImport, false);
assert.equal(packageProvenanceSummary({}).imagegenPerformedByImport, null);
assert.equal(packageProvenanceSummary({generationId: "worker-exec", provenance: {operatorImported: false}}).imagegenPerformedByImport, false);

const blocked = completeOperatorImportProvenance(workspace, {shotId: "ED-10", now: "2026-08-05T00:00:00.000Z"});
const blockedBinding = blocked.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10").selectedLookMasterBinding;
assert.equal(blockedBinding.provenanceMode, "OPERATOR_IMPORTED");
assert.equal(blockedBinding.provenanceTraceReview.status, "BLOCKED_UPSTREAM_UNAVAILABLE");
assert.equal(blockedBinding.generationId, null);
assert.equal(blocked.production.packagingProvenance.productionReady, false);

const forged = {
  contract: "A1OperatorImportExecutionReceipt/v1",
  jobId: "forged-job",
  upstreamExecutionId: "forged-upstream-id",
  artifactSha256: binding.artifactSha256,
  generationInputHash: binding.generationInputHash,
  receiptSha256: "client-self-signed",
};
assert.throws(
  () => completeOperatorImportProvenance(workspace, {shotId: "ED-10", upstreamExecutionId: forged.upstreamExecutionId, operatorReceipt: forged}),
  /package-provenance-upstream-job-not-found/u,
  "a client-signed receipt cannot create a production provenance trace",
);

assert.equal(isPackageProvenanceProductionReady({provenanceStatus: "COMPLETE", traceabilityStatus: "COMPLETE", generationId: null, provenance: {operatorImported: true}}), false, "COMPLETE without generationId remains blocked");
assert.equal(isPackageProvenanceProductionReady({provenanceStatus: "COMPLETE", traceabilityStatus: "INCOMPLETE_REVIEW", generationId: "upstream", provenance: {operatorImported: true}}), false, "incomplete traceability remains blocked");

const panelSource = fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/system-line-visual-workbench/ShotIntelligencePanel.tsx"), "utf8");
const routeSource = fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8");
assert.match(panelSource, /OPERATOR_IMPORTED/);
assert.match(panelSource, /SYSTEM_GENERATED/);
assert.match(panelSource, /isPackageProvenanceProductionReady/);
assert.match(routeSource, /complete-package-provenance-trace/);
assert.match(routeSource, /completeOperatorImportProvenance/);
assert.match(routeSource, /selectedMasterImagegenPerformedByImport/);

console.log(JSON.stringify({
  status: "PASS",
  workspaceSha256: workspace.workspaceSha256,
  selectedDirectionId: binding.directionId,
  provenanceMode: classifyPackageProvenance(binding),
  productionReady: isPackageProvenanceProductionReady(binding),
  generationJobId: binding.generationJobId,
  generationId: binding.generationId,
  operatorImportFallbackStillBlockedWithoutUpstreamId: blockedBinding.provenanceTraceReview.status,
  forgedReceipt: "REJECTED_SERVER_OWNERSHIP_REQUIRED",
}, null, 2));
