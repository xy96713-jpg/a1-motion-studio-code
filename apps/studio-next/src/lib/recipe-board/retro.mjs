// The retrospective, a fixed step after the final (the user 2026-10-28, the audit of skills and SOPs: 复盘做成固定一步). A
// film's three numbers (process.mjs) said how far it was from the target, not why: this sorts every fault the line sent a
// piece back for into its kind, lists the user's notes and the lessons made from them while the film was made, and names
// the three kinds to move earlier for the next film — into a part or a rule the writer reads before answering, so the
// fault is not made rather than caught. Written to out/film/retro.md; `node scripts/recipe-board.mjs retro --project <id>`,
// and by run once the final is newer than the last retrospective.
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths } from './store.mjs';
import { retroLessonDrafts, appendRetroLessonDrafts } from './p1hard.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };

// the kinds of fault, first match wins (what each says, and where its fix belongs)
export const KINDS = [
  { kind: 'colour', say: '明暗和配色（不合整片设计的明暗、第二种饱和色、底色不对）', fix: '整片设计定的明暗和配色写进模块的底和字色，章节照它取值', re: /lightness|saturated colour|chroma|hue|family of colour|bare flat|ground renders|neutral/ },
  { kind: 'code', say: '代码出错（模块报错、注释吞代码）', fix: '答题前 node --check、注释单独一行', re: /module fails|code inside a \/\/ comment|shape mark|Cannot read/ },
  { kind: 'type', say: '排字（字号、网格、配对、字组、层级、读速、标签）', fix: '写进答题规则的排字零件（TYPE.md §7），答题时就按零件排', re: /type scale|off the grid|margins|kicker|small line|on its edge|one height|by their ink|set by hand|axis|levels|too close to read|read first|two groups|characters need|thing it names|rides a thing|run into each other|subtitle band|its figures|big free type|do not pair|on its surface|line's figure|lies on the subject|drawn line run across/ },
  { kind: 'geometry', say: '字和画面打架（压字、压物体、出画）', fix: '由求解器排位（where.place、typeBlock），不手给坐标', re: /under a 3D|over (a|the) |cut by|frame's edge|hugs the frame|set over each other|covered by|thin 3D piece/ },
  { kind: 'timing', say: '字的时机（晚于台词、早于台词）', fix: '用 said() 定时，零件按台词出', re: /said at|comes at|late by|before its words/ },
  { kind: 'frame', say: '画面空、重心偏、切到空处', fix: '灰盒阶段定构图，章节照灰盒', re: /top half|blank|empt|lands on nothing|carries less|fill|nothing new happens|one layout three beats/ },
  { kind: 'motion', say: '镜头和衔接（跳、抖、硬切不稳）', fix: '用 camPose 和设计好的衔接', re: /jerk|hop|whip|seam|cut|snap|moves \d+ px/ },
  { kind: 'model', say: '模型和素材（认不出、破面、太小）', fix: '模型先过模型检查，素材先过尺寸和点名', re: /model|mesh|material|picture is|too small|reads as/ },
];
export const kindOf = (msg) => (KINDS.find((k) => k.re.test(String(msg))) || { kind: 'other' }).kind;

// (pure, tested) faults by kind: { kind: { n, examples } }, each fault counted once a piece and round
export function faultKinds(histories) {
  const out = {};
  for (const { step, rows } of histories) for (const r of rows) for (const e of r.errors || []) { const k = kindOf(e), o = (out[k] ||= { n: 0, examples: [] }); o.n++; if (o.examples.length < 3) o.examples.push(`${step}: ${String(e).slice(0, 140)}`); }
  return out;
}

export async function retro(cfg, id, { write = true } = {}) {
  const root = projectPaths(cfg, id).root, tasks = path.join(root, 'tasks');
  const P = await import('./process.mjs'), m = P.processMetrics(cfg, id, { write: false });
  const histories = (fs.existsSync(tasks) ? fs.readdirSync(tasks) : []).filter((f) => f.endsWith('.history.jsonl')).map((f) => ({ step: f.replace('.history.jsonl', ''), rows: lines(path.join(tasks, f)) }));
  const kinds = faultKinds(histories), ranked = Object.entries(kinds).sort((a, b) => b[1].n - a[1].n);
  const starts = histories.flatMap((h) => h.rows.map((r) => r.at)).filter(Boolean).sort(), from = starts[0] ? starts[0].slice(0, 10) : null;
  const notes = lines(P.notesFile(cfg, id));
  const lessons = (readJson(path.join(cfg.dataDir, 'routing', 'lessons.json'), {})?.lessons || []).filter((l) => { const d = /(\d{4}-\d{2}-\d{2})/.exec(l.said || ''); return d && from && d[1] >= from; });
  const say = (k) => KINDS.find((x) => x.kind === k) || { say: '其他', fix: '看例子，归到一类再定' };
  const md = [`# 复盘：${id}`, '', `流程指标：${P.processLine(m)}`, '',
    '## 打回的原因（按类）', '', '| 类 | 次数 | 例子 |', '|---|---|---|',
    ...ranked.map(([k, v]) => `| ${say(k).say} | ${v.n} | ${v.examples.map((x) => x.replace(/\|/g, '/')).join('<br>')} |`), '',
    '## 用户的意见', '', ...(notes.length ? notes.map((n) => `- ${n.at?.slice(0, 10) || ''} ${n.say}`) : ['- （这部片没有用 note 记下的意见；对话里的意见已落成下面的教训）']), '',
    `## 这部片期间新加的教训（${lessons.length} 条）`, '', ...lessons.map((l) => `- ${l.id}：${String(l.do || '').slice(0, 120)}`), '',
    '## 下一部片先改的三件事', '', ...ranked.slice(0, 3).map(([k, v], i) => `${i + 1}. ${say(k).say}（${v.n} 次）：${say(k).fix}。`), ''].join('\n');
  const drafts = retroLessonDrafts(ranked, { project: id, at: from });
  let inbox = null;
  if (write) {
    const f = path.join(root, 'out', 'film', 'retro.md');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, md);
    // P1 H5: fixed retro → lesson-inbox drafts (status=draft; promote to lessons.json by review)
    inbox = appendRetroLessonDrafts(cfg, drafts);
    const draftMd = path.join(root, 'out', 'film', 'retro-lesson-drafts.json');
    fs.writeFileSync(draftMd, JSON.stringify({ contract: 'A1RetroLessonDrafts/v1', items: drafts }, null, 2));
    return { file: f, md, kinds, lessonDrafts: drafts, inbox };
  }
  return { md, kinds, lessonDrafts: drafts };
}
