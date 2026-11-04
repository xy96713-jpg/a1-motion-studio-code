#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const sourceArtworkRoot = path.join(root, "apps/studio-next/public/generated-artwork");
const rendererArtworkRoot = path.join(root, "remotion-renderer/public/generated-artwork");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-visual-master-repairs-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/current-visual-master-repairs-v1");

const repairs = new Map([
  ["H03-B02", {displayText: "完成度很高的废稿", colorRole: "verdict-red"}],
  ["H10-B04", {displayText: "不说人话，仍会发生", colorRole: "verdict-red"}],
  ["H11-B03", {displayText: "写出自己的风格", colorRole: "cobalt"}],
]);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const hashFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hashJson = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const storyboardProps = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
if (hashFile(storyboardPropsPath) !== hashFile(rendererPropsPath)) throw new Error("storyboard-renderer-props-mismatch-before-visual-repair");

const copiedAssets = new Map();
for (const scene of rendererProps.scenes || []) {
  if (!repairs.has(scene.beatId)) continue;
  const artworkFile = scene.storyboard?.artworkFile;
  if (!artworkFile) throw new Error(`missing-adopted-artwork:${scene.beatId}`);
  const source = path.join(sourceArtworkRoot, artworkFile);
  if (!fs.existsSync(source)) throw new Error(`missing-artwork-file:${source}`);
  const destination = path.join(rendererArtworkRoot, artworkFile);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(source, destination);
  if (hashFile(source) !== hashFile(destination)) throw new Error(`artwork-copy-hash-mismatch:${scene.beatId}`);
  copiedAssets.set(scene.beatId, {source, destination, sha256: hashFile(source), artworkFile});
}

function apply(props) {
  const changed = [];
  for (const scene of props.scenes || []) {
    const repair = repairs.get(scene.beatId);
    if (!repair) continue;
    const asset = copiedAssets.get(scene.beatId);
    const subject = scene.layers?.find((layer) => layer.kind === "foreground-subject");
    if (!subject) throw new Error(`missing-foreground-subject:${scene.beatId}`);
    subject.asset = `generated-artwork/${asset.artworkFile}`;
    subject.assetSha256 = asset.sha256;
    scene.titleLines = [repair.displayText];
    scene.layout.titleBox = {...scene.layout.titleBox, x: 118, y: 246, width: 660, height: 620, alignment: "left", maxLines: 3};
    scene.layout.stageBox = {x: 800, y: 180, width: 1040, height: 720};
    scene.layout.assetPlacement = {
      contract: "A1VisualFitDecision/v2",
      mode: "stage-cover",
      fit: "cover",
      cropMode: "focal-cover",
      objectPosition: {x: 52, y: 50},
      titleSide: "left",
      sourceAspectRatio: 1672 / 941,
      targetAspectRatio: 1040 / 720,
      cropLossRatio: 0.187,
      estimatedSaliencyRetention: 0.84,
      cropRisk: "medium",
      confidence: 0.86,
      sourcePolicy: "text-free-non-evidence-styleframe",
      factualEvidenceAllowed: false,
      rationale: "adopted generated editorial artwork is renderer-bound as a right-side landscape field with editable local title on the left",
    };
    scene.storyboard.typographyDirector = {
      ...scene.storyboard.typographyDirector,
      displayText: repair.displayText,
      colorRole: repair.colorRole,
      useCase: "单层编辑判断：可编辑中文主标题 + 小型拉丁索引 + 一条语义强调线",
      referenceTaste: {
        ...scene.storyboard.typographyDirector.referenceTaste,
        massiveCjkImpact: false,
        highSaturationAccent: false,
      },
      rules: [
        "中文主标题只渲染一层，不允许描边回声、黑色横板或红黄块叠压",
        "拉丁字只作为小型索引，不与中文争夺层级",
        "强调色必须绑定判断语义，默认使用钴蓝结构线",
        "生成插画只承担非事实编辑隐喻，标题保持本地可编辑",
      ],
    };
    scene.storyboard.artworkReview = {
      ...(scene.storyboard.artworkReview || {}),
      decision: "adopted-for-current-renderer-review",
      rendererBoundAsset: subject.asset,
      rendererBoundAssetSha256: asset.sha256,
      rendererBindingContract: "A1CurrentVisualMasterRepair/v1",
    };
    changed.push({beatId: scene.beatId, displayText: repair.displayText, asset: subject.asset, assetSha256: asset.sha256});
  }
  props.contentHash = hashJson({
    sourceProductionHash: props.sourceProductionHash,
    sourceVariationHash: props.sourceVariationHash,
    visualMasterHash: props.visualMasterHash,
    scenes: props.scenes,
  });
  return changed;
}

const beforeSha256 = hashFile(rendererPropsPath);
const changed = apply(storyboardProps);
apply(rendererProps);
writeJson(storyboardPropsPath, storyboardProps);
writeJson(rendererPropsPath, rendererProps);
const afterStoryboardSha256 = hashFile(storyboardPropsPath);
const afterRendererSha256 = hashFile(rendererPropsPath);
if (afterStoryboardSha256 !== afterRendererSha256) throw new Error("storyboard-renderer-props-mismatch-after-visual-repair");

const report = {
  contract: "A1CurrentVisualMasterRepair/v1",
  status: changed.length === repairs.size ? "APPLIED" : "BLOCKED",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  visualThesis: "cool off-white editorial paper, ink black hierarchy, cobalt structure, muted red only for true contradiction",
  typographyRoles: ["information-sans", "editorial-serif", "impact-condensed"],
  source: {beforePropsSha256: beforeSha256},
  after: {storyboardPropsSha256: afterStoryboardSha256, rendererPropsSha256: afterRendererSha256, parity: afterStoryboardSha256 === afterRendererSha256},
  changed,
  copiedAssets: [...copiedAssets.values()].map((asset) => ({source: path.relative(root, asset.source), destination: path.relative(root, asset.destination), sha256: asset.sha256})),
  nextAction: "render-targeted-current-stills-and-run-pixel-audit",
};
for (const output of [path.join(artifactRoot, "report.json"), path.join(publicRoot, "report.json")]) writeJson(output, report);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "APPLIED") process.exitCode = 2;
