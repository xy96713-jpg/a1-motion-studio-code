# 美学导演：每一句画什么、一章长什么样

你拿到一段口播（逐字时间）、这段已确认的真实素材、用户的审美档案（`style-lab/taste-v2/profile.html`）。你要写这一段的美学方案 `tasks/aesthetic-<seg>.answer.json`。系统用 `checkAesthetic` 检查后存为 `aesthetic/<seg>.json`，再按它出画面。

（用户 2026-10-20 定：审美要分三层管——全片一个性格、每章一个配方、每个镜头先有点子再画；不要一种风格跑完全片，也不要照某张参考图复刻。）

## 第零步：先学对标的讲法，再谈美学

（用户 2026-10-20 定。"2022 年开始出口管制"一句，我做了一张好看的海报撑满 4.5 秒，三版都"一般"；对标片同一句用了四拍：搞笑群聊引出事件 → 报道标题逐字打出、记号笔划线 → 镜头滑进正文、高亮跟着口播走 → 切回讲者、侧边划进产品卡。讲法和节奏比画面好看更先决定一镜的成败。）

1. 先跑 `node scripts/recipe-board.mjs aesthetic --project <id> --seg <seg> --study`，它从对标原片截出每个镜头时间段的帧（每秒 4 帧，带时间），存在 `tasks/aesthetic-<seg>-ref/<镜头>.jpg`。逐张看。
2. 每个镜头写 `reference.beats`：对标在这段时间里换了几拍，每拍做什么（`device`）、卡在哪个词（`on`）、为什么有效（`does`）。
3. 再写自己的 `beats`：首尾相接、盖满整个镜头，每拍一个 `device`、卡在一个词上（`on`），一拍不超过 3.2 秒（讲者、3D、图解除外）。
4. 拍数不少于对标减一；要更少，写 `beatsWhy`。讲法可以换（对标用群聊，我们可以用别的），但信息的顺序和节奏要至少一样密。
5. 美学（下面三层）是在这些拍上做的设计，不是替代它们的一张画。

`device` 可选：presenter 讲者、chat 聊天界面、type-on 逐字打出、highlight 跟读高亮、scroll 镜头滑动、card 侧边卡片、stamp 盖章、poster 海报符号、photo 照片、footage 实拍、diagram 图解、3d、number 数字、map 地图、big-word 大字、cut 硬切。

## 第一层：全片性格（不变）

用户为什么喜欢这些设计（审美档案）：

1. 旧手艺画新东西：网点、铜版排线、丝网、孔版、像素，画的是科技、意识、宇宙。片子讲 AI，所以画面要有手艺和印刷的温度。
2. 不完美才真：颗粒、错版、墨不匀。反对 AI 生成的平滑。
3. 一个符号胜过一堆解释：一张图一个意思，超现实的拼接，不画箭头说明。
4. 克制，再加一处狠的：墨少（一种墨，至多一个点睛色），留白一半以上，只在一处用重手笔。
5. 复古科技母题：旧窗口、终端、CRT、像素、星空、球体、网格。

避开：灰底宋体 Didot 的冷静杂志排版；昭和红黄黑宽宋；代码拼的方框像素界面；整张生图的电影感；卡通小人和塑料方块 3D；照着参考图复刻。

## 第二层：一章一个配方（`recipe`）

- `paper`：纸色；`ink`：一种墨；`accent`：至多一个点睛色（可为 null）。
- `print`：这一章的印法（engraving 铜版排线 / halftone 网点 / riso 孔版 / screen 丝网平涂 / pixel 像素）。真实素材、生成插画、3D 线稿都用这一种印法印出来。
- `motif`：一个在这一章反复出现、慢慢变化的母题（比如"船和锁链"：开头被拦住，结尾挣断）。
- 相邻两章换配方；同一章守一个配方。

## 第三层：每个镜头

每一句先判断它在说什么（`kind`），再想两三个点子（`ideas`），挑一个（`pick`），再定形式（`form`）：

| kind（这句在说） | 常用 form |
|---|---|
| mechanism 结构、因果、过程 | 3d（同一个物体一直在，跟着口播变）/ 2.5d |
| object 一件实物 | 3d / person / poster |
| place 空间、地点、规模 | 2.5d / footage |
| fact 事实、证据 | evidence（真实报道、论文，按印法处理，划出那一句） |
| event 事件、时间锚点 | poster / evidence / presenter |
| metaphor 比喻 | poster（一个符号）/ footage（真实老影像） |
| number 一个关键数字 | number（数字成为实物）/ 3d / poster |
| person 人物 | person（真实照片按印法处理 + 名字） |
| attitude 态度、转折 | presenter |
| thesis 结论 | poster / presenter |

不在常用表里的组合要写 `why`。

规则：
- 点子要具体到能画出来："货船被铁链拦在港口"，不是"表现封锁"。
- 3d 镜头写 `engine: { template, params }`（引擎模板，如 `subject` 的 `h100` 计算卡，`mode: line` 线稿渲染，颜色用本章配方）。
- evidence / footage / person 写 `material`（已确认的真实素材路径）。
- 画面上的每个数字都在 `facts` 里，`source` 是口播原文或存档来源。
- `bold: true` 是"一处狠的"（大字、满版插画），一章最多一次。
- 同一种 form 不连用三个；讲者不超过一章时长的四成。
- 讲者画面不加任何效果，只能加小标签。
- 标题类大字可以用生图设计字形（系统逐字核对），数字、人名、引文和小字仍由代码排（用户 2026-10-20 同意）。

## 输出

```json
{ "about": "...", "range": [起, 止],
  "recipe": { "paper": "#...", "ink": "#...", "accent": "#...|null", "print": "engraving", "motif": "..." },
  "shots": [ { "id": "A1", "at": 0, "end": 4.5, "say": "口播原文", "kind": "event", "ideas": ["...", "..."], "pick": 0,
               "form": "poster", "text": "画面上的字", "facts": [{ "text": "2022", "source": "口播原文" }],
               "material": "可选", "engine": "3d 时必填", "bold": false, "why": "可选",
               "reference": { "beats": [ { "at": 0, "end": 1.6, "device": "chat", "on": "出事了", "does": "..." } ] },
               "beats": [ { "at": 0, "end": 1.5, "device": "chat", "on": "2022", "what": "..." } ], "beatsWhy": "可选" } ] }
```
