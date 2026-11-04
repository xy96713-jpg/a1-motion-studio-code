#!/usr/bin/env node
/**
 * Build a targeted visual-error fix queue for the current storyboard authority.
 *
 * This converts review-film feedback such as occlusion, repeated motion, and
 * over-dense semantic staging into beat-scoped repair items. It is review-only:
 * no renderer props, approval, or MP4 authority is mutated here.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-visual-error-fix-queue-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const qualityPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-quality-gate-v1/report.json");
const reviewMp4Path = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-540p-review-mp4-v1/report.json");

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function sha256File(filePath) {
  return fs.existsSync(filePath)
    ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
    : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function writeBoth(name, value) {
  for (const base of [artifactRoot, publicRoot]) {
    fs.mkdirSync(base, {recursive: true});
    fs.writeFileSync(path.join(base, name), value, "utf8");
  }
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

const props = readJson(propsPath);
if (!props || !Array.isArray(props.scenes)) throw new Error(`missing storyboard props: ${rel(propsPath)}`);

const quality = readJson(qualityPath);
const reviewMp4 = readJson(reviewMp4Path);
const qualityByBeat = new Map((quality?.scenes || []).map((scene) => [scene.beatId, scene]));
const scenes = props.scenes;
const items = [];

function addItem(item) {
  items.push({
    id: `${phaseId}-${String(items.length + 1).padStart(3, "0")}-${item.beatId}`,
    status: "open",
    priority: item.priority || 3,
    ...item,
  });
}

for (const scene of scenes) {
  const beatId = scene.beatId;
  const titleBox = scene.layout?.titleBox;
  const stageBox = scene.layout?.stageBox;
  const overlapRatio = rectOverlapRatio(titleBox, stageBox);
  const qualityScene = qualityByBeat.get(beatId);
  const stats = qualityScene?.image?.stats || {};
  const title = Array.isArray(scene.titleLines) ? scene.titleLines.join("") : String(scene.screenText || "");
  const semanticRoute = /^semantic-/u.test(qualityScene?.route || scene.route || "");

  if (overlapRatio > 0.02) {
    addItem({
      beatId,
      macroId: scene.macroId,
      type: "possible-title-stage-occlusion",
      priority: 1,
      evidence: {overlapRatio, titleBox, stageBox},
      visibleText: title,
      recommendedAction: "move-title-or-stage-box-and-regenerate-still-before-next-review-mp4",
    });
  }

  if (semanticRoute && Number(stats.inkFraction || 0) > 0.12 && title.length >= 8) {
    addItem({
      beatId,
      macroId: scene.macroId,
      type: "dense-semantic-stage-behind-title",
      priority: 2,
      evidence: {inkFraction: stats.inkFraction, edgeDensity: stats.edgeDensity, route: qualityScene?.route || scene.route},
      visibleText: title,
      recommendedAction: "simplify-stage-density-or-switch-this-beat-to-typographic-packaging",
    });
  }
}

let run = [];
for (const scene of scenes) {
  const signature = [
    scene.macroId,
    scene.route,
    scene.family,
    scene.motionArchetype,
    scene.presentation?.state,
  ].join("|");
  if (!run.length || run[0].signature === signature) {
    run.push({scene, signature});
  } else {
    if (run.length >= 3) {
      for (const entry of run.slice(2)) {
        addItem({
          beatId: entry.scene.beatId,
          macroId: entry.scene.macroId,
          type: "repeated-motion-signature",
          priority: 2,
          evidence: {signature: entry.signature, runLength: run.length},
          visibleText: Array.isArray(entry.scene.titleLines) ? entry.scene.titleLines.join("") : String(entry.scene.screenText || ""),
          recommendedAction: "assign-alternate-motion-archetype-or-layout-family-for-this-run",
        });
      }
    }
    run = [{scene, signature}];
  }
}
if (run.length >= 3) {
  for (const entry of run.slice(2)) {
    addItem({
      beatId: entry.scene.beatId,
      macroId: entry.scene.macroId,
      type: "repeated-motion-signature",
      priority: 2,
      evidence: {signature: entry.signature, runLength: run.length},
      visibleText: Array.isArray(entry.scene.titleLines) ? entry.scene.titleLines.join("") : String(entry.scene.screenText || ""),
      recommendedAction: "assign-alternate-motion-archetype-or-layout-family-for-this-run",
    });
  }
}

const byType = items.reduce((all, item) => {
  all[item.type] = (all[item.type] || 0) + 1;
  return all;
}, {});

const report = {
  contract: "A1StoryboardVisualErrorFixQueue/v1",
  phaseId,
  status: items.length ? "OPEN_FIX_QUEUE" : "PASS_NO_HEURISTIC_VISUAL_ERRORS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  rendererPatchAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    propsPath: rel(propsPath),
    propsSha256: sha256File(propsPath),
    qualityPath: rel(qualityPath),
    qualitySha256: sha256File(qualityPath),
    reviewMp4: reviewMp4?.media?.reviewVideo || reviewMp4?.video || null,
  },
  summary: {
    sceneCount: scenes.length,
    itemCount: items.length,
    byType,
  },
  items: items.sort((a, b) => a.priority - b.priority || String(a.beatId).localeCompare(String(b.beatId), "en")),
  nextAction: items.length
    ? "repair-open-visual-error-items-on-current-storyboard-before-refreshing-review-mp4"
    : "continue-to-current-storyboard-artwork-queue",
};

const md = [
  "# Storyboard Visual Error Fix Queue v1",
  "",
  `Status: ${report.status}`,
  `Generated: ${report.generatedAt}`,
  `Items: ${report.summary.itemCount}`,
  "",
  "## Items",
  "",
  ...(report.items.length ? report.items.map((item) => [
    `- ${item.beatId} ${item.type}`,
    `  - priority: ${item.priority}`,
    `  - text: ${item.visibleText}`,
    `  - action: ${item.recommendedAction}`,
  ].join("\n")) : ["- none"]),
  "",
].join("\n");

writeBoth("report.json", `${JSON.stringify(report, null, 2)}\n`);
writeBoth("report.md", md);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
