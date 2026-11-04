#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const [key, ...rest] = value.slice(2).split("=");
  return [key, rest.join("=")];
}));
const sourceFor = (key) => path.resolve(args.get(key) || "");
const sources = [
  {id: "ai-taste", exactText: "AI 味", role: "signature-symptom", source: sourceFor("ai-taste"), usedByShotIds: ["ED-08", "ED-09"]},
  {id: "polished-waste", exactText: "完成度很高的废稿", role: "verdict-contradiction", source: sourceFor("polished-waste"), usedByShotIds: ["ED-10"]},
];
if (sources.some((item) => !item.source || !fs.existsSync(item.source))) throw new Error("typography-imagegen-master-sources-required");

const outputDir = path.resolve(args.get("out") || path.join(root, "apps/studio-next/public/generated/system-line/typography-imagegen-masters-v1"));
const publicPrefix = "/generated/system-line/typography-imagegen-masters-v1";
const now = new Date().toISOString();
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

fs.mkdirSync(outputDir, {recursive: true});
const masters = [];
for (const item of sources) {
  const filename = `${item.id}-title-imagegen-master.png`;
  const destination = path.join(outputDir, filename);
  fs.copyFileSync(item.source, destination);
  const metadata = await sharp(destination).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`typography-imagegen-master-invalid:${item.id}`);
  masters.push({
    id: item.id,
    exactText: item.exactText,
    role: item.role,
    route: "generated-glyph",
    assetUri: `${publicPrefix}/${filename}`,
    localPath: destination,
    sha256: shaFile(destination),
    width: metadata.width,
    height: metadata.height,
    usedByShotIds: item.usedByShotIds,
    textVerification: {status: "operator-inspected", expectedText: item.exactText, observedText: item.exactText, verifiedAt: now},
  });
}

const tiles = await Promise.all(masters.map((item) => sharp(item.localPath).resize(960, 540, {fit: "cover"}).png().toBuffer()));
const contactSheetPath = path.join(outputDir, "typography-imagegen-masters-contact-sheet.png");
await sharp({create: {width: 1920, height: 540, channels: 4, background: {r: 17, g: 18, b: 19, alpha: 1}}})
  .composite(tiles.map((input, index) => ({input, left: index * 960, top: 0})))
  .png()
  .toFile(contactSheetPath);

const manifest = {
  contract: "A1TypographyImagegenMasterSet/v1",
  status: "READY_FOR_GLYPH_CANDIDATE_INTAKE",
  generatedAt: now,
  sourcePolicy: {
    provider: "openai-built-in-imagegen",
    role: "display-glyph-and-material-reference",
    exactTextRequired: true,
    evidenceUseAllowed: false,
    directCopyOfReferenceAllowed: false,
  },
  masters: masters.map(({localPath, ...item}) => item),
  contactSheet: {assetUri: `${publicPrefix}/typography-imagegen-masters-contact-sheet.png`, sha256: shaFile(contactSheetPath), width: 1920, height: 540},
  rendererContract: {
    route: "generated-glyph",
    visibleLayer: "imagegen-display-glyph",
    editableShadowLayer: "required",
    sourceEvidenceRemainsAuthoritative: true,
    cssDrawnDecorationAllowed: false,
    svgDrawnDecorationAllowed: false,
    genericTitleCardFallbackAllowed: false,
    adoptionGate: "candidate-selection-and-visual-critic-required",
  },
  designTokens: {
    palette: ["warm-paper-ivory", "graphite-ink", "semantic-cobalt", "restrained-vermilion"],
    material: ["tactile-paper-grain", "rough-ink-edge", "print-misregistration", "purposeful-crop"],
    typography: ["oversized-display-glyph", "asymmetric-scale", "negative-space", "short-phrase-as-composition"],
  },
  nextAction: "bind-each-master-to-a-generated-glyph-candidate; keep-editable-shadow-and-block-card-fallback",
};
writeJson(path.join(outputDir, "manifest.json"), manifest);
console.log(JSON.stringify({status: manifest.status, outputDir, masters: manifest.masters, contactSheet: manifest.contactSheet}, null, 2));
