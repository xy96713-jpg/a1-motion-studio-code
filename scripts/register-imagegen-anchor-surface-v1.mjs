#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {editorialAssetContentSha256, recalculateEditorialAssetWorkbench, assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {A1_CREATIVE_ASSET_STYLE_POLICY, assertCreativeAssetStylePolicy} from "../apps/studio-next/src/lib/a1-editorial-visual-generation-policy-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const appPublicRoot = path.join(appRoot, "public");
const remotionPublicRoot = path.join(root, "remotion-renderer/public");
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=")];
}));
const source = path.resolve(args.get("source") || "");
const assetId = String(args.get("asset") || "").trim();
const shotIds = String(args.get("shots") || "").split(",").map((value) => value.trim()).filter(Boolean);
const label = String(args.get("label") || assetId).trim();
const role = String(args.get("role") || "anchor-surface").trim();
const sceneFamily = String(args.get("family") || "full-bleed-hero").trim();
if (!source || !fs.existsSync(source)) throw new Error("anchor-surface-source-missing");
if (!/^[a-z0-9][a-z0-9-]+$/u.test(assetId)) throw new Error("anchor-surface-asset-id-invalid");
if (!shotIds.length) throw new Error("anchor-surface-shots-required");
assertCreativeAssetStylePolicy({mode: "text-free-material-surface", prompt: "text-free editorial material surface"});

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const now = new Date().toISOString();
const outputRelativePath = `generated/system-line/editorial-asset-workbench-v1/generated-assets/editorial-anchor-surfaces-v1/${assetId}.png`;
const outputPath = path.join(appPublicRoot, outputRelativePath);
const remotionOutputPath = path.join(remotionPublicRoot, outputRelativePath);
const metadata = await sharp(source).metadata();
if (!metadata.width || !metadata.height) throw new Error("anchor-surface-dimensions-missing");
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.mkdirSync(path.dirname(remotionOutputPath), {recursive: true});
fs.copyFileSync(source, outputPath);
fs.copyFileSync(source, remotionOutputPath);
const outputSha256 = fileSha256(outputPath);
if (fileSha256(remotionOutputPath) !== outputSha256) throw new Error("anchor-surface-remotion-mirror-hash-mismatch");

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = ensureProductionState(current, now);
  const existing = next.library.assets.find((asset) => asset.id === assetId);
  const asset = {
    ...(existing || {}),
    id: assetId,
    stageId: "key-backgrounds",
    name: label,
    purpose: "文章级编辑现场锚点材质：为真实人物、真实文稿或结论字形提供非证据的空间与印刷表面。",
    semanticRole: role,
    route: "editorial-artwork",
    promptBrief: "H-series retro print archive wireframe grammar; text-free tactile editorial surface; real source remains authoritative.",
    sourceRequirement: "只作为创意场景材质，不承担人物、界面、品牌、文章或事实证据；所有文字必须由本地可编辑层重建。",
    outputPolicy: "creative-scene-surface-only; editable-text-and-real-source-remain-authoritative",
    creativeStyleMode: "text-free-material-surface",
    creativeStylePolicy: {
      contract: A1_CREATIVE_ASSET_STYLE_POLICY.contract,
      sha256: A1_CREATIVE_ASSET_STYLE_POLICY.sha256,
      generatedSurfaceOnly: true,
      realPeopleUiEvidenceSourceBound: true,
    },
    status: "approved",
    requiredForShotComposition: false,
    usedByShotIds: [...new Set([...(existing?.usedByShotIds || []), ...shotIds])],
    assetUri: `/${outputRelativePath}`,
    sha256: outputSha256,
    width: metadata.width,
    height: metadata.height,
    provenance: {
      sourceType: "openai-built-in-imagegen",
      provider: "openai-built-in-imagegen",
      model: "gpt-image-2",
      sourceUri: "codex-generated-imagegen",
      rights: "creative-reference-only; no factual-evidence-substitution",
      inputReferenceHashes: [],
      visualMasterId: "july1-retro-print-archive-wireframe-v1",
    },
    creativeInputOnly: true,
    evidenceUseAllowed: false,
    anchorSurface: {
      contract: "A1EditorialAnchorSurfaceBinding/v1",
      sceneFamily,
      role,
      textFree: true,
      realSourceRemainsAuthoritative: true,
      editableTextRemainsAuthoritative: true,
    },
    review: {
      status: "approved",
      note: "系统创意锚点预检通过：仅作为批准镜头的非证据场景表面；不代表用户最终审美批准。",
      reviewedAt: now,
      reviewedBy: "system-creative-anchor-preflight",
      approvedContentSha256: null,
    },
  };
  const index = next.library.assets.findIndex((item) => item.id === assetId);
  if (index >= 0) next.library.assets[index] = asset;
  else next.library.assets.push(asset);
  let recalculated = recalculateEditorialAssetWorkbench(next, now);
  const persistedAsset = recalculated.library.assets.find((item) => item.id === assetId);
  persistedAsset.review = {...persistedAsset.review, status: "approved", approvedContentSha256: editorialAssetContentSha256(persistedAsset)};
  recalculated = recalculateEditorialAssetWorkbench(recalculated, now);
  const event = createProductionEvent({
    workspace: current,
    action: "imagegen-editorial-anchor-surface-registered",
    targetId: assetId,
    payload: {assetId, shotIds, outputSha256, sceneFamily, role, creativeInputOnly: true, evidenceUseAllowed: false},
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      [`editorial-anchor-surface-${assetId}.json`]: {
        contract: "A1EditorialAnchorSurfaceRegistration/v1",
        assetId,
        shotIds,
        sceneFamily,
        role,
        asset,
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  console.log(JSON.stringify({status: "REGISTERED", assetId, shotIds, sceneFamily, role, publicUrl: asset.assetUri, sha256: outputSha256, workspaceSha256: recalculated.workspaceSha256}, null, 2));
});
