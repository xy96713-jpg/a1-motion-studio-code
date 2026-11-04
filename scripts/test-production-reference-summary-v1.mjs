import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareReferenceFrameSummaryV1,compileFullFrameRequestsV1,prepareSourceExcerptRewriteV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {projectReviewedFrameCopyV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
import {verifyResearchCopyAuthoritiesV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {contextualizeSourceRewriteBindingV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'reference-summary-'))),taskRoot=path.join(root,'work','fixture');
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
  const coverage=path.join(taskRoot,'study','coverage');fs.mkdirSync(coverage,{recursive:true});
  const frame=path.join(coverage,'frame.png'),bytes=Buffer.from('89504e470d0a1a0a','hex');fs.writeFileSync(frame,bytes);
  const source='a'.repeat(64),sha256=hash(bytes),evidenceFile=path.join(coverage,'evidence.json');
  const evidence={contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:source},stateFrames:{unseen:[{state:'ENTRY',sourceFrame:5,artifactSha256:sha256,artifactPath:'coverage/frame.png'},{state:'HOLD',sourceFrame:6,artifactSha256:sha256,artifactPath:'coverage/frame.png'}]}};
  fs.writeFileSync(evidenceFile,JSON.stringify(evidence));
  const plan={contract:'A1ShotTaskPlan/v1',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:source},
    visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
    shots:[{id:'unseen',sourceText:'Unseen approximate number emphasis',visualJob:'Readable approximate amount',exactCopy:[],sourceInterval:{startFrame:0,endFrameExclusive:10},tasks:[]}]};
  plan.activeWorkScope={contract:'A1ProductionWorkScope/v1',shotIds:['unseen'],objective:'Original summary',sourceIdentity:workScopeSourceIdentityV1(plan),productionAdmission:false};
  const unit={shotId:'unseen',state:'ENTRY',copyMode:'REFERENCE_FRAME_SUMMARY',copy:['约四千'],sourceTranscription:'Narration says about four thousand; exact blurred digits are unknown.',reviewedBy:'fixture-reviewer',
    visualIntake:{contract:'A1WholeFrameVisualIntake/v1',reviewerRole:'AGENT',reviewerId:'fixture-reviewer',sourceCorePolicy:'ORIGINAL_ILLUSTRATION_NO_NATIVE_EVIDENCE',
      referenceEvidence:{path:evidenceFile,sha256:hash(fs.readFileSync(evidenceFile))},reference:{state:'ENTRY',sourceFrame:5,path:frame,sha256},
      visibleCopyIndices:[],viewerIntent:'Read a clearly labelled approximate amount',appearance:{composition:'Large number',palette:'Black and yellow',surface:'Authored typography'}}};
  const result=prepareReferenceFrameSummaryV1({repoRoot:root,taskRoot,plan,unit});
  assert.deepEqual(plan.shots[0].exactCopy,[],'original plan remains unchanged');
  assert.deepEqual(result.plan.shots[0].exactCopy,['约四千']);
  assert.equal(result.plan.shots[0].sourcePresentation.nativeWebpageClaim,false);
  assert.equal(result.plan.shots[0].sourcePresentation.externalFactVerification,false);
  const oldExecution=structuredClone(plan);oldExecution.shots[0].exactCopy=['Old title'];
  oldExecution.shots[0].tasks=[{module:'editable-typography',dependencies:[],parameters:{exactCopy:'Old title',runs:[{text:'Old title'}]}}];
  oldExecution.shots[0].productionLayoutBinding={compiler:'old-compiler'};
  oldExecution.shots[0].stateClaimReviews={HOLD:{review:{path:'old-source-review.json',sha256:source},targetSha256:source}};
  const revised=prepareReferenceFrameSummaryV1({repoRoot:root,taskRoot,plan:oldExecution,unit});
  assert.deepEqual(revised.plan.shots[0].fullFrameSourceInputHistory.at(-1).tasks,oldExecution.shots[0].tasks);
  assert.deepEqual(revised.plan.shots[0].tasks,[{module:'media-files',dependencies:[],parameters:{},blocker:'SOURCE_COPY_CHANGED_RECOMPILE_REQUIRED'}]);
  assert.equal(revised.plan.shots[0].productionLayoutBinding,undefined);
  assert.equal(revised.plan.shots[0].stateClaimReviews,undefined,'changed copy cannot keep source assessments bound to retired targets');
  assert.deepEqual(revised.plan.shots[0].stateClaimReviewHistory.at(-1),{state:'HOLD',binding:oldExecution.shots[0].stateClaimReviews.HOLD});
  const facts=verifyResearchCopyAuthoritiesV1({taskRoot,plan:result.plan});assert.equal(facts[0].sourceKind,'SOURCE_FRAME_SUMMARY');
  assert.equal(facts[0].displayCopy,'约四千');
  const excerptFile=path.join(taskRoot,'primary-excerpt.txt'),sourceUrl='https://example.org/historical-report';
  fs.writeFileSync(excerptFile,sourceUrl+'\nThe reported change was approximately four thousand.');
  const excerptUnit={...unit,copyMode:'SOURCE_BOUND_EXCERPT_REWRITE',sourceUrl,excerpt:{path:excerptFile,sha256:hash(fs.readFileSync(excerptFile))},
    supportQuotes:['The reported change was approximately four thousand.'],reviewedAt:'2026-10-12',copy:['报告中的变化约为四千']};
  const excerptRewrite=prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:excerptUnit});
  const excerptFacts=verifyResearchCopyAuthoritiesV1({taskRoot,plan:excerptRewrite.plan});
  assert.equal(excerptFacts[0].sourceKind,'VERIFIED_SOURCE_FACT_REWRITE');
  assert.equal(projectReviewedFrameCopyV1(excerptRewrite.plan.shots[0],excerptFacts).status,'REVIEWED_RESEARCH_COPY_BYTES_BOUND');
  assert.equal(excerptRewrite.plan.shots[0].sourcePresentation.boundaries.articleBodyFetched,false);
  assert.equal(excerptRewrite.plan.shots[0].sourcePresentation.nativeWebpageClaim,false);
  const binding=excerptRewrite.plan.shots[0].sourcePresentation.copyBindings[0];
  assert.deepEqual(binding.referenceContext,{sourceVideoSha256:source,frameNumber:5});
  const legacyBinding=structuredClone(binding);delete legacyBinding.referenceContext;
  assert.deepEqual(contextualizeSourceRewriteBindingV1(legacyBinding,{sourceVideoSha256:source,frameNumber:5}).referenceContext,binding.referenceContext);
  assert.equal(legacyBinding.referenceContext,undefined);
  assert.throws(()=>contextualizeSourceRewriteBindingV1(legacyBinding,{frameNumber:5}),/CONTEXT_REQUIRED/);
  const conflictingBinding={...legacyBinding,referenceContext:{sourceVideoSha256:'d'.repeat(64),frameNumber:17}};
  assert.deepEqual(contextualizeSourceRewriteBindingV1(conflictingBinding,{sourceVideoSha256:source,frameNumber:5}).referenceContext,conflictingBinding.referenceContext,'a declared conflicting context is never silently repaired');
  assert.throws(()=>prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:{...excerptUnit,supportQuotes:['unwritten assertion']}}),/QUOTES_UNBOUND/);
  const alreadyRendered=structuredClone(plan);alreadyRendered.shots[0].fullFrameRequests=[{state:'ENTRY',requestSha256:'c'.repeat(64)}];
  assert.throws(()=>prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:alreadyRendered,unit:excerptUnit}),/REVISION_REQUIRED/);
  alreadyRendered.shots[0].productionRevisionRequest={status:'OPEN',requestId:'rewrite-revision'};
  const replacedExcerpt=prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:alreadyRendered,unit:{...excerptUnit,replaceSourceInput:{revisionId:'rewrite-revision',previousCopySha256:nodeInputHash(alreadyRendered.shots[0].exactCopy),requests:alreadyRendered.shots[0].fullFrameRequests}}});
  assert.equal(replacedExcerpt.plan.shots[0].fullFrameSourceInputHistory.length,1);
  assert.equal(alreadyRendered.shots[0].exactCopy[0],plan.shots[0].exactCopy[0]);
  const contentPlan={referenceKind:'TYPOGRAPHY_EVENT',subject:'约四千',action:'Emphasize the source approximate amount',viewerTakeaway:'This amount is approximate',sourceAnchor:'约四千',requiredVisibleAnchors:['约四千'],treatment:'REBUILD_EDITORIAL'};
  const compiled=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:result.plan,units:[{shotId:'unseen',state:'ENTRY',brief:'One whole-frame summary: 约四千',contentPlan}]});
  assert.deepEqual(compiled.plan.assetTasks[0].tasks[0].parameters.generationRequest.exactCopy,['约四千']);
  const extraState={shotId:'unseen',state:'HOLD',brief:'Same locked summary 约四千 in the next canonical state',contentPlan,visualIntake:{...unit.visualIntake,
    reference:{...unit.visualIntake.reference,state:'HOLD',sourceFrame:6},visibleCopyIndices:[0]}};
  const multiple=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:result.plan,units:[extraState]});
  assert.deepEqual(multiple.plan.shots[0].referenceProductionDesign.references.map(r=>r.state),['ENTRY','HOLD']);
  const nativeDesign=structuredClone(result.plan);nativeDesign.shots[0].referenceProductionDesign.layers[0].role='EVIDENCE';
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:nativeDesign,units:[extraState]}),/BOUND_REFERENCE_REQUIRED/);
  assert.throws(()=>prepareReferenceFrameSummaryV1({repoRoot:root,taskRoot,plan,unit:{...unit,sourceTranscription:''}}),/SUMMARY_INPUT/);
  const wrong=structuredClone(unit);wrong.visualIntake.reference.sourceFrame=9;
  assert.throws(()=>prepareReferenceFrameSummaryV1({repoRoot:root,taskRoot,plan,unit:wrong}),/EVIDENCE_MISMATCH/);
  const photo=path.join(taskRoot,'portrait.png');fs.writeFileSync(photo,bytes);
  const staged=path.join(taskRoot,'portrait-download.json'),reviewFile=path.join(taskRoot,'portrait-review.json');
  const photoUrl='https://example.org/portrait.png';
  fs.writeFileSync(staged,JSON.stringify({contract:'A1UnreviewedMaterialDownload/v1',sha256,finalUrl:photoUrl}));
  const materialReview={contract:'A1SourceMaterialUseReview/v1',actorType:'AGENT',reviewerId:'fixture-reviewer',identityVerified:true,
    sourcePageUrl:'https://example.org/profile',assetUrl:photoUrl,sourceCaption:'Portrait from the named personal profile',
    productionAdmission:false,publicReleaseApproved:false,file:{path:photo,sha256},stagedReceipt:staged};
  fs.writeFileSync(reviewFile,JSON.stringify(materialReview));
  const box={x:.05,y:.1,width:.4,height:.8},materialUnit={...unit,
    visualIntake:{...unit.visualIntake,sourceCorePolicy:'VERIFIED_NATIVE_CORE_RESTORE'},
    protectedCores:[{layerId:'verified-portrait',assetId:'verified-portrait',box,fit:'contain'}],materialSelections:[{use:'EVIDENCE'}],
    sourceMaterials:[{assetId:'verified-portrait',box,review:{path:reviewFile,sha256:hash(fs.readFileSync(reviewFile))}}]};
  const nativeSummary=prepareReferenceFrameSummaryV1({repoRoot:root,taskRoot,plan,unit:materialUnit});
  const nativeShot=nativeSummary.plan.shots[0],nativeAsset=nativeShot.productionResources.assets.find(a=>a.assetId==='verified-portrait');
  assert.equal(nativeAsset.path,photo);assert.equal(nativeAsset.sha256,sha256);
  assert.equal(nativeAsset.materialClass,'VERIFIED_PERSON_PHOTO');assert.equal(nativeAsset.provenance.publicReleaseApproved,false);
  assert.ok(nativeShot.referenceProductionDesign.states[0].visibleLayerIds.includes('verified-portrait'));
  assert.equal(plan.shots[0].productionResources,undefined,'reviewed native materials must not mutate the input plan');
  fs.writeFileSync(staged,JSON.stringify({contract:'A1UnreviewedMaterialDownload/v1',sha256,finalUrl:'https://example.org/other.png'}));
  assert.throws(()=>prepareReferenceFrameSummaryV1({repoRoot:root,taskRoot,plan,unit:materialUnit}),/DOWNLOAD_BINDING/);
  fs.writeFileSync(staged,JSON.stringify({contract:'A1UnreviewedMaterialDownload/v1',sha256,finalUrl:photoUrl}));
  fs.appendFileSync(photo,'changed');
  assert.throws(()=>prepareReferenceFrameSummaryV1({repoRoot:root,taskRoot,plan,unit:materialUnit}),/INPUT_BYTES_CHANGED/);
  fs.appendFileSync(frame,'changed');assert.throws(()=>prepareReferenceFrameSummaryV1({repoRoot:root,taskRoot,plan,unit}),/INPUT_BYTES_CHANGED/);
  console.log('PASS reference summaries bind actual source bytes and explicit adapted copy; changed/unknown inputs fail; generated cards grant no native webpage or external-fact claim. Zero providers.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
