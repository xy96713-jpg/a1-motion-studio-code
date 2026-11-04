#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {validateReferenceBinding, validateTextNodeRendererBinding} from "../apps/studio-next/src/lib/a1-independent-package-visual-proof-v1.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a1-independent-visual-proof-"));
const publicRoot = path.join(tmp, "public");
fs.mkdirSync(path.join(publicRoot, "refs"), {recursive: true});
fs.mkdirSync(path.join(publicRoot, "fonts"), {recursive: true});
const refBytes = Buffer.from("canonical-reference");
const fusionBytes = Buffer.from("fusion-font");
const hanBytes = Buffer.from("source-han-font");
fs.writeFileSync(path.join(publicRoot, "refs/ref.png"), refBytes);
fs.writeFileSync(path.join(publicRoot, "fonts/fusion.ttf"), fusionBytes);
fs.writeFileSync(path.join(publicRoot, "fonts/han.otf"), hanBytes);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const referenceRegistry = {sources: [{id: "ref-1", publicUrl: "/refs/ref.png", sha256: sha(refBytes), role: "canonical role"}]};
const baseReference = {referenceId: "ref-1", publicUrl: "/refs/ref.png", sha256: sha(refBytes), role: "canonical role"};
assert.equal(validateReferenceBinding(baseReference, {publicRoot, referenceRegistry}).status, "UNVERIFIED");
assert.equal(validateReferenceBinding({...baseReference, adoptedTraits: true}, {publicRoot, referenceRegistry}).status, "UNVERIFIED");
assert.equal(validateReferenceBinding({...baseReference, adoptedTraits: ["adopt asymmetric one-bit hierarchy"]}, {publicRoot, referenceRegistry}).status, "PASS");
const fontRegistry = {
  "fusion": {publicUrl: "/fonts/fusion.ttf", sha256: sha(fusionBytes)},
  "han": {publicUrl: "/fonts/han.otf", sha256: sha(hanBytes)},
};
const text = "问题也并没有彻底解决";
const baseNode = {nodeId: "ED-13-title-2", text, semanticRole: "verdict", fontAssetId: "fusion", fontSha256: sha(fusionBytes), fontFilePublicUrl: "/fonts/fusion.ttf", fontSize: 56};
const goodRenderer = {method: "FONTKIT_DIRECT_GLYPH_OUTLINES", fontAssetId: "fusion", fontSha256: sha(fusionBytes), fontFilePublicUrl: "/fonts/fusion.ttf", fontSize: 56, semanticRole: "verdict", textSha256: sha(Buffer.from(text)), geometry: {x: 76, baseline: 417, width: 472, height: 56}};
assert.equal(validateTextNodeRendererBinding({...baseNode, rendererBinding: goodRenderer}, {publicRoot, fontRegistry}).status, "PASS");
assert.equal(validateTextNodeRendererBinding({...baseNode, rendererBinding: {...goodRenderer, fontAssetId: "han", fontSha256: sha(hanBytes), fontFilePublicUrl: "/fonts/han.otf"}}, {publicRoot, fontRegistry}).status, "FAIL");
console.log(JSON.stringify({status: "PASS", roleOnlyRejected: true, booleanTraitsRejected: true, completeReferenceAccepted: true, ed13FontMismatchRejected: true}));
