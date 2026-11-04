#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildEd01WordpathCandidate, ED01_WORDPATH_CANDIDATE_CONFIGS} from "../apps/studio-next/src/lib/operation-engines/prepare-ed01-wordpath-candidate-engine-v1.mjs";
import {buildStaticReviewRecord, formatStaticReviewOutput, STATIC_REVIEW_CONFIGS} from "./engines/record-static-review-engine-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixedTime = "2026-08-20T00:00:00.000Z";
const artifactSha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fixtureWorkspace = {
  workspaceSha256: "fixture-workspace-sha",
  production: {
    staticPackageReview: {
      contract: "LegacyReview/v1",
      status: "PREVIOUS",
      history: [{status: "OLDER"}],
    },
  },
};

const legacy = {
  "v1-rejection": {wrapper: "record-static-review-v1-rejection-v2.mjs", auditSha256: "643245e958f18d3bcb81493dba833d80459c76eae258423e51a6d63dee63d6e1", artifactSha256: "57fd060fa70db63a47ef4b09c9ecdb5b0f9c978557fea39b2610b23c9c4e6e8f", successor: "STATIC_PACKAGE_REVIEW_V2_NOT_RENDERED", historyLength: 0, action: "record-static-review-v1-rejection", targetId: "STATIC_PACKAGE_REVIEW_V1", commitId: "static-review-v1-rejected-20260820000000", reportPath: "static-package-review-v2/v1-rejection-audit.json", authorizationReceiptIssued: undefined},
  "v2-rejection": {wrapper: "record-static-review-v2-rejection-v3.mjs", auditSha256: "0278fab6163a929beffe9061170e8d171f33de7e59390d970076252ed9c3acf2", artifactSha256: "7e79544088b5546dfdcfd32e5a0b71760857ca23de1f78a764980bd4c9b6bd42", successor: "STATIC_PACKAGE_REVIEW_V3_NOT_RENDERED", historyLength: 2, action: "record-static-review-v2-rejection", targetId: "STATIC_PACKAGE_REVIEW_V2", commitId: "static-review-v2-rejected-20260820000000", reportPath: "static-package-review-v3/v2-rejection-audit.json", authorizationReceiptIssued: false},
  "v3-overlay-rejection": {wrapper: "record-static-review-v3-overlay-rejection-v4.mjs", auditSha256: "1cd1feae649acaf5c52e4d44921a3c0e94e927a519b1d5e92969ce9fd05cf2c1", artifactSha256: "8285faf4a29bb88b5745bba7c39ea37e16083ca26c6da63681ac29f9f7bbebfb", successor: "STATIC_PACKAGE_REVIEW_V4_NOT_RENDERED", historyLength: 2, action: "record-static-review-v3-overlay-rejection", targetId: "STATIC_PACKAGE_REVIEW_V3", commitId: "static-review-v3-overlay-rejected-20260820000000", reportPath: "static-package-review-v4/v3-overlay-rejection-audit.json", authorizationReceiptIssued: false},
  "v4-overlay-accessory-rejection": {wrapper: "record-static-review-v4-overlay-accessory-rejection-v5.mjs", auditSha256: "cb6724509ffa94e79ebf2fc0cc1fced1ec5397d51c866b0151654751f59dac81", artifactSha256: "85fddb9711096377da5628a0914b9d6fa208494ac3ea35187e09f13ff11865f2", successor: "STATIC_PACKAGE_REVIEW_V5_NOT_RENDERED", historyLength: 2, action: "record-static-review-v4-overlay-accessory-rejection", targetId: "STATIC_PACKAGE_REVIEW_V4", commitId: "static-review-v4-overlay-accessory-rejected-20260820000000", reportPath: "static-package-review-v5/v4-overlay-accessory-rejection-audit.json", authorizationReceiptIssued: false},
  "v5-overlay-source-roi-rejection": {wrapper: "record-static-review-v5-overlay-source-roi-rejection-v6.mjs", auditSha256: "5623e1438dbcb3214e7abde8f183735259611964fbb84abcc6ffbd898e719254", artifactSha256: "5bed5ed865ff59424ec6c1cebcdf323597dca16801ee3840c5f88973c30434d7", successor: "STATIC_PACKAGE_REVIEW_V6_NOT_RENDERED", historyLength: 2, action: "record-static-review-v5-overlay-source-roi-rejection", targetId: "STATIC_PACKAGE_REVIEW_V5", commitId: "static-review-v5-overlay-source-roi-rejected-20260820000000", reportPath: "static-package-review-v6/v5-overlay-source-roi-rejection-audit.json", authorizationReceiptIssued: false},
  "v6-render-blocked-alpha-gate": {wrapper: "record-static-review-v6-render-blocked-alpha-gate-v7.mjs", auditSha256: "966020522d97b04b5ae96b80715e27f5f949b40225b141baf26fe143512362a1", artifactSha256: "d9e5615c72683c1cb3a4638626e813e0ad5a6cce4553eedd1a4fc27d0e886bea", successor: "STATIC_PACKAGE_REVIEW_V7_NOT_RENDERED", historyLength: 2, action: "record-static-review-v6-render-blocked-alpha-gate", targetId: "STATIC_PACKAGE_REVIEW_V6", commitId: "static-review-v6-render-blocked-20260820000000", reportPath: "static-package-review-v7/v6-render-blocked-alpha-component-gate-audit.json", authorizationReceiptIssued: false},
};

assert.deepEqual(Object.keys(STATIC_REVIEW_CONFIGS), Object.keys(legacy));
for (const [reviewId, expected] of Object.entries(legacy)) {
  const record = buildStaticReviewRecord({
    reviewId,
    current: fixtureWorkspace,
    reviewedAt: fixedTime,
    createEvent: (event) => event,
  });
  assert.equal(record.report.auditSha256, expected.auditSha256, `${reviewId}: legacy body hash`);
  assert.equal(artifactSha(record.report), expected.artifactSha256, `${reviewId}: legacy JSON artifact hash`);
  assert.equal(record.next.production.staticPackageReview.successor, expected.successor, `${reviewId}: successor`);
  assert.equal(record.next.production.staticPackageReview.history?.length || 0, expected.historyLength, `${reviewId}: history`);
  assert.equal(record.event.action, expected.action, `${reviewId}: action`);
  assert.equal(record.event.targetId, expected.targetId, `${reviewId}: target`);
  assert.deepEqual(record.event.payload, {auditSha256: expected.auditSha256, status: record.report.status}, `${reviewId}: event payload`);
  assert.equal(record.persistOptions.commitId, expected.commitId, `${reviewId}: commit id`);
  assert.deepEqual(Object.keys(record.persistOptions.files), [expected.reportPath], `${reviewId}: artifact path`);
  const output = formatStaticReviewOutput({workspaceSha256: "saved-workspace-sha", transitionSha256: "saved-transition-sha"}, record.report, record.config);
  assert.equal(output.authorizationReceiptIssued, expected.authorizationReceiptIssued, `${reviewId}: output shape`);

  const wrapper = fs.readFileSync(path.join(root, "scripts", expected.wrapper), "utf8");
  assert.equal(wrapper, `#!/usr/bin/env node\nimport {runStaticReviewCli} from "./engines/record-static-review-engine-v1.mjs"; await runStaticReviewCli("${reviewId}");\n`, `${reviewId}: thin wrapper`);
}

const wordpathFixture = {
  candidateId: "fixture-prior",
  legacy: "keep",
  sceneGraph: {
    legacyGraph: "keep",
    nodes: [
      {id: "presenter-word-1", assetId: "asset-1", legacyNode: "keep-1"},
      {id: "presenter-word-2", fontAssetId: "font-2", typographyMaterialAssetId: "type-2", legacyNode: "keep-2"},
      {id: "unrelated-node", assetId: "asset-3", legacyNode: "keep-3"},
    ],
    layoutSolution: {legacyLayout: "keep"},
    motionPhrase: {legacyMotion: "keep"},
    handoff: {legacyHandoff: "keep"},
    visualPrimitiveOverride: {legacyPrimitive: "keep"},
  },
};
const wordpathLegacyHashes = {
  "flow-wordpath-candidate-v20": "595dad6caa1e01414e4f09b7e8c61e7511f473caeeafe2d00a75043b3b4fabb0",
  "flow-wordpath-candidate-v21": "456b38b5986721df3da6657736b3078ef813c3289841e74334c0c72c428eab05",
  "arm-ramp-wordpath-candidate-v22": "ead606f8065c2de9695a54a36f7d267ba59ed0574f2cc7237d3fe59424f59421",
  "edge-turn-wordpath-candidate-v23": "da05cf7ae7e5848b4d8b3e482041e5b40984b89e59a5369df7649a47736dabf1",
  "terminal-turn-wordpath-candidate-v24": "e287a69b1e8887861f199443d11f5594998b20f8719b75b19ed6f1c785eba981",
};
assert.deepEqual(Object.keys(ED01_WORDPATH_CANDIDATE_CONFIGS), Object.keys(wordpathLegacyHashes));
for (const [variantId, expectedHash] of Object.entries(wordpathLegacyHashes)) {
  const candidate = buildEd01WordpathCandidate({
    current: {library: {assetPackSha256: "fixture-asset-pack-sha"}},
    prior: wordpathFixture,
    variantId,
    now: fixedTime,
  });
  assert.equal(artifactSha(candidate), expectedHash, `${variantId}: legacy candidate hash`);
  const config = ED01_WORDPATH_CANDIDATE_CONFIGS[variantId];
  const wrapper = fs.readFileSync(path.join(root, "scripts", config.wrapper), "utf8");
  assert.equal(wrapper, `#!/usr/bin/env node\nimport {runEd01WordpathCandidateCli} from "../apps/studio-next/src/lib/operation-engines/prepare-ed01-wordpath-candidate-engine-v1.mjs"; runEd01WordpathCandidateCli("${variantId}");\n`, `${variantId}: thin wrapper`);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1RecordStaticReviewEngineParity/v1",
  wrapperCount: Object.keys(legacy).length,
  legacyArtifactHashCount: Object.keys(legacy).length,
  ed01WordpathWrapperCount: Object.keys(wordpathLegacyHashes).length,
  ed01WordpathLegacyCandidateHashCount: Object.keys(wordpathLegacyHashes).length,
  spotCheckedWrapperIds: ["v1-rejection", "v3-overlay-rejection", "v6-render-blocked-alpha-gate"],
  productionMutationPerformed: false,
}, null, 2));
