const backendUrl = process.env.A1_BACKEND_URL || "http://localhost:4288";
const sourceUrl = `${backendUrl}/generated/source-page-media-fixture.html`;

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const response = await fetch(`${backendUrl}/api/a1-compiled-image-search`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    shotId: "shot-source-page-screenshots",
    query: "平台可能需要在两种策略之间选择：继续补贴增长，或者提高履约效率",
    sourceUrl,
    maxCandidates: 3,
    timeoutMs: 12000,
    usageMode: "personal-noncommercial",
    allowSourcePageScreenshots: true,
  }),
});

const payload = await response.json().catch(() => ({}));
const failures = [];
const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
const sourcePageCandidates = candidates.filter((candidate) => candidate.sourceQualityTier === "source-page");
const screenshotCandidates = candidates.filter((candidate) => candidate.source === "source-page-screenshot");
const screenshotEvidence = screenshotCandidates.map((candidate) => candidate.evidenceFields || {});
const captureRoles = screenshotEvidence.map((evidence) => evidence.captureRole).filter(Boolean);

assert(response.ok && payload.ok, `compiled image search failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`, failures);
assert(payload.usagePolicy?.contract === "A1ProjectUsagePolicy/v1", `expected usage policy contract: ${JSON.stringify(payload.usagePolicy)}`, failures);
assert(payload.usagePolicy?.mode === "personal-noncommercial" && payload.usagePolicy?.allowSourcePageScreenshots === true, `expected personal screenshot policy: ${JSON.stringify(payload.usagePolicy)}`, failures);
assert(payload.sourcePageCandidateCount >= 3, `expected source-page media + screenshots to fill 3 candidates, got ${payload.sourcePageCandidateCount || 0}`, failures);
assert(payload.sourcePageMediaCandidateCount >= 1, `expected at least one source-page media candidate, got ${payload.sourcePageMediaCandidateCount || 0}`, failures);
assert(payload.sourcePageScreenshotCandidateCount >= 2, `expected at least two source-page screenshot candidates, got ${payload.sourcePageScreenshotCandidateCount || 0}`, failures);
assert(payload.searchFallbackCandidateCount === 0, `DuckDuckGo fallback should not run when source-page candidates fill slots, got ${payload.searchFallbackCandidateCount}`, failures);
assert(candidates.length >= 3, `expected at least 3 candidates, got ${candidates.length}`, failures);
assert(sourcePageCandidates.length >= 3, `expected all filled candidates to be source-page quality, got ${sourcePageCandidates.length}`, failures);
assert(screenshotCandidates.every((candidate) => candidate.cachedImageUrl && candidate.cachedImageUrl.startsWith("/assets/web-assets/cache/")), `screenshot candidates should be local cached URLs: ${JSON.stringify(screenshotCandidates)}`, failures);
assert(screenshotCandidates.every((candidate) => candidate.license === "personal-noncommercial-source-page-capture"), `screenshot candidates should record personal noncommercial use: ${JSON.stringify(screenshotCandidates)}`, failures);
assert(screenshotEvidence.every((evidence) => evidence.usagePolicyContract === "A1ProjectUsagePolicy/v1" && evidence.usageMode === "personal-noncommercial" && evidence.screenshotPermission === "user-confirmed-personal-noncommercial" && evidence.capturedAt), `screenshot candidates should preserve permission and capture time: ${JSON.stringify(screenshotEvidence)}`, failures);
assert(screenshotEvidence.some((evidence) => evidence.extractionSource === "playwright-source-page-screenshot" && Number(evidence.matchScore || 0) > 0), `expected at least one matched locator screenshot with matchScore: ${JSON.stringify(screenshotEvidence)}`, failures);
assert(screenshotEvidence.some((evidence) => /平台可能需要在两种策略之间选择/u.test(evidence.matchedText || "")), `expected matched screenshot text to include query sentence: ${JSON.stringify(screenshotEvidence)}`, failures);
assert(screenshotEvidence.every((evidence) => evidence.selector && evidence.selector !== "viewport"), `screenshot lane should prefer locator captures over viewport when source text matches: ${JSON.stringify(screenshotEvidence)}`, failures);
assert(captureRoles.includes("section"), `expected one matched source-page section capture, got roles ${JSON.stringify(captureRoles)}: ${JSON.stringify(screenshotEvidence)}`, failures);
assert(captureRoles.includes("figure"), `expected one matched source-page figure capture, got roles ${JSON.stringify(captureRoles)}: ${JSON.stringify(screenshotEvidence)}`, failures);
assert(!captureRoles.includes("article-context"), `screenshot lane should not use article-context when diversified matched slices exist: ${JSON.stringify(screenshotEvidence)}`, failures);
assert(candidates.every((candidate) => candidate.renderAllowed === false && candidate.needsPromotion === true), "all candidates should remain review-gated before render", failures);

if (failures.length) {
  console.error(JSON.stringify({
    ok: false,
    failures,
    payloadSummary: {
      sourcePageCandidateCount: payload.sourcePageCandidateCount,
      sourcePageMediaCandidateCount: payload.sourcePageMediaCandidateCount,
      sourcePageScreenshotCandidateCount: payload.sourcePageScreenshotCandidateCount,
      wikimediaCandidateCount: payload.wikimediaCandidateCount,
      searchFallbackCandidateCount: payload.searchFallbackCandidateCount,
      candidates: candidates.map((candidate) => ({
        source: candidate.source,
        sourceQualityTier: candidate.sourceQualityTier,
        cachedImageUrl: candidate.cachedImageUrl,
        captureRole: candidate.evidenceFields?.captureRole || "",
        evidenceFields: candidate.evidenceFields,
      })),
    },
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: "A1CompiledSourcePageScreenshotLaneTest/v1",
  backendUrl,
  sourceUrl,
  sourcePageCandidateCount: payload.sourcePageCandidateCount,
  sourcePageMediaCandidateCount: payload.sourcePageMediaCandidateCount,
  sourcePageScreenshotCandidateCount: payload.sourcePageScreenshotCandidateCount,
  wikimediaCandidateCount: payload.wikimediaCandidateCount,
  searchFallbackCandidateCount: payload.searchFallbackCandidateCount,
  candidates: candidates.map((candidate) => ({
    source: candidate.source,
    sourceQualityLabel: candidate.sourceQualityLabel,
    sourceQualityTier: candidate.sourceQualityTier,
    sourceQualityScore: candidate.sourceQualityScore,
    cachedImageUrl: candidate.cachedImageUrl,
    captureRole: candidate.evidenceFields?.captureRole || "",
    selector: candidate.evidenceFields?.selector || "",
    matchScore: candidate.evidenceFields?.matchScore || 0,
    matchedText: candidate.evidenceFields?.matchedText || "",
    renderAllowed: candidate.renderAllowed,
    needsPromotion: candidate.needsPromotion,
  })),
}, null, 2));
