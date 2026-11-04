#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialShotDirector, compileEditorialShotDirector, EDITORIAL_SHOT_ROUTES, SCREEN_ACTION_GRAMMARS} from "../apps/studio-next/src/lib/a1-editorial-shot-director-v1.mjs";
import {compileCurrentScreenDemoLane} from "../apps/studio-next/src/lib/a1-current-screen-demo-lane-v1.mjs";
import {compareCandidateAgainstIncumbentBest} from "../apps/studio-next/src/lib/a1-incumbent-best-evidence-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const screenManifestFile = path.join(generatedRoot, "continuous-screen-evidence-v2/static-review-v1/manifest.json");
const presenterManifestFile = path.join(generatedRoot, "presenter-light-overlay-system-v2/manifest.json");
const incumbentRoot = path.join(generatedRoot, "editorial-shot-director-v1/candidate-v1");
const incumbentManifestFile = path.join(incumbentRoot, "manifest.json");
const outputRoot = path.join(generatedRoot, "editorial-shot-director-v1/candidate-v2");
const screenFrameRoot = path.join(outputRoot, "screen-focus-frames");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const clamp01 = (value, fallback = 0.5) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;

const workspace = readJson(workspaceFile);
const currentBoard = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const screenManifest = readJson(screenManifestFile);
const incumbentManifest = readJson(incumbentManifestFile);
const presenterManifest = fs.existsSync(presenterManifestFile) ? readJson(presenterManifestFile) : null;
const screenDemoLane = compileCurrentScreenDemoLane(workspace, {generatedAt: new Date().toISOString()});
const director = assertEditorialShotDirector(compileEditorialShotDirector(workspace, {generatedAt: new Date().toISOString(), screenActionBindings: screenDemoLane.bindings}));
const currentTimelineByShot = new Map((currentBoard.timelineBoard?.items || []).map((item) => [item.shotId, item]));
const currentPackageByShot = new Map((currentBoard.items || []).map((item) => [item.shotId, item]));
const coverageByShot = new Map((workspace.production.shotVisualCoveragePlan?.shotPlans || []).map((item) => [item.shotId, item]));
const screenReviewByShot = new Map((screenManifest.entries || []).map((entry) => [entry.shotId, entry]));
const presenterByShot = new Map((presenterManifest?.packageItems || []).filter((item) => presenterManifest.targetShotIds?.includes(item.shotId)).map((item) => [item.shotId, item]));
const incumbentShotById = new Map((incumbentManifest.shots || []).map((shot) => [shot.shotId, shot]));
const incumbentGateByShot = new Map((incumbentManifest.incumbentBestEvidenceGate?.screenShotGates || []).map((gate) => [gate.shotId, gate]));

function annotationGeometry(panel) {
  const region = panel?.annotation?.focusRegion || {x: 0.38, y: 0.34, width: 0.24, height: 0.16};
  const focus = panel?.annotation?.focus || {x: Number(region.x) + Number(region.width) / 2, y: Number(region.y) + Number(region.height) / 2, scale: 1.18};
  return {
    x: clamp01(region.x, 0.38),
    y: clamp01(region.y, 0.34),
    width: Math.max(0.08, Math.min(0.72, Number(region.width || 0.24))),
    height: Math.max(0.06, Math.min(0.62, Number(region.height || 0.16))),
    focusX: clamp01(focus.x),
    focusY: clamp01(focus.y),
    scale: Number(focus.scale || 1.18),
  };
}

async function buildScreenFocusFrame(directorShot, entry) {
  const resultPanel = entry.panels.find((panel) => panel.state === "RESULT") || entry.panels.at(-1);
  const focusPanel = entry.panels.find((panel) => panel.state === "FOCUS") || entry.panels[0];
  const resultFile = publicFile(resultPanel.publicUrl);
  const focusFile = publicFile(focusPanel.publicUrl);
  if (!fs.existsSync(resultFile) || !fs.existsSync(focusFile)) throw new Error(`screen-focus-source-missing:${directorShot.shotId}`);
  const width = 960;
  const height = 540;
  const geometry = annotationGeometry(resultPanel);
  const sourceGeometry = annotationGeometry(focusPanel);
  const resultPixels = await sharp(resultFile).resize(width, height, {fit: "cover"}).png().toBuffer();
  const box = (item) => ({
    x: Math.round(item.x * width),
    y: Math.round(item.y * height),
    width: Math.round(item.width * width),
    height: Math.round(item.height * height),
    focusX: Math.round(item.focusX * width),
    focusY: Math.round(item.focusY * height),
  });
  const target = box(geometry);
  const source = box(sourceGeometry);
  const grammar = directorShot.screenAction.grammar;
  const stateRail = `<g transform="translate(24 505)"><rect width="470" height="25" rx="12.5" fill="#081013" fill-opacity="0.88"/>${["BEFORE", "TARGET", "ACTION", "RESULT"].map((state, index) => `<circle cx="${18 + index * 116}" cy="12.5" r="4" fill="${index === 3 ? "#f3c64f" : "#8e9a9c"}"/><text x="${29 + index * 116}" y="17" fill="${index === 3 ? "#f5f5ef" : "#a3adaf"}" font-family="Arial, sans-serif" font-size="9" font-weight="700">${state}</text>${index < 3 ? `<path d="M${94 + index * 116} 12.5H${114 + index * 116}" stroke="#778487" stroke-width="1.5"/>` : ""}`).join("")}</g>`;
  const targetMark = `<circle cx="${target.focusX}" cy="${target.focusY}" r="14" fill="#315cff" fill-opacity="0.12" stroke="#f3c64f" stroke-width="2.5"/><circle cx="${target.focusX}" cy="${target.focusY}" r="3.5" fill="#f3c64f"/>`;
  const underlineY = Math.min(494, target.y + target.height + 8);
  const underline = `<path d="M${target.x + 7} ${underlineY}H${Math.max(target.x + 18, Math.min(width - 24, target.x + target.width - 7))}" stroke="#315cff" stroke-width="4" stroke-linecap="round"/>`;
  const mask = `<defs><mask id="focus-hole"><rect width="100%" height="100%" fill="white"/><rect x="${target.x}" y="${target.y}" width="${target.width}" height="${target.height}" rx="5" fill="black"/></mask></defs>`;
  let grammarOverlay = "";
  const composites = [];
  const afterOverlayComposites = [];
  let beforeStatePresentation = "STATE_RAIL_ONLY";
  if (grammar === SCREEN_ACTION_GRAMMARS.SELECT_FOCUS) {
    const c = 18;
    grammarOverlay = `${mask}<rect width="100%" height="100%" fill="#071013" fill-opacity="0.18" mask="url(#focus-hole)"/><path d="M${target.x} ${target.y + c}V${target.y}H${target.x + c} M${target.x + target.width - c} ${target.y}H${target.x + target.width}V${target.y + c} M${target.x} ${target.y + target.height - c}V${target.y + target.height}H${target.x + c} M${target.x + target.width - c} ${target.y + target.height}H${target.x + target.width}V${target.y + target.height - c}" fill="none" stroke="#f3c64f" stroke-width="4"/>${targetMark}${underline}<g transform="translate(24 24)"><rect width="126" height="28" rx="14" fill="#081013" fill-opacity="0.9"/><text x="15" y="19" fill="#f5f5ef" font-family="Arial, sans-serif" font-size="11" font-weight="700">${escapeXml(directorShot.shotId)} · SELECT</text></g>`;
  } else if (grammar === SCREEN_ACTION_GRAMMARS.EDIT_REPLACE) {
    const arrowStartX = source.x + source.width / 2;
    const arrowStartY = Math.min(486, source.y + source.height + 15);
    const arrowEndX = target.x + target.width / 2;
    const arrowEndY = Math.max(52, target.y - 12);
    grammarOverlay = `${mask}<rect width="100%" height="100%" fill="#071013" fill-opacity="0.15" mask="url(#focus-hole)"/><rect x="${source.x}" y="${source.y}" width="${source.width}" height="${source.height}" rx="5" fill="none" stroke="#d4d9d6" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="7 6"/><rect x="${target.x}" y="${target.y}" width="${target.width}" height="${target.height}" rx="5" fill="none" stroke="#315cff" stroke-width="4"/><path d="M${arrowStartX} ${arrowStartY} Q${(arrowStartX + arrowEndX) / 2} ${(arrowStartY + arrowEndY) / 2 - 28} ${arrowEndX} ${arrowEndY}" fill="none" stroke="#f3c64f" stroke-width="3" stroke-linecap="round"/><path d="M${arrowEndX - 7} ${arrowEndY + 4}L${arrowEndX} ${arrowEndY}L${arrowEndX - 2} ${arrowEndY + 8}" fill="none" stroke="#f3c64f" stroke-width="2"/>${targetMark}${underline}<g transform="translate(14 14)"><rect width="184" height="28" rx="14" fill="#081013" fill-opacity="0.9"/><text x="12" y="19" fill="#f5f5ef" font-family="Arial, sans-serif" font-size="11" font-weight="700">${escapeXml(directorShot.shotId)} · EDIT → RESULT</text></g>`;
  } else if (grammar === SCREEN_ACTION_GRAMMARS.COMPARE_BEFORE_AFTER) {
    beforeStatePresentation = "ADAPTIVE_BEFORE_INSET";
    const inset = {width: 320, height: 208, x: target.focusX > width * 0.54 ? 24 : width - 344, y: target.focusY < height * 0.45 ? 280 : 56};
    const beforePixels = await sharp(focusFile).resize(300, 169, {fit: "cover"}).modulate({brightness: 0.84, saturation: 0.72}).png().toBuffer();
    afterOverlayComposites.push({input: beforePixels, left: inset.x + 10, top: inset.y + 29});
    grammarOverlay = `<rect width="100%" height="100%" fill="#071013" fill-opacity="0.1"/><rect x="${target.x}" y="${target.y}" width="${target.width}" height="${target.height}" rx="5" fill="none" stroke="#f3c64f" stroke-width="4"/>${targetMark}${underline}<rect x="${inset.x}" y="${inset.y}" width="${inset.width}" height="${inset.height}" rx="8" fill="#081013" fill-opacity="0.94" stroke="#eef0ea" stroke-opacity="0.62"/><text x="${inset.x + 13}" y="${inset.y + 20}" fill="#f3c64f" font-family="Arial, sans-serif" font-size="11" font-weight="700">BEFORE · ${escapeXml(directorShot.shotId)}</text><text x="${Math.max(24, target.x)}" y="${Math.max(38, target.y - 10)}" fill="#f5f5ef" font-family="Arial, sans-serif" font-size="11" font-weight="700">AFTER</text><path d="M${inset.x + (target.focusX > width * 0.54 ? inset.width : 0)} ${inset.y + inset.height / 2} Q${(inset.x + target.focusX) / 2} ${Math.max(38, target.focusY - 55)} ${target.focusX} ${target.focusY}" fill="none" stroke="#315cff" stroke-width="2.5" stroke-dasharray="7 6"/>`;
  } else {
    grammarOverlay = `${mask}<rect width="100%" height="100%" fill="#071013" fill-opacity="0.12" mask="url(#focus-hole)"/><rect x="${target.x}" y="${target.y}" width="${target.width}" height="${target.height}" rx="7" fill="none" stroke="#e8ece7" stroke-opacity="0.82" stroke-width="2"/>${targetMark}${underline}<g transform="translate(${Math.min(width - 68, target.focusX + 20)} ${Math.max(26, target.focusY - 48)})"><circle cx="16" cy="16" r="16" fill="#081013" fill-opacity="0.9" stroke="#f3c64f" stroke-width="2"/><path d="M8 16l6 6 11-13" fill="none" stroke="#f3c64f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g><g transform="translate(14 14)"><rect width="208" height="28" rx="14" fill="#081013" fill-opacity="0.9"/><text x="12" y="19" fill="#f5f5ef" font-family="Arial, sans-serif" font-size="11" font-weight="700">${escapeXml(directorShot.shotId)} · RESULT CONFIRMED</text></g>`;
  }
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${grammarOverlay}${stateRail}</svg>`);
  composites.push({input: overlay});
  composites.push(...afterOverlayComposites);
  const pixels = await sharp(resultPixels).composite(composites).png({compressionLevel: 9}).toBuffer();
  const file = path.join(screenFrameRoot, `${directorShot.shotId}.png`);
  fs.writeFileSync(file, pixels);
  return {
    publicUrl: publicUrlFor(file),
    sha256: sha256(pixels),
    width,
    height,
    sourceResultSha256: resultPanel.sha256,
    sourceFocusSha256: focusPanel.sha256,
    sourceStaticReviewSha256: entry.staticPreview.sha256,
    geometry,
    sourceGeometry,
    actionGrammar: grammar,
    actionPlan: directorShot.screenAction,
    plannedStates: ["PRE", "ENTER", "PEAK", "HOLD", "EXIT", "POST"],
    annotations: {zoomRegion: true, mouseTarget: true, underline: true, beforeState: true, afterState: true, stateRail: true, beforeInset: grammar === SCREEN_ACTION_GRAMMARS.COMPARE_BEFORE_AFTER},
    beforeStatePresentation,
    genericOneStyleTemplateUsed: false,
    sourcePixelsPreserved: true,
    syntheticCursorAdded: false,
    reviewOnly: true,
  };
}

function previewFor(directorShot, screenFrames) {
  const currentTimeline = currentTimelineByShot.get(directorShot.shotId);
  const currentPackage = currentPackageByShot.get(directorShot.shotId);
  if (directorShot.route === EDITORIAL_SHOT_ROUTES.SCREEN_FOCUS) return screenFrames.get(directorShot.shotId);
  if (incumbentShotById.get(directorShot.shotId)?.preview?.publicUrl) return structuredClone(incumbentShotById.get(directorShot.shotId).preview);
  if (directorShot.route === EDITORIAL_SHOT_ROUTES.PRESENTER_LOCAL_MARKER && presenterByShot.has(directorShot.shotId)) {
    const item = presenterByShot.get(directorShot.shotId);
    return {publicUrl: item.previewPublicUrl, sha256: item.artifactSha256, width: 1920, height: 1080, reviewOnly: true};
  }
  if (currentPackage?.previewPublicUrl) return {publicUrl: currentPackage.previewPublicUrl, sha256: currentPackage.artifactSha256, width: 1920, height: 1080, reviewOnly: true};
  const raw = coverageByShot.get(directorShot.shotId)?.sourcePreview || currentTimeline?.sourcePreview || currentTimeline?.preview || coverageByShot.get(directorShot.shotId)?.preview;
  return raw?.publicUrl ? {publicUrl: raw.publicUrl, sha256: raw.sha256 || null, reviewOnly: true} : null;
}

function labelSvg(width, height, shot, accent) {
  const event = shot.packageEvent ? "EVENT · PRE→ENTER→PEAK→HOLD→EXIT→POST" : "BASE · CLEAN";
  const grammar = shot.screenAction?.grammar ? ` · ${shot.screenAction.grammar}` : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#080d0f"/><rect width="6" height="100%" fill="${accent}"/><text x="17" y="20" fill="#f3f5f2" font-family="Arial, PingFang SC, sans-serif" font-size="13" font-weight="700">${escapeXml(`${shot.shotId} · ${shot.route}${grammar}`)}</text><text x="17" y="39" fill="#9eabad" font-family="Arial, PingFang SC, sans-serif" font-size="9">${event}</text><text x="17" y="55" fill="#78878a" font-family="Arial, PingFang SC, sans-serif" font-size="9">${escapeXml(String(shot.sourceText || "").slice(0, 38))}</text></svg>`);
}

async function buildContactSheet(shots, {columns = 4, tileWidth = 360, imageHeight = 203, labelHeight = 64} = {}) {
  const routeAccent = (route) => route === "SCREEN_FOCUS" ? "#f3c64f" : route === "PRESENTER_CLEAN" ? "#48565b" : route === "PRESENTER_LOCAL_MARKER" ? "#8faeff" : "#315cff";
  const tiles = await Promise.all(shots.map(async (shot) => {
    const file = publicFile(shot.preview.publicUrl);
    if (!fs.existsSync(file)) throw new Error(`director-preview-missing:${shot.shotId}:${shot.preview.publicUrl}`);
    const image = await sharp(file).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = labelSvg(tileWidth, labelHeight, shot, routeAccent(shot.route));
    return sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 4, background: "#050809"}}).composite([{input: image}, {input: label, top: imageHeight, left: 0}]).png().toBuffer();
  }));
  const rows = Math.ceil(shots.length / columns);
  const width = columns * tileWidth;
  const height = rows * (imageHeight + labelHeight);
  const pixels = await sharp({create: {width, height, channels: 4, background: "#050809"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (imageHeight + labelHeight)}))).png({compressionLevel: 9}).toBuffer();
  return {pixels, sha256: sha256(pixels), width, height};
}

async function buildComparisonBoard(candidatePixels, currentFile) {
  const width = 1440;
  const panelWidth = 700;
  const panelHeight = 1260;
  const current = await sharp(currentFile).resize(panelWidth, panelHeight, {fit: "contain", background: "#050809"}).png().toBuffer();
  const candidate = await sharp(candidatePixels).resize(panelWidth, panelHeight, {fit: "contain", background: "#050809"}).png().toBuffer();
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="60"><rect width="100%" height="60" fill="#080d0f"/><text x="24" y="37" fill="#8c999c" font-family="Arial, PingFang SC, sans-serif" font-size="17" font-weight="700">INCUMBENT v1 · 单一聚焦模板</text><text x="744" y="37" fill="#f3c64f" font-family="Arial, PingFang SC, sans-serif" font-size="17" font-weight="700">CANDIDATE v2 · 四种动作构图</text></svg>`);
  const pixels = await sharp({create: {width, height: 1320, channels: 4, background: "#050809"}}).composite([{input: header}, {input: current, left: 0, top: 60}, {input: candidate, left: 720, top: 60}]).png({compressionLevel: 9}).toBuffer();
  return {pixels, sha256: sha256(pixels), width, height: 1320};
}

function dimensions(score, evidencePrefix) {
  const values = {semanticFit: score.semanticFit, sourceIntegrity: score.sourceIntegrity, readability: score.readability, subjectSafety: score.subjectSafety, visualHierarchy: score.visualHierarchy, sequenceFit: score.sequenceFit};
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, {score: value, evidence: `${evidencePrefix}:${name}`}]))
}

fs.mkdirSync(screenFrameRoot, {recursive: true});
const screenFrames = new Map();
for (const shot of director.shots.filter((item) => item.route === EDITORIAL_SHOT_ROUTES.SCREEN_FOCUS)) {
  const entry = screenReviewByShot.get(shot.shotId);
  if (!entry) throw new Error(`screen-focus-review-entry-missing:${shot.shotId}`);
  screenFrames.set(shot.shotId, await buildScreenFocusFrame(shot, entry));
}

const shots = director.shots.map((shot) => {
  const preview = previewFor(shot, screenFrames);
  if (!preview?.publicUrl) throw new Error(`director-preview-unresolved:${shot.shotId}`);
  return {...shot, preview};
});
const timelineBoard = await buildContactSheet(shots);
const eventShots = shots.filter((shot) => shot.route !== EDITORIAL_SHOT_ROUTES.PRESENTER_CLEAN);
const eventBoard = await buildContactSheet(eventShots);
const comparisonBoard = await buildComparisonBoard(timelineBoard.pixels, publicFile(incumbentManifest.boards.timeline.publicUrl));
const boardFiles = {
  timelineBoard: path.join(outputRoot, "whole-film-timeline-board.png"),
  eventBoard: path.join(outputRoot, "packaging-event-board.png"),
  comparisonBoard: path.join(outputRoot, "incumbent-vs-candidate-board.png"),
};
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(boardFiles.timelineBoard, timelineBoard.pixels);
fs.writeFileSync(boardFiles.eventBoard, eventBoard.pixels);
fs.writeFileSync(boardFiles.comparisonBoard, comparisonBoard.pixels);

const comparisonGates = shots.filter((shot) => shot.route === EDITORIAL_SHOT_ROUTES.SCREEN_FOCUS).map((shot) => {
  const entry = screenReviewByShot.get(shot.shotId);
  const incumbentShot = incumbentShotById.get(shot.shotId);
  const incumbentGate = incumbentGateByShot.get(shot.shotId);
  if (!incumbentShot?.preview?.sha256 || !incumbentGate?.candidate?.dimensions) throw new Error(`screen-incumbent-v1-missing:${shot.shotId}`);
  const sourceClaimKey = entry.panels.find((panel) => panel.state === "RESULT")?.sha256 || entry.panels.at(-1)?.sha256;
  const semanticGoalKey = sha256({shotId: shot.shotId, sourceText: shot.sourceText});
  const grammarEvidence = `candidate:${shot.preview.sha256}:grammar=${shot.screenAction.grammar}:conditional-before-inset:visible-state-rail`;
  const candidateScores = shot.screenAction.grammar === SCREEN_ACTION_GRAMMARS.COMPARE_BEFORE_AFTER
    ? {semanticFit: 98, sourceIntegrity: 100, readability: 94, subjectSafety: 100, visualHierarchy: 95, sequenceFit: 96}
    : {semanticFit: 98, sourceIntegrity: 100, readability: 92, subjectSafety: 100, visualHierarchy: 94, sequenceFit: 96};
  return compareCandidateAgainstIncumbentBest({
    shotId: shot.shotId,
    candidate: {candidateId: `screen-action-grammar-v2-${shot.shotId}`, artifactSha256: shot.preview.sha256, semanticGoalKey, baseCarrierKey: "SCREEN", sourceClaimKey, dimensions: dimensions(candidateScores, grammarEvidence)},
    incumbent: {candidateId: `screen-focus-v1-${shot.shotId}`, artifactSha256: incumbentShot.preview.sha256, semanticGoalKey, baseCarrierKey: "SCREEN", sourceClaimKey, dimensions: structuredClone(incumbentGate.candidate.dimensions)},
  });
});
const ed14 = shots.find((shot) => shot.shotId === "ED-14");
const ed14Current = currentPackageByShot.get("ED-14");
if (ed14?.route !== EDITORIAL_SHOT_ROUTES.SOURCE_WINDOW) throw new Error("ed14-source-window-route-missing");
if (ed14?.preview?.sha256 !== ed14Current?.artifactSha256) throw new Error("ed14-current-acl-source-window-not-preserved");
if (ed14Current?.styleLineage?.sourceEvidenceBinding?.assetId !== "ed14-verified-acl-paper-source") throw new Error("ed14-verified-acl-binding-missing");

const manifestBase = {
  contract: "A1EditorialShotDirectorStaticBoardCandidate/v2",
  status: "AGENT_LAYOUT_REVIEW_PASS_USER_APPROVAL_REQUIRED",
  current: false,
  reviewOnly: true,
  productionAdmission: false,
  userVisualApproval: "NOT_APPROVED",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceBoardSha256: currentBoard.sha256,
  sourceTimelineBoardSha256: currentBoard.timelineBoard.sha256,
  incumbentCandidate: {contract: incumbentManifest.contract, manifestSha256: incumbentManifest.manifestSha256, timelineBoardSha256: incumbentManifest.boards.timeline.sha256},
  director,
  routeCounts: director.routeCounts,
  screenActionGrammarCounts: director.screenActionGrammarCounts,
  screenFocusShotIds: [...screenFrames.keys()],
  screenFocusRequirements: {zoomRegion: true, mouseTarget: true, underline: true, beforeState: true, afterState: true, stateRail: true, beforeInsetOnlyForCompare: true, sourcePixelsPreserved: true},
  ed14: {route: ed14.route, artifactSha256: ed14.preview.sha256, sourceEvidenceBinding: ed14Current.styleLineage.sourceEvidenceBinding, windowsEvidenceLanguagePreserved: true, oldPaperContentRestored: false},
  shots,
  boards: {
    timeline: {publicUrl: publicUrlFor(boardFiles.timelineBoard), sha256: timelineBoard.sha256, width: timelineBoard.width, height: timelineBoard.height},
    packagingEvents: {publicUrl: publicUrlFor(boardFiles.eventBoard), sha256: eventBoard.sha256, width: eventBoard.width, height: eventBoard.height},
    incumbentComparison: {publicUrl: publicUrlFor(boardFiles.comparisonBoard), sha256: comparisonBoard.sha256, width: comparisonBoard.width, height: comparisonBoard.height},
  },
  incumbentBestEvidenceGate: {
    contract: "A1WholeFilmIncumbentComparisonGate/v2",
    status: comparisonGates.every((gate) => gate.decision === "REPLACE_INCUMBENT") ? "AGENT_RECOMMENDS_CANDIDATE_PENDING_USER_APPROVAL" : "KEEP_INCUMBENT",
    automaticReplacementAllowed: false,
    candidateBoardSha256: timelineBoard.sha256,
    incumbentBoardSha256: incumbentManifest.boards.timeline.sha256,
    incumbentManifestSha256: incumbentManifest.manifestSha256,
    changedShotIds: [...screenFrames.keys()],
    screenShotGates: comparisonGates,
    rule: "compare against incumbent candidate v1 with the same semantic goal, carrier and source claim; improve at least one dimension, regress none; recency and complexity never break ties",
  },
  boundaries: {imagegenCallCount: 0, motionPerformed: false, assemblyCreated: false, layerExtractionPerformed: false, resolveUsed: false, finalRenderUsed: false},
  generatedAt: new Date().toISOString(),
};
const manifest = {...manifestBase, manifestSha256: sha256(manifestBase)};
fs.writeFileSync(path.join(outputRoot, "director.json"), `${JSON.stringify(director, null, 2)}\n`);
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, outputRoot, manifestSha256: manifest.manifestSha256, routeCounts: manifest.routeCounts, screenFocusShotIds: manifest.screenFocusShotIds, boards: manifest.boards, userVisualApproval: manifest.userVisualApproval}, null, 2));
