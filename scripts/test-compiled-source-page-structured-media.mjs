const backendUrl = process.env.A1_BACKEND_URL || "http://localhost:4288";
const sourceUrl = `${backendUrl}/generated/source-page-jsonld-media-fixture.html`;

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const response = await fetch(`${backendUrl}/api/a1-compiled-image-search`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    shotId: "shot-jsonld",
    query: "structured source page media fixture",
    sourceUrl,
    maxCandidates: 2,
    timeoutMs: 12000,
  }),
});

const payload = await response.json().catch(() => ({}));
const failures = [];
const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
const first = candidates[0] || {};
const firstEvidence = first.evidenceFields || {};
const structured = first.structuredDataEvidence || {};
const metricValues = Array.isArray(structured.metrics) ? structured.metrics.map((metric) => metric.raw || String(metric.value)) : [];

assert(response.ok && payload.ok, `compiled image search failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`, failures);
assert(payload.sourcePageCandidateCount >= 1, `expected at least one source-page candidate, got ${payload.sourcePageCandidateCount || 0}`, failures);
assert(payload.structuredDataEvidenceCount === 1, `expected structured data evidence count, got ${payload.structuredDataEvidenceCount || 0}`, failures);
assert(first.source === "source-page-media", `expected first source source-page-media, got ${first.source || "missing"}`, failures);
assert(first.sourceQualityTier === "source-page", `expected source-page quality, got ${first.sourceQualityTier || "missing"}`, failures);
assert(firstEvidence.selector === "script[type='application/ld+json']", `expected JSON-LD selector, got ${firstEvidence.selector || "missing"}`, failures);
assert(firstEvidence.structuredDataType === "NewsArticle", `expected NewsArticle structured data type, got ${firstEvidence.structuredDataType || "missing"}`, failures);
assert(structured.contract === "A1StructuredDataEvidence/v1", `expected structured data evidence contract, got ${structured.contract || "missing"}`, failures);
assert(structured.extractionSource === "source-page-html-table", `expected table extraction source, got ${structured.extractionSource || "missing"}`, failures);
assert(Number(structured.metricCount || 0) >= 2, `expected structured table metrics, got ${JSON.stringify(structured)}`, failures);
assert(metricValues.includes("24%") && metricValues.includes("-8%"), `expected 24% and -8% metrics from table, got ${JSON.stringify(metricValues)}`, failures);
assert(Boolean(first.cachedImageUrl), "expected structured source-page preview to be cached locally", failures);
assert(first.renderAllowed === false && first.needsPromotion === true, "expected candidate to remain review-gated before render", failures);

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, payloadSummary: {
    sourcePageCandidateCount: payload.sourcePageCandidateCount,
    wikimediaCandidateCount: payload.wikimediaCandidateCount,
    searchFallbackCandidateCount: payload.searchFallbackCandidateCount,
    candidateCount: payload.candidateCount,
    first: {
      source: first.source,
      sourceQualityTier: first.sourceQualityTier,
      cachedImageUrl: first.cachedImageUrl,
      evidenceFields: firstEvidence,
      structuredDataEvidence: structured,
      renderAllowed: first.renderAllowed,
      needsPromotion: first.needsPromotion,
    },
  } }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: "A1CompiledSourcePageStructuredMediaTest/v1",
  backendUrl,
  sourceUrl,
  sourcePageCandidateCount: payload.sourcePageCandidateCount,
  wikimediaCandidateCount: payload.wikimediaCandidateCount,
  searchFallbackCandidateCount: payload.searchFallbackCandidateCount,
  candidateCount: payload.candidateCount,
  first: {
    source: first.source,
    sourceQualityLabel: first.sourceQualityLabel,
    sourceQualityTier: first.sourceQualityTier,
    sourceQualityScore: first.sourceQualityScore,
    cachedImageUrl: first.cachedImageUrl,
    selector: firstEvidence.selector,
    structuredDataType: firstEvidence.structuredDataType,
    structuredDataContract: structured.contract,
    structuredDataExtractionSource: structured.extractionSource,
    structuredDataMetricCount: structured.metricCount,
    structuredDataMetrics: metricValues,
    renderAllowed: first.renderAllowed,
    needsPromotion: first.needsPromotion,
  },
}, null, 2));
