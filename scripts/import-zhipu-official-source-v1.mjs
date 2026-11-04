import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const assetId = "source-network-zhipu-official-mark";
const sourceUrl = "https://cdn.bigmodel.cn/static/platform/images/logo/white_logo.png";
const relativePath = "generated/system-line/editorial-asset-workbench-v1/source-cache/zhipu-bigmodel-white-logo.png";
const targetPath = path.join(publicRoot, relativePath);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const response = await fetch(sourceUrl, {headers: {"User-Agent": "A1-Visual-Director-Source-Importer/1.0"}, signal: AbortSignal.timeout(30_000)});
if (!response.ok) throw new Error(`official-zhipu-source-fetch-failed:${response.status}`);
const contentType = response.headers.get("content-type") || "";
if (!contentType.includes("image/")) throw new Error(`official-zhipu-source-content-type-invalid:${contentType}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length < 1024 || bytes.length > 5_000_000) throw new Error(`official-zhipu-source-size-invalid:${bytes.length}`);
const metadata = await sharp(bytes).metadata();
if (!metadata.width || !metadata.height || metadata.width < 80 || metadata.height < 20) throw new Error(`official-zhipu-source-dimensions-invalid:${metadata.width}x${metadata.height}`);
fs.mkdirSync(path.dirname(targetPath), {recursive: true});
fs.writeFileSync(targetPath, bytes);
const fileSha256 = sha256(bytes);

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const asset = next.library.assets.find((item) => item.id === assetId);
  if (!asset || asset.route !== "network-source") throw new Error("official-zhipu-source-slot-missing");
  asset.assetUri = `/${relativePath}`;
  asset.sha256 = fileSha256;
  asset.status = "approved";
  asset.preview = {kind: "source-image", publicUrl: asset.assetUri};
  asset.sourceMetadata = {originalFileName: "white_logo.png", mimeType: contentType.split(";")[0], extension: "png", sizeBytes: bytes.length, width: metadata.width, height: metadata.height, durationMs: null, probeStatus: "complete"};
  asset.provenance = {sourceType: "official-network-source", sourceUri: sourceUrl, license: "official brand mark; identification-only project use", reviewed: true};
  asset.review = {status: "approved", note: "从智谱开放平台当前前端引用的官方 CDN 缓存；只作实体识别，不重绘、不暗示排名。", reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
  asset.review.approvedContentSha256 = editorialAssetContentSha256(asset);
  const event = createProductionEvent({workspace: current, action: "official-network-source-imported", targetId: assetId, payload: {sourceUrl, sha256: fileSha256, width: metadata.width, height: metadata.height}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next);
  persistProjectState(appRoot, recalculated, {event, files: {"source-zhipu-official-import-report.json": {contract: "A1OfficialNetworkSourceImport/v1", assetId, sourceUrl, publicUrl: asset.assetUri, sha256: fileSha256, width: metadata.width, height: metadata.height, importedAt: event.createdAt}}});
  return recalculated;
});

console.log(JSON.stringify({status: "PASS", assetId, sourceUrl, publicUrl: `/${relativePath}`, sha256: fileSha256, width: metadata.width, height: metadata.height, requiredSourceMaterialsResolved: updated.gates.requiredSourceMaterialsResolved}, null, 2));
