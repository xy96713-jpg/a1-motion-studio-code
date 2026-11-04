# WORKING-MODE：像 Claude 一样工作（2026-11-04）

> 这是会话/session 的工作协议，不是项目状态。进任何项目先读本页、当前 goal、项目 `decisions.json` 和 `mainline status`。
> 目的：先研究、先拆解、先补资产，再执行；用代码和数学门拦住“看起来差不多”的假交付。

## 0. 一句话

**研究 → 拆解 → 计划 → 补资产 → 3 帧 → 5 秒 → 10 秒 → 20 秒 → 全片。**  
没有前一关的通过证据，不做下一关。

## 1. 开工前必须做的 7 件事

1. 读当前 goal、`mainline status --project <id>`、`decisions.json`；
2. 读 `WORKING-MODE.md`、`HOUSE.md`、项目任务/参考；
3. 确认项目类型，走对应 route（见 §6），不要把所有项目套成同一条片；
4. 确认**参考/资产**：本地 GLB/照片/历史镜头是否可复用；不能把“生图”当唯一来源；
5. 写 `buildPlan`：world / camera / light / material / type / FG-BG / seam / assets / gaps；
6. 写 `lookLock` 七项；没有用户选中参考，不叫复刻；
7. 过 `direction-plan-check`；plan 不 ready，**不渲染**。

## 2. 先研究，不先渲

每个项目先交：

- 一句话视觉论点；
- 4 幕/段落问题；
- 五条贯穿母题；
- 参考拆解：构图、镜头、光、材质、字、遮挡、接缝；
- 20 镜/19 缝的初表（或项目对应的 shot 结构）；
- 资产清单与缺口。

**没有以上内容，不开 canary。**  
一张 canary 不是研究成果，不能替代拆解。

## 3. 构图与遮挡：代码/数学必须查

### 3.1 参考对位
- 锁定参考 vs 渲染：SSIM **≥0.55**（`scripts/look-match-gate.mjs`）；
- 主体屏幕包围盒、负空间比例、消失点/地平线；
- 参考/渲染九宫格亮度、暗部比例、边缘量：`scripts/reference-metrics.mjs`（gridMean/darkPct delta >0.12 直接 fail）；
- 前/中/后景层次；画面第一阅读点。

### 3.2 3D 几何
- 相机：投影后的主体 bbox、焦距、起止景别；
- 遮挡：用 `objectMask`/深度排序检查 3D 物挡字、物穿字、字压物、物体出画；
- 接地：物体底部与地面/货架的接触阴影，禁止悬浮；
- 互相穿插：mesh/part 之间不得穿模；
- 材质：roughness/normal/baseColor 与参考一致。

### 3.3 字与内容
- 三级字：hero / title / caption；最大档唯一；
- 字不压物、不出画、不进字幕带；对比达标；
- 数字/事实有来源；生成图不写字、不伪造证据。

### 3.4 运动
- 相机/主体至少一个可见变化；
- 硬切两边停稳；接缝有 match/push/穿入/黑场类型；
- 不用“静帧 + 平移”冒充 3D；
- 5s/10s 先过 `canary-quality`。

## 4. 执行顺序（硬门）

```text
0 读状态
1 研究/参考拆解
2 buildPlan + lookLock(draft)
3 asset gate（缺什么补什么）
4 3-frame still gate
5 lookMatch / geometry / occlusion
6 5s canary
7 10s world
8 20s previz
9 act / full
10 blind review + user design/final
```

- 3 帧不过：不渲 5 秒；
- 5s 不过：不渲 10 秒；
- 10s 不过：不铺 20 镜；
- 20s 不过：不做全片；
- 两轮失败：换资产/技术栈/设计，不加变体。

## 5. 资产策略：本地图片/GLB 可以复刻很多项目

不是每个项目都要从 GPT 生图开始。

| 项目类型 | 资产来源 | 流程 |
|---|---|---|
| 已建 subject（电钻、HDD、H100、B04、banana） | `engine/subjects/<id>.glb` / `blender/model_<id>.py` | 读 subject → 6 视图/材质 → subject 模板试拍 → 用对应模块 |
| 新实物 | 本人照片 / 许可证素材 / image-to-3D | 视图一致 → Hunyuan3D/GLB → `asset_review` → 再进片 |
| 真实证据 | 新闻页/照片/录像/档案 | real-assets；不生成、不替换 |
| 字体/数据 | 代码 | DOM/SVG/Canvas；不用生图写字 |
| 抽象/方向参考 | GPT Image | 只做 reference；选中后按参考重建 |

**本地 GLB/照片是合法资产，不是“偷懒”；但要有来源、朝向、比例、材质和 contact shadow 证据。**  
**生图是方向工具，不是万能资产库。**

## 6. 项目 route（对应流程）

- **film-design（叙事片/纪录片）**：完整 §4；20 镜/19 缝；B12/Hupo benchmark；用户 design/final 门。
- **subject-demo（电钻/HDD/H100 这类）**：subject library → 6 视图/材质 → subject 模板 canary → 只做对应镜头/段落；不套整片 20 镜流程。
- **evidence-led**：先找真素材；没有真素材就换说法/换镜头；证据拍不生成。
- **packaging/text**：文案 → 语义切分/问题 → ≥6 方向 → 用户选 → 包装审计；不在没有任务时开片。
- **试验/canary**：只能证明技术链路；不进成片、不给用户当交付。

## 7. Claude 的工作方式（可执行版）

1. 先出 **3 个无字目标**；用户选一个；不要助手代选；
2. 按选中的图写 **明确几何/相机/光/遮挡**；
3. 用 Blender/Three.js 复刻；
4. 同尺寸并排 `cmp-1…cmp-n`，逐轮改；
5. 才做 5–6s 试片；
6. 盲审；每轮最多 3 条“到 4 分”的问题；
7. 技术通过不等于设计通过；设计/最终由用户批。

X 染色体和 DNA 的证据：`style-lab/keyframe-v1/gen.mjs`、`chromosome.py`、`cmp-6.jpg`；它们不是“生图直出”，是**按选中参考建模**。

## 8. 禁止

- 没任务就开工；在 `style-lab` 另起旁路生产；
- 先渲 300 帧再看 still；
- 拿低模/生图/模板当 hero asset；
- 把 canary 叫交付；
- 参考未锁就写“复刻”；
- 用“更好看/实现不了”绕过 lookLock；
- 生成图写字、伪造证据；
- 一次改多个项目/多个镜头。

## 9. 完成标准

一个交付只有在以下全部成立时才说完成：

- buildPlan ready；
- 3-frame / lookMatch / occlusion 通过；
- 5s / 10s / 20s 门通过；
- benchmark（B12/Hupo）pass，或用户明确接受差异；
- 盲审 pass；
- 用户 design/final 门通过；
- 产物/证据路径可追溯。

**没到这条，不说“完成”，不说“交付”。**
