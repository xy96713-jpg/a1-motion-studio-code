// Optional real-browser negative probes; no image is published and project files are read-only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {dir,root} from '../work/recipe-board-v1/projects/banana-design/materials/still-repair-20261030/preflight.mjs';
const server=createServer((req,res)=>{try{const p=path.join(root,new URL(req.url,'http://x').pathname);const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json'};res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'}).end(fs.readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
try{
 const cases=[['normal',null,null],['missing measured check','**/type-preflight.json',/missing|JSON|Unexpected/],['changed code','**/scene.mjs',/stale type input/],['changed font','**/kokka-mincho.ttf',/stale type input/],['actual missing glyph','**/type-input.json',/missing glyph/]];
 for(const [name,pattern,expected] of cases){
  const page=await browser.newPage();
  if(pattern)await page.route(pattern,async route=>{
   const response=await route.fetch();
   if(name==='missing measured check')return route.fulfill({status:404,body:'missing proof'});
   if(name==='actual missing glyph'){const j=await response.json();j.missing['House Kokka Tall'].push('隔');return route.fulfill({response,json:j});}
   return route.fulfill({response,body:Buffer.concat([await response.body(),Buffer.from('\n')])});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/${path.relative(root,dir)}/index.html?shot=B18&fps=30&static=1`);
  await page.waitForFunction(()=>window.__ready===true||window.__typeFailure,null,{timeout:60000});
  const state=await page.evaluate(()=>({ready:!!window.__ready,error:window.__typeFailure||null}));
  if(expected){assert.equal(state.ready,false);assert.match(state.error,expected);}else{assert.equal(state.ready,true);assert.equal(state.error,null);}
  console.log(JSON.stringify({name,...state}));await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
