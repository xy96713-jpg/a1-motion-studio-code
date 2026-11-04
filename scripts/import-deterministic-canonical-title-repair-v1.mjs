#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {updateRepairManifestSidecar} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {A1_HERO_TITLE_STYLE_MODES, deriveHeroTitlePresentation} from "../apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const fontFile = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const repairManifestPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json");
// persistProjectState resolves binaryFiles relative to the already-scoped
// editorial-asset-workbench publicDir, so keep this relative path short.
const outputDir = "canonical-title-repair-deterministic-v1";
// Keep the image runtime on the same sharp/libvips version as the app that
// owns the workbench.  Loading the root and app copies in one process emits
// duplicate Objective-C class warnings and adds avoidable startup risk.
const requireApp = createRequire(path.join(appRoot, "package.json"));
const requireRoot = createRequire(import.meta.url);
const sharp = requireApp("sharp");
const fontkit = requireRoot("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const fontBytes = fs.readFileSync(fontFile);
const fontSha256 = sha256(fontBytes);
const expectedFontSha256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
if (fontSha256 !== expectedFontSha256) throw new Error(`deterministic-title-font-sha-mismatch:${fontSha256}`);
const font = fontkit.create(fontBytes);
const exactTextFontPath = "/System/Library/Fonts/Hiragino Sans GB.ttc";
const exactTextFontCollection = fontkit.openSync(exactTextFontPath);
const exactTextFont = exactTextFontCollection.fonts?.find((candidate) => candidate.hasGlyphForCodePoint("整".codePointAt(0))) || exactTextFontCollection.fonts?.[0];
if (!exactTextFont) throw new Error("deterministic-title-exact-text-font-missing");
const exactTextFontSha256 = sha256(fs.readFileSync(exactTextFontPath));
const now = new Date().toISOString();

function glyphLine({text, x, baseline, size, fill, tracking = 0, opacity = 1, fontInstance = font}) {
  const scale = size / fontInstance.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = fontInstance.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`deterministic-title-glyph-missing:${character}`);
    glyphIds.push(glyph.id);
    paths.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(3)} ${baseline.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + tracking;
  }
  return {width: cursor - x, glyphIds, markup: `<g fill="${fill}" opacity="${opacity}">${paths.join("")}</g>`};
}

function buildEd08() {
  // True alpha overlay: every visible glyph stays inside the measured expanded-left region.
  const upper = glyphLine({text: "AI 常常", x: 86, baseline: 474, size: 130, tracking: 5, fill: "#7898ff"});
  const lower = glyphLine({text: "不说人话", x: 86, baseline: 716, size: 130, tracking: 4, fill: "#f2f5f4"});
  const shadow = glyphLine({text: "不说人话", x: 98, baseline: 728, size: 130, tracking: 4, fill: "#2452ff", opacity: 0.45});
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${upper.markup}${shadow.markup}${lower.markup}</svg>`;
  return {bytes: null, svg, textNodes: [{id: "canonical-prefix", text: "AI 常常", x: 86, y: 474, size: 130, fontSha256, editable: true, generated: false, glyphIds: upper.glyphIds}, {id: "canonical-verdict", text: "不说人话", x: 86, y: 716, size: 130, fontSha256, editable: true, generated: false, glyphIds: lower.glyphIds}]};
}

function buildEd19() {
  // EVA owns the readable title actor: the compact identity line is kept
  // editable and explicit, while the four verbs form the second visual rail.
  // ED-19 is formally bound to EVA_MECHANISM_CJK. Keep the deterministic
  // fallback on the same hash-bound Fusion Pixel asset as the rest of the
  // EVA route instead of silently switching to a system CJK font.
  const identity = glyphLine({text: "Codex 在后台", x: 80, baseline: 355, size: 150, tracking: 4, fill: "#7898ff"});
  const a = glyphLine({text: "整理", x: 80, baseline: 700, size: 168, tracking: 8, fill: "#f2f5f4"});
  const b = glyphLine({text: "编排", x: 540, baseline: 700, size: 168, tracking: 8, fill: "#7898ff"});
  const c = glyphLine({text: "读取", x: 1000, baseline: 700, size: 168, tracking: 8, fill: "#f2f5f4"});
  const d = glyphLine({text: "检查", x: 1460, baseline: 700, size: 168, tracking: 8, fill: "#2452ff"});
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <rect width="1920" height="1080" fill="#0b131a"/>
    ${identity.markup}${a.markup}${b.markup}${c.markup}${d.markup}
  </svg>`;
  return {bytes: null, svg, textNodes: [{id: "identity-line", text: "Codex 在后台", x: 80, y: 355, size: 150, fontFamily: font.familyName, fontSha256, editable: true, generated: false, glyphIds: identity.glyphIds}, {id: "verb-arrange", text: "整理", x: 80, y: 700, size: 168, fontFamily: font.familyName, fontSha256, editable: true, generated: false, glyphIds: a.glyphIds}, {id: "verb-compose", text: "编排", x: 540, y: 700, size: 168, fontFamily: font.familyName, fontSha256, editable: true, generated: false, glyphIds: b.glyphIds}, {id: "verb-read", text: "读取", x: 1000, y: 700, size: 168, fontFamily: font.familyName, fontSha256, editable: true, generated: false, glyphIds: c.glyphIds}, {id: "verb-check", text: "检查", x: 1460, y: 700, size: 168, fontFamily: font.familyName, fontSha256, editable: true, generated: false, glyphIds: d.glyphIds}]};
}

function buildEd13() {
  // Keep the contrast actor short and deliberately separated: the visible
  // copy contract is "更顺一些 / 没解决", while the longer spoken claims
  // remain provenance-only. Both clusters stay inside the declared left
  // negative space and use the same editable glyph-outline route as ED-08.
  const upper = glyphLine({text: "更顺一些", x: 86, baseline: 470, size: 136, tracking: 5, fill: "#7898ff", fontInstance: exactTextFont});
  const lower = glyphLine({text: "没解决", x: 86, baseline: 710, size: 160, tracking: 6, fill: "#f2f5f4", fontInstance: exactTextFont});
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${upper.markup}${lower.markup}</svg>`;
  return {bytes: null, svg, textNodes: [{id: "contrast-smoother", text: "更顺一些", x: 86, y: 470, size: 136, fontFamily: exactTextFont.familyName, fontSha256: exactTextFontSha256, editable: true, generated: false, glyphIds: upper.glyphIds}, {id: "contrast-unresolved", text: "没解决", x: 86, y: 710, size: 160, fontFamily: exactTextFont.familyName, fontSha256: exactTextFontSha256, editable: true, generated: false, glyphIds: lower.glyphIds}]};
}

const requestedShotIds = (process.argv.find((value) => value.startsWith("--shotIds="))?.slice("--shotIds=".length) || "ED-08,ED-13,ED-19").split(",").map((value) => value.trim()).filter(Boolean);
const designBuilders = {"ED-08": buildEd08, "ED-13": buildEd13, "ED-19": buildEd19};
const designs = requestedShotIds.filter((shotId) => designBuilders[shotId]).map((shotId) => ({shotId, design: designBuilders[shotId]() }));
if (!designs.length) throw new Error("deterministic-title-repair-shot-filter-empty");
for (const item of designs) {
  const rendered = sharp(Buffer.from(item.design.svg));
  // Fullscreen takeovers are opaque; keeping a three-channel PNG lets the
  // pixel gate segment title pixels from the flat field instead of treating
  // the whole transparent-capable canvas as foreground.
  item.design.bytes = await (item.shotId === "ED-19" ? rendered.removeAlpha() : rendered).png({compressionLevel: 9}).toBuffer();
}

const transaction = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("deterministic-title-repair-requires-frozen-idle-runtime");
  if ((runtime.currentAssembly || []).length !== 0) throw new Error("deterministic-title-repair-assembly-must-remain-empty");
  const imported = [];
  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  const binaryFiles = {};
  const reportFiles = {};
  for (const item of designs) {
    const plan = nextRuntime.packageLookMasterPlans.find((candidate) => candidate.shotId === item.shotId);
    if (!plan) throw new Error(`deterministic-title-repair-plan-missing:${item.shotId}`);
    const artifactSha256 = sha256(item.design.bytes);
    const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/${outputDir}/${item.shotId}.png`;
    const relativeFile = `${outputDir}/${item.shotId}.png`;
    const existing = nextRuntime.lookMasterRawReferences.find((raw) => raw.shotId === item.shotId && raw.planSha256 === plan.planSha256 && raw.artifact?.sha256 === artifactSha256);
    // Re-running the bounded importer is safe: retain an identical already
    // imported artifact and only transact newly changed deterministic pixels.
    if (existing) {
      if (existing.artifact?.publicUrl !== publicUrl) existing.artifact.publicUrl = publicUrl;
      // Backfill the formal-style binding on artifacts imported before the
      // EVA fallback was made explicit.  Without this field, a passing pixel
      // audit cannot close the current-plan admission gate.
      existing.artifact.formalTypographyBinding = {
        ...(existing.artifact.formalTypographyBinding || {}),
        heroTitleStyleMode: plan.canonicalRepair?.formalTypographyStyleMode || null,
        fontAssetId: "type-a1-fusion-pixel",
        fontFamily: item.design.textNodes[0]?.fontFamily || font.familyName,
        fontSha256: item.design.textNodes[0]?.fontSha256 || fontSha256,
        renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES",
        generatedFormalText: false,
      };
      continue;
    }
    const prompt = `Deterministic canonical title repair for ${item.shotId}; exact visible copy is bound after generation with editable direct glyph outlines; no imagegen baked text.`;
    const promptSha256 = sha256(prompt);
    const boundFontSha256 = item.design.textNodes[0]?.fontSha256 || fontSha256;
    const generationInputHash = sha256({shotId: item.shotId, planSha256: plan.planSha256, styleBriefSha256: plan.styleBriefSha256, fontSha256: boundFontSha256, glyphIds: item.design.textNodes.map((node) => node.glyphIds), promptSha256});
    const jobId = `deterministic-canonical-title-repair-${item.shotId.toLowerCase()}-${artifactSha256.slice(0, 12)}`;
    const artifact = {contract: "A1GeneratedEditorialAssetCache/v1", assetId: null, targetKind: "package-look-master", briefId: `look-master-${item.shotId.toLowerCase()}-canonical-title-repair`, briefHash: sha256({planSha256: plan.planSha256, textNodes: item.design.textNodes}), treatmentHash: sha256({fontSha256: boundFontSha256, textNodes: item.design.textNodes}), shotId: item.shotId, layerId: null, provider: "deterministic-typography-authority", model: "fontkit-direct-glyph-outlines", prompt, promptSha256, generationInputHash, cacheKey: generationInputHash, sha256: artifactSha256, publicUrl, mimeType: "image/png", generationId: jobId, width: 1920, height: 1080, hasAlpha: item.shotId === "ED-08", cacheHit: false, durationMs: 0, generatedAt: now, workspaceImported: true, productionMethod: "DETERMINISTIC_EDITABLE_GLYPH_OUTLINE_CANONICAL_REPAIR", referencePackagingContract: "A1UniversalReferenceToImagegenPackaging/v1", imagegenAttachmentCount: 0, imagegenAttachmentManifestSha256: null, formalTypographyBinding: {contract: "A1FormalTypographyGlyphBinding/v1", renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", heroTitleStyleMode: plan.canonicalRepair?.formalTypographyStyleMode || null, fontAssetId: "type-a1-fusion-pixel", fontFamily: item.design.textNodes[0]?.fontFamily || font.familyName, fontSha256: boundFontSha256, editableText: true, generatedFormalText: false, textNodes: item.design.textNodes}};
    const job = {contract: "A1AssetGenerationJob/v2", id: jobId, projectId: current.production.project.projectId, sourceHash: plan.sourceHash, assetPackSha256: plan.styleBriefSha256, assetId: `look-master-${item.shotId.toLowerCase()}`, route: "deterministic-canonical-title-repair", provider: artifact.provider, providerMode: "local-reproducible-authority", model: artifact.model, generationId: jobId, status: "complete", prompt, promptSha256, lookMasterPlanSha256: plan.planSha256, styleBriefSha256: plan.styleBriefSha256, generationInputHash, cacheKey: generationInputHash, attempts: 1, cacheHit: false, error: null, createdAt: now, startedAt: now, completedAt: now, durationMs: 0, output: {publicUrl, sha256: artifactSha256, width: 1920, height: 1080, bytes: item.design.bytes.length}, productionMethod: artifact.productionMethod};
    next.production.generation.jobs.push(job);
    for (const raw of nextRuntime.lookMasterRawReferences.filter((candidate) => candidate.shotId === item.shotId && candidate.planSha256 === plan.planSha256 && candidate.current === true)) {
      raw.current = false; raw.historyReadOnly = true; raw.selectionEligible = false; raw.recommendationEligible = false; raw.assemblyEligible = false; raw.status = "SUPERSEDED_BY_DETERMINISTIC_CANONICAL_REPAIR"; raw.supersededAt = now; raw.supersededByArtifactSha256 = artifactSha256;
    }
    const raw = {contract: "A1PackageLookMasterRaw/v1", referenceId: `look-master-raw-deterministic-${item.shotId.toLowerCase()}-${artifactSha256.slice(0, 12)}`, shotId: item.shotId, eventId: plan.eventId, planSha256: plan.planSha256, styleBriefSha256: plan.styleBriefSha256, candidateDirectionId: null, directionFingerprint: null, canonicalPrimitiveId: `deterministic-typography-${item.shotId.toLowerCase()}-distinct-layout`, classification: "DETERMINISTIC_CANONICAL_TYPOGRAPHY", status: "LOOK_MASTER_RAW", artifact, productionMethod: artifact.productionMethod, referencePackagingContract: artifact.referencePackagingContract, provenance: {generationJobContract: "A1DeterministicCanonicalTitleRepair/v1", generationJobId: jobId, generationInputHash, provider: artifact.provider, model: artifact.model, fontSha256: boundFontSha256, holdFrameSha256: plan.videoContext.baseFrame.sha256, subjectBounds: plan.videoContext.subjectBounds}, sourceEvidenceInputs: [], researchReferenceUseProof: {status: "NOT_REQUIRED", sentToImageGen: false, sourcePacketSha256: null, sourceIds: []}, pixelAudit: null, semanticPixelAudit: null, candidateAdmissionRequired: false, recommendationEligible: false, selectionEligible: false, assemblyEligible: false, current: true, historyReadOnly: false, fullLookMasterStatus: "PENDING_ACTUAL_PIXEL_GATE", userVisualApproval: "NOT_APPROVED", reviewDeferredTo: "ACTUAL_PIXEL_SEMANTIC_AUDIT", createdAt: now};
    nextRuntime.lookMasterRawReferences.push(raw);
    binaryFiles[relativeFile] = item.design.bytes;
    reportFiles[`canonical-title-repair-deterministic-v1/${item.shotId}.json`] = {contract: "A1DeterministicCanonicalTitleRepair/v1", status: "COMPLETE_RAW_UNREVIEWED", shotId: item.shotId, artifact, textNodes: item.design.textNodes, generatedAt: now};
    imported.push({shotId: item.shotId, artifactSha256, referenceId: raw.referenceId, jobId, publicUrl, planSha256: plan.planSha256});
  }
  const summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: 0};
  for (const job of next.production.generation.jobs) { const status = ["queued", "running", "complete", "failed", "stale", "cancelled"].includes(job.status) ? job.status : "cancelled"; summary[status] += 1; summary.total += 1; }
  next.production.generation.summary = summary;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const event = createProductionEvent({workspace: current, action: "import-deterministic-canonical-title-repair", targetId: imported.map((item) => item.shotId).join(","), payload: {contract: "A1DeterministicCanonicalTitleRepair/v1", imported, imagegenCallCount: 0, motionPerformed: false, assemblyCreated: false}, now});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1DeterministicCanonicalTitleRepairImportReport/v1", status: "PASS", imported, generatedPngCount: imported.length, imagegenCallCount: 0, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: 0, generatedAt: now};
  const saved = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {...reportFiles, "canonical-title-repair-deterministic-v1/import.json": report}, binaryFiles});
  return {report, workspaceSha256After: saved.workspaceSha256, commitId: saved.commitId};
});

for (const item of transaction.report.imported) {
  await updateRepairManifestSidecar({manifestPath: repairManifestPath, allowCurrentAuthorityMutation: true, update: (manifest) => {
    const next = structuredClone(manifest);
    const entry = next.entries.find((candidate) => candidate.shotId === item.shotId);
    if (!entry) throw new Error(`deterministic-title-repair-sidecar-entry-missing:${item.shotId}`);
    entry.candidateSha = item.artifactSha256;
    entry.auditSha = null;
    entry.auditStatus = "NOT_RUN";
    entry.lastAuditFailures = [];
    entry.status = "READY_FOR_ACTUAL_PIXEL_AUDIT";
    entry.generationState = "READY";
    entry.primitiveId = `deterministic-typography-${item.shotId.toLowerCase()}-distinct-layout`;
    entry.attempt = Number(entry.attempt || 0) + 1;
    entry.nextAction = {action: "RUN_ACTUAL_PIXEL_AUDIT", provider: "deterministic-typography-authority", generationJobId: item.jobId, candidateSha: item.artifactSha256};
    entry.dependencyChain = {...entry.dependencyChain, candidateSha: item.artifactSha256};
    return next;
  }});
}

console.log(JSON.stringify(transaction, null, 2));
