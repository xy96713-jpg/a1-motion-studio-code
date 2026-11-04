#!/usr/bin/env node
/**
 * Audit that /storyboard cards show final storyboard stills when stills exist.
 *
 * Generated artwork is a source asset. The storyboard table should prefer the
 * rendered storyboard still so typography, layout, and motion-aesthetic frame
 * choices are visible to the reviewer.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-card-still-source-contract-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const stillDir = path.join(root, "apps/studio-next/public/generated/storyboard-stills");
const pageUrl = process.env.A1_STORYBOARD_URL || "http://localhost:4311/storyboard";
const representativeBeatIds = (process.env.A1_STORYBOARD_STILL_SOURCE_BEATS || "H01-B01,H01-B02,H03-B02,H10-B04,H11-B03")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

const blockers = [];
const props = fs.existsSync(propsPath) ? readJson(propsPath) : null;
const propsSha256 = fs.existsSync(propsPath) ? sha256File(propsPath) : null;
const sceneIds = new Set((props?.scenes || []).map((scene) => scene.beatId));
const rows = [];

for (const beatId of representativeBeatIds) {
  const stillPath = path.join(stillDir, `${beatId}.png`);
  const metaPath = path.join(stillDir, `${beatId}.json`);
  const row = {
    beatId,
    sceneExists: sceneIds.has(beatId),
    stillPath: rel(stillPath),
    stillExists: fs.existsSync(stillPath) && fs.statSync(stillPath).size > 0,
    metaPath: rel(metaPath),
    metaExists: fs.existsSync(metaPath),
    metaPropsCurrent: false,
    pageImageSources: [],
    pageUsesStill: false,
  };
  if (!row.sceneExists) blockers.push({id: "representative-scene-missing", beatId});
  if (!row.stillExists) blockers.push({id: "representative-still-missing", beatId, detail: row.stillPath});
  if (!row.metaExists) blockers.push({id: "representative-still-meta-missing", beatId, detail: row.metaPath});
  if (row.metaExists) {
    const meta = readJson(metaPath);
    row.metaPropsCurrent = meta.propsSha256 === propsSha256;
    if (!row.metaPropsCurrent) blockers.push({id: "representative-still-stale-props", beatId, detail: {metaPropsSha256: meta.propsSha256, currentPropsSha256: propsSha256}});
  }
  rows.push(row);
}

let browserProbeStatus = "not-run";
try {
  const {chromium} = await import("playwright");
  const browser = await chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1510, height: 980}, deviceScaleFactor: 1});
  for (const row of rows) {
    if (!row.sceneExists) continue;
    await page.goto(`${pageUrl}?shot=${row.beatId}#shot-${row.beatId}`, {waitUntil: "networkidle"});
    const sources = await page.locator(`#shot-${row.beatId} img`).evaluateAll((imgs) => imgs.map((img) => img.getAttribute("src")).filter(Boolean));
    row.pageImageSources = sources;
    row.pageUsesStill = sources.some((src) => src === `/generated/storyboard-stills/${row.beatId}.png`);
    if (!row.pageUsesStill) blockers.push({id: "storyboard-card-not-using-still", beatId: row.beatId, detail: sources});
  }
  await browser.close();
  browserProbeStatus = "pass";
} catch (error) {
  browserProbeStatus = "blocked";
  blockers.push({id: "browser-probe-failed", detail: error instanceof Error ? error.message : String(error)});
}

const report = {
  contract: "A1StoryboardCardStillSourceContract/v1",
  phaseId,
  status: blockers.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    pageUrl,
    propsPath: rel(propsPath),
    propsSha256,
    stillDir: rel(stillDir),
    representativeBeatIds,
  },
  summary: {
    representativeCount: representativeBeatIds.length,
    browserProbeStatus,
    stillExistsCount: rows.filter((row) => row.stillExists).length,
    metaPropsCurrentCount: rows.filter((row) => row.metaPropsCurrent).length,
    pageUsesStillCount: rows.filter((row) => row.pageUsesStill).length,
    blockerCount: blockers.length,
  },
  rows,
  blockers,
  nextAction: blockers.length ? "refresh-representative-stills-or-fix-storyboard-card-image-priority" : "storyboard-cards-use-final-stills",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
if (report.status !== "PASS") process.exitCode = 2;
