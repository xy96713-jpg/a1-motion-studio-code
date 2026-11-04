import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
const cfg=boardConfig(process.env); const proj=path.join(cfg.dataDir,'projects','banana-design'); const dir=path.join(cfg.dataDir,'style-lab','banana-film');
fs.rmSync(path.join(dir,'c3world'),{recursive:true,force:true}); fs.mkdirSync(path.join(dir,'c3world'),{recursive:true});
const css=await fontCss(cfg,'banana-design');
const A={
 arch:pathToFileURL(path.join(proj,'materials/sources/aps-2005/figure-02-crop.png')).href,
 disease:pathToFileURL(path.join(proj,'materials/opening-stills-20261029/B05/art-wordless.png')).href,
 map:pathToFileURL(path.join(cfg.dataDir,'style-lab','banana-film','tint-honduras.png')).href,
 aps:pathToFileURL(path.join(proj,'materials/sources/aps-2005/losses-crop.png')).href,
 plant:pathToFileURL(path.join(proj,'materials/b11-plantation-candidate-20261030/plantation-wordless.png')).href
};
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;background:#0b0c0e}canvas{display:block}</style></head><body><canvas id="c" width="1920" height="1080"></canvas><script>'
+'const W=1920,H=1080,c=document.getElementById("c"),x=c.getContext("2d");const F={d:"GBDisplay",l:"GBLatin"};const C={ink:"#0b0c0e",cream:"#f2efe8",yellow:"#f2c230",orange:"#b5532a",pale:"rgba(242,239,232,.62)"};'
+'const NAMES='+JSON.stringify(A)+';const I={};for(const k in NAMES){I[k]=new Image();I[k].src=NAMES[k]}'
+'function ease(t){return 1-Math.pow(1-Math.max(0,Math.min(1,t)),3)}function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function text(s,x0,y0,size,font,col,align="left",ls=0){x.save();x.font=size+"px "+font;x.fillStyle=col;x.textBaseline="alphabetic";x.textAlign=align;if(ls){let cx=x0;for(const ch of s){x.fillText(ch,cx,y0);cx+=x.measureText(ch).width+ls}}else x.fillText(s,x0,y0);x.restore()}'
+'const keys=[[0,-450],[4.5,0],[9,0],[13,1400],[17,1400],[21.5,2800],[26,2800],[28.5,4200],[31,4200],[37.5,5600],[48,5600]];function camAt(t){for(let i=0;i<keys.length-1;i++){const a=keys[i],b=keys[i+1];if(t<=b[0]){const k=(t-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*ease(clamp(k,0,1))}}return keys[keys.length-1][1]}'
+'function obj(img,wx,wy,w,h,rot){x.save();const cam=camAt(window.t);const sx=W/2+(wx-cam);const sy=wy+Math.sin(window.t*0.25)*6;const sc=1+Math.max(0,1200-Math.abs(wx-cam))/1200*0.06;x.translate(sx,sy);x.rotate(rot);x.scale(sc,sc);x.shadowColor="rgba(0,0,0,.6)";x.shadowBlur=40;x.shadowOffsetY=20;x.fillStyle="#f4f0e6";x.fillRect(-w/2-18,-h/2-18,w+36,h+36);x.shadowColor="transparent";x.drawImage(img,-w/2,-h/2,w,h);x.strokeStyle="rgba(11,12,14,.35)";x.lineWidth=2;x.strokeRect(-w/2,-h/2,w,h);x.restore()}'
+'function scene(t){window.t=t;const cam=camAt(t);const drift=cam+t*14;x.fillStyle=C.ink;x.fillRect(0,0,W,H);x.save();x.translate(W/2,H/2);x.scale(1+0.012*Math.sin(t*.18),1+0.012*Math.sin(t*.18));x.translate(-W/2,-H/2);x.strokeStyle="rgba(242,194,48,.07)";x.lineWidth=1;for(let i=0;i<18;i++){const xx=(i*180-drift*0.22)%W;x.beginPath();x.moveTo(xx,0);x.lineTo(xx,H);x.stroke()}for(let i=0;i<8;i++){const yy=140+i*120+Math.sin(t*.15)*20;x.beginPath();x.moveTo(0,yy);x.lineTo(W,yy);x.stroke()}x.strokeStyle="rgba(242,239,232,.10)";x.beginPath();x.moveTo(0,930);x.lineTo(W,930);x.stroke();x.fillStyle="rgba(181,83,42,.12)";x.beginPath();x.arc(1400-drift*0.08,240,300,0,Math.PI*2);x.fill();x.restore();'
+'obj(I.arch,0,470,560,510,-0.025);text("1921 · 大麥克裝船",300,850,26,F.l,C.pale);'
+'obj(I.disease,1400,480,720,530,0.02);'
+'obj(I.map,2800,500,820,470,-0.02);'
+'obj(I.aps,4200,500,780,490,0.015);'
+'obj(I.plant,5600,520,900,600,-0.015);'
+'const a07=clamp((t-0.2)/0.6,0,1)*(1-clamp((t-8.4)/0.6,0,1));if(a07>0){x.save();x.globalAlpha=a07;text("大麥克",140,230,128,F.d,C.cream);x.restore()}'
+'const a08=clamp((t-8.6)/0.6,0,1)*(1-clamp((t-16.4)/0.6,0,1));if(a08>0){x.save();x.globalAlpha=a08;text("巴拿馬病",140,230,128,F.d,C.cream);for(let i=0;i<26;i++){const a=i*0.7;const r=90+((i*67)%10)*22+ease(clamp((t-9-i*0.08)/2,0,1))*120;x.fillStyle="rgba(181,83,42,.5)";x.beginPath();x.arc(1380+Math.cos(a)*r,520+Math.sin(a)*r,5,0,Math.PI*2);x.fill()}x.restore()}'
+'const a09=clamp((t-16.6)/0.6,0,1)*(1-clamp((t-25.4)/0.6,0,1));if(a09>0){x.save();x.globalAlpha=a09;text("3 萬",140,400,240,F.l,C.yellow);text("公頃",146,500,48,F.d,C.cream);text("1940–1960 · 烏盧阿河谷",146,600,30,F.d,C.cream);x.restore()}'
+'const a10=clamp((t-25.6)/0.6,0,1)*(1-clamp((t-30.4)/0.6,0,1));if(a10>0){x.save();x.globalAlpha=a10;text("4 億",140,400,220,F.l,C.cream);text("美元",146,500,48,F.d,C.yellow);text("APS 2005 · $400,000,000",146,600,24,F.l,C.pale);x.restore()}'
+'const a11=clamp((t-30.6)/0.6,0,1)*(1-clamp((t-47.4)/0.6,0,1));if(a11>0){x.save();x.globalAlpha=a11;text("換品種",140,230,128,F.d,C.cream);text("大麥克 → 卡文迪什",146,700,34,F.d,C.cream);x.restore()}'
+'x.fillStyle=C.cream;x.fillRect(140,1040,220*clamp(t/48,0,1),3)}'
+'window.draw=scene;'
+'</script></body></html>';
const f=path.join(dir,'c3world.html'); fs.writeFileSync(f,html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto(pathToFileURL(f).href,{waitUntil:'load'}); await p.evaluate(async()=>{await document.fonts.load('240px GBLatin');await document.fonts.load('128px GBDisplay');await document.fonts.ready;await new Promise(r=>setTimeout(r,500))});
for(let i=0;i<48*30;i++){await p.evaluate(t=>window.draw(t),i/30);await p.screenshot({path:path.join(dir,'c3world','f'+String(i).padStart(5,'0')+'.jpg'),type:'jpeg',quality:92})}await b.close();console.log('c3world done');
