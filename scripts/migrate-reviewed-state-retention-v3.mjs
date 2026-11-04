#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {readShotTaskRuntimeV1,syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {withProjectLock} from '../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs';
import {assertNoActiveProductionMutationV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {productionFrameGoalShaV1,productionFrameUnretainedGoalInputV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {migrateReviewedRetainedStateGoalV3,rebaseReviewedRetainedStateGoalV3} from '../apps/studio-next/src/lib/a1-production-state-retention-migration-v1.mjs';

const args=process.argv.slice(2),value=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const taskId=value('--task'),targets=(value('--targets')||'').split(',').filter(Boolean),apply=args.includes('--apply'),expected=value('--expected-plan-sha');
if(!/^[a-z0-9][a-z0-9-]{0,95}$/.test(taskId||'')||!targets.length||targets.length>12||new Set(targets).size!==targets.length
  ||targets.some(target=>!/^[A-Z0-9-]+:(ENTRY|HOLD|HANDOFF)$/.test(target))||apply&&!/^[a-f0-9]{64}$/.test(expected||''))
  throw Error('Usage: --task TASK --targets SHOT:STATE[,SHOT:STATE] [--apply --expected-plan-sha SHA]');
const root=fs.realpathSync('.'),runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});
if(runtime.pending)throw Error('STATE_RETENTION_MIGRATION_PLAN_NOT_SYNCED');
const registry=JSON.parse(fs.readFileSync(path.join(runtime.taskRoot,'candidate-registry-v1.json'))),next=structuredClone(runtime.plan),migrations=[];
for(const target of targets){
  const [shotId,state]=target.split(':'),shot=next.shots.find(value=>value.id===shotId),proof=shot?.retainedStaticStateGoals?.[state];
  const rawGoalSha256=shot?nodeInputHash(productionFrameUnretainedGoalInputV1(next,shot,state)):null;
  const reviewedGoalSha256=proof?.dependencyVersion===3?rawGoalSha256:proof?.goalInputSha256;
  const candidate=registry.entries.findLast(entry=>entry.sequenceIds?.length===1&&entry.sequenceIds[0]===shotId
    &&entry.wholeAnchorPASS===true&&entry.localReview?.status==='PASS'&&entry.productionAdmission===false
    &&entry.goalInputSha256===reviewedGoalSha256&&entry.wholeFrameQualification?.state===state);
  if(!shot||!candidate)throw Error('STATE_RETENTION_MIGRATION_TARGET_UNREVIEWED:'+target);
  const beforeGoal=productionFrameGoalShaV1(next,shot,state),beforeVersion=proof.dependencyVersion;
  shot.retainedStaticStateGoals[state]=proof.dependencyVersion===3
    ?rebaseReviewedRetainedStateGoalV3({repoRoot:root,plan:next,workflow:runtime.workflow,shot,state,candidate})
    :migrateReviewedRetainedStateGoalV3({repoRoot:root,plan:next,shot,state,candidate});
  const afterGoal=productionFrameGoalShaV1(next,shot,state);
  if(afterGoal!==candidate.goalInputSha256)throw Error('STATE_RETENTION_MIGRATION_GOAL_NOT_RESTORED:'+target);
  migrations.push({target,candidateId:candidate.id,beforeVersion,beforeGoal,afterVersion:3,afterGoal,imageSha256:candidate.wholeFrameQualification.imageSha256});
}
const beforePlanSha256=nodeInputHash(runtime.plan),afterPlanSha256=nodeInputHash(next);
if(apply){
  if(beforePlanSha256!==expected)throw Error('STATE_RETENTION_MIGRATION_EXPECTED_PLAN_CHANGED');
  withProjectLock(runtime.appRoot,()=>{
    assertNoActiveProductionMutationV1({repoRoot:root,taskId});
    const current=JSON.parse(fs.readFileSync(runtime.planPath));
    if(nodeInputHash(current)!==expected)throw Error('STATE_RETENTION_MIGRATION_PLAN_CHANGED');
    const temp=runtime.planPath+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(next,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,runtime.planPath);
  });
  const synced=syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:afterPlanSha256});
  if(synced.inputPlanSha256!==afterPlanSha256)throw Error('STATE_RETENTION_MIGRATION_SYNC_FAILED');
}
console.log(JSON.stringify({status:apply?'APPLIED':'DRY_RUN',taskId,beforePlanSha256,afterPlanSha256,migrations,providerCalls:0,newVisualReviews:0,productionAdmission:false},null,2));
