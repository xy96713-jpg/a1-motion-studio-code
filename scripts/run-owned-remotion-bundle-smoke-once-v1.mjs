import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runBoundedProcessGroup} from '../apps/studio-next/src/lib/a1-bounded-process-group-v1.mjs';
import {assertFreshRemotionOutputPathV1} from '../apps/studio-next/src/lib/a1-p45-remotion-build-consumer-v1.mjs';
import {runRemotionPublicBundleSmokeV1} from './run-remotion-public-bundle-smoke-v1.mjs';
import {parseCaptureProcessRowsV1, observeCaptureOwnedProcessesV1, remainingCaptureOwnedProcessesV1,
  unknownCaptureOwnedGroupMembersV1} from '../work/module-development-launch-v1/integration/system-consumer-batch-20261002-v1/run-normal-capture-once-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packetPath = path.join(repoRoot, 'work/module-development-launch-v1/integration/system-consumer-batch-20261002-v1/p45-bundle-smoke-preparation-v1/EXECUTION-READY.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file));
const must = (value, reason) => { if (!value) throw new Error(reason); };
const json = (value) => JSON.stringify(value, null, 2) + '\n';

export function validateBundleSmokePhaseV1(phase, packet, now) {
  const r = packet.resourceExecutionBinding;
  must(phase.status === 'ACTIVE' && phase.executionAuthorized === true, 'SMOKE_SIGNED_ACTIVE_PHASE_REQUIRED');
  must(phase.ownerThreadId === r.actualOwnerThreadId && phase.controllerThreadId === r.coordinatorThreadId
    && phase.uniqueActualDispatchThreadId === r.parentDispatchThreadId && phase.globalCap === 2 && phase.reservedSlots === 1, 'SMOKE_OWNER_CAP');
  must(phase.wrapperPath === r.wrapperPath && phase.wrapperSHA === r.wrapperSHA && phase.outputRoot === r.outputRoot, 'SMOKE_WRAPPER_OUTPUT_BINDING');
  must(phase.maximumExecutionMs === 60000 && phase.budget?.phaseMaximumMs === 60000
    && phase.budget.workMaximumMs === 50000 && phase.budget.closureReserveMs === 10000
    && phase.budget.remainingBeforePhaseMs >= 60000, 'SMOKE_SIGNED_BUDGET');
  must(phase.maximumStaticBundles === 2 && phase.maximumOutputBytes === 20 * 1024 ** 2
    && phase.maximumBrowserLaunches === 0 && phase.maximumStillFrames === 0 && phase.newEncodes === 0
    && phase.sourceVideoDecode === 0 && phase.maximumConditionalClaimCount === 1, 'SMOKE_RESOURCE_LIMITS');
  for (const flag of ['providers', 'externalNetwork', 'newCapture', 'newSourceFetch', 'audioOperations', 'automaticRetry', 'productionAdmission']) must(phase[flag] === false, 'SMOKE_DISALLOWED:' + flag);
  const start = Date.parse(phase.reservationStartUTC), end = Date.parse(phase.reservationEndUTC);
  must(start <= now && end - start >= 60000 && end - now > 13000, 'SMOKE_SIGNED_WINDOW');
  return true;
}

export function validateSmokeWorkerCompletionV1(worker) {
  must(worker?.status === 'PASS_REAL_BUNDLE_PUBLIC_BYTES_ONLY' && worker.realBundles === 2
    && worker.realBrowser === 0 && worker.realEncoder === 0 && worker.renderFrames === 0 && worker.largeMediaCopy === 0
    && worker.automaticRetry === false && worker.productionAdmission === false, 'SMOKE_TWO_REAL_BUNDLES_NOT_PROVED');
  must(Array.isArray(worker.cases) && worker.cases.length === 2
    && worker.cases[0].id === 'empty-public' && worker.cases[1].id === 'exact-tiny-public', 'SMOKE_TWO_CASES_REQUIRED');
  let measuredTotal = 0;
  for (const [index, result] of worker.cases.entries()) {
    must(Number.isSafeInteger(result.measured?.bytes) && result.measured.bytes > 0
      && Number.isSafeInteger(result.totalNewBytes) && result.totalNewBytes >= result.measured.bytes
      && result.totalNewBytes <= 9.5 * 1024 ** 2 && Array.isArray(result.measured.files) && result.measured.files.length > 0
      && result.compact === true && result.sourceMaps === false && result.productionAdmission === false, 'SMOKE_CASE_MEASUREMENT_REQUIRED');
    must(Array.isArray(result.publicFiles) && result.publicFiles.length === index
      && result.publicBytes === (index ? 68 : 0), 'SMOKE_PUBLIC_CASE_REQUIRED');
    measuredTotal += result.totalNewBytes;
  }
  must(Number.isSafeInteger(worker.totalNewBytes) && worker.totalNewBytes >= measuredTotal
    && worker.totalNewBytes <= 20 * 1024 ** 2 && worker.maximumOutputBytes === 20 * 1024 ** 2, 'SMOKE_TOTAL_OUTPUT_LIMIT');
  return true;
}

export function readSmokeWorkerResultV1(readBytes) {
  try { return {worker: JSON.parse(readBytes()), failure: null}; }
  catch (error) { return {worker: null, failure: {stage: 'WORKER_RESULT', message: error.message}}; }
}

export function smokeOwnedClosureV1({rootPid, known, rows, snapshots, ownershipError}) {
  const remaining = remainingCaptureOwnedProcessesV1(known, rows), unknown = unknownCaptureOwnedGroupMembersV1(known, rows);
  return {remaining, unknown, ownedProcessesClosed: Boolean(rows.length && rootPid > 1 && snapshots > 0 && !ownershipError
    && known.some((p) => p.pid === rootPid) && !remaining.length && !unknown.length && !rows.some((p) => p.pgid === rootPid))};
}

function preflight() {
  const packet = read(packetPath), r = packet.resourceExecutionBinding;
  must(packet.executionReady === true && packet.executionAuthorized === false && r.wrapperPath === fileURLToPath(import.meta.url), 'SMOKE_FIXED_PREPARATION');
  must(r.nodePath === process.execPath && JSON.stringify(r.exactCommand) === JSON.stringify([r.nodePath, r.wrapperPath, 'execute', r.phasePath]), 'SMOKE_EXACT_COMMAND');
  for (const pin of packet.frozenFiles) {
    must(pin.path.startsWith(repoRoot + path.sep) || pin.path === process.execPath, 'SMOKE_PIN_SCOPE');
    const bytes = fs.readFileSync(pin.path); must(bytes.length === pin.bytes && hash(bytes) === pin.sha256, 'SMOKE_SOURCE_CHANGED:' + pin.path);
  }
  assertFreshRemotionOutputPathV1(r.outputRoot);
  return packet;
}

function signed(phasePath, expectedSHA = null) {
  const packet = preflight(), r = packet.resourceExecutionBinding;
  must(phasePath === r.phasePath && phasePath.startsWith(repoRoot + '/work/module-development-launch-v1/resource-reservations/'), 'SMOKE_FIXED_PHASE_PATH');
  const bytes = fs.readFileSync(phasePath), phaseSHA = hash(bytes), phase = JSON.parse(bytes);
  if (expectedSHA) must(expectedSHA === phaseSHA, 'SMOKE_PHASE_CHANGED');
  must(phase.readyPath === packetPath && phase.readySHA === hash(fs.readFileSync(packetPath)), 'SMOKE_READY_PIN');
  validateBundleSmokePhaseV1(phase, packet, Date.now());
  for (const pin of packet.frozenFiles) must(phase.frozenSourceAndArtifactHashes?.[pin.path] === pin.sha256, 'SMOKE_PHASE_PIN:' + pin.path);
  return {packet, phase, phaseSHA, r};
}

async function execute(phasePath) {
  const started = Date.now() - Math.ceil(process.uptime() * 1000), {phase, phaseSHA, r} = signed(phasePath);
  const hard = Math.min(started + 60000, Date.parse(phase.reservationEndUTC)), workEnd = hard - 10000, cleanupEnd = hard - 2000;
  must(workEnd - Date.now() > 3000, 'SMOKE_INSUFFICIENT_WORK_WINDOW');
  assertFreshRemotionOutputPathV1(r.outputRoot); fs.mkdirSync(r.outputRoot);
  const write = (name, value) => fs.writeFileSync(path.join(r.outputRoot, name), json(value));
  write('owner-launch-claim.json', {phaseSHA, wrapperPid: process.pid, ownerThreadId: r.actualOwnerThreadId, startedAtUTC: new Date(started).toISOString(), hardDeadlineMs: hard});
  let rootPid = null, known = [], snapshots = 0, ownershipError = null, result = null, failure = null, closure = null;
  const rows = () => {
    must(Date.now() < cleanupEnd, 'SMOKE_CLEANUP_DEADLINE');
    const list = parseCaptureProcessRowsV1(execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,lstart=,comm='], {
      encoding: 'utf8', timeout: Math.max(1, Math.min(1000, cleanupEnd - Date.now())), env: {...process.env, LC_ALL: 'C'}}));
    must(list.length, 'SMOKE_EMPTY_PROCESS_SNAPSHOT'); return list;
  };
  const observe = () => {
    const startFile = path.join(r.outputRoot, 'worker-start.json'); if (!fs.existsSync(startFile)) return;
    try {
      const start = read(startFile); must(start.parentPid === process.pid && start.phaseSHA === phaseSHA && Number.isSafeInteger(start.pid) && start.pid > 1, 'SMOKE_NUMERIC_PARENT_IDENTITY');
      rootPid ||= start.pid; must(rootPid === start.pid, 'SMOKE_PID_CHANGED'); const live = rows();
      if (!known.length) { const seed = live.find((p) => p.pid === rootPid); must(seed?.parentPid === process.pid && seed.pgid === rootPid, 'SMOKE_DETACHED_GROUP_SEED'); }
      known = observeCaptureOwnedProcessesV1(rootPid, known, live); snapshots++;
      write('owned-process-identities.json', {rootPid, known, snapshots});
      const ack = path.join(r.outputRoot, 'ownership-ack.json'); if (!fs.existsSync(ack)) fs.writeFileSync(ack, json({pid: rootPid, phaseSHA}), {flag: 'wx'});
    } catch (error) { ownershipError ||= error.message; }
  };
  const timer = setInterval(observe, 100);
  try {
    result = await runBoundedProcessGroup({executable: r.nodePath, args: [r.wrapperPath, '--worker', phasePath, phaseSHA, String(workEnd)], cwd: repoRoot,
      timeoutMs: Math.max(1, workEnd - Date.now()), killGraceMs: 2000, maxStdoutBytes: 128 * 1024, maxStderrBytes: 128 * 1024, label: 'public-bundle-smoke-owned'});
    fs.writeFileSync(path.join(r.outputRoot, 'worker-stdout.txt'), result.stdout); fs.writeFileSync(path.join(r.outputRoot, 'worker-stderr.txt'), result.stderr);
  } catch (error) { failure = {stage: 'BOUNDED_WORKER', message: error.message}; }
  finally {
    clearInterval(timer); observe();
    try {
      must(rootPid && known.length && snapshots > 0 && !ownershipError, 'SMOKE_OWNERSHIP_UNPROVEN');
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        const remaining = remainingCaptureOwnedProcessesV1(known, rows());
        for (const identity of remaining) if (remainingCaptureOwnedProcessesV1(known, rows()).some((p) => p.pid === identity.pid)) {
          try { process.kill(identity.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        }
        if (remaining.length) await new Promise((resolve) => setTimeout(resolve, 150));
      }
      closure = smokeOwnedClosureV1({rootPid, known, rows: rows(), snapshots, ownershipError}); must(closure.ownedProcessesClosed, 'SMOKE_KNOWN_OR_UNKNOWN_PROCESSES_REMAIN');
    } catch (error) { failure ||= {stage: 'OWNED_CLOSURE', message: error.message}; }
    const workerPath = path.join(r.outputRoot, 'worker-result.json');
    const decoded = readSmokeWorkerResultV1(() => fs.readFileSync(workerPath)), worker = decoded.worker;
    failure ||= decoded.failure;
    try { validateSmokeWorkerCompletionV1(worker); must(result?.code === 0, 'SMOKE_WORKER_EXIT_REQUIRED'); }
    catch (error) { failure ||= worker?.primaryFailure || {stage: 'WORKER_RESULT', message: error.message}; }
    if (Date.now() >= hard) failure ||= {stage: 'HARD_DEADLINE', message: 'SMOKE_PHASE_OVERRUN'};
    const receipt = {status: failure ? 'FAIL_CLOSED_BUNDLE_SMOKE' : 'PASS_CLOSED_BUNDLE_SMOKE', phaseSHA, elapsedMs: Date.now() - started,
      primaryFailure: failure, ownedProcessesClosed: Boolean(closure?.ownedProcessesClosed), closure, rootPid, known, snapshots, ownershipError,
      workerResultPath: workerPath, workerCode: result?.code ?? null, browser: 0, renderFrames: 0, encodes: 0, automaticRetry: false, productionAdmission: false};
    write('execution-receipt.json', receipt); console.log(json(receipt)); return receipt;
  }
}

async function worker(phasePath, phaseSHA, workEnd) {
  // Output already belongs to the parent's exclusive wrapper. Revalidate source/phase without claiming it again.
  const packet = read(packetPath), r = packet.resourceExecutionBinding, phaseBytes = fs.readFileSync(phasePath);
  must(hash(phaseBytes) === phaseSHA && phasePath === r.phasePath && Number(workEnd) > Date.now(), 'SMOKE_WORKER_PHASE_DEADLINE');
  const phase = JSON.parse(phaseBytes); must(phase.readySHA === hash(fs.readFileSync(packetPath)), 'SMOKE_WORKER_READY_CHANGED');
  validateBundleSmokePhaseV1(phase, packet, Date.parse(phase.reservationStartUTC));
  must(Date.now() >= Date.parse(phase.reservationStartUTC) && Number(workEnd) <= Date.parse(phase.reservationEndUTC) - 10000
    && Number(workEnd) <= Date.now() + 50000, 'SMOKE_WORKER_WINDOW');
  const launch = read(path.join(r.outputRoot, 'owner-launch-claim.json'));
  must(launch.wrapperPid === process.ppid && launch.phaseSHA === phaseSHA, 'SMOKE_WORKER_OBSERVED_WRAPPER_PARENT');
  for (const pin of packet.frozenFiles) must(hash(fs.readFileSync(pin.path)) === pin.sha256 && phase.frozenSourceAndArtifactHashes?.[pin.path] === pin.sha256, 'SMOKE_WORKER_FROZEN_SOURCE');
  const write = (name, value) => fs.writeFileSync(path.join(r.outputRoot, name), json(value));
  write('worker-start.json', {pid: process.pid, parentPid: process.ppid, phaseSHA});
  let result;
  try {
    const ackPath = path.join(r.outputRoot, 'ownership-ack.json');
    while (!fs.existsSync(ackPath)) { must(Date.now() < Number(workEnd), 'SMOKE_OWNERSHIP_ACK_DEADLINE'); await new Promise((resolve) => setTimeout(resolve, 25)); }
    const ack = read(ackPath); must(ack.pid === process.pid && ack.phaseSHA === phaseSHA, 'SMOKE_OWNERSHIP_ACK_REQUIRED');
    result = await runRemotionPublicBundleSmokeV1({outputRoot: path.join(r.outputRoot, 'smoke-output'), workDeadlineMs: Number(workEnd),
      onCheckpoint: (checkpoint) => write('worker-checkpoint.json', checkpoint)});
  } catch (error) { result = {status: 'FAIL_BOUNDED_BUNDLE_SMOKE', primaryFailure: {stage: 'REAL_BUNDLE_SMOKE', message: error.message}, partial: error.smokePartial || null}; }
  write('worker-result.json', result); if (result.status !== 'PASS_REAL_BUNDLE_PUBLIC_BYTES_ONLY') process.exitCode = 2;
}

async function main() {
  const [mode, phasePath, phaseSHA, workEnd] = process.argv.slice(2);
  if (mode === 'preflight') { const packet = preflight(); console.log(json({status: 'PASS_OWNED_SMOKE_READONLY_PREFLIGHT', resourceExecutionBinding: packet.resourceExecutionBinding, fileWrites: 0, realBundles: 0})); return; }
  if (mode === '--worker') return worker(phasePath, phaseSHA, workEnd);
  must(mode === 'execute', 'SMOKE_FIXED_EXECUTION_MODE'); if ((await execute(phasePath)).status !== 'PASS_CLOSED_BUNDLE_SMOKE') process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
