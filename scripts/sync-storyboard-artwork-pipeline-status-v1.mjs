#!/usr/bin/env node
/**
 * Sync artwork generation/import status back into each storyboard row.
 *
 * This keeps /storyboard simple: rows show one user-facing status, while
 * detailed queue/import evidence stays available in collapsed details.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-artwork-pipeline-status-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const bridgeManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-webgpt-artwork-bridge-v1/manifest.json");
const queuePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-webgpt-session-queue-v1/queue.json");
const importReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-webgpt-artwork-import-v1/report.json");

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

const props = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
if (!props || !Array.isArray(props.scenes)) throw new Error(`storyboard props missing: ${rel(storyboardPropsPath)}`);
if (!rendererProps || !Array.isArray(rendererProps.scenes)) throw new Error(`renderer props missing: ${rel(rendererPropsPath)}`);

const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};
const bridge = readJson(bridgeManifestPath);
const queue = readJson(queuePath);
const importReport = readJson(importReportPath);
const currentSceneByBeat = new Map((props.scenes || []).map((scene) => [scene.beatId, scene]));
const importedItems = importReport?.imported || [];
const importedItemMatchesScene = (item) => {
  const scene = currentSceneByBeat.get(item.beatId);
  if (!scene) return false;
  const expectedSha = scene.storyboard?.artworkSha256 || null;
  const importedSha = item.sha256 || item.artworkSha256 || null;
  return Boolean(
    scene.storyboard?.artworkFile
    && importedSha
    && expectedSha === importedSha
  );
};
const importMatchesCurrent = importedItems.length > 0 && importedItems.every(importedItemMatchesScene);
const importedByBeat = new Map(importedItems.filter(importedItemMatchesScene).map((item) => [item.beatId, item]));
const staleImportedByBeat = new Map(importedItems.filter((item) => !importedItemMatchesScene(item)).map((item) => [item.beatId, item]));
const queueByBeat = new Map((queue?.jobs || []).map((job) => [job.beatId, job]));
const bridgeByBeat = new Map((bridge?.jobs || []).map((job) => [job.beatId, job]));

function statusFor(scene) {
  const fill = scene.storyboard?.semanticFill || {};
  if (fill.assetRoute !== "gpt-editorial-artwork") {
    return {
      status: "not-needed",
      label: "无需生图",
      detail: "This row is deterministic or typography-only.",
    };
  }
  if (scene.storyboard?.artworkStatus === "adopted" && scene.storyboard?.artworkFile) {
    return {
      status: "adopted",
      label: "已可用",
      detail: "Artwork passed visual review and is available for layout validation.",
      artworkFile: scene.storyboard.artworkFile,
      artworkSha256: scene.storyboard.artworkSha256 || null,
      artworkReview: scene.storyboard.artworkReview || null,
    };
  }
  if (scene.storyboard?.artworkStatus === "pending-visual-review" && scene.storyboard?.artworkFile) {
    return {
      status: "imported-pending-review",
      label: "待验收",
      detail: "Artwork is already attached to the current storyboard row and waiting for visual review.",
      artworkFile: scene.storyboard.artworkFile,
      artworkSha256: scene.storyboard.artworkSha256 || null,
    };
  }
  const imported = importedByBeat.get(scene.beatId);
  if (imported) {
    return {
      status: "imported-pending-review",
      label: "待验收",
      detail: "Current-hash artwork is imported and waiting for visual review.",
      imported,
    };
  }
  const queueJob = queueByBeat.get(scene.beatId);
  const bridgeJob = bridgeByBeat.get(scene.beatId);
  if (scene.storyboard?.artworkStatus === "generation-queued" && queueJob) {
    return {
      status: "queued-for-generation",
      label: "待生成",
      detail: "Prompt is queued for WebGPT generation.",
      expectedFileName: queueJob.expectedFileName || bridgeJob?.expectedFileName || null,
      promptSha256: queueJob.promptSha256 || bridgeJob?.promptSha256 || null,
    };
  }
  const stale = staleImportedByBeat.get(scene.beatId);
  if (stale) {
    return {
      status: "stale-import-needs-regeneration",
      label: "旧图需重来",
      detail: "An older storyboard hash has imported artwork, but current storyboard changed.",
      staleImportSha256: stale.sha256 || null,
    };
  }
  return {
    status: queueJob ? "queued-for-generation" : "needs-queue",
    label: queueJob ? "待生成" : "待入队",
    detail: queueJob ? "Prompt is queued for WebGPT generation." : "No queue job is available for this row.",
    expectedFileName: queueJob?.expectedFileName || bridgeJob?.expectedFileName || null,
    promptSha256: queueJob?.promptSha256 || bridgeJob?.promptSha256 || null,
  };
}

function apply(targetProps) {
  const rows = [];
  for (const scene of targetProps.scenes || []) {
    const pipeline = statusFor(scene);
    scene.storyboard = {
      ...(scene.storyboard || {}),
      artworkPipeline: {
        contract: "A1StoryboardArtworkPipelineStatus/v1",
        phaseId,
        ...pipeline,
      },
    };
    rows.push({beatId: scene.beatId, assetRoute: scene.storyboard?.semanticFill?.assetRoute || null, ...pipeline});
  }
  targetProps.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: (targetProps.scenes || []).map((scene) => [scene.beatId, scene.storyboard?.semanticFill, scene.storyboard?.artworkPipeline]),
  })).digest("hex");
  return rows;
}

const rows = apply(props);
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
  manifest.artworkPipeline = {
    phaseId,
    reportPath: `apps/studio-next/public/generated/system-line/${phaseId}/report.json`,
  };
  writeJson(manifestPath, manifest);
}

const byStatus = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardArtworkPipelineStatusReport/v1",
  phaseId,
  status: "SYNCED",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    bridgeManifestPath: rel(bridgeManifestPath),
    queuePath: rel(queuePath),
    importReportPath: rel(importReportPath),
    importMatchesCurrent,
    importBindingMode: "beat-and-asset-sha256",
  },
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  summary: {
    rowCount: rows.length,
    byStatus,
  },
  rows,
  nextAction: "use-storyboard-table-filters-and-collapsed-details-for-artwork-review",
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
