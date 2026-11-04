#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileTypographyEffectSequenceV1, resolveTypographyEffectV1, typographyEffectCatalog, typographyEffectForbiddenMechanisms} from "../apps/studio-next/src/lib/a1-typography-effect-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const map = JSON.parse(fs.readFileSync(path.join(root, "work/typography-director-v2/whole-film-typography-duty-map.json"), "utf8"));
const blind = JSON.parse(fs.readFileSync(path.join(root, "work/typography-director-v2/blind-fixtures/report.json"), "utf8"));
const catalog = typographyEffectCatalog();
const ledger = map.typographyEffectSequenceLedger;

assert.equal(catalog.length, 10);
assert.equal(ledger.status, "PASS_REVIEW_ONLY");
assert.equal(ledger.shotCount, 34);
assert.equal(ledger.failures.length, 0);
assert.ok(map.summary.effectFamilyCount >= 7);
assert.ok(map.summary.expressiveEffectCount <= 12);
assert.ok(map.summary.noEffectCount >= 20);
assert.equal(map.summary.effectSequenceRiskCount, 0);
assert.ok(map.assignments.filter((item) => ["SOURCE_NATIVE", "NO_TYPE", "CAPTION", "EVIDENCE_HIGHLIGHT"].includes(item.typographyRole)).every((item) => item.effectProgram.effectId === "NONE"));
assert.ok(map.assignments.filter((item) => item.effectProgram.effectId !== "NONE").every((item) => item.effectProgram.outputMode === "TRANSPARENT_GLYPH_ASSET" && item.effectProgram.typographyOnly === true && item.effectProgram.maximumExpressiveEffectsPerFrame === 1));
for (let index = 1; index < map.assignments.length; index += 1) {
  const current = map.assignments[index].effectProgram.effectId;
  const previous = map.assignments[index - 1].effectProgram.effectId;
  assert.ok(current === "NONE" || current !== previous, `adjacent effect repeat:${map.assignments[index].shotId}`);
}

const fixtureResults = blind.reports.map((report) => {
  const compiled = compileTypographyEffectSequenceV1(report.assignments);
  assert.equal(compiled.ledger.status, "PASS_REVIEW_ONLY", report.articleId);
  return {id: report.articleId, genre: report.genre, status: "PASS", effectCounts: compiled.ledger.effectCounts};
});
assert.equal(fixtureResults.length, 6);

assert.equal(resolveTypographyEffectV1({shotId: "generic-source", typographyRole: "SOURCE_NATIVE", programMode: "PRODUCT_TUTORIAL"}).effectId, "NONE");
assert.equal(resolveTypographyEffectV1({shotId: "generic-marker", typographyRole: "PRESENTER_MARKER", programMode: "PRODUCT_TUTORIAL", semanticEvent: "DETAIL"}).effectId, "PIXEL_TRACKING_LOCK");
assert.equal(resolveTypographyEffectV1({shotId: "generic-hero", typographyRole: "PRESENTER_HERO", programMode: "PRODUCT_TUTORIAL", semanticEvent: "IDENTITY"}).effectId, "EVA_COMPRESS");
assert.equal(resolveTypographyEffectV1({shotId: "generic-process", typographyRole: "EXPLANATION_DIAGRAM", programMode: "OBJECT_PROCESS_NARRATIVE", semanticEvent: "PROCESS"}).effectId, "BASELINE_CASCADE");

const serialized = JSON.stringify(catalog).toLowerCase();
for (const forbidden of typographyEffectForbiddenMechanisms()) assert(!serialized.includes(forbidden), forbidden);
for (const file of ["a1-typography-effect-authority-v1.mjs", "a1-glyph-effect-program-v1.mjs", "a1-glyph-operator-system-v1.mjs", "a1-semantic-glyph-behavior-router-v1.mjs", "a1-glyph-motion-material-adapter-v1.mjs"]) {
  const source = fs.readFileSync(path.join(root, "apps/studio-next/src/lib", file), "utf8");
  assert.equal(/ED-\d+/u.test(source), false, `${file} must not contain project shot IDs`);
}

const outputDir = path.join(root, "work/semantic-typography-effect-vocabulary-v1");
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, "blind-fixture-effect-report.json"), `${JSON.stringify({contract: "A1TypographyEffectBlindFixtureReport/v1", status: "PASS", fixtures: fixtureResults, productionAdmission: false}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({contract: "A1TypographyEffectSequenceTest/v1", status: "PASS", shotCount: ledger.shotCount, effectFamilyCount: map.summary.effectFamilyCount, expressiveEffectCount: map.summary.expressiveEffectCount, noEffectCount: map.summary.noEffectCount, fixtureCount: fixtureResults.length, effectCounts: ledger.effectCounts}, null, 2));
