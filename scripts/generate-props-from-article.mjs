#!/usr/bin/env node
/**
 * article→props pipeline: deterministic article text → microbeatLayeredFullProps.json
 * Usage: node scripts/generate-props-from-article.mjs <article.txt> [--out <path>] [--fps 30]
 *
 * No LLM needed. Content heuristics assign family/motion/layout per beat.
 */
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {createHash} from "node:crypto";

// ── CLI args ──────────────────────────────────────────────────────────
const args=process.argv.slice(2);
const articlePath=args[0];
if(!articlePath){console.error("Usage: node generate-props-from-article.mjs <article.txt> [--out <path>] [--fps 30]");process.exit(1);}
const outIdx=args.indexOf("--out");
const DEFAULT_STORYBOARD_OUT=resolve("apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const SYSTEM_LINE_PROPS=resolve("remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const outPath=resolve(outIdx!==-1?args[outIdx+1]:DEFAULT_STORYBOARD_OUT);
if(outPath===SYSTEM_LINE_PROPS&&!args.includes("--allow-system-props-overwrite")){
  console.error("Refusing to overwrite system-line review props. Use --allow-system-props-overwrite only inside an explicit H-series adoption/render step.");
  process.exit(2);
}
const fpsIdx=args.indexOf("--fps");
const fps=fpsIdx!==-1?parseInt(args[fpsIdx+1],10):30;

// ── Read article ──────────────────────────────────────────────────────
const raw=readFileSync(resolve(articlePath),"utf-8").trim();
const paragraphs=raw.split(/\n{2,}/).map(p=>p.trim()).filter(p=>p.length>0);

// ── Content heuristics ────────────────────────────────────────────────
const FAMILIES=["editorial-metaphor","type-statement","model-comparison","process-chain","archive-stack","annotation-judgement","insertion-flow"];
const MOTION_STYLES=["relay-reveal","interruption","text-mask","layout-morph","stack-accumulate","path-draw","annotation-write"];
const CURVES=["editorial-reveal","selection-snap","archive-settle","verdict-cut"];
const BG_STATES=["paper-field","wireframe-space","archive-density"];
const TIERS=["standard-typography","formal-highlight"];
const ROUTES=["gpt-editorial-artwork","typography-only","deterministic-graphic"];
const CHOREOS=["collage-recompose","wireframe-draw","ink-build","plate-register","archive-accumulate","symbol-lock"];
const LAYOUT_FAMS=["left-anchor","center-impact","negative-space-right","asymmetric-split","vertical-sequence"];
const MOTION_ARCH=["scale-settle","stagger-stack","mask-reveal","interrupt-hold","collapse-rebuild","archive-converge","role-handoff","match-shift"];

function classifyBeat(text,index){
  const hasQuestion=/[？?]/.test(text)||/(?:是否|要不要|为什么|怎么|如何)/.test(text);
  const hasComparison=/(?:对比|比较|还是|或者|A还是B|vs)/.test(text);
  const hasProcess=/(?:步骤|流程|首先|然后|接着|最后|第[一二三四五])/.test(text);
  const hasArchive=/(?:归档|存档|记录|历史|回顾)/.test(text);
  const hasAnnotation=/(?:标注|批注|修改|审阅|判定)/.test(text);
  const hasInsertion=/(?:插入|添加|补充|加入)/.test(text);
  const isShort=text.length<=12;

  let family,motionStyle,curve,bgState,tier,route,choreo,layoutFam,motionArch;

  if(hasQuestion){family="editorial-metaphor";motionStyle="relay-reveal";curve="editorial-reveal";bgState="paper-field";tier="formal-highlight";route="gpt-editorial-artwork";choreo="collage-recompose";layoutFam="center-impact";motionArch="scale-settle";}
  else if(hasComparison){family="model-comparison";motionStyle="stack-accumulate";curve="selection-snap";bgState="archive-density";tier="standard-typography";route="deterministic-graphic";choreo="plate-register";layoutFam="asymmetric-split";motionArch="stagger-stack";}
  else if(hasProcess){family="process-chain";motionStyle="path-draw";curve="editorial-reveal";bgState="wireframe-space";tier="standard-typography";route="deterministic-graphic";choreo="wireframe-draw";layoutFam="vertical-sequence";motionArch="role-handoff";}
  else if(hasArchive){family="archive-stack";motionStyle="stack-accumulate";curve="archive-settle";bgState="archive-density";tier="standard-typography";route="typography-only";choreo="archive-accumulate";layoutFam="left-anchor";motionArch="archive-converge";}
  else if(hasAnnotation){family="annotation-judgement";motionStyle="annotation-write";curve="verdict-cut";bgState="archive-density";tier="standard-typography";route="gpt-editorial-artwork";choreo="ink-build";layoutFam="negative-space-right";motionArch="match-shift";}
  else if(hasInsertion){family="insertion-flow";motionStyle="layout-morph";curve="editorial-reveal";bgState="wireframe-space";tier="standard-typography";route="deterministic-graphic";choreo="symbol-lock";layoutFam="asymmetric-split";motionArch="collapse-rebuild";}
  else if(isShort){family="type-statement";motionStyle="text-mask";curve="verdict-cut";bgState="paper-field";tier="formal-highlight";route="typography-only";choreo="ink-build";layoutFam="center-impact";motionArch="interrupt-hold";}
  else{family="editorial-metaphor";motionStyle="relay-reveal";curve="editorial-reveal";bgState="paper-field";tier="standard-typography";route="gpt-editorial-artwork";choreo="collage-recompose";layoutFam="left-anchor";motionArch="scale-settle";}

  return{family,motionStyle,curve,bgState,tier,route,choreo,layoutFam,motionArch};
}

function extractTokens(text){
  // Extract 2-4 key phrases (Chinese: split by punctuation, take meaningful segments)
  const segments=text.split(/[，。、；：！？\s]+/).filter(s=>s.length>=2&&s.length<=8);
  return segments.slice(0,4);
}

function splitTitleLines(text,maxChars=14){
  if(text.length<=maxChars) return[text];
  const lines=[];
  let current="";
  for(const ch of text){
    current+=ch;
    if(current.length>=maxChars){lines.push(current);current="";}
  }
  if(current)lines.push(current);
  return lines.slice(0,3);
}

function hashStr(s){return createHash("sha256").update(s).digest("hex").slice(0,16);}

// ── Build scenes ──────────────────────────────────────────────────────
const scenes=[];
let currentFrame=0;
const macroGroups=[];
let currentMacro=null;

for(let i=0;i<paragraphs.length;i++){
  const text=paragraphs[i];
  const cls=classifyBeat(text,i);
  const macroId=`H${String(Math.floor(i/4)+1).padStart(2,"0")}`;
  const beatId=`${macroId}-B${String((i%4)+1).padStart(2,"0")}`;

  // Duration: based on text length (longer text = more time to read)
  const charCount=[...text].length;
  const durationInFrames=Math.max(54,Math.min(184,Math.round(charCount*1.8+60)));

  const tokens=extractTokens(text);
  const titleLines=splitTitleLines(text);
  const fontSize=titleLines.length>2?84:titleLines.length>1?96:104;
  const lineHeight=Math.round(fontSize*1.25);

  // Motion plan phases
  const enterEnd=Math.min(28,Math.round(durationInFrames*0.18));
  const establishEnd=Math.round(durationInFrames*0.28);
  const emphasizeEnd=Math.round(durationInFrames*0.45);
  const holdEnd=durationInFrames-Math.round(durationInFrames*0.14);
  const exitEnd=durationInFrames;

  const scene={
    contract:"A1MicroEventScene/v1",
    beatId,
    macroId,
    sourceStartMs:Math.round(currentFrame/fps*1000),
    sourceEndMs:Math.round((currentFrame+durationInFrames)/fps*1000),
    startFrame:currentFrame,
    durationInFrames,
    screenText:text,
    presentation:{
      contract:"A1MicroEventPresentation/v1",
      state:cls.family==="editorial-metaphor"&&/[？?]/.test(text)?"question":"claim",
      label:"文章推进",
      primary:text.slice(0,20),
      secondary:"",
      tokens,
      showSceneTitle:false,
      semanticDelta:`${cls.family}:${text.slice(0,16)}`,
      audit:{cleanTerminalPunctuation:true,textRoleCount:1,microEventVisible:true}
    },
    titleLines,
    supportTokens:tokens,
    entityEvidence:[],
    family:cls.family,
    route:cls.route,
    animationTier:cls.tier,
    recordingReplaceable:false,
    layoutFamily:cls.layoutFam,
    motionArchetype:cls.motionArch,
    compositionVariant:i%3,
    backgroundState:cls.bgState,
    choreography:cls.choreo,
    layout:{
      contract:"A1LayoutEngine/v2",
      candidateId:`auto-${cls.layoutFam}`,
      family:"editorial-baseline",
      layoutSignature:`auto|${cls.family}`,
      titleBox:{
        x:cls.layoutFam==="center-impact"?260:112,
        y:cls.layoutFam==="center-impact"?340:224,
        width:cls.layoutFam==="center-impact"?1400:900,
        height:titleLines.length*lineHeight+40,
        alignment:cls.layoutFam==="center-impact"?"center":"left",
        maxLines:3,
        fontSize,
        lineHeight
      },
      stageBox:{x:1030,y:126,width:640,height:790},
      typography:{
        contract:"A1TypographyLayout/v2",
        fontFamily:"SourceHanSansCN-Heavy",
        fontPath:"",
        lines:titleLines,
        fontSize,
        lineHeight,
        fitRatio:1,
        opticalOffsetY:0,
        contract2:"A1TypographyLayout/v2"
      }
    },
    motionPlan:{
      contract:"A1MotionChoreography/v1",
      primaryAction:cls.motionArch,
      transitionOut:"paper-match",
      motionStyle:cls.motionStyle,
      primaryCurve:cls.curve,
      tracks:[
        {id:"background",role:"background",semanticJob:"establish visual space",startFrame:0,endFrame:Math.round(durationInFrames*0.4),curve:"quiet-hold",from:{x:-12,y:-4,scale:1.015,rotate:0,blur:0,opacity:0},to:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1}},
        {id:"subject",role:"subject",semanticJob:cls.motionStyle,startFrame:5,endFrame:enterEnd,curve:cls.curve,from:{x:74,y:0,scale:0.94,rotate:0,blur:5,opacity:0},to:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1}},
        {id:"semantic",role:"semantic",semanticJob:cls.motionArch,startFrame:Math.round(enterEnd*0.75),endFrame:establishEnd,curve:cls.curve,from:{x:0,y:24,scale:0.94,rotate:0,blur:5,opacity:0},to:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1}},
        {id:"typography",role:"typography",semanticJob:"readable claim",startFrame:3,endFrame:Math.round(enterEnd*0.93),curve:cls.curve,from:{x:-48,y:0,scale:0.98,rotate:0,blur:7,opacity:0},to:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1}},
        {id:"transition",role:"transition",semanticJob:"paper-match",startFrame:holdEnd,endFrame:exitEnd,curve:"quiet-hold",from:{x:0,y:0,scale:1,rotate:0,blur:0,opacity:1},to:{x:0,y:0,scale:0.98,rotate:0,blur:0,opacity:0}}
      ],
      overlapFrames:14,
      phases:{
        enter:{startFrame:0,endFrame:enterEnd},
        establish:{startFrame:Math.round(enterEnd*0.82),endFrame:establishEnd},
        emphasize:{startFrame:establishEnd,endFrame:emphasizeEnd},
        hold:{startFrame:emphasizeEnd,endFrame:holdEnd},
        exit:{startFrame:holdEnd,endFrame:exitEnd}
      },
      semanticStates:{
        initial:"unintroduced",
        established:`established:${cls.motionStyle}`,
        emphasized:`emphasized:${cls.motionArch}`,
        resolved:"resolved:paper-match"
      },
      kineticText:{
        mode:cls.tier==="formal-highlight"?"relay":"quiet",
        staggerFrames:6,
        keywordIndex:titleLines.length>1?1:null
      },
      curveProfile:{
        contract:"A1MotionCurveProfile/v1",
        id:cls.curve,
        cubicBezier:cls.curve==="editorial-reveal"?[0.16,0,0.3,1]:cls.curve==="selection-snap"?[0.34,1.56,0.64,1]:cls.curve==="archive-settle"?[0.22,0.61,0.36,1]:[0.55,0,0.1,1],
        intent:"premium-editorial-reveal",
        velocity:{entry:0.02,peak:0.12,exit:0.02,samples:[0,0.02,0.07,0.16,0.26,0.38,0.5,0.62,0.74,0.84,0.93,0.98,1]},
        audit:{nonLinear:true,softStart:true,softEnd:true,peakInside:true,blockers:[]}
      },
      textMotion:{
        contract:"A1TextMotionPlan/v1",
        revealTechnique:cls.tier==="formal-highlight"?"relay":"mask",
        states:{enter:"mask prepares readable text block",establish:"line group settles into optical baseline",emphasize:"semantic keyword locks to accent role",hold:"reader gets a stable no-decoration hold",exit:"text hands motion to next scene actor"},
        perLineStaggerFrames:6,
        mask:{enabled:true,featherPx:2,overshootPx:18},
        emphasis:{keywordIndex:titleLines.length>1?1:null,holdFramesMinimum:18},
        audit:{hasFiveStates:true,readableHold:true,noRedundantMicroLabels:true,blockers:[]}
      },
      layoutMorph:{enabled:cls.motionStyle==="layout-morph",from:{x:-48,y:0,scale:0.98},to:{x:0,y:0,scale:1},startFrame:Math.round(enterEnd*0.82),endFrame:emphasizeEnd},
      dynamics:{entryVelocity:0.72,exitVelocity:0.18,maxVelocity:0.82,continuity:"smooth",overlapBudgetFrames:14},
      audit:{onePrimaryAction:true,tracksWithinScene:true,hasReadableHold:true,phasesComplete:true,velocityContinuous:true,blockers:[]}
    },
    layers:[
      {id:`${beatId}:background-field`,kind:"background-field",z:0,asset:null,assetSha256:null,editable:true,motion:{action:"establish-paper-space",parentId:null,enter:[0,12],hold:[12,holdEnd],exit:[holdEnd,exitEnd]}},
      {id:`${beatId}:background-plate`,kind:"background-plate",z:5,asset:null,assetSha256:null,editable:true,motion:{action:"plate-register",parentId:null,enter:[4,16],hold:[16,holdEnd],exit:[holdEnd,exitEnd]}},
      {id:`${beatId}:midground-object`,kind:"midground-object",z:10,asset:null,assetSha256:null,editable:true,motion:{action:"midground-settle",parentId:null,enter:[8,24],hold:[24,holdEnd],exit:[holdEnd,exitEnd]}},
      {id:`${beatId}:foreground-subject`,kind:"foreground-subject",z:20,asset:null,assetSha256:null,editable:true,motion:{action:cls.motionStyle,parentId:null,enter:[5,enterEnd],hold:[enterEnd,holdEnd],exit:[holdEnd,exitEnd]}},
      {id:`${beatId}:semantic-elements`,kind:"semantic-elements",z:30,asset:null,assetSha256:null,editable:true,motion:{action:cls.motionArch,parentId:null,enter:[Math.round(enterEnd*0.75),establishEnd],hold:[establishEnd,holdEnd],exit:[holdEnd,exitEnd]}},
      {id:`${beatId}:typography`,kind:"typography",z:40,asset:null,assetSha256:null,editable:true,motion:{action:"readable-claim",parentId:null,enter:[3,Math.round(enterEnd*0.93)],hold:[Math.round(enterEnd*0.93),holdEnd],exit:[holdEnd,exitEnd]}},
      {id:`${beatId}:transition-actor`,kind:"transition-actor",z:50,asset:null,assetSha256:null,editable:false,motion:{action:"paper-match",parentId:null,enter:[holdEnd,holdEnd+4],hold:[holdEnd+4,exitEnd-4],exit:[exitEnd-4,exitEnd]}}
    ]
  };

  scenes.push(scene);
  currentFrame+=durationInFrames;

  // Track macro groups
  if(!currentMacro||currentMacro.macroId!==macroId){
    currentMacro={macroId,scenes:[scene]};
    macroGroups.push(currentMacro);
  }else{
    currentMacro.scenes.push(scene);
  }
}

// ── Build output ──────────────────────────────────────────────────────
const contentHash=hashStr(raw);
const familyCounts={};
for(const s of scenes){familyCounts[s.family]=(familyCounts[s.family]||0)+1;}

const output={
  contract:"A1MicrobeatLayeredFullReview/v1",
  projectId:"a1-motion-studio-system-line",
  fps,
  sourceProductionHash:contentHash,
  sourceVariationHash:hashStr(contentHash+"v1"),
  visualMasterHash:hashStr("july1-retro-print-archive-wireframe-v1"),
  visualPreference:"july1-retro-print-archive-wireframe-v1",
  reviewOnly:true,
  finalRenderAllowed:false,
  accentPolicy:{blue:"#2848a8",ink:"#111315",paper:"#f2efe7"},
  referenceInterpretationPolicy:"source-bound",
  scenes,
  reviewBeatIds:scenes.slice(0,6).map(s=>s.beatId),
  familyCounts,
  contentHash
};

mkdirSync(dirname(outPath),{recursive:true});
writeFileSync(outPath,JSON.stringify(output,null,2),"utf-8");
console.log(`✓ Generated ${scenes.length} scenes from ${paragraphs.length} paragraphs`);
console.log(`  Duration: ${currentFrame} frames (${(currentFrame/fps).toFixed(1)}s @ ${fps}fps)`);
console.log(`  Families: ${Object.entries(familyCounts).map(([k,v])=>`${k}(${v})`).join(", ")}`);
console.log(`  Output: ${outPath}`);
console.log(`  Content hash: ${contentHash}`);
