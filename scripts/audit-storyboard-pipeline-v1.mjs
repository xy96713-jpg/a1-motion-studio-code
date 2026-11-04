#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const privateManifestPath = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-pipeline-v1/manifest.json");
const publicManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-pipeline-v1/manifest.json");
const storyboardManifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const webGptImportReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-webgpt-artwork-import-v1/report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

const failures = [];
function check(id, condition, detail) {
  if (!condition) failures.push({id, detail});
}

for (const required of [privateManifestPath, publicManifestPath, storyboardManifestPath]) {
  check("required-file-exists", fs.existsSync(required), rel(required));
}

const manifest = fs.existsSync(privateManifestPath) ? readJson(privateManifestPath) : {};
const publicManifest = fs.existsSync(publicManifestPath) ? readJson(publicManifestPath) : {};
const storyboardManifest = fs.existsSync(storyboardManifestPath) ? readJson(storyboardManifestPath) : {};
const webGptImportReport = fs.existsSync(webGptImportReportPath) ? readJson(webGptImportReportPath) : null;
const storyboardHashMatchesPipeline = storyboardManifest.current?.propsSha256 === manifest.outputs?.activePropsSha256;
const storyboardHasReviewOnlyWebGptImport = webGptImportReport?.contract === "A1StoryboardWebGPTArtworkImport/v1"
  && webGptImportReport?.reviewOnly === true
  && webGptImportReport?.rendererAdoptionAllowed === false
  && webGptImportReport?.fullMp4RenderAllowed === false
  && webGptImportReport?.source?.afterStoryboardPropsSha256 === storyboardManifest.current?.propsSha256;

check("contract", manifest.contract === "A1StoryboardPipelineManifest/v1", manifest.contract);
check("status-pass", manifest.status === "PASS", manifest.status);
check("public-private-parity", JSON.stringify(manifest) === JSON.stringify(publicManifest), "pipeline manifest mismatch");
check("no-full-mp4-render", manifest.policy?.fullMp4Rendered === false, manifest.policy);
check("final-render-locked", manifest.policy?.finalRenderAllowed === false && manifest.policy?.resolveExportAllowed === false, manifest.policy);
check("system-props-not-mutated-by-policy", manifest.policy?.mutatesSystemLineReviewProps === false, manifest.policy);
check("active-props-exists", Boolean(manifest.outputs?.activePropsPath) && fs.existsSync(path.join(root, manifest.outputs.activePropsPath)), manifest.outputs?.activePropsPath);

if (manifest.outputs?.activePropsPath && fs.existsSync(path.join(root, manifest.outputs.activePropsPath))) {
  const activePropsPath = path.join(root, manifest.outputs.activePropsPath);
  check("active-props-hash", manifest.outputs.activePropsSha256 === sha256File(activePropsPath), manifest.outputs);
}

check("storyboard-published", storyboardManifest.contract === "A1StoryboardDraftManifest/v1" && storyboardManifest.status === "review-only-isolated-draft", storyboardManifest.status);
check("storyboard-hash-matches-active-or-review-only-webgpt-import", storyboardHashMatchesPipeline || storyboardHasReviewOnlyWebGptImport, {
  storyboard: storyboardManifest.current?.propsSha256,
  pipeline: manifest.outputs?.activePropsSha256,
  webGptImport: webGptImportReport?.source?.afterStoryboardPropsSha256 || null,
});
check("stills-pass", manifest.stages?.stills?.status === "PASS" && manifest.stages?.stills?.outputs?.missingCount === 0, manifest.stages?.stills?.outputs);
check("publish-pass", manifest.stages?.publish?.status === "PASS" && Number(manifest.stages?.publish?.outputs?.sceneCount || 0) > 0, manifest.stages?.publish?.outputs);
check("quality-pass", manifest.stages?.quality?.status === "PASS" && ["PASS", "PASS_WITH_REVIEW_RISKS"].includes(manifest.stages?.quality?.outputs?.status), manifest.stages?.quality?.outputs);
check("gates-pass", manifest.stages?.gates?.status === "PASS", manifest.stages?.gates?.status);
check("next-action", manifest.nextAction === "open-4311-storyboard-for-human-review", manifest.nextAction);

const report = {
  contract: "A1StoryboardPipelineAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  checkedAt: new Date().toISOString(),
  failures,
  pipeline: {
    manifestPath: rel(privateManifestPath),
    publicManifestPath: rel(publicManifestPath),
    activePropsPath: manifest.outputs?.activePropsPath || null,
    activePropsSha256: manifest.outputs?.activePropsSha256 || null,
    stage: manifest.stage || null,
    nextAction: manifest.nextAction || null,
    reviewOnlyWebGptImport: storyboardHasReviewOnlyWebGptImport,
  },
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 2;
