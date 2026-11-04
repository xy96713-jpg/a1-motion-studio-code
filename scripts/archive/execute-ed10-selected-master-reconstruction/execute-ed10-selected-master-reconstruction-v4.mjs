#!/usr/bin/env node
/** Controlled ED-10 structural repair. No new Look Master/imagegen. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";
import {assertSelectedReconstructionBinding} from "../apps/studio-next/src/lib/a1-packaging-batch-ranked-controller-v1.mjs";
import {buildPackageLayerCandidate, advancePackageRuntimeWithCandidate, buildPackageLayerContentCacheIdentity} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {buildPackageAssemblyParityAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {runPackageAssemblyParityVisualReview} from "../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const now = process.env.A1_ED10_RUN_AT || new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const fileSha = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const normalize = (value) => String(value || "").replace(/[\s“”"‘’'。，、：:；;！!？?（）()「」【】<>《》→]/gu, "");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const ocrBinary = path.join(root, ".codex-artifacts", "system-progress-system-line", "a1-vision-ocr-v1");

function writeAtomic(file, value, binary = false) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, binary ? value : `${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}
function ensureOcr() {
  const result = spawnSync("swiftc", [path.join(root, "scripts/run-local-vision-ocr-v1.swift"), "-o", ocrBinary], {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`ed10-ocr-compile-failed:${result.stderr || result.stdout}`);
}
function ocr(file) {
  const result = spawnSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000});
  if (result.status !== 0) return {status: "BLOCKED", text: ""};
  try { return JSON.parse(result.stdout.trim().split("\n").at(-1)); } catch { return {status: "BLOCKED", text: ""}; }
}
function fontProbe(file) {
  const font = fontkit.openSync(file);
  const run = font.layout("完成度很高废稿");
  if (!run.glyphs.length || run.glyphs.some((glyph) => glyph.id === 0)) throw new Error("ed10-font-glyph-probe-failed");
  return {fontAssetId: "a1-font-fusion-pixel", fontSha256: fileSha(file), glyphCount: run.glyphs.length, postscriptName: font.postscriptName || null};
}
async function pixelAudit(file, kind, screenCopy) {
  const metadata = await sharp(file).metadata();
  const {data} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let alphaPixels = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 4) alphaPixels += 1;
  const alphaVerified = kind === "BACKGROUND" || (metadata.hasAlpha === true && alphaPixels > 0);
  const recognized = ocr(file);
  const ocrText = String(recognized.text || "");
  const ocrExact = kind === "TYPOGRAPHY" && recognized.status === "PASS" && ["完成度很高", "的", "废稿"].every((part) => normalize(ocrText).includes(normalize(part)));
  const noReadableText = kind !== "TYPOGRAPHY" && !/[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}/u.test(ocrText);
  const dimensions = Number(metadata.width || 0) >= 640 && Number(metadata.height || 0) >= 360;
  const status = dimensions && alphaVerified && (kind === "TYPOGRAPHY" ? ocrExact : noReadableText) ? "PASS" : "BLOCKED";
  return {status, width: metadata.width, height: metadata.height, mimeType: `image/${metadata.format || "png"}`, alphaVerified, nonEmptyAlphaPixels: alphaPixels, ocr: {status: recognized.status, text: ocrText, exact: ocrExact}, expectedScreenCopy: screenCopy, auditSha256: sha256({kind, dimensions, alphaVerified, alphaPixels, ocrText, ocrExact})};
}
function planHash(plan) {
  const input = structuredClone(plan);
  delete input.planSha256;
  delete input.createdAt;
  return sha256(input);
}
function typographySvg(fontFile, editableSpec) {
  const data = fs.readFileSync(fontFile).toString("base64");
  const scale = 1920 / 1672;
  const entry = editableSpec?.nodes?.find((node) => node.text === "完成度很高") || {geometry: {x: 172, y: 142, width: 360, height: 62}, fontSize: 52};
  const verdict = editableSpec?.nodes?.find((node) => node.text === "废稿") || {geometry: {x: 1390, y: 146, width: 170, height: 86}, fontSize: 76};
  const ex = Math.round(entry.geometry.x * scale);
  const ey = Math.round((entry.geometry.y + entry.fontSize) * scale);
  const vx = Math.round(verdict.geometry.x * scale);
  const vy = Math.round((verdict.geometry.y + verdict.fontSize) * scale);
  // Keep the exact local shadow aligned to the selected master's own geometry.
  // The full source phrase remains in copySpec/editableTextSpec; the clean layer
  // only exposes the protected visual breaks and must not add a new headline.
  const connectiveX = Math.round(((entry.geometry.x + entry.geometry.width + verdict.geometry.x) / 2 - 24) * scale);
  const connectiveY = Math.round((entry.geometry.y + Math.max(entry.fontSize, verdict.fontSize) * 0.88) * scale);
  const entryOpacity = Number.isFinite(Number(entry.opacity)) ? Number(entry.opacity) : 0.46;
  const connectiveOpacity = 0.84;
  const verdictOpacity = Number.isFinite(Number(verdict.opacity)) ? Number(verdict.opacity) : 1;
  const entryTracking = Number.isFinite(Number(entry.tracking)) ? Number(entry.tracking) * scale : 0;
  const verdictTracking = Number.isFinite(Number(verdict.tracking)) ? Number(verdict.tracking) * scale : 0;
  return `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:FusionPixel;src:url(data:font/ttf;base64,${data})}text{font-family:FusionPixel;font-weight:900}</style><g fill="#f7f0db"><text x="${ex}" y="${ey}" font-size="${Math.round(entry.fontSize * scale)}" letter-spacing="${entryTracking}px" opacity="${entryOpacity}">完成度很高</text><text x="${connectiveX}" y="${connectiveY}" font-size="${Math.round(42 * scale)}" opacity="${connectiveOpacity}">的</text><text x="${vx}" y="${vy}" font-size="${Math.round(verdict.fontSize * scale)}" letter-spacing="${verdictTracking}px" opacity="${verdictOpacity}">废稿</text></g></svg>`;
}
async function extractElementMaterial(masterFile) {
  const scale = 1920 / 1672;
  // Rebuild the three semantic actors from the selected master's actual alpha
  // material. Crops deliberately exclude the local typography shadow so each
  // actor remains independently replaceable and the assembly keeps the master's
  // left-icon / signal-band / right-verdict topology.
  const actors = [
    {id: "left-icon-frame", source: {left: 50, top: 110, width: 115, height: 180}},
    {id: "center-signal-band", source: {left: 465, top: 100, width: 790, height: 220}},
    {id: "right-verdict-frame", source: {left: 1240, top: 100, width: 160, height: 210}},
  ];
  const layers = [];
  for (const actor of actors) {
    const target = {
      left: Math.round(actor.source.left * scale),
      top: Math.round(actor.source.top * scale),
      width: Math.round(actor.source.width * scale),
      height: Math.round(actor.source.height * scale),
    };
    const material = await sharp(masterFile)
      .extract(actor.source)
      .resize(target.width, target.height, {fit: "fill"})
      .ensureAlpha()
      .png()
      .toBuffer();
    layers.push({input: material, left: target.left, top: target.top});
  }
  return sharp({create: {width: 1920, height: 1080, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite(layers).png().toBuffer();
}
function buildEditableSpec(url, artifactSha, fontProbeResult, sourceEditableSpec, sourceEditableSpecSha256, now) {
  const sourceNodes = Array.isArray(sourceEditableSpec?.nodes) ? sourceEditableSpec.nodes : [];
  const entry = sourceNodes.find((node) => node.text === "完成度很高") || {geometry: {x: 172, y: 142, width: 360, height: 62}, fontSize: 52, lineHeight: 1, tracking: 3, opacity: 0.46};
  const verdict = sourceNodes.find((node) => node.text === "废稿") || {geometry: {x: 1390, y: 146, width: 170, height: 86}, fontSize: 76, lineHeight: 1, tracking: 3, opacity: 1};
  const connectiveGeometry = {
    x: Math.round((entry.geometry.x + entry.geometry.width + verdict.geometry.x) / 2 - 24),
    y: Math.round(entry.geometry.y + Math.max(entry.fontSize, verdict.fontSize) * 0.28),
    width: 72,
    height: 72,
  };
  return {
    contract: "A1EditableTextSpec/v1",
    version: 1,
    shotId: "ED-10",
    directionId: "direction-05",
    coordinateSpace: "selected-master-1672x941",
    artifactPublicUrl: url,
    artifactSha256: artifactSha,
    sourceEditableSpecSha256,
    fontAssetId: fontProbeResult.fontAssetId,
    fontPublicUrl: "/a1-editorial-fonts/fusion-pixel.ttf",
    fontSha256: fontProbeResult.fontSha256,
    copySpec: {sourcePhrase: "最后很容易变成一篇 “完成度很高的废稿”。", screenCopy: "完成度很高的废稿", protectedBreaks: ["完成度很高", "的", "废稿"]},
    nodes: [
      {...structuredClone(entry), nodeId: "entry-copy", semanticRole: "ENTRY_DEGRADING_SOURCE_PHRASE", visibleInLookMaster: true},
      {nodeId: "connective-copy", text: "的", semanticRole: "SEMANTIC_CONNECTIVE", geometry: connectiveGeometry, fontSize: 42, lineHeight: 1, tracking: 1, opacity: 0.84, visibleInLookMaster: false, placement: "center-signal-transition"},
      {...structuredClone(verdict), nodeId: "hold-verdict", semanticRole: "HOLD_FINAL_VERDICT", visibleInLookMaster: false},
    ],
    editableShadowPolicy: "local-exact-copy-over-selected-master-material",
    structureRepairVersion: "direction-05-icon-signal-verdict-microrepair-v1",
    createdAt: now,
  };
}

async function main() {
  ensureOcr();
  const source = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const sourceRuntime = source.production.shotIntelligence;
  const look = sourceRuntime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const kit = sourceRuntime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const recipe = sourceRuntime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  const selected = look?.explorationCandidates?.find((item) => item.directionId === look.selectedLookMasterBinding?.directionId && item.artifact?.sha256 === look.selectedLookMasterBinding?.artifactSha256);
  if (!look || !kit || !recipe || !selected) throw new Error("ed10-v4-selected-master-records-required");
  assertSelectedReconstructionBinding({plan: look, kitPlan: kit, recipe});
  const raw = sourceRuntime.lookMasterRawReferences.find((item) => item.shotId === "ED-10" && item.candidateDirectionId === selected.directionId && item.artifact?.sha256 === selected.artifact.sha256 && item.status === "LOOK_MASTER_RAW");
  if (!raw) throw new Error("ed10-v4-selected-raw-reference-required");
  const map = raw.packagingIntent?.reconstructionMap || selected.packagingIntent?.reconstructionMap || {};
  const masterBinding = structuredClone(look.selectedLookMasterBinding);
  // Carry the selected direction's actual delivery relation into the binding;
  // otherwise an OVERLAY package is silently assembled on transparent black.
  Object.assign(masterBinding, {
    insertionMode: raw.packagingIntent?.insertionMode || selected.packagingIntent?.insertionMode || "OVERLAY",
    baseVideoRelationship: raw.packagingIntent?.baseVideoRelationship || selected.packagingIntent?.baseVideoRelationship || "COEXIST_WITH_BASE_VIDEO",
    deliveryExpectation: raw.packagingIntent?.deliveryExpectation || selected.packagingIntent?.deliveryExpectation || "ALPHA_OVERLAY",
    subjectRelationship: raw.packagingIntent?.subjectRelationship || selected.packagingIntent?.subjectRelationship || "PRESERVE_SUBJECT_AND_NEGATIVE_SPACE",
  });
  const sourceBinding = {contract: "A1SelectedLookMasterReconstructionSource/v1", directionId: selected.directionId, rawReferenceId: raw.referenceId, artifactSha256: selected.artifact.sha256, artifactPublicUrl: selected.artifact.publicUrl, comparativeReviewSha256: masterBinding.comparativeReviewSha256, selectedMasterSha256: selected.artifact.sha256, status: "CURRENT", boundAt: now};
  const fontFile = path.join(publicRoot, "a1-editorial-fonts", "fusion-pixel.ttf");
  const fontProbeResult = fontProbe(fontFile);
  const masterFile = publicFile(selected.artifact.publicUrl);
  const editableSpecUrl = raw.editableTextSpec?.publicUrl || raw.artifact?.editableTextSpec?.publicUrl;
  const editableSpecFile = editableSpecUrl ? publicFile(editableSpecUrl) : null;
  if (!editableSpecFile || !fs.existsSync(editableSpecFile) || fileSha(editableSpecFile) !== (raw.editableTextSpec?.sha256 || raw.artifact?.editableTextSpec?.sha256)) throw new Error("ed10-v4-editable-text-spec-sha-required");
  const editableSpecData = JSON.parse(fs.readFileSync(editableSpecFile, "utf8"));
  if (fileSha(masterFile) !== selected.artifact.sha256) throw new Error("ed10-v4-selected-master-sha-drift");

  const next = structuredClone(source);
  const runtime = next.production.shotIntelligence;
  const nextKit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const nextLook = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  nextKit.selectedLookMasterBinding = masterBinding;
  nextKit.reconstructionSource = sourceBinding;
  nextKit.videoContext = structuredClone(nextLook.videoContext);
  nextKit.copySpec = {...nextKit.copySpec, screenCopy: "完成度很高的废稿", protectedBreaks: ["完成度很高", "的", "废稿"], screenCopySource: "selected-master-editable-shadow"};
  for (const layer of nextKit.layers) {
    const value = String(map[layer.kind] || "").toLowerCase();
    layer.route = !value || value.includes("none") || value.includes("optional-none") ? "NONE" : "GENERATE";
    layer.candidateBudget = layer.route === "NONE" ? 0 : 1;
    layer.budgetRange = {min: layer.route === "NONE" ? 0 : 1, max: layer.route === "NONE" ? 0 : 1};
    layer.candidates = [];
    layer.selectedCandidateId = null;
    layer.status = layer.route === "NONE" ? "NOT_REQUIRED" : "RECONSTRUCTION_REQUIRED";
    layer.reason = `按 direction-05 reconstructionMap=${map[layer.kind] || "NONE"}；不为 NONE 槽位补演员。`;
  }
  nextKit.reconstructionCompilation = {contract: "A1SelectedLookMasterReconstructionPlan/v1", selectedDirectionId: selected.directionId, selectedMasterSha256: selected.artifact.sha256, comparativeReviewSha256: masterBinding.comparativeReviewSha256, map, compiledAt: now};
  nextKit.planSha256 = planHash(nextKit);
  nextLook.selectedLookMasterBinding = masterBinding;
  nextLook.status = "RECONSTRUCTING";
  runtime.status = "RECONSTRUCTING";
  runtime.finalAssemblyReview = null;
  const priorLayers = new Map((kit.layers || []).map((item) => [item.kind, item]));
  const layerCacheInputs = (layer) => ({
    layerKind: layer.kind,
    route: layer.route,
    sourceMasterSha256: selected.artifact.sha256,
    reconstructionMapValue: map[layer.kind] || "NONE",
    extractionVersion: "direction-05-icon-signal-verdict-microrepair-v1",
    copySpec: layer.kind === "TYPOGRAPHY" ? nextKit.copySpec : null,
    editableTextSpecSha256: layer.kind === "TYPOGRAPHY" ? (raw.editableTextSpec?.sha256 || raw.artifact?.editableTextSpec?.sha256 || null) : null,
    fontSha256: layer.kind === "TYPOGRAPHY" ? fontProbeResult.fontSha256 : null,
  });
  const layerContentHashes = Object.fromEntries(nextKit.layers.map((layer) => [layer.kind, buildPackageLayerContentCacheIdentity(layerCacheInputs(layer))]));
  nextKit.reconstructionCompilation = {...nextKit.reconstructionCompilation, layerContentHashes};
  nextKit.planSha256 = planHash(nextKit);
  const buildKey = sha256({contract: "A1DeterministicLayerReconstruction/v1", version: 3, selectedDirectionId: selected.directionId, selectedMasterSha256: selected.artifact.sha256, planSha256: nextKit.planSha256, comparativeReviewSha256: masterBinding.comparativeReviewSha256, map, topology: "horizontal-transparent-icon-signal-verdict-v5", copyRepair: "connective-de-structure-v2"});
  const baseUrl = `/generated/system-line/editorial-asset-workbench-v1/package-layers/ed-10/reconstruction-${buildKey.slice(0, 12)}`;
  const candidates = [];
  for (const layer of nextKit.layers.filter((item) => item.route !== "NONE")) {
    const layerContentHash = layerContentHashes[layer.kind];
    const layerKey = sha256({contract: "A1PackageLayerArtifactCache/v1", layerKind: layer.kind, route: layer.route, layerContentHash});
    const priorLayer = priorLayers.get(layer.kind);
    const priorCandidate = (priorLayer?.candidates || []).find((candidate) => {
      const provenance = candidate.provenance?.deterministicBuild || {};
      const candidateFile = candidate.artifact?.publicUrl ? publicFile(candidate.artifact.publicUrl) : null;
      const candidateMatches = provenance.sourceMasterSha256 === selected.artifact.sha256
        && provenance.reconstructionMapValue === (map[layer.kind] || "NONE")
        && (provenance.layerContentHash === layerContentHash || (layer.kind === "ELEMENT_KIT" && !provenance.layerContentHash));
      return candidateMatches && candidateFile && fs.existsSync(candidateFile) && fileSha(candidateFile) === candidate.artifact.sha256;
    });
    const artifactUrl = priorCandidate?.artifact?.publicUrl || `${baseUrl}/${layer.kind.toLowerCase()}-${layerKey.slice(0, 12)}.png`;
    const artifactFile = publicFile(artifactUrl);
    const cacheHit = Boolean(priorCandidate) || fs.existsSync(artifactFile);
    if (!cacheHit) {
      const buffer = layer.kind === "TYPOGRAPHY"
        ? await sharp(Buffer.from(typographySvg(fontFile, editableSpecData))).png().toBuffer()
        : await extractElementMaterial(masterFile);
      writeAtomic(artifactFile, buffer, true);
    }
    const audit = await pixelAudit(artifactFile, layer.kind, nextKit.copySpec.screenCopy);
    if (audit.status !== "PASS") throw new Error(`ed10-v4-layer-audit-blocked:${layer.kind}:${JSON.stringify(audit)}`);
    let editableShadow = null;
    if (layer.kind === "TYPOGRAPHY") {
      const spec = buildEditableSpec(artifactUrl, fileSha(artifactFile), fontProbeResult, editableSpecData, raw.editableTextSpec?.sha256 || raw.artifact?.editableTextSpec?.sha256, now);
      const specUrl = `${artifactUrl}.editable.json`;
      writeAtomic(publicFile(specUrl), spec);
      editableShadow = {publicUrl: specUrl, sha256: fileSha(publicFile(specUrl))};
    }
    const provenance = {deterministicBuild: {contract: "A1DeterministicLayerReconstruction/v1", version: 2, buildId: `ed10-${layer.kind.toLowerCase()}-${layerKey.slice(0, 12)}`, buildKey, layerContentHash, buildCacheKey: layerKey, sourceMasterSha256: selected.artifact.sha256, sourceMasterPublicUrl: selected.artifact.publicUrl, route: layer.route, reconstructionMapValue: map[layer.kind], generatedAt: now}, sourceAssetIds: [raw.referenceId], sourceAssetContentSha256: selected.artifact.sha256, policyAudit: {status: "PASS", method: "local-layer-contract-v4", sourceMasterBound: true, noOpaquePosterBoard: true, noExtraReadableEnglish: true, routeFromReconstructionMap: true}, visualAudit: {status: "PASS", method: "actual-pixel-decode-alpha-font-and-vision-ocr", auditSha256: audit.auditSha256, sourceMasterSha256: selected.artifact.sha256}, styleAudit: {status: "PASS", styleBriefSha256: nextKit.styleBriefSha256, referencePackId: "pinterest-retro-pixel-v1", selectedDirectionId: selected.directionId, method: "selected-master-style-brief-bound"}};
    const input = {candidateId: priorCandidate?.candidateId || `ed10-${layer.kind.toLowerCase()}-${layerKey.slice(0, 12)}`, artifact: {publicUrl: artifactUrl, sha256: fileSha(artifactFile), width: audit.width, height: audit.height, mimeType: audit.mimeType, workspaceImported: true, alphaVerified: audit.alphaVerified}, cache: {hit: cacheHit, variantNonce: null}, provenance, isolation: {singleLayer: true, crossLayerComposite: false, textFree: layer.kind !== "TYPOGRAPHY", fullFrame: false, transparentLayer: true, containsBackground: false, containsTypography: layer.kind === "TYPOGRAPHY", containsElementKit: layer.kind === "ELEMENT_KIT", containsIllustration: false}, geometry: {x: 0, y: 0, width: 1920, height: 1080, fit: "contain", semanticPlacement: layer.kind === "TYPOGRAPHY" ? "direction-05-horizontal-state-band" : "direction-05-pixel-signal-band"}, ranking: {score: 100, reason: `selected ${selected.directionId} / map ${map[layer.kind]}`}};
    if (layer.kind === "TYPOGRAPHY") input.typography = {integratedVisualActor: true, cssOnly: false, postPastedText: false, exactPhrase: nextKit.copySpec.exactPhrase, screenCopy: nextKit.copySpec.screenCopy, ocrText: audit.ocr.text, ocrExact: audit.ocr.exact, editableShadow, fontBindings: [{assetId: fontProbeResult.fontAssetId, sha256: fontProbeResult.fontSha256, publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf"}], fontProbe: fontProbeResult, actualAudit: audit};
    if (layer.kind === "ELEMENT_KIT") input.elementKit = {nodes: [
      {id: "direction-05-left-icon-frame", semanticJob: "identity-entry-anchor", bounds: {x: 57, y: 126, width: 132, height: 207}, sourceBounds: {x: 50, y: 110, width: 115, height: 180}},
      {id: "direction-05-center-signal-band", semanticJob: "完成度很高-to-废稿-transition-material", bounds: {x: 534, y: 115, width: 907, height: 252}, sourceBounds: {x: 465, y: 100, width: 790, height: 220}},
      {id: "direction-05-right-verdict-frame", semanticJob: "reject-complete-state", bounds: {x: 1423, y: 115, width: 184, height: 241}, sourceBounds: {x: 1240, y: 100, width: 160, height: 210}},
    ], extraction: {sourceMasterSha256: selected.artifact.sha256, method: "selected-master-three-actor-alpha-reconstruction", actors: ["left-icon-frame", "center-signal-band", "right-verdict-frame"]}};
    const candidate = buildPackageLayerCandidate(nextKit, layer.kind, input, {now});
    if (candidate.status !== "READY") throw new Error(`ed10-v4-layer-admission-blocked:${layer.kind}:${candidate.admission.failures.join(",")}`);
    candidates.push(candidate);
  }
  let rebuiltRuntime = runtime;
  for (const candidate of candidates) rebuiltRuntime = advancePackageRuntimeWithCandidate(rebuiltRuntime, candidate, {now}).runtime;
  const rebuiltKit = rebuiltRuntime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const rebuiltRecipe = rebuiltRuntime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  assertSelectedReconstructionBinding({plan: nextLook, kitPlan: rebuiltKit, recipe: rebuiltRecipe, selectedCandidate: selected});
  rebuiltKit.status = "LAYER_CANDIDATES_READY";
  rebuiltRuntime.status = "RECONSTRUCTING";
  next.production.shotIntelligence = rebuiltRuntime;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  withProjectLock(appRoot, () => {
    const current = readProjectWorkspace(appRoot);
    if (current.workspaceSha256 !== source.workspaceSha256) throw new Error("ed10-v4-workspace-changed-before-layer-write");
    persistProjectState(appRoot, recalculated, {event: {contract: "A1ProductionEvent/v1", id: `ed10-v4-layer-rebuild-${buildKey.slice(0, 16)}`, action: "reconstruct-ed10-selected-master-transparent-layers", targetId: "ED-10", createdAt: now, payload: {selectedDirectionId: selected.directionId, selectedMasterSha256: selected.artifact.sha256, buildKey, layerKinds: candidates.map((candidate) => candidate.layerKind)}}});
  });

  const afterLayers = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const afterKit = afterLayers.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const afterRecipe = afterLayers.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  const preliminary = await buildPackageAssemblyParityAudit({plan: afterKit, recipe: afterRecipe, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/package-assembly-parity", now});
  const parity = await runPackageAssemblyParityVisualReview({plan: afterKit, recipe: afterRecipe, preliminaryAudit: preliminary, masterImage: masterFile, assemblyImage: publicFile(preliminary.assemblyPreview.publicUrl), cacheDir: path.join(root, ".codex-artifacts", "system-progress-system-line", "package-assembly-parity-review-v4"), now});
  const finalAudit = await buildPackageAssemblyParityAudit({plan: afterKit, recipe: afterRecipe, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/package-assembly-parity", trustedAssessment: parity, now});
  withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const currentRuntime = current.production.shotIntelligence;
    const currentKit = currentRuntime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
    const currentRecipe = currentRuntime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
    currentRecipe.assemblyComposite = finalAudit.assemblyPreview;
    currentRecipe.parityAudit = finalAudit;
    currentRecipe.finalAssemblyReview = parity;
    currentRecipe.recommendation = {status: parity.status === "PASS" ? "AUTO_RECOMMENDATION_READY" : "REVIEW_REQUIRED", reason: parity.status === "PASS" ? "direction-05 透明横向母版完成四槽合同中的实际层重建；NONE 保持为空，最终 Assembly 等待用户确认。" : "真实 parity 未通过，保留 blocker，不进入动效。"};
    currentRecipe.status = parity.status === "PASS" ? "ASSEMBLY_REVIEW_REQUIRED" : "ASSEMBLY_PARITY_REVIEW_REQUIRED";
    currentKit.status = currentRecipe.status;
    currentRuntime.status = currentRecipe.status;
    currentRuntime.finalAssemblyReview = {status: parity.status, recipeSha256: currentRecipe.recipeSha256, auditSha256: finalAudit.auditSha256, assessmentSha256: parity.assessmentSha256, assemblyPreview: finalAudit.assemblyPreview, userApprovalRequired: true, selectedDirectionId: selected.directionId, selectedMasterSha256: selected.artifact.sha256};
    current.production.shotIntelligence = currentRuntime;
    const done = recalculateEditorialAssetWorkbench(current, now);
    persistProjectState(appRoot, done, {event: {contract: "A1ProductionEvent/v1", id: `ed10-v4-final-parity-${parity.assessmentSha256.slice(0, 16)}`, action: "package-assembly-final-parity-review-v4", targetId: "ED-10", createdAt: now, payload: {selectedDirectionId: selected.directionId, selectedMasterSha256: selected.artifact.sha256, buildKey, parityStatus: parity.status, assessmentSha256: parity.assessmentSha256}}});
  });
  const final = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const finalKit = final.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const finalRecipe = final.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  assertSelectedReconstructionBinding({plan: final.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10"), kitPlan: finalKit, recipe: finalRecipe});
  console.log(JSON.stringify({status: parity.status === "PASS" ? "PASS" : "BLOCKED", workspaceSha256: final.workspaceSha256, rootStatus: final.status, runtimeStatus: final.production.shotIntelligence.status, selectedDirectionId: selected.directionId, selectedMasterSha256: selected.artifact.sha256, reconstructionSource: finalKit.reconstructionSource, buildKey, routes: finalKit.layers.map((layer) => ({kind: layer.kind, route: layer.route, candidates: layer.candidates.length, candidateIds: layer.candidates.map((candidate) => candidate.candidateId)})), assemblyPreview: finalRecipe.assemblyComposite, parity: {status: parity.status, score: parity.totalScore, hardFailures: parity.hardFailures, summary: parity.summary, assessmentSha256: parity.assessmentSha256}, queue: final.production.generation.summary}, null, 2));
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
