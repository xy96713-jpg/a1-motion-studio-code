import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {executeLayerCompositeNode,layerCompositeNodeAdapterV1,normalizeOpaqueFitBackgroundV1} from '../apps/studio-next/src/lib/a1-node-composite-adapter-v1.mjs';
import {compileProductionLayoutV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'native-core-matte-'))),hash=b=>createHash('sha256').update(b).digest('hex');
try{
  const fake=await sharp({create:{width:320,height:180,channels:4,background:'#ff0000'}}).png().toBuffer();
  const native=await sharp({create:{width:160,height:20,channels:4,background:'#000000'}}).png().toBuffer();
  const assets=[['fake',fake],['native',native]].map(([assetId,bytes])=>{const filename=path.join(root,assetId+'.png');fs.writeFileSync(filename,bytes);return {assetId,path:filename,sha256:hash(bytes),kind:'IMAGE',referenceOnly:false,materialClass:assetId==='native'?'VERIFIED_SOURCE_IMAGE':'ORIGINAL_GENERATED_ASSET',provenance:{status:'VERIFIED',sourceUrl:'https://example.org/paper'}};});
  const shot={id:'unseen',sourceVersionSha256:'a'.repeat(64),sourceDocument:{sha256:'a'.repeat(64)},exactCopy:[],copyEvidence:[],tasks:[],
    productionLayout:{contract:'A1ProductionLayout/v1',mode:'STATIC',canvas:{width:320,height:180},layers:[
      {id:'surround',kind:'ASSET',assetId:'fake',role:'BACKGROUND',box:{x:0,y:0,width:1,height:1},fit:'fill',z:0},
      {id:'source-chart',kind:'ASSET',assetId:'native',role:'EVIDENCE',box:{x:.25,y:.25,width:.5,height:.5},fit:'contain',fitBackground:'#ffffff',z:1}]}};
  const compiled=compileProductionLayoutV1({shot,resources:{assets,fonts:[]}});assert.deepEqual(compiled.blockers,[]);
  const parameters=compiled.shot.tasks.find(t=>t.module==='layer-compositor').parameters;
  assert.deepEqual(parameters.compositionIntent.layers[1].fitBackground,{r:255,g:255,b:255,alpha:1});
  assert.deepEqual(compiled.shot.packagingDecision.layers[1].fitBackground,{r:255,g:255,b:255,alpha:1});
  const files=compiled.shot.tasks.find(t=>t.module==='media-files').parameters.files;
  const dependencies={'unseen:media-files':{state:'succeeded',manifestSha256:'b'.repeat(64),artifacts:files.map(f=>({path:path.basename(f.path),absolutePath:f.path,sha256:f.sha256,bytes:fs.statSync(f.path).size,kind:'IMAGE',role:f.slot}))}};
  const run=async(p,tag)=>executeLayerCompositeNode({id:'unseen:layer-compositor',module:'layer-compositor',inputSha256:hash(tag),dependencies:['unseen:media-files'],input:{module:'layer-compositor',moduleVersion:1,implementationSha256:layerCompositeNodeAdapterV1.implementationSha256,need:true,parameters:p}}, {dependencies,artifactRoot:path.join(root,'artifacts')});
  const result=await run(parameters,'matte');assert.equal(result.state,'needs-review');
  const preview=result.artifactManifest.artifacts.find(a=>a.kind==='IMAGE'),pixels=await sharp(path.join(root,'artifacts',preview.path)).ensureAlpha().raw().toBuffer();
  const pixel=(x,y)=>[...pixels.subarray((y*320+x)*4,(y*320+x)*4+4)];
  assert.deepEqual(pixel(80,45),[255,255,255,255],'letterbox padding hides the fake lower chart');
  assert.deepEqual(pixel(160,90),[0,0,0,255],'original chart content remains visible');
  assert.deepEqual(pixel(79,45),[255,0,0,255],'pixels outside the declared source box remain unchanged');
  for(let y=45;y<135;y++)for(let x=80;x<240;x++)assert.notDeepEqual(pixel(x,y),[255,0,0,255],'no generated red pixels survive inside the evidence box');
  assert.equal(hash(fs.readFileSync(assets[1].path)),hash(native),'native input bytes remain unchanged');
  const planArtifact=result.artifactManifest.artifacts.find(a=>a.role==='layer-composition-plan'),saved=JSON.parse(fs.readFileSync(path.join(root,'artifacts',planArtifact.path)));
  assert.deepEqual(saved.composition.layers[1].fitBackground,{r:255,g:255,b:255,alpha:1});
  const legacy=structuredClone(parameters);delete legacy.compositionIntent.layers[1].fitBackground;
  const old=await run(legacy,'legacy'),oldPreview=old.artifactManifest.artifacts.find(a=>a.kind==='IMAGE');
  const oldPixels=await sharp(path.join(root,'artifacts',oldPreview.path)).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...oldPixels.subarray((45*320+80)*4,(45*320+80)*4+4)],[255,0,0,255],'omitted matte retains old transparent contain behavior');
  for(const invalid of ['transparent','#ffffff00','white',{r:255,g:255,b:255,alpha:0.5},{r:256,g:0,b:0,alpha:1},null]){
    assert.throws(()=>normalizeOpaqueFitBackgroundV1(invalid),/FIT_BACKGROUND_INVALID/);
    const bad=structuredClone(parameters);bad.compositionIntent.layers[1].fitBackground=invalid;
    assert.equal((await run(bad,'bad-'+JSON.stringify(invalid))).reason,'COMPOSITE_LAYER_FIT_BACKGROUND_INVALID');
  }
  const translucent=structuredClone(parameters);translucent.compositionIntent.layers[1].opacity=.5;
  assert.equal((await run(translucent,'opacity')).reason,'COMPOSITE_LAYER_FIT_BACKGROUND_REQUIRES_OPAQUE_CONTAIN');
  assert.deepEqual(normalizeOpaqueFitBackgroundV1('#FFFFFFff'),{r:255,g:255,b:255,alpha:1});
  assert.equal(result.productionAdmission,false);
  console.log('PASS native contain matte hides lower generated pixels across the full evidence box; native bytes, legacy behavior and compiler bindings preserved; transparent/invalid colors rejected. Synthetic pixels only.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
