#!/usr/bin/env node
// Explicit maintenance operations only; never applies code or starts production.
import path from 'node:path';
import {requestProductionMaintenanceV1,inspectProductionMaintenanceV1,holdProductionMaintenanceV1,releaseProductionMaintenanceV1} from '../apps/studio-next/src/lib/a1-production-maintenance-boundary-v1.mjs';
const args=process.argv.slice(2),action=args[0];
const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const repoRoot=path.resolve(value('--repo-root')||process.cwd());
if(!['status','request','hold','release'].includes(action))throw Error('Usage: status | request | hold | release; mutations require --apply');
if(action!=='status'&&!args.includes('--apply'))throw Error('MAINTENANCE_APPLY_REQUIRED');
const ownerId=value('--owner'),expectedRequestSha256=value('--expected-sha');
const result=action==='status'?inspectProductionMaintenanceV1({repoRoot})
 :action==='request'?requestProductionMaintenanceV1({repoRoot,requestId:value('--request-id'),ownerId,reason:value('--reason')})
 :action==='hold'?holdProductionMaintenanceV1({repoRoot,ownerId,expectedRequestSha256})
 :releaseProductionMaintenanceV1({repoRoot,ownerId,expectedRequestSha256,outcome:value('--outcome')});
console.log(JSON.stringify(result,null,2));
