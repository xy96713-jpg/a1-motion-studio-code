#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const publicRoot=path.join(root,"apps/studio-next/public");
const workspace=JSON.parse(fs.readFileSync(path.join(publicRoot,"generated/system-line/editorial-asset-workbench-v1/workspace.json"),"utf8"));
const pointer=workspace.production.currentVisualDecisionLedger;
const ledgerFile=path.join(publicRoot,pointer.publicUrl.replace(/^\//u,""));
const ledger=JSON.parse(fs.readFileSync(ledgerFile,"utf8"));
const sha=(value)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
assert.equal(pointer.current,true);assert.equal(pointer.ledgerSha256,ledger.ledgerSha256);assert.equal(ledger.entries.length,34);assert.equal(new Set(ledger.entries.map((item)=>item.shotId)).size,34);
const hashBody=structuredClone(ledger);delete hashBody.ledgerSha256;delete hashBody.generatedAt;assert.equal(sha(hashBody),ledger.ledgerSha256);
const ed01=ledger.entries.find((item)=>item.shotId==="ED-01"),ed31=ledger.entries.find((item)=>item.shotId==="ED-31");
assert.equal(ed01.lockedUserDecision.id,"ED01_OPENING_THREE_STATE");assert.equal(ed01.lockedUserDecision.states.length,3);assert.equal(ed31.lockedUserDecision.id,"ED31_CURRENT_FUSION_PIXEL_COBALT");assert.equal(ed31.lockedUserDecision.pink3dVersionForbidden,true);
assert.ok(ledger.entries.every((item)=>item.animationAllowed===false&&fs.existsSync(path.join(publicRoot,item.selectedFrame.publicUrl.replace(/^\//u,"")))));assert.equal(workspace.production.authority.currentStage,"full-static-storyboard-rework-review");assert.equal(workspace.production.authority.nextAction.id,"review-full-static-storyboard-rework");
console.log(JSON.stringify({status:"PASS",contract:ledger.contract,ledgerSha256:ledger.ledgerSha256,shotCount:ledger.shotCount,ed01Locked:true,ed31Locked:true,animationFrozen:true},null,2));
