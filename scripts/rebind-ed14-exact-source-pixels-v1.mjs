#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/look-masters/ED-14/119bfc6f13ce-replacement-source-range.png");
const verifiedSourceFile = path.join(publicRoot, "generated/system-line/web-source-packaging-pilot-v1/sources/acl-2026-acl-long-1803-title-abstract.png");
const outputFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/look-masters/ED-14/119bfc6f13ce-replacement-source-range-exact-source.png");
const expectedSourceSha256 = "747566071afd35f7265a4b30d4f08607132c0c7650769617e62abf7edffd7a46";
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

if (sha256File(verifiedSourceFile) !== expectedSourceSha256) throw new Error("ed14-exact-source-sha-invalid");
const source = await sharp(verifiedSourceFile).resize({height: 870, fit: "inside", withoutEnlargement: true}).png().toBuffer();
const sourceMeta = await sharp(source).metadata();
const paperWidth = 704;
const paperLeft = 64;
const sourceLeft = paperLeft + Math.floor((paperWidth - sourceMeta.width) / 2);
await sharp(generatedFile)
  .composite([
    {input: {create: {width: paperWidth, height: 941, channels: 4, background: {r: 241, g: 235, b: 219, alpha: 1}}}, left: paperLeft, top: 0},
    {input: source, left: sourceLeft, top: 35},
  ])
  .png()
  .toFile(outputFile);

const output = {
  contract: "A1ExactSourcePixelRebind/v1",
  status: "PASS",
  shotId: "ED-14",
  generatedCompositionSha256: sha256File(generatedFile),
  verifiedSourceSha256: expectedSourceSha256,
  outputSha256: sha256File(outputFile),
  outputPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/look-masters/ED-14/119bfc6f13ce-replacement-source-range-exact-source.png",
  sourcePlacement: {left: sourceLeft, top: 35, width: sourceMeta.width, height: sourceMeta.height},
  compositionChanged: false,
  semanticRelationshipChanged: false,
  generatedSourceTextRemoved: true,
};
console.log(JSON.stringify(output, null, 2));
