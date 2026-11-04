#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
const root=path.resolve(import.meta.dirname,"..");const registry=JSON.parse(fs.readFileSync(path.join(root,"apps/studio-next/src/data/system-line-current-entrypoints-v1.json"),"utf8"));
assert.equal(registry.contract,"A1SystemLineOperatorRegistry/v2");assert.equal(registry.current,true);for(const id of ["status","health","verify","authority","performance","build-static","compile-ledger","build-motion-dirty","compile-motion-full","render-540","audit-540","node-flow","run-node-flow"]) assert.ok(registry.commands[id], `missing-operator-command:${id}`); for(const command of Object.values(registry.commands)) assert.ok(fs.existsSync(path.join(root,command.script))); assert.equal(registry.commands["node-flow"].mutating,false); assert.equal(registry.commands["run-node-flow"].mutating,true); assert.equal(registry.commands["run-node-flow"].preflight,"live-runtime");assert.equal(registry.commands["build-static"].mutating,true);assert.equal(registry.commands["render-540"].mutating,true);assert.equal(registry.commands.status.mutating,false);assert.equal(registry.commands.status.preflight,"none");assert.equal(registry.commands.health.preflight,"none");assert.equal(registry.commands["build-static"].preflight,"live-runtime");
assert.equal(registry.singleProductionSurface,"/system-line-visual-workbench");
const rootPage=fs.readFileSync(path.join(root,"apps/studio-next/src/app/page.tsx"),"utf8");
const reviewPage=fs.readFileSync(path.join(root,"apps/studio-next/src/app/system-line-review/page.tsx"),"utf8");
const storyboardPage=fs.readFileSync(path.join(root,"apps/studio-next/src/app/system-line-storyboard/page.tsx"),"utf8");
assert.match(rootPage,/redirect\("\/system-line-visual-workbench"\)/u);
for(const source of [reviewPage,storyboardPage]){assert.match(source,/RETIRED ENTRY/u);assert.match(source,/href="\/system-line-visual-workbench"/u);}
const status=spawnSync(process.execPath,[path.join(root,"scripts/run-system-line-current-v1.mjs"),"status"],{cwd:root,encoding:"utf8",timeout:5000});assert.equal(status.status,0);assert.match(status.stdout,/HOT_PATH_ONLY_NO_WORKSPACE_READ_NO_MEDIA_SCAN/u);
const blocked=spawnSync(process.execPath,[path.join(root,"scripts/run-system-line-current-v1.mjs"),"build-static"],{cwd:root,encoding:"utf8",timeout:5000});assert.notEqual(blocked.status,0);assert.match(`${blocked.stdout}\n${blocked.stderr}`,/requires-apply/u);
console.log(JSON.stringify({status:"PASS",contract:registry.contract,currentCommands:Object.keys(registry.commands),mutationsRequireApply:true,lifecycleActions:Object.keys(registry.lifecycleActions),unlistedScriptsAreHistoryOnly:true},null,2));
