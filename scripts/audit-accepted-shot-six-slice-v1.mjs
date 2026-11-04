#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "accepted-shot-six-slice-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererPublic = path.join(root, "remotion-renderer/public");
const board = JSON.parse(fs.readFileSync(path.join(publicDir, "candidate-board.json"), "utf8"));
const ledger = JSON.parse(fs.readFileSync(path.join(publicDir, "review-decisions.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(publicDir, "report.json"), "utf8"));
const renderReport = JSON.parse(fs.readFileSync(path.join(publicDir, "render-report.json"), "utf8"));
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const failures = [];
if (board.contract !== "A1ShotCandidateBoard/v1") failures.push("board-contract");
if (board.phaseId !== phaseId) failures.push("board-phase");
if (board.shots?.length !== 6) failures.push("shot-count-not-six");
if (new Set(board.shots.map((shot) => shot.adapterId)).size !== 6) failures.push("adapter-count-not-six");
if (board.shots.some((shot) => shot.candidates?.length !== 4)) failures.push("candidate-count-not-four-per-shot");
if (board.shots.some((shot) => shot.candidates.some((candidate) => candidate.candidatePreviewOnly !== true || candidate.formalRenderAllowed !== false))) failures.push("candidate-formal-gate-invalid");
if (board.shots.some((shot) => shot.candidates.some((candidate) => candidate.acceptedShotDesign?.forbiddenPatterns?.some((pattern) => !["generic-card", "floating-HUD", "white-document-card", "decorative-unanchored-lines", "fake-evidence", "subtitle-stack", "repeated-family-template"].includes(pattern))))) failures.push("forbidden-pattern-contract-drift");
if (board.gates?.dynamicPrototypeAllowed !== false || board.gates?.h47ExpansionAllowed !== false || board.gates?.fullRenderAllowed !== false || board.gates?.finalRenderAllowed !== false) failures.push("expansion-gate-open");
if (ledger.decisions?.length !== 6 || ledger.summary?.shotCount !== 6) failures.push("ledger-count");
if (renderReport.status !== "CANDIDATE_STILLS_RENDERED" || renderReport.renderedCount !== 24 || renderReport.currentAuthority?.unchanged !== true) failures.push("render-report");
for (const shot of board.shots) for (const candidate of shot.candidates) {
  const still = candidate.still;
  if (!still || !fs.existsSync(path.join(root, "apps/studio-next/public", still.publicUrl))) failures.push(`still-missing:${candidate.candidateId}`);
  if (candidate.acceptedShotDesign.primaryMaterial.assetUri && !fs.existsSync(path.join(rendererPublic, candidate.acceptedShotDesign.primaryMaterial.assetUri))) failures.push(`material-missing:${candidate.candidateId}`);
}
const boardWithoutHash = {...board}; delete boardWithoutHash.boardSha256;
if (sha(boardWithoutHash) !== board.boardSha256) failures.push("board-sha");
if (ledger.boardSha256 !== board.boardSha256) failures.push("ledger-board-sha");
const approvedCount = ledger.summary.approvedCount || 0;
const status = failures.length ? "BLOCKED" : approvedCount === 6 ? "SIX_SHOTS_APPROVED_IR_COMPILATION_PENDING" : "CANDIDATE_PREVIEW_READY_PENDING_USER_REVIEW";
const output = {contract: "A1AcceptedShotSixSliceAudit/v1", phaseId, status, failures, summary: {shotCount: board.shots.length, candidateCount: board.shots.reduce((total, shot) => total + shot.candidates.length, 0), approvedCount, pendingCount: ledger.summary.pendingCount, reviseCount: ledger.summary.reviseCount, adapterCount: new Set(board.shots.map((shot) => shot.adapterId)).size}, gates: {candidatePreviewOnly: true, acceptedShotIrCompilation: approvedCount > 0, dynamicPrototypeAllowed: false, h47ExpansionAllowed: false, finalRenderAllowed: false}, nextAction: approvedCount === 6 ? "compile-accepted-shot-ir-then-design-dynamic-prototype" : "user-review-six-shot-candidate-board"};
fs.writeFileSync(path.join(publicDir, "audit-report.json"), `${JSON.stringify(output, null, 2)}\n`); fs.mkdirSync(path.join(root, ".codex-artifacts/system-progress-system-line", phaseId), {recursive: true}); fs.writeFileSync(path.join(root, ".codex-artifacts/system-progress-system-line", phaseId, "audit-report.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
if (failures.length) process.exitCode = 1;
