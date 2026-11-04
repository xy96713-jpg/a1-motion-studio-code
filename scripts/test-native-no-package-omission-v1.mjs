import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{createHash}from'node:crypto';
import{assertOmittedNativeNoPackageStatesV1}from'../apps/studio-next/src/lib/a1-production-source-native-layout-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'native-no-package-'))),dir=path.join(root,'work','fixture');fs.mkdirSync(path.join(dir,'coverage'),{recursive:true});
try{const file=path.join(dir,'reference.jpg');fs.writeFileSync(file,'verified source bytes');const sha=createHash('sha256').update(fs.readFileSync(file)).digest('hex'),video='a'.repeat(64);
 const decision={state:'HOLD',sourceFrame:5,sourceVideoSha256:video,referenceSha256:sha,referencePath:file,packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false,reason:'Observed clean frame',reviewedBy:'fixture'};
 const plan={source:{videoSha256:video},activeWorkScope:{referencePackagingOnly:true}},shot={id:'scene',sourceInterval:{startFrame:0,endFrameExclusive:10},statePackagingDecisions:[decision],productionRevisionRequest:{status:'OPEN',states:['ENTRY']}};
 const args={repoRoot:root,plan,shot,states:['HOLD'],evidence:{stateFrames:{scene:[{state:'HOLD',sourceFrame:5,artifactSha256:sha,artifactPath:'reference.jpg'}]}},evidencePath:path.join(dir,'coverage','evidence.json')};
 assert.doesNotThrow(()=>assertOmittedNativeNoPackageStatesV1(args));
 for(const change of [s=>s.stateCopyBindings={HOLD:{}},s=>s.productionRevisionRequest.states=['HOLD'],s=>delete s.productionRevisionRequest.states,s=>s.statePackagingDecisions[0].packagingElementsVisible=true]){const bad=structuredClone(shot);change(bad);assert.throws(()=>assertOmittedNativeNoPackageStatesV1({...args,shot:bad}),/NOT_EXCLUDED/);}
 fs.appendFileSync(file,'changed');assert.throws(()=>assertOmittedNativeNoPackageStatesV1(args),/FILE_CHANGED/);
 console.log('PASS only current byte-bound NO_PACKAGE states can leave a native render; new copy, pending revisions and source drift remain blocked.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
