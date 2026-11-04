import assert from 'node:assert/strict';
import {planFrameBindingRecoveryV1} from './reconcile-current-frame-bindings-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';

const shot={id:'sample',sourceText:'A source passage',exactCopy:['A title'],tasks:[],
  referenceProductionDesign:{references:[],states:[],layers:[]},productionLayout:{states:[{state:'ENTRY'}]},
  fullFrameStateFocus:{excludedStates:[]},fullFrameRequests:[]};
const plan={projectId:'fixture',source:{videoSha256:'a'.repeat(64)},shots:[shot]};
shot.fullFrameRequests=['ENTRY','HOLD'].map(state=>({state,nodeId:'source-'+state,goalInputSha256:productionFrameGoalShaV1(plan,shot,state)}));
const nodes=shot.fullFrameRequests.map(r=>({id:r.nodeId,state:'succeeded',inputSha256:'b'.repeat(64),result:{file:r.state},
  acceptance:{inputSha256:'b'.repeat(64),sourceResultSha256:nodeInputHash({file:r.state})}}));
const runtime={plan,workflow:{nodes},inputPlanSha256:nodeInputHash(plan)};
assert.deepEqual(planFrameBindingRecoveryV1(runtime).recoveries[0].missingStates,['HOLD']);
shot.fullFrameStateFocus.excludedStates=['HOLD'];
assert.equal(planFrameBindingRecoveryV1(runtime).recoveries.length,0,'explicitly excluded states are not resurrected');
shot.fullFrameStateFocus.excludedStates=[];
shot.fullFrameRequests[1].goalInputSha256='c'.repeat(64);
assert.equal(planFrameBindingRecoveryV1(runtime).recoveries.length,0,'historical intent is not current delivery');
shot.fullFrameRequests[1].goalInputSha256=productionFrameGoalShaV1(plan,shot,'HOLD');
nodes[1].acceptance.sourceResultSha256='d'.repeat(64);
assert.equal(planFrameBindingRecoveryV1(runtime).deferred.length,1,'stale acceptance prevents rebinding');
nodes[1].acceptance.sourceResultSha256=nodeInputHash(nodes[1].result);
shot.productionLayout.states.push({state:'HOLD'});
assert.equal(planFrameBindingRecoveryV1(runtime).recoveries.length,0,'already connected states require no repeated binding');
console.log('PASS current accepted missing state recovery; excluded/stale states retained; stale acceptance deferred; repeated recovery is a no-op.');
