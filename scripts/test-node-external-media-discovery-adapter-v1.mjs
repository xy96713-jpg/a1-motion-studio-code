import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compileExternalMaterialRequest, A1_EXTERNAL_MEDIA_METADATA_DISCOVERY_CONTRACT} from '../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs';
import {createExternalMediaDiscoveryNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-external-media-discovery-adapter-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {nodeWorkflowInput} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {compileNodeWorkflow} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
import {runShotTaskActionV1, shotTaskAdaptersV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const resign = value => {const {discoverySha256,...body}=value;return {...body,discoverySha256:sha(JSON.stringify(body))};};

const request = compileExternalMaterialRequest({id:'founder-photo',viewerTask:'Identify the named founder',shotFunction:'REVEAL',
  narrativeRole:'IDENTITY',entities:['Example Founder'],actions:['interview'],preferredMedia:['IMAGE','VIDEO']});
assert.equal(request.status,'READY_FOR_DISCOVERY');
const localWork = path.resolve(import.meta.dirname, '../work');
fs.mkdirSync(localWork, {recursive:true});
const root = fs.mkdtempSync(path.join(localWork,'a1-external-media-node-'));
try {
  let calls=0;
  const adapter=createExternalMediaDiscoveryNodeAdapterV1({fetchImpl:async()=>{throw Error('network-must-not-run');},
    discover:async (received,options)=>{
      calls++;
      assert.equal(received.requestSha256,request.requestSha256);
      assert.deepEqual(options.providers,['WIKIMEDIA_COMMONS']);
      assert.equal(options.limit,3);
      return resign({contract:A1_EXTERNAL_MEDIA_METADATA_DISCOVERY_CONTRACT,version:1,status:'PASS',
        request:{id:request.id,requestSha256:request.requestSha256},
        providers:[{provider:'WIKIMEDIA_COMMONS',status:'PASS',candidateCount:1,candidates:[{provider:'WIKIMEDIA_COMMONS',sourceId:'File:Founder.jpg',title:'Founder',mediaType:'IMAGE',sourcePageUrl:'https://commons.wikimedia.org/wiki/File:Founder.jpg',discoveryOnly:true,license:{name:'',url:'',reviewStatus:'PENDING'},relevance:{score:1}}]}],
        counts:{providerCount:1,candidateCount:1,failureCount:0},
        boundary:{metadataOnly:true,mediaDownloaded:false,evidenceAdmission:false,storyboardMutation:false,productionAdmission:false},failures:[]});
    }});
  const plan={contract:'A1ShotTaskPlan/v1',projectId:'fixture-film',scope:'RESEARCH_ONLY',productionAdmission:false,
    shots:[{id:'identity',sourceText:'Introduce the named founder',visualJob:'Verified identity source',tasks:[
      {module:'external-media-discovery',dependencies:[],parameters:{request,providers:['WIKIMEDIA_COMMONS']}}]}]};
  const {definitions}=createNodeAdapterRegistry({'external-media-discovery':adapter});
  const workflow=compileNodeWorkflow(nodeWorkflowInput(compileShotTaskWorkspaceV1(plan)),null,{moduleDefinitions:definitions});
  const node=workflow.nodes.find(item=>item.module==='external-media-discovery');
  const result=await adapter.execute(node,{artifactRoot:root});
  assert.equal(result.state,'needs-review');
  assert.equal(result.productionAdmission,false);
  assert.equal(result.downloadedMedia,false);
  assert.equal(result.candidateCount,1);
  assert.equal(calls,1);
  const artifact=result.artifactManifest.artifacts[0];
  assert.equal(artifact.kind,'JSON_PLAN');
  const bytes=fs.readFileSync(path.join(root,artifact.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);
  assert.equal(JSON.parse(bytes).boundary.mediaDownloaded,false);
  const savedDiscovery = JSON.parse(bytes);
  for (const mutate of [
    value => {value.request.id='another-request';},
    value => {value.boundary.evidenceAdmission=true;},
    value => {value.boundary.storyboardMutation=true;},
    value => {value.providers[0].candidates[0].license.reviewStatus='PASS';},
    value => {value.providers[0].candidates[0].sourcePageUrl='http://127.0.0.1/private';},
  ]) {
    const invalid=structuredClone(savedDiscovery);mutate(invalid);
    const invalidAdapter=createExternalMediaDiscoveryNodeAdapterV1({discover:async()=>resign(invalid)});
    assert.equal((await invalidAdapter.execute(node,{artifactRoot:root})).reason,'EXTERNAL_MEDIA_DISCOVERY_BOUNDARY_INVALID');
  }
  const corrupt=structuredClone(savedDiscovery);corrupt.providers[0].candidates[0].title='corrupted';
  assert.equal((await createExternalMediaDiscoveryNodeAdapterV1({discover:async()=>corrupt}).execute(node,{artifactRoot:root})).reason,'EXTERNAL_MEDIA_DISCOVERY_BOUNDARY_INVALID');
  const empty=structuredClone(savedDiscovery);empty.status='NO_RESULTS';empty.providers[0].candidates=[];empty.providers[0].candidateCount=0;empty.counts.candidateCount=0;
  const emptyResult=await createExternalMediaDiscoveryNodeAdapterV1({discover:async()=>resign(empty)}).execute(node,{artifactRoot:root});
  assert.equal(emptyResult.state,'no-match');assert.equal(emptyResult.reason,'EXTERNAL_MEDIA_NO_RESULTS');assert.ok(emptyResult.artifactManifest);
  const unavailable=structuredClone(empty);unavailable.providers[0].status='ERROR';unavailable.counts.failureCount=1;unavailable.failures=['WIKIMEDIA_COMMONS:METADATA_ACCESS_DENIED'];
  const unavailableResult=await createExternalMediaDiscoveryNodeAdapterV1({discover:async()=>resign(unavailable)}).execute(node,{artifactRoot:root});
  assert.equal(unavailableResult.state,'blocked');assert.equal(unavailableResult.reason,'EXTERNAL_MEDIA_PROVIDER_UNAVAILABLE');assert.ok(unavailableResult.artifactManifest);
  const partial=structuredClone(savedDiscovery);partial.status='PARTIAL';partial.providers.push({provider:'INTERNET_ARCHIVE',status:'ERROR',candidateCount:0,candidates:[]});partial.counts.providerCount=2;partial.counts.failureCount=1;partial.failures=['INTERNET_ARCHIVE:METADATA_TIMEOUT'];
  const partialNode=structuredClone(node);partialNode.input.parameters.providers=['WIKIMEDIA_COMMONS','INTERNET_ARCHIVE'];
  const partialResult=await createExternalMediaDiscoveryNodeAdapterV1({discover:async()=>resign(partial)}).execute(partialNode,{artifactRoot:root});
  assert.equal(partialResult.state,'needs-review');assert.equal(partialResult.discoveryStatus,'PARTIAL');assert.equal(partialResult.productionAdmission,false);
  const symlinkRoot=path.join(root,'symlink-fixture');
  const symlinkDirectory=path.join(symlinkRoot,'external-media-discovery',node.inputSha256);fs.mkdirSync(symlinkDirectory,{recursive:true});
  fs.symlinkSync(path.join(root,artifact.path),path.join(symlinkDirectory,path.basename(artifact.path)));
  assert.equal((await adapter.execute(node,{artifactRoot:symlinkRoot})).reason,'EXTERNAL_MEDIA_ARTIFACT_PATH_INVALID');
  const repeat=await adapter.execute(node,{artifactRoot:root});
  assert.equal(repeat.artifactManifest.artifacts[0].sha256,artifact.sha256);
  const unsafe=structuredClone(node);
  unsafe.input.parameters.providers=['UNTRUSTED_PROVIDER'];
  assert.equal((await adapter.execute(unsafe,{artifactRoot:root})).reason,'EXTERNAL_MEDIA_PROVIDER_INVALID');
  const noRequest=structuredClone(node);
  noRequest.input.parameters.request=null;
  assert.equal((await adapter.execute(noRequest,{artifactRoot:root})).reason,'EXTERNAL_MEDIA_REQUEST_NOT_READY');
  const taskDir=path.join(root,'work','fixture-film');
  fs.mkdirSync(taskDir,{recursive:true});
  fs.writeFileSync(path.join(taskDir,'shot-task-plan-v1.json'),JSON.stringify(plan));
  const adapters={...shotTaskAdaptersV1,'external-media-discovery':adapter};
  const tick=await runShotTaskActionV1({repoRoot:root,taskId:'fixture-film',action:'tick',adapters});
  assert.equal(tick.workflow.nodes.find(item=>item.module==='external-media-discovery').state,'needs-review');
  const verified=await runShotTaskActionV1({repoRoot:root,taskId:'fixture-film',action:'verify',nodeId:'identity:external-media-discovery',reviewerId:'fixture-verifier',adapters});
  assert.equal(verified.workflow.nodes.find(item=>item.module==='external-media-discovery').state,'succeeded');
  assert.equal(verified.workflow.nodes.find(item=>item.module==='external-media-discovery').acceptance.productionAdmission,false);
  console.log('PASS external media discovery node: SHA/request/boundary validation; no-match, unavailable and partial review states; symlink receipt rejected; shared scheduler and technical acceptance; no network, download or production admission');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
