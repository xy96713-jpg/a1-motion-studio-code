#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, ".codex-artifacts/system-progress-system-line/visual-composition-system-v1");
const screenshotPath = path.join(outputDir, "4311-routing-panel.png");
const criticUnavailableScreenshotPath = path.join(outputDir, "4311-critic-unavailable.png");
const reportPath = path.join(outputDir, "browser-report.json");
fs.mkdirSync(outputDir, {recursive: true});

const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto("http://127.0.0.1:4311/system-line-visual-workbench", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.locator('[data-a1-editorial-asset-workbench="editorial-asset-workbench-v2"], [data-a1-packaging-user-surface="true"], [data-a1-editorial-asset-workbench="missing"]').first().waitFor({state: "visible", timeout: 60_000});
  await page.waitForLoadState("networkidle", {timeout: 12_000}).catch(() => undefined);
  const packagingRoot = page.locator('[data-a1-packaging-user-surface="true"]');
  const packagingMode = (await packagingRoot.count()) === 1;
  const root = packagingMode ? packagingRoot : page.locator('[data-a1-editorial-asset-workbench="editorial-asset-workbench-v2"]');
  const attributes = await root.evaluate((element) => ({
    contract: element.getAttribute("data-a1-editorial-asset-workbench"),
    packagingUserSurface: element.getAttribute("data-a1-packaging-user-surface"),
    wholeFilmStaticBoardReview: element.getAttribute("data-a1-whole-film-static-board-review"),
    staticBoardAuthority: element.getAttribute("data-a1-static-board-authority"),
    shotCount: element.getAttribute("data-a1-shot-count"),
    userAttentionPolicy: element.getAttribute("data-a1-user-attention-policy"),
    director: element.getAttribute("data-a1-visual-generation-director"),
    briefCount: element.getAttribute("data-a1-visual-generation-brief-count"),
    archetypeCount: element.getAttribute("data-a1-composition-archetype-count"),
    treatmentHash: element.getAttribute("data-a1-visual-treatment-hash"),
    stage: element.getAttribute("data-a1-production-authority-stage"),
    treatmentAuditStatus: element.getAttribute("data-a1-visual-treatment-audit-status"),
    generationFreezeStatus: element.getAttribute("data-a1-generation-freeze-status"),
    generationAutoDispatch: element.getAttribute("data-a1-generation-auto-dispatch"),
    acceptedShotIrAllowed: element.getAttribute("data-a1-accepted-shot-ir-allowed"),
    shotCompositionAllowed: element.getAttribute("data-a1-shot-composition-allowed"),
  }));
  const criticUnavailableBannerCount = packagingMode ? 0 : await page.locator('[data-a1-treatment-critic="unavailable"]').count();
  if (criticUnavailableBannerCount === 1) await page.locator('[data-a1-treatment-critic="unavailable"]').screenshot({path: criticUnavailableScreenshotPath});
  const details = page.locator("details[data-a1-shot-generation-routing-count]");
  const detailsCount = packagingMode ? 0 : await details.count();
  if (detailsCount > 0) {
    await details.scrollIntoViewIfNeeded();
    if (!(await details.evaluate((element) => element.open))) await details.locator("summary").click();
  }
  const rows = page.locator("[data-a1-composition-archetype]");
  const rowCount = packagingMode ? 0 : await rows.count();
  const archetypes = packagingMode ? [] : await rows.evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute("data-a1-composition-archetype")))].filter(Boolean).sort());
  const staticBoardReviewMode = packagingMode && attributes.wholeFilmStaticBoardReview === "true";
  const wholeFilmApprovalButtonCount = packagingMode ? await page.getByRole("button", {name: staticBoardReviewMode ? "确认全片静态板，批准进入拆层" : "确认全片 Assembly，开始拆层"}).count() : 0;
  if (!packagingMode && detailsCount > 0) await details.screenshot({path: screenshotPath});
  else await page.screenshot({path: screenshotPath, fullPage: false});
  const failures = [];
  if (response?.status() !== 200) failures.push(`http-status:${response?.status() || "missing"}`);
  if (packagingMode) {
    if (attributes.packagingUserSurface !== "true") failures.push(`packaging-user-surface:${attributes.packagingUserSurface}`);
    if (staticBoardReviewMode) {
      if (attributes.staticBoardAuthority !== "PASS") failures.push(`static-board-authority:${attributes.staticBoardAuthority}`);
    } else {
      if (Number(attributes.shotCount) !== 34) failures.push(`packaging-shot-count:${attributes.shotCount}`);
      if (attributes.userAttentionPolicy !== "whole-film-only") failures.push(`user-attention-policy:${attributes.userAttentionPolicy}`);
    }
    if (wholeFilmApprovalButtonCount !== 1) failures.push(`whole-film-approval-button-count:${wholeFilmApprovalButtonCount}`);
  } else {
    if (attributes.contract !== "editorial-asset-workbench-v2") failures.push(`workbench-contract:${attributes.contract}`);
    if (attributes.director !== "A1VisualGenerationDirector/v2") failures.push(`director-contract:${attributes.director}`);
    if (Number(attributes.briefCount) !== 34) failures.push(`brief-count:${attributes.briefCount}`);
    if (Number(attributes.archetypeCount) < 5) failures.push(`archetype-count:${attributes.archetypeCount}`);
    if (detailsCount !== 1) failures.push(`routing-panel-count:${detailsCount}`);
    if (rowCount !== 34) failures.push(`routing-row-count:${rowCount}`);
    if (archetypes.length < 5) failures.push(`visible-archetype-count:${archetypes.length}`);
  }
  if (attributes.treatmentAuditStatus === "UNAVAILABLE" && criticUnavailableBannerCount !== 1) failures.push(`critic-unavailable-banner-count:${criticUnavailableBannerCount}`);
  if (attributes.treatmentAuditStatus === "UNAVAILABLE" && attributes.generationFreezeStatus !== "frozen") failures.push(`critic-unavailable-generation-freeze:${attributes.generationFreezeStatus}`);
  if (attributes.treatmentAuditStatus === "UNAVAILABLE" && attributes.generationAutoDispatch !== "false") failures.push(`critic-unavailable-generation-dispatch:${attributes.generationAutoDispatch}`);
  if (attributes.treatmentAuditStatus === "UNAVAILABLE" && attributes.acceptedShotIrAllowed !== "false") failures.push(`critic-unavailable-accepted-ir:${attributes.acceptedShotIrAllowed}`);
  if (consoleErrors.length) failures.push(`console-errors:${consoleErrors.length}`);
  if (pageErrors.length) failures.push(`page-errors:${pageErrors.length}`);
  const report = {
    contract: "A1VisualCompositionBrowserProof/v1",
    status: failures.length ? "FAIL" : "PASS",
    surfaceMode: packagingMode ? "PACKAGING_USER_SURFACE" : "EDITORIAL_VISUAL_WORKBENCH",
    checkedAt: new Date().toISOString(),
    url: page.url(),
    httpStatus: response?.status() || null,
    attributes,
    detailsCount,
    rowCount,
    archetypes,
    criticUnavailableBannerCount,
    wholeFilmApprovalButtonCount,
    consoleErrors,
    pageErrors,
    screenshotPath: path.relative(rootDir, screenshotPath),
    criticUnavailableScreenshotPath: criticUnavailableBannerCount === 1 ? path.relative(rootDir, criticUnavailableScreenshotPath) : null,
    failures,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
