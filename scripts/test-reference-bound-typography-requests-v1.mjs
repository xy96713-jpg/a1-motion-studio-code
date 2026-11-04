#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {compileReferenceBoundTypographyRequestsV1} from "../apps/studio-next/src/lib/a1-reference-bound-typography-requests-v1.mjs";
import {auditTypographyContextReferencePlanV1} from "../apps/studio-next/src/lib/a1-typography-reference-plan-audit-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const board=path.join(root,"work/typography-role-matrix-v1/reference-bound-pack-v1/r1c1.png");
const pin=path.join(root,"work/typography-role-matrix-v1/pinterest-reference-cache/interlocked-hanzi.png");
const sha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const digest=(value)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const passingAudit=()=>{const body={contract:"A1TypographyReferencePlanAudit/v1",status:"PASS",failures:[]};return {...body,auditSha256:digest(body)};};
const references={
  boardCell:{kind:"USER_BOARD_CELL",path:board,sha256:sha(board),use:"test selected cell"},
  pinterest:{kind:"PINTEREST_MECHANISM",path:pin,sha256:sha(pin),sourceUrl:"https://www.pinterest.com/pin/565835140696146335/",mechanism:"interlocked negative space",use:"test transferable mechanism"},
};
const userExemplar={kind:"USER_STYLE_EXEMPLAR",id:"TEST_USER_STYLE",path:board,sha256:sha(board),use:"test creator style continuity"};

function fixture(mode){
  const assignments=[
    {shotId:"T1",programMode:mode,eventFamily:"CHAPTER",typographyRole:"FULLSCREEN_HERO",semanticEvent:"CHAPTER_BREAK",exactCopy:"进入主题",filmEffectProgram:{effectId:"HERO",effectDisplayGroups:["进入主题"]}},
    {shotId:"T2",programMode:mode,eventFamily:"NO_TYPE",typographyRole:"NO_TYPE",semanticEvent:"ORDINARY",exactCopy:"",filmEffectProgram:{effectId:"NONE"}},
    {shotId:"T3",programMode:mode,eventFamily:"CONCLUSION",typographyRole:"CONCLUSION_STAMP",semanticEvent:"CONCLUSION",exactCopy:"形成判断",filmEffectProgram:{effectId:"HERO",effectDisplayGroups:["形成判断"]}},
  ];
  const binding=(shotId)=>({semanticDuty:shotId==="T1"?"entry":"conclusion",adjacentShotIds:["T2"],holdFrame:null,safeRegion:null,directions:[
    {id:"A",mechanismSource:"USER_BOARD_CELL",visualPrimitive:"STACKED_BLOCK",topologyFingerprint:"stacked",readingPath:"top down",compositionAction:"two-level mass",exclusions:["copied words"],...structuredClone(references)},
    {id:"B",mechanismSource:"PINTEREST_MECHANISM",visualPrimitive:"SPARSE_COLUMN",topologyFingerprint:"column",readingPath:"vertical",compositionAction:"quiet column",exclusions:["same mass"],...structuredClone(references)},
  ]});
  return{articleId:`test-${mode}`,assignments,bindings:{T1:{...binding("T1"),userExemplar},T3:{...binding("T3"),userExemplar}},designAudit:passingAudit(),generationAllowed:false,maxConcurrency:2};
}

const genres=["EVIDENCE_ESSAY","PRODUCT_TUTORIAL","LONG_TAKE_OPINION"];
for(const genre of genres){
  const pack=compileReferenceBoundTypographyRequestsV1(fixture(genre));
  assert.equal(pack.status,"REVIEW_ONLY_BLOCKED");
  assert.equal(pack.requestCount,4);
  assert.equal(pack.maxConcurrency,2);
  assert.ok(pack.requests.every((request)=>request.blockers.includes("GENERATION_FROZEN")&&request.blockers.includes("REAL_HOLD_FRAME_MISSING")));
  assert.ok(pack.requests.every((request)=>request.references.length===2&&request.references[0].kind==="USER_STYLE_EXEMPLAR"));
  assert.ok(pack.requests.filter((request)=>request.variantId==="B").every((request)=>request.references[1].sourceUrl.includes("pinterest.com/pin/")));
  assert.ok(pack.requests.filter((request)=>request.variantId==="A").every((request)=>request.references[1].kind==="USER_BOARD_CELL"));
  assert.ok(pack.requests.every((request)=>request.exactCopy===request.editableShadow&&request.productionAdmission===false));
  assert.equal(new Set(pack.requests.map((request)=>request.requestSha256)).size,4);
}
const wrongSha=fixture("PRODUCT_TUTORIAL");
wrongSha.bindings.T1.directions[0].pinterest.sha256="0".repeat(64);
assert.throws(()=>compileReferenceBoundTypographyRequestsV1(wrongSha),/sha-mismatch/u);
const repeated=fixture("PRODUCT_TUTORIAL");
repeated.bindings.T1.directions[1].topologyFingerprint="stacked";
assert.throws(()=>compileReferenceBoundTypographyRequestsV1(repeated),/not-structurally-distinct/u);
const wrongConcurrency=fixture("PRODUCT_TUTORIAL");
wrongConcurrency.maxConcurrency=3;
assert.throws(()=>compileReferenceBoundTypographyRequestsV1(wrongConcurrency),/invalid:inputs/u);
const tamperedAudit=fixture("PRODUCT_TUTORIAL");
tamperedAudit.designAudit.failures.push({code:"UNRESOLVED"});
assert.ok(compileReferenceBoundTypographyRequestsV1(tamperedAudit).requests.every((request)=>request.blockers.includes("DESIGN_AUDIT_MISSING_OR_TAMPERED")));

const apple=JSON.parse(fs.readFileSync(path.join(root,"work/typography-role-matrix-v1/reference-bound-pack-v1/request-pack.json"),"utf8"));
assert.equal(apple.requestCount,8);
assert.equal(new Set(apple.requests.map((request)=>request.visualPrimitive)).size,8);
assert.equal(new Set(apple.requests.map((request)=>request.referenceEvidence.selectedBoardCell.gridPosition)).size,8);
assert.equal(apple.designAudit.status,"REPAIR_REQUIRED");
assert.equal(apple.designAudit.verified,true);
assert.ok(apple.requests.every((request)=>request.references.length<=2&&request.blockers.includes("GENERATION_FROZEN")&&request.blockers.includes("DESIGN_PLAN_REPAIR_REQUIRED")));
assert.ok(apple.requests.every((request)=>!request.references.some((reference)=>reference.path.includes("/board-crops/"))));
assert.ok(apple.requests.every((request)=>request.prompt.includes(request.visualPrimitive)&&request.prompt.includes("sole structure mechanism image")));
assert.ok(apple.requests.every((request)=>!request.prompt.includes("高挑宋体横向压缩")&&!request.prompt.includes("Use glyph colors only: ink")));

// Contract fixtures use local test bytes; they are not provenance evidence for a real movie.
function readyFixture(){
  const value=fixture("LONG_TAKE_OPINION");
  value.generationAllowed=true;
  for(const binding of Object.values(value.bindings)){
    binding.shotVisualContext={contract:"A1TypographyShotVisualContext/v1",carrierMode:"FULLSCREEN",
      frame:{width:1920,height:1080},protectedRegions:[],availableRegions:[{id:"title-field",box:{x:.06,y:.08,width:.88,height:.84}}],anchors:[]};
    binding.adjacentShots=[{shotId:"T2",relation:"NEXT",typographySummary:{duty:"NO_TYPE",density:"QUIET"},frame:{kind:"REAL_ADJACENT_FRAME",path:pin,sha256:sha(pin),use:"TEST_BYTES_ONLY"}}];
    for(const direction of binding.directions){
      delete direction.boardCell;
      delete direction.pinterest;
      direction.mechanismSource="OFFICIAL_ORIGINAL";
      direction.mechanismReference={kind:"OFFICIAL_ORIGINAL",path:board,sha256:sha(board),use:"TEST_BYTES_ONLY",sourceUrl:"https://example.test/original",creator:"fixture",sourceWork:"fixture",mechanism:"type grouping"};
    }
  }
  return value;
}
const ready=compileReferenceBoundTypographyRequestsV1(readyFixture());
assert.equal(ready.status,"READY_FOR_BOUNDED_IMAGEGEN");
assert.ok(ready.requests.every((r)=>r.compositionPlan.layoutContext.status==="PASS_REVIEW_ONLY"&&r.references.length===3));
assert.ok(ready.requests.every((r)=>r.referenceEvidence.selectedPinterest===null&&!r.verification.realHoldFrameCompositeRequired));
const adjacentChange=readyFixture();
adjacentChange.bindings.T1.adjacentShots[0].typographySummary.density="DENSE";
assert.notEqual(compileReferenceBoundTypographyRequestsV1(adjacentChange).requests[0].cacheKey,ready.requests[0].cacheKey);
const frozen=readyFixture();frozen.generationAllowed=false;
assert.ok(compileReferenceBoundTypographyRequestsV1(frozen).requests.every((r)=>r.blockers.includes("GENERATION_FROZEN")));
const noAdjacent=readyFixture();noAdjacent.bindings.T1.adjacentShots=[];
assert.ok(compileReferenceBoundTypographyRequestsV1(noAdjacent).requests[0].blockers.includes("ADJACENT_PIXELS_MISSING"));
const noSafe=readyFixture();noSafe.bindings.T1.shotVisualContext.availableRegions=[];
assert.ok(compileReferenceBoundTypographyRequestsV1(noSafe).requests[0].blockers.includes("NO_SAFE_READABLE_TYPOGRAPHY_REGION"));
const portrait=readyFixture();portrait.bindings.T1.shotVisualContext.frame={width:1080,height:1920};
assert.ok(compileReferenceBoundTypographyRequestsV1(portrait).requests[0].blockers.includes("SOURCE_RENDER_ASPECT_MISMATCH"));
const selfAdjacent=readyFixture();selfAdjacent.bindings.T1.adjacentShotIds=["T1"];
assert.throws(()=>compileReferenceBoundTypographyRequestsV1(selfAdjacent),/cannot-be-self/u);
const hant=readyFixture();
hant.bindings.T1.textSpec={sourceText:"进入主题",displayText:"進入主題",displayGroups:["進入主題"],script:"Hant",locale:"zh-Hant-TW",
  conversionPairs:[{index:0,source:"进",display:"進"},{index:3,source:"题",display:"題"}],copyChangeReason:"explicit traditional display adaptation"};
const hantRequest=compileReferenceBoundTypographyRequestsV1(hant).requests[0];
assert.equal(hantRequest.exactCopy,"進入主題");assert.equal(hantRequest.sourceCopy,"进入主题");
assert.equal(hantRequest.textSpec.visibleConversionChange,true);
assert.equal(hantRequest.compositionPlan.groups[0].text,"進入主題");
assert.ok(hantRequest.prompt.includes("進入主題"));
const sameScript=readyFixture();
sameScript.assignments[2].exactCopy="先做再改";
sameScript.assignments[2].filmEffectProgram.effectDisplayGroups=["先做再改"];
sameScript.bindings.T3.textSpec={sourceText:"先做再改",displayText:"先做再改",displayGroups:["先做再改"],script:"Hant",locale:"zh-Hant-TW"};
assert.equal(compileReferenceBoundTypographyRequestsV1(sameScript).requests.at(-1).textSpec.visibleConversionChange,false);
delete hant.bindings.T1.textSpec.copyChangeReason;
assert.throws(()=>compileReferenceBoundTypographyRequestsV1(hant),/copy-change-reason/u);
const wrongOriginal=readyFixture();delete wrongOriginal.bindings.T1.directions[0].mechanismReference.sourceWork;
assert.throws(()=>compileReferenceBoundTypographyRequestsV1(wrongOriginal),/original-reference-provenance/u);
const footage=readyFixture();
footage.assignments[0].typographyRole="PRESENTER_HERO";
footage.bindings.T1.holdFrame={kind:"REAL_HOLD_FRAME",path:board,sha256:sha(board),use:"TEST_BYTES_ONLY"};
Object.assign(footage.bindings.T1.shotVisualContext,{carrierMode:"FOOTAGE",frame:{sha256:sha(board),width:1920,height:1080},geometryEvidence:{method:"TEST_ONLY",frameSha256:sha(board)}});
assert.equal(compileReferenceBoundTypographyRequestsV1(footage).requests[0].status,"READY_FOR_BOUNDED_IMAGEGEN");
footage.bindings.T1.shotVisualContext.frame.sha256="b".repeat(64);
footage.bindings.T1.shotVisualContext.geometryEvidence.frameSha256="b".repeat(64);
assert.throws(()=>compileReferenceBoundTypographyRequestsV1(footage),/hold-frame-mismatch/u);
const receiptInput=readyFixture();
receiptInput.designAudit=auditTypographyContextReferencePlanV1(receiptInput);
assert.equal(receiptInput.designAudit.status,"PASS");
assert.equal(compileReferenceBoundTypographyRequestsV1(receiptInput).status,"READY_FOR_BOUNDED_IMAGEGEN");
receiptInput.bindings.T1.shotVisualContext.availableRegions[0].box.width=.7;
assert.ok(compileReferenceBoundTypographyRequestsV1(receiptInput).requests[0].blockers.includes("DESIGN_AUDIT_MISSING_OR_TAMPERED"));
receiptInput.bindings.T1.directions[0].mechanismReference.sha256="0".repeat(64);
assert.equal(auditTypographyContextReferencePlanV1(receiptInput).status,"REPAIR_REQUIRED");
console.log(JSON.stringify({contract:"A1ReferenceBoundTypographyRequestsTest/v1",status:"PASS",genres,appleRequestCount:apple.requestCount,checks:["legacy-three-genres","reference-byte-sha","original-reference-without-pinterest","source-constrained-groups","actual-adjacent-frame-binding","geometry-and-neighbor-cache-invalidation","fullscreen-without-fake-base","traditional-display-versus-source-copy","unchanged-script-is-not-conversion","input-bound-design-audit","unsafe-or-missing-context-blocks","generation-freeze","two-worker-cap","no-legacy-grid-crops"]},null,2));
