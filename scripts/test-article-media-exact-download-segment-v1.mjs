#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
const orchestration=JSON.parse(fs.readFileSync("work/article-media-orchestration-v1/result.json","utf8"));
assert.equal(orchestration.checks.articleUnderstandingExact,true);
assert.equal(orchestration.checks.honestNoMatchPreserved,true);
assert.equal(orchestration.checks.candidateSelectionAutomatic,false);
console.log(JSON.stringify({contract:"A1ArticleMediaExactDownloadTest/v1",status:"PASS",articleCount:orchestration.fixtures.length,honestNoMatch:true},null,2));
