import assert from "node:assert/strict";
import fs from "node:fs/promises";

let evidenceModule;
try {
  evidenceModule = await import("../apps/studio-next/src/lib/a1-data-source-evidence.ts");
} catch (error) {
  assert.fail(`data source evidence implementation is missing: ${error instanceof Error ? error.message : error}`);
}

const { extractDataClaim, assessDataEvidence, fallbackSlugForUnverifiedData } = evidenceModule;

const marketClaim = extractDataClaim({
  sentence: "核心城市订单量增长 24%，但三线城市仍低于去年同期",
  plannedSlug: "stat-counter",
});
assert.deepEqual(marketClaim.values, [{ value: 24, unit: "%" }]);
assert.equal(marketClaim.subject, "核心城市订单量");

const unsourcedMarket = assessDataEvidence({ claim: marketClaim, candidates: [] });
assert.equal(unsourcedMarket.status, "text-derived");
assert.equal(unsourcedMarket.runtimeSlug, "quote-card");
assert.equal(unsourcedMarket.allowDataActors, false);
assert.match(unsourcedMarket.reason, /source|来源|evidence/i);

const unsourcedPrice = assessDataEvidence({
  claim: extractDataClaim({ sentence: "图表显示客单价提升 12%", plannedSlug: "stat-counter" }),
  candidates: [],
});
assert.equal(unsourcedPrice.status, "text-derived");
assert.equal(fallbackSlugForUnverifiedData({ plannedSlug: "stat-counter" }), "quote-card");

const verifiedScientific = assessDataEvidence({
  claim: extractDataClaim({ sentence: "这些地震群通常持续约半小时，震级大多低于 1.5 级", plannedSlug: "progress-bars" }),
  candidates: [{
    sourceUrl: "https://www.usgs.gov/observatories/hvo/science/kilauea-monitoring",
    sourceQualityTier: "official",
    extractedText: "Kilauea earthquake swarms usually last about half an hour and remain below magnitude 1.5.",
    structuredDataEvidence: {
      contract: "A1StructuredDataEvidence/v1",
      metricCount: 2,
      metrics: [
        { label: "持续时间", value: 30, unit: "分钟" },
        { label: "震级上限", value: 1.5, unit: "级" },
      ],
    },
  }],
});
assert.equal(verifiedScientific.status, "verified");
assert.equal(verifiedScientific.runtimeSlug, "progress-bars");
assert.equal(verifiedScientific.allowDataActors, true);
assert.equal(verifiedScientific.selectedCandidate?.sourceQualityTier, "official");

const whoClaim = extractDataClaim({
  sentence: "全球已有约 36 亿人生活在高度易受气候影响的地区。2030 年到 2050 年之间预计每年额外造成约 25 万人死亡。",
  plannedSlug: "stat-counter",
});
const verifiedWho = assessDataEvidence({
  claim: whoClaim,
  candidates: [{
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health",
    sourceQualityTier: "official",
    extractedText: "Research shows that 3.6 billion people already live in areas highly susceptible to climate change. Between 2030 and 2050, climate change is expected to cause approximately 250 000 additional deaths per year.",
    structuredDataEvidence: {
      contract: "A1StructuredDataEvidence/v1",
      metricCount: 4,
      metrics: [
        { label: "people in susceptible areas", value: 3.6, unit: "billion" },
        { label: "projection start", value: 2030, unit: "" },
        { label: "projection end", value: 2050, unit: "" },
        { label: "additional deaths per year", value: 250000, unit: "" },
      ],
    },
  }],
});
assert.deepEqual(whoClaim.values.filter((item) => item.unit === "亿" || item.unit === "万"), [{ value: 36, unit: "亿" }, { value: 25, unit: "万" }]);
assert.equal(verifiedWho.status, "verified");
assert.equal(verifiedWho.allowDataActors, true);

const conflictingSource = assessDataEvidence({
  claim: marketClaim,
  candidates: [{
    sourceUrl: "https://example.gov/reports/city-orders",
    sourceQualityTier: "official",
    extractedText: "核心城市订单量增长 18%",
    structuredDataEvidence: {
      contract: "A1StructuredDataEvidence/v1",
      metricCount: 1,
      metrics: [{ label: "核心城市订单量", value: 18, unit: "%" }],
    },
  }],
});
assert.equal(conflictingSource.status, "text-derived");
assert.equal(conflictingSource.allowDataActors, false);
assert.ok(conflictingSource.rejectedCandidates.some((candidate) => candidate.mismatchReasons.includes("numeric-value-mismatch")));

const timelineSource = await fs.readFile(new URL("../apps/studio-next/src/lib/a1-template-timeline.ts", import.meta.url), "utf8");
const sourceGateSource = await fs.readFile(new URL("../apps/studio-next/src/lib/a1-source-evidence-gates.ts", import.meta.url), "utf8");
assert.match(timelineSource, /assessDataEvidence/u, "template timeline must assess numerical source evidence");
assert.match(timelineSource, /dataEvidenceRoute/u, "template timeline must carry dataEvidenceRoute into template props");
assert.match(timelineSource, /allowDataActors/u, "template timeline must prevent data actors on unverified fallbacks");
assert.match(timelineSource, /if \(!claim\.values\.length\) return null/u, "qualitative instrument claims must stay outside numerical evidence routing");
assert.match(sourceGateSource, /A1DataEvidenceRoute\/v1/u, "source evidence gate must recognize the explicit data evidence route");

console.log(JSON.stringify({
  ok: true,
  contract: "A1DataSourceEvidenceRouteAudit/v1",
  cases: 8,
  statuses: [unsourcedMarket.status, unsourcedPrice.status, verifiedScientific.status, conflictingSource.status],
}, null, 2));
