import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

// Real orchestration and fixture-only runtime; no model, image or render calls.
const repo = fs.realpathSync(process.cwd());
const pipelinePath = path.join(repo, 'apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs');
const lib = name => pathToFileURL(path.join(repo, 'apps/studio-next/src/lib', name)).href;
const {nodeInputHash} = await import(lib('a1-node-workflow-v1.mjs'));
const {syncShotTaskRuntimeV1, readShotTaskRuntimeV1} = await import(lib('a1-shot-task-runtime-v1.mjs'));
const {activateProductionPhaseV1} = await import(lib('a1-production-phase-v1.mjs'));
const {workScopeSourceIdentityV1} = await import(lib('a1-production-work-scope-v1.mjs'));
const {productionFrameGoalShaV1} = await import(lib('a1-production-frame-identity-v1.mjs'));
const {runProductionFramePipelineV1} = await import(pathToFileURL(pipelinePath).href);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];

for (const scenario of ['missing-request', 'missing-node', 'blocked-master']) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a1-dependency-fixture-')));
  try {
    const taskId = 'unseen-dependency-fixture';
    const dir = path.join(root, 'work', taskId);
    fs.mkdirSync(dir, {recursive: true});
    const shot = {id: 'A', sourceText: 'Reviewed fixture source', visualJob: 'Keep one consistent master', exactCopy: ['Fixture title'],
      tasks: [{module: 'media-files', parameters: {}, dependencies: [], blocker: 'FIXTURE_MASTER_UNAVAILABLE'}]};
    const plan = {contract: 'A1ShotTaskPlan/v1', projectId: taskId, scope: 'RESEARCH_ONLY', productionAdmission: false,
      source: {videoSha256: 'a'.repeat(64)}, shots: [shot]};
    plan.activeWorkScope = {contract: 'A1ProductionWorkScope/v1', shotIds: ['A'], objective: 'Verify blocked dependency without retrying production',
      sourceIdentity: workScopeSourceIdentityV1(plan), productionAdmission: false};
    if (scenario !== 'missing-request') shot.fullFrameRequests = [{shotId: 'A', state: 'HOLD',
      nodeId: scenario === 'blocked-master' ? 'A:media-files' : 'absent-producer',
      requestSha256: 'b'.repeat(64), goalInputSha256: productionFrameGoalShaV1(plan, shot, 'HOLD')}];
    fs.writeFileSync(path.join(dir, 'shot-task-plan-v1.json'), JSON.stringify(plan));
    syncShotTaskRuntimeV1({repoRoot: root, taskId, expectedPlanSha256: nodeInputHash(plan)});
    const runtime = readShotTaskRuntimeV1({repoRoot: root, taskId});
    if (scenario === 'blocked-master') assert.equal(runtime.workflow.nodes.find(n => n.id === 'A:media-files')?.state, 'blocked');
    const proposal = {units: [{shotId: 'A', state: 'HANDOFF', materialSelections: [], continuity: {masterTargetKey: 'A:HOLD'}}], waiting: [], recipes: []};
    const proposalPath = path.join(dir, 'proposal.json');
    fs.writeFileSync(proposalPath, JSON.stringify(proposal));
    activateProductionPhaseV1({repoRoot: root, taskId, phaseId: 'dependency-fixture', purpose: 'STATIC_FRAME_PIPELINE',
      ownerThreadId: 'fixture', approvalEvidence: 'Pure fixture, no providers', shotIds: ['A'], maximumExecutionMs: 60000,
      metadata: {targets: ['A:HANDOFF'], imageBudget: 0, modelBudget: 1,
        proposal: {path: path.relative(root, proposalPath), sha256: hash(fs.readFileSync(proposalPath))}}});
    const args = {repoRoot: root, taskId, phaseId: 'dependency-fixture', executable: '/usr/bin/false'};
    const first = await runProductionFramePipelineV1(args);
    const phaseDir = path.join(root, 'work/module-development-launch-v1/resource-reservations');
    const phaseFile = path.join(phaseDir, 'phase-activation-dependency-fixture.json');
    const beforeRepeat = fs.readFileSync(phaseFile);
    // A fresh process must recover from disk without conversational context.
    const resumed = spawnSync(process.execPath, ['--input-type=module', '-e',
      `const {runProductionFramePipelineV1} = await import(${JSON.stringify(pathToFileURL(pipelinePath).href)});` +
      `console.log(JSON.stringify(await runProductionFramePipelineV1(${JSON.stringify(args)})));`],
      {encoding: 'utf8', timeout: 20000});
    assert.equal(resumed.status, 0, resumed.stderr);
    const second = JSON.parse(resumed.stdout);
    results.push({scenario, first: first.status, second: second.status, blockers: second.blockers});
    assert.equal(first.status, 'FRAME_INPUTS_REQUIRED', JSON.stringify(results.at(-1)));
    assert.equal(second.status, first.status);
    assert.deepEqual(second.blockers, first.blockers);
    assert.equal(second.automaticResubmission, false);
    assert.equal(second.newImageClaims, 0);
    assert.equal(second.blockers[0].targetKey, 'A:HANDOFF');
    assert.equal(second.blockers[0].masterTargetKey, 'A:HOLD');
    assert.deepEqual(fs.readFileSync(phaseFile), beforeRepeat, 'unchanged blocked retry cannot mutate phase state');
    assert.equal(fs.readdirSync(phaseDir).length, 1, 'no child execution reservations');
    assert.equal(fs.existsSync(path.join(dir, 'production-batches')), false, 'no compositor or review was started');
    assert.equal(second.productionAdmission, false);
    if (scenario === 'missing-request') {
      shot.fullFrameRequests = [{shotId: 'A', state: 'HOLD', nodeId: 'A:media-files', requestSha256: 'b'.repeat(64),
        goalInputSha256: productionFrameGoalShaV1(plan, shot, 'HOLD')}];
      fs.writeFileSync(path.join(dir, 'shot-task-plan-v1.json'), JSON.stringify(plan));
      syncShotTaskRuntimeV1({repoRoot: root, taskId, expectedPlanSha256: nodeInputHash(plan)});
      const changed = await runProductionFramePipelineV1(args);
      assert.equal(changed.blockers[0].code, 'FRAME_MASTER_NOT_READY', 'new persisted evidence must replace the old missing-request diagnosis');
      assert.equal(fs.readdirSync(phaseDir).length, 1);
    }
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
}
console.log(JSON.stringify({status: 'PASS', results, realProviders: 0, renders: 0}, null, 2));
