#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/four-shot-narrow-repair-v1/ED-12.png");
const output = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/single-shot-motion-canary-v1/ed-12-authority-layers");
const expectedSourceSha256 = "99e363c6c66a74ee0a9bb22af10cb50ea24ffa98a08eee001c656e96d5cc4603";
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sourceBytes = fs.readFileSync(source);
if (sha(sourceBytes) !== expectedSourceSha256) throw new Error("ed12-layer-source-sha-stale");

const layers = [
  {id: "copy-prefix", rect: {left: 72, top: 58, width: 330, height: 170}},
  {id: "copy-count", rect: {left: 54, top: 342, width: 612, height: 630}},
  {id: "copy-model", rect: {left: 666, top: 610, width: 520, height: 280}},
  {id: "logo-openai", rect: {left: 920, top: 42, width: 290, height: 260}},
  {id: "logo-claude", rect: {left: 1124, top: 178, width: 330, height: 300}},
  {id: "logo-kimi", rect: {left: 1384, top: 34, width: 360, height: 300}},
  {id: "logo-deepseek", rect: {left: 1458, top: 330, width: 360, height: 300}},
  {id: "logo-zhipu", rect: {left: 1060, top: 520, width: 560, height: 250}},
];

const {data, info} = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const width = info.width;
const height = info.height;
const background = {r: 20, g: 24, b: 25};
const distance = (offset) => Math.abs(data[offset] - background.r) + Math.abs(data[offset + 1] - background.g) + Math.abs(data[offset + 2] - background.b);

fs.mkdirSync(output, {recursive: true});
const files = {};
for (const layer of layers) {
  const out = Buffer.alloc(width * height * 4);
  const {left, top, width: rectWidth, height: rectHeight} = layer.rect;
  const visited = new Uint8Array(rectWidth * rectHeight);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= rectWidth || y >= rectHeight) return;
    const local = y * rectWidth + x;
    if (visited[local]) return;
    const sourceOffset = ((top + y) * width + left + x) * 4;
    if (distance(sourceOffset) > 42) return;
    visited[local] = 1;
    queue.push([x, y]);
  };
  for (let x = 0; x < rectWidth; x += 1) { enqueue(x, 0); enqueue(x, rectHeight - 1); }
  for (let y = 0; y < rectHeight; y += 1) { enqueue(0, y); enqueue(rectWidth - 1, y); }
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  for (let y = 0; y < rectHeight; y += 1) for (let x = 0; x < rectWidth; x += 1) {
    const local = y * rectWidth + x;
    if (visited[local]) continue;
    const sourceOffset = ((top + y) * width + left + x) * 4;
    const targetOffset = sourceOffset;
    out[targetOffset] = data[sourceOffset]; out[targetOffset + 1] = data[sourceOffset + 1]; out[targetOffset + 2] = data[sourceOffset + 2]; out[targetOffset + 3] = data[sourceOffset + 3];
  }
  const bytes = await sharp(out, {raw: {width, height, channels: 4}}).png().toBuffer();
  fs.writeFileSync(path.join(output, `${layer.id}.png`), bytes);
  files[layer.id] = {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/single-shot-motion-canary-v1/ed-12-authority-layers/${layer.id}.png`, sha256: sha(bytes), rect: layer.rect};
}

const coverSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${layers.map(({rect}) => `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" fill="#15191a"/>`).join("")}</svg>`;
const backgroundBytes = await sharp(sourceBytes).composite([{input: Buffer.from(coverSvg)}]).png().toBuffer();
fs.writeFileSync(path.join(output, "background.png"), backgroundBytes);
files.background = {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/single-shot-motion-canary-v1/ed-12-authority-layers/background.png", sha256: sha(backgroundBytes)};
const body = {contract: "A1AuthorityPixelLayerManifest/v1", status: "PASS", shotId: "ED-12", sourceVersionId: "ed-12-storyboard-27e99cf7020c", sourceArtifactSha256: expectedSourceSha256, extractionMethod: "CONNECTED_BACKGROUND_FLOOD_MASK_FULL_FRAME_COORDINATES", editableRetypePerformed: false, logoRedrawPerformed: false, files};
const manifest = {...body, manifestSha256: sha(Buffer.from(JSON.stringify(body)))};
fs.writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
