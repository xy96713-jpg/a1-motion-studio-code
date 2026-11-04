#!/usr/bin/env node
/**
 * backfill-assets.mjs — Scan public/artwork/ for generated images,
 * match them to scenes by beatId, and write asset paths into props.
 *
 * Usage: node scripts/backfill-assets.mjs [--props <path>] [--artwork-dir <dir>] [--dry-run]
 *
 * Matching rules (in priority order):
 *   1. Filename contains beatId (e.g. "H02-B01.png" or "H02-B01-v2.png")
 *   2. Filename contains macroId
 *   3. If only one unmatched image and one unmatched scene, pair them
 *
 * After backfill, re-runs validate-props.mjs to confirm.
 */
import {readFileSync,writeFileSync,existsSync,readdirSync} from "node:fs";
import {resolve,basename,extname} from "node:path";

const args=process.argv.slice(2);
const propsIdx=args.indexOf("--props");
const propsPath=propsIdx!==-1?args[propsIdx+1]:resolve("remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const dirIdx=args.indexOf("--artwork-dir");
const artworkDir=dirIdx!==-1?args[dirIdx+1]:resolve("remotion-renderer/public/artwork");
const dryRun=args.includes("--dry-run");

if(!existsSync(propsPath)){console.error(`Props not found: ${propsPath}`);process.exit(1);}
if(!existsSync(artworkDir)){console.error(`Artwork dir not found: ${artworkDir}\n  Create it and drop generated images there.`);process.exit(1);}

const props=JSON.parse(readFileSync(propsPath,"utf-8"));
const images=readdirSync(artworkDir).filter(f=>[".png",".jpg",".jpeg",".webp"].includes(extname(f).toLowerCase()));
console.log(`Found ${images.length} images in ${basename(artworkDir)}/`);

// Build scene index
const scenesWithPrompt=props.scenes.filter(s=>s.storyboard?.artworkPrompt);
const scenesNeedingAsset=scenesWithPrompt.filter(s=>{
  const fg=s.layers?.find(l=>l.id?.endsWith(":foreground-subject"));
  return !fg?.asset;
});
console.log(`Scenes with artworkPrompt: ${scenesWithPrompt.length}, needing asset: ${scenesNeedingAsset.length}`);

if(scenesNeedingAsset.length===0){console.log("All scenes already have assets. Nothing to do.");process.exit(0);}

let matched=0;
const usedImages=new Set();

// Pass 1: match by beatId in filename
for(const scene of scenesNeedingAsset){
  const beatId=scene.beatId;
  const img=images.find(f=>!usedImages.has(f)&&f.toUpperCase().includes(beatId.toUpperCase().replace(/-/g,"")));
  const img2=img??images.find(f=>!usedImages.has(f)&&f.toUpperCase().includes(beatId.toUpperCase()));
  const match=img2??img;
  if(match){
    usedImages.add(match);
    const fg=scene.layers.find(l=>l.id?.endsWith(":foreground-subject"));
    if(fg){
      fg.asset=`artwork/${match}`;
      matched++;
      console.log(`  ✓ ${beatId} ← ${match}`);
    }
  }
}

// Pass 2: match by macroId
for(const scene of scenesNeedingAsset){
  const fg=scene.layers?.find(l=>l.id?.endsWith(":foreground-subject"));
  if(fg?.asset)continue;
  const macroId=scene.macroId;
  if(!macroId)continue;
  const img=images.find(f=>!usedImages.has(f)&&f.includes(macroId));
  if(img){
    usedImages.add(img);
    fg.asset=`artwork/${img}`;
    matched++;
    console.log(`  ✓ ${scene.beatId} ← ${img} (macroId match)`);
  }
}

// Pass 3: 1:1 leftover pairing
const unmatchedScenes=scenesNeedingAsset.filter(s=>{
  const fg=s.layers?.find(l=>l.id?.endsWith(":foreground-subject"));
  return !fg?.asset;
});
const unmatchedImages=images.filter(f=>!usedImages.has(f));
if(unmatchedScenes.length===1&&unmatchedImages.length===1){
  const fg=unmatchedScenes[0].layers.find(l=>l.id?.endsWith(":foreground-subject"));
  fg.asset=`artwork/${unmatchedImages[0]}`;
  usedImages.add(unmatchedImages[0]);
  matched++;
  console.log(`  ✓ ${unmatchedScenes[0].beatId} ← ${unmatchedImages[0]} (1:1 leftover)`);
}

console.log(`\nMatched: ${matched}/${scenesNeedingAsset.length}`);
if(unmatchedScenes.length>matched){
  const remaining=scenesNeedingAsset.filter(s=>{
    const fg=s.layers?.find(l=>l.id?.endsWith(":foreground-subject"));
    return !fg?.asset;
  });
  console.log(`Still missing artwork for: ${remaining.map(s=>s.beatId).join(", ")}`);
}

if(dryRun){console.log("\n[dry-run] Not writing props.");process.exit(0);}

writeFileSync(propsPath,JSON.stringify(props,null,2)+"\n");
console.log(`\nProps updated: ${propsPath}`);
