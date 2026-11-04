#!/usr/bin/env node
/**
 * Storyboard quality gate for the isolated 4311 storyboard review surface.
 *
 * It audits current storyboard props and visible images before a full MP4 can
 * be considered. Blockers fail the gate. Review risks are written back to
 * review-notes so only affected beats need targeted revision.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const args = process.argv.slice(2);
const phaseId = "storyboard-quality-gate-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const defaultPropsPath = "apps/studio-next/public/generated/storyboard/current/storyboard-props.json";
const defaultManifestPath = "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json";
const defaultReviewNotesPath = "apps/studio-next/public/generated/storyboard/current/review-notes.json";
const stillsDir = path.join(root, "apps/studio-next/public/generated/storyboard-stills");
const generatedArtworkDir = path.join(root, "apps/studio-next/public/generated-artwork");

function argValue(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function visualUnits(value = "") {
  let units = 0;
  for (const char of String(value)) {
    if (/\s/u.test(char)) continue;
    if (/[A-Za-z0-9]/u.test(char)) units += 0.56;
    else if (/[·，。？！、：；（）《》“”"'.-]/u.test(char)) units += 0.32;
    else units += 1;
  }
  return Number(units.toFixed(2));
}

function relativeLuminance(r, g, b) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function readPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 33 || buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error("not-png");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer.readUInt8(dataStart + 8);
      colorType = buffer.readUInt8(dataStart + 9);
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error(`unsupported-png:${bitDepth}:${colorType}`);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  };
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    current.set(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] || 0 : 0;
      if (filter === 1) current[x] = (current[x] + left) & 255;
      else if (filter === 2) current[x] = (current[x] + up) & 255;
      else if (filter === 3) current[x] = (current[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) current[x] = (current[x] + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`unsupported-filter:${filter}`);
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      pixels[dst] = current[src];
      pixels[dst + 1] = current[src + 1];
      pixels[dst + 2] = current[src + 2];
      pixels[dst + 3] = channels === 4 ? current[src + 3] : 255;
    }
    previous.set(current);
  }
  return {width, height, pixels};
}

function imageStats(filePath) {
  const {width, height, pixels} = readPng(filePath);
  const sampleStep = Math.max(1, Math.floor(Math.sqrt((width * height) / 7000)));
  const lums = [];
  let dark = 0;
  let paper = 0;
  let blue = 0;
  let edge = 0;
  let count = 0;
  const lumAt = (x, y) => {
    const idx = (y * width + x) * 4;
    return relativeLuminance(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
  };
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const lum = relativeLuminance(r, g, b);
      lums.push(lum);
      if (lum < 0.08) dark += 1;
      if (r > 205 && g > 195 && b > 170) paper += 1;
      if (b > 120 && b > r * 1.25 && b > g * 1.08) blue += 1;
      if (x + sampleStep < width && y + sampleStep < height) {
        const dx = Math.abs(lum - lumAt(x + sampleStep, y));
        const dy = Math.abs(lum - lumAt(x, y + sampleStep));
        if (dx + dy > 0.18) edge += 1;
      }
      count += 1;
    }
  }
  lums.sort((a, b) => a - b);
  const pct = (p) => lums[Math.min(lums.length - 1, Math.max(0, Math.floor(lums.length * p)))] || 0;
  const p05 = pct(0.05);
  const p01 = pct(0.01);
  const p95 = pct(0.95);
  const p99 = pct(0.99);
  const ink = lums.filter((lum) => lum < 0.25).length;
  return {
    width,
    height,
    sampleCount: count,
    contrastRatio: Number(((p99 + 0.05) / (p01 + 0.05)).toFixed(2)),
    broadContrastRatio: Number(((p95 + 0.05) / (p05 + 0.05)).toFixed(2)),
    p01: Number(p01.toFixed(4)),
    p05: Number(p05.toFixed(4)),
    p95: Number(p95.toFixed(4)),
    p99: Number(p99.toFixed(4)),
    inkFraction: Number((ink / count).toFixed(4)),
    darkFraction: Number((dark / count).toFixed(4)),
    paperFraction: Number((paper / count).toFixed(4)),
    blueFraction: Number((blue / count).toFixed(4)),
    edgeDensity: Number((edge / count).toFixed(4)),
  };
}

const protectedPhrases = [
  "自己的",
  "生成文字",
  "主流",
  "可以",
  "类似",
  "喜欢",
  "字号",
  "工作台",
  "工作流",
  "不通顺",
  "AI 味",
  "DeepSeek",
  "ChatGPT",
  "OpenAI",
  "Kimi",
];

function displayedImageFor(scene) {
  const artworkFile = scene.storyboard?.artworkFile;
  if (["adopted", "pending-visual-review"].includes(scene.storyboard?.artworkStatus || "") && artworkFile) {
    return {
      kind: scene.storyboard.artworkStatus,
      filePath: path.join(generatedArtworkDir, artworkFile),
      publicUrl: `/generated-artwork/${artworkFile}`,
    };
  }
  return {
    kind: "storyboard-still",
    filePath: path.join(stillsDir, `${scene.beatId}.png`),
    publicUrl: `/generated/storyboard-stills/${scene.beatId}.png`,
  };
}

function issue(severity, type, detail, extra = {}) {
  return {severity, type, detail, ...extra};
}

function auditScene(scene, fps) {
  const titleLines = Array.isArray(scene.titleLines) && scene.titleLines.length ? scene.titleLines : [scene.screenText || ""];
  const text = String(scene.screenText || titleLines.join(""));
  const readableText = titleLines.join("");
  const durationFrames = Number(scene.durationInFrames || 0);
  const seconds = durationFrames / fps;
  const typography = scene.layout?.typography;
  const titleBox = scene.layout?.titleBox;
  const issues = [];

  if (!durationFrames || durationFrames < 24) {
    issues.push(issue("blocker", "duration-too-short", `duration ${durationFrames}f is below 24f`));
  }
  if (seconds > 0) {
    const unitsPerSecond = visualUnits(readableText) / seconds;
    if (unitsPerSecond > 8.5) issues.push(issue("blocker", "read-time-too-short", `reading load ${unitsPerSecond.toFixed(2)} units/s exceeds 8.5`));
    else if (unitsPerSecond > 6.8) issues.push(issue("review-risk", "read-time-tight", `reading load ${unitsPerSecond.toFixed(2)} units/s exceeds 6.8`));
  }

  if (titleLines.length > 3) issues.push(issue("blocker", "too-many-title-lines", `${titleLines.length} title lines`));
  for (const [index, line] of titleLines.entries()) {
    const units = visualUnits(line);
    if (units > 20) issues.push(issue("blocker", "title-line-too-long", `line ${index + 1} has ${units} visual units`));
    else if (units > 16.5) issues.push(issue("review-risk", "title-line-tight", `line ${index + 1} has ${units} visual units`));
  }

  if (typography) {
    if (typography.audit?.fitsWidth === false || typography.audit?.fitsHeight === false || typography.overflow === true) {
      issues.push(issue("blocker", "typography-overflow", "A1TypographyLayout reports overflow or failed fit"));
    }
    if (Array.isArray(typography.audit?.blockers) && typography.audit.blockers.length) {
      issues.push(issue("blocker", "typography-audit-blockers", typography.audit.blockers.join(",")));
    }
    const fontSize = Number(typography.fontSize || titleBox?.fontSize || 0);
    if (fontSize && fontSize < 48) issues.push(issue("blocker", "font-too-small", `font size ${fontSize}px below 48`));
    else if (fontSize && fontSize < 64) issues.push(issue("review-risk", "font-small", `font size ${fontSize}px below 64`));
    const lineWidths = Array.isArray(typography.lineWidths) ? typography.lineWidths : [];
    const boxWidth = Number(titleBox?.width || 0);
    if (boxWidth && lineWidths.some((width) => Number(width) > boxWidth)) {
      issues.push(issue("blocker", "measured-line-width-overflow", `line width exceeds title box ${boxWidth}px`));
    }
  } else {
    issues.push(issue("review-risk", "typography-measurement-missing", "scene has no A1TypographyLayout measurement"));
  }

  const compactLines = titleLines.map((line) => String(line).replace(/\s+/gu, ""));
  const compactJoined = compactLines.join("");
  const compactSource = text.replace(/\s+/gu, "");
  for (const phrase of protectedPhrases) {
    const compactPhrase = phrase.replace(/\s+/gu, "");
    if (!compactPhrase || !compactSource.includes(compactPhrase)) continue;
    if (compactJoined.includes(compactPhrase) && !compactLines.some((line) => line.includes(compactPhrase))) {
      issues.push(issue("blocker", "protected-phrase-split", `protected phrase split across title lines: ${phrase}`));
    }
  }

  const image = displayedImageFor(scene);
  if (!fs.existsSync(image.filePath)) {
    issues.push(issue("blocker", "visible-image-missing", `missing ${rel(image.filePath)}`));
    return {issues, image};
  }

  try {
    const stats = imageStats(image.filePath);
    image.stats = stats;
    if (stats.width < 960 || stats.height < 540) {
      issues.push(issue("blocker", "visible-image-too-small", `${stats.width}x${stats.height} below 960x540`));
    }
    if (image.kind === "storyboard-still") {
      if (stats.inkFraction < 0.002) issues.push(issue("blocker", "still-hold-frame-too-blank", `ink fraction ${(stats.inkFraction * 100).toFixed(2)}% below 0.2%`));
      else if (stats.contrastRatio < 2.2) issues.push(issue("blocker", "still-low-contrast", `still contrast ${stats.contrastRatio}:1 below 2.2`));
      else if (stats.contrastRatio < 3) issues.push(issue("review-risk", "still-contrast-tight", `still contrast ${stats.contrastRatio}:1 below 3`));
    } else {
      if (stats.darkFraction > 0.42) issues.push(issue("blocker", "artwork-too-dark", `dark fraction ${(stats.darkFraction * 100).toFixed(1)}%`));
      else if (stats.darkFraction > 0.28) issues.push(issue("review-risk", "artwork-dark-risk", `dark fraction ${(stats.darkFraction * 100).toFixed(1)}%`));
      if (stats.edgeDensity > 0.26) issues.push(issue("review-risk", "artwork-too-busy", `edge density ${(stats.edgeDensity * 100).toFixed(1)}%`));
      if (stats.paperFraction < 0.18) issues.push(issue("review-risk", "artwork-paper-master-weak", `paper fraction ${(stats.paperFraction * 100).toFixed(1)}%`));
    }
  } catch (error) {
    issues.push(issue("blocker", "visible-image-unreadable", error instanceof Error ? error.message : "image parse failed"));
  }

  return {issues, image};
}

function readReviewNotes(filePath, storyboardPropsSha256) {
  if (!fs.existsSync(filePath)) {
    return {
      contract: "A1StoryboardReviewNotes/v1",
      status: "empty",
      updatedAt: new Date(0).toISOString(),
      storyboardPropsSha256,
      notes: [],
    };
  }
  const value = readJson(filePath);
  if (value.contract !== "A1StoryboardReviewNotes/v1" || !Array.isArray(value.notes)) {
    throw new Error(`invalid-review-notes:${rel(filePath)}`);
  }
  return value;
}

function writeQualityNotes(filePath, storyboardPropsSha256, sceneReports) {
  const current = readReviewNotes(filePath, storyboardPropsSha256);
  const keepManual = current.storyboardPropsSha256 === storyboardPropsSha256
    ? current.notes.filter((note) => note.issueType !== "quality-gate")
    : [];
  const now = new Date().toISOString();
  const autoNotes = sceneReports
    .filter((scene) => scene.blockerCount || scene.reviewRiskCount)
    .map((scene) => ({
      id: `quality-${scene.beatId}`,
      beatId: scene.beatId,
      macroId: scene.macroId,
      title: scene.title,
      issueType: "quality-gate",
      note: scene.issues.map((item) => `${item.severity}:${item.type}`).join("; "),
      status: "open",
      createdAt: now,
      updatedAt: now,
      source: "audit-storyboard-quality-gate-v1",
    }));
  const notes = [...keepManual, ...autoNotes].sort((a, b) => String(a.beatId).localeCompare(String(b.beatId), "en"));
  writeJson(filePath, {
    contract: "A1StoryboardReviewNotes/v1",
    status: notes.length ? "open" : "empty",
    updatedAt: now,
    storyboardPropsSha256,
    notes,
  });
  return {keptManualCount: keepManual.length, writtenAutoCount: autoNotes.length, totalOpenCount: notes.length};
}

const propsPath = path.resolve(root, argValue("--props", defaultPropsPath));
const manifestPath = path.resolve(root, argValue("--manifest", defaultManifestPath));
const reviewNotesPath = path.resolve(root, argValue("--review-notes", defaultReviewNotesPath));
const writeReviewNotes = hasFlag("--write-review-notes");

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const failures = [];
for (const required of [propsPath, manifestPath]) {
  if (!fs.existsSync(required)) failures.push({id: "required-file-missing", detail: rel(required)});
}

const props = fs.existsSync(propsPath) ? readJson(propsPath) : {};
const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
const fps = Number(props.fps || 30);
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
if (props.contract !== "A1MicrobeatLayeredFullPlan/v1") failures.push({id: "props-contract-invalid", detail: props.contract});
if (!scenes.length) failures.push({id: "no-scenes", detail: propsPath});
const propsSha256 = fs.existsSync(propsPath) ? sha256File(propsPath) : null;
if (manifest.current?.propsSha256 && propsSha256 && manifest.current.propsSha256 !== propsSha256) {
  failures.push({id: "storyboard-manifest-props-sha-mismatch", detail: {manifest: manifest.current.propsSha256, actual: propsSha256}});
}

const sceneReports = scenes.map((scene) => {
  const result = auditScene(scene, fps);
  const blockers = result.issues.filter((item) => item.severity === "blocker");
  const reviewRisks = result.issues.filter((item) => item.severity === "review-risk");
  return {
    beatId: scene.beatId,
    macroId: scene.macroId,
    title: Array.isArray(scene.titleLines) && scene.titleLines.length ? scene.titleLines.join(" · ") : scene.screenText || scene.beatId,
    durationInFrames: scene.durationInFrames,
    seconds: Number((Number(scene.durationInFrames || 0) / fps).toFixed(2)),
    route: scene.route,
    image: {
      kind: result.image.kind,
      publicUrl: result.image.publicUrl,
      path: rel(result.image.filePath),
      stats: result.image.stats || null,
    },
    typography: {
      fontSize: scene.layout?.typography?.fontSize || scene.layout?.titleBox?.fontSize || null,
      lineCount: Array.isArray(scene.titleLines) ? scene.titleLines.length : 1,
      lineWidths: scene.layout?.typography?.lineWidths || [],
      titleBox: scene.layout?.titleBox || null,
    },
    issues: result.issues,
    blockerCount: blockers.length,
    reviewRiskCount: reviewRisks.length,
  };
});

const blockerScenes = sceneReports.filter((scene) => scene.blockerCount > 0);
const reviewRiskScenes = sceneReports.filter((scene) => scene.reviewRiskCount > 0);
const reviewNotesWrite = writeReviewNotes ? writeQualityNotes(reviewNotesPath, propsSha256, sceneReports) : null;

const hardFailures = [
  ...failures,
  ...blockerScenes.map((scene) => ({id: "scene-quality-blocker", detail: {beatId: scene.beatId, issues: scene.issues.filter((item) => item.severity === "blocker")}})),
];

const status = hardFailures.length ? "BLOCKED" : reviewRiskScenes.length ? "PASS_WITH_REVIEW_RISKS" : "PASS";
const report = {
  contract: "A1StoryboardQualityGate/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    propsPath: rel(propsPath),
    propsSha256,
    manifestPath: rel(manifestPath),
    manifestSha256: fs.existsSync(manifestPath) ? sha256File(manifestPath) : null,
  },
  thresholds: {
    maxTitleLines: 3,
    blockerTitleLineVisualUnits: 20,
    riskTitleLineVisualUnits: 16.5,
    blockerReadUnitsPerSecond: 8.5,
    riskReadUnitsPerSecond: 6.8,
    minFontSizePx: 48,
    riskFontSizePx: 64,
    minStillContrastRatio: 2.2,
    riskStillContrastRatio: 3,
    maxArtworkDarkFraction: 0.42,
    riskArtworkDarkFraction: 0.28,
  },
  summary: {
    sceneCount: scenes.length,
    blockerSceneCount: blockerScenes.length,
    reviewRiskSceneCount: reviewRiskScenes.length,
    issueCount: sceneReports.reduce((sum, scene) => sum + scene.issues.length, 0),
    blockerCount: sceneReports.reduce((sum, scene) => sum + scene.blockerCount, 0),
    reviewRiskCount: sceneReports.reduce((sum, scene) => sum + scene.reviewRiskCount, 0),
    visibleImageMissingCount: sceneReports.filter((scene) => scene.issues.some((item) => item.type === "visible-image-missing")).length,
    typographyOverflowCount: sceneReports.filter((scene) => scene.issues.some((item) => item.type === "typography-overflow" || item.type === "measured-line-width-overflow")).length,
    lowContrastCount: sceneReports.filter((scene) => scene.issues.some((item) => /contrast/u.test(item.type))).length,
    readTimeIssueCount: sceneReports.filter((scene) => scene.issues.some((item) => /read-time/u.test(item.type))).length,
    pendingArtworkCount: sceneReports.filter((scene) => scene.image.kind === "pending-visual-review").length,
  },
  reviewNotesWrite,
  blockerScenes: blockerScenes.map((scene) => ({beatId: scene.beatId, macroId: scene.macroId, title: scene.title, issues: scene.issues.filter((item) => item.severity === "blocker")})),
  reviewRiskScenes: reviewRiskScenes.map((scene) => ({beatId: scene.beatId, macroId: scene.macroId, title: scene.title, issues: scene.issues.filter((item) => item.severity === "review-risk")})),
  scenes: sceneReports,
  failures: hardFailures,
  nextAction: hardFailures.length ? "repair-storyboard-quality-blockers" : reviewRiskScenes.length ? "review-quality-risk-notes-on-4311-storyboard" : "storyboard-quality-cleared",
};

writeJson(reportPath, report);
writeJson(publicReportPath, report);

console.log(JSON.stringify({
  status,
  reportPath: rel(reportPath),
  publicReportPath: rel(publicReportPath),
  summary: report.summary,
  reviewNotesWrite,
  nextAction: report.nextAction,
}, null, 2));

if (hardFailures.length) process.exitCode = 2;
