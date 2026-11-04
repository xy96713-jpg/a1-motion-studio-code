import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const root = process.cwd();
const rendererDir = path.join(root, "remotion-renderer");
const artifactDir = path.join(root, ".codex-artifacts", "nasa-mp4-proof", new Date().toISOString().replace(/[:.]/g, "-"));
const failures = [];

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

function parseDemoReportPath(output = "") {
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
  for (let index = 0; index < image.pixels.length / 4; index += 1) {
    const offset = index * 4;
    const luma = (image.pixels[offset] + image.pixels[offset + 1] + image.pixels[offset + 2]) / 3;
    if (luma > 22) active += 1;
    if (luma > 90) bright += 1;
  }
  const total = image.width * image.height;
  return {
    width: image.width,
    height: image.height,
    activeRatio: Number((active / Math.max(1, total)).toFixed(4)),
    brightRatio: Number((bright / Math.max(1, total)).toFixed(4)),
  };
}

function regionProfile(filePath, region = {}, options = {}) {
  const image = parsePngPixels(filePath);
  const threshold = Number(options.threshold || 35);
  const brightThreshold = Number(options.brightThreshold || 120);
  const greenDominance = Number(options.greenDominance || 24);
  const x0 = Math.max(0, Math.floor(region.x || 0));
  const y0 = Math.max(0, Math.floor(region.y || 0));
  const x1 = Math.min(image.width, Math.ceil((region.x || 0) + (region.width || image.width)));
  const y1 = Math.min(image.height, Math.ceil((region.y || 0) + (region.height || image.height)));
  let active = 0;
  let bright = 0;
  let green = 0;
  let minX = image.width;
  let maxX = -1;
  let minY = image.height;
  let maxY = -1;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * image.width + x) * 4;
      const red = image.pixels[offset];
      const greenChannel = image.pixels[offset + 1];
      const blue = image.pixels[offset + 2];
      const luma = (red + greenChannel + blue) / 3;
      if (luma <= threshold) continue;
      active += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (luma > brightThreshold) bright += 1;
      if (greenChannel - Math.max(red, blue) > greenDominance && greenChannel > 80) green += 1;
    }
  }
  const regionPixels = Math.max(1, (x1 - x0) * (y1 - y0));
  return {
    contract: "A1RegionVisualProfile/v1",
    region: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    activeRatio: Number((active / regionPixels).toFixed(4)),
    brightRatio: Number((bright / regionPixels).toFixed(4)),
    greenRatio: Number((green / regionPixels).toFixed(4)),
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

function visualQualityProfiles(filePath) {
  return {
    contract: "A1NasaShotVisualQualityProfiles/v1",
    kineticTitle: regionProfile(filePath, { x: 100, y: 260, width: 760, height: 250 }, { threshold: 54, brightThreshold: 150 }),
    kineticSupport: regionProfile(filePath, { x: 120, y: 500, width: 660, height: 310 }, { threshold: 42, brightThreshold: 120 }),
    leftText: regionProfile(filePath, { x: 100, y: 250, width: 620, height: 560 }, { threshold: 42, brightThreshold: 132 }),
    rightSystem: regionProfile(filePath, { x: 720, y: 130, width: 1080, height: 760 }, { threshold: 34, brightThreshold: 116 }),
    lowerTimeline: regionProfile(filePath, { x: 740, y: 560, width: 980, height: 280 }, { threshold: 30, brightThreshold: 108 }),
  };
}

function assertKineticTextVisualQuality(shot, profiles) {
  assert(profiles.kineticTitle.activeRatio >= 0.075, `${shot.id} kinetic title hierarchy too weak in MP4: ${JSON.stringify(profiles.kineticTitle)}`);
  assert(profiles.kineticTitle.brightRatio >= 0.045, `${shot.id} kinetic title lacks bright headline mass in MP4: ${JSON.stringify(profiles.kineticTitle)}`);
  assert(profiles.kineticSupport.activeRatio >= 0.02, `${shot.id} kinetic support text/lane missing in MP4: ${JSON.stringify(profiles.kineticSupport)}`);
  assert(profiles.rightSystem.activeRatio >= 0.025, `${shot.id} kinetic shot lacks right-side visual system in MP4: ${JSON.stringify(profiles.rightSystem)}`);
  assert(profiles.rightSystem.greenRatio >= 0.0015, `${shot.id} kinetic shot lacks accent path/diagram pixels in MP4: ${JSON.stringify(profiles.rightSystem)}`);
}

function assertVectorExplainerVisualQuality(shot, profiles) {
  assert(profiles.leftText.activeRatio >= 0.028, `${shot.id} vector shot missing readable left text anchor in MP4: ${JSON.stringify(profiles.leftText)}`);
  assert(profiles.rightSystem.activeRatio >= 0.018, `${shot.id} vector shot missing right-side SVG explainer mass in MP4: ${JSON.stringify(profiles.rightSystem)}`);
  assert(profiles.rightSystem.greenRatio >= 0.0015, `${shot.id} vector shot missing green path/arrow/semantic emphasis in MP4: ${JSON.stringify(profiles.rightSystem)}`);
  assert(profiles.rightSystem.bounds.width >= 430 && profiles.rightSystem.bounds.height >= 280, `${shot.id} vector diagram too small or card-like in MP4: ${JSON.stringify(profiles.rightSystem)}`);
}

function assertDataMapVisualQuality(shot, profiles) {
  assert(profiles.leftText.activeRatio >= 0.035, `${shot.id} data-map shot missing readable left narrative column in MP4: ${JSON.stringify(profiles.leftText)}`);
  assert(profiles.rightSystem.activeRatio >= 0.025, `${shot.id} data-map shot missing measurement diagram mass in MP4: ${JSON.stringify(profiles.rightSystem)}`);
  assert(profiles.lowerTimeline.activeRatio >= 0.018, `${shot.id} data-map shot missing timeline/scan lower structure in MP4: ${JSON.stringify(profiles.lowerTimeline)}`);
  assert(profiles.rightSystem.greenRatio >= 0.002, `${shot.id} data-map shot missing scan/path accent pixels in MP4: ${JSON.stringify(profiles.rightSystem)}`);
  assert(profiles.lowerTimeline.bounds.width >= 360, `${shot.id} data-map lower timeline too narrow in MP4: ${JSON.stringify(profiles.lowerTimeline)}`);
}

function frameForShot(shot = {}) {
  const cues = Array.isArray(shot.motionCues) ? shot.motionCues : [];
  const preferred = cues.find((cue) => /annotation-draw|scan-sweep|draw-reference-path|timeline-lock|resolve-hold/u.test(String(cue.id || "")))
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
  const demo = run("node", ["scripts/run-nasa-short-article-demo.mjs"], { timeout: 480000 });
  assert(demo.ok, `NASA demo generation failed: ${demo.output.slice(0, 2400)}`);
  const demoReportPath = parseDemoReportPath(demo.output);
  assert(Boolean(demoReportPath), `could not parse NASA demo report path: ${demo.output.slice(-1200)}`);

  const demoReport = JSON.parse(await fs.readFile(demoReportPath, "utf8"));
  const propsPath = path.join(path.dirname(demoReportPath), "remotion-props.json");
  assert(fsSync.existsSync(propsPath), `NASA demo remotion props missing: ${propsPath}`);
  const props = JSON.parse(await fs.readFile(propsPath, "utf8"));
  const runtime = props.articleFilmTimelineRuntime || {};
  const shots = runtime.shots || [];
  const fps = Number(props.fps || runtime.fps || 30);
  const totalFrames = Number(runtime.totalFrames || props.durationInFrames || 0);
  const expectedDuration = totalFrames / Math.max(1, fps);

  assert(runtime.contract === "A1ArticleFilmTimelineRuntime/v1", "missing article film timeline runtime");
  assert(shots.length >= 8, `NASA MP4 proof expects complete sentence-level sequence, got ${shots.length}`);
  assert(totalFrames >= 1500, `NASA sequence too short for MP4 proof: ${totalFrames} frames`);
  assert(demoReport?.moduleParity?.contract === "A1ExportModuleParity/v1", "NASA source demo must include export module parity");

  await ensureRendererInstall();
  const mp4Path = path.join(artifactDir, "nasa-article-film-proof.mp4");
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
  assert(render.ok, `Remotion MP4 render failed: ${render.output.slice(0, 2400)}`);
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

  const wantedIds = ["opening", "why-moon", "nasa-moon-scan", "two-orbit-scan", "closing"];
  const keyframes = [];
  for (const id of wantedIds) {
    const shot = shots.find((item) => item.id === id);
    assert(Boolean(shot), `missing proof shot ${id}`);
    if (!shot) continue;
    const frame = frameForShot(shot);
    const seconds = Math.max(0, Math.min(expectedDuration - 0.1, frame / Math.max(1, fps)));
    const framePath = path.join(artifactDir, `${String(shot.index + 1).padStart(2, "0")}-${shot.id}-mp4-frame-${frame}.png`);
    await extractMp4Frame(ffmpegPath, mp4Path, framePath, seconds);
    const stat = fsSync.statSync(framePath);
    const activity = imageActivity(framePath);
    const minActiveRatio = shot.module === "image-evidence" ? 0.035 : shot.module === "data-map" ? 0.032 : 0.022;
    assert(activity.width === 1920 && activity.height === 1080, `${id} extracted frame must be 1920x1080: ${JSON.stringify(activity)}`);
    assert(stat.size > 80_000, `${id} extracted frame too small/blank: ${stat.size}`);
    assert(activity.activeRatio >= minActiveRatio, `${id} extracted frame active ratio too low: ${JSON.stringify({ ...activity, minActiveRatio })}`);
    const visualQuality = visualQualityProfiles(framePath);
    if (shot.module === "kinetic-text") assertKineticTextVisualQuality(shot, visualQuality);
    if (shot.module === "vector-explainer") assertVectorExplainerVisualQuality(shot, visualQuality);
    if (shot.module === "data-map") assertDataMapVisualQuality(shot, visualQuality);
    keyframes.push({
      id: shot.id,
      module: shot.module,
      frame,
      seconds: Number(seconds.toFixed(3)),
      outputPath: framePath,
      bytes: stat.size,
      activity,
      visualQuality,
      thresholds: { minActiveRatio },
      cueIds: (shot.motionCues || []).map((cue) => cue.id),
    });
  }

  const reportPath = path.join(artifactDir, "report.json");
  const report = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    contract: "A1NasaMp4ExportProof/v1",
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
    },
    probe: probeJson,
    moduleParity: demoReport.moduleParity,
    keyframes,
    failures,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (failures.length) {
    throw new Error(`render-nasa-mp4-proof failed:\n${failures.join("\n")}\nReport: ${reportPath}`);
  }
  console.log("NASA MP4 proof passed.");
  console.log(`Report: ${reportPath}`);
  console.log(`MP4: ${mp4Path}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
