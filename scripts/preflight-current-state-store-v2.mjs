#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildCurrentStateRetentionPlan, rehydrateCurrentStateWorkspace} from "../apps/studio-next/src/lib/a1-current-state-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const retention = buildCurrentStateRetentionPlan(workspace);
const rehydrated = rehydrateCurrentStateWorkspace(retention.compactedWorkspace, retention.plan, retention.chunks);
if (JSON.stringify(rehydrated) !== JSON.stringify(workspace)) throw new Error("current-state-store-preflight-round-trip-failed");
for (const key of ["authority", "storyboardProductionProjection"]) if (JSON.stringify(retention.compactedWorkspace.production[key]) !== JSON.stringify(workspace.production[key])) throw new Error(`current-state-store-preflight-projection-changed:${key}`);
if (JSON.stringify(retention.compactedWorkspace.production.shotIntelligence.currentStoryboardAuthority) !== JSON.stringify(workspace.production.shotIntelligence.currentStoryboardAuthority)) throw new Error("current-state-store-preflight-storyboard-authority-changed");
const out = path.join(root, "work/current-state-store-v2"); fs.mkdirSync(out, {recursive: true});
const report = {contract: "A1CurrentStateStorePreflight/v2", status: "PASS", sourceWorkspaceSha256: workspace.workspaceSha256, planSha256: retention.plan.planSha256, archivedRecordCount: retention.plan.archivedRecordCount, sourcePrettyBytes: Buffer.byteLength(`${JSON.stringify(workspace, null, 2)}\n`), projectedCompactBytes: Buffer.byteLength(`${JSON.stringify(retention.compactedWorkspace)}\n`), reductionRatio: Number((1 - Buffer.byteLength(JSON.stringify(retention.compactedWorkspace)) / Buffer.byteLength(JSON.stringify(workspace))).toFixed(4)), exactRoundTrip: true, productionStateChanged: false, filesDeleted: 0, mediaMoved: 0};
fs.writeFileSync(path.join(out, "preflight.json"), `${JSON.stringify(report, null, 2)}\n`); fs.writeFileSync(path.join(out, "plan.json"), `${JSON.stringify(retention.plan, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
