import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertTasteBoundBoundedCanaryPlan} from "../apps/studio-next/src/lib/a1-taste-bound-bounded-canary-plan-v1.mjs";
import {assertTasteBoundImagegenRequestPack, buildTasteBoundImagegenRequestPack} from "../apps/studio-next/src/lib/a1-taste-bound-imagegen-request-pack-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const workspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const planPath = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/taste-bound-bounded-canary-plan.json");
const workspaceBefore = fs.readFileSync(workspacePath);
const workspace = readProjectWorkspace(appRoot);
const plan = assertTasteBoundBoundedCanaryPlan(JSON.parse(fs.readFileSync(planPath, "utf8")));
const first = assertTasteBoundImagegenRequestPack(buildTasteBoundImagegenRequestPack(workspace, plan, {appRoot, now: "2026-08-12T16:00:00.000Z"}));
const second = assertTasteBoundImagegenRequestPack(buildTasteBoundImagegenRequestPack(workspace, plan, {appRoot, now: "2026-08-13T04:00:00.000Z"}));

assert.equal(first.packSha256, second.packSha256);
assert.deepEqual(first.requests.map((request) => request.shotId), ["ED-10", "ED-13", "ED-31"]);
assert(first.requests.every((request) => request.execution.dispatchAllowed === false && request.execution.candidateBudget === 1));
assert(first.requests.every((request) => request.typography.generatedFormalTextAllowed === false && request.typography.nodes.every((node) => node.proofMethod === "FONTKIT_DIRECT_GLYPH_OUTLINES")));
assert.deepEqual(first.requests.map((request) => [request.shotId, request.tasteBudget.densityProfile, request.tasteBudget.maxSupportingFamilies]), [["ED-10", "poster-dense", 2], ["ED-13", "editorial-collision", 2], ["ED-31", "quiet-iconic", 1]]);
assert(first.requests.every((request) => request.actualPixelReviewTemplate.approvalBoundary.machineApprovalAllowed === false && request.actualPixelReviewTemplate.approvalBoundary.productionAdmissionAllowed === false));
assert.equal(first.requests.find((request) => request.shotId === "ED-13").actualPixelReviewTemplate.temporalGate.canonicalDeclaredDurationMs, 1300);
assert.equal(first.requests.find((request) => request.shotId === "ED-13").actualPixelReviewTemplate.temporalGate.effectivePlannedDurationMs, 4929);
assert(first.requests.find((request) => request.shotId === "ED-13").actualPixelReviewTemplate.temporalGate.minimumReadableDurationMs > 4900);
assert.equal(first.requests.find((request) => request.shotId === "ED-31").attachments.length, 5);
assert.match(first.requests.find((request) => request.shotId === "ED-31").toolCall.arguments.prompt, /must not appear in the output/u);
assert(first.requests.every((request) => /Density budget:/u.test(request.toolCall.arguments.prompt)));
assert.deepEqual(fs.readFileSync(workspacePath), workspaceBefore);

const stalePlan = structuredClone(plan);
stalePlan.source.workspaceSha256 = "a".repeat(64);
assert.throws(() => buildTasteBoundImagegenRequestPack(workspace, stalePlan, {appRoot}), /plan-sha|stale-plan/u);

const forged = structuredClone(first);
forged.requests[0].execution.dispatchAllowed = true;
assert.throws(() => assertTasteBoundImagegenRequestPack(forged), /pack-sha|request-sha|execution/u);

console.log(JSON.stringify({status: "PASS", contract: first.contract, packSha256: first.packSha256, requestCount: first.requests.length, attachmentFileCount: first.preflight.attachmentFileCount, formalCopyRunCount: first.preflight.formalCopyRunCount, ed13TemporalPlanStatus: first.preflight.ed13TemporalPlanStatus, imageGenerationPerformed: first.preflight.imageGenerationPerformed, workspaceMutationPerformed: first.preflight.workspaceMutationPerformed}, null, 2));
