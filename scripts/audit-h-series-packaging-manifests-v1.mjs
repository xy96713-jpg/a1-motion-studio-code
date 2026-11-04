#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const directorPlanPath = path.join(root, "remotion-renderer/src/hSeriesSemanticDirectorPlan.json");
const rendererPath = path.join(root, "remotion-renderer/src/HSeriesSemanticDirectedStage.tsx");
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-packaging-manifests-v1");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/h-series-packaging-manifests-v1");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const failures = [];
const check = (name, condition, detail) => { if (!condition) failures.push({name, detail}); };
const props = read(propsPath);
const directorPlan = read(directorPlanPath);
const directedItems = Object.values(directorPlan.macroDesigns || {}).flat();
const directedByBeat = new Map(directedItems.map((item) => [item.beatId, item]));
const materialPath = path.join(artifactDir, "material-manifest.json");
const continuityPath = path.join(artifactDir, "continuity-manifest.json");
const publicMaterialPath = path.join(publicDir, "material-manifest.json");
const publicContinuityPath = path.join(publicDir, "continuity-manifest.json");
const material = fs.existsSync(materialPath) ? read(materialPath) : {};
const continuity = fs.existsSync(continuityPath) ? read(continuityPath) : {};
const propsIds = props.scenes?.map((scene) => scene.beatId) || [];
const materialIds = material.items?.map((item) => item.beatId) || [];
const continuityIds = continuity.items?.map((item) => item.beatId) || [];
check("material-contract", material.contract === "A1MaterialManifest/v1", material.contract);
check("continuity-contract", continuity.contract === "A1ContinuityManifest/v1", continuity.contract);
check("review-only-boundary", material.reviewOnly === true && material.finalRenderAllowed === false && continuity.reviewOnly === true && continuity.finalRenderAllowed === false, {material: material.reviewOnly, continuity: continuity.reviewOnly});
check("props-binding", material.sourceBinding?.propsSha256 === sha(propsPath) && continuity.sourceBinding?.propsSha256 === sha(propsPath), {material: material.sourceBinding?.propsSha256, continuity: continuity.sourceBinding?.propsSha256, actual: sha(propsPath)});
check("director-plan-binding", material.sourceBinding?.directorPlanSha256 === sha(directorPlanPath) && material.sourceBinding?.rendererSha256 === sha(rendererPath), material.sourceBinding);
check("director-plan-47-unique-beats", directedItems.length === 47 && new Set(directedItems.map((item) => item.beatId)).size === 47, {count: directedItems.length, unique: new Set(directedItems.map((item) => item.beatId)).size});
check("material-coverage", propsIds.length > 0 && propsIds.length === materialIds.length && propsIds.every((id, index) => materialIds[index] === id), {props: propsIds.length, material: materialIds.length});
check("director-plan-coverage", propsIds.length === directedItems.length && propsIds.every((id) => directedByBeat.has(id)), {props: propsIds.length, directed: directedItems.length, missing: propsIds.filter((id) => !directedByBeat.has(id))});
check("continuity-coverage", propsIds.length > 0 && propsIds.length === continuityIds.length && propsIds.every((id, index) => continuityIds[index] === id), {props: propsIds.length, continuity: continuityIds.length});
check("transition-coverage", (continuity.items || []).filter((item) => item.previousBeatId).length === Math.max(0, propsIds.length - 1), continuity.summary);
check("chapter-coverage", continuity.chapters?.length === 3 && continuity.chapters.every((chapter) => chapter.macroIds?.length), continuity.chapters);
check("motif-coverage", continuity.motifs?.length === 3 && (continuity.items || []).every((item) => continuity.motifs.some((motif) => motif.id === item.motifId)), continuity.motifs);
check("no-floating-line-policy", continuity.policy?.decorativeFloatingLinesAllowed === false, continuity.policy);
const sourceFileFailures = [];
for (const item of material.items || []) {
  const directed = directedByBeat.get(item.beatId);
  check(`route:${item.beatId}`, ["real-evidence", "editorial-artwork", "deterministic-graphic", "typography-only"].includes(item.route) && item.route === directed?.route, {manifest: item.route, directed: directed?.route});
  check(`visual-job:${item.beatId}`, item.visualJob === directed?.visualJob, {manifest: item.visualJob, directed: directed?.visualJob});
  check(`display-lines:${item.beatId}`, JSON.stringify(item.displayLines) === JSON.stringify(directed?.lines), {manifest: item.displayLines, directed: directed?.lines});
  check(`renderer-binding:${item.beatId}`, item.status === "renderer-bound" && item.rendererBinding?.sourceFile === "remotion-renderer/src/HSeriesSemanticDirectedStage.tsx" && item.rendererBinding?.sourceSha256 === sha(rendererPath), {status: item.status, binding: item.rendererBinding});
  if (item.route === "real-evidence") check(`evidence-provenance:${item.beatId}`, item.sources?.length > 0 && item.sources.every((source) => source.sourceUrl && source.officialHost && source.sha256), item.sources);
  for (const source of item.sources || []) {
    if (!source.path) continue;
    const candidate = path.join(root, "remotion-renderer/public", source.path);
    if (!fs.existsSync(candidate)) sourceFileFailures.push({beatId: item.beatId, path: source.path, reason: "missing"});
    else if (source.sha256 && sha(candidate) !== source.sha256) sourceFileFailures.push({beatId: item.beatId, path: source.path, reason: "sha-mismatch"});
  }
}
check("bound-material-files", sourceFileFailures.length === 0, sourceFileFailures);
const artworkItems = (material.items || []).filter((item) => item.route === "editorial-artwork");
const artworkPaths = artworkItems.map((item) => item.rendererBinding?.assetPath).filter(Boolean);
const deterministicItems = (material.items || []).filter((item) => item.route === "deterministic-graphic");
check("artwork-seven-unique-renderer-assets", artworkItems.length === 7 && new Set(artworkPaths).size === artworkItems.length, {count: artworkItems.length, unique: new Set(artworkPaths).size, artworkPaths});
check("deterministic-graphics-really-rendered", deterministicItems.length >= 22 && deterministicItems.every((item) => item.rendererBinding?.component?.startsWith("HSeriesSemanticDirectedStage:")), {count: deterministicItems.length, failures: deterministicItems.filter((item) => !item.rendererBinding?.component?.startsWith("HSeriesSemanticDirectedStage:")).map((item) => item.beatId)});
check("no-pending-or-repeated-candidate-assets", material.summary?.candidateCount === 0 && material.summary?.pendingVisualReviewCount === 0, material.summary);
const brokenHelperPattern = /料和文章结构|者想补充什么|出候选|表现选择逐渐|DeepSe|epSeek|API的|文确实|者类比|只不/u;
const brokenHelpers = props.scenes.flatMap((scene) => [...(scene.supportTokens || []), ...(scene.presentation?.tokens || [])].filter((token) => brokenHelperPattern.test(token)).map((token) => ({beatId: scene.beatId, token})));
check("no-broken-helper-text", brokenHelpers.length === 0, brokenHelpers);
check("artifact-public-parity", fs.existsSync(publicMaterialPath) && fs.existsSync(publicContinuityPath) && sha(materialPath) === sha(publicMaterialPath) && sha(continuityPath) === sha(publicContinuityPath), {material: fs.existsSync(publicMaterialPath) ? sha(publicMaterialPath) : null, continuity: fs.existsSync(publicContinuityPath) ? sha(publicContinuityPath) : null});
const report = {contract: "A1HSeriesPackagingManifestAudit/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", reviewOnly: true, rendererAdoptionAllowed: false, finalRenderAllowed: false, generatedAt: new Date().toISOString(), sourceBinding: {propsPath: path.relative(root, propsPath), propsSha256: sha(propsPath), directorPlanPath: path.relative(root, directorPlanPath), directorPlanSha256: sha(directorPlanPath), rendererPath: path.relative(root, rendererPath), rendererSha256: sha(rendererPath), sceneCount: propsIds.length}, material: {contract: material.contract, summary: material.summary, routeCounts: material.summary?.routeCounts, artworkBeatIds: artworkItems.map((item) => item.beatId), deterministicBeatIds: deterministicItems.map((item) => item.beatId)}, continuity: {contract: continuity.contract, summary: continuity.summary, chapters: continuity.chapters?.map((chapter) => chapter.id), motifs: continuity.motifs?.map((motif) => motif.id)}, failures, nextAction: failures.length ? "repair-packaging-manifest-failures" : "review-static-boards-and-motion-candidate-before-source-adoption"};
for (const file of [path.join(artifactDir, "audit.json"), path.join(publicDir, "audit.json")]) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(2);
