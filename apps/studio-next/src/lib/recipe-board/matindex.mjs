// The material index (素材目录): every picture a shot may use, read once and described by what it is, so the director
// chooses by what a beat needs and the line can tell a wrong pick (the user, 2026-10-21: a low-resolution product photo
// went in as the page that curls in, where the reference shows a spec sheet; picked by its file name).
//   projects/<id>/materials/index.json   { files: { <repo path>: { kind, w, h, alpha, chars, text, faces, marks, sha } } }
// kind: page (a captured page or document: much text), photo, cutout (a subject on transparency), portrait (a face),
// logo (a mark on transparency), footage (video). marks: site names or watermarks read on it (never on screen as is).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths, loadProject } from './store.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PICTURE = /\.(png|jpe?g|webp)$/i, VIDEO = /\.(mp4|mov|webm)$/i;
// site names and watermark words that may be printed on a picture (a match is reported in marks)
const SITE_MARKS = /techpowerup|观察者|guancha|sina|新浪|163\.com|网易|zol|中关村|bilibili|youtube|getty|shutterstock|wikimedia|36kr|36氪|知乎|zhihu|fortune|bgr|millionminer|极客湾|geekerwan|substack|techinasia|www\.|\.com|\.cn/i;

// a stock library's watermark on a preview clip (pure regex, tested)
export const STOCK_MARKS = /\b\w+ ?media\b|stock ?footage|vid ?#|clip ?#|preview|watermark|pond5|storyblocks|videohive|envato|artgrid|shutterstock|istock|adobe ?stock|©/i;
// libraries whose free previews carry their watermark (named in the clip's file: kilmermedia, stockvid…)
export const PREVIEW_VENDORS = /kilmer|stockvid|artefacti|editableclips|franfrank|motion-array|clever-stock|pixadisc|videohive|pond5|storyblocks|artgrid|shutterstock|istock|adobe-?stock|kil(r|m)er/i;
export function indexPath(cfg, id) { return path.join(projectPaths(cfg, id).root, 'materials', 'index.json'); }
export function readIndex(cfg, id) { const f = indexPath(cfg, id); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { files: {} }; }

// the kind from the measures (pure, tested)
export function kindOf(m) {
  if (m.video) return 'footage';
  // transparency anywhere (a cut-out keeps a transparent margin): a mark with letters is a logo, else a subject
  if (m.alpha > .005) return m.chars >= 2 && m.chars < 40 && (m.h / Math.max(1, m.w)) < .5 ? 'logo' : (m.faces ? 'portrait' : 'cutout');
  if (m.chars >= 120) return 'page';
  if (m.faces && m.faceArea > .03) return 'portrait';
  return 'photo';
}

function measure(cfg, file) {
  const abs = path.join(cfg.sourceRoot, file);
  if (VIDEO.test(file)) {
    const p = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', abs], { encoding: 'utf8' });
    const j = JSON.parse(p.stdout || '{}'), dur = +(+j.format?.duration || 0).toFixed(2);
    // a stock preview's watermark (the library's name, a clip number) read on two of its frames: it is never shown
    // (recap-S9, opensrc-S6: "Kilmer Media" and "VID # 2019…" stayed on screen)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-vmark-')), text = [.25, .75].map((k, i) => { const f = path.join(tmp, `${i}.jpg`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(dur * k), '-i', abs, '-frames:v', '1', f]);
      try { return JSON.parse(spawnSync('swift', [path.join(HERE, 'ocr.swift'), f], { encoding: 'utf8', timeout: 120000 }).stdout || '[]').map((l) => l.text).join(' '); } catch { return ''; } }).join(' ');
    fs.rmSync(tmp, { recursive: true, force: true });
    // (the faint ones read in pieces or not at all, "Kilr": a clip from a library that marks its previews counts as marked)
    const marks = [...new Set([...(text.match(new RegExp(`${SITE_MARKS.source}|${STOCK_MARKS.source}`, 'gi')) || []).map((x) => x.toLowerCase()), ...(PREVIEW_VENDORS.test(path.basename(file)) ? ['stock preview watermark'] : [])])];
    return { video: true, w: j.streams?.[0]?.width || 0, h: j.streams?.[0]?.height || 0, dur, chars: 0, text: text.slice(0, 200), faces: 0, marks, vmarks: 2 };
  }
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  const code = "import cv2,sys,json\nim=cv2.imread(sys.argv[1],cv2.IMREAD_UNCHANGED)\nh,w=im.shape[:2]\na=(im[...,3]<16).mean() if im.ndim==3 and im.shape[2]==4 else 0\nar=(im[...,3]>16).mean() if im.ndim==3 and im.shape[2]==4 else 1\nprint(json.dumps({'w':w,'h':h,'alpha':round(float(a),3),'alphaArea':round(float(ar),3)}))";
  const base = JSON.parse(spawnSync(py, ['-c', code, abs], { encoding: 'utf8' }).stdout || '{"w":0,"h":0,"alpha":0}');
  // OCR on the picture flattened over white (text on a transparent logo reads too)
  let lines = []; try { lines = JSON.parse(spawnSync('swift', [path.join(HERE, 'ocr.swift'), abs], { encoding: 'utf8', timeout: 180000 }).stdout || '[]'); } catch { /* none */ }
  const text = lines.map((l) => l.text).join(' ');
  let faces = []; try { faces = JSON.parse(spawnSync('swift', [path.join(HERE, 'faces.swift'), abs], { encoding: 'utf8', timeout: 120000 }).stdout || '[]'); } catch { /* none */ }
  const marks = [...new Set((text.match(new RegExp(SITE_MARKS.source, 'gi')) || []).map((x) => x.toLowerCase()))];
  return { ...base, chars: text.replace(/\s/g, '').length, text: text.slice(0, 400), faces: faces.length, faceArea: +Math.max(0, ...faces.map(([, , fw, fh]) => fw * fh)).toFixed(3), marks };
}

// read every picture and clip of the project (cached by size and time; a changed file is read again)
export function buildIndex(cfg, id, { log = () => {} } = {}) {
  const root = projectPaths(cfg, id).root, idx = readIndex(cfg, id), seen = new Set();
  const dirs = [path.join(root, 'materials', 'clips'), path.join(root, 'modules', 'cutouts')];
  const extra = [loadProject(cfg, id).presenter?.asset].filter(Boolean);
  for (const rel of extra) { const abs = path.join(cfg.sourceRoot, rel); if (!fs.existsSync(abs)) continue; const st = fs.statSync(abs), key = `${st.size}:${Math.round(st.mtimeMs)}`; seen.add(rel); if (idx.files[rel]?.key !== key) { const m = measure(cfg, rel); idx.files[rel] = { key, kind: kindOf(m), ...m }; } }
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!PICTURE.test(f) && !VIDEO.test(f)) continue;
      const rel = path.relative(cfg.sourceRoot, path.join(d, f)), st = fs.statSync(path.join(d, f)), key = `${st.size}:${Math.round(st.mtimeMs)}`;
      seen.add(rel);
      if (idx.files[rel]?.key === key && !(VIDEO.test(f) && (idx.files[rel].vmarks || 0) < 2)) continue;   // (clips indexed before their watermarks were read are read again)
      const m = measure(cfg, rel);
      // (a picture cut or set from a captured page says so beside it, <file>.from.json { kind, source }: a page header
      // enlarged with its page blurred under it reads only a few words, and was taken for a photo, r1-S5)
      const fromF = path.join(d, f) + '.from.json', from = fs.existsSync(fromF) ? (() => { try { return JSON.parse(fs.readFileSync(fromF, 'utf8')); } catch { return null; } })() : null;
      idx.files[rel] = { key, kind: from?.kind || kindOf(m), ...m, ...(from ? { from: from.source } : {}) };
      log(`  ${idx.files[rel].kind.padEnd(8)} ${m.w}x${m.h} ${m.chars} chars  ${f.slice(0, 70)}`);
    }
  }
  for (const k of Object.keys(idx.files)) if (!seen.has(k)) delete idx.files[k];
  // a clip is read as a strip of frames, one every half second with its time, so the director can choose where it
  // starts (meta-S6: the 1957 newsreel opens on 3 s of an orbit diagram, the satellite comes at 3.0 s)
  for (const [rel, e] of Object.entries(idx.files)) if (e.kind === 'footage' && !(e.strip && fs.existsSync(path.join(cfg.sourceRoot, e.strip)))) {
    const dir = path.join(root, 'materials', 'strips'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `${crypto.createHash('sha256').update(rel).digest('hex').slice(0, 12)}.jpg`), n = Math.min(16, Math.max(2, Math.ceil((e.dur || 4) * 2)));
    spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(cfg.sourceRoot, rel), '-vf', `fps=${n / Math.max(.5, e.dur || 4)},scale=320:-2,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='%{pts\\:flt}':x=4:y=4:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@.6,tile=4x${Math.ceil(n / 4)}`, '-frames:v', '1', f]);
    if (fs.existsSync(f)) e.strip = path.relative(cfg.sourceRoot, f);
  }
  fs.writeFileSync(indexPath(cfg, id), JSON.stringify(idx, null, 1) + '\n');
  return idx;
}

// what each module slot needs (pure, tested). A slot names the kinds it takes, a least size for how large it is shown,
// and whether text must be on it; a shot's pick is checked against its slot before it renders.
export const SLOTS = {
  'sidecard.presenter': { kinds: ['photo', 'portrait', 'footage'], minW: 1280 },
  'sidecard.cards.img': { kinds: ['cutout', 'logo'], minW: 400 },
  'sidecard.cards.logo': { kinds: ['logo', 'cutout'], minW: 120 },
  'sidecard.curl.src': { kinds: ['page'], minW: 1280, text: true, distinct: 'sidecard.cards.img' },
  'article.src': { kinds: ['page'], minW: 1200, text: true },
  'chat.messages.avatar': { kinds: ['portrait', 'photo'], minW: 160, face: true },
  'compare.photo': { kinds: ['cutout'], minW: 600 },
  // full frame: a photograph of the mark (the reference: a phone showing it), else a mark on transparency on the stage
  'brand.src': { kinds: ['photo', 'logo', 'cutout', 'page'], minW: 1000 },
  'brand.src.page': { kinds: ['page'], minW: 1200 },
  // archival footage is often SD (the reference cuts 1957 newsreel in as it is): 640 px for a clip
  'insert.src': { kinds: ['photo', 'portrait', 'footage'], minW: 1280, minWOf: { footage: 640 } },
  // a paper's figure cut from its archived page (opensrc-S10: the reference shows R1-Zero's training curves; the line
  // only had the abstract): shown whole on the dark stage, a page by its words
  'insert.figure': { kinds: ['page', 'photo'], minW: 700 },
  'title.bg': { kinds: ['photo', 'page', 'footage', 'portrait'], minW: 1280 },
  // under white or metal type the picture carries no words of its own (深度求索 set over the printed deepseek of the
  // key visual read as two words in a heap: open-S8); a page under ink type (P07) is the point
  'title.bg.quiet': { kinds: ['photo', 'footage', 'portrait'], minW: 1280, quiet: true },
  'title.hardware': { kinds: ['cutout'], minW: 600 },
  'title.mark': { kinds: ['logo', 'cutout'], minW: 200 },   // the real mark on a designed ground (tiles, card)
  // (a frame of real footage of the person, the one with the largest face: talent-S8, Ilya only in talks on video)
  'person.photo': { kinds: ['portrait', 'photo', 'footage'], minW: 600, minWOf: { footage: 1280 }, face: true },
  'quote.photo': { kinds: ['portrait', 'photo', 'cutout'], minW: 600, face: true },
  'quote.presenter': { kinds: ['photo', 'portrait', 'footage'], minW: 1280 },
  'steps.nodes.img': { kinds: ['cutout', 'photo', 'portrait'], minW: 300 },
  'screen.src': { kinds: ['page', 'photo'], minW: 1200, text: true },
  // a designed frame's parts (frame.html): any real material, as large as the part it plays
  'frame.ground': { kinds: ['photo', 'page', 'footage', 'portrait'], minW: 960 },
  'frame.image': { kinds: ['photo', 'page', 'portrait', 'cutout', 'logo'], minW: 200 },
};
export function slotErrors(slot, file, entry, covered = []) {
  const need = SLOTS[slot], err = [];
  if (!need) return err;
  if (!entry) return [`${slot}: ${path.basename(file)} is not in the material index (materials/index.json)`];
  if (!need.kinds.includes(entry.kind)) err.push(`${slot}: needs ${need.kinds.join(' / ')}, ${path.basename(file).slice(0, 60)} is a ${entry.kind}`);
  const minW = need.minWOf?.[entry.kind] ?? need.minW;
  if (entry.w < minW) err.push(`${slot}: ${entry.w} px wide, shown at this size it needs ${minW} px`);
  if (need.text && entry.chars < 120) err.push(`${slot}: a page with text is needed (${entry.chars} characters read on it)`);
  if (need.face && !entry.faces && entry.kind !== 'footage') err.push(`${slot}: no face found on it`);   // (a clip: its frame is chosen by the face at render, and fails there without one)
  if (need.quiet && entry.chars >= 5) err.push(`${slot}: words are printed on it ("${String(entry.text || '').slice(0, 20)}"); the title would sit on them. Use a picture without words, or style "ink" over a page`);
  const open = (entry.marks || []).filter((k) => !covered.some((c) => c.toLowerCase().includes(k) || k.includes(c.toLowerCase())));
  if (open.length && /src|img|photo|presenter/.test(slot)) err.push(`${slot}: a site name or watermark is printed on it (${entry.marks.join(', ')}); crop or cover it`.replace(entry.marks.join(', '), open.join(', ')));
  return err;
}
// every picture a spec uses, with its slot
export function picks(spec) {
  const out = [], add = (slot, f) => f && out.push([slot, f]);
  const m = spec.module;
  if (m === 'sidecard') { add('sidecard.presenter', spec.presenter); for (const c of spec.cards || []) for (const x of [c, ...(c.swap || [])]) { add('sidecard.cards.img', typeof x.img === 'string' ? x.img : null); add('sidecard.cards.logo', x.logo); } if (spec.curl) add('sidecard.curl.src', spec.curl.src); }
  if (m === 'article') add('article.src', spec.src);
  if (m === 'frame') { add('frame.ground', typeof spec.ground?.src === 'string' ? spec.ground.src : null); for (const l of spec.parts || []) if (l.kind === 'image') add('frame.image', typeof l.src === 'string' ? l.src : null); }
  if (m === 'chat') for (const x of spec.messages || []) add('chat.messages.avatar', x.avatar);
  if (m === 'compare') add('compare.photo', spec.photo);
  if (m === 'brand') add('brand.src', spec.src);
  if (m === 'insert') { const k = spec.figure ? 'insert.figure' : 'insert.src'; add(k, spec.src); if (spec.then?.src) add(k, spec.then.src); }   // (the picture it dissolves into fills the frame too)
  // art slots hold a path (material, checked) or { art } (generated or a free photograph: checked by imagegen)
  const real = (v) => (typeof v === 'string' ? v : null);
  if (m === 'title') { add(spec.style === 'ink' || spec.style === 'brand' || (spec.blur ?? 0) >= 4 || (spec.dim ?? 0) >= .45 || (spec.ground === 'dark' && (spec.dim ?? 0) >= .2) ? 'title.bg' : 'title.bg.quiet', real(spec.bg));   // (or pushed well back: recap R05, huge white 开源 over a readable tweet dimmed)   // (a page blurred past reading is a texture under the words: cards-S7, a price page under 搞量化)   // (brand washes and blurs its page as ink does)
    add('title.hardware', spec.hardware); add('title.mark', spec.tiles?.src); add('title.mark', spec.card?.mark?.src); }
  if (m === 'person') add('person.photo', spec.photo);
  if (m === 'screen') add('screen.src', spec.src);
  if (m === 'quote') { add('quote.photo', spec.photo); add('quote.presenter', spec.presenter); }
  if (m === 'steps') for (const n of spec.nodes || []) add('steps.nodes.img', real(n.img));
  return out;
}
// Identity (the user, 2026-10-21: the card showed the "deepseek coder" mark for DeepSeek): the words read on a mark must
// be the name the shot calls out. A mark that reads the brand and more ("deepseek coder") is a different mark (a
// sub-product); a brand picture that reads another name is the wrong picture. Latin words only (a Chinese name is set
// by code); a word one letter off (OCR) counts as the same word.
const words = (t) => [...new Set((String(t || '').toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || []))];
const GENERIC_WORDS = new Set(['inc', 'ltd', 'llc', 'corp', 'com', 'the', 'and', 'logo']);
const same = (a, b) => a === b || a.includes(b) || b.includes(a) || (a.length >= 6 && b.length >= 6 && editDistance(a, b) <= 1);
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// what a mark's read text says against the names the shot gives: null when it agrees (or nothing is read), else why.
// `named`: the picture must read one of the names (a brand shot); otherwise only a mark that reads a name and more is
// refused (a card's logo is not named by the card; OCR noise on it, "DMDA" for NVIDIA, is no verdict)
export function identityError(text, names, { named: must = false } = {}) {
  const read = words(text).filter((w) => !GENERIC_WORDS.has(w)), named = words(names.join(' '));
  if (!read.length || !named.length) return null;
  const shared = read.filter((w) => named.some((n) => same(w, n)));
  if (!shared.length) return must ? `reads "${read.join(' ')}", the shot names "${names.filter(Boolean).join(' / ')}"; not the mark named` : null;
  const extra = read.filter((w) => !named.some((n) => same(w, n)));
  if (extra.length) return `reads "${read.join(' ')}", the shot names "${names.filter(Boolean).join(' / ')}"; a different mark (${extra.join(' ')})`;
  return null;
}
export function identityErrors(spec, index) {
  // marks only: a product photograph has its own print on it (the H100 reads "H100 NVLINK"), which names no brand
  const err = [], at = (slot, f, names, o = {}) => { const e = index.files[f]; const why = e?.chars && e.kind === 'logo' ? identityError(e.text, names, o) : null; if (why) err.push(`${slot}: ${path.basename(f).slice(0, 50)} ${why}`); };
  if (spec.module === 'sidecard') for (const c of spec.cards || []) for (const x of [c, ...(c.swap || [])]) { if (typeof x.img === 'string') at('sidecard.cards.img', x.img, [x.title, x.sub]); if (x.logo) at('sidecard.cards.logo', x.logo, [x.title, x.sub, x.brand]); }
  if (spec.module === 'brand' && spec.src) at('brand.src', spec.src, [spec.name], { named: true });
  return err;
}
export function materialErrors(spec, index) {
  const err = [];
  for (const [slot, f] of picks(spec)) err.push(...slotErrors(slot, f, index.files[f], spec.hide || []));
  err.push(...identityErrors(spec, index));
  // a clip must last the shot from its in point, or it freezes on its last frame
  if (spec.module === 'insert' && index.files[spec.src]?.kind === 'footage') { const d = index.files[spec.src].dur || 0, need = spec.end - spec.at + (spec.in || 0); if (d && d + .05 < need) err.push(`insert.src: the clip lasts ${d} s, the shot needs ${need.toFixed(1)} s from its in point; shorten the shot or cut to a second clip`); }
  // the page that curls in may not be the card's own picture again
  if (spec.module === 'sidecard' && spec.curl) for (const c of spec.cards || []) for (const x of [c, ...(c.swap || [])]) if (x.img && spec.curl.src && path.basename(x.img).replace(/^p-|\..*$/g, '') === path.basename(spec.curl.src).replace(/-page|\..*$/g, '')) err.push('sidecard.curl.src: the page repeats the card\'s product');
  return [...new Set(err)];
}

// the index as the director reads it: what each file is, never only its name
export function describe(index) {
  return Object.entries(index.files).map(([f, e]) => ({ file: f, kind: e.kind, size: `${e.w}x${e.h}`, ...(e.dur ? { seconds: e.dur } : {}), ...(e.strip ? { strip: e.strip } : {}), ...(e.chars ? { text: e.text.slice(0, 120) } : {}), ...(e.faces ? { faces: e.faces } : {}), ...(e.marks?.length ? { marks: e.marks } : {}) }));
}
