// Segment: a paragraph of the film edited as one piece (the reference's way, 2026-10-20: "按段落编排镜头、按词切、
// 用真实素材的几种处理、全片一套字和纸"). Instead of one card per sentence, a segment script lists cuts on the words
// of the recording, each cut one of a few treatments of real material, all on the same paper with the same type:
//   presenter  the author, a slow push or a punch-in; big words or tags land on the words that say them
//   footage    a real clip, a second or two, cut on a word
//   print      a real photo laid on the paper as a print, one or two words beside it
//   article    a real page as a clipping: the camera pushes to the sentence being read, a marker runs under it as it
//              is said, and the figure lifts out of the line into big type (pull) — one continuous move
//   collage    several clippings of the same source on the paper, the camera travels across them, a total lands
//   name       a sentence with a blank where the name goes; the logo fills the blank, the name types on
//   word       one big word on the paper (a question, a turn), hit on its syllables
//   chart      a figure that comes back (a callback) with a line that goes up and down with the words, then fades
//   engine     one cut drawn by the style-lab engine (the film's one picture maker, 2026-10-20): any template of
//              engine/director/catalog.js with its params and the facts behind its numbers; rendered by director/
//              make.mjs (its checks: params, readable type, every number a fact with a source) and placed as a clip
//   scene      a stretch of a continuous diagram or 3D scene the engine rendered (chapter.mjs: a morph chapter,
//              { chapter: 'B29', from, to } in the chapter's own seconds, timed onto the cut by its playback rate);
//              the diagram brings its own type, so nothing is laid over it
// Continuity is designed, not hoped for: the pulled figure is the same element that was highlighted, the blank of
// `name` is the box the logo lands in, a `chart` brings back the figure of an earlier `article`.
//
//   projects/<id>/segments/<seg>.json   { range: [t0, t1] (seconds of the recording), look?, cuts: [...] }
//   out/segments/<seg>/                 index.html (HyperFrames), assets/, render.mp4, with-voice.mp4
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as H0 from './house.mjs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { projectPaths, loadProject, sourcePath } from './store.mjs';
import { assertScopeAllows } from './project-scope.mjs';
import { filmLook, HOUSE } from './filmlook.mjs';
import { pythonFor } from './medium.mjs';

// The house look of a segment: ink and one vermilion on a warm paper, everything real printed INTO the paper (grey,
// multiplied: a page's white is the paper's), type on a 120 px grid, left aligned, four sizes (display, figure,
// label, subtitle); the riso pass (print.py riso-light) then gives every paper cut the same screen and grain
// (the colours, faces and print come from the film's look sheet, filmlook.mjs, shared with the chapters and 3D plates)
export const LOOK = { ...HOUSE, marker: 'rgba(224,68,44,0.42)' };
const PAPER_KINDS = ['print', 'article', 'collage', 'name', 'word', 'chart'];
const kicker = (c, L) => (c.kicker ? `<div class="kick"><b>${esc(c.kicker[0])}</b>${esc(c.kicker[1] || '')}</div>` : '');
export const TREATMENTS = ['presenter', 'footage', 'print', 'article', 'collage', 'name', 'word', 'chart', 'scene', 'engine'];
// a scene runs as long as its explanation needs; the other cuts change on the words
const MAX_CUT = { scene: 16, engine: 12 };
// where a rendered chapter is (chapter.mjs bindSlices reads the same file)
export const chapterClip = (cfg, id, gid) => path.join(projectPaths(cfg, id).out, 'chapters', gid, 'out', 'render', `${gid}-clean.mp4`);
const HYPERFRAMES = 'hyperframes@0.8.16';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r3 = (x) => Math.round(x * 1000) / 1000;

// ------------------------------------------------------------------ checks (before anything is built)
export function checkSegment(seg) {
  const errors = [];
  const [t0, t1] = seg.range || [];
  if (!(t1 > t0)) errors.push('range must be [start, end]');
  let prev = t0;
  (seg.cuts || []).forEach((c, i) => {
    const at = `cut ${i + 1} (${c.kind})`;
    if (!TREATMENTS.includes(c.kind)) errors.push(`${at}: unknown treatment`);
    if (Math.abs(c.at - prev) > 0.02) errors.push(`${at}: starts at ${c.at}, the previous cut ends at ${prev} (cuts are contiguous)`);
    if (!(c.end > c.at)) errors.push(`${at}: end must be after at`);
    const max = MAX_CUT[c.kind] || 6;
    if (c.end - c.at > max) errors.push(`${at}: ${r3(c.end - c.at)} s in one cut; a segment cuts on the words (${max} s at most)`);
    if (c.kind === 'engine' && !c.template) errors.push(`${at}: names no engine template`);
    if (c.kind === 'scene') {
      if (!c.chapter) errors.push(`${at}: names no chapter`);
      if (!(c.to > c.from)) errors.push(`${at}: from / to (the chapter's seconds) must be a forward stretch`);
      else { const rate = (c.to - c.from) / (c.end - c.at); if (rate < 0.5 || rate > 2) errors.push(`${at}: plays its chapter at ${r3(rate)}x; keep it within 0.5-2x (re-time the chapter instead)`); }
    }
    if (['footage', 'print', 'article', 'collage', 'name'].includes(c.kind) && !c.src && !(c.pieces || []).length && !c.logo) errors.push(`${at}: names no real material`);
    for (const w of c.words || []) if (w.at < c.at - 0.01 || w.at > c.end) errors.push(`${at}: word "${w.text}" at ${w.at} is outside the cut`);
    prev = c.end;
  });
  if (Math.abs(prev - t1) > 0.02) errors.push(`the cuts end at ${prev}, the range at ${t1}`);
  return errors;
}

// ------------------------------------------------------------------ the recording's words (subtitles, timing)
export function wordLines(cfg, id, [t0, t1]) {
  const project = loadProject(cfg, id);
  const file = sourcePath(cfg, project.voice.words);
  const fix = (s) => Object.entries(project.glossary || {}).reduce((a, [k, v]) => a.split(k).join(v), s);
  return JSON.parse(fs.readFileSync(file, 'utf8')).segments
    .filter((s) => s.endMs / 1000 > t0 && s.startMs / 1000 < t1)
    .map((s) => ({ text: fix(s.text), at: s.startMs / 1000 - t0, end: s.endMs / 1000 - t0 }));
}

// ------------------------------------------------------------------ build
export function buildSegment(cfg, id, segId) {
  assertScopeAllows(loadProject(cfg, id), 'segment');
  const p = projectPaths(cfg, id);
  const seg = JSON.parse(fs.readFileSync(path.join(p.root, 'segments', `${segId}.json`), 'utf8'));
  const errors = checkSegment(seg);
  if (errors.length) throw new Error(`segment ${segId}:\n  ${errors.join('\n  ')}`);
  const L = { ...filmLook(cfg, id), ...(seg.look || {}) };
  const dir = path.join(p.out, 'segments', segId), assets = path.join(dir, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  const asset = (src) => {   // copied in under a short stable name (the page is served from its folder)
    const abs = path.isAbsolute(src) ? src : path.join(cfg.sourceRoot || cfg.repoRoot, src);
    // named by the file and its version, so a re-rendered chapter is copied in again
    const st = fs.statSync(abs), name = crypto.createHash('sha1').update(`${abs}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex').slice(0, 10) + path.extname(abs).toLowerCase();
    if (!fs.existsSync(path.join(assets, name))) fs.copyFileSync(abs, path.join(assets, name));
    return `assets/${name}`;
  };
  const here = path.dirname(new URL(import.meta.url).pathname);
  // the house fonts go into the composition's assets and take over every name declared above them
  const houseFacesFor = (dir) => { const hf = H0.houseFonts(); if (!hf.ready) return ''; const r = H0.houseRules().fonts, put = (f) => { const n = `house-${f.file}`; if (!fs.existsSync(path.join(dir, n))) fs.copyFileSync(f.path, path.join(dir, n)); return `assets/${n}`; };
    const url = Object.fromEntries(hf.all.map((f) => [f.family, put(f)]));
    return [...hf.all.map((f) => [f.family, f.family]), ...Object.entries(r.alias)].map(([name, fam]) => `@font-face{font-family:'${name}';src:url('${url[fam]}');font-weight:100 900}`).join('\n'); };
  for (const [from, to] of [[path.join(here, '../../../public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf'), 'serif.otf'], [path.join(cfg.repoRoot, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), 'gsap.min.js']]) {
    if (!fs.existsSync(path.join(assets, to))) fs.copyFileSync(from, path.join(assets, to));
  }
  const T0 = seg.range[0], DUR = r3(seg.range[1] - seg.range[0]);
  const rel = (t) => r3(t - T0);
  const html = [], js = [];
  let track = 1;
  seg.cuts.forEach((c, i) => {
    const id_ = `c${i}`, a = rel(c.at), e = rel(c.end), d = r3(e - a);
    const show = () => js.push(`tl.set('#${id_}',{autoAlpha:1},${a});tl.set('#${id_}',{autoAlpha:0},${e});`);
    const words = (c.words || []).map((w, k) => wordEl(`${id_}w${k}`, w, L, rel(w.at), js)).join('');
    if (c.kind === 'presenter') {
      const [s0, x0, y0] = c.from || [1, 0, 0], [s1, x1, y1] = c.to || [1.04, 0, 0];
      html.push(`<div id="${id_}" class="cut"><div class="cam" id="${id_}cam"><img src="${asset(c.src)}" class="cover"></div>${c.dim ? `<div class="veil" style="opacity:${c.dim}"></div>` : ''}${words}</div>`);
      js.push(`tl.fromTo('#${id_}cam',{scale:${s0},x:${x0},y:${y0}},{scale:${s1},x:${x1},y:${y1},duration:${d},ease:'none'},${a});`);
      show();
    } else if (c.kind === 'footage') {
      html.push(`<video id="${id_}v" class="clip cover" src="${asset(c.src)}" data-start="${a}" data-duration="${d}" data-media-start="${c.mediaStart || 0}" data-track-index="${track++}" muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${c.filter || 'saturate(0.85)'}${c.zoom ? `;transform:scale(${c.zoom});transform-origin:${c.origin || '50% 0'}` : ''}"></video>`);
      if (words) { html.push(`<div id="${id_}" class="cut over">${words}</div>`); show(); }
    } else if (c.kind === 'print') {
      const left = c.side !== 'right';
      const bx = c.bleedX || 800;
      html.push(`<div id="${id_}" class="cut paper"><div class="photo" style="${left ? `left:${bx}px;right:0` : `left:0;right:${bx}px`}"><img id="${id_}img" src="${asset(c.src)}" class="cover" style="object-position:${c.pos || 'center'}"></div><div class="vrule" style="left:${left ? bx - 10 : 1920 - bx}px"></div>${kicker(c, L)}${words}</div>`);
      js.push(`tl.fromTo('#${id_}img',{scale:1.08,xPercent:${left ? 2 : -2}},{scale:1.0,xPercent:0,duration:${d},ease:'none'},${a});tl.fromTo('#${id_} .photo',{clipPath:'inset(0 0 0 100%)'},{clipPath:'inset(0 0 0 0%)',duration:0.28,ease:'power3.out'},${a});`);
      show();
    } else if (c.kind === 'article') html.push(article(id_, c, a, d, rel, asset, L, js, show, words));
    else if (c.kind === 'collage') html.push(collage(id_, c, a, d, rel, asset, L, js, show, words));
    else if (c.kind === 'name') html.push(nameCut(id_, c, a, d, rel, asset, L, js, show));
    else if (c.kind === 'word') {
      html.push(`<div id="${id_}" class="cut paper">${c.ghost ? `<img class="ghost" src="${asset(c.ghost)}">` : ''}${c.logo ? `<img class="mono" src="${asset(c.logo)}" style="position:absolute;right:120px;top:84px;height:46px">` : ''}${kicker(c, L)}<div class="cam" id="${id_}cam"><div class="big" id="${id_}t" style="top:${c.top || 250}px;font-size:${c.size || 360}px">${esc(c.text)}</div>${c.small ? `<div class="label" style="top:${c.smallTop || 760}px">${esc(c.small)}</div>` : ''}</div>${words}</div>`);
      js.push(`tl.fromTo('#${id_}cam',{scale:1},{scale:1.04,duration:${d},ease:'none'},${a});tl.from('#${id_}t',{x:-60,autoAlpha:0,duration:0.22,ease:'power3.out'},${a});`);
      for (const h of c.hits || []) js.push(`tl.fromTo('#${id_}t',{scale:1.08},{scale:1,duration:0.2,ease:'power2.out'},${rel(h)});`);
      show();
    } else if (c.kind === 'chart') html.push(chart(id_, c, a, d, rel, L, js, show, words));
    else if (c.kind === 'engine') {
      const clip = engineClip(cfg, id, segId, i, c);
      if (!fs.existsSync(clip)) throw new Error(`${id_} engine ${c.template}: not rendered yet; render the segment (renderEngineCuts) first`);
      html.push(`<video id="${id_}v" class="clip cover" src="${asset(clip)}" data-start="${a}" data-duration="${d}" data-media-start="0" data-track-index="${track++}" muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>`);
    }
    else if (c.kind === 'scene') {
      const clip = chapterClip(cfg, id, c.chapter);
      if (!fs.existsSync(clip)) throw new Error(`${id_} scene: chapter ${c.chapter} is not rendered yet (${path.relative(cfg.repoRoot, clip)}); run the chapter step first`);
      // the stretch is cut and re-timed to the cut's length here (a played-back rate below 1 starves the renderer's
      // frame extraction), then played as it is
      const st = fs.statSync(clip), key = crypto.createHash('sha1').update(`${clip}|${st.size}|${Math.round(st.mtimeMs)}|${c.from}|${c.to}|${d}`).digest('hex').slice(0, 10);
      const part = path.join(assets, `scene-${c.chapter}-${key}.mp4`);
      if (!fs.existsSync(part)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(c.from), '-t', String(r3(c.to - c.from)), '-i', clip, '-an', '-vf', `setpts=${r3(d / (c.to - c.from))}*PTS,fps=30`, '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', part]);
      html.push(`<video id="${id_}v" class="clip cover" src="assets/${path.basename(part)}" data-start="${a}" data-duration="${d}" data-media-start="0" data-track-index="${track++}" muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>`);
    }
  });
  // subtitles: one line at a time, from the recording, the same everywhere; none under the house rules (the user
  // adds them in the edit)
  const subs = H0.subtitlesOn() ? wordLines(cfg, id, seg.range) : [];
  const kindAt = (t) => (seg.cuts.find((c) => rel(c.at) <= t + 0.05 && t + 0.05 < rel(c.end)) || {}).kind;
  html.push(`<div id="subs">${subs.map((s, k) => `<div class="sub${[...PAPER_KINDS, 'scene'].includes(kindAt(Math.max(0, s.at))) ? ' onpaper' : ''}" id="s${k}">${esc(s.text)}</div>`).join('')}</div>`);
  subs.forEach((s, k) => js.push(`tl.set('#s${k}',{autoAlpha:1},${r3(Math.max(0, s.at))});tl.set('#s${k}',{autoAlpha:0},${r3(Math.min(DUR, s.end + 0.05))});`));
  const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920, height=1080">
<!-- Generated by recipe-board segment.mjs for ${id}/${segId}. Do not edit; edit segments/${segId}.json. -->
<script src="assets/gsap.min.js"></script>
<style>
@font-face{font-family:'A1 Serif Heavy';src:url('assets/serif.otf');font-weight:900}
@font-face{font-family:'PingFang SC';src:local('PingFang SC')}
@font-face{font-family:'Hiragino Sans GB';src:local('Hiragino Sans GB')}
@font-face{font-family:'DIN Condensed';src:local('DIN Condensed Bold'),local('DIN Condensed')}
${houseFacesFor(assets)}
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:${L.paper}}
#root{position:relative;width:1920px;height:1080px;overflow:hidden;background:${L.paper}}
.cut{position:absolute;inset:0;visibility:hidden;opacity:0;overflow:hidden}
.cut.over{background:transparent}
.paper{background:${L.paper}}
.paper::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.55;mix-blend-mode:multiply;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='4'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.40  0 0 0 0 0.33  0 0 0 0.22 0'/></filter><rect width='400' height='400' filter='url(%23n)'/></svg>")}
.cam{position:absolute;inset:0;transform-origin:50% 50%}
.paper > .cam{background:${L.paper}}
.cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.veil{position:absolute;inset:0;background:#000}
.photo{position:absolute;top:0;bottom:0;overflow:hidden}
.photo img,.clipping img,.ghost{filter:grayscale(1) contrast(1.18) brightness(1.04);mix-blend-mode:multiply}
.vrule{position:absolute;top:0;bottom:0;width:10px;background:${L.accent}}
.clipping{position:absolute;overflow:hidden;mix-blend-mode:multiply}
.clipping img{position:absolute;max-width:none}
.ghost{position:absolute;left:-60px;top:-30px;width:2100px;opacity:.06;filter:grayscale(1) blur(1.2px)!important}
.mono{filter:brightness(0);opacity:.9}
.mark{position:absolute;background:${L.marker};mix-blend-mode:multiply;transform-origin:0 50%}
.big{position:absolute;left:120px;right:120px;top:300px;text-align:left;font-family:${L.num};font-weight:900;color:${L.ink};line-height:.95;letter-spacing:-0.01em}
.small,.label{position:absolute;left:128px;font-family:${L.sans};font-weight:700;font-size:38px;color:${L.ink};letter-spacing:.12em;border-top:4px solid ${L.ink};padding-top:16px;padding-right:40px}
.kick{position:absolute;left:120px;right:120px;top:0;height:112px;box-sizing:border-box;padding-top:66px;background:${L.paper};border-bottom:3px solid ${L.ink};font-family:${L.sans};font-weight:700;font-size:30px;letter-spacing:.16em;color:${L.ink};z-index:6}
.kick b{color:${L.accent};margin-right:26px}
.w{position:absolute;font-family:${L.num};font-weight:900;line-height:1.02;white-space:pre}
.w.tag{font-family:${L.sans};font-weight:700;padding:6px 18px;background:${L.ink};color:${L.paper}}
.w.title{color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.45)}
.w.ink{color:${L.ink}}
.w.red{color:${L.accent}}
.w.tag.red{background:${L.accent};color:${L.paper}}
.w.strike::after{content:"";position:absolute;left:-4%;right:-4%;top:52%;height:.09em;background:${L.accent};transform-origin:0 50%;transform:scaleX(var(--k,1))}
#subs{position:absolute;left:0;right:0;bottom:54px;text-align:center;z-index:50}
.sub{position:absolute;left:50%;transform:translateX(-50%);bottom:0;visibility:hidden;opacity:0;white-space:nowrap;font-family:${L.sans};font-weight:600;font-size:42px;color:#fff;padding:6px 22px;text-shadow:0 2px 10px rgba(0,0,0,.6)}
.sub.onpaper{left:128px;transform:none;color:${L.ink};text-shadow:none;font-weight:700;padding:4px 20px 4px 18px;border-left:8px solid ${L.accent};background:${L.paper}}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1920" data-height="1080">
${html.join('\n')}
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${js.join('\n')}
tl.set({}, {}, ${DUR});
window.__timelines["main"] = tl;
</script></body></html>
`;
  fs.writeFileSync(path.join(dir, 'index.html'), page);
  if (!fs.existsSync(path.join(dir, 'hyperframes.json'))) fs.writeFileSync(path.join(dir, 'hyperframes.json'), JSON.stringify({ paths: { assets: 'assets' }, media: { autoProxy: true } }, null, 2) + '\n');
  return { dir, duration: DUR, cuts: seg.cuts.length, seg };
}

// a word or tag landing on the word that says it
function wordEl(id, w, L, at, js) {
  const style = [`left:${w.x ?? 120}px`, `top:${w.y ?? 120}px`, `font-size:${w.size || 120}px`, w.rot ? `transform:rotate(${w.rot}deg)` : ''].filter(Boolean).join(';');
  js.push(`tl.fromTo('#${id}',{autoAlpha:0,y:${w.style === 'tag' ? 0 : 24},scale:${w.style === 'tag' ? 1.3 : 1}},{autoAlpha:1,y:0,scale:1,duration:${w.style === 'tag' ? 0.12 : 0.22},ease:'power3.out'},${at});`);
  if (w.strikeAt != null) js.push(`tl.fromTo('#${id}',{'--k':0},{'--k':1,duration:0.2,ease:'power2.out'},${at + (w.strikeAt - w.at)});`);
  return `<div id="${id}" class="w ${w.style || 'ink'}${w.strikeAt != null ? ' strike' : ''}" style="${style};--k:0;visibility:hidden">${esc(w.text)}</div>`;
}

// a page as a clipping: crop [x, y, w, h] of the screenshot (px), shown at `scale`; `hl` boxes (screenshot px) are
// marked as they are said; `pull` lifts the figure out of the last marked line into big type
function article(id, c, a, d, rel, asset, L, js, show, words) {
  const [cx, cy, cw, ch] = c.crop, k = c.scale || 1.5;
  const W = cw * k, H = ch * k, left = (1920 - W) / 2, top = c.top ?? (1080 - H) / 2;
  const marks = (c.hl || []).map((h, i) => `<div class="mark" id="${id}m${i}" style="left:${(h.box[0] - cx) * k}px;top:${(h.box[1] - cy) * k}px;width:${h.box[2] * k}px;height:${h.box[3] * k}px"></div>`).join('');
  (c.hl || []).forEach((h, i) => js.push(`tl.fromTo('#${id}m${i}',{scaleX:0},{scaleX:1,duration:${r3(Math.max(0.2, rel(h.end) - rel(h.at)))},ease:'none'},${rel(h.at)});`));
  // the camera: from the whole clipping to the line being read
  const f = c.focus || c.hl?.[0]?.box;
  if (f) {
    const fx = left + (f[0] - cx + f[2] / 2) * k, fy = top + (f[1] - cy + f[3] / 2) * k, s = c.zoom || 1.6;
    js.push(`tl.fromTo('#${id}cam',{scale:1,x:0,y:0},{scale:${s},x:${r3((960 - fx) * s)},y:${r3((540 - fy) * s)},duration:${r3(Math.min(d, c.pushDur || d))},ease:'power1.inOut'},${a});`);
  }
  let pull = '';
  if (c.pull) {
    const pa = rel(c.pull.at);
    pull = `<div class="big" id="${id}p" style="color:${L.accent};font-size:${c.pull.size || 300}px;visibility:hidden">${esc(c.pull.text)}${c.pull.unit ? `<span style="font-size:.4em;color:${L.ink}">${esc(c.pull.unit)}</span>` : ''}</div>${c.pull.small ? `<div class="small" id="${id}ps" style="top:${c.pull.smallTop || 780}px;visibility:hidden">${esc(c.pull.small)}</div>` : ''}`;
    js.push(`tl.to('#${id}cam',{autoAlpha:0.12,filter:'blur(6px)',duration:0.3,ease:'power2.out'},${pa});`);
    js.push(`tl.fromTo('#${id}p',{autoAlpha:0,scale:0.35,y:${c.pull.fromY ?? 60}},{autoAlpha:1,scale:1,y:0,duration:0.42,ease:'power3.out'},${pa});`);
    if (c.pull.small) js.push(`tl.fromTo('#${id}ps',{autoAlpha:0},{autoAlpha:1,duration:0.2},${rel(c.pull.smallAt ?? c.pull.at + 0.4)});`);
  }
  show();
  return `<div id="${id}" class="cut paper">${kicker(c, L)}<div class="cam" id="${id}cam"><div class="clipping" style="left:${left}px;top:${top}px;width:${W}px;height:${H}px"><img src="${asset(c.src)}" style="left:${-cx * k}px;top:${-cy * k}px;width:${(c.srcW || 1920) * k}px">${marks}</div></div>${pull}${words}</div>`;
}

// clippings of one source laid on the paper; the camera travels across them; each figure is marked as the eye passes
function collage(id, c, a, d, rel, asset, L, js, show, words) {
  const pieces = c.pieces.map((p, i) => {
    const [cx, cy, cw, ch] = p.crop, k = p.scale || 1.25;
    const mark = p.hl ? `<div class="mark" id="${id}m${i}" style="left:${(p.hl[0] - cx) * k}px;top:${(p.hl[1] - cy) * k}px;width:${p.hl[2] * k}px;height:${p.hl[3] * k}px"></div>` : '';
    if (p.hl) js.push(`tl.fromTo('#${id}m${i}',{scaleX:0},{scaleX:1,duration:0.35,ease:'none'},${rel(p.at ?? c.at + 0.3 * i)});`);
    js.push(`tl.from('#${id}k${i}',{y:30,autoAlpha:0,duration:0.22,ease:'power2.out'},${rel(p.at ?? c.at + 0.3 * i) - 0.15});`);
    return `<div class="clipping" id="${id}k${i}" style="left:${p.x}px;top:${p.y}px;width:${cw * k}px;height:${ch * k}px;transform:rotate(${p.rot || 0}deg)"><img src="${asset(p.src || c.src)}" style="left:${-cx * k}px;top:${-cy * k}px;width:${(p.srcW || 1920) * k}px">${mark}</div>`;
  }).join('');
  js.push(`tl.fromTo('#${id}cam',{x:${c.pan?.[0] ?? 0}},{x:${c.pan?.[1] ?? -300},duration:${d},ease:'none'},${a});`);
  let big = '';
  if (c.big) {
    big = `<div class="big" id="${id}b" style="color:${L.accent};font-size:${c.big.size || 300}px;visibility:hidden">${esc(c.big.text)}</div>${c.big.small ? `<div class="small" id="${id}bs" style="top:${c.big.smallTop || 790}px;visibility:hidden">${esc(c.big.small)}</div>` : ''}`;
    js.push(`tl.to('#${id}cam',{autoAlpha:0.15,filter:'blur(5px)',duration:0.25},${rel(c.big.at)});tl.fromTo('#${id}b',{autoAlpha:0,scale:1.4},{autoAlpha:1,scale:1,duration:0.25,ease:'power3.out'},${rel(c.big.at)});`);
    if (c.big.small) js.push(`tl.fromTo('#${id}bs',{autoAlpha:0},{autoAlpha:1,duration:0.2},${rel(c.big.at) + 0.3});`);
  }
  show();
  return `<div id="${id}" class="cut paper">${kicker(c, L)}<div class="cam" id="${id}cam">${pieces}</div>${big}${words}</div>`;
}

// "一家 [    ] 的中国公司": the blank is where the logo lands; then the name and its Chinese name type on
function nameCut(id, c, a, d, rel, asset, L, js, show) {
  const [pre, post] = c.sentence.split('□');
  const bw = c.blankW || 620;
  js.push(`tl.fromTo('#${id}s',{autoAlpha:0,y:20},{autoAlpha:1,y:0,duration:0.25,ease:'power2.out'},${a});`);
  js.push(`tl.fromTo('#${id}bl',{scaleX:0},{scaleX:1,duration:0.3,ease:'power2.out'},${a + 0.1});`);
  js.push(`tl.fromTo('#${id}lg',{autoAlpha:0,scale:1.6},{autoAlpha:1,scale:1,duration:0.28,ease:'back.out(1.6)'},${rel(c.logoAt)});`);
  js.push(`tl.to('#${id}row',{y:-120,scale:${c.grow || 1.5},duration:0.5,ease:'power2.inOut'},${rel(c.nameAt)});tl.to(['#${id}pre','#${id}post'],{autoAlpha:0,width:0,marginLeft:-14,marginRight:-14,duration:0.45,ease:'power2.inOut'},${rel(c.nameAt)});`);
  js.push(`tl.fromTo('#${id}n',{autoAlpha:0,clipPath:'inset(0 100% 0 0)'},{autoAlpha:1,clipPath:'inset(0 0% 0 0)',duration:0.45,ease:'power1.out'},${rel(c.nameAt)});`);
  if (c.sub) js.push(`tl.fromTo('#${id}sub',{autoAlpha:0,y:16},{autoAlpha:1,y:0,duration:0.25,ease:'power2.out'},${rel(c.subAt)});`);
  js.push(`tl.fromTo('#${id}cam',{scale:1},{scale:1.04,duration:${d},ease:'none'},${a});`);
  show();
  return `<div id="${id}" class="cut paper">${kicker(c, L)}<div class="cam" id="${id}cam">
<div id="${id}row" style="position:absolute;left:0;right:0;top:400px;display:flex;justify-content:center;align-items:center;gap:28px;font-family:${L.serif};font-weight:900;font-size:110px;color:${L.ink}">
<span id="${id}pre" style="display:inline-block;overflow:hidden;white-space:nowrap">${esc(pre)}</span><span id="${id}s" style="position:relative;display:inline-block;width:${bw}px;height:150px"><span id="${id}bl" style="position:absolute;left:0;right:0;bottom:6px;height:8px;background:${L.ink};transform-origin:0 50%"></span><img id="${id}lg" class="mono" src="${asset(c.logo)}" style="position:absolute;left:0;bottom:22px;width:${bw}px;visibility:hidden"></span><span id="${id}post" style="display:inline-block;overflow:hidden;white-space:nowrap">${esc(post)}</span></div>
<div id="${id}n" style="position:absolute;left:0;right:0;top:520px;text-align:center;font-family:${L.serif};font-weight:900;font-size:190px;color:${L.ink};visibility:hidden">${esc(c.name)}</div>
${c.sub ? `<div id="${id}sub" style="position:absolute;left:0;right:0;top:${c.subTop || 740}px;text-align:center;font-family:${L.serif};font-weight:900;font-size:96px;color:${L.accent};letter-spacing:.3em;visibility:hidden">${esc(c.sub)}</div>` : ''}
</div></div>`;
}

// a figure that comes back, a line that goes up and down with the words, then the figure is forgotten (fades)
function chart(id, c, a, d, rel, L, js, show, words) {
  const pts = c.points || [0.5, 0.2, 0.7, 0.3, 0.85, 0.4, 0.6];
  const W = 1500, H = 360, x0 = 210, y0 = 560;
  const dpath = pts.map((v, i) => `${i ? 'L' : 'M'}${r3(x0 + (W * i) / (pts.length - 1))} ${r3(y0 + H * v)}`).join(' ');
  js.push(`tl.fromTo('#${id}t',{autoAlpha:0,scale:1.3},{autoAlpha:1,scale:1,duration:0.3,ease:'power3.out'},${a});`);
  const times = (c.lineAt || []).map(rel);
  if (times.length) {
    const seg = 1 / Math.max(1, times.length);
    times.forEach((t, i) => js.push(`tl.to('#${id}l',{attr:{'stroke-dashoffset':${r3(1 - seg * (i + 1))}},duration:${r3(Math.max(0.12, (times[i + 1] ?? t + 0.3) - t))},ease:'power1.out'},${t});`));
  }
  if (c.fadeAt != null) js.push(`tl.to(['#${id}t','#${id}g'],{autoAlpha:0.12,filter:'blur(8px)',duration:${r3(Math.max(0.3, e(c) - rel(c.fadeAt)))},ease:'power1.in'},${rel(c.fadeAt)});`);
  function e(cc) { return rel(cc.end); }
  show();
  const grid = [0, 1, 2, 3].map((g) => `<line x1="${x0}" x2="${x0 + W}" y1="${y0 + (H * g) / 3}" y2="${y0 + (H * g) / 3}" stroke="${L.ink}" stroke-opacity="${g === 3 ? 0.9 : 0.18}" stroke-width="${g === 3 ? 4 : 2}"/>`).join('') + pts.map((_, i) => `<line x1="${r3(x0 + (W * i) / (pts.length - 1))}" x2="${r3(x0 + (W * i) / (pts.length - 1))}" y1="${y0 + H}" y2="${y0 + H + 18}" stroke="${L.ink}" stroke-width="3"/>`).join('');
  return `<div id="${id}" class="cut paper">${kicker(c, L)}<div class="big" id="${id}t" style="top:${c.top || 190}px;font-size:${c.size || 260}px;color:${L.accent}">${esc(c.text)}${c.unit ? `<span style="font-size:.4em;color:${L.ink}">${esc(c.unit)}</span>` : ''}</div>
<svg id="${id}g" width="1920" height="1080" style="position:absolute;inset:0">${grid}<path id="${id}l" d="${dpath}" fill="none" stroke="${L.ink}" stroke-width="7" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>${words}</div>`;
}

// ------------------------------------------------------------------ render (HyperFrames), then the recording under it
// the engine cuts of a segment, as one shot list for director/make.mjs (its cache keeps unchanged cuts); spans are
// the cuts' own lengths laid end to end (the shot list's timeline, not the recording's)
const engineDir = (cfg, id, segId) => path.join(projectPaths(cfg, id).out, 'segments', segId, 'engine');
export const engineClip = (cfg, id, segId, i, c) => path.join(engineDir(cfg, id, segId), 'out', 'render', `c${i}-${c.medium || 'clean'}.mp4`);
export function engineShotList(cfg, id, seg, segId, { catalog = null, faces = null } = {}) {
  const L = filmLook(cfg, id);
  let t = 0;
  const shots = [];
  seg.cuts.forEach((c, i) => {
    if (c.kind !== 'engine') return;
    const d = r3(c.end - c.at);
    const params = { ...(c.params || {}) };
    // the film's look sheet goes to every template that takes one (params.look: the filmLook() object as it is)
    if (catalog?.[c.template]?.params && 'look' in catalog[c.template].params && !params.look) params.look = L;
    // a presenter cut gets the face boxes of its picture (screen fractions), so its tags keep off the face
    if (c.template === 'presenter' && params.src && !params.avoid && faces) params.avoid = faces(params.src).map((b) => [b[0] * 1920, b[1] * 1080, b[2] * 1920, b[3] * 1080].map(Math.round));
    shots.push({ id: `c${i}`, template: c.template, medium: c.medium || 'clean', params, span: [r3(t), r3(t + d)], text: c.say || '', facts: c.facts || [], ...(c.window ? { window: c.window } : {}), why: `segment ${segId} cut ${i + 1}` });
    t += d;
  });
  return { contract: 'A1ShotList/v1', id: `${id}-${segId}-engine`, line: `${id} ${segId}: engine cuts`, total: r3(t), shots, look: L.world || null };
}
export async function renderEngineCuts(cfg, id, segId, { fps = 30 } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'segment');
  const seg = JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'segments', `${segId}.json`), 'utf8'));
  const engine = path.join(cfg.sourceRoot || cfg.repoRoot, 'work/recipe-board-v1/style-lab/engine');
  const { CATALOG } = await import(pathToFileURL(path.join(engine, 'director', 'catalog.js')).href);
  const { frameFaces } = await import('./design-check.mjs');
  const root = cfg.sourceRoot || cfg.repoRoot;
  const list = engineShotList(cfg, id, seg, segId, { catalog: CATALOG, faces: (u) => frameFaces(path.join(root, String(u).replace(/^\//, ''))) });
  if (!list.shots.length) return { made: 0 };
  fs.mkdirSync(engineDir(cfg, id, segId), { recursive: true });
  const file = path.join(engineDir(cfg, id, segId), 'shotlist.json');
  fs.writeFileSync(file, JSON.stringify(list, null, 1) + '\n');
  const { make } = await import(pathToFileURL(path.join(engine, 'director', 'make.mjs')).href);
  await make(file, { fps });
  return { made: list.shots.length };
}

export async function renderSegment(cfg, id, segId, { fps = 30 } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'segment');
  await renderEngineCuts(cfg, id, segId, { fps });
  const { dir, duration, seg } = buildSegment(cfg, id, segId);
  const out = path.join(dir, 'render.mp4');
  execFileSync('npx', ['--yes', HYPERFRAMES, 'render', dir, '-q', 'high', '--fps', String(fps), '-o', out], { stdio: 'inherit', env: { ...process.env, PRODUCER_BROWSER_GPU_MODE: 'hardware' } });
  // the paper cuts go through the house print (print.py stream, the same screens on every frame); the presenter and
  // footage stay as they are
  const L = { ...filmLook(cfg, id), ...(seg.look || {}) };
  let film = out;
  if (L.print) {
    const spans = seg.cuts.filter((c) => PAPER_KINDS.includes(c.kind)).map((c) => `${Math.round((c.at - seg.range[0]) * fps)}:${Math.round((c.end - seg.range[0]) * fps)}`).join(',');
    film = path.join(dir, 'printed.mp4');
    const py = pythonFor(cfg), script = path.join(path.dirname(new URL(import.meta.url).pathname), 'print.py');
    execFileSync('bash', ['-c', `ffmpeg -loglevel error -i "${out}" -f rawvideo -pix_fmt rgb24 - | "${py}" "${script}" stream 1920 1080 --preset ${L.print} --spans ${spans} | ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgb24 -s 1920x1080 -r ${fps} -i - -c:v libx264 -crf 17 -pix_fmt yuv420p "${film}"`], { stdio: 'inherit', maxBuffer: 1 << 26 });
  }
  const project = loadProject(cfg, id), audio = sourcePath(cfg, project.voice.audio);
  const withVoice = path.join(dir, 'with-voice.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', film, '-ss', String(seg.range[0]), '-t', String(duration), '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', withVoice]);
  return { dir, render: out, withVoice, duration };
}
