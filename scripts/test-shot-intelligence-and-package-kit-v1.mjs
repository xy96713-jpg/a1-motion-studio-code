#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  assertShotIntelligenceDecisionSet,
  deriveShotIntelligenceDecision,
  buildShotIntelligenceDecisionSet,
  alignShotIntelligenceDecisionSetWithCoveragePlan,
} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {assertShotResearchPacket} from "../apps/studio-next/src/lib/a1-shot-research-packet-v1.mjs";
import {assertPackageAssetKitPlan} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";

const root = process.cwd();
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const runtime = workspace.production.shotIntelligence;
assert.equal(runtime.contract, "A1ShotIntelligenceRuntime/v1");
assert.equal(runtime.decisionSet.items.length, workspace.article.shotCount, "all semantic beats must be classified");
assertShotIntelligenceDecisionSet(runtime.decisionSet);
assert.equal(runtime.decisionSet.summary.shotCount, 34);
assert.ok(runtime.decisionSet.summary.networkRequiredCount > 0);
assert.ok(runtime.decisionSet.summary.networkHelpfulCount > 0);
assert.ok(runtime.decisionSet.summary.networkSkipCount > 0);
// Independence is a classifier invariant, not a requirement that this
// article happen to contain a REQUIRED beat routed to NO_PACKAGE. The current
// article's two REQUIRED beats both need source-bound packaging; exercise the
// independent branch below with a bounded fixture instead of forcing the live
// semantic board into a stale cardinality assumption.
assert.ok(runtime.decisionSet.items.some((item) => item.networkDecision === "REQUIRED"), "current article must retain REQUIRED network beats");
assert.ok(runtime.decisionSet.items.some((item) => item.networkDecision === "HELPFUL" && item.packageDecision === "PACKAGE"), "package may remain helpful/skipped on network axis");
const packageIds = new Set(runtime.decisionSet.items.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId));
assert.ok(runtime.packageAssetKitPlans.length <= packageIds.size, "pre-approval kit history must not exceed current package beats");
assert.ok(runtime.packageAssetKitPlans.every((plan) => packageIds.has(plan.shotId) && plan.status === "HISTORY_READ_ONLY" && plan.current === false), "pre-approval kits must remain read-only history");
assert.ok(runtime.packageAssemblyRecipes.every((recipe) => packageIds.has(recipe.shotId) && recipe.status === "VISUAL_REJECTED" && recipe.current === false), "pre-approval recipes must remain read-only history");
for (const plan of runtime.packageAssetKitPlans) assertPackageAssetKitPlan(plan);
for (const plan of runtime.packageAssetKitPlans) {
  for (const layer of plan.layers) {
    assert.ok(layer.cacheKeyInputs.existingAssetIds.every((id) => typeof id === "string" && id.length > 0), `${plan.shotId}/${layer.kind} cache IDs must be non-null strings`);
    assert.ok(layer.cacheKeyInputs.existingAssetIds.length <= 64, `${plan.shotId}/${layer.kind} cache IDs must stay bounded`);
  }
}
for (const packet of runtime.researchPackets) assertShotResearchPacket(packet);
assert.ok(runtime.researchPackets.some((packet) => packet.sources.length > 0), "bounded research trial must persist at least one source packet");
assert.ok(runtime.researchPackets.filter((packet) => packet.shotId !== "ED-14").every((packet) => packet.sources.every((source) => source.usageClass !== "PRODUCTION_ALLOWED")), "non-production research sources must not silently become production assets");
const groundedResearchSource = runtime.researchPackets.find((packet) => packet.shotId === "ED-14")?.sources?.[0];
assert.equal(groundedResearchSource?.usageClass, "PRODUCTION_ALLOWED", "the verified research packet must be explicitly production-allowed");
assert.ok(groundedResearchSource?.referenceArtifact?.sha256 && groundedResearchSource?.groundedClaim, "the production-allowed research source must carry artifact provenance and a grounded claim");
assert.equal(runtime.trial.hallucinationOrFalseSourceClaimPresent, false, "fixture must not invent hallucination claims absent from source");
assert.equal(runtime.queuePolicy.automaticDispatchAllowed, false);
assert.equal(runtime.queuePolicy.workerStatus, "frozen");
const currentPlanStatuses = new Set(["SEMANTIC_REVIEW_REQUIRED", "WHOLE_FILM_STATIC_BOARD_RECOMMENDED", "WHOLE_FILM_BOARD_RECOMMENDED"]);
assert.ok(runtime.packageLookMasterPlans.some((plan) => packageIds.has(plan.shotId) && currentPlanStatuses.has(plan.status)), "current PACKAGE beats must retain a phase-valid Look Master generation plan");
assert.equal(runtime.wholeFilmStaticBoard?.status, "PENDING_USER_APPROVAL", "live plans are currently held behind the whole-film board gate");
assert.equal(runtime.wholeFilmStaticBoard?.decision, null, "the live board must remain unapproved in this test");
assert.equal(runtime.packageAssetKitPlans.filter((plan) => plan.current === true).length, 0, "layer kits remain locked before whole-film static-board approval");
assert.ok(runtime.packageAssetKitPlans.every((plan) => plan.layers.every((layer) => layer.status !== "READY")), "layer plans remain PLAN_ONLY");

const unseen = deriveShotIntelligenceDecision({beatId: "UNSEEN-01", order: 1, semanticRole: "key-claim", sourceText: "研究显示不同作者的表达会逐渐趋同。", packagingType: "NO_PACKAGE", valueAdded: 0}, {sourceHash: "article"});
assert.equal(unseen.networkDecision, "REQUIRED", "new conclusion sentence must enter research evaluation without an ED keyword");
assert.equal(unseen.packageDecision, "NO_PACKAGE");
const independent = deriveShotIntelligenceDecision({beatId: "UNSEEN-02", order: 2, semanticRole: "supporting-explanation", sourceText: "研究显示某个过程存在差异。", packagingType: "NO_PACKAGE", valueAdded: 0}, {sourceHash: "article"});
assert.equal(independent.networkDecision, "REQUIRED");
assert.equal(independent.packageDecision, "NO_PACKAGE");
const packaged = deriveShotIntelligenceDecision({beatId: "UNSEEN-03", order: 3, semanticRole: "decisive-contrast", sourceText: "一句话本身需要被覆盖和判定。", packagingType: "TYPOGRAPHY_PACKAGE", valueAdded: 7, typeFit: 2}, {sourceHash: "article"});
assert.equal(packaged.packageDecision, "PACKAGE");
assert.equal(packaged.networkDecision, "SKIP");
assert.equal(deriveShotIntelligenceDecision({beatId: "OP-01", order: 4, semanticRole: "supporting-explanation", sourceText: "打开页面，输入全文并保存。", packagingType: "NO_PACKAGE"}, {sourceHash: "article"}).networkDecision, "SKIP");
assert.equal(deriveShotIntelligenceDecision({beatId: "STYLE-01", order: 5, semanticRole: "supporting-explanation", sourceText: "AI 常常不说人话。", packagingType: "NO_PACKAGE"}, {sourceHash: "article"}).networkDecision, "HELPFUL");
assert.ok(new Set(runtime.decisionSet.items.filter((item) => item.networkDecision === "HELPFUL").flatMap((item) => item.searchQueries)).size > 1, "HELPFUL queries must be beat-specific rather than one repeated waterfall");
const modeProjection = runtime.decisionSet.items.find((item) => item.shotId === "ED-33");
assert.ok(modeProjection?.assemblyMode && modeProjection.assemblyMode === modeProjection.presentationMode, "mode projection must be internally consistent");
assert.ok(modeProjection?.assemblyModeReason && modeProjection?.whyThisModeBeatsOtherModes);
const set = buildShotIntelligenceDecisionSet({beats: [independent, packaged], sourceHash: "article", projectId: "fixture"});
assertShotIntelligenceDecisionSet(set);

// A screen-owned beat may still carry a stale typography recall in its
// sequence projection.  The carrier alignment must collapse both projections
// to one NO_PACKAGE evidence decision; family recall cannot remain hidden.
const alignedLive = alignShotIntelligenceDecisionSetWithCoveragePlan(runtime.decisionSet, workspace.production.shotVisualCoveragePlan);
const ed23 = alignedLive.items.find((item) => item.shotId === "ED-23");
assert.equal(ed23?.packageDecision, "NO_PACKAGE");
assert.equal(ed23?.sequenceReview?.finalPackageDecision, "NO_PACKAGE");
assert.equal(ed23?.sequenceReview?.finalPackageMode, null);
assert.equal(ed23?.typographyActor, false);
assert.equal(ed23?.typographyTreatment, "NONE");

console.log(JSON.stringify({status: "PASS", contract: "A1ShotIntelligenceDecision/v1", shotCount: runtime.decisionSet.items.length, packageCount: runtime.packageAssetKitPlans.length, researchPacketCount: runtime.researchPackets.length, boundedSourcePackets: runtime.researchPackets.filter((packet) => packet.sources.length).length, unseenSentence: {network: unseen.networkDecision, package: unseen.packageDecision}, independentAxis: {network: independent.networkDecision, package: independent.packageDecision}, generatedAssets: runtime.trial.generatedAssets}, null, 2));
