#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileScreenPostEditReceipt,compileScreenSourceBehaviorManifestFromStoryboardShot,toSourceBehaviorFidelityInput} from "../apps/studio-next/src/lib/a1-screen-source-behavior-manifest-v1.mjs";
import {auditSourceBehaviorFidelity} from "../apps/studio-next/src/lib/a1-source-behavior-fidelity-v1.mjs";

const fixture=(shotId)=>({shotId,versionId:`${shotId.toLowerCase()}-v1`,route:"SCREEN_EVIDENCE",actionContract:{before:"before",hold:"perform action",after:"result"},motionReviewPlan:{capturedSource:{exists:true,shaMatches:true,sha256:"a".repeat(64),durationMs:5000,width:2560,height:1440,fps:"60/1"}},screenStoryboard:{actionId:"fixture-action",causalPlan:{status:"PASS",actionCount:1,actions:[{name:"native_action",solvedMs:1800},{name:"result_hold",solvedMs:3200}]},frames:{setup:{sha256:"b".repeat(64),timeMs:200},action:{sha256:"c".repeat(64),timeMs:1900},result:{sha256:"d".repeat(64),timeMs:3400}},presentationPolicy:{telemetryRetainedForTimingOnly:true,clickRingsAllowed:false},cameraDirection:{resultTargetAdmission:{status:"PASS",sha:"e".repeat(64),cameraTarget:{semanticSource:"DOM_VERIFIED_RESULT",persistenceProof:"DOM_FINAL_HOLD_VERIFICATION"}}}}});

const ids=["manifest-product-tutorial","manifest-evidence-explainer","manifest-personal-opinion"];
for(const id of ids){
  const manifest=compileScreenSourceBehaviorManifestFromStoryboardShot(fixture(id));
  assert.equal(manifest.behavior.eventOrder.join(","),"native_action,result_hold");
  assert.equal(manifest.behavior.nativeActionCount,1);
  assert.equal(manifest.behavior.finalStateFirstVisibleMs,3200);
  assert.equal(manifest.behaviorManifestSha256.length,64);
  const edit=compileScreenPostEditReceipt(manifest,{appliedEffects:["SEMANTIC_ZOOM","RESULT_HOLD_EXTENSION"]});
  const fidelity=auditSourceBehaviorFidelity(toSourceBehaviorFidelityInput(manifest,edit));
  assert.equal(fidelity.status,"PASS");
}
assert.throws(()=>compileScreenSourceBehaviorManifestFromStoryboardShot({...fixture("bad"),motionReviewPlan:{capturedSource:{exists:true,shaMatches:false}}}),/verified-capture-required/u);
const manifest=compileScreenSourceBehaviorManifestFromStoryboardShot(fixture("geometry"));
assert.throws(()=>compileScreenPostEditReceipt({...manifest,evidence:{...manifest.evidence,geometryProofSha256:null}},{appliedEffects:["SEMANTIC_ZOOM"]}),/geometry-proof-required/u);
console.log(JSON.stringify({contract:"A1ScreenSourceBehaviorManifestTest/v1",status:"PASS",fixtureCount:ids.length,hashBound:true,eventOrderCanonical:true,postEditReceiptBound:true,fidelityGatePassed:true,missingSourceRejected:true,missingGeometryRejected:true},null,2));
