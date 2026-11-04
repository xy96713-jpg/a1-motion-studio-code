#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {auditTypographyReferencePlanV1,plannedStyleSimilarity} from "../apps/studio-next/src/lib/a1-typography-reference-plan-audit-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const work=path.join(root,"work/typography-role-matrix-v1");
const read=(file)=>JSON.parse(fs.readFileSync(path.join(work,file),"utf8"));
const authority=read("typography-reference-authority-v1.json");
const current=auditTypographyReferencePlanV1({authority,sequence:read("sequence-plan.json"),directions:read("reference-directions-v1.json"),repoRoot:root});
assert.equal(current.status,"REPAIR_REQUIRED");
assert.ok(current.failures.some((item)=>item.code==="HERO_WINDOW_BUDGET_CONFLICT"));
assert.ok(current.nearPairs.some((item)=>item.left==="03:A"&&item.right==="03:B"));
assert.ok(current.nearPairs.some((item)=>item.left==="07:A"&&item.right==="07:B"));
assert.deepEqual(current.missingExemplarBindings,["11"]);

const genres=["evidence explainer","product tutorial","personal opinion"];
for(const genre of genres){
  const sequence={shots:[{shot:"01",route:"GENERATE_REVIEW_CANDIDATE",event:"CROP_WORDMARK"},{shot:"02",route:"NO_GENERATION",event:"NO_TYPE"}],profile:{heroWindow:6,maxHeroEventsPerWindow:1},genre};
  const directions={board:{sha256:authority.userReferences.find((item)=>item.role==="exploration-atlas-only").sha256},bindings:{"01":{userExemplarId:"USER_APPLE_HERO_EXEMPLAR",directions:[{id:"A",cell:"r1c1",pinterest:"interlock"},{id:"B",cell:"r4c3",pinterest:"inkSpace"}]}},plannedStyleSignatures:{"01:A":{letterform:"heavy-block",silhouette:"stacked",axis:"vertical",density:"dense",material:"clean-ink",paletteRole:"ivory-red"},"01:B":{letterform:"micro-serif",silhouette:"narrow",axis:"vertical",density:"sparse",material:"clean-ink",paletteRole:"ivory"}}};
  const report=auditTypographyReferencePlanV1({authority,sequence,directions,repoRoot:root});
  assert.equal(report.status,"PASS",genre);
  assert.equal(report.nearPairs.length,0,genre);
}
assert.equal(plannedStyleSimilarity({letterform:"a",silhouette:"b",axis:"c",density:"d",material:"e",paletteRole:"f"},{letterform:"a",silhouette:"b",axis:"c",density:"d",material:"e",paletteRole:"g"}),0.9);
const badAuthority=structuredClone(authority);
badAuthority.userReferences[1].sha256=badAuthority.userReferences[0].sha256;
const bad=auditTypographyReferencePlanV1({authority:badAuthority,sequence:read("sequence-plan.json"),directions:read("reference-directions-v1.json"),repoRoot:root});
assert.ok(bad.failures.some((item)=>item.code==="USER_REFERENCE_BYTES_DUPLICATE"));
console.log(JSON.stringify({contract:"A1TypographyReferencePlanAuditTest/v1",status:"PASS",genres,currentFailures:current.failures.map((item)=>item.code),checks:["one-authority-three-user-references","hero-window-conflict","planned-same-feel","missing-task-matched-exemplar","three-genre-pass","duplicate-reference-bytes"]},null,2));
