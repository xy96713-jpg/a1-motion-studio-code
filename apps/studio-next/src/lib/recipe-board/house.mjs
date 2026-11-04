// House rules (the user, 2026-10-21): the system uses only the house fonts (routing/house-rules.json) and adds no
// subtitles (the user adds them in the edit). Every font name older code asks for is an alias of a house font, so
// pages keep their names and draw in the house faces; a character missing from the face it is set in is an error,
// never a silent fallback to another font.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');
let rules = null;
export function houseRules(root = ROOT) {
  if (!rules) rules = JSON.parse(fs.readFileSync(path.join(root, 'work/recipe-board-v1/routing/house-rules.json'), 'utf8'));
  return rules;
}
export const subtitlesOn = () => houseRules().subtitles !== false;
export const fontFile = (f, root = ROOT) => path.join(root, houseRules(root).fonts.dir, f.file);
// which house fonts are installed; the line uses the house fonts only when all of them are
export function houseFonts(root = ROOT) {
  const all = houseRules(root).fonts.allowed.map((f) => ({ ...f, path: fontFile(f, root), installed: fs.existsSync(fontFile(f, root)) }));
  return { all, ready: all.every((f) => f.installed), missing: all.filter((f) => !f.installed).map((f) => `${f.name} (${f.file})`) };
}
// the family a name resolves to: a house family, an alias of one, or null (not allowed)
export function houseFamily(name, pick = {}) {
  const r = houseRules().fonts, n = String(name).replace(/^['"\s]+|['"\s]+$/g, '');
  if (r.allowed.some((f) => f.family === n)) return n;
  return pick[n] || r.alias[n] || null;
}
// @font-face for every house family and every alias, declared last so they win over older declarations of the
// same names
// a house font by its family or its name as the user knows it (黒華明朝, スミカク, 金畫字 ...)
export function houseByName(n, root = ROOT) {
  const r = houseRules(root).fonts.allowed, x = String(n || '').trim();
  return r.find((f) => f.family === x || f.name === x || f.name.split(/[（(]/)[0].trim() === x || f.name.includes(x) && x.length >= 2)?.family || null;
}
// a shot's type design: { display, text, accent } -> the house family each group of names is set in
export function typeErrors(type) {
  if (type == null) return [];
  if (typeof type !== 'object') return ['type: { display, text, accent } with house fonts'];
  const err = [];
  for (const [k, v] of Object.entries(type)) { if (k === 'displayX') { if (!(v >= 0.55 && v <= 1)) err.push('type.displayX: how narrow the display face is drawn, 0.55–1 (house.mjs shapedFont)'); continue; } if (!['display', 'text', 'accent'].includes(k)) err.push(`type.${k}: display, text or accent`); else if (v != null && !houseByName(v)) err.push(`type.${k}: "${v}" is not a house font (${houseRules().fonts.allowed.map((f) => f.name).join(' / ')})`); }
  const fams = new Set(Object.entries(type).filter(([k, v]) => k !== 'displayX' && v).map(([, v]) => houseByName(v)));
  if (fams.size > 2) err.push(`type: ${fams.size} fonts in one shot; two at most (a display face and one more)`);
  return err;
}
// the shot's own choice for each group of names (the designer's pick); names not picked keep their alias default
export function housePick(type, root = ROOT) {
  const groups = houseRules(root).fonts.groups || {}, pick = {};
  for (const [g, names] of Object.entries(groups)) { const fam = type && houseByName(type[g], root); if (fam) for (const n of names) pick[n] = fam; }
  return pick;
}
// the project's lettering (scripts/recipe-board.mjs sets RB_LETTERING from project.json); LATIN_RANGE: the letters,
// figures and their punctuation the figure face takes (the middle dot stays with the gothic: 廻想体 draws it as a dash)
export const lettering = () => process.env.RB_LETTERING || null;
// the house letterings' undressing (the user 2026-10-26: 不要红底的文字; 不要加字描边阴影): no plate under words, no typing
// cursor, no shadow or stroke, whatever a card page asks for
export const UNDRESS = `:where(*){--type-cursor:none}\n.chip,.plate,[data-plate]{background:transparent!important;box-shadow:none!important;clip-path:none!important;border:0!important;text-shadow:none!important}\n:where(body) *{text-shadow:none!important;-webkit-text-stroke:0!important}\n.chip::before,.chip::after,.plate::before,.plate::after,[data-plate]::before,[data-plate]::after{display:none!important}\n.chip .lab,.plate .lab,[data-plate] .lab{display:none!important}`;
export const lettered = () => ['gothic-kaiso', 'eva'].includes(lettering());
// (pure but for the files) the faces of a lettered project, one a role (house-rules.json lettering; the user 2026-10-26:
// 思源黑体是兜底 主要用之前安装的 6 个): { style, display, tall, small, latin, short, last }. The film's style is project.json
// style (scripts/recipe-board.mjs sets RB_STYLE), its display face routing/styles.json fonts.display, by the name the user
// knows it by; Latin and figures in the style's accent face when that is one that sets Latin, else the table's
export function letterRoles(root = ROOT, styleId = process.env.RB_STYLE || null) {
  const T = houseRules(root).lettering?.eva; if (!T) return null;
  let all = {}; try { all = JSON.parse(fs.readFileSync(path.join(root, 'work/recipe-board-v1/routing/styles.json'), 'utf8')).styles || {}; } catch {}
  const id = all[styleId] ? styleId : T.defaultStyle, st = all[id] || {}, named = houseByName(st.fonts?.display, root), acc = houseByName(st.fonts?.accent, root);
  // big Chinese in the style's face, any of the six (cjkDisplay); a word it does not draw as itself goes to the next
  const display = (T.cjkDisplay || []).includes(named) ? named : T.small;
  // how narrow the big face is drawn (shape: the style's fonts.displayX, else the table's default for the face)
  const [lo, hi] = T.shape?.x || [0.55, 1], x = Math.min(hi, Math.max(lo, Number(st.fonts?.displayX ?? T.shape?.default?.[display] ?? 1)));
  return { style: id, named, display, x, tall: x < 1, small: T.small, latin: (T.latinFrom || []).includes(acc) ? acc : T.latin, last: T.last };
}
// a house face drawn narrow (x across, 1 tall), made once by tallface.py and kept under fonts/house/derived; null when the
// face is not installed (the user 2026-10-26: 可以变形 变高 窄 根据设计来)
export function shapedFont(family, x, root = ROOT) {
  const f = houseFonts(root).all.find((a) => a.family === family); if (!f || !f.installed) return null; if (!(x < 1)) return f.path;
  const ext = path.extname(f.path), out = path.join(path.dirname(f.path), 'derived', `${path.basename(f.path, ext)}-tall-${Math.round(x * 100)}${ext}`);
  const sourceHash = createHash('sha256').update(fs.readFileSync(f.path)).digest('hex'), binding = out + '.source-sha256';
  const bound = fs.existsSync(binding) ? fs.readFileSync(binding, 'utf8').trim() : null;
  if (!fs.existsSync(out) || bound !== sourceHash) { fs.mkdirSync(path.dirname(out), { recursive: true });
    const py = process.env.A1_PYTHON || path.join(root, 'work/external-source-tool-canaries-v1/.venv/bin/python');
    const r = spawnSync(fs.existsSync(py) ? py : 'python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'tallface.py'), f.path, out, String(x)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`tallface: ${family}: ${(r.stderr || '').trim().split('\n').pop()}`);
    fs.writeFileSync(binding, sourceHash + '\n'); }
  return out;
}
export const LATIN_RANGE = 'U+0020-007E,U+00A0-00B6,U+00B8-024F,U+2010-2015,U+2030,U+2032-2033';
// the figure face named once per alias is embedded once per name by the card renderer (hyperframes inlines a font under
// 5 MB as a data URI at every url): 270 copies of a 4.8 MB face ran the compiler out of memory (2026-10-25, every card of
// a lettered project failed). A copy padded past the limit is kept as a file (the font's tables are untouched; the
// padding lies past them, where no table points)
const FILE_BACKED = 5.2 * 1024 * 1024;
export function fileBacked(file) {
  try {
    const st = fs.statSync(file); if (st.size > FILE_BACKED) return file;
    const out = path.join(path.dirname(file), '.file-backed', path.basename(file));
    if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < st.mtimeMs) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.concat([fs.readFileSync(file), Buffer.alloc(Math.ceil(FILE_BACKED - st.size) + 4096)])); }
    return out;
  } catch { return file; }
}
export function houseFontCss(root = ROOT, type = null) {
  // called as houseFontCss(type) (a shot's type, or null when it chooses none)
  if (root == null || typeof root === 'object') { type = root; root = ROOT; }
  const { all } = houseFonts(root), byFamily = Object.fromEntries(all.map((f) => [f.family, f]));
  const pick = housePick(type, root);
  // declared at each weight and style the older faces of the same names were declared at (none = 400, 700, 900, and
  // italic), so these, declared last, win the match: a face declared over a weight range lost to an older face of the
  // same name declared at exactly 400, and the module pages kept drawing in Source Han (found 2026-10-21)
  const face = (name, f) => { const u = pathToFileURL(f.path).href; return ['normal', '700', '900'].flatMap((w) => ['normal', 'italic'].map((st) => `@font-face{font-family:'${name}';src:url('${u}');font-weight:${w};font-style:${st}}`)).join('\n'); };
  // text that names no font inherits the house serif (the one that lacks none of the film's characters), never the
  // browser's default face
  // a project lettered as the reference (project.json lettering 'gothic-kaiso', the user's decision of 2026-10-25 for
  // paperclip-138-full: 字体不统一): every name a card asks for is the plain bold gothic, its Latin letters and figures
  // the condensed figure face — one face a role on cards as in chapters (morph.js face()); a shot's own pick is set aside
  if (lettering() === 'gothic-kaiso' && byFamily['House Gothic'] && byFamily['House Kaiso']) {
    const latin = { ...byFamily['House Kaiso'], path: fileBacked(byFamily['House Kaiso'].path) };
    // the CJK comma and full stop between figures set small (A、T、C、G at 320 px drew a wedge under each letter: whole-film
    // reviews of 2026-10-25), a size-adjusted face for those two marks only
    const marks = (name) => face(name, byFamily['House Gothic']).replace(/\}/g, ';unicode-range:U+3001-3002;size-adjust:45%}');
    const pair = (name) => [face(name, byFamily['House Gothic']), face(name, latin).replace(/\}/g, `;unicode-range:${LATIN_RANGE}}`), marks(name)].join('\n');
    return [...all.map((f) => (f.family === 'House Gothic' || f.family === 'House Kaiso' ? face(f.family, f) : pair(f.family))), ...Object.keys(houseRules(root).fonts.alias).map(pair), pair('House Paired'), `html{font-family:'House Paired';--type-cursor:none}\n${UNDRESS}`].join('\n');   // (the other house names too: title.html asks for 'House Kokka' by name)
  }
  // a film lettered eva wears no dress either: no plate under words, no typing cursor, no shadow or stroke (the banana film's
  // B01 set 複製品 on a red chip and B17 kept a cursor: the undressing was the gothic-kaiso films' alone)
  return [...all.map((f) => face(f.family, f)), ...Object.entries(houseRules(root).fonts.alias).map(([a, fam]) => face(a, byFamily[pick[a] || fam])), `html{font-family:'${(type && houseByName(type.text)) || 'House Kokka'}'}`, ...(lettering() === 'eva' ? [UNDRESS] : [])].join('\n');
}
// the characters of a text a house font lacks (fontTools reads the cmap; cached per font)
const CMAP = new Map();
export function missingGlyphs(family, text, { root = ROOT, file = null, py = process.env.A1_PYTHON || path.join(root, 'work/external-source-tool-canaries-v1/.venv/bin/python') } = {}) {
  const f = houseRules(root).fonts.allowed.find((x) => x.family === family);
  if (!f) return [...new Set(String(text))].filter((c) => /\S/.test(c));
  const actual = file || fontFile(f, root);
  const key = createHash('sha256').update(fs.readFileSync(actual)).digest('hex');
  if (!CMAP.has(key)) {
    // a character counts only when its glyph is drawn: a font may map a character it lacks to an empty glyph or to a
    // shared box (廻想体 drew 硅 and 實 blank, スミカク drew boxes for 硅實應, all present in their cmaps)
    const code = `import sys,json,hashlib,collections
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
f=TTFont(sys.argv[1],fontNumber=0);cmap=f.getBestCmap();gs=f.getGlyphSet()
by=collections.Counter(cmap.values());h={};cnt=collections.Counter()
for g in set(cmap.values()):
  p=RecordingPen()
  try: gs[g].draw(p)
  except Exception: pass
  k=hashlib.md5(repr(p.value).encode()).hexdigest() if p.value else None;h[g]=k
  if k: cnt[k]+=1
ok=[c for c,g in cmap.items() if c<0x3000 or (h.get(g) and by[g]<8 and cnt[h[g]]<8)]
print(json.dumps(sorted(ok)))`;
    const r = spawnSync(py, ['-c', code, actual], { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.status !== 0) throw new Error(`house font unreadable: ${f.file}`);
    CMAP.set(key, new Set(JSON.parse(r.stdout)));
  }
  const cmap = CMAP.get(key);
  return [...new Set([...String(text)])].filter((c) => /\S/.test(c) && !cmap.has(c.codePointAt(0)));
}
// in a rendered page: every text node's first font name and its characters (run in the browser)
export const PAGE_TEXT = `(() => { const out = {}; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue; const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue; const fam = cs.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, ''); out[fam] = (out[fam] || '') + t; }
  return out; })()`;
// the errors of a page's text against the house fonts: a font that is not a house font or an alias, a character
// the house font lacks
export function glyphErrors(byFamily, pick = {}) {
  const errors = [];
  for (const [name, text] of Object.entries(byFamily)) {
    const fam = houseFamily(name, pick);
    if (!fam) { errors.push(`font "${name}" is not a house font (routing/house-rules.json)`); continue; }
    const miss = missingGlyphs(fam, text);
    if (miss.length) errors.push(`${fam}: no glyph for ${miss.slice(0, 20).join('')}${miss.length > 20 ? ` (+${miss.length - 20})` : ''}`);
  }
  return errors;
}

// ---------------------------------------------------------------- the script on screen (user decision 2026-10-21: 繁体)

export const traditionalOn = () => houseRules().script === 'traditional';
const HANT = new Map();
let hantBin = null;
// the system's own transform (hant.swift, ICU Hans-Hant: context-aware for the common one-to-many, 头发 -> 頭髮),
// compiled once per machine and cached per string
export function toHant(strings) {
  const todo = [...new Set(strings.filter((s) => typeof s === 'string' && /[一-鿿]/.test(s) && !HANT.has(s)))];
  if (todo.length) {
    const src = path.join(path.dirname(new URL(import.meta.url).pathname), 'hant.swift');
    if (!hantBin) {
      const os = process.env.TMPDIR || '/tmp', bin = path.join(os, `a1-hant-${fs.statSync(src).mtimeMs | 0}`);
      if (!fs.existsSync(bin)) { const c = spawnSync('swiftc', ['-O', src, '-o', bin], { encoding: 'utf8' }); if (c.status !== 0) throw new Error(`hant.swift: ${c.stderr.slice(-300)}`); }
      hantBin = bin;
    }
    const r = spawnSync(hantBin, [], { input: JSON.stringify(todo), encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.status !== 0) throw new Error('hant: conversion failed');
    // (the Japanese forms applied here, where every converted string is kept: hantDeep reads this map)
    JSON.parse(r.stdout).forEach((t, i) => HANT.set(todo[i], jpVariants(t)));
  }
  return strings.map((s) => (HANT.has(s) ? HANT.get(s) : s));
}
// The house fonts are Japanese: a few Chinese characters they carry only in their Japanese form (值 as 値: 巨頭市值
// failed open-S16 with no house font for it). Such a character goes on screen in that form when the house's fullest
// face lacks it and has the variant; a character with no form in any house font still fails the shot.
export const JP_VARIANT = { 值: '値', 絕: '絶', 說: '説', 污: '汚', 揭: '掲', 晚: '晩', 姬: '姫', 錄: '録', 綠: '緑', 鄉: '郷', 衛: '衛', 歲: '歳', 戶: '戸', 稅: '税', 銳: '鋭', 脫: '脱', 閱: '閲', 悅: '悦', 兌: '兌', 搜: '捜', 瘦: '痩', 溫: '温', 黃: '黄', 為: '為', 將: '将', 狀: '状', 壯: '壮', 莊: '荘', 裝: '装', 冊: '冊', 吳: '呉', 呂: '呂' };
const FULLEST = 'House Kokka';
function jpVariants(s) {
  if (typeof s !== 'string' || !/[一-鿿]/.test(s)) return s;
  let out = s;
  for (const ch of new Set([...s].filter((c) => JP_VARIANT[c] && JP_VARIANT[c] !== c))) {
    try { if (missingGlyphs(FULLEST, ch).length && !missingGlyphs(FULLEST, JP_VARIANT[ch]).length) out = out.split(ch).join(JP_VARIANT[ch]); } catch { /* no font tools: leave it */ }
  }
  return out;
}
// every string of a spec or shot that is set on screen, in Traditional: file paths (a '/' or a picture or clip ending),
// URLs, and the words that must match a real page or are covered on it (phrase, highlight, hide) stay as they are
const KEEP = new Set(['type', 'phrase', 'highlight', 'hide', 'src', 'img', 'logo', 'photo', 'presenter', 'avatar', 'asset', 'path', 'file', 'url', 'credit', 'about', 'why', 'source', 'sources', 'factSources', 'facts', 'note', 'original', 'line', 'subtitle', 'gen', 'prompt', 'art', 'id', 'shotId', 'recipe', 'module', 'theme', 'preset', 'kind', 'tone', 'side', 'style', 'layout', 'do']);
const ON_SCREEN = new Set(['items.note', 'nodes.note', 'rows.note']);
const isPath = (s) => /\/|^https?:|\.(png|jpe?g|webp|mp4|mov|svg|gif|otf|ttf)$/i.test(s);
// the words of a spec set on screen (what hantDeep converts): every string that is not a kept key or a path
export function onScreenStrings(v) {
  const out = [], kept = (key, parent) => KEEP.has(key) && !ON_SCREEN.has(`${parent}.${key}`);
  const walk = (x, key, parent) => { if (kept(key, parent)) return; if (typeof x === 'string') { if (!isPath(x) && /\S/.test(x)) out.push(x); } else if (Array.isArray(x)) x.forEach((y) => walk(y, key, parent)); else if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) walk(y, k, key); };
  walk(v, null, null); return out;
}
// the characters of a spec's words (in Traditional, as shown) that no house font draws, found before rendering
// (趴 in 把英伟达干趴下 failed who-S7 only at its render, after the plan was accepted)
export function unsettable(spec, root = ROOT) {
  const words = onScreenStrings(spec); if (!words.length) return [];
  const shown = toHant(words).join(''), fams = houseRules(root).fonts.allowed.map((f) => f.family);
  return [...new Set([...shown])].filter((c) => /[\u3400-\u9fff]/.test(c) && fams.every((f) => missingGlyphs(f, c, { root }).length));
}
export function hantDeep(v) {
  if (!traditionalOn()) return v;
  const found = [];
  // a kept key keeps its whole value (type: { display, text, accent } names fonts, never words on screen)
  // ... except a word a module sets on screen under such a key: a chart item's `note` (当天跌幅 came out Simplified:
  // open-S4, framecheck), keyed by the list it is in
  const kept = (key, parent) => KEEP.has(key) && !ON_SCREEN.has(`${parent}.${key}`);
  const walk = (x, key, parent) => { if (kept(key, parent)) return; if (typeof x === 'string') { if (!isPath(x)) found.push(x); } else if (Array.isArray(x)) x.forEach((y) => walk(y, key, parent)); else if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) walk(y, k, key); };
  walk(v, null, null);
  toHant(found);
  const conv = (x, key, parent) => { if (kept(key, parent)) return x; if (typeof x === 'string') return !isPath(x) && HANT.has(x) ? HANT.get(x) : x; if (Array.isArray(x)) return x.map((y) => conv(y, key, parent)); if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, conv(y, k, key)])); return x; };
  return conv(v, null, null);
}

// ---------------------------------------------------------------- covering every character (2026-10-21)

// Every block of text a page sets (an element and its inline children: a title set a character a span is one block)
// is checked in the browser, before the text is fitted: when its font lacks a character, the whole block goes to the
// first house font of that font's `fallback` that has all of them, else any house font that has (only house fonts; a
// block is never split across faces); a block no house font covers is marked (window.__houseMissing) and fails.
// The cmaps are read once (fontTools) and cached beside the fonts, keyed by their sizes.
export function houseCoverScript(root = ROOT) {
  const r = houseRules(root).fonts, files = r.allowed.map((f) => fontFile(f, root));
  const key = `v6-${files.map((f) => (fs.existsSync(f) ? fs.statSync(f).size : 0)).join('-')}`, cache = path.join(root, r.dir, `.cover-${key}.js`);
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8');
  const sets = {};
  for (const f of r.allowed) { missingGlyphs(f.family, ''); const cps = [...CMAP.get(f.family)].sort((a, b) => a - b), ranges = [];
    for (const c of cps) { const last = ranges.at(-1); if (last && c === last[1] + 1) last[1] = c; else ranges.push([c, c]); } sets[f.family] = ranges; }
  const chain = Object.fromEntries(r.allowed.map((f) => [f.family, [f.family, ...(f.fallback || [])]]));
  const js = `(()=>{const R=${JSON.stringify(sets)},A=${JSON.stringify(r.alias)},CH=${JSON.stringify(chain)},S={};
for(const[k,v]of Object.entries(R)){const s=new Set();for(const[a,b]of v)for(let c=a;c<=b;c++)s.add(c);S[k]=s;}
const fam=(n)=>{n=n.trim().replace(/^['"]|['"]$/g,'');return S[n]?n:(window.__housePick||{})[n]||A[n]||null;};
const has=(f,t)=>[...t].every((ch)=>!/\\S/.test(ch)||S[f].has(ch.codePointAt(0)));
window.__houseMissing=[];
window.__houseCover=(root=document.body)=>{const units=new Map();const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
const SKIP=/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/;
for(let n=w.nextNode();n;n=w.nextNode()){const el=n.parentElement;if(!el||SKIP.test(el.tagName)||!n.textContent.trim())continue;
let u=el;while(u.parentElement&&u!==root&&/^inline/.test(getComputedStyle(u).display))u=u.parentElement;
if(!units.has(u))units.set(u,[]);units.get(u).push([el,n.textContent]);}
for(const[u,parts]of units){const all=parts.map((p)=>p[1]).join('');let bad=null;
for(const[el,t]of parts){const nm=getComputedStyle(el).fontFamily.split(',')[0];const f=fam(nm);if(!f){window.__houseMissing.push({font:nm,text:t.slice(0,30)});bad=null;break;}if(!has(f,t)){bad=f;break;}}
if(!bad)continue;const c=CH[bad].find((g)=>has(g,all))||Object.keys(S).find((g)=>has(g,all));
if(c){u.style.fontFamily="'"+c+"'";for(const[el]of parts)el.style.fontFamily="'"+c+"'";}
else window.__houseMissing.push({font:bad,text:all.slice(0,30),chars:[...new Set([...all].filter((ch)=>/\\S/.test(ch)&&!Object.keys(S).some((g)=>S[g].has(ch.codePointAt(0)))))].join('')});}
return window.__houseMissing;};})();`;
  fs.writeFileSync(cache, js);
  return js;
}
