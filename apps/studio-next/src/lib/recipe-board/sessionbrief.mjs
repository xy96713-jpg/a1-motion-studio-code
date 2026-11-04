// A chapter's production brief for its own session (the user 2026-10-28: 可以创建子对话执行 … 按你推荐的都执行好). Once
// the design is approved, each chapter is built in a session of its own, in parallel; the session that directs the film
// writes the briefs, keeps the film one, and takes the chapters in. A brief is always the same shape, generated from the
// approved design — so every chapter is built to the same picture, the same rules and the same finish line:
//   what: the chapter's beats, their words, their greybox (frame, blocks, type, camera, seams in and out), their place in
//   the film's design (palette, screen, why); read first; the files it owns; how to run its chapter only; when it is done
//   (code checks, one blind review round — a gate passes once); what it reports back. Nothing here decides for it: the
//   brief points at the approved design, the line's checks hold it.
//   node scripts/recipe-board.mjs session-brief --project <id> --chapter <B02>   -> tasks/session-<chapter>.md + session-<chapter>.motion.json (A1ShotMotionContract/v1)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { projectPaths } from './store.mjs';
import { motionContractSummary } from './shotmotion.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// Preserve director-authored motif/model/delivery details. A changed core instruction must be
// reconciled explicitly; silently replacing it would make the chapter inherit the wrong design.
export function reconcileMotionContract(existing, generated) {
  if (!existing) return { contract: generated, errors: [] };
  const errors = [], byId = Object.fromEntries((existing.shots || []).map((s) => [s.shotId, s]));
  if (existing.motionRules && JSON.stringify(existing.motionRules) !== JSON.stringify(generated.motionRules)) errors.push('motionRules conflict with the accepted film design; reconcile explicitly');
  if (existing.chapter !== generated.chapter || (existing.project && generated.project && existing.project !== generated.project)) errors.push('existing motion contract belongs to another chapter or project');
  for (const old of existing.shots || []) if (!(generated.shots || []).some((s) => s.shotId === old.shotId)) errors.push(`${old.shotId}: existing director motion has no matching current beat`);
  const shots = (generated.shots || []).map((fresh) => {
    const old = byId[fresh.shotId]; if (!old) return fresh;
    if (old.directorIntent && JSON.stringify(old.directorIntent) !== JSON.stringify(fresh.directorIntent)) errors.push(`${fresh.shotId}: directorIntent conflicts with accepted film design; reconcile explicitly`);
    for (const [label, a, b] of [['camera', old.camera?.move, fresh.camera?.move], ['seam', old.seam?.out, fresh.seam?.out]]) if (a && b && a !== b) errors.push(`${fresh.shotId}: existing ${label} ${a} conflicts with current ${b}`);
    if (old.subjectMotion && fresh.subjectMotion && old.subjectMotion !== fresh.subjectMotion && old.subjectMotion !== 'subject-motion' && fresh.subjectMotion !== 'subject-motion') errors.push(`${fresh.shotId}: existing subject ${old.subjectMotion} conflicts with current ${fresh.subjectMotion}`);
    if (old.subject?.model && fresh.subject?.model && old.subject.model !== fresh.subject.model) errors.push(`${fresh.shotId}: existing subject model conflicts with current greybox`);
    if (old.seam?.poseFrom && fresh.seam?.poseFrom && JSON.stringify(old.seam.poseFrom) !== JSON.stringify(fresh.seam.poseFrom)) errors.push(`${fresh.shotId}: existing seam pose conflicts with current greybox`);
    if (Number.isFinite(old.type?.in) && Number.isFinite(fresh.type?.in) && Math.abs(old.type.in - fresh.type.in) > 0.05) errors.push(`${fresh.shotId}: existing type timing conflicts with current greybox`);
    return { ...old, ...fresh, subjectMotion: fresh.subjectMotion === 'subject-motion' ? old.subjectMotion || fresh.subjectMotion : fresh.subjectMotion, camera: { ...old.camera, ...fresh.camera, camMoveMin: fresh.camera?.camMoveMin ?? old.camera?.camMoveMin ?? null, camMoveMax: fresh.camera?.camMoveMax ?? old.camera?.camMoveMax ?? null },
      subject: fresh.subject || old.subject || null, seam: { ...old.seam, ...fresh.seam, poseFrom: fresh.seam?.poseFrom || old.seam?.poseFrom || null } };
  });
  return { contract: { ...existing, ...generated, about: existing.about ?? generated.about, motif: generated.motif || existing.motif || null, delivery: generated.delivery || existing.delivery || null, shots }, errors };
}

// (pure, tested) the brief's text from what the line knows of the chapter
export function briefText({ id, chapter, beats, greybox = {}, film = {}, neighbours = {}, files = {}, notes = [], usage = null, legacy = false, routes = {}, lookdev = {}, motionContract = null, recovered = null }) {
  const rows = beats.map((b) => {
    const g = greybox[b.beat] || {}, f = film[b.beat] || {}, rd = routes[b.beat] || null;
    const blocks = (g.blocks || []).map((k) => `${k.label}（${k.model ? `模型 ${k.model}` : k.image ? `图片 ${k.image}，来源以素材记录为准` : `占位 ${k.shape}`}，${k.role}）`).join('、') || '无';
    const type = (g.type || []).map((t) => `「${t.text}」${t.role}${t.size ? ` ${t.size}px` : ''}`).join('、') || '无';
    const routeLine = rd?.kind
      ? `- 导演路由默认：kind=${rd.kind} → composition=${rd.composition || '?'} → devices=[${(rd.devices || []).join(', ')}]${rd.chapterPaths?.length ? ` → chapterPaths=[${rd.chapterPaths.join(', ')}]` : ''}`
      : null;
    return [`### ${b.beat}（${b.at}–${(b.at + b.dur).toFixed(1)} 秒，${b.dur} 秒）`, `- 台词：${b.text}`, `- 整片设计：${f.act || '?'}，配色 ${f.palette || '?'}，介质 ${f.screen || 'clean'}${f.hero ? '，重头' : ''}；为什么：${f.why || ''}`,
      ...(f.directorIntent ? [`- 导演语义：${f.directorIntent.question}；画面变化：${f.directorIntent.change}；理由：${f.directorIntent.reason}`, `- 分层：真实证据 ${f.directorIntent.layers?.evidence || '–'}；无字美术 ${f.directorIntent.layers?.art || '–'}；字与数据 ${f.directorIntent.layers?.type || '–'}`] : []),
      ...(routeLine ? [routeLine] : []),
      ...(lookdev[b.beat]?.chosen ? [`- 定样子目标帧（本章必须复现）：${lookdev[b.beat].chosen.file}；参考 ${lookdev[b.beat].reference || 'house/style'}；为什么选它：${lookdev[b.beat].chosenWhy}；实现：${lookdev[b.beat].achievable}`] : []),
      ...(rd?.gold || []).map(file => `- 本拍路由金样（${rd.kind || '参考'} / ${rd.composition || '未指定构图'}）：${file}；只借适用方法，不继承验收。`),
      ...(rd?.references || []).map(r => r.adapter === 'hupo-original-index' ? `- 历史索引 ${r.key}：${r.semantic.title}；索引 ${r.source}；帧索引 ${r.frameIndexSource || 'unknown'}；clip=${r.clip.start}–${r.clip.end}，indexedFrame=${JSON.stringify(r.indexedFrame)}，timeStatus=${r.timeStatus}；图像身份 unknown，版权 unknown，仅供研究，不代表当前审批。` : `- 图像参考 ${r.key}：${r.frame || '无可用图像'}；源代码 ${r.source || r.module || '缺失'}；适用上下文：${r.how || r.form || rd.kind || '须自行判断'}；check=${r.acceptance?.check || 'unreviewed'}，review=${r.acceptance?.review || 'unreviewed'}（历史记录，非当前批准）。`),
      ...(rd?.visualLanguages || []).map(v => `- 可选共享视觉能力 ${v.id}：${v.entry}(g, { id: '${v.id}', purpose, palette, box, geometry, density, progress })；适合：${v.use}；不适合：${v.avoid}。仅示意，不代替事实/开场装置，不强制使用，clean 可保持干净；字仍用 type.flat 字组。`),
      `- 灰盒：${files.frames?.[b.beat] || ''}；画面里有 ${blocks}；字 ${type}；镜头 ${g.camera?.move || '?'}${g.camera?.note ? `（${g.camera.note}）` : ''}；接下一拍 ${g.out || 'cut'}`, `- 导演说明：${g.note || ''}`].join('\n'); });
  return `# 章节 ${chapter} 制作任务书（${id}）

${legacy ? '（这部片是设计关之前的旧流程：下面的灰盒没有经过设计关，只作参考。）\n\n' : ''}你在一个独立会话里，只做这一章。整片的方向、版式、配色、衔接已经在设计关定了（灰盒粗稿和风格帧）；你的工作是把这一章按它做到成片质量并走上引擎（灰盒≠成片）。总导演在另一个会话里，收你的成果、守整片统一。

${recovered ? `## 历史方法与决策作用域\n\n${recovered.workflow.map(s => `- ${s}`).join('\n')}\n- 当前权限：design/final 仍归用户；历史批准不转移，不重开已定设计。以下不是新增生产范围。\n${recovered.beats.flatMap(b => b.references.map(r => `- ${b.beat} / ${r.id}：图 ${r.frame || 'unknown（缺图，未验证）'}；源码 ${r.source || 'unknown'}；适用：${r.applies}；不适用：${r.notApplicable}；用户原话「${r.decision.quote}」@ ${r.decision.locator}；scope=${r.acceptance.scope}，currentApproval=false，hashBinding=${r.acceptance.hashBinding}；证据 ${r.evidence}`)).join('\n')}\n\n` : ''}## 这一章

${rows.join('\n\n')}

${motionContract?.motionRules ? motionContractSummary(motionContract) : ''}

${notes.length ? `## 设计关盲审留下的备注（这一章要做到）\n\n${notes.map((n) => `- ${n.beat}（严重度 ${n.severity}）：${n.say} → ${n.fix}`).join('\n')}\n\n` : ''}${usage?.evidence || usage?.seam ? `## 家用量（与 house-usage.json summaries 同源）\n\n- 证据：${usage.evidence || '–'}\n- 衔接：${usage.seam || '–'}\n\n` : ''}衔接：进这一章的是 ${neighbours.in || 'cut'}（上一拍 ${neighbours.prev || '无'}），出这一章的是 ${neighbours.out || 'cut'}（下一拍 ${neighbours.next || '无'}）。两边的镜头运动和画面要按这个接上。

${motionContract?.shots?.length ? `## 分镜运动合同（A1ShotMotionContract/v1 · 硬输入）

章节工必须吃进 morph；检查 \`motionContractUneatenErrors\` 拦截「运动合同选了但答案未吃」（与路由未吃同级）。机读：\`tasks/session-${chapter}.motion.json\`。偏离须 \`greyboxDiffer\`。

${(motionContract.shots || []).map((s) => `- ${s.shotId}: camera=${s.camera?.move || s.camMove || '?'}${(s.camera?.camMoveMin != null && s.camera?.camMoveMax != null) ? ` · camMove∈[${s.camera.camMoveMin},${s.camera.camMoveMax}]` : ''}${s.subject?.model ? ` · subject.model=${s.subject.model}` : ''} · subjectMotion=${s.subjectMotion} · type.in=${s.type?.inStrategy || 'late'} · seam ${(s.seam?.in || '–')}→${s.seam?.out || 'cut'}${s.seam?.poseFrom ? ` · poseFrom={s:${s.seam.poseFrom.s},x:${s.seam.poseFrom.x},y:${s.seam.poseFrom.y}}` : ''}`).join('\n')}${(motionContract.motif?.layers?.length) ? `\n- motif.${motionContract.motif.id}: ${motionContract.motif.layers.map((l) => `${l.shotId}/${l.subjectMotion}`).join(' → ')}` : ''}${(motionContract.delivery?.previewMp4) ? `\n- delivery: preview.mp4 + morph-hash bind` : ''}

` : ''}## 先读

- 家规（一页）：${files.house}
- 语义与全片协调：work/recipe-board-v1/SEMANTIC-VISUAL-DIRECTION.md（按这一拍的意思选择载体和变体；重复主体须有叙事理由，快素材和静帧排版按目标设计）
- **成熟第一稿检查清单（HOUSE · 六条 + 对标两期）**：交本章前自检 — **动效** · **材料包装** · **字体排版** · **低模真 mesh** · **一镜戏核** · **接缝转场**；对标默认 \`paperclip-138-full\`（回形针 Vol.138）与 \`hupo-69\`（胡泊）。机读 \`routing/mature-first-draft.json\`。禁止空壳 kit 标 ready；禁止 Plane+照片冒充 3D（\`photo-plane-as-subject\`）；有机主体须 AI→partset/Hunyuan→QA glb，禁 Tube/未QA 填料（\`subject-pipeline-filler\`）。不是 banana 单片改写清单。
- **文案→包装默认指针链（继承，不得自创旁路）**：HOUSE「文案→包装」——成熟硬合同 + 开场硬门 → \`routing/compositions.json\` 十构图（证据拍默认 \`evidence-card\`）→ 开场只认 \`kit.status==="ready"\` 的 \`lineup-row\`/\`copy-to-repeat\`/\`table-grows\` 或章节 \`mapPlane\`/\`subject\`/\`orbit\`（空壳 \`array-build\`/\`stagger-reveal\`/\`light-3d\` 不得当允许开场）→ 金样 \`projects/paperclip-138-open/chapters/B01.mjs\` → 禁单 \`routing/lessons.json\` + \`routing/tells.json\` → 导演路由表 \`routing/director-routes.json\`（开场/证据/数字/地图/对比）
- **分镜运动合同（硬输入）**：\`routing/shot-motion-contract.schema.json\`（A1ShotMotionContract/v1）+ \`tasks/session-${chapter}.motion.json\`；章节工必须吃；\`motionContractUneatenErrors\` 拦未吃
- **参考锁先于动画**：先复现参考落幅，再增加运动；主体、尺度、机位、材质与焦点不得无声降级。先在同一动态场景生成入场、停稳、出场关键姿势并比较实际附图，再扩成预览；不是只读路径、渲染一张静帧或用整图推拉代替。
- **灰盒≠成片，必须上引擎**：灰盒只是设计关粗稿；本章须按批过的灰盒写章节模块并走 \`routing/engine-capabilities.json\`（model/subject/mapPlane/orbit/filmedScreen/pages…），不得把灰盒当终态
- 章节写法：work/recipe-board-v1/prompts/morph.md（第 35d、35e 条：模型、编队、地形、照灰盒做；第 35f–35h 条：排字照排版圣经、用字组零件 typeBlock / spreadWord / pair / labelBy 排、用户认可过的设计不动）
- 排版圣经和成熟规范：work/recipe-board-v1/TYPE.md（§7、§8）
- 这一章的任务：work/recipe-board-v1/projects/${id}/tasks/morph-${chapter}.task.json
- **制作输入绑定**：任务内 inheritance.files 是权威规范版本，inheritance.productionFiles 是本章锁画/灰盒图片/素材的本地文件内容绑定；缺失或变化须重新 session-brief。字符串备注不代表已看过图，仍须实际检查。正式答案用 submit-task 提交，不能手改 submission 回执。
- **任务版本**：写答案前读任务内的 \`input.sourceTaskInputHash\`，原样写入答案的 \`sourceTaskInputHash\`；如果任务更新，先重新读取，不要拿旧任务的答案冒充新版本。
- 设计关定下的样子：灰盒总览 ${files.sheet}、灰盒粗稿 ${files.reel}、风格帧 ${files.look}、整片设计板 ${files.board}

## 你只碰这些文件

- work/recipe-board-v1/projects/${id}/tasks/morph-${chapter}.answer.json（你的答案），以及你自己的草稿（放在你的 scratchpad）
- 不改共用代码、不改别的章节、不改整片设计和灰盒。发现共用代码的问题或需要新零件：写进回报，由总导演改。
- 你和其他章节会话在同一个工作目录里（字体、素材、渲染结果不在 git 里，新开的 worktree 里没有它们，跑不起来）：只改上面这个答案文件，只跑这一章；不提交、不切分支，总导演收齐后统一提交。

## 怎么跑（只跑这一章）

\`\`\`
RB_JOBS=1 RB_CHECK_JOBS=2 node scripts/recipe-board.mjs run --project ${id} --from chapter --to chapter --only ${beats.map((b) => b.beat).join(',')}
\`\`\`

（几个章节会话同时跑：每个只开一个渲染任务、两个检查任务，内存不打架。）

## 什么时候算做完

1. 代码检查全过（tasks/morph-${chapter}.check.json 没有 errors）。
2. 一轮盲审：章节盲审和口味盲审同时发出，各由全新的子代理只读任务、规则和 schema 来答；过线就交（关口过一次就算过，没做完的「到 4 分清单」是备注，不再循环）。没过线：按清单改一轮；还卡住按规则交仲裁，仲裁的裁决有约束力。
3. 画面和灰盒一致：任务里 \`greybox\` 就是批过的每拍（块、排好的字、镜头、出拍衔接）；渲染后线上量每行字是否在、离灰盒的位置是否超过画面的四分之一。要偏离，在模块里写 \`export const greyboxDiffer = { B07: '为什么' }\`。
4. 耗时长的东西（新模型、生图）先验收再用：模型过模型检查，地形用 landform，一群东西用 formation。

## 回报（最后一条消息，中文）

- 每拍的分数（章节、口味）、是否过线；
- 和灰盒不一样的地方和理由；
- 留下的备注（没做完的清单）；
- 需要总导演改的共用代码或零件。
`;
}

export async function sessionBrief(cfg, id, chapter) {
  // One snapshot per dispatch, shared with chapter task generation, never global.
  const T = await import('./techniques.mjs');
  cfg = { ...cfg, referenceLibrary: (cfg.referenceLibraryBuilder || T.chapterTechniques)(cfg) };
  const C = await import('./chapter.mjs'), F = await import('./filmdesign.mjs'), root = projectPaths(cfg, id).root, rel = (f) => path.relative(cfg.repoRoot || process.cwd(), f);
  const groups = C.chapterGroups(cfg, id), g = groups.find((x) => x.id === chapter); if (!g) throw new Error(`no chapter ${chapter} (${groups.map((x) => x.id).join(', ')})`);
  const pending = C.chapterRedesignPending(cfg, id, g);
  if (pending.length) throw new Error(`unapplied storyboard rewrite: ${pending.join(', ')}`);
  const all = C.filmBeats(cfg, id), beats = all.filter((b) => g.shots.some((s) => s.shotId === b.beat));
  // the design approved first, and only the greybox it was approved on (the second audit: briefs were written before the
  // greybox and its review were settled, from whatever answer was on disk)
  const GB = await import('./greybox.mjs'), GS = await import('./gatestate.mjs'), p = (await import('./store.mjs')).loadProject(cfg, id) || {}, ag = GB.approvedGreybox(cfg, id), legacy = p.gateSet !== 'design';
  { const pin = GS.chapterStartPinErrors(p); if (pin.length) throw new Error(pin[0]); }
  if (!legacy && ag.state !== 'approved') throw new Error(ag.state === 'stale' ? 'the greybox was sent back by its checks: fix it first' : 'the design is not approved yet: a chapter is briefed once it is (gate --approve design)');
  const gb = legacy ? readJson(path.join(root, 'tasks', 'greybox.answer.json'), {}) : ag.answer, greybox = Object.fromEntries((gb.beats || []).map((r) => [r.beat, r]));
  const fd = F.acceptedFilmDesign(cfg, id), film = Object.fromEntries((fd?.beats || []).map((r) => [r.beat, r]));
  const i0 = all.findIndex((b) => b.beat === beats[0].beat), i1 = all.findIndex((b) => b.beat === beats[beats.length - 1].beat), prev = all[i0 - 1], next = all[i1 + 1];
  const files = { house: 'work/recipe-board-v1/HOUSE.md', sheet: rel(path.join(root, 'out', 'greybox', 'sheet.png')), reel: rel(path.join(root, 'out', 'greybox', 'greybox.mp4')), look: rel(path.join(root, 'out', 'look', 'sheet-hero.jpg')), board: rel(path.join(root, 'out', 'film', 'board.png')),
    frames: Object.fromEntries(beats.map((b) => [b.beat, rel(path.join(root, 'out', 'greybox', `${b.beat}.png`))])) };
  const rv = readJson(path.join(root, 'tasks', 'greybox-review.answer.json'), {});
  const U = await import('./houseusage.mjs');
  const meter = U.houseUsageRead(cfg, id, { write: false });
  const usage = U.houseUsageSummariesOf(meter);
  const notes = U.reconcileReviewIssuesWithUsage(rv.issues || [], meter).filter((n) => n.severity >= 2 && (n.beat === 'film' || beats.some((b) => String(n.beat).includes(b.beat))));
  const DR = await import('./directorroutes.mjs');
  const eventErrors = beats.flatMap(b => DR.requiresEventContract(film[b.beat]) ? DR.directorIntentErrors(film[b.beat]) : []);
  if (eventErrors.length) throw new Error(eventErrors.join(' | '));
  const table = DR.loadDirectorRoutes(cfg);
  const devicesLib = F.loadDevices(cfg);
  const routes = Object.fromEntries(beats.map((b) => {
    const f = film[b.beat] || {};
    return [b.beat, DR.pickDirectorDefaults({ ...f, beat: b.beat, text: b.text }, { table, devices: devicesLib })];
  }));
  const { chapterGuidance, recoveredDirectorGuidance } = await import('./techniques.mjs');
  const recovered = recoveredDirectorGuidance(cfg, beats.map(b => ({ ...b, ...routes[b.beat] })));
  const referenceGuidance = chapterGuidance(cfg, id, beats.map(b => ({ beat: b.beat, ...routes[b.beat], text: b.text, routeResolved: !!fd })));
  for (const [beat, route] of Object.entries(routes)) {
    route.references = referenceGuidance.beats.find(x => x.beat === beat)?.nearest || [];
  }
  const SM = await import('./shotmotion.mjs');
  const gbRows = beats.map((b) => greybox[b.beat]).filter(Boolean);
  const existingMdPath = path.join(root, 'tasks', `session-${chapter}.md`);
  const existingMd = fs.existsSync(existingMdPath) ? fs.readFileSync(existingMdPath, 'utf8') : null;
  const inherited = C.chapterInput(cfg, id, g).inheritance;
  const missing = [...Object.entries(inherited.files).filter(([, hash]) => !hash).map(([file]) => file), ...(inherited.productionFiles || []).filter((f) => !f.hash).map((f) => f.file)];
  if (missing.length) throw new Error(`chapter handoff missing required sources: ${missing.join(', ')}`);
  const existingMotion = SM.loadChapterMotionContract(cfg, id, chapter);
  let motionContract = SM.buildChapterMotionContract({
    chapter,
    project: id,
    greyboxRows: gbRows,
    filmDesign: fd,
    prevOut: prev ? greybox[prev.beat]?.out : null,
    sessionMd: existingMd,
    motif: existingMotion?.motif || null,
    delivery: existingMotion?.delivery || null,
  });
  // Preserve hand-pinned hard fields from an existing session-*.motion.json (bands / poseFrom / subject / motif / delivery)
  if (existingMotion?.shots?.length) {
    const byId = Object.fromEntries(existingMotion.shots.map((s) => [s.shotId, s]));
    motionContract = {
      ...motionContract,
      motif: existingMotion.motif || motionContract.motif || null,
      delivery: existingMotion.delivery || motionContract.delivery || null,
      shots: (motionContract.shots || []).map((s) => {
        const prevS = byId[s.shotId];
        if (!prevS) return s;
        return {
          ...s,
          camera: {
            ...s.camera,
            camMove: s.camera?.camMove ?? prevS.camera?.camMove ?? null,
            camMoveMin: s.camera?.camMoveMin ?? prevS.camera?.camMoveMin ?? null,
            camMoveMax: s.camera?.camMoveMax ?? prevS.camera?.camMoveMax ?? null,
          },
          subject: s.subject?.model ? s.subject : (prevS.subject || null),
          seam: {
            ...s.seam,
            poseFrom: s.seam?.poseFrom || prevS.seam?.poseFrom || null,
          },
        };
      }),
    };
  }
  const reconciled = reconcileMotionContract(existingMotion, motionContract);
  if (reconciled.errors.length) throw new Error(`existing director motion conflicts with the current greybox; preserve and reconcile before dispatch: ${reconciled.errors.join('; ')}`);
  motionContract = reconciled.contract;
  const motionPath = SM.motionContractPath(cfg, id, chapter), existingBytes = fs.existsSync(motionPath) ? fs.readFileSync(motionPath) : null;
  if (existingBytes && JSON.stringify(JSON.parse(existingBytes)) !== JSON.stringify(motionContract)) {
    if (!fs.readFileSync(motionPath).equals(existingBytes)) throw new Error('motion contract changed during handoff; retry with the new version');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'), digest = crypto.createHash('sha256').update(existingBytes).digest('hex').slice(0, 12);
    fs.copyFileSync(motionPath, motionPath.replace(/\.json$/, `.before-${stamp}-${digest}.json`), fs.constants.COPYFILE_EXCL);
  }
  SM.writeChapterMotionContract(cfg, id, chapter, motionContract);
  const LD = readJson(path.join(root, 'out', 'lookdev', 'lookdev.json'), null);
  const lookdev = Object.fromEntries((LD?.anchors || []).map((a) => [a.beat, { ...a, chosen: (a.directions || []).find((d) => d.id === a.chosen) || null }]));
  const text = briefText({ id, chapter, beats, greybox, film, notes, usage, legacy, routes, lookdev, motionContract, recovered, neighbours: { prev: prev?.beat, in: prev ? greybox[prev.beat]?.out : null, next: next?.beat, out: greybox[beats[beats.length - 1].beat]?.out }, files });
  // An existing hand-edited guide is never replaced; the freshly generated guide is versioned beside it.
  const digest = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
  const out = existingMd ? path.join(root, 'tasks', `session-${chapter}.generated-${digest}.md`) : existingMdPath;
  if (!fs.existsSync(out)) fs.writeFileSync(out, text, { flag: 'wx' });
  else if (fs.readFileSync(out, 'utf8') !== text) throw new Error(`handoff path already contains different work: ${out}`);
  const guides = [existingMd ? rel(existingMdPath) : null, rel(out)].filter(Boolean);
  C.refreshChapterTask(cfg, id, chapter, { handoffGuides: guides });
  return out; // motion.json written beside it (motionPath)
}
