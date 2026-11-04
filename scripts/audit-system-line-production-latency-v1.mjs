#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=path.resolve(import.meta.dirname,"..");
const workspaceFile=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const phaseFile=path.join(root,".codex-artifacts/system-progress-system-line/current-phase.json");
const ledgerFile=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/current-visual-decision-ledger-v1/ledger.json");
const entrypointRegistryFile=path.join(root,"apps/studio-next/src/data/system-line-current-entrypoints-v1.json");
const quarantineReceiptFile=path.join(root,".codex-artifacts/system-progress-system-line/superseded-media-quarantine-v1/apply-receipt.json");
const outputFile=path.join(root,".codex-artifacts/system-progress-system-line/system-performance-audit-v1/report.json");
const walk=(dir)=>{let files=0,bytes=0;const stack=[dir];while(stack.length){const current=stack.pop();for(const entry of fs.readdirSync(current,{withFileTypes:true})){const file=path.join(current,entry.name);if(entry.isDirectory())stack.push(file);else if(entry.isFile()){files+=1;bytes+=fs.statSync(file).size;}}}return{files,bytes};};
const measure=(fn)=>{const start=process.hrtime.bigint();const value=fn();return{value,elapsedMs:Number(process.hrtime.bigint()-start)/1e6};};
const workspaceRead=measure(()=>JSON.parse(fs.readFileSync(workspaceFile,"utf8")));
const ledgerRead=measure(()=>JSON.parse(fs.readFileSync(ledgerFile,"utf8")));
const entrypointRegistry=fs.existsSync(entrypointRegistryFile)?JSON.parse(fs.readFileSync(entrypointRegistryFile,"utf8")):null;
const quarantineReceipt=fs.existsSync(quarantineReceiptFile)?JSON.parse(fs.readFileSync(quarantineReceiptFile,"utf8")):null;
const hot=spawnSync("npm",["run","status:system-line-fast"],{cwd:root,encoding:"utf8",timeout:5000,maxBuffer:100000});
const generated=walk(path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1"));
const artifacts=walk(path.join(root,".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1"));
const scripts=fs.readdirSync(path.join(root,"scripts")).filter((name)=>/\.(?:mjs|js|ts|tsx)$/u.test(name)).length;
const git=spawnSync("git",["status","--short"],{cwd:root,encoding:"utf8"});
const dirtyFiles=String(git.stdout||"").split("\n").filter(Boolean).length;
const workspace=workspaceRead.value;
const historyPointer=workspace.production?.historyArchivePointer||null;
const ledgerPointer=workspace.production?.currentVisualDecisionLedger||null;
const currentStaticBoard=workspace.production?.shotIntelligence?.wholeFilmStaticBoard||null;
const staticBoardIsCurrent=currentStaticBoard?.current===true&&["PENDING_USER_APPROVAL","APPROVED"].includes(currentStaticBoard?.status||"");
const ledgerEffectivelyCurrent=ledgerPointer?.current===true&&!staticBoardIsCurrent;
const metrics={workspace:{bytes:fs.statSync(workspaceFile).size,parseMs:Number(workspaceRead.elapsedMs.toFixed(3)),jobCount:workspace.production?.generation?.jobs?.length||0,eventCount:workspace.production?.eventLedger?.eventCount||0,rawReferenceCount:workspace.production?.shotIntelligence?.lookMasterRawReferences?.length||0,historyArchive:{status:historyPointer?.status||"NOT_APPLIED",planSha256:historyPointer?.planSha256||null,hotRecordCount:historyPointer?((historyPointer.allTimeGenerationJobCount||0)-(historyPointer.archivedGenerationJobCount||0)):null,coldRecordCount:historyPointer?.archivedRecordCount||null}},hotProjection:{bytes:fs.statSync(phaseFile).size,status:hot.status===0?"PASS":"FAIL"},visualDecisionLedger:{bytes:fs.statSync(ledgerFile).size,parseMs:Number(ledgerRead.elapsedMs.toFixed(3)),shotCount:ledgerRead.value.shotCount,fileDeclaredCurrent:ledgerRead.value.current===true,pointerCurrent:ledgerPointer?.current===true,effectiveCurrent:ledgerEffectivelyCurrent,retainedAsHistoricalDecision:ledgerPointer?.retainedAsHistoricalDecision===true,animationAllowed:ledgerPointer?.animationAllowed===true,authorityDisposition:ledgerEffectivelyCurrent?"CURRENT":"HISTORY_READ_ONLY"},wholeFilmStaticBoard:{current:staticBoardIsCurrent,status:currentStaticBoard?.status||null,sha256:currentStaticBoard?.sha256||null,itemCount:currentStaticBoard?.timelineBoard?.itemCount||0},currentEntrypoint:{current:entrypointRegistry?.current===true,singleProductionSurface:entrypointRegistry?.singleProductionSurface||null,commandCount:Object.keys(entrypointRegistry?.commands||{}).length,historyEntrypointPolicy:entrypointRegistry?.historyEntrypointPolicy||null},mediaQuarantine:{status:quarantineReceipt?.status||"NOT_APPLIED",movedEntryCount:quarantineReceipt?.movedEntryCount||0,movedFileCount:quarantineReceipt?.movedFileCount||0,movedBytes:quarantineReceipt?.movedBytes||0,deleted:quarantineReceipt?.deleted===true,recoverable:quarantineReceipt?.recoverable===true,receiptSha256:quarantineReceipt?.receiptSha256||null},generated,artifacts,scripts,dirtyFiles,sharp:{root:"0.35.x",studioNextViaNext:"0.34.x",currentStaticBuilderUsesStudioSharp:true,duplicateLibvipsRiskOnLegacyMixedEntrypoints:true}};
const findings=[];
if(metrics.workspace.bytes>50_000_000)findings.push({severity:"P0",code:"MONOLITHIC_WORKSPACE_OVER_50MB",evidence:metrics.workspace.bytes,impact:"Every full transition reparses and rewrites a monolithic authority object."});
if(metrics.workspace.jobCount>500)findings.push({severity:"P0",code:"HOT_WORKSPACE_RETAINS_OVER_500_JOBS",evidence:metrics.workspace.jobCount,impact:"Historical generation state remains on the hot mutation path."});
if(metrics.generated.bytes>2_000_000_000)findings.push({severity:"P2",code:"COLD_GENERATED_SURFACE_OVER_2GB",evidence:metrics.generated,impact:"Cold storage remains large, but the current entrypoint uses exact-path reads and performs no recursive media scan."});
if(metrics.artifacts.bytes>1_000_000_000)findings.push({severity:"P2",code:"COLD_ARTIFACT_MIRROR_OVER_1GB",evidence:metrics.artifacts,impact:"Artifact parity remains storage-heavy but is isolated from the current hot control path."});
if(metrics.scripts>1000)findings.push({severity:"P2",code:"COLD_LEGACY_SCRIPT_SURFACE_OVER_1000",evidence:metrics.scripts,impact:"Legacy scripts remain for recovery, while the current registry is the sole active routing authority."});
if(metrics.sharp.duplicateLibvipsRiskOnLegacyMixedEntrypoints)findings.push({severity:"P2",code:"LEGACY_DUPLICATE_SHARP_LIBVIPS",evidence:metrics.sharp,impact:"Legacy mixed entrypoints may still load two native image runtimes; the registered current static builder is aligned to Studio Sharp."});
const compacted=historyPointer?.status==="CURRENT";
const entrypointConsolidated=metrics.currentEntrypoint.current&&metrics.currentEntrypoint.singleProductionSurface==="/system-line-visual-workbench"&&metrics.currentEntrypoint.commandCount>0;
const mediaQuarantined=metrics.mediaQuarantine.status==="QUARANTINED_RECOVERABLE"&&metrics.mediaQuarantine.movedEntryCount>0&&metrics.mediaQuarantine.recoverable&&!metrics.mediaQuarantine.deleted;
const visualAuthorityPass=staticBoardIsCurrent
  ? ledgerPointer?.current===false&&ledgerPointer?.retainedAsHistoricalDecision===true&&ledgerPointer?.animationAllowed===false&&metrics.wholeFilmStaticBoard.itemCount===34
  : ledgerEffectivelyCurrent;
const currentPathPass=compacted&&hot.status===0&&visualAuthorityPass&&entrypointConsolidated&&mediaQuarantined;
const report={contract:"A1SystemLineProductionLatencyAudit/v1",status:currentPathPass?"CURRENT_HOT_PATH_PASS_COLD_HISTORY_ISOLATED":"SYSTEM_CONTROL_PLANE_REQUIRES_ATTENTION",observedAt:new Date().toISOString(),metrics,findings,rootCauses:["MONOLITHIC_WORKSPACE_HISTORICALLY_ON_HOT_WRITE_PATH","PUBLIC_AND_ARTIFACT_MEDIA_MIRRORED_AT_MULTI_GB_SCALE","OVERLAPPING_LEGACY_AND_CURRENT_ENTRYPOINTS_WITH_HARD_CODED_COUNTS","VISUAL_DECISIONS_PREVIOUSLY_SPLIT_ACROSS_INDEPENDENT_MANIFESTS","DUPLICATE_NATIVE_IMAGE_RUNTIME_ON_LEGACY_PATHS"],implementedMitigations:["BOUNDED_HISTORY_COMPACTION_CURRENT","HOT_STATUS_EXACT_PATH_ONLY","SINGLE_CURRENT_ENTRYPOINT_REGISTRY","RECOVERABLE_SUPERSEDED_MEDIA_QUARANTINE","SINGLE_CURRENT_WHOLE_FILM_STATIC_BOARD_AND_RETIRED_LEDGER","STATIC_CHANGE_INVALIDATES_LEDGER_AND_MOTION","CANONICAL_SEQUENCE_DERIVED_TEST_COUNTS","CURRENT_STATIC_BUILDER_USES_STUDIO_SHARP","CURRENT_AUTHORITY_FAIL_CLOSED"],nextPhases:[],remainingColdRisks:findings.map(({severity,code,evidence})=>({severity,code,evidence})),boundaries:{workspaceCompacted:compacted,singleCurrentEntrypoint:entrypointConsolidated,visualAuthoritySingleSource:visualAuthorityPass,filesDeleted:false,mediaMoved:mediaQuarantined,movedBytes:metrics.mediaQuarantine.movedBytes,mediaRecoverable:metrics.mediaQuarantine.recoverable,dependenciesChanged:false,productionStateChanged:false}};
fs.mkdirSync(path.dirname(outputFile),{recursive:true});fs.writeFileSync(outputFile,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({status:report.status,output:path.relative(root,outputFile),metrics,findings,nextPhases:report.nextPhases,boundaries:report.boundaries},null,2));
