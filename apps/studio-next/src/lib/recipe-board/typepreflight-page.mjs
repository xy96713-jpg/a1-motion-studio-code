// Reusable measured-page preflight: runs established mount/morph layout without publishing an image.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {typeBibleErrors} from './typebible.mjs';
import {fontEvidence,sha256,assertCurrent} from './typepreflight.mjs';
export async function measureTypePage({root,pageDir,shots,B,house,files,plans,said={}}){
 const bindings=Object.fromEntries(files.map(p=>[p,sha256(p)]));
 const server=createServer((req,res)=>{const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://x').pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const mime={'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.html':'text/html','.ttf':'font/ttf','.otf':'font/otf'};res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'}).end(fs.readFileSync(p));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;const results=[];
 try{
  browser=await chromium.launch({args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
  for(const shot of shots){
   const page=await browser.newPage({viewport:{width:B.frame.w,height:B.frame.h}}),errors=[];
   page.on('pageerror',e=>{errors.push(e.message);console.error('type preflight page:',e.message);});
   await page.goto(`http://127.0.0.1:${server.address().port}/${path.relative(root,pageDir)}/index.html?shot=${shot}&fps=30&static=1&typeProbe=1`);
   await page.waitForFunction(()=>window.__ready===true||window.__typeFailure,null,{timeout:60000});
   const drawn=await page.evaluate(async()=>{if(window.__typeFailure)throw Error(window.__typeFailure);if(window.__prep)await window.__prep(1);window.renderAt(1);return window.__morphText();});
   if(errors.length)throw Error(errors.join('\n'));
   if(!drawn?.length)throw Error('unknown: no measured typography '+shot);
   const expected=plans[shot].flatMap(b=>b.lines.map(l=>l.text));
   const actual=[...new Set(drawn.map(d=>d.whole||d.text))];
   if(expected.length!==actual.length||expected.some(t=>!actual.includes(t)))throw Error('unplanned/missing drawn copy '+shot+': '+actual.join('|'));
   const fonts=drawn.map(d=>{
    const family=d.face,font=house.fonts.find(f=>f.family===family);
    if(!font)throw Error('unknown rendered font '+d.face);
    return fontEvidence({file:path.join(root,font.url),family:family.replace(/ Tall$/,''),text:d.text});
   });
   const issues=typeBibleErrors(drawn,B,shot,said[shot]||'');
   results.push({shot,drawn,fonts,issues});
   await page.close();
  }
  const receipt={status:results.some(r=>r.issues.length)?'fail':'pass',bindings,results,visualInspection:'unknown',contrast:'unknown',occlusion:'unknown',motion:'not-tested',scope:'static candidate: actual morph ink + typeBibleErrors at t=1; not chapter acceptance'};
  if(receipt.status==='pass')assertCurrent(receipt,files);
  return receipt;
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
}
