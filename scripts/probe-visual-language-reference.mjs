#!/usr/bin/env node
// Re-render the existing approved study pages without writing into samples/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {openPage} from '../work/recipe-board-v1/style-lab/engine/shoot.mjs';
const base=path.resolve('work/recipe-board-v1/style-lab/samples/visual-language-comparison-20261030');
const out=path.resolve('work/recipe-board-v1/projects/visual-language-capability-fixture/out/reference-regression');
fs.mkdirSync(out,{recursive:true});
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'scene.mjs'))).digest('hex');
const before=hash(), files=[];
for(const [i,name] of ['A-dither','B-sections','C-editorial'].entries()){
 const s=await openPage({pageDir:base,query:`experiment=${i+1}`,variant:'clean'});
 try {
   await s.page.evaluate(()=>window.renderAt(1));const file=path.join(out,name+'.png');
   const current=await s.page.locator('#out').screenshot({path:file});files.push(file);
   // Isolate this change from unrelated engine edits since the archived reference was rendered.
   await s.page.route('**/templates/kit5.js',async route=>{
     const response=await route.fetch();
     const body=(await response.text()).replace("import { visualLanguage as sharedVisualLanguage } from './visual-language.js';\n",'').replace('export const visualLanguage = sharedVisualLanguage;\n','').replace('export const display = { visualLanguage,','export const display = {');
     await route.fulfill({response,body});
   });
   await s.page.reload();await s.page.waitForFunction(()=>window.__ready===true);await s.page.evaluate(()=>window.renderAt(1));
   const baseline=await s.page.locator('#out').screenshot({path:path.join(out,name+'-without-new-export.png')});
   if(!current.equals(baseline)) throw new Error(`${name}: new export changed reference pixels`);
 } finally {await s.close();}
}
if(before!==hash()) throw new Error('reference source changed');
fs.writeFileSync(path.join(out,'sources.json'),JSON.stringify({before,after:hash(),files,isolatedNewExportPixelIdentical:true},null,2));
console.log(JSON.stringify({unchangedSource:true,files}));
