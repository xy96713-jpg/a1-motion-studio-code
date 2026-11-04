#!/usr/bin/env node
import assert from "node:assert/strict";
import {selectTypographyFamilyV1} from "../apps/studio-next/src/lib/a1-typography-family-selector-v1.mjs";

const base={programMode:"LONG_TAKE_OPINION",script:"Hant",locale:"zh-Hant-TW",sourceText:"开始做",displayText:"開始做",displayGroups:["開始","做"],
  conversionPairs:[{index:0,source:"开",display:"開"}],copyChangeReason:"explicit traditional Chinese display study",
  familyHistory:[],selectedRegion:{width:.42,height:.34}};
const identity=selectTypographyFamilyV1({...base,typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY"});
assert.equal(identity.status,"READY_FOR_VISUAL_COMPARISON");
assert.equal(identity.selectedFamilyId,"HEAVY_GOTHIC");
assert.ok(identity.candidates.length>=2);
assert.ok(identity.candidates.every((candidate)=>candidate.fontSha256&&candidate.glyphGroups.every((group)=>group.missing.length===0)));
assert.equal(identity.scriptWarning,"Packaged font coverage is verified; regional Han glyph aesthetics still require visual review.");

const verdict=selectTypographyFamilyV1({...base,typographyRole:"FULLSCREEN_HERO",semanticEvent:"VERDICT",preferredMechanisms:["EVA_COMPRESS"]});
assert.equal(verdict.status,"READY_FOR_VISUAL_COMPARISON");
assert.equal(verdict.selectedFamilyId,"COMPRESSED_MING");
assert.notEqual(verdict.selectedFamilyId,identity.selectedFamilyId);

const question=selectTypographyFamilyV1({...base,typographyRole:"PRESENTER_MARKER",semanticEvent:"QUESTION",sourceText:"问题在哪",displayText:"問題在哪",displayGroups:["問題在哪"],
  conversionPairs:[{index:0,source:"问",display:"問"},{index:1,source:"题",display:"題"}]});
assert.equal(question.status,"READY_FOR_VISUAL_COMPARISON");
assert.equal(question.selectedFamilyId,"EDITORIAL_MING");
assert.ok(question.rejectedFamilies.some((item)=>item.familyId==="SLANTED_GROTESK"&&item.reason==="FONT_GLYPH_COVERAGE_MISSING"));

const native=selectTypographyFamilyV1({...base,typographyRole:"SOURCE_NATIVE",semanticEvent:"EVIDENCE"});
assert.equal(native.status,"SKIP");
assert.equal(native.selectedFamilyId,null);
const extended=selectTypographyFamilyV1({...base,typographyRole:"FULLSCREEN_HERO",semanticEvent:"VERDICT",
  sourceText:"這是一個太長而不該被當作主標題的完整說明句",displayText:"這是一個太長而不該被當作主標題的完整說明句",
  displayGroups:["這是一個太長而不該被當作主標題的完整說明句"],conversionPairs:[]});
assert.equal(extended.status,"BLOCKED");
assert.ok(extended.reasonCodes.includes("HERO_COPY_TOO_LONG_ROUTE_TO_SUPPORT_COPY"));
const wrongLocale=selectTypographyFamilyV1({...base,typographyRole:"FULLSCREEN_HERO",semanticEvent:"VERDICT",script:"Hant",locale:"zh-Hans-CN"});
assert.equal(wrongLocale.status,"BLOCKED");
const noGlyph=selectTypographyFamilyV1({...base,typographyRole:"PRESENTER_MARKER",semanticEvent:"QUESTION",
  sourceText:"🧬",displayText:"🧬",displayGroups:["🧬"],conversionPairs:[]});
assert.equal(noGlyph.status,"BLOCKED");
assert.ok(noGlyph.reasonCodes.includes("NO_PACKAGED_FAMILY_SUPPORTS_THIS_COPY_AND_ROLE"));

const sequencePenalty=selectTypographyFamilyV1({...base,typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",familyHistory:["HEAVY_GOTHIC","HEAVY_GOTHIC"]});
assert.notEqual(sequencePenalty.selectedFamilyId,"HEAVY_GOTHIC");
const genreCases=[
  {genre:"EVIDENCE_ESSAY",role:"FULLSCREEN_HERO",event:"VERDICT",copy:"證據改變結論",script:"Hant",locale:"zh-Hant-TW"},
  {genre:"EVIDENCE_ESSAY",role:"EVIDENCE_TRANSLATION",event:"EVIDENCE",copy:"樣本範圍",script:"Hant",locale:"zh-Hant-TW"},
  {genre:"PRODUCT_TUTORIAL",role:"PRESENTER_HERO",event:"IDENTITY",copy:"智能写作工具",script:"Hans",locale:"zh-Hans-CN"},
  {genre:"PRODUCT_TUTORIAL",role:"EXPLANATION_DIAGRAM",event:"PROCESS",copy:"先檢查再比較",script:"Hant",locale:"zh-Hant-TW"},
  {genre:"LONG_TAKE_OPINION",role:"FULLSCREEN_HERO",event:"QUESTION",copy:"問題在哪",script:"Hant",locale:"zh-Hant-TW"},
  {genre:"LONG_TAKE_OPINION",role:"CONCLUSION_STAMP",event:"CONCLUSION",copy:"保留自己的判斷",script:"Hant",locale:"zh-Hant-TW"},
].map((item)=>selectTypographyFamilyV1({programMode:item.genre,typographyRole:item.role,semanticEvent:item.event,
  sourceText:item.copy,displayText:item.copy,displayGroups:[item.copy],script:item.script,locale:item.locale,
  selectedRegion:{width:.62,height:.42},familyHistory:[]}));
assert.ok(genreCases.every((item)=>["READY_FOR_VISUAL_COMPARISON","BLOCKED","ROUTE_LOCAL_EXACT_COPY"].includes(item.status)));
assert.ok(genreCases.filter((item)=>item.status==="READY_FOR_VISUAL_COMPARISON").length>=5);
assert.equal(genreCases.filter((item)=>item.status==="ROUTE_LOCAL_EXACT_COPY").length,1);
assert.ok(genreCases.every((item)=>item.status!=="READY_FOR_VISUAL_COMPARISON"||item.candidates[0].fontSha256&&item.candidates[0].glyphGroups.every((group)=>group.missing.length===0)));
assert.ok(new Set(genreCases.filter((item)=>item.selectedFamilyId).map((item)=>item.selectedFamilyId)).size>=3);
console.log(JSON.stringify({contract:"A1TypographyFamilySelectorTest/v1",status:"PASS",cases:14,
  selections:{identity:identity.selectedFamilyId,verdict:verdict.selectedFamilyId,question:question.selectedFamilyId,sequenceContinuation:sequencePenalty.selectedFamilyId},
  genreRoutes:genreCases.map((item)=>({selected:item.selectedFamilyId,status:item.status})),
  checks:["roles-and-events","source-script-locale","exact-font-sha-and-glyph-coverage","visual-reference-preference","long-copy-protection","source-native-skip","sequence-family-history","no-font-fallback","six-blind-typography-assignments-three-genres"],productionAdmission:false},null,2));
