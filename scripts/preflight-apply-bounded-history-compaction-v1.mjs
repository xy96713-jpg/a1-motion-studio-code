#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {buildBoundedHistoryRetentionPlan} from "../apps/studio-next/src/lib/a1-bounded-history-retention-v1.mjs";
import {projectDirs, readCheckpointJournal, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir, artifactDir} = projectDirs(appRoot);
const expectedPlanSha256 = process.env.A1_HISTORY_COMPACTION_PLAN_SHA256 || null;
const explicitApproval = process.env.A1_HISTORY_COMPACTION_APPLY_APPROVED === "1";
const workspace = readProjectWorkspace(appRoot);
const currentPlan = buildBoundedHistoryRetentionPlan(workspace, {keepRecentFingerprints: 3, maxRecordsPerChunk: 100});
const persistedPlanPath = path.join(root, ".codex-artifacts/system-progress-system-line/bounded-history-compaction-v1/retention-plan.json");
const persistedPlan = fs.existsSync(persistedPlanPath) ? JSON.parse(fs.readFileSync(persistedPlanPath, "utf8")) : null;
const checkpoint = readCheckpointJournal(appRoot);
const checks = [
  {id: "PERSISTED_PLAN_CURRENT", pass: persistedPlan?.planSha256 === currentPlan.plan.planSha256 && persistedPlan?.sourceWorkspaceSha256 === workspace.workspaceSha256},
  {id: "EXPECTED_PLAN_SHA_EXACT", pass: expectedPlanSha256 === currentPlan.plan.planSha256},
  {id: "EXPLICIT_APPLY_APPROVAL", pass: explicitApproval},
  {id: "EXACT_JSON_ROUND_TRIP", pass: currentPlan.verification.exactJsonRoundTrip === true && currentPlan.verification.allCollectionsResolvable === true},
  {id: "GENERATION_FROZEN", pass: workspace.production?.generation?.workerStatus === "frozen" && workspace.production?.generation?.automaticDispatchAllowed === false && !workspace.production.generation.jobs.some((job) => ["queued", "running"].includes(job.status))},
  {id: "USER_VISUAL_APPROVAL_UNCHANGED", pass: workspace.production?.storyboardProductionProjection?.gate?.userVisualApproval === "NOT_APPROVED"},
  {id: "NO_PENDING_CHECKPOINT", pass: checkpoint?.status !== "PREPARING"},
  {id: "MIRROR_PAIR_PRESENT", pass: fs.existsSync(path.join(publicDir, "workspace.json")) && fs.existsSync(path.join(artifactDir, "workspace.json"))},
];
const blockers = checks.filter((check) => !check.pass).map((check) => check.id);
const report = {
  contract: "A1BoundedHistoryCompactionApplyPreflight/v1",
  status: blockers.length ? "BLOCKED_NO_MUTATION" : "READY_FOR_SEPARATE_APPLY_COMMAND",
  planSha256: currentPlan.plan.planSha256,
  expectedPlanSha256,
  checks,
  blockers,
  mutations: {workspaceWritten: false, archiveWritten: false, filesMoved: 0, filesDeleted: 0, linksCreated: 0},
};
console.log(JSON.stringify(report, null, 2));
if (!blockers.length) console.log("Preflight only: no apply implementation is invoked by this command.");
