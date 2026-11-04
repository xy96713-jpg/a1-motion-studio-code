#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const out=path.join(root,"work/typography-maturity-lab-v1/controls");
const fontFile=path.join(root,"apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf");
const font=fontkit.openSync(fontFile);
const sha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const specs=[
  {id:"opinion",groups:[{text:"改变",x:90,y:525,size:360,color:"#f4edd8"},{text:"不等于进步",x:90,y:720,size:128,color:"#e85a45"}]},
  {id:"object",groups:[{text:"拆开",x:85,y:440,size:300,color:"#efe8d8"},{text:"看清",x:180,y:670,size:220,color:"#d3e1dc"}]},
  {id:"data",groups:[{text:"42→18",x:110,y:520,size:280,color:"#242a29"},{text:"模拟数据",x:115,y:680,size:105,color:"#b74132"}]},
];
fs.mkdirSync(out,{recursive:true});
const result=[];
for(const spec of specs){
  const layers=spec.groups.map((group)=>{
    const missing=[...group.text].filter((char)=>!font.hasGlyphForCodePoint(char.codePointAt(0)));
    if(missing.length)throw new Error(`font-glyph-control-missing:${spec.id}:${missing.join("")}`);
    const run=font.layout(group.text);let advance=0;
    const paths=run.glyphs.map((glyph,index)=>{const x=advance+(run.positions[index].xOffset||0);advance+=run.positions[index].xAdvance;return`<path d="${glyph.path.toSVG()}" transform="translate(${x} 0)"/>`;}).join("");
    const scale=group.size/font.unitsPerEm;
    return`<g fill="${group.color}" transform="translate(${group.x} ${group.y}) scale(${scale} ${-scale})">${paths}</g>`;
  }).join("");
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941" viewBox="0 0 1672 941">${layers}</svg>`;
  const svgFile=path.join(out,`${spec.id}.svg`),pngFile=path.join(out,`${spec.id}.png`);
  fs.writeFileSync(svgFile,svg);
  const bytes=await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(pngFile,bytes);
  result.push({id:spec.id,exactGroups:spec.groups.map(({text})=>text),png:path.relative(root,pngFile),sha256:sha(bytes),status:"ACCURACY_CONTROL_ONLY_NOT_A_GENERATED_DESIGN"});
}
fs.writeFileSync(path.join(out,"manifest.json"),`${JSON.stringify({contract:"A1TypographyMaturityAccuracyControls/v1",fontSha256:sha(fs.readFileSync(fontFile)),records:result},null,2)}\n`);
console.log(JSON.stringify({status:"CONTROL_ONLY",records:result.map(({id,exactGroups,sha256})=>({id,exactGroups,sha256}))},null,2));
