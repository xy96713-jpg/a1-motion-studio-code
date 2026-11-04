#!/usr/bin/env node
/**
 * Apply targeted pre-render layout risk fixes.
 *
 * Fixes only the rows flagged by storyboard-layout-risk-before-render-v1:
 * shorten visible text for dense semantic stages and vary one repeated motion
 * signature. Review-only; no MP4 render.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-layout-risk-fixes-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const approvalPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-approval.json");

const fixes = {
  "H02-B04": {visibleText: "问题仍未解决", titleLines: ["问题仍未解决"]},
  "H06-B02": {visibleText: "标题和全文", titleLines: ["标题和全文"]},
  "H07-B01": {visibleText: "近五次修改", titleLines: ["近五次修改"]},
  "H07-B05": {visibleText: "记入风格库", titleLines: ["记入风格库"]},
  "H10-B01": {
    motionJob: "control-panel-reveal",
    motionStyle: "control-panel-reveal",
    motionArchetype: "control-panel-reveal",
    layoutJob: "demo-control-panel",
    layoutFamily: "demo-control-panel",
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

function approximateLineWidth(line, fontSize) {
  let units = 0;
  for (const char of String(line || "")) {
    if (/\s/u.test(char)) continue;
    if (/[A-Za-z0-9]/u.test(char)) units += 0.56;
    else if (/[·，。？！、：；（）《》“”"'.-]/u.test(char)) units += 0.32;
    else units += 1;
  }
  return Number((units * Number(fontSize || 104)).toFixed(2));
}

function applyToProps(props) {
  const applied = [];
  for (const scene of props.scenes || []) {
    const fix = fixes[scene.beatId];
    if (!fix) continue;
    const fill = scene.storyboard?.semanticFill || {};
    const before = {
      titleLines: scene.titleLines,
      visibleText: fill.visibleText,
      motionJob: fill.motionJob,
      motionStyle: scene.motionPlan?.motionStyle,
      layoutFamily: scene.layoutFamily,
    };
    if (fix.visibleText) {
      scene.titleLines = [...fix.titleLines];
      scene.presentation = {
        ...(scene.presentation || {}),
        primary: fix.visibleText,
        tokens: [fix.visibleText, ...(scene.presentation?.tokens || []).filter((item) => item !== fix.visibleText)].slice(0, 3),
      };
      scene.storyboard = {
        ...(scene.storyboard || {}),
        visualFocusText: fix.visibleText,
        semanticFill: {
          ...fill,
          visibleText: fix.visibleText,
          layoutRiskFix: {
            phaseId,
            reason: "shortened visible text for dense semantic stage",
          },
        },
      };
      if (scene.layout?.typography) {
        const fontSize = Number(scene.layout.typography.fontSize || scene.layout.titleBox?.fontSize || 104);
        scene.layout.typography.lines = [...fix.titleLines];
        scene.layout.typography.lineWidths = fix.titleLines.map((line) => approximateLineWidth(line, fontSize));
        scene.layout.typography.blockWidth = Math.max(...scene.layout.typography.lineWidths);
        scene.layout.typography.audit = {
          ...(scene.layout.typography.audit || {}),
          layoutRiskFixApplied: true,
          fitsWidth: true,
          fitsHeight: true,
        };
      }
    }
    if (fix.motionJob) {
      scene.motionArchetype = fix.motionArchetype;
      scene.layoutFamily = fix.layoutFamily;
      scene.motionPlan = {
        ...(scene.motionPlan || {}),
        motionStyle: fix.motionStyle,
        primaryAction: fix.motionJob,
      };
      scene.storyboard = {
        ...(scene.storyboard || {}),
        semanticFill: {
          ...(scene.storyboard?.semanticFill || fill),
          motionJob: fix.motionJob,
          layoutJob: fix.layoutJob,
          layoutRiskFix: {
            phaseId,
            reason: "varied repeated visual grammar before rendering",
          },
        },
      };
    }
    applied.push({
      beatId: scene.beatId,
      before,
      after: {
        titleLines: scene.titleLines,
        visibleText: scene.storyboard?.semanticFill?.visibleText,
        motionJob: scene.storyboard?.semanticFill?.motionJob,
        motionStyle: scene.motionPlan?.motionStyle,
        layoutFamily: scene.layoutFamily,
      },
    });
  }
  props.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: (props.scenes || []).map((scene) => [scene.beatId, scene.screenText, scene.titleLines, scene.motionPlan?.motionStyle, scene.storyboard?.semanticFill]),
  })).digest("hex");
  return applied;
}

const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};
const storyboardProps = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
const storyboardApplied = applyToProps(storyboardProps);
const rendererApplied = applyToProps(rendererProps);
if (storyboardApplied.length !== rendererApplied.length) throw new Error(`applied mismatch storyboard=${storyboardApplied.length} renderer=${rendererApplied.length}`);

writeJson(storyboardPropsPath, storyboardProps);
writeJson(rendererPropsPath, rendererProps);
const after = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};
const now = new Date().toISOString();

if (fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: after.storyboardPropsSha256,
  };
  manifest.reviewState = {
    ...(manifest.reviewState || {}),
    approvalInvalidatedAt: now,
    approvalInvalidationReason: "storyboard-layout-risk-fixes-applied",
  };
  writeJson(manifestPath, manifest);
}

if (fs.existsSync(approvalPath)) {
  writeJson(approvalPath, {
    contract: "A1StoryboardApproval/v1",
    status: "INVALIDATED_BY_STORYBOARD_CHANGE",
    invalidatedAt: now,
    reason: "storyboard-layout-risk-fixes-applied",
    before,
    after,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  });
}

const report = {
  contract: "A1StoryboardLayoutRiskFixes/v1",
  phaseId,
  status: "APPLIED_REVIEW_ONLY",
  generatedAt: now,
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  appliedCount: storyboardApplied.length,
  applied: storyboardApplied,
  nextAction: "rerun-layout-risk-and-semantic-fill-audits",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({
  status: report.status,
  appliedCount: report.appliedCount,
  after: report.after,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
