import fs from "node:fs";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";

const workspacePath = "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json";
const source = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const now = "2026-08-18T11:00:00.000Z";
const full = recalculateEditorialAssetWorkbench(structuredClone(source), now, {scope: "full"});
const hot = recalculateEditorialAssetWorkbench(structuredClone(source), now, {scope: "packaging-hot-path"});
const selected = (workspace) => ({
  status: workspace.status,
  summary: workspace.summary,
  authority: workspace.production.authority,
  hotPathProjection: workspace.production.hotPathProjection,
  packagingLifecycleProjection: workspace.production.packagingLifecycleProjection,
  assetPackSha256: workspace.library.assetPackSha256,
  visualBibleSha256: workspace.visualBible.sha256,
  requirementGraphSha256: workspace.assetRequirementGraph.sha256,
  stages: workspace.stages,
});
if (JSON.stringify(selected(full)) !== JSON.stringify(selected(hot))) throw new Error("packaging-hot-path-projection-drift");
if (hot.library.assets.length !== source.library.assets.length || hot.production.generation.jobs.length !== source.production.generation.jobs.length) throw new Error("packaging-hot-path-dropped-state");

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1PackagingHotPathRecalculationTest/v1",
  projectionParity: true,
  assetCount: hot.library.assets.length,
  jobCount: hot.production.generation.jobs.length,
}, null, 2));
