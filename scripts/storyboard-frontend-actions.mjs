import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { launchAuditBrowser } from "./audit-browser.mjs";
import { startIsolatedAuditServer } from "./audit-server.mjs";

export const defaultStoryboardViewport = { width: 1440, height: 900 };

export const storyboardChromeTextPattern =
  /(STORYBOARD|Keynote|Bloomberg|模板名|默认\s*(?:lead|模板)|模板连续重复|\b(?:center-pressure|split-contrast|quiet-rule|premium-dots|fine-grid|masked-dots|editorial-grid)\b)/u;

const frontendAuditLockDir = path.join(os.tmpdir(), "a1-motion-storyboard-frontend-audit.lock");
const frontendAuditLockStaleMs = 10 * 60 * 1000;
const frontendAuditLockWaitMs = 4 * 60 * 1000;
const frontendAuditLockPollMs = 250;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLockInfo(lockDir) {
  try {
    const raw = await fs.readFile(path.join(lockDir, "owner.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function removeStaleFrontendAuditLock(lockDir, now = Date.now()) {
  const info = await readLockInfo(lockDir);
  const startedAt = Number(info?.startedAt || 0);
  const age = startedAt ? now - startedAt : Number.POSITIVE_INFINITY;
  const alive = await isProcessAlive(Number(info?.pid || 0));
  if (!alive || age > frontendAuditLockStaleMs) {
    await fs.rm(lockDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

async function acquireFrontendAuditLock(label = "storyboard-frontend-actions") {
  if (process.env.A1_FRONTEND_AUDIT_LOCK === "0") {
    return async () => {};
  }
  const startedWaitingAt = Date.now();
  const owner = {
    contract: "A1FrontendAuditRunLock/v1",
    label,
    pid: process.pid,
    startedAt: Date.now(),
  };

  while (Date.now() - startedWaitingAt <= frontendAuditLockWaitMs) {
    try {
      await fs.mkdir(frontendAuditLockDir);
      await fs.writeFile(path.join(frontendAuditLockDir, "owner.json"), JSON.stringify(owner, null, 2));
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        const info = await readLockInfo(frontendAuditLockDir);
        if (Number(info?.pid || 0) === process.pid) {
          await fs.rm(frontendAuditLockDir, { recursive: true, force: true });
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await removeStaleFrontendAuditLock(frontendAuditLockDir);
      await sleep(frontendAuditLockPollMs);
    }
  }

  const info = await readLockInfo(frontendAuditLockDir);
  throw new Error(
    `Timed out waiting for storyboard frontend audit lock. ` +
      `Another heavy frontend audit is still running: ${JSON.stringify(info)}. ` +
      `Run these audits sequentially, or set A1_FRONTEND_AUDIT_LOCK=0 only for a deliberate isolated debug run.`
  );
}

export async function createStoryboardFrontendSession(options = {}) {
  const {
    label = "storyboard-frontend-actions",
    viewport = defaultStoryboardViewport,
    clearStorage = true,
  } = options;
  const releaseLock = await acquireFrontendAuditLock(label);
  let auditServer = null;
  let browser = null;
  try {
    auditServer = await startIsolatedAuditServer(label);
    browser = await launchAuditBrowser();
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const runId = `${Date.now()}-${process.pid}`;

    if (clearStorage) {
      await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    }

    const urlObject = new URL("/?view=storyboard", auditServer.rootUrl);
    urlObject.searchParams.set("auditRun", runId);
    const url = urlObject.toString();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.shellView === "storyboard", null, { timeout: 10000 });
    await page.waitForSelector("#storyboardV2Stage", { timeout: 10000 });
    await page.waitForSelector("#storyboardV2Input", { state: "attached", timeout: 10000 });

    return {
      browser,
      page,
      auditServer,
      rootUrl: auditServer.rootUrl,
      url,
      close: async () => {
        try {
          await browser.close();
        } finally {
          try {
            await auditServer.stop();
          } finally {
            await releaseLock();
          }
        }
      },
    };
  } catch (error) {
    try {
      await browser?.close();
    } catch {
      // Ignore cleanup errors while surfacing the original setup failure.
    }
    try {
      await auditServer?.stop();
    } finally {
      await releaseLock();
    }
    throw error;
  }
}

export async function generateStoryboardFromDraft(page, draft, options = {}) {
  const { minScenes = 3, pace = "", timeoutMs = 30000, disableWebAssetAutoDiscovery = false } = options;
  if (disableWebAssetAutoDiscovery) {
    await page.evaluate(() => {
      window.__A1_DISABLE_STORYBOARD_WEB_ASSET_AUTO_DISCOVERY__ = true;
    });
  }
  const input = page.locator("#storyboardV2Input").first();
  let generatedDirectly = false;
  if (await input.isVisible()) {
    await input.fill(draft);
  } else {
    await page.evaluate(async (value) => {
      const textarea = document.querySelector("#storyboardV2Input");
      if (!textarea) return;
      textarea.value = value;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await generateStoryboardV2FromInputWithArticleAssets();
    }, draft);
    generatedDirectly = true;
  }
  if (pace) {
    const visiblePace = page.locator(`[data-storyboard-v2-pace="${pace}"]:visible`).first();
    if (await visiblePace.count()) {
      await visiblePace.check();
    }
  }
  if (!generatedDirectly) {
    const generateButton = page.locator("#storyboardV2GenerateBtn").first();
    if (await generateButton.isVisible()) {
      await generateButton.click();
    } else {
      await page.evaluate(() => generateStoryboardV2FromInputWithArticleAssets());
    }
  }
  await page.waitForFunction(
    (count) => document.querySelectorAll("#storyboardV2SceneList .storyboard-v2-card").length >= count,
    minScenes,
    { timeout: timeoutMs }
  );
  await page.waitForFunction(
    () => {
      const payload = window.__A1_STORYBOARD_TEST_PAYLOAD__?.();
      const scenes = Array.isArray(payload?.scenes) ? payload.scenes : [];
      return scenes.length > 0 && scenes.every((scene) => scene?.contentGraphNode?.contract === "A1StoryboardContentGraphNode/v1");
    },
    null,
    { timeout: timeoutMs }
  );
  return page.locator("#storyboardV2SceneList .storyboard-v2-card").count();
}

export async function waitForStoryboardWebAssetStatus(page, options = {}) {
  const { timeoutMs = 10000, minRepoCandidates = 1, requireDiscovery = false } = options;
  await page.waitForFunction(
    ({ minimumRepoCandidates, mustHaveDiscovery }) => {
      const status = typeof window.__A1_STORYBOARD_WEB_ASSET_STATUS__ === "function"
        ? window.__A1_STORYBOARD_WEB_ASSET_STATUS__()
        : null;
      const candidates = Array.isArray(status?.candidates) ? status.candidates : [];
      if (mustHaveDiscovery && !status?.lastDiscovery?.contract) return false;
      return status?.loaded === true
        && status?.discoveryPending !== true
        && candidates.filter((candidate) => candidate.kind === "repo-preview").length >= minimumRepoCandidates;
    },
    { minimumRepoCandidates: minRepoCandidates, mustHaveDiscovery: requireDiscovery },
    { timeout: timeoutMs }
  );
}

export async function selectStoryboardScene(page, index) {
  const usedHarness = await page.evaluate((activeIndex) => {
    if (typeof window.__A1_SELECT_STORYBOARD_V2_SCENE__ !== "function") return false;
    window.__A1_SELECT_STORYBOARD_V2_SCENE__(activeIndex);
    return true;
  }, index).catch(() => false);
  const activeAfterHarness = usedHarness
    ? await page.evaluate(() => document.querySelector("#storyboardV2SceneList .storyboard-v2-card.active")?.dataset.storyboardV2Index || "").catch(() => "")
    : "";
  if (!usedHarness || activeAfterHarness !== String(index)) {
    const card = page.locator("#storyboardV2SceneList .storyboard-v2-card").nth(index);
    await card.click({ force: true });
    await page.waitForFunction(
      (activeIndex) => document.querySelector("#storyboardV2SceneList .storyboard-v2-card.active")?.dataset.storyboardV2Index === String(activeIndex),
      index,
      { timeout: 10000 }
    );
  } else {
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(
    (activeIndex) => document.querySelector("#storyboardV2Stage .storyboard-v2-film-shot.active")?.dataset.storyboardV2Index === String(activeIndex),
    index,
    { timeout: 10000 }
  );
  await waitForStoryboardStageHold(page);
  return snapshotStoryboardStage(page);
}

export async function selectLastStoryboardScene(page) {
  const count = await page.locator("#storyboardV2SceneList .storyboard-v2-card").count();
  if (!count) throw new Error("No storyboard scene cards found.");
  return selectStoryboardScene(page, count - 1);
}

export async function selectStoryboardSceneByIntent(page, intent) {
  const count = await page.locator("#storyboardV2SceneList .storyboard-v2-card").count();
  const availableIntents = [];
  for (let index = 0; index < count; index += 1) {
    const snapshot = await selectStoryboardScene(page, index);
    availableIntents.push(`${snapshot.dataset.intent || "(empty)"}:${snapshot.title || snapshot.text || "(untitled)"}`);
    if (snapshot.dataset.intent === intent) {
      return { index, snapshot };
    }
  }
  throw new Error(`No storyboard scene found for intent: ${intent}; available: ${availableIntents.join(", ")}`);
}

export async function selectStoryboardSceneByArticleRole(page, articleRole) {
  const count = await page.locator("#storyboardV2SceneList .storyboard-v2-card").count();
  for (let index = 0; index < count; index += 1) {
    const snapshot = await selectStoryboardScene(page, index);
    if (snapshot.dataset.articleRole === articleRole) {
      return { index, snapshot };
    }
  }
  throw new Error(`No storyboard scene found for article role: ${articleRole}`);
}

export async function selectStoryboardSceneByVisibleText(page, pattern) {
  const count = await page.locator("#storyboardV2SceneList .storyboard-v2-card").count();
  for (let index = 0; index < count; index += 1) {
    const snapshot = await selectStoryboardScene(page, index);
    if (pattern.test(`${snapshot.title || ""} ${snapshot.body || ""} ${snapshot.text || ""}`)) {
      return { index, snapshot };
    }
  }
  throw new Error(`No storyboard scene found for visible text pattern: ${pattern}`);
}

export async function snapshotStoryboardStage(page) {
  return page.evaluate(() => {
    const stage = document.querySelector("#storyboardV2Stage");
    const frame = stage?.querySelector(".storyboard-v2-film-shot.active.storyboard-v2-frame")
      || stage?.querySelector(".storyboard-v2-frame.active")
      || stage?.querySelector(".storyboard-v2-frame:not([aria-hidden='true'])")
      || stage?.querySelector(".storyboard-v2-frame");
    const queryRoot = frame || stage;
    const directorReview = document.querySelector("#storyboardV2DirectorReview");
    const visibleText = (root) => {
      if (!root) return "";
      const parts = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        const parent = textNode.parentElement;
        if (!parent || parent.closest("[hidden], [aria-hidden='true']")) continue;
        let visible = true;
        for (let node = parent; node && node !== root.parentElement; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") {
            visible = false;
            break;
          }
        }
        if (!visible) continue;
        const text = textNode.textContent.trim().replace(/\s+/g, " ");
        if (text) parts.push(text);
      }
      return parts.join(" ").replace(/\s+/g, " ").trim();
    };
    const textOf = (selector) => visibleText(queryRoot?.querySelector(selector));
    const rawTextOf = (selector) => (queryRoot?.querySelector(selector)?.textContent || "").trim().replace(/\s+/g, " ");
    const listText = (selector) =>
      [...(queryRoot?.querySelectorAll(selector) || [])].map((node) => node.textContent.trim().replace(/\s+/g, " ")).filter(Boolean);
    const rectOf = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        left: Number(rect.left.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        bottom: Number(rect.bottom.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      };
    };
    const styleOf = (node) => {
      if (!node) return {};
      const style = getComputedStyle(node);
      return {
        animationName: style.animationName,
        animationDelay: style.animationDelay,
        animationDuration: style.animationDuration,
        filter: style.filter,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        opacity: Number(style.opacity || 0),
        transform: style.transform,
      };
    };
    const dataset = {
      type: frame?.dataset.type || "",
      template: frame?.dataset.template || "",
      motion: frame?.dataset.motion || "",
      articleFilmEngine: stage?.dataset.articleFilmEngine || "",
      articleFilmShotCount: stage?.dataset.articleFilmShotCount || "",
      shotDirectorContract: frame?.dataset.shotDirectorContract || "",
      shotDirectorVariant: frame?.dataset.shotDirectorVariant || "",
      shotDirectorVisualGrammar: frame?.dataset.shotDirectorVisualGrammar || "",
      shotDirectorRepeatsPrevious: frame?.dataset.shotDirectorRepeatsPrevious || "",
      shotDirectorAntiRepeat: frame?.dataset.shotDirectorAntiRepeat || "",
      motionCueGraphContract: stage?.dataset.motionCueGraphContract || "",
      motionCueCount: frame?.dataset.motionCueCount || "",
      motionCueIds: frame?.dataset.motionCueIds || "",
      stageMotionCueCount: stage?.dataset.motionCueCount || "",
      repeatedGrammarCount: stage?.dataset.repeatedGrammarCount || "",
      timelineRuntimeContract: stage?.dataset.timelineRuntimeContract || "",
      timelineRuntimeShotCount: stage?.dataset.timelineRuntimeShotCount || "",
      timelineRuntimeTotalFrames: stage?.dataset.timelineRuntimeTotalFrames || "",
      intent: frame?.dataset.intent || "",
      transition: frame?.dataset.transition || "",
      contentRelation: frame?.dataset.contentRelation || "",
      contentRelationLabel: frame?.dataset.contentRelationLabel || "",
      motionBridge: frame?.dataset.motionBridge || "",
      rhythmContract: frame?.dataset.rhythmContract || "",
      rhythmId: frame?.dataset.rhythmId || "",
      rhythmEntrance: frame?.dataset.rhythmEntrance || "",
      rhythmOverlapMs: frame?.dataset.rhythmOverlapMs || "",
      rhythmStepDelayMs: frame?.dataset.rhythmStepDelayMs || "",
      rhythmEasing: frame?.dataset.rhythmEasing || "",
      rhythmRejectIf: frame?.dataset.rhythmRejectIf || "",
      rhythmMotifBridge: frame?.dataset.rhythmMotifBridge || "",
      motionArcNodeContract: frame?.dataset.motionArcNodeContract || "",
      motionArcPhase: frame?.dataset.motionArcPhase || "",
      motionArcEnergy: frame?.dataset.motionArcEnergy || "",
      motionArcHoldMs: frame?.dataset.motionArcHoldMs || "",
      motionArcOverlapMs: frame?.dataset.motionArcOverlapMs || "",
      motionArcTransition: frame?.dataset.motionArcTransition || "",
      motionArcNext: frame?.dataset.motionArcNext || "",
      arcPlaybackContract: frame?.dataset.arcPlaybackContract || "",
      arcPlaybackAnimationMs: frame?.dataset.arcPlaybackAnimationMs || "",
      arcPlaybackAdvanceMs: frame?.dataset.arcPlaybackAdvanceMs || "",
      arcPlaybackHoldMs: frame?.dataset.arcPlaybackHoldMs || "",
      arcPlaybackOverlapMs: frame?.dataset.arcPlaybackOverlapMs || "",
      arcPlaybackEnergy: frame?.dataset.arcPlaybackEnergy || "",
      arcPlaybackRejectIf: frame?.dataset.arcPlaybackRejectIf || "",
      arcTransitionContract: frame?.dataset.arcTransitionContract || "",
      arcTransitionIntent: frame?.dataset.arcTransitionIntent || "",
      arcTransitionEffect: frame?.dataset.arcTransitionEffect || "",
      arcTransitionDurationMs: frame?.dataset.arcTransitionDurationMs || "",
      arcTransitionDistancePx: frame?.dataset.arcTransitionDistancePx || "",
      arcTransitionEasing: frame?.dataset.arcTransitionEasing || "",
      arcTransitionRejectIf: frame?.dataset.arcTransitionRejectIf || "",
      continuityMotionChainContract: frame?.dataset.continuityMotionChainContract || "",
      continuityChainRole: frame?.dataset.continuityChainRole || "",
      continuityChainRelations: frame?.dataset.continuityChainRelations || "",
      continuityChainEffects: frame?.dataset.continuityChainEffects || "",
      continuityChainCurrentRelation: frame?.dataset.continuityChainCurrentRelation || "",
      continuityChainCurrentBridge: frame?.dataset.continuityChainCurrentBridge || "",
      continuityChainCurrentEffect: frame?.dataset.continuityChainCurrentEffect || "",
      continuityChainMarkers: frame?.dataset.continuityChainMarkers || "",
      continuityChainRejectIf: frame?.dataset.continuityChainRejectIf || "",
      globalMotionMotifContract: frame?.dataset.globalMotionMotifContract || "",
      globalMotionMotifId: frame?.dataset.globalMotionMotifId || "",
      globalMotionRhythm: frame?.dataset.globalMotionRhythm || "",
      articleRhythmContract: frame?.dataset.articleRhythmContract || "",
      articleShape: frame?.dataset.articleShape || "",
      articleRhythmCadence: frame?.dataset.articleRhythmCadence || "",
      articleMotionGrammar: frame?.dataset.articleMotionGrammar || "",
      articleTransitionBias: frame?.dataset.articleTransitionBias || "",
      articleTitleDensity: frame?.dataset.articleTitleDensity || "",
      articleShapeVisualContract: frame?.dataset.articleShapeVisualContract || "",
      articleShapeLayoutBias: frame?.dataset.articleShapeLayoutBias || "",
      articleShapeCompositionBias: frame?.dataset.articleShapeCompositionBias || "",
      articleShapeBackgroundBias: frame?.dataset.articleShapeBackgroundBias || "",
      globalMotionAccentStrategy: frame?.dataset.globalMotionAccentStrategy || "",
      globalMotionTransitionCount: frame?.dataset.globalMotionTransitionCount || "",
      globalMotionRejectIf: frame?.dataset.globalMotionRejectIf || "",
      globalMotionDirectives: frame?.dataset.globalMotionDirectives || "",
      globalMotionVerifiedActorCount: frame?.dataset.globalMotionVerifiedActorCount || "",
      globalMotionVerifiedActors: frame?.dataset.globalMotionVerifiedActors || "",
      actorContract: frame?.dataset.actorContract || "",
      actorCount: frame?.dataset.actorCount || "",
      motionActorPlanContract: frame?.dataset.motionActorPlanContract || "",
      motionActorVisualJob: frame?.dataset.motionActorVisualJob || "",
      motionActorRhythm: frame?.dataset.motionActorRhythm || "",
      motionActorCount: frame?.dataset.motionActorCount || "",
      motionActorTotalMs: frame?.dataset.motionActorTotalMs || "",
      layoutContract: frame?.dataset.layoutContract || "",
      layoutPrimitiveContract: frame?.dataset.layoutPrimitiveContract || "",
      layoutPrimitiveId: frame?.dataset.layoutPrimitiveId || "",
      layoutMode: frame?.dataset.layoutMode || "",
      layoutTitleSize: frame?.dataset.layoutTitleSize || "",
      layoutTitleLines: frame?.dataset.layoutTitleLines || "",
      layoutRoleRows: frame?.dataset.layoutRoleRows || "",
      layoutMethodRows: frame?.dataset.layoutMethodRows || "",
      methodVariant: frame?.dataset.methodVariant || "",
      evidenceVariant: frame?.dataset.evidenceVariant || "",
      externalTemplateContract: frame?.dataset.externalTemplateContract || "",
      externalTemplateSource: frame?.dataset.externalTemplateSource || "",
      externalTemplateReferenceOnly: frame?.dataset.externalTemplateReferenceOnly || "",
      layoutRejectIf: frame?.dataset.layoutRejectIf || "",
      layoutReasons: frame?.dataset.layoutReasons || "",
      continuityContract: frame?.dataset.continuityContract || "",
      continuityProgress: frame?.dataset.continuityProgress || "",
      continuityStrength: frame?.dataset.continuityStrength || "",
      continuityFrom: frame?.dataset.continuityFrom || "",
      continuityTo: frame?.dataset.continuityTo || "",
      continuitySignals: frame?.dataset.continuitySignals || "",
      continuityRejectIf: frame?.dataset.continuityRejectIf || "",
      continuityThreadContract: frame?.dataset.continuityThreadContract || "",
      continuityThreadKind: frame?.dataset.continuityThreadKind || "",
      continuityThreadActive: frame?.dataset.continuityThreadActive || "",
      continuityThreadMarkers: frame?.dataset.continuityThreadMarkers || "",
      continuityThreadRejectIf: frame?.dataset.continuityThreadRejectIf || "",
      spineContract: frame?.dataset.spineContract || "",
      spineArc: frame?.dataset.spineArc || "",
      spinePosition: frame?.dataset.spinePosition || "",
      spineCurrentRole: frame?.dataset.spineCurrentRole || "",
      spinePrevRole: frame?.dataset.spinePrevRole || "",
      spineNextRole: frame?.dataset.spineNextRole || "",
      spineRoleVariety: frame?.dataset.spineRoleVariety || "",
      spineHasProblem: frame?.dataset.spineHasProblem || "",
      spineHasMethod: frame?.dataset.spineHasMethod || "",
      spineHasClosing: frame?.dataset.spineHasClosing || "",
      articleRole: frame?.dataset.articleRole || "",
      articleContextMode: frame?.dataset.articleContextMode || "",
      storyRole: frame?.dataset.storyRole || "",
      typographyLevel: frame?.dataset.typographyLevel || "",
      typographyReasons: frame?.dataset.typographyReasons || "",
      composition: frame?.dataset.composition || "",
      background: frame?.dataset.background || "",
      backgroundStyle: frame?.dataset.backgroundStyle || "",
      visualRegister: frame?.dataset.visualRegister || "",
      scale: frame?.dataset.scale || "",
      contrast: frame?.dataset.contrast || "",
      hierarchy: frame?.dataset.hierarchy || "",
      motionEnergy: frame?.dataset.motionEnergy || "",
      motionPrimitive: frame?.dataset.motionPrimitive || "",
      advancedMotionSource: frame?.dataset.advancedMotionSource || "",
      advancedMotionTechnique: frame?.dataset.advancedMotionTechnique || "",
      advancedMotionDiscipline: frame?.dataset.advancedMotionDiscipline || "",
    };
    const roleRows = [...(queryRoot?.querySelectorAll(".storyboard-v2-role-flow li") || [])].map((row) => ({
      row: rectOf(row),
      icon: rectOf(row.querySelector(".storyboard-v2-role-icon")),
      iconSurface: rectOf(row.querySelector(".storyboard-v2-role-icon-surface")),
      iconSvg: rectOf(row.querySelector(".storyboard-v2-role-icon svg, .storyboard-v2-role-monogram")),
      name: rectOf(row.querySelector("strong")),
      task: rectOf(row.querySelector(":scope > span:last-child")),
      nameText: row.querySelector("strong")?.textContent.trim().replace(/\s+/g, " ") || "",
      taskText: row.querySelector(":scope > span:last-child")?.textContent.trim().replace(/\s+/g, " ") || "",
      nameColor: getComputedStyle(row.querySelector("strong")).color,
      taskColor: getComputedStyle(row.querySelector(":scope > span:last-child")).color,
      entity: row.dataset.entity || "",
      assetSource: row.dataset.assetSource || "",
      assetSourceUrl: row.dataset.assetSourceUrl || "",
      assetLicense: row.dataset.assetLicense || "",
      assetVerified: row.dataset.assetVerified === "true",
      assetConfidence: Number(row.dataset.assetConfidence || 0),
      assetFallback: row.dataset.assetFallback === "true",
      assetType: row.dataset.assetType || "",
      assetVariant: row.dataset.assetVariant || "",
      iconBackground: getComputedStyle(row.querySelector(".storyboard-v2-role-icon-surface") || row.querySelector(".storyboard-v2-role-icon")).backgroundColor,
      iconColor: getComputedStyle(row.querySelector(".storyboard-v2-role-icon-surface") || row.querySelector(".storyboard-v2-role-icon")).color,
      motionActors: [...row.querySelectorAll("[data-motion-actor]")].map((node) => node.dataset.motionActor || "").filter(Boolean),
      text: row.textContent.trim().replace(/\s+/g, " "),
    }));
    const methodRows = [...(queryRoot?.querySelectorAll(".storyboard-v2-method-flow li") || [])].map((row) => ({
      row: rectOf(row),
      text: row.textContent.trim().replace(/\s+/g, " "),
      motionActor: row.dataset.motionActor || "",
      actorId: row.dataset.actorId || "",
      actorRole: row.dataset.actorRole || "",
      actorDelay: Number(row.dataset.actorDelay || 0),
      actorDuration: Number(row.dataset.actorDuration || 0),
    }));
    const actors = [...(queryRoot?.querySelectorAll("[data-actor-contract='A1ActorPlan/v1']:not(.storyboard-v2-frame)") || [])].map((node) => ({
      id: node.dataset.actorId || "",
      role: node.dataset.actorRole || "",
      phase: node.dataset.actorPhase || "",
      rhythm: node.dataset.actorRhythm || "",
      animation: node.dataset.actorAnimation || "",
      easing: node.dataset.actorEasing || "",
      order: Number(node.dataset.actorOrder || 0),
      slot: node.dataset.actorSlot || "",
      delay: Number(node.dataset.actorDelay || 0),
      duration: Number(node.dataset.actorDuration || 0),
      finalState: node.dataset.actorFinalState || "",
      rejectIf: node.dataset.actorRejectIf || "",
      motionActor: node.dataset.motionActor || "",
      text: node.textContent.trim().replace(/\s+/g, " "),
      style: styleOf(node),
      rect: rectOf(node),
    }));
    const actorThread = [...(queryRoot?.querySelectorAll(".storyboard-v2-actor-thread .storyboard-v2-actor-thread-icon") || [])].map((node) => ({
      entity: node.dataset.entity || "",
      source: node.dataset.assetSource || "",
      fallback: node.dataset.assetFallback === "true",
      rect: rectOf(node),
      svg: rectOf(node.querySelector("svg")),
      text: node.textContent.trim().replace(/\s+/g, " "),
      style: styleOf(node),
      color: getComputedStyle(node).color,
    }));
    const continuityThreadNode = queryRoot?.querySelector(".storyboard-v2-continuity-thread");
    const continuityMotionChainNode = queryRoot?.querySelector(".storyboard-v2-continuity-motion-chain");
    const continuityMotionChainStyle = continuityMotionChainNode ? getComputedStyle(continuityMotionChainNode) : null;
    const continuityThreadStyle = continuityThreadNode ? getComputedStyle(continuityThreadNode) : null;
    const continuityThreadItems = [...(continuityThreadNode?.querySelectorAll("[data-thread-marker]") || [])].map((node) => ({
      marker: node.dataset.threadMarker || "",
      active: node.dataset.threadMarkerActive === "true",
      rect: rectOf(node),
      text: node.textContent.trim().replace(/\s+/g, " "),
    }));
    const titleLineDetails = [...(queryRoot?.querySelectorAll(".storyboard-v2-title span") || [])]
      .map((node) => ({
        text: node.textContent.trim().replace(/\s+/g, " "),
        role: node.dataset.titleLineRole || "",
        rect: rectOf(node),
        style: styleOf(node),
      }))
      .filter((item) => item.text);
    const compactCjkSpacing = (value = "") => {
      let next = value;
      for (let index = 0; index < 4; index += 1) next = next.replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/gu, "$1$2");
      return next;
    };
    const firstVisibleTextOf = (selector) => [...(queryRoot?.querySelectorAll(selector) || [])]
      .map((node) => visibleText(node))
      .find(Boolean) || "";
    const titleText = compactCjkSpacing(firstVisibleTextOf(".storyboard-v2-title, .storyboard-v2-resolve-title, .storyboard-v2-image-evidence-note strong, .storyboard-v2-rve-template-title"));
    const bodyText = compactCjkSpacing(firstVisibleTextOf(".storyboard-v2-body, .storyboard-v2-resolve-memory, .storyboard-v2-image-evidence-note em, .storyboard-v2-rve-template-body"));
    const imageEvidenceText = [
      textOf(".storyboard-v2-image-evidence-note") || rawTextOf(".storyboard-v2-image-evidence-note"),
      textOf(".storyboard-v2-image-evidence-source") || rawTextOf(".storyboard-v2-image-evidence-source"),
      textOf(".storyboard-v2-image-evidence-provenance") || rawTextOf(".storyboard-v2-image-evidence-provenance"),
      textOf(".storyboard-v2-image-evidence-readout") || rawTextOf(".storyboard-v2-image-evidence-readout"),
    ].filter(Boolean).join(" ").trim();
    const stageText = visibleText(queryRoot) || [titleText, bodyText, imageEvidenceText].filter(Boolean).join(" ").trim();
    return {
      text: stageText,
      dataset,
      title: titleText,
      titleLines: titleLineDetails.map((item) => item.text),
      titleLineDetails,
      body: bodyText,
      accent: textOf(".storyboard-v2-accent"),
      caption: textOf(".storyboard-v2-caption"),
      imageEvidenceText,
      methodFlowItems: listText(".storyboard-v2-method-flow li"),
      roleFlowItems: roleRows.map((row) => `${row.nameText} ${row.taskText}`.trim()),
      sequenceItems: listText(".storyboard-v2-sequence li"),
      dataVizCount: queryRoot?.querySelectorAll(".storyboard-v2-data-viz i").length || 0,
      mediaVizCount: queryRoot?.querySelectorAll(".storyboard-v2-media-viz").length || 0,
      realAssetCount: queryRoot?.querySelectorAll(".storyboard-v2-real-asset").length || 0,
      imageEvidenceLayerCount: queryRoot?.querySelectorAll(".storyboard-v2-image-evidence [data-evidence-layer]").length || 0,
      imageEvidenceGateCount: queryRoot?.querySelectorAll(".storyboard-v2-image-evidence-gate i").length || 0,
      imageEvidenceReadoutCount: queryRoot?.querySelectorAll(".storyboard-v2-image-evidence-readout").length || 0,
      imageEvidenceSourceCount: queryRoot?.querySelectorAll(".storyboard-v2-image-evidence-source").length || 0,
      imageEvidenceProvenanceCount: queryRoot?.querySelectorAll(".storyboard-v2-image-evidence-provenance").length || 0,
      imageEvidenceNoteCount: queryRoot?.querySelectorAll(".storyboard-v2-image-evidence-note").length || 0,
      kineticLayerStackContract: queryRoot?.querySelector(".storyboard-v2-kinetic-system")?.dataset.kineticLayerStackContract || "",
      kineticComposition: queryRoot?.querySelector(".storyboard-v2-kinetic-system")?.dataset.kineticComposition || "",
      kineticLayerCount: queryRoot?.querySelectorAll(".storyboard-v2-kinetic-system [data-kinetic-layer]").length || 0,
      kineticTitleWordCount: queryRoot?.querySelectorAll(".storyboard-v2-kinetic-title .storyboard-v2-kinetic-word").length || 0,
      kineticPhraseLaneCount: queryRoot?.querySelectorAll(".storyboard-v2-kinetic-phrase-lane").length || 0,
      kineticTokenCount: queryRoot?.querySelectorAll(".storyboard-v2-kinetic-token[data-kinetic-token='true']").length || 0,
      kineticPrimaryTokenCount: queryRoot?.querySelectorAll(".storyboard-v2-kinetic-token[data-kinetic-token-emphasis='primary']").length || 0,
      vectorComposition: queryRoot?.querySelector(".storyboard-v2-vector-explainer")?.dataset.vectorComposition || "",
      vectorLayerCount: queryRoot?.querySelectorAll(".storyboard-v2-vector-explainer [data-vector-layer]").length || 0,
      vectorOrbitalLayerCount: queryRoot?.querySelectorAll(".storyboard-v2-vector-orbital-baseline, .storyboard-v2-vector-lunar-anchor, .storyboard-v2-vector-orbit-depth-matte").length || 0,
      vectorCalibrationLayerCount: queryRoot?.querySelectorAll(".storyboard-v2-vector-calibration-rack, .storyboard-v2-vector-correction-rail, .storyboard-v2-vector-scan-aperture").length || 0,
      realAssetFocalContract: stage?.querySelector(".storyboard-v2-real-asset")?.dataset.focalContract || "",
      realAssetCropMode: stage?.querySelector(".storyboard-v2-real-asset")?.dataset.cropMode || "",
      realAssetFocalSource: stage?.querySelector(".storyboard-v2-real-asset")?.dataset.focalSource || "",
      realAssetFocalConfidence: stage?.querySelector(".storyboard-v2-real-asset")?.dataset.focalConfidence || "",
      realAssetCropWindow: {
        x: stage?.querySelector(".storyboard-v2-real-asset")?.dataset.cropWindowX || "",
        y: stage?.querySelector(".storyboard-v2-real-asset")?.dataset.cropWindowY || "",
        width: stage?.querySelector(".storyboard-v2-real-asset")?.dataset.cropWindowWidth || "",
        height: stage?.querySelector(".storyboard-v2-real-asset")?.dataset.cropWindowHeight || "",
      },
      actorThreadCount: actorThread.length,
      actorThreadEntities: actorThread.map((item) => item.entity).filter(Boolean),
      geometry: {
        stage: rectOf(stage),
        frame: rectOf(frame),
        content: rectOf(queryRoot?.querySelector(".storyboard-v2-content")),
        title: rectOf(queryRoot?.querySelector(".storyboard-v2-title")),
        titleSpan: rectOf(queryRoot?.querySelector(".storyboard-v2-title span")),
        body: rectOf(queryRoot?.querySelector(".storyboard-v2-body")),
        bodyStyle: styleOf(queryRoot?.querySelector(".storyboard-v2-body")),
        bodyClientRects: [...(queryRoot?.querySelector(".storyboard-v2-body")?.getClientRects() || [])].map((rect) => ({
          left: Number(rect.left.toFixed(2)),
          top: Number(rect.top.toFixed(2)),
          right: Number(rect.right.toFixed(2)),
          bottom: Number(rect.bottom.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        })),
        titleStyle: styleOf(queryRoot?.querySelector(".storyboard-v2-title")),
        realAsset: rectOf(queryRoot?.querySelector(".storyboard-v2-real-asset")),
        realAssetImage: rectOf(queryRoot?.querySelector(".storyboard-v2-real-asset img")),
        realAssetStyle: queryRoot?.querySelector(".storyboard-v2-real-asset img")?.getAttribute("style") || "",
        methodFlow: rectOf(queryRoot?.querySelector(".storyboard-v2-method-flow")),
        methodRows,
        roleFlow: rectOf(queryRoot?.querySelector(".storyboard-v2-role-flow")),
        roleRows,
        actors,
        actorThread: rectOf(queryRoot?.querySelector(".storyboard-v2-actor-thread")),
        actorThreadItems: actorThread,
        continuityThread: rectOf(continuityThreadNode),
        continuityMotionChain: rectOf(continuityMotionChainNode),
        continuityMotionChainStyle: continuityMotionChainStyle ? {
          opacity: Number(continuityMotionChainStyle.opacity || 0),
          width: continuityMotionChainStyle.width,
          height: continuityMotionChainStyle.height,
        } : null,
        continuityThreadItems,
        continuityThreadStyle: continuityThreadStyle ? {
          opacity: Number(continuityThreadStyle.opacity || 0),
          width: continuityThreadStyle.width,
          height: continuityThreadStyle.height,
        } : {},
      },
      decorativeText: [...(queryRoot?.querySelectorAll("[aria-hidden='true']") || [])]
        .map((node) => node.textContent.trim().replace(/\s+/g, " "))
        .filter(Boolean),
      director: {
        motionDirectorV2: directorReview?.dataset.motionDirectorV2 === "true",
        contract: directorReview?.dataset.motionDirectorContract || "",
        contentGraphContract: directorReview?.dataset.contentGraphContract || "",
        globalMotionMotifContract: directorReview?.dataset.globalMotionMotifContract || "",
        globalMotionMotifId: directorReview?.dataset.globalMotionMotifId || "",
        globalMotionRhythm: directorReview?.dataset.globalMotionRhythm || "",
        globalMotionAccentStrategy: directorReview?.dataset.globalMotionAccentStrategy || "",
        globalMotionTransitionCount: directorReview?.dataset.globalMotionTransitionCount || "",
        globalMotionRejectIf: directorReview?.dataset.globalMotionRejectIf || "",
        text: directorReview?.textContent.trim().replace(/\s+/g, " ") || "",
        fields: [...(directorReview?.querySelectorAll("[data-director-v2-field]") || [])].map((node) => ({
          field: node.dataset.directorV2Field || "",
          label: node.querySelector("span")?.textContent.trim().replace(/\s+/g, " ") || "",
          value: node.querySelector("strong, b")?.textContent.trim().replace(/\s+/g, " ") || "",
        })).filter((item) => item.field || item.value),
        assetBrief: (() => {
          const node = directorReview?.querySelector("[data-director-v2-asset-brief]");
          return node ? {
            contract: node.dataset.directorV2AssetBrief || "",
            expectedRoles: (node.dataset.assetBriefExpectedRoles || "").split(",").filter(Boolean),
            candidateCount: Number(node.dataset.assetBriefCandidateCount || 0),
            needsWebLookup: node.dataset.assetBriefNeedsWebLookup === "true",
            renderableCandidateCount: Number(node.dataset.assetBriefRenderableCount || 0),
            label: node.querySelector("span")?.textContent.trim().replace(/\s+/g, " ") || "",
            value: node.querySelector("strong, b")?.textContent.trim().replace(/\s+/g, " ") || "",
          } : null;
        })(),
        discoveryQueue: (() => {
          const node = directorReview?.querySelector("[data-director-v2-discovery-queue]");
          return node ? {
            contract: node.dataset.directorV2DiscoveryQueue || "",
            firstKinds: (node.dataset.discoveryQueueFirstKinds || "").split(",").filter(Boolean),
            firstIds: (node.dataset.discoveryQueueFirstIds || "").split(",").filter(Boolean),
            count: Number(node.dataset.discoveryQueueCount || 0),
            label: node.querySelector("em")?.textContent.trim().replace(/\s+/g, " ") || "",
            value: node.querySelector("strong, b")?.textContent.trim().replace(/\s+/g, " ") || "",
          } : null;
        })(),
        evidenceSummary: (() => {
          const node = directorReview?.querySelector("[data-director-v2-evidence-summary]");
          return node ? {
            contract: node.dataset.directorV2EvidenceSummary || "",
            qualityContract: node.dataset.evidenceSummaryQualityContract || "",
            qualityLevel: node.dataset.evidenceSummaryQualityLevel || "",
            needsHumanReview: node.dataset.evidenceSummaryNeedsHumanReview === "true",
            reasons: (node.dataset.evidenceSummaryReasons || "").split(",").filter(Boolean),
            repoCount: Number(node.dataset.evidenceSummaryRepoCount || 0),
            repoFallbackCount: Number(node.dataset.evidenceSummaryRepoFallbackCount || 0),
            fallbackCount: Number(node.dataset.evidenceSummaryFallbackCount || 0),
            diagnosticCount: Number(node.dataset.evidenceSummaryDiagnosticCount || 0),
            retryableCount: Number(node.dataset.evidenceSummaryRetryableCount || 0),
            webpageCount: Number(node.dataset.evidenceSummaryWebpageCount || 0),
            renderAllowedCount: Number(node.dataset.evidenceSummaryRenderAllowedCount || 0),
            label: node.querySelector("em")?.textContent.trim().replace(/\s+/g, " ") || "",
            value: node.querySelector("strong, b")?.textContent.trim().replace(/\s+/g, " ") || "",
          } : null;
        })(),
        assetReview: [...(directorReview?.querySelectorAll("[data-director-v2-asset]") || [])].map((node) => ({
          id: node.dataset.directorV2Asset || "",
          status: node.dataset.assetStatus || "",
          renderAllowed: node.dataset.assetRenderAllowed === "true",
          needsPromotion: node.dataset.assetNeedsPromotion === "true",
          kind: node.dataset.assetKind || "",
          source: node.dataset.assetSource || "",
          evidenceContract: node.dataset.assetEvidenceContract || "",
          evidenceSummary: node.dataset.assetEvidenceSummary || "",
          diagnosticContract: node.dataset.assetDiagnosticContract || "",
          diagnosticSummary: node.dataset.assetDiagnosticSummary || "",
          failureKind: node.dataset.assetFailureKind || "",
          retryable: node.dataset.assetRetryable === "true",
          assignmentScore: Number(node.dataset.assetAssignmentScore || 0),
          assignmentReason: node.dataset.assetAssignmentReason || "",
          assignedSceneIndex: Number(node.dataset.assetAssignedSceneIndex || -1),
          assignmentGraph: node.dataset.assetAssignmentGraph || "",
          label: node.querySelector("strong")?.textContent.trim().replace(/\s+/g, " ") || "",
          statusLabel: node.querySelector("em")?.textContent.trim().replace(/\s+/g, " ") || "",
          meta: node.querySelector("small")?.textContent.trim().replace(/\s+/g, " ") || "",
        })).filter((item) => item.id || item.label),
      },
      graphEditInputs: {
        role: document.querySelector("#storyboardV2GraphRole")?.value || "",
        from: document.querySelector("#storyboardV2GraphFrom")?.value || "",
        purpose: document.querySelector("#storyboardV2GraphPurpose")?.value || "",
        to: document.querySelector("#storyboardV2GraphTo")?.value || "",
      },
      continuityDraftPreview: {
        contract: document.querySelector("#storyboardV2ContinuityDraftPreview [data-continuity-draft-contract]")?.dataset.continuityDraftContract || "",
        role: document.querySelector("#storyboardV2ContinuityDraftPreview [data-continuity-draft-contract]")?.dataset.continuityDraftRole || "",
        template: document.querySelector("#storyboardV2ContinuityDraftPreview [data-continuity-draft-contract]")?.dataset.continuityDraftTemplate || "",
        motion: document.querySelector("#storyboardV2ContinuityDraftPreview [data-continuity-draft-contract]")?.dataset.continuityDraftMotion || "",
        bridge: document.querySelector("#storyboardV2ContinuityDraftPreview [data-continuity-draft-contract]")?.dataset.continuityDraftBridge || "",
        sectionContract: document.querySelector("#storyboardV2ContinuityDraftPreview [data-continuity-section-contract]")?.dataset.continuitySectionContract || "",
        sectionCount: document.querySelector("#storyboardV2ContinuityDraftPreview [data-continuity-section-count]")?.dataset.continuitySectionCount || "",
        text: document.querySelector("#storyboardV2ContinuityDraftPreview")?.textContent.trim().replace(/\s+/g, " ") || "",
        rows: [...document.querySelectorAll("#storyboardV2ContinuityDraftPreview [data-continuity-draft-row]")].map((node) => ({
          role: node.dataset.continuityDraftRow || "",
          label: node.querySelector("em")?.textContent.trim().replace(/\s+/g, " ") || "",
          value: node.querySelector("strong")?.textContent.trim().replace(/\s+/g, " ") || "",
          impact: node.querySelector("b")?.textContent.trim().replace(/\s+/g, " ") || "",
        })),
      },
      inspectorInputs: {
        title: document.querySelector("#storyboardV2Headline")?.value || "",
        body: document.querySelector("#storyboardV2Body")?.value || "",
        accent: document.querySelector("#storyboardV2Accent")?.value || "",
        type: document.querySelector("#storyboardV2Type")?.value || "",
        template: document.querySelector("#storyboardV2Template")?.value || "",
        motion: document.querySelector("#storyboardV2Motion")?.value || "",
      },
      choiceState: {
        templates: [...document.querySelectorAll("#storyboardV2TemplateChoices [data-storyboard-v2-template]")].map((node) => ({
          id: node.dataset.storyboardV2Template || "",
          active: node.classList.contains("active"),
          text: node.textContent.trim().replace(/\s+/g, " "),
        })),
        motions: [...document.querySelectorAll("#storyboardV2MotionChoices [data-storyboard-v2-motion]")].map((node) => ({
          id: node.dataset.storyboardV2Motion || "",
          active: node.classList.contains("active"),
          text: node.textContent.trim().replace(/\s+/g, " "),
        })),
      },
      choiceRationale: {
        contract: document.querySelector("#storyboardV2ChoiceRationale [data-choice-rationale-contract]")?.dataset.choiceRationaleContract || "",
        text: document.querySelector("#storyboardV2ChoiceRationale")?.textContent.trim().replace(/\s+/g, " ") || "",
        rows: [...document.querySelectorAll("#storyboardV2ChoiceRationale [data-choice-rationale-role]")].map((node) => ({
          role: node.dataset.choiceRationaleRole || "",
          label: node.querySelector("em")?.textContent.trim().replace(/\s+/g, " ") || "",
          value: node.querySelector("strong")?.textContent.trim().replace(/\s+/g, " ") || "",
          impact: node.querySelector("b")?.textContent.trim().replace(/\s+/g, " ") || "",
          source: node.querySelector("i")?.textContent.trim().replace(/\s+/g, " ") || "",
        })),
      },
      neighborImpact: {
        contract: document.querySelector("#storyboardV2NeighborImpact [data-neighbor-impact-contract]")?.dataset.neighborImpactContract || "",
        bridge: document.querySelector("#storyboardV2NeighborImpact [data-neighbor-impact-contract]")?.dataset.neighborImpactBridge || "",
        text: document.querySelector("#storyboardV2NeighborImpact")?.textContent.trim().replace(/\s+/g, " ") || "",
        debug: {
          globalHandler: typeof window.a1StoryboardV2GoToNeighbor,
          lastJump: window.__A1_LAST_NEIGHBOR_JUMP__ || null,
        },
        rows: [...document.querySelectorAll("#storyboardV2NeighborImpact [data-neighbor-impact-role]")].map((node) => ({
          role: node.dataset.neighborImpactRole || "",
          targetIndex: node.dataset.neighborImpactTarget || "",
          interactive: node.tagName === "BUTTON",
          hasOnClick: typeof node.onclick === "function",
          hasOnPointerDown: typeof node.onpointerdown === "function",
          label: node.querySelector("em")?.textContent.trim().replace(/\s+/g, " ") || "",
          title: node.querySelector("strong")?.textContent.trim().replace(/\s+/g, " ") || "",
          impact: node.querySelector("b")?.textContent.trim().replace(/\s+/g, " ") || "",
          source: node.querySelector("i")?.textContent.trim().replace(/\s+/g, " ") || "",
        })),
      },
      cardCount: document.querySelectorAll("#storyboardV2SceneList .storyboard-v2-card").length,
      activeCardIndex: document.querySelector("#storyboardV2SceneList .storyboard-v2-card.active")?.dataset.storyboardV2Index || "",
      activeCardText: document.querySelector("#storyboardV2SceneList .storyboard-v2-card.active")?.textContent.trim().replace(/\s+/g, " ") || "",
      editHistory: {
        text: document.querySelector("#storyboardV2EditHistory")?.textContent.trim().replace(/\s+/g, " ") || "",
        hasRestoreButton: Boolean(document.querySelector("#storyboardV2RestoreEditBtn")),
        entries: [...document.querySelectorAll("#storyboardV2EditHistory [data-edit-contract]")].map((node) => ({
          contract: node.dataset.editContract || "",
          label: node.querySelector("strong")?.textContent.trim().replace(/\s+/g, " ") || "",
          fields: node.querySelector("span")?.textContent.trim().replace(/\s+/g, " ") || "",
        })),
      },
    };
  });
}

function rectsOverlap(a, b, gap = 0) {
  if (!a || !b) return false;
  return !(
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  );
}

function rectCenter(rect = {}) {
  if (!rect) return null;
  return {
    x: (Number(rect.left) + Number(rect.right)) / 2,
    y: (Number(rect.top) + Number(rect.bottom)) / 2,
  };
}

function rectWithin(inner, outer, tolerance = 0) {
  if (!inner || !outer) return true;
  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance
  );
}

function rgbLuma(color = "") {
  const match = String(color || "").match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/u);
  if (!match) return null;
  const [, r, g, b] = match.map(Number);
  if (![r, g, b].every(Number.isFinite)) return null;
  return Number((0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(2));
}

export async function captureStoryboardStage(page, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await waitForStoryboardStageHold(page);
  await page.locator("#storyboardV2Stage").screenshot({ path: outputPath });
  return outputPath;
}

export async function captureStoryboardPage(page, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await waitForStoryboardStageHold(page);
  await page.screenshot({ path: outputPath, fullPage: true });
  return outputPath;
}

export async function waitForStoryboardStageHold(page, waitMs = 860) {
  await page.waitForFunction(
    () => {
      const frame = document.querySelector("#storyboardV2Stage .storyboard-v2-frame");
      if (!frame) return false;
      const visibleText = frame.textContent.trim().replace(/\s+/g, " ");
      return Boolean(frame.dataset.intent || frame.dataset.storyRole || visibleText);
    },
    null,
    { timeout: 5000 }
  );
  await page.waitForTimeout(waitMs);
}

export async function captureStoryboardMotionFrames(page, artifactDir, label = "motion") {
  await fs.mkdir(artifactDir, { recursive: true });
  const stageSelector = "#storyboardV2Stage";
  const frames = [
    { phase: "start", waitMs: 0 },
    { phase: "mid", waitMs: 240 },
    // Final proof must be a readable hold frame after the slowest staggered actor
    // has finished, not a near-final entrance frame.
    { phase: "final", waitMs: 1240 },
  ];
  await page.evaluate((selector) => {
    const stage = document.querySelector(selector);
    stage?.classList.remove("is-playing");
    // Force style recalc so replaying the same scene restarts deterministic CSS animations.
    void stage?.offsetWidth;
    stage?.classList.add("is-playing");
  }, stageSelector);

  const output = [];
  let elapsed = 0;
  for (const frame of frames) {
    const wait = Math.max(0, frame.waitMs - elapsed);
    if (wait) await page.waitForTimeout(wait);
    elapsed = frame.waitMs;
    if (frame.phase === "final") {
      await page.waitForFunction((selector) => {
        const actors = [...(document.querySelector(selector)?.querySelectorAll("[data-motion-actor]") || [])];
        if (!actors.length) return true;
        return actors.every((node) => {
          const style = getComputedStyle(node);
          const transform = style.transform || "none";
          const isIdentity = transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)" || transform === "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)";
          return Number(style.opacity || 0) >= 0.99 && isIdentity;
        });
      }, stageSelector, { timeout: 1800 }).catch(() => {});
    }
    const screenshot = path.join(artifactDir, `${label}-${frame.phase}.png`);
    await page.locator(stageSelector).screenshot({ path: screenshot });
    const snapshot = await snapshotStoryboardStage(page);
    const actorStates = await page.evaluate((selector) => {
      const stage = document.querySelector(selector);
      const activeShot = stage?.querySelector(".storyboard-v2-film-shot.active") || stage;
      return [...(activeShot?.querySelectorAll("[data-motion-actor]") || [])].map((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          actor: node.dataset.motionActor || "",
          text: node.textContent.trim().replace(/\s+/g, " "),
          opacity: Number(style.opacity || 0),
          transform: style.transform,
          filter: style.filter,
          animationName: style.animationName,
          animationDelay: style.animationDelay,
          animationDuration: style.animationDuration,
          rect: {
            left: Number(rect.left.toFixed(2)),
            top: Number(rect.top.toFixed(2)),
            right: Number(rect.right.toFixed(2)),
            bottom: Number(rect.bottom.toFixed(2)),
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2)),
          },
        };
      });
    }, stageSelector);
    output.push({
      phase: frame.phase,
      elapsedMs: frame.waitMs,
      screenshot,
      snapshot,
      actorStates,
    });
  }
  await page.evaluate((selector) => document.querySelector(selector)?.classList.remove("is-playing"), stageSelector);
  return output;
}

export function assertStoryboardStageQuality(snapshot, options = {}) {
  const {
    requireNoChromeText = true,
    forbidFakeData = true,
    forbidFakeMedia = true,
    forbidSequenceForRoles = true,
    failures = [],
  } = options;
  const fail = (message) => failures.push(message);
  const stageLeaksInspectorText = (value = "") => {
    const needle = String(value || "").trim();
    const haystack = String(snapshot?.text || "");
    if (!needle) return false;
    if (/^[a-z][a-z0-9_-]{1,24}$/iu.test(needle)) {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\p{L}\\p{N}_-])${escaped}($|[^\\p{L}\\p{N}_-])`, "iu").test(haystack);
    }
    return haystack.includes(needle);
  };

  if (!snapshot?.text) fail("stage text is empty");
  if (requireNoChromeText && storyboardChromeTextPattern.test(snapshot.text)) {
    fail(`stage contains editor/export chrome text: ${snapshot.text}`);
  }
  if (/[，,、；;：:]\s*[。.!！?？]|[。.!！?？]{2,}/u.test(snapshot.title || "") || /[，,、；;：:]\s*[。.!！?？]|[。.!！?？]{2,}/u.test(snapshot.body || "")) {
    fail(`stage text contains broken punctuation cleanup: ${JSON.stringify({ title: snapshot.title, body: snapshot.body })}`);
  }
  if (snapshot.decorativeText?.some((text) => text && storyboardChromeTextPattern.test(text))) {
    fail(`decorative aria-hidden text leaked chrome: ${snapshot.decorativeText.join(" ")}`);
  }
  const explicitDataVizScene = snapshot.dataset.type === "data" && snapshot.dataset.template === "data-split";
  if (forbidFakeData && snapshot.dataVizCount > 0 && !snapshot.dataset.intent?.includes("data") && !explicitDataVizScene) {
    fail(`non-data scene rendered fake data visualization: ${JSON.stringify(snapshot.dataset)}`);
  }
  if (forbidFakeMedia && snapshot.mediaVizCount > 0 && snapshot.realAssetCount === 0) {
    fail("stage rendered synthetic media without a real asset");
  }
  if (forbidSequenceForRoles && snapshot.dataset.intent === "roles" && snapshot.sequenceItems.length > 0) {
    fail(`roles scene rendered numbered sequence UI: ${snapshot.sequenceItems.join(" / ")}`);
  }
  if ((snapshot.dataset.storyRole === "closing" || snapshot.dataset.intent === "closing") && snapshot.sequenceItems.length > 0) {
    fail(`closing scene rendered numbered sequence UI: ${snapshot.sequenceItems.join(" / ")}`);
  }
  if ((snapshot.dataset.storyRole === "closing" || snapshot.dataset.intent === "closing") && snapshot.dataset.type === "word-sequence") {
    fail(`closing scene inherited word-sequence type instead of closing stage type: ${JSON.stringify(snapshot.dataset)}`);
  }
  const bodyRect = snapshot.geometry?.body || {};
  const methodFlowOwnsContent = snapshot.dataset.layoutMode === "method-flow" && (snapshot.methodFlowItems || []).length >= 2;
  const roleGridOwnsContent = ["role-grid", "role-pair"].includes(snapshot.dataset.layoutMode || "") && (snapshot.roleFlowItems || []).length >= 2;
  const causeChainOwnsContext = snapshot.dataset.layoutMode === "cause-chain"
    && snapshot.dataset.contentRelation === "cause"
    && snapshot.dataset.motionBridge === "because-shift";
  const requiresSupportLine =
    (["point", "diagnosis"].includes(snapshot.dataset.intent || "") && !causeChainOwnsContext && !roleGridOwnsContent) ||
    (["problem", "turn"].includes(snapshot.dataset.articleRole || "") && !methodFlowOwnsContent && !causeChainOwnsContext && !roleGridOwnsContent) ||
    (snapshot.dataset.typographyLevel === "split-required" && !["method-flow", "role-grid", "role-pair", "image-focus", "closing-hold", "cause-chain"].includes(snapshot.dataset.layoutMode || ""));
  if (requiresSupportLine) {
    if (!snapshot.body || Number(bodyRect.width || 0) <= 0 || Number(bodyRect.height || 0) <= 0) {
      fail(`article text scene needs a visible support line, not a standalone title card: ${JSON.stringify({ title: snapshot.title, body: snapshot.body, dataset: snapshot.dataset, bodyRect, bodyStyle: snapshot.geometry?.bodyStyle, bodyClientRects: snapshot.geometry?.bodyClientRects })}`);
    }
    if (!["title-support", "support-line"].includes(snapshot.dataset.articleContextMode || "")) {
      fail(`article text scene missing article context mode: ${JSON.stringify(snapshot.dataset)}`);
    }
  }
  if (snapshot.dataset.layoutMode === "method-flow") {
    const titleChars = Array.from(snapshot.title || "").length;
    if (!snapshot.title || titleChars < 2) {
      fail(`method-flow needs a visible short action title, not only step rows: ${JSON.stringify({ title: snapshot.title, methodFlowItems: snapshot.methodFlowItems, dataset: snapshot.dataset })}`);
    }
    if ((snapshot.methodFlowItems || []).length < 2) {
      fail(`method-flow needs at least two user-derived step rows: ${JSON.stringify({ title: snapshot.title, methodFlowItems: snapshot.methodFlowItems, dataset: snapshot.dataset })}`);
    }
    if (titleChars > 12) {
      fail(`method-flow title should be a short action phrase, not a long sentence: ${snapshot.title}`);
    }
    if (/(一个|一种|一类|一点|这个)$/u.test(snapshot.title || "")) {
      fail(`method-flow title ends with an orphan quantifier/object fragment: ${snapshot.title}`);
    }
    if (snapshot.dataset.methodVariant !== "html-video-spine") {
      fail(`method-flow must use the controlled html-video-spine variant: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.externalTemplateContract !== "A1HtmlVideoExternalTemplateReference/v1") {
      fail(`method-flow missing external template reference contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.externalTemplateSource !== "nexu-io/html-video") {
      fail(`method-flow missing trusted html-video reference source: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.externalTemplateReferenceOnly !== "true") {
      fail(`method-flow external template reference must be reference-only: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!/externalTemplateDirectRender/u.test(snapshot.dataset.layoutRejectIf || "")) {
      fail(`method-flow layout reject rules must ban direct external template rendering: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (/(html-video|nexu-io|A1HtmlVideoExternalTemplateReference)/iu.test(snapshot.text || "")) {
      fail(`method-flow leaked external template implementation text into stage: ${snapshot.text}`);
    }
  }
  const roleRows = snapshot.geometry?.roleRows || [];
  if (roleRows.length) {
    const surfaceWidths = roleRows.map((row) => Number(row.iconSurface?.width || 0)).filter(Boolean);
    const surfaceHeights = roleRows.map((row) => Number(row.iconSurface?.height || 0)).filter(Boolean);
    const expectedSurfaceWidth = Math.max(...surfaceWidths);
    const expectedSurfaceHeight = Math.max(...surfaceHeights);
    for (const [index, row] of roleRows.entries()) {
      const rowLabel = `${row.entity || row.nameText || "role"} row ${index + 1}`;
      if (!row.icon || !row.iconSurface || !row.iconSvg) {
        fail(`role row missing icon/surface/svg geometry: ${JSON.stringify(row)}`);
        continue;
      }
      if (!rectWithin(row.iconSurface, row.icon, 1.5)) {
        fail(`role icon surface must stay inside fixed icon slot: ${JSON.stringify(row)}`);
      }
      if (!rectWithin(row.iconSvg, row.iconSurface, 1.5)) {
        fail(`role SVG/monogram must stay inside icon surface: ${JSON.stringify(row)}`);
      }
      if (Math.abs(Number(row.iconSurface.width) - expectedSurfaceWidth) > 1.5 || Math.abs(Number(row.iconSurface.height) - expectedSurfaceHeight) > 1.5) {
        fail(`role icon surfaces must share one optical size: ${JSON.stringify({ expectedSurfaceWidth, expectedSurfaceHeight, row })}`);
      }
      const surfaceCenter = rectCenter(row.iconSurface);
      const svgCenter = rectCenter(row.iconSvg);
      const centerDeltaX = Math.abs((svgCenter?.x || 0) - (surfaceCenter?.x || 0));
      const centerDeltaY = Math.abs((svgCenter?.y || 0) - (surfaceCenter?.y || 0));
      if (centerDeltaX > 2 || centerDeltaY > 2) {
        fail(`role logo is not optically centered in its surface: ${JSON.stringify({ rowLabel, centerDeltaX, centerDeltaY, row })}`);
      }
      if (row.assetFallback === false) {
        if (!row.assetVerified || !row.assetSourceUrl || !row.assetLicense) {
          fail(`trusted role logo missing provenance fields: ${JSON.stringify(row)}`);
        }
        if (!["simple-icons", "iconify", "lobehub-icons", "kimi-brand-guidelines"].includes(row.assetSource)) {
          fail(`trusted role logo uses unapproved source: ${JSON.stringify(row)}`);
        }
      }
      if (row.assetType === "wordmark") {
        if (row.iconSvg.width < 40 || row.iconSvg.height > 20 || row.iconSvg.width / Math.max(row.iconSvg.height, 1) < 2.2) {
          fail(`wordmark logo must keep a wide, compact footprint: ${JSON.stringify(row)}`);
        }
      } else if (row.assetType === "square-mark") {
        const aspect = row.iconSvg.width / Math.max(row.iconSvg.height, 1);
        if (row.iconSvg.width < 22 || row.iconSvg.height < 22 || aspect < 0.82 || aspect > 1.22) {
          fail(`square-mark logo must keep a near-square footprint: ${JSON.stringify(row)}`);
        }
      } else if (row.assetType === "monogram") {
        if (!row.assetFallback || row.iconSvg.width < 18 || row.iconSvg.height < 18) {
          fail(`monogram logo must be explicit fallback with stable visible geometry: ${JSON.stringify(row)}`);
        }
      }
      if (rectsOverlap(row.icon, row.name, 6) || rectsOverlap(row.icon, row.task, 6) || rectsOverlap(row.name, row.task, 6)) {
        fail(`role row columns overlap: ${JSON.stringify(row)}`);
      }
    }
  }
  const isEvidenceBeat = snapshot.dataset.contentRelation === "evidence";
  const badMethodStepItems = (snapshot.methodFlowItems || []).filter((item) => /^(先|再|然后|接着|最后)(才|就|要|再|先)?$/u.test(item) || /^(才|就|要|然后|接着|最后)$/u.test(item));
  if (badMethodStepItems.length) {
    fail(`method flow contains orphan connector-only steps: ${JSON.stringify(badMethodStepItems)}`);
  }
  const isTextOnlyEvidenceBeat = isEvidenceBeat && snapshot.realAssetCount === 0 && snapshot.dataVizCount === 0;
  if (isTextOnlyEvidenceBeat) {
    if (snapshot.dataset.layoutMode !== "evidence-lock") {
      fail(`text-only proof/evidence beat must use evidence-lock layout, not ${snapshot.dataset.layoutMode}: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.evidenceVariant !== "editorial-proof-lock") {
      fail(`text-only proof/evidence beat missing editorial-proof-lock variant: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.composition !== "editorial-proof" || snapshot.dataset.hierarchy !== "evidence-first") {
      fail(`text-only proof/evidence beat must use editorial-proof/evidence-first grammar: ${JSON.stringify(snapshot.dataset)}`);
    }
    const proofRejectRules = snapshot.dataset.layoutRejectIf || "";
    if (!/fakeChartWithoutStructuredData/u.test(proofRejectRules)
      || !/proofRenderedAsRoleGrid/u.test(proofRejectRules)
      || !/proofRenderedAsPlainTitle/u.test(proofRejectRules)) {
      fail(`proof/evidence layout reject rules must ban fake charts, role grids, and plain title fallback: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.roleFlowItems.length || snapshot.methodFlowItems.length || snapshot.sequenceItems.length) {
      fail(`proof/evidence beat mixed in role/method/sequence structures: ${JSON.stringify({
        roles: snapshot.roleFlowItems,
        method: snapshot.methodFlowItems,
        sequence: snapshot.sequenceItems,
      })}`);
    }
    if (!snapshot.body || Array.from(snapshot.body).length < 6) {
      fail(`proof/evidence beat needs a supporting body line, not only a title: ${JSON.stringify({ title: snapshot.title, body: snapshot.body })}`);
    }
    if (rectsOverlap(snapshot.geometry?.title, snapshot.geometry?.body, 10)) {
      fail(`proof/evidence title overlaps supporting body: ${JSON.stringify({ title: snapshot.geometry?.title, body: snapshot.geometry?.body })}`);
    }
    if (Array.from(snapshot.body || "").length <= 22 && snapshot.geometry?.body?.height > 54) {
      fail(`short proof/evidence body wrapped into an awkward tall block: ${JSON.stringify({ body: snapshot.body, geometry: snapshot.geometry?.body })}`);
    }
  }
  if (snapshot.dataset.continuityContract !== "A1ContinuityPlan/v1") {
    fail(`stage frame missing continuity contract: ${JSON.stringify(snapshot.dataset)}`);
  }
  if (snapshot.cardCount > 1) {
    if (snapshot.dataset.spineContract !== "A1FulltextContinuitySpine/v1") {
      fail(`multi-scene stage missing fulltext continuity spine contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    const arc = String(snapshot.dataset.spineArc || "").split(">").filter(Boolean);
    const position = String(snapshot.dataset.spinePosition || "");
    const [positionIndex, positionTotal] = position.split("/").map((item) => Number(item));
    if (arc.length !== snapshot.cardCount || positionTotal !== snapshot.cardCount) {
      fail(`fulltext spine arc/card count mismatch: ${JSON.stringify({ arc, cardCount: snapshot.cardCount, position })}`);
    }
    if (Number(snapshot.activeCardIndex) + 1 !== positionIndex) {
      fail(`fulltext spine position does not match active card: ${JSON.stringify({ activeCardIndex: snapshot.activeCardIndex, position })}`);
    }
    if (arc[positionIndex - 1] && arc[positionIndex - 1] !== snapshot.dataset.spineCurrentRole) {
      fail(`fulltext spine current role mismatch: ${JSON.stringify({ arcRole: arc[positionIndex - 1], dataset: snapshot.dataset })}`);
    }
    if (snapshot.dataset.spineCurrentRole && snapshot.dataset.storyRole && snapshot.dataset.spineCurrentRole !== snapshot.dataset.storyRole) {
      fail(`stage storyRole drifted from fulltext spine current role: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (Number(snapshot.dataset.spineRoleVariety || 0) < 4 && snapshot.cardCount >= 5) {
      fail(`fulltext spine role variety too low for article animation: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.cardCount >= 4 && (snapshot.dataset.spineHasMethod !== "true" || snapshot.dataset.spineHasClosing !== "true")) {
      fail(`fulltext spine missing method/closing arc: ${JSON.stringify(snapshot.dataset)}`);
    }
  }
  const continuityStrength = Number(snapshot.dataset.continuityStrength || 0);
  if (!Number.isFinite(continuityStrength) || continuityStrength < 0.7) {
    fail(`stage continuity strength too weak: ${JSON.stringify(snapshot.dataset)}`);
  }
  if (!snapshot.dataset.continuityProgress || !snapshot.dataset.continuityFrom || !snapshot.dataset.continuityTo) {
    fail(`stage continuity plan missing progress/from/to: ${JSON.stringify(snapshot.dataset)}`);
  }
  if (snapshot.cardCount > 1) {
    if (snapshot.dataset.continuityThreadContract !== "A1ContinuityThreadPlan/v1") {
      fail(`multi-scene stage missing continuity thread contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!["story-spine", "method-spine", "role-thread", "source-thread", "concept-thread", "decision-thread", "lesson-thread"].includes(snapshot.dataset.continuityThreadKind)) {
      fail(`continuity thread has invalid kind: ${JSON.stringify(snapshot.dataset)}`);
    }
    const markerCount = Number(snapshot.dataset.continuityThreadMarkers || 0);
    const activeMarker = Number(snapshot.dataset.continuityThreadActive || 0);
    const markerItems = snapshot.geometry?.continuityThreadItems || [];
    if (!Number.isFinite(markerCount) || markerCount < 3 || markerCount > 8) {
      fail(`continuity thread marker count outside contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!Number.isFinite(activeMarker) || activeMarker < 1 || activeMarker > markerCount) {
      fail(`continuity thread active marker outside range: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (markerItems.length !== markerCount || markerItems.filter((item) => item.active).length !== 1) {
      fail(`continuity thread marker DOM mismatch: ${JSON.stringify({ markerCount, activeMarker, markerItems })}`);
    }
    if (markerItems.some((item) => item.text)) {
      fail(`continuity thread must not contain visible or hidden text: ${JSON.stringify(markerItems)}`);
    }
    if (!String(snapshot.dataset.continuityThreadRejectIf || "").includes("decorativeTimelineNumbers")) {
      fail(`continuity thread reject rules must forbid decorative numbering: ${JSON.stringify(snapshot.dataset)}`);
    }
    const thread = snapshot.geometry?.continuityThread;
    const threadOpacity = Number(snapshot.geometry?.continuityThreadStyle?.opacity || 0);
    if (!thread || thread.width > 190 || thread.height > 20 || threadOpacity > 0.65) {
      fail(`continuity thread must stay subtle and compact: ${JSON.stringify({ thread, style: snapshot.geometry?.continuityThreadStyle })}`);
    }
    if (rectsOverlap(thread, snapshot.geometry?.title, 14) || rectsOverlap(thread, snapshot.geometry?.body, 14) || rectsOverlap(thread, snapshot.geometry?.roleFlow, 14) || rectsOverlap(thread, snapshot.geometry?.methodFlow, 14)) {
      fail(`continuity thread overlaps primary content: ${JSON.stringify({ thread, title: snapshot.geometry?.title, body: snapshot.geometry?.body, roleFlow: snapshot.geometry?.roleFlow, methodFlow: snapshot.geometry?.methodFlow })}`);
    }
  }
  if (!snapshot.dataset.contentRelation || !snapshot.dataset.contentRelationLabel || !snapshot.dataset.motionBridge) {
    fail(`stage frame missing relation-driven visual bridge data: ${JSON.stringify(snapshot.dataset)}`);
  }
  if (snapshot.choiceRationale?.contract !== "A1StoryboardChoiceRationale/v1") {
    fail(`inspector missing choice rationale contract: ${JSON.stringify(snapshot.choiceRationale)}`);
  }
  const rationaleRoles = new Set((snapshot.choiceRationale?.rows || []).map((row) => row.role));
  ["template", "motion", "continuity"].forEach((role) => {
    if (!rationaleRoles.has(role)) fail(`choice rationale missing ${role} row: ${JSON.stringify(snapshot.choiceRationale)}`);
  });
  for (const row of snapshot.choiceRationale?.rows || []) {
    if (!row.value || !row.impact) fail(`choice rationale row lacks value/impact: ${JSON.stringify(row)}`);
    if (stageLeaksInspectorText(row.impact)) fail(`stage leaked choice rationale impact text: ${row.impact}`);
    if (stageLeaksInspectorText(row.source)) fail(`stage leaked choice rationale source text: ${row.source}`);
  }
  if (snapshot.neighborImpact?.contract !== "A1StoryboardNeighborImpact/v1") {
    fail(`inspector missing neighbor impact contract: ${JSON.stringify(snapshot.neighborImpact)}`);
  }
  const neighborRoles = new Set((snapshot.neighborImpact?.rows || []).map((row) => row.role));
  if (!neighborRoles.has("current")) fail(`neighbor impact missing current row: ${JSON.stringify(snapshot.neighborImpact)}`);
  for (const row of snapshot.neighborImpact?.rows || []) {
    if (!row.title || !row.impact) fail(`neighbor impact row lacks title/impact: ${JSON.stringify(row)}`);
    if (!row.interactive || row.targetIndex === "") fail(`neighbor impact row is not an interactive scene target: ${JSON.stringify(row)}`);
    if (stageLeaksInspectorText(row.impact)) fail(`stage leaked neighbor impact text: ${row.impact}`);
    if (stageLeaksInspectorText(row.source)) fail(`stage leaked neighbor impact source text: ${row.source}`);
  }
  if (snapshot.continuityDraftPreview?.contract !== "A1StoryboardContinuityDraftPreview/v1") {
    fail(`inspector missing continuity draft preview contract: ${JSON.stringify(snapshot.continuityDraftPreview)}`);
  }
  for (const row of snapshot.continuityDraftPreview?.rows || []) {
    if (stageLeaksInspectorText(row.impact)) fail(`stage leaked continuity draft preview impact text: ${row.impact}`);
    const isVisibleMethodStep = (snapshot.methodFlowItems || []).includes(row.value);
    if (row.value && ["previous", "current", "next"].includes(row.role) && snapshot.text.includes(row.value) && row.value !== snapshot.title && row.value !== snapshot.body && !isVisibleMethodStep) {
      fail(`stage leaked continuity draft preview row text: ${JSON.stringify(row)}`);
    }
  }
  const relationBridgeMap = {
    opening: "cold-open-hold",
    sequence: "soft-cut",
    contrast: "contrast-wipe",
    cause: "because-shift",
    method: "step-forward",
    roles: "role-reveal",
    evidence: "proof-lock",
    example: "detail-open",
    conclusion: "quiet-resolve",
  };
  if (snapshot.dataset.contentRelation && relationBridgeMap[snapshot.dataset.contentRelation] && snapshot.dataset.motionBridge !== relationBridgeMap[snapshot.dataset.contentRelation]) {
    fail(`stage motion bridge does not match content relation: ${JSON.stringify(snapshot.dataset)}`);
  }
  const bridgeTransitionEffectMap = {
    "cold-open-hold": "settle",
    "soft-cut": "soft-continue",
    "contrast-wipe": "contrast-pivot",
    "because-shift": "because-shift",
    "step-forward": "step-forward",
    "role-reveal": "role-reveal",
    "proof-lock": "proof-lock",
    "detail-open": "detail-open",
    "quiet-resolve": "quiet-resolve",
  };
  const relationRhythmMap = {
    opening: "cold-open",
    sequence: "soft-thread",
    contrast: "contrast-snap",
    cause: "because-shift",
    method: "step-chain",
    roles: "role-stagger",
    evidence: "proof-hold",
    example: "detail-open",
    conclusion: "quiet-resolve",
  };
  if (snapshot.dataset.contentRelation && relationRhythmMap[snapshot.dataset.contentRelation]) {
    if (snapshot.dataset.rhythmContract !== "A1MotionRhythm/v1") {
      fail(`stage missing motion rhythm contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.globalMotionMotifContract !== "A1GlobalMotionMotif/v1") {
      fail(`stage missing global motion motif contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!snapshot.dataset.globalMotionMotifId || snapshot.dataset.globalMotionMotifId === "generic") {
      fail(`stage missing specific global motion motif id: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!snapshot.dataset.rhythmMotifBridge) {
      fail(`stage rhythm is not driven by global motif: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!snapshot.dataset.globalMotionRejectIf?.includes("isolatedSentenceCard") || !snapshot.dataset.globalMotionRejectIf.includes("randomTransition")) {
      fail(`stage global motif missing reject rules: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!snapshot.dataset.globalMotionDirectives?.includes("keepVisibleTextOnly")) {
      fail(`stage global motif directives must keep stage text content-only: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.motionArcNodeContract !== "A1StoryboardMotionArcNode/v1") {
      fail(`stage missing motion arc node contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!["hook", "setup", "develop", "turn", "resolve"].includes(snapshot.dataset.motionArcPhase || "")) {
      fail(`stage missing stable motion arc phase: ${JSON.stringify(snapshot.dataset)}`);
    }
    const motionArcEnergy = Number(snapshot.dataset.motionArcEnergy || 0);
    if (!Number.isFinite(motionArcEnergy) || motionArcEnergy < 0.3 || motionArcEnergy > 0.9) {
      fail(`stage motion arc energy out of range: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.arcPlaybackContract !== "A1StoryboardArcPlaybackPlan/v1") {
      fail(`stage missing arc playback plan contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    const playbackAnimation = Number(snapshot.dataset.arcPlaybackAnimationMs || 0);
    const playbackAdvance = Number(snapshot.dataset.arcPlaybackAdvanceMs || 0);
    if (!Number.isFinite(playbackAnimation) || playbackAnimation < 700 || playbackAnimation > 2200) {
      fail(`stage arc playback animation is out of range: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!Number.isFinite(playbackAdvance) || playbackAdvance < 1500 || playbackAdvance > 8800) {
      fail(`stage arc playback advance is out of range: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!snapshot.dataset.arcPlaybackRejectIf?.includes("uniformPlaybackTiming") || !snapshot.dataset.arcPlaybackRejectIf.includes("arcDataIgnored")) {
      fail(`stage arc playback missing reject rules: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.arcTransitionContract !== "A1StoryboardArcTransitionPlan/v1") {
      fail(`stage missing arc transition plan contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!["settle", "linked-build", "step-forward", "role-reveal", "because-shift", "proof-lock", "detail-open", "contrast-pivot", "quiet-resolve", "soft-continue"].includes(snapshot.dataset.arcTransitionEffect || "")) {
      fail(`stage arc transition effect is not whitelisted: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.motionBridge && bridgeTransitionEffectMap[snapshot.dataset.motionBridge] && snapshot.dataset.arcTransitionEffect !== bridgeTransitionEffectMap[snapshot.dataset.motionBridge]) {
      fail(`stage arc transition effect does not match relation motion bridge: ${JSON.stringify(snapshot.dataset)}`);
    }
    const transitionDuration = Number(snapshot.dataset.arcTransitionDurationMs || 0);
    if (!Number.isFinite(transitionDuration) || transitionDuration < 400 || transitionDuration > 1400) {
      fail(`stage arc transition duration is out of range: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!snapshot.dataset.arcTransitionRejectIf?.includes("randomTransition") || !snapshot.dataset.arcTransitionRejectIf.includes("wholePageShake")) {
      fail(`stage arc transition missing anti-AI-motion reject rules: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.continuityMotionChainContract !== "A1ContinuityMotionChain/v1") {
      fail(`stage missing continuity motion chain contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.continuityChainCurrentRelation !== snapshot.dataset.contentRelation) {
      fail(`continuity motion chain current relation drifted from stage relation: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.continuityChainCurrentBridge !== snapshot.dataset.motionBridge) {
      fail(`continuity motion chain current bridge drifted from stage bridge: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.continuityChainCurrentEffect !== snapshot.dataset.arcTransitionEffect) {
      fail(`continuity motion chain current effect drifted from arc transition: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!snapshot.dataset.continuityChainRelations?.includes(snapshot.dataset.contentRelation || "")) {
      fail(`continuity motion chain relations missing current relation: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!snapshot.dataset.continuityChainEffects?.includes(snapshot.dataset.arcTransitionEffect || "")) {
      fail(`continuity motion chain effects missing current effect: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!snapshot.dataset.continuityChainRejectIf?.includes("isolatedSentenceCard") || !snapshot.dataset.continuityChainRejectIf.includes("chainTextOnStage")) {
      fail(`continuity motion chain missing reject rules: ${JSON.stringify(snapshot.dataset)}`);
    }
    const chain = snapshot.geometry?.continuityMotionChain;
    const chainOpacity = Number(snapshot.geometry?.continuityMotionChainStyle?.opacity || 0);
    const chainIsVisible = chainOpacity > 0.01;
    if (chain && ((chainIsVisible && (Number(chain.width || 0) <= 20 || Number(chain.height || 0) > 10)) || chainOpacity > 0.55)) {
      fail(`continuity motion chain must stay subtle and non-textual: ${JSON.stringify({ chain, style: snapshot.geometry?.continuityMotionChainStyle })}`);
    }
    const chainText = (snapshot.geometry?.continuityMotionChainText || "").trim();
    if (chainText) {
      fail(`continuity motion chain must not contain visible or hidden text: ${chainText}`);
    }
    if (snapshot.dataset.globalMotionMotifId === "tool-role-thread") {
      if (!snapshot.dataset.globalMotionDirectives.includes("recallVerifiedActors")) {
        fail(`tool-role-thread scenes must carry actor recall directive: ${JSON.stringify(snapshot.dataset)}`);
      }
      const verifiedActors = (snapshot.dataset.globalMotionVerifiedActors || "").split(",").map((item) => item.trim()).filter(Boolean);
      const shouldShowActorThread =
        snapshot.dataset.intent !== "roles" &&
        snapshot.dataset.globalMotionDirectives.includes("useActorThreadContinuity") &&
        ["comparison", "evidence"].includes(snapshot.dataset.contentRelation || "") &&
        Number(snapshot.dataset.globalMotionVerifiedActorCount || 0) >= 2;
      if (!shouldShowActorThread && snapshot.actorThreadCount > 0) {
        fail(`actor thread must not decorate non-comparison/evidence scenes: ${JSON.stringify({ relation: snapshot.dataset.contentRelation, intent: snapshot.dataset.intent, count: snapshot.actorThreadCount, entities: snapshot.actorThreadEntities })}`);
      }
      if (shouldShowActorThread) {
        if (snapshot.actorThreadCount < 2) {
          fail(`tool-role-thread scenes with verified actors should keep a subtle actor thread: ${JSON.stringify({ count: snapshot.actorThreadCount, entities: snapshot.actorThreadEntities, verifiedActors })}`);
        }
        if (!snapshot.actorThreadEntities.some((entity) => verifiedActors.includes(entity))) {
          fail(`actor thread should recall this article's verified entities: ${JSON.stringify({ thread: snapshot.actorThreadEntities, verifiedActors })}`);
        }
      }
      for (const item of snapshot.geometry?.actorThreadItems || []) {
        if (!item.entity) fail(`actor thread item missing entity identity: ${JSON.stringify(item)}`);
        if (item.text) fail(`actor thread must not add visible text to the stage: ${JSON.stringify(item)}`);
        if (item.fallback) fail(`actor thread should use verified assets before fallback monograms: ${JSON.stringify(item)}`);
      }
    }
    if (snapshot.dataset.rhythmId !== relationRhythmMap[snapshot.dataset.contentRelation]) {
      fail(`stage rhythm does not match content relation: ${JSON.stringify(snapshot.dataset)}`);
    }
    const rhythmRejectRules = snapshot.dataset.rhythmRejectIf || "";
    ["allActorsSynchronized", "bounceOrElastic", "layoutShiftDuringMotion", "randomTiming"].forEach((rule) => {
      if (!rhythmRejectRules.includes(rule)) fail(`motion rhythm missing reject rule ${rule}: ${JSON.stringify(snapshot.dataset)}`);
    });
  }
  if ((snapshot.actors || []).length > 1) {
    const uniqueActorDelays = new Set(snapshot.actors.map((actor) => Number(actor.delay || 0).toFixed(2)));
    if (["method", "roles", "evidence", "contrast", "conclusion"].includes(snapshot.dataset.contentRelation) && uniqueActorDelays.size < 2) {
      fail(`multi-actor rhythm cannot synchronize every actor: ${JSON.stringify(snapshot.actors)}`);
    }
    for (const actor of snapshot.actors) {
      if (actor.rhythm && actor.rhythm !== snapshot.dataset.rhythmId) {
        fail(`actor rhythm drifted from stage rhythm: ${JSON.stringify({ actor, dataset: snapshot.dataset })}`);
      }
      ["allActorsSynchronized", "bounceOrElastic", "layoutShiftDuringMotion", "randomTiming"].forEach((rule) => {
        if (!String(actor.rejectIf || "").includes(rule)) fail(`actor missing rhythm reject rule ${rule}: ${JSON.stringify(actor)}`);
      });
      if (/(bounce|elastic|random)/iu.test(`${actor.animation} ${actor.easing} ${actor.style?.animationName || ""}`)) {
        fail(`actor uses forbidden motion flavor: ${JSON.stringify(actor)}`);
      }
      if (actor.finalState !== "opacity:1,x:0,y:0,scale:1") {
        fail(`actor final state is not deterministic hold: ${JSON.stringify(actor)}`);
      }
    }
  }
  if (!/disconnectedBeat|isolatedSentenceCard/u.test(snapshot.dataset.continuityRejectIf || "")) {
    fail(`continuity reject rules missing disconnected/sentence-card failures: ${JSON.stringify(snapshot.dataset)}`);
  }
  if (snapshot.dataset.continuityFrom && snapshot.text.includes(snapshot.dataset.continuityFrom)) {
    fail(`stage leaked continuity-from director text: ${snapshot.dataset.continuityFrom}`);
  }
  if (snapshot.dataset.continuityTo && snapshot.text.includes(snapshot.dataset.continuityTo)) {
    fail(`stage leaked continuity-to director text: ${snapshot.dataset.continuityTo}`);
  }
  if (snapshot.dataset.intent === "roles" && snapshot.roleFlowItems.length >= 2 && snapshot.body) {
    fail(`roles scene duplicated role flow into body text: ${snapshot.body}`);
  }
  if (snapshot.dataset.intent === "roles") {
    if (snapshot.dataset.contentRelation !== "roles" || snapshot.dataset.motionBridge !== "role-reveal") {
      fail(`roles stage must be relation-driven by roles/role-reveal: ${JSON.stringify(snapshot.dataset)}`);
    }
    const actors = snapshot.geometry?.actors || [];
    if (snapshot.dataset.actorContract !== "A1ActorPlan/v1") {
      fail(`stage frame missing actor contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.layoutContract !== "A1LayoutPlan/v1") {
      fail(`stage frame missing layout contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.layoutMode !== "role-grid" && snapshot.roleFlowItems.length >= 3) {
      fail(`roles scene should use role-grid layout mode: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!/roleColumnCollision|textOverlap|titleOverDensity/u.test(snapshot.dataset.layoutRejectIf || "")) {
      fail(`layout reject rules should cover role/text failures: ${JSON.stringify(snapshot.dataset)}`);
    }
    const expectedActorCount = Number(snapshot.dataset.actorCount || 0);
    if (!expectedActorCount || actors.length !== expectedActorCount) {
      fail(`stage actor count mismatch: expected ${expectedActorCount}, got ${actors.length}`);
    }
    for (const actor of actors) {
      if (!actor.id || !actor.role || !actor.phase || !actor.slot || !actor.finalState.includes("opacity:1")) {
        fail(`actor missing A1ActorPlan fields: ${JSON.stringify(actor)}`);
      }
    }
    const roleActors = actors.filter((actor) => actor.role.startsWith("role-"));
    if (roleActors.length < 9) {
      fail(`roles scene should expose icon/name/task actor triplets: ${JSON.stringify(roleActors)}`);
    }
    for (let index = 1; index < roleActors.length; index += 1) {
      if (roleActors[index].order <= roleActors[index - 1].order) {
        fail(`role actor order must increase: ${JSON.stringify(roleActors)}`);
      }
    }
    for (const row of [1, 2, 3, 4]) {
      const icon = roleActors.find((actor) => actor.id === `role-${row}-icon`);
      const name = roleActors.find((actor) => actor.id === `role-${row}-name`);
      const task = roleActors.find((actor) => actor.id === `role-${row}-task`);
      if (icon || name || task) {
        if (!icon || !name || !task) fail(`role row ${row} must expose icon/name/task actors: ${JSON.stringify({ icon, name, task })}`);
        if (icon && name && task && !(icon.delay < name.delay && name.delay < task.delay)) {
          fail(`role row ${row} actor delays must follow icon -> name -> task: ${JSON.stringify({ icon, name, task })}`);
        }
      }
    }
    const directorFields = new Set((snapshot.director?.fields || []).map((item) => item.field));
    if (!snapshot.director?.motionDirectorV2) {
      fail("roles inspector is not backed by Motion Director v2");
    }
    if (snapshot.director?.contentGraphContract !== "A1FrontendContentGraphNode/v1") {
      fail(`roles inspector missing frontend content graph contract: ${JSON.stringify(snapshot.director)}`);
    }
    if (snapshot.director?.globalMotionMotifContract !== "A1GlobalMotionMotif/v1") {
      fail(`roles inspector missing global motion motif contract: ${JSON.stringify(snapshot.director)}`);
    }
    if (snapshot.director?.globalMotionMotifId !== "tool-role-thread") {
      fail(`roles inspector should expose tool-role-thread motif: ${JSON.stringify(snapshot.director)}`);
    }
    if (snapshot.director?.globalMotionAccentStrategy !== "single-accent-for-verified-actors") {
      fail(`roles inspector should expose single actor accent strategy: ${JSON.stringify(snapshot.director)}`);
    }
    if (!snapshot.director?.globalMotionRejectIf?.includes("isolatedSentenceCard") || !snapshot.director?.globalMotionRejectIf?.includes("randomTransition")) {
      fail(`roles inspector missing global motif reject rules: ${JSON.stringify(snapshot.director)}`);
    }
    ["contentGraphFrom", "contentGraphNode", "contentGraphTo", "contentGraphEdge"].forEach((field) => {
      if (!directorFields.has(field)) fail(`roles inspector missing content graph field: ${field}`);
      const value = (snapshot.director?.fields || []).find((item) => item.field === field)?.value || "";
      if (value && snapshot.text.includes(value)) fail(`stage leaked content graph director field ${field}: ${value}`);
    });
    const edgeValue = (snapshot.director?.fields || []).find((item) => item.field === "contentGraphEdge")?.value || "";
    if (!/(开场定题|顺序推进|形成对比|解释原因|给出方法|分配角色|补充证据|展开例子|收束判断)/u.test(edgeValue)) {
      fail(`roles inspector content graph edge should expose semantic relation label: ${edgeValue}`);
    }
    ["whyThisBeatExists", "connectsFrom", "connectsTo", "motionArc", "rejectIf"].forEach((field) => {
      if (!directorFields.has(field)) fail(`roles inspector missing Motion Director v2 field: ${field}`);
    });
    const rejectValue = (snapshot.director?.fields || []).find((item) => item.field === "rejectIf")?.value || "";
    if (!/错图标|实体|占位|制作词|文本重叠|missingVisualJob|missingShotModule|wrongEntityIcon|placeholder/iu.test(rejectValue)) {
      fail(`roles inspector reject rules do not cover visual/entity failure: ${rejectValue}`);
    }
    const { title, roleFlow, roleRows = [] } = snapshot.geometry || {};
    if (rectsOverlap(title, roleFlow, 16)) {
      fail(`roles title overlaps role flow: ${JSON.stringify({ title, roleFlow })}`);
    }
    if (roleRows.length >= 2) {
      if (!/(分工|职责|角色|模型)/u.test(snapshot.title || "")) {
        fail(`multi-role scene title must describe the group, not one actor task: ${snapshot.title}`);
      }
      if (roleRows.some((row) => row.nameText && snapshot.title?.includes(row.nameText) && snapshot.title?.includes(row.taskText))) {
        fail(`multi-role scene title collapsed into a single role row: ${JSON.stringify({ title: snapshot.title, roleRows })}`);
      }
    }
    roleRows.forEach((row, index) => {
      if (!row.icon) {
        fail(`roles row ${index + 1} missing icon actor: ${JSON.stringify(row)}`);
      }
      const iconCenter = rectCenter(row.icon);
      const iconSurfaceCenter = rectCenter(row.iconSurface);
      const iconSvgCenter = rectCenter(row.iconSvg);
      const nameCenter = rectCenter(row.name);
      const taskCenter = rectCenter(row.task);
      if (row.iconSurface && iconCenter && iconSurfaceCenter && Math.abs(iconCenter.x - iconSurfaceCenter.x) > 1.5) {
        fail(`roles row ${index + 1} icon surface is not centered in fixed slot: ${JSON.stringify(row)}`);
      }
      if (row.iconSurface && iconCenter && iconSurfaceCenter && Math.abs(iconCenter.y - iconSurfaceCenter.y) > 1.5) {
        fail(`roles row ${index + 1} icon surface is not vertically centered in fixed slot: ${JSON.stringify(row)}`);
      }
      if (row.iconSvg && iconSurfaceCenter && iconSvgCenter && Math.abs(iconSurfaceCenter.x - iconSvgCenter.x) > 1.5) {
        fail(`roles row ${index + 1} icon SVG is not horizontally centered: ${JSON.stringify(row)}`);
      }
      if (row.iconSvg && iconSurfaceCenter && iconSvgCenter && Math.abs(iconSurfaceCenter.y - iconSvgCenter.y) > 1.5) {
        fail(`roles row ${index + 1} icon SVG is not vertically centered: ${JSON.stringify(row)}`);
      }
      if (!["square-mark", "wordmark", "app-icon", "monogram"].includes(row.assetType)) {
        fail(`roles row ${index + 1} missing valid entity visual assetType: ${JSON.stringify(row)}`);
      }
      if (row.icon && row.row && (row.icon.left < row.row.left - 0.5 || row.icon.right > row.row.right + 0.5)) {
        fail(`roles row ${index + 1} icon tile escapes row bounds: ${JSON.stringify(row)}`);
      }
      if (row.assetType === "wordmark" && row.iconSurface && row.iconSurface.width < 62) {
        fail(`roles row ${index + 1} wordmark tile is too narrow for readable brand lockup: ${JSON.stringify(row)}`);
      }
      if (row.assetType === "wordmark" && row.iconSvg && row.iconSvg.width < 52) {
        fail(`roles row ${index + 1} wordmark was squeezed into a square icon size: ${JSON.stringify(row)}`);
      }
      if (row.assetType === "wordmark" && row.iconSvg && row.iconSvg.height > 20) {
        fail(`roles row ${index + 1} wordmark should keep wide-brand proportions, not square proportions: ${JSON.stringify(row)}`);
      }
      if (row.assetType === "square-mark" && row.iconSvg && Math.abs(row.iconSvg.width - row.iconSvg.height) > 1.5) {
        fail(`roles row ${index + 1} square-mark SVG must stay square: ${JSON.stringify(row)}`);
      }
      if (row.assetVariant === "app-icon-square" && row.iconSvg && (row.iconSvg.width < 28 || row.iconSvg.height < 28)) {
        fail(`roles row ${index + 1} app icon rendered too small in its optical tile: ${JSON.stringify(row)}`);
      }
      if (row.assetType === "monogram" && !row.assetFallback) {
        fail(`roles row ${index + 1} monogram visual type must be fallback only: ${JSON.stringify(row)}`);
      }
      if (iconCenter && nameCenter && Math.abs(iconCenter.y - nameCenter.y) > 3) {
        fail(`roles row ${index + 1} icon/name baselines are misaligned: ${JSON.stringify(row)}`);
      }
      if (iconCenter && taskCenter && Math.abs(iconCenter.y - taskCenter.y) > 3) {
        fail(`roles row ${index + 1} icon/task baselines are misaligned: ${JSON.stringify(row)}`);
      }
      if (!row.motionActors?.includes("role-icon") || !row.motionActors?.includes("role-name") || !row.motionActors?.includes("role-task")) {
        fail(`roles row ${index + 1} missing motion actors: ${JSON.stringify(row)}`);
      }
      if (!row.assetSource) {
        fail(`roles row ${index + 1} missing entity asset source: ${JSON.stringify(row)}`);
      }
      if (!row.assetFallback && row.assetVerified !== true) {
        fail(`roles row ${index + 1} trusted icon must be audit verified in the DOM: ${JSON.stringify(row)}`);
      }
      if (!row.assetFallback && (!row.assetSourceUrl || !/^https:\/\//u.test(row.assetSourceUrl))) {
        fail(`roles row ${index + 1} trusted icon missing sourceUrl proof: ${JSON.stringify(row)}`);
      }
      if (!row.assetFallback && !row.assetLicense) {
        fail(`roles row ${index + 1} trusted icon missing license proof: ${JSON.stringify(row)}`);
      }
      if (!row.assetFallback && (!Number.isFinite(row.assetConfidence) || row.assetConfidence < 0.9)) {
        fail(`roles row ${index + 1} trusted icon confidence is too weak: ${JSON.stringify(row)}`);
      }
      if (row.entity === "Codex" && !/codex-color\.svg/u.test(row.assetSourceUrl || "")) {
        fail(`Codex role icon must use Codex OpenAI SVG source, not a generic fallback: ${JSON.stringify(row)}`);
      }
      if (row.entity === "Kimi" && !/Branding-Guide\/scenarios\/01-kimi-with-icon/u.test(row.assetSourceUrl || "")) {
        fail(`Kimi role icon must use official KIMI with-icon SVG source: ${JSON.stringify(row)}`);
      }
      if (row.entity === "DeepSeek" && !/deepseek-color\.svg/u.test(row.assetSourceUrl || "")) {
        fail(`DeepSeek role icon must use trusted DeepSeek SVG source: ${JSON.stringify(row)}`);
      }
      if (!row.assetFallback && /rgba?\(0,\s*0,\s*0(?:,\s*0)?\)/u.test(row.iconBackground || "")) {
        fail(`roles row ${index + 1} trusted icon needs readable background: ${JSON.stringify(row)}`);
      }
      if (!row.assetFallback && ["lobehub-icons", "simple-icons"].includes(row.assetSource) && Number(rgbLuma(row.iconColor) || 255) > 90) {
        fail(`roles row ${index + 1} trusted SVG should render with dark foreground on light tile: ${JSON.stringify(row)}`);
      }
      if (rectsOverlap(row.icon, row.name, 8) || rectsOverlap(row.icon, row.task, 8)) {
        fail(`roles row ${index + 1} icon overlaps text: ${JSON.stringify(row)}`);
      }
      if (rectsOverlap(row.name, row.task, 8)) {
        fail(`roles row ${index + 1} name overlaps task: ${JSON.stringify(row)}`);
      }
      if (row.name && row.task && row.task.left - row.name.right < 12) {
        fail(`roles row ${index + 1} name/task gap is too small: ${JSON.stringify(row)}`);
      }
      if (/rgb\(\s*200,\s*255,\s*47\s*\)/u.test(row.nameColor || "")) {
        fail(`roles row ${index + 1} name must be near-white, not global accent green: ${JSON.stringify(row)}`);
      }
      if (row.name && row.row && row.name.right > row.row.right) {
        fail(`roles row ${index + 1} name escapes row bounds: ${JSON.stringify(row)}`);
      }
      if (row.task && row.row && row.task.right > row.row.right) {
        fail(`roles row ${index + 1} task escapes row bounds: ${JSON.stringify(row)}`);
      }
      if (row.taskText && row.taskText.length <= 6 && row.task?.height > 36) {
        fail(`roles row ${index + 1} short task wraps awkwardly: ${JSON.stringify(row)}`);
      }
    });
    const iconSlotWidths = roleRows.map((row) => row.icon?.width).filter(Number.isFinite);
    const widestIconSlot = Math.max(...iconSlotWidths, 0);
    const narrowestIconSlot = Math.min(...iconSlotWidths, widestIconSlot || 0);
    if (iconSlotWidths.length >= 2 && widestIconSlot - narrowestIconSlot > 1.5) {
      fail(`roles icon slots must share a fixed optical column width: ${JSON.stringify(roleRows.map((row) => ({ entity: row.entity, assetType: row.assetType, icon: row.icon, iconSurface: row.iconSurface })))}`);
    }
    const iconSurfaceWidths = roleRows.map((row) => row.iconSurface?.width).filter(Number.isFinite);
    const widestIconSurface = Math.max(...iconSurfaceWidths, 0);
    const narrowestIconSurface = Math.min(...iconSurfaceWidths, widestIconSurface || 0);
    if (iconSurfaceWidths.length >= 2 && widestIconSurface - narrowestIconSurface > 1.5) {
      fail(`roles visible icon surfaces must share a fixed optical width: ${JSON.stringify(roleRows.map((row) => ({ entity: row.entity, assetType: row.assetType, icon: row.icon, iconSurface: row.iconSurface })))}`);
    }
  }
  const manualGraphRole = snapshot.graphEditInputs?.role || "";
  const graphBacked = snapshot.director?.contentGraphContract === "A1FrontendContentGraphNode/v1";
  if (!graphBacked && (snapshot.dataset.intent === "workflow" || snapshot.dataset.layoutMode === "method-flow") && !["closing", "roles", "proof", "evidence", "example"].includes(manualGraphRole)) {
    if (snapshot.dataset.contentRelation !== "method" || snapshot.dataset.motionBridge !== "step-forward") {
      fail(`method stage must be relation-driven by method/step-forward: ${JSON.stringify(snapshot.dataset)}`);
    }
  }
  if (snapshot.dataset.storyRole === "closing" || snapshot.dataset.intent === "closing") {
    if (snapshot.dataset.contentRelation !== "conclusion" || snapshot.dataset.motionBridge !== "quiet-resolve") {
      fail(`closing stage must be relation-driven by conclusion/quiet-resolve: ${JSON.stringify(snapshot.dataset)}`);
    }
  }
  const isRealMediaImageShot = snapshot.dataset.type === "image" && snapshot.dataset.visualRegister === "real-media" && snapshot.realAssetCount > 0;
  if (isRealMediaImageShot) {
    const { content, realAsset, methodFlow } = snapshot.geometry || {};
    const actors = snapshot.geometry?.actors || [];
    if (snapshot.mediaVizCount > 0) {
      fail(`real-media image shot rendered synthetic media chrome: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (!realAsset || realAsset.width < 120 || realAsset.height < 90) {
      fail(`real-media image shot missing visible asset geometry: ${JSON.stringify(snapshot.geometry)}`);
    }
    if (methodFlow) {
      fail(`real-media image shot must not render workflow method-flow over the asset: ${JSON.stringify(snapshot.geometry)}`);
    }
    if (snapshot.sequenceItems.length) {
      fail(`real-media image shot must not render numbered sequence UI: ${snapshot.sequenceItems.join(" / ")}`);
    }
    if (rectsOverlap(content, realAsset, 20)) {
      fail(`real-media image content column overlaps asset: ${JSON.stringify({ content, realAsset })}`);
    }
    if (!actors.some((actor) => actor.role === "asset")) {
      fail(`real-media image shot should expose an asset actor: ${JSON.stringify(actors)}`);
    }
    if (Number(snapshot.imageEvidenceLayerCount || 0) < 3) {
      fail(`real-media image shot missing template-bound evidence layers: ${JSON.stringify({
        imageEvidenceLayerCount: snapshot.imageEvidenceLayerCount,
        imageEvidenceGateCount: snapshot.imageEvidenceGateCount,
        imageEvidenceReadoutCount: snapshot.imageEvidenceReadoutCount,
        imageEvidenceSourceCount: snapshot.imageEvidenceSourceCount,
        imageEvidenceProvenanceCount: snapshot.imageEvidenceProvenanceCount,
        imageEvidenceNoteCount: snapshot.imageEvidenceNoteCount,
      })}`);
    }
    if (Number(snapshot.imageEvidenceSourceCount || 0) < 1 || Number(snapshot.imageEvidenceNoteCount || 0) < 1) {
      fail(`real-media image shot must show source/callout layers: ${JSON.stringify({
        imageEvidenceReadoutCount: snapshot.imageEvidenceReadoutCount,
        imageEvidenceSourceCount: snapshot.imageEvidenceSourceCount,
        imageEvidenceNoteCount: snapshot.imageEvidenceNoteCount,
      })}`);
    }
  }
  if (snapshot.dataset.intent === "workflow" && !isRealMediaImageShot) {
    const actors = snapshot.geometry?.actors || [];
    const stepActors = actors.filter((actor) => actor.role === "method-step");
    const methodRows = snapshot.geometry?.methodRows || [];
    const { title, methodFlow } = snapshot.geometry || {};
    if (snapshot.dataset.actorContract !== "A1ActorPlan/v1") {
      fail(`workflow frame missing actor contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (snapshot.dataset.layoutContract !== "A1LayoutPlan/v1" || snapshot.dataset.layoutMode !== "method-flow") {
      fail(`workflow frame missing method-flow layout contract: ${JSON.stringify(snapshot.dataset)}`);
    }
    if (stepActors.length < 2) {
      fail(`workflow should expose method-step actors: ${JSON.stringify(actors)}`);
    }
    if (methodRows.length < 2) {
      fail(`workflow should expose method row geometry: ${JSON.stringify(snapshot.geometry)}`);
    }
    if (rectsOverlap(title, methodFlow, 16)) {
      fail(`workflow title overlaps method flow: ${JSON.stringify({ title, methodFlow })}`);
    }
    if (snapshot.sequenceItems.length) {
      fail(`workflow should not render numbered sequence items: ${JSON.stringify(snapshot.sequenceItems)}`);
    }
    if (methodRows.some((row) => row.text && row.text === snapshot.title)) {
      fail(`workflow duplicated the title as a method step: ${JSON.stringify({ title: snapshot.title, methodRows })}`);
    }
    methodRows.forEach((row, index) => {
      if (storyboardChromeTextPattern.test(row.text || "")) {
        fail(`workflow row ${index + 1} leaked chrome text: ${JSON.stringify(row)}`);
      }
      if (Array.from(row.text || "").length > 18) {
        fail(`workflow row ${index + 1} is too long for one beat: ${JSON.stringify(row)}`);
      }
      if (row.text && Array.from(row.text).length <= 8 && row.row?.height > 70) {
        fail(`workflow row ${index + 1} short step wraps awkwardly: ${JSON.stringify(row)}`);
      }
      if (row.row && methodFlow && (row.row.left < methodFlow.left - 0.5 || row.row.right > methodFlow.right + 0.5)) {
        fail(`workflow row ${index + 1} escapes method flow bounds: ${JSON.stringify({ row, methodFlow })}`);
      }
      if (row.motionActor !== "method-step" || row.actorRole !== "method-step") {
        fail(`workflow row ${index + 1} missing method-step actor binding: ${JSON.stringify(row)}`);
      }
    });
    for (let index = 1; index < stepActors.length; index += 1) {
      if (stepActors[index].delay <= stepActors[index - 1].delay) {
        fail(`workflow method-step delays should stagger forward: ${JSON.stringify(stepActors)}`);
      }
    }
  }

  return failures;
}
