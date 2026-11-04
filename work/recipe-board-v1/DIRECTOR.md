# 导演安排（DIRECTOR · 2026-11-03）

> **工作协议：** 开工前读 `WORKING-MODE.md`；按 `routing/project-routes.json` 选流程；先 buildPlan/lookLock，再资产门、3 帧、5s、10s、20s；构图/遮挡/SSIM 不过直接退回。

这是导演在开工前、开镜前、交付前必须执行的安排。与 HOUSE 冲突时 HOUSE 优先；这里管“导演怎么想、怎么排、怎么接系统”。

## 1. 角色：最少的人

- **Lead Director（1 人）**：概念、世界、引擎选择、镜头表、合版。唯一写文件的人。
- **Blind Reviewer（关口 1 人）**：只读；看片/看 sheet，返回 JSON。不写文件、不渲片。
- **Specialist（可选，只读）**：素材/事实/模型审计。不参与写片。
- **不设**：写作型子智能体、渲染型子智能体、每轮换 reviewer。

## 2. 导演开镜前必须做的 12 个决定

1. 观众要问的问题（一句话）。
2. 一句话概念。
3. 世界模型：几个世界、每个世界是什么材质/空间。
4. 引擎：Three.js / 2.5D / 实拍 / 混合；先做 10s 基准。
5. 视觉系统：主色脊、字体、纸/屏/颗粒。
6. 运动语法：相机怎么动、每 2–4s 什么事件、转场有哪几种。
7. 证据模型：真实素材怎么进入世界（纸/屏/地图/实物）。
8. 系统映射：每个技术点对应哪个 module/param（capability audit）。
9. 幕结构：5 个运动，不是 20 个页面。
10. 测试计划：5–10s 世界测试 → 20s act → 全片。
11. 评审门：架构盲审 → act 盲审 → 整片盲审。
12. 取舍：如果超时/超算力，先砍什么。

没有这 12 项，不开镜。

## 3. 先搜系统，再拆参考

1. **Capability audit**：`engine/templates`、`engine/templates/morph`、`kit3.js`、`stage.js`、`style-lab` 参考输出。先跑现成 demo。
2. **逐镜技术拆解**：主体（3D mesh / 2.5D plane / 纸屏 / 纯字）、camera path、材质灯、遮挡、2–4s beat、转场。
3. **映射**：每个技术点写 `module + params + 状态`；`ready / needs-param / missing`。
4. **最小测试**：5–10s；对照参考同一秒；不过不写全片。
5. **入库**：`techniques/library.json` 存 technique/module/params/test/verdict。

## 4. 参考拆解卡（逐镜填）

| 字段 | 要写什么 |
|---|---|
| 时间 | 参考里的起止秒 |
| 主体 | 3D/2.5D/纸/屏/字 |
| 相机 | 机位、焦距、运动、落点 |
| 材质/灯 | 纸/墨/金属/布料；主光/轮廓光/光池 |
| 字层 | 字与 3D 的前后/遮挡；字级 |
| 运动 beat | 0–2s / 2–4s 各发生什么 |
| 转场 | 相机连续/匹配/黑场/色闪 |
| 模块 | kit3.helix / kit3.chromosomes / mapPlane / stage / morph |
| 测试 | 5–10s 文件 + verdict |

## 4b. 镜头调度/衔接/相机

逐镜检查与转场语法见 [SHOT-DIRECTION.md](SHOT-DIRECTION.md)；没有调度表不进 make。

## 5. 制作顺序（不跳）

1. Capability audit + 参考拆解表。
2. 10s 世界测试（架构、镜头、材质）；盲审架构。
3. 20s act 测试；盲审 act。
4. 全片 shotlist / 渲染；整片盲审。
5. 60fps 终渲。

任何一步不过，只修这一层，不往全片铺。

## 6. 硬门

- 交付前必须过 `node scripts/mainline.mjs release --project <id> --task <task> --review <name>`；不过不 present。
- 主线状态由 `routing/mainline.json` + `projects/<id>/decisions.json` 决定；旧文档/旧 gate 不能覆盖用户最新退回。

- 合成画面必须过 `node scripts/check-composite.mjs <layout.json>`（安全区/字距/主体净空）；不过不 present。
- 手拼 ffmpeg 也要有 layout.json，不许跳过。

- 没有 capability audit 不开工。
- 没有 10s 基准（60 帧 <60s）不选引擎。
- 没有世界测试（相机连续、背景视差、无 >2s 冻结、无卡片滑过锁定背景）不做 20s。
- 没有盲审 pass 不展示。
- 不在错误架构上调细节；失败就换架构。

## 7. Claude 为什么做得好（可学的部分）

- 它把整片当**一个代码场景**写，不是一堆页面；
- 先拆参考的**技术/镜头/材质**，不是只拆观感；
- 一个概念、一个主色、一个 hero、极少字；
- 逐帧纯函数 `f(t)`，相机/时间轴先行；
- 用 contact sheet / stills 快速自检，再改；
- 不靠多智能体；靠**强方向 + 确定性渲染 + 快速迭代**。

我们缺的不是“更多 agent”，是这套导演顺序和系统复用。

## 8. 技术栈判定（系统硬规则）

导演不按“我会什么”选工具，按镜头问题选：

- 先读 `routing/tech-stack.json`：只有 `ready` 可直接进生产；`installed` 需手动回执；`candidate` 需先做 canary/试验；`missing` 不得写成可用。
- 每个方向在 `design-board.json` 写 `techStack`；selected 方向缺 `techStack` 或缺技术门证据，`design-gate` 直接失败。
- 检查：`node scripts/tech-stack-check.mjs --project <id>`。
- 当前真实 ready：Three.js/WebGL、GLSL/post、Blender、DOM/SVG/Canvas、FFmpeg、Puppeteer、真实素材、生图参考。
- 当前未接线/缺失：WebGPU、Babylon、R3F、Houdini、UE、Unity、Nuke、AE 等；没有任务和 canary 不进片。
- 选型口径：证据→real；字/数据→code；一致世界/相机/接触阴影→3D；hero asset/lookdev→Blender；2D 动效→DOM/SVG/GSAP/Lottie/Cavalry（手动）；复杂 sim→Blender bake 或改设计；AI 视频只做 5s 非证据回退。
- 详细工作流：`docs/analysis/DIRECTOR-TECH-STACK-20261104.md`。

## 9. 效果语法（系统硬规则）

- 效果先答 storyJob/useWhen/avoidWhen/canary；答不出不用。
- 一镜最多 2 个效果；每幕一个 primary；效果不能替代构图/光/字。
- 只认 `routing/effects.json` 的 status：ready 可进；installed 需手动回执；candidate 需 canary + 审批；missing 不得出现。
- 检查：`node scripts/effect-check.mjs --project <id>`。
- 没有 canary 的 GPU particles/WebGPU/Geometry Nodes，先做 3–5s 测试，不进主片。
- 详细语法：`docs/analysis/MOTION-EFFECT-STACK-20261104.md`。

## 10. 质量前移（系统硬规则）

- 先资产门，再 3-frame still gate，再 5s canary，再 10s world gate；任何一关不过，不渲下一关。
- 3-frame 查构图/光/材质/字/背景/接缝；5s 查运动/接缝 + `scripts/canary-quality.mjs` 的像素指标。
- 数值门查：过暗/过亮/死黑/太平/低边缘/过曝/死帧；阈值 `routing/quality-gates.json`。
- 数值门只是底线，不是审美判断；审美仍由独立盲审。
- 技术 canary 不等于设计通过；没有 3-frame gate 的视频不拿给用户当结果。
- 连续两轮失败：换资产/技术栈/设计，不加变体。
- 详细流程：`docs/analysis/QUALITY-FIRST-WORKFLOW-20261104.md`。

## 11. 本片（香蕉）绑定

全片设计：见 [BANANA-DESIGN-BIBLE-20261103.md](../../docs/analysis/BANANA-DESIGN-BIBLE-20261103.md)（视觉 DNA / 四幕 / 20 镜 / 19 缝 / 相机总谱 / Claude 方法）。

- 世界：Clone Field / Archive Room / Map Room / Yellow Field（Three.js）。
- 3D：`kit.helix` 基因；`kit.chromosomes` 核型/单一弱点；`stage` + 现有 GLB 香蕉。
- 2.5D：`mapPlane` / 纸面 plane / 真实证据页。
- 字：`morph.js` type/hairline/serif；不做 3D 字。
- 渲染：`engine/director/make.mjs` shotlist → headless → ffmpeg；3–4 段并行。
## 11. 对标只给方法，不给皮肤（原创 DNA）

对标可以拆：运镜、节奏、3D 模块、证据组织、字与画面的关系。**不能拆成皮肤直接套。**

### 禁止的表面复制
- 黑底 + 左上明朝大标题 + 红下划线/红点缀；
- 回形针的地图纸、新闻卡、案卷卡、红色标签；
- 把“大字压场 + 证据卡”当成唯一成熟句式。

如果一个画面可以原样换进回形针那期而不违和，它就不是香蕉的设计。

### 原创 DNA 必须来自主体
每条必须回答，且不能是“因为对标也这样”：
1. **材料**：香蕉的黄、皮、褐斑、果肉、吸芽、根系；什么是这期独有的？
2. **构图**：重复、排列、单一、被咬/被剥/被切；不是“左上标题 + 中间物体”。
3. **颜色**：香蕉黄可否当**地面**而不是点缀？感染用褐/黑还是红？
4. **运动**：复制、剥开、变褐、坍缩；不是“相机绕物体”。
5. **母题**：一与万、同一棵、克隆场；每镜至少推进这个母题一次。

### 香蕉这期的设计 DNA（暂定）
- **黄是地面**：整屏香蕉黄、奶油黄、褐斑黄；黑只做剪影/版口，不做默认黑棚。
- **重复是主角**：一排、网格、货架、克隆场；不是“一个物体加字”。
- **感染是褐/黑**：不用回形针的红；红只留给“国家紧急状态”一次。
- **字是版口**：巨大、裁切、竖排/横贯，不做左上角小标题 + 红规线。
- **运动来自复制/剥开/变褐**：不是每镜绕物体。
- **无纸卷/地图/案卷皮**：香蕉的档案是果园、货架、实验室切片，不是回形针的案卷。

### 设计门
- 每个 act 先交：一条 DNA 说明 + **至少 6 个**不依赖对标的构图/材质/运动方案，并排给用户挑；
- 如果方案只在“对标换色”，退回；
- 用户选定后写 `lookLock`（`routing/look-lock.json`），下游按七项一比一复刻，**不允许改设计后交付**；
- 画面锁定后才进入镜头/3D。