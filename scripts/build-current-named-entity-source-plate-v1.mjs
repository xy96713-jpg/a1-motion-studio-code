#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const outputDir = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/source-cache/semantic-source-plates-v1");
const outputPath = path.join(outputDir, "named-models-ed12.png");
const manifestPath = path.join(outputDir, "manifest.json");
const publicUrl = "/generated/system-line/editorial-asset-workbench-v1/source-cache/semantic-source-plates-v1/named-models-ed12.png";
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const decision = workspace.production.shotIntelligence.decisionSet.items.find((item) => item.networkDecision === "REQUIRED" && item.entities?.length >= 5);
if (!decision) throw new Error("named-entity-semantic-shot-not-found");
const assetIds = ["source-entity-openai", "source-entity-claude", "source-entity-kimi", "source-entity-deepseek", "source-network-zhipu-official-mark"];
const labels = ["GPT / OpenAI", "Claude", "Kimi", "DeepSeek", "智谱"];
const sources = assetIds.map((id, index) => {
  const asset = workspace.library.assets.find((item) => item.id === id && item.usedByShotIds?.includes(decision.shotId));
  if (!asset?.assetUri || asset.provenance?.reviewed !== true || !asset.sha256) throw new Error(`named-entity-source-not-reviewed:${id}`);
  const file = path.join(publicRoot, asset.assetUri.replace(/^\/+/, ""));
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== asset.sha256) throw new Error(`named-entity-source-sha-mismatch:${id}`);
  return {id, label: labels[index], file, sha256: asset.sha256, sourceUri: asset.provenance.sourceUri, license: asset.provenance.license};
});
const width = 1600;
const height = 900;
const cellWidth = 280;
const logoSize = 150;
const composites = [];
for (let index = 0; index < sources.length; index += 1) {
  const source = sources[index];
  const left = 60 + index * 300;
  const logo = await sharp(source.file).resize({width: logoSize, height: logoSize, fit: "contain", background: "#f4f0e7"}).png().toBuffer();
  const logoWell = source.id === "source-network-zhipu-official-mark" ? `<rect x="55" y="35" width="170" height="170" rx="8" fill="#24211f"/>` : "";
  const card = Buffer.from(`<svg width="${cellWidth}" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="${cellWidth}" height="300" rx="10" fill="#f4f0e7" stroke="#262421" stroke-width="3"/>${logoWell}<text x="${cellWidth / 2}" y="255" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#262421">${source.label}</text></svg>`);
  composites.push({input: card, left, top: 280}, {input: logo, left: left + 65, top: 325});
}
const title = Buffer.from(`<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1600" height="900" fill="#24211f"/><text x="60" y="120" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#f4f0e7">SOURCE IDENTITY REFERENCE · FIVE NAMED MODELS</text><text x="60" y="180" font-family="Arial, sans-serif" font-size="24" fill="#b9d52f">REFERENCE ONLY · PRESERVE IDENTITY · EXACT REBIND REQUIRED</text></svg>`);
fs.mkdirSync(outputDir, {recursive: true});
const png = await sharp(title).composite(composites).png().toBuffer();
fs.writeFileSync(outputPath, png);
const manifest = {contract: "A1NamedEntitySourcePlate/v1", status: "SOURCE_ATLAS_REFERENCE_ONLY", articleSourceHash: workspace.article.sourceTextSha256, shotSourceHash: decision.sourceHash, shotId: decision.shotId, publicUrl, sha256: sha256(png), width, height, usageClass: "SOURCE_CONDITIONING_ALLOWED", exactPixelRebindRequired: true, generatedSourcePixelsAuthoritative: false, sources: sources.map(({file, ...item}) => item), generatedAt: new Date().toISOString()};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: "PASS", shotId: decision.shotId, publicUrl, sha256: manifest.sha256, sourceCount: sources.length}, null, 2));
