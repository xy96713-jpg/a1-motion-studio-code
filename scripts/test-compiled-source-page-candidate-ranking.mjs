import assert from "node:assert/strict";
import {
  canonicalSourceVisualKey,
  rankCompiledSourcePageCandidates,
} from "../lib/compiled-source-page-candidate-ranker.js";

const sourceUrl = "https://www.apple.com/newsroom/accessibility/";
const candidates = [
  { previewImageUrl: "https://cdn.example/Apple-accessibility-features-hero-lp.jpg.landing-big_2x.jpg", evidenceFields: { alt: "Apple accessibility features" } },
  { previewImageUrl: "https://cdn.example/Apple-accessibility-features-Vehicle-Motion-Cues-update.jpg.large.jpg", evidenceFields: { alt: "Vehicle Motion Cues" } },
  { previewImageUrl: "https://cdn.example/Apple-accessibility-features-Magnifier-Reader-Mode.jpg.large.jpg", evidenceFields: { alt: "Magnifier Reader Mode" } },
  { previewImageUrl: "https://cdn.example/Apple-accessibility-features-Braille-Access.jpg.large.jpg", evidenceFields: { alt: "Braille Access" } },
  { previewImageUrl: "https://cdn.example/Apple-accessibility-features-hero_big.jpg.large.jpg", evidenceFields: { alt: "Accessibility Nutrition Labels, Braille Access, Live Listen, and Live Captions are displayed together." } },
  { previewImageUrl: "https://cdn.example/Apple-accessibility-features-hero-lp.jpg.og.jpg?rev=2", evidenceFields: { alt: "" } },
].map((candidate, index) => ({ ...candidate, id: `candidate-${index + 1}`, sourceUrl }));

const magnifier = rankCompiledSourcePageCandidates(candidates, "放大器增加阅读模式，帮助低视力用户读取周围内容");
assert.match(magnifier[0].previewImageUrl, /Magnifier-Reader-Mode/u);
assert(magnifier[0].semanticMatchScore > magnifier.at(-1).semanticMatchScore);

const vehicle = rankCompiledSourcePageCandidates(candidates, "车辆运动提示利用动态圆点减少乘车时的感官冲突");
assert.match(vehicle[0].previewImageUrl, /Vehicle-Motion-Cues/u);

const braille = rankCompiledSourcePageCandidates(candidates, "盲文访问把设备变成完整的盲文笔记工具");

const publisherMark = rankCompiledSourcePageCandidates([
  { id: "mark", previewImageUrl: "https://www.nasa.gov/wp-content/uploads/nasa-meatball-logo.png", alt: "NASA logo" },
  { id: "crew", previewImageUrl: "https://images.nasa.gov/artemis-crew-portrait.jpg", alt: "Artemis crew portrait" },
], "Artemis III astronauts crew mission");
if (publisherMark[0]?.id !== "crew" || publisherMark[0]?.decorativeMark) throw new Error("publisher marks must not outrank a relevant article photograph");
assert.match(braille[0].previewImageUrl, /Braille-Access/u);

assert.equal(
  canonicalSourceVisualKey(candidates[0]),
  canonicalSourceVisualKey(candidates[5]),
  "hero renditions should share a canonical visual key",
);

console.log(JSON.stringify({
  ok: true,
  contract: "A1CompiledSourcePageCandidateRankingTest/v1",
  cases: 4,
}, null, 2));
