#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {isReferenceSourceExcluded} from "../apps/studio-next/src/lib/a1-reference-source-exclusions-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const reference = workspace.production?.referenceConditioning;
const corpusPath = path.join(appRoot, "public/generated/system-line/reference-sequence-corpus-v2/corpus.json");
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
const uiSource = fs.readFileSync(path.join(appRoot, "src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx"), "utf8");
const directorSource = fs.readFileSync(path.join(appRoot, "src/lib/a1-whole-film-ai-director-v1.ts"), "utf8");
const visualBibleSource = fs.readFileSync(path.join(appRoot, "src/lib/a1-project-visual-bible-v1.mjs"), "utf8");
const productionSource = ["contracts.mjs", "state.mjs", "scene-graph.mjs", "scene-graph-candidate-compiler.mjs", "shot-ir.mjs", "motion-plan.mjs"]
  .map((file) => fs.readFileSync(path.join(appRoot, "src/lib/editorial-production", file), "utf8"))
  .join("\n");
const checks = [];
const check = (name, pass, detail = null) => checks.push({name, pass: Boolean(pass), detail});

check("reference-corpus-v2", corpus.contract === "A1ReferenceSequenceCorpus/v2", corpus.contract);
check("historical-corpus-retained-with-exclusion-overlay", corpus.sources?.some((item) => item.id === "hupo") && corpus.sources?.some((item) => item.id === "covacut") && isReferenceSourceExcluded("covacut"), corpus.sources?.map((item) => item.id));
check("active-reference-sources-exclude-user-rejected-source", JSON.stringify(reference?.referenceSourceIds || []) === JSON.stringify(["hupo"]) && reference?.excludedSourceIds?.includes("covacut"), {active: reference?.referenceSourceIds, excluded: reference?.excludedSourceIds});
check("sixteen-sequence-grammars", corpus.sequenceCount === 16 && corpus.sources?.reduce((sum, item) => sum + Number(item.sequences?.length || 0), 0) === 16, corpus.sequenceCount);
check("reference-wall-exists", fs.existsSync(path.join(appRoot, "public", String(corpus.referenceWallPublicUrl || "").replace(/^\//u, ""))), corpus.referenceWallPublicUrl);
check("current-project-reference-bound", reference?.contract === "A1ReferenceConditionedDirector/v2" && reference.allShotsBound === true && reference.boundShotCount === workspace.article.shotCount, {bound: reference?.boundShotCount, shots: workspace.article.shotCount});
check("reference-audit-passes", reference?.audit?.pass === true && reference.audit.hardFailures.length === 0, reference?.audit);
check("screen-ratio-is-metric-only", reference?.audit?.screenRatioIsMetricOnly === true && directorSource.includes("screenRatioIsMetricOnly: true") && !directorSource.includes('hardFailures.push("screen-demo-shot-ratio-above-40pct")'), reference?.audit?.screenDurationRatio);
check("current-medium-split", JSON.stringify(reference?.audit?.mediumCounts) === JSON.stringify({"presenter-clean": 3, "presenter-overlay": 6, "screen-demo": 14, "full-package": 9, "type-only": 2}), reference?.audit?.mediumCounts);
const screenIds = ["ED-03", "ED-06", "ED-25", "ED-27", "ED-30"];
check("causal-screens-restored", screenIds.every((shotId) => workspace.library.assets.find((item) => item.shotDemand?.shotId === shotId)?.shotDemand?.editMode === "screen-demo"), screenIds);
check("every-shot-has-reference-grammar", workspace.library.assets.filter((item) => item.shotDemand).every((item) => item.shotDemand.referenceConditioning?.referenceGrammarIds?.length), workspace.library.assets.filter((item) => item.shotDemand && !item.shotDemand.referenceConditioning?.referenceGrammarIds?.length).map((item) => item.shotDemand.shotId));
check("new-projects-reference-conditioned", visualBibleSource.includes("bindPlanToReferenceSequences") && visualBibleSource.includes("restoreFullFrameScreenOperation") && visualBibleSource.includes("referenceConditioning: shot.referenceConditioning"), null);
check("candidate-generator-enforces-binding", productionSource.includes("reference-sequence-binding-missing") && productionSource.includes("causal-screen-primary-coverage-too-small") && productionSource.includes("causal-screen-presenter-substitution-forbidden"), null);
check("4311-visual-reference-panel", ["ReferenceSequenceDirectorPanel", "data-a1-reference-sequence-director", "data-a1-screen-ratio-policy=\"metric-only\"", "参考的是连续剪辑语法，不是截图皮肤"].every((marker) => uiSource.includes(marker)), null);

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({contract: "A1ReferenceConditionedDirectorAuditReport/v2", status: failed.length ? "BLOCK" : "PASS", checks, failed}, null, 2));
if (failed.length) process.exitCode = 1;
