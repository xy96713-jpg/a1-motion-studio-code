import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {productionCleanPresenterObservationsOnlyV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'clean-review-')));
try{
  fs.mkdirSync(path.join(root,'work'));
  const referencePath=path.join(root,'work','frame.jpg'),bytes=Buffer.from('verified clean frame');fs.writeFileSync(referencePath,bytes);
  const referenceSha256=createHash('sha256').update(bytes).digest('hex'),video='a'.repeat(64);
  const before={scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:video},activeWorkScope:{referencePackagingOnly:true,shotIds:['packaged','presenter']},
    visualQualityPolicy:{mode:'WHOLE_FRAME_APPROXIMATE'},shots:[{id:'packaged',exactCopy:['native chart'],productionResources:{assets:[{sha256:'b'.repeat(64)}]}},
      {id:'presenter',exactCopy:[],sourceInterval:{startFrame:100,endFrameExclusive:200}}]};
  const decision={state:'HOLD',sourceFrame:150,sourceVideoSha256:video,referenceSha256,referencePath,packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false,reason:'Source frame inspected; no packaging.',reviewedBy:'fixture'};
  const after=structuredClone(before);after.shots[1].statePackagingDecisions=[decision];
  const check=(a,b)=>productionCleanPresenterObservationsOnlyV1({repoRoot:root,before:a,after:b,selectedShotIds:['packaged']});
  const snapshot=JSON.stringify({before,after});assert.equal(check(before,after),true);assert.equal(JSON.stringify({before,after}),snapshot);
  assert.equal(check(before,before),false);
  const oldObservation=structuredClone(before);oldObservation.shots[1].statePackagingDecisions=[{...decision,packagingForm:'PACKAGE',observation:'UNREVIEWED'}];
  assert.equal(check(oldObservation,after),true,'verified clean observation may replace an earlier observation on another shot');
  for(const mutate of [p=>p.shots[0].exactCopy=['changed'],p=>p.shots[0].wholeFrameReview={status:'PASS'},p=>p.shots[0].statePackagingDecisions=[decision],
    p=>p.source.videoSha256='c'.repeat(64),p=>p.visualQualityPolicy.mode='DIFFERENT',p=>p.activeWorkScope.objective='changed global scope',
    p=>p.shots[1].tasks=[{module:'image-generation'}],p=>p.shots[1].productionResources={assets:[]},p=>p.shots[1].exactCopy=['new copy'],
    p=>p.shots[1].statePackagingDecisions[0].packagingForm='PACKAGE',p=>p.shots[1].statePackagingDecisions[0].observation='NATIVE_IMAGE',
    p=>p.shots[1].statePackagingDecisions[0].packagingElementsVisible=true,p=>p.shots[1].statePackagingDecisions[0].sourceVideoSha256='c'.repeat(64),
    p=>p.shots[1].statePackagingDecisions[0].sourceFrame=200,p=>p.shots[1].statePackagingDecisions[0].referenceSha256='c'.repeat(64),
    p=>p.shots[1].statePackagingDecisions[0].reviewedBy='',p=>p.shots[1].statePackagingDecisions[0].productionAdmission=true,
    p=>p.shots[1].statePackagingDecisions.push({...decision}),p=>p.shots.reverse()]){
    const changed=structuredClone(after);mutate(changed);assert.equal(check(before,changed),false,mutate.toString());
  }
  assert.equal(check(after,before),false,'removing decisions is not an observation addition');
  const noScope=structuredClone(before);noScope.activeWorkScope.referencePackagingOnly=false;assert.equal(check(noScope,after),false);
  const outside=path.join(root,'outside.jpg');fs.writeFileSync(outside,bytes);
  const wrongPath=structuredClone(after);wrongPath.shots[1].statePackagingDecisions[0].referencePath=outside;assert.equal(check(before,wrongPath),false);
  const symlink=path.join(root,'work','symlink.jpg');fs.symlinkSync(referencePath,symlink);wrongPath.shots[1].statePackagingDecisions[0].referencePath=symlink;assert.equal(check(before,wrongPath),false);
  fs.appendFileSync(referencePath,'drift');assert.equal(check(before,after),false);
  console.log('PASS only verified clean-presenter decisions on unselected shots permit review reuse; exact selected shots, globals, source, layout, files and source-frame interval remain locked. No providers or production writes.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
