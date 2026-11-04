# Hairline：有限静帧能力与验证

- 可选能力仅为 `exploded` 固定 phase 静帧：原包 `@lucasmarkes/hairline@0.5.1` 在独立 iframe 计算后栅格化，作为素材进入 `stepStills`。它不驱动母片时钟，不承诺动态播放或运动验收。
- 项目根和输出目录符号链接会被拒绝；最终文件已存在的符号链接则由同目录原子 rename 替换链接本身，不跟随或截断其目标。此设计不构成抵御不可信同 UID 并发进程的沙箱；构建步骤也不在浏览器超时范围内。
- 执行挂起、关闭挂起/抛错使用受控伪浏览器测试真实编排分支和 profile 清理；这不证明真实 Chrome 进程树在所有故障下被清理。启动挂起测试另用受控子进程。跨项目、变更 PNG、伪造令牌均 fail closed。
- 2026-10-31 的隔离真实 `stepStills` 证据位于 `/Users/a1/.hermes/cache/scratch/hairline-handoff-20261031/hairline-proof/manifest.json` 及同目录各 variant 的 task、answer、check 和帧。它含每轮代码/任务/答案、renderInputs、renderBindings、输出帧和实际入口代码哈希；临时目录受清理策略约束。此 fixture 使用克隆的引擎资源及当前调用入口，不是正式 banana 项目。对照只有启用或移除 Hairline（同时移除对应 draw 调用）；启用固定 phase 192 ms、intensity 0.8，重复一次。三轮技术检查 `ok`，等待独立视觉评审；重复图三帧哈希相同，启用与否只在 B02 的 (1369,636)-(1591,776) 区域不同。这里的对照是本轮生成，不声称与历史旧 baseline 像素一致。
- 本轮第一次使用工作区 source root 因页面 JSON 解析失败而未加载；第二次使用克隆 source root 时旧 fixture 的 B10 来源文件绝对路径指向旧克隆，导致事实检查拒绝。仅在隔离克隆中修正文件路径后完成三轮，不修改正式项目、审批或安全阈值。
- 技术通过不等于成熟包装或审美验收；实际生产交付仍需独立审美评审以及用户所需的设计/最终关口。
