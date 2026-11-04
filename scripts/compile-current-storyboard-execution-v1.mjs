#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const outputRoot = path.join(root, "work/current-hyperframes-storyboard-execution-v1");
const publicRoot = "/generated/system-line/editorial-asset-workbench-v1";
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const slug = (shotId) => shotId.toLowerCase();
const packagingGrammarFor = (route, packageType) => route === "SCREEN_EVIDENCE"
  ? "SCREEN_EVIDENCE"
  : route === "PRESENTER_BASE"
    ? "PRESENTER_CLEAN"
    : packageType === "TYPOGRAPHY_PACKAGE"
      ? "TYPOGRAPHY_PUNCH"
      : packageType === "EXPLAINER_PACKAGE"
        ? "EVIDENCE_DIAGRAM"
        : packageType === "OVERLAY_PACKAGE"
          ? "PRESENTER_LOCAL_MARKER"
          : "SOURCE_COLLAGE";
const write = (file, content) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, content); };

const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const authority = workspace.production?.shotIntelligence?.currentStoryboardAuthority;
const coverage = workspace.production?.shotVisualCoveragePlan?.shotPlans || [];
const timeline = workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.items || [];
if (authority?.contract !== "A1CurrentStoryboardAuthority/v1" || authority.current !== true) throw new Error("current-storyboard-authority-required");
if (authority.shots?.length !== 34 || coverage.length !== 34 || timeline.length !== 34) throw new Error("current-storyboard-must-have-34-shots");

if (fs.existsSync(outputRoot)) {
  const archiveRoot = path.join(outputRoot, "revisions");
  const existingVideo = path.join(outputRoot, "review-only-current-storyboard.mp4");
  if (fs.existsSync(existingVideo)) {
    fs.mkdirSync(archiveRoot, {recursive: true});
    const archivePath = path.join(archiveRoot, `render-${new Date().toISOString().replaceAll(/[^0-9]/gu, "").slice(0, 14)}`);
    fs.renameSync(existingVideo, archivePath + ".mp4");
  }
  for (const entry of fs.readdirSync(outputRoot)) {
    if (entry === "revisions") continue;
    fs.rmSync(path.join(outputRoot, entry), {recursive: true, force: true});
  }
}
fs.mkdirSync(outputRoot, {recursive: true});
fs.mkdirSync(path.join(outputRoot, "assets"), {recursive: true});

const coverageByShot = new Map(coverage.map((shot) => [shot.shotId, shot]));
const timelineByShot = new Map(timeline.map((shot) => [shot.shotId, shot]));
const shots = [...authority.shots].sort((a, b) => a.order - b.order).map((authorityShot) => {
  const plan = coverageByShot.get(authorityShot.shotId) || {};
  const time = timelineByShot.get(authorityShot.shotId) || {};
  const previewUrl = authorityShot.artifactPublicUrl || plan.preview?.publicUrl || null;
  const localPreview = previewUrl ? path.join(root, "apps/studio-next/public", previewUrl.replace(/^\//u, "")) : null;
  let assetName = null;
  if (localPreview && fs.existsSync(localPreview)) {
    assetName = `${slug(authorityShot.shotId)}${path.extname(localPreview) || ".png"}`;
    fs.copyFileSync(localPreview, path.join(outputRoot, "assets", assetName));
  }
  const actionContract = authorityShot.actionContract || {
    before: "SOURCE_STATE_REQUIRED",
    hold: "SHOT_STATE_READABLE",
    after: "HANDOFF_TO_NEXT_SHOT",
    handoff: "NEXT_SHOT",
  };
  return {
    shotId: authorityShot.shotId,
    order: authorityShot.order,
    sourceText: plan.sourceText || authorityShot.sourceText || "",
    semanticJob: plan.semanticJob || authorityShot.semanticJob || "",
    route: authorityShot.route || plan.route || "PRESENTER_BASE",
    packageDecision: plan.packageDecision || "NO_PACKAGE",
    packageType: plan.packageType || null,
    packagingGrammar: packagingGrammarFor(authorityShot.route || plan.route || "PRESENTER_BASE", plan.packageType || null),
    presentationMode: authorityShot.presentationMode || plan.presentationMode || null,
    frameOccupation: authorityShot.frameOccupation || plan.frameOccupation || null,
    timeRange: time.timeRange || {startMs: 0, endMs: 3000, durationMs: 3000},
    actionContract,
    stateSequence: authorityShot.stateSequence || ["BEFORE", "HOLD", "AFTER"],
    previewUrl,
    previewSha256: authorityShot.artifactSha256 || plan.preview?.sha256 || null,
    localAsset: assetName,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
  };
});

const maxEndMs = Math.max(...shots.map((shot) => shot.timeRange.endMs));
const projectMeta = {
  contract: "A1HyperFramesStoryboardExecutionProject/v1",
  status: "REVIEW_ONLY_COMPILED",
  source: {
    workspacePath: path.relative(root, workspacePath),
    workspaceSha256: workspace.workspaceSha256,
    workspaceFileSha256: sha256File(workspacePath),
    storyboardAuthorityContract: authority.contract,
    storyboardAuthorityRevision: authority.updatedAt || null,
    shotCount: shots.length,
  },
  renderPolicy: {
    reviewOnly: true,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    resolveExportAllowed: false,
    finalRenderAllowed: false,
  },
  hyperframes: {rootCompositionId: "a1-current-storyboard", width: 1920, height: 1080, fps: 30, durationMs: maxEndMs},
};

const compositionManifest = shots.map((shot) => ({
  shotId: shot.shotId,
  compositionId: slug(shot.shotId),
  source: `compositions/${slug(shot.shotId)}.html`,
  startMs: shot.timeRange.startMs,
  endMs: shot.timeRange.endMs,
  durationMs: shot.timeRange.durationMs,
  previewUrl: shot.previewUrl,
  previewSha256: shot.previewSha256,
  actionContract: shot.actionContract,
}));

for (const shot of shots) {
  const startSec = (shot.timeRange.startMs / 1000).toFixed(3);
  const durationSec = (shot.timeRange.durationMs / 1000).toFixed(3);
  const assetMarkup = shot.localAsset
    ? `<img class="preview" src="assets/${esc(shot.localAsset)}" alt="${esc(shot.shotId)} preview" />`
    : `<div class="preview missing">NO PREVIEW<br /><small>${esc(shot.route)}</small></div>`;
  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><meta name="viewport" content="width=1920,height=1080" /><title>${esc(shot.shotId)} · storyboard composition</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#101314;color:#f1f3ee;font-family:Arial,sans-serif}#root{position:relative;width:1920px;height:1080px;padding:88px 120px;background:radial-gradient(circle at 78% 20%,#29352d 0,#101314 44%,#090b0c 100%)}.eyebrow{font:700 22px ui-monospace,monospace;letter-spacing:.16em;color:#c9ef39}.title{margin-top:28px;max-width:1480px;font-size:72px;line-height:1.06;letter-spacing:-.05em}.meta{margin-top:28px;display:flex;gap:14px;flex-wrap:wrap;font:700 20px ui-monospace,monospace;color:#a9b2aa}.pill{border:1px solid #ffffff25;padding:10px 16px;border-radius:999px}.body{display:grid;grid-template-columns:1.08fr .92fr;gap:64px;margin-top:56px}.copy{font-size:34px;line-height:1.5;color:#d9dfd9}.contract{margin-top:24px;border-left:4px solid #c9ef39;padding-left:24px;font:16px/1.35 ui-monospace,monospace;color:#d9dfd9;max-height:380px;overflow:hidden}.contract b{color:#c9ef39}.preview{width:100%;max-height:530px;object-fit:contain;background:#050607;border:1px solid #ffffff18;border-radius:18px}.missing{height:420px;display:flex;align-items:center;justify-content:center;text-align:center;font:700 30px ui-monospace,monospace;color:#f0a06b}.missing small{font-size:18px;color:#aeb8af}.footer{position:absolute;left:120px;right:120px;bottom:24px;display:flex;justify-content:space-between;font:14px ui-monospace,monospace;color:#f1f3ee}
</style></head>
<body><main id="root" data-composition-id="${esc(slug(shot.shotId))}" data-no-timeline data-start="${startSec}" data-duration="${durationSec}" data-width="1920" data-height="1080" data-fps="30" data-a1-shot-id="${esc(shot.shotId)}" data-a1-source-workspace-sha256="${workspace.workspaceSha256}" data-a1-source-preview-sha256="${shot.previewSha256 || "missing"}">
<div class="eyebrow">A1 STORYBOARD EXECUTION · ${esc(shot.shotId)}</div><h1 class="title">${esc(shot.sourceText)}</h1>
<div class="meta"><span class="pill">${esc(shot.route)}</span><span class="pill">${esc(shot.packageDecision)}</span><span class="pill">${esc(shot.presentationMode || "SOURCE")}</span><span class="pill">${startSec}s → ${(shot.timeRange.endMs / 1000).toFixed(3)}s</span></div>
<div class="body"><section><p class="copy">${esc(shot.semanticJob)}</p><div class="contract"><div><b>BEFORE</b> ${esc(shot.actionContract.before)}</div><div><b>HOLD</b> ${esc(shot.actionContract.hold)}</div><div><b>AFTER</b> ${esc(shot.actionContract.after)}</div><div><b>HANDOFF</b> ${esc(shot.actionContract.handoff)}</div></div></section><section>${assetMarkup}</section></div>
<div class="footer"><span>REVIEW ONLY · PRODUCTION ADMISSION FALSE</span><span>USER VISUAL APPROVAL · NOT APPROVED</span></div></main></body></html>`;
  write(path.join(outputRoot, "compositions", `${slug(shot.shotId)}.html`), html);
}

const compositionMarkup = shots.map((shot) => `<div id="c-${slug(shot.shotId)}" data-composition-id="${slug(shot.shotId)}" data-composition-src="compositions/${slug(shot.shotId)}.html" data-no-timeline data-start="${(shot.timeRange.startMs / 1000).toFixed(3)}" data-duration="${(shot.timeRange.durationMs / 1000).toFixed(3)}" data-width="1920" data-height="1080" data-track-index="1"></div>`).join("\n      ");
const localGsap = path.join(root, "apps/studio-next/public/vendor/gsap/gsap.min.js");
if (!fs.existsSync(localGsap)) throw new Error("local-gsap-required");
fs.copyFileSync(localGsap, path.join(outputRoot, "assets", "gsap.min.js"));
const index = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=1920,height=1080" /><title>A1 Current Storyboard · HyperFrames Execution</title><style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#101314}#master{position:relative;width:1920px;height:1080px}#master>[data-composition-id]{position:absolute;inset:0;visibility:hidden}</style><script src="assets/gsap.min.js"></script></head><body><main id="master" data-composition-id="a1-current-storyboard" data-start="0" data-duration="${(maxEndMs / 1000).toFixed(3)}" data-width="1920" data-height="1080" data-fps="30">${compositionMarkup}</main><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});const shots=${JSON.stringify(shots.map((shot)=>({id:slug(shot.shotId),start:shot.timeRange.startMs/1000,end:shot.timeRange.endMs/1000})))};for(const shot of shots){const el=document.querySelector('[data-composition-id="'+shot.id+'"]');if(!el)continue;tl.set(el,{autoAlpha:1},shot.start).set(el,{autoAlpha:0},shot.end)}window.__timelines["a1-current-storyboard"]=tl;</script></body></html>`;
write(path.join(outputRoot, "index.html"), index);
write(path.join(outputRoot, "index.motion.json"), `${JSON.stringify({
  duration: maxEndMs / 1000,
  maxStaticSec: 3,
  assertions: shots.map((shot) => ({kind: "appearsBy", selector: `[data-a1-shot-id="${shot.shotId}"]`, bySec: shot.timeRange.startMs / 1000 + 1})),
}, null, 2)}\n`);
write(path.join(outputRoot, "meta.json"), `${JSON.stringify({name: "a1-current-storyboard", description: "Review-only HyperFrames execution compiled from current storyboard authority", duration: maxEndMs / 1000, resolution: {width: 1920, height: 1080}, fps: 30}, null, 2)}\n`);
write(path.join(outputRoot, "hyperframes.json"), `${JSON.stringify({
  name: "a1-current-storyboard",
  version: 1,
  entry: "index.html",
  compositionId: "a1-current-storyboard",
  width: 1920,
  height: 1080,
  fps: 30,
  duration: maxEndMs / 1000,
  sourceAuthoritySha256: workspace.workspaceSha256,
  reviewOnly: true,
}, null, 2)}\n`);
write(path.join(outputRoot, "STORYBOARD.md"), `# A1 Current Storyboard Execution\n\n- Contract: ${projectMeta.contract}\n- Source workspace SHA: ${workspace.workspaceSha256}\n- Shots: ${shots.length}\n- Review only: true\n- Production admission: false\n\n${shots.map((shot) => `## ${shot.shotId} · ${(shot.timeRange.startMs / 1000).toFixed(3)}–${(shot.timeRange.endMs / 1000).toFixed(3)}s\n\n- Route: ${shot.route}\n- Decision: ${shot.packageDecision}\n- Source: ${shot.previewUrl || "missing"}\n- BEFORE: ${shot.actionContract.before}\n- HOLD: ${shot.actionContract.hold}\n- AFTER: ${shot.actionContract.after}\n- HANDOFF: ${shot.actionContract.handoff}\n`).join("\n")}`);
write(path.join(outputRoot, "execution-manifest.json"), `${JSON.stringify({...projectMeta, shots, compositions: compositionManifest, timeline: {source: "index.html", rootCompositionId: "a1-current-storyboard", durationMs: maxEndMs, fps: 30}, render: {status: "LOCKED_UNTIL_USER_APPROVAL", command: "npx hyperframes render --quality high --output out.mp4"}, executionManifestSha256: sha256({projectMeta, shots, compositions: compositionManifest})}, null, 2)}\n`);
console.log(JSON.stringify({status: "PASS", contract: projectMeta.contract, outputRoot, workspaceSha256: workspace.workspaceSha256, shotCount: shots.length, compositionCount: compositionManifest.length, timelineDurationMs: maxEndMs, renderStatus: "LOCKED_UNTIL_USER_APPROVAL", productionAdmission: false}, null, 2));
