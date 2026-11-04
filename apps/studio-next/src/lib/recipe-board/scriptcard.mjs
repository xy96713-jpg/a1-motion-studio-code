// A passage made from its script alone (user, 2026-10-22: 如果之后只有文案是否也能很好的按这质量执行好呢 但要加随机设计的
// 因子 不能千篇一律). Without a reference film there is no card: no cuts, camera or pace measured. Here the card is
// made from the text and from what the line has measured before (the technique library): each beat of the narration
// takes the device its words call for (the routing table's signals: a share price falling is a market picture, a name
// and a role a person card, 据报道 a page, a question a big title), and its camera, pace and look are drawn from the
// library's examples of that device. The draft, the plan's checks and the white model's measures then run on this norm
// card as on a reference's. A design seed (the project's, or new per film) draws the examples and the variants, so two
// films of one kind never come out alike and the same seed gives the same film.
import crypto from 'node:crypto';
import { breakdownItems } from './breakdown.mjs';

// a seeded random (mulberry32) and a seed from any text
export const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const seedOf = (s) => parseInt(crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 8), 16);
const pick = (r, xs) => xs[Math.floor(r() * xs.length) % xs.length];

// the routing table's intents as the passage line's devices
const DEVICE_OF = { title: 'title', 'evidence-article': 'article', data: 'chart', table: 'table', person: 'person', quote: 'quote', chat: 'chat', concept: 'diagram', 'where-when': 'title', product: 'side-card', 'software-demo': 'screen', 'presenter-overlay': 'side-card', teardown: 'compare3d', scene: 'title', atmosphere: 'broll', summary: 'title', 'presenter-plain': 'presenter' };
const MATERIAL_OF = { article: 'page', person: 'portrait', quote: 'portrait', chat: 'portrait', broll: 'footage', brand: 'logo', 'side-card': 'cutout', market: 'none', chart: 'none', title: 'photo', presenter: 'none', diagram: 'none', table: 'none', screen: 'page', compare3d: 'cutout' };
// (pure, tested) the intent a line's words call for: the routing table's literal signals; a share price is a market
// picture, not a chart; a question mark a title; else the presenter
// in order (the first draft of who-cards put 凭什么 on the presenter and 1万张A100 on a side card: the presenter's own
// signals, common words, won over the question and the number): a share price is a market picture; a question or a
// 凭什么 / 为什么 a big title; a number with its unit (万张, 亿, %, 倍) a picture of that number; then the routing table's
// signals, the presenter's last; nothing, the presenter
export function intentOf(text, intents) {
  const t = String(text || '');
  if (/股价|股票|收盘|大跌|暴跌|K线|涨停|跌停|市值/.test(t)) return { id: 'data', device: 'market' };
  if (/[？?]/.test(t) || /凭什么|为什么|怎么可能|难道/.test(t)) return { id: 'title', device: 'title' };
  if (/\d[\d.,]*\s*(万|亿|千|百)?\s*(张|台|块|个|人|家|倍|%|％|美元|元|亿)/.test(t) || /[一二两三四五六七八九十百千万]+(万|亿)(张|台|美元|元)/.test(t)) return { id: 'data', device: 'chart' };
  let best = null, n = 0;
  for (const it of intents || []) { if (/^presenter/.test(it.id)) continue; const k = (it.signals || []).filter((s) => s.length >= 2 && !/\+|\//.test(s) && t.includes(s)).length; if (k > n) { n = k; best = it; } }
  if (best) return { id: best.id, device: DEVICE_OF[best.id] || 'presenter' };
  for (const it of intents || []) if (/^presenter/.test(it.id) && (it.signals || []).some((s) => s.length >= 2 && t.includes(s))) return { id: it.id, device: DEVICE_OF[it.id] || 'presenter' };
  return { id: 'presenter-plain', device: 'presenter' };
}
// the library's examples of each device (pure): durations, cameras, the pace of the packaging, the look
export function norms(lib) {
  const by = {};
  for (const t of lib || []) if (t.device) (by[t.device] ||= []).push(t);
  return by;
}
const med = (xs, d) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : d; };
// (pure, tested) the beats of a passage: lines grouped by the device they call for, a beat no shorter than its device's
// shortest example and the plain presenter never longer than 6 s; then each beat a sub-shot of the norm card
export function normCard(lines, { seg = 'script', intents = [], lib = [], seed = 1 } = {}) {
  const r = rng(seed), N = norms(lib), beats = [];
  for (const l of lines) {
    const it = intentOf(l.text, intents), last = beats.at(-1), dmin = med((N[it.device] || []).map((t) => t.dur), 1.5) * .6;
    // (a beat runs on with the same device up to its library length; the presenter up to 6 s; a line under 0.9 s joins)
    const cap = it.device === 'presenter' ? 6 : Math.max(1.5, med((N[it.device] || []).map((t) => t.dur), 2.5) * 1.4);
    if (last && (last.device === it.device || l.end - l.at < .9) && (last.end - last.at) + (l.end - l.at) <= cap) { last.end = l.end; last.text += l.text; continue; }
    beats.push({ at: l.at, end: l.end, device: it.device, intent: it.id, text: l.text });
  }
  // a presenter beat longer than 6 s is split (the reference never holds its presenter that long without a change)
  const out = [];
  for (const b of beats) { if (b.device !== 'presenter' || b.end - b.at <= 6) { out.push(b); continue; } const k = Math.ceil((b.end - b.at) / 5); for (let i = 0; i < k; i++) out.push({ ...b, at: b.at + (b.end - b.at) * i / k, end: b.at + (b.end - b.at) * (i + 1) / k }); }
  const subs = out.map((b, i) => {
    const ex = N[b.device]?.length ? pick(r, N[b.device]) : null, cam = ex?.measured?.camera || { zoom: 1, pan: [0, 0], moving: 0, ease: null };
    return { id: `R${String(i + 1).padStart(2, '0')}`, at: +b.at.toFixed(2), end: +b.end.toFixed(2), camera: { ...cam }, look: { base: ex?.measured?.base || 'light', lum: ex?.measured?.lum ?? 60, sat: 10, grain: ex?.measured?.grain ?? 2, vignette: 8 }, text: [], events: [],
      read: { device: b.device, material: MATERIAL_OF[b.device] || 'none', shows: b.text, layers: '', type: null, motion: '', transition: '硬切', texture: '' }, norm: { intent: b.intent, example: ex?.key || null } };
  });
  return { seg, range: [subs[0]?.at ?? 0, subs.at(-1)?.end ?? 0], cuts: subs.slice(1).map((s) => s.at), subs, items: breakdownItems(subs), source: 'norms', seed };
}

// the variants of each module the seed chooses among (pure): what changes the look of one technique without leaving it
export const VARIANTS = {
  title: [{}, { style: 'ink' }, { style: 'ink', brush: true }, { style: 'metal', shape: 'tall' }, { side: 'left' }, { side: 'right' }],
  insert: [{}, { out: 'glitch' }],
  quote: [{ color: true, stack: true }, { scatter: true }, {}],
  person: [{ layout: 'full', torn: true }, { layout: 'card' }],
  article: [{ style: 'yellow' }, { style: 'bar' }],
};
export const variantKey = (v) => JSON.stringify(v);
// (pure, tested) the seed's variant for each shot of a module, never the same one twice running for that module
export function chooseVariants(modules, seed) {
  const r = rng(seed ^ 0x5bd1e995), last = {};
  return modules.map((m) => { const vs = VARIANTS[m]; if (!vs) return null; let v = pick(r, vs), n = 0; while (vs.length > 1 && last[m] === variantKey(v) && n++ < 8) v = pick(r, vs); last[m] = variantKey(v); return v; });
}
// (pure, tested) sameness in a plan: three shots running of one module in one look, or every title set alike
export function varietyErrors(answer) {
  const out = [], sh = (answer?.shots || []).map((s) => { let p = {}; try { p = JSON.parse(s.spec); } catch { /* */ } const v = VARIANTS[s.module] ? Object.fromEntries(Object.keys(Object.assign({}, ...VARIANTS[s.module])).map((k) => [k, p[k] ?? null])) : {}; return { id: s.id, module: s.module, key: `${s.module}${JSON.stringify(v)}` }; });
  for (let i = 2; i < sh.length; i++) if (!['sidecard', 'insert'].includes(sh[i].module) && sh[i].key === sh[i - 1].key && sh[i].key === sh[i - 2].key) out.push(`${sh[i - 2].id}-${sh[i].id}: three ${sh[i].module} shots running in one look; vary them (VARIANTS) or change the device`);
  const titles = sh.filter((x) => x.module === 'title');
  if (titles.length >= 3 && new Set(titles.map((x) => x.key)).size === 1) out.push(`every title (${titles.length}) is set alike; give them different treatments (style, side, brush, shape)`);
  // the presenter is packaged with large design cards (a question, an object, a product), labels only as an accent
  // (blind review of cards: three presenter shots carried one small torn label each where the reference stood a card;
  // lessons L19)
  const pres = (answer?.shots || []).filter((x) => x.module === 'sidecard').map((x) => { try { return JSON.parse(x.spec); } catch { return {}; } });
  const tagOnly = pres.filter((p) => (p.tags || []).length && !(p.cards || []).length).length, carded = pres.filter((p) => (p.cards || []).length).length;
  if (tagOnly >= 2 && carded < tagOnly) out.push(`${tagOnly} presenter shots carry only torn labels and ${carded} a card; package the presenter with large design cards (sidecard cards: the question, the object, the product), labels as an accent`);
  return out;
}
