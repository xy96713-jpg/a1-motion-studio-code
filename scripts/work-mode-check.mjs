#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const ROOT=process.cwd(); const doc=fs.readFileSync(path.join(ROOT,'work/recipe-board-v1/WORKING-MODE.md'),'utf8');
const need=['先研究','buildPlan','lookLock','3-frame','lookMatch','occlusion','电钻','Claude','技术通过不等于设计通过'];
const errors=need.filter(x=>!doc.includes(x)).map(x=>'WORKING-MODE missing: '+x);
const routes=JSON.parse(fs.readFileSync(path.join(ROOT,'work/recipe-board-v1/routing/project-routes.json'),'utf8'));
if(routes.contract!=='A1ProjectRoutes/v1') errors.push('project-routes contract');
if(!routes.routes.some(r=>r.id==='subject-demo'&&r.subjectIds?.includes('drill'))) errors.push('subject-demo drill route missing');
if(errors.length){for(const e of errors)console.error('WORKING MODE FAIL: '+e);process.exit(1);} console.log('WORKING MODE OK: '+doc.length+' bytes; '+routes.routes.length+' routes');
