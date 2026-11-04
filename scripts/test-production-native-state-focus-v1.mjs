import assert from 'node:assert/strict';
import {researchStaticSampleIsCurrentV1} from '../apps/studio-next/src/lib/a1-research-static-package-binding-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
const plan={source:{videoSha256:'a'.repeat(64)}},reference={state:'HANDOFF',sourceFrame:30,sha256:'b'.repeat(64)},shot={id:'mixed',exactCopy:['current native words'],
 fullFrameStateFocus:{activeStates:['HOLD'],excludedStates:[]},fullFrameRequests:[{state:'HOLD',reference:{state:'HOLD',sourceFrame:20,sha256:'c'.repeat(64)}}],
 referenceProductionDesign:{references:[reference]},productionLayout:{states:[{state:'HANDOFF'}]},
 sourceNativeLayoutBinding:{contract:'A1SourceBoundNativeLayoutBinding/v1',nativeStates:['HANDOFF']}};
const sample={sourceFrame:30},candidate={goalInputSha256:productionFrameGoalShaV1(plan,shot,'HANDOFF')};
const args={plan,shot,candidate,sample,imageSha256:'d'.repeat(64),referenceSha256:reference.sha256};
assert.equal(researchStaticSampleIsCurrentV1(args),true,'an explicitly produced native state is independent of older raster-request focus');
assert.equal(researchStaticSampleIsCurrentV1({...args,referenceSha256:'f'.repeat(64)}),false);
for(const changed of [{...shot,sourceNativeLayoutBinding:undefined},{...shot,sourceNativeLayoutBinding:{...shot.sourceNativeLayoutBinding,nativeStates:['ENTRY']}},{...shot,productionLayout:{states:[]}}])assert.equal(researchStaticSampleIsCurrentV1({...args,shot:changed}),false);
assert.equal(researchStaticSampleIsCurrentV1({...args,candidate:{goalInputSha256:'f'.repeat(64)}}),false);
const legacy={...shot,sourceNativeLayoutBinding:undefined};
assert.equal(researchStaticSampleIsCurrentV1({...args,shot:legacy,sample:{sourceFrame:20},candidate:{goalInputSha256:productionFrameGoalShaV1(plan,legacy,'HOLD')},referenceSha256:'c'.repeat(64)}),true);
console.log('PASS mixed native-state projection with existing raster focus; exact state/ref/goal required, legacy and foreign/unproduced states retain focus restrictions.');
