import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runProject } from '../apps/studio-next/src/lib/recipe-board/run.mjs';
import { needPrint, fetchApproved } from '../apps/studio-next/src/lib/recipe-board/materials.mjs';
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'run-materials-stale-'));
const cfg={dataDir:path.join(root,'data'),sourceRoot:root,repoRoot:root}, id='fixture', project=path.join(cfg.dataDir,'projects',id), dir=path.join(project,'materials');
const put=(f,x)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof x==='string'?x:JSON.stringify(x));};
const read=f=>JSON.parse(fs.readFileSync(f));
const logs=[];
globalThis.fetch=async()=>{throw Error('network forbidden');};
try {
 for (const name of ['recipes','routing','themes','worlds']) fs.cpSync(path.resolve('work/recipe-board-v1',name),path.join(cfg.dataDir,name),{recursive:true});
 put(path.join(root,'apps/studio-next/src/lib/a1-article-source-discovery-v1.mjs'),`export const compileArticleSourceDiscoveryRequest = q => ({...q,status:'READY_FOR_DISCOVERY'}); export const discoverArticleSourceCandidates = async q => ({providerRuns:[],candidates:[{id:q.id,title:'Offline source report',publisher:'Fixture',url:'https://example.invalid/'+q.id,excerptMatch:{score:0.9}}]});`);
 put(path.join(project,'project.json'),{id});
 const old={shotId:'B01',kind:'page',original:'old'}, stale={...old,original:'new'}, scene={shotId:'B01',scene:1,kind:'page',original:'scene'}, valid={shotId:'B02',kind:'page',original:'valid'};
 const historical={need:old,candidates:[{id:'old',title:'old'}],note:'retain'};
 const approval={batches:[{id:'batch',confirmedBy:'user',items:[{shotId:'B01',status:'approved',candidateId:'old',needPrint:needPrint(old)}]}]};
 const media=path.join(dir,'old-media.bin'); put(media,'historic media');
 const binding={shots:{B01:{file:media,needPrint:needPrint(old)}}};
 put(path.join(dir,'needs.json'),{needs:[stale,scene,valid]}); put(path.join(dir,'candidates.json'),{shots:{B01:historical}}); put(path.join(dir,'approvals.json'),approval); put(path.join(dir,'bindings.json'),binding);
 const before=fs.readFileSync(media);
 // All pending searches stale: preserve the entire materials tree, including file set.
 put(path.join(dir,'needs.json'),{needs:[stale]});
 const snapshot=()=>Object.fromEntries(fs.readdirSync(dir).sort().map(n=>[n,fs.readFileSync(path.join(dir,n)).toString('base64')]));
 const allBefore=snapshot(), blockedLogs=[];
 const blocked=await runProject(cfg,id,{from:'materials',to:'materials',log:s=>blockedLogs.push(s)});
 assert.deepEqual(snapshot(),allBefore,'all-stale run must not write any materials file');
 assert.deepEqual(blocked.blockedMaterials,['B01']);
 assert.ok(blockedLogs.some(s=>/reconcil/i.test(s)));
 put(path.join(dir,'needs.json'),{needs:[stale,scene,valid]});
 await runProject(cfg,id,{from:'materials',to:'materials',log:s=>logs.push(s)});
 const c=read(path.join(dir,'candidates.json')).shots;
 assert.deepEqual(c.B01,historical); assert.ok(c.B02?.candidates.length,logs.join('\n')); assert.ok(c['B01~1']?.candidates.length);
 assert.deepEqual(read(path.join(dir,'approvals.json')),approval); assert.deepEqual(read(path.join(dir,'bindings.json')),binding); assert.deepEqual(fs.readFileSync(media),before);
 assert.ok(logs.some(x=>x.includes('B01') && /blocked/i.test(x)),logs.join('\n'));
 await fetchApproved(cfg,id);
 assert.deepEqual(read(path.join(dir,'approvals.json')),approval); assert.deepEqual(read(path.join(dir,'bindings.json')),binding);
 // Empty needs must not be misclassified as blocked.
 put(path.join(dir,'needs.json'),{needs:[]});
 const emptyLogs=[]; const empty=await runProject(cfg,id,{from:'materials',to:'materials',log:s=>emptyLogs.push(s)});
 assert.notEqual(empty.status,'blocked');
 // No-conflict legacy-shaped ledgers follow the same real run path.
 put(path.join(dir,'needs.json'),{needs:[valid]}); put(path.join(dir,'candidates.json'),{shots:{}}); put(path.join(dir,'approvals.json'),{batches:[]}); put(path.join(dir,'bindings.json'),{shots:{}});
 const cleanLogs=[]; await runProject(cfg,id,{from:'materials',to:'materials',log:s=>cleanLogs.push(s)});
 assert.ok(read(path.join(dir,'candidates.json')).shots.B02.candidates.length); assert.ok(!cleanLogs.some(s=>/blocked: changed material need/.test(s)));
 // Materials search is explicitly before the design gate; it must not approve that gate.
 const gatedProject={id,process:'six-stage',gateSet:'design'};
 put(path.join(project,'project.json'),gatedProject); put(path.join(dir,'candidates.json'),{shots:{}});
 const gatedLogs=[]; await runProject(cfg,id,{from:'materials',to:'materials',log:s=>gatedLogs.push(s)});
 assert.ok(read(path.join(dir,'candidates.json')).shots.B02.candidates.length); assert.deepEqual(read(path.join(project,'project.json')),gatedProject); assert.deepEqual(read(path.join(dir,'approvals.json')),{batches:[]});
 console.log('run materials isolates stale full key; valid scene and B02 searched offline; stale fetch preserved');
} finally {fs.rmSync(root,{recursive:true,force:true});}
