import fs from "node:fs/promises";
import path from "node:path";
import { toStoryboardRenderProps } from "../lib/storyboard-render-props.js";
import { buildHtmlVideoContentGraph } from "../lib/storyboard-html-video-adapter.js";

const root = process.cwd();

const sampleProject = {
  title: "AI 辅助写作工作台成熟度复盘",
  projectKind: "mixed",
  fps: 30,
  durationPerScene: 4,
  sourceText: `我做了一个 AI 辅助写作工作台。
但真正用下来，问题也很明显：中文稿子经常有 AI 味。
更靠谱的写法，是把工作往前移。
Codex 负责后台编排，Kimi 写完整稿，DeepSeek 做局部细修。
每次失败截图，都要变成下一轮审计规则。
这套规则覆盖前端、sidecar 和 renderer。
最后留下的不是一键好稿，而是稳定判断。`,
  scenes: [
    { id: "opening", type: "cover", headline: "AI 辅助写作工作台", body: "从模型问题转向流程问题", duration: 4 },
    { id: "problem", type: "point", headline: "问题不是模型本身", body: "中文稿子经常有 AI 味", duration: 4 },
    { id: "method", type: "word-sequence", headline: "把工作往前移", wordSequence: { items: ["先找材料", "先定方向", "先想读者会卡在哪里"] }, duration: 4 },
    { id: "roles", type: "word-sequence", headline: "三套模型分工", body: "Codex 负责后台编排，Kimi 写完整稿，DeepSeek 做局部细修", duration: 4 },
    {
      id: "image-shot",
      type: "image",
      headline: "真实截图镜头",
      caption: "用户素材作为主视觉推进",
      shotModule: "image-evidence",
      professionalStyleframeSourceLane: "real-web-evidence",
      motionTemplateId: "product_browser_zoom_01",
      selectedMotionTemplateId: "rve-image-zoom-reveal",
      selectedCropMode: "focal-cover",
      motionTemplateParams: {
        contract: "A1AdoptedAssetMotionTemplateParams/v1",
        selectedMotionTemplateId: "rve-image-zoom-reveal",
        selectedCropMode: "focal-cover",
        focalX: 68,
        focalY: 36,
        zoom: 118,
      },
      motionTemplateAssetBinding: {
        contract: "A1MotionTemplateAssetBinding/v1",
        templateId: "rve-image-zoom-reveal",
        templateName: "RVE Image Zoom Reveal",
        visualTask: "real_evidence_image",
        sourceStrategy: "verified-real-image",
        primarySurface: "verified-bitmap",
      },
      materialTemplateRoute: {
        contract: "A1MaterialTemplateRoute/v1",
        selectedMotionTemplateId: "rve-image-zoom-reveal",
      },
      assets: [{
        id: "screen",
        name: "工作台截图",
        url: "a1-sample-real-media.svg",
        type: "image/svg+xml",
        fit: "cover",
        focalPoint: { x: 68, y: 36 },
        zoom: 118,
        selectedCropMode: "focal-cover",
        selectedMotionTemplateId: "rve-image-zoom-reveal",
      }],
      duration: 4,
    },
    { id: "quote", type: "quote", headline: "失败截图必须变成规则", body: "这类句子需要留白停顿，而不是自动变成大口号", duration: 4 },
    { id: "metric", type: "data", headline: "审计覆盖", body: "只显示真实结构化数值", dataValue: "9 项", listItems: ["9 项", "前端、sidecar、renderer"], duration: 4 },
    { id: "compare", type: "point", headline: "调模板 vs 建契约", body: "临时调参解决一张图，全局契约约束整篇文章", listItems: ["临时调参", "全局契约"], narrative: { storyRole: "comparison" }, duration: 4 },
    { id: "closing", type: "closing", headline: "留下稳定感", body: "不是一键好稿，而是可复用判断", duration: 4 },
  ],
};

const outPath = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, ".codex-artifacts", "remotion-renderer", "sample-props.json");

await fs.mkdir(path.dirname(outPath), { recursive: true });
const props = toStoryboardRenderProps(sampleProject);
const contentGraph = buildHtmlVideoContentGraph(props);
await fs.writeFile(outPath, JSON.stringify({
  ...props,
  contentGraph,
  htmlVideoIr: contentGraph.htmlVideoIr,
}, null, 2));
console.log(outPath);
