#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  buildEditorialVideoCompositionGrammar,
} from "../apps/studio-next/src/lib/a1-video-composition-background-supply-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentAuthority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  assert.equal(current.production.generation.summary.queued, 0, "presenter-carrier-rebind-requires-empty-queue");
  assert.equal(current.production.generation.summary.running, 0, "presenter-carrier-rebind-requires-idle-runtime");
  assert.equal(current.production.generation.workerStatus, "frozen", "presenter-carrier-rebind-requires-frozen-runtime");
  assert.equal(currentAuthority.authorization.userVisualApproval, "NOT_APPROVED");

  const now = new Date().toISOString();
  const sampledReferences = (currentAuthority.compositionGrammar?.sampledReferences || []).map(({use: _use, ...reference}) => reference);
  const grammar = buildEditorialVideoCompositionGrammar({workspace: current, sampledReferences, now});
  const scheduleByShot = new Map(grammar.currentFilm.shotSchedule.map((item) => [item.shotId, item]));
  const coverageByShot = new Map((current.production.shotVisualCoveragePlan?.shotPlans || []).map((item) => [item.shotId, item]));
  const contextByShot = new Map((current.production.shotIntelligence?.videoPackagingContexts?.items || []).map((item) => [item.shotId, item]));

  const previousMapping = currentAuthority.storyboardDefaultLibraryBinding;
  assert.equal(previousMapping?.assignments?.length, 34, "presenter-carrier-rebind-mapping-required");
  const assignments = previousMapping.assignments.map((previous) => {
    const scheduled = scheduleByShot.get(previous.shotId);
    assert.ok(scheduled, `presenter-carrier-rebind-schedule-missing:${previous.shotId}`);
    const presenter = ["PRESENTER_CLEAN", "PRESENTER_INTEGRATED_PACKAGE"].includes(scheduled.structuralCarrier);
    if (!presenter) return {
      ...previous,
      structuralCarrier: scheduled.structuralCarrier,
      facelessRerouteRequired: false,
      verifiedPresenterSourceRequired: false,
      backgroundSupplyRequired: scheduled.backgroundSupplyRequired,
      generatedSpecificPersonUsed: false,
    };
    const coverage = coverageByShot.get(previous.shotId);
    const context = contextByShot.get(previous.shotId);
    const fallbackRelativePath = `generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/${previous.shotId.toLowerCase()}-hold-frame.jpg`;
    const fallbackFile = path.join(appRoot, "public", fallbackRelativePath);
    const fallbackSource = fs.existsSync(fallbackFile) ? {publicUrl: `/${fallbackRelativePath}`, sha256: crypto.createHash("sha256").update(fs.readFileSync(fallbackFile)).digest("hex"), provenance: "deterministic-hold-frame-from-registered-editor-owned-video"} : null;
    const source = context?.baseFrame || (coverage?.preview?.kind === "VERIFIED_PRESENTER_SOURCE" ? coverage.preview : null) || fallbackSource;
    assert.ok(source?.publicUrl && source?.sha256, `presenter-carrier-rebind-source-missing:${previous.shotId}`);
    return {
      ...previous,
      structuralCarrier: scheduled.structuralCarrier,
      facelessRerouteRequired: false,
      verifiedPresenterSourceRequired: true,
      verifiedPresenterSource: {publicUrl: source.publicUrl, sha256: source.sha256, provenance: source.provenance || "verified-editor-owned-presenter-source"},
      backgroundSupplyRequired: false,
      backgroundCandidateId: null,
      typographyTemplateId: scheduled.structuralCarrier === "PRESENTER_INTEGRATED_PACKAGE" ? "pixel-correction-anchor" : null,
      elementKitId: null,
      elementActorIds: [],
      shotSpecificAssetId: null,
      supersededGeneratedReplacementCandidateId: previous.shotSpecificAssetId || null,
      verifiedSourceRequired: false,
      generatedSpecificPersonUsed: false,
      generatedAssetMayReplaceEvidence: false,
      status: "BOUND_TO_VERIFIED_PRESENTER_SOURCE",
    };
  });
  assert.equal(assignments.find((item) => item.shotId === "ED-31")?.structuralCarrier, "PRESENTER_INTEGRATED_PACKAGE");
  assert.equal(assignments.find((item) => item.shotId === "ED-32")?.structuralCarrier, "PRESENTER_CLEAN");
  assert.equal(assignments.filter((item) => item.verifiedPresenterSourceRequired).length, 6);
  assert.ok(assignments.filter((item) => item.verifiedPresenterSourceRequired).every((item) => item.backgroundCandidateId === null && item.shotSpecificAssetId === null && item.generatedSpecificPersonUsed === false));

  const mappingBody = {
    ...previousMapping,
    sourceGrammarSha256: grammar.grammarSha256,
    sourceWorkspaceSha256: current.workspaceSha256,
    assignments,
    rules: {
      ...previousMapping.rules,
      generatedSpecificPersonIsDefault: false,
      verifiedPresenterSourceAllowed: true,
      verifiedPresenterMayCarryCleanOrIntegratedPackage: true,
      generatedAssetMayReplaceVerifiedPresenter: false,
      presenterIntegratedPackageMustPreserveSubjectSafeZone: true,
    },
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };
  delete mappingBody.mappingSha256;
  const mapping = {...mappingBody, mappingSha256: sha256(mappingBody)};

  const next = structuredClone(current);
  const authority = structuredClone(currentAuthority);
  delete authority.authoritySha256;
  authority.compositionGrammar = grammar;
  authority.storyboardDefaultLibraryBinding = mapping;
  authority.visualRules = {
    ...authority.visualRules,
    generatedSpecificPersonAllowedWithoutExplicitException: false,
    verifiedPresenterSourceAllowed: true,
    verifiedPresenterSourceIsNotGeneratedCharacter: true,
    verifiedPresenterMayCarryCleanOrIntegratedPackage: true,
  };
  authority.updatedAt = now;
  authority.authoritySha256 = sha256(authority);
  next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(authority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "rebind-verified-presenter-carriers-v1",
    targetId: mapping.mappingSha256,
    payload: {
      grammarSha256: grammar.grammarSha256,
      mappingSha256: mapping.mappingSha256,
      verifiedPresenterShotIds: grammar.currentFilm.verifiedPresenterShotIds,
      presenterIntegratedShotIds: assignments.filter((item) => item.structuralCarrier === "PRESENTER_INTEGRATED_PACKAGE").map((item) => item.shotId),
      presenterCleanShotIds: assignments.filter((item) => item.structuralCarrier === "PRESENTER_CLEAN").map((item) => item.shotId),
      generatedSpecificPersonUsed: false,
      imageGenerationPerformed: false,
      motionAllowed: false,
    },
    now,
  });
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const reportBody = {
    contract: "A1VerifiedPresenterCarrierRebindReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    grammarSha256: grammar.grammarSha256,
    mappingSha256: mapping.mappingSha256,
    verifiedPresenterShotIds: grammar.currentFilm.verifiedPresenterShotIds,
    presenterIntegratedShotIds: ["ED-31"],
    presenterCleanShotIds: assignments.filter((item) => item.structuralCarrier === "PRESENTER_CLEAN").map((item) => item.shotId),
    fullscreenTypographyShotIds: assignments.filter((item) => item.structuralCarrier === "TYPOGRAPHY_TAKEOVER").map((item) => item.shotId),
    generatedSpecificPersonUsed: false,
    generatedAssetReplacementOfPresenter: false,
    imageGenerationPerformed: false,
    motionPerformed: false,
    userVisualApproval: "NOT_APPROVED",
    createdAt: now,
  };
  const report = {...reportBody, reportSha256: sha256(reportBody)};
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `verified-presenter-carrier-rebind-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "article-asset-background-lane-v1/video-composition-grammar.json": grammar,
      "default-design-asset-library-v1/storyboard-library-binding-v1/mapping.json": mapping,
      "default-design-asset-library-v1/presenter-carrier-rebind-v1/report.json": report,
    },
  });
  return {report, persisted};
});

console.log(JSON.stringify({
  status: result.report.status,
  workspaceSha256: result.persisted.workspaceSha256,
  verifiedPresenterShotIds: result.report.verifiedPresenterShotIds,
  presenterIntegratedShotIds: result.report.presenterIntegratedShotIds,
  presenterCleanShotIds: result.report.presenterCleanShotIds,
  fullscreenTypographyShotIds: result.report.fullscreenTypographyShotIds,
  generatedSpecificPersonUsed: false,
  imageGenerationPerformed: false,
  motionPerformed: false,
  userVisualApproval: "NOT_APPROVED",
}, null, 2));
