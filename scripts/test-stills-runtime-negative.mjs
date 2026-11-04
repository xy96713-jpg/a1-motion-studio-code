import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { stepStills } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
const cfg=boardConfig(); assert(cfg.repoRoot.startsWith('/Users/a1/.hermes/cache/scratch/'));
const file=path.join(cfg.dataDir,'projects/banana-design/tasks/stills.answer.json');
const original=fs.readFileSync(file,'utf8'), answer=JSON.parse(original);
// Each real consumer gets one harmful mutation: clipped hero type, missing glyph, false citation.
answer.code=answer.code.replace("x:960,y:110", "x:50,y:110").replace("text:'吸芽繁殖'", "text:'吸芽繁殖\\u{10FFFF}'").replace('APS · Ploetz · 2005','APS · Ploetz · 2006');
try {
 fs.writeFileSync(file,JSON.stringify(answer));
 const result=await stepStills(cfg,'banana-design',{log:()=>{}});
 fs.writeFileSync(path.join(cfg.repoRoot,'stills-negative-result.json'),JSON.stringify(result,null,2));
 assert.equal(result.state,'rejected');
 assert(result.errors.some(e=>/B02/.test(e)&&/edge|margin|grid|cut/.test(e)), JSON.stringify(result.errors));
 assert(result.errors.some(e=>/B04/.test(e)&&/glyph/.test(e)), JSON.stringify(result.errors));
 assert(result.errors.some(e=>/2006/.test(e)), JSON.stringify(result.errors));
 console.log('three real negative stills rejected: crop, missing glyph, false source year');
} finally {fs.writeFileSync(file,original);}
