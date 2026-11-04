#!/usr/bin/env node
/**
 * Build a dry-run props candidate for accepted story-arc regroup operations.
 *
 * This never writes current storyboard props. It gives the review UI/workflow a
 * concrete candidate state before any safe metadata write-back is applied.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-story-arc-regroup-dry-run-props-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const regroupPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-story-arc-regroup-plan-v1/report.json");

const decisions = {
  "H04-B02": {
    decision: "soften-support-run",
    motionJob: "causal-chain-draw",
    layoutJob: "right-side-causal-chain",
    fillHow: "先出现“常见表达库”，再经过“稳妥选择器”，最后输出“可复用句式”；三节点按因果链依次点亮，和前后镜头拉开节奏。",
  },
  "H07-B03": {
    decision: "soften-support-run",
    motionJob: "selection-highlight-write",
    layoutJob: "title-left-highlight-strip-right",
    fillHow: "先让不可读正文线铺开，再用钴蓝框划选一句，最后把“正在改变内容生产”放大成主标题；高亮动作区别于普通大字卡。",
  },
  "H08-B04": {
    decision: "keep-boundary-two-step-shot",
    motionJob: "gap-insertion-branch",
    layoutJob: "two-step-gap-sequence",
    fillHow: "不自动拆镜；在同一时间段内分两拍处理：先拉开两段之间的缺口，再让双击输入点长出补充需求卡。",
  },
  "H09-B02": {
    decision: "soften-support-run",
    motionJob: "candidate-branch-reveal",
    layoutJob: "title-left-candidate-fan-right",
    fillHow: "先显示一条上下文线，再从这条线分叉出三张候选卡，最后锁定标题；用分叉结构区别于相邻补段/回填镜头。",
  },
  "H11-B02": {
    decision: "soften-support-run",
    motionJob: "converge-to-stable-version",
    layoutJob: "chaos-to-archive-track",
    fillHow: "先显示多条发散对话线，再让钴蓝轨道把它们收束进版本堆栈，最后停在稳定输出节点；节奏从混乱变收束。",
  },
};

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function sha256Value(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyPreview(props, acceptedOperations) {
  const operationByBeatId = new Map(acceptedOperations.map((operation) => [operation.beatId, operation]));
  const previewed = [];
  for (const scene of props.scenes || []) {
    const operation = operationByBeatId.get(scene.beatId);
    const decision = decisions[scene.beatId];
    if (!operation || !decision) continue;
    const fill = scene.storyboard?.semanticFill || {};
    scene.storyboard = {
      ...(scene.storyboard || {}),
      semanticFill: {
        ...fill,
        fillHow: decision.fillHow,
        motionJob: decision.motionJob,
        layoutJob: decision.layoutJob,
        storyArcRegroupPreview: {
          phaseId,
          operationId: operation.operationId,
          decision: decision.decision,
          sourceOperationType: operation.operationType,
          sourceSegmentationAction: operation.segmentationAction,
          boundaryMutationApplied: false,
          reason: operation.reason,
        },
      },
      storyArcRegroupPreview: {
        phaseId,
        operationId: operation.operationId,
        decision: decision.decision,
        sourceOperationType: operation.operationType,
        sourceSegmentationAction: operation.segmentationAction,
        boundaryMutationApplied: false,
        reason: operation.reason,
      },
    };
    scene.motionPlan = {
      ...(scene.motionPlan || {}),
      motionStyle: decision.motionJob,
      primaryAction: decision.motionJob,
    };
    scene.layout = {
      ...(scene.layout || {}),
      storyArcRegroupPreview: {
        phaseId,
        layoutJob: decision.layoutJob,
      },
    };
    previewed.push({
      operationId: operation.operationId,
      beatId: scene.beatId,
      operationType: operation.operationType,
      decision: decision.decision,
      motionJob: decision.motionJob,
      layoutJob: decision.layoutJob,
      boundaryMutationApplied: false,
    });
  }
  props.contentHash = sha256Value({
    scenes: (props.scenes || []).map((scene) => [
      scene.beatId,
      scene.screenText,
      scene.storyboard?.semanticFill,
      scene.motionPlan?.motionStyle,
      scene.layout?.storyArcRegroupPreview,
    ]),
  });
  return previewed;
}

const props = readJsonIfExists(storyboardPropsPath);
const regroupPlan = readJsonIfExists(regroupPlanPath);
const blockers = [];
if (!props || !Array.isArray(props.scenes)) blockers.push({id: "missing-storyboard-props", detail: `Missing storyboard props: ${rel(storyboardPropsPath)}`});
if (!regroupPlan || regroupPlan.contract !== "A1StoryboardStoryArcRegroupPlan/v1") blockers.push({id: "missing-regroup-plan", detail: `Missing regroup plan: ${rel(regroupPlanPath)}`});

const operations = Array.isArray(regroupPlan?.operations) ? regroupPlan.operations : [];
const acceptedOperations = operations.filter((operation) => operation.accepted === true);
const previewProps = props ? clone(props) : null;
const previewed = blockers.length || !previewProps ? [] : applyPreview(previewProps, acceptedOperations);
const unresolved = acceptedOperations.filter((operation) => !decisions[operation.beatId]);
const candidatePropsPath = path.join(artifactRoot, "storyboard-props.dry-run.json");
if (previewProps && acceptedOperations.length > 0) {
  writeJson(candidatePropsPath, previewProps);
}

const report = {
  contract: "A1StoryboardStoryArcRegroupDryRunProps/v1",
  phaseId,
  status: blockers.length
    ? "BLOCKED"
    : acceptedOperations.length === 0
      ? "EMPTY_NO_ACCEPTED_OPERATIONS"
      : unresolved.length
        ? "DRY_RUN_WITH_UNRESOLVED_ITEMS"
        : "DRY_RUN_READY",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  mutatesCurrentProps: false,
  boundaryMutationApplied: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    storyboardPropsSha256: sha256File(storyboardPropsPath),
    regroupPlanPath: rel(regroupPlanPath),
    regroupPlanSha256: sha256File(regroupPlanPath),
  },
  output: {
    candidatePropsPath: acceptedOperations.length > 0 ? rel(candidatePropsPath) : null,
    candidatePropsSha256: acceptedOperations.length > 0 ? sha256File(candidatePropsPath) : null,
  },
  summary: {
    operationCount: operations.length,
    acceptedOperationCount: acceptedOperations.length,
    previewedCount: previewed.length,
    unresolvedCount: unresolved.length,
    blockerCount: blockers.length,
  },
  blockers,
  previewed,
  unresolved,
  nextAction: acceptedOperations.length > 0 ? "review-dry-run-candidate-then-apply-accepted-regroup-items" : "accept-regroup-items-before-dry-run",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  output: report.output,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
