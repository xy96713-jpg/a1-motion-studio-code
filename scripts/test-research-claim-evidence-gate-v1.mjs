#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {deriveShotIntelligenceDecision} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {assertShotResearchPacket, buildShotResearchPacket} from "../apps/studio-next/src/lib/a1-shot-research-packet-v1.mjs";
import {buildWholeFilmActualPixelSemanticAudit} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const researchBeat = {
  shotId: "TEST-RESEARCH",
  beatId: "TEST-RESEARCH",
  sourceText: "后来我查了一下关于 AI 写作的研究，研究发现表达范围可能变窄。",
  semanticRole: "key-claim",
  packagingType: "EXPLAINER_PACKAGE",
  valueAdded: 8,
  typeFit: 2,
};
const ordinaryBeat = {
  shotId: "TEST-ORDINARY",
  beatId: "TEST-ORDINARY",
  sourceText: "材料不够，角度不清，最后就会变成一篇很顺的泛泛而谈。",
  semanticRole: "style-context",
  packagingType: "EXPLAINER_PACKAGE",
  valueAdded: 8,
  typeFit: 2,
};
const authorProofBeat = {
  shotId: "TEST-AUTHOR-PROOF",
  beatId: "TEST-AUTHOR-PROOF",
  sourceText: "我试了 GPT、Claude、Kimi、DeepSeek，还有智谱。",
  semanticRole: "supporting-explanation",
  packagingType: "FULLSCREEN_PACKAGE",
  valueAdded: 4,
  typeFit: 2,
};
const productProofBeat = {
  shotId: "TEST-PRODUCT-PROOF",
  beatId: "TEST-PRODUCT-PROOF",
  sourceText: "打开页面，查看工作台里的真实截图。",
  editMode: "screen-demo",
  semanticRole: "supporting-explanation",
  packagingType: "NO_PACKAGE",
};
const decision = deriveShotIntelligenceDecision(researchBeat, {sourceHash: "article-hash"});
const ordinaryDecision = deriveShotIntelligenceDecision(ordinaryBeat, {sourceHash: "article-hash"});
const authorProofDecision = deriveShotIntelligenceDecision(authorProofBeat, {sourceHash: "article-hash"});
const productProofDecision = deriveShotIntelligenceDecision(productProofBeat, {sourceHash: "article-hash"});
assert.equal(decision.claimType, "research_claim");
assert.equal(decision.networkDecision, "REQUIRED");
assert.equal(ordinaryDecision.networkDecision, "HELPFUL");
assert.notEqual(ordinaryDecision.claimType, "research_claim");
assert.equal(authorProofDecision.claimType, "named-entity-claim");
assert.equal(authorProofDecision.proofRoute, "AUTHOR_PROOF");
assert.equal(authorProofDecision.networkDecision, "SKIP");
assert.deepEqual(authorProofDecision.searchQueries, []);
assert.equal(productProofDecision.proofRoute, "PRODUCT_PROOF");
assert.equal(productProofDecision.networkDecision, "SKIP");

const missingPacket = buildShotResearchPacket({decision, sources: [{url: "https://example.com/fake", title: "Metadata only", publisher: "Example", date: "2026", sourceTier: "primary", usageClass: "RESEARCH_ONLY", selectionReason: "test"}], evidenceSufficiency: "sufficient"});
assert.equal(missingPacket.status, "RESEARCH_PARTIAL");
assert.equal(missingPacket.researchReadiness.status, "BLOCKED");
assert.ok(missingPacket.researchReadiness.blockers.includes("SOURCE_1_REFERENCEARTIFACT_MISSING"));
assertShotResearchPacket(missingPacket);

const sourceSha = "1".repeat(64);
const source = {
  url: "https://aclanthology.org/2026.acl-long.1803/",
  title: "More Aligned, Less Diverse? Analyzing the Grammar and Lexicon of Two Generations of LLMs",
  publisher: "Association for Computational Linguistics",
  date: "2026-07",
  sourceTier: "primary",
  usageClass: "PRODUCTION_ALLOWED",
  selectionReason: "official first-party paper",
  groundedClaim: "较新的 instruction-tuned LLM 在该英文新闻样本中显示较低的句法和词汇多样性；这只是表达范围可能变窄的线索。",
  claimBoundary: {
    contract: "A1ResearchClaimBoundary/v1",
    status: "BOUND",
    supportedScope: "较新的 instruction-tuned LLM 在英文新闻样本中呈现更低的句法、尤其词汇多样性；表达范围可能变窄。",
    prohibitedExpansions: ["优先走常见、稳妥、可复用", "默认路径", "低风险、可复用表达"],
  },
  supportedClaims: ["较新的 instruction-tuned LLM 在该研究样本中显示出较低的句法多样性。"],
  referenceArtifact: {publicUrl: "/generated/system-line/test-acl-title-abstract.png", sha256: sourceSha, artifactKind: "OFFICIAL_ACL_PAPER_TITLE_ABSTRACT_PAGE"},
};
const readyPacket = buildShotResearchPacket({decision, sources: [source], evidenceSufficiency: "sufficient"});
assert.equal(readyPacket.status, "RESEARCH_READY");
assert.equal(readyPacket.researchReadiness.status, "READY");
assertShotResearchPacket(readyPacket);

const brief = workspace.production.shotIntelligence.packageLookMasterPlans.find((plan) => plan.shotId === "ED-16").semanticDesignBrief;
const assessment = {
  mode: "ACTUAL_PIXEL_VISUAL_REVIEW",
  reviewSource: "TEST_ACTUAL_PIXEL_REVIEW",
  artifactSha256Verified: true,
  viewerTakeawayMatch: true,
  actorActionMatch: true,
  sourceIdentityMatch: true,
  threeSecondReadable: true,
  genericTemplateDetected: false,
  visualComplexityWithinBudget: true,
  singleReadingPath: true,
  decorativeMotifFree: true,
  referenceCopyDetected: false,
  ocrAvailable: true,
  ocrExactCopyAligned: true,
  textExpected: true,
};
const artifact = {publicUrl: "/generated/system-line/test.png", sha256: "2".repeat(64), width: 1600, height: 900};
const researchGate = (overrides = {}) => buildWholeFilmActualPixelSemanticAudit({
  brief: {...brief, claimType: "research_claim"},
  artifact,
  assessment,
  decision,
  researchPacket: readyPacket,
  referenceInputs: [{id: "research-source", publicUrl: source.referenceArtifact.publicUrl, sha256: sourceSha}],
  referenceUseProof: {status: "PASS", sentToImageGen: true, sourcePacketSha256: readyPacket.packetSha256},
  evidenceMatch: {status: "PASS", sourceIds: ["research-source"], mismatchedSourceIds: []},
  sourceBoundOcrTokens: ["ACL 2026", source.title],
  ocrText: brief.exactCopy,
  ...overrides,
});
assert.equal(buildWholeFilmActualPixelSemanticAudit({brief: {...brief, claimType: "research_claim"}, artifact, assessment, decision, researchPacket: null, ocrText: brief.exactCopy}).status, "VISUAL_REJECTED");
assert.ok(buildWholeFilmActualPixelSemanticAudit({brief: {...brief, claimType: "research_claim"}, artifact, assessment, decision, researchPacket: null, ocrText: brief.exactCopy}).findings.includes("RESEARCH_SOURCE_PROVENANCE_MISSING"));
assert.equal(researchGate({researchPacket: null}).status, "VISUAL_REJECTED");
assert.ok(researchGate({researchPacket: null}).findings.includes("RESEARCH_SOURCE_PROVENANCE_MISSING"));
assert.equal(researchGate({evidenceMatch: {status: "MISMATCH", sourceIds: [], mismatchedSourceIds: ["research-source"]}}).status, "VISUAL_REJECTED");
assert.ok(researchGate({evidenceMatch: {status: "MISMATCH", sourceIds: [], mismatchedSourceIds: ["research-source"]}}).findings.some((finding) => finding.startsWith("RESEARCH_SOURCE_REFERENCE_MISMATCH")));
assert.equal(researchGate().status, "PASS");
assert.equal(researchGate().recommendationEligible, true);
const sourceLedResearchVisual = researchGate({assessment: {...assessment, ocrExactCopyAligned: false}, ocrText: "More Aligned, Less Diverse? ACL 2026"});
assert.equal(sourceLedResearchVisual.status, "PASS", "verified source-led research packaging need not repeat the spoken sentence");
assert.equal(sourceLedResearchVisual.checks.researchReferenceUseProof, true);
const ordinaryCopyMismatch = buildWholeFilmActualPixelSemanticAudit({brief, artifact, assessment: {...assessment, ocrExactCopyAligned: false}, ocrText: brief.exactCopy});
assert.equal(ordinaryCopyMismatch.status, "VISUAL_REJECTED", "ordinary packaging still requires its exact copy");
assert.ok(ordinaryCopyMismatch.findings.includes("OCR_EXACT_COPY_MISALIGNED"));
const expandedClaimAudit = researchGate({decision: {...decision, sourceText: "研究证明模型会优先走常见、稳妥、可复用表达的默认路径。"}});
assert.equal(expandedClaimAudit.status, "VISUAL_REJECTED");
assert.ok(expandedClaimAudit.findings.some((finding) => finding.startsWith("RESEARCH_CLAIM_BOUNDARY_BLOCKED")));

const ordinaryAudit = buildWholeFilmActualPixelSemanticAudit({brief, artifact, assessment, ocrText: brief.exactCopy});
assert.equal(ordinaryAudit.status, "PASS");
assert.equal(ordinaryAudit.researchAudit.required, false);

console.log(JSON.stringify({contract: "A1ResearchClaimEvidenceGateTest/v1", status: "PASS", checks: {evidenceLanguageRoutesRequired: true, missingSourceBlocked: true, metaphorWithoutSourceBlocked: true, mismatchedSourceBlocked: true, claimExpansionBlocked: true, verifiedSourceAndReferencePasses: true, sourceLedResearchMayUseVerifiedSourceCopy: true, ordinaryBeatUnaffected: true}}, null, 2));
