#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace, projectDirs} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildUniversalReferenceAttachmentManifest, normalizeUniversalReferenceInputs} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const outputRelativePath = "ed19-reference-attached-look-master-v1/preflight.json";
const outputPath = path.join(artifactDir, outputRelativePath);
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const now = new Date().toISOString();

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const phase = workspace.production.project || {};
const automation = workspace.production.packagingAutomation || {};
const repairManifest = workspace.production.incrementalRepairManifestAuthority;
const repairFile = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json");
const repair = JSON.parse(fs.readFileSync(repairFile, "utf8"));
const repairEntry = repair.entries.find((entry) => entry.shotId === "ED-19");
const plan = workspace.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-19");

if (!repairEntry || !plan) throw new Error("ed19-reference-preflight-input-missing");
if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.workerStatus !== "frozen") throw new Error("ed19-reference-preflight-runtime-not-frozen");
if ((workspace.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("ed19-reference-preflight-assembly-forbidden");
if (automation.status !== "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED") throw new Error("ed19-reference-preflight-automation-status-invalid");
if (repairEntry.status !== "READY_FOR_GENERATION" || repairEntry.nextAction !== "PREPARE_REFERENCE_ATTACHED_FULL_LOOK_MASTER_NO_DISPATCH") throw new Error("ed19-reference-preflight-repair-entry-not-ready");
if (repairEntry.planSha256 !== plan.planSha256 || repairEntry.generationAllowed !== true) throw new Error("ed19-reference-preflight-plan-binding-invalid");
if (plan.contentTreatment !== "PIXEL_WINDOW" || !["EVA_TYPOGRAPHY_ONLY", "EVA_TEXTURE_ONLY"].includes(plan.typographyTreatment) || plan.presentationMode !== "FULLSCREEN_EXPLAINER_TAKEOVER" || plan.assemblyMode !== "EXPLAINER") throw new Error("ed19-reference-preflight-current-route-invalid");

const references = [
  {
    id: "ed-19-real-hold-frame",
    sourcePath: path.join(appRoot, "public", plan.videoContext.baseFrame.publicUrl.replace(/^\//u, "")),
    sourceSha256: plan.videoContext.baseFrame.sha256,
    sourceType: "REAL_HOLD_FRAME",
    semanticRole: "real-hold-frame-transition-and-composition-anchor",
    transformPolicy: "PIXEL_EXACT_RESTORE",
    role: "real-hold-frame-composition-anchor",
  },
  ...(plan.referenceInputs || []).map((input) => ({
    ...input,
    sourcePath: input.sourcePath,
    sourceSha256: input.sourceSha256 || input.sha256,
  })),
];
const normalized = normalizeUniversalReferenceInputs(references);
const attachmentManifest = buildUniversalReferenceAttachmentManifest({jobId: `ed19-look-master-preflight-${repairEntry.promptHash.slice(0, 12)}`, referenceInputs: normalized, stage: "READY_TO_ATTACH"});
const preflightBase = {
  contract: "A1ED19ReferenceAttachedLookMasterPreflight/v1",
  status: "READY_FOR_MANUAL_IMAGEGEN_ATTACHMENTS",
  createdAt: now,
  shotId: "ED-19",
  workspaceSha256: workspace.workspaceSha256,
  phase: repair.currentRepairStatus,
  automationStatus: automation.status,
  repairManifestSha256: repairManifest.manifestSha256,
  repairEntryChainHash: repairEntry.chainHash,
  planSha256: plan.planSha256,
  promptSha256: repairEntry.promptHash,
  productionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION",
  referencePackagingContract: "A1UniversalReferenceToImagegenPackaging/v1",
  route: {
    contentTreatment: "PIXEL_WINDOW",
    presentationMode: "FULLSCREEN_EXPLAINER_TAKEOVER",
    assemblyMode: "EXPLAINER",
    typographyTreatment: "EVA_TYPOGRAPHY_ONLY",
    protectedPhrases: [...(plan.displayProtectedPhrases || ["Codex 在后台", "整理", "编排", "读取", "检查"])],
  },
  attachmentManifest,
  attachmentCount: attachmentManifest.fileCount,
  attachmentSourceSha256s: attachmentManifest.sourceSha256s,
  dispatchAllowed: false,
  imageGenerationPerformed: false,
  queueMutationPerformed: false,
  assemblyCreated: false,
  nextAction: "ATTACH_MANIFEST_TO_INITIAL_IMAGEGEN_PROMPT_ONLY_AFTER_EXPLICIT_DOWNSTREAM_AUTHORITY",
};
const preflight = {...preflightBase, preflightSha256: sha256(preflightBase)};
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: preflight.status, shotId: preflight.shotId, preflightSha256: preflight.preflightSha256, outputPath, workspaceSha256: workspace.workspaceSha256, planSha256: plan.planSha256, promptSha256: repairEntry.promptHash, attachmentCount: preflight.attachmentCount, dispatchAllowed: false, imageGenerationPerformed: false, queueMutationPerformed: false}, null, 2));
