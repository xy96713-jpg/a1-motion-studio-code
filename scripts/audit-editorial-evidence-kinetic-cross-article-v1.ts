#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  decorateEditorialEvidenceKineticTimeline,
  EDITORIAL_EVIDENCE_KINETIC_PROFILE_ID,
  type A1EditorialEvidenceTimelineInput,
} from "../apps/studio-next/src/lib/a1-editorial-evidence-kinetic-system.ts";

const root = process.cwd();
const fixtureRoot = path.join(root, "public/generated/studio-next-template-timeline");
const artifactReport = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-evidence-kinetic-system-v1/cross-article-audit.json");
const publicReport = path.join(root, "apps/studio-next/public/generated/system-line/editorial-evidence-kinetic-system-v1/cross-article-audit.json");
const sha256 = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const fixtureFiles = fs.readdirSync(fixtureRoot, {withFileTypes: true})
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("unseen-real-"))
  .map((entry) => path.join(fixtureRoot, entry.name, "article-template-timeline-props.json"))
  .filter((file) => fs.existsSync(file))
  .sort();

const results = fixtureFiles.map((file) => {
  const input = JSON.parse(fs.readFileSync(file, "utf8")) as A1EditorialEvidenceTimelineInput;
  const output = decorateEditorialEvidenceKineticTimeline(input);
  const directions = output.items.map((item) => item.templateProps?.aestheticDirection as Record<string, unknown> | undefined);
  const completeDirections = directions.filter((direction): direction is Record<string, unknown> => Boolean(direction));
  const layersComplete = completeDirections.every((direction) => {
    const gates = direction.gates as Record<string, unknown> | undefined;
    return Boolean(direction.background && direction.typography && direction.elements && direction.picture && direction.motion && gates?.separateFiveLayers === true);
  });
  const reviewOnly = completeDirections.every((direction) => {
    const gates = direction.gates as Record<string, unknown> | undefined;
    return gates?.reviewOnly === true && gates.fakeEvidenceAllowed === false && gates.generatedArtworkCount === 0;
  });
  return {
    fixture: path.relative(root, file),
    sha256: sha256(file),
    title: input.title,
    shotCount: output.items.length,
    directedShotCount: completeDirections.length,
    roleCount: new Set(completeDirections.map((direction) => direction.sceneRole)).size,
    backgroundModeCount: new Set(completeDirections.map((direction) => (direction.background as Record<string, unknown>)?.mode)).size,
    firstRole: completeDirections[0]?.sceneRole || null,
    finalRole: completeDirections.at(-1)?.sceneRole || null,
    pass: output.styleProfileId === EDITORIAL_EVIDENCE_KINETIC_PROFILE_ID
      && output.aestheticSystem?.contract === "A1EditorialEvidenceKineticSystem/v1"
      && output.aestheticSystem?.reviewOnly === true
      && output.items.length > 0
      && completeDirections.length === output.items.length
      && layersComplete
      && reviewOnly
      && completeDirections[0]?.sceneRole === "source-opening"
      && completeDirections.at(-1)?.sceneRole === "quiet-resolution",
  };
});

const distinctTitles = new Set(results.map((result) => result.title));
const failures = [
  ...(fixtureFiles.length >= 3 ? [] : ["insufficient-real-article-fixtures"]),
  ...(distinctTitles.size >= 2 ? [] : ["insufficient-distinct-article-titles"]),
  ...results.filter((result) => !result.pass).map((result) => `fixture-failed:${result.fixture}`),
];
const report = {
  contract: "A1EditorialEvidenceKineticCrossArticleAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  profileId: EDITORIAL_EVIDENCE_KINETIC_PROFILE_ID,
  summary: {
    fixtureCount: results.length,
    distinctArticleTitleCount: distinctTitles.size,
    totalShotCount: results.reduce((sum, result) => sum + result.shotCount, 0),
    totalDirectedShotCount: results.reduce((sum, result) => sum + result.directedShotCount, 0),
    failedFixtureCount: results.filter((result) => !result.pass).length,
  },
  fixtures: results,
  failures,
};

for (const file of [artifactReport, publicReport]) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 2;
