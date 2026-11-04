#!/usr/bin/env node
/**
 * Rewrite flagged storyboard semantic-fill rows into concrete production rows.
 *
 * This is deterministic and review-only. It updates storyboard/current props
 * and renderer props together so the storyboard table remains hash-bound.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-semantic-fill-rewrite-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const approvalPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-approval.json");
const auditPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-semantic-fill-row-audit-v1/report.json");

const gptArtwork = new Set(["H03-B02", "H10-B04", "H11-B02", "H11-B03"]);

const rowOverrides = {
  "H01-B01": ["typography-only", "filled-deterministic", "把“智能写作工作台”做成开场主标题：左侧大字，右侧只放淡线框工作台轮廓和一枚钴蓝光标点，不出现软件截图。", "本地 editable 大字先入场，vibe coding/工作台作为小号辅助词跟随，背景保持低密度纸纹，避免一开始就堆功能。"],
  "H01-B04": ["deterministic-semantic-stage", "filled-deterministic", "空白位置 -> 输入需求 -> 生成补段候选：突出“点击空白”这个入口动作，而不是泛泛的补段功能。", "先让正文中间露出一个空白插入口，再出现钴蓝输入光标，最后接出一张补段候选卡；不画真实编辑器界面。", "operation-flow"],
  "H02-B01": ["deterministic-semantic-stage", "filled-deterministic", "成稿进入演示模式：标题块、字号滑杆、速度滑杆、口播阅读区四个对象按顺序展开。", "先把成稿卡合拢成演示面板，再突出字号和速度两个可调滑杆，最后停在可读口播稿区域；所有控件为抽象符号。", "operation-flow"],
  "H02-B02": ["deterministic-semantic-stage", "filled-deterministic", "反问结构：左侧是“AI 直接写完全文”的大块输出，右侧是“我直接读”的空白人声位置，中间用问号/拉扯线表示疑问。", "ArgumentGrammarStage 使用 question 模式，两端文字块对冲，标题只保留“我直接读就好呢”，不生成真实 AI 界面。"],
  "H02-B03": ["deterministic-semantic-stage", "filled-deterministic", "把“AI 常常不说人话”拆成一个正常人声气泡和一块僵硬模板文本，形成语气不匹配的对照。", "ArgumentGrammarStage 使用 comparison/criteria 结构，保留可编辑大字，背景只画模板化段落纹理，不写可读假文本。"],
  "H02-B04": ["deterministic-semantic-stage", "filled-deterministic", "延续上一镜的问题球：模型进度线向前推进，但“不会说人话”的问题节点仍卡在原地。", "用因果链/时间线确定性图形表现“发展到今天仍未解决”，不需要官方模型证据卡。"],
  "H03-B01": ["typography-only", "filled-deterministic", "大字强调“通篇没重点”：一整块灰色段落纹理被压扁，只有少量钴蓝标记找不到落点。", "本地文字包装，段落纹理必须不可读，标题保持最大层级，表现读者抓不到重点。"],
  "H03-B02": ["gpt-editorial-artwork", "needs-artwork-generation", "抽象符号化无字概念图：一份看似完整的稿纸/机器产物中间露出空洞或错位线框骨架，用来承接“完成度很高的废稿”。", "生成 H-series 抽象符号化无字 16:9 PNG，禁止文字、假文件、人头、人脸、身体、手、肖像或角色化形象；导入后中文标题仍由本地排版覆盖。"],
  "H03-B03": ["deterministic-semantic-stage", "filled-deterministic", "把“以为是模型的问题”画成错误归因：一个问题标签先指向模型盒子，随后露出真正问题在写作流程里。", "ArgumentGrammarStage 使用反证/转向结构，箭头从模型盒子偏移到流程节点，不需要生成概念图。"],
  "H03-B04": ["deterministic-semantic-stage", "filled-deterministic", "多模型试验列表：GPT/Claude/Kimi/DeepSeek/智谱作为可编辑文字标签排成对照列，结论不是品牌评测而是“问题仍在”。", "用 deterministic comparison cards；只显示用户口述的模型名文字，不使用 logo，不合成官方证据卡。", "argument-grammar"],
  "H03-B05": ["deterministic-semantic-stage", "filled-deterministic", "中文更顺与问题未解决的双栏对照：左栏顺滑曲线，右栏问题节点仍亮着。", "ArgumentGrammarStage 做 comparison，避免把“国产模型”当证据卡；只表现主观体验与未解决问题。"],
  "H04-B01": ["typography-only", "filled-deterministic", "“查了一下研究”作为转场标题：大字旁边出现不可读论文纹理和放大镜，不展示假论文内容。", "文字包装加非证据研究纹理，提醒这里进入解释段，不伪造论文截图。"],
  "H04-B02": ["deterministic-semantic-stage", "filled-deterministic", "生成文字的默认路径：常见表达库 -> 稳妥选择器 -> 可复用句式输出，形成一条机械因果链。", "ArgumentGrammarStage 使用因果链；所有节点为抽象标签/图形，不说成真实研究证据。"],
  "H04-B03": ["typography-only", "filled-deterministic", "两个缺失项并列：不知道你讨厌的句式、也不知道读者方向，标题压在空白判断面板上。", "文字包装中保留两个可编辑短语，用钴蓝缺口标记缺失，不补无关配图。"],
  "H04-B04": ["deterministic-semantic-stage", "filled-deterministic", "材料不够、角度不清、泛泛而谈三段下滑链：前两项作为原因，最后落到空泛稿件。", "因果链结构图，三个节点依次显露，泛泛而谈节点最大，背景低密度避免遮挡。"],
  "H05-B01": ["deterministic-semantic-stage", "filled-deterministic", "材料 -> 角度 -> AI 动笔 的主流三步链：材料卡先进入，角度节点筛选，最后才到写作输出。", "先堆出材料卡，再用钴蓝分叉强调找角度，最后让输出稿纸出现；明确这是主流做法链路，不是产品界面。", "operation-flow"],
  "H05-B02": ["typography-only", "filled-deterministic", "把“这套动作固定在流程里”做成流程钉住的主标题：动作节点被钉进一条固定轨道。", "大字包装加少量流程轨道图形，不画真实产品界面。"],
  "H05-B03": ["deterministic-semantic-stage", "filled-deterministic", "Codex 后台编排流程：整理主线、读取风格库、调度写作任务三个节点，表现后台分工。", "OperationFlowStage 三卡片；Codex 作为文字标签即可，不使用 logo，也不生图。"],
  "H05-B04": ["deterministic-semantic-stage", "filled-deterministic", "收稿 -> 检查硬伤 -> 输出修改建议 的三段流程：成稿进入检查门，硬伤标记逐个亮起。", "先让成稿堆栈合拢，再进入抽象检查门，最后出现病句/逻辑/表达三个标记点；用确定性流程图，不生成概念插画。", "operation-flow"],
  "H05-B05": ["deterministic-semantic-stage", "filled-deterministic", "写作任务进入后先整理材料：散乱素材卡被归并成主线文件夹。", "ArchiveStructureStage/OperationFlowStage 混合：对象是材料卡，动作是整理，结果是主线堆栈。"],
  "H06-B01": ["deterministic-semantic-stage", "filled-deterministic", "API 调用链：Codex 编排节点 -> API 管道 -> DeepSeek 写全文节点，强调系统连接而非品牌证据。", "确定性流程图显示可编辑文字标签；不伪造 DeepSeek 官方界面或 logo。", "operation-flow"],
  "H06-B03": ["deterministic-semantic-stage", "filled-deterministic", "普通文档式编辑：正文块上出现添加和修改两个操作点，强调可直接改。", "OperationFlowStage 用文档块抽象图，不做假软件截图；标题放在左上安全区。"],
  "H07-B02": ["typography-only", "filled-deterministic", "“不会混到一起”用两个分离档案盒表现：不同文章进入不同隔间。", "文字包装加分隔线/档案盒图形，避免过度复杂。"],
  "H07-B03": ["typography-only", "filled-deterministic", "划选一句的示例：一条不可读正文线被钴蓝高亮框选，屏幕字强调“正在改变内容生产”。", "本地文字与高亮框动画，示例句可编辑显示，背景正文纹理不可读。"],
  "H07-B04": ["deterministic-semantic-stage", "filled-deterministic", "三个理由标签：句子太空、没动作、太枯燥，逐个盖章到同一句示例上。", "ArgumentGrammarStage 的 criteria-write 模式，三枚判断章依次出现。"],
  "H07-B06": ["deterministic-semantic-stage", "filled-deterministic", "下次再出现类似句子时的拦截流程：相似句子 -> Codex 拦下 -> 提醒修改/补充。", "OperationFlowStage 三卡片，Codex 只是编排节点文字，不需要证据卡。"],
  "H08-B01": ["deterministic-semantic-stage", "filled-deterministic", "喜欢句子的正向写回：被划选短句进入喜欢库，形成以后可调用的偏好条目。", "ArchiveStructureStage：划选框、喜欢标记、写回箭头、库条目。"],
  "H08-B04": ["deterministic-semantic-stage", "filled-deterministic", "两段之间的缺口 -> 空一行双击 -> 输入补充需求：突出“段落断层”而不是普通输入。", "先把两段正文拉开形成缺口，再让双击点落在空行中心，最后从缺口长出补充需求卡；背景正文保持不可读。", "operation-flow"],
  "H09-B02": ["typography-only", "filled-deterministic", "后台根据上下文给候选：大字旁边三张候选卡从同一上下文线分叉出来。", "文字包装加轻量分叉卡，不显示假后台 UI。"],
  "H09-B03": ["deterministic-semantic-stage", "filled-deterministic", "挑选最合适一段并放回正文：三张候选中一张被钴蓝选中，再回填到正文空位。", "OperationFlowStage：候选 -> 选择 -> 回填，使用选择路径动画。"],
  "H09-B04": ["deterministic-semantic-stage", "filled-deterministic", "点击收稿后的检查入口：正文堆栈合拢，进入硬伤检查门。", "OperationFlowStage 对象是成稿，动作是收稿，结果是检查门/清单。"],
  "H09-B05": ["deterministic-semantic-stage", "filled-deterministic", "全文检查清单：正文长条被扫描，病句/可优化/可修改三个标记点依次亮起。", "先让全文稿纸纵向铺开，再用扫描线扫过正文，最后把三个修改标记停在不同位置；不出现真实批注软件截图。", "operation-flow"],
  "H10-B01": ["deterministic-semantic-stage", "filled-deterministic", "演示模式：标题、字号滑杆、速度滑杆、口播稿阅读区四个抽象控件。", "确定性操作图，不画真实 UI；用大块控件符号说明字号和速度可调。"],
  "H10-B02": ["typography-only", "filled-deterministic", "总结动机：真实遇到的情况和不方便的地方并列，作为工作台逻辑来源。", "大字包装，两个来源词组用左右对照排版，不补图。"],
  "H10-B04": ["gpt-editorial-artwork", "needs-artwork-generation", "抽象符号化无字概念图：一个可控工作流机器旁仍有毛刺/噪声，表现不通顺、AI 味、不说人话仍会出现。", "生成 H-series 抽象符号化无字 16:9 PNG；不能出现文字、假界面、AI logo、人头、人脸、身体、手、肖像或角色化形象。"],
  "H11-B01": ["deterministic-semantic-stage", "filled-deterministic", "人修改这一关：机器输出停在左侧，人手/批注笔在右侧介入修改。", "ArgumentGrammarStage/OperationFlowStage 表现人工介入，不使用真实人物素材。"],
  "H11-B02": ["deterministic-semantic-stage", "filled-deterministic", "反复对话的混乱线团 -> 可控轨道 -> 稳定版本：表现系统避免推翻重来。", "先显示多条发散对话线，再让钴蓝轨道把它们收束进版本堆栈，最后停在一个稳定输出节点；用确定性结构图，不生成概念插画。", "archive-structure"],
  "H11-B03": ["gpt-editorial-artwork", "needs-artwork-generation", "抽象符号化无字概念图：多个方向箭头汇入一条带个人纹理的路径，表现文章走向自己的风格。", "生成 H-series 抽象符号化无字 16:9 PNG，钴蓝只标最终方向；禁止文字、人头、人脸、身体、手、肖像或角色化形象。"],
};

function cleanText(value = "", max = 80) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
}

function focusText(scene) {
  return cleanText(scene.storyboard?.visualFocusText || scene.presentation?.primary || scene.screenText || scene.beatId, 24);
}

function splitOperation(text, focus) {
  if (/划选|划一下|点击喜欢|标喜欢/u.test(text)) return ["句子", "划选/标记", /讨厌|喜欢库|风格库/u.test(text) ? "写入风格库" : "生成修改结果"];
  if (/点击空白|空一行|双击|输入/u.test(text)) return ["空白位置", "输入需求", "生成补段候选"];
  if (/补段|补充段落/u.test(text)) return ["上下文", "判断缺口", "补出新段落"];
  if (/保存|最新版|Ctrl|Command/u.test(text)) return ["正文版本", "保存", "进入历史版本"];
  if (/收稿|检查全文|病句|硬伤|优化/u.test(text)) return ["成稿", "检查", "给出修改建议"];
  if (/演示模式|字号|速度|口播/u.test(text)) return ["成稿", "打开演示模式", "可调口播稿"];
  if (/API|DeepSeek|Codex|后台编排|整理主线|读取/u.test(text)) return ["写作任务", "后台编排", "可执行写作链"];
  if (/放回正文|挑.*合适/u.test(text)) return ["候选段落", "选择", "回填正文"];
  if (/人去修改|修改这一关/u.test(text)) return ["机器输出", "人工修改", "可用成稿"];
  return [focus, "执行动作", "得到结果"];
}

function concreteHow(scene, route, stage, fillHow) {
  const text = cleanText(scene.screenText || "", 180);
  const focus = focusText(scene);
  const raw = cleanText(fillHow || "", 220);
  const namesComponent = /使用确定性语义组件|使用 typography packaging|OperationFlowStage|ArchiveStructureStage|ArgumentGrammarStage/u.test(raw);
  if (raw && !namesComponent) return raw;

  if (route === "typography-only") {
    return `先让“${focus}”以本地大字入场，再用低密度纸纹、钴蓝标记或分隔线辅助阅读，最后停在完整可读标题；不补无关插画。`;
  }

  if (route === "deterministic-semantic-stage") {
    if (stage === "operation-flow") {
      const [object, action, result] = splitOperation(text, focus);
      return `先显示“${object}”，再用钴蓝路径执行“${action}”，最后落到“${result}”；只画抽象流程块，不画真实软件界面。`;
    }
    if (stage === "archive-structure") {
      return `先把“${focus}”拆成可归档条目，再让条目进入文件夹/版本栏/喜欢库，最后用写回箭头说明它会影响后续写作。`;
    }
    if (stage === "argument-grammar") {
      return `先摆出“${focus}”的判断对象，再用对冲线、问题节点或盖章动作指出矛盾，最后把结论停在标题安全区。`;
    }
    return `先把“${focus}”转成一个对象关系，再用钴蓝路径标出动作方向，最后保留稳定阅读停顿。`;
  }

  if (route === "deterministic-with-verified-entity") {
    return `先确认“${focus}”是否需要真实来源，再绑定可验证素材；没有来源就降级为文字/结构表达，禁止假界面、假 logo 和假证据。`;
  }

  return raw || `围绕“${focus}”生成抽象符号化无字概念图，中文标题只由本地排版覆盖；禁止人头、人脸、身体、手、肖像或角色化形象。`;
}

function defaultOverride(scene, before = {}) {
  const text = cleanText(scene.screenText || "", 200);
  const focus = focusText(scene);
  const stage = before.semanticStageKind || scene.storyboard?.semanticDecision?.semanticStageKind || "typographic-packaging";
  const route = before.assetRoute
    || (stage === "typographic-packaging" ? "typography-only" : "deterministic-semantic-stage");
  const status = route === "gpt-editorial-artwork" ? "needs-artwork-generation" : "filled-deterministic";

  if (route === "typography-only") {
    return [
      route,
      status,
      `把“${focus}”做成这一镜的唯一主标题，旁边只放从原句抽出的低密度辅助纹理。`,
      concreteHow(scene, route, stage, ""),
      stage,
    ];
  }

  if (stage === "operation-flow") {
    const [object, action, result] = splitOperation(text, focus);
    return [
      route,
      status,
      `${object} -> ${action} -> ${result} 的三段分镜关系，突出这一句真实发生的操作。`,
      concreteHow(scene, route, stage, ""),
      stage,
    ];
  }

  if (stage === "archive-structure") {
    return [
      route,
      status,
      `围绕“${focus}”建立档案/版本/偏好库关系：条目进入分组，再写回后续写作。`,
      concreteHow(scene, route, stage, ""),
      stage,
    ];
  }

  if (stage === "argument-grammar") {
    return [
      route,
      status,
      `把“${focus}”画成一个判断关系：对象、矛盾点和结论三者清楚分开。`,
      concreteHow(scene, route, stage, ""),
      stage,
    ];
  }

  return [
    route,
    status,
    `围绕“${focus}”建立一个可读的语义关系，不复制上一镜模板。`,
    concreteHow(scene, route, stage, ""),
    stage,
  ];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function executionStepsFor(route) {
  if (route === "gpt-editorial-artwork") return ["按本行 fillWhat 生成抽象符号化无字 PNG", "导入并绑定 beatId", "检查无文字/无假证据/无 logo/无具象人物", "人工决定是否回填"];
  if (route === "deterministic-semantic-stage") return ["在语义组件中填入本行对象关系", "确认标题安全区不被主体遮挡", "生成当前 still", "若拥挤则改 layout 或降密度"];
  if (route === "deterministic-with-verified-entity") return ["查找真实来源或官方实体卡", "无来源则退回结构图/文字", "禁止假 logo 和假界面", "记录 provenance"];
  return ["确认屏幕字为最短焦点", "完成本地大字排版", "添加低密度语义辅助图形", "检查读时和断词"];
}

function rewriteProps(props, auditRows) {
  const badBeatIds = new Set(auditRows.filter((row) => row.status !== "PASS").map((row) => row.beatId));
  const applied = [];
  for (const scene of props.scenes || []) {
    const currentRoute = scene.storyboard?.semanticFill?.assetRoute;
    if (currentRoute && currentRoute !== "gpt-editorial-artwork" && (scene.storyboard?.artworkStatus || scene.storyboard?.artworkFile || scene.storyboard?.artworkPath || scene.storyboard?.artworkSha256)) {
      const beforeArtwork = {
        artworkStatus: scene.storyboard?.artworkStatus || null,
        artworkFile: scene.storyboard?.artworkFile || null,
      };
      scene.storyboard = {
        ...(scene.storyboard || {}),
        artworkStatus: "not-required",
        artworkFile: null,
        artworkPath: null,
        artworkSha256: null,
        artworkSource: null,
        artworkReviewOnly: false,
        rendererAdoptionAllowed: false,
        staleArtworkReconcile: {
          phaseId,
          decision: "cleared-non-gpt-route",
          reason: "semanticFill.assetRoute no longer requires generated artwork",
        },
      };
      applied.push({beatId: scene.beatId, kind: "clear-stale-artwork-for-non-gpt-route", before: beforeArtwork, after: {artworkStatus: "not-required", artworkFile: null}});
    }
    if (!badBeatIds.has(scene.beatId)) continue;
    const before = scene.storyboard?.semanticFill || null;
    const override = rowOverrides[scene.beatId] || defaultOverride(scene, before || {});
    if (!override) continue;
    const [assetRoute, status, fillWhat, fillHow, semanticStageKind] = override;
    const concreteFillHow = concreteHow(scene, assetRoute, semanticStageKind || before?.semanticStageKind, fillHow);
    const fill = {
      ...(before || {}),
      assetRoute,
      status,
      semanticStageKind: semanticStageKind || before?.semanticStageKind,
      fillWhat,
      fillHow: concreteFillHow,
      evidenceNeed: assetRoute === "deterministic-with-verified-entity" ? "verified-source-or-text-fallback" : assetRoute === "deterministic-semantic-stage" ? "none" : before?.evidenceNeed || "none",
      executionSteps: executionStepsFor(assetRoute),
      acceptance: [
        "中文必须是本地可编辑层",
        "画面主体不得遮挡可读标题",
        "不放假 UI / 假文件 / 假证据 / 假 logo",
        "本镜画面对象必须对应 fillWhat 中的具体关系",
      ],
      rewrite: {
        phaseId,
        reason: "semantic-fill-row-audit-flagged-mechanical-or-wrong-route",
      },
    };
    scene.storyboard = {
      ...(scene.storyboard || {}),
      semanticFill: fill,
      fillStatus: status,
      visualSource: assetRoute === "gpt-editorial-artwork" ? "generate" : "type",
    };
    applied.push({beatId: scene.beatId, kind: "semantic-fill-rewrite", before: before ? {assetRoute: before.assetRoute, status: before.status, fillWhat: before.fillWhat, fillHow: before.fillHow} : null, after: {assetRoute, status, fillWhat, fillHow: concreteFillHow}});
  }
  props.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: (props.scenes || []).map((scene) => [scene.beatId, scene.screenText, scene.storyboard?.semanticFill, scene.storyboard?.artworkStatus, scene.storyboard?.artworkFile]),
  })).digest("hex");
  return applied;
}

const audit = readJson(auditPath);
const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
  auditSha256: sha256File(auditPath),
};
const storyboardProps = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
const storyboardApplied = rewriteProps(storyboardProps, audit.rows || []);
const rendererApplied = rewriteProps(rendererProps, audit.rows || []);

if (storyboardApplied.length !== rendererApplied.length) throw new Error(`applied mismatch storyboard=${storyboardApplied.length} renderer=${rendererApplied.length}`);

writeJson(storyboardPropsPath, storyboardProps);
writeJson(rendererPropsPath, rendererProps);

const after = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};
const now = new Date().toISOString();

if (fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: after.storyboardPropsSha256,
  };
  manifest.reviewState = {
    ...(manifest.reviewState || {}),
    approvalInvalidatedAt: now,
    approvalInvalidationReason: "semantic-fill-row-rewrite-applied",
  };
  writeJson(manifestPath, manifest);
}

if (fs.existsSync(approvalPath)) {
  writeJson(approvalPath, {
    contract: "A1StoryboardApproval/v1",
    status: "INVALIDATED_BY_STORYBOARD_CHANGE",
    invalidatedAt: now,
    reason: "semantic-fill-row-rewrite-applied",
    before,
    after,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  });
}

const report = {
  contract: "A1StoryboardSemanticFillRewrite/v1",
  phaseId,
  status: "APPLIED_REVIEW_ONLY",
  generatedAt: now,
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    auditPath: rel(auditPath),
    storyboardPropsPath: rel(storyboardPropsPath),
    rendererPropsPath: rel(rendererPropsPath),
  },
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  appliedCount: storyboardApplied.length,
  applied: storyboardApplied,
  nextAction: "rerun-semantic-fill-row-audit-and-refresh-storyboard-queues",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);

console.log(JSON.stringify({
  status: report.status,
  appliedCount: report.appliedCount,
  after: report.after,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
