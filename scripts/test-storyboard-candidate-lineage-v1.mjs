import assert from "node:assert/strict";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  assertStoryboardCandidateLineage,
  buildStoryboardActualPixelTasteReviewInput,
  buildStoryboardCandidateLineage,
} from "../apps/studio-next/src/lib/a1-storyboard-candidate-lineage-v1.mjs";
import {assertActualPixelTasteReviewInput} from "../apps/studio-next/src/lib/a1-pinterest-taste-profile-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const artifactSha256 = "f".repeat(64);
const options = {shotId: "ED-10", artifactSha256, artifactPublicUrl: "/candidate/ed-10.png", candidateId: "ed-10-taste-canary", createdAt: "2026-08-12T12:30:00.000Z"};
const lineage = assertStoryboardCandidateLineage(buildStoryboardCandidateLineage(workspace, options), workspace);
assert.equal(lineage.gate.productionAdmitted, false);
assert.equal(lineage.gate.machinePassCannotApprove, true);
assert.equal(lineage.typographyPolicy.generatedFormalTextAllowed, false);

const {review} = buildStoryboardActualPixelTasteReviewInput(workspace, options);
assert.equal(review.humanVerdict, "READY_FOR_REVIEW");
assert.equal(review.machineApproval, false);
assert.equal(review.candidateLineageSha256, lineage.lineageSha256);
assertActualPixelTasteReviewInput(review);

const machineForged = structuredClone(review);
machineForged.machineApproval = true;
assert.throws(() => assertActualPixelTasteReviewInput(machineForged), /machine-approval/u);

const approvedWithoutHuman = structuredClone(review);
approvedWithoutHuman.humanVerdict = "VISUAL_APPROVED";
assert.throws(() => assertActualPixelTasteReviewInput(approvedWithoutHuman), /human-reviewer-required/u);

const staleWorkspace = structuredClone(workspace);
staleWorkspace.production.storyboardProductionProjection.storyboardRevisionSha256 = "a".repeat(64);
assert.throws(() => assertStoryboardCandidateLineage(lineage, staleWorkspace), /stale-plan|projection-sha|storyboard-revision/u);

assert.throws(() => buildStoryboardCandidateLineage(workspace, {...options, shotId: "ED-01"}), /no-package/u);

console.log(JSON.stringify({status: "PASS", contract: lineage.contract, shotId: lineage.shotId, lineageSha256: lineage.lineageSha256, reviewInputSha256: review.reviewInputSha256, productionAdmitted: lineage.gate.productionAdmitted, machineApproval: review.machineApproval}, null, 2));
