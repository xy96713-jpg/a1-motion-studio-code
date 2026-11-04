import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileHypitPersonCardSceneV1,prepareHypitPersonCardRequestV1,validateHypitPersonCardRequestV1,
  verifyHypitPersonCardOutputFactsV1,validateHypitPersonCardDecisionV1,verifyHypitPersonCardPngGeometryV1} from '../apps/studio-next/src/lib/a1-hypit-person-card-scene-v1.mjs';
import {hypitRenderNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-hypit-render-adapter-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
const hash='1'.repeat(64),otherHash='2'.repeat(64),clone=v=>structuredClone(v);
const card=(id,start,end)=>({id,personId:`fixture-${id}`,exactCopy:[`示例${id} & <研究者>`],assetId:id,
  assetSha256:hash,projectPath:`assets/${id}.png`,startFrame:start,endFrameExclusive:end,
  rect:{left:71,top:203,width:760,height:427},entrance:{kind:'wipe',frames:13,direction:'up',easing:'linear'}});
const config={width:980,height:1360,fps:25,frameCount:207,cards:[card('author-A',7,61),card('author-B',83,193)]};
const original=clone(config),scene=compileHypitPersonCardSceneV1(config);
assert.deepEqual(config,original);assert.deepEqual(scene,compileHypitPersonCardSceneV1(config));
assert.deepEqual(scene.events.map(e=>[e.kind,e.startFrame,e.endFrameExclusive]),
  [['neutral',0,7],['entrance',7,20],['hold',20,61],['neutral',61,83],['entrance',83,96],['hold',96,193],['neutral',193,207]]);
assert.match(scene.sources[0].content,/示例author-A &amp; &lt;研究者&gt;/);
assert.match(scene.sources[0].content,/top="203px"/);assert.match(scene.sources[1].content,/enter-direction: up/);
for(const s of scene.sources)assert.equal(createHash('sha256').update(s.content).digest('hex'),s.sha256);
assert.ok(scene.qa.sampleFrames.includes(20));assert.ok(scene.qa.sampleFrames.includes(96));
assert.ok(scene.qa.sampleFrames.includes(61));assert.ok(scene.qa.sampleFrames.includes(193));
const eight={...config,frameCount:800,cards:Array.from({length:8},(_,i)=>card('bound-'+i,10+i*95,80+i*95))};
const bounded=compileHypitPersonCardSceneV1(eight);assert.ok(bounded.qa.sampleFrames.length<=60);
for(const c of eight.cards)assert.ok(bounded.qa.sampleFrames.includes(c.endFrameExclusive));
assert.ok(scene.qa.sampleFrames.every(n=>n>=0&&n<207));assert.equal(scene.qa.actualPixelReview,false);
const base={contract:'A1HypitRenderRequest/v1',reviewOnly:true,productionAdmission:false,alphaRequired:true,hypitVersion:'0.2.16',
  shotId:'fixture',exactCopy:scene.exactCopy,copySha256:nodeInputHash(scene.exactCopy),sourceVideoSha256:otherHash,
  projectRootRelative:'prepared',runtimeProfileRelative:'local.runtime.json',localFileBindings:[],
  sourceFiles:[{path:'local.runtime.json',sha256:hash}],assetBindings:config.cards.map(c=>({assetId:c.assetId,sha256:c.assetSha256,projectPath:c.projectPath})),
  timeline:{sourceFrameStart:501,sourceVideoSha256:otherHash},motionBeats:scene.decisionProjection.motionBeats};
const {request}=prepareHypitPersonCardRequestV1(base,config);
assert.equal(request.timeline.sourceFrameEndExclusive,708);assert.equal(request.runSourceRelative,'person-card.svrun');
assert.equal(validateHypitPersonCardRequestV1(request).configSha256,scene.configSha256);
assert.equal(validateHypitPersonCardRequestV1(base),null);
const expect=(mutate,code)=>{const input=clone(config);mutate(input);assert.throws(()=>compileHypitPersonCardSceneV1(input),new RegExp(code));};
expect(c=>c.cards[0].entrance.direction='diagonal','MOTION_UNSUPPORTED');
expect(c=>c.cards[0].entrance.kind='fade','MOTION_UNSUPPORTED');
expect(c=>c.cards[0].entrance.frames=54,'MOTION_UNSUPPORTED');
expect(c=>c.cards[0].startFrame=7.5,'TIMELINE_INVALID');
expect(c=>c.cards[1].startFrame=60,'TIMELINE_INVALID');
expect(c=>c.cards[0].projectPath='assets/../secret.png','ASSET_INVALID');
expect(c=>c.cards[0].rect.left=900,'RECT_INVALID');
expect(c=>c.cards[0].id='author-B','IDENTITY_INVALID');
expect(c=>c.cards[0].exactCopy=['{malicious.expression}'],'COPY_INVALID');
expect(c=>c.audio='new-audio','UNKNOWN_FIELD');
for(const [field,value,code] of [['configSha256',otherHash,'COMPILER_BINDING'],['compilerSha256',hash,'COMPILER_BINDING']]) {
  const r=clone(request);r.personCardScene[field]=value;assert.throws(()=>validateHypitPersonCardRequestV1(r),new RegExp(code));
}
for(const mutate of [r=>r.exactCopy=['different'],r=>r.expectedOutput.frameCount++,r=>r.sourceFiles[1].sha256=hash,
  r=>r.assetBindings[0].projectPath='assets/other.png']) {
  const r=clone(request);mutate(r);assert.throws(()=>validateHypitPersonCardRequestV1(r),/BINDING_MISMATCH/);
}
const facts={width:980,height:1360,frameCount:207,fpsNumerator:25,fpsDenominator:1,durationSeconds:8.28};
assert.equal(verifyHypitPersonCardOutputFactsV1(scene,facts).productionAdmission,false);
for(const delta of [{frameCount:206},{width:981},{fpsNumerator:24},{durationSeconds:8.4},{fpsDenominator:0}])
  assert.throws(()=>verifyHypitPersonCardOutputFactsV1(scene,{...facts,...delta}),/OUTPUT_FACTS_MISMATCH/);
// Actual registered executor path blocks before any staging/CLI when the reviewed decision lacks the scene identity.
const decisionBody={contract:'A1ShotPackagingDecision/v1',status:'READY_FOR_REVIEW',shotVersionSha256:otherHash,
  motionBeats:scene.decisionProjection.motionBeats,layers:scene.decisionProjection.layers};
const decision={...decisionBody,decisionSha256:nodeInputHash(decisionBody)};
const node={id:'fixture:hypit-render',inputSha256:hash,input:{shot:{id:'fixture',exactCopy:scene.exactCopy,packagingDecision:decision},
  parameters:{request:{...request,decisionSha256:decision.decisionSha256}}}};
const result=await hypitRenderNodeAdapterV1.execute(node,{artifactRoot:'/tmp/not-created-by-this-test'});
assert.equal(result.reason,'HYPIT_PERSON_CARD_DECISION_BINDING_REQUIRED');assert.equal(result.productionAdmission,false);
const reviewed={...decisionBody,personCardSceneSha256:scene.configSha256};
validateHypitPersonCardDecisionV1(scene,reviewed);
const staleTime=clone(reviewed);staleTime.motionBeats[1].endFrame++;assert.throws(()=>validateHypitPersonCardDecisionV1(scene,staleTime),/DECISION_TIMELINE_MISMATCH/);
const staleGeometry=clone(reviewed);staleGeometry.layers[0].geometry.x=0;assert.throws(()=>validateHypitPersonCardDecisionV1(scene,staleGeometry),/DECISION_GEOMETRY_MISMATCH/);
const header=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.writeUInt32BE(13,8);header.write('IHDR',12);header.writeUInt32BE(1520,16);header.writeUInt32BE(854,20);
assert.equal(verifyHypitPersonCardPngGeometryV1(scene,base.assetBindings[0],header).policy,'PRESERVE_ASPECT_RATIO');
header.writeUInt32BE(855,20);assert.throws(()=>verifyHypitPersonCardPngGeometryV1(scene,base.assetBindings[0],header),/ASPECT_RATIO_CHANGE_FORBIDDEN/);
node.input.parameters.request.personCardScene.config.cards[0].entrance.direction='unknown';
assert.equal((await hypitRenderNodeAdapterV1.execute(node,{artifactRoot:'/tmp/not-created-by-this-test'})).reason,'HYPIT_PERSON_CARD_MOTION_UNSUPPORTED');
// The source-timed poster is independent native photo, fragment-mask and text
// layers. Its hard cut cannot silently become an invented fade-out.
const font={id:'fixture-font',projectPath:'assets/fixture.ttf',sha256:otherHash,weight:400,style:'normal'};
const poster={width:1920,height:1080,fps:60,frameCount:202,layeredPoster:{id:'pan-study',personId:'fixture-pan',
  photo:{assetId:'portrait-source',assetSha256:hash,projectPath:'assets/portrait.png',extent:{width:1000,height:1050},
    rect:{left:160,top:140,width:768,height:800},fit:'cover',edgeBlurPx:10},
  fonts:[font],timing:{revealStartFrame:8,photoClearFrame:36,cutFrame:196},
  brush:{family:'RECONSTRUCTED_DIAGONAL_FIBERS',strips:96,slope:0.82,jaggedness:3},
  background:{centerColor:'#d1d3d2',edgeColor:'#727575'},texts:[
    {id:'name',role:'name',text:'研究示例',fontId:font.id,rect:{left:1020,top:352,width:480,height:150},size:140,lineHeight:1,color:'#151b1c',z:30,
      clarity:{startFrame:36,clearFrame:66,fromBlurPx:16,toBlurPx:0,fromOpacity:0,toOpacity:1}},
    {id:'background-word',role:'background-lettering',text:'EXAMPLE',fontId:font.id,
      rect:{left:-100,top:-160,width:2400,height:500},size:450,lineHeight:1,color:'#a73746',z:5,
      clarity:{startFrame:36,clearFrame:73,fromBlurPx:22,toBlurPx:10,fromOpacity:0,toOpacity:0.8}},
  ]}};
const posterOriginal=clone(poster), layered=compileHypitPersonCardSceneV1(poster);
assert.deepEqual(poster,posterOriginal);assert.deepEqual(layered,compileHypitPersonCardSceneV1(poster));
const markup=layered.sources[0].content;
assert.equal((markup.match(/<space:Path id="fiber-path-/gu)||[]).length,96);
assert.equal((markup.match(/<pictures:Item id="fiber-/gu)||[]).length,96);
assert.match(markup,/<typo:Area id="name"/u);assert.match(markup,/at="30" opacity="1" blur="0"/u);
assert.match(markup,/left="-100px" top="-160px"/u);
assert.match(markup,/id="photo-hold"[^\n]*start="36f" end="196f"/u);
assert.ok(!/enter: wipe|exit:|card0\.entry/u.test(layered.sources[1].content));
assert.deepEqual(layered.events.at(-1),{kind:'neutral',startFrame:196,endFrameExclusive:202});
assert.equal(layered.qa.cameraMotion,'UNMEASURED_LOCKED_VIEW');assert.equal(layered.qa.actualPixelReview,false);
assert.equal(layered.qa.brushProvenance,'ORIGINAL_PROCEDURAL_RECONSTRUCTION_NOT_SOURCE_MASK');
const layeredBase={...base,exactCopy:layered.exactCopy,motionBeats:layered.decisionProjection.motionBeats,
  assetBindings:[{assetId:'portrait-source',sha256:hash,projectPath:'assets/portrait.png'}],
  localFileBindings:[{role:'font',fontId:font.id,sha256:font.sha256,projectPath:font.projectPath}]};
const layeredRequest=prepareHypitPersonCardRequestV1(layeredBase,poster).request;
assert.equal(validateHypitPersonCardRequestV1(layeredRequest).configSha256,layered.configSha256);
const wrongFont=clone(layeredRequest);wrongFont.localFileBindings[0].sha256=hash;
assert.throws(()=>validateHypitPersonCardRequestV1(wrongFont),/FONT_BINDING_MISMATCH/u);
for(const [mutate,error] of [
  [c=>c.layeredPoster.timing.cutFrame=203,'TIMELINE_INVALID'],
  [c=>c.layeredPoster.brush.family='NATIVE_SOURCE_MASK','BRUSH_INVALID'],
  [c=>c.layeredPoster.texts[0].clarity.clearFrame=196,'TEXT_MOTION_INVALID'],
  [c=>c.layeredPoster.fonts[0].projectPath='assets/../secret.ttf','FONT_INVALID'],
  [c=>c.cards=config.cards,'UNKNOWN_FIELD'],
]) {const input=clone(poster);mutate(input);assert.throws(()=>compileHypitPersonCardSceneV1(input),new RegExp(error));}
const posterHeader=Buffer.from(header);posterHeader.writeUInt32BE(1000,16);posterHeader.writeUInt32BE(1050,20);
assert.equal(verifyHypitPersonCardPngGeometryV1(layered,layeredBase.assetBindings[0],posterHeader).policy,'SOURCE_EXTENT_BOUND_EXPLICIT_FIT');
posterHeader.writeUInt32BE(1051,20);assert.throws(()=>verifyHypitPersonCardPngGeometryV1(layered,layeredBase.assetBindings[0],posterHeader),/PHOTO_EXTENT_MISMATCH/u);
console.log(JSON.stringify({status:'PASS',checks:['two-new-fixture-identities-portrait-up-linear','single-frame-source-gaps-entrance-holds-qa',
  'deterministic-source-sha-and-escaped-exact-copy','strict-unknown-overlap-path-geometry-motion-errors','request-source-asset-compiler-drift',
  'actual-adapter-rejects-unreviewed-scene-before-execution','decision-time-and-geometry-drift-rejected','png-aspect-change-rejected',
  'wrong-decoded-output-facts-rejected','native-layered-poster-source-times-hard-cut','independent-reconstructed-diagonal-path-fragments',
  'independent-copy-blur-keyframes-and-overscan','poster-font-and-photo-extent-bindings','legacy-whole-card-unchanged'],realRenderExecutions:0,visualApproval:'NOT_GRANTED'}));
