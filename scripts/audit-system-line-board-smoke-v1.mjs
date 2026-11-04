#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {chromium} from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const reportRoot = path.join(artifactRoot, "verification-tier-v1");
const baseUrl = String(process.argv[2] || process.env.A1_SYSTEM_LINE_URL || "http://127.0.0.1:4311").replace(/\/$/u, "");
const pageUrl = `${baseUrl}/system-line-visual-workbench`;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileFingerprint = (file) => {
  const stat = fs.statSync(file);
  return {bytes: stat.size, mtimeMs: stat.mtimeMs};
};

const startedAt = performance.now();
const phasePath = path.join(artifactRoot, "current-phase.json");
const activeRunPath = path.join(publicRoot, "active-run.json");
const transitionPath = path.join(publicRoot, "transition-receipt.json");
const workspacePath = path.join(publicRoot, "workspace.json");
const beforePointers = [phasePath, activeRunPath, transitionPath].map(fileFingerprint);
const workspaceBefore = fileFingerprint(workspacePath);
const phase = readJson(phasePath);
const activeRun = readJson(activeRunPath);
const transition = readJson(transitionPath);
assert.equal(phase.contract, "A1SystemLineCurrentPhase/v2");
assert.equal(activeRun.contract, "A1ActiveRunIndex/v1");
assert.equal(transition.contract, "A1ProductionTransitionReceipt/v1");

const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 720}, deviceScaleFactor: 1});
  const consoleErrors = [];
  const pageErrors = [];
  const apiResponses = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => { if (response.url().includes("/api/system-line/")) apiResponses.push({url: response.url(), status: response.status()}); });

  const navigation = await page.goto(pageUrl, {waitUntil: "domcontentloaded", timeout: 15_000});
  assert.equal(navigation?.status(), 200, "board smoke page must return HTTP 200");
  const surface = page.locator('[data-a1-packaging-user-surface="true"], [data-a1-current-article-asset-surface], [data-a1-editorial-asset-workbench]').first();
  await surface.waitFor({state: "visible", timeout: 10_000});
  const board = page.locator('[data-a1-whole-film-static-board-review="true"]');
  const deliveryBoundary = page.locator('[data-a1-packaging-delivery-architecture]');
  const surfaceMode = await board.count() ? "WHOLE_FILM_STATIC_BOARD" : await deliveryBoundary.count() ? "PACKAGING_DELIVERY_BOUNDARY" : "CURRENT_ARTICLE_ASSET";
  if (surfaceMode === "WHOLE_FILM_STATIC_BOARD") {
    assert.equal(await board.getAttribute("data-a1-static-board-authority"), "PASS");
  } else if (surfaceMode === "PACKAGING_DELIVERY_BOUNDARY") {
    assert.equal(await deliveryBoundary.getAttribute("data-a1-packaging-delivery-architecture"), "PASS");
    assert.equal(await deliveryBoundary.getAttribute("data-a1-next-action"), phase.authority?.nextAction?.id || null);
  }
  await page.waitForFunction(() => document.body.innerText.trim().length > 500, undefined, {timeout: 10_000});
  assert.ok((await page.locator("body").innerText()).trim().length > 500, "board smoke must render meaningful text");
  assert.deepEqual(consoleErrors, [], "board smoke console errors");
  assert.deepEqual(pageErrors, [], "board smoke page errors");

  const allowedApiPaths = new Set([
    "/api/system-line/editorial-asset-workbench?mode=bootstrap",
    "/api/system-line/execution-status",
  ]);
  const unexpectedApiResponses = apiResponses.filter((item) => {
    const parsed = new URL(item.url);
    return !allowedApiPaths.has(`${parsed.pathname}${parsed.search}`);
  });
  assert.deepEqual(unexpectedApiResponses, [], "board smoke must remain on hot-path APIs");

  const bootstrapResponse = await page.request.get(`${baseUrl}/api/system-line/editorial-asset-workbench?mode=bootstrap`);
  const bootstrapBody = await bootstrapResponse.body();
  assert.equal(bootstrapResponse.status(), 200);
  assert.ok(bootstrapBody.length < 1024 * 1024, "bootstrap must remain below 1MB");
  const statusResponse = await page.request.get(`${baseUrl}/api/system-line/execution-status`);
  const statusBody = await statusResponse.body();
  assert.equal(statusResponse.status(), 200);
  assert.ok(statusBody.length < 64 * 1024, "execution status must remain below 64KB");
  const statusEtag = statusResponse.headers().etag;
  const etagResponse = await page.request.get(`${baseUrl}/api/system-line/execution-status`, {headers: statusEtag ? {"If-None-Match": statusEtag} : {}});
  assert.equal(etagResponse.status(), 304, "execution status must support ETag reuse");

  const afterPointers = [phasePath, activeRunPath, transitionPath].map(fileFingerprint);
  const workspaceAfter = fileFingerprint(workspacePath);
  assert.deepEqual(afterPointers, beforePointers, "board smoke must not mutate authority pointers");
  assert.deepEqual(workspaceAfter, workspaceBefore, "board smoke must not mutate workspace bytes or mtime");

  const reportBody = {
    contract: "A1SystemLineBoardSmokeAudit/v1",
    version: 1,
    status: "PASS",
    tier: "BOARD",
    pageUrl,
    currentStage: phase.authority?.currentStage || phase.authority?.state || null,
    surfaceMode,
    nextAction: phase.authority?.nextAction?.id || null,
    queue: activeRun.queue || null,
    hotPath: {
      bootstrapBytes: bootstrapBody.length,
      executionStatusBytes: statusBody.length,
      etagStatus: etagResponse.status(),
      unexpectedApiResponses,
      videoPlaybackPerformed: false,
      fullWorkspaceHashPerformed: false,
    },
    browser: {consoleErrors, pageErrors, navigationStatus: navigation?.status() || null},
    mutationAudit: {authorityPointersChanged: false, workspaceChanged: false},
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
  const report = {...reportBody, reportSha256: sha256(JSON.stringify(reportBody)), generatedAt: new Date().toISOString()};
  fs.mkdirSync(reportRoot, {recursive: true});
  const reportPath = path.join(reportRoot, "board-smoke-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: report.status, contract: report.contract, tier: report.tier, durationMs: report.durationMs, bootstrapBytes: bootstrapBody.length, executionStatusBytes: statusBody.length, videoPlaybackPerformed: false, workspaceChanged: false, reportPath}, null, 2));
} finally {
  await browser.close();
}
