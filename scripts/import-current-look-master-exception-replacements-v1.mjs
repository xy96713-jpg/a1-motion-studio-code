#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
const onlyArg = process.argv.find((value) => value.startsWith("--only="));
const onlyShotIds = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").filter(Boolean)) : null;
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("replacement-import-expected-workspace-sha-required");

const INPUTS = [
  {
    shotId: "ED-14",
    directionId: "direction-01",
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/look-masters/ED-14/119bfc6f13ce-replacement-source-range-exact-source.png",
    expectedSha256: "a58b5f0a80fd9e575a02f9a2ba5d47732801cead8bfb1718c262310fa5dd2bc6",
    generationId: "codex-imagegen:exec-c7e5308c-3f2f-48b2-a5e4-0fa577e4baf6",
    promptSummary: "真实 ACL 论文页为主证据演员；只表达英文新闻样本中句法、尤其词汇多样性下降和表达范围可能变窄；禁止默认路径、稳妥表达与伪引用。",
  },
  {
    shotId: "ED-34",
    directionId: "direction-01",
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/look-masters/ED-34/10b66a55d5ed-replacement-preference-loom.png",
    expectedSha256: "d3ac6927cab8f0fdff870934e81a8f6d54c66594219e3ed4ed519ce58e1ec93c",
    generationId: "codex-imagegen:exec-ca11a06e-9a7d-4f5a-99f1-291a2d20461e",
    promptSummary: "真实 ED-34 hold frame 约束下的透明上左叠加：三种偏好材料进入织机，一条带作者纹理的方向箭头输出；无文字、无 UI、中央人物净空。",
  },
];

const SELECTED_INPUTS = onlyShotIds ? INPUTS.filter((item) => onlyShotIds.has(item.shotId)) : INPUTS;
if (!SELECTED_INPUTS.length || (onlyShotIds && SELECTED_INPUTS.length !== onlyShotIds.size)) throw new Error("replacement-import-only-shot-invalid");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const resolvePublicFile = (publicUrl) => {
  const file = path.resolve(publicRoot, String(publicUrl).replace(/^\//u, ""));
  if (!String(publicUrl).startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("replacement-import-public-path-invalid");
  return file;
};
async function perceptualHashForImage(file) {
  const {data} = await sharp(file).resize(16, 16, {fit: "fill"}).grayscale().raw().toBuffer({resolveWithObject: true});
  const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
  let bits = "";
  for (const value of data) bits += value >= average ? "1" : "0";
  return bits.match(/.{1,4}/gu).map((nibble) => Number.parseInt(nibble.padEnd(4, "0"), 2).toString(16)).join("");
}

const prepared = [];
for (const input of SELECTED_INPUTS) {
  const file = resolvePublicFile(input.publicUrl);
  if (!fs.existsSync(file)) throw new Error(`replacement-import-file-missing:${input.shotId}`);
  const bytes = fs.readFileSync(file);
  const artifactSha256 = sha256(bytes);
  if (artifactSha256 !== input.expectedSha256) throw new Error(`replacement-import-file-sha-mismatch:${input.shotId}:${artifactSha256}`);
  const metadata = await sharp(file).metadata();
  if (metadata.width !== 1672 || metadata.height !== 941) throw new Error(`replacement-import-dimensions-invalid:${input.shotId}`);
  prepared.push({...input, file, metadata, artifactSha256, perceptualHash: await perceptualHashForImage(file)});
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`replacement-import-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("replacement-import-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("replacement-import-assembly-already-created");
  if (SELECTED_INPUTS.some((item) => !(current.production.authority.nextAction?.targetShotIds || []).includes(item.shotId))) throw new Error("replacement-import-shot-not-current-exception");
  const existingArtifactShas = new Set((current.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean));
  if (prepared.some((item) => existingArtifactShas.has(item.artifactSha256))) throw new Error("replacement-import-duplicate-artifact-sha");

  const now = new Date().toISOString();
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const imported = [];
  const reportFiles = {};
  for (const item of prepared) {
    const plan = runtime.packageLookMasterPlans.find((candidate) => candidate.shotId === item.shotId);
    const direction = plan?.candidateDirections?.find((candidate) => candidate.directionId === item.directionId);
    if (!plan || !direction) throw new Error(`replacement-import-current-plan-direction-missing:${item.shotId}`);
    const promptSha256 = sha256(item.promptSummary);
    const generationInputHash = sha256({shotId: item.shotId, planSha256: plan.planSha256, styleBriefSha256: plan.styleBriefSha256, directionFingerprint: direction.fingerprint, promptSha256, holdFrameSha256: plan.videoContext.baseFrame.sha256, sourceEvidenceSha256: (plan.sourceEvidenceInputs || []).map((source) => source.sha256)});
    const researchReferenceUseProof = plan.networkDecision === "REQUIRED"
      ? {status: "PASS", sentToImageGen: true, sourcePacketSha256: plan.researchPacketSha256, sourceIds: (plan.sourceEvidenceInputs || []).map((source) => source.id), artifactSha256: (plan.sourceEvidenceInputs || []).map((source) => source.sha256)}
      : {status: "NOT_REQUIRED", sentToImageGen: false, sourcePacketSha256: null, sourceIds: []};
    if (plan.networkDecision === "REQUIRED" && (!researchReferenceUseProof.sourceIds.length || researchReferenceUseProof.artifactSha256.some((value) => !value))) throw new Error(`replacement-import-research-reference-proof-missing:${item.shotId}`);
    const artifact = {
      contract: "A1GeneratedEditorialAssetCache/v1",
      assetId: null,
      targetKind: "package-look-master",
      briefId: `look-master-${item.shotId.toLowerCase()}-exception-replacement`,
      briefHash: sha256({planSha256: plan.planSha256, directionFingerprint: direction.fingerprint}),
      treatmentHash: null,
      shotId: item.shotId,
      layerId: null,
      provider: "codex-imagegen",
      model: "gpt-image-2",
      prompt: item.promptSummary,
      promptSha256,
      generationInputHash,
      cacheKey: generationInputHash,
      sha256: item.artifactSha256,
      publicUrl: item.publicUrl,
      mimeType: "image/png",
      generationId: item.generationId,
      width: item.metadata.width,
      height: item.metadata.height,
      hasAlpha: item.metadata.hasAlpha === true,
      cacheHit: false,
      durationMs: null,
      generatedAt: now,
      perceptualHash: item.perceptualHash,
      workspaceImported: true,
    };
    const referenceId = `look-master-raw-replacement-${item.shotId.toLowerCase()}-${item.artifactSha256.slice(0, 12)}`;
    for (const existing of runtime.lookMasterRawReferences.filter((candidate) => candidate.shotId === item.shotId && candidate.artifact?.sha256 !== item.artifactSha256 && candidate.current === true)) {
      existing.current = false;
      existing.recommendationEligible = false;
      existing.selectionEligible = false;
      existing.assemblyEligible = false;
      existing.status = item.shotId === "ED-14" ? "SOURCE_PIXEL_REBIND_SUPERSEDED_EXPLORATION_ONLY" : "VISUAL_REJECTED_SUPERSEDED_EXPLORATION_ONLY";
      existing.supersededAt = now;
      existing.supersededByArtifactSha256 = item.artifactSha256;
    }
    const raw = {
      contract: "A1PackageLookMasterRaw/v1",
      referenceId,
      shotId: item.shotId,
      eventId: plan.eventId,
      planSha256: plan.planSha256,
      styleBriefSha256: plan.styleBriefSha256,
      candidateDirectionId: direction.directionId,
      directionFingerprint: direction.fingerprint,
      classification: "INTEGRATED_PACKAGE_CONCEPT",
      status: "LOOK_MASTER_RAW",
      artifact,
      provenance: {
        generationJobContract: "A1BoundedImageGenJobResult/v1",
        generationJobId: `bounded-exception-${item.shotId.toLowerCase()}-${generationInputHash.slice(0, 12)}`,
        generationInputHash,
        provider: artifact.provider,
        model: artifact.model,
        sourceEvidenceInputs: structuredClone(plan.sourceEvidenceInputs || []),
        researchReferenceUseProof,
        holdFrameSha256: plan.videoContext.baseFrame.sha256,
        subjectBounds: plan.videoContext.subjectBounds,
      },
      sourceEvidenceInputs: structuredClone(plan.sourceEvidenceInputs || []),
      researchReferenceUseProof,
      pixelAudit: null,
      semanticPixelAudit: null,
      candidateAdmissionRequired: false,
      recommendationEligible: false,
      selectionEligible: false,
      assemblyEligible: false,
      current: true,
      reviewDeferredTo: "ACTUAL_PIXEL_SEMANTIC_AUDIT",
      note: "本轮例外修复的完整 Look Master 原图；默认不可推荐，只有 director/finalizer 完成确定性、实际像素、OCR、重复、来源与正片兼容门禁后才可晋级。",
      createdAt: now,
    };
    runtime.lookMasterRawReferences.push(raw);
    imported.push({shotId: item.shotId, referenceId, artifactSha256: item.artifactSha256, perceptualHash: item.perceptualHash, planSha256: plan.planSha256, styleBriefSha256: plan.styleBriefSha256, directionId: direction.directionId, recommendationEligible: false});
    reportFiles[`look-master-exception-repair-v2/imports/${item.shotId.toLowerCase()}-${item.artifactSha256.slice(0, 16)}.json`] = {contract: "A1BoundedImageGenJobResult/v1", status: "COMPLETE_RAW_UNREVIEWED", ...imported.at(-1), artifact, researchReferenceUseProof, importedAt: now};
  }
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  for (const item of imported) {
    const raw = recalculated.production.shotIntelligence.lookMasterRawReferences.find((candidate) => candidate.referenceId === item.referenceId);
    assert.equal(raw.recommendationEligible, false);
    assert.equal(raw.selectionEligible, false);
  }
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  const commitId = `look-master-exception-import-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const event = createProductionEvent({workspace: current, action: "import-current-look-master-exception-replacements", targetId: imported.map((item) => item.shotId).join(","), payload: {contract: "A1CurrentLookMasterExceptionReplacementImport/v1", imported, generatedPngCount: imported.length, recommendationEligibleCount: 0, assemblyCreated: false}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1CurrentLookMasterExceptionReplacementImportReport/v1", status: "PASS", workspaceSha256Before: current.workspaceSha256, imported, generatedPngCount: imported.length, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: 0, generatedAt: now};
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId, files: {...reportFiles, "look-master-exception-repair-v2/import.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, checkpointJournal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
