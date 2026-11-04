#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const handoffPath = path.join(root, "HANDOFF-CURRENT.md");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const authorityPath = path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json");
const sourceProofPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/source-proof-lanes/ed02-real-writing-workbench/lane.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function handoffSummary(markdown) {
  return markdown.split(/\r?\n/u).filter((line) => /^## (Stage|One next action|Blocking work)/u.test(line) || /^- (Stage|Generation frozen|34-shot|Future visual authority|ED-|Review|The system)/u.test(line)).slice(0, 24);
}

const phase = readJson(phasePath);
const authority = readJson(authorityPath);
const sourceProof = readJson(sourceProofPath);
const projection = {
  contract: "A1FastContinuationProjection/v1",
  status: "PASS",
  readMode: "HANDOFF_PLUS_EXACT_CURRENT_PROJECTIONS_ONLY",
  filesRead: [path.relative(root, handoffPath), path.relative(root, phasePath), path.relative(root, authorityPath), path.relative(root, sourceProofPath)],
  handoff: handoffSummary(fs.readFileSync(handoffPath, "utf8")),
  phase: {
    status: phase.status || phase.phase?.status || null,
    currentStage: phase.currentStage || phase.authority?.currentStage || null,
    workspaceSha256: phase.workspaceSha256 || phase.authority?.workspaceSha256 || phase.workspace?.sha256 || null,
    nextAction: phase.nextAction || phase.authority?.nextAction || null,
  },
  authority: {
    auditStatus: authority.status || null,
    effectiveStatus: authority.detail?.effectiveReviewAuthority?.status || authority.nextAction?.status || null,
    nextAction: authority.nextAction || authority.detail?.effectiveReviewAuthority?.nextAction || null,
    failures: authority.failures || [],
  },
  sourceProof: {
    status: sourceProof.status || null,
    shotId: sourceProof.shotId || null,
    laneId: sourceProof.laneId || sourceProof.id || null,
  },
  boundaries: {
    historicalTranscriptRead: false,
    fullWorkspaceRead: false,
    generatedMediaScan: false,
    generationDispatch: false,
    assemblyMotionRenderRelease: false,
  },
};
process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
