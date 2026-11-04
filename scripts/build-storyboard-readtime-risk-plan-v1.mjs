#!/usr/bin/env node
/**
 * Build a read-time risk plan for the current project storyboard.
 *
 * Review risks are not structural blockers. This plan tells whether each tight
 * scene should be split, retimed, or accepted for 540p review.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const phaseId = "storyboard-readtime-risk-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const reportMdPath = path.join(artifactRoot, "report.md");
const publicReportMdPath = path.join(publicRoot, "report.md");

function rel(filePath) {
  return path.relative(root, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, text, "utf8");
}

function visualUnits(value = "") {
  let units = 0;
  for (const char of String(value)) {
    if (/\s/u.test(char)) continue;
    if (/[A-Za-z0-9]/u.test(char)) units += 0.56;
    else if (/[·，。？！、：；（）《》“”"'.-]/u.test(char)) units += 0.32;
    else units += 1;
  }
  return Number(units.toFixed(2));
}

function splitCandidates(text) {
  return String(text || "")
    .replace(/[。！？!?]$/u, "")
    .split(/[，；：,;:、]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function recommendationFor(scene, risk) {
  const text = scene.screenText || "";
  const durationSec = Number(scene.durationInFrames || 0) / 30;
  const unitsPerSec = durationSec > 0 ? visualUnits(text) / durationSec : 0;
  const parts = splitCandidates(text);
  const semanticStage = scene.storyboard?.semanticDecision?.semanticStageKind || "typographic-packaging";
  const visualFocus = scene.storyboard?.visualFocusText || scene.presentation?.primary || "";
  if (unitsPerSec >= 7.2 && parts.length >= 2 && Number(scene.durationInFrames || 0) >= 80) {
    return {
      action: "split-candidate",
      reason: "Reading load is high and the sentence has natural clause breaks.",
      suggestedSplit: parts.slice(0, 2),
    };
  }
  if (unitsPerSec >= 7.0 && semanticStage === "typographic-packaging" && visualFocus.length > 10) {
    return {
      action: "shorten-visual-focus",
      reason: "Source sentence can stay, but the screen packaging phrase should be shorter.",
      suggestedFocus: visualFocus.slice(0, 10),
    };
  }
  return {
    action: "accept-for-540p-review",
    reason: "Tight but non-blocking; keep as review risk and judge in motion.",
    suggestedSplit: [],
  };
}

const propsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const qualityPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-quality-gate-v1/report.json");
if (!fs.existsSync(propsPath)) throw new Error(`props not found: ${rel(propsPath)}`);
if (!fs.existsSync(qualityPath)) throw new Error(`quality report not found: ${rel(qualityPath)}`);

const props = readJson(propsPath);
const quality = readJson(qualityPath);
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
const sceneById = new Map(scenes.map((scene) => [scene.beatId, scene]));
const riskRows = (quality.reviewRiskScenes || [])
  .filter((row) => (row.issues || []).some((issue) => issue.type === "read-time-tight"))
  .map((row) => {
    const scene = sceneById.get(row.beatId) || {};
    const recommendation = recommendationFor(scene, row);
    return {
      beatId: row.beatId,
      macroId: row.macroId,
      sourceText: scene.screenText || "",
      visualFocusText: scene.storyboard?.visualFocusText || scene.presentation?.primary || row.title,
      durationInFrames: scene.durationInFrames || null,
      durationSec: scene.durationInFrames ? Number((scene.durationInFrames / 30).toFixed(2)) : null,
      semanticStageKind: scene.storyboard?.semanticDecision?.semanticStageKind || null,
      presentationState: scene.presentation?.state || null,
      family: scene.family || null,
      motionStyle: scene.motionPlan?.motionStyle || null,
      issues: row.issues || [],
      recommendation,
    };
  });

const actionCounts = riskRows.reduce((acc, row) => {
  acc[row.recommendation.action] = (acc[row.recommendation.action] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardReadTimeRiskPlan/v1",
  status: riskRows.length ? "PASS_WITH_REVIEW_RISKS" : "PASS",
  generatedAt: new Date().toISOString(),
  source: {
    propsPath: rel(propsPath),
    propsSha256: sha256File(propsPath),
    qualityReportPath: rel(qualityPath),
    qualityReportSha256: sha256File(qualityPath),
  },
  policy: {
    readTimeRisksAreNotStructuralBlockers: true,
    fullMp4ReviewMayProceedWithRisks: true,
    finalRenderStillRequiresHumanReview: true,
  },
  summary: {
    riskSceneCount: riskRows.length,
    actionCounts,
  },
  risks: riskRows,
  nextAction: riskRows.length ? "proceed-to-540p-review-and-judge-in-motion" : "proceed-to-storyboard-approval",
};

const md = [
  "# Storyboard Read-Time Risk Plan v1",
  "",
  `Status: ${report.status}`,
  `Risk scenes: ${riskRows.length}`,
  "",
  "Review risks are allowed into 540p review; they are not final-render approval.",
  "",
  "## Risks",
  "",
  ...riskRows.map((row) => `- ${row.beatId}: ${row.recommendation.action} - ${row.visualFocusText} - ${row.recommendation.reason}`),
  "",
].join("\n");

writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
writeFile(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);
writeFile(reportMdPath, md);
writeFile(publicReportMdPath, md);

console.log(JSON.stringify({
  status: report.status,
  riskSceneCount: riskRows.length,
  actionCounts,
  reportPath: rel(reportPath),
  publicReportPath: rel(publicReportPath),
  reportMdPath: rel(reportMdPath),
  publicReportMdPath: rel(publicReportMdPath),
  nextAction: report.nextAction,
}, null, 2));
