#!/usr/bin/env node
import path from "node:path";import {spawnSync} from "node:child_process";
const root=path.resolve(import.meta.dirname,"..");const probe=spawnSync(process.execPath,[path.join(root,"scripts/probe-system-line-runtime-health-v1.mjs")],{cwd:root,encoding:"utf8",timeout:7000});const health=JSON.parse(probe.stdout||"{}");
if(health.status==="HEALTHY"){console.log(JSON.stringify({status:"NOOP_HEALTHY",pid:health.listener?.pid}));process.exit(0);}if(!process.argv.includes("--apply"))throw new Error(`runtime-repair-apply-required:${health.status}`);if(health.status!=="STALE_UNRESPONSIVE"||health.safeToTerminate!==true||health.listener?.cwd!==health.expectedCwd)throw new Error(`runtime-repair-not-safe:${health.status}`);
process.kill(health.listener.pid,"SIGTERM");console.log(JSON.stringify({status:"STALE_RUNTIME_STOPPED",pid:health.listener.pid,nextAction:"npm run dev:system-line"},null,2));
