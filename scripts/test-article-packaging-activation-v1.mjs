#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import {isArticlePackagingProductionActive} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";

const workspace = JSON.parse(fs.readFileSync("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json", "utf8"));
const currentKit = workspace.production.articlePackagingKit;

assert.equal(isArticlePackagingProductionActive(workspace), false, "review-required kit must not activate production");

const approved = structuredClone(workspace);
approved.production.articlePackagingKit = {
  ...currentKit,
  status: "approved",
  review: {status: "approved", approvedKitSha256: currentKit.kitSha256},
  gates: {...currentKit.gates, assetBindingsComplete: true, shotCompositionAllowed: true},
};
assert.equal(isArticlePackagingProductionActive(approved), true, "only an exact approved kit may activate production");

const stale = structuredClone(approved);
stale.production.articlePackagingKit.review.approvedKitSha256 = "stale-kit-hash";
assert.equal(isArticlePackagingProductionActive(stale), false, "stale approval must deactivate production");

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ArticlePackagingActivation/v1",
  cases: ["REVIEW_REQUIRED", "APPROVED_EXACT_BINDINGS", "STALE_APPROVAL"],
}, null, 2));
