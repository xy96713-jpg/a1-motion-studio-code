#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const sourceRoot = path.join(generatedRoot, "opening-nine-carrier-rhythm-canary-v1");
const outputRoot = path.join(generatedRoot, "opening-creator-packaging-lookmaster-v2");
const frameRoot = path.join(outputRoot, "frames");
const workspacePath = path.join(generatedRoot, "workspace.json");
const sourceManifestPath = path.join(sourceRoot, "manifest.json");
const researchPath = path.join(root, "work/style-research/creator-packaging-structure-2026-08-16.md");
const brightBackgroundPath = path.join(root, ".codex-artifacts/system-progress-system-line/background-library-review-v1/01-cool-halftone-quiet-field.png");
const darkBackgroundPath = path.join(root, ".codex-artifacts/system-progress-system-line/background-library-review-v1/02-charcoal-contour-quiet-field.png");
const fontPath = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const ed09ImagegenSourcePath = path.join(outputRoot, "source/ed09-textless-machine.png");

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const resolveRootPath = (relativePath) => path.join(root, relativePath);
const atomicJson = (file, value) => {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};

for (const file of [workspacePath, sourceManifestPath, researchPath, brightBackgroundPath, darkBackgroundPath, fontPath, ed09ImagegenSourcePath]) {
  if (!fs.existsSync(file)) throw new Error(`opening-creator-canary-input-missing:${path.relative(root, file)}`);
}

const workspace = readJson(workspacePath);
const sourceManifest = readJson(sourceManifestPath);
if (workspace.production?.generation?.summary?.queued !== 0 || workspace.production?.generation?.summary?.running !== 0 || workspace.production?.generation?.workerStatus !== "frozen") throw new Error("opening-creator-canary-worker-not-idle");
if (workspace.production?.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("opening-creator-canary-user-boundary-drift");
if (sourceManifest.status !== "READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY" || sourceManifest.entries?.length !== 9) throw new Error("opening-creator-canary-source-invalid");

fs.mkdirSync(frameRoot, {recursive: true});
const width = 960;
const height = 540;
const blue = "#315dff";
const ink = "#111516";
const paper = "#f3f4f1";
const presenterHoldPath = path.join(generatedRoot, "video-packaging-context-v1/ed-01-hold-frame.jpg");
const evidenceByShot = {
  "ED-02": {file: path.join(generatedRoot, "source-cache/causal-writing-workbench-v1/02-selected.png"), crop: {left: 480, top: 430, width: 980, height: 300}},
  "ED-03": {file: path.join(generatedRoot, "source-cache/writing-workbench-action-pack-v1/preference-02-disliked.png"), crop: {left: 600, top: 390, width: 760, height: 410}},
  "ED-04": {file: path.join(generatedRoot, "source-cache/writing-workbench-action-pack-v1/paragraph-02-request.png"), crop: {left: 500, top: 380, width: 980, height: 390}},
  "ED-05": {file: path.join(generatedRoot, "source-cache/writing-workbench-action-pack-v1/review-01-findings.png"), crop: {left: 1190, top: 60, width: 690, height: 610}},
  "ED-06": {file: path.join(generatedRoot, "source-cache/writing-workbench-action-pack-v1/presentation-03-playing.png"), crop: {left: 400, top: 120, width: 1120, height: 790}},
};
for (const {file} of Object.values(evidenceByShot)) if (!fs.existsSync(file)) throw new Error(`opening-creator-canary-evidence-missing:${path.relative(root, file)}`);
if (!fs.existsSync(presenterHoldPath)) throw new Error("opening-creator-canary-presenter-hold-missing");

const cleanBackground = async (file, dark = false) => {
  const meta = await sharp(file).metadata();
  const sourceWidth = meta.width || 1920;
  const sourceHeight = meta.height || 1080;
  return sharp(file)
    .extract({left: Math.floor(sourceWidth * 0.35), top: 0, width: Math.floor(sourceWidth * 0.65), height: sourceHeight})
    .resize(width, height, {fit: "cover"})
    .modulate(dark ? {brightness: 0.62, saturation: 0.42} : {brightness: 1.04, saturation: 0.34})
    .png()
    .toBuffer();
};
const brightBackground = await cleanBackground(brightBackgroundPath, false);
const darkBackground = await cleanBackground(darkBackgroundPath, true);

const fontFace = `@font-face { font-family: A1FusionPixel; src: url('file://${fontPath}'); }`;

const buildTypographyTakeover = async () => {
  const art = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>${fontFace}</style>
      <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.35" fill="#f3f4f1" opacity=".32"/></pattern>
    </defs>
    <rect width="960" height="540" fill="#0a0f17"/>
    <path d="M585 68 H934 V304 H836 L770 374 V304 H585 Z" fill="none" stroke="#315dff" stroke-width="12"/>
    <path d="M610 94 H910 V278 H815 L760 334 V278 H610 Z" fill="url(#dots)"/>
    <path d="M604 127 H820 M604 169 H878 M604 211 H784" stroke="#f3f4f1" stroke-width="13" opacity=".82"/>
    <path d="M758 334 L716 389 L764 416 L721 462" fill="none" stroke="#315dff" stroke-width="12"/>
    <rect x="70" y="72" width="216" height="8" fill="#315dff"/>
    <text x="72" y="143" fill="#7692ff" font-family="A1FusionPixel" font-size="46">AI 常常</text>
    <text x="66" y="305" fill="#f3f4f1" font-family="A1FusionPixel" font-size="122">不说</text>
    <text x="64" y="451" fill="#315dff" font-family="A1FusionPixel" font-size="122">人话</text>
    <rect x="70" y="486" width="420" height="9" fill="#f3f4f1" opacity=".22"/>
    <rect x="70" y="486" width="166" height="9" fill="#315dff"/>
  </svg>`);
  return sharp(art).png().toBuffer();
};

const buildEd09LookMaster = async () => {
  const substrate = await sharp(ed09ImagegenSourcePath).resize(width, height, {fit: "cover"}).png().toBuffer();
  const title = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>${fontFace}</style></defs>
    <text x="62" y="155" fill="#111516" font-family="A1FusionPixel" font-size="61">中文，</text>
    <text x="60" y="238" fill="#111516" font-family="A1FusionPixel" font-size="76">却看不懂</text>
    <path d="M63 272 H294" stroke="#315dff" stroke-width="10"/>
    <rect x="63" y="292" width="14" height="14" fill="#111516"/>
    <rect x="86" y="292" width="14" height="14" fill="#315dff"/>
  </svg>`);
  return sharp(substrate).composite([{input: title}]).png().toBuffer();
};

const fitScreenStage = async ({inputFile, background, crop, border = ink, left = 70, top = 48, cardWidth = 820, cardHeight = 444, fit = "cover"}) => {
  const meta = await sharp(inputFile).metadata();
  const sourceWidth = meta.width || width;
  const sourceHeight = meta.height || height;
  const extract = {
    left: Math.max(0, Math.min(sourceWidth - crop.width, crop.left)),
    top: Math.max(0, Math.min(sourceHeight - crop.height, crop.top)),
    width: Math.min(crop.width, sourceWidth),
    height: Math.min(crop.height, sourceHeight),
  };
  const screen = await sharp(inputFile)
    .extract(extract)
    .resize(cardWidth - 10, cardHeight - 10, {fit, background: fit === "contain" ? ink : undefined})
    .png()
    .toBuffer();
  const ghost = await sharp(inputFile)
    .resize(width, height, {fit: "cover"})
    .blur(1.2)
    .modulate({brightness: 1.05, saturation: 0.12})
    .ensureAlpha(0.14)
    .png()
    .toBuffer();
  const frame = await sharp({create: {width: cardWidth, height: cardHeight, channels: 4, background: border}})
    .composite([{input: screen, left: 5, top: 5}])
    .png()
    .toBuffer();
  const shadow = Buffer.from(`<svg width="${width}" height="${height}"><rect x="${left + 16}" y="${top + 18}" width="${cardWidth}" height="${cardHeight}" rx="3" fill="#000" opacity="0.22"/><path d="M ${left - 22} ${top + 94} H ${left + 8}" stroke="${blue}" stroke-width="7"/><path d="M ${left + cardWidth - 8} ${top + cardHeight - 54} H ${left + cardWidth + 28}" stroke="${blue}" stroke-width="7"/></svg>`);
  const stageMarks = Buffer.from(`<svg width="${width}" height="${height}"><path d="M 0 ${top + 18} H ${left - 18}" stroke="${blue}" stroke-width="5"/><path d="M ${left + cardWidth + 18} ${top + cardHeight - 18} H ${width}" stroke="${blue}" stroke-width="5"/><rect x="${left - 9}" y="${top - 9}" width="42" height="18" fill="${paper}" stroke="${ink}" stroke-width="3"/><rect x="${left + cardWidth - 33}" y="${top + cardHeight - 9}" width="42" height="18" fill="${paper}" stroke="${ink}" stroke-width="3"/></svg>`);
  return sharp(background).composite([{input: ghost, blend: "soft-light"}, {input: shadow}, {input: frame, left, top}, {input: stageMarks}]).png().toBuffer();
};

const splitEvidenceStage = async ({evidence, presenterSide}) => {
  const presenterWidth = 350;
  const evidenceWidth = width - presenterWidth;
  const presenter = await sharp(presenterHoldPath)
    .extract({left: presenterSide === "left" ? 120 : 300, top: 0, width: presenterSide === "left" ? 640 : 500, height: 540})
    .resize(presenterWidth, height, {fit: "cover"})
    .modulate({brightness: 0.84, saturation: 0.7})
    .png()
    .toBuffer();
  const screen = await sharp(evidence.file)
    .extract(evidence.crop)
    .resize(evidenceWidth - 44, height - 96, {fit: "contain", background: paper})
    .extend({top: 5, bottom: 5, left: 5, right: 5, background: ink})
    .png()
    .toBuffer();
  const background = presenterSide === "left" ? brightBackground : darkBackground;
  const screenLeft = presenterSide === "left" ? presenterWidth + 22 : 22;
  const presenterLeft = presenterSide === "left" ? 0 : width - presenterWidth;
  const dividerX = presenterSide === "left" ? presenterWidth : width - presenterWidth;
  const accent = Buffer.from(`<svg width="${width}" height="${height}"><rect x="${dividerX - 2}" width="4" height="${height}" fill="${blue}"/><path d="M ${screenLeft - 12} 74 H ${screenLeft + 42}" stroke="${blue}" stroke-width="6"/></svg>`);
  return sharp(background).composite([{input: presenter, left: presenterLeft, top: 0}, {input: screen, left: screenLeft, top: 43}, {input: accent, left: 0, top: 0}]).png().toBuffer();
};

const entryByShot = new Map(sourceManifest.entries.map((entry) => [entry.shotId, entry]));
const outputEntries = [];
for (const shotId of Array.from({length: 9}, (_, index) => `ED-${String(index + 1).padStart(2, "0")}`)) {
  const entry = entryByShot.get(shotId);
  if (!entry) throw new Error(`opening-creator-canary-entry-missing:${shotId}`);
  const existingCandidate = resolveRootPath(entry.candidateFrame.path);
  if (!fs.existsSync(existingCandidate)) throw new Error(`opening-creator-canary-frame-missing:${shotId}`);
  let bytes;
  if (shotId === "ED-02") {
    bytes = await fitScreenStage({inputFile: evidenceByShot[shotId].file, background: brightBackground, crop: evidenceByShot[shotId].crop, left: 54, top: 78, cardWidth: 852, cardHeight: 384});
  } else if (shotId === "ED-03") {
    bytes = await splitEvidenceStage({evidence: evidenceByShot[shotId], presenterSide: "left"});
  } else if (shotId === "ED-04") {
    bytes = await fitScreenStage({inputFile: evidenceByShot[shotId].file, background: brightBackground, crop: evidenceByShot[shotId].crop, left: 54, top: 62, cardWidth: 852, cardHeight: 416});
  } else if (shotId === "ED-05") {
    bytes = await splitEvidenceStage({evidence: evidenceByShot[shotId], presenterSide: "right"});
  } else if (shotId === "ED-06") {
    bytes = await fitScreenStage({inputFile: evidenceByShot[shotId].file, background: darkBackground, crop: evidenceByShot[shotId].crop, border: paper, left: 52, top: 30, cardWidth: 856, cardHeight: 480, fit: "contain"});
  } else if (shotId === "ED-08") {
    bytes = await buildTypographyTakeover();
  } else if (shotId === "ED-09") {
    bytes = await buildEd09LookMaster();
  } else {
    bytes = await sharp(existingCandidate).resize(width, height, {fit: "cover"}).png().toBuffer();
  }
  const outputFile = path.join(frameRoot, `${shotId}.png`);
  fs.writeFileSync(outputFile, bytes);
  outputEntries.push({
    shotId,
    semanticWindow: entry.semanticWindow,
    sourceText: entry.sourceText,
    carrier: entry.candidateCarrier,
    sourceEvidencePreserved: entry.evidencePreserved === true,
    frame: {path: path.relative(root, outputFile), publicUrl: publicUrl(outputFile), sha256: sha(bytes), width, height},
  });
}

const tileWidth = 480;
const imageHeight = 270;
const labelHeight = 48;
const tiles = [];
for (const [index, entry] of outputEntries.entries()) {
  const image = await sharp(resolveRootPath(entry.frame.path)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0e10"/><rect width="5" height="100%" fill="${blue}"/><text x="16" y="20" fill="#f2efe4" font-size="14" font-weight="700" font-family="monospace">${entry.shotId}</text><text x="16" y="38" fill="#8ea0ff" font-size="10" font-family="monospace">${entry.carrier}</text></svg>`);
  const tile = await sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 3, background: "#0b0e10"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  tiles.push({input: tile, left: index % 3 * tileWidth, top: Math.floor(index / 3) * (imageHeight + labelHeight)});
}
const boardPath = path.join(outputRoot, "opening-creator-packaging-board.png");
await sharp({create: {width: 1440, height: (imageHeight + labelHeight) * 3, channels: 3, background: "#0b0e10"}}).composite(tiles).png().toFile(boardPath);

const previousBoard = path.join(sourceRoot, "opening-nine-candidate-board.png");
const comparePath = path.join(outputRoot, "opening-creator-packaging-before-after.png");
const oldBoard = await sharp(previousBoard).resize(1440, 954, {fit: "cover"}).png().toBuffer();
const newBoard = await sharp(boardPath).resize(1440, 954, {fit: "cover"}).png().toBuffer();
const header = (title) => Buffer.from(`<svg width="1440" height="64"><rect width="100%" height="100%" fill="#111617"/><text x="22" y="41" fill="#f2efe4" font-size="23" font-weight="700" font-family="monospace">${title}</text></svg>`);
await sharp({create: {width: 2896, height: 1018, channels: 3, background: "#111617"}}).composite([
  {input: header("BEFORE · CARRIER FIX, STILL BOARD-LIKE"), left: 0, top: 0},
  {input: header("AFTER · EVIDENCE STAGED AS THE ACTOR"), left: 1456, top: 0},
  {input: oldBoard, left: 0, top: 64},
  {input: newBoard, left: 1456, top: 64},
]).png().toFile(comparePath);

const body = {
  contract: "A1OpeningCreatorPackagingLookMaster/v2",
  status: "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceManifest: {path: path.relative(root, sourceManifestPath), sha256: shaFile(sourceManifestPath)},
  research: {path: path.relative(root, researchPath), sha256: shaFile(researchPath), creatorVisualSkinCopied: false},
  styleThesis: "real-evidence-led quiet product editorial with local pixel identity, authored depth, and one semantic actor per beat",
  sequenceRules: {maximumConsecutiveSameCarrier: 2, typographyTakeovers: ["ED-01", "ED-08"], realEvidencePrimary: ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06"], presenterResets: ["ED-03", "ED-05", "ED-07"]},
  actualPixelReview: {
    status: "PASS_REVIEW_ONLY",
    reviewedAtActualPixels: true,
    verdictByShot: {
      "ED-01": "KEEP_PRESENTER_IDENTITY_TITLE",
      "ED-02": "KEEP_REAL_EVIDENCE_AS_PRIMARY_ACTOR",
      "ED-03": "KEEP_PRESENTER_EVIDENCE_SPLIT",
      "ED-04": "KEEP_REAL_ACTION_PUNCH_IN",
      "ED-05": "KEEP_EVIDENCE_PRESENTER_RESET",
      "ED-06": "KEEP_FULL_RESULT_STAGE",
      "ED-07": "KEEP_PRESENTER_JUDGMENT_RESET",
      "ED-08": "KEEP_AUTHORED_TYPOGRAPHY_TAKEOVER",
      "ED-09": "KEEP_TEXTLESS_SEMANTIC_OBJECT_WITH_LOCAL_TYPE"
    },
    remainingBoundary: "Opening nine-shot review passed as a static candidate; timing, motion smoothness, and whole-film consistency are not proven."
  },
  entries: outputEntries,
  board: {path: path.relative(root, boardPath), publicUrl: publicUrl(boardPath), sha256: shaFile(boardPath), width: 1440, height: 954},
  comparison: {path: path.relative(root, comparePath), publicUrl: publicUrl(comparePath), sha256: shaFile(comparePath), width: 2896, height: 1018},
  imagegenSource: {shotId: "ED-09", path: path.relative(root, ed09ImagegenSourcePath), publicUrl: publicUrl(ed09ImagegenSourcePath), sha256: shaFile(ed09ImagegenSourcePath), textless: true, generatedFormalText: false, reviewOnly: true},
  typographyBinding: {font: path.relative(root, fontPath), fontSha256: shaFile(fontPath), formalTextRenderedLocally: true, shots: ["ED-08", "ED-09"]},
  boundaries: {imagegenCallCount: 1, canonicalWorkspaceMutationPerformed: false, userVisualApproval: "NOT_APPROVED", layerExtractionPerformed: false, motionPerformed: false, resolveWritePerformed: false, finalRenderPerformed: false},
  generatedAt: new Date().toISOString(),
};
atomicJson(path.join(outputRoot, "manifest.json"), {...body, manifestSha256: sha(Buffer.from(JSON.stringify(body)))});
process.stdout.write(`${JSON.stringify({status: body.status, board: body.board, comparison: body.comparison, shotCount: body.entries.length, imagegenCallCount: 1, userVisualApproval: "NOT_APPROVED"}, null, 2)}\n`);
