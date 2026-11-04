import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolveActiveWorkSelectionV1} from '../apps/studio-next/src/lib/a1-active-work-selection-v1.mjs';
import {assertProjectWriteFollowsActiveWorkV1, withProjectLock} from '../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs';

const workspaceSha256 = 'a'.repeat(64);
const taskId = 'sample-shot-research-v1';
const phaseId = 'sample-shot-research-phase-v1';
const parkRecord = {
  contract: 'A1SystemLineParkRecord/v1', version: 1,
  activeLine: {
    id: phaseId, pointer: '.codex-artifacts/system-progress/current-phase.json',
    planPath: `work/${taskId}/shot-task-plan-v1.json`,
    runtimeStatePath: `work/${taskId}/runtime/current.json`,
    scope: 'RESEARCH_ONLY', productionAdmission: false,
  },
  parkedLine: {
    id: 'editorial-asset-workbench-v1',
    pointer: '.codex-artifacts/system-progress-system-line/current-phase.json',
    status: 'PARKED_PENDING_USER_APPROVAL', workspaceSha256,
    gate: 'WHOLE_FILM_STATIC_BOARD',
  },
};
const researchPhase = {contract: 'A1SystemProgressPhase/v1', phaseId, status: 'active'};
const formalPhase = {
  contract: 'A1SystemLineCurrentPhase/v2', phaseId: 'editorial-asset-workbench-v1',
  authority: {workspaceSha256, nextAction: {reviewGate: 'WHOLE_FILM_STATIC_BOARD'}},
};
const selected = resolveActiveWorkSelectionV1({parkRecord, researchPhase, formalPhase, planExists: true, runtimeExists: true});
assert.equal(selected.status, 'PASS');
assert.equal(selected.active.phaseId, researchPhase.phaseId);
assert.equal(selected.parkedProduction.status, 'PARKED_PENDING_USER_APPROVAL');
assert.equal(selected.active.productionAdmission, false);
assert.equal(selected.active.workbenchUrl, `/system-line-visual-workbench?view=project&researchTask=${taskId}`);
const wrongPhase = resolveActiveWorkSelectionV1({parkRecord, researchPhase: {...researchPhase, phaseId: 'old-phase'}, formalPhase, planExists: true, runtimeExists: true});
assert.equal(wrongPhase.status, 'BLOCKED');
assert.equal(wrongPhase.active, null);
assert.equal(resolveActiveWorkSelectionV1({parkRecord, researchPhase: {...researchPhase, contract: 'HistoricalPhase/v1'}, formalPhase, planExists: true, runtimeExists: true}).status, 'BLOCKED');
const wrongWorkspace = resolveActiveWorkSelectionV1({parkRecord, researchPhase, formalPhase: {...formalPhase, authority: {...formalPhase.authority, workspaceSha256: '0'.repeat(64)}}, planExists: true, runtimeExists: true});
assert.ok(wrongWorkspace.failures.includes('PARKED_PRODUCTION_MISMATCH'));
const wrongParkedId = structuredClone(parkRecord);
wrongParkedId.parkedLine.id = 'historical-board';
assert.ok(resolveActiveWorkSelectionV1({parkRecord: wrongParkedId, researchPhase, formalPhase, planExists: true, runtimeExists: true}).failures.includes('PARKED_PRODUCTION_MISMATCH'));
const wrongGate = structuredClone(parkRecord);
wrongGate.parkedLine.gate = 'RELEASE';
assert.ok(resolveActiveWorkSelectionV1({parkRecord: wrongGate, researchPhase, formalPhase, planExists: true, runtimeExists: true}).failures.includes('PARKED_PRODUCTION_MISMATCH'));
assert.equal(resolveActiveWorkSelectionV1({parkRecord, researchPhase, formalPhase, planExists: false, runtimeExists: true}).status, 'BLOCKED');
const traversalPark = structuredClone(parkRecord);
traversalPark.activeLine.runtimeStatePath = `work/${taskId}/runtime/../../other/current.json`;
assert.ok(resolveActiveWorkSelectionV1({parkRecord: traversalPark, researchPhase, formalPhase, planExists: true, runtimeExists: true}).failures.includes('ACTIVE_WORK_PATH_INVALID'));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-active-work-selection-'));
const writeJson = (relative, value) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, JSON.stringify(value));
};
try {
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Test fixture\n');
  writeJson('work/system-maturity-consolidation-park-a-line-20260928.json', parkRecord);
  writeJson('.codex-artifacts/system-progress/current-phase.json', researchPhase);
  writeJson('.codex-artifacts/system-progress-system-line/current-phase.json', formalPhase);
  writeJson(parkRecord.activeLine.planPath, {contract: 'TestPlan/v1'});
  writeJson(parkRecord.activeLine.runtimeStatePath, {contract: 'TestRuntime/v1'});
  const formalRoot = path.join(root, 'apps/studio-next');
  fs.mkdirSync(formalRoot, {recursive: true});
  assert.throws(() => assertProjectWriteFollowsActiveWorkV1(formalRoot), /formal-production-parked/u);
  assert.equal(assertProjectWriteFollowsActiveWorkV1(formalRoot, {allowParkedBoardApproval: true}).status, 'PARKED_BOARD_APPROVAL_ONLY');
  assert.throws(() => withProjectLock(formalRoot, () => { throw Error('write-must-not-start'); }), /formal-production-parked/u);
  assert.equal(assertProjectWriteFollowsActiveWorkV1(path.join(root, `work/${taskId}/runtime/apps/studio-next`)).status, 'NON_FORMAL_SCOPE');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
console.log(JSON.stringify({status: 'PASS', contract: selected.contract, active: selected.active.taskId, parked: selected.parkedProduction.status, staleAndMissingFailClosed: true}));
