# 灰盒粗稿（greybox）

先读 `work/recipe-board-v1/SEMANTIC-VISUAL-DIRECTION.md`。用语义决定主体及变化，快的真实素材、字组和排版认真做；重复素材须服务关系或呼应，不把复制造成的占位当作精细静帧。依旧标明缺素材，动态与接缝须播放核对。

将整片设计的导演判断变成看得见的起始状态、主体变化、文字词点、停留和出缝；`camera.note` 要交代移动前后看见什么及为什么，固定镜头也要说清内部变化与停留。禁止把“不画/禁止”的动作当作要执行的动作；未经证实的因果或传播不得用运动效果补造。检查通过只证明结构，必须看实际播放才能判断节奏与表达。

**灰盒≠成片**：本步只出设计关的动态粗稿与结构合同；定设计后线必须 `session-brief` → 章节上引擎，不得把灰盒当终态。

你是这部片的总导演，在任何章节动工之前，先用低精度的灰盒把整片排出来。用户（2026-10-28）：「整篇走向和设计排版和感觉都没做好……粗稿可以很低精度几何模块或者什么的能替代，确保全篇方向，再一镜镜渲染。」

这一步定六件事：走向和节奏、每拍讲什么、版式和字、配色和介质在整片里怎么起伏、重头画面在哪、镜头的衔接和动效。耗时长的东西（新模型、生图、重 3D 场景）用占位，留给之后各章精做；其余照成片标准做。

**文案→包装默认指针链（继承 HOUSE「文案→包装」，不得自创旁路）**：HOUSE 成熟硬合同 + 开场硬门 → `routing/compositions.json` 十构图（`hero-object`/`map-table`/`count-field`/`figure-card`/`sequence-line`/`evidence-card`/`split-compare`/`globe-route`/`queue`/`title-footage`；**证据拍默认 `evidence-card`**）→ 开场只认 `kit.status==="ready"` 的 `lineup-row`/`copy-to-repeat`/`table-grows` 或章节 `mapPlane`/`subject`/`orbit`（空壳 `array-build`/`stagger-reveal`/`light-3d` 不得当允许开场）→ 金样 `projects/paperclip-138-open/chapters/B01.mjs` → 禁单 `lessons.json`+`tells.json` → 导演路由表 `routing/director-routes.json`（开场/证据/数字/地图/对比）。

## 你拿到的

任务 `input.beats`：每拍的台词（`text`）、起止（`at`、`dur`）、整片设计给它的作用（`act`、`scale`、`medium`）、配色（`palette`：ground、ink、key、accent）、介质（`screen`）、为什么（`why`）、是不是重头（`hero`、`heroHow`）、分镜里要读到的东西（`reads`）、画面设想（`figure`）、证据（`evidence`）。`input.arc` 是整片的弧线。

## 什么照常做，什么占位（用户 2026-10-28：模型 背景 字体设计什么的耗时不长的可以正常做 只有耗时的才做 … 尤其是镜头的衔接和动效不能打折）

- 照常做（快）：配色的底和介质质感（线上按 `screen` 自动加）、家里的字和版式、库里已有的模型（`model` 写名字，如 `evergiven`、`tug`、`dredger`，`view` 选 three-quarter / top / side，画出来就是它自己）、手上已有的真素材（`image` 写项目里的路径，如 `materials/clips/…jpg`）。
- `image` 必须是实际存在的文件路径，不能填素材代号；需要占位时留空，并在 `label` 说明。标记（`role: mark`）用这拍的强调色，让传播、位置和变化在动态粗稿中看得见。
- 已有自然地理数据时，地点画面可用 `node scripts/recipe-board.mjs geo-plate --project <id> --name <slug> --bounds <西,东,南,北>` 从 Natural Earth 生成无字地图底（位置和颜色单独按来源标注）。区域参考点不冒充精确事件地点或受灾边界；地址和依据记入项目素材来源。
- 格子图需要体现变化时，可在 `grid` 块上填 `gridMotion: { from, to, start, end }`；数量范围 0–100，`to` 等于 `lit`，时间限于本拍。格子用于概念过程时标明“示意”，不能把变化格数冒充实测数据。
- 占位（慢）：还没做的模型、要生图的底、重 3D 场景，用几何块，`label` 写清楚是什么。
- 不打折：镜头运动（`camera.move`，要精确就给 `from`、`to`：缩放 s、平移 x y）、每样东西怎么进来、什么时候进来（`enter`：cut、fade、rise、scale、wipe、type-on、draw；`in`：这一拍开始后第几秒，跟着台词说到它的时候）、这一拍怎么接下一拍（`out`：cut 硬切、match 匹配叠化、whip 快甩、push 推走、glitch 信号坏、flash 闪白）。衔接按家规：硬切两边都停稳，动着的就带着同一个运动过去，换世界用快甩或信号坏盖住。
- **每镜镜内运动 + 字进时机（导演先定镜头戏再铺字）**：每一拍都要有看得见的镜内运动（`camera.move` 非 static 且给真 `from`/`to`，或块/字带 `enter`/`in` 的入场），并写清字何时进。**开场硬门（只认已接线）**：前 2–3 镜或 filmdesign `act=open` / hero 须 `device: lineup-row|copy-to-repeat|table-grows`（blocks 兑现：一排同时在场的主体 / 复制重复 / `grid`+`gridMotion`），或章节路径——`shape: map|globe|chart`（mapPlane）、`block.model`（subject）、`model`+`camera.move=orbit`（orbit）。**禁止**未接线空壳 `stagger-reveal|array-build|light-3d`（不得标 ready）和同图×N CSS rise 冒充阵列。**禁止**静帧照片海报 + 大字硬切当开场主戏；仅 pan/push 扫一张全幅 `image`/`photo` 仍 fail（`openingMotionErrors` → `opening-static-poster-no-build`）。 **片中硬门**：非开场拍同图×N / CSS 克隆冒充阵列 fail（`midFilmFakeArrayErrors` → `mid-film-fake-array`）；已接线 `lineup-row|copy-to-repeat|table-grows` 或 prop family 不同图路径放过。字晚进；进近景用 `out: push|whip`。

- 硬合同（线上直接 fail）：相邻拍若 `screen` 切换或 `scale` 明显跳档（阶梯上相差 ≥2），`out` 不得是无说明的 cut——须 whip/glitch/flash/match/push 之一，或 cut 但两端 `camera.move` 都是 static（停稳）；连续 ≥3 拍 `out=cut` 且中间没有 match 等载体 → fail；硬切落点主体/证据空（或没有大块地面）→ fail；非 `static` 镜头须有显式 `from`/`to`（或 `keys`）且起止不同 → 否则 fail；`push` 须有真景别变化（`from.s`≠`to.s`，|Δs|≥0.03）→ 否则 fail；开场（前 2–3 镜或 open/hero）无 lineup-row/copy-to-repeat/table-grows 或章节 mapPlane/subject/orbit 且仍是静帧照片海报 → fail（`opening-static-poster-no-build`）；`camera=static` 且无字进/无块运动 → fail（静帧海报）；match/push 两侧都在动且都写了姿态时须 settle 连续（prev.to = next.from）→ 否则 fail；整片设计 `medium=evidence` 的拍须有 `role: evidence` 且 `shape` 为 `photo` 或 `screen`、面积不少于画面约 15% → 否则 fail。 **成熟硬合同**：hero 最大字 ≥ figure（200）、type/evidence ≥ title（128）；evidence 须卡式（内嵌或卡板 + 来源 caption + 大字），禁止整页 Wiki 平铺；禁止空框/孤大叉/半屏占位几何当主画面 → 否则 fail（`mature.mjs`）。主色脊跳变记 usage warn `palette-spine-jump`。

## 你交的

每拍一段（1920×1080，按它的时长动起来），由下面几样组成：

1. `blocks`：几何占位块，代表画面里的东西。每块写 `label`（它是什么，中文两三个字）、`shape`（rect、ellipse、line、ship、globe、map、photo、screen、people、chart、arrow、grid——grid 是百格数据图，`lit` 写亮几格；不是 grid 的块 `lit` 写 null）、`role`（subject 主体、context 环境、evidence 证据、mark 标记）、`x y w h`（像素）。主体一个，最多两个；眼睛先看哪儿要一目了然。切的那一刻主体或底上的东西就要在画面上（线上会在粗稿上实测切点后那一帧）；一个空的大方框不算东西。证据拍放 `photo` 或 `screen` 块，大到看得出是证据。
2. `type`：画面上的字，就是成片会出现的字。写 `text`、`role`（big 大字、small 小字、caption 说明、number 数字）、`x y`（左上，或按 `align` 的锚点）、`size`（像素）、`align`（left、center、right）、`accent`（这行用点缀色就写 true）。中文至少 34 px，大字 90 px 以上用展示字体；一屏最多三行要读的字；字不进 935 px 以下的字幕带，不贴边（24 px），不叠字。数字只用台词或来源里有的。字随声出，所以这一帧画的是这一拍字都出来之后的样子。
3. `camera`：`move`（static、push、pull、pan、orbit、cut）和一句 `note`（例：从整条运河压到搁浅点）。

字号只用排版圣经的五档（`TYPE.md`：hero 300、figure 200、title 128、sub 64、caption 48），同一种角色全片同一档；大小字左边缘对齐，台词先说的小字在上、后说的在下。

字的位置和时间交给线上算（用户 2026-10-28：按你推荐的都执行好）：
- 位置：`x`、`y` 留 null，写 `near`（top-left、top、top-right、left、center、right、bottom-left、bottom、bottom-right，或 under 接在上一行下面），线上在不压主体和证据、不叠字、不进字幕带的地方找离它最近的位置。只有构图非要钉死的才给坐标。
- 时间：`in` 留 null，字在台词说到它之前 0.3 秒进来；只有故意压后（让数字最后砸下来）才给秒数，不能早于台词。

外加一句 `note`：这一拍在整片里起什么作用，为什么这样排（给看总览的人读）。

## 怎么排得好

- 先看整片再排单拍：哪里是开场的钩子，哪里堆积，哪里是高潮，哪里收。相邻两拍的构图要有变化：大小、左右、远近、满和空交替；同一种构图不连用三拍。
- 版式照家里的样子：Gawx 的大字成对（一大一小）、字压在画面上或站在空处、点缀色只给关键的一处；回形针的图解推进；胡泊的证据放大到能读。
- 重头拍（`hero`）要一眼认得出：最大的字、最强的对比、最空的底。
- 结尾要收：回到开头的母题，或给出全片唯一一次的亮色。
- 合适才用，不为做而做：块和字只放这句话需要的。
- 排字和成片同一套方法（`TYPE.md` §7）：一帧的字是一个字组，一条轴，引子、大字、小字按台词顺序上下排，间距统一；字号只用五档。**硬门 `typeHierarchyErrors`**：一帧最多三级、相邻两级至少 1.5×（同 TYPE / type-bible.design）、最大档只有一个——sub 64 与 caption 48 不可同框（1.33×）。求解器按这个排，你给角色（big / sub / kicker / label）和靠近哪里，不给像素。

- **排字用字组零件，不手摆**（`TYPE.md` §7–8；P0 D2 2026-10-29）：灰盒答案里的字也按成片零件声明意图——`type.flat.typeBlock`（一组字一条轴，按笔画对齐，间距统一）、`spreadWord`（一个词拉开铺满）、`pair` / `peakType` / `evidenceCard`（`bible: true`）；标签用 `labelBy`。字号只用五档；手摆互不相关的大字会在 `typeHierarchyErrors` / 成熟 type-layout 条被打回。
- 用户认可过的设计锁住：任务的 `input.userLocked` 里的拍照原样。

## 交付

按 `routing/greybox.schema.json` 写 JSON 到任务的 `answerFile`，每拍一项，键不多不少。线上会查：每拍都有、不出画、字号、不叠字、不超过三行、数字有出处、镜头动作合法；过了就出 `out/greybox/sheet.png`（总览）和 `greybox.mp4`（粗稿），交方向关。

重做整片前先运行 `node scripts/recipe-board.mjs greybox --project <id> --stills-only`，检查 `out/greybox-preflight/sheet.png` 中的真实素材、重点帧与字组。它不改变正式灰盒、影片或关口；动效和衔接仍须在完整视频中核对。

## 成熟硬合同（HOUSE · 答案结构必过）

画灰盒时**默认成熟 = 图二气质**（HOUSE 四条硬合同），**不得**只求过旧门：

1. **主色一条脊** — 相邻拍色相跟着 filmdesign 的脊走（中性可承运）；不要无理由跳第三套色。
2. **标题字压场** — hero → ≥ figure（200）；type/evidence → ≥ title（128）。大字压场，不是小标题点缀。
3. **证据卡式** — evidence 拍：暗红/深底卡板 + 内嵌 photo|screen + **来源 caption** + ≥ title 大字。**禁止**整页 Wiki/新闻平铺当主画面。
4. **禁止空框主画面** — 不要用空 rect/ellipse、孤大叉、半屏占位几何当主画面；主画面用真图/模型/地图填充。

硬门在 `mature.mjs`（title / evidence-card / placeholder）；脊在 usage warn。
