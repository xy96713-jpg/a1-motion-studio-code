#!/usr/bin/env node
/**
 * Audit semantic typography coverage.
 *
 * The gate is not "does text exist"; it verifies typography is editable,
 * varied by semantic role, and not pushed into generated imagery.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-typography-director-audit-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");

const validPresets = new Set(["poster-slam", "cinema-condensed", "keyword-mask", "archive-label", "quiet-subtitle"]);
const strongPattern = /废稿|泛泛|不说人话|不通顺|太枯燥|没解决|问题|硬伤|推翻|方向走|自己.*风格/u;

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

function compact(value = "") {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function rowAudit(scene) {
  const director = scene.storyboard?.typographyDirector || null;
  const issues = [];
  const title = compact(scene.storyboard?.visualFocusText || scene.presentation?.primary || (scene.titleLines || []).join("") || scene.screenText);
  const source = compact(scene.screenText || "");
  const add = (severity, id, detail) => issues.push({severity, id, detail});
  if (!director) {
    return {
      beatId: scene.beatId,
      status: "FAIL",
      issues: [{severity: "blocker", id: "typography-director-missing", detail: "storyboard.typographyDirector is missing"}],
    };
  }
  if (director.contract !== "A1TypographyDirector/v1") add("blocker", "wrong-contract", `got ${director.contract || "missing"}`);
  if (!validPresets.has(director.preset)) add("blocker", "invalid-preset", `got ${director.preset || "missing"}`);
  if (!compact(director.displayText)) add("blocker", "display-text-missing", "displayText is empty");
  if (compact(director.displayText).length > 16 && director.preset === "poster-slam") add("review", "poster-text-too-long", "poster-slam should use a short impact phrase");
  if (director.editableTextLayer !== true) add("blocker", "not-editable-text", "typography must stay editable");
  if (director.imageBakedTextAllowed !== false || director.generatedArtworkTextAllowed !== false) add("blocker", "image-baked-text-allowed", "generated imagery must stay text-free");
  if (strongPattern.test(`${title} ${source}`) && director.preset !== "poster-slam") add("review", "strong-judgement-not-poster-slam", "strong judgement should use impact typography");
  if (/工作台|系统|流程|工作流|模型|API|GPT|Claude|Kimi|DeepSeek|Codex/u.test(`${title} ${source}`) && director.preset === "cinema-condensed" && !director.latinText) add("review", "condensed-latin-missing", "cinema-condensed needs a Latin display word");
  const blockerCount = issues.filter((issue) => issue.severity === "blocker").length;
  return {
    beatId: scene.beatId,
    preset: director.preset,
    displayText: director.displayText,
    latinText: director.latinText || null,
    colorRole: director.colorRole || null,
    motion: director.motion || null,
    status: blockerCount ? "FAIL" : issues.length ? "REVIEW" : "PASS",
    issues,
  };
}

if (!fs.existsSync(propsPath)) throw new Error(`props missing: ${rel(propsPath)}`);
if (!fs.existsSync(rendererPropsPath)) throw new Error(`renderer props missing: ${rel(rendererPropsPath)}`);

const props = readJson(propsPath);
const rendererProps = readJson(rendererPropsPath);
const rows = (props.scenes || []).map(rowAudit);
const rendererRows = (rendererProps.scenes || []).map(rowAudit);
const byStatus = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});
const byPreset = rows.reduce((acc, row) => {
  if (row.preset) acc[row.preset] = (acc[row.preset] || 0) + 1;
  return acc;
}, {});
const presetCount = Object.keys(byPreset).length;
const missingRenderer = rendererRows.filter((row) => row.status === "FAIL").map((row) => row.beatId);
if (presetCount < 4) {
  rows.push({
    beatId: "__global__",
    status: "REVIEW",
    issues: [{severity: "review", id: "typography-preset-variety-low", detail: `only ${presetCount} presets used`}],
  });
  byStatus.REVIEW = (byStatus.REVIEW || 0) + 1;
}
const hasBlocker = rows.some((row) => row.status === "FAIL") || missingRenderer.length > 0;
const hasReview = rows.some((row) => row.status === "REVIEW");
const report = {
  contract: "A1StoryboardTypographyDirectorAudit/v1",
  phaseId,
  status: hasBlocker ? "FAIL" : hasReview ? "PASS_WITH_REVIEW_ITEMS" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    propsPath: rel(propsPath),
    propsSha256: sha256File(propsPath),
    rendererPropsPath: rel(rendererPropsPath),
    rendererPropsSha256: sha256File(rendererPropsPath),
    storyboardRendererHashMatch: sha256File(propsPath) === sha256File(rendererPropsPath),
  },
  summary: {
    rowCount: (props.scenes || []).length,
    byStatus,
    byPreset,
    presetCount,
    missingRendererCount: missingRenderer.length,
  },
  rows,
  rendererFailures: missingRenderer,
  nextAction: hasBlocker
    ? "fix-typography-director-before-preview-or-render"
    : "typography-director-ready-for-stage-preview",
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

if (report.status === "FAIL") process.exitCode = 2;
