#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const failures = [];

function fail(id, detail) {
  failures.push({ id, detail });
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), "utf8"));
}

function sha256File(relPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relPath))).digest("hex");
}

function hasFile(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

const pagePath = "apps/studio-next/src/app/storyboard/page.tsx";
const pageSource = fs.readFileSync(path.join(root, pagePath), "utf8");
if (/remotion-renderer\/src\/generated\/microbeatLayeredFullProps\.json/u.test(pageSource)) {
  fail("storyboard-page-reads-system-line-props", `${pagePath} must read the isolated storyboard draft props, not shared system-line props`);
}
if (!/storyboard-manifest\.json/u.test(pageSource) || !/storyboard-props\.json/u.test(pageSource)) {
  fail("storyboard-page-missing-draft-contract", `${pagePath} must show manifest-backed draft status`);
}
if (!/data-a1-storyboard-first-render-gate/u.test(pageSource) || !/data-a1-full-mp4-render-allowed/u.test(pageSource) || !/storyboard-approval\.json/u.test(pageSource)) {
  fail("storyboard-page-missing-first-render-gate", `${pagePath} must expose storyboard-first render approval state`);
}

const generatorFiles = [
  "scripts/generate-props-from-article.mjs",
  "scripts/semantic-props-generator.mjs",
];
for (const relPath of generatorFiles) {
  const source = fs.readFileSync(path.join(root, relPath), "utf8");
  if (!/DEFAULT_STORYBOARD_OUT=resolve\("apps\/studio-next\/public\/generated\/storyboard\/current\/storyboard-props\.json"\)/u.test(source)) {
    fail("generator-defaults-to-system-line-props", `${relPath} must default to the isolated storyboard draft props`);
  }
  if (!/const outPath=resolve\(outIdx!==-1\?args\[outIdx\+1\]:DEFAULT_STORYBOARD_OUT\)/u.test(source)) {
    fail("generator-outpath-default-contract", `${relPath} must use DEFAULT_STORYBOARD_OUT when --out is omitted`);
  }
  if (!/allow-system-props-overwrite/u.test(source)) {
    fail("generator-missing-system-props-guard", `${relPath} must require --allow-system-props-overwrite before writing shared system-line props`);
  }
}

const manifestPath = "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json";
const storyboardPropsPath = "apps/studio-next/public/generated/storyboard/current/storyboard-props.json";
if (!hasFile(manifestPath)) {
  fail("storyboard-manifest-missing", manifestPath);
} else if (!hasFile(storyboardPropsPath)) {
  fail("storyboard-props-missing", storyboardPropsPath);
} else {
  const manifest = readJson(manifestPath);
  const props = readJson(storyboardPropsPath);
  if (manifest.contract !== "A1StoryboardDraftManifest/v1") {
    fail("storyboard-manifest-contract", manifest.contract);
  }
  if (manifest.status !== "review-only-isolated-draft") {
    fail("storyboard-manifest-status", manifest.status);
  }
  if (manifest.current?.propsSha256 !== sha256File(storyboardPropsPath)) {
    fail("storyboard-props-sha-mismatch", `${manifest.current?.propsSha256} != ${sha256File(storyboardPropsPath)}`);
  }
  if (!Array.isArray(props.scenes) || props.scenes.length !== manifest.current?.sceneCount) {
    fail("storyboard-scene-count-mismatch", `${props.scenes?.length} != ${manifest.current?.sceneCount}`);
  }
}

const systemProps = readJson("remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const systemScenes = Array.isArray(systemProps.scenes) ? systemProps.scenes : [];
const systemMacroIds = [...new Set(systemScenes.map((scene) => scene.macroId || String(scene.beatId || "").split("-")[0]).filter(Boolean))];
const systemReviewBeatIds = systemProps.reviewBeatIds || [];
if (systemScenes.length !== 47) {
  fail("system-line-scene-count", `expected restored H-series 47 scenes, got ${systemScenes.length}`);
}
for (const macroId of ["H08", "H11"]) {
  if (!systemMacroIds.includes(macroId)) fail("system-line-macro-missing", macroId);
  if (!systemReviewBeatIds.some((beatId) => String(beatId).startsWith(`${macroId}-`))) {
    fail("system-line-review-anchor-missing", macroId);
  }
}

const report = {
  contract: "A1StoryboardSystemLineIsolationAudit/v1",
  status: failures.length ? "fail" : "pass",
  checkedAt: new Date().toISOString(),
  failures,
  systemLine: {
    sceneCount: systemScenes.length,
    macroIds: systemMacroIds,
    reviewBeatIds: systemReviewBeatIds,
  },
};

const reportDir = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-system-line-isolation-v1");
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (failures.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
