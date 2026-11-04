#!/usr/bin/env node
/**
 * Apply safe story-arc regroup decisions without mutating subtitle boundaries.
 *
 * The regroup plan is review-only and does not allow automatic split/merge.
 * This script resolves the current regroup queue by changing storyboard intent,
 * motion/layout jobs, and row-level resolution metadata while preserving every
 * beatId, time range, and source subtitle.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-story-arc-regroup-decisions-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const approvalPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-approval.json");
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function apply(props, operationByBeatId) {
  const applied = [];
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
        storyArcRegroupResolution: {
          phaseId,
          decision: decision.decision,
          sourceOperationType: operation.operationType,
          sourceSegmentationAction: operation.segmentationAction,
          boundaryMutationApplied: false,
          reason: operation.reason,
        },
      },
      storyArcRegroupResolution: {
        phaseId,
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
      storyArcRegroupResolution: {
        phaseId,
        decision: decision.decision,
      },
    };
    scene.layout = {
      ...(scene.layout || {}),
      storyArcRegroupResolution: {
        phaseId,
        layoutJob: decision.layoutJob,
      },
    };
    applied.push({
      beatId: scene.beatId,
      operationType: operation.operationType,
      decision: decision.decision,
      motionJob: decision.motionJob,
      layoutJob: decision.layoutJob,
      boundaryMutationApplied: false,
    });
  }
  props.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: (props.scenes || []).map((scene) => [
      scene.beatId,
      scene.screenText,
      scene.storyboard?.semanticFill,
      scene.motionPlan?.motionStyle,
      scene.layout?.storyArcRegroupResolution,
    ]),
  })).digest("hex");
  return applied;
}

if (!fs.existsSync(storyboardPropsPath)) throw new Error(`missing storyboard props: ${rel(storyboardPropsPath)}`);
if (!fs.existsSync(rendererPropsPath)) throw new Error(`missing renderer props: ${rel(rendererPropsPath)}`);
if (!fs.existsSync(regroupPlanPath)) throw new Error(`missing regroup plan: ${rel(regroupPlanPath)}`);

const regroupPlan = readJson(regroupPlanPath);
const operations = Array.isArray(regroupPlan.operations) ? regroupPlan.operations : [];
const acceptedOperations = operations.filter((operation) => operation.accepted === true);
const operationByBeatId = new Map(acceptedOperations.map((operation) => [operation.beatId, operation]));
const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
  regroupPlanSha256: sha256File(regroupPlanPath),
};

const storyboardProps = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
const now = new Date().toISOString();
let storyboardApplied = [];
let rendererApplied = [];
let after = {
  storyboardPropsSha256: before.storyboardPropsSha256,
  rendererPropsSha256: before.rendererPropsSha256,
};

if (acceptedOperations.length > 0) {
  storyboardApplied = apply(storyboardProps, operationByBeatId);
  rendererApplied = apply(rendererProps, operationByBeatId);
  if (storyboardApplied.length !== rendererApplied.length) throw new Error(`apply mismatch storyboard=${storyboardApplied.length} renderer=${rendererApplied.length}`);

  writeJson(storyboardPropsPath, storyboardProps);
  writeJson(rendererPropsPath, rendererProps);
  after = {
    storyboardPropsSha256: sha256File(storyboardPropsPath),
    rendererPropsSha256: sha256File(rendererPropsPath),
  };
}

if (acceptedOperations.length > 0 && fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: after.storyboardPropsSha256,
  };
  manifest.reviewState = {
    ...(manifest.reviewState || {}),
    approvalInvalidatedAt: now,
    approvalInvalidationReason: "story-arc-regroup-decisions-applied",
  };
  writeJson(manifestPath, manifest);
}

if (acceptedOperations.length > 0 && fs.existsSync(approvalPath)) {
  writeJson(approvalPath, {
    contract: "A1StoryboardApproval/v1",
    status: "INVALIDATED_BY_STORYBOARD_CHANGE",
    invalidatedAt: now,
    reason: "story-arc-regroup-decisions-applied",
    before,
    after,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  });
}

const unresolved = acceptedOperations.filter((operation) => !decisions[operation.beatId]);
const pending = operations.filter((operation) => operation.accepted !== true && operation.rejected !== true);
const rejected = operations.filter((operation) => operation.rejected === true);
const status = acceptedOperations.length === 0
  ? "EMPTY_NO_ACCEPTED_DECISIONS"
  : unresolved.length
    ? "APPLIED_WITH_UNRESOLVED_ITEMS"
    : "APPLIED_SAFE_NO_BOUNDARY_MUTATION";
const report = {
  contract: "A1StoryboardStoryArcRegroupDecisions/v1",
  phaseId,
  status,
  generatedAt: now,
  reviewOnly: true,
  boundaryMutationApplied: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    regroupPlanPath: rel(regroupPlanPath),
    regroupPlanSha256: before.regroupPlanSha256,
    storyboardPropsPath: rel(storyboardPropsPath),
    rendererPropsPath: rel(rendererPropsPath),
  },
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  summary: {
    operationCount: operations.length,
    acceptedOperationCount: acceptedOperations.length,
    rejectedOperationCount: rejected.length,
    pendingOperationCount: pending.length,
    appliedCount: storyboardApplied.length,
    unresolvedCount: unresolved.length,
    splitCandidatesKeptAsTwoStepShot: storyboardApplied.filter((item) => item.decision === "keep-boundary-two-step-shot").length,
    boundaryMutationApplied: false,
  },
  applied: storyboardApplied,
  unresolved,
  nextAction: acceptedOperations.length === 0
    ? "accept-regroup-items-before-applying"
    : unresolved.length
      ? "review-unresolved-regroup-items"
      : "regroup-risk-resolved-without-boundary-mutation",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  after: report.after,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
