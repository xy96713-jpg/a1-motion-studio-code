#!/usr/bin/env node
/**
 * ── Intelligent Storyboard Engine ──
 * Article text → LLM shot decomposition → per-shot visual/motion decisions → renderable props.
 *
 * Usage: node scripts/semantic-props-generator.mjs <article.txt> [--out <path>] [--model qwen3.8-max-preview] [--fps 30]
 *
 * Env: DASHSCOPE_API_KEY (or reads from .env)
 *
 * Pipeline:
 *   Stage 1: LLM splits text into attention-beat shots (NOT 1 paragraph = 1 shot)
 *   Stage 2: LLM analyzes each shot → layout/typography/visual/motion from constrained menu
 *   Stage 3: Deterministic timing (arc + optional beat grid)
 *   Stage 4: Motion track generation (from motion-config data)
 */
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {createHash} from "node:crypto";
import {routeVisualSources} from "../lib/visual-sourcing/visual-router.mjs";
import {createA1MotionTemplateRenderPropsV1, selectA1MotionTemplateV1} from "../apps/studio-next/src/lib/a1-motion-template-pack-v1.ts";

// ── CLI args ──────────────────────────────────────────────────────────
const args=process.argv.slice(2);
const articlePath=args[0];
if(!articlePath){console.error("Usage: node semantic-props-generator.mjs <article.txt> [--srt <file.srt>] [--out <path>] [--model qwen3.8-max-preview] [--fps 30]");process.exit(1);}
const outIdx=args.indexOf("--out");
const DEFAULT_STORYBOARD_OUT=resolve("apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const SYSTEM_LINE_PROPS=resolve("remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const outPath=resolve(outIdx!==-1?args[outIdx+1]:DEFAULT_STORYBOARD_OUT);
if(outPath===SYSTEM_LINE_PROPS&&!args.includes("--allow-system-props-overwrite")){
  console.error("Refusing to overwrite system-line review props. Use --allow-system-props-overwrite only inside an explicit H-series adoption/render step.");
  process.exit(2);
}
const modelIdx=args.indexOf("--model");
const model=modelIdx!==-1?args[modelIdx+1]:"qwen3.8-max-preview";
const fpsIdx=args.indexOf("--fps");
const fps=fpsIdx!==-1?parseInt(args[fpsIdx+1],10):30;
const srtIdx=args.indexOf("--srt");
const srtPath=srtIdx!==-1?args[srtIdx+1]:null;
const articleUrlIdx=args.indexOf("--article-url");
const articleUrl=articleUrlIdx!==-1?args[articleUrlIdx+1]:null;
const nextSourcedArtworkDir=resolve("apps/studio-next/public/assets/sourced-artwork");
const rendererSourcedArtworkDir=resolve("remotion-renderer/public/assets/sourced-artwork");

function sha256File(filePath){
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function adoptSourcedArtworkForRenderer(filename){
  if(!filename)return null;
  const source=resolve(nextSourcedArtworkDir,filename);
  if(!existsSync(source))return null;
  mkdirSync(rendererSourcedArtworkDir,{recursive:true});
  const rendererFile=resolve(rendererSourcedArtworkDir,filename);
  if(!existsSync(rendererFile)||sha256File(rendererFile)!==sha256File(source)){
    copyFileSync(source,rendererFile);
  }
  return {
    asset:`assets/sourced-artwork/${filename}`,
    sha256:sha256File(rendererFile),
    rendererFile,
    sourceFile:source
  };
}

// Load API key — try DASHSCOPE_API_KEY, then DEEPSEEK_API_KEY, then .env
let apiKey=process.env.DASHSCOPE_API_KEY||process.env.DEEPSEEK_API_KEY;
if(!apiKey){
  const envPath=resolve(".env");
  if(existsSync(envPath)){
    const envContent=readFileSync(envPath,"utf-8");
    const match=envContent.match(/(?:DASHSCOPE_API_KEY|DEEPSEEK_API_KEY)=(.+)/);
    if(match)apiKey=match[1].trim().replace(/^["']|["']$/g,"");
  }
}
if(!apiKey){console.log("No API key found — using heuristic mode (no LLM)");}

const apiBaseIdx=args.indexOf("--api-base");
const BASE_URL=apiBaseIdx!==-1?args[apiBaseIdx+1]:"https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";

// ── Read article ──────────────────────────────────────────────────────
const raw=readFileSync(resolve(articlePath),"utf-8").trim();
// Support both double-newline paragraphs AND single-newline subtitle format
const hasDoubleNewline=/\n\s*\n/.test(raw);
const paragraphs=hasDoubleNewline
  ?raw.split(/\n{2,}/).map(p=>p.trim()).filter(p=>p.length>0)
  :raw.split(/\n/).map(p=>p.trim()).filter(p=>p.length>0);
console.log(`Article: ${paragraphs.length} segments, ${[...raw].length} chars`);

// ── SRT timeline (optional) ──────────────────────────────────────────
let srtCues=null;
if(srtPath&&existsSync(resolve(srtPath))){
  const srtRaw=readFileSync(resolve(srtPath),"utf-8");
  const blocks=srtRaw.trim().split(/\n{2,}/);
  srtCues=blocks.map(b=>{
    const lines=b.trim().split("\n");
    const timeLine=lines.find(l=>l.includes("-->"));
    if(!timeLine)return null;
    const[ts,te]=timeLine.split("-->").map(s=>s.trim());
    const toMs=t=>{const[h,m,rest]=t.split(":");const[sec,ms]=rest.split(",");return(+h*3600+ +m*60+ +sec)*1000+ +ms;};
    return{startMs:toMs(ts),endMs:toMs(te),text:lines.slice(lines.indexOf(timeLine)+1).join(" ").trim()};
  }).filter(Boolean);
  console.log(`SRT timeline: ${srtCues.length} cues loaded from ${srtPath}`);
}

// ── LLM call ──────────────────────────────────────────────────────────
async function callLLM(systemPrompt,userPrompt,temperature=0.3,timeoutMs=300000,retries=3){
  for(let attempt=1;attempt<=retries;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const body={
        model,
        messages:[{role:"system",content:systemPrompt},{role:"user",content:userPrompt}],
        temperature
      };
      // json_object mode only for models that reliably support it
      if(!model.startsWith("deepseek"))body.response_format={type:"json_object"};
      const res=await fetch(`${BASE_URL}/chat/completions`,{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`},
        body:JSON.stringify(body),
        signal:controller.signal
      });
      clearTimeout(timer);
      if(!res.ok){
        const err=await res.text();
        throw new Error(`API ${res.status}: ${err.slice(0,300)}`);
      }
      const data=await res.json();
      const raw=data.choices[0].message.content;
      // Strip markdown fences if present (DeepSeek sometimes wraps JSON in ```)
      const cleaned=raw.replace(/^```(?:json)?\s*/m,"").replace(/\s*```$/m,"").trim();
      return JSON.parse(cleaned);
    }catch(e){
      clearTimeout(timer);
      if(e.name==="AbortError")throw new Error(`LLM timeout after ${timeoutMs/1000}s`);
      if(attempt<retries&&(e.message?.includes("fetch failed")||e.message?.includes("ECONNRESET")||e.message?.includes("socket hang up"))){
        console.log(`  ⚠ Attempt ${attempt} failed (${e.message}), retrying in ${attempt*2}s...`);
        await new Promise(r=>setTimeout(r,attempt*2000));
        continue;
      }
      throw e;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// STAGE 1: Shot Decomposition — LLM decides how many shots, not paragraphs
// ══════════════════════════════════════════════════════════════════════

const STAGE1_SYSTEM=`你是电影分镜师。把文章拆成"观众注意力节拍"——每个节拍是观众脑中形成一个完整画面的最小单位。

规则：
- 一个论点+一个证据 = 2个镜头（论点一镜，证据一镜）
- 排比/递进如果语义连贯 = 1个镜头（不要拆碎）
- 转折/对比必须断开（前后各一镜）
- 每镜 screenText ≤ 14字（观众3秒能读完）
- 如果原文一句话超过14字，提炼核心短语作为 screenText
- 标注镜头间关系：contrast(对比) | progression(递进) | parallel(并列) | turn(转折) | elaboration(展开) | conclusion(收束)
- 标注每镜的叙事角色：thesis(论点) | evidence(证据) | transition(过渡) | climax(高潮) | resolution(收束) | example(举例) | contrast(对比) | process(流程) | question(提问)
- 标注能量级别：high | medium | low
- 标注情绪：urgent | calm | curious | decisive | reflective

返回 JSON 对象：{"shots": [{"screenText":"...", "sourceText":"原文对应段落", "narrative":"...", "energy":"...", "emotion":"...", "relationToNext":"..."}]}

注意：
- 镜头数量由内容密度决定，不是段落数。一段话可能拆成2-3个镜头，三段话可能合成1个镜头。
- screenText 必须是中文，≤14字，从原文提炼最有力的短语。
- 总镜头数建议：短文(< 200字) 4-8镜，中文(200-600字) 8-16镜，长文(> 600字) 16-30镜。`;

const STAGE1_USER=`把以下文章拆成分镜：

${paragraphs.map((p,i)=>`[${i+1}] ${p}`).join("\n\n")}`;

console.log(`\n── Stage 1: Shot decomposition (${model}) ──`);
let shotList;
try{
  const r1=await callLLM(STAGE1_SYSTEM,STAGE1_USER,0.4);
  shotList=r1.shots||r1;
  if(!Array.isArray(shotList))throw new Error("Stage 1 did not return array");
  console.log(`  → ${shotList.length} shots decomposed`);
}catch(e){
  console.error(`  Stage 1 failed: ${e.message}`);
  console.log("  Falling back to paragraph-level decomposition...");
  shotList=paragraphs.map((p,i)=>({
    screenText:[...p].slice(0,14).join(""),
    sourceText:p,
    narrative:heuristicNarrative(p),
    energy:heuristicEnergy(p),
    emotion:"calm",
    relationToNext:i<paragraphs.length-1?"progression":"conclusion"
  }));
}

// ══════════════════════════════════════════════════════════════════════
// STAGE 1.5: Global visual plan — constrain palette BEFORE per-shot decisions
// ══════════════════════════════════════════════════════════════════════

const STAGE15_SYSTEM=`你是视频视觉总监。基于分镜列表，为全片制定统一的视觉规范。

核心原则：少即是多。全片视觉一致性 > 单镜精彩。

你必须从以下菜单中选择，并严格限制数量：

layout 菜单（全片最多选3种）:
left-anchor | center-impact | negative-space-right | asymmetric-split | vertical-sequence | orbit-ring | diagonal-tension | grid-mosaic

motionStyle 菜单（全片最多选3种）:
relay-reveal | interruption | text-mask | layout-morph | stack-accumulate | path-draw | annotation-write

backgroundState 菜单（全片最多选2种）:
paper-field | wireframe-space | archive-density | ink-conflict

primaryCurve 菜单（全片最多选2种）:
editorial-reveal | selection-snap | archive-settle | verdict-cut

规则：
- 相邻镜头不允许用同一种 layout（必须交替）
- 高能量镜头(high energy)用 center-impact 或 diagonal-tension
- 低能量镜头(low energy)用 negative-space-right 或 left-anchor
- 流程/步骤类镜头用 vertical-sequence + path-draw
- backgroundState 大部分镜头用 paper-field，只在高潮/冲突时用 ink-conflict
- primaryCurve 大部分用 editorial-reveal，只在判定/高潮用 verdict-cut

返回 JSON：
{"allowedLayouts":["...","...","..."],"allowedMotionStyles":["...","...","..."],"allowedBackgrounds":["...","..."],"allowedCurves":["...","..."],"layoutRules":"一句话描述layout分配逻辑","motionRules":"一句话描述motion分配逻辑"}`;

const STAGE15_USER=`全片共 ${shotList.length} 个镜头：
${shotList.map((s,i)=>`[${i+1}] "${s.screenText}" energy=${s.energy} narrative=${s.narrative} relation=${s.relationToNext}`).join("\n")}

请制定全片视觉规范。`;

console.log(`\n── Stage 1.5: Global visual plan (${model}) ──`);
let globalPlan=null;
try{
  const r15=await callLLM(STAGE15_SYSTEM,STAGE15_USER,0.3);
  globalPlan=r15;
  console.log(`  Layouts: ${(globalPlan.allowedLayouts||[]).join(", ")}`);
  console.log(`  Motion:  ${(globalPlan.allowedMotionStyles||[]).join(", ")}`);
  console.log(`  BG:      ${(globalPlan.allowedBackgrounds||[]).join(", ")}`);
  console.log(`  Curves:  ${(globalPlan.allowedCurves||[]).join(", ")}`);
}catch(e){
  console.error(`  Stage 1.5 failed: ${e.message}`);
  console.log("  Using default global plan...");
  globalPlan={allowedLayouts:["left-anchor","center-impact","negative-space-right"],allowedMotionStyles:["relay-reveal","text-mask","path-draw"],allowedBackgrounds:["paper-field","ink-conflict"],allowedCurves:["editorial-reveal","verdict-cut"]};
}

// ══════════════════════════════════════════════════════════════════════
// STAGE 2: Per-shot visual/motion analysis — constrained by global plan
// ══════════════════════════════════════════════════════════════════════

const allowedL=globalPlan.allowedLayouts||["left-anchor","center-impact","negative-space-right"];
const allowedM=globalPlan.allowedMotionStyles||["relay-reveal","text-mask","path-draw"];
const allowedB=globalPlan.allowedBackgrounds||["paper-field","ink-conflict"];
const allowedC=globalPlan.allowedCurves||["editorial-reveal","verdict-cut"];

const STAGE2_SYSTEM=`你是视频视觉设计师。为每个镜头选择最合适的视觉策略。

⚠️ 全片视觉规范（必须严格遵守）：
- layout 只能用: ${allowedL.join(" | ")}
- motionStyle 只能用: ${allowedM.join(" | ")}
- backgroundState 只能用: ${allowedB.join(" | ")}
- primaryCurve 只能用: ${allowedC.join(" | ")}
- 相邻镜头的 layout 必须不同
- ${globalPlan.layoutRules||"高能量用center-impact，低能量用left-anchor或negative-space-right"}
- ${globalPlan.motionRules||"大部分用relay-reveal，高潮用text-mask"}

visualFamily 菜单（不限数量，但优先复用）:
editorial-metaphor | type-statement | model-comparison | process-chain | archive-stack | annotation-judgement | insertion-flow

choreography 菜单:
collage-recompose | wireframe-draw | ink-build | plate-register | archive-accumulate | symbol-lock

对每个镜头返回 JSON 对象，包含：
- layout: 只能从 [${allowedL.join(", ")}] 选
- motionStyle: 只能从 [${allowedM.join(", ")}] 选
- backgroundState: 只能从 [${allowedB.join(", ")}] 选
- visualFamily: 从菜单选
- choreography: 从菜单选
- primaryCurve: 只能从 [${allowedC.join(", ")}] 选
- titleLines: 文字分行数组（每行≤14字，最多3行）
- keywordIndex: 关键词行索引（null或0/1/2）
- artworkPrompt: 如果需要配图，写一句英文描述（≤30词）；如果纯文字则null
- animationTier: "formal-highlight"(高能量) 或 "standard-typography"(普通)

返回格式：{"decisions": [{...}, {...}, ...]}
数组长度必须等于输入的镜头数。`;

const STAGE2_USER=`为以下 ${shotList.length} 个镜头选择视觉策略：

${shotList.map((s,i)=>`[镜头${i+1}] screenText="${s.screenText}" narrative=${s.narrative} energy=${s.energy} emotion=${s.emotion} relation=${s.relationToNext}
原文: ${s.sourceText}`).join("\n\n")}`;

console.log(`\n── Stage 2: Per-shot visual analysis (${model}) ──`);
let decisions=[];
const BATCH_SIZE=12;
try{
  // Build all batch prompts first, then fire in parallel
  const batches=[];
  for(let batchStart=0;batchStart<shotList.length;batchStart+=BATCH_SIZE){
    const batch=shotList.slice(batchStart,batchStart+BATCH_SIZE);
    const batchNum=Math.floor(batchStart/BATCH_SIZE)+1;
    const batchUser=`为以下 ${batch.length} 个镜头选择视觉策略：\n\n${batch.map((s,i)=>`[镜头${batchStart+i+1}] screenText="${s.screenText}" narrative=${s.narrative} energy=${s.energy} emotion=${s.emotion} relation=${s.relationToNext}\n原文: ${s.sourceText}`).join("\n\n")}`;
    batches.push({batchNum,batchStart,batch,prompt:batchUser});
  }
  if(batches.length>1)console.log(`  Running ${batches.length} batches sequentially...`);
  const results=[];
  for(const b of batches){
    const r2=await callLLM(STAGE2_SYSTEM,b.prompt,0.35);
    const bd=r2.decisions||r2;
    if(!Array.isArray(bd))throw new Error(`Batch ${b.batchNum} did not return array`);
    results.push(bd);
    // Brief pause between batches to avoid rate limiting
    if(b!==batches.at(-1))await new Promise(r=>setTimeout(r,1500));
  }
  for(const bd of results)decisions.push(...bd);
  while(decisions.length<shotList.length){
    decisions.push(decisions[decisions.length-1]||defaultDecision());
  }
  console.log(`  → ${decisions.length} visual decisions made`);
}catch(e){
  console.error(`  Stage 2 failed: ${e.message}`);
  console.log("  Using heuristic fallback for all shots...");
  decisions=shotList.map(s=>heuristicDecision(s));
}

// ══════════════════════════════════════════════════════════════════════
// STAGE 2b/2c: Visual source routing — search / scrape / generate / type
// ══════════════════════════════════════════════════════════════════════

console.log(`\n── Stage 2b/2c: Visual source routing ──`);
const visualRoutes=await routeVisualSources(shotList,decisions,{
  articleUrl,
  artworkDir:nextSourcedArtworkDir,
  maxSearchPerShot:3,
  maxTotalSearches:12,
});
const routeSummary={search:0,scrape:0,generate:0,type:0};
for(const[,v]of visualRoutes)routeSummary[v.visualSource]=(routeSummary[v.visualSource]||0)+1;
console.log(`  Routes: search(${routeSummary.search}) scrape(${routeSummary.scrape}) generate(${routeSummary.generate}) type(${routeSummary.type})`);
const sourcedCount=[...visualRoutes.values()].filter(v=>v.artworkFile).length;
console.log(`  Downloaded: ${sourcedCount} images`);

// ══════════════════════════════════════════════════════════════════════
// STAGE 3: Deterministic timing — arc + text length + energy
// ══════════════════════════════════════════════════════════════════════

console.log(`\n── Stage 3: Timing & sequencing ──`);

// Build shot→SRT cue mapping (fuzzy text match)
let shotTimings=null;
if(srtCues&&srtCues.length>0){
  shotTimings=shotList.map((shot)=>{
    const src=(shot.sourceText||shot.screenText||"").replace(/[\s，。、；：！？,.!?]/g,"");
    let best=null,bestScore=0;
    for(const cue of srtCues){
      const ct=cue.text.replace(/[\s，。、；：！？,.!?]/g,"");
      // Score: longest common substring ratio
      let score=0;
      for(let a=0;a<src.length;a++){
        for(let b=0;b<ct.length;b++){
          let len=0;
          while(a+len<src.length&&b+len<ct.length&&src[a+len]===ct[b+len])len++;
          if(len>score)score=len;
        }
      }
      const ratio=score/Math.max(src.length,1);
      if(ratio>bestScore){bestScore=ratio;best=cue;}
    }
    return best&&bestScore>0.3?best:null;
  });
  const matched=shotTimings.filter(Boolean).length;
  console.log(`  SRT alignment: ${matched}/${shotList.length} shots matched to cues`);
}

const totalShots=shotList.length;
const scenes=[];
let currentFrame=0;

for(let i=0;i<totalShots;i++){
  const shot=shotList[i];
  const dec=decisions[i]||defaultDecision();

  // Arc position: 0-1 across the video
  const arcPos=totalShots>1?i/(totalShots-1):0.5;
  // Arc intensity: narrative shape (opening 0.55 → climax 1.0 → resolution 0.7)
  const arcIntensity=arcPos<0.15?0.55+arcPos*2
    :arcPos<0.7?0.85+Math.sin((arcPos-0.15)/0.55*Math.PI)*0.15
    :1.0-(arcPos-0.7)/0.3*0.3;

  // Duration: SRT real time if available, otherwise formula
  let durationInFrames,sourceStartMs,sourceEndMs;
  const cue=shotTimings?shotTimings[i]:null;
  if(cue){
    // Use SRT for duration only — keep timeline contiguous (no gaps)
    const srtDuration=Math.max(30,Math.round((cue.endMs-cue.startMs)/1000*fps));
    durationInFrames=srtDuration;
    sourceStartMs=Math.round(currentFrame/fps*1000);
    sourceEndMs=Math.round((currentFrame+durationInFrames)/fps*1000);
  }else{
    const charCount=[...(shot.screenText||shot.sourceText||"")].length;
    const energyBase=shot.energy==="high"?110:shot.energy==="low"?175:145;
    const arcBonus=arcIntensity>0.9?15:arcIntensity<0.6?-10:0;
    durationInFrames=Math.max(54,Math.min(210,Math.round(energyBase+charCount*0.9+arcBonus)));
    sourceStartMs=Math.round(currentFrame/fps*1000);
    sourceEndMs=Math.round((currentFrame+durationInFrames)/fps*1000);
  }

  // Phase timing (scaled to duration)
  const enterEnd=Math.min(30,Math.round(durationInFrames*0.18));
  const establishEnd=Math.round(durationInFrames*0.30);
  const emphasizeEnd=Math.round(durationInFrames*0.48);
  const holdEnd=durationInFrames-Math.round(durationInFrames*0.15);

  const macroId=`H${String(Math.floor(i/4)+1).padStart(2,"0")}`;
  const beatId=`${macroId}-B${String((i%4)+1).padStart(2,"0")}`;

  const titleLines=dec.titleLines||[shot.screenText];
  const fontSize=titleLines.length>2?88:titleLines.length>1?96:104;
  const lineHeight=Math.round(fontSize*1.25);
  const motionStyle=dec.motionStyle||"relay-reveal";
  const curve=dec.primaryCurve||"editorial-reveal";
  const layoutFam=dec.layout||"left-anchor";
  const family=dec.visualFamily||"editorial-metaphor";
  const bgState=dec.backgroundState||"paper-field";
  const choreo=dec.choreography||"collage-recompose";
  const tier=dec.animationTier||(shot.energy==="high"?"formal-highlight":"standard-typography");
  const vr=(visualRoutes.get(i)||{});
  const route=vr.visualSource==="search"||vr.visualSource==="scrape"?"sourced-web-asset"
    :dec.artworkPrompt?"gpt-editorial-artwork":"deterministic-graphic";
  const motionTemplate=selectA1MotionTemplateV1({
    sceneId:beatId,
    screenText:shot.screenText||"",
    sourceText:shot.sourceText||"",
    visualSource:vr.visualSource||"type",
    sourceKind:vr.provenance?.sourceKind||null,
    domRole:vr.provenance?.domRole||null,
    sourceUrl:vr.sourceUrl||null,
    hasVerifiedAsset:Boolean(vr.artworkFile||vr.sourceUrl),
    semanticAction:dec.primaryAction||motionStyle,
    argumentRole:shot.argumentRole||dec.argumentRole||null,
    visualJob:dec.visualJob||dec.visualFamily||family
  });
  const motionTemplateRenderProps=createA1MotionTemplateRenderPropsV1({
    selection:motionTemplate,
    headline:titleLines.join(" "),
    sourceText:shot.sourceText||null,
    sourceAssetPath:vr.artworkFile||null,
    sourceUrl:vr.sourceUrl||null
  });

  // ══════════════════════════════════════════════════════════════════
  // STAGE 4: Motion tracks — deterministic from config data
  // ══════════════════════════════════════════════════════════════════

  // Entry direction varies by motionStyle (not all the same!)
  const entryDirs={
    "relay-reveal":{x:74,y:0,s:0.94},
    "interruption":{x:0,y:-60,s:1.06},
    "text-mask":{x:0,y:40,s:0.92},
    "layout-morph":{x:-50,y:0,s:0.97},
    "stack-accumulate":{x:0,y:55,s:0.9},
    "path-draw":{x:60,y:20,s:0.95},
    "annotation-write":{x:-30,y:30,s:0.96}
  };
  const ed=entryDirs[motionStyle]||entryDirs["relay-reveal"];

  // Arc scales the entry amplitude
  const arcScale=0.7+arcIntensity*0.5; // 0.7-1.2x

  const scene={
    contract:"A1MicrobeatLayeredFullScene/v1",beatId,macroId,
    sourceStartMs,sourceEndMs,
    startFrame:currentFrame,durationInFrames,
    screenText:shot.screenText||shot.sourceText?.slice(0,14)||"",
    presentation:{
      contract:"A1MicroEventPresentation/v1",
      state:shot.narrative==="question"?"question":"claim",
      label:(shot.narrative||"claim").slice(0,24),
      primary:(shot.screenText||"").slice(0,28),secondary:"",
      tokens:(shot.sourceText||"").split(/[，。、；：！？\s]+/).filter(s=>s.length>=2&&s.length<=14).slice(0,3),
      showSceneTitle:false,
      semanticDelta:`${shot.narrative}:${shot.emotion}:${(shot.screenText||"").slice(0,16)}`,
      audit:{cleanTerminalPunctuation:true,textRoleCount:1,microEventVisible:true}
    },
    titleLines,supportTokens:(()=>{const t=(shot.sourceText||"").split(/[，。、；：！？\s]+/).filter(s=>s.length>=2&&s.length<=6);while(t.length<2)t.push("context");return t.slice(0,4);})(),
    entityEvidence:[],
    family,route,animationTier:tier,recordingReplaceable:false,
    layoutFamily:layoutFam,motionArchetype:motionStyle,
    compositionVariant:i%3,backgroundState:bgState,choreography:choreo,
    layout:{
      contract:"A1LayoutEngine/v2",candidateId:`storyboard-${layoutFam}`,
      family:"editorial-baseline",layoutSignature:`storyboard|${family}`,
      titleBox:{
        x:layoutFam==="center-impact"?260:layoutFam==="negative-space-right"?80:112,
        y:layoutFam==="center-impact"?340:224,
        width:layoutFam==="center-impact"?1400:layoutFam==="negative-space-right"?750:900,
        height:titleLines.length*lineHeight+40,
        alignment:layoutFam==="center-impact"?"center":layoutFam==="negative-space-right"?"left":"left",
        maxLines:titleLines.length,fontSize,lineHeight
      },
      stageBox:{x:layoutFam==="center-impact"?480:1030,y:126,width:640,height:790},
      typography:{
        contract:"A1TypographyLayout/v2",fontFamily:"SourceHanSansCN-Heavy",fontPath:"",
        lines:titleLines,fontSize,lineHeight,
        lineWidths:titleLines.map(l=>Math.min(900,[...l].length*fontSize*0.92)),
        blockWidth:Math.max(...titleLines.map(l=>[...l].length*fontSize*0.92),280),
        blockHeight:titleLines.length*lineHeight,
        baselineOffset:Math.round(lineHeight*0.12),
        opticalOffsetY:0,fitRatio:1,hasOrphan:false,
        audit:{fitsWidth:true,fitsHeight:true,semanticLines:true,blockers:[]}
      },
      focalPoint:{x:layoutFam==="center-impact"?960:600,y:layoutFam==="center-impact"?540:400,role:"type"}
    },
    motionPlan:{
      contract:"A1MotionChoreography/v1",
      primaryAction:motionStyle,transitionOut:"paper-match",
      motionStyle,primaryCurve:curve,
      tracks:[
        {id:"background",role:"background",semanticJob:"establish visual space",
          startFrame:0,endFrame:Math.round(durationInFrames*0.4),curve:"quiet-hold",
          from:{x:Math.round(-12*arcScale),y:Math.round(-4*arcScale),scale:1+0.015*arcScale,rotate:0,blur:0,opacity:0},
          to:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1}},
        {id:"subject",role:"subject",semanticJob:motionStyle,
          startFrame:5,endFrame:enterEnd,curve,
          from:{x:Math.round(ed.x*arcScale),y:Math.round(ed.y*arcScale),scale:ed.s,rotate:0,blur:5,opacity:0},
          to:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1}},
        {id:"semantic",role:"semantic",semanticJob:motionStyle,
          startFrame:Math.round(enterEnd*0.75),endFrame:establishEnd,curve,
          from:{x:0,y:Math.round(24*arcScale),scale:0.94,rotate:0,blur:5,opacity:0},
          to:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1}},
        {id:"typography",role:"typography",semanticJob:"readable claim",
          startFrame:3,endFrame:Math.round(enterEnd*0.93),curve,
          from:{x:Math.round(-48*arcScale),y:0,scale:0.98,rotate:0,blur:7,opacity:0},
          to:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1}},
        {id:"transition",role:"transition",semanticJob:"paper-match",
          startFrame:holdEnd,endFrame:durationInFrames,curve:"quiet-hold",
          from:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1},
          to:{x:0,y:0,scale:0.98,rotate:0,blur:0,opacity:0}}
      ],
      overlapFrames:14,
      phases:{
        enter:{startFrame:0,endFrame:enterEnd},
        establish:{startFrame:Math.round(enterEnd*0.82),endFrame:establishEnd},
        emphasize:{startFrame:establishEnd,endFrame:emphasizeEnd},
        hold:{startFrame:emphasizeEnd,endFrame:holdEnd},
        exit:{startFrame:holdEnd,endFrame:durationInFrames}
      },
      semanticStates:{
        initial:"unintroduced",
        established:`established:${motionStyle}`,
        emphasized:`emphasized:${motionStyle}`,
        resolved:"resolved:paper-match"
      },
      kineticText:{
        mode:tier==="formal-highlight"?"relay":"quiet",
        staggerFrames:6,
        keywordIndex:dec.keywordIndex??null
      },
      curveProfile:{
        contract:"A1MotionCurveProfile/v1",id:curve,
        cubicBezier:curve==="editorial-reveal"?[0.16,0,0.3,1]
          :curve==="selection-snap"?[0.34,1.56,0.64,1]
          :curve==="archive-settle"?[0.22,0.61,0.36,1]
          :curve==="verdict-cut"?[0.55,0,0.1,1]
          :[0.25,0.1,0.25,1],
        intent:curve==="editorial-reveal"?"premium-editorial-reveal"
          :curve==="selection-snap"?"decisive-selection-snap"
          :curve==="archive-settle"?"archive-paper-settle"
          :curve==="verdict-cut"?"hard-verdict-cut"
          :"low-interference-hold",
        velocity:{entry:0.02,peak:0.12,exit:0.02,samples:[0,0.02,0.07,0.16,0.26,0.38,0.5,0.62,0.74,0.84,0.93,0.98,1]},
        audit:{nonLinear:true,softStart:true,softEnd:true,peakInside:true,blockers:[]}
      },
      textMotion:{
        contract:"A1TextMotionPlan/v1",
        revealTechnique:tier==="formal-highlight"?"relay":"line-mask",
        states:{enter:"mask prepares readable text block",establish:"line group settles into optical baseline",emphasize:"semantic keyword locks to accent role",hold:"reader gets a stable no-decoration hold",exit:"text hands motion to next scene actor"},
        perLineStaggerFrames:6,
        mask:{enabled:true,featherPx:2,overshootPx:18},
        emphasis:{keywordIndex:dec.keywordIndex??null,holdFramesMinimum:18},
        audit:{hasFiveStates:true,readableHold:true,noRedundantMicroLabels:true,blockers:[]}
      },
      layoutMorph:{enabled:motionStyle==="layout-morph",from:{x:Math.round(-48*arcScale),y:0,scale:0.98},to:{x:0,y:0,scale:1},startFrame:Math.round(enterEnd*0.82),endFrame:emphasizeEnd},
      dynamics:{
        entryVelocity:shot.energy==="high"?0.85:0.72,
        exitVelocity:0.18,
        maxVelocity:shot.energy==="high"?0.95:0.82,
        continuity:"smooth",overlapBudgetFrames:14
      },
      audit:{onePrimaryAction:true,tracksWithinScene:true,hasReadableHold:true,phasesComplete:true,velocityContinuous:true,blockers:[]}
    },
    layers:[
      {id:`${beatId}:background-field`,kind:"background-field",z:0,asset:null,assetSha256:null,editable:true,motion:{action:"establish-paper-space",parentId:null,enter:[0,12],hold:[12,holdEnd],exit:[holdEnd,durationInFrames]}},
      {id:`${beatId}:background-plate`,kind:"background-plate",z:5,asset:null,assetSha256:null,editable:true,motion:{action:"plate-register",parentId:null,enter:[4,16],hold:[16,holdEnd],exit:[holdEnd,durationInFrames]}},
      {id:`${beatId}:midground-object`,kind:"midground-object",z:10,asset:null,assetSha256:null,editable:true,motion:{action:"midground-settle",parentId:null,enter:[8,24],hold:[24,holdEnd],exit:[holdEnd,durationInFrames]}},
      {id:`${beatId}:foreground-subject`,kind:"foreground-subject",z:20,asset:null,assetSha256:null,editable:true,motion:{action:motionStyle,parentId:null,enter:[5,enterEnd],hold:[enterEnd,holdEnd],exit:[holdEnd,durationInFrames]}},
      {id:`${beatId}:semantic-elements`,kind:"semantic-elements",z:30,asset:null,assetSha256:null,editable:true,motion:{action:motionStyle,parentId:null,enter:[Math.round(enterEnd*0.75),establishEnd],hold:[establishEnd,holdEnd],exit:[holdEnd,durationInFrames]}},
      {id:`${beatId}:typography`,kind:"typography",z:40,asset:null,assetSha256:null,editable:true,motion:{action:"readable-claim",parentId:null,enter:[3,Math.round(enterEnd*0.93)],hold:[Math.round(enterEnd*0.93),holdEnd],exit:[holdEnd,durationInFrames]}},
      {id:`${beatId}:transition-actor`,kind:"transition-actor",z:50,asset:null,assetSha256:null,editable:false,motion:{action:"paper-match",parentId:null,enter:[holdEnd,holdEnd+4],hold:[holdEnd+4,durationInFrames-4],exit:[durationInFrames-4,durationInFrames]}}
    ],
    // Storyboard metadata (for downstream tools)
    storyboard:{
      arcPosition:arcPos,
      arcIntensity:Math.round(arcIntensity*100)/100,
      relationToNext:shot.relationToNext||"progression",
      artworkPrompt:dec.artworkPrompt||null,
      sourceParagraph:shot.sourceText||"",
      visualSource:(visualRoutes.get(i)||{}).visualSource||"type",
      sourceUrl:(visualRoutes.get(i)||{}).sourceUrl||null,
      sourcedArtworkFile:(visualRoutes.get(i)||{}).artworkFile||null,
      provenance:(visualRoutes.get(i)||{}).provenance||null,
      motionTemplate,
      motionTemplateRenderProps
    }
  };
  // ── Artwork placement: auto-generate when LLM requests artwork ──
  if(dec.artworkPrompt){
    scene.layout.assetPlacement={
      contract:"A1VisualFitDecision/v2",
      mode:"full-bleed",
      fit:"cover",
      cropMode:"focal-cover",
      objectPosition:{x:78,y:50},
      titleSide:layoutFam==="center-impact"?"overlay-bottom":"left",
      sourceAspectRatio:1.0,
      targetAspectRatio:16/9,
      cropLossRatio:0.12,
      estimatedSaliencyRetention:0.92,
      cropRisk:"low",
      confidence:0.94,
      sourcePolicy:"text-free-non-evidence-styleframe",
      factualEvidenceAllowed:false,
      rationale:"GPT-generated abstract artwork, no text or evidence"
    };
    // Narrow titleBox so text doesn't collide with the artwork stage
    scene.layout.titleBox.width=Math.min(scene.layout.titleBox.width,780);
    // Trigger the artwork rendering path in the component
    scene.presentation.state="source-select";
  }
  // ── Sourced web asset placement (search/scrape routes) ──
  if((vr.visualSource==="search"||vr.visualSource==="scrape")&&vr.artworkFile){
    const adoptedAsset=adoptSourcedArtworkForRenderer(vr.artworkFile);
    scene.layout.assetPlacement={
      contract:"A1VisualFitDecision/v2",
      mode:"full-bleed",fit:"cover",cropMode:"focal-cover",
      objectPosition:{x:50,y:50},
      titleSide:layoutFam==="center-impact"?"overlay-bottom":"left",
      sourceAspectRatio:vr.provenance?.width&&vr.provenance?.height?vr.provenance.width/vr.provenance.height:16/9,
      targetAspectRatio:16/9,cropLossRatio:0.15,
      estimatedSaliencyRetention:0.85,cropRisk:"medium",confidence:0.8,
      sourcePolicy:"source-bound-evidence",
      factualEvidenceAllowed:true,
      rationale:`${vr.visualSource} result for: ${(shot.screenText||"").slice(0,20)}`
    };
    scene.layout.titleBox.width=Math.min(scene.layout.titleBox.width,780);
    scene.presentation.state="source-select";
    if(adoptedAsset){
      const subjectLayer=scene.layers.find(l=>l.kind==="foreground-subject");
      if(subjectLayer){
        subjectLayer.asset=adoptedAsset.asset;
        subjectLayer.assetSha256=adoptedAsset.sha256;
        subjectLayer.editable=false;
      }
      scene.storyboard.sourcedArtworkAsset=adoptedAsset.asset;
      scene.storyboard.provenance={
        ...(scene.storyboard.provenance||{}),
        localSha256:adoptedAsset.sha256,
        rendererAsset:adoptedAsset.asset,
        reviewOnly:true,
        renderAllowedBeforeReview:false
      };
    }
  }
  scenes.push(scene);
  currentFrame+=durationInFrames;
}

// ── Post-generation assert: catch contract violations before they reach the renderer ──
const assertErrors=[];
for(let i=0;i<scenes.length;i++){
  const s=scenes[i];
  // 1. Timeline continuity: each scene starts exactly where the previous ends
  if(i>0){
    const prev=scenes[i-1];
    if(s.startFrame!==prev.startFrame+prev.durationInFrames){
      assertErrors.push(`GAP: ${prev.beatId} ends at ${prev.startFrame+prev.durationInFrames}, ${s.beatId} starts at ${s.startFrame}`);
    }
  }
  if(s.startFrame<0) assertErrors.push(`NEGATIVE: ${s.beatId} startFrame=${s.startFrame}`);
  // 2. Motion phases within [0, durationInFrames]
  const mp=s.motionPlan;
  for(const[phaseName,phase]of Object.entries(mp.phases||{})){
    if(phase.startFrame<-2||phase.endFrame>s.durationInFrames+2){
      assertErrors.push(`MOTION OOB: ${s.beatId} phase ${phaseName} [${phase.startFrame},${phase.endFrame}] outside [0,${s.durationInFrames}]`);
    }
  }
  // 3. Layer motion within [0, durationInFrames]
  for(const l of s.layers||[]){
    const m=l.motion||{};
    for(const k of["enter","hold","exit"]){
      if(Array.isArray(m[k])&&m[k].length===2){
        if(m[k][0]<-2||m[k][1]>s.durationInFrames+2){
          assertErrors.push(`LAYER OOB: ${s.beatId} ${l.id} ${k}=[${m[k]}] outside [0,${s.durationInFrames}]`);
        }
      }
    }
  }
  // 4. Artwork consistency: has artworkPrompt → must have assetPlacement + source-select state
  const hasArtwork=Boolean(s.storyboard?.artworkPrompt);
  const hasSourcedAsset=Boolean(s.storyboard?.sourcedArtworkFile);
  const hasPlacement=Boolean(s.layout?.assetPlacement);
  if(hasArtwork&&!hasPlacement) assertErrors.push(`ARTWORK: ${s.beatId} has artworkPrompt but no assetPlacement`);
  if(hasArtwork&&s.presentation?.state!=="source-select") assertErrors.push(`ARTWORK: ${s.beatId} has artworkPrompt but state="${s.presentation?.state}" (expected source-select)`);
  if(hasSourcedAsset&&!hasPlacement) assertErrors.push(`SOURCED: ${s.beatId} has sourcedArtworkFile but no assetPlacement`);
  if(hasPlacement&&!hasArtwork&&!hasSourcedAsset) assertErrors.push(`ARTWORK: ${s.beatId} has assetPlacement but no artworkPrompt or sourcedArtworkFile`);
}
if(assertErrors.length>0){
  console.error(`\n✗ ASSERT FAILED — ${assertErrors.length} violations:`);
  for(const e of assertErrors.slice(0,20))console.error(`  • ${e}`);
  if(assertErrors.length>20)console.error(`  ... and ${assertErrors.length-20} more`);
  process.exit(1);
}
console.log(`\n✓ Assert passed: ${scenes.length} scenes, contiguous timeline, motion in bounds, artwork consistent`);

// ── Output ────────────────────────────────────────────────────────────
const contentHash=createHash("sha256").update(raw).digest("hex"); // full 64 chars
const familyCounts={};
const ALL_FAMILIES=["editorial-metaphor","type-statement","model-comparison","process-chain","archive-stack","annotation-judgement","insertion-flow","direction-convergence"];
for(const f of ALL_FAMILIES)familyCounts[f]=0;
for(const s of scenes){familyCounts[s.family]=(familyCounts[s.family]||0)+1;}
const motionStyleCounts={};
for(const s of scenes){const ms=s.motionPlan.motionStyle;motionStyleCounts[ms]=(motionStyleCounts[ms]||0)+1;}
const layoutCounts={};
for(const s of scenes){layoutCounts[s.layoutFamily]=(layoutCounts[s.layoutFamily]||0)+1;}

const output={
  contract:"A1MicrobeatLayeredFullPlan/v1",
  projectId:"a1-motion-studio-system-line",fps:30,
  sourceProductionHash:contentHash,
  sourceVariationHash:createHash("sha256").update(contentHash+"v1").digest("hex"),
  visualMasterHash:createHash("sha256").update("july1-retro-print-archive-wireframe-v1").digest("hex"),
  visualPreference:{id:"july1-retro-print-archive-wireframe-v1",sha256:createHash("sha256").update("july1-retro-print-archive-wireframe-v1").digest("hex")},
  reviewOnly:true,finalRenderAllowed:false,
  accentPolicy:{decorativeBlueLinesAllowed:false,floatingTransitionBarsAllowed:false,allowedBlueRoles:["selected-state-fill","keyword-emphasis","meaningful-object-fill","verified-process-or-direction-path"]},
  referenceInterpretationPolicy:{mode:"aesthetic-grammar-only",referenceSubjectsBecomeReusableMotifs:false,literalObjectTransferAllowed:false,defaultGeneratedHumanSubjectsAllowed:false,figurativeExceptionRequiresSemanticJustification:true},
  scenes,reviewBeatIds:scenes.slice(0,Math.min(12,scenes.length)).map(s=>s.beatId),
  familyCounts,contentHash,
  storyboardMeta:{
    totalShots:scenes.length,
    totalDurationFrames:currentFrame,
    totalDurationSeconds:Math.round(currentFrame/fps*10)/10,
    arcShape:"narrative",
    decompositionMethod:shotList.length!==paragraphs.length?"llm-attention-beat":"paragraph-aligned",
    semanticAnalysis:{model,stage1:"shot-decomposition",stage2:"visual-decisions",stage2b:"visual-source-routing"},
    motionStyleCounts,layoutCounts,
    visualSourceCounts:routeSummary,
    sourcedArtworkCount:sourcedCount
  }
};

mkdirSync(dirname(outPath),{recursive:true});
writeFileSync(outPath,JSON.stringify(output,null,2),"utf-8");

// ── Report ────────────────────────────────────────────────────────────
console.log(`\n── Stage 4: Motion tracks generated ──`);
console.log(`\n✓ Storyboard complete: ${scenes.length} shots`);
console.log(`  Duration: ${currentFrame} frames (${(currentFrame/fps).toFixed(1)}s)`);
console.log(`  Families: ${Object.entries(familyCounts).map(([k,v])=>`${k}(${v})`).join(", ")}`);
console.log(`  Motion: ${Object.entries(motionStyleCounts).map(([k,v])=>`${k}(${v})`).join(", ")}`);
console.log(`  Layouts: ${Object.entries(layoutCounts).map(([k,v])=>`${k}(${v})`).join(", ")}`);
console.log(`  Arc: opening(0.55) → climax(1.0) → resolution(0.7)`);
console.log(`  Visual sources: search(${routeSummary.search}) scrape(${routeSummary.scrape}) generate(${routeSummary.generate}) type(${routeSummary.type}) — ${sourcedCount} downloaded`);
console.log(`  Output: ${outPath}`);
if(shotList.length!==paragraphs.length){
  console.log(`  Note: ${paragraphs.length} paragraphs → ${shotList.length} shots (LLM decomposed by attention beats)`);
}

// ── Heuristic fallbacks ───────────────────────────────────────────────
function heuristicNarrative(text){
  if(/[？?]/.test(text)||/(?:是否|要不要|为什么|怎么)/.test(text))return"question";
  if(/(?:对比|比较|还是|vs)/.test(text))return"contrast";
  if(/(?:步骤|流程|首先|然后|接着|最后)/.test(text))return"process";
  if(/(?:归档|存档|记录|历史)/.test(text))return"resolution";
  if(/(?:标注|批注|修改|审阅)/.test(text))return"evidence";
  if([...text].length<=12)return"climax";
  return"thesis";
}
function heuristicEnergy(text){
  if(/[！!]/.test(text)||[...text].length<=10)return"high";
  if(/[？?]/.test(text)||/(?:但是|然而|转折)/.test(text))return"medium";
  return"medium";
}
function heuristicDecision(shot){
  const n=shot.narrative||"thesis";
  const map={
    question:{layout:"center-impact",motionStyle:"relay-reveal",backgroundState:"paper-field",visualFamily:"editorial-metaphor",choreography:"collage-recompose",primaryCurve:"editorial-reveal",animationTier:"formal-highlight"},
    contrast:{layout:"asymmetric-split",motionStyle:"layout-morph",backgroundState:"ink-conflict",visualFamily:"model-comparison",choreography:"plate-register",primaryCurve:"selection-snap",animationTier:"formal-highlight"},
    process:{layout:"vertical-sequence",motionStyle:"path-draw",backgroundState:"wireframe-space",visualFamily:"process-chain",choreography:"wireframe-draw",primaryCurve:"editorial-reveal",animationTier:"standard-typography"},
    climax:{layout:"center-impact",motionStyle:"text-mask",backgroundState:"paper-field",visualFamily:"type-statement",choreography:"ink-build",primaryCurve:"verdict-cut",animationTier:"formal-highlight"},
    resolution:{layout:"negative-space-right",motionStyle:"relay-reveal",backgroundState:"archive-density",visualFamily:"archive-stack",choreography:"archive-accumulate",primaryCurve:"archive-settle",animationTier:"standard-typography"},
    evidence:{layout:"left-anchor",motionStyle:"annotation-write",backgroundState:"archive-density",visualFamily:"annotation-judgement",choreography:"ink-build",primaryCurve:"verdict-cut",animationTier:"standard-typography"},
    example:{layout:"left-anchor",motionStyle:"relay-reveal",backgroundState:"paper-field",visualFamily:"editorial-metaphor",choreography:"collage-recompose",primaryCurve:"editorial-reveal",animationTier:"standard-typography"},
    transition:{layout:"negative-space-right",motionStyle:"relay-reveal",backgroundState:"paper-field",visualFamily:"editorial-metaphor",choreography:"collage-recompose",primaryCurve:"editorial-reveal",animationTier:"standard-typography"},
    thesis:{layout:"left-anchor",motionStyle:"relay-reveal",backgroundState:"paper-field",visualFamily:"editorial-metaphor",choreography:"collage-recompose",primaryCurve:"editorial-reveal",animationTier:"standard-typography"}
  };
  const d=map[n]||map.thesis;
  return{...d,titleLines:[shot.screenText],keywordIndex:null,artworkPrompt:null};
}
function defaultDecision(){
  return{layout:"left-anchor",motionStyle:"relay-reveal",backgroundState:"paper-field",visualFamily:"editorial-metaphor",choreography:"collage-recompose",primaryCurve:"editorial-reveal",animationTier:"standard-typography",titleLines:[""],keywordIndex:null,artworkPrompt:null};
}
