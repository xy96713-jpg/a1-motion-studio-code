#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {resolveActiveWorkSelectionV1} from '../apps/studio-next/src/lib/a1-active-work-selection-v1.mjs';

const root=path.resolve(import.meta.dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const parkRecord=read('work/system-maturity-consolidation-park-a-line-20260928.json');
const selection=resolveActiveWorkSelectionV1({parkRecord,researchPhase:read('.codex-artifacts/system-progress/current-phase.json'),formalPhase:read('.codex-artifacts/system-progress-system-line/current-phase.json'),
  planExists:fs.existsSync(path.join(root,parkRecord.activeLine.planPath)),runtimeExists:fs.existsSync(path.join(root,parkRecord.activeLine.runtimeStatePath))});
if(selection.status!=='PASS'||!selection.active)throw Error('ACTIVE_SYSTEM_LINE_SELECTION_BLOCKED:'+selection.failures.join(','));
const researchChecks=[
  ['workspace-isolation','npm',['run','--silent','audit:workspace-line-isolation']],
  ['inherited-h-baseline','npm',['run','--silent','audit:system-line-inherited-h-baseline']],
  ['h-visual-master','npm',['run','--silent','audit:h-series-visual-master-contract']],
  ['execution-status','npm',['run','--silent','test:execution-status-v1']],
  ['workbench-summary','npm',['run','--silent','test:editorial-asset-workbench-summary-v1']],
  ['current-authority','npm',['run','--silent','test:quick-storyboard-current-authority-v1']],
  ['browser','npm',['run','--silent','audit:quick-storyboard-browser-v1']],
  ['research-plan-capacity','node',['scripts/test-research-production-plan-capacity-v1.mjs']],
  ['state-retention','node',['scripts/test-production-state-retention-v1.mjs']],
  ['state-retention-migration','node',['scripts/test-production-state-retention-migration-v1.mjs']],
  ['state-binding','node',['scripts/test-full-frame-binding-state-preservation-v1.mjs']],
  ['whole-frame-qualification','node',['scripts/test-production-whole-frame-qualification-v1.mjs']],
  ['pinterest-taste','npm',['run','--silent','test:pinterest-taste-profile-v1']],
  ['retro-pixel-sequence','npm',['run','--silent','test:retro-pixel-editorial-sequence-audit-v1']],
];
const formalChecks=['test:generated-visual-surface-policy','test:treatment-batch-critic-v1','test:system-line-performance-v1','test:execution-status-v1','test:editorial-asset-workbench-summary-v1','test:quick-storyboard-current-authority-v1','audit:quick-storyboard-browser-v1','test:dirty-set-v1','test:bounded-history-retention-v1','test:content-addressed-media-v1','test:generation-content-addressed-admission-v1','test:package-visual-review-process-boundary-v1','test:pinterest-taste-profile-v1','test:retro-pixel-editorial-sequence-audit-v1','test:packaging-paragraph-objective-pixel-audit-v1','test:packaging-paragraph-visual-director-assessment-v1','test:packaging-paragraph-canary-lifecycle-v1','test:packaging-paragraph-auto-review-v1','test:shot-presentation-system-v1','test:editorial-shot-director-v1','test:source-presentation-routing-v1','audit:source-presentation-routes-v1','audit:editorial-shot-director-static-board-v1','test:presentation-renderer-executors-v1','test:editorial-packaging-boundary-v1','test:packaging-selector-policy-v1','test:packaging-production-authority-v1','audit:automation-state-consistency-v1','audit:system-line-current-authority','audit:system-line-performance-v1','audit:article-packaging-automatic-qa-v1','audit:current-static-board-readiness-v1'];
const checks=selection.active.taskId==='hupo-69-shot-reconstruction-v1'?researchChecks:formalChecks.map(name=>[name,'npm',['run','--silent',name]]);
const results=[];
for(const [id,command,args] of checks){
  try{const output=execFileSync(command,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024});results.push({id,status:'PASS',outputTail:output.trim().split('\n').slice(-1)[0]||null});}
  catch(error){const stderr=String(error.stderr||''),stdout=String(error.stdout||'');results.push({id,status:'FAIL',outputTail:(stderr||stdout).trim().split('\n').slice(-12).join('\n')});break;}
}
if(selection.active.taskId==='hupo-69-shot-reconstruction-v1'&&results.every(value=>value.status==='PASS')){
  const output=execFileSync('node',['scripts/inspect-production-closeout-v1.mjs','--task','hupo-69-shot-reconstruction-v1','--orders','work/core-to-whole-static-reconciliation-20261015-v1/state-work-orders.json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
  const closeout=JSON.parse(output);results.push({id:'original-static-closeout',status:closeout.remaining===0&&closeout.closed===closeout.originalGapCount?'PASS':'FAIL',detail:{originalGapCount:closeout.originalGapCount,closed:closeout.closed,remaining:closeout.remaining}});
}
const failures=results.filter(value=>value.status!=='PASS'),report={contract:'A1ActiveSystemLineClosedLoop/v1',status:failures.length?'FAIL':'PASS',active:selection.active,parkedProduction:selection.parkedProduction,
  parkedProductionAuditedAsCurrent:false,checks:results,failures:failures.map(value=>value.id),productionAdmission:false};
console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
