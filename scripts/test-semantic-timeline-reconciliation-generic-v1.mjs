#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

import {buildShotIntelligenceDecisionSet, reconcileSemanticTimelineRevision} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {deriveSemanticTimelineReconciliationScope} from "../apps/studio-next/src/lib/a1-semantic-timeline-decision-v1.mjs";

const base = [
  {shotId: "ARTICLE-A-01", order: 1, sourceText: "这一段提出一个明确机制。", editMode: "presenter-base", semanticRole: "chapter-turn", packagingType: "EXPLAINER_PACKAGE", valueAdded: 6, typeFit: 2, mechanismId: "mechanism:article-a"},
  {shotId: "ARTICLE-A-02", order: 2, sourceText: "打开真实页面证明这个机制。", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
];
const first = buildShotIntelligenceDecisionSet({beats: base, sourceHash: "article-a", projectId: "article-a", now: "2026-08-06T00:00:00.000Z"});
const changedBeats = [base[0], {...base[1], sourceText: "打开设置调字号。"}];
const rebuilt = reconcileSemanticTimelineRevision({decisionSet: first, beats: changedBeats, sourceHash: "article-a", projectId: "article-a", now: "2026-08-06T00:00:00.000Z"});
assert.equal(rebuilt.invalidated, true);
assert.equal(rebuilt.revision.status, "RECOMPILED");
const scope = deriveSemanticTimelineReconciliationScope({previousDecisionSet: first, nextDecisionSet: rebuilt.decisionSet});
assert.deepEqual(scope.targetShotIds, ["ARTICLE-A-01", "ARTICLE-A-02"]);
assert.equal(scope.targetShotIds.includes("ED-01"), false);
assert.equal(rebuilt.decisionSet.items[0].shotId, "ARTICLE-A-01");

const source = fs.readFileSync(new URL("./reconcile-semantic-timeline-package-boundaries-v1.mjs", import.meta.url), "utf8");
assert.equal(/required-ed01|ed01Decision|ED-01/u.test(source), false, "reconciliation must not contain an ED-01-only requirement");

console.log(JSON.stringify({status: "PASS", articleShotIds: scope.targetShotIds, scope: scope.scope, rebuilt: rebuilt.invalidated, ed01SpecificRequirement: false}, null, 2));
