#!/usr/bin/env node
/**
 * Capture a lightweight visual proof for /storyboard.
 *
 * This complements data contracts with a browser-observed screenshot and simple
 * product-facing UI metrics. It must not render video or expose backend copy.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-ui-visual-proof-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const targetUrl = process.env.A1_STORYBOARD_URL || "http://localhost:4311/storyboard";
const screenshotName = "storyboard-ui-current.png";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), {recursive: true});
  fs.copyFileSync(from, to);
  return true;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

const blockers = [];
let pageStatus = null;
let browserProbeStatus = "not-run";
let metrics = {
  articleCardCount: 0,
  tableRowCount: 0,
  lightweightWhyCount: 0,
  lightweightWhyOpenCount: 0,
  lightweightWhyInvalidLineCount: 0,
  visibleDetailsCount: 0,
  openedDetailsCount: 0,
  visiblePrimaryActionCount: 0,
  visibleBackendPhraseCount: 0,
  visibleTextChars: 0,
  firstCardImageSources: [],
};

const backendPhrases = [
  "storyboard first render gate",
  "storyboard-approval.json",
  "currentPropsSha256",
  "propsSha256",
  "accept-regroup-items-before-applying",
  "use-dashboard-primary-next-action",
  "A1Storyboard",
  "contract:",
];

try {
  const {chromium} = await import("playwright");
  const browser = await chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1510, height: 980}, deviceScaleFactor: 1});
  const response = await page.goto(targetUrl, {waitUntil: "networkidle"});
  pageStatus = response?.status() || null;
  const artifactScreenshot = path.join(artifactRoot, screenshotName);
  fs.mkdirSync(path.dirname(artifactScreenshot), {recursive: true});
  await page.screenshot({path: artifactScreenshot, fullPage: false});
  const bodyText = await page.locator("body").innerText({timeout: 5000});
  const firstCardImageSources = await page.locator('article[id^="shot-"] img').evaluateAll((imgs) => imgs.slice(0, 8).map((img) => img.getAttribute("src")).filter(Boolean));
  metrics = {
    articleCardCount: await page.locator('article[id^="shot-"]').count(),
    tableRowCount: await page.locator("[data-a1-storyboard-row]").count(),
    lightweightWhyCount: await page.locator("[data-a1-lightweight-decision-why]").count(),
    lightweightWhyOpenCount: await page.locator("[data-a1-lightweight-decision-why][open]").count(),
    lightweightWhyInvalidLineCount: await page.locator("[data-a1-lightweight-decision-why-lines]").evaluateAll((nodes) => nodes.filter((node) => node.getAttribute("data-a1-lightweight-decision-why-lines") !== "3").length),
    visibleDetailsCount: await page.locator("details").count(),
    openedDetailsCount: await page.locator("details[open]").count(),
    visiblePrimaryActionCount: await page.locator('a:has-text("审片"), button, summary').count(),
    visibleBackendPhraseCount: backendPhrases.filter((phrase) => bodyText.includes(phrase)).length,
    visibleTextChars: bodyText.replace(/\s+/gu, "").length,
    firstCardImageSources,
  };
  await browser.close();
  browserProbeStatus = "pass";
  copyIfExists(artifactScreenshot, path.join(publicRoot, screenshotName));
} catch (error) {
  browserProbeStatus = "blocked";
  blockers.push({id: "browser-proof-failed", detail: error instanceof Error ? error.message : String(error)});
}

if (pageStatus !== 200) blockers.push({id: "storyboard-http-not-200", detail: pageStatus});
if (metrics.articleCardCount <= 0 && metrics.tableRowCount <= 0) blockers.push({id: "no-storyboard-cards-visible", detail: metrics});
if (metrics.lightweightWhyCount <= 0) blockers.push({id: "missing-lightweight-why", detail: metrics.lightweightWhyCount});
if (metrics.lightweightWhyOpenCount !== 0) blockers.push({id: "lightweight-why-not-collapsed", detail: metrics.lightweightWhyOpenCount});
if (metrics.lightweightWhyInvalidLineCount !== 0) blockers.push({id: "lightweight-why-invalid-line-contract", detail: metrics.lightweightWhyInvalidLineCount});
if (metrics.openedDetailsCount !== 0) blockers.push({id: "details-open-by-default", detail: metrics.openedDetailsCount});
if (metrics.visibleBackendPhraseCount !== 0) blockers.push({id: "backend-copy-visible", detail: metrics.visibleBackendPhraseCount});
if (metrics.visiblePrimaryActionCount > 80) blockers.push({id: "too-many-visible-controls", detail: metrics.visiblePrimaryActionCount});

const report = {
  contract: "A1StoryboardUIVisualProof/v1",
  phaseId,
  status: blockers.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {targetUrl},
  summary: {
    pageStatus,
    browserProbeStatus,
    ...metrics,
    blockerCount: blockers.length,
  },
  artifacts: {
    screenshot: rel(path.join(artifactRoot, screenshotName)),
    publicScreenshot: rel(path.join(publicRoot, screenshotName)),
  },
  blockers,
  nextAction: blockers.length ? "simplify-storyboard-visible-ui-before-continuing" : "storyboard-ui-visual-proof-clear",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  screenshot: report.artifacts.screenshot,
  publicScreenshot: report.artifacts.publicScreenshot,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
if (report.status !== "PASS") process.exitCode = 2;
