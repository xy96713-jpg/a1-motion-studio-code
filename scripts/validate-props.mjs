#!/usr/bin/env node
/**
 * validate-props.mjs — Pre-render validation for microbeatLayeredFullProps.json
 * Catches: schema violations, missing assets, SHA mismatches, layout inconsistencies.
 *
 * Usage: node scripts/validate-props.mjs [--props <path>] [--smoke]
 *   --smoke  Also render one still per Hero beat to verify artwork visibility
 */
import {readFileSync,existsSync,statSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

const args=process.argv.slice(2);
const propsIdx=args.indexOf("--props");
const propsPath=resolve(propsIdx!==-1?args[propsIdx+1]:"remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const smoke=args.includes("--smoke");
const rendererPublic=resolve("remotion-renderer/public");

const sha256=buf=>createHash("sha256").update(buf).digest("hex");
const errors=[];
const warnings=[];

// ── 1. Load & basic structure ──
if(!existsSync(propsPath)){errors.push(`FATAL: props file not found: ${propsPath}`);report();process.exit(1);}
let props;
try{props=JSON.parse(readFileSync(propsPath,"utf-8"));}catch(e){errors.push(`FATAL: invalid JSON: ${e.message}`);report();process.exit(1);}

if(props.contract!=="A1MicrobeatLayeredFullPlan/v1")errors.push(`contract mismatch: ${props.contract}`);
if(props.fps!==30)warnings.push(`fps=${props.fps} (expected 30)`);
if(!Array.isArray(props.scenes)||!props.scenes.length)errors.push("scenes array empty or missing");

// ── 2. Per-scene validation ──
const artworkScenes=[];
for(const scene of props.scenes||[]){
  const bid=scene.beatId||"unknown";

  // 2a. Required fields
  for(const f of ["beatId","macroId","startFrame","durationInFrames","screenText","presentation","titleLines","layout","motionPlan","layers"]){
    if(scene[f]===undefined)errors.push(`${bid}: missing field '${f}'`);
  }

  // 2b. Layout completeness
  const layout=scene.layout||{};
  if(!layout.titleBox)errors.push(`${bid}: missing layout.titleBox`);
  if(!layout.typography)errors.push(`${bid}: missing layout.typography`);
  if(!layout.stageBox)warnings.push(`${bid}: missing layout.stageBox`);

  // 2c. Asset placement validation (the triple-gate)
  const ap=layout.assetPlacement;
  const subjectLayer=(scene.layers||[]).find(l=>l.kind==="foreground-subject");
  if(ap){
    // Schema-required fields
    const required=["fit","sourceAspectRatio","targetAspectRatio","cropRisk"];
    for(const f of required){
      if(ap[f]===undefined)errors.push(`${bid}: assetPlacement missing required field '${f}'`);
    }
    // Triple-gate fields
    if(ap.contract!=="A1VisualFitDecision/v2")errors.push(`${bid}: assetPlacement.contract='${ap.contract}' (must be A1VisualFitDecision/v2)`);
    if(ap.sourcePolicy!=="text-free-non-evidence-styleframe")errors.push(`${bid}: assetPlacement.sourcePolicy='${ap.sourcePolicy}' (must be text-free-non-evidence-styleframe)`);
    if(ap.factualEvidenceAllowed!==false)errors.push(`${bid}: assetPlacement.factualEvidenceAllowed=${ap.factualEvidenceAllowed} (must be false)`);
    // Must have subject layer with asset
    if(!subjectLayer||!subjectLayer.asset){
      errors.push(`${bid}: has assetPlacement but foreground-subject layer has no asset`);
    }
    // Presentation state should be source-select for artwork to render
    if(scene.presentation?.state!=="source-select"){
      warnings.push(`${bid}: assetPlacement present but presentation.state='${scene.presentation?.state}' (artwork may not render; expected 'source-select')`);
    }
    artworkScenes.push({bid,scene,subjectLayer});
  }

  // 2d. Asset file existence + SHA check
  if(subjectLayer?.asset){
    const assetRel=subjectLayer.asset;
    const assetAbs=join(rendererPublic,assetRel);
    if(!existsSync(assetAbs)){
      errors.push(`${bid}: asset file NOT FOUND at remotion-renderer/public/${assetRel}`);
    }else{
      const actualSha=sha256(readFileSync(assetAbs));
      if(subjectLayer.assetSha256&&subjectLayer.assetSha256!==actualSha){
        errors.push(`${bid}: assetSha256 mismatch (props=${subjectLayer.assetSha256.slice(0,12)}... actual=${actualSha.slice(0,12)}...)`);
      }
    }
  }

  // 2e. Motion plan sanity
  const mp=scene.motionPlan;
  if(mp){
    if(!mp.tracks?.length)warnings.push(`${bid}: motionPlan.tracks empty`);
    if(mp.phases){
      const {enter,establish,emphasize,hold,exit}=mp.phases;
      if(enter&&establish&&enter.endFrame>establish.endFrame)warnings.push(`${bid}: phase overlap enter.end > establish.end`);
      if(hold&&exit&&hold.endFrame>exit.endFrame)warnings.push(`${bid}: phase overlap hold.end > exit.end`);
    }
  }
}

// ── 3. Global consistency ──
const beatIds=new Set();
for(const scene of props.scenes||[]){
  if(beatIds.has(scene.beatId))errors.push(`duplicate beatId: ${scene.beatId}`);
  beatIds.add(scene.beatId);
}
// Frame continuity
let prevEnd=0;
for(const scene of props.scenes||[]){
  if(scene.startFrame<prevEnd-2)warnings.push(`${scene.beatId}: startFrame(${scene.startFrame}) < previous end(${prevEnd}) — overlap`);
  prevEnd=scene.startFrame+(scene.durationInFrames||0);
}

// ── 4. Smoke test (optional) ──
if(smoke&&artworkScenes.length){
  console.log(`\n── Smoke test: rendering ${artworkScenes.length} Hero stills ──`);
  for(const {bid,scene} of artworkScenes){
    // Pick frame at 40% into the scene (past enter, in hold)
    const testFrame=scene.startFrame+Math.round(scene.durationInFrames*0.4);
    const outPath=`/tmp/validate-smoke-${bid}.png`;
    try{
      execFileSync("npx",["remotion","still","A1SystemLineHFullTimelineReview",`--frame=${testFrame}`,`--output=${outPath}`,"--scale=1"],{cwd:resolve("remotion-renderer"),encoding:"utf-8",timeout:60000,stdio:["ignore","pipe","pipe"]});
      if(existsSync(outPath)){
        const size=statSync(outPath).size;
        if(size<50000){
          warnings.push(`${bid}: smoke still only ${Math.round(size/1024)}KB — artwork may not be visible (text-only frames are typically <30KB)`);
        }else{
          console.log(`  ✓ ${bid}: frame ${testFrame} → ${Math.round(size/1024)}KB`);
        }
      }else{
        errors.push(`${bid}: smoke render produced no output file`);
      }
    }catch(e){
      errors.push(`${bid}: smoke render failed: ${e.message?.slice(0,200)}`);
    }
  }
}

// ── Report ──
function report(){
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  VALIDATION REPORT: ${propsPath.split("/").pop()}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Scenes: ${(props.scenes||[]).length}  |  Artwork scenes: ${artworkScenes.length}`);
  if(errors.length){
    console.log(`\n  ✗ ERRORS (${errors.length}):`);
    errors.forEach(e=>console.log(`    • ${e}`));
  }else{
    console.log(`\n  ✓ No errors`);
  }
  if(warnings.length){
    console.log(`\n  ⚠ WARNINGS (${warnings.length}):`);
    warnings.forEach(w=>console.log(`    • ${w}`));
  }
  console.log(`\n  Result: ${errors.length?"FAIL":"PASS"}${warnings.length?` (${warnings.length} warnings)`:""}`);
  console.log(`${"═".repeat(60)}\n`);
}
report();
process.exit(errors.length?1:0);
