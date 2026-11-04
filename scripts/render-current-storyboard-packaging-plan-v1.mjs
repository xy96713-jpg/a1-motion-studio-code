#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertStoryboardPackagingDirectorPlan} from "../apps/studio-next/src/lib/a1-storyboard-packaging-director-plan-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const workspace = readProjectWorkspace(appRoot);
const planPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/current-storyboard-packaging-director-plan-v1/plan.json");
const plan = assertStoryboardPackagingDirectorPlan(JSON.parse(fs.readFileSync(planPath, "utf8")));
const authority = workspace.production.shotIntelligence.currentStoryboardAuthority;
const nonScreenIds = new Set(plan.shots.filter((shot) => shot.family !== "VERIFIED_SCREEN_OPERATION").map((shot) => shot.shotId));
const shots = authority.shots.filter((shot) => nonScreenIds.has(shot.shotId)).sort((a, b) => a.order - b.order).map((shot) => ({shotId: shot.shotId, order: shot.order, durationInFrames: Math.max(1, Math.round(Number(shot.timeRange?.durationMs || 3000) / 1000 * 30)), staticFrame: shot.artifactPublicUrl, route: shot.route || null}));
if (shots.length !== 18) throw new Error(`current-packaging-plan-non-screen-count:${shots.length}`);
const inputProps = {contract: "A1CurrentStoryboardPackagingPlanPreview/v1", planSha256: plan.planSha256, shots};
const outputDir = path.join(root, "work/current-storyboard-packaging-plan-v1");
fs.mkdirSync(outputDir, {recursive: true});
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: path.join(appRoot, "public"), rootDir: rendererRoot, enableCaching: false});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
try {
  const composition = await selectComposition({serveUrl, id: "A1CurrentStoryboardPackagingPlanPreviewV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
  const output = path.join(outputDir, "non-screen-18-review-960x540.mp4");
  await renderMedia({serveUrl, composition, inputProps, codec: "h264", outputLocation: output, scale: .5, crf: 18, puppeteerInstance: browser, logLevel: "warn"});
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify({contract: "A1CurrentStoryboardPackagingPlanPreviewManifest/v1", status: "REVIEW_ONLY", planSha256: plan.planSha256, shotCount: shots.length, shotIds: shots.map((shot) => shot.shotId), output: path.relative(root, output), productionAdmission: false, fullFilmMotionAllowed: false}, null, 2)}\n`);
  console.log(JSON.stringify({status: "PASS", contract: "A1CurrentStoryboardPackagingPlanPreviewManifest/v1", planSha256: plan.planSha256, shotCount: shots.length, output: path.relative(root, output), productionAdmission: false, fullFilmMotionAllowed: false}, null, 2));
} finally { await browser.close({silent: true}); }
