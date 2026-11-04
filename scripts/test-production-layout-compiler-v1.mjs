import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
import {compileProductionLayoutV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
const fontPath=path.resolve('apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf'),font={id:'heading',path:fontPath,sha256:createHash('sha256').update(fs.readFileSync(fontPath)).digest('hex'),postscriptName:'SourceHanSansCN-Heavy',weight:900};
const resources={fonts:[font],assets:[]};
const shot={id:'S1',sourceText:'An original test article',visualJob:'Explain one point',exactCopy:['这是没有预先写执行脚本的新内容'],tasks:[{module:'media-files',dependencies:[],blocker:'UNCOMPILED',parameters:{}}],productionLayout:{contract:'A1ProductionLayout/v1',mode:'STATIC',canvas:{width:960,height:540},layers:[{id:'title',kind:'TEXT',copyIndex:0,fontId:'heading',fontSize:72,minFontSize:24,fill:'#111111',box:{x:.1,y:.2,width:.8,height:.6},z:10}]}};
shot.sourceDocument={path:'/repo/work/source.txt',sha256:'a'.repeat(64)};shot.sourceVersionSha256='a'.repeat(64);shot.copyEvidence=['An original test article'];
const plan={contract:'A1ShotTaskPlan/v1',projectId:'unseen-layout',scope:'RESEARCH_ONLY',productionAdmission:false,productionResources:resources,shots:[shot]};
const baseline=compileShotTaskWorkspaceV1(plan).production.shotIntelligence.currentStoryboardAuthority.shots[0];
assert.equal(baseline.nodeWorkflow.modules['editable-typography'],undefined,'baseline semantic layout cannot produce execution requests');
const result=compileProductionLayoutV1({shot,resources});assert.ok(result.compiled,JSON.stringify(result.blockers));
assert.deepEqual(result.modules,['editable-typography','layer-compositor']);const p=result.shot.tasks[0].parameters;assert.equal(p.runs.map(r=>r.text).join(''),shot.exactCopy.join(''));assert.ok(p.runs.length>1,'auto wrap from measured glyphs');assert.deepEqual(result.shot.tasks[1].dependencies,['editable-typography']);assert.equal(shot.tasks.length,1,'input unchanged');
for(const mutate of [s=>s.productionLayout.layers[0].copyIndex=9,s=>s.productionLayout.layers[0].box.width=-1,s=>s.productionLayout.layers[0].fontId='missing',s=>s.tasks[0].parameters.files=['existing']]){const s=structuredClone(shot);mutate(s);assert.equal(compileProductionLayoutV1({shot:s,resources}).compiled,false);}
const asset=structuredClone(shot);asset.productionLayout.layers.unshift({id:'evidence',kind:'ASSET',assetId:'not-there',role:'EVIDENCE',fit:'contain',box:{x:0,y:0,width:1,height:1},z:0});assert.match(compileProductionLayoutV1({shot:asset,resources}).blockers[0],/ASSET_UNRESOLVED/);
console.log('PASS baseline missing compiler, deterministic native requests, measured wrapping, exact copy, missing-source isolation and no implicit input overwrite');
const {productionLayoutInputsCurrentV1}=await import('../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs');
assert.equal(productionLayoutInputsCurrentV1(result.shot,resources),true);
const changedCopy=structuredClone(result.shot);changedCopy.exactCopy[0]+='变更';assert.equal(productionLayoutInputsCurrentV1(changedCopy,resources),false);
const unrelated={...resources,assets:[{assetId:'unused'}]};assert.equal(productionLayoutInputsCurrentV1(result.shot,unrelated),true,'unrelated resource does not invalidate a compiled shot');
const {verifyProductionLayoutSourcesV1}=await import('../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs');
const temporary=fs.mkdtempSync(path.resolve('work/production-source-test-'));
try {
  const file=path.join(temporary,'article.txt'),body='An original test article with a supported observation.';
  fs.writeFileSync(file,body);
  const checked=structuredClone(shot);checked.sourceDocument={path:file,sha256:createHash('sha256').update(body).digest('hex')};checked.sourceVersionSha256=checked.sourceDocument.sha256;
  const sourcePlan={...plan,shots:[checked]};
  assert.equal(verifyProductionLayoutSourcesV1({repoRoot:process.cwd(),plan:sourcePlan}).length,1);
  checked.copyEvidence=['A quote that is not in the article'];
  assert.deepEqual(verifyProductionLayoutSourcesV1({repoRoot:process.cwd(),plan:sourcePlan}),[]);
  checked.copyEvidence=['An original test article'];fs.appendFileSync(file,' changed');
  assert.deepEqual(verifyProductionLayoutSourcesV1({repoRoot:process.cwd(),plan:sourcePlan}),[],'changed source bytes revoke host proof');
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
console.log('PASS article source SHA and exact support-quote negative cases');
// Exact-copy shadows must never be painted into a mixed visible-type actor.
const mixed=structuredClone(shot);mixed.exactCopy=['editable shadow','visible title'];mixed.copyEvidence=['An original test article','An original test article'];
mixed.productionLayout.layers=[{...mixed.productionLayout.layers[0],id:'shadow',copyIndex:0,shadowOnly:true},{...mixed.productionLayout.layers[0],id:'visible',copyIndex:1}];
const mixedResult=compileProductionLayoutV1({shot:mixed,resources});assert.equal(mixedResult.compiled,true,JSON.stringify(mixedResult.blockers));
const mixedType=mixedResult.shot.tasks.find(t=>t.module==='editable-typography');assert.ok(mixedType.parameters.runs.some(r=>r.plane==='behind-artwork'));assert.ok(mixedType.parameters.runs.some(r=>r.plane==='front-artwork'));
const mixedComposite=mixedResult.shot.tasks.find(t=>t.module==='layer-compositor');assert.equal(mixedComposite.parameters.compositionIntent.layers[0].artifactRole,'typography-plane-front-artwork-overlay');
console.log('PASS mixed visible type and editable shadow use existing separate planes; shadow is excluded from the composite.');
