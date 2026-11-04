#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {auditWholeFilmTypographyRhythm, buildActualTypographyVisualFingerprint} from "../apps/studio-next/src/lib/a1-whole-film-typography-rhythm-audit-v1.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-typography-fingerprint-"));
const make = async (name, background, accent) => {
  const file = path.join(dir, name);
  const svg = Buffer.from(`<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="180" fill="${background}"/><rect x="20" y="20" width="210" height="54" fill="${accent}"/><rect x="30" y="112" width="150" height="26" fill="${accent}"/></svg>`);
  await sharp(svg).png().toFile(file);
  return file;
};
const firstFile = await make("first.png", "#f2ecdf", "#111315");
const secondFile = await make("second.png", "#f0eadc", "#111315");
const first = await buildActualTypographyVisualFingerprint({file: firstFile, artifactSha256: "1".repeat(64)});
const second = await buildActualTypographyVisualFingerprint({file: secondFile, artifactSha256: "2".repeat(64)});
assert.equal(first.source, "ACTUAL_PNG");
assert.equal(second.source, "ACTUAL_PNG");
const decisions = [
  {shotId: "T-01", order: 1, packageDecision: "PACKAGE", assemblyMode: "TYPOGRAPHY", presentationMode: "TYPOGRAPHY", strongLanguageEvent: true, typographyActor: true, typographyTreatment: "QUESTION_OVERLAY", protectedPhrases: []},
  {shotId: "T-02", order: 2, packageDecision: "PACKAGE", assemblyMode: "TYPOGRAPHY", presentationMode: "TYPOGRAPHY", strongLanguageEvent: true, typographyActor: true, typographyTreatment: "VERDICT_OVERLAY", protectedPhrases: []},
];
const audit = auditWholeFilmTypographyRhythm({decisionSet: {items: decisions}, coveragePlan: {shotPlans: decisions.map((item) => ({...item, route: "PACKAGE_LOOK_MASTER", eventGrouping: {mode: item.assemblyMode}}))}, videoPackagingContexts: {items: decisions.map((item) => ({shotId: item.shotId, assemblyMode: item.assemblyMode, presentationMode: item.presentationMode}))}, visualFingerprints: {"T-01": first, "T-02": second}});
assert.equal(audit.adjacentVisualPairs[0].fromFingerprintSource, "ACTUAL_PNG");
assert.equal(audit.adjacentVisualPairs[0].toFingerprintSource, "ACTUAL_PNG");
assert.ok(audit.adjacentVisualPairs[0].similarity >= 0.86, "the audit must use actual PNG similarity, not only semantic labels");
fs.rmSync(dir, {recursive: true, force: true});
console.log(JSON.stringify({status: "PASS", contract: "A1WholeFilmTypographyVisualFingerprint/v1", source: "ACTUAL_PNG", adjacentPairCount: audit.adjacentVisualPairs.length, similarity: audit.adjacentVisualPairs[0].similarity}, null, 2));
