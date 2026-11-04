#!/usr/bin/env node
/**
 * Pre-render layout risk audit for the storyboard table.
 *
 * This catches likely occlusion, crowded semantic stages, title-safe issues for
 * generated artwork, and repeated visual grammar before another review MP4 is
 * rendered.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-layout-risk-before-render-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");

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

function visualUnits(value = "") {
  let units = 0;
  for (const char of String(value || "")) {
    if (/\s/u.test(char)) continue;
    if (/[A-Za-z0-9]/u.test(char)) units += 0.56;
    else if (/[·，。？！、：；（）《》“”"'.-]/u.test(char)) units += 0.32;
    else units += 1;
  }
  return Number(units.toFixed(2));
}

function rectOverlapRatio(a, b) {
  if (!a || !b) return 0;
  const left = Math.max(Number(a.x || 0), Number(b.x || 0));
  const top = Math.max(Number(a.y || 0), Number(b.y || 0));
  const right = Math.min(Number(a.x || 0) + Number(a.width || 0), Number(b.x || 0) + Number(b.width || 0));
  const bottom = Math.min(Number(a.y || 0) + Number(a.height || 0), Number(b.y || 0) + Number(b.height || 0));
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
  const minArea = Math.min(
    Number(a.width || 0) * Number(a.height || 0),
    Number(b.width || 0) * Number(b.height || 0),
  );
  return minArea > 0 ? Number((overlap / minArea).toFixed(4)) : 0;
}

function issue(severity, id, detail, recommendation) {
  return {severity, id, detail, recommendation};
}

if (!fs.existsSync(propsPath)) throw new Error(`storyboard props missing: ${rel(propsPath)}`);
const props = readJson(propsPath);
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
const rows = [];

for (const scene of scenes) {
  const fill = scene.storyboard?.semanticFill || {};
  const visibleText = fill.visibleText || scene.storyboard?.visualFocusText || scene.presentation?.primary || (scene.titleLines || []).join("");
  const units = visualUnits(visibleText);
  const assetRoute = fill.assetRoute || "missing";
  const semanticStage = fill.semanticStageKind || scene.storyboard?.semanticDecision?.semanticStageKind || "missing";
  const titleBox = scene.layout?.titleBox || null;
  const stageBox = scene.layout?.stageBox || null;
  const overlapRatio = rectOverlapRatio(titleBox, stageBox);
  const issues = [];

  if (overlapRatio > 0.1) {
    issues.push(issue("blocker", "title-stage-overlap", `title/stage overlap ratio ${overlapRatio}`, "Move titleBox or stageBox before rendering."));
  } else if (overlapRatio > 0.02) {
    issues.push(issue("review-risk", "title-stage-overlap-risk", `title/stage overlap ratio ${overlapRatio}`, "Check still; if visually crowded, move the semantic stage right/down or reduce density."));
  }

  if (assetRoute === "deterministic-semantic-stage" && units > 12) {
    issues.push(issue("review-risk", "semantic-stage-title-too-long", `${units} visible units on semantic stage`, "Shorten visibleText or switch this row to typography-first layout."));
  }

  if (assetRoute === "typography-only" && units > 18) {
    issues.push(issue("review-risk", "typography-title-long", `${units} visible units`, "Split into two intentional lines or shorten the screen phrase."));
  }

  if (assetRoute === "gpt-editorial-artwork" && units > 12) {
    issues.push(issue("review-risk", "generated-artwork-title-safe-risk", `${units} visible units over generated artwork`, "Prompt must reserve strong negative space; otherwise keep generated art as side/stage subject."));
  }

  if (assetRoute === "deterministic-semantic-stage" && /operation-flow|archive-structure|argument-grammar/u.test(semanticStage) && units > 9 && String(fill.fillWhat || "").length > 48) {
    issues.push(issue("review-risk", "dense-stage-and-title-risk", "long visible title plus dense semantic object", "Use fewer nodes, larger title safe area, or convert the row to typography-first."));
  }

  rows.push({
    beatId: scene.beatId,
    macroId: scene.macroId,
    sourceText: scene.screenText,
    visibleText,
    assetRoute,
    semanticStageKind: semanticStage,
    motionJob: fill.motionJob || scene.motionPlan?.motionStyle || scene.motionArchetype || "missing",
    units,
    titleBox,
    stageBox,
    issues,
    status: issues.some((item) => item.severity === "blocker") ? "BLOCKER" : issues.length ? "REVIEW_RISK" : "PASS",
  });
}

let run = [];
for (const row of rows) {
  const signature = `${row.assetRoute}|${row.semanticStageKind}|${row.motionJob}`;
  if (!run.length || run[0].signature === signature) {
    run.push({row, signature});
  } else {
    if (run.length >= 3) {
      for (const entry of run.slice(2)) {
        entry.row.issues.push(issue("review-risk", "repeated-visual-grammar-run", `signature repeated ${run.length} times`, "Assign an alternate motion/layout job before rendering this run."));
        if (entry.row.status === "PASS") entry.row.status = "REVIEW_RISK";
      }
    }
    run = [{row, signature}];
  }
}
if (run.length >= 3) {
  for (const entry of run.slice(2)) {
    entry.row.issues.push(issue("review-risk", "repeated-visual-grammar-run", `signature repeated ${run.length} times`, "Assign an alternate motion/layout job before rendering this run."));
    if (entry.row.status === "PASS") entry.row.status = "REVIEW_RISK";
  }
}

const byStatus = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});
const byIssue = rows.flatMap((row) => row.issues.map((item) => item.id)).reduce((acc, id) => {
  acc[id] = (acc[id] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardLayoutRiskBeforeRenderAudit/v1",
  phaseId,
  status: byStatus.BLOCKER ? "BLOCKED_BY_LAYOUT_RISK" : byStatus.REVIEW_RISK ? "PASS_WITH_LAYOUT_RISKS" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    propsPath: rel(propsPath),
    propsSha256: sha256File(propsPath),
  },
  summary: {
    rowCount: rows.length,
    byStatus,
    byIssue,
  },
  rows,
  nextAction: byStatus.BLOCKER
    ? "repair-layout-blockers-before-any-review-render"
    : byStatus.REVIEW_RISK
      ? "review-layout-risk-rows-in-storyboard-table-before-render-approval"
      : "layout-risk-audit-clear",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
