#!/usr/bin/env node
/**
 * Structural visual-quality gate for cross-project SRT fixtures.
 *
 * This is not rendered aesthetic proof. It verifies that generated fixture
 * props do not collapse into one visual route, one background, or unsafe title
 * handling before later render-based fixture gates exist.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-cross-project-fixture-visual-quality-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const fixturesPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-cross-project-srt-fixtures-v1/report.json");

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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const fixtures = readJsonIfExists(fixturesPath);
const blockers = [];
const rows = [];

if (!fixtures || fixtures.contract !== "A1StoryboardCrossProjectSrtFixtures/v1") {
  blockers.push({id: "missing-cross-project-fixtures", detail: `Missing fixtures report: ${rel(fixturesPath)}`});
}

for (const lane of fixtures?.lanes || []) {
  const propsPath = path.join(root, lane.propsPath);
  const props = readJsonIfExists(propsPath);
  if (!props || !Array.isArray(props.scenes)) {
    rows.push({
      laneId: lane.laneId,
      status: "BLOCKER",
      issues: [{id: "missing-lane-props", detail: `Missing lane props: ${lane.propsPath}`}],
    });
    continue;
  }
  const scenes = props.scenes;
  const issues = [];
  const semanticStages = unique(scenes.map((scene) => scene.storyboard?.semanticDecision?.semanticStageKind));
  const backgrounds = unique(scenes.map((scene) => scene.backgroundState));
  const motionStyles = unique(scenes.map((scene) => scene.motionPlan?.motionStyle || scene.motionArchetype));
  const typographyPresets = unique(scenes.map((scene) => scene.storyboard?.typographyDirector?.preset));
  const titleLines = scenes.flatMap((scene) => scene.titleLines || []);
  const longTitleLines = titleLines.filter((line) => String(line).length > 16);
  const storyArcMissing = scenes.filter((scene) => scene.storyboard?.storyArcSegmentation?.contract !== "A1StoryboardStoryArcSegmentation/v1");
  const typographyMissing = scenes.filter((scene) => scene.storyboard?.typographyDirector?.contract !== "A1TypographyDirector/v1");
  const semanticFillMissing = scenes.filter((scene) => scene.storyboard?.semanticFill?.contract !== "A1StoryboardSemanticFill/v1");
  const semanticFillSourceMismatch = scenes.filter((scene) => scene.storyboard?.semanticFill?.sourceText !== scene.screenText);
  const typographyDisplayMismatch = scenes.filter((scene) => scene.storyboard?.typographyDirector?.displayText !== scene.storyboard?.visualFocusText);
  const currentProjectLeaks = scenes.filter((scene) => {
    const searchable = JSON.stringify({
      screenText: scene.screenText,
      titleLines: scene.titleLines,
      supportTokens: scene.supportTokens,
      semanticFill: scene.storyboard?.semanticFill,
      typographyDirector: scene.storyboard?.typographyDirector,
      presentation: scene.presentation,
    });
    return /喜欢库|讨厌库|风格库|智能写作工作台|vibe coding/u.test(searchable);
  });

  if (semanticStages.length < 2) issues.push({id: "route-collapse", detail: "Lane has fewer than two semantic stage kinds."});
  if (backgrounds.length < 2) issues.push({id: "background-collapse", detail: "Lane has fewer than two background states."});
  if (motionStyles.length < 2) issues.push({id: "motion-collapse", detail: "Lane has fewer than two motion styles."});
  if (typographyPresets.length < 2) issues.push({id: "typography-collapse", detail: "Lane has fewer than two typography presets."});
  if (longTitleLines.length) issues.push({id: "long-title-lines", detail: `${longTitleLines.length} title lines exceed 16 Chinese characters.`});
  if (storyArcMissing.length) issues.push({id: "missing-story-arc", detail: `${storyArcMissing.length} scenes lack storyArcSegmentation metadata.`});
  if (typographyMissing.length) issues.push({id: "missing-typography-director", detail: `${typographyMissing.length} scenes lack typographyDirector metadata.`});
  if (semanticFillMissing.length) issues.push({id: "missing-semantic-fill", detail: `${semanticFillMissing.length} scenes lack semanticFill metadata.`});
  if (semanticFillSourceMismatch.length) issues.push({id: "semantic-fill-source-mismatch", detail: `${semanticFillSourceMismatch.length} semanticFill rows do not match the generated SRT text.`});
  if (typographyDisplayMismatch.length) issues.push({id: "typography-display-mismatch", detail: `${typographyDisplayMismatch.length} typography display rows do not match the visual focus text.`});
  if (currentProjectLeaks.length) issues.push({id: "current-project-phrase-leak", detail: `${currentProjectLeaks.length} scenes include old writing-workbench-specific phrases in visible or backend decision fields.`});

  rows.push({
    laneId: lane.laneId,
    status: issues.length ? "REVIEW_RISK" : "PASS",
    sceneCount: scenes.length,
    semanticStages,
    backgrounds,
    motionStyles,
    typographyPresets,
    maxTitleLineLength: Math.max(0, ...titleLines.map((line) => String(line).length)),
    storyArcCoverage: scenes.length - storyArcMissing.length,
    issues,
  });
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
  contract: "A1StoryboardCrossProjectFixtureVisualQuality/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : rows.every((row) => row.status === "PASS") ? "PASS" : "REVIEW_RISKS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  renderProof: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    fixturesPath: rel(fixturesPath),
    fixturesSha256: sha256File(fixturesPath),
  },
  summary: {
    laneCount: rows.length,
    blockerCount: blockers.length,
    byStatus,
    byIssue,
  },
  blockers,
  rows,
  nextAction: rows.every((row) => row.status === "PASS")
    ? "cross-project-structural-visual-quality-clear"
    : "fix-cross-project-generator-route-background-or-title-collapse",
};

const md = [
  "# Cross-Project Fixture Visual Quality v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- lanes: ${report.summary.laneCount}`,
  `- blockers: ${report.summary.blockerCount}`,
  `- by status: ${JSON.stringify(report.summary.byStatus)}`,
  `- by issue: ${JSON.stringify(report.summary.byIssue)}`,
  "",
  "## Rows",
  "",
  ...rows.map((row) => [
    `### ${row.laneId}`,
    "",
    `- status: ${row.status}`,
    `- semantic stages: ${row.semanticStages?.join(", ")}`,
    `- backgrounds: ${row.backgrounds?.join(", ")}`,
    `- motion styles: ${row.motionStyles?.join(", ")}`,
    ...(row.issues || []).map((issue) => `- issue: ${issue.id} - ${issue.detail}`),
    "",
  ].join("\n")),
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
