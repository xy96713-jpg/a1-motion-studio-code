import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
const cfg=boardConfig(process.env); const proj=path.join(cfg.dataDir,'projects','banana-design');
const dir=path.join(cfg.dataDir,'style-lab','banana-film'); fs.rmSync(path.join(dir,'c2'),{recursive:true,force:true}); fs.mkdirSync(path.join(dir,'c2'),{recursive:true});
const css=await fontCss(cfg,'banana-design');
const img04=pathToFileURL(path.join(proj,'materials/opening-stills-20261029/B04/art-wordless.png')).href;
const img05=pathToFileURL(path.join(proj,'materials/opening-stills-20261029/B05/art-wordless.png')).href;
const js=String.raw`
const W=1920,H=1080,c=document.getElementById('c'),x=c.getContext('2d');c.width=W;c.height=H;
const F={d:'GBDisplay',l:'GBLatin',s:'GBSmall'};const C={ink:'#0b0c0e',cream:'#f2efe8',yellow:'#f2c230',orange:'#b5532a',pale:'rgba(242,239,232,.62)'};
const IMG4=new Image(),IMG5=new Image(); IMG4.src='__IMG4__'; IMG5.src='__IMG5__';
function ease(t){return 1-Math.pow(1-Math.max(0,Math.min(1,t)),3)}; function clamp(v,a,b){return Math.max(a,Math.min(b,v))};
function text(s,x0,y0,size,font,col,align='left',ls=0){x.save();x.font=size+'px '+font;x.fillStyle=col;x.textBaseline='alphabetic';x.textAlign=align;if(ls){let cx=x0;for(const ch of s){x.fillText(ch,cx,y0);cx+=x.measureText(ch).width+ls}}else x.fillText(s,x0,y0);x.restore()}
function cover(im,scale,dx=0,dy=0){const s=Math.max(W/im.width,H/im.height)*scale;const w=im.width*s,h=im.height*s;x.drawImage(im,(W-w)/2+dx,(H-h)/2+dy,w,h)}
function hud(t,ch,note,dark){x.save();x.font='20px '+F.l;x.fillStyle=dark?'rgba(11,12,14,.62)':C.pale;x.textAlign='left';x.fillText('BANANA / CLONE FIELD',58,60);x.textAlign='right';x.fillText(note,W-58,60);x.textAlign='left';x.fillText('C2 · 吸芽 / 弱点',58,1020);x.textAlign='right';const sec=Math.floor(t);x.fillText('00:00:'+String(sec).padStart(2,'0')+':00',W-58,1020);const x0=140,y=1050,seg=320,gap=10;for(let i=0;i<5;i++){x.fillStyle=i===ch?C.yellow:(dark?'rgba(11,12,14,.2)':'rgba(242,239,232,.2)');x.fillRect(x0+i*(seg+gap),y,seg,3)}x.restore()}
function label(t,t0,txt,px,py,ax,ay){const k=ease((t-t0)/0.35);if(k<=0)return;x.save();x.globalAlpha=k;x.strokeStyle='rgba(181,83,42,.8)';x.lineWidth=2;x.beginPath();x.moveTo(ax,ay);x.lineTo(px-(px>ax?18:-18),py);x.stroke();x.fillStyle=C.orange;x.beginPath();x.arc(ax,ay,5,0,Math.PI*2);x.fill();x.font='28px '+F.s;x.fillStyle=C.ink;x.textAlign=px>ax?'left':'right';x.fillText(txt,px,py);x.restore()}
function b04(t){x.fillStyle=C.cream;x.fillRect(0,0,W,H);const zoom=1+(t>9.8?ease((t-9.8)/1.2)*1.8:ease(t/11)*0.12);cover(IMG4,zoom);x.save();x.globalAlpha=clamp(t/0.3,0,1);text('吸芽繁殖',140,250,128,F.d,C.ink);text('沒有種子・一棵分一棵',146,320,34,F.d,'rgba(11,12,14,.72)');x.restore();label(t,1.2,'地表',60,610,700,610);label(t,2.2,'球莖',60,680,900,660);label(t,3.2,'吸芽',60,750,1000,560);label(t,4.4,'次株',1540,300,1380,360);x.save();x.globalAlpha=clamp((t-5.2)/0.5,0,1);text('一片種植園，基因幾乎完全一樣',146,940,34,F.d,C.ink);x.restore();if(t>9.8){x.fillStyle='rgba(11,12,14,'+ease((t-9.8)/1.2)*0.85+')';x.fillRect(0,0,W,H)}}
function b05(t){x.fillStyle=C.ink;x.fillRect(0,0,W,H);const lt=t-11;const zoom=1.05+ease(lt/5)*0.1;cover(IMG5,zoom);const g=x.createLinearGradient(0,0,1150,0);g.addColorStop(0,'rgba(11,12,14,.90)');g.addColorStop(.55,'rgba(11,12,14,.62)');g.addColorStop(1,'rgba(11,12,14,0)');x.fillStyle=g;x.fillRect(0,0,1200,H);const gb=x.createLinearGradient(0,760,0,1080);gb.addColorStop(0,'rgba(11,12,14,0)');gb.addColorStop(1,'rgba(11,12,14,.82)');x.fillStyle=gb;x.fillRect(0,740,W,340);x.save();x.globalAlpha=clamp(lt/0.4,0,1);text('一樣的弱點',140,300,260,F.d,C.cream);x.restore();x.save();x.globalAlpha=clamp((lt-.3)/0.4,0,1);text('基因一樣，能殺死一棵的病，就能殺死所有',146,860,34,F.d,C.cream);x.restore();}
function b06(t){const lt=t-16;x.fillStyle=C.ink;x.fillRect(0,0,W,H);x.strokeStyle='rgba(242,194,48,.16)';x.lineWidth=2;const grow=clamp(lt/1.6,0,1);x.beginPath();x.moveTo(140,610);x.lineTo(140+(1780-140)*grow,610);x.stroke();x.fillStyle=C.yellow;x.fillRect(140+(1780-140)*grow-3,604,6,12);text('1900s',140,660,24,F.l,C.pale);text('1960s',1780,660,24,F.l,C.pale,'right');x.save();x.globalAlpha=1;text('發生過一次',140,420,300,F.d,C.cream);x.restore();x.save();x.globalAlpha=clamp((lt-.8)/0.6,0,1);text('香蕉歷史上，這件事已經發生過一次',146,720,34,F.d,C.cream);x.restore();for(let i=0;i<90;i++){const yy=(i*137+lt*90)%H;x.fillStyle='rgba(242,239,232,'+(0.04+0.08*((i*37)%10)/10)+')';x.fillRect((i*173+lt*20)%W,yy,2,2)}x.fillStyle='rgba(242,194,48,.10)';x.fillRect(0,(lt*110)%H,W,2);}
function draw(t){x.clearRect(0,0,W,H);if(t<11)b04(t);else if(t<16)b05(t);else b06(t)}
window.draw=t;`;
const js2=js.replace('__IMG4__',img04).replace('__IMG5__',img05);
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;background:#0b0c0e}canvas{display:block}</style></head><body><canvas id="c"></canvas><script>'+js2+'</script></body></html>';
const f=path.join(dir,'c2.html'); fs.writeFileSync(f,html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto(pathToFileURL(f).href,{waitUntil:'load'});
await p.evaluate(async()=>{await Promise.all([document.fonts.load('300px GBDisplay'),document.fonts.load('128px GBDisplay'),document.fonts.load('34px GBSmall'),document.fonts.load('60px GBLatin')]);await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
await p.evaluate(()=>Promise.all([new Promise(r=>{if(IMG4.complete&&IMG4.naturalWidth)r();else IMG4.onload=r}),new Promise(r=>{if(IMG5.complete&&IMG5.naturalWidth)r();else IMG5.onload=r})]));
for(let i=0;i<600;i++){await p.evaluate(t=>window.draw(t),i/30);await p.screenshot({path:path.join(dir,'c2','f'+String(i).padStart(4,'0')+'.png')})}
await b.close(); console.log('c2 frames done');
