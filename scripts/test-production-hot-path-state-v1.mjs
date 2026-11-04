import fs from "node:fs";
import path from "node:path";

import {assertProductionHotPathState} from "../apps/studio-next/src/lib/a1-production-hot-path-state-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const publicPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/hot-path-state.json");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/hot-path-state.json");
const supervisorReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/generation-supervisor-v1/report.json");
const publicState = assertProductionHotPathState(JSON.parse(fs.readFileSync(publicPath, "utf8")));
const artifactState = assertProductionHotPathState(JSON.parse(fs.readFileSync(artifactPath, "utf8")));
if (JSON.stringify(publicState) !== JSON.stringify(artifactState)) throw new Error("hot-path-state-mirror-drift");
if (publicState.hotPathProjection.styleLock?.heroTitleStyleMode !== "EVA_MECHANISM_CJK") throw new Error("hot-path-state-eva-style-mode-missing");
const bytes = fs.statSync(publicPath).size;
if (bytes >= 100 * 1024) throw new Error(`hot-path-state-too-large:${bytes}`);
const supervisorReport = JSON.parse(fs.readFileSync(supervisorReportPath, "utf8"));
if (supervisorReport.status === "WAITING" && supervisorReport.stateSource !== "hot-path-state") throw new Error("supervisor-hot-path-state-not-used");

console.log(JSON.stringify({
  status: "PASS",
  contract: publicState.contract,
  bytes,
  workspaceSha256: publicState.workspaceSha256,
  currentStage: publicState.hotPathProjection.currentStageId,
  workerStatus: publicState.generation.workerStatus,
  queue: publicState.generation.summary.queued,
  eva: publicState.hotPathProjection.styleLock.heroTitleStyleMode,
  supervisorStateSource: supervisorReport.stateSource || null,
}, null, 2));
