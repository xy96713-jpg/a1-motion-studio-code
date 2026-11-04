#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-director-candidate-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/h-series-director-candidate-v1");
const contractPath = path.join(artifactRoot, "production-sop-contract.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

if (!fs.existsSync(contractPath)) {
  throw new Error(`production-sop-contract-missing:${path.relative(root, contractPath)}`);
}

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const production = readJson(contractPath);
const scenes = Array.isArray(production.scenes) ? production.scenes : [];
if (production.contract !== "A1ArticleMotionProductionSOP/v1") {
  throw new Error(`invalid-production-sop-contract:${production.contract || "missing"}`);
}
if (production.status !== "READY_FOR_AESTHETIC_MOTION_UPGRADE") {
  throw new Error(`production-sop-not-ready-for-aesthetic-motion:${production.status || "missing"}`);
}

const scenesByStage = (stage) => scenes.filter((scene) => scene.visual?.semanticStageKind === stage);
const typographyScenes = scenes.filter((scene) => scene.visual?.route === "typography-only");
const deterministicScenes = scenes.filter((scene) => scene.visual?.route === "deterministic-explanatory-graphic");

const targetGroups = [
  {
    id: "operation-flow-editorial-field",
    stageKind: "operation",
    sceneIds: scenesByStage("operation").map((scene) => scene.id),
    currentRisk: "cards-and-arrows can read as generic workflow UI instead of editorial motion",
    visualUpgrade: "replace generic card emphasis with paper fragments, selection strokes, typed intervention block, and result lock-on",
    motionUpgrade: "left-to-right object/action/result progression with a cobalt proofreader stroke that attaches to the acted object",
    proofFrames: ["enter", "hold", "exit"],
  },
  {
    id: "argument-pressure-composition",
    stageKind: "argument",
    sceneIds: scenesByStage("argument").map((scene) => scene.id),
    currentRisk: "argument beats can look like balanced cards when they should carry pressure, contradiction, or causal resolution",
    visualUpgrade: "use asymmetrical claim/counterclaim pressure, strike/annotation marks, and one decisive resolution stamp",
    motionUpgrade: "counterpoint compresses the claim field before the final causal or decision state resolves",
    proofFrames: ["hold", "exit"],
  },
  {
    id: "archive-dossier-depth",
    stageKind: "archive",
    sceneIds: scenesByStage("archive").map((scene) => scene.id),
    currentRisk: "archive scenes can become static folder labels instead of a readable versioning system",
    visualUpgrade: "use dossier spine, grouped tabs, version ticks, and chronological scan depth",
    motionUpgrade: "scan down the dossier, reveal grouped history, then settle on the current article cluster",
    proofFrames: ["enter", "hold"],
  },
  {
    id: "typography-paper-rhythm",
    stageKind: "none",
    sceneIds: typographyScenes.map((scene) => scene.id),
    currentRisk: "pure typography scenes may feel like title-card filler if they do not carry article rhythm",
    visualUpgrade: "use stronger paper/ink hierarchy, wider negative space decisions, and fewer support tokens",
    motionUpgrade: "vary title reveal signatures by relation bridge while preserving readable hold time",
    proofFrames: ["hold"],
  },
];

const selectedProofScenes = [
  ...targetGroups.flatMap((group) => group.sceneIds.slice(0, group.stageKind === "none" ? 3 : 2)),
].filter(Boolean);

const plan = {
  contract: "A1HSeriesAestheticMotionUpgradePlan/v1",
  status: "READY_FOR_REVIEW_ONLY_PROOF",
  reviewOnly: true,
  proofOnly: true,
  rendererPatchAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  sourceProductionContract: path.relative(root, contractPath),
  visualThesis: "warm paper, charcoal editorial hierarchy, and cobalt only as a semantic action mark; motion explains pressure, selection, versioning, or resolution instead of decorating cards",
  qualityBar: [
    "every upgraded scene still maps to its production SOP semantic role",
    "cobalt appears only as selection, direction, proof, or resolution state",
    "no fake UI, fake document evidence, generic helper labels, or decorative horizontal rules",
    "representative stills must include enter/hold/exit where motion meaning is claimed",
    "current authority MP4 and renderer adoption remain locked until explicit approval",
  ],
  summary: {
    sceneCount: scenes.length,
    deterministicSceneCount: deterministicScenes.length,
    typographySceneCount: typographyScenes.length,
    selectedProofSceneCount: selectedProofScenes.length,
    targetGroupCount: targetGroups.length,
  },
  targetGroups,
  selectedProofScenes,
  nextAction: "render-review-only-stills-for-selected-proof-scenes-before-touching-authority-renderer",
};

const markdown = [
  "# H-series Aesthetic Motion Upgrade Plan",
  "",
  `Status: ${plan.status}`,
  "",
  `Visual thesis: ${plan.visualThesis}`,
  "",
  "## Summary",
  "",
  `- Scenes: ${plan.summary.sceneCount}`,
  `- Deterministic explanatory scenes: ${plan.summary.deterministicSceneCount}`,
  `- Typography-only scenes: ${plan.summary.typographySceneCount}`,
  `- Selected proof scenes: ${plan.summary.selectedProofSceneCount}`,
  "",
  "## Target Groups",
  "",
  ...targetGroups.map((group) => [
    `### ${group.id}`,
    `- Scenes: ${group.sceneIds.join(", ") || "none"}`,
    `- Visual: ${group.visualUpgrade}`,
    `- Motion: ${group.motionUpgrade}`,
  ].join("\n")),
  "",
  "## Next Action",
  "",
  plan.nextAction,
  "",
].join("\n");

for (const dir of [artifactRoot, publicRoot]) {
  writeJson(path.join(dir, "aesthetic-motion-upgrade-plan.json"), plan);
  fs.writeFileSync(path.join(dir, "aesthetic-motion-upgrade-plan.md"), markdown);
}

console.log(JSON.stringify({
  status: plan.status,
  reportPath: path.relative(root, path.join(artifactRoot, "aesthetic-motion-upgrade-plan.json")),
  publicReportPath: path.relative(root, path.join(publicRoot, "aesthetic-motion-upgrade-plan.json")),
  summary: plan.summary,
  nextAction: plan.nextAction,
}, null, 2));
