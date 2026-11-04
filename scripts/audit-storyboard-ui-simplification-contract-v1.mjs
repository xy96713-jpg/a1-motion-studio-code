#!/usr/bin/env node
/**
 * Product-facing /storyboard UI simplification contract.
 *
 * The storyboard page should read like a storyboard table, not like backend
 * diagnostics. This audit checks the current dashboard state and the actual
 * page text served on port 4311.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-ui-simplification-contract-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const dashboardPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-production-dashboard-contract-v1/report.json");
const targetUrl = process.env.A1_STORYBOARD_URL || "http://localhost:4311/storyboard";

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

const blockers = [];
const dashboard = readJson(dashboardPath);
if (!dashboard) {
  blockers.push({id: "missing-dashboard", detail: `Missing dashboard report: ${rel(dashboardPath)}`});
}

if ((dashboard?.summary?.reviewTaskCount || 0) !== 0) {
  blockers.push({id: "dashboard-review-task-count-not-zero", detail: dashboard?.summary?.reviewTaskCount});
}
const visibleProblemCards = (dashboard?.cards || []).filter((card) => card.tone === "blocked" || card.tone === "missing" || card.tone === "attention");
if (visibleProblemCards.length) {
  blockers.push({id: "dashboard-visible-cards-not-clear", detail: visibleProblemCards.map((card) => ({id: card.id, status: card.status, tone: card.tone}))});
}

let pageText = "";
let pageStatus = null;
let browserProbeStatus = "not-run";
let lightweightWhyCount = 0;
let lightweightWhyOpenCount = 0;
let lightweightWhyInvalidLineCount = 0;
try {
  const {chromium} = await import("playwright");
  const browser = await chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1510, height: 980}, deviceScaleFactor: 1});
  const response = await page.goto(targetUrl, {waitUntil: "networkidle"});
  pageStatus = response?.status() || null;
  pageText = await page.locator("body").innerText({timeout: 5000});
  lightweightWhyCount = await page.locator("[data-a1-lightweight-decision-why]").count();
  lightweightWhyOpenCount = await page.locator("[data-a1-lightweight-decision-why][open]").count();
  lightweightWhyInvalidLineCount = await page.locator("[data-a1-lightweight-decision-why-lines]").evaluateAll((nodes) => nodes.filter((node) => node.getAttribute("data-a1-lightweight-decision-why-lines") !== "3").length);
  await browser.close();
  browserProbeStatus = "pass";
} catch (error) {
  browserProbeStatus = "blocked";
  blockers.push({id: "browser-probe-failed", detail: error instanceof Error ? error.message : String(error)});
}

if (pageStatus !== 200) {
  blockers.push({id: "storyboard-http-not-200", detail: pageStatus});
}
if (lightweightWhyCount === 0) {
  blockers.push({id: "missing-lightweight-decision-why", detail: "Storyboard cards must expose a compact collapsed explanation"});
}
if (lightweightWhyOpenCount !== 0) {
  blockers.push({id: "lightweight-decision-why-default-open", detail: lightweightWhyOpenCount});
}
if (lightweightWhyInvalidLineCount !== 0) {
  blockers.push({id: "lightweight-decision-why-not-three-lines", detail: lightweightWhyInvalidLineCount});
}
const sceneCount = dashboard?.summary?.sceneCount || 0;
if (sceneCount && lightweightWhyCount > sceneCount + 1) {
  blockers.push({id: "too-many-lightweight-decision-why-blocks", detail: {sceneCount, lightweightWhyCount}});
}

const bannedVisiblePhrases = [
  "待处理 8",
  "storyboard first render gate",
  "storyboard-approval.json",
  "当前 hash",
  "accept-regroup-items-before-applying",
  "use-dashboard-primary-next-action",
];
for (const phrase of bannedVisiblePhrases) {
  if (pageText.includes(phrase)) blockers.push({id: "backend-copy-visible", detail: phrase});
}

const firstLines = pageText.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 80);
const report = {
  contract: "A1StoryboardUISimplificationContract/v1",
  phaseId,
  status: blockers.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    targetUrl,
    dashboardPath: rel(dashboardPath),
  },
  summary: {
    pageStatus,
    browserProbeStatus,
    dashboardInputStatusBeforeUiAudit: dashboard?.status || "missing",
    reviewTaskCount: dashboard?.summary?.reviewTaskCount ?? null,
    visibleProblemCardCount: visibleProblemCards.length,
    lightweightWhyCount,
    lightweightWhyOpenCount,
    lightweightWhyInvalidLineCount,
    bannedVisiblePhraseCount: blockers.filter((blocker) => blocker.id === "backend-copy-visible").length,
    firstLineCount: firstLines.length,
  },
  firstLines,
  blockers,
  nextAction: blockers.length ? "remove-product-facing-backend-copy-or-fix-dashboard-state" : "storyboard-ui-copy-is-product-facing",
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
