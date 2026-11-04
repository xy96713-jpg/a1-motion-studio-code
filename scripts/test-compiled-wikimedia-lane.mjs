const backendUrl = process.env.A1_BACKEND_URL || "http://localhost:4288";

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const response = await fetch(`${backendUrl}/api/a1-compiled-image-search`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    shotId: "shot-02",
    query: "Kilauea volcano",
    maxCandidates: 3,
    timeoutMs: 12000,
  }),
});

const payload = await response.json().catch(() => ({}));
const failures = [];
const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
const first = candidates[0] || {};

assert(response.ok && payload.ok, `compiled image search failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`, failures);
assert(payload.wikimediaCandidateCount > 0, `expected Wikimedia candidates, got ${payload.wikimediaCandidateCount || 0}`, failures);
assert(payload.searchFallbackCandidateCount === 0, `expected DuckDuckGo not to run when Wikimedia fills slots, got ${payload.searchFallbackCandidateCount}`, failures);
assert(first.source === "wikimedia-commons", `expected first source wikimedia-commons, got ${first.source || "missing"}`, failures);
assert(first.sourceQualityTier === "open-knowledge", `expected open-knowledge quality, got ${first.sourceQualityTier || "missing"}`, failures);
assert(Boolean(first.cachedImageUrl), "expected Wikimedia preview to be cached locally", failures);
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
      renderAllowed: first.renderAllowed,
      needsPromotion: first.needsPromotion,
    },
  } }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: "A1CompiledWikimediaLaneTest/v1",
  backendUrl,
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
    license: first.licenseShortName || first.license,
    renderAllowed: first.renderAllowed,
    needsPromotion: first.needsPromotion,
  },
}, null, 2));
