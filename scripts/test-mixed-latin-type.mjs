import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as kit from '../work/recipe-board-v1/style-lab/engine/templates/kit2.js';
const line='焦油・尼古丁・CO　ISO/FTC 單一數據';
const runs=t=>kit.typeRuns?kit.typeRuns(t):t.split(kit.RUN_SPLIT).filter(Boolean);
const g={__line:line,__typeRole:'sub',measureText:t=>({actualBoundingBoxAscent:t==='國'?59.648:45.312,actualBoundingBoxDescent:0})};
test('CJK sub letters share target; slash cannot inflate letter envelope',()=>{
 globalThis.window={__bible:true};try {
  for(const t of ['CO','ISO','FTC'])assert.ok(Math.abs(kit.figureScale(g,t)*45.312/59.648-1)<=.05,t);
  const r=runs(line);assert.ok(r.includes('ISO')&&r.includes('/')&&r.includes('FTC '),'measure and draw must isolate slash from letter ink');assert.equal(r.join(''),line);
 }finally{delete globalThis.window;}
});
test('Latin-only title/source, captions, decimal figures and non-bible runs retain semantics',()=>{
 globalThis.window={__bible:true};try {
  for(const role of ['title','sub','caption'])for(const text of ['WHO','ISO/FTC','World Health Organization'])assert.equal(kit.figureScale({...g,__line:text,__typeRole:role},text),1);
  assert.equal(kit.figureScale({...g,__line:'WHO · 2003',__typeRole:'caption'},'2003'),1);
  assert.ok(kit.figureScale({...g,__typeRole:'caption'},'2003')>1);
  assert.ok(kit.figureScale({...g,__line:'',__typeRole:'figure'},'400')>1);
  assert.deepEqual(runs('ISO/FTC source'),['ISO/FTC source']);assert.deepEqual(runs('31.6% 中文'),['31.6% ','中文']);
  window.__bible=false;assert.equal(kit.figureScale(g,'CO'),1);assert.equal(kit.figureScale(g,'2003'),1);assert.deepEqual(runs(line),line.split(kit.RUN_SPLIT).filter(Boolean));
 }finally{delete globalThis.window;}
});
