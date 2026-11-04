import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const root=process.cwd();
test('WORKING-MODE is loaded as a working protocol and routes exist',()=>{
 const doc=fs.readFileSync(path.join(root,'work/recipe-board-v1/WORKING-MODE.md'),'utf8');
 for(const s of ['先研究','buildPlan','lookLock','3-frame','lookMatch','occlusion','电钻','Claude','技术通过不等于设计通过']) assert.equal(doc.includes(s),true,'missing '+s);
 const routes=JSON.parse(fs.readFileSync(path.join(root,'work/recipe-board-v1/routing/project-routes.json'),'utf8'));
 assert.equal(routes.contract,'A1ProjectRoutes/v1');
 const subject=routes.routes.find(r=>r.id==='subject-demo');
 assert.ok(subject.subjectIds.includes('drill'));
 assert.ok(fs.existsSync(path.join(root,'work/recipe-board-v1/routing/occlusion-rules.json')));
});
