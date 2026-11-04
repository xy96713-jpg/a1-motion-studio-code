#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const boardPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
const expected = new Set(board.screenEvidenceStaticReview?.shotIds || board.timelineItems?.filter((item) => item.presentationRoute === "SOURCE_COLLAGE").map((item) => item.shotId) || []);
const reviewPrefix = "/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/static-review-v1/";
const screenItems = (board.timelineItems || []).filter((item) => expected.has(item.shotId));
assert.equal(screenItems.length, expected.size, "static-board-screen-count");
for (const item of screenItems) {
  assert.equal(item.presentationRoute, "SOURCE_COLLAGE", `static-board-route:${item.shotId}`);
  assert.equal(item.annotationRoute, "CROP_ANNOTATION", `static-board-annotation:${item.shotId}`);
  assert.equal(item.sourceWindowRoute, "SOURCE_WINDOW", `static-board-source-window:${item.shotId}`);
  assert.ok(item.previewPublicUrl.startsWith(reviewPrefix), `static-board-preview:${item.shotId}`);
  assert.ok(item.sourcePreviewPublicUrl?.startsWith("/generated/system-line/editorial-asset-workbench-v1/") && !item.sourcePreviewPublicUrl.includes("/static-review-v1/"), `static-board-raw-source:${item.shotId}`);
  assert.equal(item.reviewOnly, true, `static-board-review-only:${item.shotId}`);
  assert.equal(item.productionAdmission, false, `static-board-production-admission:${item.shotId}`);
}
console.log(JSON.stringify({status: "PASS", contract: "A1StaticBoardScreenEvidenceRoutes/v1", screenShotCount: screenItems.length, reviewOnly: true, productionAdmission: false, boardStatus: board.status}, null, 2));
