#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildProjectMaterializationPlan, refreshProjectMaterializationPlan} from "../apps/studio-next/src/lib/a1-project-materialization-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fusionPixelSha256 = hash(fs.readFileSync(path.join(root, "remotion-renderer/public/a1-editorial-fonts/fusion-pixel.ttf")));
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json"), "utf8"));
const displayedCopy = new Map([
  ["holdout-evidence-water", "不能直接说明"],
  ["holdout-evidence-sleep", "不能直接证明"],
  ["holdout-tutorial-backup", "恢复失败"],
  ["holdout-tutorial-camera", "不能解决"],
  ["holdout-opinion-meeting", "开会更久"],
  ["holdout-opinion-reading", "理解得更深"],
]);
const shots = [];
const requirements = [];
const assets = [{id: "type-pixel-correction", name: "type-pixel-correction", route: "project-font", materialDuty: null,
  binding: {status: "bound", publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", sha256: fusionPixelSha256},
  outputReview: {status: "approved"}, output: {publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", sha256: fusionPixelSha256}}];
for (const article of fixtures.articles) {
  const shotId = `${article.id}-question`;
  const sourceText = article.shots[1];
  const copy = displayedCopy.get(article.id);
  assert.ok(sourceText.includes(copy), `fixture-copy-not-exact:${article.id}`);
  const materialId = `editable-copy-${article.id}`;
  const materialRequirement = {id: materialId, duty: "editable-type", exactCopy: copy};
  shots.push({shotId, sourceText, keyPhrases: [copy], materialRequirements: [materialRequirement]});
  requirements.push({materialId, duty: "editable-type", exactCopy: copy, sourceEvidenceIds: [], usedByShotIds: [shotId], materialSpecsByShot: [{shotId, exactCopy: copy, diagramSpec: null}]});
  assets.push({id: `asset-${materialId}`, name: materialId, materialDuty: "editable-type", usedByShotIds: [shotId], sourceEvidenceIds: [], binding: {status: "missing"}, outputReview: {status: "deferred-to-scene-graph"}, requiredForShotComposition: false});
}
const pack = {projectId: "materialization-fixture", source: {articleSha256: "a".repeat(64)}, sha256: "b".repeat(64),
  assetRequirementGraph: {contract: "A1ArticleAssetRequirementGraph/v1", requirements}, shotBlueprints: shots};
const plan = buildProjectMaterializationPlan({pack, assets, createdAt: "2026-09-27T00:00:00.000Z"});
assert.equal(plan.status, "READY_FOR_SCENE_GRAPH");
assert.equal(plan.records.length, 6);
assert.equal(new Set(plan.records.map((record) => record.usedByShotIds[0])).size, 6);
assert.equal(new Set(plan.records.map((record) => record.payload.shotBindings[0].copySha256s[0])).size, 6);
assert.ok(plan.records.every((record) => record.status === "READY_FOR_SCENE_GRAPH_BINDING"));
for (const record of plan.records) {
  assert.equal(record.payload.editable, true);
  assert.equal(record.payload.rasterRequired, false);
  assert.ok(record.payload.shotBindings[0].sourceTextSha256);
  assert.equal(record.payload.shotBindings[0].copyTexts.length, 1);
  assert.equal(record.payload.shotBindings[0].fontAssetId, "type-pixel-correction");
}
const cueBoundaryCopyPack = {projectId: "cue-boundary-copy-fixture", source: {articleSha256: "e".repeat(64)}, sha256: "f".repeat(64),
  assetRequirementGraph: {contract: "A1ArticleAssetRequirementGraph/v1", requirements: [{materialId: "wrapped-exact-copy", duty: "editable-type", sourceEvidenceIds: [], usedByShotIds: ["ED-CUE-01"], exactCopy: "回到原文，\n核对证据"}]},
  shotBlueprints: [{shotId: "ED-CUE-01", sourceText: "回到原文，核对证据", keyPhrases: [], materialRequirements: [{id: "wrapped-exact-copy", duty: "editable-type", exactCopy: "回到原文，\n核对证据"}]}]};
const cueBoundaryCopyPlan = buildProjectMaterializationPlan({pack: cueBoundaryCopyPack, assets});
assert.equal(cueBoundaryCopyPlan.records[0].status, "READY_FOR_SCENE_GRAPH_BINDING");
const fontPending = structuredClone(assets).map((asset) => asset.id === "type-pixel-correction" ? {...asset, outputReview: {status: "pending"}} : asset);
const blockedByFont = refreshProjectMaterializationPlan(plan, fontPending);
assert.equal(blockedByFont.status, "BLOCKED");
assert.ok(blockedByFont.records.filter((record) => record.duty === "editable-type").every((record) => record.blockers.includes("PROJECT_LOCAL_FONT_REVIEW_REQUIRED")));

const missingSources = structuredClone(pack);
missingSources.assetRequirementGraph.requirements.push({materialId: "missing-provenance", duty: "provenance-record", sourceEvidenceIds: [], usedByShotIds: [shots[0].shotId]});
missingSources.assetRequirementGraph.requirements.push({materialId: "missing-diagram", duty: "deterministic-diagram", sourceEvidenceIds: [], usedByShotIds: [shots[1].shotId]});
missingSources.shotBlueprints[0].materialRequirements.push({id: "missing-provenance", duty: "provenance-record"});
missingSources.shotBlueprints[1].materialRequirements.push({id: "missing-diagram", duty: "deterministic-diagram"});
const blocked = buildProjectMaterializationPlan({pack: missingSources, assets});
assert.equal(blocked.status, "BLOCKED");
assert.ok(blocked.records.find((record) => record.materialId === "missing-provenance").blockers.includes("PROVENANCE_EVIDENCE_IDS_REQUIRED"));
assert.ok(blocked.records.find((record) => record.materialId === "missing-diagram").blockers.includes("DIAGRAM_SPEC_REQUIRED"));

const diagramWithSpec = structuredClone(missingSources);
const diagramSpec = {contract: "A1DeterministicDiagramSpec/v1", kind: "comparison", nodes: [{id: "copy", label: "复制整个目录"}, {id: "restore", label: "恢复失败"}], edges: [{from: "copy", to: "restore", relation: "compares"}]};
diagramWithSpec.assetRequirementGraph.requirements.find((item) => item.materialId === "missing-diagram").usedByShotIds = [shots[2].shotId];
diagramWithSpec.assetRequirementGraph.requirements.find((item) => item.materialId === "missing-diagram").materialSpecsByShot = [{shotId: shots[2].shotId, exactCopy: null, diagramSpec}];
diagramWithSpec.shotBlueprints[1].materialRequirements = diagramWithSpec.shotBlueprints[1].materialRequirements.filter((item) => item.id !== "missing-diagram");
diagramWithSpec.shotBlueprints[2].materialRequirements.push({id: "missing-diagram", duty: "deterministic-diagram", diagramSpec});
const diagramRendererBlocked = buildProjectMaterializationPlan({pack: diagramWithSpec, assets});
const diagramBinding = diagramRendererBlocked.records.find((record) => record.materialId === "missing-diagram");
assert.equal(diagramBinding.status, "PENDING_DIAGRAM_OUTPUT_BINDING");
assert.deepEqual(diagramBinding.payload.visibleLabels, ["复制整个目录", "恢复失败"]);
assert.ok(diagramBinding.payload.svgMarkup.includes("data-diagram-node-id"));
assert.equal(diagramBinding.payload.fontSha256, fusionPixelSha256);
assert.match(diagramBinding.payload.svgSha256, /^[a-f0-9]{64}$/u);

const provenancePack = structuredClone(pack);
provenancePack.assetRequirementGraph.requirements.push({materialId: "proof-record", duty: "provenance-record", sourceEvidenceIds: ["verified-page"], usedByShotIds: [shots[0].shotId]});
provenancePack.shotBlueprints[0].materialRequirements.push({id: "proof-record", duty: "provenance-record", evidenceIds: ["verified-page"]});
const unapprovedSource = {id: "verified-page", name: "verified-page", materialDuty: "verified-source", binding: {status: "bound", sha256: "d".repeat(64), publicUrl: "/source/page.png"}, output: {publicUrl: "/source/page.png", sha256: "d".repeat(64)}, outputReview: {status: "pending"}};
const provenancePending = buildProjectMaterializationPlan({pack: provenancePack, assets: [...assets, unapprovedSource]});
assert.ok(provenancePending.records.find((record) => record.materialId === "proof-record").status === "BLOCKED");
const provenanceApproved = refreshProjectMaterializationPlan(provenancePending, [...assets, {...unapprovedSource, outputReview: {status: "approved"}}]);
const provenanceRecord = provenanceApproved.records.find((record) => record.materialId === "proof-record");
assert.equal(provenanceRecord.status, "READY_FOR_PROVENANCE_RECORD");
assert.equal(provenanceRecord.payload.record.reviewBoundary.factualClaimsApproved, false);
assert.equal(provenanceRecord.payload.record.reviewBoundary.rightsApproved, false);
assert.equal(provenanceRecord.payload.record.reviewBoundary.rightsStatus, "DECLARATION_ONLY_OR_REVIEW_REQUIRED");

const ambiguous = structuredClone(pack);
ambiguous.assetRequirementGraph.requirements.push({materialId: "second-text", duty: "editable-type", sourceEvidenceIds: [], usedByShotIds: [shots[0].shotId], materialSpecsByShot: []});
ambiguous.shotBlueprints[0].materialRequirements.push({id: "second-text", duty: "editable-type"});
const ambiguousPlan = buildProjectMaterializationPlan({pack: ambiguous, assets});
assert.ok(ambiguousPlan.records.find((record) => record.materialId === "second-text").blockers.includes("EDITABLE_COPY_MAPPING_REQUIRED"));

const fixtureResults = fixtures.articles.map((article) => {
  const record = plan.records.find((item) => item.materialId === `editable-copy-${article.id}`);
  assert.equal(record?.status, "READY_FOR_SCENE_GRAPH_BINDING", article.id);
  return {id: article.id, genre: article.genre, status: "PASS", materializationStatus: record.status, copySha256: record.payload.shotBindings[0].copySha256s[0]};
});
const result = {contract: "A1ProjectMaterializationTest/v1", status: "PASS", fixtureCount: plan.records.length,
  genreCount: new Set(fixtures.articles.map((article) => article.genre)).size, fixtures: fixtureResults, editableTypeBindings: plan.readyCount,
  fontReviewGate: "PASS", provenanceSourceReviewGate: "PASS", explicitDiagramBlock: "DIAGRAM_SPEC_REQUIRED", explicitProvenanceBlock: "PROVENANCE_EVIDENCE_IDS_REQUIRED",
  diagramSvgBinding: "PENDING_DIAGRAM_OUTPUT_BINDING",
  ambiguousTextBlock: "EDITABLE_COPY_MAPPING_REQUIRED", syntheticOnly: true, productionAdmission: false};
const out = path.join(root, "work/project-asset-materialization-v1/result.json");
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
