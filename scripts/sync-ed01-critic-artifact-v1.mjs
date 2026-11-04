#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench, sha256Json} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const cachePath = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/visual-critic-cache/f0c824bf61251bf829ca0bc938e04e4cbc3792f36248607bf861a3df9c02f2c7.json");
const publicReportPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/shot-candidate-critic-ED-01-latest.json");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const target = current.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-01");
  if (!target?.visualCritic || !target.candidates?.length || !fs.existsSync(cachePath)) throw new Error("ed01-critic-authority-required");
  const report = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  report.criticStability = target.visualCritic.criticStability || null;
  report.trace = {...(report.trace || {}), authoritySync: "workspace-ED-01-D16", syncedAt: now};
  const reportSha256 = sha256(report);
  fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);

  const reportCandidate = report.candidates.find((candidate) => candidate.candidateId === target.candidates[0].candidateId);
  const next = structuredClone(current);
  const nextTarget = next.library.assets.find((asset) => asset.id === target.id);
  nextTarget.visualCritic = {...nextTarget.visualCritic, reportSha256, reportPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/shot-candidate-critic-ED-01-latest.json"};
  if (reportCandidate) {
    nextTarget.candidates = nextTarget.candidates.map((candidate) => candidate.candidateId === reportCandidate.candidateId
      ? {...candidate, screening: {status: "kept", score: reportCandidate.score, maxScore: 24, hardFailures: report.hardFailures || [], visualEvidence: reportCandidate.visualEvidence, repairBrief: reportCandidate.repairBrief, reportSha256, criticStability: nextTarget.visualCritic.criticStability}}
      : candidate);
  }
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const hashInput = structuredClone(recalculated);
  delete hashInput.workspaceSha256;
  if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  recalculated.workspaceSha256 = sha256Json(hashInput);
  recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256;
  assertEditorialAssetWorkbench(recalculated);
  persistProjectState(appRoot, recalculated);
  return {workspaceSha256: recalculated.workspaceSha256, reportSha256, candidateId: nextTarget.candidates[0].candidateId, score: report.totalScore, criticStability: nextTarget.visualCritic.criticStability};
});

console.log(JSON.stringify({status: "ED01_CRITIC_ARTIFACT_SYNCED", ...result}, null, 2));
