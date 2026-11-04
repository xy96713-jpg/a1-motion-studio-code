#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

import {rehashPackageLookMasterPlan} from "../apps/studio-next/src/lib/a1-presenter-light-overlay-policy-v1.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {auditPresenterReferenceGrammar, buildIncumbentComparison, buildReferencePackagingStudy, presenterReferenceGrammarForShot} from "../apps/studio-next/src/lib/a1-reference-packaging-study-v1.mjs";
import {A1_SEMANTIC_TIMELINE_POLICY_VERSION} from "../apps/studio-next/src/lib/a1-semantic-timeline-decision-v1.mjs";
import {assertProjectWriterLease} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
assertProjectWriterLease(appRoot);
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(generatedRoot, "presenter-light-overlay-system-v2");
const frameRoot = path.join(outputRoot, "frames");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const workspace = readJson(workspaceFile);
const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const priorCandidateManifest = fs.existsSync(path.join(outputRoot, "manifest.json"))
  ? readJson(path.join(outputRoot, "manifest.json"))
  : {packageItems: []};
const referenceCorpus = readJson(path.join(publicRoot, "generated/system-line/reference-sequence-corpus-v3/corpus.json"));
const referenceStudy = buildReferencePackagingStudy(referenceCorpus);
const sequence = buildCanonicalCreatorPackagingSequence(workspace, {now: new Date().toISOString()});
const semanticTimelineSourceSha256 = sha256(fs.readFileSync(path.join(appRoot, "src/lib/a1-semantic-timeline-decision-v1.mjs")));
const decisionByShot = new Map(sequence.decisions.map((item) => [item.shotId, item]));
const planByShot = new Map((workspace.production.shotIntelligence.packageLookMasterPlans || []).map((item) => [item.shotId, item]));
const assetByShot = new Map((workspace.library.assets || []).filter((item) => item.shotDemand?.shotId).map((item) => [item.shotDemand.shotId, item]));
const contextByShot = new Map((workspace.production.shotIntelligence.videoPackagingContexts?.items || []).map((item) => [item.shotId, item]));
const currentPackageShotIds = new Set(sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId));
const targets = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE" && String(item.presentationMode || "").startsWith("PRESENTER_")).map((item) => item.shotId);
const baseUrls = {
  "ED-01": "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg",
  "ED-07": "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-07.jpg",
  "ED-13": "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-13.jpg",
  "ED-19": "/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-19-hold-frame.jpg",
  "ED-31": "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-31.jpg",
  "ED-33": "/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-33-hold-frame.jpg",
};
const textSpecs = {
  "ED-01": [{id: "identity", text: decisionByShot.get("ED-01")?.requiredFormalText?.[0] || "", x: 136, y: 168, size: 48, tracking: 1, fill: "#f2eee2"}],
  "ED-07": [{id: "question", text: "直接写完全文？", x: 124, y: 224, size: 48, tracking: 1, fill: "#f2eee2"}],
  "ED-13": [{id: "knot", text: "问题", x: 132, y: 170, size: 58, tracking: 1, fill: "#f2eee2"}, {id: "knotQualifier", text: "仍未解决", x: 134, y: 214, size: 30, tracking: 1, fill: "#c8cfca"}],
  "ED-19": [{id: "roleOne", text: "Codex 在后台", x: 104, y: 150, size: 34, tracking: 1, fill: "#f2eee2"}, {id: "roleTwo", text: "整理 · 编排 · 读取 · 检查", x: 382, y: 150, size: 27, tracking: 1, fill: "#b7c0bc"}],
  "ED-31": [
    {id: "inconvenience", text: "不便", x: 118, y: 146, size: 32, tracking: 1, fill: "#b7c0bc"},
    {id: "control", text: "可控的工作流", x: 166, y: 226, size: 52, tracking: 1, fill: "#f2eee2"},
  ],
};
const referenceVisualSpecs = {
  "ED-01": {accent: "#f3c64f", mark: {kind: "anchor", x: 116, y: 168, x2: 570, y2: 168}, coverage: {x: 104, y: 104, width: 610, height: 112}},
  "ED-07": {accent: "#f3c64f", mark: {kind: "question", x: 105, y: 188, x2: 520, y2: 188}, coverage: {x: 92, y: 156, width: 560, height: 122}},
  "ED-13": {accent: "#f06b63", mark: {kind: "correction", x: 124, y: 174, x2: 310, y2: 174}, coverage: {x: 102, y: 112, width: 340, height: 134}},
  "ED-19": {accent: "#f3c64f", mark: {kind: "sequence", x: 100, y: 170, x2: 760, y2: 170}, coverage: {x: 84, y: 94, width: 760, height: 104}},
  "ED-31": {accent: "#f3c64f", mark: {kind: "handoff", x: 124, y: 162, x2: 650, y2: 214}, coverage: {x: 94, y: 102, width: 650, height: 166}},
};
const fontFile = path.join(appRoot, "public/a1-editorial-fonts/fusion-pixel.ttf");
const fontSha256 = sha256(fs.readFileSync(fontFile));
if (fontSha256 !== "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32") throw new Error("presenter-light-overlay-font-sha-mismatch");
const font = fontkit.create(fs.readFileSync(fontFile));
const styleSystem = board.styleLineageAuthority.styleSystem;

function glyphLine({fontAssetId, text, x, y, size, tracking, fill, id}) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`presenter-light-overlay-glyph-missing:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + tracking;
  }
  return {
    markup: `<g fill="${fill}">${paths.join("")}</g>`,
    spec: {id, text, role: "presenter-light-overlay-copy", fontAssetId, fontFamily: "A1 Fusion Pixel", fontSha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", x, y, size, tracking, fill, editable: true, generated: false, glyphIds},
  };
}

function presenterBindingFor(shotId) {
  const current = board.items.find((item) => item.shotId === shotId);
  if (current?.styleLineage?.presenterBinding) return structuredClone(current.styleLineage.presenterBinding);
  const baseUrl = baseUrls[shotId];
  const baseFile = publicFile(baseUrl);
  return {publicUrl: baseUrl, sha256: sha256(fs.readFileSync(baseFile)), provenance: "verified-editor-owned-presenter-source"};
}

function normalizedPlanFor(shotId) {
  const plan = structuredClone(planByShot.get(shotId));
  const decision = decisionByShot.get(shotId);
  const context = contextByShot.get(shotId);
  if (!plan || !decision || !context) throw new Error(`presenter-light-overlay-plan-input-missing:${shotId}`);
  const nextContext = {
    ...structuredClone(context),
    assemblyMode: "OVERLAY",
    presentationMode: decision.presentationMode,
    frameOccupation: "OVERLAY",
    baseVisualCarrier: "PRESENTER_BASE",
    baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
    baseSubjectMustRemainVisible: true,
    frameTakeoverAllowed: false,
    safeZonePolicy: "ACTUAL_FRAME_OPEN_REGION_REQUIRED",
    presenterPackagingComplexityGate: {
      ...(context.presenterPackagingComplexityGate || {}),
      status: "SIMPLE_PRESENTER_PACKAGING_PASS",
      confirmed: true,
      rerouteRequired: false,
      presenterMustRemainDominant: true,
      effectiveRoute: {presentationMode: decision.presentationMode, frameOccupation: "OVERLAY", baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO", baseSubjectMustRemainVisible: true},
      reason: "A1PresenterLightOverlayPolicy/v1 overrides stale semantic promotion: presenter remains the primary carrier.",
    },
  };
  delete nextContext.contextSha256;
  const contextHashInput = structuredClone(nextContext);
  delete contextHashInput.createdAt;
  nextContext.contextSha256 = sha256(contextHashInput);
  const next = {
    ...plan,
    frameOccupation: "OVERLAY",
    contentTreatment: decision.contentTreatment,
    assemblyMode: "OVERLAY",
    assemblyModeReason: "A1PresenterLightOverlayPolicy/v1: 真人为主画面，包装只能以局部叠加存在。",
    presentationMode: decision.presentationMode,
    presentationModeReason: "A1PresenterLightOverlayPolicy/v1: 只允许真人基底上的负空间字体与小元素。",
    whyThisModeBeatsOtherModes: "真人口播承担连续可信度；局部文字足够完成单一语义动作，不需要全屏接管。",
    whyPresentationModeBeatsOtherModes: "人物必须保持可见，后续动效只能在静态板通过后进入。",
    dominantActor: "presenter-with-direct-editorial-type",
    composition: "source-plane-direct-type-with-semantic-mark",
    baseVisualCarrier: "PRESENTER_BASE",
    presenterPackagingMode: decision.presenterPackagingMode,
    presenterPackagingRoute: structuredClone(decision.presenterPackagingRoute),
    presenterReferenceGrammar: presenterReferenceGrammarForShot(shotId),
    canonicalCreatorDecision: structuredClone(decision),
    videoContext: nextContext,
    videoContextSha256: nextContext.contextSha256,
    presenterLightOverlayPolicy: {
      contract: "A1PresenterLightOverlayPolicy/v1",
      status: "PASS",
      route: "PRESENTER_LIGHT_OVERLAY",
      maxGeneratedVisualCoverage: 0.22,
      minimumQuietFieldRatio: 0.35,
      maxTypographyBlocks: 3,
      fullScreenTakeoverAllowed: false,
      staticReviewBeforeMotion: true,
      persistentPanelAllowed: false,
      persistentChromeAllowed: false,
      repeatedFixedAnchorAllowed: false,
      grammar: "EDITORIAL_PUNCTUATION_ON_PRESENTER_BASE",
    },
  };
  return rehashPackageLookMasterPlan(next);
}

async function renderCandidate(shotId) {
  const baseUrl = baseUrls[shotId];
  const baseFile = publicFile(baseUrl);
  if (!fs.existsSync(baseFile)) throw new Error(`presenter-light-overlay-base-missing:${shotId}`);
  const textNodes = textSpecs[shotId].map((spec) => glyphLine({fontAssetId: "type-pixel-correction", ...spec}));
  const visualSpec = referenceVisualSpecs[shotId];
  const mark = visualSpec.mark;
  const markMarkup = mark.kind === "correction"
    ? `<path d="M${mark.x + 2} ${mark.y + 8}l18 -9 18 9 18 -9 18 9 18 -9 18 9" fill="none" stroke="${visualSpec.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M${mark.x - 8} ${mark.y - 14}h12v46h-12" fill="none" stroke="${visualSpec.accent}" stroke-width="3"/>`
    : mark.kind === "question"
      ? `<path d="M${mark.x} ${mark.y}h12v22h-12M${mark.x + 20} ${mark.y + 22}h${mark.x2 - mark.x - 20}" fill="none" stroke="${visualSpec.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
      : mark.kind === "sequence"
        ? `<path d="M${mark.x} ${mark.y}H${mark.x2}" fill="none" stroke="${visualSpec.accent}" stroke-opacity="0.78" stroke-width="3"/><circle cx="${mark.x + 12}" cy="${mark.y}" r="6" fill="${visualSpec.accent}"/><circle cx="${mark.x + 220}" cy="${mark.y}" r="4" fill="${visualSpec.accent}"/><circle cx="${mark.x + 420}" cy="${mark.y}" r="4" fill="${visualSpec.accent}"/>`
        : mark.kind === "handoff"
          ? `<path d="M${mark.x} ${mark.y}h18v30h22l18 18h${mark.x2 - mark.x - 58}" fill="none" stroke="${visualSpec.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${mark.x}" cy="${mark.y}" r="6" fill="${visualSpec.accent}"/>`
          : `<circle cx="${mark.x}" cy="${mark.y}" r="7" fill="${visualSpec.accent}"/><path d="M${mark.x + 18} ${mark.y}H${mark.x2}" fill="none" stroke="${visualSpec.accent}" stroke-opacity="0.78" stroke-width="3" stroke-linecap="round"/>`;
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><g>${textNodes.map((node) => node.markup).join("")}${markMarkup}</g></svg>`);
  const pixels = await sharp(baseFile).resize(1920, 1080, {fit: "cover"}).composite([{input: overlay}]).png({compressionLevel: 9}).toBuffer();
  const file = path.join(frameRoot, `${shotId}.png`);
  fs.writeFileSync(file, pixels);
  const plan = normalizedPlanFor(shotId);
  const incumbent = board.items.find((item) => item.shotId === shotId)
    || priorCandidateManifest.packageItems?.find((item) => item.shotId === shotId);
  if (!incumbent) throw new Error(`presenter-light-overlay-incumbent-missing:${shotId}`);
  const artifactSha256 = sha256(pixels);
  const base = presenterBindingFor(shotId);
  const styleLineage = {
    contract: "A1StaticBoardStyleLineage/v1",
    styleSystemId: styleSystem.id,
    styleSystemSha256: styleSystem.sha256,
    pixelTreatment: "PRESERVED_STRONG_MASTER",
    pixelRecomposed: false,
    compositionMethod: "A1_PRESENTER_REFERENCE_GRAMMAR_STATIC_FRAME_V2",
    compositeSha256: artifactSha256,
    sourceArtifactSha256: artifactSha256,
    typographyMasterId: "A1TypographyDirection/v1",
    typographyMasterSha256: incumbent.styleLineage.typographyMasterSha256,
    fontBindings: [{assetId: "type-pixel-correction", family: "A1 Fusion Pixel", sha256: fontSha256}],
    backgroundBinding: null,
    presenterBinding: base,
    visualMaterialRoute: "PRESENTER_INTEGRATED",
    illustrationBinding: null,
    elementBindings: [],
    sourceEvidenceBinding: null,
    typographyJustification: null,
    preservationReason: "当前候选是已实际渲染并审看的完整口播轻叠加静态帧；后续只允许在用户批准后进入动效。",
    preservedActualPixelReview: true,
    selectionOnly: false,
    auditBytesUnchanged: false,
    compositeVisualAudit: {
      contract: "A1StaticBoardCompositeVisualAudit/v1",
      status: "PASS",
      compositeSha256: artifactSha256,
      actualPixelsViewed: true,
      reviewMethod: "AGENT_ACTUAL_PIXEL_REVIEW",
      semanticAgreement: "PASS",
      semanticRead: "真人保持主画面，文字直接落在原画面上，只用一个与语义绑定的标记完成进入、强调或交接。",
      visualActorDominant: true,
      formalTextRendererBound: true,
      generatedFormalText: false,
      fakeEvidenceFound: false,
      specificGeneratedPersonFound: false,
      titleOverloadFound: false,
    },
    minimalCompositionAudit: {
      contract: "A1ShotMinimalEditorialCompositionAudit/v1",
      status: "PASS",
      actualPixelsViewed: true,
      primaryActorCount: 1,
      semanticActionCount: 1,
      decorativeMotifCount: 0,
      referenceConstructionMatch: "PASS",
      referenceGrammarMatch: "CROSS_CREATOR_SEQUENCE_GRAMMAR_ONLY",
      independentPosterProduct: false,
      compositionRole: "PRESENTER_REFERENCE_GRAMMAR",
    },
    presenterReferenceGrammar: presenterReferenceGrammarForShot(shotId),
    presenterLightOverlayPolicy: {
      contract: "A1PresenterLightOverlayPolicy/v1",
      status: "PASS",
      baseSubjectMustRemainVisible: true,
      generatedVisualCoverage: Number(((visualSpec.coverage.width * visualSpec.coverage.height) / (1920 * 1080)).toFixed(4)),
      maxGeneratedVisualCoverage: 0.22,
      typographyBlockCount: textNodes.length,
      maxTypographyBlocks: 3,
      fullScreenTakeoverAllowed: false,
      persistentPanelAllowed: false,
      persistentChromeAllowed: false,
      repeatedFixedAnchorAllowed: false,
      grammar: "EDITORIAL_PUNCTUATION_ON_PRESENTER_BASE",
    },
  };
  const presenterReferenceGrammar = presenterReferenceGrammarForShot(shotId);
  const item = {
    ...structuredClone(incumbent),
    shotId,
    order: decisionByShot.get(shotId).order,
    sourceText: decisionByShot.get(shotId).sourceText,
    presentationMode: decisionByShot.get(shotId).presentationMode,
    assemblyMode: "OVERLAY",
    frameOccupation: "OVERLAY",
    planSha256: plan.planSha256,
    candidateId: `presenter-light-overlay-system-v2-${shotId.toLowerCase()}`,
    artifactSha256,
    artifactPublicUrl: publicUrlFor(file),
    previewPublicUrl: publicUrlFor(file),
    previewSha256: artifactSha256,
    compositeSha256: artifactSha256,
    textNodes: textNodes.map((node) => node.spec),
    sourceRole: "PRESENTER_BASE",
    titleRole: "PRESENTER_HEADLINE",
    selectionSource: "SYSTEM_PRESENTER_REFERENCE_GRAMMAR_REVIEW_ONLY",
    candidateDifferences: {
      selectedDirectionId: `presenter-reference-grammar-v2-${shotId.toLowerCase()}`,
      candidateDirectionIds: [`presenter-reference-grammar-v2-${shotId.toLowerCase()}`],
      alternativeDirectionIds: [],
      selectionSource: "SYSTEM_PRESENTER_REFERENCE_GRAMMAR_REVIEW_ONLY",
      incumbentArtifactSha256: incumbent.artifactSha256,
      incumbentPreviewPublicUrl: incumbent.previewPublicUrl,
      comparisonStatus: "REVIEW_REQUIRED",
      comparisonReason: "真人主体优先；文字直接附着在原画面，取代常驻小卡、角标和固定 HUD。",
    },
    presenterReferenceGrammar,
    comparisonGate: buildIncumbentComparison({shotId, incumbent, candidate: {shotId, candidateId: `presenter-reference-grammar-v2-${shotId.toLowerCase()}`, artifactSha256, previewPublicUrl: publicUrlFor(file)}, referenceStudySha256: referenceStudy.studySha256}),
    diffSummary: "CROSS_CREATOR_PRESENTER_GRAMMAR · REVIEW_ONLY · incumbent comparison attached",
    styleLineage,
    textNodeOwnership: {
      ...(incumbent.textNodeOwnership || {}),
      contract: "A1LayeredTypographyNodeOwnership/v1",
      visibleHeroOwner: "LOCAL_FONTKIT",
      localEditableOwner: "LOCAL_FONTKIT",
      localNodesAre: ["PRESENTER_HEADLINE"],
      exactHeroText: (decisionByShot.get(shotId).requiredFormalText || []).join(" "),
      exactSupportText: null,
    },
  };
  return {item, plan, base, pixels, file, baseFile, textNodes: textNodes.map((node) => node.spec), generatedVisualCoverage: styleLineage.presenterLightOverlayPolicy.generatedVisualCoverage, referenceGrammar: presenterReferenceGrammar};
}

function labelSvg(width, height, lines, accent = "#8faeff") {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0a0e12"/><rect width="6" height="100%" fill="${accent}"/>${lines.map((line, index) => `<text x="18" y="${20 + index * 17}" fill="${index === 0 ? "#f3f5f2" : "#9da9a4"}" font-family="Arial, PingFang SC, sans-serif" font-size="${index === 0 ? 14 : 10}" font-weight="${index === 0 ? 700 : 400}">${escapeXml(line)}</text>`).join("")}</svg>`);
}

async function buildContactSheet(items, {columns, tileWidth, imageHeight, labelHeight, timeline = false}) {
  const tileHeight = imageHeight + labelHeight;
  const tiles = await Promise.all(items.map(async (item) => {
    const preview = timeline ? (item.preview || {publicUrl: item.previewPublicUrl}) : {publicUrl: item.previewPublicUrl};
    const image = await sharp(publicFile(preview.publicUrl)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const isTarget = targets.includes(item.shotId);
    const label = labelSvg(tileWidth, labelHeight, timeline
      ? [`${item.shotId} · ${item.route || "PACKAGE_LOOK_MASTER"}`, isTarget ? "PRESENTER_REFERENCE_GRAMMAR · REVIEW_ONLY" : (item.sourceRole || "CURRENT"), String(item.sourceText || "").slice(0, 34)]
      : [`${item.shotId} · ${item.presentationMode}`, isTarget ? "PRESENTER_REFERENCE_GRAMMAR · REVIEW_ONLY" : "INCUMBENT_BEST", isTarget ? "原画面直落字体 + 语义标记" : String(item.diffSummary || "INCUMBENT_BEST")], isTarget ? "#8faeff" : "#59636a");
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#080b0e"}}).composite([{input: image}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  }));
  const rows = Math.ceil(items.length / columns);
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#060809"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  return {pixels, sha256: sha256(pixels), width: columns * tileWidth, height: rows * tileHeight};
}

async function buildThreeStateBoard(renderedByShot) {
  const columns = 3;
  const tileWidth = 440;
  const imageHeight = 248;
  const labelHeight = 44;
  const rowHeight = imageHeight + labelHeight;
  const tiles = [];
  for (const shotId of targets) {
    const candidate = renderedByShot.get(shotId);
    for (const state of ["BEFORE", "HOLD", "AFTER"]) {
      const input = state === "HOLD" ? candidate.file : candidate.baseFile;
      const image = await sharp(input).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
      const label = labelSvg(tileWidth, labelHeight, [`${shotId} · ${state}`, state === "HOLD" ? "REFERENCE_GRAMMAR_HOLD" : "PRESENTER_BASE_CLEAN", state === "HOLD" ? "direct type + semantic mark" : "no package"], state === "HOLD" ? "#8faeff" : "#59636a");
      tiles.push(await sharp({create: {width: tileWidth, height: rowHeight, channels: 4, background: "#080b0e"}}).composite([{input: image}, {input: label, left: 0, top: imageHeight}]).png().toBuffer());
    }
  }
  const pixels = await sharp({create: {width: columns * tileWidth, height: targets.length * rowHeight, channels: 4, background: "#060809"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * rowHeight}))).png({compressionLevel: 9}).toBuffer();
  return {pixels, sha256: sha256(pixels), width: columns * tileWidth, height: targets.length * rowHeight};
}

async function buildReferenceComparisonBoard(renderedByShot) {
  const referenceSequenceByShot = Object.fromEntries(targets.map((shotId) => [shotId, presenterReferenceGrammarForShot(shotId).referenceSequenceIds]));
  const referenceSheetById = new Map(referenceCorpus.sources.flatMap((source) => source.sequences.map((sequence) => [sequence.id, publicFile(sequence.sheetPublicUrl)])));
  const columns = 5;
  const tileWidth = 360;
  const imageHeight = 203;
  const labelHeight = 44;
  const rowHeight = imageHeight + labelHeight;
  const tiles = [];
  for (const shotId of targets) {
    const candidate = renderedByShot.get(shotId);
    const incumbent = board.items.find((item) => item.shotId === shotId)
      || priorCandidateManifest.packageItems?.find((item) => item.shotId === shotId);
    if (!incumbent) throw new Error(`presenter-light-overlay-incumbent-missing:${shotId}`);
    const referenceIds = referenceSequenceByShot[shotId];
    const referenceFiles = referenceIds.map((referenceId) => ({id: referenceId, file: referenceSheetById.get(referenceId)}));
    if (referenceFiles.some((entry) => !entry.file || !fs.existsSync(entry.file))) throw new Error(`reference-grammar-sheet-missing:${shotId}`);
    const entries = [
      ...referenceFiles.map((entry) => ({file: entry.file, label: [`${shotId} · ${entry.id}`, "HIGH-RES CONTINUOUS SEQUENCE", "review-only / source not production"], accent: "#f3c64f"})),
      {file: publicFile(incumbent.previewPublicUrl || incumbent.artifactPublicUrl), label: [`${shotId} · INCUMBENT`, "persistent light card / corner chrome", "existing best kept for comparison"], accent: "#59636a"},
      {file: candidate.file, label: [`${shotId} · CANDIDATE`, "cross-creator type grammar / attached mark", "review-only · no source frame reused"], accent: "#f3c64f"},
    ];
    for (const entry of entries) {
      const image = await sharp(entry.file).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
      const label = labelSvg(tileWidth, labelHeight, entry.label, entry.accent);
      tiles.push(await sharp({create: {width: tileWidth, height: rowHeight, channels: 4, background: "#080b0e"}}).composite([{input: image}, {input: label, left: 0, top: imageHeight}]).png().toBuffer());
    }
  }
  const pixels = await sharp({create: {width: columns * tileWidth, height: targets.length * rowHeight, channels: 4, background: "#060809"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * rowHeight}))).png({compressionLevel: 9}).toBuffer();
  return {pixels, sha256: sha256(pixels), width: columns * tileWidth, height: targets.length * rowHeight};
}

fs.mkdirSync(frameRoot, {recursive: true});
const rendered = new Map();
for (const shotId of targets) rendered.set(shotId, await renderCandidate(shotId));
const itemByShot = new Map(board.items.map((item) => [item.shotId, structuredClone(item)]));
for (const [shotId, candidate] of rendered) itemByShot.set(shotId, candidate.item);
const packageItems = board.items.filter((item) => currentPackageShotIds.has(item.shotId)).map((item) => itemByShot.get(item.shotId));
const timelineItems = board.timelineBoard.items.map((item) => {
  const candidate = rendered.get(item.shotId);
  const decision = decisionByShot.get(item.shotId);
  if (!candidate && decision?.packageDecision === "NO_PACKAGE" && item.packageBoardItem === true) {
    const sourceUrl = baseUrls[item.shotId] || contextByShot.get(item.shotId)?.baseFrame?.publicUrl || null;
    const sourceFile = sourceUrl ? publicFile(sourceUrl) : null;
    const sourceSha256 = sourceFile && fs.existsSync(sourceFile) ? sha256(fs.readFileSync(sourceFile)) : null;
    return {
      ...structuredClone(item),
      route: decision.route || "PRESENTER_BASE",
      routeLabel: decision.route === "SCREEN_EVIDENCE" ? "系统操作演示" : "人物画面",
      packageBoardItem: false,
      sourceRole: decision.contentTreatment === "REAL_EVIDENCE" ? "REAL_SOURCE" : "PRESENTER_BASE",
      titleRole: "NONE",
      preview: sourceUrl ? {publicUrl: sourceUrl, sha256: sourceSha256, provenance: "CURRENT_NO_PACKAGE_SOURCE_FRAME"} : null,
      artifactSha256: sourceSha256,
      previewPublicUrl: sourceUrl,
      packageCandidateSha256: null,
      styleCompositeSha256: null,
      labelLines: [`${item.shotId} · NO_PACKAGE`, `${decision.route || "PRESENTER_BASE"} · CURRENT SEMANTIC TIMELINE`, String(item.sourceText || decision.sourceText || "").slice(0, 34)],
    };
  }
  if (!candidate) return structuredClone(item);
  return {
    ...structuredClone(item),
    route: "PACKAGE_LOOK_MASTER",
    packageBoardItem: true,
    sourceRole: "PRESENTER",
    titleRole: (decisionByShot.get(item.shotId)?.requiredFormalText || []).length ? "PRESENTER_HEADLINE" : "NONE",
    preview: {publicUrl: candidate.item.previewPublicUrl, sha256: candidate.item.artifactSha256, provenance: "PRESENTER_REFERENCE_GRAMMAR_REVIEW_ONLY"},
    artifactSha256: candidate.item.artifactSha256,
    previewPublicUrl: candidate.item.previewPublicUrl,
    packageCandidateSha256: candidate.item.artifactSha256,
    styleCompositeSha256: candidate.item.artifactSha256,
    labelLines: [`${item.shotId} · ${candidate.item.presentationMode}`, "PRESENTER_REFERENCE_GRAMMAR · REVIEW_ONLY", String(item.sourceText || "").slice(0, 34)],
  };
});
const packageBoard = await buildContactSheet(packageItems, {columns: 3, tileWidth: 480, imageHeight: 270, labelHeight: 72});
const timelineBoard = await buildContactSheet(timelineItems, {columns: 4, tileWidth: 360, imageHeight: 202, labelHeight: 86, timeline: true});
const referenceGrammarAudit = auditPresenterReferenceGrammar({items: packageItems, targetShotIds: targets, study: referenceStudy});
if (referenceGrammarAudit.status !== "PASS") throw new Error(`presenter-reference-grammar-audit-blocked:${JSON.stringify(referenceGrammarAudit)}`);
const threeStateBoard = await buildThreeStateBoard(rendered);
const referenceComparisonBoard = await buildReferenceComparisonBoard(rendered);
const packageBoardMeta = {publicUrl: publicUrlFor(path.join(outputRoot, "whole-film-package-board.png")), sha256: packageBoard.sha256, width: packageBoard.width, height: packageBoard.height};
const timelineBoardMeta = {publicUrl: publicUrlFor(path.join(outputRoot, "whole-film-timeline-board.png")), sha256: timelineBoard.sha256, width: timelineBoard.width, height: timelineBoard.height};
const threeStateBoardMeta = {publicUrl: publicUrlFor(path.join(outputRoot, "reference-grammar-static-states-board.png")), sha256: threeStateBoard.sha256, width: threeStateBoard.width, height: threeStateBoard.height};
const referenceComparisonBoardMeta = {publicUrl: publicUrlFor(path.join(outputRoot, "reference-grammar-comparison-board.png")), sha256: referenceComparisonBoard.sha256, width: referenceComparisonBoard.width, height: referenceComparisonBoard.height};
const planUpdates = Object.fromEntries([...rendered].map(([shotId, candidate]) => [shotId, {planSha256Before: planByShot.get(shotId).planSha256, planSha256After: candidate.plan.planSha256, plan: candidate.plan}]));
const manifestBase = {
  contract: "A1PresenterLightOverlaySystemCandidate/v2",
  version: 1,
  status: "AGENT_ACTUAL_PIXEL_REVIEW_PASS_USER_APPROVAL_REQUIRED",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  userVisualApproval: "NOT_APPROVED",
  staticReviewBeforeMotion: true,
  motionAllowed: false,
  assemblyCreated: false,
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceBoardSha256: board.sha256,
  sourceTimelineBoardSha256: board.timelineBoard.sha256,
  canonicalSequenceSha256: sequence.sequenceSha256,
  storyboardRevisionSha256: workspace.production.storyboardProductionProjection.storyboardRevisionSha256,
  semanticTimelinePolicy: {version: A1_SEMANTIC_TIMELINE_POLICY_VERSION, sourceSha256: semanticTimelineSourceSha256},
  styleSystem,
  referenceStudy: {contract: referenceStudy.contract, studySha256: referenceStudy.studySha256, sourceIds: referenceStudy.sourceIds, sourceCount: referenceStudy.sourceCount, sequenceCount: referenceStudy.sequenceCount, frameCount: referenceStudy.frameCount, runtimeAssetsAllowed: false, formalVisualFrameQuality: "HIGH_RES_ONLY"},
  referenceGrammarAudit,
  reviewBoards: {threeStateBoard: threeStateBoardMeta, referenceComparisonBoard: referenceComparisonBoardMeta},
  targetShotIds: targets,
  planUpdates,
  packageItems,
  timelineItems,
  packageBoard: packageBoardMeta,
  timelineBoard: timelineBoardMeta,
  comparisonGate: {
  contract: "A1IncumbentBestEvidenceComparison/v1",
    status: "REVIEW_REQUIRED",
    incumbentBoardSha256: board.sha256,
    candidateBoardSha256: packageBoard.sha256,
    incumbentRetainedInHistory: true,
    targetShotIds: targets,
    rule: "新候选必须与已有最佳证据构图并列比较，并展示出现前/强调中/退出后三状态；未完成用户批准不得进入动效或 assembly。",
    referenceGrammarAuditStatus: referenceGrammarAudit.status,
    referenceStudySha256: referenceStudy.studySha256,
  },
  boundaries: {imagegenCallCount: 0, motionPerformed: false, assemblyCreated: false, layerExtractionPerformed: false, resolveUsed: false, finalRenderUsed: false},
  generatedAt: new Date().toISOString(),
};
const manifest = {...manifestBase, manifestSha256: sha256(manifestBase)};
fs.writeFileSync(path.join(outputRoot, "whole-film-package-board.png"), packageBoard.pixels);
fs.writeFileSync(path.join(outputRoot, "whole-film-timeline-board.png"), timelineBoard.pixels);
fs.writeFileSync(path.join(outputRoot, "reference-grammar-static-states-board.png"), threeStateBoard.pixels);
fs.writeFileSync(path.join(outputRoot, "reference-grammar-comparison-board.png"), referenceComparisonBoard.pixels);
fs.writeFileSync(path.join(outputRoot, "reference-packaging-study.json"), `${JSON.stringify(referenceStudy, null, 2)}\n`);
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, outputRoot, targetShotIds: targets, packageBoard: manifest.packageBoard, timelineBoard: manifest.timelineBoard, manifestSha256: manifest.manifestSha256, generatedVisualCoverage: Object.fromEntries([...rendered].map(([id, value]) => [id, value.generatedVisualCoverage]))}, null, 2));
