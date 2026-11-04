import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const repo=process.cwd(), root=fs.mkdtempSync(path.join(process.env.TMPDIR,'rb-scope-seq-'));
try {
 const bin=path.join(root,'bin'); fs.mkdirSync(bin); const log=path.join(root,'ff.log');
 fs.writeFileSync(path.join(bin,'ffmpeg'),`#!/bin/sh\nprintf 'called\\n' >> "$FF_LOG"\nexit 42\n`,{mode:0o755});
 const data=path.join(root,'work/recipe-board-v1/projects');
 for(const id of ['stills','legacy']) {
  const d=path.join(data,id); fs.mkdirSync(path.join(d,'sequences'),{recursive:true}); fs.mkdirSync(path.join(d,'shots'));
  fs.writeFileSync(path.join(d,'project.json'),JSON.stringify({id,clipIndex:'clips.csv',sourceVideo:'old.mp4',...(id==='stills'?{scope:'STILLS_ONLY'}:{})}));
  fs.writeFileSync(path.join(d,'sequences/test.json'),JSON.stringify({range:[0,1],presenter:'source',items:[{presenter:true,from:0,to:1}]}));
  fs.mkdirSync(path.join(d,'out/motion'),{recursive:true}); fs.writeFileSync(path.join(d,'out/motion/old.mp4'),'old bytes');
 }
 fs.writeFileSync(path.join(root,'clips.csv'),'id,start\nA,00:00:00\n');
 const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,FF_LOG:log,RECIPE_BOARD_REPO_ROOT:root,RECIPE_BOARD_SOURCE_ROOT:root,RECIPE_BOARD_NAS_OUTPUT_ROOT:''};
 const cli=id=>spawnSync(process.execPath,[path.join(repo,'scripts/recipe-board.mjs'),'sequence','--project',id,'--seq','test'],{encoding:'utf8',env});
 const blocked=cli('stills'); assert.notEqual(blocked.status,0); assert.match(blocked.stderr,/SCOPE_RESTRICTED.*STILLS_ONLY/);
 assert.equal(fs.existsSync(log),false); assert.equal(fs.existsSync(path.join(data,'stills/out/sequences')),false);
 assert.equal(fs.readFileSync(path.join(data,'stills/out/motion/old.mp4'),'utf8'),'old bytes');
 const legacy=cli('legacy'); assert.notEqual(legacy.status,0); assert.equal(fs.readFileSync(log,'utf8'),'called\n');
 assert.ok(fs.existsSync(path.join(data,'legacy/out/sequences/test')));
 assert.equal(fs.readFileSync(path.join(data,'legacy/out/motion/old.mp4'),'utf8'),'old bytes');
 console.log('sequence CLI: stills blocked before output/provider; legacy reaches fake ffmpeg; old assets preserved');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
