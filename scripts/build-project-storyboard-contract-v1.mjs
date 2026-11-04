#!/usr/bin/env node
/**
 * Build a generic project-level storyboard contract from the current storyboard.
 *
 * This removes fixed meaning from "50 shots" and H-series labels. The current
 * Hxx-Bxx ids are kept as legacy labels for renderer compatibility, while the
 * contract exposes project -> segments -> shots as the product source of truth.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const phaseId = "project-storyboard-contract-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);

function argValue(name, fallback) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function visualFocus(scene) {
  return scene.storyboard?.visualFocusText || (Array.isArray(scene.titleLines) ? scene.titleLines.join(" ") : "") || scene.presentation?.primary || scene.screenText || "";
}

function semanticStage(scene) {
  return scene.storyboard?.semanticDecision?.semanticStageKind || "typographic-packaging";
}

function materialNeedFor(scene) {
  const stage = semanticStage(scene);
  if (scene.storyboard?.artworkStatus === "adopted") return "adopted-artwork";
  if (scene.storyboard?.artworkStatus === "pending-visual-review") return "review-generated-artwork";
  if (scene.storyboard?.visualSource === "generate") return "needs-generated-artwork";
  if (stage === "typographic-packaging" || scene.storyboard?.visualSource === "type") return "type-only";
  if (stage === "operation-flow" || stage === "archive-structure" || stage === "argument-grammar") return "deterministic-semantic-stage";
  return "type-only";
}

function gateStatus(reportPath) {
  if (!fs.existsSync(reportPath)) return {status: "missing"};
  const report = readJson(reportPath);
  return {
    status: report.status || "unknown",
    summary: report.summary || null,
    nextAction: report.nextAction || null,
  };
}

const propsPath = path.resolve(root, argValue("--props", "apps/studio-next/public/generated/storyboard/current/storyboard-props.json"));
const manifestPath = path.resolve(root, argValue("--manifest", "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json"));
const contractPath = path.join(artifactRoot, "contract.json");
const publicContractPath = path.join(publicRoot, "contract.json");
const reportPath = path.join(artifactRoot, "report.md");
const publicReportPath = path.join(publicRoot, "report.md");

if (!fs.existsSync(propsPath)) throw new Error(`props not found: ${propsPath}`);
if (!fs.existsSync(manifestPath)) throw new Error(`manifest not found: ${manifestPath}`);

const props = readJson(propsPath);
const manifest = readJson(manifestPath);
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
const segmentOrder = Array.from(new Set(scenes.map((scene) => scene.macroId || String(scene.beatId || "").split("-")[0] || "SEG").filter(Boolean)));
const segmentIdByLegacy = new Map(segmentOrder.map((legacyId, index) => [legacyId, `S${String(index + 1).padStart(2, "0")}`]));
const sceneCountsBySegment = new Map();

const shots = scenes.map((scene, index) => {
  const legacySegmentId = scene.macroId || String(scene.beatId || "").split("-")[0] || "SEG";
  const segmentId = segmentIdByLegacy.get(legacySegmentId) || `S${String(segmentOrder.length + 1).padStart(2, "0")}`;
  const shotNumber = (sceneCountsBySegment.get(segmentId) || 0) + 1;
  sceneCountsBySegment.set(segmentId, shotNumber);
  const shotId = `${segmentId}-SHOT${String(shotNumber).padStart(2, "0")}`;
  return {
    id: shotId,
    index: index + 1,
    segmentId,
    legacy: {
      beatId: scene.beatId,
      macroId: scene.macroId,
    },
    timeline: {
      startMs: Number(scene.sourceStartMs || 0),
      endMs: Number(scene.sourceEndMs || 0),
      durationMs: Math.max(0, Number(scene.sourceEndMs || 0) - Number(scene.sourceStartMs || 0)),
      startFrame: Number(scene.startFrame || 0),
      durationInFrames: Number(scene.durationInFrames || 0),
    },
    text: {
      source: scene.screenText || "",
      visualFocus: visualFocus(scene),
      titleLines: Array.isArray(scene.titleLines) ? scene.titleLines : [],
    },
    semantic: {
      stage: semanticStage(scene),
      family: scene.family || null,
      state: scene.presentation?.state || null,
      label: scene.presentation?.label || null,
      mode: scene.storyboard?.semanticDecision?.mode || null,
    },
    visual: {
      motionStyle: scene.motionPlan?.motionStyle || scene.motionArchetype || null,
      backgroundState: scene.backgroundState || null,
      choreography: scene.choreography || null,
      materialNeed: materialNeedFor(scene),
      visualSource: scene.storyboard?.visualSource || "type",
      artworkStatus: scene.storyboard?.artworkStatus || null,
    },
    review: {
      status: "unreviewed",
      riskLevel: "normal",
    },
  };
});

const segments = segmentOrder.map((legacyId) => {
  const segmentId = segmentIdByLegacy.get(legacyId);
  const segmentShots = shots.filter((shot) => shot.segmentId === segmentId);
  return {
    id: segmentId,
    index: Number(segmentId?.slice(1)) || 0,
    legacy: {macroId: legacyId},
    title: segmentShots[0]?.text.source || legacyId,
    timeline: {
      startMs: Math.min(...segmentShots.map((shot) => shot.timeline.startMs)),
      endMs: Math.max(...segmentShots.map((shot) => shot.timeline.endMs)),
      durationMs: Math.max(...segmentShots.map((shot) => shot.timeline.endMs)) - Math.min(...segmentShots.map((shot) => shot.timeline.startMs)),
    },
    shotCount: segmentShots.length,
    shotIds: segmentShots.map((shot) => shot.id),
    dominantStages: Object.entries(segmentShots.reduce((acc, shot) => {
      acc[shot.semantic.stage] = (acc[shot.semantic.stage] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]).map(([stage, count]) => ({stage, count})),
  };
});

const contract = {
  contract: "A1ProjectStoryboardContract/v1",
  generatedAt: new Date().toISOString(),
  project: {
    id: props.projectId || "a1-storyboard-project",
    authority: "project-storyboard-contract",
    currentInstance: {
      fixedShotCount: false,
      shotCount: shots.length,
      segmentCount: segments.length,
      legacyNaming: "Hxx-Bxx retained only for renderer compatibility",
    },
  },
  policy: {
    noFixedShotCount: true,
    noFixedHSeriesMeaning: true,
    segmentationMustComeFromContent: true,
    rendererIdsAreCompatibilityLabels: true,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  },
  source: {
    kind: props.sourceTimeline?.kind || "unknown",
    path: props.sourceTimeline?.path || manifest.source?.path || null,
    sha256: props.sourceTimeline?.sha256 || manifest.source?.sha256 || null,
    cueCount: props.sourceTimeline?.cueCount || null,
    groupingPolicy: props.sourceTimeline?.groupingPolicy || null,
  },
  hashes: {
    storyboardProps: {path: rel(propsPath), sha256: sha256File(propsPath)},
    storyboardManifest: {path: rel(manifestPath), sha256: sha256File(manifestPath)},
  },
  taxonomy: {
    semanticStages: ["typographic-packaging", "argument-grammar", "operation-flow", "archive-structure"],
    materialNeeds: ["type-only", "deterministic-semantic-stage", "needs-generated-artwork", "review-generated-artwork", "adopted-artwork"],
  },
  summary: {
    segmentCount: segments.length,
    shotCount: shots.length,
    stageCounts: shots.reduce((acc, shot) => {
      acc[shot.semantic.stage] = (acc[shot.semantic.stage] || 0) + 1;
      return acc;
    }, {}),
    materialNeedCounts: shots.reduce((acc, shot) => {
      acc[shot.visual.materialNeed] = (acc[shot.visual.materialNeed] || 0) + 1;
      return acc;
    }, {}),
  },
  gates: {
    semantic: gateStatus(path.join(root, "apps/studio-next/public/generated/system-line/storyboard-semantic-audit-v1/report.json")),
    stills: gateStatus(path.join(root, "apps/studio-next/public/generated/system-line/storyboard-current-stills-v1/report.json")),
    quality: gateStatus(path.join(root, "apps/studio-next/public/generated/system-line/storyboard-quality-gate-v1/report.json")),
    firstRender: gateStatus(path.join(root, "apps/studio-next/public/generated/system-line/storyboard-first-render-gate-v1/report.json")),
    systemFlow: gateStatus(path.join(root, "apps/studio-next/public/generated/system-line/a1-system-flow-contract-v1/report.json")),
  },
  segments,
  shots,
};

const md = [
  "# A1 Project Storyboard Contract v1",
  "",
  `Project: ${contract.project.id}`,
  `Current instance: ${contract.summary.segmentCount} segments / ${contract.summary.shotCount} shots`,
  "",
  "This contract is project-level. Shot count is not fixed; Hxx-Bxx labels are renderer compatibility labels only.",
  "",
  "## Stage counts",
  "",
  ...Object.entries(contract.summary.stageCounts).map(([stage, count]) => `- ${stage}: ${count}`),
  "",
  "## Material needs",
  "",
  ...Object.entries(contract.summary.materialNeedCounts).map(([need, count]) => `- ${need}: ${count}`),
  "",
  "## Segments",
  "",
  ...segments.map((segment) => `- ${segment.id} (${segment.legacy.macroId}): ${segment.shotCount} shots, ${segment.timeline.startMs}-${segment.timeline.endMs}ms`),
  "",
].join("\n");

writeJson(contractPath, contract);
writeJson(publicContractPath, contract);
fs.mkdirSync(path.dirname(reportPath), {recursive: true});
fs.mkdirSync(path.dirname(publicReportPath), {recursive: true});
fs.writeFileSync(reportPath, md, "utf8");
fs.writeFileSync(publicReportPath, md, "utf8");

console.log(JSON.stringify({
  status: "PASS",
  contract: contract.contract,
  projectId: contract.project.id,
  segmentCount: contract.summary.segmentCount,
  shotCount: contract.summary.shotCount,
  noFixedShotCount: contract.policy.noFixedShotCount,
  contractPath: rel(contractPath),
  publicContractPath: rel(publicContractPath),
  reportPath: rel(reportPath),
  publicReportPath: rel(publicReportPath),
}, null, 2));
