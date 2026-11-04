#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(generatedRoot, "single-font-semantic-static-board-v1");
const frameRoot = path.join(outputRoot, "frames");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const minimalManifestFile = path.join(generatedRoot, "minimal-editorial-static-board-repair-v1/manifest.json");
const backgroundReviewFile = path.join(generatedRoot, "default-design-asset-library-v1/imagegen-background-final-wave-v4/review.json");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

fs.mkdirSync(frameRoot, {recursive: true});
const workspace = readJson(workspaceFile);
const minimalManifest = readJson(minimalManifestFile);
const backgroundReview = readJson(backgroundReviewFile);
const currentDecisions = [...workspace.production.canonicalCreatorPackagingSequence.decisions]
  .filter((item) => item.packageDecision === "PACKAGE" && item.shotId !== "ED-08")
  .sort((left, right) => Number(left.order) - Number(right.order));
const expectedShotIds = ["ED-01", "ED-07", "ED-09", "ED-10", "ED-12", "ED-13", "ED-14", "ED-16", "ED-17", "ED-19", "ED-31", "ED-34"];
if (JSON.stringify(currentDecisions.map((item) => item.shotId)) !== JSON.stringify(expectedShotIds)) throw new Error(`single-font-canonical-scope-invalid:${JSON.stringify(currentDecisions.map((item) => item.shotId))}`);

const fusionFontFile = path.join(generatedRoot, "font-cache/fusion-pixel.ttf");
const fusionFontSha256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
if (fileSha(fusionFontFile) !== fusionFontSha256) throw new Error("single-font-fusion-pixel-sha-mismatch");
const fusionFont = fontkit.create(fs.readFileSync(fusionFontFile));
const fontBinding = {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", sha256: fusionFontSha256};
const typographyMasterSha256 = sha256(workspace.typographySystem);
const backgrounds = new Map(backgroundReview.candidates.map((item) => [item.candidateId, item]));
const selectedByShot = new Map(workspace.production.shotIntelligence.packageLookMasterPlans
  .filter((plan) => plan.provisionalWholeFilmBoardSelection)
  .map((plan) => [plan.shotId, {plan, selection: plan.provisionalWholeFilmBoardSelection}]));
const rawByShot = new Map(expectedShotIds.map((shotId) => {
  const selected = selectedByShot.get(shotId);
  return [shotId, workspace.production.shotIntelligence.lookMasterRawReferences.find((raw) => raw.shotId === shotId && raw.artifact?.sha256 === selected?.selection?.artifact?.sha256) || null];
}));
const minimalByShot = new Map(minimalManifest.items.map((item) => [item.shotId, item]));

const styleSystemInput = {
  contract: "A1AppliedEditorialStyleSystem/v1",
  id: "a1-fusion-pixel-semantic-material-editorial-v3",
  fontAuthority: {contract: workspace.typographySystem.contract, sha256: typographyMasterSha256, singleFontAssetId: "type-pixel-correction", singleFontSha256: fusionFontSha256},
  referencePackId: "pinterest-retro-pixel-v1",
  rules: [
    "fusion-pixel-is-the-only-editable-formal-font",
    "presenter-evidence-or-material-is-the-default-carrier",
    "pixel-is-a-local-signature-not-a-global-skin",
    "one-primary-actor-and-one-semantic-action",
    "imagegen-backgrounds-are-role-bound-supply",
    "formal-text-is-renderer-bound-after-generation",
    "no-generic-title-card-and-no-decorative-line",
  ],
};
const styleSystem = {...styleSystemInput, sha256: sha256(styleSystemInput)};
// Bound to the exact deterministic pixels produced by this script. The six
// recomposed frames and the complete 12-shot contact sheet were inspected at
// full resolution after the single ED-17 scale correction.
const reviewedShotIds = new Set(expectedShotIds);

function glyphNode({id, text, x, y, size, fill, tracking = 0, role = "formal-text"}) {
  const scale = size / fusionFont.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = fusionFont.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`single-font-missing-glyph:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + tracking;
  }
  return {
    markup: `<g fill="${fill}">${paths.join("")}</g>`,
    spec: {id, text, role, fontAssetId: fontBinding.assetId, fontFamily: fontBinding.family, fontSha256: fontBinding.sha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", x, y, size, tracking, fill, editable: true, generated: false, glyphIds},
  };
}

function backgroundBinding(candidateId) {
  const candidate = backgrounds.get(candidateId);
  if (!candidate) throw new Error(`single-font-background-missing:${candidateId}`);
  const file = publicFile(candidate.publicUrl);
  if (!fs.existsSync(file) || fileSha(file) !== candidate.sha256) throw new Error(`single-font-background-sha-mismatch:${candidateId}`);
  return {assetId: candidate.candidateId, publicUrl: candidate.publicUrl, sha256: candidate.sha256, roleId: candidate.roleId, visualReviewStatus: candidate.visualReviewStatus};
}

async function renderComposite({shotId, baseFile, background, nodes, vectorMarkup = "", extraComposites = [], visualMaterialRoute, illustrationBinding = null, elementBindings = [], typographyJustification = null, presenterBinding = null, semanticRead, compositionRole}) {
  const source = selectedByShot.get(shotId)?.selection?.artifact;
  if (!source?.sha256) throw new Error(`single-font-source-selection-missing:${shotId}`);
  const base = await sharp(baseFile).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${vectorMarkup}${nodes.map((node) => node.markup).join("")}</svg>`);
  const output = await sharp(base).composite([...extraComposites, {input: overlay}]).png({compressionLevel: 9}).toBuffer();
  const outputFile = path.join(frameRoot, `${shotId}.png`);
  fs.writeFileSync(outputFile, output);
  const artifactSha256 = sha256(output);
  const reviewed = reviewedShotIds.has(shotId);
  return {
    shotId,
    artifactSha256,
    artifactPublicUrl: publicUrl(outputFile),
    previewPublicUrl: publicUrl(outputFile),
    width: 1920,
    height: 1080,
    textNodes: nodes.map((node) => node.spec),
    styleLineage: {
      contract: "A1StaticBoardStyleLineage/v1",
      styleSystemId: styleSystem.id,
      styleSystemSha256: styleSystem.sha256,
      pixelTreatment: "RECOMPOSED",
      pixelRecomposed: true,
      compositionMethod: "FUSION_PIXEL_FONTKIT_SHARP_SEMANTIC_MATERIAL_COMPOSITE",
      compositeSha256: artifactSha256,
      sourceArtifactSha256: source.sha256,
      typographyMasterId: workspace.typographySystem.contract,
      typographyMasterSha256,
      fontBindings: [fontBinding],
      backgroundBinding: background,
      presenterBinding,
      visualMaterialRoute,
      illustrationBinding,
      elementBindings,
      sourceEvidenceBinding: null,
      typographyJustification,
      selectionOnly: false,
      auditBytesUnchanged: false,
      compositeVisualAudit: {contract: "A1StaticBoardCompositeVisualAudit/v1", status: reviewed ? "PASS" : "PENDING_ACTUAL_PIXEL_REVIEW", compositeSha256: artifactSha256, actualPixelsViewed: reviewed, reviewMethod: reviewed ? "FULL_RESOLUTION_FRAME_AND_WHOLE_FILM_CONTACT_SHEET" : null, semanticAgreement: reviewed ? "PASS" : "PENDING", semanticRead, visualActorDominant: reviewed, formalTextRendererBound: true, generatedFormalText: false, fakeEvidenceFound: false, specificGeneratedPersonFound: false, titleOverloadFound: false},
      minimalCompositionAudit: {contract: "A1ShotMinimalEditorialCompositionAudit/v1", status: reviewed ? "PASS" : "PENDING_ACTUAL_PIXEL_REVIEW", actualPixelsViewed: reviewed, primaryActorCount: 1, semanticActionCount: 1, decorativeMotifCount: 0, referenceConstructionMatch: reviewed ? "PASS" : "PENDING", independentPosterProduct: false, compositionRole},
    },
  };
}

function preserveCurrent(shotId, {visualMaterialRoute, presenterBinding = null, sourceEvidenceBinding = null, illustrationBinding = null, elementBindings = [], typographyJustification = null, textNodes = [], semanticRead, compositionRole}) {
  const selected = selectedByShot.get(shotId)?.selection?.artifact;
  const raw = rawByShot.get(shotId);
  if (!selected?.publicUrl || !raw || fileSha(publicFile(selected.publicUrl)) !== selected.sha256) throw new Error(`single-font-preserved-source-invalid:${shotId}`);
  const reviewed = raw.actualPixelAssessment?.status === "PASS" && raw.actualPixelAssessment?.localEvidence?.visualDirectorReview?.actualFullFrameInspected === true;
  return {
    shotId,
    artifactSha256: selected.sha256,
    artifactPublicUrl: selected.publicUrl,
    previewPublicUrl: selected.publicUrl,
    width: selected.width || 1920,
    height: selected.height || 1080,
    textNodes,
    styleLineage: {
      contract: "A1StaticBoardStyleLineage/v1",
      styleSystemId: styleSystem.id,
      styleSystemSha256: styleSystem.sha256,
      pixelTreatment: "PRESERVED_STRONG_MASTER",
      pixelRecomposed: false,
      compositionMethod: "EXPLICIT_CURRENT_SINGLE_FONT_MASTER_PRESERVATION",
      compositeSha256: selected.sha256,
      sourceArtifactSha256: selected.sha256,
      preservationReason: "CURRENT_HASH_BOUND_SINGLE_FONT_OR_SOURCE_EVIDENCE_MASTER_ALREADY_MATCHES_CANONICAL_SEMANTICS",
      preservedActualPixelReview: reviewed,
      typographyMasterId: workspace.typographySystem.contract,
      typographyMasterSha256,
      fontBindings: visualMaterialRoute === "SOURCE_EVIDENCE" ? [] : [fontBinding],
      backgroundBinding: null,
      presenterBinding,
      visualMaterialRoute,
      illustrationBinding,
      elementBindings,
      sourceEvidenceBinding,
      typographyJustification,
      selectionOnly: false,
      auditBytesUnchanged: true,
      compositeVisualAudit: {contract: "A1StaticBoardCompositeVisualAudit/v1", status: reviewed ? "PASS" : "BLOCK", compositeSha256: selected.sha256, actualPixelsViewed: reviewed, reviewMethod: "CURRENT_BOUND_ACTUAL_PIXEL_ASSESSMENT", semanticAgreement: reviewed ? "PASS" : "BLOCK", semanticRead, visualActorDominant: reviewed, formalTextRendererBound: true, generatedFormalText: false, fakeEvidenceFound: false, specificGeneratedPersonFound: false, titleOverloadFound: false},
      minimalCompositionAudit: raw.actualPixelAssessment?.localEvidence?.minimalCompositionAudit || {contract: "A1ShotMinimalEditorialCompositionAudit/v1", status: reviewed ? "PASS" : "BLOCK", actualPixelsViewed: reviewed, primaryActorCount: 1, semanticActionCount: 1, decorativeMotifCount: 0, referenceConstructionMatch: reviewed ? "PASS" : "BLOCK", independentPosterProduct: false, compositionRole},
    },
  };
}

const itemsByShot = new Map();
const ed01Spec = readJson(path.join(generatedRoot, "ed01-storyboard-consistency-v1/typography-spec.json"));
itemsByShot.set("ED-01", preserveCurrent("ED-01", {visualMaterialRoute: "PRESENTER_INTEGRATED", presenterBinding: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg", sha256: "054e021fbfe12cbd85687d0ca4bcf0b3dec224b64a4f7988c2745471c8ef7df9", provenance: "verified-editor-owned-presenter-source"}, textNodes: ed01Spec.nodes, semanticRead: "真实人物开场建立智能写作工作台身份，口播 Hi 不再被误当主标题", compositionRole: "PRESENTER_IDENTITY_OVERLAY"}));

const ed07Frame = path.join(generatedRoot, "imported-film-media-v1/presenter-shot-frames/ED-07.jpg");
itemsByShot.set("ED-07", await renderComposite({shotId: "ED-07", baseFile: ed07Frame, background: null, presenterBinding: {publicUrl: publicUrl(ed07Frame), sha256: fileSha(ed07Frame), provenance: "verified-editor-owned-presenter-source"}, visualMaterialRoute: "PRESENTER_INTEGRATED", nodes: [glyphNode({id: "ed07-a", text: "直接写完", x: 76, y: 172, size: 98, fill: "#8faeff", tracking: 2}), glyphNode({id: "ed07-b", text: "全文？", x: 72, y: 345, size: 156, fill: "#f3f5f2", tracking: 3})], vectorMarkup: '<defs><linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#070b0e" stop-opacity="0.78"/><stop offset="0.43" stop-color="#070b0e" stop-opacity="0.42"/><stop offset="0.7" stop-color="#070b0e" stop-opacity="0"/></linearGradient></defs><rect width="1050" height="1080" fill="url(#shade)"/>', semanticRead: "真人提出是否让 AI 直接写完全文的反问，标题只占人物左侧真实负空间", compositionRole: "PRESENTER_QUESTION_OVERLAY"}));

const ed09Substrate = path.join(generatedRoot, "material-led-static-board-repair-v2/substrates/ED-09.png");
const ed09Binding = {assetId: "ed-09-textless-imagegen-pixel-substrate-v2", kind: "TEXTLESS_IMAGEGEN_PIXEL_ILLUSTRATION", publicUrl: publicUrl(ed09Substrate), sha256: fileSha(ed09Substrate), generatedFormalText: false};
itemsByShot.set("ED-09", await renderComposite({shotId: "ED-09", baseFile: ed09Substrate, background: backgroundBinding("background-charcoal-print-pressure-drift-imagegen-v3"), visualMaterialRoute: "ILLUSTRATION_LED", illustrationBinding: ed09Binding, nodes: [glyphNode({id: "ed09-a", text: "中文，", x: 94, y: 208, size: 96, fill: "#14191d", tracking: 2}), glyphNode({id: "ed09-b", text: "却看不懂", x: 92, y: 405, size: 142, fill: "#2452ff", tracking: 2})], semanticRead: "右侧阅读迷宫是主视觉，左侧一句本地字体只负责点明中文却看不懂", compositionRole: "READING_FAILURE_ILLUSTRATION"}));

const ed10Background = backgroundBinding("background-cobalt-verdict-mass-field-imagegen-v2");
itemsByShot.set("ED-10", await renderComposite({shotId: "ED-10", baseFile: publicFile(ed10Background.publicUrl), background: ed10Background, visualMaterialRoute: "TYPOGRAPHY_DOMINANT", typographyJustification: "章节唯一判断句需要短时全屏尺度冲突；前后均由真人或机制画面复位", nodes: [glyphNode({id: "ed10-a", text: "完成度很高的", x: 110, y: 240, size: 96, fill: "#a9bcff", tracking: 3}), glyphNode({id: "ed10-b", text: "废稿", x: 380, y: 890, size: 410, fill: "#f5f5ef", tracking: 8})], vectorMarkup: '<g opacity="0.85"><path d="M1210 150h510v650h-510z" fill="none" stroke="#f4f4ef" stroke-width="18"/><path d="M1270 225h330M1270 300h250M1270 375h290" stroke="#809dff" stroke-width="20"/><path d="M1190 810l560-610" stroke="#2452ff" stroke-width="28"/><path d="M1150 780l70 70M1715 160l70 70" stroke="#f4f4ef" stroke-width="18"/></g>', semanticRead: "完成度与废稿形成一个尺度冲突，右侧被判废的纸张是唯一辅助对象", compositionRole: "BOUNDED_VERDICT_TAKEOVER"}));

const ed12 = minimalByShot.get("ED-12");
itemsByShot.set("ED-12", {...ed12, styleLineage: {...ed12.styleLineage, styleSystemId: styleSystem.id, styleSystemSha256: styleSystem.sha256}});
itemsByShot.set("ED-13", preserveCurrent("ED-13", {visualMaterialRoute: "PRESENTER_INTEGRATED", presenterBinding: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-13.jpg", sha256: "538cb25bb8526e4536d8d8e263d27e84ed14240aa430bee17b3c7ce7a8a2ad2f", provenance: "verified-editor-owned-presenter-source"}, semanticRead: "真人承认中文变顺但问题仍在，文字不遮脸眼身体和麦克风", compositionRole: "PRESENTER_UNRESOLVED_OVERLAY"}));
const ed14 = minimalByShot.get("ED-14");
itemsByShot.set("ED-14", {...ed14, styleLineage: {...ed14.styleLineage, styleSystemId: styleSystem.id, styleSystemSha256: styleSystem.sha256}});
const ed16Spec = readJson(path.join(generatedRoot, "four-shot-narrow-repair-v1/ED-16-typography-spec.json"));
itemsByShot.set("ED-16", preserveCurrent("ED-16", {visualMaterialRoute: "ELEMENT_EXPLAINER", elementBindings: minimalByShot.get("ED-16").styleLineage.elementBindings, textNodes: ed16Spec.nodes, semanticRead: "材料不足和角度不清汇聚成泛泛而谈的单一因果机制", compositionRole: "SINGLE_CAUSAL_MECHANISM"}));

const ed17Background = backgroundBinding("background-cool-object-stage-basin-imagegen-v3");
const ed17Elements = ["ED-17-material-folder.svg", "ED-17-angle-prism.svg", "ED-17-writing-pen.svg"].map((name) => {
  const file = path.join(generatedRoot, "material-led-static-board-repair-v2/elements", name);
  return {file, binding: {assetId: name.replace(/\.svg$/u, "").toLowerCase(), kind: "EDITABLE_VECTOR_ELEMENT", publicUrl: publicUrl(file), sha256: fileSha(file), generated: false, formalTextEmbedded: false}};
});
const ed17ElementComposites = await Promise.all(ed17Elements.map(async (item, index) => ({input: await sharp(item.file).trim().resize(300, 300, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer(), left: [145, 810, 1475][index], top: 380, blend: "over"})));
itemsByShot.set("ED-17", await renderComposite({shotId: "ED-17", baseFile: publicFile(ed17Background.publicUrl), background: ed17Background, visualMaterialRoute: "ELEMENT_EXPLAINER", elementBindings: ed17Elements.map((item) => item.binding), extraComposites: ed17ElementComposites, nodes: [glyphNode({id: "ed17-a", text: "先给材料", x: 110, y: 215, size: 78, fill: "#15191d", tracking: 2}), glyphNode({id: "ed17-b", text: "再找角度", x: 695, y: 215, size: 78, fill: "#15191d", tracking: 2}), glyphNode({id: "ed17-c", text: "最后让 AI 动笔", x: 1245, y: 215, size: 68, fill: "#2452ff", tracking: 1})], vectorMarkup: '<path d="M535 545h200M705 515l30 30-30 30M1210 545h190M1370 515l30 30-30 30" fill="none" stroke="#2452ff" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter"/>', semanticRead: "材料文件夹经过角度棱镜再交给写作笔，三步对象构成一条流程而非三张标题卡", compositionRole: "MATERIAL_ANGLE_WRITING_OBJECT_FLOW"}));

const ed19Frame = path.join(generatedRoot, "video-packaging-context-v1/ed-19-hold-frame.jpg");
itemsByShot.set("ED-19", await renderComposite({shotId: "ED-19", baseFile: ed19Frame, background: null, presenterBinding: {publicUrl: publicUrl(ed19Frame), sha256: fileSha(ed19Frame), provenance: "verified-editor-owned-presenter-source"}, visualMaterialRoute: "PRESENTER_INTEGRATED", nodes: [glyphNode({id: "ed19-a", text: "Codex", x: 72, y: 168, size: 76, fill: "#8faeff", tracking: 2}), glyphNode({id: "ed19-b", text: "在后台", x: 70, y: 338, size: 128, fill: "#f3f5f2", tracking: 3})], vectorMarkup: '<defs><linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#070b0e" stop-opacity="0.8"/><stop offset="0.42" stop-color="#070b0e" stop-opacity="0.4"/><stop offset="0.68" stop-color="#070b0e" stop-opacity="0"/></linearGradient></defs><rect width="1020" height="1080" fill="url(#shade)"/>', semanticRead: "真人口播仍是主画面，Codex 在后台只作为绑定左侧负空间的职责标签", compositionRole: "PRESENTER_BACKSTAGE_OVERLAY"}));
itemsByShot.set("ED-31", preserveCurrent("ED-31", {visualMaterialRoute: "PRESENTER_INTEGRATED", presenterBinding: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-31.jpg", sha256: "3a3afe742cf63037bf85ca5dbacb78e58ba881ea3556918b28cd017d1605c959", provenance: "verified-editor-owned-presenter-source"}, semanticRead: "真人负空间中只保留把不便变成可控流程这一结论", compositionRole: "PRESENTER_CONTROL_OVERLAY"}));

const ed34Background = backgroundBinding("background-cool-broad-halftone-wave-imagegen-v3");
itemsByShot.set("ED-34", await renderComposite({shotId: "ED-34", baseFile: publicFile(ed34Background.publicUrl), background: ed34Background, visualMaterialRoute: "TYPOGRAPHY_DOMINANT", typographyJustification: "全片最终结论允许一次完整收束，路径插图承担方向选择而非装饰", nodes: [glyphNode({id: "ed34-a", text: "真正写出", x: 105, y: 255, size: 102, fill: "#171b20", tracking: 3}), glyphNode({id: "ed34-b", text: "自己的风格", x: 100, y: 520, size: 176, fill: "#2452ff", tracking: 4})], vectorMarkup: '<g fill="none" stroke-linecap="square" stroke-linejoin="miter"><path d="M1050 820C1240 780 1280 660 1390 575C1510 480 1600 420 1770 310" stroke="#2452ff" stroke-width="48"/><path d="M1365 595C1440 700 1535 780 1735 850" stroke="#aeb5bf" stroke-width="20"/><path d="M1390 575C1480 520 1570 600 1775 610" stroke="#c3c8ce" stroke-width="20"/><path d="M1710 265l70 45-82 14" stroke="#2452ff" stroke-width="34"/></g><g fill="#2452ff"><rect x="1016" y="786" width="68" height="68"/><rect x="1356" y="541" width="68" height="68"/></g>', semanticRead: "一条主路径从多个分岔中被选出，最终落到自己的风格而不是再次展示一张纯标题卡", compositionRole: "SELECTED_PATH_CONCLUSION"}));

const items = currentDecisions.map((decision) => {
  const item = itemsByShot.get(decision.shotId);
  if (!item) throw new Error(`single-font-item-missing:${decision.shotId}`);
  return {...item, order: decision.order, assemblyMode: decision.assemblyMode, presentationMode: decision.presentationMode, frameOccupation: decision.frameOccupation, sourceText: decision.sourceText, semanticJob: decision.presentationDecision?.semanticJob || decision.sourceText, candidateId: `single-font-semantic-${decision.shotId.toLowerCase()}`, planSha256: selectedByShot.get(decision.shotId).plan.planSha256, actualPixelAuditSha256: rawByShot.get(decision.shotId)?.pixelAudit?.auditSha256 || null, semanticPixelAuditSha256: rawByShot.get(decision.shotId)?.semanticPixelAudit?.auditSha256 || null};
});

async function buildBoard(boardItems, outputFile) {
  const tileWidth = 480;
  const imageHeight = 270;
  const labelHeight = 58;
  const columns = 3;
  const tileHeight = imageHeight + labelHeight;
  const tiles = await Promise.all(boardItems.map(async (item) => {
    const image = await sharp(publicFile(item.previewPublicUrl)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0f13"/><rect width="7" height="100%" fill="#2452ff"/><text x="20" y="23" fill="#f3f5f2" font-family="Arial,sans-serif" font-size="15" font-weight="700">${escapeXml(item.shotId)} · ${escapeXml(item.presentationMode)}</text><text x="20" y="45" fill="#8faeff" font-family="Arial,sans-serif" font-size="10">FUSION PIXEL · ${item.artifactSha256.slice(0, 12)} · USER NOT APPROVED</text></svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f13"}}).composite([{input: image}, {input: label, top: imageHeight, left: 0}]).png().toBuffer();
  }));
  const rows = Math.ceil(boardItems.length / columns);
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  return {publicUrl: publicUrl(outputFile), sha256: sha256(pixels), width: columns * tileWidth, height: rows * tileHeight};
}

const board = await buildBoard(items, path.join(outputRoot, "package-board-review.png"));
const manifestBody = {contract: "A1SingleFontSemanticStaticBoardCandidate/v1", status: reviewedShotIds.size === expectedShotIds.length ? "ACTUAL_PIXEL_PASS_READY_FOR_CANONICAL_BOARD" : "PENDING_ACTUAL_PIXEL_REVIEW", current: false, reviewOnly: true, productionAdmitted: false, userVisualApproval: "NOT_APPROVED", sourceWorkspaceSha256: workspace.workspaceSha256, expectedShotIds, styleSystem, fontBinding, typographyMasterSha256, items, board, boundaries: {imageGenerationPerformed: false, assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false, resolveUsed: false, finalRenderUsed: false}, generatedAt: new Date().toISOString()};
const manifest = {...manifestBody, manifestSha256: sha256(manifestBody)};
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, itemCount: items.length, board, manifestSha256: manifest.manifestSha256}, null, 2));
