#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {
  A1_ARTICLE_PACKAGING_KIT_CONTRACT,
  assessArticlePackagingAutomaticQa,
  buildArticlePackagingKit,
} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const workbenchRelative = "generated/system-line/editorial-asset-workbench-v1";
const checkpointRelative = `${workbenchRelative}/article-asset-pack-checkpoint-v1`;
const checkpointRoot = path.join(publicRoot, checkpointRelative);
const outputRelative = `${workbenchRelative}/article-packaging-kit-v1`;
const outputRoot = path.join(publicRoot, outputRelative);
const dryRun = process.argv.includes("--dry-run");
const checkpointReportPath = path.join(checkpointRoot, "report.json");

const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const actorSpecs = [
  {id: "torn-paper-strip", role: "torn-paper-strip", tags: ["paper", "revision", "texture"]},
  {id: "torn-paper-corner", role: "torn-paper-corner", tags: ["paper", "texture", "connector"]},
  {id: "charcoal-swatch", role: "charcoal-swatch", tags: ["ink", "verdict", "revision"]},
  {id: "pencil-circle", role: "pencil-circle", tags: ["focus", "evidence", "correction"]},
  {id: "crossed-strokes", role: "crossed-strokes", tags: ["correction", "revision", "verdict"]},
  {id: "cobalt-arrow", role: "cobalt-arrow", tags: ["connector", "evidence", "focus"]},
  {id: "torn-note-strip", role: "torn-note-strip", tags: ["paper", "revision", "evidence"]},
  {id: "binder-clip", role: "binder-clip", tags: ["evidence", "paper", "archive"]},
  {id: "halftone-tear", role: "halftone-tear", tags: ["texture", "paper", "verdict"]},
  {id: "folded-paper", role: "folded-paper", tags: ["paper", "archive", "connector"]},
  {id: "cobalt-crop-marks", role: "cobalt-crop-marks", tags: ["focus", "evidence", "frame"]},
  {id: "charcoal-frame", role: "charcoal-frame", tags: ["frame", "verdict", "evidence"]},
];

function relevantShotIds(workspace, tags) {
  return workspace.library.assets
    .filter((asset) => asset.route === "shot-composition" && asset.shotDemand)
    .filter((asset) => {
      const shot = asset.shotDemand;
      if (["screen-demo", "presenter-clean"].includes(shot.editMode)) return false;
      const text = `${shot.sourceText} ${shot.visualJob} ${shot.primaryActor} ${shot.motionPhrase}`;
      return tags.some((tag) => ({
        paper: /文章|稿|写|句|材料|纸|档案/iu,
        revision: /改|修|删|错|废稿|问题|选择|重点/iu,
        correction: /改|修|删|错|问题|选择/iu,
        evidence: /证据|事实|研究|论文|来源|数据|模型|对比/iu,
        focus: /重点|判断|证据|问题|选择|模型/iu,
        verdict: /结论|判断|废稿|控制权|最终|最后|不是/iu,
        connector: /因为|所以|变成|换|过程|直到/iu,
        archive: /材料|历史|来源|研究|记录/iu,
        texture: /味|感觉|抽象|风格|完成度/iu,
        frame: /判断|模型|证据|结论|控制/iu,
        ink: /字|稿|写|结论|废稿/iu,
      }[tag] || /$^/u).test(text));
    })
    .map((asset) => asset.shotDemand.shotId);
}

async function extractElementActors(sourceFile) {
  const metadata = await sharp(sourceFile).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height || !metadata.hasAlpha) throw new Error("article-pack-element-atlas-transparent-png-required");
  const actorDir = path.join(outputRoot, "elements");
  fs.mkdirSync(actorDir, {recursive: true});
  const outputs = [];
  for (let index = 0; index < actorSpecs.length; index += 1) {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const left = Math.round(column * width / 4);
    const top = Math.round(row * height / 3);
    const right = Math.round((column + 1) * width / 4);
    const bottom = Math.round((row + 1) * height / 3);
    const output = path.join(actorDir, `${String(index + 1).padStart(2, "0")}-${actorSpecs[index].id}.png`);
    const cell = await sharp(sourceFile)
      .extract({left, top, width: right - left, height: bottom - top})
      .png()
      .toBuffer();
    await sharp(cell)
      .trim({background: {r: 0, g: 0, b: 0, alpha: 0}, threshold: 4})
      .extend({top: 16, bottom: 16, left: 16, right: 16, background: {r: 0, g: 0, b: 0, alpha: 0}})
      .png({compressionLevel: 9})
      .toFile(output);
    const actorMetadata = await sharp(output).metadata();
    outputs.push({
      ...actorSpecs[index],
      cellIndex: index,
      publicUrl: `/${outputRelative}/elements/${path.basename(output)}`,
      sha256: shaFile(output),
      width: actorMetadata.width,
      height: actorMetadata.height,
    });
  }
  return outputs;
}

if (!fs.existsSync(checkpointReportPath)) throw new Error("article-asset-pack-checkpoint-report-missing");
const checkpoint = readJson(checkpointReportPath);
if (checkpoint.contract !== "A1ArticleAssetPackCheckpoint/v1") throw new Error("article-asset-pack-checkpoint-contract-invalid");
const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (checkpoint.article.sourceTextSha256 !== current.article.sourceTextSha256) throw new Error("article-asset-pack-checkpoint-article-mismatch");

fs.mkdirSync(outputRoot, {recursive: true});
const atlasFile = path.join(publicRoot, checkpoint.outputs.elementAtlas.publicUrl.replace(/^\/+/, ""));
const actors = await extractElementActors(atlasFile);
const manifest = {
  contract: "A1PackagingElementActorManifest/v1",
  sourceAtlas: {assetId: "article-pack-element-atlas-v1", publicUrl: checkpoint.outputs.elementAtlas.publicUrl, sha256: checkpoint.outputs.elementAtlas.sha256, columns: 4, rows: 3},
  extraction: {transparentActors: true, actorCount: actors.length, generatedNewPixels: false, mode: "deterministic-grid-crop-and-alpha-trim"},
  actors,
  createdAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outputRoot, "element-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

if (dryRun) {
  console.log(JSON.stringify({status: "DRY_RUN_PASS", actorCount: actors.length, manifest: `/${outputRelative}/element-manifest.json`}, null, 2));
  process.exit(0);
}

const now = new Date().toISOString();
const updated = withProjectLock(appRoot, () => {
  const latest = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (latest.article.sourceTextSha256 !== checkpoint.article.sourceTextSha256) throw new Error("article-changed-before-packaging-kit-write");
  const next = structuredClone(latest);
  const backgroundById = new Map(checkpoint.outputs.backgrounds.map((entry) => [entry.id, entry]));
  for (const asset of next.library.assets.filter((item) => item.stageId === "background-foundry" && backgroundById.has(item.id))) {
    const replacement = backgroundById.get(asset.id);
    if (asset.assetUri !== replacement.publicUrl || asset.sha256 !== replacement.sha256) {
      asset.revisionHistory ||= [];
      asset.revisionHistory.push({assetUri: asset.assetUri, sha256: asset.sha256, visualCritic: asset.visualCritic || null, archivedAt: now, reason: "restore-article-specific-imagegen-packaging-background"});
    }
    asset.assetUri = replacement.publicUrl;
    asset.sha256 = replacement.sha256;
    asset.preview = {kind: "image", publicUrl: replacement.publicUrl};
    asset.status = "ready-for-review";
    asset.provenance = {sourceType: "codex-subscription-generated-article-pack", sourceUri: replacement.publicUrl, license: "project-owned generated packaging asset", reviewed: false};
    asset.review = {status: "pending", note: "恢复文章级生图素材包原始底材；等待 Packaging Kit 整体审美确认。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  }

  next.library.assets = next.library.assets.filter((asset) => asset.route !== "editorial-element" || !asset.id.startsWith("article-element-"));
  for (const actor of actors) {
    const usedByShotIds = relevantShotIds(next, actor.tags);
    next.library.assets.push({
      id: `article-element-${actor.id}`,
      stageId: "element-atlas",
      name: actor.role,
      purpose: "文章级可复用透明包装元素；由整张元素图集确定性裁切，不是逐镜完整场景。",
      semanticRole: actor.role,
      route: "editorial-element",
      promptBrief: "已完成；只允许作为局部构图 actor 使用。",
      sourceRequirement: "来自已审核文章元素图集，保持透明边界和来源哈希。",
      outputPolicy: "transparent-reusable-actor; no baked text; no evidence use",
      status: "ready-for-review",
      contentSha256: null,
      requiredForShotComposition: true,
      assetUri: actor.publicUrl,
      sha256: actor.sha256,
      usedByShotIds,
      extractionPolicy: "4x3 deterministic crop; alpha trim; 16px transparent gutter",
      typographyRole: null,
      typographySpec: null,
      preview: {kind: "transparent-element", publicUrl: actor.publicUrl},
      provenance: {sourceType: "derived-from-article-pack-imagegen-atlas", sourceUri: checkpoint.outputs.elementAtlas.publicUrl, license: "project-owned generated packaging asset", reviewed: false},
      candidates: null,
      creativeInputOnly: true,
      evidenceUseAllowed: false,
      productionStyleAuthority: {
        contract: "A1ProductionStyleAuthority/v1",
        referencePackId: next.visualBible.visualGenerationPolicy.visualReferencePack.id,
        policySha256: next.visualBible.visualGenerationPolicy.sha256,
        productionEligible: true,
        reason: "style-neutral-transparent-actor-compatible-with-current-policy",
        evaluatedAt: now,
      },
      packagingActor: {contract: "A1PackagingElementActor/v1", sourceAtlasAssetId: "article-pack-element-atlas-v1", sourceAtlasSha256: checkpoint.outputs.elementAtlas.sha256, cellIndex: actor.cellIndex, role: actor.role, tags: actor.tags, transparent: true},
      review: {status: "pending", note: "已从文章元素图集独立裁切；等待 Packaging Kit 整体审美确认。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null},
    });
  }

  const checkpointReportSha256 = shaFile(checkpointReportPath);
  next.production.articlePackagingKit = {
    contract: A1_ARTICLE_PACKAGING_KIT_CONTRACT,
    sourceCheckpoint: {
      contract: checkpoint.contract,
      reportPublicUrl: `/${checkpointRelative}/report.json`,
      reportSha256: checkpointReportSha256,
      materialBoardPublicUrl: checkpoint.outputs.materialBoard.publicUrl,
      elementAtlasPublicUrl: checkpoint.outputs.elementAtlas.publicUrl,
      typographyBoardPublicUrl: checkpoint.outputs.typographyBoard.publicUrl,
    },
    createdAt: now,
  };
  next.production.articlePackagingKit = buildArticlePackagingKit(next, now);
  next.production.articlePackagingAutomaticQa = {
    contract: "A1ArticlePackagingAutomaticQa/v1",
    ...assessArticlePackagingAutomaticQa(next, 22),
    evaluatedAt: now,
    sourceKitSha256: next.production.articlePackagingKit.kitSha256,
  };
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "idle";
  next.production.maturityLoop.status = "article-packaging-kit-automatic-qa";
  next.production.maturityLoop.nextAction = "automatic-article-packaging-qa";
  const event = createProductionEvent({workspace: latest, action: "article-packaging-kit-built", targetId: next.production.project.projectId, payload: {kitSha256: next.production.articlePackagingKit.kitSha256, actorCount: actors.length, generatedNewImages: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const report = {
    contract: "A1ArticlePackagingKitBuildReport/v1",
    status: "READY_FOR_AUTOMATIC_VISUAL_QA",
    generatedAt: now,
    kitSha256: recalculated.production.articlePackagingKit.kitSha256,
    sourceCheckpoint: recalculated.production.articlePackagingKit.sourceCheckpoint,
    lanes: Object.fromEntries(Object.entries(recalculated.production.articlePackagingKit.lanes).map(([key, entries]) => [key, entries.length])),
    shotAssignmentCount: recalculated.production.articlePackagingKit.shotAssignments.length,
    generatedNewImages: false,
    extractedTransparentActors: actors.length,
    gates: recalculated.production.articlePackagingKit.gates,
    automaticQa: recalculated.production.articlePackagingAutomaticQa,
    nextAction: "automatic-article-packaging-qa",
  };
  persistProjectState(appRoot, recalculated, {event, files: {"article-packaging-kit-v1/report.json": report, "article-packaging-kit-v1/element-manifest.json": manifest}});
  return {workspace: recalculated, report};
});

console.log(JSON.stringify({status: updated.report.status, kitSha256: updated.report.kitSha256, lanes: updated.report.lanes, shotAssignmentCount: updated.report.shotAssignmentCount, workspaceSha256: updated.workspace.workspaceSha256}, null, 2));
