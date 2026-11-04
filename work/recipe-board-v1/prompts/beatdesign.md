# 每拍设计简报（design-<章>）：先设计，再写代码

> 片子的样子以 `style-lab/STYLE-house-20261027.md` 这一页为准（各层默认、变体和量尺；有冲突以它为准）。

用户 2026-10-27：「背景铁锈不好 梳理一下为什么做那么不成熟 … 导演如何更智能 设计如何更好」，然后「先做设计先行（每拍设计简报+样张+品味评审）、构图语法库、背景和主体分离的量尺」。

以前每章直接写 3D 代码，渲染出来哪里报错改哪里，画面是凑出来的。现在先设计：这一章每一拍交一份简报，系统检查过了，章节代码才照着它写（简报会进 morph 任务的 `input.brief`）。

## 每拍回答
- `states`：起 / 變 / 落 三句话（观众依次看到的三态；空一句就是静帧）。
- `events`：3–6 个可见事件，`{ at: 秒, kind: graphic | text | space, what: 变的是什么 }`；图形/文字/空间至少两类轮流，任意 1.8 秒里要有一个事件，最后一件事落在落幅上（尾巴停不超过 2 秒）。
- `composition`：先查 `routing/director-routes.json`（kind→composition→ready 装置→gold），再从任务 `compositions` 短名单十种里挑（`routing/compositions.json`：`hero-object`/`map-table`/`count-field`/`figure-card`/`sequence-line`/`evidence-card`/`split-compare`/`globe-route`/`queue`/`title-footage`；HOUSE「文案→包装」）。**证据拍（film `medium=evidence` 或事实句）默认 `evidence-card`**。先读每种的 `when`、`picture`、`ground`、`light`、`type` 和范例。
- `picture`：这句话用**哪一个画面**讲，一句话说清：屏幕上是什么、在哪、占多大。一个画面，不是四样东西拼在一起。
- `focus`：观众看的那一样东西（点缀色只给它）。
- `ground`：底是**故事世界里的一个地方**（`place`：海图桌、夜里的沙漠、船的甲板），`kind` 是 `grounds.kinds` 之一，`how` 写它怎么做得安静（压暗、虚化、细网点）。一章一个地方；要换只在转折拍，`turn: true` 并在 `how` 里说为什么。花纹贴图（铁锈墙、毛毡、木纹）不当底，除非它就是这一拍讲的东西（`isSubject: true`）。
- `colour`：配色的角色：底是什么色、主体是什么色（`design.palette.tones` 的哪一档）、点缀色给谁。
- `type`：字怎么站：一对字放在主体旁边的空处、标签立在点上、一块大字（Gawx 的排法）。
- `alternative`：另外想过的一种构图，和它为什么输。
- `subject`：这一拍**唯一**的主体，一个名词（船、运河、地球、十个货柜）。写不出一个就是一拍讲了两件事，拆成两拍或删掉一样。
- `accentOn`：这一拍配色的点缀色（`film` 里 `palette.accent`，不一定是红）给的那**一样**东西（沒有就写 null）。不是两样，也不给一大片（整片船队染红）。
- `words`：这一拍屏幕上的字，逐条：`{ big, small, role }`。`pair` 是一对（大字加它的一行小字，`small` 必填），一拍至多一对或一块（`block`）；`label` 是立在它标的那一点上的名字（六个字以内），一拍至多两个。不要三四个单字散在画面各处。

## 原则
1. 一拍一个焦点，主体从底里分得出来（明暗差 0.15 以上，底比主体安静）。
2. 底属于故事世界，一章一个地方；不为了「有质感」铺贴图。
3. 照用户否过的东西反着做（任务的 `turnedDown`）。
4. 想不出好画面时简化：一个干净的画面胜过四样东西拼在一起。
5. 构图库和成品模板是起点（用户 2026-10-27：确定画风和喜欢的风格后不限制你发挥，你还是要做顶级视觉包装师）：照着它能快速到能交的水准；你有更好的画面，就写 `composition: "custom"`，在 `picture` 里把画面讲完整（画面上有什么、在哪、多大、怎么动）；底也可以写 `ground.kind: "custom"`，在 `ground.how` 里讲清楚。只守家规的硬线。

只输出 JSON：`{"beats":[{ "beat", "states": ["", "", ""], "events": [{ "at": 0, "kind": "graphic", "what": "" }], "composition", "picture", "focus", "subject", "accentOn", "words": [{ "big", "small", "role" }], "ground": { "kind", "place", "how", "turn", "isSubject" }, "colour", "type", "alternative": { "composition", "why" } }]}`
