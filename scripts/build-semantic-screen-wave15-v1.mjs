#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileScreenActionDirectionV2} from "../apps/studio-next/src/lib/a1-screen-action-direction-v2.mjs";
import {directScreenDemoMotion} from "../apps/studio-next/src/lib/a1-screen-demo-motion-director-v1.mjs";

const root=path.resolve(import.meta.dirname,".."),sourcePlanPath=path.join(root,"work/remotion-screen-coverage-wave15-v1/plan.json"),sourcePlan=JSON.parse(fs.readFileSync(sourcePlanPath,"utf8")),workspace=JSON.parse(fs.readFileSync(path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"),"utf8")),approvedMasters=workspace.production.motion.screenMotionMaturityMasters,outputRoot=path.join(root,"work/semantic-screen-wave15-v1"),sha=(value)=>crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");
if(sourcePlan.status!=="READY"||sourcePlan.items.length!==15)throw new Error("current-screen-wave15-plan-required");
if(approvedMasters?.status!=="USER_APPROVED_FOR_WAVE15_REBUILD"||approvedMasters?.decision?.decision!=="APPROVE")throw new Error("approved-semantic-motion-masters-required");
fs.mkdirSync(outputRoot,{recursive:true});
const semanticFor=(item,actor)=>actor?.kind==="SOURCE_BOUND_CIRCLE"?"TEXT_ATTENTION":["GAP_EXPANSION","RESULT_PANEL_REVEAL"].includes(item.directorFamily)?"FORM_SUBMIT":"READ_ONLY";
const normalizeRect=(rect,report)=>rect&&report?.output?.width&&report?.output?.height?{x:rect.x/report.output.width,y:rect.y/report.output.height,width:rect.width/report.output.width,height:rect.height/report.output.height}:null;
const scenes=[],items=[];
for(const [index,item] of sourcePlan.items.entries()){
  const baseProps=JSON.parse(fs.readFileSync(path.join(root,item.propsPath),"utf8")),scene=structuredClone(baseProps.scenes[0]),report=JSON.parse(fs.readFileSync(path.join(root,item.sourceReport),"utf8")),actor=scene.screenDirection.attentionActors?.[0]||null,durationMs=scene.durationMs,semanticAction=semanticFor(item,actor),persistentResult=report.persistentResultDom?.status==="PASS",verifiedRegion=actor?.geometry||normalizeRect(report.persistentResultDom?.finalRect,report),nativeEmphasis=Boolean((report.textRangeEvidence||[]).some((entry)=>entry.qualification?.reasons?.includes("SOURCE_NATIVE_SELECTION_ALREADY_EMPHATIC"))),decision=directScreenDemoMotion({semanticAction,verifiedTarget:Boolean(verifiedRegion),nativeEmphasis,persistentResult,durationMs});
  if(decision.status!=="PASS")throw new Error(`semantic-wave15-director:${item.shotId}:${decision.failures.join(",")}`);
  let direction;
  if(decision.presentation==="CLEAN_HOLD")direction=compileScreenActionDirectionV2({shotId:`SEMANTIC-WAVE15-${item.shotId}`,durationMs,fps:60,resultHoldStartMs:durationMs-decision.profile.minimumResultHoldMs,requestedScale:1,motionProfile:decision.profile});
  if(decision.presentation==="SEMANTIC_PUSH"){
    if(!verifiedRegion)throw new Error(`semantic-wave15-push-region:${item.shotId}`);
    const actionAtMs=Number(actor?.evidenceAtMs??report.persistentResultDom?.firstObservedAtMs??durationMs-decision.profile.minimumResultHoldMs);
    direction=compileScreenActionDirectionV2({shotId:`SEMANTIC-WAVE15-${item.shotId}`,durationMs,fps:60,actionAtMs,actionRegion:verifiedRegion,resultHoldStartMs:durationMs-decision.profile.minimumResultHoldMs,requestedScale:decision.profile.requestedScale,motionProfile:decision.profile});
  }
  if(decision.presentation==="SOURCE_ANNOTATION"){
    if(actor?.kind!=="SOURCE_BOUND_CIRCLE")throw new Error(`semantic-wave15-annotation-actor:${item.shotId}`);
    const enterMs=Math.max(200,Number(actor.evidenceAtMs||0)),peakMs=enterMs+decision.profile.annotationEnterMs,holdEndMs=peakMs+decision.profile.annotationHoldMs,exitEndMs=holdEndMs+decision.profile.annotationExitMs,retimedActor={...actor,phases:{enterMs,peakMs,holdEndMs,exitEndMs}};
    direction=compileScreenActionDirectionV2({shotId:`SEMANTIC-WAVE15-${item.shotId}`,durationMs,fps:60,actionAtMs:actor.evidenceAtMs,attentionActors:[retimedActor],resultHoldStartMs:durationMs-decision.profile.minimumResultHoldMs,requestedScale:1,motionProfile:decision.profile});
  }
  if(direction?.status!=="PASS")throw new Error(`semantic-wave15-direction:${item.shotId}:${direction?.failures?.join(",")}`);
  scene.shotId=`SEMANTIC-WAVE15-${item.shotId}`;scene.screenDirection=direction;scene.pointerTrack=null;scene.cameraTrack=[];scene.editCoverage={mode:decision.presentation,fullSourceActionShown:true};scenes.push(scene);
  items.push({shotId:item.shotId,order:index+1,directorFamily:item.directorFamily,semanticAction,presentation:decision.presentation,reason:decision.reason,decisionSha256:decision.decisionSha256,directionSha256:direction.directionSha256,sourceSha256:item.sourceSha256,sourceVideoUri:scene.sourceVideoUri,durationMs,moveDurationMs:direction.cameraPerformance.motionWindow?.durationMs||0,resultHoldMs:direction.diagnostics.resultHoldMs,curveId:direction.cameraPerformance.curve.id,actorKinds:direction.motionSignal.actorMotionKinds});
}
const props={contract:"A1ContinuousScreenEvidenceReel/v2",width:960,height:540,fps:60,audioUri:JSON.parse(fs.readFileSync(path.join(root,sourcePlan.items[0].propsPath),"utf8")).audioUri,scenes,showReviewLabels:false,boundaryTransitionFrames:0},propsPath=path.join(outputRoot,"semantic-screen-wave15-props.json");fs.writeFileSync(propsPath,`${JSON.stringify(props,null,2)}\n`);
const counts=items.reduce((acc,item)=>({...acc,[item.presentation]:(acc[item.presentation]||0)+1}),{}),body={contract:"A1SemanticScreenWave15Plan/v1",status:"READY_FOR_REVIEW_RENDER",sourcePlanSha256:sourcePlan.planSha256,approvedMasterDecisionSha256:approvedMasters.decision.decisionSha256,counts,items,props:{path:path.relative(root,propsPath),sha256:sha(fs.readFileSync(propsPath))},policy:{storyboardSemanticsBeforeMotion:true,defaultPresentation:"CLEAN_HOLD",maximumCameraMovesPerShot:1,minimumReadableResultHoldMs:1200,hardCutsOnly:true,motionSpecAllowed:false,productionAdmission:false},boundary:{reviewOnly:true,userVisualApproval:"NOT_APPROVED",motionSpecAllowed:false,productionAdmission:false}};body.planSha256=sha(body);fs.writeFileSync(path.join(outputRoot,"plan.json"),`${JSON.stringify(body,null,2)}\n`);console.log(JSON.stringify({status:body.status,counts,planSha256:body.planSha256,items:items.map(({shotId,presentation,reason})=>({shotId,presentation,reason}))},null,2));
