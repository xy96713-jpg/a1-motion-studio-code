import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {mediaSha256} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
import {imagegenToolRequestV1, imagegenToolPathsV1, imagegenToolNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-imagegen-tool-adapter-v1.mjs';
import {imagegenResultNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-imagegen-result-adapter-v1.mjs';
import {acceptNodeArtifacts} from '../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs';
import {executeLayerCompositeNode, layerCompositeNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-composite-adapter-v1.mjs';

// Entirely local provider stand-ins. No provider, scheduler, browser, credential or production writes.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a1-imagegen-result-')));
const evidence = path.resolve('work/imagegen-review-v1');
fs.mkdirSync(evidence, {recursive: true});
const results = [];
const clone = value => structuredClone(value);
const json = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
const shaFile = filename => mediaSha256(fs.readFileSync(filename));
const check = async (name, fn) => { await fn(); results.push({name, status: 'PASS'}); console.log(`PASS ${name}`); };
const blocked = (result, reason) => { assert.equal(result.state, 'blocked'); assert.equal(result.reason, reason); assert.equal(result.productionAdmission, false); };
const png = path.join(root, 'fixture.png'), ref = path.join(root, 'reference.png');
let acceptedOutput;
try {
  await sharp({create: {width: 80, height: 60, channels: 4, background: '#cc000080'}}).png().toFile(png);
  await sharp({create: {width: 12, height: 10, channels: 4, background: '#0000ff80'}}).png().toFile(ref);
  const outputSHA = shaFile(png), reference = {path: ref, sha256: shaFile(ref), role: 'style-reference'};
  const base = {id: 'fixture:image-generation', inputSha256: '1'.repeat(64), input: {parameters: {submitAuthorized: true,
    generationRequest: {prompt: 'An original textless packaging object. Exact copy stays in an editable layer.', purpose: 'packaging-component', transparentBackground: true, outputRole: 'packaging-object', references: [reference]}}}};
  await check('reference role is bound to immutable request SHA', () => {
    const original = imagegenToolRequestV1(base), changed = clone(base); changed.input.parameters.generationRequest.references[0].role = 'edit-target';
    assert.notEqual(imagegenToolRequestV1(changed).requestSha256, original.requestSha256);
  });
  await check('reference SHA tamper is rejected', () => {
    const node = clone(base); node.input.parameters.generationRequest.references[0].sha256 = '0'.repeat(64);
    assert.throws(() => imagegenToolRequestV1(node), /IMAGEGEN_REFERENCE_SHA_MISMATCH/);
  });
  await check('changed reference bytes are rejected', () => {
    const altered = path.join(root, 'altered.png'); fs.copyFileSync(png, altered);
    const node = clone(base); node.input.parameters.generationRequest.references[0].path = altered;
    assert.throws(() => imagegenToolRequestV1(node), /IMAGEGEN_REFERENCE_SHA_MISMATCH/);
  });
  await check('unknown reference role, null entry and duplicates are rejected', () => {
    for (const refs of [[{...reference, role: 'source-film'}], [null], [reference, reference]]) {
      const node = clone(base); node.input.parameters.generationRequest.references = refs;
      assert.throws(() => imagegenToolRequestV1(node), /IMAGEGEN_REFERENCE/);
    }
  });
  await check('source-film reference SHA never becomes generation input', () => {
    const node = clone(base); node.input.parameters.referenceOnlySha256 = [reference.sha256];
    assert.throws(() => imagegenToolRequestV1(node), /REFERENCE_MEDIA_FORBIDDEN/);
  });
  await check('reference file and ancestor symlinks are rejected', () => {
    const link = path.join(root, 'reference-link.png'), dirLink = path.join(root, 'directory-link');
    fs.symlinkSync(ref, link); fs.symlinkSync(root, dirLink);
    for (const filename of [link, path.join(dirLink, 'reference.png')]) {
      const node = clone(base); node.input.parameters.generationRequest.references[0].path = filename;
      assert.throws(() => imagegenToolRequestV1(node), /IMAGEGEN_FILE_SYMLINK_FORBIDDEN/);
    }
  });
  await check('request role and exact copy shapes are validated', () => {
    for (const extra of [{outputRole: 4}, {exactCopy: [null]}, {purpose: 'generated-glyph', exactCopy: ['unmentioned']}]) {
      const node = clone(base); Object.assign(node.input.parameters.generationRequest, extra);
      assert.throws(() => imagegenToolRequestV1(node), /IMAGEGEN_(?:OUTPUT_ROLE_INVALID|EXACT_COPY_MISMATCH)/);
    }
  });
  const node = clone(base), artifactRoot = path.join(root, 'tool-artifacts');
  let checkpoints = 0;
  const context = {artifactRoot, checkpoint: async progress => { checkpoints++; node.progress = clone(progress); }};
  await check('request persists before any invocation', async () => {
    const result = await imagegenToolNodeAdapterV1.execute(node, context); blocked(result, 'IMAGEGEN_TOOL_PENDING');
    assert.equal(checkpoints, 1); assert.equal(result.toolRequest.requestSha256, imagegenToolRequestV1(node).requestSha256);
  });
  const files = imagegenToolPathsV1(artifactRoot, node.inputSha256), request = imagegenToolRequestV1(node);
  const restoreRequest = () => json(files.request, request);
  await check('cached request body tampering with retained SHA is rejected', async () => {
    json(files.request, {...request, prompt: 'tampered'});
    blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_REQUEST_CACHE_MISMATCH'); restoreRequest();
  });
  await check('malformed cached request is blocked without throwing', async () => {
    fs.writeFileSync(files.request, '{bad'); blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_TOOL_JSON_INVALID'); restoreRequest();
  });
  await check('cached request symlink is rejected', async () => {
    const saved = path.join(root, 'saved-request.json'); json(saved, request); fs.unlinkSync(files.request); fs.symlinkSync(saved, files.request);
    blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_FILE_SYMLINK_FORBIDDEN'); fs.unlinkSync(files.request); restoreRequest();
  });
  node.progress.toolInvocation = {workerId: 'fixture-worker', requestSha256: request.requestSha256};
  await check('interrupted or failed invocation stays claimed without checkpoint reset', async () => {
    const before = clone(node.progress), count = checkpoints;
    for (let i = 0; i < 3; i++) blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_TOOL_PENDING');
    assert.deepEqual(node.progress, before); assert.equal(checkpoints, count);
  });
  await check('stale claim remains blocked', async () => {
    const stale = clone(node); stale.progress.toolInvocation.requestSha256 = '0'.repeat(64);
    blocked(await imagegenToolNodeAdapterV1.execute(stale, context), 'IMAGEGEN_TOOL_CLAIM_STALE');
  });
  const outputPath = path.join(files.directory, 'output.png'); fs.copyFileSync(png, outputPath);
  const result = {contract: 'A1ImagegenToolResult/v1', inputSha256: node.inputSha256, requestSha256: request.requestSha256,
    jobId: request.jobId, workerId: 'fixture-worker', outputSha256: outputSHA, width: 80, height: 60, productionAdmission: false};
  const restoreResult = () => { json(files.result, result); fs.copyFileSync(png, outputPath); };
  await check('stale input/request/job/worker/production results are rejected', async () => {
    for (const extra of [{inputSha256: '0'.repeat(64)}, {requestSha256: '0'.repeat(64)}, {jobId: 'other'}, {workerId: 'other'}, {productionAdmission: true}]) {
      json(files.result, {...result, ...extra}); assert.equal((await imagegenToolNodeAdapterV1.execute(node, context)).state, 'blocked');
    } restoreResult();
  });
  await check('unclaimed saved result is rejected', async () => {
    const unclaimed = clone(node); delete unclaimed.progress.toolInvocation;
    blocked(await imagegenToolNodeAdapterV1.execute(unclaimed, context), 'IMAGEGEN_TOOL_RESULT_UNCLAIMED');
  });
  await check('failed and ambiguous receipts require reconciliation', async () => {
    const before = clone(node.progress);
    for (const status of ['FAILED', 'AMBIGUOUS']) {
      json(files.result, {...result, status}); blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_TOOL_RESULT_RECONCILIATION_REQUIRED');
    } assert.deepEqual(node.progress, before); restoreResult();
  });
  await check('malformed and null result JSON is blocked', async () => {
    fs.writeFileSync(files.result, '{bad'); blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_TOOL_JSON_INVALID');
    json(files.result, null); blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_TOOL_RESULT_STALE'); restoreResult();
  });
  await check('result and output symlinks are rejected', async () => {
    const elsewhere = path.join(root, 'elsewhere-result.json'); json(elsewhere, result);
    fs.unlinkSync(files.result); fs.symlinkSync(elsewhere, files.result);
    blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_FILE_SYMLINK_FORBIDDEN'); fs.unlinkSync(files.result); restoreResult();
    fs.unlinkSync(outputPath); fs.symlinkSync(png, outputPath);
    blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_FILE_SYMLINK_FORBIDDEN'); fs.unlinkSync(outputPath); restoreResult();
  });
  await check('redirected job parent creates no external descendants', () => {
    const badRoot = path.join(root, 'redirected-artifacts'), outside = path.join(root, 'outside'); fs.mkdirSync(badRoot); fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(badRoot, 'imagegen-tool-jobs'));
    assert.throws(() => imagegenToolPathsV1(badRoot, '3'.repeat(64)), /IMAGEGEN_TOOL_SYMLINK_FORBIDDEN/); assert.deepEqual(fs.readdirSync(outside), []);
    fs.symlinkSync(outside, path.join(root, 'redirected-root'));
    assert.throws(() => imagegenToolPathsV1(path.join(root, 'redirected-root', 'new'), '3'.repeat(64)), /IMAGEGEN_FILE_SYMLINK_FORBIDDEN/); assert.deepEqual(fs.readdirSync(outside), []);
  });
  await check('output SHA and recorded dimensions are checked', async () => {
    json(files.result, {...result, outputSha256: '0'.repeat(64)}); blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_OUTPUT_SHA_MISMATCH');
    json(files.result, {...result, width: 81}); blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_OUTPUT_DIMENSIONS_MISMATCH'); restoreResult();
  });
  await check('fake PNG and truncated PNG fail actual decode', async () => {
    for (const bytes of [Buffer.from('not a png'), fs.readFileSync(png).subarray(0, 65)]) {
      fs.writeFileSync(outputPath, bytes); json(files.result, {...result, outputSha256: mediaSha256(bytes)});
      blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'IMAGEGEN_OUTPUT_PNG_INVALID');
    } restoreResult();
  });
  await check('opaque alpha and absent alpha cannot satisfy transparency; blank output is rejected', async () => {
    for (const [channels, color, reason] of [[4, '#cc0000ff', 'IMAGEGEN_OUTPUT_ALPHA_REQUIRED'], [3, '#cc0000', 'IMAGEGEN_OUTPUT_ALPHA_REQUIRED'], [4, '#cc000000', 'IMAGEGEN_OUTPUT_EMPTY']]) {
      const bytes = await sharp({create: {width: 80, height: 60, channels, background: color}}).png().toBuffer();
      fs.writeFileSync(outputPath, bytes); json(files.result, {...result, outputSha256: mediaSha256(bytes)});
      blocked(await imagegenToolNodeAdapterV1.execute(node, context), reason);
    } restoreResult();
  });
  await check('input reference pixels cannot be promoted as generated output', async () => {
    fs.copyFileSync(ref, outputPath); json(files.result, {...result, outputSha256: reference.sha256, width: 12, height: 10});
    blocked(await imagegenToolNodeAdapterV1.execute(node, context), 'REFERENCE_MEDIA_FORBIDDEN'); restoreResult();
  });
  await check('saved result reuses bytes, role and provenance without another tool request', async () => {
    acceptedOutput = await imagegenToolNodeAdapterV1.execute(node, context);
    assert.equal(acceptedOutput.state, 'needs-review'); assert.equal(acceptedOutput.toolRequest, undefined);
    assert.equal(acceptedOutput.artifactManifest.artifacts[0].role, 'packaging-object');
    assert.equal(acceptedOutput.sourceReview[0].provenance.requestSha256, request.requestSha256);
    assert.deepEqual(acceptedOutput.sourceReview[0].provenance.references, [reference]);
    assert.equal(acceptedOutput.sourceReview[0].provenance.generatedFormalTextAllowed, false);
    assert.equal(acceptedOutput.visualApproval, 'NOT_GRANTED');
    const replay = await imagegenToolNodeAdapterV1.execute(node, context);
    assert.deepEqual(replay, acceptedOutput); assert.equal(node.progress.toolInvocation.workerId, 'fixture-worker');
  });
  const receiptPath = path.join(root, 'receipt.json');
  const receipt = {contract: 'A1GeneratedEditorialAssetCache/v1', provider: 'codex-imagegen', prompt: request.prompt,
    promptSha256: mediaSha256(Buffer.from(request.prompt)), sha256: outputSHA, references: [reference], sourceFilmPixelsUsed: false, productionAdmission: false, width: 80, height: 60};
  const imported = {id: 'existing:image-generation', inputSha256: '4'.repeat(64), input: {parameters: {generatedResults: []}}};
  const importRoot = path.join(root, 'import-artifacts');
  const setReceipt = (value = receipt, extra = {}) => {
    json(receiptPath, value); imported.input.parameters.generatedResults = [{receiptPath, receiptSha256: shaFile(receiptPath), promptSha256: receipt.promptSha256,
      references: [reference], transparentBackground: true, file: {path: png, sha256: outputSHA, kind: 'IMAGE', role: 'generated-image', slot: 'packaging-object', referenceOnly: false}, ...extra}];
  };
  const collect = () => imagegenResultNodeAdapterV1.execute(imported, {artifactRoot: importRoot});
  await check('cached and built-in receipts share strict prompt/reference/output binding', async () => {
    setReceipt(); assert.equal((await collect()).state, 'needs-review');
    setReceipt({...receipt, contract: 'A1GeneratedImageReceipt/v1', generationMethod: 'BUILT_IN_IMAGEGEN', asset: {sha256: outputSHA, width: 80, height: 60}});
    assert.equal((await collect()).state, 'needs-review');
  });
  await check('cache cannot bypass source-film, provider or production provenance', async () => {
    for (const extra of [{sourceFilmPixelsUsed: true}, {sourceFilmPixelsUsed: undefined}, {productionAdmission: true}, {productionAdmission: undefined}, {provider: 'local-compositor'}]) {
      setReceipt({...receipt, ...extra}); blocked(await collect(), 'IMAGEGEN_PROVENANCE_REQUIRED');
    }
  });
  await check('missing or mismatched prompt SHA and changed prompt body are rejected for every receipt type', async () => {
    for (const cached of [true, false]) {
      const value = cached ? receipt : {...receipt, contract: 'A1GeneratedImageReceipt/v1', generationMethod: 'BUILT_IN_IMAGEGEN', asset: {sha256: outputSHA}};
      setReceipt({...value, promptSha256: undefined}, {promptSha256: undefined}); blocked(await collect(), 'IMAGEGEN_PROMPT_SHA_MISMATCH');
      setReceipt(value, {promptSha256: '0'.repeat(64)}); blocked(await collect(), 'IMAGEGEN_PROMPT_SHA_MISMATCH');
      setReceipt({...value, prompt: 'changed'}); blocked(await collect(), 'IMAGEGEN_PROMPT_SHA_MISMATCH');
    }
  });
  await check('receipt reference role/SHA must match the binding', async () => {
    for (const refs of [[], [{...reference, role: 'edit-target'}], [{...reference, sha256: '0'.repeat(64)}]]) {
      setReceipt({...receipt, references: refs}); blocked(await collect(), 'IMAGEGEN_REFERENCE_RECEIPT_MISMATCH');
    }
  });
  await check('simultaneous generation request must match imported result', async () => {
    setReceipt(); imported.input.parameters.generationRequest = {...base.input.parameters.generationRequest, prompt: 'new request'};
    blocked(await collect(), 'IMAGEGEN_REQUEST_RESULT_MISMATCH'); delete imported.input.parameters.generationRequest;
  });
  await check('receipt digest tampering, invalid/null JSON, and symlinks are rejected', async () => {
    setReceipt(); fs.writeFileSync(receiptPath, '{}'); blocked(await collect(), 'IMAGEGEN_RECEIPT_SHA_MISMATCH');
    for (const raw of ['{bad', 'null', '[]']) {
      fs.writeFileSync(receiptPath, raw); imported.input.parameters.generatedResults[0].receiptSha256 = shaFile(receiptPath);
      assert.equal((await collect()).state, 'blocked');
    }
    setReceipt(); const receiptLink = path.join(root, 'receipt-link.json'); fs.symlinkSync(receiptPath, receiptLink);
    imported.input.parameters.generatedResults[0].receiptPath = receiptLink; blocked(await collect(), 'IMAGEGEN_FILE_SYMLINK_FORBIDDEN');
  });
  await check('imported output SHA, kind, role, and duplicate identity are rejected', async () => {
    setReceipt({...receipt, sha256: '0'.repeat(64)}); blocked(await collect(), 'IMAGEGEN_OUTPUT_SHA_MISMATCH');
    for (const extra of [{kind: 'VIDEO'}, {role: 'verified-evidence'}, {referenceOnly: true}, {slot: 2}]) {
      setReceipt(); Object.assign(imported.input.parameters.generatedResults[0].file, extra); blocked(await collect(), 'IMAGEGEN_OUTPUT_ROLE_INVALID');
    }
    setReceipt(); imported.input.parameters.generatedResults.push(clone(imported.input.parameters.generatedResults[0])); blocked(await collect(), 'IMAGEGEN_OUTPUT_DUPLICATE');
  });
  await check('legacy nonfactual input roles normalize to generated-image without bypassing provenance', async () => {
    for (const role of ['original-image', 'packaging-texture']) {
      setReceipt(); imported.input.parameters.generatedResults[0].file.role = role;
      const output = await collect();
      assert.equal(output.state, 'needs-review'); assert.equal(output.sourceReview[0].role, 'generated-image');
      assert.equal(output.artifactManifest.artifacts[0].role, 'packaging-object');
      assert.equal(output.artifactManifest.artifacts[0].sha256, outputSHA);
      assert.equal(output.productionAdmission, false); assert.equal(output.visualApproval, 'NOT_GRANTED');
      setReceipt({...receipt, sourceFilmPixelsUsed: true}); imported.input.parameters.generatedResults[0].file.role = role;
      blocked(await collect(), 'IMAGEGEN_PROVENANCE_REQUIRED');
      setReceipt({...receipt, promptSha256: undefined}, {promptSha256: undefined}); imported.input.parameters.generatedResults[0].file.role = role;
      blocked(await collect(), 'IMAGEGEN_PROMPT_SHA_MISMATCH');
    }
  });
  await check('imported reference pixels and dimensions cannot be promoted', async () => {
    setReceipt({...receipt, sha256: reference.sha256}); Object.assign(imported.input.parameters.generatedResults[0].file, {path: ref, sha256: reference.sha256});
    blocked(await collect(), 'REFERENCE_MEDIA_FORBIDDEN');
    setReceipt({...receipt, width: 81}); blocked(await collect(), 'IMAGEGEN_OUTPUT_DIMENSIONS_MISMATCH');
    setReceipt(); imported.input.parameters.referenceOnlySha256 = [outputSHA]; blocked(await collect(), 'REFERENCE_MEDIA_FORBIDDEN'); delete imported.input.parameters.referenceOnlySha256;
  });
  await check('import storage symlinks are blocked before copying', async () => {
    const storage = path.join(root, 'bad-storage'), outside = path.join(root, 'outside-media'); fs.mkdirSync(storage); fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(storage, 'media')); setReceipt();
    blocked(await imagegenResultNodeAdapterV1.execute(imported, {artifactRoot: storage}), 'IMAGEGEN_FILE_SYMLINK_FORBIDDEN'); assert.deepEqual(fs.readdirSync(outside), []);
  });
  await check('packaging consumes image only after technical acceptance; copy stays separately editable', async () => {
    const intent = {contract: 'A1NodeLayerCompositionIntent/v1', width: 160, height: 120, layers: [
      {id: 'object', dependencyNodeId: node.id, artifactRole: 'packaging-object', artifactKind: 'IMAGE', geometry: {x: 0, y: 0.2, width: 1, height: 0.8}, fit: 'contain', z: 0, opacity: 1},
      {id: 'copy', dependencyNodeId: 'copy:editable', artifactRole: 'editable-copy', artifactKind: 'SVG', geometry: {x: 0, y: 0, width: 1, height: 0.2}, fit: 'contain', z: 1, opacity: 1}]};
    const compositor = {id: 'packaging:layer-compositor', module: 'layer-compositor', inputSha256: '5'.repeat(64), dependencies: [node.id, 'copy:editable'],
      input: {module: 'layer-compositor', need: true, moduleVersion: 1, implementationSha256: layerCompositeNodeAdapterV1.implementationSha256, parameters: {compositionIntent: intent}}};
    const pending = {state: 'needs-review', artifacts: acceptedOutput.artifactManifest.artifacts};
    blocked(await executeLayerCompositeNode(compositor, {artifactRoot, dependencies: {[node.id]: pending}}), 'COMPOSITE_INTENT_DEPENDENCY_NOT_ACCEPTED');
    const copyBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="24" viewBox="0 0 160 24"><text x="4" y="18" fill="white" font-family="sans-serif" font-size="16">A1 EDITABLE COPY</text></svg>');
    const copyPath = path.join(artifactRoot, 'editable-copy.svg'); fs.writeFileSync(copyPath, copyBytes);
    const copyNode = {id: 'copy:editable', inputSha256: '6'.repeat(64), state: 'needs-review', result: {productionAdmission: false,
      artifactManifest: {contract: 'A1NodeArtifactManifest/v1', nodeId: 'copy:editable', inputSha256: '6'.repeat(64), productionAdmission: false,
        artifacts: [{path: 'editable-copy.svg', kind: 'SVG', role: 'editable-copy', sha256: mediaSha256(copyBytes), bytes: copyBytes.length}]}}};
    let workflow = {scope: 'REVIEW_ONLY', productionAdmission: false, nodes: [{...node, state: 'needs-review', result: acceptedOutput}, copyNode]};
    const ffprobePath = path.resolve('.tools/bin/ffprobe');
    for (const id of [node.id, copyNode.id]) workflow = await acceptNodeArtifacts(workflow, id, {artifactRoot, reviewerId: 'fixture-bytes', ffprobePath});
    const dependencies = Object.fromEntries(workflow.nodes.map(n => [n.id, {state: n.state, artifactRoot, manifestSha256: n.acceptance.manifestSha256,
      artifacts: n.acceptance.artifacts.map(artifact => ({...artifact, absolutePath: path.join(artifactRoot, artifact.path)}))}]));
    const packaged = await executeLayerCompositeNode(compositor, {artifactRoot, dependencies});
    assert.equal(packaged.state, 'needs-review', packaged.reason); assert.equal(packaged.productionAdmission, false); assert.equal(packaged.visualApproval, 'NOT_GRANTED');
    const planArtifact = packaged.artifactManifest.artifacts.find(a => a.kind === 'JSON_PLAN');
    const plan = JSON.parse(fs.readFileSync(path.join(artifactRoot, planArtifact.path)));
    assert.equal(plan.composition.layers.length, 2); assert.equal(plan.composition.layers[1].artifact.kind, 'SVG');
    assert.equal(fs.readFileSync(copyPath, 'utf8').includes('A1 EDITABLE COPY'), true);
    for (const n of workflow.nodes) assert.equal(n.acceptance.visualApproval, 'NOT_GRANTED');
    fs.copyFileSync(png, path.join(evidence, 'fixture-provider-output.png'));
    fs.copyFileSync(copyPath, path.join(evidence, 'fixture-editable-copy.svg'));
    fs.copyFileSync(path.join(artifactRoot, planArtifact.path), path.join(evidence, 'fixture-composition-plan.json'));
    fs.copyFileSync(path.join(artifactRoot, packaged.artifactManifest.artifacts.find(a => a.kind === 'IMAGE').path), path.join(evidence, 'fixture-packaging-preview.png'));
    json(path.join(evidence, 'fixture-bindings.json'), {inputSha256: node.inputSha256, requestSha256: request.requestSha256, promptSha256: receipt.promptSha256,
      references: request.references.map(({path: ignored, ...binding}) => binding), outputSha256: outputSHA, copySha256: mediaSha256(copyBytes),
      packagingSha256: packaged.artifactManifest.artifacts.find(a => a.kind === 'IMAGE').sha256, technicalAcceptance: workflow.nodes.map(n => n.acceptance.manifestSha256),
      realGeneratorCalls: 0, visualApproval: 'NOT_GRANTED', productionAdmission: false});
  });
  json(path.join(evidence, 'result-test-report.json'), {contract: 'A1ImagegenFixtureRegression/v1', cases: results, total: results.length, realGeneratorCalls: 0, browserCalls: 0,
    productionAdmission: false, visualApproval: 'NOT_GRANTED', requestSha256: request.requestSha256, outputSha256: outputSHA, referenceSha256: reference.sha256});
  console.log(`PASS ${results.length} fixture cases; no real generation; PNG/alpha and separately editable packaging copy verified.`);
} finally { fs.rmSync(root, {recursive: true, force: true}); }
