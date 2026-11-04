#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertAutomaticMotionRoute, resolveAutomaticMotionRoute} from "../apps/studio-next/src/lib/a1-automatic-motion-router-v1.mjs";
const cases = [
  [{shotId: "screen", route: "SCREEN_EVIDENCE", versionId: "v", artifactSha256: "a"}, "CAP_NATIVE", "HYPERFRAMES_TIMELINE_AUDIT"],
  [{shotId: "logo", route: "PACKAGE_LOOK_MASTER", versionId: "v", artifactSha256: "a", motionDesignContract: {exactIdentityBinding: true}}, "REMOTION_PIXEL_SAFE", "HYPERFRAMES_STRUCTURE_AUDIT"],
  [{shotId: "actor", route: "PACKAGE_LOOK_MASTER", versionId: "v", artifactSha256: "a", motionDesignContract: {executionRoute: "XIAOYUNQUE_MOTION"}}, "REMOTION_COMPOSITE", "HYPERFRAMES_STRUCTURE_AUDIT"],
  [{shotId: "first-last", route: "PACKAGE_LOOK_MASTER", versionId: "v", artifactSha256: "a", motionDesignContract: {executionRoute: "XIAOYUNQUE_MOTION"}, externalMotionReferencePack: {route: "FIRST_LAST_FRAME_VIDEO_GENERATION", readableTextForbidden: true, providerFinalGeometryForbidden: true}}, "XIAOYUNQUE_FIRST_LAST_REFERENCE", "HYPERFRAMES_STRUCTURE_AUDIT"],
  [{shotId: "unsafe", route: "PACKAGE_LOOK_MASTER", versionId: "v", artifactSha256: "a", motionDesignContract: {formalCopyRequired: true, visualConstructionContract: {independentElementAnimation: "REQUIRES_VERIFIED_ALPHA_SOURCE"}}}, "STATIC_CURRENT_STORYBOARD_HOLD", "HYPERFRAMES_STRUCTURE_AUDIT"],
];
for (const [shot, primary, secondary] of cases) { const route = assertAutomaticMotionRoute(resolveAutomaticMotionRoute(shot)); assert.equal(route.primary === primary || route.fallback === primary, true); assert.equal(route.secondary, secondary); assert.equal(route.userToolChoice, "NONE"); }
console.log(JSON.stringify({status: "PASS", contract: "A1AutomaticMotionRouterTest/v1", cases: cases.length, userToolChoice: "NONE", routes: cases.map(([, primary]) => primary)}, null, 2));
