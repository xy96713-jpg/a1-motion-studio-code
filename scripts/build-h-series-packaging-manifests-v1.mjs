#!/usr/bin/env node
/**
 * Build the two authoritative packaging manifests for the current H-series
 * semantic line. This is deliberately a compiler step, not a dashboard:
 * renderer-facing material and whole-film continuity are derived from the
 * current 47-beat source props and published together with hashes.
 */
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const directorPlanPath = path.join(root, "remotion-renderer/src/hSeriesSemanticDirectorPlan.json");
const rendererPath = path.join(root, "remotion-renderer/src/HSeriesSemanticDirectedStage.tsx");
const rendererPublicDir = path.join(root, "remotion-renderer/public");
const sourceManifestDir = path.join(root, "remotion-renderer/src/generated");
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-packaging-manifests-v1");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/h-series-packaging-manifests-v1");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const props = readJson(propsPath);
const directorPlan = readJson(directorPlanPath);
const directedItems = Object.values(directorPlan.macroDesigns || {}).flat();
const directedByBeat = new Map(directedItems.map((item) => [item.beatId, item]));

const verifiedSources = {
  GPT: {id: "openai-gpt-mark", name: "GPT", path: "entity-icons/openai.svg", sourceUrl: "https://openai.com/brand/", officialHost: "openai.com"},
  Claude: {id: "anthropic-claude-mark", name: "Claude", path: "entity-icons/claude.svg", sourceUrl: "https://www.anthropic.com/", officialHost: "www.anthropic.com"},
  Kimi: {id: "moonshot-kimi-mark", name: "Kimi", path: "entity-icons/kimi.svg", sourceUrl: "https://moonshotai.github.io/Branding-Guide/", officialHost: "moonshotai.github.io"},
  DeepSeek: {id: "deepseek-mark", name: "DeepSeek", path: "entity-icons/deepseek.svg", sourceUrl: "https://www.deepseek.com/", officialHost: "www.deepseek.com"},
  Codex: {id: "openai-codex-mark", name: "Codex", path: "entity-icons/codex.svg", sourceUrl: "https://openai.com/codex/", officialHost: "openai.com"},
};
const evidenceNamesByBeat = {
  "H04-B01": ["GPT", "Claude"],
  "H04-B02": ["GPT", "Claude", "Kimi", "DeepSeek"],
  "H04-B03": ["GPT", "Claude", "Kimi", "DeepSeek"],
  "H04-B04": ["GPT", "Claude", "Kimi", "DeepSeek"],
  "H07-B01": ["Codex"],
  "H07-B04": ["DeepSeek"],
};

const routeFor = (scene) => directedByBeat.get(scene.beatId)?.route || "typography-only";

const assetRecord = (scene) => {
  const route = routeFor(scene);
  const directed = directedByBeat.get(scene.beatId);
  const evidence = (evidenceNamesByBeat[scene.beatId] || []).map((name) => {
    const source = verifiedSources[name];
    const absolute = path.join(rendererPublicDir, source.path);
    return {...source, sha256: fileHash(absolute)};
  });
  if (route === "real-evidence") {
    return {
      route,
      status: "renderer-bound",
      sourceKind: "verified-official-source",
      sources: evidence,
      rendererBinding: {component: "OfficialMark", sourceFile: path.relative(root, rendererPath).replaceAll(path.sep, "/"), sourceSha256: fileHash(rendererPath), slot: "verified-mark-grid", assetPath: evidence[0]?.path || null, assetPaths: evidence.map((item) => item.path), fit: "contain", objectPosition: "50% 50%", factualEvidenceAllowed: true},
      candidateArtwork: null,
      reviewOnly: true,
    };
  }
  if (route === "editorial-artwork") {
    const assetPath = directed?.asset || null;
    const absolute = assetPath ? path.join(rendererPublicDir, assetPath) : null;
    return {
      route,
      status: absolute && fs.existsSync(absolute) ? "renderer-bound" : "missing-source",
      sourceKind: "adopted-text-free-editorial-artwork",
      sources: absolute && fs.existsSync(absolute) ? [{id: `${scene.beatId}-directed-artwork`, name: "directed editorial artwork", path: assetPath, sha256: fileHash(absolute), provenance: "h-series-semantic-director-plan-v1"}] : [],
      rendererBinding: assetPath ? {component: "ArtworkField", sourceFile: path.relative(root, rendererPath).replaceAll(path.sep, "/"), sourceSha256: fileHash(rendererPath), slot: "full-bleed-editorial-artwork", assetPath, fit: "cover", objectPosition: directed.objectPosition || "50% 50%", factualEvidenceAllowed: false} : null,
      candidateArtwork: null,
      reviewOnly: true,
    };
  }
  if (route === "deterministic-graphic") {
    return {route, status: "renderer-bound", sourceKind: "deterministic-semantic-component", sources: [], rendererBinding: {component: `HSeriesSemanticDirectedStage:${scene.macroId}`, sourceFile: path.relative(root, rendererPath).replaceAll(path.sep, "/"), sourceSha256: fileHash(rendererPath), slot: "semantic-stage", assetPath: null, fit: "contain", objectPosition: "50% 50%", factualEvidenceAllowed: false}, candidateArtwork: null, reviewOnly: true};
  }
  return {route, status: "renderer-bound", sourceKind: "directed-typography", sources: [], rendererBinding: {component: "TitleBlock", sourceFile: path.relative(root, rendererPath).replaceAll(path.sep, "/"), sourceSha256: fileHash(rendererPath), slot: "semantic-title", assetPath: null, fit: "contain", objectPosition: "50% 50%", factualEvidenceAllowed: false}, candidateArtwork: null, reviewOnly: true};
};

const chapterFor = (macroId) => macroId <= "H03" ? {id: "problem", title: "问题显形", purpose: "让观众看见文字与意图之间的缺口", energy: "build"} : macroId <= "H07" ? {id: "proof", title: "证据与方法", purpose: "把模型差异和可执行方法落到可见动作", energy: "inspect"} : {id: "writeback", title: "写回与收束", purpose: "让选择、修改、版本积累回到可控工作流", energy: "resolve"};
const motifFor = (scene) => {
  const shotType = scene.storyboard?.semanticDecision?.shotType || "";
  if (/comparison-strike|evidence-detail/u.test(shotType) || scene.macroId === "H04" || scene.macroId === "H07") return "model-evidence";
  if (/selection-action|selection-return|method-sequence/u.test(shotType) || scene.macroId === "H01" || scene.macroId === "H06" || scene.macroId === "H09") return "selection-writeback";
  return "archive-versioning";
};
const energyFor = (scene) => {
  const duration = Math.max(1, scene.durationInFrames);
  const hold = scene.motionPlan?.phases?.hold ? scene.motionPlan.phases.hold.endFrame - scene.motionPlan.phases.hold.startFrame : Math.round(duration * .42);
  const holdRatio = Number((hold / duration).toFixed(3));
  return {level: scene.animationTier === "formal-highlight" ? "high" : holdRatio > .46 ? "low" : "medium", holdRatio, entryFrames: scene.motionPlan?.phases?.enter?.endFrame || 0, holdFrames: hold, exitFrames: scene.motionPlan?.phases?.exit ? scene.motionPlan.phases.exit.endFrame - scene.motionPlan.phases.exit.startFrame : 0};
};

const materialItems = props.scenes.map((scene) => {
  const directed = directedByBeat.get(scene.beatId);
  return {
    beatId: scene.beatId,
    macroId: scene.macroId,
    sourceText: scene.screenText,
    displayLines: directed?.lines || scene.titleLines,
    supportText: directed?.support || null,
    semanticRole: scene.storyboard?.semanticDecision?.semanticRole || "standard",
    visualJob: directed?.visualJob || scene.storyboard?.semanticDecision?.visualJob || scene.family,
    ...assetRecord(scene),
  };
});
const materialManifest = {
  contract: "A1MaterialManifest/v1",
  status: "REVIEW_ONLY",
  reviewOnly: true,
  finalRenderAllowed: false,
  projectId: props.projectId,
  sourceBinding: {propsPath: path.relative(root, propsPath).replaceAll(path.sep, "/"), propsSha256: fileHash(propsPath), directorPlanPath: path.relative(root, directorPlanPath).replaceAll(path.sep, "/"), directorPlanSha256: fileHash(directorPlanPath), rendererPath: path.relative(root, rendererPath).replaceAll(path.sep, "/"), rendererSha256: fileHash(rendererPath), sourceProductionHash: props.sourceProductionHash, sourceVariationHash: props.sourceVariationHash, visualMasterHash: props.visualMasterHash},
  policy: {realEvidenceRequiresProvenance: true, editorialArtworkTextFree: true, everyArtworkAssetUniquePerBeat: true, pendingAssetsCannotRender: true, recordingRequired: false},
  summary: {
    sceneCount: materialItems.length,
    routeCounts: Object.fromEntries(["real-evidence", "editorial-artwork", "deterministic-graphic", "typography-only"].map((route) => [route, materialItems.filter((item) => item.route === route).length])),
    statusCounts: Object.fromEntries([...new Set(materialItems.map((item) => item.status))].map((status) => [status, materialItems.filter((item) => item.status === status).length])),
    rendererBoundCount: materialItems.filter((item) => item.rendererBinding).length,
    boundAssetCount: materialItems.filter((item) => item.rendererBinding?.assetPath).length,
    uniqueArtworkAssetCount: new Set(materialItems.filter((item) => item.route === "editorial-artwork").map((item) => item.rendererBinding?.assetPath).filter(Boolean)).size,
    deterministicRenderedCount: materialItems.filter((item) => item.route === "deterministic-graphic" && item.rendererBinding?.sourceFile).length,
    candidateCount: 0,
    pendingVisualReviewCount: 0,
  },
  items: materialItems,
};

const chapters = [
  {id: "problem", title: "问题显形", macroIds: ["H01", "H02", "H03"], purpose: "从可改动作进入语言缺口", energyCurve: "rise-then-fracture"},
  {id: "proof", title: "证据与方法", macroIds: ["H04", "H05", "H06", "H07"], purpose: "从模型对照走向可执行方法", energyCurve: "inspect-and-lock"},
  {id: "writeback", title: "写回与收束", macroIds: ["H08", "H09", "H10", "H11"], purpose: "把选择、补写和边界收回到工作流", energyCurve: "accumulate-then-settle"},
];
const motifDefinitions = [
  {id: "selection-writeback", semanticPurpose: "选中、改写、写回", visualActor: "selected-text-and-returning-cursor", allowedRoutes: ["deterministic-graphic", "typography-only", "editorial-artwork"], accentRole: "selected-state-fill"},
  {id: "model-evidence", semanticPurpose: "模型对照与来源校准", visualActor: "verified-model-mark-and-comparison-state", allowedRoutes: ["real-evidence", "deterministic-graphic"], accentRole: "meaningful-object-fill"},
  {id: "archive-versioning", semanticPurpose: "版本积累、批注和可控收束", visualActor: "paper-version-stack-and-writeback", allowedRoutes: ["editorial-artwork", "deterministic-graphic", "typography-only"], accentRole: "verified-process-or-direction-path"},
];
const continuityItems = props.scenes.map((scene, index) => {
  const previous = props.scenes[index - 1] || null;
  const chapter = chapterFor(scene.macroId);
  const motifId = motifFor(scene);
  const previousMotif = previous ? motifFor(previous) : null;
  const transitionIn = !previous ? "opening-establish" : previousMotif === motifId ? "carry-forward" : motifId === "model-evidence" ? "evidence-cut" : motifId === "archive-versioning" ? "paper-turn" : "selection-return";
  const transitionOut = scene.motionPlan?.transitionOut || "semantic-handoff";
  return {beatId: scene.beatId, macroId: scene.macroId, chapterId: chapter.id, motifId, previousBeatId: previous?.beatId || null, relation: previous ? (previousMotif === motifId ? "same-motif-carry" : "motif-change") : "opening", transitionIn, transitionOut, energy: energyFor(scene), carryIn: previous ? `${previousMotif}->${motifId}` : "none->selection-writeback", carryOut: `${motifId}->${motifFor(props.scenes[index + 1] || scene)}`, noReset: previousMotif === motifId, reviewOnly: true};
});
const continuityManifest = {
  contract: "A1ContinuityManifest/v1",
  status: "REVIEW_ONLY",
  reviewOnly: true,
  finalRenderAllowed: false,
  projectId: props.projectId,
  sourceBinding: {propsPath: path.relative(root, propsPath).replaceAll(path.sep, "/"), propsSha256: fileHash(propsPath), sourceVariationHash: props.sourceVariationHash, visualMasterHash: props.visualMasterHash},
  policy: {singleFilmLine: true, motifCount: motifDefinitions.length, sceneCount: props.scenes.length, transitionsMustDeclareRelation: true, decorativeFloatingLinesAllowed: false},
  chapters,
  motifs: motifDefinitions,
  summary: {sceneCount: continuityItems.length, transitionCount: continuityItems.filter((item) => item.previousBeatId).length, motifChangeCount: continuityItems.filter((item) => item.relation === "motif-change").length, sameMotifCarryCount: continuityItems.filter((item) => item.noReset).length, chapterCount: chapters.length},
  items: continuityItems,
};

const combined = {contract: "A1PackagingManifests/v1", material: materialManifest, continuity: continuityManifest, sourceHash: hash(JSON.stringify({material: materialManifest, continuity: continuityManifest}))};
for (const [dir, isPublic] of [[artifactDir, false], [publicDir, true]]) {
  fs.mkdirSync(dir, {recursive: true});
  writeJson(path.join(dir, "material-manifest.json"), materialManifest);
  writeJson(path.join(dir, "continuity-manifest.json"), continuityManifest);
  writeJson(path.join(dir, "manifest.json"), combined);
}
writeJson(path.join(sourceManifestDir, "hSeriesMaterialManifest.json"), materialManifest);
writeJson(path.join(sourceManifestDir, "hSeriesContinuityManifest.json"), continuityManifest);
console.log(JSON.stringify({status: "BUILT_REVIEW_ONLY", sceneCount: props.scenes.length, material: materialManifest.summary, continuity: continuityManifest.summary, sourceHash: combined.sourceHash}, null, 2));
