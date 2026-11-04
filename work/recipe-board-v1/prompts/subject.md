# 拆件计划：给"拆开看"的 3D 示意模型分部件

一个拆解镜头点名了一件库里没有的东西。系统会把它拆成几个部件，每个部件用多视角生图 + Hunyuan3D-2mv 做成模型，按你的计划摆好、在爆炸图里拿开。你写的是这个计划；任务文件 `tasks/subject-<id>.task.json` 的 `input.what` 是对象，`input.context` 是口播原句（可能为空）。答案写到 `tasks/subject-<id>.answer.json`，系统检查（`subject.mjs` `planErrors`：schema，再 `checkPlan`）通过才收，不通过的理由在 `subject-<id>.check.json`，改了再写。

## 怎么拆

把它拆成 2 到 5 个看得见、讲得出名字的部件（外壳算一个）。挑口播会讲到的、爆炸图里一眼认得出的，不要螺丝、线缆这类小零碎。

每个部件写：

- `name`：英文小写字母（可带数字），2 到 16 个字符，唯一（例如 `shell`、`motor`、`board`）。
- `label`：中文名，4 个字以内。
- `words`：口播里可能指它的中文词，2 到 4 个。
- `what`：给图像模型的英文描述，只写这个部件本身的样子（材质、形状、颜色），通用、不带品牌，不要文字和数字。
- `size`：`[长 x, 高 y, 深 z]`，厘米，按真实比例，每边大于 0、小于 500。
- `at`：部件底面中心的位置 `[x, y, z]`，厘米。三维坐标 y 朝上、x 是长度方向；整件东西放在原点附近、底面在 y = 0。
- `explode`：爆炸图里它往哪个方向拿出来，方向向量 `[x, y, z]`（系统会归一化，拿开的距离按整件大小定）。外壳朝外或朝上，内部件按装配顺序错开，不要都朝同一边。
- `outer`：是不是包在外面、要看里面时先藏起来的壳。不能每个部件都是 `outer`（那就没有里面可看）。

整件东西：`label` 是它的中文名；`aliases` 是口播里可能指它的说法（2 到 5 个）。

## 输出

只输出 JSON，正好这些键，不加别的：

```json
{
  "label": "电动牙刷",
  "aliases": ["电动牙刷", "牙刷", "这支牙刷"],
  "parts": [
    { "name": "shell", "label": "外壳", "words": ["外壳", "机身"], "what": "a slim white glossy plastic handle shell, hollow, rounded edges", "size": [20, 3, 3], "at": [0, 0, 0], "explode": [0, 1, 0], "outer": true },
    { "name": "motor", "label": "马达", "words": ["马达", "电机"], "what": "a small cylindrical metal vibration motor with a short shaft", "size": [4, 1.5, 1.5], "at": [6, 0.75, 0], "explode": [0.3, 1, 0.6], "outer": false },
    { "name": "battery", "label": "电池", "words": ["电池", "锂电池"], "what": "a cylindrical rechargeable battery cell, plain metal wrap", "size": [6.5, 1.4, 1.4], "at": [-4, 0.8, 0], "explode": [-0.3, -0.5, 0.8], "outer": false }
  ]
}
```
