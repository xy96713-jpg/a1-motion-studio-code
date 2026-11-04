#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {assertExternalSourceAssetEffectGrammar} from "../apps/studio-next/src/lib/a1-external-source-asset-effect-grammar-v2.mjs";

const root = process.cwd();
const base = path.join(root, "work/external-source-asset-effect-grammar-v2");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(base, relative), "utf8"));
const events = read("events.json");
const grammar = assertExternalSourceAssetEffectGrammar(read("grammar.json"));
const blind = read("blind-test/result.json");
const pixel = read("blind-test/actual-pixel-review.json");
const result = read("result.json");

assert.equal(events.status, "PASS");
assert.equal(events.eventCount, 39);
assert.equal(events.creatorIds.length, 7);
assert.equal(events.creatorIds.includes("covacut"), false);
assert.equal(events.events.every((event) => event.frameEvidence.length >= 3), true);
assert.equal(events.events.every((event) => event.productionAssetAllowed === false), true);
assert.equal(grammar.frequency.SOURCE_PRESERVE.eventCount, 33);
assert.equal(grammar.frequency.CLEAN_CUTOUT.eventCount, 6);
assert.equal(grammar.frequency.CONTRAST_STROKE.eventCount, 4);
assert.equal(grammar.frequency.HALFTONE_ECHO.eventCount, 0);
assert.deepEqual(grammar.routing.default.DOCUMENT_EVIDENCE, ["SOURCE_PRESERVE"]);
assert.deepEqual(grammar.routing.default.PERSON_SUBJECT, ["CLEAN_CUTOUT"]);
assert.ok(grammar.routing.forbidden.includes("FULL_FRAME_BACKGROUND_FROM_ONE_SEARCH_IMAGE"));
assert.equal(blind.fixtureCount, 6);
assert.deepEqual([...blind.genres].sort(), ["document", "person", "scene"]);
assert.equal(blind.results.every((item) => item.artifact.hasAlpha && item.artifact.alphaMin === 0 && item.artifact.alphaMax === 255), true);
assert.equal(blind.results.every((item) => item.fullFrameBackground === false && item.visibleCopy === false && item.productionAdmission === false), true);
assert.equal(pixel.status, "PASS_WITH_SOURCE_LIMITS");
assert.equal(pixel.gates.excludedReferencePresent, false);
assert.equal(result.status, "PASS");
assert.equal(result.boundary.storyboardMutationPerformed, false);
assert.equal(result.boundary.productionAdmission, false);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ExternalSourceAssetEffectGrammarQualificationTest/v2",
  eventCount: events.eventCount,
  creatorCount: events.creatorIds.length,
  excludedSourceIds: grammar.evidence.excludedSourceIds,
  blindFixtureCount: blind.fixtureCount,
  genres: blind.genres,
  defaults: grammar.routing.default,
  frequency: {
    sourcePreserve: grammar.frequency.SOURCE_PRESERVE,
    cleanCutout: grammar.frequency.CLEAN_CUTOUT,
    contrastStroke: grammar.frequency.CONTRAST_STROKE,
    contactShadow: grammar.frequency.CONTACT_SHADOW,
  },
}, null, 2));
