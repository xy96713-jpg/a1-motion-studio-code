import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const root = process.cwd();
const rendererDir = path.join(root, "remotion-renderer");
const failures = [];

function cliValue(name = "") {
  const equalsPrefix = `--${name}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) return equalsArg.slice(equalsPrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

const sourceFileArg = cliValue("source") || process.env.A1_ARTICLE_SOURCE_FILE || "";
const sourceFilePath = sourceFileArg ? path.resolve(root, sourceFileArg) : "";
const isDefaultSource = !sourceFilePath;
const artifactDir = path.join(
  root,
  ".codex-artifacts",
  isDefaultSource ? "second-article-mp4-proof" : "generic-article-mp4-proof",
  new Date().toISOString().replace(/[:.]/g, "-")
);

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function run(command, args, options = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        cwd: options.cwd || root,
        encoding: options.encoding || "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: options.timeout || 600000,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`,
    };
  }
}

function parseReportPath(output = "") {
  const match = output.match(/Report:\s*(.+?report\.json)/u);
  return match ? match[1].trim() : "";
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function unfilterScanline(filter, current, previous, bytesPerPixel) {
  const output = Buffer.alloc(current.length);
  for (let index = 0; index < current.length; index += 1) {
    const left = index >= bytesPerPixel ? output[index - bytesPerPixel] : 0;
    const up = previous ? previous[index] : 0;
    const upLeft = previous && index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    let value = current[index];
    if (filter === 1) value += left;
    else if (filter === 2) value += up;
    else if (filter === 3) value += Math.floor((left + up) / 2);
    else if (filter === 4) {
      const p = left + up - upLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upLeft);
      value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
    }
    output[index] = value & 255;
  }
  return output;
}

function parsePngPixels(filePath) {
  const buffer = fsSync.readFileSync(filePath);
  assert(buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", `not a PNG: ${filePath}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  assert(bitDepth === 8, `PNG bit depth must be 8: ${filePath}`);
  assert(colorType === 2 || colorType === 6, `PNG color type must be RGB/RGBA: ${filePath}`);
  const channels = colorType === 6 ? 4 : 3;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  const rowBytes = width * channels;
  let sourceOffset = 0;
  let previous = null;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    const row = inflated.subarray(sourceOffset + 1, sourceOffset + 1 + rowBytes);
    const unfiltered = unfilterScanline(filter, row, previous, channels);
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = unfiltered[source];
      pixels[target + 1] = unfiltered[source + 1];
      pixels[target + 2] = unfiltered[source + 2];
      pixels[target + 3] = channels === 4 ? unfiltered[source + 3] : 255;
    }
    previous = unfiltered;
    sourceOffset += 1 + rowBytes;
  }
  return { width, height, pixels };
}

function imageActivity(filePath) {
  const image = parsePngPixels(filePath);
  let active = 0;
  let bright = 0;
  let green = 0;
  for (let index = 0; index < image.pixels.length / 4; index += 1) {
    const offset = index * 4;
    const red = image.pixels[offset];
    const greenChannel = image.pixels[offset + 1];
    const blue = image.pixels[offset + 2];
    const luma = (red + greenChannel + blue) / 3;
    if (luma > 22) active += 1;
    if (luma > 90) bright += 1;
    if (greenChannel - Math.max(red, blue) > 22 && greenChannel > 78) green += 1;
  }
  const total = image.width * image.height;
  return {
    contract: "A1SecondArticleMp4FrameActivity/v1",
    width: image.width,
    height: image.height,
    activeRatio: Number((active / Math.max(1, total)).toFixed(4)),
    brightRatio: Number((bright / Math.max(1, total)).toFixed(4)),
    greenRatio: Number((green / Math.max(1, total)).toFixed(4)),
  };
}

function regionProfile(filePath, region = {}, options = {}) {
  const image = parsePngPixels(filePath);
  const threshold = Number(options.threshold || 34);
  const x0 = Math.max(0, Math.floor(region.x || 0));
  const y0 = Math.max(0, Math.floor(region.y || 0));
  const x1 = Math.min(image.width, Math.ceil((region.x || 0) + (region.width || image.width)));
  const y1 = Math.min(image.height, Math.ceil((region.y || 0) + (region.height || image.height)));
  let active = 0;
  let minX = image.width;
  let maxX = -1;
  let minY = image.height;
  let maxY = -1;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * image.width + x) * 4;
      const luma = (image.pixels[offset] + image.pixels[offset + 1] + image.pixels[offset + 2]) / 3;
      if (luma <= threshold) continue;
      active += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const regionPixels = Math.max(1, (x1 - x0) * (y1 - y0));
  return {
    contract: "A1SecondArticleMp4RegionProfile/v1",
    region: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    activeRatio: Number((active / regionPixels).toFixed(4)),
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX >= minX ? maxX - minX + 1 : 0,
      height: maxY >= minY ? maxY - minY + 1 : 0,
    },
  };
}

function frameProfiles(filePath) {
  return {
    contract: "A1SecondArticleMp4FrameProfiles/v1",
    leftText: regionProfile(filePath, { x: 100, y: 180, width: 720, height: 700 }),
    rightSystem: regionProfile(filePath, { x: 760, y: 120, width: 1040, height: 800 }),
    lowerBand: regionProfile(filePath, { x: 160, y: 650, width: 1560, height: 260 }),
  };
}

function frameForShot(shot = {}) {
  const cues = Array.isArray(shot.motionCues) ? shot.motionCues : [];
  const preferred = cues.find((cue) => /draw|scan|lock|hold|morph|reveal|handoff/u.test(String(cue.id || "")))
    || cues[Math.floor(cues.length / 2)];
  if (preferred && Number(preferred.startFrame) >= 0 && Number(preferred.endFrame) > Number(preferred.startFrame)) {
    return Math.round((Number(preferred.startFrame) + Number(preferred.endFrame)) / 2);
  }
  const start = Number(shot.startFrame || 0);
  const end = Number(shot.endFrame || start + 90);
  return Math.max(start, Math.min(end - 1, Math.round(start + (end - start) * 0.58)));
}

function parseRate(value = "") {
  const [numerator, denominator] = String(value).split("/").map(Number);
  if (!Number.isFinite(numerator)) return 0;
  return numerator / Math.max(1, Number.isFinite(denominator) ? denominator : 1);
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function importantSentences(text = "") {
  return String(text || "")
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line && !/^来源[:：]/u.test(line))
    .flatMap((line) => line.split(/(?<=[。！？!?])/u))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.replace(/https?:\/\/\S+/giu, "").replace(/[^\p{L}\p{N}]+/gu, "").length >= 10);
}

function minimumRuntimeSeconds(text = "") {
  const sentenceCount = importantSentences(text).length;
  return isDefaultSource ? 30 : Math.max(22, Math.min(30, sentenceCount * 3.2));
}

function representativeShots(shots = [], options = {}) {
  const byModule = (module) => shots.find((shot) => shot.module === module);
  const preferred = [
    shots[0],
    byModule("kinetic-text"),
    byModule("vector-explainer"),
    byModule("data-map"),
    options.includeQuote ? byModule("quote-claim") : null,
    byModule("image-evidence"),
    byModule("resolve") || shots[shots.length - 1],
  ].filter(Boolean);
  const selected = uniqueById(preferred);
  for (const shot of shots) {
    if (selected.length >= 5) break;
    if (!options.includeQuote && shot.module === "quote-claim") continue;
    if (!selected.some((item) => item.id === shot.id)) selected.splice(Math.max(1, selected.length - 1), 0, shot);
  }
  if (selected.length < 5 && byModule("quote-claim")) selected.splice(Math.max(1, selected.length - 1), 0, byModule("quote-claim"));
  return uniqueById(selected);
}

async function ensureRendererInstall() {
  if (fsSync.existsSync(path.join(rendererDir, "node_modules", "remotion"))) return;
  const install = run("npm", ["install"], { cwd: rendererDir, timeout: 240000 });
  assert(install.ok, `Remotion renderer npm install failed: ${install.output.slice(0, 1600)}`);
}

async function extractMp4Frame(ffmpegPath, mp4Path, framePath, seconds) {
  const result = run(ffmpegPath, [
    "-y",
    "-ss",
    seconds.toFixed(3),
    "-i",
    mp4Path,
    "-frames:v",
    "1",
    framePath,
  ], { timeout: 180000 });
  assert(result.ok, `ffmpeg extract frame failed at ${seconds.toFixed(3)}s: ${result.output.slice(0, 1600)}`);
  assert(fsSync.existsSync(framePath), `extracted MP4 frame missing: ${framePath}`);
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  const demoArgs = ["scripts/run-second-short-article-demo.mjs"];
  if (sourceFilePath) demoArgs.push("--source", sourceFilePath);
  const demo = run("node", demoArgs, { timeout: 900000 });
  assert(demo.ok, `second article demo generation failed: ${demo.output.slice(0, 2400)}`);
  const demoReportPath = parseReportPath(demo.output);
  assert(Boolean(demoReportPath), `could not parse second article demo report path: ${demo.output.slice(-1600)}`);
  const demoReport = demoReportPath ? JSON.parse(await fs.readFile(demoReportPath, "utf8")) : {};
  const propsPath = demoReport?.remotion?.propsPath || path.join(path.dirname(demoReportPath), "remotion-second-article-props.json");
  assert(fsSync.existsSync(propsPath), `second article remotion props missing: ${propsPath}`);
  const props = JSON.parse(await fs.readFile(propsPath, "utf8"));
  const runtime = props.articleFilmTimelineRuntime || {};
  const shots = runtime.shots || [];
  const fps = Number(props.fps || runtime.fps || 30);
  const totalFrames = Number(runtime.totalFrames || props.durationInFrames || 0);
  const expectedDuration = totalFrames / Math.max(1, fps);
  const modules = [...new Set(shots.map((shot) => shot.module).filter(Boolean))];

  if (isDefaultSource) assert(!/NASA|Landsat|Moon|Earth Observatory/iu.test(demoReport.sourceText || ""), "second MP4 proof must stay non-NASA");
  assert(runtime.contract === "A1ArticleFilmTimelineRuntime/v1", "missing article film timeline runtime");
  assert(shots.length >= 7, `second article MP4 proof expects complete sentence-level sequence, got ${shots.length}`);
  const minRuntimeSeconds = minimumRuntimeSeconds(demoReport.sourceText || "");
  assert(expectedDuration >= minRuntimeSeconds, `article sequence too short for MP4 proof: expected at least ${minRuntimeSeconds}s, got ${expectedDuration}s`);
  const requiredModules = isDefaultSource
    ? ["kinetic-text", "vector-explainer", "quote-claim", "resolve"]
    : ["kinetic-text", "resolve"];
  for (const module of requiredModules) {
    assert(modules.includes(module), `second article MP4 proof missing ${module} module: ${JSON.stringify(modules)}`);
  }
  assert(modules.includes("vector-explainer") || modules.includes("data-map") || modules.includes("image-evidence") || modules.includes("quote-claim"), `article MP4 proof needs at least one structured non-title module: ${JSON.stringify(modules)}`);
  if (isDefaultSource) assert((demoReport?.summary?.discoveredCount || 0) >= 2, `second article demo should include online asset discovery evidence: ${JSON.stringify(demoReport?.summary)}`);
  else assert(Number(demoReport?.summary?.sceneCount || 0) >= 7, `custom article demo should include a complete multi-shot film: ${JSON.stringify(demoReport?.summary)}`);
  assert((demoReport?.discovery?.discovered || []).every((candidate) => candidate.renderAllowed === false), "discovered web assets must remain behind promotion in second article proof");

  await ensureRendererInstall();
  const mp4Path = path.join(artifactDir, "second-article-film-proof.mp4");
  const render = run("npx", [
    "remotion",
    "render",
    "src/index.ts",
    "A1Video",
    mp4Path,
    "--props",
    propsPath,
    "--codec",
    "h264",
    "--pixel-format",
    "yuv420p",
  ], { cwd: rendererDir, timeout: 1200000 });
  assert(render.ok, `Remotion second article MP4 render failed: ${render.output.slice(0, 2400)}`);
  assert(fsSync.existsSync(mp4Path), `MP4 output missing: ${mp4Path}`);
  const mp4Stat = fsSync.existsSync(mp4Path) ? fsSync.statSync(mp4Path) : { size: 0 };
  assert(mp4Stat.size > 1_000_000, `MP4 output too small or blank: ${mp4Stat.size} bytes`);

  const ffprobePath = require("@ffprobe-installer/ffprobe").path;
  const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
  const probe = run(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size:stream=codec_name,width,height,avg_frame_rate,duration,nb_frames,pix_fmt",
    "-of",
    "json",
    mp4Path,
  ], { timeout: 120000 });
  assert(probe.ok, `ffprobe failed: ${probe.output.slice(0, 1600)}`);
  const probeJson = probe.ok ? JSON.parse(probe.output) : {};
  const videoStream = (probeJson.streams || []).find((stream) => Number(stream.width) > 0) || {};
  const probedDuration = Number(probeJson.format?.duration || videoStream.duration || 0);
  const probedFps = parseRate(videoStream.avg_frame_rate || "");
  assert(videoStream.codec_name === "h264", `MP4 should be h264, got ${videoStream.codec_name || ""}`);
  assert(videoStream.pix_fmt === "yuv420p", `MP4 should be yuv420p for broad playback, got ${videoStream.pix_fmt || ""}`);
  assert(Number(videoStream.width) === 1920 && Number(videoStream.height) === 1080, `MP4 dimensions should be 1920x1080: ${JSON.stringify(videoStream)}`);
  assert(Math.abs(probedFps - fps) < 0.05, `MP4 fps should match props fps ${fps}, got ${probedFps}`);
  assert(Math.abs(probedDuration - expectedDuration) < 1.1, `MP4 duration mismatch: expected ${expectedDuration}, got ${probedDuration}`);

  const keyframes = [];
  for (const shot of representativeShots(shots, { includeQuote: isDefaultSource })) {
    const frame = frameForShot(shot);
    const seconds = Math.max(0, Math.min(expectedDuration - 0.1, frame / Math.max(1, fps)));
    const framePath = path.join(artifactDir, `${String(shot.index + 1).padStart(2, "0")}-${shot.id}-mp4-frame-${frame}.png`);
    await extractMp4Frame(ffmpegPath, mp4Path, framePath, seconds);
    const stat = fsSync.statSync(framePath);
    const activity = imageActivity(framePath);
    const profiles = frameProfiles(framePath);
    const minActiveRatio = shot.module === "data-map" ? 0.026 : shot.module === "resolve" ? 0.018 : shot.module === "kinetic-text" ? 0.012 : 0.022;
    assert(activity.width === 1920 && activity.height === 1080, `${shot.id} extracted frame must be 1920x1080: ${JSON.stringify(activity)}`);
    assert(stat.size > 70_000, `${shot.id} extracted frame too small/blank: ${stat.size}`);
    assert(
      activity.activeRatio >= minActiveRatio || profiles.leftText.activeRatio >= 0.04 || profiles.rightSystem.activeRatio >= 0.04,
      `${shot.id} extracted frame active ratio too low for both whole-frame and semantic regions: ${JSON.stringify({ ...activity, minActiveRatio, profiles })}`
    );
    if (shot.module === "vector-explainer" || shot.module === "data-map") {
      const hasLargeLowDensitySystem = !isDefaultSource
        && profiles.rightSystem.bounds.width >= 520
        && profiles.rightSystem.bounds.height >= 240
        && activity.activeRatio >= 0.018;
      assert(profiles.rightSystem.activeRatio >= (isDefaultSource ? 0.012 : 0.008) || hasLargeLowDensitySystem, `${shot.id} should contain a visible right-side vector/data system: ${JSON.stringify(profiles.rightSystem)}`);
      assert(profiles.rightSystem.bounds.width >= 260 && profiles.rightSystem.bounds.height >= 180, `${shot.id} vector/data system too small in MP4: ${JSON.stringify(profiles.rightSystem)}`);
    }
    if (shot.module === "kinetic-text" || shot.module === "quote-claim" || shot.module === "resolve") {
      assert(profiles.leftText.activeRatio >= 0.014 || profiles.lowerBand.activeRatio >= 0.01, `${shot.id} should contain readable text mass in MP4: ${JSON.stringify(profiles)}`);
    }
    keyframes.push({
      id: shot.id,
      module: shot.module,
      frame,
      seconds: Number(seconds.toFixed(3)),
      outputPath: framePath,
      bytes: stat.size,
      activity,
      profiles,
      thresholds: { minActiveRatio },
      cueIds: (shot.motionCues || []).map((cue) => cue.id),
    });
  }

  assert(keyframes.length >= 5, `second article MP4 proof should inspect at least 5 representative frames, got ${keyframes.length}`);
  const inspectedModules = new Set(keyframes.map((frame) => frame.module));
  assert(inspectedModules.has("vector-explainer"), `second article MP4 proof should inspect a vector frame: ${JSON.stringify([...inspectedModules])}`);
  assert(inspectedModules.has("resolve"), `second article MP4 proof should inspect a resolve frame: ${JSON.stringify([...inspectedModules])}`);

  const reportPath = path.join(artifactDir, "report.json");
  const report = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    contract: isDefaultSource ? "A1SecondArticleMp4ExportProof/v1" : "A1GenericArticleMp4ExportProof/v1",
    sourceFilePath,
    inputMode: isDefaultSource ? "default-second-article" : "custom-source-file",
    sourceDemoReport: demoReportPath,
    sourceDemoArtifactDir: path.dirname(demoReportPath),
    propsPath,
    mp4Path,
    mp4Bytes: mp4Stat.size,
    expected: {
      fps,
      totalFrames,
      durationSeconds: Number(expectedDuration.toFixed(3)),
      compositionId: "A1Video",
      dimensions: { width: 1920, height: 1080 },
      codec: "h264",
      pixelFormat: "yuv420p",
      minimumRepresentativeFrames: 5,
    },
    modules,
    probe: probeJson,
    sourceDemoSummary: demoReport.summary,
    webAssetDiscoverySummary: demoReport.discovery?.evidenceSummary || null,
    keyframes,
    failures,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (failures.length) {
    throw new Error(`render-second-article-mp4-proof failed:\n${failures.join("\n")}\nReport: ${reportPath}`);
  }
  console.log("Second article MP4 proof passed.");
  console.log(`Report: ${reportPath}`);
  console.log(`MP4: ${mp4Path}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
