# MAINLINE（由 routing/mainline.json 生成）

> 不要手改；改 routing/mainline.json，再跑 node scripts/mainline.mjs docs。

## 权威文档

- work/recipe-board-v1/HOUSE.md — house-rules
- work/recipe-board-v1/ART-DIRECTION.md — design-preflight
- docs/analysis/BANANA-DESIGN-BIBLE-20261103.md — banana-film-design
- work/recipe-board-v1/DIRECTOR.md — director
- work/recipe-board-v1/SHOT-DIRECTION.md — camera-and-seams
- docs/analysis/WORKFLOW-V2-20261103.md — workflow
- docs/analysis/GENRE-PIPELINE-20261103.md — medium-choice
- docs/analysis/MAINLINE-CONSTRAINT-20261103.md — constraints
- work/recipe-board-v1/routing/look-lock.json — look-lock-policy
- work/recipe-board-v1/routing/packaging-workflow.json — packaging-closed-loop
- docs/analysis/PACKAGING-CLOSED-LOOP-20261104.md — packaging-closed-loop-guide
- docs/analysis/WORLD-BOARD-HEADLESS-20261104.md — world-board-headless
- work/recipe-board-v1/routing/world-board.json — world-board-policy
- docs/analysis/REPRODUCTION-MATRIX-20261104.md — reproduction-matrix
- work/recipe-board-v1/MAINLINE.md — generated-index
- docs/analysis/TECH-STACK-TRIAGE-20261104.md — tech-stack-triage
- work/recipe-board-v1/routing/video-providers.json — video-provider-policy
- work/recipe-board-v1/routing/tech-stack.json — tech-stack-catalog
- docs/analysis/DIRECTOR-TECH-STACK-20261104.md — director-tech-stack
- work/recipe-board-v1/routing/effects.json — effect-catalog
- docs/analysis/MOTION-EFFECT-STACK-20261104.md — motion-effect-stack
- work/recipe-board-v1/routing/quality-gates.json — quality-gates
- docs/analysis/QUALITY-FIRST-WORKFLOW-20261104.md — quality-first-workflow
- work/recipe-board-v1/routing/benchmarks.json — benchmark-gate
- work/recipe-board-v1/routing/composition-gate.json — composition-gate
- work/recipe-board-v1/WORKING-MODE.md — agent-working-mode
- work/recipe-board-v1/routing/project-routes.json — project-routes
- work/recipe-board-v1/routing/occlusion-rules.json — occlusion-rules
- work/recipe-board-v1/routing/media-policy.json — media-policy
- work/recipe-board-v1/routing/scene-unit-rules.json — scene-unit-gate

## 已废弃

- docs/analysis/BANANA-SHOT-SCHEDULE-20261103.md — 被 docs/analysis/BANANA-DESIGN-BIBLE-20261103.md 取代：old paperclip-style shot table; design bible 20 shots / 19 seams is authoritative

## 阶段

- intake — 文案/事实/参考
- semantic — 语义切分/镜数/缝
- art-direction — 视觉论点/≥6 方案/选中锁图/帧/动态
- design-gate — 设计门（用户）
- previz — 真 3D previz
- shots — 逐镜设计/3s/接缝
- final — 全片/盲审/final 门

## 项目

- banana-design — phase=design, next=B01, design=rejected, board=work/recipe-board-v1/projects/banana-design/design-board.json；用户 2026-11-03 退回：三版 B01 不叫设计；20 镜/19 缝为设计圣经，B01 未过。

## 命令

- node scripts/mainline.mjs status --project <id>
- node scripts/mainline.mjs check --project <id>
- node scripts/mainline.mjs release --project <id> --task <task> --review <name>
- node scripts/design-gate.mjs --project <id>
- node scripts/packaging-status.mjs --project <id>
- node scripts/mainline.mjs decide --project <id> --gate design --status approved|rejected --by <words> --reason <why>
- node scripts/mainline.mjs audit
- node scripts/mainline.mjs docs
