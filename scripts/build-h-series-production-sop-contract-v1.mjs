#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const candidateRoot = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-director-candidate-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/h-series-director-candidate-v1");

const paths = {
  candidate: path.join(candidateRoot, "candidate-render-props.json"),
  ledger: path.join(candidateRoot, "decision-ledger.json"),
  directorReport: path.join(candidateRoot, "report.json"),
  materialQueue: path.join(candidateRoot, "semantic-material-queue.json"),
  adapterManifest: path.join(candidateRoot, "h-series-render-adapter-manifest.json"),
};

const readJson = (file, fallback = null) => {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
};
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const clean = (value = "", max = 160) => Array.from(String(value || "").replace(/\s+/gu, " ").trim()).slice(0, max).join("");
const countBy = (items, keyFn) => items.reduce((all, item) => {
  const key = keyFn(item) || "unknown";
  all[key] = (all[key] || 0) + 1;
  return all;
}, {});

const requiredFiles = [paths.candidate, paths.ledger, paths.directorReport, paths.materialQueue];
const missingFiles = requiredFiles.filter((file) => !fs.existsSync(file)).map((file) => path.relative(root, file));
if (missingFiles.length) {
  throw new Error(`production-sop-prerequisites-missing:${missingFiles.join(",")}`);
}

fs.mkdirSync(candidateRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const candidate = readJson(paths.candidate);
const ledger = readJson(paths.ledger, []);
const directorReport = readJson(paths.directorReport);
const materialQueue = readJson(paths.materialQueue);
const adapterManifest = readJson(paths.adapterManifest, null);
const materialById = new Map((materialQueue.items || []).map((item) => [item.id, item]));
const adapterByCandidateId = new Map((adapterManifest?.scenes || []).map((scene) => [scene.candidateSceneId, scene]));

const visualRouteFor = (entry, material) => {
  const medium = entry.visual?.medium || material?.visualForm || "unresolved";
  const materialStatus = material?.status || entry.material?.sourceStatus || "unknown";
  if (materialStatus === "bound" || entry.material?.sourceStatus === "verified-and-bound") return "real-evidence-bound";
  if (materialStatus === "source-required" || !["not-required", "not-needed", "verified-and-bound"].includes(entry.material?.sourceStatus || "not-required")) return "real-evidence-source-required";
  if (materialStatus === "generate-candidate" || entry.material?.generatedArtworkAllowed) return "gpt-editorial-artwork-review-only";
  if (["vector-diagram", "data-visual", "map-data-visualization"].includes(medium) || material?.semanticStage) return "deterministic-explanatory-graphic";
  if (["kinetic-typography", "typographic-resolution"].includes(medium)) return "typography-only";
  return "unresolved";
};

const motionIntentFor = (entry, adapterScene, visualRoute) => {
  const role = entry.judgement?.storyRole || entry.judgement?.purpose || "";
  const relation = entry.judgement?.transitionReason || entry.judgement?.connectsFrom || "";
  const semanticKind = adapterScene?.semanticStageKind || null;
  if (semanticKind === "operation") return "object-action-result progression with editorial selection emphasis";
  if (semanticKind === "argument") return "claim pressure resolves through contrast or causal reveal";
  if (semanticKind === "archive") return "dossier scan with grouped version accumulation";
  if (/contrast|problem|反证|问题/u.test(`${role} ${relation}`)) return "contrast enters before resolution hold";
  if (/closing|conclusion|收尾|结论/u.test(`${role} ${relation}`)) return "quiet resolve with longer hold";
  if (visualRoute === "real-evidence-source-required") return "proof lock after source asset enters";
  return "semantic title and support actors enter, hold, then hand off to next relation";
};

const sceneContracts = ledger.map((entry, index) => {
  const material = materialById.get(entry.id) || null;
  const adapterScene = adapterByCandidateId.get(entry.id) || null;
  const visualRoute = visualRouteFor(entry, material);
  const semanticRole = entry.judgement?.storyRole || entry.judgement?.purpose || null;
  const blockers = [];
  const reviewRisks = [];
  if (!entry.source?.claim && !entry.source?.screenText) blockers.push("missing-source-trace");
  if (!semanticRole) blockers.push("missing-semantic-role");
  if (!entry.judgement?.transitionReason && !entry.judgement?.connectsFrom && index > 0) reviewRisks.push("weak-relation-bridge");
  if (visualRoute === "unresolved") blockers.push("missing-visual-route");
  if (visualRoute === "real-evidence-source-required" && material?.status !== "bound") blockers.push("source-material-not-bound");
  if ((adapterScene?.semanticStageKind || material?.semanticStage) && !entry.layout?.actorCount && !entry.layout?.slots?.length) blockers.push("semantic-stage-without-layout-actors");
  for (const diagnostic of entry.diagnostics || []) {
    if (diagnostic.severity === "blocker") blockers.push(diagnostic.id);
    if (diagnostic.severity === "review-risk") reviewRisks.push(diagnostic.id);
  }
  return {
    id: entry.id,
    order: entry.order,
    sourceTrace: clean(entry.source?.claim || entry.source?.screenText || ""),
    semantic: {
      role: semanticRole,
      purpose: entry.judgement?.purpose || null,
      relationBridge: entry.judgement?.transitionReason || entry.judgement?.connectsFrom || null,
    },
    visual: {
      route: visualRoute,
      medium: entry.visual?.medium || null,
      rendererRoute: entry.visual?.rendererRoute || adapterScene?.rendererRoute || null,
      semanticStageKind: adapterScene?.semanticStageKind || material?.semanticStage || null,
    },
    material: {
      status: material?.status || entry.material?.sourceStatus || "unknown",
      action: material?.action || null,
      approval: material?.approval || "none",
      generatedArtworkAllowed: entry.material?.generatedArtworkAllowed === true,
    },
    layout: {
      primitive: entry.layout?.primitive || null,
      actorCount: entry.layout?.actorCount || 0,
      slotCount: Array.isArray(entry.layout?.slots) ? entry.layout.slots.length : 0,
      titleLineCount: Array.isArray(entry.layout?.titleLines) ? entry.layout.titleLines.length : 0,
    },
    motion: {
      intent: motionIntentFor(entry, adapterScene, visualRoute),
      hSeriesBeatId: adapterScene?.beatId || null,
      hSeriesFamily: adapterScene?.family || null,
    },
    gates: {
      blockers: [...new Set(blockers)],
      reviewRisks: [...new Set(reviewRisks)],
    },
  };
});

const allBlockers = sceneContracts.flatMap((scene) => scene.gates.blockers.map((id) => ({sceneId: scene.id, id})));
const allReviewRisks = sceneContracts.flatMap((scene) => scene.gates.reviewRisks.map((id) => ({sceneId: scene.id, id})));
const materialCounts = countBy(sceneContracts, (scene) => scene.material.status);
const visualRouteCounts = countBy(sceneContracts, (scene) => scene.visual.route);
const semanticStageCounts = countBy(sceneContracts, (scene) => scene.visual.semanticStageKind || "none");
const adapterReady = adapterManifest?.status === "READY_FOR_STILL_REVIEW" && adapterManifest.sceneCount === sceneContracts.length;

const gates = [
  {
    id: "workspace-authority-preserved",
    status: "PASS",
    evidence: "system-line artifact root and public generated/system-line output only",
  },
  {
    id: "article-scene-contract-complete",
    status: allBlockers.some((item) => ["missing-source-trace", "missing-semantic-role", "missing-visual-route"].includes(item.id)) ? "FAIL" : "PASS",
    evidence: `${sceneContracts.length} scene contracts`,
  },
  {
    id: "material-route-closed",
    status: allBlockers.some((item) => item.id === "source-material-not-bound") ? "FAIL" : "PASS",
    evidence: materialCounts,
  },
  {
    id: "layout-motion-intent-present",
    status: allBlockers.some((item) => item.id === "semantic-stage-without-layout-actors") ? "FAIL" : "PASS",
    evidence: semanticStageCounts,
  },
  {
    id: "h-series-review-adapter-ready",
    status: adapterReady ? "PASS" : "REVIEW_PENDING",
    evidence: adapterManifest ? {status: adapterManifest.status, sceneCount: adapterManifest.sceneCount} : "adapter manifest not built",
  },
  {
    id: "adoption-guarded",
    status: "PASS",
    evidence: "reviewOnly true; renderer/final/Resolve adoption disabled",
  },
];

const blockingGateCount = gates.filter((gate) => gate.status === "FAIL").length;
const status = blockingGateCount
  ? "BLOCKED"
  : allReviewRisks.length
    ? "READY_FOR_DIRECTOR_REVIEW"
    : "READY_FOR_AESTHETIC_MOTION_UPGRADE";

const contract = {
  contract: "A1ArticleMotionProductionSOP/v1",
  status,
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  inputs: {
    candidatePath: path.relative(root, paths.candidate),
    candidateSha256: sha256(candidate),
    directorReportPath: path.relative(root, paths.directorReport),
    materialQueuePath: path.relative(root, paths.materialQueue),
    adapterManifestPath: adapterManifest ? path.relative(root, paths.adapterManifest) : null,
  },
  sourceContracts: {
    directorCandidate: directorReport.contract || "A1HSeriesDirectorCandidate/v1",
    renderProps: directorReport.contracts?.renderProps || candidate.contract || null,
    materialQueue: materialQueue.contract || null,
    hSeriesAdapter: adapterManifest?.contract || null,
  },
  summary: {
    sceneCount: sceneContracts.length,
    blockerCount: allBlockers.length,
    reviewRiskCount: allReviewRisks.length,
    blockingGateCount,
    visualRouteCounts,
    materialCounts,
    semanticStageCounts,
  },
  gates,
  blockers: allBlockers,
  reviewRisks: allReviewRisks,
  scenes: sceneContracts,
  nextAction: blockingGateCount
    ? "repair-scene-contract-material-layout-blockers-before-visual-upgrade"
    : allReviewRisks.length
      ? "director-review-scene-contract-then-targeted-repair"
      : "start-aesthetic-motion-upgrade-with-representative-stills-and-motion-probes",
};

const markdown = [
  "# H-series Production SOP Contract",
  "",
  `Status: ${contract.status}`,
  "",
  "## Summary",
  "",
  `- Scenes: ${contract.summary.sceneCount}`,
  `- Blockers: ${contract.summary.blockerCount}`,
  `- Review risks: ${contract.summary.reviewRiskCount}`,
  `- Next action: ${contract.nextAction}`,
  "",
  "## Visual Routes",
  "",
  ...Object.entries(visualRouteCounts).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## Material Routes",
  "",
  ...Object.entries(materialCounts).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## Gates",
  "",
  ...gates.map((gate) => `- ${gate.id}: ${gate.status}`),
  "",
  "## Scene Contract",
  "",
  "| Scene | Semantic role | Visual route | Material | Semantic stage | Motion intent |",
  "| --- | --- | --- | --- | --- | --- |",
  ...sceneContracts.map((scene) => `| ${scene.id} | ${scene.semantic.role || "missing"} | ${scene.visual.route} | ${scene.material.status} | ${scene.visual.semanticStageKind || "none"} | ${scene.motion.intent} |`),
  "",
].join("\n");

for (const dir of [candidateRoot, publicRoot]) {
  writeJson(path.join(dir, "production-sop-contract.json"), contract);
  fs.writeFileSync(path.join(dir, "production-sop-report.md"), markdown);
}

console.log(JSON.stringify({
  status: contract.status,
  reportPath: path.relative(root, path.join(candidateRoot, "production-sop-contract.json")),
  publicReportPath: path.relative(root, path.join(publicRoot, "production-sop-contract.json")),
  summary: contract.summary,
  nextAction: contract.nextAction,
}, null, 2));

if (blockingGateCount) process.exitCode = 2;
