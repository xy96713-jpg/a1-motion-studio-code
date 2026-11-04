#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileTypographyCompositionV1} from "../apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs";
import {normalizeTypographyShotVisualContextV1, typographyBoxesIntersectV1, typographyShotContextFromVideoPackagingV1} from "../apps/studio-next/src/lib/a1-typography-shot-context-v1.mjs";

const frameSha = "a".repeat(64);
const context = (personOnLeft) => ({
  contract: "A1TypographyShotVisualContext/v1",
  carrierMode: "FOOTAGE",
  frame: {sha256: frameSha, width: 1920, height: 1080},
  geometryEvidence: {method: "MANUAL_PIXEL_REVIEW", frameSha256: frameSha},
  protectedRegions: [{id: "person", box: {x: personOnLeft ? .04 : .57, y: .1, width: .39, height: .8}}],
  availableRegions: [{id: "quiet", box: {x: personOnLeft ? .55 : .05, y: .15, width: .4, height: .65}, visualSuitability: .9}],
  anchors: [],
});
const input = {typographyRole: "PRESENTER_HERO", semanticEvent: "IDENTITY", effectDisplayGroups: ["開始", "創作"]};
const left = compileTypographyCompositionV1({...input, shotVisualContext: context(true)});
const right = compileTypographyCompositionV1({...input, shotVisualContext: context(false)});
assert.notDeepEqual(left.groups.map((g) => g.box), right.groups.map((g) => g.box), "opposite protected geometry must move the typography");
assert.ok(left.groups.every((g) => g.box.x > .5));
assert.ok(right.groups.every((g) => g.box.x + g.box.width < .5));
for(const mode of ["EVIDENCE_ESSAY","PRODUCT_TUTORIAL","LONG_TAKE_OPINION"]){
  for(const personOnLeft of [true,false]){
    const c=context(personOnLeft);
    const plan=compileTypographyCompositionV1({...input,programMode:mode,shotVisualContext:c});
    assert.equal(plan.status,"PASS_REVIEW_ONLY");
    assert.ok(plan.groups.every((g)=>c.protectedRegions.every((p)=>!typographyBoxesIntersectV1(g.box,p.box,c.safetyPadding??.012))));
    assert.equal(plan.layoutContext.temporalSafetyVerified,false);
    assert.equal(plan.productionAdmission,false);
  }
}
const original=compileTypographyCompositionV1(input);
assert.deepEqual(original.groups.map((g)=>g.box),[{x:.13,y:.25,width:.58,height:.16},{x:.05,y:.48,width:.9,height:.28}]);
assert.equal(original.layoutContext,undefined,"legacy output must remain compatible");
const missing=compileTypographyCompositionV1({...input,requireShotVisualContext:true});
assert.equal(missing.status,"BLOCK");
assert.equal(missing.groups.length,0,"missing context must not emit unsafe legacy positions");
const crowded=context(true);
crowded.availableRegions=[{id:"on-person",box:{x:.08,y:.2,width:.3,height:.3}}];
const blocked=compileTypographyCompositionV1({...input,shotVisualContext:crowded});
assert.equal(blocked.status,"BLOCK");
assert.equal(blocked.groups.length,0);
assert.equal(blocked.layoutContext.rejectedCandidates[0].reason,"PROTECTED_REGION_COLLISION");
const tiny=context(true);
tiny.availableRegions=[{id:"tiny",box:{x:.6,y:.2,width:.04,height:.04}}];
assert.equal(compileTypographyCompositionV1({...input,shotVisualContext:tiny}).status,"BLOCK");
assert.throws(()=>normalizeTypographyShotVisualContextV1({...context(true),frame:{width:0,height:1080,sha256:frameSha}}),/frame-size/u);
const invalid=context(true);
invalid.availableRegions[0].box.x=NaN;
assert.throws(()=>normalizeTypographyShotVisualContextV1(invalid),/invalid-box/u);
assert.throws(()=>normalizeTypographyShotVisualContextV1({...context(true),geometryEvidence:{method:"MANUAL",frameSha256:"b".repeat(64)}}),/frame-evidence/u);
const objectContext=context(true);
objectContext.protectedRegions=[];
objectContext.availableRegions=[{id:"left",box:{x:.05,y:.2,width:.35,height:.3}},{id:"right",box:{x:.6,y:.2,width:.35,height:.3}}];
objectContext.anchors=[{id:"object",box:{x:.83,y:.53,width:.1,height:.1}}];
objectContext.selectedAnchorId="object";
const objectPlan=compileTypographyCompositionV1({typographyRole:"OBJECT_ATTACHED_LABEL",effectDisplayGroups:["接口"],shotVisualContext:objectContext});
assert.equal(objectPlan.layoutContext.selectedRegionId,"right");
assert.equal(objectPlan.layoutContext.placementMethod,"SOURCE_ANCHOR_REGION_LOCKUP");
assert.equal(compileTypographyCompositionV1({typographyRole:"OBJECT_SURFACE_TYPE",effectDisplayGroups:["接口"],shotVisualContext:objectContext}).status,"BLOCK");
assert.equal(compileTypographyCompositionV1({typographyRole:"OBJECT_ATTACHED_LABEL",effectDisplayGroups:["接口"],shotVisualContext:context(true)}).status,"BLOCK");
const adapted=typographyShotContextFromVideoPackagingV1({baseFrame:context(true).frame,subjectBounds:{x:.05,y:.1,width:.3,height:.8,status:"DECLARED_FROM_SOURCE_BOUND_SCENE_GRAPH"},safeZones:[],availableRegions:[{id:"right",x:.55,y:.15,width:.4,height:.65}]});
assert.equal(adapted.frame.sha256,frameSha);
assert.equal(adapted.geometryEvidence.method,"DECLARED_FROM_SOURCE_BOUND_SCENE_GRAPH");
assert.equal(typographyShotContextFromVideoPackagingV1({}),null);
console.log(JSON.stringify({status:"PASS",checks:["six-geometry-cases-three-genres","opposite-source-regions","legacy-compatibility","no-safe-area-blocks","readability-floor","invalid-context-rejection","source-sha-binding","object-anchor","surface-warp-no-fake-fallback","existing-video-context-adapter"],productionAdmission:false},null,2));
