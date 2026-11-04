#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileTypographyReferenceChoicesV1 as decide} from "../apps/studio-next/src/lib/a1-typography-reference-choices-v1.mjs";

const frame = {sha256: "a".repeat(64), width: 1920, height: 1080};
const presenter = decide({typographyRole:"PRESENTER_HERO",carrierType:"PRESENTER",semanticEvent:"IDENTITY",exactCopy:"智能写作工作台",shotVisualContext:{frame},sourceFrameKind:"VERIFIED_REAL_SOURCE",adjacentShotIds:["next"]});
assert.equal(presenter.route,"COMPARE_REFERENCE_MECHANISMS");
assert.equal(presenter.incumbentReference.cell,"01");
assert.equal(presenter.evaAkiraCandidate.status,"ELIGIBLE_FOR_SOURCE_BOUND_COMPARISON");
assert.equal(presenter.evidence.productionAdmission,false);
const bilingual = decide({typographyRole:"PRESENTER_HERO",carrierType:"PRESENTER",semanticEvent:"IDENTITY",exactCopy:"vibe coding\n智能写作工作台",heroCopy:"智能写作工作台",shotVisualContext:{frame},sourceFrameKind:"VERIFIED_REAL_SOURCE"});
assert.equal(bilingual.evaAkiraCandidate.status,"ELIGIBLE_FOR_SOURCE_BOUND_COMPARISON");

const screen = decide({typographyRole:"SOURCE_NATIVE",carrierType:"SCREEN_RECORDING",semanticEvent:"IDENTITY",exactCopy:"智能写作工作台",shotVisualContext:{frame},sourceFrameKind:"VERIFIED_REAL_SOURCE"});
assert.equal(screen.route,"KEEP_SOURCE_NATIVE");
assert.ok(screen.evaAkiraCandidate.reasonCodes.includes("SOURCE_PIXELS_AND_COPY_TAKE_PRIORITY"));

const quiet = decide({typographyRole:"NO_TYPE",carrierType:"PRESENTER",semanticEvent:"ORDINARY",shotVisualContext:{frame},sourceFrameKind:"VERIFIED_REAL_SOURCE"});
assert.equal(quiet.route,"KEEP_QUIET");

const compositeOnly = decide({typographyRole:"FULLSCREEN_HERO",carrierType:"FULLSCREEN_IMAGE",semanticEvent:"VERDICT",exactCopy:"完成度很高的废稿",shotVisualContext:{frame},sourceFrameKind:"CURRENT_BOARD_COMPOSITE"});
assert.ok(compositeOnly.evaAkiraCandidate.reasonCodes.includes("VERIFIED_REAL_SOURCE_FRAME_REQUIRED"));
assert.equal(compositeOnly.evidence.sourceFrameSha256,null);

const longCopy = decide({typographyRole:"PRESENTER_HERO",carrierType:"PRESENTER",semanticEvent:"IDENTITY",exactCopy:"这是一句很长的中文主标题，不能照搬成窄字",shotVisualContext:{frame},sourceFrameKind:"VERIFIED_REAL_SOURCE"});
assert.ok(longCopy.evaAkiraCandidate.reasonCodes.includes("HERO_COPY_TOO_LONG_FOR_CURRENT_CANDIDATE"));

const object = decide({typographyRole:"OBJECT_ATTACHED_LABEL",carrierType:"OBJECT_DETAIL",semanticEvent:"DETAIL",exactCopy:"操作按钮",shotVisualContext:{frame},sourceFrameKind:"VERIFIED_REAL_SOURCE"});
assert.equal(object.evaAkiraCandidate.status,"NOT_ELIGIBLE_ON_THIS_INPUT");
assert.ok(object.evaAkiraCandidate.reasonCodes.includes("VISIBLE_OBJECT_ANCHOR_REQUIRED"));
const anchoredObject = decide({typographyRole:"OBJECT_ATTACHED_LABEL",carrierType:"OBJECT_DETAIL",semanticEvent:"DETAIL",exactCopy:"操作按钮",shotVisualContext:{frame,visibleObject:true},sourceFrameKind:"VERIFIED_REAL_SOURCE"});
assert.equal(anchoredObject.incumbentReference.cell,"03");
assert.ok(anchoredObject.evaAkiraCandidate.reasonCodes.includes("EVA_RESERVED_FOR_SHORT_HERO_DUTY"));

console.log(JSON.stringify({contract:"A1TypographyReferenceChoicesTest/v1",status:"PASS",checks:["presenter-eva-comparison-only","bilingual-hero-group","screen-native","quiet-beat","composite-not-real-source","long-copy-blocked","object-anchor-required","anchored-object-uses-scene-reference","production-remains-locked"]}));
