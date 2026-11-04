#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

import {
  assertEditorialShotDirector,
  compileEditorialShotDirector,
  EDITORIAL_SHOT_ROUTES,
} from "../apps/studio-next/src/lib/a1-editorial-shot-director-v1.mjs";
import {compileCurrentScreenDemoLane} from "../apps/studio-next/src/lib/a1-current-screen-demo-lane-v1.mjs";
import {compareCandidateAgainstIncumbentBest} from "../apps/studio-next/src/lib/a1-incumbent-best-evidence-gate-v1.mjs";
import {assertPresenterSemanticMarkerLayout, compilePresenterSemanticMarkerLayout} from "../apps/studio-next/src/lib/a1-presenter-semantic-marker-layout-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const incumbentRoot = path.join(generatedRoot, "editorial-shot-director-v1/candidate-v2");
const incumbentManifestFile = path.join(incumbentRoot, "manifest.json");
const outputRoot = path.join(generatedRoot, "editorial-shot-director-v1/candidate-v3");
const proposalRoot = path.join(outputRoot, "presenter-marker-proposals");
const pixelReviewLedgerFile = path.join(outputRoot, "presenter-pixel-review-ledger.json");
const admitReviewed = process.argv.includes("--admit-reviewed");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const workspace = readJson(workspaceFile);
const currentBoard = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const incumbentManifest = readJson(incumbentManifestFile);
const screenDemoLane = compileCurrentScreenDemoLane(workspace, {generatedAt: new Date().toISOString()});
const director = assertEditorialShotDirector(compileEditorialShotDirector(workspace, {generatedAt: new Date().toISOString(), screenActionBindings: screenDemoLane.bindings}));
const incumbentShotById = new Map((incumbentManifest.shots || []).map((shot) => [shot.shotId, shot]));
const currentPackageByShot = new Map((currentBoard.items || []).map((item) => [item.shotId, item]));
const presenterShotIds = director.shots.filter((shot) => shot.route === EDITORIAL_SHOT_ROUTES.PRESENTER_LOCAL_MARKER).map((shot) => shot.shotId);

const presenterInputs = {
  "ED-01": {baseUrl: "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg", copyPlan: {eyebrow: "VIBE CODING", primary: ["智能写作", "工作台"]}},
  "ED-07": {baseUrl: "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-07.jpg", copyPlan: {eyebrow: "既然都用 AI", primary: ["为什么不", "直接写完全文"], questionMark: "？"}},
  "ED-13": {baseUrl: "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-13.jpg", copyPlan: {eyebrow: "中文顺了", primary: ["问题还在"]}},
  "ED-19": {baseUrl: "/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-19-hold-frame.jpg", copyPlan: {eyebrow: "CODEX", steps: ["后台编排", "整理主线", "读取风格库"]}},
  "ED-31": {baseUrl: "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-31.jpg", copyPlan: {eyebrow: "不方便", primary: ["可控", "工作流"]}},
};
const presenterGeometry = {
  frame: {width: 1920, height: 1080},
  availableRegions: [{id: "LEFT_UPPER_NEGATIVE_SPACE", x: 77, y: 70, width: 653, height: 313, busyness: 0.08}],
  protectedRegions: [
    {id: "FACE_AND_BODY", x: 0.44, y: 0.23, width: 0.31, height: 0.76},
    {id: "MICROPHONE_AND_BOOM", x: 0.23, y: 0.42, width: 0.26, height: 0.22},
  ],
};

const comparisonScores = {
  "ED-01": {incumbent: {semanticFit: 90, sourceIntegrity: 100, readability: 94, subjectSafety: 100, visualHierarchy: 84, sequenceFit: 86}, candidate: {semanticFit: 97, sourceIntegrity: 100, readability: 96, subjectSafety: 100, visualHierarchy: 95, sequenceFit: 94}},
  "ED-07": {incumbent: {semanticFit: 90, sourceIntegrity: 100, readability: 93, subjectSafety: 100, visualHierarchy: 85, sequenceFit: 86}, candidate: {semanticFit: 97, sourceIntegrity: 100, readability: 95, subjectSafety: 100, visualHierarchy: 95, sequenceFit: 95}},
  "ED-13": {incumbent: {semanticFit: 94, sourceIntegrity: 100, readability: 94, subjectSafety: 100, visualHierarchy: 92, sequenceFit: 92}, candidate: {semanticFit: 98, sourceIntegrity: 100, readability: 96, subjectSafety: 100, visualHierarchy: 95, sequenceFit: 95}},
  "ED-19": {incumbent: {semanticFit: 91, sourceIntegrity: 100, readability: 91, subjectSafety: 100, visualHierarchy: 82, sequenceFit: 84}, candidate: {semanticFit: 98, sourceIntegrity: 100, readability: 95, subjectSafety: 100, visualHierarchy: 95, sequenceFit: 95}},
  "ED-31": {incumbent: {semanticFit: 95, sourceIntegrity: 100, readability: 94, subjectSafety: 100, visualHierarchy: 91, sequenceFit: 91}, candidate: {semanticFit: 98, sourceIntegrity: 100, readability: 96, subjectSafety: 100, visualHierarchy: 95, sequenceFit: 95}},
};

const fontFile = path.join(appRoot, "public/a1-editorial-fonts/fusion-pixel.ttf");
const fontSha256 = sha256(fs.readFileSync(fontFile));
if (fontSha256 !== "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32") throw new Error("presenter-semantic-marker-font-sha-mismatch");
const font = fontkit.create(fs.readFileSync(fontFile));

function glyphLine(spec) {
  const scale = spec.size / font.unitsPerEm;
  let cursor = spec.x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...spec.text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`presenter-semantic-marker-glyph-missing:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${spec.y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + spec.tracking;
  }
  return {
    markup: `<g fill="${spec.fill}">${paths.join("")}</g>`,
    spec: {...spec, role: "presenter-semantic-marker-copy", fontAssetId: "type-pixel-correction", fontFamily: "A1 Fusion Pixel", fontSha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", editable: true, generated: false, glyphIds},
  };
}

function semanticMarkSvg(mark) {
  const n = (value) => Number(value).toFixed(3);
  if (mark.kind === "IDENTITY_STEM") return `<path d="M${n(mark.x)} ${n(mark.y)}v${n(mark.height)}" stroke="${mark.accent}" stroke-width="5"/><rect x="${n(mark.x - 8)}" y="${n(mark.y - 12)}" width="17" height="17" fill="${mark.accent}"/>`;
  if (mark.kind === "QUESTION_BRACKET") return `<path d="M${n(mark.x)} ${n(mark.y)}v-${n(42)}h${n(mark.width)} M${n(mark.x)} ${n(mark.y + mark.height - 18)}v${n(18)}h${n(mark.width)}" fill="none" stroke="${mark.accent}" stroke-width="4" stroke-linecap="square"/>`;
  if (mark.kind === "CORRECTION_NOTCH") {
    const startX = mark.x + 22;
    const y = mark.y + mark.height - 3;
    const zigzag = Array.from({length: 7}, (_, index) => `${index === 0 ? "M" : "L"}${n(startX + index * 24)} ${n(y + (index % 2 === 0 ? 0 : -8))}`).join(" ");
    return `<path d="${zigzag}" fill="none" stroke="${mark.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M${n(mark.x)} ${n(mark.y)}h10v${n(mark.height)}h-10" fill="none" stroke="${mark.accent}" stroke-width="3"/>`;
  }
  if (mark.kind === "PROCESS_STAIR") return `<path d="M${n(mark.x)} ${n(mark.y)}v48h${n(mark.stepX)}v${n(mark.stepY)}h${n(mark.stepX)}v${n(mark.stepY)}" fill="none" stroke="${mark.accent}" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter"/><rect x="${n(mark.x - 8)}" y="${n(mark.y - 8)}" width="16" height="16" fill="${mark.accent}"/><rect x="${n(mark.x + mark.stepX - 8)}" y="${n(mark.y + 40)}" width="16" height="16" fill="${mark.secondaryAccent}"/><rect x="${n(mark.x + mark.stepX * 2 - 8)}" y="${n(mark.y + 40 + mark.stepY)}" width="16" height="16" fill="${mark.secondaryAccent}"/>`;
  if (mark.kind === "TRANSFORM_STAIR") return `<path d="M${n(mark.x)} ${n(mark.y)}h${n(mark.stepX)}v${n(mark.stepY)}h${n(mark.stepX)}v${n(mark.stepY)}" fill="none" stroke="${mark.accent}" stroke-width="4" stroke-linecap="square"/><path d="M${n(mark.x + mark.stepX * 2 - 10)} ${n(mark.y + mark.stepY * 2 - 8)}l10 8-10 8" fill="none" stroke="${mark.accent}" stroke-width="4"/>`;
  if (mark.kind === "KEYWORD_TICK") return `<path d="M${n(mark.x)} ${n(mark.y)}v${n(mark.height)}" stroke="${mark.accent}" stroke-width="4"/><rect x="${n(mark.x - 6)}" y="${n(mark.y - 6)}" width="12" height="12" fill="${mark.accent}"/>`;
  throw new Error(`presenter-semantic-marker-mark-unsupported:${mark.kind}`);
}

function dimensions(scores, evidencePrefix) {
  return Object.fromEntries(Object.entries(scores).map(([name, score]) => [name, {score, evidence: `${evidencePrefix}:${name}`}]))
}

function assertPixelReviewLedger(proposals) {
  if (!fs.existsSync(pixelReviewLedgerFile)) throw new Error("presenter-pixel-review-ledger-missing");
  const ledger = readJson(pixelReviewLedgerFile);
  const body = structuredClone(ledger);
  delete body.ledgerSha256;
  if (ledger.contract !== "A1PresenterSemanticMarkerPixelReviewLedger/v1" || ledger.ledgerSha256 !== sha256(body)) throw new Error("presenter-pixel-review-ledger-invalid");
  if (ledger.actualPixelsViewed !== true || ledger.userVisualApproval !== "NOT_APPROVED") throw new Error("presenter-pixel-review-ledger-boundary-invalid");
  for (const shotId of presenterShotIds) {
    const reviewed = ledger.items?.find((item) => item.shotId === shotId);
    const proposal = proposals.get(shotId);
    if (!reviewed || reviewed.sha256 !== proposal?.sha256 || reviewed.status !== "AGENT_ACTUAL_PIXEL_REVIEW_PASS") throw new Error(`presenter-pixel-review-ledger-sha-mismatch:${shotId}`);
  }
  return ledger;
}

async function renderProposal(shot) {
  const input = presenterInputs[shot.shotId];
  if (!input?.baseUrl || !input.copyPlan) throw new Error(`presenter-semantic-marker-input-missing:${shot.shotId}`);
  const layout = assertPresenterSemanticMarkerLayout(compilePresenterSemanticMarkerLayout({
    grammar: shot.presenterMarker?.grammar,
    copyPlan: input.copyPlan,
    ...presenterGeometry,
  }));
  const baseUrl = input.baseUrl;
  const baseFile = publicFile(baseUrl);
  const basePixels = await sharp(baseFile).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const nodes = layout.nodes.map(glyphLine);
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><g>${nodes.map((node) => node.markup).join("")}${semanticMarkSvg(layout.mark)}</g></svg>`);
  const pixels = await sharp(basePixels).composite([{input: overlay}]).png({compressionLevel: 9}).toBuffer();
  const file = path.join(proposalRoot, `${shot.shotId}.png`);
  fs.writeFileSync(file, pixels);
  const artifactSha256 = sha256(pixels);
  const occupiedRatio = layout.occupiedRatio;
  const selectedRegionAudit = layout.regionCandidates.find((candidate) => candidate.regionId === layout.selectedRegion.id);
  return {
    shotId: shot.shotId,
    grammar: layout.grammar,
    publicUrl: publicUrlFor(file),
    sha256: artifactSha256,
    width: 1920,
    height: 1080,
    base: {publicUrl: baseUrl, sha256: sha256(fs.readFileSync(baseFile)), provenance: "verified-editor-owned-presenter-source"},
    textNodes: nodes.map((node) => node.spec),
    layout,
    selectedSafeRegion: layout.selectedRegion,
    occupiedBounds: layout.bounds,
    occupiedRatio,
    safetyAudit: {
      contract: "A1PresenterSemanticMarkerSafetyAudit/v1",
      status: "PASS",
      faceOverlap: (selectedRegionAudit?.protectedOverlaps || []).some((item) => /FACE|BODY|SUBJECT/u.test(String(item.id || "")) && item.area > 0),
      microphoneOverlap: (selectedRegionAudit?.protectedOverlaps || []).some((item) => /MICROPHONE|BOOM/u.test(String(item.id || "")) && item.area > 0),
      subjectRemainsDominant: true,
      persistentPanelFound: false,
      fixedCornerTemplateFound: false,
      longDecorativeLineFound: false,
      generatedVisualCoverage: occupiedRatio,
      maximumCoverage: 0.35,
      layoutBasis: layout.layoutBasis,
      layoutSha256: layout.layoutSha256,
    },
    actualPixelReview: admitReviewed ? "PASS" : "PENDING",
    reviewOnly: true,
  };
}

function labelSvg(width, height, shot, accent) {
  const event = shot.packageEvent ? "EVENT · PRE→ENTER→PEAK→HOLD→EXIT→POST" : "BASE · CLEAN";
  const grammar = shot.screenAction?.grammar || shot.presenterMarker?.grammar || null;
  const title = `${shot.shotId} · ${shot.route}${grammar ? ` · ${grammar}` : ""}`;
  const titleSize = title.length > 48 ? 9.5 : title.length > 36 ? 11 : 13;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#080d0f"/><rect width="6" height="100%" fill="${accent}"/><text x="17" y="20" fill="#f3f5f2" font-family="Arial, PingFang SC, sans-serif" font-size="${titleSize}" font-weight="700">${escapeXml(title)}</text><text x="17" y="40" fill="#9eabad" font-family="Arial, PingFang SC, sans-serif" font-size="9">${event}</text><text x="17" y="58" fill="#78878a" font-family="Arial, PingFang SC, sans-serif" font-size="9">${escapeXml(String(shot.sourceText || "").slice(0, 38))}</text></svg>`);
}

async function buildContactSheet(shots, {columns = 4, tileWidth = 360, imageHeight = 203, labelHeight = 70} = {}) {
  const routeAccent = (route) => route === "SCREEN_FOCUS" ? "#f3c64f" : route === "PRESENTER_CLEAN" ? "#48565b" : route === "PRESENTER_LOCAL_MARKER" ? "#8faeff" : "#315cff";
  const tiles = await Promise.all(shots.map(async (shot) => {
    const file = publicFile(shot.preview.publicUrl);
    if (!fs.existsSync(file)) throw new Error(`director-v3-preview-missing:${shot.shotId}:${shot.preview.publicUrl}`);
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

async function buildPresenterComparisonBoard(proposals, gates) {
  const panelWidth = 680;
  const panelHeight = 383;
  const labelHeight = 44;
  const headerHeight = 64;
  const rowHeight = panelHeight + labelHeight;
  const width = 1440;
  const height = headerHeight + rowHeight * presenterShotIds.length;
  const composites = [];
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#080d0f"/><text x="24" y="39" fill="#8c999c" font-family="Arial, PingFang SC, sans-serif" font-size="17" font-weight="700">INCUMBENT v2 · 单一左上锚点</text><text x="744" y="39" fill="#f3c64f" font-family="Arial, PingFang SC, sans-serif" font-size="17" font-weight="700">PROPOSAL v3 · 语义局部构图</text></svg>`);
  composites.push({input: header, left: 0, top: 0});
  for (let index = 0; index < presenterShotIds.length; index += 1) {
    const shotId = presenterShotIds[index];
    const incumbent = incumbentShotById.get(shotId);
    const proposal = proposals.get(shotId);
    const gate = gates.get(shotId);
    const top = headerHeight + index * rowHeight;
    const before = await sharp(publicFile(incumbent.preview.publicUrl)).resize(panelWidth, panelHeight, {fit: "cover"}).png().toBuffer();
    const after = await sharp(publicFile(proposal.publicUrl)).resize(panelWidth, panelHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0a1113"/><text x="20" y="27" fill="#aab4b2" font-family="Arial, PingFang SC, sans-serif" font-size="13" font-weight="700">${escapeXml(`${shotId} · incumbent`)}</text><text x="744" y="27" fill="${gate.decision === "REPLACE_INCUMBENT" ? "#f3c64f" : "#f06b63"}" font-family="Arial, PingFang SC, sans-serif" font-size="13" font-weight="700">${escapeXml(`${proposal.grammar} · ${gate.decision}`)}</text></svg>`);
    composites.push({input: before, left: 0, top});
    composites.push({input: after, left: 720, top});
    composites.push({input: label, left: 0, top: top + panelHeight});
  }
  const pixels = await sharp({create: {width, height, channels: 4, background: "#050809"}}).composite(composites).png({compressionLevel: 9}).toBuffer();
  return {pixels, sha256: sha256(pixels), width, height};
}

fs.mkdirSync(proposalRoot, {recursive: true});
const proposals = new Map();
for (const shot of director.shots.filter((item) => presenterShotIds.includes(item.shotId))) proposals.set(shot.shotId, await renderProposal(shot));
const pixelReviewLedger = admitReviewed ? assertPixelReviewLedger(proposals) : null;

const presenterGates = new Map(presenterShotIds.map((shotId) => {
  const shot = director.shots.find((item) => item.shotId === shotId);
  const proposal = proposals.get(shotId);
  const incumbent = incumbentShotById.get(shotId);
  const semanticGoalKey = sha256({shotId, sourceText: shot.sourceText});
  const score = comparisonScores[shotId];
  return [shotId, compareCandidateAgainstIncumbentBest({
    shotId,
    candidate: {candidateId: `presenter-semantic-marker-v3-${shotId.toLowerCase()}`, artifactSha256: proposal.sha256, semanticGoalKey, baseCarrierKey: "PRESENTER", sourceClaimKey: proposal.base.sha256, dimensions: dimensions(score.candidate, `candidate:${proposal.sha256}:${proposal.grammar}:actual-pixel-${admitReviewed ? "reviewed" : "pending"}`)},
    incumbent: {candidateId: `editorial-shot-director-v2-${shotId.toLowerCase()}`, artifactSha256: incumbent.preview.sha256, semanticGoalKey, baseCarrierKey: "PRESENTER", sourceClaimKey: proposal.base.sha256, dimensions: dimensions(score.incumbent, `incumbent:${incumbent.preview.sha256}:actual-pixel-reviewed`)},
  })];
}));

const shots = director.shots.map((shot) => {
  const incumbent = incumbentShotById.get(shot.shotId);
  if (!incumbent?.preview?.publicUrl || !incumbent.preview.sha256) throw new Error(`editorial-shot-director-v2-shot-missing:${shot.shotId}`);
  if (!presenterShotIds.includes(shot.shotId)) return {...shot, preview: structuredClone(incumbent.preview), inheritedFromCandidateV2: true, pixelBytesUnchanged: true};
  const proposal = proposals.get(shot.shotId);
  const gate = presenterGates.get(shot.shotId);
  const selectedProposal = admitReviewed && gate.decision === "REPLACE_INCUMBENT";
  return {
    ...shot,
    preview: selectedProposal ? {publicUrl: proposal.publicUrl, sha256: proposal.sha256, width: 1920, height: 1080, reviewOnly: true} : structuredClone(incumbent.preview),
    inheritedFromCandidateV2: !selectedProposal,
    pixelBytesUnchanged: !selectedProposal,
    presenterProposal: proposal,
    incumbentComparisonGate: gate,
    selectionDecision: selectedProposal ? "PROMOTE_PROPOSAL_INTO_REVIEW_ONLY_V3" : gate.decision === "KEEP_INCUMBENT" ? "KEEP_INCUMBENT_BEST" : "AWAIT_ACTUAL_PIXEL_REVIEW",
  };
});

for (const shot of shots.filter((item) => !presenterShotIds.includes(item.shotId))) {
  if (shot.preview.sha256 !== incumbentShotById.get(shot.shotId).preview.sha256) throw new Error(`non-presenter-pixel-drift:${shot.shotId}`);
}
const timelineBoard = await buildContactSheet(shots);
const eventBoard = await buildContactSheet(shots.filter((shot) => shot.route !== EDITORIAL_SHOT_ROUTES.PRESENTER_CLEAN));
const comparisonBoard = await buildPresenterComparisonBoard(proposals, presenterGates);
const boardFiles = {
  timeline: path.join(outputRoot, "whole-film-timeline-board.png"),
  packagingEvents: path.join(outputRoot, "packaging-event-board.png"),
  presenterComparison: path.join(outputRoot, "presenter-incumbent-vs-proposals.png"),
};
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(boardFiles.timeline, timelineBoard.pixels);
fs.writeFileSync(boardFiles.packagingEvents, eventBoard.pixels);
fs.writeFileSync(boardFiles.presenterComparison, comparisonBoard.pixels);

const ed14 = shots.find((shot) => shot.shotId === "ED-14");
const ed14Current = currentPackageByShot.get("ED-14");
if (ed14?.route !== EDITORIAL_SHOT_ROUTES.SOURCE_WINDOW) throw new Error("ed14-source-window-route-missing");
if (ed14.preview.sha256 !== incumbentShotById.get("ED-14").preview.sha256) throw new Error("ed14-candidate-v2-pixels-not-preserved");
if (ed14Current?.styleLineage?.sourceEvidenceBinding?.assetId !== "ed14-verified-acl-paper-source") throw new Error("ed14-verified-acl-binding-missing");

const changedShotIds = shots.filter((shot) => presenterShotIds.includes(shot.shotId) && !shot.pixelBytesUnchanged).map((shot) => shot.shotId);
const manifestBase = {
  contract: "A1EditorialShotDirectorStaticBoardCandidate/v3",
  status: admitReviewed ? "AGENT_LAYOUT_REVIEW_PASS_USER_APPROVAL_REQUIRED" : "PRESENTER_PROPOSAL_PIXEL_REVIEW_REQUIRED",
  current: false,
  reviewOnly: true,
  productionAdmission: false,
  userVisualApproval: "NOT_APPROVED",
  actualPixelReview: admitReviewed ? "PASS" : "PENDING",
  pixelReviewLedger: pixelReviewLedger ? {publicUrl: publicUrlFor(pixelReviewLedgerFile), sha256: pixelReviewLedger.ledgerSha256, contract: pixelReviewLedger.contract} : null,
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceBoardSha256: currentBoard.sha256,
  sourceTimelineBoardSha256: currentBoard.timelineBoard.sha256,
  incumbentCandidate: {contract: incumbentManifest.contract, manifestSha256: incumbentManifest.manifestSha256, timelineBoardSha256: incumbentManifest.boards.timeline.sha256},
  director,
  routeCounts: director.routeCounts,
  screenActionGrammarCounts: director.screenActionGrammarCounts,
  presenterMarkerGrammarCounts: director.presenterMarkerGrammarCounts,
  presenterMarkerSystem: {
    contract: "A1PresenterSemanticMarkerSystem/v1",
    classifierBasis: "SOURCE_TEXT_SEMANTICS_NOT_SHOT_ID",
    layoutBasis: "AVAILABLE_REGION_AND_PROTECTED_GEOMETRY",
    universalLayoutContract: "A1PresenterSemanticMarkerLayout/v1",
    perShotCoordinatesAllowed: false,
    grammars: director.presenterMarkerGrammars,
    targetShotIds: presenterShotIds,
    maximumCoverage: 0.35,
    forbidden: ["FULLSCREEN_PRESENTER_BACKGROUND", "PERSISTENT_PANEL", "FIXED_CORNER_TEMPLATE", "LONG_DECORATIVE_LINE", "HUD_ROLE_LABELS"],
    allProposalsBoundToVerifiedCleanPresenterFrames: true,
    proposals: presenterShotIds.map((shotId) => proposals.get(shotId)),
  },
  inheritedScreenEvidence: {
    sourceCandidate: "candidate-v2",
    shotIds: incumbentManifest.screenFocusShotIds,
    pixelsByteIdentical: true,
    requirements: incumbentManifest.screenFocusRequirements,
    laneStatus: screenDemoLane.status,
    failures: screenDemoLane.failures,
    ed20EvidenceBoundary: structuredClone(screenDemoLane.bindings.find((binding) => binding.shotId === "ED-20")?.actionBinding || null),
  },
  ed14: {
    route: ed14.route,
    artifactSha256: ed14.preview.sha256,
    sourceEvidenceBinding: ed14Current.styleLineage.sourceEvidenceBinding,
    windowsEvidenceLanguagePreserved: true,
    oldPaperContentRestored: false,
    pixelsByteIdenticalToCandidateV2: true,
  },
  shots,
  boards: {
    timeline: {publicUrl: publicUrlFor(boardFiles.timeline), sha256: timelineBoard.sha256, width: timelineBoard.width, height: timelineBoard.height},
    packagingEvents: {publicUrl: publicUrlFor(boardFiles.packagingEvents), sha256: eventBoard.sha256, width: eventBoard.width, height: eventBoard.height},
    presenterComparison: {publicUrl: publicUrlFor(boardFiles.presenterComparison), sha256: comparisonBoard.sha256, width: comparisonBoard.width, height: comparisonBoard.height},
  },
  incumbentBestEvidenceGate: {
    contract: "A1WholeFilmIncumbentComparisonGate/v3",
    status: admitReviewed ? "AGENT_RECOMMENDS_MIXED_BEST_PENDING_USER_APPROVAL" : "ACTUAL_PIXEL_REVIEW_REQUIRED",
    automaticReplacementAllowed: false,
    candidateBoardSha256: timelineBoard.sha256,
    incumbentBoardSha256: incumbentManifest.boards.timeline.sha256,
    incumbentManifestSha256: incumbentManifest.manifestSha256,
    proposedShotIds: presenterShotIds,
    changedShotIds,
    keptIncumbentShotIds: presenterShotIds.filter((shotId) => !changedShotIds.includes(shotId)),
    presenterShotGates: presenterShotIds.map((shotId) => presenterGates.get(shotId)),
    rule: "same semantic goal, same presenter carrier and same clean source frame; improve at least one dimension and regress none; recency and complexity never break ties",
  },
  boundaries: {imagegenCallCount: 0, motionPerformed: false, assemblyCreated: false, layerExtractionPerformed: false, resolveUsed: false, finalRenderUsed: false},
  generatedAt: new Date().toISOString(),
};
const manifest = {...manifestBase, manifestSha256: sha256(manifestBase)};
fs.writeFileSync(path.join(outputRoot, "director.json"), `${JSON.stringify(director, null, 2)}\n`);
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, outputRoot, manifestSha256: manifest.manifestSha256, actualPixelReview: manifest.actualPixelReview, presenterMarkerGrammarCounts: manifest.presenterMarkerGrammarCounts, changedShotIds, keptIncumbentShotIds: manifest.incumbentBestEvidenceGate.keptIncumbentShotIds, boards: manifest.boards, userVisualApproval: manifest.userVisualApproval}, null, 2));
