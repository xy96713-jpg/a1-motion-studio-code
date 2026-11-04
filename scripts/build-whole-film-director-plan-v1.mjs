#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildWholeFilmDirectorPlan} from "../apps/studio-next/src/lib/a1-whole-film-director-v1.ts";

const root = process.cwd();
const phaseId = "whole-film-director-v1";
const sourcePath = path.join(root, "remotion-renderer/src/generated/srtSemanticChoreographyV2.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256Text = (value) => createHash("sha256").update(value).digest("hex");
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

if (!fs.existsSync(sourcePath)) throw new Error(`missing:${path.relative(root, sourcePath)}`);
const sourcePlan = read(sourcePath);
const cues = sourcePlan.macros.flatMap((macro) => macro.cueEvents).map((cue) => ({
  cueId: cue.cueId,
  sourceStartMs: cue.sourceStartMs,
  sourceEndMs: cue.sourceEndMs,
  sourceText: cue.sourceText,
})).sort((a, b) => a.cueId - b.cueId);

const base = (firstCueId, lastCueId, chapterId, editMode, narrativeJob, viewerTakeaway, mediumDecisionReason, extra = {}) => ({
  firstCueId,
  lastCueId,
  chapterId,
  editMode,
  narrativeJob,
  viewerTakeaway,
  mediumDecisionReason,
  presenterDirection: null,
  overlayBrief: null,
  presenterPackage: editMode.startsWith("presenter") ? {
    intensity: editMode === "presenter-overlay" ? "light" : "none",
    keyPhrases: [],
    spatialAnchor: "negative-space",
    faceSafeZone: "LOCK_EYES_AND_MOUTH",
    occlusionRule: "不得遮挡眼睛和嘴；允许文字从肩部、身体或桌面对象前后穿插。",
  } : {
    intensity: "not-applicable",
    keyPhrases: [],
    spatialAnchor: "not-applicable",
    faceSafeZone: "not-applicable",
    occlusionRule: "not-applicable",
  },
  screenActions: [],
  packageBrief: null,
  transitionOut: "cut-on-spoken-idea",
  requiredMaterialIds: [],
  ...extra,
});

const intents = [
  base(1, 2, "C01", "presenter-overlay", "由作者本人建立产品与可信度，文字包装把产品身份锁在真人周围。", "这是作者亲手做的写作工作台。", "第一人称开场必须先看到作者；关键词可强化身份，但不能用遮罩或标题替代真人。", {
    presenterDirection: "中近景直视镜头，自然说完两句；环境保留真实工作区，人物始终是主视觉。",
    overlayBrief: "“vibe coding”从脸旁负空间进入，“智能写作工作台”沿桌面或肩部深度锁定；允许身体遮挡少量字，不遮眼睛和嘴。",
    presenterPackage: {
      intensity: "hero",
      keyPhrases: ["vibe coding", "智能写作工作台"],
      spatialAnchor: "mixed-depth",
      faceSafeZone: "LOCK_EYES_AND_MOUTH",
      occlusionRule: "人物保持完整可辨；文字可进入肩后与桌面前景，禁止全屏字形遮罩替代脸。",
    },
    transitionOut: "作者视线或手势带向真实屏幕",
    requiredMaterialIds: ["presenter-take-opening"],
  }),
  base(3, 4, "C01", "screen-demo", "用一次最短真实操作证明划选改写。", "划一句，系统就能改一句。", "这是可见的产品动作，录屏比口述或动画解释更可信。", {
    screenActions: ["在真实文章中划选原句", "触发改写", "在原位置确认替换结果"],
    transitionOut: "改写结果中的选区保持，切到偏好标记",
    requiredMaterialIds: ["capture-rewrite-selection"],
  }),
  base(5, 7, "C01", "screen-demo", "把喜欢、讨厌和风格库连成一次闭环。", "偏好不是提示词，而是会累积的库。", "观众需要看到两个相反动作和最终归档位置，包装无法替代真实因果。", {
    screenActions: ["标记喜欢句", "标记讨厌句", "打开对应风格库确认记录"],
    transitionOut: "库中条目下移，露出正文空白",
    requiredMaterialIds: ["capture-preference-library"],
  }),
  base(8, 12, "C01", "screen-demo", "演示补段从正文缺口发生并写回原文。", "补段始终留在上下文里。", "这段的核心是位置关系和写回动作，必须让真实光标与正文承担叙事。", {
    screenActions: ["在两段之间双击空白", "输入补段需求", "等待上下文候选", "选择候选并写回正文"],
    transitionOut: "新段落落定后切收稿按钮",
    requiredMaterialIds: ["capture-paragraph-assist-early"],
  }),
  base(13, 16, "C01", "screen-demo", "展示收稿检查不是一键生成，而是风格与病句建议。", "收稿是检查，不是替作者重写。", "真实建议列表和原文定位是证据，不应被抽象成勾选图标。", {
    screenActions: ["点击收稿", "打开风格检查", "定位病句建议", "停在一条可读修改建议"],
    transitionOut: "建议面板收起，进入演示模式",
    requiredMaterialIds: ["capture-final-review-early"],
  }),
  base(17, 19, "C01", "screen-demo", "用真实演示模式结束功能总览。", "写完的稿可以直接进入口播阅读。", "字号和速度属于具体交互，真实录屏可避免做成泛化 UI 动画。", {
    screenActions: ["打开演示模式", "调节字号", "调节速度并开始滚动"],
    transitionOut: "滚动中的文字停住，硬切回作者提问",
    requiredMaterialIds: ["capture-presentation-mode-early"],
  }),
  base(20, 23, "C02", "presenter-clean", "让作者提出观众最自然的反问，建立第二幕冲突。", "既然用了 AI，为什么不让它直接写完？", "这是立场转折，需要人物语气和停顿，不需要解释型包装。", {
    presenterDirection: "回到中近景，语气像替观众发问；末句留半拍，不叠大标题。",
    transitionOut: "问题后的停顿切入作者经验",
    requiredMaterialIds: ["presenter-take-question"],
  }),
  base(24, 27, "C03", "presenter-overlay", "用作者经验给出问题判断，同时让关键词只做轻量压句。", "模型进步了，但 AI 仍常常不说人话。", "先相信人物，再让少量文字加强判断；不需要离开人物进入完整包装。", {
    presenterDirection: "保持人物主画面；语气克制，不表演挫败。",
    overlayBrief: "仅在原句落点出现“不说人话”，贴近人物手势或桌面，不做悬浮 logo。",
    presenterPackage: {
      intensity: "editorial",
      keyPhrases: ["不说人话"],
      spatialAnchor: "shoulder-depth",
      faceSafeZone: "LOCK_EYES_AND_MOUTH",
      occlusionRule: "关键词可被肩部局部遮挡，但不得穿过五官或变成独立标题卡。",
    },
    transitionOut: "关键词退回画面边缘，保留人物连续性",
    requiredMaterialIds: ["presenter-take-ai-language"],
  }),
  base(28, 30, "C03", "presenter-overlay", "把“中文却难读、没有重点”落到阅读体验。", "文字正确不等于文章可读。", "这仍是作者体验，轻字效足以；完整包装会把连续论述切碎。", {
    presenterDirection: "人物继续讲，镜头可轻推近；不切假文档卡。",
    overlayBrief: "“中文 / 看不懂 / 没重点”按口播顺序短暂出现，最后一起失焦。",
    presenterPackage: {
      intensity: "light",
      keyPhrases: ["中文", "看不懂", "没重点"],
      spatialAnchor: "negative-space",
      faceSafeZone: "LOCK_EYES_AND_MOUTH",
      occlusionRule: "文字停留在人物视线外侧的负空间；推近时主动避让脸部安全区。",
    },
    transitionOut: "失焦文字吞没人物，进入黑场判断句",
    requiredMaterialIds: ["presenter-take-unreadable"],
  }),
  base(31, 32, "C03", "type-only", "把核心判断做成全片第一次纯字重击。", "完成度很高，也可能只是一篇废稿。", "这句话是可独立记忆的反常识结论，值得暂时拿走人物和界面。", {
    packageBrief: "黑场安静进入；“完成度很高”先像成品锁定，“废稿”从内部破坏排版。必须保留阅读停顿，不使用 HUD。",
    transitionOut: "“废稿”字形碎片变成下一镜模型名字的字粒",
    requiredMaterialIds: ["approved-type-family-impact"],
  }),
  base(33, 35, "C04", "full-package", "压缩多模型试验，表达“换过很多，但不是根因”。", "模型换了一圈，问题仍没有消失。", "型号列举若让人物逐个念会拖慢；完整包装可用语言层级快速交代，但禁止 logo 卡片。", {
    packageBrief: "模型名字作为同一排版材料快速替换、覆盖和擦除；不使用品牌 Logo、不做五张卡，最后只留下“不是模型的问题”。",
    transitionOut: "最后一个模型名被擦成一句研究开场",
    requiredMaterialIds: ["licensed-model-wordmarks-or-text-only-policy", "approved-model-trial-template"],
  }),
  base(36, 39, "C04", "presenter-clean", "承认国产模型中文更顺，再自然引向研究。", "更顺只是相对改善，不是彻底解决。", "这是细微让步和查证动作，人物表达比继续炫技更有可信度。", {
    presenterDirection: "作者回到镜头，先承认改善，再说“后来我查了一下”；可出现真实浏览动作但不覆盖人物。",
    transitionOut: "作者目光落向桌面资料，匹配切入研究包装",
    requiredMaterialIds: ["presenter-take-research-bridge"],
  }),
  base(40, 45, "C05", "full-package", "把模型的高概率表达与缺失的作者偏好、方向做成清楚对照。", "模型会走安全路径，却不知道作者讨厌什么、要带读者去哪。", "这是抽象机制与对照关系，完整包装能把因果讲清，而不是让人物口述一串概念。", {
    packageBrief: "真实研究证据局部为底；“常见/稳妥/可复用”逐步收窄成同一路径，随后被“讨厌什么/带到哪里”两处空缺打断。",
    transitionOut: "两处空缺收缩成现实中的材料缺口",
    requiredMaterialIds: ["verified-research-evidence", "approved-convergence-template"],
  }),
  base(46, 47, "C05", "presenter-overlay", "把研究结论拉回作者的朴素总结。", "材料和角度都不清，最后只会顺滑地泛泛而谈。", "结论需要人物承担判断，文字只标记两个缺口。", {
    presenterDirection: "人物主画面，先说两个原因，最后一句不夸张。",
    overlayBrief: "“材料不够”“角度不清”分别贴近真实桌面材料与空白笔记，禁止悬浮箭头。",
    presenterPackage: {
      intensity: "editorial",
      keyPhrases: ["材料不够", "角度不清"],
      spatialAnchor: "desk-object",
      faceSafeZone: "LOCK_EYES_AND_MOUTH",
      occlusionRule: "关键词必须锚定桌面材料和笔记，不得悬在人物脸旁成为说明 HUD。",
    },
    transitionOut: "两块真实材料被摆到同一工作流顺序",
    requiredMaterialIds: ["presenter-take-material-angle"],
  }),
  base(48, 52, "C06", "full-package", "把材料、角度、动笔变成本文方法论的三步骨架。", "AI 动笔前，先固定材料和角度。", "这是全片核心流程，适合一次结构清楚的包装而不是 UI 卡片轮播。", {
    packageBrief: "三步必须由真实材料对象驱动：材料进入、角度被圈定、AI 才开始落字；用对象交接，不用三栏展示板。",
    transitionOut: "最后生成的稿件对象交给 Codex 角色段",
    requiredMaterialIds: ["creator-source-materials", "approved-three-step-object-template"],
  }),
  base(53, 57, "C07", "full-package", "说明 Codex 在后台承担编排、主线、风格库和硬伤检查。", "Codex 是流程编排者，不是唯一写作者。", "多项后台职责需要层级和交接，完整包装比人物逐条解释更高效。", {
    packageBrief: "以同一份稿件为中心，编排、主线、风格库、收稿检查依次作用在它身上；不做四列职责卡，不出现 HUD 标签。",
    transitionOut: "稿件在最后一步交给 API 通道",
    requiredMaterialIds: ["approved-editorial-orchestration-template"],
  }),
  base(58, 61, "C07", "full-package", "解释 Codex、API 和 DeepSeek 的实际关系。", "Codex 整理材料并通过 API 让 DeepSeek 写全文。", "关系结构是抽象但明确的系统因果，适合对象流而不是品牌陈列。", {
    packageBrief: "材料先被整理成稿件包，再穿过 API 边界进入 DeepSeek；所有名字只作为对象标签，不能变成漂浮 Logo。",
    transitionOut: "生成的全文匹配切进真实前端页面",
    requiredMaterialIds: ["approved-system-relay-template", "official-entity-text-policy"],
  }),
  base(62, 69, "C07", "screen-demo", "进入真实产品前端，证明编辑和保存模型。", "它首先是一份普通、可保存的文档。", "产品结构和保存动作必须由真实前端承担，包装只能做轻微裁切。", {
    screenActions: ["打开真实页面显示标题和全文", "在正文中添加或修改", "按 Command+S 保存", "重新打开确认最新版"],
    transitionOut: "保存提示折叠成历史主题入口",
    requiredMaterialIds: ["capture-editor-save"],
  }),
  base(70, 73, "C07", "screen-demo", "展示历史版本按文章隔离。", "每个主题保留近五次修改，文章之间不会混。", "这是一条数据归档事实，必须在真实版本列表中可读。", {
    screenActions: ["打开历史主题", "查看同一文章近五次修改", "切换另一篇文章确认隔离"],
    transitionOut: "从历史条目回到正文中的目标句",
    requiredMaterialIds: ["capture-history-isolation"],
  }),
  base(74, 81, "C08", "screen-demo", "完整演示讨厌句如何进入风格库并在未来被拦下。", "系统记住你不要的句子，下次会主动提醒。", "选择、原因、入库、再次命中是连续因果，必须发生在同一真实屏幕空间。", {
    screenActions: ["划选“AI 正在改变内容生产”", "显示太空、没动作、太枯燥的原因", "写入讨厌库", "触发相似句并显示拦截提醒"],
    transitionOut: "拦截提示被作者手势接住，切回人物一句过桥",
    requiredMaterialIds: ["capture-reject-and-intercept"],
  }),
  base(82, 82, "C09", "presenter-clean", "用一句人物过桥，从讨厌库转向喜欢库。", "喜欢的表达也能被系统记住。", "这是短促的叙事换向，人物一句话比新建包装转场更自然。", {
    presenterDirection: "短句正面说完，可与上一镜手势匹配；不加解释标签。",
    transitionOut: "手势或视线指回屏幕选区",
    requiredMaterialIds: ["presenter-take-like-bridge"],
  }),
  base(83, 85, "C09", "screen-demo", "演示喜欢句入库并影响后续句式。", "喜欢库会参与之后的生成。", "结果必须在真实喜欢库和候选文本中出现，避免抽象爱心图标。", {
    screenActions: ["划选并点击喜欢", "打开喜欢库确认条目", "展示后续生成的相似句式或类比"],
    transitionOut: "候选句中的空隙扩成段落缺口",
    requiredMaterialIds: ["capture-like-and-reuse"],
  }),
  base(86, 86, "C09", "presenter-clean", "用作者一句话重置节奏，说明补段沿用同一逻辑。", "补段不是另一套系统。", "短桥段不值得再启动一个完整包装家族。", {
    presenterDirection: "人物一句带过，语速略快，直接领入操作。",
    transitionOut: "切到真实正文两段之间的空行",
    requiredMaterialIds: ["presenter-take-paragraph-bridge"],
  }),
  base(87, 94, "C09", "screen-demo", "演示发现缺口、输入需求、获得候选并写回正文。", "补段是一条可控的选择链，不是自动插入。", "这段以人做选择为核心，真实鼠标、光标和正文位置不可替代。", {
    screenActions: ["定位两段之间的缺口", "双击空行", "输入具体补段需求", "查看多个上下文候选", "挑选一段写回正文"],
    transitionOut: "写回后的正文向下滚动到收稿按钮",
    requiredMaterialIds: ["capture-paragraph-assist-full"],
  }),
  base(95, 97, "C09", "screen-demo", "展示最终检查如何标出可修改位置。", "收稿仍然给建议，决定权留给人。", "真实标注和原文对应关系是这段的视觉证据。", {
    screenActions: ["点击收稿", "运行全文检查", "逐条定位可修改或优化之处"],
    transitionOut: "最后一条建议收起，露出演示模式入口",
    requiredMaterialIds: ["capture-final-review-full"],
  }),
  base(98, 101, "C09", "screen-demo", "再次展示演示模式，完成从写作到口播的闭环。", "文章完成后可直接按自己的阅读节奏使用。", "第二次出现不是重复炫功能，而是作为完整流程的终点；需要更短、更克制。", {
    screenActions: ["打开演示模式", "设置字号和速度", "开始口播滚动并停在可读状态"],
    transitionOut: "滚动文字匹配切到作者真实工作体验",
    requiredMaterialIds: ["capture-presentation-mode-final"],
  }),
  base(102, 105, "C10", "presenter-clean", "让作者说明产品来自真实痛点，重新建立人物动机。", "这套工作台来自作者真实遇到的问题。", "结尾前需要回到人，避免产品演示成为无主体教程。", {
    presenterDirection: "人物中近景，允许看到真实桌面；语气像复盘，不做品牌宣言。",
    transitionOut: "桌面真实动作承接到可控工作流关键词",
    requiredMaterialIds: ["presenter-take-real-problem"],
  }),
  base(106, 110, "C10", "presenter-overlay", "交代系统边界：可控但不完美，最终仍要人改。", "它不是一键好稿，人的修改仍不可缺。", "这是可信度边界，人物必须在场；文字只强调“不通顺 / AI 味 / 人去修改”。", {
    presenterDirection: "保持人物连续，列举问题时不要戏剧化；最后一句直视镜头。",
    overlayBrief: "三个短语依次贴近真实稿面，保护“不通顺”“AI 味”完整词组，不做底部通用条。",
    presenterPackage: {
      intensity: "editorial",
      keyPhrases: ["不通顺", "AI 味", "人去修改"],
      spatialAnchor: "mixed-depth",
      faceSafeZone: "LOCK_EYES_AND_MOUTH",
      occlusionRule: "前两词贴近稿面，最后一句进入人物肩后；保护完整词组且不遮挡五官。",
    },
    transitionOut: "最后的人工修改动作保留到下一镜",
    requiredMaterialIds: ["presenter-take-human-boundary"],
  }),
  base(111, 114, "C11", "presenter-overlay", "总结价值不是自动写好，而是避免无记录地推翻重来。", "系统让修改更可控，积累不会丢。", "这是产品价值收束，作者本人仍是主视觉；两处价值词可以在真人画面中完成最后一次文字包装。", {
    presenterDirection: "人物安静收束；可以有一次真实翻回旧版本的手部动作，但不切走人物主体。",
    overlayBrief: "“更加可控”沿旧版本纸面进入，“不至于推翻重来”在人物肩后安静锁定，为终章纯字留出交接。",
    presenterPackage: {
      intensity: "editorial",
      keyPhrases: ["更加可控", "不至于推翻重来"],
      spatialAnchor: "mixed-depth",
      faceSafeZone: "LOCK_EYES_AND_MOUTH",
      occlusionRule: "文字与旧版本对象发生前后景关系；人物脸部持续清晰，不做底部口号条。",
    },
    transitionOut: "人物最后的停顿让位给终章纯字",
    requiredMaterialIds: ["presenter-take-controllable-close"],
  }),
  base(115, 117, "C11", "type-only", "用作者方向而非产品名称结束全片。", "真正重要的是写出你自己的风格。", "终句是整篇最高层价值，适合安静的纯字结尾，不再加入界面或人物解释。", {
    packageBrief: "从一小块真实稿面或笔迹开始，逐词收束为“你自己的风格”；保留长停顿，禁止口号式 logo end card。",
    transitionOut: "hold-to-black",
    requiredMaterialIds: ["approved-quiet-closing-template", "author-handwriting-or-real-manuscript"],
  }),
];

const chapterTitles = {
  C01: "先证明工作台真的能用",
  C02: "观众的反问",
  C03: "完成度很高的废稿",
  C04: "换模型不是根治",
  C05: "安全表达与方向缺口",
  C06: "材料、角度、动笔",
  C07: "后台角色与真实前端",
  C08: "讨厌库的因果闭环",
  C09: "喜欢、补段、收稿与演示",
  C10: "真实痛点与人工边界",
  C11: "把方向交还作者",
};

const plan = buildWholeFilmDirectorPlan({
  projectId: "july1-writing-workbench",
  durationMs: sourcePlan.durationMs,
  source: {
    srtPath: sourcePlan.sourceBinding.srt.path,
    srtSha256: sourcePlan.sourceBinding.srt.sha256,
    articleStructureSha256: sourcePlan.sourceBinding.article.sha256,
  },
  cues,
  intents,
  chapterTitles,
  visualThesis: "让作者、真实产品操作和少量高强度编辑包装各自做最擅长的事：人建立立场，录屏证明动作，包装解释机制，纯字只负责两次记忆重击。",
  rules: [
    "先理解完整文章与节奏弧，再决定主剪辑镜头；字幕 cue 只提供时间，不直接等于镜头。",
    "真人承担第一人称、态度、让步、边界和价值收束；露脸不等于纯口播，关键句可在脸旁负空间、肩部前后景或桌面对象上完成文字包装。",
    "真实录屏承担所有可验证的产品动作；缺录屏时进入录制队列，不准生成假界面。",
    "完整包装只解释抽象机制、系统关系和强对照；禁止 Logo 卡、HUD、四列展示板与统一标题卡。",
    "纯字只用于可独立记忆的判断和终章，不可作为缺素材回退。",
    "媒介缺失时 BLOCK，不得回落为通用 Title、CSS 卡片或 AI 生造证据。",
  ],
  mediaInventory: {
    presenterFootage: "missing",
    screenRecording: "planning-evidence-only",
    notes: [
      "已检查 /Users/a1/Documents/Codex/声音/outputs 三层范围：未发现可绑定的真人口播源文件。",
      "resolve_subtitle_analysis 只证明字幕与候选操作存在，不等于真实录屏源已绑定到当前系统线。",
      "现有 MP4 主要是历史包装预览或合成审片，禁止冒充真人/真实录屏素材。",
    ],
  },
  visualTruth: {
    currentPrototypeStatus: "STRUCTURAL_PASS_VISUAL_PENDING",
    humanVisualApproval: "PENDING_INDEPENDENT_MOTION_REVIEW",
    reason: "系统补强后的 4 秒候选已通过统一 Motion IR、视觉准入、双解释器和 HyperFrames 技术检查，但尚未经过独立动态视觉复审。",
    previousRejectedCandidateBackup: "apps/studio-next/public/generated/system-line/creator-material-pixel-type-motion-v1-rejected-before-system-fix",
  },
});

const serializedPlan = `${JSON.stringify(plan, null, 2)}\n`;
const planSha256 = sha256Text(serializedPlan);
const modeDurationTotal = Object.values(plan.mediumSummary).reduce((sum, item) => sum + item.durationMs, 0);
const report = {
  contract: "A1WholeFilmDirectorAuditReport/v1",
  phaseId,
  status: "DIRECTOR_CONTRACT_PASS_VISUAL_PENDING",
  checks: {
    sourceCueCoverageExact: plan.coverage.exact,
    sourceCueCount117: plan.source.cueCount === 117,
    sourceDuration218400: plan.source.durationMs === 218400,
    editShotCount30: plan.shots.length === 30,
    editTimelineContinuous: plan.coverage.editTimelineContinuous,
    mediumDurationCoversTimeline: modeDurationTotal === plan.source.durationMs,
    firstShotIsPresenterWithTypography: plan.shots[0].editMode === "presenter-overlay"
      && plan.shots[0].presenterPackage.intensity === "hero"
      && plan.shots[0].presenterPackage.keyPhrases.includes("vibe coding")
      && plan.shots[0].presenterPackage.faceSafeZone === "LOCK_EYES_AND_MOUTH",
    firstShotUsesExactOpening: plan.shots[0].sourceText === "Hi，我用 vibe coding 做了一款智能写作工作台。",
    allScreenShotsHaveCausalActions: plan.shots.filter((shot) => shot.editMode === "screen-demo").every((shot) => shot.screenActions.length >= 2),
    allMissingMediaBlocksInsteadOfFallback: plan.shots.every((shot) => shot.materialGate === "BLOCKED_MEDIA_MISSING" && shot.fallbackPolicy === "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD"),
    rejectedWrongOpeningCandidate: plan.rejectedCandidates.some((item) => item.id === "shot-01-vibe-coding-workbench-v1" && item.status === "REJECTED"),
    currentVisualPrototypeTruthful: plan.visualTruth.currentPrototypeStatus === "STRUCTURAL_PASS_VISUAL_PENDING"
      && plan.visualTruth.humanVisualApproval === "PENDING_INDEPENDENT_MOTION_REVIEW",
    rendererAdoptionLocked: !plan.gates.rendererAdoptionAllowed,
    h47ExpansionLocked: !plan.gates.h47ExpansionAllowed,
    fullMp4Locked: !plan.gates.fullMp4RenderAllowed,
    aiGeneralizationNotOverclaimed: !plan.authorship.aiGenerated && !plan.authorship.newArticleGeneralizationProven,
  },
  sourceBinding: {
    sourcePlan: path.relative(root, sourcePath),
    sourcePlanSha256: createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"),
    planSha256,
  },
  summary: {
    chapterCount: plan.chapters.length,
    editShotCount: plan.shots.length,
    cueCount: plan.source.cueCount,
    durationMs: plan.source.durationMs,
    mediumSummary: plan.mediumSummary,
    blockedMaterialShotCount: plan.shots.filter((shot) => shot.materialGate === "BLOCKED_MEDIA_MISSING").length,
  },
  truthBoundary: {
    currentPlanAiGenerated: false,
    genericContractImplemented: true,
    aiOutputSchemaImplemented: true,
    newArticleAutomationProven: false,
    visualPrototypeStatus: "STRUCTURAL_PASS_VISUAL_PENDING",
    currentRendererAuthorityMutated: false,
  },
  gates: plan.gates,
  failures: [],
  nextAction: plan.nextAction,
};

const failures = Object.entries(report.checks).filter(([, pass]) => !pass).map(([id]) => id);
report.failures = failures;
if (failures.length) {
  report.status = "BLOCKED";
  throw new Error(`whole-film-director-build-failed:${failures.join(",")}`);
}

for (const targetRoot of [artifactRoot, publicRoot]) {
  fs.mkdirSync(targetRoot, {recursive: true});
  fs.writeFileSync(path.join(targetRoot, "director-plan.json"), serializedPlan, "utf8");
  writeJson(path.join(targetRoot, "report.json"), report);
}

console.log(JSON.stringify({status: report.status, planSha256, summary: report.summary, output: path.relative(root, publicRoot)}, null, 2));
