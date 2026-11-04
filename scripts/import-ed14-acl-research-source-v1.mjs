import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const assetId = "source-network-article-context";
const sourceUrl = "https://aclanthology.org/2026.acl-long.1803/";
const pdfUrl = "https://aclanthology.org/2026.acl-long.1803.pdf";
const relativePath = "generated/system-line/editorial-asset-workbench-v1/source-cache/acl-2026-more-aligned-less-diverse-first-page.png";
const targetPath = path.join(publicRoot, relativePath);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const response = await fetch(pdfUrl, {headers: {"User-Agent": "A1-Visual-Director-Research-Source-Importer/1.0"}, signal: AbortSignal.timeout(30_000)});
if (!response.ok) throw new Error(`acl-research-source-fetch-failed:${response.status}`);
const contentType = response.headers.get("content-type") || "";
if (!contentType.includes("application/pdf")) throw new Error(`acl-research-source-content-type-invalid:${contentType}`);
const pdfBytes = Buffer.from(await response.arrayBuffer());
if (pdfBytes.length < 100_000 || pdfBytes.length > 50_000_000) throw new Error(`acl-research-source-size-invalid:${pdfBytes.length}`);
const conversionDir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-acl-source-"));
const pdfPath = path.join(conversionDir, "paper.pdf");
const outputPrefix = path.join(conversionDir, "page-1");
fs.writeFileSync(pdfPath, pdfBytes);
const conversion = spawnSync("pdftoppm", ["-f", "1", "-singlefile", "-png", "-r", "160", pdfPath, outputPrefix], {encoding: "utf8"});
if (conversion.status !== 0) throw new Error(`acl-research-source-rasterize-failed:${conversion.stderr || conversion.stdout}`);
const rasterPath = `${outputPrefix}.png`;
if (!fs.existsSync(rasterPath)) throw new Error("acl-research-source-raster-missing");
const bytes = fs.readFileSync(rasterPath);
fs.rmSync(conversionDir, {recursive: true, force: true});
const metadata = await sharp(bytes).metadata();
if (!metadata.width || !metadata.height || metadata.width < 1200 || metadata.height < 1600) throw new Error(`acl-research-source-dimensions-invalid:${metadata.width}x${metadata.height}`);
fs.mkdirSync(path.dirname(targetPath), {recursive: true});
fs.writeFileSync(targetPath, bytes);
const fileSha256 = sha256(bytes);

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const asset = next.library.assets.find((item) => item.id === assetId);
  if (!asset || asset.route !== "network-source") throw new Error("acl-research-source-slot-missing");
  asset.assetUri = `/${relativePath}`;
  asset.sha256 = fileSha256;
  asset.status = "approved";
  asset.preview = {kind: "source-image", publicUrl: asset.assetUri};
  asset.sourceMetadata = {originalFileName: path.basename(relativePath), mimeType: "image/png", extension: "png", sizeBytes: bytes.length, width: metadata.width, height: metadata.height, durationMs: null, probeStatus: "complete", sourcePdfBytes: pdfBytes.length};
  asset.citationLabel = "ACL 2026 · 10.18653/v1/2026.acl-long.1803";
  asset.provenance = {
    sourceType: "peer-reviewed-primary-research-source",
    sourceUri: sourceUrl,
    cacheUri: pdfUrl,
    publisher: "Association for Computational Linguistics",
    publicationDate: "2026-07",
    doi: "10.18653/v1/2026.acl-long.1803",
    title: "More Aligned, Less Diverse? Analyzing the Grammar and Lexicon of Two Generations of LLMs",
    claimBoundary: "The paper reports reduced syntactic and especially lexical diversity in newer instruction-tuned LLM output. The Chinese narration's wording about common, safe, reusable expressions is an editorial inference, not a verbatim paper claim.",
    license: "ACL Anthology primary-source citation and contextual first-page display; no ownership claim and no generated substitution",
    reviewed: true,
  };
  asset.review = {status: "approved", note: "ACL Anthology 官方论文页与官方首图已核对。只用于 ED-14 的来源识别、标题/摘要扫描和有边界的编辑性推断。", reviewedAt: new Date().toISOString(), reviewedBy: "system-primary-source-importer", approvedContentSha256: null};
  asset.review.approvedContentSha256 = editorialAssetContentSha256(asset);
  const event = createProductionEvent({workspace: current, action: "peer-reviewed-research-source-imported", targetId: assetId, payload: {sourceUrl, pdfUrl, doi: asset.provenance.doi, sha256: fileSha256, width: metadata.width, height: metadata.height}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next);
  persistProjectState(appRoot, recalculated, {event, files: {"source-ed14-acl-research-import-report.json": {contract: "A1PrimaryResearchSourceImport/v1", assetId, sourceUrl, pdfUrl, publicUrl: asset.assetUri, sha256: fileSha256, width: metadata.width, height: metadata.height, sourcePdfBytes: pdfBytes.length, claimBoundary: asset.provenance.claimBoundary, importedAt: event.createdAt}}});
  return recalculated;
});

console.log(JSON.stringify({status: "PASS", assetId, sourceUrl, publicUrl: `/${relativePath}`, sha256: fileSha256, width: metadata.width, height: metadata.height, usedByShotIds: updated.library.assets.find((asset) => asset.id === assetId)?.usedByShotIds}, null, 2));
