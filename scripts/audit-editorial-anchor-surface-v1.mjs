#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const appPublicRoot = path.join(appRoot, "public");
const remotionPublicRoot = path.join(root, "remotion-renderer/public");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const publicFile = (rootDir, uri) => path.join(rootDir, String(uri || "").replace(/^\/+/, ""));
const failures = [];
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const assets = workspace.library.assets;
const anchors = assets.filter((asset) => asset.anchorSurface?.contract === "A1EditorialAnchorSurfaceBinding/v1");
if (anchors.length < 3) failures.push(`anchor-count:${anchors.length}`);
for (const asset of anchors) {
  if (asset.route !== "editorial-artwork") failures.push(`${asset.id}:route`);
  if (asset.creativeInputOnly !== true || asset.evidenceUseAllowed !== false) failures.push(`${asset.id}:evidence-policy`);
  if (asset.anchorSurface.textFree !== true || asset.anchorSurface.realSourceRemainsAuthoritative !== true || asset.anchorSurface.editableTextRemainsAuthoritative !== true) failures.push(`${asset.id}:binding-policy`);
  if (!asset.assetUri || !fs.existsSync(publicFile(appPublicRoot, asset.assetUri))) failures.push(`${asset.id}:app-missing`);
  if (!asset.assetUri || !fs.existsSync(publicFile(remotionPublicRoot, asset.assetUri))) failures.push(`${asset.id}:remotion-missing`);
  if (asset.assetUri && fs.existsSync(publicFile(appPublicRoot, asset.assetUri))) {
    const appSha = sha256File(publicFile(appPublicRoot, asset.assetUri));
    if (appSha !== asset.sha256) failures.push(`${asset.id}:app-sha`);
    const remotionSha = sha256File(publicFile(remotionPublicRoot, asset.assetUri));
    if (remotionSha !== asset.sha256) failures.push(`${asset.id}:remotion-sha`);
  }
  if (!Array.isArray(asset.usedByShotIds) || !asset.usedByShotIds.length) failures.push(`${asset.id}:no-shot-binding`);
}
const compositions = assets.filter((asset) => asset.route === "shot-composition");
let boundCandidateCount = 0;
for (const composition of compositions) {
  for (const candidate of composition.candidates || []) {
    const nodes = candidate.sceneGraph?.nodes || [];
    for (const node of nodes.filter((item) => item.type === "editorial-anchor-surface")) {
      boundCandidateCount += 1;
      const asset = assets.find((item) => item.id === node.assetId);
      if (!asset || !asset.anchorSurface || asset.creativeInputOnly !== true || asset.evidenceUseAllowed !== false) failures.push(`${composition.shotDemand?.shotId}:${candidate.candidateId}:node-policy`);
      if (!asset?.usedByShotIds?.includes(composition.shotDemand?.shotId)) failures.push(`${composition.shotDemand?.shotId}:${candidate.candidateId}:unbound-shot`);
      const g = node.geometry || {};
      for (const key of ["x", "y", "width", "height"]) if (!Number.isFinite(Number(g[key])) || Number(g[key]) < 0 || Number(g[key]) > 1) failures.push(`${composition.shotDemand?.shotId}:${candidate.candidateId}:geometry-${key}`);
      if (node.role === composition.shotDemand?.primaryActor) failures.push(`${composition.shotDemand?.shotId}:${candidate.candidateId}:anchor-replaces-primary`);
    }
  }
}
const report = {
  contract: "A1EditorialAnchorSurfaceAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  failures,
  anchorCount: anchors.length,
  boundCandidateCount,
  anchors: anchors.map((asset) => ({id: asset.id, sceneFamily: asset.anchorSurface.sceneFamily, role: asset.anchorSurface.role, usedByShotIds: asset.usedByShotIds, sha256: asset.sha256})),
  gates: {acceptedShotIrAdoptionAllowed: false, representativeMotionPromotionAllowed: false, fullFilmAllowed: false, h47ExpansionAllowed: false},
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
