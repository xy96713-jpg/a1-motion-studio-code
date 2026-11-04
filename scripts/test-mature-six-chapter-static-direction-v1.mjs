#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/mature-six-chapter-static-direction-v1/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(`mature-six-chapter-static-direction-v1:${message}`); };

assert(manifest.contract === "A1MatureSixChapterStaticDirection/v1", "contract");
assert(manifest.status === "READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY", "status");
assert(manifest.summary.shotCount === 34 && manifest.summary.chapterCount === 6 && manifest.summary.repairedShotCount === 6, "counts");
assert(JSON.stringify(manifest.repairedShotIds) === JSON.stringify(["ED-08", "ED-13", "ED-17", "ED-19", "ED-31", "ED-34"]), "repair-scope");
for (const key of [
  "exactThirtyFourShotOrder",
  "sixSemanticChaptersCoverAllShotsOnce",
  "sixTargetedRepairsPresent",
  "sixDistinctRepairTopologies",
  "editorialPrimaryPixelKeywordOnly",
  "noSourceHan",
  "noStandaloneDecorativeLines",
  "formalTextRendererBound",
]) assert(manifest.checks[key] === true, `check:${key}`);
for (const key of ["generatedFormalTextAdded", "imageGenUsed", "motionProduced", "currentAuthorityMutated"])
  assert(manifest.checks[key] === false, `negative-check:${key}`);
assert(manifest.typography.sourceHanUsed === false, "source-han");
assert(manifest.typography.maximumPixelCharactersPerFrame <= 3, "pixel-character-budget");
assert(manifest.typography.aggregatePixelCharacterRatio <= 0.25, "pixel-ratio");
assert(manifest.typography.standaloneDecorativeLineCount === 0, "decorative-lines");
assert(manifest.summary.uniqueRepairTopologyCount === 6, "topology-diversity");
for (const output of Object.values(manifest.outputs)) {
  const file = path.join(root, output.path);
  assert(fs.existsSync(file) && sha256File(file) === output.sha256, `output-sha:${output.path}`);
  const metadata = await sharp(file).metadata();
  assert(metadata.width === output.width && metadata.height === output.height, `output-size:${output.path}`);
}
for (const item of manifest.repairedFrames) {
  const file = path.join(root, item.frame.path);
  assert(fs.existsSync(file) && sha256File(file) === item.frame.sha256, `frame-sha:${item.shotId}`);
  assert(item.textNodes.every((node) => node.editable && !node.generated && node.fontSha256), `editable-font:${item.shotId}`);
  if (item.presenterBinding) assert(item.presenterBinding.faceRegenerated === false && item.presenterBinding.presenterVideoSha256, `presenter-binding:${item.shotId}`);
}
assert(manifest.boundary.userVisualApproval === "NOT_APPROVED" && !manifest.boundary.motionProduced && !manifest.boundary.currentAuthorityMutated, "boundary");
console.log(JSON.stringify({status: "PASS", repairedShotIds: manifest.repairedShotIds, chapterCount: manifest.summary.chapterCount, typography: manifest.typography, summary: manifest.summary, boardSha256: manifest.outputs.board.sha256, comparisonSha256: manifest.outputs.comparison.sha256, userVisualApproval: manifest.boundary.userVisualApproval}, null, 2));
