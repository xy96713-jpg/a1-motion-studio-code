import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
const cfg=boardConfig(process.env); const dir=path.join(cfg.dataDir,'style-lab','banana-film'); const css=await fontCss(cfg,'banana-design');
fs.rmSync(path.join(dir,'b20thesis'),{recursive:true,force:true}); fs.mkdirSync(path.join(dir,'b20thesis'),{recursive:true});
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent}canvas{display:block}</style></head><body><canvas id="c" width="1920" height="1080"></canvas><script>'
+'const W=1920,H=1080,c=document.getElementById("c"),x=c.getContext("2d");const F="GBDisplay";function ease(t){return 1-Math.pow(1-Math.max(0,Math.min(1,t)),3)}'
+'function draw(t){x.clearRect(0,0,W,H);let a=ease((t-1.1)/0.7);if(t>4.55)a=Math.max(0,1-(t-4.55)/0.4);x.save();x.globalAlpha=a;x.font="34px "+F;x.fillStyle="#0b0c0e";x.fillText("一根香蕉長成什麼樣，",146,500);x.fillText("其實是一段關於單一的歷史。",146,552);x.restore()}window.draw=draw;'
+'</script></body></html>';
const f=path.join(dir,'b20thesis.html'); fs.writeFileSync(f,html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto(pathToFileURL(f).href,{waitUntil:'load'}); await p.evaluate(async()=>{await document.fonts.load('34px GBDisplay');await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
for(let i=0;i<150;i++){await p.evaluate(t=>window.draw(t),i/30);await p.screenshot({path:path.join(dir,'b20thesis','o'+String(i).padStart(4,'0')+'.png'),omitBackground:true})}await b.close();console.log('b20 thesis done');
