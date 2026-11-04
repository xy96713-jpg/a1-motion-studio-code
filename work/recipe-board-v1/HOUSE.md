# 家规（一页，现行）

**执行人更新（用户 2026-10-29）**：由 Codex 负责导演、任务写作和系统工作；Claude 已按用户要求退出当前生产调度；`manual` 仍是会话执行任务，不必改项目后端。盲审与仲裁由独立新审查人执行，定设计与成片仍由用户批准。此条取代旧的仅 Claude / 不用 Codex 表述。

这是现在有效的规则，一页读完。来由、细节和历史在 AGENTS.md、`routing/lessons.json`（被后来决定取代的教训标了 `supersededBy`，不再发放）和 `routing/house-rules.json`。和这一页冲突的旧说法以这一页为准。

## 文案→包装（默认指针链 · 继承）

把文章文案包装成动态包装片时，导演/agent **按此固定默认栈继承，不得自创旁路**：

1. **家规硬合同** — 本页「成熟」四条 + 「成熟第一稿检查清单」六条与对标两期 + 「动效和衔接」开场硬门（`opening-static-poster-no-build`）。
2. **构图短名单** — `routing/compositions.json` 十种：`hero-object` · `map-table` · `count-field` · `figure-card` · `sequence-line` · `evidence-card` · `split-compare` · `globe-route` · `queue` · `title-footage`。优先从这十种挑；**证据拍默认构图 `evidence-card`**。
3. **开场装置（只认 ready）** — `routing/devices.json`：开场只点 `kit.status === "ready"` 的 `lineup-row` / `copy-to-repeat` / `table-grows`，或章节路径 `mapPlane` / `subject` / `orbit`。空壳 `array-build` / `stagger-reveal` / `light-3d` / `presenter-close` 为 `kit.status: none`，不得标 ready，也不得当允许开场。
4. **金样** — `projects/paperclip-138-open/chapters/B01.mjs`（recipe-board 工程内，不是仓库根 `projects/`）。
5. **禁单** — `routing/lessons.json` + `routing/tells.json`（`supersededBy` 的不再发放）。

6. **导演路由表** — `routing/director-routes.json`：旁白语义/beat kind → composition → ready 装置 → gold（开场/证据/数字/地图/对比）；只点 `kit.status==="ready"` 或章节 `mapPlane`/`subject`/`orbit`，gaps 不得当 ready。**自动点名必须写入答案**（filmdesign/greybox 的 kind/composition/device），检查拦截「路由选了但答案未吃」。
7. **分镜运动合同** — `routing/shot-motion-contract.schema.json`（`A1ShotMotionContract/v1`）+ `tasks/session-*.motion.json`：session-brief §0.7 / 灰盒镜头表是章节工硬输入；`motionContractUneatenErrors` 拦截「运动合同选了但答案未吃」（与路由未吃同级）；偏离须 `greyboxDiffer`。

下游 filmdesign / greybox / visual-director / session-brief 必须继承同一条链；路由按表走，不从菜单空想。

## 流程（新片，设计关两关制：`project.json gateSet: "design"`）

1. **文案和事实**：拆拍、简报、分镜；每个数字有出处（正式媒体或官网，页面截存）。
2. **整片设计**：每拍的作用、配色/介质从短名单点名 id（`routing/palettes.json`、`media.json`；任务 `shortlists`，有 `byBeat` 时必须落在该拍短名单），写清理由；连续 clean 只作为单调风险提醒，由导演结合构图、信息变化与节奏判断，不因数量强制加介质；`evidence` 必须绑真素材；合适才用，不为做而做、不硬凑 LED。

### 多方案选图与锁图（用户 2026-11-04，硬规则）

- **先多方案**：设计阶段必须一次给出**至少 6 个可比较的图/方案**（同一组镜头、同一转场成对生图；不是一张图六个配色）。用户先挑，不许直接进复刻。
- **选中即锁**：用户选中的方案写入 `design-board.json` 的 `selected` + `lookLock`（`status:"locked"`, `reference`, 七项 rules, `delivery:"no-different-delivery"`，证据 still/motion/review）。机器策略在 `routing/look-lock.json`。
- **只复刻，不改设计**：下游必须复刻 `lookLock` 的构图、主体、机位、光、颜色、前后景关系、接缝七项；任何一项不同就是缺陷，不能以“更好”“实现不了”为由改掉后交付。
- **生图边界不变**：生图只能做参考/参考表面纹理，不能作为 final frame；final 仍由 `3d|real|procedural|graphic` 构建（`routing/media-policy.json`）。
- **交付证据**：每个锁定镜头必须给参考/渲染并排 still + 跨接缝 motion + 独立 review；`design-gate` 拒没有 lock 的 board，`mainline release` 拒没有 lock/证据的展示。
3. **灰盒动态粗稿**（`recipe-board.mjs greybox`，约一分钟出整片）：

### 任意文字包装闭环（2026-11-04）

任何题材都走同一条可检查的链，见 [PACKAGING-CLOSED-LOOP-20261104.md](../../docs/analysis/PACKAGING-CLOSED-LOOP-20261104.md) 和 `routing/packaging-workflow.json`：

**文本/事实 → 每拍视觉问题 → ≥6 设计选项 → 用户锁图 → 灰盒/运动合同 → 逐镜技术路由 → 帧差/接缝/盲审 → 交付。**

机器检查：`design-gate`（选项/锁图）、`packaging-audit`（每拍视觉落点/技术路由/camera/in/out/接缝）、`mainline release`（任务+设计+包装全过才允许展示）。任意一项失败，不许用“更好看/实现不了”绕过。
   - 快的照成片做：底、介质质感、字和版式、库里的模型、真素材；
   - 慢的占位：新模型、生图、重 3D；
   - 字的位置由求解器排，时间跟台词；
   - 镜头运动、入场、拍与拍的衔接不打折。

   过代码检查，再过一位新审片人的盲审，才给用户。灰盒只管走向和大错：连审三轮后，各项不低于 3、没有严重度 4 的问题就算过，剩下的意见写进各章任务书在章节里做（L124）。
4. **风格帧**：重头画面做成成片质量，过检查和盲审。
5. **定设计（用户关）**：灰盒粗稿、风格帧、整片设计板一起看，**只批一次**。批过之后的改动（灰盒、风格帧、静帧）不重开这一关、不挡章节，集中到成片预览给你看（2026-10-28：定样子/定设计只批一次……集中到成片预览给我看）。旧片的「定样子」同理。
   - **灰盒被代码打回（stale）**：只挡章节**过线接受**、新 `session-brief`、精渲；**不挡** `preview.mp4` / draft 白模快看（morph 检查记 warning；`latestChecked` 仍可取最新过代码检查的版本）。灰盒推镜对齐由总导演另修。
6. **逐章制作（灰盒≠成片，必须上引擎）**：灰盒只是设计关的动态粗稿与结构合同，**不是成片**。定设计批准后，线必须继续 `session-brief` → 逐章 morph，并按 `routing/engine-capabilities.json` / `director-routes.json` 走上引擎（model/subject/mapPlane/orbit/filmedScreen/pages…），**不得把灰盒当终态停住**。每章一个会话并行；代码检查加一轮盲审过线就交。用户关仍只有 design / final。
7. **成片预览（用户关）**：精渲前看整片动态粗稿；粗稿永远用最新过了代码检查的版本（章节和静帧的盲审在旁边跟着走），定设计之后改过什么在这一关列出来；预检（每章首中尾帧按精渲画）由系统自己过。
8. **精渲和复盘**：只重渲改过的；成片出来后自动出复盘单（`recipe-board.mjs retro`，`out/film/retro.md`：打回原因按类、你的意见、新教训、下一部片先改的三件事）；你的每条意见变成共用修复、检查、测试和教训。

## 评审

- 盲审一律由全新子代理做，只给任务、规则、schema；导演不给自己打分。
- 图生 3D 的参考视图和模型视觉审查也要留独立线程提交记录：由任务发起者生成 `*.ref-review.task.json` / `*.visual-review.task.json`，新审查人查看素材后写候选 JSON，运行 `node scripts/recipe-board.mjs submit-asset-review --name <模型名> --kind ref|visual --answer-file <候选文件>`。回执绑定任务和答案；线程相同、文件变化或缺回执均不放行。旧记录保留但不能自动视为已核实；这是工作流证据，不是防止本机文件或环境变量被篡改的安全机制。
- 关口过一次就算过：过线时没做完的清单收成备注，不在这部片上循环；之后改版只看有没有变差、有没有犯硬条件。
- 仲裁每拍每关一次，裁决有约束力；关口过线时不叫仲裁。
- 整片先于单拍：单拍口味评审要等整片评过一次。

## 画面分工

- 美术（底、纸、光、透视、道具）：生图，不带字。
- 事实（真人、截图、论文图、视频、产品图）：真素材，不生成。
- 可读的字、数字、数据图：代码。
- 不用基本形状拼美术。不让生图写字。
- 实物用做好的模型（`kit.props.model`），用之前先验收：六个视角里至少两个像它。地形用 `kit.props.landform`。一群东西围着主体用 `kit.props.formation`。
- **禁止照片贴在 Plane 上当 3D 主体** — 主体必须是 `kit.props.model` / `kit.engine.subject` / `block.model` / 真 mesh；**禁止**把 `PlaneGeometry`（或等价扁平面）+ 照片贴图当作主戏冒充 3D。照片只可作**非平面 mesh** 上的材质贴图。故意的 2D 证据卡 / 卡片平面若未声称是 3D 主体（`formFor`/`medium`/`role`）则允许。硬门：`chapter.mjs` → `photoPlaneSubjectErrors`（码 `photo-plane-as-subject`）。
- **有机/实物主体必须走既有管线到 QA 通过的 glb** — 规范：`AI 生图定形 → partset`（多视角 ref → Hunyuan3D-2mv / 或 Blender 低模）→ `parts/<name>.request.json`（`A1PartRequest/v1`）或 `parts/<name>.json`（`A1PartMesh/v1`）+ `parts/<name>.glb` → `modelCheck` 写出 `parts/<name>.qa.json`（`A1ModelCheck/v1` `ok:true`）→ 章节用 `kit.props.model` / `kit.engine.subject` / `block.model` 绑定。**禁止**把 `TubeGeometry` / `BoxGeometry` 填料、或未走 partset/无 QA 戳的匿名 glb 当作「成熟稿」主体（辅助线、地面、道具帮手仍可用基本体）。硬门：`chapter.mjs` → `subjectPipelineErrors`（码 `subject-pipeline-filler`）；成熟第一稿 `real-mesh` 条一并计入。对标磁盘：`subjects/parts/dredger.*`。

## 样子

- 一部片一套家里的样子（`routing/house-style.json`）：回形针与胡泊共同作为排版、信息设计、素材组织、镜头与节奏的完整成熟标准，吸收 Gawx 的字体张力、色彩与表现力，不按作者机械分工，也不是三种皮肤任选。先决定观众要理解的关系，再决定构图与动作，最后选择材料和介质。
- **方法参考（用户选定的 3 / 4）**：Channel 4 提供“共用设计与运动规则下的内容适配和跨镜连续性”；Ordinary Folk 提供“静帧构图与动作一起设计”。接入现有整片设计、导演意图和运动合同，不新增风格模式。每镜说明起态、信息变化、可读落态和下一镜交接；停留与明确硬切也是有效决定，不强迫变形、同向运动或品牌式弹跳。统一规则允许段落变化，不固定坐标和模板。
- **智能导演负责选择**：以表达准确、阅读清楚、段落节奏、前后承接为依据；采用材料或效果须说明相比不用增加了什么，不为丰富而凑效果或介质配额。变体改变主体关系、构图或揭示顺序，不只换颜色。机器检查合同与执行证据，不能代替实际画面的设计和节奏判断。
- **材料更新**：米纸不再作为新设计的默认材料；LED、CRT 和其他显示介质仅在内容适合时选用，干净画面同样可以成熟，不强制复古。已有用户批准的画面不据此自动改写；GrandArmy / Territory 的案例未被用户采用，不纳入本次参考。
- 配色按内容组织、和谐：可用胶片红、芥黄、钴蓝、靛蓝夜、青海图、中性暗；不以固定颜色族数或暗底占比代替设计判断，不为过配额强行换色；不要脏褐；点缀色只给关键处。旧片的米纸配色目录保留用于历史复现，不作为新设计默认推荐。**成熟默认**：主色一条脊（见上节），相邻拍不无理由跳第三套色相。
- 介质：画面本来就在屏上的拍才上屏（读数、记录、信号、旧画面、网页软件）；证据和网页放在被斜着拍的屏上，不平贴满屏。
- 不用：撕纸条、红底字签、钴蓝油墨印刷、3D 卡通小人、金属 3D 字。


## 成熟（默认气质 · 硬合同）

**默认成熟 = 图二气质**（少色、大字压场、真图重复、证据卡式包装——黄底主脊 + 大号竖排 + 照片重复 + 暗红证据卡），对齐下列四条可执行硬合同；**不是**再拧 usage 文案。流水线默认出这种片（答案结构可测；像素级后补）：

1. **主色一条脊** — 全片一条领衔色相（或中性承运）。相邻拍不得无理由跳到第三套色相：同族或 RELATED（mustard↔film-red、cobalt↔indigo↔teal）放行；经 noir / cream-print / amber-lamp 中性过渡放行。色相跳变记 `palette-spine-jump`：usage 表对未声称/旧片仍 **warn**；**声称 `matureFirstDraft` 或 design-set 新片（`gateSet:"design"` / `project.matureFirstDraft:true`）→ greybox **fail**（P0 C2 2026-10-29；与「硬合同」对齐，不再假 warn-only）。
2. **标题字压场** — 对齐 TYPE 五档。`hero` 拍最大字 ≥ **figure（200）**；`medium=type|evidence` 拍最大字 ≥ **title（128）**。字弱 → greybox fail（`title type too weak`）。
3. **证据必须卡式包装** — `medium=evidence`：证据块嵌在卡板内或明显内嵌（share ≤ ~72%），带 **来源 caption**（role=caption 或 caption 档出处/日期），且有 ≥ title 的大字。**禁止**整页 Wiki / 新闻截图平铺当主画面（evidence share ≥ ~78% 且无卡板 → fail）。错误含 `evidence is not card-packaged`。
4. **禁止空框 / 孤大叉 / 半屏占位几何当主画面** — 无 image/model 的大 rect|ellipse（subject ≥ ~28% 或任意 ≥ ~45%）且同镜无 photo/screen/map/image 填充 → fail；孤「X / 大叉」占主位 → fail。错误含 `empty placeholder` / `lone big X`。

实现：`apps/studio-next/src/lib/recipe-board/mature.mjs`；硬门进 `greyboxErrors`；脊进 `houseUsageMeter` warn。测例在 `scripts/test-recipe-board.mjs`。

## 成熟第一稿检查清单（章节交稿前 · 六条 + 对标两期）

声称「成熟第一稿」前，本章须六条都过（人读合同；机器可对 `routing/mature-first-draft.json`）。**不是** banana 单片改写清单；**不是**把空壳 `kit.status: none` 标成 ready。与上节「成熟」四条硬合同叠加，不替代。

1. **动效** — 每镜有镜内运动（`camera.move`≠static，或块/字入场）；开场只走已接线 ready 装置或章节 `mapPlane`/`subject`/`orbit`；停—动—停，禁止静帧海报硬切（`opening-static-poster-no-build`）。
2. **材料包装** — 证据卡式包装 + 来源 caption；屏/网页用 filmed 斜拍，不平贴；真素材，不拿生图冒充事实（胡泊线）。
3. **字体排版** — 家用字 + TYPE 五档；标题压场（hero≥figure、type/evidence≥title）；字组零件排，不描边阴影。
4. **低模真 mesh** — 主体是 `kit.props.model` / `kit.engine.subject` / `block.model` / 真 mesh；**禁止** Plane+照片当 3D 主戏（`photo-plane-as-subject`）；**禁止** Tube/Box 填料或未 QA 的匿名 glb 当成熟主体——须走 AI→partset/Hunyuan 或 Blender→`A1ModelCheck` 通过的 glb（`subject-pipeline-filler`）。
5. **一镜戏核** — 一章一镜戏核清楚：先定镜头怎么走、画面怎么变，再铺字；字跟台词与运动落点进。
6. **接缝转场** — 进出拍衔接有设计（硬切两边停稳；动着的带着同一运动；换世界 whip/glitch/flash）；切点两边都有东西。

**对标两期（HOUSE 默认，非 banana）** — 口味与金样以磁盘已批为准，不另造：

- `paperclip-138-full`（回形针 Vol.138）— `routing/taste.json` approved「回形针 Vol.138 整片」；`house-style.json` 认可变体；`director-routes.json` opening/evidence gold。
- `hupo-69`（胡泊）— `house-style.json` 证据包装变体；`taste.json` 胡泊审美 approved（`hupo-auto2`）；`director-routes` 证据注胡泊线；exemplars `hupo-replica`。

机读表：`routing/mature-first-draft.json`。session-brief 每章注入同清单。**运行时门**：答案/工程声称 `matureFirstDraft` 时 `matureFirstDraftErrors` 硬失败（缺条列出）；未声称不挡。**P0 C3 选择（2026-10-29）**：`ensureProject` 新建片默认写 `matureFirstDraft: true`（design-set 新片默认 claim）；**不**回溯给已有 design-set 片（banana/suez 等）自动加 claim，以免 seams/mesh 条无准备时整片红。greybox 成熟 claim 路径注入 `photoPlaneSubject` / `subjectPipeline` 静态错误进 real-mesh 条。

## 字

- 只用家里的字：f.k 機械彫刻、スミカク、黒華明朝、装甲明朝、金畫字、廻想体 ネクスト，思源黑体 Heavy 只兜底。
- 大字 90 px 以上用黒華明朝拉高（×0.72）；小字黒華明朝；拉丁和数字用廻想体。整片一套，镜头不自己挑字体。
- 字不加描边、阴影、发光，不加下方或侧方的红线；强调只靠颜色和大小。
- 画面字是繁体；系统不加字幕；中文至少 34 px；不进 935 px 以下的字幕带；不贴边（24 px）；一屏最多三行要读；字随声出，最早提前 0.3 秒。

## 排版

- 排版圣经（`TYPE.md`，数值 `routing/type-bible.json`）：12 栏网格、五档字号、大小字左对齐按台词顺序上下、关键数字和标题在屏幕网格上、全片同一角色同一字号、点缀色一帧一处；代码按每拍停稳的一帧量（`typebible.mjs`）。灰盒硬门 `typeHierarchyErrors`：一帧最多三级、相邻两级至少 1.5×、最大档只有一个。
- 按看得见的笔画排和量，不按字号盒子：数字和中文一样高；大小字一组，一起钉住、一起移动，左边差不过 6 px；两行之间只有一个间距（笔画到笔画，大字字号的 0.15 倍）；整拍每 0.2 秒都量。排字用 kit2 的 pair / peakType / evidenceCard，不手算（2026-10-28：数字和文字为什么对齐不了；间隔……应该可以更规范的）。
- 一帧的字是一个字组：`typeBlock`、`spreadWord`、`pair` 等零件排，标签用 `labelBy` 贴着它的东西；成熟规范和出处在 TYPE.md §7、§8。你认可过的设计锁在 `project.json userLocked`，审片口味意见不改它。

## 动效和衔接

- **导演先定镜头戏再铺字**：每镜必须有镜内运动（`camera.move`≠static，或块/字的入场运动），并写清字进时机（`type.in` / `enter`）；先看镜头怎么走、画面怎么变，字跟着台词和运动落点进，不先贴满字再硬切。
- **开场禁止静帧海报硬切（系统默认，不是单次改片）**：前 2–3 镜或 `act=open` / hero 开场，**只认已接线真装置** `lineup-row` / `copy-to-repeat` / `table-grows`，或**章节引擎路径** `mapPlane`（灰盒 `shape: map|globe|chart`）/ `subject`（`block.model`）/ `orbit`（`model` + `camera.move=orbit`）。**未接线空壳** `array-build` / `stagger-reveal` / `light-3d` / `presenter-close` **不得** `kit.status: ready`，也**不能**过硬门；同图×N 错开 CSS rise **不算**阵列。**明确禁止**把「一张静帧照片海报 + 大字硬切」当开场主戏；单镜横移/推入扫一张已钉死的全幅照片**不算**过关。
- 下游 agent **不得绕过 HOUSE** 自创静图开场：必须走上述已接线装置或章节路径 + greybox blocks 兑现，再经 `openingMotionErrors` 硬门。
- 镜头起停都缓（settle），相连的运动是一个运动。
- `push` 必须有真 from/to **景别**变化（缩放 `s` 起止不同）；非 static 须显式 from/to（或 keys）且起止不同。
- 每处衔接都要设计：
  - 硬切：两边都停稳；
  - 动着的：带着同一个运动过去；
  - 换世界：用快甩、信号坏或闪白盖住；
  - 切的那一刻两边都有东西在画面上。
- 静止的东西开始动不能跳。
- 硬门：`greybox.mjs` → `openingMotionErrors`（码 `opening-static-poster-no-build` / `opening static poster`）/ `midFilmFakeArrayErrors`（片中同图×N / CSS 克隆冒充阵列 → `mid-film-fake-array`；已接线 lineup-row / copy-to-repeat / table-grows 或 prop family 多样性放过；章节 `repeatErrors` 同码）/ `cameraMotionErrors`（开场无已接线装置/章节路径的静帧海报、push 无景别变化 → fail）/ `hardCutSettleErrors`（硬切两边须停稳）/ `flashSeamErrors`（闪白时长/可读：时长带内、cut 进字不压在闪白峰、落点够 settle 可读）/ `typeHierarchyErrors`（一帧 ≤3 档、相邻档 ≥1.5×、最大档唯一 — TYPE.md §7）/ `greyboxDeviceKitErrors`（选中 device 须 `kit.status===ready`）。
- **开工钉死**：design-set 下 greybox-advance 须 filmdesign accepted + storyboard current（`greyboxAdvancePinErrors`）；session-brief / morph 须 design 已批（`chapterStartPinErrors`）。

## 素材

- 可信来源和点名对得上的自动放行；泛泛和弱匹配等用户确认。
- 找不到就换说法再搜，再不行用 3D 概念或生图示意顶上，不留空。

## 工作方式
- **粗版 gateProfile（fill/busy-ground）**：`gateProfile=rough-cut` 时，「主体偏上 fill」（balance）与「ground busier than subject」降为 **warn**（同 B26 calm）；**字被 3D 穿过 / 文盖物** 仍 **HARD**。成片/full 全硬。
- **社区 Opus 线（接线债，非散文家规）**：成片是程序（seek/纯 f(t)），不是一句话出片；先定格/接触印再精渲；细则与验收见 `docs/debt/OPUS55-TOP-ARCH-WIRE-2026-10-29.md`。可进口令见本机 OpenVideoHarness `playbook/00-paradigm.md`、`02-verification.md`（硬规则 1·接触印），**勿在片内重造 OVH**。
- 修系统，不修单镜：一类问题 = 共用代码修改 + 让镜头失败的检查 + 测试 + 教训。
- 改完跑 `npm run test:recipe-board`；只提交自己的文件，测试全过才提交。
- 用量自检：`node scripts/recipe-board.mjs usage --project <id>` → `out/film/house-usage.json`（屏/色/缝/证据 flags，不代打分）。
- 不代批用户关：定设计和成片预览都要用户看过、用自己的话批了，才往下走（精渲一定等用户确认；2026-10-28：没确认好怎么就精渲呢）。代码检查、盲审、预检这些技术关由系统自己过。
- 用户长时间不回复时自动批（2026-10-28：如果我长时间没恢复可以自动渲染精磨；`routing/autonomy.json`）：定设计和成片预览先给用户看，等 4 小时，期间用户没说话，线才自动批。批注写明「自动」、等了多久、依据哪句授权，用户随时可以推翻。会话不能用自己的名义批。
- 自动批的证据要求：文件做好不等于用户看过；项目意见日志为空也不等于聊天里无人回复。需要同一版本的展示回执和覆盖至审批时刻的用户活动记录。当前尚未接入可信的展示和聊天活动回执，因此自动批暂不执行；用户仍可明确审批。不得把技术上就绪记成已展示。
- 总导演一个会话：写任务书、守整片统一、收各章、跑整片评审和精渲；不一个人逐拍抠细节。
## 六段与 art（P0 G3 2026-10-29）
`process: "six-stage"` 经 `sixSkips` **只跳过** `concept` 与卡片线的 `critique` / `direct` / `motion`。**`art` 不跳**——六段片仍跑素材建造 / style-lab 生图美术层（`node scripts/recipe-board.mjs art`）。不要把「六段」理解成不做 art。