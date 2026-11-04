import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { fontCss } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
const cfg=boardConfig(process.env); const proj=path.join(cfg.dataDir,'projects','banana-design');
const dir=path.join(cfg.dataDir,'style-lab','banana-film'); fs.rmSync(path.join(dir,'animatic'),{recursive:true,force:true}); fs.mkdirSync(path.join(dir,'animatic'),{recursive:true});
const css=await fontCss(cfg,'banana-design');
const still=path.join(proj,'materials/full-stills-20261029');
const shots=[
['B01','B01-full.png',5,1.04,1.08,0,0],['B02','B02-full.png',11,1.05,1.10,0,0],['B03','B03-full.png',6,1.04,1.09,0,0],['B04','B04-full.png',11,1.04,1.09,0,0],['B05','B05-full.png',5,1.05,1.10,0,0],
['B06','B06-full.png',4,1.03,1.08,0,0],['B07','B07-full.png',9,1.05,1.12,0,0],['B08','B08-full.png',8,1.06,1.15,0,0],['B09','B09-full.png',9,1.04,1.10,0,0],['B10','B10-full.png',5,1.06,1.14,0,0],
['B11','B11-full.png',13,1.04,1.09,0,0],['B12','B12-full.png',3,1.04,1.10,0,0],['B13','B13-full.png',12,1.05,1.11,0,0],['B14','B14-full.png',5,1.04,1.10,0,0],['B15','B15-full.png',12,1.07,1.17,0,0],
['B16','B16-full.png',6,1.04,1.10,0,0],['B17','B17-full.png',4,1.06,1.12,0,0],['B18','B18-full.png',10,1.04,1.10,0,0],['B19','B19-full.png',8,1.04,1.10,0,0],['B20','B20-full.png',5,1.04,1.10,0,0]
];
const total=shots.reduce((a,s)=>a+s[2],0); console.log('total',total);
const html='<!doctype html><html><head><meta charset="utf-8"><style>'+css+'*{margin:0;box-sizing:border-box}html,body{width:960px;height:540px;overflow:hidden;background:#000}canvas{display:block}</style></head><body><canvas id="c" width="960" height="540"></canvas><script>'
+'const W=960,H=540,c=document.getElementById("c"),x=c.getContext("2d");'
+'const S='+JSON.stringify(shots)+'; const IMGS={};'
+'for(const s of S){IMGS[s[0]]=new Image();IMGS[s[0]].src="'+pathToFileURL(still).href+'/"+s[1];}'
+'function ease(t){return 0.5-0.5*Math.cos(Math.PI*Math.max(0,Math.min(1,t)))};'
+'function cover(im,scale,dx,dy){const s=Math.max(W/im.width,H/im.height)*scale;const w=im.width*s,h=im.height*s;x.drawImage(im,(W-w)/2+dx,(H-h)/2+dy,w,h)}'
+'function draw(t){let acc=0,idx=0;for(let i=0;i<S.length;i++){if(t<acc+S[i][2]){idx=i;break}acc+=S[i][2];idx=i}const s=S[idx],lt=Math.min(t-acc,s[2]),k=ease(lt/s[2]);const z=s[3]+(s[4]-s[3])*k;x.fillStyle="#000";x.fillRect(0,0,W,H);cover(IMGS[s[0]],z,0,0)}'
+'window.draw=draw;'
+'</script></body></html>';
const f=path.join(dir,'animatic.html'); fs.writeFileSync(f,html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:960,height:540}});
await p.goto(pathToFileURL(f).href,{waitUntil:'load'}); await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,400))});
for(let i=0;i<total*15;i++){await p.evaluate(t=>window.draw(t),i/15);await p.screenshot({path:path.join(dir,'animatic','f'+String(i).padStart(5,'0')+'.png')})}
await b.close(); console.log('animatic frames done');
