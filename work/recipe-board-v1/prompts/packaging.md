# 规则：包装配方（packaging）

把对标片的包装效果当**配方**用，不是当模板抄。配方在 `routing/packaging-taxonomy.json`，检查与选择在 `apps/studio-next/src/lib/recipe-board/packaging.mjs`，CLI 是 `node scripts/packaging.mjs`。

## 先分清两层

- **不变量（全片共用，变体不能破）**：12 栏/6 行网格、安全框（左40/上60/右1880/下935）、字号阶梯 300/200/128/64/48、层级 ≥1.5×、行距 0.15em±0.03、对比度（大字3/正文4.5）、无字描边/阴影/发光/字下横线、每镜运动预算。
- **变体（可复用配方）**：7 类 30 个（字压表面、证据卡、数字、封面大字、转场、字动效、材质）。每个变体带参数、可测契约、对标帧、失败模式、检查项。

## 一次包装怎么选

1. 读这拍的 `intent`（title/concept/data）和 `surface`（page/map/object/screen/ground）。
2. 选 2–3 个候选：`node scripts/packaging.mjs --pick --intent <intent> --surface <surface> --recent <最近4拍用过的变体>`。
3. 看候选的 `refs.frames` 与 `refs.ranges`：对标的是**区间**（字占比、边距、对比度、颗粒），不是某一帧的坐标。
4. 用 `--variant <id> --params '{...}'` 解析参数；参数只能在声明范围内。
5. 套进这一拍：先定表面与锚点，再定字位，最后加材质（`ma-*`）。
6. 过检查：`contractErrors(variant, spec)` + `framecheck` + `typedesign`；任何一条不过就改参数或换变体，不许绕过。
7. 盲审 ≥4 才能留下。

## 硬规则

- 同一变体 4 拍内最多用 2 次；同分类一镜最多 2 个变体。
- 字必须压在真实表面或有明确介质；`ground` 只能用在封面/收束/纯黑底。
- 证据类镜头必须卡式包装（`ec-*`），不能全幅平铺。
- 数字必须有单位/口径（`dn-*` 的 `unitRequired`）。
- 转场不许默认硬切：两端都在动时用 whip/flash/match/push。
- 没有的变体就**新增**：写进 taxonomy（参数+契约+对标+失败模式+检查），加测试，再盲审；不许在项目里私写一套。

## 和现有系统的关系

- `typedesign` 管字的方向/几何/墨色；packaging 管**字怎么和表面/材料/转场结合**。
- `greybox` 是结构合同；packaging 的选择要能落到 greybox 的 block/type/screen 上。
- `framecheck` / `typebible` 是客观闸；packaging 的 contract 是它们的补充，不替代。
- 每次新增/修改变体：跑 `node --test scripts/test-packaging.mjs` 与全量 `npm run test:recipe-board`。
## 对标证据

- `routing/packaging-benchmarks.json`：回形针 11 段（46 beat/133 元素/51 设备）+ 胡泊 139 切分（69 镜位/9 章/12 label 的时长与 roomDiff）。
- 每个变体的 `refs.benchmarks` 指向具体 hupo label / paperclip device；`gaps` 是**还没量到**的，不许假装量过。
## Gawx 排版与配色

- 实测在 `routing/gawx-layout-colour.json`；`node scripts/packaging.mjs --gawx` 直接看。
- 排版变体：gl-stack-left / gl-centre-hero / gl-lower-third / gl-loose-single；字高占幅 3.2%–13.9%、边距 4.1%–28.6%、行数 ≤6、字数 ≤12。
- 配色变体：ch-dark-analogous / ch-dark-complementary / ch-coloured-ground-turn / ch-neutral-accent / ch-noir-single / ch-warm-cool-pair；一画面最多 2 个彩色族、同族 ≤45°、互补 150–210°、冷暖 90–150°、字底对比正文 ≥4.5、大字 ≥3。
- 每个变体都有实测 hex/关系值；`gawxErrors` 会逐条验，不过不许用。
## 已接入的强制

- 写卡时 `writer.mjs` 自动补 packaging + `packagingShotErrors` + `sequencePackagingErrors`，不过就回滚、不进渲染。
- `node scripts/packaging.mjs --assign --project <id> [--write]` 可批量给现有镜头分配/复检。
- 关闭仅调试：`RB_PACKAGING=0`。
## 大字效果（type-effect）

- 胡泊式大字当材料：灌图 te-image-fill / 渐变 te-gradient-fill / 挖空 te-knockout-window / 出画 te-oversize-bleed / 竖排 te-vertical / 层叠 te-layer-depth / 半调 te-halftone-mask。
- 一帧只用一个字效；主字 500–900px，可被画框裁，但关键字要读得出；小字只做单位/落款。
- 字可被照片遮 20–40%，或把照片挖进字里；不做平铺。
- 灌图/渐变字内最暗处对底 ≥3（大字）/≥4.5（正文）；读不出就换图或加深底，不描边不加影。
- 参考：`style-lab/reference-hupo/aesthetics/sheet-by-kind.jpg` T/PT/ED/EP/Q/R 行。
## 排版圣经优先（2026-11-03）

- 先读 `TYPE.md` + `routing/type-bible.json`：12 栏网格、边距 120/96、字号五档 300/200/128/64/48、最多三级、相邻级 ≥1.5×、一帧一个 hero、0.15em 字距、9 字/秒读速。
- 成熟稿：hero 拍最大压到 figure 200；type/evidence 拍压到 title 128；caption 48 只做来源。
- 大字效果必须有场景（照片/页面/3D），不许平黑底 demo；一帧一个字效；灌图/挖空必须实测 fillContrast ≥4.5 才许渲染。
- 证据页不许 object-fit:cover 裁掉标题；标签 ≥40px 且 ≥4.5:1，不压纹理上。
- 研究：`docs/analysis/TYPOGRAPHY-STUDY-20261103.md`；盲审 2.0 的七条 severity 3 在里面。
## 字体配合画面（type-image pairing）

- 先选场景 register，再选 `routing/type-image-pairing.json` 的 pairing；字体/字号/位置/材料都从 pairing 来。
- 页面/数据：House Kokka/Kikai，字覆盖页面栏，headline/来源/日期在；可加 highlight-block。
- 人物：House Kokka，≤128，低对比，脸旁负空间，typeBox 不碰 faceBox。
- 安静场景：Kokka 细衬线 ≤128，低对比，grain；禁止黑渐变。
- 产品/3D：可被主体遮 20–40% 或钉住；3D recap 才用挤出/金属。
- `pairingErrors` 会查 register/face/size/placement/黑遮罩/脸部重叠/遮挡比例/证据完整性；不过不许渲染。
