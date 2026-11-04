#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("overlay-geometry-input-output-required");

// This is a technical alpha/placement normalization only. It preserves the
// generated opaque pixels and does not redraw, re-typeset, recolor or add a
// second design. It makes the ImageGen canvas obey the already registered
// video available region before the actual pixel gate runs.
const source = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const {data, info} = source;
const {width, height, channels} = info;
const index = (x, y) => (y * width + x) * channels;
const backgroundLike = (x, y) => {
  const i = index(x, y);
  const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
  return Math.min(r, g, b) >= 228 && Math.max(r, g, b) - Math.min(r, g, b) <= 12;
};
const seen = new Uint8Array(width * height);
const queue = [];
const add = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const at = y * width + x;
  if (seen[at] || !backgroundLike(x, y)) return;
  seen[at] = 1; queue.push(at);
};
for (let x = 0; x < width; x += 1) { add(x, 0); add(x, height - 1); }
for (let y = 0; y < height; y += 1) { add(0, y); add(width - 1, y); }
for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const at = queue[cursor]; const x = at % width; const y = Math.floor(at / width);
  add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1);
}
for (let at = 0; at < seen.length; at += 1) if (seen[at]) data[at * channels + 3] = 0;
const matte = await sharp(data, {raw: {width, height, channels}}).png().toBuffer();
const trimmed = await sharp(matte).trim({background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
const region = {x: 0.04, y: 0.38, width: 0.28, height: 0.34};
const targetWidth = Math.max(1, Math.floor(width * region.width * 0.92));
const targetHeight = Math.max(1, Math.floor(height * region.height * 0.92));
const placed = await sharp(trimmed).resize(targetWidth, targetHeight, {fit: "inside", withoutEnlargement: false}).png().toBuffer();
const placedMeta = await sharp(placed).metadata();
const left = Math.round(width * region.x + (width * region.width - placedMeta.width) / 2);
const top = Math.round(height * region.y + (height * region.height - placedMeta.height) / 2);
const canvas = await sharp({create: {width, height, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
  .composite([{input: placed, left, top}]).png().toBuffer();
fs.mkdirSync(path.dirname(output), {recursive: true});
await fs.promises.writeFile(output, canvas);
console.log(JSON.stringify({status: "PASS", input, output, width, height, region, placedWidth: placedMeta.width, placedHeight: placedMeta.height, technicalOnly: true, alpha: true}, null, 2));
