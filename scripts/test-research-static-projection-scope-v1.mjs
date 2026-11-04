import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {mediaSha256} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
import {readSystemLineResearchTaskManifestV1, readSystemLineResearchStaticProjectionV1,readRegisteredResearchProjectionV1,readRegisteredResearchImageV1} from '../apps/studio-next/src/lib/a1-system-line-research-task-manifest-v1.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-static-scope-')), taskId = 'unseen-static-scope';
const dir = path.join(root, 'work', taskId); fs.mkdirSync(dir, {recursive: true});
const imageBytes = Buffer.from('isolated static bytes'), image = path.join(dir, 'candidate.png'); fs.writeFileSync(image, imageBytes);
const legacy = path.join(dir, 'legacy.mp4'); fs.writeFileSync(legacy, 'legacy drift');
const manifest = {contract: 'A1SystemLineResearchTaskManifest/v1', taskId, title: 'Scope test', status: 'REVIEW_ONLY', scope: 'RESEARCH_ONLY', productionAdmission: false,
  input: {planPath: `work/${taskId}/candidate.png`, planSha256: mediaSha256(imageBytes), sourceLockPath: `work/${taskId}/candidate.png`, sourceLockSha256: mediaSha256(imageBytes), sourceVideoSha256: 'b'.repeat(64), sourceDurationSeconds: 3, fps: 30},
  summary: {sequenceCount: 1, cueCount: 1, asrDraftCount: 0, registeredRenderCount: 0, candidateCoverageCount: 1, visuallyAcceptedCount: 0}, nodes: [], nodeRuns: [], blockers: [],
  sequences: [{sequenceId: 'S1', order: 1, sourceFrames: [0, 90], sourceTimeSeconds: [0, 3], cueIds: [0], spokenCopyStatus: 'LOCKED', designedCopyStatus: 'LOCKED', renderStatus: 'REVIEW_ONLY', visualReviewStatus: 'PENDING', blockers: []}],
  artifacts: [{id: 'image', path: `work/${taskId}/candidate.png`, label: 'Static fixture', sha256: mediaSha256(imageBytes), bytes: imageBytes.length},
    {id: 'legacy', path: `work/${taskId}/legacy.mp4`, label: 'Legacy invalid bytes', sha256: 'f'.repeat(64), bytes: 12}],
  candidates: [{id: 'static-v1', sequenceIds: ['S1'], status: 'REVIEWED_STATIC', artifactIds: ['image'], visualApproval: false,
    mediaClass: 'STATIC_FRAME_SET', coverageScope: 'RESEARCH_SUBFRAGMENT', currentLocalCandidate: true,
    selectionScope: 'LATEST_REVIEWED_LOCAL_COMPARISON_UNAPPROVED', wholeShotPASS: false, productionAdmission: false,
    localReview: {status: 'PASS', label: 'Synthetic fixture only'}, existingAlternativesPreserved: [],
    blockers: ['WHOLE_SHOT_NOT_COMPLETE', 'STATIC_VISUAL_REFERENCE_FAIL'],
    staticSamples: [{id: 'entry', imageArtifactId: 'image', mimeType: 'image/png', referenceArtifactId: null, referenceMimeType: null,
      localFrame: 0, sourceFrame: 0, visualApproval: false, referenceClock: {status: 'UNKNOWN', seconds: null, proofArtifactId: null}}]}]};
const file = path.join(dir, 'research-task-manifest-v1.json'); fs.writeFileSync(file, JSON.stringify({...manifest, sha256: nodeInputHash(manifest)}));
try {
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot: root, taskId}), /artifact-(size|sha)-mismatch/);
  const registered=await readRegisteredResearchProjectionV1({repoRoot:root,taskId});
  assert.equal(registered.verificationScope,'REGISTERED_METADATA_ONLY');assert.ok(registered.artifacts.every(a=>a.status==='REGISTERED_NOT_VERIFIED'&&a.sha256VerifiedNow===false));
  const thumb=await readRegisteredResearchImageV1({repoRoot:root,taskId,artifactId:'image'});assert.equal(thumb.verificationScope,'THUMBNAIL_IMAGE_BYTES_ONLY');assert.equal(thumb.artifacts.length,1);assert.equal(thumb.artifacts[0].status,'VERIFIED');
  await assert.rejects(readRegisteredResearchImageV1({repoRoot:root,taskId,artifactId:'legacy'}),/static-artifact-not-found/);
  const scoped = await readSystemLineResearchStaticProjectionV1({repoRoot: root, taskId});
  assert.equal(scoped.artifacts[0].status, 'VERIFIED');
  assert.equal(scoped.artifacts[1].status, 'NOT_CHECKED_OUTSIDE_STATIC_SCOPE');
  assert.equal(scoped.productionAdmission, false);
  const [a, b] = await Promise.all([readSystemLineResearchStaticProjectionV1({repoRoot: root, taskId, artifactId: 'image'}), readSystemLineResearchStaticProjectionV1({repoRoot: root, taskId, artifactId: 'image'})]);
  assert.strictEqual(a, b, 'concurrent identical image reads share verification');
  await assert.rejects(readSystemLineResearchStaticProjectionV1({repoRoot: root, taskId, artifactId: 'legacy'}), /static-artifact-not-found/);
  const refPath=path.join(dir,'frame-00060.jpg'),refBytes=Buffer.from('reference only');fs.writeFileSync(refPath,refBytes);
  manifest.artifacts.push({id:'reference-only',path:`work/${taskId}/frame-00060.jpg`,label:'Clean presenter reference',sha256:mediaSha256(refBytes),bytes:refBytes.length});
  manifest.sequences[0].referenceDesignArtifacts=['reference-only'];
  fs.writeFileSync(file,JSON.stringify({...manifest,sha256:nodeInputHash(manifest)}));
  const referenceOnly=await readSystemLineResearchStaticProjectionV1({repoRoot:root,taskId,artifactId:'reference-only'});
  assert.equal(referenceOnly.artifacts.find(a=>a.id==='reference-only').status,'VERIFIED');
  assert.equal(referenceOnly.candidates.length,0,'reference alone must not create a candidate');
  fs.writeFileSync(refPath,Buffer.alloc(refBytes.length));
  assert.equal((await readSystemLineResearchStaticProjectionV1({repoRoot:root,taskId,artifactId:'reference-only'})).artifacts.find(a=>a.id==='reference-only').status,'STATIC_DEPENDENCY_INVALID');
  fs.writeFileSync(image, Buffer.alloc(imageBytes.length));
  await assert.rejects(readRegisteredResearchImageV1({repoRoot:root,taskId,artifactId:'image'}),/sha-mismatch/);
  const changedMetadata=await readRegisteredResearchProjectionV1({repoRoot:root,taskId});
  assert.equal(changedMetadata.artifacts[0].status,'REGISTERED_NOT_VERIFIED','overview never claims current bytes');
  const changed = await readSystemLineResearchStaticProjectionV1({repoRoot: root, taskId});
  assert.equal(changed.artifacts[0].status, 'STATIC_DEPENDENCY_INVALID');
  assert.equal(changed.candidates[0].status, 'STALE_STATIC_DEPENDENCY_REVIEW_ONLY');
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify({...manifest, sha256: nodeInputHash(manifest)}));
} finally {fs.rmSync(root, {recursive: true, force: true});}
console.log(JSON.stringify({status: 'PASS', checks: ['legacy-integrity-failure-preserved', 'static-scope-isolated', 'only-required-static-ids-served',
  'concurrent-read-coalescing', 'later-byte-drift-rechecked', 'invalid-candidate-stales', 'no-manifest-write-or-approval']}));
