import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const appRoot = path.join(root, "apps/studio-next");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const configPath = path.join(root, "configs/operations/record-v8-canary-review-evidence-v1.json");
const operationConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (operationConfig.contract !== "A1OperationVariantConfig/v1" || operationConfig.status !== "ACTIVE" || operationConfig.operationFamily !== "record-v8-canary-review-evidence") {
  throw new Error("record-v8-canary-review-evidence-operation-config-invalid");
}
export const V8_CANARY_REVIEW_CONFIGS = Object.freeze(operationConfig.variants);
if (!V8_CANARY_REVIEW_CONFIGS || Object.keys(V8_CANARY_REVIEW_CONFIGS).length !== 3) {
  throw new Error("record-v8-canary-review-evidence-operation-variants-invalid");
}

export function buildV8CanaryReviewEvidence(revision) {
  const config = V8_CANARY_REVIEW_CONFIGS[revision];
  if (!config) throw new Error(`v8-canary-review-evidence-revision-unsupported:${revision}`);
  const reportPath = `.codex-artifacts/system-progress-system-line/independent-package-visual-proof-v1/static-package-review-v8-canary-v${config.reportRevision}/report.json`;
  const reportFile = path.join(root, reportPath);
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  const reportSha256 = sha256File(reportFile);
  const manifestFile = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/v8-visual-canary-candidates-v2/manifest.json");
  const manifestSha256 = config.includeManifest ? sha256File(manifestFile) : null;
  const status = config.statusFromVerdict && report.verdict === "VISUAL_REJECTED" ? "VISUAL_REJECTED" : "READY_FOR_ACTUAL_PIXEL_REVIEW";
  const evidenceCore = {
    version: `static-package-review-v8-canary-v${config.versionRevision}`,
    status,
    ...(config.includeManifest ? {manifestSha256} : {}),
    reportPath,
    reportSha256,
    contactSheetPath: report.contactSheet?.path || null,
    contactSheetSha256: report.contactSheet?.sha256 || null,
    failedGateIds: config.statusFromVerdict ? report.hardGates?.filter((item) => item.status === "FAIL").map((item) => item.id) || [] : [],
    unverifiedGateIds: config.statusFromVerdict ? report.hardGates?.filter((item) => item.status === "UNVERIFIED").map((item) => item.id) || [] : [],
    productionAdmitted: false,
    userVisualApproval: "NOT_APPROVED",
  };
  const workspaceEvidence = config.contractRevision === 1 ? evidenceCore : {contract: `A1V8CanaryReviewEvidence/v${config.contractRevision}`, ...evidenceCore};
  const fileEvidence = config.contractRevision === 1
    ? {contract: "A1V8CanaryReviewEvidence/v1", status, reportPath, reportSha256, productionAdmitted: false, userVisualApproval: "NOT_APPROVED"}
    : workspaceEvidence;
  return {config, workspaceEvidence, fileEvidence, reportSha256, manifestSha256};
}

export function runRecordV8CanaryReviewEvidence(revision) {
  const dryRun = process.argv.includes("--dry-run");
  const now = process.env.A1_FIXED_NOW || new Date().toISOString();
  const plan = buildV8CanaryReviewEvidence(revision);
  const result = withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const next = structuredClone(current);
    const v8Canary = revision === 1 ? {...next.production.staticPackageReview?.v8Canary, ...plan.workspaceEvidence} : plan.workspaceEvidence;
    next.production.staticPackageReview = {...next.production.staticPackageReview, v8Canary, status: "VISUAL_REPAIR_REQUIRED", current: true};
    next.production.productionWired = false;
    next.production.aeLevelProven = false;
    const event = createProductionEvent({workspace: current, action: plan.config.action, targetId: plan.config.targetId, payload: {reportSha256: plan.reportSha256, ...(plan.manifestSha256 ? {manifestSha256: plan.manifestSha256} : {}), status: v8Canary.status, productionAdmitted: false, resolveProjectMutationPerformed: false}, now});
    const recalculated = recalculateEditorialAssetWorkbench(next, now);
    if (dryRun) return {workspaceSha256: recalculated.workspaceSha256, transitionSha256: null};
    return persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `${plan.config.action}-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[plan.config.output]: plan.fileEvidence}});
  });
  const output = {status: dryRun ? "DRY_RUN_PASS" : "EVIDENCE_POINTER_RECORDED", reportSha256: plan.reportSha256, ...(plan.manifestSha256 ? {manifestSha256: plan.manifestSha256} : {}), workspaceSha256: result.workspaceSha256, transitionSha256: result.transitionSha256, productionAdmitted: false, resolveProjectMutationPerformed: false};
  console.log(JSON.stringify(output, null, 2));
  return output;
}
