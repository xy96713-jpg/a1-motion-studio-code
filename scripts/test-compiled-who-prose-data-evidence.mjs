import assert from "node:assert/strict";

const backendUrl = process.env.A1_BACKEND_URL || "http://127.0.0.1:4288";
const sourceUrl = "https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health";

const response = await fetch(`${backendUrl}/api/a1-compiled-image-search`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    shotId: "02",
    query: "全球已有约 36 亿人生活在高度易受气候影响的地区",
    sourceText: "全球已有约 36 亿人生活在高度易受气候影响的地区",
    sourceUrl,
    usageMode: "personal-noncommercial",
    allowSourcePageScreenshots: true,
    maxCandidates: 3,
    timeoutMs: 12_000,
  }),
});
const payload = await response.json().catch(() => ({}));
const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
const evidence = candidates[0]?.structuredDataEvidence || {};
const metrics = Array.isArray(evidence.metrics) ? evidence.metrics : [];

assert.equal(response.ok && payload.ok, true, `WHO source-page search failed: ${response.status} ${JSON.stringify(payload).slice(0, 500)}`);
assert.equal(evidence.contract, "A1StructuredDataEvidence/v1", `WHO candidate lacks structured evidence: ${JSON.stringify(evidence)}`);
assert.ok(Number(evidence.metricCount || 0) >= 2, `WHO prose evidence must expose source-page metrics: ${JSON.stringify(evidence)}`);
assert.ok(metrics.some((metric) => /3\.6|36/.test(`${metric.value}${metric.unit || ""}`)), `WHO 3.6 billion / 36 亿 metric is missing: ${JSON.stringify(metrics)}`);
assert.ok(metrics.some((metric) => /250000|250\s*000|25万/.test(`${metric.value}${metric.unit || ""}`)), `WHO 250,000 / 25 万 metric is missing: ${JSON.stringify(metrics)}`);

console.log(JSON.stringify({
  ok: true,
  contract: "A1CompiledWhoProseDataEvidenceTest/v1",
  sourceUrl,
  extractionSource: evidence.extractionSource,
  metrics,
}, null, 2));
