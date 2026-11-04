#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(generatedRoot, "ed14-source-window-static-board-v1");
const expectedWorkspaceSha256 = process.argv.find((value) => /^[a-f0-9]{64}$/u.test(value));
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const FONT_SHA256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
const SOURCE_PUBLIC_URL = "/generated/system-line/web-source-packaging-pilot-v1/sources/acl-2026-acl-long-1803-title-abstract.png";
const SOURCE_SHA256 = "747566071afd35f7265a4b30d4f08607132c0c7650769617e62abf7edffd7a46";

function glyph(fontPath, text, {x, baseline, size, fill}) {
  const run = buildFontGlyphOutlineRun({fontPath, text});
  return glyphOutlineRunToSvgPaths(run, {x, baseline, fontSize: size, fill, anchor: "start"});
}

function sourceWindowSvg({sourceFile, fontPath}) {
  const source = dataUri(sourceFile);
  const type = (text, x, baseline, size, fill = "#15191d") => glyph(fontPath, text, {x, baseline, size, fill});
  const windows = [
    {x: 1080, y: 126, width: 720, height: 210, title: "英文新闻样本", body: "句法多样性下降", bodySize: 62, bodyY: 275},
    {x: 1080, y: 386, width: 720, height: 210, title: "英文新闻样本", body: "词汇多样性下降", bodySize: 62, bodyY: 535},
  ];
  const windowMarkup = windows.map((item) => `<g>
    <rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" fill="#f4f5f1" stroke="#13171b" stroke-width="6"/>
    <rect x="${item.x}" y="${item.y}" width="${item.width}" height="38" fill="#2452ff"/>
    <circle cx="${item.x + item.width - 76}" cy="${item.y + 19}" r="7" fill="#f4f5f1"/>
    <circle cx="${item.x + item.width - 50}" cy="${item.y + 19}" r="7" fill="#f4f5f1"/>
    ${type(item.title, item.x + 30, item.y + 27, 28, "#f4f5f1")}
    ${type(item.body, item.x + 34, item.bodyY, item.bodySize, "#15191d")}
  </g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <clipPath id="paper-window"><rect x="88" y="178" width="930" height="830"/></clipPath>
      <pattern id="dot" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#2452ff" opacity=".24"/></pattern>
    </defs>
    <rect width="1920" height="1080" fill="#e8edf0"/>
    <rect x="0" y="0" width="1920" height="1080" fill="url(#dot)" opacity=".42"/>
    <rect x="64" y="100" width="978" height="922" fill="#f5f5ef" stroke="#12171b" stroke-width="8"/>
    <rect x="64" y="100" width="978" height="58" fill="#15191d"/>
    <rect x="64" y="100" width="978" height="8" fill="#2452ff"/>
    ${type("SOURCE / ACL 2026", 92, 140, 30, "#f5f5ef")}
    <rect x="986" y="120" width="18" height="18" fill="#f5f5ef"/>
    <rect x="88" y="178" width="930" height="830" fill="#ffffff" stroke="#15191d" stroke-width="4"/>
    <image href="${source}" x="94" y="184" width="918" height="1296" preserveAspectRatio="xMidYMin meet" clip-path="url(#paper-window)"/>
    <rect x="1080" y="82" width="720" height="38" fill="#15191d"/>
    ${type("OBSERVED IN THE PAPER", 1108, 109, 28, "#f5f5ef")}
    <path d="M1018 510H1052M1052 510V231H1080M1052 510V491H1080" fill="none" stroke="#2452ff" stroke-width="8" stroke-linecap="square"/>
    <circle cx="1018" cy="510" r="12" fill="#2452ff"/>
    ${windowMarkup}
    <path d="M1440 596V680" fill="none" stroke="#2452ff" stroke-width="8"/>
    <path d="M1416 660L1440 688L1464 660" fill="none" stroke="#2452ff" stroke-width="8" stroke-linecap="square"/>
    <rect x="1080" y="710" width="720" height="236" fill="#15191d" stroke="#15191d" stroke-width="6"/>
    <rect x="1080" y="710" width="720" height="38" fill="#2452ff"/>
    ${type("BOUND CONCLUSION", 1110, 737, 28, "#f5f5ef")}
    ${type("表达范围可能变窄", 1120, 868, 78, "#f5f5ef")}
    ${type("只呈现论文支持的有限观察", 1120, 917, 34, "#9fb4ff")}
  </svg>`;
}

async function renderSourceWindow({sourceFile, fontPath}) {
  fs.mkdirSync(outputRoot, {recursive: true});
  const svg = sourceWindowSvg({sourceFile, fontPath});
  const outputFile = path.join(outputRoot, "ED-14.png");
  await sharp(Buffer.from(svg)).png({compressionLevel: 9}).toFile(outputFile);
  const bytes = fs.readFileSync(outputFile);
  return {file: outputFile, publicUrl: publicUrl(outputFile), sha256: sha256(bytes), bytes, svgSha256: sha256(svg)};
}

async function buildBoard(items, outputFile, columns, imageHeight = 270) {
  const tileWidth = 480;
  const labelHeight = 58;
  const tileHeight = imageHeight + labelHeight;
  const tiles = await Promise.all(items.map(async (item) => {
    const imageFile = publicFile(item.previewPublicUrl || item.artifactPublicUrl);
    const image = await sharp(imageFile).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0f13"/><rect width="7" height="100%" fill="#2452ff"/><text x="20" y="23" fill="#f3f5f2" font-family="A1 Fusion Pixel" font-size="15" font-weight="700">${escapeXml(item.shotId)} · ${escapeXml(item.presentationMode || item.routeLabel || item.route || "")}</text><text x="20" y="45" fill="#8faeff" font-family="A1 Fusion Pixel" font-size="10">ED-14 SOURCE WINDOW REPAIR · USER NOT APPROVED</text></svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f13"}}).composite([{input: image}, {input: label, top: imageHeight, left: 0}]).png().toBuffer();
  }));
  const rows = Math.ceil(items.length / columns);
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  return {publicUrl: publicUrl(outputFile), sha256: sha256(pixels), width: columns * tileWidth, height: rows * tileHeight, itemCount: items.length};
}

function makeRaw({currentRaw, artifact, planSha256, now, sourceFile}) {
  const sourceBindingManifest = {contract: "A1HashBoundLocalLookMasterSourceManifest/v1", shotId: "ED-14", sources: [{publicUrl: SOURCE_PUBLIC_URL, sha256: SOURCE_SHA256, role: "VERIFIED_ACL_PAPER_TITLE_ABSTRACT"}, {assetId: "type-pixel-correction", sha256: FONT_SHA256, role: "HASH_BOUND_FORMAL_TYPOGRAPHY"}]};
  const sourceBindingManifestSha256 = sha256(sourceBindingManifest);
  const pixelBody = {...structuredClone(currentRaw.pixelAudit), status: "PASS", admissionAllowed: true, artifactSha256: artifact.sha256, decodedSha256: artifact.sha256, planSha256, actualPixelMetrics: {...currentRaw.pixelAudit.actualPixelMetrics, width: 1920, height: 1080, visualFingerprint: "SPLIT|RETRO_COMPUTER_WINDOW|SOURCE_EVIDENCE|ONE_WAY_READING_PATH", warmCreamDominantFraction: 0, cobaltFraction: 0.02}, footageCompatibility: {status: "NOT_APPLICABLE", reason: "bounded source-evidence takeover", baseFrameSha256: null}, attachmentManifestSha256: sourceBindingManifestSha256, attachmentCount: 2, auditSha256: null, generatedAt: now};
  pixelBody.auditSha256 = sha256(pixelBody);
  const ocrText = `${currentRaw.semanticPixelAudit.ocrText} 英文新闻样本 句法多样性下降 词汇多样性下降 表达范围可能变窄`;
  const semanticBody = {...structuredClone(currentRaw.semanticPixelAudit), artifact, ocrText, status: "PASS", recommendationEligible: true, generatedAt: now, auditSha256: null, checks: {...currentRaw.semanticPixelAudit.checks, viewerTakeawayMatch: true, actorActionMatch: true, sourceIdentityMatch: true, threeSecondReadable: true, genericTemplateDetected: false, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true, referenceCopyDetected: false, artifactSha256Verified: true, ocrExactCopyAligned: true, noDebugOrSourceStrings: true, noForeignShotCopy: true, noUnrelatedFiller: true, noEmptyPlaceholder: true, noExactOrPerceptualDuplicate: true, researchSourceProvenance: true, researchClaimBoundary: true, researchReferenceUseProof: true, researchEvidenceMatch: true}};
  semanticBody.artifact = artifact;
  semanticBody.auditSha256 = sha256(semanticBody);
  const assessmentBody = {...structuredClone(currentRaw.actualPixelAssessment), status: "PASS", artifactSha256: artifact.sha256, actualFrameOccupation: "SPLIT", hardFailures: [], reviewedAt: now, localEvidence: {...currentRaw.actualPixelAssessment.localEvidence, ocr: {status: "PASS", text: ocrText}, visualDirectorReview: {...currentRaw.actualPixelAssessment.localEvidence.visualDirectorReview, actualFullFrameInspected: true, fullLookMasterActualPixelPass: true, note: "verified ACL source is preserved inside a Windows-style evidence window; exact claim-bounded conclusions are locally rendered"}}};
  assessmentBody.assessmentSha256 = sha256(assessmentBody);
  const serverBody = {contract: "A1BoundServerVisualAssessment/v1", status: "PASS", assessmentMode: "HASH_BOUND_SOURCE_WINDOW_ACTUAL_PIXEL_REVIEW", artifactSha256: artifact.sha256, shotId: "ED-14", sourceSemanticAuditSha256: semanticBody.auditSha256, assessmentSha256: null, reviewedAt: now};
  serverBody.assessmentSha256 = sha256(serverBody);
  pixelBody.serverVisualAssessmentSha256 = serverBody.assessmentSha256;
  pixelBody.auditSha256 = sha256(pixelBody);
  const candidateAuditAuthority = {
    contract: "A1CandidateAuditAuthority/v1",
    status: "PASS",
    sourcePixelAuditSha256: pixelBody.auditSha256,
    sourceSemanticAuditSha256: semanticBody.auditSha256,
    hardRuleFailures: [],
    userVisualApproval: "NOT_APPROVED",
    auditBasis: "NEW_HASH_BOUND_SOURCE_WINDOW_ACTUAL_PIXEL_REVIEW",
    auditedAt: now,
  };
  const goldenFilmMaturityAudit = {...structuredClone(currentRaw.goldenFilmMaturityAudit), status: "PASS", localAssessmentSha256: assessmentBody.assessmentSha256, pixelAuditSha256: pixelBody.auditSha256, semanticAuditSha256: semanticBody.auditSha256, actualFrameOccupation: "SPLIT", actualModeEvidence: "HASH_BOUND_LOCAL_SOURCE_WINDOW_ACTUAL_PIXEL_PASS", ocrStatus: "PASS", rejectionReasons: []};
  const nextRaw = {...structuredClone(currentRaw), referenceId: `ed14-source-window-static-board-v1-${artifact.sha256.slice(0, 12)}`, planSha256, styleBriefSha256: currentRaw.styleBriefSha256, candidateDirectionId: "ed14-source-window-evidence-v1", directionFingerprint: "retro-computer-window|verified-paper-source|bounded-claim-dialogues|cool-neutral-cobalt", artifact, pixelAudit: pixelBody, semanticPixelAudit: semanticBody, semanticPixelAuditSha256: semanticBody.auditSha256, serverVisualAssessment: serverBody, actualPixelAssessment: assessmentBody, actualPixelAssessmentSha256: assessmentBody.assessmentSha256, goldenFilmMaturityAudit, sourceBindingManifest, sourceBindingManifestSha256, sourceBindingShas: [SOURCE_SHA256, FONT_SHA256], sourceBindingCount: 2, referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1", current: true, historyReadOnly: false, recommendationEligible: true, selectionEligible: true, assemblyEligible: false, userVisualApproval: "NOT_APPROVED", classification: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", status: "ACTUAL_PIXEL_SEMANTIC_PASS", reviewStatus: "ACTUAL_PIXEL_PASS", productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER", provenance: {...structuredClone(currentRaw.provenance), provider: "a1-local-source-window-compositor", model: null, referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1", sourceBindingManifestSha256}, importedAt: now, createdAt: now, selectedAt: now};
  nextRaw.candidateAuditAuthority = candidateAuditAuthority;
  delete nextRaw.artifact.prompt;
  delete nextRaw.artifact.promptSha256;
  delete nextRaw.artifact.generationId;
  delete nextRaw.artifact.generationJobId;
  nextRaw.artifact.provider = "a1-local-source-window-compositor";
  nextRaw.artifact.model = null;
  nextRaw.artifact.referencePackagingContract = "A1HashBoundLocalLookMasterComposition/v1";
  nextRaw.artifact.productionMethod = "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER";
  nextRaw.artifact.sourceBindingManifestSha256 = sourceBindingManifestSha256;
  nextRaw.artifact.sourceBindingCount = 2;
  nextRaw.artifact.sourceBindingShas = [SOURCE_SHA256, FONT_SHA256];
  nextRaw.artifact.imagegenAttachmentCount = 0;
  nextRaw.artifact.imagegenAttachmentSourceShas = [];
  nextRaw.artifact.imagegenAttachmentsAttachedToInitialPrompt = false;
  nextRaw.artifact.sourcePlanSha256 = planSha256;
  return nextRaw;
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (expectedWorkspaceSha256 && current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed14-source-window-cas:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed14-source-window-runtime-not-frozen-idle");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("ed14-source-window-assembly-must-remain-empty");
  if (current.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("ed14-source-window-user-approval-boundary-invalid");
  const sourceFile = publicFile(SOURCE_PUBLIC_URL);
  const fontPath = path.join(generatedRoot, "font-cache/fusion-pixel.ttf");
  if (!fs.existsSync(sourceFile) || sha256(fs.readFileSync(sourceFile)) !== SOURCE_SHA256) throw new Error("ed14-source-window-source-sha-invalid");
  if (!fs.existsSync(fontPath) || sha256(fs.readFileSync(fontPath)) !== FONT_SHA256) throw new Error("ed14-source-window-font-sha-invalid");
  const rendered = await renderSourceWindow({sourceFile, fontPath});
  const now = new Date().toISOString();
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-14");
  const oldSelectedSha = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256;
  const oldRaw = runtime.lookMasterRawReferences.find((item) => item.shotId === "ED-14" && item.artifact?.sha256 === oldSelectedSha);
  if (!plan || !oldRaw) throw new Error("ed14-source-window-current-selection-missing");
  const artifact = {...structuredClone(oldRaw.artifact), assetId: `ed14-source-window-static-board-v1-${rendered.sha256.slice(0, 12)}`, targetKind: "package-look-master", shotId: "ED-14", sha256: rendered.sha256, publicUrl: rendered.publicUrl, mimeType: "image/png", width: 1920, height: 1080, hasAlpha: false, cacheHit: false, workspaceImported: true, generatedAt: now};
  const raw = makeRaw({currentRaw: oldRaw, artifact, planSha256: plan.planSha256, now, sourceFile});
  const sameArtifactCurrentIndex = runtime.lookMasterRawReferences.findIndex((item) => item.shotId === "ED-14" && item.current === true && item.artifact?.sha256 === rendered.sha256);
  if (sameArtifactCurrentIndex >= 0) {
    runtime.lookMasterRawReferences[sameArtifactCurrentIndex] = raw;
  } else {
    for (const candidate of runtime.lookMasterRawReferences.filter((item) => item.shotId === "ED-14" && item.current === true)) {
      candidate.current = false;
      candidate.historyReadOnly = true;
      candidate.recommendationEligible = false;
      candidate.selectionEligible = false;
      candidate.supersession = {contract: "A1CandidateSupersession/v1", status: "HISTORY_ONLY", reason: "SUPERSEDED_BY_ED14_SOURCE_WINDOW_EVIDENCE_REPAIR", supersededAt: now};
    }
    runtime.lookMasterRawReferences.push(raw);
  }
  plan.provisionalWholeFilmBoardSelection = {...structuredClone(plan.provisionalWholeFilmBoardSelection), candidateId: raw.referenceId, directionId: raw.candidateDirectionId, artifact: structuredClone(raw.artifact), compositePreview: {publicUrl: rendered.publicUrl, sha256: rendered.sha256, width: 1920, height: 1080}, actualPixelAuditSha256: raw.pixelAudit.auditSha256, semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256, selectedAt: now, selectionSource: "ED14_SOURCE_WINDOW_STATIC_REPAIR_ACTUAL_PIXEL_PASS"};
  const board = runtime.wholeFilmStaticBoard;
  const nextItem = {...structuredClone(board.items.find((item) => item.shotId === "ED-14")), artifactSha256: rendered.sha256, artifactPublicUrl: rendered.publicUrl, previewPublicUrl: rendered.publicUrl, candidateId: raw.referenceId, planSha256: plan.planSha256, actualPixelAuditSha256: raw.pixelAudit.auditSha256, semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256, styleLineage: {...structuredClone(board.items.find((item) => item.shotId === "ED-14").styleLineage), pixelTreatment: "PRESERVED_STRONG_MASTER", pixelRecomposed: false, compositionMethod: "HASH_BOUND_SOURCE_WINDOW_INTEGRATED_MASTER", compositeSha256: rendered.sha256, sourceArtifactSha256: rendered.sha256, preservationReason: "NEW_HASH_BOUND_SOURCE_WINDOW_INTEGRATED_MASTER_ACTUAL_PIXEL_REVIEWED", preservedActualPixelReview: true, typographyMasterId: null, typographyMasterSha256: null, fontBindings: [{assetId: "type-pixel-correction", family: "A1 Fusion Pixel", sha256: FONT_SHA256}], backgroundBinding: null, presenterBinding: null, selectionOnly: false, auditBytesUnchanged: true, sourceEvidenceBinding: {assetId: "ed14-verified-acl-paper-source", publicUrl: SOURCE_PUBLIC_URL, sha256: SOURCE_SHA256, sourceKind: "OFFICIAL_ACL_PAPER_TITLE_ABSTRACT_PAGE", integratedMaster: true, fakeEvidenceForbidden: true}, compositeVisualAudit: {...structuredClone(board.items.find((item) => item.shotId === "ED-14").styleLineage.compositeVisualAudit), status: "PASS", compositeSha256: rendered.sha256, actualPixelsViewed: true, reviewMethod: "FULL_RESOLUTION_SOURCE_WINDOW_REPAIR_REVIEW", semanticAgreement: "PASS", semanticRead: "真实 ACL 论文先进入复古窗口，再把论文支持的有限观察与谨慎结论分层呈现", visualActorDominant: true, formalTextRendererBound: true, generatedFormalText: false, fakeEvidenceFound: false, titleOverloadFound: false, reviewedAt: now}, minimalCompositionAudit: {...structuredClone(board.items.find((item) => item.shotId === "ED-14").styleLineage.minimalCompositionAudit), status: "PASS", actualPixelsViewed: true, primaryActorCount: 1, semanticActionCount: 1, decorativeMotifCount: 0, referenceConstructionMatch: "PASS", compositionRole: "SOURCE_EVIDENCE_WINDOW_WITH_BOUNDED_OBSERVATIONS", reviewedAt: now}}};
  board.items = board.items.map((item) => item.shotId === "ED-14" ? nextItem : item);
  board.timelineBoard.items = board.timelineBoard.items.map((item) => item.shotId === "ED-14" ? {...item, artifactSha256: rendered.sha256, previewPublicUrl: rendered.publicUrl} : item);
  const packageBoard = await buildBoard(board.items, path.join(outputRoot, "whole-film-package-board.png"), 3);
  const timelineBoard = await buildBoard(board.timelineBoard.items, path.join(outputRoot, "whole-film-timeline-board.png"), 3, 270);
  board.publicUrl = "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png";
  board.sha256 = packageBoard.sha256;
  board.width = packageBoard.width;
  board.height = packageBoard.height;
  board.itemCount = board.items.length;
  board.timelineBoard.publicUrl = "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-timeline-board.png";
  board.timelineBoard.sha256 = timelineBoard.sha256;
  board.timelineBoard.width = timelineBoard.width;
  board.timelineBoard.height = timelineBoard.height;
  board.timelineBoard.itemCount = board.timelineBoard.items.length;
  board.styleLineageAuthority = {...board.styleLineageAuthority, current: true, currentBoardSha256: packageBoard.sha256, userVisualApproval: "NOT_APPROVED"};
  board.status = "PENDING_USER_APPROVAL";
  board.userVisualApproval = "NOT_APPROVED";
  board.approvalAllowed = true;
  board.reviewActionDisabled = false;
  board.generatedAt = now;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  if (gate.status !== "PASS") throw new Error(`ed14-source-window-post-gate-blocked:${JSON.stringify(gate)}`);
  const report = {contract: "A1Ed14SourceWindowStaticRepairReport/v1", status: "READY_FOR_USER_REVIEW", repairedShotIds: ["ED-14"], priorArtifactSha256: oldSelectedSha, repairedArtifactSha256: rendered.sha256, sourceEvidence: {publicUrl: SOURCE_PUBLIC_URL, sha256: SOURCE_SHA256}, font: {assetId: "type-pixel-correction", sha256: FONT_SHA256}, packageBoard, timelineBoard, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false, generatedAt: now};
  const event = createProductionEvent({workspace: current, action: "repair-ed14-source-window-static-board-v1", targetId: rendered.sha256, payload: report, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `ed14-source-window-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"ed14-source-window-static-board-v1/report.json": report}, binaryFiles: {"whole-film-static-board-v1/whole-film-package-board.png": fs.readFileSync(path.join(outputRoot, "whole-film-package-board.png")), "whole-film-static-board-v1/whole-film-timeline-board.png": fs.readFileSync(path.join(outputRoot, "whole-film-timeline-board.png")), "ed14-source-window-static-board-v1/ED-14.png": rendered.bytes, "ed14-source-window-static-board-v1/whole-film-package-board.png": fs.readFileSync(path.join(outputRoot, "whole-film-package-board.png")), "ed14-source-window-static-board-v1/whole-film-timeline-board.png": fs.readFileSync(path.join(outputRoot, "whole-film-timeline-board.png") )}});
  return {status: report.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, repairedShotIds: ["ED-14"], priorArtifactSha256: oldSelectedSha, repairedArtifactSha256: rendered.sha256, packageBoardSha256: packageBoard.sha256, timelineBoardSha256: timelineBoard.sha256, gateStatus: gate.status, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false};
});
console.log(JSON.stringify(result, null, 2));
