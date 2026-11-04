import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sameSubject, findCandidates } from '../apps/studio-next/src/lib/recipe-board/materials.mjs';
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'legacy-reuse-'));
try {
 const cfg={dataDir:root,repoRoot:root,sourceRoot:root}, id='p', dir=path.join(root,'projects',id,'materials'); fs.mkdirSync(dir,{recursive:true});
 const file=path.join(root,'photo.png'); assert.equal(spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=red:s=64x64','-frames:v','1',file]).status,0);
 const donor={shotId:'B01',kind:'archival',entity:'Person',original:'portrait'}, target={...donor,shotId:'B02'};
 const binding={file,kind:'image',batch:'b1',url:'https://example.test/p'};
 const shots={B01:{need:donor,candidates:[{id:'c1',url:binding.url}]}};
 const approvals={batches:[{id:'b1',items:[{shotId:'B01',candidateId:'c1',url:binding.url,status:'fetched'}]}]};
 const evidence={shots,approvals};
 assert.equal(sameSubject(target,[donor,target],{B01:binding},evidence)?.provenance,'unknown');
 assert.equal(sameSubject({...target,form:'photo'},[donor,{...target,form:'photo'}],{B01:binding},evidence),null);
 assert.equal(sameSubject(target,[donor,target],{B01:binding}),null);
 assert.equal(sameSubject(target,[donor,target],{B01:{...binding,url:'https://other.test'}},evidence),null);
 assert.equal(sameSubject(target,[donor,target],{B01:binding},{shots,approvals:{batches:[]}}),null);
 assert.equal(sameSubject(target,[donor,donor,target],{B01:binding},evidence),null);
 for(const [f,v] of Object.entries({'needs.json':{needs:[donor,target]},'bindings.json':{shots:{B01:binding}},'candidates.json':{shots},'approvals.json':approvals})) fs.writeFileSync(path.join(dir,f),JSON.stringify(v));
 fs.writeFileSync(path.join(root,'projects',id,'project.json'),JSON.stringify({id}));
 await findCandidates(cfg,id,{only:['B02']});
 const row=JSON.parse(fs.readFileSync(path.join(dir,'candidates.json'))).shots.B02;
 assert.equal(row.reuse,'B01'); assert.equal(row.provenance,'unknown'); assert.equal(row.searchedAt,undefined);
 console.log('legacy evidence reuse and negative controls passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}
