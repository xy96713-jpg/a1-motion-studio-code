#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const base=path.join(root,"work/typography-maturity-lab-v1");
const out=path.join(base,"diagnostic-composites");
const sha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const pairs=[
  {id:"opinion",carrier:"opinion-maker-v1.png",type:"opinion-gawx02-v1.png",copy:"改变 / 不等于进步",reference:"gawx-02"},
  {id:"object",carrier:"object-timer-v1.png",type:"object-gawx04-v1.png",copy:"拆开 / 看清",reference:"gawx-04"},
  {id:"data",carrier:"data-sheet-v1.png",type:"data-atlas05-v1.png",copy:"42→18 / 模拟数据",reference:"atlas-05"},
];
fs.mkdirSync(out,{recursive:true});
const records=[];
for(const pair of pairs){
  const carrierFile=path.join(base,"carriers",pair.carrier),typeFile=path.join(base,"glyph-candidates",pair.type);
  const carrier=fs.readFileSync(carrierFile),type=fs.readFileSync(typeFile);
  const [carrierMeta,typeMeta]=await Promise.all([sharp(carrier).metadata(),sharp(type).metadata()]);
  if(carrierMeta.width!==typeMeta.width||carrierMeta.height!==typeMeta.height)throw new Error(`source-type-dimensions-differ:${pair.id}`);
  const composite=await sharp(carrier).composite([{input:type,left:0,top:0}]).png().toBuffer();
  const small=await sharp(composite).resize({width:480,height:270,fit:"fill"}).png().toBuffer();
  const outFile=path.join(out,`${pair.id}-composite.png`),smallFile=path.join(out,`${pair.id}-270p.png`);
  fs.writeFileSync(outFile,composite);fs.writeFileSync(smallFile,small);
  const [sourceRaw,resultRaw,alphaRaw]=await Promise.all([
    sharp(carrier).ensureAlpha().raw().toBuffer(),sharp(composite).ensureAlpha().raw().toBuffer(),sharp(type).extractChannel(3).raw().toBuffer(),
  ]);
  let unchangedOutsideType=true,changedOutsideCount=0;
  for(let pixel=0;pixel<alphaRaw.length;pixel++)if(alphaRaw[pixel]===0){
    const offset=pixel*4;
    for(let channel=0;channel<3;channel++)if(sourceRaw[offset+channel]!==resultRaw[offset+channel]){unchangedOutsideType=false;changedOutsideCount++;break;}
  }
  records.push({id:pair.id,copy:pair.copy,reference:pair.reference,carrierSha256:sha(carrier),generatedTypeSha256:sha(type),
    composite:path.relative(root,outFile),compositeSha256:sha(composite),small:path.relative(root,smallFile),smallSha256:sha(small),
    sourcePixelsUnchangedOutsideType:unchangedOutsideType,changedOutsidePixelCount:changedOutsideCount,
    status:"DIAGNOSTIC_PREVIEW_ONLY_PENDING_VISUAL_AND_TEXT_REVIEW"});
}
fs.writeFileSync(path.join(out,"manifest.json"),`${JSON.stringify({contract:"A1TypographyMaturityDiagnosticComposites/v1",records},null,2)}\n`);
console.log(JSON.stringify({status:"DIAGNOSTIC_PREVIEW_ONLY",records:records.map(({id,sourcePixelsUnchangedOutsideType,changedOutsidePixelCount,composite,small})=>({id,sourcePixelsUnchangedOutsideType,changedOutsidePixelCount,composite,small}))},null,2));
