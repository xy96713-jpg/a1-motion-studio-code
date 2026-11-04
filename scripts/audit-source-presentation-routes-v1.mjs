#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const phaseRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const authorityPath = path.join(phaseRoot, "source-presentation-routes-v1/authority.json");
const reviewPath = path.join(phaseRoot, "continuous-screen-evidence-v2/static-review-v1/manifest.json");
const workspacePath = path.join(phaseRoot, "workspace.json");
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const existsPublic = (url) => typeof url === "string" && url.startsWith("/generated/system-line/") && fs.existsSync(path.join(publicRoot, url.replace(/^\//u, "")));
const failures = [];
const authority = fs.existsSync(authorityPath) ? JSON.parse(fs.readFileSync(authorityPath, "utf8")) : null;
const review = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, "utf8")) : null;
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const expectedShotIds = review?.shotIds || [];
const assetsById = new Map((workspace.library?.assets || []).map((asset) => [asset.id, asset]));
if (!authority) failures.push("route-authority-missing");
if (authority?.contract !== "A1SourcePresentationRouteAuthority/v1") failures.push("route-authority-contract");
if (authority && sha256({...authority, authoritySha256: undefined}) !== authority.authoritySha256) failures.push("route-authority-hash");
for (const route of ["SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE"]) if (!authority?.[route === "SOURCE_WINDOW" ? "sourceWindow" : route === "CROP_ANNOTATION" ? "cropAnnotation" : "sourceCollage"]?.route === route) failures.push(`formal-route-missing:${route}`);
for (const binding of authority?.sourceBindings || []) {
  if (!binding.sourceBound || !binding.current) failures.push(`source-binding-not-current:${binding.assetId}`);
  if (!binding.sha256 || !existsPublic(binding.assetUri)) failures.push(`source-binding-file-or-hash:${binding.assetId}`);
  for (const route of ["SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE"]) if (!(binding.presentationRoutes || []).includes(route)) failures.push(`source-binding-route-missing:${binding.assetId}:${route}`);
  const asset = assetsById.get(binding.assetId);
  if (asset) {
    for (const route of ["SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE"]) {
      if (!(asset.presentationRoutes || []).includes(route)) failures.push(`asset-route-projection-missing:${binding.assetId}:${route}`);
      if (!(asset.sourcePresentationBinding?.presentationRoutes || []).includes(route)) failures.push(`asset-binding-route-missing:${binding.assetId}:${route}`);
    }
  }
  if (binding.sourceClass === "PAPER" && !(binding.sourceUri || binding.cacheUri)) failures.push(`paper-provenance-missing:${binding.assetId}`);
}
if (review?.contract !== "A1ScreenEvidenceStaticReview/v1") failures.push("static-review-contract");
if (review?.status !== "READY_FOR_STATIC_BOARD_REVIEW") failures.push("static-review-status");
if (JSON.stringify(review?.shotIds || []) !== JSON.stringify(expectedShotIds)) failures.push("static-review-shot-set");
if (review?.articleSourceSha256 && review.articleSourceSha256 !== workspace.article?.sourceTextSha256) failures.push("static-review-article-source-hash");
if (review && sha256({...review, manifestSha256: undefined}) !== review.manifestSha256) failures.push("static-review-manifest-hash");
for (const entry of review?.entries || []) {
  if (entry.presentationRoute !== "SOURCE_COLLAGE" || entry.annotationRoute !== "CROP_ANNOTATION" || entry.sourceWindowRoute !== "SOURCE_WINDOW") failures.push(`static-review-route:${entry.shotId}`);
  if (!entry.staticPreview?.sha256 || !existsPublic(entry.staticPreview.publicUrl)) failures.push(`static-review-preview:${entry.shotId}`);
  if (entry.syntheticCursorAdded !== false || entry.sourcePixelsPreserved !== true || entry.productionAdmission !== false) failures.push(`static-review-safety:${entry.shotId}`);
  for (const panel of entry.panels || []) if (panel.route !== "SOURCE_WINDOW" || !panel.sha256 || !existsPublic(panel.publicUrl)) failures.push(`static-review-panel:${entry.shotId}:${panel.state}`);
}
for (const id of expectedShotIds) {
  const shot = workspace.production?.shotVisualCoveragePlan?.shotPlans?.find((item) => item.shotId === id);
  const currentVerifiedScreenSource = shot?.route === "SCREEN_EVIDENCE"
    && shot?.preview?.kind === "VERIFIED_SCREEN_SOURCE"
    && existsPublic(shot.preview.publicUrl);
  const formalSourceProjection = shot?.preview?.presentationRoute === "SOURCE_COLLAGE"
    && shot?.sourcePreview?.publicUrl;
  if (!currentVerifiedScreenSource && !formalSourceProjection) failures.push(`workspace-preview-route:${id}`);
  if (!currentVerifiedScreenSource && !shot?.sourcePreview?.publicUrl) failures.push(`workspace-raw-source-preservation:${id}`);
}
const report = {
  contract: "A1SourcePresentationRouteAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  failures,
  formalRoutes: ["SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE"],
  sourceBindingCount: authority?.sourceBindings?.length || 0,
  screenReviewShotCount: review?.entries?.length || 0,
  userVisualApproval: review?.userVisualApproval || "UNKNOWN",
  productionAdmission: review?.productionAdmission ?? null,
  authoritySha256: authority?.authoritySha256 || null,
  staticReviewManifestSha256: review?.manifestSha256 || null,
  articleSourceSha256: review?.articleSourceSha256 || null,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
