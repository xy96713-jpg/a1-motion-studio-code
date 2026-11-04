#!/usr/bin/env node

// Rebinds the already-recorded v7 delegated static pass to the current
// package-export implementation and lifecycle projection. This script does
// not issue a receipt and never loads or writes media.
import path from "node:path";
import {fileURLToPath} from "node:url";
import {auditMediaEntrypointAuthorization, assertMediaEntrypointAuthorizationAudit} from "../apps/studio-next/src/lib/a1-media-entrypoint-authorization-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production?.staticPackageReview?.status !== "SYSTEM_VISUAL_APPROVED_DELEGATED") throw new Error("delegated-static-pass-required");
  if (current.production?.staticPackageReview?.manifestSha256 !== "b3e9640973c1bcfde54166a7472b4b6a9e2fe88f90d360c393a4e31a75dddc2b") throw new Error("delegated-static-pass-v7-manifest-required");
  const registry = assertMediaEntrypointAuthorizationAudit(auditMediaEntrypointAuthorization({projectRoot: root}));
  if (registry.activeProductionWriterCount !== 1) throw new Error("canonical-package-export-writer-not-registered");
  const next = structuredClone(current);
  next.production.mediaEntrypointRegistry = registry;
  next.production.packagingContractArchitectureAudit = {
    ...(next.production.packagingContractArchitectureAudit || {}),
    status: "PASS",
    codeContractReviewClosed: true,
    productionWriterImplemented: true,
    packageExportWriterStatus: "STATIC_REVIEW_APPROVED_PACKAGE_EXPORT_IMPLEMENTED",
    updatedAt: now,
  };
  const event = createProductionEvent({workspace: current, action: "reconcile-package-export-authority", targetId: "CURRENT_SYSTEM_LINE_CANONICAL_PACKAGE_EXPORT", payload: {registryStatus: registry.status, activeProductionWriterCount: registry.activeProductionWriterCount, receiptIssued: false, mediaGenerationPerformed: false, resolveProjectMutationPerformed: false}});
  const saved = persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, now), {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `reconcile-package-export-authority-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {workspaceSha256: saved.workspaceSha256, transitionSha256: saved.transitionSha256, registryStatus: registry.status, nextAction: recalculateEditorialAssetWorkbench(next, now).production.authority.nextAction, stage: recalculateEditorialAssetWorkbench(next, now).production.authority.currentStage};
});
console.log(JSON.stringify({...result, receiptIssued: false, mediaGenerationPerformed: false, resolveProjectMutationPerformed: false}, null, 2));
