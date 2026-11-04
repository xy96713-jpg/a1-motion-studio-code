import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
const cfg=boardConfig(process.env); const proj=path.join(cfg.dataDir,'projects','banana-design'); const dir=path.join(cfg.dataDir,'style-lab','banana-film');
fs.rmSync(path.join(dir,'c4world'),{recursive:true,force:true}); fs.mkdirSync(path.join(dir,'c4world'),{recursive:true});
const css=await fontCss(cfg,'banana-design');
const A={
 b12:pathToFileURL(path.join(dir,'b12-3d.png')).href,
 sea:pathToFileURL(path.join(dir,'tint-southeast-asia.png')).href,
 dip:pathToFileURL(path.join(proj,'materials/look-dev/B14-diptych.png')).href,
 col:pathToFileURL(path.join(dir,'tint-colombia.png')).href,
 food:pathToFileURL(path.join(dir,'food-crop.png')).href
};
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;background:#0b0c0e}canvas{display:block}</style></head><body><canvas id="c" width="1920" height="1080"></canvas><script>'
+'const W=1920,H=1080,c=document.getElementById("c"),x=c.getContext("2d");const F={d:"GBDisplay",l:"GBLatin"};const C={ink:"#0b0c0e",cream:"#f2efe8",yellow:"#f2c230",orange:"#b5532a",pale:"rgba(242,239,232,.64)"};'
+'const NAMES='+JSON.stringify(A)+';const I={};for(const k in NAMES){I[k]=new Image();I[k].src=NAMES[k]}'
+'function ease(t){return 1-Math.pow(1-Math.max(0,Math.min(1,t)),3)}function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function text(s,x0,y0,size,font,col,align="left",ls=0){x.save();x.font=size+"px "+font;x.fillStyle=col;x.textBaseline="alphabetic";x.textAlign=align;if(ls){let cx=x0;for(const ch of s){x.fillText(ch,cx,y0);cx+=x.measureText(ch).width+ls}}else x.fillText(s,x0,y0);x.restore()}'
+'const keys=[[0,-300],[1.5,0],[3,0],[6,700],[9,1400],[15,1400],[17.5,2800],[22.5,2800],[26,4200],[32,4200],[35,5600],[38,5600],[40.5,7000],[42,7000]];function camAt(t){for(let i=0;i<keys.length-1;i++){const a=keys[i],b=keys[i+1];if(t<=b[0]){const k=(t-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*ease(clamp(k,0,1))}}return keys[keys.length-1][1]}'
+'function obj(img,wx,wy,w,h,rot){const cam=camAt(t);const sx=W/2+(wx-cam);x.save();x.translate(sx,wy+Math.sin(t*0.22)*5);x.rotate(rot);x.shadowColor="rgba(0,0,0,.65)";x.shadowBlur=38;x.shadowOffsetY=18;x.fillStyle="#f4f0e6";x.fillRect(-w/2-16,-h/2-16,w+32,h+32);x.shadowColor="transparent";x.drawImage(img,-w/2,-h/2,w,h);x.strokeStyle="rgba(11,12,14,.35)";x.lineWidth=2;x.strokeRect(-w/2,-h/2,w,h);x.restore();return sx}'
+'let t=0;function scene(tt){t=tt;const cam=camAt(t);const drift=cam+t*14;x.fillStyle=C.ink;x.fillRect(0,0,W,H);x.save();x.translate(W/2,H/2);x.scale(1+0.014*Math.sin(t*.2),1+0.014*Math.sin(t*.2));x.translate(-W/2,-H/2);x.strokeStyle="rgba(242,194,48,.06)";for(let i=0;i<18;i++){const xx=(i*170-drift*.24)%W;x.beginPath();x.moveTo(xx,0);x.lineTo(xx,H);x.stroke()}for(let i=0;i<7;i++){const yy=150+i*130+Math.sin(t*.16)*24;x.beginPath();x.moveTo(0,yy);x.lineTo(W,yy);x.stroke()}x.fillStyle="rgba(181,83,42,.12)";x.beginPath();x.arc(700-drift*.07,220,260,0,Math.PI*2);x.fill();x.restore();'
+'obj(I.b12,0,500,640,430,-0.02);'
+'const sxSea=obj(I.sea,1400,510,760,460,0.02);'
+'obj(I.dip,2800,520,820,520,0.015);'
+'obj(I.col,4000,520,520,440,-0.02);const sxFood=obj(I.food,4560,500,620,290,0.01);'
+''
+'const a12=clamp((t-.2)/.5,0,1)*(1-clamp((t-2.4)/.5,0,1));if(a12>0){x.save();x.globalAlpha=a12;text("同樣是克隆",140,230,128,F.d,C.cream);x.restore()}'
+'const a13=clamp((t-3.2)/.5,0,1)*(1-clamp((t-14.4)/.5,0,1));if(a13>0){x.save();x.globalAlpha=a13;text("TR4",140,320,240,F.l,C.orange);text("熱帶 4 號小種",146,420,48,F.d,C.cream);text("1990 年代 · 蘇門答臘 / 馬來西亞",146,760,32,F.d,C.cream);for(const p of [[1200,430],[1370,470],[1530,500]]){x.fillStyle=C.ink;x.beginPath();x.arc(p[0],p[1],18,0,Math.PI*2);x.fill();x.fillStyle="rgba(181,83,42,"+(.6+.4*Math.sin(t*3))+")";x.beginPath();x.arc(p[0],p[1],8,0,Math.PI*2);x.fill()}text("蘇門答臘",980,390,24,F.d,C.cream);text("馬來西亞",1320,360,24,F.d,C.cream);x.restore()}'
+'const a14=clamp((t-15.2)/.5,0,1)*(1-clamp((t-19.4)/.5,0,1));if(a14>0){x.save();x.globalAlpha=a14;text("不堪一擊",140,300,128,F.d,C.cream);x.restore()}'
+'const a15=clamp((t-20.2)/.5,0,1)*(1-clamp((t-31.4)/.5,0,1));if(a15>0){x.save();x.globalAlpha=a15;text("拉瓜希拉",140,330,128,F.d,C.cream);text("2019-08-08",146,430,48,F.l,C.yellow);text("哥倫比亞農業研究所確認 TR4 首次在拉丁美洲出現",146,760,30,F.d,C.cream);x.strokeStyle=C.yellow;x.lineWidth=5;x.beginPath();x.moveTo(sxFood-300,330);x.lineTo(sxFood-300+560*clamp((t-21.5)/1.5,0,1),330);x.stroke();x.restore()}'
+'const a16=clamp((t-32.2)/.5,0,1)*(1-clamp((t-37.4)/.5,0,1));if(a16>0){x.save();x.globalAlpha=a16;text("175",140,420,200,F.l,C.cream);text("公頃",146,510,44,F.d,C.cream);text("168.5",880,420,200,F.l,C.orange);text("公頃",886,510,44,F.d,C.orange);text("全數 / 已毀 96%",146,620,30,F.d,C.pale);x.fillStyle="rgba(242,239,232,.2)";x.fillRect(140,760,1500*clamp(t/2,0,1),22);x.fillStyle=C.orange;x.fillRect(140,810,1500*(.963)*clamp(t/2,0,1),22);x.restore()}'
+'const a17=clamp((t-38.2)/.5,0,1)*(1-clamp((t-41.6)/.5,0,1));if(a17>0){x.save();x.globalAlpha=a17;x.fillStyle=C.orange;x.fillRect(110,260,1300,560);text("國家緊急狀態",150,560,240,F.d,C.ink);text("2019-08-08",156,700,44,F.l,C.ink);x.restore()}'
+'x.fillStyle=C.cream;x.fillRect(140,1040,200*(t/42),3)}'
+'window.draw=scene;'
+'</script></body></html>';
const f=path.join(dir,'c4world.html'); fs.writeFileSync(f,html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto(pathToFileURL(f).href,{waitUntil:'load'}); await p.evaluate(async()=>{await document.fonts.load('240px GBLatin');await document.fonts.load('128px GBDisplay');await document.fonts.ready;await new Promise(r=>setTimeout(r,500))});
for(let i=0;i<42*30;i++){await p.evaluate(t=>window.draw(t),i/30);await p.screenshot({path:path.join(dir,'c4world','f'+String(i).padStart(5,'0')+'.jpg'),type:'jpeg',quality:92})}await b.close();console.log('c4world done');
