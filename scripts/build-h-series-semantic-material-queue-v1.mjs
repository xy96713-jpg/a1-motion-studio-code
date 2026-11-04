#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const candidatePath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-director-candidate-v1/candidate-render-props.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-director-candidate-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/h-series-director-candidate-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const clean = (value = "", max = 120) => Array.from(String(value || "").replace(/\s+/gu, " ").trim()).slice(0, max).join("");

if (!fs.existsSync(candidatePath)) throw new Error(`candidate-missing:${path.relative(root, candidatePath)}`);
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const candidate = readJson(candidatePath);
const items = (candidate.scenes || []).map((scene, index) => {
  const treatment = scene.visualTreatment || {};
  const assetNeed = treatment.assetNeed || {};
  const form = treatment.primaryVisualForm || "kinetic-typography";
  const existing = Array.isArray(scene.assets) ? scene.assets.filter((asset) => asset?.verifiedForRender || asset?.renderAllowed) : [];
  const sourceText = clean(scene.director?.coverageText || scene.body || scene.article?.claim || scene.headline || "", 240);
  const semanticStage = /(划选|点击|输入|双击|保存|历史|收稿|演示模式|喜好|文章方向|不说人话)/u.test(sourceText)
    ? "semantic-stage"
    : null;
  let status = "not-needed";
  let action = "render-structured-semantic-or-typographic-stage";
  let approval = "none";
  if (existing.length) {
    status = "bound";
    action = "retain-verified-bound-asset";
  } else if (["real-image", "webpage-screenshot", "map-or-3d-scene", "map-data-visualization"].includes(form) || assetNeed.role === "webpage-preview" || assetNeed.role === "repo-evidence") {
    status = "source-required";
    action = "discover-rank-and-confirm-source";
    approval = "confirm-source-before-adoption";
  } else if (form === "editorial-image") {
    status = "generate-candidate";
    action = "generate-labeled-non-evidence-styleframe";
    approval = "approve-styleframe-before-binding";
  } else if (semanticStage) {
    status = "not-needed";
    action = "render-semantic-stage-no-fake-ui-or-stock-image";
  }
  return {
    id: scene.id || `scene-${index + 1}`,
    order: index + 1,
    sourceText,
    visualForm: form,
    semanticStage,
    assetRole: assetNeed.role || "none",
    status,
    action,
    approval,
    existingAssetIds: existing.map((asset) => asset.id || null).filter(Boolean),
  };
});

const byStatus = items.reduce((all, item) => ({...all, [item.status]: (all[item.status] || 0) + 1}), {});
const queue = {
  contract: "A1SemanticMaterialQueue/v1",
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  finalRenderAllowed: false,
  sourceCandidate: path.relative(root, candidatePath),
  summary: {sceneCount: items.length, byStatus},
  items,
  nextGate: "review-source-required-and-generate-candidate-items-before-binding",
};

for (const dir of [artifactRoot, publicRoot]) writeJson(path.join(dir, "semantic-material-queue.json"), queue);
console.log(JSON.stringify({contract: queue.contract, summary: queue.summary, nextGate: queue.nextGate}, null, 2));
