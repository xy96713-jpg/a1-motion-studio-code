#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";

import {auditPresenterCompositeActualPixels} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {
  A1_HERO_TITLE_CARRIERS,
  deriveHeroTitlePresentation,
} from "../apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs";

const requireFromStudio = createRequire(new URL("../apps/studio-next/package.json", import.meta.url));
const sharp = requireFromStudio("sharp");
const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(root, ".codex-artifacts/system-progress-system-line/hero-title-presentation-system-v1");
fs.mkdirSync(outputDir, {recursive: true});

const width = 320;
const height = 180;
const pixels = width * height;
const rgba = (background = [0, 0, 0, 0]) => {
  const buffer = Buffer.alloc(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    buffer[pixel * 4] = background[0];
    buffer[pixel * 4 + 1] = background[1];
    buffer[pixel * 4 + 2] = background[2];
    buffer[pixel * 4 + 3] = background[3];
  }
  return buffer;
};
const mask = () => Buffer.alloc(pixels);
const fillRect = (buffer, x, y, rectWidth, rectHeight, color) => {
  const channels = buffer.length === pixels ? 1 : 4;
  for (let yy = Math.max(0, y); yy < Math.min(height, y + rectHeight); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(width, x + rectWidth); xx += 1) {
      const offset = (yy * width + xx) * channels;
      if (channels === 1) buffer[offset] = color[0];
      else for (let channel = 0; channel < 4; channel += 1) buffer[offset + channel] = color[channel];
    }
  }
};
const writeRgba = async (file, buffer) => sharp(buffer, {raw: {width, height, channels: 4}}).png().toFile(file);
const writeMask = async (file, buffer) => sharp(buffer, {raw: {width, height, channels: 1}}).png().toFile(file);

const base = rgba([22, 24, 28, 255]);
fillRect(base, 196, 34, 90, 146, [192, 160, 148, 255]);
fillRect(base, 44, 87, 205, 18, [92, 98, 108, 255]);
fillRect(base, 0, 124, 190, 10, [126, 132, 142, 255]);
const title = rgba();
fillRect(title, 24, 52, 176, 26, [230, 21, 31, 255]);
fillRect(title, 24, 84, 232, 28, [230, 21, 31, 255]);
fillRect(title, 24, 118, 210, 24, [230, 21, 31, 255]);

const presenter = mask();
const microphone = mask();
const boom = mask();
const face = mask();
const eyes = mask();
const mouth = mask();
fillRect(presenter, 196, 34, 90, 146, [255]);
fillRect(microphone, 44, 87, 205, 18, [255]);
fillRect(boom, 0, 124, 190, 10, [255]);
fillRect(face, 215, 42, 46, 48, [255]);
fillRect(eyes, 222, 58, 32, 7, [255]);
fillRect(mouth, 231, 76, 15, 5, [255]);

const files = Object.fromEntries(["base", "title", "presenter", "microphone", "boom", "face", "eyes", "mouth", "final"].map((name) => [name, path.join(outputDir, `${name}.png`)]));
await writeRgba(files.base, base);
await writeRgba(files.title, title);
await Promise.all([
  writeMask(files.presenter, presenter),
  writeMask(files.microphone, microphone),
  writeMask(files.boom, boom),
  writeMask(files.face, face),
  writeMask(files.eyes, eyes),
  writeMask(files.mouth, mouth),
]);
const presenterLayer = rgba();
for (let pixel = 0; pixel < pixels; pixel += 1) {
  presenterLayer[pixel * 4] = base[pixel * 4];
  presenterLayer[pixel * 4 + 1] = base[pixel * 4 + 1];
  presenterLayer[pixel * 4 + 2] = base[pixel * 4 + 2];
  presenterLayer[pixel * 4 + 3] = presenter[pixel];
}
const presenterSource = await sharp(presenterLayer, {raw: {width, height, channels: 4}}).png().toBuffer();
await sharp(files.base).composite([
  {input: files.title, blend: "over"},
  {input: presenterSource, blend: "over"},
]).png().toFile(files.final);

const input = {
  baseFrameFile: files.base,
  packageFile: files.title,
  finalCompositeFile: files.final,
  presenterMatteFile: files.presenter,
  microphoneMatteFile: files.microphone,
  boomMatteFile: files.boom,
  faceMaskFile: files.face,
  eyesMaskFile: files.eyes,
  mouthMaskFile: files.mouth,
  targetWidth: width,
  targetHeight: height,
  packagingMode: "BEHIND_SUBJECT_MATTE",
  titleBounds: {x: 0.06, y: 0.27, width: 0.54, height: 0.55},
};
const heroAudit = await auditPresenterCompositeActualPixels({...input, protectionScope: "PRESENTER_FACE_AND_BODY_ONLY"});
assert.equal(heroAudit.status, "PASS", JSON.stringify(heroAudit));
assert.equal(heroAudit.criticalProtectedIntrusionPixelCount, 0);
assert.ok(heroAudit.equipmentPixels.changedPixelCount > 0, "hero title must visibly cover equipment pixels in this proof");
assert.equal(heroAudit.equipmentPixels.mayBeCoveredByHeroTitle, true);

const legacyAudit = await auditPresenterCompositeActualPixels({...input, protectionScope: "PRESENTER_AND_EQUIPMENT"});
assert.equal(legacyAudit.status, "FAIL", "the same pixel stack must fail when equipment is incorrectly declared protected");
assert.ok(legacyAudit.failedChecks.includes("protectedSourcePixelsPreserved") || legacyAudit.failedChecks.includes("criticalProtectedPixelsNotOverrun"));

const routing = {
  presenter: deriveHeroTitlePresentation({title: "中文顺了 / 问题还在", semanticEvent: "STRONG_CONTRAST", typeAllowed: true, baseVisualCarrier: "PRESENTER_BASE", presenterSemanticValue: true}),
  fullscreen: deriveHeroTitlePresentation({title: "问题还在", semanticEvent: "CONCLUSION", typeAllowed: true, baseVisualCarrier: "PRESENTER_BASE", presenterSemanticValue: false}),
  evidence: deriveHeroTitlePresentation({semanticEvent: "EVIDENCE", typeAllowed: true, sourceEvidenceRequired: true}),
  none: deriveHeroTitlePresentation({typeAllowed: false}),
};
assert.equal(routing.presenter.carrier, A1_HERO_TITLE_CARRIERS.PRESENTER_HERO_TYPE);
assert.equal(routing.fullscreen.carrier, A1_HERO_TITLE_CARRIERS.FULLSCREEN_HERO_TYPE);
assert.equal(routing.evidence.carrier, A1_HERO_TITLE_CARRIERS.EVIDENCE_WITH_TYPE);
assert.equal(routing.none.carrier, A1_HERO_TITLE_CARRIERS.NO_TYPE);

const proofSha256 = crypto.createHash("sha256").update(fs.readFileSync(files.final)).digest("hex");
console.log(JSON.stringify({
  status: "PASS",
  contract: "A1HeroTitlePresentationSystemTest/v1",
  routes: Object.fromEntries(Object.entries(routing).map(([key, value]) => [key, value.carrier])),
  personProtected: heroAudit.protectedPixels.changedPixelCount === 0,
  equipmentCoveredPixelCount: heroAudit.equipmentPixels.changedPixelCount,
  legacyEquipmentProtectionFails: legacyAudit.status === "FAIL",
  proof: {file: files.final, sha256: proofSha256, width, height},
}, null, 2));
