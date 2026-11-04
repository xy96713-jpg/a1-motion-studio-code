import assert from "node:assert/strict";
import fs from "node:fs/promises";

let routeModule;
try {
  routeModule = await import("../apps/studio-next/src/lib/a1-visual-material-route.ts");
} catch (error) {
  assert.fail(`visual material route implementation is missing: ${error instanceof Error ? error.message : error}`);
}

const { routeVisualMaterial, extractTextComparison } = routeModule;

const mapCases = [
  {
    sentence: "地图分布显示新增需求集中在交通枢纽和社区商业区",
    plannedSlug: "image-zoom-reveal",
  },
  {
    sentence: "城市热力图显示 300 个新增门店集中在轨道交通周边",
    plannedSlug: "polaroid-frame",
  },
];

for (const item of mapCases) {
  const route = routeVisualMaterial({
    gateId: "map-evidence",
    sentence: item.sentence,
    plannedSlug: item.plannedSlug,
    requiredCount: 1,
    fulfilledCount: 0,
  });
  assert.equal(route.contract, "A1VisualMaterialRoute/v1");
  assert.equal(route.status, "material-pending");
  assert.equal(route.plannedSlug, item.plannedSlug);
  assert.equal(route.runtimeSlug, "quote-card");
  assert.equal(route.allowVisualActors, false);
  assert.match(route.reason, /material|素材|source|来源/i);
}

const comparisonCases = [
  {
    sentence: "平台可能需要在两种策略之间选择：继续补贴增长，或者提高履约效率",
    left: "继续补贴增长",
    right: "提高履约效率",
  },
  {
    sentence: "团队可能会在两种扩张策略之间选择：继续铺点，或者提高单店效率",
    left: "继续铺点",
    right: "提高单店效率",
  },
  {
    sentence: "相比阿耳忒弥斯 II 绕月验证，阿耳忒弥斯 III 还要把火箭、飞船、着陆器、软件、推进和通信放进同一套协作系统",
    left: "阿耳忒弥斯 II：绕月验证",
    right: "阿耳忒弥斯 III：多系统协作",
  },
];

for (const item of comparisonCases) {
  const comparison = extractTextComparison(item.sentence);
  assert.equal(comparison?.left, item.left);
  assert.equal(comparison?.right, item.right);
  const route = routeVisualMaterial({
    gateId: "comparison-multi-image",
    sentence: item.sentence,
    plannedSlug: "image-carousel",
    requiredCount: 3,
    fulfilledCount: 0,
  });
  assert.equal(route.status, "text-comparison");
  assert.equal(route.runtimeSlug, "quote-card");
  assert.equal(route.allowVisualActors, false);
  assert.deepEqual(route.textComparison, comparison);
  const routedQuote = routeVisualMaterial({
    gateId: "comparison-multi-image",
    sentence: item.sentence,
    plannedSlug: "quote-card",
    requiredCount: 0,
    fulfilledCount: 0,
  });
  assert.equal(routedQuote.status, "text-comparison");
  assert.equal(routedQuote.runtimeSlug, "quote-card");
  assert.deepEqual(routedQuote.textComparison, comparison);
}

const fulfilledMap = routeVisualMaterial({
  gateId: "map-evidence",
  sentence: mapCases[0].sentence,
  plannedSlug: mapCases[0].plannedSlug,
  requiredCount: 1,
  fulfilledCount: 1,
});
assert.equal(fulfilledMap.status, "verified-material");
assert.equal(fulfilledMap.runtimeSlug, "image-zoom-reveal");
assert.equal(fulfilledMap.allowVisualActors, true);

const timelineSource = await fs.readFile(new URL("../apps/studio-next/src/lib/a1-template-timeline.ts", import.meta.url), "utf8");
const sourceGateSource = await fs.readFile(new URL("../apps/studio-next/src/lib/a1-source-evidence-gates.ts", import.meta.url), "utf8");
assert.match(timelineSource, /routeVisualMaterial/u, "template timeline must apply visual material routing");
assert.match(timelineSource, /visualMaterialRoute/u, "template timeline must carry the route into template props");
assert.match(timelineSource, /allowVisualActors/u, "timeline must expose visual actor permission");
assert.match(sourceGateSource, /A1VisualMaterialRoute\/v1/u, "source gate must recognize source-safe visual fallback");

console.log(JSON.stringify({
  ok: true,
  contract: "A1VisualMaterialRouteAudit/v1",
  cases: 12,
}, null, 2));
