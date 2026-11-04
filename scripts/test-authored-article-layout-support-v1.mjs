import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compileProductionStateLayoutsV1, verifyProductionLayoutSourcesV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {shotTaskAdaptersV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {verifyResearchDesignReferencesV1} from '../apps/studio-next/src/lib/a1-reference-production-design-v1.mjs';
const root = fs.realpathSync('.');
const trial = path.join(root, 'work/new-article-file-handoff-20261015-v1');
const plan = JSON.parse(fs.readFileSync(path.join(trial, 'shot-task-plan-v1.json')));
const original = structuredClone(plan.shots.find(s => s.id === 'A1'));
const ref = original.referenceProductionDesign.references.find(r => r.state === 'HOLD');
const image = path.join(trial, 'first-generated-candidate.png');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const layer = {id: 'whole-frame-reference', kind: 'ASSET', assetId: 'generated', role: 'BACKGROUND', fit: 'fill', box: {x: 0, y: 0, width: 1, height: 1}, z: 0};
const design = {...original.referenceProductionDesign,
  layers: [{id: layer.id, role: 'SUBJECT', sourceMode: 'EXISTING', assetIds: ['generated'], copyIndices: [0, 1, 2], treatment: 'NONE', purpose: 'Preserve the retained generated frame'}],
  states: [{state: 'HOLD', viewerNotice: original.referenceProductionDesign.viewerIntent, visibleLayerIds: [layer.id], visibleCopyIndices: [0, 1, 2]}],
  acceptance: [{layerId: layer.id, check: 'Exact retained content and composition'}]};
const shot = {...original, tasks: [], sourceDocument: undefined, copyEvidence: undefined,
  referenceProductionDesign: design, sourceVersionSha256: plan.source.document.sha256,
  productionLayout: {contract: 'A1ProductionStateLayouts/v1', mode: 'STATIC', canvas: {width: 1920, height: 1080},
    states: [{state: 'HOLD', referencePath: ref.path, copyIndices: [0, 1, 2], layers: [layer]}]}};
const resources = {fonts: [], assets: [{assetId: 'generated', path: image, sha256: hash(fs.readFileSync(image)), kind: 'IMAGE', role: 'generated-image', referenceOnly: false, materialClass: 'ORIGINAL_GENERATED_ASSET'}]};
const stateImplementations = Object.fromEntries(Object.entries(shotTaskAdaptersV1).map(([id, adapter]) => [id, adapter.stateImplementationSha256]));
const baseline = compileProductionStateLayoutsV1({shot, resources, stateImplementations});
assert.equal(baseline.compiled, false);
assert.match(baseline.blockers.join(','), /LAYOUT_ARTICLE_SUPPORT_REQUIRED/);
if (process.argv.includes('--baseline')) {
  console.log(JSON.stringify({status: 'REAL_TRIAL_FAILURE_REPRODUCED', blockers: baseline.blockers, articleSha256: plan.source.document.sha256, candidateSha256: resources.assets[0].sha256}));
  process.exit(0);
}
const {prepareAuthoredArticleLayoutSupportV1} = await import('../apps/studio-next/src/lib/a1-article-reference-binding-v1.mjs');
const prepared = prepareAuthoredArticleLayoutSupportV1({repoRoot: root, plan, shot});
assert.deepEqual(plan.shots.find(s => s.id === 'A1'), original, 'real saved input remains unchanged');
assert.equal(shot.sourceDocument, undefined, 'preparer is pure');
assert.equal(prepared.sourceDocument.sha256, plan.source.document.sha256);
assert.ok(prepared.copyEvidence.every((q, i) => q.includes(shot.exactCopy[i]) && q.length >= 4));
const result = compileProductionStateLayoutsV1({shot: prepared, resources, stateImplementations});
assert.equal(result.compiled, true, JSON.stringify(result.blockers));
const compiledPlan = {...plan, shots: [result.shot], assetTasks: []};
const facts = verifyProductionLayoutSourcesV1({repoRoot: root, plan: compiledPlan});
assert.equal(facts.filter(f => f.sourceKind === 'ARTICLE_EDITORIAL_COPY').length, 3);
assert.equal(facts.filter(f => f.sourceKind === 'ARTICLE_DESIGN_REFERENCE').length, 1);
const workspace = compileShotTaskWorkspaceV1(compiledPlan, {verifiedSourceFacts: facts,
  verifiedDesignReferenceShas: verifyResearchDesignReferencesV1({repoRoot: root, plan: compiledPlan})});
const projected = workspace.production.shotIntelligence.currentStoryboardAuthority.shots[0];
assert.equal(projected.packagingDecision.status, 'READY_FOR_REVIEW', JSON.stringify(projected.packagingDecision));
assert.ok(!JSON.stringify(projected.nodeWorkflow).includes('DESIGN_SOURCE_BINDING_INVALID'));
assert.ok(!JSON.stringify(projected.nodeWorkflow).includes('PRODUCTION_REFERENCE_FRAME_NOT_VERIFIED'));
const revoked = structuredClone(compiledPlan);
revoked.shots[0].sourcePresentation.copyBindings[0].status = 'DRAFT';
assert.deepEqual(verifyProductionLayoutSourcesV1({repoRoot: root, plan: revoked}), [], 'host source admission rechecks literal locks after preparation');
const changedReference = structuredClone(compiledPlan);
changedReference.shots[0].referenceProductionDesign.references[0].sha256 = 'f'.repeat(64);
assert.equal(verifyProductionLayoutSourcesV1({repoRoot: root, plan: changedReference}).filter(f => f.sourceKind === 'ARTICLE_DESIGN_REFERENCE').length, 0);
const missingHostProof = compileShotTaskWorkspaceV1(compiledPlan, {verifiedDesignReferenceShas: [ref.sha256]});
assert.equal(missingHostProof.production.shotIntelligence.currentStoryboardAuthority.shots[0].packagingDecision.status, 'BLOCKED');
for (const change of [s => s.sourcePresentation.copyBindings[0].status = 'DRAFT',
  s => s.sourcePresentation.copyBindings[0].sourceFileSha256 = 'f'.repeat(64),
  s => s.sourcePresentation.sourceDocument.sha256 = 'f'.repeat(64),
  s => s.exactCopy[0] = 'not present in the authored source']) {
  const bad = structuredClone(shot); change(bad);
  assert.throws(() => prepareAuthoredArticleLayoutSupportV1({repoRoot: root, plan, shot: bad}), /AUTHORED_ARTICLE_LAYOUT_/);
}
const workTemp = fs.mkdtempSync(path.join(root, 'work/article-layout-proof-'));
  try {
    const file = path.join(workTemp, 'article.txt'), body = '先观察，再决定。';
    fs.writeFileSync(file, body);
    const sha256 = hash(body), p = {...plan, source: {kind: 'ARTICLE', document: {kind: 'AUTHORED', path: file, sha256}}};
    const s = {...shot, exactCopy: ['先观察'], sourcePresentation: {copyMode: 'AUTHORED_ARTICLE_LITERAL_COPY', sourceDocument: {path: file, sha256},
      copyBindings: [{copyIndex: 0, text: '先观察', status: 'LOCKED', sourceKind: 'AUTHORED_ARTICLE_LITERAL', sourceFileSha256: sha256}]}};
    assert.equal(prepareAuthoredArticleLayoutSupportV1({repoRoot: root, plan: p, shot: s}).copyEvidence[0], body);
    fs.appendFileSync(file, ' changed');
    assert.throws(() => prepareAuthoredArticleLayoutSupportV1({repoRoot: root, plan: p, shot: s}), /ARTICLE_SOURCE_BYTES_CHANGED/);
} finally { fs.rmSync(workTemp, {recursive: true, force: true}); }
console.log('PASS real retained article/candidate reaches state-layout compilation; forged locks, changed copy and source drift remain blocked. No provider or visual approval.');
