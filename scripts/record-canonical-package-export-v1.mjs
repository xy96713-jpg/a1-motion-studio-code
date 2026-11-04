#!/usr/bin/env node

// Records an already completed, authorization-bound package export in the
// canonical workspace. This never writes media and never touches Resolve.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertAuthorizationReceipt} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";
import {buildPackageExportImplementationBinding} from "../apps/studio-next/src/lib/a1-package-export-implementation-binding-v1.mjs";
import {assertUnboundResolvePackagingHandoff, sha as canonicalJsonBytesSha} from "../apps/studio-next/src/lib/a1-package-export-contract-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const exportRelativeRoot = "generated/system-line/editorial-asset-workbench-v1/canonical-package-export-v1";
const exportRoot = path.join(appRoot, "public", exportRelativeRoot);
const manifestPath = path.join(exportRoot, "manifest.json");
const handoffPath = path.join(exportRoot, "resolve-packaging-handoff.json");
const receiptPath = process.env.A1_PACKAGE_EXPORT_AUTH_RECEIPT
  || path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/packaging-authorization-v5/package-export-receipt.json");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const isSha = (value) => /^[a-f0-9]{64}$/u.test(String(value || ""));

const manifestBytes = fs.readFileSync(manifestPath);
const handoffBytes = fs.readFileSync(handoffPath);
const receiptBytes = fs.readFileSync(receiptPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const handoff = assertUnboundResolvePackagingHandoff(JSON.parse(handoffBytes.toString("utf8")));
const receipt = JSON.parse(receiptBytes.toString("utf8"));
const implementation = buildPackageExportImplementationBinding(root);

if (manifest?.contract !== "A1CanonicalPackageExport/v1" || manifest.status !== "EXPORTED_MANIFEST") throw new Error("canonical-package-export-manifest-invalid");
if (manifest.implementationSha256 !== implementation.implementationSha256) throw new Error("canonical-package-export-implementation-drift");
if (manifest.outputCount !== 13 || manifest.outputs?.length !== 13) throw new Error("canonical-package-export-thirteen-outputs-required");
if (manifest.outputs.filter((item) => item.route === "OVERLAY_ALPHA").length !== 6) throw new Error("canonical-package-export-six-overlays-required");
if (manifest.outputs.filter((item) => item.route === "FULLSCREEN_PACKAGE").length !== 7) throw new Error("canonical-package-export-seven-fullscreen-required");
for (const key of ["containsBaseFootage", "containsPresenterPixels", "containsMicrophonePixels", "containsBoomPixels", "containsAudio", "containsCaptions", "productionWired", "finalFilm", "resolveInsertAuthorized", "resolveInsertReady"]) {
  if (manifest[key] !== false) throw new Error(`canonical-package-export-forbidden-flag:${key}`);
}
if (manifest.packageExportAuthorized !== true || manifest.productionArtifact !== true || manifest.packagingDeliverable !== true) throw new Error("canonical-package-export-authority-flags-invalid");
if (handoff.sourceExportManifestSha256 !== canonicalJsonBytesSha(Buffer.from(JSON.stringify(manifest)))) throw new Error("canonical-package-export-handoff-source-mismatch");

for (const output of manifest.outputs) {
  const outputPath = path.join(appRoot, "public", String(output.outputPath || "").replace(/^\/+/, ""));
  const outputBytes = fs.readFileSync(outputPath);
  if (!isSha(output.sha256) || sha(outputBytes) !== output.sha256 || outputBytes.length !== output.bytes) throw new Error(`canonical-package-export-output-parity-failed:${output.shotId}`);
  const event = handoff.events.find((item) => item.shotId === output.shotId);
  if (!event || event.route !== output.route || event.assetPixelSources?.[0]?.sha256 !== output.sha256) throw new Error(`canonical-package-export-handoff-event-mismatch:${output.shotId}`);
}

const validatedReceipt = assertAuthorizationReceipt(receipt, {
  stage: "PACKAGE_EXPORT",
  entrypointId: "system-line-canonical-package-export-v1",
  targetId: "CURRENT_SYSTEM_LINE_CANONICAL_PACKAGE_EXPORT",
  outputRoute: "ROUTE_DECISION_REQUIRED",
  workspaceSha256: manifest.workspaceSha256,
  workspaceFileSha256: manifest.workspaceFileSha256,
  transitionSha256: manifest.transitionSha256,
  implementationSha256: manifest.implementationSha256,
});

const now = new Date().toISOString();
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== manifest.workspaceSha256) throw new Error("canonical-package-export-record-workspace-drift");
  if (current.production?.staticPackageReview?.manifestSha256 !== manifest.sourceReviewManifestSha256
    || current.production?.staticPackageReview?.contactSheetSha256 !== manifest.sourceReviewContactSheetSha256
    || current.production?.staticPackageReview?.status !== "SYSTEM_VISUAL_APPROVED_DELEGATED") throw new Error("canonical-package-export-static-review-binding-invalid");

  const next = structuredClone(current);
  next.production.packagingAuthorization.receipts.PACKAGE_EXPORT = {
    contract: validatedReceipt.contract,
    version: validatedReceipt.version,
    stage: validatedReceipt.stage,
    status: "CONSUMED",
    authorized: true,
    authorizationId: validatedReceipt.authorizationId,
    entrypointId: validatedReceipt.entrypointId,
    targetId: validatedReceipt.targetId,
    outputRoute: validatedReceipt.outputRoute,
    implementationSha256: validatedReceipt.implementationSha256,
    receiptSha256: validatedReceipt.receiptSha256,
    issuedAt: validatedReceipt.issuedAt,
    consumedAt: now,
  };
  next.production.canonicalPackageExport = {
    contract: "A1CanonicalPackageExportRecord/v1",
    version: 1,
    status: "EXPORTED",
    current: true,
    exportedAt: manifest.exportedAt,
    recordedAt: now,
    outputRootPublicUrl: `/${exportRelativeRoot}`,
    manifestPublicUrl: `/${exportRelativeRoot}/manifest.json`,
    manifestSha256: sha(manifestBytes),
    manifestContract: manifest.contract,
    sourceReviewManifestSha256: manifest.sourceReviewManifestSha256,
    sourceReviewContactSheetSha256: manifest.sourceReviewContactSheetSha256,
    implementationSha256: manifest.implementationSha256,
    authorizationReceiptSha256: validatedReceipt.receiptSha256,
    outputCount: 13,
    overlayCount: 6,
    fullscreenCount: 7,
    textDeliveryMode: "BAKED_FUSION_PIXEL_GLYPH_OUTLINES",
    timelineAssetEditableText: false,
    packageExportAuthorized: true,
    resolveInsertAuthorized: false,
    productionWired: false,
    finalFilm: false,
    containsBaseFootage: false,
    containsPresenterPixels: false,
    containsMicrophonePixels: false,
    containsBoomPixels: false,
    containsAudio: false,
    containsCaptions: false,
    resolveHandoff: {
      contract: handoff.contract,
      status: handoff.status,
      timelineBindingStatus: handoff.timelineBindingStatus,
      publicUrl: `/${exportRelativeRoot}/resolve-packaging-handoff.json`,
      sha256: sha(handoffBytes),
      eventCount: handoff.events.length,
      resolveProjectMutationPerformed: false,
      resolveInsertAuthorized: false,
    },
  };
  next.production.assembly = {
    ...next.production.assembly,
    status: "NOT_CREATED",
    assemblyCreated: false,
    productionWired: false,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "record-canonical-package-export",
    targetId: "CURRENT_SYSTEM_LINE_CANONICAL_PACKAGE_EXPORT",
    payload: {
      manifestSha256: recalculated.production.canonicalPackageExport.manifestSha256,
      resolveHandoffSha256: recalculated.production.canonicalPackageExport.resolveHandoff.sha256,
      authorizationReceiptSha256: validatedReceipt.receiptSha256,
      outputCount: 13,
      mediaGenerationPerformed: false,
      resolveProjectMutationPerformed: false,
      finalFilmRendered: false,
    },
  });
  const saved = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `record-canonical-package-export-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
  });
  return {
    workspaceSha256: saved.workspaceSha256,
    transitionSha256: saved.transitionSha256,
    stage: recalculated.production.authority.currentStage,
    nextAction: recalculated.production.authority.nextAction,
    manifestSha256: recalculated.production.canonicalPackageExport.manifestSha256,
    resolveHandoffSha256: recalculated.production.canonicalPackageExport.resolveHandoff.sha256,
  };
});

console.log(JSON.stringify({...result, mediaGenerationPerformed: false, resolveProjectMutationPerformed: false, finalFilmRendered: false}, null, 2));
