#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertRetroPixelEditorialStyleBrief, auditRetroPixelStyleBriefs, compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const boardRoot = "default-design-asset-library-v1/whole-film-static-board-v1";
const publicPath = (url) => path.join(appRoot, "public", String(url).replace(/^\//u, ""));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const fontPath = path.join(phaseRoot, "font-cache/fusion-pixel.ttf");
const font = fontkit.openSync(fontPath);

function textPath(text, {x, y, size, tracking = 0}) {
  let cursor = x; const scale = size / font.unitsPerEm; const parts = [];
  for (const character of [...text]) {
    const run = font.layout(character); const glyph = run.glyphs[0]; const position = run.positions[0];
    if (!glyph || glyph.id === 0) continue;
    parts.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + tracking;
  }
  return parts.join("");
}

function exactHeadline(sourceText) {
  const normalized = String(sourceText || "").replace(/\s+/gu, " ").trim();
  const clause = normalized.split(/[，。！？；：]/u).find((part) => /[\u4e00-\u9fff]/u.test(part)) || normalized;
  return [...clause].slice(0, 15).join("");
}

function lineBreak(text, maximumUnits = 8) {
  const tokens = String(text).match(/[A-Za-z0-9]+|[\u4e00-\u9fff]|[^\s]/gu) || [];
  const lines = []; let line = ""; let units = 0;
  for (const token of tokens) {
    const tokenUnits = /^[A-Za-z0-9]+$/u.test(token) ? Math.max(2, token.length) : 1;
    if (line && units + tokenUnits > maximumUnits) { lines.push(line); line = token; units = tokenUnits; }
    else { line += token; units += tokenUnits; }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

async function normalizeBase(file) {
  if (!fs.existsSync(file)) throw new Error(`default-library-static-board-source-missing:${file}`);
  return sharp(file).resize(1920, 1080, {fit: "cover", position: "centre"}).png().toBuffer();
}

async function isDark(pixels) {
  const stats = await sharp(pixels).resize(64, 36).removeAlpha().stats();
  return stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3 < 128;
}

async function actorLayer(actor, placement) {
  const pixels = await sharp(publicPath(actor.publicUrl)).resize(placement.width, placement.height, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
  return {input: pixels, left: placement.left, top: placement.top};
}

async function maskedForeground(basePixels, alphaFile) {
  const {data, info} = await sharp(basePixels).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const alpha = await sharp(alphaFile).resize(info.width, info.height, {fit: "fill"}).extractChannel(3).raw().toBuffer();
  for (let index = 0; index < info.width * info.height; index += 1) data[index * 4 + 3] = alpha[index];
  return sharp(data, {raw: info}).png({compressionLevel: 9}).toBuffer();
}

const elementRoleByKit = {
  "revision-kit": "article-element-crossed-strokes-imagegen-v1",
  "signal-transition-kit": "article-element-halftone-tear-imagegen-v1",
  "physical-editorial-kit": "article-element-torn-paper-strip-imagegen-v1",
  "process-connector-kit": "article-element-charcoal-sorting-loop-imagegen-v1",
};
const elementRoleByShot = new Map([
  ["ED-01", "article-element-torn-paper-strip-imagegen-v1"],
  ["ED-07", "article-element-halftone-tear-imagegen-v1"],
  ["ED-08", "article-element-crossed-strokes-imagegen-v1"],
  ["ED-09", "article-element-pencil-circle-imagegen-v1"],
  ["ED-10", "article-element-crossed-strokes-imagegen-v1"],
  ["ED-11", "article-element-pencil-circle-imagegen-v1"],
  ["ED-13", "article-element-torn-note-strip-imagegen-v1"],
  ["ED-15", "article-element-torn-note-strip-imagegen-v1"],
  ["ED-16", "article-element-halftone-tear-imagegen-v1"],
  ["ED-17", "article-element-charcoal-sorting-loop-imagegen-v1"],
  ["ED-18", "article-element-torn-paper-corner-imagegen-v1"],
  ["ED-32", "article-element-crossed-strokes-imagegen-v1"],
  ["ED-33", "article-element-folded-paper-imagegen-v1"],
  ["ED-34", "article-element-pencil-circle-imagegen-v1"],
]);

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  const mapping = authority.storyboardDefaultLibraryBinding;
  if (mapping?.assignments?.length !== 34 || authority.imagegenBackgroundContinuation?.review?.candidateCount !== 24) throw new Error("default-library-static-board-current-24-background-mapping-required");
  const timelineManifest = readJson(path.join(phaseRoot, "whole-film-static-board-v1/board-manifest.json"));
  const packagingDirection = readJson(path.join(phaseRoot, "whole-film-packaging-direction-v1.json"));
  const timelineByShot = new Map(timelineManifest.timelineItems.map((item) => [item.shotId, item]));
  const directionByShot = new Map((packagingDirection.shotPlans || []).map((item) => [item.shotId, item]));
  const coverageByShot = new Map((current.production.shotVisualCoveragePlan?.shotPlans || []).map((item) => [item.shotId, item]));
  const presenterContextByShot = new Map((current.production.shotIntelligence?.videoPackagingContexts?.items || []).map((item) => [item.shotId, item]));
  const backgroundById = new Map(authority.imagegenBackgroundContinuation.review.candidates.map((item) => [item.candidateId, item]));
  const shotAssetById = new Map((authority.shotSpecificAssetReview?.candidates || []).map((item) => [item.candidateId, item]));
  const allActors = [...authority.imagegenElementKitContinuation.review.kits.flatMap((kit) => kit.actors), ...authority.imagegenProcessConnectorContinuation.review.kits.flatMap((kit) => kit.actors)];
  const actorById = new Map(allActors.map((item) => [item.candidateId, item]));
  const now = new Date().toISOString(); const frames = []; const binaryFiles = {};
  const maskedTypeStyleEvent = {
    eventId: "presenter-type-style-option-ed31-mask-v1",
    sourceBeatIds: ["ED-31"],
    sourceText: "觉得不方便的地方。可控的工作流。",
    packagingType: "OVERLAY_PACKAGE",
    semanticRole: "summary",
    semanticJob: "用可编辑巨型标题与真实口播人物形成前后景遮挡，强调从不便到可控工作流的转变",
    densityProfile: "editorial-collision",
  };
  const maskedTypeStyleBrief = compileRetroPixelEditorialStyleBrief({
    event: maskedTypeStyleEvent,
    appRoot,
    variationOverrides: {
      primaryFamily: "pixel-type-actor",
      supportingFamilies: ["dithered-editorial-poster"],
      surfaceLogic: "footage-derived-pixel-type-depth-interlock",
      dominantActor: "oversized-editable-chinese-headline",
      composition: "asymmetric-scale-collision-behind-presenter-matte",
      palette: "footage-charcoal-white-cobalt",
      material: "sharp-pixel-glyphs-over-live-footage",
      motionEnergy: "type-holds-behind-presenter",
    },
    now,
  });
  assertRetroPixelEditorialStyleBrief(maskedTypeStyleBrief, {appRoot});
  const maskedTypeStyleAudit = auditRetroPixelStyleBriefs([maskedTypeStyleBrief], {appRoot, distinctEventIds: [maskedTypeStyleEvent.eventId]});
  if (maskedTypeStyleAudit.status !== "PASS") throw new Error(`presenter-masked-type-style-audit-failed:${JSON.stringify(maskedTypeStyleAudit)}`);
  for (const [index, assignment] of mapping.assignments.entries()) {
    const timeline = timelineByShot.get(assignment.shotId);
    if (!timeline) throw new Error(`default-library-static-board-timeline-item-missing:${assignment.shotId}`);
    const verifiedSource = assignment.structuralCarrier === "VERIFIED_SOURCE_EVIDENCE";
    const presenterClean = assignment.structuralCarrier === "PRESENTER_CLEAN";
    const presenterIntegrated = assignment.structuralCarrier === "PRESENTER_INTEGRATED_PACKAGE";
    const verifiedPresenter = presenterClean || presenterIntegrated;
    const shotAsset = assignment.shotSpecificAssetId ? shotAssetById.get(assignment.shotSpecificAssetId) : null;
    const background = assignment.backgroundCandidateId ? backgroundById.get(assignment.backgroundCandidateId) : null;
    const coverage = coverageByShot.get(assignment.shotId);
    const presenterContext = presenterContextByShot.get(assignment.shotId);
    const presenterBaseUrl = assignment.verifiedPresenterSource?.publicUrl || presenterContext?.baseFrame?.publicUrl || (coverage?.preview?.kind === "VERIFIED_PRESENTER_SOURCE" ? coverage.preview.publicUrl : null);
    const baseUrl = verifiedSource ? timeline.previewPublicUrl : verifiedPresenter ? presenterBaseUrl : shotAsset?.publicUrl || background?.publicUrl;
    if (!baseUrl) throw new Error(`default-library-static-board-base-unbound:${assignment.shotId}`);
    const base = await normalizeBase(publicPath(baseUrl));
    const composites = [];
    const direction = directionByShot.get(assignment.shotId);
    const presenterPhrases = presenterIntegrated ? (direction?.protectedPhrases || []).filter(Boolean).slice(0, 2) : [];
    const headline = String(presenterPhrases.length ? presenterPhrases.join(" / ") : direction?.protectedPhrases?.[0] || exactHeadline(timeline.sourceText)).trim();
    if (!verifiedSource && !presenterClean) {
      const dark = await isDark(base); const foreground = dark ? "#f4f2eb" : "#111315"; const accent = dark ? "#b9c9ff" : "#2452ff";
      const lines = presenterIntegrated ? presenterPhrases : lineBreak(headline); const typeSize = assignment.structuralCarrier === "TYPOGRAPHY_TAKEOVER" ? 178 : assignment.structuralCarrier === "DETERMINISTIC_EXPLAINER" ? 154 : 138;
      const startX = presenterIntegrated ? 116 : 130 + (index % 3) * 65; const startY = presenterIntegrated ? 205 : assignment.structuralCarrier === "OBJECT_STAGE" || assignment.structuralCarrier === "STANDALONE_ILLUSTRATION" ? 190 : 270;
      const presenterTitleSizes = [62, 96];
      const titleShadowMarkup = presenterIntegrated ? lines.map((line, lineIndex) => `<g fill="#05070a" fill-opacity="0.88">${textPath(line, {x: startX + 5, y: startY + lineIndex * 132 + 7, size: presenterTitleSizes[lineIndex] || 104, tracking: -2})}</g>`).join("") : "";
      const titleMarkup = lines.map((line, lineIndex) => `<g fill="${presenterIntegrated && lineIndex === 0 ? "#b9c9ff" : foreground}">${textPath(line, {x: presenterIntegrated ? startX : startX + lineIndex * 110, y: presenterIntegrated ? startY + lineIndex * 132 : startY + lineIndex * (typeSize + 36), size: presenterIntegrated ? presenterTitleSizes[lineIndex] || 104 : typeSize, tracking: presenterIntegrated ? -2 : -4})}</g>`).join("");
      const support = presenterIntegrated ? "" : `<text x="${startX}" y="930" fill="${accent}" font-family="monospace" font-size="27" letter-spacing="3">${escapeXml(assignment.shotId)} / ${escapeXml(assignment.structuralCarrier)}</text>`;
      const titleSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${titleShadowMarkup}${titleMarkup}${support}</svg>`);
      const actorId = elementRoleByShot.get(assignment.shotId) || elementRoleByKit[assignment.elementKitId]; const actor = actorId ? actorById.get(actorId) : null;
      if (actor && !shotAsset && !presenterIntegrated) composites.push(await actorLayer(actor, {left: 1450, top: 650, width: 300, height: 300}));
      composites.push({input: titleSvg, left: 0, top: 0});
    }
    const pixels = composites.length ? await sharp(base).composite(composites).png({compressionLevel: 9}).toBuffer() : base;
    const relativePath = `${boardRoot}/frames/${assignment.shotId.toLowerCase()}.png`; binaryFiles[relativePath] = pixels;
    const sourceKind = verifiedSource ? "VERIFIED_SOURCE_EVIDENCE" : presenterClean ? "VERIFIED_PRESENTER_SOURCE_CLEAN" : presenterIntegrated ? "VERIFIED_PRESENTER_SOURCE_WITH_RENDERER_PACKAGE" : shotAsset ? "SHOT_SPECIFIC_IMAGEGEN" : "DEFAULT_LIBRARY_ASSEMBLY";
    frames.push({shotId: assignment.shotId, order: index + 1, chapterId: assignment.chapterId, structuralCarrier: assignment.structuralCarrier, sourceKind, sourcePublicUrl: baseUrl, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`, sha256: sha256(pixels), width: 1920, height: 1080, exactSourceText: timeline.sourceText, headlineExcerpt: verifiedSource || presenterClean ? null : headline, backgroundCandidateId: assignment.backgroundCandidateId, elementKitId: assignment.elementKitId, shotSpecificAssetId: assignment.shotSpecificAssetId, verifiedPresenterSource: verifiedPresenter, generatedPersonUsed: false, generatedAssetMayReplaceEvidence: false, productionAdmitted: false});
  }
  const ed31Frame = frames.find((item) => item.shotId === "ED-31");
  if (!ed31Frame) throw new Error("presenter-masked-type-style-ed31-frame-required");
  const ed31Base = await normalizeBase(publicPath(ed31Frame.sourcePublicUrl));
  const ed31AlphaFile = path.join(phaseRoot, "whole-film-motion-plan-v1/mattes/ED-31-dynamic-original-video-alpha.png");
  if (!fs.existsSync(ed31AlphaFile)) throw new Error("presenter-masked-type-style-ed31-alpha-required");
  const ed31Foreground = await maskedForeground(ed31Base, ed31AlphaFile);
  const maskedTypeMarkup = [
    `<g fill="#b9c9ff">${textPath("觉得不方便的地方", {x: 92, y: 255, size: 126, tracking: -4})}</g>`,
    `<g fill="#f4f2eb">${textPath("可控的工作流", {x: 176, y: 630, size: 210, tracking: -8})}</g>`,
  ].join("");
  const maskedTypeSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${maskedTypeMarkup}</svg>`);
  const maskedTypePixels = await sharp(ed31Base).composite([{input: maskedTypeSvg}, {input: ed31Foreground}]).png({compressionLevel: 9}).toBuffer();
  const optionRoot = `${boardRoot}/presenter-typography-style-options-v1`;
  const maskedTypePath = `${optionRoot}/ed-31-masked-headline-option.png`; binaryFiles[maskedTypePath] = maskedTypePixels;
  const currentEd31Pixels = binaryFiles[ed31Frame.publicUrl.split("/editorial-asset-workbench-v1/").at(-1)];
  const optionTiles = [currentEd31Pixels, maskedTypePixels].map(async (pixels, index) => ({input: await sharp(pixels).resize(920, 518, {fit: "cover"}).png().toBuffer(), left: 20 + index * 950, top: 64}));
  const optionSheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="640"><rect width="1920" height="640" fill="#0b1015"/><text x="20" y="36" fill="#dfff68" font-family="monospace" font-size="20">PRESENTER TYPOGRAPHY OPTIONS · STYLE VOCABULARY, NOT A GLOBAL TEMPLATE</text><text x="20" y="615" fill="#e8edf0" font-family="monospace" font-size="14">OPEN-REGION HEADLINE · CURRENT BOARD</text><text x="970" y="615" fill="#e8edf0" font-family="monospace" font-size="14">MASKED LARGE HEADLINE · OPTIONAL · NOT SELECTED</text></svg>`);
  const optionSheetPixels = await sharp(optionSheetSvg).composite(await Promise.all(optionTiles)).png({compressionLevel: 9}).toBuffer();
  const optionSheetPath = `${optionRoot}/comparison-sheet.png`; binaryFiles[optionSheetPath] = optionSheetPixels;
  const presenterTypographyStyleOptions = {
    contract: "A1PresenterTypographyStyleOptions/v1",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    defaultTemplate: null,
    selectionPolicy: "SEMANTIC_EMPHASIS_PLUS_ACTUAL_SUBJECT_GEOMETRY",
    optionsAreGlobalDefaults: false,
    decorativeVerticalRulesAllowed: false,
    currentBoardOption: "PRESENTER_HEADLINE_OPEN_REGION",
    options: [
      {id: "PRESENTER_HEADLINE_OPEN_REGION", role: "short supporting title in verified open region", selectedForCurrentBoard: true, publicUrl: ed31Frame.publicUrl, sha256: ed31Frame.sha256},
      {id: "PRESENTER_MASKED_LARGE_HEADLINE", role: "large editable title behind verified presenter foreground", selectedForCurrentBoard: false, autoDefault: false, eligibility: ["strong-language-event", "verified-presenter-matte", "title-subject-overlap-adds-hierarchy", "three-second-legibility"], publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${maskedTypePath}`, sha256: sha256(maskedTypePixels), presenterSourceSha256: sha256(fs.readFileSync(publicPath(ed31Frame.sourcePublicUrl))), mattePublicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-motion-plan-v1/mattes/ED-31-dynamic-original-video-alpha.png", matteSha256: sha256(fs.readFileSync(ed31AlphaFile)), styleBriefSha256: maskedTypeStyleBrief.styleBriefSha256, typography: {fontId: "type-pixel-correction", fontFamily: "Fusion Pixel", fontFileSha256: sha256(fs.readFileSync(fontPath)), editableText: true, generatedFormalText: false, exactCopy: ["觉得不方便的地方", "可控的工作流"], zOrder: ["VERIFIED_PRESENTER_BASE", "RENDERER_BOUND_HEADLINE", "VERIFIED_PRESENTER_FOREGROUND"]}},
    ],
    comparisonSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${optionSheetPath}`, sha256: sha256(optionSheetPixels), width: 1920, height: 640},
    userVisualApproval: "NOT_APPROVED",
    productionAdmitted: false,
    motionPerformed: false,
  };
  const columns = 5; const tileWidth = 360; const tileHeight = 203; const cellWidth = 380; const rowHeight = 258; const top = 66; const sheetHeight = top + Math.ceil(frames.length / columns) * rowHeight;
  const tiles = await Promise.all(frames.map(async (frame, index) => ({input: await sharp(binaryFiles[frame.publicUrl.split("/editorial-asset-workbench-v1/").at(-1)]).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left: 10 + (index % columns) * cellWidth, top: top + Math.floor(index / columns) * rowHeight})));
  const labels = frames.map((frame, index) => { const x = 10 + (index % columns) * cellWidth; const y = top + Math.floor(index / columns) * rowHeight + tileHeight + 18; return `<text x="${x}" y="${y}" fill="#e8edf0" font-family="monospace" font-size="12">${frame.shotId} · ${escapeXml(frame.structuralCarrier)}</text><text x="${x}" y="${y + 17}" fill="#8fa6b8" font-family="monospace" font-size="10">${escapeXml(frame.sourceKind)} · NOT APPROVED</text>`; }).join("");
  const sheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${sheetHeight}"><rect width="1920" height="${sheetHeight}" fill="#0b1015"/><text x="10" y="36" fill="#dfff68" font-family="monospace" font-size="20">DEFAULT LIBRARY → 34-SHOT STATIC BOARD · SOURCE EVIDENCE PRESERVED · USER REVIEW REQUIRED</text>${labels}</svg>`);
  const reviewSheetPixels = await sharp(sheetSvg).composite(tiles).png().toBuffer(); const reviewSheetPath = `${boardRoot}/review-sheet.png`; binaryFiles[reviewSheetPath] = reviewSheetPixels;
  const backgroundUsage = Object.fromEntries([...new Set(frames.map((item) => item.backgroundCandidateId).filter(Boolean))].map((id) => [id, frames.filter((item) => item.backgroundCandidateId === id).length]));
  const verifiedFrames = frames.filter((item) => item.sourceKind === "VERIFIED_SOURCE_EVIDENCE");
  const verifiedPresenterFrames = frames.filter((item) => item.verifiedPresenterSource === true);
  const protectedSourceFrames = [...verifiedFrames, ...verifiedPresenterFrames];
  const reviewBody = {contract: "A1DefaultLibraryWholeFilmStaticBoardReview/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", sourceWorkspaceSha256: current.workspaceSha256, sourceMappingSha256: mapping.mappingSha256, sourcePackagingDirectionSha256: packagingDirection.sha256, frameCount: frames.length, frames, presenterTypographyStyleOptions, reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheetPixels), width: 1920, height: sheetHeight}, audit: {allFramesUnique: new Set(frames.map((item) => item.sha256)).size === 34, verifiedSourceFrameCount: verifiedFrames.length, verifiedPresenterFrameCount: verifiedPresenterFrames.length, presenterIntegratedFrameCount: frames.filter((item) => item.structuralCarrier === "PRESENTER_INTEGRATED_PACKAGE").length, presenterCleanFrameCount: frames.filter((item) => item.structuralCarrier === "PRESENTER_CLEAN").length, presenterTypographyStyleOptionCount: presenterTypographyStyleOptions.options.length, decorativeVerticalRuleCount: 0, generatedPersonFrameCount: frames.filter((item) => item.generatedPersonUsed === true).length, verifiedSourcesUseGeneratedReplacement: protectedSourceFrames.some((item) => item.backgroundCandidateId || item.shotSpecificAssetId || item.generatedAssetMayReplaceEvidence !== false), distinctBackgroundCount: Object.keys(backgroundUsage).length, maximumBackgroundReuseCount: Math.max(...Object.values(backgroundUsage)), backgroundUsage}, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionPerformed: false, resolvePerformed: false, createdAt: now};
  const review = {...reviewBody, reviewSha256: sha256(reviewBody)};
  if (review.frameCount !== 34 || !review.audit.allFramesUnique || review.audit.verifiedSourcesUseGeneratedReplacement || review.audit.verifiedPresenterFrameCount !== 6 || review.audit.presenterIntegratedFrameCount !== 1 || review.audit.presenterCleanFrameCount !== 5 || review.audit.presenterTypographyStyleOptionCount !== 2 || review.audit.decorativeVerticalRuleCount !== 0 || review.audit.generatedPersonFrameCount !== 0 || review.audit.maximumBackgroundReuseCount > 2) throw new Error(`default-library-static-board-audit-failed:${JSON.stringify(review.audit)}`);
  const next = structuredClone(current); const nextAuthority = structuredClone(authority); delete nextAuthority.authoritySha256;
  nextAuthority.defaultLibraryWholeFilmStaticBoardReview = review;
  nextAuthority.lanes.layouts = {...nextAuthority.lanes.layouts, status: "WHOLE_FILM_STATIC_BOARD_READY_FOR_USER_REVIEW", mappedShotCount: 34, staticCanaryCount: 3, staticBoardFrameCount: 34, motionBlocked: true, laneComplete: false};
  nextAuthority.updatedAt = now; nextAuthority.authoritySha256 = sha256(nextAuthority); next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(nextAuthority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "build-default-library-whole-film-static-board-v1", targetId: review.reviewSha256, payload: {frameCount: 34, verifiedSourceFrameCount: verifiedFrames.length, verifiedPresenterFrameCount: verifiedPresenterFrames.length, presenterIntegratedFrameCount: review.audit.presenterIntegratedFrameCount, presenterCleanFrameCount: review.audit.presenterCleanFrameCount, presenterTypographyStyleOptionCount: review.audit.presenterTypographyStyleOptionCount, decorativeVerticalRuleCount: 0, generatedPersonFrameCount: 0, distinctBackgroundCount: review.audit.distinctBackgroundCount, maximumBackgroundReuseCount: review.audit.maximumBackgroundReuseCount, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass); eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1; eventBound.production.eventLedger.lastEventId = event.eventId; eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `default-library-whole-film-static-board-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${boardRoot}/review.json`]: review, [`${optionRoot}/style-brief.json`]: maskedTypeStyleBrief, [`${optionRoot}/style-audit.json`]: maskedTypeStyleAudit}, binaryFiles});
  return {review, persisted};
});

console.log(JSON.stringify({status: result.review.status, frameCount: result.review.frameCount, verifiedSourceFrameCount: result.review.audit.verifiedSourceFrameCount, verifiedPresenterFrameCount: result.review.audit.verifiedPresenterFrameCount, presenterIntegratedFrameCount: result.review.audit.presenterIntegratedFrameCount, presenterCleanFrameCount: result.review.audit.presenterCleanFrameCount, presenterTypographyStyleOptionCount: result.review.audit.presenterTypographyStyleOptionCount, decorativeVerticalRuleCount: result.review.audit.decorativeVerticalRuleCount, generatedPersonFrameCount: result.review.audit.generatedPersonFrameCount, distinctBackgroundCount: result.review.audit.distinctBackgroundCount, maximumBackgroundReuseCount: result.review.audit.maximumBackgroundReuseCount, reviewSheet: result.review.reviewSheet.publicUrl, presenterTypographyComparisonSheet: result.review.presenterTypographyStyleOptions.comparisonSheet.publicUrl, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, null, 2));
