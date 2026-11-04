#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {normalizeMotionActorTrack} from "../lib/a1-motion-ir-parity-v1.js";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {deriveRepresentativeMotionPlacementGate} from "../apps/studio-next/src/lib/a1-package-video-placement-gate-v1.mjs";
import {derivePresenterPackagingComplexityGate} from "../apps/studio-next/src/lib/a1-presenter-packaging-complexity-gate-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const expectedWorkspaceSha256=process.argv[2];
if(!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256||"")))throw new Error("approved-master-motion-pilot-expected-workspace-sha-required");
const sha256=(value)=>crypto.createHash("sha256").update(Buffer.isBuffer(value)||typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const shotIds=["ED-10","ED-13","ED-14","ED-17","ED-31"];
const packageOnlyShotIds=["ED-10","ED-14","ED-17","ED-31"];
const fps=30;
const durationInFrames=105;
const directions={
  "ED-10":{mode:"FULLSCREEN_TYPOGRAPHY_IMPACT",semanticIntent:"完成度很高先成立，废稿以断裂式 verdict 收紧反差",tracks:{typography:{startFrame:5,endFrame:28,curve:"verdict-cut",from:{opacity:0,y:26,scale:.965,blur:2},to:{opacity:1,y:0,scale:1,blur:0}},"element-kit":{startFrame:18,endFrame:42,curve:"selection-snap",from:{opacity:0,scale:.92},to:{opacity:1,scale:1}}}},
  "ED-13":{mode:"SIMPLE_PRESENTER_CONTRAST_TITLE",semanticIntent:"人物保持主体，只以简单双标题强调顺滑改善与问题未彻底解决",semanticStructure:{kinds:["SIMPLE_CONTRAST_TITLE","LIGHT_MASK"],stepCount:1,relationshipCount:0,regionCount:1},route:{presentationMode:"OVERLAY",frameOccupation:"OVERLAY",baseVideoRelationship:"COEXIST_WITH_BASE_VIDEO",baseSubjectMustRemainVisible:true},stableReferenceMode:"SIMPLIFIED_PRESENTER_COMPOSITE",tracks:{typography:{startFrame:12,endFrame:38,curve:"selection-snap",from:{opacity:0,y:12,scale:.99},to:{opacity:1,y:0,scale:1}}}},
  "ED-14":{mode:"PACKAGE_ONLY_SOURCE_EVIDENCE_EXPLAINER",semanticIntent:"来源证据先锁定，再由结构元素解释多样性收窄",tracks:{illustration:{startFrame:0,endFrame:26,curve:"archive-settle",from:{opacity:0,x:-36,scale:.985,blur:2},to:{opacity:1,x:0,scale:1,blur:0}},"element-kit":{startFrame:16,endFrame:42,curve:"editorial-reveal",from:{opacity:0,x:28},to:{opacity:1,x:0}},typography:{startFrame:30,endFrame:50,curve:"selection-snap",from:{opacity:0,y:12},to:{opacity:1,y:0}}}},
  "ED-17":{mode:"PACKAGE_ONLY_CONCLUSION_EXPLAINER",semanticIntent:"材料、角度、动笔依次接力，最后收束为可控方法",tracks:{illustration:{startFrame:0,endFrame:28,curve:"archive-settle",from:{opacity:0,scale:1.045,blur:2},to:{opacity:1,scale:1,blur:0}},typography:{startFrame:18,endFrame:42,curve:"selection-snap",from:{opacity:0,y:22},to:{opacity:1,y:0}},"element-kit":{startFrame:34,endFrame:54,curve:"verdict-cut",from:{opacity:0,scale:.94},to:{opacity:1,scale:1}}}},
  "ED-31":{mode:"FULLSCREEN_WORKFLOW_TAKEOVER",semanticIntent:"整理、编排、读取、检查作为四步工作流切入全屏解释，结束后再回口播",semanticStructure:{kind:"MULTI_STEP_WORKFLOW",stepCount:4,relationshipCount:3,regionCount:4},requestedRoute:{presentationMode:"PRESENTER_INTEGRATED_LOOK_MASTER",frameOccupation:"OVERLAY",baseVideoRelationship:"COEXIST_WITH_BASE_VIDEO",baseSubjectMustRemainVisible:true},route:{presentationMode:"FULLSCREEN_EXPLAINER_TAKEOVER",frameOccupation:"FULL_FRAME_TAKEOVER",baseVideoRelationship:"TEMPORARY_FULL_FRAME_TAKEOVER",baseSubjectMustRemainVisible:false},stableReferenceMode:"SIMPLIFIED_PACKAGE_COMPOSITE",tracks:{"element-kit":{startFrame:8,endFrame:36,curve:"editorial-reveal",from:{opacity:0,x:-32,blur:2},to:{opacity:1,x:0,blur:0}},typography:{startFrame:22,endFrame:46,curve:"selection-snap",from:{opacity:0,y:-12,scale:.98},to:{opacity:1,y:0,scale:1}}}},
};
const fixed=(id,role)=>normalizeMotionActorTrack({id,role,semanticJob:"immutable-source-pixel-hold",startFrame:0,endFrame:1,curve:"quiet-hold",from:{opacity:1},to:{opacity:1}});

function historicalMeasuredBoundsForSameFrame(workspace,shotId,baseFrameSha256){
  const candidates=(workspace.production.shotIntelligence.packageLookMasterPlanHistory||[]).filter((item)=>item.shotId===shotId).map((item)=>item.videoContextReconciliation||item.videoContext).filter(Boolean);
  const bound=candidates.find((context)=>context.baseFrame?.sha256===baseFrameSha256&&context.subjectBounds?.status==="DECLARED_FROM_ACTUAL_HOLD_FRAME_REVIEW");
  return bound?.subjectBounds||null;
}

const result=await withProjectLock(appRoot,()=>{
  const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if(current.workspaceSha256!==expectedWorkspaceSha256)throw new Error(`approved-master-motion-pilot-workspace-cas-failed:${current.workspaceSha256}`);
  if(current.production.generation.summary.running!==0||current.production.generation.workerStatus!=="frozen"||current.production.generation.automaticDispatchAllowed!==false)throw new Error("approved-master-motion-pilot-frozen-runtime-required");
  const layerManifest=current.production.shotIntelligence.wholeFilmLayerReconstruction;
  if(layerManifest?.status!=="FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS"||layerManifest.packageCount!==13||layerManifest.layerCount!==52||layerManifest.failureCount!==0)throw new Error("approved-master-motion-pilot-whole-film-layer-pass-required");
  const ed13Kit=current.production.shotIntelligence.packageAssetKitPlans.find((entry)=>entry.shotId==="ED-13");
  const ed13Bounds=historicalMeasuredBoundsForSameFrame(current,"ED-13",ed13Kit?.videoContext?.baseFrame?.sha256);
  if(!ed13Bounds)throw new Error("approved-master-motion-ed13-measured-bounds-for-current-frame-required");
  const routeOverrides=Object.fromEntries(shotIds.map((shotId)=>[shotId,directions[shotId].route||null]).filter(([,value])=>value));
  const semanticContexts=Object.fromEntries(shotIds.map((shotId)=>[shotId,{semanticIntent:directions[shotId].semanticIntent,semanticStructure:directions[shotId].semanticStructure||null}]))
  const placementGate=deriveRepresentativeMotionPlacementGate(current,shotIds,{packageOnlyShotIds,routeOverrides,semanticContexts,subjectBoundsOverrides:{"ED-13":ed13Bounds}});
  if(placementGate.status!=="PASS")throw new Error(`approved-master-motion-placement-blocked:${placementGate.blockerShotIds.join(",")}`);
  const items=shotIds.map((shotId)=>layerManifest.items.find((item)=>item.shotId===shotId));
  if(items.some((item)=>!item||item.status!=="FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS"||item.layerCount!==4))throw new Error("approved-master-motion-selected-layer-items-invalid");
  const shotProps=items.map((item)=>{
    const direction=directions[item.shotId];
    const kit=current.production.shotIntelligence.packageAssetKitPlans.find((entry)=>entry.shotId===item.shotId);
    const layerBindings=Object.fromEntries(item.layers.map((layer)=>[layer.kind,{publicUrl:layer.publicUrl,sha256:layer.sha256}]));
    const simplePresenter=item.shotId==="ED-13";
    const simplifiedTakeover=item.shotId==="ED-31";
    const requestedComplexityGate=derivePresenterPackagingComplexityGate({...direction.requestedRoute,...direction,baseVisualCarrier:direction.requestedRoute?"PRESENTER_BASE":simplePresenter?"PRESENTER_BASE":null});
    const appliedComplexityGate=derivePresenterPackagingComplexityGate({...direction.route,...direction,baseVisualCarrier:simplePresenter?"PRESENTER_BASE":null});
    if(item.shotId==="ED-31"&&requestedComplexityGate.status!=="REROUTE_REQUIRED_FULL_FRAME_TAKEOVER")throw new Error("approved-master-motion-ed31-complex-overlay-must-reroute");
    if(!appliedComplexityGate.confirmed)throw new Error(`approved-master-motion-complexity-gate-blocked:${item.shotId}`);
    const actors=[];
    if(direction.tracks.background)actors.push(normalizeMotionActorTrack({id:"background",role:"approved-package-background",semanticJob:direction.semanticIntent,...direction.tracks.background}));else actors.push(fixed("background","approved-package-background"));
    for(const [actorId,track] of Object.entries(direction.tracks).filter(([id])=>id!=="background"))actors.push(normalizeMotionActorTrack({id:actorId,role:actorId==="typography"?"imagegen-typography-actor":actorId==="element-kit"?"semantic-mechanism-actor":"semantic-illustration-actor",semanticJob:direction.semanticIntent,...track}));
    const stableReferenceMode=direction.stableReferenceMode||"APPROVED_FINAL_COMPOSITE";
    if(stableReferenceMode==="APPROVED_FINAL_COMPOSITE")actors.push(normalizeMotionActorTrack({id:"final-lock",role:"approved-full-look-master-lock",semanticJob:"restore exact approved final composite for stable reading hold",startFrame:54,endFrame:66,curve:"quiet-hold",from:{opacity:0},to:{opacity:1}}));
    const scene={contract:"A1MotionIRScene/v2",sceneId:item.shotId,sourceMotionContract:"A1PackageLayerMotionDirector/v1",sourceAuthority:"whole-film-layer-actual-pixel-pass",reviewOnly:true,promotedRender:false,timing:{fps,frameStart:0,frameDuration:durationInFrames,duration:durationInFrames/fps},phases:{setup:{startFrame:0,endFrame:14},action:{startFrame:14,endFrame:54},lock:{startFrame:54,endFrame:66},stableReadingHold:{startFrame:66,endFrame:96},handoff:{startFrame:97,endFrame:104}},kineticText:{source:"APPROVED_IMAGEGEN_MASTER_PIXELS",localRetypesetting:false},textMotion:{operation:"IN_PLACE_REVEAL_OR_MASK_SAFE_TRANSFORM",constraints:["NO_LOCAL_RETYPESETTING","NO_FREE_DECORATIVE_LINE","MAX_TRANSLATION_36PX"]},actors,sourceLayerManifestSha256:layerManifest.manifestSha256,placementGate:placementGate.items.find((entry)=>entry.shotId===item.shotId),presenterPackagingComplexity:{requested:requestedComplexityGate,applied:appliedComplexityGate}};
    const illustration=layerBindings.ILLUSTRATION;
    const selectedLayers=simplePresenter?{TYPOGRAPHY:layerBindings.TYPOGRAPHY}:simplifiedTakeover?{BACKGROUND:layerBindings.BACKGROUND,ELEMENT_KIT:layerBindings.ELEMENT_KIT,TYPOGRAPHY:layerBindings.TYPOGRAPHY}:layerBindings;
    return {shotId:item.shotId,durationInFrames,mode:direction.mode,semanticIntent:direction.semanticIntent,baseFrame:simplePresenter?kit.videoContext.baseFrame:null,sourceBaseFrame:simplePresenter?kit.videoContext.baseFrame:null,finalComposite:stableReferenceMode==="APPROVED_FINAL_COMPOSITE"?{publicUrl:item.recomposed.publicUrl,sha256:item.recomposed.sha256}:null,stableReferenceMode,layers:selectedLayers,cutouts:null,motionIrScene:scene};
  });
  const propsBody={contract:"A1ApprovedMasterLayerMotionPilotProps/v1",reviewOnly:true,promotedRender:false,fps,overlapInFrames:6,shots:shotProps};
  const props={...propsBody,propsSha256:sha256(propsBody)};
  const durationInFramesTotal=shotProps.length*durationInFrames-props.overlapInFrames*(shotProps.length-1);
  const now=new Date().toISOString();
  const planBody={contract:"A1ApprovedMasterLayerMotionPilotPlan/v1",status:"PLAN_READY_REVIEW_ONLY",reviewOnly:true,promotedRender:false,structuralRevisionRound:2,structuralRevisionLimit:2,policyRevision:"PRESENTER_SEMANTIC_COMPLEXITY_HARD_GATE_V1",revisionReason:"ED-31_COMPLEX_WORKFLOW_REROUTED_FULL_FRAME_AND_ED-13_SIMPLIFIED_PRESENTER_TITLE",sourceWorkspaceSha256:current.workspaceSha256,sourceBoardSha256:current.production.shotIntelligence.wholeFilmStaticBoard.sha256,sourceLayerManifestSha256:layerManifest.manifestSha256,fps,shotDurationInFrames:durationInFrames,overlapInFrames:props.overlapInFrames,durationInFrames:durationInFramesTotal,durationMs:Math.round(durationInFramesTotal/fps*1000),shotIds,modes:Object.fromEntries(shotProps.map((shot)=>[shot.shotId,shot.mode])),semanticIntents:Object.fromEntries(shotProps.map((shot)=>[shot.shotId,shot.semanticIntent])),placementGate,propsSha256:props.propsSha256,renderer:{formal:"remotion",compositionId:"A1ApprovedMasterLayerMotionPilotV1",width:1920,height:1080,reviewScale:.5},gates:{representativeRenderAllowed:true,wholeFilmMotionAllowed:false,finalRenderAllowed:false},generatedAt:now};
  const plan={...planBody,planSha256:sha256({...planBody,generatedAt:undefined})};
  let next=structuredClone(current);
  const priorPilot=current.production.shotIntelligence.representativeApprovedMasterMotionPilot||null;
  const supersededPreviews=[...(priorPilot?.supersededPreviews||[]),...(priorPilot?.video?[{status:"SUPERSEDED_BY_PRESENTER_SEMANTIC_COMPLEXITY_HARD_GATE_V1",video:priorPilot.video,planSha256:priorPilot.planSha256||null,reportSha256:priorPilot.reportSha256||null,supersededAt:now}]:[])];
  next.production.shotIntelligence.representativeApprovedMasterMotionPilot={contract:plan.contract,status:plan.status,planSha256:plan.planSha256,propsSha256:props.propsSha256,shotIds,durationMs:plan.durationMs,placementGate,reviewOnly:true,promotedRender:false,wholeFilmMotionAllowed:false,supersededPreviews,publicUrl:"/generated/system-line/editorial-asset-workbench-v1/approved-master-layer-motion-pilot-v2/plan.json",updatedAt:now};
  next.production.motion={...next.production.motion,status:"representative-preview-required",representativePlan:{contract:plan.contract,sha256:plan.planSha256,shotIds,durationMs:plan.durationMs,reviewOnly:true},fullMotionAllowed:false,motionApproved:false,aeLevelProven:false,updatedAt:now};
  next.production.assembly={...next.production.assembly,productionWired:false,userVisualApproval:"NOT_APPROVED"};
  next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,now));
  const event=createProductionEvent({workspace:current,action:"compile-approved-master-layer-motion-pilot",targetId:shotIds.join(","),payload:{planSha256:plan.planSha256,propsSha256:props.propsSha256,durationMs:plan.durationMs,placementGateStatus:placementGate.status,reviewOnly:true},now});
  next.production.eventLedger.eventCount+=1;next.production.eventLedger.lastEventId=event.eventId;next.production.eventLedger.lastEventAt=event.createdAt;
  const committed=persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:current.workspaceSha256,commitId:`approved-master-motion-plan-${now.replace(/[-:.TZ]/gu,"").slice(0,14)}`,files:{"approved-master-layer-motion-pilot-v2/plan.json":plan,"approved-master-layer-motion-pilot-v2/input-props.json":props}});
  return{status:plan.status,workspaceSha256Before:current.workspaceSha256,workspaceSha256After:committed.workspaceSha256,transitionSha256:committed.transitionSha256,layerManifestSha256:layerManifest.manifestSha256,planSha256:plan.planSha256,propsSha256:props.propsSha256,shotIds,durationMs:plan.durationMs,placementGate:placementGate.status,wholeFilmMotionAllowed:false};
});
console.log(JSON.stringify(result,null,2));
