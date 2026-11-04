const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://localhost:4310";

const cases = [
  {
    id: "science-news",
    title: "火山监测新闻",
    sourceText: "Kilauea 山顶在喷发暂停后保持安静。第 40 次喷发结束后，破火山口下方出现小型地震群。这些地震群通常持续约半小时，震级大多低于 1.5 级。GPS 和倾斜仪数据显示浅部岩浆库仍在增压。但目前还没有形成清晰的岩浆通道。HVO 将继续密切监测。",
    expectedSlugs: ["title-split", "stat-counter", "quote-card"],
    expectedRoutes: [
      { contains: "半小时", role: "data-evidence", gateId: "instrument-data", slugPattern: /progress-bars|stat-counter/u },
      { contains: "GPS", role: "data-evidence", gateId: "instrument-data", slugPattern: /progress-bars|stat-counter/u },
      { contains: "还没有形成清晰", role: "turn", gateId: "uncertainty-claim", slugPattern: /quote-card/u },
    ],
  },
  {
    id: "product-update",
    title: "产品更新说明",
    sourceText: "新版本把导入流程缩短到 3 步。过去用户需要在 4 个页面之间切换，现在可以在一个工作台完成。数据看板显示试用转化率提升 18%。但企业客户仍担心权限配置是否足够清晰。下一步团队会优先完善审计日志和角色模板。",
    expectedSlugs: ["title-split", "progress-steps", "quote-card"],
    expectedRoutes: [
      { contains: "转化率提升 18%", role: "data-evidence", gateId: "instrument-data", slugPattern: /progress-bars|stat-counter/u },
      { contains: "担心权限", role: "turn", gateId: "uncertainty-claim", slugPattern: /quote-card/u },
    ],
  },
  {
    id: "market-report",
    title: "市场报告",
    sourceText: "今年上半年本地服务消费恢复更快。核心城市订单量增长 24%，但三线城市仍低于去年同期。地图分布显示新增需求集中在交通枢纽和社区商业区。平台可能需要在两种策略之间选择：继续补贴增长，或者提高履约效率。报告最后建议用分城市模型持续监测。",
    expectedSlugs: ["title-split", "image-zoom-reveal", "stat-counter"],
    expectedRoutes: [
      { contains: "订单量增长 24%", role: "data-evidence", gateId: "instrument-data", slugPattern: /progress-bars|stat-counter/u },
      { contains: "地图分布", role: "map-evidence", gateId: "map-evidence", slugPattern: /image-zoom-reveal|polaroid-frame/u },
      { contains: "两种策略", role: "comparison", gateId: "comparison-text", slugPattern: /comparison-chart|quote-card/u, requiredSlotKind: "text" },
    ],
  },
  {
    id: "map-number-priority",
    title: "地图数字优先级",
    sourceText: "本季度线下增长开始重新集中。城市热力图显示 300 个新增门店集中在轨道交通周边。图表显示客单价提升 12%。团队可能会在两种扩张策略之间选择：继续铺点，或者提高单店效率。管理层仍担心低线城市需求是否稳定。最后运营团队将继续监测分区表现。",
    expectedSlugs: ["title-split", "polaroid-frame", "stat-counter", "quote-card"],
    expectedRoutes: [
      { contains: "热力图显示 300", role: "map-evidence", gateId: "map-evidence", slugPattern: /image-zoom-reveal|polaroid-frame/u },
      { contains: "客单价提升 12%", role: "data-evidence", gateId: "instrument-data", slugPattern: /progress-bars|stat-counter/u },
      { contains: "两种扩张策略", role: "comparison", gateId: "comparison-text", slugPattern: /comparison-chart|quote-card/u, requiredSlotKind: "text" },
      { contains: "仍担心", role: "turn", gateId: "uncertainty-claim", slugPattern: /quote-card|lower-third/u },
    ],
  },
  {
    id: "abstract-strategy-comparison",
    title: "工具越多为什么反而更慢",
    sourceText: "团队同时使用六个协作工具，却仍然不断丢失上下文。一种方案是继续增加自动同步，另一种方案是减少入口并明确唯一记录位置。前者降低搬运成本，后者降低判断成本。短期看自动同步更快，长期看统一入口更稳定。真正的选择不是功能多少，而是谁负责维护共同事实。",
    expectedSlugs: ["title-split", "quote-card", "end-card"],
    expectedRoutes: [
      { contains: "一种方案", role: "comparison", gateId: "comparison-text", slugPattern: /comparison-chart|quote-card/u },
      { contains: "前者降低", role: "comparison", gateId: "comparison-text", slugPattern: /comparison-chart|quote-card/u },
      { contains: "短期看", role: "comparison", gateId: "comparison-text", slugPattern: /comparison-chart|quote-card/u },
    ],
    expectedMaxBeats: 5,
    allowTextOnly: true,
  },
  {
    id: "tutorial-operational-closing",
    title: "把研究报告变成演示稿",
    sourceText: "先通读报告，标出核心结论和证据。接着把结论按因果关系排序。然后为每一页选择一张能够证明观点的图表或截图。最后检查标题是否能独立表达判断，并删除重复说明。完成后的演示稿应该让观众先看到结论，再理解证据。",
    expectedSlugs: ["title-split", "progress-steps", "end-card"],
    expectedRoutes: [
      { contains: "接着把结论", role: "method", gateId: "method-flow", slugPattern: /progress-steps/u },
      { contains: "最后检查标题", role: "method", gateId: "method-flow", slugPattern: /progress-steps/u },
    ],
    expectedMaxBeats: 4,
    expectedMinBeats: 4,
    allowTextOnly: true,
    allowLinearMethodArc: true,
  },
  {
    id: "tutorial-terminal-action",
    title: "教程步骤",
    sourceText: "先确认文章要解决的问题。然后整理三组真实材料。接着把材料分配给开场、问题、方法和证据。再检查每一段如何承接上一段。发现断裂时回到论点链。最后导出完整影片。",
    expectedSlugs: ["title-split", "progress-steps", "end-card"],
    expectedRoutes: [],
    expectedMaxBeats: 6,
    expectedMinBeats: 4,
    allowTextOnly: true,
    allowLinearMethodArc: true,
  },
  {
    id: "unseen-forest-climate",
    title: "森林如何调节气候：三条机制与一组数据",
    sourceUrl: "https://www.forestry.gov.cn/lyj/1/sl/20260224/660513.html",
    sourceText: "森林不是静止的绿色背景，它通过能量、水分和碳循环持续调节气候。第一条机制来自林冠：树叶和枝干反射、吸收太阳辐射，让林下比裸露路面更凉。第二条机制是蒸腾，根系吸收的水分从叶片释放到空气中，既降低叶面温度，也增加局地湿度。第三条机制是蓄水，枯枝落叶和土壤像海绵一样截留降水，减缓地表径流，在暴雨后继续释放水分。森林还通过光合作用储存碳，但生态系统自身的呼吸也会排放碳，因此不能只看吸收量。世界森林总面积约为 41.4 亿公顷，这个数字说明森林是全球气候系统的重要基础设施，也说明保护效果必须依靠长期监测。真正有效的行动不是只种树，而是保护成熟森林、选择适合当地的树种，并持续检查水分、碳储量和生态质量。",
    expectedSlugs: ["title-split", "remocn-data-flow-pipes", "stat-counter", "end-card"],
    expectedRoutes: [
      { contains: "第二条机制是蒸腾", role: "evidence", gateId: "mechanism-process", slugPattern: /remocn-data-flow-pipes/u },
      { contains: "41.4 亿公顷", role: "data-evidence", gateId: "instrument-data", slugPattern: /progress-bars|stat-counter/u },
    ],
    expectedMinBeats: 6,
    expectedMaxBeats: 9,
  },
  {
    id: "official-health-fact-sheet",
    title: "气候变化如何影响健康",
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health",
    sourceText: "气候变化不是单一疾病，而是放大既有健康风险的乘数。全球已有约 36 亿人生活在高度易受气候影响的地区。2030 年到 2050 年之间，营养不良、疟疾、腹泻和热应激预计每年额外造成约 25 万人死亡。极端高温、洪水和野火会直接伤害健康，水和食物系统受损又会间接扩大疾病风险。脆弱地区贡献的排放更少，却承受更严重的健康后果。应对需要同时推进三件事：降低排放并改善空气质量，建设有气候韧性的卫生系统，以及建立针对高温和传染病的监测响应。最终目标不是只统计损失，而是把健康放进每一项气候决策。",
    expectedSlugs: ["title-split", "stat-counter", "progress-steps", "end-card"],
    expectedRoutes: [
      { contains: "36 亿人", role: "data-evidence", gateId: "instrument-data", slugPattern: /progress-bars|stat-counter/u },
      { contains: "三件事", role: "method", gateId: "method-flow", slugPattern: /progress-steps/u },
    ],
    expectedMinBeats: 6,
    expectedMaxBeats: 9,
  },
  {
    id: "official-product-feature-release",
    title: "苹果公布新一批辅助功能",
    sourceUrl: "https://www.apple.com/newsroom/2025/05/apple-unveils-powerful-accessibility-features-coming-later-this-year/",
    sourceText: "苹果公布了一组面向不同障碍用户的新辅助功能。辅助功能营养标签会在下载应用前说明它支持哪些能力。放大器增加新的阅读模式，帮助低视力用户读取和识别周围内容。盲文访问把设备变成更完整的盲文笔记工具。车辆运动提示利用屏幕上的动态圆点减少乘车时的感官冲突。这些功能分布在 App Store、iPhone、iPad、Mac 和 Apple Watch 上，但共同目标是让用户更独立地获取信息和控制设备。真正的产品更新不是堆叠功能名称，而是让每项能力对应一个明确的使用障碍。",
    expectedSlugs: ["title-split", "polaroid-frame", "end-card"],
    expectedRoutes: [
      { contains: "放大器增加", role: "evidence", gateId: "general-evidence", slugPattern: /image-zoom-reveal|polaroid-frame/u, requiredSlotKind: "image" },
      { contains: "盲文访问", role: "evidence", gateId: "general-evidence", slugPattern: /image-zoom-reveal|polaroid-frame/u, requiredSlotKind: "image" },
    ],
    expectedMinBeats: 5,
    expectedMaxBeats: 8,
    allowStraightEvidenceArc: true,
  },
  {
    id: "official-science-three-shifts",
    title: "人类活动正在改变全球水循环",
    sourceUrl: "https://www.nasa.gov/earth/nasa-scientists-find-new-human-caused-shifts-in-global-water-cycle/",
    sourceText: "NASA 科学家分析近 20 年观测后发现，全球水循环正以过去未见的方式变化，人类活动是主要驱动因素。研究把变化分成三类：第一类是长期趋势，例如地下水储量下降；第二类是季节节律改变，例如融雪提前；第三类是极端事件变化，例如百年一遇的洪水更频繁。团队综合使用 2003 年到 2020 年的降水、土壤湿度、陆地水储量和植被健康卫星数据。结果说明未来的地球系统模型必须纳入持续的人类影响。更多数据和更好的模型最终要帮助生产者与水资源管理者规划当地的新常态。",
    expectedSlugs: ["title-split", "remocn-data-flow-pipes", "progress-bars", "end-card"],
    expectedRoutes: [
      { contains: "变化分成三类", role: "evidence", gateId: "mechanism-process", slugPattern: /remocn-data-flow-pipes/u },
      { contains: "2003 年到 2020 年", role: "data-evidence", gateId: "instrument-data", slugPattern: /progress-bars|stat-counter/u },
    ],
    expectedMinBeats: 5,
    expectedMaxBeats: 8,
    allowStraightEvidenceArc: true,
  },
  {
    id: "english-opening-source-support",
    title: "辅助功能不是附加选项",
    sourceUrl: "https://www.apple.com/newsroom/2025/05/apple-unveils-powerful-accessibility-features-coming-later-this-year/",
    sourceText: "Apple 公布了即将推出的辅助功能。营养标签、放大器阅读模式和智能字幕，是三种不同的使用场景。它们不是附加选项，而是产品体验的一部分。",
    expectedSlugs: ["title-split", "end-card"],
    expectedRoutes: [],
    expectedMinBeats: 3,
    allowStraightEvidenceArc: true,
    allowTextOnly: true,
  },
  {
    id: "data-opening-source-support",
    title: "增长放缓不是需求消失",
    sourceText: "季度收入增长从 18% 降到 7%。这不是需求消失，而是获客成本和转化路径同时变化。报告建议先拆解渠道，再比较两种投放策略，最后回到复购质量。",
    expectedSlugs: ["title-split", "end-card"],
    expectedRoutes: [],
    expectedMinBeats: 3,
    allowStraightEvidenceArc: true,
    allowTextOnly: true,
  },
  {
    id: "quoted-contrast-and-role-assignment",
    title: "名单之后，真正困难的是什么",
    sourceText: "NASA 公布了四名主力宇航员。表面上，这是一次乘员名单发布。真正的变化是任务将演示飞船与测试着陆器的交会和对接。NASA 管理员说，这不是单一团队能完成的任务，而是美国创新与国际合作的共同测试。四名宇航员的角色也不是装饰：指挥官、飞行员与两名任务专家将从训练阶段开始参与飞船和着陆器测试。最后，任务的难点不在名单，而在把多套系统真正接上。",
    expectedSlugs: ["title-split", "quote-card", "animated-list", "end-card"],
    expectedRoutes: [
      { contains: "一次乘员名单", role: "context", gateId: "abstract-claim", slugPattern: /title-split|quote-card|text-highlight/u, requiredSlotKind: "text" },
      { contains: "真正的变化", role: "evidence", gateId: "abstract-claim", slugPattern: /title-split|quote-card/u, requiredSlotKind: "text" },
      { contains: "这不是单一团队", role: "comparison", gateId: "comparison-text", slugPattern: /comparison-chart|quote-card/u, requiredSlotKind: "text" },
      { contains: "指挥官、飞行员", role: "roles", gateId: "role-allocation", slugPattern: /animated-list/u, requiredSlotKind: "text" },
    ],
    expectedMinBeats: 6,
    expectedMaxBeats: 6,
    allowTextOnly: true,
  },
  {
    id: "official-entity-opening-evidence",
    title: "阿耳忒弥斯 III 任务",
    sourceUrl: "https://www.nasa.gov/news-release/nasa-marches-toward-artemis-iii-mission-in-2027-names-crew-members/",
    sourceText: "NASA 公布了阿耳忒弥斯 III 任务的四名主力宇航员。相比阿耳忒弥斯 II 绕月验证，阿耳忒弥斯 III 还要把火箭、飞船、着陆器、软件、推进和通信放进同一套协作系统。最后，任务的难点不在名单，而在把多套系统真正接上。",
    expectedSlugs: ["image-zoom-reveal", "remocn-data-flow-pipes", "end-card"],
    expectedRoutes: [
      { contains: "四名主力宇航员", role: "setup", gateId: "general-evidence", slugPattern: /image-zoom-reveal|polaroid-frame/u, requiredSlotKind: "image" },
      { contains: "相比阿耳忒弥斯 II", role: "comparison", gateId: "mechanism-process", slugPattern: /remocn-data-flow-pipes/u, requiredSlotKind: "multi-image" },
    ],
    expectedMinBeats: 3,
    expectedMaxBeats: 3,
    allowStraightEvidenceArc: true,
    allowSourceOpeningEvidence: true,
  },
  {
    id: "semantic-paragraph-boundaries",
    title: "为什么更多提醒没有解决协作遗漏",
    sourceText: "团队每天收到很多提醒。大家仍然错过关键决定。\n提醒数量增长了 40%，遗漏率却没有下降。这个数据说明问题不在通知数量。\n一种做法是继续增加提醒，另一种做法是建立唯一决策记录。前者增加注意力成本，后者减少查找路径。\n先指定唯一记录位置。然后让每次会议只回写结论和负责人。\n真正需要优化的不是提醒速度，而是共同事实的归属。",
    expectedSlugs: ["title-split", "stat-counter", "end-card"],
    expectedRoutes: [
      { contains: "增长了 40%", role: "data-evidence", gateId: "instrument-data", slugPattern: /stat-counter|progress-bars/u },
      { contains: "一种做法", role: "comparison", gateId: "comparison-text", slugPattern: /comparison-chart|quote-card/u },
    ],
    expectedMinBeats: 5,
    expectedMaxBeats: 8,
    requireSemanticUnderstanding: true,
  },
  {
    id: "long-opinion-grouping",
    title: "为什么 AI 写作不能只改提示词",
    sourceText: "很多人以为中文稿有 AI 味，只是提示词写得不够好。真正用下来，问题往往出在写作之前没有建立判断。模型拿到的只有主题，没有材料，也不知道读者会卡在哪里。结果就是每句话都正确，但整篇文章没有推进。更可靠的做法，是先明确文章要解决的矛盾。接着整理事实、案例和反例。然后把这些材料分配给开场、问题、方法和证据段落。Codex 负责后台编排，Kimi 负责把语言写顺，DeepSeek 负责检查细节。模型开始动笔之后，还要检查每一段是否承接上一段。发现断裂时，应当回到论点链，而不是继续添加修辞。最后留下来的不应该是一篇临时拼接的稿子。它应该是一套可以反复复用的写作流程。",
    expectedSlugs: ["title-split"],
    expectedRoutes: [],
    expectedMaxBeats: 8,
    allowTextOnly: true,
  },
  {
    id: "source-page-evidence-image",
    title: "产品更新证据",
    sourceUrl: "https://example.com/product-update",
    sourceText: "这次更新先解决了导入时找不到下一步的问题。官方页面展示了新的分步导入界面，并说明用户可以在同一处完成校验和提交。最后团队会继续收集无障碍用户的反馈。",
    assets: [{
      id: "scene-02-source-page",
      parentId: "scene-02",
      adopted: true,
      source: "source-page-screenshot",
      sourceUrl: "https://example.com/product-update",
      imageUrl: "http://localhost:4288/assets/cache/product-update.png",
      sourceQualityTier: "source-page",
      sourceQualityLabel: "来源页面截图",
    }],
    expectedRoutes: [
      { contains: "官方页面展示", role: "evidence", gateId: "general-evidence", slugPattern: /image-zoom-reveal|polaroid-frame|split-screen/u, requiredSlotKind: "image" },
    ],
    expectedSlugs: ["title-split", "polaroid-frame", "end-card"],
    expectedMinBeats: 3,
    allowStraightEvidenceArc: true,
    allowTextOnly: true,
    expectSourcePageMaterial: true,
  },
  {
    id: "comparison-material-threshold",
    title: "城市更新前后对比",
    sourceUrl: "https://example.com/city-renewal",
    sourceText: "城市更新不只是把旧建筑换成新外立面。改造前后的入口、公共座椅和夜间照明呈现出明显变化。最后方案需要回到居民是否愿意停留这个判断。",
    assets: [
      { id: "scene-02-before", parentId: "scene-02", adopted: true, source: "source-page-screenshot", sourceUrl: "https://example.com/city-renewal", imageUrl: "http://localhost:4288/assets/cache/city-before.png" },
      { id: "scene-02-after", parentId: "scene-02", adopted: true, source: "source-page-screenshot", sourceUrl: "https://example.com/city-renewal", imageUrl: "http://localhost:4288/assets/cache/city-after.png" },
    ],
    expectedSlugs: ["title-split", "image-carousel", "end-card"],
    expectedRoutes: [],
    expectedMinBeats: 3,
    allowStraightEvidenceArc: true,
    allowTextOnly: true,
    expectComparisonFallback: true,
  },
  {
    id: "comparison-material-promotion",
    title: "城市更新前后对比",
    sourceUrl: "https://example.com/city-renewal",
    sourceText: "城市更新不只是把旧建筑换成新外立面。改造前后的入口、公共座椅和夜间照明呈现出明显变化。最后方案需要回到居民是否愿意停留这个判断。",
    assets: [
      { id: "scene-02-before", parentId: "scene-02", adopted: true, source: "source-page-screenshot", sourceUrl: "https://example.com/city-renewal", imageUrl: "http://localhost:4288/assets/cache/city-before.png" },
      { id: "scene-02-after", parentId: "scene-02", adopted: true, source: "source-page-screenshot", sourceUrl: "https://example.com/city-renewal", imageUrl: "http://localhost:4288/assets/cache/city-after.png" },
      { id: "scene-02-night", parentId: "scene-02", adopted: true, source: "source-page-screenshot", sourceUrl: "https://example.com/city-renewal", imageUrl: "http://localhost:4288/assets/cache/city-night.png" },
    ],
    expectedSlugs: ["title-split", "image-carousel", "end-card"],
    expectedRoutes: [],
    expectedMinBeats: 3,
    allowStraightEvidenceArc: true,
    allowTextOnly: true,
    expectComparisonPromotion: true,
  },
];

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

// This audit predates the source-bound RVE adapters. Keep testing the
// narrative job, but accept the current mature source template when it
// replaces an older equivalent layout.
function plannedSlugSatisfies(expected, actual) {
  const equivalents = {
    "title-split": ["title-split", "cinematic-title-intro"],
    "quote-card": ["quote-card", "comparison-chart"],
    "polaroid-frame": ["polaroid-frame", "image-zoom-reveal", "split-screen"],
  };
  return (equivalents[expected] || [expected]).includes(actual);
}

const failures = [];
const summaries = [];
const semanticMotionCoverage = new Map();

for (const item of cases) {
  const response = await fetch(`${rootUrl}/api/a1-compile-template-timeline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: item.title, sourceText: item.sourceText, sourceUrl: item.sourceUrl || "", assets: item.assets || [] }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    failures.push(`${item.id}: compiler API failed ${response.status}: ${JSON.stringify(payload)}`);
    continue;
  }
  const beats = payload.beats || [];
  const props = payload.props || {};
  const slugs = (props.items || []).map((timelineItem) => timelineItem.selectedSlug);
  const plannedSlugs = beats.map((beat) => beat.templateSelection?.selectedSlug || beat.selectedSlug);
  const gateIds = beats.map((beat) => beat.gateId);
  const selections = beats.map((beat) => beat.templateSelection);
  summaries.push({
    id: item.id,
    beatCount: beats.length,
    slugs,
    plannedSlugs,
    gateIds,
    selectionContracts: selections.map((selection) => selection?.contract || ""),
  });

  assert(payload.compilerContract === "A1ArticleTemplateCompiler/v1", `${item.id}: wrong compiler contract`, failures);
  const understanding = payload.articleUnderstanding;
  assert(understanding?.contract === "A1ArticleUnderstanding/v1", `${item.id}: missing article understanding contract`, failures);
  assert(understanding?.analyzerMode === "deterministic-local-v1", `${item.id}: wrong analyzer mode`, failures);
  assert(understanding?.coverage?.exact === true, `${item.id}: article understanding coverage is not exact`, failures);
  assert(understanding?.coverage?.missingSentenceIds?.length === 0, `${item.id}: missing sentence coverage`, failures);
  assert(understanding?.coverage?.duplicateSentenceIds?.length === 0, `${item.id}: duplicate sentence coverage`, failures);
  assert(understanding?.sections?.every((section) => section.groupingReason && section.memberSentenceIds?.length && section.dominantFunction && section.relationFromPrevious && section.confidence > 0), `${item.id}: section reasoning is incomplete`, failures);
  assert(payload.articleFilmPlan?.contract === "A1ArticleFilmPlan/v1", `${item.id}: missing article film plan`, failures);
  assert(payload.articleFilmPlan?.quality?.connected === true, `${item.id}: article film plan should be connected`, failures);
  assert(props.contract === "A1ArticleTemplateTimeline/v1", `${item.id}: missing template timeline contract`, failures);
  assert(beats.length >= (item.expectedMinBeats || 5), `${item.id}: expected at least ${item.expectedMinBeats || 5} beats, got ${beats.length}`, failures);
  assert(beats[0]?.screenTitle === item.title, `${item.id}: opening shot should use the supplied article title, got ${beats[0]?.screenTitle || ""}`, failures);
  if (item.expectedMaxBeats) {
    assert(beats.length <= item.expectedMaxBeats, `${item.id}: related sentences should group into at most ${item.expectedMaxBeats} beats, got ${beats.length}`, failures);
  }
  assert((props.items || []).length === beats.length, `${item.id}: timeline item count should match beat count`, failures);
  assert((props.items || []).filter((timelineItem) => timelineItem.selectedSlug === "title-split").every((timelineItem) => {
    const bottom = String(timelineItem.templateProps?.bottomText || "").replace(/\s+/g, "").trim();
    return Array.from(bottom).length >= 2 && !/^(AI|GPT|UI|UX|的|了|是|把|给|让|从|到|和|但|而|或|在|才|再|先|后)$/iu.test(bottom);
  }), `${item.id}: title-split produced an orphan bottom line`, failures);
  if (!item.allowTextOnly) assert(new Set(slugs).size >= 3, `${item.id}: expected diversified templates, got ${slugs.join(",")}`, failures);
  for (const slug of item.expectedSlugs) {
    assert(plannedSlugs.some((actual) => plannedSlugSatisfies(slug, actual)), `${item.id}: expected planned slug ${slug}, got ${plannedSlugs.join(",")}; runtime ${slugs.join(",")}`, failures);
  }
  if (!item.allowSourceOpeningEvidence) {
    assert(gateIds.includes("opening-title"), `${item.id}: missing opening-title gate`, failures);
  }
  if (!item.allowTextOnly) assert(gateIds.some((gateId) => gateId === "instrument-data" || gateId === "map-evidence" || gateId === "general-evidence" || gateId === "mechanism-process"), `${item.id}: missing evidence/data/map gate`, failures);
  if (!item.allowLinearMethodArc && !item.allowStraightEvidenceArc) assert(gateIds.some((gateId) => gateId === "uncertainty-claim" || gateId === "comparison-text" || gateId === "comparison-multi-image" || gateId === "role-allocation"), `${item.id}: missing turn/comparison/roles gate`, failures);
  assert(gateIds.some((gateId) => gateId === "closing-title" || gateId === "terminal-closing"), `${item.id}: missing closing gate`, failures);
  assert(!(props.items || []).some((timelineItem) => /USGS HVO/u.test(JSON.stringify(timelineItem)) && item.id !== "science-news"), `${item.id}: generic article should not inherit USGS evidence labels`, failures);
  assert(!(props.items || []).some((timelineItem) => /https:\/\/www\.usgs\.gov\//u.test(JSON.stringify(timelineItem)) && item.id !== "science-news"), `${item.id}: generic article should not inherit USGS source URLs or official media`, failures);
  for (const expectation of item.expectedRoutes || []) {
    const beat = beats.find((candidate) => String(candidate.sourceSentence || "").includes(expectation.contains));
    assert(Boolean(beat), `${item.id}: missing expected sentence containing ${expectation.contains}`, failures);
    if (beat) {
      assert(beat.narrativeRole === expectation.role, `${item.id}/${expectation.contains}: expected role ${expectation.role}, got ${beat.narrativeRole}`, failures);
      assert(beat.gateId === expectation.gateId, `${item.id}/${expectation.contains}: expected gate ${expectation.gateId}, got ${beat.gateId}`, failures);
      const plannedSlug = beat.templateSelection?.selectedSlug || beat.selectedSlug;
      assert(expectation.slugPattern.test(plannedSlug), `${item.id}/${expectation.contains}: expected planned slug ${expectation.slugPattern}, got ${plannedSlug}; runtime ${beat.selectedSlug}`, failures);
      if (expectation.requiredSlotKind) {
        assert(beat.templateSelection?.materialStrategy?.requiredSlotKind === expectation.requiredSlotKind, `${item.id}/${expectation.contains}: expected ${expectation.requiredSlotKind} material strategy, got ${beat.templateSelection?.materialStrategy?.requiredSlotKind}`, failures);
      }
    }
  }
  for (const [index, beat] of beats.entries()) {
    const selection = beat.templateSelection || {};
    const timelineSelection = props.items?.[index]?.templateProps?.templateSelection || {};
    assert(selection.contract === "A1TemplateSelectionPlan/v1", `${item.id}/${beat.id}: missing template selection plan`, failures);
    assert(selection.selectedTemplateId === beat.selectedTemplateId, `${item.id}/${beat.id}: selection plan does not match selected template`, failures);
    assert(Array.isArray(selection.candidates) && selection.candidates.length >= 1, `${item.id}/${beat.id}: selection plan missing candidates`, failures);
    assert(selection.candidates.some((candidate) => candidate.decision === "selected" && candidate.templateId === beat.selectedTemplateId), `${item.id}/${beat.id}: selected candidate missing from plan`, failures);
    assert(selection.candidates.every((candidate) => Array.isArray(candidate.rejectIf) && candidate.rejectIf.length > 0), `${item.id}/${beat.id}: candidate reject rules missing`, failures);
    assert(selection.materialStrategy?.contract === "A1TemplateMaterialStrategy/v1", `${item.id}/${beat.id}: material strategy missing`, failures);
    assert(Array.isArray(selection.materialStrategy?.sourcePriority) && selection.materialStrategy.sourcePriority.length > 0, `${item.id}/${beat.id}: source priority missing`, failures);
    assert(timelineSelection.contract === "A1TemplateSelectionPlan/v1", `${item.id}/${beat.id}: timeline props missing template selection`, failures);
    assert(beat.article?.contract === "A1ArticleSpine/v1", `${item.id}/${beat.id}: missing article assignment`, failures);
    assert(beat.narrative?.contract === "A1NarrativeSpine/v1", `${item.id}/${beat.id}: missing narrative assignment`, failures);
    assert(beat.filmBridge?.contract === "A1FilmBridge/v1", `${item.id}/${beat.id}: missing film bridge`, failures);
    assert(beat.motionPlan?.contract === "A1MotionPlan/v1", `${item.id}/${beat.id}: missing motion plan`, failures);
    assert(Boolean(beat.filmBridge?.continuityCue), `${item.id}/${beat.id}: continuity cue is empty`, failures);
    assert(timelineSelection.runtimeSelectedSlug === props.items?.[index]?.selectedSlug, `${item.id}/${beat.id}: runtime selected slug missing or mismatched`, failures);
    const beatPlan = props.items?.[index]?.templateProps?.motionBeatPlan;
    assert(beatPlan?.contract === "A1ShotMotionBeatPlan/v1", `${item.id}/${beat.id}: missing internal motion beat plan`, failures);
    assert(Array.isArray(beatPlan?.beats) && beatPlan.beats.length >= 3, `${item.id}/${beat.id}: each main shot needs at least three internal beats`, failures);
    assert(beatPlan?.beats?.[0]?.role === "establish" && beatPlan?.beats?.at(-1)?.role === "bridge", `${item.id}/${beat.id}: internal beats must establish then bridge`, failures);
    assert(beatPlan?.beats?.[1]?.role === "focus" && beatPlan?.semanticRole, `${item.id}/${beat.id}: shared focus timing and semantic role are both required`, failures);
    assert(beatPlan?.semanticMotion?.focusAction && beatPlan?.semanticMotion?.resolveAction && beatPlan?.semanticMotion?.bridgeAction, `${item.id}/${beat.id}: semantic role must compile into executable focus, resolve, and bridge actions`, failures);
    if (props.items?.[index]?.selectedSlug === "progress-steps") {
      const stepItems = props.items?.[index]?.templateProps?.stepItems || [];
      assert(stepItems.every((step) => !/[.…]{2,}/u.test(String(step.text || ""))), `${item.id}/${beat.id}: method steps must not be truncated source sentences`, failures);
    }
    const semanticRole = String(beatPlan?.semanticRole || "");
    if (semanticRole) {
      const entry = semanticMotionCoverage.get(semanticRole) || { slugs: new Set(), actions: new Set() };
      entry.slugs.add(props.items?.[index]?.selectedSlug || "");
      entry.actions.add(beatPlan?.semanticMotion?.focusAction || "");
      semanticMotionCoverage.set(semanticRole, entry);
    }
    if (timelineSelection.runtimeFallbackApplied) {
      assert(Boolean(timelineSelection.runtimeFallbackReason), `${item.id}/${beat.id}: runtime fallback missing reason`, failures);
      assert(timelineSelection.runtimeSelectedSlug !== timelineSelection.selectedSlug, `${item.id}/${beat.id}: fallback flag set without slug change`, failures);
    }
  }
  if (item.id !== "science-news") {
    const genericJson = JSON.stringify({ beats, props });
    assert(!/Kilauea|Halemaumau|volcano-map|seismic-dots|monitoring-strokes|USGS HVO/iu.test(genericJson), `${item.id}: generic article leaked curated Volcano Watch direction`, failures);
  }
  if (item.id === "semantic-paragraph-boundaries") {
    const understandingSections = understanding?.sections || [];
    const groupingReasons = new Set(understandingSections.map((section) => section.groupingReason));
    assert(groupingReasons.size >= 4, `${item.id}: semantic grouping needs diverse reasons, got ${[...groupingReasons].join(",")}`, failures);
    assert(understandingSections.some((section) => section.groupingReason.includes("paragraph")), `${item.id}: paragraph boundaries are not represented`, failures);
    assert(understandingSections.some((section) => section.dominantFunction === "method"), `${item.id}: method section is missing`, failures);
    assert(!understandingSections.some((section) => section.groupingReason === "positional-body-bucket"), `${item.id}: fixed positional buckets must be removed`, failures);
  }
  if (item.id === "long-opinion-grouping") {
    const closingShots = payload.state?.shots?.filter((shot) => shot.role === "收束") || [];
    const closingItems = closingShots.map((shot) => (props.items || []).find((timelineItem) => timelineItem.id === `shot-${shot.id}`));
    const recapItem = (props.items || []).at(-2);
    const closingItem = closingItems[0];
    assert(closingShots.length === 1, `${item.id}: only the final sentence may be the closing beat`, failures);
    assert(recapItem?.selectedSlug === "quote-card" && recapItem?.narrative?.storyRole === "proof", `${item.id}: penultimate claim must recap through Quote Card`, failures);
    assert(closingShots[0]?.template === "rve-end-card" && closingItem?.selectedSlug === "end-card", `${item.id}: terminal closing must use End Card`, failures);
    assert(closingItem?.templateProps?.closingHoldContract === "A1ClosingHoldAdapter/v1", `${item.id}: terminal closing missing closing-hold adapter contract`, failures);
    assert(closingItem?.templateProps?.closingTitle === "可反复复用的写作流程", `${item.id}: terminal title must be source-derived`, failures);
    assert(closingItem?.templateProps?.closingSupport === "它应该是一套可以反复复用的写作流程", `${item.id}: terminal support must preserve the source conclusion`, failures);
    assert(closingItem?.templateProps?.closingLayout?.contract === "A1ClosingHoldLayout/v1", `${item.id}: terminal closing missing layout contract`, failures);
    assert(closingItem?.durationSec >= 3.8, `${item.id}: terminal conclusion needs a readable final hold`, failures);
    assert(closingItem?.assetSlotPlan?.slotKind === "text" && closingItem?.assetSlotPlan?.status === "not-needed", `${item.id}: terminal closing must not request image material`, failures);
    assert(closingItem?.materialRouteDecision?.decision === "text-first-no-image", `${item.id}: terminal closing must use text-first material route`, failures);
    assert(!/Thanks for Watching|Subscribe for More|STUDIO CREATIVE/iu.test(JSON.stringify(closingItem)), `${item.id}: terminal adapter leaked RVE sample CTA copy`, failures);
    assert(gateIds.includes("terminal-closing"), `${item.id}: terminal-closing gate is missing`, failures);
    const problemItem = (props.items || []).find((timelineItem) => timelineItem.motionPlan?.layers?.includes("problem-contrast"));
    const contrast = problemItem?.templateProps?.problemContrast;
    assert(problemItem?.article?.contract === "A1ArticleSpine/v1", `${item.id}: timeline problem item missing article contract`, failures);
    assert(problemItem?.narrative?.contract === "A1NarrativeSpine/v1", `${item.id}: timeline problem item missing narrative contract`, failures);
    assert(problemItem?.narrative?.storyRole === "problem", `${item.id}: problem contrast item must retain planner role`, failures);
    assert(Boolean(contrast?.left && contrast?.right && contrast?.bridge), `${item.id}: problem beat must fill RVE contrast slots`, failures);
    assert(problemItem?.templateProps?.quote?.includes(contrast?.left || ""), `${item.id}: left contrast phrase must come from the current article shot`, failures);
    assert(problemItem?.templateProps?.quote?.includes(contrast?.right || ""), `${item.id}: right contrast phrase must come from the current article shot`, failures);
    assert(problemItem?.templateProps?.quote?.includes(contrast?.bridge || ""), `${item.id}: contrast bridge must come from the current article shot`, failures);
    const methodItem = (props.items || []).find((timelineItem) => (timelineItem.templateProps?.stepItems || []).some((step) => String(step.text || "").includes("开场、问题、方法")));
    assert(methodItem?.narrative?.storyRole === "method", `${item.id}: method beat containing the word 问题 must not be reclassified`, failures);
    const methodShot = payload.state?.shots?.find((shot) => String(shot.source || "").includes("开场、问题、方法"));
    const methodShots = payload.state?.shots?.filter((shot) => shot.role === "方法") || [];
    const rolesShot = payload.state?.shots?.find((shot) => /Codex.+Kimi.+DeepSeek/u.test(String(shot.source || "")));
    assert(methodShot?.role === "方法", `${item.id}: workbench method shot must use planner role label`, failures);
    assert(methodShots.length === 3, `${item.id}: expected three planner-owned method shots`, failures);
    assert(methodShots.every((shot) => shot.template === "rve-progress-steps"), `${item.id}: every method shot must select mature progress-steps adapter`, failures);
    const methodItems = methodShots.map((shot) => (props.items || []).find((timelineItem) => timelineItem.id === `shot-${shot.id}`));
    assert(methodItems.every((timelineItem) => timelineItem?.selectedSlug === "progress-steps"), `${item.id}: method timeline items must render progress-steps`, failures);
    assert(methodItems.every((timelineItem) => timelineItem?.templateProps?.methodFlowContract === "A1MethodFlowAdapter/v1"), `${item.id}: method items missing method-flow adapter contract`, failures);
    assert(methodItems.every((timelineItem) => timelineItem?.templateProps?.methodLayout?.contract === "A1MethodFlowLayout/v1"), `${item.id}: method items missing layout contract`, failures);
    assert(methodItems.every((timelineItem) => timelineItem?.templateProps?.methodLayout?.titleColumnWidthPx >= 420 && timelineItem?.templateProps?.methodLayout?.titleWhiteSpace === "normal"), `${item.id}: method titles need a bounded readable column`, failures);
    assert(methodItems.every((timelineItem) => timelineItem?.assetSlotPlan?.slotKind === "text" && timelineItem?.assetSlotPlan?.status === "not-needed"), `${item.id}: method-flow must not request image material`, failures);
    assert(methodItems.every((timelineItem) => timelineItem?.materialRouteDecision?.decision === "text-first-no-image"), `${item.id}: method-flow must use text-first material route`, failures);
    assert(methodItems.map((timelineItem) => timelineItem?.templateProps?.actionTitle).join("/") === "明确文章矛盾/整理并分配材料/应当回到论点链", `${item.id}: method action titles must be source-derived`, failures);
    assert(JSON.stringify(methodItems[0]?.templateProps?.stepItems?.map((step) => step.text)) === JSON.stringify(["每句话都正确，但整篇文章没有推进", "先明确文章要解决的矛盾"]), `${item.id}: first method steps are wrong`, failures);
    assert(JSON.stringify(methodItems[1]?.templateProps?.stepItems?.map((step) => step.text)) === JSON.stringify(["整理事实、案例和反例", "把这些材料分配给开场、问题、方法和证据段落"]), `${item.id}: second method steps are wrong`, failures);
    assert(rolesShot?.role === "分工", `${item.id}: workbench roles shot must use planner role label`, failures);
    const rolesItem = (props.items || []).find((timelineItem) => timelineItem.id === `shot-${rolesShot?.id}`);
    assert(rolesShot?.template === "rve-animated-list", `${item.id}: roles shot must select mature animated-list adapter`, failures);
    assert(rolesItem?.selectedSlug === "animated-list", `${item.id}: roles timeline item must render animated-list, got ${rolesItem?.selectedSlug || "missing"}`, failures);
    assert(rolesItem?.templateProps?.roleGridContract === "A1RoleGridAdapter/v1", `${item.id}: roles item missing role-grid adapter contract`, failures);
    assert(rolesItem?.templateProps?.transitionPlan?.mode === "role-handoff", `${item.id}: roles item must receive the incoming role-handoff transition`, failures);
    assert(rolesItem?.assetSlotPlan?.slotKind === "text" && rolesItem?.assetSlotPlan?.status === "not-needed", `${item.id}: role-grid must not request image material`, failures);
    assert(rolesItem?.materialRouteDecision?.decision === "text-first-no-image", `${item.id}: role-grid must use text-first material route`, failures);
    assert(rolesShot?.visual === "角色分工" && rolesShot?.assetNeed === "文字角色", `${item.id}: roles shot semantics must stay structural rather than evidence-image`, failures);
    assert(rolesItem?.templateProps?.groupTitle === "模型分工", `${item.id}: roles title must describe the group`, failures);
    assert(rolesItem?.templateProps?.roleRows?.map((row) => row.name).join("/") === "Codex/Kimi/DeepSeek", `${item.id}: role names must be source-derived`, failures);
    assert(rolesItem?.templateProps?.roleRows?.map((row) => row.task).join("/") === "后台编排/把语言写顺/检查细节", `${item.id}: role tasks must be source-derived`, failures);
    assert(rolesItem?.templateProps?.roleRows?.every((row) => row.iconKey && row.iconStatus === "verified-local"), `${item.id}: known roles must use verified local marks`, failures);
    const ordinaryQuoteItems = (props.items || []).filter((timelineItem) => timelineItem.selectedSlug === "quote-card" && !timelineItem.templateProps?.problemContrast);
    assert(ordinaryQuoteItems.every((timelineItem) => timelineItem.templateProps?.quoteLayout === "title-support"), `${item.id}: ordinary quote cards must use title-support layout`, failures);
    const transitionModes = (props.items || []).map((timelineItem) => timelineItem.transitionPlan?.mode || "missing");
    assert((props.items || []).every((timelineItem) => timelineItem.transitionPlan?.contract === "A1RelationTransitionPlan/v1"), `${item.id}: every timeline edge needs a relation transition plan`, failures);
    assert(JSON.stringify(transitionModes) === JSON.stringify(["contrast-wipe", "line-handoff", "line-handoff", "role-handoff", "hard-cut", "hard-cut", "quiet-fade", "hard-cut"]), `${item.id}: unexpected transition modes ${transitionModes.join(",")}`, failures);
    assert(!/SIGNAL OBSERVED|PATH NOT CONFIRMED|\bBUT\b/u.test(JSON.stringify(problemItem)), `${item.id}: contrast adapter leaked hard-coded English labels`, failures);
  }
  if (item.id === "tutorial-operational-closing") {
    const methodItems = (props.items || []).filter((timelineItem) => timelineItem.narrative?.storyRole === "method");
    assert(JSON.stringify(payload.articleFilmPlan?.roleArc) === JSON.stringify(["setup", "method", "method", "closing"]), `${item.id}: tutorial role arc must stay operational until the real outcome`, failures);
    assert(methodItems.length === 2 && methodItems.every((timelineItem) => timelineItem.selectedSlug === "progress-steps"), `${item.id}: tutorial method beats must use Progress Steps`, failures);
    assert(methodItems.every((timelineItem) => (timelineItem.templateProps?.stepItems || []).length >= 2), `${item.id}: each tutorial method beat needs two source-derived steps`, failures);
    assert(methodItems.map((timelineItem) => timelineItem.templateProps?.actionTitle).join("/") === "建立论证顺序/校准标题与说明", `${item.id}: tutorial method titles must be concise source-derived actions`, failures);
    const closingItem = (props.items || []).find((timelineItem) => timelineItem.selectedSlug === "end-card");
    assert(closingItem?.templateProps?.closingTitle === "先看到结论，再理解证据", `${item.id}: tutorial closing title must distill the source outcome`, failures);
    assert(closingItem?.templateProps?.closingSupport === "完成后的演示稿应该让观众先看到结论，再理解证据", `${item.id}: tutorial closing support must preserve the full source outcome`, failures);
    assert((props.items || []).filter((timelineItem) => timelineItem.selectedSlug === "end-card").length === 1, `${item.id}: only the actual outcome may use End Card`, failures);
    assert(!(props.items || []).some((timelineItem) => timelineItem.selectedSlug === "quote-card"), `${item.id}: operational tutorial steps must not become quote-card closings`, failures);
  }
  if (item.id === "tutorial-terminal-action") {
    const methodItems = (props.items || []).filter((timelineItem) => timelineItem.selectedSlug === "progress-steps");
    const openingItem = (props.items || [])[0];
    const transitionModes = (props.items || []).map((timelineItem) => timelineItem.transitionPlan?.mode || "missing");
    assert(payload.articleFilmPlan?.roleArc?.at(-1) === "closing", `${item.id}: terminal tutorial action must resolve into a closing beat`, failures);
    assert((props.items || []).at(-1)?.selectedSlug === "end-card", `${item.id}: terminal tutorial action must use End Card`, failures);
    assert((props.items || []).at(-1)?.templateProps?.closingTitle === "导出完整影片", `${item.id}: terminal action closing title must preserve the source outcome`, failures);
    assert((props.items || []).at(-2)?.transitionPlan?.mode === "quiet-fade", `${item.id}: final method beat must settle into the closing hold`, failures);
    assert(JSON.stringify(transitionModes) === JSON.stringify(["line-handoff", "line-handoff", "quiet-fade", "hard-cut"]), `${item.id}: tutorial relations need authored opening-to-method and method-to-method bridges, got ${transitionModes.join(",")}`, failures);
    assert((props.items || []).slice(0, 3).every((timelineItem) => timelineItem.transitionPlan?.durationFrames === 12), `${item.id}: authored tutorial bridges must use the bounded 12-frame transition contract`, failures);
    assert(methodItems.map((timelineItem) => timelineItem.templateProps?.actionTitle).join("/") === "整理并分配材料/检查段落承接", `${item.id}: method titles must stay semantic and inside their title column`, failures);
    assert(methodItems.every((timelineItem) => timelineItem.templateProps?.methodMotionIr?.contract === "A1MethodMotionIR/v1"), `${item.id}: method shots must carry frame-level motion IR`, failures);
    assert(methodItems.every((timelineItem) => (timelineItem.templateProps?.methodMotionIr?.actors || []).every((actor) => actor.startFrame < actor.endFrame && Array.isArray(actor.easing))), `${item.id}: every method actor needs bounded frames and bezier easing`, failures);
    assert(methodItems[1]?.templateProps?.stepItems?.at(-1)?.relation === "return-to-source", `${item.id}: continuity repair step must keep its return relation`, failures);
    assert(methodItems[1]?.templateProps?.methodMotionIr?.actors?.some((actor) => actor.id === "return-pulse"), `${item.id}: continuity repair shot needs a return-pulse actor`, failures);
    assert(openingItem?.templateProps?.topText === "先确认问题" && openingItem?.templateProps?.bottomText === "教程步骤", `${item.id}: opening hierarchy must keep the source-derived viewing task subordinate to the full article title`, failures);
    assert(openingItem?.templateProps?.source === "", `${item.id}: text-only opening must not leak the SOURCE placeholder`, failures);
  }
  if (item.id === "unseen-forest-climate") {
    const motionScenes = props.motionIrV2?.scenes || [];
    const templateFamilies = new Set((props.items || []).map((timelineItem) => timelineItem.selectedSlug));
    const plannedMaterialItems = (props.items || []).filter((timelineItem) => ["data", "single-image", "multi-image"].includes(timelineItem.assetSlotPlan?.slotKind));
    assert(props.motionIrV2?.contract === "A1MotionIR/v2", `${item.id}: timeline props must carry the authoritative Motion IR v2`, failures);
    assert(motionScenes.length === (props.items || []).length, `${item.id}: Motion IR scene count must match timeline items`, failures);
    assert(motionScenes.every((scene, index) => scene.sceneId === props.items?.[index]?.id), `${item.id}: Motion IR scene ids must follow timeline order`, failures);
    assert(motionScenes.filter((scene) => scene.primitive === "stagger-list").every((scene) => Array.isArray(scene.actors) && scene.actors.length >= 3), `${item.id}: method scenes need shared Motion IR actors`, failures);
    assert(templateFamilies.size >= 3, `${item.id}: real article needs at least three template families, got ${[...templateFamilies].join(",")}`, failures);
    assert(plannedMaterialItems.length >= 1, `${item.id}: real article needs a data or real-material slot plan`, failures);
    assert(payload.state?.sourceUrl === item.sourceUrl, `${item.id}: source URL must survive compilation`, failures);
    const dataItems = (props.items || []).filter((timelineItem) => timelineItem.assetSlotPlan?.slotKind === "data");
    assert(dataItems.length >= 1, `${item.id}: expected a data scene`, failures);
    assert(dataItems.every((timelineItem) => timelineItem.templateProps?.sourceUrl === item.sourceUrl), `${item.id}: data scenes must retain article-level source provenance`, failures);
    assert(!(props.items || []).some((timelineItem) => timelineItem.assetSlotPlan?.slotKind === "multi-image"), `${item.id}: transport from leaves to air must not be misread as a visual comparison`, failures);
    const mechanismItems = (props.items || []).filter((timelineItem) => timelineItem.selectedSlug === "remocn-data-flow-pipes");
    assert(mechanismItems.length === 3, `${item.id}: three forest mechanism beats must use the mature Remocn flow template, got ${mechanismItems.length}`, failures);
    assert(mechanismItems.every((timelineItem) => timelineItem.templateProps?.mechanismFlowContract === "A1RemocnDataFlowPipesAdapter/v1"), `${item.id}: mechanism beats missing the source-bound adapter contract`, failures);
    assert(mechanismItems.every((timelineItem) => timelineItem.templateProps?.sourceTemplate === "Remocn Data Flow Pipes"), `${item.id}: mechanism beats must name the mature source template`, failures);
    assert(mechanismItems.every((timelineItem) => timelineItem.templateProps?.sourceLicense === "MIT"), `${item.id}: mechanism beats must retain the source license`, failures);
    assert(mechanismItems.every((timelineItem) => timelineItem.templateProps?.sourceTemplateUrl === "https://www.remocn.dev/docs/components"), `${item.id}: mechanism beats must retain source provenance`, failures);
    assert(mechanismItems.every((timelineItem) => (timelineItem.templateProps?.nodes || []).length === 4 && (timelineItem.templateProps?.edges || []).length === 3), `${item.id}: mechanism beats need four source-derived nodes and three edges`, failures);
    assert(!/Client|API|Queue|Database|CDN|Logs/u.test(JSON.stringify(mechanismItems)), `${item.id}: Remocn demo labels leaked into article output`, failures);
    const transpirationItem = mechanismItems.find((timelineItem) => String(timelineItem.templateProps?.title || "").includes("第二条机制"));
    assert(transpirationItem?.templateProps?.nodes?.map((node) => node.label).join("/") === "土壤水/根系/叶片/空气湿度", `${item.id}: transpiration flow nodes must explain the source sentence`, failures);
    assert(dataItems.every((timelineItem) => timelineItem.templateProps?.metricContract === "A1ArticleSourceMetric/v1"
      || timelineItem.templateProps?.dataEvidenceRoute?.status === "text-derived"), `${item.id}: sourced metrics need either an editorial metric contract or an explicit text-derived fallback`, failures);
  }
  if (item.id === "abstract-strategy-comparison") {
    const comparisonItems = (props.items || []).filter((timelineItem) => timelineItem.narrative?.storyRole === "comparison");
    assert(comparisonItems.length === 3 && comparisonItems.every((timelineItem) => timelineItem.selectedSlug === "comparison-chart"), `${item.id}: abstract comparisons must use the semantic two-path adapter`, failures);
    assert(comparisonItems.every((timelineItem) => timelineItem.assetSlotPlan?.slotKind === "text" && timelineItem.assetSlotPlan?.status === "not-needed"), `${item.id}: abstract comparisons must not request image or data material`, failures);
    assert(comparisonItems.every((timelineItem) => timelineItem.templateProps?.semanticComparisonContract === "A1SemanticComparisonAdapter/v1"), `${item.id}: text comparisons need the source-derived semantic adapter`, failures);
    assert(comparisonItems.map((timelineItem) => timelineItem.templateProps?.title).join("/") === "两种方案/两种成本/短期与长期", `${item.id}: comparison headers must summarize the pair without repeating the left side`, failures);
    assert(comparisonItems.every((timelineItem) => timelineItem.templateProps?.templateSelection?.materialStrategy?.requiredSlotKind === "text"), `${item.id}: selection plan must declare a text material strategy`, failures);
  }
  if (item.id === "official-health-fact-sheet") {
    const methodItem = (props.items || []).find((timelineItem) => timelineItem.selectedSlug === "progress-steps");
    assert(methodItem?.templateProps?.actionTitle === "推进三项行动", `${item.id}: action-list title must describe the source plan`, failures);
    assert(methodItem?.templateProps?.stepItems?.map((step) => step.text).join("/") === "降低排放并改善空气质量/建设有气候韧性的卫生系统/建立针对高温和传染病的监测响应", `${item.id}: three source actions must fill three mature template steps`, failures);
  }
  if (item.id === "official-product-feature-release") {
    const featureItems = (props.items || []).filter((timelineItem) => timelineItem.templateProps?.templateSelection?.gateId === "general-evidence");
    assert(featureItems.length === 4, `${item.id}: every named feature beat should request source-page visual evidence without forcing a screenshot onto the synthesis claim`, failures);
    assert(featureItems.every((timelineItem) => timelineItem.assetSlotPlan?.slotKind === "single-image"), `${item.id}: product features must use one reviewed source image per shot`, failures);
    assert(featureItems.every((timelineItem) => timelineItem.templateProps?.templateSelection?.materialStrategy?.sourcePriority?.[0] === "source-page-image"), `${item.id}: source-page imagery must be the first material priority`, failures);
  }
  if (item.id === "english-opening-source-support") {
    const openingItem = (props.items || [])[0];
    assert(String(openingItem?.templateProps?.title || openingItem?.templateProps?.topText || "").includes("辅助功能"), `${item.id}: English source openings must compile into a readable semantic title`, failures);
  }
  if (item.id === "data-opening-source-support") {
    const openingItem = (props.items || [])[0];
    assert(String(openingItem?.templateProps?.title || openingItem?.templateProps?.topText || "").includes("增长"), `${item.id}: numeric openings must compile into a compact directional title`, failures);
  }
  if (item.id === "official-science-three-shifts") {
    const mechanismItem = (props.items || []).find((timelineItem) => timelineItem.selectedSlug === "remocn-data-flow-pipes");
    const labels = mechanismItem?.templateProps?.nodes?.map((node) => node.label).join("/");
    assert(labels === "变化类型/长期趋势/季节节律改变/极端事件变化", `${item.id}: enumerated mechanism labels must come from the current source, got ${labels || "missing"}`, failures);
    assert(!/太阳辐射|林冠|林下|温度下降/u.test(JSON.stringify(mechanismItem)), `${item.id}: generic mechanism adapter leaked forest defaults`, failures);
  }
  if (item.id === "official-entity-opening-evidence") {
    const systemItem = (props.items || []).find((timelineItem) => timelineItem.selectedSlug === "remocn-data-flow-pipes");
    const labels = systemItem?.templateProps?.nodes?.map((node) => node.label).join("/");
    assert(labels === "月面着陆器/载人飞船/任务人员/协同任务", `${item.id}: system coordination must compile into source-derived relationship nodes, got ${labels || "missing"}`, failures);
    assert(systemItem?.assetSlotPlan?.slotKind === "multi-image", `${item.id}: official system flow must retain the multi-image node slot contract`, failures);
    assert(systemItem?.templateProps?.title === "阿耳忒弥斯 III 需要多系统协作", `${item.id}: system flow title must foreground the article claim`, failures);
  }
  if (item.expectSourcePageMaterial) {
    const evidenceItem = (props.items || []).find((timelineItem) => String(timelineItem.templateProps?.title || "").includes("官方页面展示"));
    assert(evidenceItem?.templateProps?.materialEvidence?.primarySource === "source-page-screenshot", `${item.id}: source-page screenshot must survive API compilation into template material evidence`, failures);
    assert(evidenceItem?.templateProps?.materialEvidence?.primarySourceUrl === item.sourceUrl, `${item.id}: source-page screenshot must preserve the exact source URL`, failures);
    assert(evidenceItem?.templateProps?.templateSelection?.materialStrategy?.sourcePriority?.[0] === "source-page-image", `${item.id}: evidence adapter must prefer source-page imagery`, failures);
  }
  if (item.expectComparisonFallback) {
    const comparisonItem = (props.items || []).find((timelineItem) => timelineItem.templateProps?.templateSelection?.selectedSlug === "image-carousel");
    assert(comparisonItem?.assetSlotPlan?.slotKind === "multi-image", `${item.id}: comparison beat must retain its multi-image material plan`, failures);
    assert(comparisonItem?.selectedSlug === "quote-card", `${item.id}: fewer than three distinct adopted images must keep a text comparison instead of promoting an incomplete media template`, failures);
    assert(comparisonItem?.templateProps?.templateSelection?.runtimeFallbackApplied === true, `${item.id}: fallback must stay explicit in the template selection contract`, failures);
  }
  if (item.expectComparisonPromotion) {
    const comparisonItem = (props.items || []).find((timelineItem) => timelineItem.templateProps?.templateSelection?.selectedSlug === "image-carousel");
    assert(comparisonItem?.assetSlotPlan?.status === "ready", `${item.id}: three distinct adopted images must fulfill the multi-image material plan`, failures);
    assert(comparisonItem?.selectedSlug === "image-carousel", `${item.id}: fulfilled multi-image comparison must render through the mature image-carousel template`, failures);
    assert(comparisonItem?.templateProps?.templateSelection?.runtimeFallbackApplied === false, `${item.id}: fulfilled comparison must not retain a runtime fallback`, failures);
    assert(comparisonItem?.templateProps?.materialEvidence?.imageCount === 3, `${item.id}: promoted comparison must preserve all three source-qualified assets`, failures);
  }
}

for (const role of ["evidence", "claim", "process", "conclusion"]) {
  const coverage = semanticMotionCoverage.get(role);
  assert(coverage?.slugs?.size >= 1, `semantic matrix: ${role} never reaches a template`, failures);
  assert(coverage?.actions?.size >= 1, `semantic matrix: ${role} has no compiled focus action`, failures);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, summaries }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: "A1ArticleTemplateCompilerTest/v1",
  caseCount: cases.length,
  semanticMotionMatrix: Object.fromEntries([...semanticMotionCoverage.entries()].map(([role, coverage]) => [role, {
    templates: [...coverage.slugs].filter(Boolean),
    focusActions: [...coverage.actions].filter(Boolean),
  }])),
  summaries,
}, null, 2));
