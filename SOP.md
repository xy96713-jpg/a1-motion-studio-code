# SOP：一篇文章做成一部片子（2026-10-26 收束版）

这是唯一的生产流程。两条线（章节线：回形针；卡片线：胡泊）在 2026-10-26 收成一套（2026-10-28 起新片两道用户关：定设计、成片预览；[CONVERGE-20261026.md](work/recipe-board-v1/CONVERGE-20261026.md)）。相关文档：

- [SYSTEM_MAP.md](SYSTEM_MAP.md)：系统由哪几层组成、画面怎么分工。
- [MAINLINE.md](work/recipe-board-v1/MAINLINE.md)：由 `routing/mainline.json` 生成的唯一索引；交付前必须过 `node scripts/mainline.mjs release ...`。
- [DIRECTOR.md](work/recipe-board-v1/DIRECTOR.md)：导演安排：12 个开镜决定、capability audit、拆解卡、测试门、Claude 方法。
- [HOUSE.md](work/recipe-board-v1/HOUSE.md)：现行家规，冲突时最高；[TYPE.md](work/recipe-board-v1/TYPE.md)：字体排版、五档字号与量尺。
- [AGENTS.md](AGENTS.md)：执行规则与实现索引；旧说明不能覆盖 HOUSE。
- 设计语言：卡片 [DESIGN-LANGUAGE.md](work/recipe-board-v1/DESIGN-LANGUAGE.md)；章节（连续图解）[DESIGN-LANGUAGE-chapters.md](work/recipe-board-v1/DESIGN-LANGUAGE-chapters.md)。
- 卡片、主题、预设：[work/recipe-board-v1/README.md](work/recipe-board-v1/README.md)。
- 导演的操作步骤：`.codex/skills/recipe-board-director/SKILL.md`。

一句话：**事实用真的，美术可以生成，字由代码排；规则统一，参数可换；每个投诉都变成一项检查。**

这是**包装系统**：讲者口播（作者自己拍、自己剪）不归系统管；字幕由用户在剪辑时加；配乐音效暂时不做。

---

## 1. 原则

1. 导演先定讲法：全文分成连续视觉段落，再逐镜决定观众问题、平面/实拍/3D、起止画面、动作、字和接缝；每镜代表帧、关键变形补起止帧，再进整片动态粗稿。快素材直接做，耗时新模型等方向明确再做。AI整帧可作设计草图，最终无字美术层与代码字/数据分开。
2. 你只在两处出手：**定设计**（开工前定方向，只批一次）和**成片预览**（精渲前看整片动态粗稿）。每次都是品味或讲法这种只有你能定的事。批过之后的改动不重开、不挡章节，集中到成片预览给你看；粗稿永远用最新过了检查的版本（2026-10-28）。
3. 其余全自动：代码检查守做工，盲审守画面，你的意见变成规则。
4. 一个决定只有一个地方说了算：风格只在 `project.json style`，关口只在 `project.json` 的 `design` / `final`（旧片是 `look` / `rough` / `final`），用户定的审片规则只在 `routing/lessons.json`。

---

## 2. 一条命令

```bash
node scripts/recipe-board.mjs run --project <id> --article 文章.txt --title 标题
```

`run` 先看项目里已经有什么，把该做的做完，最后列出「还剩什么」「等 agent 做什么」「等你做什么」，以及这部片的流程指标。

- 新项目自动走六段流程（`project.json`：`process: "six-stage"`、`lettering: "eva"`、`agents.default: "manual"`）。开工前写上 `style`（第 4 节）。
- 每一步按内容缓存，没变的不重做。改了任何东西，再跑一次 `run`。
- 哪道关口没过，后面的就不做，状态里写清等哪一关、看什么、用哪条命令批。
- `--dry` 只看状态，`--only` 只做这几镜，`--from` / `--to` 只跑其中几步。
- `gate --project <id>` 看关口各在哪（新片两道：定设计、成片预览）。
- 长时间无回复后的自动审批须有同一版本的展示回执和覆盖到审批时刻的用户活动记录；当前这两项还未接入，因此系统不会凭文件就绪或项目意见日志为空自动批，仍须用户明确审批。

---

## 3. 流程（唯一一条）

新片都走这一条（`project.json process: "six-stage"`, `gateSet: "design"`）。两道关口由你批：**定设计、成片预览**，各批一次。 **六段仍跑 art**（`sixSkips` 不跳过 art；见 HOUSE「六段与 art」）。下面这张表由代码里的流程表生成（`apps/studio-next/src/lib/recipe-board/flow.mjs`，`node scripts/recipe-board.mjs sop --write`），和代码不一致时测试失败。

<!-- flow: generated from apps/studio-next/src/lib/recipe-board/flow.mjs (node scripts/recipe-board.mjs sop --write); edit the table, not this -->

| # | 步骤 | 做什么 | 谁 | 规则和检查 |
|---|---|---|---|---|
| 1 | 文案和事实 | 文章拆拍、导演简报、分镜；每个数字、人名、日期找到出处（正式媒体或官网，页面截存） | 系统＋导演 | `prompts/brief.md`、`prompts/storyboard.md` |
| 2 | 素材 | 按需求找真实素材、按眼挑、下载；可信来源和点名对得上的自动放行，泛泛和弱匹配等你确认，找不到换说法再搜 | 系统＋导演 | `prompts/matpick.md` |
| 3 | 整片设计 | 每拍在整片里演什么、配色、介质、为什么（合适才用）；由它推出色彩脚本 | 导演 | `prompts/world.md`、`prompts/filmdesign.md`、`filmDesignErrors` |
| 4 | 灰盒动态粗稿 | 整片一分钟出：快的照成片做（底、介质、字和版式、库里的模型、真素材），慢的占位（新模型、生图、重 3D）；字的位置由求解器排、时间跟台词；镜头、入场、衔接按成片标准；过代码检查（含切点不空、版式不连三拍重复），再过一位新审片人盲审 | 导演＋盲审 | `prompts/greybox.md`、`prompts/greybox-review.md`、`greyboxErrors`、`greyboxReviewErrors` |
| 5 | 风格帧 | 重头画面做成成片质量的样张（成品模板、大字手法、做好的模型和真素材），过代码检查和两位新评审盲审；出整片设计板 | 导演＋盲审 | `prompts/stills.md`、`prompts/taste.md`、`tasteErrors` |
| 6 | **定设计** | 灰盒粗稿、风格帧、整片设计板一次看完一起批：走向和节奏、每拍讲什么、版式和字、配色和介质、衔接和动效、重头画面 | **你**：`gate --approve design --by "你的话"` | — |
| 7 | 逐章制作 | 每章一个会话（session-brief 出任务书），按批过的设计并行精做：写模块、过代码检查，章节盲审和口味盲审同时发出、一轮过线就交；模型先验收，一群东西用编队零件；总导演收各章、守整片统一 | 各章会话＋总导演 | `prompts/beatdesign.md`、`prompts/morph.md`、`prompts/morph-review.md`、`prompts/taste.md`、`briefErrors`、`reviewErrors` |
| 8 | 整片评审 | 整片白模、整片量尺和整片盲审（严重度 3 以上先改）；精渲前的预检（每章首中尾帧按精渲画）由系统自己过 | 系统＋盲审 | `prompts/film-review.md`、`prompts/film-taste.md`、`filmTasteErrors` |
| 9 | **成片预览** | 打磨好的整片给你看；批了才精渲，之后哪一块再改只有它再等你 | **你**：`gate --approve final --by "你的话"` | — |
| 10 | 精渲和复盘 | 精渲成片（只重渲改过的）；你的每条意见变成共用代码的修改、一项检查、一条测试和一条教训；记流程指标 | 系统 | — |

<!-- /flow -->


**定样子的目标帧（lookdev）：** 灰盒之前，`node scripts/recipe-board.mjs lookdev --project <id>` 写出三个锚镜（实物/原理、证据、地图/数据）的任务；每个锚镜 2–3 张**无字目标帧**，选一张，写参考和实现路径。检查 `lookDevErrors`；通过后 `out/lookdev/lookdev.json` 是灰盒、风格帧和章节必须复现的目标；章节答案的 `motionImplementation[].referenceComparison` 必须绑定选中目标帧的文件和 sha256，并写清 start/change/end，否则 `lookdevReferenceErrors` 拦。不替代用户的设计关，也不自动批准任何东西。

**载体决策：** 每拍先选 `2d-diagram` / `2.5d` / `3d`，默认平面图解；`3d` 只有空间/遮挡/拆解/体积本身是内容时才用，并写清理由。整景 image-to-3D 不做；真实 3D 单体走 partset/Blender。

**全片静帧设计（stillbook）：** 设计关前必须有 **20/20 的整片静帧**，每拍一张最终质量帧；`node scripts/recipe-board.mjs stillbook --project <id>` 生成 `out/look/stillbook.jpg` + manifest，缺拍/重复直接报错。它是用户 design 关的画面母版，不是 4 张 hero 静帧；粗剪/animatic 从它出发，而不是从灰盒方块出发。

**读速预算：** `node scripts/recipe-board.mjs readcheck --project <id> [--chapter B02]` 在保留的几何轨迹上量每条 read 的屏字：7 个汉字/秒或 20 个其他字符/秒 + 0.8 秒找字；先作为 warning 校准，不挡渲染。

**接缝审片：** `node scripts/recipe-board.mjs seamreview --project <id> --from B04 --to B05` 写出两章之间的接缝审片任务（意图、出/入帧、cut 类型、真实拼接播放、5 项 fresh 分）；两章或成片还没出来时状态是 waiting，不用静帧拼假接缝。

**单镜验收（oneshot）：** `node scripts/recipe-board.mjs oneshot --project <id> --beat B12 --target <png> --proof <png> --blind <json>`；proof 必须盲评赢、且每个维度 ≥4，否则 target 保留，并停止同一捷径的第三个变体。

**首轮定标原则：** 风格帧步骤先由一个整片导演用三类锚镜校准——实物/原理、证据、地理或数据（本片没有的类别不硬凑）。锚镜就是能交付的静帧，不是低精度占位；字体、主体尺度、材质、证据包装和邻镜关系定下来后才扩全片。并行执行不等于并行决定风格；其余镜头、素材检索和独立审看可以并行。内部可比较 2–3 个真正不同的方向，但第一次给用户看的必须是统一选择后的候选。批过的静帧母版由后续实现继承，章节不得静默改成另一套构图或临时 Pillow 排字。

**agent 任务**怎么走（判断步骤都这样）：

1. `run` 写出 `tasks/<步骤>.task.json`。
2. 用户 2026-10-29 指示由 Codex 接回导演系统，Claude 已退出当前生产调度。当前会话按 `prompts/<步骤>.md` 写 `tasks/<步骤>.answer.json`；项目的 `agents.default` 仍是 `manual`，不因换执行人改变流程。章节答案绑定当前任务版本。
3. 系统检查，过了才收下；没过的原因写进 `tasks/<步骤>.check.json`。
4. 审片（章节审片、画面审片、整片审片）一律交给新开的子任务，只给它任务和规则，写的人不审自己。

**流程好不好看三个数**（`process --project <id>`；`--since <日期>` 只算一段时间）：

1. 首轮过线率：镜头和章节拍第一次被盲审就过的比例，目标九成；
2. 平均每块被打回几次；
3. 你每部片的意见条数（`note --project <id> --say "你的话"` 记下）。

一部片比一部少，才说明系统在进步。基线：胡泊（2026-10-26 换 eva 字之后）124 个镜头首轮过线 85%，每镜 0.52 次。

---

## 4. 开工前定的事（每部片一次）

| 定什么 | 写在哪 | 怎么定 |
|---|---|---|
| **世界（样子）** | 分镜之后的「推世界」任务（`prompts/world.md`），收下后写进 `projects/<id>/style.json`，`project.json style` 指向 `film:<id>` | 新片都用**一套家里的样子**（`routing/house-style.json`，说明页 `style-lab/STYLE-house-20261027.md`）：配色和文字排版照 Gawx，动效和质感照回形针，证据包装照胡泊。题材只转 HOUSE 允许的旋钮：主体状态与关系、揭示顺序、配色、故事里的底、亮暗、光、图示画法、颗粒暗角；字形按 HOUSE 固定，字号和排版按 TYPE。推世界给 2–3 个这套样子的变体（系统查 `houseErrors`）；你认可的回形针 Vol.138、胡泊两套是现成变体，否过的不再拿出来。新片把方向纳入 design 的整片设计一起确认，不另开 look 关；`gate --approve look --pick B` 仅适用于保留 look 关的旧项目，选择和原话记进口味（`routing/taste.json`）。已批设计不重开 |
| **字** | `project.json` 的 `lettering: "eva"` | 字体角色与固定字形以 HOUSE「字」为准：大字黒華明朝 ×0.72，小字黒華明朝，拉丁和数字廻想体，思源黑体 Heavy 只兜底；不把历史 style 可选字段当作改字形的授权。镜头不自己挑字体。`gothic-kaiso` 只留给回形针 Vol.138，不再用于新片 |
| **对标** | `project.json` 的 `reference` | 有对标片：先拆（逐秒测量 `refprofile`、细拆 `refbreakdown`、逐镜读片卡 `shotcard`，量出的规律合进章节语言和动效语言）。没有：按设计语言做，章节有章节语言的范围，卡片有动效语言的范围 |

旧项目（2026-10-26 之前开的）不改：它们没有 `process`，仍按当时的关口走（卡片 `direction` / `confirmRough`，章节逐章 `animatic --approve`）。

---

## 5. 导演怎么判断

导演写一章时，按这个顺序想，每一步都有依据和检查：

1. **风格**（任务的 `filmStyle`）：颜色从 `type.flat.COL` 取，不写死；生图照风格的 `art` 写。
2. **每拍用平面、2.5D 还是 3D**（`routing/forms.json`，两部回形针 92 拍量出：平面 83%、2.5D 5%、3D 13%）：
   - 要读的用平面：数字、表、比较、时间线、家谱、定义。
   - 地方和一堆东西用 2.5D：斜放的地图、堆起的剪报、滑进来的论文页。
   - 形状本身是重点才用 3D：分子结构、产品的机关、要站住的主角物件。一章最多一个 3D 主体，部件要读时展平。
   - plan2 每拍写 `form` 和 `formFor`，系统查。
3. **手法**（`routing/devices.json`，56 种，每种写了什么时候用、怎么做、用哪个零件）：先看这句话在做什么，再挑手法：
   - 命名 → 新名词最大；
   - 比较 → 对称、象限；
   - 数在变 → 数字长出来；
   - 引文献 → 真文献拎数字、描线；
   - 列举 → 分叉、括线、表格长出；
   - 排除 → 层层收框；
   - 重复 → 复制。

   旁白触发的必用手法（`deviceCues`）要么用，要么写理由。
4. **零件**：先用现成的，不从空白画布画。
   - `type.flat`（kit2）：证据卡、签、家谱、条纹、计数、版式。
   - `type.dev`（kit4）：收框、表格、括线、分叉、拆解、象限、取景圈、横幅、屏幕、比例条、光标……
   - kit3：螺旋、点阵、立体字、粒子字。
   - `moves`：落、弹、描、擦、推、染、故障。

   零件总览：`kitbench`。
   **什么需求走哪块**看路由表（`routing/engine-capabilities.json` 的 `routes`，每个章节和样张任务都带着）：实物用做好的模型（`kit.props.model`，没有的系统自己图生 3D）、拆开看用可拆主体（`kit.engine.subject`）、真报道的一句话和股价用卡片线的页面模块（答案的 `pages`）、屏幕和印刷质感用 `kit.engine.screen`、落下碰撞和长镜头运镜用 Blender 预算（`kit.engine.baked`）。台词点到实物、真报道、股价时必须走这条路，或者写理由不用（`routedErrors`）。引擎能做的全部登记在 `routing/engine-capabilities.json`。
   **先看系统学到的**：任务的 `guidance` 是做过的章节里同类手法的先例（盲审几分、被扣分的原因）和适用的教训。
5. **范围**（任务的 `language`，章节语言）：
   - 一拍 5–10 秒，出 2–4 样东西，间隔约 2 秒，卡着词出；
   - 最长停 1–2 秒；
   - 同屏字量按 TYPE 的层级与读速排；字号仅用 hero 300 / figure 200 / title 128 / sub 64 / caption 48（允差 6%），同角色全片同档。旧对标约 90 px 不是现行字号档；HOUSE 的 90 px 是字形规则的阈值，不是标题目标；
   - 拍与拍之间多半留下东西接着变。

   默认值取中间一半，预览按两头量。
6. **检查**：做工的检查任何风格都必须过（见第 7 节）。有对标片时，原片每个元素逐项回答 `follows`（照做，或写明为什么不做）。

**卡片线**（导演规则见 `prompts/shotplan.md` 和 [DESIGN-LANGUAGE.md](work/recipe-board-v1/DESIGN-LANGUAGE.md)）：

- **字**：按 lettering 的字体角色排。模块量字宽，一律在 `treat.js __letter` 设好字体之后再量；已经压窄的字不再压第二次。字不加装饰：统一字体的页面去掉阴影、描边和标签红线，红底牌只剩红字。
- **动效**：`motion-language.mjs`（`routing/motion-language.json`）给每类画面的推拉、平移、缓动、入场范围，取中间一半里的一个变体。没有对标的镜头用 `withLanguageMotion` 取默认值，计划检查的 `motionErrors` 只管这类镜头。
- **素材**：挑片段时还看运动方向。`clipmotion.py` 用光流量出片段本身的推拉，和对标同一时刻镜头同方向的加分。
- **风格**：以 `project.json style` 为准（2026-10-26 收束）。方案可以不写 style，写了就必须和整片的一样，否则不收；单镜只能在同一家族里变。

---

## 6. 变体怎么做（不千篇一律）

规则统一，参数可换。一部片和另一部片可以在六层上不同：

| 层 | 换什么 | 在哪 |
|---|---|---|
| 家用变体 | 题材的主体状态、关系与揭示顺序，配色、质感、无字美术画法、镜头性格 | `prompts/world.md` → `projects/<id>/style.json`，`project.json style` |
| 字排版 | 固定家用字形下的五档层级、字组与落位，不另选字体或宽度 | HOUSE「字」与 TYPE；历史 `fonts.display` / `fonts.displayX` 不构成变更许可 |
| 底和道具 | 纸面、书页、桌面、档案架；同类物件用同一家族的不同成员 | `routing/grounds.json`、`routing/props.json` |
| 形式 | 平面、2.5D、3D 按内容选 | `routing/forms.json` |
| 手法 | 同一句话可以有几种讲法 | `routing/devices.json`（每条的 `alt`） |
| 参数 | 推拉幅度、节奏、入场时机，在量出来的范围里取值，按镜头位置确定性地挑（同一镜每次一样，同类两镜不一样） | 章节语言、动效语言 |

**新片推家用变体，不另增一套 style 权威**：

1. 沿 `prompts/world.md` 的任务答案路径，依据题材提出不同讲法；不能只换色、换字体。HOUSE 固定字形与 TYPE 五档不变。
2. world 给整片基础 tokens、质感和无字美术语言；逐拍配色由 filmdesign 从 `routing/palettes.json` 与本拍短名单选择，仍受主色脊及现有硬门约束。
3. 检查通过的方向沿既有流程进入 `projects/<id>/style.json`（`film:<id>`），新片在 design 一起确认，已批设计不重开。`routing/styles.json` 留作既有风格/旧项目兼容，不作为新片任意新增风格、字形或旁路审批的入口。

**新增一种手法**：

1. 拆对标时发现库里没有的，先写进 `devices.json`：是什么、什么时候用、怎么做、出处、`kit`。
2. 在 kit4 写成零件，加进 `kit4.bench.js`，补测试。

---

## 7. 质量怎么守

- **做工检查**（任何风格都必须过）：
  - 字：出画、压字、压图、线穿字、贴边、太小、字体乱、描边阴影红底、繁体、数字来源。
  - 运动：急停、回弹、乱动、漂移、闪、一卡一卡。
  - 节奏：字晚于台词、一拍停太久、字太多。
  - 镜头：一章一个镜头、接缝。

  量法是逐 0.2 秒读几何，再加白膜上的逐秒测量。
- **盲审**：章节逐拍打分，4 分过线；画面逐镜判过不过；整片审片换人，严重度 3 以上下一轮先改。三份审片规则末尾共用一节「用户已经定的」，由 `routing/lessons.json` 的 `review` 生成（`lessons --sync`，测试管着不走样）；和它相反的打回系统自动作废（`reviewrules.mjs`）。
- **导演可以回一句**：一条打回或量尺，导演认为这一镜就该这样，用 `waive` 写明理由，绑在这一版画面上；画面一变就重新审；`run` 列出所有放行，你在 `/recipe-board/passages` 标坏就推翻。
- **投诉变检查**：你的每条意见都当作一类问题，改共用代码，加一项会让镜头失败的测量、一条测试、一条导演和审片规则、一条经验（`routing/lessons.json`）。片子只是证明修好了。
- **检查改了先回放**：`replay` 在留着的逐帧记录上重跑检查，先看会抓到什么、会误抓什么，再重跑章节。

**一轮怎么跑**（2026-10-25 的规范）：

1. 整片审片列问题。
2. 一次改完一批。
3. 每类问题修成系统级。
4. 改模块前先估影响。
5. 新规则两头验：修好被投诉的那一镜，同类过审的镜头也不能退步。
6. 逐镜盲审并行。
7. 只出粗稿（`film --rough` 或白膜）：只重渲改动的镜头（缓存按镜头和它的模块算，`layers.mjs moduleStamp` 带上字体设置），盲审只审变了的镜头，几段可以并给一个审片员。
8. 成片只在要看时渲一次。

**评审什么时候过线**：按 HOUSE「评审」与各关现有检查，一轮过线就交，不另加「连续两轮」；过线时剩余意见收成备注，后续改版只查退步和硬错。灰盒三轮后的处理按 HOUSE 与 L124，不套成整片豁免。技术评审通过不等于交付完成：design / final 仍由用户批准，精渲仍等 final，不重开已批设计。

---

## 8. 你的关卡

新片只有两道，都在第 3 节：**定设计、成片预览**，各批一次（旧片保留当时的三道：定样子、结构白膜、成片预览）。批过之后的改动不重开、不挡章节，集中到成片预览给你看；粗稿永远用最新过了检查的版本。会话不代批：10-27 的代批授权在 10-28 收回（「没确认好怎么就精渲呢」），代码拒绝以会话名义批准；你看过、用自己的话批了才往下走。

另外两处你随时可以插手，但不是关口：

- **素材**：点名对得上的、可信来源的自动放行；泛泛的和弱匹配在 `/recipe-board/materials` 等你确认（没确认的先用占位）。报道页核对过就直接用。
- **标坏一镜**：在 `/recipe-board/passages` 标记，或者直接说。标坏的一镜不精渲，导演的放行也推翻；你的话会记成一条经验。

---

## 9. 改系统之后的检查

1. `npm run test:recipe-board`（不到一分钟，不写项目目录）。
2. 改了章节检查：`replay --project <id>`；改了零件：`kitbench`（加 `--style` 看不同风格）；改了卡片模块：`bench`；改了 `lessons.json` 的 `review`：`lessons --sync`，再用留着的审片记录回放一遍，看会作废什么。
3. `run --project <id> --dry` 看状态；渲受影响的镜头看图。
4. 只改文档时，只跑 `git diff --check` 和链接检查。

---

## 10. 单步命令

`run` 调的就是这些，只想做某一步时用：

```bash
node scripts/recipe-board.mjs gate --project <id> [--approve design|final --by "你的话"]   # 新片两道关口（旧片 look|rough|final）；批准由你
node scripts/recipe-board.mjs process --project <id> [--since 2026-10-26]   # 流程指标
node scripts/recipe-board.mjs note --project <id> --say "你的话" [--about B07]   # 记一条你的意见
node scripts/recipe-board.mjs waive --project <id> --seg <段> --shot S19 --item "[type]" --why "理由"   # 导演对一条打回的放行，绑这一版画面
node scripts/recipe-board.mjs lessons [--sync]                     # 用户定的审片规则写进三份审片提示
node scripts/recipe-board.mjs plan --project <id> --article a.txt --title 标题
node scripts/recipe-board.mjs brief --project <id>                 # 写任务 / 检查并收下答案
node scripts/recipe-board.mjs storyboard --project <id>
node scripts/recipe-board.mjs write --project <id> [--only B03]
node scripts/recipe-board.mjs factcheck --project <id>
node scripts/recipe-board.mjs materials --project <id>             # 出候选
node scripts/recipe-board.mjs fetch --project <id>
node scripts/recipe-board.mjs shotplan --project <id> --seg <段>   # 卡片线的一段
node scripts/recipe-board.mjs shot --project <id> --seg <段> --id S4 [--set '{json}']   # 几秒试一个镜头
node scripts/recipe-board.mjs chapter --project <id> --only B07 [--preview]   # 一章：检查、帧条、预览
node scripts/recipe-board.mjs replay --project <id> [--grep "<检查的话>"]    # 在留着的记录上重跑章节检查
node scripts/recipe-board.mjs animatic --project <id>              # 整片白膜（旧项目还可以 --approve B07 --by "你的话"）
node scripts/recipe-board.mjs film --project <id> [--rough]        # 整片、总览、指标
node scripts/recipe-board.mjs refprofile --project <id>            # 对标逐秒测量
node scripts/recipe-board.mjs refbreakdown --project <id> --from <秒> --to <秒>   # 对标一段的细拆
node scripts/recipe-board.mjs chapterlang --project paperclip-138-full,paperclip-047   # 重算章节语言
node scripts/recipe-board.mjs kitbench [--style <id>] [--only <零件>]   # 零件总览
node scripts/recipe-board.mjs bench                                # 卡片模块测试台
node scripts/recipe-board.mjs stage --project <id>                 # 3D 镜头
node scripts/recipe-board.mjs art --project <id>                   # 生图美术层
node scripts/recipe-board.mjs status --project <id>                # 结论和 TODO
```