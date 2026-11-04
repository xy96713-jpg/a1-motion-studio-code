#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  buildArticleAssetProductionAuthority,
  buildBackgroundLaneRequestPack,
} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {compileCurrentStoryboardTasteBriefs} from "../apps/studio-next/src/lib/a1-current-storyboard-taste-compiler-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const systemArtifactRoot = path.join(repoRoot, ".codex-artifacts/system-progress-system-line");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(repoRoot, file).split(path.sep).join("/");

function evidence(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.existsSync(absolutePath)
    ? {path: relativePath, sha256: fileSha256(absolutePath), exists: true}
    : {path: relativePath, sha256: null, exists: false};
}

function buildSupersessionManifest(current, directionEnvelope) {
  const isolatedCandidate = "/Users/a1/Documents/Codex/2026-08-13/crt/outputs/visual-director-lane-v1/candidate-a-paper-loom.png";
  const body = {
    contract: "A1ArticleAssetAuthoritySupersessionManifest/v1",
    status: "PASS",
    currentAuthorityContract: "A1ArticleAssetProductionAuthority/v1",
    currentProductionMethod: "SEPARATE_ASSET_LANES_THEN_DETERMINISTIC_ASSEMBLY",
    sourceWorkspaceSha256: current.workspaceSha256,
    currentVisualDirectionEnvelopeSha256: directionEnvelope.directionEnvelopeSha256,
    dispositions: [
      {
        id: "fixed-three-shot-packaging-paragraph-canary",
        status: "HISTORY_READ_ONLY",
        current: false,
        evidence: evidence(".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-effective-lifecycle-v1/current.json"),
        reason: "A fixed ED-12/13/14 group is not a prerequisite for separately produced article assets.",
      },
      {
        id: "ed13-character-triptych-and-person-look-master",
        status: "SUPERSEDED_HISTORY_ONLY",
        current: false,
        evidence: evidence(".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/ed13-approved-static-triptych-v1/manifest.json"),
        reason: "Specific people and character-led look masters are not the current default direction.",
      },
      {
        id: "stale-character-default-visual-direction-envelope",
        status: "SUPERSEDED",
        current: false,
        evidence: evidence(".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/storyboard-interop-v1/visual-direction-envelope.json"),
        supersededBySha256: directionEnvelope.directionEnvelopeSha256,
      },
      {
        id: "article-packaging-kit-system-critic-approval",
        status: "HISTORY_ONLY_NOT_USER_APPROVAL",
        current: false,
        sourceKitSha256: current.production?.articlePackagingKit?.kitSha256 || null,
        reviewedBy: current.production?.articlePackagingKit?.review?.reviewedBy || null,
        reason: "Machine or critic approval must not set the user visual approval gate.",
      },
    ],
    independentComparisonCandidate: fs.existsSync(isolatedCandidate)
      ? {
          status: "COMPARISON_ONLY_NOT_ADOPTED",
          path: isolatedCandidate,
          sha256: fileSha256(isolatedCandidate),
          copyIntoProductionAllowed: false,
          adoptionRequiresExplicitUserVisualApproval: true,
        }
      : {status: "UNAVAILABLE", path: isolatedCandidate, sha256: null, copyIntoProductionAllowed: false},
    boundaries: {imageGenerationPerformed: false, productionPixelsCopied: false, motionPerformed: false, resolveMutationPerformed: false, finalRenderPerformed: false},
    createdAt: now,
  };
  return {...body, supersessionManifestSha256: sha256(body)};
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production?.generation?.summary?.queued !== 0 || current.production?.generation?.summary?.running !== 0 || current.production?.generation?.automaticDispatchAllowed !== false) throw new Error("article-asset-authority-requires-frozen-empty-generation-queue");

  const tasteCompilation = compileCurrentStoryboardTasteBriefs(current, {appRoot, now});
  const directionEnvelope = tasteCompilation.directionEnvelope;
  const backgroundPack = buildBackgroundLaneRequestPack({workspace: current, appRoot, now});
  const supersessionManifest = buildSupersessionManifest(current, directionEnvelope);
  const articleAssetAuthority = buildArticleAssetProductionAuthority({
    workspace: current,
    requestPack: backgroundPack.requestPack,
    styleDna: backgroundPack.styleDna,
    visualDirectionEnvelope: directionEnvelope,
    supersessionManifest,
    now,
  });

  const next = structuredClone(current);
  next.production.articleAssetProductionAuthority = articleAssetAuthority;
  next.production.articleAssetLegacyDisposition = supersessionManifest;
  if (next.production.staticPackageReview?.current === true) next.production.staticPackageReview = {...next.production.staticPackageReview, current: false, status: "HISTORY_READ_ONLY", authorityScope: "HISTORY_READ_ONLY", userVisualApproval: "NOT_APPROVED"};
  if (next.production.objectiveVisualGate?.current === true) next.production.objectiveVisualGate = {...next.production.objectiveVisualGate, current: false, status: "HISTORY_READ_ONLY", userVisualApproval: "NOT_APPROVED"};
  if (next.production.shotIntelligence?.threeShotLayerCanary) next.production.shotIntelligence.threeShotLayerCanary = {...next.production.shotIntelligence.threeShotLayerCanary, current: false, authorityScope: "HISTORY_READ_ONLY"};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";

  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (firstPass.production.articlePackagingKit?.gates?.userVisualApproval === "APPROVED" || firstPass.production.articlePackagingKit?.review?.reviewedBy === "system-visual-critic") throw new Error("article-packaging-kit-system-review-not-demoted");
  const event = createProductionEvent({
    workspace: current,
    action: "article-asset-production-authority-adopted",
    targetId: backgroundPack.requestPack.requestPackSha256,
    payload: {
      authoritySha256: articleAssetAuthority.authoritySha256,
      styleDnaSha256: backgroundPack.styleDna.styleDnaSha256,
      requestPackSha256: backgroundPack.requestPack.requestPackSha256,
      requestedBackgroundCount: 2,
      imageGenerationPerformed: false,
      userVisualApproval: "NOT_APPROVED",
    },
    now,
  });
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const reportBody = {
    contract: "A1ArticleAssetProductionAuthorityTransitionReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    authoritySha256: articleAssetAuthority.authoritySha256,
    styleDnaSha256: backgroundPack.styleDna.styleDnaSha256,
    styleAuditSha256: backgroundPack.styleAudit.auditSha256,
    requestPackSha256: backgroundPack.requestPack.requestPackSha256,
    visualDirectionEnvelopeSha256: directionEnvelope.directionEnvelopeSha256,
    supersessionManifestSha256: supersessionManifest.supersessionManifestSha256,
    currentStage: recalculated.production.authority.currentStage,
    nextAction: recalculated.production.authority.nextAction.id,
    articlePackagingKitUserVisualApproval: recalculated.production.articlePackagingKit?.gates?.userVisualApproval || null,
    imageGenerationPerformed: false,
    productionPixelsCopied: false,
    queue: {queued: recalculated.production.generation.summary.queued, running: recalculated.production.generation.summary.running, workerStatus: recalculated.production.generation.workerStatus},
    createdAt: now,
  };
  const report = {...reportBody, reportSha256: sha256(reportBody)};
  const styleBriefSet = {
    contract: "A1BackgroundLaneStyleBriefSet/v1",
    status: "PASS",
    styleDnaSha256: backgroundPack.styleDna.styleDnaSha256,
    briefCount: backgroundPack.styleBriefs.length,
    briefs: backgroundPack.styleBriefs,
    styleAuditSha256: backgroundPack.styleAudit.auditSha256,
    createdAt: now,
  };
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `article-asset-production-authority-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "article-asset-background-lane-v1/style-dna.json": backgroundPack.styleDna,
      "article-asset-background-lane-v1/style-briefs.json": styleBriefSet,
      "article-asset-background-lane-v1/style-audit.json": backgroundPack.styleAudit,
      "article-asset-background-lane-v1/request-pack.json": backgroundPack.requestPack,
      "article-asset-background-lane-v1/supersession-history-only.json": supersessionManifest,
      "article-asset-background-lane-v1/transition-report.json": report,
    },
    systemFiles: {
      "current-storyboard-production-v1/storyboard-interop-v1/visual-direction-envelope.json": directionEnvelope,
    },
  });
  return {report, persisted};
});

console.log(JSON.stringify({
  status: result.report.status,
  currentStage: result.report.currentStage,
  nextAction: result.report.nextAction,
  requestPackSha256: result.report.requestPackSha256,
  styleDnaSha256: result.report.styleDnaSha256,
  visualDirectionEnvelopeSha256: result.report.visualDirectionEnvelopeSha256,
  workspaceSha256: result.persisted.workspaceSha256,
  transitionSha256: result.persisted.transitionSha256,
  reportPath: rel(path.join(systemArtifactRoot, "editorial-asset-workbench-v1/article-asset-background-lane-v1/transition-report.json")),
  imageGenerationPerformed: false,
}, null, 2));
