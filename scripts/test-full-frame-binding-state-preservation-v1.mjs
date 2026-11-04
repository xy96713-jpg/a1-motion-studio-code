import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import assert from 'node:assert/strict';
import {mergeFullFrameBindingStatesV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {productionLayoutReferenceDesignV1} from '../apps/studio-next/src/lib/a1-reference-design-execution-scope-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';

const names=['ENTRY','HOLD','HANDOFF'];
const layer=state=>({id:'complete-'+state.toLowerCase(),kind:'ASSET',assetId:state,box:{x:0,y:0,width:1,height:1},z:0});
const state=name=>({state:name,copyIndices:[0],referencePath:'/fixture/'+name,layers:[layer(name)]});
const design=states=>({states:states.map(s=>({state:s.state,visibleCopyIndices:s.copyIndices,visibleLayerIds:s.layers.map(l=>l.id)})),
  layers:states.flatMap(s=>s.layers.map(l=>({id:l.id,copyIndices:[0]}))),references:states.map(s=>({state:s.state,sha256:s.state})),acceptance:[]});
const requests=names.map(s=>({state:s,nodeId:'producer-'+s,requestSha256:s}));
const shot={id:'unseen',exactCopy:['source'],productionLayout:{contract:'A1ProductionStateLayouts/v1',mode:'STATIC',canvas:{width:1920,height:1080},states:names.slice(1).map(state)},
  referenceProductionDesign:design(names.map(state)),fullFrameRequests:requests,
  fullFrameComposition:{contract:'A1FullFrameComposition/v1',requestNodeIds:requests.slice(1).map(r=>r.nodeId)},
  fullFrameInputHistory:[{productionLayout:{states:[{state:'INVENTED_HISTORY'}]}}]};
const incoming=state('ENTRY');incoming.layers[0].assetId='replacement';
const plan={};
for(const request of requests)request.goalInputSha256=productionFrameGoalShaV1(plan,shot,request.state);
const args={plan,shot,states:[incoming],design:design([incoming]),requests:[requests[0]],assignments:[{shotId:shot.id,state:'ENTRY',nodeId:requests[0].nodeId,outputSha256:'pixels'}]};
const snapshot=JSON.stringify(args),result=mergeFullFrameBindingStatesV1(args);
assert.equal(JSON.stringify(args),snapshot,'binding merge must not mutate input');
assert.deepEqual(result.productionLayout.states.map(s=>s.state),names);
assert.deepEqual(result.referenceProductionDesign.references.map(s=>s.state),names,'incremental references retain canonical temporal order');
assert.deepEqual(result.referenceProductionDesign.states.map(s=>s.state),names);
assert.deepEqual(result.productionLayout.states.slice(1),shot.productionLayout.states,'untargeted source layouts remain byte-equivalent');
assert.deepEqual(result.fullFrameComposition.requestNodeIds,requests.map(r=>r.nodeId));
assert.equal(result.productionLayout.states[0].layers[0].assetId,'replacement');
assert.deepEqual(productionLayoutReferenceDesignV1(result).states.map(s=>s.state).sort(),[...names].sort());
assert.deepEqual(mergeFullFrameBindingStatesV1({...args,shot:{...shot,...result}}),result,'same state binding is idempotent');
const holdShot={...shot,productionLayout:{...shot.productionLayout,states:[state('ENTRY'),state('HANDOFF')]}};
assert.deepEqual(mergeFullFrameBindingStatesV1({...args,shot:holdShot,states:[state('HOLD')],design:design([state('HOLD')]),requests:[requests[1]],assignments:[{shotId:shot.id,state:'HOLD',nodeId:requests[1].nodeId,outputSha256:'hold-pixels'}]}).referenceProductionDesign.references.map(s=>s.state),names,'binding the middle state never appends earlier references after later ones');
const withoutCurrent={...shot,productionLayout:undefined,fullFrameComposition:undefined};
assert.deepEqual(mergeFullFrameBindingStatesV1({...args,shot:withoutCurrent}).productionLayout.states.map(s=>s.state),['ENTRY'],'history never resurrects executable states');
const typed=structuredClone(shot);typed.productionLayout.states[0].layers[0]={id:'editable-hold',kind:'TEXT',copyIndex:0,fontId:'native'};
typed.referenceProductionDesign=design([state('ENTRY'),...typed.productionLayout.states]);typed.typographyDirections=[{layerId:'editable-hold',route:'EDITABLE_LOCAL_TYPE'}];
const mixed=mergeFullFrameBindingStatesV1({...args,shot:typed});
assert.deepEqual(mixed.typographyDirections,typed.typographyDirections,'retained native text must keep its compiler direction');
assert.equal(mixed.productionLayout.states[1].layers[0].kind,'TEXT');
const repeatedCells=structuredClone(typed);repeatedCells.productionLayout.states[0].layers.push({...repeatedCells.productionLayout.states[0].layers[0],id:'second-native-cell',designLayerId:'editable-hold'});
assert.doesNotThrow(()=>mergeFullFrameBindingStatesV1({...args,shot:repeatedCells}),'multiple native glyph cells may share one semantic design layer');
const driftedCells=structuredClone(repeatedCells);driftedCells.productionLayout.states[0].layers[1].designLayerId='unbound-layer';assert.throws(()=>mergeFullFrameBindingStatesV1({...args,shot:driftedCells}),/DESIGN_MISMATCH/);
const retainedNative=structuredClone(shot),nativeState=retainedNative.productionLayout.states.find(s=>s.state==='HANDOFF');retainedNative.sourceNativeLayoutBinding={contract:'A1SourceBoundNativeLayoutBinding/v1',nativeStates:['HANDOFF'],stateVisibility:[{state:'HANDOFF',sourceStateInputSha256:nodeInputHash(nativeState)}]};retainedNative.fullFrameRequests=retainedNative.fullFrameRequests.map(r=>r.state==='HANDOFF'?{...r,goalInputSha256:'f'.repeat(64)}:r);
assert.ok(mergeFullFrameBindingStatesV1({...args,shot:retainedNative}).productionLayout.states.some(s=>s.state==='HANDOFF'),'current native state survives binding a different frame despite historical alternative request');
retainedNative.sourceNativeLayoutBinding.stateVisibility[0].sourceStateInputSha256='e'.repeat(64);assert.ok(!mergeFullFrameBindingStatesV1({...args,shot:retainedNative}).productionLayout.states.some(s=>s.state==='HANDOFF'),'changed native state is not retained by stale proof');

assert.throws(()=>mergeFullFrameBindingStatesV1({...args,states:[incoming,incoming]}),/STATES_INVALID/);
assert.throws(()=>mergeFullFrameBindingStatesV1({...args,shot:{...shot,productionLayout:{...shot.productionLayout,canvas:{width:960,height:540}}}}),/CANVAS_MISMATCH/);
const invalid=structuredClone(shot);invalid.productionLayout.states[0].copyIndices=[];
assert.throws(()=>mergeFullFrameBindingStatesV1({...args,shot:invalid}),/DESIGN_MISMATCH/);
assert.equal(result.fullFrameComposition.productionAdmission,false);
assert.equal(result.fullFrameComposition.visualApproval,false);
assert.throws(()=>mergeFullFrameBindingStatesV1({...args,requests:[{...requests[0],goalInputSha256:'stale'}]}),/GOAL_CHANGED/);
assert.doesNotThrow(()=>mergeFullFrameBindingStatesV1({...args,requests:[{...requests[0],goalInputSha256:undefined}]}),'legacy un-revised requests retain their original binding path');
assert.throws(()=>mergeFullFrameBindingStatesV1({...args,shot:{...shot,productionRevisionRequest:{requestId:'revision'}},requests:[{...requests[0],goalInputSha256:undefined}]}),/GOAL_BINDING_REQUIRED/);
assert.throws(()=>mergeFullFrameBindingStatesV1({...args,shot:{...shot,fullFrameStateFocus:{excludedStates:['ENTRY']}}}),/STATE_EXCLUDED/);
const excluded=mergeFullFrameBindingStatesV1({...args,shot:{...shot,fullFrameStateFocus:{excludedStates:['HANDOFF']}}});
assert.deepEqual(excluded.productionLayout.states.map(s=>s.state),['ENTRY','HOLD']);
assert.deepEqual(excluded.fullFrameComposition.requestNodeIds,['producer-ENTRY','producer-HOLD']);
const staleSibling=structuredClone(shot);staleSibling.fullFrameRequests.find(r=>r.state==='HOLD').goalInputSha256='stale-held-goal';
const independent=mergeFullFrameBindingStatesV1({...args,shot:staleSibling});
assert.deepEqual(independent.productionLayout.states.map(s=>s.state),['ENTRY','HANDOFF'],'a stale untargeted sibling cannot deadlock new current work');
assert.deepEqual(independent.referenceProductionDesign.references.map(r=>r.state),names,'the missing sibling retains its source obligation');
assert.deepEqual(staleSibling.productionLayout,shot.productionLayout,'old pixels/layout remain available to the writer history snapshot');
assert.equal(independent.fullFrameComposition.productionAdmission,false);
console.log('PASS incremental binding retains current states and producer identities, native type, deterministic order and repeat identity; no history promotion or rendering.');
