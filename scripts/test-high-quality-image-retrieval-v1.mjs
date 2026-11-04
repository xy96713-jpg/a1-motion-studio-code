import assert from "node:assert/strict";
import {deriveMaterialCarrierRequirement, buildCarrierBoundQueries} from "../apps/studio-next/src/lib/a1-material-carrier-requirement-v1.mjs";
import {rankMaterialCarrierCandidates} from "../lib/visual-sourcing/material-carrier-fit-ranker-v1.mjs";
import {interleaveProviderCandidates, scoreImageQueryRelevance, searchBroadWebImages} from "../lib/visual-sourcing/web-image-provider-chain.mjs";

const requirement = deriveMaterialCarrierRequirement({
  id: "ledger",
  screenTitle: "账面记录 500 人",
  source: "洗衣店实际到店 50 人，账页却被追加为 500 人。",
}, {slotKind: "single-image", query: "洗衣店 账本 客流记录"});
const queries = buildCarrierBoundQueries("洗衣店 账本 客流记录", requirement);
assert.equal(queries.length, 3);
assert.match(queries[0], /laundromat cashier writing daily register/u);
assert.match(queries[1], /handwritten|recording|entry/u);
assert.match(queries[2], /-template/u);
assert.equal(new Set(queries).size, queries.length);

const ranked = rankMaterialCarrierCandidates([
  {
    id: "template",
    canonicalName: "Laundry Bookkeeping Excel Template free download",
    sourceUrl: "https://template.test/laundry.xlsx",
    previewImageUrl: "https://template.test/laundry.jpg",
    width: 1600,
    height: 900,
  },
  {
    id: "ledger-photo",
    canonicalName: "Laundromat clerk recording daily customer count in handwritten ledger",
    sourceUrl: "https://news.test/laundromat-ledger",
    previewImageUrl: "https://news.test/laundromat-ledger.jpg",
    width: 1600,
    height: 900,
  },
  {
    id: "generated-receipt",
    canonicalName: "Laundromat receipt on worn chair",
    sourceUrl: "https://stablediffusionweb.com/image/receipt",
    previewImageUrl: "https://stablediffusionweb.com/image/receipt.jpg",
    width: 1600,
    height: 900,
  },
  {
    id: "marketplace-receipt",
    canonicalName: "Laundry receipt book",
    sourceUrl: "https://www.amazon.com/laundry-receipt/dp/example",
    previewImageUrl: "https://images.test/marketplace.jpg",
    width: 1600,
    height: 900,
  },
], requirement);
assert.equal(ranked[0].id, "ledger-photo");
assert.equal(ranked[0].materialCarrierFit.status, "READY_FOR_PIXEL_REVIEW");
assert.equal(ranked.filter((candidate) => candidate.materialCarrierFit.status === "REJECTED").length, 3);
assert.ok(ranked.find((candidate) => candidate.id === "template").materialCarrierFit.hardFailures.includes("GENERIC_TEMPLATE"));
assert.ok(ranked.find((candidate) => candidate.id === "generated-receipt").materialCarrierFit.hardFailures.includes("GENERATED_MEDIA_NOT_EVIDENCE"));
assert.ok(ranked.find((candidate) => candidate.id === "marketplace-receipt").materialCarrierFit.hardFailures.includes("MARKETPLACE_PRODUCT"));

const pixelPassed = rankMaterialCarrierCandidates([{
  ...ranked[0],
  materialCarrierPixelReview: {
    contract: "A1MaterialCarrierPixelReview/v1",
    status: "PASS",
    score: 92,
    entityCorrect: true,
    sceneContextCorrect: true,
    actionCarrierFit: true,
    rangeToken: "ledger:line-4",
    ocrText: "实际到店 50 人 / 账面记录 500 人",
  },
}], requirement)[0];
assert.equal(pixelPassed.materialCarrierFit.status, "CARRIER_FIT_PASS");

const providerResult = await searchBroadWebImages({
  query: queries[0],
  maxResults: 2,
  env: {},
  fetchImpl: async () => ({ok: true, json: async () => ({results: []})}),
  imageSearchImpl: async () => Array.from({length: 9}, (_, index) => ({
    title: `result-${index}`,
    image: `https://img.test/${index}.jpg`,
    thumbnail: `https://thumb.test/${index}.jpg`,
    url: `https://source.test/${index}`,
    width: 1200,
    height: 800,
  })),
});
assert.equal(providerResult.candidates.length, 2, "provider limits must be enforced even when the dependency ignores maxResults");
assert.deepEqual(providerResult.providers, [
  {id: "openverse", candidateCount: 0, status: "PASS"},
  {id: "duckduckgo", candidateCount: 2, status: "PASS"},
]);
assert.equal(providerResult.candidates.every((candidate) => candidate.providerId === "duckduckgo"), true);

const diversified = interleaveProviderCandidates([
  {id: "openverse", candidates: Array.from({length: 5}, (_, index) => ({id: `o-${index}`}))},
  {id: "duckduckgo", candidates: Array.from({length: 2}, (_, index) => ({id: `d-${index}`}))},
], ["openverse", "duckduckgo"]);
assert.deepEqual(diversified.slice(0, 4).map((candidate) => candidate.providerId), ["openverse", "duckduckgo", "openverse", "duckduckgo"], "a high-volume provider must not starve a second provider before semantic ranking");
assert.deepEqual(scoreImageQueryRelevance("historic newspaper front page public domain", {title: "City Register front page from 1929"}), {queryTerms: ["historic", "newspaper", "front", "page"], matchedQueryTerms: ["front", "page"], queryMatchScore: 50});
assert.equal(scoreImageQueryRelevance("WPA poster public domain", {title: "WPA public health poster"}).queryMatchScore, 100);

console.log(JSON.stringify({
  ok: true,
  contract: "A1HighQualityImageRetrievalTest/v1",
  queryCount: queries.length,
  rankedCount: ranked.length,
  providerCandidateCount: providerResult.candidates.length,
  providerDiversityPrefix: diversified.slice(0, 4).map((candidate) => candidate.providerId),
}, null, 2));
