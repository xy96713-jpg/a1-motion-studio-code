#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "visual-system-proof-v1";
const planPath = path.join(root, "apps/studio-next/public/generated/system-line", phaseId, "render-plan.json");
const outputPath = path.join(root, "apps/studio-next/public/generated/system-line", phaseId, "hyperframes-proof.html");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const esc = (value) => String(value).replace(/[&<>"']/gu, (char) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]));
const json = JSON.stringify(plan).replace(/</gu, "\\u003c");
const duration = plan.scenes.reduce((total, scene) => total + scene.durationInFrames, 0) / plan.fps;
let offset = 0;

const sceneHtml = plan.scenes.map((scene) => {
  const start = offset;
  offset += scene.durationInFrames / plan.fps;
  const tokenHtml = scene.tokens.map((token, index) => `<span class="token token-${index}">${esc(token)}</span>`).join("");
  const material = scene.materialAsset ? `<img class="evidence-material" src="/${esc(scene.materialAsset)}" alt="" />` : `<img class="type-material" src="/style-guides/experimental-editorial-tech-v1/type-material/ai-typographic-material-v1.png" alt="" />`;
  return `<section id="${esc(scene.sceneId)}" class="system-scene family-${esc(scene.familyId)}" data-start="${start.toFixed(3)}" data-duration="${(scene.durationInFrames / plan.fps).toFixed(3)}" data-track-index="1" data-a1-scene-id="${esc(scene.sceneId)}" data-a1-family-id="${esc(scene.familyId)}" data-a1-font-id="${esc(scene.fontId)}" data-a1-event-enter="${scene.eventFrames.enter}" data-a1-event-emphasize="${scene.eventFrames.emphasize}" data-a1-event-hold="${scene.eventFrames.hold}" data-a1-event-handoff="${scene.eventFrames.handoff}">
    ${material}
    <div class="scene-copy"><div class="scene-title">${esc(scene.title)}</div><div class="scene-support">${esc(scene.support || "")}</div></div>
    <div class="tokens">${tokenHtml}</div>
    <div class="scene-mark" aria-hidden="true"></div>
  </section>`;
}).join("\n");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>A1 Visual System / HyperFrames Proof</title>
<script src="/vendor/gsap/gsap.min.js"></script>
<style>
@font-face{font-family:A1Sans;src:url('/style-guides/experimental-editorial-tech-v1/fonts/SourceHanSansCN-Heavy.otf') format('opentype');font-weight:900}
@font-face{font-family:A1Serif;src:url('/style-guides/experimental-editorial-tech-v1/fonts/system-candidates/SourceHanSerifSC-VF.ttf') format('truetype');font-weight:200 900}
@font-face{font-family:A1Noto;src:url('/style-guides/experimental-editorial-tech-v1/fonts/system-candidates/NotoSansHans-Black.otf') format('opentype');font-weight:900}
:root{background:#111315;color:#f2eadc;font-family:A1Sans, sans-serif}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111315}
[data-composition-id]{position:relative;width:100vw;height:100vh;overflow:hidden;background:#111315}
.system-scene{position:absolute;inset:0;opacity:0;visibility:hidden;overflow:hidden}
.system-scene:after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.16;mix-blend-mode:multiply;background-image:radial-gradient(circle at 17% 19%,#17191a 0 1px,transparent 1.4px),radial-gradient(circle at 72% 63%,#a92528 0 1px,transparent 1.2px);background-size:19px 19px,29px 29px}
.scene-copy{position:absolute;right:6.6%;top:8%;z-index:4;width:23%;font-family:A1Sans, sans-serif}.scene-title{font-size:clamp(38px,5.4vw,108px);line-height:.96;letter-spacing:-.06em}.scene-support{margin-top:28px;font-family:A1Serif,serif;font-size:20px;line-height:1.35;opacity:.78}.tokens{position:absolute;z-index:3;inset:0}.token{position:absolute;display:block;white-space:nowrap;font-weight:900}.scene-mark{position:absolute;z-index:5;right:0;top:0;width:12px;height:100%;background:#d8ff38;transform:scaleX(0);transform-origin:right center}
.type-material{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.14;mix-blend-mode:multiply}.evidence-material{position:absolute;left:5%;top:-140%;width:90%;height:375%;object-fit:fill;filter:contrast(1.04) saturate(.82);box-shadow:0 40px 110px rgba(0,0,0,.46)}
.family-scale-collision{background:#ece4d2;color:#111315}.family-scale-collision .scene-copy{font-family:A1Noto,A1Sans,sans-serif}.family-scale-collision .token-0{left:-2%;top:-14%;font:900 clamp(220px,33vw,520px)/1 A1Sans,sans-serif;letter-spacing:-.08em}.family-scale-collision .token-1{left:5%;bottom:-6%;font:900 clamp(180px,22vw,340px)/.8 A1Noto,sans-serif;letter-spacing:-.08em;color:#3157e6}.family-scale-collision .token-2{left:61%;top:36%;font:900 clamp(96px,15vw,240px)/1 A1Sans,sans-serif;color:#a92528;transform:rotate(-8deg)}.family-scale-collision .scene-mark{height:100%;width:22vw}
.family-evidence-macro-annotation{background:#16181a;color:#ece4d2}.family-evidence-macro-annotation .scene-copy{color:#111315;background:rgba(236,228,210,.85);padding:22px;mix-blend-mode:screen}.family-evidence-macro-annotation .token-0{left:7%;top:8%;font:900 clamp(84px,13vw,180px)/.84 A1Sans,sans-serif;color:#d8ff38}.family-evidence-macro-annotation .token-1{left:6%;bottom:8%;font:900 clamp(94px,14vw,160px)/.9 A1Sans,sans-serif;color:#101214;background:#ff4d37;padding:18px 28px;transform:rotate(-2deg)}.family-evidence-macro-annotation .token-2{right:6%;bottom:9%;font:900 clamp(82px,12vw,146px)/1 A1Serif,serif;color:#ece4d2}.family-evidence-macro-annotation .scene-mark{background:#ff4d37;right:8%;top:30%;height:20%;width:62%;transform:scaleX(0);transform-origin:left center;border:14px solid rgba(255,255,255,.75)}
.family-quiet-verdict{background:#08090a;color:#f2eadc}.family-quiet-verdict .scene-copy{font-family:A1Serif,serif}.family-quiet-verdict .token-0{left:7%;top:10%;font:800 clamp(48px,8vw,96px)/1 A1Serif,serif;letter-spacing:.08em}.family-quiet-verdict .token-1{left:6%;top:27%;font:900 clamp(142px,25vw,300px)/.95 A1Serif,serif;letter-spacing:-.08em}.family-quiet-verdict .token-2{right:8%;bottom:8%;font:900 clamp(170px,28vw,370px)/.8 A1Noto,A1Sans,sans-serif;letter-spacing:-.05em;color:#d8ff38}.family-quiet-verdict .scene-mark{right:5%;width:8px;background:linear-gradient(#ff4d37 0 33%,#3157e6 33% 66%,#d8ff38 66% 100%)}
.controls{position:fixed;z-index:20;left:20px;right:20px;bottom:20px;display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(17,19,21,.82);border:1px solid rgba(242,234,220,.2);backdrop-filter:blur(10px);font:14px/1.2 ui-monospace,monospace}.controls button{border:1px solid #d8ff38;background:transparent;color:#f2eadc;padding:6px 10px;cursor:pointer}.controls input{flex:1}.meta{opacity:.7;white-space:nowrap}
</style>
</head>
<body>
<div id="a1-visual-system-proof" data-composition-id="a1-visual-system-proof" data-width="1920" data-height="1080" data-duration="${duration.toFixed(3)}" data-track-index="0" data-a1-source-of-truth="shared-motion-ir" data-a1-contract="A1VisualSystemRenderProof/v1">
${sceneHtml}
</div>
<div class="controls"><button id="toggle">播放</button><input id="scrub" type="range" min="0" max="${duration.toFixed(3)}" step="0.01" value="0" /><span class="meta" id="readout">0.00 / ${duration.toFixed(2)}s · shared-motion-ir</span></div>
<script>
window.__A1_VISUAL_SYSTEM_PLAN__ = ${json};
window.__timelines = window.__timelines || {};
const plan = window.__A1_VISUAL_SYSTEM_PLAN__;
const duration = plan.scenes.reduce((total, scene) => total + scene.durationInFrames, 0) / plan.fps;
const root = document.querySelector('[data-composition-id="a1-visual-system-proof"]');
const scenes = plan.scenes.map(scene => ({data:scene, el:document.querySelector('[data-a1-scene-id="'+scene.sceneId+'"]')}));
const tl = gsap.timeline({paused:true, defaults:{ease:'power3.out'}});
let cursor = 0;
scenes.forEach(({data,el}) => {
  const duration = data.durationInFrames / plan.fps;
  const enterAt = data.eventFrames.enter / plan.fps;
  const emphasizeAt = data.eventFrames.emphasize / plan.fps;
  const holdAt = data.eventFrames.hold / plan.fps;
  const handoffAt = data.eventFrames.handoff / plan.fps;
  const end = cursor + duration;
  tl.addLabel(data.sceneId+':enter', cursor + enterAt);
  tl.addLabel(data.sceneId+':emphasize', cursor + emphasizeAt);
  tl.addLabel(data.sceneId+':hold', cursor + holdAt);
  tl.addLabel(data.sceneId+':handoff', cursor + handoffAt);
  tl.set(el,{autoAlpha:0},cursor);
  tl.to(el,{autoAlpha:1,duration:.18},cursor+enterAt);
  tl.fromTo(el.querySelector('.scene-copy'),{y:36,autoAlpha:0},{y:0,autoAlpha:1,duration:.48},cursor+enterAt);
  tl.fromTo(el.querySelectorAll('.token'),{y:72,scale:.82,autoAlpha:0},{y:0,scale:1,autoAlpha:1,stagger:.1,duration:.64},cursor+emphasizeAt);
  tl.fromTo(el.querySelector('.scene-mark'),{scaleX:0},{scaleX:1,duration:.42},cursor+handoffAt-.28);
  tl.to(el,{autoAlpha:0,duration:.22},end-.22);
  cursor = end;
});
window.__timelines['a1-visual-system-proof'] = tl;
window.__a1VisualSystemProof = {contract:'A1HyperFramesProof/v1', sourceOfTruth:plan.sourceOfTruth, sceneCount:scenes.length, duration, labels:Object.keys(tl.labels)};
const toggle = document.getElementById('toggle'); const scrub = document.getElementById('scrub'); const readout = document.getElementById('readout');
toggle.addEventListener('click', () => { if (tl.paused()) { tl.play(); toggle.textContent='暂停'; } else { tl.pause(); toggle.textContent='播放'; } });
scrub.addEventListener('input', () => { tl.pause(); toggle.textContent='播放'; tl.time(Number(scrub.value)); });
tl.eventCallback('onUpdate', () => { scrub.value = tl.time().toFixed(2); readout.textContent = tl.time().toFixed(2)+' / '+duration.toFixed(2)+'s · '+plan.sourceOfTruth; });
tl.progress(0).pause();
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, html);
console.log(JSON.stringify({status: "PASS", contract: "A1HyperFramesProof/v1", outputPath, sceneCount: plan.scenes.length, durationSec: duration, timelineLabels: plan.scenes.flatMap((scene) => [scene.sceneId+":enter", scene.sceneId+":emphasize", scene.sceneId+":hold", scene.sceneId+":handoff"])} , null, 2));
