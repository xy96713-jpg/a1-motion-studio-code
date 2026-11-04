import assert from 'node:assert/strict';
import {compileShotPackagingDecisionV1, SHOT_PACKAGING_DECISION_V1} from '../apps/studio-next/src/lib/a1-shot-packaging-decision-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';

const shotVersionSha256='a'.repeat(64);
const baseDecision=(overrides={})=>({
  contract:SHOT_PACKAGING_DECISION_V1,
  version:1,
  shotId:'decision-test',
  shotVersionSha256,
  narrativeRole:'DECORATIVE_PACKAGE',
  viewerTask:'Read the designed title',
  packagingForm:'TYPE_COMPOSITION',
  selectionReason:'The title carries the beat',
  rejectedAlternative:'A source window would distract',
  copyStatus:'NO_DESIGNED_COPY',
  copyBindings:[],
  sourceBindings:[],
  composition:{focalTarget:'title',hierarchy:'title first',readingOrder:['title']},
  layers:[{id:'title',role:'headline',z:1,geometry:{x:0.1,y:0.2,width:0.8,height:0.2}}],
  effectStack:[],
  motionBeats:[],
  layoutReview:'Check title legibility at delivery size',
  handoff:{exitCondition:'Title settles',nextShotRelation:'Carry the claim forward'},
  ...overrides,
});
const compile=(decision,exactCopy=[],availableAssets=[])=>compileShotPackagingDecisionV1({
  decision,shotId:'decision-test',shotVersionSha256,exactCopy,availableAssets,
});
const lockedCopy=['same wording','same wording'];
const binding=(copyIndex,text=lockedCopy[copyIndex])=>({
  copyIndex,text,status:'LOCKED',sourceVideoSha256:shotVersionSha256,frameNumber:12,
});

const complete=compile(baseDecision({copyStatus:'LOCKED',copyBindings:[binding(0),binding(1)]}),lockedCopy);
assert.equal(complete.status,'READY_FOR_REVIEW','each exact-copy occurrence can bind once, including repeated text at separate indices');
const nativePhoto={assetId:'native-photo',sha256:'b'.repeat(64),materialClass:'VERIFIED_SOURCE_IMAGE',identityStatus:'VERIFIED',provenanceStatus:'VERIFIED',sourceUri:'https://example.org/photo',usage:'Preserve reviewed photo pixels'};
assert.equal(compile(baseDecision({sourceBindings:[nativePhoto]}),[],[{...nativePhoto,id:nativePhoto.assetId}]).status,'READY_FOR_REVIEW','reviewed generic source photographs are valid bindings');
assert.ok(compile(baseDecision({sourceBindings:[nativePhoto]}),[],[{...nativePhoto,id:nativePhoto.assetId,sha256:'c'.repeat(64)}]).blockers.includes('PACKAGING_SOURCE_BINDING_INVALID'),'a source photo still requires its exact accepted bytes');

const duplicateIndex=compile(baseDecision({copyStatus:'LOCKED',copyBindings:[binding(0),binding(0)]}),lockedCopy);
assert.equal(duplicateIndex.status,'BLOCKED');
assert.ok(duplicateIndex.blockers.includes('PACKAGING_COPY_BINDING_INDEX_DUPLICATE'));
assert.ok(duplicateIndex.blockers.includes('PACKAGING_LOCKED_COPY_COVERAGE_INVALID'));

const missingIndex=compile(baseDecision({copyStatus:'LOCKED',copyBindings:[binding(0)]}),lockedCopy);
assert.ok(missingIndex.blockers.includes('PACKAGING_LOCKED_COPY_COVERAGE_INVALID'));
const outOfOrder=compile(baseDecision({copyStatus:'LOCKED',copyBindings:[binding(1),binding(0)]}),lockedCopy);
assert.equal(outOfOrder.status,'READY_FOR_REVIEW','coverage is index based and does not depend on array ordering');
const extraIndex=compile(baseDecision({copyStatus:'LOCKED',copyBindings:[binding(0),binding(1),binding(2,'extra')]}),lockedCopy);
assert.equal(extraIndex.status,'BLOCKED');
assert.ok(extraIndex.blockers.includes('PACKAGING_COPY_BINDING_INVALID'));

const unresolved=compile(baseDecision({copyStatus:'UNRESOLVED',copyBindings:[]}));
assert.equal(unresolved.status,'BLOCKED');
assert.ok(unresolved.blockers.includes('PACKAGING_COPY_UNRESOLVED'));
assert.ok(compile(baseDecision({copyStatus:'UNRESOLVED',copyBindings:[binding(0)]})).blockers.includes('PACKAGING_UNRESOLVED_COPY_HAS_TEXT'));

assert.equal(compile(baseDecision({copyStatus:'NO_DESIGNED_COPY',copyBindings:[]})).status,'READY_FOR_REVIEW');
assert.ok(compile(baseDecision({copyStatus:'NO_DESIGNED_COPY'}),['unplanned text']).blockers.includes('PACKAGING_NO_DESIGNED_COPY_HAS_TEXT'));
assert.ok(compile(baseDecision({copyStatus:'NO_DESIGNED_COPY',copyBindings:[binding(0)]})).blockers.includes('PACKAGING_NO_DESIGNED_COPY_HAS_TEXT'));
assert.ok(compile(baseDecision({copyStatus:'UNKNOWN',copyBindings:[]})).blockers.includes('PACKAGING_COPY_STATUS_REQUIRED'));
assert.ok(compile(baseDecision({copyBindings:undefined})).blockers.includes('PACKAGING_COPY_BINDINGS_REQUIRED'));
assert.ok(compile(baseDecision({copyStatus:'NO_DESIGNED_COPY'}),['', 'valid']).blockers.includes('PACKAGING_EXACT_COPY_INVALID'));

const noPackage=compile(baseDecision({packagingForm:'NO_PACKAGE',copyStatus:'NO_DESIGNED_COPY',layers:[]}));
assert.equal(noPackage.status,'READY_FOR_REVIEW','NO_PACKAGE is a valid empty-layer decision');
assert.ok(compile(baseDecision({packagingForm:'NO_PACKAGE',copyStatus:'NO_DESIGNED_COPY'})).blockers.includes('PACKAGING_LAYER_PLAN_REQUIRED'));
assert.ok(compile(baseDecision({packagingForm:'NO_PACKAGE',copyStatus:'NO_DESIGNED_COPY',layers:undefined})).blockers.includes('PACKAGING_LAYER_PLAN_REQUIRED'));
const noPackageSource={id:'source',sha256:'b'.repeat(64),materialClass:'ORIGINAL_GENERATED_ASSET',provenanceStatus:'VERIFIED',sourceUri:'https://example.test/source.png'};
const sourceBinding={assetId:noPackageSource.id,sha256:noPackageSource.sha256,materialClass:noPackageSource.materialClass,usage:'source',identityStatus:'VERIFIED',
  sourceUri:noPackageSource.sourceUri,provenanceStatus:'VERIFIED'};
const sceneBound=compile(baseDecision({narrativeRole:'PERSON_IDENTITY',packagingForm:'EDITORIAL_IDENTITY',
  sourceBindings:[sourceBinding],personCardSceneSha256:'c'.repeat(64)}),[],[noPackageSource]);
assert.equal(sceneBound.status,'READY_FOR_REVIEW');assert.equal(sceneBound.personCardSceneSha256,'c'.repeat(64));
const {decisionSha256:sceneDecisionHash,...sceneDecisionBody}=sceneBound;
assert.equal(sceneDecisionHash,nodeInputHash(sceneDecisionBody),'the standard compiler hashes the preserved scene identity');
assert.ok(compile(baseDecision({personCardSceneSha256:'c'.repeat(64)})).blockers.includes('PACKAGING_PERSON_CARD_SCENE_BINDING_INVALID'));
assert.ok(compile(baseDecision({narrativeRole:'PERSON_IDENTITY',sourceBindings:[sourceBinding],personCardSceneSha256:'invalid'}),[],[noPackageSource]).blockers.includes('PACKAGING_PERSON_CARD_SCENE_BINDING_INVALID'));
assert.ok(compile(baseDecision({packagingForm:'NO_PACKAGE',copyStatus:'NO_DESIGNED_COPY',layers:[],sourceBindings:[sourceBinding]}),[],[noPackageSource]).blockers.includes('PACKAGING_NO_PACKAGE_CONTENT_INVALID'));
assert.ok(compile(baseDecision({packagingForm:'NO_PACKAGE',copyStatus:'NO_DESIGNED_COPY',layers:[],motionBeats:[{
  kind:'HOLD',target:'base',reason:'test',startFrame:0,endFrame:1,cueId:'cue',
}]})).blockers.includes('PACKAGING_NO_PACKAGE_CONTENT_INVALID'));
assert.ok(compile(baseDecision({packagingForm:'NO_PACKAGE',copyStatus:'NO_DESIGNED_COPY',layers:[],effectStack:['SOURCE_PRESERVE']})).blockers.includes('PACKAGING_EFFECT_STACK_INVALID'));
assert.ok(compile(baseDecision({packagingForm:'NO_PACKAGE',copyStatus:'LOCKED',layers:[],copyBindings:[binding(0)]}),['some copy']).blockers.includes('PACKAGING_NO_PACKAGE_CONTENT_INVALID'));

const typographyPlan={canvas:{width:1920,height:1080},exactCopy:lockedCopy.join(''),runs:[{text:lockedCopy.join(''),plane:'front-artwork'}]};
const typographyAssetId='decision-test-editable-typography-plan';
const typographyAssetSha=nodeInputHash(typographyPlan);
const typographyAsset={contract:'A1ShotEditableTypographyPlanAsset/v1',assetId:typographyAssetId,sha256:typographyAssetSha,
  materialClass:'CODE_NATIVE_ASSET',provenanceStatus:'VERIFIED',sourceUri:'work/decision-test/shot-task-plan.json#shots/decision-test/editableTypographyPlan'};
const typographySourceBinding={assetId:typographyAssetId,sha256:typographyAssetSha,materialClass:'CODE_NATIVE_ASSET',usage:'Hash-bound editable exact-copy and z-plane plan',
  identityStatus:'VERIFIED',provenanceStatus:'VERIFIED',sourceUri:typographyAsset.sourceUri};
const copyDecision=baseDecision({copyStatus:'LOCKED',copyBindings:[binding(0),binding(1)],sourceBindings:[typographySourceBinding],
  layers:[{id:'exact-copy-plane',role:'editable-exact-copy',assetId:typographyAssetId,assetSha256:typographyAssetSha,z:1,
    geometry:{x:0,y:0,width:1,height:1},producer:{nodeId:'decision-test:editable-typography',artifactRole:'typography-plane-front-artwork-overlay',
      artifactKind:'IMAGE',sourceAssetId:typographyAssetId,sourceAssetSha256:typographyAssetSha}}]});
const graphPlan={contract:'A1ShotTaskPlan/v1',projectId:'decision-test',scope:'RESEARCH_ONLY',productionAdmission:false,
  source:{videoSha256:shotVersionSha256},shots:[{id:'decision-test',sourceText:'fixture',visualJob:'exact copy plus illustration disclosure',sourceVersionSha256:shotVersionSha256,
    exactCopy:lockedCopy,editableTypographyPlan:typographyPlan,editableTypographyPlanAsset:typographyAsset,packagingDecision:copyDecision,
    tasks:[{module:'layer-compositor',dependencies:[],parameters:{
      compositionCanvas:{contract:'A1NodeCompositionCanvas/v1',width:1920,height:1080,sourceVideoSha256:shotVersionSha256},
      compositionIntent:{contract:'A1NodeLayerCompositionIntent/v1',width:1920,height:1080,layers:[{id:'exact-copy-plane',dependencyNodeId:'decision-test:editable-typography',
        geometry:{x:0,y:0,width:1,height:1},fit:'contain',z:1,opacity:1,artifactRole:'typography-plane-front-artwork-overlay',artifactKind:'IMAGE'}]},
    }}]}]};
const compiledGraph=compileShotTaskWorkspaceV1(graphPlan);
const compiledShot=compiledGraph.production.shotIntelligence.currentStoryboardAuthority.shots[0];
assert.equal(compiledShot.packagingDecision.status,'READY_FOR_REVIEW','a hash-bound code-native typography plan is an explicit source for its generated text planes');
assert.equal(compiledShot.packagingDecision.sourceBindings[0].sha256,typographyAssetSha);
assert.ok(compiledShot.nodeWorkflow.moduleDependencies['layer-compositor'].includes('editable-typography'));
const driftedGraph=structuredClone(graphPlan);
driftedGraph.shots[0].editableTypographyPlanAsset.sha256='0'.repeat(64);
const driftedShot=compileShotTaskWorkspaceV1(driftedGraph).production.shotIntelligence.currentStoryboardAuthority.shots[0];
assert.equal(driftedShot.packagingDecision.status,'BLOCKED','stale typography-plan binding fails closed');
assert.ok(driftedShot.packagingDecision.blockers.includes('PACKAGING_SOURCE_BINDING_INVALID'));

console.log(JSON.stringify({status:'PASS',cases:27,checks:[
  'locked bindings are unique and cover every exact-copy index',
  'duplicate exact wording is valid at distinct indexes',
  'UNRESOLVED blocks review admission',
  'NO_DESIGNED_COPY requires no text and no bindings',
  'NO_PACKAGE permits no layers only when copy, sources, effects, and motion are absent',
  'editable typography plans bind as code-native sources for distinct z-planes',
  'stale editable typography plan hashes block packaging review',
]},null,2));
