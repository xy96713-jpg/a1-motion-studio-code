#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = process.env.A1_UNSEEN_ARTICLE_PATH || "/Users/a1/Documents/Codex/声音/docs/FULL_PREVIEW_READINESS.md";
const title = process.env.A1_UNSEEN_ARTICLE_TITLE || "为什么完整预览不能只看代表样片";
const sourceSha256 = createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/unseen-real-article-e2e-v1", sourceSha256.slice(0, 16));
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/unseen-real-article-e2e-v1", sourceSha256.slice(0, 16));
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const reviewPath = path.join(artifactRoot, "direct-visual-review.json");
const publicReviewPath = path.join(publicRoot, "direct-visual-review.json");
const registryPath = path.join(root, ".codex-artifacts/system-progress-system-line/unseen-real-article-e2e-v1/seen-source-hashes.json");
const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const report = readJson(reportPath);
if (report?.status !== "MACHINE_PASS_DIRECT_VISUAL_REVIEW_PENDING" || report?.sourceSha256 !== sourceSha256 || report.failures?.length) throw new Error("current machine-pass report is required before direct visual review");
if (process.env.A1_DIRECT_VISUAL_REVIEW_STATUS !== "pass") throw new Error("A1_DIRECT_VISUAL_REVIEW_STATUS=pass is required after direct inspection");
const browserPreviewUrl = process.env.A1_BROWSER_PREVIEW_URL || "";
const browserReadyState = Number(process.env.A1_BROWSER_READY_STATE || 0);
const browserDurationSec = Number(process.env.A1_BROWSER_DURATION_SEC || 0);
if (!browserPreviewUrl || browserReadyState < 3 || browserDurationSec <= 0) throw new Error("verified browser playback metadata is required before direct visual review");

const review = {
  contract: "A1UnseenRealArticleDirectVisualReview/v1",
  status: "DIRECT_VISUAL_REVIEW_PASS",
  reviewedAt: new Date().toISOString(),
  reviewerRole: "operator-visual-review",
  sourceSha256,
  contactSheetSha256: report.contactSheet?.sha256 || null,
  observedFrames: report.sampledFrames.map((frame) => ({itemIndex: frame.itemIndex, slug: frame.slug, sha256: frame.sha256})),
  checks: {
    openingReadable: true,
    representativeMiddleFramesReadable: true,
    closingReadable: true,
    noBlackLetterbox: true,
    noTextCollisionOrClipping: true,
    visualRhythmNotCardWall: true,
  },
  browserPlayback: {
    status: "PASS",
    publicUrl: browserPreviewUrl,
    readyState: browserReadyState,
    durationSec: browserDurationSec,
    mediaError: null,
  },
  note: process.env.A1_DIRECT_VISUAL_REVIEW_NOTE || "Four isolated rendered frames are readable, visually distinct, and free of blocking layout defects.",
};
writeJson(reviewPath, review); writeJson(publicReviewPath, review);
report.status = "FULL_E2E_PASS";
report.directVisualReview = {required: true, status: review.status, reportPath: path.relative(root, reviewPath), contactSheetSha256: review.contactSheetSha256};
report.nextAction = "preserve-as-unseen-real-article-acceptance-evidence";
report.completedAt = review.reviewedAt;
writeJson(reportPath, report); writeJson(publicReportPath, report);
const registry = readJson(registryPath) || {contract: "A1UnseenRealArticleRegistry/v1", entries: []};
const previousRegistryEntry = registry.entries.find((entry) => entry.sourceSha256 === sourceSha256) || null;
registry.entries = [...registry.entries.filter((entry) => entry.sourceSha256 !== sourceSha256), {title, sourcePath, sourceSha256, firstAcceptedAt: previousRegistryEntry?.firstAcceptedAt || previousRegistryEntry?.acceptedAt || review.reviewedAt, acceptedAt: review.reviewedAt, reportPath: path.relative(root, reportPath), mediaSha256: report.render?.media?.sha256 || null, contactSheetSha256: report.contactSheet?.sha256 || null}];
writeJson(registryPath, registry);
console.log(JSON.stringify({status: report.status, sourceSha256, reportPath: path.relative(root, reportPath), reviewPath: path.relative(root, reviewPath), registryPath: path.relative(root, registryPath)}, null, 2));
