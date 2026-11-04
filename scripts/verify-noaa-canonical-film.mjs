import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const projectId = "2026-07-17T03-49-04-771Z-330f03";
const jobDir = path.resolve(process.argv[2] || ".codex-artifacts/unseen-article/noaa-current-monitoring/capture-20260717T025033Z");
const outputDir = path.join(jobDir, `canonical-12-shot-${new Date().toISOString().replace(/[:.]/gu, "-")}`);
await fs.mkdir(outputDir, { recursive: true });

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${url} returned non-JSON ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) throw new Error(`${url} ${response.status}: ${payload.error || text.slice(0, 300)}`);
  return payload;
}

const opened = await jsonFetch(`http://127.0.0.1:4310/api/a1-actions/open-compiled-project`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectId }),
});
const state = opened.state || {};
const bridge = state.renderBridge || {};
if (opened.projectId !== projectId || bridge.ok !== true || bridge.validationOk !== true) {
  throw new Error(`canonical state is not render-ready: ${JSON.stringify({ projectId: opened.projectId, bridgeOk: bridge.ok, validationOk: bridge.validationOk, failures: bridge.validation?.failures || [] })}`);
}

const rendered = await jsonFetch("http://127.0.0.1:4310/api/a1-actions/render-film", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ state }),
});
const filmUrl = `http://127.0.0.1:4310${rendered.publicUrl}`;

const browser = await chromium.launch({ headless: true });
const appPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await appPage.goto("http://127.0.0.1:4310/?view=storyboard&preview=noaa", { waitUntil: "networkidle", timeout: 30_000 });
await appPage.waitForSelector('[data-a1-next-workbench="NextStoryboardWorkbench/v1"]', { timeout: 15_000 });
const appState = await appPage.evaluate(() => {
  const main = document.querySelector('[data-a1-next-workbench="NextStoryboardWorkbench/v1"]');
  const text = String(document.body.innerText || "").replace(/\s+/gu, " ").trim();
  return {
    projectId: main?.dataset.a1PersistedProjectId || "",
    shotCount: Number(main?.dataset.a1TemplateGateCount || 0),
    assetCount: Number(main?.dataset.a1AssetCount || (text.match(/(\d+) 素材/u)?.[1] || 0)),
    renderPropsReady: main?.dataset.renderPropsReady || "",
    productionGateReady: main?.dataset.productionGateReady || "",
    productionGateBlocked: Number(main?.dataset.productionGateBlocked || 0),
    sourceEvidenceBlocked: Number(main?.dataset.a1SourceEvidenceBlocked || 0),
    canonicalComposition: main?.dataset.a1CanonicalComposition || "",
  };
});
const appScreenshotPath = path.join(outputDir, "workbench.png");
await appPage.screenshot({ path: appScreenshotPath, fullPage: false });

const filmPage = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
await filmPage.setContent('<video id="film" muted playsinline></video>');
const filmMeta = await filmPage.evaluate(async (src) => {
  const video = document.querySelector("#film");
  video.src = src;
  await new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", resolve, { once: true });
    video.addEventListener("error", () => reject(new Error("rendered film failed browser decode")), { once: true });
    setTimeout(() => reject(new Error("rendered film metadata timeout")), 20_000);
  });
  return {
    readyState: video.readyState,
    duration: video.duration,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    currentSrc: video.currentSrc,
  };
}, filmUrl);
await filmPage.evaluate(() => {
  const video = document.querySelector("#film");
  video.currentTime = Math.min(0.2, Math.max(0, video.duration - 0.1));
});
await filmPage.waitForTimeout(500);
const filmFramePath = path.join(outputDir, "film-first-frame.png");
await filmPage.locator("#film").screenshot({ path: filmFramePath });
await browser.close();

const report = {
  contract: "A1NoaaCanonicalFilmVerification/v1",
  projectId,
  sourceProjectContract: state.contract || "",
  sceneCount: state.shots?.length || 0,
  assetCount: state.assets?.length || 0,
  sourceReferences: state.sourceReferences || [],
  render: {
    contract: rendered.contract,
    version: rendered.version,
    publicUrl: rendered.publicUrl,
    reportPath: rendered.reportPath,
    size: rendered.size,
  },
  browserWorkbench: appState,
  browserFilm: filmMeta,
  artifacts: { appScreenshotPath, filmFramePath },
  checks: {
    projectRecovered: opened.ok === true && opened.projectId === projectId,
    allScenesPresent: state.shots?.length === 12 && bridge.sceneCount === 12,
    allAssetsPersisted: state.assets?.length === 10
      && state.assets.every((asset) => asset.renderAllowed === true && asset.verifiedForRender === true && Boolean(asset.sourceUrl)),
    sourceReferencesPersisted: state.sourceReferences?.length === 5
      && state.sourceReferences.every((reference) => Boolean(reference.url)),
    renderPropsValid: bridge.ok === true && bridge.validationOk === true && bridge.failureCount === 0,
    workbenchGateReady: appState.projectId === projectId
      && appState.shotCount === 12
      && appState.assetCount === 10
      && appState.renderPropsReady === "true"
      && appState.productionGateReady === "true"
      && appState.productionGateBlocked === 0
      && appState.sourceEvidenceBlocked === 0
      && appState.canonicalComposition === "A1Video",
    renderedFilmReturned: rendered.ok === true && rendered.contract === "A1RenderedFilmRefresh/v1" && Boolean(rendered.publicUrl),
    browserDecodedFilm: filmMeta.readyState === 4
      && filmMeta.videoWidth === 960
      && filmMeta.videoHeight === 540
      && Number.isFinite(filmMeta.duration)
      && filmMeta.duration > 30,
  },
};
const reportPath = path.join(outputDir, "proof.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const failures = Object.entries(report.checks).filter(([, ok]) => !ok).map(([id]) => id);
if (failures.length) {
  console.error(`NOAA canonical film verification failed: ${failures.join(", ")}`);
  console.error(`Proof: ${reportPath}`);
  process.exit(1);
}
console.log(JSON.stringify({ contract: report.contract, reportPath, appScreenshotPath, filmFramePath, sceneCount: report.sceneCount, assetCount: report.assetCount, duration: filmMeta.duration, size: rendered.size }, null, 2));
