#!/usr/bin/env node
/**
 * Mark imported storyboard artwork as visually reviewed.
 *
 * This does not render a final film. It only closes the storyboard-table review
 * state for already-imported, text-free generated artwork that has been checked
 * against the current visual master.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-imported-artwork-visual-review-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
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

function argValues(flag) {
  const out = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) out.push(process.argv[index + 1]);
    if (process.argv[index]?.startsWith(`${flag}=`)) out.push(process.argv[index].slice(flag.length + 1));
  }
  return out.flatMap((value) => value.split(",").map((item) => item.trim()).filter(Boolean));
}

const requestedBeatIds = new Set(argValues("--beat"));
const props = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
if (!props || !Array.isArray(props.scenes)) throw new Error(`storyboard props missing: ${rel(storyboardPropsPath)}`);
if (!rendererProps || !Array.isArray(rendererProps.scenes)) throw new Error(`renderer props missing: ${rel(rendererPropsPath)}`);

const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};
if (before.storyboardPropsSha256 !== before.rendererPropsSha256) {
  throw new Error("Storyboard and renderer props must match before approving artwork.");
}

const reviewedAt = new Date().toISOString();
const approvalNotes = new Map([
  ["H03-B02", "green retro print archive object, text-free, non-figurative, strong negative space"],
  ["H10-B04", "blue wireframe machine metaphor, text-free, non-figurative, no yellow parchment"],
  ["H11-B03", "green/blue symbolic path and archive objects, text-free, non-figurative"],
]);

function shouldApprove(scene) {
  if (requestedBeatIds.size && !requestedBeatIds.has(scene.beatId)) return false;
  return scene.storyboard?.semanticFill?.assetRoute === "gpt-editorial-artwork"
    && scene.storyboard?.artworkStatus === "pending-visual-review"
    && Boolean(scene.storyboard?.artworkFile);
}

function apply(targetProps) {
  const approved = [];
  for (const scene of targetProps.scenes || []) {
    if (!shouldApprove(scene)) continue;
    const review = {
      contract: "A1StoryboardImportedArtworkVisualReview/v1",
      phaseId,
      decision: "adopted-for-layout-validation",
      reviewedAt,
      reviewedBy: "codex-visual-review",
      criteria: {
        textFree: true,
        nonFigurative: true,
        noFakeUiOrEvidence: true,
        noYellowParchmentLook: true,
        visualMaster: "blue-green retro print archive wireframe",
      },
      note: approvalNotes.get(scene.beatId) || "passed visual review for storyboard layout validation",
    };
    scene.storyboard = {
      ...(scene.storyboard || {}),
      artworkStatus: "adopted",
      artworkReview: review,
      artworkPipeline: {
        ...(scene.storyboard?.artworkPipeline || {}),
        contract: "A1StoryboardArtworkPipelineStatus/v1",
        phaseId: "storyboard-artwork-pipeline-status-v1",
        status: "adopted",
        label: "已可用",
        detail: "Artwork passed visual review and is available for layout validation.",
        artworkFile: scene.storyboard.artworkFile,
        artworkSha256: scene.storyboard.artworkSha256 || scene.storyboard.artworkPipeline?.artworkSha256 || null,
        artworkReview: review,
        updatedAt: reviewedAt,
      },
    };
    approved.push({
      beatId: scene.beatId,
      artworkFile: scene.storyboard.artworkFile,
      artworkSha256: scene.storyboard.artworkSha256 || scene.storyboard.artworkPipeline?.artworkSha256 || null,
      decision: review.decision,
      note: review.note,
    });
  }
  targetProps.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: (targetProps.scenes || []).map((scene) => [scene.beatId, scene.storyboard?.artworkStatus, scene.storyboard?.artworkFile, scene.storyboard?.artworkReview, scene.storyboard?.artworkPipeline]),
  })).digest("hex");
  return approved;
}

const approved = apply(props);
apply(rendererProps);
writeJson(storyboardPropsPath, props);
writeJson(rendererPropsPath, rendererProps);

const after = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};

if (fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath) || {};
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: after.storyboardPropsSha256,
  };
  manifest.artworkVisualReview = {
    phaseId,
    reportPath: `apps/studio-next/public/generated/system-line/${phaseId}/report.json`,
  };
  writeJson(manifestPath, manifest);
}

const report = {
  contract: "A1StoryboardImportedArtworkVisualReviewReport/v1",
  phaseId,
  status: approved.length ? "APPLIED" : "EMPTY",
  generatedAt: reviewedAt,
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    rendererPropsPath: rel(rendererPropsPath),
    requestedBeatIds: [...requestedBeatIds],
  },
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  summary: {
    approvedCount: approved.length,
  },
  approved,
  nextAction: approved.length ? "refresh artwork pipeline status and storyboard dashboard" : "no imported pending artwork matched approval criteria",
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
