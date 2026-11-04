#!/usr/bin/env node
/**
 * Import and audit Stage 2 LLM semantic judgement JSON files.
 *
 * Expected input files:
 * apps/studio-next/public/generated/system-line/storyboard-stage2-llm-contract-v1/inbox/Hxx-Bxx.json
 *
 * This is review-only. Valid LLM judgements become draft candidates but are not
 * applied to storyboard props.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-stage2-llm-judgement-import-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const queuePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-contract-v1/queue.json");
const inboxPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-contract-v1/inbox");

const allowedRoles = new Set([
  "opening-orientation",
  "question-or-doubt",
  "operation-or-example",
  "cause-effect-judgement",
  "memory-or-archive",
  "contrast-or-correction",
  "closing-synthesis",
  "supporting-explanation",
]);
const allowedRoutes = new Set([
  "typography-only",
  "deterministic-semantic-stage",
  "deterministic-with-verified-entity",
  "gpt-editorial-artwork",
]);
const allowedEvidence = new Set(["none", "verified-source-required", "fallback-to-typography"]);

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

function clean(value, max = 500) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
}

function auditJudgement(value, expectedBeatId) {
  const issues = [];
  if (value?.contract !== "A1StoryboardStage2LLMJudgement/v1") issues.push({id: "bad-contract", detail: "contract must be A1StoryboardStage2LLMJudgement/v1"});
  if (value?.beatId !== expectedBeatId) issues.push({id: "beat-mismatch", detail: `expected ${expectedBeatId}, got ${value?.beatId || "missing"}`});
  if (!allowedRoles.has(value?.cognitiveRole)) issues.push({id: "bad-cognitive-role", detail: "cognitiveRole is missing or invalid"});
  if (!clean(value?.visualFocusText, 40)) issues.push({id: "missing-visual-focus", detail: "visualFocusText is required"});
  if (!clean(value?.intent, 300)) issues.push({id: "missing-intent", detail: "intent is required"});
  if (!clean(value?.fillWhat, 400)) issues.push({id: "missing-fill-what", detail: "fillWhat is required"});
  if (!clean(value?.fillHow, 400)) issues.push({id: "missing-fill-how", detail: "fillHow is required"});
  if (!allowedRoutes.has(value?.assetRoute)) issues.push({id: "bad-asset-route", detail: "assetRoute is missing or invalid"});
  if (!allowedEvidence.has(value?.evidenceNeed)) issues.push({id: "bad-evidence-need", detail: "evidenceNeed is missing or invalid"});
  if (!clean(value?.motionJob, 160)) issues.push({id: "missing-motion-job", detail: "motionJob is required"});
  if (!clean(value?.layoutJob, 180)) issues.push({id: "missing-layout-job", detail: "layoutJob is required"});
  if (!clean(value?.reason, 500)) issues.push({id: "missing-reason", detail: "reason is required"});
  const confidence = Number(value?.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) issues.push({id: "bad-confidence", detail: "confidence must be a number from 0 to 1"});
  const combined = `${value?.visualFocusText || ""} ${value?.fillWhat || ""} ${value?.fillHow || ""} ${value?.reason || ""}`;
  if (/假截图|伪截图|fake UI|fake chart|fake document|logo|官方标志|水印/u.test(combined)) issues.push({id: "unsafe-fake-evidence-risk", detail: "judgement appears to allow fake evidence/UI/logo"});
  if (value?.assetRoute === "gpt-editorial-artwork" && /文字|标题|字幕|caption|label/u.test(clean(value?.fillWhat, 500))) {
    issues.push({id: "generated-artwork-text-risk", detail: "GPT editorial artwork must stay text-free; Chinese text remains editable layer"});
  }
  if (value?.assetRoute === "gpt-editorial-artwork") {
    const positiveCombined = clean(combined, 1200).replace(/(?:禁止|不得|不要|不生成|避免|不能出现|do not|avoid)[^。；;,.，]*/giu, "");
    if (!/抽象|符号|物件|档案|路径|机器|空洞|线框|几何/u.test(combined)) {
      issues.push({id: "generated-artwork-abstraction-missing", detail: "GPT editorial artwork must default to abstract symbolic non-figurative imagery"});
    }
    if (/人头|人脸|头像|头部|脸部|身体|人体|人物|肖像|画像|手部|人手|mannequin|portrait|face|head|skull|body|human|person|character/u.test(positiveCombined)) {
      issues.push({id: "generated-artwork-figurative-risk", detail: "GPT editorial artwork must not request human heads/faces/bodies/portraits/hands by default"});
    }
  }
  return issues;
}

const queue = readJsonIfExists(queuePath);
const blockers = [];
if (!queue || queue.contract !== "A1StoryboardStage2LLMQueue/v1") blockers.push({id: "missing-stage2-llm-queue", detail: `Missing queue: ${rel(queuePath)}`});

const rows = [];
const validDrafts = [];

for (const job of queue?.jobs || []) {
  const filePath = path.join(inboxPath, `${job.beatId}.json`);
  const judgement = readJsonIfExists(filePath);
  if (!judgement) {
    rows.push({
      beatId: job.beatId,
      status: "MISSING",
      filePath: rel(filePath),
      issues: [{id: "missing-file", detail: "No LLM judgement JSON found in inbox."}],
    });
    continue;
  }
  const issues = auditJudgement(judgement, job.beatId);
  const status = issues.length ? "REJECTED" : "VALID";
  rows.push({
    beatId: job.beatId,
    status,
    filePath: rel(filePath),
    sha256: sha256File(filePath),
    issues,
  });
  if (status === "VALID") {
    validDrafts.push({
      id: `stage2-llm-draft-${job.beatId}`,
      beatId: job.beatId,
      macroId: job.macroId,
      source: "stage2-llm-judgement-import",
      promptSha256: job.promptSha256,
      draft: {
        cognitiveRole: judgement.cognitiveRole,
        visualFocusText: judgement.visualFocusText,
        intent: judgement.intent,
        fillWhat: judgement.fillWhat,
        fillHow: judgement.fillHow,
        assetRoute: judgement.assetRoute,
        evidenceNeed: judgement.evidenceNeed,
        motionJob: judgement.motionJob,
        layoutJob: judgement.layoutJob,
        reason: judgement.reason,
        confidence: judgement.confidence,
        alternatives: Array.isArray(judgement.alternatives) ? judgement.alternatives : [],
        rejectIf: Array.isArray(judgement.rejectIf) ? judgement.rejectIf : [],
      },
      applyMode: "review-only-draft",
      applyAllowed: false,
    });
  }
}

const byStatus = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});
const byIssue = rows.flatMap((row) => row.issues || []).reduce((acc, issue) => {
  acc[issue.id] = (acc[issue.id] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardStage2LLMJudgementImport/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : validDrafts.length ? "VALID_DRAFTS_READY" : "WAITING_FOR_LLM_OUTPUT",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    queuePath: rel(queuePath),
    queueSha256: sha256File(queuePath),
    inboxPath: rel(inboxPath),
  },
  summary: {
    jobCount: queue?.jobs?.length || 0,
    validDraftCount: validDrafts.length,
    blockerCount: blockers.length,
    byStatus,
    byIssue,
  },
  blockers,
  rows,
  drafts: validDrafts,
  nextAction: validDrafts.length
    ? "convert-valid-llm-drafts-to-stage2-patch-plan"
    : "fill-stage2-llm-inbox-with-structured-json-judgements",
};

const md = [
  "# Storyboard Stage 2 LLM Judgement Import v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- jobs: ${report.summary.jobCount}`,
  `- valid drafts: ${report.summary.validDraftCount}`,
  `- blockers: ${report.summary.blockerCount}`,
  "",
  "## Rows",
  "",
  ...(rows.length ? rows.map((row) => [
    `### ${row.beatId}`,
    "",
    `- status: ${row.status}`,
    `- file: ${row.filePath}`,
    ...(row.issues || []).map((issue) => `- issue: ${issue.id} - ${issue.detail}`),
    "",
  ].join("\n")) : ["- no rows"]),
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
