#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {buildCandidateRecommendationAuditAuthority, hashCandidateAuditMigration} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const runtime = workspace.production.shotIntelligence;
const raw = runtime.lookMasterRawReferences.find((item) => item.current !== false
  && item.recommendationEligible === true
  && item.semanticPixelAudit?.status === "PASS"
  && item.artifact?.sha256);
const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === raw?.shotId);
const decision = runtime.decisionSet.items.find((item) => item.shotId === raw?.shotId);
assert.ok(plan && decision && raw);

const direct = buildCandidateRecommendationAuditAuthority({rawReference: raw, plan, decision, now: "2026-08-06T00:00:00.000Z"});
assert.equal(direct.status, "PASS");
assert.ok(["DIRECT_CURRENT_AUDIT", "IMMUTABLE_AUDIT_MIGRATION"].includes(direct.bindingMode));

const reviewRequired = structuredClone(raw);
reviewRequired.pixelAudit.status = "REVIEW_REQUIRED";
reviewRequired.pixelAudit.admissionAllowed = false;
assert.equal(buildCandidateRecommendationAuditAuthority({rawReference: reviewRequired, plan, decision}).status, "FAIL");

const footageFail = structuredClone(raw);
footageFail.pixelAudit.footageCompatibility.status = "FAIL";
assert.equal(buildCandidateRecommendationAuditAuthority({rawReference: footageFail, plan, decision}).status, "FAIL");

const targetPlan = {...structuredClone(plan), planSha256: "a".repeat(64)};
const migrated = structuredClone(raw);
migrated.planSha256 = targetPlan.planSha256;
migrated.candidateAuditMigration = {
  contract: "A1CandidateAuditMigration/v1",
  status: "PASS",
  artifactSha256: migrated.artifact.sha256,
  sourcePlanSha256: migrated.pixelAudit.planSha256,
  sourcePixelAuditSha256: migrated.pixelAudit.auditSha256,
  sourceSemanticAuditSha256: migrated.semanticPixelAudit.auditSha256,
  sourceBriefSha256: migrated.semanticPixelAudit.briefSha256,
  targetPlanSha256: targetPlan.planSha256,
  targetBriefSha256: targetPlan.semanticDesignBriefSha256,
  targetDecisionHash: targetPlan.decisionHash,
  targetAssemblyMode: targetPlan.assemblyMode,
  targetPresentationMode: targetPlan.presentationMode,
  compatibility: {status: "PASS", checks: {artifactShaUnchanged: true, semanticMeaningUnchanged: true, presentationModeUnchanged: true}},
};
migrated.candidateAuditMigration.migrationSha256 = hashCandidateAuditMigration(migrated.candidateAuditMigration);
assert.equal(buildCandidateRecommendationAuditAuthority({rawReference: migrated, plan: targetPlan, decision}).status, "PASS");

const staleMigration = structuredClone(migrated);
staleMigration.candidateAuditMigration.targetPlanSha256 = "b".repeat(64);
assert.equal(buildCandidateRecommendationAuditAuthority({rawReference: staleMigration, plan: targetPlan, decision}).status, "FAIL");

console.log(JSON.stringify({contract: "A1CandidateRecommendationAuditAuthorityTest/v1", status: "PASS", checks: {directPass: true, reviewRequiredFails: true, footageFailFails: true, immutableMigrationPasses: true, staleMigrationFails: true}}, null, 2));
