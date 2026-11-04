import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compileStoryboardPackagingDirectorPlan} from '../apps/studio-next/src/lib/a1-storyboard-packaging-director-plan-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {verifyResearchDirectorEvidenceV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {mediaSha256} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-director-evidence-'));
try {
  const image = Buffer.from('fixture pixels');
  fs.writeFileSync(path.join(root, 'frame.jpg'), image);
  const frameSha256 = mediaSha256(image), assetSha256 = 'b'.repeat(64), sourceVideoSha256 = 'a'.repeat(64);
  const observations = [{frame: 120, actorId: 'carrier', status: 'VISIBLE'}, {frame: 150, actorId: 'actor-b', status: 'PARTIAL'},
    {frame: 180, actorId: 'actor-b', status: 'VISIBLE'}, {frame: 240, actorId: 'actor-c', status: 'VISIBLE'},
    {frame: 270, actorId: 'carrier', status: 'VISIBLE'}].map(item => ({...item, path: 'frame.jpg', frameSha256}));
  const receipt = {sourceVideoSha256, productionAdmission: false, shots: [{shotId: 'unseen-input', observations,
    materials: [{actorId: 'actor-b', assetId: 'asset-b', sha256: assetSha256, layerIds: ['composite-b']}],
    narrationDraft: {status: 'ASR_DRAFT_NOT_LISTENED', spokenCues: [{index: 3, startMs: 2500, endMs: 3200, text: 'unreviewed draft'}]}}]};
  const receiptBytes = Buffer.from(JSON.stringify(receipt));
  fs.writeFileSync(path.join(root, 'review.json'), receiptBytes);
  const plan = {contract: 'A1ShotTaskPlan/v1', projectId: 'director-fixture', scope: 'RESEARCH_ONLY', productionAdmission: false,
    source: {videoSha256: sourceVideoSha256, fps: 60}, shots: [{id: 'unseen-input', sourceText: 'misleading fallback actor', visualJob: 'source state sequence',
      sourceVersionSha256: sourceVideoSha256, sourceInterval: {startFrame: 100, endFrameExclusive: 300},
      researchTimingReview: {sourceEventReviewReceipt: {path: 'review.json', sha256: mediaSha256(receiptBytes)}},
      packagingDecision: {sourceBindings: [{assetId: 'asset-b', sha256: assetSha256, identityStatus: 'VERIFIED', provenanceStatus: 'VERIFIED'}]},
      tasks: [{module: 'remotion-render', dependencies: [], parameters: {scene: {layers: [{id: 'composite-b', from: 0, durationInFrames: 200, motion: {frames: [0, 199]}}]}}}]}]};
  const evidence = verifyResearchDirectorEvidenceV1({taskRoot: root, plan});
  // Test graph integration without manufacturing a complete packaging decision.
  const graphPlan = structuredClone(plan);
  delete graphPlan.shots[0].packagingDecision;
  const workspace = compileShotTaskWorkspaceV1(graphPlan, {verifiedDirectorEvidence: evidence});
  const shot = workspace.production.shotIntelligence.currentStoryboardAuthority.shots[0];
  const timeline = shot.directorPlan.shots[0].orderedActorTimeline;
  assert.deepEqual(timeline.map(item => item.actorId), ['carrier', 'actor-b', 'actor-c', 'carrier']);
  assert.deepEqual(timeline[1].entryBracket, {afterFrame: 20, byFrame: 50});
  assert.deepEqual(timeline[1].exitBracket, {afterFrame: 80, byFrame: 140});
  assert.deepEqual(timeline[1].narrationCueIndices, [3]);
  assert.equal(timeline[1].narrationTimingStatus, 'ASR_DRAFT_NOT_LISTENED');
  assert.equal(timeline[2].materialStatus, 'UNMEASURED');
  assert.equal(shot.nodeWorkflow.modules['remotion-render'], 'unknown');
  assert.equal(shot.nodeWorkflow.moduleInputs['remotion-render'].routingBlocker, 'DIRECTOR_REFERENCE_PLAN_REQUIRES_REVIEW');
  assert.deepEqual(shot.nodeWorkflow.moduleInputs['remotion-render'].scene.layers, [{id: 'composite-b-observed-1', from: 50, durationInFrames: 31}]);
  assert.equal(plan.shots[0].tasks[0].parameters.scene.layers[0].from, 0, 'compiler must not mutate supplied input');
  const authority = {contract: 'A1CurrentStoryboardAuthority/v1', current: true, shots: [{...plan.shots[0], shotId: 'renamed', route: 'RESEARCH_TASK'}]};
  const renamed = compileStoryboardPackagingDirectorPlan(authority, {referenceEvidenceForShot: () => evidence[0]});
  assert.deepEqual(renamed.shots[0].orderedActorTimeline, timeline, 'planning must not depend on shot identifier');
  assert.throws(() => compileStoryboardPackagingDirectorPlan(authority, {referenceEvidenceForShot: () => ({...evidence[0], sourceVideoSha256: 'c'.repeat(64)})}), /reference-evidence-invalid/);
  assert.throws(() => compileStoryboardPackagingDirectorPlan(authority, {referenceEvidenceForShot: () => ({...evidence[0], observations: [...observations].reverse()})}), /observation-invalid/);
  const mismatched = structuredClone(plan);
  mismatched.shots[0].packagingDecision.sourceBindings[0].sha256 = 'c'.repeat(64);
  assert.throws(() => verifyResearchDirectorEvidenceV1({taskRoot: root, plan: mismatched}), /material-binding-mismatch/);
  fs.writeFileSync(path.join(root, 'frame.jpg'), 'changed pixels');
  assert.throws(() => verifyResearchDirectorEvidenceV1({taskRoot: root, plan}), /sha-mismatch/);
  console.log('PASS: observed state order, repeated actors, brackets, ASR draft alignment, derived layer spans, render lock, identity mismatch, source mismatch, stale pixels, renamed shot, immutable input. No provider/render calls.');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
