# A1 Motion Studio 系统地图

一页说清系统由哪几层组成、各在哪里。

- 怎么做一部片子：[SOP.md](SOP.md)。它的流程表由代码生成，是唯一的流程。
- 硬规则：[AGENTS.md](AGENTS.md)。
- 2026-10-16 卡片线时代的旧地图：[HISTORY-system-map-20261016.md](work/recipe-board-v1/HISTORY-system-map-20261016.md)，历史，只读。

## 目标

给一篇文章，产出到回形针、胡泊水准的动画包装。

- 讲者口播由作者自己拍、自己剪。
- 字幕由你在剪辑时加。
- 配乐和音效暂时不做。

## 工作流形状：有审批主干的依赖图

不是另建一套线性执行器，也不是任意分叉的代理树。沿现有 `run`、任务答案与项目状态推进：审批主干保持顺序，独立章节并行，最后汇入整片；返修只回到失效输入所属步骤。

```text
文章／事实 → brief／storyboard → filmdesign
                                  ↓
                         灰盒＋风格帧＋设计板
                                  ↓
                           用户 design 关
                                  ↓
                 ┌──章节任务／素材／运动合同──┐
                 ├──章节制作 → 检查／独立审片─┤
                 └──其他章节并行───────────┘
                                  ↓
                         整片粗稿＋精渲预检
                                  ↓
                            用户 final 关
                                  ↓
                            精渲 → 复盘
```

此图是现有流程的说明，不是第二状态源。HOUSE 为规范最高入口，TYPE 管排字；已批准画面不因新能力入库而自动改写。素材、任务和答案沿原提交链绑定，不能手改回执消除过期。

### 导演如何选能力

先确定观众需要理解的关系，再选构图与动作，最后决定是否需要纹理／显示介质。`routing/director-routes.json` 管语义推荐，`routing/devices.json` 管可调用零件，`routing/engine-capabilities.json` 管真实引擎入口；不要另建风格清单作为权威。推荐不等于强制使用，干净画面、停留与明确硬切可以是设计选择。

能力进入生产必须分别证明：有真实 API 与参数边界、有适用／不适用说明、有实际渲染证据、任务能看到并消费它。样例目录或函数存在只能证明其中一部分。已认可样例可以成为参考，不自动成为所有镜头的固定模板。

### 检查分工

- **客观硬门**：输入身份与来源、可调用 API、有效几何／字形数据、越界与可读性等已校准检查；仍按现有代码的实际覆盖范围报告。
- **导演与审片判断**：构图、材料选择、节奏、多样性、解释是否准确；不以介质或颜色数量代替判断。
- **未测就是未测**：无轨迹、无像素或不支持的检查不得报通过。源码片段与哈希不证明动作被执行；抽帧不证明整片节奏；几何包围盒不证明每一笔画可见。
- 数学检查先用坏例与合法例校准，再进入验收；保留有意裁切、遮挡和用户锁定设计的适用边界，不承诺数学证明审美。

## 层

| 层 | 负责 | 代码 | 规则和表 |
|---|---|---|---|
| ① 导演 | 拆拍、简报、分镜（每拍在做什么 → 手法 → 卡和镜头）、整片设计、章节设计简报、章节模块、卡片方案。都是 agent 任务，当前会话按用户授权接续，系统检查后才收 | `apps/studio-next/src/lib/recipe-board/`（`brief`、`storyboard`、`filmdesign`、`beatdesign`、`chapter`、`shotplan`） | `work/recipe-board-v1/prompts/`；手法 `routing/devices.json`；构图 `routing/compositions.json` |
| ② 事实和素材 | 每个数字的出处、报道页截存、素材找候选、按眼挑、下载、量画质；可信来源自动放行 | `facts`、`materials`、`matpick`、`matquality.py`、`page-capture` | AGENTS.md「Frames」「User gates」 |
| ③ 画面 | 章节（连续图解，`morph.js`）和卡片段（卡片模块），两条线用同一套样子、字和检查 | 引擎 `work/recipe-board-v1/style-lab/engine/`；卡片模块 `work/recipe-board-v1/modules/` | **能力目录和路由表** `routing/engine-capabilities.json`：引擎能做什么、什么需求走哪块 |
| ④ 3D 和模型 | 实物用图生 3D 做成模型（GPT 参考视图 → Hunyuan3D-2mv → GLB，四张视图同一比例尺、量比例）；可拆的主体；Blender 算物理、运镜和遮蔽 | `engine/blender/`（`partset`、`run.mjs part`）、`engine/build/subject.mjs`、`engine/subjects/` | 章节里 `kit.props.model`、`kit.engine.subject`、`kit.engine.baked` |
| ⑤ 检查和盲审 | 做工检查（字、运动、节奏、镜头，逐 0.2 秒量）、样张和章节盲审、整片量尺和整片盲审；审片换人 | `chapter.mjs` 的各项 `…Errors`、`framecheck`、`reviewrules`、`filmdesign`（整片） | `prompts/*review*.md`、`taste.md`；用户定的审片规则由 `lessons.json` 生成 |
| ⑥ 学习 | 你的每条意见变成共用代码的修改、检查、测试和教训；做过的章节拍和卡片镜头进先例库，交给下一部片的导演 | `techniques.mjs`、`process.mjs` | `routing/lessons.json`、`style-lab/techniques/` |

## 画面分工（固定）

| 层 | 谁做 |
|---|---|
| 底、纸、光、道具的美术 | GPT 生图，不带字；道具单独出透明图，同类多件用道具族的不同成员 |
| 实物 | 图生 3D 做成的模型，按全片配色压色；不用代码方块，不用网上低清图 |
| 事实：真人、报道、论文、产品、视频、价格 | 真实来源。报道走页面模块，原句上画线；价格用存档数据由代码画 |
| 要读的字、数字、数据图 | 代码，只用家用 6 款字体，思源黑体只兜底；不描边、不加阴影、不垫底板 |
| 质感 | 网点、颗粒、胶片和屏幕翻拍（`kit.engine.screen`） |

## 一条命令

```bash
node scripts/recipe-board.mjs run --project <id> --article 文章.txt --title 标题
```

它做完所有该做的，最后列出等 agent 做的事和等你批的关口。新片两道关口：定设计、成片预览，各批一次（批过之后的改动集中到成片预览；旧片保留当时的三道）。

## 防止再丢东西

- 引擎每个文件都要在能力目录里登记，线上每个模块都要有人调用或写明用法，否则测试失败。
- 路由表里写的每个调用都必须真实存在。
- SOP 的流程表必须和代码里的流程表一致。
- 排查记录：[work/recipe-board-v1/AUDIT-flow-20261027.md](work/recipe-board-v1/AUDIT-flow-20261027.md)。
