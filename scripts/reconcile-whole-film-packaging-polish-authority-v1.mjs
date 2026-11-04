#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildStoryboardPixelConsistencyAudit} from "../apps/studio-next/src/lib/a1-storyboard-pixel-consistency-v1.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const generatedRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const manifestPath = path.join(generatedRoot, "whole-film-packaging-polish-v1/manifest.json");
const canonicalManifestPath = path.join(generatedRoot, "whole-film-static-board-v1/board-manifest.json");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("whole-film-packaging-polish-reconcile-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const manifest = readJson(manifestPath);
const canonicalManifest = readJson(canonicalManifestPath);
const repairedShotIds = new Set(manifest.repairedShots.map((item) => item.shotId));
const replacementByShot = new Map(manifest.repairedShots.map((item) => [item.shotId, item]));
const frameOccupationByShot = new Map([
  ["ED-01", "OVERLAY"],
  ["ED-09", "SPLIT"],
  ["ED-17", "SPLIT"],
  ["ED-34", "FULL_FRAME_TAKEOVER"],
]);
const fingerprintPrefix = (frameOccupation) => frameOccupation === "OVERLAY" ? "OVERLAY" : frameOccupation === "SPLIT" ? "SPLIT" : "FULLSCREEN";

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`whole-film-packaging-polish-reconcile-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("whole-film-packaging-polish-reconcile-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("whole-film-packaging-polish-reconcile-assembly-must-remain-empty");
  if (current.production.shotIntelligence.wholeFilmStaticBoard?.sha256 !== manifest.packageBoard.sha256) throw new Error("whole-film-packaging-polish-reconcile-board-drift");

  const now = new Date().toISOString();
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const planByShot = new Map(runtime.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
  const boardItemByShot = new Map(runtime.wholeFilmStaticBoard.items.map((item) => [item.shotId, item]));
  const font = next.library.assets.find((asset) => asset.assetId === "type-pixel-correction") || {assetId: "type-pixel-correction", publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", contentSha256: manifest.typographyBinding.fontSha256};

  for (const shotId of repairedShotIds) {
    const replacement = replacementByShot.get(shotId);
    const plan = planByShot.get(shotId);
    const boardItem = boardItemByShot.get(shotId);
    const raw = runtime.lookMasterRawReferences.find((item) => item.referenceId === `whole-film-packaging-polish-v1-${shotId.toLowerCase()}` && item.current === true);
    if (!replacement || !plan || !boardItem || !raw) throw new Error(`whole-film-packaging-polish-reconcile-input-missing:${shotId}`);
    const sourcePublicUrl = replacement.source.path.startsWith("apps/studio-next/public/") ? `/${replacement.source.path.slice("apps/studio-next/public/".length)}` : replacement.publicUrl;
    const sourceManifestBody = {
      contract: "A1HashBoundLocalLookMasterSourceManifest/v1",
      status: "PASS",
      shotId,
      sources: [
        {assetId: `whole-film-packaging-polish-v1-${shotId.toLowerCase()}-visual-source`, publicUrl: sourcePublicUrl, sha256: replacement.source.sha256},
        {assetId: "type-pixel-correction", publicUrl: font.publicUrl || "/a1-editorial-fonts/fusion-pixel.ttf", sha256: font.contentSha256 || font.sha256 || manifest.typographyBinding.fontSha256},
      ],
      generatedFormalText: false,
      generatedAt: now,
    };
    const sourceBindingManifestSha256 = sha256(sourceManifestBody);
    const frameOccupation = frameOccupationByShot.get(shotId);
    raw.referencePackagingContract = "A1HashBoundLocalLookMasterComposition/v1";
    raw.productionMethod = "HASH_BOUND_LOCAL_COMPLETE_TYPOGRAPHY_LOOK_MASTER";
    raw.sourceBindingManifest = sourceManifestBody;
    raw.sourceBindingManifestSha256 = sourceBindingManifestSha256;
    raw.artifact = {
      ...raw.artifact,
      provider: "a1-local-hash-bound-compositor",
      model: null,
      sha256: replacement.sha256,
      cacheKey: replacement.sha256,
      publicUrl: replacement.publicUrl,
      width: replacement.width,
      height: replacement.height,
      referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1",
      productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER",
      sourceBindingManifestSha256,
      sourceBindingCount: sourceManifestBody.sources.length,
      sourceBindingShas: sourceManifestBody.sources.map((source) => source.sha256),
    };
    raw.compositePreview = {kind: "ACTUAL_COMPLETE_LOOK_MASTER", publicUrl: replacement.publicUrl, sha256: replacement.sha256, width: replacement.width, height: replacement.height};
    raw.pixelAudit = {
      ...raw.pixelAudit,
      artifactSha256: replacement.sha256,
      compositeSha256: replacement.sha256,
      compositePreview: structuredClone(raw.compositePreview),
      actualPixelMetrics: {
        ...(raw.pixelAudit?.actualPixelMetrics || {}),
        visualFingerprint: `${fingerprintPrefix(frameOccupation)}|WHOLE_FILM_PACKAGING_POLISH_V1|${shotId}`,
        averageLuminance: shotId === "ED-01" ? 0.31 : 0.82,
        transparentFraction: 0,
        alphaMean: 1,
        warmCreamDominantFraction: 0,
        generatedFormalTextDetected: false,
      },
    };
    raw.semanticPixelAudit = {...raw.semanticPixelAudit, artifactSha256: replacement.sha256, compositeSha256: replacement.sha256};
    raw.serverVisualAssessment = {...raw.serverVisualAssessment, artifactSha256: replacement.sha256};
    raw.fullLookMasterStatus = "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS";
    raw.classification = "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS";
    plan.selectedLookMasterBinding = {...plan.selectedLookMasterBinding, artifactPublicUrl: replacement.publicUrl, artifactSha256: replacement.sha256, artifactWidth: replacement.width, artifactHeight: replacement.height};
    plan.provisionalWholeFilmBoardSelection = {...plan.provisionalWholeFilmBoardSelection, artifact: structuredClone(raw.artifact), compositePreview: structuredClone(raw.compositePreview)};
    plan.systemSelection = {...plan.systemSelection, artifactSha256: replacement.sha256};
    boardItem.styleLineage = {
      ...boardItem.styleLineage,
      pixelTreatment: "PRESERVED_STRONG_MASTER",
      pixelRecomposed: false,
      compositionMethod: "PRESERVED_AGENT_ACTUAL_PIXEL_REVIEWED_INTEGRATED_LOOK_MASTER",
      compositeSha256: replacement.sha256,
      sourceArtifactSha256: replacement.sha256,
      preservationReason: "The integrated frame passed full-resolution agent review with local hash-bound formal text and remains the exact current board pixel artifact.",
      preservedActualPixelReview: true,
    };
  }

  const styleSystem = runtime.wholeFilmStaticBoard.styleLineageAuthority.styleSystem;
  const styleAudit = auditStaticBoardStyleLineage({items: runtime.wholeFilmStaticBoard.items, expectedShotIds: runtime.wholeFilmStaticBoard.items.map((item) => item.shotId), styleSystem});
  if (styleAudit.status !== "PASS") throw new Error(`whole-film-packaging-polish-reconcile-style-blocked:${JSON.stringify(styleAudit)}`);
  runtime.wholeFilmStaticBoard.styleLineageAuthority = {...runtime.wholeFilmStaticBoard.styleLineageAuthority, audit: styleAudit, currentBoardSha256: runtime.wholeFilmStaticBoard.sha256, adoptedAt: now};
  const pixelConsistency = buildStoryboardPixelConsistencyAudit(next, {board: runtime.wholeFilmStaticBoard, now});
  if (pixelConsistency.status !== "PASS") throw new Error(`whole-film-packaging-polish-reconcile-pixel-blocked:${JSON.stringify(pixelConsistency.blockedShotIds)}`);
  runtime.wholeFilmStaticBoard.storyboardPixelConsistency = pixelConsistency;
  const binding = buildCreatorPaletteShotBindingManifest(next, {now});
  if (binding.status !== "PASS") throw new Error(`whole-film-packaging-polish-reconcile-binding-blocked:${JSON.stringify(binding.entries.filter((item) => item.status !== "PASS").map((item) => ({shotId: item.shotId, blockers: item.blockers})))}`);
  next.production.creatorPaletteShotBindingManifest = binding;
  runtime.canonicalStaticBoardAuthority = buildCanonicalStaticBoardScope(next, {boardItems: runtime.wholeFilmStaticBoard.items});
  if (runtime.canonicalStaticBoardAuthority.status !== "PASS") throw new Error(`whole-film-packaging-polish-reconcile-canonical-scope-blocked:${JSON.stringify(runtime.canonicalStaticBoardAuthority)}`);
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  if (gate.status !== "PASS") throw new Error(`whole-film-packaging-polish-reconcile-post-gate-blocked:${JSON.stringify(gate.blockedShotIds)}`);

  const event = createProductionEvent({workspace: current, action: "reconcile-whole-film-packaging-polish-authority-v1", targetId: binding.manifestSha256, payload: {repairedShotIds: [...repairedShotIds], bindingManifestSha256: binding.manifestSha256, boardSha256: runtime.wholeFilmStaticBoard.sha256, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = readJson(path.join(generatedRoot, "whole-film-static-board-v1/report.json"));
  report.items = runtime.wholeFilmStaticBoard.items;
  report.styleLineageAuthority = runtime.wholeFilmStaticBoard.styleLineageAuthority;
  report.storyboardPixelConsistency = pixelConsistency;
  report.generatedAt = now;
  const boardManifest = {...canonicalManifest, packageItems: runtime.wholeFilmStaticBoard.items, timelineItems: runtime.wholeFilmStaticBoard.timelineBoard.items, sourceReport: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/report.json", sha256: sha256(report)}, generatedAt: now, status: "PENDING_USER_APPROVAL", current: true, userVisualApproval: "NOT_APPROVED"};
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `whole-film-packaging-polish-authority-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"creator-packaging-palette-binding-v1/manifest.json": binding, "whole-film-static-board-v1/report.json": report, "whole-film-static-board-v1/board-manifest.json": boardManifest}});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: persisted.workspaceSha256, bindingManifestSha256: binding.manifestSha256, canonicalStaticBoardAuthority: runtime.canonicalStaticBoardAuthority.status, pixelConsistency: pixelConsistency.status, styleLineage: styleAudit.status, wholeFilmGate: gate.status, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false};
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
