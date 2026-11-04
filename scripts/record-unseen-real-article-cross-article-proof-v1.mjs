#!/usr/bin/env node

import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sourcePath = process.env.A1_UNSEEN_ARTICLE_PATH || "/Users/a1/Documents/Codex/声音/docs/FULL_PREVIEW_READINESS.md";
const sourceSha256 = createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
const proofDir = path.join(root, ".codex-artifacts/system-progress-system-line/unseen-real-article-e2e-v1", sourceSha256.slice(0, 16));
const reportPath = path.join(proofDir, "report.json");
const reviewPath = path.join(proofDir, "direct-visual-review.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
if (report.contract !== "A1UnseenRealArticleE2E/v1" || report.status !== "FULL_E2E_PASS") throw new Error("full-unseen-article-proof-required");
if (review.contract !== "A1UnseenRealArticleDirectVisualReview/v1" || review.status !== "DIRECT_VISUAL_REVIEW_PASS") throw new Error("direct-visual-review-required");

const proofSha256 = createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex");
const qualificationRoute = report.route || (report.compilation?.route === "a1-codex-director" ? "A1VisualDirectorProject/v1" : "A1ArticleTemplateCompiler/v1");
const now = new Date().toISOString();
const nextWorkspace = withProjectLock(appRoot, () => {
  const workspace = readProjectWorkspace(appRoot);
  const next = structuredClone(workspace);
  next.production.release.crossArticleProof = {
    contract: "A1CrossArticleVisualProof/v1",
    status: "pass",
    pipeline: {
      contract: "A1CrossArticlePipelineQualification/v1",
      route: qualificationRoute,
      requiredRoute: "A1VisualDirectorProject/v1",
      qualifiesForMaturity: qualificationRoute === "A1VisualDirectorProject/v1",
      reason: qualificationRoute === "A1VisualDirectorProject/v1"
        ? "same-current-4311-visual-director-route"
        : "legacy-template-compiler-proof-retained-as-engineering-evidence-only",
    },
    projectId: `unseen-real-${sourceSha256.slice(0, 12)}`,
    sourcePath,
    sourceSha256,
    reportSha256: proofSha256,
    reportPublicUrl: `/generated/system-line/unseen-real-article-e2e-v1/${sourceSha256.slice(0, 16)}/report.json`,
    directVisualReviewPublicUrl: `/generated/system-line/unseen-real-article-e2e-v1/${sourceSha256.slice(0, 16)}/direct-visual-review.json`,
    mediaPublicUrl: report.render?.media?.publicUrl || null,
    contactSheetPublicUrl: report.contactSheet?.publicUrl || null,
    verifiedAt: now,
  };
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {
    event: {
      contract: "A1ProductionEvent/v1",
      eventId: `cross-article-proof-${sourceSha256.slice(0, 12)}-${Date.now()}`,
      type: "cross-article-proof-recorded",
      actor: "system",
      createdAt: now,
      sourceSha256,
      reportSha256: proofSha256,
      workspaceSha256: recalculated.workspaceSha256,
    },
  });
  return recalculated;
});

console.log(JSON.stringify({
  status: nextWorkspace.production.release.crossArticleProof.status,
  projectId: nextWorkspace.production.release.crossArticleProof.projectId,
  reportSha256: proofSha256,
  maturityStatus: nextWorkspace.production.release.maturityStatus,
  nextAction: nextWorkspace.production.authority.nextAction.id,
}, null, 2));
