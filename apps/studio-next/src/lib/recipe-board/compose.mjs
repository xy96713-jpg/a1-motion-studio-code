// Generic recipe-card -> HTML composer. Knows slot kinds and named treatments, never shot ids.
import { focusTransform } from './screen.mjs';
import { worldFrame } from './world-terminal.mjs';
import { displayFrame } from './display.mjs';
import { plateCss } from './labels.mjs';
import { frameFaces, titleClearOfFaces, darkBand, regionLuma, quietBand, quietSpot } from './design-check.mjs';
import { cameraFrame, cameraCss, baseFor, isPlane } from './camera.mjs';
import { applyVariant } from './variants.mjs';
import { chartSvg, chatHtml, diagramHtml, windowChrome, calloutHtml, COMPONENT_CSS, componentCss } from './components.mjs';

const W = 1920, H = 1080;

// Project display fonts (apps/studio-next/public/a1-editorial-fonts). Static renders load them by
// file URL; motion builds copy them next to the composition and pass a relative fontBase.
// (the directory in a variable: a literal directory URL is resolved by the web bundler as a file, test 'bundler-resolved')
const FONT_REL = '../../../public/a1-editorial-fonts/';
const FONT_DIR = new URL(FONT_REL, import.meta.url).href;
export const FONT_FILES = { 'A1 Serif Heavy': 'SourceHanSerifCN-Heavy.otf', 'A1 Sans Heavy': 'SourceHanSansCN-Heavy.otf', 'A1 Pixel': 'fusion-pixel.ttf' };
// OS fonts in the fallback stacks are declared with local() so renderers resolve them explicitly.
const LOCAL_FONTS = ['PingFang SC', 'Hiragino Sans GB', 'Songti SC', 'STSong', 'Noto Serif CJK SC'];
// the house fonts (house.mjs, user decision 2026-10-21) are declared after these and take over every name above
import { houseFonts as _houseFonts, houseFontCss as _houseFontCss, subtitlesOn as _subtitlesOn, traditionalOn as _traditionalOn, hantDeep as _hantDeep, houseCoverScript as _houseCoverScript } from './house.mjs';
const fontFaces = (base) => [
  ...Object.entries(FONT_FILES).map(([name, file]) => `@font-face{font-family:'${name}';src:url('${base}${file}');font-weight:900}`),
  // with the house fonts in place every name above is a house font: no local() face is declared (a Traditional-only
  // character, B22's 條, fell through the house face to local('Songti SC'), which a headless browser cannot load)
  ...(_houseFonts().ready ? [] : LOCAL_FONTS.map((name) => `@font-face{font-family:'${name}';src:local('${name}')}`)),
  ...(_houseFonts().ready ? [_houseFontCss()] : []),
].join('\n');

const BASE_FAMILIES = {
  display: `'A1 Serif Heavy', 'Songti SC', serif`,
  sansHeavy: `'A1 Sans Heavy', 'PingFang SC', sans-serif`,
  serif: `'Songti SC', 'STSong', 'Noto Serif CJK SC', serif`,
  heavy: `'Songti SC', 'Hiragino Sans GB', 'PingFang SC', sans-serif`,
  sans: `'PingFang SC', 'Hiragino Sans GB', 'Helvetica Neue', sans-serif`,
  condensed: `'Avenir Next Condensed', 'PingFang SC', sans-serif`,
  mono: `'SF Mono', 'Menlo', 'PingFang SC', monospace`,
  pixel: `'A1 Pixel', 'PingFang SC', monospace`,
};

// Active font stacks: the base set, overridden per render by the theme's `fonts` (set in composeParts).
let FAMILIES = BASE_FAMILIES;
// Motion builds place real <video> for footage fills; stills use the poster frame.
let VIDEO_MODE = false;

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

function mirrorSlot(s) {
  const [x, y, w, h] = s.box;
  const flip = { left: 'right', right: 'left' };
  return { ...s, box: [1 - x - w, y, w, h], align: flip[s.align] || s.align, fade: flip[s.fade] || s.fade };
}

const boxCss = ([x, y, w, h]) => `left:${x * W}px;top:${y * H}px;width:${w * W}px;height:${h * H}px;`;
const color = (tokens, key, fallback) => tokens[key] || key || fallback;

export const monoFill = (tokens, fill) => fill.bw ?? !!(tokens.photoMono && (fill.asset || fill.video) && !fill.chapter && !fill.recall && !fill.stage);
function imageSlot(name, s, r, fill, tokens) {
  let fade = s.fade ? `-webkit-mask-image:linear-gradient(to ${s.fade === 'left' ? 'right' : 'left'}, transparent 0, #000 35%);` : '';
  const frame = s.frame === 'paper' ? 'box-shadow:0 10px 40px rgba(0,0,0,.35);transform:rotate(-1.2deg);' : '';
  // a picture slot with nothing for it yet draws nothing (the card stands as type, its TODO tag says what is
  // missing): a dashed box with the slot's name read as a broken frame (B31 after its wrong photo was taken back)
  if (r.level === 'empty') return '';
  if (r.level === 'text') {
    return `<div class="slot ph" data-slot="${name}" style="${boxCss(s.box)}color:${tokens.fg};border-color:${tokens.muted}"><span>${esc(r.text)}</span></div>`;
  }
  if (fill.tint && r.mime === 'image/svg+xml') {
    // Monochrome vector logo: tint through a mask, then optional wordmark text beside it.
    return `<div class="slot logo" data-slot="${name}" style="${boxCss(s.box)}">
      <div style="height:100%;aspect-ratio:1;background:${fill.tint};-webkit-mask:url('${r.url}') center/contain no-repeat"></div>
      ${fill.text ? `<span style="color:${fill.tint}">${esc(fill.text)}</span>` : ''}</div>`;
  }
  // a light mark on a paper slot is printed dark (it would vanish)
  const dark = r.lightMark && s.onLight ? 'brightness(0.16)' : '';
  const filter = (s.filter && s.filter !== 'none') || dark ? `filter:${[s.filter && s.filter !== 'none' ? s.filter : '', dark].filter(Boolean).join(' ')};` : '';
  if (s.frame === 'window') {
    return `<div class="slot window" data-slot="${name}" style="${boxCss(s.box)}">${windowChrome({ title: fill.title, tokens })}
      <div class="media"><img src="${r.url}" style="width:100%;height:100%;object-fit:${s.fit || 'cover'};object-position:${fill.position || 'top left'};${filter}"></div></div>`;
  }
  // Footage treatments: darken (0-1) and blur (px) stack on the card's own filter; push is a slow
  // scale-up over the scene, applied by the motion runtime ([data-push]).
  // zoom crops in (e.g. past a broadcaster's corner logo); blur needs a little to hide soft edges.
  const zoom = Math.max(fill.zoom || 1, fill.blur ? 1.04 : 1);
  // A cutout stands on the slot's bottom edge, uncropped, and is never edge-faded.
  const fit = fill.fit || (r.cutout ? 'contain' : s.fit || 'cover');
  const pos = fill.position || (r.cutout ? 'center bottom' : 'center');
  if (r.cutout) fade = '';
  // real photos and footage take the film's treatment: a world with one accent sets them in black and white
  // (tokens.photoMono, look.mjs), so a found clip sits in the film's tone (B25's Baiyin street came in full colour)
  // the film's own diagrams and its 3D plates keep their accent (B22's red chromosome came out grey: the plate is the film's,
  // not a found clip, and B23 opens on that red one)
  // (black and white graded as film is, blacks deep and lights clear: a flat grey read as a dull plate, 1:12 of the suez
  // white model, the user 2026-10-27: 背景和字体设计感觉很一般)
  const bw = monoFill(tokens, fill);
  const look = [filter.replace(/^filter:|;$/g, ''), fill.darken ? `brightness(${1 - fill.darken})` : '', fill.blur ? `blur(${fill.blur}px)` : '', bw ? `grayscale(1) contrast(1.32) brightness(1.05)${tokens.photoTone === 'duotone' ? ' sepia(.45)' : ''}` : ''].filter(Boolean).join(' ');
  const media = `style="width:100%;height:100%;object-fit:${fit};object-position:${pos};${look ? `filter:${look};` : ''}${fade}${zoom > 1 ? `transform:scale(${zoom});transform-origin:${pos};` : ''}"`;
  // Offset outlines behind a cutout: solid copies of its silhouette, shifted and grown (e.g. red + yellow).
  const outlines = (r.cutout ? fill.outline || [] : []).map((o, i) => `<div class="ol" data-dx="${o.dx || 0}" data-dy="${o.dy || 0}" style="position:absolute;inset:0;background:${o.color};-webkit-mask:url('${r.maskUrl}') ${pos}/${fit} no-repeat;transform-origin:50% 100%;translate:${o.dx || 0}px ${o.dy || 0}px;scale:${o.grow || 1.03};z-index:${-1 - i}"></div>`).join('');
  // halftone (a printed prop): the picture as a dot screen over a faint copy of itself
  // only on a generated prop: a real logo or photo stays as it is (a dot screen made logos unreadable)
  const ht = fill.halftone ?? (fill.asset || fill.video || fill.screenshot ? 0 : s.halftone);
  const dots = ht ? `-webkit-mask-image:radial-gradient(circle,#000 52%,transparent 60%);-webkit-mask-size:${ht}px ${ht}px;` : '';
  const el = ht && !(r.video && VIDEO_MODE)
    ? `<img src="${r.url}" ${media.replace('style="', 'style="position:absolute;inset:0;opacity:.38;')}><img src="${r.url}" ${media.replace('style="', `style="position:absolute;inset:0;${dots}`)}>`
    : r.video && VIDEO_MODE
    // Poster still underneath: if the clip is shorter than the scene, the frame holds instead of going blank.
    ? `<img src="${r.url}" ${media.replace('style="', 'style="position:absolute;inset:0;')}><video src="${r.video.url}" data-media-in="${r.video.in}"${r.video.out != null ? ` data-media-out="${r.video.out}"` : ''} muted playsinline ${media.replace('style="', 'style="position:absolute;inset:0;')}></video>`
    : `<img src="${r.url}" ${media}>`;
  // a tilted prop is a generated object; a real logo or page sits straight
  const rot = fill.rotate ?? (fill.asset || fill.video || fill.screenshot ? 0 : s.rotate);
  const turn = rot ? `transform:rotate(${rot}deg);` : '';
  // a cut-out object filling the whole frame (a product shot on white, materials.mjs studioShot) stands
  // in a dark, lit studio with a floor shadow, like a still life: never on a white page under white subtitles
  const studio = name === 'background' && r.cutout && fill.asset && s.box?.[2] >= 0.99 && s.box?.[3] >= 0.99;
  const stage = studio ? 'background:radial-gradient(ellipse 62% 58% at 50% 46%,#5b5750 0%,#2a2825 52%,#0d0d0c 100%);' : '';
  const shadow = studio ? 'filter:brightness(1.18) contrast(1.05) drop-shadow(0 38px 40px rgba(0,0,0,.65)) drop-shadow(0 6px 10px rgba(0,0,0,.5));' : '';
  // a real web page captured for a full-frame slot is set as a page on a card, laid back a little in space on the film's
  // dark ground — never a page pasted flat over the whole frame (L74, the user 2026-10-25: 网页平贴; the banana film's B17)
  const pageCard = name === 'background' && s.box?.[2] >= 0.99 && s.box?.[3] >= 0.99 && /(-window\.png|\/page-crops\/|\/captures\/)/.test(decodeURIComponent(r.url || ''));
  if (pageCard) return `<div class="slot pageground" style="${boxCss([0, 0, 1, 1])}background:radial-gradient(ellipse 70% 62% at 50% 44%,color-mix(in srgb,${tokens.bg} 80%,#fff),${tokens.bg} 70%)"></div>
  <div class="slot pagecard" data-slot="${name}" style="${boxCss([0.08, 0.06, 0.84, 0.8])}border-radius:16px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55),0 4px 12px rgba(0,0,0,.35);transform:perspective(1800px) rotateX(7deg) rotateY(-5deg);transform-origin:50% 60%">
    <div class="media"${fill.push ? ` data-push="${fill.push}"` : ''} style="position:relative;width:100%;height:100%">${el}</div></div>`;
  return `<div class="slot" data-slot="${name}" style="${boxCss(s.box)}${frame}${turn}${stage}overflow:${s.overflow ? 'visible' : 'hidden'}">
    <div class="media"${fill.push ? ` data-push="${fill.push}"` : ''} style="position:relative;width:100%;height:100%;${studio ? 'transform:scale(.82);' + shadow : ''}${outlines ? 'isolation:isolate;' : ''}">${outlines}${el}</div>${s.veil ? `<div class="ov" style="background:${s.veil}"></div>` : ''}</div>`;
}

// Rough advance width in em: CJK/fullwidth ~1, latin/digits ~0.58. Used to shrink titles that would overflow their box.
const emWidth = (str) => [...String(str || '')].reduce((w, c) => w + (/[\u2e80-\uffff]/.test(c) ? 1 : 0.58), 0);

function titleHtml(s, fill, tokensIn, scale) {
  const tokens = fill.ink ? { ...tokensIn, fg: fill.ink } : tokensIn;
  // "\n" in a title is a deliberate line break (break by meaning, not wherever the box ends).
  const lines = String(fill.text || '').split('\n');
  // a leading * is a small superscript mark (the reference's card titles)
  // [[words]] in a title are set larger and heavier (the reference's size contrast: 为什么要做[[又难]])
  // emScale: how much larger [[words]] are (1.42; a press quote sets its keyword far larger, 快钱 at 466 s)
  const emScale = s.emScale || 1.42;
  const star = (l) => esc(l).replace(/^\*/, '<sup style="font-size:.42em;vertical-align:.95em;margin-right:.04em">*</sup>').replace(/\[\[(.+?)\]\]/g, `<span class="em" style="font-size:${emScale}em;font-weight:900;line-height:1">$1</span>`);
  const text = lines.length > 1 ? lines.map((l) => `<span style="display:block">${star(l)}</span>`).join('') : star(fill.text);
  const skew = fill.skew ?? s.skew;
  // Single-line titles shrink to fit; wrapping titles (slot `wrap`) keep the type size and break
  // into balanced lines, shrinking only if the lines would overflow the box height.
  const boxW = s.box[2] * W * 0.96;
  // [[emphasis]] counts at its set size, the brackets not at all
  const lineWidth = (l) => emWidth(l.replace(/\[\[(.+?)\]\]/g, '')) + emWidth((l.match(/\[\[(.+?)\]\]/g) || []).join('').replace(/[\[\]]/g, '')) * emScale;
  const unit = Math.max(...lines.map(lineWidth)) * (1 + (s.letterSpacing || 0)) * (s.scaleX || 1);
  let size;
  if (s.wrap) {
    size = fill.size || scale.title;
    while (size > 24 && (lines.length > 1 ? unit * size > boxW || lines.length * size * 1.15 > s.box[3] * H : Math.ceil((unit * size) / boxW) * size * 1.15 > s.box[3] * H)) size -= 4;
  } else {
    size = Math.floor(Math.min(fill.size || scale.title, boxW / Math.max(1, unit), s.box[3] * H / (s.scaleY || 1)));
  }
  const tf = [skew ? `skewX(${skew}deg)` : '', s.scaleX ? `scaleX(${s.scaleX})` : '', s.scaleY ? `scaleY(${s.scaleY})` : ''].filter(Boolean).join(' ');
  const base = `font-family:${FAMILIES[s.family] || FAMILIES.serif};font-weight:${s.weight || 800};font-size:${size}px;letter-spacing:${s.letterSpacing || 0}em;${s.wrap ? 'white-space:normal;text-wrap:balance;line-height:1.12;' : 'white-space:nowrap;'}${tf ? `transform:${tf};` : ''}`;
  const sub = fill.sub ? `<div class="sub" style="font-size:${scale.titleSub}px;color:${tokens.fg}">${esc(fill.sub)}</div>` : '';
  // the hero mechanisms (Gawx Art, the user 2026-10-27, taken apart: the title is a block that owns the frame, every line
  // forced to the same width; a hairline of small serif sits in its gap; the photo under it is low-key, so cream words
  // read with nothing behind them). 'block' runs the word across the width; 'column' stands it down one side.
  // One run of text (a span per character let each pick its own face), one face, one size, no dress.
  const mech = s.hero || fill.hero;
  if (mech === 'block' || mech === 'column') {
    const chars = [...String(fill.text || '').replace(/\s+/g, '')], n = Math.max(1, chars.length), bw = s.box[2] * W, bh = s.box[3] * H;
    const sz = Math.floor(mech === 'block' ? Math.min((bw / n) * 0.96, bh) : Math.min((bh / n) * 0.96, bw));
    const lay = mech === 'block' ? 'width:100%;text-align:justify;text-align-last:justify;text-justify:inter-character;line-height:.9' : `writing-mode:vertical-rl;height:${Math.round(bh)}px;text-align:justify;text-align-last:justify;text-justify:inter-character;line-height:.9;margin:0 auto`;
    const micro = fill.micro ? `<div class="micro" style="position:absolute;${mech === 'block' ? 'left:0;bottom:100%;margin-bottom:.6em' : 'right:100%;top:0;margin-right:.8em;writing-mode:vertical-rl'};font-family:${FAMILIES.serif};font-weight:400;font-size:34px;letter-spacing:.06em;color:${tokens.fg};opacity:.78;white-space:nowrap">${esc(fill.micro)}</div>` : '';
    return `<div style="position:relative;${mech === 'block' ? 'width:100%' : `height:${Math.round(bh)}px`}">${micro}<div class="t" data-hero="${mech}" style="font-family:${FAMILIES[s.family] || FAMILIES.serif};font-weight:${s.weight || 800};font-size:${sz}px;color:${tokens.fg};white-space:nowrap;${lay}">${esc(chars.join(''))}</div></div>`;
  }
  switch (s.treatment) {
    case 'display': {
      // Editorial display: heavy condensed serif, red keyword, tiny italic English caption underneath.
      const hl = fill.highlight ? esc(fill.highlight) : '';
      const body = hl && text.includes(hl) ? text.replace(hl, `<span style="color:${tokens.accent}">${hl}</span>`) : text;
      const origin = { center: 'center', right: 'right' }[s.align] || 'left';
      // enStyle 'sans': the English line is a readable bold label (people, products), not a tiny caption.
      const enCss = s.enStyle === 'sans'
        ? `font-size:${scale.titleSub}px;font-family:${FAMILIES.sans};font-style:var(--en-style,normal);font-weight:700;color:${tokens.enInk || tokens.fg}`
        : `font-size:${Math.round(scale.titleSub * 0.62)}px;color:${tokens.muted}`;
      const en = fill.sub ? `<div class="en" style="${enCss}">${esc(fill.sub)}</div>` : '';
      return `<div class="t display" style="${base}font-family:${FAMILIES.display};color:${tokens.fg};transform-origin:${origin} center">${body}</div>${en}`;
    }
    case 'marker': {
      // Marker highlight under part of the headline (news pages).
      const hl = fill.highlight ? esc(fill.highlight) : '';
      const body = hl && text.includes(hl) ? text.replace(hl, `<span class="mk" style="padding:0 .08em;background-image:linear-gradient(transparent var(--marker-from,52%), ${tokens.accent} var(--marker-from,52%), ${tokens.accent} var(--marker-to,92%), transparent var(--marker-to,92%))">${hl}</span>`) : text;
      return `<div class="t" style="${base}color:${tokens.fg}">${body}</div>${sub}`;
    }
    case 'metal':
      return `<div class="t metal" style="${base}">${text}</div>${sub}`;
    case 'chrome':
      // Y2K chrome lettering: a mirrored horizon in the face, a dark outline, a hard drop shadow
      // the fill sits on an inner box as tall as the glyphs (the line box of .t is shorter than a heavy face)
      return `<div class="t" style="${base}"><span class="chrome-type">${text}</span></div>${sub}`;
    case 'ink':
      return `<div class="t ink" style="${base}color:${tokens.fg}">${text}</div>${sub}`;
    case 'brush-plate':
      return `<div class="plate"><div class="t" style="${base}color:${tokens.fg}">${text}</div></div>
        ${fill.sub ? `<div class="plate sm"><div class="t" style="${base}font-size:${scale.titleSub}px;color:${tokens.fg}">${esc(fill.sub)}</div></div>` : ''}`;
    case 'invert-highlight': {
      const hl = fill.highlight ? esc(fill.highlight) : '';
      const body = hl && text.includes(hl) ? text.replace(hl, `<span class="inv" style="background:${tokens.accent};color:${tokens.onAccent || '#111'}">${hl}</span>`) : text;
      return `<div class="t" style="${base}color:${tokens.accent}">${body}</div>${sub}`;
    }
    case 'print':
      return `<div class="t print" style="${base}color:${tokens.fg}">${text}<span class="caps" style="font-size:${scale.titleSub}px;color:${tokens.muted}">${esc(fill.sub || '')}</span></div>`;
    case 'pressquote':
      // a quote set like a press still (466 s): heavy condensed serif, white fading to grey, a red/blue
      // fringe, a large blurred grey mark opening it and a white mark closing it
      return `<div class="pq2" style="font-size:${size}px"><span class="pq2-open">“</span><div class="t" style="${base}line-height:1.08;background:linear-gradient(180deg,#fbfaf7 0,#d9d7d2 70%,#a9a7a2 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(-3px 0 0 rgba(255,40,70,.35)) drop-shadow(3px 0 0 rgba(40,190,255,.35))">${text}</div><span class="pq2-close">”</span></div>${sub}`;
    case 'quote':
      return `<div class="qmark" style="color:${tokens.accent}">“</div><div class="t" style="${base}color:${tokens.fg};line-height:1.25">${text}</div>${sub}`;
    default:
      return `<div class="t" style="${base}color:${tokens.fg}">${text}</div>${sub}`;
  }
}

function inlineMarks(str, tokens, style) {
  if (style === 'fill') {
    // Solid light blocks with dark text (news highlight), plus the usual {{bar}}.
    return esc(str)
      .replace(/\[\[(.+?)\]\]/g, `<span class="box fill" style="background:${tokens.markFill || '#eeeeec'};color:${tokens.markInk || '#151515'}">$1</span>`)
      .replace(/\{\{(.+?)\}\}/g, `<span class="bar" style="background:${tokens.highlight || tokens.accent}">$1</span>`);
  }
  if (style === 'color') {
    return esc(str)
      .replace(/\[\[(.+?)\]\]/g, `<span class="hl" style="color:${tokens.warm || tokens.accent}">$1</span>`)
      .replace(/\{\{(.+?)\}\}/g, `<span class="hl" style="color:${tokens.accent}">$1</span>`);
  }
  return esc(str)
    .replace(/\[\[(.+?)\]\]/g, `<span class="box" style="border-color:${tokens.accent};color:${tokens.accent}">$1</span>`)
    .replace(/\{\{(.+?)\}\}/g, `<span class="bar" style="background:${tokens.highlight || tokens.accent}">$1</span>`);
}

function dataHtml(s, fill, tokens, scale, resolved = {}) {
  const fam = FAMILIES[s.family] || FAMILIES.sans;
  const size = scale.data;
  switch (s.kind) {
    case 'table': {
      const head = (fill.header || []).map((h, i) => `<th style="text-align:${i ? 'center' : 'left'}">${esc(h)}</th>`).join('');
      // Value cells carry their column index so motion can light up one column; plainValues starts
      // them in the body colour instead of the accent.
      const hl = new Set(fill.highlightCols || []);
      const valueColor = (i) => ((s.plainValues || fill.plainValues) && !hl.has(i) ? tokens.fg : tokens.accent);
      // cells 'bar' (the reference's spec tables, 178 s): small grey names, each value on a coloured bar
      if (s.cells === 'bar') {
        const bar = color(tokens, s.barColor, tokens.accent);
        const n = (fill.rows || []).length || 1;
        const fsb = Math.floor(Math.min(size, (s.box[3] * H) / n / 1.5));
        return `<div class="spec" style="font-family:${fam};font-size:${fsb}px">${(fill.rows || []).map((r) => `<div class="spec-r"><span class="k" style="color:${tokens.muted}">${esc(r[0])}</span><span class="v" style="background:linear-gradient(90deg,${bar} 0,${bar}cc 55%,${bar}00 100%);color:${s.barInk || '#ece9ff'}">${esc(r.slice(1).join(' '))}</span></div>`).join('')}</div>`;
      }
      const rows = (fill.rows || []).map((r, ri) => `<tr${ri === fill.hotRow ? ` class="hot" style="color:${tokens.accent}"` : ''}>${r.map((c, i) => (i ? `<td class="v" data-col="${i}" style="color:${ri === fill.hotRow ? tokens.accent : valueColor(i)};text-align:center">${esc(c)}</td>` : `<td class="k">${esc(c)}</td>`)).join('')}</tr>`).join('');
      // Fit the rows into the box height and the widest cell of each column into its width (cells
      // never wrap; a long Chinese cell shrinks the whole table instead of spilling out of it).
      const cols = Math.max(0, ...(fill.rows || []).map((r) => r.length));
      const colEm = Array.from({ length: cols }, (_, i) => Math.max(...(fill.rows || []).map((r) => emWidth(r[i]))));
      const widthFit = cols ? (s.box[2] * W) / (colEm.reduce((a, b) => a + b, 0) + cols * 0.9) : size;
      const fs = Math.floor(Math.min(size, (s.box[3] * H) / ((fill.rows || []).length + 1) / 1.15, widthFit));
      return `<table style="font-family:${fam};font-size:${fs}px;color:${tokens.fg};white-space:nowrap"><thead style="font-size:${scale.titleSub}px;color:${tokens.muted}"><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    case 'paragraphs': {
      // focus: indices that stay lit; the rest dims (the hold state; motion dims them at cue `focus`).
      // ghost: [before, after] unreadable context lines drawn as blurred bars, never invented text.
      const dim = fill.dim ?? 0.18;
      const lit = (i) => !fill.focus || fill.focus.includes(i);
      // Ghost lines read as small out-of-focus body text: thin, faint, line-spaced like the real lines.
      const ghost = (n, from) => Array.from({ length: n }, (_, k) => `<div class="ghost-line" data-dim="${dim * 1.4}" style="flex-shrink:0;height:${Math.round(size * 0.3)}px;width:${[97, 92, 99, 86, 95, 78, 93, 64][(from + k) % 8]}%;margin:${Math.round(size * 0.55)}px 0;background:${tokens.fg};opacity:${dim * 1.4};filter:blur(1.5px);border-radius:2px"></div>`).join('');
      // dimRest: inside a lit paragraph, only the marked words stay bright.
      const dimRest = (html) => html.split(/(<span class="(?:box|bar|hl)[^>]*>.*?<\/span>)/).map((part) => (!part || part.startsWith('<span class="') ? part : `<span data-dim="${dim * 2}" style="opacity:${dim * 2}">${part}</span>`)).join('');
      const [before = 0, after = 0] = fill.ghost || [];
      return ghost(before, 0) + (fill.paragraphs || []).map((p, i) => `<p${lit(i) ? '' : ` data-dim="${dim}"`} style="font-family:${FAMILIES.sans};font-size:${size}px;line-height:${s.lineHeight || 1.6};color:${tokens.fg}${lit(i) ? '' : `;opacity:${dim}`}">${lit(i) && fill.dimRest && /\[\[|\{\{/.test(p) ? dimRest(inlineMarks(p, tokens, s.marks)) : inlineMarks(p, tokens, s.marks)}</p>`).join('') + ghost(after, before);
    }
    case 'mechanism': {
      // a 3D mechanism diagram (motion-mechanism.browser.js): the page mounts it into this box; a still
      // shows its last state, a motion page drives it from the timeline
      const theme = { fg: tokens.fg, accent: tokens.accent, muted: tokens.muted, font: FAMILIES.sans, ...(tokens.node ? { node: tokens.node } : {}), ...(tokens.unit ? { unit: tokens.unit } : {}) };
      return `<div class="mech" data-duration="__MECH_DURATION__" data-spec="${esc(JSON.stringify(fill.mechanism || {}))}" data-theme="${esc(JSON.stringify(theme))}" style="position:absolute;inset:0"></div>`;
    }
    case 'figures':
      return (fill.figures || []).map((f) => `<div class="fig" style="color:${tokens.fg}"><span style="font-size:${scale.annotation}px">${esc(f.lead || '')}</span><b style="font-size:${size}px;font-family:${FAMILIES.serif}">${esc(f.value)}</b><span style="font-size:${scale.annotation}px">${esc(f.unit || '')}</span></div>`).join('');
    case 'chart':
      return chartSvg({ w: s.box[2] * W, h: s.box[3] * H, fill, tokens, fonts: FAMILIES, size });
    case 'chat':
      return chatHtml({ fill, tokens, fonts: FAMILIES, size, avatars: resolved.__avatars || {}, marks: (t) => inlineMarks(t, tokens, s.marks) });
    case 'diagram':
      return diagramHtml({ w: s.box[2] * W, h: s.box[3] * H, fill, tokens, fonts: FAMILIES, size });
    case 'lines': {
      // Quote stack: each line has its own scale (relative to the data size) and colour.
      const mark = fill.mark ? `<div class="qmark2" style="color:${tokens.muted}">${esc(fill.mark)}</div>` : '';
      return `<div class="qlines">${(fill.lines || []).map((l) => `<div class="ql" style="font-family:${l.family === 'sans' ? FAMILIES.sans : FAMILIES.display};font-size:${Math.round(size * (l.size || 1))}px;color:${color(tokens, l.color, tokens.fg)};margin-left:${l.indent || 0}em;${l.scaleX ? `transform:scaleX(${l.scaleX});transform-origin:left center;` : ''}">${esc(l.text)}</div>`).join('')}${mark}</div>`;
    }
    case 'bullets':
      // tags: short facts as a centred row of paper strips (under a stamp title), not a list on top of the page
      // (at most three, each a short fact: a sentence is the subtitle's job and would shrink to unreadable)
      if (s.layout === 'tags') return `<ul class="btags" style="font-family:${FAMILIES.sans};font-size:${size}px;color:${color(tokens, s.color, tokens.fg)}">${tagItems(fill.items).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      return `<ul style="font-family:${FAMILIES.sans};font-size:${size}px;color:${color(tokens, s.color, tokens.fg)}">${(fill.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    default:
      return `<div style="font-size:${size}px;color:${tokens.fg}">${esc(fill.text || '')}</div>`;
  }
}

// A still shows the phrase on screen at its start, as the film does (short timed phrases, motion.mjs):
// the first clause, cut at the last point within 15 characters that is not inside a number or a word.
export function stillSubtitle(text, max = 15) {
  const first = String(text).replace(/\s+/g, ' ').trim().split(/[，。！？；,!?;]/).find((x) => x.trim()) || '';
  const cs = [...first.trim()];
  if (cs.length <= max) return cs.join('');
  // a natural break near the limit (after a particle, before a pronoun or conjunction), else the limit
  let k = max;
  for (let j = max; j >= max - 5; j--) if ('的了是就在和也都把被着过'.includes(cs[j - 1]) || '这那但而所我你他她它'.includes(cs[j])) { k = j; break; }
  while (k > 4 && /[0-9a-z%.]/i.test(cs[k - 1]) && /[0-9a-z%.]/i.test(cs[k] || '')) k--;
  return cs.slice(0, k).join('');
}
// What of a source credit may be on screen (user decision 2026-10-17): no address, no domain, no capture
// time; a creator's or outlet's plain name may stay. The full source stays in the receipt.
export function screenCredit(text) {
  if (!text) return '';
  const rest = String(text)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/截图于\s*\S+/g, '')
    .replace(/(?:^|[\s·：:])(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/gi, ' ')
    .replace(/\s*·\s*(?=·|$)/g, '').replace(/\s+/g, ' ').trim();
  // internal names (a repo asset, a library entry) are not a source anyone would read
  if (/repo asset|library|已核实/i.test(rest)) return '';
  return /^素材[:：]?\s*[·]?\s*$/.test(rest) || !rest ? '' : rest.replace(/[·\s]+$/, '');
}
export const TAG_MAX = 10;
export const tagItems = (items) => (items || []).map(String).filter((i) => [...i].length <= TAG_MAX).slice(0, 3);

const OVERLAYS = {
  vignette: '<div class="ov" style="background:radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.55) 100%)"></div>',
  'vignette-light': '<div class="ov" style="background:radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,.22) 100%)"></div>',
  grain: `<div class="ov" style="opacity:.10;mix-blend-mode:overlay;background-image:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='300' height='300' filter='url(%23n)'/></svg>&quot;)"></div>`,
  chromatic: '<div class="ov" style="box-shadow:inset 6px 0 18px rgba(255,0,60,.18), inset -6px 0 18px rgba(0,200,255,.18)"></div>',
  grid: '', // drawn on the stage background so it sits under content
  // a fine dot screen over the whole frame (the printed-on-screen texture of explainer films; film look themes)
  dots: '<div class="ov" style="opacity:.55;background-image:radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.3px);background-size:6px 6px"></div>',
  // Cool gray paper lit from the centre, corners pushed dark: the base of the editorial style.
  // Light lives on the stage background (under content); only the corner fall-off sits on top.
  paper: '<div class="ov" style="background:radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,.42) 100%)"></div>',
  // thin guide lines across the frame (the reference's quote stills): one across, one down
  rulers: '<div class="ov" style="background:linear-gradient(rgba(255,255,255,.14),rgba(255,255,255,.14)) 0 44%/100% 1px no-repeat,linear-gradient(rgba(255,255,255,.12),rgba(255,255,255,.12)) 13% 0/1px 100% no-repeat"></div>',
  // Y2K hairlines: a thin inner frame and crosshair marks at the corners (registration marks, not art)
  'y2k-frame': `<div class="ov" style="mix-blend-mode:difference;opacity:.5;background-image:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' fill='none' stroke='white' stroke-width='1.5'><rect x='36' y='36' width='1848' height='1008'/><path d='M36 76h40M56 56v40M1844 76h40M1864 56v40M36 1004h40M56 984v40M1844 1004h40M1864 984v40'/><circle cx='56' cy='76' r='9'/><circle cx='1864' cy='1004' r='9'/></svg>&quot;)"></div>`,
  'edge-blur': '<div class="ov" style="backdrop-filter:blur(2.2px);-webkit-mask-image:radial-gradient(ellipse at center, transparent 62%, #000 100%)"></div>',
};

// Fit every piece of text to its own slot, measured in the browser (the estimate in titleHtml counts
// em widths; a real font, tracking or a [[larger]] word can still spill): shrink in small steps until
// it fits the slot's width and height. Same script in stills and motion pages, run before anything moves.
// the house fonts first (house.mjs houseCoverScript): a text its font lacks a character of goes to a house font that
// has them all, before the text is fitted to its box
export const FIT_TEXT = `(window.__houseCover&&window.__houseCover());(function(){for(const slot of document.querySelectorAll('.slot.flex[data-slot]')){if(slot.dataset.slot==='background'||slot.querySelector('.mech'))continue;const b0=slot.getBoundingClientRect();const pr=document.createElement('i');pr.style.cssText='position:absolute;left:0;top:0;width:1000px;height:1px;visibility:hidden';(slot.parentElement||document.body).appendChild(pr);const q=(pr.getBoundingClientRect().width/1000)||1;pr.remove();const b=q===1?b0:{width:b0.width/q,height:b0.height/q};for(const el of [...slot.children].filter(e=>e.textContent.trim())){el.style.zoom='';for(let n=0;n<3;n++){const r0=el.getBoundingClientRect();const r=q===1?r0:{width:r0.width/q,height:r0.height/q};const rg=document.createRange();rg.selectNodeContents(el);const tr0=rg.getBoundingClientRect();const tr=q===1?tr0:{width:tr0.width/q,height:tr0.height/q};const sw=el.querySelector('[data-split]')||el.dataset.split?0:el.scrollWidth*(+el.style.zoom||1);const kw=b.width/Math.max(r.width,tr.width,sw,1),kh=b.height>40?b.height/Math.max(r.height,1):1;const k=Math.min(kw,kh);if(k>=0.995)break;el.style.zoom=String((+el.style.zoom||1)*k*0.985);el.dataset.fit=el.style.zoom}}}const groups={};for(const slot of document.querySelectorAll('[data-fit-group]'))(groups[slot.dataset.fitGroup]||=[]).push(slot);for(const g of Object.values(groups)){const els=g.flatMap(s=>[...s.children].filter(e=>e.textContent.trim()));const z=Math.min(...els.map(e=>+e.style.zoom||1));for(const e of els){e.style.zoom=String(z);e.dataset.fit=e.style.zoom}}})();`;

// Three.js and the mechanism module for a still (file:// page; the still browser allows file modules).
export const THREE_MODULE = new URL('../../../../../remotion-renderer/node_modules/three/build/three.module.js', import.meta.url).href;
export const MECHANISM_MODULE = new URL('./motion-mechanism.browser.js', import.meta.url).href;
const mechanismHead = (content) => (!content.includes('class="mech"') ? '' : `<script type="importmap">{"imports":{"three":"${THREE_MODULE}"}}</script>
<script type="module">import { mountMechanism } from '${MECHANISM_MODULE}';
for (const el of document.querySelectorAll('.mech')) mountMechanism({ root: el, spec: JSON.parse(el.dataset.spec), theme: JSON.parse(el.dataset.theme), duration: Number(el.dataset.duration) || 6, still: true });
document.body.dataset.mechReady = '1';</script>`);

// focus (a read web page): the still shows the camera's read pose, the sentence centred (screen.mjs)
export function composeHtml(args) {
  const p = composeParts(args);
  return `<!doctype html><html><head><meta charset="utf-8">${_houseFonts().ready ? `<script>${_houseCoverScript()}</script>` : ''}<style>
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${p.bg}}
${p.css}
</style></head><body><div class="stage">${args.focus && !p.ownsFocus ? `<div style="position:absolute;inset:0;${focusTransform(args.focus, W, H)}">${p.content}${(args.focus.boxes || []).map(([x, y, w, h]) => `<i style="position:absolute;left:${x * W}px;top:${y * H}px;width:${w * W}px;height:${h * H}px;background:#fff;mix-blend-mode:difference"></i>`).join('')}</div>` : p.content}${p.overlays}${p.subtitle}${p.todo}</div><script>document.fonts.ready.then(()=>{${FIT_TEXT}document.body.dataset.fitted='1'})</script>${mechanismHead(p.content)}</body></html>`;
}

// A read sentence as a pull quote: a clean start ("…" when the capture began mid-sentence), cut near 150
// characters at a word, figures in bold; sized by length. In motion it comes in after the push and the
// highlight sweep (CSS, seekable: finite, delayed, fill both).
export function quoteText(raw, max = 150) {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  const head = /^[a-z(,;]/.test(t) ? '…' : '';
  if (t.length > max) { const cut = t.lastIndexOf(' ', max); t = t.slice(0, cut > max * 0.6 ? cut : max).replace(/[,;:]$/, '') + '…'; }
  return head + t;
}
function pullQuote(raw, paper, pushEnd) {
  const t = quoteText(raw);
  const size = Math.round(Math.max(40, Math.min(66, 64 * Math.sqrt(110 / Math.max(40, t.length)))));
  const body = esc(t).replace(/(\d[\d,.]*\s*(%|percent|billion|million|trillion)?)/g, '<b>$1</b>');
  const p = Array.isArray(paper) ? paper.join(',') : '246,246,244';
  const anim = VIDEO_MODE ? `animation:pullIn .45s cubic-bezier(.2,.7,.2,1) ${((pushEnd ?? 1.2) + 0.55).toFixed(2)}s both;` : '';
  const dimAnim = VIDEO_MODE ? `animation:pullDim .45s ease-out ${((pushEnd ?? 1.2) + 0.55).toFixed(2)}s both;` : '';
  return `<style>@keyframes pullIn{from{opacity:0;transform:translate(-50%,-50%) translateY(26px)}to{opacity:1;transform:translate(-50%,-50%)}}@keyframes pullDim{from{opacity:0}to{opacity:1}}</style>
<div class="pull-dim" style="position:absolute;inset:0;background:rgba(${p},.62);${dimAnim}"></div>
<div class="pull" style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:1440px;padding:44px 56px 46px 64px;background:rgb(${p});border-left:12px solid #111;box-shadow:0 24px 60px rgba(0,0,0,.28),0 4px 12px rgba(0,0,0,.18);${anim}">
<div style="font:500 ${size}px/1.28 ${FAMILIES.serif};color:#141414;letter-spacing:-.005em;font-variant-numeric:lining-nums">${body}</div></div>`;
}

// The ground colour's brightness (0–255) from #rrggbb or rgb(); unknown reads as dark.
export function groundLuma(c) {
  const hex = /^#([0-9a-f]{6})$/i.exec(String(c || '').trim());
  const rgb = hex ? [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) : (/rgba?\(([^)]*)\)/.exec(String(c || ''))?.[1].split(',').slice(0, 3).map(Number));
  return rgb && rgb.length === 3 && rgb.every(Number.isFinite) ? 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] : 0;
}

// Pieces of one composed frame, so motion builds can wrap the content in a camera and time it.
export function composeParts(args) {
  // house rule (2026-10-21): the words set on the card are Traditional (house.mjs; paths and page phrases kept)
  if (_traditionalOn()) args = { ...args, shot: _hantDeep(args.shot), resolved: args.resolved && _hantDeep(args.resolved) };
  FAMILIES = { ...BASE_FAMILIES, ...(args.recipe.fonts || {}) };
  VIDEO_MODE = !!args.video;
  try {
    return composeWith(args);
  } finally {
    FAMILIES = BASE_FAMILIES;
    VIDEO_MODE = false;
  }
}

function composeWith({ recipe: base0, shot, resolved, degraded, fontBase = FONT_DIR, focus = null }) {
  // the shot's variant of the card (variants.mjs): mirrored or with slots moved
  const base = shot.variant ? applyVariant(base0, shot.variant) : base0;
  // A slot may move when another slot is filled too (`boxWith: { <slot>: box }`), e.g. an article's
  // body drops below the headline when both are on the same frame.
  const recipe = { ...base, slots: Object.fromEntries(Object.entries(base.slots).map(([name, s]) => {
    // `boxWithFact`: the same when the other slot holds real material (a photo is not covered by type)
    const real = (o) => { const v = shot.slots?.[o]; return !!(v && (v.asset || v.video || v.screenshot)); };
    const alt = Object.entries(s.boxWithFact || {}).find(([other]) => real(other)) || Object.entries(s.boxWith || {}).find(([other]) => shot.slots?.[other]);
    return [name, alt ? { ...s, box: alt[1] } : s];
  })) };
  // a backdrop is veiled and blurred to set a big title on it; with no title (a revision emptied it) the
  // veil only hides the page (hupo B61 came out a blurred page with nothing over it), so the page shows plain
  const bgSlot = recipe.slots.background;
  if (bgSlot && recipe.slots.title && (bgSlot.veil || bgSlot.filter) && !String(shot.slots?.title?.text || '').trim()) {
    const { veil, filter, ...plain } = bgSlot;
    recipe.slots.background = plain;
  }
  // a poster card's tag sits in the dark band its art actually drew (design-check.mjs darkBand)
  if (recipe.layoutId === 'poster-pair') {
    for (const [card, tag] of [['leftCard', 'leftTag'], ['rightCard', 'rightTag']]) {
      const url = resolved?.[card]?.url, cs = recipe.slots[card], ts = recipe.slots[tag];
      if (!cs || !ts || !url?.startsWith('file://')) continue;
      const band = darkBand(decodeURIComponent(url.slice(7)));
      if (!band) continue;
      const [bx0, by0, bx1, by1, iw, ih] = band;
      // the art is contained in its box: its drawn rect, then the band in frame 0–1
      const [cx, cy, cw, ch] = cs.box, k = Math.min((cw * W) / iw, (ch * H) / ih);
      const ox = cx * W + (cw * W - iw * k) / 2, oy = cy * H + (ch * H - ih * k) / 2;
      const x0 = (ox + bx0 * iw * k) / W, x1 = (ox + bx1 * iw * k) / W, y0 = (oy + by0 * ih * k) / H, y1 = (oy + by1 * ih * k) / H;
      recipe.slots[tag] = { ...ts, box: [x0 + 0.01, y0, x1 - x0 - 0.02, y1 - y0], align: 'center', valign: 'center' };
    }
  }
  // a big title over a photo keeps off the faces in it (design-check.mjs)
  const bgUrl = resolved?.background?.url;
  if (recipe.layoutId === 'title-hero-over-photo' && recipe.slots.title && bgUrl?.startsWith('file://') && !/\.(mp4|mov|webm)$/i.test(bgUrl)) {
    const moved = titleClearOfFaces(recipe.slots.title.box, frameFaces(decodeURIComponent(bgUrl.slice(7))));
    // beside a face the title has a narrow column: it breaks into balanced lines and keeps its size
    // (on one line it shrank to fit: 十五分钟 "字号偏小，缩在左侧", clara B26)
    if (moved) recipe.slots.title = { ...recipe.slots.title, box: moved.box, align: moved.align, ...(moved.align !== 'center' ? { wrap: true } : {}) };
    // and off its subject: the words' own footprint (a short title, centred in its box) moves to the quietest place of the
    // photo when the middle is twice as busy (design-check.mjs quietSpot; suez B01 / B11 2026-10-27)
    else if (!['poster', 'grid'].includes((typeof shot.slots?.title === 'object' && shot.slots.title.hero) || '')) {
      const ts = recipe.slots.title, tt = shot.slots?.title, n = [...String(typeof tt === 'string' ? tt : tt?.text || '')].length || 4, fw = Math.min(ts.box[2], 0.12 + 0.07 * n), fh = Math.min(ts.box[3], 0.3);
      const mid = [ts.box[0] + (ts.box[2] - fw) / 2, ts.box[1] + (ts.box[3] - fh) / 2, fw, fh], q = quietSpot(decodeURIComponent(bgUrl.slice(7)), [fw, fh], mid);
      if (q && q.here > 1.6 * q.detail + 0.004) recipe.slots.title = { ...ts, box: q.box, align: 'center', valign: 'center' };
    }
  }
  // the hero mechanism the film's plan gave this title (heroPlan): the photo full-bleed and graded low-key (deep blacks,
  // the lights kept), the words cream on it; a block across the width in the photo's quieter band, or a column down its
  // quieter side; the photo's credit becomes the hairline of small serif beside the words (no corner credit then)
  const heroOf = (() => { const t = shot.slots?.title; return recipe.layoutId === 'title-hero-over-photo' && t && typeof t === 'object' ? t.hero : null; })();
  let heroMicro = null;
  if ((heroOf === 'block' || heroOf === 'column') && recipe.slots.title && recipe.slots.background && bgUrl?.startsWith('file://') && !/\.(mp4|mov|webm)$/i.test(bgUrl)) {
    const file = decodeURIComponent(bgUrl.slice(7));
    recipe.slots.background = { ...recipe.slots.background, filter: 'brightness(.62) contrast(1.18)' };
    if (heroOf === 'block') { const q = quietBand(file, [0.04, 0.4, 0.92, 0.4], { y0: 0.12, y1: 0.84 }); recipe.slots.title = { ...recipe.slots.title, box: [0.04, q ? Math.min(Math.max(q.y, 0.16), 0.44) : 0.4, 0.92, 0.4], align: 'center', valign: 'center', hero: 'block' }; }
    else { const L = quietSpot(file, [0.2, 0.8], null, { x0: 0.04, x1: 0.5, y0: 0.06, y1: 0.86 }), R = quietSpot(file, [0.2, 0.8], null, { x0: 0.5, x1: 0.96, y0: 0.06, y1: 0.86 }); const left = !R || (L && L.detail <= R.detail); recipe.slots.title = { ...recipe.slots.title, box: [left ? 0.08 : 0.72, 0.06, 0.2, 0.8], align: 'center', valign: 'center', hero: 'column' }; }
    heroMicro = String(screenCredit(shot.credit) || '').replace(/^素材[:：]\s*/, '') || null;
    recipe.tokens = { ...recipe.tokens, fg: '#efe9d8', __hero: true };
  }
  // a stamp over a page stands where the page is quiet, not across its own headline (design-check.mjs quietBand): when
  // the title's band carries twice the detail of the quietest band, it moves there (B17 2026-10-27)
  if (recipe.layoutId === 'stamp-over-evidence' && recipe.slots.title && bgUrl?.startsWith('file://') && !/\.(mp4|mov|webm)$/i.test(bgUrl)) {
    const ts = recipe.slots.title, q = quietBand(decodeURIComponent(bgUrl.slice(7)), [ts.box[0], ts.box[1] + ts.box[3] * 0.3, ts.box[2], ts.box[3] * 0.4]);
    if (q && q.here > 2 * q.detail + 0.004) { const h = Math.min(ts.box[3], 0.3), y = Math.max(0.05, Math.min(q.y + ts.box[3] * 0.2 - h / 2, 0.8 - h)); recipe.slots.title = { ...ts, box: [ts.box[0], y, ts.box[2], h] }; }   // the box shrinks to the quiet band: centred in a tall box the words came back down
  }
  // words over a real page or photo take their ink from the picture under them: a light ground gets the dark ink, a
  // dark one the light (design-check.mjs regionLuma; the banana film's B17 stamped white type on a light web page)
  const tokens = (() => { const t = recipe.tokens, bg = resolved?.background?.url, ts = recipe.slots?.title;
    if (t.__hero) return t;
    if (!ts || !bg?.startsWith('file://') || /\.(mp4|mov|webm)$/i.test(bg)) return t;
    const l = regionLuma(decodeURIComponent(bg.slice(7)), ts.box), lum = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return 0.5; const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    if (l == null) return t;
    if (l > 0.55 && lum(t.fg) > 0.5) return { ...t, fg: t.inkOnLight || '#141414' };
    if (l < 0.35 && lum(t.fg) < 0.5) return { ...t, fg: t.inkOnDark || '#f2f0ea' };
    return t; })();
  const scale = recipe.typeScale;
  const parts = [];
  const paperLight = (recipe.overlays || []).includes('paper')
    ? `background-image:radial-gradient(ellipse 72% 66% at 50% 45%, ${tokens.paperLight || '#efefee'} 0, ${tokens.bg} 72%);`
    : '';
  const grid = (recipe.overlays || []).includes('grid')
    ? `background-image:linear-gradient(${tokens.grid} 1px,transparent 1px),linear-gradient(90deg,${tokens.grid} 1px,transparent 1px);background-size:48px 48px;`
    : '';

  if (shot.backdrop && resolved.__backdrop) {
    parts.push(imageSlot('backdrop', { kind: 'image', box: [0, 0, 1, 1] }, resolved.__backdrop, shot.backdrop, tokens));
  }
  // Layers: extra image layers (generated props, real cut-outs) with their own box and motion.
  // z 'back' sits under the card's slots, 'front' (default) above them.
  const layer = (l, i) => {
    const r = resolved[`__layer${i}`];
    if (!r || r.level === 'empty') return '';
    const html = imageSlot(`layer${i}`, { kind: 'image', box: l.box, fit: l.fit || 'contain' }, r, { ...l.fill, fit: l.fill?.fit || 'contain', position: l.fill?.position || 'center' }, tokens);
    const m = l.motion || {};
    return html.replace('<div class="slot"', `<div class="slot layer" data-prop="${i}"${m.in != null ? ` data-in="${m.in}"` : ''}${m.from ? ` data-from="${m.from}"` : ''}${m.float ? ` data-float="${m.float}"` : ''}${m.reveal ? ` data-reveal="${m.reveal}"` : ''}${l.rotate ? ` data-rot="${l.rotate}"` : ''}`)
      .replace('style="', `style="${l.rotate ? `rotate:${l.rotate}deg;` : ''}`);
  };
  (shot.layers || []).forEach((l, i) => { if ((l.z || 'front') === 'back') parts.push(layer(l, i)); });
  // small words on a full-frame photograph get a label of their own (the reference's red tags): set straight on the
  // photo they sat on the things it shows (paperclip-138-full B05 壓了很多年 and B06 答案 on the row of palm prints;
  // cardgeometry.mjs busyErrors). Display type (90 px and up) stands on the photo as it is
  // a chip's plate: the film's colour on a paper prop of the label family (labels.mjs), one member a slot
  const slotNames = Object.keys(recipe.slots || {}), chipBg = (s) => (s.chip === 'tag' ? tokens.chipBg || tokens.accent || tokens.fg : tokens.chipBg || tokens.fg);
  const labelCss = (name) => { const s = recipe.slots[name]; return plateCss(resolved.__labels, slotNames.indexOf(name), chipBg(s?.chip ? s : { chip: 'tag' })); };
  const onPhoto = Object.entries(recipe.slots || {}).some(([k, x]) => x.kind === 'image' && x.frame !== 'screen' && x.box?.[2] >= 0.99 && x.box?.[3] >= 0.99 && (shot.slots?.[k]?.asset || shot.slots?.[k]?.gen || shot.slots?.[k]?.art));
  for (const [name, raw] of Object.entries(recipe.slots)) {
    const s0 = shot.mirror ? mirrorSlot(raw) : raw;
    const s = s0.kind === 'text' && !s0.chip && !s0.air && !s0.paper && !s0.tab && onPhoto && (scale[s0.role] || scale.annotation) < 90 ? { ...s0, chip: 'tag' } : s0;
    // a text slot written as a plain string reads as its text ("残血显卡" rather than { text })
    const given = shot.slots?.[name];
    const fill = typeof given === 'string' && s.kind !== 'image' ? { text: given } : given;
    if (s.kind === 'image') {
      if (!fill) continue; // unfilled image slot falls back to the recipe's bg token, not a TODO
      if (s.optional && !resolved[name]) continue; // optional, nothing real to show
      // a slot's default framing for real pictures (a portrait on the face); the shot's own settings win
      let framed = s.defaults && fill && (fill.asset || fill.video) ? { ...s.defaults, ...fill } : fill || {};
      // a plain presenter beat alternates two camera sizes, like an interview shot on two cameras: every
      // other beat is a closer frame on the face (a still stand-in reads less frozen; real footage too)
      if (recipe.layoutId === 'presenter-plain' && name === 'background' && framed.zoom == null && framed.position == null && (+String(shot.shotId).replace(/\D/g, '') + (shot.sceneIndex || 0)) % 2 === 0) framed = { ...framed, zoom: 1.32, position: '50% 26%' };
      parts.push(imageSlot(name, s, resolved[name], framed, tokens));
    } else if (s.kind === 'panel' && fill?.art && resolved[name]) {
      // A panel painted with generated art (a card prop): the art fills the panel box exactly
      // (trimmed transparent art), the shadow comes from its alpha.
      parts.push(imageSlot(name, { kind: 'image', box: s.box, filter: s.shadow ? 'drop-shadow(0 18px 28px rgba(0,0,0,.45))' : s.filter }, resolved[name], { fit: fill.fit || 'fill', position: 'center' }, tokens));
    } else if (s.kind === 'panel' && s.metal) {
      // a brushed-metal card with a visible edge on its left and a glassy sheen (the reference's product
      // cards); tinted by fill.color (red = banned, green = allowed), neutral steel by default
      const c0 = fill?.color || tokens[s.fill] || s.fill || '#dcdcdc';
      parts.push(`<div class="slot panel metal" data-slot="${name}" style="${boxCss(s.box)}border-radius:6px;background:linear-gradient(115deg,rgba(255,255,255,.28) 0 18%,transparent 34% 70%,rgba(255,255,255,.12) 84%),repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 1px,transparent 1px 3px),linear-gradient(170deg,color-mix(in srgb,${c0} 88%,#fff),color-mix(in srgb,${c0} 72%,#000));border:2px solid rgba(255,255,255,.55);box-shadow:-18px 8px 0 -3px color-mix(in srgb,${c0} 45%,#000),0 26px 60px rgba(0,0,0,.5)"></div>`);
    } else if (s.kind === 'panel') {
      parts.push(`<div class="slot panel" data-slot="${name}" style="${boxCss(s.box)}background:${fill?.color || tokens[s.fill] || s.fill};${s.shadow ? 'box-shadow:0 18px 50px rgba(0,0,0,.45);' : ''}${s.border ? `outline:6px solid ${s.border};` : ''}"></div>`);
    } else if (s.kind === 'callout') {
      // Points into an image slot: `at` is normalized within that slot's box.
      const target = shot.mirror ? mirrorSlot(recipe.slots[s.target]) : recipe.slots[s.target];
      if (fill?.at && target && resolved[s.target]?.url) {
        const lens = s.lens ? { ...s.lens, ...(fill.lensAt ? { at: fill.lensAt } : {}) } : null;
        const box = target.frame === 'window' ? [target.box[0], target.box[1] + 52 / H, target.box[2], target.box[3] - 52 / H] : target.box;
        parts.push(calloutHtml({ at: fill.at, targetBox: box, lens, label: fill.label, tokens, stage: { w: W, h: H }, imageUrl: resolved[s.target].url }));
      }
    } else if (s.kind === 'ghost-text') {
      if (fill?.text) parts.push(`<div class="slot ghost" style="${boxCss(s.box)}font-size:${scale.data}px;color:${color(tokens, s.color)}">${esc(fill.text)}</div>`);
    } else if (fill) {
      const align = `text-align:${s.align || 'left'};justify-content:${{ top: 'flex-start', center: 'center', bottom: 'flex-end' }[s.valign || 'top']};align-items:${{ left: 'flex-start', center: 'center', right: 'flex-end' }[s.align || 'left']};`;
      let inner;
      // a shot may restyle its title (fill.style: family, treatment, scale …) without a new card
      if (s.kind === 'title') inner = titleHtml({ ...s, ...(fill.style || {}) }, heroMicro && name === 'title' ? { ...fill, micro: heroMicro } : fill, tokens, scale);
      // scan paper (the reference's tags): a printed strip with scan lines and a rough edge, heavy serif,
      // [[keywords]] in red, two thin corner marks; the text decides its own quotes
      // air quote (the reference, 222 s): light sans floating over the plate, an italic English line and a
      // hairline under it
      else if (s.kind === 'text' && s.air) inner = `<div class="pq" style="font-size:${scale[s.role] || scale.annotation}px"><div class="pq-zh">${esc(fill.text)}</div>${fill.sub ? `<div class="pq-en">${esc(fill.sub)}</div>` : ''}<i class="pq-rule"></i></div>`;
      else if (s.kind === 'text' && s.paper === 'scan') inner = `<div class="ptag2w" style="font-size:${scale[s.role] || scale.annotation}px"><div class="ptag2"><span class="ptag2-t">${esc(fill.text).replace(/\[\[(.+?)\]\]/g, '<span class="hl">$1</span>')}</span></div><i class="cm a"></i><i class="cm b"></i></div>`;
      else if (s.kind === 'text' && s.paper) inner = `<div class="ptagp" style="font-size:${scale[s.role] || scale.annotation}px">“${esc(fill.text)}”</div>`;
      else if (s.kind === 'text' && s.tab) inner = `<div class="tab" style="font-size:${scale[s.role] || scale.annotation}px">${esc(fill.text)}</div>`;
      else if (s.kind === 'text') inner = `<div class="${s.chip ? 'chip' : ''}"${s.chip && labelCss(name) ? ` data-plate="label"` : ''} style="font-family:${FAMILIES[s.family] || FAMILIES.sans};font-size:${scale[s.role] || scale.annotation}px;color:${fill.ink || color(tokens, s.color, tokens.fg)};${s.italic ? 'font-style:italic;' : ''}${s.pre ? `white-space:pre-line;line-height:${s.lineHeight || 1.1};` : ''}${s.chip ? `${labelCss(name) ? 'position:relative;isolation:isolate;background:none;' : `background:${chipBg(s)};`}color:${s.chip === 'tag' ? tokens.chipFg || '#fff' : tokens.chipFg || tokens.card || '#fff'};` : ''}${s.weight ? `font-weight:${s.weight};` : ''}${s.tracking != null ? `letter-spacing:${s.tracking}em;` : ''}">${s.chip && labelCss(name) ? `<i class="lab" style="position:absolute;inset:-.14em -.32em;z-index:-1;${labelCss(name)}"></i>` : ''}${s.pre ? String(fill.text).split('\n').map((l) => `<div class="line" style="white-space:nowrap">${inlineMarks(l, tokens, s.marks || 'color')}</div>`).join('') : inlineMarks(String(fill.text), tokens, s.marks || 'color')}${fill.sub && !(s.subLatinOnly && /[\u4e00-\u9fff]/.test(fill.sub)) ? `<div class="tsub" style="font-size:${/[\u4e00-\u9fff]/.test(fill.sub) ? 0.62 : 0.32}em;opacity:.75;letter-spacing:.02em;margin-top:.2em">${esc(fill.sub)}</div>` : ''}</div>`;
      else inner = dataHtml(s, fill?.layout === 'steps' ? { ...fill, frameTitle: shot.slots?.title?.text || '' } : fill, tokens, scale, resolved);
      // Generated plate behind the text (torn paper, brush strip): replaces the CSS shape of every
      // paper tag / title plate in this slot; the shadow follows the art's alpha.
      const plate = resolved[`${name}.plate`];
      if (fill.plate && plate?.level === 'asset') {
        const bg = `background:url('${plate.url}') center/100% 100% no-repeat !important;${fill.ink ? `--plate-ink:${fill.ink};` : ''}`;
        inner = inner
          .replace(/class="(ptagp|chip)" style="/g, (_, cls) => `class="${cls} artplate" data-artplate="1" style="${bg}`)
          .replace(/class="plate( sm)?"/g, (_, sm) => `class="plate${sm || ''} artplate" data-artplate="1" style="${bg}"`)
          .replace(/[“”]/g, (q) => `<span class="qm">${q}</span>`);
      }
      parts.push(`<div class="slot flex" data-slot="${name}"${s.fitGroup ? ` data-fit-group="${s.fitGroup}"` : ''} style="${boxCss(fill.style?.box || s.box)}${align}">${inner}</div>`);
    }
  }

  const overlays = (recipe.overlays || []).map((o) => OVERLAYS[o] || '').join('');
  // a subtitle over a light page (a news page being read) gets a dark band behind it, and so does one over a
  // card drawn on a light ground (no photo under it): white type vanished there once the tube's glow went
  // over the frame (reel 2026-10-20, flow and chat cards)
  // (a screenshot backdrop under a veil is a light page, not a photo)
  const fullPhoto = Object.entries(recipe.slots || {}).some(([k, s]) => s.kind === 'image' && s.frame !== 'screen' && s.box?.[2] >= 0.99 && s.box?.[3] >= 0.99 && (shot.slots?.[k]?.asset || shot.slots?.[k]?.gen || shot.slots?.[k]?.art));
  const onLight = Object.values(shot.slots || {}).some((v) => v && typeof v === 'object' && v.light) || (!fullPhoto && !resolved.__display && !recipe.world && groundLuma(tokens.bg) > 170);
  // no subtitles from the system (house rules: the user adds them in the edit)
  const subtitle = shot.subtitle && _subtitlesOn() ? `<div class="subtitle${onLight ? ' on-light' : ''}">${esc(stillSubtitle(shot.subtitle))}</div>` : '';
  // Source credit for real footage / photos (default on whenever a shot carries one).
  // (a stood-in picture, drawn because no real one was found: arttemplates.mjs standInSlots, says so where a credit would)
  const shown = heroMicro ? '' : screenCredit(shot.credit) || (Object.values(shot.slots || {}).some((v) => v && typeof v === 'object' && v.standIn) ? '示意' : '');
  const credit = shown ? `<div class="credit">${esc(shown)}</div>` : '';
  const todo = degraded.length || shot.factCheck
    ? `<div class="todo"><b>TODO</b>${degraded.map((d) => `<div>${esc(d.slot)} → ${d.level}<i> (need ${esc(d.wanted)})</i></div>`).join('')}${shot.factCheck ? `<div>核实：${esc(shot.factCheck)}</div>` : ''}</div>`
    : '';

  const css = `${fontFaces(fontBase)}
*{box-sizing:border-box;margin:0;padding:0}
.stage{position:relative;width:${W}px;height:${H}px;background:${tokens.bg};${paperLight}${grid}${Object.entries(recipe.vars || {}).map(([k, v]) => `${k}:${v};`).join('')}}
.slot{position:absolute}
.flex{display:flex;flex-direction:column}
.ph{display:flex;align-items:center;justify-content:center;border:3px dashed;font:600 34px ${FAMILIES.sans};opacity:.75;text-align:center;padding:20px}
.logo{display:flex;align-items:center;gap:24px;font:700 120px ${FAMILIES.sans};letter-spacing:-.02em}
.t{line-height:1.05;white-space:pre-wrap}
.chrome-type{display:inline-block;line-height:1.22;padding:.04em .03em;background:linear-gradient(180deg,#ffffff 0%,#e3e5ec 28%,#9a9eae 47%,#2a2a33 51%,#6d7184 60%,#c9ccd8 78%,#ffffff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:2px rgba(20,20,28,.85);filter:drop-shadow(6px 8px 0 rgba(76,62,219,.55)) drop-shadow(0 14px 22px rgba(0,0,0,.45))}
.metal{background:linear-gradient(180deg,#fbf7ec 0%,#cfc6ad 38%,#7e7765 52%,#e6dfcb 70%,#a39b84 100%);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 10px 18px rgba(0,0,0,.7))}
.ink{text-shadow:0 0 1px #000, 3px 4px 0 rgba(0,0,0,.15)}
.plate{position:relative;display:inline-block;padding:8px 36px;margin:6px 0}
.plate::before{content:"";position:absolute;inset:0;background:#0b0b0c;opacity:.82;clip-path:polygon(2% 8%,30% 0,62% 6%,98% 2%,100% 60%,96% 96%,58% 100%,22% 93%,0 100%,3% 50%)}
.plate .t{position:relative}
.plate.sm{padding:4px 28px}
.sub{margin-top:14px;font-family:${FAMILIES.sans};font-weight:500}
.inv{padding:0 10px}
.print{filter:blur(.4px);display:flex;align-items:baseline;gap:24px}
.caps{font-family:"Times New Roman",serif;font-variant:small-caps;letter-spacing:.04em}
.qmark{font:900 220px/0.8 ${FAMILIES.serif};height:120px}
.box{border:2px solid;padding:0 4px}
.box.fill{border:0;padding:2px 8px}
.qlines{display:flex;flex-direction:column;align-items:flex-start;gap:.12em;font-weight:900;line-height:1.05;position:relative}
.ql{white-space:nowrap;text-shadow:0 6px 18px rgba(0,0,0,.45)}
.qmark2{font:900 160px/0.6 Georgia,serif;align-self:flex-end;margin-top:10px}
.ptagp{display:inline-block;background:#f4f3ef;color:#111;padding:10px 28px 12px;font:900 1em ${FAMILIES.display};letter-spacing:.02em;white-space:nowrap;
  clip-path:polygon(0 8%,4% 0,18% 6%,33% 1%,52% 7%,70% 0,86% 6%,100% 2%,98% 30%,100% 58%,97% 100%,80% 94%,62% 100%,44% 93%,27% 99%,10% 93%,0 100%,2% 60%);
  box-shadow:0 10px 24px rgba(0,0,0,.3);transform:rotate(-1.5deg)}
.pq{position:relative;display:inline-flex;flex-direction:column;align-items:flex-start;color:#f3f1ed}
.pq-zh{font:400 1em 'PingFang SC','Hiragino Sans GB',sans-serif;letter-spacing:.02em;white-space:nowrap;text-shadow:0 .04em .08em rgba(0,0,0,.45),0 .12em .4em rgba(0,0,0,.35)}
.pq-en{font:italic 700 .44em Georgia,'Times New Roman',serif;white-space:nowrap;margin-top:.25em;opacity:.92;text-shadow:0 2px 6px rgba(0,0,0,.4)}
.pq-rule{display:block;height:2px;width:100%;margin-top:.22em;background:rgba(255,255,255,.55);transform-origin:0 50%}
.ptag2w{position:relative;display:inline-block}
.ptag2{position:relative;display:inline-block;padding:.1em .3em .13em;font:900 1em ${FAMILIES.display};letter-spacing:-.045em;white-space:nowrap;color:#141414;
  background:repeating-linear-gradient(0deg,rgba(0,0,0,.05) 0 1px,transparent 1px 3px),url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .34 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),repeating-linear-gradient(0deg,rgba(255,255,255,.18) 0 2px,transparent 2px 7px),linear-gradient(180deg,#eceae5,#d6d3cc);
  box-shadow:inset 0 0 .25em rgba(0,0,0,.22);
  clip-path:polygon(0 3%,7% 0,23% 2%,41% 0,63% 3%,82% 0,100% 2%,99.4% 35%,100% 70%,99.2% 100%,78% 97%,55% 100%,31% 97%,12% 100%,0 98%,.6% 62%,0 30%);
  filter:drop-shadow(0 10px 18px rgba(0,0,0,.4))}
.ptag2-t{text-shadow:.035em 0 0 rgba(220,30,70,.32),-.035em 0 0 rgba(0,170,220,.26)}
.ptag2 .hl{color:#c1192c}
.ptag2w .cm{position:absolute;width:.3em;height:.3em;border:0 solid rgba(255,255,255,.8)}
.ptag2w .cm.a{left:-.22em;top:-.26em;border-left-width:2px;border-top-width:2px}
.ptag2w .cm.b{right:-.22em;bottom:-.26em;border-right-width:2px;border-bottom-width:2px}
.artplate{clip-path:none;box-shadow:none !important;filter:drop-shadow(0 8px 14px rgba(0,0,0,.28));color:var(--plate-ink,#151515) !important}
.chip.artplate{padding:10px 30px 12px}
.artplate::before{display:none}
.artplate .qm{color:var(--plate-quote,#d3201b)}
.bar{color:#111;padding:0 4px}
p{margin-bottom:28px;text-align:justify}
table{width:100%;border-collapse:collapse}
th{font-weight:400;padding-bottom:14px}
td{padding:6px 0;line-height:1.2}
.fig{display:flex;align-items:baseline;gap:18px;margin:10px 0;font-family:${FAMILIES.sans};white-space:nowrap}
ul{list-style:square;padding-left:1.2em;line-height:1.5}
.spec{display:flex;flex-direction:column;gap:.32em;white-space:nowrap}
.spec-r{display:flex;align-items:center;gap:.6em}
.spec .k{font-size:.82em;min-width:5.2em;text-shadow:0 2px 8px #000,0 0 2px #000}
.spec .v{padding:.08em .45em;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.pq2{position:relative;display:inline-block}
.pq2-open{position:absolute;left:-.1em;top:-.95em;font:900 2.1em/1 ${FAMILIES.serif};color:#8d8b87;filter:blur(3px);opacity:.8}
.pq2-close{position:absolute;right:-.55em;bottom:-.55em;font:900 1.6em/1 ${FAMILIES.serif};color:#f4f2ee}
ul.btags{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;justify-content:center;gap:.5em;font-weight:700;line-height:1.2}
ul.btags li{background:#fff;color:#141414;padding:.18em .55em;box-shadow:0 6px 18px rgba(0,0,0,.18);transform:rotate(-1.2deg)}
ul.btags li:nth-child(2n){transform:rotate(1deg)}
.chip{display:inline-block;padding:6px 14px;font-weight:600}
.display{line-height:var(--display-leading,1.02);text-shadow:var(--display-shadow,0 2px 0 rgba(255,255,255,.18),0 10px 24px rgba(0,0,0,.18))}
.en{font-family:Georgia,'Times New Roman',serif;font-style:italic;margin-top:10px;letter-spacing:.02em}
.tab{display:inline-block;background:var(--tab-bg,#121212);color:var(--tab-fg,#fff);padding:8px 26px 10px;font:var(--tab-weight,900) 1em var(--tab-font,${FAMILIES.serif});letter-spacing:.04em;clip-path:var(--tab-clip,polygon(1% 12%,8% 0,60% 6%,99% 0,100% 70%,97% 100%,40% 94%,3% 100%,0 55%));border-radius:var(--tab-radius,0);box-shadow:0 8px 20px rgba(0,0,0,.25)}
.ghost{font-family:${FAMILIES.serif};font-weight:900;opacity:.7;padding:40px 60px}
.ov{position:absolute;inset:0;pointer-events:none}
.credit{position:absolute;right:40px;bottom:24px;font:400 20px ${FAMILIES.sans};color:rgba(255,255,255,.62);text-shadow:0 1px 3px rgba(0,0,0,.8)}
.subtitle{position:absolute;left:0;right:0;bottom:64px;text-align:center;font:500 46px ${FAMILIES.sans};color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.9),0 0 2px #000}
.subtitle.on-light{left:50%;right:auto;transform:translateX(-50%);padding:8px 26px;border-radius:6px;background:rgba(18,18,20,.72);white-space:nowrap}
.todo{position:absolute;right:24px;top:24px;max-width:620px;background:rgba(255,120,0,.92);color:#111;font:600 20px/1.35 Menlo,monospace;padding:10px 14px;border-radius:6px;z-index:9}
.todo b{display:block;font-size:24px}
.todo i{font-style:normal;opacity:.7}${COMPONENT_CSS}`;
  (shot.layers || []).forEach((l, i) => { if ((l.z || 'front') === 'front') parts.push(layer(l, i)); });
  // Sheet: the card's content sits on one tilted plane (recipe.sheet.transform) over the plate, with
  // blurred far copies behind it (recipe.sheet.ghosts) for depth, like type printed on paper.
  let content = parts.join('\n');
  if (recipe.sheet) {
    const isPlate = (p) => /data-slot="(background|backdrop|plate)"/.test(p);
    const plate = parts.filter(isPlate).join('\n');
    const body = parts.filter((p) => !isPlate(p)).join('\n');
    const ghosts = (recipe.sheet.ghosts || []).map((g) => `<div class="ghost-sheet" aria-hidden="true" style="position:absolute;inset:0;transform-origin:50% 50%;transform:${recipe.sheet.transform || ''} translate(${g.dx || 0}px,${g.dy || 0}px) scale(${g.scale || 1});filter:blur(${g.blur || 4}px);opacity:${g.opacity ?? 0.3}">${body}</div>`).join('');
    content = `${plate}${ghosts}<div class="sheet" style="position:absolute;inset:0;transform-origin:50% 50%;transform:${recipe.sheet.transform || ''}">${body}</div>`;
  }
  content = content.split('__MECH_DURATION__').join(String(shot.motion?.duration || 6));
  // a world (theme.world, worlds/<id>.json): the frame is rebuilt in the film's visual world from the
  // card's own content and material (world-terminal.mjs); the card stays what the director chose
  let worldCss = '', ownsFocus = false, sub = subtitle;
  if (recipe.world && resolved.__world?.def) {
    const wf = worldFrame({ recipe, shot, parts: content, resolved, world: resolved.__world.def, focus });
    content = wf.content; worldCss = wf.css; ownsFocus = wf.ownsFocus; if (wf.noSubtitle) sub = '';
  }
  // a display plate (display.mjs): at the film's high points the card's material is shown on a
  // photographed display; the plate owns the frame (no reading push on top)
  const display = !!resolved.__display;
  if (display) {
    const df = displayFrame(resolved.__display, fontBase);
    content = df.content; worldCss += df.css; ownsFocus = true;
  }
  // the camera layer (camera.mjs): a theme with camera: true films every packaging frame (vignette, light,
  // grain, depth of field; flat material tilted) except plain presenter frames
  let camCss = '';
  if (recipe.camera && baseFor(recipe.layoutId) !== null && resolved.__world?.intensity !== 'none') {
    const fb = focus?.boxes?.[0];
    const fpt = fb ? [fb[0] + fb[2] / 2, fb[1] + fb[3] / 2] : [0.5, 0.42];
    const flat = isPlane(recipe.layoutId) && resolved.__world?.intensity !== 'full';
    content = cameraFrame(content, { plane: flat, focus: fpt, base: null, tilt: flat ? { x: 6, y: -4, z: 0.3, scale: focus ? 1.0 : 1.06 } : null });
    camCss = cameraCss();
  }
  // a theme's own stylesheet (theme.css, card.css) restyles components after the base styles
  // a read page fades into its own paper along the bottom, so the subtitle sits on clean paper instead of
  // over the page's lines (critique 2026-10-20: "底部字幕压住正文")
  const paper = shot.slots?.screen?.paper;
  // the sentence being read, set large over the dimmed page (the page's own lines are too long to enlarge:
  // critique 2026-10-20 B40 B10 B06 "正文字号太小，无法迅速定位重点"); text from the archived page itself
  // a sentence marked on the page is said once: the pull-quote card is not laid over a page whose words are marked
  // (paperclip-138-full B04: the line swept black and the card repeating it word for word; cardgeometry.mjs sayTwiceErrors)
  // (the shot's own cues, or a scene's: the still is composed from the shot's top level, scene 0's picture, and B04's
  // highlight lives in its scenes — the card came back on the still, in a face no house font maps)
  const marked = [shot, ...(shot.scenes || [])].some((x) => x?.cues?.highlight);
  const pull = recipe.layoutId === 'screen-full' && shot.slots?.screen?.quote && !marked && !display && !recipe.world ? pullQuote(shot.slots.screen.quote, paper, shot.screen?.camera?.push?.end) : '';
  const fade = recipe.layoutId === 'screen-full' && Array.isArray(paper) && !display && !recipe.world
    ? `<div class="page-fade" style="position:absolute;left:0;right:0;bottom:0;height:24%;pointer-events:none;background:linear-gradient(180deg,rgba(${paper.join(',')},0) 0%,rgba(${paper.join(',')},.92) 45%,rgb(${paper.join(',')}) 100%)"></div>` : '';
  return { css: css.replace(COMPONENT_CSS, componentCss(content + overlays + fade + pull + todo)) + (recipe.css ? '\n' + recipe.css : '') + worldCss + camCss, bg: tokens.bg, content, overlays: recipe.world || display ? '' : fade + pull + overlays, subtitle: sub + credit, todo, ownsFocus, display, onLight: onLight && sub === subtitle };
}

const mixHexC = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
// The hero titles of a film take turns among the mechanisms (Gawx Art: each passage its own type event, never the same
// one twice running; the user 2026-10-27: 1分12秒那背景和字体设计感觉很一般 … 我很喜欢Gawx Art; then 黑阴影不行 … 棕色的
// 图片 … 没学到精髓: no band behind words, no photo shrunk onto a brown field): a block across the width, a column down
// the quiet side, then the plain title in the photo's quiet place, and round again. A title naming its own keeps it.
export const HERO_TURNS = ['block', 'column', 'quiet'];
export function heroPlan(shots, recipeOf = (s) => s.recipe) {
  const plan = {}; let k = 0;
  for (const shot of shots) {
    const parts = shot.scenes?.length ? shot.scenes.map((sc, i) => ({ key: `${shot.shotId}:${i}`, recipe: sc.recipe || recipeOf(shot), title: sc.slots?.title })) : [{ key: `${shot.shotId}:0`, recipe: recipeOf(shot), title: shot.slots?.title }];
    for (const p of parts) if (p.recipe === 'title-hero-over-photo' && p.title) plan[p.key] = (typeof p.title === 'object' && p.title.hero) || HERO_TURNS[k++ % HERO_TURNS.length];
  }
  return plan;
}
export const withHero = (scene, mech) => { if (!mech || !scene.slots?.title) return scene; const t = scene.slots.title; return { ...scene, slots: { ...scene.slots, title: { ...(typeof t === 'object' ? t : { text: t }), hero: mech } } }; };
