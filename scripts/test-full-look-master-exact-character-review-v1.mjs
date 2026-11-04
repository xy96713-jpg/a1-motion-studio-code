#!/usr/bin/env node

import assert from "node:assert/strict";

import {exactCharacterReviewPass} from "../apps/studio-next/src/lib/a1-full-look-master-visual-director-review-v1.mjs";

const review = {
  decision: "PASS",
  exactCharacterVerification: {
    status: "PASS",
    expected: "材料不够|角度不清|泛泛而谈",
    observedLines: ["材料不够", "角度不清", "泛泛而谈"],
  },
};

assert.equal(exactCharacterReviewPass(review, ["材料不够", "角度不清", "泛泛而谈"]), true);
assert.equal(exactCharacterReviewPass({...review, decision: "REJECT"}, ["材料不够", "角度不清", "泛泛而谈"]), false);
assert.equal(exactCharacterReviewPass({...review, exactCharacterVerification: {...review.exactCharacterVerification, observedLines: ["材料不够", "角度不清"]}}, ["材料不够", "角度不清", "泛泛而谈"]), false);
assert.equal(exactCharacterReviewPass({...review, exactCharacterVerification: {...review.exactCharacterVerification, expected: "材料不够|角度不清"}}, ["材料不够", "角度不清", "泛泛而谈"]), false);

console.log(JSON.stringify({status: "PASS", test: "full-look-master-exact-character-review-v1"}, null, 2));
