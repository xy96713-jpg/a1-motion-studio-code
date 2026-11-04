#!/usr/bin/env node
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
const started=performance.now();
const sopPath=fileURLToPath(new URL('../docs/SYSTEM_LINE_MODULE_SOP.md',import.meta.url));
const text=fs.readFileSync(sopPath,'utf8');
const documented=[...text.matchAll(/^\| `([^`]+)` \|/gm)].map(match=>match[1]);
const {registry}=createNodeAdapterRegistry();
const modules=Object.entries(registry).map(([id,adapter])=>({id,label:adapter.label,callable:adapter.available===true,documented:documented.filter(name=>name===id).length===1}));
const failures=[...modules.filter(module=>!module.documented).map(module=>({id:module.id,code:'MODULE_SOP_MISSING_OR_DUPLICATED'})),...documented.filter(id=>!Object.hasOwn(registry,id)).map(id=>({id,code:'SOP_MODULE_NOT_REGISTERED'}))];
console.log(JSON.stringify({contract:'A1ModuleSopInspection/v1',scope:'READ_ONLY_DEFINITIONS_NOT_MATURITY_OR_PRODUCTION_APPROVAL',status:failures.length?'FAIL':'PASS',modules,failures,environmentReadiness:'NOT_TESTED',visualMaturity:'NOT_PROVED_BY_THIS_INSPECTION',executionAuthorized:false,writesPerformed:false,providerCalls:0,timingScope:'INSPECTION_BODY_EXCLUDES_MODULE_IMPORTS',elapsedMs:performance.now()-started},null,2));
if(failures.length)process.exitCode=1;
