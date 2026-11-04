#!/usr/bin/env node

import path from "node:path";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertProductionHotPathProjection, buildProductionHotPathProjection} from "../apps/studio-next/src/lib/a1-production-hot-path-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.join(process.cwd(), "apps/studio-next");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const projection = assertProductionHotPathProjection(buildProductionHotPathProjection(workspace));
if (projection.primaryMetric.shotCount !== Number(workspace.article.shotCount)) throw new Error("hot-path-shot-count-mismatch");
if (projection.primaryMetric.durationMs !== Number(workspace.article.durationMs)) throw new Error("hot-path-duration-mismatch");
if (projection.stages.length !== 4) throw new Error("hot-path-stage-count-invalid");
if (projection.styleLock.heroTitleStyleMode !== "EVA_MECHANISM_CJK") throw new Error("hot-path-eva-style-mode-missing");
console.log(JSON.stringify({status: "PASS", contract: projection.contract, currentStage: projection.currentStageId, shotCount: projection.primaryMetric.shotCount, durationMs: projection.primaryMetric.durationMs, heroTitleStyleMode: projection.styleLock.heroTitleStyleMode, stages: projection.stages.map((item) => ({id: item.id, status: item.status}))}, null, 2));
