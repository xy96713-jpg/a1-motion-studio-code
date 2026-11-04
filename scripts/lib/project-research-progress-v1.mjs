import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {nodeInputHash} from "../../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {researchStaticScopedSampleV1} from "../../apps/studio-next/src/lib/a1-research-static-scope-v1.mjs";

import {MAX_RESEARCH_TASK_ARTIFACTS_V1, MAX_RESEARCH_TASK_CANDIDATES_V1, MAX_RESEARCH_TASK_MANIFEST_BYTES_V1} from "../../apps/studio-next/src/lib/a1-system-line-research-task-manifest-v1.mjs";

const CONTRACT = "A1SystemLineResearchTaskManifest/v1";
const MAX_BYTES = MAX_RESEARCH_TASK_MANIFEST_BYTES_V1;
const STATES = ["ENTRY", "HOLD", "HANDOFF"];
const stale = (status) => /STALE|SUPERSEDED|RETIRED/u.test(status || "");

/** Project registered metadata only. Never verifies media or grants a stage transition. */
export function projectResearchProgressV1(manifest, taskId) {
  if (manifest?.contract !== CONTRACT || manifest.taskId !== taskId
    || manifest.scope !== "RESEARCH_ONLY" || manifest.productionAdmission !== false
    || !Array.isArray(manifest.sequences) || manifest.sequences.length > 500
    || !Array.isArray(manifest.candidates) || manifest.candidates.length > MAX_RESEARCH_TASK_CANDIDATES_V1
    || !Array.isArray(manifest.artifacts) || manifest.artifacts.length > MAX_RESEARCH_TASK_ARTIFACTS_V1
    || manifest.summary?.sequenceCount !== manifest.sequences.length
    || ["visuallyAcceptedCount", "registeredRenderCount"].some((key) => !Number.isSafeInteger(manifest.summary[key])
      || manifest.summary[key] < 0)
    || manifest.summary.visuallyAcceptedCount > manifest.sequences.length) {
    throw new Error("research-progress-manifest-invalid");
  }
  const {sha256, ...body} = manifest;
  if (nodeInputHash(body) !== sha256) throw new Error("research-progress-manifest-sha-mismatch");
  const rows = new Map();
  for (const sequence of manifest.sequences) {
    if (typeof sequence.sequenceId !== "string" || rows.has(sequence.sequenceId)) {
      throw new Error("research-progress-sequence-identity-invalid");
    }
    rows.set(sequence.sequenceId, {sequence, passFrames: new Set(), coreFrames: new Set(), unknownFrames: 0,
      candidateCount: 0, passCandidateIds: [], observedSampleCount: 0});
  }
  const artifactIds = new Set(manifest.artifacts.map((artifact) => artifact.id));
  const candidateIds = new Set();
  const covered = new Set();
  const videoCandidates = new Set();
  for (const candidate of manifest.candidates) {
    if (typeof candidate.id !== "string" || candidateIds.has(candidate.id)
      || !Array.isArray(candidate.sequenceIds) || candidate.sequenceIds.some((id) => !rows.has(id))) {
      throw new Error("research-progress-candidate-identity-invalid");
    }
    candidateIds.add(candidate.id);
    if (stale(candidate.status)) continue;
    for (const id of candidate.sequenceIds) { covered.add(id); rows.get(id).candidateCount++; }
    if (candidate.artifactIds?.some((id) => /\.(mp4|mov|webm)$/iu.test(id))) videoCandidates.add(candidate.id);
    if (candidate.mediaClass !== "STATIC_FRAME_SET" || candidate.currentLocalCandidate !== true
      || candidate.localReview?.status !== "PASS") continue;
    // A multi-shot package cannot attribute all its samples to each shot.
    if (candidate.sequenceIds.length !== 1 || !Array.isArray(candidate.staticSamples)
      || candidate.staticSamples.length > 6) throw new Error("research-progress-static-scope-invalid");
    const row = rows.get(candidate.sequenceIds[0]);
    row.passCandidateIds.push(candidate.id);
    for (const original of candidate.staticSamples) {
      const sample=researchStaticScopedSampleV1(candidate,original);
      if (!artifactIds.has(sample.imageArtifactId)
        || sample.referenceArtifactId !== null && !artifactIds.has(sample.referenceArtifactId)
        || sample.sourceFrame !== null && (!Number.isSafeInteger(sample.sourceFrame) || sample.sourceFrame < 0)) {
        throw new Error("research-progress-static-sample-invalid");
      }
      if (sample.coreOnlyReview !== undefined && sample.coreOnlyReview.status !== "PASS") continue;
      row.observedSampleCount++;
      if (sample.sourceFrame === null) row.unknownFrames++;
      // Atlas/core PASS covers only the core, never the complete reference frame.
      else if (sample.coreOnlyReview !== undefined) row.coreFrames.add(sample.sourceFrame);
      else row.passFrames.add(sample.sourceFrame);
    }
  }
  const partial = [...rows.values()].filter((row) => row.observedSampleCount > 0);
  const missingFor = (row) => STATES.flatMap((state) => {
    const anchor = row.sequence.referenceAnchors?.find((item) => item.state === state);
    const decisions = (row.sequence.statePackagingDecisions || []).filter(item => item.state === state);
    const decision = decisions.length === 1 ? decisions[0] : null;
    const noPackage = decision?.packagingForm === 'NO_PACKAGE' && decision.observation === 'CLEAN_PRESENTER'
      && decision.packagingElementsVisible === false && decision.sourceFrame === anchor?.sourceFrame
      && /^[a-f0-9]{64}$/.test(decision.referenceSha256 || '')
      && /^[a-f0-9]{64}$/.test(decision.sourceVideoSha256 || '')
      && decision.sourceVideoSha256 === manifest.input?.sourceVideoSha256
      && typeof decision.reason === 'string' && decision.reason.trim().length > 0
      && manifest.artifacts.some(artifact => artifact.sha256 === decision.referenceSha256
        && artifact.path?.endsWith(`/frame-${String(anchor?.sourceFrame).padStart(5, '0')}.jpg`));
    if (noPackage) return []; // Metadata exemption only; never add a visual PASS.
    return anchor && Number.isSafeInteger(anchor.sourceFrame) && !row.passFrames.has(anchor.sourceFrame)
      ? [{state, sourceFrame: anchor.sourceFrame}] : [];
  });
  const nearCompletion = partial.filter((row) => missingFor(row).length === 1
    && STATES.every((state) => row.sequence.referenceAnchors?.some((item) => item.state === state)))
    .map((row) => ({shotId: row.sequence.sequenceId, reuseCandidateIds: row.passCandidateIds,
      missingPlannedFrame: missingFor(row)[0], wholeShotApproved: false}));
  return {
    contract: "A1RegisteredResearchProgress/v1", status: "REGISTERED_METADATA_ONLY", taskId,
    manifestSha256: sha256, scope: "RESEARCH_ONLY", productionAdmission: false,
    counts: {shots: rows.size, registeredCandidates: manifest.candidates.length,
      nonStaleCandidateCoverage: covered.size, shotsWithLocalStaticPass: partial.length,
      uniqueLocalPassFrameIdentities: partial.reduce((n, row) => n + new Set([...row.passFrames, ...row.coreFrames]).size, 0),
      uniqueWholeFramePassIdentities:partial.reduce((n,row)=>n+row.passFrames.size,0),
      shotsWithWholeFrameLocalPass:partial.filter(row=>row.passFrames.size>0).length,
      coreOnlyFrameIdentities: partial.reduce((n, row) => n + row.coreFrames.size, 0),
      passSamplesWithUnknownFrame: partial.reduce((n, row) => n + row.unknownFrames, 0),
      shotsWithoutLocalStaticPass: rows.size - partial.length,
      registeredWholeShotApprovals: manifest.summary.visuallyAcceptedCount,
      registeredRenderCount: manifest.summary.registeredRenderCount,
      registeredVideoCandidates: videoCandidates.size},
    reuseBeforeMakingNewFrames: nearCompletion,
    blockers: manifest.blockers || [],
    evidenceBoundary: {mediaBytesVerifiedNow: false, unregisteredOutputsIncluded: false,
      sameRecipeContinuityVerifiedNow: false, threeFrameCoverageGrantsWholeShotApproval: false,
      dispatchAuthorized: false, stageTransitionPerformed: false},
  };
}

export function readRegisteredResearchProgressV1({root, taskId, reads}) {
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/u.test(taskId || "")) throw new Error("research-progress-task-id-invalid");
  const file = path.join(root, "work", taskId, "research-task-manifest-v1.json");
  const resolvedRoot = fs.realpathSync(root);
  if (fs.realpathSync(file) !== path.join(resolvedRoot, "work", taskId, "research-task-manifest-v1.json")) {
    throw new Error("research-progress-path-outside-task");
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > MAX_BYTES) throw new Error("research-progress-manifest-size-invalid");
    // Read at most the admitted size plus one byte, including when the file grows.
    const bytes = Buffer.alloc(before.size + 1);
    const length = fs.readSync(fd, bytes, 0, bytes.length, 0);
    const after = fs.fstatSync(fd);
    reads.push({file: path.relative(root, file), bytes: length});
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs) throw new Error("research-progress-manifest-changed-during-read");
    const snapshot = bytes.subarray(0, length);
    return {...projectResearchProgressV1(JSON.parse(snapshot.toString("utf8")), taskId),
      snapshot: {path: path.relative(root, file), bytes: length, modifiedAt: new Date(after.mtimeMs).toISOString(),
        fileSha256: createHash("sha256").update(snapshot).digest("hex")}};
  } finally { fs.closeSync(fd); }
}
