#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {screenCriticRequiresSourceRecapture, visualCriticMedianScore} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const failures = [];
const check = (id, pass, evidence) => {
  console.log(`${pass ? "PASS" : "FAIL"} ${id} :: ${evidence}`);
  if (!pass) failures.push(id);
};

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const article = workspace.production.articleAssetProductionAuthority;
const authority = workspace.production.authority;
const background = article?.lanes?.backgrounds;
const authorization = article?.authorization;

// Pure legacy helpers remain guarded even while the legacy production lane is
// advisory. These checks catch the original statistical and routing defects.
check("critic-even-sample-median-is-not-upper-biased", visualCriticMedianScore([20, 22]) === 21 && visualCriticMedianScore([22, 22]) === 22, `${visualCriticMedianScore([20, 22])}/${visualCriticMedianScore([22, 22])}`);
check("screen-causal-hard-failure-becomes-source-recapture-not-layout-loop", screenCriticRequiresSourceRecapture({editMode: "screen-demo"}, {hardFailures: ["screen-action-not-causal"]}) && !screenCriticRequiresSourceRecapture({editMode: "type-only"}, {hardFailures: ["screen-action-not-causal"]}), "screen=true/type-only=false");

check("article-asset-authority-is-current", article?.contract === "A1ArticleAssetProductionAuthority/v1" && article.current === true, `${article?.contract}/${article?.current}`);
check("workspace-status-follows-current-article-authority", workspace.status === article?.status && workspace.status === "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW", `${workspace.status}/${article?.status}`);
check("six-asset-lanes-remain-explicit", JSON.stringify(article?.laneOrder) === JSON.stringify(["sourceResearch", "backgrounds", "typographyTemplates", "elements", "illustrations", "layouts"]), article?.laneOrder?.join(","));
check("background-library-is-open-ended-not-falsely-complete", background?.status === "OPEN_LIBRARY_WAVE_READY_FOR_USER_REVIEW" && background.laneComplete === false && background.countPolicy === "OPEN_ENDED_SEMANTIC_RHYTHM_LIBRARY" && background.maximumCount === null && background.approvedUsableCount > 0 && background.floorGap > 0, `${background?.approvedUsableCount}/${background?.minimumCoverageFloor}/${background?.floorGap}`);
check("next-action-single-authority-mirror", authority?.contract === "A1ProductionAuthority/v1" && authority.nextAction?.id === authorization?.nextAction && workspace.production.nextAction === authorization?.nextAction && authority.currentStage === "article-asset-background-wave-actual-pixel-review", `${authority?.currentStage}/${authority?.nextAction?.id}`);
check("background-request-binding-is-consistent", authorization?.requestPackSha256 === background?.requestPackSha256 && authorization?.batchPlanSha256 === background?.nextBatchPlanSha256, `${authorization?.requestPackSha256}/${authorization?.batchPlanSha256}`);
check("current-action-is-user-review-gated", authorization?.requiresUser === true && authorization?.exactRequestPackSha256Required === false && authorization?.nextAction === "REVIEW_DEFAULT_LIBRARY_BACKGROUND_WAVE" && article?.executionPolicy?.laneCompletionClaimAllowed === false && article?.executionPolicy?.maximumRepairRoundsPerCandidate === 1, `${authorization?.requiresUser}/${article?.executionPolicy?.laneCompletionClaimAllowed}/${article?.executionPolicy?.maximumRepairRoundsPerCandidate}`);
check("visual-approval-remains-not-approved", authorization?.userVisualApproval === "NOT_APPROVED" && authorization?.backgroundLibraryApproval === "PARTIAL_APPROVED_2_USABLE", `${authorization?.userVisualApproval}/${authorization?.backgroundLibraryApproval}`);

const generation = workspace.production.generation;
check("shared-generation-queue-remains-frozen", generation.automaticDispatchAllowed === false && generation.workerStatus === "frozen" && generation.summary.queued === 0 && generation.summary.running === 0, `${generation.workerStatus}/${generation.summary.queued}/${generation.summary.running}`);
check("article-boundary-blocks-production-expansion", article?.boundaries?.imageGenerationDispatched === true && article.boundaries.motionAllowed === false && article.boundaries.resolveAllowed === false && article.boundaries.finalRenderAllowed === false && article.boundaries.wholeFilmExpansionAllowed === false && article.boundaries.productionAdmitted === false, JSON.stringify(article?.boundaries));
check("downstream-gates-remain-locked", workspace.gates.acceptedShotIrAllowed === false && workspace.gates.motionPrototypeAllowed === false && workspace.gates.finalRenderAllowed === false && workspace.production.motion.fullMotionAllowed === false && !["ready", "approved", "complete"].includes(workspace.production.release.final1080p.status), `${workspace.production.acceptedShotIr.status}/${workspace.production.motion.fullMotionAllowed}/${workspace.production.release.final1080p.status}`);
check("legacy-loop-is-advisory-mirror", workspace.production.maturityLoop.legacyAdvisoryOnly === true && workspace.production.maturityLoop.authorityMirrorSha256 === authority.sha256 && workspace.production.maturityLoop.nextAction === authorization?.nextAction, `${workspace.production.maturityLoop.legacyAdvisoryOnly}/${workspace.production.maturityLoop.nextAction}`);

const drifted = structuredClone(workspace);
drifted.production.nextAction = "STALE_LEGACY_NEXT_ACTION";
drifted.production.maturityLoop.currentStage = "shot-candidates";
drifted.production.maturityLoop.nextAction = "STALE_LEGACY_LOOP";
const repaired = recalculateEditorialAssetWorkbench(drifted, "2026-08-13T10:00:00.000Z");
check("recalculation-repairs-stale-mirrors-without-changing-current-authority", repaired.production.nextAction === repaired.production.authority.nextAction.label && repaired.production.maturityLoop.nextAction === repaired.production.authority.nextAction.id && repaired.production.articleAssetProductionAuthority.current === true && repaired.status === article.status, `${repaired.status}/${repaired.production.authority.nextAction.id}`);

if (failures.length) {
  console.error(`production-authority-test-failed:${failures.join(",")}`);
  process.exit(1);
}
console.log("A1ArticleAssetProductionAuthority/v1 PASS");
