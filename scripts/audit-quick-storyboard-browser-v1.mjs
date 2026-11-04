#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {chromium} from "playwright";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const baseUrl = String(process.argv[2] || process.env.A1_SYSTEM_LINE_URL || "http://127.0.0.1:4311").replace(/\/$/u, "");
const pageUrl = `${baseUrl}/system-line-visual-workbench`;
const currentRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const outputRoot = path.join(currentRoot, "quick-storyboard-browser-audit-v1");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-current-structure-browser-audit-"));
const publicWorkspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const artifactWorkspacePath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/workspace.json");
const publicBootstrapPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/client-bootstrap.json");
const artifactBootstrapPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/client-bootstrap.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const continuousScreenManifestPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/all-sixteen-shot-v2/manifest.json");
const representativeMatureMotionManifestPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/representative-mature-motion-v2/manifest.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const timedGet = async (request, url, options = {}) => {
  const startedAt = performance.now();
  const response = await request.get(url, options);
  const body = await response.body();
  return {status: response.status(), bytes: body.length, etag: response.headers().etag || null, durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000};
};

const workspace = readProjectWorkspace(appRoot);
const lifecycle = derivePackagingLifecycleProjection(workspace);
const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const expectedPackageCount = workspace.production.canonicalCreatorPackagingSequence.decisions.filter((decision) => decision.packageDecision === "PACKAGE").length;
const expectedScreenDemoCount = workspace.production.shotVisualCoveragePlan.shotPlans.filter((shot) => shot.route === "SCREEN_EVIDENCE").length;
const phase = JSON.parse(fs.readFileSync(phasePath, "utf8"));
const continuousScreenManifest = JSON.parse(fs.readFileSync(continuousScreenManifestPath, "utf8"));
const representativeMatureMotionManifest = JSON.parse(fs.readFileSync(representativeMatureMotionManifestPath, "utf8"));
const expectedAuthorityStatus = phase.status;
const expectedNextAction = phase.authority.nextAction.id;
const expectedRepairTargetShotIds = phase.authority.nextAction.targetShotIds || [];
const repairPending = phase.status === "CANONICAL_TITLE_REPAIR_PENDING";
const articleAssetsCurrent = phase.authority.currentStage === "article-assets" || expectedNextAction === "automatic-article-packaging-qa";
const paletteBindingBlocked = phase.status === "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED"
  || phase.authority?.currentStage === "creator-packaging-palette-binding-repair-required";
const authorityReviewGated = phase.authority?.nextAction?.requiresUser === true
  && Boolean(phase.authority?.nextAction?.reviewGate)
  && lifecycle.authorityStage === phase.authority?.currentStage
  && lifecycle.nextActionId === expectedNextAction
  && lifecycle.requiresExplicitApproval === true;
const before = {
  publicWorkspaceSha256: fileSha256(publicWorkspacePath),
  artifactWorkspaceSha256: fileSha256(artifactWorkspacePath),
  publicBootstrapSha256: fileSha256(publicBootstrapPath),
  artifactBootstrapSha256: fileSha256(artifactBootstrapPath),
};

let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
  const consoleErrors = [];
  const pageErrors = [];
  const systemLineResponses = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => { if (response.url().includes("/api/system-line/")) systemLineResponses.push({url: response.url(), status: response.status()}); });

  const navigation = await page.goto(pageUrl, {waitUntil: "domcontentloaded", timeout: 30_000});
  assert.equal(navigation?.status(), 200, "visual workbench must return HTTP 200");
  let bodyTextLength = 0;
  let errorOverlayCount = 0;
  auditFlow: {
  const currentResearchShell = page.locator('[data-a1-storyboard-shell="current"]');
  if (await currentResearchShell.count()) {
    await currentResearchShell.waitFor({state: "visible", timeout: 15_000});
    const primary = page.locator('[data-a1-production-primary="true"]');
    await primary.waitFor({state: "visible", timeout: 15_000});
    await page.getByRole("button", {name:"分镜总览", exact:true}).waitFor({state:"visible",timeout:15_000});
    await primary.getByText(/(?:静态制作|包装静态) · /u).waitFor({state:"visible",timeout:15_000});
    const overviewResponse=await page.request.get(`${baseUrl}/api/system-line/research-task-view?${new URLSearchParams({taskId:"hupo-69-shot-reconstruction-v1",projection:"overview"})}`);
    assert.equal(overviewResponse.status(),200,"active research overview API must return HTTP 200");
    const overviewPayload=await overviewResponse.json();
    assert.equal(overviewPayload?.workOrder?.summary?.shotCount,69,"active research overview must expose all 69 shots");
    const bodyText = await page.locator("body").innerText();
    bodyTextLength = bodyText.trim().length;
    errorOverlayCount = await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count();
    assert.ok(bodyTextLength > 700, "active research storyboard must render meaningful content");
    assert.match(bodyText, /胡泊全片/u);
    assert.match(bodyText, /分镜总览/u);
    assert.match(bodyText, /(?:静态制作|包装静态)/u);
    assert.equal(errorOverlayCount, 0);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    await page.setViewportSize({width: 1280, height: 720});
    const responsiveGeometry = await page.evaluate(() => ({viewportWidth: window.innerWidth, documentClientWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth}));
    assert.ok(responsiveGeometry.documentScrollWidth <= responsiveGeometry.documentClientWidth + 1);
    fs.mkdirSync(outputRoot, {recursive: true});
    const screenshotPath = path.join(outputRoot, "active-research-storyboard.png");
    await page.screenshot({path: screenshotPath, fullPage: false});
    const after = {publicWorkspaceSha256:fileSha256(publicWorkspacePath),artifactWorkspaceSha256:fileSha256(artifactWorkspacePath),publicBootstrapSha256:fileSha256(publicBootstrapPath),artifactBootstrapSha256:fileSha256(artifactBootstrapPath)};
    assert.deepEqual(after,before,"active research browser audit must not mutate parked production authority");
    const reportBody={contract:"A1QuickStoryboardBrowserAudit/v1",version:3,status:"PASS",source:{workspaceSha256:workspace.workspaceSha256,activeResearchTaskId:"hupo-69-shot-reconstruction-v1"},
      browser:{engine:"chromium",headless:true,pageUrl,httpStatus:navigation.status(),bodyTextLength,errorOverlayCount,consoleErrors,pageErrors},currentProjection:{shotCount:69,activeResearch:true},
      responsiveEvidence:responsiveGeometry,screenshot:{path:path.relative(root,screenshotPath),bytes:fs.statSync(screenshotPath).size,sha256:fileSha256(screenshotPath)},
      mutationAudit:{before,after,workspaceMutationPerformed:false,imageGenerationPerformed:false},boundary:{reviewOnly:true,productionAdmission:false,motionAllowed:false,resolveAllowed:false,finalRenderAllowed:false}};
    const report={...reportBody,reportSha256:sha256(JSON.stringify(reportBody)),generatedAt:new Date().toISOString()};
    const reportPath=path.join(outputRoot,"report.json");fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`,`utf8`);
    console.log(JSON.stringify({status:report.status,contract:report.contract,reportPath,reportSha256:report.reportSha256,currentProjection:report.currentProjection,workspaceMutationPerformed:false},null,2));
    break auditFlow;
  }
  if (repairPending) {
    const hotPath = page.locator('[data-a1-production-hot-path="A1ProductionHotPathProjection/v1"]');
    await hotPath.waitFor({state: "visible", timeout: 15_000});
    bodyTextLength = (await page.locator("body").innerText()).trim().length;
    errorOverlayCount = await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count();
    assert.ok(bodyTextLength > 700, "current production hot path must render meaningful content");
    assert.equal(errorOverlayCount, 0, "framework error overlay must be absent");
    assert.deepEqual(consoleErrors, [], "browser console must have no errors");
    assert.deepEqual(pageErrors, [], "page must have no uncaught errors");
    assert.equal(await hotPath.getAttribute("data-a1-hero-title-style-mode"), "EVA_MECHANISM_CJK");
    const repairText = await hotPath.innerText();
    assert.match(repairText, /标题视觉返修/u);
    const expectedRepairTargetText = expectedRepairTargetShotIds.join("、");
    assert.ok(expectedRepairTargetText.length > 0, "canonical repair must expose authority-eligible target shots");
    assert.match(repairText, new RegExp(expectedRepairTargetText.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.equal(await page.locator('[data-a1-whole-film-static-board-review="true"]').count(), 0);
    assert.equal(await page.locator('[data-a1-system-validation-candidate], [data-a1-system-validation-video]').count(), 0);
    const allowedApiPaths = new Set(["/api/system-line/editorial-asset-workbench?mode=bootstrap", "/api/system-line/execution-status"]);
    const unexpectedApiResponses = systemLineResponses.filter((item) => { const parsed = new URL(item.url); return !allowedApiPaths.has(`${parsed.pathname}${parsed.search}`); });
    assert.deepEqual(unexpectedApiResponses, []);
    const bootstrapProbe = await timedGet(page.request, `${baseUrl}/api/system-line/editorial-asset-workbench?mode=bootstrap`);
    const statusProbe = await timedGet(page.request, `${baseUrl}/api/system-line/execution-status`);
    const statusEtagProbe = await timedGet(page.request, `${baseUrl}/api/system-line/execution-status`, {headers: {"If-None-Match": statusProbe.etag}});
    assert.equal(bootstrapProbe.status, 200);
    assert.ok(bootstrapProbe.bytes < 2 * 1024 * 1024);
    assert.equal(statusProbe.status, 200);
    assert.ok(statusProbe.bytes < 64 * 1024);
    assert.equal(statusEtagProbe.status, 304);
    const liveStatus = await (await page.request.get(`${baseUrl}/api/system-line/execution-status`)).json();
    assert.equal(liveStatus.status.status, expectedAuthorityStatus);
    assert.equal(liveStatus.status.nextAction.id, expectedNextAction);
    assert.equal(liveStatus.status.gates.motionPrototypeAllowed, false);
    assert.equal(liveStatus.status.gates.finalRenderAllowed, false);
    assert.equal(liveStatus.status.gates.resolveExportAllowed, false);
    await page.setViewportSize({width: 1280, height: 720});
    const responsiveGeometry = await page.evaluate(() => ({viewportWidth: window.innerWidth, documentClientWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth}));
    assert.ok(responsiveGeometry.documentScrollWidth <= responsiveGeometry.documentClientWidth + 1);
    fs.mkdirSync(outputRoot, {recursive: true});
    const screenshotPath = path.join(outputRoot, "current-structure-hot-path.png");
    await page.screenshot({path: screenshotPath, fullPage: false});
    const after = {
      publicWorkspaceSha256: fileSha256(publicWorkspacePath),
      artifactWorkspaceSha256: fileSha256(artifactWorkspacePath),
      publicBootstrapSha256: fileSha256(publicBootstrapPath),
      artifactBootstrapSha256: fileSha256(artifactBootstrapPath),
    };
    assert.deepEqual(after, before, "browser audit must not mutate production authority or bootstrap");
    const reportBody = {
      contract: "A1QuickStoryboardBrowserAudit/v1",
      version: 2,
      status: "PASS",
      source: {workspaceSha256: workspace.workspaceSha256, boardSha256: null, timelineBoardSha256: null},
      browser: {engine: "chromium", headless: true, pageUrl, httpStatus: navigation.status(), bodyTextLength, errorOverlayCount, consoleErrors, pageErrors},
      currentProjection: {shotCount: workspace.article.shotCount, packageCount: expectedPackageCount, noPackageCount: workspace.article.shotCount - expectedPackageCount, blockedShotIds: lifecycle.blockedShotIds || [], status: liveStatus.status.status, nextAction: liveStatus.status.nextAction.id},
      hotPath: {repairPending: true, bootstrapProbe, statusProbe, statusEtagProbe, unexpectedApiResponses, fullWorkspaceRouteRequested: false},
      responsiveEvidence: responsiveGeometry,
      screenshot: {path: path.relative(root, screenshotPath), bytes: fs.statSync(screenshotPath).size, sha256: fileSha256(screenshotPath)},
      mutationAudit: {before, after, workspaceMutationPerformed: false, imageGenerationPerformed: false},
      boundary: {reviewOnly: true, userVisualApproval: phase.reviewDecision.userVisualApproval, approvalAllowed: Boolean(lifecycle.approvalAllowed), motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false},
    };
    const report = {...reportBody, reportSha256: sha256(JSON.stringify(reportBody)), generatedAt: new Date().toISOString()};
    const reportPath = path.join(outputRoot, "report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({status: report.status, contract: report.contract, reportPath, reportSha256: report.reportSha256, currentProjection: report.currentProjection, bootstrapBytes: bootstrapProbe.bytes, executionStatusBytes: statusProbe.bytes, etagStatus: statusEtagProbe.status, consoleErrors: consoleErrors.length, workspaceMutationPerformed: false}, null, 2));
    break auditFlow;
  }
  if (articleAssetsCurrent || paletteBindingBlocked || authorityReviewGated) {
    const hotPath = page.locator('[data-a1-production-hot-path="A1ProductionHotPathProjection/v1"]');
    const packagingSurface = page.locator('[data-a1-packaging-user-surface="true"]');
    const assetLedger = page.locator('[data-a1-article-asset-ledger="A1ArticleAssetProductionLedger/v1"]');
    await hotPath.waitFor({state: "visible", timeout: 15_000});
    await packagingSurface.waitFor({state: "visible", timeout: 15_000});
    await assetLedger.waitFor({state: "visible", timeout: 15_000});
    bodyTextLength = (await page.locator("body").innerText()).trim().length;
    errorOverlayCount = await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count();
    assert.ok(bodyTextLength > 700, "current article asset QA surface must render meaningful content");
    assert.equal(errorOverlayCount, 0, "framework error overlay must be absent");
    assert.deepEqual(consoleErrors, [], "browser console must have no errors");
    assert.deepEqual(pageErrors, [], "page must have no uncaught errors");
    assert.equal(await hotPath.getAttribute("data-a1-hero-title-style-mode"), "EVA_MECHANISM_CJK");
    assert.equal(await packagingSurface.getAttribute("data-a1-next-action"), expectedNextAction);
    if (articleAssetsCurrent) {
      assert.equal(await assetLedger.getAttribute("data-a1-article-asset-ledger-status"), "ASSET_SYSTEM_REPAIR_REQUIRED");
    }
    if (authorityReviewGated) {
      assert.equal(await packagingSurface.getAttribute("data-a1-next-action"), expectedNextAction);
      assert.equal(lifecycle.nextUserGate, phase.authority.nextAction.reviewGate);
      assert.equal(lifecycle.reviewActionDisabled, false);
    }
    assert.equal(await page.locator('[data-a1-whole-film-static-board-review="true"]').count(), 0, "static board must remain deferred during article asset QA");
    assert.equal(await page.locator('[data-a1-system-validation-candidate], [data-a1-system-validation-video]').count(), 0);
    const bodyText = await page.locator("body").innerText();
    if (articleAssetsCurrent) assert.match(bodyText, /automatic-article-packaging-qa/u);
    if (paletteBindingBlocked) assert.match(bodyText, /CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED|Palette|binding|mode/iu);
    if (authorityReviewGated) assert.match(bodyText, new RegExp(expectedNextAction.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(bodyText, /当前可用镜头排版/u);
    const allowedApiPaths = new Set(["/api/system-line/editorial-asset-workbench?mode=bootstrap", "/api/system-line/execution-status"]);
    const unexpectedApiResponses = systemLineResponses.filter((item) => { const parsed = new URL(item.url); return !allowedApiPaths.has(`${parsed.pathname}${parsed.search}`); });
    assert.deepEqual(unexpectedApiResponses, []);
    const bootstrapProbe = await timedGet(page.request, `${baseUrl}/api/system-line/editorial-asset-workbench?mode=bootstrap`);
    const statusProbe = await timedGet(page.request, `${baseUrl}/api/system-line/execution-status`);
    const statusEtagProbe = await timedGet(page.request, `${baseUrl}/api/system-line/execution-status`, {headers: {"If-None-Match": statusProbe.etag}});
    assert.equal(bootstrapProbe.status, 200);
    assert.ok(bootstrapProbe.bytes < 2 * 1024 * 1024);
    assert.equal(statusProbe.status, 200);
    assert.ok(statusProbe.bytes < 64 * 1024);
    assert.equal(statusEtagProbe.status, 304);
    const liveStatus = await (await page.request.get(`${baseUrl}/api/system-line/execution-status`)).json();
    assert.equal(liveStatus.status.status, expectedAuthorityStatus);
    assert.equal(liveStatus.status.nextAction.id, expectedNextAction);
    assert.equal(liveStatus.status.gates.motionPrototypeAllowed, false);
    assert.equal(liveStatus.status.gates.finalRenderAllowed, false);
    assert.equal(liveStatus.status.gates.resolveExportAllowed, false);
    await page.setViewportSize({width: 1280, height: 720});
    const responsiveGeometry = await page.evaluate(() => ({viewportWidth: window.innerWidth, documentClientWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth}));
    assert.ok(responsiveGeometry.documentScrollWidth <= responsiveGeometry.documentClientWidth + 1);
    fs.mkdirSync(outputRoot, {recursive: true});
    const screenshotPath = path.join(outputRoot, "current-structure-hot-path.png");
    await page.screenshot({path: screenshotPath, fullPage: false});
    const after = {
      publicWorkspaceSha256: fileSha256(publicWorkspacePath),
      artifactWorkspaceSha256: fileSha256(artifactWorkspacePath),
      publicBootstrapSha256: fileSha256(publicBootstrapPath),
      artifactBootstrapSha256: fileSha256(artifactBootstrapPath),
    };
    assert.deepEqual(after, before, "browser audit must not mutate production authority or bootstrap");
    const reportBody = {
      contract: "A1QuickStoryboardBrowserAudit/v1",
      version: 2,
      status: "PASS",
      source: {workspaceSha256: workspace.workspaceSha256, boardSha256: null, timelineBoardSha256: null},
      browser: {engine: "chromium", headless: true, pageUrl, httpStatus: navigation.status(), bodyTextLength, errorOverlayCount, consoleErrors, pageErrors},
      currentProjection: {shotCount: workspace.article.shotCount, packageCount: expectedPackageCount, noPackageCount: workspace.article.shotCount - expectedPackageCount, blockedShotIds: lifecycle.blockedShotIds || [], status: liveStatus.status.status, nextAction: liveStatus.status.nextAction.id},
      hotPath: {articleAssetsCurrent, paletteBindingBlocked, authorityReviewGated, repairPending: false, bootstrapProbe, statusProbe, statusEtagProbe, unexpectedApiResponses, fullWorkspaceRouteRequested: false, staticBoardDeferred: true},
      responsiveEvidence: responsiveGeometry,
      screenshot: {path: path.relative(root, screenshotPath), bytes: fs.statSync(screenshotPath).size, sha256: fileSha256(screenshotPath)},
      mutationAudit: {before, after, workspaceMutationPerformed: false, imageGenerationPerformed: false},
      boundary: {reviewOnly: true, userVisualApproval: phase.reviewDecision.userVisualApproval, approvalAllowed: Boolean(lifecycle.approvalAllowed), motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false},
    };
    const report = {...reportBody, reportSha256: sha256(JSON.stringify(reportBody)), generatedAt: new Date().toISOString()};
    const reportPath = path.join(outputRoot, "report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({status: report.status, contract: report.contract, reportPath, reportSha256: report.reportSha256, currentProjection: report.currentProjection, bootstrapBytes: bootstrapProbe.bytes, executionStatusBytes: statusProbe.bytes, etagStatus: statusEtagProbe.status, consoleErrors: consoleErrors.length, workspaceMutationPerformed: false}, null, 2));
    break auditFlow;
  }
  const surface = page.locator('[data-a1-whole-film-static-board-review="true"]');
  await surface.waitFor({state: "visible", timeout: 15_000});
  bodyTextLength = (await page.locator("body").innerText()).trim().length;
  errorOverlayCount = await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count();
  assert.ok(bodyTextLength > 700, "current production hot path must render meaningful content");
  assert.equal(errorOverlayCount, 0, "framework error overlay must be absent");
  assert.deepEqual(consoleErrors, [], "browser console must have no errors");
  assert.deepEqual(pageErrors, [], "page must have no uncaught errors");
  assert.equal(await surface.getAttribute("data-a1-static-board-authority"), "PASS");
  const packageBoardImage = page.locator('[data-a1-static-board-embedded="package"]');
  const timelineBoardImage = page.locator('[data-a1-static-board-embedded="timeline"]');
  assert.equal(await packageBoardImage.getAttribute("src"), board.publicUrl);
  assert.equal(await timelineBoardImage.getAttribute("src"), board.timelineBoard.publicUrl);
  await Promise.all([packageBoardImage, timelineBoardImage].map((image) => image.evaluate((element) => new Promise((resolve, reject) => {
    if (element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0) return resolve(true);
    const timeout = window.setTimeout(() => reject(new Error(`static-board-image-load-timeout:${element.getAttribute("src") || "missing-src"}`)), 15_000);
    element.addEventListener("load", () => { window.clearTimeout(timeout); resolve(true); }, {once: true});
    element.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error(`static-board-image-load-failed:${element.getAttribute("src") || "missing-src"}`)); }, {once: true});
  }))));
  assert.equal(await packageBoardImage.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0), true);
  assert.equal(await timelineBoardImage.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0), true);
  assert.equal(await page.locator('[data-a1-system-validation-candidate], [data-a1-system-validation-video]').count(), 0, "pre-motion storyboard review must not expose unauthorized validation videos");
  assert.equal(await page.getByRole("button", {name: "确认全片静态板，批准进入拆层"}).isDisabled(), false);
  const bodyText = await page.locator("body").innerText();
  assert.match(bodyText, /系统门禁通过，视觉决定仍属于你/u);
  assert.match(bodyText, /USER NOT APPROVED/u);
  assert.match(bodyText, new RegExp(`${expectedPackageCount} 个包装节点，一次看完`, "u"));
  assert.match(bodyText, /34 个 beat/u);
  const screenDemoLane = page.locator('[data-a1-current-screen-demo-lane="CONTINUOUS_REAL_SOURCE_1X_SEMANTIC_SLICES_V2"]');
  await page.waitForFunction((expected) => document.querySelector('[data-a1-current-screen-demo-lane="CONTINUOUS_REAL_SOURCE_1X_SEMANTIC_SLICES_V2"]')?.getAttribute("data-a1-screen-demo-action-ready-count") === String(expected), expectedScreenDemoCount);
  assert.equal(await screenDemoLane.getAttribute("data-a1-screen-demo-shot-count"), String(expectedScreenDemoCount));
  assert.equal(await screenDemoLane.getAttribute("data-a1-screen-demo-action-ready-count"), String(expectedScreenDemoCount));
  assert.equal(await screenDemoLane.getAttribute("data-a1-screen-demo-playable-proof"), "READY");
  assert.equal(await screenDemoLane.getAttribute("data-a1-continuous-screen-evidence"), "READY_FOR_ACTUAL_PIXEL_REVIEW");
  assert.equal(await screenDemoLane.getAttribute("data-a1-continuous-screen-user-approval"), "NOT_APPROVED");
  assert.equal(await screenDemoLane.getAttribute("data-a1-screen-insertion-pack"), "CANDIDATE_ONLY_READY_FOR_EDITOR_INSERT_REVIEW");
  assert.equal(await screenDemoLane.getAttribute("data-a1-screen-insertion-entry-count"), String(expectedScreenDemoCount));
  assert.equal(await page.locator('[data-a1-screen-insertion-manifest-link="true"]').count(), 1);
  const insertionCard = page.locator('[data-a1-screen-insertion-ready="true"]');
  assert.equal(await insertionCard.getAttribute("data-a1-screen-semantic-window-count"), String(expectedScreenDemoCount));
  assert.equal(await insertionCard.getAttribute("data-a1-screen-tail-hold-max-ms"), "980");
  const openingCarrierCanary = page.locator('[data-a1-opening-nine-carrier-rhythm="READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY"]');
  assert.equal(await openingCarrierCanary.count(), 1);
  assert.equal(await openingCarrierCanary.getAttribute("data-a1-opening-nine-current-screen-run"), "5");
  assert.equal(await openingCarrierCanary.getAttribute("data-a1-opening-nine-candidate-carrier-run"), "1");
  assert.equal(await openingCarrierCanary.getAttribute("data-a1-opening-nine-user-approval"), "NOT_APPROVED");
  const midfilmCarrierCanary = page.locator('[data-a1-midfilm-eleven-carrier-rhythm="READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY"]');
  assert.equal(await midfilmCarrierCanary.count(), 1);
  assert.equal(await midfilmCarrierCanary.getAttribute("data-a1-midfilm-current-screen-run"), "11");
  assert.equal(await midfilmCarrierCanary.getAttribute("data-a1-midfilm-candidate-carrier-run"), "1");
  assert.equal(await midfilmCarrierCanary.getAttribute("data-a1-midfilm-user-approval"), "NOT_APPROVED");
  const wholeFilmCarrierBoard = page.locator('[data-a1-whole-film-carrier-board="READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY"]');
  assert.equal(await wholeFilmCarrierBoard.count(), 1);
  assert.equal(await wholeFilmCarrierBoard.getAttribute("data-a1-whole-film-carrier-shot-count"), "34");
  assert.equal(await wholeFilmCarrierBoard.getAttribute("data-a1-whole-film-carrier-run"), "2");
  assert.equal(await wholeFilmCarrierBoard.getAttribute("data-a1-whole-film-carrier-user-approval"), "NOT_APPROVED");
  const wholeFilmCarrierBoardImage = wholeFilmCarrierBoard.locator("img");
  await wholeFilmCarrierBoardImage.evaluate((element) => new Promise((resolve, reject) => {
    if (element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0) return resolve(true);
    const timeout = window.setTimeout(() => reject(new Error("whole-film-carrier-board-image-timeout")), 15_000);
    element.addEventListener("load", () => { window.clearTimeout(timeout); resolve(true); }, {once: true});
    element.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("whole-film-carrier-board-image-failed")); }, {once: true});
  }));
  const matureDirection = page.locator('[data-a1-mature-six-chapter-direction="READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY"]');
  assert.equal(await matureDirection.count(), 1);
  assert.equal(await matureDirection.getAttribute("data-a1-mature-chapter-count"), "6");
  assert.equal(await matureDirection.getAttribute("data-a1-mature-repair-count"), "6");
  assert.equal(await matureDirection.getAttribute("data-a1-mature-topology-count"), "6");
  assert.equal(await matureDirection.getAttribute("data-a1-mature-user-approval"), "NOT_APPROVED");
  const matureImages = matureDirection.locator("img");
  assert.equal(await matureImages.count(), 2);
  await Promise.all((await matureImages.elementHandles()).map((element) => element.evaluate((image) => new Promise((resolve, reject) => {
    if (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0) return resolve(true);
    const timeout = window.setTimeout(() => reject(new Error("mature-static-direction-image-timeout")), 15_000);
    image.addEventListener("load", () => { window.clearTimeout(timeout); resolve(true); }, {once: true});
    image.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("mature-static-direction-image-failed")); }, {once: true});
  }))));
  const representativeMatureMotion = page.locator('[data-a1-representative-mature-motion="CANDIDATE_ONLY"]');
  await representativeMatureMotion.waitFor({state: "visible", timeout: 15_000});
  assert.equal(await representativeMatureMotion.getAttribute("data-a1-representative-mature-motion-status"), "CANDIDATE_ONLY_PENDING_USER_MOTION_REVIEW");
  assert.equal(await representativeMatureMotion.getAttribute("data-a1-representative-mature-motion-sha"), representativeMatureMotionManifest.output.sha256);
  assert.equal(await representativeMatureMotion.getAttribute("data-a1-representative-mature-motion-user-approval"), "NOT_APPROVED");
  assert.equal(await representativeMatureMotion.getAttribute("data-a1-representative-mature-motion-production-eligible"), "false");
  assert.equal(await representativeMatureMotion.getAttribute("data-a1-semantic-style-audit"), "PASS");
  assert.equal(await representativeMatureMotion.getAttribute("data-a1-semantic-style-family-count"), String(representativeMatureMotionManifest.semanticStylePlan.audit.diversity.primaryFamilies));
  assert.equal(await page.locator('[data-a1-representative-mature-contact-sheet="true"]').count(), 1);
  const representativeMatureVideo = page.locator('[data-a1-representative-mature-motion-video="true"]');
  await representativeMatureVideo.evaluate((element) => new Promise((resolve, reject) => {
    if (element instanceof HTMLVideoElement && element.readyState >= 1 && element.videoWidth > 0) return resolve(true);
    const timeout = window.setTimeout(() => reject(new Error("representative-mature-motion-metadata-timeout")), 15_000);
    element.addEventListener("loadedmetadata", () => { window.clearTimeout(timeout); resolve(true); }, {once: true});
    element.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("representative-mature-motion-load-failed")); }, {once: true});
  }));
  assert.equal(await representativeMatureVideo.evaluate((video, expectedDuration) => video instanceof HTMLVideoElement && video.videoWidth === 960 && video.videoHeight === 540 && Math.abs(video.duration - expectedDuration) < 0.2, representativeMatureMotionManifest.output.durationMs / 1000), true);
  const representativeMaturePlayback = await representativeMatureVideo.evaluate((element) => new Promise((resolve, reject) => {
    if (!(element instanceof HTMLVideoElement)) return reject(new Error("representative-mature-motion-element-invalid"));
    const timeout = window.setTimeout(() => reject(new Error("representative-mature-motion-full-playback-timeout")), 25_000);
    element.muted = true;
    element.currentTime = 0;
    element.playbackRate = 4;
    element.addEventListener("ended", () => {
      window.clearTimeout(timeout);
      resolve({ended: element.ended, currentTime: element.currentTime, duration: element.duration});
    }, {once: true});
    element.play().catch((error) => { window.clearTimeout(timeout); reject(error); });
  }));
  assert.equal(representativeMaturePlayback.ended, true);
  assert.ok(Math.abs(representativeMaturePlayback.currentTime - representativeMaturePlayback.duration) < 0.1);
  assert.equal(await page.locator("[data-a1-screen-demo-shot]").count(), expectedScreenDemoCount);
  const screenDemoVideo = page.locator('[data-a1-screen-demo-video="ALL-16-SCREEN-EVIDENCE"]');
  await screenDemoVideo.evaluate((element) => new Promise((resolve, reject) => {
    if (element instanceof HTMLVideoElement && element.readyState >= 1 && element.videoWidth > 0) return resolve(true);
    const timeout = window.setTimeout(() => reject(new Error("screen-demo-video-metadata-timeout")), 15_000);
    element.addEventListener("loadedmetadata", () => { window.clearTimeout(timeout); resolve(true); }, {once: true});
    element.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("screen-demo-video-load-failed")); }, {once: true});
  }));
  assert.equal(await screenDemoVideo.evaluate((video, expectedDuration) => video instanceof HTMLVideoElement && video.readyState >= 1 && video.videoWidth === 960 && video.videoHeight === 540 && Math.abs(video.duration - expectedDuration) < 0.2, continuousScreenManifest.output.durationSeconds), true);
  const screenEvidencePlayback = await screenDemoVideo.evaluate((element) => new Promise((resolve, reject) => {
    if (!(element instanceof HTMLVideoElement)) return reject(new Error("continuous-screen-video-element-invalid"));
    const timeout = window.setTimeout(() => reject(new Error("continuous-screen-full-playback-timeout")), 45_000);
    element.muted = true;
    element.currentTime = 0;
    element.playbackRate = 4;
    element.addEventListener("ended", () => {
      window.clearTimeout(timeout);
      resolve({ended: element.ended, currentTime: element.currentTime, duration: element.duration, videoWidth: element.videoWidth, videoHeight: element.videoHeight});
    }, {once: true});
    element.play().catch((error) => {
      window.clearTimeout(timeout);
      reject(error);
    });
  }));
  assert.equal(screenEvidencePlayback.ended, true);
  assert.ok(Math.abs(screenEvidencePlayback.currentTime - screenEvidencePlayback.duration) < 0.1);

  await page.setViewportSize({width: 1280, height: 720});
  const responsiveGeometry = await page.evaluate(() => ({viewportWidth: window.innerWidth, documentClientWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth}));
  assert.ok(responsiveGeometry.documentScrollWidth <= responsiveGeometry.documentClientWidth + 1, "1280 desktop viewport must not introduce page-level horizontal overflow");

  const allowedApiPaths = new Set(["/api/system-line/editorial-asset-workbench?mode=bootstrap", "/api/system-line/execution-status"]);
  const unexpectedApiResponses = systemLineResponses.filter((item) => { const parsed = new URL(item.url); return !allowedApiPaths.has(`${parsed.pathname}${parsed.search}`); });
  assert.deepEqual(unexpectedApiResponses, [], "browser must remain on current hot-path APIs");
  assert.ok(systemLineResponses.some((item) => item.url.endsWith("/api/system-line/editorial-asset-workbench?mode=bootstrap") && item.status === 200));

  const bootstrapProbe = await timedGet(page.request, `${baseUrl}/api/system-line/editorial-asset-workbench?mode=bootstrap`);
  const statusProbe = await timedGet(page.request, `${baseUrl}/api/system-line/execution-status`);
  const statusEtagProbe = await timedGet(page.request, `${baseUrl}/api/system-line/execution-status`, {headers: {"If-None-Match": statusProbe.etag}});
  assert.equal(bootstrapProbe.status, 200);
  assert.ok(bootstrapProbe.bytes < 2 * 1024 * 1024);
  assert.equal(statusProbe.status, 200);
  assert.ok(statusProbe.bytes < 64 * 1024);
  assert.equal(statusEtagProbe.status, 304);
  const liveStatus = await (await page.request.get(`${baseUrl}/api/system-line/execution-status`)).json();
  assert.equal(liveStatus.status.status, expectedAuthorityStatus);
  assert.equal(liveStatus.status.nextAction.id, expectedNextAction);
  assert.equal(liveStatus.status.gates.motionPrototypeAllowed, false);
  assert.equal(liveStatus.status.gates.finalRenderAllowed, false);
  assert.equal(liveStatus.status.gates.resolveExportAllowed, false);

  fs.mkdirSync(outputRoot, {recursive: true});
  const screenshotPath = path.join(outputRoot, "current-structure-hot-path.png");
  await page.screenshot({path: screenshotPath, fullPage: false});
  const after = {
    publicWorkspaceSha256: fileSha256(publicWorkspacePath),
    artifactWorkspaceSha256: fileSha256(artifactWorkspacePath),
    publicBootstrapSha256: fileSha256(publicBootstrapPath),
    artifactBootstrapSha256: fileSha256(artifactBootstrapPath),
  };
  assert.deepEqual(after, before, "browser audit must not mutate production authority or bootstrap");
  const reportBody = {
    contract: "A1QuickStoryboardBrowserAudit/v1",
    version: 2,
    status: "PASS",
    source: {workspaceSha256: workspace.workspaceSha256, boardSha256: board.sha256, timelineBoardSha256: board.timelineBoard.sha256},
    browser: {engine: "chromium", headless: true, pageUrl, httpStatus: navigation.status(), bodyTextLength, errorOverlayCount, consoleErrors, pageErrors},
    currentProjection: {shotCount: workspace.article.shotCount, packageCount: expectedPackageCount, noPackageCount: workspace.article.shotCount - expectedPackageCount, blockedShotIds: lifecycle.blockedShotIds, status: liveStatus.status.status, nextAction: liveStatus.status.nextAction.id},
    hotPath: {bootstrapProbe, statusProbe, statusEtagProbe, unexpectedApiResponses, fullWorkspaceRouteRequested: false, expectedScreenDemoCount, screenDemoPlayableProof: true, screenEvidencePlayback, screenEvidenceSha256: continuousScreenManifest.output.sha256, representativeMaturePlayback, representativeMatureMotionSha256: representativeMatureMotionManifest.output.sha256},
    responsiveEvidence: responsiveGeometry,
    screenshot: {path: path.relative(root, screenshotPath), bytes: fs.statSync(screenshotPath).size, sha256: fileSha256(screenshotPath)},
    mutationAudit: {before, after, workspaceMutationPerformed: false, imageGenerationPerformed: false},
    boundary: {reviewOnly: true, userVisualApproval: phase.reviewDecision.userVisualApproval, approvalAllowed: lifecycle.approvalAllowed, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false},
  };
  const report = {...reportBody, reportSha256: sha256(JSON.stringify(reportBody)), generatedAt: new Date().toISOString()};
  const reportPath = path.join(outputRoot, "report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: report.status, contract: report.contract, reportPath, reportSha256: report.reportSha256, currentProjection: report.currentProjection, bootstrapBytes: bootstrapProbe.bytes, executionStatusBytes: statusProbe.bytes, etagStatus: statusEtagProbe.status, consoleErrors: consoleErrors.length, workspaceMutationPerformed: false}, null, 2));
  }
} finally {
  await browser?.close();
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
