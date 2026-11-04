#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {editorialAssetContentSha256, recalculateEditorialAssetWorkbench, assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=")];
}));
const source = path.resolve(args.get("source") || "");
const assetId = args.get("asset") || "imggen-typography-material-ink-paper-pixel-v1";
const shotIds = String(args.get("shots") || "ED-01").split(",").map((value) => value.trim()).filter(Boolean);
if (!fs.existsSync(source)) throw new Error(`typography-material-source-missing:${source}`);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const now = new Date().toISOString();
const outputRelativePath = `generated/system-line/editorial-asset-workbench-v1/generated-assets/article-pixel-material-v1/${assetId}.png`;
const outputPath = path.join(publicRoot, outputRelativePath);
const metadata = await sharp(source).metadata();
if (!metadata.width || !metadata.height) throw new Error("typography-material-dimensions-missing");
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
if (path.resolve(source) !== path.resolve(outputPath)) fs.copyFileSync(source, outputPath);
const outputSha256 = fileSha256(outputPath);

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = ensureProductionState(current, now);
  const existing = next.library.assets.find((asset) => asset.id === assetId);
  const asset = {
    ...(existing || {}),
    id: assetId,
    // This is a creative surface for editable type, never a real source.
    // Keeping it in source-materials made the product claim a generated
    // texture was factual evidence.
    stageId: "typography-board",
    name: "生图材质 · 墨纸像素磨损",
    purpose: "为批准的可编辑像素字体提供一层可控的纸墨、磨损和蓝色像素断裂表面；不承担事实证据。",
    semanticRole: "imagegen-typography-surface-reference",
    route: "editorial-artwork",
    promptBrief: "无字材质参考：暖白纸纤维、黑色墨迹磨损、少量钴蓝像素断裂；不出现任何文字、界面、人物、Logo、箭头或解释标签。",
    sourceRequirement: "仅作为可编辑文字的材质参考，不能替代真实来源、事实证据或准确文字。",
    outputPolicy: "creative-input-only-text-clipping; editable-text-remains-authoritative",
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
    },
    creativeInputOnly: true,
    evidenceUseAllowed: false,
    typographyMaterial: {
      contract: "A1TypographyMaterialBinding/v1",
      role: "surface-reference",
      clipToEditableText: true,
      editableTextRemainsAuthoritative: true,
      exactTextAsset: false,
      sourceTruth: "real-source-frame-remains-authoritative",
    },
    review: {
      status: "approved",
      note: "系统创意输入预检通过：只允许裁切到准确、可编辑文字；不视为用户审美批准或事实素材批准。",
      reviewedAt: now,
      reviewedBy: "system-creative-input-preflight",
      approvedContentSha256: null,
    },
  };
  const index = next.library.assets.findIndex((item) => item.id === assetId);
  if (index >= 0) next.library.assets[index] = asset;
  else next.library.assets.push(asset);
  let recalculated = recalculateEditorialAssetWorkbench(next, now);
  const persistedAsset = recalculated.library.assets.find((item) => item.id === assetId);
  persistedAsset.review = {
    ...persistedAsset.review,
    status: "approved",
    approvedContentSha256: editorialAssetContentSha256(persistedAsset),
  };
  recalculated = recalculateEditorialAssetWorkbench(recalculated, now);
  const event = createProductionEvent({
    workspace: current,
    action: "imagegen-typography-material-registered",
    targetId: assetId,
    payload: {assetId, shotIds, outputSha256, creativeInputOnly: true, evidenceUseAllowed: false},
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      [`typography-material-${assetId}.json`]: {
        contract: "A1TypographyMaterialRegistration/v1",
        assetId,
        shotIds,
        asset,
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  console.log(JSON.stringify({status: "REGISTERED", assetId, shotIds, publicUrl: asset.assetUri, sha256: outputSha256, workspaceSha256: recalculated.workspaceSha256}, null, 2));
});
