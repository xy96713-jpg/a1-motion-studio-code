#!/usr/bin/env node
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const noAtlas = process.argv.includes("--no-atlas");
const noGlobalReview = process.argv.includes("--no-global-review");
const noCritic = process.argv.includes("--no-critic");
const force = process.argv.includes("--force");
const requestedShotIds = process.argv.find((item) => item.startsWith("--shots="))?.slice("--shots=".length).split(",").map((item) => item.trim()).filter(Boolean) || null;

function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout?.trim()) process.stdout.write(`${result.stdout.trim()}\n`);
  if (result.status !== 0) {
    if (result.stderr?.trim()) process.stderr.write(`${result.stderr.trim()}\n`);
    throw new Error(`all-shot-rebuild-child-failed:${script}:${args.join(":")}:${result.status}`);
  }
}

function currentWorkspace() {
  return assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
}

let workspace = currentWorkspace();
if (!workspace.production.assembly.presenterMediaBound) throw new Error("all-shot-rebuild-real-presenter-video-required");
if (!workspace.production.assembly.causalScreenRecordingBound) throw new Error("all-shot-rebuild-real-causal-screen-required");
if (!workspace.gates.shotCompositionAllowed) throw new Error(`all-shot-rebuild-foundation-gate-locked:${workspace.gates.blockers.join(",")}`);

const allShotIds = workspace.library.assets
  .filter((asset) => asset.route === "shot-composition" && asset.shotDemand)
  .sort((left, right) => Number(left.shotDemand.order) - Number(right.shotDemand.order))
  .map((asset) => asset.shotDemand.shotId);
if (allShotIds.length !== workspace.article.shotCount) throw new Error(`all-shot-rebuild-count-mismatch:${allShotIds.length}:${workspace.article.shotCount}`);
const shotIds = requestedShotIds || allShotIds;
for (const shotId of shotIds) if (!allShotIds.includes(shotId)) throw new Error(`all-shot-rebuild-requested-shot-missing:${shotId}`);

const summary = [];
for (const [index, shotId] of shotIds.entries()) {
  workspace = currentWorkspace();
  let shot = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === shotId);
  if (!shot) throw new Error(`all-shot-rebuild-shot-missing:${shotId}`);
  process.stdout.write(`[${String(index + 1).padStart(2, "0")}/${shotIds.length}] ${shotId} · ${shot.shotDemand.editMode}\n`);
  if (force || !shot.candidates?.length) {
    run("build-shot-scene-graph-candidates-v1.mjs", [`--shot=${shotId}`]);
    workspace = currentWorkspace();
    shot = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === shotId);
  }
  const renderSourceSha256 = sha256(shot.candidates.map((candidate) => candidate.candidateSha256));
  if (!shot.candidateRender || shot.candidateRender.renderSourceSha256 !== renderSourceSha256) {
    run("render-shot-scene-graph-candidates-v1.mjs", [`--shot=${shotId}`]);
    workspace = currentWorkspace();
    shot = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === shotId);
  }
  const selected = shot.candidates.find((candidate) => candidate.candidateId === shot.selectedCandidateId);
  const criticCurrent = Boolean(
    shot.visualCritic
    && selected
    && shot.visualCritic.selectedCandidateId === shot.selectedCandidateId
    && shot.visualCritic.reportSha256,
  );
  if (!noCritic && !criticCurrent) {
    run("run-shot-candidate-critic-v1.mjs", [`--shot=${shotId}`]);
    workspace = currentWorkspace();
    shot = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === shotId);
  }
  summary.push({
    shotId,
    editMode: shot.shotDemand.editMode,
    candidateCount: shot.candidates.length,
    selectedCandidateId: shot.selectedCandidateId,
    score: shot.visualCritic?.totalScore ?? null,
    provisionalAdmission: shot.visualCritic?.provisionalAdmission === true,
    referenceMaturity: shot.visualCritic?.referenceMaturity === true,
    hardFailures: shot.visualCritic?.hardFailures || [],
  });
}

if (!noGlobalReview) {
  run("render-all-shot-selected-contact-sheet-v1.mjs", ["--persist"]);
  run("optimize-shot-selection-continuity-v1.mjs");
  run("render-all-shot-selected-contact-sheet-v1.mjs", ["--persist"]);
}
if (!noAtlas) run("render-editorial-approved-shot-motion-proof-v1.mjs", ["--profile=all-selected-atlas"]);

workspace = currentWorkspace();
const result = {
  contract: "A1AllShotSceneGraphRebuildResult/v1",
  status: summary.every((shot) => shot.selectedCandidateId && !shot.hardFailures.length) ? "ALL_SHOTS_SELECTED_VISUAL_MATURITY_PENDING" : "BLOCK",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  shotCount: summary.length,
  selectedCount: summary.filter((shot) => shot.selectedCandidateId).length,
  provisionalCount: summary.filter((shot) => shot.provisionalAdmission).length,
  referenceMatureCount: summary.filter((shot) => shot.referenceMaturity).length,
  hardFailureCount: summary.reduce((sum, shot) => sum + shot.hardFailures.length, 0),
  criticSkipped: noCritic,
  presenterVideoBound: workspace.production.assembly.presenterMediaBound,
  causalScreenBound: workspace.production.assembly.causalScreenRecordingBound,
  globalVisualStatus: workspace.production.maturityLoop.allShotSelectedReview?.status || null,
  acceptedShotIrAllowed: workspace.gates.acceptedShotIrAllowed,
  shots: summary,
};
console.log(JSON.stringify(result, null, 2));
if (result.status === "BLOCK") process.exitCode = 1;
