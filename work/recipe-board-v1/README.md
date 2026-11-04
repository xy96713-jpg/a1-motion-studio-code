# Recipe board：文章 → 分镜方案 → 素材 → 静帧 → 动效

这是唯一生产线的参考手册。系统全貌见 [SYSTEM_MAP.md](../../SYSTEM_MAP.md)，怎么做一部片子见 [SOP.md](../../SOP.md)（一条命令：`run`）。

本机 NAS 输出：新建项目可由 `~/.config/a1-motion-studio/recipe-board-storage.json` 选择 NAS 输出根目录；`project.json` 记录存储位置，项目内 `out` 保持原路径并链接到 NAS。旧项目不迁移。创建和读取 NAS 项目时检查挂载及项目标记，主要渲染入口检查本机临时盘和 NAS 空间；NAS 不可用时报错，不回退到本机。临时文件、素材缓存和模型仍可能占用本机。可用 `RECIPE_BOARD_NAS_OUTPUT_ROOT` 在单次进程中覆盖；设为空字符串可为新项目使用本地输出。断线恢复和整片精渲仍需以真实影片验证。

灰盒预检：`node scripts/recipe-board.mjs greybox --project <id> --stills-only` 单独绘制每拍的关键帧到 `out/greybox-preflight/`，不修改正式视频或审批状态。旧项目可临时设置 `RB_GREYBOX_FRAMES_ROOT` 指向已挂载的 NAS 目录，让整片灰盒的临时帧在那里写入；旧项目的最终视频仍在本地原位置。

```
文章 ─① 导演拆拍（会话的 agent 写 `--beats`）→ 拍点 + 意图 ─② 路由表（确定性）→ 每拍：手法、素材链、模块、版式卡、缺口
     ─③ 素材模块 → ④ 版式卡合成静帧 → ⑤ 审片，打回原因回流到 ② 和 ④
```

- ①② 是导演层：`/recipe-board/plan` 页面，或 `scripts/recipe-board.mjs plan`。**只出方案，不生成画面。**
- ④⑤ 是静帧层：`/recipe-board` 审片页，或 `scripts/recipe-board.mjs render`。
- 原型阶段的说明和实测数据见 [PROTOTYPE-NOTES.md](PROTOTYPE-NOTES.md)。

## 路由表 v1（[routing/routing-table-v1.json](routing/routing-table-v1.json)）

核心规则：**凡是事实（新闻、数字、人物、产品、原话），必须用真素材或确定性渲染；生图和 AI 视频只做不需要真实的东西。文字一律可编辑排版。**

表里有 16 类意图（v4 加了 `teardown`、`scene` 两条 3D 路线，见下）。每类写明：识别线索、画面手法、素材链（按优先级排列的模块）、版式卡、动效预设、禁止事项、临时做法，以及胡泊那期的证据（哪些镜头、手修通过率、生图次数和真实素材次数、教训）。

从胡泊那期得到的结论：52 个包装片段的资产里，生图 105 次，真实素材 36 次。证据、聊天、原理图几乎都是整帧生图再修字，这正是手修线慢的根源。路由表把这几类改派给截图 + 覆盖层、聊天组件、图解模块。

改了路由表之后，用 `reroute` 重新派活就行，不用重新分析文章。

### 连续图解（v5，2026-10-19）

讲原理的意图（`concept`）第一张候选卡改成 `morph-chapter`：连着几拍用这张卡，就合成一章，用同一张持续变化的图讲完，不再一句一张卡地硬切。这张卡可以连续用（"同一张卡不连续超过 2 拍"的规则对它不适用）。

每章由 agent 按 `prompts/morph.md` 写一个场景模块，范例是 style-lab 的 `templates/morph/dna.js`。系统依次：查代码 → 在页面里跑一遍，每拍出关键帧，检查拍点时间、字的位置和大小、数字来源 → Codex 看关键帧按 `prompts/morph-review.md` 打分，2 分及以下打回 → 收下后渲一次，每拍的镜头背景取自己那段（`video.in/out`）。项目写 `"agents": { "morph": "codex" }` 时自动做；不写就列在"等 agent 做"。

**地图、证据和 3D 镜头（v6，2026-10-19）**：讲案件经过、地点分布、年表的拍归新意图 `where-when`（地点分布/时间线/案件经过），第一张卡也是 `morph-chapter`。写场景的 agent 在答案里除了 `code`，还可以提两种需求，系统先准备好再跑检查：
- `maps`：真实地图。`maps.mjs` 按地名从 OpenStreetMap 取路网（开放数据，自动通过），投影成平面，给口播里的地点定位（先按街道名，再按地名搜索；找不到的标 `found: false`，只能写明示意）。存在 `materials/maps/<key>/`，带来源回执。
- `art`：示意图（指纹、鞋印这类），走生图，不带字，最多 8 张。
- 这一章镜头已确认的真实照片自动列在任务的 `assets` 里。

模板 `morph.js` 给场景提供 3D 层（`stage3` / `place3`，`kit.mapPlane` 把地图铺成纸面平放、`kit.orbit` 摆相机）、钉在 3D 点上的元素（`at3`）、图片元素（`image`）、自画元素（`draw`）和前景层（`fg`）。自画的字也进检查（数字来源、字幕区、字号）。依据：回形针 Vol.138 开场的逐镜复刻（`projects/paperclip-138/replica/`）。

### 3D 路线（v4，2026-10-19）

两类意图走 style-lab 的 3D 引擎，出一段整屏画面，之后像实拍素材一样进静帧、动效和样片（`stage.mjs`，步骤 `stage` 在 `art` 和 `render` 之间）：
- `teardown`（实物拆解）→ 卡 `teardown-3d`：讲一个东西里面有什么、怎么转。按这一拍的字选主角模型、镜头（整体 `whole` / 打开 `open` / 看里面 `inside`）和要高亮的部件，部件名由代码写，标"示意"。只提到型号、要看真实外观的，仍走 `product`。
- `scene`（意境场景）→ 卡 `scene-3d`：情绪、悬念、想象中的画面，用分层景深场景加胶片介质。有真实空镜可用的过桥仍走 `atmosphere`。这张卡不再套显像管，它自带介质。
- 全片最重的几拍（一个大数字、一次排名、一个日子、第一次叫出名字）→ 卡 `hero-3d`：直接用引擎里调好的 3D 模板，分镜写 `stage3d: { template, params, facts }`（分镜检查会核对模板和每个数字的来源）。模板：`monolith` 巨碑坍塌（损失）、`city` 数据城市（几家一起跌）、`flipboard` 翻牌计数器（一个数被数出来，真翻片真光照）、`nameplate` LED 名牌（叫出名字）、`ticker` 行情墙（开盘、那一天）、`tunnel` 时间隧道。画面上的数字都要在 `facts` 里带来源（导演检查不过不出片）；来源行不上屏（不写网站名）。3D 镜头自带光和介质，不加印刷、不套显像管。`window.in` 可以从模板中段开始（铺垫长的模板剪到这一拍）。

能用的模型和场景在 [routing/stage-library.json](routing/stage-library.json)（手工做的：h100、hdd、drill 三个主角，ufo-night 一个场景），加上自动建出来的（style-lab `engine/subjects/auto/`、`engine/scenes/`，读库时自动并进来）。

**库里没有就自动建**（`stage` 步骤，一次一个；`--skip art` 或 `stage --no-build` 不建）：
- 模型（`engine/build/subject.mjs`）：agent 按 `prompts/subject.md` 把东西拆成 2 到 5 个部件（名字、中文名、样子、尺寸、位置、爆炸方向、是不是外壳），系统先检查这份清单再动手；然后每个部件走多视角图转 3D（`partset.mjs`），按尺寸摆好，打上部件名，自动生成整体、打开、看里面三种镜头。4 个部件大约 30 分钟。
- 场景（`engine/build/scene.mjs`）：先生成一张风格帧，看图把它分成地面、立在地上的、飘在空中的几层，再逐层生成、抠图、算深度，自动摆进分层景深。大约 8 分钟。
- 建好的东西用"这一拍要什么"做编号（同样的东西只建一次），等它的镜头直接用上；建失败的保留 TODO，并报出原因。都是生成图片推出来的示意，画面标"示意"。
- 镜头里的 `background.stage` 由这一步写（带 `auto: true`），下次按最新规则重新匹配；人手写的（不带 `auto`）只要库里有就照用。点名了所有部件时不高亮（那是列举，不是指认）。大模型自动拉远远裁剪面，自动构图按部件取景，任何尺寸都能放进画面。

**全片世界设定**：3D 镜头和卡片用同一套颜色。颜色和样子按这个顺序取，先找到的为准：
1. 选定世界里的 `worlds/<id>.json` `stage`；
2. 简报的 `style.palette` 和 `style.stage`（`look` 一句话，`subject` 拆解的底，`sceneMedium` 场景的介质）。plan 里有 3D 拍时，简报必须写 `style.stage`；
3. 主题的 tokens。

深底用 `dark`、浅底用 `paper`，再用全片的底色、字色、强调色覆盖；`red`、`ink` 保留自己的配色。

## 导演层

- 拆拍由当前 Codex 导演会话写（`run --beats beats.json`，用户 2026-10-29 已接回导演系统）。只给 `--article` 时系统先出一份草稿：DeepSeek API（要有效的 `DEEPSEEK_API_KEY`）→ 关键词规则（很粗，只作兜底）；只有 `agents.default: codex` 的旧项目还先试本机 Codex CLI。回退过程会写进方案的 `analyzer.fallbacks`。
- 路由是确定性的：同样的拍点永远得到同样的模块、版式卡和缺口。
- 输出 `projects/<id>/plan.json`，包含每拍的原文、意图、屏幕大字和高亮词、需要核实的实体、手法、素材链（每个模块标可用 / 部分可用 / 需要你提供 / 还没有）、版式卡、动效、禁止事项、要找的素材、缺口；另有全片汇总：意图分布、模块用量、系统缺口、要找的素材清单、节奏提醒。

### 试跑结果（2026-10-15）

| 文章 | 拍数 | 用时 | 主要发现 |
|---|---|---|---|
| article.txt（智能写作工作台，作者自己的产品文） | 19 | 49 秒 | 8 拍是软件演示，主要靠录屏；**软件演示、原理图解两类还没有版式卡**，共 12 拍卡在这里 |
| 胡泊 DeepSeek（ASR 草稿，3635 字） | 37 | 124 秒 | **数据图表组件缺失**，影响 4 拍；需要找 45 项素材，其中人物照、官方图、原话出处占大头 |

拿胡泊那期对照原作者的实际做法：原片分类是证据 10、口播叠加 10、标题 8、人物 6、数据 4、原理图 4；导演给出的是口播 7、原理 7、证据 5、引语 5、数据 4、标题 3、人物 2。方向一致，但标题和人物判得偏少、原理判得偏多。这是下一步要调提示词的地方。

### 补上的缺口（路由表 v2）

| 缺口 | 补法 | 样张 |
|---|---|---|
| 数据图表组件 | `components.mjs` 的 `chartSvg`：竖柱或横条，数字直接从数据画出，重点柱用强调色，负值标红，带来源小字。卡：`data-bar-chart`、`data-hbar-ranking` | 胡泊 P40（R1 79.8 对 o1 79.2，数字取自原片 benchmark 图）、P04-hbar |
| 软件演示卡 | `software-demo-window`：真实截图放进软件窗口，加光标、圆环、放大镜和步骤标签 | writing-workbench W01（稿台截图） |
| 原理图解卡 | `concept-flow`：3–5 个步骤框加箭头，重点步骤填色；loop 版加回流虚线 | 胡泊 P35（强化学习试错） |
| 聊天卡 | `chat-thread`：头像、气泡、重点句黄条，面板随内容收紧；右侧大字标题 | 胡泊 P14（2023 聊天记录） |

按 v2 重新派活后，两篇文章的方案都没有系统缺口了。剩下要做的是找素材，以及节奏提醒。

镜头 JSON 可以写 `referenceShot`，让同一个原片镜头挂多张卡做对比，比如 `P04` 和 `P04-hbar`。

### 下一步

1. 方案审过以后，按方案自动生成 `shots/*.json`，接上 ④ 出静帧。
2. 每次审片的打回原因按意图汇总，用来修路由表和卡库。
3. 调导演提示词：标题和人物判得偏少，原理判得偏多。

## 动效（验证中）

一条流水线：**版式卡 + 镜头 JSON 里的 `motion` 时间点 → HyperFrames 动画（HTML + GSAP，3D 标题用 Three.js）→ 60 帧 MP4 → 和原片同时间码上下对比**。不为单个镜头手写动画。

```bash
node scripts/recipe-board.mjs motion --project hupo-69 --only P14,P36
```

输出在 `projects/<id>/out/motion/<镜头>/`：`index.html`（生成的动画）、`renders/motion.mp4`、`renders/vs-original.mp4`（上原片下复刻）、`renders/vs-strip.jpg`（每 0.5 秒一格）。

| 预设 | 用于 | 验证镜头 |
|---|---|---|
| `chat` | 聊天：面板翻下、标题打字、头像弹出 + 气泡拉伸、围观头像、镜头漂移 + 硬切特写 | P14 |
| `steps` | 步骤：虚线画出、数字弹出 + 步骤名打字、括号、黑卡升起并打字、缓推 | P36 |
| `article` | 文章：黑场淡入、标题反白扫过、高亮块逐条出现、缓推 + 硬切近读 | P17 |
| `person` | 人物：照片缓推、姓名擦出、英文和身份淡入；多人用 `scenes` + `cuts` | P31-intro |
| `plate` | 背景板：淡入、缓推、结尾白闪 | P01-3d |
| `title3d` | 真字体 3D 标题：fontTools 取字形 → Three.js 挤出、逐字翻起、转开 | P01-3d |
| `chart` | 图表：柱子从基线长出或横条拉出、数字滚动、缓推 | P40 |
| `table` | 表格：表头淡入、逐行打字、数值跟出、整列变强调色；`scenes` 换表 | P41 |
| `trials` | 试错：说明打字、题目胶囊拉出、尝试胶囊和红绿标签依次出现、结论打字、切近景 | P35 |
| `quote` | 引语：人像缓推、多行引语按轻重逐行打字、引号淡入；`scenes` 轮换三段 | P49-quote |
| `stack` | 卡片竖排：逐张滑入，`revealAt` 的时间点翻牌，问号变成文字 | Clara C02 |
| `footage` | 整屏素材：只有慢推 | 胡泊 G 系列 13 镜 |
| `sidecard` | 口播产品侧卡：卡片从角落翻入，后续场景翻转换卡 | P22-swap |
| `tags` | 口播撕纸词条：两侧分次撕入 | P24-tags |
| `screen` | 网页 / 软件画面：真实页面截图 + 目标文字位置（`screen-capture`），主线的跟随 / 镜头语法编译器算出相机轨，逐帧回放；没有位置数据只能手动推近，不能自称跟随 | P34-screen |

覆盖情况：原片 52 个包装片段里，现在除了 B-roll 过桥（用 `plate` 即可），每一类都有一个验证过的代表镜头。口播类（`sidecard`、`tags`）用的是占位主讲人静帧，要等真正的口播底片。

所有预设都能用的通用动作：
- `cues.focus`：带 `data-dim` 的元素在这个时间点变暗，比如段落的 `focus` / `dimRest` / `ghost`。
- `data-push`：素材慢推。
- 描边滑出。
- 图表的 `cues.at`：每根柱子单独定时。

每个时间点都是从原片逐帧量出来的（0.25–0.5 秒一格）。原片里写错的事实不复刻，比如原片把 Karpathy 写成了 "Andrea Capaci"。

## 连续片段（验证转场和节奏）

```bash
node scripts/recipe-board.mjs sequence --project hupo-69 --seq chip-segment
```

`projects/<id>/sequences/<seq>.json` 按原片时间码列出每个镜头的起止时间，纯口播段写 `presenter: true`。拼接器把每个镜头的动画放到原片对应的位置，在原片切镜头的同一时刻切走；镜头比时间段短，就停在最后一帧。最后和原片同一段上下对比，并带原片声音：`out/sequences/<seq>/vs-original.mp4`。

**芯片段 P17–P25（2:03.2–2:58.35，55 秒）**：9 个包装镜头加 4 段口播，按原片切点拼出。逐秒对照，每一秒用的都是同一个镜头。P22 切到 P23 时绿卡留在原位、参数页卷入，P20 推近和 P24 词条撕入都落在同一句口播上。

这一段还有的差距：
- 口播段和 P18、P22、P23、P24 的主讲人都是占位静帧，没有口型和动作。
- 结尾 1.5 秒原片是 DeepSeek 标志的 B-roll 空镜，素材缺，暂用占位。
- H800 没有官方产品图，P22、P23 的产品图位置是 TODO。
- P23 原片放的是 A100 参数表，和 H800 卡对不上；复刻改用 H800 真实参数（Lenovo Press LP1814）。

## 素材

镜头需要的真实素材（新闻画面、历史档案、人物、产品、空镜）都走这一条：

1. `projects/<id>/materials/needs.json`：每个需求写清时间段、这一镜的台词、原片画面内容、类型（news / archival / stock / presenter / page）、形式（照片、视频、网页、论文、Logo、行情图、录屏，来自分镜的 `evidence.form`）、检索词。快切镜头每一刀一条需求，记作 `B05`、`B05~1`、`B05~2`……
2. `node scripts/recipe-board.mjs materials --project <id>`：出候选，写进 `candidates.json`。**不下载。**
   - YouTube：用本机 yt-dlp 搜，任何视频都可以，按发布者标注版权类型。
   - Wikimedia / Internet Archive / NASA：调用主线的检索模块。
   - 电影：调用主线的场景目录做推荐，只给建议。
   - 网页 / 论文（`page`）：调用主线的文章来源检索（公开索引），只给网址候选（标题、来源、摘要）。
3. `/recipe-board/materials`：左边原片画面，右边候选。你每镜选一条（可以填用哪几秒），点「确认这一批」，记进 `approvals.json`。
   - 「按推荐预选」：一次勾上建议的那条——系统推荐（匹配偏弱的不勾），或审阅者在 `materials/review-picks.json` 里改选的（写明原因）；`skip` 里的条目不预选并写明为什么。预选不是确认，确认前逐条看。
   - 网页候选优先官方站点（`routing/known-names.json` 的 `domains`；论文先找 arXiv），同一份文件可以给几刀共用（选别的镜头列出的候选）。下载失败的条目回到待确认。
4. `node scripts/recipe-board.mjs fetch --project <id> --batch batch-1`：只处理已确认的条目。
   - 下载：长视频必须给时间段。
   - 选秒：镜头切分 + OpenCLIP，按需求描述挑最像的那几秒。
   - 剪成 1080p60 无声片段。
   - 原片和片段存进 NAS 的 `A1素材库`，并写收据。
   - 本地留一份副本，记进 `bindings.json`。
   - 自动生成 `footage-plate` 镜头，带字幕，右下角标出处。
   - 网页：确认后才打开，整页截图 + 页面文字 + 网址 + 截图时间存进 NAS（`sources/web/`，带收据），本地留截图和文字（`materials/sources/`）。屏幕上的数字可以追溯到这份存档文字，镜头里记下用了哪个来源（`factSources`）。
   - 镜头改写后，已下载的素材会自动重新绑回去。

图片槽位还能：
- `cutout: true`：本地抠图，用 macOS Vision。
- `outline: [{color, dx, dy, grow}]`：在抠图下面叠彩色错位描边，动效里从人身后滑出。
- `bw`、`zoom`、`darken`、`blur`、`push`：黑白、放大裁掉角标、压暗、虚化、慢推。

素材需求写 `bind: "backdrop" | "<槽位>"`，素材就填进已有的卡片；不写就生成整屏的 `footage-plate`。

卡片的任何图片槽位都能放视频：`{ "video": { "path", "in", "out" }, "darken", "blur", "push" }`。任何镜头都能用 `backdrop` 铺一层整屏视频或图片作底。静帧取视频里的一帧；动效里放真正的 `<video>`，视频比镜头短时停在最后画面。

## 生图美术层

**模板（新文章不用逐镜写提示词）**：主题里写 `artLibrary`（具名生图模板）和 `artPlan`（每张卡的哪些部位用哪个模板）。
- 部位写法：`"panel"`（卡面）、`"title.plate"`（字底纸条，可带 `fill: { ink }` 定字色）、`"background"`（图片槽位）、`"backdrop"`（整屏底）。
- 模板提示词里的 `{subject}` 取自槽位的 `gen` 描述；没有描述就不铺。从描述取主题的模板必须写明"不出现人物"：真人只能来自照片。
- 事实槽位（绑定了人物、产品、新闻等素材需求的位置）、已有真实素材的位置、手写的 `art` 一律不动。
- 写镜头时自动铺；`art` 命令和 `run` 每次也会重新铺一遍，带 `template` 标记的随主题更新。
- `hupo-editorial` 现有模板：`tornStrip` 撕纸条、`paperCard` 纸卡、`paperWall` 冷灰纸墙、`darkPlate` 暗调空场景、`posterCard` 海报卡（道具取自描述）。

**生图规则（用户决定，2026-10-20，对比见 `style-lab/calc4/`）**：电影感生图一看就是 AI，用户选的是"目录图母版 + 代码印刷"和"真实照片 + 代码印刷"两种。
- 质感由代码做：介质 `print`（`print.py`，预设 `riso` 黑+朱红孔版、`riso-blue` 克莱因蓝+朱红、`dither` 1-bit 蓝、`gameboy` 四阶绿），和 `tube` 一样在 `medium` 步骤逐帧处理，默认只上包装镜头，讲者和实拍保持干净。主题或项目写 `medium: { kind: 'print', preset: 'riso', apply: 'all' }`。
- 生成的图只当朴素母版：每条提示词自动去掉"电影感、低调光、浅景深、胶片颗粒、35mm"一类词，并要求"目录图 / 档案照式的平实光线、不调色、不加颗粒"（`houseArt`）。确需电影感的写 `cinematic: true`。
- 真实物件先找真照片：`art` 写 `real: '1970s desktop calculator'`，先在维基共享资源找公有领域或 CC 照片（可信来源，自动通过），收据记来源、许可和作者；找不到才生成母版。
- 已缓存的图不受影响（缓存键只看请求本身）。
- 印刷只上 2D 包装（用户 2026-10-20："太过了""口播画面不能加效果"）：介质 `print` 自动跳过口播、实拍、整屏网页（`screen-full`）和 3D 卡（`PRINT_BYPASS`）；暗底的段落也不印（墨印在黑底上是一片灰）。浅一档的预设 `riso-light`（网点细、墨淡、中间调提亮）是 DeepSeek 这期（hupo-auto2）的本片美学，写在它的 `project.json` `medium` 里。

**单镜手写**：

按 [SYSTEM_MAP.md](../../SYSTEM_MAP.md) 的"画面分工"来：美术和道具由生图做，字由代码写。

- 图片槽位写 `art: { prompt, refs, transparent, size }`，`refs` 放原片截图作风格参考。
- 镜头加 `layers: [{ fill, box, z: 'back'|'front', rotate, motion: { in, from, float } }]`，叠道具层。
- 命令：`node scripts/recipe-board.mjs art --project <id> [--only P15]`。缓存在 `art-cache/`，收据是 JSON。
- 新卡：
  - `poster-pair`：口播两侧各一张议题海报卡，配 `posters` 动效。
  - `stat-sheet`：印在纸上的数据版，整版透视加远处字影。
- 卡上的面板槽位（产品卡、旁注卡的卡面）也能写 `art`：生图出整张卡的透明图，代码字照常叠在上面，动效照常按槽位走。
- 文字槽位写 `plate: { art }`：字底下垫一张生图（撕纸条），用在口播撕纸词条、人名条、卡底结论标签上；`ink` 定字色。
- 透明图写 `trim: true`：渲染时按可见像素裁掉四周留白，槽位框就是物体自己的边。
- 一张图多处共用：同样的请求只生成一次（撕纸条一张用在 P12、P22、P23、P24；绿卡一张用在 P22、P23）。
- 标题文字里写 `\n`，就在这里断行（按意思断）。
- 卡片可以设 `sheet.transform` 和 `sheet.ghosts`，做"字印在倾斜纸面上"的效果。

## 写镜头的规则（writer）

- 只写还没有镜头文件的拍；`--rewrite` 才重写。手调过的镜头不会被覆盖，其他镜头的素材需求保留。
- 卡上每个图片槽位都要有 `gen` 描述（画面里的物体和场景，不写字）；写的人漏了就用这拍的 `visual` 或大字补上。
- 每镜只登记一个素材需求（确认和绑定都按镜头记）：事实优先于空镜，主图优先于背景，其余位置交给生图模板。
- 口播类卡（侧卡、词条、产品卡、海报卡）背景自动铺主讲人底片。
- 拍里写了 `screen`，镜头带上录屏配置，`screen` 槽位指向截图输出。
- 拍里写了 `scenes: [{ at, visual, recipe?, cues? }]`，一镜按段写成多场景：每场可以换卡，`at` 是切点（秒）；第一场同时是静帧。素材需求带 `scene`，绑定时写进对应场景。
- 拍里写了 `cues`（从原片量出的入场时间），合进镜头动效的时间点；卡自带的 `motionCues` 是默认值。
- 示例只从手调过的镜头学（writer 自己写的不算）；新卡用 `exampleFrom` 借相近卡的示例。
- 数字核查只看卡上显示的字，不看生图提示词和素材路径。

## 卡的通用开关

- `boxWith: { <槽位>: box }`：另一个槽位也有内容时换位置。例：文章卡的正文在同一帧有标题时挪到标题下面。
- `exampleFrom`：没有验证过的示例时，借哪张卡的填法给 writer。
- 海报卡 `leftCard.tint` / `rightCard.tint`：卡面颜色（red、green…），生图模板按它出纸色。

新卡（2026-10-16）：
- `data-table-dark` 暗场对照表：生图暗调底图，浅色字，金色数值；列宽自动适配，长文字不溢出（所有表格通用）。胡泊 P26、P27、P42。
- `concept-steps-hero` 大字步骤卡：中央超大主题词，步骤横排压在上面，大字先落下（steps 预设的 `title` 时间点）。胡泊 P43。

## 版式和风格分开

- **卡**（`recipes/<id>.json`）只管结构：有哪些槽位、各自的位置和类型、字号层级、用哪个动效预设。
- **主题**（`themes/<id>.json`）管全部视觉：
  - `tokens`：配色。
  - `fonts`：字体栈。
  - `overlays`：纸面、暗角、颗粒、边缘虚化。
  - `vars`：组件外观的 CSS 变量，包括胶囊、标签、聊天面板、气泡、马克笔高亮范围、标题阴影等。
  - `cards.<卡>.slots.<槽位>`：每张卡、每个槽位的样式，比如标题处理（display、marker、metal…）、字体族、图片调色、高亮方式、是否自动换行。
- **项目**在 `project.json` 里写 `"theme": "<id>"`，不写就用 `hupo-editorial`。加载时按"卡 → 主题默认 → 主题里这张卡的设置"合并。

现有主题：

| 主题 | 来源 | 用于 |
|---|---|---|
| `hupo-editorial` | 胡泊 BV1a63d6CEBa | hupo-69、writing-workbench（从原来的 22 张卡里原样搬出，静帧逐像素一致） |
| `clara-dark` | 陈陈陈Clara BV11Ren6REA4 | clara-ren |

卡的 `description` 里写的外观，是它在 `hupo-editorial` 下的样子。

## 入口

- 方案页：`/recipe-board/plan`。贴文章 → 出分镜方案。
- 审片页：`/recipe-board`（apps/studio-next）。每行三张图：原片、版式卡候选、逐帧手修版（只读参考）。只给中间那张打分。
- 命令行：

```bash
node scripts/recipe-board.mjs render --project hupo-69   # 只重画有改动的镜头
node scripts/recipe-board.mjs status --project hupo-69   # 通过 / 打回 / 待审 / 缺素材
node scripts/recipe-board.mjs plan --project my-article --article a.txt --title 标题 [--presenter]
node scripts/recipe-board.mjs reroute --project my-article [--presenter]
node scripts/recipe-board.mjs materials --project hupo-69        # 素材候选
node scripts/recipe-board.mjs fetch --project hupo-69 --batch batch-1   # 下载已确认的
node scripts/recipe-board.mjs compare --project hupo-69          # 原片｜主线｜卡片 对比图
```

- 素材页：`/recipe-board/materials`。

页面跑在主线开发服务器上（端口 4311）。素材路径相对仓库根目录解析。

## 代码

| 文件 | 作用 |
|---|---|
| `apps/studio-next/src/lib/recipe-board/store.mjs` | 项目、镜头、卡库、缓存、审片结论、手修账本读取（纯 fs，路由可直接用） |
| `apps/studio-next/src/lib/recipe-board/render.mjs` | Playwright 批量渲染 + 内容哈希缓存（只从命令行跑） |
| `apps/studio-next/src/lib/recipe-board/{compose,resolve}.mjs` | 卡片 → HTML；槽位降级链 |
| `apps/studio-next/src/lib/recipe-board/components.mjs` | 确定性组件：图表、聊天、流程图、软件窗口、光标和放大镜 |
| `apps/studio-next/src/lib/recipe-board/director.mjs` | 导演层：拆拍（agent 写的 `--beats`；草稿 DeepSeek → 规则）+ 确定性路由 |
| `apps/studio-next/src/app/api/recipe-board/plan/` | `GET` 方案，`POST` 新建方案或重新派活 |
| `apps/studio-next/src/app/api/recipe-board/` | `GET` 看板数据，`POST` 打分 / 重渲（同一时间只跑一个渲染），`image` 按固定类型取图 |
| `apps/studio-next/src/lib/recipe-board/run.mjs` | `run`：看项目现状，按顺序做完该做的步骤，列出剩下的和等你做的 |
| `apps/studio-next/src/lib/recipe-board/writer.mjs` | 方案 → 镜头 + 素材需求（agent 填字）、数字核查 |
| `apps/studio-next/src/lib/recipe-board/arttemplates.mjs` | 主题生图模板铺到镜头上 |
| `apps/studio-next/src/lib/recipe-board/imagegen.mjs` | 生图（Codex 内置 gpt-image）、缓存、OCR 查字 |
| `apps/studio-next/src/lib/recipe-board/{screen,screen-capture}.mjs` | 真实页面截图 + 目标位置；调用主线相机编译器出相机轨 |
| `apps/studio-next/src/lib/recipe-board/{motion,sequence}.mjs` | 动效（HyperFrames）、对比、样片 |
| `apps/studio-next/src/lib/recipe-board/materials.mjs` | 素材候选、推荐、下载剪辑入库 |
| `apps/studio-next/src/lib/recipe-board/chapter.mjs` | 连续图解：连着的 `morph-chapter` 拍合成一章，agent 写场景模块，系统检查、看关键帧自查、渲染，每拍取自己那一段 |
| `apps/studio-next/src/lib/recipe-board/stage.mjs` | 3D 路线：拆解和意境场景的整屏画面（style-lab 引擎出片，按全片世界设定配色），绑回镜头 |
| `scripts/recipe-board.mjs` | 唯一的命令行入口 |

## 数据

- `recipes/`：共享卡库，所有项目都能用
- `projects/<id>/project.json`：参考帧清单、镜头标题、手修账本的位置
- `projects/<id>/shots/*.json`：每镜选哪张卡、每个槽位填什么
- `projects/<id>/review.json`：唯一的审片记录，和候选哈希绑定；候选重渲后，旧结论自动作废
- `out/`、`reference-frames/`：生成物，不进 git

已归档的主线只读引用：它的整帧静图作为对照目标，出现在对比图的中间一栏。
