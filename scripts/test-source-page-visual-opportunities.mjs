import assert from "node:assert/strict";

const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://127.0.0.1:4310";
const cases = [
  {
    title: "仓库证据",
    sourceUrl: "https://github.com/microsoft/playwright",
    sourceText: "开源项目的判断不能只看二手介绍。仓库页面可以提供维护状态、文档入口和版本线索。最后仍然需要确认信息来源。",
  },
  {
    title: "气候影响",
    sourceUrl: "https://www.noaa.gov/education/resource-collections/climate/climate-change-impacts",
    sourceText: "气候影响需要具体材料。海平面、极端天气和生态系统都应连接到真实参考材料。最后说明哪些变化仍需观察。",
  },
];

for (const item of cases) {
  const response = await fetch(`${rootUrl}/api/a1-compile-template-timeline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(item),
  });
  const payload = await response.json();
  assert(response.ok && payload.ok, JSON.stringify(payload));
  assert(payload.beats.some((beat) => beat.gateId === "general-evidence" && beat.templateSelection.materialStrategy.requiredSlotKind === "image"), `${item.title} did not create a source-page image opportunity: ${JSON.stringify(payload.beats)}`);
}

const eventResponse = await fetch(`${rootUrl}/api/a1-compile-template-timeline`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "火山事件",
    sourceUrl: "https://www.usgs.gov/volcanoes/kilauea",
    sourceText: "Kilauea 山顶并不平静。1 月 12 日第 40 次喷发阶段结束后，火山口下方出现近十次小型地震群。最后监测仍将继续。",
  }),
});
const eventPayload = await eventResponse.json();
assert(!eventPayload.props.items.some((item) => item.selectedSlug === "progress-steps"), `a dated event sentence must not become a workflow template: ${JSON.stringify(eventPayload.props.items)}`);

console.log(JSON.stringify({ ok: true, contract: "A1SourcePageVisualOpportunityTest/v1" }, null, 2));
