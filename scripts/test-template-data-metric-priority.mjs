import assert from "node:assert/strict";

const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://127.0.0.1:4310";
const sourceUrl = "https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health";
const sourceText = "气候变化不是单一疾病，而是放大既有健康风险的乘数。全球已有约 36 亿人生活在高度易受气候影响的地区。2030 年到 2050 年之间，营养不良、疟疾、腹泻和热应激预计每年额外造成约 25 万人死亡。极端高温、洪水和野火会直接伤害健康，水和食物系统受损又会间接扩大疾病风险。应对需要同时推进三件事：降低排放并改善空气质量，建设有气候韧性的卫生系统，以及建立针对高温和传染病的监测响应。最终目标不是只统计损失，而是把健康放进每一项气候决策。";
const structuredDataEvidence = {
  contract: "A1StructuredDataEvidence/v1",
  metricCount: 4,
  metrics: [
    { label: "population", value: 3.6, unit: "billion", raw: "3.6 billion", rowLabel: "source-page-source-prose" },
    { label: "projection start", value: 2030, unit: "", raw: "2030", rowLabel: "source-page-source-prose" },
    { label: "projection end", value: 2050, unit: "", raw: "2050", rowLabel: "source-page-source-prose" },
    { label: "additional deaths", value: 250000, unit: "", raw: "250000", rowLabel: "source-page-source-prose" },
  ],
};
const assets = ["02", "03"].map((shotId) => ({
  id: `who-data-${shotId}`,
  parentId: `scene-${shotId}`,
  adopted: true,
  source: "World Health Organization",
  sourceUrl,
  imageUrl: `http://127.0.0.1:4288/assets/web-assets/cache/who-climate-health-risk-pathways.jpg?shot=${shotId}`,
  sourceQualityTier: "official",
  sourceQualityScore: 95,
  structuredDataEvidence,
}));
const response = await fetch(`${rootUrl}/api/a1-compile-template-timeline`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "气候变化如何放大健康风险", sourceUrl, sourceText, assets }),
});
const payload = await response.json();
const progress = (payload.props?.items || []).find((item) => item.selectedSlug === "progress-bars" && /2030 年到 2050 年/u.test(item.article?.claim || ""));
const raws = (progress?.templateProps?.items || []).map((item) => String(item.raw || item.rawValue || ""));
const labels = (progress?.templateProps?.items || []).map((item) => String(item.label || ""));
const evidence = (progress?.templateProps?.items || []).map((item) => String(item.evidence || ""));

assert.equal(response.ok && payload.ok, true, `WHO compilation failed: ${response.status} ${JSON.stringify(payload).slice(0, 600)}`);
assert.ok(progress, `WHO mortality shot was not routed to progress-bars: ${JSON.stringify(payload.props?.items || [])}`);
assert.deepEqual(raws, ["2030", "2050", "25万"], `data template must only show the current sentence metrics and preserve their Chinese number expression: ${JSON.stringify(raws)}`);
assert.deepEqual(labels, ["预测起点", "预测终点", "预计每年额外死亡"], `Chinese article data must expose source-backed Chinese semantic labels instead of raw English field names: ${JSON.stringify(labels)}`);
assert.deepEqual(evidence, ["预测起点 = 2030", "预测终点 = 2050", "预计每年额外死亡 = 25万"], `stage evidence must remain a readable Chinese source cue and never leak extraction internals: ${JSON.stringify(evidence)}`);

console.log(JSON.stringify({ ok: true, contract: "A1TemplateDataMetricPriorityTest/v1", raws }, null, 2));
