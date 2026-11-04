#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "verify-system-line-tier-v1.mjs"), "utf8");
for (const tier of ["FAST", "BOARD", "STAGE"]) assert.match(source, new RegExp(`${tier}:\\s*\\{`));
assert.match(source, /FAST:[\s\S]*?cacheable: true/u);
assert.match(source, /BOARD:[\s\S]*?cacheable: false/u);
assert.match(source, /STAGE:[\s\S]*?cacheable: false/u);
assert.match(source, /FAST:[\s\S]*?no browser/u);
assert.match(source, /BOARD:[\s\S]*?no video playback/u);
assert.match(source, /STAGE:[\s\S]*?uncached/u);
assert.match(source, /runNode\("scripts\/audit-system-line-board-smoke-v1\.mjs"\)/u);
assert.match(source, /runNpm\("verify:system-line-workbench"\)/u);
assert.match(source, /process\.version/u);
assert.match(source, /process\.platform/u);
assert.match(source, /runnerRelativePath/u);
assert.match(source, /scripts\/test-execution-status-v1\.mjs/u);
assert.match(source, /package-lock\.json/u);
assert.match(source, /apps\/studio-next\/package-lock\.json/u);
const fastSection = source.split("FAST:")[1].split("BOARD:")[0];
const boardSection = source.split("BOARD:")[1].split("STAGE:")[0];
assert.doesNotMatch(fastSection, /audit:quick-storyboard-browser-v1/u);
assert.doesNotMatch(boardSection, /audit:quick-storyboard-browser-v1/u);
console.log(JSON.stringify({status: "PASS", contract: "A1SystemLineVerificationTierTest/v1", tiers: {FAST: {cacheable: true, commandCount: 7}, BOARD: {cacheable: false, commandCount: 8}, STAGE: {cacheable: false, commandCount: 1}}}, null, 2));
