#!/usr/bin/env node
/**
 * Audit the renderer contract for typography-led storyboard shots.
 *
 * This gate is intentionally static + data-driven. It does not claim visual
 * acceptance; it catches contract drift before still/MP4 rendering:
 * - generated motionStyle values must be accepted by renderer + Studio schemas
 * - typography-led presets must be owned by typography, not legacy semantic cards
 * - long text / right-side collision risks are surfaced for still sampling
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-typography-render-contract-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPath = path.join(root, "remotion-renderer/src/MicrobeatLayeredFullReview.tsx");
const studioPlanPath = path.join(root, "apps/studio-next/src/lib/a1-microbeat-layered-full-plan.ts");

const typographyOwnedPresets = new Set(["poster-slam", "cinema-condensed", "keyword-mask", "archive-label", "quiet-subtitle"]);
const strongPresets = new Set(["poster-slam", "cinema-condensed"]);
const labelPresets = new Set(["archive-label", "quiet-subtitle"]);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(read(filePath));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function compact(value = "") {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function unique(values) {
  return [...new Set(values)].sort();
}

function textWidthRisk(scene) {
  const director = scene.storyboard?.typographyDirector;
  const text = compact(director?.displayText || scene.presentation?.primary || "");
  const chars = Array.from(text).length;
  const preset = director?.preset || "missing";
  if (preset === "poster-slam" && chars > 14) return "poster-long-text";
  if ((preset === "keyword-mask" || preset === "quiet-subtitle") && chars > 12) return "mid-title-long-text";
  if (preset === "archive-label" && chars > 13) return "label-long-text";
  return null;
}

function sampleFrame(scene) {
  return Math.round((scene.startFrame || 0) + (scene.durationInFrames || 1) * 0.45);
}

for (const required of [propsPath, storyboardPropsPath, rendererPath, studioPlanPath]) {
  if (!fs.existsSync(required)) throw new Error(`required file missing: ${rel(required)}`);
}

const props = readJson(propsPath);
const storyboardProps = readJson(storyboardPropsPath);
const rendererSource = read(rendererPath);
const studioSource = read(studioPlanPath);
const scenes = props.scenes || [];
const storyboardScenes = storyboardProps.scenes || [];

const motionStyles = unique(scenes.map((scene) => scene.motionPlan?.motionStyle).filter(Boolean));
const rendererMissingMotionStyles = motionStyles.filter((style) => !rendererSource.includes(`"${style}"`));
const studioMissingMotionStyles = motionStyles.filter((style) => !studioSource.includes(`"${style}"`));

const presetCounts = {};
const rows = scenes.map((scene, index) => {
  const director = scene.storyboard?.typographyDirector || null;
  const preset = director?.preset || "missing";
  presetCounts[preset] = (presetCounts[preset] || 0) + 1;
  const issues = [];
  if (!director) issues.push({severity: "blocker", id: "typography-director-missing"});
  if (director && !typographyOwnedPresets.has(preset)) issues.push({severity: "blocker", id: "unknown-typography-preset", detail: preset});
  if (director?.imageBakedTextAllowed !== false || director?.generatedArtworkTextAllowed !== false) issues.push({severity: "blocker", id: "image-baked-text-not-forbidden"});
  const risk = textWidthRisk(scene);
  if (risk) issues.push({severity: "review", id: risk, detail: director?.displayText || scene.presentation?.primary || ""});
  if (strongPresets.has(preset) && !rendererSource.includes("TypographyDominantSymbolicBackdrop")) {
    issues.push({severity: "blocker", id: "strong-typography-symbolic-backdrop-missing"});
  }
  if (typographyOwnedPresets.has(preset) && !rendererSource.includes("typographyPrimary")) {
    issues.push({severity: "blocker", id: "typography-primary-gate-missing"});
  }
  return {
    index,
    beatId: scene.beatId,
    preset,
    displayText: director?.displayText || null,
    latinText: director?.latinText || null,
    colorRole: director?.colorRole || null,
    motionStyle: scene.motionPlan?.motionStyle || null,
    frame: sampleFrame(scene),
    status: issues.some((issue) => issue.severity === "blocker") ? "FAIL" : issues.length ? "REVIEW" : "PASS",
    issues,
  };
});

const typographyPrimaryGateMissing = [...typographyOwnedPresets].filter((preset) => !rendererSource.includes(`typographyPreset==="${preset}"`) && !rendererSource.includes(`typographyDirectorPreset==="${preset}"`));
const legacyReturnRules = [];
if (/if\(preset==="archive-label"\)return null/u.test(rendererSource)) legacyReturnRules.push("archive-label-hidden-by-semantic-stage");
if (/if\(preset==="quiet-subtitle"\)return null/u.test(rendererSource)) legacyReturnRules.push("quiet-subtitle-hidden-by-semantic-stage");
const aestheticMarkers = [
  "oversized-condensed-poster",
  "anamorphic-condensed-title",
  "keyword-packaging-mask",
];
const missingAestheticMarkers = aestheticMarkers.filter((marker) => !rendererSource.includes(marker));
const motionAestheticMarkers = [
  "TypographyMotionAestheticV1Overlay",
  "data-a1-motion-aesthetic-v1",
  "directional-streak-field",
  "registration-echo-block",
  "keyword-follow-through",
];
const missingMotionAestheticMarkers = motionAestheticMarkers.filter((marker) => !rendererSource.includes(marker));

const sampleRows = [];
for (const preset of [...typographyOwnedPresets]) {
  const presetRows = rows.filter((row) => row.preset === preset);
  if (!presetRows.length) continue;
  sampleRows.push(presetRows[0]);
  const mid = presetRows[Math.floor(presetRows.length / 2)];
  if (mid && mid.beatId !== presetRows[0].beatId) sampleRows.push(mid);
  const last = presetRows[presetRows.length - 1];
  if (last && !sampleRows.some((row) => row.beatId === last.beatId)) sampleRows.push(last);
}

const blockerIssues = [];
if (sha256(propsPath) !== sha256(storyboardPropsPath)) blockerIssues.push({id: "storyboard-renderer-props-hash-mismatch"});
if (rendererMissingMotionStyles.length) blockerIssues.push({id: "renderer-motion-style-schema-missing", values: rendererMissingMotionStyles});
if (studioMissingMotionStyles.length) blockerIssues.push({id: "studio-motion-style-schema-missing", values: studioMissingMotionStyles});
if (typographyPrimaryGateMissing.length) blockerIssues.push({id: "typography-primary-gate-missing-presets", values: typographyPrimaryGateMissing});
if (legacyReturnRules.length) blockerIssues.push({id: "legacy-typography-hidden-rules", values: legacyReturnRules});
if (missingAestheticMarkers.length) blockerIssues.push({id: "typography-aesthetic-v1-markers-missing", values: missingAestheticMarkers});
if (missingMotionAestheticMarkers.length) blockerIssues.push({id: "typography-motion-aesthetic-v1-markers-missing", values: missingMotionAestheticMarkers});

const rowFailures = rows.filter((row) => row.status === "FAIL");
const rowReviews = rows.filter((row) => row.status === "REVIEW");
const status = blockerIssues.length || rowFailures.length ? "FAIL" : rowReviews.length ? "PASS_WITH_REVIEW_ITEMS" : "PASS";
const report = {
  contract: "A1StoryboardTypographyRenderContractAudit/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  source: {
    propsPath: rel(propsPath),
    propsSha256: sha256(propsPath),
    storyboardPropsPath: rel(storyboardPropsPath),
    storyboardPropsSha256: sha256(storyboardPropsPath),
    rendererPath: rel(rendererPath),
    studioPlanPath: rel(studioPlanPath),
  },
  summary: {
    sceneCount: scenes.length,
    storyboardSceneCount: storyboardScenes.length,
    motionStyleCount: motionStyles.length,
    presetCounts,
    failCount: rowFailures.length,
    reviewCount: rowReviews.length,
    sampleCount: sampleRows.length,
    aestheticV1MarkerCount: aestheticMarkers.length - missingAestheticMarkers.length,
    motionAestheticV1MarkerCount: motionAestheticMarkers.length - missingMotionAestheticMarkers.length,
  },
  blockerIssues,
  motionStyles,
  rendererMissingMotionStyles,
  studioMissingMotionStyles,
  rows,
  reviewRows: rowReviews,
  sampleRows: sampleRows.map((row) => ({beatId: row.beatId, preset: row.preset, frame: row.frame, displayText: row.displayText})),
  nextAction: status === "FAIL" ? "fix-render-contract-before-preview" : rowReviews.length ? "render-review-samples-for-layout-risk" : "typography-render-contract-ready",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  blockerIssues: report.blockerIssues,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
if (status === "FAIL") process.exitCode = 2;
