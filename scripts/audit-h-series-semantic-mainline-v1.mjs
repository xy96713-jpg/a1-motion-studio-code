#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = process.env.A1_RESOLVE_SOURCE_ROOT || "/Users/a1/Documents/Codex/声音";
const direction = path.join(sourceRoot, "outputs/video_packaging_july1/direction");
const variationPath = path.join(direction, "narrative-coverage-v2/microbeat-variation-plan.json");
const productionPath = path.join(direction, "narrative-coverage-v2/microbeat-production-plan.json");
const packagingPath = path.join(direction, "narrative-coverage-v2/packaging-plan.json");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const rendererPath = path.join(root, "remotion-renderer/src/MicrobeatLayeredFullReview.tsx");
const materialManifestPath = path.join(root, "remotion-renderer/src/generated/hSeriesMaterialManifest.json");
const continuityManifestPath = path.join(root, "remotion-renderer/src/generated/hSeriesContinuityManifest.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-semantic-mainline-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-mainline-v1");

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const required = [variationPath, productionPath, packagingPath, propsPath, rendererPath, materialManifestPath, continuityManifestPath];
const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) throw new Error(`semantic-mainline-input-missing:${missing.join(",")}`);

const variation = read(variationPath);
const production = read(productionPath);
const packaging = read(packagingPath);
const props = read(propsPath);
const rendererSource = fs.readFileSync(rendererPath, "utf8");
const materialManifest = read(materialManifestPath);
const continuityManifest = read(continuityManifestPath);
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
const variationById = new Map(variation.beats.map((beat) => [beat.id, beat]));
const macroById = new Map(packaging.macroSequences.map((macro) => [macro.id, macro]));
const sceneById = new Map(scenes.map((scene) => [scene.beatId, scene]));
const expectedIds = variation.beats.map((beat) => beat.id);
const actualIds = scenes.map((scene) => scene.beatId);
const textDrift = [];
const typographyDrift = [];
const semanticGaps = [];
for (const id of expectedIds) {
  const source = variationById.get(id);
  const scene = sceneById.get(id);
  const macro = macroById.get(source?.macroId);
  if (!scene) {
    semanticGaps.push(`${id}:missing-scene`);
    continue;
  }
  if (scene.sourceStartMs !== source.startMs || scene.sourceEndMs !== source.endMs) textDrift.push(`${id}:time`);
  if (scene.storyboard?.visualFocusText !== scene.screenText) textDrift.push(`${id}:focus-text`);
  if (!scene.titleLines?.length || scene.titleLines.join("") !== scene.layout?.typography?.lines?.join("")) typographyDrift.push(`${id}:title-lines-not-bound-to-layout`);
  const decision = scene.storyboard?.semanticDecision;
  if (!decision || decision.source !== "article-packaging-plan-v2" || decision.semanticRole !== source.semanticRole || decision.visualJob !== source.visualJob || decision.visualIntent !== source.visualIntent || decision.shotType !== source.shotType || decision.family !== scene.family || decision.layoutFamily !== scene.layoutFamily || decision.motionArchetype !== scene.motionArchetype) semanticGaps.push(`${id}:semantic-decision`);
  if (!macro) semanticGaps.push(`${id}:missing-macro-source`);
}

const checks = {
  productionSourceIsCurrent: production.totalBeats === variation.beats.length && variation.beats.length === 47,
  packagingMacrosCoverTimeline: packaging.macroSequences.length === 11 && packaging.coverage?.fullCoverage === true,
  rendererSceneCountMatchesSource: scenes.length === variation.beats.length,
  rendererBeatIdsMatchSource: JSON.stringify(actualIds) === JSON.stringify(expectedIds),
  variationHashBound: props.sourceVariationHash === variation.contentHash,
  textTimesBound: textDrift.length === 0,
  typographyLinesBound: typographyDrift.length === 0,
  everyBeatHasSemanticDecision: semanticGaps.length === 0,
  noRecordingRequired: variation.beats.every((beat) => beat.recordingPolicy?.embeddedCaptureRequired === false && beat.recordingPolicy?.blocksAnimation === false),
  currentPropsAreReviewOnly: props.reviewOnly === true && props.finalRenderAllowed === false,
  semanticMainlineUsesApprovedTemplateRoute: rendererSource.includes("A1EditorialTemplate") && rendererSource.includes('data-a1-template-route="A1EditorialTemplate/v2"'),
  semanticMainlineSelfDrawnSurfaceAbsent: !rendererSource.includes("SemanticMainlineComposition") && !rendererSource.includes("data-semantic-mainline-stage") && !rendererSource.includes("semantic mainline paper grain"),
  materialManifestBound: materialManifest.contract === "A1MaterialManifest/v1" && materialManifest.items?.length === scenes.length && rendererSource.includes("hSeriesMaterialManifest.json") && rendererSource.includes("material={boundMaterial}"),
  continuityManifestBound: continuityManifest.contract === "A1ContinuityManifest/v1" && continuityManifest.items?.length === scenes.length && continuityManifest.summary?.transitionCount === scenes.length - 1 && rendererSource.includes("hSeriesContinuityManifest.json") && rendererSource.includes("data-a1-continuity"),
};
const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([id]) => id);
const report = {
  contract: "A1HSeriesSemanticMainlineAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  source: {
    productionPath,
    variationPath,
    variationContentHash: variation.contentHash,
    variationBeatCount: variation.beats.length,
    packagingPath,
    macroCount: packaging.macroSequences.length,
  },
  renderer: {
    propsPath: path.relative(root, propsPath),
    propsSha256: sha256(propsPath),
    sceneCount: scenes.length,
    sourceVariationHash: props.sourceVariationHash,
    rendererPath: path.relative(root, rendererPath),
    rendererSha256: sha256(rendererPath),
    semanticMainlineRenderContract: "A1EditorialTemplate/v2",
    materialManifestSha256: sha256(materialManifestPath),
    continuityManifestSha256: sha256(continuityManifestPath),
  },
  checks,
  drift: {textDrift, typographyDrift, semanticGaps},
  focusBeats: ["H03-B04", "H06-B01", "H10-B03", "H11-B01"].map((id) => {
    const scene = sceneById.get(id);
    return {beatId: id, exists: Boolean(scene), screenText: scene?.screenText || null, titleLines: scene?.layout?.typography?.lines || [], family: scene?.family || null, motionArchetype: scene?.motionArchetype || null, semanticDecision: scene?.storyboard?.semanticDecision || null};
  }),
  failures,
  nextAction: failures.length ? "repair-semantic-mainline-binding" : "render-full-h-series-review-candidate-and-watch-continuity",
};
for (const output of [path.join(artifactRoot, "report.json"), path.join(publicRoot, "report.json")]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 2;
