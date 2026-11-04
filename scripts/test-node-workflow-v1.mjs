#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import sharp from "sharp";
import {compileNodeWorkflow, claimNodeTasks, finishNodeTask, retryNodeTask, nodeInputHash, nodeDependencyBlockers, summarizeNodeWorkflow} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {NODE_ARTIFACT_MANIFEST_CONTRACT, acceptNodeArtifacts, verifyNodeArtifactManifest} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {executeMaterialNode} from "../apps/studio-next/src/lib/a1-node-material-adapter-v1.mjs";
import {createMaterialJob, rankMaterialJobCandidates} from "../apps/studio-next/src/lib/a1-material-orchestrator.js";
import {runNodeWorkflowTick, readCurrentNodeWorkflow, nodeWorkflowInput} from "../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs";
import {projectDirs, withProjectLock, readNodeWorkflowState, persistNodeWorkflowState} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createNodeAdapterRegistry, executeRegisteredNode} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {projectShotTaskCapabilityCoverageV1} from "../apps/studio-next/src/lib/a1-shot-task-capability-coverage-v1.mjs";
import {executeLayerCompositeNode} from "../apps/studio-next/src/lib/a1-node-composite-adapter-v1.mjs";
import {compileShotTaskWorkspaceV1, projectShotTaskMaterialWorkOrderV1} from "../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs";

const input = {projectId: "test-film", workspaceSha256: "a".repeat(64), context: {articleTitle: "Katherine Johnson", articleSha256: "b".repeat(64)},
  shots: [1, 2, 3].map((id) => ({id: `shot-${id}`, source: "Katherine Johnson verifies John Glenn orbital calculations", sourceUrl: "https://www.nasa.gov/katherine-johnson/", exactCopy: ["复核"], modules: {material: true, recording: true, typography: true}}))};
const base = compileNodeWorkflow(input);
assert.equal(base.nodes.filter((node) => node.reason === "MODULE_NOT_READY").length, 6);
assert.equal(claimNodeTasks(base, {workerId: "busy", externalRunning: 2}).claims.length, 0);
const first = claimNodeTasks(base, {workerId: "first", now: 1000});
assert.equal(first.claims.length, 2);
assert.equal(claimNodeTasks(first.workflow, {workerId: "second", now: 1001}).claims.length, 0);
assert.throws(() => finishNodeTask(first.workflow, {...first.claims[0], lease: {token: "wrong"}}, {state: "needs-review", productionAdmission: false}, 1002), /stale-node-result/);
assert.throws(() => finishNodeTask(first.workflow, first.claims[0], {state: "succeeded", productionAdmission: true}, 1002), /invalid-review-only-result/);
const finished = finishNodeTask(first.workflow, first.claims[0], {state: "needs-review", productionAdmission: false}, 1002);
const restored = compileNodeWorkflow(input, JSON.parse(JSON.stringify(finished)));
assert.equal(restored.nodes[0].state, "needs-review");
const titleChange = structuredClone(input); titleChange.shots[0].exactCopy = ["人工复核"];
const retitled = compileNodeWorkflow(titleChange, restored);
assert.equal(retitled.nodes[0].state, "needs-review");
assert.notEqual(retitled.nodes[1].inputSha256, restored.nodes[1].inputSha256);
const sourceChange = structuredClone(input); sourceChange.shots[0].source += " with a calculator";
const changed = compileNodeWorkflow(sourceChange, restored);
assert.equal(changed.nodes[0].state, "queued");
assert.equal(changed.nodes[3].inputSha256, restored.nodes[3].inputSha256);
const changedWhileRunning = compileNodeWorkflow(sourceChange, first.workflow);
assert.equal(changedWhileRunning.retiredClaims.length, 1);
assert.equal(claimNodeTasks(changedWhileRunning, {workerId: "third", now: 1002}).claims.length, 0);
assert.throws(() => finishNodeTask(changed, first.claims[0], {state: "needs-review", productionAdmission: false}, 1002), /stale-node-result/);
assert.throws(() => compileNodeWorkflow({...input, projectId: "other"}, base), /project-mismatch/);
assert.throws(() => retryNodeTask(base, "shot-1:typography"), /retry-not-allowed/);
const expired = claimNodeTasks(first.workflow, {workerId: "replacement", now: 200000}).workflow;
assert.equal(expired.nodes[0].reason, "LEASE_EXPIRED_RECONCILE_BEFORE_RETRY");
assert.equal(retryNodeTask(expired, "shot-1:material").nodes[0].state, "queued");
expired.nodes[0].attempt = 2;
assert.throws(() => retryNodeTask(expired, "shot-1:material"), /retry-not-allowed/);

const legacyRecompiled = compileNodeWorkflow(input);
assert.deepEqual(legacyRecompiled.nodes.map((node) => [node.id, node.inputSha256]), base.nodes.map((node) => [node.id, node.inputSha256]),
  "workflows without external bindings preserve legacy node fingerprints");

const installedRegistry = createNodeAdapterRegistry();
const installedPackagingDefinitions = installedRegistry.definitions;
const currentResearchPlan = JSON.parse(fs.readFileSync(path.join(import.meta.dirname,
  "../work/hupo-69-shot-reconstruction-v1/shot-task-plan-v1.json"), "utf8"));
const capabilityCoverage = projectShotTaskCapabilityCoverageV1(currentResearchPlan, null, installedPackagingDefinitions, {pending: false});
const pendingCapabilityCoverage = projectShotTaskCapabilityCoverageV1(currentResearchPlan, null, installedPackagingDefinitions, {pending: true});
const registeredModuleIds = Object.keys(installedRegistry.registry).sort();
const executableModuleIds = registeredModuleIds.filter((id) => installedRegistry.registry[id].available
  && typeof installedRegistry.registry[id].execute === "function");
const coverageModuleIds = capabilityCoverage.modules.map((module) => module.id).sort();
assert.deepEqual(registeredModuleIds.filter((id) => !coverageModuleIds.includes(id)), [],
  "every registry entry, including placeholders, must appear in task capability coverage");
assert.deepEqual(registeredModuleIds.filter((id) => !executableModuleIds.includes(id)), ["hyperframes-render"],
  "registered placeholder modules must not be counted as executable adapters");
assert.deepEqual(executableModuleIds.filter((id) => !coverageModuleIds.includes(id)), [],
  "every executable adapter must appear in task capability coverage");
assert.deepEqual(coverageModuleIds.filter((id) => !registeredModuleIds.includes(id)).sort(),
  ["article-source-capture", "shot-packaging-composition"],
  "non-executable pipeline stages must be explicit placeholders rather than silent omissions");
const compositionStage = capabilityCoverage.modules.find((item) => item.id === "shot-packaging-composition");
assert.equal(compositionStage.status, "AUTOMATIC_COMPOSITOR_ROUTING_PRESENT_TEXT_LAYOUT_INPUTS_REQUIRED");
assert.equal(compositionStage.available, false, "decision-driven image composition is routed; typography layout inputs and visual acceptance remain separately gated");
assert.ok(compositionStage.reason);
assert.equal(pendingCapabilityCoverage.modules.find((item) => item.id === "shot-packaging-composition").status, "PLAN_NOT_SYNCED",
  "pending plan synchronization must take precedence over capability-stage status");
const assemblyStage = capabilityCoverage.modules.find((item) => item.id === "sequence-assembly");
assert.equal(assemblyStage.status, "NOT_PLANNED");
assert.equal(assemblyStage.available, true, "the gated sequence adapter exists even though this article has not cleared its review gate");
assert.ok(assemblyStage.reason);

const routeSourceSha256="a".repeat(64),routeAssetSha256="b".repeat(64),routeSourceUrl="https://assets.example.test/package.png";
const routePlan={contract:"A1ShotTaskPlan/v1",projectId:"generic-composition-route-fixture",title:"Generic composition route fixture",scope:"RESEARCH_ONLY",productionAdmission:false,
  source:{videoSha256:routeSourceSha256},shots:[{id:"generic-shot",sourceText:"A verified package image supports the visual beat.",visualJob:"Show one source-bound image layer.",sourceVersionSha256:routeSourceSha256,exactCopy:[],
    compositionCanvas:{contract:"A1NodeCompositionCanvas/v1",width:1920,height:1080,sourceVideoSha256:routeSourceSha256},
    packagingDecision:{contract:"A1ShotPackagingDecision/v1",version:1,shotId:"generic-shot",shotVersionSha256:routeSourceSha256,narrativeRole:"DECORATIVE_PACKAGE",viewerTask:"Read the package image",
      packagingForm:"OBJECT_STAGE",selectionReason:"The source image carries the beat",rejectedAlternative:"A text-only treatment would lose the object",copyStatus:"NO_DESIGNED_COPY",copyBindings:[],
      sourceBindings:[{assetId:"package-image",sha256:routeAssetSha256,materialClass:"ORIGINAL_GENERATED_ASSET",usage:"synthetic route fixture",identityStatus:"VERIFIED",sourceUri:routeSourceUrl,provenanceStatus:"VERIFIED"}],
      composition:{focalTarget:"package-image",hierarchy:"image first",readingOrder:["package-image"]},
      layers:[{id:"package-image-layer",role:"package-image",assetId:"package-image",assetSha256:routeAssetSha256,geometry:{x:0.1,y:0.1,width:0.8,height:0.8},fit:"contain",z:1,opacity:1}],
      effectStack:["SOURCE_PRESERVE"],motionBeats:[],layoutReview:"Image remains legible at output size",handoff:{exitCondition:"Image settles",nextShotRelation:"Cut to the next claim"}},
    tasks:[{module:"media-files",dependencies:[],parameters:{files:[{path:"/tmp/a1-generic-package-image.png",sha256:routeAssetSha256,referenceOnly:false,role:"generated-image",slot:"package-image",kind:"IMAGE",
      materialClass:"ORIGINAL_GENERATED_ASSET",assetId:"package-image",provenance:{status:"VERIFIED",sourceUrl:routeSourceUrl}}]}},{module:"remotion-render",dependencies:[],parameters:{}}]}]};
const routeWorkspace=compileShotTaskWorkspaceV1(routePlan),routeShot=routeWorkspace.production.shotIntelligence.currentStoryboardAuthority.shots[0];
assert.equal(routeShot.packagingDecision.status,"READY_FOR_REVIEW");
assert.equal(routeShot.packagingDecision.layers[0].producer.nodeId,"generic-shot:media-files","producer is derived from the exact asset id and SHA");
assert.deepEqual(routeShot.nodeWorkflow.moduleDependencies["layer-compositor"],["media-files"]);
assert.ok(routeShot.nodeWorkflow.modules["layer-compositor"]===true,"complete image decisions derive the compositor route");
assert.ok(routeShot.nodeWorkflow.moduleDependencies["remotion-render"].includes("layer-compositor"),"an already declared renderer waits on derived composition");
const routeWorkflowInput=nodeWorkflowInput(routeWorkspace),routeWorkflow=compileNodeWorkflow(routeWorkflowInput,null,{moduleDefinitions:installedPackagingDefinitions});
const routeComposite=routeWorkflow.nodes.find(node=>node.id==="generic-shot:layer-compositor");
assert.equal(routeComposite.input.need,true);assert.equal(routeComposite.input.parameters.compositionIntent.layers[0].dependencyNodeId,"generic-shot:media-files");
assert.equal(installedRegistry.registry["hypit-render"].available,true,"Hypit is registered as an optional execution adapter in the incumbent DAG");
const hypitRoutePlan=structuredClone(routePlan);
hypitRoutePlan.shots[0].tasks=hypitRoutePlan.shots[0].tasks.map(task=>task.module==="remotion-render"?{...task,module:"hypit-render"}:task);
const hypitRouteWorkspace=compileShotTaskWorkspaceV1(hypitRoutePlan),hypitRouteShot=hypitRouteWorkspace.production.shotIntelligence.currentStoryboardAuthority.shots[0];
assert.ok(hypitRouteShot.nodeWorkflow.modules["hypit-render"]===true,"a ready A1 packaging decision can select Hypit through the same shot task graph");
assert.equal(hypitRouteShot.nodeWorkflow.modules["layer-compositor"],undefined,"Hypit composes its project instead of creating a competing A1 compositor task");
assert.ok(hypitRouteShot.nodeWorkflow.moduleDependencies["hypit-render"].includes("media-files"),"Hypit waits for A1's source-bound asset producer");
assert.equal(compileNodeWorkflow(nodeWorkflowInput(hypitRouteWorkspace),null,{moduleDefinitions:installedPackagingDefinitions}).nodes.find(node=>node.id==="generic-shot:hypit-render").input.need,true);
const duplicateRendererPlan=structuredClone(routePlan);
duplicateRendererPlan.shots[0].tasks.push({module:"hypit-render",dependencies:[],parameters:{request:{contract:"A1HypitRenderRequest/v1"}}});
assert.throws(()=>compileShotTaskWorkspaceV1(duplicateRendererPlan),/one-primary-renderer-per-shot/u,
  "one shot cannot fan out to both Remotion and Hypit as primary renderers");
const alphaBoundaryPlan=structuredClone(routePlan);
alphaBoundaryPlan.shots[0].tasks=alphaBoundaryPlan.shots[0].tasks.map(task=>task.module==="remotion-render"
  ?{...task,module:"hypit-render",parameters:{request:{contract:"A1HypitRenderRequest/v1",alphaRequired:true}}}:task);
assert.equal(compileShotTaskWorkspaceV1(alphaBoundaryPlan).production.shotIntelligence.currentStoryboardAuthority.shots[0]
  .nodeWorkflow.modules["hypit-render"],true,"the review-only Hypit adapter may be selected only after the ordinary A1 package decision is ready");
const hypitGate = await installedRegistry.registry["hypit-render"].execute({input:{parameters:{request:{contract:"A1HypitRenderRequest/v1",reviewOnly:false,
  productionAdmission:true,alphaRequired:true}}}},{artifactRoot:"/tmp"});
assert.equal(hypitGate.state,"blocked");
assert.equal(hypitGate.reason,"HYPIT_RENDER_REVIEW_ALPHA_REQUEST_REQUIRED");
const hypitWithoutDecision=compileNodeWorkflow({projectId:"hypit-packaging-gate",workspaceSha256:"e".repeat(64),shots:[{
  id:"P24",source:"P24 research shot",exactCopy:["顶级工人团队","没有传送带"],modules:{"hypit-render":true},
  moduleInputs:{"hypit-render":{request:{contract:"A1HypitRenderRequest/v1",reviewOnly:true,productionAdmission:false,alphaRequired:true}}},
}]},null,{moduleDefinitions:installedPackagingDefinitions});
const hypitBlockedNode=hypitWithoutDecision.nodes.find(node=>node.id==="P24:hypit-render");
assert.equal(hypitBlockedNode.state,"blocked");
assert.equal(hypitBlockedNode.reason,"PACKAGING_DECISION_REQUIRED");
assert.equal(claimNodeTasks(hypitWithoutDecision,{workerId:"hypit-no-decision"}).claims.length,0,
  "Hypit cannot build while the current A1 shot lacks a valid packaging decision");
const routedCoverage=projectShotTaskCapabilityCoverageV1(routePlan,routeWorkflow,installedPackagingDefinitions);
assert.equal(routedCoverage.modules.find(module=>module.id==="layer-compositor").selectedShots,1,"coverage counts derived runtime nodes, not only predeclared plan tasks");
const sharedWorkOrderFile={assetId:"shared-source-card",sha256:"d".repeat(64),path:"work/shared-source-card.png",kind:"IMAGE",role:"verified-evidence",slot:"source-card",referenceOnly:false,provenance:{status:"VERIFIED",sourceUrl:"https://example.org/source"}};
const sharedWorkOrderFont={id:"font-sha-bound",sha256:"e".repeat(64),path:"fonts/source.otf"};
const sharedWorkOrderGeneration={purpose:"conceptual-illustration",prompt:"generic mechanism illustration"};
const materialWorkOrderPlan={contract:"A1ShotTaskPlan/v1",scope:"RESEARCH_ONLY",productionAdmission:false,projectId:"material-work-order-test",shots:[
  {id:"work-shot-1",sourceText:"The process changes",visualJob:"explain the process",exactCopy:["流程变化"],tasks:[
    {module:"media-files",dependencies:[],parameters:{files:[sharedWorkOrderFile]}},
    {module:"image-generation",dependencies:[],parameters:{generationRequest:sharedWorkOrderGeneration}},
    {module:"editable-typography",dependencies:[],parameters:{exactCopy:["流程变化"],fontBindings:[sharedWorkOrderFont]}}]},
  {id:"work-shot-2",sourceText:"The process changes",visualJob:"explain the process",exactCopy:["流程变化"],tasks:[
    {module:"media-files",dependencies:[],parameters:{files:[sharedWorkOrderFile]}},
    {module:"image-generation",dependencies:[],parameters:{generationRequest:sharedWorkOrderGeneration}},
    {module:"editable-typography",dependencies:[],parameters:{exactCopy:["流程变化"],fontBindings:[sharedWorkOrderFont]}}]},
  {id:"work-shot-3",sourceText:"A source is missing",visualJob:"show the missing source",exactCopy:[],tasks:[
    {module:"media-files",dependencies:[],blocker:"SOURCE_IDENTITY_REQUIRED",parameters:{files:[]}}]}]};
const materialWorkOrder=projectShotTaskMaterialWorkOrderV1(materialWorkOrderPlan,{nodes:[
  {id:"work-shot-1:media-files",state:"succeeded"},{id:"work-shot-2:media-files",state:"succeeded"},
  {id:"work-shot-1:image-generation",state:"queued"},{id:"work-shot-2:image-generation",state:"queued"},
  {id:"work-shot-1:editable-typography",state:"queued"},{id:"work-shot-2:editable-typography",state:"queued"},
  {id:"work-shot-3:media-files",state:"blocked",reason:"SOURCE_IDENTITY_REQUIRED"},
  {id:"work-shot-1:layer-compositor",shotId:"work-shot-1",module:"layer-compositor",state:"blocked",reason:"PACKAGING_DECISION_BLOCKED"}]});
assert.equal(materialWorkOrder.contract,"A1ShotTaskMaterialWorkOrder/v1");
assert.equal(materialWorkOrder.summary.uniqueSourceFileCount,1,"shared asset id plus content SHA becomes one source requirement");
assert.equal(materialWorkOrder.requirements.find(item=>item.route==="source-file").shotCount,2,"the unique asset keeps both consuming shots");
assert.equal(materialWorkOrder.summary.imageGenerationJobCount,1,"identical generation requests batch as one reusable requirement");
assert.equal(materialWorkOrder.summary.imageGenerationTaskCount,2,"work-order counts keep shot execution tasks distinct from deduplicated generation requests");
assert.equal(materialWorkOrder.summary.generatedImageRequirementCount,1,"an identical prompt is one unique generated material requirement");
assert.equal(materialWorkOrder.summary.fontRequirementCount,1,"shared font binary is counted once across shot layouts");
assert.equal(materialWorkOrder.summary.runtimeDerivedWorkItemCount,1,"decision-derived compositor nodes appear in the same work order as declared tasks");
assert.equal(materialWorkOrder.summary.derivedMaterialWorkItemsMissingRequirementCount,1,"derived design nodes without a material binding are visibly incomplete");
assert.equal(materialWorkOrder.summary.mediaTasksWithoutFileCount,1,"an empty media-files node is shown as an unbound task, not a download");
assert.equal(materialWorkOrder.summary.sourceIdentityOrCopyReviewCount,1,"a source identity blocker is classified separately from a generic missing file");
assert.equal(materialWorkOrder.unresolvedMediaBindings[0].blocker,"SOURCE_IDENTITY_REQUIRED");
assert.equal(materialWorkOrder.status,"WORK_ORDER_INCOMPLETE");
assert.equal(materialWorkOrder.boundaries.productionAdmission,false);
const sequencePlan=structuredClone(routePlan);sequencePlan.sequenceAssembly={contract:"A1SequenceAssemblyRequest/v1",required:true,reviewOnly:true,shotIds:["generic-shot"],
  width:1920,height:1080,fpsNumerator:60,fpsDenominator:1,audioMode:"SILENT_REVIEW",maxDurationMs:60_000};
const sequenceWorkspace=compileShotTaskWorkspaceV1(sequencePlan),sequenceInput=nodeWorkflowInput(sequenceWorkspace);
const sequenceWorkflow=compileNodeWorkflow(sequenceInput,null,{moduleDefinitions:installedPackagingDefinitions});
const sequenceNodeId="sequence-assembly:sequence-assembly",sequenceNode=sequenceWorkflow.nodes.find(node=>node.id===sequenceNodeId);
assert.equal(sequenceNode.input.need,true);assert.deepEqual(sequenceNode.dependencies,["generic-shot:remotion-render"]);
assert.equal(sequenceNode.input.parameters.segments[0].orderIndex,0);assert.equal(sequenceNode.input.parameters.audioMode,"SILENT_REVIEW");
const noRenderPlan=structuredClone(sequencePlan);noRenderPlan.shots[0].tasks=noRenderPlan.shots[0].tasks.filter(task=>task.module!=="remotion-render");
const noRenderWorkspace=compileShotTaskWorkspaceV1(noRenderPlan),noRenderWorkflow=compileNodeWorkflow(nodeWorkflowInput(noRenderWorkspace),null,{moduleDefinitions:installedPackagingDefinitions});
const noRenderSequence=noRenderWorkflow.nodes.find(node=>node.id===sequenceNodeId);
assert.equal(noRenderSequence.input.need,"unknown");assert.equal(noRenderSequence.input.parameters.routingBlocker,"SEQUENCE_RENDER_ROUTES_MISSING");
const reviewedSequenceInputs=structuredClone(sequenceWorkflow),renderNode=reviewedSequenceInputs.nodes.find(node=>node.id==="generic-shot:remotion-render");
renderNode.visualReview={status:"PASS",reviewerId:"synthetic-reviewer",inputSha256:renderNode.inputSha256,reviewedArtifactSha256:["c".repeat(64)],findings:[],reviewedAt:"2026-09-29T00:00:00.000Z",productionAdmission:false};
const reviewBoundSequenceWorkflow=compileNodeWorkflow(sequenceInput,reviewedSequenceInputs,{moduleDefinitions:installedPackagingDefinitions});
assert.notEqual(reviewBoundSequenceWorkflow.nodes.find(node=>node.id===sequenceNodeId).inputSha256,sequenceNode.inputSha256,
  "sequence assembly cache identity changes only when an input segment receives a bound independent visual review");
for (const moduleId of ["ai-video", "recording", "cap-export"]) {
  const module = capabilityCoverage.modules.find((item) => item.id === moduleId);
  assert.equal(module.decision, "DEFERRED");
  assert.ok(module.reason, `${moduleId} needs a visible deferral reason`);
}
assert.deepEqual(capabilityCoverage.routeGaps, []);
const unreviewedPlan={contract:'A1ShotTaskPlan/v1',projectId:'unreviewed-module-fixture',scope:'RESEARCH_ONLY',productionAdmission:false,
  shots:[{id:'one',sourceText:'Source remains unchanged',visualJob:'Preserve the source',tasks:[{module:'media-files',dependencies:[],parameters:{files:[]}}]}]};
const unreviewedCoverage=projectShotTaskCapabilityCoverageV1(unreviewedPlan,null,installedPackagingDefinitions);
assert.ok(unreviewedCoverage.unreviewedModules.includes('asset-treatment'),'an installed but unselected/undeclared module stays visibly unreviewed');
const deferredPlan=structuredClone(unreviewedPlan);deferredPlan.capabilityDecisions={'asset-treatment':{disposition:'DEFERRED',reason:'This fixture does not require pixel treatment'}};
assert.ok(!projectShotTaskCapabilityCoverageV1(deferredPlan,null,installedPackagingDefinitions).unreviewedModules.includes('asset-treatment'),
  'only an explicit disposition resolves the module review requirement');
const aiVideoPreflightInput = {projectId: "ai-video-registry-preflight", workspaceSha256: "d".repeat(64),
  shots: [{id: "ai-video-smoke", source: "adapter registration preflight", exactCopy: [],
    modules: {"ai-video": true}, moduleInputs: {"ai-video": {submitAuthorized: false}}}]};
const aiVideoPreflightWorkflow = compileNodeWorkflow(aiVideoPreflightInput, null,
  {moduleDefinitions: installedPackagingDefinitions});
const aiVideoPreflightNow = Date.now();
const aiVideoPreflightClaims = claimNodeTasks(aiVideoPreflightWorkflow,
  {workerId: "ai-video-no-submit-preflight", now: aiVideoPreflightNow});
const aiVideoPreflightClaim = aiVideoPreflightClaims.claims[0];
assert.ok(aiVideoPreflightClaim, "the current default registry should route an AI-video node to the installed adapter");
const aiVideoPreflightResult = await executeRegisteredNode(aiVideoPreflightClaims.workflow,
  aiVideoPreflightClaim, {registry: installedRegistry.registry, now: aiVideoPreflightNow});
assert.equal(aiVideoPreflightResult.state, "blocked");
assert.equal(aiVideoPreflightResult.reason, "REMOTE_SUBMIT_AUTHORIZATION_REQUIRED");
assert.equal(aiVideoPreflightResult.productionAdmission, false);
const packagingDefinitions = {
  "media-files": {label: "media files", version: 1, available: true, optional: true, copySensitive: false},
  "asset-treatment": {label: "asset treatment", version: 1, available: true, optional: true, copySensitive: false},
  "image-generation": {label: "image generation", version: 1, available: true, optional: true},
  "editable-typography": {label: "editable typography", version: 1, available: true, optional: true},
  "layer-compositor": installedPackagingDefinitions["layer-compositor"],
  "remotion-render": {label: "Remotion render", version: 1, available: true, optional: true},
};
const packagingInput = (packagingDecision, {canvas = null, sourceFiles = null, invalidOverride = false} = {}) => ({
  projectId: "packaging-gate-test", workspaceSha256: "c".repeat(64),
  shots: [{id: "shot", source: "source-bound shot", exactCopy: [], packagingDecision,
    modules: {"media-files": Boolean(sourceFiles), "layer-compositor": true, "remotion-render": true},
    moduleDependencies: {"layer-compositor": sourceFiles ? ["media-files"] : [], "remotion-render": ["layer-compositor"]},
    moduleInputs: {"layer-compositor": {
      ...(canvas ? {compositionCanvas: canvas} : {}),
      ...(invalidOverride ? {compositionIntent: {contract: "A1NodeLayerCompositionIntent/v1", width: 1920, height: 1080, layers: [{id: "manual-bypass"}]}} : {}),
    }, ...(sourceFiles ? {"media-files": {files: sourceFiles}} : {})}}],
});
const makePackagingDecision = ({status = "BLOCKED", packagingForm = "SOURCE_DETAIL", selectionReason = "test route", blockers = ["PACKAGING_LAYER_ASSET_NOT_BOUND"], sourceBindings = [], layers = [], sourcePixelPolicy = null, effectStack = [], copyStatus = "NO_DESIGNED_COPY", copyBindings = []} = {}) => {
  const body = {contract: "A1ShotPackagingDecision/v1", version: 1, shotId: "shot", shotVersionSha256: "b".repeat(64),
    narrativeRole: "DECORATIVE_PACKAGE", viewerTask: "inspect one visual unit", packagingForm, selectionReason,
    rejectedAlternative: "generic fallback", copyStatus, copyBindings, sourceBindings,
    sourcePixelPolicy, composition: {focalTarget: "center", hierarchy: "one clear focal point", readingOrder: ["focal"]},
    layers, effectStack, motionBeats: [], handoff: {exitCondition: "hold then cut", nextShotRelation: "continues"},
    layoutReview: "review focal hierarchy", status, blockers};
  return {...body, decisionSha256: nodeInputHash(body)};
};
const blockedDecision = makePackagingDecision();
const missingDecisionWorkflow = compileNodeWorkflow(packagingInput(undefined), null, {moduleDefinitions: packagingDefinitions});
assert.equal(missingDecisionWorkflow.nodes.find((node) => node.module === "layer-compositor").state, "blocked",
  "a manual composition intent cannot bypass the required shot packaging decision");
assert.equal(missingDecisionWorkflow.nodes.find((node) => node.module === "layer-compositor").reason, "PACKAGING_DECISION_REQUIRED");
assert.equal(missingDecisionWorkflow.nodes.find((node) => node.module === "remotion-render").state, "blocked",
  "a direct render route also requires the shot packaging decision");
assert.equal(missingDecisionWorkflow.nodes.find((node) => node.module === "remotion-render").reason, "PACKAGING_DECISION_REQUIRED");
assert.equal(claimNodeTasks(missingDecisionWorkflow, {workerId: "packager"}).claims.length, 0);
const explicitSkipInput = packagingInput(undefined);
explicitSkipInput.shots[0].modules["layer-compositor"] = false;
explicitSkipInput.shots[0].modules["remotion-render"] = false;
const explicitSkipWorkflow = compileNodeWorkflow(explicitSkipInput, null, {moduleDefinitions: packagingDefinitions});
assert.ok(explicitSkipWorkflow.nodes.every((node) => node.state === "skipped" && node.reason === "NOT_REQUIRED"),
  "an explicit SKIP route does not become a blocker just because no package decision is needed");
const blockedDecisionWorkflow = compileNodeWorkflow(packagingInput(blockedDecision), null, {moduleDefinitions: packagingDefinitions});
assert.equal(blockedDecisionWorkflow.nodes.find((node) => node.module === "layer-compositor").state, "blocked");
assert.equal(blockedDecisionWorkflow.nodes.find((node) => node.module === "layer-compositor").reason, "PACKAGING_DECISION_BLOCKED");
assert.equal(blockedDecisionWorkflow.nodes.find((node) => node.module === "remotion-render").state, "blocked");
const noPackageDecision = makePackagingDecision({status: "READY_FOR_REVIEW", blockers: [], packagingForm: "NO_PACKAGE"});
const noPackageWorkflow = compileNodeWorkflow(packagingInput(noPackageDecision), null, {moduleDefinitions: packagingDefinitions});
assert.ok(noPackageWorkflow.nodes.every((node) => node.state === "skipped" && node.reason === "NOT_REQUIRED"));
const tamperedDecision = {...blockedDecision, status: "READY_FOR_REVIEW", blockers: []};
const tamperedWorkflow = compileNodeWorkflow(packagingInput(tamperedDecision), null, {moduleDefinitions: packagingDefinitions});
assert.equal(tamperedWorkflow.nodes.find((node) => node.module === "layer-compositor").reason, "PACKAGING_DECISION_INVALID",
  "a changed decision with a stale digest cannot unlock composition");
const readyDecision = makePackagingDecision({status: "READY_FOR_REVIEW", blockers: [], packagingForm: "SOURCE_DETAIL"});
const readyWorkflow = compileNodeWorkflow(packagingInput(readyDecision), null, {moduleDefinitions: packagingDefinitions});
const changedReadyDecision = makePackagingDecision({status: "READY_FOR_REVIEW", blockers: [], packagingForm: "SOURCE_DETAIL", selectionReason: "changed route"});
const changedDecisionWorkflow = compileNodeWorkflow(packagingInput(changedReadyDecision), readyWorkflow, {moduleDefinitions: packagingDefinitions});
assert.deepEqual(changedDecisionWorkflow.nodes.filter((node, index) => node.inputSha256 !== readyWorkflow.nodes[index].inputSha256)
  .map((node) => node.module), ["layer-compositor", "remotion-render"],
  "decision changes invalidate composition and downstream render fingerprints");
const sourceAssetSha = "a".repeat(64);
const sourceAsset = {assetId: "source-table", sha256: sourceAssetSha, materialClass: "VERIFIED_PAPER",
  identityStatus: "VERIFIED", provenanceStatus: "VERIFIED", sourceUri: "https://example.test/spec.pdf", usage: "preserved evidence"};
const decisionLayer = {id: "source-table-panel", role: "verified-table", assetId: sourceAsset.assetId,
  assetSha256: sourceAssetSha, z: 0, geometry: {x: 0.1, y: 0.1, width: 0.8, height: 0.8}, fit: "contain", opacity: 1,
  producer: {nodeId: "shot:media-files", artifactRole: "spec-table", artifactKind: "IMAGE",
    sourceAssetId: sourceAsset.assetId, sourceAssetSha256: sourceAssetSha}};
const compositionDecision = makePackagingDecision({status: "READY_FOR_REVIEW", blockers: [], packagingForm: "SOURCE_DETAIL",
  sourceBindings: [sourceAsset], layers: [decisionLayer], sourcePixelPolicy: "PRESERVE", effectStack: ["SOURCE_PRESERVE"]});
const compiledComposition = compileNodeWorkflow(packagingInput(compositionDecision, {
  canvas: {contract: "A1NodeCompositionCanvas/v1", width: 1920, height: 1080, sourceVideoSha256: "b".repeat(64)},
  sourceFiles: [{assetId: sourceAsset.assetId, slot: "spec-table", kind: "IMAGE", sha256: sourceAssetSha}],
}), null, {moduleDefinitions: packagingDefinitions});
const compiledCompositeNode = compiledComposition.nodes.find((node) => node.module === "layer-compositor");
const unsafeOverride = compileNodeWorkflow(packagingInput(compositionDecision, {
  canvas: {contract: "A1NodeCompositionCanvas/v1", width: 1920, height: 1080, sourceVideoSha256: "b".repeat(64)},
  sourceFiles: [{assetId: sourceAsset.assetId, slot: "spec-table", kind: "IMAGE", sha256: sourceAssetSha}], invalidOverride: true,
}), null, {moduleDefinitions: packagingDefinitions});
assert.equal(unsafeOverride.nodes.find(node=>node.module==='layer-compositor').state,'blocked',
  'an invalid placement override remains blocked rather than being silently promoted or rewritten');
assert.deepEqual(compiledCompositeNode.input.parameters.compositionIntent, {
  contract: "A1NodeLayerCompositionIntent/v1", width: 1920, height: 1080,
  layers: [{id: decisionLayer.id, dependencyNodeId: "shot:media-files", artifactRole: "spec-table", artifactKind: "IMAGE",
    geometry: decisionLayer.geometry, sourceRect: undefined, fit: "contain", z: 0, opacity: 1}],
}, "READY decisions compile the declared source and geometry into an accepted-role intent");
assert.ok(!compiledCompositeNode.input.parameters.compositionIntent.layers[0].artifactPath,
  "compilation leaves path and SHA binding to the accepted dependency resolver");
const compositionTemp = fs.mkdtempSync(path.join(os.tmpdir(), "a1-packaging-compiler-"));
fs.mkdirSync(path.join(compositionTemp, "source"), {recursive: true});
const sourceImagePath = path.join(compositionTemp, "source", "verified-source.png");
const sourceImageBytes = await sharp({create: {width: 64, height: 64, channels: 4, background: {r: 35, g: 85, b: 130, alpha: 1}}}).png().toBuffer();
fs.writeFileSync(sourceImagePath, sourceImageBytes);
const acceptedSource = {state: "succeeded", manifestSha256: "9".repeat(64), artifacts: [{path: "source/verified-source.png",
  absolutePath: sourceImagePath, role: "spec-table", kind: "IMAGE", sha256: createHash("sha256").update(sourceImageBytes).digest("hex"),
  bytes: sourceImageBytes.length}]};
const composedResult = await executeLayerCompositeNode(compiledCompositeNode, {artifactRoot: path.join(compositionTemp, "outputs"),
  dependencies: {"shot:media-files": acceptedSource}});
assert.equal(composedResult.state, "needs-review",
  `the compiled decision flows through accepted-role resolution to a real compositor artifact: ${JSON.stringify(composedResult)}`);
assert.equal(composedResult.visualApproval, "NOT_GRANTED");
assert.equal(composedResult.productionAdmission, false);
assert.deepEqual(composedResult.artifactManifest.artifacts.map((artifact) => artifact.role),
  ["transparent-layer-preview", "layer-composition-plan"]);
const previewArtifact = composedResult.artifactManifest.artifacts[0];
const previewBytes = fs.readFileSync(path.join(compositionTemp, "outputs", previewArtifact.path));
assert.equal(createHash("sha256").update(previewBytes).digest("hex"), previewArtifact.sha256);
assert.deepEqual(await sharp(previewBytes).metadata().then(({width, height, format}) => ({width, height, format})),
  {width: 1920, height: 1080, format: "png"});
fs.rmSync(compositionTemp, {recursive: true, force: true});
const treatmentDecisionLayer = {...decisionLayer, producer: {...decisionLayer.producer, nodeId: "shot:asset-treatment", artifactRole: "clean-master"}};
const treatmentDecision = makePackagingDecision({status: "READY_FOR_REVIEW", blockers: [], packagingForm: "SOURCE_DETAIL",
  sourceBindings: [sourceAsset], layers: [treatmentDecisionLayer], sourcePixelPolicy: "PRESERVE", effectStack: ["SOURCE_PRESERVE"]});
const treatmentInput = packagingInput(treatmentDecision, {
  canvas: {contract: "A1NodeCompositionCanvas/v1", width: 1920, height: 1080, sourceVideoSha256: "b".repeat(64)},
  sourceFiles: [{assetId: sourceAsset.assetId, slot: "spec-table", kind: "IMAGE", sha256: sourceAssetSha,
    provenance: {sourceUrl: sourceAsset.sourceUri}}],
});
treatmentInput.shots[0].modules["asset-treatment"] = true;
treatmentInput.shots[0].moduleDependencies["asset-treatment"] = ["media-files"];
treatmentInput.shots[0].moduleDependencies["layer-compositor"] = ["asset-treatment"];
treatmentInput.shots[0].moduleInputs["asset-treatment"] = {sourceNodeId: "shot:media-files", sourceArtifactRole: "spec-table",
  sourceBinding: {sha256: sourceAssetSha, sourceUri: sourceAsset.sourceUri, provenanceStatus: "VERIFIED"}};
const treatmentWorkflow = compileNodeWorkflow(treatmentInput, null, {moduleDefinitions: packagingDefinitions});
assert.equal(treatmentWorkflow.nodes.find((node) => node.module === "layer-compositor").state, "queued",
  "a declared treatment producer must be downstream of the exact bound source");
assert.equal(treatmentWorkflow.nodes.find((node) => node.module === "layer-compositor").input.parameters.compositionIntent.layers[0].dependencyNodeId,
  "shot:asset-treatment");
const generatedAsset = {...sourceAsset, assetId: "generated-cutout", materialClass: "ORIGINAL_GENERATED_ASSET"};
const crossShotLayer = {...decisionLayer, assetId: generatedAsset.assetId, assetSha256: generatedAsset.sha256,
  producer: {nodeId: "source:image-generation", artifactRole: "generic-accelerator-cutout", artifactKind: "IMAGE",
    sourceAssetId: generatedAsset.assetId, sourceAssetSha256: generatedAsset.sha256}};
const crossShotDecision = makePackagingDecision({status: "READY_FOR_REVIEW", blockers: [], packagingForm: "OBJECT_STAGE",
  sourceBindings: [generatedAsset], layers: [crossShotLayer], sourcePixelPolicy: "PRESERVE", effectStack: ["SOURCE_PRESERVE"]});
const crossShotPackagingInput = {projectId: "cross-shot-packaging-test", workspaceSha256: "c".repeat(64), shots: [
  {id: "source", source: "accepted illustration producer", modules: {"image-generation": true}},
  {id: "shot", source: "source-bound shot", exactCopy: [], packagingDecision: crossShotDecision,
    modules: {"layer-compositor": true, "remotion-render": true},
    moduleDependencies: {"layer-compositor": [], "remotion-render": ["layer-compositor"]},
    moduleNodeDependencies: {"layer-compositor": [{nodeId: "source:image-generation", artifactKinds: ["IMAGE"]}]},
    moduleInputs: {"layer-compositor": {compositionCanvas: {contract: "A1NodeCompositionCanvas/v1", width: 1920,
      height: 1080, sourceVideoSha256: "b".repeat(64)}}}},
]};
const crossShotPackagingWorkflow = compileNodeWorkflow(crossShotPackagingInput, null, {moduleDefinitions: packagingDefinitions});
const crossShotComposite = crossShotPackagingWorkflow.nodes.find((node) => node.id === "shot:layer-compositor");
assert.deepEqual(crossShotComposite.dependencies, ["source:image-generation"]);
assert.equal(crossShotComposite.input.parameters.compositionIntent.layers[0].dependencyNodeId, "source:image-generation",
  "cross-shot generated sources compile only through a declared DAG edge and accepted role");
const noCanvas = compileNodeWorkflow(packagingInput(compositionDecision, {sourceFiles: [{assetId: sourceAsset.assetId, slot: "spec-table", kind: "IMAGE", sha256: sourceAssetSha}]}), null,
  {moduleDefinitions: packagingDefinitions});
assert.equal(noCanvas.nodes.find((node) => node.module === "layer-compositor").reason, "PACKAGING_COMPOSITION_INTENT_INCOMPLETE");
assert.equal(noCanvas.nodes.find((node) => node.module === "remotion-render").reason, "PACKAGING_COMPOSITION_INTENT_INCOMPLETE");
const undeclaredProducerDecision = makePackagingDecision({status: "READY_FOR_REVIEW", blockers: [], packagingForm: "SOURCE_DETAIL",
  sourceBindings: [sourceAsset], layers: [{...decisionLayer, producer: {...decisionLayer.producer, nodeId: "elsewhere:media-files"}}],
  sourcePixelPolicy: "PRESERVE", effectStack: ["SOURCE_PRESERVE"]});
const undeclaredProducer = compileNodeWorkflow(packagingInput(undeclaredProducerDecision, {
  canvas: {contract: "A1NodeCompositionCanvas/v1", width: 1920, height: 1080, sourceVideoSha256: "b".repeat(64)},
  sourceFiles: [{assetId: sourceAsset.assetId, slot: "spec-table", kind: "IMAGE", sha256: sourceAssetSha}],
}), null, {moduleDefinitions: packagingDefinitions});
assert.equal(undeclaredProducer.nodes.find((node) => node.module === "layer-compositor").reason, "PACKAGING_COMPOSITION_INTENT_INCOMPLETE");
const renderBypassInput = packagingInput(compositionDecision, {
  canvas: {contract: "A1NodeCompositionCanvas/v1", width: 1920, height: 1080, sourceVideoSha256: "b".repeat(64)},
  sourceFiles: [{assetId: sourceAsset.assetId, slot: "spec-table", kind: "IMAGE", sha256: sourceAssetSha}],
});
renderBypassInput.shots[0].modules["layer-compositor"] = false;
const renderBypass = compileNodeWorkflow(renderBypassInput, null, {moduleDefinitions: packagingDefinitions});
assert.equal(renderBypass.nodes.find((node) => node.module === "remotion-render").reason, "PACKAGING_RENDER_ROUTE_INCOMPLETE",
  "Remotion cannot silently omit a declared visual layer route");
const copyDecision = makePackagingDecision({status: "READY_FOR_REVIEW", blockers: [], packagingForm: "SOURCE_DETAIL",
  sourceBindings: [sourceAsset], layers: [decisionLayer], sourcePixelPolicy: "PRESERVE", effectStack: ["SOURCE_PRESERVE"],
  copyStatus: "LOCKED", copyBindings: [{copyIndex: 0, text: "Bandwidth", status: "LOCKED", sourceVideoSha256: "b".repeat(64), frameNumber: 42}]});
const copyRouteInput = packagingInput(copyDecision, {
  canvas: {contract: "A1NodeCompositionCanvas/v1", width: 1920, height: 1080, sourceVideoSha256: "b".repeat(64)},
  sourceFiles: [{assetId: sourceAsset.assetId, slot: "spec-table", kind: "IMAGE", sha256: sourceAssetSha}],
});
copyRouteInput.shots[0].exactCopy = ["Bandwidth"];
const missingTypographyRoute = compileNodeWorkflow(copyRouteInput, null, {moduleDefinitions: packagingDefinitions});
assert.equal(missingTypographyRoute.nodes.find((node) => node.module === "remotion-render").reason, "PACKAGING_RENDER_ROUTE_INCOMPLETE",
  "Remotion cannot omit a declared exact-copy typography route");

const crossShotDefinitions = {
  "video-source": {label: "synthetic source", version: 1, available: true, optional: true},
  "frame-review-plan": {label: "synthetic frame plan", version: 1, available: true, optional: true},
  "ffmpeg-frame-extractor": {label: "synthetic frame extractor", version: 1, available: true, optional: true},
};
const crossShotProjectId = "cross-shot-workflow-test";
const crossShotWorkspaceSha256 = "d".repeat(64);
const upstreamInput = {
  projectId: crossShotProjectId,
  workspaceSha256: crossShotWorkspaceSha256,
  shots: [
    {id: "shared-source", source: "verified source video", modules: {"video-source": true}},
    {id: "batch-1", source: "first independent batch plan", modules: {"frame-review-plan": true}},
    {id: "batch-2", source: "second independent batch plan", modules: {"frame-review-plan": true}},
  ],
};

function makeAcceptedExternalNode(workflow, nodeId, {kind, sha256, path: artifactPath} = {}) {
  const node = workflow.nodes.find((item) => item.id === nodeId);
  assert.ok(node, `test source node ${nodeId} exists`);
  const artifact = {
    path: artifactPath || `${nodeId.replace(/[^A-Za-z0-9._-]/gu, "_")}.bin`,
    role: `accepted-${node.module}`,
    kind,
    sha256,
    bytes: 128,
    metadata: {syntheticAcceptance: true},
  };
  node.state = "succeeded";
  node.reason = "REVIEW_ARTIFACTS_TECHNICALLY_VERIFIED";
  node.result = {
    state: "needs-review",
    productionAdmission: false,
    artifactManifest: {
      contract: NODE_ARTIFACT_MANIFEST_CONTRACT,
      nodeId: node.id,
      inputSha256: node.inputSha256,
      productionAdmission: false,
      artifacts: [{path: artifact.path, role: artifact.role, kind: artifact.kind, sha256: artifact.sha256, bytes: artifact.bytes}],
    },
  };
  const receiptBody = {nodeId: node.id, inputSha256: node.inputSha256, artifacts: [artifact], productionAdmission: false};
  node.acceptance = {
    contract: "A1NodeArtifactAcceptance/v1",
    artifactRoot: "/synthetic/accepted-artifacts",
    ...receiptBody,
    manifestSha256: nodeInputHash(receiptBody),
    sourceResultSha256: nodeInputHash(node.result),
    reviewerId: "synthetic-test",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    verificationScope: "BYTES_AND_FORMAT_ONLY",
    visualApproval: "NOT_GRANTED",
    productionAdmission: false,
  };
  return node;
}

function makeAcceptedUpstreamWorkflow() {
  const workflow = compileNodeWorkflow(upstreamInput, null, {moduleDefinitions: crossShotDefinitions});
  makeAcceptedExternalNode(workflow, "shared-source:video-source", {kind: "VIDEO", sha256: "1".repeat(64)});
  makeAcceptedExternalNode(workflow, "batch-1:frame-review-plan", {kind: "JSON_PLAN", sha256: "2".repeat(64)});
  makeAcceptedExternalNode(workflow, "batch-2:frame-review-plan", {kind: "JSON_PLAN", sha256: "3".repeat(64)});
  return workflow;
}

function makeCrossShotConsumerInput(overrides = {}) {
  const externalBindings = (batchNumber) => [
    {nodeId: "shared-source:video-source", artifactKinds: ["VIDEO"]},
    {nodeId: `batch-${batchNumber}:frame-review-plan`, artifactKinds: ["JSON_PLAN"]},
  ];
  return {
    projectId: crossShotProjectId,
    workspaceSha256: crossShotWorkspaceSha256,
    shots: [1, 2].map((batchNumber) => ({
      id: `batch-${batchNumber}`,
      source: `batch ${batchNumber} selected frames`,
      modules: {"ffmpeg-frame-extractor": true},
      moduleDependencyBindings: {"ffmpeg-frame-extractor": externalBindings(batchNumber)},
      ...(overrides[batchNumber] || {}),
    })),
  };
}

const acceptedUpstream = makeAcceptedUpstreamWorkflow();
const crossShotInput = makeCrossShotConsumerInput();
const crossShotWorkflow = compileNodeWorkflow(crossShotInput, acceptedUpstream, {moduleDefinitions: crossShotDefinitions});
const batchOneExtractor = crossShotWorkflow.nodes.find((node) => node.id === "batch-1:ffmpeg-frame-extractor");
const batchTwoExtractor = crossShotWorkflow.nodes.find((node) => node.id === "batch-2:ffmpeg-frame-extractor");
assert.ok(batchOneExtractor && batchTwoExtractor);
assert.deepEqual(batchOneExtractor.dependencies, ["shared-source:video-source", "batch-1:frame-review-plan"]);
assert.deepEqual(batchTwoExtractor.dependencies, ["shared-source:video-source", "batch-2:frame-review-plan"]);
assert.deepEqual(batchOneExtractor.dependencyArtifactKinds, {
  "shared-source:video-source": ["VIDEO"],
  "batch-1:frame-review-plan": ["JSON_PLAN"],
});
const sharedSourceNode = acceptedUpstream.nodes.find((node) => node.id === "shared-source:video-source");
const batchOnePlanNode = acceptedUpstream.nodes.find((node) => node.id === "batch-1:frame-review-plan");
assert.equal(batchOneExtractor.inputSha256, nodeInputHash({
  input: batchOneExtractor.input,
  dependencies: {
    inputs: [],
    artifactKinds: {},
    externalBindings: [
      {nodeId: sharedSourceNode.id, inputSha256: sharedSourceNode.inputSha256,
        acceptedManifestSha256: sharedSourceNode.acceptance.manifestSha256, artifactKinds: ["VIDEO"]},
      {nodeId: batchOnePlanNode.id, inputSha256: batchOnePlanNode.inputSha256,
        acceptedManifestSha256: batchOnePlanNode.acceptance.manifestSha256, artifactKinds: ["JSON_PLAN"]},
    ],
  },
}), "child fingerprint binds external node IDs, input SHAs, accepted receipt SHAs, and allowed artifact kinds");
assert.equal(crossShotWorkflow.nodes.filter((node) => node.id === "shared-source:video-source").length, 1,
  "one accepted source node is retained once and shared by both batch children");
assert.ok(crossShotWorkflow.nodes.some((node) => node.id === "batch-1:frame-review-plan"));
assert.ok(crossShotWorkflow.nodes.some((node) => node.id === "batch-2:frame-review-plan"));
assert.deepEqual(nodeDependencyBlockers(crossShotWorkflow, batchOneExtractor), []);
assert.deepEqual(nodeDependencyBlockers(crossShotWorkflow, batchTwoExtractor), []);
const crossShotClaims = claimNodeTasks(crossShotWorkflow, {workerId: "cross-shot-worker", now: 3000});
assert.equal(crossShotClaims.claims.length, 2, "external dependencies do not change the global two-claim cap");

const missingSource = structuredClone(acceptedUpstream);
missingSource.nodes = missingSource.nodes.filter((node) => node.id !== "shared-source:video-source");
assert.throws(() => compileNodeWorkflow(crossShotInput, missingSource, {moduleDefinitions: crossShotDefinitions}), /external-dependency-node-missing/);

for (const state of ["needs-review", "failed", "skipped"]) {
  const notAccepted = structuredClone(acceptedUpstream);
  notAccepted.nodes.find((node) => node.id === "shared-source:video-source").state = state;
  assert.throws(() => compileNodeWorkflow(crossShotInput, notAccepted, {moduleDefinitions: crossShotDefinitions}), /external-dependency-node-not-accepted/);
}

const staleReceipt = structuredClone(acceptedUpstream);
staleReceipt.nodes.find((node) => node.id === "shared-source:video-source").acceptance.inputSha256 = "0".repeat(64);
assert.throws(() => compileNodeWorkflow(crossShotInput, staleReceipt, {moduleDefinitions: crossShotDefinitions}), /external-dependency-receipt-invalid/);
const invalidReceiptSha = structuredClone(acceptedUpstream);
invalidReceiptSha.nodes.find((node) => node.id === "shared-source:video-source").acceptance.manifestSha256 = "0".repeat(64);
assert.throws(() => compileNodeWorkflow(crossShotInput, invalidReceiptSha, {moduleDefinitions: crossShotDefinitions}), /external-dependency-receipt-invalid/);

const wrongArtifactKind = structuredClone(crossShotInput);
wrongArtifactKind.shots[0].moduleDependencyBindings["ffmpeg-frame-extractor"][0].artifactKinds = ["IMAGE"];
assert.throws(() => compileNodeWorkflow(wrongArtifactKind, acceptedUpstream, {moduleDefinitions: crossShotDefinitions}), /external-dependency-artifact-kind-mismatch/);

const changedArtifactKindsInput = structuredClone(crossShotInput);
changedArtifactKindsInput.shots[0].moduleDependencyBindings["ffmpeg-frame-extractor"][0].artifactKinds = ["VIDEO", "ALPHA_VIDEO"];
const changedArtifactKindsWorkflow = compileNodeWorkflow(changedArtifactKindsInput, acceptedUpstream, {moduleDefinitions: crossShotDefinitions});
assert.notEqual(changedArtifactKindsWorkflow.nodes.find((node) => node.id === batchOneExtractor.id).inputSha256,
  batchOneExtractor.inputSha256, "allowed dependency artifact kinds participate in the child input SHA");

const changedExternalIdInput = structuredClone(crossShotInput);
changedExternalIdInput.shots[0].moduleDependencyBindings["ffmpeg-frame-extractor"][1].nodeId = "batch-2:frame-review-plan";
const changedExternalIdWorkflow = compileNodeWorkflow(changedExternalIdInput, acceptedUpstream, {moduleDefinitions: crossShotDefinitions});
assert.notEqual(changedExternalIdWorkflow.nodes.find((node) => node.id === batchOneExtractor.id).inputSha256,
  batchOneExtractor.inputSha256, "external dependency node ID participates in the child input SHA");

const changedBatchOneReceipt = structuredClone(acceptedUpstream);
makeAcceptedExternalNode(changedBatchOneReceipt, "batch-1:frame-review-plan", {kind: "JSON_PLAN", sha256: "4".repeat(64)});
const changedBatchOneWorkflow = compileNodeWorkflow(crossShotInput, changedBatchOneReceipt, {moduleDefinitions: crossShotDefinitions});
assert.notEqual(changedBatchOneWorkflow.nodes.find((node) => node.id === batchOneExtractor.id).inputSha256, batchOneExtractor.inputSha256,
  "an accepted batch-plan manifest receipt change invalidates its child input SHA");
assert.equal(changedBatchOneWorkflow.nodes.find((node) => node.id === batchTwoExtractor.id).inputSha256, batchTwoExtractor.inputSha256,
  "a separate batch receipt change does not invalidate a sibling batch");

const changedSharedReceipt = structuredClone(acceptedUpstream);
makeAcceptedExternalNode(changedSharedReceipt, "shared-source:video-source", {kind: "VIDEO", sha256: "5".repeat(64)});
const changedSharedWorkflow = compileNodeWorkflow(crossShotInput, changedSharedReceipt, {moduleDefinitions: crossShotDefinitions});
for (const childId of [batchOneExtractor.id, batchTwoExtractor.id]) {
  assert.notEqual(changedSharedWorkflow.nodes.find((node) => node.id === childId).inputSha256,
    crossShotWorkflow.nodes.find((node) => node.id === childId).inputSha256,
    "a shared source receipt change invalidates every consumer child");
}

const researchInput = structuredClone(input);
researchInput.shots[0].research = {
  contract: "A1ShotResearchPacket/v1",
  networkDecision: "REQUIRED",
  claimType: "research-claim",
  searchQueries: ["ACL paper lexical syntactic diversity instruction tuned LLM"],
  sources: [{url: "https://aclanthology.org/2026.acl-long.1803/", title: "More Aligned, Less Diverse?"}],
};
const researchWorkflow = compileNodeWorkflow(researchInput);
assert.deepEqual(researchWorkflow.nodes.find((node) => node.id === "shot-1:material").input.shot.research.sources, researchInput.shots[0].research.sources);

const labelOnlyJob = createMaterialJob({id: "label-only", source: "An unrelated sentence", visual: "An unrelated visual"}, {
  slotKind: "single-image", routeOverride: "evidence", preferredQuery: "target query",
});
const labelOnlyRanked = rankMaterialJobCandidates(labelOnlyJob, [{
  id: "label-only-candidate", label: "target query", title: "Unrelated sensor graph", sourceUrl: "https://example.org/unrelated.jpg",
}]);
assert.equal(labelOnlyRanked.candidates.length, 0);
assert.equal(labelOnlyRanked.rejectedCandidates.length, 1);
assert.equal(labelOnlyRanked.status, "no-suitable-candidate");
assert.equal(labelOnlyJob.filmDecision.status, "not-applicable", "evidence routes cannot recommend film scenes");

const filmReferenceJob = createMaterialJob({
  id: "film-reference-planning",
  role: "atmosphere",
  screenTitle: "mission control countdown pressure",
  source: "A team faces a countdown inside mission control.",
  visual: "Quiet tension around monitors and decision screens.",
  assetNeed: "cinematic atmosphere reference",
}, {slotKind: "single-image", routeOverride: "atmosphere"});
assert.equal(filmReferenceJob.filmDecision.status, "matched");
assert.equal(filmReferenceJob.filmDecision.candidates[0].title, "Apollo 13");
assert.equal(filmReferenceJob.searchPlan.filmReferenceCandidates[0].title, "Apollo 13");
assert.ok(filmReferenceJob.filmDecision.candidates.every((candidate) => candidate.referenceOnly === true && candidate.renderAllowed === false),
  "film suggestions remain reference-only and cannot enter rendering automatically");
assert.equal(filmReferenceJob.gates.renderReady, false);
const factoryFilmJob = createMaterialJob({
  id: "factory-film-reference-planning",
  role: "atmosphere",
  source: "Automation removes repetitive human movement; a worker is replaced on a factory assembly line.",
  visual: "Feel the alienation caused by mechanized repetition.",
}, {slotKind: "single-image", routeOverride: "atmosphere"});
assert.equal(factoryFilmJob.filmDecision.candidates[0].title, "Modern Times");
assert.equal(factoryFilmJob.searchPlan.filmReferenceCandidates[0].title, "Modern Times");
const autoRoutedFactoryJob = createMaterialJob({
  id: "factory-film-auto-route",
  source: "Automation removes repetitive human movement; a worker is replaced on a factory assembly line.",
  visual: "Cinematic atmosphere showing the alienation of repetitive labor.",
}, {slotKind: "single-image"});
assert.equal(autoRoutedFactoryJob.route, "atmosphere", "the word 'replaced' must not be misread as the place cue 'place'");
assert.equal(autoRoutedFactoryJob.filmDecision.candidates[0].title, "Modern Times");
const filmProjectionWorkflow = structuredClone(base);
const materialNode = filmProjectionWorkflow.nodes.find((node) => node.id === "shot-1:material");
materialNode.result = {materialJob: factoryFilmJob, productionAdmission: false};
const filmProjectedNode = summarizeNodeWorkflow(filmProjectionWorkflow).nodes.find((node) => node.id === "shot-1:material");
assert.equal(filmProjectedNode.filmDecision.candidates[0].title, "Modern Times");
assert.equal(filmProjectedNode.filmDecision.candidates[0].renderAllowed, false);
const preRunAtmosphere = compileNodeWorkflow({...input, projectId: "film-reference-preview", shots: [{
  id: "factory-preview", source: "Automation removes repetitive human movement; a worker is replaced on a factory assembly line.",
  visual: "Cinematic atmosphere showing the alienation of repetitive labor.", slotKind: "single-image",
  modules: {material: true},
}]});
const preRunFilmNode = summarizeNodeWorkflow(preRunAtmosphere).nodes.find((node) => node.id === "factory-preview:material");
assert.equal(preRunFilmNode.filmDecision.candidates[0].title, "Modern Times",
  "the shared workbench summary can show film references before invoking the external media search");
assert.equal(preRunFilmNode.filmDecision.boundaries.automaticDownload, false);

let requests = 0;
const payloads = [];
const service = http.createServer((req, res) => {
  let body = ""; req.on("data", (part) => {body += part;});
  req.on("end", () => {
    const payload = JSON.parse(body); requests += 1; payloads.push(payload);
    assert.equal(req.url, "/api/a1-compiled-image-search");
    assert.ok(payload.query); assert.ok(payload.materialSearchPlan);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ok: true, candidates: [{id: "fixture-candidate", title: "Katherine Johnson verifies John Glenn orbital calculations", sourceUrl: "https://www.nasa.gov/katherine-johnson/", imageUrl: "https://www.nasa.gov/test-fixture.jpg", source: "source-page-media", evidenceFields: {selector: "img"}}]}));
  });
});
await new Promise((resolve) => service.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${service.address().port}`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-flow-"));
const appRoot = path.join(temp, "apps/studio-next"), dirs = projectDirs(appRoot);
const fixture = {workspaceSha256: input.workspaceSha256, article: {title: input.context.articleTitle, sourceTextSha256: input.context.articleSha256}, visualBible: {}, directorInput: {projectId: input.projectId},
  production: {generation: {workerStatus: "frozen", automaticDispatchAllowed: false, jobs: []}, shotIntelligence: {
    currentStoryboardAuthority: {contract: "A1CurrentStoryboardAuthority/v1", current: true, shots: input.shots.map((shot) => ({shotId: shot.id, sourceText: shot.source, sourceUrl: shot.sourceUrl, route: "PACKAGE_LOOK_MASTER", packageType: "OVERLAY_PACKAGE", exactCopy: shot.exactCopy}))},
    researchPackets: input.shots.map((shot) => ({shotId: shot.id, sourceText: shot.source, networkDecision: "REQUIRED"})),
  }}};
for (const dir of Object.values(dirs)) {fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify(fixture));}
const beforeWorkspace = fs.readFileSync(path.join(dirs.publicDir, "workspace.json"));
try {
  const svgDefinitions = {
    diagram: {label: "可编辑图解", version: 1, available: true},
    composite: {label: "图层合成", version: 1, available: true, dependencies: ["diagram"], dependencyArtifactKinds: {diagram: ["SVG"]}},
  };
  const svgGraph = compileNodeWorkflow({...input, shots: [{...input.shots[0], id: "svg-shot", modules: {diagram: true, composite: true}}]}, null, {moduleDefinitions: svgDefinitions});
  const diagramNode = svgGraph.nodes.find((node) => node.module === "diagram");
  const compositeNode = svgGraph.nodes.find((node) => node.module === "composite");
  assert.deepEqual(compositeNode.dependencyArtifactKinds[diagramNode.id], ["SVG"]);
  assert.equal(nodeDependencyBlockers(svgGraph, compositeNode)[0].reason, "DEPENDENCY_NOT_READY");
  const svgRoot = path.join(temp, "svg-artifacts");
  fs.mkdirSync(svgRoot, {recursive: true});
  const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><path d="M 10 10 L 20 20" fill="none" stroke="#123456"/></svg>';
  const writeSvgManifest = (contents) => {
    const filename = path.join(svgRoot, "diagram.svg");
    fs.writeFileSync(filename, contents, "utf8");
    const bytes = fs.statSync(filename).size;
    return {contract: NODE_ARTIFACT_MANIFEST_CONTRACT, nodeId: diagramNode.id, inputSha256: diagramNode.inputSha256, productionAdmission: false,
      artifacts: [{kind: "SVG", role: "editable-diagram", path: "diagram.svg", sha256: createHash("sha256").update(contents).digest("hex"), bytes}]};
  };
  diagramNode.state = "needs-review";
  diagramNode.result = {state: "needs-review", productionAdmission: false, artifactManifest: writeSvgManifest(validSvg)};
  const acceptedSvgGraph = await acceptNodeArtifacts(svgGraph, diagramNode.id, {artifactRoot: svgRoot, reviewerId: "node-workflow-test", now: 1000});
  const acceptedDiagram = acceptedSvgGraph.nodes.find((node) => node.id === diagramNode.id);
  assert.equal(acceptedDiagram.state, "succeeded");
  assert.equal(acceptedDiagram.acceptance.artifacts[0].metadata.mimeType, "image/svg+xml");
  assert.equal(acceptedDiagram.acceptance.artifacts[0].metadata.editable, true);
  assert.equal(acceptedDiagram.acceptance.visualApproval, "NOT_GRANTED");
  assert.deepEqual(nodeDependencyBlockers(acceptedSvgGraph, compositeNode), []);
  for (const [contents, expected] of [
    [validSvg.replace("</svg>", "<script>alert(1)</script></svg>"), /active-content-forbidden/],
    [validSvg.replace("<path", '<use href="https://example.com/external.svg#x"/><path'), /external-reference-forbidden/],
    ["<html>not an svg</html>", /document-invalid/],
    [validSvg.replace(' viewBox="0 0 640 360"', ""), /dimensions-invalid/],
  ]) {
    const badManifest = writeSvgManifest(contents);
    await assert.rejects(verifyNodeArtifactManifest(badManifest, {artifactRoot: svgRoot, node: diagramNode}), expected);
  }
  const mismatchedManifest = writeSvgManifest(validSvg);
  mismatchedManifest.artifacts[0].sha256 = "0".repeat(64);
  await assert.rejects(verifyNodeArtifactManifest(mismatchedManifest, {artifactRoot: svgRoot, node: diagramNode}), /sha-mismatch/);

  const missing = await executeMaterialNode(first.claims[0]);
  assert.equal(missing.reason, "SEARCH_SERVICE_NOT_CONFIGURED");
  await assert.rejects(executeMaterialNode(first.claims[0], {origin: "https://example.com"}), /local-service/);
  const result = await executeMaterialNode(first.claims[0], {origin});
  assert.equal(result.state, "needs-review");
  assert.equal(result.materialJob.status, "needs-review");
  assert.equal(result.materialJob.gates.renderReady, false);
  const researchClaim = researchWorkflow.nodes.find((node) => node.id === "shot-1:material");
  const researchResult = await executeMaterialNode(researchClaim, {origin});
  assert.equal(researchResult.materialJob.searchPlan.route, "evidence");
  assert.equal(researchResult.materialJob.searchPlan.searchQueries[0], researchInput.shots[0].research.searchQueries[0]);
  const researchPayload = payloads.at(-1);
  assert.equal(researchPayload.sourceUrl, researchInput.shots[0].research.sources[0].url);
  assert.equal(researchPayload.query, researchInput.shots[0].research.searchQueries[0]);
  assert.equal(researchPayload.materialSearchPlan.route, "evidence");
  await assert.rejects(executeMaterialNode(first.claims[0], {origin, fetchImpl: async () => ({ok: false, status: 503})}), /http-503/);
  await assert.rejects(executeMaterialNode(first.claims[0], {origin, fetchImpl: async () => ({ok: true, json: async () => ({})})}), /invalid-material-search-response/);
  const noMatch = await executeMaterialNode(first.claims[0], {origin, fetchImpl: async () => ({ok: true, json: async () => ({candidates: []})})});
  assert.equal(noMatch.state, "no-match");
  const tick = await runNodeWorkflowTick(appRoot, {workerId: "fixture-worker", origin});
  assert.equal(tick.claimed, 2);
  assert.ok(tick.outcomes.every((outcome) => outcome.state === "needs-review"));
  const saved = readNodeWorkflowState(appRoot);
  assert.equal(saved.nodes.filter((node) => node.state === "needs-review").length, 2);
  assert.deepEqual(fs.readFileSync(path.join(dirs.publicDir, "node-workflow-v1/current.json")), fs.readFileSync(path.join(dirs.artifactDir, "node-workflow-v1/current.json")));
  assert.deepEqual(fs.readFileSync(path.join(dirs.publicDir, "workspace.json")), beforeWorkspace);
  assert.throws(() => persistNodeWorkflowState(appRoot, saved, {expectedRevision: saved.revision, expectedWorkspaceSha256: fixture.workspaceSha256}), /requires-withProjectLock/);
  withProjectLock(appRoot, () => {
    assert.throws(() => persistNodeWorkflowState(appRoot, saved, {expectedRevision: 0, expectedWorkspaceSha256: fixture.workspaceSha256}), /revision-conflict/);
    assert.throws(() => persistNodeWorkflowState(appRoot, saved, {expectedRevision: saved.revision, expectedWorkspaceSha256: "c".repeat(64)}), /workspace-changed/);
    process.env.A1_CHECKPOINT_FAIL_AFTER_TARGETS = "1";
    try {assert.throws(() => persistNodeWorkflowState(appRoot, saved, {expectedRevision: saved.revision, expectedWorkspaceSha256: fixture.workspaceSha256}), /fault-injected/);}
    finally {delete process.env.A1_CHECKPOINT_FAIL_AFTER_TARGETS;}
    assert.deepEqual(readNodeWorkflowState(appRoot), saved);
  });
  await runNodeWorkflowTick(appRoot, {workerId: "after-restart", origin});
  const count = requests, revision = readNodeWorkflowState(appRoot).revision;
  const noop = await runNodeWorkflowTick(appRoot, {workerId: "after-completion", origin});
  assert.equal(noop.claimed, 0); assert.equal(requests, count); assert.equal(readNodeWorkflowState(appRoot).revision, revision);
  assert.equal(readCurrentNodeWorkflow(appRoot).nodes.filter((node) => node.state === "needs-review").length, 3);
  assert.deepEqual(fs.readFileSync(path.join(dirs.publicDir, "workspace.json")), beforeWorkspace);
  console.log(JSON.stringify({status: "PASS", proof: "LOCAL_HTTP_FIXTURE_NOT_LIVE_SEARCH", checks: ["svg-format-and-dimensions", "svg-safety-rejections", "svg-sha-binding", "svg-dependency-artifact-gate", "svg-technical-pass-does-not-grant-visual-approval", "packaging-decision-fail-closed", "decision-to-accepted-role-composition-intent", "same-shot-media-and-asset-treatment-producers", "cross-shot-generated-producer-dependency", "explicit-no-package-and-skip", "remotion-image-and-copy-route-completeness", "Hypit-optional-route-through-A1-DAG", "one-primary-renderer-per-shot", "Hypit-source-producer-and-editable-copy-dependencies", "Hypit-rejects-production-or-non-alpha-request", "Hypit-packaging-decision-required", "decision-derived-compositor-routing", "sequence-assembly-project-node-routing", "sequence-assembly-binds-all-ordered-shot-renders", "visual-review-sha-invalidates-sequence-cache", "stale-decision-digest", "module-readiness", "executable-adapter-coverage-parity", "registered-placeholder-not-counted-as-executor", "deferred-and-non-executable-pipeline-stages-explicit", "ai-video-default-registry-fails-closed-without-submit-authorization", "film-reference-plan-integration-and-render-boundary", "shared-capacity-two", "duplicate-claim", "restart-reuse", "lease-expiry", "retry-budget", "stale-result-rejection", "title-only-invalidation", "material-state-synchronized", "http-error-not-no-match", "cross-shot-shared-source-and-independent-plans", "external-receipt-and-kind-fail-closed", "external-receipt-sha-cache-invalidation", "external-dependency-kind-and-node-id-fingerprint", "cross-shot-concurrency-cap-two", "cas", "checkpoint-rollback", "mirror-parity", "workspace-unchanged"], requests, fixtureInputSha256: nodeInputHash(input)}, null, 2));
} finally {
  await new Promise((resolve) => service.close(resolve));
  fs.rmSync(temp, {recursive: true, force: true});
}
