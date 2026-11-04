#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {capExportNodeAdapterV1, capProjectFileBindings} from '../apps/studio-next/src/lib/a1-node-cap-export-adapter-v1.mjs';
import {mediaSha256} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
import {verifyNodeArtifactManifest} from '../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-cap-node-'));
const ffmpeg = path.join(root, '.tools/bin/ffmpeg'), ffprobe = path.join(root, '.tools/bin/ffprobe');
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const bind = (file) => ({path: file, sha256: mediaSha256(fs.readFileSync(file))});
let assertions = 0;
try {
  const projectPath = path.join(dir, 'editable.cap'); fs.mkdirSync(projectPath);
  const sourceVideo = path.join(dir, 'source.mp4'), exportPath = path.join(dir, 'review.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=160x90:r=60', '-t', '0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', sourceVideo]);
  fs.copyFileSync(sourceVideo, exportPath); fs.copyFileSync(sourceVideo, path.join(projectPath, 'display.mp4'));
  writeJson(path.join(projectPath, 'project-config.json'), {background: {source: {type: 'gradient'}}, timeline: {segments: []}});
  writeJson(path.join(projectPath, 'recording-meta.json'), {status: {status: 'Complete'}, segments: [{display: {path: 'display.mp4'}}]});
  const reportPath = path.join(dir, 'capture-report.json');
  writeJson(reportPath, {shotId: 'test-shot', captureBackend: 'PLAYWRIGHT_HEADLESS_CDP_INPUT', output: bind(sourceVideo)});
  const configSha = bind(path.join(projectPath, 'project-config.json')).sha256;
  const originalReceipt = {contract: 'A1BackgroundCapProjectReceipt/v1', status: 'READY_FOR_CAP_EXPORT', shotId: 'test-shot',
    coveragePlan: {status: 'PASS'}, captureBackend: 'PLAYWRIGHT_HEADLESS_CDP_INPUT', projectPath, projectConfigSha256: configSha,
    sourceReport: reportPath, sourceVideo: bind(sourceVideo), productionAdmission: false,
    postExport: {contract: 'A1BackgroundCapPostExportReceipt/v1', status: 'PASS', projectConfigSha256: configSha,
      reviewVideo: {...bind(exportPath), width: 160, height: 90, fps: '60/1', frameCount: 12, durationMs: 200}}};
  const receiptPath = path.join(projectPath, 'a1-background-receipt.json'); writeJson(receiptPath, originalReceipt);
  const makeNode = (suffix = '') => ({id: 'test-shot:cap-export', shotId: 'test-shot', module: 'cap-export', inputSha256: mediaSha256(Buffer.from(`test${suffix}`)),
    input: {parameters: {capExport: {mode: 'collect', projectPath, projectConfigSha256: configSha, receipt: bind(receiptPath),
      sourceReport: bind(reportPath), sourceVideo: {...bind(sourceVideo), referenceOnly: false}, projectFiles: capProjectFileBindings(projectPath), exportFile: bind(exportPath)}}}});
  const context = {artifactRoot: path.join(dir, 'artifacts'), repoRoot: dir, ffprobePath: ffprobe, ffmpegPath: ffmpeg};
  const run = (node, extra = {}) => capExportNodeAdapterV1.execute(node, {...context, ...extra});
  const node = makeNode();
  const result = await run(node); assert.equal(result.state, 'needs-review'); assert.equal(result.productionAdmission, false); assertions++;
  await verifyNodeArtifactManifest(result.artifactManifest, {artifactRoot: context.artifactRoot, node, ffprobePath: ffprobe}); assertions++;
  const again = await run(node); assert.deepEqual(again.artifactManifest, result.artifactManifest); assertions++;
  const changed = structuredClone(node); changed.input.parameters.capExport.projectConfigSha256 = 'a'.repeat(64);
  assert.equal((await run(changed)).reason, 'CAP_FILE_SHA_MISMATCH'); assertions++;
  const stale = structuredClone(node); stale.input.parameters.capExport.exportFile.sha256 = 'b'.repeat(64);
  assert.equal((await run(stale)).reason, 'CAP_EXPORT_RECEIPT_BINDING_MISMATCH'); assertions++;
  const reference = structuredClone(node); reference.input.parameters.referenceOnlySha256 = [bind(sourceVideo).sha256];
  assert.equal((await run(reference)).reason, 'REFERENCE_MEDIA_FORBIDDEN'); assertions++;
  const sourceMismatch = structuredClone(node); sourceMismatch.input.parameters.capExport.sourceReport.sha256 = 'c'.repeat(64);
  assert.equal((await run(sourceMismatch)).reason, 'CAP_FILE_SHA_MISMATCH'); assertions++;
  fs.appendFileSync(exportPath, 'changed');
  assert.equal((await run(node)).reason, 'CAP_FILE_SHA_MISMATCH'); assertions++;
  fs.copyFileSync(sourceVideo, exportPath);
  writeJson(receiptPath, {...originalReceipt, postExport: {...originalReceipt.postExport, status: 'RUNNING'}});
  assert.equal((await run(makeNode('running'))).reason, 'CAP_POST_EXPORT_COMPLETION_REQUIRED'); assertions++;
  writeJson(receiptPath, originalReceipt);
  fs.writeFileSync(exportPath, fs.readFileSync(sourceVideo).subarray(0, 48));
  writeJson(receiptPath, {...originalReceipt, postExport: {...originalReceipt.postExport, reviewVideo: {...originalReceipt.postExport.reviewVideo, ...bind(exportPath)}}});
  assert.equal((await run(makeNode('partial'))).state, 'blocked'); assertions++;
  fs.copyFileSync(sourceVideo, exportPath); writeJson(receiptPath, originalReceipt);
  const immutable = makeNode('inventory'); fs.writeFileSync(path.join(projectPath, 'unexpected.txt'), 'changed');
  assert.equal((await run(immutable)).reason, 'CAP_PROJECT_FILE_SET_CHANGED'); assertions++;
  fs.unlinkSync(path.join(projectPath, 'unexpected.txt'));
  writeJson(path.join(projectPath, 'recording-meta.json'), {status: {status: 'Recording'}});
  assert.equal((await run(makeNode('recording'))).reason, 'CAP_RECORDING_NOT_COMPLETE'); assertions++;
  writeJson(path.join(projectPath, 'recording-meta.json'), {status: {status: 'Complete'}, segments: [{display: {path: 'display.mp4'}}]});
  const exportNode = makeNode('native'); const exportInput = exportNode.input.parameters.capExport;
  exportInput.mode = 'export'; exportInput.settings = {width: 160, height: 90, fps: 60};
  assert.equal((await run(exportNode)).reason, 'CAP_NATIVE_EXPORT_AUTHORIZATION_REQUIRED'); assertions++;
  // A fake executable exercises lifecycle only; it is never presented as a real Cap render.
  const fakeCli = path.join(dir, 'fixture-cap-cli');
  fs.writeFileSync(fakeCli, `#!${process.execPath}\nconst fs=require('fs'),p=require('path');const args=process.argv.slice(2),out=args[args.indexOf('--output')+1];fs.copyFileSync(p.join(args[1],'display.mp4'),out);fs.appendFileSync(${JSON.stringify(path.join(dir, 'calls.txt'))},'1');console.log(JSON.stringify({type:'Completed',path:out}));\n`, {mode: 0o755});
  exportInput.allowCapExport = true;
  const originalProject = capProjectFileBindings(projectPath);
  const rendered = await run(exportNode, {capCliPath: fakeCli});
  assert.equal(rendered.state, 'needs-review'); assert.match(rendered.jobId, /^cap-/u); assertions++;
  const restored = await run(exportNode, {capCliPath: '/does-not-exist'});
  assert.equal(restored.state, 'needs-review'); assert.equal(fs.readFileSync(path.join(dir, 'calls.txt'), 'utf8'), '1'); assertions++;
  assert.deepEqual(capProjectFileBindings(projectPath), originalProject); assertions++;
  const nativeReceipt = JSON.parse(fs.readFileSync(path.join(context.artifactRoot, restored.artifactManifest.artifacts[1].path)));
  const jobPath = path.join(path.dirname(path.join(context.artifactRoot, restored.artifactManifest.artifacts[1].path)), 'native-job.json');
  const job = JSON.parse(fs.readFileSync(jobPath)); writeJson(jobPath, {...job, state: 'RUNNING', pid: process.pid});
  assert.equal((await run(exportNode, {capCliPath: fakeCli})).reason, 'CAP_EXPORT_RUNNING_OR_INTERRUPTED'); assertions++;
  writeJson(jobPath, job);
  const staleLock=path.join(path.dirname(jobPath),'adapter.lock');fs.mkdirSync(staleLock);writeJson(path.join(staleLock,'owner.json'),{pid:2147483647});
  assert.equal((await run(exportNode, {capCliPath: fakeCli})).state, 'needs-review'); assertions++;
  writeJson(jobPath, {...job,state:'RUNNING',pid:2147483647});
  const failedProgress=[]; assert.equal((await run(exportNode,{capCliPath:fakeCli,checkpoint:async(p)=>failedProgress.push(p)})).reason,'CAP_PREVIOUS_EXPORT_FAILED_NEW_VERSION_REQUIRED');
  assert.equal(failedProgress.at(-1).status,'FAILED'); assertions++;
  assert.equal(nativeReceipt.metadata.fullDecodePass, true); assert.equal(nativeReceipt.actualPixelReview, 'NOT_REVIEWED'); assertions++;
  const parallel = makeNode('parallel'); parallel.input.parameters.capExport = {...parallel.input.parameters.capExport, mode: 'export', allowCapExport: true, settings: {width: 160, height: 90, fps: 60}};
  const progress = [];
  const pair = await Promise.all([run(parallel, {capCliPath: fakeCli, checkpoint: async (value) => {progress.push(value); return value;}}), run(parallel, {capCliPath: fakeCli})]);
  assert.equal(pair.filter((item) => item.state === 'needs-review').length, 1);
  assert.equal(pair.filter((item) => item.reason === 'CAP_EXPORT_RUNNING_OR_INTERRUPTED').length, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'calls.txt'), 'utf8'), '11'); assertions++;
  assert.deepEqual(progress.map((item) => item.status), ['SUBMITTING', 'COMPLETED']); assertions++;
  console.log(JSON.stringify({status: 'PASS', assertions, actualCapCliExecuted: false, productionAdmission: false}));
} finally {fs.rmSync(dir, {recursive: true, force: true});}
