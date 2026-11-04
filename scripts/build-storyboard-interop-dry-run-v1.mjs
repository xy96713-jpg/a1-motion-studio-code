#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  assertStoryboardInteropRoundTrip,
  claimStoryboardDryRunTask,
  compatibleGenerationTaskForShot,
  compileStoryboardTaskToCandidateRequest,
  compileVisualDirectionEnvelope,
  completeStoryboardDryRunTask,
  createStoryboardDryRunTask,
  createStoryboardInteropDryRunReport,
  exportStoryboardInterop,
  rejectStoryboardDryRunTask,
  roundTripStoryboardInterop,
  storyboardInteropArtifactPaths,
} from "../apps/studio-next/src/lib/a1-storyboard-interop-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const workspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const phasePath = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/current-phase.json");
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const generatedAt = new Date().toISOString();

const workspaceBefore = fs.readFileSync(workspacePath);
const phaseBefore = fs.readFileSync(phasePath);
const phase = JSON.parse(phaseBefore.toString("utf8"));
if (phase?.reviewDecision?.userVisualApproval !== "NOT_APPROVED") throw new Error("storyboard-interop-dry-run-build-invalid:user-approval");
if (phase?.reviewDecision?.motionPrototypeAllowed !== false || phase?.reviewDecision?.finalRenderAllowed !== false || phase?.reviewDecision?.resolveExportAllowed !== false) throw new Error("storyboard-interop-dry-run-build-invalid:downstream-gate");
if (Number(phase?.authority?.generationQueueProjection?.queued || 0) !== 0 || Number(phase?.authority?.generationQueueProjection?.running || 0) !== 0 || phase?.authority?.generationQueueProjection?.workerStatus !== "frozen") throw new Error("storyboard-interop-dry-run-build-invalid:generation-not-frozen");

const workspace = readProjectWorkspace(appRoot);
const directionEnvelope = compileVisualDirectionEnvelope({
  workspace,
  appRoot,
  referenceManifest: JSON.parse(fs.readFileSync(referenceManifestPath, "utf8")),
  generatedAt,
});
const interop = exportStoryboardInterop(workspace, {directionEnvelope, generatedAt});
const roundTripAudit = assertStoryboardInteropRoundTrip(roundTripStoryboardInterop(interop), workspace);
const compatibleTask = compatibleGenerationTaskForShot(interop, "ED-13", {
  visualPrompt: "Original chibi proofreader observes a smoother output tape while the unresolved knot remains under the supporting proofing machine.",
  requestedAt: generatedAt,
  selectedVariantId: "ED-13-A",
});
const candidateRequest = compileStoryboardTaskToCandidateRequest({task: compatibleTask, interop, directionEnvelope, approvalSnapshot: "NOT_APPROVED"});
const pending = createStoryboardDryRunTask(candidateRequest, {now: generatedAt});
const claimed = claimStoryboardDryRunTask(pending, {now: generatedAt});
const candidateReady = completeStoryboardDryRunTask(claimed, {now: generatedAt});
const duplicateClaimNoOp = claimStoryboardDryRunTask(claimed, {now: new Date(Date.parse(generatedAt) + 1000).toISOString()}).taskStateSha256 === claimed.taskStateSha256;
const duplicateCompleteNoOp = completeStoryboardDryRunTask(candidateReady, {now: new Date(Date.parse(generatedAt) + 2000).toISOString()}).taskStateSha256 === candidateReady.taskStateSha256;
const rejectedCandidate = rejectStoryboardDryRunTask(candidateReady, {now: new Date(Date.parse(generatedAt) + 3000).toISOString()});
const report = createStoryboardInteropDryRunReport({interop, directionEnvelope, candidateRequest, taskState: candidateReady, roundTripAudit, idempotencyAudit: {duplicateClaimNoOp, duplicateCompleteNoOp}, rejectionAudit: {status: rejectedCandidate.status, motionAllowed: rejectedCandidate.motionAllowed}, generatedAt});

if (Buffer.compare(fs.readFileSync(workspacePath), workspaceBefore) !== 0) throw new Error("storyboard-interop-dry-run-build-invalid:workspace-mutated");
if (Buffer.compare(fs.readFileSync(phasePath), phaseBefore) !== 0) throw new Error("storyboard-interop-dry-run-build-invalid:phase-mutated");

const outputs = storyboardInteropArtifactPaths(appRoot);
fs.mkdirSync(outputs.outputDir, {recursive: true});
for (const [filePath, value] of [
  [outputs.interop, interop],
  [outputs.directionEnvelope, directionEnvelope],
  [outputs.candidateRequest, candidateRequest],
  [outputs.report, report],
]) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

console.log(JSON.stringify({
  status: "PASS_DRY_RUN_ONLY",
  contract: report.contract,
  reportSha256: report.reportSha256,
  storyboardRevisionSha: interop.source.storyboardRevisionSha,
  shotCount: interop.project.shots.length,
  roundTripStatus: roundTripAudit.status,
  ed13Task: report.tasks[0],
  boundary: report.boundary,
  outputDir: path.relative(repoRoot, outputs.outputDir),
}, null, 2));
