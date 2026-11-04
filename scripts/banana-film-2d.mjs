import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
const cfg=boardConfig(process.env); const dir=path.join(cfg.dataDir,'style-lab','banana-film');
fs.rmSync(path.join(dir,'overlay'),{recursive:true,force:true}); fs.mkdirSync(path.join(dir,'overlay'),{recursive:true});
const css=await fontCss(cfg,'banana-design');
const js=String.raw`
const W=1920,H=1080; const c=document.getElementById('c'); const x=c.getContext('2d'); c.width=W; c.height=H;
const F={d:'GBDisplay',l:'GBLatin',s:'GBSmall'}; const C={ink:'#0b0c0e',cream:'#f2efe8',yellow:'#f2c230',orange:'#b5532a',pale:'rgba(242,239,232,.62)'};
function ease(t){return 1-Math.pow(1-Math.max(0,Math.min(1,t)),3)}; function clamp(v,a,b){return Math.max(a,Math.min(b,v))};
function text(s,x0,y0,size,font,col,align='left',ls=0){x.save();x.font=size+'px '+font;x.fillStyle=col;x.textBaseline='alphabetic';x.textAlign=align;if(ls){let cx=x0;for(const ch of s){x.fillText(ch,cx,y0);cx+=x.measureText(ch).width+ls}}else x.fillText(s,x0,y0);x.restore()}
function drop(s,x0,y0,size,font,col,t0,t,stag=0.05,dist=80){x.save();x.font=size+'px '+font;x.fillStyle=col;x.textBaseline='alphabetic';let cx=x0;[...s].forEach((ch,i)=>{const k=ease((t-t0-i*stag)/0.5);x.globalAlpha=clamp(k,0,1);x.fillText(ch,cx,y0-dist*(1-clamp(k,0,1)));cx+=x.measureText(ch).width+4});x.restore()}
function hud(t,chapter,note){x.save();x.font='20px '+F.l;x.fillStyle=C.pale;x.textAlign='left';x.fillText('BANANA / CLONE FIELD',58,60);x.textAlign='right';x.fillText(note,W-58,60);x.textAlign='left';x.fillText('CLONES '+String(Math.min(48,Math.floor(t/0.045))).padStart(2,'0'),58,1020);x.textAlign='right';const sec=Math.floor(t);x.fillText('00:00:'+String(sec).padStart(2,'0')+':00',W-58,1020);const x0=140,y=1050,seg=320,gap=10;for(let i=0;i<5;i++){x.fillStyle=i===chapter?C.yellow:(chapter===1?'rgba(242,239,232,.2)':'rgba(242,239,232,.2)');x.fillRect(x0+i*(seg+gap),y,seg,3)}x.restore()}
function b01(t){drop('同一棵香蕉',140,360,260,F.d,C.cream,0.05,t,0.05,70);x.save();x.font='260px '+F.d;const w=x.measureText('同一棵香蕉').width;x.fillStyle=C.orange;x.globalAlpha=ease((t-1.0)/0.3);x.beginPath();x.arc(140+w+26,360-34,12,0,Math.PI*2);x.fill();x.restore();text('ONE TREE / 48 CLONES',146,440,22,F.l,C.pale,'left',3)}
function b02(t){const detail=t>=10;text('卡文迪什',1120,260,128,F.d,C.cream);text('CAVENDISH',1126,318,24,F.l,C.yellow,'left',4);if(!detail)text('同樣的彎度・同樣的黃',1126,378,36,F.d,C.cream)}
function drawOverlay(t){x.clearRect(0,0,W,H);if(t<5)b01(t);else b02(t)}
function drawData(t){const lt=Math.max(0,t-16);x.fillStyle=C.ink;x.fillRect(0,0,W,H);x.strokeStyle='rgba(242,194,48,.10)';x.lineWidth=1;for(let i=0;i<10;i++){x.beginPath();x.moveTo(140+i*118,120-lt*1.5);x.lineTo(140+i*118,900-lt*1.5);x.stroke()}const k=ease(lt/0.9);x.save();x.translate(W/2,H/2);x.scale(1+lt*0.004,1+lt*0.004);x.translate(-W/2,-H/2);const val=Math.round(47*k);x.save();x.font='300px '+F.l;x.fillStyle=C.cream;x.fillText(String(val).padStart(2,'0'),140,640);const nw=x.measureText(String(val).padStart(2,'0')).width;x.font='110px '+F.l;x.fillStyle=C.yellow;x.fillText('%',154+nw,640);x.restore();x.save();x.strokeStyle='rgba(242,194,48,.16)';x.lineWidth=18;x.beginPath();x.arc(1400,500,230,0,Math.PI*2);x.stroke();x.strokeStyle=C.yellow;x.beginPath();x.arc(1400,500,230,-Math.PI/2+lt*0.06,-Math.PI/2+Math.PI*2*(val/100)+lt*0.06);x.stroke();x.strokeStyle='rgba(242,194,48,.28)';x.lineWidth=2;x.beginPath();x.arc(1400,500,266,0,Math.PI*2);x.stroke();x.fillStyle=C.yellow;x.beginPath();x.arc(1400+Math.cos(lt*0.6)*266,500+Math.sin(lt*0.6)*266,5,0,Math.PI*2);x.fill();x.restore();x.save();x.globalAlpha=clamp((lt-1.1)/0.4,0,1);text('卡文迪什 · 全球香蕉產量佔比',140,760,34,F.d,C.cream);text('來源：FAO 估計 · FoodNavigator 2019-08-09',140,818,24,F.l,C.pale,'left',0.5);x.restore();x.restore()}
window.drawOverlay=drawOverlay; window.drawData=drawData;`;
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent;overflow:hidden}canvas{display:block}</style></head><body><canvas id="c"></canvas><script>'+js+'</script></body></html>';
const f=path.join(dir,'overlay.html'); fs.writeFileSync(f,html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto(pathToFileURL(f).href,{waitUntil:'load'});
await p.evaluate(async()=>{await Promise.all([document.fonts.load('360px GBDisplay'),document.fonts.load('300px GBDisplay'),document.fonts.load('24px GBLatin'),document.fonts.load('128px GBSmall')]);await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))) });
for(let i=0;i<480;i++){await p.evaluate(t=>window.drawOverlay(t),i/30);await p.screenshot({path:path.join(dir,'overlay','o'+String(i).padStart(4,'0')+'.png'),omitBackground:true})}
for(let i=0;i<180;i++){await p.evaluate(t=>window.drawData(t),16+i/30);await p.screenshot({path:path.join(dir,'overlay','d'+String(i).padStart(4,'0')+'.png')})}
await b.close(); console.log('overlay frames done');
