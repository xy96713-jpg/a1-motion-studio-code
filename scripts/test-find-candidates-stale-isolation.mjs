import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findCandidates, changedNeeds } from '../apps/studio-next/src/lib/recipe-board/materials.mjs';

const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'find-stale-'));
const id = 'fixture', cfg = { dataDir: root, sourceRoot: root, repoRoot: root };
const project = path.join(root, 'projects', id), dir = path.join(project, 'materials');
fs.mkdirSync(dir, {recursive:true});
const put = (name, x) => fs.writeFileSync(path.join(dir,name), JSON.stringify(x));
try {
 fs.writeFileSync(path.join(project,'project.json'), JSON.stringify({id}));
 const old = {shotId:'B01',scene:1,kind:'presenter',original:'old'};
 const stale = {...old,original:'new'}, safe = {...old,scene:2,original:'safe'};
 const historic = {need:old,candidates:[{id:'historical'}], note:'must remain'};
 put('needs.json',{needs:[stale,safe]}); put('candidates.json',{shots:{'B01~1':historic}});
 assert.deepEqual(changedNeeds(cfg,id),['B01~1']);
 const logs=[]; await findCandidates(cfg,id,{only:['B01'],log:x=>logs.push(x)});
 const result=JSON.parse(fs.readFileSync(path.join(dir,'candidates.json'))).shots;
 assert.deepEqual(result['B01~1'],historic,'stale candidate must not be replaced');
 assert.equal(result['B01~2'].need.original,'safe','other scene proceeds');
 assert.ok(logs.some(x=>x.includes('B01~1') && /blocked/i.test(x)));
 console.log('findCandidates isolates stale full scene key');
} finally {fs.rmSync(root,{recursive:true,force:true});}
