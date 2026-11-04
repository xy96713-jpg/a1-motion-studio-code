#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {compileNodeWorkflow} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1} from "../apps/studio-next/src/lib/a1-node-director-workflow-mapper-v1.mjs";
import {RETRO_PIXEL_FONT_MANIFEST} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fontRecord = RETRO_PIXEL_FONT_MANIFEST.find((item) => item.assetId === "type-pixel-correction");
const fontBinding = {
  assetId: fontRecord.assetId,
  path: `apps/studio-next/public/a1-editorial-fonts/${fontRecord.file}`,
  sha256: fontRecord.sha256,
};
const canvas = {width: 1280, height: 720};
const moduleDefinitions = {
  material: {label: "外部素材", version: 2, available: true},
  typography: {label: "字体包装", version: 1, available: false, dependencies: ["material", "recording"]},
  recording: {label: "录屏", version: 1, available: false},
  diagram: {label: "可编辑图解", version: 1, available: true, optional: true},
};

function directorPlan({projectId, title, sourceText, firstLabel, secondLabel, exactCopy}) {
  const diagramId = "explain-relationship";
  const typeId = "retain-source-phrase";
  const idleId = "presenter-read";
  return {
    contract: "A1WholeFilmAiDirectorPlan/v1",
    status: "READY_FOR_USER_EDITORIAL_REVIEW",
    reviewOnly: true,
    aiDirected: true,
    projectId,
    source: {
      title,
      articleSha256: sha256(Buffer.from(`article:${projectId}`)),
      articleAnalysisSha256: sha256(Buffer.from(`analysis:${projectId}`)),
      timelineSha256: sha256(Buffer.from(`timeline:${projectId}`)),
      durationMs: 12_000,
    },
    gates: {
      userEditorialPlanApproval: "PENDING",
      materialExecutionAllowed: false,
      layoutCandidateGenerationAllowed: false,
      acceptedShotIrCompilationAllowed: false,
      shotMotionAllowed: false,
      shotRenderAllowed: false,
      rendererAdoptionAllowed: false,
      h47ExpansionAllowed: false,
      fullMp4RenderAllowed: false,
      finalRenderAllowed: false,
    },
    shots: [
      {
        shotId: "ED-01",
        order: 1,
        sourceText,
        visualJob: "解释来源文案中的关系",
        requiredMaterialIds: [diagramId, typeId],
        materialRequirements: [
          {id: diagramId, duty: "deterministic-diagram", evidenceIds: [], diagramSpec: {
            contract: "A1DeterministicDiagramSpec/v1",
            kind: "sequence",
            nodes: [{id: "first", label: firstLabel}, {id: "second", label: secondLabel}],
            edges: [{from: "first", to: "second", relation: "before-after"}],
          }},
          {id: typeId, duty: "editable-type", evidenceIds: [], exactCopy},
        ],
      },
      {
        shotId: "ED-02",
        order: 2,
        sourceText: "继续解释时保留人物表达，不额外制造图表。",
        visualJob: "保持人物表达",
        requiredMaterialIds: [idleId],
        materialRequirements: [{id: idleId, duty: "presenter-footage", evidenceIds: []}],
      },
    ],
  };
}

const fixtures = [
  directorPlan({projectId: "transport-article", title: "班次如何跟上客流", sourceText: "公交先观察客流，再调整班次。", firstLabel: "观察客流", secondLabel: "调整班次", exactCopy: "调整班次"}),
  directorPlan({projectId: "greenhouse-article", title: "温室灌溉", sourceText: "温室先收集光照，再修正灌溉。", firstLabel: "收集光照", secondLabel: "修正灌溉", exactCopy: "修正灌溉"}),
  directorPlan({projectId: "budget-article", title: "采购决策", sourceText: "团队先核对预算，再决定采购。", firstLabel: "核对预算", secondLabel: "决定采购", exactCopy: "决定采购"}),
];
const options = {workspaceSha256: sha256(Buffer.from("synthetic-workspace")), moduleDefinitions, fontBinding, canvas};

for (const plan of fixtures) {
  const mapped = mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(plan, options);
  const repeated = mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(plan, options);
  assert.deepEqual(mapped, repeated, "mapping must be deterministic for the same plan and explicit options");
  assert.equal(mapped.workflowInput.projectId, plan.projectId);
  assert.equal(mapped.workflowInput.shots[0].source, plan.shots[0].sourceText, "source copy must be preserved byte-for-byte");
  assert.deepEqual(mapped.workflowInput.shots[0].exactCopy, [...new Set([
    plan.shots[0].materialRequirements[0].diagramSpec.nodes[0].label,
    plan.shots[0].materialRequirements[0].diagramSpec.nodes[1].label,
    plan.shots[0].materialRequirements[1].exactCopy,
  ])]);
  assert.deepEqual(mapped.workflowInput.shots[0].modules, {material: false, typography: false, recording: false, diagram: true});
  assert.deepEqual(mapped.workflowInput.shots[1].modules, {material: false, typography: false, recording: false},
    "unselected optional diagram must stay absent");
  assert.equal(mapped.workflowInput.shots[0].moduleInputs.diagram.fontBinding.sha256, fontBinding.sha256);
  assert.equal(mapped.workflowInput.shots[0].moduleInputs.diagram.width, canvas.width);
  assert.equal(mapped.workflowInput.shots[0].moduleInputs.diagram.height, canvas.height);
  assert.deepEqual(mapped.workflowInput.shots[0].moduleInputs.diagram.sourceEvidenceIds, []);
  assert.equal(Object.hasOwn(mapped.workflowInput.shots[0].moduleInputs.diagram, "sourceEvidenceManifestPath"), false,
    "empty synthetic evidence must not receive fabricated source-lock bindings");
  assert.equal(mapped.audit.sourceEvidenceResolved, false);
  assert.equal(mapped.audit.shots[0].requirements[0].sourceEvidenceResolved, false);
  assert.equal(mapped.audit.shots[0].requirements[0].sourceEvidenceResolution, "UNRESOLVED_NO_EVIDENCE_IDS");

  const workflow = compileNodeWorkflow(mapped.workflowInput, null, {moduleDefinitions: mapped.moduleDefinitions});
  assert.equal(workflow.scope, "REVIEW_ONLY");
  assert.equal(workflow.productionAdmission, false);
  assert.deepEqual(workflow.nodes.filter((node) => node.module === "diagram").map((node) => node.shotId), ["ED-01"]);
  assert.equal(workflow.nodes.find((node) => node.module === "diagram")?.state, "queued");
}

const evidencePlan = directorPlan({projectId: "evidence-article", title: "来源绑定", sourceText: "报告先核对测量，再解释结果。", firstLabel: "核对测量", secondLabel: "解释结果", exactCopy: "解释结果"});
evidencePlan.shots[0].materialRequirements[0].evidenceIds = ["measurement-claim-1"];
const evidenceOptions = {
  ...options,
  sourceEvidenceBindings: {
    "ED-01:explain-relationship": {
      sourceEvidenceManifestPath: "work/synthetic-source-lock/lock.json",
      sourceEvidenceManifestSha256: "a".repeat(64),
      sourceBodySha256: "b".repeat(64),
      sourceUrl: "https://example.test/research/measurement",
    },
  },
};
const evidenceMapped = mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(evidencePlan, evidenceOptions);
const evidenceParameters = evidenceMapped.workflowInput.shots[0].moduleInputs.diagram;
assert.deepEqual(evidenceParameters.sourceEvidenceIds, ["measurement-claim-1"]);
assert.equal(evidenceParameters.sourceEvidenceManifestPath, evidenceOptions.sourceEvidenceBindings["ED-01:explain-relationship"].sourceEvidenceManifestPath);
assert.equal(evidenceParameters.sourceEvidenceManifestSha256, "a".repeat(64));
assert.equal(evidenceParameters.sourceBodySha256, "b".repeat(64));
assert.equal(evidenceMapped.workflowInput.shots[0].sourceUrl, "https://example.test/research/measurement");
assert.equal(evidenceMapped.audit.shots[0].requirements[0].sourceEvidenceResolved, false,
  "binding data alone does not claim source-lock resolution");
assert.equal(evidenceMapped.audit.shots[0].requirements[0].sourceEvidenceResolution, "PENDING_ADAPTER_SOURCE_LOCK");
assert.throws(() => mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(evidencePlan, options), /sourceEvidenceBindings/,
  "non-empty evidence IDs require explicit source-lock bindings");

const invalidLabelPlan = directorPlan({projectId: "invalid-label", title: "不匹配", sourceText: "文本里没有这两个节点。", firstLabel: "外部推断", secondLabel: "结论", exactCopy: "结论"});
assert.throws(() => mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(invalidLabelPlan, options), /unbound-label/);
const missingSpecPlan = directorPlan({projectId: "missing-spec", title: "缺图解", sourceText: "先采样，再检查。", firstLabel: "采样", secondLabel: "检查", exactCopy: "检查"});
delete missingSpecPlan.shots[0].materialRequirements[0].diagramSpec;
assert.throws(() => mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(missingSpecPlan, options), /diagramSpec/);
const invalidCopyPlan = directorPlan({projectId: "invalid-copy", title: "缺原文", sourceText: "先采样，再检查。", firstLabel: "采样", secondLabel: "检查", exactCopy: "别处的句子"});
assert.throws(() => mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(invalidCopyPlan, options), /exactCopy:not-source-substring/);
const invalidContractPlan = structuredClone(fixtures[0]);
invalidContractPlan.contract = "A1DifferentPlan/v1";
assert.throws(() => mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(invalidContractPlan, options), /director-plan-invalid/);

assert.throws(() => mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(fixtures[0], {...options, fontBinding: undefined}), /fontBinding/);
assert.throws(() => mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(fixtures[0], {...options, canvas: {width: 400, height: 720}}), /canvas:invalid/);
assert.throws(() => mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(fixtures[0], {...options,
  moduleDefinitions: {...moduleDefinitions, diagram: {...moduleDefinitions.diagram, optional: false}}}), /optional-executor-required/);

console.log(JSON.stringify({contract: "A1NodeDirectorWorkflowMapperTest/v1", status: "PASS", fixtureCount: fixtures.length,
  genericTopics: fixtures.map((plan) => plan.projectId), deterministic: true,
  optionalDiagramSelectedOnlyForRoutedShots: true, sourceCopyBindingVerified: true,
  emptyEvidenceRemainsUnresolved: true, nonEmptyEvidenceRequiresExplicitBinding: true,
  malformedPlansAndDiagramSpecsFailClosed: true, productionAdmission: false}, null, 2));
