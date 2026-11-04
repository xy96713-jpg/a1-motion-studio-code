#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertApprovalOwnershipDecision, classifyApprovalOwnership} from "../apps/studio-next/src/lib/a1-approval-ownership-policy-v1.mjs";
import {assertEditorialPackageMotionPlan, compileEditorialPackageMotionPlan} from "../apps/studio-next/src/lib/a1-editorial-package-motion-plan-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/editorial-shot-director-v1/candidate-v3/full-film-motion-plan-v1.json");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const authorizationDecision = assertApprovalOwnershipDecision(classifyApprovalOwnership("COMPILE_FULL_FILM_MOTION_PLAN"));
const phases = ["PRE", "ENTER", "PEAK", "HOLD", "EXIT", "POST"];
const sha = "a".repeat(64);
const routes = ["PRESENTER_CLEAN", "PRESENTER_LOCAL_MARKER", "SCREEN_FOCUS", "SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE", "TYPE_HIT", "RELATION_GRAPH", "DATA_COMPARE", "EDITORIAL_METAPHOR"];
const fixture = {
  contract: "A1EditorialShotDirectorStaticBoardCandidate/v3",
  actualPixelReview: "PASS",
  manifestSha256: sha,
  sourceWorkspaceSha256: sha,
  shots: routes.map((route, index) => ({
    shotId: `UNSEEN-${String(index + 1).padStart(2, "0")}`,
    order: index + 1,
    route,
    baseCarrier: route === "PRESENTER_CLEAN" || route === "PRESENTER_LOCAL_MARKER" ? "PRESENTER" : "INDEPENDENT",
    packageEvent: route === "PRESENTER_CLEAN" ? null : {phases, sourcePixelsMustRemainBound: ["SCREEN_FOCUS", "SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE"].includes(route)},
    presenterMarker: route === "PRESENTER_LOCAL_MARKER" ? {grammar: "QUESTION_ECHO"} : null,
    screenAction: route === "SCREEN_FOCUS" ? {grammar: "EDIT_REPLACE", evidenceCoverage: "COMPLETE", beforeInsetAllowed: false} : null,
    preview: route === "SCREEN_FOCUS" ? {sourcePixelsPreserved: true, syntheticCursorAdded: false, sha256: sha} : {sha256: sha},
  })),
};
const holdout = assertEditorialPackageMotionPlan(compileEditorialPackageMotionPlan({staticCandidate: fixture, validatedPresenterGrammars: ["QUESTION_ECHO"], authorizationDecision}));
assert(holdout.audit.shotCount === routes.length && holdout.audit.motionFamilyCount >= 9, "editorial-motion-plan-holdout-diversity-invalid");
assert(holdout.shots.find((shot) => shot.route === "PRESENTER_CLEAN").stateModel.join(",") === "CLEAN", "editorial-motion-plan-clean-reset-invalid");
assert(holdout.shots.find((shot) => shot.route === "SCREEN_FOCUS").primitives.includes("RESULT_TEXT_HOLD"), "editorial-motion-plan-screen-grammar-invalid");
assert(holdout.shots.filter((shot) => ["SOURCE_WINDOW", "CROP_ANNOTATION", "SOURCE_COLLAGE"].includes(shot.route)).every((shot) => shot.sourcePixelsMustRemainBound), "editorial-motion-plan-source-route-invalid");

const badFixture = structuredClone(fixture);
badFixture.shots.find((shot) => shot.route === "SCREEN_FOCUS").preview.syntheticCursorAdded = true;
const blocked = compileEditorialPackageMotionPlan({staticCandidate: badFixture, validatedPresenterGrammars: ["QUESTION_ECHO"], authorizationDecision});
assert(blocked.status === "BLOCKED" && blocked.audit.failures.some((failure) => failure.includes("SCREEN_SOURCE_INTEGRITY_INVALID")), "editorial-motion-plan-unsafe-screen-not-blocked");

const current = JSON.parse(fs.readFileSync(outputFile, "utf8"));
const {planSha256, ...body} = current;
assert(planSha256 === crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex"), "editorial-motion-plan-current-sha-invalid");
assert(current.status === "REVIEW_ONLY_FULL_FILM_MOTION_PLAN_COMPILED" && current.audit.shotCount === 34 && current.audit.cleanResetCount === 6, "editorial-motion-plan-current-coverage-invalid");
assert(current.audit.partialEvidenceShotIds.join(",") === "ED-20", "editorial-motion-plan-ed20-limitation-lost");
assert(current.shots.find((shot) => shot.shotId === "ED-14")?.route === "SOURCE_WINDOW" && current.shots.find((shot) => shot.shotId === "ED-14")?.sourcePixelsMustRemainBound === true, "editorial-motion-plan-ed14-route-invalid");
assert(current.shots.filter((shot) => shot.route === "PRESENTER_LOCAL_MARKER").every((shot) => shot.proofStatus === "REPRESENTATIVE_MOTION_PROOF_PASS"), "editorial-motion-plan-presenter-proof-not-bound");
process.stdout.write(`${JSON.stringify({status: "PASS", holdoutShotCount: holdout.audit.shotCount, holdoutMotionFamilyCount: holdout.audit.motionFamilyCount, unsafeScreenBlocked: true, currentShotCount: current.audit.shotCount, currentMotionFamilyCount: current.audit.motionFamilyCount, partialEvidenceShotIds: current.audit.partialEvidenceShotIds, userVisualApproval: current.globalPolicy.userVisualApproval, productionAdmission: current.globalPolicy.productionAdmission}, null, 2)}\n`);
