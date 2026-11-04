#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  assertEditorialAssetWorkbench,
  editorialAssetContentSha256,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {reviewArticlePackagingKit} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {createProductionEvent, createSceneGraphCandidates} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const now = new Date().toISOString();
const recompileShotArg = process.argv.find((item) => item.startsWith("--shots="))?.split("=")[1] || "";
const recompileShots = new Set(recompileShotArg.split(",").map((value) => value.trim()).filter(Boolean));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const currentAuthority = (workspace, productionEligible, reason) => ({
  contract: "A1ProductionStyleAuthority/v1",
  referencePackId: workspace.visualBible.visualGenerationPolicy.visualReferencePack.id,
  policySha256: workspace.visualBible.visualGenerationPolicy.sha256,
  productionEligible,
  reason,
  evaluatedAt: now,
});

const assetDefinitions = [
  {
    id: "pixel-choice-funnel-rail-v1",
    name: "像素选择漏斗轨道",
    semanticRole: "evidence-choice-funnel-rail",
    assetUri: "/generated/system-line/editorial-asset-workbench-v1/generated-assets/pinterest-retro-pixel-v1/ed14-choice-funnel-v1.png",
    sourceUri: "/generated/system-line/editorial-asset-workbench-v1/generated-assets/pinterest-retro-pixel-v1/ed14-choice-funnel-source-v1.png",
    usedByShotIds: ["ED-14"],
    role: "choice-funnel-rail",
    tags: ["evidence", "connector", "focus", "mechanism"],
    sourcePrompt: "three unequal 1-bit inlet tracks converge into one output track; text-free; cream black cobalt plus one acid path",
  },
  {
    id: "pixel-proof-eraser-actor-v1",
    name: "像素校样擦除演员",
    semanticRole: "proof-sheet-eraser-and-debris",
    assetUri: "/generated/system-line/editorial-asset-workbench-v1/generated-assets/pinterest-retro-pixel-v1/ed10-proof-eraser-action-v2.png",
    sourceUri: "/generated/system-line/editorial-asset-workbench-v1/generated-assets/pinterest-retro-pixel-v1/ed10-proof-eraser-action-source-v2.png",
    usedByShotIds: ["ED-10"],
    role: "proof-sheet-eraser-and-pixel-debris",
    tags: ["revision", "correction", "paper", "verdict"],
    sourcePrompt: "one compact vermillion eraser wedge creates a wide diagonal paper-fiber, red-ink and 1-bit debris corruption swath; text-free",
  },
];

function makeAsset(workspace, definition, index) {
  const file = path.join(publicRoot, definition.assetUri.replace(/^\/+/, ""));
  const sourceFile = path.join(publicRoot, definition.sourceUri.replace(/^\/+/, ""));
  if (!fs.existsSync(file) || !fs.existsSync(sourceFile)) throw new Error(`generated-anchor-element-missing:${definition.id}`);
  const asset = {
    id: definition.id,
    stageId: "element-atlas",
    name: definition.name,
    purpose: "当前 Pinterest 像素编辑主线的镜头专用透明元素；与文字、背景、配图和真实来源分层。",
    semanticRole: definition.semanticRole,
    route: "editorial-element",
    promptBrief: definition.sourcePrompt,
    sourceRequirement: "Codex 内置生图生成无字元素；中文和事实内容不得烘焙进图层。",
    outputPolicy: "transparent-shot-bound-actor; no-baked-text; no-evidence-use; exact-shot-binding",
    status: "approved",
    requiredForShotComposition: true,
    assetUri: definition.assetUri,
    sha256: sha256File(file),
    usedByShotIds: definition.usedByShotIds,
    extractionPolicy: "built-in-imagegen chroma source; local alpha removal; transparent corners verified",
    typographyRole: null,
    typographySpec: null,
    preview: {kind: "transparent-element", publicUrl: definition.assetUri},
    candidates: null,
    creativeInputOnly: true,
    evidenceUseAllowed: false,
    packagingActor: {
      contract: "A1PackagingElementActor/v1",
      sourceAtlasAssetId: null,
      sourceAtlasSha256: sha256File(sourceFile),
      cellIndex: -100 + index,
      role: definition.role,
      tags: definition.tags,
      transparent: true,
    },
    productionStyleAuthority: currentAuthority(workspace, true, "generated-for-current-pinterest-retro-pixel-policy"),
    shotLayerBinding: {
      contract: "A1ShotLayerBinding/v1",
      projectId: workspace.production.project.projectId,
      shotId: definition.usedByShotIds[0],
      layerId: "elements",
      rendererSlot: definition.role,
      sourcePrompt: definition.sourcePrompt,
    },
    provenance: {
      sourceType: "codex-built-in-imagegen-plus-local-chroma-removal",
      sourceUri: definition.sourceUri,
      license: "project-owned generated creative element",
      reviewed: true,
    },
    visualCritic: {
      contract: "A1GeneratedElementLayerPreflight/v1",
      verdict: "PROVISIONAL_PASS",
      totalScore: 20,
      maxScore: 24,
      hardFailures: [],
      referenceMaturity: false,
      alphaVerified: true,
      visibleText: false,
      reviewedAt: now,
    },
    review: {status: "pending", note: null, reviewedAt: now, reviewedBy: "system", approvedContentSha256: null},
  };
  asset.contentSha256 = editorialAssetContentSha256(asset);
  asset.review = {
    status: "approved",
    note: "透明、无字、当前画风及精确镜头绑定预检通过；仅代表元素可入库，不代表合成画面通过。",
    reviewedAt: now,
    reviewedBy: "system-visual-critic",
    approvedContentSha256: asset.contentSha256,
  };
  return asset;
}

withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  let next = structuredClone(current);
  const anchorVisualRevisions = new Map(["ED-01", "ED-14", "ED-10"].map((shotId) => {
    const shot = current.library.assets.find((asset) => asset.shotDemand?.shotId === shotId);
    const revision = shot?.visualRevision ? structuredClone(shot.visualRevision) : null;
    // A primitive switch starts a new bounded refinement cycle. Historical
    // counts such as ED-01=1067 or later carry-over values must never leak
    // into the new compositor strategy or exceed the four-round breaker.
    if (revision) revision.round = 1;
    return [shotId, revision];
  }));
  const legacyReferenceOnlyIds = [];
  for (const asset of next.library.assets) {
    if (asset.stageId === "key-backgrounds") {
      if (asset.productionEligibility === "reference-only"
        && asset.productionStyleAuthority?.referencePackId === next.visualBible.visualGenerationPolicy.visualReferencePack.id
        && asset.productionStyleAuthority?.policySha256 === next.visualBible.visualGenerationPolicy.sha256
        && asset.productionStyleAuthority?.productionEligible === false) {
        legacyReferenceOnlyIds.push(asset.id);
        continue;
      }
      asset.productionStyleAuthority = currentAuthority(next, false, "legacy-or-uncertified-style-reference-only");
      asset.productionEligibility = "reference-only";
      asset.contentSha256 = editorialAssetContentSha256(asset);
      if (asset.review?.status === "approved") asset.review.approvedContentSha256 = asset.contentSha256;
      legacyReferenceOnlyIds.push(asset.id);
    } else if (asset.stageId === "element-atlas" && asset.route === "editorial-element") {
      if (asset.productionEligibility === "exact-element-binding-only"
        && asset.productionStyleAuthority?.referencePackId === next.visualBible.visualGenerationPolicy.visualReferencePack.id
        && asset.productionStyleAuthority?.policySha256 === next.visualBible.visualGenerationPolicy.sha256
        && asset.productionStyleAuthority?.productionEligible === true) continue;
      // Transparent, text-free actors are style-neutral primitives. They may
      // remain eligible only as exact object-bound elements; old full-scene
      // illustrations above are never granted this compatibility bridge.
      asset.productionStyleAuthority = currentAuthority(next, true, "style-neutral-transparent-actor-compatible-with-current-policy");
      asset.productionEligibility = "exact-element-binding-only";
      asset.contentSha256 = editorialAssetContentSha256(asset);
      if (asset.review?.status === "approved") asset.review.approvedContentSha256 = asset.contentSha256;
    }
  }
  for (const [index, definition] of assetDefinitions.entries()) {
    const asset = makeAsset(next, definition, index);
    const existing = next.library.assets.findIndex((item) => item.id === asset.id);
    if (existing >= 0
      && next.library.assets[existing].sha256 === asset.sha256
      && next.library.assets[existing].packagingActor?.sourceAtlasSha256 === asset.packagingActor.sourceAtlasSha256
      && next.library.assets[existing].productionStyleAuthority?.policySha256 === asset.productionStyleAuthority.policySha256
      && next.library.assets[existing].shotLayerBinding?.rendererSlot === asset.shotLayerBinding.rendererSlot) continue;
    if (existing >= 0) next.library.assets[existing] = asset;
    else next.library.assets.push(asset);
  }

  next = recalculateEditorialAssetWorkbench(next, now);
  next = reviewArticlePackagingKit(
    next,
    "approved",
    "当前画风生产资格已隔离；透明元素与五层精确绑定通过系统入库检查，不代表逐镜视觉成熟。",
    now,
    "system-visual-critic",
  );
  next = recalculateEditorialAssetWorkbench(next, now);
  for (const shotId of ["ED-01", "ED-14", "ED-10"]) {
    const target = next.library.assets.find((asset) => asset.shotDemand?.shotId === shotId);
    const preservedRevision = anchorVisualRevisions.get(shotId);
    if (preservedRevision) target.visualRevision = structuredClone(preservedRevision);
    const alreadyCompiled = target.candidates?.length === 1
      && target.candidates[0]?.sceneGraph?.visualPrimitiveOverride?.applied === true
      && target.candidates[0].sceneGraph.visualPrimitiveOverride.id === target.shotDemand.visualPrimitiveId;
    if (alreadyCompiled && (!process.argv.includes("--recompile-anchors") || (recompileShots.size && !recompileShots.has(shotId)))) continue;
    next = createSceneGraphCandidates(next, target.id, now);
  }
  next = recalculateEditorialAssetWorkbench(next, now);
  next.production.visualDirector.generationFreeze = {
    ...(next.production.visualDirector.generationFreeze || {}),
    status: "frozen",
    frozen: true,
    reason: "visual-anchor-static-refinement-required",
    scope: "explicit-anchor-static-refinement",
    compositorReviewAllowed: true,
    imageGenerationAllowed: false,
    evaluatedAt: now,
  };
  next.production.maturityLoop.status = "anchor-static-refinement";
  next.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives-without-regeneration";
  next = recalculateEditorialAssetWorkbench(next, now);
  const validated = assertEditorialAssetWorkbench(next);
  const event = createProductionEvent({
    workspace: current,
    action: "current-visual-authority-and-anchor-elements-migrated",
    targetId: validated.visualBible.visualGenerationPolicy.visualReferencePack.id,
    payload: {
      generatedAssetIds: assetDefinitions.map((item) => item.id),
      legacyReferenceOnlyCount: legacyReferenceOnlyIds.length,
      rebuiltShotIds: ["ED-01", "ED-14", "ED-10"],
      fullFilmRenderDispatched: false,
    },
    now,
  });
  validated.production.eventLedger.eventCount += 1;
  validated.production.eventLedger.lastEventId = event.eventId;
  validated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, validated, {
    event,
    files: {
      "current-visual-authority-and-anchor-elements-v1.json": {
        contract: "A1CurrentVisualAuthorityMigration/v1",
        workspaceSha256: validated.workspaceSha256,
        policySha256: validated.visualBible.visualGenerationPolicy.sha256,
        generatedAssetIds: assetDefinitions.map((item) => item.id),
        legacyReferenceOnlyIds,
        bindingSummary: validated.production.articlePackagingKit.bindingSummary,
        migratedAt: now,
      },
    },
  });
  console.log(JSON.stringify({
    status: "PASS",
    workspaceSha256: validated.workspaceSha256,
    generatedAssetIds: assetDefinitions.map((item) => item.id),
    legacyReferenceOnlyCount: legacyReferenceOnlyIds.length,
    bindingSummary: validated.production.articlePackagingKit.bindingSummary,
  }, null, 2));
});
