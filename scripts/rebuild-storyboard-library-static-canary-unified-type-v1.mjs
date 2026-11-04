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

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const mappingRoot = "default-design-asset-library-v1/storyboard-library-binding-v1";
const fontPath = path.join(phaseRoot, "font-cache/fusion-pixel.ttf");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const font = fontkit.openSync(fontPath);
const fontFileSha256 = sha256(fs.readFileSync(fontPath));
const fontBinding = {fontId: "type-pixel-correction", fontFamily: "Fusion Pixel", fontFileSha256, textBindingMode: "DETERMINISTIC_GLYPH_OUTLINES"};

function canonicalize(value) {
  return Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
}

function sha256(value) {
  return crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(canonicalize(value))).digest("hex");
}

function assetPath(publicUrl) {
  return path.join(appRoot, "public", String(publicUrl).replace(/^\//u, ""));
}

function textPath(text, {x, y, size, tracking = 0, scaleX = 1}) {
  let cursor = x;
  const scale = size / font.unitsPerEm;
  const parts = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`unified-canary-missing-glyph:${character}`);
    parts.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  return {markup: parts.join(""), width: cursor - x};
}

function textGroup(text, placement, color) {
  return `<g fill="${color}">${textPath(text, placement).markup}</g>`;
}

async function elementLayer(publicUrl, placement) {
  const element = await sharp(assetPath(publicUrl)).resize(placement.width, placement.height, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
  return {input: element, left: placement.left, top: placement.top};
}

const canarySpecs = [
  {
    shotId: "ED-10",
    basePublicUrl: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-role-wave-v2/background-cobalt-verdict-mass-field-imagegen-v2.png",
    elementPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-element-kit-wave-v1/article-element-crossed-strokes-imagegen-v1.png",
    elementPlacement: {left: 1500, top: 700, width: 300, height: 300},
    exactText: "完成度很高\n的废稿",
    textMarkup: `${textGroup("完成度很高", {x: 785, y: 172, size: 230, tracking: -9, scaleX: .76}, "#f4f2eb")}${textGroup("的废稿", {x: 1035, y: 430, size: 300, tracking: -13, scaleX: .8}, "#f4f2eb")}${textGroup("HIGH POLISH / LOW VALUE", {x: 1110, y: 855, size: 33, tracking: 3}, "#2450ff")}`,
  },
  {
    shotId: "ED-17",
    basePublicUrl: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-completion-wave-v3/background-cobalt-dash-textile-imagegen-v3.png",
    elementPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-process-connector-wave-v1/article-element-charcoal-sorting-loop-imagegen-v1.png",
    elementPlacement: {left: 1430, top: 300, width: 260, height: 260},
    exactText: "先给材料\n再找角度\n最后动笔",
    textMarkup: `${textGroup("先给材料", {x: 260, y: 190, size: 170, tracking: -5}, "#f4f2eb")}${textGroup("再找角度", {x: 520, y: 420, size: 170, tracking: -5}, "#f4f2eb")}${textGroup("最后动笔", {x: 790, y: 650, size: 170, tracking: -5}, "#f4f2eb")}${textGroup("PROCESS / NOT AUTO", {x: 130, y: 920, size: 28, tracking: 3}, "#9bc7ff")}`,
  },
  {
    shotId: "ED-31",
    basePublicUrl: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/shot-specific-assets-v1/ed31-controllable-routing-object-imagegen-v1.png",
    exactText: "一套可控的工作流",
    textMarkup: `${textGroup("一套可控的工作流", {x: 130, y: 235, size: 145, tracking: -4}, "#111315")}${textGroup("CONTROL / NOT AUTO", {x: 135, y: 330, size: 28, tracking: 3}, "#2452ff")}`,
  },
];

async function renderCanary(spec) {
  const base = await sharp(assetPath(spec.basePublicUrl)).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const titleSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><g>${spec.textMarkup}</g></svg>`);
  const composites = [];
  if (spec.elementPublicUrl) composites.push(await elementLayer(spec.elementPublicUrl, spec.elementPlacement));
  composites.push({input: titleSvg, left: 0, top: 0});
  return sharp(base).composite(composites).png({compressionLevel: 9}).toBuffer();
}

async function buildReviewSheet(canaries) {
  const tileWidth = 620;
  const tileHeight = 349;
  const tiles = [];
  for (const [index, canary] of canaries.entries()) tiles.push({input: await sharp(canary.pixels).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left: 15 + index * 635, top: 60});
  const labels = canaries.map((canary, index) => `${textGroup(`${canary.shotId} · FUSION PIXEL · STATIC ONLY`, {x: 15 + index * 635, y: 435, size: 14, tracking: 1}, "#e8edf0")}`).join("");
  const header = `${textGroup("SMART STORYBOARD · ONE FONT · STATIC CANARY · USER REVIEW REQUIRED", {x: 15, y: 34, size: 20, tracking: 1}, "#dfff68")}`;
  const sheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="470"><rect width="1920" height="470" fill="#0b1015"/>${header}${labels}</svg>`);
  return sharp(sheetSvg).composite(tiles).png().toBuffer();
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  const now = new Date().toISOString();
  const canaries = [];
  for (const spec of canarySpecs) canaries.push({...spec, pixels: await renderCanary(spec)});
  const reviewSheetPixels = await buildReviewSheet(canaries);
  const currentMapping = structuredClone(authority.storyboardDefaultLibraryBinding);
  const backgroundReplacementByShot = new Map([
    ["ED-01", "background-cool-uniform-polka-dot-imagegen-v4"],
    ["ED-07", "background-charcoal-uniform-plus-cross-imagegen-v4"],
    ["ED-08", "background-cool-uniform-short-dash-imagegen-v4"],
    ["ED-11", "background-cool-uniform-square-dot-imagegen-v4"],
    ["ED-18", "background-cool-uniform-polka-dot-imagegen-v4"],
    ["ED-32", "background-charcoal-uniform-plus-cross-imagegen-v4"],
    ["ED-33", "background-cool-uniform-square-dot-imagegen-v4"],
  ]);
  const mappingBody = {...currentMapping, sourceWorkspaceSha256: current.workspaceSha256, assignments: (currentMapping.assignments || []).map((assignment) => {
    const next = assignment.typographyTemplateId ? {...assignment, typographyTemplateId: "pixel-correction-anchor"} : {...assignment};
    if (backgroundReplacementByShot.has(assignment.shotId)) next.backgroundCandidateId = backgroundReplacementByShot.get(assignment.shotId);
    if (assignment.shotId === "ED-17") {
      next.backgroundCandidateId = "background-cobalt-dash-textile-imagegen-v3";
      next.elementKitId = "process-connector-kit";
      next.elementActorIds = ["article-element-cobalt-process-ribbon-imagegen-v1", "article-element-charcoal-sorting-loop-imagegen-v1", "article-element-registration-trail-imagegen-v1"];
    }
    return next;
  })};
  delete mappingBody.mappingSha256;
  const mapping = {...mappingBody, mappingSha256: sha256(mappingBody)};
  const canaryRecords = canaries.map((canary) => ({shotId: canary.shotId, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${mappingRoot}/canary-${canary.shotId.toLowerCase()}.png`, sha256: sha256(canary.pixels), width: 1920, height: 1080, status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", motionPerformed: false, productionAdmitted: false, typographyBinding: fontBinding}));
  const reviewSheet = {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${mappingRoot}/canary-sheet.png`, sha256: sha256(reviewSheetPixels), width: 1920, height: 470};
  const reviewBody = {contract: "A1StoryboardLibraryStaticCanaryReview/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", mappingSha256: mapping.mappingSha256, canaryCount: canaryRecords.length, canaries: canaryRecords, reviewSheet, typography: {contract: "A1CanaryTypographyBinding/v1", ...fontBinding, allVisibleFormalTextUsesSameFont: true, generatedFormalText: false}, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionPerformed: false, resolvePerformed: false, createdAt: now};
  const canaryReview = {...reviewBody, reviewSha256: sha256(reviewBody)};
  const next = structuredClone(current);
  const nextAuthority = structuredClone(authority);
  delete nextAuthority.authoritySha256;
  nextAuthority.storyboardDefaultLibraryBinding = mapping;
  nextAuthority.storyboardLibraryStaticCanaryReview = canaryReview;
  nextAuthority.updatedAt = now;
  nextAuthority.authoritySha256 = sha256(nextAuthority);
  next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(nextAuthority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "rebuild-storyboard-library-static-canary-unified-type", targetId: canaryReview.reviewSha256, payload: {canaryCount: canaryRecords.length, fontId: fontBinding.fontId, fontFamily: fontBinding.fontFamily, allVisibleFormalTextUsesSameFont: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const binaryFiles = {};
  for (const canary of canaries) binaryFiles[`${mappingRoot}/canary-${canary.shotId.toLowerCase()}.png`] = canary.pixels;
  binaryFiles[`${mappingRoot}/canary-sheet.png`] = reviewSheetPixels;
  const files = {[`${mappingRoot}/mapping.json`]: mapping, [`${mappingRoot}/canary-review.json`]: canaryReview};
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `unified-type-canary-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files, binaryFiles});
  return {canaryReview, mapping, persisted};
});

console.log(JSON.stringify({status: result.canaryReview.status, canaryCount: result.canaryReview.canaryCount, font: fontBinding, mappingSha256: result.mapping.mappingSha256, reviewSha256: result.canaryReview.reviewSha256, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
