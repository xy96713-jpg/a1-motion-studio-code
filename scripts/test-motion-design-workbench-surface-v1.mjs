#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const authority = workspace.production?.shotIntelligence?.currentStoryboardAuthority;
const component = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/GlobalStoryboardReviewPanel.tsx"), "utf8");
assert.equal(authority?.contract, "A1CurrentStoryboardAuthority/v1");
assert.equal(authority.shots.length, 34);
assert.equal(authority.shots.every((shot) => shot.motionDesignContract?.contract === "A1StoryboardMotionDesignContract/v1"), true);
assert.equal(authority.shots.every((shot) => shot.motionDesignContract.source.versionId === shot.versionId && shot.motionDesignContract.source.artifactSha256 === shot.artifactSha256), true);
assert.equal(authority.shots.every((shot) => shot.motionDesignContract.review?.userVisualApproval === "NOT_APPROVED" && shot.motionDesignContract.review?.productionAdmission === false), true);
for (const marker of ["motionDesignContract", "动作机制", "choreographyBlueprint", "motionPrimitiveIds", "forbiddenTechniques", "查看包装与动作", "expandedShotId"]) assert.ok(component.includes(marker), `motion-design-workbench-marker-missing:${marker}`);
assert.equal(component.includes('"画面描述 / 动作"'), false, "storyboard-overview-must-not-present-engineering-detail-as-a-primary-column");
console.log(JSON.stringify({status: "PASS", contract: "A1MotionDesignWorkbenchSurfaceTest/v1", shotCount: authority.shots.length, storyboardAuthorityIsSoleMotionDesignSource: true, pageShowsStoryboardFirstAndMotionDetailsOnDemand: true, machineCompileDoesNotApprove: true}, null, 2));
