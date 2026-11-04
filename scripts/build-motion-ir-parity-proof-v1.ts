#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {
  compileChoreographySceneToMotionIrScene,
  compileMotionIrSceneToHyperframes,
  evaluateMotionIrSceneAtFrame,
  type HyperframesMotionPlan,
  type MotionIrScene,
  type MotionValue,
} from "../lib/a1-motion-ir-parity-v1.js";

type Json = Record<string, any>;
type KeyMoment = {id:string; label:string; frame:number};

const root = process.cwd();
const phaseId = "motion-ir-parity-proof-v1";
const candidatePath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/candidate-props.json");
const visualMasterReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-visual-master-contract-v1/report.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const entryPoint = path.join(root, "remotion-renderer/src/motion-ir-parity-index.tsx");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = rendererRequire("@remotion/bundler") as typeof import("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer") as typeof import("@remotion/renderer");
const sharp = rendererRequire("sharp") as typeof import("sharp");
const {chromium} = await import("playwright");

const read = (file:string):Json => JSON.parse(fs.readFileSync(file, "utf8"));
const shaBuffer = (buffer:Buffer|string) => crypto.createHash("sha256").update(buffer).digest("hex");
const shaFile = (file:string) => shaBuffer(fs.readFileSync(file));
const rel = (file:string) => path.relative(root, file).split(path.sep).join("/");
const ensure = (directory:string) => fs.mkdirSync(directory, {recursive:true});
const writeJson = (file:string, value:unknown) => { ensure(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const writeText = (file:string, value:string) => { ensure(path.dirname(file)); fs.writeFileSync(file, value); };
const copyPair = (source:string, relativeTarget:string) => {
  const artifactTarget = path.join(artifactDir, relativeTarget);
  const publicTarget = path.join(publicDir, relativeTarget);
  ensure(path.dirname(artifactTarget)); ensure(path.dirname(publicTarget));
  if (source !== artifactTarget) fs.copyFileSync(source, artifactTarget);
  fs.copyFileSync(artifactTarget, publicTarget);
  return artifactTarget;
};

const round = (value:number) => Number(value.toFixed(6));
const roundedState = (state:Record<string,MotionValue>) => Object.fromEntries(Object.entries(state).map(([actorId, values]) => [actorId, Object.fromEntries(Object.entries(values).map(([property, value]) => [property, round(value)]))]));

function sidecarHtml(plan:HyperframesMotionPlan, shot:Json) {
  const safePlan = JSON.stringify(plan).replace(/<\/script/giu, "<\\/script");
  const safeShot = JSON.stringify(shot).replace(/<\/script/giu, "<\\/script");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>A1 Motion IR HyperFrames Sidecar</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111315}.composition{position:relative;width:1920px;height:1080px;overflow:hidden;background:#f3eee2;color:#111315;font-family:"PingFang SC","Noto Sans CJK SC",sans-serif;transform-origin:0 0}.paper{position:absolute;inset:0;background:#f3eee2;background-image:radial-gradient(circle at 18% 23%,rgba(17,19,21,.085) 0 1px,transparent 1.5px),radial-gradient(circle at 78% 67%,rgba(31,94,255,.055) 0 1px,transparent 1.5px);background-size:13px 13px,19px 19px}.frame{position:absolute;left:90px;top:72px;width:1740px;height:936px;border:3px solid #111315}.divider{position:absolute;left:958px;top:72px;width:3px;height:936px;background:#111315}.type{position:absolute;left:142px;top:228px;width:760px}.line{font-weight:900;font-size:150px;line-height:1.1;letter-spacing:-10px}.line.two{font-size:202px;margin-left:82px}.subject{position:absolute;left:1032px;top:142px;width:706px;height:736px;padding:130px 54px 62px;background:#f8f5ed;border:3px solid #111315;box-shadow:20px 24px 0 #d8d4c8}.subject p{font-size:29px;line-height:1.7;border-bottom:2px solid #d8d4c8;margin:0;padding:12px 8px}.semantic{position:absolute;left:1078px;top:398px;width:612px;height:112px;background:#1f5eff;color:#f8f5ed;padding:22px;font-size:48px;font-weight:900}.semantic b{float:right;border:3px solid #f8f5ed;width:70px;height:70px;text-align:center;line-height:64px;margin-top:-4px}.support{margin-top:58px;font-size:30px;color:#5d5a51}
</style>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script></head>
<body><main class="composition" data-composition-id="${plan.compositionId}" data-duration="${plan.durationSeconds}" data-fps="${plan.fps}" data-motion-actor-id="transition" data-track-index="4">
  <div class="paper" data-motion-actor-id="background" data-track-index="0"></div><div class="frame"></div><div class="divider"></div>
  <section class="type" data-motion-actor-id="typography" data-track-index="3"><div class="line">${shot.headlineLines[0]}</div><div class="line two">${shot.headlineLines[1]}</div><div class="support">${shot.supportLine}</div></section>
  <section class="subject" data-motion-actor-id="subject" data-track-index="1"><p>真正能留住写作习惯的，不是又一个空白输入框。</p><p>选中一句话，修改发生在原位，语气仍然属于作者。</p><p>每一次具体选择，都会沉淀为下一次判断的依据。</p><p>文章继续向前，工具不夺走作者的手感。</p></section>
  <div class="semantic" data-motion-actor-id="semantic" data-track-index="2">选中原句 <b>${shot.emphasis}</b></div>
</main>
<script>
window.__A1_MOTION_IR_HYPERFRAMES_PLAN__=${safePlan};window.__A1_MOTION_IR_SHOT__=${safeShot};window.__timelines=window.__timelines||{};
const cubicBezier=(curve)=>{const[x1,y1,x2,y2]=curve,cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by,sx=t=>((ax*t+bx)*t+cx)*t,sy=t=>((ay*t+by)*t+cy)*t,dx=t=>(3*ax*t+2*bx)*t+cx;return x=>{x=Math.max(0,Math.min(1,x));if(x===0||x===1)return x;let t=x;for(let i=0;i<8;i++){const e=sx(t)-x;if(Math.abs(e)<1e-7)break;const d=dx(t);if(Math.abs(d)<1e-7)break;t=Math.max(0,Math.min(1,t-e/d))}return sy(t)}};
const plan=window.__A1_MOTION_IR_HYPERFRAMES_PLAN__,timeline=gsap.timeline({paused:true});
const varsFor=values=>({x:values.x??0,y:values.y??0,scale:values.scale??1,rotation:values.rotate??0,opacity:values.opacity??1,filter:\`blur(\${Math.max(0,values.blur??0)}px)\`});
for(const tween of plan.tweens){const from=varsFor(tween.from),to=varsFor(tween.to);gsap.set(tween.selector,from);timeline.fromTo(tween.selector,from,{...to,duration:tween.durationSeconds,ease:cubicBezier(tween.easing),immediateRender:false},tween.startSeconds)}
window.__timelines[plan.compositionId]=timeline;
const blurValue=value=>{const match=String(value||"").match(/blur\\(([-+.0-9]+)px\\)/);return match?Number(match[1]):0};
window.__A1_INSPECT_FRAME__=frame=>{timeline.time(frame/plan.fps,false);const result={};for(const tween of plan.tweens){const el=document.querySelector(tween.selector);result[tween.actorId]={x:Number(gsap.getProperty(el,"x")),y:Number(gsap.getProperty(el,"y")),scale:Number(gsap.getProperty(el,"scaleX")),rotate:Number(gsap.getProperty(el,"rotation")),blur:blurValue(gsap.getProperty(el,"filter")),opacity:Number(gsap.getProperty(el,"opacity"))}}return result};
window.__HYPERFRAMES_READY__={compositionId:plan.compositionId,gsapVersion:gsap.version,promotedRender:false};
</script></body></html>`;
}

function compareStates(expected:Record<string,MotionValue>, actual:Record<string,MotionValue>, tolerance=.002) {
  const mismatches:Array<{actorId:string;property:string;expected:number;actual:number;delta:number}> = [];
  for (const [actorId, properties] of Object.entries(expected)) {
    for (const [property, value] of Object.entries(properties)) {
      const observed = actual[actorId]?.[property as keyof MotionValue];
      const delta = Math.abs(value - Number(observed));
      if (!Number.isFinite(Number(observed)) || delta > tolerance) mismatches.push({actorId, property, expected:round(value), actual:round(Number(observed)), delta:round(delta)});
    }
  }
  return mismatches;
}

async function contactSheet(files:Array<{moment:KeyMoment;path:string}>) {
  const tileWidth=640, tileHeight=360, labelHeight=42, columns=3, rows=Math.ceil(files.length/columns);
  const composites:any[]=[];
  for (const [index,file] of files.entries()) {
    const left=(index%columns)*tileWidth, top=Math.floor(index/columns)*(tileHeight+labelHeight);
    composites.push({input:await sharp(file.path).resize(tileWidth,tileHeight,{fit:"cover"}).png().toBuffer(),left,top});
    const label=`${file.moment.label} · F${file.moment.frame}`;
    composites.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111315"/><text x="16" y="28" font-family="Arial,sans-serif" font-size="18" fill="#f3eee2">${label}</text></svg>`),left,top:top+tileHeight});
  }
  const output=path.join(artifactDir,"five-keyframes-contact-sheet.jpg");
  await sharp({create:{width:columns*tileWidth,height:rows*(tileHeight+labelHeight),channels:3,background:"#111315"}}).composite(composites).jpeg({quality:92}).toFile(output);
  fs.copyFileSync(output,path.join(publicDir,path.basename(output)));
  return output;
}

async function main() {
  ensure(artifactDir); ensure(publicDir);
  const currentPhaseShaBefore=shaFile(currentPhasePath);
  const candidate=read(candidatePath);
  const visualMasterReport=read(visualMasterReportPath);
  const sourceScene=candidate.scenes.find((scene:Json)=>scene.beatId==="H01-B01");
  if (!sourceScene) throw new Error("H01-B01 is missing from the current H-series candidate");
  if (sourceScene.motionPlan?.contract!=="A1MotionChoreography/v1") throw new Error("H01-B01 motion choreography contract is not current");
  if (visualMasterReport.status!=="PASS") throw new Error("visual master audit must pass before parity proof");

  const motionIrScene=compileChoreographySceneToMotionIrScene(sourceScene,candidate.fps);
  const hyperframesPlan=compileMotionIrSceneToHyperframes(motionIrScene);
  const shot={
    beatId:sourceScene.beatId,
    headlineLines:sourceScene.storyboard.shotDirector.text.headlineLines,
    supportLine:sourceScene.storyboard.shotDirector.text.supportLine,
    emphasis:sourceScene.storyboard.shotDirector.text.emphasis,
  };
  const inputProps={contract:"A1MotionIrParityProofProps/v1",reviewOnly:true,promotedRender:false,shot,visualMaster:{id:"july1-retro-print-archive-wireframe-v1",hash:candidate.visualMasterHash},motionIrScene};
  const moments:KeyMoment[]=[
    {id:"start",label:"起始",frame:0},
    {id:"enter-complete",label:"进入完成",frame:28},
    {id:"emphasis",label:"强调锁定",frame:42},
    {id:"stable-read",label:"稳定阅读",frame:96},
    {id:"handoff",label:"转场交接",frame:154},
  ];

  writeJson(path.join(artifactDir,"motion-ir-scene.json"),motionIrScene);
  writeJson(path.join(publicDir,"motion-ir-scene.json"),motionIrScene);
  writeJson(path.join(artifactDir,"hyperframes-plan.json"),hyperframesPlan);
  writeJson(path.join(publicDir,"hyperframes-plan.json"),hyperframesPlan);
  const html=sidecarHtml(hyperframesPlan,shot);
  writeText(path.join(artifactDir,"index.html"),html);
  writeText(path.join(publicDir,"index.html"),html);

  const browser=await chromium.launch({headless:true});
  let browserStates:Record<string,Record<string,MotionValue>>={};
  let gsapVersion="";
  try {
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    await page.goto(pathToFileURL(path.join(artifactDir,"index.html")).href,{waitUntil:"networkidle",timeout:60000});
    await page.waitForFunction(()=>Boolean((window as any).__HYPERFRAMES_READY__),null,{timeout:30000});
    gsapVersion=await page.evaluate(()=>(window as any).__HYPERFRAMES_READY__.gsapVersion);
    browserStates=await page.evaluate((frames)=>Object.fromEntries(frames.map((frame:number)=>[String(frame),(window as any).__A1_INSPECT_FRAME__(frame)])),moments.map((moment)=>moment.frame));
  } finally { await browser.close(); }

  const parityRows=moments.map((moment)=>{
    const expected=evaluateMotionIrSceneAtFrame(motionIrScene,moment.frame);
    const actual=browserStates[String(moment.frame)]||{};
    const mismatches=compareStates(expected,actual);
    return {momentId:moment.id,label:moment.label,frame:moment.frame,status:mismatches.length===0?"PASS":"FAIL",expected:roundedState(expected),hyperframesBrowser:roundedState(actual),mismatches};
  });
  const parityReport={contract:"A1MotionIrStateParity/v1",status:parityRows.every((row)=>row.status==="PASS")?"PASS":"FAIL",tolerance:.002,proofMode:"remotion-shared-evaluator-vs-pinned-gsap-browser-runtime",gsapVersion,keyframes:parityRows};
  writeJson(path.join(artifactDir,"state-parity.json"),parityReport);
  writeJson(path.join(publicDir,"state-parity.json"),parityReport);
  if (parityReport.status!=="PASS") throw new Error("HyperFrames browser state diverged from Motion IR evaluator");

  const serveUrl=await bundle({entryPoint,publicDir:path.join(rendererRoot,"public"),rootDir:rendererRoot,enableCaching:true});
  const remotionBrowser=await openBrowser("chrome",{chromeMode:"headless-shell",logLevel:"warn"});
  const stills:Array<{moment:KeyMoment;path:string}>=[];
  try {
    const composition=await selectComposition({serveUrl,id:"A1MotionIrParityProof",inputProps,puppeteerInstance:remotionBrowser,logLevel:"warn"});
    for (const moment of moments) {
      const stillPath=path.join(artifactDir,"stills",`${String(moment.frame).padStart(3,"0")}-${moment.id}.png`);
      ensure(path.dirname(stillPath));
      await renderStill({serveUrl,composition,inputProps,frame:moment.frame,output:stillPath,imageFormat:"png",scale:.5,overwrite:true,puppeteerInstance:remotionBrowser,logLevel:"warn"});
      copyPair(stillPath,path.join("stills",path.basename(stillPath)));
      stills.push({moment,path:stillPath});
    }
  } finally { await remotionBrowser.close({silent:true}); }
  const sheetPath=await contactSheet(stills);

  const design=`# A1 Motion IR parity proof — design\n\n- Visual master: july1-retro-print-archive-wireframe-v1\n- Palette: paper #f3eee2, warm paper #f8f5ed, ink #111315, muted #5d5a51, cobalt #1f5eff, grey wash #d8d4c8.\n- Composition: asymmetric editorial split; large editable title on the left, deterministic manuscript selection on the right.\n- Cobalt is restricted to the semantic selected state. It is not a decorative line.\n- Texture is tactile paper, xerox grain, and cut-paper depth. No fake screenshot, logo, chart, or evidence object is introduced.\n- This is a review proof, not an alternative A1 product shell or promoted renderer.\n`;
  const motion=`# A1 Motion IR parity proof — motion\n\nOne existing H-series shot is normalized from A1MotionChoreography/v1 into A1MotionIRScene/v2. Every numeric property track carries actor ID, frame bounds, from/to values, and an explicit cubic-bezier tuple.\n\nKey states: F0 start, F28 enter complete, F42 emphasis lock, F96 stable read, F154 handoff. The Remotion composition evaluates these tracks with useCurrentFrame(). The sidecar compiles the same tracks to one paused GSAP timeline registered in window.__timelines.\n\nThe sidecar is review-only and data-promoted-render=false. HyperFrames CLI is not installed and is not claimed. The pinned browser runtime only proves that GSAP consumes the compiled plan without numeric state drift.\n`;
  writeText(path.join(artifactDir,"DESIGN.md"),design); writeText(path.join(publicDir,"DESIGN.md"),design);
  writeText(path.join(artifactDir,"MOTION.md"),motion); writeText(path.join(publicDir,"MOTION.md"),motion);

  const currentPhaseShaAfter=shaFile(currentPhasePath);
  const report={
    contract:"A1MotionIrParityProofReport/v1",
    phaseId,
    status:currentPhaseShaBefore===currentPhaseShaAfter&&parityReport.status==="PASS"?"PASS":"FAIL",
    reviewOnly:true,
    promotedRender:false,
    source:{candidate:rel(candidatePath),sceneId:sourceScene.beatId,motionContract:sourceScene.motionPlan.contract,visualMasterId:"july1-retro-print-archive-wireframe-v1",visualMasterHash:candidate.visualMasterHash},
    motionIr:{path:rel(path.join(artifactDir,"motion-ir-scene.json")),sha256:shaFile(path.join(artifactDir,"motion-ir-scene.json")),actorCount:motionIrScene.actors.length,propertyTrackCount:motionIrScene.actors.reduce((sum,actor)=>sum+actor.propertyTracks.length,0)},
    hyperframes:{planPath:rel(path.join(artifactDir,"hyperframes-plan.json")),sidecarPath:rel(path.join(artifactDir,"index.html")),sidecarPublicUrl:`/generated/system-line/${phaseId}/index.html`,cliInstalled:false,cliExecuted:false,browserRuntimeExecuted:true,gsapVersion,promotedRender:false},
    parity:{path:rel(path.join(artifactDir,"state-parity.json")),status:parityReport.status,keyframes:moments.map(({id,label,frame})=>({id,label,frame}))},
    remotion:{compositionId:"A1MotionIrParityProof",formalRendererRemains:"Remotion",stillCount:stills.length,mp4Rendered:false},
    contactSheet:{path:rel(sheetPath),publicUrl:`/generated/system-line/${phaseId}/five-keyframes-contact-sheet.jpg`,sha256:shaFile(sheetPath),width:1920,height:804},
    authorityGuard:{currentPhasePath:rel(currentPhasePath),sha256Before:currentPhaseShaBefore,sha256After:currentPhaseShaAfter,unchanged:currentPhaseShaBefore===currentPhaseShaAfter,rendererAdoptionAllowed:false,fullMp4RenderAllowed:false,finalRenderAllowed:false},
    conclusion:"The existing Motion IR can own numeric timing and properties for both interpreters. This proves state parity for one shot only; it does not prove full-film layout parity or promote HyperFrames into the formal render path.",
    nextGate:"human-review-five-keyframes-before-any-second-shot",
  };
  writeJson(path.join(artifactDir,"report.json"),report); writeJson(path.join(publicDir,"report.json"),report);
  if (report.status!=="PASS") throw new Error("Motion IR parity proof failed its authority guard");
  console.log(JSON.stringify({status:report.status,sceneId:sourceScene.beatId,actorCount:report.motionIr.actorCount,propertyTrackCount:report.motionIr.propertyTrackCount,gsapVersion,stateParity:parityReport.status,currentAuthorityUnchanged:report.authorityGuard.unchanged,contactSheet:report.contactSheet.publicUrl,sidecar:report.hyperframes.sidecarPublicUrl,nextGate:report.nextGate},null,2));
}

main().catch((error)=>{console.error(error);process.exitCode=1;});
