import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
const cfg=boardConfig(process.env); const dir=path.join(cfg.dataDir,'style-lab','paperclip-test'); const css=await fontCss(cfg,'banana-design');
fs.rmSync(path.join(dir,'overlay'),{recursive:true,force:true}); fs.mkdirSync(path.join(dir,'overlay'),{recursive:true});
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent}canvas{display:block}</style></head><body><canvas id="c" width="1920" height="1080"></canvas><script src="overlay.js"></script></body></html>';
const f=path.join(dir,'overlay.html'); fs.writeFileSync(f,html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto(pathToFileURL(f).href,{waitUntil:'load'}); await p.evaluate(async()=>{await document.fonts.load('220px GBDisplay');await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
for(let i=0;i<300;i++){await p.evaluate(t=>window.draw(t),i/30);await p.screenshot({path:path.join(dir,'overlay','o'+String(i).padStart(4,'0')+'.png'),omitBackground:true})}
await b.close(); console.log('overlay done');
