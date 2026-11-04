#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);

function argValue(name, fallback = "") {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] || fallback;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rel(filePath) {
  return path.relative(root, filePath);
}

const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererSourcePropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const approvalPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-approval.json");

for (const required of [manifestPath, storyboardPropsPath, rendererSourcePropsPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${rel(required)}`);
}

const manifest = readJson(manifestPath);
const storyboardProps = readJson(storyboardPropsPath);
const rendererSourceRaw = fs.readFileSync(rendererSourcePropsPath, "utf8");
const rendererSourceProps = JSON.parse(rendererSourceRaw);
const storyboardPropsSha256 = sha256File(storyboardPropsPath);
const rendererSourcePropsSha256 = sha256Text(rendererSourceRaw);
const storyboardScenes = Array.isArray(storyboardProps.scenes) ? storyboardProps.scenes : [];
const rendererScenes = Array.isArray(rendererSourceProps.scenes) ? rendererSourceProps.scenes : [];

const failures = [];
if (manifest.contract !== "A1StoryboardDraftManifest/v1") failures.push("storyboard-manifest-contract");
if (manifest.status !== "review-only-isolated-draft") failures.push("storyboard-manifest-status");
if (manifest.current?.propsSha256 !== storyboardPropsSha256) failures.push("storyboard-props-sha-mismatch");
if (manifest.source?.sha256 !== rendererSourcePropsSha256) failures.push("storyboard-source-not-current-renderer-props");
if (storyboardScenes.length === 0 || storyboardScenes.length !== rendererScenes.length) failures.push("storyboard-renderer-scene-count-mismatch");
if (manifest.assets?.missingStillCount !== 0 || manifest.assets?.stillCount < storyboardScenes.length) failures.push("storyboard-stills-not-complete");

if (failures.length) {
  console.error(JSON.stringify({
    ok: false,
    failures,
    storyboardScenes: storyboardScenes.length,
    rendererScenes: rendererScenes.length,
    manifestSourceSha256: manifest.source?.sha256 || null,
    rendererSourcePropsSha256,
    stillCount: manifest.assets?.stillCount ?? null,
    missingStillCount: manifest.assets?.missingStillCount ?? null,
  }, null, 2));
  process.exit(2);
}

const approval = {
  contract: "A1StoryboardApproval/v1",
  status: "APPROVED_FOR_540P_REVIEW_RENDER",
  approvalScope: "refresh-next-540p-review-mp4-only",
  approvedAt: new Date().toISOString(),
  approvedBy: "user-confirmed-in-storyboard",
  note: argValue("--note", "User approved the current /storyboard draft for one 540p review MP4 refresh."),
  storyboardManifestPath: rel(manifestPath),
  storyboardPropsPath: rel(storyboardPropsPath),
  storyboardPropsSha256,
  rendererSourcePropsPath: rel(rendererSourcePropsPath),
  rendererSourcePropsSha256,
  sceneCount: storyboardScenes.length,
  stillCount: manifest.assets?.stillCount ?? null,
  missingStillCount: manifest.assets?.missingStillCount ?? null,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
};

fs.writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  approvalPath: rel(approvalPath),
  status: approval.status,
  approvalScope: approval.approvalScope,
  storyboardPropsSha256,
  rendererSourcePropsSha256,
  sceneCount: approval.sceneCount,
}, null, 2));
