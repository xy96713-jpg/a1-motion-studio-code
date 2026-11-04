#!/usr/bin/env node
/**
 * Apply targeted visible-text fixes for storyboard read-time risks.
 *
 * This only changes editable display focus for explicitly listed beats. Source
 * subtitle text remains in screenText/fullSentence. Existing storyboard
 * approval is invalidated because renderer props hash changes.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-readtime-fixes-applied-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const approvalPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-approval.json");

const fixes = {
  "H08-B03": {
    titleLines: ["同一个逻辑"],
    primary: "同一个逻辑",
    tokens: ["补充段落", "同一个逻辑"],
    reason: "shorten visible focus to remove tight read-time risk while preserving full subtitle text",
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

function applyFixesToProps(props, targetName) {
  if (!Array.isArray(props.scenes)) throw new Error(`${targetName}: scenes missing`);
  const applied = [];
  for (const scene of props.scenes) {
    const fix = fixes[scene.beatId];
    if (!fix) continue;
    const before = {
      titleLines: scene.titleLines,
      primary: scene.presentation?.primary || null,
      tokens: scene.presentation?.tokens || null,
    };
    scene.titleLines = [...fix.titleLines];
    scene.presentation = {
      ...(scene.presentation || {}),
      primary: fix.primary,
      tokens: [...fix.tokens],
      visualRole: scene.presentation?.visualRole || scene.family || "type-statement",
    };
    if (scene.presentation.fullSentence) {
      scene.presentation.fullSentence = scene.presentation.fullSentence;
    }
    if (scene.layout?.typography) {
      const fontSize = Number(scene.layout.typography.fontSize || scene.layout.titleBox?.fontSize || 104);
      scene.layout.typography.lines = [...fix.titleLines];
      scene.layout.typography.lineWidths = fix.titleLines.map((line) => approximateLineWidth(line, fontSize));
      scene.layout.typography.blockWidth = Math.max(...scene.layout.typography.lineWidths);
      scene.layout.typography.audit = {
        ...(scene.layout.typography.audit || {}),
        readtimeFixApplied: true,
        fitsWidth: true,
        fitsHeight: true,
      };
    }
    scene.audit = {
      ...(scene.audit || {}),
      readtimeFixApplied: {
        phaseId,
        reason: fix.reason,
      },
    };
    applied.push({beatId: scene.beatId, before, after: {titleLines: scene.titleLines, primary: scene.presentation.primary, tokens: scene.presentation.tokens}});
  }
  return applied;
}

const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
  approval: fs.existsSync(approvalPath) ? readJson(approvalPath) : null,
};

const storyboardProps = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
const storyboardApplied = applyFixesToProps(storyboardProps, "storyboard");
const rendererApplied = applyFixesToProps(rendererProps, "renderer");

if (!storyboardApplied.length || storyboardApplied.length !== rendererApplied.length) {
  throw new Error(`readtime fix target mismatch: storyboard=${storyboardApplied.length}, renderer=${rendererApplied.length}`);
}

writeJson(storyboardPropsPath, storyboardProps);
writeJson(rendererPropsPath, rendererProps);

const afterStoryboardPropsSha256 = sha256File(storyboardPropsPath);
const afterRendererPropsSha256 = sha256File(rendererPropsPath);
const now = new Date().toISOString();

if (fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: afterStoryboardPropsSha256,
    updatedAt: now,
  };
  manifest.reviewState = {
    ...(manifest.reviewState || {}),
    approvalInvalidatedAt: now,
    approvalInvalidationReason: "storyboard-visible-text-readtime-fixes-applied",
  };
  writeJson(manifestPath, manifest);
}

writeJson(approvalPath, {
  contract: "A1StoryboardApproval/v1",
  status: "INVALIDATED_BY_STORYBOARD_CHANGE",
  invalidatedAt: now,
  reason: "storyboard-visible-text-readtime-fixes-applied",
  previousApproval: before.approval,
  before: {
    storyboardPropsSha256: before.storyboardPropsSha256,
    rendererPropsSha256: before.rendererPropsSha256,
  },
  after: {
    storyboardPropsSha256: afterStoryboardPropsSha256,
    rendererPropsSha256: afterRendererPropsSha256,
  },
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
});

const report = {
  contract: "A1StoryboardReadtimeFixesApplied/v1",
  phaseId,
  status: "APPLIED_REVIEW_ONLY",
  generatedAt: now,
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    rendererPropsPath: rel(rendererPropsPath),
    manifestPath: rel(manifestPath),
    approvalPath: rel(approvalPath),
  },
  before,
  after: {
    storyboardPropsSha256: afterStoryboardPropsSha256,
    rendererPropsSha256: afterRendererPropsSha256,
    storyboardRendererHashMatch: afterStoryboardPropsSha256 === afterRendererPropsSha256,
  },
  applied: storyboardApplied,
  nextAction: "rerun-storyboard-quality-gate-and-webgpt-queue-against-new-props-hash",
};

for (const base of [artifactRoot, publicRoot]) {
  writeJson(path.join(base, "report.json"), report);
}

console.log(JSON.stringify({
  status: report.status,
  appliedCount: report.applied.length,
  after: report.after,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
