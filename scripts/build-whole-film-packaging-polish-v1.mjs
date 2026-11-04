#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const canonicalRoot = path.join(generatedRoot, "whole-film-static-board-v1");
const canonicalManifestPath = path.join(canonicalRoot, "board-manifest.json");
const openingRoot = path.join(generatedRoot, "opening-creator-packaging-lookmaster-v2");
const outputRoot = path.join(generatedRoot, "whole-film-packaging-polish-v1");
const frameRoot = path.join(outputRoot, "frames");
const sourceRoot = path.join(outputRoot, "source");
const fontPath = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const ed17SourcePath = path.join(sourceRoot, "ED-17-textless.png");
const ed34SourcePath = path.join(sourceRoot, "ED-34-textless.png");
const styleBriefRoot = path.join(root, "work/whole-film-packaging-polish-v1/style-briefs");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const atomicJson = (file, value) => {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};

for (const file of [canonicalManifestPath, fontPath, ed17SourcePath, ed34SourcePath, path.join(openingRoot, "frames/ED-01.png"), path.join(openingRoot, "frames/ED-09.png"), path.join(styleBriefRoot, "ED-17.json"), path.join(styleBriefRoot, "ED-34.json")]) {
  if (!fs.existsSync(file)) throw new Error(`whole-film-packaging-polish-input-missing:${path.relative(root, file)}`);
}

const canonical = readJson(canonicalManifestPath);
if (canonical.current !== true || canonical.userVisualApproval !== "NOT_APPROVED" || canonical.packageItems?.length !== 12 || canonical.timelineItems?.length !== 34) {
  throw new Error("whole-film-packaging-polish-canonical-boundary-invalid");
}

fs.mkdirSync(frameRoot, {recursive: true});
const width = 1920;
const height = 1080;
const fontSha256 = fileSha256(fontPath);
const fontFace = `@font-face { font-family: A1FusionPixel; src: url('file://${fontPath}'); }`;
const formalNode = ({id, text, role, x, y, size, fill, tracking = 0}) => ({
  id,
  text,
  role,
  dominant: role === "identity-title" || role === "conclusion",
  fontAssetId: "type-pixel-correction",
  fontFamily: "A1 Fusion Pixel",
  fontSha256,
  renderer: "LOCAL_HASH_BOUND_FONT",
  editable: true,
  generated: false,
  geometry: {x, y, size, tracking},
  color: fill,
});

const renderSourceWithType = async ({source, output, nodes, decorations = ""}) => {
  const substrate = await sharp(source).resize(width, height, {fit: "cover"}).png().toBuffer();
  const textSvg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><style>${fontFace}</style></defs>
    ${decorations}
    ${nodes.map((node) => `<text x="${node.geometry.x}" y="${node.geometry.y}" fill="${node.color}" font-family="A1FusionPixel" font-size="${node.geometry.size}" letter-spacing="${node.geometry.tracking}">${escapeXml(node.text)}</text>`).join("\n")}
  </svg>`);
  await sharp(substrate).composite([{input: textSvg}]).png().toFile(output);
};

const replacementSpecs = {
  "ED-01": {
    source: path.join(openingRoot, "frames/ED-01.png"),
    copiedIntegratedFrame: true,
    textNodes: canonical.packageItems.find((item) => item.shotId === "ED-01")?.textNodes?.filter((node) => !String(node.id).includes("shadow")) || [],
    visualRole: "PRESENTER_IDENTITY_OPEN",
  },
  "ED-09": {
    source: path.join(openingRoot, "frames/ED-09.png"),
    copiedIntegratedFrame: true,
    textNodes: canonical.packageItems.find((item) => item.shotId === "ED-09")?.textNodes || [],
    visualRole: "LANGUAGE_PROCESSING_MACHINE",
  },
  "ED-17": {
    source: ed17SourcePath,
    textNodes: [
      formalNode({id: "ed17-a", text: "先给材料", role: "step-a", x: 76, y: 122, size: 62, fill: "#121619", tracking: 2}),
      formalNode({id: "ed17-b", text: "再找角度", role: "step-b", x: 720, y: 122, size: 62, fill: "#121619", tracking: 2}),
      formalNode({id: "ed17-c", text: "最后再让 AI 动笔", role: "step-c", x: 1270, y: 122, size: 48, fill: "#2452ff", tracking: 1}),
    ],
    decorations: '<rect x="76" y="146" width="228" height="8" fill="#2452ff"/><rect x="720" y="146" width="228" height="8" fill="#121619" opacity=".2"/><rect x="1270" y="146" width="378" height="8" fill="#2452ff" opacity=".65"/>',
    visualRole: "MATERIAL_ANGLE_DRAFT_MACHINE",
  },
  "ED-34": {
    source: ed34SourcePath,
    textNodes: [
      formalNode({id: "ed34-a", text: "真正写出", role: "conclusion", x: 92, y: 362, size: 112, fill: "#121619", tracking: 3}),
      formalNode({id: "ed34-b", text: "自己的风格", role: "conclusion", x: 88, y: 522, size: 138, fill: "#2452ff", tracking: 3}),
    ],
    decorations: '<rect x="92" y="574" width="512" height="10" fill="#121619" opacity=".18"/><rect x="92" y="574" width="196" height="10" fill="#2452ff"/>',
    visualRole: "AUTHORED_STYLE_FINALE",
  },
};

const replacementByShot = new Map();
for (const [shotId, spec] of Object.entries(replacementSpecs)) {
  const output = path.join(frameRoot, `${shotId}.png`);
  if (spec.copiedIntegratedFrame) {
    await sharp(spec.source).resize(width, height, {fit: "cover"}).png().toFile(output);
  } else {
    await renderSourceWithType({source: spec.source, output, nodes: spec.textNodes, decorations: spec.decorations});
  }
  replacementByShot.set(shotId, {
    shotId,
    path: path.relative(root, output),
    publicUrl: publicUrl(output),
    sha256: fileSha256(output),
    width,
    height,
    textNodes: spec.textNodes,
    visualRole: spec.visualRole,
    source: {path: path.relative(root, spec.source), sha256: fileSha256(spec.source), textless: !spec.copiedIntegratedFrame},
  });
}

const packageItems = canonical.packageItems.map((item) => {
  const replacement = replacementByShot.get(item.shotId);
  if (!replacement) return {...item};
  return {
    ...item,
    artifactPublicUrl: replacement.publicUrl,
    previewPublicUrl: replacement.publicUrl,
    artifactSha256: replacement.sha256,
    textNodes: replacement.textNodes,
    candidateId: `whole-film-packaging-polish-v1-${item.shotId.toLowerCase()}`,
    polishVisualRole: replacement.visualRole,
    styleLineage: {
      ...(item.styleLineage || {}),
      family: "pinterest-retro-pixel-v1",
      profile: "retro-pixel-editorial-v1",
      creatorPackagingStructureOnly: true,
      formalTextRenderedLocally: true,
      fontSha256,
      candidateOnly: true,
    },
  };
});

const packageByShot = new Map(packageItems.map((item) => [item.shotId, item]));
const timelineItems = canonical.timelineItems.map((item) => {
  const packageItem = packageByShot.get(item.shotId);
  if (!packageItem) return {...item, packageBoardItem: false};
  return {
    ...item,
    artifactSha256: packageItem.artifactSha256,
    previewPublicUrl: packageItem.previewPublicUrl || packageItem.artifactPublicUrl,
    packageBoardItem: true,
  };
});

const tileWidth = 480;
const imageHeight = 270;
const labelHeight = 54;
const renderBoard = async ({items, output, columns = 3}) => {
  const tiles = [];
  for (const [index, item] of items.entries()) {
    const imageFile = path.join(publicRoot, String(item.previewPublicUrl || item.artifactPublicUrl).replace(/^\//u, ""));
    if (!fs.existsSync(imageFile)) throw new Error(`whole-film-packaging-polish-board-input-missing:${item.shotId}`);
    const image = await sharp(imageFile).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const route = item.assemblyMode || item.routeLabel || item.route || "NO_PACKAGE";
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b0e10"/><rect width="5" height="100%" fill="${item.packageBoardItem === false || item.route === "NO_PACKAGE" ? "#4d565d" : "#315dff"}"/><text x="16" y="22" fill="#f2efe4" font-size="15" font-weight="700" font-family="monospace">${escapeXml(item.shotId)}</text><text x="16" y="42" fill="#8ea0ff" font-size="11" font-family="monospace">${escapeXml(route)}</text></svg>`);
    const tile = await sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 3, background: "#0b0e10"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
    tiles.push({input: tile, left: index % columns * tileWidth, top: Math.floor(index / columns) * (imageHeight + labelHeight)});
  }
  const rows = Math.ceil(items.length / columns);
  await sharp({create: {width: columns * tileWidth, height: rows * (imageHeight + labelHeight), channels: 3, background: "#0b0e10"}}).composite(tiles).png().toFile(output);
  return {path: path.relative(root, output), publicUrl: publicUrl(output), width: columns * tileWidth, height: rows * (imageHeight + labelHeight), sha256: fileSha256(output), itemCount: items.length};
};

const packageBoard = await renderBoard({items: packageItems, output: path.join(outputRoot, "whole-film-package-board.png")});
const timelineBoard = await renderBoard({items: timelineItems, output: path.join(outputRoot, "whole-film-timeline-board.png")});

const manifest = {
  contract: "A1WholeFilmPackagingPolish/v1",
  status: "PENDING_AGENT_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  sourceCanonicalBoard: {path: path.relative(root, canonicalManifestPath), sha256: fileSha256(canonicalManifestPath), packageBoardSha256: canonical.packageBoard.sha256, timelineBoardSha256: canonical.timelineBoard.sha256},
  repairedShots: [...replacementByShot.values()],
  preservedShotIds: packageItems.filter((item) => !replacementByShot.has(item.shotId)).map((item) => item.shotId),
  packageItems,
  timelineItems,
  packageBoard,
  timelineBoard,
  styleBriefs: ["ED-17", "ED-34"].map((shotId) => ({shotId, path: path.relative(root, path.join(styleBriefRoot, `${shotId}.json`)), sha256: fileSha256(path.join(styleBriefRoot, `${shotId}.json`))})),
  typographyBinding: {fontPath: path.relative(root, fontPath), fontSha256, formalTextRenderedLocally: true, generatedFormalText: false},
  agentActualPixelReview: {status: "PENDING", reviewedAtActualPixels: false, verdictByShot: {}},
  boundaries: {imagegenCallCount: 2, imagegenConcurrencyMaximum: 2, userVisualApproval: "NOT_APPROVED", canonicalWorkspaceMutationPerformed: false, layerExtractionPerformed: false, motionPerformed: false, resolveWritePerformed: false, finalRenderPerformed: false},
  userVisualApproval: "NOT_APPROVED",
  generatedAt: new Date().toISOString(),
};
atomicJson(path.join(outputRoot, "manifest.json"), manifest);
console.log(JSON.stringify({status: manifest.status, repairedShots: manifest.repairedShots.map((item) => ({shotId: item.shotId, sha256: item.sha256})), packageBoard, timelineBoard}, null, 2));
