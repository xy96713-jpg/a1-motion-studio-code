# Still-review pack 正式消费者接线（2026-10-30）

## 已接线

- `stills.mjs::stepStills` 在真实 `runtimeCheck(taskMode:'stills')` 前后采集输入清单，输入不变才保存 inputHash→frameHash；`chapter.mjs` 在截图的同一采集中给 shapes 遥测加 frameHash。check 同时 pin 遥测文件哈希。旧图/旧遥测不补签；缓存缺绑定或图/遥测变化会重新真实渲染。
- `reviewPackForCheck` → `prepareStillReviewTasks` 在首次写任务前生成并校验包。三个角色原图、480px 缩图、测量叠图进入原 `taste-review.schema.json` 任务；原图仍排在前面，保留 `keyframe` 索引含义。
- `forAnswer` 使用作者答案字节 SHA256 前16位，与既有 `submitTaskAnswer` / `reviewSubmissionStatus` 一致；技术缓存另用 `forCheck`。作者任务用稳定 inputHash，轮询不重写时间戳。
- 两位评审分别使用 `stills-taste`、`stills-taste-2` 任务与标准 submission 回执，不再靠手写旧 `stills-taste.answer-2.json` 或 mtime 冒充独立评审。作者与两位评审线程均须不同。
- 分发 `runCodexTask`、提交 `submitTaskAnswer`、正式消费 `stepStills` 及就绪判断 `stillsReady` 检查当前材料字节。未知/过期渲染绑定、缺失角色、变更原图/overlay 均不能被视觉通过。
- hero 任务清单是 B02/B04/B10；全片缺17镜另列 `input.filmCoverage`，不将20镜误作单次 stills 的硬覆盖。

## 真实验证

规定 scratch fixture：`/Users/a1/.hermes/cache/scratch/stills-mode-acceptance-20261030`。生产 banana 项目未运行，未修改其原图、审批、候选或布局。

- `scripts/test-stills-runtime-consumer.mjs`：正式 `stepStills` 真实浏览器渲染3镜，返回 `review`，三镜绑定均 `bound`，三角色全部 available；任务覆盖无缺镜，全片缺17镜。重复轮询任务字节完全相同；`heroChapter` 仍拒绝把静帧通过升级成运动通过。
- `scripts/test-stills-runtime-negative.mjs`：真实裁切、U+10FFFF 缺字、错误出处年份2006分别触发实际检查；正测恢复后仍返回 review。
- `scripts/test-stills-review-runtime.mjs`：通过真实 submitTaskAnswer 写入 **明确标为 TEST ONLY 的模拟线程与低分答案**，正式 stepStills 实际消费两条回执并拒绝三镜，stillsReady=false。finally 恢复全部 tasks 字节。不是独立视觉审查，也没有创建生产评分或通过。
- `scripts/test-stills-review-consumer.mjs`：隔离 fixture 的首次写入附件、稳定轮询、同线程拒绝、两条独立回执、旧 overlay 拒绝提交和分发、unknown binding 拒绝。
- 已确认主测试原有 `test-stills-task-mode` 入口不重复；新增 awaited imports：`test-still-review-pack` 与 `test-stills-review-consumer`。真实浏览器测试保持显式 opt-in，拒绝非 scratch 根。
- 全套：818 tests，757 pass，61 skipped，0 fail。日志 `/Users/a1/.hermes/cache/scratch/stills-review-integrated-full.log`。目标文件 `git diff --check` 通过。

复现：

```sh
TMPDIR=/Users/a1/.hermes/cache/scratch npm run test:recipe-board
export RECIPE_BOARD_REPO_ROOT=/Users/a1/.hermes/cache/scratch/stills-mode-acceptance-20261030
export RECIPE_BOARD_SOURCE_ROOT="$RECIPE_BOARD_REPO_ROOT"
export TMPDIR=/Users/a1/.hermes/cache/scratch
node scripts/test-stills-runtime-consumer.mjs
node scripts/test-stills-runtime-negative.mjs
node scripts/test-stills-runtime-consumer.mjs
node scripts/test-stills-review-runtime.mjs
node scripts/test-stills-runtime-consumer.mjs
```

证据在 scratch：`stills-task-mode-result.json`、`stills-negative-result.json`、`stills-review-receipt-consumer-result.json`、项目 `tasks/stills*.json`、`out/stills-review/<forCheck>/review-pack.json` 与角色图。回执测试的模拟数据只用于拒绝路径，最后恢复，不冒充真 reviewer。

## 边界 / 父会话仍需整合

- `visualInspection:unknown`、`aestheticVerdict:not-assessed` 不变。三镜 reference consumption 仍 unknown，故 pack.complete=false；角色与任务覆盖齐备≠参考达到水准。任务保留现有构图范例，需要真实新审查人判断。
- overlay 来自同帧 drawn ink + registered shapes，不会自动识别 mesh 边界、截图内部纸面/摘句/黑承载区；方法说明明确保留这些 unknown。B10三层边界和轴关系须由另一 worker 的布局/跨元素遥测整合后重新真实渲染，不拿现有字组框冒充全画面光学校准。
- 输入 manifest 覆盖作者/设计答案、项目/故事板/风格/素材绑定、准备素材、引擎文件/字体/路由；它是本地渲染依赖记录，不是防篡改证明。未登记、绕过项目资产机制从任意外部路径/网络读取的模块依赖不能被本模块自动发现。
- 旧 standalone 包保持历史状态（当前 verification-current=false），没有强绑新代码。没有配音、动画、正式视觉批准或 commit。
