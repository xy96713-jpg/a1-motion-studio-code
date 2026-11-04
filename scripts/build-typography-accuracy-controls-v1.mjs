#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const out=path.join(root,"work/typography-rich-design-v1/accuracy-controls");
fs.mkdirSync(out,{recursive:true});
const sha=(bytes)=>crypto.createHash("sha256").update(bytes).digest("hex");
const specs=[
  {id:"ed01-gothic",font:"apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf",lines:["智能写作","工作台"],color:"#e93e3c",fontSize:225,scaleX:.9},
  {id:"ed01-condensed-ming",font:"apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf",lines:["智能写作","工作台"],color:"#f1eccc",fontSize:245,scaleX:.62},
  {id:"ed10-verdict",font:"apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf",lines:["完成度很高的","废稿"],color:"#f1eccc",fontSize:190,scaleX:.68},
];
const records=[];
for(const spec of specs){
  const fontFile=path.join(root,spec.font),font=fontkit.openSync(fontFile);
  const glyphLines=spec.lines.map((line)=>{
    const run=font.layout(line);
    const missing=[...line].filter((c)=>!font.hasGlyphForCodePoint(c.codePointAt(0)));
    if(missing.length)throw new Error(`font-coverage-missing:${spec.id}:${missing.join("")}`);
    let cursor=0;
    const paths=run.glyphs.map((glyph,index)=>{const position=run.positions[index],x=cursor+(position.xOffset||0);cursor+=position.xAdvance;return`<path d="${glyph.path.toSVG()}" transform="translate(${x} 0)"/>`;}).join("");
    return{paths,width:cursor*spec.fontSize/font.unitsPerEm*spec.scaleX};
  });
  const y0=spec.id==="ed10-verdict"?350:330;
  const layers=glyphLines.map((line,index)=>{
    const x=spec.id==="ed10-verdict"?(index===0?80:560):(index===0?90:160);
    const y=y0+index*(spec.fontSize+30);
    return`<g transform="translate(${x} ${y}) scale(${spec.fontSize/font.unitsPerEm*spec.scaleX} ${-spec.fontSize/font.unitsPerEm})">${line.paths}</g>`;
  }).join("");
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941" viewBox="0 0 1672 941"><g fill="${spec.color}">${layers}</g></svg>`;
  const svgFile=path.join(out,`${spec.id}.svg`),pngFile=path.join(out,`${spec.id}.png`);
  fs.writeFileSync(svgFile,svg);
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(pngFile,png);
  const meta=await sharp(png).metadata();
  records.push({id:spec.id,copy:spec.lines.join("/"),font:spec.font,fontSha256:sha(fs.readFileSync(fontFile)),svg:path.relative(root,svgFile),png:path.relative(root,pngFile),pngSha256:sha(png),size:[meta.width,meta.height],use:"EXACT_COPY_INPUT_CONTROL_NOT_FINISHED_DESIGN"});
}
fs.writeFileSync(path.join(out,"manifest.json"),`${JSON.stringify({contract:"A1TypographyAccuracyControls/v1",status:"CONTROL_ONLY",records},null,2)}\n`);
console.log(JSON.stringify({status:"CONTROL_ONLY",records:records.map(({id,copy,pngSha256})=>({id,copy,pngSha256}))},null,2));
