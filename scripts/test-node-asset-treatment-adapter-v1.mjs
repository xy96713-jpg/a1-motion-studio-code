import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {runShotTaskActionV1, shotTaskAdaptersV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {assetTreatmentNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-asset-treatment-adapter-v1.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'a1-treatment-node-'));
try{
  const source=path.join(root,'evidence.png');
  const image=await sharp({create:{width:320,height:180,channels:4,background:'#e9e4d6'}})
    .composite([{input:Buffer.from('<svg width="320" height="180"><rect x="40" y="40" width="240" height="90" fill="#2d3839"/></svg>')}])
    .png().toBuffer();
  fs.writeFileSync(source,image);
  const sourceSha256=sha(image),taskId='evidence-film';
  const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,
    shots:[{id:'evidence',sourceText:'Compare the verified source table',visualJob:'Preserve source evidence',tasks:[
      {module:'media-files',dependencies:[],parameters:{files:[{path:source,sha256:sourceSha256,role:'verified-evidence',slot:'source-table',kind:'IMAGE',referenceOnly:false,
        provenance:{status:'VERIFIED',sourceUrl:'https://example.org/verified-source'},materialClass:'VERIFIED_PAPER',assetId:'source-table'}]}},
      {module:'asset-treatment',dependencies:['media-files'],parameters:{sourceNodeId:'evidence:media-files',sourceArtifactRole:'source-table',
        sourceBinding:{sha256:sourceSha256,sourceUri:'https://example.org/verified-source',provenanceStatus:'VERIFIED',materialClass:'VERIFIED_PAPER'},
        pixelReview:{contract:'A1MaterialCarrierPixelReview/v1',status:'PASS',sourceSha256,reviewerId:'fixture-pixel-reviewer',
          entityCorrect:true,sceneContextCorrect:true,actionCarrierFit:true,focusVerified:true},
        treatmentContext:{source:{sourceClass:'VERIFIED_PAPER',mediaRole:'DOCUMENT_EVIDENCE',sourceAuthority:'AUTHORITATIVE_EVIDENCE'},
          shot:{shotFunction:'RESULT_HOLD',viewerTask:'Read the verified source table'}}}},
    ]}]};
  const taskRoot=path.join(root,'work',taskId);
  fs.mkdirSync(taskRoot,{recursive:true});
  fs.writeFileSync(path.join(taskRoot,'shot-task-plan-v1.json'),JSON.stringify(plan));
  const action=(verb,nodeId)=>runShotTaskActionV1({repoRoot:root,taskId,action:verb,nodeId,
    reviewerId:verb==='verify'?'fixture-technical-verifier':undefined,adapters:shotTaskAdaptersV1});
  let state=await action('tick');
  assert.equal(state.workflow.nodes.find(node=>node.module==='media-files').state,'needs-review');
  state=await action('verify','evidence:media-files');
  assert.equal(state.workflow.nodes.find(node=>node.module==='media-files').state,'succeeded');
  state=await action('tick');
  const treatment=state.workflow.nodes.find(node=>node.module==='asset-treatment');
  assert.equal(treatment.state,'needs-review');
  const artifacts=treatment.result.artifactManifest.artifacts;
  assert.deepEqual(artifacts.map(artifact=>artifact.role),['clean-master','treated-asset','treatment-comparison','treatment-receipt']);
  const receipt=JSON.parse(fs.readFileSync(path.join(state.artifactRoot,artifacts[3].path),'utf8'));
  assert.equal(receipt.treatment,'CLEAN');
  assert.equal(receipt.presentation,'EVIDENCE_PRESERVE');
  assert.equal(receipt.sourceSha256,sourceSha256);
  state=await action('verify','evidence:asset-treatment');
  assert.equal(state.workflow.nodes.find(node=>node.module==='asset-treatment').state,'succeeded');
  assert.equal(state.workflow.nodes.find(node=>node.module==='asset-treatment').acceptance.productionAdmission,false);
  const forged=await assetTreatmentNodeAdapterV1.execute(state.workflow.nodes.find(node=>node.module==='asset-treatment'),{
    artifactRoot:path.join(root,'forged-output'),dependencies:{'evidence:media-files':{
      artifacts:[{role:'source-table',kind:'IMAGE',sha256:sourceSha256,absolutePath:source}],
      sourceReview:[{role:'original-image',sha256:sourceSha256,slot:'source-table',provenance:{status:'VERIFIED',sourceUrl:'https://example.org/verified-source'}}],
    }}});
  assert.equal(forged.reason,'ASSET_TREATMENT_SOURCE_PROVENANCE_INVALID');
  const invalid=structuredClone(plan);
  invalid.shots[0].tasks[1].parameters.pixelReview.focusVerified=false;
  fs.writeFileSync(path.join(taskRoot,'shot-task-plan-v1.json'),JSON.stringify(invalid));
  state=await action('tick');
  assert.equal(state.workflow.nodes.find(node=>node.module==='asset-treatment').state,'blocked');
  assert.equal(state.workflow.nodes.find(node=>node.module==='asset-treatment').reason,'ASSET_TREATMENT_EVIDENCE_FOCUS_REVIEW_REQUIRED');
  console.log('PASS asset treatment node: verified source -> clean, treated, comparison pixels -> technical acceptance; evidence stays CLEAN; missing focus review blocks; no production admission');
}finally{fs.rmSync(root,{recursive:true,force:true});}
