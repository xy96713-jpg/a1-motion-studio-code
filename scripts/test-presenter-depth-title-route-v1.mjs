#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertPresenterDepthTitleRoute, derivePresenterDepthTitleRoute} from "../apps/studio-next/src/lib/a1-presenter-depth-title-route-v1.mjs";

const matte = {realPixelSource: true, staticMattePass: true, dynamicMattePass: false, protectionScope: "PRESENTER_ONLY", sourceSha256: "a".repeat(64), matteSha256: "b".repeat(64)};
const identity = derivePresenterDepthTitleRoute({semanticEvent: "IDENTITY", title: "智能写作工作台", chapterId: "opening", atSeconds: 2, baseVisualCarrier: "PRESENTER_BASE", matte});
const dynamicConclusion = derivePresenterDepthTitleRoute({semanticEvent: "CONCLUSION", title: "可控工作流", chapterId: "closing", atSeconds: 193, baseVisualCarrier: "PRESENTER_BASE", matte: {...matte, dynamicMattePass: true}});
const ordinary = derivePresenterDepthTitleRoute({semanticEvent: "ORDINARY", title: "继续解释", chapterId: "opening", atSeconds: 12, baseVisualCarrier: "PRESENTER_BASE", matte});
const tooLong = derivePresenterDepthTitleRoute({semanticEvent: "STRONG_CONTRAST", title: "这是一句不应该塞进人物背后的超长解释标题", chapterId: "middle", atSeconds: 60, baseVisualCarrier: "PRESENTER_BASE", matte});
const noMatte = derivePresenterDepthTitleRoute({semanticEvent: "STRONG_CONTRAST", title: "问题还在", chapterId: "middle", atSeconds: 60, baseVisualCarrier: "PRESENTER_BASE", matte: {realPixelSource: false}});
const unifiedForeground = derivePresenterDepthTitleRoute({semanticEvent: "STRONG_CONTRAST", title: "问题还在", chapterId: "middle", atSeconds: 60, baseVisualCarrier: "PRESENTER_BASE", matte: {...matte, protectionScope: "PRESENTER_MICROPHONE_BOOM_UNIFIED"}});
const complex = derivePresenterDepthTitleRoute({semanticEvent: "CONCLUSION", title: "四步流程", chapterId: "closing", atSeconds: 193, baseVisualCarrier: "PRESENTER_BASE", semanticComplexity: "COMPLEX_EXPLANATORY_STRUCTURE", matte});
const repeated = derivePresenterDepthTitleRoute({semanticEvent: "CONCLUSION", title: "再来一次", chapterId: "closing", atSeconds: 200, baseVisualCarrier: "PRESENTER_BASE", matte, priorEvents: [{route: "PRESENTER_DEPTH_TITLE_FREEZE", chapterId: "closing", atSeconds: 193}]});
const wrongTypographyRole = derivePresenterDepthTitleRoute({semanticEvent: "IDENTITY", typographyRole: "PIXEL_DETAIL_TYPE", title: "智能写作工作台", chapterId: "opening", atSeconds: 2, baseVisualCarrier: "PRESENTER_BASE", matte});

for (const result of [identity, dynamicConclusion, ordinary, tooLong, noMatte, unifiedForeground, complex, repeated, wrongTypographyRole]) assertPresenterDepthTitleRoute(result);
assert.equal(identity.route, "PRESENTER_DEPTH_TITLE_FREEZE");
assert.equal(identity.status, "READY_FOR_STATIC_BOARD");
assert.equal(identity.typographyAuthority.role, "HERO_GENERATED_TYPE");
assert.equal(identity.typographyAuthority.visibleOwner, "IMAGEGEN_GENERATED_GLYPH_BOARD");
assert.equal(identity.typographyAuthority.editableShadowRequired, true);
assert.equal(identity.typographyAuthority.titleScaleRatioFromFirstCanary, 0.825);
assert.equal(dynamicConclusion.route, "PRESENTER_DEPTH_TITLE_DYNAMIC");
assert.equal(ordinary.route, "PRESENTER_LOCAL_MARKER");
assert.equal(tooLong.route, "PRESENTER_LOCAL_MARKER");
assert.equal(noMatte.route, "PRESENTER_LOCAL_MARKER");
assert.equal(unifiedForeground.route, "PRESENTER_LOCAL_MARKER");
assert.ok(unifiedForeground.failures.includes("PRESENTER_ONLY_MATTE_REQUIRED"));
assert.equal(complex.route, "FULLSCREEN_EXPLAINER_TAKEOVER");
assert.equal(repeated.route, "PRESENTER_LOCAL_MARKER");
assert.ok(repeated.failures.includes("CHAPTER_DEPTH_TITLE_BUDGET_EXHAUSTED"));
assert.ok(repeated.failures.includes("DEPTH_TITLE_EVENTS_TOO_CLOSE"));
assert.equal(wrongTypographyRole.route, "PRESENTER_LOCAL_MARKER");
assert.ok(wrongTypographyRole.failures.includes("PRESENTER_DEPTH_TITLE_REQUIRES_GENERATED_HERO_TYPE"));

console.log(JSON.stringify({status: "PASS", contract: "A1PresenterDepthTitleRouteTest/v1", routes: {identity: identity.route, dynamicConclusion: dynamicConclusion.route, ordinary: ordinary.route, tooLong: tooLong.route, noMatte: noMatte.route, unifiedForeground: unifiedForeground.route, complex: complex.route, repeated: repeated.route, wrongTypographyRole: wrongTypographyRole.route}}, null, 2));
