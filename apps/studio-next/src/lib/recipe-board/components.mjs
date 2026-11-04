// Deterministic content components for recipe cards: charts, chat threads, flow diagrams, an app
// window around a screenshot, and a cursor/lens callout. Everything is drawn from data, so numbers,
// names and on-screen copy are exact; nothing here is generated imagery.
const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

const fmt = (v, unit = '') => `${Number.isInteger(Number(v)) ? Number(v).toLocaleString('en-US') : String(v)}${unit}`;

// ---------------------------------------------------------------- chart
// fill: { chart: 'bar'|'hbar', unit, series: [{ label, value, highlight }], source, max }
export function chartSvg({ w, h, fill, tokens, fonts, size }) {
  const series = fill.series || [];
  if (!series.length) return '';
  const unit = fill.unit || '';
  const abs = series.map((d) => Math.abs(Number(d.value) || 0));
  const max = Number(fill.max) || Math.max(...abs) * 1.12 || 1;
  const sourceH = fill.source ? size * 0.55 + 24 : 0;
  const ink = (d) => (d.highlight ? tokens.accent : Number(d.value) < 0 ? tokens.down || tokens.accent : tokens.bar || tokens.muted);
  const shadow = `<defs><filter id="ds" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity=".22"/></filter></defs>`;
  const label = (d) => `${Number(d.value) > 0 && fill.signed ? '+' : ''}${fmt(d.value, unit)}`;
  let body = '';

  if (fill.chart === 'hbar') {
    const labelW = w * 0.26;
    const rowH = (h - sourceH) / series.length;
    const barH = Math.min(rowH * 0.56, size * 1.2);
    series.forEach((d, i) => {
      const y = i * rowH + (rowH - barH) / 2;
      const len = (abs[i] / max) * (w - labelW - size * 4.2);
      const fsLabel = Math.min(size * 0.62, rowH * 0.4);
      body += `<text x="${labelW - 24}" y="${y + barH / 2}" text-anchor="end" dominant-baseline="central" font-size="${fsLabel}" fill="${tokens.fg}" font-family="${fonts.sans}" font-weight="${d.highlight ? 700 : 500}">${esc(d.label)}</text>`;
      body += `<rect class="cbar h" x="${labelW}" y="${y}" width="${Math.max(4, len)}" height="${barH}" fill="${ink(d)}" opacity="${d.highlight ? 1 : 0.85}"/>`;
      body += `<text x="${labelW + len + 18}" y="${y + barH / 2}" dominant-baseline="central" font-size="${Math.min(size, barH * 1.1)}" fill="${d.highlight ? tokens.accent : tokens.fg}" font-family="${fonts.serif}" font-weight="900" class="cval" data-value="${d.value}" data-unit="${esc(unit)}">${esc(label(d))}</text>`;
    });
  } else {
    const plotH = h - sourceH - size * 2.3; // room for value labels above and categories below
    const top = size * 1.15;
    const slot = w / series.length;
    const barW = Math.min(slot * 0.56, 220);
    series.forEach((d, i) => {
      const bh = (abs[i] / max) * plotH;
      const x = i * slot + (slot - barW) / 2;
      const y = top + plotH - bh;
      body += `<rect class="cbar v" x="${x}" y="${y}" width="${barW}" height="${bh}" rx="6" fill="${ink(d)}" filter="url(#ds)"/>`;
      body += `<text x="${x + barW / 2}" y="${y - 16}" text-anchor="middle" font-size="${size * (d.highlight ? 1 : 0.78)}" fill="${d.highlight ? tokens.accent : tokens.fg}" font-family="${fonts.serif}" font-weight="900" class="cval" data-value="${d.value}" data-unit="${esc(unit)}">${esc(label(d))}</text>`;
      body += `<text x="${x + barW / 2}" y="${top + plotH + size * 0.62}" text-anchor="middle" font-size="${size * 0.46}" fill="${d.highlight ? tokens.accent : tokens.fg}" font-family="${fonts.sans}" font-weight="${d.highlight ? 800 : 600}">${esc(d.label)}</text>`;
      if (d.en) body += `<text x="${x + barW / 2}" y="${top + plotH + size * 0.98}" text-anchor="middle" font-size="${size * 0.24}" fill="${tokens.muted}" font-family="Georgia,serif" font-style="italic">${esc(d.en)}</text>`;
    });
    body += `<line x1="0" x2="${w}" y1="${top + plotH}" y2="${top + plotH}" stroke="${tokens.fg}" stroke-width="2" stroke-dasharray="2 8"/>`;
  }
  if (fill.source) body += `<text x="0" y="${h - 6}" font-size="${size * 0.36}" fill="${tokens.muted}" font-family="${fonts.sans}">来源：${esc(fill.source)}</text>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">${shadow}${body}</svg>`;
}

// ---------------------------------------------------------------- chat
// fill: { platform, messages: [{ who, side, text, avatarImage }], reactions: ['张三', …], reactionTag }
// Device-panel thread: thick light bevel, dark bubbles, keyword in accent colour, ringed photo avatars.
export function chatHtml({ fill, tokens, fonts, size, marks, avatars = {} }) {
  const av = (m) => {
    if (!m.who && !m.avatar) return '';   // nobody named: the bubble stands alone (no "?" avatar)
    if (!m.avatar && !avatars[m.who] && [...String(m.who)].length > 3) return '';   // a group ("几乎所有人"): no empty circle
    const img = avatars[m.who];
    const inner = img ? `<img src="${img.url}" style="object-position:${img.position || 'center'};transform:scale(${img.zoom || 1});transform-origin:${img.position || 'center'}">` : `<span>${esc(m.avatar || ([...String(m.who || '')].length <= 3 ? [...String(m.who || '')][0] || '' : ''))}</span>`;
    return `<div class="av">${inner}</div>`;
  };
  // a short exchange fills the board: larger bubbles, centred top to bottom (not two lines in a corner)
  const few = (fill.messages || []).length <= 3;
  const fs = few ? Math.round(size * 1.8) : size;
  const msgs = (fill.messages || []).map((m) => `<div class="msg ${m.side === 'right' ? 'r' : ''}">${av(m)}
      <div class="bubble" style="font-size:${fs}px">${marks(m.text)}</div></div>`).join('');
  // a tag that only repeats a message's own words says nothing new and crowds the bubbles (clara B23 B37 B42)
  const said = (fill.messages || []).map((m) => String(m.text || '').replace(/\[\[|\]\]/g, '')).join('\n');
  const tag = fill.reactionTag && !said.includes(String(fill.reactionTag).trim()) ? fill.reactionTag : '';
  const reacts = (fill.reactions || []).length || tag
    ? `<div class="reacts">${tag ? `<span class="rtag" style="font-size:${size * 0.8}px">${esc(tag)}</span>` : ''}${(fill.reactions || []).map((r) => `<span class="rdot" style="font-size:${size * 0.72}px">${esc(r)}</span>`).join('')}</div>`
    : '';
  const head = fill.platform ? `<div class="chat-head" style="font-size:${size * 0.92}px;color:${tokens.muted}">${esc(fill.platform)}</div>` : '';
  // a short exchange is one centred group: the date sits right above its messages, not alone at the top
  return few
    // its reaction tag is the group's last row, right-aligned (pinned to a corner it covered the second
    // message's words: clara B42)
    ? `<div class="device" style="font-family:${fonts.sans}"><div class="thread few"><div class="few-group">${head}${msgs}${reacts.replace('class="reacts"', 'class="reacts in-group"')}</div></div></div>`
    : `<div class="device" style="font-family:${fonts.sans}">${head}<div class="thread">${msgs}</div>${reacts}</div>`;
}

// ---------------------------------------------------------------- diagram
// layout 'steps':  1 开始解题…… → 2 … along a dashed rule; the emph step drops a black card (sub).
// layout 'pills':  a question pill, attempt pills with good/bad tags, and an optional verdict phrase.
// nodes: [{ label, en, sub, emph, value, tag: { text, tone: 'good'|'bad' } }]
export function diagramHtml({ w, h, fill: fill0, tokens, fonts, size: baseSize }) {
  let fill = fill0;
  let size = baseSize;
  let nodes = fill.nodes || [];
  if (!nodes.length) return '';
  // layout 'stack': equal cards in a column; each is revealed (filled, label shown) or still a "?"
  // (glass). revealAt (seconds) lets motion turn a "?" into its label on the voice.
  if (fill.layout === 'stack') {
    const gap = Math.round(h * 0.06);
    const ch = (h - gap * (nodes.length - 1)) / nodes.length;
    const fs = Math.min(size, ch * 0.34, (w * 0.82) / Math.max(...nodes.map((d) => [...String(d.label)].length), 1));
    const cards = nodes.map((d, i) => `<div class="scard2" data-i="${i}"${d.revealAt != null ? ` data-reveal-at="${d.revealAt}"` : ''} style="height:${ch}px">
      <div class="onbg" style="opacity:${d.revealed ? 1 : 0}"></div><span class="lab" style="font-size:${fs}px;opacity:${d.revealed ? 1 : 0}">${esc(d.label)}</span><span class="qm" style="font-size:${ch * 0.5}px;opacity:${d.revealed ? 0 : 0.75}">?</span></div>`).join('');
    return `<div class="stack" style="width:${w}px;height:${h}px;gap:${gap}px;font-family:${fonts.sans}">${cards}</div>`;
  }
  if (fill.layout === 'pills') {
    const [q, ...tries] = nodes;
    const tone = (t) => (t === 'good' ? tokens.good || '#33d14a' : tokens.bad || '#e0201b');
    const pill = (d, big) => {
      const val = d.value ? `<b style="color:${d.tag?.tone === 'good' ? tone('good') : tokens.warm || '#f5a524'}">${esc(d.value)}</b>` : '';
      return `<div class="pill${big ? ' big' : ''}" style="font-size:${big ? size * 1.25 : size * 0.86}px">${esc(d.label)}${val}</div>`;
    };
    const tags = (t) => String(t.text).split(/\s+/).filter(Boolean).map((x) => `<span class="ptag" style="background:${tone(t.tone)};font-size:${size * 0.4}px">${esc(x)}</span>`).join('');
    const rows = tries.map((d) => `<div class="prow">${pill(d)}${d.tag ? tags(d.tag) : ''}</div>`).join('');
    const cap = q.sub ? `<div class="pcap"><div style="font-size:${size * 0.62}px;color:${tokens.fg}">${esc(q.sub)}</div>${q.en ? `<div class="en" style="font-size:${size * 0.3}px;color:${tokens.muted}">${esc(q.en)}</div>` : ''}</div>` : '';
    // The verdict takes whatever width the pill column leaves; .verdict is scaleX(.6), so a CJK glyph spans ~0.6em.
    const vChars = [...String(fill.verdict || '')].length || 1;
    const vSize = Math.min(size * 2.9, (w * 0.5) / (vChars * 0.6));
    const verdict = fill.verdict ? `<div class="verdict" style="font-size:${vSize}px;color:${tokens.fg};font-family:${fonts.display || fonts.serif}">${esc(fill.verdict)}</div>` : '';
    return `<div class="pills" style="width:${w}px;height:${h}px;font-family:${fonts.sans}"><div class="pq">${pill(q, true)}${cap}</div><div class="pbody"><div class="ptries">${rows}</div>${verdict}</div></div>`;
  }
  // steps say each thing once (critique 2026-10-20: 去美国发展 three times on clara B29): a step's English
  // line that only repeats its label goes, and so does the black card when its heading repeats the frame's
  // title or a step's label
  {
    const norm = (t) => String(t || '').replace(/\[\[|\]\]|\s/g, '');
    const said = new Set([norm(fill.frameTitle), ...nodes.map((d) => norm(d.label))].filter(Boolean));
    nodes = nodes.map((d) => {
      const n = { ...d };
      if (norm(n.en) && norm(n.en) === norm(n.label)) delete n.en;
      if (n.sub && said.has(norm(String(n.sub).split('\n')[0]))) delete n.sub;
      return n;
    });
    if (fill.bracket?.label && said.has(norm(fill.bracket.label))) fill = { ...fill, bracket: { ...fill.bracket, label: '' } };
  }
  // steps: each step gets width in proportion to its label, so long labels never collide.
  // Natural width of each step (numeral + label + gap); shrink the type if the row would overflow,
  // then spread any spare width evenly so long labels never collide.
  // step labels are set at .95 of the row size (at .8 they read as captions: 步骤文字偏小)
  const natural = (fs) => nodes.map((d) => fs * 1.25 + [...String(d.label)].length * fs * 0.97 + fs * 0.9);
  // a short row grows to fill its box (up to 1.5x; a two-step flow sat small in an empty frame: clara B29),
  // a long one shrinks to fit
  // and the whole diagram (labels, bracket, hanging card) must still fit the box's height
  const hangSub = nodes.find((d) => d.emph && d.sub)?.sub || '';
  const tall = (fs) => fs * 2.6 + (fill.bracket ? fs * 2.7 : 0) + (hangSub ? fs * (1.4 + 1.05 * 1.15 + (String(hangSub).includes('\n') ? 1.29 : 0)) + 60 : fs * 0.4);
  let fit = Math.round(size * 1.5);
  while ((natural(fit).reduce((a, b) => a + b, 0) > w * 0.92 || (fit > size && tall(fit) > h)) && fit > 24) fit -= 2;
  size = fit;
  const nat = natural(size);
  const spare = (w - nat.reduce((a, b) => a + b, 0)) / Math.max(1, nodes.length - 1);
  const weight = nat.map((v, i) => v + (i < nodes.length - 1 ? spare : 0));
  const unit = 1;
  const xs = weight.map((_, i) => weight.slice(0, i).reduce((a, b) => a + b, 0));
  // Optional bracket: drops from two step dots and joins under the rule, with a small label.
  const br = fill.bracket;
  // the emphasised step's black card ends inside the box (above the subtitle band), never off the frame:
  // when it would not fit, the whole row moves up
  // the black card is as tall as its lines (a fixed height let a second line spill out of it)
  const subOf = nodes.find((d) => d.emph && d.sub)?.sub || '';
  const [, ...rest0] = String(subOf).split('\n');
  const cardH = size * (1.05 * 1.15 + (rest0.join('').trim() ? 0.8 * 1.3 + 0.25 : 0)) + 60;
  const hangs = !!subOf;
  const below = br ? size * 2.7 : size * 0.4;
  // without a card the row sits in the middle of its box, not along the top with the bottom left empty
  const lineY = hangs ? Math.max(size * 2.6, Math.min(h * 0.42, h - below - cardH)) : h * 0.6;
  const dotX = (i) => xs[i] + 56 + 6;
  const brX0 = br ? dotX(br.from) : 0;
  const brX1 = br ? dotX(br.to) : 0;
  const brBottom = lineY + size * 1.3;
  const items = nodes.map((d, i) => {
    const color = d.emph ? tokens.accent : tokens.fg;
    const [cardHead, ...cardRest] = String(d.sub || '').split('\n');
    const colW = weight[i] * unit;
    // With a bracket the card hangs centred under the bracket label; otherwise under its own step.
    // wide enough for its heading on one line ("去美国发/展" broke at the last character)
    const cardW = Math.min(w * 0.6, Math.max(colW * 0.8, size * 6, [...cardHead].length * size * 1.05 * 1.02 + 90));
    const cardLeft = br ? (brX0 + brX1) / 2 - cardW / 2 : xs[i];
    const cardTop = br ? brBottom + size * 1.4 : lineY + size * 0.4;
    const card = d.emph && d.sub ? `<div class="scard" style="left:${cardLeft}px;width:${cardW}px;top:${cardTop}px;height:${cardH}px">
        <div class="sch" style="font-size:${size * 1.05}px">${esc(cardHead)}</div><div class="scb" style="font-size:${size * 0.8}px">${esc(cardRest.join(' '))}</div></div>
        <div class="slink" style="left:${xs[i] + 56}px;top:${lineY}px;height:${size * 0.4}px"></div>` : '';
    return `${card}<div class="step" style="left:${xs[i]}px;width:${colW}px;top:${lineY - size * 2.5}px">
      <div class="srow"><span class="snum" style="font-size:${size * 1.9}px;color:${color}">${i + 1}</span><span class="slab" style="font-size:${size * 0.95}px;color:${color}">${esc(d.label)}</span></div>
      ${d.en ? `<div class="en" style="font-size:${size * 0.3}px;color:${tokens.muted}">${esc(d.en)}</div>` : ''}
      <div class="sdot" style="top:${size * 2.5 - 6}px;background:${tokens.accent}"></div></div>`;
  }).join('');
  const bracket = br ? `<div class="bracket">
      <div class="bline" style="left:${brX0}px;top:${lineY + 6}px;height:${brBottom - lineY - 6}px"></div>
      <div class="bline" style="left:${brX1}px;top:${lineY + 6}px;height:${brBottom - lineY - 6}px"></div>
      <div class="bfoot" style="left:${brX0}px;width:${brX1 - brX0}px;top:${brBottom}px"></div>
      <div class="blabel" style="left:${brX0}px;width:${brX1 - brX0}px;top:${brBottom + 14}px;font-size:${size * 0.8}px;color:${tokens.fg}">${esc(br.label || '')}</div></div>` : '';
  return `<div class="steps" style="width:${w}px;height:${h}px;font-family:${fonts.display || fonts.serif}"><div class="srule" style="top:${lineY}px;border-color:${tokens.muted}"></div>${bracket}${items}</div>`;
}

// ---------------------------------------------------------------- app window + callout
export function windowChrome({ title, tokens }) {
  const dots = ['#ff5f57', '#febc2e', '#28c840'].map((c) => `<i style="background:${c}"></i>`).join('');
  return `<div class="chrome" style="background:${tokens.chrome || '#e9e9ec'};color:${tokens.chromeFg || '#555'}"><span class="dots">${dots}</span><span class="wt">${esc(title || '')}</span></div>`;
}

// Lens magnifies the target screenshot around `at` (normalized in the target image); the ring and
// cursor mark the same point inside the window.
export function calloutHtml({ at, targetBox, lens, label, tokens, stage, imageUrl }) {
  const [tx, ty, tw, th] = targetBox;
  const px = (tx + tw * at[0]) * stage.w;
  const py = (ty + th * at[1]) * stage.h;
  const ring = `<div class="ring" style="left:${px - 46}px;top:${py - 46}px;border-color:${tokens.accent}"></div>`;
  const cursor = `<svg class="cursor" style="left:${px - 6}px;top:${py - 4}px" width="44" height="58" viewBox="0 0 22 29"><path d="M1 1 L1 23 L7 17 L11 27 L15 25 L11 16 L19 16 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  let lensHtml = '';
  if (lens && imageUrl) {
    const r = lens.radius || 190;
    const zoom = lens.zoom || 2.2;
    const [lx, ly] = lens.at ? [lens.at[0] * stage.w, lens.at[1] * stage.h] : [px + 260, py - 260];
    const iw = tw * stage.w * zoom;
    const ih = th * stage.h * zoom;
    lensHtml = `<svg class="leader" width="${stage.w}" height="${stage.h}"><line x1="${px}" y1="${py}" x2="${lx}" y2="${ly}" stroke="${tokens.accent}" stroke-width="4"/></svg>
      <div class="lens" style="left:${lx - r}px;top:${ly - r}px;width:${2 * r}px;height:${2 * r}px;border-color:${tokens.accent};background-image:url('${imageUrl}');background-size:${iw}px ${ih}px;background-position:${-(at[0] * iw - r)}px ${-(at[1] * ih - r)}px"></div>`;
    if (label) lensHtml += `<div class="lens-label" style="left:${lx - r}px;top:${ly + r + 18}px;width:${2 * r}px;background:${tokens.accent}">${esc(label)}</div>`;
  } else if (label) {
    lensHtml = `<div class="lens-label" style="left:${px + 40}px;top:${py + 40}px;background:${tokens.accent}">${esc(label)}</div>`;
  }
  return `${lensHtml}${ring}${cursor}`;
}

// Only the rules a page uses: a rule goes in when the first class of its selector is on an element of the
// page. Every page carried every component's rules, so a change to the chat card's style changed every
// shot's page and re-rendered whole films (the motion page hash, run.mjs).
export function componentCss(content) {
  const used = new Set();
  for (const m of String(content).matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) used.add(c);
  return COMPONENT_CSS.split('\n').filter((rule) => {
    const first = /^\s*[a-z]*\.([\w-]+)/i.exec(rule);
    return !first || used.has(first[1]);
  }).join('\n');
}
export const COMPONENT_CSS = `
.device{width:100%;height:100%;background:var(--device-bg,linear-gradient(180deg,#fafaf9,#e9e9e8));border:var(--device-border,12px solid #f5f5f4);border-radius:var(--device-radius,30px);box-shadow:var(--device-shadow,0 0 0 4px #2d2d2e,0 0 0 7px #bdbdbd,inset 0 3px 12px rgba(0,0,0,.18),0 40px 90px rgba(0,0,0,.4));backdrop-filter:var(--device-backdrop,none);padding:34px 70px;display:flex;flex-direction:column;position:relative}
.chat-head{text-align:center;font-weight:500;letter-spacing:.04em;margin-bottom:42px}
.thread{display:flex;flex-direction:column;gap:34px}
.thread.few{flex:1;justify-content:center;align-items:center;padding:0 4% 17%}
.few-group{display:flex;flex-direction:column;gap:56px;min-width:62%}
.few-group .chat-head{text-align:left;margin:0 0 -18px;font-weight:700}
.thread.few .av{flex-basis:190px;height:190px;font-size:56px}
.msg{display:flex;gap:22px;align-items:center}
.msg.r{flex-direction:row-reverse}
.av{flex:0 0 150px;height:150px;border-radius:50%;border:var(--avatar-border,6px solid #fff);box-shadow:0 10px 24px rgba(0,0,0,.35);overflow:hidden;background:#3a3a3a;display:flex;align-items:center;justify-content:center;color:#fff;font:700 44px sans-serif}
.av img{width:100%;height:100%;object-fit:cover}
.bubble{background:var(--bubble-bg,#1b1b1b);color:var(--bubble-fg,#f4f4f4);padding:12px 22px;border-radius:var(--bubble-radius,6px);line-height:1.35;box-shadow:var(--bubble-shadow,26px 30px 0 rgba(0,0,0,.13),0 12px 26px rgba(0,0,0,.32));font-weight:500;letter-spacing:-.01em;text-wrap:balance}
.reacts{position:absolute;right:80px;top:640px;display:flex;align-items:center;gap:0}
.reacts.in-group{position:static;align-self:flex-end;margin-top:-20px}
.rtag{background:var(--react-bg,#2a2a2a);color:var(--react-fg,#eee);padding:8px 16px;margin-right:22px;border-radius:4px;font-weight:700;filter:blur(.3px)}
.rdot{width:2.6em;height:2.6em;border-radius:50%;background:var(--react-bg,#1a1a1a);color:var(--react-fg,#eee);display:flex;align-items:center;justify-content:center;margin-left:-.5em;border:4px solid #e9e9e7;font-weight:700}
.pills{display:flex;flex-direction:column;gap:34px}
.stack{display:flex;flex-direction:column}
.scard2{position:relative;flex-shrink:0;overflow:hidden;border-radius:var(--stack-radius,6px);background:var(--stack-bg,rgba(255,255,255,.07));border:1.5px solid var(--stack-line,rgba(255,255,255,.4));box-shadow:var(--stack-shadow,0 10px 30px rgba(0,0,0,.35));display:flex;align-items:center;justify-content:center}
.scard2 .onbg{position:absolute;inset:0;background:var(--stack-on,linear-gradient(180deg,#d6e8fb,#a9c8ec))}
.scard2 .lab{position:relative;color:var(--stack-on-ink,#1d2a3c);font-weight:700}
.scard2 .qm{position:absolute;color:var(--stack-ink,#fff);font-style:italic;font-weight:300}
.pq{display:flex;align-items:center;gap:40px}
.pill{background:var(--pill-bg,#151515);color:var(--pill-fg,#fff);border:var(--pill-border,0);border-radius:var(--pill-radius,22px);padding:.32em .8em;font-weight:var(--pill-weight,900);font-family:var(--pill-font,'Avenir Next','PingFang SC',sans-serif);letter-spacing:.02em;box-shadow:var(--pill-shadow,0 14px 30px rgba(0,0,0,.28));backdrop-filter:var(--pill-backdrop,none);display:inline-flex;gap:.25em;white-space:nowrap}
.pill.big{border-radius:30px;padding:.28em .9em}
.pbody{display:flex;gap:60px;align-items:center}
.ptries{display:flex;flex-direction:column;gap:22px}
.prow{display:flex;align-items:center;gap:26px}
.ptag{color:#111;font-weight:800;padding:0 16px;letter-spacing:.12em;white-space:nowrap;filter:blur(.4px)}
.prow .ptag+.ptag{margin-left:-10px}
.verdict{font-weight:900;transform:scaleX(.6);transform-origin:left center;line-height:1;white-space:nowrap;text-shadow:0 8px 20px rgba(0,0,0,.18)}
.steps{position:relative}
.srule{position:absolute;left:0;right:0;border-top:3px dashed}
.step{position:absolute;display:flex;flex-direction:column;align-items:flex-start;padding-left:10px}
.srow{display:flex;align-items:baseline;gap:6px;white-space:nowrap}
.snum{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:900;line-height:1}
.slab{font-weight:900}
.sdot{position:absolute;left:46px;width:12px;height:12px;border-radius:50%}
.scard{position:absolute;background:var(--card-bg,linear-gradient(180deg,#2a2827,#121212));color:var(--card-fg,#e9e6e0);padding:30px 40px;border-radius:14px 14px 0 0;box-shadow:0 30px 60px rgba(0,0,0,.4)}
.sch{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;line-height:1.1;white-space:nowrap}
.scb{font-weight:900;margin-top:14px;padding-left:1.4em;font-style:italic}
.slink{position:absolute;border-left:2px solid #8a8a8a}
.bline{position:absolute;border-left:3px solid #5a5a5a}
.bfoot{position:absolute;border-top:3px solid #5a5a5a}
.blabel{position:absolute;text-align:center;font-weight:900}
.bracket ~ .slink{display:none}
.chrome{height:52px;display:flex;align-items:center;gap:18px;padding:0 20px;font:600 22px 'PingFang SC',sans-serif}
.dots{display:flex;gap:10px}.dots i{width:16px;height:16px;border-radius:50%;display:block}
.window{border-radius:16px;overflow:hidden;box-shadow:0 0 0 2px rgba(0,0,0,.06),0 40px 90px rgba(0,0,0,.38);display:flex;flex-direction:column;background:#fff}
.window .media{flex:1;min-height:0;overflow:hidden;position:relative}
.ring{position:absolute;width:92px;height:92px;border:6px solid;border-radius:50%;box-shadow:0 0 0 10px rgba(255,255,255,.25)}
.cursor{position:absolute;filter:drop-shadow(0 3px 4px rgba(0,0,0,.4))}
.leader{position:absolute;left:0;top:0;pointer-events:none}
.lens{position:absolute;border:8px solid;border-radius:50%;background-repeat:no-repeat;box-shadow:0 24px 60px rgba(0,0,0,.45);background-color:#fff}
.lens-label{position:absolute;color:#fff;font:700 30px 'PingFang SC',sans-serif;padding:10px 16px;text-align:center;border-radius:6px}
`;
