#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const libraryRoot = "default-design-asset-library-v1/shot-specific-assets-v1";
const mappingRoot = "default-design-asset-library-v1/storyboard-library-binding-v1";
const grammarPath = path.join(phaseRoot, "article-asset-background-lane-v1/video-composition-grammar.json");
const backgroundReviewPath = path.join(phaseRoot, "default-design-asset-library-v1/imagegen-background-final-wave-v4/review.json");
const elementReviewPath = path.join(phaseRoot, "default-design-asset-library-v1/imagegen-element-kit-wave-v1/review.json");
const connectorReviewPath = path.join(phaseRoot, "default-design-asset-library-v1/imagegen-process-connector-wave-v1/review.json");
const typographyReviewPath = path.join(phaseRoot, "default-design-asset-library-v1/typography-template-specimens-v1/review.json");
const fontPath = path.join(phaseRoot, "font-cache/fusion-pixel.ttf");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const sources = process.argv.slice(2);
if (sources.length !== 3 || sources.some((file) => !path.isAbsolute(file) || !fs.existsSync(file))) throw new Error("shot-specific-three-absolute-source-paths-required");
const shotDefinitions = [
  {shotId: "ED-20", candidateId: "ed20-material-constraint-manuscript-imagegen-v1", assetKind: "STANDALONE_ILLUSTRATION", semanticJob: "many loose materials pass through one constraint aperture and converge into one coherent manuscript", evidenceUseAllowed: false},
  {shotId: "ED-23", candidateId: "ed23-separated-five-version-archives-imagegen-v1", assetKind: "STANDALONE_ILLUSTRATION", semanticJob: "three separated topic archives each retain five visible revisions without mixing", evidenceUseAllowed: false},
  {shotId: "ED-31", candidateId: "ed31-controllable-routing-object-imagegen-v1", assetKind: "OBJECT_STAGE", semanticJob: "one physical routing selector embodies controllable bounded workflow rather than one-click automation", evidenceUseAllowed: false},
];

function runVision(scriptName, imagePath) {
  const result = spawnSync("swift", [path.join(root, "scripts", scriptName), imagePath], {encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`shot-specific-vision-failed:${scriptName}:${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
}

const bgById = new Map(JSON.parse(fs.readFileSync(backgroundReviewPath, "utf8")).candidates.map((item) => [item.candidateId, item]));
const typeById = new Map(JSON.parse(fs.readFileSync(typographyReviewPath, "utf8")).templates.map((item) => [item.templateId, item]));
const kitById = new Map([...JSON.parse(fs.readFileSync(elementReviewPath, "utf8")).kits, ...JSON.parse(fs.readFileSync(connectorReviewPath, "utf8")).kits].map((item) => [item.kitId, item]));
const grammar = JSON.parse(fs.readFileSync(grammarPath, "utf8"));
const assetPathByCandidateId = (candidateId) => {
  const asset = bgById.get(candidateId);
  if (!asset?.publicUrl) throw new Error(`legacy-canary-background-missing:${candidateId}`);
  return path.join(appRoot, "public", asset.publicUrl.replace(/^\//u, ""));
};

const choices = {
  ED01: ["background-cool-uniform-polka-dot-imagegen-v4", "quiet-one-bit-caption", "physical-editorial-kit"],
  ED07: ["background-charcoal-uniform-plus-cross-imagegen-v4", "stacked-question-impact", "signal-transition-kit"],
  ED08: ["background-cool-uniform-short-dash-imagegen-v4", "pixel-correction-anchor", "revision-kit"],
  ED09: ["background-charcoal-print-pressure-drift-imagegen-v3", "stacked-question-impact", "revision-kit"],
  ED10: ["background-cobalt-verdict-mass-field-imagegen-v2", "verdict-crop-collision", "revision-kit"],
  ED11: ["background-cool-uniform-square-dot-imagegen-v4", "pixel-correction-anchor", "revision-kit"],
  ED12: ["background-diagonal-process-contour-field-imagegen-v2", "source-evidence-rail", "source-proof-kit"],
  ED13: ["background-cool-irregular-micro-mesh-imagegen-v3", "pixel-correction-anchor", "revision-kit"],
  ED15: ["background-source-evidence-registration-bed-imagegen-v2", "stacked-question-impact", "revision-kit"],
  ED16: ["background-one-bit-memory-dissolve-imagegen-v1", "verdict-crop-collision", "signal-transition-kit"],
  ED17: ["background-cobalt-dash-textile-imagegen-v3", "chapter-signal-split", "process-connector-kit"],
  ED18: ["background-cool-uniform-polka-dot-imagegen-v4", "quiet-one-bit-caption", "physical-editorial-kit"],
  ED19: ["background-charcoal-woven-microcheck-imagegen-v3", "source-evidence-rail", "source-proof-kit"],
  ED20: ["background-cool-object-stage-basin-imagegen-v3", "quiet-one-bit-caption", null],
  ED23: ["background-cool-broad-halftone-wave-imagegen-v3", "quiet-one-bit-caption", "physical-editorial-kit"],
  ED31: ["background-cool-object-stage-basin-imagegen-v3", "verdict-crop-collision", "physical-editorial-kit"],
  ED32: ["background-charcoal-uniform-plus-cross-imagegen-v4", "quiet-one-bit-caption", "revision-kit"],
  ED33: ["background-cool-uniform-square-dot-imagegen-v4", "quiet-one-bit-caption", "signal-transition-kit"],
  ED34: ["background-source-evidence-registration-bed-imagegen-v2", "quiet-one-bit-caption", "revision-kit"],
};
const sourceProofKitId = "source-proof-kit";
const shotKey = (shotId) => shotId.replace("-", "");

function textPath(text, x, y, size) {
  const font = fontkit.openSync(fontPath); const scale = size / font.unitsPerEm; let cursor = x; const parts = [];
  for (const char of [...text]) { const run = font.layout(char); const glyph = run.glyphs[0]; if (!glyph || glyph.id === 0) throw new Error(`canary-missing-glyph:${char}`); parts.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor} ${y}) scale(${scale} ${-scale})"/>`); cursor += run.positions[0].xAdvance * scale - 5; }
  return parts.join("");
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  if (authority.storyboardLibraryStaticCanaryReview?.typography?.allVisibleFormalTextUsesSameFont === true) throw new Error("legacy-storyboard-canary-rebuild-superseded-use-rebuild-storyboard-library-static-canary-unified-type-v1");
  const now = new Date().toISOString();
  const binaryFiles = {}; const files = {}; const assets = [];
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-shot-specific-assets-"));
  for (const [index, definition] of shotDefinitions.entries()) {
    const sourceBytes = fs.readFileSync(sources[index]);
    const pixels = await sharp(sourceBytes).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
    const temporary = path.join(temporaryRoot, `${definition.candidateId}.png`); fs.writeFileSync(temporary, pixels);
    const ocr = runVision("run-local-vision-ocr-v1.swift", temporary); const human = runVision("run-local-vision-human-presence-v1.swift", temporary);
    const rawText = String(ocr.text || "").trim(); const readableTextDetected = /[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}|\d{3,}/u.test(rawText);
    if (ocr.status !== "PASS" || readableTextDetected || human.status !== "PASS" || Number(human.faceCount || 0) !== 0 || Number(human.humanRectCount || 0) !== 0) throw new Error(`shot-specific-machine-gate-failed:${definition.shotId}:${rawText || "no-ocr"}`);
    const relativePath = `${libraryRoot}/${definition.candidateId}.png`; binaryFiles[relativePath] = pixels;
    assets.push({...definition, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`, sha256: sha256(pixels), sourceOriginalSha256: sha256(sourceBytes), width: 1920, height: 1080, mimeType: "image/png", textFree: true, peopleFree: true, machineStatus: "PASS", visualReviewStatus: "READY_FOR_USER_REVIEW", currentDirectionApproved: false, productionAdmitted: false, generation: {provider: "codex-built-in-imagegen", executionId: path.basename(sources[index], ".png")}, machine: {ocr: {...ocr, readableTextDetected}, human}});
  }
  const assetByShot = new Map(assets.map((item) => [item.shotId, item]));
  const assignments = grammar.currentFilm.shotSchedule.map((shot) => {
    const choice = choices[shotKey(shot.shotId)] || null;
    const verifiedSourceOnly = shot.structuralCarrier === "VERIFIED_SOURCE_EVIDENCE";
    const background = choice?.[0] ? bgById.get(choice[0]) : null;
    const typography = choice?.[1] ? typeById.get("pixel-correction-anchor") : null;
    const kit = choice?.[2] ? kitById.get(choice[2]) : verifiedSourceOnly ? kitById.get(sourceProofKitId) : null;
    const shotAsset = assetByShot.get(shot.shotId) || null;
    return {shotId: shot.shotId, chapterId: shot.chapterId, packageDecision: shot.packageDecision, structuralCarrier: shot.structuralCarrier, facelessRerouteRequired: shot.facelessRerouteRequired, backgroundSupplyRequired: shot.backgroundSupplyRequired, backgroundCandidateId: background?.candidateId || null, typographyTemplateId: typography?.templateId || null, elementKitId: kit?.kitId || null, elementActorIds: kit?.actors?.map((actor) => actor.candidateId) || [], shotSpecificAssetId: shotAsset?.candidateId || null, verifiedSourceRequired: verifiedSourceOnly, generatedAssetMayReplaceEvidence: false, status: verifiedSourceOnly || background || shotAsset ? "BOUND" : "NO_GENERATED_ASSET_REQUIRED"};
  });
  if (assignments.length !== 34 || assignments.filter((item) => item.structuralCarrier === "VERIFIED_SOURCE_EVIDENCE").some((item) => item.backgroundCandidateId || item.shotSpecificAssetId || item.generatedAssetMayReplaceEvidence !== false)) throw new Error("storyboard-binding-evidence-boundary-invalid");
  if (assignments.filter((item) => item.backgroundSupplyRequired && !["STANDALONE_ILLUSTRATION", "OBJECT_STAGE"].includes(item.structuralCarrier)).some((item) => !item.backgroundCandidateId)) throw new Error("storyboard-binding-background-gap");
  const packageAssignments = assignments.filter((item) => item.packageDecision === "PACKAGE" && item.backgroundCandidateId);
  for (let index = 1; index < packageAssignments.length; index += 1) if (packageAssignments[index - 1].backgroundCandidateId === packageAssignments[index].backgroundCandidateId) throw new Error(`storyboard-binding-adjacent-package-background-repeat:${packageAssignments[index].shotId}`);
  for (let index = 0; index <= packageAssignments.length - 5; index += 1) if (new Set(packageAssignments.slice(index, index + 5).map((item) => item.backgroundCandidateId)).size < 3) throw new Error(`storyboard-binding-five-event-variety-failed:${packageAssignments[index].shotId}`);
  const mappingBody = {contract: "A1StoryboardDefaultLibraryBinding/v1", status: "STATIC_CANARY_READY_FOR_USER_REVIEW", sourceGrammarSha256: sha256(grammar), sourceWorkspaceSha256: current.workspaceSha256, assignmentCount: assignments.length, assignments, rules: {semanticBindingNotRoundRobin: true, sameBackgroundOnAdjacentPackageEventsAllowed: false, minimumDistinctBackgroundsInAnyFivePackageEvents: 3, generatedAssetMayReplaceEvidence: false, oneElementKitPerFrameByDefault: true}, boundaries: {staticCanaryAllowed: true, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false, productionAdmitted: false}, userVisualApproval: "NOT_APPROVED", createdAt: now};
  const mapping = {...mappingBody, mappingSha256: sha256(mappingBody)}; files[`${mappingRoot}/mapping.json`] = mapping;
  const canarySpecs = [
    {shotId: "ED-10", source: null, title: "完成度很高\n的废稿"},
    {shotId: "ED-17", source: null, title: "先给材料\n再找角度\n最后动笔"},
    {shotId: "ED-31", source: null, title: "一套可控的工作流"},
  ];
  const canaryTiles = []; const canaries = [];
  for (const [index, spec] of canarySpecs.entries()) {
    let pixels;
    if (spec.source) pixels = fs.readFileSync(spec.source);
    else { const object = assets.find((item) => item.shotId === spec.shotId); const objectPath = spec.shotId === "ED-31" ? binaryFiles[object.publicUrl.split("/editorial-asset-workbench-v1/").at(-1)] : await sharp(assetPathByCandidateId(spec.shotId === "ED-10" ? "background-cobalt-verdict-mass-field-imagegen-v2" : "background-cobalt-dash-textile-imagegen-v3")).resize(1920, 1080, {fit: "cover"}).png().toBuffer(); const titleLines = spec.title.split("\n").map((line, lineIndex) => `<g fill="#${spec.shotId === "ED-10" ? "f4f2eb" : "f4f2eb"}">${textPath(line, spec.shotId === "ED-10" ? 780 + lineIndex * 250 : 240 + lineIndex * 220, spec.shotId === "ED-10" ? 220 + lineIndex * 260 : 210 + lineIndex * 220, spec.shotId === "ED-10" ? (lineIndex === 0 ? 230 : 300) : 155)}</g>`).join(""); const titleSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${titleLines}<g fill="#2452ff">${textPath("CONTROL / NOT AUTO", 135, 920, 28)}</g></svg>`); pixels = await sharp(objectPath).composite([{input: titleSvg}]).png().toBuffer(); }
    const relativePath = `${mappingRoot}/canary-${spec.shotId.toLowerCase()}.png`; binaryFiles[relativePath] = pixels;
    canaries.push({shotId: spec.shotId, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`, sha256: sha256(pixels), width: 1920, height: 1080, status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", motionPerformed: false, productionAdmitted: false});
    canaryTiles.push({input: await sharp(pixels).resize(620, 349, {fit: "cover"}).png().toBuffer(), left: 15 + index * 635, top: 60});
  }
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="470"><rect width="1920" height="470" fill="#0b1015"/><text x="15" y="34" fill="#dfff68" font-family="monospace" font-size="20">SMART STORYBOARD → DEFAULT LIBRARY · STATIC CANARY · USER REVIEW REQUIRED</text>${canaries.map((item, index) => `<text x="${15 + index * 635}" y="435" fill="#e8edf0" font-family="monospace" font-size="14">${item.shotId} · STATIC ONLY · NOT APPROVED</text>`).join("")}</svg>`);
  const canarySheet = await sharp(labels).composite(canaryTiles).png().toBuffer(); const canarySheetPath = `${mappingRoot}/canary-sheet.png`; binaryFiles[canarySheetPath] = canarySheet;
  const canaryReviewBody = {contract: "A1StoryboardLibraryStaticCanaryReview/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", mappingSha256: mapping.mappingSha256, canaryCount: canaries.length, canaries, reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${canarySheetPath}`, sha256: sha256(canarySheet), width: 1920, height: 470}, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionPerformed: false, resolvePerformed: false, createdAt: now};
  const canaryReview = {...canaryReviewBody, reviewSha256: sha256(canaryReviewBody)}; files[`${mappingRoot}/canary-review.json`] = canaryReview;
  const shotReviewBody = {contract: "A1ShotSpecificAssetReview/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", candidateCount: assets.length, candidates: assets, machinePassCannotApprove: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, createdAt: now};
  const shotReview = {...shotReviewBody, reviewSha256: sha256(shotReviewBody)}; files[`${libraryRoot}/review.json`] = shotReview;
  const next = structuredClone(current); const nextAuthority = structuredClone(authority); delete nextAuthority.authoritySha256;
  nextAuthority.shotSpecificAssetReview = shotReview; nextAuthority.storyboardDefaultLibraryBinding = mapping; nextAuthority.storyboardLibraryStaticCanaryReview = canaryReview;
  nextAuthority.lanes.illustrations = {...nextAuthority.lanes.illustrations, status: "SHOT_SPECIFIC_ASSETS_READY_FOR_USER_REVIEW", candidateCount: 3, requiredCurrentFilmCount: 3, approvedCount: 0, laneComplete: false};
  nextAuthority.lanes.layouts = {...nextAuthority.lanes.layouts, status: "STATIC_CANARY_READY_FOR_USER_REVIEW", mappedShotCount: 34, staticCanaryCount: 3, motionBlocked: true};
  nextAuthority.updatedAt = now; nextAuthority.authoritySha256 = sha256(nextAuthority); next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(nextAuthority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now)); const event = createProductionEvent({workspace: current, action: "adopt-shot-specific-assets-and-build-storyboard-library-static-canary", targetId: mapping.mappingSha256, payload: {shotSpecificCandidateCount: 3, mappedShotCount: 34, staticCanaryCount: 3, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass); eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1; eventBound.production.eventLedger.lastEventId = event.eventId; eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now)); const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `storyboard-library-static-canary-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files, binaryFiles});
  return {shotReview, mapping, canaryReview, persisted};
});

console.log(JSON.stringify({shotSpecificStatus: result.shotReview.status, shotSpecificCandidateCount: result.shotReview.candidateCount, mappingStatus: result.mapping.status, mappedShotCount: result.mapping.assignmentCount, canaryStatus: result.canaryReview.status, canaryCount: result.canaryReview.canaryCount, canarySheet: result.canaryReview.reviewSheet.publicUrl, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, null, 2));
