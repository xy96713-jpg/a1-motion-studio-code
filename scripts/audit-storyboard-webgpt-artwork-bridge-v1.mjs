#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const bridgePrivate = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-webgpt-artwork-bridge-v1/manifest.json");
const bridgePublic = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-webgpt-artwork-bridge-v1/manifest.json");
const importPrivate = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-webgpt-artwork-import-v1/report.json");
const importPublic = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-webgpt-artwork-import-v1/report.json");
const storyboardProps = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const storyboardManifest = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rel(filePath) {
  return path.relative(root, filePath);
}

const failures = [];
const warnings = [];
function check(id, condition, detail) {
  if (!condition) failures.push({id, detail});
}
function warn(id, detail) {
  warnings.push({id, detail});
}

for (const file of [bridgePrivate, bridgePublic, storyboardProps, storyboardManifest]) {
  check("required-file-exists", fs.existsSync(file), rel(file));
}

const bridge = fs.existsSync(bridgePrivate) ? readJson(bridgePrivate) : {};
const bridgePub = fs.existsSync(bridgePublic) ? readJson(bridgePublic) : {};
check("bridge-contract", bridge.contract === "A1StoryboardWebGPTArtworkBridge/v1", bridge.contract);
check("bridge-ready", ["READY_FOR_WEB_GPT_GENERATION", "READY_FOR_ARTWORK_GENERATION"].includes(bridge.status), bridge.status);
check("bridge-public-parity", fs.existsSync(bridgePrivate) && fs.existsSync(bridgePublic) && sha256(bridgePrivate) === sha256(bridgePublic), "bridge private/public mismatch");
check("bridge-policy", bridge.policy?.noPaidImageApi === true && bridge.policy?.noAppleScriptBrowserControl === true && bridge.rendererAdoptionAllowed === false && bridge.fullMp4RenderAllowed === false, bridge.policy);
check("bridge-jobs", Array.isArray(bridge.jobs) && bridge.jobs.length > 0 && bridge.summary?.uniqueExpectedFileNames === true, bridge.summary);

let importReport = null;
if (fs.existsSync(importPrivate) || fs.existsSync(importPublic)) {
  check("import-report-parity", fs.existsSync(importPrivate) && fs.existsSync(importPublic) && sha256(importPrivate) === sha256(importPublic), "import private/public mismatch");
  importReport = fs.existsSync(importPrivate) ? readJson(importPrivate) : {};
  check("import-contract", importReport.contract === "A1StoryboardWebGPTArtworkImport/v1", importReport.contract);
  check("import-review-lock", importReport.rendererAdoptionAllowed === false && importReport.fullMp4RenderAllowed === false && importReport.finalRenderAllowed === false && importReport.resolveExportAllowed === false, importReport);
}

if (importReport?.summary?.importedCount > 0) {
  const props = readJson(storyboardProps);
  const manifest = readJson(storyboardManifest);
  const pendingScenes = (props.scenes || []).filter((scene) => scene.storyboard?.artworkStatus === "pending-visual-review" && scene.storyboard?.artworkFile);
  const currentStoryboardSha = sha256(storyboardProps);
  const importStoryboardSha = importReport.source?.afterStoryboardPropsSha256 || importReport.source?.storyboardPropsSha256 || null;
  if (importStoryboardSha && importStoryboardSha !== currentStoryboardSha) {
    warn("stale-import-report-for-previous-storyboard-hash", {currentStoryboardSha, importStoryboardSha, imported: importReport.summary.importedCount});
  } else {
    check("imported-scenes-visible-in-storyboard-props", pendingScenes.length >= importReport.summary.importedCount, {pendingScenes: pendingScenes.length, imported: importReport.summary.importedCount});
  }
  check("storyboard-manifest-hash-current", manifest.current?.propsSha256 === sha256(storyboardProps), {manifest: manifest.current?.propsSha256, actual: sha256(storyboardProps)});
}

const status = failures.length ? "FAIL" : warnings.some((item) => item.id === "stale-import-report-for-previous-storyboard-hash") ? "PASS_READY_FOR_GENERATION" : "PASS";
const report = {
  contract: "A1StoryboardWebGPTArtworkBridgeAudit/v1",
  status,
  checkedAt: new Date().toISOString(),
  failures,
  warnings,
  bridge: {
    manifestPath: rel(bridgePrivate),
    publicManifestPath: rel(bridgePublic),
    jobCount: bridge.jobs?.length || 0,
  },
  import: importReport ? {
    status: importReport.status,
    importedCount: importReport.summary?.importedCount || 0,
    missingCount: importReport.summary?.missingCount || 0,
  } : null,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 2;
