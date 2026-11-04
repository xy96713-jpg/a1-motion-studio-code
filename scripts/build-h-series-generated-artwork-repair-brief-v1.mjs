#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-generated-artwork-repair-brief-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const candidatePropsPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/candidate-props.json");
const candidateReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/report.json");
const artworkPolicyPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-artwork-policy-v1/report.json");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const repairSpecs = {
  "H03-B02": {
    semanticTask: "把‘问题没有被解决’变成一个仍然占据中心、但内部为空的物理事实。",
    object: "一块厚实的纸/石膏结构，表面完整，中心有一个真实的深空腔；表皮被轻轻掀开，露出空缺。",
    physicalRelationship: "完整外壳与中心空腔的对照；空腔是对象本身，不用线条画出来。",
    composition: "画面右侧单一中心对象，空腔留在视觉中心；左侧给两行标题和少量支持文字留白。",
    background: "暖灰白纸面、压印阴影和很轻的复印颗粒；背景不画注册线、不加装饰框。",
    typography: "标题保持‘这个问题 / 没有被解决’，第二行承担判断重量；不要让配图盖住标题。",
    motion: "先显示完整外壳，再让表皮错开，空腔在结论词出现时停住；不要用线条勾勒空腔。",
    continuity: "接住上一镜的纠缠纸带，下一镜转成被压皱的稿纸；材质从纸带过渡到厚纸结构。",
    avoid: ["线框", "虚线箭头", "网格", "假界面", "文字标签", "多重圆环"],
    acceptance: ["一眼看出中心有真实空缺", "对象不是装饰线条", "无可读文字/假证据", "标题仍是主判断"],
  },
  "H03-B03": {
    semanticTask: "表现‘完成度高但像废稿’：外表整齐与内部已失效同时存在。",
    object: "一张边缘非常整齐的厚纸稿被翻开，背面是一团被压皱、失去方向的纸纤维；不出现任何可读字符。",
    physicalRelationship: "整齐外壳与皱缩内里形成直接对照；重点是翻面后才看到废稿状态。",
    composition: "右侧单张大纸面，整齐面占上部，皱缩面落在下部；避免堆叠成卡片墙。",
    background: "暖白纸面加局部压痕和阴影，保留大块安静底色；不画表格或工程线。",
    typography: "标题保持‘完成度很高 / 但像废稿’，‘废稿’作为第二行视觉落点，不被插画抢走。",
    motion: "整齐纸面先以稳定状态出现，翻面后皱缩材质显现并短暂停住；不要做闪烁或随机抖动。",
    continuity: "从 H03-B02 的空腔承接到‘里面是什么’，下一镜继续沿用纸材质但降低秩序感。",
    avoid: ["假文章截图", "假段落文字", "网格纸", "线框图", "AI 卡片", "人物/手部"],
    acceptance: ["整齐与废稿是同一对象的两面", "废稿状态不是随机噪点", "无可读文字/假文档", "镜头短但判断清晰"],
  },
  "H05-B03": {
    semanticTask: "把‘读者往哪走’表现为一次真正的路径选择，而不是一根装饰箭头。",
    object: "两块厚纸构成的分岔通道/门洞，其中一条通道被一块 cobalt 色实物楔块打开，另一条被压低。",
    physicalRelationship: "两个可进入的物理方向与一个被选中的出口；方向由空间关系表达，不用箭头。",
    composition: "右侧采用横向分岔构图，两个出口形成明显深度差；左侧保留标题的清晰留白。",
    background: "暖纸底、硬边切纸阴影、少量复印颗粒；不加路径线、坐标线或地图符号。",
    typography: "标题‘读者该 / 往哪走？’保留问句张力；问号附近不叠加图形。",
    motion: "两个通道先同时存在，随后 cobalt 楔块推动一个出口打开并停住，另一出口保持关闭。",
    continuity: "接住 H05-B02 的风格收敛，下一镜转入‘泛泛而谈’的平滑化；选中的出口不应像最终答案卡片。",
    avoid: ["箭头", "虚线路径", "导航 UI", "地图/罗盘", "人物", "多层同心圆"],
    acceptance: ["不用箭头也能读出方向选择", "至少有两个真实空间出口", "cobalt 是选择物而非装饰线", "无 UI/文字证据"],
  },
  "H05-B04": {
    semanticTask: "把‘顺滑的泛泛而谈’表现为内容被磨平，而不是一张漂亮的空卡片。",
    object: "一叠原本有粗糙边缘的纸片被压进一个光滑的实体模具，边缘被磨成统一弧面；一小块粗糙边缘仍露在外面。",
    physicalRelationship: "粗糙内容被模具抹平，残留的一小块不规则边缘证明原本存在差异。",
    composition: "右侧单一压合动作，光滑模具与露出的粗糙边缘形成材质对照；避免卡片矩阵。",
    background: "偏暖纸面、实体压合阴影和局部摩擦痕；不使用网格、线框或渐变背景。",
    typography: "标题‘最后只剩下 / 顺滑的泛泛而谈’中第二行是结论，配图只做材质证据，不覆盖字。",
    motion: "粗糙纸片被实体模具压合，边缘逐渐统一；在‘泛泛而谈’落字时停住，不循环。",
    continuity: "从分岔路径收束成一条过度平滑的结果，下一章再转入可控流程的机械秩序。",
    avoid: ["光滑渐变卡片", "假文字", "重复小卡片", "波形线", "虚线", "随机噪点遮罩"],
    acceptance: ["必须看出‘被磨平’的动作", "保留一处粗糙差异作为语义证据", "不是通用背景图", "无可读文字"],
  },
  "H10-B04": {
    semanticTask: "把‘可控工作流’表现为可重复的实体编排，而不是软件界面截图。",
    object: "一个厚纸/木质分拣托盘，三块不同形状的实体模块被放入对应凹槽，旁边有一个正在闭合的机械压片。",
    physicalRelationship: "模块、槽位和压片形成输入—定位—锁定的真实关系；不出现按钮、面板或标签。",
    composition: "右侧托盘呈轻微俯视，三块模块有明确层级；左侧留出标题和支持文字。",
    background: "暖灰纸面、托盘边缘的实体阴影、少量 cobalt 作为一个模块的选中色；不画流程线。",
    typography: "标题‘把它变成 / 可控工作流’保持左侧主导，‘可控工作流’在压片闭合时获得重量。",
    motion: "三个模块按先后落入槽位，最后压片闭合并停住；运动是实体定位，不是线条路径。",
    continuity: "承接 H10 前面的阅读/修改动作，把抽象流程变成可重复的物理动作，为 H11 版本收束做准备。",
    avoid: ["流程图", "连线", "虚线箭头", "软件 UI", "假日志", "科技渐变", "人物手部"],
    acceptance: ["三块模块具有不同形状/职责感", "看得出放入、定位、锁定三步", "无界面/假证据", "cobalt 只标记一个被选中模块"],
  },
  "H11-B02": {
    semanticTask: "表现‘不至于推翻重来’：局部替换即可继续，整体结构没有坍塌。",
    object: "一座由几块厚纸板组成的稳定拱架，其中一块旧模块被抽出，旁边放着一块尺寸匹配的新模块。",
    physicalRelationship: "稳定主体、可替换模块、空出的槽位三者形成局部修复关系。",
    composition: "右侧拱架保持稳定，替换模块位于下方偏侧；画面不能像倒塌废墟。",
    background: "低对比暖纸面和拱架投影；不添加断裂线、警示符号或碎片云。",
    typography: "标题‘不至于 / 推翻重来’中‘不至于’先稳住画面，第二行随后落下；配图保持克制。",
    motion: "只抽出一块旧模块并换入新模块，拱架始终稳定；动作结束后留一个安静 hold。",
    continuity: "从 H11-B01 的版本整理承接到局部替换，下一镜把‘可替换’提升为方向选择。",
    avoid: ["倒塌建筑", "爆炸碎片", "红色警报", "箭头", "网格", "人物/手"],
    acceptance: ["整体结构始终稳定", "只发生局部替换", "新旧模块差异清楚", "不是励志海报或泛化修复图"],
  },
  "H11-B03": {
    semanticTask: "把‘决定文章往哪个方向走’表现为一次不可逆但克制的空间定向。",
    object: "一个可旋转的厚纸分向门，连接两个不同深度的实体通道；门转向其中一个通道并由 cobalt 楔块固定。",
    physicalRelationship: "旋转门、两个出口和固定楔块构成决定关系；方向来自门的朝向，不靠箭头或罗盘。",
    composition: "右侧以偏心旋转门为焦点，保留另一出口的空白作为被放弃的可能性；左侧排标题。",
    background: "暖纸底、实体门板阴影、单一 cobalt 固定块；不加十字线、坐标线或路径线。",
    typography: "标题‘决定文章 / 往哪个方向走’第二行承担方向落点，字与门板保持明确分离。",
    motion: "门板从中间位置缓慢旋向一个出口，cobalt 楔块最后卡住；只发生一次，不来回摆动。",
    continuity: "接住 H11-B02 的局部替换，作为 H-series 的方向收束；最终应给人已做决定而非继续探索的感觉。",
    avoid: ["箭头", "虚线路径", "罗盘/十字线", "多重轨道", "假地图", "人物"],
    acceptance: ["两个可能方向都可见", "只有一个方向被实体固定", "无装饰性破线/线框", "结尾状态稳定且可停留"],
  },
};

if (![candidatePropsPath, candidateReportPath, artworkPolicyPath].every((file) => fs.existsSync(file))) {
  throw new Error("required-source-missing");
}
const candidateProps = readJson(candidatePropsPath);
const candidateReport = readJson(candidateReportPath);
const artworkPolicy = readJson(artworkPolicyPath);
const policyItems = new Map((artworkPolicy.items || []).map((item) => [item.beatId, item]));
const scenes = new Map((candidateProps.scenes || []).map((scene) => [scene.beatId, scene]));
// The repair queue covers every selected editorial-artwork job, not only the
// two legacy files that the current pixel heuristic still flags. This keeps
// the seven-shot replacement pass complete and prevents a prompt-only repair
// from silently shrinking the queue.
const riskBeatIds = Object.keys(repairSpecs).filter((beatId) => policyItems.has(beatId));
const policyRiskBeatIds = riskBeatIds.filter((beatId) => policyItems.get(beatId)?.visualRisk);
const items = riskBeatIds.map((beatId, index) => {
  const scene = scenes.get(beatId);
  const spec = repairSpecs[beatId];
  if (!scene || !spec) throw new Error(`repair-spec-missing:${beatId}`);
  const director = scene.storyboard?.shotDirector || {};
  return {
    contract: "A1HSeriesGeneratedArtworkRepairBriefItem/v1",
    index: index + 1,
    beatId,
    macroId: scene.macroId,
    screenText: scene.screenText,
    source: {
      route: scene.route,
      family: scene.family,
      layoutFamily: scene.layoutFamily,
      motionArchetype: scene.motionArchetype,
      sourceAcceptance: director.acceptance || [],
    },
    riskReasons: policyItems.get(beatId)?.failures || [],
    semanticTask: spec.semanticTask,
    asset: {
      kind: "text-free-editorial-raster",
      subject: spec.object,
      physicalRelationship: spec.physicalRelationship,
      nonEvidence: true,
      noHumanFigure: true,
    },
    composition: spec.composition,
    background: spec.background,
    typography: spec.typography,
    motion: spec.motion,
    continuity: spec.continuity,
    avoid: spec.avoid,
    acceptance: spec.acceptance,
    review: {
      status: "pending-user-visual-review",
      generationAllowedBeforeUserDecision: false,
      rendererAdoptionAllowed: false,
      finalRenderAllowed: false,
      userDecisionRequired: true,
    },
  };
});
const report = {
  contract: "A1HSeriesGeneratedArtworkRepairBrief/v1",
  phaseId,
  generatedAt: new Date().toISOString(),
  status: items.length === 7 && items.every((item) => item.acceptance.length >= 3) ? "READY_FOR_SHOT_REVIEW" : "FAIL",
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  sourceBinding: {
    candidatePropsPath: path.relative(root, candidatePropsPath),
    candidatePropsSha256: sha256File(candidatePropsPath),
    candidateReportPath: path.relative(root, candidateReportPath),
    candidateReportSha256: sha256File(candidateReportPath),
    artworkPolicyPath: path.relative(root, artworkPolicyPath),
    artworkPolicySha256: sha256File(artworkPolicyPath),
    artworkPolicyManifestSha256: artworkPolicy.source?.manifestSha256 || null,
  },
  policy: {
    textFree: true,
    nonEvidence: true,
    noDecorativeLines: true,
    noWireframe: true,
    userDecisionBeforeGeneration: true,
  },
  summary: {
    riskAssetCount: riskBeatIds.length,
    policyRiskAssetCount: policyRiskBeatIds.length,
    briefCount: items.length,
    completeCount: items.filter((item) => item.acceptance.length >= 3).length,
    generationBlockedCount: items.filter((item) => item.review.generationAllowedBeforeUserDecision === false).length,
    userDecisionPendingCount: items.length,
  },
  items,
  nextAction: "record-user-visual-decision-per-shot-then-regenerate-only-approved-repair-briefs",
};
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
fs.writeFileSync(reportPath, stableJson(report));
fs.writeFileSync(publicReportPath, stableJson(report));
console.log(JSON.stringify({status: report.status, summary: report.summary, beatIds: items.map((item) => item.beatId), nextAction: report.nextAction}, null, 2));
if (report.status === "FAIL") process.exitCode = 2;
