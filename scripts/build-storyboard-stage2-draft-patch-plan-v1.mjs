#!/usr/bin/env node
/**
 * Convert Stage 2 semantic rewrite drafts into a reviewable safe patch plan.
 *
 * Drafts are not applied automatically. Accepted draft IDs may be supplied in:
 * public/generated/storyboard/current/stage2-draft-acceptance.json
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-stage2-draft-patch-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const stage2DraftsPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-semantic-rewrite-drafts-v1/report.json");
const stage2LlmImportPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-judgement-import-v1/report.json");
const acceptancePath = path.join(root, "apps/studio-next/public/generated/storyboard/current/stage2-draft-acceptance.json");

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, value, "utf8");
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function sceneIndexByBeatId(scenes) {
  return new Map((scenes || []).map((scene, index) => [scene.beatId, index]));
}

function acceptedDraftIds(acceptance) {
  if (!acceptance || acceptance.contract !== "A1StoryboardStage2DraftAcceptance/v1") return new Set();
  return new Set((acceptance.acceptedDraftIds || []).filter((id) => typeof id === "string"));
}

function rejectedDraftIds(acceptance) {
  if (!acceptance || acceptance.contract !== "A1StoryboardStage2DraftAcceptance/v1") return new Set();
  return new Set((acceptance.rejectedDraftIds || []).filter((id) => typeof id === "string"));
}

function titleLinesFromFocus(focus) {
  const text = String(focus || "").trim();
  if (!text) return [];
  if (text.length <= 10) return [text];
  return [text.slice(0, 10), text.slice(10, 20)].filter(Boolean);
}

function hasTruncatedMarker(value) {
  return /…|\.{3}/u.test(String(value || ""));
}

function compactSegment(value) {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .replace(/^[，。！？、；：,.!?;:\s]+|[，。！？、；：,.!?;:\s]+$/gu, "")
    .trim();
}

function focusFromScene(scene) {
  const semanticFocus = compactSegment(scene?.storyboard?.semanticFill?.visibleText);
  if (semanticFocus && !hasTruncatedMarker(semanticFocus)) return {value: semanticFocus, source: "semantic-visible-text"};
  const currentFocus = compactSegment(scene?.storyboard?.visualFocusText);
  if (currentFocus && !hasTruncatedMarker(currentFocus)) return {value: currentFocus, source: "current-storyboard-focus"};
  const screenText = String(scene?.screenText || "");
  const segments = screenText
    .split(/[，。！？；,.!?;]+/u)
    .map(compactSegment)
    .filter((segment) => segment.length >= 2 && segment.length <= 14 && !/^(hi|我|你|它|这个|这套系统)$/iu.test(segment));
  const preferred = segments.at(-1) || segments[0] || "";
  return preferred ? {value: preferred, source: "screen-text-segment"} : {value: compactSegment(screenText).slice(0, 14), source: "screen-text-trim"};
}

function effectiveDraftForItem(draftItem, scene) {
  const draft = {...(draftItem.draft || {})};
  const originalVisualFocusText = compactSegment(draft.visualFocusText);
  const fallback = focusFromScene(scene);
  if (hasTruncatedMarker(originalVisualFocusText) && fallback.value) {
    draft.visualFocusText = fallback.value;
    draft.visualFocusTextSource = fallback.source;
    draft.originalVisualFocusText = originalVisualFocusText;
  } else {
    draft.visualFocusText = originalVisualFocusText;
    draft.visualFocusTextSource = "stage2-draft";
    draft.originalVisualFocusText = originalVisualFocusText;
  }
  return draft;
}

function patchForDraft(draftItem, index, scene) {
  const draft = effectiveDraftForItem(draftItem, scene);
  const base = `/scenes/${index}`;
  const storyboard = `${base}/storyboard`;
  const semanticFill = `${storyboard}/semanticFill`;
  return [
    {op: "replace", path: `${storyboard}/visualFocusText`, value: draft.visualFocusText},
    {op: "replace", path: `${base}/titleLines`, value: titleLinesFromFocus(draft.visualFocusText)},
    {op: "replace", path: `${semanticFill}/intent`, value: draft.intent},
    {op: "replace", path: `${semanticFill}/fillWhat`, value: draft.fillWhat},
    {op: "replace", path: `${semanticFill}/fillHow`, value: draft.fillHow},
    {op: "replace", path: `${semanticFill}/assetRoute`, value: draft.assetRoute},
    {op: "replace", path: `${semanticFill}/evidenceNeed`, value: draft.evidenceNeed},
    {op: "replace", path: `${semanticFill}/motionJob`, value: draft.motionJob},
    {op: "replace", path: `${semanticFill}/layoutJob`, value: draft.layoutJob},
    {op: "add", path: `${semanticFill}/stage2Rewrite`, value: {
      contract: "A1StoryboardStage2SemanticRewrite/v1",
      sourceDraftId: draftItem.id,
      cognitiveRole: draft.cognitiveRole,
      reason: draft.reason,
      confidence: draft.confidence,
      visualFocusTextSource: draft.visualFocusTextSource,
      originalVisualFocusText: draft.originalVisualFocusText,
      alternatives: draft.alternatives || [],
      acceptedAtApplyTime: true,
    }},
  ];
}

function safetyForDraft(draft = {}) {
  const reasons = [];
  const route = draft.assetRoute || "";
  const focus = String(draft.visualFocusText || "");
  const confidence = typeof draft.confidence === "number" ? draft.confidence : 0;
  const semanticBody = `${draft.intent || ""} ${draft.fillWhat || ""} ${draft.fillHow || ""}`;
  if (route === "gpt-editorial-artwork") reasons.push("needs-artwork-generation-and-visual-review");
  if (hasTruncatedMarker(focus)) reasons.push("visual-focus-text-truncated");
  if (/用确定性语义结构图表达|一眼可读的分镜图形|字幕里的关系、流程、归档或判断|基于当前字幕/u.test(semanticBody)) reasons.push("semantic-rewrite-too-generic");
  if (confidence > 0 && confidence < 0.8) reasons.push("low-confidence");
  const safeAutoApply = reasons.length === 0 && confidence >= 0.8 && (route === "typography-only" || route === "deterministic-semantic-stage");
  return {
    safeAutoApply,
    reviewRequired: !safeAutoApply,
    reasons,
    label: safeAutoApply ? "可安全采用" : reasons.includes("needs-artwork-generation-and-visual-review") ? "需看图" : reasons.includes("semantic-rewrite-too-generic") ? "无增益" : reasons.includes("visual-focus-text-truncated") ? "需改标题" : reasons.includes("low-confidence") ? "低置信" : "需人工",
  };
}

const props = readJsonIfExists(storyboardPropsPath);
const rendererProps = readJsonIfExists(rendererPropsPath);
const heuristicDraftsReport = readJsonIfExists(stage2DraftsPath);
const llmImportReport = readJsonIfExists(stage2LlmImportPath);
const llmDrafts = llmImportReport?.contract === "A1StoryboardStage2LLMJudgementImport/v1" && Array.isArray(llmImportReport.drafts) ? llmImportReport.drafts : [];
const draftsReport = llmDrafts.length ? llmImportReport : heuristicDraftsReport;
const draftSourceKind = llmDrafts.length ? "stage2-llm-import" : "heuristic-stage2-drafts";
const acceptance = readJsonIfExists(acceptancePath);
const blockers = [];

if (!props || !Array.isArray(props.scenes)) blockers.push({id: "missing-storyboard-props", detail: `Missing storyboard props: ${rel(storyboardPropsPath)}`});
if (!rendererProps || !Array.isArray(rendererProps.scenes)) blockers.push({id: "missing-renderer-props", detail: `Missing renderer props: ${rel(rendererPropsPath)}`});
if (!draftsReport || !Array.isArray(draftsReport.drafts)) blockers.push({id: "missing-stage2-drafts", detail: `Missing Stage 2 draft report: ${rel(stage2DraftsPath)} or ${rel(stage2LlmImportPath)}`});

const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
  stage2DraftsSha256: sha256File(stage2DraftsPath),
  stage2LlmImportSha256: sha256File(stage2LlmImportPath),
};

if (before.storyboardPropsSha256 && before.rendererPropsSha256 && before.storyboardPropsSha256 !== before.rendererPropsSha256) {
  blockers.push({
    id: "storyboard-renderer-props-sha-mismatch",
    detail: "Storyboard and renderer props must match before building Stage 2 draft patches.",
  });
}

const sceneIndex = sceneIndexByBeatId(props?.scenes || []);
const accepted = acceptedDraftIds(acceptance);
const rejected = rejectedDraftIds(acceptance);
const allDrafts = draftsReport?.drafts || [];
const candidates = [];
const operations = [];

for (const item of allDrafts) {
  const index = sceneIndex.get(item.beatId);
  if (typeof index !== "number") {
    blockers.push({id: "draft-beat-not-found", beatId: item.beatId, detail: "Draft beat is not in current storyboard props."});
    continue;
  }
  const scene = props.scenes[index];
  const effectiveDraft = effectiveDraftForItem(item, scene);
  const resolvedByAdoptedArtwork = effectiveDraft.assetRoute === "gpt-editorial-artwork"
    && scene.storyboard?.artworkStatus === "adopted"
    && Boolean(scene.storyboard?.artworkFile);
  const candidate = {
    draftId: item.id,
    beatId: item.beatId,
    macroId: item.macroId,
    cognitiveRole: effectiveDraft.cognitiveRole || null,
    visualFocusText: effectiveDraft.visualFocusText || null,
    originalVisualFocusText: effectiveDraft.originalVisualFocusText || null,
    visualFocusTextSource: effectiveDraft.visualFocusTextSource || null,
    assetRoute: effectiveDraft.assetRoute || null,
    motionJob: effectiveDraft.motionJob || null,
    layoutJob: effectiveDraft.layoutJob || null,
    confidence: effectiveDraft.confidence || null,
    reason: effectiveDraft.reason || "",
    safety: safetyForDraft(effectiveDraft),
    applied: props.scenes[index]?.storyboard?.semanticFill?.stage2Rewrite?.sourceDraftId === item.id,
    accepted: accepted.has(item.id) && props.scenes[index]?.storyboard?.semanticFill?.stage2Rewrite?.sourceDraftId !== item.id,
    rejected: rejected.has(item.id),
    resolved: resolvedByAdoptedArtwork,
    resolvedReason: resolvedByAdoptedArtwork ? "adopted-artwork-visual-review" : null,
  };
  candidates.push(candidate);
  if (candidate.accepted && !candidate.resolved) {
    operations.push({
      draftId: item.id,
      beatId: item.beatId,
      macroId: item.macroId,
      operationType: "apply-stage2-semantic-rewrite",
      applyMode: "safe-props-patch",
      risk: "medium",
      reason: "Stage 2 draft was explicitly accepted and can be converted into semanticFill/title patch.",
      proposedPatch: patchForDraft(item, index, scene),
    });
  }
}

const report = {
  contract: "A1StoryboardStage2DraftPatchPlan/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : operations.length ? "PLAN_READY" : candidates.length && candidates.some((item) => !item.rejected && !item.applied && !item.resolved) ? "WAITING_FOR_ACCEPTANCE" : candidates.length ? "REVIEWED_NO_ACCEPTANCE" : "EMPTY",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    rendererPropsPath: rel(rendererPropsPath),
    stage2DraftsPath: rel(stage2DraftsPath),
    stage2LlmImportPath: rel(stage2LlmImportPath),
    draftSourceKind,
    acceptancePath: rel(acceptancePath),
    acceptanceStatus: acceptance?.status || "missing",
  },
  before,
  summary: {
    candidateCount: candidates.length,
    acceptedCount: operations.length,
    appliedCount: candidates.filter((item) => item.applied).length,
    resolvedCount: candidates.filter((item) => item.resolved).length,
    rejectedCount: candidates.filter((item) => item.rejected).length,
    pendingCount: candidates.filter((item) => !item.accepted && !item.rejected && !item.applied && !item.resolved).length,
    safeAutoApplyPendingCount: candidates.filter((item) => !item.accepted && !item.rejected && !item.applied && !item.resolved && item.safety?.safeAutoApply).length,
    manualReviewPendingCount: candidates.filter((item) => !item.accepted && !item.rejected && !item.applied && !item.resolved && item.safety?.reviewRequired).length,
    pendingBySafety: candidates.filter((item) => !item.accepted && !item.rejected && !item.applied && !item.resolved).reduce((acc, item) => {
      const label = item.safety?.label || "需人工";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {}),
    blockerCount: blockers.length,
    byRoute: candidates.reduce((acc, item) => {
      acc[item.assetRoute || "missing"] = (acc[item.assetRoute || "missing"] || 0) + 1;
      return acc;
    }, {}),
  },
  blockers,
  candidates,
  operations,
  nextAction: operations.length
    ? "review-stage2-patch-plan-then-apply-with-explicit-gate"
    : candidates.some((item) => !item.rejected && !item.applied && !item.resolved)
      ? "accept-stage2-draft-ids-before-patching-current-storyboard"
      : "stage2-candidates-reviewed-with-no-accepted-patches",
};

const md = [
  "# Storyboard Stage 2 Draft Patch Plan v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- candidates: ${report.summary.candidateCount}`,
  `- accepted: ${report.summary.acceptedCount}`,
  `- applied: ${report.summary.appliedCount}`,
  `- rejected: ${report.summary.rejectedCount}`,
  `- pending: ${report.summary.pendingCount}`,
  `- blockers: ${report.summary.blockerCount}`,
  `- apply allowed: ${report.applyAllowed}`,
  "",
  "## Candidates",
  "",
  ...(candidates.length ? candidates.map((item, index) => [
    `### ${index + 1}. ${item.beatId}`,
    "",
    `- draft id: ${item.draftId}`,
    `- applied: ${item.applied}`,
    `- resolved: ${item.resolved}`,
    `- resolved reason: ${item.resolvedReason}`,
    `- accepted: ${item.accepted}`,
    `- rejected: ${item.rejected}`,
    `- role: ${item.cognitiveRole}`,
    `- focus: ${item.visualFocusText}`,
    `- original focus: ${item.originalVisualFocusText}`,
    `- focus source: ${item.visualFocusTextSource}`,
    `- route: ${item.assetRoute}`,
    `- motion: ${item.motionJob}`,
    `- confidence: ${item.confidence}`,
    `- safety: ${item.safety?.label}`,
    `- reason: ${item.reason}`,
    "",
  ].join("\n")) : ["- no candidates"]),
  "## Blockers",
  "",
  ...(blockers.length ? blockers.map((item) => `- ${item.id}: ${item.detail}`) : ["- none"]),
  "",
].join("\n");

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
writeText(path.join(artifactRoot, "report.md"), md);
writeText(path.join(publicRoot, "report.md"), md);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
