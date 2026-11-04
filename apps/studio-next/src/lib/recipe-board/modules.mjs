// Shot modules (镜头手法模块): the reference film's recurring devices as reusable, parameterised pages, so a shot is a
// module and its spec, never coordinates written by hand for one shot (the user, 2026-10-20: 先复刻对标的讲法, 手法做成
// 模块, 每个模块和对标并排验收). Inventory and order: style-lab/technique-inventory (69 sequences, 14 devices).
//   sidecard  讲者加侧边卡片 / 撕纸标签 (presenter, a product card that slides in and swaps, torn-paper tags, red pen)
//   article   报道逐段高亮推进 (a captured page: headline typed, the camera moves to the phrase being said, bars sweep it)
//   chat / table / compare   (reference P14, P27, P26)
//   brand     品牌整屏亮相 (reference G13 at 176.8 s: a real photograph of the mark fills the frame, a slow push; a logo on
//             transparency stands on the dark stage instead) — the brand the shot names must be the mark the picture shows
//   insert    照片 / 实拍插入 (reference broll: a real photograph or clip cut in full frame with a slow push)
//   title     大字标题压在实拍 / 资料上 (P01, P07, P16, P38): real material or a generated plate dimmed, the title rising
//   person    人物资料卡 (P12, P30, P31): a real portrait with the name, its Latin form and the role
//   quote     引语排字 (P49, P29): what someone said, beside their black-and-white portrait or the presenter
//   steps     原理图 / 流程节点 (P32, P36): steps along a dashed line on paper, a picture in a ring (real or generated)
//   screen    界面演示: a real page or screen in perspective, the cursor to the thing said (OCR), a click, a push, a mark
//   chart     图表 (P04): figures on paper, name and arrow and a huge condensed number, the camera from one to the next
// Art slots (title.bg, steps.nodes.img) take { art: { prompt, real? } }: a free real photograph first, image generation
// when none fits (imagegen.realArt), text-free; everything else is real material or code.
// A module page (work/recipe-board-v1/modules/<id>.html) reads window.__spec, sets window.__ready, and draws any time t
// (recording seconds) with window.render(t). Times are the recording's, so cuts land on the words.
// Spec: { module, at, end, theme: { paper, ink, accent, mark }, ...module fields }.
import { marketErrors } from './market.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { sourcePath, loadProject, projectPaths } from './store.mjs';
import { assertScopeAllows } from './project-scope.mjs';
import { typeErrors as HOUSE_TYPE_ERRORS } from './house.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
// raised by a change to what every module's render shares (the encode, the page set-up, the frame extraction): a shot's
// identity takes only its own module's lines of this file (layers.mjs moduleStamp)
export const PREP_VERSION = 2;   // 2: the voice part keeps the picture's whole length
export const MODULES = ['sidecard', 'article', 'chat', 'table', 'compare', 'brand', 'insert', 'title', 'person', 'quote', 'steps', 'chart', 'screen', 'market', 'frame'];
export const THEMES = {
  // the chapter recipe of hupo-auto2 H800 (aesthetic/h800.json): cream paper, cobalt ink, one red
  h800: { paper: '#efe8d6', ink: '#2747a3', accent: '#e2261c', mark: '#e2261c', print: 'ink' },
  // close to the reference's own look (grey paper, black ink, yellow and black bars), for side-by-side checks of the telling
  reference: { style: 'reference', paper: '#e6e6e4', ink: '#0d0d0d', accent: '#e0281f', mark: '#f2d43a', print: 'none', red: ['#d8261c', '#5a0f0c'], green: ['#3aa63a', '#0f3a12'] },
};
// the styles a film chooses from (routing/styles.json; user, 2026-10-22: 不能一种风格不同主题视频): a spec's theme names a
// style, whose tokens become the page's colours (CSS variables on the page: --paper, --ink, --accent, --mark, --brand,
// --block, --up, --down, --bar, --foot), whose fonts are the shot's type unless it sets its own, and whose texture is
// laid over it unless it sets its own
let STYLES = null;
// (and each film's own world, derived from its subject: projects/<id>/style.json under film:<id>, filmworld.mjs)
const DATA_DIR = () => process.env.RECIPE_BOARD_DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '../../../../../work/recipe-board-v1');
export const filmStyles = (dir = DATA_DIR()) => { const out = {}, pd = path.join(dir, 'projects'); try { for (const p of fs.readdirSync(pd)) { const f = path.join(pd, p, 'style.json'); if (fs.existsSync(f)) try { const st = JSON.parse(fs.readFileSync(f, 'utf8')); out[`film:${p}`] = st; for (const [k, d] of Object.entries(st.directions || {})) out[`film:${p}/${k}`] = d; } catch { /* a half-written file */ } } } catch { /* no projects */ } return out; };
export const styles = () => (STYLES ||= (() => { let base = {}; try { base = JSON.parse(fs.readFileSync(path.join(DATA_DIR(), 'routing', 'styles.json'), 'utf8')).styles; } catch { /* none */ } return { ...base, ...filmStyles() }; })());
export const resetStyles = () => { STYLES = null; };
export function styleOf(name) { const st = typeof name === 'string' ? styles()[name] : null; return st ? { id: name, ...st } : null; }
// modules that share a page: insert is the brand page with a photograph or a clip (one page, so a fix reaches both:
// a copy of it missed brand's slide and failed the motion check, open-S6)
export const PAGE_OF = { insert: 'brand' };
export const GROUND_FPS = 24;
const pagePath = (cfg, m) => path.join(cfg.dataDir, 'modules', `${PAGE_OF[m] || m}.html`);
// the code a module page draws with (its page and the shared scripts), so frames cached from a page are drawn again
// when the page changes (talent S2: a table's fix never reached the frame that played it, its frames keyed on the spec)
// the subject of a picture on transparency, the picture's own size (cutout.swift: macOS Vision's lift subject), cached by
// the picture's bytes; null when none is found
export function frontCutout(file) {
  const key = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16), dir = path.join(os.tmpdir(), 'recipe-board-front'), out = path.join(dir, `${key}.png`);
  if (fs.existsSync(out)) return out; fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('swift', [path.join(path.dirname(new URL(import.meta.url).pathname), 'cutout.swift'), file, out], { encoding: 'utf8', timeout: 180000 });
  return r.status === 0 && fs.existsSync(out) ? out : null;
}
// (pure, tested) on a lettered project's cards the figure face's Latin set to the gothic's measure: 廻想体's capitals stand
// .70 em, the gothic's ideographs .93, so AGI beside 我要去做 came a size smaller and thin (who S13, ending S6, 2026-10-26);
// at 118 % its capitals stand .82 em, a little under the ideograph as Latin sits in CJK. The same two faces, no other.
export const LATIN_ADJUST = '118%';
export const latinMatched = (css) => String(css || '').replace(/;unicode-range:(U\+0020-007E[^;}]*)\}/g, `;unicode-range:$1;size-adjust:${LATIN_ADJUST}}`);
// (tested) a lettered project's faces, beyond what house.mjs maps (the user's roles, 2026-10-25 and 2026-10-26):
//   gothic-kaiso  big Chinese 思源黑体 Heavy (house.mjs), small Chinese 黒華明朝 (the user 2026-10-26: 不是什么明朝什么的字体吗)
//   eva           the six first (the user 2026-10-26: 尽量还是用那 6 款字 实在没有的用思源黑体兜底 … 细一点高一点 像 eva
//                 的感觉): big Chinese 黒華明朝 drawn tall (×.72 across, tallface.py), small Chinese 黒華明朝 as it is;
//                 another house face (思源黑体 last) only where 黒華明朝 lacks a character (the cover script's chain)
// Latin and figures 廻想体 in every one (by unicode-range, at the gothic's measure). Each under a name no page asks for;
// treat.js __letter sets each line in one by its size, and the house checks read each name as the face it is drawn from.
export const SMALL_FACE = 'A1 Serif Heavy', SMALL_MAX = 90, TALL_X = .72;
export const EVA_FACES = { big: 'Eva Display', alt: 'Eva Display Alt' };
export const EVA_PICK = { [EVA_FACES.big]: 'House Kokka', [EVA_FACES.alt]: 'House Kokka' };
// the big face is the film's style's display (house.mjs letterRoles: one of the six whose Chinese reads), the alternate
// 黒華明朝 drawn tall, which lacks none (the user 2026-10-26: 思源黑体是兜底 主要用之前安装的 6 个)
export const evaPick = (H) => { const R = H.letterRoles?.(); return R ? { [EVA_FACES.big]: R.display, [EVA_FACES.alt]: 'House Kokka' } : EVA_PICK; };
const faceFile = (H, family) => (H.houseFonts().all || []).find((f) => f.family === family)?.path || null;
export const evaOn = () => process.env.RB_LETTERING === 'eva';
function tallFile(H, family) {
  const f = (H.houseFonts().all || []).find((x) => x.family === family); if (!f) return null;
  const out = path.join(path.dirname(f.path), 'derived', `${path.basename(f.path, path.extname(f.path))}-tall-${Math.round(TALL_X * 100)}.ttf`);
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(f.path).mtimeMs) { fs.mkdirSync(path.dirname(out), { recursive: true });
    const py = process.env.A1_PYTHON || path.join(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..'), 'work/external-source-tool-canaries-v1/.venv/bin/python');
    const r = spawnSync(fs.existsSync(py) ? py : 'python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'tallface.py'), f.path, out, String(TALL_X)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`tallface: ${family}: ${(r.stderr || '').trim().split('\n').pop()}`); }
  return out;
}
export function letterFaces(css, H) {
  if (!process.env.RB_LETTERING) return css;
  const R = H.letterRoles?.(), kaiso = (H.houseFonts().all || []).find((f) => f.family === (evaOn() && R ? R.latin : 'House Kaiso')), kokka = (H.houseFonts().all || []).find((f) => f.family === 'House Kokka');   // Latin and figures in the style's Latin face (廻想体 or f.k 機械彫刻)
  if (!kaiso || !kokka) return css;
  const ws = ['normal', '700', '900'], st = ['normal', 'italic'], ku = pathToFileURL(H.fileBacked(kaiso.path)).href;
  const fam = (name, file) => ws.flatMap((w) => st.map((y) => `@font-face{font-family:'${name}';src:url('${pathToFileURL(file).href}');font-weight:${w};font-style:${y}}\n@font-face{font-family:'${name}';src:url('${ku}');font-weight:${w};font-style:${y};unicode-range:${H.LATIN_RANGE};size-adjust:${LATIN_ADJUST}}`)).join('\n');
  const out = [css, fam(SMALL_FACE, kokka.path)];
  // (the display 黒華明朝 drawn tall: 装甲明朝 at display size showed its armour — the drips under 顯, the hairlines through
  // 大模型 — and drew · empty, cards and talent reviews 2026-10-26; 黒華明朝 lacks none of the film's characters and
  // reads clean. Every name a page asks for is it from the first layout, so a module measures its words in the face they
  // are drawn in: set after the layout, the side card's names were sized in the old face and ran off the card)
  if (evaOn()) { const tall = tallFile(H, 'House Kokka'), big = R ? (H.shapedFont?.(R.display, R.x) || faceFile(H, R.display) || tall) : tall,   // the style's big face, drawn as narrow as its design asks (letterRoles x)
      names = [...new Set([...(H.houseFonts().all || []).map((f) => f.family), ...Object.keys(H.houseRules().fonts.alias || {}), 'House Paired'])];
    out.push(fam(EVA_FACES.big, big), fam(EVA_FACES.alt, tall), ...names.filter((n) => n !== SMALL_FACE).map((n) => fam(n, big)), "html{font-family:'House Paired'}"); }
  // (and, as house.mjs does for a gothic-lettered project, no words on a plate: a chip or plate is its words alone, no rule, shadow or outline (the user 2026-10-26: 不要加字描边阴影 下面或者侧面的红线) —
  // the user 2026-10-26: 不要红底的文字; and no typing cursor)
  // (the tall face is narrow of itself: a module's own squeeze, .cond's ×.86, is not laid on it again)
  if (evaOn()) out.push(`html .cond{transform:none}\nhtml .paper span.t{transform:none;margin:0}\nhtml .paper,html .paper span.t{border:0!important}html .paper::before{display:none!important}\n:where(*){--type-cursor:none}\n.chip,[data-plate]{background:transparent!important;box-shadow:none!important;clip-path:none!important;border:0!important;text-shadow:none!important}\n:where(body) *{text-shadow:none!important;-webkit-text-stroke:0!important}\n.chip::before,.chip::after,[data-plate]::before,[data-plate]::after{display:none!important}\n.chip .lab,[data-plate] .lab{display:none!important}`);
  return out.join('\n');
}
// (pure) the characters of a spec's words the tall display face lacks: a line holding one is set in the alternate
export function evaLacks(spec, H) {
  if (!evaOn()) return [];
  const text = H.onScreenStrings(H.hantDeep(spec)).join(''), cjk = [...new Set([...text].filter((c) => /[㐀-鿿豈-﫿]/.test(c)))].join('');
  const R = H.letterRoles?.(), disp = R?.display || 'House Kokka', broken = new Set([...(H.houseRules().lettering?.eva?.broken?.[disp] || '')]);
  return cjk ? [...new Set([...H.missingGlyphs(disp, cjk), ...[...cjk].filter((c) => broken.has(c))])] : [];
}
export const pageCode = (cfg, m) => crypto.createHash('sha256').update(['common.js', 'camera.js', 'marks.js', 'treat.js'].reduce((a, f) => { try { return a + fs.readFileSync(path.join(cfg.dataDir, 'modules', f), 'utf8'); } catch { return a; } }, fs.readFileSync(pagePath(cfg, m), 'utf8'))).digest('hex').slice(0, 16);
const fileUrl = (cfg, p) => pathToFileURL(sourcePath(cfg, p)).href;

// the longest words each module sets cleanly, measured on the module bench (bench.mjs: past these the words left the
// frame, shrank under 34 px or ran into the subtitle band): a plan past them is refused when it is written, not after
// its render failed (user, 2026-10-22: 为什么不先设计好减少返工)
// (pure) the values at a path ('cards[].title': every card's title)
export function valuesAt(o, p) { let cur = [o]; for (const part of p.split('.')) { const arr = part.endsWith('[]'), k = arr ? part.slice(0, -2) : part; cur = cur.flatMap((x) => { const v = x?.[k]; return arr ? (Array.isArray(v) ? v : []) : v === undefined ? [] : [v]; }); } return cur; }
// (pure) a text's width in characters: a Chinese character one, a Latin letter, digit or space a little over half
export const ems = (v) => [...String(v)].reduce((a, c) => a + (/[\x20-\x7e]/.test(c) ? .55 : 1), 0);
export const TEXT_MAX = {
  sidecard: { 'cards[].list[].text': 7, 'cards[].title': 10, 'cards[].sub': 11, 'cards[].label': 10 },
  title: { lead: 14, text: 10 }, chat: { title: 10 }, compare: { 'left.title': 10, 'right.title': 10 }, table: { 'columns[]': 8 },
  chart: { 'items[].label': 10, 'items[].note': 14, 'items[].desc': 14 },
  steps: { 'nodes[].note': 20 }, person: { en: 12, role: 15 },
};
export const GROUND_MODULES = ['table', 'market', 'steps'];
// the modules whose picture takes the lens (camera.js), and the lens a shot takes from the reference's own depth over its
// span (depth.py: the textured-but-soft share): none under LENS_MIN, else a blur that grows with it
// the display treatments (common.js M.treat): a title's or a frame's display line takes one
export const TREATS = ['metal', 'extrude', 'glow', 'emboss', 'halftone', 'glitch', 'overprint', 'slant', 'condense'];
export const HOUSE_FACES = ['スミカク', '金畫字', '黒華明朝', '装甲明朝', '廻想体 ネクスト', 'f.k 機械彫刻'];
const treatOk = (v) => v == null || [].concat(v).every((k) => TREATS.includes(k));
export const LENS_MODULES = ['insert', 'person', 'market'], LENS_MIN = .06;
// (and a sharp zone that shrinks as the reference softens: at a fixed .42 a reference soft over most of its frame came
// out sharp edge to edge, opensrc S6's dollar under a lens whose zone took in the pyramid too)
// (calibrated on meta S1 once depth.py read past the grain: blur 1 + 20 x the reference's soft share measures as the
// reference does, 0.1 against 0.09; at 3 + 20 x it measured twice the reference's softness)
export const lensFor = (soft) => (soft == null ? null : soft < LENS_MIN ? false : { blur: +Math.min(9, 1 + 20 * soft).toFixed(1), r: +Math.max(.2, .44 - .35 * soft).toFixed(2) });
async function refLens(cfg, id, spec) {
  const video = loadProject(cfg, id).sourceVideo, vsrc = video ? sourcePath(cfg, video) : null; if (!vsrc || !fs.existsSync(vsrc)) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-')), fr = [.25, .5, .75].map((k, i) => { const f = path.join(dir, `r${i}.png`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(spec.at + (spec.end - spec.at) * k), '-i', vsrc, '-frames:v', '1', f]); return f; }).filter((f) => fs.existsSync(f));
  const r = fr.length ? spawnSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'depth.py'), '--frames', ...fr], { encoding: 'utf8' }) : null; fs.rmSync(dir, { recursive: true, force: true });
  if (!r || r.status) return null; const v = JSON.parse(r.stdout); return lensFor(v.reduce((a, b) => a + b, 0) / v.length);
}
export function checkModuleSpec(s) {
  const err = [];
  // the shot's type design (house fonts only: house.mjs)
  if (s?.type != null) err.push(...HOUSE_TYPE_ERRORS(s.type));
  if (!MODULES.includes(s?.module)) err.push(`unknown module "${s?.module}"`);
  for (const [p, max] of Object.entries(TEXT_MAX[s?.module] || {})) for (const v of valuesAt(s, p)) if (typeof v === 'string' && ems(v) > max) err.push(`${s.module} ${p.replace('[]', '')} "${v}": ${max} characters at most, a Latin letter half of one (longer leaves the frame or shrinks past reading: the module bench)`);
  // a title held to the reference's display line (refType) can be no longer than the frame holds at four fifths of it
  // (1750 px of room, CJK ink .88 of the em: bench cards-S7 at its longest words came out at half the reference's size)
  if (s?.module === 'title' && s.refType?.h && !s.side && !s.size && typeof s.text === 'string') { const max = Math.floor(1750 / (.8 * s.refType.h / .88)); if (ems(s.text) > max) err.push(`title text "${s.text}": at the reference's display line (${s.refType.h} px) the frame holds ${max} characters; shorter words, or a size of its own`); }
  // one treatment a line, never stacked (the user 2026-10-26: 越来越丑 — metal on slant, glitch on extrude); and where the
  // project letters its words (lettering: one face a role for the whole film, the user's rule of 2026-10-25) no shot sets
  // a face of its own (the user 2026-10-26: 你怎么来回改字 我不是规定了用哪些字)
  { const tr = (v) => Array.isArray(v) && v.length > 1; if (tr(s?.treat) || (s?.parts || []).some((l) => tr(l.treat))) err.push('treat: one treatment, not a stack (metal with slant, glitch with extrude read heavy and cheap)'); }
  if (process.env.RB_LETTERING && (s?.type != null || s?.face != null || (s?.parts || []).some((l) => l.face != null) || (s?.cards || []).some((c) => c.face != null))) err.push(`type/face: the project letters its words (${process.env.RB_LETTERING}): one face a role for the whole film, no shot sets its own`);
  // (and a module drawn inside it — a frame's ground: the table under talent S2 kept a face of its own, refused only when
  // drawn, at the sheet, where the plan check had passed it)
  for (const inner of [s?.ground?.src?.module, s?.bg?.module].filter((x) => x && typeof x === 'object')) for (const e of checkModuleSpec({ at: s.at, end: s.end, ...inner })) if (/^type\/face|^treat/.test(e)) err.push(`ground: ${e}`);
  if (!(s?.end > s?.at)) err.push('empty span');
  const inSpan = (t, what) => { if (!(t >= s.at - 0.01 && t <= s.end + 0.01)) err.push(`${what} at ${t} outside the shot`); };
  for (const l of s?.layers || []) { if (!l.art || (typeof l.art !== 'string' && !(l.art.prompt || l.art.art?.prompt))) err.push('layer: art is { prompt } (painted, text-free, on transparency) or a cutout path');
    if (l.at != null) inSpan(l.at, 'layer'); if (l.w != null && !(l.w > .02 && l.w <= 1.5)) err.push('layer: w in frame widths, 0.02-1.5'); if (l.depth != null && !(l.depth >= -1 && l.depth <= 1)) err.push('layer: depth -1 (under the content) to 1 (nearest)');
    if (l.in != null && !['fade', 'rise', 'drop', 'slide', 'none'].includes(l.in)) err.push('layer: in is fade, rise, drop, slide or none');
    if (l.under != null && !(typeof l.under === 'string' && /^[#.][\w-]+$/.test(l.under))) err.push('layer: under is the selector (#id or .class) of the page\'s words it goes beneath');
    if (typeof l.art === 'object' && /\b(text|words?|letters?|logo|caption|title)\b/i.test(String(l.art.prompt || '').replace(/no (text|words|letters|logos?)[^.]*/gi, ''))) err.push('layer: a painted layer carries no words or marks (words are set by code, marks are real)'); }
  if ((s?.layers || []).length > 6) err.push('layers: 6 at most');
  // the shared camera and texture (modules/camera.js; breakdown.mjs): any module
  if (s?.camera != null) { if (!Array.isArray(s.camera)) err.push('camera: a list of moves { at, end, from: { zoom, x, y }, to: { zoom, x, y }, ease }');
    else for (const m of s.camera) { inSpan(m.at, 'camera move'); inSpan(m.end, 'camera move end'); if (!(m.end > m.at)) err.push('camera move: end after at');
      for (const k of ['from', 'to']) { const v = m[k]; if (!v || !(v.zoom >= 1 && v.zoom <= 2.5)) err.push(`camera move ${k}.zoom 1-2.5 (a pull-out starts zoomed in)`); else if (Math.abs(v.x || 0) > (v.zoom - 1) / 2 + 1e-6 || Math.abs(v.y || 0) > (v.zoom - 1) / 2 * 9 / 16 + 1e-6) err.push(`camera move ${k}: x, y within (zoom - 1) / 2 of the centre (the picture keeps covering the frame)`); }
      if (m.ease && !['out', 'in', 'inout', 'linear'].includes(m.ease)) err.push('camera move ease: out / in / inout / linear'); } }
  // (saturate and exposure may go below 0: a green 3D mark too vivid against the reference's grey wall, who-S6; dollar
  // clips darker than the reference's, who-S15-S17)
  if (s?.texture != null) for (const k of Object.keys(s.texture)) { const lo = ['saturate', 'exposure'].includes(k) ? -1 : 0; if (!['grain', 'vignette', 'fringe', 'contrast', 'saturate', 'exposure'].includes(k) || !(s.texture[k] >= lo && s.texture[k] <= 1)) err.push(`texture.${k}: grain / vignette / fringe / contrast 0-1, saturate / exposure -1-1`); }
  if (s?.module === 'sidecard') {
    if (!s.presenter) err.push('sidecard: presenter missing');
    for (const c of s.cards || []) {
      inSpan(c.at, 'card'); if (!c.img) err.push('card without a picture (real material)'); else if (typeof c.img !== 'string' && !c.img?.art?.prompt) err.push('card img: a picture path, or { art: { prompt } } for a prop that is no evidence');
      for (const w of c.swap || []) { inSpan(w.at, 'swap'); if (!w.img) err.push('swap without a picture'); }
    }
    if (s.curl) { inSpan(s.curl.at, 'page curl'); if (!s.curl.src) err.push('page curl: the page (real material) is missing'); if (s.curl.label && [...s.curl.label].length > 16) err.push('page curl: label 16 characters at most'); }
    // a tag at the bottom is the closing line (up to 14 characters); mark: the words of it set in red
    for (const t of s.tags || []) { inSpan(t.at, `tag "${t.text}"`); const max = t.side === 'bottom' ? 14 : 10; if (!t.text || [...t.text].length > max) err.push(`tag "${t.text}": 1-${max} characters`);
      if (t.side && !['left', 'right', 'bottom'].includes(t.side)) err.push(`tag "${t.text}": side left / right / bottom`); if (t.mark && !String(t.text).includes(t.mark)) err.push(`tag "${t.text}": mark "${t.mark}" is not in it`); }
  }
  if (s?.module === 'chat') {
    if (s.push?.msg != null && !(Number.isInteger(s.push.msg) && s.push.msg >= 0 && s.push.msg < (s.messages || []).length)) err.push('chat: push.msg is the index of a message');
    if (s.push?.travel != null && !(Math.abs(s.push.travel) <= .6)) err.push('chat: push.travel is frame widths read along the message (-0.6 to 0.6)');
    if (!s.messages?.length) err.push('chat: no messages');
    for (const m of s.messages || []) {
      inSpan(m.at, `message "${m.text}"`);
      if (!m.avatar) err.push(`message "${m.text}": an avatar (a real portrait) is needed`);
      if (!m.text || [...m.text].length > 22) err.push(`message "${m.text}": 1-22 characters`);
      if (m.mark && !m.text.includes(m.mark)) err.push(`message "${m.text}": the red words are not in it`);
    }
    if (s.push) inSpan(s.push.at, 'push');
  }
  if (s?.module === 'compare') {
    if (!s.photo) err.push('compare: the hardware photo (real material) is missing');
    for (const side of ['left', 'right']) { const b = s[side]; if (!b?.title || !b?.rows?.length) err.push(`compare: ${side} block needs a title and rows`); else inSpan(b.at, `${side} block`); }
    if (s.backAt != null) inSpan(s.backAt, 'the pan back to the left block');
    // (left.back: what the left block gains when the camera comes back to it — rows, and the row marked in the accent)
    if (s.left?.back && (!Array.isArray(s.left.back.rows || []) || (s.left.back.mark != null && !Number.isInteger(s.left.back.mark)))) err.push('compare: left.back is { rows: [[key, value]], mark: the index of the row (of all the block\'s rows) set in the accent }');
    const txt = ['left', 'right'].flatMap((k) => [s[k]?.title, ...(s[k]?.rows || []).flat(), ...((s[k]?.back?.rows) || []).flat()]).join(' ');
    for (const n of txt.match(/\d+(?:\.\d+)?/g) || []) if (!(s.facts || []).some((f) => String(f.text ?? f.value ?? '').includes(n) && f.source)) err.push(`compare: ${n} without a fact`);
  }
  if (s?.module === 'table') {
    if (!s.columns?.length || !s.rows?.length) err.push('table: columns and rows needed');
    for (const r of s.rows || []) if (r.length !== (s.columns || []).length) err.push(`table: a row of ${r.length} cells under ${(s.columns || []).length} columns`);
    (s.rowsAt || []).forEach((t, i) => inSpan(t, `row ${i + 1}`));
    // every figure on the table is a fact (the line's rule): each number must be in a fact with a source
    const cellsText = [...(s.columns || []), ...(s.rows || []).flat()].join(' ');
    for (const n of cellsText.match(/\d+(?:\.\d+)?/g) || []) if (!(s.facts || []).some((f) => String(f.text ?? f.value ?? '').includes(n) && f.source)) err.push(`table: ${n} without a fact`);
  }
  // a stage that draws nothing until its first element (a chart, a table, steps without a heading) is blank meanwhile:
  // the first comes within 0.4 s of the cut (opensrc-S7/S8, r1-S7: blank for 0.5-3 s, caught only on the sheet)
  { const first = s?.module === 'chart' ? s.items?.[0]?.at : s?.module === 'table' ? s.rowsAt?.[0] : s?.module === 'steps' && !s.title ? s.nodes?.[0]?.at : null;
    if (first != null && first - s.at > .4) err.push(`${s.module}: nothing is on screen until ${first} s; bring the first element in within 0.4 s of the cut (${(s.at + .1).toFixed(2)})`); }
  if (s?.module === 'brand') {
    if (!s.src) err.push('brand: the picture of the mark (real material) is missing');
    if (!s.name || [...s.name].length > 12) err.push('brand: name the brand shown (1-12 characters)');
    if (s.label && [...s.label].length > 16) err.push('brand: label 16 characters at most');
    if (s.line != null && (typeof s.line !== 'string' || ems(s.line) > 14)) err.push('brand: line, 14 characters at most (a Latin letter half of one)');
  }
  if ((s?.module === 'insert' || s?.module === 'brand') && s.tilt != null && !(Array.isArray(s.tilt) && s.tilt.length === 2 && s.tilt.every((v) => Math.abs(v) <= 30))) err.push(`${s.module}: tilt is [x, y] degrees, each within 30`);
  if ((s?.module === 'insert' || s?.module === 'brand') && s.fit != null && s.fit !== 'contain') err.push(`${s.module}: fit is "contain" (the picture whole on the dark stage) or none`);
  if ((s?.module === 'insert' || s?.module === 'brand') && s.crop != null && !(Array.isArray(s.crop) && s.crop.length === 4 && s.crop.every((v) => v >= 0 && v <= 1) && s.crop[0] + s.crop[2] <= 1.001 && s.crop[1] + s.crop[3] <= 1.001)) err.push(`${s.module}: crop is [x, y, w, h], shares of the picture`);
  if (s?.module === 'insert') {

    if (!s.src) err.push('insert: the photograph (real material) is missing');
    if (s.label && [...s.label].length > 16) err.push('insert: label 16 characters at most');
    if (s.then != null) { if (!s.then.src) err.push('insert: then needs the second picture (src)'); inSpan(s.then.at, 'insert then'); }
    if (s.out != null && s.out !== 'glitch') err.push('insert: out is glitch (or none: a hard cut)');
    if (s.glitch != null && s.glitch !== 'through') err.push('insert: glitch is through (the whole shot tears in bursts) or none');
    if (s.figure != null && (typeof s.figure !== 'boolean' || (s.figure && s.fit !== 'contain'))) err.push('insert: figure is true for a paper\'s figure cut from its archived page, shown whole (fit contain)');
  }
  // a market picture's figures come from the archived prices (market.mjs), never from the spec
  if (s?.module === 'title' && ((s.lead != null && typeof s.lead !== 'string') || (s.mono != null && typeof s.mono !== 'boolean'))) err.push('title: lead is a short line over the title, mono true for a black and white ground');
  if (s?.module === 'table' && s.ground != null && s.ground !== 'grid') err.push('table: ground is grid (white squared paper, black type) or none (the dark stage)');
  if (s?.module === 'market') { err.push(...marketErrors(s)); if (s.labels && Object.values(s.labels).some((v) => /\d/.test(v) || [...String(v)].length > 14)) err.push('market: labels are names (no figures, 14 characters at most)'); }
  // every figure set on screen is a fact (the line's rule): the words of the new modules are read for numbers
  const figures = (what, text) => { for (const n of String(text || '').match(/\d+(?:\.\d+)?/g) || []) if (!(s.facts || []).some((f) => String(f.text ?? f.value ?? '').includes(n) && f.source)) err.push(`${what}: ${n} without a fact`); };
  if (s?.module === 'brand' && s.line) figures('brand', s.line);
  const isArt = (v) => v && typeof v === 'object' && v.art?.prompt;
  // 合成帧 (frame.html): a designed frame from layers; words are code, pictures real or text-free art, numbers sourced
  if (s?.module === 'frame') {
    const G = s.ground || {}, src = (v) => typeof v === 'string' || isArt(v) || (v && typeof v === 'object' && (v.module || v.market || v.after || v.shot));
    if (!G.color && !G.gradient && !G.src) err.push('frame: ground is a colour, a gradient { from, to } or a picture (src)');
    if (s.stands && !MODULES.includes(s.stands)) err.push(`frame: stands is the device it designs (${MODULES.filter((x) => x !== 'frame').join(', ')})`);
    if (G.src && !src(G.src)) err.push('frame: ground.src is a material path, { art: { prompt } } or { module }');
    if (!(s.parts || []).length || s.parts.length > 14) err.push('frame: 1-14 parts (spec.parts)');
    for (const [i, l] of (s.parts || []).entries()) {
      const w = `frame part ${i + 1}`, b = l.box;
      if (!['image', 'text', 'shape'].includes(l.kind)) err.push(`${w}: kind is image, text or shape`);
      if (!b || [b.x, b.y, b.w].some((v) => typeof v !== 'number') || b.w <= 0 || b.w > 140) err.push(`${w}: box { x, y, w } in % of the frame`);
      if (l.in && !['fade', 'rise', 'slide', 'type', 'wipe', 'pop', 'none'].includes(l.in)) err.push(`${w}: in is fade, rise, slide, type, wipe, pop or none`);
      // (fadeAt is how much of the picture stays solid before its edge melts: 12 left a portrait a see-through ghost, meta-S8)
      if (l.kind === 'image' && l.fade && (l.fadeAt ?? 55) < 40) err.push(`${w}: fadeAt ${l.fadeAt} leaves most of the picture see-through; 40 or more (the share kept solid before the edge melts)`);
      if (l.at != null) inSpan(l.at, w);
      if (l.until != null) inSpan(l.until, `${w} until`);
      if (l.blend && !['multiply', 'screen', 'normal', 'darken', 'lighten'].includes(l.blend)) err.push(`${w}: blend is multiply, screen, darken, lighten or normal`);
      if (l.kind === 'image' && !src(l.src)) err.push(`${w}: src is a material path or { art: { prompt } }`);
      if (l.kind === 'image' && l.crop && [l.crop.x, l.crop.y, l.crop.w, l.crop.h].some((v) => typeof v !== 'number' || v < 0 || v > 1)) err.push(`${w}: crop { x, y, w, h } in fractions of the picture`);
      if (l.kind === 'image' && l.phrase != null && !(typeof l.phrase === 'string' || (Array.isArray(l.phrase) && l.phrase.length === 2 && l.phrase.every((x) => typeof x === 'string')))) err.push(`${w}: phrase is the words the part is cut to, or [first, last] of a block`);
      if (l.kind === 'image' && l.phrase && l.crop) err.push(`${w}: phrase or crop, not both (the phrase sets the crop)`);
      if (l.kind === 'text' && !treatOk(l.treat)) err.push(`${w}: treat is one or more of ${TREATS.join(', ')}`);
      if (l.face != null && !HOUSE_FACES.includes(l.face)) err.push(`${w}: face is a house face`);
      if (l.tilt != null && !(Array.isArray(l.tilt) && l.tilt.length === 2 && l.tilt.every((v) => Math.abs(v) <= 40))) err.push(`${w}: tilt is [x, y] degrees, each within 40`);
      if (l.depth != null && !(l.depth >= 0 && l.depth <= 1)) err.push(`${w}: depth 0-1 (0 in focus)`);
      if (l.kind === 'text') { if (!l.text) err.push(`${w}: text`); else if ([...l.text].length > 24) err.push(`${w}: "${l.text}" 24 characters at most`); if (l.role && !['display', 'text', 'accent', 'gothic'].includes(l.role)) err.push(`${w}: role is display, text, accent or gothic`); figures('frame', l.text); }
    }
  }
  if (s?.module === 'title') {
    if (!s.text || [...s.text].length > 10) err.push('title: the title, 1-10 characters');
    if (s.en && s.en.length > 40) err.push('title: the English line 40 characters at most');
    if (s.bg && typeof s.bg !== 'string' && !isArt(s.bg) && !s.bg.market && !s.bg.module && !s.bg.after && !/^[a-z0-9-]+\/S\d+$/i.test(s.bg.shot || '')) err.push("title: bg is a picture path, { art: { prompt } }, { market: { mode, symbol, day, from } }, { module: <a table or market spec> } or { shot: 'seg/S#' } (a recall)");
    // (a ground drawn by another module of the line, its last frame: the reference lays 人員 over the team's table, recap-S1)
    if (s.bg?.module) { const m = s.bg.module; if (!GROUND_MODULES.includes(m.module)) err.push(`title: bg.module is one of ${GROUND_MODULES.join(', ')}`); else err.push(...checkModuleSpec({ ...m, at: m.at ?? 0, end: m.end ?? 3 }).map((e) => `title: bg.module: ${e}`)); }
    if (s.style && !['ink', 'metal', 'brand'].includes(s.style)) err.push('title: style is ink, metal or brand (or none)');
    if (s.side != null && !['left', 'right'].includes(s.side)) err.push('title: side is left or right (or none: centred)');
    if (s.big != null && !String(s.text || '').includes(s.big)) err.push(`title: big "${s.big}" is not in the title`);
    for (const k of ['color', 'block']) if (s[k] != null && !/^#[0-9a-f]{6}$/i.test(s[k])) err.push(`title: ${k} is a colour #rrggbb`);
    if (s.style === 'brand' && !s.en) err.push('title: a brand title sets the name as the brand writes it (en)');
    if (s.enSize != null && !(s.style === 'brand' && s.enSize >= 80 && s.enSize <= 320)) err.push('title: enSize (the brand name\'s px, 80-320) on a brand title');
    if (s.shape != null && s.shape !== 'tall') err.push('title: shape is tall (condensed, set by its height) or none');
    // thin tall metal letters over a painted scene full of detail read as nothing (blind review cards-S2: grey strokes over
    // a wall of K-lines): the scene is pushed back (lessons L20)
    if (s.style === 'metal' && isArt(s.bg) && !((s.dim ?? 0) >= .45 || (s.blur ?? 0) >= 4)) err.push('title: metal letters over a painted scene need it pushed back (dim 0.45+ or blur 4+), or a quiet ground');
    if (s.height != null && !(s.height >= .2 && s.height <= .7)) err.push('title: height 0.2-0.7 of the frame');
    if (s.focus != null && !(s.focus.x >= 0 && s.focus.x <= 1 && s.focus.y >= 0 && s.focus.y <= 1 && s.focus.zoom >= .6 && s.focus.zoom <= 4)) err.push('title: focus is { x, y (0-1 of the picture), zoom 0.6-4 (under 1: the picture whole, smaller, on the dark) }');
    if (s.focus != null && !s.bg) err.push('title: focus frames the ground (bg)');
    if (s.tiles != null && (!s.tiles.src || !(s.tiles.n >= 2 && s.tiles.n <= 6))) err.push('title: tiles is { src: the real mark, n: 2-6, crop? }');
    if (s.tiles?.crop != null && !(Array.isArray(s.tiles.crop) && s.tiles.crop.length === 4 && s.tiles.crop.every((v) => v >= 0 && v <= 1) && s.tiles.crop[2] > 0 && s.tiles.crop[3] > 0)) err.push('title: tiles crop is [x, y, w, h] in fractions of the picture');
    if (!treatOk(s.treat)) err.push(`title: treat is one or more of ${TREATS.join(', ')}`);
    if (s.face != null && !HOUSE_FACES.includes(s.face)) err.push('title: face is a house face');
    if (s.brush) err.push('title: no brush hand — ragged ink edges read as torn paper (user 2026-10-25: 之后也不要这种纸条撕纸设计什么的了); set the title clean');
    if (s.reveal != null && !(s.reveal >= .2 && s.reveal <= s.end - (s.textAt ?? s.at))) err.push('title: reveal is the seconds the characters take to come in (0.2 s up to the rest of the shot)');
    if (s.card != null) { const c = s.card; if (!c.mark?.src && !(c.lines || []).length) err.push('title: card has the real mark ({ src, crop? }) and / or lines');
      if ((c.lines || []).length > 4 || (c.lines || []).some((l) => !l || [...l].length > 14)) err.push('title: card lines, 4 at most, 14 characters each');
      if (!s.bg) err.push('title: a card lies on a ground (bg: a painted plate, { art: { prompt } })'); figures('title card', (c.lines || []).join(' ')); }
    figures('title', `${s.text} ${s.en || ''}`);
  }
  if (s?.module === 'person') {
    if (s.photoAt != null && !(s.photoAt >= 0)) err.push('person: photoAt is seconds into the clip');
    if (!s.photo || typeof s.photo !== 'string') err.push('person: a real photograph of the person is needed (never generated)');
    if (!s.name || [...s.name].length > 10) err.push('person: the name, 1-10 characters');
    if (s.role && [...s.role].length > 24) err.push('person: role 24 characters at most');
    if (s.bio != null && (typeof s.bio !== 'string' || [...s.bio].length > 60)) err.push('person: bio is a few words on who the person is, 60 characters at most');
    if (s.bio) figures('person', s.bio);
    if (s.layout && !['full', 'card'].includes(s.layout)) err.push('person: layout is full or card');
    if (s.torn) err.push('person: no torn paper strip under the name — torn paper, paper strips and ragged brush edges are not used (user 2026-10-25: 之后也不要这种纸条撕纸设计什么的了); the name set clean');
    if (s.nameAt != null) inSpan(s.nameAt, 'name');
    if (s.reveal != null && !(s.reveal >= .3 && (s.nameAt ?? s.at) + s.reveal < s.end)) err.push('person: reveal is the seconds the name, its English line and the role take to come in (inside the shot)');
    figures('person', s.role);
    for (const l of s.say || []) { inSpan(l.at, `said "${l.text}"`); if (!l.text || [...l.text].length > 12) err.push(`person said "${l.text}": 1-12 characters a group`); for (const w of l.big || []) if (!l.text?.includes(w)) err.push(`person said "${l.text}": the big words are not in it`); figures('person', l.text); }
  }
  if (s?.module === 'quote') {
    if (!s.photo && !s.presenter && !s.scatter) err.push('quote: the person\'s photograph, or the presenter (or scatter: what many said, on the dark stage)');
    if (s.scatter && (s.lines || []).filter((l) => l.main).length > 1) err.push('quote: one main line in a scatter');
    if (!s.lines?.length) err.push('quote: no lines');
    if (s.size != null && !(s.size >= 60 && s.size <= 160)) err.push('quote: size 60-160 px');
    for (const l of s.lines || []) { inSpan(l.at, `quote line "${l.text}"`); const mx = s.scatter && l.main ? 22 : 14; if (!l.text || [...l.text].length > mx) err.push(`quote line "${l.text}": 1-${mx} characters a group`); for (const w of l.big || []) if (!l.text?.includes(w)) err.push(`quote line "${l.text}": the big words are not in it`); figures('quote', l.text); }
  }
  if (s?.module === 'steps') {
    if (!s.nodes?.length || s.nodes.length > 5) err.push('steps: 1-5 steps');
    if (s.title && [...s.title].length > 14) err.push('steps: title 14 characters at most');
    if (s.look != null && s.look !== 'ring') err.push('steps: look is "ring" (the words on the pictures, notes under them, a curve through) or none');
    for (const n of s.nodes || []) if (n.note != null && !(typeof n.note === 'string' && [...n.note].length <= 40)) err.push(`step "${n.text}": note 40 characters at most`);
    if (s.look === 'ring' && (s.nodes || []).some((n) => !n.img)) err.push('steps look ring: every step has a picture');
    // drop: a branch under one step of a plain row (a line falls to a box): its words short, one step only, after its step
    for (const n of s.nodes || []) if (n.drop != null) { if (s.look === 'ring' || n.img) err.push(`step "${n.text}": a drop hangs under a plain step`); if (!n.drop.text || [...n.drop.text].length > 18 || (n.drop.sub && [...n.drop.sub].length > 14)) err.push(`step "${n.text}": drop text 1-18 characters, sub 14 at most`); if (n.drop.at != null) inSpan(n.drop.at, `step "${n.text}" drop`); figures('steps', `${n.drop.text} ${n.drop.sub || ''}`); }
    if ((s.nodes || []).filter((n) => n.drop).length > 1) err.push('steps: one drop in a row (one branch, one focus)');
    for (const n of s.nodes || []) { inSpan(n.at, `step "${n.text}"`); if (!n.text || [...n.text].length > (n.img ? 6 : 8)) err.push(`step "${n.text}": 1-${n.img ? 6 : 8} characters${n.img ? ' under a picture (longer ran the steps into each other and the subtitle band: the module bench)' : ''}`); if (n.img && typeof n.img !== 'string' && !isArt(n.img)) err.push(`step "${n.text}": img is a picture path or { art: { prompt } }`); figures('steps', `${n.text} ${n.sub || ''} ${n.note || ''}`); }
  }
  if (s?.module === 'chart') {
    if (!s.items?.length || s.items.length > 6) err.push('chart: 1-6 items');
    if (s.kind && !['figures', 'bars'].includes(s.kind)) err.push('chart: kind is figures or bars');
    if (s.flow != null && !['down', 'up'].includes(s.flow)) err.push('chart: flow is down or up');
    for (const x of s.items || []) { inSpan(x.at, `chart item "${x.label}"`); if (!x.label || x.value == null) err.push('chart: each item has a label and a value'); figures('chart', `${x.shown ?? x.value} ${x.note || ''} ${x.label} ${x.desc || ''}`); if (x.desc && [...x.desc].length > 24) err.push(`chart item "${x.label}": desc 24 characters at most`); }
  }
  if (s?.module === 'screen') {
    if (!s.src) err.push('screen: the captured page or screen (real material) is missing');
    if (!s.beats?.length) err.push('screen: no beats');
    for (const b of s.beats || []) { inSpan(b.at, `screen beat ${b.do}`); if (!['point', 'click', 'mark', 'bar', 'zoom', 'wide'].includes(b.do)) err.push(`unknown screen beat "${b.do}"`); if (b.do !== 'wide' && !b.phrase) err.push(`screen ${b.do}: the words on the screen it lands on`); }
    if (s.label && [...s.label].length > 16) err.push('screen: label 16 characters at most');
    if (!s.hide) err.push('screen: name the site as printed in hide ([] when none is on it)');
  }
  if (s?.module === 'article') {
    if (!s.src) err.push('article: page src missing');
    // pageCamera: the director's moves on the page as one canvas (the reference pulls out to the whole page and travels
    // down it to the line read; the module framed only the phrase: the gap ledger's first, 10 times)
    for (const m of s.pageCamera || []) { inSpan(m.at, 'page camera move'); if (!(m.end > m.at && m.end <= s.end + .01)) err.push('article pageCamera: end after at, inside the shot');
      for (const q of [m.from, m.to]) if (!q || !(q.page || q.phrase) || (q.zoom != null && !(q.zoom >= .5 && q.zoom <= 3))) err.push('article pageCamera: from / to are { page: true } or { phrase }, zoom 0.5-3 of that framing, x / y frame widths'); else if ([q.x, q.y].some((v) => v != null && !(Math.abs(v) <= 1))) err.push('article pageCamera: x / y are frame widths (-1 to 1)'); }
    if (s.column != null && !(Number.isInteger(s.column) && s.column >= 8 && s.column <= 40)) err.push('article column: characters a line, 8-40 (the page rewrapped narrower, as the reference reads it)');
    if ((s.pageCamera || []).length && (s.camera || []).length) err.push('article: pageCamera or camera, not both (the page camera travels the page; camera only moves the frame)');
    for (const b of s.beats || []) {
      inSpan(b.at, `beat ${b.do}`);
      if (!['title', 'focus', 'highlight', 'callout', 'hold'].includes(b.do)) err.push(`unknown article beat "${b.do}"`);
      if (b.do === 'callout' && b.text && [...b.text].length > 12) err.push(`callout "${b.text}": 12 characters at most (it is set across the frame)`);
      if (b.style && !['marker', 'yellow', 'bar'].includes(b.style)) err.push(`article beat style "${b.style}": marker, yellow or bar`);
      if (b.do !== 'hold' && !b.phrase) err.push(`${b.do} beat without the phrase it lands on`);
    }
    // ([] when the page prints none, as screen: the index's watermark check still holds a page that shows one, slotErrors)
    if (!Array.isArray(s.hide)) err.push('article: name the site as printed in hide ([] when none is on it; no site names on screen)');
  }
  return err;
}

// the phrases' boxes on the page (Vision OCR, ocrfind.swift), in page pixels; a phrase not found is an error, never a guess
export function locatePhrases(cfg, src, phrases, { fit = true } = {}) {
  const abs = sourcePath(cfg, src);
  const r = spawnSync('swift', [path.join(HERE, 'ocrfind.swift'), abs, ...phrases], { encoding: 'utf8', timeout: 180000 });
  const found = JSON.parse(r.stdout || '[]');
  const size = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', abs], { encoding: 'utf8' }).stdout.match(/\d+/g).slice(-2).map(Number);
  const out = {};
  for (const f of found) {
    if (!f.found) throw new Error(`article: "${f.phrase}" is not on the page`);
    const px = ([x, y, w, h]) => ({ x: x * size[0], y: y * size[1], w: w * size[0], h: h * size[1] }), [lx] = f.lineBox || f.box;
    // parts: one box per line when the phrase wraps (the bar follows the sentence onto the next line)
    out[f.phrase] = { ...px(f.box), lineX: lx * size[0], lineW: (f.lineBox || f.box)[2] * size[0], parts: (f.parts || [f.box]).map(px) };
  }
  // fitted to the ink of the page (tightBox): every module marks the glyphs, not OCR's estimate of them
  return { boxes: fit ? tightenBoxes(cfg, abs, out) : out, size };
}

// the page phrases a spec marks, checked on its page before anything renders: each is on the page as written (a part
// of it is not enough), and a bar or marker starts and ends on words ("国产大|模型" stopped inside 大模型: meta-S3).
// Phrases may wrap onto the next line: the bar follows them (ocrfind parts). Errors in words the director acts on.
const PHRASE_CACHE = new Map();
export function phraseErrors(cfg, spec) {
  const asks = [];   // [page, phrase, marks]
  if (spec.module === 'article') for (const b of spec.beats || []) if (b.phrase && !b.big) asks.push([spec.src, b.phrase, b.do === 'highlight' || b.do === 'title']);
  if (spec.module === 'article') for (const m of spec.pageCamera || []) for (const q of [m.from, m.to]) if (q?.phrase) asks.push([spec.src, q.phrase, false]);
  if (spec.module === 'screen') for (const b of spec.beats || []) if (b.phrase) asks.push([spec.src, b.phrase, false]);
  if (spec.module === 'sidecard' && spec.curl?.highlight) for (const ph of spec.curl.highlight) asks.push([spec.curl.src, ph, false]);
  // a designed frame's picture cut to its words: a phrase found only in part cut the crop to its first word (r1-S3 'The o')
  if (spec.module === 'frame') for (const l of spec.parts || []) if (l.kind === 'image' && l.phrase && typeof l.src === 'string') for (const ph of [].concat(l.phrase)) asks.push([l.src, ph, !!l.bar, !Array.isArray(l.phrase)]);
  const errors = [], byPage = {};
  for (const [src, ph, marks, oneLine] of asks) (byPage[src] ||= []).push([ph, marks, oneLine]);
  for (const [src, list] of Object.entries(byPage)) {
    let abs; try { abs = sourcePath(cfg, src); } catch { continue; }
    if (!fs.existsSync(abs)) continue;   // a missing page is the material check's error
    const phrases = [...new Set(list.map(([ph]) => ph))], key = `${abs}\n${phrases.join('\n')}`;
    if (!PHRASE_CACHE.has(key)) PHRASE_CACHE.set(key, JSON.parse(spawnSync('swift', [path.join(HERE, 'ocrfind.swift'), abs, ...phrases], { encoding: 'utf8', timeout: 180000 }).stdout || '[]'));
    const found = Object.fromEntries(PHRASE_CACHE.get(key).map((f) => [f.phrase, f]));
    for (const [ph, marks, oneLine] of list) { const f = found[ph];
      if (!f?.found) errors.push(`"${ph}" is not on the page (${path.basename(src)}); copy the words as the page prints them`);
      else if (f.partial) errors.push(`"${ph}" is on the page only in part (the page reads "${f.line}"); copy the words as printed (a phrase may run onto the next line)`);
      // (a frame's picture cut to one phrase that wraps takes both whole lines and sets its words small: meta-S4; a
      // [first, last] block is meant to)
      else if (oneLine && (f.parts || []).length > 1) errors.push(`"${ph}" runs onto the next line on the page: a frame cut to it takes both whole lines and its words come out small; cut each line as its own part, or a phrase on one line`);
      else if (marks && f.cut) errors.push(`the mark on "${ph}" stops inside a word (${f.cut}); mark whole words, to the end of the word or clause (a phrase may run onto the next line)`); }
  }
  return errors;
}

// OCR boxes of CJK text are estimates (Vision spreads a line's width over its characters): a bar drawn on them starts
// or ends inside a glyph or takes the comma after it (hupo-auto2 h800-S2 looked cropped and pasted on). Each part is
// fitted to the ink on the page: height to the glyphs' top and bottom, ends to the gaps between glyphs nearest the
// estimate, a trailing or leading punctuation mark left out. mask: { x0, y0, rows: ['0110…'] } around the part (page px).
export function tightBox(mask, r) {
  const rows = mask.rows, H = rows.length, W = rows[0]?.length || 0;
  if (!H || !W) return r;
  const ink = (i, j) => rows[i][j] === '1';
  const cx0 = Math.max(0, Math.round(r.x - mask.x0)), cx1 = Math.min(W, Math.round(r.x + r.w - mask.x0));
  const rowInk = rows.map((_, i) => { let n = 0; for (let j = cx0; j < cx1; j++) n += ink(i, j); return n; });
  // the band of rows the line's glyphs fill: the inked run through the box's middle (gaps of a stroke's width allowed)
  let c = Math.round(r.y + r.h / 2 - mask.y0); const gapMax = Math.max(2, Math.round(r.h * .08));
  if (!rowInk[c]) { let d = 1; while (d < r.h / 2 && !rowInk[c - d] && !rowInk[c + d]) d++; c = rowInk[c - d] ? c - d : c + d; }
  if (!rowInk[c]) return r;
  let top = c, bot = c;
  for (let i = c, gap = 0; i >= 0; i--) { if (rowInk[i]) { top = i; gap = 0; } else if (++gap > gapMax) break; }
  for (let i = c, gap = 0; i < H; i++) { if (rowInk[i]) { bot = i; gap = 0; } else if (++gap > gapMax) break; }
  const em = (bot - top + 1) * 1.08;
  // runs of inked columns within the band, grouped into glyphs (a CJK glyph is about an em wide; its strokes may part)
  const colInk = Array.from({ length: W }, (_, j) => { for (let i = top; i <= bot; i++) if (ink(i, j)) return true; return false; });
  const runs = []; for (let j = 0; j < W; j++) if (colInk[j]) { const a = j; while (j < W && colInk[j]) j++; runs.push([a, j]); }
  const glyphs = []; for (const run of runs) { const g = glyphs.at(-1);
    if (g && run[1] - g[0] <= em && run[0] - g[1] < em * .25) g[1] = run[1]; else glyphs.push([...run]); }
  if (!glyphs.length) return r;
  // a punctuation mark: narrow, its ink only in the band's bottom (，。、) or top (“‘) part
  const punct = ([a, b]) => { if (b - a > em * .5) return false; let lo = bot, hi = top;
    for (let j = a; j < b; j++) for (let i = top; i <= bot; i++) if (ink(i, j)) { lo = Math.min(lo, i); hi = Math.max(hi, i); }
    return lo > top + (bot - top) * .5 || hi < top + (bot - top) * .5; };
  const near = (edges, v) => edges.reduce((m, e) => (Math.abs(e - v) < Math.abs(m - v) ? e : m), edges[0]);
  const ex0 = r.x - mask.x0, ex1 = r.x + r.w - mask.x0;
  let gi0 = glyphs.findIndex((g) => g[0] === near(glyphs.map((q) => q[0]), ex0));
  let gi1 = glyphs.findIndex((g) => g[1] === near(glyphs.map((q) => q[1]), ex1));
  if (Math.abs(glyphs[gi0][0] - ex0) > em * .6 || Math.abs(glyphs[gi1][1] - ex1) > em * .6 || gi1 < gi0) return { ...r, y: mask.y0 + top, h: bot - top + 1 };
  while (gi1 > gi0 && punct(glyphs[gi1])) gi1--;
  while (gi0 < gi1 && punct(glyphs[gi0])) gi0++;
  // room: the clear space before and after (to the neighbouring glyphs), so the bar's ends never reach into them
  const room = [gi0 > 0 ? glyphs[gi0][0] - glyphs[gi0 - 1][1] : em, gi1 < glyphs.length - 1 ? glyphs[gi1 + 1][0] - glyphs[gi1][1] : em];
  // roomY: the clear rows above and below (to the lines over and under it, within the mask), so no edge crosses them
  let up = 0, down = 0; for (let i = top - 1; i >= 0 && !rowInk[i]; i--) up++; for (let i = bot + 1; i < H && !rowInk[i]; i++) down++;
  // the height of the line, not of these letters: Latin without ascenders or descenders ("sales of A800") would get a
  // lower bar than its neighbour on the next line (h800-S8); the OCR line box's middle 70 % is the line's type height
  const y0 = Math.min(mask.y0 + top, r.y + r.h * .15), y1 = Math.max(mask.y0 + bot + 1, r.y + r.h * .85);
  return { x: mask.x0 + glyphs[gi0][0], y: y0, w: glyphs[gi1][1] - glyphs[gi0][0], h: y1 - y0, room, roomY: [up - (mask.y0 + top - y0), down - (y1 - mask.y0 - bot - 1)] };
}

// Every mark a module draws on page words (marks.js registers them) measured after rendering, at the moment it is
// complete: the reference's bars hug the words (hupo-auto2 h800-S2 looked cropped and pasted on, S8 ran off the
// frame, meta-S3 stopped mid-word). m: { kind, label, part (the words' fitted box, page px, with room: the clear
// space to the neighbouring glyphs), rect (the mark, page px), shown (0-1 of its sweep), screen (its box on the frame,
// px, or null when it is not drawn), end (s) }. Errors name the phrase and what is wrong; the shot does not render.
export function markErrors(marks) {
  const err = [], f = (v) => Math.round(v);
  for (const m of marks) {
    const q = m.part, r = m.rect, at = `the ${m.kind} mark on "${m.label}"${m.end != null ? ` (at ${m.end.toFixed(2)} s)` : ''}`;
    if (!q.room && m.kind !== 'box') { err.push(`${at}: its box was not fitted to the page's glyphs (locatePhrases)`); continue; }
    if (m.kind === 'box') {
      if (r.x > q.x || r.y > q.y || r.x + r.w < q.x + q.w || r.y + r.h < q.y + q.h) err.push(`${at}: the box cuts the words`);
      if (r.h > q.h * 4 + (q.parts?.length || 1) * q.h * 1.6) err.push(`${at}: the box is far bigger than the words`);
    } else {
      const [ra, rb] = q.room;
      if (r.x > q.x + 1 || r.x + r.w < q.x + q.w - 1) err.push(`${at}: it leaves part of the first or last glyph out (${f(r.x)}–${f(r.x + r.w)} for glyphs ${f(q.x)}–${f(q.x + q.w)})`);
      if (r.x < q.x - ra + 1 || r.x + r.w > q.x + q.w + rb - 1) err.push(`${at}: it reaches into the neighbouring glyph or punctuation`);
      if (m.kind !== 'marker') {
        if (r.y > q.y + 1 || r.y + r.h < q.y + q.h - 1) err.push(`${at}: it is lower or higher than the words (cuts their top or bottom)`);
        if (r.h > q.h * 1.8) err.push(`${at}: it is ${(r.h / q.h).toFixed(1)}× the type height (a box over the page, not a bar on the words)`);
      }
    }
    // its edges run through the page's gaps, never through other words (the curl's red box cut the next row: h800-S3)
    if (m.edgeInk > .03) err.push(`${at}: its edge runs through other words on the page (${Math.round(m.edgeInk * 100)} % of the edge on ink)`);
    // the words it marks must read on screen (the page's type at least 28 px high when the mark is complete)
    if (m.screen && m.kind !== 'box' && m.screen.h * q.h / r.h < 28) err.push(`${at}: the words it marks are ${Math.round(m.screen.h * q.h / r.h)} px high on screen, too small to read (at least 28 px)`);
    if (m.shown < .99) err.push(`${at}: its sweep is not finished (${Math.round(m.shown * 100)} %)`);
    if (!m.screen) err.push(`${at}: it is not on screen`);
    else { const s = m.screen, vis = Math.max(0, Math.min(1920, s.x + s.w) - Math.max(0, s.x)) * Math.max(0, Math.min(1080, s.y + s.h) - Math.max(0, s.y)) / Math.max(1, s.w * s.h);
      if (vis < .95) err.push(`${at}: ${Math.round((1 - vis) * 100)} % of it is out of the frame when it is complete`); }
  }
  return err;
}

// the ink around each box on a page picture (dark against the page colour, or light on a dark page), for tightBox
export function inkMasks(cfg, file, boxes) {
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  const code = `import cv2,json,sys,numpy as np\nim=cv2.imread(sys.argv[1],0);out=[]\nfor b in json.loads(sys.argv[2]):\n  x0=max(0,int(b['x']-b['h']));y0=max(0,int(b['y']-b['h']*.9));x1=min(im.shape[1],int(b['x']+b['w']+b['h']));y1=min(im.shape[0],int(b['y']+b['h']*1.9))\n  c=im[y0:y1,x0:x1].astype(int);bg=np.median(c);m=np.abs(c-bg)>60\n  out.append({'x0':x0,'y0':y0,'rows':[''.join('1' if v else '0' for v in r) for r in m]})\nprint(json.dumps(out))`;
  const r = spawnSync(py, ['-c', code, file, JSON.stringify(boxes)], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ink masks: ${r.stderr.slice(-300)}`);
  return JSON.parse(r.stdout);
}

// how much of each rectangle's outline lies on ink (dark against the page colour near it), 0-1, for markErrors
export function edgeInk(cfg, file, rects) {
  if (!rects.length) return [];
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  const code = `import cv2,json,sys,numpy as np\nim=cv2.imread(sys.argv[1],0);H,W=im.shape;out=[]\nfor r in json.loads(sys.argv[2]):\n  x0,y0,x1,y1=[int(round(v)) for v in (r['x'],r['y'],r['x']+r['w'],r['y']+r['h'])];x0,x1=max(0,x0),min(W-1,x1);y0,y1=max(0,y0),min(H-1,y1)\n  if x1<=x0 or y1<=y0: out.append(0);continue\n  e=np.concatenate([im[y0,x0:x1],im[y1,x0:x1],im[y0:y1,x0],im[y0:y1,x1]]).astype(int);bg=np.median(im[max(0,y0-4):y1+4,max(0,x0-4):x1+4])\n  out.append(float((np.abs(e-bg)>60).mean()))\nprint(json.dumps(out))`;
  const r = spawnSync(py, ['-c', code, file, JSON.stringify(rects)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`edge ink: ${r.stderr.slice(-300)}`);
  return JSON.parse(r.stdout);
}

// every phrase's parts fitted to the ink of the page picture (tightBox); its box the union of its parts
export function tightenBoxes(cfg, file, boxes) {
  const list = Object.entries(boxes).flatMap(([k, b]) => b.parts.map((p, i) => ({ k, i, p })));
  if (!list.length) return boxes;
  const masks = inkMasks(cfg, file, list.map((e) => e.p)), out = {};
  for (const [k, b] of Object.entries(boxes)) out[k] = { ...b, parts: [...b.parts] };
  list.forEach((e, n) => { out[e.k].parts[e.i] = tightBox(masks[n], e.p); });
  for (const b of Object.values(out)) { const x0 = Math.min(...b.parts.map((p) => p.x)), y0 = Math.min(...b.parts.map((p) => p.y));
    Object.assign(b, { x: x0, y: y0, w: Math.max(...b.parts.map((p) => p.x + p.w)) - x0, h: Math.max(...b.parts.map((p) => p.y + p.h)) - y0 }); }
  return out;
}

// the module art kit (modules/kit, generated once by image generation, text-free; see modules/kit/README.md):
// card plate, torn paper, marker stroke. A missing piece is an error, never a flat box drawn in its place.
export const KIT = { card: 'card-red.png', torn: 'torn-1.png', marker: 'marker.png' };
export function moduleKit(cfg) {
  const dir = path.join(cfg.dataDir, 'modules', 'kit'), out = {};
  // (grey TV static for a shot that tears through, made here: a texture, not material; insert glitch 'through')
  if (!fs.existsSync(path.join(dir, 'static.png'))) spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=gray:s=240x135,noise=alls=100:allf=u', '-frames:v', '1', path.join(dir, 'static.png')]);
  for (const [k, f] of Object.entries(KIT)) {
    const file = path.join(dir, f);
    if (!fs.existsSync(file)) throw new Error(`module kit piece missing: modules/kit/${f}`);
    out[k] = pathToFileURL(file).href;
  }
  // display lettering made for shots (kit/<name>.png, checked: OCR where it reads, by eye where chrome defeats it)
  out.files = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => [f.slice(0, -4), pathToFileURL(path.join(dir, f)).href]));
  return out;
}

// the narration's lines over the span (the project's word-timing transcript), for subtitles drawn in the module
export function subtitles(cfg, id, at, end) {
  const p = loadProject(cfg, id), f = sourcePath(cfg, p.transcript || 'work/bv1a63d6ceba-packaging-study-20260923/coverage-audit-v2/source-transcript-word-timing-v1.json');
  if (!f || !fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8')).segments.map((x) => ({ at: x.startMs / 1000, end: x.endMs / 1000, text: x.text })).filter((x) => x.end > at && x.at < end);
}

// the article's own text on a captured page: the headline and the paragraphs, without the site's furniture (navigation,
// share buttons, dates, source line, sidebar, ads). Lines are kept when they are long (a quarter of the longest) or are
// the headline, sit in the main column and are not page furniture; the reference shows only the text, read big.
const FURNITURE = /Recommended Video|Add Fortune|Follow|Sign up|Subscribe|Getty Images|VIA GETTY|免责声明|版权所有|未经授权|分享|最后更新|字号|来源|阅读\s*\d|评论|首页|登录|下载|反馈|底色|关键字|热门|推荐|广告|加入|观察员|^\s*[\d\-:\s]+$/;
// the lines that are not the article: a date and time, 原创, a byline alone; a byline opening a paragraph ("经济观察网
// 记者 沈怡然 10月17日，…": the site, 记者 / 作者 / 通讯员 and a name) is cut from its line (user 2026-10-21: no 记者 on
// screen; the reference showed it scrolling past, the user does not want it)
export const META_LINE = /^\s*(原创|首发|独家)?\s*[·|]?\s*\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}|^\s*(原创|首发)\s*$|^\s*(记者|作者|编辑|责编|责任编辑|通讯员|撰稿|来源)\s*[:：]?\s*\S{0,12}\s*$/;
// ... and an English page's date line and byline ("January 28, 2025 • 1 min read", "By Nauman Khan": open-S16 showed it)
export const META_LINE_EN = /^\s*(?:(?:Updated|Published)\s*:?\s*)?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?[a-z]*,?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d+\s*min(?:ute)?s?\s+read\b|^\s*By\s+[A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,3}\s*$/i;
export const BYLINE = /^(.{0,16}?(?:记者|作者|通讯员|撰稿人?|实习生)\s*[\u4e00-\u9fa5·]{2,4})(?=[\s\d，,:：。|]|$)/;
// a short line that carries a date and time stamp is a byline or date line wherever the date sits (凤凰卫视美洲台官方账号
// 2025.01.28 09:05 stayed under the headline: open-S10)
const STAMP = /\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\S*\s+\d{1,2}:\d{2}/;
export function articleLines(lines) {
  const out = [];
  for (const l of lines) {
    if (META_LINE.test(l.text) || (META_LINE_EN.test(l.text) && [...l.text].length < 60) || (STAMP.test(l.text) && [...l.text].length < 40)) continue;
    const m = l.text.match(BYLINE);
    if (m) { const rest = l.text.slice(m[1].length).trim(); if ([...rest].length < 4) continue; out.push({ ...l, cut: [...m[1]].length / [...l.text].length, text: rest }); }
    else out.push(l);
  }
  return out;
}
// the clean page: the lines copied in reading order onto the paper colour, closed up (a gap of more than two line
// heights, where a picture or furniture was, becomes one line height of paragraph space), a cut byline's line moved
// left to its paragraph edge; a dark page turned to black type on white (hupo-auto2 h800-S8 came light on black)
export function articlePage(cfg, src, out, text, column = 0) {
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  const code = `import cv2,json,sys,numpy as np
im=cv2.imread(sys.argv[1]);H,W=im.shape[:2];bg=im[H//2,2].copy()
out=np.empty_like(im);out[:]=bg
L=json.loads(sys.argv[3])
# the article's lines on the paper colour (nothing else of the page)
for l in L:
  p=l['h']*.25;x0,y0=max(0,int(l['x']-p)),max(0,int(l['y']-p));x1,y1=min(W,int(l['x']+l['w']+p)),min(H,int(l['y']+l['h']+p))
  if not l.get('cut'): out[y0:y1,x0:x1]=im[y0:y1,x0:x1]
# a byline cut from its line: the rest of the line moved to the line's left edge (a thin band: nothing of the lines
# above or below comes along); the byline's end is the word gap nearest the estimate, the rest starts at the next ink
for l in L:
  if not l.get('cut'): continue
  h=l['h'];x,y,w=l['x'],l['y'],l['w'];p=h*.12;x0,y0=max(0,int(x-2)),max(0,int(y-p));x1,y1=min(W,int(x+w+h*.3)),min(H,int(y+h+p))
  band=im[y0:y1,x0:x1];g=cv2.cvtColor(band,cv2.COLOR_BGR2GRAY).astype(int);ink=(np.abs(g-np.median(g))>60).any(axis=0);q=max(2,int(h*.25))
  c=int(x+w*l['cut'])-x0;best=None
  for d in range(0,int(h*1.5)):
    for cc in (c+d,c-d):
      if 0<=cc<len(ink)-q and not ink[cc:cc+q].any(): best=cc;break
    if best is not None: break
  k=c if best is None else best
  while k<len(ink) and not ink[k]: k+=1
  rest=band[:,k:];out[y0:y1,x0:x1]=bg;out[y0:y1,x0+2:x0+2+rest.shape[1]]=rest
# close up: a blank stretch taller than two line heights (where a picture, a date line or furniture was) becomes one
# line height, found on the ink across each row, so rows are never cut or laid over each other
g=cv2.cvtColor(out,cv2.COLOR_BGR2GRAY).astype(int);rows=(np.abs(g-g[H//2,2])>60).sum(axis=1)>2
lh=int(np.median([l['h'] for l in L])) if L else 30
# (after the headline, the first text, up to five line heights stay: the headline is set big over the page and stands
# alone in the frame before the camera moves down, as the reference's does)
keep=[];i=0;seen=False;headgap=False
while i<H:
  if rows[i]: keep.append(i);seen=True;i+=1;continue
  j=i
  while j<H and not rows[j]: j+=1
  run=j-i
  if not seen or j>=H: keep.extend(range(i,j))
  elif not headgap: headgap=True;keep.extend(range(i,i+min(run,5*lh)))
  else: keep.extend(range(i,i+(run if run<=2*lh else lh)))
  i=j
out=out[keep]
if out.shape[0]<H: pad=np.empty((H-out.shape[0],W,3),np.uint8);pad[:]=bg;out=np.vstack([out,pad])
# a narrower column (argv[4]: its width in page px, 0 none): the body's lines rejoined per paragraph and wrapped again
# at a blank between glyphs, the page's own line images, its own pitch (meta-S4: lines of 28 characters wider than the
# frame at the reading zoom, cut at both ends; the reference reads a column of 18); rows taller than the body's (the
# headline, a subhead) stay whole where they were
CW=int(float(sys.argv[4]))
if CW>0:
  g=cv2.cvtColor(out,cv2.COLOR_BGR2GRAY).astype(int);ink=np.abs(g-g[g.shape[0]//2,2])>60;rows=ink.sum(axis=1)>2
  runs=[];i=0;n=len(rows)
  while i<n:
    if not rows[i]: i+=1;continue
    j=i
    while j<n and rows[j]: j+=1
    runs.append([i,j]);i=j
  # (a row's accents and a split glyph's parts: runs closer than a third of a line join)
  m=[]
  for r in runs:
    if m and r[0]-m[-1][1]<lh*.35: m[-1][1]=r[1]
    else: m.append(r)
  runs=[r for r in m if r[1]-r[0]>=lh*.4]
  hs=[r[1]-r[0] for r in runs];bh=int(np.median(hs)) if hs else lh
  body=[r for r in runs if r[1]-r[0]<=bh*1.35]
  if len(body)>=3:
    ext=[(np.where(ink[r[0]:r[1]].any(axis=0))[0]) for r in body];xa=[int(e[0]) for e in ext];xb=[int(e[-1]) for e in ext]
    L0=int(np.median(xa));R0=int(np.percentile(xb,80));pitch=int(np.median([b[0]-a[0] for a,b in zip(body,body[1:]) if b[0]-a[0]<bh*2.6] or [bh*1.8]))
    band=int(bh*1.3);adv=bh*1.0
    def strip(r,x1):
      c=(r[0]+r[1])//2;y0=max(0,c-band//2);s=out[y0:y0+band,L0:x1+1]
      if s.shape[0]<band: p=np.empty((band-s.shape[0],s.shape[1],3),np.uint8);p[:]=bg;s=np.vstack([s,p])
      return s
    band=min(band,pitch)
    blocks=[];para=[];prev=None
    def flush():
      global para
      if para: blocks.append(('p',para))
      para=[]
    for r in runs:
      if r[1]-r[0]<=bh*1.35:
        e=np.where(ink[r[0]:r[1]].any(axis=0))[0];a,b=int(e[0]),int(e[-1])
        if prev is None or r[0]-prev>pitch*1.35 or a>L0+adv*.8: flush()
        gap=np.empty((band,max(1,int(adv*.08)),3),np.uint8);gap[:]=bg
        para.append(strip(r,b));para.append(gap);prev=r[0]
        if b<R0-adv*1.5: flush();prev=None
      else:
        flush();blocks.append(('b',out[max(0,r[0]-int(lh*.3)):r[1]+int(lh*.3)]));prev=None
    flush()
    lines=[]
    for k,bl in blocks:
      if k=='b': lines.append(('b',bl));continue
      s=np.hstack(bl);si=(np.abs(cv2.cvtColor(s,cv2.COLOR_BGR2GRAY).astype(int)-int(np.mean(bg)))>60).any(axis=0);pos=0;ln=[]
      # cuts only between whole glyphs: ink runs grouped while the group is no wider than a CJK glyph (小 has blanks
      # inside: it was cut in two); a cut beside a CJK glyph (a unit .8 of the line's height wide; a Latin letter is half
      # that) or at a word space, never inside a word, never a line opened by punctuation (the first try broke only at
      # the wide gaps after commas: lines of 13 and 18)
      ir=[];k=0
      while k<len(si):
        if not si[k]: k+=1;continue
        e=k
        while e<len(si) and si[e]: e+=1
        if ir and e-ir[-1][0]<=adv*.95 and k-ir[-1][1]<adv*.3: ir[-1][1]=e
        else: ir.append([k,e])
        k=e
      bd=[((a[1]+b[0])//2,b[0]-a[1],a[1]-a[0],b[1]-b[0]) for a,b in zip(ir,ir[1:])]
      while s.shape[1]-pos>CW:
        win=[x for x in bd if pos+CW*.7<x[0]<=pos+CW and x[3]>=adv*.35]
        good=[x[0] for x in win if x[1]>=adv*.2 or max(x[2],x[3])>=adv*.8]
        cut=(good or [x[0] for x in win] or [pos+CW])[-1];ln.append(s[:,pos:cut]);pos=cut
        while pos<len(si) and not si[pos]: pos+=1
      ln.append(s[:,pos:]);lines.append(('p',ln))
    top=runs[0][0]-int(lh*.3) if runs else 0
    canvas=[out[:max(0,top)]]
    for k,x in lines:
      if k=='b': canvas.append(x);continue
      for s in x:
        row=np.empty((pitch,W,3),np.uint8);row[:]=bg;off=(pitch-band)//2;w=min(s.shape[1],W-L0);row[off:off+band,L0:L0+w]=s[:,:w];canvas.append(row)
      sp=np.empty((int(pitch*.5),W,3),np.uint8);sp[:]=bg;canvas.append(sp)
    out=np.vstack(canvas)
if out[out.shape[0]//2,2].mean()<100: out=255-out
cv2.imwrite(sys.argv[2],out)`;
  const r = spawnSync(py, ['-c', code, src, out, JSON.stringify(articleLines(text)), String(column || 0)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`article page: ${r.stderr.slice(-300)}`);
  return out;
}
// (pure, tested) the column the page is rewrapped to, in page px (0: as printed): spec.column (characters a line) or,
// when the page is read down at one zoom (pageCamera abs) and its lines are wider than the frame there, as many characters as fit the frame with a margin (meta-S4: 28-character lines cut at
// both ends of the frame)
export function articleColumn(spec, lines) {
  const body = (lines || []).filter((l) => l.w > 0 && l.h > 0 && [...String(l.text || '')].length >= 8);
  if (!body.length) return 0;
  const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const adv = med(body.map((l) => l.w / [...l.text].length)), maxW = Math.max(...body.map((l) => l.w));
  if (spec.column) return Math.round(spec.column * adv);
  const abs = (spec.pageCamera || []).flatMap((m) => [m.from?.abs, m.to?.abs]).filter((v) => v != null);
  if (!abs.length) return 0;   // (a page framed phrase by phrase is read as printed: the frame follows the phrase)
  const room = (1920 - 2 * 120) / Math.max(...abs);
  return maxW > room ? Math.floor(room / adv) * adv : 0;
}
// the largest face of a picture as shares of it, and its size: the modules keep their words off it (M.faceOn)
async function faceInfo(file) {
  const { facesOf } = await import('./design-check.mjs'), f = facesOf(file).sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
  const size = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' }).stdout.match(/\d+/g)?.slice(-2).map(Number);
  return { ...(f ? { faceN: f } : {}), ...(size?.length === 2 ? { photoSize: size } : {}) };
}
export function articleText(cfg, src, size, phrases = [], hide = []) {
  const r = spawnSync('swift', [path.join(HERE, 'ocr.swift'), sourcePath(cfg, src)], { encoding: 'utf8', timeout: 180000 });
  const lines = JSON.parse(r.stdout || '[]').map((l) => ({ ...l, x: l.box[0] * size[0], y: l.box[1] * size[1], w: l.box[2] * size[0], h: l.box[3] * size[1] }));
  const maxW = Math.max(...lines.map((l) => l.w));
  const keep = lines.filter((l) => !FURNITURE.test(l.text) && (l.w > maxW * .25 || phrases.some((p) => l.text.includes(p.slice(0, 6)))));
  // the main column: left edges within a short reach of the most common one
  // (counted on the wide lines only: a sidebar of short lines has more lines than the article and was taken for it: open-S2)
  const lefts = keep.filter((l) => l.w > maxW * .6).map((l) => Math.round(l.x / 20) * 20), mode = lefts.sort((a, b) => lefts.filter((v) => v === b).length - lefts.filter((v) => v === a).length)[0];
  const site = hide.length ? new RegExp(hide.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')) : null;
  // a line that is the site's name (masthead, byline label) goes; a paragraph that names the site keeps its text (the
  // name itself is covered, spec.hide): dropping it took the start of a phrase wrapping off that line (h800-S2)
  const siteLine = (t) => site && site.test(t) && t.replace(site, '').replace(/\s/g, '').length < 12;
  return keep.filter((l) => (Math.abs(l.x - mode) < size[0] * .05 || phrases.some((p) => l.text.includes(p.slice(0, 6)))) && !siteLine(l.text))
    .map(({ x, y, w, h, text }) => ({ x, y, w, h, text }));
}

// every line on the page that contains one of the words (to cover a site name wherever it is printed)
function findAll(cfg, src, words, size) {
  const r = spawnSync('swift', [path.join(HERE, 'ocr.swift'), sourcePath(cfg, src)], { encoding: 'utf8', timeout: 180000 });
  const lines = JSON.parse(r.stdout || '[]'), out = {};
  for (const w of words) out[w] = lines.filter((l) => l.text.includes(w)).map((l) => {
    // the word's share of the line, by character position (a site name is short; covering a little extra is fine)
    const i = l.text.indexOf(w), n = [...l.text].length, [x, y, bw, h] = l.box;
    return { x: (x + bw * i / n) * size[0] - 4, y: y * size[1], w: bw * [...w].length / n * size[0] + 8, h: h * size[1] };
  });
  return out;
}

// where the sounds go (shot seconds), from the spec: the moments things land, as the reference sounds them
export function soundEvents(spec) {
  const ev = [], at = (t) => t - spec.at;
  if (spec.module === 'sidecard') {
    for (const c of spec.cards || []) { ev.push({ t: at(c.at), kind: 'whoosh' }, { t: at(c.at + .35), kind: 'pop' });
      for (const w of c.swap || []) ev.push({ t: at(w.at - .1), kind: 'whoosh', gain: .8 }, { t: at(w.at + .35), kind: 'pop' }); }
    for (const g of spec.tags || []) ev.push({ t: at(g.at), kind: 'pop' });
    if (spec.curl) ev.push({ t: at(spec.curl.at), kind: 'swish' }, { t: at(spec.curl.at + .1), kind: 'whoosh', gain: .7 });
  }
  if (spec.module === 'chat') {
    ev.push({ t: at(spec.at), kind: 'whoosh' });
    for (let i = 0; i < [...(spec.title || '')].length; i++) ev.push({ t: at(spec.at + .15 + i * .067), kind: 'tick' });
    for (const m of spec.messages || []) ev.push({ t: at(m.at), kind: 'pop' });
    if (spec.members) ev.push({ t: at(spec.members.at), kind: 'pop' });
    if (spec.push) ev.push({ t: at(spec.push.at), kind: 'whoosh', gain: .6 });
  }
  if (spec.module === 'compare') {
    ev.push({ t: at(spec.at + .6), kind: 'whoosh' });
    for (const k of ['left', 'right']) { ev.push({ t: at(spec[k].at), kind: 'pop' }); (spec[k].rows || []).forEach((_, i) => ev.push({ t: at(spec[k].at + .4 + i * .3), kind: 'tick' })); }
  }
  if (spec.module === 'table') {
    (spec.rows || []).forEach((r, i) => ev.push({ t: at(spec.rowsAt?.[i] ?? spec.at + .5 + i * .6), kind: 'swish', gain: .7 }));
    if (spec.sweep) ev.push({ t: at(spec.sweep.at), kind: 'whoosh', gain: .5 });
  }
  if (spec.module === 'brand') ev.push({ t: at(spec.at), kind: 'whoosh', gain: .7 }, { t: at(spec.at + .3), kind: 'pop', gain: .6 });
  if (spec.module === 'insert') ev.push({ t: at(spec.at), kind: 'swish', gain: .7 });
  if (spec.module === 'title') { ev.push({ t: at(spec.at), kind: 'whoosh', gain: .8 }); const n = [...(spec.text || '')].length; for (let i = 0; i < n; i++) ev.push({ t: at((spec.textAt ?? spec.at + .15) + i * .05), kind: 'tick', gain: .5 }); }
  if (spec.module === 'person') { ev.push({ t: at(spec.at), kind: 'swish', gain: .7 }, { t: at(spec.nameAt ?? spec.at + .25), kind: 'pop' }); for (const l of spec.say || []) ev.push({ t: at(l.at), kind: 'swish', gain: .6 }); }
  if (spec.module === 'quote') for (const l of spec.lines || []) ev.push({ t: at(l.at), kind: 'swish', gain: .6 });
  if (spec.module === 'steps') for (const n of spec.nodes || []) ev.push({ t: at(n.at), kind: 'pop' });
  if (spec.module === 'screen') { ev.push({ t: at(spec.at), kind: 'whoosh', gain: .6 }); for (const b of spec.beats || []) ev.push({ t: at(b.at), kind: b.do === 'click' ? 'pop' : b.do === 'bar' ? 'swish' : 'tick', gain: .6 }); }
  if (spec.module === 'chart') for (const x of spec.items || []) ev.push({ t: at(x.at), kind: 'whoosh', gain: .5 }, { t: at(x.at + .3), kind: 'tick' });
  if (spec.module === 'article') {
    for (const b of spec.beats || []) {
      if (b.do === 'title') { const n = [...(b.text || b.phrase)].length; for (let i = 0; i < n; i++) ev.push({ t: at(b.at + i * .067), kind: 'tick' }); if (b.big && b.end) ev.push({ t: at(b.end - .22), kind: 'glitch' }); }
      if (b.do === 'highlight') ev.push({ t: at(b.at + .1), kind: 'swish' });
      if (b.do === 'callout') { const n = [...(b.text || b.phrase)].length; for (let i = 0; i < n; i++) ev.push({ t: at(b.at + .15 + i * .06), kind: 'tick' }); }
    }
  }
  return ev.filter((e) => e.t >= 0);
}

// render a module spec to <out>.mp4 (and <out>-voice.mp4 with the recording's voice under it)
// check: false skips the reference measure (the animatic: 12 fps, one sub-frame, for timing only)
// scale: the pixel density of a moving render (the animatic, the white model of a passage, at .5: a quarter of the
// pixels to take and encode; the layout is the same, the frame is 960 wide)
export async function renderModule(cfg, id, spec, out, { fps = 60, sub = 3, stills = null, check: measure = true, checks = true, scale = 1, reference = true } = {}) {
  if (!stills) assertScopeAllows(loadProject(cfg, id), 'module');
  // the frames cut out of a clip for an insert are removed when the shot is done (3500 of them were left behind, 11 GB,
  // and a render failed with the disk full)
  let footDir = null; const dropFoot = () => { if (footDir) fs.rmSync(footDir, { recursive: true, force: true }); };
  // checks: false only to look at a failing shot's frames while fixing it (the line always measures)
  const errors = checkModuleSpec(spec);
  // the pictures must fit their slots (matindex.mjs): checked when the project has its material index
  const { readIndex, materialErrors } = await import('./matindex.mjs'); const idx = readIndex(cfg, id); if (Object.keys(idx.files).length) errors.push(...materialErrors(spec, idx));
  if (errors.length) throw new Error(errors.join('; '));
  // house rules (house.mjs): no subtitles from the system (the user adds them in the edit); the house fonts only
  const H = await import('./house.mjs'), hf = H.houseFonts();
  if (!hf.ready) throw new Error(`house fonts not installed (routing/house-rules.json): ${hf.missing.join(', ')}`);
  // the words set on screen in Traditional (house rule 2026-10-21; page phrases, site names and paths kept)
  // the film's style: its fonts and texture unless the shot sets its own
  const ST = styleOf(spec.theme);
  if (ST) spec = { ...spec, type: spec.type || ST.fonts, texture: spec.texture || ST.texture };
  spec = H.hantDeep(spec);
  // the paper props under words (labels.mjs: generated once, then cached)
  const LB = await import('./labels.mjs'), labels = LB.tintPlates(LB.labelPlates(cfg, { generate: true }), LB.colorsIn(spec, ST?.tokens, fs.readFileSync(pagePath(cfg, spec.module), 'utf8')));   // (and the colours the module's own page names)
  const page = { ...spec, labels, subs: !H.subtitlesOn() || spec.subtitles === false ? [] : subtitles(cfg, id, spec.at, spec.end), kit: moduleKit(cfg), houseCss: letterFaces(latinMatched(H.houseFontCss(spec.type || null)), H), letter: process.env.RB_LETTERING ? { small: SMALL_FACE, max: SMALL_MAX, ...(evaOn() ? { ...EVA_FACES, lacks: evaLacks(spec, H).join('') } : {}) } : null, theme: ST ? { ...ST.tokens, style: ST.id, family: ST.theme } : { ...(THEMES[spec.theme] || THEMES.h800), ...(typeof spec.theme === 'object' ? spec.theme : {}) } };
  if (spec.module === 'article') {
    const phrases = [...new Set([...(spec.beats || []).map((b) => b.phrase), ...(spec.pageCamera || []).flatMap((m) => [m.from?.phrase, m.to?.phrase])].filter(Boolean))];
    const size = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', sourcePath(cfg, spec.src)], { encoding: 'utf8' }).stdout.match(/\d+/g).slice(-2).map(Number);
    const pageBg = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', sourcePath(cfg, spec.src), '-vf', 'crop=8:8:0:ih/2,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 }).stdout;
    // the article's own text only, reflowed on its paper colour (articlePage): no site furniture, no byline, no date
    // line, and no hole where a picture was (the camera crossed a blank strip and jumped: hupo-auto2 h800-S2)
    const text = articleText(cfg, spec.src, size, phrases, spec.hide || []);
    const clean = path.join(os.tmpdir(), `rb-article-${path.basename(out)}.png`);
    articlePage(cfg, sourcePath(cfg, spec.src), clean, text, articleColumn(spec, text));
    // the phrases and the site names are found on the page as it is shown
    const { boxes, size: shownSize } = locatePhrases(cfg, clean, phrases);
    const hidden = spec.hide?.length ? Object.values(findAll(cfg, clean, spec.hide, shownSize)).flat() : [];
    const bg = pageBg?.length === 3 ? [...pageBg] : [255, 255, 255], dark = (bg[0] + bg[1] + bg[2]) / 3 < 100, shown = dark ? bg.map((v) => 255 - v) : bg;
    Object.assign(page, { paperTex: pathToFileURL(path.join(cfg.dataDir, 'style-lab', 'taste-v2', 'tex', 'paper.png')).href, boxes, size: shownSize, hidden, pageBg: `rgb(${shown[0]},${shown[1]},${shown[2]})`, src: pathToFileURL(clean).href });
  }
  if (spec.module === 'compare') Object.assign(page, { photo: fileUrl(cfg, spec.photo), lines: fileUrl(cfg, spec.lines || spec.photo) });
  // a mark on transparency stands on the dark stage, a photograph fills the frame (what the picture is, from the index)
  if (spec.module === 'brand' || spec.module === 'insert') {
    const kind = idx.files[spec.src]?.kind || (/\.(mp4|mov|webm)$/i.test(spec.src) ? 'footage' : 'photo');
    Object.assign(page, { src: fileUrl(cfg, spec.src), srcKind: kind });
    // crop: [x, y, w, h] as shares of a large photograph, the part the shot shows (the pediment of the exchange, the sign
    // at NVIDIA's door: meta-S1, who-S6), at least 1280 px wide
    if (Array.isArray(spec.crop) && ['photo', 'portrait', 'page'].includes(kind)) {
      const cut = path.join(os.tmpdir(), `rb-crop-${path.basename(out)}.jpg`), py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
      spawnSync(py, ['-c', 'import cv2,sys\nim=cv2.imread(sys.argv[1]);H,W=im.shape[:2];x,y,w,h=[float(v) for v in sys.argv[3:7]]\ncv2.imwrite(sys.argv[2],im[int(y*H):int((y+h)*H),int(x*W):int((x+w)*W)],[cv2.IMWRITE_JPEG_QUALITY,95])', sourcePath(cfg, spec.src), cut, ...spec.crop.map(String)]);
      if (fs.existsSync(cut)) page.src = pathToFileURL(cut).href;
    }
    // a page or photo that prints a site name: the names in spec.hide painted over with the paper around them (an R1
    // paper's research@deepseek.com could not be shown full screen: r1-S5)
    if (spec.hide?.length && ['page', 'photo'].includes(kind)) {
      const size = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', sourcePath(cfg, spec.src)], { encoding: 'utf8' }).stdout.match(/\d+/g).slice(-2).map(Number);
      const boxes = Object.values(findAll(cfg, spec.src, spec.hide, size)).flat(), clean = path.join(os.tmpdir(), `rb-covered-${path.basename(out)}.png`);
      const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
      spawnSync(py, ['-c', 'import cv2,sys,json,numpy as np\nim=cv2.imread(sys.argv[1]);H,W=im.shape[:2]\nfor b in json.loads(sys.argv[3]):\n  x0,y0=max(0,int(b["x"])-4),max(0,int(b["y"])-4);x1,y1=min(W,int(b["x"]+b["w"])+4),min(H,int(b["y"]+b["h"])+4)\n  ring=np.concatenate([im[max(0,y0-6):y0,x0:x1].reshape(-1,3),im[y1:y1+6,x0:x1].reshape(-1,3)]) if y1>y0 else im[y0:y1,x0:x1].reshape(-1,3)\n  im[y0:y1,x0:x1]=np.median(ring,axis=0) if len(ring) else 255\ncv2.imwrite(sys.argv[2],im)', sourcePath(cfg, spec.src), clean, JSON.stringify(boxes)]);
      if (fs.existsSync(clean)) page.src = pathToFileURL(clean).href;
    }
    if (spec.then?.src) page.then = { ...spec.then, src: fileUrl(cfg, spec.then.src) };
    // a picture taller than the frame is cut to where its face is (macOS Vision), the face a little above the middle
    // (centred, Altman's portrait kept his mouth and lost his eyes: open-S10)
    if (['photo', 'portrait'].includes(kind) && (idx.files[spec.src]?.h || 0) > (idx.files[spec.src]?.w || 0) * 9 / 16 * 1.05) {
      const { facesOf } = await import('./design-check.mjs'), e = idx.files[spec.src], f = facesOf(sourcePath(cfg, spec.src)).sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
      if (f) { const v = (e.w * 9 / 16) / e.h, cy = f[1] + f[3] / 2; page.focusY = +(100 * Math.min(1, Math.max(0, (cy - .42 * v) / (1 - v)))).toFixed(1); }
    }
    // a mark on transparency: how dark it is (its opaque pixels' luminance), so a dark mark gets a light stage (Meta's
    // navy wordmark vanished on the dark stage: meta-S2, framecheck)
    if (kind === 'logo' || kind === 'cutout') {
      const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
      const r = spawnSync(py, ['-c', "import cv2,sys,numpy as np\nim=cv2.imread(sys.argv[1],cv2.IMREAD_UNCHANGED)\nif im.ndim==2: im=cv2.cvtColor(im,cv2.COLOR_GRAY2BGRA)\nif im.shape[2]==3: print(-1); sys.exit()\na=im[:,:,3]>128;g=cv2.cvtColor(im[:,:,:3],cv2.COLOR_BGR2GRAY)[a]\nprint(float(np.percentile(g,25)) if g.size else -1)", sourcePath(cfg, spec.src)], { encoding: 'utf8' });
      const lum = parseFloat(r.stdout); page.markTone = lum >= 0 && lum < 90 ? 'dark' : 'light';
    }
    // footage: one frame per output frame from spec.in (seconds into the clip), shown in turn by the page
    if (kind === 'footage') {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-footage-')); footDir = dir;
      const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-ss', String(spec.in || 0), '-t', String(spec.end - spec.at + .1), '-i', sourcePath(cfg, spec.src), '-vf', `fps=${fps},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080`, '-q:v', '3', path.join(dir, '%05d.jpg')]);
      if (r.status !== 0) throw new Error(`insert: the clip could not be read (${spec.src})`);
      Object.assign(page, { frames: fs.readdirSync(dir).sort().map((f) => pathToFileURL(path.join(dir, f)).href), fps });
    }
  }
  // art slots: a free real photograph first, image generation when none fits (text-free; cached by its request)
  // (a painted plate takes the film's style: the same request in another style is another plate; editorial-grey, the
// reference's own look, adds nothing, so the plates made before styles keep their cache)
  const styled = (x) => (ST && ST.id !== 'editorial-grey' && ST.art && !x.real ? { ...x, prompt: `${x.prompt} Style: ${ST.art}` } : x);
  // a ground drawn from real prices (bg: { market: { mode, symbol, day, from } }): the market module's last frame, as
  // a picture under the words (blind review cards-S7: 搞量化 over a blurred article read as an article; the reference
  // lays it over a price chart); cached by its spec
  const marketStill = async (m) => { const key = crypto.createHash('sha256').update(JSON.stringify([m, spec.theme ?? null, pageCode(cfg, 'market')])).digest('hex').slice(0, 16), dir = path.join(projectPaths(cfg, id).out, 'market-grounds'), f = path.join(dir, `${key}.png`);
    if (!fs.existsSync(f)) { fs.mkdirSync(dir, { recursive: true }); const r = await renderModule(cfg, id, { module: 'market', theme: spec.theme, mode: 'candles', ...m, at: 0, end: 3, camera: [] }, path.join(dir, key), { stills: [2.9], checks: false, check: false }); fs.renameSync(r.stills[0], f); }
    return pathToFileURL(f).href; };
  // a ground drawn by a module of the line (bg: { module: { module: 'table', columns, rows… } }): its last frame, cached by its spec
  const moduleStill = async (m) => { const key = crypto.createHash('sha256').update(JSON.stringify(['ground', m, spec.theme ?? null, pageCode(cfg, m.module)])).digest('hex').slice(0, 16), dir = path.join(projectPaths(cfg, id).out, 'module-grounds'), f = path.join(dir, `${key}.png`);
    if (!fs.existsSync(f)) { fs.mkdirSync(dir, { recursive: true }); const at = m.at ?? 0, end = m.end ?? 3, r = await renderModule(cfg, id, { theme: spec.theme, lens: false, ...m, at, end, camera: [] }, path.join(dir, key), { stills: [end - .1], checks: false, check: false }); fs.renameSync(r.stills[0], f); }   // (its own times kept: a steps spec's nodes come at theirs)
    return pathToFileURL(f).href; };
  // a frame's ground drawn by a module plays that module's own motion (user, 2026-10-23: 动效复刻): its frames at 8 a
  // second over the frame's span, crossfaded by frame.html (talent S2: a table set as a still lost its rows coming in and
  // its column swept, and measured as nothing moving but the camera). Cached by its spec and length.
  // what the frame shows of its ground: its camera and the ground's own slow push (frame.html: 1 + push, 0.05 when unset)
  // together — the camera alone left r1-S9's chain laid to the edge of a ground pushed 1.05 more
  const groundView = (sp) => { const g = 1 + (sp.ground?.groundMove ? 0 : sp.ground?.pull ? 0 : sp.ground?.push ?? .05), c = sp.camera?.length ? sp.camera : [{ at: sp.at, end: sp.end, from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1, x: 0, y: 0 } }];
    return c.map((k) => ({ ...k, from: { ...k.from, zoom: (k.from.zoom || 1) * g }, to: { ...k.to, zoom: (k.to.zoom || 1) * g } })); };
  // (24 a second: at 8 the frame's crossfade between two steps of a moving ground drew its row twice, r1-S9 "2 2", "33")
  // (a module drawn as a frame's ground, still or played, takes no lens of its own: the frame blurs or dims its ground as it
  // asks, and a K-line softened twice under the year left open S1 at half the reference's fill)
  const moduleFrames = async (m, len, fps = GROUND_FPS) => { const key = crypto.createHash('sha256').update(JSON.stringify(['play', m, spec.theme ?? null, len, fps, pageCode(cfg, m.module), groundView(spec)])).digest('hex').slice(0, 16), dir = path.join(projectPaths(cfg, id).out, 'module-grounds', key);
    const n = Math.max(2, Math.round(len * fps) + 1), names = Array.from({ length: n }, (_, i) => path.join(dir, `f${String(i).padStart(4, '0')}.jpg`));
    if (!names.every((f) => fs.existsSync(f))) { fs.mkdirSync(dir, { recursive: true }); const at = m.at ?? 0, end = m.end ?? len, r = await renderModule(cfg, id, { theme: spec.theme, lens: false, ...m, at, end, camera: [], viewCamera: groundView(spec) }, path.join(dir, 'raw'), { stills: names.map((_, i) => Math.min(end - .02, at + i / fps)), checks: false, check: false });
      r.stills.forEach((f, i) => { spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', f, '--out', names[i]]); fs.rmSync(f, { force: true }); }); }
    return names.map((f) => pathToFileURL(f).href); };
  // the last picture of the shot this one goes on drawing (ground: { src: { after: <its module file> } }: shotplan continueFrom)
  // ... a recall of another passage's shot (whole) shows the thing as a whole, without that shot's own camera move
  const afterStill = async (f, whole = false) => { const p0 = JSON.parse(fs.readFileSync(f, 'utf8')), prev = whole ? { ...p0, camera: [], pageCamera: [], ...(p0.ground && typeof p0.ground === 'object' ? { ground: { ...p0.ground, focus: undefined, push: undefined } } : {}) } : p0, key = crypto.createHash('sha256').update(JSON.stringify(['after', prev, pageCode(cfg, prev.module)])).digest('hex').slice(0, 16), dir = path.join(projectPaths(cfg, id).out, 'module-grounds'), g = path.join(dir, `${key}.png`);
    if (!fs.existsSync(g)) { fs.mkdirSync(dir, { recursive: true }); const r = await renderModule(cfg, id, { ...prev, about: undefined }, path.join(dir, key), { stills: [prev.end - .04], checks: false, check: false }); fs.renameSync(r.stills[0], g); }
    return pathToFileURL(g).href; };
  const art = async (v) => { if (!v || typeof v === 'string') return v ? fileUrl(cfg, v) : null; if (v.market) return marketStill(v.market); if (v.module) return moduleStill(v.module); if (v.after) return afterStill(v.after, !!v.whole); const { realArt } = await import('./imagegen.mjs'); return pathToFileURL((await realArt(cfg, styled(v.art))).file).href; };
  // the painted layers any module may carry (camera.js spec.layers): each { art } generated text-free on transparency,
  // trimmed to its subject; a path is a cutout of the project's
  if ((spec.layers || []).length) page.layers = await Promise.all(spec.layers.map(async (l) => ({ ...l, src: typeof l.art === 'string' ? fileUrl(cfg, l.art) : l.art ? await art({ art: { transparent: true, trim: true, size: '1024x1024', ...l.art.art ? l.art.art : l.art } }) : null })));
  const tex = pathToFileURL(path.join(cfg.dataDir, 'style-lab', 'taste-v2', 'tex', 'paper.png')).href;
  // a part cut to the words it shows (phrase, or [first, last] for a block such as a table): the crop is the words'
  // own boxes found on the page (OCR, fitted to the ink) with a margin of a third of a line, and a bar under the
  // phrase sits on its glyphs — a crop guessed by hand cut 'approximately' and the year, or took the sentence before's
  // '！' (design reviews 2026-10-23)
  const phraseCrop = (l) => { if (!l.phrase || typeof l.src !== 'string') return l; const ph = [].concat(l.phrase), { boxes, size } = locatePhrases(cfg, l.src, ph), bs = ph.flatMap((x) => boxes[x].parts || [boxes[x]]);
    const lh = Math.max(...bs.map((b) => b.h)), m = lh * (l.pad ?? .35), mx = lh * (l.padX ?? .12), x0 = Math.max(0, Math.min(...bs.map((b) => b.x)) - mx), y0 = Math.max(0, Math.min(...bs.map((b) => b.y)) - m), x1 = Math.min(size[0], Math.max(...bs.map((b) => b.x + b.w)) + mx), y1 = Math.min(size[1], Math.max(...bs.map((b) => b.y + b.h)) + m);
    const crop = { x: x0 / size[0], y: y0 / size[1], w: (x1 - x0) / size[0], h: (y1 - y0) / size[1] };
    return { ...l, crop, marks: l.bar ? (boxes[ph[0]].parts || [boxes[ph[0]]]).map((b) => ({ x: (b.x - x0) / (x1 - x0), y: (b.y - y0) / (y1 - y0), w: b.w / (x1 - x0), h: b.h / (y1 - y0) })) : null }; };
  const playing = spec.module === 'frame' && spec.ground?.src?.module && spec.ground.play !== false;
  if (spec.module === 'frame') Object.assign(page, { ground: { ...(spec.ground || {}), ...(playing ? { frames: await moduleFrames(spec.ground.src.module, +(spec.end - spec.at).toFixed(3)), fps: GROUND_FPS } : {}), src: spec.ground?.src ? await art(spec.ground.src) : null },
    parts: await Promise.all((spec.parts || []).map(async (l0) => { const l = phraseCrop(l0); return l.kind === 'image' ? { ...l, src: typeof l.src === 'string' ? fileUrl(cfg, l.src) : await art(l.src.art ? { art: { size: '1536x1024', ...l.src.art } } : l.src) } : l; })) });
  // a cut-out's opaque part (alpha above 24, fractions of the picture): the frame lays it out and lets it cover words by
  // that, not by its clear margin (cards-S3: an A100 whose picture is 27 % opaque counted 93 % of 顯卡 hidden and was
  // pushed about by its empty corners)
  if (spec.module === 'frame') { const { alphaBoxes } = await import('./cardgeometry.mjs'); const { fileURLToPath } = await import('node:url');
    page.parts = page.parts.map((l) => { if (l.kind !== 'image' || typeof l.src !== 'string' || !/^file:.*\.png$/i.test(l.src)) return l; const f = fileURLToPath(l.src), ab = alphaBoxes([[f, f]])[f]; return ab ? { ...l, alpha: ab } : l; }); }
  if (spec.module === 'chart' && spec.paperArt) page.paperArt = await art(spec.paperArt);
  // a ground carrying a move keeps the faces it shows inside the frame (shotplan.mjs faceSafeGroundMove)
  // (and with the camera over it: shotplan.mjs faceSafeMove; a title whose ground is a photograph of a person)
  if ((page.groundMove || (page.camera || []).length) && (spec.module === 'title' || spec.module === 'frame')) { const src = spec.module === 'title' ? spec.bg : spec.ground?.src;
    if (typeof src === 'string') { let f = null; try { f = sourcePath(cfg, src); } catch { /* */ } if (f && fs.existsSync(f)) { const { frameFaces } = await import('./design-check.mjs'), { faceSafeMove } = await import('./shotplan.mjs'); const safe = faceSafeMove({ camera: page.camera, groundMove: page.groundMove }, frameFaces(f)); page.camera = safe.camera; if (safe.groundMove) page.groundMove = safe.groundMove; } } }
  if (spec.module === 'title') Object.assign(page, { bg: await art(spec.bg), hardware: spec.hardware ? fileUrl(cfg, spec.hardware) : null, paperTex: tex, ...(spec.tiles ? { tiles: { ...spec.tiles, src: fileUrl(cfg, spec.tiles.src) } } : {}), ...(spec.card ? { card: { ...spec.card, mark: spec.card.mark ? { ...spec.card.mark, src: fileUrl(cfg, spec.card.mark.src) } : null } } : {}) });
  // the lens follows the reference (camera.js): a photograph, a portrait or a K-line takes depth where the reference's frame
  // at the same moments is soft, and stays sharp where the reference's is sharp edge to edge (the lens on every picture
  // blurred faces and a screen of banknotes the reference shows whole, who S10/S15, meta S7; blind reviews 2026-10-25)
  if (LENS_MODULES.includes(spec.module) && spec.lens == null && reference) page.lens = await refLens(cfg, id, spec);
  if (spec.module === 'person') {
    Object.assign(page, { photo: fileUrl(cfg, spec.photo), paperTex: tex });
    const { facesOf } = await import('./design-check.mjs');
    let abs = sourcePath(cfg, spec.photo);
    // a clip: the frame with the largest face of eight across it (or at photoAt, seconds into the clip) is the photograph
    // (talent-S8: Ilya's portraits were drawn or small; real talks of his on video at 1080p)
    if (/\.(mp4|mov|webm|mkv)$/i.test(abs)) {
      const dur = parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', abs], { encoding: 'utf8' }).stdout) || 4;
      const ts = spec.photoAt != null ? [spec.photoAt] : Array.from({ length: 8 }, (_, i) => dur * (i + .5) / 8);
      const best = ts.map((t, i) => { const f = path.join(os.tmpdir(), `rb-still-${path.basename(out)}-${i}.png`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', abs, '-frames:v', '1', f]); const fs0 = fs.existsSync(f) ? facesOf(f).filter((x) => x[2] * x[3] > .004) : [], fc = fs0.length === 1 ? fs0[0] : null; return { f, area: fc ? fc[2] * fc[3] : 0 }; }).sort((a, b) => b.area - a.area)[0];   // (one face alone: of two, the largest was the interviewer)
      if (!best?.area) throw Object.assign(new Error('person: no face in the clip'), { problems: [{ kind: 'other', owner: 'plan', say: 'person: the clip shows no face (give photoAt, or a photograph)' }] });
      // a real person is never a drawing: the frame is held to the material loop's check (talent-S8: the clip was an
      // explainer with an illustrated Ilya; its largest face was drawn)
      const { drawnPerson } = await import('./shotplan.mjs'), drawn = drawnPerson(cfg, { entity: spec.name, original: '人像' }, best.f);
      if (drawn) throw Object.assign(new Error(`person: ${drawn}`), { problems: [{ kind: 'wrong-material', owner: 'plan', say: `person: the clip's frame is ${drawn}` }] });
      abs = best.f; page.photo = pathToFileURL(abs).href;
    }
    // a person small in the picture (a full figure on a pier) is cropped round the face, the head and shoulders filling
    // the card's frame (ending-S4: the face too small to know)
    const f = facesOf(abs).sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
    if (f && f[2] * f[3] < .02) { const out2 = path.join(os.tmpdir(), `rb-face-${path.basename(out)}.png`), py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
      spawnSync(py, ['-c', 'import cv2,sys\nim=cv2.imread(sys.argv[1]);H,W=im.shape[:2];x,y,w,h=[float(v) for v in sys.argv[3:7]]\ncx,cy=(x+w/2)*W,(y+h/2)*H+h*H*.9;ch=h*H*4.2;cw=ch*(760/620)\nx0=int(max(0,min(W-cw,cx-cw/2)));y0=int(max(0,min(H-ch,cy-ch/2)))\ncv2.imwrite(sys.argv[2],im[y0:y0+int(min(ch,H)),x0:x0+int(min(cw,W))])', abs, out2, ...f.map(String)]);
      if (fs.existsSync(out2)) { page.photo = pathToFileURL(out2).href; abs = out2; } }
    Object.assign(page, await faceInfo(abs));
  }
  if (spec.module === 'quote') Object.assign(page, { photo: spec.photo ? fileUrl(cfg, spec.photo) : null, presenter: spec.presenter ? fileUrl(cfg, spec.presenter) : null, ...(spec.photo ? await faceInfo(sourcePath(cfg, spec.photo)) : {}) });
  if (spec.module === 'steps') Object.assign(page, { nodes: await Promise.all((spec.nodes || []).map(async (n) => ({ ...n, img: await art(n.img) }))), paperTex: tex });
  if (spec.module === 'chart') page.paperTex = tex;
  if (spec.module === 'market') {
    const M = await import('./market.mjs'), short = (n) => String(n).replace(/,?\s+(Corporation|Corp\.?|Inc\.?|Platforms|Holdings|Devices|Ltd\.?|Limited)\b.*$/i, '').toUpperCase();
    if (spec.mode === 'board') { const series = []; for (const sym of spec.symbols) series.push(await M.marketSeries(cfg, id, sym, spec.from, spec.day)); page.rows = M.boardRows(series, spec.day).map((r) => ({ ...r, label: spec.labels?.[r.symbol] || short(r.name) })); }
    else page.candles = M.candles(await M.marketSeries(cfg, id, spec.symbol, spec.from, spec.day), spec.day);
  }
  if (spec.module === 'screen') {
    const phrases = [...new Set((spec.beats || []).map((b) => b.phrase).filter(Boolean))];
    const { boxes, size } = locatePhrases(cfg, spec.src, phrases);
    Object.assign(page, { src: fileUrl(cfg, spec.src), boxes, size });
  }
  if (spec.module === 'chat') page.messages = (spec.messages || []).map((m) => ({ ...m, avatar: fileUrl(cfg, m.avatar) }));
  if (spec.module === 'sidecard') {
    page.presenter = fileUrl(cfg, spec.presenter);
    // where the presenter's head is (macOS Vision on the plate, widened to the hair and ears), so tags keep off it
    // (cards-S5: 血本無歸 set large on the left lay across the face)
    { const { facesOf } = await import('./design-check.mjs'), f = facesOf(sourcePath(cfg, spec.presenter)).sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
      if (f) page.face = { x: (f[0] - f[2] * .25) * 1920, y: (f[1] - f[3] * .45) * 1080, w: f[2] * 1.5 * 1920, h: f[3] * 1.6 * 1080 }; }
    // (a card's picture is real material, or a painted prop where the card shows an object that is no evidence: the
    // reference's trophy on 难道是AI巨头, who R06; transparent, cut out)
    const u = async (x) => ({ ...x, drawn: !!(x.img && typeof x.img === 'object'), img: typeof x.img === 'string' ? fileUrl(cfg, x.img) : await art({ art: { transparent: true, trim: true, size: '1024x1024', ...x.img.art } }), ...(x.logo ? { logo: fileUrl(cfg, x.logo) } : {}) });
    page.cards = await Promise.all((spec.cards || []).map(async (c) => ({ ...(await u(c)), swap: await Promise.all((c.swap || []).map(u)) })));
    if (spec.curl) {
      page.curl = { ...spec.curl, src: fileUrl(cfg, spec.curl.src) };
      // the row to mark on the page: the union of the phrases' boxes (found on the page by OCR, never placed by hand)
      if (spec.curl.highlight?.length) { const { boxes, size } = locatePhrases(cfg, spec.curl.src, spec.curl.highlight); const b = Object.values(boxes);
        const x0 = Math.min(...b.map((r) => r.x)), y0 = Math.min(...b.map((r) => r.y)), x1 = Math.max(...b.map((r) => r.x + r.w)), y1 = Math.max(...b.map((r) => r.y + r.h));
        Object.assign(page.curl, { mark: { x: x0, y: y0, w: x1 - x0, h: y1 - y0, parts: b.flatMap((r) => r.parts) }, size }); }
    }
  }
  const { chromium } = await import(pathToFileURL(path.join(cfg.sourceRoot, 'node_modules', 'playwright', 'index.mjs')).href);
  // (file access: a page reads what of its pictures is opaque, sidecard's props placed by their bodies, framecheck's type on a cut-out)
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] }), p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: stills ? 1 : scale });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  if (process.env.RB_PAGE_LOG) p.on('console', (m) => console.error(`  page ${spec.module}: ${m.text()}`));   // (RB_PAGE_LOG=1: a module page's console, for fixing one)
  await p.addInitScript((s) => { window.__spec = s; document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = s.houseCss; document.head.appendChild(st); }); }, page);
  await p.addInitScript((pk) => { window.__housePick = pk; }, { ...H.housePick(spec.type || null), ...evaPick(H) });
  // the style's colours as CSS variables (modules read var(--paper, <their old colour>))
  await p.addInitScript((th) => { const set = () => { for (const [k, v] of Object.entries(th || {})) if (typeof v === 'string' && /^#|^rgb/.test(v)) document.documentElement.style.setProperty(`--${k}`, v); if (th?.ground) document.documentElement.dataset.ground = th.ground; }; if (document.documentElement) set(); document.addEventListener('DOMContentLoaded', set); }, page.theme);
  // the shared camera and texture over the module's own drawing (modules/camera.js)
  await p.addInitScript({ path: path.join(cfg.dataDir, 'modules', 'treat.js') });   // (the display treatments, for every page: treat.js)
  await p.addInitScript({ path: path.join(cfg.dataDir, 'modules', 'camera.js') });
  await p.addInitScript(H.houseCoverScript());
  await p.goto(pathToFileURL(pagePath(cfg, spec.module)).href);
  // a page that never gets ready says why (its errors) and lets its browser go: a hung page once held the bench for hours
  try { await p.waitForFunction(() => window.__ready, null, { timeout: 30000 }); }
  catch (e) { await b.close(); dropFoot(); throw new Error(`module page never ready${errs.length ? `: ${errs.join('; ')}` : ''} (${String(e.message || e).split('\n')[0]})`); }
  // the subject in front (spec.front: camera.js): lifted from the very picture the page shows, same size, laid over the words
  if (spec.front) { const u = await p.evaluate(() => window.__frontPhoto && window.__frontPhoto());
    if (!u || !/^file:/.test(u)) { await b.close(); dropFoot(); throw new Error('front: no picture a third of the frame or more on the page to lift a subject from'); }
    const cut = frontCutout(decodeURIComponent(new URL(u).pathname)); if (!cut) { await b.close(); dropFoot(); throw new Error('front: no subject found in the picture'); }
    await p.evaluate((x) => window.__setFront(x), pathToFileURL(cut).href); }
  // (RB_DEBUG=1: what a page left in window.__dbg while laying itself out, and its errors)
  if (process.env.RB_DEBUG) console.error('page:', await p.evaluate(() => JSON.stringify(window.__dbg ?? null)));
  // every character on the page is in the house font it is set in (checked at the shot's last frame, all text shown)
  await p.evaluate((x) => window.render(x), spec.end - .05); await p.evaluate(() => document.fonts.ready);
  // each text in a house font that has all its characters (only house fonts), then checked character by character
  // a house face the browser refused (a broken table: 金畫字 shipped one) would fall back silently: an error instead
  { const bad = await p.evaluate(() => [...document.fonts].filter((f) => /^House /.test(f.family) && f.status === 'error').map((f) => f.family)); if (bad.length) { await b.close(); dropFoot(); throw new Error(`house fonts the browser cannot load: ${[...new Set(bad)].join(', ')}`); } }
  { const miss = await p.evaluate(() => window.__houseCover()); await p.evaluate(() => document.fonts.ready);
    const ge = [...miss.map((m) => `no house font has ${m.chars || '?'} ("${m.text}", set in ${m.font})`), ...H.glyphErrors(await p.evaluate(H.PAGE_TEXT), { ...H.housePick(spec.type || null), ...EVA_PICK })];
    if (ge.length) { await b.close(); dropFoot(); throw new Error(`house fonts: ${[...new Set(ge)].join('; ')}`); } }
  const problems = [];
  // every mark on page words, measured at the moment it is complete (marks.js, markErrors)
  if (checks) { const n = await p.evaluate(() => (window.__marks || []).length), list = [];
    for (let i = 0; i < n; i++) {
      const t = await p.evaluate((k) => { const m = window.__marks[k]; return Math.min(window.__spec.end - .02, Math.max(window.__spec.at, (m.end || window.__spec.end) + .05)); }, i);
      await p.evaluate((x) => window.render(x), t);
      list.push(await p.evaluate((k) => { const m = window.__marks[k], r = m.el.getBoundingClientRect(), on = getComputedStyle(m.el).visibility !== 'hidden' && r.width > 0;
        return { kind: m.kind, label: m.label, part: m.part, rect: m.rect, shown: m.shown, screen: on ? { x: r.x, y: r.y, w: r.width, h: r.height } : null }; }, i));
      list.at(-1).end = t;
    }
    // the page the marks sit on (page pixels): the article's and the screen's picture, the curled page
    // (the article's marks sit on its reflowed page, articlePage: measured there, not on the captured one)
    const pageOf = spec.module === 'article' ? new URL(page.src).pathname : sourcePath(cfg, { screen: spec.src, sidecard: spec.curl?.src }[spec.module]);
    if (pageOf && list.length) edgeInk(cfg, decodeURIComponent(pageOf), list.map((m) => m.rect)).forEach((v, i) => { list[i].edgeInk = v; });
    // (a mark's fault is the module's: it draws the marks)
    problems.push(...list.flatMap((m) => markErrors([m]).map((say) => ({ kind: 'bad-mark', at: +m.end.toFixed(2), say, owner: 'module' })))); }
  // the frame checks (framecheck.mjs): type size, contrast, edges, subtitle band, overlaps, faces, script, emoji, and
  // how much the frame carries against the reference at the same moment
  // (reference: false, the module bench: a module tried on made-up words has no moment of the reference to answer)
  if (checks) { const F = await import('./framecheck.mjs'), video = reference ? loadProject(cfg, id).sourceVideo : null, vsrc = video ? sourcePath(cfg, video) : null;
    const ref = vsrc && fs.existsSync(vsrc) ? (t, f) => (spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', vsrc, '-frames:v', '1', '-vf', 'scale=1920:1080', f]).status === 0 && fs.existsSync(f) ? f : null) : null;
    // a full-frame real picture (insert) was held to the reference's fill when it arrived (shotplan emptierThanReference,
    // the same measure on the material itself); measured again here it took a person in a dark suit in a full room for
    // an empty frame (open-S12: 31 % against the Oval Office's 64 %, three clips alike): its fill is not compared twice
    problems.push(...await F.measureFrames(cfg, p, F.keyTimes(spec), { display: ['title', 'quote'].includes(spec.module) && !spec.size && !spec.side ? spec.refType?.h ?? null : null, toHant: H.traditionalOn() ? H.toHant : null, ref: spec.module === 'insert' ? null : ref, span: [spec.at, spec.end], twice: reference })); }
  // a shot the checks fail does not render: the problems go to the picture review as the code's verdict (layers.mjs)
  if (checks && problems.length) { await b.close(); dropFoot(); throw Object.assign(new Error(`checks: ${problems.map((x) => `${x.kind} @${x.at}s: ${x.say}`).join('; ')}`), { problems }); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (stills) {
    const files = [];
    for (const t of stills) { await p.evaluate((x) => window.render(x), t); const f = `${out}-${t.toFixed(2)}.png`; await p.screenshot({ path: f }); files.push(f); }
    await b.close(); dropFoot(); return { stills: files, errors: errs };
  }
  // the reference is 60 fps with motion blur: each frame is `sub` sub-frames spread over half a frame (a 180° shutter), averaged by ffmpeg
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-module-')), n = Math.round((spec.end - spec.at) * fps);
  for (let i = 0; i < n; i++) for (let j = 0; j < sub; j++) {
    await p.evaluate((x) => window.render(x), spec.at + (i + (j / sub) * .5) / fps);
    // JPEG at high quality: a 1080p PNG encode was most of the time of a frame (H800: an hour for three shots)
    await p.screenshot({ path: path.join(dir, `${String(i * sub + j).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 95, timeout: 120000 });   // (several shots render at once: 30 s ran out under the load, h800-S3)
  }
  await b.close(); dropFoot();
  if (errs.length) throw new Error(`module page errors: ${errs.join('; ')}`);
  const mp4 = `${out}.mp4`;
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps * sub), '-i', path.join(dir, '%06d.jpg'), '-vf', `tmix=frames=${sub},framestep=${sub}`, '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-maxrate', scale < 1 ? '8M' : '30M', '-bufsize', scale < 1 ? '16M' : '60M', mp4]);
  fs.rmSync(dir, { recursive: true, force: true });
  const src = sourcePath(cfg, loadProject(cfg, id).sourceVideo || '');
  let withVoice = null;
  if (src && fs.existsSync(src)) {
    withVoice = `${out}-voice.mp4`;
    // the voice from the recording, the module's sound effects mixed under it (sfx.py)
    const wav = `${out}-voice.wav`, ev = `${out}-sfx.json`, mixed = `${out}-mix.wav`;
    spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(spec.at), '-t', String(spec.end - spec.at), '-i', src, '-vn', '-ac', '1', '-ar', '48000', wav]);
    fs.writeFileSync(ev, JSON.stringify(soundEvents(spec)));
    const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
    const mx = spawnSync(py, [path.join(HERE, 'sfx.py'), wav, ev, mixed], { encoding: 'utf8' });
    const audio = mx.status === 0 ? mixed : wav;
    // both cut at the shot's length (-shortest with the picture copied dropped its last 0.3 s: 29 of 33 frames, and the
    // passage's film froze and drifted where the late events are, who-S10's role line)
    spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-t', (spec.end - spec.at).toFixed(4), withVoice]);
    for (const f of [wav, ev, mixed]) fs.rmSync(f, { force: true });
  }
  const check = measure ? refCheck(cfg, id, spec, mp4, `${out}-refcheck.json`) : { issues: [], skipped: 'animatic' };
  return { mp4, withVoice, frames: n, check };
}

// measured against the reference over the same span (refcheck.py): cuts, camera motion, jerk, held frames, frame rate,
// the moments change happens. spec.refRegion [x0, y0, x1, y1] limits it to where the module draws (a presenter shot's
// card side: the presenter is the author's footage). Returns { issues: [{ kind, say }], rhythm }; never blocks a render.
export function refCheck(cfg, id, spec, mp4, out) {
  const src = sourcePath(cfg, loadProject(cfg, id).sourceVideo || '');
  if (!src || !fs.existsSync(src)) return { issues: [], skipped: 'no reference recording' };
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  const args = [path.join(HERE, 'refcheck.py'), mp4, src, String(spec.at), String(spec.end - spec.at), out, ...(spec.refRegion ? [spec.refRegion.join(',')] : [])];
  const r = spawnSync(py, args, { encoding: 'utf8', timeout: 600000 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { issues: [], skipped: String(r.stderr).slice(-200) }; }
}

// the module next to the reference film over the same span (the acceptance check), with the voice
export function besideReference(cfg, id, spec, mp4, out, { ourAudio = null } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'module');
  const src = sourcePath(cfg, loadProject(cfg, id).sourceVideo || '');
  const font = '/System/Library/Fonts/STHeiti Medium.ttc';
  const lab = (t) => `drawtext=fontfile='${font}':text='${t}':x=20:y=16:fontsize=30:fontcolor=white:box=1:boxcolor=black@.6`;
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(spec.at), '-t', String(spec.end - spec.at), '-i', src, '-i', ourAudio || mp4, '-filter_complex',
    `[0:v]scale=960:-2,${lab('对标原片')}[a];[1:v]scale=960:-2,${lab(spec.module)}[b];[a][b]hstack=2,format=yuv420p[v]`, '-map', '[v]', '-map', ourAudio ? '1:a' : '0:a', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', out]);
  return out;
}
