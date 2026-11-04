import assert from 'node:assert/strict';
import {wholeFrameQualificationIdentityV1,productionBatchReviewScopeV1,productionBatchHasUnresolvedSourceCellsV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
const sha=x=>x.repeat(64),ref={state:'HOLD',sourceFrame:50,sha256:sha('a'),path:'work/reference.png'};
const shot={id:'fixture',sourceText:'source',exactCopy:['literal'],sourceVersionSha256:sha('b'),
  referenceProductionDesign:{references:[ref],states:[{state:'HOLD',visibleCopyIndices:[0],viewerNotice:'Read literal'}]},
  fullFrameRequests:[{state:'HOLD',transparentBackground:true,copyIndices:[0]}]};
const plan={projectId:'fixture',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:sha('b')},shots:[shot],activeWorkScope:{referencePackagingOnly:true}};
plan.editorialBrief={contract:'A1ProductionEditorialBrief/v1',contentMode:'FACTUAL_ADAPTATION',presentationMode:'FACELESS',objective:'Complete current composition',authorizationEvidence:'User requested complete static frames',sourceIdentity:workScopeSourceIdentityV1(plan),productionAdmission:false,visualApproval:false,copyApproval:false};
const artifact={kind:'IMAGE',role:'hold',sha256:sha('c')};
const node={id:'fixture:layer-compositor',shotId:'fixture',module:'layer-compositor',state:'succeeded',inputSha256:sha('d'),acceptance:{inputSha256:sha('d'),artifacts:[artifact]}};
const sample={state:'HOLD',referenceSha256:ref.sha256,artifacts:[artifact]};
const candidate={id:'old-core',sequenceIds:['fixture'],productionAdmission:false,wholeAnchorPASS:false,coreVisualPASS:true,
  staticSamples:[{sourceFrame:50,image:{sha256:artifact.sha256},reference:{sha256:ref.sha256}}]};
const args={plan,shot,state:'HOLD',node,sample,candidate};
const q=wholeFrameQualificationIdentityV1(args);
assert.equal(q.imageSha256,artifact.sha256);assert.equal(q.wholeShotApproved,false);
assert.equal(productionBatchReviewScopeV1(plan,shot,'HOLD'),'PACKAGING_CORE','qualification does not relabel original scope');
assert.equal(candidate.wholeAnchorPASS,false,'old receipt remains untouched');
const clipped={unreadableCellIds:['entering-glyph'],acceptedCoreSourceVisibility:{contract:'A1AcceptedCoreStateReuseBinding/v1',sourceBytesUnchanged:true,targetVisualReviewRequired:true,visualApproval:false,productionAdmission:false,sourceCopy:['We need'],sourceCopySha256:nodeInputHash(['We need']),regions:[{layerId:'entering-glyph',kind:'PARTIAL_GLYPH',sourceCopyIndex:0,targetCopyIndex:null,sourceVisibility:'PARTIAL',rasterTextEditable:false,outputCompleteSourceCopyClaim:false}]}};
assert.equal(productionBatchHasUnresolvedSourceCellsV1(clipped),false,'declared entering pixel fragment is not an unverified literal');
for(const change of [c=>c.unreadableCellIds.push('unknown-table-cell'),c=>c.acceptedCoreSourceVisibility.regions[0].targetCopyIndex=0,c=>c.acceptedCoreSourceVisibility.regions[0].kind='FULL_LITERAL',c=>c.acceptedCoreSourceVisibility.regions[0].outputCompleteSourceCopyClaim=true,c=>c.acceptedCoreSourceVisibility.sourceCopy[0]='changed',c=>c.acceptedCoreSourceVisibility.sourceBytesUnchanged=false]){const bad=structuredClone(clipped);change(bad);assert.equal(productionBatchHasUnresolvedSourceCellsV1(bad),true);}
assert.equal(productionBatchHasUnresolvedSourceCellsV1({unreadableCellIds:['unknown-table-cell']}),true);
const declaredUnknown={unreadableCellIds:['unknown-table-cell'],nativeStateVisibility:{cells:[{cellId:'unknown-table-cell',sourceLiteralStatus:'UNREADABLE',copyIndex:null,visibility:'PARTIAL',outputCompleteCopyClaim:false}]}};
assert.equal(productionBatchHasUnresolvedSourceCellsV1(declaredUnknown),false,'declared non-claiming unreadable source geometry can enter visual review');
for(const change of [c=>c.nativeStateVisibility.cells[0].visibility='INVALID',c=>c.nativeStateVisibility.cells[0].copyIndex=0,c=>c.nativeStateVisibility.cells[0].outputCompleteCopyClaim=true]){const bad=structuredClone(declaredUnknown);change(bad);assert.equal(productionBatchHasUnresolvedSourceCellsV1(bad),true);}
const summarized=structuredClone(args);summarized.shot=summarized.plan.shots[0];summarized.shot.productionLayout={states:[{state:'HOLD',copyIndices:[0],layers:[]}]};
summarized.shot.sourceNativeLayoutBinding={contract:'A1SourceBoundNativeLayoutBinding/v1',nativeStates:['HOLD'],graphicsDebt:['unclaimed source cell'],fullPackagingComplete:false};
summarized.shot.sourcePresentationByState={HOLD:{copyMode:'REFERENCE_FRAME_SUMMARY',externalFactVerification:false,copyBindings:[{text:'literal',status:'LOCKED',sourceKind:'SOURCE_FRAME_SUMMARY',sourceVideoSha256:plan.source.videoSha256,frameNumber:ref.sourceFrame,sourceFrameSha256:ref.sha256}]}};
assert.equal(wholeFrameQualificationIdentityV1(summarized).state,'HOLD','frame-attributed summaries can enter pixel review without becoming verified external facts');
const wrongSummary=structuredClone(summarized);wrongSummary.shot=wrongSummary.plan.shots[0];wrongSummary.shot.sourcePresentationByState.HOLD.copyBindings[0].sourceFrameSha256=sha('f');
assert.throws(()=>wholeFrameQualificationIdentityV1(wrongSummary),/WHOLE_FRAME_QUALIFICATION/);
for(const mutate of [a=>a.node.inputSha256=sha('e'),a=>a.node.module='image-generation',a=>a.sample.referenceSha256=sha('e'),
  a=>a.candidate.goalInputSha256=sha('e'),a=>a.candidate.staticSamples[0].sourceFrame=51,a=>a.candidate.staticSamples[0].atlasRegion={},
  a=>a.shot.productionRevisionRequest={status:'OPEN'},a=>{a.shot.productionLayout={states:[{state:'HOLD'}]};a.shot.sourceNativeLayoutBinding={contract:'A1SourceBoundNativeLayoutBinding/v1',graphicsDebt:['missing verified source']};},
  a=>a.plan.editorialBrief.presentationMode='SOURCE_PRESENTATION']){
  const bad=structuredClone(args);bad.shot=bad.plan.shots[0];mutate(bad);
  assert.throws(()=>wholeFrameQualificationIdentityV1(bad),/WHOLE_FRAME_QUALIFICATION|EDITORIAL_BRIEF/);
}
console.log('PASS current accepted pixels only; stale goals, references, input, source debt, atlas/core substitutions and open revisions reject; original core scope preserved.');
