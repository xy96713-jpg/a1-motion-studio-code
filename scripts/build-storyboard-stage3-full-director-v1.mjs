#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildCurrentFilmManifest} from "../lib/current-film-manifest.js";
import {H_SERIES_FULL_DIRECTOR_PLAN_V1, validateHSeriesFullDirectorPlan} from "../lib/h-series-full-director-plan-v1.js";

const root = process.cwd();
const phaseId = "storyboard-stage3-full-director-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const candidatePropsPath = path.join(artifactRoot, "candidate-props.json");
const publicCandidatePropsPath = path.join(publicRoot, "candidate-props.json");

const anchorBeatIds = ["H01-B01", "H03-B02", "H11-B03"];
const reviewBeatIds = [
  "H01-B01", "H01-B03", "H02-B02", "H03-B02", "H03-B04", "H04-B02",
  "H05-B01", "H06-B02", "H07-B01", "H08-B04", "H10-B04", "H11-B03",
];
const backgroundStateByDirectorMode = {
  "open-paper": "paper-field",
  "manuscript-grid": "wireframe-space",
  "archive-desk": "archive-density",
  "ink-reversal": "ink-conflict",
  "xerox-poster": "archive-density",
  "blueprint-process": "wireframe-space",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

const currentProps = readJson(propsPath);
const currentFilm = buildCurrentFilmManifest(root);
const sourcePropsSha256 = sha256File(propsPath);
const sourceScenes = Array.isArray(currentProps.scenes) ? currentProps.scenes : [];
const planValidation = validateHSeriesFullDirectorPlan();
const planByBeatId = new Map(H_SERIES_FULL_DIRECTOR_PLAN_V1.map((item) => [item.beatId, item]));
const sourceBeatIds = sourceScenes.map((scene) => scene.beatId);
const missingPlanBeatIds = sourceBeatIds.filter((beatId) => !planByBeatId.has(beatId));
const orphanPlanBeatIds = H_SERIES_FULL_DIRECTOR_PLAN_V1.map((item) => item.beatId).filter((beatId) => !sourceBeatIds.includes(beatId));
const candidateProps = JSON.parse(JSON.stringify(currentProps));

for (const scene of candidateProps.scenes || []) {
  const direction = planByBeatId.get(scene.beatId);
  if (!direction) continue;
  scene.titleLines = [...direction.text.headlineLines];
  scene.presentation = {
    ...scene.presentation,
    primary: direction.text.headlineLines.join(""),
    semanticDelta: `stage3-full-director:${direction.composition.mode}:${direction.text.emphasis}`,
  };
  scene.backgroundState = backgroundStateByDirectorMode[direction.background.mode] || scene.backgroundState;
  scene.compositionVariant = direction.composition.variant;
  scene.route = direction.asset.route;
  const priorStoryboard = scene.storyboard || {};
  const {
    visualArchetype: _visualArchetype,
    typographyDirector: _typographyDirector,
    stage2SemanticPriority: _stage2SemanticPriority,
    ...storyboardWithoutOldOwners
  } = priorStoryboard;
  scene.storyboard = {
    ...storyboardWithoutOldOwners,
    stage3DirectorPriority: true,
    visualFocusText: direction.text.emphasis,
    shotDirector: direction,
    semanticFill: {
      ...(priorStoryboard.semanticFill || {}),
      visibleText: direction.text.headlineLines.join(" / "),
      intent: direction.narrativeRole,
      fillWhat: direction.composition.rationale,
      fillHow: `${direction.background.rationale}; ${direction.asset.rationale}`,
      assetRoute: direction.asset.route,
      motionJob: direction.motion.primary,
      layoutJob: `${direction.composition.mode}:variant-${direction.composition.variant}`,
      status: "stage3-full-director-review-candidate",
      rendererAdoptionAllowed: false,
    },
  };
  delete scene.semanticVisual;
}

candidateProps.reviewBeatIds = reviewBeatIds;
const candidatePropsSha256 = sha256Json(candidateProps);
const planSha256 = sha256Json(H_SERIES_FULL_DIRECTOR_PLAN_V1);
const signatureCounts = H_SERIES_FULL_DIRECTOR_PLAN_V1.reduce((acc, item) => {
  const signature = `${item.background.mode}|${item.composition.mode}|${item.composition.variant}`;
  acc[signature] = (acc[signature] || 0) + 1;
  return acc;
}, {});
const byRoute = H_SERIES_FULL_DIRECTOR_PLAN_V1.reduce((acc, item) => {
  acc[item.asset.route] = (acc[item.asset.route] || 0) + 1;
  return acc;
}, {});
const byComposition = H_SERIES_FULL_DIRECTOR_PLAN_V1.reduce((acc, item) => {
  acc[item.composition.mode] = (acc[item.composition.mode] || 0) + 1;
  return acc;
}, {});
const byBackground = H_SERIES_FULL_DIRECTOR_PLAN_V1.reduce((acc, item) => {
  acc[item.background.mode] = (acc[item.background.mode] || 0) + 1;
  return acc;
}, {});
const blockers = [];
if (!planValidation.ok) blockers.push({id:"director-plan-invalid",failures:planValidation.failures});
if (sourceScenes.length !== 50) blockers.push({id:"unexpected-source-scene-count",expected:50,observed:sourceScenes.length});
if (missingPlanBeatIds.length) blockers.push({id:"missing-shot-directions",beatIds:missingPlanBeatIds});
if (orphanPlanBeatIds.length) blockers.push({id:"orphan-shot-directions",beatIds:orphanPlanBeatIds});
if (sourcePropsSha256 !== currentFilm.current.rendererPropsSha256) blockers.push({id:"source-props-not-current-authority",expected:currentFilm.current.rendererPropsSha256,observed:sourcePropsSha256});
if ((candidateProps.scenes || []).filter((scene) => scene.storyboard?.stage3DirectorPriority === true).length !== 50) blockers.push({id:"candidate-not-fully-directed"});

const report = {
  contract: "A1StoryboardStage3FullDirector/v1",
  phaseId,
  generatedAt: new Date().toISOString(),
  status: blockers.length ? "BLOCKED" : "REVIEW_CANDIDATE_READY",
  reviewOnly: true,
  currentAuthorityMutated: false,
  rendererAdoptionAllowed: false,
  applyAllowedBeforeExplicitApproval: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  visualThesis: "复古编辑纸张作为材料底，镜头构图由句义决定；钴蓝只标记选择、动作、方向和写回。",
  sourceBinding: {
    currentFilmState: currentFilm.state,
    currentFilmBuildId: currentFilm.current.buildId,
    propsPath: rel(propsPath),
    propsSha256: sourcePropsSha256,
    rendererSourceSha256: currentFilm.current.rendererSourceSha256,
    visualMasterId: "july1-retro-print-archive-wireframe-v1",
  },
  directorPlan: {
    contract: "A1HSeriesShotDirectorPlan/v1",
    sourceModule: "lib/h-series-full-director-plan-v1.js",
    sha256: planSha256,
    sceneCount: H_SERIES_FULL_DIRECTOR_PLAN_V1.length,
    requiredFields: ["text", "background", "composition", "elements", "asset", "motion", "continuity", "acceptance"],
  },
  candidate: {
    propsPath: rel(candidatePropsPath),
    publicPropsPath: rel(publicCandidatePropsPath),
    propsSha256: candidatePropsSha256,
    changedBeatIds: sourceBeatIds,
    changedSceneCount: sourceBeatIds.length,
    currentPropsUnchanged: true,
  },
  anchors: {
    beatIds: anchorBeatIds,
    purpose: ["opening", "core-problem", "closing"],
    approvalStatus: "not-approved",
  },
  summary: {
    sceneCount: sourceScenes.length,
    fullyDirectedSceneCount: H_SERIES_FULL_DIRECTOR_PLAN_V1.length,
    changedSceneCount: sourceBeatIds.length,
    compositionModeCount: Object.keys(byComposition).length,
    backgroundModeCount: Object.keys(byBackground).length,
    uniqueVisualSignatureCount: Object.keys(signatureCounts).length,
    maxVisualSignatureReuse: Math.max(...Object.values(signatureCounts)),
    byRoute,
    byComposition,
    byBackground,
    missingSourceCount: H_SERIES_FULL_DIRECTOR_PLAN_V1.filter((item) => item.asset.status === "missing-source").length,
  },
  shots: H_SERIES_FULL_DIRECTOR_PLAN_V1,
  blockers,
  nextAction: blockers.length ? "repair-stage3-full-director-code" : "render-all-50-stage3-hold-frames-and-run-visual-audit",
};

for (const [filePath, value] of [
  [path.join(artifactRoot, "director-plan.json"), H_SERIES_FULL_DIRECTOR_PLAN_V1],
  [path.join(publicRoot, "director-plan.json"), H_SERIES_FULL_DIRECTOR_PLAN_V1],
  [candidatePropsPath, candidateProps],
  [publicCandidatePropsPath, candidateProps],
  [path.join(artifactRoot, "report.json"), report],
  [path.join(publicRoot, "report.json"), report],
]) writeJson(filePath, value);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  sourcePropsSha256,
  candidatePropsSha256,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
if (report.status !== "REVIEW_CANDIDATE_READY") process.exitCode = 2;
