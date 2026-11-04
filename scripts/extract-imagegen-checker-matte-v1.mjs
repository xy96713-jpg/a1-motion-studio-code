#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("checker-matte-input-output-required");

// ImageGen sometimes returns a visual checkerboard instead of real alpha.
// This is a bounded technical matte extraction only: it never redraws,
// re-typesets, recolors, or changes any opaque package pixel.
const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const {width, height, channels} = info;
const index = (x, y) => (y * width + x) * channels;
const backgroundLike = (x, y) => {
  const i = index(x, y);
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return Math.min(r, g, b) >= 228 && Math.max(r, g, b) - Math.min(r, g, b) <= 10;
};
const seen = new Uint8Array(width * height);
const queue = [];
const add = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const at = y * width + x;
  if (seen[at] || !backgroundLike(x, y)) return;
  seen[at] = 1;
  queue.push(at);
};
for (let x = 0; x < width; x += 1) { add(x, 0); add(x, height - 1); }
for (let y = 0; y < height; y += 1) { add(0, y); add(width - 1, y); }
for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const at = queue[cursor];
  const x = at % width;
  const y = Math.floor(at / width);
  add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1);
}
let removed = 0;
for (let at = 0; at < seen.length; at += 1) {
  if (!seen[at]) continue;
  const i = at * channels;
  if (data[i + 3] !== 0) { data[i + 3] = 0; removed += 1; }
}
fs.mkdirSync(path.dirname(output), {recursive: true});
await sharp(data, {raw: {width, height, channels}}).png().toFile(output);
console.log(JSON.stringify({status: "PASS", input, output, width, height, extractedBackgroundPixels: removed, alpha: true, method: "CONNECTED_NEUTRAL_CHECKER_MATTE_ONLY"}, null, 2));
