#!/usr/bin/env node

import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/pixel-font-scout-v3");
const fontRoot = path.join(outputRoot, "fonts");
const reviewRoot = path.join(outputRoot, "review");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const exactCopy = ["觉得不方便的地方", "可控的工作流"];

const candidates = [
  {
    id: "current-fusion-pixel",
    label: "CURRENT · Fusion Pixel",
    form: "patched-12px-gothic",
    intendedRole: "baseline only",
    license: "OFL-1.1",
    expectedSha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32",
    localSource: path.join(phaseRoot, "font-cache/fusion-pixel.ttf"),
    fileName: "current-fusion-pixel.ttf",
    sourceUrl: "https://github.com/TakWolf/fusion-pixel-font",
    sourceCommit: "current-project-cache",
  },
  {
    id: "fusion-bold-pixel-12",
    label: "Fusion Bold Pixel 12 · SC",
    form: "algorithmic-heavy-12px-grid",
    intendedRole: "research-only heavy baseline; upstream does not recommend production use",
    license: "OFL-1.1",
    expectedSha256: "bdc2e301b699f1cf82dbfd4b9f9eeebd249ebec91ce2c6af50c65bf9889de7a5",
    fileName: "fusion-bold-pixel-12-zh-hans.ttf",
    downloadArchiveUrl: "https://github.com/pixel-font-studio/fusion-bold-pixel-font/releases/download/2026.08.11/fusion-bold-pixel-font-12px-proportional-ttf-v2026.08.11.zip",
    archiveEntry: "fusion-bold-pixel-12px-proportional-zh_hans.ttf",
    sourceUrl: "https://github.com/pixel-font-studio/fusion-bold-pixel-font",
    sourceCommit: "e3f37f7a53dbb8fe916bdbd21355dc8b0e4de58e",
  },
  {
    id: "boutique-9x9-bold",
    label: "Boutique 9×9 Bold",
    form: "heavy-square-grid",
    intendedRole: "strong pixel headline",
    license: "OFL-1.1",
    expectedSha256: "ba67f9138d43d5bc8ce6f59a74088d44973c99edeeadbebaf9541fc983bcb7ba",
    fileName: "boutique-9x9-bold.ttf",
    downloadUrl: "https://raw.githubusercontent.com/scott0107000/BoutiqueBitmap9x9/0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701/BoutiqueBitmap9x9_Bold_1.93.ttf",
    sourceUrl: "https://github.com/scott0107000/BoutiqueBitmap9x9",
    sourceCommit: "0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701",
  },
  {
    id: "boutique-9x9-3d",
    label: "Boutique 9×9 · 3D",
    form: "built-in-pixel-extrusion",
    intendedRole: "rare verdict or chapter hit",
    license: "OFL-1.1",
    expectedSha256: "54e3b75e92d7a541a71262c8b2ffe6b356257bd46f3628d37db72ad0ab1d3c4b",
    fileName: "boutique-9x9-3d.ttf",
    downloadUrl: "https://raw.githubusercontent.com/scott0107000/BoutiqueBitmap9x9/0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701/FUN/BoutiqueBitmap9x9_3D.ttf",
    sourceUrl: "https://github.com/scott0107000/BoutiqueBitmap9x9",
    sourceCommit: "0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701",
  },
  {
    id: "boutique-9x9-square-dot",
    label: "Boutique 9×9 · Square Dot",
    form: "separated-square-dot-matrix",
    intendedRole: "signal or system-state title",
    license: "OFL-1.1",
    expectedSha256: "79f063f80396ddfda7e09aae5495da7551a1da709539d56b43e3e926b724bbc3",
    fileName: "boutique-9x9-square-dot.ttf",
    downloadUrl: "https://raw.githubusercontent.com/scott0107000/BoutiqueBitmap9x9/0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701/FUN/BoutiqueBitmap9x9_Square_Dot.ttf",
    sourceUrl: "https://github.com/scott0107000/BoutiqueBitmap9x9",
    sourceCommit: "0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701",
  },
  {
    id: "boutique-9x9-circle-dot",
    label: "Boutique 9×9 · Circle Dot",
    form: "round-dot-matrix",
    intendedRole: "soft data or playful title",
    license: "OFL-1.1",
    expectedSha256: "d4f3b795c8a7dfc228ef7fffa22dfb7c199b119f4b861b13298681cfd27adfe5",
    fileName: "boutique-9x9-circle-dot.ttf",
    downloadUrl: "https://raw.githubusercontent.com/scott0107000/BoutiqueBitmap9x9/0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701/FUN/BoutiqueBitmap9x9_Circle_Dot.ttf",
    sourceUrl: "https://github.com/scott0107000/BoutiqueBitmap9x9",
    sourceCommit: "0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701",
  },
  {
    id: "boutique-9x9-gradient",
    label: "Boutique 9×9 · Gradient",
    form: "built-in-pixel-density-gradient",
    intendedRole: "transition or uncertainty title",
    license: "OFL-1.1",
    expectedSha256: "ab316f7207283a59c72dfb453547c667453c0d47475dbd0ef35e823620b27a5c",
    fileName: "boutique-9x9-gradient.ttf",
    downloadUrl: "https://raw.githubusercontent.com/scott0107000/BoutiqueBitmap9x9/0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701/FUN/BoutiqueBitmap9x9_Gradient.ttf",
    sourceUrl: "https://github.com/scott0107000/BoutiqueBitmap9x9",
    sourceCommit: "0f343adff9fbc63267d8bcdf2bb5dd32b4d7b701",
  },
  {
    id: "boutique-7x7-scan-line",
    label: "Boutique 7×7 · Scan Line",
    form: "ultra-low-res-horizontal-scanline",
    intendedRole: "rare signal interruption or terminal texture",
    license: "OFL-1.1",
    expectedSha256: "846c10011a5e10121f1053e454c8a49af08ceee94ac594431517b8b8293c0f5d",
    fileName: "boutique-7x7-scan-line.ttf",
    downloadUrl: "https://raw.githubusercontent.com/scott0107000/BoutiqueBitmap7x7/b174bc547dfaad118642316f279b4fec82ca7121/FUN/BoutiqueBitmap7x7_Scan_Line.ttf",
    sourceUrl: "https://github.com/scott0107000/BoutiqueBitmap7x7",
    sourceCommit: "b174bc547dfaad118642316f279b4fec82ca7121",
  },
  {
    id: "cubic-11",
    label: "Cubic 11",
    form: "balanced-11x11-square",
    intendedRole: "clean everyday pixel headline",
    license: "OFL-1.1",
    expectedSha256: "0193f5f033612496df6b45ee92ac3b335bc6a5a24ff95da55ca87b33e57dcf62",
    fileName: "cubic-11.ttf",
    downloadUrl: "https://raw.githubusercontent.com/ACh-K/Cubic-11/4c566f7d6cc5c05ee360fe9cff56b5da1fcafd4d/fonts/ttf/Cubic_11.ttf",
    sourceUrl: "https://github.com/ACh-K/Cubic-11",
    sourceCommit: "4c566f7d6cc5c05ee360fe9cff56b5da1fcafd4d",
  },
  {
    id: "miseki-bitmap-gothic",
    label: "Miseki Bitmap · Gothic",
    form: "compact-8px-gothic",
    intendedRole: "small support and compact overlay",
    license: "OFL-1.1",
    expectedSha256: "f87164d114c98c5abd420bd0048c17710c5362d8a5478686005cd73e155d80e8",
    fileName: "miseki-bitmap-gothic.ttf",
    downloadUrl: "https://raw.githubusercontent.com/ItMarki/MisekiBitmap/64b102ca30abe4de0733d9e80c0336a148297a2e/fonts/MisekiBitmap.ttf",
    sourceUrl: "https://github.com/ItMarki/MisekiBitmap",
    sourceCommit: "64b102ca30abe4de0733d9e80c0336a148297a2e",
  },
  {
    id: "miseki-bitmap-mincho",
    label: "Miseki Bitmap · Mincho",
    form: "compact-8px-pixel-serif",
    intendedRole: "quote, evidence, literary contrast",
    license: "OFL-1.1",
    expectedSha256: "b488824c55875ea5a684228a6e7432d49596b6ef3b129ffde9263938aaca576e",
    fileName: "miseki-bitmap-mincho.ttf",
    downloadUrl: "https://raw.githubusercontent.com/ItMarki/MisekiBitmap/64b102ca30abe4de0733d9e80c0336a148297a2e/fonts/MisekiBitmapMincho.ttf",
    sourceUrl: "https://github.com/ItMarki/MisekiBitmap",
    sourceCommit: "64b102ca30abe4de0733d9e80c0336a148297a2e",
  },
  {
    id: "renou-fangsong-16",
    label: "RenOu FangSong 16",
    form: "16px-pixel-fangsong",
    intendedRole: "editorial quotation or historical evidence",
    license: "OFL-1.1",
    expectedSha256: "20752474027efabc16d940b4b213d3462212b85df59b632d58c79d8c6d1ce27d",
    fileName: "renou-fangsong-16.ttf",
    downloadUrl: "https://raw.githubusercontent.com/yzdnn/RenOuFangSong-16/e673ef3ed5337b09b95d4d2bb2b6fd6ab8bbe5a1/Fonts/RenOuFangSong-16.ttf",
    sourceUrl: "https://github.com/yzdnn/RenOuFangSong-16",
    sourceCommit: "e673ef3ed5337b09b95d4d2bb2b6fd6ab8bbe5a1",
  },
  {
    id: "changban-diansong-16-sc",
    label: "ChangBan DianSong 16 · SC",
    form: "16px-pixel-song",
    intendedRole: "formal editorial statement",
    license: "OFL-1.1",
    expectedSha256: "b36947389aff05fbfed574fe7a7e58dc354c00f107fa616a2fd2b20ca12df4a6",
    fileName: "changban-diansong-16-sc.ttf",
    downloadUrl: "https://raw.githubusercontent.com/yzdnn/ChangBanDianSong-16/34cd8b4d439d58d8e6c82ed56502ace4471d902a/Fonts/ChangBanDianSong-16-SC.ttf",
    sourceUrl: "https://github.com/yzdnn/ChangBanDianSong-16",
    sourceCommit: "34cd8b4d439d58d8e6c82ed56502ace4471d902a",
  },
];

async function ensureFile(candidate) {
  const file = path.join(fontRoot, candidate.fileName);
  if (!fs.existsSync(file)) {
    if (candidate.localSource) fs.copyFileSync(candidate.localSource, file);
    else if (candidate.downloadArchiveUrl) {
      const response = await fetch(candidate.downloadArchiveUrl);
      if (!response.ok) throw new Error(`pixel-font-download-failed:${candidate.id}:${response.status}`);
      const archiveFile = `${file}.download.zip`;
      fs.writeFileSync(archiveFile, Buffer.from(await response.arrayBuffer()));
      try {
        fs.writeFileSync(file, execFileSync("unzip", ["-p", archiveFile, candidate.archiveEntry], {maxBuffer: 128 * 1024 * 1024}));
      } finally {
        fs.unlinkSync(archiveFile);
      }
    }
    else {
      const response = await fetch(candidate.downloadUrl);
      if (!response.ok) throw new Error(`pixel-font-download-failed:${candidate.id}:${response.status}`);
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    }
  }
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== candidate.expectedSha256) throw new Error(`pixel-font-sha-mismatch:${candidate.id}`);
  const font = fontkit.openSync(file);
  const missingGlyphs = [...new Set(exactCopy.join("").split("").filter((character) => {
    const glyph = font.layout(character).glyphs[0];
    return !glyph || glyph.id === 0;
  }))];
  if (missingGlyphs.length) throw new Error(`pixel-font-missing-required-glyphs:${candidate.id}:${missingGlyphs.join("")}`);
  return {...candidate, file, font, fontMeta: {family: font.familyName, subfamily: font.subfamilyName, glyphCount: font.numGlyphs}};
}

function makeTextPath(font, text, {x, y, size, tracking = 0, scaleX = 1}) {
  let cursor = x;
  const scale = size / font.unitsPerEm;
  const parts = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    parts.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  return parts.join("");
}

async function maskedForeground(basePixels, alphaFile) {
  const {data, info} = await sharp(basePixels).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const alpha = await sharp(alphaFile).resize(info.width, info.height, {fit: "fill"}).extractChannel(3).raw().toBuffer();
  for (let index = 0; index < info.width * info.height; index += 1) data[index * 4 + 3] = alpha[index];
  return sharp(data, {raw: info}).png({compressionLevel: 9}).toBuffer();
}

async function main() {
  fs.mkdirSync(fontRoot, {recursive: true});
  fs.mkdirSync(reviewRoot, {recursive: true});
  const workspace = JSON.parse(fs.readFileSync(path.join(phaseRoot, "workspace.json"), "utf8"));
  const board = workspace.production.articleAssetProductionAuthority.defaultLibraryWholeFilmStaticBoardReview;
  const ed31 = board.frames.find((frame) => frame.shotId === "ED-31");
  if (!ed31?.sourcePublicUrl) throw new Error("pixel-font-scout-ed31-source-required");
  const baseFile = path.join(appRoot, "public", ed31.sourcePublicUrl.replace(/^\//u, ""));
  const alphaFile = path.join(phaseRoot, "whole-film-motion-plan-v1/mattes/ED-31-dynamic-original-video-alpha.png");
  const styleBriefFile = path.join(phaseRoot, "default-design-asset-library-v1/whole-film-static-board-v1/presenter-typography-style-options-v1/style-brief.json");
  const styleBrief = JSON.parse(fs.readFileSync(styleBriefFile, "utf8"));
  const basePixels = await sharp(baseFile).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const foreground = await maskedForeground(basePixels, alphaFile);
  const prepared = [];
  for (const candidate of candidates) prepared.push(await ensureFile(candidate));
  const renders = [];
  for (const candidate of prepared) {
    const line1 = makeTextPath(candidate.font, exactCopy[0], {x: 92, y: 255, size: 124, tracking: -4, scaleX: 0.96});
    const line2 = makeTextPath(candidate.font, exactCopy[1], {x: 176, y: 630, size: 220, tracking: -8, scaleX: 0.94});
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><g fill="#05070a" fill-opacity="0.9" transform="translate(6 8)">${line1}${line2}</g><g fill="#b9c9ff">${line1}</g><g fill="#f4f2eb">${line2}</g></svg>`);
    const pixels = await sharp(basePixels).composite([{input: svg}, {input: foreground}]).png({compressionLevel: 9}).toBuffer();
    const file = path.join(reviewRoot, `${candidate.id}-ed31.png`);
    fs.writeFileSync(file, pixels);
    renders.push({candidate, pixels, file, sha256: sha256(pixels)});
  }
  const columns = 3;
  const tileWidth = 600;
  const tileHeight = 338;
  const cellWidth = 630;
  const rowHeight = 400;
  const top = 64;
  const width = 1920;
  const height = top + Math.ceil(renders.length / columns) * rowHeight;
  const layers = [];
  const labels = [];
  for (const [index, render] of renders.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = 15 + column * cellWidth;
    const y = top + row * rowHeight;
    layers.push({input: await sharp(render.pixels).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top: y});
    labels.push(`<text x="${left}" y="${y + tileHeight + 22}" fill="#e8edf0" font-family="monospace" font-size="16">${render.candidate.label}</text><text x="${left}" y="${y + tileHeight + 43}" fill="#91a0ad" font-family="monospace" font-size="13">${render.candidate.form}</text>`);
  }
  const sheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0b1015"/><text x="15" y="36" fill="#dfff68" font-family="monospace" font-size="20">CHINESE PIXEL FONT SCOUT · DISTINCT GLYPH FORMS · REAL PRESENTER MATTE · REVIEW ONLY</text>${labels.join("")}</svg>`);
  const sheetPixels = await sharp(sheetSvg).composite(layers).png({compressionLevel: 9}).toBuffer();
  const sheetFile = path.join(reviewRoot, "pixel-font-scout-sheet.png");
  fs.writeFileSync(sheetFile, sheetPixels);
  const manifestBody = {
    contract: "A1IsolatedChinesePixelFontScout/v3",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    semanticJob: "compare genuinely different Chinese pixel glyph systems for strong presenter typography",
    sourceStyleBriefSha256: styleBrief.styleBriefSha256,
    exactCopy,
    candidateCount: renders.length,
    allRequiredGlyphsPresent: true,
    allFontsOfl11: renders.every(({candidate}) => candidate.license === "OFL-1.1"),
    actualPresenterPixelsUsed: true,
    actualPresenterMatteUsed: true,
    formalTextGeneratedByImageModel: false,
    currentAuthorityUntouched: true,
    defaultFontChanged: false,
    productionAdmitted: false,
    userVisualApproval: "NOT_APPROVED",
    reviewFindings: {
      directionCorrection: "GENUINE_CHINESE_PIXEL_GLYPH_VARIETY_NOT_ORDINARY_BOLD_SANS",
      strongestDesignedEverydayHeadline: "boutique-9x9-bold",
      readableHeavyComparisonNotRecommendedAsSolePrimary: "fusion-bold-pixel-12",
      semanticAccentCandidates: ["boutique-9x9-3d", "boutique-9x9-square-dot", "boutique-9x9-circle-dot"],
      editorialPixelSerifCandidate: "changban-diansong-16-sc",
      rareEffectOnly: ["boutique-9x9-gradient", "boutique-7x7-scan-line", "renou-fangsong-16"],
      redundantOnExactCopy: ["miseki-bitmap-gothic", "miseki-bitmap-mincho"],
    },
    searchExclusions: [
      {id: "fashion-bitmap-16", reason: "missing-required-glyphs", glyphs: ["觉", "废"]},
      {id: "ark-pixel-16-zh-cn", reason: "missing-11-required-glyphs-on-exact-copy"},
      {id: "boutique-7x7-regular", reason: "missing-required-glyph", glyphs: ["觉"]},
      {id: "pulse-pixel-font", reason: "upstream-concept-proof-no-usable-instance"},
      {id: "capsule-pixel-font", reason: "upstream-concept-proof-no-usable-instance"},
    ],
    candidates: renders.map(({candidate, file, sha256: renderSha256}) => ({
      id: candidate.id,
      label: candidate.label,
      form: candidate.form,
      intendedRole: candidate.intendedRole,
      license: candidate.license,
      sourceUrl: candidate.sourceUrl,
      sourceCommit: candidate.sourceCommit,
      fontFile: path.relative(root, candidate.file),
      fontSha256: candidate.expectedSha256,
      font: candidate.fontMeta,
      missingRequiredGlyphs: [],
      renderFile: path.relative(root, file),
      renderSha256,
    })),
    reviewSheet: {file: path.relative(root, sheetFile), sha256: sha256(sheetPixels), width, height},
    createdAt: new Date().toISOString(),
  };
  const manifest = {...manifestBody, manifestSha256: sha256(Buffer.from(JSON.stringify(manifestBody)))};
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({status: manifest.status, candidateCount: manifest.candidateCount, allRequiredGlyphsPresent: true, allFontsOfl11: true, currentAuthorityUntouched: true, reviewSheet: manifest.reviewSheet, candidates: manifest.candidates.map(({id, form, font, fontSha256, renderSha256}) => ({id, form, glyphCount: font.glyphCount, fontSha256, renderSha256}))}, null, 2));
}

await main();
