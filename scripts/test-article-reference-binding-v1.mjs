import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {readArticleSourceBindingV1,readArticleDesignReferencesV1} from '../apps/studio-next/src/lib/a1-article-reference-binding-v1.mjs';
import {compileFullFrameRequestsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {assessShotImagegenDesignV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {buildArticleResearchManifestV1} from '../apps/studio-next/src/lib/a1-article-research-manifest-v1.mjs';
import {readRegisteredResearchProjectionV1,readRegisteredResearchImageV1} from '../apps/studio-next/src/lib/a1-system-line-research-task-manifest-v1.mjs';
import {compileResearchProductionWorkOrderV1} from '../apps/studio-next/src/lib/a1-research-production-work-order-v1.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'article-reference-'))),taskId='unseen-article',dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
try {
  const body=Buffer.from('An authored article about observing a problem before choosing a solution.'),source=path.join(dir,'article.txt');fs.writeFileSync(source,body);
  const bytes=Buffer.from('design reference fixture'),reference=path.join(dir,'reference.png');fs.writeFileSync(reference,bytes);
  const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,title:'Unseen authored article',scope:'RESEARCH_ONLY',productionAdmission:false,
    source:{kind:'ARTICLE',document:{kind:'AUTHORED',path:source,sha256:sha(body)}},
    visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
    shots:[{id:'A',sourceText:body.toString(),visualJob:'Show the distinction between observing and guessing',exactCopy:['先观察，再决定'],tasks:[{module:'media-files',dependencies:[],parameters:{}}]}]};
  const evidenceFile=path.join(dir,'references.json'),evidence={contract:'A1ArticleStoryboardReferenceEvidence/v1',source:{kind:'ARTICLE',sha256:sha(body)},references:[{shotId:'A',state:'HOLD',anchorIndex:0,referenceKind:'DESIGN_REFERENCE',path:reference,sha256:sha(bytes)}]};fs.writeFileSync(evidenceFile,JSON.stringify(evidence));
  const binding={path:evidenceFile,sha256:sha(fs.readFileSync(evidenceFile))};
  const checked=readArticleDesignReferencesV1({repoRoot:root,plan,evidenceFile:binding});assert.equal(checked.references[0].clockStatus,'NOT_APPLICABLE_ARTICLE_DESIGN');
  const unit={shotId:'A',state:'HOLD',brief:'One complete illustrative editorial frame with 先观察，再决定',contentPlan:{referenceKind:'CONCEPT_SCENE',subject:'观察问题',action:'先观察再决定',viewerTakeaway:'观察先于判断',sourceAnchor:'先观察，再决定',requiredVisibleAnchors:['先观察，再决定'],treatment:'ORIGINAL_ILLUSTRATION'},visualIntake:{contract:'A1WholeFrameVisualIntake/v1',reviewerRole:'AGENT',reviewerId:'fixture',sourceCorePolicy:'ORIGINAL_ILLUSTRATION_NO_NATIVE_EVIDENCE',referenceEvidence:binding,
    reference:checked.references[0],visibleCopyIndices:[0],viewerIntent:plan.shots[0].visualJob,appearance:{composition:'Single focal object',palette:'Neutral and one accent',surface:'Paper'}}};
  const compiled=compileFullFrameRequestsV1({repoRoot:root,taskRoot:dir,plan,units:[unit]}),task=compiled.plan.assetTasks[0].tasks[0];
  assert.equal(task.parameters.referenceDesign.contract,'A1ShotReferenceDesign/v2');assert.equal(task.parameters.referenceDesign.sourceBinding.kind,'ARTICLE');
  assert.equal(Object.hasOwn(task.parameters.referenceDesign,'sourceVideoSha256'),false,'article SHA is never disguised as video SHA');
  assert.equal(task.parameters.referenceDesign.frame.kind,'DESIGN_REFERENCE');
  assert.deepEqual(assessShotImagegenDesignV1({...plan,executionPolicy:{requireReferenceDesignForImagegen:true}}, {...plan.shots[0],exactCopy:task.parameters.generationRequest.exactCopy},task).missing,[]);
  fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(compiled.plan));const manifest=buildArticleResearchManifestV1({repoRoot:root,taskId});
  assert.equal(manifest.input.sourceVideoSha256,null);assert.equal(manifest.input.fps,null);assert.equal(manifest.sequences[0].sourceFrames,null);
  const projection=await readRegisteredResearchProjectionV1({repoRoot:root,taskId});assert.equal(projection.input.sourceKind,'ARTICLE');
  const referenceImage=await readRegisteredResearchImageV1({repoRoot:root,taskId,artifactId:manifest.sequences[0].referenceDesignArtifacts[0]});
  assert.equal(referenceImage.artifacts[0].status,'VERIFIED');assert.equal(referenceImage.artifacts[0].sha256,sha(bytes));
  const order=compileResearchProductionWorkOrderV1({repoRoot:root,plan:compiled.plan,projection,registeredOnly:true});
  assert.equal(order.shots[0].anchors.length,1);assert.equal(order.shots[0].anchors[0].sourceFrame,null);
  assert.equal(order.shots[0].anchors[0].designAnchorIndex,0);assert.equal(order.shots[0].anchors[0].referenceKind,'DESIGN_REFERENCE');
  const forged=structuredClone(projection);forged.input.sourceArticleSha256='f'.repeat(64);
  assert.throws(()=>compileResearchProductionWorkOrderV1({repoRoot:root,plan:compiled.plan,projection:forged,registeredOnly:true}),/input-invalid/);
  fs.appendFileSync(source,'changed');assert.throws(()=>readArticleSourceBindingV1({repoRoot:root,plan}),/BYTES_CHANGED/);
  console.log('PASS real article bytes/design-reference bindings, v2 preflight without fabricated video SHA or clock, original manifest projection and source drift. Fixture bytes, no generation.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
