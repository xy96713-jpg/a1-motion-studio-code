import assert from "node:assert/strict";
import { createStoryboardDirectorPlan } from "../lib/storyboard-director.js";
import { toStoryboardRenderProps, validateStoryboardRenderProps } from "../lib/storyboard-render-props.js";

const draft = [
  "AI 写作工具真正改变的不是一句话，而是文稿从判断到交付的节奏。",
  "第一段先建立问题：一键生成经常看起来完整，却缺少可以追溯的材料。",
  "第二段给出方法：系统应该先理解全文，再按句子功能选择模板和素材。",
  "如果文章提到真实产品、页面或数据，就必须先规划资产来源，不能临时画一个假截图。",
  "最后，导出前还要检查节奏，避免连续重复模板和满屏文字卡。",
].join("\n");

const director = createStoryboardDirectorPlan({ title: "第一阶段集成测试", sourceText: draft });
assert.ok(director.scenes.length >= 3, "director should generate multiple scenes");
assert.ok(director.scenes.every((scene) => scene.shotExpressionGrammar?.contract === "A1ShotExpressionGrammar/v1"), "director scenes must carry shot expression grammar");
assert.ok(director.scenes.every((scene) => scene.director?.shotExpressionGrammar?.styleDecoupled === true), "shot expression grammar must be style-decoupled");

const props = toStoryboardRenderProps({
  title: "第一阶段集成测试",
  sourceText: draft,
  rawSourceText: draft,
  scenes: director.scenes,
});
const validation = validateStoryboardRenderProps(props);
assert.equal(validation.ok, true, validation.failures.join("; "));
assert.equal(props.styleProfileId, "paper-editorial", "render props should persist default style profile id");
assert.equal(props.visualStyleAdapterTokens?.contract, "A1VisualStyleAdapterTokens/v1", "render props should expose adapter tokens only");
assert.equal(props.visualStyleAdapterTokens?.adapterBoundary, "skin-tokens-only", "style profile must be skin-only");
assert.equal(props.visualStyleProfile?.decoupling?.articleUnderstanding, "external", "skin must not own article understanding");
assert.equal(props.visualStyleProfile?.decoupling?.templateSelection, "external", "skin must not own template selection");
assert.ok(props.scenes.every((scene) => scene.shotExpressionGrammar?.contract === "A1ShotExpressionGrammar/v1"), "render scenes must carry shot expression grammar");
assert.ok(props.scenes.every((scene) => scene.shotExpressionGrammar?.styleDecoupled === true), "render shot grammar must remain style-decoupled");
assert.ok(props.scenes.every((scene) => scene.visualStyleAdapterTokens?.contract === "A1VisualStyleAdapterTokens/v1"), "adapter tokens should reach scene adapter props");
assert.equal(props.articleFilmRhythmGate?.contract, "A1ArticleFilmRhythmGate/v1", "render props should carry rhythm gate");
assert.equal(props.qaMetadata?.articleFilmRhythmGate?.contract, "A1ArticleFilmRhythmGate/v1", "QA metadata should carry rhythm gate diagnostics");
assert.ok(Array.isArray(props.directorMetadata?.articleFilmRhythmGateDiagnostics), "director metadata should carry rhythm diagnostics");
const visibleText = JSON.stringify(props.scenes.map((scene) => ({
  titleLines: scene.titleLines,
  bodyLines: scene.bodyLines,
  listItems: scene.listItems,
  quote: scene.quote,
  caption: scene.caption,
  dataValue: scene.dataValue,
})));
assert.equal(visibleText.includes("A1ArticleFilmRhythmGate"), false, "rhythm gate must not leak to stage-visible text");
assert.equal(visibleText.includes("A1VisualStyleAdapterTokens"), false, "style adapter tokens must not leak to stage-visible text");

const restored = toStoryboardRenderProps({ title: "旧项目兼容", scenes: director.scenes.map(({ shotExpressionGrammar, ...scene }) => scene) });
assert.equal(restored.styleProfileId, "paper-editorial", "old projects should default style profile id");
assert.ok(restored.scenes.every((scene) => scene.shotExpressionGrammar?.contract === "A1ShotExpressionGrammar/v1"), "old projects should derive missing shot grammar");
console.log("Phase 1 storyboard integration test passed.");
