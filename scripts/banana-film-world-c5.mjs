import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
const cfg=boardConfig(process.env); const proj=path.join(cfg.dataDir,'projects','banana-design'); const dir=path.join(cfg.dataDir,'style-lab','banana-film');
fs.rmSync(path.join(dir,'c5world'),{recursive:true,force:true}); fs.mkdirSync(path.join(dir,'c5world'),{recursive:true});
const css=await fontCss(cfg,'banana-design');
const A={col:pathToFileURL(path.join(dir,'tint-colombia.png')).href,plant:pathToFileURL(path.join(proj,'materials/b11-plantation-candidate-20261030/plantation-wordless.png')).href};
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;background:#f2c230}canvas{display:block}</style></head><body><canvas id="c" width="1920" height="1080"></canvas><script>'
+'const W=1920,H=1080,c=document.getElementById("c"),x=c.getContext("2d");const F={d:"GBDisplay",l:"GBLatin"};const C={ink:"#0b0c0e",cream:"#f2efe8",yellow:"#f2c230",orange:"#b5532a",pale:"rgba(11,12,14,.62)"};'
+'const NAMES='+JSON.stringify(A)+';const I={};for(const k in NAMES){I[k]=new Image();I[k].src=NAMES[k]}'
+'function ease(t){return 1-Math.pow(1-Math.max(0,Math.min(1,t)),3)}function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function text(s,x0,y0,size,font,col,align="left",ls=0){x.save();x.font=size+"px "+font;x.fillStyle=col;x.textBaseline="alphabetic";x.textAlign=align;if(ls){let cx=x0;for(const ch of s){x.fillText(ch,cx,y0);cx+=x.measureText(ch).width+ls}}else x.fillText(s,x0,y0);x.restore()}'
+'function camAt(t){const k=clamp(t/18,0,1);return 1400*ease(k)}'
+'function obj(img,wx,wy,w,h,rot){const cam=camAt(t);const sx=W/2+(wx-cam);x.save();x.translate(sx,wy+Math.sin(t*.25)*5);x.rotate(rot);x.shadowColor="rgba(11,12,14,.35)";x.shadowBlur=38;x.shadowOffsetY=18;x.fillStyle="#f4f0e6";x.fillRect(-w/2-16,-h/2-16,w+32,h+32);x.shadowColor="transparent";x.drawImage(img,-w/2,-h/2,w,h);x.strokeStyle="rgba(11,12,14,.25)";x.lineWidth=2;x.strokeRect(-w/2,-h/2,w,h);x.restore()}'
+'let t=0;function scene(tt){t=tt;x.fillStyle=C.yellow;x.fillRect(0,0,W,H);const cam=camAt(t);x.strokeStyle="rgba(11,12,14,.10)";for(let i=0;i<14;i++){const yy=80+i*70+Math.sin(t*.2)*20;x.beginPath();x.moveTo(0,yy);x.lineTo(W,yy);x.stroke()}x.strokeStyle="rgba(11,12,14,.16)";x.beginPath();x.moveTo(0,930);x.lineTo(W,930);x.stroke();obj(I.col,0,690,680,420,-.02);obj(I.plant,1400,500,900,560,.01);'
+'const a18=clamp((t-.2)/.5,0,1)*(1-clamp((t-9.4)/.5,0,1));if(a18>0){x.save();x.globalAlpha=a18;text("隔離與育種",140,220,128,F.d,C.ink);text("隔離",1000,420,40,F.d,C.ink);text("封住染病的田",1006,460,28,F.d,C.ink);text("育種",1000,560,40,F.d,C.ink);text("培育能抵抗 TR4 的新品種",1006,600,28,F.d,C.ink);x.strokeStyle=C.orange;x.lineWidth=4;x.setLineDash([12,8]);x.strokeRect(650,520,260,150*ease(t/2));x.setLineDash([]);text("病田",370,320,22,F.d,C.ink);x.restore()}'
+'const a19=clamp((t-10.2)/.5,0,1)*(1-clamp((t-17.4)/.5,0,1));if(a19>0){x.save();x.globalAlpha=a19;text("再換一次",140,300,128,F.d,C.ink);text("又是一場浩大的工程",146,600,34,F.d,C.ink);x.restore()}'
+'x.fillStyle=C.ink;x.fillRect(140,1040,200*(t/18),3)}'
+'window.draw=scene;'
+'</script></body></html>';
const f=path.join(dir,'c5world.html'); fs.writeFileSync(f,html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto(pathToFileURL(f).href,{waitUntil:'load'}); await p.evaluate(async()=>{await document.fonts.load('128px GBDisplay');await document.fonts.load('44px GBDisplay');await document.fonts.ready;await new Promise(r=>setTimeout(r,400))});
for(let i=0;i<18*30;i++){await p.evaluate(t=>window.draw(t),i/30);await p.screenshot({path:path.join(dir,'c5world','f'+String(i).padStart(5,'0')+'.jpg'),type:'jpeg',quality:92})}await b.close();console.log('c5world done');
