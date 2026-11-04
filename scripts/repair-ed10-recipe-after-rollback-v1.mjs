#!/usr/bin/env node
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildPackageAssemblyRecipe} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
const appRoot = `${process.cwd()}/apps/studio-next`;
withProjectLock(appRoot, () => {
  const workspace = readProjectWorkspace(appRoot);
  const runtime = workspace.production.shotIntelligence;
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  if (!runtime.packageAssemblyRecipes.some((item) => item.shotId === "ED-10")) runtime.packageAssemblyRecipes.push(buildPackageAssemblyRecipe(kit, {now: new Date().toISOString()}));
  recalculateEditorialAssetWorkbench(workspace);
  persistProjectState(appRoot, workspace);
  console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256}, null, 2));
});
