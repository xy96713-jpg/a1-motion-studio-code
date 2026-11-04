#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import sharp from "sharp";

import {rasterizeTypographySvg} from "./lib/a1-typography-svg-rasterizer-v1.mjs";

const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e8"/><stop offset="1" stop-color="#4461d7"/></linearGradient></defs><path d="M30 25H290V155H30Z M80 60H240V120H80Z" fill="url(#g)" fill-rule="evenodd"/></svg>`);
const first = rasterizeTypographySvg({svg, width: 320, height: 180});
const second = rasterizeTypographySvg({svg, width: 320, height: 180});
assert.equal(first.contract, "A1TypographySvgRaster/v1");
assert.equal(first.engine, "resvg-js");
assert.equal(first.width, 320);
assert.equal(first.height, 180);
assert.equal(Buffer.compare(first.png, second.png), 0);
assert.equal(first.sha256, crypto.createHash("sha256").update(first.png).digest("hex"));
const metadata = await sharp(first.png).metadata();
assert.equal(metadata.width, 320);
assert.equal(metadata.height, 180);
assert.equal(metadata.format, "png");
const alpha = await sharp(first.png).ensureAlpha().extractChannel(3).raw().toBuffer();
assert.ok(alpha.some((value) => value === 0));
assert.ok(alpha.some((value) => value === 255));
assert.throws(() => rasterizeTypographySvg({svg: Buffer.from("<svg>"), width: 320, height: 180}), /typography-svg-raster-failed/u);

console.log("A1 typography resvg rasterizer PASS");
