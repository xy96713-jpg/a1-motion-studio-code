#!/usr/bin/env node
import assert from "node:assert/strict";

const response = await fetch("http://127.0.0.1:4311/system-line-storyboard", {cache: "no-store"});
assert.equal(response.status, 200);
const html = await response.text();
assert.match(html, /data-a1-action-contract="ED-01"/u);
assert.match(html, /全屏智能写作工作台建立产品身份/u);
assert.match(html, /工作台全屏保持/u);
assert.match(html, /交回真人讲述/u);
assert.match(html, /ED-02_REAL_OPERATION/u);
assert.match(html, /0\.00–3\.35s/u);
assert.match(html, /data-a1-storyboard-overview-count="34"/u);
assert.match(html, /data-a1-live-refresh=/u);
assert.match(html, /data-a1-bulk-editor=/u);
assert.match(html, /data-a1-mature-screen-capture="4\/16"/u);
console.log(JSON.stringify({status: "PASS", contract: "A1CurrentStoryboardActionContractDomTest/v1", shotId: "ED-01"}, null, 2));
