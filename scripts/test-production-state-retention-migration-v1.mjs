import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {prepareStateGoalRetentionV1} from '../apps/studio-next/src/lib/a1-production-state-retention-v1.mjs';
import {productionFrameGoalInputV1,productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {productionBatchStateContentV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
import {migrateReviewedRetainedStateGoalV3,rebaseReviewedRetainedStateGoalV3} from '../apps/studio-next/src/lib/a1-production-state-retention-migration-v1.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),hex=value=>value.repeat(64);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-state-retention-migration-')));
try{
  const media=path.join(root,'work/media');fs.mkdirSync(media,{recursive:true});
  const imageBytes=Buffer.from('accepted-image'),referenceBytes=Buffer.from('reference-image');
  const image={path:'work/media/image.png',sha256:hash(imageBytes)},reference={path:'work/media/reference.jpg',sha256:hash(referenceBytes)};
  fs.writeFileSync(path.join(root,image.path),imageBytes);fs.writeFileSync(path.join(root,reference.path),referenceBytes);
  const states=['ENTRY','HOLD'];
  const shot={id:'fixture',sourceText:'Stable source',visualJob:'Stable task',sourceInterval:{startFrame:0,endFrameExclusive:3},exactCopy:['entry','hold'],
    productionResources:{assets:[{assetId:'surface',path:image.path,sha256:image.sha256,kind:'IMAGE'}],fonts:[]},
    referenceProductionDesign:{contract:'Fixture',shotId:'fixture',sourceVideoSha256:hex('a'),viewerIntent:'Whole-shot fallback',appearance:{composition:'fallback',palette:'black',surface:'flat'},
      references:states.map((state,index)=>({state,sourceFrame:index,path:reference.path,sha256:reference.sha256})),layers:[{id:'surface',assetIds:['surface']}],
      states:states.map((state,index)=>({state,visibleLayerIds:['surface'],visibleCopyIndices:[index],viewerNotice:state+' notice',appearance:{composition:state,palette:'black',surface:'flat'}})),acceptance:[]},
    productionLayout:{contract:'A1ProductionStateLayouts/v1',mode:'STATIC',canvas:{width:1920,height:1080},states:states.map((state,index)=>({state,copyIndices:[index],layers:[{id:'surface',assetId:'surface',kind:'ASSET',box:{x:0,y:0,width:1,height:1}}]}))},
    sourceNativeLayoutBinding:{contract:'A1SourceBoundNativeLayoutBinding/v1',nativeStates:['HOLD'],deliveryBoundary:'COMPLETE_FRAME',fullPackagingComplete:true,graphicsDebt:[]},
    fullFrameRequests:states.map((state,index)=>({state,nodeId:'producer-'+index,requestSha256:hex('b'),reference:{sourceFrame:index,sha256:reference.sha256}}))};
  const plan={scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:hex('a')},style:{direction:'fixture'},shots:[shot]};
  const request={requestId:'entry-revision',basePlanSha256:nodeInputHash(plan),text:'ENTRY only',status:'DESIGN_BOUND',states:['ENTRY'],productionAdmission:false};
  const goalInput=productionFrameGoalInputV1(plan,shot,'HOLD'),goalInputSha256=nodeInputHash(goalInput);
  const issued=prepareStateGoalRetentionV1({plan,shot,request,goalInputForState:state=>productionFrameGoalInputV1(plan,shot,state)}).HOLD;
  const legacyBody={...issued,dependencyVersion:2};delete legacyBody.sha256;
  const legacy={...legacyBody,sha256:nodeInputHash(legacyBody)};
  shot.productionRevisionRequest=request;shot.retainedStaticStateGoals={HOLD:legacy};
  shot.referenceProductionDesign.viewerIntent='ENTRY-specific top-level summary';
  shot.referenceProductionDesign.appearance={composition:'entry changed',palette:'blue',surface:'paper'};
  const qualification={contract:'A1CurrentStateWholeFrameQualification/v1',shotId:'fixture',state:'HOLD',goalInputSha256,
    sourceVideoSha256:plan.source.videoSha256,referenceSha256:reference.sha256,sourceFrame:1,imageSha256:image.sha256,
    stateContentSha256:nodeInputHash(productionBatchStateContentV1({shot,state:'HOLD'})),sourceNativeBindingSha256:hex('c'),wholeShotApproved:false,productionAdmission:false};
  const candidate={id:'whole-frame-fixture',sequenceIds:['fixture'],goalInputSha256,wholeAnchorPASS:true,localReview:{status:'PASS'},productionAdmission:false,
    staticSamples:[{sourceFrame:1,image,reference}],wholeFrameQualification:qualification};
  const migrated=migrateReviewedRetainedStateGoalV3({repoRoot:root,plan,shot,state:'HOLD',candidate});
  assert.equal(migrated.dependencyVersion,3);assert.equal(migrated.migrationEvidence.candidateId,candidate.id);
  shot.retainedStaticStateGoals.HOLD=migrated;
  assert.equal(productionFrameGoalShaV1(plan,shot,'HOLD'),goalInputSha256,'unchanged reviewed HOLD keeps its accepted goal');
  const previousFields={referenceProductionDesign:structuredClone(shot.referenceProductionDesign)};
  const retirement={state:'ENTRY',revisionId:request.requestId,retired:true,exactCopy:structuredClone(shot.exactCopy),previousFields};
  shot.stateSourceInputHistory=[{...retirement,retirementSha256:nodeInputHash(retirement)}];
  shot.referenceProductionDesign.uncertainties=['ENTRY compiler rewrote a sibling-only shared envelope'];
  assert.notEqual(productionFrameGoalShaV1(plan,shot,'HOLD'),goalInputSha256,'later sibling rewrite initially creates a conservative dependency barrier');
  qualification.stateContentSha256=nodeInputHash(productionBatchStateContentV1({shot,state:'HOLD'}));
  const workflow={nodes:[{id:'fixture:layer-compositor',state:'succeeded',inputSha256:hex('d'),acceptance:{inputSha256:hex('d'),artifactRoot:root},
    result:{staticStates:{samples:[{state:'HOLD',artifacts:[{kind:'IMAGE',path:image.path,sha256:image.sha256}]}]}}}]};
  const rebased=rebaseReviewedRetainedStateGoalV3({repoRoot:root,plan,workflow,shot,state:'HOLD',candidate});
  assert.equal(rebased.migrationEvidence.contract,'A1ReviewedStateRetentionRebase/v1');shot.retainedStaticStateGoals.HOLD=rebased;
  assert.equal(productionFrameGoalShaV1(plan,shot,'HOLD'),goalInputSha256,'byte-identical reviewed HOLD rebases without another model review');
  const globalDrift=structuredClone(plan);globalDrift.style.direction='unrelated global change';
  assert.throws(()=>rebaseReviewedRetainedStateGoalV3({repoRoot:root,plan:globalDrift,workflow,shot,state:'HOLD',candidate}),/SCOPED_HISTORY_REQUIRED/,
    'scoped history cannot hide a global plan change');
  const changed=structuredClone(plan);changed.shots[0].exactCopy[1]='changed hold';
  assert.throws(()=>productionFrameGoalShaV1(changed,changed.shots[0],'HOLD'),/STATE_RETENTION_PROOF_INVALID/,
    'changed HOLD content invalidates rather than relabels the migrated carry');
  fs.writeFileSync(path.join(root,image.path),'changed');
  assert.throws(()=>migrateReviewedRetainedStateGoalV3({repoRoot:root,plan,shot:{...shot,retainedStaticStateGoals:{HOLD:legacy}},state:'HOLD',candidate}),/FILE_CHANGED/);
  console.log(JSON.stringify({status:'PASS',contract:'A1ReviewedStateRetentionMigration/v1',providerCalls:0}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
