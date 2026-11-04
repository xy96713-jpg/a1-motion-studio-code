// Display plates: the film's high points shown on real objects (lab: style-lab/c1-v2, the version the
// user liked best). The house card stays the base; at a few chosen moments its material is put on a
// photographed display instead of flat on the frame:
//   title-hero-over-photo -> crt34    the photo plays on an old CRT monitor, the title in metal type beside it
//   screen-full           -> crtFront the page is read off a CRT screen
//   paper-collage-figures -> ledBoard the figure is lit on a trading-floor LED ticker board
// The monitor and the board are generated art (text-free, the screen flat chroma green); the material is the
// shot's own real material; the LED words are the shot's own (fact-checked) words lit by code (display.py).
//
// Restraint (the reference keeps packaging for the key moments; DESIGN-method.md 七): at most `share` of the
// film's shots (and never fewer than `min`), the opening first, then the storyboard's hero beats, at least
// `gap` shots apart outside the hook chapter, each display at most `perKind` times. A theme turns it on with `display: true` (or { share, gap, min }).
import * as H0 from './house.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cachedArt } from './imagegen.mjs';
import { pythonFor } from './medium.mjs';
import { readPlan, loadShots, projectPaths } from './store.mjs';
import { readingFocus } from './screen.mjs';
import { breakdownFor } from './refbreakdown.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const PIXEL_FONT = path.join(HERE, '../../../public/a1-editorial-fonts/fusion-pixel.ttf');

const PHOTO = 'A real photograph shot on 35 mm film: moody low-key studio light from the left, shallow depth of field, visible film grain, muted colours, dark charcoal background falling off to black at the corners.';
export const PLATES = {
  crt34: { prompt: `${PHOTO} A beige early-1990s CRT computer monitor on a dark desk, seen in three-quarter view from the left, slightly from above; a worn keyboard edge in the out-of-focus foreground. The whole glass screen area is filled with flat pure chroma green #00FF00 (no reflections, no content, edge to edge inside the bezel) so it can be replaced later. The monitor fills about 70% of the frame width, placed right of centre; the left third of the frame is dark empty space.`, size: '1536x1024' },
  crtFront: { prompt: `${PHOTO} A close, almost frontal view of an old grey CRT monitor, slightly tilted, the bezel filling most of the frame; the whole glass screen area is flat pure chroma green #00FF00 (no reflections, no content) so it can be replaced later. Dust on the bezel, a little scratch, warm rim light on the plastic.`, size: '1536x1024' },
  ledBoard: { prompt: `${PHOTO} Inside a dim 1990s stock-exchange trading hall: a long horizontal electronic ticker board mounted high on a dark wall, seen slightly from below and from the left, with blurred silhouettes of a few traders and old monitors in the out-of-focus foreground. The display face of the board is filled edge to edge with flat pure chroma green #00FF00 (no lights, no content) so it can be replaced later; its metal housing, bolts and a little dust are visible. The board spans about 80% of the frame width in the upper-middle of the frame.`, size: '1536x1024' },
};
// A plate is painted in the film's look (user 2026-10-23: 5:38 的电脑明显是别的线生成的 — a beige monitor under warm light
// in a film of neutral greys and one red): a film whose photographs are black and white (tokens.photoMono) gets a
// black-and-white plate, any other film its palette. The prompt is the plate's identity, so each look has its own.
export function platePrompt(kind, theme) {
  const base = PLATES[kind]; if (!base) return null;
  const t = theme?.tokens || {};
  const look = t.photoMono ? ' Black-and-white photograph: neutral greys only, no colour cast, no warm or cool tint anywhere.' : t.bg ? ` The film's palette: ground ${t.bg}, light ${t.fg || '#ece8df'}, nothing else saturated.` : '';
  return look ? { ...base, prompt: base.prompt + look } : base;
}
export const DISPLAY_CARDS = { 'title-hero-over-photo': 'crt34', 'screen-full': 'crtFront', 'paper-collage-figures': 'ledBoard' };
const DEFAULTS = { share: 0.06, min: 3, gap: 3, perKind: 2 };
export const DISPLAY_DEVICES = ['real-in-frame'];

const firstCard = (s) => (s.scenes?.length ? s.scenes[0].recipe || s.recipe : s.recipe);

// Pure: which shots get a display plate. shots in film order: { shotId, card, hero, chapter }.
export function displayPicks(shots, opts = {}) {
  const { share, min, gap, perKind } = { ...DEFAULTS, ...opts };
  const budget = Math.max(min, Math.round(share * shots.length));
  const hook = shots[0]?.chapter;
  const order = shots.map((s, i) => ({ ...s, i })).filter((s) => DISPLAY_CARDS[s.card] && s.fits !== false);
  // the opening first, then hero beats, then the rest in film order
  const rank = (s) => (s.i === 0 ? 0 : s.hero ? 1 : 2);
  const picks = [];
  for (const s of [...order].sort((a, b) => rank(a) - rank(b) || a.i - b.i)) {
    if (picks.length >= budget) break;
    const tooClose = picks.some((p) => Math.abs(p.i - s.i) < gap && !(p.chapter === hook && s.chapter === hook));
    // the same photographed object a third time reads as a template, not a moment
    const used = picks.filter((p) => DISPLAY_CARDS[p.card] === DISPLAY_CARDS[s.card]).length;
    if (!tooClose && used < perKind) picks.push(s);
  }
  return new Map(picks.map((p) => [p.shotId, DISPLAY_CARDS[p.card]]));
}

export function projectDisplays(cfg, id, theme) {
  if (!theme?.display) return new Map();
  const order = (readPlan(cfg, id)?.beats || []).map((b) => b.id);
  const shots = loadShots(cfg, id).sort((a, b) => order.indexOf(a.shotId) - order.indexOf(b.shotId));
  const opts = typeof theme.display === 'object' ? theme.display : {};
  // a shot fits its display when it has what goes on it: real material for a screen, a figure for the board
  const fits = (s) => {
    const sl = (s.scenes?.length ? s.scenes[0].slots : null) || s.slots || {};
    const kind = DISPLAY_CARDS[firstCard(s)];
    if (kind === 'crt34') return /materials\//.test(sl.background?.asset || '');
    if (kind === 'crtFront') return /materials\//.test(sl.screen?.asset || '');
    if (kind === 'ledBoard') return !!sl.data?.figures?.[0]?.value;
    return false;
  };
  // with a reference taken apart, a plate goes only where the reference itself shows its material on a real object
  // (its breakdown's real-in-frame: the old television at paperclip-138 B36), never by the budget alone
  const bd = breakdownFor(cfg, id, shots.map((s) => s.shotId)), onObject = (sid) => !bd || (bd.beats.find((b) => b.beat === sid)?.devices || []).some((d) => DISPLAY_DEVICES.includes(d));
  return displayPicks(shots.map((s) => ({ shotId: s.shotId, card: firstCard(s), hero: !!s.design?.isHero, chapter: s.design?.chapter, fits: fits(s) && onObject(s.shotId) })), opts);
}

const plain = (t) => String(t || '').replace(/\[\[|\]\]/g, '').trim();
export const ledFigure = (t) => String(t).replace(/^(差不多|大约|大概|将近|接近|近|约|超过|超|逾)\s*/, (m, w) => (/超|逾/.test(w) ? '>' : '≈'));
const fileOf = (url) => (url && url.startsWith('file://') ? decodeURIComponent(url.slice(7)) : null);

// The display for one scene (only a shot's first cut, on its own card), with its composite built (cached
// by inputs under out/display/). null when the shot has none or its plate is not generated yet (the art
// step generates it; the card renders as usual until then).
export function displayContext(cfg, id, theme, shot, recipeId, resolved, sceneIndex = 0) {
  if (!theme?.display || sceneIndex !== 0) return null;
  const kind = projectDisplays(cfg, id, theme).get(shot.shotId);
  if (!kind || DISPLAY_CARDS[recipeId] !== kind) return null;
  const plate = cachedArt(cfg, platePrompt(kind, theme));
  if (!plate) return null;
  const slots = shot.slots || {};
  let material = null, led = null, title = null;
  // only real material goes on a screen (a generated backdrop on a monitor is a picture of nothing)
  const real = (f) => (f && /[\/]materials[\/]/.test(f) ? f : null);
  if (kind === 'crt34') { material = real(fileOf(resolved.background?.url)); title = plain(slots.title?.text); }
  if (kind === 'crtFront') material = real(fileOf(resolved.screen?.url));
  if (kind === 'ledBoard') {
    const fig = slots.data?.figures?.[0];
    if (!fig?.value) return null;
    // short labels only: a clause on a ticker board is unreadable (hupo B23 lit 他们手里边就攒了); a long
    // title gives way to its short sub (A100). A hedge is the board's ≈ (差不多1万亿 -> ≈1万亿).
    const short = (t) => (t && [...t].length <= 6 ? t : '');
    const name = short(plain(slots.title?.text)) || short(plain(slots.title?.sub));
    // one label, so it can be drawn large enough for its strokes to stay apart on the dots
    led = { small: [[name, 'amber'], [short(plain(fig.lead)), 'red']].filter(([t]) => t).slice(0, 1), big: [ledFigure(plain(fig.value) + plain(fig.unit || '')), 'red'] };
  }
  if (!led && !(material && fs.existsSync(material))) return null;
  const code = sha(['display.mjs', 'display.py'].map((f) => fs.readFileSync(path.join(HERE, f), 'utf8')).join('\n'));
  // the page's reading focus is part of the key (not the bindings file's time: every run rewrites it)
  const bfile = path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json');
  const focus = kind === 'crtFront' ? readingFocus(fs.existsSync(bfile) ? JSON.parse(fs.readFileSync(bfile, 'utf8')) : null, shot) : null;
  const key = sha(JSON.stringify([kind, plate, material && fs.statSync(material).size, material, led, code, focus?.at || null]));
  const dir = path.join(projectPaths(cfg, id).out, 'display');
  const out = path.join(dir, `${shot.shotId}-${key}.png`);
  // the LED words are the card's own words lit into the picture: their place on the plate (the screen's quad, display.py
  // key) is kept beside it so the line's checks read them as type (cardgeometry.mjs: data-words on the picture)
  const place = `${out}.json`;
  if (!fs.existsSync(out) || (led && !fs.existsSync(place))) {
    fs.mkdirSync(dir, { recursive: true });
    const py = pythonFor(cfg), script = path.join(HERE, 'display.py');
    let mat = material;
    if (led) { mat = path.join(dir, `${shot.shotId}-${key}-led.png`); execFileSync(py, [script, 'led', PIXEL_FONT, mat, JSON.stringify(led)]); }
    // a page shows the part being read (the materials step's reading focus), at the screen's shape
    let crop = [];
    if (kind === 'crtFront') {
      const y0 = Math.min(0.28, Math.max(0, (focus?.at?.[1] ?? 0.3) - 0.3));
      crop = ['--crop', '0', y0.toFixed(3), '1', '0.72'];
    }
    // a light page is shown the way a monitor shows text: light on dark (a white page on a CRT blooms away)
    const invert = kind === 'crtFront' ? ['--invert'] : [];
    const said = execFileSync(py, [script, 'key', plate, mat, out, ...(led ? ['--led'] : []), ...crop, ...invert], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    if (led) { try { const { quad } = JSON.parse(said.trim().split('\n').at(-1)), [pw, ph] = PLATES[kind].size.split('x').map(Number), xs = quad.map((q) => q[0] / pw), ys = quad.map((q) => q[1] / ph);
      fs.writeFileSync(place, JSON.stringify({ box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] })); } catch { /* no place: the words are not registered */ } }
  }
  const words = led ? [...led.small.map(([t]) => t), led.big[0]].filter(Boolean).join(' ') : null;
  let wordsBox = null; if (led) try { wordsBox = JSON.parse(fs.readFileSync(place, 'utf8')).box; } catch { wordsBox = null; }
  return { kind, file: out, title, contentHash: key, ...(words && wordsBox ? { words, wordsBox } : {}) };
}

// The frame: the composite full-bleed, and for the monitor-and-title plate the title in the house metal type
// in the dark left third (two lines when it is long), where the plate leaves room.
export function displayFrame(d, fontBase) {
  const att = (v) => String(v).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const words = d.words && d.wordsBox ? ` data-words="${att(d.words)}" data-words-box="${d.wordsBox.map((v) => v.toFixed(4)).join(',')}"` : '';
  const img = `<div class="slot" data-slot="background" style="position:absolute;inset:0"><img src="${d.url}"${words} style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></div>`;
  if (d.kind !== 'crt34' || !d.title) return { content: img, css: '' };
  const t = d.title;
  const cut = t.length > 4 ? (t.indexOf('年') > 0 && t.indexOf('年') < t.length - 1 ? t.indexOf('年') + 1 : Math.ceil(t.length / 2)) : t.length;
  const lines = [t.slice(0, cut), t.slice(cut)].filter(Boolean);
  const longest = Math.max(...lines.map((l) => [...l].reduce((a, c) => a + (/[\x00-\x7f]/.test(c) ? 0.62 : 1), 0)));
  // the dark left third is about 600 px; letters are spaced tighter than 1 em, so 540 / chars leaves a margin
  // before the bezel (人生目标 at 160 px ran into the monitor: clara B15)
  const size = Math.round(Math.min(200, 540 / Math.max(1, longest)));
  const css = `@font-face{font-family:'A1 Serif Heavy';src:url('${fontBase}SourceHanSerifCN-Heavy.otf')}
.dp-title{position:absolute;left:60px;top:${Math.round(540 - (lines.length * size * 1.35 * 1.12) / 2 - 40)}px;width:700px}
.dp-title .t{display:block;font:900 ${size}px/1.12 'A1 Serif Heavy','Songti SC',serif;letter-spacing:-.06em;transform:scaleY(1.35);transform-origin:left top;background:linear-gradient(180deg,#fbf7ec 0%,#cfc6ad 38%,#7e7765 52%,#e6dfcb 70%,#a39b84 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 10px 18px rgba(0,0,0,.7));white-space:nowrap;margin-bottom:${Math.round(size * 0.42)}px}`;
  const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
  // the house fonts after this card's own face (house.mjs)
  return { content: `${img}<div class="slot dp-title" data-slot="title">${lines.map((l) => `<span class="t">${esc(l)}</span>`).join('')}</div>`, css: css + (H0.houseFonts().ready ? `\n${H0.houseFontCss()}` : '') };
}
