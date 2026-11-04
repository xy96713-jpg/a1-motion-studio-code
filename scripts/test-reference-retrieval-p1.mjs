import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chapterGuidance } from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';
const repo=path.resolve(import.meta.dirname,'..'), cfg={repoRoot:repo,sourceRoot:repo,dataDir:path.join(repo,'work/recipe-board-v1')};
const nearest=(beat,options={})=>chapterGuidance(cfg,'banana-design',[{beat:'X',devices:[],...beat}],options).beats.find(x=>x.beat==='X')?.nearest||[];
test('bounded retrieval, self exclusion and provenance',()=>{
 const rows=nearest({kind:'evidence'},{k:1,project:'paperclip-138-full'});
 assert.ok(rows.length); assert.ok(rows.length<=1); assert.ok(rows.every(x=>!x.key.startsWith('banana-design/')));
 assert.ok(rows.every(x=>x.pathBase==='repo-root' && x.usage?.includes('rights')));
});
test('negative evidence and token boundaries do not summon evidence',()=>{
 for(const text of ['no reliable evidence','没有任何证据','map2','证据不足']) assert.deepEqual(nearest({text}),[],text);
});
test('independent positive concepts survive negative evidence',()=>{
 for(const text of ['证据不足但有地图','没有证据但有报道']) assert.ok(nearest({text}).length,text);
});
test('custom route does not fall back to words',()=>assert.deepEqual(nearest({text:'证据',kind:null,routeResolved:true}),[]));
