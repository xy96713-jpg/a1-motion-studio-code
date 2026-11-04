#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";
import {buildCurrentFilmManifest} from "../lib/current-film-manifest.js";

const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = (await import("sharp")).default;

const root = process.cwd();
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const args = process.argv.slice(2);
function argValue(name, fallback) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}
const propsPath = path.resolve(root, argValue("--props", "remotion-renderer/src/generated/microbeatLayeredFullProps.json"));
const currentPropsPath = path.resolve(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const outDir = path.resolve(root, argValue("--out-dir", "apps/studio-next/public/generated/storyboard-stills"));
const reportPath = path.resolve(root, argValue("--report-path", ".codex-artifacts/system-progress-system-line/storyboard-current-stills-v1/report.json"));
const publicReportPath = path.resolve(root, argValue("--public-report-path", "apps/studio-next/public/generated/system-line/storyboard-current-stills-v1/report.json"));
const compositionId = argValue("--composition", "A1SystemLineHFullTimelineReview");
const frameMode = argValue("--frame-mode", "timeline");
const frameOffset = Number(argValue("--frame-offset", "0"));
const cacheVersion = "A1StoryboardStillHoldFrame/v7";
const force = args.includes("--force");
const only = argValue("--only", "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const onlySet = new Set(only);

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function representativeFrame(scene, sceneIndex) {
  if (frameMode === "sequence") return sceneIndex * 90 + Math.max(0, Math.min(89, 45 + frameOffset));
  const start = Number(scene.startFrame || 0);
  const duration = Math.max(1, Number(scene.durationInFrames || 1));
  const establishStart = Number(scene.motionPlan?.phases?.establish?.startFrame);
  const establishEnd = Number(scene.motionPlan?.phases?.establish?.endFrame);
  const emphasizeStart = Number(scene.motionPlan?.phases?.emphasize?.startFrame);
  const emphasizeEnd = Number(scene.motionPlan?.phases?.emphasize?.endFrame);
  const holdStart = Number(scene.motionPlan?.phases?.hold?.startFrame);
  const holdEnd = Number(scene.motionPlan?.phases?.hold?.endFrame);
  const safeEndLocal = Math.max(0, duration - 8);
  if (Number.isFinite(establishStart) && Number.isFinite(establishEnd) && establishEnd > establishStart && emphasizeEnd > safeEndLocal) {
    const local = Math.min(safeEndLocal, Math.max(0, Math.round((establishStart + establishEnd) / 2)));
    return Math.max(start, Math.min(start + duration - 1, start + local));
  }
  if (Number.isFinite(emphasizeStart) && Number.isFinite(emphasizeEnd) && emphasizeEnd > emphasizeStart && emphasizeStart < safeEndLocal) {
    const local = Math.min(safeEndLocal, Math.max(0, Math.round((emphasizeStart + emphasizeEnd) / 2)));
    return Math.max(start, Math.min(start + duration - 1, start + local));
  }
  if (Number.isFinite(holdStart) && Number.isFinite(holdEnd) && holdEnd > holdStart && holdStart < safeEndLocal) {
    const local = Math.min(safeEndLocal, Math.max(holdStart + 6, Math.round(duration * 0.58)));
    return Math.max(start, Math.min(start + duration - 1, start + local));
  }
  return start + Math.min(duration - 1, Math.max(0, Math.min(safeEndLocal, Math.round(duration * 0.58))));
}

function candidateFrames(scene, sceneIndex) {
  if (frameMode === "sequence") return [representativeFrame(scene, sceneIndex)];
  const start = Number(scene.startFrame || 0);
  const duration = Math.max(1, Number(scene.durationInFrames || 1));
  const safeEndLocal = Math.max(0, duration - 6);
  const rawLocals = [
    Math.round(duration * 0.22),
    Math.round(duration * 0.34),
    Math.round(duration * 0.46),
    Math.round(duration * 0.58),
    Math.round(duration * 0.7),
    Number.isFinite(Number(scene.motionPlan?.phases?.enter?.endFrame)) ? Number(scene.motionPlan.phases.enter.endFrame) + 3 : null,
    Number.isFinite(Number(scene.motionPlan?.phases?.establish?.startFrame)) && Number.isFinite(Number(scene.motionPlan?.phases?.establish?.endFrame))
      ? Math.round((Number(scene.motionPlan.phases.establish.startFrame) + Number(scene.motionPlan.phases.establish.endFrame)) / 2)
      : null,
    Number.isFinite(Number(scene.motionPlan?.phases?.emphasize?.startFrame)) && Number.isFinite(Number(scene.motionPlan?.phases?.emphasize?.endFrame))
      ? Math.round((Number(scene.motionPlan.phases.emphasize.startFrame) + Number(scene.motionPlan.phases.emphasize.endFrame)) / 2)
      : null,
  ];
  const frames = [representativeFrame(scene, sceneIndex)];
  for (const rawLocal of rawLocals) {
    if (!Number.isFinite(rawLocal)) continue;
    const local = Math.max(0, Math.min(safeEndLocal, Number(rawLocal)));
    frames.push(start + local);
  }
  return Array.from(new Set(frames)).filter((frame) => Number.isFinite(frame));
}

function luminance(r, g, b) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

async function visibleInkStats(filePath) {
  const {data, info} = await sharp(filePath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const step = Math.max(1, Math.floor(Math.sqrt((info.width * info.height) / 7000)));
  let count = 0;
  let ink = 0;
  let dark = 0;
  for (let y = 0; y < info.height; y += step) {
    for (let x = 0; x < info.width; x += step) {
      const idx = (y * info.width + x) * 4;
      const lum = luminance(data[idx], data[idx + 1], data[idx + 2]);
      if (lum < 0.25) ink += 1;
      if (lum < 0.08) dark += 1;
      count += 1;
    }
  }
  return {
    inkFraction: count ? ink / count : 0,
    darkFraction: count ? dark / count : 0,
  };
}

for (const required of [entryPoint, propsPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}

const props = readJson(propsPath);
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
if (!scenes.length) throw new Error("no-scenes-in-renderer-props");
const currentFilm = buildCurrentFilmManifest(root);
const propsSha256 = sha256File(propsPath);
const candidateProps = propsPath !== currentPropsPath;
const sourceBinding = {
  propsSha256,
  rendererSourceSha256: currentFilm.current.rendererSourceSha256,
  assetManifestSha256: currentFilm.current.assetManifestSha256,
  audioSha256: currentFilm.current.audioSha256,
  buildId: candidateProps
    ? createHash("sha256").update(JSON.stringify({...currentFilm.current, rendererPropsSha256: propsSha256})).digest("hex")
    : currentFilm.current.buildId,
};
const sceneIds = new Set(scenes.map((scene) => String(scene.beatId || scene.id || "")));
const missingRequestedIds = only.filter((beatId) => !sceneIds.has(beatId));
const selectedScenes = onlySet.size
  ? scenes.filter((scene) => onlySet.has(String(scene.beatId || scene.id || "")))
  : scenes;
if (!selectedScenes.length) throw new Error("no-selected-scenes-to-render");

fs.mkdirSync(outDir, {recursive: true});

const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});

const rendered = [];
const reused = [];
const failures = [];

try {
  const composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  for (const scene of selectedScenes) {
    const beatId = String(scene.beatId || scene.id || "");
    if (!beatId) {
      failures.push({beatId: "", reason: "missing-beat-id"});
      continue;
    }
    const output = path.join(outDir, `${beatId}.png`);
    const metaOutput = path.join(outDir, `${beatId}.json`);
    const frame = representativeFrame(scene, scenes.indexOf(scene));
    const meta = fs.existsSync(metaOutput) ? readJson(metaOutput) : null;
    const cacheValid = meta?.cacheVersion === cacheVersion
      && meta?.propsSha256 === propsSha256
      && meta?.sourceBinding?.buildId === sourceBinding.buildId
      && meta?.frame === frame
      && meta?.beatId === beatId
      && fs.existsSync(output)
      && fs.statSync(output).size > 0
      && meta?.sha256 === sha256File(output);
    if (!force && cacheValid) {
      reused.push({beatId, output: rel(output), sha256: sha256File(output), frame, cacheVersion});
      continue;
    }
    try {
      const renderCandidate = async (candidateFrame) => {
        await renderStill({
          serveUrl,
          composition,
          inputProps: props,
          frame: candidateFrame,
          output,
          imageFormat: "png",
          scale: 0.5,
          overwrite: true,
          puppeteerInstance: browser,
          logLevel: "warn",
        });
        const stats = await visibleInkStats(output);
        return {frame: candidateFrame, stats, bytes: fs.readFileSync(output)};
      };
      let selected = await renderCandidate(frame);
      const triedFrames = [{frame: selected.frame, stats: selected.stats}];
      if (selected.stats.inkFraction < 0.002) {
        for (const candidateFrame of candidateFrames(scene, scenes.indexOf(scene))) {
          if (candidateFrame === selected.frame || triedFrames.some((item) => item.frame === candidateFrame)) continue;
          const candidate = await renderCandidate(candidateFrame);
          triedFrames.push({frame: candidate.frame, stats: candidate.stats});
          const candidateScore = candidate.stats.inkFraction + candidate.stats.darkFraction * 0.5;
          const selectedScore = selected.stats.inkFraction + selected.stats.darkFraction * 0.5;
          if (candidateScore > selectedScore) selected = candidate;
          if (selected.stats.inkFraction >= 0.002) break;
        }
        fs.writeFileSync(output, selected.bytes);
      }
      const outputSha256 = sha256File(output);
      const metaRecord = {
        contract: "A1StoryboardStillMetadata/v1",
        cacheVersion,
        beatId,
        frame: selected.frame,
        initialFrame: frame,
        frameSelection: {
          mode: triedFrames.length > 1 ? "auto-visible-ink-recovery" : "representative",
          triedFrames,
        },
        propsPath: rel(propsPath),
        propsSha256,
        sourceBinding,
        output: rel(output),
        sha256: outputSha256,
        generatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(metaOutput, `${JSON.stringify(metaRecord, null, 2)}\n`, "utf8");
      rendered.push({beatId, output: rel(output), sha256: outputSha256, frame: selected.frame, cacheVersion});
    } catch (error) {
      failures.push({beatId, frame, reason: error?.message || String(error)});
    }
  }
} finally {
  await browser.close({silent: true});
}

for (const beatId of missingRequestedIds) {
  failures.push({beatId, reason: "requested-beat-id-not-found"});
}

const expectedFiles = selectedScenes.map((scene) => path.join(outDir, `${scene.beatId}.png`));
const missing = expectedFiles.filter((file) => !fs.existsSync(file) || fs.statSync(file).size === 0).map(rel);
const report = {
  contract: "A1StoryboardCurrentStills/v1",
  status: failures.length || missing.length ? "BLOCKED" : "PASS",
  generatedAt: new Date().toISOString(),
  fullMp4Rendered: false,
  candidateProps,
  stillCacheVersion: cacheVersion,
  rendererSourceProps: {path: rel(propsPath), sha256: propsSha256, sceneCount: scenes.length},
  sourceBinding,
  selection: {mode: onlySet.size ? "only" : "all", requestedBeatIds: only, selectedCount: selectedScenes.length, compositionId, frameMode, frameOffset},
  output: {dir: rel(outDir), expectedCount: selectedScenes.length, fullSceneCount: scenes.length, renderedCount: rendered.length, reusedCount: reused.length, missingCount: missing.length},
  rendered,
  reused,
  missing,
  failures,
  nextAction: failures.length || missing.length ? "repair-storyboard-still-render" : "publish-storyboard-current",
};

for (const file of [reportPath, publicReportPath]) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  status: report.status,
  sceneCount: scenes.length,
  selectedCount: selectedScenes.length,
  renderedCount: rendered.length,
  reusedCount: reused.length,
  missingCount: missing.length,
  reportPath: rel(reportPath),
  publicReportPath: rel(publicReportPath),
}, null, 2));

if (report.status !== "PASS") process.exitCode = 2;
