#!/usr/bin/env node
// Read-only projection. --out writes a NEW diagnostic snapshot, never authority.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {wholeFrameQualificationIdentityV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
import {assertStateClaimsAllowFrameV1} from '../apps/studio-next/src/lib/a1-state-source-claim-v1.mjs';
import {readWholeFrameReviewHistoryV1, reviewRetryStateV1} from '../apps/studio-next/src/lib/a1-production-execution-brief-v1.mjs';

const args = process.argv.slice(2), value = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const taskId = value('--task'), ordersPath = value('--orders');
if (!taskId || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(taskId) || !ordersPath)
  throw Error('Usage: --task TASK --orders ORIGINAL_ORDERS_JSON [--out NEW_REPORT_JSON]');
const root = fs.realpathSync('.'), started = Date.now(), inputs = [];
const read = file => {
  const bytes = fs.readFileSync(path.resolve(root, file));
  inputs.push({path: file, sha256: createHash('sha256').update(bytes).digest('hex')});
  return JSON.parse(bytes);
};
const runtime = readShotTaskRuntimeV1({repoRoot: root, taskId});
if (runtime.pending) throw Error('CLOSEOUT_PLAN_NOT_SYNCED');
const planSha256 = nodeInputHash(runtime.plan);
const registry = read(`work/${taskId}/candidate-registry-v1.json`);
const orders = read(ordersPath).orders;
if (!Array.isArray(orders) || orders.length > 1000 || new Set(orders.map(o => o.target)).size !== orders.length)
  throw Error('CLOSEOUT_ORDERS_INVALID');
const history = readWholeFrameReviewHistoryV1(root, taskId), closed = [], remaining = [];
let verifiedImageBytes = 0;
for (const order of orders) {
  const [shotId, state] = order.target.split(':'), shot = runtime.plan.shots.find(s => s.id === shotId);
  const reference = shot?.referenceProductionDesign?.references?.find(r => r.state === state);
  if (!shot || !reference) throw Error('CLOSEOUT_TARGET_MISSING:' + order.target);
  const goal = productionFrameGoalShaV1(runtime.plan, shot, state);
  const node = runtime.workflow.nodes.find(n => n.id === `${shotId}:layer-compositor`);
  const image = node?.result?.staticStates?.samples?.find(s => s.state === state)?.artifacts?.find(a => a.kind === 'IMAGE');
  const entry = registry.entries.findLast(e => e.sequenceIds?.length === 1 && e.sequenceIds[0] === shotId
    && e.wholeAnchorPASS === true && e.localReview?.status === 'PASS' && e.goalInputSha256 === goal
    && e.staticSamples?.some(s => s.sourceFrame === reference.sourceFrame && s.reference.sha256 === reference.sha256 && s.image.sha256 === image?.sha256));
  const retry = reviewRetryStateV1(history, order.target);
  if (entry && image) {
    const sample = entry.staticSamples.find(s => s.sourceFrame === reference.sourceFrame && s.image.sha256 === image.sha256);
    const file = fs.realpathSync(path.resolve(root, sample.image.path));
    if (!file.startsWith(root + path.sep)) throw Error('CLOSEOUT_IMAGE_PATH');
    const bytes = fs.readFileSync(file); verifiedImageBytes += bytes.length;
    if (createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw Error('CLOSEOUT_IMAGE_CHANGED:' + order.target);
    closed.push({target: order.target, candidateId: entry.id, image: sample.image, goalInputSha256: goal});
  } else {
    let inputBlocker = null;
    try {
      const sourceClaimReview = assertStateClaimsAllowFrameV1({repoRoot: root, plan: runtime.plan, shot, state, route: 'REUSE'});
      wholeFrameQualificationIdentityV1({plan: runtime.plan, shot, state, node,
        sample: node?.result?.staticStates?.samples?.find(s => s.state === state),
        candidate: registry.entries.find(e => e.id === order.candidateId), acceptedCurrentExecution: true, sourceClaimReview});
    } catch (error) { inputBlocker = error.message; }
    remaining.push({target: order.target, originalKind: order.kind, goalInputSha256: goal,
      latestReview: retry.latest?.evidence || null, latestStatus: retry.latest?.status || 'UNREVIEWED',
      findings: retry.latest?.findings || [], distinctFailedImagesSinceLastPass: retry.distinctFailedImages,
      nextAction: inputBlocker ? 'RESOLVE_INPUT_BLOCKER_BEFORE_LAYOUT' : retry.distinctFailedImages >= 2 ? 'REDESIGN_BEFORE_EXECUTION' : 'DIAGNOSE_AND_PREPARE_BRIEF',
      inputBlocker, sourceReadiness: inputBlocker?.includes('"sourceDebtUnresolved":true') ? 'SOURCE_DEBT'
        : inputBlocker ? 'CHECK_INPUT_IDENTITY' : 'DECLARED_SCOPE_PREFLIGHT_ONLY', executionAuthorized: false});
  }
}
// A moving writer invalidates the snapshot instead of silently reporting a mixed count.
if (nodeInputHash(JSON.parse(fs.readFileSync(path.join(runtime.taskRoot, 'shot-task-plan-v1.json')))) !== planSha256
  || inputs.some(ref => createHash('sha256').update(fs.readFileSync(path.resolve(root, ref.path))).digest('hex') !== ref.sha256))
  throw Error('CLOSEOUT_INPUTS_CHANGED');
const report = {contract: 'A1CloseoutDiagnostic/v1', observedAt: new Date().toISOString(), taskId, planSha256, inputs,
  originalGapCount: orders.length, closedCount: closed.length, remainingCount: remaining.length, closed, remaining,
  proofBoundary: {scope: 'ORIGINAL_GAPS_ONLY', currentImageBytesVerified: true, decodedNow: false,
    independentPixelReviewPerformedNow: false, wholeFilmApprovalGranted: false, systemMaturityProven: false, dispatchAuthorized: false},
  elapsedMs: Date.now() - started, verifiedImageBytes, recursiveMediaScan: false};
const output = value('--out');
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
const briefOutput = value('--brief-out');
if (briefOutput) {
  const targets = (value('--targets') || '').split(',').filter(Boolean);
  if (!targets.length || targets.length > 4 || new Set(targets).size !== targets.length
    || targets.some(t => !remaining.some(r => r.target === t))) throw Error('CLOSEOUT_BRIEF_OPEN_TARGETS_REQUIRED');
  const brief = {contract: 'A1StaticExecutionBrief/v1', taskId, planSha256, targets: targets.map(target => {
    const row = remaining.find(r => r.target === target), [shotId, state] = target.split(':');
    const reference = runtime.plan.shots.find(s => s.id === shotId).referenceProductionDesign.references.find(r => r.state === state);
    return {target, reference: {path: reference.path, sha256: reference.sha256}, latestReview: row.latestReview,
      cause: null, sourceReady: false, diagnosis: row.findings.join('\n'), firstRead: '', subjectScale: '', textRoles: '',
      occlusion: '', backgroundFit: '', reuseDecision: '', expectedVisibleChange: '', preview: null, previewInspection: '',
      changeKind: row.distinctFailedImagesSinceLastPass >= 2 ? 'STRUCTURAL' : null, newPrimitive: ''};
  })};
  fs.writeFileSync(path.resolve(briefOutput), JSON.stringify(brief, null, 2) + '\n', {flag: 'wx'});
}
console.log(JSON.stringify({originalGapCount: report.originalGapCount, closed: closed.length, remaining: remaining.length,
  remainingTargets: remaining, elapsedMs: report.elapsedMs, report: output, unapprovedBriefTemplate: briefOutput}, null, 2));
