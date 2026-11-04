#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildProjectVisualBiblePack} from "../apps/studio-next/src/lib/a1-project-visual-bible-v1.mjs";
import {admitProjectGeneratedOutputsByManifest, assertProjectSourceImportTarget, buildProjectAssetWorkspace} from "../apps/studio-next/src/lib/a1-project-asset-workspace-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = JSON.parse(fs.readFileSync(path.join(root, "work/system-full-route-probe-v1/product-tutorial-director-run-typed-contract-success.json"), "utf8"));
assert.equal(run.result?.status, "completed");
const plan = structuredClone(run.result.plan);

// Duties are attached to actual material IDs from a full-source director run.
// The expectation comes from the source/overlay/capture role, never a regex on
// the material ID or the article topic. Legacy requiredMaterialIds stay intact.
const dutyByMaterialId = {
  "ch01-backup-records-capture": "screen-capture",
  "ch01-backup-records-source": "verified-source",
  "ch01-backup-records-provenance": "provenance-record",
  "ch01-question-presenter": "presenter-footage",
  "ch01-question-editable-type": "editable-type",
  "ch01-thesis-editable-type": "editable-type",
  "chapter02-preparation-presenter": "presenter-footage",
  "chapter02-preparation-editable-type": "editable-type",
  "chapter02-version-check-screen": "screen-capture",
  "chapter02-file-modification-reference": "verified-source",
  "chapter02-version-check-provenance": "provenance-record",
  "comparison-file-object-pack": "generated-visual",
  "comparison-relation-diagram": "deterministic-diagram",
  "comparison-editable-labels": "editable-type",
  "file-identity-provenance": "provenance-record",
  "small-file-restore-verification-capture": "screen-capture",
  "selected-version-verification-reference": "verified-source",
  "restore-verification-provenance": "provenance-record",
  "chapter04-presenter-comparison-take": "presenter-footage",
  "chapter04-backup-result-record": "verified-source",
  "chapter04-restore-result-record": "verified-source",
  "chapter04-result-provenance": "provenance-record",
  "chapter04-comparison-editable-type": "editable-type",
  "presenter-ch01-records-to-recovery-question": "presenter-footage",
  "verified-backup-page-created-records-still": "verified-source",
  "backup-page-records-provenance": "provenance-record",
  "presenter-ch01-verifiable-recovery-standard": "presenter-footage",
  "approved-ch01-standard-phrase-assets": "editable-type",
  "presenter-preparation-instruction-take": "presenter-footage",
  "approved-preparation-keyphrase-overlay": "editable-type",
  "real-backup-tool-open-file-version-check-capture": "screen-capture",
  "verified-example-file-identity": "provenance-record",
  "verified-example-file-modification-reference": "verified-source",
  "verified-version-record-provenance": "provenance-record",
  "approved-same-file-comparison-asset-pack": "generated-visual",
  "verified-example-file-version-identity-reference": "provenance-record",
  "approved-current-editorial-aesthetic-reference": "generated-visual",
  "real-screen-recording-small-file-restore-and-verification": "screen-capture",
  "verified-selected-version-content-and-timestamp-baseline": "verified-source",
  "presenter-results-comparison-and-choice-take": "presenter-footage",
  "verified-backup-record-for-continuity-file": "verified-source",
  "verified-restore-result-for-continuity-file": "verified-source",
  "result-pair-identity-and-provenance-binding": "provenance-record",
  "verified-scope-and-pending-items-review": "provenance-record",
};
for (const shot of plan.shots) {
  shot.materialRequirements = shot.requiredMaterialIds.map((id) => {
    assert.ok(dutyByMaterialId[id], `source-material-duty-unreviewed:${shot.shotId}:${id}`);
    return {id, duty: dutyByMaterialId[id]};
  });
}

// One content-neutral perturbation checks the diagram class independently of
// any wording in the source episode. It shares a real presenter-overlay shot.
const diagramShot = plan.shots.find((item) => item.shotId === "ED-03");
const diagramId = "review-only-diagram-duty-fixture";
diagramShot.requiredMaterialIds.push(diagramId);
diagramShot.materialRequirements.push({id: diagramId, duty: "deterministic-diagram"});
const assignments = plan.shots.flatMap((shot) => shot.materialRequirements.map(({id, duty}) => ({shotId: shot.shotId, id, duty})));
assert.ok(plan.shots.every((shot) => shot.requiredMaterialIds.length === shot.materialRequirements.length));
assert.ok(plan.shots.every((shot) => new Set(shot.materialRequirements.map((item) => item.id)).size === shot.requiredMaterialIds.length));

const pack = buildProjectVisualBiblePack({plan, compiledAt: "2026-09-26T00:00:00.000Z"});
const requirement = (id) => pack.assetRequirementGraph.requirements.find((item) => item.materialId === id);
const brief = (id) => pack.assetBriefs.items.find((item) => item.name === id);
const rows = assignments.map(({shotId, id, duty}) => ({shotId, id, duty, mappedDuty: requirement(id)?.duty || null, briefRoute: brief(id)?.route || null, briefStage: brief(id)?.stage || null}));
const expectedIds = [...new Set(assignments.map((item) => item.id))].sort();
const outputIds = pack.assetRequirementGraph.requirements.map((item) => item.materialId).sort();
assert.deepEqual(outputIds, expectedIds, "material-requirement-id-coverage-not-exact");

// First failure is the real bug: the explicit per-material role disappears in
// the requirement graph. Until retained, routing uses the shot's medium for
// every ID, turning editable type and evidence metadata into presenter video.
for (const row of rows) {
  assert.equal(row.mappedDuty, row.duty, `material-duty-lost:${row.shotId}:${row.id}`);
  if (row.duty === "presenter-footage") assert.equal(row.briefRoute, "real-presenter-source");
  if (row.duty === "screen-capture") assert.equal(row.briefRoute, "real-screen-source");
  if (["verified-source", "generated-visual", "editable-type", "deterministic-diagram", "provenance-record"].includes(row.duty)) {
    assert.notEqual(row.briefRoute, "real-presenter-source", `non-presenter-duty-routed-as-footage:${row.id}`);
    assert.notEqual(row.briefRoute, "real-screen-source", `non-screen-duty-routed-as-capture:${row.id}`);
  }
}
for (const shot of plan.shots) {
  const output = pack.shotBlueprints.find((item) => item.shotId === shot.shotId);
  assert.deepEqual(output?.materialRequirements, shot.materialRequirements, `shot-material-duty-not-preserved:${shot.shotId}`);
}
const workspace = buildProjectAssetWorkspace({pack, visualBibleReviewArtifactSha256: "a".repeat(64), createdAt: "2026-09-26T00:00:00.000Z"});
assert.equal(workspace.gates.sceneGraphCandidateGenerationAllowed, false);
let exactCopyMaterializationBlockers = 0;
for (const row of rows) {
  const asset = workspace.assets.find((item) => item.name === row.id);
  assert.equal(asset?.materialDuty, row.duty);
  assert.equal(asset?.binding.status, "missing");
  assert.equal(asset?.outputReview.status, "pending");
  if (row.duty === "editable-type") {
    assert.equal(asset?.materialization?.kind, "SCENE_GRAPH_EDITABLE_TEXT");
    const bindings = asset.materialization.payload.shotBindings;
    const copyIntegrity = bindings.every((binding) => binding.copyTexts.every((copy) => plan.shots.find((shot) => shot.shotId === binding.shotId).sourceText.includes(copy)));
    if (copyIntegrity) assert.ok(asset.materialization.blockers.includes("PROJECT_LOCAL_FONT_REVIEW_REQUIRED"));
    else {
      assert.ok(asset.materialization.blockers.includes("EDITABLE_COPY_NOT_EXACT_SOURCE_SUBSTRING"));
      exactCopyMaterializationBlockers += 1;
    }
  }
  if (row.duty === "deterministic-diagram") assert.ok(asset?.materialization?.blockers.includes("DIAGRAM_SPEC_REQUIRED"));
  if (row.duty === "provenance-record") assert.ok(asset?.materialization?.blockers.includes("PROVENANCE_EVIDENCE_IDS_REQUIRED"));
  if (row.duty === "screen-capture" && !(requirement(row.id).sourceEvidenceIds || []).length) assert.ok(asset?.materialization?.blockers.includes("VERIFIED_SCREEN_OPERATION_EVIDENCE_REQUIRED"));
}
assert.ok(exactCopyMaterializationBlockers > 0, "near-match visual copy must stay blocked until it is exact source text");
assert.equal(workspace.assets.filter((item) => item.stage === "source-materials" && item.requiredForShotComposition).length,
  rows.filter((item) => ["presenter-footage", "screen-capture", "verified-source"].includes(item.duty)).length);

const legacyPlan = structuredClone(run.result.plan);
for (const shot of legacyPlan.shots) delete shot.materialRequirements;
const legacyPack = buildProjectVisualBiblePack({plan: legacyPlan, compiledAt: "2026-09-26T00:00:00.000Z"});
assert.ok(legacyPack.assetRequirementGraph.requirements.every((item) => item.duty === "unclassified"));
assert.ok(legacyPack.assetBriefs.items.filter((item) => item.materialDuty === "unclassified").every((item) => item.route === "real-or-official-source-review"));

const conflict = structuredClone(plan);
const repeated = conflict.shots.find((shot) => shot.shotId !== "ED-03");
repeated.requiredMaterialIds.push(diagramId);
repeated.materialRequirements.push({id: diagramId, duty: "verified-source"});
assert.throws(() => buildProjectVisualBiblePack({plan: conflict}), /material-duty-conflict/u);
const incomplete = structuredClone(plan);
incomplete.shots[0].materialRequirements.pop();
assert.throws(() => buildProjectVisualBiblePack({plan: incomplete}), /material-duty-coverage/u);

const collision = structuredClone(plan);
collision.shots[0].requiredMaterialIds.push("source A", "source-A");
collision.shots[0].materialRequirements.push({id: "source A", duty: "editable-type"}, {id: "source-A", duty: "editable-type"});
const collisionPack = buildProjectVisualBiblePack({plan: collision});
const collisionIds = collisionPack.assetBriefs.items.filter((item) => ["source A", "source-A"].includes(item.name)).map((item) => item.id);
assert.equal(new Set(collisionIds).size, 2, "normalized-material-asset-id-collision");

const presenterAsset = workspace.assets.find((item) => item.materialDuty === "presenter-footage");
const screenAsset = workspace.assets.find((item) => item.materialDuty === "screen-capture");
const evidenceAsset = workspace.assets.find((item) => item.materialDuty === "verified-source");
assertProjectSourceImportTarget(presenterAsset, "presenter-footage", ".mp4");
assertProjectSourceImportTarget(screenAsset, "screen-recording", ".mov");
assertProjectSourceImportTarget(evidenceAsset, "article-screenshot", ".png");
assert.throws(() => assertProjectSourceImportTarget(presenterAsset, "presenter-footage", ".jpg"), /presenter-video-required/u);
assert.throws(() => assertProjectSourceImportTarget(screenAsset, "article-screenshot", ".png"), /screen-video-required/u);
assert.throws(() => assertProjectSourceImportTarget(evidenceAsset, "audio", ".mp3"), /evidence-file-required/u);
assert.throws(() => assertProjectSourceImportTarget(workspace.assets.find((item) => item.materialDuty === "editable-type"), "presenter-footage", ".mp4"), /target-asset-invalid/u);

const imported = structuredClone(presenterAsset);
imported.binding = {status: "bound", sourceType: "user-owned-presenter-footage"};
const generated = structuredClone(workspace.assets.find((item) => item.generationAllowed));
generated.binding = {status: "bound", sourceType: "codex-subscription-generated"};
const admitted = admitProjectGeneratedOutputsByManifest([imported, generated], "2026-09-26T00:00:00.000Z");
assert.equal(admitted[0].outputReview.status, "pending", "user-source-must-not-auto-approve");
assert.equal(admitted[1].outputReview.status, "approved");
const materializationStatuses = Object.fromEntries([...new Set(workspace.materializationPlan.records.map((item) => item.duty))].map((duty) => [duty, workspace.materializationPlan.records.filter((item) => item.duty === duty).reduce((counts, item) => ({...counts, [item.status]: (counts[item.status] || 0) + 1}), {})]));
const report = {contract: "A1ProjectMaterialDutyRoutingBaseline/v1", status: "PASS", directorStatus: run.result.status, assignmentCount: rows.length,
  dutyCounts: Object.fromEntries([...new Set(rows.map((item) => item.duty))].map((duty) => [duty, rows.filter((item) => item.duty === duty).length])),
  materializationStatuses, exactCopyMaterializationBlockers, productionAdmission: false};
const reportPath = path.join(root, "work/project-asset-materialization-v1/duty-routing-baseline.json");
fs.mkdirSync(path.dirname(reportPath), {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
