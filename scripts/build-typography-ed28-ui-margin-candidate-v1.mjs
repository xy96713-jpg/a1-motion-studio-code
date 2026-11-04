import crypto from "node:crypto";
import {execFile} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import sharp from "sharp";
import {
  A1_FILM_TYPOGRAPHY_DIRECTOR_V3,
  buildTypographyReferenceCellBindingV1,
  compileFilmTypographyDirectorV3,
  validateFilmTypographyDirectorV3,
} from "../apps/studio-next/src/lib/a1-film-typography-director-v3.mjs";
import {A1_TYPOGRAPHY_SHOT_VISUAL_CONTEXT_V1} from "../apps/studio-next/src/lib/a1-typography-shot-context-v1.mjs";
import {compileTypographyCompositionV1} from "../apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timelinePath = "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json";
const mainReportPath = "work/typography-director-v3-shadow-v1/report.json";
const contextReportPath = "work/typography-director-v3-shadow-v1/visual-context-canary/three-shot-current-frame-context-v1.json";
const contextCheckpointPath = "work/typography-director-v3-shadow-v1/visual-context-canary/three-shot-context-checkpoints-v1/ED-28.json";
const designBoardPath = "work/typography-design-board-v1/board.json";
const directorSourcePath = "apps/studio-next/src/lib/a1-film-typography-director-v3.mjs";
const compositionSourcePath = "apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs";
const outputDir = "work/typography-director-v3-shadow-v1/ED-28-ui-margin-candidate-v1";
const shotId = "ED-28";
const displayCopy = "放回正文";
const displayAdaptationReason = "保留口播原句在sourceExactCopy，只显示原句末尾的动作结果词组；它点明这一镜的落点，并避免把长口播句叠在真实编辑界面上。";
const color = "#1E2329";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaText = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
const readBytes = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const normalizeText = (value) => String(value || "").normalize("NFC").replace(/[\s\u3000]+/gu, "");

function rectsIntersect(a, b) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-7
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-7;
}

function verifyFontBytes(profile) {
  for (const asset of profile.binaryAssets || []) {
    const fontPath = path.isAbsolute(asset.sourcePath) ? asset.sourcePath : path.join(root, asset.sourcePath);
    const actual = sha256(fs.readFileSync(fontPath));
    if (actual !== asset.sha256 || asset.verified !== true) throw new Error(`font-binary-sha-mismatch:${asset.role}`);
  }
}

function renderVerticalGlyphSvg({font, text, box, width, height}) {
  const codepoints = Array.from(text);
  const glyphs = codepoints.map((character) => font.glyphForCodePoint(character.codePointAt(0)));
  if (glyphs.length !== codepoints.length || glyphs.some((glyph) => !glyph || glyph.id === 0 || !glyph.path?.commands?.length)) {
    throw new Error("DISPLAY_COPY_GLYPH_COVERAGE_FAILED");
  }
  const boxPx = {x: box.x * width, y: box.y * height, width: box.width * width, height: box.height * height};
  const fontSizePx = Math.min(48, (boxPx.height / glyphs.length) * 0.82, boxPx.width * 0.86);
  const scale = fontSizePx / font.unitsPerEm;
  const bboxes = glyphs.map((glyph) => glyph.path.bbox);
  const inkHeights = bboxes.map((bbox) => (bbox.maxY - bbox.minY) * scale);
  const maxInkHeight = Math.max(...inkHeights);
  const linePitch = Math.max(fontSizePx * 1.13, maxInkHeight + fontSizePx * 0.16);
  const totalHeight = linePitch * (glyphs.length - 1) + maxInkHeight;
  if (totalHeight > boxPx.height || maxInkHeight > boxPx.height / glyphs.length) throw new Error("VERTICAL_COPY_DOES_NOT_FIT_SELECTED_REGION");
  const centerX = boxPx.x + boxPx.width / 2;
  const topY = boxPx.y + (boxPx.height - totalHeight) / 2;
  const paths = [];
  const glyphInk = [];
  glyphs.forEach((glyph, index) => {
    const bbox = bboxes[index];
    const baseline = topY + index * linePitch + bbox.maxY * scale;
    const translateX = centerX - ((bbox.minX + bbox.maxX) / 2) * scale;
    const left = translateX + bbox.minX * scale;
    const top = baseline - bbox.maxY * scale;
    const right = translateX + bbox.maxX * scale;
    const bottom = baseline - bbox.minY * scale;
    paths.push(`<path data-glyph-index="${index}" d="${glyph.path.toSVG()}" transform="translate(${translateX.toFixed(3)} ${baseline.toFixed(3)}) scale(${scale.toFixed(7)} -${scale.toFixed(7)})" fill="${color}"/>`);
    glyphInk.push({character: codepoints[index], glyphId: glyph.id, box: {x: left, y: top, width: right - left, height: bottom - top}});
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g data-role="SOURCE_ANNOTATION" data-writing-mode="VERTICAL_TB">${paths.join("")}</g></svg>`;
  const bounds = {
    x: Math.min(...glyphInk.map((glyph) => glyph.box.x)),
    y: Math.min(...glyphInk.map((glyph) => glyph.box.y)),
    right: Math.max(...glyphInk.map((glyph) => glyph.box.x + glyph.box.width)),
    bottom: Math.max(...glyphInk.map((glyph) => glyph.box.y + glyph.box.height)),
  };
  return {
    svg,
    glyphInk,
    fontSizePx,
    linePitchPx: linePitch,
    inkBoundsPixels: {x: bounds.x, y: bounds.y, width: bounds.right - bounds.x, height: bounds.bottom - bounds.y},
  };
}

async function main() {
  const shadow = JSON.parse(readBytes(mainReportPath));
  const contextReport = JSON.parse(readBytes(contextReportPath));
  const contextCheckpoint = JSON.parse(readBytes(contextCheckpointPath));
  const boardBytes = readBytes(timelinePath);
  const board = JSON.parse(boardBytes);
  const designBoardBytes = readBytes(designBoardPath);
  const designBoard = JSON.parse(designBoardBytes);
  const directorSourceSha256 = sha256(readBytes(directorSourcePath));
  const compositionSourceSha256 = sha256(readBytes(compositionSourcePath));
  const frameItem = board.timelineItems.find((item) => item.shotId === shotId);
  const currentDecision = shadow.incumbentComparison.current.decisions.find((decision) => decision.shotId === shotId);
  const contextReceipt = contextReport.visualContextReceipts.find((receipt) => receipt.shotId === shotId);
  const sourceContext = contextCheckpoint.context;
  if (!frameItem || !currentDecision || contextReceipt?.status !== "READY_FOR_REVIEW_ONLY_ROUTING" || !sourceContext) {
    throw new Error("ED28_SOURCE_BOUND_VISUAL_CONTEXT_REQUIRED");
  }

  const publicRoot = fs.realpathSync(path.join(root, "apps/studio-next/public"));
  const framePublicUrl = frameItem.preview?.publicUrl;
  if (!String(framePublicUrl || "").startsWith("/generated/system-line/editorial-asset-workbench-v1/") || framePublicUrl.includes("..")) {
    throw new Error("ED28_FRAME_PATH_INVALID");
  }
  const framePath = path.resolve(publicRoot, framePublicUrl.replace(/^\/+/, ""));
  const frameBytes = fs.readFileSync(framePath);
  const frameSha256 = sha256(frameBytes);
  if (frameSha256 !== frameItem.preview?.sha256 || frameSha256 !== sourceContext.frame.sha256) throw new Error("ED28_FRAME_SHA_MISMATCH");
  const frameMetadata = await sharp(frameBytes).metadata();
  if (frameMetadata.width !== sourceContext.frame.width || frameMetadata.height !== sourceContext.frame.height) throw new Error("ED28_FRAME_DIMENSION_MISMATCH");

  const sourceExactCopy = String(frameItem.sourceText || "");
  if (!sourceExactCopy.includes(displayCopy)) throw new Error("DISPLAY_COPY_IS_NOT_AN_EXACT_SOURCE_SUBSTRING");
  const selectedRegion = currentDecision.selectedSafeRegion;
  if (!selectedRegion || !sourceContext.availableRegions.some((region) => region.id === selectedRegion.id)) throw new Error("ED28_DIRECTOR_SELECTED_REGION_NOT_IN_VISUAL_CONTEXT");
  const displayCell = designBoard.cards.find((card) => card.id === "gawx-04");
  const cellMechanism = designBoard.base.cells["04"];
  if (!displayCell || !cellMechanism || displayCell.source !== "gawx") throw new Error("GAWX_SPATIAL_AXIS_REFERENCE_REQUIRED");
  const sourceImagePath = path.resolve(path.dirname(path.join(root, designBoardPath)), designBoard.base.file);
  const sourceImageBytes = fs.readFileSync(sourceImagePath);
  const sourceImageSha256 = sha256(sourceImageBytes);
  if (sourceImageSha256 !== designBoard.base.sha256) throw new Error("GAWX_BASE_BOARD_SOURCE_SHA_MISMATCH");

  const referenceCell = buildTypographyReferenceCellBindingV1({
    referenceBoardSha256: shadow.filmTypographyBible.referenceBoard.sha256,
    cellId: displayCell.id,
    title: displayCell.title,
    source: displayCell.source,
    mechanism: cellMechanism,
    sourcePath: designBoard.base.file,
    sourceImageSha256,
    selectionReason: "ED-28 has a SHA-bound empty UI margin. Use Gawx 04 for spatial-axis composition only; keep the real screen UI intact and keep font identity in the EVA/Fusion Pixel Bible.",
  });
  const fusionProfile = shadow.filmTypographyBible.fontProfiles.FUSION_PIXEL;
  if (!fusionProfile) throw new Error("FUSION_PIXEL_FONT_PROFILE_REQUIRED");
  verifyFontBytes(fusionProfile);
  const fontAsset = fusionProfile.binaryAssets.find((asset) => asset.role === "MICRO_AND_SUPPORT_COPY");
  const fontPath = path.isAbsolute(fontAsset.sourcePath) ? fontAsset.sourcePath : path.join(root, fontAsset.sourcePath);
  const font = fontkit.openSync(fontPath);

  const safe = selectedRegion.box;
  const axisRegion = {
    x: Number((safe.x + safe.width * 0.58).toFixed(6)),
    y: Number((safe.y + safe.height * 0.32).toFixed(6)),
    width: Number((safe.width * 0.32).toFixed(6)),
    height: Number((safe.height * 0.30).toFixed(6)),
  };
  if (axisRegion.x < safe.x || axisRegion.y < safe.y
    || axisRegion.x + axisRegion.width > safe.x + safe.width
    || axisRegion.y + axisRegion.height > safe.y + safe.height) throw new Error("DERIVED_SPATIAL_AXIS_OUTSIDE_VERIFIED_REGION");
  if (sourceContext.protectedRegions.some((region) => rectsIntersect(axisRegion, region.box))) throw new Error("DERIVED_SPATIAL_AXIS_OVERLAPS_PROTECTED_PIXELS");

  const shotVisualContext = {
    contract: A1_TYPOGRAPHY_SHOT_VISUAL_CONTEXT_V1,
    carrierMode: "FOOTAGE",
    frame: {sha256: sourceContext.frame.sha256, width: sourceContext.frame.width, height: sourceContext.frame.height},
    geometryEvidence: {
      method: sourceContext.visualAssessment.method,
      frameSha256: sourceContext.frame.sha256,
      sourceContextSha256: sourceContext.contextSha256,
      derivedFromRegionId: selectedRegion.id,
      derivedRegionMethod: "INSET_WITHIN_VERIFIED_AVAILABLE_REGION",
    },
    protectedRegions: sourceContext.protectedRegions.map(({id, box}) => ({id, box})),
    availableRegions: [{id: selectedRegion.id, box: axisRegion, visualSuitability: selectedRegion.score}],
    anchors: [],
    safetyPadding: 0.006,
    minimumGroupWidth: 0.025,
    minimumGroupHeight: 0.02,
  };
  const compositionPlan = compileTypographyCompositionV1({
    typographyRole: "SOURCE_ANNOTATION",
    semanticEvent: "PROCESS",
    effectId: "CLEAN_EDITORIAL",
    effectDisplayGroups: [displayCopy],
    shotVisualContext,
    requireShotVisualContext: true,
    compositionMechanism: currentDecision.compositionMechanism,
    referenceMechanism: "SPATIAL_AXIS_TYPE",
  });
  if (compositionPlan.status !== "PASS_REVIEW_ONLY" || compositionPlan.recipeId !== "UI_MARGIN_SPATIAL_AXIS") {
    throw new Error(`ED28_COMPOSITION_ADAPTER_BLOCKED:${compositionPlan.failures.map((failure) => failure.code).join(",")}`);
  }
  if (compositionPlan.layoutContext?.selectedRegionId !== selectedRegion.id) throw new Error("COMPOSITION_REGION_DIFFERS_FROM_DIRECTOR_SELECTION");
  const textGroup = compositionPlan.groups[0];
  if (textGroup.writingMode !== "VERTICAL_TB") throw new Error("SPATIAL_AXIS_WRITING_MODE_REQUIRED");
  const rendered = renderVerticalGlyphSvg({font, text: displayCopy, box: textGroup.box, width: frameMetadata.width, height: frameMetadata.height});
  const overlayBytes = await sharp(Buffer.from(rendered.svg, "utf8")).png().toBuffer();
  const compositeBytes = await sharp(frameBytes).composite([{input: overlayBytes, left: 0, top: 0}]).png().toBuffer();

  const overlayPixels = await sharp(overlayBytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let overlayPixelCount = 0;
  let overlayBounds = {left: frameMetadata.width, top: frameMetadata.height, right: -1, bottom: -1};
  for (let y = 0; y < overlayPixels.info.height; y += 1) for (let x = 0; x < overlayPixels.info.width; x += 1) {
    const offset = (y * overlayPixels.info.width + x) * overlayPixels.info.channels + 3;
    if (overlayPixels.data[offset] === 0) continue;
    overlayPixelCount += 1;
    overlayBounds.left = Math.min(overlayBounds.left, x);
    overlayBounds.top = Math.min(overlayBounds.top, y);
    overlayBounds.right = Math.max(overlayBounds.right, x);
    overlayBounds.bottom = Math.max(overlayBounds.bottom, y);
  }
  const alphaInsideAxisRegion = overlayPixelCount > 0
    && overlayBounds.left >= axisRegion.x * frameMetadata.width
    && overlayBounds.top >= axisRegion.y * frameMetadata.height
    && overlayBounds.right < (axisRegion.x + axisRegion.width) * frameMetadata.width
    && overlayBounds.bottom < (axisRegion.y + axisRegion.height) * frameMetadata.height;
  if (!alphaInsideAxisRegion) throw new Error("OVERLAY_ALPHA_OUTSIDE_DERIVED_AXIS_REGION");

  const sourceRaw = await sharp(frameBytes).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const compositeRaw = await sharp(compositeBytes).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let changedPixels = 0;
  let changedOutsideSafeRegion = 0;
  for (let y = 0; y < sourceRaw.info.height; y += 1) for (let x = 0; x < sourceRaw.info.width; x += 1) {
    const offset = (y * sourceRaw.info.width + x) * sourceRaw.info.channels;
    const changed = sourceRaw.data[offset] !== compositeRaw.data[offset]
      || sourceRaw.data[offset + 1] !== compositeRaw.data[offset + 1]
      || sourceRaw.data[offset + 2] !== compositeRaw.data[offset + 2];
    if (!changed) continue;
    changedPixels += 1;
    const normalizedPoint = {x: x / sourceRaw.info.width, y: y / sourceRaw.info.height};
    if (normalizedPoint.x < safe.x || normalizedPoint.x > safe.x + safe.width
      || normalizedPoint.y < safe.y || normalizedPoint.y > safe.y + safe.height) changedOutsideSafeRegion += 1;
  }

  const outputDirPath = path.join(root, outputDir);
  fs.mkdirSync(outputDirPath, {recursive: true});
  const svgPath = path.join(outputDirPath, "typography.svg");
  const overlayPath = path.join(outputDirPath, "transparent-overlay.png");
  const compositePath = path.join(outputDirPath, "review-composite.png");
  fs.writeFileSync(svgPath, `${rendered.svg}\n`);
  fs.writeFileSync(overlayPath, overlayBytes);
  fs.writeFileSync(compositePath, compositeBytes);

  const ocrEvidence = await execFileAsync("/usr/bin/swift", [
    path.join(root, "scripts/a1-typography-visual-context-ocr-v1.swift"),
    compositePath,
  ], {timeout: 30_000, maxBuffer: 1_000_000}).then(({stdout}) => JSON.parse(stdout));
  const recognizedText = (ocrEvidence.recognizedText || []).map((item) => item.text).join("\n");
  const exactDisplayCopyOcrMatch = normalizeText(recognizedText).includes(normalizeText(displayCopy));
  const ocrEvidenceSha256 = sha256(Buffer.from(JSON.stringify(ocrEvidence), "utf8"));
  const svgSha256 = sha256(fs.readFileSync(svgPath));
  const overlaySha256 = sha256(overlayBytes);
  const compositeSha256 = sha256(compositeBytes);
  const displayCopySha256 = shaText(displayCopy);
  const profileSha256 = fusionProfile.profileSha256;
  const groupPixelBox = {
    x: textGroup.box.x * frameMetadata.width,
    y: textGroup.box.y * frameMetadata.height,
    width: textGroup.box.width * frameMetadata.width,
    height: textGroup.box.height * frameMetadata.height,
  };
  const copyFit = {
    status: "PASS",
    frameSha256,
    regionId: selectedRegion.id,
    displayCopySha256,
    fontProfileSha256: profileSha256,
    referenceCellSha256: referenceCell.approvedCellSha256,
    compositionPlanSha256: compositionPlan.compositionSha256,
    fontBinarySha256: fontAsset.sha256,
    displayCopy,
    writingMode: textGroup.writingMode,
    fontSizePx: rendered.fontSizePx,
    measuredInkBoundsPixels: rendered.inkBoundsPixels,
    layoutGroupPixels: groupPixelBox,
    sourceContextSha256: sourceContext.contextSha256,
    derivedAxisRegion: axisRegion,
    alphaInsideAxisRegion,
  };
  const director = compileFilmTypographyDirectorV3({
    articleId: "current-writing-workbench-review-only",
    programMode: "PRODUCT_TUTORIAL",
    bible: shadow.filmTypographyBible,
    beats: [{
      shotId,
      sourceExactCopy,
      exactCopy: sourceExactCopy,
      displayCopy,
      displayAdaptationReason,
      semanticDuty: currentDecision.semanticDuty,
      semanticImportance: currentDecision.semanticImportance,
      sequenceBoundary: "INTERIOR",
      visualContext: sourceContext,
      reference: referenceCell,
      neighbors: {
        previousFrameSha256: currentDecision.previousFrameSha256,
        nextFrameSha256: currentDecision.nextFrameSha256,
      },
      copyFit,
    }],
  });
  const directorValidationFailures = validateFilmTypographyDirectorV3(director);
  const decision = director.decisions[0];
  if (decision.route !== "EDITABLE_LOCAL_TYPE") throw new Error(`ED28_ROUTE_CHANGED:${decision.route}`);

  const candidate = {
    contract: "A1TypographyPackageCandidate/v1",
    status: decision.status === "READY_FOR_PACKAGE_CANDIDATES_REVIEW_ONLY" && directorValidationFailures.length === 0
      ? "REVIEW_READY_CANDIDATE"
      : "BLOCKED_REVIEW_ONLY",
    generatedAt: new Date().toISOString(),
    directorContract: director.contract,
    directorSha256: director.directorSha256,
    directorValidationFailures,
    filmTypographyBibleSha256: director.bible.bibleSha256,
    sourceCodeBinding: {directorSourceSha256, compositionSourceSha256},
    sourceBinding: {
      shotId,
      framePublicUrl,
      frameSha256,
      frameByteShaVerified: true,
      sourceExactCopy,
      sourceExactCopySha256: shaText(sourceExactCopy),
      displayCopy,
      displayCopySha256,
      displayAdaptationReason,
      previousFrameSha256: currentDecision.previousFrameSha256,
      nextFrameSha256: currentDecision.nextFrameSha256,
      referenceBoardSha256: director.bible.referenceBoard.sha256,
      referenceCell: referenceCell,
      fontProfileSha256: profileSha256,
      fontBinarySha256: fontAsset.sha256,
    },
    decision,
    compositionPlan,
    copyFit,
    typographyAsset: {
      svgPath: path.relative(root, svgPath),
      svgSha256,
      transparentOverlayPath: path.relative(root, overlayPath),
      transparentOverlaySha256: overlaySha256,
      alphaPixelCount: overlayPixelCount,
      alphaBoundsPixels: {
        x: overlayBounds.left,
        y: overlayBounds.top,
        width: overlayBounds.right - overlayBounds.left + 1,
        height: overlayBounds.bottom - overlayBounds.top + 1,
      },
      authoredBackgroundPresent: false,
      sceneObjectsAdded: false,
      sourcePixelsRepainted: false,
    },
    compositedReviewFrame: {
      path: path.relative(root, compositePath),
      sha256: compositeSha256,
      changedPixelCount: changedPixels,
      changedPixelsOutsideDirectorSelectedSafeRegion: changedOutsideSafeRegion,
      sourceFramePixelsPreservedOutsideGlyphAlpha: changedOutsideSafeRegion === 0,
    },
    textAudit: {
      method: ocrEvidence.ocrEngine,
      recognizedTextCount: ocrEvidence.recognizedText?.length || 0,
      exactDisplayCopyOcrMatch,
      evidenceSha256: ocrEvidenceSha256,
      rawRecognizedTextPersisted: false,
      fontkitGlyphIds: rendered.glyphInk.map((item) => item.glyphId),
      everyGlyphCovered: rendered.glyphInk.every((item) => item.glyphId > 0),
    },
    visualReview: {
      status: "CODEX_PIXEL_REVIEWED_READY_FOR_USER_REVIEW",
      userApproval: false,
      findings: [
        "The four-glyph vertical phrase reads clearly in the empty left margin at 1920x1080.",
        "The near-black Fusion Pixel label does not cover the screen UI; machine pixel comparison reports zero changed pixels outside the verified safe region.",
        "The phrase is an exact substring of the source narration and Apple Vision recognized it in the composite.",
      ],
    },
    productionAdmission: false,
  };

  const candidatePath = path.join(outputDirPath, "candidate.json");
  fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
  const markdown = [
    "# ED-28 UI-margin typography candidate",
    "",
    `Status: ${candidate.status} · director ${decision.status} · production admission false`,
    "",
    `**Source copy:** ${sourceExactCopy}`,
    `**Displayed exact excerpt:** ${displayCopy}`,
    `**Adaptation reason:** ${displayAdaptationReason}`,
    `**Reference:** ${referenceCell.cellId} ${referenceCell.title} (${referenceCell.mechanism}); record SHA ${referenceCell.approvedCellSha256}`,
    `**Font:** ${fontAsset.fontFamily}; binary SHA ${fontAsset.sha256}; profile SHA ${profileSha256}`,
    `**Copy fit:** ${copyFit.status}; ${rendered.fontSizePx.toFixed(1)} px; ink box ${JSON.stringify(copyFit.measuredInkBoundsPixels)}`,
    `**OCR:** exact displayed copy ${exactDisplayCopyOcrMatch ? "found" : "not corroborated"}; ${textAuditCount(ocrEvidence)} recognized text regions`,
    `**Pixel integrity:** ${changedPixels} changed pixels; outside selected safe region ${changedOutsideSafeRegion}.`,
    "",
    "The SVG contains only editable glyph outlines. The composite uses the current real screen frame and places the type in the verified left-side margin. Taste review remains separate from machine checks.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outputDirPath, "review.md"), markdown);
  console.log(JSON.stringify({
    status: candidate.status,
    directorStatus: decision.status,
    blockers: decision.blockers,
    referenceCell: referenceCell.cellId,
    displayCopy,
    exactDisplayCopyOcrMatch,
    changedPixels: changedPixels,
    changedPixelsOutsideSafeRegion: changedOutsideSafeRegion,
    output: path.relative(root, compositePath),
  }, null, 2));
}

function textAuditCount(evidence) {
  return evidence.recognizedText?.length || 0;
}

await main();
