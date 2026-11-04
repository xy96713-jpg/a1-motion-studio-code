#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {resolveActiveWorkSelectionV1} from "../apps/studio-next/src/lib/a1-active-work-selection-v1.mjs";
const root=path.resolve(import.meta.dirname,"..");
const registry=JSON.parse(fs.readFileSync(path.join(root,"apps/studio-next/src/data/system-line-current-entrypoints-v1.json"),"utf8"));
const lifecycle=JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/system-core-v1/current.json"),"utf8"));
const commandName=process.argv[2]||"status";const apply=process.argv.includes("--apply");
if(registry.contract!=="A1SystemLineOperatorRegistry/v2"||registry.current!==true)throw new Error("system-line-operator-registry-invalid");
if(lifecycle.contract!=="A1SystemLineLifecycleProjection/v1"||!lifecycle.nextAction?.id)throw new Error("system-line-lifecycle-current-unavailable");
if(commandName==="help"){
  console.log(JSON.stringify({contract:registry.contract,status:"PASS",usage:"npm run system-line -- <command> [--apply]",current:{stage:lifecycle.stage,nextAction:lifecycle.nextAction},commands:Object.fromEntries(Object.entries(registry.commands).map(([id,value])=>[id,{mutating:value.mutating,description:value.description}])),lifecycleAction:registry.lifecycleActions?.[lifecycle.nextAction.id]||{mode:"UNREGISTERED",command:null}},null,2));
  process.exit(0);
}
const command=registry.commands?.[commandName];
if(!command)throw new Error(`system-line-current-command-invalid:${commandName}:available=${Object.keys(registry.commands||{}).join(",")}`);
const args=[];
let writerToken=null;
if(command.mutating){
  if(!apply)throw new Error(`system-line-current-command-requires-apply:${commandName}`);
  const actionId=lifecycle.nextAction.id;
  if(!(command.allowedLifecycleActionIds||[]).includes(actionId))throw new Error(`system-line-current-command-lifecycle-blocked:${commandName}:${actionId}`);
  const parkRecord=JSON.parse(fs.readFileSync(path.join(root,"work/system-maturity-consolidation-park-a-line-20260928.json"),"utf8"));
  const researchPhase=JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress/current-phase.json"),"utf8"));
  const formalPhase=JSON.parse(fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/current-phase.json"),"utf8"));
  const taskId=/^work\/([a-z0-9-]+)\/shot-task-plan-v1\.json$/u.exec(parkRecord.activeLine?.planPath||"")?.[1];
  const selection=resolveActiveWorkSelectionV1({parkRecord,researchPhase,formalPhase,
    planExists:Boolean(taskId)&&fs.existsSync(path.join(root,parkRecord.activeLine.planPath)),
    runtimeExists:Boolean(taskId)&&typeof parkRecord.activeLine.runtimeStatePath==="string"
      &&!parkRecord.activeLine.runtimeStatePath.split("/").some((part)=>part===".."||part===".")
      &&fs.existsSync(path.join(root,parkRecord.activeLine.runtimeStatePath))});
  if(selection.status!=="PASS")throw new Error(`system-line-active-work-selection-blocked:${selection.failures.join(",")}`);
  if(selection.parkedProduction.status==="PARKED_PENDING_USER_APPROVAL")throw new Error(`system-line-formal-production-parked:${commandName}:${selection.active.taskId}`);
  if(command.preflight === "live-runtime"){
    const uniqueAudit=spawnSync(process.execPath,[path.join(root,"scripts/audit-unique-system-line-v1.mjs")],{cwd:root,encoding:"utf8"});
    if(uniqueAudit.status!==0){process.stderr.write(uniqueAudit.stdout||"");process.stderr.write(uniqueAudit.stderr||"");throw new Error("system-line-current-unique-runtime-audit-failed");}
  }
  if(command.passWorkspaceSha!==false){const workspace=readProjectWorkspace(path.join(root,"apps/studio-next"));args.push(workspace.workspaceSha256);}
  writerToken=fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/.writer-lease.token"),"utf8").trim();
}
const result=spawnSync(process.execPath,[path.join(root,command.script),...(command.args||[]),...args],{cwd:root,stdio:"inherit",env:{...process.env,A1_SYSTEM_LINE_WRITER_ID:"system-line-operator-cli",...(writerToken?{A1_SYSTEM_LINE_WRITER_LEASE_TOKEN:writerToken}:{})}});
if(result.error)throw result.error;process.exitCode=result.status??1;
