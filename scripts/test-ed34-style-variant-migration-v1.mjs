#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertPackageLookMasterPlan} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {assertPackageAssetKitPlan, assertPackageAssemblyRecipe} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";

const appRoot = path.resolve("apps/studio-next");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const production = workspace.production;
const runtime = production.shotIntelligence;
const look = runtime.packageLookMasterPlans.find((plan) => plan.shotId === "ED-34");
const kit = runtime.packageAssetKitPlans.find((plan) => plan.shotId === "ED-34");
const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-34");
const brief = runtime.semanticDesignBriefSet?.briefs?.find((item) => item.shotId === "ED-34");

if (!brief || !look || !kit || !recipe) throw new Error("ed34-style-migration-fixture-missing");
assertPackageLookMasterPlan(look);
assertPackageAssetKitPlan(kit);
assertPackageAssemblyRecipe(kit, recipe);
if (brief.status !== "READY" || brief.packageDecision !== "PACKAGE") throw new Error("ed34-semantic-brief-not-ready");
if (!brief.semanticActor?.identity || !brief.semanticActor?.action || !brief.semanticActor?.target) throw new Error("ed34-concrete-semantic-actor-missing");
const semanticPayload = JSON.stringify({narrativeJob: brief.narrativeJob, viewerTakeaway: brief.viewerTakeaway, viewerQuestion: brief.viewerQuestion, semanticActor: brief.semanticActor});
if (/semantic-beat-actor|author-preference-direction|mechanism-choice-convergence/i.test(semanticPayload)) throw new Error("ed34-legacy-semantic-template-leaked");
if (look.current === true || kit.current !== false || recipe.current !== false || kit.status !== "HISTORY_READ_ONLY" || recipe.status !== "HISTORY_READ_ONLY") throw new Error("ed34-history-authority-status-drift");
if (kit.layers.some((layer) => (layer.candidates || []).length !== 0)) throw new Error("ed34-history-kit-created-layer-candidates");
if (production.packagingLifecycleProjection?.status !== "WHOLE_FILM_STATIC_BOARD_READY" || workspace.status !== "PACKAGING_LANE_WHOLE_FILM_STATIC_BOARD_READY") throw new Error("ed34-current-static-board-authority-drift");
if (runtime.semanticPilot?.recommendation !== null || runtime.semanticPilot?.selected !== null || (runtime.semanticPilot?.currentAssembly || []).length !== 0) throw new Error("ed34-semantic-pilot-created-selection");
if (production.generation.summary.queued !== 0 || production.generation.summary.running !== 0 || production.generation.workerStatus !== "frozen") throw new Error("ed34-style-migration-generation-not-frozen");
console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, ed34: {briefSha256: brief.briefSha256, narrativeJob: brief.narrativeJob, semanticActor: brief.semanticActor, lookStatus: look.status, historicalLookCandidates: (look.candidates || []).length, kitStatus: kit.status, recipeStatus: recipe.status, current: false, layerCandidates: 0}, semanticPilot: {status: runtime.semanticPilot.status, recommendation: null, selected: null, currentAssembly: []}, queue: production.generation.summary, worker: production.generation.workerStatus}, null, 2));
