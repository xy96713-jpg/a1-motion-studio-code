# 整片设计（filmdesign）：先设计整部片的起伏，再设计每一拍

先读 `work/recipe-board-v1/HOUSE.md`（现行最高权威）与 `work/recipe-board-v1/TYPE.md`（字体排版），再读 `work/recipe-board-v1/SEMANTIC-VISUAL-DIRECTION.md`（语义导演方法，不覆盖家规）：先从语义决定观众要看懂什么，再选画面和手法；设计全片主脊与段落变化。短名单是可用选择，不是风格或介质配额。逐拍代表帧先设计构图、素材、字和质感，重复主体须有连续性或新信息的理由。

任务 `referenceGuidance` 按拍提供相关历史方法候选；路径相对其 `sourceRoot`，缺图、源码或未匹配为 unknown。参考不等于本片批准，也不证明已看图；不要强套旧片色彩、照片或装置。结合本片语义，在现有 `directorIntent.reason` / `why` 中说明采用或不采用的做法及理由；不新增字段、硬门或阅读回执。`routeDefaults` 是建议而非已选路线；若已有导演路线则按实际答案理解。

镜头设计先写出观众此刻的问题、原文的限定、前一画面留下什么；再比较至少两种可实现的视觉解释，说明选中方案为何比另一方案更清楚或更有叙事力量。对选中方案写起始画面、词点触发的主体状态变化、景别/构图和视线主次、可读停留、出缝及下一镜怎样接。镜头固定、主体动作、切换或镜头运动均须有叙事理由；不要用固定动作词或漂亮的镜头路径代替语义判断。事实与艺术、字和占位分别列明，缺来源或不可实现时明确标记。可将这些判断写入现有 `directorIntent` 与灰盒/章节字段，不新建另一套生产状态。无录音时触发词是估计锚点，实际录音后校准。

新写或重写的每拍填写 `directorIntent`：`route`（opening/evidence/numbers/map/compare/custom）、`question`（观众要理解什么）、`change`（画面中发生什么）、`reason`（为何这样讲），及 `layers` 的 `evidence`（真实资料）、`art`（可生成的无字包装）、`type`（可编辑文字数据）。某层不需要则写「无」。路由是导演依据句意的选择，可以覆盖关键词建议；机制或混合关系没有合适路线时选 `custom`，并在画面设计中说明做法。事实、开场、素材、字体和可用装置的检查仍适用。为兼容已检查的旧设计，代码目前只验证已填写的 `directorIntent`，不会因旧答案缺字段自动判错。给出理由不等于机器已经判断它正确，须看实际画面和盲测。

> 片子的样子以 HOUSE 为准，固定字形不改、排版按 TYPE；`routing/house-style.json` 是实现配置，`style-lab/STYLE-house-20261027.md` 是历史说明，不是覆盖 HOUSE 的权威。美术由 GPT 生图制作无字层，可读字/数字/数据图由代码排，真实证据不生成。

**默认成熟 = 图二气质**：少色、大字压场、真图重复、证据卡式；短名单 evidence 优先卡式手法（`real-doc-callout` / `filmed-screen` / `real-in-frame` 等），禁止整页 Wiki 平铺与空框/孤大叉主画面。四条硬合同见 HOUSE「成熟」与 `mature.mjs`。

**文案→包装默认指针链（继承 HOUSE「文案→包装」，不得自创旁路）**：HOUSE 成熟硬合同 + 开场硬门 → `routing/compositions.json` 十构图（`hero-object`/`map-table`/`count-field`/`figure-card`/`sequence-line`/`evidence-card`/`split-compare`/`globe-route`/`queue`/`title-footage`；**证据拍默认 `evidence-card`**）→ 开场只认 `kit.status==="ready"` 的 `lineup-row`/`copy-to-repeat`/`table-grows` 或章节 `mapPlane`/`subject`/`orbit`（空壳 `array-build`/`stagger-reveal`/`light-3d` 不得当允许开场）→ 金样 `projects/paperclip-138-open/chapters/B01.mjs` → 禁单 `lessons.json`+`tells.json` → 导演路由表 `routing/director-routes.json`（开场/证据/数字/地图/对比 → composition → ready 装置 → gold；gaps 不得 ready）。 filmdesign 构图短名单优先上述十种；`medium=evidence` 默认构图 `evidence-card`。**灰盒≠成片**：设计关批准后必须继续章节/引擎（`director-routes` + `engine-capabilities`），不得停在灰盒。

用户 2026-10-27：「我再说整片的美学设计」，然后「加整片设计这一步（整片的起伏图、重头画面、整片量尺和整片盲审）」。

单拍各自不差、整片却平：七成画面是同一种俯看暗灰海图，从搁浅到脱困一个调子，大场面只在头尾两次。所以在每一拍的设计简报之前，先把整部片当一件作品设计一次。

## 你要交的
- `arc`：这部片的起伏，几句话：从哪里开、在哪里压、高潮在哪、怎么收。
- 每拍一行：
  - `act`：这一拍在整片里演什么：`open` 开场、`build` 铺垫、`press` 压上来、`peak` 高潮、`turn` 转折、`release` 松开、`close` 收尾。
  - `scale`：景别：`world` 全球、`region` 区域、`place` 一个地方、`object` 一样东西、`detail` 细节。
  - `value`：明暗：`dark`、`mid`、`light`。光跟着故事走：压上来时暗下去，松开时亮起来，转折可以翻一次底。
  - `medium`：媒介：`diagram` 图解、`footage` 真画面（报道里的照片和影像，素材步骤去找）、`type` 大字时刻（Gawx 的整块字）、`evidence` 证据卡（胡泊的报道截图、数据卡）。
  - `palette`：这一拍的配色，**必须从任务 `shortlists.palettes`（亦即 `routing/palettes.json`）里点名一个 id**，禁止自造色名：`noir`、`amber-lamp`、`film-red`、`mustard`、`indigo-night`、`teal-chart`、`cream-print`、`cobalt-card`。每套写了底、主色、点缀、字色和光，以及适合讲什么。按这一拍讲什么、在整片里演什么来挑（用户 2026-10-28：可以各种配色 但要和谐，站在设计师、导演角度看怎么好怎么做，不能硬做，要变通）。
  - `screen`：这一拍经过哪一块屏，**必须从任务 `shortlists.screens`（亦即 `routing/media.json`）里点名一个 id**：`led2`、`ledred`、`crt`、`amber`、`mono`、`vhs`、`halftone`，或不经屏的 `clean`、`film`。禁止自造屏名。用户最看重屏幕介质的质感（2026-10-16：还不如之前的那种 led）；真照片、真页面、精致物件要看清时不经屏。介质要和这一拍的配色配得上（介质表的 `palettes`）。**该上屏才上屏，不硬凑 LED。**
  - `why`：一句话说清这一拍为什么用这套配色、这个介质——从这一拍的台词和它在整片里演什么说起（例：「讲 367 艘船在等，是一个读数：琥珀终端的单色读数」「真卫星照片要看清船横在河里：不经屏，放在被拍的屏上」）。每拍说自己的，不复制。手法若引用巧思，从任务 `shortlists.devices`（`routing/devices.json`）里点名 id。
  - 任务 `shortlists.byBeat.<拍>` 是按这一拍 act/medium/cue 收成的 3–8 候选：**palette / screen /（若写了）device 必须落在这一拍的 byBeat 短名单里**（代码硬门）；顶层 `shortlists.palettes|screens|devices` 仍是全 catalog（用来拒绝自造名）。禁止自造，也禁止只挑 catalog 里但不在本拍 byBeat 的 id。
  - `red`：这一拍点缀色有多强（0 没有、1 一点、2 明显、3 整片最强）。点缀一路爬到高潮最强（点缀色是这一拍配色的 `accent`，不一定是红）。
  - `subject`：真画面、证据卡这类拍，画面里必须让人一眼认出的那样东西，用英文短语写（如 `a large ship seen from above`），系统拿它量素材认不认得出、主体在图里哪一块（裁到那里）；图解的拍写 null。
  - `hero` 与 `heroHow`：这一拍是不是重头画面，怎么做（例：「真船画面上压竖排大字」「亮底上整个地球」）。

## 原则（代码会查，`filmDesignErrors`）
1. 重头画面 4 到 6 个（短片按拍数少一点）：开场、收尾必有，中段（压上来或转折处）必有一个；两个重头画面不挨着，周围让安静的拍托住。**开场不是 PPT（只认已接线）**：`act=open` / 开篇 hero 须点名短名单已接线装置 `lineup-row` / `copy-to-repeat` / `table-grows`，或章节路径 mapPlane/subject/orbit；灰盒用一排同时在场 / `gridMotion` / `block.model`(+orbit) 兑现。禁止未接线 `stagger-reveal`/`array-build`/`light-3d` 空壳与同图×N CSS rise；禁止静帧照片海报 + 大字硬切当开场主戏。景别从广到近用 push/whip 进特写，不要四格同构图海报连环切。下游 agent 不得绕过 HOUSE 自创静图开场。
2. 不能连续四拍同一种样子（景别、媒介、明暗都一样）：换景别、换媒介、或换光。
3. 图解至多七成；至少两种媒介；至少两种明暗、三种景别。
4. 红在高潮最强，整片最强的红至多两拍。
5. **合适，不硬塞**（用户 2026-10-28：要合适 要客观设计 不要为了做而做 硬塞 导演要知道这些）：配色、介质、手法都按这一拍讲什么来挑，说得出为什么（`why`）；不为了用上某套配色、某块屏、某个手法而用。下面的数是参考，不是指标：系统只提醒（`notes`），交给整片评审看。配色轮换参考：Gawx 一部片 3–5 族，中性暗太多会读成全片灰（2026-10-28 用户嫌全是黑灰底）；彩色的底约两成。Gawx 实测：八成画面是暗的，但六到九成的画面里有一族主色，整片轮换 3 到 5 族，颜色每几秒就换。相邻两拍换配色要有关系（共用一族，或冷暖翻过来）；一章一镜到底里换配色靠光和底的变形，不硬切。白膜出来后量整片有主色的画面（35% 以上）和颜色族（3 族以上）。
6. 介质与短名单（代码会查）：
   - `palette` / `screen`（及可选 `device`）只能点名短名单 id；有 `shortlists.byBeat.<拍>` 时必须落在该拍 byBeat（代码硬门），顶层 catalog 只用来拒绝自造名。
   - **clean 连续至多四拍**：五拍及以上连续 `screen: clean` 会 fail。该上屏的拍（读数、记录、信号、旧画面、网页软件）换一块屏；真照片和大字时刻可以 clean，但不要一长串都不换。
   - **几乎全片 clean 且无 why 会 fail**：clean 占比很高时，每拍必须说得出为什么不经屏。
   - 换世界（景别跳两级及以上）而两边都 clean：可以，但灰盒衔接必须用 whip/glitch/flash/match/push 盖住，禁止 unexplained cut（`greyboxSeamErrors`）。不要为了过门硬塞 LED。
   - 参考是三成左右的拍在屏上——只是参考，不是配额。
7. **证据绑定**：`medium: evidence` 的拍，`materials/bindings.json` 必须有该拍的真素材键；否则设计检查 fail。找不到素材就换媒介，不要空许诺。
8. 整片量尺的下限照对标片里起伏最小的定（任务的 `floors`：每分钟换样子 6 次以上、明暗幅度 0.15 以上、20 秒以上不变的长段至多一半）；任务里有 `measured` 时是这部片现在的实测，照着它改。

只输出符合 `work/recipe-board-v1/routing/filmdesign.schema.json` 的 JSON；顶层包含 `arc`、`houseStyle`、`beats`。下面是**字段齐全的单拍形状示例，不是可直接交付的整片答案**。`houseStyle: null` 表示选用项目派生的家用变体；如选已认可 preset 则填其 id。实际答案须覆盖全部拍，palette/screen 须满足当前任务短名单；非 custom 路由须把 routeDefaults 的 kind/composition/device 写入答案，custom 也不豁免开场、素材和其他硬门。示例不声称模型或证据已就绪。

```json
{
  "arc": "以下只示范中段一拍的字段形状；全片按文稿补齐起伏与全部拍。",
  "houseStyle": null,
  "beats": [
    {
      "beat": "B05",
      "act": "build",
      "scale": "object",
      "value": "light",
      "medium": "diagram",
      "palette": "cream-print",
      "screen": "clean",
      "why": "解释部件先后作用，保留清晰轮廓，不模拟屏幕记录。",
      "red": 1,
      "hero": false,
      "heroHow": null,
      "subject": null,
      "device": null,
      "kind": null,
      "composition": null,
      "directorIntent": {
        "route": "custom",
        "question": "哪个部件先推动另一个部件？",
        "change": "先显示两件分离的部件，在触发词处让主动件接触从动件，停稳后显示传力方向。",
        "reason": "先看接触再看传力，避免把同时出现误读为同时启动。",
        "layers": {
          "evidence": "无；此拍为机制示意，不冒充实测记录。",
          "art": "GPT 生成无字底与道具质感；主体由已验收模型承担。",
          "type": "代码排繁体部件名称与方向标注，按 TYPE 字组随词出现。"
        }
      }
    }
  ]
}
```

- 全片是一个连续系统（Opus 5.5 研究，docs/analysis/OPUS55-STUDY-20261102.md）：每拍 3–6 个事件、图形/文字/空间轮流变、任意 1.8 秒有变化；设计要给每拍定“起/變/落”和事件种类，不只是每拍一张画。

## 返修／高风险镜头的开工合同
每拍写 activeRevision（本次主动返修）与 productionRisk（high / normal / null），不回溯标记无关已批准镜头。high 或 activeRevision=true 时必须填写完整 directorIntent.question/start/change/end/handoff/reason/layers 与 assets。routeDefaults 只是候选，系统不会为这些镜头默补 device/kind/composition；由导演明确选择。custom 可用于合理静止，不绕过开场、mesh、事实约束。

assets 每项填写 id/use/source/file/operation/operability/provenance。use=art|evidence|type；source=generated|real|code；operation=hold|camera|per-object|deform|reveal；operability=whole-image|layers|mesh|code。资产用途与所需事件显式对应。整张生图可做静态场景，但不能声称可逐对象换种／变形。evidence 必须 real + provenance，原证据绑定检查仍执行。声明不证明文件实际能力，独立审查仍须看素材。
