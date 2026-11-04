import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {compileProductionLayoutV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {editableTypographyNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-editable-typography-adapter-v1.mjs';
import {staticTextVisibleBoundsV1,validateStaticTextCutoutsV1} from '../apps/studio-next/src/lib/a1-static-text-reveal-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'static-reveal-'))),hash=x=>createHash('sha256').update(x).digest('hex');
try{
 const fontPath=path.resolve('apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf'),font={id:'font',path:fontPath,sha256:hash(fs.readFileSync(fontPath)),postscriptName:'SourceHanSansCN-Heavy',weight:900};
 const examples=[{genre:'program',text:'if (source != null) Repaint();'},{genre:'quotation',text:'真实来源与显示范围分开'},{genre:'table',text:'训练步数 10000'}];let previews=[];
 for(const [i,e] of examples.entries()){
  const cut={x:.1,y:.08,width:.8,height:.012};
  const shot={id:'fixture',exactCopy:[e.text],sourceVersionSha256:'a'.repeat(64),sourceDocument:{sha256:'a'.repeat(64)},copyEvidence:['Fixture literal copy'],tasks:[],productionLayout:{contract:'A1ProductionLayout/v1',mode:'STATIC',canvas:{width:960,height:540},layers:[{id:'text',kind:'TEXT',copyIndex:0,fontId:font.id,fontSize:30,minFontSize:30,fill:'#eeeeee',box:{x:.1,y:.04,width:.8,height:.2},z:1,displayCutouts:[cut]}]}};
  const result=compileProductionLayoutV1({shot,resources:{fonts:[font],assets:[]}});assert.equal(result.compiled,true,result.blockers.join(','));
  const params=result.shot.tasks.find(t=>t.module==='editable-typography').parameters;assert.equal(params.copyOccurrences.sourceCopy[0],e.text);assert.deepEqual(params.runs[0].displayCutouts,[cut]);
  const render=async(p,name)=>{const input={module:'editable-typography',need:true,moduleVersion:1,implementationSha256:editableTypographyNodeAdapterV1.implementationSha256,parameters:p};const n={id:'fixture:editable-typography',module:'editable-typography',shotId:'fixture',inputSha256:nodeInputHash({input,dependencies:[]}),dependencies:[],input};const dir=path.join(root,name);fs.mkdirSync(dir);const r=await editableTypographyNodeAdapterV1.execute(n,{artifactRoot:dir,dependencies:{}});assert.equal(r.state,'needs-review',r.reason);const img=r.artifactManifest.artifacts.find(a=>a.kind==='IMAGE');const plan=r.artifactManifest.artifacts.find(a=>a.role==='typography-layout');return {image:path.join(dir,img.path),plan:JSON.parse(fs.readFileSync(path.join(dir,plan.path)))};};
  const masked=await render(params,'masked-'+i),p=structuredClone(params);for(const r of p.runs)delete r.displayCutouts;const uncut=await render(p,'uncut-'+i);
  assert.equal(masked.plan.parameters.exactCopy,uncut.plan.parameters.exactCopy);assert.deepEqual(masked.plan.glyphManifests,uncut.plan.glyphManifests,'the source glyph identity stays unchanged');
  const m=await sharp(masked.image).ensureAlpha().raw().toBuffer(),u=await sharp(uncut.image).ensureAlpha().raw().toBuffer();assert.notDeepEqual(m,u);let cutInk=0;
  for(let y=44;y<49;y++)for(let x=100;x<860;x++){const k=(y*960+x)*4+3;cutInk+=u[k];assert.equal(m[k],0,'the declared cut is actually transparent');}assert.ok(cutInk>0);assert.equal(masked.plan.displayRunVisibility[0].visibility,'PARTIAL');
  const b=masked.plan.glyphManifests[0].run.canvasInkBounds;assert.equal(staticTextVisibleBoundsV1(b,params.canvas,undefined,[{x:0,y:0,width:1,height:1}]),'HIDDEN');assert.equal(staticTextVisibleBoundsV1(b,params.canvas,undefined), 'FULL');
  previews.push({genre:e.genre,masked:masked.image,uncut:uncut.image});
 }
 for(const bad of [[],[{x:0,y:0,width:2,height:1}],[{x:0,y:0,width:1,height:1,keyframes:[]}],Array(33).fill({x:0,y:0,width:.1,height:.1})])assert.throws(()=>validateStaticTextCutoutsV1(bad),/CUTOUTS_INVALID/);
 assert.equal(staticTextVisibleBoundsV1({minX:0,minY:0,maxX:100,maxY:100},{width:100,height:100},undefined,[{x:0,y:0,width:.6,height:1},{x:.4,y:0,width:.6,height:1}]),'HIDDEN');
 if(process.argv.includes('--proof-dir')){const d=process.argv[process.argv.indexOf('--proof-dir')+1];fs.mkdirSync(d,{recursive:true});for(const p of previews){fs.copyFileSync(p.masked,path.join(d,p.genre+'-masked.png'));fs.copyFileSync(p.uncut,path.join(d,p.genre+'-uncut.png'));}fs.writeFileSync(path.join(d,'result.json'),JSON.stringify({status:'PASS',genres:previews.map(p=>p.genre),scope:'PURE_CAPABILITY_FIXTURE_NOT_PRODUCTION_VISUAL_APPROVAL',sourceCopyPreserved:true,providerCalls:0},null,2)+'\n');}
 console.log('PASS three genres: actual compiler -> editable native SVG/PNG cuts, unchanged source glyphs, FULL/PARTIAL/HIDDEN and overlapping union coverage, invalid/dynamic/over-budget cuts refused.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
