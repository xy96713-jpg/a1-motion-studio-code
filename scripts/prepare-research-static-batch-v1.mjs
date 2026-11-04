#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {readResearchProductionPlanV1} from '../apps/studio-next/src/lib/a1-research-production-work-order-v1.mjs';
import {readSystemLineResearchStaticProjectionV1} from '../apps/studio-next/src/lib/a1-system-line-research-task-manifest-v1.mjs';
import {createSameSceneStaticSamplingAdapterV1} from '../apps/studio-next/src/lib/a1-same-scene-static-sampling-v1.mjs';

const root = path.resolve(import.meta.dirname, '..');
const value = flag => {const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : null;};
const taskId = value('--task'), ids = (value('--shots') || '').split(',').filter(Boolean);
const out = path.resolve(root, value('--out') || '');
if (!taskId || !ids.length || ids.length > 5 || new Set(ids).size !== ids.length
  || !out.startsWith(path.join(root, 'work') + path.sep) || fs.existsSync(out)) throw new Error('static-batch-isolated-new-output-required');
const plan = readResearchProductionPlanV1(root, taskId), before = nodeInputHash(plan);
const projection = await readSystemLineResearchStaticProjectionV1({repoRoot: root, taskId});
const adapter = createSameSceneStaticSamplingAdapterV1();
const expected = [];
for (const id of ids) {
  const shot = plan.shots.find(shot => shot.id === id), sequence = projection.sequences.find(sequence => sequence.sequenceId === id);
  const renderer = shot?.tasks.find(task => task.module === 'remotion-render');
  if (!renderer || !['still', 'video', 'alpha'].includes(renderer.parameters.output) || !Number.isSafeInteger(shot.sourceInterval?.startFrame)
    || !renderer.parameters.scene) throw new Error(`static-batch-existing-still-route-required:${id}`);
  const originalOutput = renderer.parameters.output;
  renderer.parameters.output = 'still';
  renderer.parameters.staticFrames = ['ENTRY', 'HOLD', 'HANDOFF'].map(state => {
    const anchor = sequence.referenceAnchors.find(anchor => anchor.state === state);
    const sample = projection.candidates.filter(candidate => !candidate.status.startsWith('STALE') && candidate.sequenceIds.includes(id)).flatMap(candidate => candidate.staticSamples || [])
      .find(sample => sample.sourceFrame === anchor?.sourceFrame && sample.referenceArtifactId);
    const reference = projection.artifacts.find(artifact => artifact.id === sample?.referenceArtifactId && artifact.status === 'VERIFIED');
    const frame = anchor?.sourceFrame - shot.sourceInterval.startFrame;
    if (!reference || !Number.isSafeInteger(frame) || frame < 0 || frame >= renderer.parameters.scene.durationInFrames) {
      throw new Error(`static-batch-reference-state-not-bound:${id}:${state}`);
    }
    return {state, frame, sourceFrame: anchor.sourceFrame, referenceFrameSha256: reference.sha256};
  });
  renderer.parameters.staticSamplingImplementationSha256 = adapter.samplingImplementationSha256;
  expected.push({shotId: id, originalOutput, states: renderer.parameters.staticFrames, maximumNewPNG: 3});
}
const body = {contract: 'A1PreparedResearchStaticBatch/v1', taskId, originalPlanSha256: before,
  proposedPlanSha256: nodeInputHash(plan), manifestSha256: projection.manifestSha256,
  adapterModule: 'remotion-render', adapterImplementationSha256: adapter.implementationSha256,
  samplingImplementationSha256: adapter.samplingImplementationSha256, expected,
  maximumNewPNG: expected.length * 3, concurrencyCap: 2, occupiedRunningSlots: 0,
  existingAcceptedOutputsPreserved: true, executionAuthorized: false, productionAdmission: false,
  requirements: ['EXACT_SUCCESSOR_SOURCE_REVIEW', 'FROZEN_PREDECESSOR_CLOSED', 'EXISTING_RUNTIME_PLAN_TRANSITION',
    'SIGNED_RESOURCE_PHASE_AND_UNIQUE_PARENT_DISPATCH', 'INDEPENDENT_PIXEL_REVIEW', 'CONTINUOUS_REVIEW_AFTER_STATIC_GATE']};
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'proposed-shot-task-plan.json'), JSON.stringify(plan, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'prepared-batch.json'), JSON.stringify({...body, sha256: nodeInputHash(body)}, null, 2) + '\n');
console.log(JSON.stringify({status: 'PREPARED_ONLY', out, taskId, shots: ids, maximumNewPNG: body.maximumNewPNG,
  executionAuthorized: false, resourceWrites: 0, runtimeWrites: 0, realBrowsers: 0}));
