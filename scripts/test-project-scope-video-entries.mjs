import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {boardConfig} from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import {buildSegment,renderEngineCuts,renderSegment} from '../apps/studio-next/src/lib/recipe-board/segment.mjs';
import {renderMedium,renderStream} from '../apps/studio-next/src/lib/recipe-board/medium.mjs';
import {renderModule,besideReference} from '../apps/studio-next/src/lib/recipe-board/modules.mjs';
import {renderPassage,stepPassages} from '../apps/studio-next/src/lib/recipe-board/shotplan.mjs';
import {animatic} from '../apps/studio-next/src/lib/recipe-board/layers.mjs';
import {buildFilm} from '../apps/studio-next/src/lib/recipe-board/film.mjs';
import {applyFinish} from '../apps/studio-next/src/lib/recipe-board/finish.mjs';
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'rb-scope-entry-'));
try {
 for(const id of ['stills','legacy']) { const d=path.join(root,'work/recipe-board-v1/projects',id); fs.mkdirSync(d,{recursive:true}); fs.writeFileSync(path.join(d,'project.json'),JSON.stringify({id,...(id==='stills'?{scope:'STILLS_ONLY'}:{})})); }
 const cfg=boardConfig({RECIPE_BOARD_REPO_ROOT:root,RECIPE_BOARD_SOURCE_ROOT:root,RECIPE_BOARD_NAS_OUTPUT_ROOT:''});
 const calls=[id=>buildSegment(cfg,id,'absent'),id=>renderEngineCuts(cfg,id,'absent'),id=>renderSegment(cfg,id,'absent'),id=>renderMedium(cfg,id,[]),id=>renderStream(cfg,id,{shotId:'x'},{kind:'tube'}),id=>renderModule(cfg,id,{},path.join(root,'out')),id=>besideReference(cfg,id,{},'missing',path.join(root,'x')),id=>renderPassage(cfg,id,'absent'),id=>stepPassages(cfg,id,{render:true,child:true}),id=>animatic(cfg,id,'absent')];
 for(const [i,call] of calls.entries()) { await assert.rejects(async()=>call('stills'),/SCOPE_RESTRICTED.*STILLS_ONLY/,`entry ${i}`); }
 for (const call of [()=>buildFilm(cfg,'stills'),()=>applyFinish(cfg,'stills',path.join(root,'old.mp4'))]) assert.throws(call,/SCOPE_RESTRICTED.*STILLS_ONLY/);
 // These malformed fixtures exercise admission only, not a provider.
 for(const i of [0,1,2,5,7]) await assert.rejects(async()=>calls[i]('legacy'), e => !/SCOPE_RESTRICTED/.test(String(e)) && ! (e instanceof assert.AssertionError));
 assert.deepEqual(await renderMedium(cfg,'legacy',[]),[]); assert.equal(renderStream(cfg,'legacy',{shotId:'x'},{kind:'tube'}),null);
 // An empty label library prevents generation; the real static entry must reach
 // the controlled Playwright stub, not merely fail after passing the scope gate.
 fs.mkdirSync(path.join(cfg.dataDir,'routing'),{recursive:true});
 fs.writeFileSync(path.join(cfg.dataDir,'routing/props.json'),'{"families":[]}');
 fs.mkdirSync(path.join(cfg.dataDir,'modules'),{recursive:true});
 fs.writeFileSync(path.join(cfg.dataDir,'modules/title.html'),'<html></html>');
 const kit=path.join(cfg.dataDir,'modules/kit'); fs.mkdirSync(kit);
 for (const name of ['static.png','card-red.png','torn-1.png','marker.png']) fs.writeFileSync(path.join(kit,name),'inert fixture');
 const stub=path.join(root,'node_modules/playwright'); fs.mkdirSync(stub,{recursive:true});
 const marker=path.join(root,'static-provider-called');
 fs.writeFileSync(path.join(stub,'index.mjs'),`import fs from 'node:fs'; export const chromium={launch(){fs.writeFileSync(${JSON.stringify(marker)},'called'); throw new Error('STATIC_PROVIDER_SENTINEL')}};`);
 await assert.rejects(()=>renderModule(cfg,'stills',{module:'title',at:0,end:1,text:'test',subtitles:false},path.join(root,'still'),{stills:[0],checks:false,check:false}),/STATIC_PROVIDER_SENTINEL/);
 assert.equal(fs.readFileSync(marker,'utf8'),'called');
 assert.deepEqual(await stepPassages(cfg,'stills',{render:false,child:true}),[]);
 assert.equal(fs.existsSync(path.join(root,'work/recipe-board-v1/projects/stills/out')),false);
 console.log('video entries: stills denied; legacy admitted with inert fixtures');
} finally {fs.rmSync(root,{recursive:true,force:true});}
