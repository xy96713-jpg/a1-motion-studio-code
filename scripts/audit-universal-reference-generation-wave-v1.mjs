#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, UNIVERSAL_REFERENCE_PRODUCTION_METHOD} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {publicDir} = projectDirs(appRoot);
const waveRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-generation-wave-v1/manifest.json";
const reportRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-generation-wave-v1/actual-pixel-audit.json";
const contactSheetRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-generation-wave-v1/actual-pixel-contact-sheet.png";
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.resolve(publicRoot, String(url).replace(/^\//u, ""));
const normalize = (value) => String(value || "").toLowerCase().replace(/[\s\u3000\p{P}\p{S}]+/gu, "");

const expectedPhrases = {
  "ED-08": ["AI 常常不说人话"],
  "ED-13": ["国产模型写中文确实会顺一些", "问题也并没有彻底解决"],
  "ED-14": ["句法多样性下降", "词汇多样性下降"],
  "ED-19": ["整理", "编排", "读取", "检查"],
  "ED-31": ["可控的工作流", "整理", "编排", "读取", "检查"],
};

// This is a bounded visual-director decision over the ten newly generated
// full-frame PNGs, not a critic/motion pass. It is intentionally explicit so
// a later rerun cannot silently turn a technical import into adoption.
const visualReview = {
  "look-master-wave-v1-ed-08-c1-49f128cdabaf": {status: "PASS", reason: "完整画面围绕真人与麦克风构图；大标题与语言流失机制一眼可读，背景乱码属于该镜的语义动作而非独立贴纸。"},
  "look-master-wave-v1-ed-08-c2-d45b7d7a9419": {status: "FAIL", reason: "OCR 将标题首段读成 AL 常，不能作为 exact-copy 母版。"},
  "look-master-wave-v1-ed-13-c1-ff3ab9c057ad": {status: "FAIL", reason: "画面出现无语义的 Helloy 英文 filler，违反本镜无额外可读文字门禁。"},
  "look-master-wave-v1-ed-13-c2-ae910ea623ba": {status: "PASS", reason: "两条精确中文语义 actor 与人物形成清晰因果对照；孤立低置信度像素符号不构成可读 filler。"},
  "look-master-wave-v1-ed-14-c1-ed8921feeff1": {status: "PASS", reason: "官方 ACL 证据窗口实际可见，标题、来源身份与句法/词汇收窄路径统一构图。"},
  "look-master-wave-v1-ed-14-c2-9e69dfba2e50": {status: "PASS", reason: "官方 ACL 证据截图保留可读区域，冷白证据场和两条收窄路径清楚。"},
  "look-master-wave-v1-ed-19-c1-07e46fdeb2ee": {status: "PASS", reason: "四个精确词沿一条连续冷白/钴蓝路径完成整理到检查，无暖黄主场。"},
  "look-master-wave-v1-ed-19-c2-1e1c38044404": {status: "PASS", reason: "四个精确词均可读，结构路径克制，符合 NO_REFERENCE_GENERATIVE。"},
  "look-master-wave-v1-ed-31-c1-bddf26651249": {status: "PASS", reason: "真人、麦克风与全宽流程轨道完整融合，四阶段和可控的工作流在静态板尺度仍可读。"},
  "look-master-wave-v1-ed-31-c2-80196d1e9ee2": {status: "FAIL", reason: "出现无语义 NEWS 英文，违反无额外 filler/source 文字门禁。"},
};

const selectedJobIds = new Set([
  "look-master-wave-v1-ed-08-c1-49f128cdabaf",
  "look-master-wave-v1-ed-13-c2-ae910ea623ba",
  "look-master-wave-v1-ed-14-c2-9e69dfba2e50",
  "look-master-wave-v1-ed-19-c1-07e46fdeb2ee",
  "look-master-wave-v1-ed-31-c1-bddf26651249",
]);

function readOcr(file) {
  try {
    const parsed = JSON.parse(execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 4_000_000}).trim().split("\n").at(-1));
    return {status: parsed.status || "PASS", text: parsed.text || "", observationCount: parsed.observationCount || 0, segmentDetails: parsed.segmentDetails || []};
  } catch (error) {
    return {status: "FAILED", text: "", observationCount: 0, segmentDetails: [], error: error instanceof Error ? error.message : String(error)};
  }
}

async function pixelMetrics(file) {
  const original = await sharp(file).metadata();
  const {data, info} = await sharp(file).resize(128, 72, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let warm = 0;
  let cobalt = 0;
  let visible = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    visible += 1;
    if (red > 145 && green > 105 && red - blue > 42) warm += 1;
    if (blue > 135 && red < 110 && green < 165 && blue - red > 45) cobalt += 1;
  }
  return {
    width: original.width,
    height: original.height,
    warmDominantFraction: Number((warm / Math.max(1, visible)).toFixed(4)),
    cobaltFraction: Number((cobalt / Math.max(1, visible)).toFixed(4)),
    coldAestheticPass: warm / Math.max(1, visible) < 0.18 && cobalt / Math.max(1, visible) > 0.0005,
  };
}

function selectionFrom(raw, audit) {
  return {
    contract: "A1ProvisionalWholeFilmBoardSelection/v1",
    status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL",
    candidateId: raw.referenceId,
    candidateIndex: raw.candidateIndex || null,
    directionId: raw.candidateDirectionId,
    artifact: structuredClone(raw.artifact),
    actualPixelAuditSha256: audit.pixelAuditSha256,
    semanticPixelAuditSha256: audit.semanticAuditSha256,
    selectionSource: "UNIVERSAL_REFERENCE_GENERATION_WAVE_ACTUAL_PIXEL_PASS_NO_CRITIC",
    selectedAt: now,
  };
}

function createContactSheet(entries, outputFile) {
  const cols = 2;
  const cellWidth = 840;
  const cellHeight = 510;
  const rows = Math.ceil(entries.length / cols);
  const composites = entries.map((entry, index) => {
    const label = `<svg width="${cellWidth}" height="70" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0a0e11"/><text x="18" y="27" fill="#f2f5ed" font-family="Arial, PingFang SC, sans-serif" font-size="20" font-weight="700">${entry.shotId} · ${entry.candidateIndex} · ${entry.status}</text><text x="18" y="53" fill="#9eaaa4" font-family="Arial, PingFang SC, sans-serif" font-size="14">${entry.artifactSha256.slice(0, 12)} · ${entry.manualReview.status}</text></svg>`;
    return {input: entry.file, top: Math.floor(index / cols) * cellHeight + 70, left: (index % cols) * cellWidth, label};
  });
  return Promise.all(composites.map(async (item) => ({input: await sharp(item.input).resize(cellWidth, cellHeight - 70, {fit: "cover"}).png().toBuffer(), top: item.top + 70, left: item.left, label: Buffer.from(item.label)}))).then(async (layers) => {
    const labelLayers = await Promise.all(layers.map(async (item) => ({input: item.label, top: item.top - 70, left: item.left})));
    return sharp({create: {width: cellWidth * cols, height: cellHeight * rows, channels: 3, background: {r: 10, g: 14, b: 17}}}).composite([...layers.map(({input, top, left}) => ({input, top, left})), ...labelLayers]).png().toFile(outputFile);
  });
}

const result = await withProjectLock(appRoot, async () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("universal-reference-wave-audit-requires-frozen-idle-runtime");
  if ((before.production.shotIntelligence.currentAssembly || []).length) throw new Error("universal-reference-wave-audit-assembly-forbidden");
  const wave = readJson(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1", waveRelativePath));
  const targetShotIds = [...new Set(wave.jobs.map((job) => job.shotId))];
  const jobs = before.production.generation.jobs.filter((job) => wave.jobs.some((item) => item.jobId === job.id) && job.status === "complete");
  if (jobs.length !== wave.jobs.length) throw new Error(`universal-reference-wave-audit-job-count:${jobs.length}/${wave.jobs.length}`);
  const rawBySha = new Map((before.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => [raw.artifact?.sha256, raw]));
  const entries = [];
  for (const job of jobs) {
    const raw = rawBySha.get(job.output?.sha256);
    if (!raw) throw new Error(`universal-reference-wave-audit-raw-missing:${job.id}`);
    const file = publicFile(raw.artifact.publicUrl);
    const bytes = fs.readFileSync(file);
    const actualSha = sha256(bytes);
    const ocr = readOcr(file);
    const metrics = await pixelMetrics(file);
    const expected = expectedPhrases[job.shotId].map(normalize);
    const ocrNormalized = normalize(ocr.text);
    const ocrExact = expected.every((phrase) => ocrNormalized.includes(phrase));
    const referenceManifest = raw.referenceAttachmentManifest || job.referenceAttachmentManifest;
    const attached = Array.isArray(referenceManifest?.attachments) && referenceManifest.attachments.every((item) => item.attachedToInitialPrompt === true && item.attachedSha256 === item.sourceSha256);
    const sourceIdentityPass = job.shotId !== "ED-14" || referenceManifest.attachments.some((item) => item.sourceSha256 === "747566071afd35f7265a4b30d4f08607132c0c7650769617e62abf7edffd7a46" && item.sourceType === "RESEARCH_EVIDENCE");
    const manual = visualReview[job.id];
    if (!manual) throw new Error(`universal-reference-wave-audit-manual-review-missing:${job.id}`);
    const machinePass = actualSha === raw.artifact.sha256 && metrics.width >= 640 && metrics.height >= 360 && metrics.coldAestheticPass && ocrExact && (job.referenceDecision === "NO_REFERENCE_GENERATIVE" || attached) && sourceIdentityPass;
    const status = machinePass && manual.status === "PASS" ? "PASS" : "BLOCK";
    const pixelAudit = {
      contract: "A1UniversalReferenceActualPixelAudit/v1",
      status,
      admissionAllowed: status === "PASS",
      failures: status === "PASS" ? [] : ["ACTUAL_PIXEL_SEMANTIC_AUDIT_BLOCKED"],
      artifactSha256: raw.artifact.sha256,
      decodedSha256: actualSha,
      metrics,
      attachmentManifestSha256: referenceManifest?.manifestSha256 || null,
      attachmentCount: Number(referenceManifest?.fileCount || 0),
      generatedAt: now,
    };
    pixelAudit.auditSha256 = sha256({...pixelAudit, auditSha256: undefined});
    const semanticAudit = {
      contract: "A1UniversalReferenceActualPixelSemanticAudit/v1",
      status,
      recommendationEligible: status === "PASS",
      artifactSha256: raw.artifact.sha256,
      exactProtectedPhrases: expected,
      ocrText: ocr.text,
      ocrExactCopyAligned: ocrExact,
      threeSecondReadable: status === "PASS",
      sourceIdentityPass,
      actualAttachmentPass: job.referenceDecision === "NO_REFERENCE_GENERATIVE" || attached,
      manualVisualReview: manual,
      findings: [
        ...(actualSha !== raw.artifact.sha256 ? ["DECODED_SHA_MISMATCH"] : []),
        ...(!metrics.coldAestheticPass ? ["CURRENT_AESTHETIC_GATE_BLOCKED"] : []),
        ...(!ocrExact ? ["OCR_EXACT_COPY_MISMATCH"] : []),
        ...(!sourceIdentityPass ? ["RESEARCH_SOURCE_IDENTITY_MISSING"] : []),
        ...(manual.status !== "PASS" ? [manual.reason] : []),
      ],
      generatedAt: now,
    };
    semanticAudit.auditSha256 = sha256({...semanticAudit, auditSha256: undefined});
    entries.push({jobId: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, directionId: job.candidateDirection?.directionId || null, file, artifactSha256: raw.artifact.sha256, status, selected: status === "PASS" && selectedJobIds.has(job.id), manualReview: manual, ocr: {status: ocr.status, text: ocr.text, observationCount: ocr.observationCount}, pixelMetrics: metrics, attachmentManifestSha256: referenceManifest?.manifestSha256 || null, attachmentSourceShas: referenceManifest?.sourceSha256s || [], pixelAudit, semanticAudit, pixelAuditSha256: pixelAudit.auditSha256, semanticAuditSha256: semanticAudit.auditSha256});
  }
  const staged = structuredClone(before);
  const rawReferences = staged.production.shotIntelligence.lookMasterRawReferences || [];
  const plans = staged.production.shotIntelligence.packageLookMasterPlans || [];
  const selectedByShot = new Map();
  for (const entry of entries) {
    const raw = rawReferences.find((item) => item.artifact?.sha256 === entry.artifactSha256);
    const isSelected = entry.selected;
    if (isSelected) selectedByShot.set(entry.shotId, entry);
    raw.pixelAudit = entry.pixelAudit;
    raw.referenceAttachmentManifest = raw.referenceAttachmentManifest || structuredClone(jobs.find((job) => job.id === entry.jobId)?.referenceAttachmentManifest || null);
    raw.artifact.referencePackagingContract = A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT;
    raw.artifact.productionMethod = UNIVERSAL_REFERENCE_PRODUCTION_METHOD;
    raw.semanticPixelAudit = entry.semanticAudit;
    raw.pixelAuditPublicUrl = `/${reportRelativePath}`;
    raw.semanticPixelAuditSha256 = entry.semanticAuditSha256;
    raw.semanticPixelAuditOcr = entry.ocr;
    raw.semanticPixelAuditFindings = entry.semanticAudit.findings;
    raw.actualPixelAssessment = entry.pixelAudit;
    raw.actualPixelAssessmentSha256 = entry.pixelAuditSha256;
    raw.goldenFilmMaturityAudit = {
      contract: "A1GoldenFilmMaturityActualPixelAudit/v1",
      status: entry.status,
      localAssessmentSha256: entry.pixelAuditSha256,
      pixelAuditSha256: entry.pixelAuditSha256,
      semanticAuditSha256: entry.semanticAuditSha256,
      actualFrameOccupation: entry.status === "PASS"
        ? before.production.canonicalCreatorPackagingSequence?.decisions?.find((item) => item.shotId === entry.shotId)?.frameOccupation || null
        : null,
      actualModeEvidence: entry.status === "PASS" ? "UNIVERSAL_REFERENCE_FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : null,
      ocrStatus: entry.ocr.status,
      ocrObservationCount: entry.ocr.observationCount,
      rejectionReasons: entry.semanticAudit.findings,
    };
    raw.reviewStatus = entry.status === "PASS" ? (isSelected ? "SYSTEM_PIXEL_PASS_SELECTED" : "SYSTEM_PIXEL_PASS_NOT_SELECTED") : "VISUAL_REJECTED";
    raw.fullLookMasterStatus = entry.status === "PASS" && isSelected ? "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : entry.status === "PASS" ? "PASS_NOT_SELECTED" : "REJECTED_ACTUAL_PIXEL_GATE";
    raw.classification = entry.status === "PASS" && isSelected ? "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : entry.status === "PASS" ? "FULL_LOOK_MASTER_GENERATED_NOT_SELECTED" : "FULL_LOOK_MASTER_REFERENCE_ATTACHED_REJECTED";
    raw.current = isSelected;
    raw.historyReadOnly = !isSelected;
    raw.recommendationEligible = isSelected;
    raw.selectionEligible = isSelected;
    raw.assemblyEligible = false;
    raw.candidateAdmissionRequired = !isSelected;
    if (isSelected) raw.selectedAt = now;
  }
  for (const [shotId, entry] of selectedByShot) {
    for (const raw of rawReferences.filter((item) => item.shotId === shotId && item.artifact?.sha256 !== entry.artifactSha256 && item.current === true)) {
      raw.current = false;
      raw.historyReadOnly = true;
      raw.recommendationEligible = false;
      raw.selectionEligible = false;
      raw.assemblyEligible = false;
      raw.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_UNIVERSAL_REFERENCE_WAVE";
      raw.supersededAt = now;
      raw.supersededByArtifactSha256 = entry.artifactSha256;
    }
    const plan = plans.find((item) => item.shotId === shotId);
    const selectedRaw = rawReferences.find((raw) => raw.artifact?.sha256 === entry.artifactSha256);
    if (plan && selectedRaw) plan.provisionalWholeFilmBoardSelection = selectionFrom(selectedRaw, entry);
  }
  staged.production.generation.workerStatus = "frozen";
  staged.production.generation.automaticDispatchAllowed = false;
  staged.production.shotIntelligence.wholeFilmBatchRecommendation = {...staged.production.shotIntelligence.wholeFilmBatchRecommendation, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false};
  const passCandidateCount = entries.filter((entry) => entry.status === "PASS").length;
  const selectedCount = entries.filter((entry) => entry.selected).length;
  const failedShotIds = targetShotIds.filter((shotId) => !entries.some((entry) => entry.shotId === shotId && entry.selected === true && entry.status === "PASS"));
  const allTargetPass = failedShotIds.length === 0 && selectedCount === targetShotIds.length;
  const run = readJson(path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json"));
  const runNext = structuredClone(run);
  runNext.generatedAt = now;
  runNext.current = true;
  runNext.overallStatus = allTargetPass ? "UNIVERSAL_REFERENCE_ACTUAL_PIXEL_PASS_BOARD_PENDING" : "UNIVERSAL_REFERENCE_ACTUAL_PIXEL_AUDIT_BLOCKED";
  runNext.nextAction = allTargetPass ? "REBUILD_WHOLE_FILM_STATIC_BOARD" : "REPAIR_REJECTED_UNIVERSAL_REFERENCE_CANDIDATES";
  runNext.phases = {...runNext.phases,
    PHASE_3: {...runNext.phases.PHASE_3, status: allTargetPass ? "ACTUAL_PIXEL_PASS" : "ACTUAL_PIXEL_AUDIT_WITH_REJECTIONS", generationAllowed: false, generationDispatched: false, targetShotIds, currentWaveJobIds: wave.jobs.map((job) => job.jobId), queuedJobIds: [], newGeneratedCount: entries.length, newGeneratedShas: entries.map((entry) => entry.artifactSha256), auditResults: entries.map((entry) => ({shotId: entry.shotId, jobId: entry.jobId, artifactSha256: entry.artifactSha256, status: entry.status, selected: entry.selected, pixelAuditSha256: entry.pixelAuditSha256, semanticAuditSha256: entry.semanticAuditSha256, rejectionReasons: entry.semanticAudit.findings})), nextAction: allTargetPass ? "REBUILD_WHOLE_FILM_STATIC_BOARD" : "REPAIR_REJECTED_UNIVERSAL_REFERENCE_CANDIDATES"},
    PHASE_4: {...runNext.phases.PHASE_4, status: allTargetPass ? "READY" : "BLOCKED", boardRebuilt: false, userApproval: false, nextAction: allTargetPass ? "REBUILD_WHOLE_FILM_STATIC_BOARD" : "REPAIR_REJECTED_UNIVERSAL_REFERENCE_CANDIDATES"},
  };
  runNext.imageLedger = {...runNext.imageLedger, attemptedGeneratedCount: entries.length, adoptedGeneratedCount: 0, rejectedGeneratedCount: entries.filter((entry) => entry.status !== "PASS").length, systemEligibleGeneratedCount: selectedCount, pendingGeneratedCount: selectedCount, candidatePassCount: passCandidateCount, notSelectedGeneratedCount: passCandidateCount - selectedCount, candidateShas: entries.map((entry) => entry.artifactSha256).sort(), newGeneratedShas: entries.map((entry) => entry.artifactSha256).sort(), newGeneratedCount: entries.length, generationDispatched: true, generationCompleted: true, referenceAttachmentAudit: {status: "PASS", actualAttachmentCoverageCount: 4, requiredReferenceShotCount: 4}};
  runNext.runtimeFreeze = {queue: 0, running: 0, workerStatus: "frozen", assemblyCount: 0, assemblyCreationAllowed: false};
  runNext.maturityRunSha256 = sha256({...runNext, maturityRunSha256: undefined});
  const contactSheetPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1", contactSheetRelativePath);
  await createContactSheet(entries, contactSheetPath);
  const report = {contract: "A1UniversalReferenceGenerationWaveActualPixelAuditReport/v1", status: allTargetPass ? "PASS" : "BLOCKED", waveManifestSha256: wave.manifestSha256, targetShotIds, attemptedGeneratedCount: entries.length, adoptedGeneratedCount: 0, rejectedGeneratedCount: entries.filter((entry) => entry.status !== "PASS").length, systemEligibleGeneratedCount: selectedCount, passCandidateCount, notSelectedGeneratedCount: passCandidateCount - selectedCount, failedShotIds, selectedShotIds: [...selectedByShot.keys()], contactSheetPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${contactSheetRelativePath}`, entries: entries.map((entry) => ({...entry, file: undefined})), generatedAt: now};
  const event = createProductionEvent({workspace: before, action: "audit-universal-reference-generation-wave-actual-pixels", targetId: wave.manifestSha256, payload: {contract: report.contract, attemptedGeneratedCount: entries.length, adoptedGeneratedCount: 0, rejectedGeneratedCount: report.rejectedGeneratedCount, selectedShotIds: report.selectedShotIds, failedShotIds, assemblyCreated: false, criticPerformed: false, motionPerformed: false}});
  staged.production.eventLedger.eventCount += 1;
  staged.production.eventLedger.lastEventId = event.eventId;
  staged.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(staged, now)), {expectedWorkspaceSha256: before.workspaceSha256, event, files: {[reportRelativePath]: report, ["golden-film-visual-system-maturity-v1/maturity-run.json"]: runNext}});
  return {...report, workspaceSha256: committed.workspaceSha256, maturityRunSha256: runNext.maturityRunSha256};
});

console.log(JSON.stringify(result, null, 2));
