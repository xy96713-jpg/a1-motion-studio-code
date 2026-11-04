#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {resolveCurrentStoryboardAsset} from "../apps/studio-next/src/lib/a1-current-storyboard-asset-resolver-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const publicRoot = path.join(root, "apps/studio-next/public");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const value = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const shotId = value("--shot");
if (!shotId) {
  console.error("usage: npm run resolve:current-storyboard-asset -- --shot ED-14 [--expected-version VERSION] [--expected-sha SHA] [--require-production] [--require-external-generation]");
  process.exit(2);
}

const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
try {
  const binding = resolveCurrentStoryboardAsset(workspace, {
    shotId,
    expectedWorkspaceSha256: value("--expected-workspace-sha"),
    expectedStoryboardRevisionSha256: value("--expected-storyboard-revision"),
    expectedVersionId: value("--expected-version"),
    expectedArtifactSha256: value("--expected-sha"),
    expectedArtifactPublicUrl: value("--expected-url"),
  });
  const relative = binding.artifactPublicUrl.replace(/^\/generated\/system-line\/editorial-asset-workbench-v1\//u, "");
  const publicPath = path.join(publicRoot, binding.artifactPublicUrl.replace(/^\//u, ""));
  const artifactPath = path.join(artifactRoot, relative);
  const failures = [];
  if (!fs.existsSync(publicPath)) failures.push("PUBLIC_FILE_MISSING");
  if (!fs.existsSync(artifactPath)) failures.push("ARTIFACT_MIRROR_MISSING");
  let actualSha256 = null;
  let decode = null;
  if (fs.existsSync(publicPath)) {
    actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(publicPath)).digest("hex");
    if (actualSha256 !== binding.artifactSha256) failures.push("PUBLIC_FILE_SHA_MISMATCH");
    try {
      const metadata = await sharp(publicPath).metadata();
      decode = {status: "PASS", format: metadata.format, width: metadata.width, height: metadata.height};
    } catch (error) {
      decode = {status: "BLOCKED", error: error.message};
      failures.push("PUBLIC_FILE_DECODE_FAILED");
    }
  }
  if (fs.existsSync(artifactPath)) {
    const mirrorSha256 = crypto.createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex");
    if (mirrorSha256 !== binding.artifactSha256) failures.push("ARTIFACT_MIRROR_SHA_MISMATCH");
  }
  const result = {...binding, verification: {status: failures.length ? "BLOCKED" : "PASS", failures, publicPath, artifactPath, actualSha256, decode}};
  if (process.argv.includes("--require-production") && !binding.productionEligible) failures.push("CURRENT_STORYBOARD_PRODUCTION_BINDING_REQUIRED");
  if (process.argv.includes("--require-external-generation") && !binding.externalGenerationEligible) failures.push("CURRENT_STORYBOARD_EXTERNAL_GENERATION_BINDING_REQUIRED");
  result.verification.status = failures.length ? "BLOCKED" : "PASS";
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({contract: "A1CurrentStoryboardAssetBinding/v1", status: "BLOCKED", shotId, failure: error.code || error.message, detail: error.detail || null}, null, 2));
  process.exitCode = 1;
}
