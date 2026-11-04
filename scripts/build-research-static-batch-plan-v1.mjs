import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readGlobalDirectorContextV1} from '../apps/studio-next/src/lib/a1-director-production-plan-v1.mjs';

const [taskId,inventoryName,outputName='batch-plan']=process.argv.slice(2);
if(![taskId,inventoryName,outputName].every(v=>/^[a-z0-9][a-z0-9-]{0,95}$/.test(v||'')))throw Error('STATIC_BATCH_SELECTORS_REQUIRED');
const root=fs.realpathSync(process.cwd()),taskRoot=path.join(root,'work',taskId),directory=path.join(taskRoot,inventoryName);
const hash=b=>createHash('sha256').update(b).digest('hex');
const planBytes=fs.readFileSync(path.join(taskRoot,'shot-task-plan-v1.json')),plan=JSON.parse(planBytes);
const inventoryBytes=fs.readFileSync(path.join(directory,'inventory.json')),inventory=JSON.parse(inventoryBytes);
const manifestBytes=fs.readFileSync(path.join(taskRoot,'research-task-manifest-v1.json'));
if(plan.projectId!==taskId||plan.scope!=='RESEARCH_ONLY'||plan.productionAdmission!==false
  ||inventory.contract!=='A1ResearchStaticInventory/v1'||inventory.taskId!==taskId||inventory.inputPlanSha256!==hash(planBytes)
  ||inventory.manifestFileSha256!==hash(manifestBytes)||inventory.shots.length!==plan.shots.length
  ||inventory.shots.some((s,i)=>s.shotId!==plan.shots[i].id))throw Error('STATIC_BATCH_CURRENT_INPUT_REQUIRED');
const director=readGlobalDirectorContextV1(root,plan);
if(!director?.groups?.length||director.groups.flatMap(g=>g.shotIds).some((id,i)=>id!==plan.shots[i]?.id)
  ||director.groups.flatMap(g=>g.shotIds).length!==plan.shots.length)throw Error('STATIC_BATCH_WHOLE_STORY_REQUIRED');
const records=new Map(inventory.shots.map(s=>[s.shotId,s]));
const mainPass=s=>s.currentGoal&&s.previousReviewStatus==='PASS'&&!s.coreOnly;
const groups=director.groups.map((g,index)=>({order:index+1,viewerTask:g.viewerTask,visualFamily:g.visualFamily,
  actor:g.actor,action:g.action,handoff:g.handoff,sourceNeeds:g.sourceNeeds,sourceUncertainties:g.sourceUncertainties,
  retainedMainFrames:g.shotIds.filter(id=>mainPass(records.get(id))),
  pendingMainFrames:g.shotIds.filter(id=>!mainPass(records.get(id))).map(shotId=>{const item=records.get(shotId),shot=plan.shots.find(s=>s.id===shotId);
    return {shotId,route:item.image&&!item.coreOnly?'REVIEW_EXISTING_BEFORE_REMAKING':'COMPLETE_FRAME_REQUIRED',coreOnly:item.coreOnly,
      reference:item.reference,existingCandidateId:item.candidateId,existingImage:item.image,
      lockedCopy:shot.exactCopy,viewerTask:director.shots.find(s=>s.shotId===shotId).viewerTask,
      requiresActualSourceAndPixelReview:true};}),
  supplementalStateReview:g.shotIds.flatMap(shotId=>{const shot=plan.shots.find(s=>s.id===shotId);
    return (shot.referenceProductionDesign?.references||[]).filter(r=>r.state!=='HOLD').map(r=>({shotId,state:r.state,sourceFrame:r.sourceFrame,wholeShotApproved:false}));})}));
const pending=groups.flatMap(g=>g.pendingMainFrames),retained=groups.flatMap(g=>g.retainedMainFrames);
if(pending.length+retained.length!==plan.shots.length||new Set([...pending.map(s=>s.shotId),...retained]).size!==plan.shots.length)throw Error('STATIC_BATCH_DUTY_LOST');
const output={contract:'A1DerivedWholeFilmStaticBatchPlan/v1',taskId,generatedAt:new Date().toISOString(),
  inputs:{planSha256:hash(planBytes),manifestSha256:hash(manifestBytes),inventorySha256:hash(inventoryBytes),globalDesign:plan.globalDesign},
  counts:{shots:plan.shots.length,groups:groups.length,currentGoalMainFrames:retained.length,pendingMainFrames:pending.length,
    missingCompleteImages:pending.filter(s=>s.route==='COMPLETE_FRAME_REQUIRED').length,coreOnlyFrames:pending.filter(s=>s.coreOnly).length,
    existingFramesToReview:pending.filter(s=>s.route==='REVIEW_EXISTING_BEFORE_REMAKING').length},
  executionPolicy:{sourceOrder:true,reuseBeforeGeneration:true,maximumConcurrentRealWork:2,dispatchAuthorized:false,
    nextStage:'COMPLETE_ALL_MAIN_FRAMES_THEN_REVIEW_CHANGED_STATES_AND_WHOLE_BOARD',wholeShotApproved:false,productionAdmission:false,visualApproval:false},groups};
if(!fs.readFileSync(path.join(taskRoot,'shot-task-plan-v1.json')).equals(planBytes)
  ||!fs.readFileSync(path.join(taskRoot,'research-task-manifest-v1.json')).equals(manifestBytes))throw Error('STATIC_BATCH_INPUT_CHANGED');
fs.writeFileSync(path.join(directory,outputName+'.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({contract:output.contract,counts:output.counts,output:path.relative(root,path.join(directory,outputName+'.json'))}));
