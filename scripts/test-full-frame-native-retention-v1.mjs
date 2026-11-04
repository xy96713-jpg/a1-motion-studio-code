import assert from 'node:assert/strict';
import {retainUnreplacedNativeStatesV1,fullFrameBoundDesignStateV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {productionBatchStateContentV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
const native={contract:'A1SourceBoundNativeLayoutBinding/v1',nativeStates:['ENTRY','HOLD'],input:{path:'original',sha256:'a'.repeat(64)},
  stateBindings:{HOLD:{input:{path:'retained',sha256:'b'.repeat(64)},graphicsDebt:['Retained evidence boundary']}},
  stateVisibility:[{state:'ENTRY',cells:[{cellId:'title',sourceLiteralStatus:'LOCKED',visibility:'FULL'}]},
    {state:'HOLD',cells:[{cellId:'body',sourceLiteralStatus:'LOCKED',visibility:'FULL'}]}],
  glyphCoverage:{states:[{state:'ENTRY'},{state:'HOLD'}],sha256:'c'.repeat(64)}};
const original=structuredClone(native),shot={sourceNativeLayoutBinding:native};
const retained=retainUnreplacedNativeStatesV1(shot,['ENTRY']);
assert.deepEqual(native,original,'preparation must not mutate source evidence');
assert.deepEqual(retained.binding.stateBindings.HOLD,native.stateBindings.HOLD);
assert.deepEqual(retained.binding.stateVisibility,[native.stateVisibility[1]]);
assert.deepEqual(retained.binding.glyphCoverage,native.glyphCoverage,'historical proof identity stays unchanged');
assert.deepEqual(retainUnreplacedNativeStatesV1({sourceNativeLayoutBinding:retained.binding},['ENTRY']),{changed:false,binding:retained.binding});
assert.equal(retainUnreplacedNativeStatesV1(shot,['ENTRY','HOLD']).binding,null);
const unknown=structuredClone(shot);unknown.sourceNativeLayoutBinding.stateVisibility[0].cells[0].sourceLiteralStatus='UNREADABLE';
assert.throws(()=>retainUnreplacedNativeStatesV1(unknown,['ENTRY']),/SOURCE_UNRESOLVED/);
unknown.sourceNativeLayoutBinding.stateVisibility[0].cells[0].visibility='HIDDEN';
assert.equal(retainUnreplacedNativeStatesV1(unknown,['ENTRY']).changed,true);
const frame={...shot,exactCopy:['Locked title'],productionLayout:{states:[{state:'ENTRY',copyIndices:[0],layers:[{id:'generated'}]}]},
  referenceProductionDesign:{references:[{state:'ENTRY'}],states:[{state:'ENTRY',visibleCopyIndices:[0],viewerNotice:'Generated complete frame'}]}};
assert.throws(()=>productionBatchStateContentV1({shot:frame,state:'ENTRY'}),/VISIBILITY_CHANGED/,'reproduce stale native proof after renderer switch');
const fixed={...frame,sourceNativeLayoutBinding:retained.binding};
assert.deepEqual(productionBatchStateContentV1({shot:fixed,state:'ENTRY'}).exactCopy,['Locked title']);
assert.equal(productionBatchStateContentV1({shot:fixed,state:'ENTRY'}).wholeAnchorApproved,false);
console.log('PASS native-to-full-frame retention: stale proof regression, unchanged sibling proof, source-debt rejection, idempotence, no approval promotion.');
const appearance={composition:'Central focus with offset secondary comparison',palette:'Gray',surface:'Source-led typography'};
const bound=fullFrameBoundDesignStateV1({state:'ENTRY',layers:[{id:'generated'}],copyIndices:[0]},
  {state:'ENTRY',viewerIntent:'Current state task',appearance},{viewerIntent:'Obsolete two-column task'});
assert.equal(bound.viewerNotice,'Current state task');assert.deepEqual(bound.appearance,appearance);
bound.appearance.surface='Changed privately';assert.equal(appearance.surface,'Source-led typography');
assert.throws(()=>fullFrameBoundDesignStateV1({state:'HOLD'}, {state:'ENTRY'}, {}),/STATE_REQUEST_REQUIRED/);
console.log('PASS bound frame carries its own request intent/appearance, never obsolete global design.');
const legacy={...fixed,fullFrameRequests:[{state:'ENTRY',nodeId:'asset:generate',requestSha256:'d'.repeat(64),goalInputSha256:'e'.repeat(64),copyIndices:[0],viewerIntent:'Bound request task',appearance}],
  fullFrameComposition:{stateBindings:[{state:'ENTRY',nodeId:'asset:generate',requestSha256:'d'.repeat(64),goalInputSha256:'e'.repeat(64)}]}};
assert.equal(productionBatchStateContentV1({shot:legacy,state:'ENTRY'}).viewerNotice,'Bound request task');
assert.deepEqual(productionBatchStateContentV1({shot:legacy,state:'ENTRY'}).stateAppearance,appearance);
legacy.fullFrameRequests[0].requestSha256='f'.repeat(64);
assert.equal(productionBatchStateContentV1({shot:legacy,state:'ENTRY'}).viewerNotice,'Generated complete frame','pending replacement cannot override review context');
