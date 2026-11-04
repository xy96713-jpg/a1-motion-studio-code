#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const root = path.resolve(import.meta.dirname, "../..");
const appRoot = path.join(root, "apps/studio-next");

const configPath = path.join(root, "configs/operations/record-static-review-v1.json");
const operationConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (operationConfig.contract !== "A1OperationVariantConfig/v1" || operationConfig.status !== "ACTIVE" || operationConfig.operationFamily !== "record-static-review") {
  throw new Error("record-static-review-operation-config-invalid");
}
export const STATIC_REVIEW_CONFIGS = Object.freeze(operationConfig.variants);
if (!STATIC_REVIEW_CONFIGS || Object.keys(STATIC_REVIEW_CONFIGS).length !== 6) {
  throw new Error("record-static-review-operation-variants-invalid");
}

function configFor(reviewId) {
  const config = STATIC_REVIEW_CONFIGS[reviewId];
  if (!config) throw new Error(`unknown-static-review-id:${reviewId}`);
  return config;
}

function reviewHistory(current) {
  const previous = current.production.staticPackageReview;
  return [
    ...(Array.isArray(previous?.history) ? previous.history : []),
    ...(previous ? [previous] : []),
  ];
}

export function buildStaticReviewRecord({reviewId, current, reviewedAt, createEvent = createProductionEvent}) {
  const config = configFor(reviewId);
  const body = {...config.body, reviewedAt};
  const report = {...body, auditSha256: sha(body)};
  const event = createEvent({
    workspace: current,
    action: config.action,
    targetId: config.targetId,
    payload: {auditSha256: report.auditSha256, status: report.status},
  });
  const next = structuredClone(current);
  const review = {...report, current: false};
  if (config.successor) review.successor = config.successor;
  if (config.includeHistory) review.history = reviewHistory(current);
  next.production.staticPackageReview = review;
  const timestamp = reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14);
  return {
    config,
    report,
    event,
    next,
    persistOptions: {
      event,
      expectedWorkspaceSha256: current.workspaceSha256,
      commitId: `${config.commitPrefix}-${timestamp}`,
      files: {[config.reportPath]: report},
    },
  };
}

export function formatStaticReviewOutput(saved, report, config) {
  const output = {
    status: report.status,
    auditSha256: report.auditSha256,
    workspaceSha256: saved.workspaceSha256,
    transitionSha256: saved.transitionSha256,
    mediaGenerationPerformed: false,
  };
  if (config.includeAuthorizationReceiptIssued) output.authorizationReceiptIssued = false;
  return output;
}

export function recordStaticReview(reviewId, reviewedAt = new Date().toISOString()) {
  return withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const record = buildStaticReviewRecord({reviewId, current, reviewedAt});
    const saved = persistProjectState(
      appRoot,
      recalculateEditorialAssetWorkbench(record.next, reviewedAt),
      record.persistOptions,
    );
    return {saved, ...record};
  });
}

function cliValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

export async function runStaticReviewCli(defaultReviewId) {
  const reviewId = cliValue("review-id") || defaultReviewId;
  const reviewedAt = cliValue("at") || new Date().toISOString();
  if (process.argv.includes("--dry-run")) {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const record = buildStaticReviewRecord({reviewId, current, reviewedAt});
    console.log(JSON.stringify({status: "DRY_RUN", reviewId, report: record.report, commitId: record.persistOptions.commitId, reportPath: Object.keys(record.persistOptions.files)[0]}, null, 2));
    return;
  }
  const result = recordStaticReview(reviewId, reviewedAt);
  console.log(JSON.stringify(formatStaticReviewOutput(result.saved, result.report, result.config), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await runStaticReviewCli(cliValue("review-id"));
}
