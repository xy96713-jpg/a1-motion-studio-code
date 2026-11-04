// Director: article -> beats (intent + what must be true) -> routed shot plan. Plans only; it never
// generates media. Beat analysis uses an LLM when one is configured, otherwise a keyword heuristic;
// routing is deterministic and comes entirely from the routing table, so the same beats always get
// the same modules, recipes and gaps.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const join = (base, ...parts) => path.join(/* turbopackIgnore: true */ base, ...parts);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function loadRoutingTable(cfg) {
  return JSON.parse(fs.readFileSync(join(cfg.dataDir, 'routing', 'routing-table-v1.json'), 'utf8'));
}

// ---------------------------------------------------------------- beat analysis

const ENTITY_KINDS = ['person', 'org', 'product', 'number', 'article', 'quote', 'software', 'place', 'event'];

function analysisPrompt(table) {
  const intents = table.intents.map((i) => `- ${i.id}（${i.label}）：线索 ${i.signals.join('、')}；画面做法：${i.technique}`).join('\n');
  return `你是视频包装导演。把文章拆成拍点（beat），每拍 1 到 3 句、按原文顺序、覆盖全文不遗漏，并判断观众这一拍应该"看到什么"。

可选意图（intent）只能从下面选：
${intents}

规则：
- 按"观众该看到什么"选意图，而不是按句子语法。引用了真实报道就是 evidence-article；讲具体数字就是 data；介绍某人就是 person；描述软件怎么用就是 software-demo。
- 文章作者自己的观点、感受，如果没有具体对象，用 presenter-overlay 或 title。
- onScreen.headline 是屏幕上的大字，12 个字以内，必须来自原文，不得编造；keywords 是原文里需要高亮的词，最多 3 个。
- entities 列出这拍里需要真实素材核实的对象：kind 只能是 ${ENTITY_KINDS.join('/')}；needsSource 为 true 表示画面上要出现它的真实素材。
- 拍点按"观众看到的画面该换了"来切：每拍口播大约 25–55 个字（5–8 秒），超过 60 个字一定要拆开。宁可多拆，不要两三句话合成一拍。
- 第一次出现、带着身份介绍的具名人物（某某创始人、研究员、投资人）用 person，哪怕只有半句。
- 模拟对话、"我宣布个事"、群聊、网友评论这种口吻用 chat。
- 提到具体的新闻报道、论文、财报、官方发布、某人的采访原文，用 evidence-article 或 quote，不要用 presenter-overlay。
- 不是每拍都要包装：大约四分之一的拍应该留白。主讲人自己的过渡、感慨、口头禅用 presenter-plain（只放主讲人）；情绪和场景过桥（钱、时代、某个历史画面）用 atmosphere（只放空镜）。
- 讲一个实物里面有什么、由哪些部件组成、怎么转起来（显卡、硬盘、电钻、发动机），用 teardown；只是提到产品型号、要看它真实的样子，用 product。
- 讲情绪、悬念、想象中的场面（"那天晚上""仿佛""孤独"），手头又没有真实画面可用，用 scene；有真实空镜可用的过桥仍用 atmosphere。
- 讲一件事的经过——在哪个城市、哪几年、发生了几起、案发地点在哪、现场留下了什么证据——用 where-when：观众该看到的是地图上的地点和时间轴上的证据，不是空镜，也不是柱状图。连着几拍讲同一段经过，这几拍都用 where-when，好让同一张图讲完；经过里顺带的数字（几起、几岁、比对了多少枚）不单独拆成 data。
- data 只留给要比大小、看趋势、看占比的数字；atmosphere 只留给真正的情绪过桥（真实空镜就够了的地方），不要用来介绍一个具体地点或一段经过。
- 不要编造事实，不要改写原文。

只输出 JSON：{"beats":[{"text":"原文","intent":"…","why":"一句话理由","onScreen":{"headline":"…","keywords":["…"]},"entities":[{"kind":"…","name":"…","needsSource":true}]}]}`;
}

function readEnvFile(file, key) {
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

// Preferred backend: the local Codex CLI (same route as the existing article director), read-only.
const CODEX_CANDIDATES = [
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
  '/Applications/ChatGPT.app/Contents/Resources/codex',
];
export function codexExecutable(env = process.env) {
  return [env.A1_CODEX_BIN, ...CODEX_CANDIDATES].find((p) => p && fs.existsSync(p)) || null;
}

// Run `codex exec` read-only with a JSON output schema; resolves to the parsed final JSON object.
export function runCodexJson(bin, prompt, schemaPath, { firstKey, timeoutMs = 300_000, cwd, images = [] } = {}) {
  // images (the critic's frames) go in with -i; the prompt still comes on stdin
  const args = ['exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--ignore-user-config', '--output-schema', schemaPath, '--color', 'never', ...images.flatMap((f) => ['-i', f]), '-'];
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { detached: true, stdio: ['pipe', 'pipe', 'pipe'], ...(cwd ? { cwd } : {}) });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out = (out + c).slice(-2_000_000)));
    child.stderr.on('data', (c) => (err = (err + c).slice(-20_000)));
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      reject(new Error(`Codex 超时（${Math.round(timeoutMs / 60000)} 分钟）`));
    }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`codex exited ${code}: ${err.slice(-600)}`));
      try {
        // The final message is the schema-shaped JSON; take the last JSON object in stdout.
        const start = firstKey ? out.lastIndexOf(`{"${firstKey}"`) : -1;
        resolve(JSON.parse(out.slice(start >= 0 ? start : out.indexOf('{'))));
      } catch {
        reject(new Error(`codex output was not JSON: ${out.slice(-300)}`));
      }
    });
    child.stdin.end(prompt);
  });
}

async function analyzeWithCodex(text, table, cfg, bin) {
  const schema = join(cfg.dataDir, 'routing', 'director-output.schema.json');
  const result = await runCodexJson(bin, `${analysisPrompt(table)}\n\n文章：\n${text}`, schema, { firstKey: 'beats' });
  return result.beats;
}

export function llmConfig(cfg, env = process.env) {
  const apiKey = env.DEEPSEEK_API_KEY || readEnvFile(join(cfg.repoRoot, '.env'), 'DEEPSEEK_API_KEY') || readEnvFile(join(cfg.sourceRoot, '.env'), 'DEEPSEEK_API_KEY');
  return apiKey ? { apiKey, baseUrl: env.DIRECTOR_LLM_BASE_URL || 'https://api.deepseek.com', model: env.DIRECTOR_LLM_MODEL || 'deepseek-chat' } : null;
}

async function analyzeWithLlm(text, table, llm) {
  const res = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${llm.apiKey}` },
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: analysisPrompt(table) }, { role: 'user', content: text }],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const raw = (await res.json()).choices?.[0]?.message?.content || '';
  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim());
  if (!Array.isArray(parsed.beats)) throw new Error('LLM returned no beats');
  return parsed.beats;
}

// Offline fallback: paragraph/sentence grouping + signal keywords. Coarse, but routing still works.
const HEURISTIC = [
  ['software-demo', /点击|输入|界面|快捷键|Ctrl|按钮|演示|工作台|双击|划选|拖/],
  ['evidence-article', /报道|文章|新闻|报告|论文|原文|据.{0,6}(称|说|显示)|《/],
  ['quote', /[“"「].{4,}[”"」]|曾说|表示|原话/],
  ['data', /\d+(\.\d+)?\s*(%|％|亿|万|倍|美元|元|张|家|个百分点)/],
  ['person', /创始人|CEO|研究员|教授|工程师|作者|他是|她是/],
  ['teardown', /拆开|拆解|内部结构|里面(有|是)|由.{1,10}组成|零件|部件|怎么转|带动/],
  ['scene', /那天晚上|那一夜|仿佛|想象一下|孤独|神秘|梦里|超现实/],
  ['concept', /原理|流程|步骤|机制|方法|先.{1,12}再|逻辑/],
  ['product', /型号|显卡|芯片|App|产品|模型/],
  ['summary', /总结|回顾|所以说|最后|好处/],
  ['title', /[?？]$|为什么|为何|凭什么/],
];

function splitBeatsHeuristic(text) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const beats = [];
  for (const block of blocks) {
    const lines = block.split(/\n|(?<=[。！？!?])/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += 2) beats.push(lines.slice(i, i + 2).join(lines[i].match(/[。！？!?]$/) ? '' : '，'));
  }
  return beats;
}

function analyzeHeuristic(text) {
  return splitBeatsHeuristic(text).map((t) => {
    const intent = (HEURISTIC.find(([, re]) => re.test(t)) || ['presenter-overlay'])[0];
    const headline = t.split(/[，,。！？!?：:]/)[0].slice(0, 12);
    const numbers = t.match(/\d+(\.\d+)?\s*(%|％|亿|万|倍)?/g) || [];
    return { text: t, intent, why: '关键词规则（未启用 LLM）', onScreen: { headline, keywords: numbers.slice(0, 3) }, entities: numbers.map((n) => ({ kind: 'number', name: n, needsSource: true })) };
  });
}

// ---------------------------------------------------------------- routing

const NEED_BY_ENTITY = {
  person: (e) => `${e.name} 的公开照片`,
  article: (e) => `「${e.name}」的原文链接`,
  quote: (e) => `「${e.name}」的原话出处`,
  number: (e) => `${e.name} 的数据来源`,
  product: (e) => `${e.name} 的官方产品图`,
  org: (e) => `${e.name} 的 logo 或官方图`,
  software: (e) => `${e.name} 的可录屏环境`,
};

function routeBeat(beat, table, opts) {
  let intent = table.intents.find((i) => i.id === beat.intent) || table.intents.find((i) => i.id === 'presenter-overlay');
  const notes = [];
  if (intent.id === 'presenter-plain' && !opts.hasPresenter) {
    notes.push('没有口播底片，纯口播拍改成空镜过桥');
    intent = table.intents.find((i) => i.id === 'atmosphere');
  }
  if (intent.id === 'presenter-overlay' && !opts.hasPresenter) {
    notes.push('没有口播底片，改用标题版式');
    intent = { ...intent, materialChain: intent.materialChain.filter((c) => !c.from.includes('presenter-base')), recipes: ['title-hero-over-photo', 'stamp-over-evidence'] };
  }
  const chain = intent.materialChain.map((c) => ({
    use: c.use,
    note: c.note || null,
    modules: c.from.map((id) => ({
      id,
      label: table.modules[id]?.label || id,
      // The presenter plate is the one module that depends on user footage rather than code.
      status: id === 'presenter-base' && opts.hasPresenter ? 'available' : table.modules[id]?.status || 'unknown',
    })),
  }));
  const gaps = [];
  for (const c of chain) {
    // A slot is blocked only when none of its candidate modules can run today.
    if (!c.modules.some((m) => m.status === 'available' || m.status === 'partial')) gaps.push(`${c.use}：${c.modules.map((m) => m.label).join(' / ')} 还没有`);
  }
  if (!intent.recipes?.length) gaps.push('缺版式卡');
  const needs = [...new Set((beat.entities || []).filter((e) => e.needsSource && NEED_BY_ENTITY[e.kind]).map((e) => NEED_BY_ENTITY[e.kind](e)))];
  if (intent.id === 'software-demo') needs.push('可操作的软件或网页（用来录屏）');
  const primary = chain[0]?.modules.find((m) => m.status !== 'missing')?.id || chain[0]?.modules[0]?.id || null;
  return {
    intent: intent.id,
    intentLabel: intent.label,
    technique: intent.technique,
    chain,
    primaryModule: primary,
    recipeOptions: intent.recipes || [],
    motionPreset: intent.motionPresets?.[0] || null,
    forbidden: intent.forbidden || [],
    fallback: intent.fallback || null,
    notes,
    gaps,
    needs,
  };
}

// Pick recipes left to right so no card runs more than twice in a row. A beat that names its card
// (`recipe`, e.g. when rebuilding a reference film whose shots are known) keeps it.
function assignRecipes(beats) {
  for (let i = 0; i < beats.length; i++) {
    const r = beats[i].route;
    const prev = [beats[i - 1]?.route.recipe, beats[i - 2]?.route.recipe];
    // a chapter card is meant to run on: consecutive beats on it are one continuous diagram (chapter.mjs)
    r.recipe = beats[i].recipe || r.recipeOptions.find((id) => id === 'morph-chapter' || !(prev[0] === id && prev[1] === id)) || r.recipeOptions[0] || null;
    // the numbers a chapter arrives at are drawn in it: a data beat right after a chapter beat stays on the diagram
    // (paperclip-138-full: 1000 -> 323 -> 1 -> 0.000…002 cut out of the STR chapter into three separate charts, where
    // the reference narrows one dot grid)
    if (!beats[i].recipe && r.intent === 'data' && beats[i - 1]?.route.recipe === 'morph-chapter') {
      r.recipe = 'morph-chapter'; r.recipeOptions = ['morph-chapter', ...r.recipeOptions.filter((id) => id !== 'morph-chapter')];
      r.notes = [...(r.notes || []), '数字落在上一拍的连续图解里（同一张图继续变）'];
    }
  }
}

const GENERATIVE = new Set(['image-generation', 'ai-video', 'stage-scene']);
const TEXT_ONLY = new Set(['title', 'summary', 'presenter-overlay']);
const BREATHER = new Set(['title', 'atmosphere']);

function rhythmWarnings(beats) {
  const warnings = [];
  const gen = beats.filter((b) => GENERATIVE.has(b.route.primaryModule)).length;
  if (gen > beats.length / 3) warnings.push(`生图/AI 视频镜头占 ${gen}/${beats.length}，超过 1/3`);
  let run = 0;
  let sinceBreath = 0;
  beats.forEach((b, i) => {
    run = TEXT_ONLY.has(b.route.intent) ? run + 1 : 0;
    if (run === 3) warnings.push(`第 ${i - 1}–${i + 1} 拍连续 3 拍纯文字，建议插一拍真实画面`);
    sinceBreath = BREATHER.has(b.route.intent) ? 0 : sinceBreath + 1;
    if (sinceBreath === 7) warnings.push(`第 ${i - 5}–${i + 1} 拍连续 7 拍没有换气，建议加标题或氛围过桥`);
  });
  return warnings;
}

function summarize(beats) {
  const count = (f) => beats.reduce((m, b) => [].concat(f(b)).filter(Boolean).reduce((mm, k) => ((mm[k] = (mm[k] || 0) + 1), mm), m), {});
  const gapMap = {};
  beats.forEach((b, i) => b.route.gaps.forEach((g) => (gapMap[g] ||= []).push(i + 1)));
  return {
    beats: beats.length,
    intents: count((b) => b.route.intent),
    primaryModules: count((b) => b.route.primaryModule),
    recipes: count((b) => b.route.recipe || '（缺卡）'),
    gaps: Object.entries(gapMap).map(([gap, at]) => ({ gap, beats: at })),
    needs: beats.flatMap((b, i) => b.route.needs.map((n) => ({ need: n, beat: i + 1 }))),
    warnings: rhythmWarnings(beats),
  };
}

export async function directArticle(cfg, { text, title = '', mode = 'auto', hasPresenter = false }) {
  const table = loadRoutingTable(cfg);
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) throw new Error('文章是空的');
  // auto: Codex CLI -> DeepSeek API -> keyword heuristic. A failing backend is reported, not hidden.
  // no-codex: a project whose agents are the session's (agents.default manual; the user 2026-10-21: 去掉 codex): no Codex
  // judges the beats; the session's agent writes them (--beats, planFromBeats) and this is only a draft to start from
  const t0 = Date.now();
  const attempts = [];
  let raw = null;
  let analyzer = null;
  const codex = mode === 'heuristic' || mode === 'deepseek' || mode === 'no-codex' ? null : codexExecutable();
  if (codex) {
    try { raw = await analyzeWithCodex(clean, table, cfg, codex); analyzer = { mode: 'codex', model: 'codex exec' }; } catch (e) { attempts.push(`codex: ${e.message}`); }
  }
  const llm = raw || mode === 'heuristic' || mode === 'codex' ? null : llmConfig(cfg);
  if (llm) {
    try { raw = await analyzeWithLlm(clean, table, llm); analyzer = { mode: 'llm', model: llm.model }; } catch (e) { attempts.push(`deepseek: ${e.message.slice(0, 160)}`); }
  }
  if (!raw) {
    if (!['auto', 'heuristic', 'no-codex'].includes(mode)) throw new Error(`分析失败：${attempts.join('；')}`);
    raw = analyzeHeuristic(clean);
    analyzer = { mode: 'heuristic' };
  }
  const beats = raw.map((b, i) => ({
    id: `B${String(i + 1).padStart(2, '0')}`,
    text: String(b.text || '').trim(),
    intent: b.intent,
    why: b.why || '',
    onScreen: { headline: b.onScreen?.headline || '', keywords: (b.onScreen?.keywords || []).slice(0, 3) },
    entities: (b.entities || []).filter((e) => e && e.name && ENTITY_KINDS.includes(e.kind)),
  }));
  return routePlan(cfg, {
    contract: 'A1DirectorPlan/v1',
    createdAt: new Date().toISOString(),
    title,
    input: { chars: clean.length, sha256: sha(clean), text: clean },
    analyzer: { ...analyzer, ms: Date.now() - t0, fallbacks: attempts },
    options: { hasPresenter },
    beats,
    generation: 'NOT_STARTED',
  });
}

// Beats written by hand (a director's own breakdown, or a reference film's shot list) skip the analyzer:
// each beat has id, text, intent, onScreen, entities, and may name its card (`recipe`), what the frame
// shows (`visual`) and its length in seconds (`duration`).
export function planFromBeats(cfg, { beats, title = '', source = '', text = '', hasPresenter = false, agent = null }) {
  return routePlan(cfg, {
    contract: 'A1DirectorPlan/v1',
    createdAt: new Date().toISOString(),
    title,
    input: { source, beats: beats.length, ...(text ? { chars: text.length, sha256: sha(text), text } : {}) },
    analyzer: { mode: agent ? 'agent' : 'given', ...(agent ? { agent } : {}), ms: 0, fallbacks: [] },
    options: { hasPresenter },
    beats: beats.map((b, i) => ({ why: '', entities: [], ...b, id: b.id || `B${String(i + 1).padStart(2, '0')}`, onScreen: { headline: '', keywords: [], ...(b.onScreen || {}) } })),
    generation: 'NOT_STARTED',
  });
}

// Routing is deterministic: re-run it on saved beats whenever the routing table or options change,
// without asking the analyzer again.
export function routePlan(cfg, plan, options = plan.options || {}) {
  const table = loadRoutingTable(cfg);
  const beats = plan.beats.map(({ route, ...b }) => ({ ...b, intent: b.intent ?? route?.intent, route: routeBeat({ ...b, intent: b.intent ?? route?.intent }, table, options) }));
  assignRecipes(beats);
  return {
    ...plan,
    routedAt: new Date().toISOString(),
    routingTable: { contract: table.contract, version: table.version, principle: table.principle },
    options,
    beats,
    summary: summarize(beats),
  };
}
