import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1,runShotTaskActionV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {registerProductionBatchV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
const sharp=createRequire(new URL('../apps/studio-next/package.json',import.meta.url))('sharp');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'generic-registration-'))),fixtures=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
try {
for(const genre of ['typography','editorial-comparison','source-explainer']){
 const taskId='new-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
 const output=path.join(dir,'source.png'),reference=path.join(dir,'reference.png');
 fs.writeFileSync(output,await sharp({create:{width:16,height:9,channels:4,background:'#112233'}}).png().toBuffer());
 fs.writeFileSync(reference,await sharp({create:{width:16,height:9,channels:4,background:'#334455'}}).png().toBuffer());
 const imageSha=hash(fs.readFileSync(output)),refSha=hash(fs.readFileSync(reference)),sourceSha='a'.repeat(64);
 const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:sourceSha,fps:25},
   shots:[{id:'scene',sourceText:'Source fixture '+genre,visualJob:'Import existing research image',exactCopy:[],sourceInterval:{startFrame:0,endFrameExclusive:10},
     referenceProductionDesign:{contract:'A1ReferenceProductionDesign/v1',shotId:'scene',sourceVideoSha256:sourceSha,viewerIntent:'Fixture source shape',
       appearance:{composition:'One focal field',palette:'Neutral',surface:'Flat'},references:[{state:'HOLD',sourceFrame:1,path:reference,sha256:refSha}],
       layers:[{id:'frame',role:'SUBJECT',sourceMode:'EXISTING',assetIds:['fixture-image'],copyIndices:[],treatment:'NONE',purpose:'Fixture source shape'}],
       states:[{state:'HOLD',viewerNotice:'One focal field',visibleLayerIds:['frame'],visibleCopyIndices:[]}],acceptance:[],uncertainties:[]},
     tasks:[{module:'media-files',dependencies:[],parameters:{files:[{assetId:'fixture-image',path:output,sha256:imageSha,kind:'IMAGE',role:'original-image',slot:'preview',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET'}]}}]}]};
 save(path.join(dir,'shot-task-plan-v1.json'),plan);syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
 await runShotTaskActionV1({repoRoot:root,taskId,action:'tick',expectedPlanSha256:nodeInputHash(plan),workerId:'fixture-worker',maxClaims:1});
 await runShotTaskActionV1({repoRoot:root,taskId,action:'verify',nodeId:'scene:media-files',expectedPlanSha256:nodeInputHash(plan),reviewerId:'fixture-byte-reviewer'});
 const runtime=readShotTaskRuntimeV1({repoRoot:root,taskId}),node=runtime.workflow.nodes.find(n=>n.id==='scene:media-files');
 assert.equal(node.state,'succeeded',node.reason||node.state);assert.ok(node.acceptance);
 const seedBody={contract:'A1SystemLineResearchTaskManifest/v1',taskId,scope:'RESEARCH_ONLY',productionAdmission:false,status:'RESEARCH_ONLY',input:{sourceVideoSha256:sourceSha,fps:25},
   sequences:[{sequenceId:'scene'}],artifacts:[],candidates:[],nodeRuns:[],summary:{sequenceCount:1,candidateCoverageCount:0,registeredRenderCount:0,visuallyAcceptedCount:0},authority:{formalProductionAdmission:false}};
 save(path.join(dir,'research-task-manifest-v1.json'),{...seedBody,sha256:nodeInputHash(seedBody)});
 save(path.join(dir,'candidate-registry-v1.json'),{contract:'A1ReferenceCandidateRegistry/v1',scope:'RESEARCH_ONLY',productionAdmission:false,entries:[]});
 const phaseId='fixture-registration',batch=path.join(dir,'production-batches',phaseId);
 save(path.join(batch,'result.json'),{taskId,phaseId,executionPlanSha256:nodeInputHash(plan),outputs:[{shotId:'scene',nodeId:node.id,inputSha256:node.inputSha256,acceptance:node.acceptance}]});
 save(path.join(batch,'visual-review.json'),{contract:'A1ProductionBatchVisualReview/v1',executionPlanSha256:nodeInputHash(plan),reviewerId:'fixture-only',productionAdmission:false,
   items:[{nodeId:node.id,inputSha256:node.inputSha256,imageSha256:imageSha,referenceSha256:refSha,sourceFrame:1,status:'TECHNICAL_PASS_ONLY',label:'Fixture technical check, no visual admission',findings:[]}]});
 const result=await registerProductionBatchV1({repoRoot:root,taskId,phaseId});assert.equal(result.registered.length,1);assert.equal(result.productionAdmission,false);
 const manifestFile=path.join(dir,'research-task-manifest-v1.json'),bytes=fs.readFileSync(manifestFile),manifest=JSON.parse(bytes);assert.equal(manifest.candidates.length,1);
 assert.equal(manifest.candidates[0].localReview.status,'TECHNICAL_PASS_ONLY');assert.equal(manifest.candidates[0].wholeShotPASS,false);
 const repeated=await registerProductionBatchV1({repoRoot:root,taskId,phaseId});assert.equal(repeated.registered[0].reused,true);assert.deepEqual(fs.readFileSync(manifestFile),bytes);
 fixtures.push({id:genre,genre,status:'PASS',taskId,acceptedLocalImageImported:true,registeredThroughNormalAPI:true,repeatedCandidateReused:true,providerCalls:0});
}
const result={status:'PASS',fixtures,verificationScope:'ISOLATED_NORMAL_REGISTRATION_WITH_TECHNICAL_ONLY_FIXTURE_IMAGES',productionAdmission:false,visualQualityVerified:false};console.log(JSON.stringify(result));
if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
}finally{fs.rmSync(root,{recursive:true,force:true});}
