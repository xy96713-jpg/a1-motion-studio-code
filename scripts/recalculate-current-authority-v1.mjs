#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(current));
  if (recalculated.workspaceSha256 !== current.workspaceSha256) {
    persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: current.workspaceSha256});
  }
  return {before: current.workspaceSha256, after: recalculated.workspaceSha256, changed: recalculated.workspaceSha256 !== current.workspaceSha256, authority: recalculated.production.authority.nextAction};
});

console.log(JSON.stringify({status: "PASS", ...result}, null, 2));
