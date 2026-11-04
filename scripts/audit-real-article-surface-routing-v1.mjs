#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const reportPath = path.join(root, "remotion-renderer/public/editorial-documentary-reset-v1/source/report.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const failures = [];
const article = workspace.library?.assets?.find((asset) => asset.id === "source-documentary-document-surface");
if (!article) failures.push("article-surface-asset-missing");
const expectedPublicRelative = "generated/system-line/editorial-asset-workbench-v1/source-cache/document-surface.png";
const actualPublicRelative = String(article?.assetUri || "").replace(/^\/+/, "");
if (actualPublicRelative !== expectedPublicRelative) failures.push("article-surface-not-routed-to-real-document-surface");
if (String(article?.assetUri || "").includes("real-writing-workbench-main")) failures.push("article-surface-regressed-to-workbench-overview");
if (article?.provenance?.sourceType !== "real-local-writing-workbench") failures.push("article-surface-provenance-not-real-capture");
if (!article?.provenance?.captureReport) failures.push("article-surface-capture-report-missing");
const capture = report.captures?.find((item) => item.id === "document-surface");
if (!capture) failures.push("document-surface-capture-report-entry-missing");
const appPath = path.join(root, "apps/studio-next/public", actualPublicRelative);
const remotionPath = path.join(root, "remotion-renderer/public", actualPublicRelative);
for (const [label, filePath] of [["app", appPath], ["remotion", remotionPath]]) {
  if (!fs.existsSync(filePath)) failures.push(`${label}-article-surface-file-missing`);
}
const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
if (capture && fs.existsSync(appPath) && sha256(appPath) !== capture.sha256) failures.push("app-article-surface-hash-mismatch");
if (fs.existsSync(appPath) && fs.existsSync(remotionPath) && sha256(appPath) !== sha256(remotionPath)) failures.push("app-remotion-article-surface-hash-drift");
const reportOut = {
  contract: "A1RealArticleSurfaceRoutingAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  failures,
  assetId: "source-documentary-document-surface",
  articleSurfaceSha256: fs.existsSync(appPath) ? sha256(appPath) : null,
  captureReportSha256: capture?.sha256 || null,
  appPublicUrl: article?.assetUri || null,
  remotionMirrorPresent: fs.existsSync(remotionPath),
  dependentShotIds: article?.usedByShotIds || [],
};
console.log(JSON.stringify(reportOut, null, 2));
if (failures.length) process.exitCode = 1;
