import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareSourceExcerptRewriteV1,compileFullFrameRequestsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {compileReferenceProductionDesignV1} from '../apps/studio-next/src/lib/a1-reference-production-design-v1.mjs';
import {verifyResearchCopyAuthoritiesV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'native-excerpt-'))),taskRoot=path.join(root,'work','fixture');
try{
  const coverage=path.join(taskRoot,'study','coverage');fs.mkdirSync(coverage,{recursive:true});
  const write=(filename,value)=>{fs.writeFileSync(filename,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));return {path:filename,sha256:hash(fs.readFileSync(filename))};};
  const frame=write(path.join(coverage,'frame.png'),Buffer.from('89504e470d0a1a0a','hex')),source='a'.repeat(64);
  const evidence=write(path.join(coverage,'evidence.json'),{contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:source},stateFrames:{unseen:['ENTRY','HOLD'].map((state,i)=>({state,sourceFrame:5+i,artifactSha256:frame.sha256,artifactPath:'coverage/frame.png'}))}});
  const sourceUrl='https://example.org/paper',quote='The two charts show reported training measurements.';
  const excerpt=write(path.join(taskRoot,'excerpt.txt'),sourceUrl+'\n'+quote);
  const plan={contract:'A1ShotTaskPlan/v1',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:source},
    visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
    shots:[{id:'unseen',sourceText:'Explain the source measurements',visualJob:'Inspect both original charts',exactCopy:[],sourceInterval:{startFrame:0,endFrameExclusive:10},tasks:[]}]};
  const materials=['chart-left','chart-right'].map((assetId,i)=>{
    const file=write(path.join(taskRoot,assetId+'.png'),Buffer.from('native-chart-'+i)),assetUrl=sourceUrl+'/'+assetId+'.png';
    const staged=write(path.join(taskRoot,assetId+'-download.json'),{contract:'A1UnreviewedMaterialDownload/v1',sha256:file.sha256,finalUrl:assetUrl});
    const review=write(path.join(taskRoot,assetId+'-review.json'),{contract:'A1SourceMaterialUseReview/v1',actorType:'AGENT',reviewerId:'fixture',identityVerified:true,
      sourcePageUrl:sourceUrl,assetUrl,sourceCaption:'Original chart '+i,productionAdmission:false,publicReleaseApproved:false,file,stagedReceipt:staged.path});
    return {assetId,materialClass:'VERIFIED_SOURCE_IMAGE',box:{x:.05+i*.5,y:.2,width:.4,height:.5},review};
  });
  const protectedCores=materials.map(m=>({layerId:m.assetId,assetId:m.assetId,box:m.box,fit:'contain'}));
  const unit={shotId:'unseen',state:'HOLD',copyMode:'SOURCE_BOUND_EXCERPT_REWRITE',copy:['原始测量图'],sourceUrl,excerpt,supportQuotes:[quote],reviewedBy:'fixture',reviewedAt:'2026-10-12',
    sourceMaterials:materials,protectedCores,materialSelections:[{use:'EVIDENCE'}],visualIntake:{contract:'A1WholeFrameVisualIntake/v1',reviewerRole:'AGENT',reviewerId:'fixture',sourceCorePolicy:'VERIFIED_NATIVE_CORE_RESTORE',
      referenceEvidence:evidence,reference:{state:'HOLD',sourceFrame:6,...frame},visibleCopyIndices:[0],viewerIntent:'Read the original charts',appearance:{composition:'Two source windows',palette:'White',surface:'Native charts'}}};
  const initial=prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit});
  const repeat=prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit});
  assert.deepEqual(repeat.plan.researchCopyAuthorityReceipts,initial.plan.researchCopyAuthorityReceipts,'identical review reuses immutable authority');
  const secondReviewer=prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:{...unit,reviewedBy:'second-editor'}});
  assert.notEqual(secondReviewer.plan.researchCopyAuthorityReceipts[0].path,initial.plan.researchCopyAuthorityReceipts[0].path,'different reviewer must not collide with a closed receipt');
  verifyResearchCopyAuthoritiesV1({taskRoot,plan:initial.plan});
  verifyResearchCopyAuthoritiesV1({taskRoot,plan:secondReviewer.plan});
  const entry={...unit,state:'ENTRY',visualIntake:{...unit.visualIntake,reference:{...unit.visualIntake.reference,state:'ENTRY',sourceFrame:5}}};
  const output=prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:initial.plan,unit:entry}),shot=output.plan.shots[0];
  assert.equal(plan.shots[0].productionResources,undefined);
  assert.equal(shot.productionResources.assets.length,2,'shared source images are not duplicated across states');
  assert.ok(shot.productionResources.assets.every(a=>a.materialClass==='VERIFIED_SOURCE_IMAGE'));
  assert.ok(shot.productionResources.assets.every(a=>a.provenance.publicReleaseApproved===false));
  for(const name of ['ENTRY','HOLD'])assert.deepEqual(shot.referenceProductionDesign.states.find(s=>s.state===name).visibleLayerIds.filter(id=>id.startsWith('chart-')),materials.map(m=>m.assetId));
  assert.equal(shot.referenceProductionDesign.layers.filter(l=>l.role==='EVIDENCE').length,2);
  assert.ok(shot.referenceProductionDesign.layers.filter(l=>l.role==='EVIDENCE').every(l=>!l.purpose.includes('portrait')));
  assert.equal(shot.fullFrameSourceInputHistory.length,2);
  assert.deepEqual(shot.sourcePresentation.sourceMaterialUseReviews,materials.map(m=>m.review));
  assert.equal(shot.sourcePresentation.productionAdmission,false);assert.equal(shot.sourcePresentation.visualApproval,false);
  assert.equal(shot.sourcePresentation.externalFactVerification,false);assert.equal(shot.sourcePresentation.nativeWebpageClaim,false);
  assert.equal(verifyResearchCopyAuthoritiesV1({taskRoot,plan:output.plan})[0].sourceKind,'VERIFIED_SOURCE_FACT_REWRITE');
  const compiled=compileReferenceProductionDesignV1({design:shot.referenceProductionDesign,shot:{...shot,tasks:['media-files','image-generation','asset-treatment','layer-compositor'].map(module=>({module,parameters:{},dependencies:[]}))},sourceVideoSha256:source,verifiedReferenceShas:[frame.sha256]});
  assert.deepEqual(compiled.blockers,[]);
  assert.ok(compiled.layers.filter(l=>l.role==='EVIDENCE').every(l=>l.preserveSourceCore&&l.assetIds.length===1));
  const generation={shotId:'unseen',state:'ENTRY',brief:'Surround the original chart windows with the locked caption 原始测量图',protectedCores,
    contentPlan:{referenceKind:'EDITORIAL_INFOGRAPHIC',subject:'原始测量图',action:'Show source charts unchanged',viewerTakeaway:'Read original measurements',sourceAnchor:'原始测量图',requiredVisibleAnchors:['原始测量图'],treatment:'REBUILD_EDITORIAL'}};
  const request=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:output.plan,units:[generation]});
  assert.deepEqual(request.assignments[0].protectedCores,protectedCores);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:output.plan,units:[{...generation,protectedCores:[]}]}),/NATIVE_CORE_OVERLAY_REQUIRED/);
  const legacy={...unit,sourceMaterials:[{...materials[0],materialClass:undefined}]};
  assert.equal(prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:legacy}).plan.shots[0].productionResources.assets[0].materialClass,'VERIFIED_PERSON_PHOTO');
  assert.throws(()=>prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:{...unit,sourceMaterials:[{...materials[0],materialClass:'ORIGINAL_GENERATED_ASSET'}]}}),/MATERIAL_CLASS/);
  assert.throws(()=>prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:{...unit,sourceMaterials:[materials[0],materials[0]]}}),/MATERIAL_TARGET/);
  assert.throws(()=>prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:{...unit,supportQuotes:['unsupported numerical claim']}}),/QUOTES_UNBOUND/);
  const bad=JSON.parse(fs.readFileSync(materials[0].review.path));bad.identityVerified=false;
  const badReview=write(path.join(taskRoot,'bad-review.json'),bad);
  assert.throws(()=>prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:{...unit,sourceMaterials:[{...materials[0],review:badReview}]}}),/MATERIAL_REVIEW_REQUIRED/);
  fs.appendFileSync(bad.file.path,'changed');
  assert.throws(()=>prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit}),/INPUT_BYTES_CHANGED/);
  console.log('PASS two verified native charts enter excerpt rewrite and existing request compiler; shared state layers retained once, legacy portraits compatible, evidence/byte/approval boundaries enforced. No providers or rendering.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
