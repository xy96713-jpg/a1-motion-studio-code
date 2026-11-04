#!/usr/bin/env node
import fs from "node:fs";import path from "node:path";import http from "node:http";import {execFileSync} from "node:child_process";import {classifySystemLineRuntimeHealth} from "../apps/studio-next/src/lib/a1-system-line-runtime-health-v1.mjs";
const root=path.resolve(import.meta.dirname,".."),expectedCwd=path.join(root,"apps/studio-next"),start=process.hrtime.bigint();
const command=(name,args)=>{try{return execFileSync(name,args,{encoding:"utf8"}).trim();}catch{return"";}};
const pids=command("lsof",["-nP","-tiTCP:4311","-sTCP:LISTEN"]).split(/\s+/u).filter(Boolean).map(Number),pid=pids[0]||null;
const actualCwd=pid?command("lsof",["-a","-p",String(pid),"-d","cwd","-Fn"]).split("\n").find(line=>line.startsWith("n"))?.slice(1)||null:null;
const elapsedSeconds=(value)=>{const [dayPart,timePart]=String(value||"").includes("-")?String(value).split("-"):["0",String(value||"")],parts=timePart.split(":").map(Number);let seconds=Number(dayPart)*86400;if(parts.length===3)seconds+=parts[0]*3600+parts[1]*60+parts[2];else if(parts.length===2)seconds+=parts[0]*60+parts[1];else seconds+=parts[0]||0;return seconds;};
const ps=pid?command("ps",["-p",String(pid),"-o","etime=,%cpu="]).trim().split(/\s+/u):[];const ageSeconds=elapsedSeconds(ps[0]),cpuPercent=Number(ps[1]||0);
const probe=(pathname)=>new Promise(resolve=>{const begun=process.hrtime.bigint(),request=http.get({host:"127.0.0.1",port:4311,path:pathname,timeout:2000},response=>{response.resume();response.on("end",()=>resolve({path:pathname,ok:response.statusCode===200,statusCode:response.statusCode,location:response.headers.location||null,elapsedMs:Number(process.hrtime.bigint()-begun)/1e6}));});request.on("timeout",()=>request.destroy(new Error("timeout")));request.on("error",error=>resolve({path:pathname,ok:false,timeout:error.message==="timeout",error:error.message,elapsedMs:Number(process.hrtime.bigint()-begun)/1e6}));});
const coreProbe=probe("/generated/system-line/editorial-asset-workbench-v1/system-core-v1/current.json");
const entryProbe=await probe("/system-line-visual-workbench");
const activeLocation=entryProbe.statusCode===307&&typeof entryProbe.location==="string"&&entryProbe.location.startsWith("/system-line-visual-workbench?view=project&researchTask=")
  ?entryProbe.location:null;
const activeProbe=activeLocation?await probe(activeLocation):null;
const httpResults=[await coreProbe,activeProbe?{...activeProbe,path:"/system-line-visual-workbench",redirectedTo:activeLocation}:entryProbe];
const result={...classifySystemLineRuntimeHealth({listenerCount:pids.length,pid,expectedCwd,actualCwd,ageSeconds,cpuPercent,http:httpResults}),expectedCwd,elapsedMs:Number((Number(process.hrtime.bigint()-start)/1e6).toFixed(3)),budgetMs:5000,workspaceRead:false,productionMutation:false};
if(process.argv.includes("--write")){const out=path.join(root,"work/runtime-health-watchdog-v1");fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,"live.json"),`${JSON.stringify(result,null,2)}\n`);}console.log(JSON.stringify(result,null,2));if(!["HEALTHY","NOT_RUNNING"].includes(result.status))process.exitCode=1;
