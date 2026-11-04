import assert from "node:assert/strict";
import { createStoryboardDirectorPlan } from "../lib/storyboard-director.js";
import { routeShotExpression, validateShotExpressionGrammar } from "../lib/storyboard-shot-expression-grammar.js";

const CONTRACT = "A1ShotExpressionGrammar/v1";

const samples = [
  { expected: "impact-title", scene: { type: "cover", headline: "增长放缓不是需求消失", director: { intent: "setup" } } },
  { expected: "keyword-focus", scene: { headline: "问题不是提示词", body: "关键在判断没有提前建立", director: { intent: "problem" } } },
  { expected: "document-evidence", scene: { headline: "报告给出 36 亿人风险", body: "WHO fact sheet 显示 2030 到 2050 年额外死亡", assets: [{ kind: "screenshot", url: "/cache/who.png", sourceUrl: "https://www.who.int/" }], director: { intent: "evidence" } } },
  { expected: "character-explainer", scene: { headline: "模型各自承担职责", roleRows: [{ name: "Codex", task: "编排" }, { name: "Kimi", task: "写顺" }], director: { intent: "roles" } } },
  { expected: "object-collage", scene: { headline: "素材放进同一套协作系统", assets: [{ kind: "image", url: "/a.png" }, { kind: "image", url: "/b.png" }], director: { intent: "visual" } } },
  { expected: "process-flow", scene: { headline: "先抽主线，再定页面，最后回灌规则", director: { intent: "workflow" } } },
  { expected: "framework-summary", scene: { headline: "三层框架", wordSequence: ["主线", "证据", "收束"], director: { intent: "method" } } },
  { expected: "chapter-hold", scene: { type: "closing", headline: "真正留下的是可复用流程", director: { intent: "closing" } } },
];

for (const item of samples) {
  const expression = routeShotExpression(item.scene, { index: 1, total: 8 });
  assert.equal(expression.contract, CONTRACT, `${item.expected}: contract mismatch`);
  assert.equal(expression.expressionType, item.expected, `${item.expected}: route mismatch ${JSON.stringify(expression)}`);
  assert.ok(expression.templateRoute?.candidates?.length, `${item.expected}: missing template candidates`);
  assert.ok(expression.assetPolicy?.slotKinds?.length, `${item.expected}: missing asset slot policy`);
  assert.ok(expression.motionPlan?.primitive, `${item.expected}: missing motion primitive`);
  const validation = validateShotExpressionGrammar(expression);
  assert.equal(validation.ok, true, `${item.expected}: ${validation.failures.join(", ")}`);
}

const plan = createStoryboardDirectorPlan({
  title: "AI 写作工作台复盘",
  sourceText: "AI 写作的问题不是提示词。先抽主线，再整理证据，最后回灌规则。Codex 负责编排，Kimi 负责写顺。最后留下来的应该是一套可以复用的流程。",
});
assert.ok(plan.scenes.every((scene) => scene.shotExpressionGrammar?.contract === CONTRACT), "director scenes should carry shot expression grammar");
assert.ok(plan.scenes.some((scene) => scene.shotExpressionGrammar.expressionType === "process-flow"), "director should route workflow to process-flow expression");
assert.ok(plan.scenes.some((scene) => scene.shotExpressionGrammar.expressionType === "character-explainer"), "director should route role rows to character-explainer expression");
console.log("shot expression grammar tests passed");
