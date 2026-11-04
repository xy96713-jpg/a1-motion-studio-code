#!/usr/bin/env node
/**
 * Reconcile stale imported WebGPT artwork after semantic storyboard changes.
 *
 * Some old imports remain semantically valid even after props hash changes.
 * This script re-attaches only explicitly reusable artwork to the current
 * storyboard rows; mismatched artwork stays queued for regeneration.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-stale-artwork-reconcile-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const importReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-webgpt-artwork-import-v1/report.json");

const reuseDecisions = {
  "H11-B02": {
    decision: "reuse-pending-review",
    reason: "Old artwork was generated for the same core visual focus: not overturning/restarting from scratch.",
  },
  "H11-B03": {
    decision: "reuse-pending-review",
    reason: "Old artwork was generated for the same direction/style convergence concept.",
  },
};

const regenerateReasons = {
  "H03-B02": "Current row is about a high-completion failed draft; old artwork targeted unresolved problem.",
  "H05-B04": "Current row is about checking hard flaws after closing draft; old artwork targeted generic smooth talk.",
  "H10-B04": "Current row is about remaining AI-flavor/no-human-speech defects; old artwork targeted controlled workflow.",
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

function artworkFileFromLocalPath(localPath) {
  const marker = "apps/studio-next/public/generated-artwork/";
  const index = String(localPath || "").indexOf(marker);
  return index === -1 ? null : String(localPath).slice(index + marker.length);
}

function apply(props, importedByBeat) {
  const rows = [];
  for (const scene of props.scenes || []) {
    if (scene.storyboard?.semanticFill?.assetRoute !== "gpt-editorial-artwork") continue;
    const imported = importedByBeat.get(scene.beatId);
    const reuse = reuseDecisions[scene.beatId];
    if (reuse && imported) {
      const artworkFile = artworkFileFromLocalPath(imported.localPath);
      scene.storyboard = {
        ...(scene.storyboard || {}),
        artworkStatus: "pending-visual-review",
        artworkFile,
        artworkPath: imported.localPath,
        artworkSource: "chatgpt-web-browser-automation",
        artworkSha256: imported.sha256,
        artworkReviewOnly: true,
        rendererAdoptionAllowed: false,
        factualEvidenceAllowed: false,
        staleArtworkReconcile: {
          phaseId,
          decision: reuse.decision,
          reason: reuse.reason,
          sourceImportSha256: imported.sha256,
        },
      };
      rows.push({beatId: scene.beatId, decision: reuse.decision, reason: reuse.reason, artworkFile});
    } else {
      scene.storyboard = {
        ...(scene.storyboard || {}),
        artworkStatus: "generation-queued",
        artworkFile: null,
        artworkPath: null,
        artworkSha256: null,
        staleArtworkReconcile: {
          phaseId,
          decision: "regenerate",
          reason: regenerateReasons[scene.beatId] || "No current semantic reuse decision.",
        },
      };
      rows.push({beatId: scene.beatId, decision: "regenerate", reason: regenerateReasons[scene.beatId] || "No current semantic reuse decision."});
    }
  }
  props.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: (props.scenes || []).map((scene) => [scene.beatId, scene.storyboard?.semanticFill, scene.storyboard?.artworkStatus, scene.storyboard?.artworkFile, scene.storyboard?.staleArtworkReconcile]),
  })).digest("hex");
  return rows;
}

const importReport = readJson(importReportPath);
const importedByBeat = new Map((importReport.imported || []).map((item) => [item.beatId, item]));
const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
  importReportSha256: sha256File(importReportPath),
};

const storyboardProps = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
const storyboardRows = apply(storyboardProps, importedByBeat);
const rendererRows = apply(rendererProps, importedByBeat);
if (storyboardRows.length !== rendererRows.length) throw new Error(`reconcile mismatch storyboard=${storyboardRows.length} renderer=${rendererRows.length}`);

writeJson(storyboardPropsPath, storyboardProps);
writeJson(rendererPropsPath, rendererProps);
const after = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};

if (fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: after.storyboardPropsSha256,
  };
  manifest.assets = {
    ...(manifest.assets || {}),
    pendingVisualReviewArtworkCount: (storyboardProps.scenes || []).filter((scene) => scene.storyboard?.artworkStatus === "pending-visual-review").length,
    generatedArtworkCount: (storyboardProps.scenes || []).filter((scene) => scene.storyboard?.artworkFile).length,
  };
  writeJson(manifestPath, manifest);
}

const report = {
  contract: "A1StoryboardStaleArtworkReconcile/v1",
  phaseId,
  status: "APPLIED_REVIEW_ONLY",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  summary: {
    rowCount: storyboardRows.length,
    reusedPendingReviewCount: storyboardRows.filter((row) => row.decision === "reuse-pending-review").length,
    regenerateCount: storyboardRows.filter((row) => row.decision === "regenerate").length,
  },
  rows: storyboardRows,
  nextAction: "prepare-generation-queue-for-regenerate-rows-and-review-reused-artwork",
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
