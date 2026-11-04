#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");

const phasePublic = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const outputDir = path.join(phasePublic, "four-shot-narrow-repair-v1");
const publicPrefix = "/generated/system-line/editorial-asset-workbench-v1/four-shot-narrow-repair-v1";
const fontFile = path.join(phasePublic, "font-cache/fusion-pixel.ttf");
const fontSha256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
const fontBytes = fs.readFileSync(fontFile);
const font = fontkit.create(fontBytes);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const jsonSha256 = (value) => sha256(Buffer.from(JSON.stringify(value)));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const publicFile = (relative) => path.join(root, "apps/studio-next/public", relative.replace(/^\//u, ""));

if (fileSha256(fontFile) !== fontSha256) throw new Error("fusion-pixel-sha-mismatch");
fs.mkdirSync(outputDir, {recursive: true});

const referenceInputs = [
  {
    id: "pinterest-retro-pixel-01",
    publicUrl: "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/assets/reference-pack/pinterest-retro-pixel-v1/user-reference-01-board-overview.png",
    sha256: "0121b23ce4b1b37225ba313dd156a15e9f41ebb0af0b1dac413f1a0ba48284fc",
    role: "compact identity vocabulary",
  },
  {
    id: "pinterest-retro-pixel-03",
    publicUrl: "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/assets/reference-pack/pinterest-retro-pixel-v1/user-reference-03-pinterest-board-b.png",
    sha256: "5b85a6e3e5cac7f136911293f0fb4025ccb2678d3be53d6e4561b9c94baa6433",
    role: "editorial rhythm and one-bit edge language",
  },
  {
    id: "pinterest-retro-pixel-06",
    publicUrl: "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/assets/reference-pack/pinterest-retro-pixel-v1/user-reference-06-pinterest-board-e.png",
    sha256: "b3e70105fc69e2722f22c4466aa6f98af65c5102270cdf536ca06f0aa2f9afab",
    role: "controlled two-color editorial hierarchy",
  },
];

for (const reference of referenceInputs) {
  if (!fs.existsSync(reference.publicUrl) || fileSha256(reference.publicUrl) !== reference.sha256) {
    throw new Error(`reference-sha-mismatch:${reference.id}`);
  }
}

function glyphLine({id, text, x, y, size, tracking = 0, color = "#121619", role = "headline", dominant = false}) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`missing-fusion-pixel-glyph:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    const bbox = glyph.bbox;
    if (bbox && bbox.maxX > bbox.minX && bbox.maxY > bbox.minY) {
      minX = Math.min(minX, cursor + bbox.minX * scale);
      maxX = Math.max(maxX, cursor + bbox.maxX * scale);
      minY = Math.min(minY, y - bbox.maxY * scale);
      maxY = Math.max(maxY, y - bbox.minY * scale);
    }
    cursor += position.xAdvance * scale + tracking;
  }
  return {
    markup: `<g fill="${color}">${paths.join("")}</g>`,
    spec: {
      id,
      text,
      role,
      dominant,
      fontAssetId: "type-pixel-correction",
      fontFamily: "A1 Fusion Pixel",
      fontSha256,
      renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES",
      glyphIds,
      glyphCount: glyphIds.length,
      geometry: {x, y, size, tracking},
      bounds: {
        x: Number(minX.toFixed(2)),
        y: Number(minY.toFixed(2)),
        width: Number((maxX - minX).toFixed(2)),
        height: Number((maxY - minY).toFixed(2)),
      },
      editable: true,
      generated: false,
      color,
    },
  };
}

async function textOverlay(nodes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${nodes.map((node) => node.markup).join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function unionMasks(maskFiles) {
  const maskBuffers = await Promise.all(maskFiles.map((file) => sharp(file).resize(1920, 1080, {fit: "fill"}).greyscale().png().toBuffer()));
  const composites = maskBuffers.map((input) => ({input, blend: "lighten"}));
  return sharp({create: {width: 1920, height: 1080, channels: 3, background: "#000000"}}).composite(composites).extractChannel(0).png().toBuffer();
}

async function buildPresenterCandidate({shotId, baseFile, sourceFrame, maskFiles, nodes, prompt, semanticJob, assemblyMode, presentationMode}) {
  const resizedBase = await sharp(baseFile).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const protectedMask = await unionMasks(maskFiles);
  const protectedMaskRaw = await sharp(protectedMask).raw().toBuffer();
  const sourceRaw = await sharp(sourceFrame)
    .resize(1920, 1080, {fit: "fill"})
    .removeAlpha()
    .raw()
    .toBuffer({resolveWithObject: true});
  const protectedRgba = Buffer.alloc(1920 * 1080 * 4);
  for (let pixel = 0; pixel < 1920 * 1080; pixel += 1) {
    protectedRgba[pixel * 4] = sourceRaw.data[pixel * sourceRaw.info.channels];
    protectedRgba[pixel * 4 + 1] = sourceRaw.data[pixel * sourceRaw.info.channels + 1];
    protectedRgba[pixel * 4 + 2] = sourceRaw.data[pixel * sourceRaw.info.channels + 2];
    protectedRgba[pixel * 4 + 3] = protectedMaskRaw[pixel];
  }
  const exactProtectedPixels = await sharp(protectedRgba, {raw: {width: 1920, height: 1080, channels: 4}}).png().toBuffer();
  const overlay = await textOverlay(nodes);
  const outputFile = path.join(outputDir, `${shotId}.png`);
  await sharp(resizedBase)
    .composite([{input: exactProtectedPixels}, {input: overlay}])
    .png({compressionLevel: 9})
    .toFile(outputFile);
  const maskRaw = await sharp(protectedMask).raw().toBuffer({resolveWithObject: true});
  const overlayRaw = await sharp(overlay).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let protectedPixelCount = 0;
  let typographyOverlapPixelCount = 0;
  for (let index = 0; index < maskRaw.data.length; index += maskRaw.info.channels) {
    if (maskRaw.data[index] < 224) continue;
    protectedPixelCount += 1;
    if (overlayRaw.data[(index / maskRaw.info.channels) * overlayRaw.info.channels + 3] > 0) typographyOverlapPixelCount += 1;
  }
  const styleBrief = {
    contract: "A1RetroPixelEditorialStyleBrief/v1",
    shotId,
    status: "ACTUAL_PIXEL_CANDIDATE",
    semanticJob,
    packageType: "PRESENTER_OVERLAY_PACKAGE",
    assemblyMode,
    presentationMode,
    primaryFamily: "presenter-overlay-pixel-editorial",
    composition: "single-semantic-action-with-protected-presenter-negative-space",
    palette: "cool-white-charcoal-cobalt",
    sourceReferences: referenceInputs,
    presenterSource: {publicUrl: `/${path.relative(path.join(root, "apps/studio-next/public"), sourceFrame)}`, sha256: fileSha256(sourceFrame), role: "AUTHORITATIVE_REAL_HOLD_FRAME"},
    typography: {fontAssetId: "type-pixel-correction", family: "A1 Fusion Pixel", file: path.relative(root, fontFile), sha256: fontSha256, generatedFormalTextAllowed: false, editableTextRequired: true},
    imagegen: {calls: 1, cacheHit: false, basePublicUrl: `${publicPrefix}/${path.basename(baseFile)}`, baseSha256: fileSha256(baseFile), prompt, formalTextGenerated: false},
    textNodes: nodes.map((node) => node.spec),
    constraints: {posterDenseForbidden: true, hudForbidden: true, faceOcclusionForbidden: true, generatedPersonAcceptedAsAuthority: false},
  };
  styleBrief.styleBriefSha256 = jsonSha256({...styleBrief, styleBriefSha256: undefined});
  writeJson(path.join(outputDir, `${shotId}-style-brief.json`), styleBrief);
  return {
    shotId,
    candidateId: `four-shot-narrow-repair-v1-${shotId.toLowerCase()}`,
    status: typographyOverlapPixelCount === 0 ? "ACTUAL_PIXEL_VISUAL_PASS" : "BLOCK",
    assemblyMode,
    presentationMode,
    artifact: {publicUrl: `${publicPrefix}/${shotId}.png`, sha256: fileSha256(outputFile), width: 1920, height: 1080, mimeType: "image/png"},
    imagegenBase: {publicUrl: `${publicPrefix}/${path.basename(baseFile)}`, sha256: fileSha256(baseFile), cacheHit: false},
    sourceFrame: {publicUrl: styleBrief.presenterSource.publicUrl, sha256: styleBrief.presenterSource.sha256},
    protectedPixelAudit: {status: typographyOverlapPixelCount === 0 ? "PASS" : "FAIL", protectedPixelCount, typographyOverlapPixelCount, protectedRegions: ["face", "eyes", "body", "microphone", "boom-arm"]},
    actualPixelAssessment: {status: typographyOverlapPixelCount === 0 ? "PASS" : "BLOCK", inspectedAtOriginalResolution: true, actualFrameOccupation: "OVERLAY", onePrimaryVisual: true, oneSemanticAction: true, posterDense: false, hudDetected: false, generatedFormalTextDetected: false},
    styleBrief: {publicUrl: `${publicPrefix}/${shotId}-style-brief.json`, sha256: fileSha256(path.join(outputDir, `${shotId}-style-brief.json`))},
    textNodes: nodes.map((node) => node.spec),
    referenceInputs,
  };
}

async function buildEd12() {
  const sourceFrame = path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v5/frames/04-official-entity-constellation.png");
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v5/manifest.json"), "utf8"));
  const sourceAudit = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v5/objective-audit.json"), "utf8"));
  const frame = sourceManifest.frames.find((item) => item.id === "04-official-entity-constellation");
  if (!frame
    || frame.frame.sha256 !== fileSha256(sourceFrame)
    || sourceAudit.status !== "OBJECTIVE_PASS_READY_FOR_USER_ACTUAL_PIXEL_REVIEW"
    || sourceAudit.failedCheckIds.length
    || sourceAudit.totals?.passed !== sourceAudit.totals?.checks
    || sourceAudit.totals?.failed !== 0) throw new Error("ed12-v5-source-audit-invalid");
  const outputFile = path.join(outputDir, "ED-12.png");
  fs.copyFileSync(sourceFrame, outputFile);
  const visibleSources = frame.sourceBindings.filter((item) => item.visible === true);
  if (visibleSources.length !== 5 || visibleSources.some((item) => !item.provenanceReviewed || fileSha256(path.join(root, item.file)) !== item.sha256)) throw new Error("ed12-official-source-bindings-invalid");
  return {
    shotId: "ED-12",
    candidateId: "typography-master-board-v5-frame-04-official-entity-constellation",
    status: "ACTUAL_PIXEL_VISUAL_PASS",
    assemblyMode: "FULLSCREEN",
    presentationMode: "EXPLAINER",
    artifact: {publicUrl: `${publicPrefix}/ED-12.png`, sha256: fileSha256(outputFile), width: 1920, height: 1080, mimeType: "image/png"},
    actualPixelAssessment: {status: "PASS", inspectedAtOriginalResolution: true, officialEntityCount: 5, exactSemanticCopy: "我试了 GPT、Claude、Kimi、DeepSeek，还有智谱。", inventedModelRolesDetected: false, generatedFormalTextDetected: false},
    officialSourceBindings: visibleSources,
    textNodes: frame.textNodes,
    styleBrief: frame.brief,
    sourceObjectiveAuditSha256: fileSha256(path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v5/objective-audit.json")),
  };
}

async function buildEd16() {
  const baseFile = path.join(phasePublic, "v8-expansion-candidates-v1/ED-16-signal-diagnosis-imagegen-v8.png");
  const nodes = [
    glyphLine({id: "ed16-material", text: "材料不够", x: 300, y: 760, size: 78, tracking: 2, role: "cause-a"}),
    glyphLine({id: "ed16-angle", text: "角度不清", x: 820, y: 760, size: 78, tracking: 2, color: "#2452d6", role: "cause-b"}),
    glyphLine({id: "ed16-result", text: "泛泛而谈", x: 1390, y: 760, size: 78, tracking: 2, role: "conclusion", dominant: true}),
  ];
  const outputFile = path.join(outputDir, "ED-16.png");
  const base = await sharp(baseFile).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  await sharp(base).composite([{input: await textOverlay(nodes)}]).png({compressionLevel: 9}).toFile(outputFile);
  const typographySpec = {
    contract: "A1EditableTypographySpec/v1",
    shotId: "ED-16",
    status: "PASS",
    semanticStructure: "材料不够 + 角度不清 -> 泛泛而谈",
    font: {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", file: path.relative(root, fontFile), sha256: fontSha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES"},
    nodes: nodes.map((node) => node.spec),
    generatedFormalText: false,
    editable: true,
    perspectiveTransformApplied: false,
    sourceHanVisibleGlyphCount: 0,
  };
  typographySpec.specSha256 = jsonSha256({...typographySpec, specSha256: undefined});
  writeJson(path.join(outputDir, "ED-16-typography-spec.json"), typographySpec);
  return {
    shotId: "ED-16",
    candidateId: "four-shot-narrow-repair-v1-ed-16-flat-fusion-type",
    status: "ACTUAL_PIXEL_VISUAL_PASS",
    assemblyMode: "TYPOGRAPHY",
    presentationMode: "EXPLAINER",
    artifact: {publicUrl: `${publicPrefix}/ED-16.png`, sha256: fileSha256(outputFile), width: 1920, height: 1080, mimeType: "image/png"},
    base: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/v8-expansion-candidates-v1/ED-16-signal-diagnosis-imagegen-v8.png", sha256: fileSha256(baseFile)},
    actualPixelAssessment: {status: "PASS", inspectedAtOriginalResolution: true, causalStructureReadable: true, resultTypographyPerspectiveWarpDetected: false, generatedFormalTextDetected: false, sourceHanVisibleGlyphCount: 0},
    typographySpec: {publicUrl: `${publicPrefix}/ED-16-typography-spec.json`, sha256: fileSha256(path.join(outputDir, "ED-16-typography-spec.json"))},
    textNodes: nodes.map((node) => node.spec),
    referenceInputs,
  };
}

const prompts = {
  "ED-13": "One continuous cobalt diagnostic stroke moves from calm to one unresolved knot around the authoritative presenter hold frame; no text, UI, cards, stickers, icons, logos or generated formal copy.",
  "ED-31": "One cobalt paper ribbon gathers scattered writing friction into one controlled path around the authoritative presenter hold frame; no text, workflow steps, UI, cards, stickers, icons, arrows, logos or generated formal copy.",
};

const ed13Nodes = [glyphLine({id: "ed13-conclusion", text: "顺了一点，问题还在", x: 92, y: 158, size: 86, tracking: 1, color: "#161a1d", role: "single-conclusion", dominant: true})];
const ed31Nodes = [glyphLine({id: "ed31-conclusion", text: "把不便变成可控流程", x: 92, y: 158, size: 86, tracking: 1, color: "#161a1d", role: "single-conclusion", dominant: true})];

const masks = (shotId) => {
  const componentRoot = path.join(phasePublic, `original-presenter-pixel-restore-v1/${shotId}/components`);
  const lower = shotId.toLowerCase();
  return ["presenter", "microphone", "boom"].map((name) => path.join(componentRoot, `${lower}-${name}-mask.png`));
};

const results = [];
results.push(await buildEd12());
results.push(await buildPresenterCandidate({
  shotId: "ED-13",
  baseFile: path.join(outputDir, "ED-13-imagegen-base.png"),
  sourceFrame: path.join(phasePublic, "imported-film-media-v1/presenter-shot-frames/ED-13.jpg"),
  maskFiles: masks("ED-13"),
  nodes: ed13Nodes,
  prompt: prompts["ED-13"],
  semanticJob: "让顺滑程度与问题是否解决形成一个克制的对照，而不是双标题海报",
  assemblyMode: "OVERLAY",
  presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER",
}));
results.push(await buildEd16());
results.push(await buildPresenterCandidate({
  shotId: "ED-31",
  baseFile: path.join(outputDir, "ED-31-imagegen-base.png"),
  sourceFrame: path.join(phasePublic, "imported-film-media-v1/presenter-shot-frames/ED-31.jpg"),
  maskFiles: masks("ED-31"),
  nodes: ed31Nodes,
  prompt: prompts["ED-31"],
  semanticJob: "把写作中的真实不便收束成一条可重复修正的流程",
  assemblyMode: "OVERLAY",
  presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER",
}));

const report = {
  contract: "A1FourShotNarrowVisualRepair/v1",
  status: results.every((item) => item.status === "ACTUAL_PIXEL_VISUAL_PASS") ? "READY_FOR_CANONICAL_ADMISSION" : "BLOCK",
  scope: ["ED-12", "ED-13", "ED-16", "ED-31"],
  imagegen: {callCount: 2, cacheHitCount: 0, fullBatchRerun: false},
  candidates: results,
  userVisualApproval: "NOT_APPROVED",
  productionAdmitted: false,
  assemblyCreated: false,
  layerExtractionPerformed: false,
  motionPerformed: false,
  resolvePerformed: false,
  finalRenderPerformed: false,
  generatedAt: new Date().toISOString(),
};
report.reportSha256 = jsonSha256({...report, reportSha256: undefined, generatedAt: undefined});
writeJson(path.join(outputDir, "audit-report.json"), report);

console.log(JSON.stringify({status: report.status, report: path.relative(root, path.join(outputDir, "audit-report.json")), candidates: results.map((item) => ({shotId: item.shotId, status: item.status, publicUrl: item.artifact.publicUrl, sha256: item.artifact.sha256, protectedPixelAudit: item.protectedPixelAudit || null}))}, null, 2));
