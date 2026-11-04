#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertStoryboardPackagingDirectorPlan} from "../apps/studio-next/src/lib/a1-storyboard-packaging-director-plan-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const planPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/current-storyboard-packaging-director-plan-v1/plan.json");
const plan = assertStoryboardPackagingDirectorPlan(JSON.parse(fs.readFileSync(planPath, "utf8")));
const authority = workspace.production.shotIntelligence.currentStoryboardAuthority;
const shots = authority.shots.filter((shot) => plan.shots.some((item) => item.shotId === shot.shotId && item.family !== "VERIFIED_SCREEN_OPERATION")).sort((a, b) => a.order - b.order);
if (shots.length !== 18) throw new Error(`hyperframes-packaging-non-screen-count:${shots.length}`);
let offset = 0;
const clips = shots.map((shot) => { const duration = Math.max(1, Number(shot.timeRange?.durationMs || 3000) / 1000); const start = Math.max(0, offset - (offset ? .28 : 0)); offset = start + duration; const family = plan.shots.find((item) => item.shotId === shot.shotId)?.family || "CONTROLLED_PACKAGE_FIELD"; return {shotId: shot.shotId, start, duration, src: shot.artifactPublicUrl, localSrc: `assets/${shot.shotId}.png`, route: shot.route || "UNBOUND", family}; });
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A1 Current Storyboard Packaging Plan</title><style>html,body{margin:0;background:#15191a;color:#f2f3ee;font-family:system-ui,sans-serif}#root{position:relative;width:100vw;height:100vh;overflow:hidden;background:#15191a}.clip{position:absolute;inset:0;opacity:0;overflow:hidden}.clip img{width:100%;height:100%;object-fit:cover;display:block;will-change:opacity,transform}.clip[data-family="EXACT_IDENTITY_EDITORIAL_FIELD"] img{transform-origin:50% 50%}.clip[data-family="VERIFIED_EVIDENCE_FIELD"] img{transform-origin:45% 50%}.clip[data-family="REAL_PRESENTER_HOLD"] img{transform-origin:50% 50%}.clip[data-family="GENERATIVE_ACTOR_HANDOFF"] img{transform-origin:50% 50%}</style></head><body><div id="root" data-composition-id="a1-current-storyboard-packaging" data-width="1920" data-height="1080" data-start="0" data-duration="${offset}" data-track-index="0">${clips.map((clip, index) => `<div id="${clip.shotId}" class="clip" data-family="${clip.family}" data-route="${clip.route}" data-start="${clip.start}" data-duration="${clip.duration}" data-track-index="${index % 2}"><img src="${clip.localSrc}" alt="${clip.shotId}"></div>`).join("")}<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});${clips.map((clip) => { const motion = clip.family === "EXACT_IDENTITY_EDITORIAL_FIELD" ? `{opacity:0,scale:.995,x:0}` : clip.family === "VERIFIED_EVIDENCE_FIELD" ? `{opacity:0,scale:1.012,x:-12}` : clip.family === "GENERATIVE_ACTOR_HANDOFF" ? `{opacity:0,scale:1.02,x:0}` : `{opacity:0,scale:1.006,x:0}`; return `tl.fromTo("#${clip.shotId}",${motion},{opacity:1,scale:1,x:0,duration:.42,ease:"expo.out"},${clip.start});`; }).join("")}window.__timelines["a1-current-storyboard-packaging"] = tl;</script></div></body></html>`;
const output = path.join(root, "work/current-storyboard-packaging-plan-v1/hyperframes");
fs.mkdirSync(output, {recursive: true});
const publicAssets = path.join(output, "assets");
fs.mkdirSync(publicAssets, {recursive: true});
for (const clip of clips) {
  const sourceFile = path.join(appRoot, "public", clip.src.replace(/^\//u, ""));
  if (!fs.existsSync(sourceFile)) throw new Error(`hyperframes-current-asset-missing:${clip.shotId}`);
  fs.copyFileSync(sourceFile, path.join(publicAssets, `${clip.shotId}.png`));
}
let trackCursor = 0;
const warningFreeHtml = html.replace(/data-track-index="[0-9]+"/gu, () => `data-track-index="${trackCursor++}"`);
fs.writeFileSync(path.join(output, "index.html"), warningFreeHtml);
fs.writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify({contract: "A1StoryboardPackagingHyperFramesManifest/v1", status: "READY_FOR_STRUCTURE_REVIEW", planSha256: plan.planSha256, shotCount: clips.length, compositionId: "a1-current-storyboard-packaging", rendererRoles: {hyperframes: "TIMELINE_AND_STRUCTURE_AUDIT", remotion: "PIXEL_RENDER"}, productionAdmission: false}, null, 2)}\n`);
console.log(JSON.stringify({status: "PASS", contract: "A1StoryboardPackagingHyperFramesManifest/v1", planSha256: plan.planSha256, shotCount: clips.length, composition: "a1-current-storyboard-packaging", output: path.relative(root, path.join(output, "index.html")), productionAdmission: false}, null, 2));
