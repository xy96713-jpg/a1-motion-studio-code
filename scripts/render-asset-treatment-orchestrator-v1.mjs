#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {compileAssetArtTreatmentPlan} from "../apps/studio-next/src/lib/a1-asset-art-treatment-director-v1.mjs";
import {assertAssetTreatmentDecision, compileAssetTreatmentDecision} from "../apps/studio-next/src/lib/a1-asset-treatment-orchestrator-v1.mjs";
import {renderAssetArtTreatment} from "../lib/a1-asset-art-treatment-renderer-v1.mjs";

const root = process.cwd();
const outputRoot = path.join(root, "work/asset-treatment-orchestrator-v1");
const assetRoot = path.join(outputRoot, "assets");
const cleanRoot = path.join(root, "work/external-source-asset-archetype-v1/assets");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const ensureDir = (directory) => fs.mkdirSync(directory, {recursive: true});
const cleanText = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const assets = {
  personCutout: path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/assets/lite/mask-multi-person-01/mask-multi-person-01-edge-refined.png"),
  personRect: path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/fixtures/mask-multi-person-01.jpg"),
  objectCutout: path.join(cleanRoot, "object-cutout.png"),
  archive: path.join(cleanRoot, "archive-print.png"),
  scene: path.join(cleanRoot, "scene-rect.png"),
  sceneAlt: path.join(cleanRoot, "photo-diptych.png"),
  evidence: path.join(cleanRoot, "document-preserve.png"),
};

const base = {
  source: {cleanAssetAvailable: true, assetCount: 1, alphaAvailable: false, matteReviewStatus: "NOT_AVAILABLE", sourceAuthority: "NON_EVIDENCE"},
  shot: {shotFunction: "ACTION", viewerTask: "Understand why this source is present", carrierRole: "SOURCE_CONTEXT", placementPlane: "FLOATING", copyDensity: "LOW", effectIntensity: "LOW", spotColor: "A1_COBALT"},
  background: {complexity: "QUIET", subjectSeparation: "ADEQUATE"},
  semantics: {temporalContext: "CURRENT", domain: "GENERAL", memoryMode: "NONE", visualIntent: "SOURCE_CONTEXT", tone: "NEUTRAL", conceptualActions: []},
  sequence: {stylizedCountInWindow: 0, recentTreatments: [], recentFamilies: []},
};

const fixtures = [
  {id: "person-busy-identity", genre: "person", cleanAsset: assets.personCutout, input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY"}, background: {complexity: "BUSY", subjectSeparation: "LOW"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT"}}},
  {id: "object-plane-explainer", genre: "object", cleanAsset: assets.objectCutout, input: {...base, source: {...base.source, sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "OBJECT_EXPLAINER", placementPlane: "OBJECT_PLANE"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT"}}},
  {id: "person-no-matte-fallback", genre: "person", cleanAsset: assets.personRect, input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT"}}},
  {id: "document-evidence", genre: "document", cleanAsset: assets.evidence, input: {...base, source: {...base.source, sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceAuthority: "AUTHORITATIVE_EVIDENCE"}, shot: {...base.shot, shotFunction: "RESULT_HOLD", viewerTask: "Read the verified document"}, semantics: {tags: []}}},
  {id: "archive-historical", genre: "archive", cleanAsset: assets.archive, input: {...base, source: {...base.source, sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET"}, shot: {...base.shot, shotFunction: "REVEAL"}, semantics: {...base.semantics, temporalContext: "HISTORICAL", memoryMode: "ARCHIVE", tone: "SOBER"}}},
  {id: "science-blueprint", genre: "science", cleanAsset: assets.scene, input: {...base, source: {...base.source, sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT"}, shot: {...base.shot, shotFunction: "ESTABLISH", spotColor: "PRUSSIAN_BLUE"}, semantics: {...base.semantics, domain: "ENGINEERING", visualIntent: "TACTILE_PRINT"}}},
  {id: "digital-signal", genre: "technology", cleanAsset: assets.objectCutout, input: {...base, source: {...base.source, sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "OBJECT_EXPLAINER"}, semantics: {...base.semantics, domain: "TECHNOLOGY", memoryMode: "EARLY_DIGITAL", visualIntent: "ISOLATE_SUBJECT"}}},
  {id: "conflict-duplicate", genre: "person", cleanAsset: assets.personCutout, input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY", shotFunction: "COMPARISON"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT", conceptualActions: ["INSTABILITY", "DUPLICATION"]}}},
  {id: "fractured-scene", genre: "scene", cleanAsset: assets.scene, input: {...base, source: {...base.source, sourceClass: "REAL_SCREEN_OR_SCENE", mediaRole: "PRINT_ARTIFACT"}, shot: {...base.shot, shotFunction: "TRANSITION"}, semantics: {...base.semantics, conceptualActions: ["FRACTURE", "CONFLICT"]}}},
  {id: "plain-scene", genre: "scene", cleanAsset: assets.sceneAlt, input: {...base, source: {...base.source, sourceClass: "REAL_SCREEN_OR_SCENE", mediaRole: "PRINT_ARTIFACT"}}},
  {id: "sequence-budget-clean", genre: "science", cleanAsset: assets.scene, input: {...base, source: {...base.source, sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT"}, semantics: {...base.semantics, domain: "ENGINEERING"}, sequence: {stylizedCountInWindow: 3, recentTreatments: ["CYANOTYPE_CONTACT"], recentFamilies: ["CHEMICAL_PRINT"]}}},
  {id: "recent-repeat-clean", genre: "technology", cleanAsset: assets.objectCutout, input: {...base, source: {...base.source, sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "OBJECT_EXPLAINER"}, semantics: {...base.semantics, memoryMode: "EARLY_DIGITAL", visualIntent: "ISOLATE_SUBJECT"}, sequence: {stylizedCountInWindow: 1, recentTreatments: ["ATKINSON_GRAIN"], recentFamilies: ["DITHER"]}}},
  {id: "concept-bridge-duotone", genre: "editorial", cleanAsset: assets.personCutout, input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY", shotFunction: "TRANSITION"}, semantics: {...base.semantics, visualIntent: "CONCEPTUAL_BRIDGE"}}},
  {id: "archive-repeat-xerox", genre: "archive", cleanAsset: assets.archive, input: {...base, source: {...base.source, sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET"}, semantics: {...base.semantics, memoryMode: "ARCHIVE", conceptualActions: ["REPETITION"]}}},
  {id: "person-echo-halftone", genre: "person", cleanAsset: assets.personCutout, input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT", conceptualActions: ["DUPLICATION"]}}},
  {id: "technical-abstraction-dither", genre: "technology", cleanAsset: assets.objectCutout, input: {...base, source: {...base.source, sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "OBJECT_EXPLAINER"}, semantics: {...base.semantics, domain: "TECHNOLOGY", visualIntent: "ISOLATE_SUBJECT"}}},
];

function checkerSvg(width, height, cell = 22) {
  const marks = [];
  for (let y = 0; y < height; y += cell) for (let x = 0; x < width; x += cell) marks.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${(x / cell + y / cell) % 2 ? "#d8d7d2" : "#f2f0ea"}"/>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${marks.join("")}</svg>`);
}

function busySvg(width, height) {
  const paths = Array.from({length: 18}, (_, index) => `<path d="M${-width + index * 84} ${height}L${index * 84} 0" stroke="${index % 3 === 0 ? "#d7ff45" : index % 3 === 1 ? "#3156ef" : "#e84736"}" stroke-width="22" opacity=".62"/>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#242628"/>${paths}</svg>`);
}

function labelSvg(width, height, title, lines) {
  const text = lines.map((line, index) => `<text x="16" y="${50 + index * 20}" fill="${index === 0 ? "#f3efe5" : "#aaa79e"}" font-family="Arial,sans-serif" font-size="${index === 0 ? 13 : 11}" font-weight="${index === 0 ? 700 : 400}">${cleanText(line)}</text>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#111315"/><text x="16" y="26" fill="#d7ff45" font-family="Arial,sans-serif" font-size="16" font-weight="700">${cleanText(title)}</text>${text}</svg>`);
}

async function alphaLayer(mask, width, height, color) {
  const alpha = await sharp(mask).grayscale().linear(Number(color.alpha ?? 1)).png().toBuffer();
  return sharp({create: {width, height, channels: 3, background: {r: color.r, g: color.g, b: color.b}}}).joinChannel(alpha).png().toBuffer();
}

async function applySeparation(input, effectIntent) {
  if (!["OUTLINE", "SHADOW", "OUTLINE_SHADOW"].includes(effectIntent)) return Buffer.from(input);
  const metadata = await sharp(input).metadata();
  const width = Number(metadata.width || 1);
  const height = Number(metadata.height || 1);
  const alpha = await sharp(input).ensureAlpha().extractChannel("alpha").png().toBuffer();
  const layers = [];
  if (effectIntent === "SHADOW" || effectIntent === "OUTLINE_SHADOW") {
    const shadowMask = await sharp(alpha).blur(Math.max(3, Math.min(width, height) * .014)).png().toBuffer();
    const shadow = await alphaLayer(shadowMask, width, height, {r: 0, g: 0, b: 0, alpha: .26});
    layers.push({input: shadow, left: Math.max(0, Math.round(Math.min(width, height) * .012)), top: Math.max(0, Math.round(Math.min(width, height) * .016))});
  }
  if (effectIntent === "OUTLINE" || effectIntent === "OUTLINE_SHADOW") {
    const outerMask = await sharp(alpha).blur(Math.max(1.8, Math.min(width, height) * .008)).threshold(9).png().toBuffer();
    const outline = await alphaLayer(outerMask, width, height, {r: 244, g: 239, b: 225, alpha: 1});
    layers.push({input: outline});
  }
  layers.push({input});
  return sharp({create: {width: width + 12, height: height + 12, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite(layers).png().toBuffer();
}

async function renderDecision(fixture, decision) {
  const sourceBuffer = fs.readFileSync(fixture.cleanAsset);
  const separated = await applySeparation(sourceBuffer, decision.separation.effectIntent);
  const artPlan = compileAssetArtTreatmentPlan({
    sourceClass: decision.source.sourceClass,
    mediaRole: decision.source.mediaRole,
    sourceArchetype: decision.presentation.archetype,
    sourceAuthority: decision.source.sourceAuthority,
    requestedTreatment: decision.art.selectedTreatment,
    outputRole: decision.art.outputRole,
    intensity: fixture.input.shot.effectIntensity,
    spotColor: fixture.input.shot.spotColor,
  });
  let rendered = (await renderAssetArtTreatment(separated, artPlan)).buffer;
  if (decision.art.supportTreatment) {
    const supportPlan = compileAssetArtTreatmentPlan({sourceClass: decision.source.sourceClass, mediaRole: decision.source.mediaRole, sourceArchetype: decision.presentation.archetype, sourceAuthority: decision.source.sourceAuthority, requestedTreatment: decision.art.supportTreatment, outputRole: "SUPPORT", intensity: "LOW"});
    rendered = (await renderAssetArtTreatment(rendered, supportPlan)).buffer;
  }
  return {buffer: rendered, cleanSha256: crypto.createHash("sha256").update(sourceBuffer).digest("hex")};
}

async function stats(file) {
  const metadata = await sharp(file).metadata();
  const statistics = await sharp(file).ensureAlpha().stats();
  return {width: Number(metadata.width || 0), height: Number(metadata.height || 0), hasAlpha: metadata.hasAlpha === true, alphaMin: statistics.channels[3]?.min ?? null, alphaMax: statistics.channels[3]?.max ?? null};
}

async function buildBoard(rows) {
  const tileWidth = 1000;
  const tileHeight = 560;
  const cols = 2;
  const composites = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const col = index % cols;
    const gridRow = Math.floor(index / cols);
    const left = col * tileWidth;
    const top = gridRow * tileHeight;
    const before = await sharp(row.cleanAsset.path).resize(430, 360, {fit: "inside"}).png().toBuffer();
    const after = await sharp(path.join(root, row.artifact.path)).resize(430, 360, {fit: "inside"}).png().toBuffer();
    const beforeMeta = await sharp(before).metadata();
    const afterMeta = await sharp(after).metadata();
    composites.push({input: checkerSvg(tileWidth / 2, 390), left, top});
    composites.push({input: checkerSvg(tileWidth / 2, 390), left: left + tileWidth / 2, top});
    composites.push({input: before, left: left + Math.round((tileWidth / 2 - Number(beforeMeta.width || 1)) / 2), top: top + Math.round((390 - Number(beforeMeta.height || 1)) / 2)});
    composites.push({input: after, left: left + tileWidth / 2 + Math.round((tileWidth / 2 - Number(afterMeta.width || 1)) / 2), top: top + Math.round((390 - Number(afterMeta.height || 1)) / 2)});
    const reason = row.decision.art.reasons[0] || "clean fallback";
    composites.push({input: labelSvg(tileWidth, 170, row.id, [`${row.decision.presentation.mode} · ${row.decision.separation.effectIntent}`, `${row.decision.art.selectedTreatment} · ${row.decision.art.outputRole}${row.decision.art.supportTreatment ? ` + ${row.decision.art.supportTreatment}` : ""}`, reason, `viewer: ${row.decision.shot.viewerTask}`]), left, top: top + 390});
  }
  const file = path.join(outputRoot, "automatic-decision-board.png");
  await sharp({create: {width: cols * tileWidth, height: Math.ceil(rows.length / cols) * tileHeight, channels: 4, background: "#111315"}}).composite(composites).png().toFile(file);
  return file;
}

async function buildSeparationProof(rows) {
  const selected = [rows.find((row) => row.id === "person-busy-identity"), rows.find((row) => row.id === "object-plane-explainer")];
  const width = 1600;
  const rowHeight = 500;
  const half = width / 2;
  const composites = [];
  for (let index = 0; index < selected.length; index += 1) {
    const row = selected[index];
    const top = index * rowHeight;
    const background = index === 0 ? busySvg(half, rowHeight - 64) : Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${half}" height="${rowHeight - 64}"><rect width="100%" height="100%" fill="#e9e3d8"/></svg>`);
    const cleanPreview = await sharp(row.cleanAsset.path).resize(680, 380, {fit: "inside"}).png().toBuffer();
    const treatedPreview = await sharp(path.join(root, row.artifact.path)).resize(680, 380, {fit: "inside"}).png().toBuffer();
    const cleanMeta = await sharp(cleanPreview).metadata();
    const treatedMeta = await sharp(treatedPreview).metadata();
    composites.push({input: background, left: 0, top});
    composites.push({input: background, left: half, top});
    composites.push({input: cleanPreview, left: Math.round((half - Number(cleanMeta.width || 1)) / 2), top: top + Math.round((rowHeight - 64 - Number(cleanMeta.height || 1)) / 2)});
    composites.push({input: treatedPreview, left: half + Math.round((half - Number(treatedMeta.width || 1)) / 2), top: top + Math.round((rowHeight - 64 - Number(treatedMeta.height || 1)) / 2)});
    composites.push({input: labelSvg(half, 64, `${row.id} · CLEAN`, ["separation baseline"]), left: 0, top: top + rowHeight - 64});
    composites.push({input: labelSvg(half, 64, `${row.id} · ${row.decision.separation.effectIntent}`, ["automatic separation treatment"]), left: half, top: top + rowHeight - 64});
  }
  const file = path.join(outputRoot, "automatic-separation-proof.png");
  await sharp({create: {width, height: selected.length * rowHeight, channels: 4, background: "#111315"}}).composite(composites).png().toFile(file);
  return file;
}

async function main() {
  ensureDir(assetRoot);
  for (const fixture of fixtures) if (!fs.existsSync(fixture.cleanAsset)) throw new Error(`orchestrator-clean-asset-missing:${fixture.id}`);
  const authorityFiles = {
    workspace: path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"),
    phase: path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"),
  };
  const initialAuthority = Object.fromEntries(Object.entries(authorityFiles).map(([key, file]) => [key, shaFile(file)]));
  const rows = [];
  for (const fixture of fixtures) {
    const decision = compileAssetTreatmentDecision(fixture.input);
    assertAssetTreatmentDecision(decision);
    const rendered = await renderDecision(fixture, decision);
    const file = path.join(assetRoot, `${fixture.id}.png`);
    fs.writeFileSync(file, rendered.buffer);
    rows.push({
      id: fixture.id,
      genre: fixture.genre,
      decision,
      cleanAsset: {path: fixture.cleanAsset, relativePath: path.relative(root, fixture.cleanAsset), sha256: rendered.cleanSha256},
      artifact: {path: path.relative(root, file), sha256: shaFile(file), ...await stats(file)},
    });
  }
  const board = await buildBoard(rows);
  const separationProof = await buildSeparationProof(rows);
  const finalAuthority = Object.fromEntries(Object.entries(authorityFiles).map(([key, file]) => [key, shaFile(file)]));
  if (JSON.stringify(initialAuthority) !== JSON.stringify(finalAuthority)) throw new Error("asset-treatment-orchestrator-mutated-formal-authority");
  const authorityAudit = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json"), "utf8"));
  const workspaceIdentity = JSON.parse(fs.readFileSync(authorityFiles.workspace, "utf8")).workspaceSha256 || null;
  const boardMeta = await sharp(board).metadata();
  const separationMeta = await sharp(separationProof).metadata();
  const renderResult = {
    contract: "A1AssetTreatmentOrchestratorRender/v1",
    status: "READY_FOR_ACTUAL_PIXEL_AUDIT",
    fixtures: rows,
    visibleArtifact: {path: path.relative(root, board), sha256: shaFile(board), width: Number(boardMeta.width || 0), height: Number(boardMeta.height || 0)},
    separationProof: {path: path.relative(root, separationProof), sha256: shaFile(separationProof), width: Number(separationMeta.width || 0), height: Number(separationMeta.height || 0)},
    boundary: {reviewOnly: true, productionAdmission: false, storyboardMutationPerformed: false, workbenchBindingPerformed: false, authorityUnchanged: true, authoritySnapshot: finalAuthority, workspaceIdentitySha256: workspaceIdentity, currentAuthorityAuditFresh: authorityAudit?.authority?.workspaceSha256 === workspaceIdentity, projectedWorkspaceSha256: authorityAudit?.authority?.workspaceSha256 || null},
  };
  fs.writeFileSync(path.join(outputRoot, "render-result.json"), `${JSON.stringify(renderResult, null, 2)}\n`);
  console.log(JSON.stringify({status: renderResult.status, decisions: rows.map((row) => ({id: row.id, mode: row.decision.presentation.mode, separation: row.decision.separation.effectIntent, art: row.decision.art.selectedTreatment, support: row.decision.art.supportTreatment, score: row.decision.art.score})), visibleArtifact: renderResult.visibleArtifact, boundary: renderResult.boundary}, null, 2));
}

await main();
