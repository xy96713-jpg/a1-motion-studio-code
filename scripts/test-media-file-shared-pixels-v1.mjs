import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {importNodeMediaFiles, mediaSha256} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
import {verifyNodeArtifactManifest} from '../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-media-role-'));
try {
  const bytes=await sharp({create:{width:32,height:18,channels:4,background:'#eeaa33'}}).png().toBuffer();
  const source=path.join(root,'source.png');fs.writeFileSync(source,bytes);
  const file={path:source,sha256:mediaSha256(bytes),role:'packaging-texture',kind:'IMAGE',referenceOnly:false};
  const node={id:'fixture:media-files',inputSha256:'a'.repeat(64),input:{parameters:{}}};
  const artifactRoot=path.join(root,'outputs');
  const result=await importNodeMediaFiles(node,{artifactRoot},['entry','hold','handoff'].map(slot=>({...file,slot})));
  assert.equal(result.state,'needs-review');
  assert.equal(new Set(result.artifactManifest.artifacts.map(a=>a.path)).size,3);
  assert.deepEqual(result.artifactManifest.artifacts.map(a=>a.role),['entry','hold','handoff']);
  for(const a of result.artifactManifest.artifacts)assert.deepEqual(fs.readFileSync(path.join(artifactRoot,a.path)),bytes);
  await verifyNodeArtifactManifest(result.artifactManifest,{artifactRoot,node});
  const replay=await importNodeMediaFiles(node,{artifactRoot},['entry','hold','handoff'].map(slot=>({...file,slot})));
  assert.deepEqual(replay,result);
  const duplicate=await importNodeMediaFiles(node,{artifactRoot},[{...file,slot:'hold'},{...file,slot:'hold'}]);
  assert.equal(duplicate.reason,'MEDIA_DUPLICATE_SLOT');
  console.log('PASS identical pixels retain three distinct role paths, replay determinism and duplicate-role rejection');
} finally {fs.rmSync(root,{recursive:true,force:true});}
