#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {auditWholeFilmMinimalEditorialComposition} from "../apps/studio-next/src/lib/a1-whole-film-minimal-composition-v1.mjs";

const workspace = JSON.parse(fs.readFileSync("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json", "utf8"));
workspace.production.creatorPackagingProjectOverrides = JSON.parse(fs.readFileSync("apps/studio-next/src/data/system-line-creator-packaging-overrides-v1.json", "utf8"));
workspace.production.canonicalCreatorPackagingSequence = buildCanonicalCreatorPackagingSequence(workspace, {now: "2026-08-15T08:00:00.000Z"});
const packageDecisions = workspace.production.canonicalCreatorPackagingSequence.decisions.filter((decision) => decision.packageDecision === "PACKAGE");
assert.deepEqual(packageDecisions.map((decision) => decision.shotId), ["ED-01", "ED-07", "ED-09", "ED-10", "ED-12", "ED-13", "ED-14", "ED-16", "ED-17", "ED-19", "ED-31", "ED-34"]);
assert.deepEqual(packageDecisions.filter((decision) => decision.contentTreatment === "HERO_TYPOGRAPHY" && decision.frameOccupation === "FULL_FRAME_TAKEOVER").map((decision) => decision.shotId), ["ED-10", "ED-34"]);
assert.deepEqual(workspace.production.canonicalCreatorPackagingSequence.decisions.filter((decision) => ["ED-10", "ED-17", "ED-33"].includes(decision.shotId)).map((decision) => decision.packageDecision), ["PACKAGE", "PACKAGE", "NO_PACKAGE"]);

const board = {
  items: packageDecisions.map((decision) => ({
    shotId: decision.shotId,
    styleLineage: {minimalCompositionAudit: {contract: "A1ShotMinimalEditorialCompositionAudit/v1", status: "PASS", actualPixelsViewed: true, primaryActorCount: 1, semanticActionCount: 1, decorativeMotifCount: 0, referenceConstructionMatch: "PASS", independentPosterProduct: false}},
  })),
  timelineBoard: {
    items: workspace.production.canonicalCreatorPackagingSequence.decisions.map((decision) => ({
      shotId: decision.shotId,
      route: decision.packageDecision === "PACKAGE" ? "PACKAGE_LOOK_MASTER" : decision.route,
      routeLabel: decision.packageDecision === "PACKAGE" ? `${decision.presentationMode} PACKAGE` : decision.route === "SCREEN_EVIDENCE" ? "真实录屏" : "人物画面",
      titleRole: decision.packageDecision === "PACKAGE" && decision.contentTreatment === "HERO_TYPOGRAPHY" && decision.frameOccupation === "FULL_FRAME_TAKEOVER" ? "HERO_TAKEOVER" : "NONE",
      packageBoardItem: decision.packageDecision === "PACKAGE",
    })),
  },
};
assert.equal(auditWholeFilmMinimalEditorialComposition({workspace, board}).status, "PASS");
const posterDrift = structuredClone(workspace);
for (const id of ["ED-07", "ED-09", "ED-10"]) {
  const decision = posterDrift.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.shotId === id);
  decision.packageDecision = "PACKAGE";
  decision.contentTreatment = "HERO_TYPOGRAPHY";
  decision.frameOccupation = "FULL_FRAME_TAKEOVER";
}
assert.equal(auditWholeFilmMinimalEditorialComposition({workspace: posterDrift, board}).status, "BLOCK");
const missingPixelReview = structuredClone(board);
delete missingPixelReview.items[0].styleLineage.minimalCompositionAudit;
assert.equal(auditWholeFilmMinimalEditorialComposition({workspace, board: missingPixelReview}).status, "BLOCK");
console.log(JSON.stringify({status: "PASS", contract: "A1WholeFilmMinimalEditorialCompositionAudit/v1", packageCount: packageDecisions.length, standaloneTypographyTakeovers: ["ED-10", "ED-34"], breathingBeats: ["ED-08", "ED-33"]}, null, 2));
