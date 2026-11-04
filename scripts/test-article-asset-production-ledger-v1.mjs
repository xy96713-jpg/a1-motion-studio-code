#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildArticleAssetProductionLedger} from "../apps/studio-next/src/lib/a1-article-asset-production-ledger-v1.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const ledger = buildArticleAssetProductionLedger(workspace);

assert.equal(ledger.contract, "A1ArticleAssetProductionLedger/v1");
assert.equal(ledger.summary.laneCount, 6);
assert.equal(Object.keys(ledger.lanes).length, 6);
assert.equal(ledger.policy.perShotFullSceneGenerationAllowed, false);
assert.equal(ledger.policy.generatedFormalTextAllowed, false);
assert.equal(ledger.policy.typography, "RENDERER_BOUND_EDITABLE_TEXT_ONLY");
assert.equal(ledger.policy.sourceResearch, "SEARCH_VERIFY_AND_BIND_NEVER_GENERATE_FACTS");
assert.ok(ledger.summary.sourceAssetCount > 0, "real-source inventory must be visible");
assert.ok(ledger.summary.networkSourceCount > 0, "network-source inventory must be visible");
assert.ok(ledger.summary.backgroundAssetCount > 0, "background inventory must be visible");
assert.equal(ledger.pixelReview.backgroundCandidates.length, ledger.summary.backgroundAssetCount, "every background candidate must be available for actual-pixel review");
assert.ok(ledger.pixelReview.backgroundCandidates.every((candidate) => candidate.publicUrl && candidate.sha256 && candidate.textFree === true), "background pixel review must use real textless files");
assert.ok(ledger.pixelReview.backgroundCandidates.every((candidate) => candidate.currentDirectionApproved === true), "user-approved background-library assets must remain visibly approved");
assert.equal(ledger.summary.backgroundLibraryOpenEnded, true, "background library must remain open ended");
assert.ok(ledger.summary.backgroundCoverageFloor > ledger.summary.backgroundAssetCount, "coverage floor must expose the current variety gap");
assert.equal(ledger.lanes.backgrounds.maximumCount, null, "coverage floor must not become a production cap");
assert.equal(ledger.lanes.backgrounds.countSemantics, "COVERAGE_FLOOR_NOT_CAP");
assert.equal(ledger.lanes.backgrounds.status, "expansion-active");
assert.ok(ledger.summary.elementAssetCount > 0, "element inventory must be visible");
assert.ok(ledger.summary.typographyTemplateFamilyCount > 0, "typography template demand must be derived from the article");
assert.equal(ledger.lanes.typographyTemplates.currentReadyCount, 0, "fonts and glyph boards must not masquerade as editable templates");
assert.ok(ledger.summary.illustrationSlotCount > 0, "full-screen illustration demand must be derived from explainer shots");
assert.equal(ledger.lanes.illustrations.currentReadyCount, 0, "missing current illustrations must remain visible");
assert.equal(ledger.summary.packageLayoutCount, workspace.production.storyboardProductionProjection.counts.package);
assert.ok(ledger.summary.currentCompatibleLayoutCount < ledger.summary.packageLayoutCount, "person-bound or legacy layouts must not count as current");
assert.ok(ledger.summary.personDependentShotIds.length > 0, "current person-dependent layout debt must be explicit");
assert.equal(ledger.policy.motionAllowed, false);
assert.equal(ledger.policy.resolveAllowed, false);
assert.equal(ledger.policy.finalRenderAllowed, false);

console.log(JSON.stringify({
  status: "PASS",
  contract: ledger.contract,
  lanes: Object.fromEntries(Object.entries(ledger.lanes).map(([id, lane]) => [id, {needed: lane.neededCount, available: lane.availableCount, currentReady: lane.currentReadyCount, missing: lane.missingCount, status: lane.status}])),
  summary: ledger.summary,
  blockers: ledger.blockers,
}, null, 2));
