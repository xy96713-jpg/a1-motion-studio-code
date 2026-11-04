#!/usr/bin/env node

import assert from "node:assert/strict";
import {compileCurrentStoryboardMotionDesignAuthority} from "../apps/studio-next/src/lib/a1-current-storyboard-motion-design-authority-v1.mjs";

const sha = (char) => char.repeat(64);
const actionContract = {before: "stable source", hold: "one semantic response", after: "readable result", handoff: "next beat"};
const shots = [
  {shotId: "FIXTURE_ENTITY", order: 1, versionId: "entity-v1", artifactPublicUrl: "/current/entity.png", artifactSha256: sha("a"), revisionSha256: sha("b"), route: "PACKAGE_LOOK_MASTER", packageType: "EXPLAINER_PACKAGE", source: "GENERATED_EDITORIAL", semanticJob: "accumulate verified entities", actionContract},
  {shotId: "FIXTURE_EVIDENCE", order: 2, versionId: "evidence-v1", artifactPublicUrl: "/current/evidence.png", artifactSha256: sha("c"), revisionSha256: sha("d"), route: "PACKAGE_LOOK_MASTER", packageType: "EXPLAINER_PACKAGE", source: "REAL_SOURCE", semanticJob: "reveal bounded evidence", actionContract},
  {shotId: "FIXTURE_GENERATIVE", order: 3, versionId: "generative-v1", artifactPublicUrl: "/current/generative.png", artifactSha256: sha("e"), revisionSha256: sha("f"), route: "PACKAGE_LOOK_MASTER", packageType: "EXPLAINER_PACKAGE", source: "GENERATED_EDITORIAL", semanticJob: "move one independent textless actor", actionContract},
  {shotId: "FIXTURE_SCREEN", order: 4, versionId: "screen-v1", artifactPublicUrl: "/current/screen.png", artifactSha256: sha("1"), revisionSha256: sha("2"), route: "SCREEN_EVIDENCE", packageType: null, source: "REAL_SOURCE", semanticJob: "show real operation", actionContract},
];
const workspace = {production: {shotIntelligence: {currentStoryboardAuthority: {contract: "A1CurrentStoryboardAuthority/v1", current: true, lastRevisionSha256: sha("3"), updatedAt: "2026-09-02T00:00:00.000Z", shots}}, shotVisualCoveragePlan: {shotPlans: shots.map((shot) => ({shotId: shot.shotId, packageType: shot.packageType}))}}};
const compiled = compileCurrentStoryboardMotionDesignAuthority(workspace, {identityBindings: [{shotId: "FIXTURE_ENTITY", exactPixelRebindRequired: true}]});
assert.equal(compiled.report.status, "READY_FOR_USER_MOTION_DESIGN_REVIEW");
assert.equal(compiled.report.readyCount, 4);
assert.deepEqual(compiled.report.routeCounts, {LOCAL_DETERMINISTIC_MOTION: 1, LOCAL_EVIDENCE_MOTION: 1, SCREEN_CAP_NATIVE: 1, XIAOYUNQUE_MOTION: 1});
assert.equal(compiled.contractsByShotId.get("FIXTURE_ENTITY").review.userVisualApproval, "NOT_APPROVED");
const blocked = structuredClone(workspace);blocked.production.shotIntelligence.currentStoryboardAuthority.shots[0].artifactSha256 = null;
assert.equal(compileCurrentStoryboardMotionDesignAuthority(blocked).report.blockedCount, 1);
console.log(JSON.stringify({status: "PASS", contract: "A1CurrentStoryboardMotionDesignAuthorityTest/v1", fixtureGenres: ["verified-entity", "research-evidence", "textless-generative-actor", "real-screen-operation"], routes: compiled.report.routeCounts, missingShaBlocked: true}, null, 2));
