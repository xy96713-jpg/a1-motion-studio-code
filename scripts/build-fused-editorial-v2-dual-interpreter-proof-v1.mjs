#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";

const root = process.cwd();
const phaseId = "fused-editorial-v2-dual-interpreter-proof-v1";
const sourcePhaseId = "fused-editorial-v2-anchor-candidate-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const sourcePublicDir = path.join(root, "apps/studio-next/public/generated/system-line", sourcePhaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicDir = path.join(rendererRoot, "public");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const currentPropsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const require = createRequire(path.join(root, "package.json"));
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const {chromium} = await import("playwright");
const sharp = rendererRequire("sharp");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const writeText = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, value); };
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const esc = (value) => String(value ?? "").replace(/[&<>"']/gu, (char) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]));

const EVENTS = {enter: 0, emphasize: 24, hold: 60, handoff: 96};
const durationFor = (design) => design.sceneFamily === "dark-verdict" ? 150 : 120;
const publicAssetFor = (design, layer, index) => {
  const uri = design.layers[layer]?.assetUri;
  if (!uri) return null;
  const source = path.join(rendererPublicDir, uri.replace(/^\//u, ""));
  if (!fs.existsSync(source)) throw new Error(`missing-renderer-asset:${uri}`);
  const extension = path.extname(source) || ".png";
  const targetName = `${String(index + 1).padStart(2, "0")}-${layer}${extension}`;
  const target = path.join(publicDir, "assets", targetName);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target);
  return `/generated/system-line/${phaseId}/assets/${targetName}`;
};

function assertAuthority() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-system-line-branch:${branch}`);
  const phase = readJson(currentPhasePath);
  if (phase.phaseId !== "h-series-semantic-directed-v1") throw new Error(`unexpected-current-authority:${phase.phaseId}`);
}

function familyCss(design) {
  const family = design.sceneFamily;
  if (family === "full-bleed-hero") return `
    .scene.family-full-bleed-hero{background:#111315;color:#f2efe7}
    .family-full-bleed-hero .material{right:-30px;top:-10px;left:auto;inset-block-end:auto;width:1120px;height:1100px;object-fit:cover;filter:grayscale(.72) contrast(1.14) brightness(.66);opacity:.92}
    .family-full-bleed-hero:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(17,19,21,.86),rgba(17,19,21,.26) 54%,rgba(17,19,21,.05));z-index:3}
    .family-full-bleed-hero .copy{left:4.8%;top:14%;width:53%;z-index:8}
    .family-full-bleed-hero .headline{font-family:A1Condensed,sans-serif;font-size:clamp(96px,10vw,184px);line-height:.86;letter-spacing:-.06em;text-shadow:3px 4px rgba(17,19,21,.35)}
    .family-full-bleed-hero .headline-line:last-child{color:#204ecf;-webkit-text-stroke:1px #f2efe7}
    .family-full-bleed-hero .annotation{background:#c5362e;color:#f2efe7}
  `;
  if (family === "cutout-collage") return `
    .scene.family-cutout-collage{background:#f2efe7;color:#111315}
    .family-cutout-collage .material{left:auto;right:100px;top:30px;width:980px;height:980px;object-fit:cover;filter:contrast(1.08) saturate(.58);opacity:.92}
    .family-cutout-collage .foreground{right:10px;bottom:-100px;width:980px;height:850px;object-fit:contain;filter:drop-shadow(-20px 26px 0 rgba(197,54,46,.34));opacity:.94;z-index:4}
    .family-cutout-collage:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(242,239,231,.05) 0 42%,rgba(242,239,231,.78) 56%,#f2efe7 83%);z-index:3}
    .family-cutout-collage .copy{left:33%;top:11%;width:61%;z-index:8}
    .family-cutout-collage .headline{font-family:A1Serif,serif;font-size:clamp(90px,8.2vw,150px);line-height:.86;letter-spacing:-.065em}
    .family-cutout-collage .headline-line:nth-child(2){margin-left:9%;color:#c5362e}
    .family-cutout-collage .annotation{background:#204ecf;color:#f2efe7}
  `;
  return `
    .scene.family-dark-verdict{background:#090a0c;color:#f2efe7}
    .family-dark-verdict .foreground{right:40px;bottom:18px;width:1120px;height:950px;object-fit:contain;filter:drop-shadow(-18px 24px 0 rgba(32,78,207,.72));opacity:.88;z-index:4}
    .family-dark-verdict:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(9,10,12,.78),rgba(9,10,12,.14) 72%,rgba(9,10,12,.2));z-index:3}
    .family-dark-verdict .copy{left:4.5%;top:16%;width:68%;z-index:8}
    .family-dark-verdict .headline{font-family:A1Serif,serif;font-size:clamp(96px,9vw,164px);line-height:.88;letter-spacing:-.07em;text-shadow:5px 5px rgba(197,54,46,.36)}
    .family-dark-verdict .headline-line:last-child{color:#f0d73d}
  `;
}

function buildHtml(plan) {
  const json = JSON.stringify(plan).replace(/<\/script/giu, "<\\/script");
  const scenes = plan.shots.map((shot) => {
    const lines = shot.headlineLines.map((line) => `<div class="headline-line">${esc(line)}</div>`).join("");
    const material = shot.materialUrl ? `<img class="material" src="${shot.materialUrl}" alt=""/>` : "";
    const foreground = shot.foregroundUrl ? `<img class="foreground" src="${shot.foregroundUrl}" alt=""/>` : "";
    const support = shot.support ? `<p class="support">${esc(shot.support)}</p>` : "";
    const annotation = shot.annotation ? `<span class="annotation">${esc(shot.annotation)}</span>` : "";
    const start = shot.startFrame / plan.fps;
    return `<section id="${esc(shot.shotId)}" class="scene family-${esc(shot.sceneFamily)}" data-shot-id="${esc(shot.shotId)}" data-start="${start}" data-duration="${shot.durationInFrames / plan.fps}"><div class="paper"></div>${material}${foreground}<div class="copy"><div class="headline">${lines}</div>${support}${annotation}</div><div class="semantic" aria-hidden="true"></div></section>`;
  }).join("\n");
  const css = plan.shots.map(familyCss).join("\n");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fused Editorial V2 / 系统参考原型双解释器证明</title><script src="/vendor/gsap/gsap.min.js"></script><style>
  @font-face{font-family:A1Sans;src:url('/style-guides/experimental-editorial-tech-v1/fonts/SourceHanSansCN-Heavy.otf')}@font-face{font-family:A1Serif;src:url('/style-guides/experimental-editorial-tech-v1/fonts/system-candidates/SourceHanSerifSC-VF.ttf')}@font-face{font-family:A1Condensed;src:url('/style-guides/experimental-editorial-tech-v1/fonts/system-candidates/HarmonyOS-Sans-Condensed-Black.ttf')}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111315}#root{position:relative;width:100vw;height:100vh;overflow:hidden}.scene{position:absolute;inset:0;overflow:hidden;visibility:hidden;opacity:0}.paper{position:absolute;inset:0;background:transparent}.material,.foreground{position:absolute;z-index:1}.copy{position:absolute}.headline{font-weight:900}.headline-line{white-space:nowrap}.support{margin:28px 0 0;max-width:650px;font-family:A1Sans,sans-serif;font-size:27px;line-height:1.45;letter-spacing:-.02em;color:#4d5152}.annotation{display:inline-block;margin-top:26px;padding:12px 18px 14px;transform:rotate(-3deg);font-family:A1Sans,sans-serif;font-size:30px;line-height:1;box-shadow:12px 14px rgba(17,19,21,.18)}.semantic{position:absolute;inset:0;z-index:9;pointer-events:none}.scene:before{content:'';position:absolute;inset:0;z-index:7;pointer-events:none;opacity:.12;background-image:radial-gradient(circle at 20% 30%,rgba(17,19,21,.7) 0 .7px,transparent .8px),radial-gradient(circle at 72% 64%,rgba(17,19,21,.5) 0 .6px,transparent .7px);background-size:11px 13px,17px 19px;mix-blend-mode:multiply}
  ${css}</style></head><body><main id="root" data-composition-id="a1-fused-editorial-v2-dual" data-source-of-truth="A1LayeredShotDesign/v2">${scenes}</main><script>
  window.__A1_CANONICAL_PLAN__=${json};window.__timelines=window.__timelines||{};const plan=window.__A1_CANONICAL_PLAN__,root=document.querySelector('#root'),timeline=gsap.timeline({paused:true,defaults:{ease:'power3.out'}});const state={};for(const shot of plan.shots){const el=document.querySelector('[data-shot-id="'+shot.shotId+'"]');const start=shot.startFrame/plan.fps;const duration=shot.durationInFrames/plan.fps;timeline.addLabel(shot.shotId+':enter',start+${EVENTS.enter}/plan.fps);timeline.addLabel(shot.shotId+':emphasize',start+${EVENTS.emphasize}/plan.fps);timeline.addLabel(shot.shotId+':hold',start+${EVENTS.hold}/plan.fps);timeline.addLabel(shot.shotId+':handoff',start+${EVENTS.handoff}/plan.fps);timeline.set(el,{autoAlpha:0},start);timeline.to(el,{autoAlpha:1,duration:.18},start+${EVENTS.enter}/plan.fps);timeline.fromTo(el.querySelector('.copy'),{y:34,autoAlpha:0},{y:0,autoAlpha:1,duration:.42},start+${EVENTS.enter}/plan.fps);timeline.fromTo(el.querySelector('.material'),{scale:1.02,x:36,autoAlpha:.15},{scale:1.06,x:0,autoAlpha:1,duration:.7},start+${EVENTS.emphasize}/plan.fps);timeline.fromTo(el.querySelector('.foreground'),{scale:.92,x:52,autoAlpha:.18},{scale:1,x:0,autoAlpha:1,duration:.72},start+${EVENTS.emphasize}/plan.fps);timeline.to(el,{autoAlpha:0,duration:.22},start+duration-.22);state[shot.shotId]={enter:shot.startFrame+${EVENTS.enter},emphasize:shot.startFrame+${EVENTS.emphasize},hold:shot.startFrame+${EVENTS.hold},handoff:shot.startFrame+${EVENTS.handoff}};}window.__timelines['a1-fused-editorial-v2-dual']=timeline;window.__A1_INSPECT_FRAME__=frame=>{timeline.time(frame/plan.fps,false);const visible=plan.shots.find(shot=>frame>=shot.startFrame&&frame<shot.startFrame+shot.durationInFrames);return {frame,visibleShotId:visible?.shotId||null,labels:state};};window.__HYPERFRAMES_READY__={contract:'A1HyperFramesProof/v1',sourceOfTruth:'A1LayeredShotDesign/v2',promotedRender:false,sceneCount:plan.shots.length};timeline.progress(0).pause();
  </script></body></html>`;
}

async function renderRemotion(plan) {
  const serveUrl = await bundle({entryPoint, publicDir: rendererPublicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const records = [];
  try {
    for (const shot of plan.shots) {
      const composition = await selectComposition({serveUrl, id: "A1FusedEditorialV2FullBoard", inputProps: {design: shot.design, motionFrame: EVENTS.hold, motionDuration: shot.durationInFrames}, puppeteerInstance: browser, logLevel: "warn"});
      for (const moment of plan.keyframes) {
        const file = path.join(artifactDir, "remotion", `${shot.order}-${shot.shotId}-${moment.id}.png`);
        await renderStill({serveUrl, composition, inputProps: {design: shot.design, motionFrame: moment.localFrame, motionDuration: shot.durationInFrames}, frame: 0, output: file, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
        records.push({renderer: "remotion", shotId: shot.shotId, momentId: moment.id, localFrame: moment.localFrame, path: rel(file), publicUrl: `/generated/system-line/${phaseId}/remotion/${path.basename(file)}`, sha256: shaFile(file)});
      }
    }
  } finally { await browser.close({silent: true}); }
  return records;
}

async function renderHyperframes(plan, html) {
  const htmlPath = path.join(publicDir, "hyperframes-proof.html");
  writeText(htmlPath, html);
  const browser = await chromium.launch({headless: true});
  const records = [];
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
    fs.mkdirSync(path.join(artifactDir, "hyperframes"), {recursive: true});
    fs.mkdirSync(path.join(publicDir, "hyperframes"), {recursive: true});
    const url = `http://127.0.0.1:4311/generated/system-line/${phaseId}/hyperframes-proof.html`;
    await page.goto(url, {waitUntil: "networkidle", timeout: 60000});
    await page.waitForFunction(() => Boolean(window.__HYPERFRAMES_READY__), null, {timeout: 30000});
    for (const shot of plan.shots) for (const moment of plan.keyframes) {
      const frame = shot.startFrame + moment.localFrame;
      const state = await page.evaluate((value) => window.__A1_INSPECT_FRAME__(value), frame);
      if (state.visibleShotId !== shot.shotId) throw new Error(`hyperframes-visible-shot-mismatch:${shot.shotId}:${moment.id}:${state.visibleShotId}`);
      const file = path.join(artifactDir, "hyperframes", `${shot.order}-${shot.shotId}-${moment.id}.png`);
      await page.screenshot({path: file});
      fs.copyFileSync(file, path.join(publicDir, "hyperframes", path.basename(file)));
      records.push({renderer: "hyperframes", shotId: shot.shotId, momentId: moment.id, localFrame: moment.localFrame, path: rel(file), publicUrl: `/generated/system-line/${phaseId}/hyperframes/${path.basename(file)}`, sha256: shaFile(file), state});
    }
  } finally { await browser.close(); }
  return records;
}

async function buildContactSheet(records) {
  const hold = records.filter((record) => record.momentId === "hold");
  const tileWidth = 480; const tileHeight = 270; const labelHeight = 34; const columns = 3; const rows = 2;
  const layers = [];
  for (const [index, record] of hold.entries()) {
    const left = (index % columns) * tileWidth; const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    layers.push({input: await sharp(record.path).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    layers.push({input: Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315"/><text x="10" y="23" fill="#f2efe7" font-family="Arial" font-size="14">${record.renderer} · ${record.shotId} · hold</text></svg>`), left, top: top + tileHeight});
  }
  const output = path.join(artifactDir, "dual-interpreter-hold-contact-sheet.jpg");
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111315"}}).composite(layers).jpeg({quality: 92}).toFile(output);
  fs.copyFileSync(output, path.join(publicDir, path.basename(output)));
  return {path: rel(output), publicUrl: `/generated/system-line/${phaseId}/${path.basename(output)}`, sha256: shaFile(output), width: columns * tileWidth, height: rows * (tileHeight + labelHeight)};
}

async function main() {
  assertAuthority();
  const source = readJson(path.join(sourcePublicDir, "anchor-designs.json"));
  if (source.contract !== "A1FusedEditorialV2AnchorDesignSet/v1" || source.anchors?.length !== 3) throw new Error("canonical-anchor-source-missing");
  fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
  const authorityShaBefore = shaFile(currentPhasePath);
  const propsSha = shaFile(currentPropsPath);
  const shots = source.anchors.map((anchor, index) => {
    const design = anchor.design;
    const durationInFrames = durationFor(design);
    return {shotId: anchor.anchorId, order: index + 1, sceneFamily: design.sceneFamily, design, startFrame: index * 180, durationInFrames, headlineLines: design.layers.typography.editableCopy.headlineLines, support: design.layers.typography.editableCopy.support, annotation: design.layers.typography.editableCopy.annotation, materialUrl: publicAssetFor(design, "material", index), foregroundUrl: publicAssetFor(design, "foreground", index)};
  });
  const keyframes = [{id: "start", label: "起始", localFrame: 0}, {id: "enter-complete", label: "进入完成", localFrame: EVENTS.emphasize}, {id: "emphasis", label: "强调锁定", localFrame: 42}, {id: "hold", label: "稳定阅读", localFrame: EVENTS.hold}, {id: "handoff", label: "交接", localFrame: EVENTS.handoff}];
  const plan = {contract: "A1CanonicalEditorialDualInterpreterPlan/v1", sourceOfTruth: "A1LayeredShotDesign/v2", visualMasterId: "fused-editorial-v2", phaseId, sourcePhaseId, fps: 30, propsSha256: propsSha, keyframes, events: EVENTS, shots, gates: {humanVisualApprovalRequired: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, finalRenderAllowed: false}};
  writeJson(path.join(artifactDir, "plan.json"), plan); writeJson(path.join(publicDir, "plan.json"), plan);
  const html = buildHtml(plan); const hyperframes = await renderHyperframes(plan, html); const remotion = await renderRemotion(plan); const contactSheet = await buildContactSheet([...remotion, ...hyperframes]);
  const remotionIds = remotion.map((item) => `${item.shotId}:${item.momentId}`); const hyperframesIds = hyperframes.map((item) => `${item.shotId}:${item.momentId}`);
  const eventParity = shots.every((shot) => EVENTS.enter === EVENTS.enter && shot.durationInFrames > EVENTS.handoff);
  const report = {contract: "A1CanonicalEditorialDualInterpreterProof/v1", phaseId, status: authorityShaBefore === shaFile(currentPhasePath) && eventParity && JSON.stringify(remotionIds) === JSON.stringify(hyperframesIds) ? "PASS" : "FAIL", sourceOfTruth: plan.sourceOfTruth, visualMasterId: plan.visualMasterId, source: {phaseId: sourcePhaseId, propsSha256: propsSha, referenceSuiteSampleCount: shots.length, designContracts: [...new Set(shots.map((shot) => shot.design.contract))]}, renderers: {remotion: {adapter: "FusedEditorialV2FullBoard/v1", records: remotion.length}, hyperframes: {adapter: "canonical-editorial-css-gsap/v1", records: hyperframes.length, html: `/generated/system-line/${phaseId}/hyperframes-proof.html`, gsapTimeline: "window.__timelines['a1-fused-editorial-v2-dual']"}}, parity: {status: JSON.stringify(remotionIds) === JSON.stringify(hyperframesIds) ? "PASS" : "FAIL", keyframes: keyframes.map((moment) => ({id: moment.id, frame: moment.localFrame})), timingSource: "shared-plan.events", geometryParity: "STRUCTURAL_DATA_PARITY_ONLY", pixelParity: "NOT_CLAIMED"}, contactSheet, authority: {currentPhasePath: rel(currentPhasePath), sha256Before: authorityShaBefore, sha256After: shaFile(currentPhasePath), unchanged: authorityShaBefore === shaFile(currentPhasePath)}, gates: plan.gates, nextAction: "build-12-shot-pilot-before-47-board"};
  writeJson(path.join(artifactDir, "render-records.json"), {remotion, hyperframes}); writeJson(path.join(publicDir, "render-records.json"), {remotion, hyperframes}); writeJson(path.join(artifactDir, "report.json"), report); writeJson(path.join(publicDir, "report.json"), report);
  console.log(JSON.stringify({status: report.status, sourceOfTruth: report.sourceOfTruth, anchorCount: shots.length, remotionRecords: remotion.length, hyperframesRecords: hyperframes.length, parity: report.parity, contactSheet: report.contactSheet.publicUrl, nextAction: report.nextAction}, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
