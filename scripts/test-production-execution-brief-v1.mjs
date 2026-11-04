import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1, closeProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {runProductionBatchV1} from '../apps/studio-next/src/lib/a1-production-batch-runner-v1.mjs';
import {assertProductionExecutionBriefV1, reviewRetryStateV1} from '../apps/studio-next/src/lib/a1-production-execution-brief-v1.mjs';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'execution-brief-'))), taskId = 'brief-fixture';
const dir = path.join(root, 'work', taskId); fs.mkdirSync(dir, {recursive: true});
const save = (name, data) => {
  const bytes = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  const file = path.join(dir, name); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes);
  return {path: path.relative(root, file), sha256: createHash('sha256').update(bytes).digest('hex')};
};
try {
  const reference = save('reference.svg', '<svg/>'), preview = save('preview.svg', '<svg><rect/></svg>');
  const plan = {contract: 'A1ShotTaskPlan/v1', projectId: taskId, scope: 'RESEARCH_ONLY', productionAdmission: false,
    shots: [{id: 'A', sourceText: 'Isolated fixture', visualJob: 'No provider', exactCopy: [],
      referenceProductionDesign: {references: [{state: 'ENTRY', ...reference}]},
      tasks: [{module: 'media-files', dependencies: [], parameters: {}, blocker: 'FIXTURE_INPUT_REQUIRED'}]}]};
  save('shot-task-plan-v1.json', plan); syncShotTaskRuntimeV1({repoRoot: root, taskId, expectedPlanSha256: nodeInputHash(plan)});
  const options = {repoRoot: root, taskId, plan, shotIds: ['A']};
  assert.equal(assertProductionExecutionBriefV1(options), null, 'unrelated tasks retain incumbent behavior');
  save('execution-discipline-policy-v1.json', {contract: 'A1ExecutionDisciplinePolicy/v1', taskId, requireStaticBrief: true});
  assert.throws(() => assertProductionExecutionBriefV1(options), /EVIDENCE_REQUIRED/);
  const target = {target: 'A:ENTRY', reference, preview, cause: 'DESIGN', sourceReady: true,
    firstRead: 'Main title', subjectScale: 'Half frame', textRoles: 'Title and attribution separate',
    occlusion: 'Subject above title', backgroundFit: 'Matched perspective', diagnosis: 'Wrong hierarchy',
    expectedVisibleChange: 'Title leads', reuseDecision: 'Keep verified portrait', previewInspection: 'Read all text at output scale'};
  const brief = {contract: 'A1StaticExecutionBrief/v1', taskId, planSha256: nodeInputHash(plan), targets: [target]};
  const check = () => assertProductionExecutionBriefV1({...options, metadata: {executionBrief: save('brief.json', brief)}});
  assert.equal(check().productionAdmission, false);
  brief.planSha256 = '0'.repeat(64); assert.throws(check, /PLAN_CHANGED/); brief.planSha256 = nodeInputHash(plan);
  target.sourceReady = false; assert.throws(check, /DESIGN_INCOMPLETE/); target.sourceReady = true;
  target.previewInspection = ''; assert.throws(check, /PREVIEW_INSPECTION/); target.previewInspection = 'Checked';
  const reviews = [];
  for (let i = 0; i < 2; i++) {
    const item = {contract: 'A1CurrentStateWholeFrameQualification/v1', shotId: 'A', state: 'ENTRY',
      status: 'VISUAL_FAIL', imageSha256: String(i).repeat(64), findings: ['Flat layout']};
    const evidence = save(`production-batches/review-${i}/visual-review.json`, {taskId, items: [item]});
    const time = new Date(1700000000000 + i * 1000); fs.utimesSync(path.join(root, evidence.path), time, time);
    reviews.push({...item, target: 'A:ENTRY', evidence});
  }
  assert.throws(check, /REVIEW_CHANGED/);
  target.latestReview = reviews[1].evidence;
  assert.throws(check, /STRUCTURAL_REDESIGN/);
  target.changeKind = 'STRUCTURAL'; target.newPrimitive = 'Perspective table';
  assert.equal(check().targets[0], 'A:ENTRY');
  assert.equal(reviewRetryStateV1([...reviews, {...reviews[1], status: 'PASS'}], 'A:ENTRY').distinctFailedImages, 0);
  assert.equal(reviewRetryStateV1([reviews[0], reviews[0]], 'A:ENTRY').distinctFailedImages, 1);
  const phaseOptions = {repoRoot: root, taskId, purpose: 'STATIC_PRODUCTION_BATCH', ownerThreadId: 'fixture',
    approvalEvidence: 'Fixture only', shotIds: ['A'], reservedSlots: 1, maximumClaims: 1, maximumExecutionMs: 1000};
  assert.throws(() => activateProductionPhaseV1({...phaseOptions, phaseId: 'missing-brief'}), /EVIDENCE_REQUIRED/);
  assert.throws(() => activateProductionPhaseV1({...phaseOptions, phaseId: 'too-long', maximumExecutionMs: 360000}), /BUDGET_INVALID/);
  const reservationDir = path.join(root, 'work/module-development-launch-v1/resource-reservations');
  assert.equal(fs.existsSync(path.join(reservationDir, 'phase-activation-missing-brief.json')), false);
  assert.equal(fs.existsSync(path.join(reservationDir, 'phase-activation-too-long.json')), false);
  const phase = activateProductionPhaseV1({...phaseOptions, phaseId: 'valid', metadata: {executionBrief: save('brief.json', brief)}});
  assert.equal(phase.executionDiscipline.visualApproval, false);
  fs.appendFileSync(path.join(root, preview.path), 'changed');
  assert.throws(() => assertProductionExecutionBriefV1({...options, metadata: phase}), /EVIDENCE_CHANGED/);
  await assert.rejects(runProductionBatchV1({repoRoot: root, taskId, phaseId: 'valid'}), /EVIDENCE_CHANGED/);
  closeProductionPhaseV1({repoRoot: root, phaseId: 'valid', outcome: 'FIXTURE_ONLY'});
  console.log('PASS brief admission: legacy compatibility, source/design preflight, plan/review drift, repeated failure breaker, budget rejection before reservation, evidence change after reservation. No provider calls.');
} finally {fs.rmSync(root, {recursive: true, force: true});}
