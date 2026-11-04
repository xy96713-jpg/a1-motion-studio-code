#!/usr/bin/env node
import assert from "node:assert/strict";
import {A1_TYPOGRAPHY_EXCLUDED_REFERENCE_CELLS_V1, A1_TYPOGRAPHY_REFERENCE_MECHANISMS_V1, resolveTypographyUserStyleV1} from "../apps/studio-next/src/lib/a1-typography-user-style-profile-v1.mjs";

const frame = {sha256:"a".repeat(64), width:1920, height:1080};
const route = (input) => resolveTypographyUserStyleV1(input);

const screen = route({carrierType:"SCREEN_RECORDING", typographyRole:"SOURCE_NATIVE", semanticEvent:"IDENTITY", typeIntent:"HERO", shotVisualContext:{frame}});
assert.equal(screen.status,"KEEP_NATIVE_OR_QUIET");
assert.equal(screen.selectedReferenceCell,null);

const presenterIntro = route({carrierType:"PRESENTER", typographyRole:"PRESENTER_HERO", semanticEvent:"IDENTITY", typeIntent:"HERO", shotVisualContext:{frame}});
assert.equal(presenterIntro.selectedReferenceCell,"01");
assert.equal(presenterIntro.status,"REFERENCE_MECHANISM_PROPOSAL");

const presenterTakeover = route({carrierType:"PRESENTER", typographyRole:"PRESENTER_HERO", semanticEvent:"STRONG_CONTRAST", typeIntent:"MASKED_HERO", importance:.95, shotVisualContext:{frame}});
assert.equal(presenterTakeover.selectedReferenceCell,"02");
assert.equal(presenterTakeover.requirements.registeredMatteRequiredOnlyIfTypeCrossesProtectedPerson,"yes");

const fullSpread = route({carrierType:"FULLSCREEN_IMAGE", typographyRole:"FULLSCREEN_HERO", semanticEvent:"CHAPTER_BREAK", shotVisualContext:{frame}});
assert.equal(fullSpread.selectedReferenceCell,"03");
const spatial = route({carrierType:"FULLSCREEN_IMAGE", typographyRole:"FULLSCREEN_HERO", semanticEvent:"PROCESS", shotVisualContext:{frame,anchors:[{id:"doorway-axis",kind:"architecture"}]}});
assert.equal(spatial.selectedReferenceCell,"04");
const quiet = route({carrierType:"PRESENTER", typographyRole:"PRESENTER_MARKER", semanticEvent:"QUESTION", shotVisualContext:{frame}});
assert.equal(quiet.selectedReferenceCell,"05");

const objectBound = route({carrierType:"OBJECT_DETAIL", typographyRole:"OBJECT_ATTACHED_LABEL", semanticEvent:"DETAIL", shotVisualContext:{frame,visibleObject:true}});
assert.equal(objectBound.selectedReferenceCell,"03");
const objectSpatial = route({carrierType:"OBJECT_DETAIL", typographyRole:"OBJECT_ATTACHED_LABEL", semanticEvent:"DETAIL", shotVisualContext:{frame,anchors:[{id:"tool-axis",kind:"perspective"}]}});
assert.equal(objectSpatial.selectedReferenceCell,"04");
const objectUnbound = route({carrierType:"OBJECT_DETAIL", typographyRole:"OBJECT_ATTACHED_LABEL", semanticEvent:"DETAIL"});
assert.equal(objectUnbound.status,"NEEDS_VISUAL_CONTEXT");
assert.equal(objectUnbound.selectedReferenceCell,null);

const ordinaryCaption = route({typographyRole:"CAPTION", semanticEvent:"ORDINARY", carrierType:"PRESENTER"});
assert.equal(ordinaryCaption.selectedReferenceCell,null);
assert.equal(A1_TYPOGRAPHY_EXCLUDED_REFERENCE_CELLS_V1["06"],"EXCLUDED_BY_USER_TOO_CLOSE_TO_ORDINARY_SUBTITLE");
assert.equal(Object.values(A1_TYPOGRAPHY_REFERENCE_MECHANISMS_V1).some((item)=>item.cell==="06"),false);

console.log(JSON.stringify({contract:"A1TypographyUserStyleProfileTest/v1",status:"PASS",checks:["screen-recording-native","presenter-hero-reference","masked-glyph-takeover","full-image-spread","spatial-axis-binding","quiet-presenter-beat","object-bound-type-not-subtitle","unbound-object-waits-for-context","ordinary-caption-not-styled-as-hero","user-excluded-cell-06"]},null,2));
