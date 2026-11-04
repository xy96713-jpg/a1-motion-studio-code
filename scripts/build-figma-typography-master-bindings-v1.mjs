import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as fontkit from "fontkit";
import sharp from "sharp";
import {createFigmaTypographyMasterBinding} from "../apps/studio-next/src/lib/a1-figma-typography-master-binding-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "work/typography-director-v2");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/typography-director-v2");
const source = JSON.parse(fs.readFileSync(path.join(workDir, "figma-master-source.json"), "utf8"));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha = (file) => sha(fs.readFileSync(file));
const writeJson = (dir, name, value) => { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8"); };

function compileStaticMasterSvg(master) {
  if (!Array.isArray(master.semanticSvgFiles) || master.semanticSvgFiles.length !== master.glyphBounds.length) throw new Error(`figma-master-semantic-svg-count-invalid:${master.masterFamily}`);
  const semanticSvgSha256 = {};
  const compiledSemanticFiles = [];
  const images = master.semanticSvgFiles.map((relativeFile, index) => {
    const file = path.join(root, relativeFile);
    if (!fs.existsSync(file)) throw new Error(`figma-master-semantic-svg-missing:${master.masterFamily}:${index}`);
    const sourceContent = fs.readFileSync(file, "utf8");
    const sanitizedContent = sourceContent
      .replace(/<rect\b[^>]*\/>/gu, "")
      .replace(/<rect\b[^>]*>[\s\S]*?<\/rect>/gu, "");
    const semanticOutputDir = path.join(workDir, "compiled-semantic-svg", master.masterFamily);
    fs.mkdirSync(semanticOutputDir, {recursive: true});
    const semanticOutput = path.join(semanticOutputDir, `${master.glyphNodeIds[index].replace(":", "-")}.svg`);
    fs.writeFileSync(semanticOutput, sanitizedContent, "utf8");
    compiledSemanticFiles.push(path.relative(root, semanticOutput));
    semanticSvgSha256[master.glyphNodeIds[index]] = sha(sanitizedContent);
    const [x, y, width, height] = master.glyphBounds[index];
    const encoded = Buffer.from(sanitizedContent).toString("base64");
    return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="data:image/svg+xml;base64,${encoded}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" data-a1-output-mode="TRANSPARENT_GLYPH_ASSET">${images}</svg>`;
  const outputDir = path.join(workDir, "compiled-master-svg");
  fs.mkdirSync(outputDir, {recursive: true});
  const output = path.join(outputDir, `${master.masterFamily}.svg`);
  fs.writeFileSync(output, svg, "utf8");
  return {output, semanticSvgSha256, compiledSemanticFiles};
}

const bindings = [];
const scaleReviews = [];
for (const master of source.masters) {
  const fontPath = path.join(root, master.fontFile);
  if (!fs.existsSync(fontPath)) throw new Error(`figma-master-source-file-missing:${master.masterFamily}`);
  const compiled = compileStaticMasterSvg(master);
  const svgPath = compiled.output;
  const font = fontkit.openSync(fontPath);
  const run = font.layout(master.exactCopy);
  const glyphIds = run.glyphs.map((glyph) => glyph.id);
  if (!glyphIds.length || glyphIds.some((id) => !Number.isInteger(id))) throw new Error(`figma-master-glyph-id-invalid:${master.masterFamily}`);
  const binding = createFigmaTypographyMasterBinding({
    masterFamily: master.masterFamily,
    figmaFileKey: source.figmaFileKey,
    pageNodeId: source.pageNodeId,
    frameNodeId: master.frameNodeId,
    semanticGroupNodeIds: master.semanticGroupNodeIds,
    fontSha256: fileSha(fontPath),
    glyphIds,
    svgSha256: fileSha(svgPath),
    actualVisibleBounds: master.actualVisibleBounds,
    keyPoses: source.keyPoses,
    approvalVersion: source.approvalVersion,
    approvalStatus: source.approvalStatus,
    typographyOnlyAudit: master.typographyOnlyAudit,
  });
  bindings.push({...binding, exactCopy: master.exactCopy, fontFile: master.fontFile, svgFile: path.relative(root, svgPath), semanticSvgFiles: compiled.compiledSemanticFiles, sourceSemanticSvgFiles: master.semanticSvgFiles, semanticSvgSha256: compiled.semanticSvgSha256, glyphNodeIds: master.glyphNodeIds, minimumSemanticGapPx: master.minimumSemanticGapPx, ordinaryOverlapCount: master.ordinaryOverlapCount, presenterDepthReviewRequired: master.presenterDepthReviewRequired === true});
  for (const scale of [1, 0.5, 0.25]) {
    const width = Math.round(1920 * scale);
    const height = Math.round(1080 * scale);
    const outputDir = path.join(workDir, "figma-scale-review", master.masterFamily);
    fs.mkdirSync(outputDir, {recursive: true});
    const output = path.join(outputDir, `${width}x${height}.png`);
    await sharp(svgPath, {density: 144}).resize(width, height, {fit: "fill"}).png().toFile(output);
    const metadata = await sharp(output).metadata();
    scaleReviews.push({masterFamily: master.masterFamily, scale, width, height, output: path.relative(root, output), outputSha256: fileSha(output), renderPass: metadata.width === width && metadata.height === height, scaledSemanticGapPx: Number((master.minimumSemanticGapPx * scale).toFixed(3)), scaledPrimaryInkHeightPx: Number((master.actualVisibleBounds[3] * scale).toFixed(3))});
  }
}

const failures = [];
for (const item of bindings) {
  if (item.minimumSemanticGapPx < 48) failures.push(`${item.masterFamily}:semantic-gap`);
  if (item.ordinaryOverlapCount !== 0) failures.push(`${item.masterFamily}:ordinary-overlap`);
  if (item.typographyOnlyAudit?.status !== "PASS") failures.push(`${item.masterFamily}:typography-only-audit`);
}
for (const review of scaleReviews) {
  if (!review.renderPass) failures.push(`${review.masterFamily}:${review.width}x${review.height}:render`);
  if (review.scale === 0.25 && review.scaledPrimaryInkHeightPx < 18) failures.push(`${review.masterFamily}:270p-primary-ink`);
}
const library = {
  contract: "A1FigmaTypographyMasterLibrary/v1",
  status: failures.length ? "BLOCK" : "READY_FOR_USER_VISUAL_APPROVAL",
  figmaFileKey: source.figmaFileKey,
  figmaUrl: `https://www.figma.com/design/${source.figmaFileKey}?node-id=${source.pageNodeId.replace(":", "-")}`,
  pageNodeId: source.pageNodeId,
  pageName: source.pageName,
  approvalStatus: source.approvalStatus,
  approvalVersion: source.approvalVersion,
  bindings,
  scaleReviews,
  failures,
  formalRenderSource: source.formalRenderSource,
  figmaVideoProductionSourceAllowed: source.figmaVideoProductionSourceAllowed,
  outputMode: "TRANSPARENT_GLYPH_ASSET",
  authoredBackgroundAllowed: false,
  neutralPreviewPlate: "REVIEW_TOOL_ONLY_NOT_EXPORTED",
  criticMayApproveNewMaster: false,
  productionAdmission: false,
};
library.librarySha256 = sha(JSON.stringify(library));
writeJson(workDir, "figma-typography-master-library-v1.json", library);
writeJson(publicDir, "figma-typography-master-library-v1.json", library);
console.log(JSON.stringify({status: library.status, bindingCount: bindings.length, scaleReviewCount: scaleReviews.length, failures, librarySha256: library.librarySha256}, null, 2));
